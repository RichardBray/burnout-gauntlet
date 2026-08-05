// _sharpness.mjs — A/B the handbrake and turn-in SHARPNESS, i.e. how fast rotation ARRIVES.
//
// tools/handling-measure.mjs already covers DEPTH (peak slip angle, sustained yaw rate) and it
// passes. "Not sharp enough" is not a depth complaint, it is an arrival-time one, and nothing
// measured that. This does: time from input to a given slip angle under the e-brake, and time to
// a given yaw rate on a plain turn-in, with the OLD constants and the NEW ones in one run.
//
// It runs inside the PAGE rather than in node, so `three` resolves through index.html's import
// map and no shim is needed. TUNE is exported and read live inside step(), so both configurations
// can be measured in one process without editing the file.
//
//   node tools/_sharpness.mjs        (needs `node tools/serve.mjs` running)

import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
// about:blank has no import map, so load the game page and reuse its module resolution. We never
// render here; the page is only a host for the module graph.
await page.goto('http://localhost:8777/game/index.html#nomenu=1', { waitUntil: 'commit' });
// NOTE the `null`: waitForFunction's second positional is the ARGUMENT passed to the predicate,
// so putting the options object there silently leaves the default 30 s timeout in place.
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });

const rows = await page.evaluate(async () => {
  const { createPhysics, TUNE } = await import('./physics.js');
  const DT = 1 / 120;
  const DEG = 180 / Math.PI;

  function run({ speed, handbrake, targetSlipDeg, targetYawDegS, maxT = 3 }) {
    const p = createPhysics({ blocks: [] });
    p.reset(new window.__game.THREE.Vector3(0, 0, 0), 0, speed);
    let t = 0, tSlip = null, tYaw = null, peakSlip = 0, peakYaw = 0;
    let prevYaw = p.state.yaw;
    while (t < maxT) {
      p.setInput({ throttle: handbrake ? 0 : 1, steer: 1, handbrake });
      p.step(DT);
      t += DT;
      const slip = Math.abs((p.state.slipAngle ?? p.state.slip) * DEG);
      const yawRate = Math.abs((p.state.yaw - prevYaw) / DT) * DEG;
      prevYaw = p.state.yaw;
      peakSlip = Math.max(peakSlip, slip);
      peakYaw = Math.max(peakYaw, yawRate);
      if (tSlip === null && slip >= targetSlipDeg) tSlip = t;
      if (tYaw === null && yawRate >= targetYawDegS) tYaw = t;
    }
    return { tSlip, tYaw, peakSlip, peakYaw };
  }

  const NEW = { assist: TUNE.handbrakeAssist, rate: TUNE.handbrakeRate, steer: TUNE.steerRate };
  const OLD = { assist: 1.60, rate: 0.75, steer: 10 };
  const setTune = (c) => {
    TUNE.handbrakeAssist = c.assist; TUNE.handbrakeRate = c.rate; TUNE.steerRate = c.steer;
  };

  const out = [];
  for (const [label, cfg] of [['OLD', OLD], ['NEW', NEW]]) {
    setTune(cfg);
    for (const speed of [22, 36, 55]) {
      const hb = run({ speed, handbrake: true, targetSlipDeg: 20, targetYawDegS: 30 });
      const tn = run({ speed, handbrake: false, targetSlipDeg: 20, targetYawDegS: 20 });
      out.push({ label, cfg, kmh: Math.round(speed * 3.6), hb, tn });
    }
  }
  setTune(NEW);
  return out;
});

const ms = (x) => (x === null ? '   n/a' : `${(x * 1000).toFixed(0).padStart(4)}ms`);
let last = '';
for (const r of rows) {
  if (r.label !== last) {
    console.log(`\n== ${r.label}  (handbrakeAssist ${r.cfg.assist}, handbrakeRate ${r.cfg.rate}, steerRate ${r.cfg.steer})`);
    last = r.label;
  }
  console.log(
    `  ${String(r.kmh).padStart(3)} km/h  e-brake to 20deg slip ${ms(r.hb.tSlip)}  ` +
    `peak slip ${r.hb.peakSlip.toFixed(1).padStart(5)}deg  peak yaw ${r.hb.peakYaw.toFixed(0).padStart(3)}deg/s` +
    `  |  turn-in to 20deg/s ${ms(r.tn.tYaw)}`);
}
await browser.close();
