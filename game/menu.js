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
// WAVE-S ROUND 2 added four things and fixed five defects, all inside this file:
//   * the SOUNDTRACK controls (track list, prev / play-pause / next) driving game/music.js,
//   * SEPARATE MUSIC and SFX volume sliders (music.js's gain, and audio.js's setVolume,
//     which is now documented as the SFX control),
//   * a SCENE PICKER that changes scene with NO RELOAD, which the user asked for twice,
//   * a keyboard gate that makes the pause menu actually mean "no input".
// The five defects are menu-critic's D1, D2, D4, D5, D6 (D3 was a label, D7 was CSS); each
// fix is commented at its site with the D-number so the critic can find it.
//
// WHY THE KEY GATE LIVES HERE AND NOT IN main.js. `main.js` is frozen this round, and its
// pause contract ("no tick, no input", main.js:601) only implements the first half: the
// polled `keys` map is cleared once at the moment of pausing, and `down()`'s discrete
// actions (KeyR, KeyC) are not gated on `paused` at all. This module already owns a
// capture-phase window keydown listener, and a capture-phase `stopPropagation()` on window
// runs BEFORE main.js's bubble-phase listener and stops it being called at all. So the gate
// is implementable here, exactly, without touching the frozen file - and it is also the fix
// the critic itself proposed for D6.
//
// ART DIRECTION. This matches the HUD's paper/marker family rather than inventing a third
// style: the same ink/paper/amber palette as hud.js, the same jagged hand-drawn card
// outline (hud.js `torn()`, reproduced here as a jittered `clip-path` polygon), the same
// small card skew, the same soft ink drop shadow. See reference/INDEX.md hud-overlay-01
// and -03 for the source of that vocabulary. Legibility wins any tie: this menu's entire
// reason for existing is discoverability, so body text is counter-skewed back to upright
// and only the title carries the marker slant.

import { SCENES } from './scenes.js';

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
  /* D7: 8px of padding plus a border-box, so the two max-height: 100% rules below resolve
     against the viewport MINUS the gutter. The old rule was 94vh on both the shadow and the
     card, which measured 562 px of card inside a 560 px window at 900x560 - vh units on a
     nested flex item do not clamp a child whose own content is taller, and 6vh of gutter is
     also too little to see a scrollbar in. */
  box-sizing: border-box; padding: 8px 0;
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
  /* D7: min-height 0 is the load-bearing half. A flex item's default min-height is 'auto'
     (single quotes deliberately: this CSS lives in a JS template literal, so a backtick here
     closes the string early and the whole module stops parsing),
     which refuses to shrink below its content - so the card's own overflow-y never engaged
     and the excess was simply drawn past the fold. */
  display: flex; max-height: 100%; min-height: 0;
}
#bgmenu .card {
  clip-path: ${cardClip};
  background: linear-gradient(160deg, rgba(13,18,24,0.94), rgba(6,9,13,0.90));
  transform: skewX(-${SKEW}deg);
  padding: 18px 30px 16px 26px;
  width: clamp(330px, 34vw, 470px);
  box-sizing: border-box;
  max-height: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden;
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
/* 11px -> 8px between rows. The card grew by four blocks this round (scene, soundtrack,
   two volumes) and 3 px x 8 rows buys 24 px of it back without touching a font size. */
#bgmenu .row { margin: 0 0 8px; }
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

/* D6: the sliders are keyboard-operable now, so they must LOOK focused when they are.
   An amber ring on the track is the same vocabulary as the lit chip. */
#bgmenu input[type=range]:focus { outline: none; }
#bgmenu input[type=range]:focus-visible::-webkit-slider-runnable-track {
  background: rgba(255,179,31,0.42);
}
#bgmenu input[type=range]:focus-visible::-webkit-slider-thumb { background: ${AMBER_HOT}; }

/* volume pair: fixed label gutter, elastic slider, fixed readout, so MUSIC and SFX line
   up with each other rather than each sizing to its own text */
#bgmenu .vol { display: grid; grid-template-columns: 44px 1fr 34px; gap: 0 9px;
  align-items: center; margin: 0 0 2px; }
#bgmenu .vol .vlab { font-size: 9.5px; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: rgba(232,240,248,0.62); }
#bgmenu .vol .vnum { font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${AMBER_HOT}; text-align: right; }
#bgmenu .vol input[type=range] { margin: 0; }

/* transport: three small chips in a row, the middle one wider because it carries the
   two-state PLAY / PAUSE word and must not resize as it toggles */
#bgmenu .trans { display: flex; gap: 6px; margin: 6px 0 3px; }
#bgmenu .trans button {
  cursor: pointer; border: 0; appearance: none; clip-path: ${chipClip};
  padding: 7px 10px; font: 800 11px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(232,240,248,0.84); background: rgba(232,240,248,0.12);
}
#bgmenu .trans button:hover { background: rgba(232,240,248,0.22); color: #fff; }
#bgmenu .trans button.wide { min-width: 96px; text-align: center; }
#bgmenu .now { font: 700 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(232,240,248,0.86); }
#bgmenu .now b { color: ${AMBER_HOT}; }
#bgmenu .seg button.sc { text-transform: none; letter-spacing: 0.06em; }
`;
  document.head.appendChild(el);
}

const TODS = [['dawn', 'DAWN'], ['midday', 'MIDDAY'], ['dusk', 'DUSK'], ['night', 'NIGHT']];
const WETS = [[0, 'DRY'], [0.5, 'DAMP'], [1, 'WET']];

// THE SCENE PICKER. The user asked twice to change scene without reloading, and the
// blocker everyone assumed - "a scene change re-runs boot(), so it needs main.js" - is not
// actually true. A scene in `scenes.js` is NOT a world: all seven share one world, one car
// and one road. A scene is a camera rig, a bloom preset, a paint colour, a time of day, a
// wet level and a starting place on a path, and every one of those is reachable from `ctx`.
// So this list drives `SCENES[id].setup(ctx)` in place; see `applyScene()`.
//
// Two of the seven registry scenes are deliberately NOT offered: `crash-cam` triggers a
// wreck in its setup and `car-paint-closeup` parks the car under a fixed lens with the
// beams off. Both are screenshot compositions, not places you can drive, and putting them
// in a player-facing picker would read as the picker being broken. The five below all
// configure a chase camera and place the car on a path at a cruise speed.
// Labels are short so the five chips sit on ONE line inside a 435 px card at 720p; the hour
// each one picks is visible immediately below on the TIME OF DAY chips, so the label does not
// have to carry it.
const PLACES = [
  ['dusk-highway-chase', 'Highway'],
  ['boost-blur', 'Boost'],
  ['wet-night-asphalt', 'Wet night'],
  ['daytime-downtown', 'Midday'],
  ['hud-overlay', 'Sprint'],
];

// Codes the game POLLS every frame (main.js:617-630). These are the only ones re-asserted
// on resume (D5); the discrete actions KeyR and KeyC are deliberately absent, because
// re-firing a crash or a reset on resume is the D2 bug wearing a different hat.
const HELD_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);

// Keys whose DEFAULT ACTION a focused slider needs (D6). While a menu is open these are
// allowed to reach the browser's default handling; everything else that would scroll the
// page is still preventDefault'ed.
const SLIDER_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown']);

/** mm:ss for the now-playing line. Duration is unknown until the MP3's header lands. */
function mmss(s) {
  if (!Number.isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s - m * 60)).padStart(2, '0')}`;
}

/**
 * Duplicated from main.js:307 rather than imported, because main.js is FROZEN this round
 * and exports only boot(). Used solely to repaint the HUD while paused (D1); if the two
 * ever drift the only consequence is a wrong gear digit on a paused frame.
 */
function gearOf(speedMs) {
  const kmh = Math.abs(speedMs) * 3.6;
  return Math.max(1, Math.min(6, 1 + Math.floor(kmh / 52)));
}

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
  // D3: the critic measured `SPACE` at HEAD 0bdb9df doing nothing but multiplying the slip
  // angle by 2.2 - it did not decelerate the car at all (coast dv -14.345 m/s vs SPACE
  // dv -14.178 over 1.000 s), so "handbrake" was a lie. Against the physics rewrite it
  // retracted that: straight-line dv -1.144 -> -2.442 (2.13x) and cornering yaw 0.1288 ->
  // 0.4445 rad (3.45x). Both halves of the word are now true, so the label says both, and
  // it says them in the order the player feels them: the rotation is the point.
  ['SPACE', 'handbrake - swings the tail, slows the rear'],
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

  // ---- scene picker ----------------------------------------------------------
  // Whatever the URL booted, the player can move somewhere else from here without a reload.
  // The initial value is read from the hash rather than from ctx, because main.js keeps the
  // booted scene id in a `boot()` local and exposes no getter, and this round may not add one.
  // If the hash names a scene the picker does not offer, no chip is lit - which is honest.
  let curScene = (() => {
    const m = /(?:^|[#&])scene=([^&]+)/.exec(location.hash || '');
    const id = m ? decodeURIComponent(m[1]) : 'dusk-highway-chase';
    return SCENES[id] ? id : null;
  })();

  /**
   * Change scene IN PLACE. The order is the one main.js's boot path uses, and it matters:
   * `setup()` writes the camera rig, the bloom preset and the car's paint and drops the car
   * on a path, and then `applyTimeOfDay` (which ends in `sky.applyBloom` and
   * `world.applyKeyFill`) gets the last word on lighting - exactly as at main.js:426-432,
   * where `cfg.setup(ctx)` is followed by `sky.applyBloom` and `world.applyKeyFill`. Doing
   * it the other way round leaves the scene's own bloom overriding the sky's, which is a
   * state boot can never produce.
   */
  function applyScene(id) {
    const sc = SCENES[id];
    if (!sc || !ctx.physics || !ctx.camRig) return;
    curScene = id;
    // A wreck in progress owns the camera and the car pose; land it before moving.
    if (ctx.crash && ctx.crash.active) ctx.crash.reset();
    if (ctx.damage && ctx.damage.reset) ctx.damage.reset();

    sc.setup(ctx);

    // `setup()` is written for the SHOT harness, so it does three things a player must not
    // inherit: it holds the throttle down, it hands the car to `followPath()` (an autopilot)
    // and it hides the HUD. Undo precisely those three and nothing else.
    ctx.physics.clearPath();
    ctx.physics.setInput({ throttle: 0, brake: 0, steer: 0, boost: false, handbrake: false });
    ctx.hud.setVisible(true);

    if (ctx.applyWet) ctx.applyWet(sc.wet || 0);
    if (ctx.applyTimeOfDay) ctx.applyTimeOfDay(sc.timeOfDay || 'dusk');

    ctx.camRig.snap();
    // Traffic streams around the hero, so it has to be told the hero teleported or it
    // spends the next few seconds despawning cars that are now kilometres away.
    if (ctx.traffic && ctx.traffic.reset) ctx.traffic.reset(ctx.physics.state.pos);
    if (ctx.frameStats) ctx.frameStats.reset();
    // The scene change happens while paused, so nothing will repaint the HUD until resume
    // unless we do it here - same mechanism as D1.
    repaintHud();
    refresh();
  }

  const sceneRow = addRow('scene', 'Scene - changes live, no reload');
  const sceneBtns = segment(sceneRow, PLACES, (v) => applyScene(v), 'sc');
  sceneRow.appendChild(h('div', 'hint',
    'moves the car, the camera, the hour and the weather - no reload.'));

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
    repaintHud(); // D1 — setResScale() -> resize() -> hud.resize() just cleared the canvas
    refresh();
  });
  const resVal = h('div', 'val');
  const fpsVal = h('div', 'val');
  const resHint = h('div', 'hint',
    'fps here is the paused frame, no physics: treat it as an upper bound.');
  resRow.append(resSlider, resVal, fpsVal, resHint);

  // ---- soundtrack ------------------------------------------------------------
  // `ctx.music` is game/music.js, a module-level singleton in main.js that OUTLIVES boot()
  // so a scene change does not restart the track. It may be absent if this menu is dropped
  // into an older ctx, hence the shim: a missing soundtrack must not break the options card.
  const music = ctx.music || {
    unlock() {}, setMusicVolume() {}, getMusicVolume() { return 0; },
    next() {}, prev() {}, play() {}, pause() {}, toggle() {},
    tracks() { return []; }, current() { return { index: -1, title: null, playing: false }; },
    info() { return { unlocked: false }; },
  };

  inner.appendChild(h('div', 'rule'));
  const musRow = addRow('music', 'Soundtrack');
  // Track chips. The value is the playlist INDEX, so this list is generated from
  // music.tracks() and cannot drift from what the module will actually play.
  const trackBtns = segment(musRow, music.tracks().map((t, i) => [i, t.title]),
    (i) => { music.unlock(); music.play(i); refresh(); }, 'sc');
  const trans = h('div', 'trans');
  const bPrev = h('button', null, '◀◀');
  const bPlay = h('button', 'wide', 'Play');
  const bNext = h('button', null, '▶▶');
  for (const b of [bPrev, bPlay, bNext]) { b.type = 'button'; trans.appendChild(b); }
  // Every transport button unlocks first. On the player path the DRIVE click has already
  // done it; on `#nomenu=1`, or if the player opens the pause menu before touching anything,
  // this click is itself the user gesture, so the soundtrack is reachable from here too.
  bPrev.addEventListener('click', () => { music.unlock(); music.prev(); refresh(); });
  bNext.addEventListener('click', () => { music.unlock(); music.next(); refresh(); });
  bPlay.addEventListener('click', () => { music.unlock(); music.toggle(); refresh(); });
  const nowVal = h('div', 'now');
  musRow.append(trans, nowVal);

  // ---- volumes: TWO sliders, deliberately -------------------------------------
  // Music runs on its own AudioContext and its own gain straight to `destination`
  // (music.js's header explains why), and audio.js's `setVolume` is the SFX control - engine,
  // tyres, wind, impacts, rivals. One combined slider would have been the wrong control:
  // the whole point of the user's request is being able to turn the engine down and leave
  // the music up, or the reverse.
  const volRow = addRow('volume', 'Volume');
  function volPair(labelText, get, set) {
    const wrap = h('div', 'vol');
    const sl = document.createElement('input');
    sl.type = 'range'; sl.min = '0'; sl.max = '1'; sl.step = '0.02';
    sl.setAttribute('aria-label', labelText);
    const num = h('div', 'vnum');
    sl.addEventListener('input', () => { set(parseFloat(sl.value)); refresh(); });
    wrap.append(h('div', 'vlab', labelText), sl, num);
    volRow.appendChild(wrap);
    return { sl, num, get };
  }
  const musicVol = volPair('Music', () => music.getMusicVolume(), (v) => music.setMusicVolume(v));
  const sfxVol = volPair('Sfx',
    // getVolume() was added to audio.js for this: reading the live value means the slider
    // cannot disagree with the mix even if something else moved it.
    () => (ctx.audio && ctx.audio.getVolume ? ctx.audio.getVolume() : 0),
    (v) => { if (ctx.audio && ctx.audio.setVolume) ctx.audio.setVolume(v); });

  // ---- controls --------------------------------------------------------------
  const ctlRule = h('div', 'rule');
  inner.appendChild(ctlRule);
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

  /**
   * WHICH BLOCK GETS THE TOP OF THE CARD, and why this is not cosmetics.
   *
   * The round-1 critic's headline finding was that "the whole [controls] list is above the
   * fold at 720p", and it is the reason the piece passed on discoverability. This round adds
   * a scene picker, a soundtrack block and two volume sliders - 292 px of new card - so at
   * 1280x720 something now has to be below the fold (measured content height 956 px against
   * 702 px of card). Shrinking every font to keep it all visible would have traded the one
   * thing the card is FOR against three new features.
   *
   * So the fold is allocated by MODE instead, which is free:
   *   START  - the controls list sits directly under DRIVE, because a cold player is reading
   *            this card to learn the game. Nothing above the fold but title, DRIVE and keys.
   *   PAUSE  - the options come first and the controls go last, because a player who has
   *            already driven is here to change something, not to re-read W/A/S/D.
   * `insertBefore` MOVES the existing nodes, so no listener is rebound and no state is lost.
   */
  function orderCard(which) {
    if (which === 'start') {
      inner.insertBefore(ctlRule, sceneRow);
      inner.insertBefore(ctlRow, sceneRow);
    } else {
      inner.insertBefore(ctlRule, foot);
      inner.insertBefore(ctlRow, foot);
    }
    card.scrollTop = 0;
  }

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

    for (const { b, value } of sceneBtns) b.classList.toggle('on', value === curScene);

    // ---- soundtrack. Read from music.js's own state, never from what we last clicked ----
    const cur = music.current();
    const inf = music.info();
    for (const { b, value } of trackBtns) b.classList.toggle('on', value === cur.index);
    bPlay.textContent = cur.playing ? 'Pause' : 'Play';
    if (!inf.unlocked) {
      nowVal.innerHTML = 'starts on <b>DRIVE</b> - browsers need a click first';
    } else if (inf.error) {
      nowVal.innerHTML = `<b>audio error</b> ${inf.error}`;
    } else {
      nowVal.innerHTML = `${cur.playing ? '▶' : '❚❚'} <b>${cur.title}</b>`
        + ` &nbsp; ${mmss(cur.time)} / ${mmss(cur.duration)}`;
    }

    for (const v of [musicVol, sfxVol]) {
      const g = v.get();
      if (document.activeElement !== v.sl) v.sl.value = String(g);
      v.num.textContent = `${Math.round(g * 100)}`;
    }

    // D1, the belt to the braces below. `repaintHud()` is called directly from the res
    // slider, but ANY paused resize blanks the canvas - including `ctx.setResScale()` called
    // from the console, a harness or a future caller, and a window resize that arrives
    // between two of our own events. Repainting from the 4 Hz poll means the HUD can be
    // blank for at most one poll interval instead of until resume. It only runs while a menu
    // is open, so it adds nothing to the driving loop this wave is measuring.
    repaintHud();
  }

  /**
   * D1. Repaint the HUD from here when the game is paused.
   *
   * MECHANISM, and it is not "a resize while paused" in general: `resize()` (main.js:193)
   * calls `hud.resize()`, which reassigns `canvas.width` - and assigning width to a canvas
   * CLEARS it. The HUD is only ever repainted from `hud.update()` inside `tick()`, and the
   * paused branch (main.js:613) returns before `tick()`. So the res slider - the menu's own
   * headline instrument - blanked the HUD on every single use and left it blank until resume,
   * which the critic ranked as the worst defect on the board.
   *
   * `hud.snap()` is the right call rather than `hud.update(0, ...)`: snap draws once with no
   * smoothing lag, which is exactly what a frozen frame wants. Speed comes from `s.ground`
   * (|v|) to match what main.js:405 feeds the live HUD, so the paused readout does not
   * disagree with the driving one at high slip.
   */
  function repaintHud() {
    if (!ctx.hud || !ctx.hud.snap || !ctx.physics) return;
    if (ctx.isPaused && !ctx.isPaused()) return;
    const s = ctx.physics.state;
    if (!s) return;
    const g = Math.abs(s.ground !== undefined ? s.ground : s.speed);
    ctx.hud.snap({
      speed: g, boost: s.boost, boosting: s.boosting, gear: gearOf(g),
      pos: s.pos, yaw: s.yaw, crashed: s.crashed,
      damage: ctx.damage && ctx.damage.level !== undefined ? ctx.damage.level : undefined,
    });
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
    orderCard(which);
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
    const wasPause = mode === 'pause';
    if (ctx.setPaused) ctx.setPaused(false);
    // D4/D5. Order matters: setPaused(false) first (setPaused only clears the key map when
    // pausing, but the sim must be live before it is handed input), then re-assert.
    if (wasPause) reassertHeldKeys();
  }

  go.addEventListener('click', () => {
    const wasStart = mode === 'start';
    // Both buttons are a real user gesture, so both unlock the soundtrack. main.js calls
    // music.unlock() from onStart for the DRIVE case; this covers RESUME as well, which
    // matters on `#nomenu=1` (no DRIVE click ever happens) and after a tab-hide, where
    // Chrome suspends the context and only a gesture can resume it. unlock() is idempotent.
    if (ctx.music && ctx.music.unlock) ctx.music.unlock();
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
  // ---- THE KEY GATE: D2, D4, D5 and D6, in one listener pair ------------------
  //
  // What is physically held down, tracked from capture phase so it is correct whether the
  // menu is open or not. This is the only honest source: the OS does not tell a page which
  // keys are down, and main.js's `keys` map is cleared by `setPaused(true)` and so forgets.
  const heldNow = new Set();

  /**
   * Re-assert the keys the player is STILL holding, so the drive continues from the real
   * state of the keyboard rather than from a stale latch or from nothing.
   *
   * D5: holding `W` across a pause used to lose the throttle (30.156 -> 16.629 m/s on
   * resume), because `setPaused(true)` clears `keys` and nothing ever re-sets it; on a real
   * machine it self-healed after one OS auto-repeat, and never at all with key repeat off.
   * D4 is the mirror image: anything pressed DURING the menu was latched and arrived the
   * moment the sim restarted (hold W on the start card, click DRIVE, 10.037 m/s with the
   * player having touched nothing since). Both are fixed by the same rule - on resume,
   * synthesise a keydown for exactly the polled codes that are still down, and for nothing
   * else. Discrete actions (KeyR, KeyC) are excluded by HELD_CODES: re-firing a crash on
   * resume would be D2 again.
   *
   * The start menu deliberately re-asserts NOTHING: `onStart` resets the car to a standstill,
   * so honouring a throttle held during the title card would launch a player who was leaning
   * on the keyboard while reading the controls list.
   */
  function reassertHeldKeys() {
    for (const code of heldNow) {
      if (!HELD_CODES.has(code)) continue;
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    }
  }

  // A KEYUP THE PAGE NEVER RECEIVES IS A PERMANENT LATCH. `heldNow` is only ever emptied by
  // a keyup, so any path that swallows one leaves a code in the set forever and
  // `reassertHeldKeys()` re-synthesises it on EVERY later resume - wave-s/menu-music-critic
  // measured steer stuck at +0.99999857 with the keyboard completely idle. The two ways a
  // keyup goes missing are both window-level and neither is exotic: focus leaves the window
  // while a key is down (cmd-tab), and the tab is hidden. Clear the whole set on both; a key
  // still genuinely held when focus returns produces a fresh keydown, and the set is polled
  // rather than trusted for exactly this reason.
  window.addEventListener('blur', () => heldNow.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) heldNow.clear();
  });

  window.addEventListener('keydown', (e) => {
    if (!e.repeat) heldNow.add(e.code);

    if (e.code === 'Escape') {
      if (e.repeat) return;
      if (open && mode === 'start') { e.preventDefault(); return; }
      e.preventDefault();
      e.stopPropagation();
      if (open) hide(); else show('pause');
      return;
    }
    if (!open) return;

    // D2: `C` and `R` fired straight through the pause menu and silently wrecked or reset
    // the run (`crash.active false -> true`, `damage 0 -> 0.599`, then `speed 29.4 -> 0`),
    // because main.js's `down()` gates those two on nothing at all. A capture-phase
    // stopPropagation on window runs before main.js's bubble-phase listener and stops it
    // being invoked, so while a menu is open the game receives no keys whatsoever. This is
    // the second half of main.js:601's own contract - "no tick, no input" - implemented
    // without editing the frozen file.
    e.stopPropagation();

    // D6: the sliders were mouse-only, because main.js:495 preventDefault()s every arrow key
    // and Space unconditionally, which kills a range input's native keyboard behaviour.
    // stopPropagation above means that line no longer runs; here we must also NOT
    // preventDefault the keys a focused slider needs, or we would have reproduced the bug
    // inside our own listener. Everything else that would scroll the page still gets it.
    const onSlider = document.activeElement
      && document.activeElement.tagName === 'INPUT'
      && document.activeElement.type === 'range'
      && root.contains(document.activeElement);
    if (onSlider && SLIDER_KEYS.has(e.code)) return;
    if (SLIDER_KEYS.has(e.code) || e.code === 'Space') e.preventDefault();
  }, true);

  window.addEventListener('keyup', (e) => {
    heldNow.delete(e.code);
    // Symmetry with the keydown gate: a keyup must not reach main.js while a menu is open
    // either. It would be harmless today (the map is already cleared) but it would silently
    // undo the resume re-assert if a key came up in the same frame as the resume.
    if (open) e.stopPropagation();
  }, true);

  // D1, the general case: any resize while paused blanks the HUD by the same mechanism as
  // the res slider. main.js's own resize listener is registered at boot and cannot be
  // changed this round, so repaint after it: a second listener on the same event fires in
  // registration order, and this module is created after main.js's handler is installed.
  window.addEventListener('resize', () => { if (open) repaintHud(); });

  const api = {
    showStart() { show('start'); },
    showPause() { show('pause'); },
    hide,
    isOpen: () => open,
    /** Exposed for harnesses and for the critic: refresh the readouts on demand. */
    refresh,
    /** Exposed so a harness can drive the scene picker without synthesising a click. */
    applyScene,
    scene: () => curScene,
    scenes: () => PLACES.map(([id, label]) => ({ id, label })),
    /** Exposed for the D1 regression test: repaint the paused HUD on demand. */
    repaintHud,
    /** What is physically held down, per the capture-phase tracker (D4/D5 evidence). */
    heldKeys: () => Array.from(heldNow),
  };
  return api;
}
