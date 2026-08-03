// main.js — renderer + post chain + game loop + module wiring + the deterministic shot runner.
// API: boot() builds everything and either runs the playable loop or, with #shot=1, steps a fixed
//   number of ticks for the scene named by #scene=<id> and then sets window.__ready = true.
//   window.__game exposes every module ({sky, world, car, physics, camRig, boost, crash, hud, ...}).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


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
  renderer.setPixelRatio(shotMode ? 1 : Math.min(window.devicePixelRatio || 1, 2));
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

  // ---- modules --------------------------------------------------------
  const sky = createSky(scene, renderer);
  const roadKit = createRoadKit(makeRng(0xA5FA17), { renderer });
  const world = createWorld(scene, { rng: makeRng(0xC17E), roadKit });

  const car = createCar(makeRng(0xCA5), { paint: 0xd8420f });
  const carRoot = new THREE.Group();
  carRoot.add(car.group);
  scene.add(carRoot);

  const physics = createPhysics({ blocks: world.blocks });
  const camRig = createCamRig(camera);
  const boostFx = createBoost(car);
  scene.add(boostFx.group);
  const damage = createDamage(car);
  const crash = createCrash(scene, car, physics, damage);
  const hud = createHud(document.getElementById('hud'), { layout: world.LAYOUT });
  const audio = createAudio({ enabled: !shotMode });

  // ---- post chain ------------------------------------------------------
  const dpr = renderer.getPixelRatio();
  const rtW = Math.max(2, Math.floor(window.innerWidth * dpr));
  const rtH = Math.max(2, Math.floor(window.innerHeight * dpr));
  const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
    type: THREE.HalfFloatType, samples: 4,
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

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    ssao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    bloom.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    hud.resize(w, h);
  }
  window.addEventListener('resize', resize);

  // ---- shared per-frame update ------------------------------------------
  const cfg = getScene(sceneId);
  const ctx = {
    THREE, renderer, scene, camera, sky, roadKit, world, car, carRoot,
    physics, camRig, boost: boostFx, damage, crash, hud, audio, bloom, composer, ssao,
    outputPass, toneMode, bloomMode,
  };

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

  const keys = Object.create(null);
  const down = (e) => {
    keys[e.code] = true;
    audio.start();
    if (e.code === 'KeyR') { crash.reset(); damage.reset(); physics.reset(physics.state.pos, physics.state.yaw, 0); }
    if (e.code === 'KeyC' && !crash.active) {
      const yaw = physics.state.yaw;
      crash.trigger({
        speed: Math.max(30, Math.abs(physics.state.speed)),
        dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), severity: 1,
      });
      audio.crash(1);
      hud.banner('WRECKED', 2.2);
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

  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;

    if (!crash.active) {
      physics.setInput({
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
        brake: keys.KeyS || keys.ArrowDown ? 0.6 : 0,
        steer: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
        boost: !!(keys.ShiftLeft || keys.ShiftRight),
        handbrake: !!keys.Space,
      });
    } else if (crash.time > 4.5) {
      crash.reset();
      physics.reset(physics.state.pos, physics.state.yaw, 0);
      camRig.configure({ mode: 'chase' });
    }

    car.setBrake(keys.KeyS || keys.ArrowDown ? 1 : 0);
    tick(dt);
    composer.render();
    requestAnimationFrame(frame);
  }
  bootEl.classList.add('gone');
  setTimeout(() => { bootEl.style.display = 'none'; }, 500);
  requestAnimationFrame(frame);
  window.__ready = true;
  return ctx;
}
