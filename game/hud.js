// hud.js — 2-D canvas overlay in the Burnout Paradise idiom: a hero boost bar
// bottom-left, a rolling speedometer, a rotating street minimap bottom-right,
// centre-screen event banners and a crash/damage state.
//
// API: createHud(container, {layout, maxPixelRatio, attached}) -> hud
//   hud.canvas                       the overlay canvas (device-resolution)
//   hud.resize(w, h)                 CSS pixels; internally scaled by devicePixelRatio
//   hud.setVisible(bool) / hud.visible
//   hud.setAttached(bool) / hud.attached    is this canvas a DOM compositing layer?
//   hud.generation                   bumped by every draw(); an uploader's dirty flag
//   hud.update(dt, state)            state = {speed, boost, boosting, rpm01, gear,
//                                             pos, yaw, crashed, damage, chain}
//   hud.snap(state)                  deterministic single frame, no smoothing lag
//   hud.banner(text, secs)           big centred event type
//
// Design notes
//   * One layout scale S = min(W/1920, H/1080) drives every dimension, so the HUD
//     is identical in proportion at any resolution and never grows on ultrawide.
//   * All type is drawn from system faces through drawType(), which applies its own
//     horizontal condense + oblique shear so the result does not depend on a
//     "Arial Narrow"-class face being installed, and always carries an ink outline
//     plus a soft drop shadow so it survives a blown-out sky behind it.
//   * Animated quantities are eased with damp() (frame-rate independent) rather than
//     drawn from the raw sim value; snap() writes them directly for screenshots.

import { clamp, lerp, smoothstep, damp } from './util.js';

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
const INK = 'rgba(4,7,10,0.92)';
const INK_SOFT = 'rgba(4,7,10,0.55)';
const PAPER = 'rgba(232,240,248,0.95)';
const AMBER = '#ffb31f';
const AMBER_HOT = '#ffd34a';

// Boost states. The reference bar is a blown-out flame, not a green LED: at its
// core it clips toward yellow-white (238,250,166 -> R/G 0.95, luma ~245) and only
// the outermost fringe stays chlorophyll green. Anything with R/G near 0.5 reads
// as a battery gauge, so every core/tip here is deliberately warm.
// The rails are pushed to a much purer green (green-excess ~100 at the rail, which
// blurs down to the reference's ~60 peak) while the tips carry more blue so the
// core measures 238-245 / 248-251 / 192-207 like the reference rather than the
// yellow 223,234,154 of r5.
// r8: the TIPS lost blue (#ebf5cf -> #ebf5b9, #d4e69a -> #d4e68e). That is the
// half of the r7 `saturate(1.65)` that was doing real work, moved into the ramp
// where it belongs. The filter crushed the rail stop's blue to zero (#5fc51c went
// through it as 51,219,0) AND pulled the core's blue down 203 -> 173; deleting it
// restored an honest rim but left the core 19 too blue, so the core/tip stops now
// carry that correction themselves. The rail stops are UNCHANGED: measured with
// the filter gone they land the rim at 113.6,154.8,75.1 sat 0.515 B/G 0.485
// against hud-overlay-03's 94.6,154.2,74.3 sat 0.519 B/G 0.481, so the acid lime
// was never the authored colour - it was the filter.
const C_CHARGE = { core: '#c2d878', edge: '#48ad0c', tip: '#dcebb4', glow: 'rgba(190,240,120,0.55)' };
const C_READY = { core: '#d4e68e', edge: '#5fc51c', tip: '#ebf5b9', glow: 'rgba(215,250,150,0.9)' };
const C_BURN = { core: '#e6f4bc', edge: '#8ade2c', tip: '#f8ffe8', glow: 'rgba(236,255,190,1.0)' };
const C_CHAIN = { core: '#ffb347', edge: '#e2761b', tip: '#fff2cd', glow: 'rgba(255,150,40,0.95)' };
const C_DEAD = { core: '#4a5560', edge: '#232a31', tip: '#78848f', glow: 'rgba(0,0,0,0)' };
// Denied flash: a boost press the full-bar rule refused. Amber, not red - it means
// "not full yet", not "broken".
const C_DENIED = { core: '#ffcf5e', edge: '#d98a12', tip: '#ffe9b0', glow: 'rgba(255,190,70,0.9)' };

// Additive bloom for the flame: [blur radius as a fraction of the body height,
// weight]. Radii are relative so the halo keeps its reach at any resolution.
// The third element marks a pass that is drawn from the green silhouette copy.
//
// r7: these are drawn UNDER the crisp body, not over it (see the composite at the
// end of drawBoost), so they are pure halo and never re-soften the silhouette.
// The widest radius came down 0.44 -> 0.18 at the same time: a 0.44 bar-height
// blur throws light ~0.55 bar-heights clear of the rails, which measured a 10-90
// rail transition of 2.9% of frame height against 1.6-1.7% in the reference. Even
// behind an opaque body that tail is what the measurement sees.
const BOOST_BLOOM = [[0.18, 0.20, true], [0.075, 0.14], [0.030, 0.14]];

// Boost fraction at which the bar reads as fireable. WAS 0.34, which lied: physics.js's
// full-bar rule (boost >= 0.999) is the actual gate, so the bar pulsed "ready" at a third
// of a tank and the button did nothing - the exact "I press boost and nothing happens"
// report. 0.97 keeps the smoothstep window while reading full-only.
const READY_AT = 0.97;
const STREETS_EW = ['GLANCEY', 'HAMILTON', 'LAMBERT', 'ROOT', 'ANGUS', 'MANNERS', 'NAKAMURA'];
const STREETS_NS = ['PARADISE', 'MORTON', 'YOUNG', 'HARBER', 'FRY', 'WEBSTER', 'CRAWFORD'];
// The reference street plate never stands alone: it always carries the objective's
// name under it and the distance to it under that, all three sharing one ink splat
// (hud-overlay-03: "GLANCEY AV" / "THE WILDCATS STADIUM" / "0,7 KM").
const LANDMARKS = [
  'THE WILDCATS STADIUM', 'PARADISE WHARF', 'THE OBSERVATORY', 'CRYSTAL SUMMIT',
  'THE AUTO YARD', 'WEST ACRES MALL', 'HARBOUR TOWN DOCKS', 'THE WIND FARM',
];

/** Two-stage ease used by every "punch" animation: overshoot in, glide out. */
const easeOutBack = (t) => {
  const c = 1.9;
  const u = t - 1;
  return 1 + u * u * ((c + 1) * u + c);
};

export function createHud(container, { layout, maxPixelRatio = 1, attached = true } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // ---- WHETHER THIS CANVAS IS A DOM LAYER, AND WHY THAT TURNED OUT NOT TO MATTER ------------
  //
  // `attached: false` keeps this canvas OUT of the document, so it is not a compositing layer;
  // main.js then mirrors it into a texture and composites it inside the WebGL frame (`#hudgl=1`).
  // That route was built because two rounds of profiling concluded the HUD's 2.20-2.50 ms was the
  // browser compositing a second full-screen layer every frame. **It is not, and the measurement
  // is in main.js beside the code: a full-screen 2-D canvas that is in the document but is not
  // REDRAWN costs 0.00 ms.** The whole cost is the redraw, both routes pay it, and the in-frame
  // route pays 0.70-1.40 ms more because it uploads the canvas itself. So the DOM layer is still
  // the default and this option exists measured rather than argued.
  //
  // Either way nothing about the DRAWING changes. This is a lot of tuned canvas code with a real
  // reference plate behind it, so the 2-D canvas stays the authoring surface and only its route
  // to the screen moves; that is what keeps the option lossless.
  //
  // `setAttached()` is live at runtime because the choice is not static: main.js falls back to the
  // DOM layer whenever the HUD's backing store and the drawing buffer differ in size (resScale
  // below 1, or `#hudres=2`), because compositing in-frame at a lower resolution than the window
  // would soften the HUD, which main.js has an explicit recorded decision against.
  let inDom = false;
  function setAttached(v) {
    const want = !!v;
    if (want === inDom) return;
    inDom = want;
    if (want) container.appendChild(canvas);
    else canvas.remove();
  }
  setAttached(attached);

  let W = 1920, H = 1080, S = 1, dpr = 1, visible = true;

  // Bumped by every completed draw(). A consumer that uploads this canvas to the GPU uses it to
  // upload ONLY when the pixels actually changed — which is what makes the paused path, where
  // nothing redraws, cost nothing at all.
  let gen = 0;

  // eased display values
  let shownSpeed = 0;      // km/h
  let shownBoost = 0;      // 0..1
  let readyPulse = 0;      // 0..1 glow on the charged state
  let burnMix = 0;         // 0..1 blend into the "burning" look
  let deniedMix = 0;       // 0..1 denied-press flash, driven by physics' boostDenied pulse
  let chainMix = 0;        // 0..1 blend into the burnout-chain look
  let damageMix = 0;       // 0..1 body damage
  let crashMix = 0;        // 0..1 wrecked overlay
  let hitFlash = 0;        // impact frame flash
  let t = 0;               // HUD clock, seconds

  // chain tracking (self-derived when the sim does not supply state.chain)
  let chain = 1, chainArmed = false, offBoostFor = 9;
  let wasCrashed = false;

  // banner
  let bannerText = '', bannerT = 0, bannerLife = 1;

  // cached geometry, rebuilt on resize
  let barGeo = null;
  const flameTex = makeFlameTexture();
  const frayTex = makeFrayTexture();
  const grainTex = makeGrainTexture();

  // -------------------------------------------------------------------------
  // sizing
  // -------------------------------------------------------------------------
  function resize(w, h) {
    W = Math.max(2, Math.round(w));
    H = Math.max(2, Math.round(h));
    // THE BACKING STORE, AND IT WAS THE WAVE'S OWN FOUNDING BUG IN A SURFACE NOBODY RE-CHECKED.
    //
    // This used to be `clamp(devicePixelRatio, 1, 3)` unconditionally. `devicePixelRatio` is 2 on
    // the machine this project is developed and played on, so a 1280x720 window gave the HUD a
    // 2560x1440 canvas — **four times the pixels of the 3-D frame it is drawn over**, because
    // main.js caps the renderer's pixel ratio to `resScale` (session 16's fix) and the WebGL buffer
    // is exactly 1280x720. Measured on the player's real configuration, viewport 1280x720 with
    // `deviceScaleFactor 2`, GL drawing buffer asserted at 1280x720 ratio 1 the whole time
    // (`tools/_perfr3.mjs --mode drive --scenario city --dsf 2`, 2 runs each):
    //
    //   dpr 1: baseline 20.60 ms   HUD hidden 18.70   -> the HUD costs 1.90 ms
    //   dpr 2: baseline 24.60 ms   HUD hidden 18.50   -> the HUD costs 6.10 ms
    //
    // and the kill-control is exact: with the HUD hidden, `deviceScaleFactor 2` costs 0.00 ms
    // (18.70 vs 18.50, inside the spread). **The whole 4 ms that a Retina display adds to this
    // build is the HUD's backing store**, i.e. over a fifth of a 16.7 ms frame spent drawing and
    // compositing a speedometer at four times the resolution of the game.
    //
    // So the cap is 1 by default: the HUD is now exactly as crisp as the frame it annotates. This
    // does NOT contradict main.js's recorded decision that `resScale` must not soften the HUD —
    // that is about the resolution SLIDER, and the HUD still ignores it; this is about not
    // supersampling past the window. `#hudres=<n>` (up to 3) restores the old behaviour for anyone
    // who prefers the sharper overlay and has the 4 ms to spend; the price is printed above.
    // The deterministic screenshot path runs at `deviceScaleFactor 1`, where the two are
    // identical, so **the screenshot regression gate cannot see this change** — stated plainly
    // rather than presented as a pass.
    dpr = clamp(globalThis.devicePixelRatio || 1, 1, Math.max(1, maxPixelRatio));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.max(0.45, Math.min(W / 1920, H / 1080));
    barGeo = null;
    // Assigning canvas.width CLEARS the canvas, so a resize is a content change even though no
    // draw() ran, and the size of the GPU-side texture has changed underneath its consumer. Bump
    // the generation so an uploader re-uploads at the new size instead of stretching a stale
    // frame across the new one. (This is the same mechanism as menu.js's D1: a resize blanks the
    // HUD, and it is the caller's job to repaint it.)
    gen++;
  }
  resize(container.clientWidth || 1920, container.clientHeight || 1080);

  // -------------------------------------------------------------------------
  // primitives
  // -------------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function polyPath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  /** Deterministic hash noise in [-1,1] — used for the hand-torn HUD edges. */
  function jit(i, seed) {
    const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  }

  /** Smooth 1-D value noise in [-1,1]: jit() sampled on the integer lattice. */
  function vnoise(u, seed) {
    const i = Math.floor(u), fx = u - i;
    const s = fx * fx * (3 - 2 * fx);
    return lerp(jit(i, seed), jit(i + 1, seed), s);
  }

  /**
   * Two octaves of vnoise. This is the flame front: one slow octave gives the
   * body its rolling silhouette, one fast octave breaks that silhouette up so the
   * perimeter never reads as a drawn line.
   */
  function fbm(u, seed) {
    return vnoise(u, seed) * 0.63 + vnoise(u * 2.73 + 11.3, seed + 3.17) * 0.37;
  }

  // Offscreen scratch buffers, cached by key and grown on demand. The flame is
  // composited off-screen because its silhouette is built with destination-in /
  // destination-out masking, which on the overlay canvas itself would punch a
  // hole straight through the rendered scene.
  const bufs = new Map();
  function scratch(key, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let b = bufs.get(key);
    if (!b || b.c.width < w || b.c.height < h) {
      const c = document.createElement('canvas');
      c.width = Math.max(w, b ? b.c.width : 0);
      c.height = Math.max(h, b ? b.c.height : 0);
      b = { c, g: c.getContext('2d') };
      bufs.set(key, b);
    }
    const g = b.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.filter = 'none';
    g.clearRect(0, 0, b.c.width, b.c.height);
    return b;
  }

  /**
   * Brush-stroke rectangle: the Burnout HUD frames are never clean rectangles,
   * they are torn strokes. Perimeter samples get a sub-pixel-scale jitter so the
   * outline reads as ink on paper rather than a CSS border.
   */
  function torn(x, y, w, h, skew, rough, seed) {
    const pts = [];
    const nTop = Math.max(10, Math.round(w / (18 * S)));
    const nSide = 3;
    for (let i = 0; i <= nTop; i++) {
      const u = i / nTop;
      pts.push([x + skew + w * u, y + jit(i, seed) * rough]);
    }
    for (let i = 1; i <= nSide; i++) {
      const v = i / nSide;
      pts.push([x + w + skew * (1 - v) + jit(i + 40, seed) * rough, y + h * v]);
    }
    for (let i = nTop; i >= 0; i--) {
      const u = i / nTop;
      pts.push([x + w * u, y + h + jit(i + 90, seed) * rough]);
    }
    for (let i = nSide - 1; i >= 1; i--) {
      const v = i / nSide;
      pts.push([x + skew * (1 - v) + jit(i + 160, seed) * rough, y + h * v]);
    }
    return pts;
  }

  /**
   * The single type routine. size is cap-to-baseline-ish em size in layout px.
   * condense/slant are applied as a shear so the look does not depend on a
   * condensed system face existing. Every string gets an ink outline and a soft
   * shadow: that is what keeps white type readable against a bright dusk sky.
   */
  function drawType(text, x, y, o = {}) {
    const {
      size = 20, weight = 800, align = 'left', condense = 0.86, slant = 0.17,
      fill = '#fff', outline = INK, outlineW = 0.085, shadow = 0.5, track = 0,
      alpha = 1, family = 'Helvetica Neue, Helvetica, Arial, sans-serif', glow = null,
      // hard: offset (in px) of a *solid* black copy of the glyphs, drawn under
      // the type with no blur. Every numeral in the reference HUD has one — it is
      // what lets amber digits sit on a translucent plate and still read.
      hard = 0,
    } = o;
    if (!text) return 0;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `${weight} ${size.toFixed(2)}px ${family}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;

    const str = String(text);
    const chars = track !== 0 ? str.split('') : [str];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
    const wOut = total * condense;
    let ox = 0;
    if (align === 'center') ox = -wOut / 2;
    else if (align === 'right') ox = -wOut;

    ctx.translate(x + ox, y);
    ctx.transform(condense, 0, -slant, 1, 0, 0);

    // Layered strokes stand in for a blur: a wide soft ink halo, then a tight
    // ink outline, then the fill. Blur-free, so it costs the same at any size.
    if (hard > 0) {
      ctx.fillStyle = 'rgba(2,4,6,0.94)';
      ctx.strokeStyle = 'rgba(2,4,6,0.94)';
      ctx.lineWidth = size * outlineW * 2;
      let hx = 0;
      for (let i = 0; i < chars.length; i++) {
        if (outline && outlineW > 0) ctx.strokeText(chars[i], hx + hard, hard);
        ctx.fillText(chars[i], hx + hard, hard);
        hx += widths[i] + track;
      }
    }

    const passes = [];
    if (shadow > 0) passes.push([`rgba(3,6,9,${0.30 * shadow})`, size * (outlineW * 2 + 0.10), size * 0.05]);
    if (glow) passes.push([glow, size * (outlineW * 2 + 0.055), 0]);
    if (outline && outlineW > 0) passes.push([outline, size * outlineW * 2, 0]);

    for (const [col, lw, dy] of passes) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      let cx = 0;
      for (let i = 0; i < chars.length; i++) {
        ctx.strokeText(chars[i], cx, dy);
        cx += widths[i] + track;
      }
    }
    ctx.fillStyle = fill;
    let cx = 0;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx, 0);
      cx += widths[i] + track;
    }
    ctx.restore();
    return wOut;
  }

  function typeWidth(text, o = {}) {
    const { size = 20, weight = 800, condense = 0.86, track = 0,
      family = 'Helvetica Neue, Helvetica, Arial, sans-serif' } = o;
    ctx.save();
    ctx.font = `${weight} ${size.toFixed(2)}px ${family}`;
    const w = ctx.measureText(String(text)).width + track * (String(text).length - 1);
    ctx.restore();
    return w * condense;
  }

  /** Dark scrim card that HUD text stacks sit on, as in the objective list. */
  function scrim(x, y, w, h, a = 0.5, skew = 0) {
    ctx.save();
    polyPath(torn(x, y, w, h, skew, h * 0.05, 3.1));
    // fades out to the right so the scrim never reads as a black bar sitting
    // on the road; it just lifts the type off whatever is behind it
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, `rgba(6,9,13,${a})`);
    g.addColorStop(0.62, `rgba(6,9,13,${a * 0.82})`);
    g.addColorStop(1, 'rgba(6,9,13,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // procedural textures
  // -------------------------------------------------------------------------
  /**
   * Vertical flame licks — tiled and scrolled inside the boost fill.
   * r6: transparent background (so this can also be used as a mask) and far
   * fewer, far wider, far softer licks. The old 256 px tile carried 90 licks
   * 5-20 px wide at 0.9 alpha, which is exactly the vertical comb the r5 shot was
   * measured on: 3.2 units of high-frequency RMS against 1.2 in the reference.
   */
  function makeFlameTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    const rnd = hashRng(4.2);
    for (let i = 0; i < 26; i++) {
      const x = (i * 512) / 26 + rnd() * 14;
      const h = 40 + rnd() * 54;
      const w = 46 + rnd() * 74;
      const y = 96 - h;
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.20)');
      grad.addColorStop(1, 'rgba(255,255,255,0.34)');
      g.fillStyle = grad;
      // drawn three times so the tile wraps: a hard seam at the tile edge shows up
      // as a ruled vertical line straight across the bar
      for (const ox of [-512, 0, 512]) {
        g.beginPath();
        g.moveTo(x + ox, y + h);
        g.quadraticCurveTo(x + ox + w * 0.18, y + h * 0.3, x + ox + w * 0.5, y);
        g.quadraticCurveTo(x + ox + w * 0.82, y + h * 0.3, x + ox + w, y + h);
        g.closePath();
        g.fill();
      }
    }
    return c;
  }

  /**
   * The fray map: soft alpha puffs pushed hard toward the top and bottom of the
   * tile and absent through its middle. Scrolled and used as a destination-out
   * eraser over the flame's alpha, it turns the body's rails from a ruled line
   * into a turbulent front — holes, notches and detached flecks — while leaving
   * the core solid so the interior stays smooth.
   */
  function makeFrayTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    const rnd = hashRng(7.71);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 512;
      const up = rnd() < 0.5;
      const bias = Math.pow(rnd(), 1.8) * 40;
      const y = up ? bias : 128 - bias;
      const r = 5 + rnd() * 30;
      const a = 0.30 + rnd() * 0.70;
      for (const ox of [-512, 0, 512]) {
        const grad = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
        grad.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
        grad.addColorStop(0.55, `rgba(255,255,255,${(a * 0.5).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y - r, r * 2, r * 2);
      }
    }
    return c;
  }

  /** Fine paper grain for the minimap card and scrims. */
  function makeGrainTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 64);
    for (let i = 0; i < 64 * 64; i++) {
      const n = 120 + Math.floor((Math.sin(i * 91.7) * 43758.5453 % 1) * 60);
      img.data[i * 4] = n; img.data[i * 4 + 1] = n; img.data[i * 4 + 2] = n;
      img.data[i * 4 + 3] = 16;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // =========================================================================
  // boost bar — the hero element
  // =========================================================================
  function boostGeometry() {
    if (barGeo) return barGeo;
    const m = 44 * S;
    // r6: 52*S measured 4.35% of frame height against 7.0-7.6% in the reference
    // frames — the hero element was reading as a trim strip. 80*S puts the burning
    // body at ~6.9% before its halo, ~9.8% including it.
    const h = Math.round(88 * S);
    const w = Math.round(clamp(W * 0.315, 360 * S, 660 * S));
    const x = m + 34 * S;               // leaves room for the nozzle cap
    const y = H - m - h;
    barGeo = {
      x, y, w, h, m,
      skew: 9 * S,
      outer: torn(x, y, w, h, 9 * S, 1.8 * S, 7.3),
      inner: torn(x + 3 * S, y + 3 * S, w - 6 * S, h - 6 * S, 9 * S, 1.2 * S, 2.1),
    };
    return barGeo;
  }

  function boostColours() {
    // charge -> ready -> burning -> chain, blended so state changes never pop
    const ready = smoothstep(READY_AT - 0.03, READY_AT + 0.03, shownBoost);
    let c = mixCol(C_CHARGE, C_READY, ready);
    c = mixCol(c, C_BURN, burnMix);
    c = mixCol(c, C_CHAIN, chainMix);
    // Denied press: flash amber to say "not full yet". Under burn/chain in priority (a denied
    // press cannot happen while burning, but the mixes decay slower than the pulse rises).
    c = mixCol(c, C_DENIED, deniedMix * (1 - Math.max(burnMix, chainMix)));
    c = mixCol(c, C_DEAD, crashMix * 0.9);
    return c;
  }

  function mixCol(a, b, k) {
    if (k <= 0) return a;
    if (k >= 1) return b;
    return {
      core: mixHex(a.core, b.core, k),
      edge: mixHex(a.edge, b.edge, k),
      tip: mixHex(a.tip, b.tip, k),
      glow: k < 0.5 ? a.glow : b.glow,
    };
  }

  function mixHex(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, k));
    const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k));
    const bl = Math.round(lerp(pa & 255, pb & 255, k));
    return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
  }

  function drawBoost(s) {
    const G = boostGeometry();
    const { x, y, w, h, skew } = G;
    const col = boostColours();
    const f = clamp(shownBoost, 0, 1);
    const ready = shownBoost >= READY_AT;
    const pulse = ready && !s.boosting ? 0.5 + 0.5 * Math.sin(t * 5.4) : 0;
    const hot = Math.max(burnMix, chainMix);

    // ---- exhaust nozzle cap on the left end -------------------------------
    ctx.save();
    const capW = 22 * S, capH = h + 10 * S;
    polyPath(torn(x - capW - 3 * S, y - 5 * S, capW, capH, 3 * S, 1.4 * S, 5.7));
    ctx.fillStyle = 'rgba(14,18,22,0.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,196,210,0.30)';
    ctx.lineWidth = 2 * S;
    ctx.stroke();
    // three ribs
    ctx.strokeStyle = 'rgba(200,214,228,0.18)';
    ctx.lineWidth = 1.6 * S;
    for (let i = 1; i <= 2; i++) {
      const px = x - capW - 3 * S + (capW * i) / 3;
      ctx.beginPath();
      ctx.moveTo(px + 2 * S, y - 3 * S);
      ctx.lineTo(px - 1 * S, y + capH - 7 * S);
      ctx.stroke();
    }
    ctx.restore();

    // ---- the flame body --------------------------------------------------
    // r5: this used to be a segmented battery — a dark trough running the full
    // span, twelve notches, three heavy thirds dividers, machined empty cells.
    // Measured against the reference that was the single biggest tell: the real
    // bar has ZERO pixels below luma 120 anywhere across its span, i.e. no
    // dividers and no exposed empty track at all. Only the burning length is
    // drawn; the remaining capacity is simply absent, and the edge is a soft
    // additive feather (~18 px) rather than a 1 px stroke over black.
    const ix = x + 3 * S, iy = y + 3 * S, iw = w - 6 * S, ih = h - 6 * S;
    const fw = iw * f;
    const alive = fw > 1.5 && crashMix < 0.9;

    if (alive) {
      // ---------------------------------------------------------------------
      // r6: the silhouette is no longer a polygon. It is an alpha mask built
      // from two octaves of scrolling noise plus a scrolling fray map, so the
      // rails break into notches and detached flecks and the leading edge
      // dissolves past the burn front instead of being cut off vertically.
      // Everything is assembled in an offscreen buffer because the mask uses
      // destination-in / destination-out, which would otherwise cut a hole in
      // the scene rendered underneath the overlay.
      // ---------------------------------------------------------------------
      const padX = Math.ceil(ih * 1.45), padY = Math.ceil(ih * 1.25);
      const bw = Math.ceil(fw) + padX * 2, bh = Math.ceil(ih) + padY * 2;
      const F = scratch('flame', bw, bh);
      const M = scratch('mask', bw, bh);
      const bx = padX, by = padY;                 // body origin inside the buffer
      const cy = by + ih * 0.5;
      const scroll = t * (0.30 + 1.15 * hot);     // noise phase, m/s-ish

      // ---- 1. the alpha boundary ------------------------------------------
      const cols = Math.max(20, Math.round(fw / (2.4 * S)));
      const over = 1.20;                          // sample past the leading edge
      // r7: the licks came down hard. They used to throw 0.5-0.8 bar-heights clear
      // of the rail; averaged across the span that long sparse tail *is* the rail's
      // measured 10-90 transition, and it measured 2.9% of frame height against the
      // reference's 1.7%. The reference rail is jagged at ~0.1 bar-heights and then
      // it simply stops. Amplitude is now roughly a third of what it was; the
      // per-column fbm that gives the rail its torn character is untouched.
      const topP = [], botP = [], topI = [], botI = [];
      const inset = ih * 0.11;                    // width of the frayed perimeter band
      // r10: the two rails' excursion amplitudes were hard-coded ASYMMETRIC — top
      // ih*(0.075*n + 0.05*w^2) against bottom ih*(0.185*n + 0.155*w^2). r8 matched
      // the two generators' spatial FREQUENCY and never touched amplitude, so the
      // bottom still threw ~2.5-3x the top's excursion: per-column sd across the
      // top lick band measured 4.3 against the bottom's 28.6, a ratio of 6.6, where
      // both reference bars sit inside one band on BOTH rails at a ratio near 1.
      // A rail that never leaves its own baseline is a ruled line, and that is why
      // the bar read as a progress bar with a glow filter rather than a burning
      // wick. Both rails now take their amplitudes from the SAME two constants;
      // only noise seed and scroll phase differ, so they cannot drift apart again.
      // LICK_N is the continuous turbulence that gives every column some offset;
      // LICK_W is the rare squared tongue. The bottom's old 0.155 squared term is
      // what produced the two isolated rounded bulges the critic saw — a squared
      // term that large lands as a couple of discrete blobs per span, not as tear.
      // LICK_F multiplies the continuous term's spatial frequency. At 1.0 the rail
      // undulated with a ~24 px period against a strip-scale measuring window, so
      // any amplitude big enough to be SEEN as tear also swung whole 33 px windows
      // from background to body and the per-column sd overshot. hud-overlay-01's
      // rails are frayed at ~6-12 px — finer than the window — which is how the
      // real bar is violently torn and still measures a moderate sd.
      const LICK_N = 0.170, LICK_W = 0.045, LICK_F = 1.9;
      // r14: the two rails keep ONE pair of shape constants (r10's rule stands —
      // they cannot drift apart by accident) but now take a single explicit,
      // reference-derived gain each. Both references tear the TOP rail harder:
      // _hudlick rmsHF 3.90/2.91 on hud-overlay-01 and 4.09/2.59 on -03, i.e.
      // top/bottom 1.34 and 1.58. Ours ran INVERTED at bot/top 1.69.
      //
      // A control render with the bottom rail fed the top rail's own noise
      // verbatim (identical nt/wt on both) still measured top 3.32 / bottom 5.22,
      // so the inversion is NOT the noise realisation and NOT, as the wave-M
      // brief guessed, the fray eraser: it is the contour walk itself. The bar's
      // background above it is road at luma 24 and below it is near 0, so
      // _hudlick's 50%-of-plateau threshold sits at 134.8 on the top rail and
      // 122.8 on the bottom. The lower threshold puts the bottom crossing
      // further out into the additive halo's soft foot, where the flecks live,
      // and the same geometric curve reads ~1.6x more high-frequency there.
      // That asymmetry is a property of the composite, so it has to be
      // compensated in the generator: hence one gain per rail.
      // r15: LICK_BN 0.42 -> 0.34. The r15 soft foot (see FOOT_A) moves the
      // bottom rail's 50% crossing 5 px further out, into a slightly more ragged
      // part of the same curve, which took rmsHF 2.96 -> 3.31 and the ratio to
      // 0.81. FRAY_BOT_A is NOT the lever for that (0.45 -> 0.26 moved rmsHF by
      // 0.01, measured); the generator amplitude is.
      const LICK_TA = 1.15, LICK_BN = 0.34, LICK_BW = 2.60;
      // r14: a BOW term. `_hudlick` splits the contour into rmsHF (tear, after a
      // one-bar-height moving average is removed) and rmsLF (how much the rail
      // wanders as a whole). Both references carry far more of the second than we
      // did: ref01 4.05/2.38 %bh top/bottom, ref03 3.31/1.73, against ours at
      // 1.59/0.66. A rail that tears at the right amplitude but runs dead straight
      // underneath still reads mechanical, and the missing bow is also most of why
      // the column-averaged bottom-rail 10-90 transition had collapsed to 1.03 %H
      // from 1.54. The wavelength is ~185 px, well past the 76 px moving-average
      // window, so this lands in rmsLF and NOT in the tear number.
      const LICK_LT = 0.060, LICK_LB = 0.140;
      for (let i = 0; i <= cols; i++) {
        const u = (i / cols) * over;
        const px = bx + fw * u;
        const nu = (fw * u) / (24 * S);
        const nt = fbm(nu * LICK_F + scroll * 5.1, 4.7);
        const nb = fbm(nu * LICK_F * 0.91 - scroll * 4.3, 9.2);
        // rare licks: squared so most columns sit near the rail and a few throw a
        // short tongue clear of the body
        const wt = Math.max(0, fbm(nu * 0.36 + scroll * 3.1, 21.3) - 0.24) / 0.76;
        // r8: the bottom lick generator ran at nu*0.33 — a LOWER spatial frequency
        // than the top's 0.36 — and its output was squared and scaled by 0.30 ih
        // against the top's 0.05. Sparse, huge, evenly spaced tongues: measured as
        // the right 10-90 width but seen as discrete sawtooth teeth at a regular
        // pitch, where ref-03's bottom edge is turbulent at the same frequency as
        // its own top. Frequency now matches the top and the excursion moves out
        // of the rare squared term into the continuous fbm term, which keeps the
        // averaged transition width while killing the periodicity.
        const wb = Math.max(0, fbm(nu * 0.38 - scroll * 2.4, 33.9) - 0.24) / 0.76;
        const taper = u <= 1 ? 1 : Math.max(0, 1 - (u - 1) / (over - 1));
        const th = 0.5 * ih * (0.35 + 0.65 * taper);
        const lt = fbm(nu * 0.22 + scroll * 0.9, 71.5);
        const lb = fbm(nu * 0.21 - scroll * 0.7, 88.3);
        const ty = cy - th - ih * (LICK_TA * (LICK_N * nt + LICK_W * wt * wt) + LICK_LT * lt);
        const by2 = cy + th
          + ih * (LICK_N * LICK_BN * nb + LICK_W * LICK_BW * wb * wb + LICK_LB * lb);
        topP.push([px, ty]);
        botP.push([px, by2]);
        // inner boundary: the same torn curve pulled toward the centre line. This
        // is what gets re-solidified below, so the solid core is bounded by the
        // silhouette itself rather than by a rectangle.
        topI.push([px, Math.min(cy - 1, ty + inset)]);
        botI.push([px, Math.max(cy + 1, by2 - inset)]);
      }
      const maskPoly = (g, tp, bp) => {
        g.beginPath();
        g.moveTo(tp[0][0], tp[0][1]);
        for (let i = 1; i < tp.length; i++) g.lineTo(tp[i][0], tp[i][1]);
        for (let i = bp.length - 1; i >= 0; i--) g.lineTo(bp[i][0], bp[i][1]);
        g.closePath();
      };
      M.g.fillStyle = '#fff';
      maskPoly(M.g, topP, botP);
      M.g.fill();

      // erode the perimeter with scrolling copies of the fray map
      //
      // r14 REGISTRATION FIX. `makeFrayTexture` puts every puff within 40 px of
      // one of the two long edges of its 512x128 sheet, so a drawn copy only
      // erodes anything inside the top 31% and the bottom 31% of its own
      // destination rectangle; the middle 38% is empty and erodes nothing.
      // r7-r13 drew the sheet 3.0 ih tall centred on cy, which put those two
      // bands at 0.56-1.5 ih from the centre line while the rails live at
      // 0.50-0.715 ih. Copy 1 therefore only clipped the outermost tips of both
      // rails, and copy 2 (3.9 ih tall, hung from cy - 0.66*ih*3.0) had its
      // bands at [-1.98,-0.759] and [+0.703,+1.92] ih: it missed the top rail
      // entirely and ate the bottom rail's tongues. That mis-registration, not
      // the lick amplitudes, is what inverted the tear ratio to bot/top 1.69
      // where both references sit at 0.63-0.75.
      //
      // The sheet is now positioned per RAIL rather than per bar: one copy is
      // hung so its LOWER puff band lands exactly on the top rail zone, another
      // so its UPPER band lands on the bottom rail zone. Each copy's far band
      // then falls outside the bar silhouette entirely, where destination-out
      // is a no-op, so the two rails are independently addressable and the
      // erosion strength of each is just its own alpha. FRAY_R0 is the inner
      // edge of the eroded band in ih from the centre line: it sits inside the
      // 0.50 rail base so the erosion can bite, not just shave the tips.
      // FRAY_TOP_A > FRAY_BOT_A because both references tear the TOP rail
      // harder (ref01 3.90/2.91, ref03 4.09/2.59 rmsHF).
      M.g.globalCompositeOperation = 'destination-out';
      const FRAY_R0 = 0.40;
      const FRAY_TOP_A = 0.85, FRAY_BOT_A = 0.45;
      const ftW = 620 * S, ftH = ih * 1.30;
      // offset from the sheet's own edge to the near edge of its puff band
      const fyTop = cy - FRAY_R0 * ih - ftH, fyBot = cy + FRAY_R0 * ih;
      const fo = -((t * (26 + 210 * hot)) % ftW);
      for (let px = bx - ftW + fo; px < bx + fw + ftW; px += ftW) {
        M.g.globalAlpha = 0.78 * FRAY_TOP_A;
        M.g.drawImage(frayTex, px, fyTop, ftW, ftH);
        M.g.globalAlpha = 0.78 * FRAY_BOT_A;
        M.g.drawImage(frayTex, px, fyBot, ftW, ftH);
      }
      const ftW2 = ftW * 1.71, fo2 = -((t * (17 + 130 * hot) + 90 * S) % ftW2);
      const ftH2 = ftH * 1.3;
      const fyTop2 = cy - FRAY_R0 * ih - ftH2, fyBot2 = cy + FRAY_R0 * ih;
      for (let px = bx - ftW2 + fo2; px < bx + fw + ftW2; px += ftW2) {
        M.g.globalAlpha = 0.42 * FRAY_TOP_A;
        M.g.drawImage(frayTex, px, fyTop2, ftW2, ftH2);
        M.g.globalAlpha = 0.42 * FRAY_BOT_A;
        M.g.drawImage(frayTex, px, fyBot2, ftW2, ftH2);
      }

      // ...but the interior stays solid: the fray is a perimeter effect, and a
      // core eaten into holes is what made the r5 bar read as a comb.
      // r7: the solid core is re-laid as the *inset silhouette*, not as a
      // rectangle behind a vertical alpha ramp. The old ramp took the body from
      // opaque to nothing over a quarter of a bar-height on each rail, which is
      // most of the softness this round is about; and the reason it had to be a
      // ramp at all was that its footprint was a fillRect, whose hard top, bottom
      // and right edges would otherwise have shown as ruled lines. Bounded by the
      // torn curve instead, the plateau can go right up to an 0.11-bar-height
      // frayed band and the edge stays hand-drawn.
      M.g.globalCompositeOperation = 'source-over';
      M.g.globalAlpha = 1;
      M.g.fillStyle = '#fff';
      maskPoly(M.g, topI, botI);
      M.g.fill();

      // ---- r15: the bottom rail's SOFT FOOT --------------------------------
      // `_hudedge` bottomRail, normalised to barH (the wave-O tool finding: the
      // raw %-of-frame figures are not comparable between a 1080 render and an
      // 800 reference), was ours 11.9/76 = 15.7% against ref01 15.8/59 = 26.8%
      // and ref03 13/53 = 24.5%. r14 tried to buy it back with FRAY_BOT_A and
      // with the LICK_LB bow and could not, because bottomRail is the 10-90 span
      // of a COLUMN-AVERAGED profile and both of those levers widen it only by
      // adding CONTOUR EXCURSION — which is exactly the quantity `_hudlick`
      // rmsHF measures and which the tear ratio 0.60-0.80 caps. The two targets
      // read as antagonistic only because both were being driven through one
      // variable.
      //
      // They are not the same variable in the references: their bottom rails are
      // low-tear AND wide, i.e. a graded low-alpha falloff, not a ragged one. So
      // the foot is a partial-alpha band under the rail, laid AFTER the fray so
      // nothing erodes it into a contour.
      //
      // RANGE CHECK before writing the gain: the consumer is a 50%-of-plateau
      // crossing (`_hudlick`) and a 10-90 span (`_hudedge`). FOOT_A must stay
      // BELOW 0.5 or the 50% crossing walks out into the foot and the traced
      // contour — and with it the tear ratio and rimBot's sample row — moves.
      // At FOOT_A 0.40 the crossing provably cannot leave the rail, and the 10%
      // point lands ~0.78 of FOOT_H below it, which is the whole widening.
      const FOOT_A = 0.40, FOOT_H = 0.30;
      const fg = M.g.createLinearGradient(0, cy + ih * 0.40, 0, cy + ih * (0.40 + FOOT_H));
      fg.addColorStop(0, `rgba(255,255,255,${FOOT_A})`);
      fg.addColorStop(0.55, `rgba(255,255,255,${FOOT_A * 0.45})`);
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      M.g.fillStyle = fg;
      M.g.fillRect(bx, cy + ih * 0.40, fw, ih * FOOT_H);

      M.g.globalCompositeOperation = 'destination-out';

      // The burn front dissolves: soft blobs eat into the tip, then an alpha ramp
      // runs the remainder out to nothing.
      // r7: that ramp used to span 0.98 bar-heights (-0.16 to +0.82), which
      // measured a 10-90 front transition of 4.1% of frame width against the
      // reference's 2.2%. The reference front is a ~0.47-bar-height dissolve, so
      // the ramp is now 0.40 and the blobs are pulled in behind it to keep the cut
      // ragged rather than ruled.
      M.g.globalAlpha = 1;
      for (let i = 0; i < 9; i++) {
        // strictly outside the front: blobs punched into the body itself leave a
        // hole with the road showing through, which reads as a smudge
        const bxp = bx + fw + ih * (0.03 + 0.042 * i) + jit(i * 3 + 1, 5.1) * ih * 0.05;
        const byp = cy + jit(i * 7 + 2, 8.3) * ih * 0.52;
        const br = ih * (0.05 + 0.075 * Math.abs(jit(i * 11 + 3, 2.7)));
        const rg2 = M.g.createRadialGradient(bxp, byp, 0, bxp, byp, br);
        rg2.addColorStop(0, 'rgba(0,0,0,0.72)');
        rg2.addColorStop(1, 'rgba(0,0,0,0)');
        M.g.fillStyle = rg2;
        M.g.fillRect(bxp - br, byp - br, br * 2, br * 2);
      }
      const rg = M.g.createLinearGradient(bx + fw - ih * 0.07, 0, bx + fw + ih * 0.41, 0);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      rg.addColorStop(1, 'rgba(0,0,0,1)');
      M.g.fillStyle = rg;
      M.g.fillRect(bx + fw - ih * 0.07, 0, bw, bh);
      M.g.globalCompositeOperation = 'source-over';

      // ---- 2. body colour --------------------------------------------------
      // green at the rails and through the wisps, white-hot across the middle
      const gy0 = cy - ih * 1.25, gy1 = cy + ih * 1.25;
      const st = (yy) => clamp((yy - gy0) / (gy1 - gy0), 0, 1);
      // r7: the tip plateau widened from +/-0.12 to +/-0.22 bar-heights and the
      // green rail band narrowed to match. The old ramp spent 26 px of a 41 px half
      // -height climbing from rail green (luma 191) to core white (252), so the
      // rail's 10-90 measurement was reading a colour ramp inside solid body, not
      // an edge. hud-overlay-03 holds 248-251 across the middle ~60% of its bar and
      // only greens off in the last few pixels.
      const grad = F.g.createLinearGradient(0, gy0, 0, gy1);
      grad.addColorStop(0, col.edge);
      grad.addColorStop(st(cy - ih * 0.50), col.edge);
      grad.addColorStop(st(cy - ih * 0.40), col.core);
      grad.addColorStop(st(cy - ih * 0.165), col.tip);
      grad.addColorStop(st(cy + ih * 0.165), col.tip);
      // r14 pulled the LOWER pair of stops in from 0.40/0.50 to 0.360/0.425.
      // (The r14 comment here claimed 0.370/0.470 and the code read 0.360/0.425;
      // the wave-O critic caught it. Rule 5 — corrected against the constants.)
      // r15 pushes them back OUT to 0.402/0.490, because the new soft foot below
      // moved the 50% crossing 5 px further out (y1025 -> y1030) and the ramp has
      // to lead the geometry by the same amount or the rim sample lands in flat
      // rail green: at the r14 stops the split was 0.517/0.631, at 0.420/0.530 it
      // overshot to 0.517/0.446, and 0.402/0.490 measures 0.516/0.529.
      // `_hudedge`'s rim sample is not a fixed row: it is wherever the
      // column-averaged profile crosses 50% of plateau, which sits further out
      // on whichever rail scatters more. With the bottom rail's excursion now
      // deliberately smaller than the top's (see LICK_BN), its 50% crossing
      // moved ~3 px inboard and started sampling white core instead of rail
      // green — rimTop/rimBot sat split 0.518/0.364. Both references hold the
      // two rims within 0.01 of each other (0.507/0.503 and 0.519/0.528), so the
      // colour ramp has to lead the geometry down by the same amount.
      grad.addColorStop(st(cy + ih * 0.402), col.core);
      grad.addColorStop(st(cy + ih * 0.490), col.edge);
      grad.addColorStop(1, col.edge);
      // Exposure: the body is the topmost, opaque pass now, so the additive blurs
      // no longer stack inside the silhouette and there is nothing to divide out.
      // Authored colours land verbatim on the core; the filament on top of them is
      // what runs to 255.
      F.g.globalAlpha = 1;
      F.g.fillStyle = grad;
      F.g.fillRect(0, 0, bw, bh);
      F.g.globalAlpha = 1;

      // internal licks: one wide, soft, slow tile. Kept wide on purpose — the
      // narrow 150 px tile is what read as a comb of vertical stripes.
      F.g.globalCompositeOperation = 'lighter';
      F.g.globalAlpha = 0.14 + 0.20 * hot;
      const tileW = 420 * S, speed = 46 + 300 * hot;
      const off = -((t * speed) % tileW);
      for (let px = bx - tileW + off; px < bx + fw + tileW; px += tileW) {
        F.g.drawImage(flameTex, px, cy - ih * 0.62, tileW, ih * 1.24);
      }
      F.g.globalAlpha = 0.10 + 0.14 * hot;
      const tileW2 = tileW * 1.73, off2 = -((t * speed * 0.44 + 60 * S) % tileW2);
      for (let px = bx - tileW2 + off2; px < bx + fw + tileW2; px += tileW2) {
        F.g.drawImage(flameTex, px, cy - ih * 0.70, tileW2, ih * 1.4);
      }

      F.g.globalAlpha = 1;
      // the white-hot filament: a thin, noise-broken ribbon on the centre line
      // that clips to 255,255,255 once the additive passes land on it. This is
      // the blown-out core the reference has ~3% of and r5 had none of.
      const fTop = [], fBot = [];
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const px = bx + fw * u;
        const nu = (fw * u) / (21 * S);
        // dies away before the burn front, where there is no longer a solid body.
        // No thickness floor: the ribbon has to break into separate bursts or it
        // reads as a drawn thread rather than the flame clipping.
        const end = 1 - smoothstep(0.86, 1.0, u);
        const th = ih * end * 0.088 * Math.pow(Math.max(0, fbm(nu + scroll * 4.2, 51.7)), 1.2);
        const dc = ih * 0.05 * fbm(nu * 0.7 - scroll * 3.3, 63.1);
        fTop.push([px, cy + dc - th]);
        fBot.push([px, cy + dc + th]);
      }
      F.g.beginPath();
      F.g.moveTo(fTop[0][0], fTop[0][1]);
      for (let i = 1; i < fTop.length; i++) F.g.lineTo(fTop[i][0], fTop[i][1]);
      for (let i = fBot.length - 1; i >= 0; i--) F.g.lineTo(fBot[i][0], fBot[i][1]);
      F.g.closePath();
      // r7: the filament is warm-white, not neutral white. Under the old composite
      // an additive green pass landed on top of it and pulled its blue down; with
      // the halo moved behind the body nothing does, and a pure-white filament took
      // the core's saturation from 0.33 to 0.14 against the reference's 0.24. The
      // reference core measures 246,253,193 — a yellow-green near-white, not paper.
      F.g.fillStyle = `rgba(248,255,204,${(0.78 + 0.18 * hot).toFixed(3)})`;
      F.g.fill();

      // charged sheen sweeping along the body. Kept clear of the burn front: over
      // the dissolving tip a white sweep has no green under it and reads as a
      // grey smudge rather than a highlight.
      if (pulse > 0) {
        const sw = 150 * S;
        const run = Math.max(sw, fw * 0.82);
        const sx = bx + ((t * 0.42) % 1.35) * run - sw;
        const sg = F.g.createLinearGradient(sx, 0, sx + sw, 0);
        sg.addColorStop(0, 'rgba(236,255,190,0)');
        sg.addColorStop(0.5, `rgba(236,255,190,${(0.07 + 0.07 * pulse).toFixed(3)})`);
        sg.addColorStop(1, 'rgba(236,255,190,0)');
        F.g.fillStyle = sg;
        F.g.fillRect(sx, cy - ih * 0.7, sw, ih * 1.4);
      }

      // Cool the burn front back toward green. source-atop keeps the flame's own
      // alpha and only lerps its colour, so the dissolving tip stops being a
      // near-white stub — over dark road that reads as a grey smudge, not fire.
      // r7: the ramp ran 1.05 bar-heights back from the front, so luma was already
      // sliding from 245 to 210 across the last ~90 px of *solid* body and the
      // 10-90 front measurement started inside the plateau. Column profiles of
      // hud-overlay-03 hold a flat 249-251 to within 5 px of the front and only
      // then fall, so the cool is now a 0.34-bar-height lead-in.
      F.g.globalCompositeOperation = 'source-atop';
      const tg = F.g.createLinearGradient(bx + fw - ih * 0.34, 0, bx + fw + ih * 0.16, 0);
      tg.addColorStop(0, 'rgba(132,224,52,0)');
      tg.addColorStop(1, 'rgba(132,224,52,0.94)');
      F.g.fillStyle = tg;
      F.g.fillRect(bx + fw - ih * 0.34, 0, bw, bh);

      // ---- 3. cut the body to the flame's own alpha ------------------------
      F.g.globalCompositeOperation = 'destination-in';
      F.g.globalAlpha = 1;
      F.g.drawImage(M.c, 0, 0);
      F.g.globalCompositeOperation = 'source-over';

      // ---- 4. composite: three additive blurs, then the crisp body ----------
      // Radii scale with the body height so the halo keeps the same relative
      // reach at any resolution; the widest pass carries light ~0.55 bar-heights
      // clear of the rails and the tightest pass is what tips the core to white.
      // The widest pass is drawn from a green copy of the silhouette, not from the
      // white-cored body: blurring the body itself throws a grey veil past the
      // burn front, where there is no green left to tint it.
      const Hb = scratch('halo', bw, bh);
      Hb.g.fillStyle = col.edge;
      Hb.g.fillRect(0, 0, bw, bh);
      Hb.g.globalCompositeOperation = 'destination-in';
      Hb.g.drawImage(M.c, 0, 0);

      // r7: the halo goes down FIRST and the crisp body LAST.
      //
      // The old order was body -> three additive blurs on top, and the widest of
      // those (0.44 bar-heights, ~40 px here) landed straight over the sharp
      // silhouette and re-softened it: every edge the halo touched measured ~2x the
      // reference's 10-90 transition width, while the left cap — the one edge the
      // blur stack does not reach — matched the reference to within 8%. That is a
      // composite-order tell, not resolution and not AA.
      //
      // Drawn behind, the blurs still throw light clear of the rails but the body's
      // own alpha is the last thing written, so the silhouette stays hard at native
      // resolution: 1 px from lit to road wherever the mask is opaque, and still
      // torn and notched wherever the fray map ate into it.
      const dx = ix - bx, dy = iy - by;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // ---- THE HALO IS BLURRED AT REDUCED SCALE. THIS IS THE HUD'S WHOLE FRAME COST.
      // These three additive passes were 3.55 ms of a 19.15 ms frame on their own — measured by
      // skipping this loop and nothing else, with every fbm, mask, fray and filament pass in the
      // routine left running (verdicts/wave-s/perf.md section 5). Nothing else the HUD draws is
      // above the noise floor. The reason is `ctx.filter`: Skia allocates a save-layer and runs a
      // full separable blur over the whole source bitmap per pass per frame, on the raster thread,
      // where it lands on our rAF-to-rAF time without appearing in any CPU bracket around
      // hud.update() — which is why the profile pass saw hud.update at 0.92 ms and the kill-control
      // saw 3.8 ms.
      //
      // A blur of radius r is, by definition, a signal with no content finer than r. So each pass
      // is now blurred in a buffer downscaled by D, with the radius scaled by D too, and expanded
      // back bilinearly: one sixteenth of the pixels for D = 4. The composite-order rule from r7
      // is untouched — halo first, crisp body last — and the crisp body is still drawn at native
      // resolution, so the silhouette this whole routine exists to keep hard stays hard.
      //
      // D is capped so the small-buffer radius never falls below MIN_SMALL_R; below about two
      // texels a downscaled blur stops being a blur and starts being a resample, and the tightest
      // pass (0.030 bar-heights) correctly ends up at D = 1, i.e. exactly as it was.
      const MIN_SMALL_R = 2.0;
      let hi = 0;
      for (const [b, a, green] of BOOST_BLOOM) {
        const r = ih * b;
        const D = Math.max(1, Math.min(4, Math.floor(r / MIN_SMALL_R)));
        ctx.globalAlpha = clamp(a * (1 + 0.16 * hot + 0.08 * pulse), 0, 1);
        if (D === 1) {
          ctx.filter = `blur(${r.toFixed(2)}px)`;
          ctx.drawImage(green ? Hb.c : F.c, dx, dy);
          continue;
        }
        const sw = Math.ceil(bw / D), sh = Math.ceil(bh / D);
        const Sb = scratch(`bloom${hi++}`, sw, sh);
        Sb.g.filter = `blur(${(r / D).toFixed(2)}px)`;
        Sb.g.drawImage(green ? Hb.c : F.c, 0, 0, sw, sh);
        Sb.g.filter = 'none';
        ctx.filter = 'none';
        ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(Sb.c, 0, 0, sw, sh, dx, dy, sw * D, sh * D);
      }
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // r8: the saturate(1.65) that used to sit here is GONE. It did land the
      // bar-box average (0.19 -> 0.337 against the reference's 0.344), but a
      // luma-preserving colour matrix has almost no leverage on the near-white
      // core and enormous leverage on the midtones, so the whole correction was
      // dumped into the rail falloff: #5fc51c went through it as (51,219,0) and
      // the measured top rim read 100.5,161.7,42.5 sat 0.737 B/G 0.263 against
      // the reference's 94.6,154.2,74.3 sat 0.519 B/G 0.481. Acid lime, not the
      // soft desaturated yellow-green the game has. Deleting the filter alone
      // lands the rim; the core it also un-corrects is put back on the ramp's
      // own tip stops (see C_READY), where it costs the rim nothing.
      ctx.drawImage(F.c, dx, dy);
      ctx.restore();
    } else if (crashMix >= 0.9) {
      // wrecked: the only state that shows a dead trough, because there is no
      // flame to show and the bar still has to be legible as "gone"
      ctx.save();
      polyPath(G.outer);
      ctx.fillStyle = 'rgba(10,12,15,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,90,84,0.42)';
      ctx.lineWidth = 2.2 * S;
      ctx.stroke();
      ctx.restore();
    }

    // ---- label + chain badge ---------------------------------------------
    // The bar carries no standing label — like the game, state is read off colour.
    // Only the exceptional states name themselves.
    if (crashMix > 0.5 || chain > 1) {
      drawType(crashMix > 0.5 ? 'WRECKED' : 'BURNOUT CHAIN', x - 28 * S, y - 15 * S, {
        size: 20 * S, weight: 800, track: 1.8 * S,
        fill: crashMix > 0.5 ? '#ff6b5a' : AMBER_HOT,
        glow: crashMix > 0.5 ? null : 'rgba(255,150,30,0.5)',
      });
    }

    if (chain > 1) {
      const bx = x + w + skew + 16 * S;
      drawType(`x${chain}`, bx, y + h - 5 * S, {
        size: 40 * S, weight: 900, fill: AMBER_HOT, slant: 0.22,
        glow: 'rgba(255,150,30,0.8)', track: 0,
      });
    }
  }

  // =========================================================================
  // speedometer
  // =========================================================================
  const DIGITS = 3;

  function drawSpeedo(s) {
    const G = boostGeometry();
    const mapW = minimapGeometry().w;
    const right = W - G.m - mapW - 128 * S;   // digits end here; unit column sits right of it
    const baseline = H - G.m - 6 * S;
    const size = 112 * S;

    // r5: white un-outlined digits on an opaque black plate read as a debug
    // overlay. Every reference frame puts amber numerals with a hard, un-blurred
    // black drop shadow on a translucent torn plate, so that is what this is now.
    // r6: the numerals measured stroke/cap 0.34 against 0.21 in the reference, most
    // of it carried by the ink outline and the hard drop copy rather than the glyph
    // itself, so both are thinned and the weight comes down off Black.
    const opts = {
      size, weight: 740, condense: 0.74, slant: 0.19,
      fill: crashMix > 0.5 ? '#c8ced4' : AMBER,
      outline: 'rgba(4,7,10,0.95)', outlineW: 0.036, shadow: 0.4,
      hard: size * 0.030,
    };
    // tabular: every column is the width of a zero, so digits cannot shuffle
    ctx.save();
    ctx.font = `${opts.weight} ${size.toFixed(2)}px Helvetica Neue, Helvetica, Arial, sans-serif`;
    const adv = ctx.measureText('0').width * opts.condense * 0.995;
    ctx.restore();

    // ---- instrument plate: the cluster is a physical panel, angled and
    // bevelled, not type floating on the road --------------------------------
    const pL = right - adv * DIGITS - 26 * S;
    const pT = baseline - size * 0.84 - 40 * S;
    const pR = right + 122 * S;
    const pB = baseline + 16 * S;
    // The plate is an ink *splatter*, not a scrim: a torn body at ~30% alpha with
    // the grunge splat bleeding out past its edges. The old version stacked a
    // 0.6-alpha drop shadow under a 0.6-alpha fill, which measured 99% opaque
    // against the road behind it and killed the scene.
    const pW = pR - pL, pH = pB - pT;
    ctx.save();
    if (!grungeTex) grungeTex = makeGrungeTexture();
    // splatter first, so the plate's silhouette is frayed on every side
    ctx.save();
    ctx.globalAlpha = 0.60;
    ctx.translate(pL + pW * 0.5, pT + pH * 0.5);
    ctx.scale(-1, 1);                              // mirrored so it is not the map's splat
    ctx.drawImage(grungeTex, -pW * 0.62, -pH * 0.70, pW * 1.24, pH * 1.40);
    ctx.restore();

    // r6: the body is built offscreen so all four edges can be eaten back. Only the
    // top rail was soft before, and three hard cuts out of four are exactly what
    // gave this plate away — the references carry no speedo at all, so its
    // rectangularity is the whole tell.
    const pad = Math.ceil(34 * S);
    const P = scratch('plate', pW + pad * 2, pH + pad * 2);
    P.g.translate(pad - pL, pad - pT);
    const pPts = platePath(pL, pT, pW, pH, 17.9);
    P.g.beginPath();
    P.g.moveTo(pPts[0][0], pPts[0][1]);
    for (let i = 1; i < pPts.length; i++) P.g.lineTo(pPts[i][0], pPts[i][1]);
    P.g.closePath();
    const pgr = P.g.createLinearGradient(0, pT, 0, pB);
    pgr.addColorStop(0, 'rgba(18,24,30,0.36)');
    pgr.addColorStop(0.55, 'rgba(9,13,18,0.28)');
    pgr.addColorStop(1, 'rgba(5,8,12,0.38)');
    P.g.fillStyle = pgr;
    P.g.fill();
    // brush edge along the top rail
    P.g.save();
    P.g.beginPath();
    P.g.moveTo(pPts[0][0], pPts[0][1]);
    for (let i = 1; i < pPts.length; i++) P.g.lineTo(pPts[i][0], pPts[i][1]);
    P.g.closePath();
    P.g.clip();
    const pbv = P.g.createLinearGradient(0, pT, 0, pT + pH * 0.5);
    pbv.addColorStop(0, 'rgba(228,240,252,0.20)');
    pbv.addColorStop(1, 'rgba(228,240,252,0)');
    P.g.fillStyle = pbv;
    P.g.fillRect(pL - 10 * S, pT - 4 * S, pW + 20 * S, pH * 0.5);
    P.g.restore();
    P.g.globalAlpha = 0.55;
    P.g.drawImage(grainTex, pL, pT, pW, pH);
    P.g.globalAlpha = 1;

    // fray: an alpha ramp in from every edge, then the fray map twice — once as
    // authored (it biases to the top and bottom of its tile) and once rotated a
    // quarter turn, so the left and right edges break up the same way
    P.g.globalCompositeOperation = 'destination-out';
    const fade = 17 * S;
    const edges = [
      [pL - 6 * S, pT, pL + fade, pT], [pR + 6 * S, pT, pR - fade, pT],
      [pL, pT - 6 * S, pL, pT + fade], [pL, pB + 6 * S, pL, pB - fade],
    ];
    for (const [ax, ay, bx2, by2] of edges) {
      const eg = P.g.createLinearGradient(ax, ay, bx2, by2);
      eg.addColorStop(0, 'rgba(0,0,0,0.92)');
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      P.g.fillStyle = eg;
      P.g.fillRect(pL - pad, pT - pad, pW + pad * 2, pH + pad * 2);
    }
    P.g.globalAlpha = 0.8;
    P.g.drawImage(frayTex, pL - 8 * S, pT - 10 * S, pW + 16 * S, pH + 20 * S);
    P.g.save();
    P.g.translate(pL + pW * 0.5, pT + pH * 0.5);
    P.g.rotate(Math.PI / 2);
    P.g.drawImage(frayTex, -pH * 0.5 - 8 * S, -pW * 0.5 - 8 * S, pH + 16 * S, pW + 16 * S);
    P.g.restore();
    P.g.globalCompositeOperation = 'source-over';
    P.g.globalAlpha = 1;
    ctx.drawImage(P.c, pL - pad, pT - pad);
    ctx.restore();

    const v = Math.max(0, shownSpeed);
    const cellTop = baseline - size * 0.80;
    const cellH = size * 0.92;

    for (let i = 0; i < DIGITS; i++) {
      const place = Math.pow(10, i);
      const scaled = v / place;
      if (i > 0 && v < place) continue;              // no leading zeros
      const d = Math.floor(scaled) % 10;
      const frac = scaled - Math.floor(scaled);
      // ones digit rolls continuously but eased so it reads still most of the time;
      // higher digits only roll through their carry
      const r = i === 0 ? smoothstep(0.62, 1.0, frac) : smoothstep(0.90, 1.0, frac);
      const cx = right - adv * i - adv * 0.5;

      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - adv * 0.62, cellTop - size * 0.10, adv * 1.24, cellH + size * 0.16);
      ctx.clip();
      if (r > 0.001) {
        drawType(String(d), cx, baseline - r * cellH, { ...opts, align: 'center', alpha: 1 - r * 0.35 });
        drawType(String((d + 1) % 10), cx, baseline + (1 - r) * cellH,
          { ...opts, align: 'center', alpha: 0.65 + r * 0.35 });
      } else {
        drawType(String(d), cx, baseline, { ...opts, align: 'center' });
      }
      ctx.restore();
    }

    // unit column to the right of the numerals: KM/H on the digit baseline,
    // gear plate stacked above it, both left-aligned on one optical edge
    const ux = right + 14 * S;
    drawType('KM/H', ux, baseline - 3 * S, {
      size: 27 * S, weight: 800, track: 2.2 * S, fill: AMBER, align: 'left', shadow: 0.5,
      hard: 2.2 * S,
    });

    const gear = String(s.gear ?? 1);
    const gw = 44 * S, gh = 42 * S;
    const gx = ux, gy = baseline - 34 * S;
    ctx.save();
    polyPath(torn(gx, gy - gh, gw, gh, 5 * S, 1.2 * S, 11.4));
    ctx.fillStyle = 'rgba(8,12,17,0.40)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,179,31,0.5)';
    ctx.lineWidth = 1.8 * S;
    ctx.stroke();
    ctx.restore();
    drawType(gear, gx + gw * 0.54, gy - gh * 0.24, {
      size: 31 * S, weight: 900, align: 'center', fill: '#fff', shadow: 0.5, hard: 2.4 * S,
    });
    drawType('GEAR', gx + 1 * S, gy - gh - 9 * S, {
      size: 14 * S, weight: 700, track: 2.0 * S, fill: 'rgba(226,236,244,0.55)',
    });

    // rev strip above the numerals, sharing their right edge
    const rpm = clamp(s.rpm01 != null ? s.rpm01 : revFromSpeed(shownSpeed, s.gear ?? 1), 0, 1);
    const rw = adv * DIGITS, rx = right - rw, ry = baseline - size * 0.84 - 15 * S;
    const rh = 8 * S, cells = 24;
    for (let i = 0; i < cells; i++) {
      const on = i / cells < rpm;
      const cw = rw / cells;
      const px = rx + i * cw;
      ctx.fillStyle = on
        ? (i / cells > 0.82 ? '#ff5f3a' : i / cells > 0.66 ? AMBER_HOT : 'rgba(236,244,252,0.92)')
        : 'rgba(226,236,244,0.13)';
      ctx.beginPath();
      ctx.moveTo(px + rh * 0.35, ry);
      ctx.lineTo(px + cw - 1.4 * S + rh * 0.35, ry);
      ctx.lineTo(px + cw - 1.4 * S, ry + rh);
      ctx.lineTo(px, ry + rh);
      ctx.closePath();
      ctx.fill();
    }
    // scale ticks under the strip plus a needle at the current rev
    ctx.save();
    ctx.strokeStyle = 'rgba(226,236,244,0.30)';
    ctx.lineWidth = 1.3 * S;
    for (let i = 0; i <= 6; i++) {
      const tx2 = rx + (rw * i) / 6;
      const tall = i % 3 === 0;
      ctx.beginPath();
      ctx.moveTo(tx2 + rh * 0.35, ry - 2 * S);
      ctx.lineTo(tx2 + rh * 0.35, ry - (tall ? 8 : 4.5) * S);
      ctx.stroke();
    }
    const nx2 = rx + rw * rpm;
    ctx.beginPath();
    ctx.moveTo(nx2 + rh * 0.35, ry - 9 * S);
    ctx.lineTo(nx2 + rh * 0.35 + 4.5 * S, ry - 16 * S);
    ctx.lineTo(nx2 + rh * 0.35 - 4.5 * S, ry - 16 * S);
    ctx.closePath();
    ctx.fillStyle = rpm > 0.82 ? '#ff5f3a' : AMBER_HOT;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 5 * S;
    ctx.fill();
    ctx.restore();

    drawType('RPM', rx - 10 * S, ry + rh + 1 * S, {
      size: 14 * S, weight: 700, align: 'right', track: 1.6 * S,
      fill: 'rgba(226,236,244,0.5)', shadow: 0.6,
    });
  }

  function revFromSpeed(kmh, gear) {
    const perGear = [0, 55, 95, 140, 190, 245, 320];
    const lo = perGear[Math.max(0, Math.min(5, gear - 1))];
    const hi = perGear[Math.max(1, Math.min(6, gear))];
    return clamp(0.28 + 0.72 * ((kmh - lo) / Math.max(1, hi - lo)), 0.12, 1);
  }

  // =========================================================================
  // minimap — a baked cartographic tile presented on a torn plate
  //
  // The map is deliberately *not* live vector art. A single satellite-style
  // tile covering the whole city is baked once at 1024 px (land tone
  // patchwork, water behind a wobbling coastline, parkland with tree stipple,
  // parcel-subdivided building footprints each with a consistent north-west
  // drop shadow, the road network in casing + fill + centre dashes on top,
  // then large-scale tonal blotches and grain) and blitted into the card under
  // the heading rotation. That is the difference between a shipped map asset
  // and a lineTo() debug diagram: hierarchy, texture and tonal variation that
  // still read at ~0.35 px per metre.
  //
  // The plate it sits on is a wobbled, chamfered quad — never a 90-degree
  // rectangle — with a bevelled edge, a drop shadow and a torn ink splatter
  // bleeding out behind it and the district name plate, which is Burnout's
  // actual corner treatment.
  // =========================================================================
  function minimapGeometry() {
    const m = 40 * S;
    const w = Math.round(340 * S), h = Math.round(244 * S);
    return { m, w, h, x: W - m - w, y: H - m - h };
  }

  const MAP_MIN = -980, MAP_MAX = 980, MAP_SPAN = MAP_MAX - MAP_MIN;
  const ROAD_W = { freeway: 46, arterial: 30, street: 17, lane: 8, loop: 12 };
  // Total width of the road INCLUDING its edge treatment is ROAD_W + ROAD_CASE, so
  // half of ROAD_CASE is what shows on each side. r14 widened this ~25% to make a
  // near-black casing survive minification; r15 inverts the polarity (see
  // ROAD_FILL) and narrows it again to 9.5/6.8/4.6/2.8/3.2, which puts an
  // arterial's pale kerb at 3.4 m = 1.8 tile px = ~0.6 card px per side. Wider
  // than that and the ribbon reads as a glowing outline, which is the cartographic
  // signature this round exists to remove — measured: at the r14 widths the same
  // kerb colour put minimap p01 at 8.1 against a hold of <=6.
  const ROAD_CASE = { freeway: 9.5, arterial: 6.8, street: 4.6, lane: 2.8, loop: 3.2 };
  // r14 VALUE RANGE. Every ground tone below came down and every road tone went
  // up. The wave-M critic's call was that the card read as a vector *plan* and
  // both references are aerial *plates*, and the mechanism was purely tonal: the
  // tile was assembled from mid-grey fills (land 62, block patchwork 44-74,
  // footprints 60-144) under white strokes, so the whole card lived between 16
  // and 212 — 1.14% of its pixels below luma 16 where hud-overlay-03's card is
  // 7.1% and -01's is 10-11%, and a p99 of 212 where theirs clip at 219-255.
  // An aerial has near-black building masses and blown road casing; that
  // separation, not the linework, is what reads as photography. The road casing
  // in particular was landing at 0.12*62 + 0.88*9.7 = 16.0 over the old land —
  // sitting exactly ON the sub-black threshold, which is why the histogram had a
  // wall there. Over the new land the same casing lands at 11.
  // r15 POLARITY, and this is the headline. r14 raised every road tone to fix the
  // histogram; the wave-O critic then measured the road strip
  // (`_px --region road=0.9315,0.9345,0.795,0.870`) at p50 195.5 against
  // hud-overlay-03's 89.7 on the same kind of strip. 106 levels, and the eye reads
  // it as ink on paper. Cropping both cards side by side says why: OUR road is a
  // near-white body inside a near-black casing — the polarity of a printed street
  // plan. BOTH references are the other way round: a mid-grey asphalt BODY inside a
  // PALE KERB, which is what an aerial photograph of a road actually looks like.
  // So the fills come down to asphalt (arterial 95,105,102 authored vs ref03's
  // measured 91.5,100.8,98.4) and the casing becomes the pale KERB_RGB below.
  //
  // The tint is deliberate and is target 2's carrier: `_px`'s `sat` is computed
  // from the region's MEAN rgb, so it is a colour-CAST number, and the roads are
  // the largest single-tone area on the card. R is held ~12% under G on every road
  // class, matching ref03's card mean (65.5,72,68.6 -> 0.091).
  const ROAD_FILL = {
    freeway: '#9c8442', arterial: '#5f6966', street: '#59635f',
    lane: '#454e4a', loop: '#4d5754',
  };
  // The pale kerb the body sits inside is `KERB_RGB` (200,228,212),
  // defined next to kerbAt() because its value is modulated along the road.
  const C_LAND = '#050805';
  const C_WATER = '#091820';
  const C_PARK = '#091405';
  let city = null;
  let mapLevels = null;
  let grungeTex = null;
  let plateSplatTex = null;

  function hashRng(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  /** Irregular closed blob — parks, bays, ink splats. */
  function blob(bx, bz, rx, rz, seed, n = 16) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + jit(i, seed) * 0.22 + jit(i * 3 + 1, seed + 2) * 0.12;
      pts.push([bx + Math.cos(a) * rx * k, bz + Math.sin(a) * rz * k]);
    }
    return pts;
  }

  /** Recursive parcel split of one city block into frontage-sized footprints. */
  function subdivide(x0, z0, x1, z1, rnd, depth, out) {
    const w = x1 - x0, d = z1 - z0;
    if (depth >= 4 || (w < 46 && d < 46)) {
      if (w > 9 && d > 9) out.push([x0, z0, x1, z1]);
      return;
    }
    const t = 0.34 + rnd() * 0.32;
    if (w > d) {
      const mx = x0 + w * t;
      subdivide(x0, z0, mx, z1, rnd, depth + 1, out);
      subdivide(mx, z0, x1, z1, rnd, depth + 1, out);
    } else {
      const mz = z0 + d * t;
      subdivide(x0, z0, x1, mz, rnd, depth + 1, out);
      subdivide(x0, mz, x1, z1, rnd, depth + 1, out);
    }
  }

  // -------------------------------------------------------------------------
  // city model
  //
  // LAYOUT gives one uniform 160 m grid, an extent and the interstate — no road
  // class, no land use. Everything else below is *derived* so the plan reads as
  // a place rather than graph paper: every third grid line is promoted to an
  // arterial, two diagonal boulevards cut across the grain, mid-block service
  // lanes are hashed in per cell, the land ends at a wobbling coastline with a
  // green belt and two suburban loop roads outside the grid, and each block is
  // recursively subdivided into parcels.
  // -------------------------------------------------------------------------
  function buildCity() {
    if (city || !layout) return city;
    const g = layout.grid, EX = layout.extent, HZ = layout.highwayZ;
    const COAST = EX + 170;
    const roads = [], buildings = [], greens = [], water = [], cellsTone = [];

    const seg = (x0, z0, x1, z1, cls) => roads.push({ pts: [[x0, z0], [x1, z1]], cls });

    // ---- coastline: west and south, both irregular ------------------------
    const westShore = [], southShore = [];
    for (let i = 0; i <= 26; i++) {
      const z = MAP_MIN + (MAP_SPAN * i) / 26;
      westShore.push([-COAST + Math.sin(z * 0.0072) * 54 + jit(i, 4.2) * 20, z]);
    }
    for (let i = 0; i <= 26; i++) {
      const x = MAP_MIN + (MAP_SPAN * i) / 26;
      southShore.push([x, COAST + Math.sin(x * 0.0058 + 1.7) * 46 + jit(i, 9.1) * 18]);
    }
    water.push([[MAP_MIN - 60, MAP_MIN - 60], ...westShore, [MAP_MIN - 60, MAP_MAX + 60]]);
    water.push([...southShore, [MAP_MAX + 60, MAP_MAX + 60], [MAP_MIN - 60, MAP_MAX + 60]]);
    // a bay bitten out of the south-west corner, with a marina pier
    water.push(blob(-430, 600, 130, 74, 3.3, 18));

    // ---- green belt between the grid and the shore ------------------------
    greens.push({
      poly: [...westShore, ...westShore.slice().reverse().map(([x, z]) => [x + 132, z])],
      dens: 2600, seed: 41,
    });
    greens.push({
      poly: [...southShore, ...southShore.slice().reverse().map(([x, z]) => [x, z - 124])],
      dens: 2600, seed: 57,
    });
    // scrub either side of the interstate
    greens.push({ poly: [[-980, HZ - 120], [980, HZ - 132], [980, HZ - 58], [-980, HZ - 52]], dens: 3400, seed: 73 });
    greens.push({ poly: [[-980, HZ + 52], [980, HZ + 60], [980, HZ + 150], [-980, HZ + 140]], dens: 3400, seed: 91 });
    // parkland out past the eastern edge of the built-up area
    greens.push({ poly: blob(905, 30, 74, 420, 5.5, 20), dens: 2200, seed: 113 });

    // ---- the classified grid ---------------------------------------------
    // LAYOUT's 7x7 grid only covers the core; the plan is continued two blocks
    // east and one north on the same 160 m module so the card is never half
    // empty at the edges, which is what makes a map look authored.
    const GXX = [...g, 640, 800];
    const GXZ = [-640, ...g];
    const cls = (v) => (v % 480 === 0 ? 'arterial' : 'street');
    for (const v of GXZ) seg(-COAST + 40, v, 880, v, cls(v));
    for (const v of GXX) seg(v, -680, v, COAST - 20, cls(v));
    // two diagonal boulevards cutting across the grain of the grid
    seg(-620, 520, 540, -560, 'arterial');
    seg(-540, -600, 300, 660, 'street');
    // the interstate, straight out of the world data, plus its slip road
    seg(-980, HZ, 980, HZ, 'freeway');
    roads.push({ pts: [[0, -EX], [-16, HZ + 150], [-64, HZ + 66], [-150, HZ + 26]], cls: 'street' });
    roads.push({ pts: [[120, -EX], [140, HZ + 170], [210, HZ + 70], [320, HZ + 30]], cls: 'street' });
    // coast roads riding just inland of both shores
    roads.push({ pts: westShore.map(([x, z]) => [x + 64, z]), cls: 'street' });
    roads.push({ pts: southShore.map(([x, z]) => [x, z - 58]), cls: 'street' });

    // ---- suburban loop roads out past the grid ----------------------------
    const loops = [[-648, -230, 42], [-644, 300, 38], [905, -420, 52]];
    for (let li = 0; li < loops.length; li++) {
      const [lx, lz, lr] = loops[li];
      const ring = [];
      for (let i = 0; i <= 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        ring.push([lx + Math.cos(a) * lr * (1 + jit(i, 8 + li) * 0.09),
          lz + Math.sin(a) * lr * (1.24 + jit(i, 20 + li) * 0.09)]);
      }
      roads.push({ pts: ring, cls: 'loop' });
      seg(lx, lz - lr * 1.24, lx, lz - lr * 1.24 - 70, 'lane');
      // houses strung along the ring
      const rnd = hashRng(300 + li * 13);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const rr = lr * (i % 2 ? 1.42 : 0.6);
        buildings.push({
          x: lx + Math.cos(a) * rr - 8, z: lz + Math.sin(a) * rr * 1.24 - 7,
          w: 13 + rnd() * 7, d: 11 + rnd() * 7, tone: 0.3 + rnd() * 0.3,
        });
      }
    }

    // ---- blocks: land-use, parcels, mid-block lanes -----------------------
    for (let i = 0; i < GXX.length - 1; i++) {
      for (let j = 0; j < GXZ.length - 1; j++) {
        const rnd = hashRng(i * 131 + j * 17 + 5);
        const x0 = GXX[i] + layout.roadW * 0.5 + 5, x1 = GXX[i + 1] - layout.roadW * 0.5 - 5;
        const z0 = GXZ[j] + layout.roadW * 0.5 + 5, z1 = GXZ[j + 1] - layout.roadW * 0.5 - 5;
        const outer = GXX[i] >= 480 || GXZ[j] < -480;
        const r = rnd() * (outer ? 1.22 : 1);
        if (r > 0.87) {
          greens.push({
            poly: blob((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) * 0.46, (z1 - z0) * 0.46, i * 7 + j, 18),
            dens: 700, seed: 400 + i * 9 + j,
          });
          continue;
        }
        cellsTone.push({ x0, z0, x1, z1, tone: rnd() });

        // a service lane through the block, one axis or the other, not always
        const lane = rnd();
        if (lane > 0.62 || outer) {
          const mx = (x0 + x1) / 2 + (rnd() - 0.5) * 34;
          seg(mx, GXZ[j], mx, GXZ[j + 1], 'lane');
        } else if (lane > 0.34) {
          const mz = (z0 + z1) / 2 + (rnd() - 0.5) * 34;
          seg(GXX[i], mz, GXX[i + 1], mz, 'lane');
        }

        // parcels
        const parcels = [];
        subdivide(x0, z0, x1, z1, rnd, 0, parcels);
        const tower = !outer && rnd() > 0.55 ? Math.floor(rnd() * parcels.length) : -1;
        for (let k = 0; k < parcels.length; k++) {
          if (rnd() > (outer ? 0.7 : 0.86)) continue;   // vacant lot / yard
          const ins = outer ? 6 + rnd() * 9 : 2 + rnd() * 4;
          const [a0, b0, a1, b1] = parcels[k];
          const w = a1 - a0 - ins * 2, d = b1 - b0 - ins * 2;
          if (w < 7 || d < 7) continue;
          buildings.push({
            x: a0 + ins, z: b0 + ins, w, d,
            tone: k === tower ? 0.92 + rnd() * 0.08 : 0.18 + rnd() * 0.62,
            big: k === tower,
          });
        }
      }
    }

    // ---- low-density tracts filling the land between the grid and the coast,
    // so the card never shows an empty slab whichever way the car is facing --
    const tract = (tx0, tz0, tx1, tz1, seed) => {
      const rnd = hashRng(seed);
      const stepX = 84 + rnd() * 26, stepZ = 78 + rnd() * 26;
      const nx = Math.max(1, Math.round((tx1 - tx0) / stepX));
      const nz = Math.max(1, Math.round((tz1 - tz0) / stepZ));
      for (let i = 1; i < nx; i++) {
        const lx = tx0 + ((tx1 - tx0) * i) / nx;
        seg(lx, tz0 + 6, lx, tz1 - 6, 'lane');
      }
      for (let j = 1; j < nz; j++) {
        const lz = tz0 + ((tz1 - tz0) * j) / nz;
        seg(tx0 + 6, lz, tx1 - 6, lz, 'lane');
      }
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const cx0 = tx0 + ((tx1 - tx0) * i) / nx + 12;
          const cz0 = tz0 + ((tz1 - tz0) * j) / nz + 12;
          const cw = (tx1 - tx0) / nx - 24, cd = (tz1 - tz0) / nz - 24;
          if (cw < 16 || cd < 16) continue;
          if (rnd() > 0.86) {
            greens.push({ poly: blob(cx0 + cw / 2, cz0 + cd / 2, cw * 0.42, cd * 0.42, i * 5 + j, 14),
              dens: 620, seed: 5000 + seed + i * 11 + j });
            continue;
          }
          const rows = 2, cols = Math.max(2, Math.round(cw / 30));
          for (let a = 0; a < cols; a++) {
            for (let b = 0; b < rows; b++) {
              if (rnd() > 0.74) continue;
              buildings.push({
                x: cx0 + (cw / cols) * a + 3, z: cz0 + (cd / rows) * b + 4,
                w: cw / cols - 7 - rnd() * 4, d: cd / rows - 10 - rnd() * 6,
                tone: 0.22 + rnd() * 0.4,
              });
            }
          }
        }
      }
    };
    tract(-COAST + 96, -640, -500, COAST - 104, 1201);
    tract(-500, 500, 800, COAST - 104, 1303);
    tract(820, -640, 960, COAST - 104, 1409);
    tract(-COAST + 96, HZ + 170, 960, -660, 1511);

    // ---- industrial sheds north of the interstate -------------------------
    const rndI = hashRng(777);
    for (let i = 0; i < 34; i++) {
      buildings.push({
        x: -900 + rndI() * 1760, z: HZ - 300 + rndI() * 130,
        w: 40 + rndI() * 90, d: 26 + rndI() * 40, tone: 0.24 + rndI() * 0.2,
      });
    }
    for (let i = 0; i < 5; i++) seg(-820 + i * 380, HZ - 320, -800 + i * 380, HZ - 150, 'lane');
    seg(-980, HZ - 330, 980, HZ - 316, 'street');

    // ---- landmarks: a stadium bowl and a civic plaza, so the core has two
    // things that are not a block ----------------------------------------
    const stad = { x: g[1] + 80, z: g[4] + 80 };
    const bowl = [];
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      bowl.push([stad.x + Math.cos(a) * 62, stad.z + Math.sin(a) * 48]);
    }
    roads.push({ pts: bowl, cls: 'loop' });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      buildings.push({
        x: stad.x + Math.cos(a) * 44 - 9, z: stad.z + Math.sin(a) * 33 - 7,
        w: 18, d: 14, tone: 0.55 + (i % 3) * 0.12,
      });
    }
    greens.push({ poly: blob(stad.x, stad.z, 26, 20, 6.1, 14), dens: 5000, seed: 611 });

    const plaza = { x: g[4] - 60, z: g[2] + 70 };
    greens.push({ poly: blob(plaza.x, plaza.z, 54, 44, 2.7, 18), dens: 900, seed: 623 });

    const goal = { x: g[5], z: g[2] };
    city = { roads, buildings, greens, water, cellsTone, goal, g, EX };
    return city;
  }

  // -------------------------------------------------------------------------
  // tile bake
  // -------------------------------------------------------------------------
  // r15 SPATIAL STATISTICS. r14 fixed the card's VALUE RANGE and the wave-O critic
  // still called it real-vs-fake on sight, for two reasons that are both spatial:
  // the network was a CONSTANT-WIDTH ORTHOGONAL grid, and (see ROAD_FILL) the road
  // was drawn with the polarity of an ink plan rather than an aerial plate.
  //
  // Both references draw a road as an ASPHALT RIBBON: a mid-grey body inside a pale
  // kerb, whose two edges are never parallel and whose centre line bows even where
  // the plan is a straight grid line. A single `stroke()` of a 2-point polyline at
  // one `lineWidth` cannot produce either. So a road now gets a SPINE — resampled
  // every ROAD_STEP metres and displaced perpendicular to its own axis by a
  // two-octave sine of arc length — and is drawn span by span, each span at its own
  // width from a third sine times a per-road scale. Round caps/joins (set globally
  // in bakeMapTile) weld the spans into one continuous tapering ribbon.
  //
  // RANGE CHECK, the wave-P bug class, done before writing the gains: what consumes
  // these numbers is a 1024 px tile over MAP_SPAN 1960 m = 0.522 px/m, blitted into
  // a ~340 px card, i.e. ~0.17 SCREEN px per metre. A lane (ROAD_W 8) is 1.4 screen
  // px wide. So the width term has to be a FRACTION of the road's own width — an
  // absolute metre jitter big enough to see on a freeway would erase every lane —
  // and the bow amplitude is likewise scaled by width, because a bow approaching the
  // 160 m block module would walk arterials straight through their own parcels.
  // Both are therefore expressed in road widths and neither can exceed its carrier.
  const ROAD_STEP = 24;    // m between spine samples
  const ROAD_BOW = 0.30;   // perpendicular bow amplitude, in road widths
  const ROAD_WJ = 0.30;    // along-length width modulation, fraction of width
  const ROAD_WR = 0.17;    // per-road width scale spread, fraction of width

  /** Resampled, perpendicular-displaced centre line: [x, z, arcLength] per sample. */
  function roadSpine(r, id) {
    if (r.spine) return r.spine;
    const w = ROAD_W[r.cls] || 10;
    // pass 1: resample the plan polyline at ROAD_STEP and carry arc length + axis
    const s0 = [];
    let acc = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const [x0, z0] = r.pts[i - 1], [x1, z1] = r.pts[i];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 1e-6) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      const n = Math.max(1, Math.round(L / ROAD_STEP));
      for (let k = s0.length ? 1 : 0; k <= n; k++) {
        const t = k / n;
        s0.push([x0 + ux * L * t, z0 + uz * L * t, acc + L * t, ux, uz]);
      }
      acc += L;
    }
    if (s0.length < 2) { r.spine = r.pts.map(([x, z]) => [x, z, 0]); return r.spine; }
    // pass 2: displace. The envelope pins both ends to the plan so junctions,
    // the coastline and the closed loops stay registered where they were authored.
    const tot = acc || 1;
    const k1 = (Math.PI * 2) / (16.0 * w + 320), ph1 = jit(id, 3.1) * 6.283;
    const k2 = k1 * 2.7, ph2 = jit(id, 5.7) * 6.283;
    const A = ROAD_BOW * w;
    r.spine = s0.map(([x, z, d, ux, uz]) => {
      const env = Math.sqrt(Math.max(0, Math.sin((Math.PI * d) / tot)));
      const off = (A * env * (Math.sin(d * k1 + ph1) + 0.42 * Math.sin(d * k2 + ph2))) / 1.42;
      return [x - uz * off, z + ux * off, d];
    });
    return r.spine;
  }

  /** Width multiplier at arc length d — shared by casing and fill so the kerb
   *  margin is scaled, never inverted (casing (W+C)*f always exceeds fill W*f). */
  function roadWidthAt(r, id, d) {
    const w = ROAD_W[r.cls] || 10;
    const k3 = (Math.PI * 2) / (7.5 * w + 95), ph3 = jit(id, 9.3) * 6.283;
    const wob = 0.62 * Math.sin(d * k3 + ph3) + 0.38 * Math.sin(d * k3 * 1.9 + ph3 * 1.4);
    return (1 + ROAD_WR * jit(id, 1.7)) * (1 + ROAD_WJ * wob);
  }

  /** Span-by-span ribbon at varying width. Use with OPAQUE styles only: spans
   *  overlap at their round caps, so a translucent style beads at every joint. */
  function strokeRoad(g2, r, width, style, id) {
    const sp = roadSpine(r, id);
    if (typeof style === 'string') g2.strokeStyle = style;
    for (let i = 1; i < sp.length; i++) {
      const dm = (sp[i - 1][2] + sp[i][2]) * 0.5;
      if (typeof style === 'function') g2.strokeStyle = style(dm, id);
      g2.lineWidth = Math.max(0.7, width * roadWidthAt(r, id, dm));
      g2.beginPath();
      g2.moveTo(sp[i - 1][0], sp[i - 1][1]);
      g2.lineTo(sp[i][0], sp[i][1]);
      g2.stroke();
    }
  }

  /** Kerb value along arc length: 0.55x-1.05x of KERB_RGB, two octaves, per road. */
  const KERB_RGB = [200, 228, 212];
  function kerbAt(d, id) {
    const k = (Math.PI * 2) / 420, ph = jit(id, 4.9) * 6.283;
    const m = 0.80 + 0.25 * (0.66 * Math.sin(d * k + ph) + 0.34 * Math.sin(d * k * 2.3 - ph * 0.7));
    return `rgb(${Math.round(KERB_RGB[0] * m)},${Math.round(KERB_RGB[1] * m)},${Math.round(KERB_RGB[2] * m)})`;
  }

  /** One continuous path along the same spine at one width — for the translucent
   *  wear wash and for the dashed centre line, which needs an unbroken dash phase. */
  function strokeSpine(g2, r, width, style, id) {
    const sp = roadSpine(r, id);
    g2.strokeStyle = style;
    g2.lineWidth = width;
    g2.beginPath();
    g2.moveTo(sp[0][0], sp[0][1]);
    for (let i = 1; i < sp.length; i++) g2.lineTo(sp[i][0], sp[i][1]);
    g2.stroke();
  }

  function pathPoly(g2, pts) {
    g2.beginPath();
    g2.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g2.lineTo(pts[i][0], pts[i][1]);
    g2.closePath();
  }

  function bakeMapTile(size) {
    const C = buildCity();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g2 = c.getContext('2d');
    const ppm = size / MAP_SPAN;
    // author in metres; tile pixel y runs with -z so the tile is north-up
    g2.setTransform(ppm, 0, 0, -ppm, -MAP_MIN * ppm, MAP_MAX * ppm);
    g2.lineJoin = 'round';
    g2.lineCap = 'round';

    // --- land ------------------------------------------------------------
    g2.fillStyle = C_LAND;
    g2.fillRect(MAP_MIN, MAP_MIN, MAP_SPAN, MAP_SPAN);

    // block ground: a tonal patchwork, so the land is never one flat value
    for (const t of C.cellsTone) {
      // r14: 44-74 -> 5-39. Slightly wider spread, floor dropped by 39.
      const v = 1 + Math.round(t.tone * 34);
      const warm = t.tone > 0.55;
      g2.fillStyle = warm ? `rgb(${v + 2},${v + 5},${v - 1})` : `rgb(${v - 3},${v + 4},${v + 2})`;
      g2.fillRect(t.x0 - 6, t.z0 - 6, t.x1 - t.x0 + 12, t.z1 - t.z0 + 12);
    }

    // --- water -------------------------------------------------------------
    for (const p of C.water) {
      pathPoly(g2, p);
      g2.fillStyle = C_WATER;
      g2.fill();
      // shoreline lift plus a surf line, so the coast has an edge treatment
      g2.strokeStyle = 'rgba(150,196,206,0.22)';
      g2.lineWidth = 5;
      g2.stroke();
      g2.strokeStyle = 'rgba(8,16,20,0.55)';
      g2.lineWidth = 1.6;
      g2.stroke();
    }
    // depth banding out to sea
    g2.save();
    for (const p of C.water) { pathPoly(g2, p); g2.clip(); break; }
    g2.restore();

    // --- greens + tree stipple --------------------------------------------
    for (const gr of C.greens) {
      g2.save();
      pathPoly(g2, gr.poly);
      g2.fillStyle = C_PARK;
      g2.fill();
      g2.strokeStyle = 'rgba(18,30,16,0.5)';
      g2.lineWidth = 2;
      g2.stroke();
      g2.clip();
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const [x, z] of gr.poly) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      const rnd = hashRng(gr.seed);
      const n = Math.min(500, Math.round(((x1 - x0) * (z1 - z0)) / gr.dens));
      for (let i = 0; i < n; i++) {
        const tx = x0 + rnd() * (x1 - x0), tz = z0 + rnd() * (z1 - z0);
        const tr = 5 + rnd() * 6;
        g2.fillStyle = 'rgba(6,14,6,0.42)';
        g2.beginPath(); g2.arc(tx + 2, tz - 2, tr, 0, Math.PI * 2); g2.fill();
        // r14 tree crowns: 66-112 -> 28-84. Canopy in an aerial is one of the
        // darkest things in frame and it is what carries the card's green cast.
        const v = 28 + Math.round(rnd() * 56);
        g2.fillStyle = `rgb(${Math.round(v * 0.62)},${v},${Math.round(v * 0.5)})`;
        g2.beginPath(); g2.arc(tx, tz, tr, 0, Math.PI * 2); g2.fill();
      }
      g2.restore();
    }

    // --- building footprints, all shadowed from the same direction ---------
    for (const b of C.buildings) {
      // r14: alpha 0.62/0.46 -> 0.80/0.66. Over the new land these land at 5-8.
      g2.fillStyle = b.big ? 'rgba(1,2,3,0.88)' : 'rgba(2,4,5,0.78)';
      const so = b.big ? 7 : 3.4;
      g2.fillRect(b.x + so, b.z - so, b.w, b.d);
    }
    for (const b of C.buildings) {
      // r14 roofs: 60-144 -> 13-131. The floor is what matters: an aerial's
      // building masses run to black, and `tone` is uniform over 0.18-0.80 for
      // ordinary parcels so most roofs now sit 34-107 with a genuine black tail,
      // while the `big` towers (tone 0.92-1.00) still take a bright sunlit roof.
      const v = b.big ? 196 + Math.round((b.tone - 0.92) * 300) : 14 + Math.round(b.tone * 175);
      // three roof families - warm tar, cool concrete, dark plant - so the
      // parcels are a texture rather than one repeated swatch
      const fam = (b.tone * 7.31) % 1;
      g2.fillStyle = fam < 0.34
        ? `rgb(${Math.round(v * 0.95)},${v},${Math.round(v * 0.93)})`
        : fam < 0.72
          ? `rgb(${Math.round(v * 0.90)},${v + 2},${v})`
          : `rgb(${Math.round(v * 0.76)},${Math.round(v * 0.85)},${Math.round(v * 0.80)})`;
      g2.fillRect(b.x, b.z, b.w, b.d);
      // lit north-west roof edge — one pixel of relief is what stops the
      // footprints reading as flat vector rectangles
      g2.fillStyle = `rgba(255,255,248,${0.06 + b.tone * 0.09})`;
      g2.fillRect(b.x, b.z + b.d - 2.2, b.w, 2.2);
      g2.fillRect(b.x, b.z, 2.2, b.d);
      g2.fillStyle = 'rgba(0,0,0,0.45)';
      g2.fillRect(b.x + b.w - 1.8, b.z, 1.8, b.d);
    }

    // --- roads: pale kerb, asphalt body, wear, then centre paint -----------
    // r15 POLARITY. The kerb is drawn FIRST and WIDE and the asphalt body over it,
    // so what survives outside the body is a thin light edge — the opposite of the
    // r14 order, which put a near-black casing outside a near-white body.
    // The kerb's own BRIGHTNESS is modulated along arc length too. A kerb held at
    // one value all the way round the network is an outline, and an outline is the
    // cartographic read the critic called; in both references the pale edge fades
    // in and out along a road and disappears entirely in places. Opaque all the way
    // (the value moves, not the alpha) so the spans still cannot bead at a joint.
    for (let i = 0; i < C.roads.length; i++) strokeRoad(g2, C.roads[i],
      ROAD_W[C.roads[i].cls] + ROAD_CASE[C.roads[i].cls], kerbAt, i);
    for (let i = 0; i < C.roads.length; i++) strokeRoad(g2, C.roads[i],
      ROAD_W[C.roads[i].cls], ROAD_FILL[C.roads[i].cls], i);
    // per-segment wear: a faint dark wash over a third of the network. Single
    // path, not spans — it is translucent and would bead at every span joint.
    for (let i = 0; i < C.roads.length; i++) {
      if (jit(i, 6.7) < 0.25) continue;
      strokeSpine(g2, C.roads[i], ROAD_W[C.roads[i].cls] - 2,
        `rgba(12,15,14,${0.10 + Math.abs(jit(i, 2.3)) * 0.20})`, i);
    }
    g2.setLineDash([16, 13]);
    for (let i = 0; i < C.roads.length; i++) {
      const r = C.roads[i];
      if (r.cls !== 'arterial' && r.cls !== 'freeway') continue;
      strokeSpine(g2, r, r.cls === 'freeway' ? 3.4 : 2.2,
        r.cls === 'freeway' ? 'rgba(226,206,150,0.55)' : 'rgba(222,230,214,0.42)', i);
    }
    g2.setLineDash([]);

    // --- rail line with sleepers ------------------------------------------
    const railZ = layout.highwayZ + 250;
    g2.strokeStyle = 'rgba(226,230,222,0.55)';
    g2.lineWidth = 4.5;
    g2.beginPath(); g2.moveTo(-980, railZ); g2.lineTo(980, railZ + 26); g2.stroke();
    g2.setLineDash([5, 11]);
    g2.strokeStyle = 'rgba(20,26,24,0.85)';
    g2.lineWidth = 9;
    g2.beginPath(); g2.moveTo(-980, railZ); g2.lineTo(980, railZ + 26); g2.stroke();
    g2.setLineDash([]);

    // --- tonal pass: large soft blotches then fine grain -------------------
    g2.setTransform(1, 0, 0, 1, 0, 0);
    const rndT = hashRng(2024);
    g2.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 64; i++) {
      const bx = rndT() * size, by = rndT() * size, br = size * (0.04 + rndT() * 0.17);
      const warm = rndT() > 0.5;
      const gr = g2.createRadialGradient(bx, by, 0, bx, by, br);
      gr.addColorStop(0, warm ? 'rgba(255,230,188,0.20)' : 'rgba(112,154,190,0.19)');
      gr.addColorStop(1, 'rgba(128,128,128,0)');
      g2.fillStyle = gr;
      g2.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    // r14: THE BLACK FLOOR WAS THIS PASS, not the palette.
    // `grainTex` is a 64x64 sheet of grey 120-180 at a constant alpha of 16/255,
    // and it was being composited SOURCE-OVER twice (alpha 1, then 0.8 at 2.7x
    // scale). That is a pure additive lift of about 0.063 + 0.8*0.063 = 0.113
    // toward luma ~150, i.e. every pixel in the card got a floor of ~17 no
    // matter what was underneath it. The measured histogram agreed exactly:
    // p01 16.3 and 1.14% of pixels below 16, a wall sitting one code value above
    // the threshold. Darkening the palette alone moved p01 only 16.3 -> 14.3
    // because this pass put it straight back.
    // Composited 'overlay' the same sheet is zero-mean about grey 128: it still
    // modulates the midtones and the road fills, but it scales with the signal,
    // which is how film grain behaves and is why an aerial plate can be dark
    // AND grainy at the same time.
    g2.globalCompositeOperation = 'overlay';
    const gp = g2.createPattern(grainTex, 'repeat');
    if (gp) {
      g2.globalAlpha = 1;
      g2.fillStyle = gp;
      g2.fillRect(0, 0, size, size);
      g2.save();
      g2.globalAlpha = 0.8;
      g2.scale(2.7, 2.7);
      g2.fillStyle = gp;
      g2.fillRect(0, 0, size, size);
      g2.restore();
    }
    g2.globalCompositeOperation = 'source-over';
    g2.globalAlpha = 1;
    return c;
  }

  /** Bake once, then keep a half-size level so the blit is never over-minified. */
  function mapTileFor(neededPx) {
    if (!mapLevels) {
      const big = bakeMapTile(1024);
      const half = document.createElement('canvas');
      half.width = half.height = 512;
      const hg = half.getContext('2d');
      hg.imageSmoothingQuality = 'high';
      hg.drawImage(big, 0, 0, 512, 512);
      mapLevels = [big, half];
    }
    return neededPx > 560 ? mapLevels[0] : mapLevels[1];
  }

  /** Torn ink splat that the whole corner assembly bleeds out of. */
  function makeGrungeTexture() {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 240;
    const g2 = c.getContext('2d');
    const rnd = hashRng(19);
    g2.fillStyle = 'rgba(6,9,11,1)';
    for (let i = 0; i < 54; i++) {
      // biased toward the centre mass, so the splat hugs the card and only
      // frays outward rather than throwing loose polygons into the frame
      const b1 = (rnd() + rnd() + rnd()) / 3;
      const b2 = (rnd() + rnd() + rnd()) / 3;
      const bx = 180 + (b1 - 0.5) * 380, by = 128 + (b2 - 0.5) * 250;
      const rx = 26 + rnd() * 62, ry = 16 + rnd() * 34;
      g2.globalAlpha = 0.10 + rnd() * 0.16;
      pathPoly(g2, blob(bx, by, rx, ry, i * 3.1, 26));
      g2.fill();
    }
    for (let i = 0; i < 260; i++) {
      const bx = rnd() * 360, by = rnd() * 240;
      const d = Math.hypot((bx - 180) / 180, (by - 120) / 120);
      g2.globalAlpha = Math.max(0, 0.62 - d * 0.24) * rnd();
      g2.beginPath();
      g2.arc(bx, by, 0.6 + rnd() * 3.4, 0, Math.PI * 2);
      g2.fill();
    }
    g2.globalAlpha = 1;
    return c;
  }

  /**
   * Wide torn-ink banner for the top-centre street-plate group.
   *
   * `makeGrungeTexture` could not be reused directly here. It is authored square-
   * ish (360x240) for the minimap card, its blobs top out at alpha 0.26 so the
   * deposit never gets past dark grey, and its speckle pass fills the whole canvas
   * rect at up to 0.28 alpha even in the corners - stretch that to a 2.5:1 banner
   * and the texture's own bounding box shows as a straight-sided grey slab. This
   * builds the silhouette out of a spine of tapered opaque blobs instead, so the
   * edge is torn by construction and there is no rectangle to give away, and it
   * carries a genuinely opaque middle: hud-overlay-01 reads p01 7.9 and 1.61% of
   * pixels below luma 16 behind its plate, which no amount of grey will reach.
   */
  function makePlateSplat() {
    const c = document.createElement('canvas');
    const CW = 512, CH = 232, spine = 102;
    c.width = CW; c.height = CH;
    const g2 = c.getContext('2d');
    const rnd = hashRng(53);
    g2.fillStyle = 'rgba(4,7,10,1)';

    // 1. body: blobs marched along the spine, tapering to nothing at both ends.
    // The spine sits at 0.44 of the height, not the middle: the ink has to be
    // present immediately under the plate (the region the gap is measured in is
    // 2-13 px below the plate's bottom edge) and may thin out under the distance
    // readout, which is what both references do.
    for (let i = 0; i < 50; i++) {
      const t = i / 49;
      const taper = Math.pow(Math.sin(Math.PI * t), 0.40);
      const bx = 22 + t * (CW - 44) + (rnd() - 0.5) * 34;
      const by = spine + (rnd() - 0.5) * 40 * taper;
      const rx = 20 + rnd() * 34;
      const ry = (22 + rnd() * 76) * taper;
      g2.globalAlpha = 0.5 + rnd() * 0.5;
      pathPoly(g2, blob(bx, by, rx, ry, i * 2.7, 34));
      g2.fill();
    }
    // 2. opaque core through the middle, so the deposit really is black
    g2.globalAlpha = 1;
    for (let i = 0; i < 18; i++) {
      const t = 0.14 + (i / 17) * 0.72;
      const bx = 22 + t * (CW - 44) + (rnd() - 0.5) * 26;
      const by = spine + (rnd() - 0.5) * 40;
      pathPoly(g2, blob(bx, by, 24 + rnd() * 32, 22 + rnd() * 34, 100 + i * 3.3, 28));
      g2.fill();
    }
    // 3. tear the silhouette back: bites taken out of the rim with
    // destination-out, so the outline is concave in places instead of being the
    // convex hull of a row of ellipses
    g2.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const t = rnd();
      const side = rnd() < 0.5 ? -1 : 1;
      const bx = 22 + t * (CW - 44);
      const by = spine + side * (34 + rnd() * 74);
      g2.globalAlpha = 0.55 + rnd() * 0.45;
      pathPoly(g2, blob(bx, by, 16 + rnd() * 40, 14 + rnd() * 40, 200 + i * 5.1, 24));
      g2.fill();
    }
    g2.globalCompositeOperation = 'source-over';
    // 4. spray: the loose flecks that stop the silhouette reading as one shape.
    // Density falls with distance from the spine and from the horizontal centre,
    // so the flecks trail off the ends rather than boxing the texture in.
    for (let i = 0; i < 2200; i++) {
      const bx = rnd() * CW, by = rnd() * CH;
      const dx2 = Math.abs(bx - CW * 0.5) / (CW * 0.5);
      const dy2 = Math.abs(by - spine) / (CH * 0.52);
      const d = Math.hypot(dx2 * 1.02, dy2);
      if (d > 1) continue;
      g2.globalAlpha = Math.pow(1 - d, 1.7) * (0.2 + rnd() * 0.8);
      g2.beginPath();
      g2.arc(bx, by, 0.5 + rnd() * 4.2, 0, Math.PI * 2);
      g2.fill();
    }
    g2.globalAlpha = 1;
    return c;
  }

  /** Nearest grid intersection to a world point, used to snap the route. */
  function snapGrid(v, g) {
    let b = g[0];
    for (const q of g) if (Math.abs(q - v) < Math.abs(b - v)) b = q;
    return b;
  }

  /** L-shaped route from the car to the objective, riding real grid streets. */
  function routeLine(px, pz, C) {
    const gz = snapGrid(pz, C.g);
    return [
      [px, pz], [px, gz], [C.goal.x, gz], [C.goal.x, C.goal.z],
    ].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1);
  }

  function districtOf(px, pz) {
    if (layout && pz < layout.highwayZ + 160) return 'INTERSTATE';
    if (pz < -160) return px < 0 ? 'MOTOR CITY' : 'DOWNTOWN';
    if (pz > 160) return px < 0 ? 'SILVER LAKE' : 'HARBOUR TOWN';
    return px < 0 ? 'RIVER CITY' : 'PARADISE KEYS';
  }

  function streetOf(px, pz) {
    if (!layout) return '';
    const g = layout.grid;
    let bz = 0, bzd = 1e9, bx = 0, bxd = 1e9;
    for (let i = 0; i < g.length; i++) {
      const dz = Math.abs(pz - g[i]);
      if (dz < bzd) { bzd = dz; bz = i; }
      const dx = Math.abs(px - g[i]);
      if (dx < bxd) { bxd = dx; bx = i; }
    }
    return bzd <= bxd
      ? { name: STREETS_EW[bz % STREETS_EW.length], sfx: 'AV' }
      : { name: STREETS_NS[bx % STREETS_NS.length], sfx: 'ST' };
  }

  const CARD_ROT = -0.032;   // the whole map+plate assembly is one skewed card

  /**
   * The plate outline: a wobbled quad with a chamfered lower-left corner. Every
   * edge carries a low-frequency deckle so it reads as a torn card rather than
   * a CSS box, and no two edges are parallel.
   */
  function platePath(x, y, w, h, seed) {
    const ch = Math.min(w, h) * 0.17;
    const corners = [
      [x + 4 * S, y + 6 * S],
      [x + w - 2 * S, y - 3 * S],
      [x + w + 3 * S, y + h - 5 * S],
      [x + ch, y + h + 3 * S],
      [x - 3 * S, y + h - ch * 0.8],
    ];
    const pts = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i], b = corners[(i + 1) % corners.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.max(1, Math.hypot(dx, dy));
      const n = Math.max(2, Math.round(len / (14 * S)));
      const nx = -dy / len, ny = dx / len;
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const wob = (jit(i * 17 + k, seed) * 0.9 + jit(i * 5 + k * 3, seed + 4) * 0.55) * 1.6 * S;
        pts.push([a[0] + dx * u + nx * wob, a[1] + dy * u + ny * wob]);
      }
    }
    return pts;
  }

  function drawMinimap(s) {
    const G = minimapGeometry();
    const { x, y, w, h } = G;
    const px = s.pos ? s.pos.x : 0, pz = s.pos ? s.pos.z : 0;
    const yaw = s.yaw || 0;
    const C = buildCity();

    // The plate and the name plate share one rotation about the card centre so they
    // read as a single object pinned to the corner, as in the reference HUD.
    ctx.save();
    ctx.translate(x + w / 2, y + h * 0.35);
    ctx.rotate(CARD_ROT);
    ctx.translate(-(x + w / 2), -(y + h * 0.35));

    // ---- torn ink splat under the whole assembly --------------------------
    if (!grungeTex) grungeTex = makeGrungeTexture();
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(grungeTex, x - 84 * S, y - 104 * S, w + 128 * S, h + 152 * S);
    ctx.restore();

    // ---- district plate above the card -----------------------------------
    drawType('Paradise City', x + w - 6 * S, y - 44 * S, {
      size: 24 * S, weight: 700, align: 'right', slant: 0.24, condense: 0.94,
      fill: 'rgba(240,246,252,0.92)', family: 'Georgia, Times New Roman, serif',
      outlineW: 0.05, shadow: 0.7,
    });
    const dName = districtOf(px, pz);
    const dw = typeWidth(dName, { size: 21 * S, weight: 800, track: 2.4 * S }) + 40 * S;
    const dx = x + w - dw, dy = y - 36 * S;
    ctx.save();
    roundRect(dx, dy, dw, 30 * S, 5 * S);
    const pg = ctx.createLinearGradient(0, dy, 0, dy + 30 * S);
    pg.addColorStop(0, 'rgba(48,68,104,0.92)');
    pg.addColorStop(0.5, 'rgba(34,50,80,0.92)');
    pg.addColorStop(1, 'rgba(22,32,52,0.92)');
    ctx.fillStyle = pg;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10 * S; ctx.shadowOffsetY = 2 * S;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(220,232,246,0.75)';
    ctx.lineWidth = 1.6 * S;
    ctx.stroke();
    ctx.restore();
    drawType(dName, dx + dw / 2, dy + 22 * S, {
      size: 21 * S, weight: 800, align: 'center', track: 2.4 * S, fill: '#fff', shadow: 0.55,
    });

    // ---- plate -------------------------------------------------------------
    const plate = platePath(x, y, w, h, 3.7);
    const range = 250;                 // metres from the card centre to its top edge
    const k = (h * 0.5) / range;
    const cx = x + w / 2, cy = y + h / 2;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    // world -> card pixels (+z runs up-map, heading points up)
    const toCard = (wx, wz) => {
      const ddx = wx - px, ddz = wz - pz;
      return [cx + k * (cos * ddx - sin * ddz), cy + k * (-sin * ddx - cos * ddz)];
    };
    const route = C ? routeLine(px, pz, C) : null;

    ctx.save();
    polyPath(plate);
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 20 * S;
    ctx.shadowOffsetY = 6 * S;
    ctx.fillStyle = '#12171a';
    ctx.fill();
    ctx.restore();

    ctx.save();
    polyPath(plate);
    ctx.clip();

    // ---- the baked map tile ------------------------------------------------
    if (C) {
      const tile = mapTileFor(MAP_SPAN * k * dpr);
      const ppm = tile.width / MAP_SPAN;
      ctx.save();
      ctx.imageSmoothingQuality = 'high';
      ctx.transform(
        (k * cos) / ppm, (-k * sin) / ppm, (k * sin) / ppm, (k * cos) / ppm,
        cx + k * (cos * (MAP_MIN - px) - sin * (MAP_MAX - pz)),
        cy + k * (-sin * (MAP_MIN - px) - cos * (MAP_MAX - pz)),
      );
      ctx.drawImage(tile, 0, 0);
      ctx.restore();
    }

    // ---- route highlight ----------------------------------------------------
    if (route && route.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const p0 = toCard(route[0][0], route[0][1]);
      ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < route.length; i++) {
        const p = toCard(route[i][0], route[i][1]);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = 'rgba(22,14,2,0.65)';
      ctx.lineWidth = 9 * S;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,192,50,0.88)';
      ctx.lineWidth = 5.6 * S;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,190,0.5)';
      ctx.lineWidth = 1.6 * S;
      ctx.stroke();
      ctx.restore();
    }

    // glass: a diagonal sheen, an inner shadow off the top-left, a vignette.
    // r14: the sheen's top-left stop was 0.10 of a near-white, i.e. a flat +21
    // luma lift over a third of the card - the second-biggest contributor to the
    // missing black floor after the grain pass. 0.10 -> 0.038, 0.02 -> 0.008,
    // and the dark end of the same ramp goes 0.14 -> 0.26 so the card still has
    // a lit corner and a shaded one.
    const sh = ctx.createLinearGradient(x, y, x + w * 0.75, y + h);
    sh.addColorStop(0, 'rgba(214,232,248,0.038)');
    sh.addColorStop(0.42, 'rgba(214,232,248,0.008)');
    sh.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = sh;
    ctx.fillRect(x - 10 * S, y - 10 * S, w + 20 * S, h + 20 * S);

    const vg = ctx.createRadialGradient(cx, cy, h * 0.30, cx, cy, h * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');   // r14: 0.58 -> 0.72
    ctx.fillStyle = vg;
    ctx.fillRect(x - 10 * S, y - 10 * S, w + 20 * S, h + 20 * S);

    // inner bevel: light along the top-left run of the torn edge, dark opposite
    ctx.save();
    polyPath(plate);
    ctx.lineWidth = 5 * S;
    const bv = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
    bv.addColorStop(0, 'rgba(236,246,255,0.13)');   // r14: 0.30 -> 0.13
    bv.addColorStop(0.5, 'rgba(236,246,255,0.02)'); // r14: 0.05 -> 0.02
    bv.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.strokeStyle = bv;
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ---- frame -------------------------------------------------------------
    ctx.save();
    polyPath(plate);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,9,11,0.92)';
    ctx.lineWidth = 4.4 * S;
    ctx.stroke();
    // r14: the pale keyline is the last piece of the "vector plan" read. Neither
    // reference draws one — hud-overlay-01 and -03 both let the aerial run
    // straight into the frame with only a dark torn edge. 0.55 -> 0.14 keeps just
    // enough to separate the card from a dark road behind it.
    ctx.strokeStyle = 'rgba(206,220,234,0.14)';
    ctx.lineWidth = 1.5 * S;
    ctx.stroke();
    ctx.restore();

    // ---- objective + waypoint pins ----------------------------------------
    if (C) {
      const pad = 16 * S;
      const pinAt = (wx, wz) => {
        const [sx0, sy0] = toCard(wx, wz);
        const sx = clamp(sx0, x + pad, x + w - pad);
        const sy = clamp(sy0, y + pad, y + h - pad);
        return { sx, sy, off: sx !== sx0 || sy !== sy0 };
      };

      if (route && route.length > 1) {
        const wp = pinAt(route[1][0], route[1][1]);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 7 * S;
        ctx.beginPath();
        ctx.arc(wp.sx, wp.sy, 7.5 * S, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,196,54,0.95)';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(72,46,4,0.9)';
        ctx.lineWidth = 2 * S;
        ctx.stroke();
        ctx.restore();
      }
      const go = pinAt(C.goal.x, C.goal.z);
      drawFlagPin(go.sx, go.sy, go.off);
    }

    // ---- player chevron ---------------------------------------------------
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8 * S;
    ctx.beginPath();
    ctx.moveTo(0, -15 * S);
    ctx.lineTo(11 * S, 12 * S);
    ctx.lineTo(0, 6.5 * S);
    ctx.lineTo(-11 * S, 12 * S);
    ctx.closePath();
    ctx.fillStyle = crashMix > 0.5 ? '#ff5a48' : AMBER_HOT;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(8,12,16,0.9)';
    ctx.lineWidth = 1.8 * S;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // ---- north pip --------------------------------------------------------
    const nr = h * 0.5 - 13 * S;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(yaw);
    ctx.beginPath();
    ctx.moveTo(0, -nr);
    ctx.lineTo(5 * S, -nr + 9 * S);
    ctx.lineTo(-5 * S, -nr + 9 * S);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,90,72,0.95)';
    ctx.fill();
    ctx.restore();

    ctx.restore();   // card rotation
  }

  /** Checkered-flag objective pin; dimmed slightly when clamped to the edge. */
  function drawFlagPin(sx, sy, off) {
    const r = 10.5 * S;
    ctx.save();
    ctx.globalAlpha = off ? 0.9 : 1;
    ctx.translate(sx, sy - r * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, r * 1.9);
    ctx.lineTo(-r, r * 0.4);
    ctx.lineTo(-r, -r);
    ctx.lineTo(r, -r);
    ctx.lineTo(r, r * 0.4);
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8 * S;
    ctx.shadowOffsetY = 2 * S;
    ctx.fillStyle = '#d92b22';
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    ctx.save();
    ctx.clip();
    const cw = (r * 2) / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#f4f4ee' : '#15191d';
        ctx.fillRect(-r + i * cw, -r + j * cw, cw, cw);
      }
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(248,248,242,0.95)';
    ctx.lineWidth = 2.2 * S;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // =========================================================================
  // street plate (top centre) — the "you are on" sign from the reference
  // =========================================================================
  function drawStreetPlate(s) {
    if (!layout) return;
    const st = streetOf(s.pos ? s.pos.x : 0, s.pos ? s.pos.z : 0);
    if (!st) return;
    const y = 40 * S;
    const nameSize = 27 * S, sfxSize = 16 * S;
    const nw = typeWidth(st.name, { size: nameSize, weight: 800, track: 2.6 * S });
    const sw = typeWidth(st.sfx, { size: sfxSize, weight: 800, track: 1.4 * S });
    const pw = nw + sw + 74 * S, ph = 36 * S;
    const px = W / 2 - pw / 2;
    // Everything below the plate hangs off its bottom edge at the ratios
    // hud-overlay-03 uses (plate height 32 px there): subtitle at 0.91 plate
    // heights below the plate, objective badge at 1.31, compass row at 2.03,
    // distance at 3.28, splat running from 0.56 above the plate's bottom edge to
    // 3.4 below it and 7.5 plate heights wide.
    const pB = y + ph;
    const subY = pB + 33 * S;
    const badgeY = pB + 51 * S;
    const cy2 = pB + 76 * S;
    const distY = pB + 120 * S;

    // ---- torn ink splat under the WHOLE group ------------------------------
    // r8: this group used to be the one assembly in the HUD with no grunge under
    // it - a clean pill on bare sky, reading as modern vector UI while every
    // other element read as Burnout. hud-overlay-01 measures 1.61% of pixels
    // below luma 16 behind its plate on a sky that is otherwise dead flat
    // (p01 97.1 -> p99 100.6): that is opaque torn ink, not a drop shadow, and
    // ours measured exactly 0% below 16 with a smooth -14% gaussian falloff.
    if (!plateSplatTex) plateSplatTex = makePlateSplat();
    const sW = Math.max(300 * S, pw * 1.28);
    const sTop = pB - 8 * S;
    const sH = (distY + 14 * S) - sTop;
    ctx.save();
    ctx.translate(W / 2, sTop + sH * 0.5);
    ctx.drawImage(plateSplatTex, -sW * 0.5, -sH * 0.5, sW, sH);
    // Second pass, mirrored and squeezed onto the letter rows. The reference's
    // deposit is not uniform down the group: it is heaviest through the subtitle
    // and compass band and thins out under the distance readout.
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(plateSplatTex, -sW * 0.44, -sH * 0.46, sW * 0.88, sH * 0.72);
    ctx.restore();

    ctx.save();
    roundRect(px, y, pw, ph, 5 * S);
    const g = ctx.createLinearGradient(0, y, 0, y + ph);
    g.addColorStop(0, 'rgba(30,74,48,0.94)');
    g.addColorStop(1, 'rgba(14,44,28,0.94)');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12 * S; ctx.shadowOffsetY = 3 * S;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(226,238,248,0.8)';
    ctx.lineWidth = 2 * S;
    ctx.stroke();
    ctx.restore();

    const tx = px + 30 * S;
    drawType(st.name, tx, y + ph * 0.72, {
      size: nameSize, weight: 800, track: 2.6 * S, fill: '#fff', shadow: 0.5,
    });
    drawType(st.sfx, tx + nw + 10 * S, y + ph * 0.55, {
      size: sfxSize, weight: 800, track: 1.4 * S, fill: 'rgba(226,238,248,0.85)', shadow: 0.4,
    });

    // ---- objective subtitle -------------------------------------------------
    const C = buildCity();
    drawType(objectiveName(C), W / 2, subY, {
      size: 19 * S, weight: 800, align: 'center', track: 1.4 * S, slant: 0.1,
      fill: '#f4f8fc', outlineW: 0.10, shadow: 0.9, hard: 1.6 * S,
    });

    // ---- objective badge: the checkered shield the reference hangs between the
    // subtitle and the compass ------------------------------------------------
    ctx.save();
    const bw2 = 9 * S, bh2 = 11 * S;
    ctx.beginPath();
    ctx.moveTo(W / 2 - bw2, badgeY - bh2);
    ctx.lineTo(W / 2 + bw2, badgeY - bh2);
    ctx.lineTo(W / 2 + bw2, badgeY + bh2 * 0.15);
    ctx.quadraticCurveTo(W / 2 + bw2, badgeY + bh2, W / 2, badgeY + bh2);
    ctx.quadraticCurveTo(W / 2 - bw2, badgeY + bh2, W / 2 - bw2, badgeY + bh2 * 0.15);
    ctx.closePath();
    ctx.fillStyle = 'rgba(146,26,26,0.95)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    const cq = (bw2 * 2) / 3;
    for (let r = 0; r < 3; r++) {
      for (let q = 0; q < 3; q++) {
        if (((r + q) & 1) === 0) continue;
        ctx.fillStyle = 'rgba(246,250,254,0.95)';
        ctx.fillRect(W / 2 - bw2 + q * cq, badgeY - bh2 * 0.78 + r * cq, cq + 0.5, cq + 0.5);
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(12,16,20,0.8)';
    ctx.lineWidth = 1.4 * S;
    ctx.stroke();
    ctx.restore();

    // ---- compass ribbon -----------------------------------------------------
    // r8: this was three bare glyphs floating on sky. hud-overlay-03 runs a
    // hatched, tick-marked ribbon behind E/S/W - a comb of near-black teeth above
    // and below the letter row, scrolling with heading, dissolving at both ends.
    // The teeth are what make it read as an instrument rather than a label.
    const yaw = s.yaw || 0;
    // hud-overlay-03 puts E at 573 and W at 705 on a 1280-wide frame: 66 px per
    // 90 deg, i.e. 63 px/rad once scaled to 1920. The old 150*S span worked out at
    // 77 px/rad and pushed E and W out to the splat's frayed ends where they were
    // almost invisible.
    const span = 122 * S;
    const K = span / (Math.PI * 0.62);        // px per radian of heading
    const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2 - span, cy2 - 34 * S, span * 2, 56 * S);
    ctx.clip();

    // The teeth are CUT OUT of the ink, not painted on top of it. Painted black
    // teeth are invisible against an opaque black splat, which is the trap the
    // first attempt fell into; in the reference the comb reads because the sky
    // shows through the gaps. destination-out is exact here because the HUD is
    // its own transparent canvas over the scene, so erasing HUD alpha is
    // literally "let the sky through".
    //
    // Walk ABSOLUTE headings round the whole circle and let norm() place them:
    // walking offsets from the current yaw and then normalising wraps the far
    // end of the range back into frame and leaves a tooth-free hole either side
    // of centre.
    const STEP = Math.PI / 15;                 // 12 deg, 13.1 px at 1920 wide
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 30; i++) {
      const dx2 = norm(i * STEP - yaw) * K;
      if (Math.abs(dx2) > span) continue;
      const fade = 1 - Math.min(1, Math.abs(dx2) / span);
      const major = ((i % 3) + 3) % 3 === 0;
      const gw = (major ? 5.6 : 7.4) * S;      // the GAP, so majors read as thick teeth
      // Jitter each gap's depth. Without it the comb is a barcode: 36 identical
      // rectangles at an identical pitch, which is exactly the "ruled geometry"
      // tell this HUD has been fighting since r6.
      const ju = 0.70 + jit(i, 11) * 0.55;
      const jd = 0.70 + jit(i * 3 + 1, 29) * 0.55;
      const up = (major ? 16 : 11) * S * ju;
      const dn = (major ? 15 : 10) * S * jd;
      ctx.globalAlpha = 0.55 + 0.45 * Math.pow(fade, 0.7);
      ctx.fillStyle = '#000';
      const gx = W / 2 + dx2 - gw * 0.5 + STEP * K * 0.5;
      ctx.fillRect(gx, cy2 - 15 * S - up, gw, up);
      ctx.fillRect(gx + jit(i * 7, 5) * 1.6 * S, cy2 + 4 * S, gw, dn);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // the eight-point rose: letters on the cardinals, dots on the diagonals
    const marks = [['N', 0], ['NE', Math.PI * 0.25], ['E', Math.PI * 0.5],
      ['SE', Math.PI * 0.75], ['S', Math.PI], ['SW', Math.PI * 1.25],
      ['W', Math.PI * 1.5], ['NW', Math.PI * 1.75]];
    for (const [ch, ang] of marks) {
      const dx2 = norm(ang - yaw) * K;
      if (Math.abs(dx2) > span) continue;
      const a = 1 - Math.min(1, Math.abs(dx2) / span);
      if (ch.length === 2) {
        ctx.globalAlpha = 0.25 + 0.55 * a;
        ctx.fillStyle = 'rgba(226,238,248,1)';
        ctx.fillRect(W / 2 + dx2 - 1.6 * S, cy2 - 6 * S, 3.2 * S, 3.2 * S);
        ctx.globalAlpha = 1;
        continue;
      }
      drawType(ch, W / 2 + dx2, cy2, {
        size: 16 * S, weight: 800, align: 'center', fill: 'rgba(240,246,252,0.96)',
        alpha: 0.5 + 0.5 * a, shadow: 0.6, hard: 1.2 * S,
      });
    }
    ctx.restore();

    // heading pointer: below the letter row and pointing up at it, as in the
    // reference - it used to sit above the row, which read as a dropdown caret
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W / 2, cy2 + 5 * S);
    ctx.lineTo(W / 2 + 7 * S, cy2 + 16 * S);
    ctx.lineTo(W / 2 - 7 * S, cy2 + 16 * S);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,9,12,0.85)';
    ctx.save();
    ctx.translate(0, 1.5 * S);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = AMBER;
    ctx.fill();
    ctx.restore();

    // ---- distance to the objective, on the same splat ----------------------
    const px0 = s.pos ? s.pos.x : 0, pz0 = s.pos ? s.pos.z : 0;
    const route = routeLine(px0, pz0, C);
    let metres = 0;
    for (let i = 1; i < route.length; i++) {
      metres += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    }
    // hud-overlay-03's "0,7 KM" is 22 px tall and only 90 px wide once scaled to
    // 1920 - a hard condense, not a small size.
    drawType(`${(metres / 1000).toFixed(1)} KM`, W / 2, distY, {
      size: 24 * S, weight: 800, align: 'center', track: 0.6 * S, condense: 0.72,
      fill: AMBER, outlineW: 0.10, shadow: 0.8, hard: 1.8 * S,
    });
  }

  /** Stable objective name for the map's single goal, so it never flickers. */
  function objectiveName(C) {
    const k = Math.abs(Math.round(C.goal.x * 0.37) + Math.round(C.goal.z * 0.11) * 7);
    return LANDMARKS[k % LANDMARKS.length];
  }

  // =========================================================================
  // event feed (left column, above the boost bar)
  // =========================================================================
  function drawFeed(s) {
    const G = boostGeometry();
    const lines = [];
    if (s.boosting) lines.push(['BURNING BOOST', '#d6ff8c']);
    else if (shownBoost >= READY_AT) lines.push(['BOOST READY', '#d6ff8c']);
    if (damageMix > 0.05) lines.push([`BODY DAMAGE ${Math.round(damageMix * 100)}%`, '#ffa27a']);
    if (!lines.length) return;
    while (lines.length > 3) lines.pop();

    const size = 20 * S, gap = 30 * S;
    let ly = G.y - 46 * S - (lines.length - 1) * gap;
    for (const [txt, col] of lines) {
      const tw = typeWidth(txt, { size, weight: 800, track: 1.8 * S });
      scrim(G.x - 26 * S, ly - size * 0.86, tw + 34 * S, size * 1.32, 0.42, 5 * S);
      drawType(txt, G.x - 14 * S, ly, {
        size, weight: 800, track: 1.8 * S, fill: col, shadow: 0.6,
      });
      ly += gap;
    }
  }

  // =========================================================================
  // damage / crash state
  // =========================================================================
  function drawCrashState() {
    if (hitFlash > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,196,150,${0.5 * hitFlash * hitFlash})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const v = Math.max(crashMix * 0.9, damageMix * 0.42);
    if (v < 0.01) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30,
      W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(120,10,6,0)');
    g.addColorStop(1, `rgba(120,10,6,${0.62 * v})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // crack ticks in the corners on a hard wreck
    if (crashMix > 0.3) {
      ctx.save();
      ctx.globalAlpha = crashMix * 0.5;
      ctx.strokeStyle = 'rgba(255,220,210,0.5)';
      ctx.lineWidth = 1.4 * S;
      for (let i = 0; i < 14; i++) {
        const cxp = i % 2 ? W * 0.02 : W * 0.98;
        const yp = H * (0.12 + 0.06 * i);
        ctx.beginPath();
        ctx.moveTo(cxp, yp);
        ctx.lineTo(cxp + (i % 2 ? 1 : -1) * (30 + jit(i, 3) * 26) * S, yp + jit(i, 9) * 40 * S);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // =========================================================================
  // banner
  // =========================================================================
  function drawBanner() {
    if (bannerT <= 0 || !bannerText) return;
    const age = bannerLife - bannerT;
    const IN = 0.26, OUT = 0.42;
    let scale = 1, alpha = 1, dy = 0;
    if (age < IN) {
      const u = age / IN;
      scale = lerp(1.42, 1.0, easeOutBack(u));
      alpha = smoothstep(0, 0.45, u);
    } else if (bannerT < OUT) {
      const u = 1 - bannerT / OUT;
      scale = 1 + u * 0.10;
      alpha = 1 - u * u;
      dy = -u * 26 * S;
    }
    // uppercase, but multipliers keep their lowercase x — "BOOST CHAIN x3"
    const up = bannerText.toUpperCase().replace(/X(?=\d)/g, 'x');
    const hostile = /WRECK|BUSTED|FAIL/.test(up);
    const chainy = /CHAIN|BOOST|TAKEDOWN/.test(up);
    const fill = hostile ? '#ff5f4a' : chainy ? AMBER_HOT : '#ffffff';
    const size = clamp(W * 0.052, 44, 108) * (H / 1080 > 1 ? 1 : 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H * 0.30 + dy);
    ctx.scale(scale, scale);

    // torn splatter plate behind the type
    const tw = typeWidth(up, { size, weight: 900, track: size * 0.06, condense: 0.82 });
    const pw = tw + size * 1.5, ph = size * 1.5;
    ctx.save();
    const pts = [];
    const N = 44;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rx = pw * 0.5 * (1 + jit(i, 21) * 0.05 + jit(i * 3, 5) * 0.03);
      const ry = ph * 0.5 * (1 + jit(i, 37) * 0.34 + jit(i * 5, 13) * 0.16);
      pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
    polyPath(pts);
    ctx.fillStyle = 'rgba(8,11,15,0.62)';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 26 * S;
    ctx.fill();
    ctx.restore();

    drawType(up, 0, size * 0.34, {
      size, weight: 900, align: 'center', condense: 0.82, slant: 0.20, track: size * 0.06,
      fill, outline: 'rgba(3,6,9,0.95)', outlineW: 0.06, shadow: 0.8,
      glow: hostile ? 'rgba(255,60,30,0.55)' : chainy ? 'rgba(255,160,40,0.55)' : null,
    });
    ctx.restore();
  }

  // =========================================================================
  // frame
  // =========================================================================
  function draw(s) {
    ctx.clearRect(0, 0, W, H);
    drawCrashState();
    drawStreetPlate(s);
    drawMinimap(s);
    drawFeed(s);
    drawBoost(s);
    drawSpeedo(s);
    drawBanner();
    gen++;
  }

  function advance(dt, s) {
    const target = Math.abs(s.speed || 0) * 3.6;
    shownSpeed = damp(shownSpeed, target, 7.5, dt);
    shownBoost = damp(shownBoost, clamp(s.boost ?? 0, 0, 1), s.boosting ? 14 : 8, dt);

    const boosting = !!s.boosting;
    offBoostFor = boosting ? 0 : offBoostFor + dt;

    // burnout chain: refilling the bar to full while still burning extends the chain
    if (s.chain != null) {
      chain = Math.max(1, Math.round(s.chain));
    } else {
      if (boosting && (s.boost ?? 0) > 0.985 && !chainArmed) { chain += 1; chainArmed = true; }
      if ((s.boost ?? 0) < 0.9) chainArmed = false;
      if (offBoostFor > 0.6) { chain = 1; chainArmed = false; }
    }
    if (s.crashed) { chain = 1; chainArmed = false; }

    burnMix = damp(burnMix, boosting ? 1 : 0, 12, dt);
    chainMix = damp(chainMix, chain > 1 ? 1 : 0, 8, dt);
    deniedMix = clamp(s.boostDenied ?? 0, 0, 1);   // physics decays the pulse; no double-smooth
    readyPulse = damp(readyPulse, shownBoost >= READY_AT ? 1 : 0, 8, dt);

    const crashed = !!s.crashed;
    if (crashed && !wasCrashed) hitFlash = 1;
    wasCrashed = crashed;
    hitFlash = Math.max(0, hitFlash - dt * 3.2);
    crashMix = damp(crashMix, crashed ? 1 : 0, crashed ? 16 : 3, dt);
    const dmg = s.damage != null ? clamp(s.damage, 0, 1) : (crashed ? 1 : 0);
    damageMix = damp(damageMix, dmg, 4, dt);

    if (bannerT > 0) bannerT = Math.max(0, bannerT - dt);
    t += dt;
    void readyPulse;
  }

  const hud = {
    canvas,
    resize,
    setVisible(v) { visible = !!v; canvas.style.display = v ? 'block' : 'none'; },
    get visible() { return visible; },
    /** Put this canvas in the document (a DOM compositing layer) or take it out. See above. */
    setAttached,
    get attached() { return inDom; },
    /**
     * Increments once per completed draw(), and once per resize() because that clears the
     * canvas. A consumer that mirrors this canvas into a GPU texture uploads only when this
     * number moves.
     */
    get generation() { return gen; },

    banner(text, secs = 2) {
      bannerText = text || '';
      bannerLife = Math.max(0.001, secs);
      bannerT = text ? bannerLife : 0;
    },

    update(dt, s = {}) {
      advance(Math.min(dt || 0, 0.1), s);
      if (!visible) return;
      draw(s);
    },

    /** Draw once with no smoothing lag — used for deterministic screenshots. */
    snap(s = {}) {
      shownSpeed = Math.abs(s.speed || 0) * 3.6;
      shownBoost = clamp(s.boost ?? 0, 0, 1);
      burnMix = s.boosting ? 1 : 0;
      chainMix = chain > 1 ? 1 : 0;
      crashMix = s.crashed ? 1 : 0;
      damageMix = s.damage != null ? clamp(s.damage, 0, 1) : (s.crashed ? 1 : 0);
      hitFlash = 0;
      if (!visible) return;
      draw(s);
    },
  };

  return hud;
}
