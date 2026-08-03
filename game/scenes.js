// scenes.js — the deterministic scene registry the screenshot harness drives.
// API: SCENES (id -> {timeOfDay, wet, simTime, setup(ctx), onTick(ctx,t)}), getScene(id), SCENE_IDS.
// ctx = {sky, world, car, physics, camRig, boost, crash, damage, hud, roadKit, bloom, renderer, scene, camera}
// A scene must leave the game fully determined: camera rig, time of day, weather, car state.

import * as THREE from 'three';

/** Shared helper: drop the car on a path, point the chase cam at it, hold the throttle down. */
function cruise(ctx, pathName, u, speedKmh, { boost = false } = {}) {
  const path = ctx.world.paths[pathName];
  ctx.physics.placeOnPath(path, u, speedKmh / 3.6);
  ctx.physics.setInput({ throttle: 1, boost });
  ctx.physics.followPath(path, boost ? 34 : 26);
  ctx.camRig.snap();
  return path;
}

export const SCENES = {
  // ---------------------------------------------------------------------
  'dusk-highway-chase': {
    timeOfDay: 'dusk', wet: 0, simTime: 9.5,
    setup(ctx) {
      ctx.world.setNight(false);
      ctx.car.setLights(false);
      ctx.car.setPaint(0xd8420f);
      ctx.bloom.strength = 0.42; ctx.bloom.threshold = 0.85; ctx.bloom.radius = 0.62;
      ctx.hud.setVisible(false);
      ctx.camRig.configure({
        // distance 7.20 -> 10.2 (r3 critic) -> 9.0 (r4 critic). At 7.20 the lens sat 6.02 m off the
        // rear bumper for a depression ratio of 0.315, against 0.21-0.22 then believed to be the
        // reference value (see the r7 block below: that number was mis-measured, the truth is
        // 0.29-0.30); the car filled 28.1% of frame height vs their 20.9/21.7 and its
        // contact line sat at 0.83 vs 0.77. 10.2 overshot by about as much as 7.20 undershot, the
        // other way: 18.20% / 0.201 / 0.713. r4 swept it and measured 9.0 -> car 21.32% (mid-target),
        // contact line 0.750, depression 0.236. Sweep, for the record: 8.6 -> 22.67/0.765/0.251;
        // 8.9 -> 21.64/0.753/0.240; 9.2 -> 20.70/0.742/0.230.
        // fov is measured on-target (vfov 44.37 / hfov 71.88 vs Burnout's ~43/70) and is left alone.
        // lookHeight stays at 1.05 - at 9.0 the car does not read detached.
        //
        // r7: BOTH "standing facts" above were wrong, and the r5/r6 depression target with them.
        //
        // (a) Distance does NOT cancel out of depression. Sweeping distance at fixed height 1.80
        //     moves it (9.0 -> 0.210, 9.3 -> 0.211, 9.6 -> 0.212; over 5.5-9.0 it swings 0.169 ->
        //     0.210). Contact patch and roofline sit at different longitudinal depths, so the ratio
        //     is not scale-invariant. Height is the strong lever, distance a real second-order one.
        // (b) The 0.21-0.22 depression target was measured off the wrong feature. Re-derived here
        //     from the references, at native resolution, with the pixel rows written down:
        //       dusk-highway-chase-02.jpg (2560x1080): horizon from the intersection of the two
        //         guardrail top edges (road-parallel lines share one VP) -> y 539 = 49.93%.
        //         Body roofline y 624 = 57.78% (luma step 95 -> 157 at x 1250-1310). Tyre contact
        //         y 830 = 76.85%. => roof-to-horizon gap 7.85%, car 19.07%, contact 0.769,
        //         depression 0.292.
        //       dusk-highway-chase-03.jpg (5000x2813): horizon from two streetlamps of equal height,
        //         h = (b1*t2 - b2*t1)/(b1 + t2 - b2 - t1) with (base,top) = (1530,850) and
        //         (1403,1180) -> y 1345 = 47.81%, cross-checked against the bases of the two far
        //         lamps at y 1343-1348. Body roofline y 1590 = 56.52% (the roof-mounted scoop at
        //         y 1545 is an appendage, not the roofline - measuring THAT is what produced the
        //         old 0.21 target). Contact y 2166 = 77.00%. => gap 8.70%, car 20.48%,
        //         contact 0.770, depression 0.298.
        //     CORRECTED TARGETS: roof-to-horizon gap 7.8-8.7% of frame height, depression 0.29-0.30,
        //     contact 0.769-0.771, car height 19.1-20.5% (equivalently 20.9-21.7% if measured to the
        //     topmost point of the car rather than the roofline - our shell puts its wing 1.8% above
        //     its roof, the same offset -03's scoop has). Horizon stays 48-50%.
        //
        // r6 moved height 1.885 -> 1.80, i.e. the wrong way: at 1.80 the gap is only 5.10% and
        // depression 0.210, well under band. Full r7 sweep (all at lookHeight 1.05, fov 42), as
        // gap% / depression / contact / car% / horizon%:
        //   d 9.0  h 1.80  5.10 / 0.210 / 0.736 / 19.20 / 49.34     d 9.3  h 1.80  4.90 / 0.211 / 0.727 / 18.35
        //   d 9.0  h 2.00  7.41 / 0.272 / 0.766 / 19.89 / 49.29     d 9.3  h 2.00  7.13 / 0.273 / 0.756 / 18.99
        //   d 9.0  h 2.10  8.57 / 0.297 / 0.781 / 20.23 / 49.29     d 9.3  h 2.05  7.72 / 0.287 / 0.762 / 19.15
        //   d 9.0  h 2.20  9.70 / 0.320 / 0.796 / 20.57 / 49.33     d 9.3  h 2.10  8.26 / 0.300 / 0.769 / 19.30  <- chosen
        //   d 9.0  h 2.30 10.82 / 0.341 / 0.811 / 20.91 / 49.34     d 9.3  h 2.15  8.80 / 0.311 / 0.776 / 19.46
        //   d 9.0  h 2.40 11.95 / 0.360 / 0.826 / 21.26 / 49.37     d 9.3  h 2.20  9.32 / 0.322 / 0.786 / 19.62
        //   d 9.15 h 2.05  7.84 / 0.286 / 0.768 / 19.59             d 9.6  h 2.10  8.00 / 0.302 / 0.760 / 18.47
        //   d 9.15 h 2.10  8.42 / 0.299 / 0.775 / 19.76             d 9.6  h 2.20  9.06 / 0.326 / 0.774 / 18.77
        //   d 9.15 h 2.15  8.99 / 0.311 / 0.782 / 19.93             d 9.45 h 2.10  8.11 / 0.300 / 0.765 / 18.88
        // 9.30 / 2.10 is the single cell that hits every corrected target at once. 2.17-2.20 (the
        // r7 critic's suggestion) overshoots depression to 0.32 - it inflated the reference band by
        // pairing a roofline-measured "ours" against a topmost-point-measured "theirs".
        //
        // This also retires the "contact line is geometrically locked at 0.737" claim: it was only
        // locked while height was held fixed. Raising the camera pushes the car down the frame
        // without touching FRAME.pitchBase, so contact lands on 0.769 with the horizon still at 49.3%.
        mode: 'chase', distance: 9.30, height: 2.10, lookAhead: 14, lookHeight: 1.05,
        fov: 42, fovSpeed: 8, fovBoost: 10, shake: 0.85,
      });
      cruise(ctx, 'highway', 0.30, 232);
    },
  },

  // ---------------------------------------------------------------------
  'boost-blur': {
    timeOfDay: 'dusk', wet: 0, simTime: 8.0,
    setup(ctx) {
      ctx.world.setNight(false);
      ctx.car.setLights(false);
      ctx.car.setPaint(0xd8420f);
      ctx.bloom.strength = 0.70; ctx.bloom.threshold = 0.72; ctx.bloom.radius = 0.75;
      ctx.hud.setVisible(false);
      ctx.camRig.configure({
        mode: 'chase', distance: 6.65, height: 1.77, lookAhead: 16, lookHeight: 1.05,
        // Boost is a RELATIVE widening off the same ~44 deg base lens: +7 deg rendered, which is
        // the punch, not a jump to a fisheye. FRAME.fovMax (58) is the hard ceiling.
        fov: 44, fovSpeed: 8, fovBoost: 12, shake: 1.3,
      });
      cruise(ctx, 'highway', 0.22, 300, { boost: true });
    },
    onTick(ctx) { ctx.physics.state.boost = 1; },
  },

  // ---------------------------------------------------------------------
  'crash-cam': {
    // simTime 0.9 is the slow-mo beat, not an arbitrary pause: crash.shutter01 peaks at
    // 0.60 around wall 0.075-0.5 s and is still 0.213 here, where 9.5 s (the old value)
    // sat at 0.022 — outside the dilation entirely, which is why the frame used to read
    // as a paused physics sim with no shutter mismatch. Measured sweep, shutter01:
    //   0.35 -> 0.416   0.9 -> 0.213   5.3 -> 0.189   5.7 -> 0.175   9.5 -> 0.022
    // 0.9 was chosen over the 0.35 peak on composition: the wreck is airborne and rolling
    // with a full debris fan, which is the crash-cam-01/-04 staging.
    timeOfDay: 'dusk', wet: 0, simTime: 0.9,
    setup(ctx) {
      ctx.world.setNight(false);
      ctx.car.setLights(false);
      ctx.car.setPaint(0xd8420f);
      ctx.bloom.strength = 0.55; ctx.bloom.threshold = 0.8; ctx.bloom.radius = 0.7;
      ctx.hud.setVisible(false);

      const path = ctx.world.paths.city;
      ctx.physics.placeOnPath(path, 0.14, 62);
      ctx.physics.clearPath();
      ctx.physics.setInput({ throttle: 0 });

      const yaw = ctx.physics.state.yaw;
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      ctx.crash.trigger({ speed: 62, dir, severity: 1 });

      const target = new THREE.Vector3();
      ctx.camRig.configure({
        mode: 'orbit', orbitRadius: 10.5, orbitHeight: 3.4, orbitSpeed: 0.16,
        orbitStart: 1.35, orbitTarget: target, fov: 44, fovSpeed: 0, fovBoost: 0, shake: 0.25,
      });
      ctx._crashTarget = target;
      target.set(ctx.physics.state.pos.x, 0.95, ctx.physics.state.pos.z);
      ctx.camRig.snap();
    },
    onTick(ctx) {
      const p = ctx.physics.state.pos;
      ctx._crashTarget.set(p.x, 0.95, p.z);
    },
  },

  // ---------------------------------------------------------------------
  'wet-night-asphalt': {
    timeOfDay: 'night', wet: 1, simTime: 6.0,
    setup(ctx) {
      ctx.world.setNight(true);
      ctx.car.setLights(true);
      ctx.car.setPaint(0x1a5fd0);
      ctx.bloom.strength = 0.52; ctx.bloom.threshold = 0.86; ctx.bloom.radius = 0.72;
      ctx.hud.setVisible(false);
      ctx.camRig.configure({
        mode: 'chase', distance: 7.2, height: 1.89, lookAhead: 12, lookHeight: 1.05,
        fov: 42, fovSpeed: 8, fovBoost: 10, shake: 0.7,
      });
      cruise(ctx, 'city', 0.565, 150);
    },
  },

  // ---------------------------------------------------------------------
  'daytime-downtown': {
    timeOfDay: 'midday', wet: 0, simTime: 6.0,
    setup(ctx) {
      ctx.world.setNight(false);
      ctx.car.setLights(false);
      ctx.car.setPaint(0xe2b414);
      ctx.bloom.strength = 0.30; ctx.bloom.threshold = 0.95; ctx.bloom.radius = 0.5;
      ctx.hud.setVisible(false);
      ctx.camRig.configure({
        mode: 'chase', distance: 7.6, height: 2.0, lookAhead: 12, lookHeight: 1.35,
        fov: 46, fovSpeed: 8, fovBoost: 10, shake: 0.6,
      });
      cruise(ctx, 'city', 0.815, 165);
    },
  },

  // ---------------------------------------------------------------------
  'car-paint-closeup': {
    timeOfDay: 'dusk', wet: 0, simTime: 1.6,
    setup(ctx) {
      ctx.world.setNight(false);
      ctx.car.setBeams(false);
      ctx.car.setLights(true);
      ctx.car.setPaint(0xd8420f);
      ctx.bloom.strength = 0.5; ctx.bloom.threshold = 0.85; ctx.bloom.radius = 0.6;
      ctx.hud.setVisible(false);

      // Open highway, not the downtown canyon: the paint shot exists to show the
      // reflected horizon on the bodywork, and under an overpass between two towers
      // there is no sky in any of the flank's reflection directions to show.
      const path = ctx.world.paths.highway;
      ctx.physics.placeOnPath(path, 0.62, 0);
      ctx.physics.clearPath();
      ctx.physics.setInput({ throttle: 0 });

      ctx.camRig.configure({
        mode: 'fixed', fov: 36, fovSpeed: 0, fovBoost: 0, shake: 0,
        offset: new THREE.Vector3(4.30, 1.10, 2.30),
        target: new THREE.Vector3(-0.05, 0.82, 0.15),
      });
      ctx.camRig.snap();
    },
  },

  // ---------------------------------------------------------------------
  'hud-overlay': {
    timeOfDay: 'dusk', wet: 0, simTime: 7.0,
    setup(ctx) {
      ctx.world.setNight(false);
      ctx.car.setLights(false);
      ctx.car.setPaint(0xd8420f);
      ctx.bloom.strength = 0.48; ctx.bloom.threshold = 0.82; ctx.bloom.radius = 0.65;
      ctx.hud.setVisible(true);
      ctx.camRig.configure({
        mode: 'chase', distance: 7.0, height: 1.88, lookAhead: 11, lookHeight: 1.2,
        fov: 44, fovSpeed: 8, fovBoost: 10, shake: 0.8,
      });
      cruise(ctx, 'city', 0.34, 214);
      ctx.hud.banner('', 0);
    },
    onTick(ctx) { ctx.physics.state.boost = 0.68; },
  },
};

export const SCENE_IDS = Object.keys(SCENES);

export function getScene(id) {
  return SCENES[id] || SCENES['dusk-highway-chase'];
}
