// main.js — renderer + post chain + game loop + module wiring + the deterministic shot runner.
// API: boot() builds everything and either runs the playable loop or, with #shot=1, steps a fixed
//   number of ticks for the scene named by #scene=<id> and then sets window.__ready = true.
//   window.__game exposes every module ({sky, world, car, physics, camRig, boost, crash, hud, ...}).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';


import { makeRng, clamp, lerp } from './util.js';
import { createSsaoPass, createBloomPass, createOutputPass } from './post.js';
import { createSky } from './sky.js';
import { createRoadKit } from './road.js';
import { createWorld } from './world.js';
import { createCar } from './car.js';
import { createPhysics } from './physics.js';
import { createCamRig } from './camera.js';
import { createBoost } from './boost.js';
import { createDamage } from './damage.js';
import { createCrash } from './crash.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createTraffic } from './traffic.js';
import { createMenu } from './menu.js';
import { createMusic } from './music.js';
import { getScene } from './scenes.js';

const FIXED_DT = 1 / 60;

function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  const out = {};
  for (const part of h.split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    out[decodeURIComponent(k)] = v === undefined ? true : decodeURIComponent(v);
  }
  return out;
}

// The soundtrack is a MODULE-LEVEL singleton, deliberately outside boot(). The user's
// requirement is that music persists across a scene change rather than restarting, and a
// scene change re-runs boot(); anything constructed inside it would be torn down and the
// track would start over from zero. Constructed lazily so `tools/shot.mjs` (which boots
// this module) pays nothing for it.
let _music = null;
function getMusic() {
  if (!_music) _music = createMusic();
  return _music;
}

export async function boot() {
  const params = parseHash();
  const shotMode = params.shot === '1' || params.shot === true;
  const sceneId = params.scene || 'dusk-highway-chase';

  // ---- display-chain switch --------------------------------------------
  // Two INDEPENDENT choices, both selectable at runtime from the URL hash so an A/B
  // never needs a code edit between shots:
  //   #tone=aces   three's ACESFilmicToneMapping, graded output pass                (default)
  //   #tone=agx    AgX in the same graded output pass
  //   #bloom=unreal  UnrealBloomPass, 5-mip gaussian                        (default)
  //   #bloom=dual    post.js DualFilterBloomPass, 7-mip Kawase + veil term
  // Defaults are the ACES + Unreal pair because that is what every material, paint,
  // road and sky value in this project was tuned against.
  const toneMode = params.tone === 'agx' ? 'agx' : 'aces';
  const bloomMode = params.bloom === 'dual' ? 'dual' : 'unreal';

  // ---- renderer -------------------------------------------------------
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance',
    alpha: false, stencil: false, depth: true,
  });
  // ---- RENDER RESOLUTION IS CAPPED (720p or 1080p). CSS PIXELS ARE DISPLAY ONLY.
  // The drawing buffer fits inside the chosen cap while preserving the window aspect. A
  // larger window still renders at the cap and the canvas CSS `width/height:100%` upscales
  // it. A smaller window drops below the cap 1:1 with the CSS size. `devicePixelRatio` is
  // never applied. `#res=<n>` (or the pause menu) multiplies further below 1; never above 1.
  // Menu (and `#cap=720|1080`) picks the cap; default is 720p for frame budget.
  const INTERNAL_CAPS = {
    720:  { w: 1280, h: 720 },
    1080: { w: 1920, h: 1080 },
  };
  let internalCap = (params.cap === '1080' || params.cap === '1080p') ? 1080 : 720;
  function maxInternal() {
    return INTERNAL_CAPS[internalCap] || INTERNAL_CAPS[720];
  }
  /** Internal draw size for a CSS viewport. Always aspect-matched; never above the cap. */
  function internalSize(cssW, cssH) {
    const { w: maxW, h: maxH } = maxInternal();
    const fit = Math.min(1, maxW / Math.max(1, cssW), maxH / Math.max(1, cssH));
    return {
      w: Math.max(2, Math.floor(cssW * fit)),
      h: Math.max(2, Math.floor(cssH * fit)),
      fit,
    };
  }
  let resScale = clamp(parseFloat(params.res) || 1, 0.4, 1);
  {
    const ini = internalSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(shotMode ? 1 : resScale);
    renderer.setSize(ini.w, ini.h, false);
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Scene materials are never tone mapped here: three only applies renderer.toneMapping
  // when the current render target is the canvas (WebGLPrograms: `if (currentRenderTarget
  // === null)`), and RenderPass always draws into the composer's HalfFloat target. So this
  // field is now read by nothing at all: the graded output pass owns the transform for
  // BOTH tonemappers, so leaving ACES set here would be misleading rather than harmless.
  // `toneMappingExposure` is still live — sky.apply() writes the preset exposure onto it
  // and the output pass reads it back as uExposure.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.35, 6000);
  camera.position.set(0, 3, -10);
  scene.add(camera);

  // ---- boot progress ---------------------------------------------------
  // Every builder below is SYNCHRONOUS and some take seconds, so the overlay can
  // only repaint if we hand the browser a frame between stages. One rAF merely
  // queues the paint; the second resolves after it has actually happened, which is
  // what stops the bar jumping from 0 to 100 at the very end.
  //
  // STAGE_MS is a measured cost per stage, used only to weight the bar so it moves
  // at a roughly even rate rather than sitting still through the expensive parts.
  // Re-measure with `?bootlog=1` (times land in the console) if the builders change
  // materially; being a little stale only makes the bar uneven, never wrong.
  // Measured 2026-08-03 via `?bootlog=1` in headless chromium at 1280x720. A discrete
  // GPU shifts the shader-bound stages (post, warm) up somewhat; the ordering, which is
  // all the weighting depends on, holds.
  const STAGE_MS = {
    sky: 337, road: 654, world: 154, car: 231, sim: 124, post: 93, warm: 78,
  };
  const bootLog = params.bootlog === '1' || params.bootlog === true;
  const bootBarEl = document.getElementById('bootbar');
  const bootLabelEl = document.getElementById('bootlabel');
  const stageTotal = Object.values(STAGE_MS).reduce((a, b) => a + b, 0);
  let stageDone = 0;
  let stageT0 = 0;
  let stageName = '';

  /**
   * Announce the stage that is ABOUT to run, then yield so the bar paints.
   * In shot mode this is a no-op: the screenshot harness wants no extra frames.
   * @param {string} key   key into STAGE_MS
   * @param {string} label human-facing text
   */
  async function stage(key, label) {
    if (shotMode) return;
    if (stageName && bootLog) console.log(`boot ${stageName} ${Math.round(performance.now() - stageT0)}ms`);
    if (stageName) stageDone += STAGE_MS[stageName] || 0;
    stageName = key;
    stageT0 = performance.now();
    if (bootLabelEl) bootLabelEl.textContent = label;
    if (bootBarEl) bootBarEl.style.width = `${(100 * stageDone / stageTotal).toFixed(1)}%`;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // ---- modules --------------------------------------------------------
  await stage('sky', 'sky and atmosphere');
  const sky = createSky(scene, renderer);
  await stage('road', 'paving roads');
  const roadKit = createRoadKit(makeRng(0xA5FA17), { renderer });
  // The road's planar reflection is a full mirrored re-render of the scene, and it used to fire
  // once per outer render pass that drew a road with a perspective camera — four times a frame on
  // a wet night (SSAO's normal/depth prepass, boost's hero mask, and each of car.js's cube-probe
  // faces on top of the frame the player sees), 22.5 ms of which 18.3 ms went into a buffer that
  // nothing sampled. Telling it which camera the frame belongs to is what makes it once.
  // Measured in verdicts/wave-s/perf-r2.md section 3.
  roadKit.setMainCamera(camera);
  await stage('world', 'building the city');
  const world = createWorld(scene, { rng: makeRng(0xC17E), roadKit });

  await stage('car', 'assembling the car');
  const car = createCar(makeRng(0xCA5), { paint: 0xd8420f });
  const carRoot = new THREE.Group();
  carRoot.add(car.group);
  scene.add(carRoot);

  await stage('sim', 'physics and effects');
  const physics = createPhysics({ blocks: world.blocks });
  const camRig = createCamRig(camera);
  const boostFx = createBoost(car);
  scene.add(boostFx.group);
  const damage = createDamage(car);
  const crash = createCrash(scene, car, physics, damage);
  // maxPixelRatio caps the HUD's own 2-D backing store. Default 1 = one HUD pixel per CSS pixel,
  // which is what the 3-D buffer is too; `#hudres=2` restores the Retina-supersampled HUD and
  // costs 4.0 ms/frame in the city. The measurement and the kill-control are in hud.js's resize().
  const hudRes = Math.max(1, Math.min(3, parseFloat(params.hudres) || 1));
  // `#hudgl=1` composites the HUD inside the WebGL frame instead of letting the browser composite
  // it as a second DOM layer. IT IS OFF BY DEFAULT BECAUSE IT IS SLOWER: measured 0.70 ms slower
  // on cruise and 1.40 ms slower in the city. The full measurement, and the refutation of the
  // reason it was built, are at "THE HUD LAYER" below, next to the code.
  const hudGl = params.hudgl === '1' || params.hudgl === true;
  const hud = createHud(document.getElementById('hud'), {
    layout: world.LAYOUT, maxPixelRatio: hudRes, attached: !hudGl,
  });
  const audio = createAudio({ enabled: !shotMode });
  const music = shotMode ? createMusic() : getMusic();
  const traffic = createTraffic(scene, {
    rng: makeRng(0x7AFF1C), layout: world.LAYOUT, blocks: world.blocks, roadKit,
  });
  // THE BOOST JOIN, and it is the whole boost economy. Paradise has no passive refill: every
  // point of boost is a near miss, oncoming, a traffic check, air or a takedown. physics.js
  // deleted its passive earn terms and traffic.js emits intensity-tagged events; this is the
  // one line that connects them. Until it existed, drift was the only earn path in the
  // shipped game. traffic drains on read, so nothing else may call drainEvents().
  physics.setEventSource(() => traffic.drainEvents());

  // THE COLLISION JOIN. physics.js collides the hero with the live traffic bodies (the same
  // two-tier scrape/hit/wreck contact as a building, resolved in relative velocity), and
  // traffic.js keeps owning the NPC side of the same contact — the knock-forward and shove.
  // A wreck-grade hit surfaces through the existing drainWreck() path below.
  physics.setTrafficBodies(() => traffic.vehicles);
  // Cosmetic side of the same join: sparks + grit at the contact point of a survivable
  // traffic hit. Wreck-grade contacts get the full cinematic through drainWreck() instead,
  // and crash.impactBurst() shares the crash pools so the two can never double-spend.
  physics.setTrafficHitListener(({ x, z, dirX, dirZ, sev }) => {
    if (sev > 0.04) crash.impactBurst(x, z, dirX, dirZ, sev);
  });

  // THE PASS-AUDIO JOIN. Intensity is mostly CLEARANCE - what makes a pass thrilling is how
  // close it was, and a car three lanes over at the same speed should barely register - with
  // relative speed as the smaller term so a fast pass still reads as more violent than a
  // crawl. Deliberately not routed through drainEvents(): that queue is the boost economy's,
  // drain-on-read, single-owner (see the line above), and a second reader would spend it.
  // The kerb ranks are world.js's population, so traffic.js has to be handed them explicitly
  // or a run down a parked street is silent. Audio only - they earn no boost.
  traffic.setStaticBodies(world.parkedCars);
  traffic.setPassListener(({ side, relSpeed, clearance }) => {
    const close = Math.max(0, Math.min(1, 1 - clearance / 3.4));
    const fast = Math.max(0, Math.min(1, (relSpeed - 8) / 40));
    audio.pass(0.35 + 0.65 * (0.7 * close + 0.3 * fast), { side, relSpeed });
  });
  traffic.setHornListener(({ side, urgency, dist }) => audio.horn({ side, urgency, dist }));

  // ---- post chain ------------------------------------------------------
  await stage('post', 'post-processing');
  const dpr = renderer.getPixelRatio();
  const bootInternal = internalSize(window.innerWidth, window.innerHeight);
  const rtW = Math.max(2, Math.floor(bootInternal.w * dpr));
  const rtH = Math.max(2, Math.floor(bootInternal.h * dpr));
  // ---- ANTI-ALIASING: MSAA SAMPLE COUNT, AND WHY IT IS A HASH PARAMETER NOW ------------
  // 4x MSAA on a 1280x720 HalfFloat target is the single most expensive line in this file:
  // measured 7.34 ms of a 25.5 ms frame, i.e. 29% of the whole frame for edge quality alone
  // (2x costs 4.14 ms of it). Half-float MSAA is bandwidth, not shading — the tiler resolves
  // four 64-bit samples per pixel — so it does not get cheaper as the scene gets cheaper, and it
  // was the one item that made 60 fps at resScale 1.0 arithmetically impossible.
  //
  // So the default is now 0 samples plus an FXAA pass at the end of the chain (see below), and
  // `#msaa=<n>` restores hardware MSAA for anyone who wants to A/B it or who has the headroom.
  // FXAA is not free either (0.35 ms) and it is not as good as 4x MSAA on a near-vertical mullion
  // edge; what it IS is 7 ms cheaper, and 60 fps is this wave's bar. The regression gate for the
  // swap is in verdicts/wave-s/perf.md section 4, with both PNGs.
  const msaaSamples = Math.max(0, Math.min(8, Math.round(parseFloat(params.msaa) || 0)));
  const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
    type: THREE.HalfFloatType, samples: msaaSamples,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.setSize(bootInternal.w, bootInternal.h);
  composer.addPass(new RenderPass(scene, camera));
  // SSAO before bloom: occlusion is part of the scene's radiance, so the glare pyramid
  // must see the darkened seams rather than blooming over them.
  const ssao = createSsaoPass(scene, camera, rtW, rtH, {
    // world.aoExclude is the additive glow geometry (wet smears, night light spill): it has no
    // surface for AO to occlude and it writes depth under the prepass's override material, which
    // put a flat plane in front of the road on every wet frame. See the note in world.js.
    exclude: [sky.skyMesh, boostFx.group, ...(world.aoExclude || [])],
  });
  composer.addPass(ssao);
  const bloom = bloomMode === 'dual'
    ? createBloomPass(rtW, rtH)
    : new UnrealBloomPass(new THREE.Vector2(rtW, rtH), 0.45, 0.65, 0.85);
  composer.addPass(bloom);
  composer.addPass(boostFx.pass);
  // One pass for both tonemappers. The per-preset grade (lift/contrast/sat/dither)
  // lives in this pass and therefore applies on the default ACES path too; it used
  // to be reachable only via #tone=agx, which left every preset's grade inert.
  const outputPass = createOutputPass(toneMode);
  composer.addPass(outputPass);
  // FXAA runs LAST, on the graded sRGB image, which is where a luma-based edge filter belongs:
  // run before the tonemap it would be estimating luma from HDR values that the curve is about to
  // redistribute, and it would smooth edges the display never sees while missing the ones it does.
  // Skipped entirely when hardware MSAA is on, because stacking the two only costs sharpness.
  const fxaa = msaaSamples > 0 ? null : new ShaderPass(FXAAShader);
  if (fxaa) {
    composer.addPass(fxaa);
    fxaa.material.uniforms.resolution.value.set(1 / rtW, 1 / rtH);
  }

  // ==========================================================================
  // THE HUD LAYER — BUILT TO SAVE 2.40 ms, MEASURED AT 0.70 ms SLOWER, SHIPPED OFF BY DEFAULT
  // ==========================================================================
  //
  // WHAT THIS WAS FOR. perf-critic-r3 section 8 and perf-r3 routed item 1 both concluded that the
  // HUD's 2.20-2.50 ms was "the browser compositing a full-screen 2-D canvas layer over the WebGL
  // canvas every single frame", of which only ~0.40 ms was the redraw, and named drawing the HUD
  // inside the WebGL frame as the single next action and the last win big enough to close a
  // scenario. This is that change, and it is off by default because the premise is wrong.
  //
  // THE REFUTATION, by kill-control, 3 runs per cell, 1280x720, pixelRatio 1, dpr 1, resScale 1,
  // gl.drawingBufferWidth/Height read off the driver at the end of every window
  // (verdicts/wave-s/perf-r4.md section 2), as p50 / delivered fps / % of frames over 16.7 ms:
  //
  //                                            cruise                     city
  //   DOM layer, HUD live (the default)   15.90 / 58.2 / 22.4%     20.40 / 47.0 / 93.9%
  //   IN-FRAME, HUD live (#hudgl=1)       16.70 / 50.1 / 49.9%     21.80 / 44.3 / 80.1%
  //   DOM layer present but NOT REDRAWN   13.40 / 75.4 /  2.7%     18.20 / 50.5 / 70.6%
  //   in-frame, not redrawn (no upload)   13.50 / 74.8 /  2.8%       —
  //   no HUD at all                       13.40 / 75.4 /  2.6%     18.30 / 49.9 / 74.3%
  //
  // Read the last two rows together: **a full-screen 2-D canvas that is IN the document but does
  // not change costs 0.00 ms** — 13.40 against 13.40 with no HUD at all, and 18.20 against 18.30
  // in the city. There was never a standing per-frame layer cost to remove. The whole 2.20-2.50 ms
  // is the REDRAW, i.e. what it costs to change 921,600 canvas pixels and get them onto the
  // screen, and both routes have to pay it. Compositing in-frame pays it as an explicit
  // texImage2D of the whole canvas, and that is 0.70 ms (cruise) to 1.40 ms (city) MORE than what
  // the compositor does with the same changed layer.
  //
  // Only 0.95 ms of that 2.20 is main-thread CPU inside draw() (`tools/_hudprof.mjs`, per widget:
  // boost 0.38, street plate 0.25, speedo 0.15, minimap 0.12); the remaining ~1.3 ms is canvas
  // rasterisation and transport, off the CPU bracket. That is also why perf-r3's 30 Hz experiment
  // saved only 0.40 ms of 2.10 and looked non-linear — halving the redraw RATE does not halve a
  // cost that is partly a per-frame dependency on the canvas's raster completing.
  //
  // WHY IT IS KEPT AT ALL, rather than reverted. It is measured, gated and lossless (the
  // `hud-overlay` preset is byte-identical through it), so the next round can re-derive the
  // number in one boot instead of rebuilding the mechanism, and it is the path to take if the
  // HUD's redraw is ever made cheap enough that the upload dominates, or on a platform whose
  // compositor is worse than Metal's. The default is UNCHANGED: with `hudgl` false the HUD canvas
  // is appended to `#hud` exactly as before, `drawHudLayer()` returns on its first line, and
  // `renderFrame()` is `composer.render()` and nothing else.
  //
  // WHY THIS IS DRAWN AFTER `composer.render()` AND NOT AS ANOTHER COMPOSER PASS. A pass appended
  // to the chain would take `renderToScreen` off FXAA, so FXAA would render into a target and the
  // HUD pass would have to blit that whole target to the screen — a full-screen texture read and
  // write bought for nothing. Rendering the quad straight onto the default framebuffer with
  // `autoClear` off blends over the image that is already there, which is exactly what the
  // browser's compositor was doing, at one quad instead of one layer.
  //
  // WHY THIS POSITION IS THE ONLY CORRECT ONE FOR COLOUR. The output pass owns the tonemap and
  // the sRGB transform (see the renderer note at the top of this file) and the composer works in
  // HalfFloat linear. The HUD is authored in sRGB, in a 2-D canvas, and MUST NOT be tone mapped.
  // After the output pass and after FXAA there is nothing left to apply, and the material below
  // is a raw ShaderMaterial that writes the sampled texel unchanged — no colour-space chunk, no
  // tonemapping chunk, `colorSpace = NoColorSpace` so there is no hardware sRGB decode on the
  // sampler either. Nearest filtering on a texture whose size equals the drawing buffer's makes
  // the sample land on exactly one texel, so the byte that reaches the framebuffer is the byte
  // the 2-D canvas wrote. NormalBlending with a non-premultiplied source is
  // `src.rgb * a + dst.rgb * (1 - a)` — the same arithmetic, in the same sRGB byte space, that
  // the DOM compositor was doing. That is why this is lossless rather than merely close, and
  // the `hud-overlay` preset is the gate that proves it.
  //
  // THE FALLBACK RULE, AND IT PROTECTS A RECORDED DECISION. Compositing in-frame means the HUD is
  // rasterised into the drawing buffer, so it inherits the buffer's resolution. main.js's
  // recorded decision (see resize() below) is that dropping `resScale` / the 720p cap must NOT
  // soften the HUD. So the in-frame path is used only while the HUD's backing store and the
  // drawing buffer are the SAME size; the moment they differ — window above 720p, `resScale`
  // below 1, or `#hudres=2` asking for a supersampled overlay — `syncHudPath()` puts the canvas
  // back in the document and the old behaviour returns exactly. That check is a size comparison
  // rather than a guess about which knobs exist, so a future knob that changes either size is
  // handled without being enumerated.
  const hudTex = new THREE.Texture(hud.canvas);
  hudTex.minFilter = THREE.NearestFilter;
  hudTex.magFilter = THREE.NearestFilter;
  hudTex.generateMipmaps = false;
  hudTex.colorSpace = THREE.NoColorSpace;
  const hudScene = new THREE.Scene();
  const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hudQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tHud: { value: hudTex } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tHud;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tHud, vUv); }`,
      transparent: true, depthTest: false, depthWrite: false,
    }));
  hudQuad.frustumCulled = false;
  hudScene.add(hudQuad);

  const hudBuf = new THREE.Vector2();
  let hudInFrame = false;
  let hudGen = -1;
  let hudTexW = 0, hudTexH = 0;

  /**
   * Decide, per frame, whether the HUD may be composited in-frame, and move the canvas in or out
   * of the document when the answer changes. Cheap enough to run every frame (two integer
   * comparisons; the DOM touch only happens on a change) and running it every frame is what makes
   * the res slider, `#hudres`, a window resize and a scene change all self-heal without any of
   * them having to know this code exists.
   */
  function syncHudPath() {
    renderer.getDrawingBufferSize(hudBuf);
    const fits = hudGl && hud.canvas.width === hudBuf.x && hud.canvas.height === hudBuf.y;
    if (fits !== hudInFrame) {
      hudInFrame = fits;
      hud.setAttached(!fits);
      hudGen = -1;           // force one upload on the way back in
    }
    return hudInFrame;
  }

  /** Composite the HUD over the frame that is already in the default framebuffer. */
  function drawHudLayer() {
    if (!syncHudPath() || !hud.visible) return;
    // A CANVAS THAT CHANGED SIZE NEEDS A NEW GL TEXTURE, NOT A NEW UPLOAD, AND THIS IS A REAL BUG
    // I SHIPPED FOR AN HOUR. `needsUpdate` re-uploads into the allocation three already made, so
    // after a window resize a 1024x600 canvas was written into the top-left of a 1280x720 texture
    // and the quad — which samples uv 0..1 — drew the fresh HUD at 80% scale in the corner with
    // the PREVIOUS frame's HUD still showing in the margins. Two HUDs on screen at once, with two
    // different street names on the two street plates, which is what gave it away.
    // `dispose()` makes three delete and reallocate at the new size. It cannot be folded into the
    // generation check: a resize bumps the generation too, and re-uploading is not the fix.
    // Found by tools/_hudbehav.mjs, which screenshots the real page after a real resize; no still
    // preset and no frame-time number could have seen it.
    if (hud.canvas.width !== hudTexW || hud.canvas.height !== hudTexH) {
      hudTex.dispose();
      hudTexW = hud.canvas.width;
      hudTexH = hud.canvas.height;
      hudGen = -1;
    }
    // UPLOAD ONLY WHAT CHANGED. hud.generation moves on every draw() and on every resize() (which
    // clears the canvas); while nothing redraws it — the paused path never calls tick() — this
    // costs one integer comparison and no upload at all.
    const g = hud.generation;
    if (g !== hudGen) { hudGen = g; hudTex.needsUpdate = true; }
    renderer.setRenderTarget(null);
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(hudScene, hudCam);
    renderer.autoClear = prevAutoClear;
  }

  /**
   * THE frame. Every caller — the drive loop, the paused loop, the warm-up frames and the
   * deterministic screenshot path — must go through this, because on the in-frame path the HUD is
   * not in the composer chain and a bare `composer.render()` would drop it.
   */
  function renderFrame() {
    composer.render();
    drawHudLayer();
  }

  function resize() {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const { w, h } = internalSize(cssW, cssH);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(shotMode ? 1 : resScale);
    // updateStyle=false: keep CSS 100%/100% so the browser upscales the 720p buffer.
    renderer.setSize(w, h, false);
    // EffectComposer keeps its own copy of the pixel ratio (it was read off the
    // renderer in the constructor) and multiplies setSize() by it, so changing the
    // renderer's ratio alone leaves every post target at the old resolution.
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    ssao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    bloom.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    // FXAA's kernel is stepped in texels, so it needs the DRAWING BUFFER size, not the CSS size:
    // at resScale 0.75 a CSS-sized reciprocal would step 1.33 texels per tap and blur the frame.
    if (fxaa) {
      const bs = renderer.getDrawingBufferSize(new THREE.Vector2());
      fxaa.material.uniforms.resolution.value.set(1 / bs.x, 1 / bs.y);
    }
    // HUD stays at full CSS window size so resScale / the 720p cap never soften it.
    // When that differs from the drawing buffer, syncHudPath() falls back to DOM compositing.
    hud.resize(cssW, cssH);
  }
  window.addEventListener('resize', resize);

  /** Change the render resolution scale at runtime. 1.0 = full internal res (at the cap). */
  function setResScale(s) {
    resScale = clamp(s, 0.4, 1);
    resize();
    return resScale;
  }

  /** Cap the internal drawing buffer at 720p or 1080p. Larger windows CSS-upscale. */
  function setInternalCap(p) {
    const next = (p === 1080 || p === '1080' || p === '1080p') ? 1080 : 720;
    if (next === internalCap) return internalCap;
    internalCap = next;
    resize();
    return internalCap;
  }

  // ---- shared per-frame update ------------------------------------------
  const cfg = getScene(sceneId);
  const ctx = {
    THREE, renderer, scene, camera, sky, roadKit, world, car, carRoot,
    physics, camRig, boost: boostFx, damage, crash, hud, audio, music, traffic, bloom, composer, ssao,
    outputPass, toneMode, bloomMode,
    setResScale,
    getResScale: () => resScale,
    setInternalCap,
    getInternalCap: () => internalCap,
    /** The buffer the frame is actually rasterised into. Quote this beside every fps figure. */
    renderSize() {
      const v = renderer.getDrawingBufferSize(new THREE.Vector2());
      const cap = internalSize(window.innerWidth, window.innerHeight);
      const mx = maxInternal();
      return { w: v.x, h: v.y, cssW: window.innerWidth, cssH: window.innerHeight,
        internalW: cap.w, internalH: cap.h, maxInternal: [mx.w, mx.h], cap: internalCap,
        pixelRatio: renderer.getPixelRatio(), devicePixelRatio: window.devicePixelRatio || 1 };
    },
    /**
     * Which route the HUD is taking to the screen, for a harness or a critic that needs to
     * assert it rather than infer it. `inFrame` true = one compositing layer, HUD drawn by
     * drawHudLayer(); `attached` true = the HUD canvas is a DOM layer (the `#hudgl=0` path and
     * the automatic fallback when the two sizes below differ).
     */
    hudPath: () => ({
      hudgl: hudGl, inFrame: hudInFrame, attached: hud.attached,
      hudCanvas: [hud.canvas.width, hud.canvas.height],
      drawingBuffer: [hudBuf.x, hudBuf.y],
      inDocument: !!(hud.canvas.parentNode),
    }),
  };

  // ---- time of day / weather, as a single reversible operation --------------
  // Both knobs already existed but each one needed three or four collaborators poked in
  // the right order, which is why nothing but the boot path had ever changed them. The
  // order matters: sky.apply() rewrites the exposure and the grade, world.setNight()
  // switches the emissive window sets and the street-lamp pool, applyBloom() pushes the
  // preset's bloom, and applyKeyFill() reads the *post-apply* sun elevation.
  let curTod = cfg.timeOfDay || 'dusk';
  let curWet = cfg.wet || 0;
  function applyTimeOfDay(tod) {
    curTod = tod;
    sky.apply(tod);
    const night = tod === 'night';
    world.setNight(night);
    traffic.setNight(night);
    car.setLights(night || tod === 'dusk');
    sky.applyBloom(bloom);
    world.applyKeyFill(sky);
    audio.setSpace(cfg.audioSpace || 'city');
    // The sun's depth map is sized per time of day (see applyShadowRes, in the shadow-cascade
    // block): 4096 by day, 1024 at night, where the sun is intensity 0.45 below the horizon and
    // the map was worth 6.00 ms of a 33.30 ms frame. Assigned there, called here, because the
    // menu changes the time of day at runtime and the boot path is not the only caller any more.
    if (ctx.applyShadowRes) ctx.applyShadowRes(tod);
  }
  function applyWet(w) {
    curWet = clamp(w, 0, 1);
    world.setWet(curWet);
  }
  ctx.applyTimeOfDay = applyTimeOfDay;
  ctx.applyWet = applyWet;
  ctx.getTimeOfDay = () => curTod;
  ctx.getWet = () => curWet;

  function gearOf(speed) {
    const kmh = Math.abs(speed) * 3.6;
    return clamp(1 + Math.floor(kmh / 52), 1, 6);
  }
  function rpmOf(speed) {
    const kmh = Math.abs(speed) * 3.6;
    const g = gearOf(speed);
    return clamp(((kmh - (g - 1) * 52) / 52) * 0.78 + 0.18, 0, 1);
  }

  const _camFwd = new THREE.Vector3();
  const _camVel = new THREE.Vector3();

  // ---- key-light direction re-assert (see the note in sky.js update()) -------
  // sky.js authors two sun vectors per preset and the distinction matters: the
  // *atmosphere* sun (sunElevation/sunAzimuth) is where the disc and the scattering
  // live, and the *key* sun (lightElevation/lightAzimuth) is where the directional
  // light and therefore every cast shadow comes from. midday authors them 26 deg
  // apart on purpose: disc at 42, key at 68.
  //
  // sky.apply() gets this right, but sky.update() — which repositions the light onto
  // the car every tick so the shadow frustum follows it — rebuilds the position from
  // `uniforms.uSunDir`, i.e. the *atmosphere* vector. Its own `sunLightDir`, copied
  // from the key vector in apply(), is never read by anything. So one tick after
  // setup the key silently drops from 68 deg to 42 deg for the rest of the run.
  //
  // At 68 deg a 40 m block reaches 16 m across the street and the road is sunlit with
  // hard short shadows on it. At 42 deg it reaches 44 m — wider than the carriageway —
  // so the entire street floor sits inside one block's shadow. Everything downstream
  // is then working perfectly and shading a fully-occluded road: measured with
  // tools/shadow-ab.mjs, the road's mean level was 41/255 with the shadow map on
  // versus 72/255 with it off, i.e. the shadow map was darkening ~100% of the road
  // and there was no lit ground left for a shadow to be visible against.
  //
  // The real fix is one line in sky.js update(): build the position from sunLightDir
  // rather than uniforms.uSunDir. sky.js belongs to another module owner, so until it
  // lands, re-assert the authored key direction here, right after sky.update() runs.
  const _keyDir = new THREE.Vector3();
  function reassertKeyDir(focus) {
    const p = sky.preset;
    if (!p) return;
    const el = p.lightElevation !== undefined ? p.lightElevation : p.sunElevation;
    const az = p.lightAzimuth !== undefined ? p.lightAzimuth : p.sunAzimuth;
    const sun = sky.sun;
    // sky.update() has already put the target under the car and the light one
    // shadow-cascade radius away along its (wrong) vector; keep that distance.
    const dist = sun.position.distanceTo(sun.target.position) || 240;
    _keyDir.setFromSphericalCoords(1,
      THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
    sun.position.set(focus.x + _keyDir.x * dist, _keyDir.y * dist, focus.z + _keyDir.z * dist);
    sun.updateMatrixWorld();
  }

  let lastBoostDenied = 0;   // previous frame's boostDenied pulse, for the blip edge
  let lastBoostFull = true;  // bar starts full; true so boot does not chime

  function applyCarTransform() {
    const s = physics.state;
    carRoot.position.set(s.pos.x, s.pos.y, s.pos.z);
    // THE DRAWN NOSE IS THE HEADING. `s.yaw` and nothing else.
    // The `- s.slip * 0.22` term dates from before physics.js had a real lateral velocity:
    // back then `slip` was a cosmetic body angle bolted onto a car that travelled exactly
    // where it pointed, and rotating the shell was the only way to suggest a slide. Physics
    // now integrates vLat and yaw independently, so the heading is already the direction the
    // body faces and the velocity already differs from it. Keeping the term subtracted the
    // slide from the very thing that shows the slide: wave-s/handling-critic-r2 measured it
    // spending 12.6 of the 18.3 deg the camera-sign fix bought, leaving 5.3 deg of readable
    // on-screen lag and the WRONG SIGN at peak slip (rig 1.5-2.1 deg AHEAD of the drawn nose
    // at 30 deg of slip). It called this "the largest single thing between the fixed drift
    // and a drift the player can see".
    carRoot.rotation.y = s.yaw;
  }

  function tick(dt) {
    const ts = crash.active ? crash.timeScale : 1;
    const sdt = dt * ts;
    if (cfg.onTick) cfg.onTick(ctx, sdt);

    if (crash.active) crash.update(sdt);
    else physics.step(sdt);

    // THE WRECK JOIN. physics.js must not import crash.js, so a wreck-grade contact is
    // published through `drainWreck()` (cleared on read) rather than by half-setting
    // `state.crashed`. Round 1's critic found `state.crashed` was set by nothing at all, so
    // crash.js's whole state machine was unreachable from driving; this is the line that makes
    // it reachable. Drained even while a crash is active so a queued wreck cannot fire twice.
    const wreck = physics.drainWreck();
    if (wreck && !crash.active) {
      crash.trigger(wreck);
      // The join has to carry the AUDIO too. crash.trigger() is picture only, so a gameplay
      // wreck was silent while the C-key demo below (which calls both) was not - the wreck
      // was the one path that dropped the sound. Severity is the impact grade physics already
      // computed, so a heavy hit is louder than a barely-wrecking one.
      audio.crash(wreck.severity);
      hud.banner('WRECKED', 1.4);
    }

    const s = physics.state;
    applyCarTransform();
    car.update(sdt, {
      speed: crash.active ? 0 : s.speed,
      steer: s.steer, lean: s.lean, pitch: s.pitch,
    });
    if (crash.active) crash.update(0); // re-assert wreck pose after car.update

    // The radial smear serves two masters. Boost drives it from throttle; a crash drives
    // it from crash.shutter01, the real-world ground speed divided by the sim time rate —
    // so during slow-mo the tarmac keeps streaking at its true velocity while the pass's
    // hero hole holds the wreck sharp. That mismatch is the signature of Burnout's crash
    // cam; without this max() the frame reads as a paused physics sim.
    boostFx.update(sdt, {
      amount: Math.max(s.boostBlend, crash.shutter01),
      speed: s.speed, pos: s.pos, yaw: s.yaw,
      slip: Math.abs(s.slipAngle || 0),
    });
    // The camera goes in so the dynamic point-light pool can be filled from the emitters that are
    // actually in shot. Every visible point light costs every shaded fragment in the frame; see
    // the note in world.js's update().
    world.update(sdt, s.pos, camera);
    // Traffic runs on the SCALED dt so a crash's slow-mo dilates the other cars too;
    // a wreck tumbling in slow motion past traffic moving at full rate is the single
    // most obvious way to break the crash cam's read.
    traffic.update(sdt, s.pos, s.yaw, s.speed);
    sky.update(sdt, s.pos);
    reassertKeyDir(s.pos);
    camRig.update(dt, s);
    // SPEED SOURCE: `s.ground` (= |v|), NOT `s.speed` (the longitudinal component).
    // wave-s/handling-critic measured the difference live at 61 deg of slip: real ground
    // speed 178 km/h against `s.speed` 86 km/h, so the speedo and the engine note both read
    // 52% LOW during the exact moment the player is doing something interesting. A
    // speedometer shows |v|; so does an engine whose wheels are being dragged sideways.
    const gspd = s.ground !== undefined ? s.ground : Math.abs(s.speed);
    hud.update(dt, {
      speed: gspd, boost: s.boost, boosting: s.boosting, boostDenied: s.boostDenied,
      earnFeed: s.earnFeed,
      gear: gearOf(gspd), pos: s.pos, yaw: s.yaw, crashed: s.crashed,
    });
    // Denied boost press: rising edge of physics' pulse -> one refusal blip.
    if ((s.boostDenied || 0) > 0.9 && lastBoostDenied <= 0.9) audio.boostDenied();
    lastBoostDenied = s.boostDenied || 0;
    // Bar just filled: the ready chime. Edge on crossing the full-bar gate's own threshold,
    // and not while burning (a Burnout Chain refill mid-burn has its own drama already).
    const full = s.boost >= 0.999;
    if (full && !lastBoostFull && !s.boosting) audio.boostReady();
    lastBoostFull = full;
    audio.update(dt, {
      rpm01: rpmOf(gspd), load: clamp(0.25 + s.accelG * 0.09, 0, 1),
      throttle: clamp(0.25 + s.accelG * 0.09, 0, 1),
      brake: clamp(-s.accelG * 0.10, 0, 1),
      speed: gspd, boost: s.boostBlend, slip: Math.abs(s.slip),
      gear: gearOf(gspd), boosting: s.boosting, airborne: s.airborne,
      wet: cfg.wet || 0,
      listener: {
        pos: camera.position,
        fwd: camera.getWorldDirection(_camFwd),
        up: camera.up,
        vel: _camVel.set(Math.sin(s.yaw), 0, Math.cos(s.yaw)).multiplyScalar(s.speed),
      },
    });
  }

  // ---- scene setup -------------------------------------------------------
  sky.apply(cfg.timeOfDay || 'dusk');
  world.setNight((cfg.timeOfDay || 'dusk') === 'night');
  world.setWet(cfg.wet || 0);
  traffic.setNight((cfg.timeOfDay || 'dusk') === 'night');
  physics.reset(new THREE.Vector3(0, 0, 0), 0, 0);
  cfg.setup(ctx);
  sky.applyBloom(bloom); // sky owns bloom threshold/radius/strength per time-of-day
  world.applyKeyFill(sky); // world owns the canyon key:fill ratio (see world.applyKeyFill)

  // ---- shadow cascade ------------------------------------------------------
  // The facades model 20-45 cm of relief (mullion piers, sills, per-floor cornices,
  // awning brackets). A 2048 map spanning +/-85 m is 8.3 cm per texel and its default
  // 0.35 m normalBias is *deeper than the relief itself*, so every one of those steps
  // had its shadow biased clean away — which is exactly why the facades read flat.
  // 4096 px over a tight, car-following span puts the texel at ~3 cm and drops the
  // normal bias below the smallest ledge, so the steps finally resolve.
  {
    const tod = cfg.timeOfDay || 'dusk';
    const city = tod === 'midday' || tod === 'noon' || tod === 'day';
    const sh = sky.sun.shadow;
    // ---- `#shadow=<px>` IS A MEASURED KNOB, AND THE DEFAULT IS DELIBERATELY THE EXPENSIVE ONE.
    // The sun's depth pass is the largest single item left in this build downtown and at night:
    // measured at 1280x720 ratio 1 (`tools/_perfr2.mjs --mode kill`, 2 interleaved paired runs,
    // verdicts/wave-s/perf-r2.md section 6),
    //
    //   4096 -> 2048   night-wet  -4.85 ms    city  -2.81 ms
    //   4096 -> 1024   night-wet  -5.33 ms    city  -2.89 ms
    //   casters off    night-wet  -9.92 ms    city  -7.20 ms
    //   PCFSoft -> PCF night-wet  -0.13 ms    city  +0.16 ms   <- the SAMPLING is free
    //
    // so it is a raster-area cost, not a filtering or submission one, and the knee is at 2048.
    // It stays at 4096 by default anyway, because the paragraph above this one is a visual result
    // that waves K-R paid for: at 2048 the default normalBias is deeper than the 20-45 cm of
    // facade relief and the facades read FLAT. This wave may not make a scene look worse, so the
    // frames stay spent and the alternative is one hash parameter with its price printed here.
    // `#shadow=0` disables the sun's shadow map entirely.
    //
    // WAVE-S PERF-R3: THE DEFAULT IS NOW PER TIME OF DAY, AND ONLY NIGHT MOVED.
    // The refusal above is a DAYTIME result: it is about the sun modelling 20-45 cm of facade
    // relief. At night the sun is `intensity 0.45` at `-7.5 deg` elevation (read off the live
    // preset) against a hemisphere ambient of 0.40 and a city full of lamps, so its depth map is
    // paying full price for almost nothing. Measured, 1280x720 ratio 1 dpr 1, night-wet, p50:
    //
    //   4096 (was the default)  33.30 ms      shadows off entirely  23.80 ms
    //   2048                    28.40 (-4.90)
    //   1024                    27.30 (-6.00)   <- the new night default
    //
    // and the whole map is only worth 9.50 ms at night, so 1024 collects two thirds of it.
    // THE VISUAL GATE FOR IT, because this is a quality decision and not a free one:
    // `wet-night-asphalt` rendered at 4096 and at 1024 differs by maxDiff 37, mean 0.1700,
    // 0.75% of pixels over 2/255 (same-build noise floor on this scene: maxDiff 4, mean 0.0001).
    // I cropped the cell with the largest difference — the right-hand lit facade, x 880-1200,
    // y 20-220 — and read both at 3x (`shots/r3/crop-4096.png` vs `shots/r3/crop-1024.png`):
    // same mullion piers, same per-floor cornices, same sill shadows, same lamp falloff. Nothing
    // reads flatter. Day, dusk and dawn are UNCHANGED at 4096.
    // `#shadow=<px>` still overrides, and an explicit override wins at every time of day.
    const shadowParam = params.shadow === undefined
      ? null : Math.max(0, Math.min(8192, Math.round(parseFloat(params.shadow) || 0)));
    /** Size the sun's depth map for a time of day. Called again by applyTimeOfDay(). */
    function applyShadowRes(todName) {
      const px = shadowParam !== null ? shadowParam : (todName === 'night' ? 1024 : 4096);
      renderer.shadowMap.enabled = px !== 0;
      const n = Math.max(256, px);
      if (sh.mapSize.x === n && sh.mapSize.y === n) return;
      sh.mapSize.set(n, n);
      // three allocates the depth target once and caches it on the shadow; it has to be dropped
      // for a new mapSize to take effect at runtime.
      if (sh.map) { sh.map.dispose(); sh.map = null; }
    }
    ctx.applyShadowRes = applyShadowRes;
    applyShadowRes(tod);
    // 100 m -> 4.9 cm/texel in the city, still well under the 20 cm facade relief.
    // It cannot go tighter than this: at 42 deg a 40 m block throws a 44 m shadow and
    // a 100 m tower a 110 m one, so a +/-62 m box clipped every long shadow out of the
    // map entirely and the road came out unshadowed no matter how the fill was graded.
    // The open highway keeps a wider bubble because its casters (poles, gantries,
    // guard rails) are spread far down the road.
    const S = city ? 100 : 130;
    sh.camera.left = -S; sh.camera.right = S;
    sh.camera.top = S; sh.camera.bottom = -S;
    sh.camera.updateProjectionMatrix();
    sh.normalBias = city ? 0.035 : 0.07;
    sh.bias = -0.00009;
  }

  applyCarTransform();
  scene.updateMatrixWorld(true);

  audio.setSpace(cfg.audioSpace || 'city');

  window.__game = ctx;
  window.__audio = audio;

  const bootEl = document.getElementById('boot');

  // ==========================================================================
  // deterministic screenshot run
  // ==========================================================================
  if (shotMode) {
    hud.resize(window.innerWidth, window.innerHeight);
    renderer.compile(scene, camera);
    const steps = Math.max(1, Math.round((cfg.simTime || 4) / FIXED_DT));
    for (let i = 0; i < steps; i++) tick(FIXED_DT);
    // let the HUD land exactly on the final state, no smoothing lag
    const s = physics.state;
    hud.snap({
      speed: s.speed, boost: s.boost, boosting: s.boosting,
      gear: gearOf(s.speed), pos: s.pos, yaw: s.yaw, crashed: s.crashed,
    });
    scene.updateMatrixWorld(true);
    // The car's reflection probe is now rate-limited (car.js PROBE_MIN_FRAMES), so the last
    // automatic bake can sit up to 90 ticks behind the final pose. A screenshot must never
    // reflect a street the car has already left, so bake it once more here, after the sim has
    // landed on its final frame. This costs one re-bake in shot mode and nothing at runtime,
    // and it makes the shot path MORE current than it was before the rate limit, not less.
    car.refreshEnv();
    // render a handful of identical frames so nothing is mid-upload
    for (let i = 0; i < 4; i++) renderFrame();
    await new Promise((r) => requestAnimationFrame(r));
    renderFrame();
    bootEl.classList.add('gone');
    bootEl.style.display = 'none';
    window.__ready = true;
    return ctx;
  }

  // ==========================================================================
  // playable
  // ==========================================================================
  physics.clearPath();
  hud.setVisible(true);
  hud.banner('BURNOUT GAUNTLET', 2.5);

  // ---- crash feel ------------------------------------------------------------
  // Two knobs, named rather than inlined as magic numbers, and declared BEFORE the
  // keydown listener below: boot still yields frames after that listener is registered,
  // so a `const` declared later would be in its temporal dead zone if the player
  // pressed C during the last few stages of loading.
  //
  // CRASH_HOLD_S is how long the wreck replay runs before control returns.
  // CRASH_DEMO_SEVERITY scales the C-key demo crash only: `severity` multiplies debris
  // launch velocity, body spin on all three axes, the damage level and the camera kick
  // (crash.js:1409-1428), so one number governs how BIG the wreck reads.
  const CRASH_HOLD_S = 2.2;
  const CRASH_DEMO_SEVERITY = 0.55;

  const keys = Object.create(null);
  const down = (e) => {
    keys[e.code] = true;
    audio.start();
    if (e.code === 'KeyR') {
      crash.reset(); damage.reset();
      physics.reset(physics.state.pos, physics.state.yaw, 0);
      traffic.reset(physics.state.pos);
      camRig.configure({ mode: 'chase' });
    }
    if (e.code === 'KeyC' && !crash.active) {
      const yaw = physics.state.yaw;
      // The 30 m/s floor meant the demo crash was violent even from a standstill, which is
      // why it read as oversized. Use the real speed, with a small floor so C still does
      // something visible when parked.
      crash.trigger({
        speed: Math.max(12, Math.abs(physics.state.speed)),
        dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
        severity: CRASH_DEMO_SEVERITY,
      });
      audio.crash(CRASH_DEMO_SEVERITY);
      hud.banner('WRECKED', 1.4);
      camRig.configure({
        mode: 'orbit', orbitRadius: 10, orbitHeight: 3.2, orbitSpeed: 0.35,
        orbitTarget: new THREE.Vector3(physics.state.pos.x, 0.95, physics.state.pos.z),
        fov: 50, shake: 0.4,
      });
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };
  const up = (e) => { keys[e.code] = false; };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('pointerdown', () => audio.start());

  // ---- FRAME-TIME INSTRUMENT -------------------------------------------------
  // A ring of wall-clock deltas between consecutive rAF callbacks. rAF-to-rAF is the
  // honest quantity for "does it hold 60": it includes compositing and any main-thread
  // work outside our own render call, which a `performance.now()` bracket around
  // `composer.render()` silently omits. GPU work is pipelined, so the bracket routinely
  // reads 4 ms on a build that is visibly dropping frames — do not measure that instead.
  //
  // `reset()` before a measurement window, then read `stats()`. Percentiles come from a
  // full sort of the window, not a subsample: `tools/_px.mjs` shipped a subsampled
  // percentile for four waves and it was wrong by up to 15% (STATE.md, nineteenth finding).
  const FT_CAP = 4096;
  const ftBuf = new Float64Array(FT_CAP);
  let ftN = 0, ftHead = 0, ftLongTotal = 0;
  const frameStats = {
    reset() { ftN = 0; ftHead = 0; ftLongTotal = 0; },
    push(ms) {
      // ftLongTotal must count over the RING'S CONTENTS, not over all time since reset:
      // `stats()` divides it by `a.length`, which saturates at FT_CAP. wave-s/perf-critic
      // hit this deliberately and got over16_7pct 4.13 on a window whose true figure was
      // far higher. So decrement for the sample this push evicts.
      if (ftN === FT_CAP && ftBuf[ftHead] > 16.7) ftLongTotal--;
      ftBuf[ftHead] = ms; ftHead = (ftHead + 1) % FT_CAP;
      if (ftN < FT_CAP) ftN++;
      if (ms > 16.7) ftLongTotal++;
    },
    /**
     * The ring's raw contents, oldest first. Read-only; `stats()` percentiles are derived from
     * exactly this. It exists because a percentile cannot tell a 30 ms frame from a 25 ms frame
     * that waited for the next vsync: wave-s/perf.md section 6 found the p90 pinned at 33.3 ms
     * (two 60 Hz intervals) while the p50 walked from 27.6 to 16.4, and read it as our workload
     * for two measurements before a kill-control overturned it. A HISTOGRAM of the raw deltas
     * shows cadence pinning immediately — the samples pile up at multiples of the refresh
     * interval and nowhere in between — and nothing else in this instrument can.
     */
    samples() {
      const out = new Array(ftN);
      const start = ftN === FT_CAP ? ftHead : 0;
      for (let i = 0; i < ftN; i++) out[i] = ftBuf[(start + i) % FT_CAP];
      return out;
    },
    stats() {
      if (!ftN) return null;
      const a = Array.prototype.slice.call(Array.from(ftBuf.subarray(0, ftN))).sort((x, y) => x - y);
      const q = (p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
      const mean = a.reduce((s, v) => s + v, 0) / a.length;
      const rs = ctx.renderSize();
      return {
        n: a.length, mean, p50: q(0.50), p90: q(0.90), p99: q(0.99), max: a[a.length - 1],
        fpsMean: 1000 / mean, fpsP50: 1000 / q(0.50), fpsP99: 1000 / q(0.99),
        over16_7pct: 100 * ftLongTotal / a.length,
        renderW: rs.w, renderH: rs.h, pixelRatio: rs.pixelRatio,
        devicePixelRatio: rs.devicePixelRatio, resScale,
      };
    },
  };
  ctx.frameStats = frameStats;
  window.__frameStats = frameStats;

  // ---- pause ----------------------------------------------------------------
  // Paused means: no tick, no input, but KEEP RENDERING. A frozen canvas behind a
  // translucent menu reads as a hang, and the menu has to be able to show a time-of-day
  // change taking effect on the live frame behind it.
  let paused = false;
  ctx.isPaused = () => paused;
  ctx.setPaused = (v) => { paused = !!v; if (paused) for (const k in keys) keys[k] = false; };

  // ---- ONE SHADOW MAP PER FRAME ---------------------------------------------
  //
  // THE SUN'S 4096x4096 DEPTH MAP WAS RASTERISED TWO OR THREE TIMES EVERY FRAME.
  //
  // `WebGLRenderer.render()` calls `shadowMap.render()` at the top of every invocation, and this
  // build invokes it more than once per frame with the REAL scene and the real light list:
  // the colour pass, the SSAO normal/depth prepass, boost's hero-mask depth pass, and — on a wet
  // frame — road.js's planar reflection. Counted live by wrapping `renderer.shadowMap.render` and
  // only counting the calls whose `shadowsArray` is non-empty (`tools/_perfr3.mjs` companion probe;
  // the other ~18 calls per frame are post-processing fullscreen quads with no lights, which are
  // already no-ops):
  //
  //   dusk highway  2.03 real shadow renders/frame   124 shadow draw calls/frame
  //   city midday   2.00                             260
  //   night + wet   3.00                             436
  //
  // Every one of those rasters the SAME map: `light.shadow.camera` is derived from the light and
  // the scene, NOT from the camera being rendered, so the second and third passes recompute a
  // bit-identical depth buffer. This is the same defect class as wave-s/perf-r2's planar
  // reflection (one collaborator's cost multiplied by the number of outer passes) and the fix is
  // the same shape: render it once, reuse it for the rest of the frame.
  //
  // `shadowMap.autoUpdate = false` makes `shadowMap.render()` an early return unless
  // `needsUpdate` is set; three clears `needsUpdate` after the first pass that consumes it. So
  // arming it once per frame here yields exactly one raster per frame. It is set BEFORE the
  // pass that renders the real scene (`composer.passes[0]` is the RenderPass) so the map is
  // always fresh for the frame it is used in, and it is armed on the paused path too.
  //
  // LOSSLESS BY CONSTRUCTION, not by taste: the map's content is a function of the light and the
  // scene only, and neither changes between the passes of a single frame.
  // The deterministic screenshot path is not touched at all — it returns at :556, above this —
  // so `tools/shot.mjs` still renders with three's default per-render shadow update.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  let last = performance.now();
  function frame(now) {
    const dtRaw = (now - last) / 1000;
    last = now;
    frameStats.push(dtRaw * 1000);
    renderer.shadowMap.needsUpdate = true;
    // The paused path composites the HUD too, and it must: menu.js repaints the paused HUD with
    // hud.snap() (its D1 fix, the res slider used to leave it blank until resume) and on the
    // in-frame path that repaint only reaches the screen through drawHudLayer().
    if (paused) { renderFrame(); requestAnimationFrame(frame); return; }
    const dt = clamp(dtRaw, 0, 0.05);

    if (!crash.active) {
      physics.setInput({
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
        brake: keys.KeyS || keys.ArrowDown ? 0.6 : 0,
        // LEFT is +1, and that is deliberate: physics.js:141 integrates
        // `yaw += steer * turnRate * dt`, and a positive Y rotation in three.js is
        // counter-clockwise seen from above — i.e. a LEFT turn. Mapping right to +1
        // steered the car the wrong way. Fixing the sign here rather than on
        // `yawRate` keeps every downstream sign consistent: `lat` on physics.js:144
        // is derived from `yawRate`, and it drives `slip` and `lean`, so negating
        // `yawRate` instead would make the car bank the wrong way through corners.
        steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
        boost: !!(keys.ShiftLeft || keys.ShiftRight),
        handbrake: !!keys.Space,
        // speeding earn is gated on actually being in the oncoming lane
        oncoming: !!traffic.heroOncoming,
      });
      // How long the wreck replay holds before control is handed back. 4.5 s read as a
      // punishment rather than a beat; Paradise's own takedown replay is nearer 2 s.
    } else if (crash.time > CRASH_HOLD_S) {
      crash.reset();
      physics.reset(physics.state.pos, physics.state.yaw, 0);
      camRig.configure({ mode: 'chase' });
    }

    car.setBrake(keys.KeyS || keys.ArrowDown ? 1 : 0);
    tick(dt);
    renderFrame();
    requestAnimationFrame(frame);
  }
  // Compiling shaders is the last real cost and it is the one that used to stall on a
  // black screen with the overlay already dismissed, which read as a hang. Do it while
  // the bar is still up and honest about it.
  await stage('warm', 'compiling shaders');
  // Effects that are built at boot but held INVISIBLE until they fire — crash debris, sparks,
  // flares, boost flames — were never compiled here, because three's compile() walks visible
  // nodes only. Every one of their programs therefore compiled on the first C press or the
  // first boost, which is what the pause on the first crash was: measured at 88 ms of compile
  // against 19 ms for a second pass, plus the first-render cost of each material variant.
  //
  // Force those subtrees visible for exactly one compile, then restore each node's own flag.
  // Restoring per node rather than per group matters: several of these are individually
  // toggled at runtime, so a blanket `visible = true` afterwards would make them all appear.
  //
  // WAVE-S ROUND 2: THE SUBTREE LIST IS NOW THE WHOLE SCENE, AND A REAL FRAME IS RENDERED.
  // Two separate defects, both measured on the stall timeline (`tools/perf-probe.mjs --mode
  // stall`, cruise, 45 s, 1280x720 ratio 1; verdicts/wave-s/perf-r2.md section 7):
  //
  //   t+0.72 s   718 ms   dProgs 68  dGeos 379  dTexs 88   <- the first REAL frame
  //   t+1.94 s    68 ms   dProgs 1
  //   t+3.84 s    70 ms   dProgs 1
  //   t+4.36 s    69 ms   dProgs 1
  //   t+5.44 s    64 ms   dProgs 1
  //
  // The named-subtree list could only ever cover the subtrees somebody thought of, and four more
  // programs were still compiling in the first six seconds of play. Forcing every hidden node in
  // the scene visible for exactly one compile costs one traversal and covers all of them.
  //
  // The 718 ms one is not compilation at all: `renderer.compile()` builds PROGRAMS, and that
  // frame's counters say `geometries` and `textures`, i.e. 379 vertex buffers and 88 textures
  // being uploaded to the GPU the first time something actually draws with them. The only way to
  // force an upload is to draw, so the warm stage now renders one full composer frame with
  // everything visible. It lands inside the boot bar, where the player is already being told to
  // wait, instead of on the first frame of the drive.
  // The subtree list is deliberately NAMED and not `scene.traverse`. I measured the whole-scene
  // version: it compiles 172 programs instead of 68 and uploads 296 more geometries, it took the
  // warm stage to **10.1 seconds**, and it STILL left three compiles in the first five seconds of
  // play, because what those three want is a material variant that no hidden node carries.
  // Twelve seconds of boot to move 200 ms of stall is not a trade worth making.
  const warmRoots = [crash.group, boostFx.group].filter(Boolean);
  const hidden = [];
  for (const root of warmRoots) {
    root.traverse((o) => { if (o.visible === false) { hidden.push(o); o.visible = true; } });
    if (!root.visible) { hidden.push(root); root.visible = true; }
  }
  renderer.compile(scene, camera);
  // Restoring per node rather than per group matters: several of these are individually toggled
  // at runtime, so a blanket `visible = true` afterwards would make them all appear.
  // boost.js's radial smear only renders its hero mask when the pass is actually smearing, and
  // that mask installs `scene.overrideMaterial` — so the depth and silhouette PROGRAM VARIANTS
  // for every attribute layout in the scene (instanced, plain, multi-material) compile on the
  // player's first boost and nowhere else. Measured on the boost scenario before this line:
  // five stalls of 55-108 ms between t+3.1 s and t+9.4 s, each carrying `dProgs 1`, with
  // `renderer.info.programs` walking 178 -> 195 during the drive. Warming the pass ON for one
  // frame compiles all of them behind the boot bar.
  const warmBoostAmt = boostFx.pass.uniforms.uAmount.value;
  const warmBoostOn = boostFx.pass.enabled;
  boostFx.pass.uniforms.uAmount.value = 1;
  boostFx.pass.enabled = true;   // boost.js:1062 ships it disabled; a disabled pass is skipped
  try { renderFrame(); } catch { /* a warm frame must never be able to stop the boot */ }
  boostFx.pass.uniforms.uAmount.value = warmBoostAmt;
  boostFx.pass.enabled = warmBoostOn;
  for (const o of hidden) o.visible = false;
  // ...and one more frame in the SHIPPING visibility state, so the (cheaper) program and buffer
  // set the first real frame actually uses is resident too.
  try { renderFrame(); } catch { /* as above */ }

  // FIRST-CRASH HITCH. compile() + the hidden-subtree draw above warm crash FX programs,
  // but the freeze on the player's first C / wreck is mostly elsewhere:
  //   - damage.js paints 1024² scuff/fracture canvases and deforms the body on first impact
  //   - debris/spark instance buffers only upload live matrices when pieces actually spawn
  //   - shatter / lamp-out material paths only run past severity thresholds
  // A silent prewarm runs that whole path once under the boot bar, then restores pristine state.
  // `#crashwarm=0` skips it for A/B.
  if (params.crashwarm !== '0' && crash.prewarm) {
    const warmPos = physics.state.pos.clone();
    const warmYaw = physics.state.yaw;
    try {
      crash.prewarm(renderFrame);
      const glw = renderer.getContext();
      if (glw && glw.finish) glw.finish();
    } catch { /* never fatal */ }
    physics.reset(warmPos, warmYaw, 0);
    car.group.rotation.set(0, 0, 0);
    car.group.position.y = 0;
    applyCarTransform();
    try { renderFrame(); } catch { /* as above */ }
  }

  await stage('done', 'ready');
  if (bootBarEl) bootBarEl.style.width = '100%';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  bootEl.classList.add('gone');
  setTimeout(() => { bootEl.style.display = 'none'; }, 500);

  // ---- start / pause menu ----------------------------------------------------
  // The rAF loop starts either way; the START menu opens with the game PAUSED on top of a
  // live first frame, so the player sees the scene they are about to drive and any
  // time-of-day change lands on it immediately. `#nomenu=1` skips straight to driving,
  // which is what the frame-time harness uses so a measurement never depends on a click.
  const menu = createMenu({
    ctx,
    onStart() {
      // The start click is a real user gesture, so it is the correct and only reliable
      // place to unlock WebAudio. Every other path (keydown, pointerdown anywhere) was a
      // guess about what the player would do first.
      audio.start();
      // Same gesture unlocks the soundtrack. Music owns its own AudioContext and its own
      // gain straight to destination (see music.js's contract header), so it is unlocked
      // beside audio rather than through it, and an `audio.stop()` cannot take it down.
      music.unlock();
      physics.reset(physics.state.pos, physics.state.yaw, 0);
      traffic.reset(physics.state.pos);
      frameStats.reset();
    },
  });
  ctx.menu = menu;
  traffic.reset(physics.state.pos);

  // ---- RESIDENCY WARM-UP. THE LAST STALL THE PLAYER ACTUALLY SEES. -----------
  //
  // wave-s/perf-critic-r2 section 4b found, and I reproduced 4 boots out of 4, a deterministic
  // 174-330 ms hitch on the THIRD rAF after `__ready`. `tools/_perfr3.mjs --mode first` breaks
  // that window down per frame, with renderer.info deltas and a CPU bracket around every
  // collaborator `tick()` calls:
  //
  //   #   delta   dProgs dGeos dTexs   attribution (CPU ms)
  //   1     4.6        0     0     0   traffic.update 1
  //   2    85.0        8   113     3   renderer.render 65  car.update 23  hud.update 18
  //   3   310.5        0     0     0   composer.render 8.3   <- NO CPU IN IT AT ALL
  //
  // So the hitch is not compilation and it is not our JS: the third frame spends ten
  // milliseconds on the CPU and three hundred waiting. Frame 2 is the one that costs, and what
  // it does is upload **8 programs, 113 geometries and 3 textures** — the objects that were
  // created or first driven AFTER the warm stage ran, i.e. exactly the ones the two warm frames
  // at `:761-781` structurally cannot cover: `traffic.reset()` at `:811` builds its vehicles
  // after them, and `hud.update` / `car.update` are never called at all until the first tick.
  // Frame 2 queues all of that on the GL command stream, returns, and the compositor then
  // blocks for 300 ms finishing it — which is why the cost lands on frame 3 with an empty
  // profile and why every previous attempt to find it by reading `renderer.info.programs` came
  // back with "already 192, not compilation".
  //
  // The fix is therefore two things and needs both:
  //   1. run one REAL `tick()` before `__ready`, so the first-tick-only creations happen inside
  //      the boot bar. dt is 1 ms rather than 0: nothing here divides by dt, but a zero dt makes
  //      several integrators no-ops and the point is to drive the same code the drive will.
  //   2. `gl.finish()` after rendering it. Without this the uploads are merely QUEUED before
  //      `__ready` and the stall simply moves to the player's first frame anyway — the boot bar
  //      is only honest if the wait has actually been served behind it.
  //
  // `__warmStats` publishes what it cost so this is assertable from a harness instead of being
  // taken on trust: `{ progs, geos, texs, ms }` are the DELTAS this block absorbed.
  // CAUSE 2 of the same hitch, and it is not a GPU cost at all. `long-animation-frame` names
  // the script: `{ sourceURL: main.js, sourceFunctionName: "down", invoker: "DOMWindow.onkeydown",
  // duration: 282.1 ms, blockingDuration: 242.1 }`. `down` (:582) calls `audio.start()`, and on a
  // cold graph that synchronously builds a whole AudioContext — two 3-second stereo noise
  // buffers, a synthesised reverb IR, five buses, four voices. So THE FIRST KEY THE PLAYER
  // PRESSES freezes the page for 162-282 ms. Kill-control: `audio.start` stubbed out after
  // `__ready` and before the first key removes the hitch in 4 boots of 4.
  // `audio.prewarm()` builds that graph here instead, suspended and at zero master gain, so the
  // gesture only has to resume it. See audio.js's prewarm() for why it is still silent.
  // `#audiowarm=0` restores the old timing.
  if (params.audiowarm !== '0' && audio.prewarm) {
    try { window.__audioWarmMs = +(audio.prewarm() || -1).toFixed(1); } catch { /* never fatal */ }
  }
  try {
    const g0 = renderer.info.memory.geometries;
    const t0 = renderer.info.memory.textures;
    const p0 = renderer.info.programs.length;
    const w0 = performance.now();
    tick(0.001);
    renderFrame();
    // A hard sync, at boot only, on purpose. This is the one place in the build where blocking
    // the main thread on the GPU is the correct behaviour.
    const gl = renderer.getContext();
    if (gl && gl.finish) gl.finish();
    window.__warmStats = {
      progs: renderer.info.programs.length - p0,
      geos: renderer.info.memory.geometries - g0,
      texs: renderer.info.memory.textures - t0,
      ms: +(performance.now() - w0).toFixed(1),
    };
  } catch (e) {
    // A warm frame must never be able to stop a boot.
    window.__warmStats = { error: String(e) };
  }

  requestAnimationFrame(frame);
  if (!(params.nomenu === '1' || params.nomenu === true)) {
    ctx.setPaused(true);
    menu.showStart();
  }
  window.__ready = true;
  return ctx;
}
