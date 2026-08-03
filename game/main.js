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
  // ---- RENDER PIXELS ARE CSS PIXELS. THIS IS A MEASUREMENT CONTRACT, NOT A PREFERENCE.
  // This is a Retina machine: `devicePixelRatio` is 2, so the old
  // `min(devicePixelRatio, 2)` made a 1280x720 window render a 2560x1440 buffer —
  // 4x the pixels — and every frame-rate number taken from it was a lie by that factor.
  // The pixel ratio is now `resScale` and nothing else, defaulting to 1.0, so the drawing
  // buffer is exactly `innerWidth x innerHeight` REAL pixels and the canvas's CSS
  // `width:100%/height:100%` upscales it to fill the window. `#res=<n>` (or the pause
  // menu) scales it below 1 to buy frames; it is never allowed above 1 because that
  // reintroduces the same lie by a different name.
  let resScale = clamp(parseFloat(params.res) || 1, 0.4, 1);
  renderer.setPixelRatio(shotMode ? 1 : resScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
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
  const hud = createHud(document.getElementById('hud'), { layout: world.LAYOUT });
  const audio = createAudio({ enabled: !shotMode });
  const traffic = createTraffic(scene, {
    rng: makeRng(0x7AFF1C), layout: world.LAYOUT, blocks: world.blocks, roadKit,
  });

  // ---- post chain ------------------------------------------------------
  await stage('post', 'post-processing');
  const dpr = renderer.getPixelRatio();
  const rtW = Math.max(2, Math.floor(window.innerWidth * dpr));
  const rtH = Math.max(2, Math.floor(window.innerHeight * dpr));
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
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  // SSAO before bloom: occlusion is part of the scene's radiance, so the glare pyramid
  // must see the darkened seams rather than blooming over them.
  const ssao = createSsaoPass(scene, camera, rtW, rtH, {
    exclude: [sky.skyMesh, boostFx.group],
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

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(shotMode ? 1 : resScale);
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
    // The HUD is drawn on its own 2-D canvas that is NOT part of the post chain, so it
    // always renders at full window resolution: dropping resScale must not soften the
    // HUD, which is exactly what Burnout does (see reference/INDEX.md hud-overlay-03).
    hud.resize(w, h);
  }
  window.addEventListener('resize', resize);

  /** Change the render resolution scale at runtime. 1.0 = one render pixel per CSS pixel. */
  function setResScale(s) {
    resScale = clamp(s, 0.4, 1);
    resize();
    return resScale;
  }

  // ---- shared per-frame update ------------------------------------------
  const cfg = getScene(sceneId);
  const ctx = {
    THREE, renderer, scene, camera, sky, roadKit, world, car, carRoot,
    physics, camRig, boost: boostFx, damage, crash, hud, audio, traffic, bloom, composer, ssao,
    outputPass, toneMode, bloomMode,
    setResScale,
    getResScale: () => resScale,
    /** The buffer the frame is actually rasterised into. Quote this beside every fps figure. */
    renderSize() {
      const v = renderer.getDrawingBufferSize(new THREE.Vector2());
      return { w: v.x, h: v.y, cssW: window.innerWidth, cssH: window.innerHeight,
        pixelRatio: renderer.getPixelRatio(), devicePixelRatio: window.devicePixelRatio || 1 };
    },
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

  function applyCarTransform() {
    const s = physics.state;
    carRoot.position.set(s.pos.x, s.pos.y, s.pos.z);
    carRoot.rotation.y = s.yaw - s.slip * 0.22;
  }

  function tick(dt) {
    const ts = crash.active ? crash.timeScale : 1;
    const sdt = dt * ts;
    if (cfg.onTick) cfg.onTick(ctx, sdt);

    if (crash.active) crash.update(sdt);
    else physics.step(sdt);

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
    });
    world.update(sdt, s.pos);
    // Traffic runs on the SCALED dt so a crash's slow-mo dilates the other cars too;
    // a wreck tumbling in slow motion past traffic moving at full rate is the single
    // most obvious way to break the crash cam's read.
    traffic.update(sdt, s.pos, s.yaw, s.speed);
    sky.update(sdt, s.pos);
    reassertKeyDir(s.pos);
    camRig.update(dt, s);
    hud.update(dt, {
      speed: s.speed, boost: s.boost, boosting: s.boosting,
      gear: gearOf(s.speed), pos: s.pos, yaw: s.yaw, crashed: s.crashed,
    });
    audio.update(dt, {
      rpm01: rpmOf(s.speed), load: clamp(0.25 + s.accelG * 0.09, 0, 1),
      throttle: clamp(0.25 + s.accelG * 0.09, 0, 1),
      brake: clamp(-s.accelG * 0.10, 0, 1),
      speed: Math.abs(s.speed), boost: s.boostBlend, slip: Math.abs(s.slip),
      gear: gearOf(s.speed), boosting: s.boosting, airborne: s.airborne,
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
    sh.mapSize.set(4096, 4096);
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
    for (let i = 0; i < 4; i++) composer.render();
    await new Promise((r) => requestAnimationFrame(r));
    composer.render();
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
      ftBuf[ftHead] = ms; ftHead = (ftHead + 1) % FT_CAP;
      if (ftN < FT_CAP) ftN++;
      if (ms > 16.7) ftLongTotal++;
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

  let last = performance.now();
  function frame(now) {
    const dtRaw = (now - last) / 1000;
    last = now;
    frameStats.push(dtRaw * 1000);
    if (paused) { composer.render(); requestAnimationFrame(frame); return; }
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
    composer.render();
    requestAnimationFrame(frame);
  }
  // Compiling shaders is the last real cost and it is the one that used to stall on a
  // black screen with the overlay already dismissed, which read as a hang. Do it while
  // the bar is still up and honest about it.
  await stage('warm', 'compiling shaders');
  renderer.compile(scene, camera);
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
      physics.reset(physics.state.pos, physics.state.yaw, 0);
      traffic.reset(physics.state.pos);
      frameStats.reset();
    },
  });
  ctx.menu = menu;
  traffic.reset(physics.state.pos);

  requestAnimationFrame(frame);
  if (!(params.nomenu === '1' || params.nomenu === true)) {
    ctx.setPaused(true);
    menu.showStart();
  }
  window.__ready = true;
  return ctx;
}
