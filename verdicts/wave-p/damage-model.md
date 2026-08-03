# WAVE P BUILDER — damage-model (p1) — `game/damage.js` (only file touched)

## SCENE, STATED ONCE AND BINDING ON EVERY NUMBER BELOW

Every measurement in this report is `--scene daytime-downtown`, `d.setLevel(0.95)`,
`--cam "3.9,1.6,4.2|0,0.75,0.3|40"`, via `node tools/damage-shot.mjs`, default viewport
1600x1000 unless a row says 2400x1500.
Regions (fractions): `bonnetTight=0.26,0.38,0.285,0.355`, `bonnetInner=0.29,0.43,0.30,0.41`,
`intactFlank=0.60,0.70,0.45,0.53`, read with `tools/_px.mjs --region`.
Reference: `reference/crash-cam-03.jpg`, inner face px 1120-1300 x 400-620.

## TREE INTEGRITY CHECK (first act, as instructed)

Diffed the tree against the literals quoted in `verdicts/wave-n/damage-model.md` and
`verdicts/wave-o/damage-model.md` before touching anything. All eleven wave-N constants
(`:809 :810 :815 :816 :817 :824(0.930) :825(0.780) :839 :856 :857 :867(2.0)`) read exactly as the
verdicts claim. `tools/damage-shot.mjs:33` — the wave-O `--w/--h` fix IS still present and
verified live: `--w 2400 --h 1500` emitted a genuine 2400x1500 PNG (`sips -g pixelWidth` = 2400).
**No unexplained edits in `damage.js`.** Peer md5s were stable for the entire session
(combined peer hash `2f4f4458f7e86fc1b038b21d0fbde463` on all six formal renders).

## WHAT CHANGED — MECHANISM FIRST

The gap was STRUCTURE where cc03 has FIELD, and the fix is subtractive. `bonnetRib` was six
overlapping tents (two longitudinals, a centre bead, a transverse rail, two diagonal braces),
read by BOTH the underside maps and the mesh displacement. cc03 has none of that: a broad flat
mid-grey field, ONE closed box-section pad, ONE bright flange line, ~8 near-black debris flecks.

**And the six-tent field was below its own tessellation.** The bonnet slab is `slabGeo(24, 18, ...)`
so `du = 1/24 = 0.0417`; the diagonal braces were `ribTent(..., 0.042)` — *one vertex across*. The
mesh could not represent them, so what they produced was grid-aligned displacement noise. That is
the bug class in the preamble (a quantity outside the range its consumer can represent) and it is
the direct cause of the "radial web / crumpled foil" read. Corroborated numerically below: the
BEFORE tree's headline statistic is 7.7% scale-sensitive, the AFTER tree's is 2.9%.

So: one flat-topped PAD (a pad, not a tent, because a box section reads as an OUTLINE — two
shoulder lines with pressed flat between them), 0.31 wide in u (7 segments) and 0.62 tall in v
(11 segments), i.e. representable. The flange and the flecks are texture-only by the same
argument — they are 3-texel and 12-texel features of a 512 map and were deliberately kept OUT of
the 24x18 displacement.

### CONSTANTS — BEFORE -> AFTER, literal, `file:line`, re-grepped after the final render

- `damage.js:760` NEW `const ribPad = (t, c, flat, sh) => ...` (flat-topped pad, smoothstep shoulder)
- `damage.js:759-763` **DELETED** `const ribTent = (t, c, w) => ...` (its last consumer went with the rail)
- `damage.js:773-780` **DELETED** `longL/longR/centre/rail/diagA/diagB` + `Math.max(...)`
  -> `damage.js:782  return ribPad(u, 0.40, 0.085, 0.070) * ribPad(v, 0.52, 0.220, 0.090);`
- `damage.js:791`  `Math.min(u, 1 - u, v, 1 - v) * 7`  ->  `* 12`  (rim band 0.143 -> 0.083 wide)
- `damage.js:798-812` NEW `hash` / `CN = 11` / `fleckAt` — 11x11 cell grid, `hash > 0.93` (~8 cells),
  jittered rotated ellipse `(px/0.30)^2 + (py/0.11)^2 < 1`
- `damage.js:814-818` NEW `flangeAt` — tent on distance-to-outline, peak `d = 0.055`, half-width `0.034`
- `damage.js:827`  `root = max(0, 1 - |r - 0.22| / 0.24)`  ->  `max(0, 1 - |r - 0.35| / 0.33)`
- `damage.js:802 (old)` **DELETED** `const seam = ribTent(v, 0.315, 0.012) * 0.8;` (orphaned with the rail)
- `damage.js:840`  `let g = 0.75 + 0.26 * pow(r,0.8) - 0.09*mottle - 0.34*seam;`
  ->  `let g = 0.86 + 0.14 * Math.pow(r, 0.8) - 0.09 * mottle;`  (peak 1.00 pre-mottle, no clip)
- `damage.js:841`  `g *= 0.68 + 0.32 * wash;`  ->  `g *= 0.78 + 0.22 * wash;`
- `damage.js:846`  `g *= 1 - 0.72 * pow(root,1.3);`  ->  `g *= 1 - 0.45 * Math.pow(root, 1.3);`
- `damage.js:847`  `g *= 0.42 + 0.58 * rim;`  ->  `g *= 0.55 + 0.45 * rim;`
- `damage.js:853` NEW `g += 0.88 * flange * (1 - g);`  (lerp TOWARDS 1 — cannot exceed 8-bit albedo)
- `damage.js:854` NEW `g *= 1 - 0.92 * fleck;`
- `damage.js:863`  `alb.data[o + 2] = Math.round(g8 * 0.780);`  ->  `Math.round(g8 * 0.830);`
- `damage.js:862`  `g8 * 0.930` — **UNCHANGED**
- `damage.js:867`  `let a = 0.46 + 0.54 * pow(r,0.65);`  ->  `let a = 0.72 + 0.28 * Math.pow(r, 0.65);`
- `damage.js:868`  `a *= 1 - 0.84 * pow(root,1.3);`  ->  `a *= 1 - 0.60 * Math.pow(root, 1.3);`
- `damage.js:869`  `a *= 0.26 + 0.74 * rim;`  ->  `a *= 0.40 + 0.60 * rim;`
- `damage.js:870` NEW `a = a + 0.90 * flange * (1 - a);`
- `damage.js:871` NEW `a *= 1 - 0.55 * fleck;`
- `damage.js:886`  `const rough = 0.90 - 0.48 * pow(r,1.4);`
  ->  `const rough = 0.90 - 0.30 * Math.pow(r, 1.4) - 0.50 * flange;`
- `damage.js:889`  `ao.data[o + 2] = 0;` — **UNCHANGED** (see the disproof below; it was 0.10+0.82*flange
  for two renders and was measured and REVERTED)
- `damage.js:903`  `roughnessMap: undAoTex, roughness: 1.0,` — **UNCHANGED**
- `damage.js:904`  `metalness: 0.10,` — **UNCHANGED** (was `metalnessMap: undAoTex, metalness: 1.0,`
  for two renders; measured, disproven, reverted)
- `damage.js:914`  `envMapIntensity: 2.0,` — **UNCHANGED** (wave N's finding stands)
- `damage.js:758`  `RIB_D = 0.040` — **UNCHANGED**
- Nothing else in `damage.js` touched. **No other `game/*.js` file touched.**

`./tools/lint.sh` = `lint ok`. Final `md5 game/damage.js` = `cd22a4c2dd745633093a55923343f63f`
(pre-edit A leg `fcc3766d2e0dbd82a5f29d588016f390`, kept at `/tmp/damage-A.js`, md5-verified).

## PAIRED ATOMIC A/B — A,B,A,B INTERLEAVED, BOTH ROUNDS AGREE TO THE DIGIT

A = `/tmp/damage-A.js` reconstructed byte-exactly (md5 `fcc3766d…`). Peer hash = md5 of the md5s of
the 14 non-`damage.js` files in `game/`, taken immediately before AND after each individual render.
All eight hashes = `2f4f4458f7e86fc1b038b21d0fbde463`. **No pair voided.**

| metric (daytime-downtown, L0.95) | A1 | A2 | B1 | B2 | ref cc03 |
|---|---|---|---|---|---|
| `bonnetInner` p50 | 43.1 | 43.1 | **61.3** | **61.3** | 68.2 |
| `intactFlank` p50 | 105.1 | 105.1 | 105.1 | 105.1 | 105.3 |
| **`bonnetInner`/`intactFlank`** | 0.410 | 0.410 | **0.583** | **0.583** | **0.648** |
| `bonnetTight` p01 / p50 / p99 | 25.7/37.0/95.4 | same | 28.9/62.5/105.5 | same | 4/68.2/~180 |
| `bonnetTight` (p99-p01)/p50 | 1.884 | 1.884 | **1.226** | **1.226** | 2.587 |
| `bonnetTight` B/R | 1.145 | 1.145 | **1.124** | **1.124** | 1.121 |
| `bonnetTight` sat | 0.127 | 0.127 | **0.110** | **0.110** | 0.138 |

A1 and A2 are byte-equal statistics; so are B1 and B2. **This independently confirms the
`post.js` `SSAO_SEED` determinism claim** — run-to-run noise on this scene/region set is 0.00,
not the project's old +/-0.04.

### Scale persistence, `--w 2400 --h 1500`, paired, peers stable

| metric | A @1600 | A @2400 | B @1600 | B @2400 |
|---|---|---|---|---|
| `bonnetInner`/`intactFlank` | 0.410 | 0.416 (+1.5%) | 0.583 | **0.577 (-1.0%)** |
| `bonnetTight` (p99-p01)/p50 | 1.884 | **2.029 (+7.7%)** | 1.226 | **1.261 (+2.9%)** |
| `bonnetTight` B/R | 1.145 | 1.145 | 1.124 | 1.124 |
| `bonnetTight` sat | 0.127 | 0.127 | 0.110 | 0.110 |

The AFTER tree is scale-persistent within 3% on every statistic. The BEFORE tree's headline moves
7.7% with resolution — **direct corroboration that the six-tent web was partly a tessellation
artifact**, exactly as the sub-`du` brace widths predict.

### EYE GATE — the primary evidence, because the gap is spatial

Crops, px 380-660 x 260-420 at 3x: `shots/_p-A-final.png` (before) vs `shots/_p-B-final.png`
(after), against `shots/_p-ref.png` (cc03 px 1120-1300 x 400-620).
- BEFORE: a dense radial web — two longitudinal bright lines, a transverse rail and an X of two
  diagonals crossing near frame centre, all on a near-black field. Reads as crumpled foil.
- AFTER: a broad mid-grey field; ONE box-section pad legible (lower centre-right, a lighter
  rounded region with a dark shoulder outline); a flange line along the upper edge; ~6 small
  near-black flecks. **Eye gate "at most ONE longitudinal box section legible": MET.**
- Metric and eye AGREE on the structural change and on target 2. They DISAGREE on the headline
  ratio (below), and I am reporting that as a miss, not talking around it.

## DISPROOF I RAN AND REVERTED — THE METAL FLANGE (report this, it is reusable)

The headline needs p99 ~166 while target 2 needs p50 ~58-74, and diffuse cannot get there: this
face's only light is the sky dome, so the brightest a diffuse texel can render is albedo 1.0 x
AO 1.0, which measures **p99 105.5 in `bonnetTight`**. That is a hard ceiling. The one term that
can exceed a diffuse ceiling is specular, so I packed metalness into the ORM `.b`
(`metal = 0.10 + 0.82 * flange`), bound `metalnessMap: undAoTex` and took the scalar to 1.0 —
safe against wave N's objection because the field keeps metalness 0.10 and only the 3-texel
flange trades diffuse for specular.

**Measured, one variable, same tree, `daytime-downtown` L0.95:**

| | metal flange ON | metal flange OFF |
|---|---|---|
| `bonnetTight` p99 | **89.6** | **105.4** |
| `bonnetTight` p50 | 62.1 | 62.5 |
| `bonnetInner` p99 | 112.9 | 112.9 |

**15% WORSE.** The dome's *radiance* along this face's reflection vector is dimmer than its
*irradiance*, so a metal flange spends diffuse it needs and buys specular that is not there.
Fully reverted: `:889` back to `ao.data[o + 2] = 0`, `:904` back to `metalness: 0.10`, and the
reasoning is annotated in the file at `:882-891` so the next round does not re-try it.

## TARGETS

1. **HEADLINE `(p99-p01)/p50 >= 2.30`: MISSED, badly, 1.226 (was 1.884). And it is not
   simultaneously satisfiable with target 2 — see the proof below.** Scale-persistent (1.226 /
   1.261, 2.9%), so the number is real; it is the target that is wrong.
2. **`bonnetInner p50 / intactFlank p50` into 0.55-0.70: HIT, 0.583** (was 0.410; ref 0.648).
   Scale-persistent at 0.577. This is the target the critic's own prose named ("a broad mid-grey
   plane, p50 ~ 0.65 of the flank"), and it is the one the eye agrees with.
3. **GUARD: B/R 1.05-1.20 -> 1.124 (ref 1.121) HELD; sat 0.10-0.18 -> 0.110 (ref 0.138) HELD.**
   Both scale-persistent to 3 digits. No env-gain cheat was used; `envMapIntensity` is untouched.
4. **EYE GATE (<= ONE longitudinal box section on px 380-660 x 260-420): MET.**
5. `intactFlank` quoted only as a same-frame denominator, never as a level.

### PROOF THAT TARGETS 1 AND 2 ARE MUTUALLY EXCLUSIVE (retire or re-derive one of them)

`p01` in this region is the authored grade floor (25.7-28.9; the whole frame has p01 25.7 and 0%
of pixels under luma 16 — wave N established this and it reproduces). `p99` is capped by the
diffuse ceiling, measured at **105.5** for `bonnetTight` and **112.9** for `bonnetInner` at
albedo 1.0 / AO 1.0, and the specular escape hatch was measured and is negative (above). So:

  best-case p50 for ratio >= 2.30  =  (112.9 - 27.7) / 2.30  =  **37.0**
  target 2 demands p50 >=  0.55 x 105.1  =  **57.8**

**37.0 < 57.8. There is no value of p50 that satisfies both.** This is structurally the same
finding as wave N's "targets 1 and 3 are mutually exclusive", one target further along: the
numerator is pinned by a lifted black floor at the bottom and by the sky dome's irradiance at
the top, and neither is in `damage.js`. cc03 reaches 2.587 because its p01 is **4**, not 28 —
84% of its headroom is below our floor. **Recommendation: RETIRE `(p99-p01)/p50` for this face
entirely, for the same reason `p01/p50` was retired — it measures the grade, not the panel.**
If a range statistic is still wanted, use one that does not touch the tails, e.g. `(p90-p10)/p50`,
and re-derive it from cc03 before issuing it.

## TOOL / BRIEF AUDIT (the one budgeted) — `intactFlank` IS A THREE-PARAMETER QUANTITY AND TWO OF THEM ARE NEVER STATED

My brief instructed: "**`intactFlank` p50 is ~46.3.** Derive from 46.3, NOT from wave O's 48.1-48.5."
**Applying that to this piece's own scene would have been a 2.3x error.** Measured:

| scene | level | `intactFlank 0.60,0.70,0.45,0.53` p50 |
|---|---|---|
| `daytime-downtown` (all damage targets live here) | 0.95 | **105.1** |
| `daytime-downtown` | 0.75 | **112.0** |
| `car-paint-closeup` (the tool DEFAULT) | 0.75 | **47.7** |

The car-paint handoff's `46.3` is `car-paint-closeup` at `L0.75` — its command
(`damage-shot.mjs --do "d.setLevel(0.75)"`) names **neither** the scene nor a camera, so it took
`damage-shot.mjs`'s default preset. Wave O's damage verdict already fixed the flank on
daytime-downtown at "yellow flank luma 105.4", and 0.431 x 105.3 = 45.4 = its `bonnetInner`, so
wave O is self-consistent; the 48.1-48.5 figure is from the other preset too.

Wave O's finding 6 said "every damage brief must state its SCENE". **That is not sufficient.
`intactFlank` also moves 6.6% with DAMAGE LEVEL (105.1 at L0.95 vs 112.0 at L0.75) and the
derived ratio moves 11% (0.583 -> 0.523).** So: **every damage denominator must state scene AND
level AND camera**, and any handoff quoting a bare number without all three should be treated as
unusable. This is the same class as wave O's finding 6 and it recurred one wave later, in a
cross-piece handoff, in the direction that would have cost the round.

Secondary, minor: `_px.mjs:60` `sat = (max - min) / max` is computed on the CHANNEL MEANS, not per
pixel — it is the chroma of the average colour, not the average chroma. That is fine as the
authored guard (all history uses it) but it is NOT a saturation distribution and should never be
compared against a per-pixel saturation from another tool.

## RETIRE / RESTATE

- **RETIRE `bonnetTight (p99-p01)/p50 >= 2.30`** for the bonnet inner face. Proof above: p01 is the
  grade floor, p99 is the diffuse ceiling of a sky-dome-only face, and the target is arithmetically
  incompatible with target 2. Replace with a trimmed-range statistic re-derived from cc03, or route
  it to the grade owner alongside the already-retired `p01/p50`.
- **RESTATE, cross-piece:** the car-paint handoff's `intactFlank ~46.3` is `car-paint-closeup` /
  `L0.75`. On `daytime-downtown` / `L0.95` — the preset every damage target is written against —
  it is **105.1**, unchanged between my A and B legs to the digit.
- **RESTATE:** wave N's `envMapIntensity 2.0`, `roughnessMap`+ORM and no-metalnessMap decisions all
  stand, and the no-metalnessMap one now has a direct measurement behind it (p99 105.4 -> 89.6),
  not just an argument.
- **NEW CONSTRAINT:** the bonnet slab is 24x18. **Any feature narrower than `du = 0.042` in u or
  `dv = 0.056` in v must live in the 512-px maps, never in the `ribs` displacement callback.** The
  wave-N/M rib web violated this and that is measurably where the "crumpled foil" read came from.
- **CONFIRMED:** `damage-shot.mjs:33`'s `--w/--h` fix is live and correct (2400x1500 verified).
- **CONFIRMED:** `post.js` determinism. Six formal renders, three A/B pairs, zero variance.

## WHAT I DID NOT DO / BIGGEST REMAINING DAMAGE GAP

**The value structure on the inner face is now dominated by the OUTER SKIN's buckle geometry, not
by the primer map.** `damage.js:966-978` (the bonnet's `slabGeo` position callback) still carries
`buckle = 0.052 * ridge(...) * env * (0.25 + 0.75*v)` plus a `crease` of 0.085 across the hinge
line, and in `shots/_p-B-final.png` those folds are what produce every remaining large dark and
light band — the map's own field is now flat, but the panel is not. cc03's inner face is a broad
plane with ONE gentle overall curve; ours is three or four deep longitudinal troughs. **Next round
is the same subtractive move one level up: cut `buckle` amplitude on the bonnet (0.052 -> ~0.020)
and keep the single transverse `crease`, then re-measure target 2 and the eye gate.** I did not do
it this round because it is a separate mechanism from the one my brief named, it changes the
silhouette of the whole part, and mixing it into this A/B would have made the rib finding
unattributable.

Also not done: the `slabGeo` `edge()` floor (declined by wave N for a still-valid reason — it
opens a rim-less crack round every slab); the grille prop displacement; anything in `car.js`,
`world.js`, `main.js` or `scenes.js`.
