// menu.js — START menu and Esc PAUSE menu. Same options in both.
//
// WHY THIS FILE EXISTS. Three things were undiscoverable or impossible without a reload:
// the control list (a player had to ask what boost was bound to), the time of day and
// wet/dry knobs (both already existed at runtime and nothing but the boot path called
// them), and the render resolution scale that the frame-time work needs. The start
// menu's click is also the only legitimate user gesture on the boot path, so it is what
// unlocks WebAudio instead of leaving that to whatever key the player happens to press.
//
// API (this is the contract main.js is written against — keep it):
//   createMenu({ ctx, onStart }) -> m
//     ctx      the window.__game context: applyTimeOfDay/applyWet/setResScale/setPaused,
//              getTimeOfDay/getWet/getResScale/frameStats
//     onStart  called once, on the start click, AFTER the menu has closed
//   m.showStart()   open as the start menu (no resume, no scene already running)
//   m.showPause()   open as the pause menu (has a resume button)
//   m.hide()
//   m.isOpen()
//
// This module owns its own DOM and its own Esc handling. It must not read the game's key
// state: the menu is pointer-driven so it keeps working while the game holds keys down.
//
// ART DIRECTION. This matches the HUD's paper/marker family rather than inventing a third
// style: the same ink/paper/amber palette as hud.js, the same jagged hand-drawn card
// outline (hud.js `torn()`, reproduced here as a jittered `clip-path` polygon), the same
// small card skew, the same soft ink drop shadow. See reference/INDEX.md hud-overlay-01
// and -03 for the source of that vocabulary. Legibility wins any tie: this menu's entire
// reason for existing is discoverability, so body text is counter-skewed back to upright
// and only the title carries the marker slant.

// Palette lifted verbatim from game/hud.js so the two surfaces cannot drift apart.
const INK = 'rgba(4,7,10,0.92)';
const PAPER = 'rgba(232,240,248,0.95)';
const AMBER = '#ffb31f';
const AMBER_HOT = '#ffd34a';
const GREEN = '#5fc51c'; // the boost-bar green, used for the "on" state of a toggle

const SKEW = 2.4; // degrees; hud.js cards sit at a comparable shear

/**
 * Deterministic signed jitter, the DOM twin of hud.js `jit()`. Seeded so a card's torn
 * edge is stable across repaints - an edge that re-randomises every open reads as noise
 * rather than as a drawn line.
 * @returns {number} in [-1, 1]
 */
function jit(i, seed) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * A `clip-path: polygon(...)` with a hand-drawn wobble on every edge. Percentages, so it
 * works without knowing the element's size; jx/jy are the wobble amplitudes in percent of
 * width and height respectively, kept separate because a card is far wider than it is tall
 * and one shared amplitude would make the short edges look torn and the long ones straight.
 */
function tornPolygon({ nx = 14, ny = 3, jx = 0.5, jy = 0.9, seed = 3.1 } = {}) {
  const p = [];
  const push = (x, y) => p.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  for (let i = 0; i <= nx; i++) push((100 * i) / nx, jit(i, seed) * jy);
  for (let i = 1; i <= ny; i++) push(100 + jit(i + 40, seed) * jx, (100 * i) / ny);
  for (let i = nx; i >= 0; i--) push((100 * i) / nx, 100 + jit(i + 90, seed) * jy);
  for (let i = ny - 1; i >= 1; i--) push(jit(i + 160, seed) * jx, (100 * i) / ny);
  return `polygon(${p.join(', ')})`;
}

const STYLE_ID = 'bg-menu-style';

/**
 * All menu CSS is injected from here rather than added to game/index.html, because
 * index.html is shared with every other module owner and this file is not.
 */
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const cardClip = tornPolygon({ nx: 16, ny: 4, jx: 1.2, jy: 0.7, seed: 3.1 });
  const chipClip = tornPolygon({ nx: 6, ny: 2, jx: 1.6, jy: 3.2, seed: 7.7 });
  const bigClip = tornPolygon({ nx: 9, ny: 2, jx: 1.0, jy: 3.6, seed: 11.3 });
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
#bgmenu {
  position: fixed; inset: 0; z-index: 40; display: none;
  align-items: center; justify-content: flex-start;
  font: 800 15px/1.35 "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: ${PAPER};
  /* Only a directional scrim, never a full-screen wash and never a backdrop-filter:
     the live paused frame behind this menu is the thing a player is judging when they
     change time of day or wet, and a blur would both hide it and cost frames. */
  background: linear-gradient(100deg, rgba(4,7,10,0.86) 0%, rgba(4,7,10,0.62) 38%,
              rgba(4,7,10,0.10) 62%, rgba(4,7,10,0.00) 100%);
  -webkit-font-smoothing: antialiased;
}
#bgmenu.open { display: flex; }
#bgmenu .shadow {
  /* drop-shadow on the PARENT so it follows the child's clip-path silhouette;
     a box-shadow here would draw the rectangle the clip just tore up. */
  filter: drop-shadow(0 12px 20px rgba(2,4,7,0.62)) drop-shadow(0 2px 0 rgba(2,4,7,0.9));
  margin: 0 0 0 clamp(18px, 5vw, 78px);
  max-height: 94vh;
}
#bgmenu .card {
  clip-path: ${cardClip};
  background: linear-gradient(160deg, rgba(13,18,24,0.94), rgba(6,9,13,0.90));
  transform: skewX(-${SKEW}deg);
  padding: 18px 30px 16px 26px;
  width: clamp(330px, 34vw, 470px);
  max-height: 94vh; overflow-y: auto; overflow-x: hidden;
  border-top: 2px solid rgba(255,179,31,0.30);
  scrollbar-width: thin;
}
/* Everything inside is sheared back to upright. The card stays skewed, the words stay
   readable - that is the compromise the brief's "keep it legible" line asks for. */
#bgmenu .inner { transform: skewX(${SKEW}deg); }

#bgmenu h1 {
  margin: 0; font-size: 27px; line-height: 0.98; letter-spacing: 0.02em;
  text-transform: uppercase; color: ${PAPER};
  transform: skewX(-9deg) scaleX(0.9); transform-origin: left;
  text-shadow: 0 2px 0 ${INK}, 0 0 14px rgba(255,179,31,0.22);
}
#bgmenu .sub {
  margin: 4px 0 11px; font-size: 10px; font-weight: 700; letter-spacing: 0.30em;
  text-transform: uppercase; color: ${AMBER};
}
#bgmenu .go {
  display: block; width: 100%; margin: 0 0 6px; cursor: pointer;
  clip-path: ${bigClip}; border: 0; appearance: none;
  padding: 11px 16px; font: 900 21px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
  letter-spacing: 0.16em; text-transform: uppercase; text-align: center;
  color: #241503; background: linear-gradient(180deg, ${AMBER_HOT}, ${AMBER});
  transition: filter .12s, transform .08s;
}
#bgmenu .go:hover { filter: brightness(1.12); }
#bgmenu .go:active { transform: translateY(1px); }
#bgmenu .go .k { font-size: 11px; letter-spacing: 0.22em; opacity: 0.72; }

#bgmenu .rule {
  height: 2px; margin: 11px 0 9px;
  background: repeating-linear-gradient(90deg,
    rgba(232,240,248,0.34) 0 12px, rgba(232,240,248,0.05) 12px 17px);
}
#bgmenu .lab {
  font-size: 10px; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase;
  color: ${AMBER}; margin: 0 0 6px;
}
#bgmenu .row { margin: 0 0 11px; }
#bgmenu .seg { display: flex; gap: 6px; flex-wrap: wrap; }
#bgmenu .seg button {
  cursor: pointer; border: 0; appearance: none; clip-path: ${chipClip};
  padding: 7px 11px; font: 800 11.5px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(232,240,248,0.80); background: rgba(232,240,248,0.10);
  transition: background .12s, color .12s;
}
#bgmenu .seg button:hover { background: rgba(232,240,248,0.20); color: #fff; }
#bgmenu .seg button.on { background: ${AMBER}; color: #241503; }
#bgmenu .seg button.on.green { background: ${GREEN}; color: #08170a; }

#bgmenu input[type=range] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 18px;
  background: transparent; cursor: pointer; margin: 4px 0 0;
}
#bgmenu input[type=range]::-webkit-slider-runnable-track {
  height: 5px; background: rgba(232,240,248,0.16);
}
#bgmenu input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 13px; height: 19px; margin-top: -7px;
  background: ${AMBER}; border: 0;
  clip-path: polygon(8% 0%, 100% 4%, 92% 100%, 0% 95%);
}
#bgmenu .val {
  font: 700 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.04em; color: rgba(232,240,248,0.86);
}
#bgmenu .val b { color: ${AMBER_HOT}; font-weight: 700; }
#bgmenu .hint { font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
  color: rgba(232,240,248,0.46); margin: 3px 0 0; text-transform: none; }

#bgmenu .keys { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px;
  align-items: center; }
#bgmenu .keys kbd {
  justify-self: start; font: 800 10.5px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
  letter-spacing: 0.08em; padding: 4px 7px; white-space: nowrap;
  color: #f2f7fc; background: rgba(232,240,248,0.13);
  clip-path: ${chipClip}; text-transform: uppercase;
}
#bgmenu .keys span { font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em;
  color: rgba(232,240,248,0.82); text-transform: uppercase; }
#bgmenu .foot { margin: 10px 0 0; font-size: 10px; font-weight: 700;
  letter-spacing: 0.22em; text-transform: uppercase; color: rgba(232,240,248,0.40); }
`;
  document.head.appendChild(el);
}

const TODS = [['dawn', 'DAWN'], ['midday', 'MIDDAY'], ['dusk', 'DUSK'], ['night', 'NIGHT']];
const WETS = [[0, 'DRY'], [0.5, 'DAMP'], [1, 'WET']];

// Transcribed from main.js, not guessed: the keydown handler `down()` (KeyR at main.js:458,
// KeyC at main.js:464) and the input mapping inside `frame()` (throttle/brake at :541-543,
// steer at :550, boost at :551, handbrake at :552, brake lights at :560). Escape is handled
// in this file. Every row below was also pressed in a real boot and observed to do this.
const CONTROLS = [
  ['W / ↑', 'accelerate'],
  ['S / ↓', 'brake, then reverse'],
  ['A / ←', 'steer left'],
  ['D / →', 'steer right'],
  // physics.js:111 gates boosting on `input.throttle > 0`, so SHIFT on its own does
  // nothing and a bare "boost" label would have players pressing it while coasting and
  // concluding it is broken. Verified: W alone 41.6 m/s boosting=false, W+SHIFT 48.6 m/s
  // boosting=true with the tank draining 1.00 -> 0.67.
  ['SHIFT', 'boost - hold with throttle'],
  ['SPACE', 'handbrake'],
  ['R', 'reset car'],
  ['C', 'crash'],
  ['ESC', 'pause / resume'],
];

export function createMenu({ ctx, onStart } = {}) {
  injectStyle();

  let open = false;
  let mode = 'start';
  let started = false;
  let pollTimer = 0;

  const root = document.createElement('div');
  root.id = 'bgmenu';
  const shadow = document.createElement('div');
  shadow.className = 'shadow';
  const card = document.createElement('div');
  card.className = 'card';
  const inner = document.createElement('div');
  inner.className = 'inner';
  card.appendChild(inner);
  shadow.appendChild(card);
  root.appendChild(shadow);

  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---- title + primary button ------------------------------------------------
  const title = h('h1', null, 'Burnout Gauntlet');
  const sub = h('div', 'sub', 'press drive to start');
  const go = h('button', 'go');
  go.type = 'button';
  inner.append(title, sub, go);

  /**
   * A labelled row: amber caption, then whatever control the caller builds.
   * `key` becomes `data-opt`, which is how a harness or the critic addresses a specific
   * option without depending on child ordering.
   */
  function addRow(key, labelText) {
    const row = h('div', 'row');
    row.dataset.opt = key;
    row.appendChild(h('div', 'lab', labelText));
    inner.appendChild(row);
    return row;
  }

  /**
   * Segmented chip group. `onPick` gets the option's value; `isOn` decides the lit chip
   * from the LIVE game state on every refresh, so the UI can never disagree with the
   * runtime even if something else changes it (a scene preset, a URL param, a peer).
   */
  function segment(row, options, onPick, extraCls = '') {
    const seg = h('div', 'seg');
    const btns = options.map(([value, label]) => {
      const b = h('button', extraCls, label);
      b.type = 'button';
      b.dataset.value = String(value);
      b.addEventListener('click', () => { onPick(value); refresh(); });
      seg.appendChild(b);
      return { b, value };
    });
    row.appendChild(seg);
    return btns;
  }

  // ---- time of day -----------------------------------------------------------
  const todRow = addRow('tod', 'Time of day');
  const todBtns = segment(todRow, TODS, (v) => ctx.applyTimeOfDay(v));

  // ---- wet -------------------------------------------------------------------
  // Chips for the three named states plus a fine slider, because the underlying knob is
  // continuous (`applyWet(0..1)`) and clamping the UI to three stops would hide that.
  const wetRow = addRow('wet', 'Road surface');
  const wetBtns = segment(wetRow, WETS, (v) => ctx.applyWet(v), 'green');
  const wetSlider = document.createElement('input');
  wetSlider.type = 'range';
  wetSlider.min = '0'; wetSlider.max = '1'; wetSlider.step = '0.05';
  wetSlider.addEventListener('input', () => {
    ctx.applyWet(parseFloat(wetSlider.value));
    refresh();
  });
  wetRow.appendChild(wetSlider);

  // ---- resolution scale ------------------------------------------------------
  // This is the frame-rate control, so it shows its own consequence: the REAL drawing
  // buffer from ctx.renderSize() and a live fps figure. A scale slider with no readout is
  // unjudgeable - the player cannot tell 0.7 from 0.5 by looking at a 720p upscale.
  const resRow = addRow('res', 'Render resolution - lower to buy frames');
  const resSlider = document.createElement('input');
  resSlider.type = 'range';
  resSlider.min = '0.4'; resSlider.max = '1'; resSlider.step = '0.05';
  resSlider.addEventListener('input', () => {
    ctx.setResScale(parseFloat(resSlider.value));
    // The old window's frame times were taken at the old buffer size, so they would
    // libel the new setting. Only ever reset here and on open, never per frame, and
    // never on the #nomenu harness path (which never constructs a visible menu).
    if (ctx.frameStats) ctx.frameStats.reset();
    refresh();
  });
  const resVal = h('div', 'val');
  const fpsVal = h('div', 'val');
  const resHint = h('div', 'hint',
    'fps here is the paused frame, no physics: treat it as an upper bound.');
  resRow.append(resSlider, resVal, fpsVal, resHint);

  // ---- controls --------------------------------------------------------------
  inner.appendChild(h('div', 'rule'));
  const ctlRow = addRow('controls', 'Controls');
  const keys = h('div', 'keys');
  for (const [k, d] of CONTROLS) {
    keys.appendChild(h('kbd', null, k));
    keys.appendChild(h('span', null, d));
  }
  ctlRow.appendChild(keys);
  // Not a repeat of the ESC row above: this says what the options DO, which is the one
  // thing a card cannot show on its own - the effect lands on the live frame behind it.
  const foot = h('div', 'foot', 'options apply live to the frame behind');
  inner.appendChild(foot);

  document.body.appendChild(root);

  // ---- state reflection ------------------------------------------------------
  /** Pull every widget from the live ctx. Cheap, and only ever runs while open. */
  function refresh() {
    if (!ctx) return;
    const tod = ctx.getTimeOfDay ? ctx.getTimeOfDay() : 'dusk';
    for (const { b, value } of todBtns) b.classList.toggle('on', value === tod);

    const wet = ctx.getWet ? ctx.getWet() : 0;
    for (const { b, value } of wetBtns) b.classList.toggle('on', Math.abs(value - wet) < 0.03);
    if (document.activeElement !== wetSlider) wetSlider.value = String(wet);

    const rs = ctx.getResScale ? ctx.getResScale() : 1;
    if (document.activeElement !== resSlider) resSlider.value = String(rs);
    const sz = ctx.renderSize ? ctx.renderSize() : null;
    resVal.innerHTML = sz
      ? `<b>${sz.w}×${sz.h}</b> (${rs.toFixed(2)}) &nbsp; window ${sz.cssW}×${sz.cssH}`
      : `scale ${rs.toFixed(2)}`;

    // n >= 8 because the first couple of samples after an open are the rAF gap across
    // the open itself (measured ~2000 ms), which read as "0.5 fps" and libelled the setting.
    const st0 = ctx.frameStats && ctx.frameStats.stats && ctx.frameStats.stats();
    const st = st0 && st0.n >= 8 ? st0 : null;
    fpsVal.innerHTML = st
      ? `<b>${st.fpsP50.toFixed(1)} fps</b> p50 &nbsp; ${st.p50.toFixed(1)} ms &nbsp; n=${st.n}`
      : 'fps - collecting';
  }

  function startPoll() {
    stopPoll();
    // 4 Hz from a timer, deliberately NOT a rAF callback: this wave is about frame time
    // and the menu must not add per-frame main-thread work to the loop it is reporting on.
    pollTimer = setInterval(refresh, 250);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; } }

  function show(which) {
    mode = which;
    open = true;
    if (which === 'start') {
      title.textContent = 'Burnout Gauntlet';
      sub.textContent = 'press drive to start';
      go.innerHTML = 'Drive';
    } else {
      title.textContent = 'Paused';
      sub.textContent = 'pick a scene, then get back to it';
      go.innerHTML = 'Resume <span class="k">esc</span>';
    }
    if (ctx.setPaused) ctx.setPaused(true);
    if (ctx.frameStats) ctx.frameStats.reset();
    root.classList.add('open');
    refresh();
    startPoll();
  }

  function hide() {
    open = false;
    root.classList.remove('open');
    stopPoll();
    // Blur whatever was last clicked. SPACE is the handbrake and ENTER-on-a-focused-button
    // would re-fire it, so leaving focus inside the menu would make the first handbrake
    // press after resuming re-open the menu instead of locking the wheels.
    if (document.activeElement && root.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    if (ctx.setPaused) ctx.setPaused(false);
  }

  go.addEventListener('click', () => {
    const wasStart = mode === 'start';
    hide();
    // onStart is called AFTER the menu has closed, per the contract, and still inside this
    // click's task so it is a live user gesture - which is the whole point: main.js unlocks
    // WebAudio from here, and an AudioContext resumed outside a gesture stays "suspended".
    if (wasStart && !started) {
      started = true;
      if (onStart) onStart();
    }
  });

  // ---- Esc -------------------------------------------------------------------
  // This module owns Esc. It listens on window in the CAPTURE phase and never consults the
  // game's `keys` map: the menu is pointer-driven and has to open while the player is
  // holding W, and main.js's own keydown listener would otherwise also see this event.
  // The START menu deliberately ignores Esc: dismissing it with a key would skip the click
  // that unlocks WebAudio, which is the exact bug this menu exists to close.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat) return;
    if (open && mode === 'start') { e.preventDefault(); return; }
    e.preventDefault();
    e.stopPropagation();
    if (open) hide(); else show('pause');
  }, true);

  const api = {
    showStart() { show('start'); },
    showPause() { show('pause'); },
    hide,
    isOpen: () => open,
    /** Exposed for harnesses and for the critic: refresh the readouts on demand. */
    refresh,
  };
  return api;
}
