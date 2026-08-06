// devtune.js — TEMPORARY. Live slider panel for the steering / drift / camera constants.
//
// THIS FILE IS SCHEDULED FOR DELETION. It exists so the user can tune handling by feel while
// driving, read the final figures off the sliders, and hand them back to be applied permanently
// to `physics.js` TUNE and `camera.js`. Removing it afterwards is: delete this file, delete the
// two lines in `main.js` that import and call it, and drop the `export` keyword from `FRAME` in
// `camera.js`. Nothing else in the tree references it.
//
// HOW IT APPLIES A VALUE, and why there is no plumbing: every constant below lives on an object
// the simulation re-reads every tick — `TUNE` in physics.js, the `cfg` object behind
// `camRig.config`, and `FRAME` in camera.js. Writing the property IS the apply. There is no
// reload, no rebuild, and no copy of these numbers held anywhere else that could go stale.
//
// COST WHEN CLOSED: one keydown listener that compares `e.code`, and nothing else. The readouts
// need a per-frame poll, so the panel drives its OWN requestAnimationFrame loop, started on open
// and cancelled on close. `main.js` gains no per-frame work — that is the point of doing it this
// way rather than adding a `devtune.update()` call to the main loop.

import { TUNE } from './physics.js';
import { FRAME as CAM_FRAME } from './camera.js';

const STORE_KEY = 'bg.devtune.v1';

// Targets. 'T' = physics TUNE, 'C' = the camera rig's live config, 'F' = camera.js FRAME.
// [target, key, label, min, max, step]
const GROUPS = [
  ['Steering', [
    ['T', 'steerRate', 'input rate — how fast the wheel winds on (1/s)', 4, 60, 0.01],
    ['T', 'minRadius', 'turn radius at low speed — LOWER = sharper peak (m)', 4, 20, 0.01],
    ['T', 'gripUse', 'grip commanded — raises + flattens the yaw falloff', 0.5, 1.3, 0.005],
    ['T', 'downforce', 'downforce at vMax — how slowly yaw falls with speed', 0, 2, 0.01],
    ['T', 'steerMax', 'mechanical lock limit (rad)', 0.2, 0.7, 0.005],
    ['T', 'steerServo', 'yaw-rate servo authority, on road (rad per rad/s)', 0, 1.2, 0.005],
    ['T', 'steerServoDrift', 'servo authority INSIDE a drift — counter-steer feel', 0, 0.6, 0.002],
    ['T', 'steerServoHandbrake', 'servo authority while the e-brake is held', 0, 0.6, 0.002],
    ['T', 'stabilityAssist', 'yaw damping toward the target rate (1/s)', 0, 8, 0.02],
  ]],
  ['Drift and handbrake', [
    ['T', 'handbrakeDecel', 'e-brake rear-axle decel (m/s^2)', 0, 20, 0.05],
    ['T', 'handbrakeSteerGain', 'extra steer/yaw demand while the e-brake is held', 1, 3, 0.01],
    ['T', 'handbrakeMu', 'rear grip multiplier on e-brake, LOW speed', 0.1, 1, 0.005],
    ['T', 'handbrakeMuHigh', 'rear grip multiplier on e-brake, at vMax', 0.1, 1, 0.005],
    ['T', 'handbrakeSlip', 'slip angle the e-brake ASKS for (rad)', 0.1, 1.2, 0.005],
    ['T', 'handbrakeAssist', 'how fast that angle arrives (1/s)', 0.5, 14, 0.02],
    ['T', 'absHold', 'ABS hold — THE BRAKE-TAP DRIFT KNOB', 0.6, 1, 0.001],
    ['T', 'driveSplitRear', 'rear share of drive force', 0, 1, 0.005],
    ['T', 'driftStabilityAssist', 'drift servo gain on the sustaining rate (1/s)', 0, 14, 0.02],
    ['T', 'driftAngularDamping', 'slip-angle unwind rate — LOWER = longer drift (1/s)', 0.05, 1, 0.005],
    ['T', 'driftYawAuthority', 'player yaw authority inside a drift', 0, 1.5, 0.005],
    ['T', 'driftEnterRatio', 'x saturation slip to ENTER the drift state', 0.6, 3, 0.01],
    ['T', 'driftExitRatio', 'x saturation slip to LEAVE it', 0.2, 1.5, 0.01],
    ['T', 'driftTapSlip', 'slip angle a brake tap commands (rad)', 0, 0.8, 0.005],
    ['T', 'driftTapBrake', 'brake input that reaches full tap authority', 0, 1, 0.005],
    ['T', 'driftFlick', 'Scandinavian-flick impulse on applying opposite lock', 0, 0.6, 0.005],
    ['T', 'driftCounterGather', 's of held opposite lock that ends the slide', 0.1, 2, 0.005],
    ['T', 'driftCounterDecay', 'how fast the gather bleeds back on release (1/s)', 0.5, 8, 0.02],
    ['T', 'boostEarnDrift', 'boost earned per second of full-angle drift (bar/s)', 0, 0.4, 0.002],
  ]],
  ['Camera', [
    ['F', 'slipAim', 'rig azimuth lag toward the direction of travel, at |slip| = 1 (rad)', 0, 1, 0.005],
    ['C', 'steerLead', 'aim point lead per unit of steer (rad)', 0, 0.6, 0.002],
    ['C', 'slipSwing', 'metres the tail swings across frame per unit of slip', 0, 6, 0.02],
    ['C', 'distance', 'chase distance (m)', 3, 16, 0.05],
    ['C', 'height', 'chase height (m)', 0.6, 5, 0.02],
    ['C', 'yawLag', 'rig azimuth chase rate — LOWER = more lag (rad/s)', 0.5, 12, 0.02],
    ['C', 'stiffness', 'follow spring rate — LOWER = laggier follow', 1, 16, 0.02],
    ['C', 'lookStiffness', 'aim spring rate', 1, 20, 0.02],
    ['C', 'lookAhead', 'aim point distance ahead of the car (m)', 2, 20, 0.05],
    ['C', 'roll', 'camera bank into corners', 0, 2, 0.01],
  ]],
];

export function createDevTune({ physics, camRig }) {
  const targets = { T: TUNE, F: CAM_FRAME, C: camRig.config };
  const specs = [];
  for (const [group, rows] of GROUPS) {
    for (const [t, key, label, min, max, step] of rows) {
      // Skip a knob whose constant has been renamed out from under us rather than writing a
      // property that nothing reads — a slider that silently does nothing is worse than absent.
      if (!(key in targets[t])) { console.warn(`[devtune] no such knob: ${t}.${key}`); continue; }
      specs.push({ group, t, key, label, min, max, step, def: targets[t][key] });
    }
  }

  const read = (s) => targets[s.t][s.key];
  const write = (s, v) => { targets[s.t][s.key] = v; };

  // ---- persistence. Only OVERRIDDEN keys are stored, so a default changed in code still lands.
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
  })();
  const save = () => {
    const out = {};
    for (const s of specs) if (read(s) !== s.def) out[`${s.t}.${s.key}`] = read(s);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch { /* private mode */ }
  };
  for (const s of specs) {
    const v = saved[`${s.t}.${s.key}`];
    if (typeof v === 'number' && Number.isFinite(v)) write(s, v);
  }

  // ---- DOM -------------------------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'devtune';
  root.style.cssText = [
    'position:fixed', 'top:0', 'right:0', 'bottom:0', 'width:430px', 'z-index:9999',
    'display:none', 'overflow-y:auto', 'box-sizing:border-box', 'padding:10px 12px 40px',
    'background:rgba(10,12,16,0.92)', 'border-left:1px solid #2c3442',
    'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace', 'color:#cfd8e6',
    '-webkit-font-smoothing:antialiased',
  ].join(';');

  const css = document.createElement('style');
  css.textContent = `
    #devtune h2{font:700 11px/1 inherit;letter-spacing:.14em;text-transform:uppercase;
      color:#7d8ba0;margin:16px 0 8px;padding-bottom:5px;border-bottom:1px solid #232a35}
    #devtune h2:first-child{margin-top:2px}
    #devtune .row{margin:0 0 9px}
    #devtune .top{display:flex;align-items:baseline;gap:8px}
    #devtune .k{color:#e8eef7;font-weight:700}
    #devtune .v{margin-left:auto;color:#ffd479;font-weight:700;font-size:14px;
      font-variant-numeric:tabular-nums}
    #devtune .v.mod{color:#7dff9b}
    #devtune .d{color:#6f7d91;font-size:10.5px;margin:1px 0 3px}
    #devtune input[type=range]{width:100%;height:16px;margin:0;accent-color:#ffb03a;
      background:transparent;cursor:ew-resize}
    #devtune .bar{position:sticky;top:0;z-index:1;display:flex;gap:6px;align-items:center;
      margin:-10px -12px 6px;padding:8px 12px;background:#0a0c10;
      border-bottom:1px solid #2c3442}
    #devtune button{font:inherit;font-weight:700;color:#0a0c10;background:#ffb03a;border:0;
      border-radius:3px;padding:4px 9px;cursor:pointer}
    #devtune button.ghost{background:#232a35;color:#cfd8e6}
    #devtune .live{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 10px;
      margin:0 0 4px;padding:7px 9px;background:#141922;border:1px solid #232a35;border-radius:3px}
    #devtune .live span{color:#6f7d91}
    #devtune .live b{float:right;color:#8fd0ff;font-variant-numeric:tabular-nums}
    #devtune .live b.on{color:#7dff9b}
  `;

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = '<b style="color:#ffb03a;letter-spacing:.12em">DEV TUNE</b>'
    + '<span style="color:#6f7d91">` to hide</span>';
  const bReset = document.createElement('button');
  bReset.textContent = 'Reset all';
  bReset.className = 'ghost';
  bReset.style.marginLeft = 'auto';
  bar.appendChild(bReset);
  root.appendChild(bar);

  const live = document.createElement('div');
  live.className = 'live';
  live.innerHTML = ['speed', 'yaw rate', 'slip', 'drift', 'boost', 'steer']
    .map((n) => `<span>${n}<b></b></span>`).join('');
  const liveVals = [...live.querySelectorAll('b')];
  root.appendChild(live);

  // Decimals from the step, so 0.001 shows three and 0.05 shows two. Reading a figure back off
  // the panel is the whole deliverable, so the number must not be rounded past its own resolution.
  const dp = (step) => Math.max(0, Math.ceil(-Math.log10(step)));

  const uis = [];
  let lastGroup = null;
  for (const s of specs) {
    if (s.group !== lastGroup) {
      lastGroup = s.group;
      const h = document.createElement('h2');
      h.textContent = s.group;
      root.appendChild(h);
    }
    const row = document.createElement('div');
    row.className = 'row';
    const digits = dp(s.step);
    row.innerHTML = `<div class="top"><span class="k">${s.key}</span>`
      + `<span class="v">${read(s).toFixed(digits)}</span></div>`
      + `<div class="d">${s.label}</div>`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = s.min; input.max = s.max; input.step = s.step;
    input.value = read(s);
    const out = row.querySelector('.v');
    const paint = () => {
      out.textContent = read(s).toFixed(digits);
      out.classList.toggle('mod', read(s) !== s.def);
      out.title = `default ${s.def}`;
    };
    input.addEventListener('input', () => { write(s, +input.value); paint(); save(); });
    row.appendChild(input);
    root.appendChild(row);
    uis.push({ s, input, paint });
    paint();
  }

  bReset.addEventListener('click', () => {
    for (const u of uis) { write(u.s, u.s.def); u.input.value = u.s.def; u.paint(); }
    save();
  });

  document.head.appendChild(css);
  document.body.appendChild(root);

  // ---- open / close. The rAF loop exists ONLY while open. ---------------------------------
  let open = false;
  let raf = 0;
  const st = physics.state;
  const tick = () => {
    liveVals[0].textContent = `${(st.ground * 3.6).toFixed(0)} km/h`;
    liveVals[1].textContent = `${(st.yawRate * 57.2958).toFixed(1)} deg/s`;
    // The UNCLAMPED slip angle. `state.slip` is a clamped -1..1 display proxy and saturates
    // exactly where a drift gets interesting, which makes it useless for tuning one.
    liveVals[2].textContent = `${(st.slipAngle * 57.2958).toFixed(1)} deg`;
    liveVals[3].textContent = st.drifting ? 'YES' : '—';
    liveVals[3].classList.toggle('on', st.drifting);
    liveVals[4].textContent = `${(st.boost * 100).toFixed(0)}%`;
    liveVals[5].textContent = st.steer.toFixed(2);
    raf = requestAnimationFrame(tick);
  };
  const setOpen = (v) => {
    if (v === open) return;
    open = v;
    root.style.display = v ? 'block' : 'none';
    if (v) raf = requestAnimationFrame(tick);
    else { cancelAnimationFrame(raf); raf = 0; }
  };

  // Backquote, at capture phase so menu.js's own capture handler does not swallow it, and
  // stopped there so it never leaks into the driving input path.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(!open);
  }, true);

  const q = `${location.search}${location.hash}`;
  if (/[?&#]dev=1\b/.test(q)) setOpen(true);

  return { setOpen, get open() { return open; } };
}
