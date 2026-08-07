// world.js — city layout, ground, buildings, sidewalks, street furniture, neon, drive paths.
// API: createWorld(scene, {rng, roadKit}) -> world.
//   world.paths.city / world.paths.highway  (see makePath: .at(u), .tangentAt(u), .nearest(v3))
//   world.setNight(bool) world.setWet(0..1) world.update(dt, focusVec3) (moves the point-light pool)
//   world.group holds everything; world.LAYOUT exposes the raw grid numbers.
//
// Everything is procedural: facade / storefront / concrete / signage textures are drawn to
// canvases at build time, and every repeated prop is an InstancedMesh so the whole city is a
// few dozen draw calls. Facade UVs are derived from world position in the shader (see
// patchFacade) so buildings can be instanced and floor lines stay continuous across the block.

import * as THREE from 'three';
import { makeCanvas, canvasTexture, makeRng, rngRange, rngInt, rngPick, clamp, lerp } from './util.js';

export const LAYOUT = {
  grid: [-480, -320, -160, 0, 160, 320, 480],
  extent: 560,
  roadW: 20,
  highwayZ: -700,
  highwayW: 36,
  blockInset: 16,     // sidewalk edge inset from block boundary
  walkW: 7.0,         // pavement depth between the kerb and the building line
};

// ---- surface classification (T4) -------------------------------------------------------------
// Which surface the car is standing on, answered from LAYOUT rather than from a raycast. The road
// network IS the grid, so this is a couple of comparisons against the nearest grid line and one
// against the interstate ribbon: no geometry query, no per-frame allocation, no dependence on
// anything world.js built. physics.js takes it as an injected function so it never imports us.
//
// PAVED means "the player is not being punished here". That is deliberately WIDER than the painted
// road: the ribbon is +-roadW/2, the paved shoulder runs to 11.6 m and the kerb face stands at
// 13 m (see the parked-rank block below), and the acceptance criterion is that clipping a kerb or
// cutting a junction is still tarmac. So the whole paved corridor out to the kerb face counts, and
// a junction is covered for free because it is the intersection of two corridors.
const PAVED_HALF = 13.0;              // m from a road centreline to the kerb face
const HIGHWAY_HALF = LAYOUT.highwayW / 2 + 2.2;   // to the guardrail line at world.js:2804

/**
 * @returns {'tarmac'|'dirt'} the surface class at a world position.
 *
 * ONLY TWO CLASSES EXIST TODAY, and that is a property of the world, not a shortcut. The ground is
 * a single flat plane (`groundMat`, one colour, one roughness) — there is no grass, no sand and no
 * soil anywhere in the tree to classify. Adding 'grass'/'sand' rows to the table in physics.js
 * before that terrain exists would be configuration nothing can ever return. When T3's map brings
 * real terrain, this function grows the classes and SURFACES grows the matching rows; nothing
 * else has to change, because every caller already switches on the returned key.
 */
// ---- THE SWAP POINT FOR T3'S MAP. READ BEFORE TOUCHING EITHER SIDE. --------------------------
// `game/map/graph.js` now has a graph-backed `surfaceAt` with identical semantics, verified
// against brute force on 10000 probes and measured at 189 ns/query. It is NOT wired up here yet,
// and that is deliberate, not an unfinished edit.
//
// The world the car currently drives on is still this LAYOUT grid. The graph describes Paradise
// City, which is a DIFFERENT city in different coordinates. Pointing this function at the graph
// before `generate` builds that city would answer 'dirt' almost everywhere the player actually
// is, and T4's off-road penalty would fire on every road in the game.
//
// So the swap belongs to the `generate` piece, in the same commit that makes the graph the thing
// on screen: replace this body with a call into the injected graph, keep the same two return keys,
// and the caller in `physics.js` needs no edit because it already switches on the key.
export function surfaceAt(x, z) {
  if (Math.abs(z - LAYOUT.highwayZ) <= HIGHWAY_HALF) return 'tarmac';
  const EX = LAYOUT.extent;
  // A grid road along Z is drivable only within the network's extent, and vice versa.
  if (Math.abs(z) <= EX) {
    for (const g of LAYOUT.grid) if (Math.abs(x - g) <= PAVED_HALF) return 'tarmac';
  }
  if (Math.abs(x) <= EX) {
    for (const g of LAYOUT.grid) if (Math.abs(z - g) <= PAVED_HALF) return 'tarmac';
  }
  return 'dirt';
}

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------
function makePath(points, closed) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], 0, p[1])), closed, 'catmullrom', 0.5,
  );
  const N = 900;
  const samples = [], tangents = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    samples.push(curve.getPointAt(u));
    tangents.push(curve.getTangentAt(u).normalize());
  }
  const length = curve.getLength();
  return {
    curve, closed, length, samples, tangents,
    at(u) { return curve.getPointAt(closed ? ((u % 1) + 1) % 1 : clamp(u, 0, 1)); },
    tangentAt(u) { return curve.getTangentAt(closed ? ((u % 1) + 1) % 1 : clamp(u, 0, 1)).normalize(); },
    /** nearest sample index + u for a world position */
    nearest(v) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i++) {
        const d = samples[i].distanceToSquared(v);
        if (d < bd) { bd = d; best = i; }
      }
      return { i: best, u: best / (N - 1), point: samples[best], tangent: tangents[best], dist: Math.sqrt(bd) };
    },
  };
}

// ---------------------------------------------------------------------------
// PCSS: percentage-closer soft shadows
// ---------------------------------------------------------------------------
// three's PCFSoftShadowMap spreads every shadow over the same fixed kernel, which
// is the wrong shape for architecture: it turns a 30 cm awning bracket sitting
// 20 cm off the wall into the same mush as a 40 m tower shadow 40 m away. The
// reference frames have the opposite behaviour — brackets, cornices and sign arms
// throw *tight* shadows onto the surface right behind them, and only the long
// tower shadows get a visible penumbra. So estimate the blocker distance first and
// scale the filter radius by it, which is what makes contact shadows contact.
const PCSS_DISK = `
	const vec2 pcssDisk[ 16 ] = vec2[ 16 ](
		vec2( -0.94201624, -0.39906216 ), vec2(  0.94558609, -0.76890725 ),
		vec2( -0.09418410, -0.92938870 ), vec2(  0.34495938,  0.29387760 ),
		vec2( -0.91588581,  0.45771432 ), vec2( -0.81544232, -0.87912464 ),
		vec2( -0.38277543,  0.27676845 ), vec2(  0.97484398,  0.75648379 ),
		vec2(  0.44323325, -0.97511554 ), vec2(  0.53742981, -0.47373420 ),
		vec2( -0.26496911, -0.41893023 ), vec2(  0.79197514,  0.19090188 ),
		vec2( -0.24188840,  0.99706507 ), vec2( -0.81409955,  0.91437590 ),
		vec2(  0.19984126,  0.78641367 ), vec2(  0.14383161, -0.14100790 )
	);
`;
// 520 converts a normalised ortho depth gap into filter texels: the city cascade is
// ~527 m deep over 4096 px of a 124 m span (3.0 cm/texel), so this is a ~1.7 deg
// source — a touch wider than the real sun, which keeps the long shadows readable
// without smearing the 20 cm facade relief.
const PCSS_BODY = `{
	shadowCoord.xyz /= shadowCoord.w;
	shadowCoord.z += shadowBias;
	bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0
		&& shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
	if ( ! ( inFrustum && shadowCoord.z <= 1.0 ) ) return 1.0;
	vec2 texel = vec2( 1.0 ) / shadowMapSize;
	float rcv = shadowCoord.z;
	float blockerSum = 0.0;
	float blockerCount = 0.0;
	for ( int i = 0; i < 16; i ++ ) {
		float d = unpackRGBAToDepth( texture2D( shadowMap,
			shadowCoord.xy + pcssDisk[ i ] * texel * 7.0 ) );
		if ( d < rcv ) { blockerSum += d; blockerCount += 1.0; }
	}
	if ( blockerCount < 0.5 ) return 1.0;
	float gap = rcv - blockerSum / blockerCount;
	float radius = clamp( gap * 520.0, 0.55, 7.0 ) * max( shadowRadius, 0.5 );
	float shadow = 0.0;
	for ( int i = 0; i < 16; i ++ ) {
		shadow += step( rcv, unpackRGBAToDepth( texture2D( shadowMap,
			shadowCoord.xy + pcssDisk[ i ] * texel * radius ) ) );
	}
	shadow *= 0.0625;
	return mix( 1.0, shadow, shadowIntensity );
}`;

let pcssInstalled = false;
/** Swap three's fixed-kernel getShadow() for the blocker-search version, once. */
function installPcss() {
  // debug escape hatch for tools/shadow-ab.mjs --nopcss: fall back to three's
  // stock PCF so the custom kernel can be bisected against it.
  if (globalThis.__noPcss) return;
  if (pcssInstalled) return;
  pcssInstalled = true;
  const src = THREE.ShaderChunk.shadowmap_pars_fragment;
  const at = src.indexOf('float getShadow(');
  if (at < 0) return;                       // upstream changed shape: keep three's PCF
  const open = src.indexOf('{', at);
  if (open < 0) return;
  const sig = src.slice(at, open);
  // the body below names every parameter it uses, so bail rather than emit a
  // shader that will not compile against a signature we do not recognise
  for (const p of ['shadowMapSize', 'shadowIntensity', 'shadowBias', 'shadowRadius', 'shadowCoord']) {
    if (!sig.includes(p)) return;
  }
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) return;
  THREE.ShaderChunk.shadowmap_pars_fragment =
    `${src.slice(0, at)}${PCSS_DISK}${sig}${PCSS_BODY}${src.slice(end)}`;
}

function roundedRect(hx, hz, r, seg = 10) {
  const pts = [];
  const arcs = [
    { cx: hx - r, cz: hz - r, a0: 0, a1: Math.PI / 2 },
    { cx: -(hx - r), cz: hz - r, a0: Math.PI / 2, a1: Math.PI },
    { cx: -(hx - r), cz: -(hz - r), a0: Math.PI, a1: 1.5 * Math.PI },
    { cx: hx - r, cz: -(hz - r), a0: 1.5 * Math.PI, a1: 2 * Math.PI },
  ];
  for (const a of arcs) {
    for (let i = 0; i <= seg; i++) {
      const t = a.a0 + (a.a1 - a.a0) * (i / seg);
      pts.push([a.cx + Math.cos(t) * r, a.cz + Math.sin(t) * r]);
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------
// canvas helpers
// ---------------------------------------------------------------------------
function grain(ctx, W, H, rng, amt) {
  const img = ctx.getImageData(0, 0, W, H); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amt;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Vertical dirt drips hanging off a ledge at y0. This is the single biggest
 * "stop reading as a clean primitive" cue on concrete.
 */
function drips(ctx, rng, x0, x1, y0, {
  count = 24, maxLen = 90, maxAlpha = 0.22, tint = '20,16,12',
} = {}) {
  for (let i = 0; i < count; i++) {
    const x = lerp(x0, x1, rng());
    const w = rngRange(rng, 1.0, 7.0);
    const len = maxLen * rngRange(rng, 0.18, 1.0);
    const a = maxAlpha * rngRange(rng, 0.25, 1.0);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(${tint},${a * 1.25})`);
    g.addColorStop(0.22, `rgba(${tint},${a})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, w, len);
  }
  // the wet lip right under the ledge
  const g2 = ctx.createLinearGradient(0, y0, 0, y0 + 7);
  g2.addColorStop(0, `rgba(${tint},0.30)`);
  g2.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = g2; ctx.fillRect(x0, y0, x1 - x0, 7);
}

// ---------------------------------------------------------------------------
// signage wordmarks
// ---------------------------------------------------------------------------
// Randomised pseudo-glyphs were the loudest procedural tell in the whole build:
// the eye tries to read "MYBIIFOURBO", fails, and immediately knows the city was
// generated. Real signage in the reference frames reads as actual words, so every
// sign now pulls a wordmark from a curated list and draws it with real letterforms.
// The lists are long enough that no two blocks repeat visibly, and short enough
// that everything on them is a plausible thing to see on a street.
const SIGN_BRANDS = [
  'VALCOURT', 'NOVAK', 'HALCYON', 'KESTREL', 'PARAGON', 'DUNBAR', 'SUNRAY',
  'IRONWOOD', 'ORION', 'CRESTLINE', 'GOLDSTAR', 'MERIDIAN', 'ATLAS', 'RIVETT',
  'BLACKWELL', 'STARLING', 'VANTAGE', 'LOMBARD', 'HARLOW', 'CASTELLAN',
  'DRAYTON', 'MARLOWE', 'BRIGHTON', 'FAIRMONT', 'WESTGATE', 'KINGSLEY',
];
const SIGN_TRADES = [
  'DINER', 'PHARMACY', 'HARDWARE', 'BARBER', 'DELI', 'LIQUOR', 'PIZZA',
  'TACOS', 'BODEGA', 'GARAGE', 'TATTOO', 'ARCADE', 'MOTEL', 'CAFE', 'BAR',
  'BOOKS', 'RECORDS', 'NAILS', 'PAWN', 'LAUNDRY', 'BAKERY', 'GRILL',
  'TYRES', 'PAINT', 'SUPPLY', 'MOTORS', 'DINETTE', 'NOODLES', 'SUSHI',
];
const SIGN_TAGS = [
  'OPEN 24 HRS', 'EST. 1948', 'SINCE 1962', 'COLD BEER', 'NO VACANCY',
  'FREE PARKING', 'CASH ONLY', 'WHOLESALE', 'TWO FOR ONE', 'HOT FOOD',
  'DRIVE THRU', 'AIR COND.', 'ALL NIGHT', 'WALK INS OK', 'BEST IN TOWN',
];
const STREET_NAMES = [
  'PARADISE AVE', 'HARBOR ST', 'RIVER ROAD', 'DOWNTOWN', 'WATERFRONT',
  'AIRPORT', 'CITY CENTER', 'EAST BAY', 'SILVER LAKE', 'LONE PEAK',
  'SOUTH BEACH', 'THE MARINA', 'IRONWORKS', 'PALM BLUFF', 'WEST DOCKS',
];
// Arial Black first: a heavy condensed-ish face is what shopfront fascias and
// billboards actually use, and it survives being scaled down to eight pixels.
const SIGN_FONT = '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Draw one wordmark filling the box (x,y,w,h). Cap height lands on h exactly and
 * the word is condensed (never stretched past 1.08) to fit w, so a long name and
 * a short one both read as deliberate typography rather than as a scaling accident.
 */
function wordRow(ctx, x, y, w, h, color, word, { align = 'left', tracking = 0.07 } = {}) {
  if (!word || h <= 1) return;
  const size = h * 1.36;             // Arial Black cap height is ~0.72 em
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 ${size.toFixed(2)}px ${SIGN_FONT}`;
  const chars = [...word];
  const track = size * tracking;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  let natural = -track;
  for (const cw of widths) natural += cw + track;
  if (natural <= 0) { ctx.restore(); return; }
  const sx = Math.min(1.08, w / natural);
  const used = natural * sx;
  const x0 = x + (align === 'center' ? (w - used) / 2 : align === 'right' ? w - used : 0);
  ctx.translate(x0, y + h);
  ctx.scale(sx, 1);
  let cx = 0;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx, 0);
    cx += widths[i] + track;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// facade textures  (one tile = TILE_W x TILE_H metres of wall)
// ---------------------------------------------------------------------------
const TILE_W = 18, TILE_H = 14;   // 4 floors of 3.5 m, 6 bays of 3 m
const PODIUM_H = 7.6;             // ground-floor storefront band
const PODIUM_W = 12;

function makeFacade(rng, style) {
  const W = 512, H = 512;
  const cols = 6, rows = 4;
  const bw = W / cols, fh = H / rows;

  const { c: ac, ctx: a } = makeCanvas(W, H);   // albedo
  const { c: ec, ctx: e } = makeCanvas(W, H);   // emissive (night windows)
  const { c: oc, ctx: o } = makeCanvas(W, H);   // R=ao G=roughness B=glass/metal

  const P = {
    glass: { wall: '#39424e', trim: '#59636f', band: '#2e3742', rough: 0.62, grime: 0.55 },
    office: { wall: '#8d8578', trim: '#a09889', band: '#7b7366', rough: 0.86, grime: 1.0 },
    brick: { wall: '#7a4436', trim: '#8d5644', band: '#63362a', rough: 0.94, grime: 1.15 },
    concrete: { wall: '#a8a294', trim: '#b6b0a2', band: '#948e81', rough: 0.90, grime: 1.25 },
  }[style] || { wall: '#8d8578', trim: '#a09889', band: '#7b7366', rough: 0.86, grime: 1.0 };

  a.fillStyle = P.wall; a.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  o.fillStyle = `rgb(255,${Math.round(P.rough * 255)},8)`; o.fillRect(0, 0, W, H);

  grain(a, W, H, rng, style === 'brick' ? 30 : 20);

  if (style === 'brick') {
    a.globalAlpha = 0.20; a.strokeStyle = '#2c1a12'; a.lineWidth = 1;
    for (let y = 0; y < H; y += 6) { a.beginPath(); a.moveTo(0, y + 0.5); a.lineTo(W, y + 0.5); a.stroke(); }
    a.globalAlpha = 0.10;
    for (let y = 0; y < H; y += 6) {
      const off = (y / 6) % 2 ? 0 : 9;
      for (let x = off; x < W; x += 18) { a.beginPath(); a.moveTo(x + 0.5, y); a.lineTo(x + 0.5, y + 6); a.stroke(); }
    }
    a.globalAlpha = 1;
  }

  for (let f = 0; f < rows; f++) {
    const y0 = f * fh;

    // spandrel band under the windows of this floor
    a.fillStyle = P.band; a.globalAlpha = 0.55;
    a.fillRect(0, y0, W, fh * 0.19);
    a.globalAlpha = 1;
    // ledge: bright top lip + hard shadow underneath
    a.fillStyle = 'rgba(255,252,240,0.30)'; a.fillRect(0, y0, W, 2);
    a.fillStyle = 'rgba(0,0,0,0.34)'; a.fillRect(0, y0 + 2, W, 4);
    o.fillStyle = 'rgb(190,235,8)'; o.fillRect(0, y0, W, 6);

    for (let b = 0; b < cols; b++) {
      const x0 = b * bw;
      const inset = style === 'glass' ? bw * 0.055 : bw * 0.155;
      const wx = x0 + inset, ww = bw - inset * 2;
      const wy = y0 + fh * (style === 'glass' ? 0.26 : 0.30);
      const wh = fh * (style === 'glass' ? 0.62 : 0.52);

      // reveal frame
      a.fillStyle = P.trim; a.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      a.fillStyle = 'rgba(0,0,0,0.35)'; a.fillRect(wx - 3, wy - 3, ww + 6, 3);

      // ---- glass panel: per-panel variation ----
      const cool = rngRange(rng, 0, 1);
      const base = style === 'glass' ? 22 : 16;
      const gr = Math.round(base + cool * 14), gg = Math.round(base + 8 + cool * 20), gb = Math.round(base + 18 + cool * 30);
      a.fillStyle = `rgb(${gr},${gg},${gb})`;
      a.fillRect(wx, wy, ww, wh);

      // reflected sky sweeping across the panel — angle varies per panel
      const dir = rng() < 0.5 ? 1 : -1;
      const g = a.createLinearGradient(wx, wy, wx + ww * dir, wy + wh);
      const hi = rngRange(rng, 0.16, 0.52);
      g.addColorStop(0, `rgba(158,190,224,${hi})`);
      g.addColorStop(0.42, `rgba(52,72,100,${hi * 0.20})`);
      g.addColorStop(1, `rgba(112,148,190,${hi * 0.55})`);
      a.fillStyle = g; a.fillRect(wx, wy, ww, wh);
      // interior darkness at the top of the pane (real reveal AO)
      const ao = a.createLinearGradient(0, wy, 0, wy + wh * 0.4);
      ao.addColorStop(0, 'rgba(0,0,0,0.45)'); ao.addColorStop(1, 'rgba(0,0,0,0)');
      a.fillStyle = ao; a.fillRect(wx, wy, ww, wh * 0.4);

      if (rng() < 0.30) { // blind / occupant silhouette behind the glass
        a.fillStyle = 'rgba(190,186,172,0.30)';
        a.fillRect(wx, wy, ww, wh * rngRange(rng, 0.2, 0.55));
      }

      // mullions + transom
      a.fillStyle = P.trim;
      a.fillRect(wx + ww / 2 - 1.2, wy, 2.4, wh);
      a.fillRect(wx, wy + wh * 0.34 - 1, ww, 2);
      if (style === 'glass') a.fillRect(wx + ww * 0.25 - 1, wy, 2, wh);

      // ORM: glass is smooth + reflective, with per-panel spread
      const rgh = Math.round(rngRange(rng, 0.06, 0.26) * 255);
      const met = Math.round((style === 'glass' ? rngRange(rng, 0.66, 0.98) : rngRange(rng, 0.42, 0.78)) * 255);
      o.fillStyle = `rgb(255,${rgh},${met})`;
      o.fillRect(wx, wy, ww, wh);
      o.fillStyle = `rgb(210,${Math.round(P.rough * 240)},14)`;
      o.fillRect(wx - 3, wy - 3, ww + 6, 3);

      // sill drips
      drips(a, rng, wx - 2, wx + ww + 2, wy + wh + 2,
        { count: 5, maxLen: fh * 0.55, maxAlpha: 0.20 * P.grime });

      // ---- night emissive ----
      if (rng() < 0.44) {
        const warm = rngPick(rng, ['#ffd9a0', '#ffc078', '#e6efff', '#ffe6bb', '#c8dcff', '#ffefd0']);
        e.fillStyle = warm;
        e.globalAlpha = rngRange(rng, 0.30, 1.0);
        e.fillRect(wx, wy, ww, wh);
        e.globalAlpha = 1;
        // bright ceiling strip so lit rooms have internal structure
        e.fillStyle = '#ffffff'; e.globalAlpha = 0.55;
        e.fillRect(wx, wy + 2, ww, wh * 0.12);
        e.globalAlpha = 1;
        if (rng() < 0.5) {
          e.fillStyle = '#000'; e.globalAlpha = 0.6;
          e.fillRect(wx, wy + wh * rngRange(rng, 0.45, 0.7), ww, wh);
          e.globalAlpha = 1;
        }
        // mullions stay dark at night too
        e.fillStyle = '#000';
        e.fillRect(wx + ww / 2 - 1.2, wy, 2.4, wh);
        e.fillRect(wx, wy + wh * 0.34 - 1, ww, 2);
      }
    }

    // long drips off the floor ledge — the main grime signature
    drips(a, rng, 0, W, y0 + 6,
      { count: Math.round(22 * P.grime), maxLen: fh * 1.05, maxAlpha: 0.19 * P.grime });
  }

  // broad vertical staining across the whole tile
  for (let i = 0; i < 9; i++) {
    const x = rng() * W, w = rngRange(rng, 8, 44);
    const g = a.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(28,24,18,0)');
    g.addColorStop(0.5, `rgba(28,24,18,${rngRange(rng, 0.03, 0.10) * P.grime})`);
    g.addColorStop(1, 'rgba(28,24,18,0)');
    a.fillStyle = g; a.fillRect(x, 0, w, H);
  }

  return {
    map: canvasTexture(ac, { srgb: true }),
    emissiveMap: canvasTexture(ec, { srgb: true }),
    ormMap: canvasTexture(oc),
  };
}

function makeStorefront(rng) {
  const W = 512, H = 320;
  const { c: ac, ctx: a } = makeCanvas(W, H);
  const { c: ec, ctx: e } = makeCanvas(W, H);
  const { c: oc, ctx: o } = makeCanvas(W, H);
  a.fillStyle = '#6e6a62'; a.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  o.fillStyle = 'rgb(255,225,10)'; o.fillRect(0, 0, W, H);
  grain(a, W, H, rng, 22);

  // fascia / sign band across the top
  const fasciaH = H * 0.20;
  a.fillStyle = '#3a3f47'; a.fillRect(0, 0, W, fasciaH);
  a.fillStyle = 'rgba(0,0,0,0.4)'; a.fillRect(0, fasciaH - 5, W, 5);

  const bays = 4, bwid = W / bays;
  // Shop-sign palette. Pushed toward the primaries: measured facade-band chroma
  // was 0.339 against 0.501-0.556 in three of the four downtown references, and
  // every one of those frames gets its colour from saturated retail signage sat
  // in an otherwise grey masonry canyon. These are the paint colours a sign
  // shop actually stocks, not tints of the wall behind them.
  const signCols = ['#e51d26', '#f5a300', '#0f6be0', '#0eb350', '#ea4a10', '#8b17d4'];
  for (let b = 0; b < bays; b++) {
    const x = b * bwid;
    const sc = rngPick(rng, signCols);
    // one shop name per bay, drawn identically into albedo and emissive so the
    // fascia says the same thing by day and lit at night
    const shopName = rngPick(rng, rng() < 0.55 ? SIGN_TRADES : SIGN_BRANDS);
    a.fillStyle = sc; a.fillRect(x + 6, 8, bwid - 12, fasciaH - 22);
    a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(x + 6, fasciaH - 18, bwid - 12, 4);
    wordRow(a, x + 16, 18, bwid - 32, fasciaH - 44, '#f4f1e6', shopName, { align: 'center' });
    // the fascia sign is what glows at night; the panel colour still shows through
    e.fillStyle = sc; e.globalAlpha = 0.35; e.fillRect(x + 6, 8, bwid - 12, fasciaH - 22); e.globalAlpha = 1;
    wordRow(e, x + 16, 18, bwid - 32, fasciaH - 44, '#fff8e0', shopName, { align: 'center' });

    // glazed shopfront — a lit interior behind the glass, not a black hole.
    // Even at noon the reference shops read as bright, busy, coloured boxes.
    const gy = fasciaH + 8, gh = H - fasciaH - 34;
    a.fillStyle = '#3d4653'; a.fillRect(x + 8, gy, bwid - 16, gh);
    // shop interior: warm back wall, bright ceiling strip, merchandise blocks
    a.fillStyle = rngPick(rng, ['#8a7f6d', '#6f7a86', '#8a7362', '#77836f']);
    a.fillRect(x + 14, gy + 10, bwid - 28, gh - 18);
    a.fillStyle = 'rgba(255,244,214,0.72)'; a.fillRect(x + 14, gy + 10, bwid - 28, 11);
    for (let m = 0; m < 5; m++) {
      const mw = rngRange(rng, 7, 19), mh = rngRange(rng, 12, 34);
      const mx2 = x + 16 + rng() * (bwid - 34 - mw);
      a.fillStyle = rngPick(rng, signCols);
      a.globalAlpha = rngRange(rng, 0.36, 0.74);   // merchandise reads as colour, not haze
      a.fillRect(mx2, gy + gh - 22 - mh, mw, mh);
      a.globalAlpha = 1;
    }
    // glass on top: sky reflection sweep, brightest at the raking edge
    const g = a.createLinearGradient(x, gy, x + bwid, gy + gh);
    g.addColorStop(0, 'rgba(176,200,232,0.40)');
    g.addColorStop(0.5, 'rgba(46,62,86,0.16)');
    g.addColorStop(1, 'rgba(130,164,204,0.30)');
    a.fillStyle = g; a.fillRect(x + 8, gy, bwid - 16, gh);
    o.fillStyle = 'rgb(255,40,190)'; o.fillRect(x + 8, gy, bwid - 16, gh);
    // frames — light metal, so the shopfront grid reads at a distance
    a.fillStyle = '#cfcabc';
    a.fillRect(x + 6, gy - 3, bwid - 12, 7);
    a.fillRect(x + bwid / 2 - 2.5, gy, 5, gh);
    a.fillRect(x + 8, gy + gh * 0.20, bwid - 16, 4);
    a.fillRect(x + 6, gy + gh - 4, bwid - 12, 8);
    a.fillStyle = 'rgba(0,0,0,0.4)'; a.fillRect(x + 8, gy + gh * 0.20 + 4, bwid - 16, 3);
    // transom sign strip between the frames — the colour that survives when the
    // fascia above is occluded by the projecting canopy
    const tc = rngPick(rng, signCols);
    const tag = rngPick(rng, SIGN_TAGS);
    a.fillStyle = tc; a.fillRect(x + 10, gy + 4, bwid - 20, gh * 0.19 - 6);
    wordRow(a, x + 16, gy + 8, bwid - 32, gh * 0.19 - 16, '#f6f3e8', tag,
      { align: 'center', tracking: 0.04 });
    e.fillStyle = tc; e.globalAlpha = 0.55;
    e.fillRect(x + 10, gy + 4, bwid - 20, gh * 0.19 - 6); e.globalAlpha = 1;
    wordRow(e, x + 16, gy + 8, bwid - 32, gh * 0.19 - 16, '#fff6e0', tag,
      { align: 'center', tracking: 0.04 });
    // lit interior at night, banded like a ceiling
    e.fillStyle = rngPick(rng, ['#ffe9c0', '#e8f2ff', '#ffdca8']);
    e.globalAlpha = 0.85; e.fillRect(x + 12, gy + 4, bwid - 24, gh * 0.5); e.globalAlpha = 1;
    e.fillStyle = '#000'; e.globalAlpha = 0.5;
    e.fillRect(x + bwid / 2 - 2, gy, 4, gh); e.globalAlpha = 1;
  }

  // kick plate + pavement grime at the very bottom
  a.fillStyle = '#4b4a46'; a.fillRect(0, H - 26, W, 26);
  const bg = a.createLinearGradient(0, H - 26, 0, H);
  bg.addColorStop(0, 'rgba(20,17,13,0.18)'); bg.addColorStop(1, 'rgba(20,17,13,0.55)');
  a.fillStyle = bg; a.fillRect(0, H - 26, W, 26);
  drips(a, rng, 0, W, fasciaH, { count: 26, maxLen: 120, maxAlpha: 0.22 });

  return {
    map: canvasTexture(ac, { srgb: true }),
    emissiveMap: canvasTexture(ec, { srgb: true }),
    ormMap: canvasTexture(oc),
  };
}

function makeConcrete(rng) {
  const W = 256, H = 256;   // 6 x 6 m
  const { c: ac, ctx: a } = makeCanvas(W, H);
  const { c: oc, ctx: o } = makeCanvas(W, H);
  a.fillStyle = '#9a968c'; a.fillRect(0, 0, W, H);
  o.fillStyle = 'rgb(255,232,6)'; o.fillRect(0, 0, W, H);
  grain(a, W, H, rng, 26);
  // blotchy pour variation
  for (let i = 0; i < 26; i++) {
    const x = rng() * W, y = rng() * H, r = rngRange(rng, 14, 60);
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng() < 0.6;
    g.addColorStop(0, dark ? 'rgba(60,56,50,0.13)' : 'rgba(210,206,196,0.11)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    a.fillStyle = g; a.beginPath(); a.arc(x, y, r, 0, 7); a.fill();
  }
  // form-panel joints
  for (const y of [0, 128]) {
    a.fillStyle = 'rgba(255,255,255,0.16)'; a.fillRect(0, y, W, 2);
    a.fillStyle = 'rgba(0,0,0,0.34)'; a.fillRect(0, y + 2, W, 3);
    drips(a, rng, 0, W, y + 5, { count: 22, maxLen: 108, maxAlpha: 0.26 });
  }
  for (const x of [0, 128]) { a.fillStyle = 'rgba(0,0,0,0.20)'; a.fillRect(x, 0, 2, H); }
  // form-tie dots
  for (let i = 0; i < 40; i++) {
    const x = 16 + Math.floor(rng() * 8) * 30, y = 14 + Math.floor(rng() * 8) * 30;
    a.fillStyle = 'rgba(0,0,0,0.22)'; a.beginPath(); a.arc(x, y, 2.2, 0, 7); a.fill();
    drips(a, rng, x - 2, x + 3, y + 2, { count: 1, maxLen: 26, maxAlpha: 0.22 });
  }
  return { map: canvasTexture(ac, { srgb: true }), ormMap: canvasTexture(oc) };
}

/** Billboard / wall-sign panel: painted diffuse + a matching emissive so it stays a lit surface. */
function makeSign(rng, kind) {
  const W = 256, H = 128;
  const { c: ac, ctx: a } = makeCanvas(W, H);
  const { c: ec, ctx: e } = makeCanvas(W, H);
  // Billboard grounds. Same reasoning as makeStorefront's signCols: the panels
  // are the chroma source for the whole facade band, so they are near-primary.
  // The near-black and the off-white stay in the mix because real signage does
  // use them and an all-primary city looks like a toy.
  const bgs = ['#dc1424', '#0b3ca0', '#f5bf05', '#0aa04a', '#151519', '#f0efe8', '#7412c8', '#f06008'];
  const bg = rngPick(rng, bgs);
  // dark lettering on the two light grounds, otherwise off-white
  const fg = (bg === '#f0efe8' || bg === '#f5bf05') ? '#1b1b20' : '#f6f3e8';
  a.fillStyle = bg; a.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  grain(a, W, H, rng, 14);

  const brand = rngPick(rng, SIGN_BRANDS);
  const trade = rngPick(rng, SIGN_TRADES);
  const tag = rngPick(rng, SIGN_TAGS);

  if (kind === 0) {           // big word + underline
    wordRow(a, 14, 24, W - 28, 46, fg, brand, { align: 'center' });
    wordRow(a, 14, 82, W - 90, 24, fg, trade);
    a.fillStyle = fg; a.fillRect(14, 76, W - 28, 3);
    wordRow(e, 14, 24, W - 28, 46, '#fff6dd', brand, { align: 'center' });
    e.fillStyle = '#ffeec0'; e.fillRect(14, 76, W - 28, 3);
  } else if (kind === 1) {    // framed poster
    a.fillStyle = fg; a.fillRect(8, 8, W - 16, H - 16);
    a.fillStyle = bg; a.fillRect(14, 14, W - 28, H - 28);
    const c2 = rngPick(rng, bgs);
    a.fillStyle = c2; a.beginPath(); a.arc(52, H / 2, 30, 0, 7); a.fill();
    wordRow(a, 92, 34, W - 108, 26, fg, brand);
    wordRow(a, 92, 70, W - 130, 20, fg, trade, { tracking: 0.04 });
    e.fillStyle = c2; e.globalAlpha = 0.7; e.beginPath(); e.arc(52, H / 2, 30, 0, 7); e.fill(); e.globalAlpha = 1;
    wordRow(e, 92, 34, W - 108, 26, '#fff3d8', brand);
  } else if (kind === 4) {    // green highway direction panel (retro-reflective, not emissive)
    a.fillStyle = '#1c6a3c'; a.fillRect(0, 0, W, H);
    grain(a, W, H, rng, 10);
    a.strokeStyle = '#eceadd'; a.lineWidth = 3.5;
    a.strokeRect(9, 9, W - 18, H - 18);
    wordRow(a, 22, 26, W - 44, 30, '#f2f0e4', rngPick(rng, STREET_NAMES),
      { align: 'center', tracking: 0.05 });
    // down / left / right arrow
    const dir2 = rngInt(rng, 0, 2);
    a.fillStyle = '#f2f0e4';
    a.beginPath();
    if (dir2 === 0) { a.moveTo(W / 2, H - 18); a.lineTo(W / 2 - 17, H - 44); a.lineTo(W / 2 + 17, H - 44); }
    else if (dir2 === 1) { a.moveTo(38, H - 32); a.lineTo(64, H - 50); a.lineTo(64, H - 14); }
    else { a.moveTo(W - 38, H - 32); a.lineTo(W - 64, H - 50); a.lineTo(W - 64, H - 14); }
    a.closePath(); a.fill();
    a.fillRect(W / 2 - 5, H - 62, 10, 20);
    // faint lamp wash from the sign's own floodlights at night
    e.fillStyle = '#0d1a12'; e.fillRect(0, 0, W, H);
    const eg = e.createLinearGradient(0, 0, 0, H);
    eg.addColorStop(0, 'rgba(120,170,140,0.55)');
    eg.addColorStop(1, 'rgba(20,40,28,0.05)');
    e.fillStyle = eg; e.fillRect(0, 0, W, H);
  } else if (kind === 2) {    // stripe / highway shield
    for (let i = 0; i < 5; i++) {
      a.fillStyle = i % 2 ? bg : 'rgba(255,255,255,0.14)';
      a.fillRect(0, i * (H / 5), W, H / 5);
    }
    a.fillStyle = fg; a.fillRect(20, 26, W - 40, 4);
    a.fillStyle = fg; a.fillRect(20, H - 30, W - 40, 4);
    wordRow(a, 26, 42, W - 52, 40, fg, brand, { align: 'center' });
    wordRow(e, 26, 42, W - 52, 40, '#ffffff', brand, { align: 'center' });
  } else {                    // three-line dense signage
    const lines = [brand, trade, tag];
    const eCols = ['#eaf4ff', '#ffd0a0', '#eaf4ff'];
    for (let r2 = 0; r2 < 3; r2++) {
      wordRow(a, 12, 12 + r2 * 38, W - 24, 28,
        r2 === 1 ? rngPick(rng, bgs) : fg, lines[r2], { tracking: 0.05 });
      wordRow(e, 12, 12 + r2 * 38, W - 24, 28, eCols[r2], lines[r2], { tracking: 0.05 });
    }
    a.fillStyle = 'rgba(0,0,0,0.35)'; a.fillRect(0, 0, W, 4); a.fillRect(0, H - 4, W, 4);
  }
  // weathering so it is never a flat colour
  for (let i = 0; i < 5; i++) {
    const x = rng() * W;
    const g = a.createLinearGradient(x, 0, x + 20, 0);
    g.addColorStop(0, 'rgba(20,18,14,0)');
    g.addColorStop(0.5, `rgba(20,18,14,${rngRange(rng, 0.05, 0.14)})`);
    g.addColorStop(1, 'rgba(20,18,14,0)');
    a.fillStyle = g; a.fillRect(x, 0, 20, H);
  }
  const wrap = THREE.ClampToEdgeWrapping;
  return {
    map: canvasTexture(ac, { srgb: true, wrap }),
    emissiveMap: canvasTexture(ec, { srgb: true, wrap }),
  };
}

/** Striped canvas awning — tinted per instance, so one texture covers the whole city. */
function makeAwningTex(rng) {
  const W = 128, H = 64;
  const { c, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const sw = W / 8;
  for (let i = 0; i < 8; i += 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(i * sw, 0, sw, H);
  }
  // scalloped valance shadow along the leading edge + sun-bleach toward the top
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.75, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, rng, 12);
  return canvasTexture(c, { srgb: true });
}

/**
 * The inside of a shop, seen through its glazing — tinted per instance so one
 * texture lights every storefront in the city a different colour.
 *
 * This is the layer the r8 critic's saturation number was actually missing. Our
 * podium glazing was a dark reflective sheet, so the whole near-frame ground
 * floor sat at ~0.05 saturation and near-black luma; in all three street-level
 * references the shopfronts are the BRIGHTEST and most saturated thing below the
 * rooflines (the cyan window wall of `daytime-downtown-03`, the warm lit bays of
 * `-02`). It is drawn bright and neutral-warm here and rendered unlit
 * (MeshBasicMaterial) because a lit interior is a light source, not a surface the
 * street canyon's sky occlusion should be allowed to crush.
 */
function makeShopIntTex(rng) {
  const W = 128, H = 128;
  const { c, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#f2ece0'; ctx.fillRect(0, 0, W, H);
  // ceiling light trough, then a falloff down the back wall
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.10, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.62, 'rgba(0,0,0,0.00)');
  g.addColorStop(1.00, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // shelving / rail lines: the horizontals that keep the pane from being one wash
  for (let i = 1; i < 4; i++) {
    const y = H * (0.30 + i * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(6, y, W - 12, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.fillRect(6, y - 2, W - 12, 2);
  }
  // merchandise / mannequin silhouettes standing against the back wall
  for (let i = 0; i < 6; i++) {
    const bw = rngRange(rng, 7, 20), bh = rngRange(rng, 16, 52);
    const bx = 6 + rng() * (W - 12 - bw);
    ctx.fillStyle = `rgba(24,20,16,${rngRange(rng, 0.26, 0.62).toFixed(3)})`;
    ctx.fillRect(bx, H - 16 - bh, bw, bh);
  }
  // dark floor line + the shadow the sill throws inward
  ctx.fillStyle = 'rgba(16,14,12,0.62)'; ctx.fillRect(0, H - 14, W, 14);
  // Glazing bars, drawn INTO the interior texture rather than added as geometry.
  // The lit bay is the brightest and largest single surface in the street-level
  // band and it was one unbroken wash of colour: 10480 of them across the city,
  // so putting the frame in as 4 more box instances each would have cost ~42k
  // instances for something a 128 px texture resolves at 1:1 on the near bays.
  // Dark bar with a light catch-edge, which is the value STEP that survives the
  // shade side of the canyon where a pure-dark bar would vanish.
  const bar = (bx, by, bw, bh) => {
    ctx.fillStyle = 'rgba(20,19,18,0.80)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(226,224,216,0.42)'; ctx.fillRect(bx, by, Math.max(1, bw * 0.34), bh);
  };
  for (let i = 0; i <= 3; i++) bar(Math.round(i * (W - 5) / 3), 0, 5, H - 12);
  ctx.fillStyle = 'rgba(20,19,18,0.72)'; ctx.fillRect(0, Math.round(H * 0.235), W, 5);
  ctx.fillStyle = 'rgba(232,229,220,0.40)'; ctx.fillRect(0, Math.round(H * 0.235) - 2, W, 2);
  // door reveal in one half-bay: an asymmetry, so a row of bays is not a pattern
  bar(Math.round(W * 0.40), Math.round(H * 0.30), 4, Math.round(H * 0.70) - 12);
  grain(ctx, W, H, rng, 12);
  return canvasTexture(c, { srgb: true, wrap: THREE.ClampToEdgeWrapping });
}

/** Perforated / louvred metal panel used for rooftop mechanical housings. */
function makeMechTex(rng) {
  const W = 128, H = 128;
  const { c, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#6f737a'; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, rng, 26);
  for (let y = 6; y < H - 4; y += 7) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(4, y, W - 8, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(4, y + 1, W - 8, 3);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  for (let i = 0; i < 24; i++) {
    const x = rng() * W, y = rng() * H, r = rngRange(rng, 4, 22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(96,64,38,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return canvasTexture(c, { srgb: true });
}

/** Soft contact shadow: dark AO core, fast falloff, nothing at the rim. */
function makeContactTex() {
  const S = 128;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  g.addColorStop(0.20, 'rgba(255,255,255,0.86)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.13)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return canvasTexture(c, { wrap: THREE.ClampToEdgeWrapping });
}

function makeFrondTex(rng) {
  const W = 256, H = 128;
  const { c, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const mid = H / 2;
  ctx.strokeStyle = '#3f6a28'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(4, mid); ctx.lineTo(W - 6, mid - 4); ctx.stroke();
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    const x = 10 + t * (W - 24);
    const len = Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.9) * (H * 0.46) * (1 - t * 0.45);
    const sw = 3.2 - t * 1.6;
    for (const s of [-1, 1]) {
      ctx.strokeStyle = s < 0 ? '#4a7d30' : '#3a6524';
      ctx.lineWidth = sw;
      ctx.beginPath();
      ctx.moveTo(x, mid);
      ctx.quadraticCurveTo(x + len * 0.35, mid + s * len * 0.55, x + len * 0.55, mid + s * len);
      ctx.stroke();
    }
  }
  return canvasTexture(c, { wrap: THREE.ClampToEdgeWrapping });
}

// ---------------------------------------------------------------------------
// shader patches: world-space facade UVs, canyon shade, two-tone glass, aerial perspective
// ---------------------------------------------------------------------------
const ATMO_DECL = /* glsl */`
  uniform vec3 uHaze; uniform float uHazeD; uniform float uHazeW; uniform float uHazeS;
  uniform float uShadeY; uniform float uShadeAmt; uniform float uDay;
  uniform vec3 uSkyWarm; uniform vec3 uBounce; uniform float uReflect;
  uniform vec2 uCanyon;   // x: how dark the canyon floor gets, y: height it recovers by
  uniform float uFillK; uniform vec3 uFillSky; uniform vec3 uFillGnd;
  varying vec3 vWP; varying vec3 vWN;
`;

/**
 * Key-to-fill separation, injected just before the indirect lobes are integrated.
 *
 * sky.js authors its skylight for an open highway. Dropped into a street canyon
 * that same fill lands on BOTH walls at full strength, so a facade square to the
 * sun and one perpendicular to it come out at the same mid-grey and the frame has
 * no key. Pull the diffuse indirect (hemisphere + IBL irradiance) down to roughly
 * a third of the key on architecture only, and the facade normals separate again.
 *
 * Specular `radiance` is deliberately untouched: it is what keeps the glass
 * reflecting a sky, and it carries no value information about the normal anyway.
 *
 * The remaining fill is then tinted by how sky-facing the normal is — cool blue
 * from above, warm ground bounce from below. That is the warm/cool facade split
 * the references show: sunlit planes warm, shaded planes distinctly blue.
 */
const FILL_FRAG = /* glsl */`
  {
    float skyFace = clamp( normalize( vWN ).y * 0.5 + 0.5, 0.0, 1.0 );
    vec3 fillTint = mix( uFillGnd, uFillSky, skyFace );

    // Height + canyon sky occlusion. These used to be a flat multiply on the final
    // colour at the end of the shader, which is the single reason the frame had no
    // sun/shade boundary: a multiply after lighting scales the SUN by exactly as much
    // as it scales the skylight, so a sunlit pavement and a shaded one both came out
    // at the same 40-90 blue-grey and the whole block read as one grey massing model.
    // They are sky-occlusion terms, so they belong on the indirect lobes only. The
    // key then survives at full strength wherever it lands and the terminator between
    // lit and shaded pavement becomes the strongest edge in the frame.
    float shadeK = mix(uShadeAmt, 1.0, smoothstep(uShadeY, uShadeY + 5.0, vWP.y));
    // Sky visibility from a point on a facade falls off as it drops between the
    // buildings opposite, so the bottom of a street canyon receives a small fraction
    // of the skylight the roofline does. Weighted by how vertical the surface is,
    // because a horizontal ledge or a pavement still sees the strip of sky straight up.
    float vertical = 1.0 - abs( normalize( vWN ).y );
    float canyonK = mix(1.0 - uCanyon.x * vertical, 1.0,
                        smoothstep(0.0, max(1.0, uCanyon.y), vWP.y));
    float occl = mix(1.0, shadeK * canyonK, uDay);
    // What little fill survives at the bottom of the canyon is mostly light that
    // bounced off the sunlit road, not sky the surface can still see — so as the sky
    // term falls away the remaining fill goes warm. Without this the shaded half of
    // the street converges on one flat blue and every material in it reads the same;
    // with it a brick pier, a concrete column and a shop fascia stay distinguishable
    // even with no key on them.
    fillTint = mix( fillTint, uFillGnd, ( 1.0 - occl ) * 0.65 );
    vec3 fillK = uFillK * fillTint * occl;

    irradiance *= fillK;
    iblIrradiance *= fillK;
    // The mirrored sky a facade can see is occluded by the same canyon walls, so the
    // specular lobe takes the canyon term too (but not the height term, which is a
    // diffuse-bounce falloff). Without this the glass at street level stays a bright
    // mirror while everything around it goes into shade.
    #if defined( RE_IndirectSpecular )
      radiance *= mix(1.0, canyonK, uDay);
    #endif
  }
  #include <lights_fragment_end>`;

const WP_VERT = /* glsl */`
  vec4 wp4 = vec4(transformed, 1.0);
  mat3 wnm = mat3(modelMatrix);
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
    wnm = wnm * mat3(instanceMatrix);
  #endif
  vWP = (modelMatrix * wp4).xyz;
  vWN = normalize(wnm * objectNormal);
`;

// ---------------------------------------------------------------------------
// AIRLIGHT CALIBRATION (architecture only — see atmoTail)
//
// sky.js authors an extinction coefficient per preset in `preset.fog.d0`
// (midday 0.0016, dusk 0.0030, dawn 0.0034, night 0.0046) and integrates it
// against a height falloff `k` of 0.038, i.e. a 26 m scale height: by 35 m up
// that column has already decayed to 0.26. Architecture is precisely the thing
// that lives above 35 m, so the sky's fog cannot supply its aerial perspective
// no matter what density it is given. world.js therefore runs its own
// height-INDEPENDENT airlight over the facades and props, at AIR_GAIN times the
// preset's ground coefficient.
//
// AIR_GAIN is calibrated, not derived: it is set so that the mid-far facade band
// of `daytime-downtown` (85-200 m of architecture,
// `_facademeas --x 0.560,0.750 --band 0.180,0.440`) lands on
// reference/daytime-downtown-04's edge density instead of 6.4x over it, and so
// that far sobel falls BELOW near sobel as it does in the reference. It is
// expressed as a multiple of d0 rather than as an absolute density so that the
// three other presets keep their authored relative thickness.
//
// AIR_D_START is the near-field onset scale, in metres — see the uHazeS block in
// atmoTail for the mechanism. Without it AIR_GAIN was a single scalar doing two
// jobs: the far band's optical depth AND the near field's, with the exponential's
// steepest slope sitting at dist = 0 where the calibration had no data at all.
// AIR_GAIN was raised 6.0 -> 8.2 at the same time PURELY to hold the 200 m point
// fixed under the new path length (0.0016*8.2*146.4 = 1.92 = 0.0016*6.0*200); it
// is not extra haze, and every distance below ~190 m gets LESS haze than before.
//
// AIR_W is the ceiling on the mix: a facade at infinity goes to AIR_W of the way
// to uHaze, not all the way, which keeps the far towers as silhouettes against
// the sky rather than dissolving them into it.
//
// Both are overridable from the URL hash (`#air=6&airw=0.85`) for paired A/B
// renders without a code edit, the same pattern as main.js's #tone / #bloom.
// AIR_D_MAX caps the result. Only `midday` is calibrated against a reference
// frame; the other three presets author a THICKER d0 (dusk 1.9x, dawn 2.1x,
// night 2.9x of midday's) and 6x of those is a 140 m visual range, which is fog,
// not haze. The cap holds them at roughly midday's thickness until each has a
// reference measurement of its own.
const AIR_D0_FALLBACK = 0.0016;
const AIR_GAIN = 8.2;
const AIR_D_START = 55.0;
const AIR_W = 0.85;
// The cap is expressed relative to midday's calibrated density, and midday's moved
// 0.0096 -> 0.01312 with the renormalisation above, so the cap moves by the same
// 1.367x to keep the other three presets clamped at exactly the thickness they had.
const AIR_D_MAX = 0.0144;

function hashNum(key, def) {
  if (typeof location === 'undefined') return def;
  const m = new RegExp(`(?:^|[#&])${key}=([^&]+)`).exec(location.hash || '');
  const v = m ? parseFloat(decodeURIComponent(m[1])) : NaN;
  return Number.isFinite(v) ? v : def;
}

/** Trailing tint applied at the very end of the fragment shader (linear space). */
function atmoTail(glassExpr) {
  return /* glsl */`
  {
    // NOTE: uShadeY / uShadeAmt / uCanyon are applied in FILL_FRAG, on the indirect
    // lobes only. Do not reintroduce them as a final-colour multiply here — that is
    // what flattened the sun/shade boundary.
    vec3 vdir = normalize(cameraPosition - vWP);
    float fres = pow(clamp(1.0 - abs(dot(vdir, normalize(vWN))), 0.0, 1.0), 2.2);
    float upf = smoothstep(6.0, 46.0, vWP.y);
    vec3 tint = mix(uBounce, uSkyWarm, upf);
    gl_FragColor.rgb += tint * (${glassExpr}) * (0.22 + 0.78 * fres) * uReflect;
    // AIRLIGHT. This used to be mix(rgb, vec3(lum), fq*0.72) followed by only
    // mix(rgb, uHaze, fq*0.18). The first of those is a desaturate towards the
    // surface's OWN luma: it is luminance-preserving BY CONSTRUCTION, so it spent
    // 80% of the haze budget while leaving 100% of a facade's local edge contrast
    // and its white point exactly where they were. The measurable consequence was
    // an INVERTED depth ordering — mid-far facade sobel RISING 6.3x over the near
    // street wall, where reference/daytime-downtown-04 FALLS to 0.58x — and a
    // building 180 m out still showing near-black window recesses beside
    // near-white stone bands. Airlight is additive in-scattered light: it lifts
    // the black point, so contrast has to fall with distance. Nothing else in the
    // frame can do that job for architecture (see AIR_GAIN in createWorld).
    //
    // NEAR-FIELD ONSET (uHazeS). A pure exp(-d*dist) has its STEEPEST slope at
    // dist = 0, so the single scalar that was calibrated on the 85-200 m band was
    // simultaneously deciding how much haze a 30 m storefront takes — at the old
    // uHazeD = 0.0096 that was 25% before the AIR_W ceiling, on exactly the pixels
    // (shop reveals, awning undersides, canyon floor) that have to go dark. dark%
    // and far-band sobel were welded to one number: gain 3 kept sobel legal and
    // left dark% flat, gain 0 freed dark% and blew the far band to 24.3.
    //
    // So the path length gets a soft start: de is quadratic in dist near zero
    // (de ~ dist^2 / 2S) and asymptotically parallel to (dist - S) far away. One
    // exp, C1-continuous, no branch, and no new gain — it can only ever REMOVE
    // optical depth relative to the old form (de <= dist for all dist >= 0), so
    // nothing downstream sees a larger number than it did before.
    //
    // uHazeD is then renormalised so the 200 m point keeps the optical depth the
    // Wave J/K calibration put there: de(200; S=55) = 146.4 m, and
    // 0.0131 * 146.4 = 1.92 = 0.0096 * 200. The far band is held FIXED by
    // construction; only the near field moves.
    float dist = length(cameraPosition - vWP);
    float de = dist - uHazeS * (1.0 - exp(-dist / max(uHazeS, 1e-3)));
    float fq = 1.0 - exp(-uHazeD * de);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(fq * uHazeW, 0.0, 1.0));
  }`;
}

/** Buildings: world-space triplanar-ish facade UVs + all of the above. */
function patchFacade(mat, atmo, tw, th) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, atmo);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${ATMO_DECL}`)
      .replace('#include <project_vertex>', `${WP_VERT}\n#include <project_vertex>`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${ATMO_DECL}`)
      .replace('#include <map_fragment>', /* glsl */`
        vec3 fN = normalize(vWN);
        vec2 fUv;
        if (abs(fN.y) > 0.5) fUv = vWP.xz / vec2(${tw.toFixed(1)}, ${tw.toFixed(1)});
        else fUv = vec2(dot(vWP.xz, vec2(-fN.z, fN.x)) / ${tw.toFixed(1)}, vWP.y / ${th.toFixed(1)});
        diffuseColor *= texture2D(map, fUv);
        float gMask = 0.0;
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        vec4 orm = texture2D(roughnessMap, fUv);
        gMask = orm.b;
        float roughnessFactor = roughness * orm.g;
      `)
      .replace('#include <metalnessmap_fragment>', /* glsl */`
        float metalnessFactor = metalness * orm.b;
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */`
        totalEmissiveRadiance *= texture2D(emissiveMap, fUv).rgb;
      `)
      .replace('#include <lights_fragment_end>', FILL_FRAG)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${atmoTail('gMask')}`);
  };
  return mat;
}

/** Props / signs: keep their own UVs, just get the atmosphere. */
function patchAtmo(mat, atmo, reflect = 0.0) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, atmo);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${ATMO_DECL}`)
      .replace('#include <project_vertex>', `${WP_VERT}\n#include <project_vertex>`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${ATMO_DECL}`)
      .replace('#include <lights_fragment_end>', FILL_FRAG)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${atmoTail(reflect.toFixed(2))}`);
  };
  return mat;
}

// ---------------------------------------------------------------------------
export function createWorld(scene, { rng: injectedRng, roadKit }) {
  installPcss();
  const group = new THREE.Group();
  scene.add(group);
  const R = makeRng(0xC0FFEE);

  // Set by applyKeyFill(sky) and read ONLY (sky.js belongs to another builder).
  let _sky = null;
  const _airGain = hashNum('air', AIR_GAIN);
  const _airW = hashNum('airw', AIR_W);
  const _airDMax = hashNum('airmax', AIR_D_MAX);
  const _airStart = hashNum('airs', AIR_D_START);

  /**
   * The atmosphere's ground extinction coefficient, in 1/m.
   *
   * `scene.fog.density` is NOT a usable source: sky.js constructs the FogExp2
   * with a hardcoded 0.001 placeholder and never writes the preset's real d0
   * onto it, so reading it silently ran this whole airlight at 0.001 (3.4%
   * airlight at 180 m) regardless of time of day. `sky.fogParams` IS live —
   * sky.js writes `[d0, k, y0, uni]` into it on every apply() — so that is the
   * primary source here. The fallback chain is ordered so that it keeps working
   * if sky.js later starts writing the true density onto scene.fog as well, and
   * so that it never picks the 0.001 placeholder back up while a real source
   * exists.
   */
  function skyFogD0() {
    const fp = _sky && _sky.fogParams;
    if (fp && fp.length && fp[0] > 0) return fp[0];
    const pf = _sky && _sky.preset && _sky.preset.fog;
    if (pf && pf.d0 > 0) return pf.d0;
    const d = scene.fog && scene.fog.density;
    // 0.001 is sky.js's dead placeholder; treat it as "no information".
    if (d > 0 && Math.abs(d - 0.001) > 1e-9) return d;
    return AIR_D0_FALLBACK;
  }

  // shared atmosphere uniforms — driven from scene.fog every frame in update()
  const atmo = {
    uHaze: { value: new THREE.Color(0.55, 0.62, 0.72) },
    uHazeD: { value: AIR_D0_FALLBACK * AIR_GAIN },
    uHazeW: { value: AIR_W },
    uHazeS: { value: AIR_D_START },
    uShadeY: { value: 30.0 },
    uShadeAmt: { value: 0.60 },
    uDay: { value: 1.0 },
    uSkyWarm: { value: new THREE.Color(0.75, 0.70, 0.60) },
    uBounce: { value: new THREE.Color(0.10, 0.13, 0.18) },
    uReflect: { value: 0.55 },
    uCanyon: { value: new THREE.Vector2(0.46, 26.0) },
    // diffuse fill scale + its sky/ground tint — see FILL_FRAG. Driven per
    // time-of-day in update(); 1.0/white would be three's stock behaviour.
    uFillK: { value: 0.34 },
    uFillSky: { value: new THREE.Color(0.62, 0.78, 1.06) },
    uFillGnd: { value: new THREE.Color(0.96, 0.88, 0.74) },
  };

  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YZX';
  const tmpC = new THREE.Color();
  const contacts = [];   // {x,z,y,rx,rz,ry,a} — see shadowAt() below

  // ---- THE SINK: deferred allocation, so the cap IS the count ---------------------------
  //
  // WHAT THIS REPLACES, AND WHY. `inst(geo, mat, cap)` used to allocate an InstancedMesh up
  // front and `push()` used to write straight into it, with `if (m.count >= m.userData.cap)
  // return;` as the only overflow handling — a SILENT drop, no throw, no counter. Every cap in
  // this file was hand-sized for a 1.1 km square, and the file records four separate historical
  // incidents of a cap quietly truncating a population (see the notes at the signFrame, signMesh,
  // palm and awning pools). A streaming world sized for a 4000 x 2861 m map cannot keep guessing
  // these numbers.
  //
  // So allocation is DEFERRED. An emitter pushes into a growable Float32Array with no cap at all;
  // `finalize()` then allocates each InstancedMesh at exactly the number of pushes it received.
  // The count expression for every pool is literally `p.count`, so there is no bound to get wrong
  // and overflow is not a state the emission path can reach.
  //
  // A two-pass "count, then allocate" would NOT work here and it is worth saying why: the code
  // paths are RNG-branched (`if (R() < 0.45)`, `rngInt(R, 2, 5)` loop counts, `while (t < len/2 -
  // 12)`), so a counting pass that did not draw the same random numbers would produce a bound
  // rather than a count, and one that did draw them would consume the stream twice.
  //
  // A pool descriptor IS a THREE.Group, deliberately. Later code holds direct handles to
  // individual pools and toggles them — `spillMesh.visible = night` in setNight, and
  // `world.aoExclude`, which post.js hides by writing `o.visible = false`. Making the descriptor
  // the Group that the finalized meshes hang under preserves every one of those handles for free,
  // exactly as the old render-side cut preserved them by parenting chunks to their source mesh.

  /**
   * Overflow counter. The sink itself cannot drop — there is no cap during emission — so this
   * exists for the pools that are still allocated with a literal size (contactMesh) and for any
   * future pool that reintroduces one. Published on `world.chunkStats().overflow` and asserted
   * zero by the probe, which closes a bug class the four incidents above are instances of.
   */
  const dropStats = { n: 0, pools: {} };
  function dropped(name) {
    dropStats.n++;
    dropStats.pools[name] = (dropStats.pools[name] || 0) + 1;
  }

  const sink = { pools: [], remap: new Map() };

  /**
   * Declare a pool. Returns the descriptor, which is also registered on the sink under `name` so
   * an emitter can reach it through its `sink` argument instead of closing over this scope.
   */
  function pool(name, geo, mat, { cast = true, recv = true, parent = group } = {}) {
    const p = new THREE.Group();
    p.name = name;
    p.castShadow = cast;
    p.receiveShadow = recv;
    p.count = 0;
    p._geo = geo;
    p._mat = mat;
    p._cap = 256;                          // instances the scratch buffers currently hold
    p._m = new Float32Array(p._cap * 16);
    p._c = null;                           // allocated lazily, and only if a colour is ever set
    parent.add(p);
    sink.pools.push(p);
    sink[name] = p;
    return p;
  }

  function grow(p) {
    if (p.count < p._cap) return;
    p._cap *= 2;
    const m = new Float32Array(p._cap * 16);
    m.set(p._m); p._m = m;
    if (p._c) {
      // three's setColorAt fills a fresh instanceColor with 1, so an instance that never gets a
      // colour comes out WHITE, not black. The growable copy has to keep that property.
      const c = new Float32Array(p._cap * 3).fill(1);
      c.set(p._c); p._c = c;
    }
  }

  /** Append `dummy`'s current matrix. Same argument list as the old push(), minus the cap. */
  function push(p, x, y, z, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    pushMat(p, dummy.matrix, color);
  }

  /**
   * Append an already-composed matrix. `streetLight` and `parkedCar` need this: they set up
   * `dummy` with a rotation order or an axis convention that push()'s (0, ry, rz) cannot express,
   * and used to reach past push() and call `setMatrixAt` on the pool directly.
   */
  function pushMat(p, mat4, color) {
    grow(p);
    mat4.toArray(p._m, p.count * 16);
    if (color !== undefined) {
      if (!p._c) p._c = new Float32Array(p._cap * 3).fill(1);
      tmpC.setHex(color, THREE.SRGBColorSpace).toArray(p._c, p.count * 3);
    }
    p.count++;
  }

  /**
   * Discard the last instance pushed to a pool. Nothing needs this today — `bench()` used to push
   * a placeholder leg and then decrement the count, which this replaces and which was deleted as
   * dead code — but a pool that emits speculatively and then retracts is a shape the emitters can
   * legitimately take, and without it the scratch buffer keeps a stale 16 floats.
   */
  function pop(p) { if (p.count > 0) p.count--; }

  // CHUNK is a real trade and was measured, not guessed: smaller cells cull more triangles and
  // cost more draw calls (one per occupied cell per draw state). See verdicts/wave-s for the
  // sweep. It used to live at the bottom of this file, in a pass that re-cut the finished pools;
  // now it is the allocation granularity itself and no re-cut is needed.
  const CHUNK = 200;
  // Below this many instances a draw state is left as one mesh per pool. A 60-instance pool
  // cannot pay back the extra draw calls cutting it would add, and the point is to spend calls
  // only where there are triangles behind them.
  const CHUNK_MIN = 400;

  /**
   * Allocate every pool at exactly the number of instances it received, bucketed by DRAW STATE.
   *
   * Pools are merged by (geometry, material, castShadow, receiveShadow, renderOrder) before they
   * are cut. Those are not distinct THINGS to the GPU — a bench slat, a traffic-light head, a
   * sign frame and a bumper are all `boxGeo` with `darkMat`, i.e. the same program and the same
   * buffers, split across pools only because they were built by different functions. Bucketing
   * makes a cell cost one call per distinct draw state rather than one per author; without it,
   * cutting downtown into cells took the city from 849 calls to 2285.
   *
   * THE CONSTRAINT THIS INTRODUCES, stated because it is not obvious: merged instances lose their
   * individual pool's `visible` flag. That is safe for every pool here — the only one this file
   * toggles on its own is `spillMesh`, whose `spillMat` is unique to it, so it can never share a
   * bucket. A future pool that needs its own visibility needs its own material (which it needs
   * anyway to look different).
   *
   * Each cell mesh gets `frustumCulled = true` and a tight bounding sphere, so three can reject a
   * cell that is behind the camera or outside the shadow cascade. That is a provably lossless
   * cull, which is why this is frustum culling and NOT a distance cull: the skyline is 800 m away
   * and is supposed to be there.
   */
  function finalize() {
    let meshes = 0, cells = 0, instances = 0;
    const buckets = new Map();
    for (const p of sink.pools) {
      if (p.count < 1) continue;
      const key = `${p._geo.uuid}|${p._mat.uuid}`
        + `|${p.castShadow ? 1 : 0}${p.receiveShadow ? 1 : 0}|${p.renderOrder}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = []);
      b.push(p);
    }

    /** One mesh per pool, unchunked and never culled: the draw state is too small to cut. */
    const whole = (ps) => {
      for (const p of ps) {
        const im = new THREE.InstancedMesh(p._geo, p._mat, p.count);
        im.castShadow = p.castShadow;
        im.receiveShadow = p.receiveShadow;
        im.renderOrder = p.renderOrder;
        im.frustumCulled = false;
        im.name = p.name;
        im.instanceMatrix.array.set(p._m.subarray(0, p.count * 16));
        im.instanceMatrix.needsUpdate = true;
        if (p._c) {
          im.instanceColor = new THREE.InstancedBufferAttribute(
            p._c.slice(0, p.count * 3), 3);
          im.instanceColor.needsUpdate = true;
        }
        p.add(im);
        const r = new Map();
        for (let i = 0; i < p.count; i++) r.set(i, [im, i]);
        sink.remap.set(p, r);
        meshes++; instances += p.count;
      }
    };

    for (const ps of buckets.values()) {
      const total = ps.reduce((a, p) => a + p.count, 0);
      if (total < CHUNK_MIN) { whole(ps); continue; }

      // cell key -> the instances of this draw state that land in that 200 m cell
      const grid = new Map();
      let anyColor = false;
      for (const p of ps) if (p._c) anyColor = true;
      for (const p of ps) {
        for (let i = 0; i < p.count; i++) {
          // [12] and [14] are the translation x/z of a column-major mat4.
          const key = `${Math.floor(p._m[i * 16 + 12] / CHUNK)},${Math.floor(p._m[i * 16 + 14] / CHUNK)}`;
          let b = grid.get(key);
          if (!b) grid.set(key, b = []);
          b.push([p, i]);
        }
      }
      if (grid.size < 2 && ps.length < 2) { whole(ps); continue; }

      const host = ps[0];
      for (const refs of grid.values()) {
        const im = new THREE.InstancedMesh(host._geo, host._mat, refs.length);
        im.castShadow = host.castShadow;
        im.receiveShadow = host.receiveShadow;
        im.renderOrder = host.renderOrder;
        im.name = `${host.name || 'pool'}:chunk`;
        const md = im.instanceMatrix.array;
        let cd = null;
        if (anyColor) {
          im.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(refs.length * 3).fill(1), 3);
          cd = im.instanceColor.array;
        }
        for (let k = 0; k < refs.length; k++) {
          const [p, i] = refs[k];
          md.set(p._m.subarray(i * 16, i * 16 + 16), k * 16);
          // A pool with no colours in a bucket where another pool has them must contribute
          // white, or its instances would come out black.
          if (cd && p._c) cd.set(p._c.subarray(i * 3, i * 3 + 3), k * 3);
          let r = sink.remap.get(p);
          if (!r) sink.remap.set(p, r = new Map());
          r.set(i, [im, k]);
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        // three would compute this lazily on the first frustum test anyway; doing it here keeps
        // the whole cost inside the build.
        im.computeBoundingSphere();
        host.add(im);
        meshes++; cells++; instances += refs.length;
      }
    }
    return { meshes, cells, instances, states: buckets.size };
  }

  /**
   * Where a pooled instance actually ended up. An emitter records `[descriptor, index]` at build
   * time, but the instance it refers to is written into whichever finalized mesh its cell owns,
   * so anything editing a baked instance after the build — polefall hiding a knocked-down lamp,
   * traffic.js hiding a parked car it has promoted to a live wreck — must resolve through here.
   * Writing to the descriptor instead is the bug that left a phantom parked car on screen.
   */
  function resolve(p, i) {
    const r = sink.remap.get(p);
    return (r && r.get(i)) || null;
  }
  sink.resolve = resolve;
  /**
   * Register a fake contact shadow.
   *
   * `rx`/`rz` are HALF-EXTENTS in the pad's own frame and `ry` yaws that frame,
   * so anything with a heading (a car, a bench, a skip) can lay down a pad the
   * shape of its own footprint instead of a circle circumscribing it. The
   * default `rz = rx` keeps every existing round-footprint caller (posts,
   * hydrants, trees, piers) byte-identical.
   *
   * `a` is a per-caller opacity multiplier. It used to be recorded here and
   * then silently dropped by the renderer at the bottom of this file, which is
   * why a hydrant and a car both printed at the material's flat 0.72; it is now
   * bound to the pad through instanceColor.
   */
  const shadowAt = (x, z, y, rx, a = 1, ry = 0, rz = rx) =>
    contacts.push({ x, z, y, rx, rz, ry, a });

  // ---- ground --------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x25262a, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- roads ---------------------------------------------------------
  const roads = new THREE.Group();
  group.add(roads);
  const G = LAYOUT.grid, EX = LAYOUT.extent, HALF = LAYOUT.roadW / 2;

  for (const z of G) roads.add(roadKit.buildRibbon([[-EX, z], [EX, z]], { cls: 'city' }));
  for (const x of G) {
    const stops = [-EX, ...G, EX];
    for (let i = 0; i < stops.length - 1; i++) {
      const z0 = stops[i] + (G.includes(stops[i]) ? HALF + 1 : 0);
      const z1 = stops[i + 1] - (G.includes(stops[i + 1]) ? HALF + 1 : 0);
      if (z1 - z0 < 6) continue;
      roads.add(roadKit.buildRibbon([[x, z0], [x, z1]], { cls: 'city', y: 0.028 }));
    }
  }
  const HZ = LAYOUT.highwayZ;
  roads.add(roadKit.buildRibbon([[-1200, HZ], [1200, HZ]], { cls: 'highway', shoulder: 3 }));
  roads.add(roadKit.buildRibbon(
    [[0, -EX], [0, -EX - 40], [-30, HZ + 70], [-70, HZ + 22]], { cls: 'city' },
  ));

  // ---- shared materials -------------------------------------------------
  const conc = makeConcrete(R);
  const concMat = patchAtmo(new THREE.MeshStandardMaterial({
    map: conc.map, roughnessMap: conc.ormMap, metalnessMap: conc.ormMap,
    color: 0xb4b0a6, roughness: 1.0, metalness: 1.0,
  }), atmo, 0.05);
  const kerbMat = patchAtmo(new THREE.MeshStandardMaterial({
    map: conc.map, roughnessMap: conc.ormMap,
    color: 0x8d8f92, roughness: 1.0, metalness: 0,
  }), atmo, 0.0);
  const walkMat = patchAtmo(new THREE.MeshStandardMaterial({
    map: conc.map, roughnessMap: conc.ormMap,
    color: 0x6c6e72, roughness: 1.0, metalness: 0,
  }), atmo, 0.0);
  kerbMat.map = conc.map.clone(); kerbMat.map.repeat.set(0.18, 0.18); kerbMat.map.needsUpdate = true;
  walkMat.map = conc.map.clone(); walkMat.map.repeat.set(0.4, 0.4); walkMat.map.needsUpdate = true;

  const poleMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0x33363c, roughness: 0.55, metalness: 0.75,
  }), atmo, 0.10);
  const darkMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0x2b2e34, roughness: 0.8, metalness: 0.25,
  }), atmo, 0.05);
  const paintedMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.62, metalness: 0.05,
  }), atmo, 0.05);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x6f9e4a, roughness: 0.85, metalness: 0,
  });
  const railMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0x9aa0aa, roughness: 0.38, metalness: 0.9,
  }), atmo, 0.25);

  // ---- sidewalks + kerbs ---------------------------------------------
  const blocks = [];
  for (let i = 0; i < G.length - 1; i++) {
    for (let j = 0; j < G.length - 1; j++) {
      const cx = (G[i] + G[i + 1]) / 2, cz = (G[j] + G[j + 1]) / 2;
      const w = (G[i + 1] - G[i]) - LAYOUT.roadW - 6;
      const d = (G[j + 1] - G[j]) - LAYOUT.roadW - 6;
      // w/d is the paved block (kerb to kerb); bw/bd is the building line, held
      // back by walkW so there is real pavement for props, awnings and shadows.
      blocks.push({ cx, cz, w, d, bw: w - LAYOUT.walkW * 2, bd: d - LAYOUT.walkW * 2 });

      const walk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), kerbMat);
      walk.position.set(cx, 0.11, cz);
      walk.receiveShadow = true;
      // The kerb is the only 22 cm step in the frame and it runs the full length of
      // every block, so it is the cheapest possible hard shadow: one thin dark line
      // in the gutter that grounds the pavement onto the road instead of letting the
      // two abut as one flat grey. Safe to self-shadow — the slab is 22 cm thick,
      // six times the sun's normalBias, so its own top face never punches through.
      walk.castShadow = true;
      group.add(walk);
      const innerM = new THREE.Mesh(new THREE.BoxGeometry(w - 1.6, 0.24, d - 1.6), walkMat);
      innerM.position.set(cx, 0.12, cz);
      innerM.receiveShadow = true;
      // deliberately NOT a caster: it clears `walk` by 2 cm, so all it could ever
      // contribute is a sub-centimetre acne fringe on the surface it sits flush with.
      group.add(innerM);
    }
  }

  // ---- buildings ------------------------------------------------------
  const styles = ['glass', 'office', 'brick', 'concrete'];
  const facades = {}, buildingMats = {};
  for (const s of styles) {
    facades[s] = makeFacade(R, s);
    buildingMats[s] = patchFacade(new THREE.MeshStandardMaterial({
      map: facades[s].map,
      emissiveMap: facades[s].emissiveMap,
      roughnessMap: facades[s].ormMap,
      metalnessMap: facades[s].ormMap,
      emissive: 0xffffff, emissiveIntensity: 0.0,
      roughness: 1.0, metalness: 1.0,
      envMapIntensity: 1.15,
    }), atmo, TILE_W, TILE_H);
  }
  const store = makeStorefront(R);
  const storeMat = patchFacade(new THREE.MeshStandardMaterial({
    map: store.map, emissiveMap: store.emissiveMap,
    roughnessMap: store.ormMap, metalnessMap: store.ormMap,
    emissive: 0xffffff, emissiveIntensity: 0.0,
    roughness: 1.0, metalness: 1.0, envMapIntensity: 1.0,
  }), atmo, PODIUM_W, PODIUM_H);

  const buildings = new THREE.Group();
  group.add(buildings);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const towerMesh = {};
  for (const s of styles) towerMesh[s] = pool(`tower_${s}`, boxGeo, buildingMats[s], { parent: buildings });
  const podiumMesh = pool('podiumMesh', boxGeo, storeMat, { parent: buildings });
  // Reachable through the sink like every other pool: these two are keyed collections
  // (by shaft style, by sign variant) rather than single pools, so they are registered by hand.
  sink.towerMesh = towerMesh;

  // ---- facade-detail kitbash --------------------------------------------
  // Every mass gets a projecting cornice, a hollow parapet ring, ledge bands and a
  // rooftop of mechanical greebles, so no silhouette is ever a clean vertical prism.
  const capMesh = pool('capMesh', boxGeo, concMat);     // cornices / parapets / ledge bands
  const plantMesh = pool('plantMesh', boxGeo, concMat);    // concrete rooftop blocks
  const mechTex = makeMechTex(R);
  const mechMat = patchAtmo(new THREE.MeshStandardMaterial({
    map: mechTex, color: 0x9aa0a8, roughness: 0.72, metalness: 0.45,
  }), atmo, 0.10);
  const mechMesh = pool('mechMesh', boxGeo, mechMat);     // louvred plant housings, vents, bulkheads
  const tankMesh = pool('tankMesh', new THREE.CylinderGeometry(0.5, 0.5, 1, 12), mechMat);
  const mastMesh = pool('mastMesh', new THREE.CylinderGeometry(0.5, 0.5, 1, 6), poleMat, { recv: false });
  // Thin metalwork — fire-escape platforms and stairs, sign bracket arms, floodlight
  // goosenecks, tank legs. It DOES cast: at 3 cm/texel a 17 cm bracket is five texels
  // wide, and a ladder of fire-escape shadows raking down a brick wall is one of the
  // loudest things the reference storefront blocks have. It is a single instanced
  // draw in the shadow pass, so the whole 22 k of it costs one extra call.
  const strutMesh = pool('strutMesh', boxGeo, poleMat, { cast: true, recv: false });
  const acMesh = pool('acMesh', boxGeo, mechMat, { recv: true });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a18, toneMapped: true });
  const beaconMesh = pool('beaconMesh', new THREE.SphereGeometry(0.5, 6, 5), beaconMat, { cast: false, recv: false });

  // ---- modular facade kit -------------------------------------------------
  // The window "detail" in the facade texture is planar, so on its own the wall
  // is a greybox. This kit hangs REAL geometry off the wall plane: full-height
  // mullion piers and per-floor spandrel bands that project 22-34 cm, which
  // turns every window into a genuinely recessed bay and — because the sun is
  // high and hard — lays a small hard shadow onto the wall beside each pier.
  // Tinted per instance so the frame matches its parent style's trim colour.
  // Mullion / spandrel trim per shaft style. These are the piers, so they cover a
  // large share of the facade band's pixels — three of the four were effectively
  // achromatic (glass sat 0.107, concrete 0.136, the 0xa9a192 fallback 0.136) and
  // that alone held the band mean down. Raised to sat 0.20-0.27 by LOWERING the
  // min channel only: the max channel of every entry is byte-identical to what it
  // was, so value and the material's headroom are untouched and nothing here can
  // clip — this is a chroma shift, not a gain. `brick` was already sat 0.44 and is
  // left alone.
  const STYLE_TRIM = {
    glass: 0x7c8e9f, office: 0xa8977c, brick: 0x9a6a56, concrete: 0xb0a288,
  };
  const mullionMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.82, metalness: 0.05,
    envMapIntensity: 1.0,
  }), atmo, 0.12);
  // Trim both casts and receives. It only became safe to receive once the sun's
  // shadow normalBias dropped below the depth of the fins themselves (see the
  // shadow-cascade block in main.js); at the old 0.35 m bias every one of these
  // steps was pushed straight through its own shadow.
  const gridMesh = pool('gridMesh', boxGeo, mullionMat, { cast: true, recv: true });
  /** per-instance tonal jitter so a whole grid never reads as one flat plastic colour */
  function tintVary(hex, k) {
    return (clamp(Math.round(((hex >> 16) & 255) * k), 0, 255) << 16)
      | (clamp(Math.round(((hex >> 8) & 255) * k), 0, 255) << 8)
      | clamp(Math.round((hex & 255) * k), 0, 255);
  }
  const BAY_W = 3.6;      // one window bay
  const FLOOR_H = 3.5;
  // GRID_TOP was 46 m, chosen when the shaft grid was assumed to stop resolving
  // there. Measured on the daytime-downtown frame it does not: the near street-wall
  // masses run to 36 m and the inner towers to 138, and the facade measurement band
  // (y 5-55% of frame) is mostly wall ABOVE 46 m, which was arriving as bare
  // extruded box. 66 m is where a 3.5 m floor band genuinely drops under a pixel at
  // this lens, and it is the single largest edge-density gain available per instance.
  const GRID_TOP = 66;

  // ---- facade paint -------------------------------------------------------
  // Every tower and podium mass was pushed with NO instance colour, so the whole
  // city wore exactly four texture albedos and the facade band measured 0.316 mean
  // saturation against the references' 0.476-0.537. Paradise City is not grey: in
  // `daytime-downtown-01` there is a full mint-green tower, two teal blocks and a
  // cream/terracotta low-rise in one frame; `-02` and `-03` put saturated paint on
  // most of the mid-ground masses. So tint per instance from a painted-render
  // palette. PAINT_CHANCE (below) is what actually sets the split and it is
  // 0.05/0.12/0.44/0.44 by style, not "roughly a third" as this comment used to
  // claim — the saturated-colour share is ~44% for office and concrete masses.
  // The "neutral" half of the palette was the actual defect, not PAINT_CHANCE.
  // These six sat at HSV saturation 0.044-0.109, i.e. achromatic stone, and with
  // PAINT_CHANCE at 0.44 for the two commonest styles a clear majority of every
  // mass in frame drew from them — measured facade-band sat 0.358 against
  // dd-01 0.551 / dd-02 0.501 / dd-04 0.556.
  // So the neutrals now carry sat 0.198-0.251 in three families (warm cream/sand,
  // pinkish limestone, cool blue-grey). Raising PAINT_CHANCE instead would have
  // made a toy town; this keeps the same number of quiet masses and just stops
  // them being colourless.
  // Each entry preserves its predecessor's MAX channel exactly (217/201/191/210/
  // 182/202), so mean value is unchanged and the extra chroma comes only from
  // pulling the min channel down. Nothing downstream sees a larger number than
  // it did before.
  //
  // WAVE N MEASURED RESULT — READ BEFORE TOUCHING THIS TABLE AGAIN. This edit is
  // CORRECT IN KIND but it is NOT the lever that closes the band-sat gap, and the
  // next builder must not spend a round re-tuning these six numbers.
  // Paired atomic A/B (peer hashes verified stable across both renders),
  // `_facademeas --band 0.05,0.55`:  sat 0.353 -> 0.339.  It went slightly DOWN.
  // A saturating smoke test — PAINT_NEUTRAL and the six pale PODIUM_TRIM entries
  // forced to 0xff00ff and all of STYLE_TRIM to 0x00ff00, i.e. HSV sat 1.0 over
  // the majority of the frame's architecture — reaches only sat 0.399. So the
  // entire facade-palette lever has a HEADROOM OF +0.046 on that metric and the
  // brief's target of >=0.48 is unreachable through it by construction.
  // Why: the metric's "saturation" on our render is mostly the BLUE AIRLIGHT CAST,
  // not paint. A grey mass under a blue additive haze reads as saturated blue; a
  // warm cream mass under the same haze partially CANCELS it and reads as neutral.
  // That is why warming the neutrals lowers the number. Two independent variants
  // confirm it — constant-max-channel (this one) 0.353 -> 0.339, and a
  // constant-LUMINANCE variant 0.351 -> 0.335.
  // Also: the brief's premise that dd-01 contains no achromatic mass is FALSE.
  // `_px reference/daytime-downtown-01.jpg --region cream=0.755,0.805,0.30,0.55`
  // reads sat 0.125 and `--region white=0.60,0.65,0.33,0.55` reads 0.221. The
  // reference's 0.551 band mean comes from a FEW extreme-chroma heroes (the mint
  // tower at 0.663, the orange billboard, the green awning, deep blue sky) sitting
  // next to 24.3% genuinely dark pixels — not from a uniformly chromatic neutral
  // population. The real levers are value structure (our dark% is 8, ref 24) and
  // chroma survival through the airlight, neither of which lives in this table.
  const PAINT_NEUTRAL = [0xd9cba6, 0x9fb3c9, 0xbfae8f, 0xd2bc9e, 0x92a4b6, 0xcab19f];
  const PAINT_COLOUR = [
    0x4fbf94,   // mint green — the -01 tower
    0x37a9a0,   // teal
    0xc9694a,   // terracotta
    0xd9a63c,   // ochre
    0x5f8fc4,   // pale blue
    0xd2807f,   // salmon
    0x8fbf55,   // pistachio
    0xa96fa8,   // mauve
  ];
  const PAINT_CHANCE = { glass: 0.05, brick: 0.12, office: 0.44, concrete: 0.44 };
  // Pale stone / painted-metal shopfront framing, plus two saturated shop-paint
  // options for the awning-and-fascia trades the references show. The six pale
  // entries had the same defect as PAINT_NEUTRAL (sat 0.054-0.127) and they sit at
  // street level, i.e. squarely inside the y 5-55% facade band and close to the
  // lens. Now sat 0.180-0.255 as warm stone plus one cool grey; again the max
  // channel of each entry is byte-identical to before, so the pale-frame-against-
  // dark-glass VALUE step that this table exists to create is fully preserved.
  const PODIUM_TRIM = [
    0xe0d3b3, 0xd4c2a1, 0xe8dcba, 0xa1b4c9, 0xdcc9a4, 0xefe3c4,
    0x3f8f74, 0x9e4038,
  ];
  /** Base paint for a mass. `chance` biases how often it takes saturated colour. */
  function facadePaint(sink, rng, chance) {
    if (rng() < chance) return tintVary(rngPick(rng, PAINT_COLOUR), rngRange(rng, 0.86, 1.12));
    return tintVary(rngPick(rng, PAINT_NEUTRAL), rngRange(rng, 0.90, 1.10));
  }

  /** Projecting pier / spandrel grid over a shaft's outer faces. */
  function facadeGrid(sink, rng, x, z, w, d, y0, y1, style, faces) {
    const { gridMesh } = sink;
    const trim = tintVary(STYLE_TRIM[style] || 0xa99b80, rngRange(rng, 0.86, 1.14));
    const top = Math.min(y1 - 0.7, y0 + GRID_TOP);
    if (top - y0 < 3.2) return;
    for (const ry of faces) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const wide = Math.abs(nx) > 0.5;
      const along = wide ? d : w;
      const half = wide ? w / 2 : d / 2;
      const n = Math.max(2, Math.round(along / BAY_W));
      const step = along / n;
      // Vertical mullion piers. The wall plane carrying the glass sits PIER metres
      // behind their outer face, so every window is a real 42 cm reveal, not a decal:
      // the pier's own side face turns away from the key and the reveal collects AO.
      const PIER = 0.42, PIER_EDGE = 0.58;
      for (let i = 0; i <= n; i++) {
        const o = -along / 2 + i * step;
        const edge = (i === 0 || i === n);
        const dep = edge ? PIER_EDGE : PIER;
        push(gridMesh, x + nx * (half + dep / 2) - nz * o, (y0 + top) / 2,
          z + nz * (half + dep / 2) + nx * o, ry, 0,
          edge ? 1.15 : 0.72, top - y0, dep, trim);
        // Intermediate jamb fin at the half-bay. The facade TEXTURE draws six 3 m
        // bays per 18 m tile while the pier grid was only stepping every 3.6 m, so
        // one window in two had a painted reveal and no real one. This is a 22 cm
        // fin — shallower than the pier, so the bay still reads as pier-major —
        // and it doubles the vertical line count on every wall in the frame for
        // one instance per bay per floor-run.
        if (i < n) {
          push(gridMesh, x + nx * (half + 0.11) - nz * (o + step / 2), (y0 + top) / 2,
            z + nz * (half + 0.11) + nx * (o + step / 2), ry, 0,
            0.34, top - y0, 0.22, trim);
        }
      }
      // Per-floor band, three real steps deep. Reading up from the floor line:
      // the spandrel apron under the sill, a 0.62 m projecting sill lip that
      // overhangs it, and the window head that overhangs the glass from above.
      // Under a high sun the head lays a hard band across the top of every pane
      // and the sill lip drops one onto the spandrel below.
      for (let y = y0 + FLOOR_H; y < top - 0.8; y += FLOOR_H) {
        push(gridMesh, x + nx * (half + 0.17), y, z + nz * (half + 0.17), ry, 0,
          along, 0.70, 0.34, trim);
        push(gridMesh, x + nx * (half + 0.31), y + 0.40, z + nz * (half + 0.31), ry, 0,
          along, 0.22, 0.62, trim);
        const hy = y + FLOOR_H - 0.62;
        if (hy < top - 0.4) {
          push(gridMesh, x + nx * (half + 0.25), hy, z + nz * (half + 0.25), ry, 0,
            along, 0.26, 0.50, trim);
        }
      }
    }
  }

  // ---- lit shop interiors -------------------------------------------------
  // One unlit quad per shop bay, sitting 4 cm off the podium wall so the 40-80 cm
  // pilasters, the transom beam and the canopy above all stand in front of it and
  // read as a real reveal around a real bright box. Unlit on purpose: a lit shop
  // is a light source, and running it through the canyon sky-occlusion term is
  // exactly what crushed the old glazing to near-black. Scene fog still takes it
  // down with distance, so aerial perspective is preserved.
  const shopIntMat = new THREE.MeshBasicMaterial({
    map: makeShopIntTex(R), toneMapped: true, side: THREE.FrontSide,
  });
  const shopQuad = new THREE.PlaneGeometry(1, 1);
  const shopMesh = pool('shopMesh', shopQuad, shopIntMat, { cast: false, recv: false });
  // Brightness is measured, not guessed. Over the left third of the facade band —
  // the near street wall, 42% of the band's pixels — our frame ran mean luma 34.6
  // with 52% of pixels under 32, against 52.9-69.7 / 35.8-42.0% for the three
  // street-level references. A Sobel gradient is proportional to local luminance,
  // so at half the reference brightness no amount of extra geometry can reach the
  // reference edge density: the near zone needs high-albedo SURFACES in it. These
  // interiors are the largest such surface available, so they are pitched to land
  // around 150-200 luma — bright against a ~35 luma shaded facade, still short of
  // the 245 where the midday tonemap starts to roll off.
  const SHOP_TINT = [
    0xe8d8b4, 0x8fdcea, 0x96e4bc, 0xe8c078, 0xdda6c4, 0xc6d8f2,
    0xcee88a, 0xe8a06e, 0x6fcfca, 0xe89a8e, 0xece0cc, 0xaecae8,
  ];
  /** Bright interior + a warm ceiling-light line for one shop bay. */
  function shopBay(sink, rng, x, z, ry, along, half, o, wid) {
    const { shopMesh } = sink;
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const px = x + nx * (half + 0.04) - nz * o;
    const pz = z + nz * (half + 0.04) + nx * o;
    push(shopMesh, px, 2.82, pz, ry, 0, wid, 3.10, 1,
      tintVary(rngPick(rng, SHOP_TINT), rngRange(rng, 0.84, 1.14)));
  }

  /**
   * Ground-floor storefront band: recessed shop glazing behind a projecting
   * fascia beam, pilasters between the bays and a kick plinth on the pavement.
   * This is the layer the reference has and we had nothing of.
   */
  function storefrontBand(sink, rng, x, z, w, d, style, faces) {
    const { capMesh, gridMesh } = sink;
    // Podium trim is deliberately NOT the shaft's STYLE_TRIM. At street level the
    // shaft trims (0x8e979f for glass, 0x9a6a56 for brick) sat within a few percent
    // of the dark glazing behind them, so the pilaster/transom/canopy relief that
    // already existed produced almost no measurable gradient in the near frame. All
    // three references frame their shopfronts in pale stone or white-painted metal
    // against dark glass — that value STEP is what makes the relief legible in
    // shade, and it costs nothing but a different instance colour.
    const trim = tintVary(rngPick(rng, PODIUM_TRIM), rngRange(rng, 0.88, 1.10));
    for (const ry of faces) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const wide = Math.abs(nx) > 0.5;
      const along = wide ? d : w;
      const half = wide ? w / 2 : d / 2;
      // Projecting canopy under the sign band — 1.2 m deep, so under a high sun it
      // drops a hard band right across the top of the glazing and the whole soffit
      // underneath goes into occlusion.
      push(gridMesh, x + nx * (half + 0.60), 6.16, z + nz * (half + 0.60), ry, 0,
        along + 0.5, 0.50, 1.20, trim);
      push(capMesh, x + nx * (half + 0.72), 7.92, z + nz * (half + 0.72), ry, 0,
        along + 1.2, 0.36, 1.44);
      // transom beam: the horizontal that splits the shopfront glass, and the one
      // step that stops a 5 m tall pane reading as a single flat sheet
      push(gridMesh, x + nx * (half + 0.20), 4.55, z + nz * (half + 0.20), ry, 0,
        along, 0.30, 0.40, trim);
      // pilasters between shop bays, running to the pavement
      const n = Math.max(2, Math.round(along / 5.2));
      const bstep = along / n;
      for (let i = 0; i <= n; i++) {
        const o = -along / 2 + bstep * i;
        push(gridMesh, x + nx * (half + 0.40) - nz * o, 3.05,
          z + nz * (half + 0.40) + nx * o, ry, 0, 0.92, 5.80, 0.80, trim);
        // the lit interior for the bay this pilaster opens
        if (i < n) shopBay(sink, rng, x, z, ry, along, half, o + bstep / 2, bstep - 1.10);
      }
      // kick plinth + the AO-catching lip where the wall meets the slab
      push(capMesh, x + nx * (half + 0.31), 0.62, z + nz * (half + 0.31), ry, 0,
        along, 1.00, 0.62);
      push(capMesh, x + nx * (half + 0.39), 1.16, z + nz * (half + 0.39), ry, 0,
        along, 0.14, 0.78);
    }
  }

  /** Projecting cornice slab + a hollow parapet wall ring with a pale coping lip. */
  function parapet(x, y, z, w, d, h, over) {
    push(capMesh, x, y + 0.30, z, 0, 0, w + over * 2.6, 0.60, d + over * 2.6);
    const W = w + over, D = d + over, T = 0.55, yc = y + 0.60 + h / 2;
    const walls = [
      [x, z - D / 2 + T / 2, W, T], [x, z + D / 2 - T / 2, W, T],
      [x - W / 2 + T / 2, z, T, D - T * 2], [x + W / 2 - T / 2, z, T, D - T * 2],
    ];
    for (const [wx, wz, sw, sd] of walls) {
      push(capMesh, wx, yc, wz, 0, 0, sw, h, sd);
      push(capMesh, wx, y + 0.60 + h + 0.09, wz, 0, 0, sw + 0.42, 0.20, sd + 0.42);
    }
  }

  /** Rooftop mechanical kitbash: bulkhead, chillers, tank, masts, aviation beacons. */
  function rooftop(sink, rng, x, y, z, w, d, tall) {
    const { beaconMesh, capMesh, mastMesh, mechMesh, strutMesh, tankMesh } = sink;
    const bw = clamp(w * 0.30, 2.2, 7) * rngRange(rng, 0.7, 1.15);
    const bd = clamp(d * 0.30, 2.2, 7) * rngRange(rng, 0.7, 1.15);
    const bh = rngRange(rng, 2.6, 4.6);
    push(mechMesh, x + rngRange(rng, -w * 0.22, w * 0.22), y + bh / 2,
      z + rngRange(rng, -d * 0.22, d * 0.22), 0, 0, bw, bh, bd);
    const n = rngInt(rng, 2, 5);
    for (let i = 0; i < n; i++) {
      const mw = rngRange(rng, 1.4, clamp(w * 0.24, 1.8, 6));
      const md = rngRange(rng, 1.4, clamp(d * 0.24, 1.8, 6));
      const mh = rngRange(rng, 0.8, 2.6);
      const mx = x + rngRange(rng, -w * 0.36, w * 0.36);
      const mz = z + rngRange(rng, -d * 0.36, d * 0.36);
      push(mechMesh, mx, y + mh / 2, mz, rngRange(rng, -0.35, 0.35), 0, mw, mh, md);
      push(capMesh, mx, y + mh + 0.09, mz, 0, 0, mw * 0.9, 0.18, md * 0.9);
    }
    if (rng() < 0.45) {                              // water tank on a leg frame
      const r = rngRange(rng, 1.1, 2.1), th = rngRange(rng, 2.2, 3.8);
      const tx = x + rngRange(rng, -w * 0.30, w * 0.30), tz = z + rngRange(rng, -d * 0.30, d * 0.30);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        push(strutMesh, tx + sx * r * 0.62, y + 1.1, tz + sz * r * 0.62, 0, 0, 0.17, 2.2, 0.17);
      }
      push(tankMesh, tx, y + 2.2 + th / 2, tz, 0, 0, r * 2, th, r * 2);
      push(capMesh, tx, y + 2.2 + th + 0.22, tz, 0, 0, r * 1.6, 0.44, r * 1.6);
    }
    const masts = tall ? rngInt(rng, 1, 3) : (rng() < 0.45 ? 1 : 0);
    for (let i = 0; i < masts; i++) {
      const mh = rngRange(rng, 4, tall ? 18 : 8);
      const mx = x + rngRange(rng, -w * 0.40, w * 0.40), mz = z + rngRange(rng, -d * 0.40, d * 0.40);
      push(mastMesh, mx, y + mh / 2, mz, 0, 0, 0.22, mh, 0.22);
      for (let k = 0; k < 3; k++) {                 // cross arms + guys
        push(strutMesh, mx, y + mh * (0.45 + k * 0.18), mz, rngRange(rng, 0, 3), 0,
          rngRange(rng, 0.7, 1.6), 0.09, 0.09);
      }
      push(beaconMesh, mx, y + mh + 0.32, mz, 0, 0, 0.44, 0.44, 0.44);
    }
  }

  /** Ledge bands, wall AC units and fire escapes hung off a shaft's outer faces. */
  const FACES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  function facadeDetail(sink, rng, x, z, w, d, y0, y1, style, rich) {
    const { acMesh, capMesh, strutMesh } = sink;
    // Full-perimeter cornice every few floors, 78 cm proud with a thin drip lip
    // under it. This is the one horizontal step big enough to throw a shadow that
    // survives aerial perspective, so it is what gives the mass its floor bands.
    for (let y = y0 + TILE_H; y < y1 - 3.5; y += TILE_H * (rng() < 0.5 ? 1 : 2)) {
      push(capMesh, x, y + 0.18, z, 0, 0, w + 1.56, 0.50, d + 1.56);
      push(capMesh, x, y - 0.22, z, 0, 0, w + 1.02, 0.30, d + 1.02);
    }
    if (!rich) return;
    for (const ry of FACES) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const half = Math.abs(nx) > 0.5 ? w / 2 : d / 2;
      const along = Math.abs(nx) > 0.5 ? d : w;
      const n = rngInt(rng, 2, 6);
      for (let i = 0; i < n; i++) {
        const o = rngRange(rng, -along * 0.42, along * 0.42);
        const ay = rngRange(rng, y0 + 2.5, Math.min(y1 - 2, y0 + 36));
        push(acMesh, x + nx * (half + 0.36) - nz * o, ay, z + nz * (half + 0.36) + nx * o,
          ry, 0, 1.0, 0.72, 0.75);
      }
    }
    if ((style === 'brick' || style === 'office') && rng() < 0.55) {
      const ry = rngPick(rng, FACES);
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const half = Math.abs(nx) > 0.5 ? w / 2 : d / 2;
      const along = Math.abs(nx) > 0.5 ? d : w;
      const o = rngRange(rng, -along * 0.3, along * 0.3);
      const px = x + nx * (half + 0.9) - nz * o, pz = z + nz * (half + 0.9) + nx * o;
      const top = Math.min(y1 - 2, y0 + 26);
      for (let y = y0 + 4.2; y < top; y += 3.6) {
        push(strutMesh, px, y, pz, ry, 0, 3.1, 0.11, 1.8);                       // platform
        push(strutMesh, px + nx * 0.85, y + 0.52, pz + nz * 0.85, ry, 0, 3.1, 0.08, 0.08);
        for (const s of [-1.45, 1.45]) {
          push(strutMesh, px + nx * 0.85 - nz * s, y + 0.28, pz + nz * 0.85 + nx * s,
            ry, 0, 0.08, 0.62, 0.08);
        }
        push(strutMesh, px + nx * 0.45 - nz * 1.05, y - 1.75, pz + nz * 0.45 + nx * 1.05,
          ry, 0.82, 3.4, 0.10, 1.05);                                            // stair flight
      }
    }
  }

  const downtown = (b) => Math.hypot(b.cx, b.cz) < 260;
  const towers = [];      // {x,z,w,d,h} tall masses — rooftop billboards / neon
  const frontages = [];   // {x,y,z,ry,along,h} street-facing walls — cantilevered signage

  /**
   * Force a frontage's recorded `ry` to be the OUTWARD wall normal.
   *
   * Every sign panel is a PlaneGeometry whose front face (the side the albedo
   * reads forwards from) points along +Z of its own frame, i.e. along
   * (sin ry, cos ry) after the yaw in push(). If a frontage ever records the
   * inward normal, every panel hung off it faces into the building and the only
   * thing the street sees is the back of the plane — which is the texture
   * mirrored, i.e. backwards shop names. Rather than trust the generators to
   * emit outward faces by construction, dot the candidate normal against the
   * (building centre -> wall centre) vector and flip by PI when it disagrees.
   */
  function canonFrontage(f, bcx, bcz) {
    const nx = Math.sin(f.ry), nz = Math.cos(f.ry);
    if (nx * (f.x - bcx) + nz * (f.z - bcz) < 0) {
      f.ry += Math.PI;
      // keep it in (-PI, PI] so downstream `ry ± PI/2` stays well conditioned
      if (f.ry > Math.PI) f.ry -= 2 * Math.PI;
    }
    return f;
  }

  for (const b of blocks) {
    const innerB = downtown(b);
    const n = rngInt(R, 3, innerB ? 4 : 3);
    const cols = 2, rows = 2;
    const cells = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) cells.push([i, j]);
    for (let k = cells.length - 1; k > 0; k--) {
      const m = Math.floor(R() * (k + 1)); [cells[k], cells[m]] = [cells[m], cells[k]];
    }
    for (let k = 0; k < Math.min(n, cells.length); k++) {
      const [ci, cj] = cells[k];
      const cw = b.bw / cols, cd = b.bd / rows;
      const px = b.cx - b.bw / 2 + cw * (ci + 0.5) + rngRange(R, -3, 3);
      const pz = b.cz - b.bd / 2 + cd * (cj + 0.5) + rngRange(R, -3, 3);
      const w = cw * rngRange(R, 0.66, 0.94);
      const d = cd * rngRange(R, 0.66, 0.94);
      const base = innerB ? rngRange(R, 40, 138) : rngRange(R, 13, 46);
      const h = base * (R() < 0.14 ? 1.65 : 1.0);
      const style = innerB ? rngPick(R, ['glass', 'office', 'glass', 'concrete'])
        : rngPick(R, ['brick', 'office', 'concrete']);

      // storefront podium with its own heavy cornice
      const tm = towerMesh[style];
      // Painted masses. A glass curtain wall stays near-neutral (the texture's own
      // blue-grey IS its colour); masonry and rendered concrete take real paint.
      const shaftPaint = facadePaint(sink, R, PAINT_CHANCE[style] ?? 0.35);
      push(podiumMesh, px, PODIUM_H / 2 + 0.2, pz, 0, 0, w + 1.5, PODIUM_H, d + 1.5,
        facadePaint(sink, R, 0.55));
      push(capMesh, px, PODIUM_H + 0.55, pz, 0, 0, w + 3.0, 0.75, d + 3.0);
      push(capMesh, px, PODIUM_H + 1.05, pz, 0, 0, w + 2.0, 0.35, d + 2.0);
      storefrontBand(sink, R, px, pz, w + 1.5, d + 1.5, style, FACES);

      // ---- stepped massing: 1-3 shafts, each setting back from the one below ----
      const steps = h > 70 ? rngInt(R, 2, 3) : (h > 34 ? rngInt(R, 1, 2) : 1);
      let sy = PODIUM_H, sw = w, sd = d;
      for (let st = 0; st < steps; st++) {
        const last = st === steps - 1;
        const frac = last ? 1 : rngRange(R, 0.42, 0.66);
        const top = sy + (h - sy) * frac;
        push(tm, px, sy + (top - sy) / 2 + 0.2, pz, 0, 0, sw, top - sy, sd, shaftPaint);
        facadeDetail(sink, R, px, pz, sw, sd, sy, top, style, innerB && st === 0);
        facadeGrid(sink, R, px, pz, sw, sd, sy, top, style, FACES);
        parapet(px, top + 0.2, pz, sw, sd, last ? rngRange(R, 1.2, 2.4) : rngRange(R, 0.9, 1.5),
          last ? 1.2 : 0.9);
        if (last) {
          rooftop(sink, R, px, top + 0.2, pz, sw, sd, h > 60);
        } else if (R() < 0.7) {
          // the setback terrace carries its own plant so the shoulder is never bare
          push(plantMesh, px + rngRange(R, -sw * 0.3, sw * 0.3), top + 1.4,
            pz + rngRange(R, -sd * 0.3, sd * 0.3), 0, 0,
            rngRange(R, 1.6, 4), rngRange(R, 1.4, 2.6), rngRange(R, 1.6, 4));
        }
        // record the outer walls as sign frontages before we shrink
        if (st === 0) {
          for (const ry of FACES) {
            const nx = Math.sin(ry), nz = Math.cos(ry);
            const half = Math.abs(nx) > 0.5 ? sw / 2 : sd / 2;
            frontages.push(canonFrontage({
              x: px + nx * half, z: pz + nz * half,
              ry, along: Math.abs(nx) > 0.5 ? sd : sw, h: top, big: true,
            }, px, pz));
          }
        }
        sy = top;
        sw *= rngRange(R, 0.62, 0.84);
        sd *= rngRange(R, 0.62, 0.84);
      }
      towers.push({ x: px, z: pz, w, d, h, style });
      // AO skirt where the building meets the pavement. The tower box is axis
      // aligned, so w and d are already the pad's own half-extents: the old
      // Math.max() drew a circle CIRCUMSCRIBING the plan and pushed the skirt
      // out into the road on the short axis. Measured over the whole scene the
      // 610 building skirts carried 94.8% of all alpha-weighted pad area
      // (834,580 of 880,139 m2) against 1.9% for the 2667 parked cars, so this
      // is where the pads actually cover the frame.
      shadowAt(px, pz, 0.24, w * 0.78, 0.85, 0, d * 0.78);
    }
  }

  // ---- perimeter street wall ------------------------------------------------
  // Low-rise infill hugging every block edge so the canyon is a continuous,
  // stepped, greebled wall instead of isolated prisms behind an empty apron.
  for (const b of blocks) {
    const innerB = downtown(b);
    for (const ry of FACES) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const alongX = Math.abs(nx) < 0.5;
      const len = alongX ? b.bw : b.bd;
      const ex = b.cx + nx * b.bw / 2, ez = b.cz + nz * b.bd / 2;
      const tx = -nz, tz = nx;
      let t = -len / 2 + rngRange(R, 1, 6);
      while (t < len / 2 - 12) {
        const seg = Math.min(rngRange(R, 20, 40), len / 2 - t);
        if (seg < 12) break;
        const dep = rngRange(R, 13, 22);
        const h = innerB ? rngRange(R, 13, 36) : rngRange(R, 10, 22);
        const cx = ex + tx * (t + seg / 2) - nx * (dep / 2 - 0.6);
        const cz = ez + tz * (t + seg / 2) - nz * (dep / 2 - 0.6);
        const ww = alongX ? seg - 1.2 : dep;
        const dd = alongX ? dep : seg - 1.2;
        const style = innerB ? rngPick(R, ['office', 'concrete', 'brick', 'glass'])
          : rngPick(R, ['brick', 'brick', 'office', 'concrete']);
        push(podiumMesh, cx, PODIUM_H / 2 + 0.2, cz, 0, 0, ww + 0.8, PODIUM_H, dd + 0.8,
          facadePaint(sink, R, 0.58));
        push(capMesh, cx, PODIUM_H + 0.5, cz, 0, 0, ww + 2.4, 0.7, dd + 2.4);
        // The street wall is the closest architecture to the lens in every downtown
        // frame, so it carries the higher paint chance of the two mass generators.
        push(towerMesh[style], cx, PODIUM_H + (h - PODIUM_H) / 2 + 0.2, cz,
          0, 0, ww, h - PODIUM_H, dd, facadePaint(sink, R, (PAINT_CHANCE[style] ?? 0.35) * 1.25));
        facadeDetail(sink, R, cx, cz, ww, dd, PODIUM_H, h, style, true);
        // street wall: only the outward face and the two returns are ever seen,
        // so the fine kit is skipped on the buried inner face.
        const outFaces = [ry, ry + Math.PI / 2, ry - Math.PI / 2];
        facadeGrid(sink, R, cx, cz, ww, dd, PODIUM_H, h, style, outFaces);
        storefrontBand(sink, R, cx, cz, ww + 0.8, dd + 0.8, style, outFaces);
        parapet(cx, h + 0.2, cz, ww, dd, rngRange(R, 1.0, 2.2), 1.1);
        rooftop(sink, R, cx, h + 0.2, cz, ww, dd, false);
        frontages.push(canonFrontage({
          x: ex + tx * (t + seg / 2) + nx * 0.6, z: ez + tz * (t + seg / 2) + nz * 0.6,
          ry, along: seg, h, big: false,
        }, cx, cz));
        // same isotropic bug as the tower skirt, and worse here: a street-wall
        // segment is `seg` long by `dep` deep, so a circle of radius
        // max(seg,dep)*0.62 threw the skirt most of the way across the road.
        shadowAt(cx, cz, 0.24, ww * 0.62, 0.75, 0, dd * 0.62);
        t += seg + rngRange(R, 1.5, 9);
      }
    }
  }

  // ---- signage: cantilevered billboards, blades, awnings, gantries ----------
  // Signs are real albedo-textured panels on real bracket geometry that projects
  // out over the pavement and the traffic lanes — that overhang is what breaks
  // the street canyon's edges in the reference frames.
  const SIGN_KINDS = [0, 1, 2, 3, 0, 1, 2, 3, 0, 3, 4, 4];
  const GREEN0 = 10;                              // index of the first green-panel variant
  const SIGN_VARIANTS = SIGN_KINDS.length;
  // Headroom: every double-sided sign (blade, gantry, rooftop) is now two real
  // FrontSide panels instead of one DoubleSide one, and push() silently DROPS
  // instances past the cap — a too-tight cap would read as "signs vanished".
  const SIGN_CAP = 1000;
  const signMeshes = [], signMats = [];
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  for (let v = 0; v < SIGN_VARIANTS; v++) {
    const t = makeSign(R, SIGN_KINDS[v]);
    const m = new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissiveMap,
      // 0.12 -> 0.30. INDEX.md's read of `daytime-downtown-02` is the spec here:
      // "billboards and neon are lit but not yet emissive-dominant (it is still
      // day), so they read as painted surfaces with slight glow". Ours were being
      // treated as pure diffuse, which means every sign on the shaded side of the
      // canyon fell to the same ~35 luma as the wall behind it and stopped
      // contributing any edge at all. 0.30 keeps the albedo texture fully visible
      // (the panels do not blow out) while lifting a shaded sign clear of its wall.
      emissive: 0xffffff, emissiveIntensity: 0.30,
      // FrontSide, NOT DoubleSide. A sign texture only reads correctly from the
      // face its UVs were authored for; DoubleSide happily draws the reverse
      // face, which is the artwork mirrored — backwards shop names. Anything
      // genuinely visible from both sides (blade signs, gantry panels) now gets
      // a real second panel turned to face the other way, so both sides read
      // forwards. A panel that ends up mis-oriented now vanishes instead of
      // lying, which is the safe failure.
      roughness: 0.62, metalness: 0.04, side: THREE.FrontSide,
    });
    // a cantilevered billboard that throws nothing onto the wall it hangs off is the
    // single loudest "decal, not object" tell; DoubleSide panels need shadowSide set
    // explicitly or three culls the face the sun actually sees
    m.shadowSide = THREE.DoubleSide;
    patchAtmo(m, atmo, 0.02);
    signMats.push(m);
    // receives as well as casts: a billboard's own bracket arms and floodlight
    // goosenecks are the nearest casters to it, and their shadows on the panel are
    // what sell the panel as an object hung off a wall rather than a texture on it
    signMeshes.push(pool(`sign_${v}`, planeGeo, m, { cast: true, recv: true }));
  }
  sink.signMeshes = signMeshes;
  // 5000 was SILENTLY TRUNCATING at exactly cap: push() drops on overflow, so
  // 1229 of the 6229 frames/wall plates/blade boxes this build asks for were
  // never drawn and whole runs of shopfront came up with an unbordered panel.
  // Measured want is 6229; 9000 leaves headroom for a denser frontage pass.
  const signFrame = pool('signFrame', boxGeo, darkMat, { recv: false });
  const signStrut = pool('signStrut', new THREE.CylinderGeometry(0.09, 0.09, 1, 6), poleMat, { recv: false });
  // pre-tilted brace: a bar that runs outward *and* upward, for sign arm ties
  const braceGeo = new THREE.BoxGeometry(0.14, 0.14, 1);
  braceGeo.rotateX(-0.60);
  // awning and sign-arm tie braces: these are the diagonals whose shadows land on
  // the fascia and the shopfront glass directly behind them
  const braceMesh = pool('braceMesh', braceGeo, poleMat, { cast: true, recv: false });

  /**
   * Two panels back to back, each drawn FrontSide, so a sign that is legible
   * from both approaches (blade signs projecting into the street, overhead
   * gantry boards traffic passes under in either direction) reads FORWARDS from
   * either side instead of showing one mirrored face. This is also how the real
   * thing is built: two printed faces on one box, not one translucent sheet.
   * @param vBack  variant for the reverse face; -1 picks a fresh random one
   * @param sep    half-separation of the two faces. This MUST clear the half
   *   depth of whatever signFrame box is pushed at the same centre, or the
   *   frame - which is a solid box, not a border - swallows both printed faces
   *   and the sign renders as a blank dark slab. The blade signs below were
   *   doing exactly that and only read at all because signFrame was capped at
   *   5000 and silently dropping their frames.
   */
  function panelPair(sink, rng, v, x, y, z, ry, w, h, vBack = -1, sep = 0.025) {
    const { signMeshes } = sink;
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const vb = vBack >= 0 ? vBack : rngInt(rng, 0, GREEN0 - 1);
    push(signMeshes[v], x + nx * sep, y, z + nz * sep, ry, 0, w, h, 1);
    push(signMeshes[vb], x - nx * sep, y, z - nz * sep, ry + Math.PI, 0, w, h, 1);
  }

  /**
   * @param reach  how far the panel cantilevers out from (x,z) along the wall normal
   * @param hang   drop rods from a gantry beam above
   * @param both   also print the reverse face (see panelPair)
   */
  function placeSign(sink, rng, x, y, z, ry, w, h, {
    frame = true, struts = 0, reach = 0, variant = -1, flood = false, both = false,
  } = {}) {
    const { braceMesh, signFrame, signMeshes, signStrut, strutMesh } = sink;
    const v = variant >= 0 ? variant : rngInt(rng, 0, GREEN0 - 1);
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const sx = x + nx * reach, sz = z + nz * reach;
    if (both) panelPair(sink, rng, v, sx + nx * 0.14, y, sz + nz * 0.14, ry, w, h, variant);
    else push(signMeshes[v], sx + nx * 0.14, y, sz + nz * 0.14, ry, 0, w, h, 1);
    if (frame) push(signFrame, sx, y, sz, ry, 0, w + 0.5, h + 0.5, 0.26);
    if (reach > 0.5) {
      for (const t of [-w * 0.34, w * 0.34]) {
        push(strutMesh, x + nx * reach / 2 - nz * t, y + h * 0.40, z + nz * reach / 2 + nx * t,
          ry, 0, 0.17, 0.17, reach);
        push(braceMesh, x + nx * reach * 0.5 - nz * t, y + h * 0.40 - reach * 0.30,
          z + nz * reach * 0.5 + nx * t, ry, 0, 1, 1, reach * 1.15);
      }
      push(signFrame, x, y + h * 0.15, z, ry, 0, 0.8, h * 0.85, 0.45);  // wall plate
    }
    for (let i = 0; i < struts; i++) {
      const t = struts === 1 ? 0 : (i / (struts - 1) - 0.5) * w * 0.7;
      push(signStrut, sx + nx * 0.4 - nz * t, y - h / 2 - 1.4, sz + nz * 0.4 + nx * t,
        0, 0, 1, 2.8, 1);
    }
    if (flood) {   // gooseneck floodlight hoods over the top edge
      for (const t of [-w * 0.26, w * 0.26]) {
        push(strutMesh, sx + nx * 0.9 - nz * t, y + h / 2 + 0.55, sz + nz * 0.9 + nx * t,
          ry, 0, 0.12, 0.12, 1.8);
        push(strutMesh, sx + nx * 1.7 - nz * t, y + h / 2 + 0.35, sz + nz * 1.7 + nx * t,
          ry, 0, 0.5, 0.28, 0.4);
      }
    }
  }

  // ---- awnings over the pavement ----
  const awnTex = makeAwningTex(R);
  const awnMat = patchAtmo(new THREE.MeshStandardMaterial({
    map: awnTex, roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide,
  }), atmo, 0.0);
  const awnGeo = new THREE.BoxGeometry(1, 0.09, 1);
  awnGeo.rotateX(-0.34);
  // awnings receive too: the projecting fascia beam above them drops a band across
  // the canvas, which is what stops the stripes reading as a flat decal
  // 9000 was hard-capped and the loop below wanted more, so awnings simply
  // stopped appearing partway through the city build - the whole point of an
  // awning is that it is the most saturated thing at eye level, and the blocks
  // that missed out were bare fascia.
  const awnMesh = pool('awnMesh', awnGeo, awnMat, { cast: true, recv: true });
  // The awning texture is a white canvas with 40%-black stripes, so the instance
  // colour IS the awning's colour and it gets multiplied down by the stripe. The old
  // palette was mid-value trade colours that, once striped and dropped into canyon
  // shade, landed within a few luma of the wall. These are the same hues opened up
  // 25-40% in value so the stripe pattern survives being shaded, which is what makes
  // an awning read as fabric rather than as a dark wedge.
  const awnCols = [0xe0503f, 0x2f9c5e, 0x2f6fc4, 0xefc032, 0xa54bbf, 0xef7a2a,
    0x3fa8b4, 0xefe4d2, 0xd44a76];

  function awning(sink, rng, x, y, z, ry, w, depth) {
    const { awnMesh, braceMesh } = sink;
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const col = rngPick(rng, awnCols);
    push(awnMesh, x + nx * depth * 0.5, y, z + nz * depth * 0.5, ry, 0, w, 1, depth, col);
    // Valance: the vertical fabric skirt hanging off the leading edge. It is the
    // awning's own front silhouette — without it the canvas is a single sloped plane
    // whose bottom edge dies straight into the shop glazing behind it.
    push(awnMesh, x + nx * (depth * 0.98) - 0.0, y - depth * 0.17 - 0.16,
      z + nz * (depth * 0.98), ry, 0, w, 1, 0.34, col);
    for (const t of [-w * 0.42, w * 0.42]) {
      push(braceMesh, x + nx * depth * 0.42 - nz * t, y - depth * 0.24,
        z + nz * depth * 0.42 + nx * t, ry, 0, 1, 1, depth * 0.95);
    }
  }

  // ---- what hangs off each street frontage ----
  for (const f of frontages) {
    const nx = Math.sin(f.ry), nz = Math.cos(f.ry);
    // cantilevered fascia billboard on bracket arms
    if (R() < (f.big ? 0.5 : 0.7)) {
      const w = Math.min(f.along * 0.72, rngRange(R, 5, 14));
      placeSign(sink, R, f.x, rngRange(R, 9.2, Math.max(10, Math.min(f.h - 2, 17))), f.z, f.ry,
        w, w * rngRange(R, 0.34, 0.58),
        { reach: rngRange(R, 2.0, 4.6), flood: R() < 0.5 });
    }
    // blade sign: panel turned 90 deg to the wall so it reads down the street
    if (R() < 0.86) {
      const bh = rngRange(R, 5, Math.min(15, Math.max(6, f.h * 0.55)));
      const bw = bh * rngRange(R, 0.28, 0.42);
      const out = 1.4 + bw / 2;
      const ox = f.x + nx * out, oz = f.z + nz * out;
      const by = rngRange(R, 8.5, Math.max(9.5, Math.min(f.h - bh * 0.5, 20)));
      // a blade sign hangs perpendicular to the wall, so the camera sees it from
      // whichever side it drives up on — it MUST be printed both ways round
      // sep 0.17 clears the 0.3-deep frame box below (half depth 0.15)
      panelPair(sink, R, rngInt(R, 0, GREEN0 - 1), ox, by, oz, f.ry + Math.PI / 2, bw, bh, -1, 0.17);
      push(signFrame, ox, by, oz, f.ry + Math.PI / 2, 0, bw + 0.4, bh + 0.4, 0.3);
      push(strutMesh, f.x + nx * out * 0.5, by + bh * 0.42, f.z + nz * out * 0.5,
        f.ry, 0, 0.16, 0.16, out);
      push(braceMesh, f.x + nx * out * 0.5, by + bh * 0.42 - out * 0.3,
        f.z + nz * out * 0.5, f.ry, 0, 1, 1, out * 1.15);
    }
    // LOW blade signs, 3.9-7.4 m — the shop-scale hanging signs. The tall blade
    // above lives at 8.5-20 m, which in a chase-cam frame is already above the
    // facade measurement band's busiest rows; every reference puts a second, much
    // smaller tier of perpendicular signs right over the pavement at first-floor
    // height, and that tier is the one the camera actually passes through.
    {
      const lows = rngInt(R, 1, 3);
      for (let i = 0; i < lows; i++) {
        const lh = rngRange(R, 1.5, 3.0);
        const lw = lh * rngRange(R, 0.52, 1.05);
        const out = 1.5 + lw / 2;
        const o = rngRange(R, -f.along * 0.40, f.along * 0.40);
        const bx = f.x - nz * o, bz = f.z + nx * o;
        const ly = rngRange(R, 3.9, 7.4);
        // sep 0.12 clears the 0.20-deep frame box below (half depth 0.10)
        panelPair(sink, R, rngInt(R, 0, GREEN0 - 1), bx + nx * out, ly, bz + nz * out,
          f.ry + Math.PI / 2, lw, lh, -1, 0.12);
        push(signFrame, bx + nx * out, ly, bz + nz * out, f.ry + Math.PI / 2, 0,
          lw + 0.22, lh + 0.22, 0.20);
        // bracket arm off the wall plus its diagonal tie — the pair of thin
        // casters that put a sign's own shadow on the wall it hangs from
        push(strutMesh, bx + nx * out * 0.5, ly + lh * 0.44, bz + nz * out * 0.5,
          f.ry, 0, 0.13, 0.13, out);
        push(braceMesh, bx + nx * out * 0.5, ly + lh * 0.44 - out * 0.30,
          bz + nz * out * 0.5, f.ry, 0, 1, 1, out * 1.15);
        push(signFrame, bx + nx * 0.10, ly + lh * 0.44, bz + nz * 0.10, f.ry, 0,
          0.34, 0.34, 0.22);
      }
    }
    // storefront awnings right over the pavement — one per shop bay, tucked
    // under the projecting fascia beam so they shade the glazing behind them
    const bays = Math.max(1, Math.round(f.along / 6.4));
    for (let i = 0; i < bays; i++) {
      if (R() > 0.90) continue;
      const bwid = f.along / bays;
      const o = -f.along / 2 + bwid * (i + 0.5);
      awning(sink, R, f.x - Math.cos(f.ry) * o, rngRange(R, 5.0, 5.7),
        f.z + Math.sin(f.ry) * o, f.ry, bwid * 0.82, rngRange(R, 2.1, 3.1));
    }
    // vertical banner strip up the pier between windows
    if (f.big && R() < 0.3) {
      const bh2 = rngRange(R, 10, 22);
      placeSign(sink, R, f.x, rngRange(R, 16, Math.max(18, f.h * 0.55)), f.z, f.ry,
        bh2 * 0.30, bh2, { reach: rngRange(R, 0.8, 1.8), frame: false });
    }
  }

  // rooftop billboards on the tall masses
  for (const t of towers) {
    if (t.h > 22 && R() < 0.62) {
      const ry = rngPick(R, FACES);
      const w = Math.min(Math.max(t.w, t.d) * 0.95, rngRange(R, 10, 22));
      // freestanding on the roof: legible from the streets on both sides of it
      placeSign(sink, R, t.x, t.h + 3.2 + w * 0.16, t.z, ry, w, w * 0.32,
        { struts: 3, flood: true, both: true });
    }
  }

  // ---- gantries: signage cantilevered right over the traffic lanes ----------
  const gantryMesh = pool('gantryMesh', boxGeo, poleMat, { recv: false });
  function gantry(sink, rng, cx, cz, ux, uz, faceRy, span, y, panels) {
    const { gantryMesh, mastMesh } = sink;
    const beamRy = Math.atan2(ux, uz);
    for (const s of [-1, 1]) {
      const px = cx + ux * span / 2 * s, pz = cz + uz * span / 2 * s;
      push(mastMesh, px, 0.2 + y / 2, pz, 0, 0, 0.5, y, 0.5);
      push(gantryMesh, px, 0.28, pz, 0, 0, 1.5, 0.5, 1.5);   // base plate
      shadowAt(px, pz, 0.24, 2.0, 0.9);
    }
    push(gantryMesh, cx, y + 0.2, cz, beamRy, 0, 0.36, 0.36, span);
    push(gantryMesh, cx, y - 1.0 + 0.2, cz, beamRy, 0, 0.32, 0.32, span);
    const lat = Math.max(6, Math.round(span / 2.6));
    for (let i = 0; i <= lat; i++) {
      const t = (i / lat - 0.5) * span;
      push(gantryMesh, cx + ux * t, y - 0.3 + 0.2, cz + uz * t, beamRy, 0, 0.15, 1.2, 0.15);
    }
    for (let i = 0; i < panels; i++) {
      const t = (i - (panels - 1) / 2) * 7.4;
      // traffic passes under a gantry in both directions, so print both faces
      placeSign(sink, rng, cx + ux * t, y - 2.6, cz + uz * t, faceRy, 6.4, 3.6,
        { variant: GREEN0 + (i % 2), both: true });
      for (const s of [-2.6, 2.6]) {
        push(gantryMesh, cx + ux * (t + s), y - 0.9, cz + uz * (t + s), beamRy, 0, 0.12, 1.5, 0.12);
      }
    }
  }
  for (const z of G) {
    for (const x of G) {
      // masts land on the pavement (|offset| = 13 m) either side of a 20 m road
      if (R() < 0.5) gantry(sink, R, x - 32, z, 0, 1, -Math.PI / 2, 26, 9.6, rngInt(R, 2, 3));
      if (R() < 0.5) gantry(sink, R, x, z - 32, 1, 0, Math.PI, 26, 9.6, rngInt(R, 2, 3));
    }
  }
  // highway: sign gantries plus a roadside billboard row on tall posts
  for (let x = -900; x <= 900; x += 240) {
    gantry(sink, R, x, HZ, 0, 1, -Math.PI / 2, LAYOUT.highwayW + 16, 10.4, 3);
  }
  for (let x = -1000; x <= 1000; x += 105) {
    const s = ((x / 105) | 0) % 2 ? 1 : -1;
    const bz = HZ + s * (LAYOUT.highwayW / 2 + 13);
    const w = rngRange(R, 13, 19), bh = w * 0.36;
    const by = rngRange(R, 9, 13);
    placeSign(sink, R, x, by, bz, s > 0 ? Math.PI : 0, w, bh, { flood: true });
    for (const t of [-w * 0.3, w * 0.3]) {
      push(mastMesh, x + t, 0.2 + (by - bh / 2) / 2, bz, 0, 0, 0.42, by - bh / 2, 0.42);
    }
    shadowAt(x, bz, 0.02, 3.0, 0.7);
  }

  // ---- neon: tubes, bulb strings, spill ------------------------------------
  const neons = [];
  const neonColors = [0xff2d6f, 0x24d1ff, 0xffd23f, 0x7cff5a, 0xb14cff, 0xff6b1a, 0xff3b1f, 0x33ffd0];
  const tubeMat = new THREE.MeshBasicMaterial({ toneMapped: true });
  const tubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const tubeMesh = pool('tubeMesh', tubeGeo, tubeMat, { cast: false, recv: false });
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: true });
  const bulbMesh = pool('bulbMesh', new THREE.SphereGeometry(0.5, 6, 5), bulbMat, { cast: false, recv: false });

  const spillTex = makeContactTex();
  const spillMat = new THREE.MeshBasicMaterial({
    map: spillTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: true, opacity: 0.0,
  });
  const spillMesh = pool('spillMesh', planeGeo, spillMat, { cast: false, recv: false });
  spillMesh.renderOrder = 3;

  /** rectangular neon outline + a couple of inner bars, all on one wall plane */
  function neonSign(sink, rng, x, y, z, ry, w, h, col) {
    const { spillMesh, tubeMesh } = sink;
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const T = 0.20;
    const ox = x + nx * 0.28, oz = z + nz * 0.28;
    // outline
    push(tubeMesh, ox, y + h / 2, oz, ry, 0, w, T, T, col);
    push(tubeMesh, ox, y - h / 2, oz, ry, 0, w, T, T, col);
    push(tubeMesh, ox - nz * (w / 2), y, oz + nx * (w / 2), ry, 0, T, h, T, col);
    push(tubeMesh, ox + nz * (w / 2), y, oz - nx * (w / 2), ry, 0, T, h, T, col);
    // interior "lettering" bars
    const bars = rngInt(rng, 2, 4);
    for (let i = 0; i < bars; i++) {
      const by = y - h / 2 + h * ((i + 1) / (bars + 1));
      const bw = w * rngRange(rng, 0.34, 0.82);
      // SECOND, UNDECLARED RNG STREAM. This one draw comes from the stream main.js injects
      // (makeRng(0xC17E)), not from the world's own R, and it always has. It is preserved
      // verbatim here so that converting the emitters to take their stream as an argument is a
      // provable no-op; switching it to the emitter's `rng` moves one draw between two streams
      // and reshuffles every neon bar's offset, so it is a deliberate change with its own
      // measurement, not a refactor. See verdicts/wave-t/generate-mesh-s1.md.
      const bo = (injectedRng() - 0.5) * (w - bw) * 0.8;
      push(tubeMesh, ox - nz * bo, by, oz + nx * bo, ry, 0, bw, T * 0.8, T * 0.8, col);
    }
    // coloured spill onto the wall behind
    push(spillMesh, x + nx * 0.16, y, z + nz * 0.16, ry, 0, w * 3.2, h * 3.6, 1, col);
    neons.push({ x, y, z, color: col, w, h });
  }

  for (const t of towers) {
    if (R() > 0.62) continue;
    const ry = rngPick(R, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const half = Math.abs(nx) > 0.5 ? t.w / 2 : t.d / 2;
    const along = Math.abs(nx) > 0.5 ? t.d : t.w;
    const w = Math.min(along * 0.6, rngRange(R, 4, 10));
    const h = w * rngRange(R, 0.3, 0.7);
    neonSign(sink, R, t.x + nx * (half + 0.6), rngRange(R, 4.2, 6.6), t.z + nz * (half + 0.6), ry, w, h,
      rngPick(R, neonColors));
    // bulb string along the podium cornice
    if (R() < 0.7) {
      const cnt = Math.max(6, Math.floor(along * 0.42));
      for (let i = 0; i < cnt; i++) {
        const o = (i / (cnt - 1) - 0.5) * along * 0.92;
        push(bulbMesh,
          t.x + nx * (half + 1.5) - nz * o, PODIUM_H + 1.15, t.z + nz * (half + 1.5) + nx * o,
          0, 0, 0.34, 0.34, 0.34, 0xffc24a);
      }
    }
  }

  // ---- street lights (instanced) -------------------------------------------
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: true });
  const lampPositions = [];
  const lamps = new THREE.Group();
  group.add(lamps);
  // KNOCKABLE POLES. Every free-standing pole (street lamp, traffic light) is recorded here
  // with its baked instance indices; polefall.js hides the baked pole on contact and animates
  // a dynamic falling copy. The hero's car is deliberately unaffected by these.
  const poles = [];
  const hidePoles = (used) => () => {
    dummy.rotation.order = 'XYZ';
    dummy.position.set(0, -1000, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1e-6, 1e-6, 1e-6);
    dummy.updateMatrix();
    dummy.rotation.order = 'YZX';
    for (const [m, i] of used) {
      const t = resolve(m, i);
      if (!t) continue;
      t[0].setMatrixAt(t[1], dummy.matrix);
      t[0].instanceMatrix.needsUpdate = true;
    }
  };

  const slPole = pool('slPole', new THREE.CylinderGeometry(0.11, 0.17, 1, 8), poleMat, { recv: false });
  const slArm = pool('slArm', boxGeo, poleMat, { recv: false });
  const slHead = pool('slHead', boxGeo, darkMat, { recv: false });
  const slBulb = pool('slBulb', planeGeo, lampMat, { cast: false, recv: false });
  lamps.add(slPole, slArm, slHead, slBulb);

  function streetLight(sink, x, z, rotY) {
    const { slArm, slBulb, slHead, slPole } = sink;
    // Record this lamp's instances so hide() can take the baked pole out of the draw when
    // the hero knocks it down (lampfall.js swaps in a dynamic falling copy).
    const used = [];
    const rec = (m) => used.push([m, m.count]);
    rec(slPole);
    push(slPole, x, 0.2 + 4.3, z, rotY, 0, 1, 8.6, 1);
    const ax = Math.cos(rotY), az = -Math.sin(rotY);
    rec(slArm);
    push(slArm, x + ax * 1.2, 8.7, z + az * 1.2, rotY, 0, 2.4, 0.16, 0.16);
    rec(slHead);
    push(slHead, x + ax * 2.3, 8.56, z + az * 2.3, rotY, 0, 1.15, 0.24, 0.55);
    dummy.position.set(x + ax * 2.3, 8.42, z + az * 2.3);
    dummy.rotation.set(-Math.PI / 2, rotY, 0);
    dummy.scale.set(0.98, 0.46, 1);
    dummy.updateMatrix();
    used.push([slBulb, slBulb.count]);
    pushMat(slBulb, dummy.matrix);
    dummy.rotation.order = 'YZX';
    lampPositions.push(new THREE.Vector3(x + ax * 2.3, 8.2, z + az * 2.3));
    shadowAt(x, z, 0.24, 1.5, 0.9);
    // ponytail: the night light wash (lampPositions) keeps shining from a felled lamp's old
    // spot — a fallen pole that still lights the street. Fix if it ever reads wrong at night.
    poles.push({ x, z, rotY, kind: 'lamp', hit: false, hide: hidePoles(used) });
  }
  // dummy.rotation.set with an X component needs the default order; restore after
  dummy.rotation.order = 'XYZ';
  for (const z of G) {
    for (let x = -EX + 30; x <= EX; x += 62) {
      streetLight(sink, x, z + HALF + 2.4, Math.PI);
      streetLight(sink, x + 31, z - HALF - 2.4, 0);
    }
  }
  for (let x = -600; x <= 600; x += 70) {
    streetLight(sink, x, HZ + LAYOUT.highwayW / 2 + 4, Math.PI);
    streetLight(sink, x + 35, HZ - LAYOUT.highwayW / 2 - 4, 0);
  }
  dummy.rotation.order = 'YZX';

  // ---- traffic lights ------------------------------------------------------
  const tlPole = pool('tlPole', new THREE.CylinderGeometry(0.13, 0.18, 1, 8), poleMat, { recv: false });
  const tlArm = pool('tlArm', boxGeo, poleMat, { recv: false });
  const tlHead = pool('tlHead', boxGeo, darkMat, { recv: false });
  const lensMat = new THREE.MeshBasicMaterial({ toneMapped: true });
  const tlLens = pool('tlLens', new THREE.SphereGeometry(0.5, 8, 6), lensMat, { cast: false, recv: false });
  const signalLights = [];

  function trafficLight(sink, x, z, ry) {
    const { tlArm, tlHead, tlLens, tlPole } = sink;
    const used = [];
    const rec = (m) => used.push([m, m.count]);
    rec(tlPole);
    push(tlPole, x, 0.2 + 3.4, z, ry, 0, 1, 6.8, 1);
    const ax = Math.cos(ry), az = -Math.sin(ry);
    rec(tlArm);
    push(tlArm, x + ax * 2.6, 6.75, z + az * 2.6, ry, 0, 5.4, 0.18, 0.18);
    const hx = x + ax * 4.9, hz = z + az * 4.9;
    rec(tlHead);
    push(tlHead, hx, 6.05, hz, ry, 0, 0.52, 1.5, 0.44);
    const cols = [0xd82a1e, 0xe8a41c, 0x1fd05a];
    for (let i = 0; i < 3; i++) {
      const ly = 6.55 - i * 0.5;
      rec(tlLens);
      push(tlLens, hx - Math.sin(ry) * 0.26, ly, hz - Math.cos(ry) * 0.26, 0, 0, 0.30, 0.30, 0.30, cols[i]);
    }
    signalLights.push(new THREE.Vector3(hx, 6.05, hz));
    shadowAt(x, z, 0.24, 1.8, 0.9);
    poles.push({ x, z, rotY: ry, kind: 'signal', hit: false, hide: hidePoles(used) });
  }
  for (const x of G) {
    for (const z of G) {
      trafficLight(sink, x - HALF - 2.6, z + HALF + 2.6, -Math.PI / 2);
      trafficLight(sink, x + HALF + 2.6, z - HALF - 2.6, Math.PI / 2);
    }
  }

  // ---- overhead wires: DELETED, T2, 2026-08-06 ------------------------------
  // They were strung from grid maths that had nothing to do with where the lamps
  // actually stand, so they attached to no pole at either end: lamps sit at
  // `HALF + 2.4` with pole tops at y 8.8, the wires ran at `HALF + 3.0` and y
  // 8.6/8.9/9.4 — 0.6 m to the side of the pole line, and the tallest run 0.6 m
  // ABOVE the poles it was nominally strung between. The along-road runs also
  // overshot the pole loop by 62 m and 93 m, leaving cut ends hanging over empty
  // ground; that is what the user saw in `wet-night-asphalt` against open sky.
  //
  // Repairing them (draw from `lampPositions`, stop at the last pole) was offered
  // and the user chose deletion. If they ever come back, strand them off the
  // recorded lamp positions and not off the grid, or they will drift apart again.
  // The cost of losing them is the thin wire shadows that `reference/INDEX.md`
  // lists for `daytime-downtown-01`; nothing else referenced them.

  // ---- street props on the sidewalk perimeter -------------------------------
  const hydMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0xc2352a, roughness: 0.55, metalness: 0.2,
  }), atmo, 0.06);
  // Caps sized for the tightened 2.5-5.5 m kerb pitch (see the walk loop below):
  // that is ~1.9x the prop count of the old 4.6-10.5 m pitch, so every cap that
  // was within 2x of its old occupancy has been raised. push() silently drops
  // over-cap instances, which would read as a street that thins out at random.
  const binGeo = new THREE.CylinderGeometry(0.36, 0.30, 1, 10);
  const binMesh = pool('binMesh', binGeo, darkMat);
  const boxMesh = pool('boxMesh', boxGeo, paintedMat);
  const hydBody = pool('hydBody', new THREE.CylinderGeometry(0.17, 0.21, 1, 8), hydMat);
  const hydCap = pool('hydCap', new THREE.SphereGeometry(0.5, 8, 6), hydMat);
  const planterMesh = pool('planterMesh', boxGeo, concMat);
  const shrubMesh = pool('shrubMesh', new THREE.SphereGeometry(0.5, 7, 6), leafMat);
  const benchSeat = pool('benchSeat', boxGeo, darkMat);
  const benchLeg = pool('benchLeg', boxGeo, darkMat);
  const bollardMesh = pool('bollardMesh', new THREE.CylinderGeometry(0.11, 0.13, 1, 8), poleMat);
  const meterMesh = pool('meterMesh', new THREE.CylinderGeometry(0.07, 0.07, 1, 6), poleMat);

  // palms
  const palmTrunk = pool('palmTrunk', new THREE.CylinderGeometry(0.19, 0.30, 1, 8), new THREE.MeshStandardMaterial({
    color: 0x7d6a4e, roughness: 0.95, metalness: 0,
  }));
  patchAtmo(palmTrunk._mat, atmo, 0.0);
  const frondTex = makeFrondTex(R);
  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTex, alphaMap: frondTex, transparent: true, alphaTest: 0.35,
    side: THREE.DoubleSide, roughness: 0.8, metalness: 0, color: 0xa8d47a,
  });
  patchAtmo(frondMat, atmo, 0.0);
  const frondGeo = new THREE.PlaneGeometry(1, 0.44);
  frondGeo.rotateX(-Math.PI / 2);
  frondGeo.translate(0.5, 0, 0);
  const frondMesh = pool('frondMesh', frondGeo, frondMat, { cast: true, recv: false });

  function palm(sink, rng, x, z, y) {
    const { frondMesh, palmTrunk } = sink;
    const h = rngRange(rng, 7.5, 12.5);
    const tilt = rngRange(rng, -0.10, 0.10);
    push(palmTrunk, x, y + h / 2, z, rngRange(rng, 0, 6.28), tilt, 1, h, 1);
    const cx = x + Math.sin(tilt) * h * 0.5;
    const n = rngInt(rng, 7, 9);
    const a0 = rngRange(rng, 0, 6.28);
    for (let i = 0; i < n; i++) {
      const ang = a0 + (i / n) * Math.PI * 2 + rngRange(rng, -0.14, 0.14);
      const pitch = rngRange(rng, 0.30, 0.95);
      const len = rngRange(rng, 2.9, 4.3);
      push(frondMesh, cx, y + h - 0.25, z, ang, -pitch, len, 1, len * 0.78);
    }
    shadowAt(cx, z, y + 0.02, 2.6, 0.75);
  }

  function bench(sink, x, z, ry) {
    const { benchLeg, benchSeat } = sink;
    push(benchSeat, x, 0.68, z, ry, 0, 1.9, 0.11, 0.55);
    push(benchSeat, x - Math.cos(ry) * 0.24, 1.02, z + Math.sin(ry) * 0.24, ry, 0, 1.9, 0.5, 0.09);
    for (const s of [-0.7, 0.7]) {
      push(benchLeg, x - Math.cos(ry + Math.PI / 2) * s, 0.4, z + Math.sin(ry + Math.PI / 2) * s,
        ry, 0, 0.10, 0.62, 0.5);
    }
    shadowAt(x, z, 0.24, 1.5, 0.8);
  }

  /** walk each block's perimeter dropping street furniture */
  for (const b of blocks) {
    // sit the furniture on the open pavement: the kerb is at b.w/2 and the
    // building line is walkW further in, so 1.4-5.4 m in from the kerb keeps
    // every prop clear of both the wall and the traffic lane.
    const inset = rngRange(R, 1.4, 3.0);
    const edges = [
      { x0: b.cx - b.w / 2 + inset, z0: b.cz + b.d / 2 - inset, x1: b.cx + b.w / 2 - inset, z1: b.cz + b.d / 2 - inset, ry: 0 },
      { x0: b.cx - b.w / 2 + inset, z0: b.cz - b.d / 2 + inset, x1: b.cx + b.w / 2 - inset, z1: b.cz - b.d / 2 + inset, ry: Math.PI },
      { x0: b.cx + b.w / 2 - inset, z0: b.cz - b.d / 2 + inset, x1: b.cx + b.w / 2 - inset, z1: b.cz + b.d / 2 - inset, ry: Math.PI / 2 },
      { x0: b.cx - b.w / 2 + inset, z0: b.cz - b.d / 2 + inset, x1: b.cx - b.w / 2 + inset, z1: b.cz + b.d / 2 - inset, ry: -Math.PI / 2 },
    ];
    for (const e of edges) {
      const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
      const ux = (e.x1 - e.x0) / len, uz = (e.z1 - e.z0) / len;
      let t = rngRange(R, 2, 8);
      while (t < len - 2) {
        const j = rngRange(R, 0, 3.1);   // scatter across the pavement depth
        const x = e.x0 + ux * t - Math.sin(e.ry) * j;
        const z = e.z0 + uz * t - Math.cos(e.ry) * j;
        const k = R();
        const ry = e.ry + rngRange(R, -0.12, 0.12);
        // Palm share drops 0.14 -> 0.075 because the pitch below halved: at the
        // old share a 2.5-5.5 m pitch puts a palm every ~28 m of kerb, which is
        // a boulevard planting scheme, not a downtown one, and nine alpha-tested
        // fronds is by far the most expensive prop in the set.
        if (k < 0.075) {
          palm(sink, R, x, z, 0.24);
        } else if (k < 0.32) {
          push(binMesh, x, 0.24 + 0.5, z, ry, 0, 1, 1.0, 1);
          shadowAt(x, z, 0.25, 0.95, 0.95);
        } else if (k < 0.42) {
          push(boxMesh, x, 0.24 + 0.68, z, ry, 0, 0.72, 1.36, 0.52,
            rngPick(R, [0x2c6ea8, 0xa83c2c, 0x3b7a45, 0x5a5f68]));
          shadowAt(x, z, 0.25, 0.85, 0.95);
        } else if (k < 0.50) {
          push(hydBody, x, 0.24 + 0.42, z, ry, 0, 1, 0.84, 1);
          push(hydCap, x, 0.24 + 0.90, z, ry, 0, 0.40, 0.34, 0.40);
          shadowAt(x, z, 0.25, 0.7, 1.0);
        } else if (k < 0.62) {
          push(planterMesh, x, 0.24 + 0.42, z, ry, 0, 1.5, 0.84, 1.5);
          push(shrubMesh, x, 0.24 + 1.15, z, ry, 0, 1.5, 1.1, 1.5, 0x527f34);
          shadowAt(x, z, 0.25, 1.5, 0.9);
        } else if (k < 0.72) {
          bench(sink, x, z, ry);
        } else if (k < 0.86) {
          push(bollardMesh, x, 0.24 + 0.44, z, ry, 0, 1, 0.88, 1);
          shadowAt(x, z, 0.25, 0.5, 0.9);
        } else {
          push(meterMesh, x, 0.24 + 0.62, z, ry, 0, 1, 1.25, 1);
          push(boxMesh, x, 0.24 + 1.34, z, ry, 0, 0.20, 0.36, 0.14, 0x8b8f96);
          shadowAt(x, z, 0.25, 0.45, 0.85);
        }
        // 2.5-5.5 m, not 4.6-10.5: at the old pitch the pavement read as bare
        // grey between isolated props in the 0.40-0.62 screen band. A real
        // downtown kerb is continuously occupied.
        t += rngRange(R, 2.5, 5.5);
      }
    }
  }

  // ---- pedestrian guard railing along the kerb --------------------------------
  // `daytime-downtown-03` runs a bright railing the full length of the far kerb
  // and it is the single densest thing in that reference's street-level band: a
  // ladder of 1.1 m verticals in pale metal against dark pavement is a lot of
  // high-contrast edge for very little geometry. Ours is broken into one run per
  // block edge, so the kerb keeps its gaps for parking and crossings.
  const guardPost = pool('guardPost', boxGeo, railMat, { recv: false });
  const guardRail = pool('guardRail', boxGeo, railMat, { recv: false });
  for (const b of blocks) {
    const off = 0.55;   // stand-off from the kerb face, clear of the 22 cm step
    const edges = [
      { x0: b.cx - b.w / 2, z0: b.cz + b.d / 2 - off, ux: 1, uz: 0, len: b.w, ry: 0 },
      { x0: b.cx - b.w / 2, z0: b.cz - b.d / 2 + off, ux: 1, uz: 0, len: b.w, ry: 0 },
      { x0: b.cx + b.w / 2 - off, z0: b.cz - b.d / 2, ux: 0, uz: 1, len: b.d, ry: Math.PI / 2 },
      { x0: b.cx - b.w / 2 + off, z0: b.cz - b.d / 2, ux: 0, uz: 1, len: b.d, ry: Math.PI / 2 },
    ];
    for (const e of edges) {
      const t0 = rngRange(R, 3, e.len * 0.40);
      const t1 = Math.min(e.len - 3, t0 + rngRange(R, e.len * 0.34, e.len * 0.62));
      for (let t = t0; t <= t1; t += 1.65) {
        push(guardPost, e.x0 + e.ux * t, 0.24 + 0.53, e.z0 + e.uz * t, e.ry, 0,
          0.09, 1.06, 0.09);
      }
      // two horizontals, split into ~9 m boxes so the whole run is not one
      // 130 m instance that a frustum can never reject
      for (let t = t0; t < t1; t += 9) {
        const seg = Math.min(9, t1 - t);
        for (const [y, h] of [[1.02, 0.09], [0.62, 0.06]]) {
          push(guardRail, e.x0 + e.ux * (t + seg / 2), 0.24 + y,
            e.z0 + e.uz * (t + seg / 2), e.ry, 0, seg, h, 0.05);
        }
      }
    }
  }

  // ---- parked cars ----------------------------------------------------------
  const carPaint = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.32, metalness: 0.35, envMapIntensity: 1.3,
  }), atmo, 0.30);
  const carGlass = new THREE.MeshStandardMaterial({
    color: 0x14181f, roughness: 0.12, metalness: 0.5, envMapIntensity: 1.6,
  });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.95, metalness: 0 });
  // The nearest parked car is ~8 m from the hero camera, so it is one of the
  // largest objects in the street-level band and has to hold up at that size.
  // The old two-slab form (one 4.5x0.86 box, one 2.3x0.62 black box on top) read
  // as a skip with a lid: adding 1100 of them moved the 0.40-0.62 sobel by 0.16,
  // because a flat slab is area without edges. This form carries the four
  // horizontal breaks a real car silhouette has - sill, beltline, roof cap and
  // bumper - for 9 instances a car instead of 6, and it splits into two classes
  // so a rank is not one extruded shape repeated.
  const carBody = pool('carBody', boxGeo, carPaint);       // lower body + roof cap
  const carCab = pool('carCab', boxGeo, carGlass);        // glasshouse
  const carTrim = pool('carTrim', boxGeo, darkMat);        // bumpers / valances
  const carWheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
  const carWheel = pool('carWheel', carWheelGeo, tyreMat);
  // Burnout's traffic is not a car park of greys. The old eight were all
  // desaturated and three of them sat within 6% luma of the asphalt, so a rank
  // of them added silhouette but almost no contrast; these keep the muted half
  // and add the saturated primaries the references' lanes are full of.
  const carColors = [
    0x8e1f1f, 0x1d3f7a, 0xb8b4ab, 0x2b2e33, 0x2f6042, 0xa8681c, 0x6d6f78, 0xc9c4b8,
    0xd8d2c6, 0xe8e4dc, 0xc4462c, 0x1f6fbf, 0xe0a413, 0x2f8f63, 0x8f3f8a, 0x1b2430,
  ];
  const CAR_Y = 0.03;   // city ribbon surface; the 0.34 m wheel radius sits on it

  // ---- the vehicle kit, published for traffic.js -----------------------------
  // traffic.js builds the MOVING population and it has to be made of the same parts as this
  // stationary one, for two reasons that are both about the shader rather than the shape:
  // these materials are patchAtmo()'d, so they carry the aerial-perspective airlight and the
  // canyon key:fill term every other prop in this scene carries, and they are already
  // compiled. A live traffic car on its own MeshStandardMaterial sits in FRONT of the fog at
  // 200 m and costs another program.
  //
  // It hangs off LAYOUT because LAYOUT is the only thing main.js forwards to createTraffic
  // (`layout: world.LAYOUT`), and the createTraffic signature is a contract main.js is
  // written against. It is a live reference to this world's materials, not grid data.
  const carKit = {
    boxGeo, wheelGeo: carWheelGeo, carPaint, carGlass, darkMat, tyreMat, carColors, CAR_Y,
  };
  LAYOUT.carKit = carKit;

  // Which stationary population is currently emitting. "2667 vehicles" was one number for
  // three mechanisms with three different justifications, and nobody had the split, so nobody
  // could tell which of them was the defect. Counted, not estimated; published as
  // world.parkedCounts so the split never has to be guessed at again.
  //   BEFORE this wave:  rank 1099, queue 313, lane 1255, culled 148  (= 2667 emitted)
  // `lane` was laneTraffic(), i.e. standing cars filling BOTH carriageways of every road
  // segment for no reason. It is gone; traffic.js drives that population now.
  // NPC_DENSITY scales every STATIONARY npc population by one number, on the user's explicit
  // instruction to cut the cars by 60% after driving it. One multiplier rather than three
  // scattered constants so the next request is a single edit.
  //
  // Note the tension this is resolving deliberately: the kerb-rank comment below argues that
  // thinning this population is what makes a street "read abandoned", and it was tuned against
  // the reference stills. The stills are a regression gate now, not a target, and a person who
  // has driven the city outranks a still that cannot be driven. If it does read empty, raise
  // this rather than reintroducing a second population.
  const NPC_DENSITY = 0.16;  // was 0.32; -50% parked/stationary population on user request

  let parkPop = 'rank';
  const parkCounts = { rank: 0, queue: 0, culled: 0 };

  // The stationary population's BODIES, kept on the CPU. Everything else about a parked car
  // lives only in an InstancedMesh matrix, which the GPU can draw and nothing can query - so
  // traffic.js's near-miss test, which is what makes a pass audible, could not see any of
  // them and driving past a kerb rank was silent. 436 bodies at the shipped NPC_DENSITY, so
  // consumers can scan this linearly per frame and no spatial index is warranted.
  const parkedBodies = [];

  function parkedCar(sink, rng, x, z, ry) {
    const { carBody, carCab, carTrim, carWheel } = sink;
    parkCounts[parkPop]++;
    const col = rngPick(rng, carColors);
    const fx = Math.cos(ry), fz = -Math.sin(ry);      // unit forward for this yaw
    // Every instance this car owns, so hide() below can take the baked body out of the
    // draw when traffic.js promotes it to a live (shoved/wrecked) pool car after a hit.
    const used = [];
    const rec = (m) => used.push([m, m.count]);
    const at = (m, d, y, sx, sy, sz, c) => {
      rec(m);
      push(m, x + fx * d, CAR_Y + y, z + fz * d, ry, 0, sx, sy, sz, c);
    };
    const van = rng() < 0.16;
    if (van) {
      at(carBody, 0.00, 0.86, 4.90, 1.12, 1.92, col);   // slab side, 0.30 - 1.42
      // window band the length of the body, not a windscreen on its own: a van
      // with glass only at the nose is a 4.9 m unbroken panel from every angle
      // except dead ahead, which is exactly the read the old parked cars had
      at(carCab, 0.45, 1.30, 3.50, 0.44, 1.80);
      at(carBody, -0.10, 1.47, 4.60, 0.10, 1.84, col);  // roof cap
      at(carTrim, 2.40, 0.44, 0.28, 0.28, 1.90);
      at(carTrim, -2.40, 0.44, 0.28, 0.28, 1.90);
    } else {
      at(carBody, 0.00, 0.58, 4.40, 0.56, 1.82, col);   // sill 0.30 - 0.86
      at(carCab, -0.22, 1.06, 2.45, 0.40, 1.68);        // glass 0.86 - 1.26
      at(carBody, -0.22, 1.31, 2.25, 0.10, 1.72, col);  // roof cap
      at(carTrim, 2.14, 0.42, 0.26, 0.26, 1.84);
      at(carTrim, -2.14, 0.42, 0.26, 0.26, 1.84);
    }
    for (const dx of [-1.42, 1.46]) {
      for (const dz of [-0.86, 0.86]) {
        const wx = x + fx * dx + fz * dz;
        const wz = z + fz * dx - fx * dz;
        dummy.position.set(wx, CAR_Y + 0.34, wz);
        // YZX order, so the matrix is Ry*Rz*Rx: Rz takes the cylinder's local +Y
        // axis to -X and Ry(ry + 90 deg) then swings that to the car's LATERAL
        // axis. The old (0, ry, PI/2) left the axle pointing along the car's
        // length, i.e. every wheel mounted sideways and showing only a 22 cm
        // sliver from the kerb - which is why the ranks had no visible wheels.
        dummy.rotation.set(0, ry + Math.PI / 2, Math.PI / 2);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        used.push([carWheel, carWheel.count]);
        pushMat(carWheel, dummy.matrix);
      }
    }
    // A 4.40 x 1.82 m sedan (4.90 x 1.92 van) laid down a 6.8 m ROUND pad here:
    // 36.3 m2 of shadow under 8.0 m2 of car, 4.5x the footprint, axis-aligned so
    // it ignored the car's own yaw, and with 2667 of them the ranks read as a
    // street of oil stains - with clean circular arcs sitting on open asphalt
    // wherever a pad outran the body that cast it. 2.5 x 1.0 half-extents give a
    // 5.0 x 2.0 m pad, i.e. the body plus a ~30 cm penumbra, locked to `ry`.
    shadowAt(x, z, 0.05, 2.5, 1.05, ry, 1.0);
    // Half-extents are the body boxes above, halved: 4.90 x 1.92 van, 4.40 x 1.82 otherwise.
    // `fx`/`fz` are stored rather than the yaw so a consumer does not repeat the trig, and
    // the LATERAL axis is (fz, -fx) - the same convention the wheel placement above uses.
    parkedBodies.push({
      x, z, fx, fz, van, col,
      halfLen: van ? 2.45 : 2.20,
      halfWid: van ? 0.96 : 0.91,
      // Take this car's baked instances out of the draw (traffic.js calls it when the car is
      // promoted to a live pool slot after a hit). ponytail: the baked ground shadow stays
      // where the car was parked — it reads as a stain once the body has been knocked away.
      hide() {
        dummy.position.set(0, -1000, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1e-6, 1e-6, 1e-6);
        dummy.updateMatrix();
        // The [m, i] recorded at bake time names a pool DESCRIPTOR and a push index, not a
        // mesh: the instance is written into whichever finalized cell mesh owns it. Writing to
        // the descriptor is the bug that left a phantom parked car on screen (visible, no
        // collider) while its promoted wreck slid away, so this must go through resolve().
        for (const [m, i] of used) {
          const t = resolve(m, i);
          if (!t) continue;
          t[0].setMatrixAt(t[1], dummy.matrix);
          t[0].instanceMatrix.needsUpdate = true;
        }
      },
    });
  }
  // Parking geometry, all measured off the road centreline:
  //   road surface +-HALF (10 m), paved shoulder to 11.6, kerb face at 13.
  // 10.5 puts the 1.82 m body across 9.59-11.41: entirely on paved surface, 1.6 m
  // off the kerb face, which is where a car parked at a kerb actually sits. Any
  // further out and the offside wheels hang over the unpaved 11.6-13 strip; any
  // further in (the old 8.85) and there is a 3 m band of bare tarmac between the
  // rank and the pavement that reads as an abandoned street. Wheel centres are at
  // y 0.37 with radius 0.34, so contact is exactly the y 0.03 ribbon surface.
  const PARK_OFF = HALF + 0.5;
  // The crossing road's kerb line is 13 m from its centreline; a 4.5 m car needs
  // its 2.25 m half-length clear of that, plus margin for the corner radius.
  const JCLR = 16.5;

  /**
   * Distance from the hero's city driving line. `paths.city` is
   * roundedRect(325, 325, 48) so the exact signed distance is the standard
   * rounded-box SDF with half-extents 325-48 = 277. Anything the hero drives
   * through has to be culled here: the parked rank at 8.85 m outboard of the
   * z=+-320 / x=+-320 ring roads sits 3.85 m off that line, which is a real
   * 1.9 m gap between bodies, but a queue car in the 2.5 m lane would be a
   * head-on collision.
   */
  function heroDist(x, z) {
    const qx = Math.abs(x) - 277, qz = Math.abs(z) - 277;
    return Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qz, 0))
      + Math.min(Math.max(qx, qz), 0) - 48);
  }

  function tryPark(sink, rng, x, z, ry, clear) {
    if (heroDist(x, z) < clear) { parkCounts.culled++; return; }
    parkedCar(sink, rng, x, z, ry);
  }

  /**
   * Rank both kerbs of one road segment. `(ax,az)` is the road's unit direction,
   * `(a0,a1)` the along-road span already trimmed for junctions, `side` +-1 the
   * kerb being filled. Emitted along every segment of every road, not just the
   * cross-street grid: the old loop ranked `G` only and then discarded most of
   * it against a junction test whose modulo was off by 40 m, which stripped the
   * mid-block runs and left the boulevards bare.
   */
  function rank(sink, rng, ox, oz, ax, az, a0, a1, side) {
    const nx = -az * side, nz = ax * side;      // outward normal for this kerb
    // Nose-in or nose-out is a coin flip per rank, not per car, so a kerb reads
    // as one continuous line of parking rather than alternating jumble.
    const flip = rng() < 0.5;
    for (let t = a0 + rngRange(rng, 0, 6); t < a1; t += rngRange(rng, 10, 14)) {
      // 0.30 -> 0.40: driveways, hydrants, bus stops. A kerb this solidly parked was part of
      // what made the street read as a car park even where the parking itself was legitimate,
      // and one gap in five became one in three at a cost of ~150 bodies. It cannot go much
      // further: kerb parking is the population that carries "this street is inhabited" now
      // that the carriageways are handed to traffic.js, and thinning it is what would make
      // the street read abandoned.
      // 0.60 was the surviving fraction before NPC_DENSITY; keeping it as a factor means the
      // multiplier reads as "fraction of the old population" at every site that uses it.
      if (rng() >= 0.60 * NPC_DENSITY) continue;
      const x = ox + ax * t + nx * PARK_OFF;
      const z = oz + az * t + nz * PARK_OFF;
      tryPark(sink, rng, x, z, Math.atan2(-az, ax) + (flip ? Math.PI : 0), 2.8);
    }
  }

  parkPop = 'rank';
  for (let j = 0; j < G.length; j++) {
    for (let i = 0; i < G.length - 1; i++) {
      const a0 = G[i] + JCLR, a1 = G[i + 1] - JCLR;
      // a kerb only exists where a block backs it
      if (j < G.length - 1) rank(sink, R, 0, G[j], 1, 0, a0, a1, 1);
      if (j > 0) rank(sink, R, 0, G[j], 1, 0, a0, a1, -1);
      if (j < G.length - 1) rank(sink, R, G[j], 0, 0, 1, a0, a1, -1);
      if (j > 0) rank(sink, R, G[j], 0, 0, 1, a0, a1, 1);
    }
  }

  /**
   * A stopped queue of 2-4 cars in the KERBSIDE lane on one arm of a junction.
   * `(ax,az)` is the direction of travel; with x east and z south the driver's right is
   * (-az, ax), so the offset is that far to that side.
   *
   * THE LANE MOVED, 2.6 -> 7.4, and that is the whole point of the edit rather than
   * decoration. traffic.js now runs LIVE cars in the inner lane (centre 2.5) of every city
   * road, and a baked stationary car in the same lane as a live one is a permanent immovable
   * blockage: the live car brakes correctly, stops behind it, and stays there forever. That is
   * the car park again with extra steps. There is also a read problem — a baked queue sits on
   * the stop bar whether traffic.js's signal has that arm green or red, so half of them would
   * be visibly stopped at a green light.
   *
   * At 7.4 (kerbside lane centre 7.5) the body spans 6.59-8.41, so it is 1.2 m clear of the
   * kerb parking at 10.5 and 3.2 m clear of the live inner lane. It stops reading as "waiting
   * at the signal" and starts reading as stopped/loading in the kerbside lane, which is a
   * thing streets actually do and which no longer contradicts the live signal.
   */
  function signalQueue(sink, rng, gx, gz, ax, az) {
    // Scaled by NPC_DENSITY like the ranks, with a floor of 1: a "queue" of zero cars is just
    // an absent queue, and dropping the whole mechanism was not what was asked for.
    const n = Math.max(1, Math.round(rngInt(rng, 2, 4) * NPC_DENSITY));
    const ry = Math.atan2(-az, ax);
    let d = 19.6;                               // nose on the stop bar, behind the crossing
    for (let i = 0; i < n; i++) {
      const x = gx - ax * d - az * 7.4;
      const z = gz - az * d + ax * 7.4;
      tryPark(sink, rng, x, z, ry, 4.6);
      d += rngRange(rng, 5.6, 7.4);               // bumper gap of a stopped queue
    }
  }
  const ARMS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  parkPop = 'queue';
  for (const gx of G) {
    for (const gz of G) {
      // ONE arm per junction, was one-or-two. Four would put a queue in every frame of every
      // cross street; two now also crowds the kerbside lane against the live inner lane at
      // the junction the player is most likely to be looking through.
      const k = rngInt(R, 0, 3);
      signalQueue(sink, R, gx, gz, ARMS[k][0], ARMS[k][1]);
    }
  }
  // laneTraffic() USED TO BE HERE and it was the defect. It filled BOTH carriageways of every
  // road segment, both directions, both lane centres, all the way down the canyon: 1255 cars
  // standing still in live traffic lanes for no reason. It was added because the references
  // "have vehicles all the way down the canyon" and the boulevard was bare tarmac between the
  // signal queues — which was a true observation answered by the wrong object, because the
  // vehicles in those references are MOVING and a still frame cannot tell the difference.
  // traffic.js now owns that population: 56 live cars that drive, follow, and stop at signals.
  // Do not put a standing population back into a carriageway to win a still frame.

  // ---- road surface paint + utility marks -------------------------------------
  // The lower half of the street-level band is asphalt, and asphalt is where we
  // lose the most: measured over y 0.55-0.62 the render sits at 9.9 sobel against
  // 17.9 for `daytime-downtown-03`, whose road at that band is nothing but paint
  // and utility cuts. road.js draws lane dashes and the centre pair into the tile
  // and cannot know where a junction is, so everything that depends on layout -
  // crossings, stop bars, manholes, utility patches - has to be dressed here.
  // Thin lit quads with a polygon offset, one draw call each, no z-fighting with
  // the ribbon 1.5 cm below or the contact shadows that blend on top.
  const paintMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.82, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }), atmo, 0.0);
  const patchMat = patchAtmo(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.94, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), atmo, 0.0);
  const flatGeo = new THREE.PlaneGeometry(1, 1);
  flatGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.5, 14);
  discGeo.rotateX(-Math.PI / 2);
  const paintMesh = pool('paintMesh', flatGeo, paintMat, { cast: false, recv: true });
  const patchMesh = pool('patchMesh', flatGeo, patchMat, { cast: false, recv: true });
  const holeMesh = pool('holeMesh', discGeo, patchMat, { cast: false, recv: true });
  const PAINT_Y = 0.045;

  /** one zebra crossing, laid across the full carriageway on one junction arm */
  function crossing(gx, gz, ax, az) {
    const ry = Math.atan2(-az, ax);
    const d = 14.8;                       // clear of the 13 m kerb line, before the stop bar
    const cx = gx + ax * d, cz = gz + az * d;
    for (let o = -HALF + 0.9; o <= HALF - 0.9; o += 1.26) {
      push(paintMesh, cx - az * o, PAINT_Y, cz + ax * o, ry, 0, 2.9, 1, 0.58,
        0xeeeae0);
    }
    // stop bar on the approach side, the hard edge a queue lines up on
    push(paintMesh, gx + ax * 17.4 + az * 5.0, PAINT_Y, gz + az * 17.4 - ax * 5.0,
      ry, 0, 0.42, 1, 9.4, 0xeeeae0);
  }
  for (const gx of G) {
    for (const gz of G) {
      for (const [ax, az] of ARMS) crossing(gx, gz, ax, az);
    }
  }

  /**
   * Utility cuts and manhole covers. A downtown carriageway is a patchwork of
   * differently-aged resurfacing squares; ours was one uniform tile, so the near
   * asphalt had no feature bigger than the texture's own crack network.
   */
  function roadWear(sink, rng, ox, oz, ax, az, a0, a1) {
    const { holeMesh, patchMesh } = sink;
    for (let t = a0; t < a1; t += rngRange(rng, 7, 16)) {
      const o = rngRange(rng, -HALF + 1.4, HALF - 1.4);
      const x = ox + ax * t - az * o, z = oz + az * t + ax * o;
      const k = rng();
      if (k < 0.34) {
        push(holeMesh, x, PAINT_Y - 0.006, z, 0, 0, 1.32, 1, 1.32, 0x3a3b3e);
        push(holeMesh, x, PAINT_Y, z, 0, 0, 1.04, 1, 1.04, 0x6a6259);
      } else {
        const w = rngRange(rng, 1.6, 4.6), d = rngRange(rng, 1.1, 3.0);
        const ry = Math.atan2(-az, ax) + rngRange(rng, -0.05, 0.05);
        push(patchMesh, x, PAINT_Y - 0.006, z, ry, 0, w + 0.34, 1, d + 0.34, 0x2a2b2e);
        push(patchMesh, x, PAINT_Y, z, ry, 0, w, 1, d,
          // kept within ~15% of the ribbon's own base value: a resurfacing square
          // reads as a seam and a tone shift, and any wider a spread turns into
          // a sheet of paper lying on the road
          rngPick(rng, [0x3d3f43, 0x545350, 0x47494d, 0x585652, 0x34363b]));
      }
    }
  }
  for (let j = 0; j < G.length; j++) {
    for (let i = 0; i < G.length - 1; i++) {
      const a0 = G[i] + JCLR, a1 = G[i + 1] - JCLR;
      roadWear(sink, R, 0, G[j], 1, 0, a0, a1);
      roadWear(sink, R, G[j], 0, 0, 1, a0, a1);
    }
  }

  // ---- highway guard rails + overpass concrete -------------------------------
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2400, 0.42, 0.14), railMat);
    rail.position.set(0, 0.72, HZ + s * (LAYOUT.highwayW / 2 + 2.2));
    rail.castShadow = true;
    group.add(rail);
    const rail2 = rail.clone(); rail2.position.y = 0.38; group.add(rail2);
  }
  const railPost = pool('railPost', boxGeo, poleMat, { recv: false });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 240; i++) {
      push(railPost, -1200 + i * 10, 0.45, HZ + s * (LAYOUT.highwayW / 2 + 2.2), 0, 0, 0.14, 0.9, 0.14);
    }
  }

  // jersey barrier + overpass deck running along the far side of the highway
  const barrier = pool('barrier', boxGeo, concMat, { recv: true });
  for (let i = 0; i < 240; i++) {
    push(barrier, -1200 + i * 10, 0.55, HZ - LAYOUT.highwayW / 2 - 5.0, 0, 0, 9.8, 1.1, 0.6);
  }

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1400, 1.7, 13), concMat);
  deck.position.set(0, 12.5, HZ - 62);
  deck.castShadow = true; deck.receiveShadow = true;
  group.add(deck);
  const deckEdge = new THREE.Mesh(new THREE.BoxGeometry(1400, 1.3, 0.5), concMat);
  deckEdge.position.set(0, 14.0, HZ - 62 + 6.5);
  deckEdge.castShadow = true; group.add(deckEdge);
  const deckEdge2 = deckEdge.clone(); deckEdge2.position.z = HZ - 62 - 6.5; group.add(deckEdge2);
  // PIER RADIUS. Was r 1.5 -> 1.7 over the 11.6 m height. The row stands 64 m directly
  // BEHIND the car-paint-closeup camera, in the flank's specular direction, and its 44
  // cylinders were the carrier of the vertical comb that forced car-paint to widen
  // clearcoatRoughness to mip ~4 to hide it (wave-q/car-paint.md §5, wave-q/environment.md §8).
  // The carrier is OCCLUDED SOLID ANGLE, not the 60 m pitch: jitter saturates at -17% by
  // +/-8 m and buys nothing at +/-24 m, and per-pier height/radius VARIATION is a clean null
  // (0.275 vs 0.271). Halving the radius halves the fraction of the flank's specular
  // hemisphere the row blocks, which is the quantity anisAC3 actually tracks. Do NOT delete
  // or hide the row: it is visible in dusk-highway-chase (max delta 146), crash-cam (72) and
  // daytime-downtown (68). At half radius it is invisible in daytime-downtown instead.
  const pier = pool('pier', new THREE.CylinderGeometry(0.75, 0.85, 1, 12), concMat);
  for (let i = 0; i < 44; i++) {
    push(pier, -1300 + i * 60, 5.8, HZ - 62, 0, 0, 1, 11.6, 1);
    shadowAt(-1300 + i * 60, HZ - 62, 0.02, 4.2, 0.9);
  }

  // ---- contact shadows ------------------------------------------------------
  const contactTex = makeContactTex();
  const PAD_ALPHA = 0.72;   // was contactMat.opacity; now the per-instance base
  const contactMat = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: contactTex, transparent: true,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    // instanceColor carries the per-caller opacity, not a tint: the pad is black
    // either way, so `<color_fragment>`'s rgb multiply is a no-op and the value
    // is read back out of vColor.r into the alpha below. Without this the `a`
    // argument every shadowAt() caller has been passing since the pads were
    // written went nowhere and a hydrant printed as dark as a bus.
    vertexColors: true,
  });
  contactMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n  diffuseColor.a *= vColor.r;',
    );
  };
  contactMat.customProgramCacheKey = () => 'contactAlpha';
  const contactGeo = new THREE.PlaneGeometry(1, 1);
  contactGeo.rotateX(-Math.PI / 2);
  const contactMesh = new THREE.InstancedMesh(contactGeo, contactMat, contacts.length + 8);
  contactMesh.frustumCulled = false;
  contactMesh.renderOrder = 2;
  contactMesh.name = 'contactShadows';
  contactMesh.count = 0;
  contactMesh.userData.cap = contacts.length + 8;
  group.add(contactMesh);

  /**
   * Lay the contact pads out for a given sun.
   *
   * Two things the old layout did not do. (1) It scaled `(r*2, 1, r*2)` with no
   * rotation, so every pad was an axis-aligned circle regardless of what was
   * standing on it; now the pad is an ellipse with its own half-extents, yawed
   * to `c.ry`. (2) It centred the pad on the object, which is only correct with
   * the sun in the zenith. A real contact shadow is the near end of the cast
   * shadow, so the pad slides down the anti-sun vector by roughly
   * height / tan(elevation) - the same displacement the shadow map is giving
   * the hero car and the buildings in the same frame. Height is not recorded
   * per contact, so it is estimated at 0.38x the long half-extent (1.0 m for a
   * car pad, which is about right for a body centroid) and the whole thing is
   * capped at 1.2 m so a low dusk sun cannot detach a pad from its object.
   *
   * Called once at build with a zenith sun, then again from applyKeyFill() once
   * a preset is actually chosen.
   */
  function layoutContacts(sunDir) {
    let ax = 0, az = 0, tanEl = 4;
    if (sunDir) {
      const h = Math.hypot(sunDir.x, sunDir.z);
      if (h > 1e-4 && sunDir.y > 0.02) {
        ax = -sunDir.x / h; az = -sunDir.z / h;
        tanEl = Math.max(0.45, sunDir.y / h);
      }
    }
    contactMesh.count = 0;
    for (const c of contacts) {
      // contactMesh is the ONE pool left with a literal capacity: it is rebuilt from scratch on
      // every time-of-day change, so it cannot go through the sink, and it is sized
      // `contacts.length + 8` once. If a later emitter registers pads after this allocation, the
      // extra ones would silently vanish — the exact failure mode the four capacity incidents in
      // this file were. Count it instead, and let the probe assert zero.
      if (contactMesh.count >= contactMesh.userData.cap) { dropped('contactShadows'); continue; }
      const d = Math.min(1.2, 0.38 * Math.max(c.rx, c.rz) / tanEl);
      dummy.position.set(c.x + ax * d, c.y + 0.012, c.z + az * d);
      dummy.rotation.set(0, c.ry, 0);
      dummy.scale.set(c.rx * 2, 1, c.rz * 2);
      dummy.updateMatrix();
      contactMesh.setMatrixAt(contactMesh.count, dummy.matrix);
      // material.opacity is 1 and the old flat 0.72 lives here instead, so a
      // caller asking for >1 (the parked cars, compensating for a pad that is
      // now a quarter of the area it was) stays inside a legal alpha.
      contactMesh.setColorAt(contactMesh.count, tmpC.setScalar(Math.min(1, c.a * PAD_ALPHA)));
      contactMesh.count++;
    }
    contactMesh.instanceMatrix.needsUpdate = true;
    if (contactMesh.instanceColor) contactMesh.instanceColor.needsUpdate = true;
  }
  layoutContacts(null);

  // ---- dynamic point-light pool ----------------------------------------
  // POOL IS THE NUMBER OF REAL POINT LIGHTS IN THE FRAME AT NIGHT, AND IT IS A FRAME-TIME
  // CONSTANT, NOT A DENSITY CONSTANT. See the long note in update() for the measurement: 14 lights
  // cost 15.3 ms of a 45 ms night-wet frame at 1280x720, and the pool's slots were being handed
  // out by distance alone, so lamps behind the camera held slots while lit signs in shot went
  // dark. The slots are now filled frustum-first, and the size is set from the measured
  // distribution of how many emitters are actually in shot at once, measured rather than guessed
  // (`tools/_perfr2.mjs --mode lights`, 703 frames over 30 s of night driving at five places on
  // the city path, verdicts/wave-s/perf-r2.md section 4):
  //
  //   emitters in shot   5     6     7     8     9    10    11
  //   cumulative %    1.28 15.20 53.27 88.07 98.58 99.72 100.00
  //
  // So TEN slots hold every emitter that is in shot on 99.72% of frames, and the four lights this
  // gives up were, on almost every frame, lighting something behind the camera. It is deliberately
  // NOT the smallest number that is fast: 8 would buy a further 4 ms and would drop a lit emitter
  // in shot on 12% of frames, and this wave may not make a scene look worse.
  const POOL = 10;
  const lightPool = [];
  // Scratch for the frustum gate in update(). One allocation, reused; update() runs every frame.
  const _lightFrustum = new THREE.Frustum();
  const _lightPV = new THREE.Matrix4();
  const _lightSphere = new THREE.Sphere();
  const lightStats = { frames: 0, considered: 0, inShot: 0, used: 0, maxInShot: 0, pool: POOL,
    hist: new Array(41).fill(0) };
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffc98a, 0, 46, 2);
    l.visible = false;
    scene.add(l);
    lightPool.push(l);
  }
  // emitters the pool can be assigned to: warm street lamps + coloured neon
  const emitters = [];
  for (const p of lampPositions) emitters.push({ p, color: 0xffc98a, power: 320, range: 62 });
  for (const n of neons) {
    emitters.push({
      p: new THREE.Vector3(n.x, n.y, n.z), color: n.color,
      power: 90 + n.w * n.h * 6, range: 26,
    });
  }

  // ---- wet smears (built once, shown only when wet) ---------------------
  const smears = new THREE.Group();
  smears.visible = false;
  group.add(smears);
  // Every street-lamp smear is the same colour, the same size and the same intensity, so all 288
  // of them are ONE instanced draw instead of 288 meshes with 288 cloned geometries and 288
  // materials. Additive + depthWrite:false makes that pixel-identical; see addWetSmearBatch.
  // The 69 neon smears keep their own meshes: each has its own colour and length.
  roadKit.addWetSmearBatch(smears,
    lampPositions.map((p) => ({ x: p.x, z: p.z + 5 })), 0xffc98a, 1.8, 16, 0.16);
  for (const n of neons) {
    if (n.y > 14) continue;
    roadKit.addWetSmear(smears, n.x, n.z, 0, n.color, 2.6, 20 + n.y, 0.12);
  }

  // ---- drive paths ------------------------------------------------------
  const paths = {
    city: makePath(roundedRect(325, 325, 48, 8), true),
    highway: makePath([[-1000, HZ + 6.5], [-300, HZ + 6.5], [400, HZ + 6.5], [1000, HZ + 6.5]], false),
  };

  // ---- FINALIZE: allocate every pool, cut by draw state and 200 m cell -----------------
  //
  // This used to be a RE-CUT: every pool was allocated at a guessed cap, filled, and then a pass
  // here walked the finished meshes, bucketed them by draw state, split each bucket by cell,
  // built a second set of InstancedMeshes and zeroed the originals. That pass is gone. The sink
  // never allocated the first set, so finalize() is the only allocation that happens and the
  // cells it produces are the same cells the re-cut produced.
  //
  // Why it matters: a single InstancedMesh holding 150,000 window mullions spread over the whole
  // map has a map-wide bounding sphere, so its frustum test could only ever cost a matrix
  // multiply and then say "yes". Measured before the cut existed: 203,540 instances and 2.40 M
  // triangles, of which 0.19% were within 200 m of the camera and 92% beyond 400 m, ALL
  // submitted, EVERY frame — and not once per frame but three times, because the colour pass,
  // the shadow pass and SSAO's depth/normal prepass each re-submit the whole scene.
  const buildStats = finalize();

  // ---- ONE CHUNK, FOR NOW ---------------------------------------------------------------
  // The emitters above now all write into a sink rather than into pools they close over, and
  // they take their RNG as an argument rather than reading the module's `R`. That is the whole
  // precondition for building the city cell by cell. This build still runs them ONCE, against a
  // single chunk whose bounds are the whole world and whose stream is the same global `R` in the
  // same order, which is what makes this step provably behaviour-preserving: the refactor is
  // verified before any seeding change lands.
  const resident = new Map();
  resident.set('0,0', {
    key: '0,0', cellX: 0, cellZ: 0,
    minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity,
    group, sink, stats: buildStats,
  });

  // ---- STATIC TRANSFORMS. The cut multiplies the object count in this subtree, and every one
  // of those objects would otherwise have its world matrix recomposed on every
  // renderer.render() — measured at 2.9 ms/frame BEFORE the cells existed. Nothing under
  // world.group ever moves: the city is built once at fixed coordinates, and the only things
  // that change afterwards are visibility flags, material uniforms and instance matrices, none
  // of which are object transforms. So compose the subtree's matrices once and then opt out.
  //
  // THIS IS PER CHUNK FROM HERE ON, NOT ONCE. three's updateMatrixWorld() skips recursing into a
  // child whose matrixWorldAutoUpdate is false unless it is called with force = true, so a chunk
  // Group added to this subtree AFTER boot never composes its world matrix and renders at the
  // identity transform or not at all. Anything that adds a chunk later must call
  // `rec.group.updateMatrixWorld(true)` on it. That failure presents as "the streamed chunks are
  // invisible or in the wrong place" and will be blamed on the emitter, so it is called out here.
  group.updateMatrixWorld(true);
  group.matrixWorldAutoUpdate = false;

  /**
   * What actually EXISTS in the scene graph, counted by traversing it rather than by reading a
   * running total. A counter can happily say "9 chunks built" while the scene holds 300; a
   * traversal cannot.
   */
  function chunkStats() {
    let meshes = 0, instances = 0, tris = 0;
    const geoms = new Set();
    group.traverse((o) => {
      if (!o.isInstancedMesh) return;
      meshes++;
      instances += o.count;
      geoms.add(o.geometry.uuid);
      const g = o.geometry;
      tris += o.count * (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    const rc = [...resident.values()];
    return {
      cell: CHUNK,
      residentCells: rc.length,
      residentKeys: rc.map((c) => c.key).sort(),
      drawStates: buildStats.states,
      cells: buildStats.cells,
      meshes, instances, geometries: geoms.size, tris,
      overflow: { n: dropStats.n, pools: { ...dropStats.pools } },
    };
  }

  let night = false;
  const _fogC = new THREE.Color();
  const _warm = new THREE.Color();
  const _bnc = new THREE.Color();
  const _sunD = new THREE.Vector3();

  function setTubeGain(g) {
    // MeshBasicMaterial vertexColors: scale by material.color so >1 is possible
    tubeMat.color.setScalar(g);
    bulbMat.color.setScalar(g * 0.9);
    lensMat.color.setScalar(night ? 1.5 : 0.55);
  }

  const world = {
    group, LAYOUT, paths, blocks, buildings, neons, lampPositions, lamps,
    buildingMats, roadKit, atmo, towers,
    // The STATIONARY vehicle population, split by mechanism. traffic.js owns the moving one.
    carKit, parkedCounts: parkCounts, parkedCars: parkedBodies, poles,
    /** What the spatial chunking pass did, so a harness can assert it actually ran. */
    chunkStats,
    // ---- OBJECTS THE SSAO NORMAL/DEPTH PREPASS MUST NOT SEE -------------------------------
    // Ambient occlusion is a property of SURFACES. These two are additive glow quads lying a few
    // centimetres above the tarmac with `depthWrite: false` in the real frame — the wet lamp/neon
    // smears and the night light-spill pads. Under the prepass's override material they DO write
    // depth, so a wet night road had its AO computed against a flat plane hovering over it
    // instead of against the road, and every one of those quads was a draw call in a second full
    // submission of the scene. main.js hands this list to createSsaoPass's `exclude`.
    aoExclude: [smears, spillMesh],

    /** Live point-light pool census, so a harness can size POOL from evidence. */
    lightStats() { return { ...lightStats, hist: lightStats.hist.slice(0, 21) }; },

    setNight(v) {
      night = !!v;
      for (const s of styles) buildingMats[s].emissiveIntensity = night ? 0.95 : 0.0;
      storeMat.emissiveIntensity = night ? 1.35 : 0.15;
      for (const m of signMats) m.emissiveIntensity = night ? 1.25 : 0.10;
      lampMat.color.setHex(night ? 0xffeccb : 0x6e6a60);
      lampMat.color.multiplyScalar(night ? 2.4 : 1.0);
      setTubeGain(night ? 3.2 : 0.75);
      spillMat.opacity = night ? 0.55 : 0.0;
      spillMesh.visible = night;
      contactMat.opacity = night ? 0.42 : 0.72;
      for (const l of lightPool) l.visible = night;
      groundMat.color.setHex(night ? 0x14151a : 0x25262a);
      atmo.uDay.value = night ? 0.0 : 1.0;
      atmo.uReflect.value = night ? 0.22 : 0.55;
    },
    get night() { return night; },

    /**
     * Trim the scene-wide fill to a street-canyon key:fill ratio. Call once, after
     * sky.apply() and the scene's own setup.
     *
     * sky.js authors ambientIntensity / envIntensity for an open sky, where a
     * surface really does see the whole hemisphere. Inside a canyon it does not,
     * and at midday a 4.6-intensity sun against an un-trimmed skylight put both
     * walls of the street and the whole road surface at the same mid-grey — the
     * shadows were being rendered, they were just buried under the fill.
     *
     * The architecture gets a second, tighter trim of its own in FILL_FRAG; this
     * pass exists for everything world.js does not own — the road ribbons, the
     * ground plane, the car — so that the sun's terminator crosses the tarmac
     * instead of stopping at the kerb.
     */
    applyKeyFill(sky) {
      const p = sky && sky.preset;
      if (!p) return;
      // Keep the sky module so update() can read the LIVE extinction coefficient
      // off it. Read-only: sky.js is another builder's file. See skyFogD0().
      _sky = sky;
      // a high, strong key needs the deepest cut; a raking dusk key barely any,
      // and at night the skylight is most of the lighting there is
      const k = p.night ? 0.88 : (p.sunElevation > 20 ? 0.58 : 0.76);
      sky.ambient.intensity = p.ambientIntensity * k;
      scene.environmentIntensity = p.envIntensity * k;
      // The contact pads are the only thing world.js draws that has to know
      // where the sun is: a pad centred on its object is a zenith-sun shadow,
      // and every other shadow in the frame is offset. sky.sun.position is the
      // direction TO the sun (the light targets the origin).
      // sky.sun tracks the car, so position alone is position+focus; subtract
      // the target to get the direction TO the sun.
      layoutContacts(p.night || !sky.sun ? null
        : _sunD.copy(sky.sun.position).sub(sky.sun.target.position));
    },

    setWet(v) {
      roadKit.setWet(v);
      smears.visible = v > 0.3;
      const wet = v > 0.3;
      kerbMat.color.setScalar(wet ? 0.26 : 0.55);
      walkMat.color.setScalar(wet ? 0.19 : 0.42);
      kerbMat.roughness = lerp(1.0, 0.34, v);
      walkMat.roughness = lerp(1.0, 0.30, v);
      concMat.roughness = lerp(1.0, 0.45, v);
    },

    /**
     * @param camera OPTIONAL. The camera the frame is being rendered from. Used only to frustum-
     *   cull the dynamic point-light pool (see the note where the pool is filled). Omit it and the
     *   pool falls back to the old nearest-first ranking, so no caller is required to pass it.
     */
    update(dt, focus, camera) {
      // pull the atmosphere from whatever the sky module set this frame
      const fog = scene.fog;
      if (fog) {
        _fogC.copy(fog.color);
        atmo.uHaze.value.copy(_fogC);
        atmo.uHazeD.value = Math.min(skyFogD0() * _airGain, _airDMax);
        atmo.uHazeW.value = _airW;
        atmo.uHazeS.value = _airStart;
        const warmSky = _fogC.r > _fogC.b;   // dusk vs midday vs night
        // Key-to-fill ratio. Midday is the one that matters: a 4.6-intensity sun
        // against a full-strength skylight reads as a clay render, so the fill goes
        // to ~a third and the canyon finally has a lit side and a shaded side.
        // Dusk keeps more (the key is only 2.3 and raking), night keeps nearly all
        // of it because the skylight IS the lighting.
        atmo.uFillK.value = night ? 0.95 : (warmSky ? 0.84 : 0.78);
        atmo.uFillSky.value.setRGB(...(night ? [0.60, 0.76, 1.10]
          : warmSky ? [0.66, 0.80, 1.06] : [0.60, 0.77, 1.10]));
        atmo.uFillGnd.value.setRGB(...(night ? [0.72, 0.78, 1.00]
          : warmSky ? [1.06, 0.86, 0.66] : [1.00, 0.90, 0.74]));

        if (night) {
          atmo.uShadeY.value = 0; atmo.uShadeAmt.value = 1;
          // at night the canyon floor is the *lit* end (shopfronts, lamps, neon), so the
          // vertical gradient all but inverts — keep only a token amount
          atmo.uCanyon.value.set(0.14, 14);
          _warm.setRGB(0.10, 0.13, 0.22);
          _bnc.setRGB(0.06, 0.06, 0.09);
        } else if (warmSky) {
          atmo.uShadeY.value = 46; atmo.uShadeAmt.value = 0.58;
          atmo.uCanyon.value.set(0.26, 22);
          _warm.copy(_fogC).multiplyScalar(1.35);
          _bnc.setRGB(0.055, 0.070, 0.105);
        } else {
          // uShadeAmt / uCanyon are non-directional fakes that existed to give the
          // canyon *some* tonal structure when there was no key. Now that the sun
          // actually organises the frame they are pulled back hard: keeping them at
          // the old strength on top of a trimmed fill just crushed the shaded side
          // into mud and buried the very shadow edges they were standing in for.
          atmo.uShadeY.value = 27; atmo.uShadeAmt.value = 0.80;
          atmo.uCanyon.value.set(0.16, 22);
          _warm.copy(_fogC).multiplyScalar(1.15).lerp(new THREE.Color(1.0, 0.86, 0.66), 0.25);
          _bnc.setRGB(0.052, 0.062, 0.082);
        }
        atmo.uSkyWarm.value.copy(_warm);
        atmo.uBounce.value.copy(_bnc);
      }

      if (!focus) return;
      const scored = [];
      for (let i = 0; i < emitters.length; i++) {
        const d = emitters[i].p.distanceToSquared(focus);
        if (d < 120 * 120) scored.push([d, i]);
      }
      scored.sort((a, b) => a[0] - b[0]);

      // ---- THE POOL IS FILLED FROM THE EMITTERS THAT ARE ON SCREEN, NEAREST FIRST -----------
      // Every visible light in the scene costs EVERY shaded fragment in the frame, because
      // three's forward renderer puts them all in one uniform array and every lit program loops
      // over the whole array: `NUM_POINT_LIGHTS` is a shader define, not a per-object property.
      // Measured at `night-wet`, 1280x720 ratio 1 (`tools/_perfr2.mjs --mode sweep`, three runs,
      // verdicts/wave-s/perf-r2.md section 4): 14 lights 44.97 ms, 10 lights 36.93, 6 lights
      // 32.97, 0 lights 29.72. Fifteen milliseconds of a 45 ms frame for fourteen lamps.
      //
      // The old selection was "the POOL nearest emitters within 120 m", and distance alone spends
      // slots on emitters that cannot put a photon in the frame: a street lamp 20 m BEHIND the
      // camera outranks a neon sign 60 m ahead in the shot. So the ranking is now
      // frustum-first — a light whose sphere (its own `range`, which is where its attenuation
      // reaches exactly zero) misses the view frustum is skipped, and its slot goes to the next
      // nearest emitter that is actually in shot.
      //
      // That is why POOL could come down without the frame losing light: see the note on POOL.
      // With no camera handed in, the frustum gate is inert and the old distance ranking stands.
      let front = 0;
      if (camera) {
        _lightPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _lightFrustum.setFromProjectionMatrix(_lightPV);
      }
      let slot = 0;
      for (let k = 0; k < scored.length && slot < POOL; k++) {
        const em = emitters[scored[k][1]];
        if (camera) {
          _lightSphere.center.copy(em.p);
          _lightSphere.radius = em.range;
          if (!_lightFrustum.intersectsSphere(_lightSphere)) continue;
        }
        front++;
        if (!night) continue;
        const l = lightPool[slot++];
        l.position.copy(em.p);
        l.color.setHex(em.color, THREE.SRGBColorSpace);
        l.intensity = em.power;
        l.distance = em.range;
      }
      for (let i = slot; i < POOL; i++) lightPool[i].intensity = 0;
      // `front` is how many candidates were in shot BEFORE the POOL cap, which is the number
      // that decides whether POOL is big enough. Histogrammed over a real drive rather than
      // guessed; see verdicts/wave-s/perf-r2.md section 4.
      lightStats.considered = scored.length;
      lightStats.inShot = front;
      lightStats.used = night ? slot : 0;
      lightStats.hist[Math.min(front, lightStats.hist.length - 1)]++;
      if (front > lightStats.maxInShot) lightStats.maxInShot = front;
      lightStats.frames++;
    },
  };

  world.setNight(false);
  world.setWet(0);
  return world;
}
