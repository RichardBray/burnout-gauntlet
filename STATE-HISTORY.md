## SESSION 12 ARCHIVE — moved out of STATE.md when it passed the ~400-line trim rule at 926 lines.

Everything below was superseded before it was moved.
The session-10 block (wave M / wave N / wave O indexes and their commentary) plus the session-11 wave-P launch narrative.
Every live constraint in it was checked against `tools/STANDING-CONSTRAINTS.md` first and is folded in there with a verdict-file citation; the round-by-round detail lives in `verdicts/wave-m/`, `verdicts/wave-n/` and `verdicts/wave-o/`.

### SESSION 11 WAVE-P LAUNCH NARRATIVE (superseded by the wave-P results tables, which stay in STATE.md)

### WAVE P BATCH 1 — LAUNCHED. Four builders: sky-lighting, boost-fx, road-surface, audio.

`verdicts/wave-p/` was EMPTY at session-11 start, so no Wave P builder had landed anything.
Batch 1 is the upstream/uncoupled set, per the batch ordering below: boost must precede crash
(it narrows the smear kernel first) and sky must precede every dusk-lit piece (it moves
`scene.environment`).

Each builder was briefed with: `tools/WAVE-P-BRIEF.md`, its own `verdicts/wave-o/<piece>.md`,
`tools/STANDING-CONSTRAINTS.md`, the session block of STATE.md, `reference/INDEX.md`, plus its
headline gap inline and the pinned measurement rules for its piece. Each writes
`verdicts/wave-p/<piece>.md` BEFORE returning.

Extra obligations issued this round beyond the Wave O briefs:
- **sky** must also fix the FALSE comment at `sky.js:1017-1021` (claims the per-preset grade is
  inert dead code; contradicts `sky.js:76`; `main.js:13/:128` does build `createOutputPass`), and
  must report any exposure/irradiance change with numbers so four pieces can re-baseline.
- **boost** carries the cross-piece crash-x-boost fix as a SECOND obligation, with the target
  stated as blob DENSITY (4.6 -> 10.1 per 1e4 px, areaMed 47 -> <=15) because both `aspMed` and
  `aspP90` are retired. It was told not to defend its Wave N P 0.57 -> 1.36 "win" — that comb is
  the thing being fixed.


## SESSION 10 — history, but every table and rule below is still LIVE. Its "exact next action" is not.

Session 10's own preamble told the reader to stop at the SESSION 8 header.
That history now lives in `STATE-HISTORY.md` and the rest of this file is all current.

### WAVE M CRITIC SWEEP — COMPLETE. Ten critics, ten briefs in `verdicts/wave-m/`.

Session 9 died after 8 of 10 wave-M critics wrote their files. Session 10 relaunched the two
missing critics (crash-cam, hud) and completed the sweep. **Wave M is closed. Do not re-run it.**

Wave M index — piece | m1 verdict | one-line gap | file to change:

| piece | verdict | biggest gap (mechanism) | file |
|---|---|---|---|
| chase-camera | **cannot tell — RETIRED, DONE** | — | — |
| sky-lighting | real wins | twilight tint is a pure hue rotation carrying no radiance; warm term shares the Rayleigh 8 km falloff so the sodium wash is 0.72x value / 0.56x height | game/sky.js:419,443,462,883 |
| road-surface | real wins | `lensH/lensC/lensG` fixed-LOD-bias band-pass is SCREEN-LOCKED: full-amplitude 3-9 px relief re-injected onto 40 m tarmac | game/road.js:872-879 |
| car-paint | real wins | flake material map is UNGATED — metalness 0.58->1.00 with no `flakeGate`, zeroing per-cell diffuse albedo | game/car.js:603-635,631-632 |
| environment | real wins | only ~44% of facade masses draw the chroma palette; `PAINT_NEUTRAL` at sat 0.06-0.09 makes the majority achromatic stone | game/world.js:1280-1301 |
| boost-fx | real wins | peak branch is a per-pixel-JITTERED sparse max — a max amplifies the jitter a mean averages away | game/boost.js:280,324-338 |
| damage-model | real wins | bonnet underside lit entirely by sky specular (`envMapIntensity 2.0`), so authored AO + 40 mm ribs never reach the image | game/damage.js:825-831,812-815 |
| audio | real wins | IGN_DEC is a floor-reaching time not a time constant: 93 dB across 0.170 s, so the top 10 dB is gone in ~18 ms — a click, not a light-up | game/audio.js:820,836 |
| crash-cam | real wins — **REGRESSED since k1** | over-unity additive spark gain `r = 2.8` still clips the authored `pow(v,2.2)` taper; boost's new `max(mean,peak)` smear then paints each clipped bar across a ~90 px kernel at full value (a max cannot roll off a value already at the ceiling). Spark-only fill 13.3% vs ref 3.17% | game/crash.js:2131 |
| hud | real wins | minimap is a VECTOR PLAN not an aerial plate — all mid-grey fills + white strokes, no values below 16, no clipped whites. Value range, not linework. (2nd: fray-eraser at `:608-612` is centred off the rails entirely, so tear ratio is inverted 1.67 vs ref 0.63-0.75) | game/hud.js:608-612 |

Nine pieces still live; chase-camera retired.

### WAVE N BUILDER WAVE — COMPLETE. All nine reports in `verdicts/wave-n/`. Tree `lint ok`.

The crash-safe write worked: all nine files landed. Keep that rule forever.

| piece | result | what actually changed |
|---|---|---|
| crash-cam | **4/4 targets PASS** | `r 2.8 -> 1.10`, streak scaled 0.267x at nine sites, nose taper finally added. Fill 8.18% -> 0.80% (budget 3.0), peak r 2.57 -> 1.009. Slabs gone. Also rewrote the lying comments. |
| hud | **8/9 targets PASS** | root cause was NOT the palette: grain pass composited a grey sheet source-over TWICE, a flat +0.113 floor. Switched to `overlay`. p01 16.3 -> 4.9, <16 1.16% -> 15.53%, tear 1.68 -> 0.73. |
| road-surface | **headline HIT** | brief named the WRONG term. Real carrier was `gBand`, whose retire `1-smoothstep(30,120,vDist)` was **exactly 1.0 over the whole visible road**. New `pxAlongM` (metres per screen px, grows as dist^2). D 1.260 -> 0.625; 1920/960 now agree to 9% (was 22%). |
| audio | **2/2 headline PASS** | `IGN_DEC` floor-reaching -> true time constant, and the same bug found in the LF thump (which supplied ~7 dB of the early energy). Overshoot 30 -> 160 ms (ref 110), peak +6.0@3ms -> +7.6@48ms (ref +8.7@39). |
| damage-model | 2 hit, 1 held | brief's mechanism DISPROVEN (metalness=0 moves p50 by one level). env stays 2.0 deliberately. Structure moved into albedo + an ORM roughnessMap. B/R 1.371 -> 1.121 vs ref's own 1.12, scale-persistent to 0.001. |
| sky-lighting | 3/6 hit | gap was worse than stated: `(sR+sM)/ext` cancels, so the horizon was a CONSTANT floor with zero vertical structure. Added the twilight arch as a directional third source through the phase functions. |
| car-paint | 1 hit, 1 miss | gate now driven by dimensionless `ccLum/irrMean`, no tuned gain. Ratio missed (1.128 vs 1.45) but scale-persistence is real: was 1.09/1.09, now 1.128/0.971. |
| boost-fx | 1/4 hit | anti-stipple HIT and clean: band-shared phase (hash the PERPENDICULAR coord) + 3-tap. P 0.57 -> 1.36 vs ref 1.37; dot screen -> continuous bands. Added a Reinhard knee so over-unity input no longer paints flat. |
| environment | 0 hit, honest | raised three achromatic tables to ref chroma; headline sat went DOWN 0.353 -> 0.339. See below — the metric is broken, not the change. |

### FIVE MEASUREMENT FINDINGS FROM WAVE N. These outrank the pixel wins.

1. **`_facademeas` band sat measures the BLUE AIRLIGHT CAST, not paint. TARGET FORMALLY RETIRED
   IN WAVE O** — the critic independently reproduced the smoke test in a copy of the tree
   (0.342 -> 0.401 with the architecture forced to magenta/green; builder got 0.353 -> 0.399).
   +0.059 against a 0.48 target. Do not re-issue it.
   Also: the old brief's "dd-01/-02 have no achromatic mass" is FALSE (cream sat 0.125, white 0.221).
   **AND the Wave N builder's own replacement proposal (canyon occlusion) is ALSO RETIRED.**
   Occlusion already exists at `world.js:815-831` and the daytime branch deliberately weakens it
   (`:2918-2919`, `uCanyon (0.16,22)` vs default `(0.46,26)`). Maxing it to `(0.90,26)` with
   `uShadeAmt 0.35` buys **+0.9 dark%** (6.9 -> 7.8). Killing airlight does the work: `#air=1`
   -> 11.3, `#air=0` -> 11.6, canyon-maxed + air=0 -> 16.8 (ref 24.3).
   **The additive airlight is a floor that occlusion cannot get under — bug-class rule 4 again.**
   Bonus disproof: `air=0` makes the frame visibly FAR more colourful (the authored cream and
   terracotta finally appear) while band sat goes DOWN 0.342 -> 0.317. Two independent proofs
   that the sat metric is inverted with respect to the eye.
2. **`_hudlick` — SUPERSEDED BY WAVE O. The builder's threshold disproof FAILED.** Wave N blamed
   the tool's threshold gap (135.1 vs 122.2). Wave O showed every image carries the same-signed
   bias and **ours is the LEAST biased of the three** (ref01 158.1/122.2, gap 36, is handicapped
   2.8x harder and still measures top-torn-harder), so the threshold cannot explain our 1.68
   inversion. **KEEP the tool. Always print `thr` beside the ratio; a smaller-than-ref threshold
   gap is conservative.** The builder's control render is still real evidence — but of an
   asymmetry in our own additive halo, not in the tool.
   The REAL bug (sixth finding): **`_hudlick.mjs:85` samples `baseBot` from 1.5-1.75 barH BELOW
   the bar — off the bottom of the frame** (y1144 of 1080) in ours AND in both refs. It returns 0
   because the sample is empty. The tool never looked at the scene below the bar at all.
3. **`tools/damage-shot.mjs:33` ignored `--w/--h` — FIXED IN WAVE O.** It now honours them; the
   default stays 1600x1000 so fractional history remains comparable. Verified at 2400x1500.
   Damage scale-persistence is now a genuine RE-RENDER, not a downscale.
   **Wave-O finding: the Wave N damage report never names its scene**, and `damage-shot.mjs`
   defaults to `car-paint-closeup` (dusk, orange-red) while every Wave N number came from
   `daytime-downtown` (midday, yellow). Same file, same cam, bonnetTight B/R reads
   **1.147 / 0.502 / 0.697** across daytime-downtown / car-paint-closeup / crash-cam. The `0.780`
   blue multiplier at `:825` is tuned to cancel exactly ONE sky. **Every damage report must name
   its scene from now on, and any colour-ratio target must say which preset it was derived under.**
4. **`aspMed` in `_debrismeas` is decoupled on spark patches** (with sparks HIDDEN it scores
   2.82; visible, 3.12 — it is measuring debris). Use `aspP90`. Bare `aniso` in boost patch 1 is
   likewise retired — the old 3.02 was stipple.
5. **The 1e-4 onset gate cannot be used on the mp3 refs** — codec noise puts ref-01's onset at
   0.0001 s and returns a bogus -28.9 dB overshoot. Use `IGN_REL=0.1` (confirmed in Wave O:
   reproduces the wave-m ref figures to the decimal).
   **And `_ignmeas.mjs --lu` DOWNMIXES TO MONO, understating the delta by ~1 LU.** `readWavMono`
   averages L+R; BS.1770 sums per-channel mean squares, and the boost is partly decorrelated so
   averaging cancels it more than the bed. Channel-split proof: 1.02-1.30 s gives L +4.85 / R
   +4.84 vs mono 3.91. **Always measure the busy guard channel-split.**
   *This RETRACTS the Wave N builder's item 3: the busy guard was passing at +3.15 all along.*
   **Sustained-overshoot definition, now PINNED — quote it exactly:** contiguous run from
   detected onset, non-overlapping 10 ms rms frames, >= +3 dB over steady (onset+1.3-1.7 s),
   400 ms cap, stop at first frame below. Hop matters as much as contiguity: ref-01 is 110 ms at
   10 ms hop but 68 ms at 1 ms hop. **Never quote "total ms above threshold".**
6. **`aspP90` inverts under boost live** — see the crash x boost section above. Valid only at
   `uAmount = 0`. Use blob density.
7. **`_hudedge` widths in %-of-frame are not comparable across images.** Normalised to barH,
   bottomRail is ours 15.8% vs ref 24.5-26.8% — a **40% shortfall**, far worse than the raw
   "1.11 vs 1.75" reads. Normalise every HUD width to barH before quoting it.

**SEVEN broken metrics found so far, three of them in tools a previous critic had endorsed.**
Budget one tool-audit per piece per round; it has outperformed pixel work every wave.

### TWO TARGETS PROVEN UNREACHABLE — do not spend another wave on them

- **damage p01/p50 <= 0.30 is mutually exclusive with guardrail 3.** Our authored lifted-black
  grade floors the panel p01 at ~25, so the target needs p50 >= 85 against a max of ~46.
  Retarget to <= 0.55 or route it to the grade owner. It is not a damage.js bug.
- **sky's 22x red ramp: RETIRED IN WAVE O, but on DIFFERENT evidence than the builder gave.**
  The builder's bound was arithmetically wrong (`sin21/sin1.5` = **13.7x, not 3.3x**). The real
  disproof, from the critic's own `scatter()` replica (matches the shipped LUT to 3 dp): msBeam
  swept 0->50 **asymptotes at 10.5x** while blowing the 21-deg row to code 179 against ref's 85.
  Replaced with row-level RGB targets from `dusk-highway-chase-01.jpg` col `x=0.66,0.74` vs ours
  `x=0.55,0.65`.
- **The Hsh=0.10 rejection was the RIGHT CALL ON WRONG EVIDENCE. Ship 0.80. Do not reinstate.**
  Recording both halves so a later wave that catches the bad numbers does not treat them as
  licence: over all 192 LUT rows NS-drift is 3.49 levels at 0.10 vs 0.94 at 0.80 — 3.7x worse but
  **converged either way**, so "zenith 65->69->73" does NOT reproduce. The "136-level hard step"
  does not reproduce at all: max adjacent-row step is **6.01 at Hsh 0.10 vs 7.81 at 0.80** — 0.10
  is the *smoother* one. **The honest ground that does stand: a 100 m gate inside a 785 m layer,
  marched at ~0.55 km minimum step, is unresolved by construction.** Use that argument, not the
  numbers.

### WAVE O CROSS-PIECE: DUSK BRIGHTNESS NEEDS RE-BASELINING BEFORE WAVE P MEASURES ANYTHING

Sky's exposure did NOT move (1.30, `skyGain` 0.55 untouched) — but `scene.environment` is PMREM'd
from the sky, and `msBeam 2.5` raised sky diffuse irradiance **1.075x, +66% on the low rows.**
**Every dusk brightness number in car-paint, damage, environment and road is stale.** Re-baseline
before quoting any of them. This compounds the known `syncFromPaint` coupling (car.js's env probe
is `partUnder`'s only light; `intactFlank` already swings 99.5-194.7).

Also `sky.js:1017-1021` carries a comment warning the per-preset grade is inert dead code. **It is
false** and contradicts `sky.js:76` in the same file — `main.js:13/:128` does build
`createOutputPass`. Rule 5: another lying comment. Correct it in Wave P.

### WAVE O CRITIC SWEEP — COMPLETE. Nine briefs in `verdicts/wave-o/`. Tree `lint ok`.

**All nine verdicts are `real wins`. Nothing retired this round.** Rule 5 came back CLEAN on all
nine — every builder's quoted constants greped to the claimed literals. The Wave L fake was a
one-off, and the before/after-literal requirement is what proved it.

| piece | o1 biggest gap (mechanism) | file |
|---|---|---|
| crash-cam | boost's smear fuses 3-4 slivers into one slab. **Not crash's to fix — boost goes first.** | game/boost.js then crash.js |
| boost-fx | the peak/speed-line branch is a GENERATOR, not a filter: hpRms 1.70 -> 14.74 fx-vs-nofx, an 8.7x HF *increase* from a blur (ref 5.26) | game/boost.js:394-395,409-412,455-470 |
| road-surface | `road.js:880 detAmt = uDetailAmt` — the whole micro-aggregate stack has NO resolvability term. Ladder PEAKS in the middle distance (21.81 at d3 vs 16.74 near); a real surface cannot | game/road.js:880 |
| environment | `AIR_GAIN = 6.0` (`world.js:888`) is distance-only, no near-field onset, calibrated only on the 85-200 m band, so a 30 m storefront takes ~25% haze. Split with a ~50-60 m haze start | game/world.js:888 |
| audio | the crack is WHITE noise through a Q=0.5 bandpass so it tilts UP where a fuel roar tilts down: **+2.4 dB ours vs -5.7 dB ref, 8.1 dB too bright**. `noisePink` already exists at `:96` and `ignite` does not use it | game/audio.js:838,842 |
| car-paint | panel is vertically CORDUROYED (`_stripemeas` ours 3.14 vs ref 0.56). `FLAKE_RGH 0.22` x 0.43 = 0.0946 is a near-mirror sampling PMREM mip 0, so each lit flake cell mirrors a vertical channel wall. One-constant fix | game/car.js:601 |
| damage-model | authors structure where ref cc03 has FIELD — ref is a broad mid-grey plane with one box section and one flange line; ours is a six-rib radial web | game/damage.js:790-842 |
| sky-lighting | the arch is not localised in elevation: `pa` evaluates on `dot(V,S_sun)`, so a 21-deg ray sits in the `ARCH_G 0.70` forward lobe (+16.4 red on that row, zenith sat crushed 0.434 -> 0.301) | game/sky.js |
| hud | minimap value range is FIXED; spatial statistics are not. Road fill authored `#f7fbf0`, measured p50 **195.5 vs ref03 89.7**, drawn as a constant-width orthogonal grid | game/hud.js |

### WAVE P BUILDERS — THREE BATCHES, ORDERED BY COUPLING. Do not run them all at once.

Wave N proved nine concurrent builders breaks paired A/B (see the concurrency rule below). The
batches below are ordered so every known coupling resolves in the right direction:

- **BATCH 1: sky, boost, road, audio.** boost MUST precede crash (it narrows the kernel first);
  sky MUST precede every dusk-lit piece (it moves `scene.environment`).
- **BATCH 2: car, environment, hud.** car MUST precede damage (`syncFromPaint` — car's env probe
  is `partUnder`'s only light).
- **BATCH 3: damage, crash.**

Run `./tools/lint.sh` + `./tools/refresh-latest.sh` between batches. Wave Q critics after all
three, never concurrent with any batch.

### SESSION 10 EXACT NEXT ACTION

1. `ls verdicts/wave-p/` — relaunch only builders whose file is missing, respecting batch order.
2. When all nine exist: lint, refresh, index them here, then launch the **WAVE Q critic sweep**
   (nine critics, zero builders). Alternate forever.
3. **Before Wave Q measures anything dusk-lit, re-baseline** — see the dusk cross-piece note.

### KNOWN TOOL DEFECT FOUND IN WAVE N — `damage-shot.mjs`

`tools/damage-shot.mjs:33` hardcodes a 1600x1000 viewport and **silently ignores `--w/--h`.**
Every absolute-pixel claim ever measured through it is void, including the ones in the Wave M
damage verdict. Fractional-region claims are still fine. Either fix the tool to honour `--w/--h`
or forbid absolute-px targets on damage. Do not let a critic quote px through this tool again.

Related: `intactFlank` read 101.6 / 194.7 / 110.9 / 121.4 / 103.7 / 99.5 across renders with
**identical** damage.js — car.js is live and its env probe is `partUnder`'s only light source via
`syncFromPaint`. Any damage brightness target must be re-derived after car-paint settles.

### CROSS-PIECE ITEM crash x boost — MEASURED AND RESOLVED IN WAVE O. It belongs to BOOST.

The Wave N crash builder guessed boost was dissolving its sparks into the haze. **Wrong.** The
Wave O crash critic measured it (live `uAmount` in crash-cam is 0.2709, four shots in one boot,
run twice, `_debrismeas --bg 15 --delta 12 --minpx 4 --maxpx 4000 --patch 0.677,0.807,0.389,0.519`):

| | boost 0 | boost LIVE | ref `--patch 0.00,0.30,0.63,0.73` |
|---|---|---|---|
| spark-only fill | 0.81/0.78% | **1.32/1.27%** | 3.17% |
| blob COUNT | 48/52 | **17/15** | 63 |
| density /1e4 px | 14.2 | **4.6** | 10.1 |
| areaMed | 16/10 | **45/49** | 6 |

Fill goes UP, not down. What collapses is COUNT: **boost's smear fuses 3-4 discrete slivers into
one blob and triples its area** — a 12 px sliver becomes a ~130x70 px slab. That is precisely the
defect crash.js removed in Wave N, re-created downstream. Mechanism: boost's full-screen smear is
applied after the additive sparks hit the framebuffer with **no depth or luminance gate on the
additive layer**. `crash.js` cannot fix it, and raising spark density alone just buys more slabs.

**ORDERED FIX, do not reverse it: boost narrows the kernel FIRST; only then does crash raise its
`SPARKS` count (150 authored, 114 live).** One number: patch-A blob density under boost LIVE,
4.6 -> 10.1 per 1e4 px (16 blobs -> 35); areaMed 47 -> <=15. Do NOT raise crash's `r` above 1.10.

**SIXTH BROKEN-TOOL FINDING: `aspP90` INVERTS under boost live** (4.9 sparks-visible vs 5.3
sparks-hidden). It is valid only at `uAmount = 0`. Wave N nominated it as the replacement for the
retired `aspMed`; it is not safe in the shipping render. Use blob DENSITY — monotone in both.

---

## SESSION 8 — READ THIS FIRST. IT SUPERSEDES EVERY "EXACT NEXT ACTION" IN THIS FILE.

Arrived to a healthy tree: `./tools/lint.sh` = `lint ok`, all seven scenes rendered at
`shots/<sceneId>-r9.png`. Wave J (ten builders) was COMPLETE and written up at STATE.md
lines ~1718-2032 — **do not relaunch any Wave J builder.**

### WAVE K CRITIC SWEEP IN FLIGHT — ten critics, ZERO builders (per the Wave J process finding)

Launched at session-8 start. One critic per piece, fresh context, each pointed at its own
Wave J paragraph plus the standing constraints. Shared preamble is now a file on disk:
**`tools/WAVE-K-BRIEF.md`** — reuse it for every future sweep instead of retyping the
constraints into ten prompts. It encodes: measure resolution-matched, name the reference
file + exact region args for every headline ratio, run the game yourself and never trust a
builder's shot, blind-call which image is real, and *if a number says we match but the image
reads wrong, the number is the broken thing*.

Deliberate choice this wave: **no builders run concurrently with the critics.** Wave J proved
concurrent builders perturb each other's headline metrics badly enough to invalidate unpaired
before/after measurements (road watched its ratio move 0.86 -> 1.11 with zero road.js
changes, because sky.js landed an aerial-perspective change mid-round). Critic sweeps and
builder waves are now strictly alternating, never overlapping.

Piece -> owner file, unchanged: sky-lighting/sky.js, road-surface/road.js, car-paint/car.js,
environment/world.js, chase-camera/camera.js, boost-fx/boost.js, crash-cam/crash.js,
damage-model/damage.js, audio/audio.js, hud/hud.js.

### WAVE K VERDICTS AS THEY LAND — these ARE the Wave L builder briefs

**NEW THIS SESSION: verdicts live in `verdicts/wave-k/<piece>.md`, one file per piece, NOT
inline in STATE.md.** STATE.md had reached 258 KB and 3710 lines, which is why every session
so far has burned its opening context just orienting. Hand a Wave L builder its own verdict
file path; do not paste verdict bodies in here. The index below is the only inline record.

| piece | verdict | one-line gap (mechanism, and the file to change) | brief file |
|-------|---------|--------------|-----------|
| sky-lighting | real wins | dusk horizon fed ONLY by the spectrally-flat ms fudge, so it bakes GREY by construction (betaR cancels in src/ext). `sky.js:371,386-387`. Fixes all 3 preset clamps at once | `verdicts/wave-k/sky-lighting.md` |
| road-surface | real wins | chip lens point-samples the planar mirror +/-6 texels/pixel -> per-pixel dither that FAKES the grain anchor. `road.js:1161-1163` | `verdicts/wave-k/road-surface.md` |
| car-paint | real wins | glass normal AMPLITUDE (not frequency) makes every pane specular lamellae. `car.js:922-950 makeGlassWave` | `verdicts/wave-k/car-paint.md` |
| environment | real wins | `atmoTail` spends its haze budget on desaturate-to-own-luma, which PRESERVES contrast; and `uHazeD` reads a dead 0.001 placeholder. `world.js:868-872,2749` + `sky.js:1404` | `verdicts/wave-k/environment.md` |
| chase-camera | real wins | `distAccel` feeds accel into the spring TARGET, not velocity -> a SUSTAINED +/-46% standoff offset. Static pose is CONVERGED (critic could not pick the real one); it fails on THROTTLE, not speed. `camera.js:73,321` | `verdicts/wave-k/chase-camera.md` |
| boost-fx | real wins | radial accumulation is a BOX MEAN = energy sink, not a streak. 52 px kernel -> 1.8 px correlation. Kernel length is NOT the lever. `boost.js` | `verdicts/wave-k/boost-fx.md` |
| crash-cam | real wins | `stepSparks` emits over-unity additive colour (r=2.8x), clipping the first 63% of every streak flat. `crash.js:2058-2073` | `verdicts/wave-k/crash-cam.md` |
| damage-model | real wins | bonnet is the only torn panel with no sheet thickness and no interior — two paper sheets 5 cm apart with a 4%-albedo back. `damage.js:764,715` | `verdicts/wave-k/damage-model.md` |
| audio | real wins | boost has NO IGNITION TRANSIENT — the contour only rises, no one-shot layer off the gate edge. `audio.js:703-712` | `verdicts/wave-k/audio.md` |
| hud | real wins | lick amplitude hard-coded ASYMMETRIC, so the top rail is ruled while the bottom throws 2.5-3.1x. `hud.js:559-560` | `verdicts/wave-k/hud.md` |

**EVERY GAP THIS WAVE IS A MECHANISM IN ONE NAMED FILE, AND FOUR ARE THE SAME BUG CLASS:
a quantity pushed past the range its own downstream falloff can represent.** crash sparks at
2.8x additive clip the first 63% of the authored `pow(v,2.2)` taper; car glass slope exceeds the
pane's blur kernel so facets read as lamellae; road's chip lens warps mirror UVs by +/-6 texels
per pixel with no matching mip; boost's box-mean accumulation averages away the very contrast it
is supposed to smear. r8's glass-albedo>1.0 bug was the first of these. **Wave L builders should
check their own gain/amplitude terms against the dynamic range of whatever consumes them BEFORE
adding anything new.**

**THE SIGNATURE FAILURE HAS NOW HAPPENED FOUR TIMES.** road k1 is the fourth piece caught
*passing* its metric by a mechanism that makes the image worse (it now exceeds the 12.48 grain
anchor at 13.38, using aliasing). The other three: car glass matched p99 while reading as
corduroy, boost's spectral sweep scored perfectly at an inaudible -50 dB, boost's plume was
stretched to 6.5:1 to match a HUD graphic. **A metric that can be satisfied by aliasing,
by inaudible signal, or by the wrong object is not a metric.** road k1 also introduces the
right shape of fix: replace the flawed score with a SCALE-PERSISTENCE ratio (measure at 1920
and at 960, require the ratio to hold) which aliasing cannot fake. Consider whether the same
scale-persistence trick fixes crash's background-limited debris metric.

**AND A CROSS-CUTTING MEASUREMENT FACT, established by frozen-tree repeat renders:** per-piece
run-to-run noise is +/-0.04, NOT the +/-0.35 that has been assumed. Every large mid-round swing
previously written off as render noise was cross-piece coupling from a concurrent builder.
This retroactively justifies the strict no-concurrent-builders rule and means paired atomic
A/Bs are not optional.

### WAVE K IS COMPLETE — ALL TEN VERDICTS COLLECTED, ALL TEN `real wins`. Do NOT relaunch a Wave K critic.

### WAVE L BUILDERS IN FLIGHT — ten builders, ONE PER FILE, zero critics concurrent

Shared preamble on disk: **`tools/WAVE-L-BRIEF.md`** (reuse it; it carries the ownership rule,
the paired-atomic-A/B protocol, the over-range bug class and the metric/eye failure list).
Each builder was handed `verdicts/wave-k/<piece>.md` as its brief and told to read ONLY the
SESSION 8 block of this file, not the 3700-line history.

**ONE CROSS-FILE ROUTE WAS ARRANGED BY THE ORCHESTRATOR, honour it:** the environment fix needs
the real fog density, but `world.js:2749` reads `scene.fog.density`, which is a dead `0.001`
placeholder hardcoded at **`sky.js:1404` — a file the SKY builder owns.** So the sky builder was
told to expose the true preset `d0` and report the name, and the environment builder was told to
read it READ-ONLY from `sky.fogParams[0]` and never edit sky.js. If the sky builder's report
names a different symbol, the environment piece's next round must pick it up.

### SESSION 8 EXACT NEXT ACTION

1. Collect the ten Wave L builder reports. Write each into `verdicts/wave-l/<piece>.md`
   (same one-file-per-piece convention as wave-k — do NOT inline them here).
2. Then run `./tools/lint.sh` (must be `lint ok`) and `./tools/refresh-latest.sh` so the
   progress board shows the new round.
3. Then launch the WAVE M CRITIC SWEEP — ten fresh critics, `tools/WAVE-K-BRIEF.md` as the
   shared preamble (it is wave-agnostic; just say ROUND m1), each pointed at its own
   `verdicts/wave-l/<piece>.md`. **Zero builders concurrent — this alternation is not optional,
   see the noise finding above.**
4. A piece is DONE only on `cannot tell` or `ours wins`. **chase-camera is the closest in the
   project**: its k1 critic could not pick the real image from the static still and all four
   static targets pass at every speed; it failed ONLY on sustained longitudinal acceleration.
   If the Wave L camera fix lands, that piece is a genuine `cannot tell` candidate at m1 —
   but the critic must prove it across the accelG sweep, not on the still.
5. If a piece's critic and builder start disagreeing about a NUMBER rather than an image, that
   is the signal the metric is broken, not the piece. Retire the metric and replace it with one
   that cannot be satisfied the wrong way (road's scale-persistence ratio and crash's
   local-background debris measure are both good models of the fix).

## SESSION 7 (01:18-04:00) — history. Superseded by SESSION 8 above.

**Jump straight to `### SESSION 7 EXACT NEXT ACTION (rewritten 03:20...)`. Everything above
it in this file is history, in reverse-chronological waves.**

State at the end of session 7:
- `./tools/lint.sh` = `lint ok`. All seven scenes render clean at
  `shots/<sceneId>-r9.png` (03:50), on the fixed display chain.
- **Three full waves completed this session**: Wave G critics (ten verdicts), Wave H builders
  (ten), Wave I critics (ten), Wave J builders (ten). Read `### WAVE I VERDICTS` and
  `### WAVE J RESULTS` — those two blocks are the live state of every piece.
- **All ten pieces are still `real wins`.** Nothing has reached `cannot tell` or `ours wins`,
  so nothing is retired. Closest is chase-camera: its Wave I critic said it could not pick the
  real one from the static still and failed the piece purely on speed-dependent behaviour,
  which Wave J then fixed (contact-line travel across the speed range 0.0854 -> 0.0032).
- **Two structural fixes landed this session that invalidate older numbers**: the per-preset
  grade is now live on the shipping ACES path (was inert — every measurement of ours from
  before 02:00 is void), and the crash-cam scene now captures at `simTime 0.9` inside the
  slow-mo beat (was 9.5, outside it — every crash measurement from before 03:00 is against a
  different frame).
- `tools/probe.mjs` was found broken and is fixed. New tools on disk this session:
  `_cropimg.mjs`, `_hudedge.mjs`, `_heromask.mjs`, `_plumemeas.mjs`.
- **Read the two boxed cross-cutting findings before planning anything**: the concurrency
  warning under `### !!! CROSS-CUTTING PROCESS FINDING FROM WAVE J !!!`, and the
  metric-vs-eye lesson at the end of the next-action block. Several rounds this session were
  spent optimising numbers that had come loose from what they were meant to represent.

--- history below this line ---

### WAVE E CRITIC SWEEP IN FLIGHT (launched 01:20, ten critics, ZERO builders)

One fresh critic per piece, no shared context with any builder, no builder
running concurrently. Each was given the previous round's measured numbers and
told to RE-MEASURE rather than trust that the fix landed.

| piece | round judged | scene / harness | shot it writes |
|---|---|---|---|
| sky-lighting | r8 | dusk-highway-chase | shots/sky-lighting-r8.png |
| road-surface | r8 | wet-night-asphalt | shots/road-surface-r8.png |
| car-paint | r8 | car-paint-closeup | shots/car-paint-r8.png |
| environment | r9 | daytime-downtown + own shadow-ab A/B | shots/environment-r9.png |
| chase-camera | r5 | dusk-highway-chase, 3 numeric targets | shots/chase-camera-r5.png |
| boost-fx | r5 | boost-blur, per-depth-band smear | shots/boost-fx-r5.png |
| crash-cam | r5 | crash-cam | shots/crash-cam-r5.png |
| damage-model | r5 | **tools/damage-shot.mjs** (see cmd below) | shots/damage-model-r5.png |
| audio | r8 | audio-* harnesses, reuse don't rewrite | (no shot) |
| hud | r5 | hud-overlay | shots/hud-r5.png |

Non-default critic instructions that were issued and MUST be re-issued on relaunch:
  - damage r5 renders ONLY with:
    `node tools/damage-shot.mjs --scene daytime-downtown --out shots/damage-model-r5.png --do "d.setLevel(0.7)" --cam "3.9,1.6,4.2|0,0.75,0.3|40"`
    and was told to also render 0.4 / 0.7 / 0.95 to measure length lost per level.
  - environment r9 must re-run `tools/shadow-ab.mjs` itself; shadows are ALIVE.
  - audio r8 must use `ours-squeal.wav`, NEVER `ours-squeal-solo.wav`
    (audio-isolate.mjs:61 leaves `brake: 1` in the bed, so the solo is invalid).
  - crash r5 was told the dust plume is deliberately NEXT round, not this one.
  - chase-camera r5 was told depression is unreachable at y=1.94; height is the
    lever, not distance.
  - **no critic may test or recommend AgX. The tonemapper decision is CLOSED.**

If this session died mid-sweep: check which `shots/<piece>-r<N>.png` from the
table above exist and relaunch ONLY the missing critics with the same brief.

### WAVE E VERDICTS AS THEY LAND — these ARE the Wave F builder briefs

**environment r9: `real wins`.** (critic re-measured both shots itself with
`tools/_facademeas.mjs`, band y 5-55%, normalised to 1920px)

| image | sobel | strong% | sat | lum |
|---|---|---|---|---|
| environment-r9 | 19.81 | 21.6 | 0.339 | 82.1 |
| environment-r8 (re-measured) | 14.24 | 14.3 | 0.307 | 67.0 |
| daytime-downtown-01 | 31.93 | 35.2 | 0.551 | 83.0 |
| daytime-downtown-02 | 18.26 | 16.9 | 0.501 | 86.3 |
| daytime-downtown-03 | 16.20 | 16.3 | 0.373 | 71.2 |
| daytime-downtown-04 | 5.59 | 3.0 | 0.556 | 53.2 |

The r9 facade-relief work DID land: sobel 14.24 -> 19.81 (+39%), now above refs
02/03/04 and behind only ref 01. (Critic measures r8 at 14.24 not the 16.65 in
the brief - different band args, but both shots measured with identical flags so
the delta is sound.) Paint saturation did NOT land: 0.339 vs 0.501-0.556.

`tools/shadow-ab.mjs` re-run twice back-to-back: road MAD 16.62/16.69 (max 126),
facade 18.25/17.43, meanOn ~53 vs meanOff ~71. **Shadows are alive and stable.
Never re-open this.**

GAP (Wave F brief): **sign panel textures render MIRRORED on ~half the
placements** - the left-foreground green hardware sign reads "BLACKINT /
HARDWARE" reversed, the top-left banner "ARAGAV", the right-side "FAIRMONT
GARAGE" flipped. Root cause is physical: signs are `PlaneGeometry` with
`side: THREE.DoubleSide` (`world.js:1567`) placed by `placeSign` off the
frontage `ry` (`world.js:1593-1599`), and the frontage normals recorded at
`world.js:1470` are never disambiguated inward/outward - so half the panels face
away from the street and DoubleSide cheerfully draws the reversed back face.
No shipped AAA game has backwards shop signage; this is the single cue that
decides the blind test before any lighting judgement.
FIX: at `world.js:1470` make the frontage normal canonical - dot the candidate
normal against (wall centre - building centre) and flip `ry` by π when negative
- then set signs to `side: THREE.FrontSide` (`world.js:1567`, keeping
`shadowSide: DoubleSide`) so any still-misoriented panel vanishes rather than
lies. Secondary: raise storefront/billboard chroma in `signCols` / `makeSign`
(`world.js:429, 538`) to bring sat 0.339 up to ~0.50.

**road-surface r8: `real wins` (not close). AND THE r8 BRIEF WAS WRONG — READ THIS
BEFORE BRIEFING ROAD AGAIN.**

The r7 critic's numbers that drove the r8 build do not reproduce, and it compared
against the wrong reference. The r8 builder therefore optimised the wrong way and
partly REGRESSED the piece. Corrected numbers (`tools/_bandmeas.mjs`, road-only
regions: ref-01 `0.72,1.0,0.88,1.0`, ours `0.65,1.0,0.80,1.0`):

| metric | r7 | r8 | ref-01 (the bar) |
|---|---|---|---|
| transverse ratio (row/col) | 1.36:1 | 1.47:1 | **3.89:1** |
| same, default region | 1.96:1 | 1.54:1 | **2.39:1** |
| refl streak len (autocorr->0.5, px@1080) | 18 | 16 | **9** |
| grain floor (dark-40% HP RMS, lum-norm) | 4.07 | 3.10 | **7.22** |

Two corrections to the record:
1. The "5.0:1 for r7" figure is NOT reproducible at any region or high-pass
   radius (max observed 1.96:1).
2. The "reference 0.54:1" came from `wet-night-asphalt-02`, a flat-lit
   MOTION-BLURRED frame. The designated bar is `wet-night-asphalt-01`, which
   measures 2.39:1 frame / 3.89:1 road-only. **Real wet tarmac is strongly
   TRANSVERSE-banded.** We needed MORE transverse banding, not less.
So r8 pushed the ratio the wrong way (1.54 vs r7's 1.96) and the near-road grain
floor FELL (raw 3.35 -> 2.12) despite a "raise the floor" brief.

GAP (Wave F brief): **the road has no cross-road structure, so every reflection
runs as an unbroken vertical comb.** Real asphalt is smooth ALONG the wheel path
and ridged ACROSS it (camber grooves, tyre-polished ridges); at 10-20 deg off the
deck those ridges foreshorten into horizontal dashes that cut reflected verticals
into bars - hence 3.89:1. Ours is 1.47:1, near-isotropic, streaks 1.8x too long.
The right half of `shots/road-surface-r8.png` reads as venetian blinds on wet
glass, not tarmac. `road.js:1037-1050` names `chop` as the serration source then
collapses it with `uWet` (ceiling 0.80 -> 0.20), deleting the one feature the
reference actually has. The r7 diagnosis (isotropic per-chip chop aliases) was
right; the remedy threw out the signal with the noise.
FIX: replace isotropic per-chip `chop` with an ANISOTROPIC GROOVE FIELD - stretch
the meso height field 4-8x along-road when building the normal
(`road.js:172-181`, tile gen `:579`) so its gradient lives almost entirely
cross-road; reopen the wet ceiling at `:1050` from 0.20 to ~0.55; drop the
`water * depthN` knit-back at `:1052`, keeping only the distance retire at
`:1056`. Simultaneously cut the vertical smear (`:998-1000` `blurLen`, `:1010`
tap offset) ~40% to bring streak length 16px -> the reference's 9px.

**PROCESS LESSON (cost a whole round): a critic that reports a headline ratio must
name WHICH reference image and WHICH region/radius args produced it, and the next
critic must re-derive it before any builder acts on it. `wet-night-asphalt-01` is
the bar for this scene; -02 is motion-blurred and must not set targets.**

**chase-camera r5: `real wins` (framing only). FIX ALREADY APPLIED BY THE
ORCHESTRATOR — do not launch a builder, go straight to an r6 critic.**

Measured with `tools/_cammeas.js` via `tools/probe.mjs` at distance 9.0:

| metric | measured | target | status |
|---|---|---|---|
| car height | 21.32% | 20.9-21.7% | in range |
| contact line | 0.750 | 0.77 | 2.0 pts high |
| horizon depression | 0.238 | 0.21-0.22 | OUT, +8% rel |

The session-6 distance fix (10.2 -> 9.0) is PARTIALLY confirmed: it fixed car
height (18.20 -> 21.32, dead centre) and improved contact (0.713 -> 0.750), but
depression got WORSE (0.201 -> 0.238). Accept the distance change; it was not
sufficient.

**Confirmed with a measured sweep: depression is a pure function of camera HEIGHT,
and distance cancels out of it** — depression = (camH - roofY 1.397) / (camH -
contactY 0.178). Sweep at distance 9.0:
  height 1.885 (camH 1.940) -> 0.238, car 21.32%, contact 0.750
  height 1.800 (camH 1.853) -> 0.210, car 21.09%, contact 0.737   <- CHOSEN
  height 1.720 (camH 1.770) -> 0.181, car 20.89%, contact 0.725
APPLIED at 01:24: `scenes.js` `dusk-highway-chase` `height: 1.885 -> 1.80`,
distance 9.0 and fov 42 untouched. Lint ok, re-rendered to
`shots/chase-camera-r6.png` + `-latest.png`. The full sweep is now recorded in a
comment at that line so no future round re-derives it.

**STANDING GEOMETRIC LIMIT — stop trying to fix the contact line.** Contact line
and car height both scale as 1/distance, so their ratio is locked at 0.867 while
the targets imply 0.771. Contact 0.77 cannot be bought with distance or FOV; only
camera pitch (`FRAME.pitchBase`) can, and that drags the horizon off its measured
49-51%. The residual 0.737-vs-0.77 miss is deliberately left unfixed. A future
critic naming it as the biggest gap should be told this and asked for the next
gap instead.

**damage-model r5: `real wins`, but the r4 structural gap is CLOSED.**
Length lost (body z-extent in car local frame, rest = 4.750 m):

| level | length | lost |
|---|---|---|
| 0.00 | 4.750 m | 0 |
| 0.40 | 4.450 m | 0.300 m |
| 0.70 | 4.091 m | 0.660 m |
| 0.95 | 3.967 m | **0.783 m** (target 0.6-0.9) |

Genuine structural loss, not a wobble: the tail is anchored (zmin holds -2.375)
and all 0.78 m comes off the nose (zmax 2.375 -> 1.592). Wheel migration landed
too — wheelbase 3.020 -> 2.660 m, front hubs drop 75 mm and gain camber. Front
near-side wheel does tear off at 0.95, but the loose wheel body is nowhere in
frame, so it currently reads as a DELETED wheel rather than a separated one.
Creases are genuine (long shallow buckles with sharp fold ridges, hood tenting
over the shortened bay, arch lip folded onto the tyre). Weak spots: the paint/chip
mask is large flat white-grey blotches that read as primer decals rather than
abraded clearcoat, and glass is sparse scribbled filaments vs crash-cam-03's dense
radial spiderweb with caustic sparkle.

GAP (Wave F brief): **the rigid front-clip props do not ride the crush map.**
`car.js` parents grille (z 2.24), splitter (z 2.14) and both lamp groups (z 2.045)
onto `shell` as static children (`car.js:1627-1629, 1651-1653, 1682-1686`). Crush
pulls the nose skin back to z 1.715 at level 0.7 while the props stay put, so the
render shows a black bumper slab, a chrome grille and two headlamp pods hanging in
open air 0.35-0.5 m ahead of the bodywork with a clean gap behind them. In
crash-cam-03 the bumper and lamps either stay welded into the collapsing structure
or separate and rotate — they never float at stock offsets.
FIX: mirror the wheel treatment onto the props. Build a `rigidRest` list beside
`wheelRest` (`damage.js:1335-1339`) capturing each prop's rest position, and in
`applyCrushToWheels` (`damage.js:1347-1359`, called from `setCrush` ~1364) drive
`node.position.z = crushZ(rest.z)` plus a small pitch from the local crush
gradient so the bumper rotates as it telescopes. Have `car.js` publish the props
(`car.crushRigids = [grille, splitter, lampL, lampR]`) rather than discovering
them by name.

**car-paint r8: `real wins`, but the r7 diffuse-floor gap is CLOSED.**
Measured on a mid-flank patch. The critic ADDED `tools/_paintmeas.mjs` — reuse it,
do not rewrite it. Regions cross-checked with `tools/_crop.mjs`.

| metric | r7 | r8 (ours) | ref-03 (side) | ref-01 | ref-04 |
|---|---|---|---|---|---|
| flank mean L | 13.5 | **46.8** | 64.1 | 34.1 | 63.5 |
| flank p50 | 8.1 | 49.8 | 77.5 | 34.3 | 46.0 |
| spec:diffuse (p99/p50) | 15.85 | 3.01 | 1.39 | 2.15 | 4.32 |
| flake grain RMS (% of mean) | 18.95 | 4.84 | 9.35 | 11.2 | 17.59 |
| flake grain period | 3.7 px | 3.7 px | >24 px | 21.8 px | 4.2 px |
| clearcoat highlight FWHM | 24 px | 7 px | 22 px | 18 px | ~6.7 @1920 |
| flank modulation (p90-p50) | 2.6 | **6.2** | 22.6 | 21.4 | 112.9 |

Diffuse floor genuinely fixed: 9.5 -> 46.8 against a ~53 target, and spec:diffuse
fell from a blown 15.9 into the reference band. NOTE the dials actually shipped as
`metalness: 0.27, roughness: 0.43` (`car.js:1310`), NOT the briefed 0.18/0.38 —
the shipped values measure fine, do not "correct" them back to the brief.

GAP (Wave F brief): **the flank has no sky-band / ground-band split.** 90% of our
flank pixels sit within 6.2 L of the median vs 21-23 L in both side-view refs. Our
only vertical variation is a smooth monotonic AO ramp, whereas ref-03's profile is
NON-monotonic (85 -> 60 -> 100 -> 61 -> 48) with a fast transition at the body
horizon line. The cause is geometric, not material: the door and quarter panels are
flat plates, so a clearcoat at `clearcoatRoughness: 0.018` reflects one
near-constant direction across the whole panel and returns a single flat value.
Confirmed in a 2x crop — the reference flank sweeps sky-blue at the shoulder to
dark ground at the rocker; ours is a uniform red plate with sandpaper noise.
FIX: bake a broad CONVEX CROWN into the body normals, one lobe per panel at ~1-2 m
wavelength — either real vertex crown on the door/quarter shells, or a
large-scale term added to the existing orange-peel normal map
(`car.js:592-650`) at ~20-30x its current amplitude — so the reflection vector
rotates several degrees top-to-bottom and CROSSES the environment horizon. Then
raise `clearcoatRoughness` 0.018 -> ~0.09 (`car.js:1312`) so the swept reflection
reads as a soft band rather than a hard mirror seam, which should also widen the
7 px highlight toward the reference 18-22 px. Secondary: flake amplitude is ~2.3x
too weak (4.84% vs 9-18%).

**hud r5: `real wins`. The r4 "segmented battery" brief did NOT land.**
Measured vs `hud-overlay-01` / `-03`:

| metric | ours | ref-01 | ref-03 |
|---|---|---|---|
| bar height / frame H | 4.35% | 7.0% | 7.6% |
| bar aspect | 8.85 | 4.19 | 7.11 |
| blown-white core px (all ch >225) | **0.00%** | 3.87% | 2.75% |
| core RGB | 223,234,154 | 233,245,182 | 237,247,184 |
| green-excess peak | 44 | 59.6 | 61.1 |
| bloom halo, 50% falloff | +/-0.32 bar-h | 0.59 | 0.52 |
| bloom halo, 10% falloff | -0.72 | -0.87 | -0.87 |
| lateral bleed past right end (50%) | 0.05 bar-h | 0.35 | 0.16 |
| notch high-freq RMS | **3.2** | 1.17 | 1.32 |
| notch modulation p-p | 7.4% | 3.7% | 4.7% |
| digit stroke / cap-height | 0.338 | 0.207 | - |
| digit gap / cap-height | 0.486 | 0.138 | - |

Notches are NOT near zero — residual high-frequency energy is 2.4-2.7x reference
and now reads as a vertical comb of light stripes inside the fill rather than as
fire. Bloom exists but is half the reference radius and never clips to white
(0.00% blown core vs 2.75-3.87%). The speedo plate does read translucent (soft top
rail, gradient falloff) but its left, right and bottom edges are hard cuts, so only
one of four sides is torn. NOTE: the references carry no speedo at all, so that
element is our invention and its rectangularity is what betrays it.

GAP (Wave F brief): **the boost bar's silhouette is ruled geometry, not fire.** Top
and bottom rails are single-pixel straight lines with only low-amplitude wobble,
and the right end terminates in a perfectly vertical cut, so the flame perimeter
never breaks up. The reference bar's boundary is a turbulent front with wisps
escaping 0.5-0.9 bar-heights, and 3% of its area clips to pure white.
FIX: drive the body's ALPHA BOUNDARY from the flame texture instead of a polygon —
composite the scrolling `flameTex` as a `destination-in` mask over the fill and add
per-column top/bottom height jitter from two octaves of scrolling noise, replacing
the static `torn()` call at `hud.js:396`; extend the same fray past the leading edge
so the right end dissolves. Then raise the fill's pre-bloom intensity so the 4 px
pass at `hud.js:416-417` SATURATES — target ~3% of bar area at 255,255,255 — and
stretch the 20 px pass weight up so the halo reaches +/-0.55 bar-heights. Kill the
remaining comb by lowering `flameTex` contrast or widening its tile at
`hud.js:442-447` until high-freq RMS drops under 1.5. Also: the bar is
undersized — 4.35% of frame height vs 7.0-7.6%.

**sky-lighting r8: `real wins`. THE r8 CLOUD THEORY WAS WRONG — root cause found
and A/B PROVEN. This is the highest-value brief in Wave F.**

Measured on `shots/sky-lighting-r8.png` vs `dusk-highway-chase-{01,03,04}`, via
`tools/_px.mjs` (critic PATCHED it to accept JPEG input) and `_tm-measure.mjs`:

| metric | r7 | r8 | ref-01 | ref-03 | ref-04 |
|---|---|---|---|---|---|
| zenith rgb | 198/172/176 | 156/126/132 | 62/100/105 | 85/124/156 | 56/94/115 |
| zenith sat | 0.13 | 0.193 | 0.414 | 0.453 | 0.518 |
| zenith B/R | 0.89 | **0.84 (WORSE)** | 1.70 | 1.83 | 2.07 |
| zenith p50 L | 185 | 140 | 91 | 118 | 86 |
| zenith p01-p99 | 90 | 83 | 24 | 16 | 21 |
| nearRoad rgb / med | 23/16/24 / 18 | 26/22/33 / 24 | 61/68/60 / 73 | 65/72/70 / 60 | 77/81/68 / 86 |
| castR | 1.210 | **1.246 (WORSE)** | 0.954 | 0.856 | 0.954 |
| roll | 12 | 15 (landed) | 8 | 13 | 39 |
| satHi | 0.139 | 0.242 (landed) | 0.450 | 0.232 | 0.310 |

Zenith hue inversion is NOT fixed — B/R went 0.89 -> 0.84, still ~2x off, and
castR got WORSE. Only the highlight roll and satHi guard landed.

**ROOT CAUSE (A/B proven, supersedes the entire r8 cloud brief): the Mie halo is
the pink zenith, not the clouds.** Probing the live LUT (critic added
`tools/_skyprobe.mjs` — REUSE IT) shows the atmosphere bake is CORRECT: at the
18-22 deg elevation the top strip actually covers, it reads 0.08-0.24 linear at
B/R 1.9-2.4. But `sky.js:621` adds `pow(cs,20)*1.7 + pow(cs,7)*0.26` of `0xff9a4e`
gated ONLY by `smoothstep(-0.10, 0.02, h)` — a LOWER gate with no upper one. A
tight exponent of 20 has an 18 deg half-width, so ~0.55 linear of orange lands on
top of a 0.14 teal sky: 4x the radiance of the sky it sits in.
A/B PROOF: rebuilding with `tightGain / wideGain / horizon = 0` gives zenith
84/92/122, sat 0.31, B/R 1.45, p50 92, spread 18, castR 1.143 — instantly inside
reference range. The r8 cloud work did nothing here; cloud-off renders are
BIT-IDENTICAL in the zenith strip. **Do not send another builder after the clouds.**
FIX: at `sky.js:772` tighten the Mie aureole to physical width — `tight: 20 -> 300`,
`wide: 7 -> 45` (half-widths ~5 deg and ~12 deg), raising the gains to preserve peak
radiance; and at `sky.js:623` multiply the halo by a boundary-layer term
`exp(-max(h, 0.0) * 6.0)` so aerosol scattering is confined near the horizon where
it physically lives. A sun disc 0.9 deg BELOW the horizon cannot illuminate 22 deg
of sky.

**crash-cam r5: `real wins`, and most of the r4 brief LANDED (one item overshot).**
Measured at the shot instant (crash time 3.94 s, timeScale 0.671, fov 48.4 deg,
cam 4.34 m). The critic probed instance matrices directly, so these are RENDERED
values, not briefed ones:

| metric | target | actual |
|---|---|---|
| panel size | 8-25 cm | 6.4-24.2, p50 13.0 — met |
| mech size | 8-25 cm | 2.7-11.5, p50 5.7 — undersized |
| glass size | 4-12 cm | 1.0-5.8, p50 2.9 — 2-3x undersized, reads as grit |
| count | ~3x of 128 | 384 alloc, 256 live (81 panel/120 mech/55 glass) — met |
| airborne late | few | **0 of 256** (max y 0.20 m) vs r4's 90/128 — OVERSHOT |
| fan radius | capped | 2.2-5.6 m cap, cluster ~3 m — met |

Shutter polarity IS fixed (ground streaks, wreck stays sharp, matches
crash-cam-01). Slow-mo curve (0.15 floor / 0.30 hold / 2.10 ramp) is a plausible
Paradise beat. Camera orbit is fine but frames the wreck high and the debris
low-left as two unrelated events.

GAP (Wave F brief): **the debris field is 100% settled and asleep while the wreck
is still airborne mid-tumble.** `MASS.air` caps every class at 0.62-2.9 s of crash
time, so at 3.94 s nothing CAN be flying by construction; combined with the
2.2-5.6 m `capR` the result is a flat, static, motion-blur-free carpet of chips
lying 4 m behind the hero. Because those chips are asleep (v=0, so the
velocity-stretch `k` = 1) they render razor-sharp on top of a streaking road and
read as decals pasted onto the tarmac. Both reference plates show debris still in
flight, individually streaked, co-located with the airborne car. The r4 fix
overshot: we went from 90/128 stuck airborne to 0/256 able to fly.
FIX: gate the airborne budget on the WRECK'S OWN REST STATE instead of a fixed
per-class timer — keep `air` as a stall timer but suppress the retire/ground branch
(`crash.js:1662-1683`) until the shell sleeps, and raise `MASS.heavy.air` to cover
the tumble (`crash.js:989-1005`). Then add secondary `spawnDebris` bursts on each
wreck-ground contact in the scrape handler (`crash.js:1551-1578`) so fresh chips
launch DURING the tumble. Also roughly double `glassGeo` instance scale to land in
the 4-12 cm band.

**audio r8: `real wins`. The r7 crash-body gap is CLOSED; the tail SLOPE is now wrong.**
Crash measured on `ours-crash-solo.wav` (isolated, residual 9.9e-6) vs
crash-impact-01/02. Tyre measured on `ours-squeal.wav` (never the solo).

| metric | ours | ref-01 | ref-02 |
|---|---|---|---|
| T60 Schroeder (-5->-25 dB) | 2.36 s | 6.74 s | 1.84 s |
| T20 / T30 | 0.60 / 1.35 s | 2.96 / 3.33 | 0.73 / 0.85 |
| T60 @63 Hz | 0.91 s | 2.29 s | 2.16 s |
| T60 @250 / 2k / 8k | 1.32 / 4.64 / 4.81 | 3.35 / 8.91 / 5.10 | 2.12 / 1.79 / 1.16 |
| **T60(8k)/T60(63)** | **5.3x** | 2.2x | **0.54x** |
| centroid | 2951 Hz | 2214 Hz | 3106 Hz |
| sub-120 share | 4.4% | 2.4% | 20.6% |
| 32-band abs-delta mean | - | 7.5 dB | **3.5 dB** |

r7's 230 ms decay IS fixed: decay-to-10% now 410 ms, T60 2.36 s, band error to
ref-02 only 3.5 dB. The modal ring bank landed.

Other channels, for later rounds (do NOT let the r9 builder chase these too):
- Engine: harmonic/total 0.943 vs 0.861; firing f0 120.5 Hz carries a 25 dB
  odd/even partial tilt (22.7/53.0/28.8/54.2 dB) that the refs do NOT have;
  400-2k share 13.0% vs 17.4%; band delta 7.2 dB. Idle is much worse:
  400-2k 11.0% vs 65.1%, band delta 11.5 dB.
- RPM sweep (`ours-gears`): firing f0 sweeps 40->126 Hz (3.1x) but centroid is
  PINNED at 1309-1689 Hz (+/-1.9 dB) — timbre does not brighten with rpm.
- Boost: onset 10%->peak 130 ms vs 280/1130 ms. Centroid travels 1830->1900 Hz
  (+70) vs ref-01's 1928->2837 (+909). sub-120 15.8% vs 1.1%.
- Tyre: formants 1479/2640 Hz vs 820/1896 (ref-01) and 691/1893 (ref-02) — f1 is
  +10 semitones high. Peak prominence 3.0 dB vs 7.1/3.9.

GAP (Wave F brief): **the crash tail's frequency-dependent damping is INVERTED.**
Modal loss factor and air absorption (prop. f^2) make real HF modes die FIRST —
ref-02 runs T60 2.16 s @63 Hz down to 1.16 s @8 kHz, a ratio of 0.54x. Ours RISES
0.91 -> 4.81 s, 5.3x: a ~10x error in the slope. So our tail is a bright hiss over
a bass that has already vanished (sub-120 4.4% vs 20.6%).
FIX: the long HF is NOT the ring bank — it is the 3 kHz / 1500 Hz pink settle beds
at `audio.js:1367-1373` (dur 2.4 s and 2.0 s, `endRel` 0.05/0.063), which outlast
every low mode. Shorten those to ~0.5-0.8 s and add a DOWNWARD-SWEEPING LOWPASS
inside the decay so the tail darkens as it fades (a damped-mode envelope, not a
static band). Then raise the low structural modes in `MODES`
(`audio.js:1303-1312`, the 163/349 Hz entries at a=0.055/0.070) by ~10 dB and
lengthen 188/274 Hz past 2 s.

**boost-fx r5: `real wins`, and the r5 depth-gate brief LANDED — verified good.**
Two independent measurements, both from NEW tools the critic added (REUSE, do not
rewrite): `tools/_boostkernel.mjs` reads the pass's own `lenPix`/`viewDist` debug
buffers with bloom+ACES disabled; `tools/_smearmeas.mjs` measures pixel-domain
smear by direction-swept autocorrelation (0.5-crossing, x2), normalised to 1920w.

| band | r5 shader kernel | r5 pixels | r4 pixels | reference |
|---|---|---|---|---|
| sky | 2.4-2.7 px (vdist 300 m) | 4.2 | 1.5 | 5.2 (`-02` cloud band) |
| mid buildings / viaduct | 2.7 city, 5.9-9.8 viaduct | 6.2 / 17.8 | 39.3 / 46.2 | 4.6-6.6 (`-02`) |
| near tarmac | 49.6-52.2 px (3.5-14 m) | 41.3 at lane line | 52.8 | 59.1 (`-02`); 15-18 (`-03` tunnel) |

Monotonic, ~19:1 sky-to-near, tracking `boost-blur-02` closely (ref ratio ~11:1).
**r4's inversion is gone — do not re-open the depth gate.** Caveat for the ROAD
piece, not boost: our near tarmac has hpRms 0.28 vs ref-02's 5.89, so the 52 px
kernel is only legible where lane paint exists — the streaks have nothing to bite
on. (This corroborates the road-surface grain-floor gap above.)

GAP (Wave F brief): **the twin jets diverge 53 deg.** PCA on the flame mask gives
jet axes at -63.7 deg and +62.8 deg (26.7 deg either side of screen-vertical);
`boost-blur-01` measures 18.0 and 19.5 deg — 1.5 deg apart, i.e. PARALLEL along the
car's longitudinal axis. Ours fan outward AND downward, so each jet's outer half
passes through the tarmac plane and the left one exits at frame bottom-left. A
chase cam directly behind the car sees the exhaust axis pointing at the lens: the
jets must be near-parallel and strongly foreshortened, not two 200 px lances raked
into the ground. Two-stage separation DOES exist (white core -> lime mid -> orange
tail) but the core is a clipped hueless white blob at ~35% of jet length vs the
reference's ~12% tinted throat; the tail terminates in orange instead of dissolving
into `-01`'s long olive smoke streak; and the tail carries visible single-pixel
dither stipple. No red-cyan split on the flame itself (CA on the right-hand
billboard is CORRECT per `-02`); radial streaks read on the road but not off the plume.
FIX: in `boost.js` the jet direction is splayed in WORLD SPACE before projection —
clamp the per-pipe outward rake to ~2-4 deg and build the jet along the car's -Z
longitudinal axis only (the tailpipe offsets at +/-0.50 x, `~:598`, should set the
jet ORIGIN, not its DIRECTION), then let perspective foreshortening produce the
short-jet look instead of authoring divergence. Cut the core's axial extent to ~0.12
of jet length in the `FlameShader` axial ramp (`~:279-282`) and extend the plume
tail into a desaturated olive smoke ramp so it ends in smoke, not orange.

### WAVE E COMPLETE — all ten verdicts collected, all ten still `real wins`

No piece reached `cannot tell` or `ours wins`, so nothing is retired yet. But the
sweep was worth it: it CLOSED four gaps by measurement (car-paint diffuse floor,
damage structural crush, crash debris sizing/counts/shutter, audio crash body),
CAUGHT one overshoot (crash debris now 0/256 able to fly), and OVERTURNED TWO
WRONG THEORIES that earlier rounds were built on (the sky's pink zenith is the Mie
halo, not the clouds — A/B proven; and the road's whole r8 brief was measured off
the wrong reference image).

### WAVE F BUILDERS IN FLIGHT (launched 01:32, nine builders, ONE PER FILE, zero critics)

  sky.js     -> sky r9    (tighten Mie aureole tight 20->300 / wide 7->45, add
                           exp(-h*6) boundary-layer gate; clouds explicitly OFF-LIMITS)
  road.js    -> road r9    (anisotropic groove field stretched 4-8x along-road,
                           reopen wet ceiling 0.20->0.55, drop water*depthN knit-back,
                           cut blurLen ~40%, raise grain floor toward 7.22)
  car.js     -> car r9     (convex panel crown ~1-2 m lobe so the reflection crosses
                           the env horizon, clearcoatRoughness 0.018->0.09, flake x2.3)
  world.js   -> env r10    (canonicalise frontage normal + FrontSide signs to kill the
                           MIRRORED sign text, raise sign chroma 0.339->~0.50)
  boost.js   -> boost r6   (clamp jet rake to 2-4 deg and build along car -Z; core
                           axial extent 0.35->0.12; olive smoke tail; kill dither)
  crash.js   -> crash r6   (gate air budget on WRECK REST STATE not a per-class timer,
                           secondary bursts on ground contact, upsize glass+mech)
  damage.js  -> damage r6  (ride car.crushRigids on the crush map + pitch from gradient)
  audio.js   -> audio r9   (shorten the 3k/1500 Hz pink settle beds to 0.5-0.8 s, add a
                           downward-sweeping LPF in the decay, raise low modes ~10 dB)
  hud.js     -> hud r6     (flameTex destination-in alpha mask + 2-octave column jitter,
                           saturate the bloom to ~3% blown core, upsize bar, tighten digits)
NO builder for chase-camera: its r5 fix is already applied to scenes.js and it needs
an r6 CRITIC only.

ORCHESTRATOR EDIT MADE THIS WAVE (01:30, before builders launched, to avoid a
two-builders-one-file collision): `car.js` now publishes `car.crushRigids`, an
array of the four rigid front-clip props in build order [splitter, grille, lampL,
lampR]. Verified at runtime via `tools/probe.mjs` — returns 4 nodes; lint ok. The
damage r6 builder READS it and must not edit car.js; the car r9 builder was told
not to delete it.

### !!! CROSS-CUTTING BUG CONFIRMED BY THE ORCHESTRATOR (01:42) — PER-PRESET GRADE IS DEAD ON THE SHIPPING PATH !!!

The sky r9 builder reported it; I verified it myself by reading main.js, so this is
FACT, not a claim:
- `main.js:125` — `const outputPass = toneMode === 'agx' ? createOutputPass() : new OutputPass();`
- Default is `#tone=aces` (main.js:48), which uses **three's stock `OutputPass`**.
  That pass ONLY tonemaps. It has no lift, no contrast, no saturation, no dither.
- post.js's `createOutputPass` (post.js:738) is the ONLY thing that applies the
  per-preset lift/contrast/**sat**/dither, and it is reachable ONLY via `#tone=agx`.

Consequence: every preset's authored grade — including `sat: 1.32` on dusk — is
INERT on the path we actually ship and screenshot. This is why authored chroma
never shows up in measurements, and it plausibly caps the saturation shortfalls
that THREE separate pieces independently reported this wave (sky zenith sat 0.302
vs 0.41-0.52; environment facade sat 0.339 vs 0.50-0.56; sky satHi 0.242 vs
0.232-0.45).

**This is NOT a reason to switch to AgX. That decision stays closed.** The fix is
to SPLIT GRADE FROM TONEMAP: apply the per-preset lift/contrast/sat/dither in the
ACES path too, so grade authoring works regardless of which tonemapper is
selected. Touches `main.js` and/or `post.js`, both orchestrator-owned — no piece
builder owns them.

**DO NOT MAKE THIS EDIT WHILE BUILDERS ARE RUNNING.** It changes the display chain
globally and would invalidate every in-flight builder's own measurements. It is
the FIRST thing to do once Wave F lands and BEFORE the Wave G critic sweep, so all
ten critics judge the same chain. After the edit: re-run `./tools/lint.sh`,
re-render all seven scenes, and note in the Wave G briefs that grade is now live
so critics do not re-report saturation as a per-piece failure.

### SKY r9 RESULT — halo fixed; residual is a DIFFERENT cause, do not re-brief the halo

Changed `sky.js` only, two edits:
- `sky.js:630` — halo now gated on BOTH sides:
  `col += halo * smoothstep(-0.10, 0.02, h) * exp(-max(h, 0.0) * 6.0);`
  (boundary-layer confinement: 1.0 at horizon, 0.12 at 20 deg).
- `sky.js:787-789` — dusk halo `tight: 20 -> 300`, `wide: 7 -> 45` (half-widths
  ~3.9 / ~10 deg), gains RAISED `tightGain 1.7 -> 3.4`, `wideGain 0.26 -> 0.95` so
  the near-sun peak got HOTTER not dimmer (horizon-band p99 225.9 -> 235.4).
  `horizon: 0.22` untouched. Clouds and tonemapper untouched.

| metric | r8 | r9 | target |
|---|---|---|---|
| zenith rgb | 156/126/132 | 85/92/122 | 56-85 / 94-124 / 105-156 |
| zenith B/R | 0.84 | 1.43 | 1.70-2.07 |
| zenith sat | 0.193 | 0.302 | 0.41-0.52 |
| zenith p50 L | 140 | **92.1 IN** | 86-118 |
| p01-p99 spread | 83 | **18.6 IN** | 16-24 |
| castR | 1.246 | 1.162 | 0.856-0.954 |

**Hue inversion is GONE** — sky is teal above with sodium at the vanishing point,
and spread/p50 are both in range. The three remaining misses land at EXACTLY the
critic's own halo-off A/B ceiling (its zero-gain build measured B/R 1.45, sat 0.31,
castR 1.143), which proves the halo is fully fixed and **the residual lives
elsewhere**. Do not send another builder after the halo.

Where the residual actually is (builder's evidence): `_skyprobe` LUT at 21 deg
toward sun reads 0.126/0.144/0.235 linear (B/R 1.87, **G/R 1.14**); the render
decodes to 0.092/0.110/0.195 (B/R 2.10, G/R 1.19) — the frame now tracks the LUT
to noise. References need linear B/R 3.0-4.5 and **G/R 2.7-2.9**, so our zenith is
RED-HEAVY, not blue-poor. Swept turbidity 0.85 / rayleigh 1.35 (B/R 1.41, no help)
and reverted. Ozone raises B/R but LOWERS G/R (the betaO green term is 2.9x the red
one), so it makes things worse. Conclusion: the bake's zenith chromaticity uses
standard Bruneton coefficients and needs a deliberate authoring decision, plus the
dead grade pass above. castR is a full-frame number driven mostly by
`lightColor 0xffb478` / aerialLow on the ROAD, not by the sky strip.

Siblings checked, none worse: boost-blur improved to zenith 55/64/92 sat 0.407
B/R 1.68 (inside reference range); daytime-downtown A/B new-term off vs on
110/118/126 -> 108/117/125; wet-night-asphalt 31/36/49 -> 30/35/48 sat 0.36 -> 0.381.

### CRASH r6 RESULT — the overshoot is corrected; debris now flies WITH the wreck

Changed `crash.js` only:
- `:1663-1685` retire/ground branch now gated on `it.age > it.air && shellDown()`.
  `air` stays a stall timer but only starts grounding pieces once the shell is down.
- `:1626-1632` new `shellDown()` (`asleep || restBlend > 0.55`).
- `:994` `MASS.heavy.air` 1.9-2.9 -> 3.8-5.4 s so a heavy chunk outlasts the tumble.
- `:1587-1622` secondary shed bursts in the contact/scrape handler: each ground
  contact spawns mech + glass (plus panels on hard hits), thrown up and back along
  the slide, rate-limited on CONTACT time (0.08 s after a hard impulse, else 0.22 s),
  stopping once `shellDown()`. New `shedClock` (`:852`, reset `:1363`, `:2180`).
- `:1123-1125` mech base x2 (long axis capped 1.30); `:1136-1140` glass base x4.
- `:1405-1417` crashbreaker fountain speeds raised (mech 7.2->13, panels 6.0->11.5)
  so fountain flight time matches the arc the blast throws the shell on; glass
  6.6->9.0 (12 threw light chips 12 m up).
- `:2103-2122` added `crash.rest` / `crash.debris` getters for probing.

PROBED at the shot instant (t 3.94 s, tReal 9.5, timeScale 0.671) — rendered values:
- Wreck `asleep:false, restBlend:0`, speed 9.6 m/s, y 2.86 m — genuinely mid-tumble.
- Live 370 (90 panel / 126 mech / 154 glass). **Airborne 188 = 51%** (39/57/92),
  airborne y p50 1.9-2.6 m, p90 4.2-4.7 m, max 8.3 m — co-located with the shell,
  not hanging above frame.
- **Stretch: 252 pieces with k>1.05, k median 2.1, max 2.5** (vMax 8.6-10.8 m/s), so
  nothing in flight is razor-sharp any more. This was the actual complaint.
- Base instance size cm (un-stretched): panel 5.1-24.2 p50 13.0; mech 4.8-20.8
  p50 10.2; glass 3.7-15.7 p50 6.6.

Both r4's "90/128 stuck airborne forever" and r5's "0/256 able to fly" are now
avoided: pieces fly while the wreck flies and settle when it settles.
UNFIXED (carry to the r6 critic, do not treat as new): mech p50 10.2 and glass p50
6.6 sit at the LOW end of their 8-25 / 4-12 cm bands rather than mid-band; both have
a small sub-band tail from the light class. Dust plume untouched, as scoped.

### ENVIRONMENT r10 RESULT — mirrored signs FIXED, but the diagnosed root cause was WRONG

**The r9 critic's root cause (undisambiguated frontage normals at world.js:1470) was
not it.** The builder verified analytically AND by A/B that both frontage generators
already emit outward `ry` — the dot-product test is a no-op there. The real cause was
**blade signs**: `world.js:1737` and `:1758` hang panels PERPENDICULAR to the wall
(`f.ry +/- PI/2`), so the camera sees roughly half of them from behind, and
`side: DoubleSide` drew the back face — the artwork reversed. Same for overhead gantry
boards passed under in the reverse direction. The tall narrow blades are exactly the
"ARAGAV" banner and the flipped "FAIRMONT GARAGE" board the critic spotted.

Changes, all in `world.js`:
- `:1440` new `canonFrontage()` — dots candidate normal against (building centre ->
  wall centre), flips `ry` by PI when negative; applied at `:1507` (towers) and
  `:1561` (street wall). Confirmed a NO-OP today, kept because it locks the invariant.
- `:1605` `side: THREE.FrontSide`; `:1610` `shadowSide` kept `DoubleSide`.
- `:1639` new `panelPair()` — two real FrontSide panels back to back with different
  variants, used by blades (`:1737`, `:1758`), gantry boards (`both: true`) and rooftop
  billboards. Both faces now read forwards, which is how real double-faced signage is
  actually built.
- `:1583` `SIGN_CAP` 340 -> 1000. **This was a latent trap: `push()` silently drops
  past the cap, so the doubled panels would have vanished.** Verified 0/12 meshes at cap.
- `:434` `signCols`, `:551` `bgs` pushed to near-primary; `fg` light-ground test updated
  for the new yellow; storefront merchandise alpha 0.22-0.52 -> 0.36-0.74.

VERIFIED (`lint ok`):
- 31 legible panels inspected at 2.6-7x zoom across daytime-downtown,
  wet-night-asphalt and dusk-highway-chase: **all 31 read forwards, zero reversed**
  (PARAGON TATTOO x3, KINGSLEY LIQUOR, FAIRMONT GARAGE, BARBER, 1948, COURT,
  GOLDSTAR x2, ORIO/TYRES/OPEN 24 HRS, EAST BAY x4, PARADISE AVE). The highway gantry
  backs, previously mirrored, now read EAST BAY / PARADISE AVE / EAST BAY.
- Nothing vanished: **3691 panels before -> 6708 after** (3722 sign objects, 2986 now
  double-faced).
- Same-window A/B: Sobel 17.54 -> 19.16, sat 0.358 -> 0.351. Absolute in
  `shots/environment-r10-build.png`: Sobel 19.16, sat 0.351.

UNFIXED: sat 0.351 vs the 0.50 target. Signage palette alone buys only ~+0.012 — the
measurement band is dominated by MASONRY, not signs. Tested `PAINT_CHANCE` 0.44->0.58:
sat 0.362 but Sobel fell to 18.90, below the floor, so it was reverted. Reaching 0.50
needs a saturated facade-paint palette AND a Sobel budget to spend. **Note this may be
partly the dead grade pass (see cross-cutting block above) — re-measure sat AFTER the
grade fix before briefing a facade-palette round.**
Also pre-existing, left alone: `signFrame` (5000), `awnMesh` (9000) and `braceMesh` are
at their caps so some frames/awnings are silently dropped; raising them measured
neutral-to-negative on both metrics.

**MEASUREMENT CAVEAT the builder raised, and it is correct: other builders were writing
sky.js / post.js / road.js throughout this wave, so cross-run ABSOLUTE numbers drift
+/-1.5 Sobel. Only same-window A/Bs are trustworthy. This is a general hazard of the
parallel-builder model — Wave G critics run with NO builders active, so their absolutes
are the ones to trust.**

### CAR-PAINT r9 RESULT — the sky/ground band split LANDED, modulation on target

Changed `car.js` only:
- `:305-307` real vertex crown on the flank: `d(t) = A*sin(2*pi*t)`, zero at the rocker
  seam and shoulder crease, bulge low / undercut high. `A = 31 mm` on a 1.55 m
  (one-door) wavelength; flank sample count 10 -> 20 so `computeVertexNormals`
  resolves the cycle.
- `:1381`, `:1428` `clearcoatRoughness 0.018 -> 0.090` (basecoat and livery gloss-matched).
- `:1393` `normalScale 0.28 -> 0.95`; `:1404` `flakeFloor 0.05 -> 0.50`,
  `flakeMip 0.55 -> 0.12`; `:601` `FLAKE_RGH 0.70 -> 0.22`.
- `crushRigids` array, its four pushes and the returned key left intact
  (`:1715-1789`, `:1990`) — confirmed.

| metric | r8 | r9 | target | ref-03 |
|---|---|---|---|---|
| flank mean L | 46.8 | 46.1 | 46.8-64 | 64.1 |
| **modulation p90-p50** | 6.2 | **21.6 IN BAND** | 21-23 | 22.6 |
| spec:diffuse | 3.01 | 3.26 | <4.3 | 1.39 |
| highlight FWHM | 7 px | 15 px | 18-22 | 22 |
| grain RMS % | 4.84 | 5.9 / 7.0 | 9-18 | 9.35 |

**Vertical profile is now NON-MONOTONIC** — 87 -> 56 -> 44 -> 42 -> 44 -> 49 -> 72 -> 112,
where r8 was a flat 54 -> 42 slide. Shoulder highlight, dip, mid dip, then the swept
ground/sky band low on the flank. This was the whole ask.

UNFIXED / carry to the r9 critic:
- Grain RMS ~7% vs the 9-18% band. **The builder's diagnosis is worth keeping: the
  metric on our clean PNG is dominated by 1.5 px dither, while the reference residual
  has a 21-24 px period (JPEG-scale mottle). The two are not measuring the same thing.**
  A critic should not push this number without first matching spatial scale.
- Highlight FWHM 15 px vs 18-22.
- **`A = 31 mm` is 2.5x a real stamping crown — an admitted hack.** 12 mm measured
  almost nothing because the prefiltered env probe has no hard horizon left. Commented
  in-file. Bring it down if probe resolution ever improves.

Renders confirmed at distance (`shots/car-r9-dusk.png`, `car-r9-daytime.png`): no flake
boiling, no new highlight clipping.

**CONCURRENCY EVIDENCE: this builder had two renders fail mid-run on transient syntax
errors in `sky.js` / `boost.js` caused by OTHER builders mid-edit, and had to retry after
`lint ok`. Combined with the environment builder's +/-1.5 Sobel absolute-number drift,
this is the cost of the parallel-builder model. It is acceptable for BUILDERS (they
retry) but is exactly why CRITICS must run with zero builders active.**

### BOOST r6 RESULT — jet divergence 53 deg -> 0.48 deg, and the real cause was PERSPECTIVE

**Key insight the builder found that the critic missed: `JET_SPLAY` was not the bulk of
the problem. A purely astern jet from an offset pipe PROJECTS raked at
`atan(xPipe / (camY - pipeY))` ~= 17 deg regardless of jet length.** So deleting the
splay alone would have left ~34 deg of the 53. The fix solves a small INBOARD rake that
cancels the chase cam's perspective divergence, in pixels, by secant iteration against
the live camera.

Measured by PCA on the isolated flame mask: left **-0.64 deg**, right **-0.16 deg** off
screen-vertical — divergence **0.48 deg** (was 53; reference boost-blur-01 is 1.5 deg
apart). Elongation 3.1/3.6, bbox 237x131 / 236x111 px. Neither jet touches the tarmac
plane (droop 1.1 deg over 1.75 m keeps it at y=0.33 m) and neither leaves frame.

Changes, all `boost.js`:
- `:290-311` new axis doctrine + `JET_DROOP` 0.040->0.020, `JET_RAKE_MAX`,
  `JET_RELAX_EFF`, `JET_STEPS` 64->96. `JET_SPLAY` (0.17 rad outboard) DELETED;
  `uPipe` +/-0.50 is now ORIGIN only (`:700`).
- `:800-889` new `solveRake()` / `projPx()`, wired at `:1060`.
- Core: `:1056-1057` `uCoreLen = jetLen*0.12` (was a fixed 0.30 m never rescaled, so it
  drifted to 0.20-0.35 of length), `uCoreW = uWide*0.42` (was 0.24, i.e. wider than the
  plume). `:412` `cThroat` tinted cyan-lime, filament 16x tinted instead of hueless white
  + `cWhite`; `ampC` 6.0; knee `:547` 0.035->0.18 (asymptote 29->5.6) — that knee is what
  stopped the body plateauing hueless.
- Smoke tail `:449, :481-492`: body necks then a `smokeR` re-flare; orange moved to a
  station (0.44-0.68) handing to `cSmoke` olive by 0.92; `ampP` keeps a 0.38 floor to
  u=1. Plume now ends in a broad dim olive fan.
- Stipple `:369, :455-470`: R2/Roberts dither replaces white-noise `ign` for the march
  offset, and azimuthal turbulence terms fade by `azFade` where `atan2` is
  ill-conditioned near the axis — that aliasing WAS the tail stipple.
- `:1051` `uWide` 0.11-0.27 -> 0.09-0.17; `:1149` `setBoostGlow` 0.07->0.035.

**Depth gate NOT regressed** — `tools/_boostkernel.mjs` output is byte-identical to r5:
sky 2.4-2.7 px (300 m), viaduct 5.9-9.8 (73-112 m), tarmac 49.6-52.2 (3.5-14 m),
`uDepthOn=1`.

The builder independently hit the concurrency contamination (road/world/sky/car/scenes all
rewritten under it mid-run, moving hpRms in every band) and worked around it by adding a
**passthrough control (`uDebug=2`, tonemap intact)** to separate content from kernel:

| band | content only | pass on | kernel delta | r5 |
|---|---|---|---|---|
| sky-UL / UR | 9.4 / 1.7 | 10.4 / 14.3 | +1.0 / +12.6* | 4.2 / 10.9 |
| mid-city / viaduct | 2.9 / 3.3 | 5.8 / 5.9 | +2.9 / +2.6 | 6.2 / 17.8 |
| near lane line | 5.8 | 45.1 | +39.3 | 29.5 |

Monotonic. *sky-UR's excess is the 260 px speed-line `max()` ray riding the `velo` 0.05
floor over a near-noiseless patch (hpRms 0.22); it was present at r5 (10.9) and the kernel
there is 2.7 px, so it PREDATES this round. Flagged as the one thing left unfixed.

**FOR THE r6 CRITIC — check absolute alignment, not just divergence.** Our jets now sit
~0.4 deg off SCREEN-VERTICAL while reference boost-blur-01's sit at 18.0 / 19.5 deg off
screen-vertical (both tilted the same way, 1.5 deg apart). That is consistent with the
reference car being slightly yawed relative to its camera while ours is straight, so it is
probably correct — but verify the jets track the CAR'S longitudinal axis under steer/yaw
rather than being pinned to screen-vertical.

### DAMAGE r6 RESULT — floating props FIXED, plus a real coordinate-frame bug found

All edits in `damage.js` only; `lint ok`.
- `:1381-1424` `rigidRest`: built from `car.crushRigids` (guarded — missing/empty/
  non-shell-child nodes skipped), **then extended by any other direct shell child forward
  of `Z_FBUMP-0.30`, which catches 5 grille slats and 2 brake ducts that car.js does not
  publish — 12 nodes total, not 4.** Each entry caches rest position, rest `rotation.x`, a
  weld-binding cloud (radius 0.42 m, inverse-square weights), its leading-face z and its
  rest lead over that cloud.
- `:1469-1509` `applyCrushToRigids()`: **props are driven by the weighted mean
  displacement of their bound welds (`wCrush + wDisp`), NOT by `crushZ` alone** — the
  buckle field dents the nose another 100-200 mm past the crush map, so a crushZ-only prop
  punched OUT through the skin (measured -0.14 m). Pitch comes from the fold gradient
  `-d(uy)/dz` fitted over the same cloud, clamped. The shear term `d(uz)/dy` is
  deliberately UNUSED (it is compression, not rotation, and pitched the splitter 26 deg
  nose-up). A lead clamp (+/-0.05 m) pins each prop's face to the leading edge of its cloud.
- Called from `writePositions()` (`:1732`) so impacts re-pose props; restored in
  `reset()` (`:2340`).

Prop-to-skin gap, m (+ = tucked behind skin; rest values 0.03 / 0.065 / 0.121 / 0.121):
- 0.40: splitter 0.010, grille 0.078, lampL 0.065, lampR 0.070
- 0.70: 0.015 / 0.058 / 0.061 / 0.067
- 0.95: 0.017 / 0.093 / 0.025 / 0.057
**No negative (protruding) and no floating gap at any level.** Splitter pitch reaches
15.6 deg nose-down at 0.95.

Length lost 0.283 / 0.641 / 0.755 m at 0.4/0.7/0.95. **Not a regression** — the builder
took a probe run BEFORE its edit and got identical numbers; the ~0.02 m difference from
the r5 baseline (0.300/0.660/0.783) is a metric difference (bodyMesh z-extent only).

SECONDARY ALSO FIXED — **a real bug, and the reason the r5 critic saw a "deleted" wheel:**
`spawnLoose` used car-local coords in `looseRoot`'s frame, and the car sits 325 m from that
origin, so every loose piece landed a block away; additionally the hub spawn y 0.29 is
below the 0.365 tyre radius, so `stepBody` ground-damped it to a stop on step one. Added
`toLooseFrame()` (`:893`, transforms point, velocity AND rest attitude) and a spawn lift
(`:921`). The torn wheel now lies leaning at car-local (1.28, 0.37, 1.38) with its shadow,
and mirror caps / shards land beside the wreck.

UNFIXED, carry forward: paint/chip mask blotches (read as primer decals) and the sparse
glass web (vs crash-cam-03's dense radial spiderweb with caustic sparkle). Both untouched.

### AUDIO r9 RESULT — the inverted tail slope is FIXED, all targets met

All edits confined to `audio.js`'s `crash()`. `lint ok`.
- `:1305-1330` new `tail` gain feeding two cascaded 2-pole lowpasses sweeping
  **9 kHz -> 1000 Hz over 1.5 s**. The ring bank, debris shower, late creaks, low body bed
  and 700 Hz continuation route through it; the transient, metal grains, glass shards, HF
  splashes and dry sample stay DIRECT so the attack keeps its peak and bandwidth.
- `:1341-1356` `MODES` rebuilt: sub modes added at 34/45/68/96/122 Hz (t60 1.4-2.3,
  staggered 60-140 ms late so they don't stack on the sample peak); 163 and 349 up ~10 dB;
  188 and 274 lengthened to 2.2/2.1 s; 406-1980 trimmed ~3 dB and lengthened slightly.
- `:1365-1372` low-Q (2.5-5) plus `noise: 0.86` on the 130-420 Hz modes to fill the comb.
- `:1404-1418` the two culprit settle beds cut 2.0 -> 0.70 s and 2.4 -> 0.55 s; added
  direct short 6 kHz and 13 kHz splashes and a wide 210 Hz body bed through `tail`.

| metric | r8 | r9 | ref-02 | ref-01 |
|---|---|---|---|---|
| T60 63 Hz | 0.91 | 1.96 | 2.16 | 2.29 |
| T60 250 Hz | 1.32 | 2.04 | 2.12 | 3.35 |
| T60 2k | 4.64 | 1.49 | 1.79 | 8.91 |
| T60 8k | 4.81 | 2.01 | 1.16 | 5.10 |
| **8k/63 ratio** | **5.3x** | **1.03x IN RANGE** | 0.54x | 2.2x |
| sub-120 share | 4.3% | **18.1%** | 20.1% | 2.3% |
| T60 broadband | 2.36 | 1.92 | 1.84 | 6.74 |
| centroid | 2951 | 2490 | 3106 | 2214 |
| 32-band err vs ref-02 | 3.5 / max 15.5 | **2.7 / max 8.0** | - | - |

Slope inversion fixed, sub-bass share up 4.2x, band error IMPROVED rather than regressed,
T60 in range, peak 0.998 (no clipping). Engine/boost/squeal band errors unchanged, as scoped.

UNFIXED: centroid 616 Hz under ref-02 (but 276 OVER ref-01); 4-15 kHz still 3-6 dB low
relative to ref-02; crest 20.3 vs 15.1.

### !!! TOOL BUG FOUND — `tools/_audio-verify.mjs` REPORTS A FALSE FAIL !!!

It prints `RESULT: FAIL` for a reason that has nothing to do with the audio: it navigates
from `#...&shot=1` to `#...`, a **hash-only change that Chromium does not reload**, so its
"live-mode" probe re-reads the shot-mode no-op object and reports 0 decoded samples.
Pre-existing harness bug, not reachable from `crash()`, left alone by the builder.
**Do NOT let a future round treat this FAIL as an audio regression.** Fix the tool by
forcing a reload (or a fresh page) between the two hash states before trusting it again.

### ROAD r9 RESULT — transverse banding and grain floor BOTH essentially on target

`lint ok`. Only `road.js` touched.

New **anisotropic groove field** (`road.js:161-206` `grooveField()`, wired `:229-236`):
5 wrapping lattice octaves, cells 5x wider ACROSS-road than along-road, along-road
wavelengths 0.67/0.31/0.15/0.073 m. Coherent over metres across the road, so it BANDS
instead of aliasing the way the old per-chip hash did.

Routed into roughness as crown-polish-only (`:257`), height (`:290`, POM + waterline pool
in the troughs), the normal (`:283-299`), and — the key move — **its own signed slope in
the normal-map ALPHA (`:300`), so the shader can separate groove from chip.** That buys it
a groove-specific path surviving the water flattening (`:984`), its own mirror-ray
displacement budget (`:1101`), and its own distance retire (`:1197`, 30-120 m) independent
of the chip's 14 m retire. Mip filtering of the alpha fades it toward flat automatically —
no far-field shimmer.

Per brief: wet chop ceiling 0.20 -> 0.55 (`:1184`), `water*depthN` knit-back DELETED,
`blurLen` and vertical tap offset cut 40% (`:1119`, `:1134`). Grain raised via wider cavity
albedo swing (`:925`), near-field normal boost 1.55 -> 1.95 (`:970`), `rghD` in wetRough
(`:1031`).
The bar cut is **renormalised** (`:1208`, gain folded inside the retire mix) because a
groove REDISTRIBUTES the mirror rather than absorbing it; the one-sided cut cost a third of
a stop of near-road brightness and flattened the bars into uniform dimming.

| metric | r8 | r9 | ref-01 |
|---|---|---|---|
| **transverse ratio, road-only** | 1.47:1 | **3.82:1** | 3.89:1 |
| same, default region | 1.50:1 | **2.04:1** | 2.39:1 |
| **dark-40% HP RMS, lum-norm** | 3.16 | **7.16** | 7.22 |
| rowBandRel / colBandRel (abs) | .0081/.0056 | **.0343/.0090** | .0355/.0091 |

Dry regression check: daytime-downtown mean 95.4 and dusk-highway 21.6 vs 94.1/21.9 with
the groove zeroed — brightness-neutral, grain +25%.

UNFIXED / corrections to the record:
- **The brief's streak-length metric (18/16 -> 9 px) does not reproduce with ANY tool in
  `tools/`.** `_smearmeas.mjs` on the same road region gives max-correlation axis
  10 deg -> 5 deg and anisotropy 3.60 -> 5.47 vs ref 5.18, with vertical footprint 1.4 px
  vs ref 2.0 — i.e. the vertical smear is now AT OR BELOW reference. Treat the old
  streak-length figure as unsourced and use the anisotropy numbers instead.
- Absolute road luminance still 60 vs ref 98. **That is scene exposure, outside road.js** —
  do not brief road for it. Likely interacts with the dead grade pass above.
- **The orchestrator's own step-1 wording was self-contradictory** and the builder was
  right to flag it: "stretch the height field along-road so its gradient lives cross-road"
  contradicts the same brief's physics ("ridges foreshorten into horizontal dashes") and
  contradicts the row/col metric. The builder implemented the version that matches the
  REFERENCE MEASUREMENT and hit 3.82 vs 3.89. Lesson: state the target metric, not the
  mechanism, when the two might disagree.

### GRADE/TONEMAP SPLIT — DONE AND VERIFIED (session 7, 02:0x). DO NOT REDO OR RE-OPEN.

Step 0 of the session-7 next-action list is COMPLETE. The per-preset grade is now
live on the default ACES path. What changed, all three edits orchestrator-owned:

- `post.js` — `AgxOutputPass` renamed `GradedOutputPass(mode)`. `OUTPUT_FRAG` now
  carries BOTH tonemappers: AgX under `#define TONE_AGX`, otherwise a transcription
  of three's `ACESFilmicToneMapping` (`acesFilmic()`, with the `/0.6` input scale and
  exposure folded in exactly as three does it). The grade block — preset saturation,
  highlight desat, S-curve contrast, lifted black, ordered dither — is BELOW the
  `#ifdef` and therefore runs on both paths. `createOutputPass(mode)` takes the mode.
- `main.js` — `createOutputPass(toneMode)` unconditionally; stock `OutputPass` import
  deleted; `renderer.toneMapping = THREE.NoToneMapping` always (nothing reads it now;
  `toneMappingExposure` is still live and still carries the preset exposure).
- `tools/shot.mjs` — new `--hash` passthrough, e.g. `--hash tone=agx`, so the AgX A/B
  no longer needs a code edit.

VERIFIED, not claimed, by a four-way render of dusk-highway-chase:
1. **Transcription parity is exact.** Stock `OutputPass` vs the new pass with the
   grade neutralised (`sky.toneGrade`/`toneLift` zeroed in-page, then re-rendered)
   agree to within dither noise on every `_px.mjs` region: zenith 84.9,91.9,121.6 in
   both; nearRoad p01 9.1 both; full p50 90.8 vs 90.9. The ACES path did not shift.
2. **The grade is now doing work.** Graded vs neutral on the same frame: zenith sat
   0.302 -> 0.376, horizon sat 0.310 -> 0.384, nearRoad p01 9.1 -> 25.9, `<16` 19.6%
   -> 0%. That is dusk's authored `sat: 1.32` + `lift: [0.006,0.008,0.015]` finally
   reaching the screen. Note lift is applied BEFORE the sRGB encode, so 0.006 linear
   lands near 19/255 — the blacks-lifted look is authored, not a bug.

CONSEQUENCE FOR WAVE G: **every pre-02:00 measurement of ours is off the old chain
and is void as a target.** Critics must RE-MEASURE our shots, and must NOT report
low saturation as a per-piece failure without first checking it against the new
graded chain. Reference numbers are unaffected. Also note `shots/*-r6.png` and
earlier for dusk are additionally stale because sky r9 landed at 01:37.

Re-rendered all seven scenes on the new chain to `shots/<sceneId>-r7.png`.

### WAVE G CRITIC SWEEP IN FLIGHT (launched ~02:10, ten critics, ZERO builders)

One fresh critic per piece. Every one was told the display chain changed at 02:00,
that all pre-02:00 measurements of ours are void, and to RE-MEASURE rather than
trust any number it was handed. All standing constraints were re-issued: no AgX,
damage renders only via `tools/damage-shot.mjs`, audio uses `ours-squeal.wav` and
must not trust `_audio-verify.mjs`, environment re-runs `shadow-ab.mjs` itself,
`wet-night-asphalt-01` is the bar, any headline ratio must name its reference file
and region args, chase-camera's contact line is off-limits, crash's dust plume is
off-limits, boost's depth gate is off-limits.

| piece | round judged | scene / harness | shot it writes |
|---|---|---|---|
| sky-lighting | r9 | dusk-highway-chase | shots/sky-lighting-r9.png |
| road-surface | r9 | wet-night-asphalt | shots/road-surface-r9.png |
| car-paint | r9 | car-paint-closeup | shots/car-paint-r9.png |
| environment | r10 | daytime-downtown + own shadow-ab A/B | shots/environment-r10.png |
| chase-camera | r6 | dusk-highway-chase, `_cammeas.js` via probe | shots/chase-camera-r6.png |
| boost-fx | r6 | boost-blur | shots/boost-fx-r6.png |
| crash-cam | r6 | crash-cam | shots/crash-cam-r6.png |
| damage-model | r6 | **tools/damage-shot.mjs** at 0.4/0.7/0.95 | shots/damage-model-r6.png |
| audio | r9 | audio-* harnesses, reuse don't rewrite | (no shot) |
| hud | r6 | hud-overlay | shots/hud-r6.png |

If this session died mid-sweep: check which `shots/<piece>-r<N>.png` above exist
and relaunch ONLY the missing critics with the same brief.

### WAVE G VERDICTS — all nine collected so far are `real wins`. THESE ARE THE WAVE H BRIEFS.

All measured on the post-02:00 graded chain. Each critic re-measured; where a
builder claim was overturned it is flagged.

**sky r9 -> sky.js.** GAP: the whole dome is red-biased and reads lavender-mauve
where every reference reads teal-cyan. Zenith linear G/R: ours 1.54 vs ref-01 2.86,
ref-03 2.29, ref-04 3.15 (`_px.mjs --region e00=0.55,0.80,0.01,0.06`, refs use their
own sky columns). Green-excess `G-(R+B)/2` is sign-flipped at EVERY elevation band
(ours -13.2/-13.1/-13.1/-11.7 vs ref-01 +20.0/+26.3/+32.8), so it is flat with
elevation and therefore NOT the Mie halo, which falls as exp(-h*6). Cause: the
Chappuis cross-section at `sky.js:222` is `vec3(0.650, 1.881, 0.085)e-3` — green
absorbed 2.9x harder than red — and at `sunElevation: -0.9` the ozone tent has
~1000 km of slant path to strip exactly the green the refs keep. Pure Rayleigh
`betaR` is already G/R 2.34, in band; the ozone tent is what drags it to 1.54.
FIX: re-project `sky.js:222` so RED is the dominant absorber, ~`vec3(1.90, 1.35,
0.09)e-3`, then re-derive the dusk `ozone` scalar at `sky.js:719` to land zenith
G/R in 2.3-3.1. **Do NOT just raise `ozone` — with the current ordering that
deepens the mauve.**

**road r9 -> road.js.** Transverse ratio is now 3.45:1 vs ref-01 3.89:1 and smear
is on target (5.7 px @5 deg vs ref 8.0 px, aniso 5.11 vs 5.18) — the r9 anisotropy
work LANDED. But the builder's claimed 3.82 is void: the live grade halved the
absolute band amplitude, so we sit at 55% of reference. GAP: **our micro-relief is
illumination-coupled** — grain exists only where a bright reflection lands, so
unlit tarmac is a smooth plane. Dark/bright sub-region hfRmsNorm: ref-01 10.89/11.48
= 0.95, ours 7.76/11.38 = 0.68. Our LIT road is dead on (11.38 vs 11.48); our unlit
road carries 29% less grain. FIX: `road.js:1064` cuts indirectSpecular to 0.17 in
water and `:1067` cuts indirectDiffuse to 0.42, then `:912-913` fades microAO by up
to 34% under uWet, so all surviving grain rides the planar mirror at `:1222`. Drop
the uWet fade on microAO at `:913` and re-apply it squared AFTER the wet
attenuations in the AO_FRAG block (`:1049-1064`); separately raise the groove-field
normal amplitude feeding `mapN` (`:970`) ~1.8x to recover the band amplitude the
grade removed.

**car-paint r9 -> car.js.** The sky/ground band split SURVIVED and is if anything
over-delivered (ours 2.91x upper-flank-to-rocker vs ref-03 1.63x) — not the gap.
GAP: **glass layering** — our greenhouse is one flat dark plane with no outer-surface
sky reflection. In-pane p05/p99: ours 22.2/101.7 (range 79.5), ref-04 windscreen
8.8/227.9 (range 219.1), ref-03 side window 18.0/226.0 (range 208.0). We carry 36-38%
of reference in-pane dynamic range and our ceiling is 2.2x too low. FIX: `car.js:1445-1452`
kills the base dielectric lobe with `roughness: 1.0`, leaving only the clearcoat lobe
at envMapIntensity 1.6. Drop base roughness to 0.05-0.10 and keep `grime` as the
roughnessMap modulating that low floor, raise the glass probe gain toward 2.6-3.0,
and pull `clearcoat` down to ~0.4 at `car.js:1447` so there is one strong mirror lobe
not two stacked (that is the guard against the old blown-canopy failure).
SECOND-ORDER, next round not this one: flake grainPeriodPx 13.6 vs ref 5.0 — 2.7x too
coarse, blobby rather than sparkly.

**environment r10 -> world.js.** Mirrored signs CONFIRMED FIXED (text reads forward
at all depths: "PARAGON TATTOO", "TROLLEY LIQUOR", "GARAGE", "EAST BAY"). Shadows
re-confirmed alive by the critic's own `shadow-ab.mjs` run (road MAD 15.61, facade
15.82, meanOn 90.32 vs meanOff 102.95). GAP: **the street-level band is empty** — no
traffic in the lanes and almost no kerb furniture, so the canyon floor is a bare grey
trough. `_facademeas.mjs --band 0.40,0.62 --normw 1920`: ours sobel 12.15 / strong
12.2% vs ref-01 32.76/36.4%, ref-02 20.98/19.0%, ref-03 19.56/20.5% — 62% of the
WEAKEST reference. Control at `--band 0.00,0.25` proves it is localised, not global:
ours 20.48/23.7% BEATS ref-02 (14.45/14.5%) and ref-03 (11.33/9.9%). Upper facades
ship; the ground floor does not. FIX: `world.js:2164-2176` runs the parked-car loops
only along the cross-street grid `G` and then discards most with the junction cull
`Math.abs(((x+1000)%160)-80) > 66`, stripping the whole boulevard the hero camera
looks down. Emit parked cars along both kerbs of every road segment at ~10-14 m
pitch with the cull narrowed to the junction box only; add a static queue of 3-5
stopped vehicles near each signal at `world.js:1980`; tighten street-furniture pitch
at `world.js:2125` from `rngRange(R, 4.6, 10.5)` to about `2.5, 5.5`.
SECOND-ORDER: facade sat 0.318 still under all four refs (0.373-0.556).

**boost r6 -> boost.js.** GAP: **the plume's radial density is a top-hat, not an
optically-thin volume** — it composites as a flat-topped opaque lime disc that hides
the underbody. An emissive volume seen end-on must give an Abel-transformed peaked
profile that ADDS to what is behind it; ours plateaus with hard shoulders and adds
nothing outside its silhouette. Transverse cut (`_crop.mjs`, band y 0.80-0.88):
interior flat to within 8% across 4 bins, half-max width 48 px, 10-90% edge ~11 px,
peak/background 8.1x, additive spill 0.5% of peak. Ref `boost-blur-04` same-role cut
(x 0.14:0.19, y 0.82:0.95, 26 bands): smooth peaked 90->171->90 with NO plateau,
peak/background 1.9x, and the tarmac still modulates THROUGH the flame body (per-band
max swings 121->207) — it is transparent. Aspect: ours 2.8:1, ref 6.5:1.
FIX: `boost.js:478-479` — `hardP` starts at 0.80 so `densP = smoothstep(radP,
radP*hardP, r)` gives a 20%-of-radius edge with a flat interior; replace with a
continuous Gaussian `exp(-k*(r/radP)^2)` and no flat core. Drop the root amplitude at
`boost.js:492` (`0.34 + 1.70*exp(-u*2.6)`) so the path integral peaks near 2x the
substrate, not 8x. Retune the 16x bloom filament at `boost.js:532`, currently a hard
~10 px white dot.
**BUILDER CLAIM OVERTURNED: `JET_RAKE_MAX` at `boost.js:302` is 0.20 (tan, ~11.3 deg),
NOT the claimed 0.48 deg — 20x looser than reported.** The jets do read parallel
in-frame, so this is a record correction, not necessarily a defect.
NOTE for a later round: our radial blur does not fall to zero at the focus (11.6 px
at the VP vs ref-02's 5.4 px).

**crash r6 -> crash.js (+ a one-line main.js wire the ORCHESTRATOR will make).**
Debris correction CONFIRMED HELD: the field flies with the wreck, there is a visible
secondary ground-contact cluster, and it is not over-budget. GAP: **the slow-mo
shutter mismatch does not exist** — the ground under the airborne wreck is SHARPER
than the wreck, so the frame reads as a paused physics sim, not a time-dilated crash
cam. `_smearmeas.mjs`: ref-01 tarmac under the launched car (`--patch 0.60,0.80,0.90,0.99`)
maxSmear 14.0 px @170 deg, aniso 12.41, while the airborne car flank
(`--patch 0.60,0.72,0.20,0.32`) is 3.0 px, aniso 1.47 — road streaks 4.7x longer than
the subject. Ours inverts it at 0.77x: tarmac at wreck depth 2.7 px, wreck body 3.5 px.
FIX: drive the existing depth-gated multi-tap radial smear (`boost.js:191`, which
already has the soft hero hole) from crash time-dilation as well as boost, so shutter
length stays keyed to REAL pre-slam ground velocity while sim time slows. crash.js
publishes a `shutter01` derived from pre-impact speed and the inverse of the `slam`
dilation factor at `crash.js:795`; the orchestrator wires `main.js:226` to pass
`amount = max(s.boostBlend, crashShutter)`. **The crash builder must NOT edit main.js
or boost.js.**
SECOND-ORDER: shard sizes are near-single-class flat quads with hard white edges vs
ref-01's mixed irregular panel fragments; DOF is thin (ref-03 drops hpRms 12.41->4.51
between impact zone and foreground, ours only 15.14->11.56).

**damage r6 -> damage.js.** Prop fix CONFIRMED: the four `crushRigids` now sit 16-162
mm INSIDE the deformed skin at every level. Structural crush survives (0.641 m nose
loss at 0.7, 0.755 m at 0.95, rest 4.750 m, tail anchored at z=-2.375). GAP: **the
crushed front clip loses its paint entirely and renders as mirror-bright bare metal**,
so the deformed area reads as crumpled chrome foil. At level 0.7 the nose averages HSV
sat 0.233 with 32.3% of pixels below sat 0.18, against 0.662 / 5.1% on the undamaged
door — 35% colour retention. `crash-cam-04` does the opposite: crumpled red front
quarter 0.827 vs intact door 0.875, 94.5% retention, only 1.4% desaturated. Burnout
keeps the clearcoat glossy and coloured across the fold and puts abrasion in thin
streaks. Cause: crease curvature at `damage.js:2075` is normalised against a fixed
20 mm Laplacian, but the real crush is 0.641 m, so `cr` saturates to 1.0 across the
whole front clip, every hit clears the `wear >= 0.72` gate at `damage.js:1077`, and
the bare-metal branch writes metalness ~0.9 / roughness ~0.41 — a mirror, not steel.
FIX: normalise `cr` at `damage.js:2075` against a per-panel crush-relative scale, or
gate the bare-metal branch on a RIDGE detector (second derivative along the fold
tangent) rather than isotropic Laplacian magnitude, so only fold crests clear 0.72
and the dished field between folds keeps its paint. Then dull the exposed metal at
`damage.js:1083-1085`: roughness toward 0.65-0.75 (map ~180-190, not 105).

**audio r9 -> audio.js.** The r9 crash-tail claim VERIFIES independently: T60/oct is
monotonic downward 125 Hz->4 kHz (63:1.96 125:2.41 250:2.04 500:1.75 1k:1.58 2k:1.49
4k:1.46), broadband 1.92 s, band share 18.1/39.9/35.7/6.0% — a near-exact match to
`crash-impact-02.mp3` (1.84 s; 20.1/41.2/32.0/5.8%). GAP: **the tyre squeal has no
squeal band.** `_r8audio.mjs squeal` on `ours-squeal.wav` (1.5-3.5 s): b120_400 84.2%
/ b400_2k 12.6% / b2k_8k 3.0%, vs `tire-screech-01.mp3` 11.0/73.7/15.0 and
`tire-screech-02.mp3` 39.9/54.0. Control kills the "it's just the engine bed" defence:
`ours-idle.wav` with NO slip already reads b400_2k 11.0% — so slip 0 -> 0.95 buys just
+1.6 points. Formants: our strongest 300-8000 Hz peak is 360 Hz at 6.5 dB and the
strongest above 500 Hz is 1479 Hz at only 3.0 dB; ref-01 has 820 Hz at 7.1 dB plus
1896 Hz at 5.3 dB. FIX: `audio.js:778-779` runs the formants as `bandpass 1150 Q=18`
and `bandpass 2380 Q=22` — ~64 Hz and ~108 Hz of noise bandwidth, about -26 dB of the
source, which is why they vanish. Drop Q to 4-6, retune f1's base from `980+` (`:800`)
down to ~820 Hz, and rebalance `sqG` (`:799`) and the scrub gain (`:797`) so 400 Hz-2 kHz
carries at least half the tyre bus energy.
SECOND-ORDER: boost decay has no upward spectral sweep (ours static 1830->1900 Hz;
`boost-whoosh-01` sweeps 1928->2837 Hz with b2k_8k 9.3%->58.2%). Rival doppler -429
cents vs a textbook -560.

**hud r6 -> hud.js.** The r6 ingredients all landed (`flameTex` at `hud.js:98`, the
`destination-in` alpha cut at `hud.js:680`, core p99 253.5 vs ref 252.6). **The HUD is
confirmed NOT graded** — it is a separate 2D canvas DOM layer (`index.html:11-12`,
`main.js:100`) composited by the browser over `canvas#gl`, so the grade cannot reach a
HUD pixel; that hypothesis is structurally impossible, not merely unobserved. GAP:
**the bar's silhouette is ~2x softer than reference on every edge the additive halo
touches**, so it reads as a green glow sprite laid on the road. 10-90% transition
widths normalised to frame size: burn front ours 4.4% vs ref-03 2.1%, bottom rail 2.7%
vs 1.5%, top rail 2.6% vs 1.6% — but the LEFT CAP matches to within 8% (0.42% vs
0.39%), and that is what makes it conclusive: the left cap is the one edge not defined
by the blur stack, so this is not resolution, AA, or JPEG. Cause: `hud.js:703-711`
draws the crisp body FIRST with `source-over`, then piles the three `BOOST_BLOOM`
(`hud.js:53`) blurred copies on top with `lighter`; the 0.44*ih pass is a ~40 px blur
landing OVER the sharp silhouette. FIX: invert the composite order at `hud.js:702-714`
— run the `lighter` bloom passes first, then draw `F.c` `source-over` last so the crisp
silhouette is topmost — and drop the widest radius at `hud.js:53` from 0.44 to ~0.22.

### WAVE H BUILDERS IN FLIGHT (launched ~02:25, TEN builders, ONE PER FILE, zero critics)

  sky.js     -> sky r10     (re-project Chappuis so RED dominates, re-derive dusk ozone)
  road.js    -> road r10    (decouple microAO from uWet so grain survives unlit tarmac)
  car.js     -> car r10     (glass: kill roughness 1.0, one strong mirror lobe, probe gain up)
  world.js   -> env r11     (populate the street-level band: parked cars both kerbs, queues, furniture pitch)
  scenes.js  -> chase r7    (re-derive the reference depression band, then raise height ~1.80 -> ~2.17)
  boost.js   -> boost r7    (Gaussian radial density, no flat core, peak/bg 8.1x -> ~2x, retune filament)
  crash.js   -> crash r7    (publish `shutter01` off the slam dilation; widen shard size distribution)
  damage.js  -> damage r7   (ridge-gate the bare-metal branch so folds keep paint; dull torn steel)
  audio.js   -> audio r10   (squeal formants Q 18/22 -> 4-6, f1 to ~820 Hz, rebalance the tyre bus)
  hud.js     -> hud r7      (invert the bloom composite order, widest radius 0.44 -> ~0.22)

ORCHESTRATOR OWES ONE EDIT once crash r7 lands, and must NOT make it while builders run:
wire `main.js:226` to pass `amount = max(s.boostBlend, crashShutter)` where `crashShutter`
is the `shutter01` that crash.js now publishes. The crash builder was told explicitly not
to touch main.js or boost.js; without this wire its work is invisible.

### WAVE H RESULTS — ALL TEN BUILDERS REPORTED AND LANDED

Treat these as CLAIMS. Where a builder contradicted its own brief, that is recorded
because it is usually the most valuable thing it found.

**sky r10 (`sky.js`) — G/R in band, mauve gone.** `betaO()` Chappuis coefficient
`vec3(0.650, 1.881, 0.085)` -> `vec3(2.350, 1.000, 0.100)` (red now the dominant
absorber), and `zenithTau()`'s ozone column terms at `sky.js:1029` kept consistent
(`0.009750/0.028215/0.001275` -> `0.035250/0.015000/0.001500`). `ozone` scalars left
at 1.0 — the magnitude folded into the coefficient. Zenith G/R 1.40 -> **2.74** (refs
2.68/2.27/2.70, target band 2.3-3.1). Green-excess flipped sign at every band
(-13.2/-13.4/-14.3/-12.3 -> +1.9/+3.1/+2.5/+4.1). Other presets checked with a
same-minute A/B: daytime moves <=1.3/255, wet-night <=4.3/255.
CAVEATS THE BUILDER RAISED: (a) the brief's suggested `vec3(1.90,1.35,0.09)` measured
G/R 2.22, just under band — display-space G/R responds as ~`exp(0.26*delta)`, far
weaker than the slant path suggests, because ACES and the multiple-scatter term damp
it. (b) Green-excess is only +2 to +4 vs refs' +10 to +25; the residual is entirely
BLUE (our zenith 56.6,93.5,126.6 vs ref-01 58.7,95.6,100.4 — R and G now match within
2/255, B is +26). Driving blue down through ozone at an unphysical 16x moved B only
126.6 -> 119.4, so the zenith blue is in the Rayleigh/`ms`/`skyGain` chain, NOT the
ozone path. Do not chase it with an absorber. (c) NEW GAP INTRODUCED: mid-elevation is
now over-greened (e20 went 1.05, matching refs' 1.11-1.14, to 1.84) — our G/R falls
off with elevation too slowly, i.e. the vertical warm gradient toward the horizon is
too weak. One global coefficient cannot fix both.

**road r10 (`road.js`) — dark/bright grain ratio 0.715 -> ~0.92 (target 0.95).**
Five edits, all gated on `uWet`, so the dry path is algebraically unchanged.
Dark hfRmsNorm 8.17 -> 11.53, bright 11.43 -> 12.28, transverse ratio 3.48 -> 3.61
(ref 3.89), smear 5.8 -> 5.7 px (ref 8.0, unimproved).
**THE BRIEF'S STATED FIX WAS A NO-OP AND THE BUILDER PROVED WHY.** Applying the wet
attenuation "as a squared term after" is multiplication, which commutes — order
changes nothing; implemented literally it moved dark grain 8.17 -> 8.51. The real
mechanism, established by two diagnostic renders: (a) `microAO` alone measures hfRms
4.35 dark vs 4.13 bright, i.e. the chip field is IDENTICAL in both regions, so nothing
was being masked; (b) with `refl*k = 0` the dark region sits at mean 47.1 with hfRms
**0.57** — a literal plane — while the lit region holds 17.30. So 89% of dark-region
brightness was a flat ambient wash and `microAO` at ~2% display depth was far too
shallow to be the road's texture. The fix that worked is a deep ambient cavity term
(`cavD`, `road.js:1097-1099`) plus a ray-REDIRECTION grain (`gChipN`, snapshotted at
`:985-986`, applied as a chip-lens mirror perturbation at `:1150`), not reordered
attenuations. Also raised the groove bar term at `:1256` and the vertical tap at
`:1182`. Deepening `cavD` further BACKFIRES (it pushes ambient into the grade's lifted
black where it is crushed) — 0.38/1.28/0.85 is a measured optimum. Render noise on
this metric is real: an identical-code re-render gave 0.912 vs 0.939.

**car r10 (`car.js`) — glass in-pane range 38% -> 87% of reference.** Side window
p05/p50/p99 22.2/27.4/101.1 -> 22.2/61.7/203.8 (ref-03 18.0/51.8/226.0); windscreen
range 81.2 -> 186.7 (85% of ref-04). Achieved with a new `makeGlassWave(rng)`
quasi-periodic roller-wave normal map banded ACROSS the pane (`car.js:848-895`,
`normalScale 3.2`), `clearcoat 1.0 -> 0.4`, `opacity 0.80 -> 0.70`, `envMapIntensity
1.6 -> 9.0`. No blowout at dusk or wet-night. Band split and `crushRigids` untouched.
**THREE BRIEF CORRECTIONS, all load-bearing:** (a) `roughness: 1.0` was NOT killing the
base lobe — three multiplies `roughnessMap.g` in, and `makeGrime` paints a `#0a0a0a`
base authored `NoColorSpace`, so effective pane roughness has always been **0.039**.
Dropping base to 0.05-0.10 as briefed would have pushed the floor to 0.002 and ERASED
the grime layer. Left at 1.0, arithmetic documented in-file. (b) Probe gain alone does
nothing: 1.6 -> 3.0 moved p99 101.1 -> 102.4, and even a pure-white-mirror substitution
capped at p99 111. A FLAT pane cannot reach the reference at any gain — the missing
thing was outer specular SHAPE, not an outer specular layer. The briefed 2.6-3.0 gain
lands nowhere near target. (c) Running the wave along v (the literal "roller wave")
measured better than the final (p99 231) but RENDERED as corduroy — a caution that this
metric can be gamed.
NOT LANDED: windscreen grainRMSpct 12.9 vs ref 6.5 (band contrast ~2x too hot);
side-pane p50 61.7 vs 51.8; side-pane band period too coarse lengthwise.

**chase-camera r7 (`scenes.js`) — CONFIRMED the critic's direction, REFINED its numbers,
and RETIRED a standing "geometric limit".** The builder re-derived the references itself
at native resolution, using vanishing-point construction rather than eyeballed rows:
`dusk-highway-chase-02` horizon y539/49.93% (intersection of the two guardrail top
edges), roofline y624, contact y830 -> gap 7.85%, depression 0.292, contact 0.769.
`-03` horizon y1345/47.81% (from two equal-height streetlamps, cross-checked against
the far lamp bases), roofline y1590, contact y2166 -> gap 8.70%, depression 0.298,
contact 0.770. **CORRECTED TARGET BAND: gap 7.8-8.7%, depression 0.29-0.30, contact
0.769-0.771.** The Wave G critic's 0.296-0.333 was inflated because it compared a
roofline-measured "ours" against a topmost-point-measured "theirs" — on `-03` that
difference is the roof scoop, and measuring the scoop gives 0.243, which is exactly the
artifact that produced the ORIGINAL wrong 0.21-0.22 target.
CHANGE: `distance 9.0 -> 9.30`, `height 1.80 -> 2.10`. Result: depression **0.300**,
gap **8.28%**, contact **0.7697**, car height 19.32% roofline / 20.94% topmost, horizon
49.37%, fov unchanged. Every corrected target hit at once. An 18-cell sweep is recorded
in the comment at the changed line.
**THE "CONTACT LINE IS GEOMETRICALLY LOCKED AT 0.737" CLAIM IS RETIRED — it was only
locked with height held fixed.** Raising the camera pushes the car down frame without
touching `FRAME.pitchBase`, so contact lands on 0.7697 with the horizon still at 49.37%.
Delete that standing constraint; do not re-issue it.
FLAGGED: the other four chase scenes measure depression 0.180/0.222/0.257/0.216, well
under the corrected band. Their own references were not derived, so they were left
alone. Also `carWidthPct` 14.73% vs the 20-23% in `camera.js`'s note — our shell is
narrower than the refs', a car-model issue not a camera one. `wet-night-asphalt` reports
carWidthPct 86.57, which is garbage from some non-body mesh in the traverse; pre-existing.

**boost r7 (`boost.js`) — top-hat replaced with an Abel-consistent Gaussian pair.**
`boost.js:509` `hardP`/`smoothstep` -> `(exp(-4.20q²) + 0.30*exp(-0.30q²))/1.30`;
narrow term keeps the OLD half-max deliberately so this reshapes rather than fattens,
and the 3.7x-broader 23% term produces the spill. Root amplitude `:536` `(0.34 +
1.70exp(-2.6u))` -> `(0.055 + 0.170exp(-1.7u))` — 9x down, decay slowed because at 2.6
emission ended by u~0.5, which is what made aspect 2.8:1. Proxy march bound `:351,:381`
`uWide*2.0 -> *3.5` (required — the new outer wing was being scissored into a straight
cut). Throat `:563` Gaussian pair; filament `:590-593` now ADDED rather than multiplied
by densC (it was being squared into a point), ~17x dimmer and 2.8x wider; `ampC 6.00 ->
1.70`.
RESULT: interior monotone both flanks (no plateau), half-max 48 -> 32 px, additive spill
0.5% of peak -> elevated +5 to +14 L out to ±46 px, aspect 2.8:1 -> >6:1 (ref 6.5:1),
mid-plume band peak/background **1.84x vs ref-04's 1.9x**, and tarmac now visibly
modulates THROUGH the plume (per-column max 41->87 inside it).
CAVEATS: nozzle-band peak/background is 3.1x not 2x — that band straddles the nozzle
where every near-axis ray has its longest chord, so it is legitimately brightest;
forcing it to 2.0x drags the mid-plume to 1.4x, below reference. The nozzle core still
clips 255, verified NOT to be the filament (zeroing stage1 entirely still hits 255) —
it is the path integral under the existing soft knee, whose comment says the throat
reaching white is intended. **Run-to-run variance is ±6%** (three identical renders:
peak 86.2/92.3/82.7) because `uFlicker` and turbulence phase are time-driven — any
single-frame measurement of this scene carries that band. Boost legibility dropped a
lot; the single knob is the `0.055 + 0.170` at `:536` and the shape is independent of it.

**crash r7 (`crash.js`) — `crash.shutter01` published and verified; shard distribution
widened.** Getter at `crash.js:2148`, companion `crash.groundV` at `:2150`. Definition
(`:893-912`): `shutter01 = clamp((groundV/62) * (0.10/timeScale), 0, 1)` with groundV
seeded to pre-impact speed and bled at 1.35/s on WALL-CLOCK seconds so slow-mo depth
does not also stretch the memory. Measured curve: 0 with no crash, 0.100 at trigger,
0.187 at 0.04 s, **0.603 peak** at 0.075 s (dilation floor), 0.509 / 0.338 / 0.244 /
0.068 decaying, 0.004 at rest, then a correctly SMALLER second peak of 0.216 at the
crashbreaker slam (deeper dilation but much less ground velocity). Physics is right.
Shards: `:245` bent rectangle (6 verts, four right angles) -> irregular nine-sided plate
(11 verts, no parallel edges), still one instanced draw. `:1219-1230` panel sizing now
heavy-tailed — long axis p10 8.4 / p50 13.2 / p90 23.2 / max 40 cm with 8 fragments over
25 cm, aspect p50 1.55. `:1263-1269` glass x and z were literally the SAME draw, so all
150 wedges were one identical equilateral arrowhead; now three independent axes.
Instance counts unchanged (90/126/168).
**THE BUILDER FLAGGED THAT ITS OWN WORK WOULD BE INVISIBLE, AND IT WAS RIGHT** — see the
orchestrator edits below.

**damage r7 (`damage.js`) — crush-zone colour retention 43% -> ~68-73%.** Ridge detector
added: `wRidge` array (`:435`), crease normalisation `lap/0.020` -> `lap/(0.020 +
0.075*|wDisp+wCrush|)` (`:2149`, crush-relative), and a closed-form anisotropy
`rg = cr * (l1-l2)/(l1+l2)` from a scatter matrix of fall-away edge directions
(`:2152-2187`) — 1 on a fold line, 0 in a dish. Only 0.3% of touched welds now clear the
bare-metal gate (was effectively all). Bare metal decoupled from `wear` (`:1122-1133`),
roughness 105 -> **186** (0.41 -> 0.73) as directed.
**BRIEF CORRECTION, important: the stated mechanism was a MINORITY of the defect.** The
builder ran the control the brief did not — rendering with the damage overlay hidden
entirely gives nose sat 0.255 against a baseline of 0.240. So fixing the wear gate and
roughness exactly as directed moved the per-pixel number only 0.240 -> 0.256, inside
noise. The dominant desaturator was the BASE `car.js` clearcoat blowing to white on
sky-facing crumple lobes. The visible win came from a new "crazed clearcoat" pass
(`:1049-1080`) that splats the body colour over the moved field — NOT in the brief. If a
later round reverts that pass the number goes straight back to ~0.256. On painted sheet
specifically, band profile shows 84-100% retention; the aggregate shortfall is grille,
bumper aperture and shadow, which are not paint. Nose p99 luminance 224 -> 186, mirror gone.
DISCREPANCIES THE BUILDER COULD NOT RESOLVE: crush loss measures 0.2979/0.6636/0.7607 m
vs the brief's 0.641/0.755 — proven to predate its edits (reverting reproduces identical
numbers), so `car.js` concurrent edits are the likely cause. And it could not reproduce
the "props 16-162 mm inside the skin" figure (its own probe gives -112 to +73 mm), but
notes the nearest-vertex-normal metric is unreliable across a fold, so the METRIC may be
wrong rather than the props. A critic should re-run the original method.
NOT ATTEMPTED: glass spiderweb. Also flagged: a white blowout on the rocker behind the
front wheel is NOT damage paint (0.253 with the overlay hidden) — it is exposed
interior/underbody geometry, outside `damage.js`.

**audio r10 (`audio.js`) — the squeal now has a squeal band, and the boost sweep landed
too.** b400_2k 12.6% -> **62.1%** (refs 73.7 / 54.0), b120_400 84.2 -> 22.6, b2k_8k 3.0
-> 14.2, top peak above 500 Hz 1479 Hz @ 3.0 dB -> **826 Hz @ 6.9 dB** (ref-01 820 Hz @
7.1 dB). sub200Share 0.623 -> 0.167. Every band now sits between the two references.
Edits: `f1` `bandpass 1150 Q=18` -> `820 Q=5`, `f2` `2380 Q=22` -> `1860 Q=7`, new
`f2G = 0.32` gain stage, warb depths cut, `scrubG` lock term 0.26 -> 2.0, `sqG` 0.55 ->
8.0, both formant tracking curves retuned down. Crash tail UNCHANGED digit for digit —
survived. Boost: new `SWEEP_TC` contour integrated independently of the amplitude env,
centroid static 1830->1900 becomes **2081 -> 3016** (ref 1928 -> 2837), b2k_8k 10.9 ->
30.1% (ref-01 58.2%).
BRIEF CORRECTION: "rebalance" understated it by an order of magnitude. Q and retune
alone got b400_2k to only ~25%; the response is strongly sublinear because of the glue
compressor on `preMaster`, so reaching 62% needed ~15x on `sqG` and ~8x on scrub. Squeal
peak is now 0.4776 (was 0.1407) — under `CLIP_KNEE` 0.68 and under the crash's 0.926,
but it is a much louder event; flag if it reads over-hot. The second formant at 1860 Hz
is UNVERIFIED (all five peak slots are taken by the 820 Hz cluster). Boost b2k_8k
undershoots, but note the two boost references disagree completely — `boost-whoosh-02`
sweeps 254->558 Hz with essentially no 2-8k — so 58% is one reference's character, not a
consensus target.
`_audio-verify.mjs` re-confirmed as a FALSE FAIL: its page never constructs an
AudioContext at all (`hasCtx: false`), so its "0 decoded samples" is the harness failing
to start, not a decode regression.

**hud r7 (`hud.js`) — all four edges now inside the reference band.** Burn front 4.07%
-> **2.07%** (ref 2.16%), bottom rail 1.96% -> **1.58%** (ref 1.58%), top rail 2.94% ->
**1.77%** (ref 1.74%), left cap unchanged at 0.35% (ref 0.40%). Holds at 1280x800.
**THE BRIEF WAS ONLY PARTLY RIGHT AND THE BUILDER FOUND THE REAL CAUSE.** The composite
reorder plus the radius drop moved almost nothing on their own — top rail 2.94% ->
2.99%, and the burn front got WORSE (4.07% -> 5.08%). The blur stack was not what
softened those edges. Dumping the row/column profiles found three causes inside the mask
and body buffer: a vertical alpha ramp taking the body from opaque to nothing over a
quarter bar-height per rail; a tip dissolve spanning 0.98 bar-heights; and a colour ramp
spread over 1.05 bar-heights back from the front, so the front's 10-90 was being measured
INSIDE solid body. Fixed by making the solid core an inset silhouette (`:522,535-546,
579-583`), shrinking the tip dissolve (`:596-612`) and the cooling ramp (`:713`). The
reorder is still in and still correct — it is what lets the mask be sharpened without the
halo painting hardness back out — but it was not the cause.
Core still blown (bar-box p99 252.8 vs ref 253.1); border still jagged, visibly more so
now the halo no longer veils it.
BUILDER'S OWN JUDGEMENT CALL, flagged for re-litigation: reordering cost the bar the
green tint the widest bloom used to lay over its interior (sat 0.328 -> 0.191 vs ref
0.344). It recovered this with `ctx.filter = 'saturate(1.65)'` on the final body draw
plus a warmer filament, landing at 0.337 — a colour change outside the stated gap.

**environment r11 (`world.js`) — street band sobel 11.95 -> ~13.9 (target 19-21, NOT
reached), but two real bugs found and fixed.**
Changes: furniture pitch `:2156` `4.6,10.5` -> `2.5,5.5` with palm share cut `0.14 ->
0.075` and eight instance caps raised for the ~1.9x prop count. `parkedCar()` rewritten
from 2 slabs to a 9-part sedan/van. Ranks now emit along BOTH kerbs of EVERY segment of
EVERY road at 10-14 m pitch with a real junction box cull; new `signalQueue()` (3-5
stopped cars per arm) and `laneTraffic()` (all four lanes, 20-42 m pitch). `heroDist()`
is an exact rounded-box SDF of `paths.city` so nothing sits in the hero's line (2.8 m
clearance for ranks, 4.6 m for lane cars). New kerb guard railing, zebra crossings and
stop bars on all 4 arms of all 49 junctions, utility patches and manholes.
**TWO REAL BUGS FIXED, both silent:** (a) `dummy.rotation.set(0, ry, PI/2)` under YZX
order put the parked-car axle along the car's LENGTH — every wheel was mounted sideways
and showed a 22 cm sliver; now `(0, ry + PI/2, PI/2)`. (b) `awnMesh` cap was 9000 and
SILENTLY TRUNCATING, so whole blocks had bare fascia; raised to 20000.
Also `:701-712` draws glazing bars into `makeShopIntTex` rather than as geometry —
10480 bays x 4 boxes would have been 42k instances, and this was the single biggest
measured win.
COST: instanced meshes 63 -> 69, total instances 179,527 -> 224,054 (+24.8%), vehicles
260 -> 2667. Frame time at 1920x1080 headless: median 16.6 ms / p90 18 ms, i.e. still
vsync-locked 60 fps, not GPU-bound.
**BRIEF CORRECTION: the junction-cull diagnosis was wrong.** `1000 % 160 === 40`, so
`Math.abs(((x+1000)%160)-80) > 66` is centred 40 m OFF the junction — it kept the
junction box and deleted a 28 m band at MID-BLOCK. Nor did the loops run only along the
cross-street grid; the first covered every E-W road and the second every N-S road. The
real reason the boulevard was bare was a hard `260` cap plus a 16-46 m step. Net effect
matched the brief; mechanism did not.
NOT REACHED, with a diagnosis: the band sits at ~13.9, 71% of the weakest reference.
Split by thirds the deficit is concentrated in the LEFT third (9.00 vs 16.7-18.2), which
is deep canyon shade (lum 53.7, 36% dark pixels) AND heavily motion-blurred, so added
geometry returns very little gradient there. The UPPER half of the band (`0.40,0.52`) is
already 17.4 vs ref-03's 20.2; the loss is the lower half, which in our framing is 200 m
of receding asphalt where ref-03 has a yellow box junction directly under the camera.
**That is a camera-framing difference, not a world-content one** — a future round should
consider the daytime-downtown camera rather than adding more props.
**WARNING FOR THE NEXT ENVIRONMENT CRITIC: `tools/shadow-ab.mjs` road MAD fell 15.61 ->
13.18 and facade MAD 15.82 -> 14.94, and this is DILUTION, not a shadow regression.** The
shadow term is untouched, max is UP (150 -> 164), and meanOn/meanOff still separate by
~10.5. The road region now contains 2667 sunlit vehicles and fresh paint that were
previously shadow-sensitive asphalt; about two thirds of the facade drop is the awning
cap fix. Capping awnings at 13000 gave the same MAD for a worse band score, so there is
no cheap trade.
TRIED AND REVERTED, do not re-try: lifting midday street-level fill (`uShadeAmt`
0.80->0.90, `uCanyon.x` 0.16->0.10) bought +0.25 band sobel but cost 0.8 facade MAD.
Raising the `signFrame` cap 5000 -> 12000 cost 1.0 sobel in BOTH bands. But note
`signFrame` IS still at cap 5000/5000 — a real silent truncation someone should examine.
Facade saturation still not addressed (0.303 top band vs refs 0.373-0.556); street-band
sat rose 0.329 -> 0.345 as a side effect of the car palette and awnings.

### ORCHESTRATOR EDITS MADE AFTER WAVE H LANDED (02:45-02:55)

1. **`main.js` — the crash shutter is wired.** `boostFx.update` now takes
   `amount: Math.max(s.boostBlend, crash.shutter01)`. Without this the entire crash r7
   round was invisible. Lint ok.
2. **`scenes.js` — `crash-cam` `simTime: 9.5 -> 0.9`.** The crash builder proved the
   scene was capturing OUTSIDE the slow-mo beat: shutter01 at 9.5 s is 0.022, roughly
   0.5 px of streak, so no wire-up could ever have shown a shutter mismatch there. I
   swept it myself with `tools/probe.mjs`: 0.35 -> 0.416, 0.9 -> 0.213, 5.3 -> 0.189,
   5.7 -> 0.175, 9.5 -> 0.022. Chose 0.9 over the 0.35 peak on COMPOSITION after
   rendering both — at 0.9 the wreck is airborne and rolling with a full debris fan,
   sparks and a streaking road, which is the `crash-cam-01`/`-04` staging; 0.35 is a
   rear-three-quarter view of a barely-moved car. Rationale and the sweep are in a
   comment at the line. **The crash-cam scene's composition has therefore CHANGED — any
   crash measurement taken before 02:55 is against a different frame and is void.**
   Note also a vertical translucent seam artifact visible in the 0.35 render but not the
   0.9 one; if a critic sees it, it is real and worth chasing.

### WAVE I CRITIC SWEEP IN FLIGHT (launched ~03:05, ten critics, ZERO builders)

Judging: sky r10, road r10, car-paint r10, environment r11, chase-camera r7, boost r7,
crash r7, damage r7, audio r10, hud r7. Each critic was given the builder's claims as
CLAIMS, the known-open items so it does not re-report them, and the specific unresolved
question for its piece. Shots land at `shots/<piece>-r<N>.png` and `-latest.png`.

Three critics were given a question that could REDIRECT the next round to a different file:
  - damage: is the dominant desaturator actually the base `car.js` clearcoat, not damage.js?
  - environment: is the residual street-band deficit really a camera-framing difference?
  - crash: does the shutter mismatch now exist at the new `simTime 0.9` capture beat?

### WAVE I VERDICTS — ALL TEN IN, ALL `real wins`. THESE ARE THE WAVE J BRIEFS.

This sweep was unusually productive: it OVERTURNED a measurement convention (road),
found a metric that had been GAMED (car glass), found a signal that scores perfectly
and is inaudible (audio boost), and CONFIRMED two redirections that move work to a
different file than the piece that owns the symptom (damage -> car.js, environment
street band -> camera, not world content).

**sky r10 -> sky.js. GAP: the aerial-perspective inscatter overshoots the sky it is
supposed to dissolve into.** An opaque surface at infinite distance must converge to
exactly the sky radiance in that view direction; ours is more saturated and much warmer
than its own sky at every azimuth, glazing the lower half of frame sodium-orange.
Straddling the horizon at the VP (horizon located at y 0.495 via `_crop.mjs`):
`skyAbove=0.42,0.50,0.484,0.494` 235.4,189.6,155.2 sat 0.341 vs
`gndBelow=0.42,0.50,0.500,0.508` 222.1,139.0,62.1 sat **0.720** — terminal ground
saturation is 2.11x the sky it should EQUAL, and B drops 93/255 across a one-pixel
boundary. Not just the sun lobe: at 90 deg off sun, `skyR=0.86,0.96,0.470,0.490` sat
0.452 vs `gR=0.86,0.96,0.500,0.510` sat 0.657 — so the base `aerialLow` is the offender,
not only `sunTint`. Distance ramp on one continuous tarmac surface goes L 33 -> 120 and
G/R 1.02 -> 0.52 with depth; every reference does the OPPOSITE (ref-03 far road G/R 1.23,
ref-02 1.30, ref-01 1.09 — reference tarmac keeps G above R at every depth).
FIX: drive the aerial terminal colour from the sky itself — sample the sky LUT for
`fogDir` and use that as the mix target at `sky.js:180`, deleting the unbounded warm add
at `sky.js:182` (`aerial += uFogSun.rgb * pow(sd,5.0) * uFogSun.a`) so the sun lobe comes
in through the LUT and can never exceed the sky. Interim clamp: pull `aerialLow:
0x6b5d47` toward the measured horizon sky at `sky.js:764` and cut `sunTintGain: 0.68` at
`sky.js:765`.

**road r10 -> road.js. THE MEASUREMENT CONVENTION WAS WRONG AND IS NOW FIXED — read this
before quoting any road number again.** `_bandmeas.mjs` angular-corrects the 1-D band
radius but NOT `hfRms`, so comparing a native-resolution reference against our 1920 render
was never scale-fair. Correct protocol: `sips -Z 1920` the reference first.
CORRECTED ANCHORS (ref-01 downsampled to 1920): dark `0.72,1.0,0.88,0.94` hfRmsNorm
**12.48**, bright `0.72,1.0,0.94,1.0` **12.00**, ratio **1.04** — real tarmac grain is FLAT
across luminance, i.e. intrinsic. Ours over three renders: dark 11.29/11.49/11.93, bright
13.94/14.84/13.45, ratio 0.81/0.77/0.89, mean **0.82** — roughly 8x the render-noise band
below reference, and the previous build's claimed 0.92 ratio and 12.28 bright did NOT
reproduce in any of three renders.
TWO STANDING ITEMS RETIRED: (a) "smear 5.7 vs 8.0 px" is a RESOLUTION ARTIFACT, not a gap
— ref-01 native prints `8.0px (norm@1920w=4.6)` and downsampled to 1920 measures 5.8 px
against our 5.5 px. Stop chasing it. (b) "absolute grain overshoots reference" is half
wrong: at matched scale our DARKS undershoot (11.6 vs 12.48) while brights overshoot
(14.1 vs 12.00). It is a DISTRIBUTION problem, not a level problem.
GAP: our grain is a MULTIPLIER on reflected radiance, not a property of the surface, so it
dies wherever the road is dark. The chip signal enters only as
`indirectSpecular *= mix(1.0, mAO*mAO, 0.85)` (`road.js:1066`) and `* mix(microAO, 1.0,...)`
inside the mirror gain (`road.js:1270`), so its absolute amplitude is proportional to
scene radiance — exactly as the comment at `road.js:930-936` intends by keeping aggregate
out of albedo. FIX: add a radiance-INDEPENDENT chip channel — an additive
hemisphere-ambient specular lobe evaluated through the micro-normal (`gMicroN`) with a
floor, and/or restore chip contrast to the wet diffuse at `road.js:936` scaled INVERSELY
with local `reflW` radiance. **Target the RATIO, not the level: dark must come up to ~12.5
without pushing bright past ~12.** Dry road did not regress (daytime 10.52, dusk 11.14).

**car-paint r10 -> car.js. THE LAST ROUND'S METRIC WAS GAMED — the roller wave IS legible
as a pattern.** The build reported p05/p50/p99 and skipped p90, which is where the defect
lives. Ours (`_paintmeas.mjs shots/car-paint-r10.png 0.547 0.677 0.352 0.417`) p90
**137.5** vs ref-03 (`0.359 0.463 0.616 0.667`) p90 **90.4** — 52% hot — while p99 is 10%
LOW, i.e. the wave's bright phase paints a tenth-plus of the pane where the reference has a
thin 1-3% specular sliver, and p99 matched only because a handful of crest pixels reach
204. Independent confirmation: the horizontal autocorrelation of the high-pass residual
never crosses zero inside 12 px in ours (`[1, .438, .348, .360, .317, ...]`, grainPeriodPx
">24") where ref-03 decorrelates by lag 3.4 (`[1, .187, .041, .022, -.059]`,
grainPeriodPx 6.5) — a deterministic repeating structure surviving a 3x3 high-pass, i.e.
corduroy. By eye the rear side pane is a chain of hard-edged white blobs with dark bruise
borders (the `at(u,v)*0.30` phase jitter breaking the sine into lobes — the exact
"blobby oil-slick camo" the comment at `car.js:872` says was ALREADY REJECTED ONCE), and
the windscreen shows 5-6 discrete vertical stripes with grainRMSpct **15.24**, a regression
on the 12.9 already logged. And nothing reads THROUGH the pane: ref-03 holds a legible
headrest, seat and B-pillar behind its tint; `envMapIntensity 9.0` has drowned our 0.70
transmission entirely.
FIX: delete `+ at(u,v) * 0.30` from the sine argument at `car.js:890` — phase-modulating a
sine makes lobes, not roller wave; modulate AMPLITUDE if you want irregularity. Back
`normalScale` at `car.js:1507` from 3.2 toward ~1.2 and let `envMapIntensity`
(`car.js:1525`) come down with it. **Target p90 ~90, not p99 ~226 — p90 is the honest
handle on this material and p99 is the one that gamed the last round.**

**environment r11 -> world.js. GAP: the 2667 new vehicles are grounded by round,
un-oriented, over-sized fake contact pads that read as oil stains.** `world.js:2269` gives
every parked car `shadowAt(x, z, 0.05, 3.4, 1.0)` and `world.js:2523-2526` renders each as
`rotation.set(0,0,0); scale.set(c.r*2, 1, c.r*2)` — an axis-aligned isotropic **6.8 m
disc** under a 4.40 x 1.82 m car. That is 36.3 m² of pad under 8.0 m² of car, **4.5x the
footprint**, circular, ignoring the car's yaw AND the sun direction, while the hero car and
buildings in the same frame throw long hard directional shadows. Pixel proof: a clean
circular soft-edged arc ~320 px wide sits on OPEN ASPHALT in the near traffic lane centred
near (700,710) with no object above it; row scan L 26.0 -> 28.5 -> 32.4 -> 35.3 -> 43.6 ->
65.5 -> 129.9. Second half of the same bug: `world.js:981` stores a per-caller alpha that
`world.js:2523-2526` NEVER READS, so a hydrant pad and a car pad render equally dark at a
flat 0.72. **This is also the mechanism behind the shadow-ab dilution** — ~2400 pads x 36 m²
of sun-independent flat alpha now cover much of the road region and are by construction
unresponsive to the shadow toggle.
FIX: at `world.js:2519-2527` replace the isotropic pad with an oriented elliptical one —
extend `shadowAt` (`world.js:981`) to carry `ry`, separate half-extents `rx`/`rz`, and the
already-collected `a`; set `rotation.set(0, c.ry, 0)`, `scale.set(c.rx*2, 1, c.rz*2)`, bind
`c.a` through an instanced alpha (instanceColor + `vertexColors` on `contactMat`), change
`world.js:2269` to `shadowAt(x, z, 0.05, 2.5, 1.05, ry, 1.0)` for a 5.0 x 2.1 m pad locked
to heading, and bias its centre ~0.4 m down the anti-sun vector.
**AND THE CAMERA REDIRECTION IS CONFIRMED — STOP FEEDING world.js TO CHASE THE STREET BAND.**
`_facademeas.mjs --band 0.40,0.62 --normw 1920`: ours **13.83**, ref-01 32.76, ref-02 20.98,
ref-03 19.56, **ref-04 12.96**. Ref-04 is the ONLY reference with our camera (low chase,
receding downtown street) and it scores BELOW us at matched luma (76.8 vs 75.6) and matched
dark% (21.1 vs 18.4). The three high scores come from framing choices — a broadside sedan
at 10 m in -01, a yellow box junction filling the band in -03, a look-up canyon in -02. The
20-32 target is a CAMERA ARTIFACT, not world content.

**boost r7 -> boost.js. GAP: everything downstream of the throat is SMOKE, not flame.** The
plume loses hue within ~90 px of the nozzle and becomes achromatic warm-grey haze at
background luminance, so there is no jet — only a nozzle glow. Background-subtracted over
three renders: nozzle (`_px --region nozzle=0.435,0.470,0.795,0.822`) delta RGB (21,68,8),
sat 0.51, ~2.4x local road; mid-plume (`x_axis=0.46,0.54,0.88,0.94`) delta (14,9,5), sat
**0.215**, only 1.16-1.34x. **The saturation INVERSION is the proof: the plume body's sat
0.215 is LOWER than the bare tarmac it covers (0.46), and an additive emitter can only
desaturate its background if what it adds is near-neutral.** `boost-blur-01` does the
opposite — its jet gets GREENER with distance: throat `jetcore=0.185,0.225,0.255,0.300`
sat 0.294 G/B 1.42, far end `jetmid=0.145,0.185,0.245,0.290` sat **0.553** G/B **2.23**,
p01 117 (fully opaque). Ours goes G/B 1.90 -> 0.78.
Cause: `boost.js:517-519` places the tint stations by `u` (fraction of MODELLED jet
length), and with `ampP` cut ~9x at `:536` the plume falls below legibility around u~0.7,
already past the `cOrange`->`cSmoke` handover at 0.58-0.92. **The visible plume is the
smoke tail; the flame never gets shown.**
**AND THE 6.5:1 ASPECT TARGET THE LAST ROUND TUNED TOWARD WAS MEASURED OFF THE HUD BOOST
BAR, NOT A FLAME.** `--region a=0.078,0.380,0.847,0.921` on ref-04 (216,111,49, sat 0.774,
~580x80 px, 7.25:1) is the bottom-left HUD bar. Ref-04's actual exhaust flames are two
65x35 px blobs, **~1.9:1**. The plume was stretched to match a 2D UI graphic.
FIX: reparameterise the tint ramp by EMITTED RADIANCE rather than axial fraction — drive
`tintP` (`boost.js:517-519`) off normalised `ampP` so green/yellow hold wherever the plume
is above ~1.5x background and `cSmoke` only opens below that (smoke station floor around
u 0.85-1.0). Re-derive the aspect target from ref-04's real flame blobs (~1.9:1) or ref-01's
jet (~4:1 over its green length) and shorten `uLen` (`boost.js:1108`) accordingly.

**crash r7 -> crash.js (+ a boost.js hero-hole question). The shutter mismatch now EXISTS
IN SIGN but not magnitude.** Reference re-derived: `crash-cam-01 --patch 0.60,0.90,0.80,0.99`
14.8 px @170 deg aniso 12.36 vs subject `--patch 0.60,0.72,0.20,0.32` 3.0 px aniso 1.47 =
**4.9x**. Ours: same tarmac coords 6.7 px @55 deg aniso 3.20, wreck flank
`--patch 0.44,0.56,0.30,0.42` 5.9 px aniso 2.84 = **1.14x** (was 0.77x inverted). It fails
from BOTH ends — tarmac only reaches 6.7 px where the reference streaks 14.8, AND the wreck
is smeared to 5.9 px where the reference subject sits at 3.0. **A tight patch on the solid
red roof panel (`--patch 0.469,0.521,0.306,0.361`) measures 10.2 px @155 deg aniso 5.51 —
the radial kernel's hero hole is NOT protecting the wreck during the crash beat even though
`boost.js:104-139` builds a silhouette mask, and the 155 deg axis matches the radial
direction from the focus of expansion, so it is the smear pass, not per-object blur.**
Shard distribution VERIFIED LANDED: panels span ~10-70 px with distinct silhouettes, glass
wedges no longer one repeated arrowhead.
GAP: the glass debris has no dark side — ~200 shards read as white paper confetti.
`crash.js:1272` sets a per-instance colour of RGB(1.02-1.36, 1.18, 1.30) on a base
`0xdcf1fb` — an effective albedo ABOVE 1.0 — and `crash.js:429` runs `envMapIntensity: 3.8`
at `roughness 0.018`, so every facet reflects the sky at ~4x regardless of tumble and tumble
produces no value variation. Our debris field (`--region debris=0.42,0.72,0.02,0.25`) p99
162.4 against local p50 53.1 = **3.06**; `crash-cam-01`'s field
(`--region debris=0.86,1.00,0.33,0.55`) p99 99.3 against p50 80.5 = **1.23**. Real Burnout
ejecta is dark grit reading as silhouette with glint on a few pieces; ours is uniformly
brighter than the buildings it flies past.
FIX: clamp instance albedo below 1.0 at `crash.js:1272` (~0.55-0.75 grey-blue) and cut
`envMapIntensity` 3.8 -> ~1.0 at `crash.js:429`, letting the near-mirror roughness produce
glint only when a facet catches the sun. Separately confirm the silhouette prepass at
`boost.js:1017-1020` picks up the CRASH-POSED car before anyone lengthens the tarmac kernel,
or raising it toward 14.8 px will just smear the wreck harder.

**damage r7 -> damage.js. All three unresolved items are now RESOLVED, and two of them
redirect work elsewhere.**
1. **The desaturator IS in `car.js`, and it is worse than framed.** Killing
   `paintMat.clearcoat` lifts crush-zone chroma +0.174 (~20x noise) — but the same test AT
   REST lifts +0.128, so the crumple-specific excess is only +0.046. **It is not a
   sky-facing-crumple-lobe effect; it is a global `car.js` paint wash that the crush merely
   darkens into visibility.** Colour work belongs in `car.js`, not `damage.js`. The
   crazed-clearcoat pass is confirmed as what saved the visible number (0.242 overlay-off ->
   0.452 overlay-on).
2. **Crush depth: the OLD figures are right.** Body z-extent over 29042 verts, tail pinned
   at -2.3750 at every level: rest 4.7500, level 0.4 -> 4.4666 (crush 0.2834), 0.7 -> 4.1086
   (**0.6414**), 0.95 -> 3.9955 (**0.7545**). Matches 0.641/0.755 to the millimetre; the
   builder's 0.6636/0.7607 was a different estimator. Nothing regressed.
3. **NEITHER prop figure reproduces, and the props are visibly broken.** Using a
   fold-proof metric (prop front-face z minus body-skin z-max inside the prop's own (x,y)
   footprint, no normals): relative to rest the grille SINKS 163 mm deeper, the lamps
   SURFACE by 126 mm, and the splitter buries at level 0.7 then juts **134 mm proud** at
   0.95 — non-monotonic. At level 0.4 the grille slats and lamp bezel are chopped into
   DISCONNECTED CHROME FRAGMENTS by the yellow skin passing through them, and both the
   grille aperture and lamp recess are swallowed. They do not float ahead — **they get
   shrink-wrapped.**
GAP: **the crumple wavelength is ~3x too short — the nose reads as crushed tin foil, not
buckled sheet steel.** Grain autocorrelation period 5.8 px (L0.4) / 6.6 px (L0.7) vs
**18.5 px** on `crash-cam-04`'s crushed fender; highlight FWHM 40 px / 9 px vs **113 px**
(ref-04) and **273 px** (ref-03). The reference fender is 2-3 smooth ~500 mm pillow lobes
with two knife-sharp fold ridges; ours is a regular field of ~70 mm accordion pleats.
Root cause is structural: `setLevel` fires **7 scripted impacts, 4 of them inside the front
metre**, and each lays down its own private hinge pair (`hd1`/`hd2`, W1 0.10, W2 0.14) plus
its own `ridge()` fold — eight-plus competing crease lines across one 1 m fascia, which is
exactly the measured 6 px period.
FIX: merge fold hinges PER PANEL instead of per impact — at `damage.js:2017-2021` snap a new
impact's `hd1`/`hd2` onto the nearest existing hinge on the same panel within ~0.35 m and add
amplitude there rather than creating a new crease. Then raise `buckle1` (`:2020`, currently
`lerp(0.040, 0.135, e)`) to ~0.25 to keep total plastic depth, and halve `foldAmp` (`:1955`,
`depth * 0.52`) so the isotropic `ridge()` noise at `:2048` stops competing with the hinges.

**audio r10 -> audio.js. Every claim from the last build VERIFIED digit-for-digit** (squeal
bands 22.6/62.1/14.2 vs refs 11.0/73.7/15.0 and 39.9/54.0/5.6; top peak 826 Hz @ 6.9 dB vs
ref-01's 820 @ 7.1; boost centroid 2081 -> 3016 vs ref 1928 -> 2837; crash tail unchanged,
T60 1.92 s monotonic). **The flagged over-hot-squeal worry is CLEARED** — in the busy mix the
tyre adds +1.40 dB rms / +0.86 dB peak over the engine bed and sits 8.76 dB below the crash
peak. Despite the 15x gain it lands plausibly between engine and crash.
GAP: **the boost is 21.7 dB below the tyre and its new sweep happens at -50 dB.** In the busy
mix, +boost measures rms -18.46, i.e. **delta -1.05 dB against the engine-only bed —
engaging Burnout's signature sound makes the mix QUIETER.** Windowed RMS shows why: in the
1.5-2.5 s window where the celebrated 3016 Hz centroid is measured, `ours-boost-solo.wav` is
**-50.79 dB** while `ours-squeal-solo.wav` is -29.11 dB; the boost is 29.8 dB below its own
onset peak (-20.95).
**MECHANISM IS A DECOUPLING BUG, NOT A TASTE CALL:** `audio.js:697` sets `SUSTAIN = 0.22`
with `DECAY_TC = 0.34 s`, so a held boost is 13 dB down inside ~1 s, but `SWEEP_TC = 0.90 s`
(`:705`) driving `bright = swp**6` (`:771-772`) needs >2 s to develop. The spectral climb
lands entirely AFTER the level has collapsed. **It scores perfectly because band-share and
centroid are ratios — level-blind — so the win is real in the analyser and inaudible in the
mix.** This is a general lesson for every piece, not just audio.
FIX: recouple envelope and sweep — raise `SUSTAIN` (`audio.js:697`) 0.22 -> ~0.60 so a held
boost is a sustained afterburner (the sidechain at `:1518` stays transient automatically
since `:784` normalises the contour to 0 at sustain), and shorten `SWEEP_TC` (`:705`) 0.90
-> ~0.30 s, or drop the 6th power at `:771-772` to a cubic, so the climb completes inside
~600 ms while amplitude is still carrying it.

**hud r7 -> hud.js. GAP: the top-centre street-plate assembly has no torn ink splatter
behind it and no compass ribbon.** Every reference puts a heavy grunge scrim under that
group; we put a clean pill on bare sky. `_px.mjs reference/hud-overlay-01.jpg --region
behindPlate=0.42,0.53,0.13,0.17` reads median 55.6, p01 7.9, **1.61% of pixels below luma
16**, sat 0.326, on a sky that is otherwise dead flat (p01 97.1 -> p99 100.6, sat 0.05) —
opaque torn black ink, not a shadow. Ours (`--region belowPlate=0.44,0.56,0.072,0.082` vs
`skyCtrlL=0.37,0.43,0.072,0.082`) is median 64.5 against 74.8, p01 48.7 against 72.8, **0%**
below 16 — a -14% smooth gaussian falloff with zero dark deposit and zero texture.
`hud-overlay-03` also runs a hatched, tick-marked compass ribbon behind E/S/W plus a
subtitle and distance readout on the same splat, where `hud.js:1908-1918` draws three bare
glyphs. **The grunge machinery already exists in the file** (`makeGrungeTexture`, used at
`:845-851` and `:1623-1626` for the district plate and minimap) — it was simply never wired
to the top-centre group, so that one assembly reads as modern vector UI while the rest reads
as Burnout.
FIX: in `drawStreetPlate` (`hud.js:1878`) draw a mirrored `grungeTex` at ~1.6x the plate box
BEFORE the `roundRect` fill, matching the pattern at `:846-851`, extend it down over the
compass row at `:1901`, and replace the bare-glyph compass at `:1908-1918` with a clipped
tick-marked ribbon.
**THE `saturate(1.65)` JUDGEMENT CALL IS OVERRULED — it reads as artificially punched-up
green and the 0.337 bar-box number hides it.** The core is genuinely right (ours
245.9,254.5,197.7 vs ref-03 247.7,253.2,192.3), but saturation has almost no leverage on
near-white pixels, so the filter dumped its whole effect into the midtone falloff: top rim
ours 98,157.4,46.5 sat 0.705 vs ref 114.4,175,86 sat 0.508, with B/G 0.30 against 0.49. Our
peak band saturation is 0.776 where the reference never exceeds 0.550 anywhere in the
profile. Acid lime versus soft desaturated yellow-green. Fix by warming the gradient ramp's
midpoint directly (raise B toward 86 at the rim), NOT with a global `saturate()`.
Also confirmed: the asymmetric noise coefficients do land the rail geometry, but the bottom
edge shows discrete sawtooth teeth at a regular pitch where ref-03's bottom edge is
turbulent at the same frequency as its top. The symmetric lick texture is the honest fix.

**chase-camera r7 -> camera.js. `real wins`, but NARROWLY and NOT on the static pose —
the critic said that on the r7 still alone it could not have picked the real one on
framing. The pose is CONVERGED; the piece loses on camera BEHAVIOUR.**
The critic re-derived the references independently before reading the builder's numbers
and confirmed them: ref-03 horizon y1341 (47.68%) by the equal-height streetlamp
cross-ratio, roof PANEL y1590, roof SCOOP y1545 (the 1.6%-of-frame appendage that caused
two successive wrong targets), contact y2168 -> gap 8.85%, car 20.55% panel, contact
0.771, depression 0.301. Ref-02 -> depression 0.283-0.292, contact 0.764-0.769. Ours:
horizon 49.23%, gap 8.33%, contact 0.7687, car 19.31% panel, depression 0.301 — every
figure inside the corrected band.
**Depression is confirmed SCENE-GENERIC**: it is a ratio of two vertical offsets from the
horizon, so focal length, resolution and aspect all cancel — verified empirically by
sweeping our own rig 0->78 m/s while the FOV swung 42->52.8 deg, with depression holding
0.295-0.306, and by two references at different aspect ratios landing 0.292 and 0.301.
The four other chase scenes at 0.180-0.257 are genuinely under-posed and are a later
round — with one caveat: `dusk-highway-chase-04` documents a deliberate ~0.8 m pursuit
cam, so if `boost-blur` is meant to be that shot, a low variant is legitimate.
GAP: **the pose holds at exactly one speed, and it is not the speed either reference
depicts.** `FRAME.distSpeed +0.10`, `heightDroop 0.04` and `fovGain` all shrink the car and
all pull the same way, so the contact line travels 0.09 of frame height across the speed
range. The r7 shot passes only because it renders at 38.3 m/s; the scene asks for 64 m/s
and never gets there. At the references' actual condition (`-03` is boosting, `-02` is a
freeburn run) ours is 17.5% car height at contact 0.742 against their 20.5% at 0.771.
**Burnout's cam pulls IN as the lens opens so the car holds its size; ours widens the lens
AND backs off AND droops.**
FIX: dolly-counter-zoom — scale distance by `tan(fovBase/2)/tan(fov/2)` so the car subtends
a constant frame height as the FOV opens, and zero the height droop.

### WAVE J BUILDERS IN FLIGHT (launched ~03:20, TEN builders, ONE PER FILE, zero critics)

Each was pointed at its own paragraph under `### WAVE I VERDICTS` in this file rather
than being handed a re-typed brief — that is the cheapest way to keep briefs and record
identical, and it worked. File ownership this wave:

  sky.js     -> sky r11      (aerial terminal colour from the sky LUT, kill the unbounded warm add)
  road.js    -> road r11      (radiance-INDEPENDENT chip channel; target the RATIO 0.82 -> 1.04)
  car.js     -> car r11       (TWO gaps: kill the glass phase-jitter corduroy, and the global
                               paint clearcoat wash that the damage critic proved is the real
                               desaturator)
  world.js   -> env r12       (oriented elliptical contact pads + instanced alpha; do NOT add props)
  camera.js  -> chase r8      (dolly-counter-zoom so the pose holds across the speed range)
  boost.js   -> boost r8      (tint ramp by emitted radiance not axial fraction; re-derive aspect
                               from real flames; ALSO investigate why the smear hero hole does not
                               protect the crash-posed wreck)
  crash.js   -> crash r8      (glass debris albedo > 1.0 and env 3.8 -> value-bimodal grit)
  damage.js  -> damage r8     (merge fold hinges per panel; crumple wavelength 6 px -> ~18 px)
  audio.js   -> audio r11     (recouple boost SUSTAIN/SWEEP_TC; verify IN THE BUSY MIX)
  hud.js     -> hud r8        (grunge scrim + compass ribbon on the street plate; undo saturate(1.65))

### WAVE J RESULTS — ALL TEN REPORTED AND LANDED

**crash r8 (`crash.js`) — glass debris now reads as dark grit with a few glints.** Material
`color 0xdcf1fb -> 0xb9cbd6` (sub-unity on every channel), `opacity 0.70 -> 0.78`,
`envMapIntensity 3.8 -> 1.05` (`crash.js:436-440`). Per-instance colour (`:1307-1314`)
replaced with a BIMODAL draw off a single `rng()` value: 9% facet pieces at b 0.58-0.82,
91% grit at 0.085-0.27. Deliberately one `rng()` call, same as the line it replaced —
branching-then-drawing would have shifted the shared stream and silently re-rolled every
later instance's size, velocity and spin. Debris p99/p50 3.08 -> **2.13**.
**IMPORTANT — THE METRIC IS BACKGROUND-LIMITED AND GLASS IS NO LONGER WHAT DRIVES IT.** A
control with all 168 shards hidden measures 2.17 in the same region; our build is at 2.13,
i.e. statistically AT THE FLOOR. The residual against the reference's 1.23 is sky strip,
sunlit facades and the gantry sign inside the patch, plus the fact that the reference patch
sits on flat mid-grey. **Do not re-brief crash.js to chase 1.23 in that region — it is
unreachable from this file.** The honest handle is the glass delta over the no-glass
control: p99 was +49 above the floor, now ~+13 in the sky-free band.
Shard size distribution verified intact (panel p50 13.6 cm, p90 30.0, 10 fragments over
25 cm; glass p50 7.4). Flagged for later: panels' `_col.multiplyScalar(0.72 + rng()*0.7)`
at `crash.js:1238` can reach 1.42x on `paintCol` — the same over-1.0-albedo class of bug,
smaller in luma terms.

**chase-camera r8 (`camera.js`) — the pose now holds across the ENTIRE speed range.**
Dolly-counter-zoom added at `camera.js:318-320`
(`zoomComp = tan(cfg.fov/2)/tan(fov/2)` applied to the standoff), with `distScale
1.16 -> 1.293`, `distSpeed 0.10 -> 0.0`, `heightScale 1.05 -> 1.029`, `heightDroop
0.04 -> 0.0`. The FOV block was moved to BEFORE the pose solve so the dolly
counter-zooms against the current frame's lens.
Contact-line travel across 0-78 m/s: **0.0854 -> 0.0032, a 27x improvement.** Car height
spread 5.2 points -> 0.9. Gap flat to 0.01 pt. The live r7 pose is unchanged (gap 8.31,
depression 0.301, contact 0.7685, car 19.30) — all four targets still hit, now at every
speed instead of one.
TWO REAL BUGS FOUND AND FIXED IN PASSING: moving the FOV block exposed `camera.js:396`
clobbering the snapped FOV on the first frame (snapped frames came out 1.3 deg narrow).
**BRIEF CORRECTION: the critic's suggested `distSpeed -> -0.10` is WRONG once the
counter-zoom exists** — negative over-compensates and GROWS the car with speed. 0.0 is the
value that makes the terms cancel, verified numerically.
KNOWN COMPROMISE: `distBoost` had to flip -0.12 -> +0.08 because full-authority
counter-zoom crowded `boost-blur` 11% closer than authored (its `distance: 6.65` was solved
against the old shrinking law and `scenes.js` was not the builder's file). **When boost-blur
re-authors its standoff, `distBoost` should go to 0.** Residual drift: depression 0.305 at
rest to 0.295 at vMax, from `pitchSpeed 0.30`, deliberately left because the reference
condition is at speed and both are on target there.
The FRAMING NOTE at `camera.js:10-27` is now corrected and records the scene-generic
depression finding and why the retired 0.21-0.22 was wrong.

**sky r11 (`sky.js`) — the aerial terminal colour is now the sky itself, read from the same
LUT the dome is drawn from.** New 5x5 `fogSkyGrid` of LUT samples in the LUT's own
parameterisation, filled once per `apply()` by 25 one-texel readbacks (`sky.js:123-141,
1207-1234, 1338-1341`); `fog_fragment` (`:212-259`) now bilinearly taps it plus the dome's
Mie lobe instead of `mix(uFogLow, uFogHigh, ...)` + an unbounded warm add.
Ground/sky saturation ratio **2.11x -> 1.71x**; the one-pixel B step across the horizon
**92.7 -> 50.0**; `gndBelow` sat 0.719 -> 0.478, `gR` (90 deg off sun) 0.657 -> 0.282.
Zenith byte-identical, near-road essentially unchanged — nothing outside the fog moved.
**FIVE BRIEF CORRECTIONS, several structural:**
(a) **The literal fix is not implementable.** You cannot bind the LUT to a built-in
material's uniforms: `UniformsUtils.clone()` explicitly NULLS render-target textures, which
is why this file's live state is all Float32Arrays. Hence the CPU resample.
(b) The suggested interim clamp at `:764/:765` would have been a NO-OP — with `aerialSky`
at 1.0 the authored `aerialLow`/`sunTint`/`sunTintGain` are entirely bypassed.
(c) The builder ADDED the Mie halo to the aerial term unprompted; without it the fog
UNDERSHOOTS its own sky near the sun instead of overshooting.
(d) **The critic's `skyR` region is not sky** — it moved 0.452 -> 0.152 under a fog-only
change, so it is fogged geometry. Only `skyAbove` is real sky.
(e) The residual is not a terminal-colour error: forcing the fog to saturate converges
ground to sat 0.308 against sky 0.27, so `gndBelow` is only ~95% fogged and the leftover
step is the ACES shoulder on a partially-fogged near-clipping region.
**TWO OTHER PRESETS NEEDED INTERIM CLAMPS, AND WHY IS A REAL FINDING:** at full sky mix
daytime's horizon went 126.4 -> 166.6, above all four references, because the authored
`aerialLow 0x94a9bf` was silently COMPENSATING FOR A TOO-BRIGHT MIDDAY BAKE HORIZON;
clamped to `aerialSky 0.15`. Night's horizon saturation collapsed 0.133 -> 0.068 because
the night bake's horizon row is a NEUTRAL 0.115,0.125,0.129 linear, ~5x the authored
`0x2a3550` with no blue in it; clamped to `aerialSky 0.30`. **Both clamps are masking bake
bugs that a future round should fix at the source.** Dawn is unverified — no scene renders it.

**road r11 (`road.js`) — a genuine ambient chip floor shipped, but THE BRIEFED GAP INVERTED
MID-SESSION AND THE HEADLINE METRIC IS NOT ROAD.JS-CONTROLLABLE.** Read this before
briefing road again.
Shipped: a zero-mean ambient chip term at `road.js:1288-1314`
(`chipAmb = (cavV - uCavMean) * uChipAmb * uWet * detAmt * chipFar`), with
`makeMicroAggregate` now returning `cavMean` (`:308-312`) so the term is exactly zero-mean
— the cavity channel is heavily skewed toward 1.0, so a 0.5 midpoint would have lifted the
whole road. `uChipAmb = wet * 0.020`.
**THE INVERSION:** at session start unmodified r10 code reproduced the critic digit-for-digit
(dark 11.55, bright 13.48, ratio 0.857). Forty minutes later, with road.js still at r10
behaviour, five control renders gave dark 13.15-13.86, bright 12.05-12.35, **ratio 1.11** —
it now overshoots in the OPPOSITE direction from the brief. `sky.js` and `world.js` were
being written continuously throughout. **A concurrent sky change moved this piece's headline
metric by 0.25 ratio points with zero road.js edits.**
**AND HERE IS WHY, WHICH IS THE MOST IMPORTANT FINDING:** with the planar mirror forced off,
the dark half measures hfRmsNorm **1.28 — a literal plane**. So 100% of the dark half's
measured grain is REFLECTED SCENE CONTENT, not tarmac. The dark hfRmsNorm number was never
measuring our road surface. Separately, forcing `detAmt` to 0 changes the dark half not at
all (7.79 vs 7.8-7.9) while costing the bright half 12.2 of its 14.97 — the aggregate
contributes literally nothing to the dark half.
With the shipped term on, the mirror-off dark region goes 1.28 -> **3.54** at unchanged mean.
That is the only sky-independent chip texture the dark half has ever had.
ALSO CORRECTED: **render noise on the dark sub-region is ±0.35 hfRmsNorm, not 0.03** (sd over
five identical renders); the 0.03 figure holds only for the bright region and the transverse
ratio. And **the transverse anchor 3.89 is the NATIVE-resolution figure — under the
resolution-matched protocol ref-01 measures 3.80**, we were at 4.02 (overshooting) and the
change lands 3.74-3.82.
HONEST FAILURE: the ratio moved 1.107 -> 1.083 against ±0.35 noise; the builder declines to
claim it. Absolute grain went slightly the wrong way (dark +0.25, bright +0.50, both already
above anchor) because additive grain cannot raise dark without touching bright. The chip-lens
hypothesis was tested and FAILED.
**RECOMMENDATION THE NEXT ROUND SHOULD TAKE: stop scoring this piece on the dark/bright
ratio while the dark half's texture is 100% mirror content. The sky-independent handle is the
mirror-off diagnostic (currently 3.54 against a plane at 1.28). The other genuine open gap is
band AMPLITUDE — `rowBandRel` 0.0235 vs the reference's 0.0349 and `colBandRel` 0.0063 vs
0.0092, i.e. both channels uniformly ~67% under-amplitude even though the ratio is close.**

**audio r11 (`audio.js`) — engaging boost now makes the mix LOUDER: busy-mix delta
-1.05 dB -> +0.83 dB, a 1.88 dB swing.** `SUSTAIN 0.22 -> 0.60` (`:709`), `SWEEP_TC 0.90 ->
0.45` (`:718`), a new sustained-voice-only `body = mkGain(7.5, input)` trim at `:703` that
the one-shots deliberately bypass, and the sidechain duck depth `0.45 -> 0.28` at `:1542`.
Isolated boost stem post-onset: -50.79 dB -> **-24.12 dB**; the sweep no longer happens
under a collapsed envelope.
**THE BRIEF'S FIX ALONE WAS NOT ENOUGH, AND MEASURING IN THE BUSY MIX IS WHAT REVEALED IT:**
SUSTAIN alone moved delta only -1.05 -> -0.70 dB. **The -1.05 dB was almost entirely the
SIDECHAIN, not the boost's own quietness** — at depth 0.45 the engine lost 4.7 dB the instant
boost was pressed, which by itself accounts for the whole deficit. The boost was contributing
essentially nothing either way.
Crash tail digit-for-digit identical (T60 1.92 s, monotonic). Squeal bands identical
(22.60/62.13/14.18). Peaks: boost 0.4485 -> 0.6418, under the 0.68 knee; crash still 0.926
and still the biggest event.
**TWO RECORD CORRECTIONS:** (a) the boost centroid now reads 3525 -> 4298 Hz in
`_r8audio.mjs`, which LOOKS like an overshoot but is a WINDOW-ALIGNMENT ARTEFACT — the tool
measures ours at post-onset 1.13-2.48 s but the reference at 0.15-1.5 s. At reference-aligned
windows we read 1773 -> 2839 Hz against the reference's 1928 -> 2837, a CLOSER match than the
previously-celebrated pair. The old 0.90 s sweep only "matched" because it was late enough to
land in the tool's late windows. **The tool's boost windows should be aligned or retired.**
(b) **"The squeal has no second formant" is WRONG** — `audio.js:817` already builds an f2 at
1880 Hz at hard lock; the five 794-835 Hz peak slots are five smoothed maxima of the SAME f1,
split by its own ±45 Hz warble. Raising `f2G` 0.32 -> 0.52 was measured and REVERTED as a net
regression (b2k_8k 14.18 -> 19.94 against the reference's 15.0). Recorded in a comment at
`:820-827` so nobody re-tries it. Surfacing a real second formant needs the f1 warble
narrowed first.
Doppler NOT touched, with a structural reason: the engine model uses FIXED formants, so
`voice.detune` slides the excitation while the body resonances stay put and a spectral
centroid physically cannot shift by the full pitch ratio. Chasing -560 cents on that metric
means breaking the source-filter design; it should be re-measured with an f0 tracker.

**world/environment r12 (`world.js`) — contact pads fixed, and TWO of the brief's premises
were overturned by measurement.**
`shadowAt` (`world.js:995`) now takes `(x,z,y,rx,a,ry,rz=rx)` — the `rz=rx` default keeps all
14 round-footprint callers byte-identical. Pads are oriented ellipses
(`rotation.set(0,c.ry,0)`, `scale.set(c.rx*2,1,c.rz*2)`), the per-contact alpha that was
recorded and never read is now bound through `vertexColors` + an `onBeforeCompile` injection
on `contactMat` (`:2560-2578`), and each pad is biased down the anti-sun vector by
`min(1.2, 0.38*maxExtent/tan(elev))` via a new `layoutContacts(sunDir)` called from
`applyKeyFill` (`:2728`, null at night). Parked-car pad `3.4 m round -> 2.5 x 1.05 m locked
to heading` (`:2311`).
**OVERTURNED #1: the car pads were NOT the dilution mechanism — the BUILDING SKIRTS were.**
Alpha-weighted pad-area attribution over all 8337 contacts: 610 building skirts account for
834,580 m², **94.8% of all pad ink**; the 2667 parked cars are **1.9%**. The skirt had the
identical isotropic bug (`Math.max(w,d)*0.78` circumscribing a rectangular plan), so it was
fixed too. Atomic in-session A/B on the road band: pad MAD 2.428 -> **0.476**, road-band
pixels touched 22.24% -> **3.24%**.
**OVERTURNED #2: pads INFLATE `shadow-ab` MAD via the tonemap curve; they do not dilute it.**
A black pad at alpha `a` scales `|on-off|` by `(1-a)`, so removing pads should RAISE MAD — it
lowers it, because removing them lifts road pixels (meanOn 89.6 -> 88.1) further up the ACES
shoulder where the on/off difference compresses. **The r11 note that the MAD drop was pad
dilution is NOT SUPPORTED — strike it.**
**AND THE `signFrame` CAP WAS HIDING A WORSE BUG.** It was truncating (want 6229, cap 5000,
1229 frames dropped), but raising it alone made things worse: facade MAD collapsed 15.26 ->
5.33 and the near "PARAGON TATTOO" board rendered as a blank dark slab. Cause: `signFrame` is
a SOLID BOX, not a border, and blade signs push it at the same centre as `panelPair`, whose
faces sat ±0.025 inside frame half-depths of 0.15/0.10 — **the frame was swallowing both
printed faces, and blade signs only ever read at all because their frames were being dropped
by the cap.** Fixed by parameterising `panelPair`'s face separation (`:1687-1697, 1786, 1807`);
cap raised to 9000; facade MAD back to 14.16.
Budget: instances 224,588 -> 225,817 (all recovered sign frames), frame time unchanged at
16.7 ms median. Caveats: parked cars at distance look less grounded because the shadow
cascade is car-following and does not reach them (a `main.js` cascade-span question); the
anti-sun bias estimates caster height at 0.38x the long half-extent because height is not
recorded per contact — recording a real height in `shadowAt` is the honest version.

**car r11 (`car.js`) — BOTH gaps landed. Glass p90 139.3 -> 76.9 (ref-03 90.4), and the
clearcoat wash is fixed at its real source.**
Glass: `makeGlassWave` rewritten (`:922-950`). The briefed phase-jitter deletion was necessary
but NOT sufficient — **the actual mechanism was the noise being fetched with `Math.floor`.**
`normalFromFn` central-differences its argument, so a nearest-fetch noise is a step function
and differentiating it puts a one-texel CLIFF at every noise-cell boundary; those cliffs were
the "hard-edged white blobs with dark bruise borders", not the sine. Now bilinear, map 256 ->
512, u-frequency halved with amplitude modulation instead of phase modulation, plus a smooth
v-only phase snake, a lengthwise roller term and two fine striation terms.
Autocorrelation lag2 went 0.352 -> **0.012** (ref-03 0.041) — **ours now decorrelates FASTER
than the reference**. On a glass-only rect the pane alone goes p90 185.9 -> **82.5** against
ref 84.4 (r10 was 2.2x hot — worse than the critic's mixed rect showed, because that rect is
about a third red bodywork).
Clearcoat: **the culprit is not `clearcoat` or `clearcoatRoughness` — it is the 4.5x
`uCcGain` at `car.js:1178`**, which multiplies three's already-Fresnel-weighted clearcoat IBL
including the head-on 4% term where real lacquer contributes nothing. Set to **1.6** on both
`paintMat` (`:1525`) and `liveryMat` (`:1558`), measured against ref-04's own red paint
(sat 0.524 / 0.580): fender sat 0.455 -> **0.526**, door 0.430 -> **0.520**. The band split did
NOT regress — it moved TOWARD the reference (3.18x -> 2.77x against ref-03's 1.63x) and is
still non-monotonic, so the reflected horizon and shoulder razor line survive.
**ONE REGRESSION IS BEING SHIPPED KNOWINGLY:** on `wet-night-asphalt`, at that near-grazing
rear angle the u-band crests foreshorten onto each other and the rear screen reads as bright
horizontal blinds — pixels over L200 go 1.97% -> **6.2%**. A u-frequency bump was tried, only
recovered 6.2 -> 5.7% and cost the closeup, so it was measured and rejected. **The real fix is
a view-angle taper on `normalScale`, explicitly next round.** `dusk-highway-chase` IMPROVED
(over-L200 4.75% -> 2.66%).
STILL OPEN: windscreen grain 11.67 vs ref-04's 6.31 (~1.9x hot); side-pane tint floor too
bright (p05 33.2 vs 17.8) which is `color: 0x080b12` + `opacity 0.70`, untouched.
USEFUL WARNINGS: brightness is NOT monotone in slope — cutting band amplitude once made the
pane BRIGHTER, because a flatter pane parks every normal wherever the probe happens to be
bright. And the reference images are DIFFERENT SIZES (`-03` is 1728x1080, `-04` is 2560x1600),
so pixel-coordinate work does not transfer between them.

**boost r8 (`boost.js`) — the tint ramp is now driven by emitted radiance, the tail keeps its
colour, AND the crash hero-hole mystery is SOLVED (it was not what anyone thought).**
Tint stations (`:545-560`) now run on `dim = 1 - ampP/0.360` instead of axial `u`, so `cSmoke`
first opens at u~0.90 where the plume is genuinely near background. `ampP` raised 1.60x to
offset the length cut; `cOrange` and `cSmoke` retuned (smoke G/B 1.58 -> 2.6, sat 0.41 ->
0.61, matching ref-01's far end going GREENER); `jetLen` cut 1.754 -> 1.165 m with `uWide`
down proportionally.
Tail saturation over the last four axial bins: **0.142 -> 0.29-0.30** against local tarmac at
0.359 — the inversion is gone (bright body peaks 0.51), and added-light G/B holds above 700
through the tail where it used to collapse to 2.0. The plume now has a TIP IN FRAME: r7's
"plume" was 145 x >=258 px with its bottom edge ON ROW 1079, i.e. no tip, no taper and no
measurable aspect — **r7's claimed ">6:1" does not reproduce and was never a footprint.**
**THE CRASH HERO HOLE — THE 10.2 px READING WAS A MEASUREMENT ARTEFACT.** The prepass node is
`carRoot`, it DOES carry the crash-posed car (157 meshes, `car.group.rotation` non-zero,
`looseRoot` inside it), and the mask over the critic's roof patch is 0.002 — the kernel there
is zero. Toggling the pass entirely moves that patch 5.8 px -> 4.5 px, a ~1 px contribution.
The roof panel is a large near-featureless surface whose long axis runs at ~150-155 deg, so
`_smearmeas`'s autocorrelation was returning the PANEL'S OWN correlation length; the "match
with the radial axis" was a coincidence of the wreck's pose.
**WHAT WAS ACTUALLY HOLDING THE TARMAC SHARP IS THE JET CAPSULE, AND IT IS NOW FIXED.** The
hole ran `0.32..0.66 x uCarR` — a ~400 px soft disc behind the car, present at full size
during the crash beat because `amount = max(boostBlend, crash.shutter01)`. Replaced with a
directional sweep of the silhouette along `uJet - uCar` (`:127-163`). Mask mean over the ring
just outside the wreck: 65.7 -> **172.6**, i.e. 2.6x more open, while the roof stays fully
protected. **The crash tarmac kernel can now be lengthened — that is next round's crash work.**
**A THIRD REFERENCE-MEASUREMENT CORRECTION, on top of the HUD-bar one:** ref-04's "two 65x35 px
flame blobs" from the last brief are the car's yellow LIVERY PANELS on the rear window. The
real exhaust is two ~70x55 px blobs under the valance, **~0.8:1 axially** — and the 1.9:1
figure was a horizontal reading applied as an axial target. ref-02 and ref-03 contain no boost
flame at all. Only `boost-blur-01` (~3.4:1 side-on lance) and `-04` (~0.8:1 chase) are flame
references, and they BRACKET our chase view. Landed 1.6:1, deliberately between them.
COST: the boost scene now holds more tarmac sharp (protected fraction 22.8% -> 28.9%) because
the swept mask actually covers the plumes, which the old capsule did not (mask mean over the
left plume 49.4 -> 0.1). New reusable tools on disk: `tools/_heromask.mjs`, `tools/_plumemeas.mjs`.

**hud r8 (`hud.js`) — both priority items landed.**
Street plate (`:1974`) now has a torn ink splat, objective subtitle, checkered shield badge,
combed compass ribbon and distance readout. On the like-for-like wide region our sub-luma-16
coverage is **25.51% against ref-03's 24.57%** (p50 74.1 vs 72.0); the narrow strip reads
14.01% vs ref-01's 1.61% purely because that region is an 11-row strip sitting where our ink
is heaviest while the reference band includes bright text.
**TWO IMPLEMENTATION FINDINGS THAT CONTRADICT THE BRIEF:** (a) reusing `makeGrungeTexture` as
directed does NOT work — its blobs cap at alpha 0.26 so the deposit never leaves dark grey,
and its speckle pass fills the whole canvas rect, so stretched to a banner its bounding box
renders as a straight-sided grey slab. A purpose-built `makePlateSplat()` (`:1581`) builds the
silhouette from tapered opaque blobs and bites the rim back with `destination-out`. (b) The
compass teeth must be CUT OUT with `destination-out`, not painted — painted black teeth are
invisible on opaque black ink; in the reference the comb reads because sky shows through, and
since the HUD is its own transparent canvas, erasing alpha IS letting sky through.
`saturate(1.65)` deleted (`:796`). **The brief's prescription to warm the rail stops was
unnecessary and measurement showed why: the filter was CLIPPING `#5fc51c` to (51,219,0) — blue
literally clamped at zero.** Removing it alone lands the rim (B/G 0.487 against ref-03's
0.481, sat 0.513 vs 0.519). What the filter was doing usefully was pulling the CORE's blue
222 -> 203, so that correction moved onto the tip/core stops instead.
All four edge widths held (top 1.78% vs ref 1.88, bottom 1.44 vs 1.61, left cap 0.33 vs 0.37,
burn front 2.32 vs 2.17) and the core is still blown and now CLOSER to reference. Holds at
1280x800. Sawtooth partially addressed — the regular pitch is gone, but it is still coarser
than the top; the full symmetric lick texture was not attempted.
**A PROCESS FIX WORTH KEEPING: `tools/_hudedge.mjs` is now on disk.** The r7 round measured
those four edge widths with a throwaway script and left nothing behind, so non-regression was
unprovable; the new tool independently reproduced r7's four numbers on the unmodified build.

**damage r8 (`damage.js`) — prop tracking is FULLY FIXED (0 mm at every level); the crumple
wavelength partly landed and the metric turned out to be contaminated three ways.**
Per-PANEL fold structure added (`:1013-1051`): a panel's fold frame is pinned by the first hit
it takes and later hits are resolved IN it via `hingeAt(panel, S, avoid)` with
`HINGE_MERGE = 0.35`, hinge stations stored along the shared forward axis measured from the
panel CENTROID so the coordinate does not move with the strike point, and phase derived
index-based with no new `rng()` draw. `buckle1` `lerp(0.040,0.135,e) -> lerp(0.030,0.196,e)`,
`foldAmp` `depth*0.52 -> depth*0.26`, `relax(touched, 0.05 -> 0.22)`, and `setLevel` cut from
7 impacts to 6 with front-metre hits 4 -> 3, the replacement follow-through deliberately
aimed at an already-hit panel so its fold MERGES rather than opening a fourth crease.
**PROPS: 0 mm at every level, monotonic and exact** (was splitter -158/-201/+134, grille
-72/-130/-163, lamps up to +127). Two root causes, both worth remembering: a **0.02 m pad on
the footprint box** which on a nose with a ~0.3 m/cm skin gradient was worth 320 mm of prop
travel, and reading the WELD CLOUD instead of the written vertex arrays — `writePositions()`
adds each vertex's rest offset and then runs the silhouette envelope guard, so the weld cloud
is not the skin on screen. Apply order is now pose-first-then-re-pin rather than a clamp
against the bind-sphere leading edge.
Crush depth survived: 0.2774 / 0.6355 / 0.7605 against the verified 0.2834 / 0.6414 / 0.7545,
deltas -6.0 / -5.9 / +6.0 mm, tail still pinned and `setLevel(0)` exactly stock. `buckle1` at
the briefed ~0.25 cost 21 mm at L0.4; 0.196 is where the three errors go symmetric — a
deliberate, measured deviation.
**THREE CONTAMINATIONS OF THE WAVELENGTH METRIC, all found by ablation:**
1. **A PRISTINE car in the same window measures 9.7 px / FWHM 86, and crush-with-zero-impacts
   measures 6.8 px.** Ablating `foldAmp` to 0 still gives 6.7 px; ablating all seven impacts
   still gives 6.8 px. **The 6 px period is NOT competing hinges — it is `car.js`'s metallic
   flake speckle plus the clearcoat wash breaking the highlight.** Geometry cannot reach
   18.5 px through a paint shader that imposes ~10 px on an UNDAMAGED panel.
2. **The measurement window contains the chrome grille slats** — five bright bars alternating
   with black at ~6 px pitch. The "6 px accordion" in the lower half of that window is
   literally the grille. On a grille-free patch of the nose lobe (`0.245 0.310 0.480 0.630`)
   the same before/after reads **7.3 -> 15.0 px**, i.e. the geometric wavelength DID roughly
   double.
3. **The 18.5 px reference figure is resolution-dependent** — `crash-cam-04`'s crushed fender
   measures 10.0 px at native 1920 and 20.4 px downsampled to 1600. **The same trap the road
   critic found in `hfRms`. Assume every spatial-frequency anchor in this project is
   resolution-dependent until proven otherwise.**
NOT LANDED: level 0.95 barely moved (5.9 -> 7.0). **NEW VISIBLE ARTEFACT at 0.7 and 0.95: the
grille now reads as an intact black box standing out of the wreck**, side walls exposed,
because it is pinned flush-correct while the fascia folds away — 0 mm by the agreed metric and
visibly wrong. A rigid prop can be neither shrink-wrapped nor protrude gracefully; this needs
a crushable or detachable grille from `car.js`. At level 0.4, the case the critic actually
cited, it is a clear win.

### TOOL BUG FOUND AND FIXED — `tools/probe.mjs` (orchestrator, 03:55)

The damage builder found `probe.mjs` failing `waitForFunction __ready` on every scene,
including `--expr "1+1"`, while `damage-shot.mjs` booted the same page fine. Cause: probe's
launch flags, MIME table, COOP/COEP headers and viewport had all drifted from the other two
harnesses. Fixed by making them identical to `shot.mjs`/`damage-shot.mjs`, with a comment at
the top of all-three-in-sync. Default viewport is now 1600x1000 and `--w` / `--h` are
accepted. **Verified working: `--expr "1+1"` returns 2, and a 1920x1080 run returns a live
`crash.shutter01`.**
**NOTE FOR CAMERA WORK: `_cammeas.js` reports frame-relative percentages, so pass
`--w 1920 --h 1080` explicitly when re-deriving chase-camera numbers**, or they will not
compare against the recorded values.

### !!! CROSS-CUTTING PROCESS FINDING FROM WAVE J — READ BEFORE PLANNING WAVE K !!!

**Concurrent builders now perturb each other's headline metrics badly enough to invalidate
unpaired before/after measurements.** Three independent builders hit this in the same wave:
- road r11 watched its ratio move 0.86 -> 1.11 with ZERO road.js changes, because `sky.js`
  landed an aerial-perspective change mid-round.
- world r12 saw frame luma go 77 -> 108 -> 81 across its session and declared every unpaired
  measurement in the round worthless.
- car r11 and crash r8 both had to re-render their own "before" under the new sky.
Each of them independently adopted the same discipline — **paired atomic A/B renders taken
minutes apart with peer files hash-checked stable** — and that is now the required protocol.
The alternative is to stop running ten builders concurrently when one of them owns a global
term (sky, post, camera). **Recommendation for Wave K: run `sky.js` and `world.js` in a
separate wave from the pieces whose metrics they move, or require every builder to report
paired A/Bs only.**

### SESSION 7 EXACT NEXT ACTION (rewritten 03:20 — supersedes everything above it)

1. **Wave J is COMPLETE — all ten builders landed and are written up above. Do not relaunch
   any of them.** `./tools/lint.sh` prints `lint ok` and all seven scenes were re-rendered to
   `shots/<sceneId>-r9.png` at 03:50.
1b. `tools/probe.mjs` was broken and is now FIXED and verified (see its block above). Camera
   work must pass `--w 1920 --h 1080`.
3. Run the WAVE K CRITIC SWEEP — ten fresh critics, one per piece, NO builders running
   concurrently, every critic re-measuring rather than trusting a builder. Point each one
   at its paragraph under the Wave J results you will have written, plus the standing
   constraints below.
4. A piece is done ONLY on `cannot tell` or `ours wins`. Nothing has reached that yet, but
   chase-camera came closest this session: its critic said it could not pick the real one
   from the static still and failed the piece purely on speed-dependent behaviour.

STANDING CONSTRAINTS — re-issue every sweep, and note several were CORRECTED this session:
  - no AgX; the tonemapper decision is CLOSED.
  - the per-preset grade is LIVE on the shipping ACES path (fixed and verified 02:00).
    Lifted blacks are authored. Any measurement of ours from before 02:00 is void.
  - **ROAD: measure resolution-matched.** `_bandmeas.mjs` angular-corrects the band radius
    but NOT `hfRms`, so `sips -Z 1920` the reference first. Corrected ref-01 anchors: dark
    12.48, bright 12.00, ratio 1.04. The old smear-length gap is a RESOLUTION ARTIFACT and
    is retired.
  - `wet-night-asphalt-01` is the bar; `-02` is motion-blurred and sets no numeric target.
  - **CHASE-CAMERA: the contact-line "geometric lock" is RETIRED** (it was only locked with
    height fixed). Corrected targets: depression 0.29-0.30, roof-to-horizon gap 7.8-8.8%,
    contact 0.769-0.771, car height ~20.5% to the roof PANEL. Depression is scene-generic —
    it is a ratio of offsets from the horizon, so focal length, resolution and aspect cancel.
    **Always state whether you measured the roof PANEL or the topmost point, on BOTH images**
    — conflating them is what produced two successive wrong targets.
  - **ENVIRONMENT: the 19-21 street-band sobel target is RETIRED as a camera artifact.**
    `daytime-downtown-04` is the only reference with our camera and scores 12.96 to our 13.83.
    Do not add props to chase it. Shadows are ALIVE. Mirrored signs are FIXED.
    **STRUCK BY WAVE K (k1): the clause "the shadow-ab MAD drop is pad dilution" was WRONG IN
    BOTH DIRECTIONS.** Three baseline runs put road MAD at 13.87-13.95 and hiding the pads moves
    it 2.5% (13.58), while meanOn lands INSIDE the baseline spread. `shadow-ab` has meanOn
    run-to-run variance of 1.0 and facade-MAD variance of 0.24 — it cannot resolve the pad
    effect at all. **Stop using shadow-ab to reason about pads.** Keep it only as the
    do-not-regress gate: road MAD must stay >12.
  - **BOOST: the 6.5:1 aspect target was measured off the HUD BOOST BAR in `boost-blur-04`,
    not a flame.** Real flames there are ~1.9:1. The depth gate is VERIFIED GOOD. This scene
    has ±6% run-to-run variance — render twice.
  - **DAMAGE: crush depth is 0.2834 / 0.6414 / 0.7545 m at levels 0.4/0.7/0.95** (29042 verts,
    rest 4.7500, tail pinned at -2.3750). The colour problem is in `car.js`, not `damage.js`.
    Render only via `tools/damage-shot.mjs`.
  - **AUDIO: analyse `ours-squeal.wav`, never `-solo`** (`audio-isolate.mjs:61` leaves
    `brake: 1` in the bed). `_audio-verify.mjs` is a CONFIRMED false fail — its page never
    constructs an AudioContext. **Verify in the busy mix, not only on stems.**
  - HUD is structurally incapable of being graded (separate DOM canvas layer).
  - CRASH: the dust plume and DOF are later rounds. The scene now captures at `simTime 0.9`,
    inside the slow-mo beat; anything measured before 03:00 is against a different frame.
  - any headline ratio MUST name its reference file and exact region/radius args.

**THE TRANSFERABLE LESSON OF THIS SESSION, worth re-reading before briefing anyone:**
three separate pieces were found optimising a number that had come loose from the thing it
was supposed to represent — the car glass matched p99 while reading as corduroy (p90 was
52% hot), the boost's spectral sweep scored perfectly on level-blind ratios while sitting
at -50 dB and inaudible, and the boost plume was stretched to 6.5:1 to match what turned
out to be a HUD graphic. **Always pair the metric with the eye (or the ear), and make the
critic name the reference region so the next round can re-derive it.**

reusable tools on disk — REUSE, do not rewrite: `_px.mjs` (JPEG-capable, repeatable
`--region name=x0,x1,y0,y1`), `_tm-measure.mjs`, `_skyprobe.mjs`, `_bandmeas.mjs`,
`_paintmeas.mjs` (reports grain period + highlight FWHM), `_facademeas.mjs`, `_cammeas.js`,
`_boostkernel.mjs`, `_smearmeas.mjs`, `_crop.mjs`, `_cropimg.mjs` (annotated crop-and-zoom,
new this session), `shadow-ab.mjs`, `damage-shot.mjs`, the `audio-*` suite.
`tools/shot.mjs` takes `--hash tone=agx&bloom=dual` for display-chain A/Bs.

## SESSION 6 — TONEMAPPER DECISION IS CLOSED. DO NOT REOPEN IT.

The session-5 tonemapper agent LANDED. It did not "switch" anything; it made the
display chain selectable off the URL hash and left ACES as the DEFAULT:
`#tone=aces|agx`, `#bloom=unreal|dual` (main.js:48-51, 74, 122, 125).
`post.js`'s AgxOutputPass + DualFilterBloomPass are no longer dead code, they are
just not the default path. It also left the A/B evidence on disk:
`shots/tm-{base,acesD,agxD,agxU}-<scene>.png` and `tools/_tm-measure.mjs`.

Session 6 re-ran that measurement to confirm the default before committing:

```
node tools/_tm-measure.mjs shots/tm-acesD-dusk-highway-chase.png \
  shots/tm-agxD-dusk-highway-chase.png shots/tm-agxU-dusk-highway-chase.png \
  reference/dusk-highway-chase-02.jpg reference/dusk-highway-chase-03.jpg
```

| file | blk | mtc | satHi | castR | roll |
|---|---|---|---|---|---|
| ours ACES  | 7  | 103 | 0.128 | 1.201 | 9  |
| ours AgX   | 28 | 128 | 0.202 | 1.233 | 15 |
| ours AgX+U | 31 | 127 | 0.213 | 1.244 | 20 |
| ref -02    | 4  | 65  | 0.178 | 0.812 | 61 |
| ref -03    | 6  | 53* | 0.232 | 0.856 | 13 |

DECISION: **keep ACES as default. Judge every piece under the default path.**
Reason, measured: AgX's black point is 28-31/255 against the references' 4-6 —
it fogs the shadows, which is the single most obvious "not a shipped game" tell.
ACES matches the reference black point almost exactly (7 vs 4-6). AgX only wins
on saturation retention and shoulder length, and both of those are reachable
inside ACES by grading. No material re-tune is invalidated. **Every critic from
here on judges the DEFAULT chain (no hash flags) — the render path did NOT
change, so ignore the session-5 warning about telling critics it did.**

### Two CROSS-CUTTING grade gaps that measurement found (not any one piece's fault)

1. **Our dusk is far too warm.** castR (R:G with G=1) is 1.20-1.24 for us vs
   0.81-0.86 in BOTH dusk references — the real game's dusk highway is
   BLUE-dominant sky-lit tarmac with only warm RIM light on the car, exactly what
   `reference/INDEX.md` says for `dusk-highway-chase-01`. We are rendering an
   orange wash over everything. This belongs to sky-lighting (sky.js light
   colours + fog colour), not to road or car.
2. **Highlight shoulder too hard and top-5% saturation too low.** roll 9 vs
   13-61, satHi 0.128 vs 0.178-0.232. Sodium/neon/brake highlights desaturate to
   white too early. Fix inside ACES with a pre-tonemap highlight desat-guard, not
   by switching to AgX.
Hand both to the sky r7 builder; do not let other pieces chase them.

### SESSION 6 WAVE C — CRITIC SWEEP IN FLIGHT (launched 00:57, ten agents, no builders)

`./tools/lint.sh` = `lint ok` verified on arrival at 00:53. All ten pieces were
built and are being critiqued simultaneously; NO builder is running, per the rule
that builders must never overlap visual critics.

| piece | round being judged | scene / harness | shot it writes |
|---|---|---|---|
| sky-lighting | r7 | dusk-highway-chase | shots/sky-lighting-r7.png |
| road-surface | r7 | wet-night-asphalt | shots/road-surface-r7.png |
| car-paint | r7 | car-paint-closeup | shots/car-paint-r7.png |
| environment | r8 | daytime-downtown + own shadow-ab A/B | shots/environment-r8.png |
| chase-camera | r4 | dusk-highway-chase, 4 numeric targets | shots/chase-camera-r4.png |
| boost-fx | r4 | boost-blur | shots/boost-fx-r4.png |
| crash-cam | r4 | crash-cam (+ dust-split call) | shots/crash-cam-r4.png |
| damage-model | r4 | **tools/damage-shot.mjs**, NOT scene crash-cam | shots/damage-model-r4.png |
| audio | r7 | audio-* harnesses, reuse don't rewrite | (no shot) |
| hud | r4 | hud-overlay | shots/hud-r4.png |

Each also copies its shot to `shots/<piece>-latest.png` for progress.html.
If this session died mid-sweep: check which `shots/<piece>-r<N>.png` exist and
relaunch only the missing critics. Then run the Wave D builder fan-out, one
builder per file, brief = that piece's Wave C verdict.

## SESSION 6 WAVE C VERDICTS — these ARE the Wave D builder briefs

**sky-lighting r7: `real wins`.** Root-caused the session-6 cross-cutting warm
cast to a single bug, with numbers. GAP: our zenith has no sky. Both dusk refs
show a deep saturated teal zenith that is DARKER than the horizon; that vertical
teal->sodium ramp is the whole read. Ours is a near-opaque warm-lit cloud deck
over the entire dome, so the zenith is pale pink and brighter than everything.
  Zenith strip (top 8%): ours rgb 198/172/176, sat 0.13, B/R 0.89, mean L 180,
  p01->p99 spread 90 levels (cloud banding).
  Refs: 62/100/105 sat 0.41 B/R 1.70 (-01); 85/124/156 sat 0.45 B/R 1.83 (-03);
  56/94/115 sat 0.52 B/R 2.07 (-04). Mean L 86-118, spread only 16-24 (clear sky).
  So our zenith is 1.7x too bright, a third of the saturation, and HUE-INVERTED.
  That one fact produces the measured castR 1.21 vs 0.81-0.95 and satHi 0.139 vs
  0.178-0.45. It pairs with nearRoad rgb 23/16/24 (median 18, 31% of pixels under
  16) vs refs' 61-77 with medians 60-86: a pink dome that lights nothing, instead
  of a blue dome that fills the tarmac.
FIX (sky r8 brief): `game/sky.js:515-516` shades clouds from two CONSTANT LUT
taps — `warmL = lutAt(0.02, 0.030)` and `coolL = lutAt(0.72, 1.10)` — so a zenith
cloud is shaded with the identical sodium/cool pair as a horizon cloud. Make the
cool term DIRECTIONAL by tapping the LUT at the pixel's own elevation/sun-angle
coords (the ones already feeding `col`), so a deck's self-occluded side inherits
local sky radiance: teal overhead, sodium only near the sun. Gate `warmL` by an
angular falloff on `cs` so the sun's colour cannot reach 90 deg away. Then cut
`clouds.alto` 0.92 -> ~0.45 and `cirrus` 0.60 -> ~0.30 at `sky.js:712` so the
analytic zenith is visible in the top third instead of 92% occluded. Finally
raise `ambientIntensity` (`sky.js:683`, now 0.95 against `ambient: 0x7592c0`)
once the dome is cool, so the road picks up blue-grey skylight instead of median 18.

## Layout on disk

```
reference/          real Burnout Paradise stills + audio, labelled (the BAR)
reference/INDEX.md  one line per reference: filename -> camera situation
game/               the game (static site, three.js via importmap CDN)
game/index.html     entry
shots/              critic screenshots, named <piece>-r<NN>.png
progress.html       live progress page (pieces x rounds x latest shot vs ref)
tools/shot.mjs      playwright screenshot harness (see usage below)
STATE.md            this file
```

## ALWAYS run the linter before screenshotting

```
./tools/lint.sh          # ESM parse-check of every game/*.js
```
A syntax error in a game module surfaces ONLY as a 60 s
`page.waitForFunction: Timeout` from `shot.mjs`, with no console output and no
page error - it looks exactly like a hung renderer. `node --check foo.js` will
NOT catch it (CommonJS goal ignores duplicate top-level `const`); the linter
copies each file to `.mjs` first, which does. Session 4 lost time to exactly
this: two r2 builders both added `const downtown` / `const towers` to
`world.js`, and the whole game was dead.

## Screenshot harness

```
node tools/shot.mjs --scene <sceneId> --out shots/<name>.png [--w 1920 --h 1080]
```
It boots a static server on a free port, loads `game/index.html#scene=<sceneId>`,
waits for `window.__ready`, drives the deterministic camera/scenario named by
`sceneId`, and writes a PNG. Scene ids match the reference camera situations.

## Pieces (each judged alone, looped until critic picks ours or can't tell)

| # | piece | round | verdict | next action |
|---|-------|-------|---------|-------------|
| 1 | sky-lighting (dusk HDR, sun, fog, tonemap) | 11 | r11 BUILT: aerial terminal colour is now the sky itself, read from the same LUT. gndBelow sat 0.719->0.478, gR 0.657->0.282. shipped INTERIM CLAMPS on two presets at full sky mix | k1 critic: REAL WINS. gap: dusk horizon is grey BY CONSTRUCTION (betaR cancels in the ms src/ext at saturated optical depth) -> sky.js:371,386-387. One fix retires all 3 preset aerialSky clamps. brief: verdicts/wave-k/sky-lighting.md |
| 2 | road-surface (asphalt, wet, markings) | 11 | r11 BUILT: ambient chip floor shipped, but the briefed dark/bright gap INVERTED - planar mirror is what drives the ratio. builder RECOMMENDS retiring that score entirely | k1 critic: REAL WINS. gap: chip lens point-samples the planar mirror +/-6 texels PER PIXEL -> dither that FAKES the grain anchor (13.38 vs ref 12.48) -> road.js:1161-1163. Ratio score RETIRED, replaced by SCALE-PERSISTENCE. brief: verdicts/wave-k/road-surface.md |
| 3 | car-paint (flake, clearcoat, env reflections) | 11 | r11 BUILT: both gaps landed. glass p90 139.3->76.9 vs ref-03 90.4. KNOWINGLY shipping one regression on wet-night-asphalt at a near-grazing angle | k1 critic: REAL WINS. gap: glass normal AMPLITUDE (not frequency) -> panes read as specular lamellae -> car.js:922-950. Wet-night regression REPRODUCED and judged NOT acceptable; it is in all 3 scenes. brief: verdicts/wave-k/car-paint.md |
| 4 | environment (buildings, props, density) | 12 | r12 BUILT: contact pads fixed. OVERTURNED both brief premises - building skirts not car pads were the dilution mechanism, and pads INFLATE shadow-ab MAD rather than diluting it. signFrame cap was truncating and hiding a worse bug | k1 critic: REAL WINS. gap: atmoTail spends haze on desaturate-to-own-luma (PRESERVES contrast) + uHazeD reads a dead 0.001 placeholder -> world.js:868-872,2749 + sky.js:1404. Depth ordering is INVERTED. brief: verdicts/wave-k/environment.md |
| 5 | chase-camera (FOV, spring, shake) | 8 | r8 BUILT: the pose now holds across the ENTIRE speed range (r7 critic could not pick the real one on the still; it failed only on speed-dependent behaviour). CLOSEST PIECE TO DONE | k1 critic: REAL WINS - but COULD NOT PICK THE REAL ONE ON THE STATIC STILL. All four static targets pass at EVERY speed (r8 reproduced to the digit). It fails on LONGITUDINAL ACCELERATION: distAccel=0.16 feeds accel into the spring TARGET so it is a sustained +/-46% standoff offset that NEVER recovers while the input is held (at brake -26 the contact line leaves the frame). Fix = inject into spring VELOCITY. brief: verdicts/wave-k/chase-camera.md |
| 6 | boost-fx (blur, streaks, aberration, flame) | 8 | r8 BUILT: tint ramp now driven by emitted radiance. the 10.2 px hero hole was a PREPASS MEASUREMENT ARTEFACT; the jet capsule was what held the tarmac sharp, now fixed | k1 critic: REAL WINS. gap: radial accumulation is a BOX MEAN = energy sink; 52 px kernel yields 1.8 px correlation, and the pass REMOVES 75% of near-road HF energy. Kernel length is NOT the lever. brief: verdicts/wave-k/boost-fx.md |
| 7 | crash-cam (slowmo, debris, deform) | 8 | r8 BUILT: glass debris reads as dark grit with a few glints. BUT the metric is now BACKGROUND-LIMITED and glass no longer drives it | k1 critic: REAL WINS. gap: stepSparks emits r=2.8x additive, clipping the first 63% of its own pow(v,2.2) taper -> hard-edged square-ended bars -> crash.js:2058-2073. brief: verdicts/wave-k/crash-cam.md |
| 8 | damage-model (panel deform, scratches) | 8 | r8 BUILT: prop tracking FULLY fixed, 0 mm at every level, monotonic and exact. found THREE separate contaminations of the wavelength metric by ablation | k1 critic: REAL WINS. gap: bonnet is the only torn panel with no sheet thickness or interior - two paper sheets 5 cm apart, 4%-albedo back -> damage.js:764,715. Prop '0 mm' was TAUTOLOGICAL. brief: verdicts/wave-k/damage-model.md |
| 9 | audio (engine, boost, crash, tire) | 11 | r11 BUILT: engaging boost now makes the busy mix audibly LOUDER. boost centroid corrected to 3525->4298 Hz. the brief's fix alone was NOT enough - measuring in the busy mix is what revealed it | k1 critic: REAL WINS. gap: boost has NO IGNITION TRANSIENT - contour only rises -> audio.js:703-712. 'boost makes mix louder' NOT reproduced: same-timeline truth is +0.09 LU, inaudible. brief: verdicts/wave-k/audio.md |
| 10 | hud (speedo, boost bar, minimap) | 8 | r8 BUILT: both priority items landed (notch RMS + blown core). reusing makeGrungeTexture FAILED as an approach - do not re-brief it. tools/_hudedge.mjs now on disk | k1 critic: REAL WINS. gap: lick amplitude hard-coded ASYMMETRIC - top rail ruled (sd 4.0) while bottom throws 2.5-3.1x (sd 28.2), ref is 0.7-1.0 -> hud.js:559-560. Blown-core gap CLOSED. brief: verdicts/wave-k/hud.md |
| 11 | crash dust plume | - | RETIRED as a separate piece by the r4 crash critic - stays inside crash-cam as its next round | n/a |

Verdict values: `not started`, `building`, `critic: real wins (gap: X)`,
`critic: ours wins`, `critic: cannot tell` (= piece DONE).

## Done so far

- `tools/shot.mjs` screenshot harness, `tools/serve.mjs` (repo root on :8777),
  `tools/CRITIC.md` (reusable critic prompt template), `progress.html`.
- **reference/ COMPLETE** — 28 stills, 4 per scene-id, all 7 situations filled,
  all >=1280px real JPEGs. Sources: EA/Criterion press stills off the Steam
  appdetails CDN (apps 24740, 1238080) + triaged Steam Community captures.
  `reference/INDEX.md` has the per-image "what makes it look real" spec column —
  that column is the actual build spec, read it before building any piece.
  Caveat: Paradise has no rain, so `wet-night-asphalt` = night + neon on damp/
  specular tarmac. `wet-night-asphalt-01.jpg` (neon Billiards storefront) is the
  strongest of that set — treat it as the bar.
  `reference/audio/` — 8 CC0 SFX (engine, boost x2, crash x2, tire x2), tonal
  target only, not game rips.
- Do NOT re-fetch references. That work is finished.

## Skeleton: DONE

All 10 modules exist in `game/` and all 7 scene ids render non-blank
(`shots/skeleton-*.png`, plus `shots/_sanity.png` verified 21:47 session 2).
Do not rebuild the skeleton.

## File ownership (avoid parallel-edit collisions)

One builder per file, never two builders on the same file in one batch:
sky-lighting->sky.js, road-surface->road.js, car-paint->car.js,
environment->world.js, chase-camera->camera.js, boost-fx->boost.js,
crash-cam->crash.js, damage-model->damage.js, audio->audio.js, hud->hud.js.
`main.js` / `scenes.js` are shared: builders may only make minimal surgical
Edits there, never rewrites.

## Session log

- Session 2: batch-1 builders (sky/road/car/world) DID land - sky.js, road.js,
  car.js, world.js all substantially rewritten (20-58 KB each) before the
  session ended. Do not re-run those builders from scratch; iterate them.
- Session 4 (22:20-02:05): arrived to a DEAD game (duplicate `const downtown` in
  world.js from two r2 builders sharing a file) - added `tools/lint.sh`. Then ran
  builder+critic waves for all 10 pieces. Pieces 5,6,7,8,10 went from skeleton to
  full builds. Every piece critiqued at least twice; all still `real wins`.
  Orchestrator-level fixes made directly: `util.js normalFromHeight` filtering +
  dither, `sky.js midday.sunElevation` 68->42. Verified-and-dismissed one false
  bug report (double tone mapping). Spawned a dedicated shadow-diagnostic agent
  after four rounds of "no shadows" reports proved builders could not find it.
- Session 3 (22:00): harness re-verified healthy after those edits
  (`shots/_sanity2.png`, ~8s per render). Ran round-1 critics for pieces 1-4:
  **all four came back `real wins`** - full verdicts recorded below. Launched
  round-2 builders for all four (sky+post, road, car, world) at 22:12 plus the
  audio builder (piece 9). If a session dies here, the r2 briefs are the four
  verdict blocks below - relaunch any builder whose piece is still at round 1.

## Audio measurement tooling - REUSE, do not rewrite

`tools/audio-capture.mjs` renders WAVs from the live game to `shots/audio/`.
`tools/audio-isolate.mjs` separates a one-shot (boost/crash/tyre) from the
engine bed by seeded A/B render subtraction - pre-event residual measures 0 to
-92 dB, so it is clean. Round 1 measured boost/crash/tyre WITH a full-throttle
V8 underneath and those numbers were not comparable to the one-shot references;
always isolate first.

**audio r2** - real wins. Engine claim from r2 independently reproduced (10.8 dB
idle / 7.0 dB high rpm mean 32-band error). GAP: boost is unfiltered full-band
white noise - mean band |delta| 13.5 dB vs boost-whoosh-01 and 19.5 dB vs -02,
against 9.0-10.8 for crash and 10.0-10.5 for tyre. Isolated boost centroid
6547 Hz vs 2274/481, rolloff85 14355 Hz vs 4365/598, flatness 0.1311 vs
0.0010/0.0000 (~100x flatter); its 32-band curve spans 22 dB where the
references span 69 and 91 dB. CAUSE was a wiring bug at audio.js:485-487 -
`jetPk = mkFilt('peaking', 2600, 4, out)` wired to `out` at construction and
then fed by `jetG.connect(jetPk)`, so jet noise reached the bus through a
PARALLEL peaking EQ and bypassed the `jetF` bandpass entirely. FIX: series
`jetG -> jetF -> jetPk -> out`, 2-pole lowpass after it automated to 4-5 kHz,
pink (-3 dB/oct) noise tilt, and an amplitude contour (fast attack, exponential
decay into a lower sustain) - `floorBelowMedian` was 2.7 dB vs 6.6/39.7.

**audio r3 build** - series rewire `jetG->jetF->jetPk->jetLP(3.8-5 kHz)->out`,
pink jet source, 72 Hz 24 dB/oct HP on the boost bus, contour 22 ms attack /
0.34 s exp decay into -13 dB sustain. Second finding: the flat envelope was NOT
only the jet - the sidechain held a STATIC 42% engine duck, so "isolated boost"
was largely an inverted V8 (f0 112.5 Hz = firing frequency). Duck now tracks the
contour transient only. Audit found no other parallel-bypass; tyre f1/f2 and
engine clatter are intentional parallel branches. Isolated boost centroid
6547->1704 Hz (refs 2486/550), flatness 0.1311->0.0028 (refs 0.0029/0.0000),
band err 12.5->8.8 vs ref 01 and 18.5->12.9 vs ref 02. `floorBelowMedian` is
still only 4.5 dB vs 28.3/39.3 - likely the next gap.

**audio r3 critic** - real wins. Boost claims independently verified and hold.
GAP: `setSpace` is inaudible - the three spaces render as the same room.
`open`->`tunnel` differ 7x in reverb send, 4.1x in IR length and 2.3x in return
LP, yet move the mix only 0.23 dB mean / 0.5 dB max across a 40-band envelope
(difference signal 22 dB below source); isolated crash tails show T-40 spread of
190 ms for a 2.2 s IR-length spread and C80 spread of 0.3 dB. CAUSE:
`convolver.normalize = true` (~audio.js:206) over a dense full-length noise IR -
WebAudio's equal-power normalisation divides by total IR power, so the longer
tunnel IR is scaled DOWN by about the same factor its send is scaled UP and the
two cancel. For scale, the same metric shows 7.07 dB mean between low and high
rpm in one gear, so 0.23 dB for a whole room change is noise-floor. Two more:
`main.js` never drives the panner/doppler path (rival passing 4 m right swings
only 6.9 dB L/R over a 55.6 dB distance sweep), and the doppler ratio at
~audio.js:884 has the source term SIGN-FLIPPED - a receding rival goes +550
cents instead of -560. FIX: `convolver.normalize = false`, normalise each IR to
a fixed direct-to-reverberant target, explicit per-space `revReturn` gain,
Schroeder/FDN late field (4-8 mutually-prime delay lines, per-channel
independent all-pass) so tunnel decorrelates, flutter comb from the existing
`PERIODIC(0.0165, 26)` taps at higher gain. Targets: C80 spread >= 8 dB, T-40
spread >= 800 ms, tunnel tail L/R correlation < 0.4. Doppler `(c-vl)/(c+vs)`.
Tooling now also includes `tools/audio-scene2.mjs`.

## Round-5 critic verdicts (the r6 build briefs)

**sky-lighting r5** - real wins. GAP: the sun's glare is a screen-wide UNIFORM
veil, not a depth-dependent one - it lifts the black point on foreground asphalt
two metres from the lens (which has no air column in front of it) and
simultaneously washes the zenith to pale pink, so the sky never shows the deep
teal Rayleigh falloff all four references hold at the top of frame. FIX:
threshold the bloom higher and shorten its radius so only the solar disc and
specular hits contribute, then move the frame-wide haze into the depth-driven
aerial-perspective term so near geometry stays unfogged.
CAUTION for whoever builds this: the critic also prescribed "use an analytic
Preetham/Hosek sky instead of a vertical ramp" and "grade with ACES/AgX" - both
are ALREADY implemented (sky.js bakes a single-scattering integral into a
sky-view LUT; post.js does AgX). Ignore those two prescriptions; the real defect
is only the bloom veil radius/threshold and near-field fog.

**road r5** - real wins. GAP: our aggregate is albedo-BRIGHTENED rather than
wetted - the foreground is salt-and-pepper light-grey pebbles sitting BRIGHTER
than the water film, with reflections passing over them uninterrupted. On real
wet asphalt water fills the voids, the surface darkens toward near-black, and
aggregate survives only as low-contrast micro-modulation of the specular sheen,
never as bright specks on top. FIX: keep aggregate in the normal/height map ONLY,
not in albedo; multiply albedo down 0.35-0.5x and lerp roughness to 0.05
wherever wetness > 0 so aggregate contrast collapses as gloss rises; confine
puddle mirror reflection to cavity regions via the height map so stone tips break
the reflection instead of floating over it.

**car-paint r5** - real wins. GAP: the bodywork contains no reflected IMAGE of
the world - flanks are a smooth vertical Fresnel gradient over flat red/black
with zero city, guardrail or ground detail, and no body-horizon line where sky
reflection hands off to dark ground reflection. That is what makes panels read as
tinted translucent plastic rather than clearcoated steel. FIX: parallax-corrected
(box-projected) local cubemap probe re-rendered from the car's position, not a
static sky IBL, so buildings and guardrail land at the right parallax; layer SSR
on the lower flank and rocker so the road supplies the dark ground band. The
flake/clearcoat two-lobe response was judged already convincing - keep it.

**boost-fx r2** - real wins. GAP: the hero car is smeared by the same blur field
as the world - panel edges, spoiler and tail lights are as soft as the guardrail
- where `boost-blur-02/-03` keep the car razor sharp punching a hole through a
40+ px radial smear, so the blur reads as camera-relative velocity rather than a
full-screen filter. FIX: render a velocity/stencil mask for the hero vehicle and
attenuate the radial kernel to zero over it, feathered a few px; drive kernel
length by radial distance from the vanishing point rather than uniform
screen-wide strength; multi-tap accumulation along the radial vector so streaks
ghost rather than box-average. (Note: the r2 builder believed it had already
built a capsule blur mask car->jet-tip. It is not working - diagnose before
rebuilding.)

**crash-cam r2** - real wins. GAP: the debris carries no impact impulse - uniform
confetti of flat-shaded cubes and tetrahedra, all the same size, no motion blur,
strewn evenly across the road plane instead of fanning radially from one contact
patch, so nothing identifies where the collision happened. FIX: spawn debris from
the collision manifold as a velocity cone with per-particle speed inherited from
the contact impulse plus angular spin, so density and shard size fall off with
distance from the impact point; render each shard stretched along its velocity
(velocity buffer, or cheaply scale the billboard along view-space velocity); add
a fast-fading sub-pixel shard tier so it reads as spray, not props.

**damage-model r2** - real wins. GAP: the wreck deforms as ONE continuous smooth
envelope - the whole body tapered and stretched along a single axis into rounded
taffy lobes, no panel boundaries surviving. Burnout wrecks keep every panel as a
discrete rigid plate: crumple localised inside panel edges, terminating at seams,
producing sharp fold ridges that catch a hard specular line, gaps widening
asymmetrically. FIX: split the body into per-panel submeshes (hood, each fender,
doors, quarters, roof, bumpers) and drive damage as per-panel LOCAL deformation
with an independent impact origin, clamped displacement and a hinge/attachment
transform - not one global vertex-displacement field over the whole shell.
Recompute normals with a crease/fold threshold (flat-shade the fold band) so
buckles get sharp ridges, and offset seams outward on impacted panels to open
real gaps.

**hud r2** - real wins. GAP: the minimap is an untextured procedural vector
diagram - flat mid-grey rectangles and hairline roads on a black field,
axis-aligned, plain rounded-rect border - where every reference minimap is a
heading-rotated photographic satellite/street texture card (green parkland,
water, building albedo) inside a torn-edge plate. Ours reads as debug canvas
geometry. FIX: bake a real map texture tile (desaturated green parks, blue water,
warm road casings over cool blocks), sample and rotate it to the car's heading so
the card spins under a fixed player arrow; frame it with the same torn/marker
plate treatment as the boost bar and district plate, plus a soft 2-3 px drop
shadow so it sits as a card rather than a hole cut into the scene.

**chase-camera r2** - real wins. The lens fix landed and was independently
re-measured good: horizon 49.4% (refs 49.1-49.8), car 21.1% of frame width
(ref-03 23.8%), contact patch 77.1% (ref-03 76.9%), hFOV ~71 deg. GAP: camera
HEIGHT above the roofline. Using the FOV- and distance-independent invariant
`roof-to-horizon gap / contact-patch-to-horizon gap = 1 - roof/cam height`, ours
is 21/299 = 0.070 vs 0.31 in ref-02, 0.26 in ref-03, 0.13 in boost-blur-04. The
references leave 7-8.5% of frame height of open road between roofline and
horizon; ours leaves 1.9% and the roof scoop BREAKS the horizon (roof 48.1% vs
horizon 49.4%). Camera sits 1.07x roof height where Burnout sits ~1.4x. FIX:
height 1.50 -> ~1.85, distance 6.8 -> ~8.0 so the contact patch holds near 77%,
plus ~0.3 deg down-pitch (`FRAME.pitchBase` 0.10 -> 0.40) to keep the horizon at
49%. Target invariant 0.26-0.31.
USE THIS INVARIANT for all future camera judging - it is independent of FOV and
distance, so it cannot be gamed by trading one against the other.

## Round-4/1 critic verdicts, continued

**road-surface r4** - real wins. GAP: wet patches are physically INVERTED - they
render LIGHTER and pinker than surrounding dry asphalt, flat mauve blotches with
hard dithered edges and no specular image, where standing water darkens albedo
toward black and returns a mirrored vertically-stretched image of the lamps and
facades above (refs -01, -03). FIX: one mask that simultaneously multiplies base
colour DOWN (0.35-0.5x albedo - water fills aggregate voids and kills diffuse
backscatter) and drops roughness to 0.05-0.1 while raising F0 to water's 0.02
with a strong Fresnel ramp, instead of tinting albedo up. Feed the patches from
SSR or a stretched planar probe so each puddle carries a real elongated
reflection, and blur mask edges with a thin damp-transition band rather than a
hard noise threshold. The microrelief/POM work from r3-r4 is fine - the defect
is the SIGN of the wetness term.

**environment r4** - real wins. GAP: no directional key light - both canyon
walls at the same mid-grey, no facade plane darker than its perpendicular, no
building casting onto a neighbour, sidewalk or road. Reads as an AO-only clay
render. (Root cause found by the orchestrator - see below. Remaining work: check
castShadow coverage - only 118 of 818 meshes were casters; drop ambient/IBL to
~1/3 of the sun; cooler sky bounce; PCSS/small-radius PCF contact hardening.)
SECOND ISSUE: procedural sign text renders as garbled pseudo-letterforms
("MYBIIFOURBO", "UCHBBCII ABE") - an instant procedural tell. Needs a curated
word list.

**chase-camera r1** - real wins. GAP: lens far too wide - ~98 deg horizontal /
65 deg vertical vs ~72/44 measured off `dusk-highway-chase-03.jpg`. Our car
covers 14.4% of frame WIDTH vs 20-23% in every 16:9 reference. Vertical framing
is already correct and must be preserved: car height 21.5% (refs 16.5-22.5),
contact patch 76% (refs 74-84), horizon 49.5% (refs 49-51), vanishing point
centred. FIX: `scenes.js` dusk-highway-chase to `fov: 46`, `fovSpeed: 8`;
`camera.js` `FRAME.fovMax` 82 -> ~58; height 2.15 -> ~1.3; trim distance only
after the FOV change.

**boost-fx r1** - real wins. GAP: no exhaust flame, only an isotropic orange
bloom haze under the rear bumper with no direction, length or temperature
gradient. `boost-blur-01` shows a hard-edged two-stage cone - blue-white core a
few cm off the pipe transitioning to green-yellow over ~a car length, elongated
along velocity. FIX: extruded jet geometry (tapered cone / camera-facing ribbon
anchored per tailpipe, oriented down the exhaust axis, stretched by velocity),
additive blackbody ramp running ALONG the jet, +/-20% at ~20 Hz length/width
flicker, and feed only the CORE into the bloom threshold so the halo is an aura
around a hard-edged flame instead of being the flame. Blur/streaks/CA/vignette
were judged good - keep them.

**crash-cam r1** - real wins. GAP: no volumetric medium - zero dust, tyre smoke
or ground plume at the contact point, so the wreck and debris hang in clear air
with nothing anchoring them. FIX: soft-particle dust emitter at first ground
contact (~40-60 camera-facing billboards with a depth fade), half-Lambert lit
against the sun, per-particle rotation and expanding radius; a second fast
low puff along the tumble path; a skid/scuff decal under the launch point;
per-particle velocity motion blur or streak billboards on debris. NOTE: the r1
builder claimed it already built dust and the critic saw none - diagnose why the
existing puff is invisible before adding more.

**damage-model r1** - real wins. GAP: the shattered windshield is a flat, fully
OPAQUE white scribble rectangle pasted on the body - an axis-aligned quad whose
straight edges cut across the roof pillar and door line, hiding the cabin, with
uniform equal-weight crack strokes and no impact origin. Refs -03/-04 show
fracture inside a still-TRANSPARENT pane radiating from a strike point with the
interior readable behind it. FIX: kill the decal quad; render fracture on the
real windshield mesh (`car.deformTargets` exposes it) as a transmissive
material, cracks radiating from the recorded impact point (dense concentric web
near the hit, sparse long radials outward), thin bright specular caustic on the
crack lines rather than flat white albedo, opacity dropped only in a small
crushed-frost core.

**hud r1** - real wins. GAP: the minimap is a flat graph-paper grid of uniform
grey lines on a solid olive panel - no map at all, reads as an unfinished
placeholder. FIX: draw from real world data - varied road widths (arterial vs
side street), a muted district basemap with green/water blocks, worn off-white
road fill on dark grey, plus the objective flag and route pins the references
always carry, all on the same rotated drop-shadowed card as the district plate.
Boost bar, speedo and banners were NOT the complaint.

## Session 4 orchestrator fix: midday sun elevation 68 -> 42 deg

The environment r4 critic said there was NO directional key light and not one
building cast a shadow, which contradicted the builder's report of hard head
shadows. I probed it directly rather than trusting either: the shadow map was
fine (4096, +/-62 m, normalBias 0.035, 118 casters, 231 receivers, sun intensity
4.6) - the problem was `sky.js` `midday.sunElevation = 68`, a near-overhead sun.
Shadows fell almost straight down, so both sides of the canyon sat at the same
luminance. Changed the midday preset to 42 deg (`lightElevation` too). If a
critic ever reports "no shadows", probe the sun ANGLE before touching the
cascade.

## Round-4 critic verdicts (the r5 build briefs)

**sky-lighting r4** - real wins. GAP: the cloud layer has no optical-depth
shading - every streak is the same pale salmon value from zenith to horizon, so
the clouds read as a 2D noise texture on the dome rather than volumes. Real dusk
cirrus is brightest only where it is THIN and near the sun and goes cool
blue-grey where thick or far from the sun; the references show that warm/cool
value split clearly, ours shows one flat tint. FIX: shade the deck with a
Henyey-Greenstein forward-scattering phase term driven by view-to-sun angle and
modulate brightness by ACCUMULATED DENSITY (multi-octave fbm thickness) so thick
regions self-occlude toward the cool zenith colour while thin sun-adjacent wisps
blow out warm. Add a second slower-parallax LOWER deck for depth, and
desaturate/lift cloud value toward the horizon so aerial perspective carries the
distance cue rather than sun bloom alone.

**car-paint r4** - real wins. GAP: panel seams render as bright emissive-looking
lines - door shuts, A-pillar, hood cut and fender edges all glow LIGHTER than
surrounding paint. A real panel gap is a recessed cavity: the darkest thing on
the flank, an AO trench with at most a thin highlight on the near lip. Ours
inverts the physics, so the bodywork reads as decal-painted stripes on one
blobby shell rather than separate stamped pressings. FIX: seams as
geometry-driven DARKENING, not lines - a gap mask multiplying AO/cavity
darkening into clearcoat and base (target 0.2-0.35 albedo in the trench), with
only a sub-pixel specular sliver on the raised lip via a narrow ~2-3 mm
normal-map bevel. Kill any additive/emissive contribution on the seam channel
entirely; let the shoulder-crease specular streak be the ONLY bright continuous
line on the flank.

## Round-3 critic verdicts (the r4 build briefs) - all four still `real wins`

**sky-lighting r3** - real wins. GAP: the cloud deck is radially symmetric about
the sun - wisps fan outward as evenly-spaced spokes in every direction and hold
near-constant angular size from zenith to horizon. Real cirrus/altostratus is
advected by wind shear into parallel bands, and perspective on a finite-altitude
layer compresses it into thin horizontal ribbons that stack and converge at the
horizon (refs 02, 03). Ours reads as a noise texture on a hemisphere with a
sun-centred domain warp - a shader, not weather. FIX: project the cloud noise
onto a flat plane at fixed altitude and sample it with the view ray
(`t = (h - camY) / rayDir.y`), which gives horizon compression for free and
kills the radial symmetry. Drive the noise with an anisotropic domain scale
(~4:1 along a single WIND vector, not toward the sun) plus a second
slower-scrolling octave for shear. Reserve sun-relative variation for
forward-scattering brightness and silver lining only, never for cloud shape.

**road-surface r3** - real wins. GAP: near-field aggregate microrelief still
absent. In the bottom third of frame (camera ~1-2 m off the deck, individual
chippings should resolve) the asphalt is a smooth low-frequency wash of soft
grey-brown gradients with a few thin scratch lines, so wetness reads as varnish
on a flat plane. Ref 01's forecourt and 02's tarmac hold per-stone detail at the
same distance: each chip carries its own micro-shadow on the shaded side and a
tiny wet glint on the crown, and the wet/dry boundary follows stone geometry
into hard-edged puddles sitting in real depressions rather than fading through
an airbrushed mask. FIX: tiling detail-normal + HEIGHT layer at ~10-20 cm UV
scale driven by parallax occlusion mapping so near-field chippings self-shadow;
let the same heightfield drive a water-accumulation mask - puddles fill below a
height threshold with roughness near zero and a HARD alpha edge, crowns above
water stay rough and matte. Perturb the reflection ray with that detail normal
so streaks break into per-stone glints near-field and only converge into
coherent mirror streaks at grazing angles toward the horizon.

**car-paint r3** - real wins. GAP: the bodywork is one unbroken soap-bar volume -
no shutlines, panel gaps or shoulder crease anywhere - so the clearcoat has no
edge to catch on. Every reference car resolves a razor-thin near-clipping
specular line running the length of the shoulder and a second along the rocker,
with hard breaks at door and hood seams. Ours smears a single wide low-frequency
reflection blob across the flank that visibly POSTERIZES into stair-stepped
bands over the door, and the glass canopy melts into the roof with no A-pillar
or seal. FIX: real geometry - bevelled shutlines (2-3 cm inset channels with
their own normals) around doors, hood and hatch, plus a hard shoulder crease
along the beltline so the specular breaks and reforms per panel. Second GGX lobe
at roughness ~0.03 over the rougher flake base, sampled from a high-mip-count
HDR env probe rather than a low-res cubemap; dither or use RGBM/float reflection
targets to kill the posterization. Separate the glass into its own mesh with an
A-pillar and rubber seal, IOR 1.5, Fresnel-weighted sky reflection over a dim
visible interior.

**environment r3** - real wins. GAP: facades have zero surface relief - windows,
storefront glazing and signs are coplanar decals on flat extruded slabs, so no
element on a building ever casts a shadow onto another element of that same
building. In every reference the windows are recessed behind sills and mullions,
cornices and canopies overhang, and each step lays down a hard sun-side shadow
plus a dark AO seam. That inter-element shadowing is what gives reference
buildings mass; without it ours read as printed cardboard flats. It compounds
because our street canyon is exactly as bright as the rooftops - no vertical
light gradient down the facade at all. FIX: push real geometry, not texture -
inset every window plane 0.15-0.3 m behind the wall with a modelled sill and a
0.4 m cornice/parapet lip per floor band, and let the sun shadow map (tightened
cascade, 2-3 cm texel near camera) resolve those steps. Add SSAO at ~1 m world
radius so recesses, awning undersides and wall-to-sidewalk junctions darken, and
bake a vertical AO gradient so the lower third of each canyon sits noticeably
darker than the roofline.

## Round-2 critic verdicts (the r3 build briefs)

**sky-lighting r2** - real wins. GAP: our sky dome is a pure analytic vertical
gradient with zero cloud or aerosol structure - the upper two-thirds is a
featureless blue-to-cream ramp, while every reference has banded
cirrus/altostratus lit from below that gives the sky depth, a scattering
direction, and a reason for the horizon to be warm. Compounding it, our sun is a
single blown horizontal streak sitting exactly on the horizon with no vertical
glow column, so it reads as an anamorphic lens artifact rather than a disc
scattering through kilometres of atmosphere. FIX: two-layer scrolling cloud pass
on the dome (low-frequency FBM/curl-noise altostratus + thinner high cirrus),
shaded by a cheap forward-scattering term so undersides pick up warm sun colour
and tops stay cool teal. Replace the horizontal sun streak with a real Mie
forward lobe in the sky shader (`pow(dot(viewDir,sunDir), ~8-24)` warm halo
spreading radially, lifting the whole horizon band) and let bloom key off that
HDR halo rather than an anisotropic streak kernel.

**audio r1** - real wins. Judged on measured signal properties, not by ear; the
critic built `tools/audio-capture.mjs` + an analysis script and rendered WAVs to
`shots/audio/`. Reuse that tooling every round. GAP: at high rpm our engine has
no low-frequency body - 0.2% of energy below 200 Hz (centroid 5237 Hz,
rolloff85 10.6 kHz) vs the reference's 45.4% (centroid 1377 Hz, rolloff85
2.5 kHz); bottom 10 of 32 log bands are 31-40 dB down vs 0 to -13 dB, a 19.7 dB
mean band error. Structural cause: every partial is an integer multiple of the
firing rate and the exhaust-box peaking filter tracks rpm
(`body.frequency = 120 + rpm01*90`), so the whole comb translates upward and the
low end empties; the same mechanism inverts at idle (ours 88.7% sub-200 Hz vs
1.5%). 22 prominent integer partials vs 1 in the real recording. FIX: decouple
pitch from body - sub-firing-order partials (0.5x, 0.25x) held in 40-120 Hz,
through a FIXED formant bank (~80/165/300/1100 Hz) that does not move with rpm;
band-limited pulse train / wavetable per cylinder event with +/-2-4% per-cycle
timing and amplitude jitter to fill the inter-harmonic gaps; saturating
waveshaper AFTER the body filter, not before.

**car-paint r2** - real wins. GAP: bodywork carries almost no reflected
environment content - door and rear quarter are a smooth dark-red diffuse
gradient with a single blown highlight, where every reference shows the metallic
split at the body's horizon line (bright sky reflection along the upper flank,
dark ground/road reflection along the rocker, fast transition where the normal
crosses horizontal). Without that reflected horizon the panels read as matte
plastic, and the white flake speckle on a non-reflective base makes it worse -
reference flake is always modulated by a real reflection, never floating on flat
albedo. FIX: feed the paint a prefiltered environment (PMREM roughness-mipped
cubemap or box-projected local probe) so the clearcoat samples a real
sky-above/ground-below IBL - the dual-band split falls out for free. Two-lobe
paint model: rough tinted metallic base carrying the flake + thin near-mirror
clearcoat (roughness 0.03-0.06) with Schlick Fresnel F0 0.04 rising to 1.0 at
grazing, so the rocker darkens and the shoulder crease gets a razor specular
line. Gate flake sparkle by clearcoat reflection intensity and mip-bias it with
distance so it stops reading as per-pixel sensor noise.

**road-surface r2** - real wins. GAP: the near-field asphalt has no
high-frequency surface microstructure - no aggregate stones, tar seams, crack
networks or patch repairs. In `wet-night-asphalt-01/-02` the wet pavement still
resolves individual chips of gravel and joint lines under the sheen, and the
reflections are broken up by that microrelief. Ours is a smooth uniformly
warm-tan plane where the whole road read comes from soft airbrushed vertical
light smears sliding over an untextured surface; the bottom third of frame,
where texel density is highest, is the flattest part of the image. FIX: author a
tiling asphalt normal + roughness set at ~2-4 px/mm in the near field (detail
normal blended over the base at ~0.5 m tiling to defeat repetition) and drive
specular breakup from that normal rather than from a smooth wetness mask - the
reflection streaks must be chopped by aggregate relief, not continuous. Add a
decal/mask layer of tar seams and patch repairs with distinctly lower roughness
than surrounding aggregate, and cool the albedo to neutral blue-grey so the
sheen reads as water over stone, not tinted varnish.

**environment r2** - real wins. GAP: every facade is a flat unbroken extruded
box - the window "detail" is a texture on a perfectly planar wall, so nothing
projects off the building surface and nothing catches its own shadow. The
reference blocks are stacked depth: recessed window bays, cornices, setbacks,
fire escapes, AC units, awnings, blade signs cantilevered over the sidewalk, all
throwing small hard shadows onto the wall behind them. Ours has a smooth
silhouette base-to-roofline and a completely empty ground floor - reads as a
greybox. FIX: modular facade kit instanced per building - inset the window grid
as real geometry (or parallax-occlusion mapping with a per-window
interior/curtain slice) so glass sits 15-30 cm behind the wall plane; add
cornice/parapet/setback extrusions at floor breaks; give every building a
distinct ground-floor storefront band with awnings and projecting perpendicular
signs. Then instance a street-prop layer (signals, poles, hydrants, bins,
planters, overhead sign gantries) along the curb with contact shadows, and turn
on SSAO tuned tight enough to darken the new window reveals and prop bases.

## Round-1 critic verdicts, in full (the r2 build briefs)

**sky-lighting** - real wins. GAP: our horizon light is a rotationally-symmetric
white halo around a hard sun disc on a single smooth vertical lerp; real dusk
spreads Mie forward-scatter as a wide horizontally-elongated wedge with no
visible disc, reddening into the haze band, and its veiling glare lifts the
black point so nothing crushes to 0,0,0. FIX: analytic atmosphere
(Hosek-Wilkie or Bruneton precomputed single+multiple scattering) per-pixel in
HDR - Rayleigh for the teal zenith, Mie with g~=0.76 for the stretched orange
horizon lobe; then bloom off the HDR buffer with a wide multi-mip dual-filter
(Kawase) pass thresholded near 1.0, ACES or AgX tonemap, small lifted black.

**road-surface** - real wins. GAP: no aggregate micro-normal and no spatially
varying wetness mask, so the BRDF is one uniform low-roughness wash - light
pools land as soft symmetric grey blobs and it reads as painted concrete, where
`wet-night-asphalt-01` shows a mosaic of dry matte vs glossy puddle patches and
neon smearing into long vertical streaks. FIX: tiling aggregate normal +
roughness map (high-frequency chip noise, ~2 m tile, three octaves to kill
repeat); drive roughness from a separate low-frequency wetness mask (puddles
~0.05, dry ~0.6); tyre-polish lanes = darker albedo + lower roughness in two
bands per lane along the road axis; stretched reflections via SSR with a
vertically-biased ray budget or a planar pass with anisotropic roughness
aligned to travel direction.

**car-paint** - real wins. GAP: bodywork carries no environment reflection at
all - no bright sky band on the upper flank flipping to a dark ground band at
the rocker across the reflection horizon, so panels read as flat vertex-shaded
plastic with a grain overlay; tinted glass and rims share the dead look. FIX:
per-frame (or every-N-frame) cube camera at the car origin through
PMREMGenerator, fed as `envMap`/`scene.environment` so a real specular IBL lobe
drives the panels; split the material into a metallic-flake base (high
metalness, roughness ~0.35, flake normal map) plus `clearcoat: 1.0`,
`clearcoatRoughness ~0.03`; glass gets its own low-roughness high
`envMapIntensity` layer with a dim interior behind it.

**environment** - real wins. GAP: facades are untextured extruded boxes with a
tiled window grid and nothing projecting off them - no parapets, cornices,
setbacks, fire escapes, awnings, AC units, overhanging billboards - so every
silhouette is a clean vertical prism and the street canyon has zero occluding
foreground clutter, while the references are packed with cantilevered signage,
gantries, wires, palms and stepped rooflines that break every edge. FIX:
per-building modular kitbash of greebles (parapet caps, ledge bands, cornice
slabs, rooftop mechanical boxes, antennas) instanced onto box tops and edges,
plus wall-mounted and street-cantilevered sign geometry (billboards on arm
brackets, blade signs, awnings) with albedo-textured art rather than emissive
quads; then densify street-level props (traffic-light gantries, hydrants,
planters, palms, newspaper boxes) with an instanced scatter so the near third
of frame gains silhouette-breaking occlusion.

## Investigated and NOT a bug - do not "fix" these

- **Double tone mapping.** A builder reported that `main.js` sets
  `renderer.toneMapping = ACESFilmicToneMapping` while `OutputPass` also
  tonemaps, so scene materials get compressed twice before bloom. Checked
  against three.js r180 `WebGLPrograms.js:164-174`: a material only receives a
  tone-mapping function when `currentRenderTarget === null`. Everything here
  renders into the EffectComposer's render target, so materials are NOT
  tonemapped and `OutputPass` applies it exactly once. The setup is correct.
  Setting `toneMapped:false` on materials is harmless but unnecessary.

## Traps already hit - do not re-discover these

- **`util.js` `normalFromHeight` / `canvasTexture` return DataTextures, which
  three.js defaults to NearestFilter with NO mipmaps.** A point-sampled 128 px
  normal map under a near-mirror clearcoat quantises the whole panel into texel
  terraces - that was the car's "posterization", and it was NOT the cube probe
  (already HalfFloat). Any module putting one of these helpers' output on a
  low-roughness surface has the same bug. FIXED AT SOURCE in session 4:
  `normalFromHeight` now emits linear + mipmapped + aniso 16 with a 4x4 Bayer
  dither on the 8-bit encode. (`canvasTexture` was actually fine - CanvasTexture
  already defaults to linear + mips; only DataTexture defaults to Nearest.)
- **A wet road is lit almost entirely by INDIRECT SPECULAR.** Roughness had been
  collapsed to ~0.05 over whole puddle regions, and the aggregate relief only
  modulated diffuse and normals - so it never touched the term actually
  producing the image. Relief must be applied to indirect specular / cavity too,
  or it is invisible no matter how high the tile resolution.
- **`shadowNormalBias` must be smaller than the relief you want shadowed.** The
  facade piers were always there (49k instances); the sun ran a 2048 map over
  +/-85 m = 8.3 cm/texel with `shadowNormalBias = 0.35 m`, i.e. the receiver
  offset was DEEPER than the 0.34 m relief, so every step was biased straight
  through its own shadow. Now 4096 over +/-62 m = 3.03 cm/texel, bias 0.035.
  Second half of that lesson: most canyon facade area never sees the sun at all,
  so a shadow map alone could never have fixed it - SSAO was required too.
- Sub-pixel noise octaves do not add detail, they dilute the one octave that is
  actually resolvable. Check a debug flat-albedo shot (`#roaddebug` in road.js)
  before adding octaves.

- `vertexColors: true` on an `InstancedMesh` whose geometry has no `color`
  attribute forces `vColor` to black. It silently killed every neon tube, bulb
  string, traffic-light lens, light spill and awning colour in `world.js`.
  `USE_INSTANCING_COLOR` is what you want; never set `vertexColors` alongside it.
- Street props were being placed 1.9 m INSIDE the block edge while perimeter
  building faces sit 0.6 m outside it, so the entire prop layer was buried in
  walls. `LAYOUT.walkW = 7` now defines a real pavement build-line.
- Parked cars are crude box proxies that look bad within ~10 m of camera. Do not
  raise their density until the proxy mesh is improved.

## Scene notes

`car-paint-closeup` was moved (session 4) out of the downtown canyon under an
overpass onto the open highway with side-on hero framing, matching
`car-paint-closeup-03`. In the old spot no reflection direction off the flank
saw sky at all - a pure white mirror test rendered black - so no amount of paint
work could ever produce the reflected horizon the critic wanted.

## Post-processing ownership (new, to avoid a collision)

The sky FIX needs an HDR bloom/tonemap chain and the road FIX needs SSR. Both
would otherwise edit the render pipeline. Rule: **sky-lighting owns the
post-processing chain** and must put it in a new `game/post.js`. road-surface
must keep its reflection work inside `road.js` (planar reflection or a
road-local pass) and must NOT edit post.js or the main render loop.

## Concurrency rule learned

Do not run builders for camera/boost/crash/hud at the same time as critics for
sky/road/car/world - those builders change what the critic's screenshot shows
mid-judgement. Safe to overlap: audio (no visual effect). Run visual builders
in their own wave.

## SESSION 5 STATUS - WAVE B COMPLETE, TONEMAPPER DECISION IN FLIGHT

**Wave B is DONE. All 9 builders landed.** Verified afterwards: `lint ok` and
ALL SEVEN scenes render (`shots/_s5b-<scene>.png`). The six-round "no shadows"
saga is CLOSED - road shadow-ab MAD 1.04 -> 13.86 with a visible gantry shadow
and a building shadow edge across the lanes in `shots/_s5b-daytime-downtown.png`.

**Currently in flight: ONE agent, the tonemapper decision** (owns main.js +
post.js, running alone on purpose). It must decide by measurement against the
references whether to wire post.js's dead AgX+DualFilterBloom chain or keep
ACES, then commit either way. See the CRITICAL CROSS-CUTTING FINDING section.
If this session died here: check whether main.js/post.js were changed, run
`./tools/lint.sh`, render all seven scenes, and read that section before
relaunching.

**NEXT AFTER IT REPORTS: the Wave C critic sweep**, one fresh critic per piece,
no builders running at the same time. Briefs = each piece's "BUILT" block below.
Two critics need non-default instructions:
  - damage r4 MUST use `tools/damage-shot.mjs`, NOT `shot.mjs --scene crash-cam`
    (crash.js poses the car airborne/inverted/backlit - no panel detail legible,
    which is probably why damage sat at "smooth taffy" for two rounds).
  - environment r8 MUST measure shadow-ab back-to-back reverted-vs-applied, NOT
    against the session-start absolutes, which are stale.
If the tonemapper switched, EVERY critic must be told the render path changed
and which pieces were re-tuned.

## SESSION 5 WAVE B - what each builder did

Wave A is COMPLETE. All three critics reported `real wins`; their verdicts are
recorded below and have already been turned into the Wave B briefs.

Applied directly by the orchestrator: `scenes.js` dusk-highway-chase
`distance` 7.20 -> 10.2 (camera r3 critic's one-number fix, commented in place).
Only that scene was changed; other chase scenes keep their own numbers and are
their own critics' business.

Wave B builders launched, ONE PER FILE (this is the rule that matters - session
4 killed the game with two builders on world.js):
  sky.js + post.js -> sky r6      (bloom veil + THE DAYTIME SUN ANGLE + SSAO radius)
  world.js         -> environment r7 (castShadow on the 700 non-casting props)
  road.js          -> road r6     (aggregate out of albedo -> normal/height only)
  car.js           -> car r6      (box-projected probe + rocker SSR)
  boost.js         -> boost r3    (diagnose the dead capsule mask, then hero stencil)
  crash.js         -> crash r3    (debris velocity cone from contact manifold)
  damage.js        -> damage r3   (per-panel submeshes + crease-threshold normals)
  hud.js           -> hud r3      (baked satellite map tile on a torn plate)
  audio.js         -> audio r6    (glue compressor pancakes the crash)

### Wave B results as they land

**boost r3 BUILT** (needs r4 critic). The capsule mask was never missing or
mispositioned - debug greyscale showed it correctly over the car. It was
ENORMOUS: `uCarR` resolved to 295 px and the ramp `smoothstep(uCarR*0.75,
uCarR*2.15, d)` gave a 221 px hard-zero hole feathering out to 634 px on a
540 px half-height frame, so the whole mid-frame was protected; the radial
falloff only reached 0.26 at the car's bottom edge so the tarmac beside the car
barely streaked. Now: a real hero SILHOUETTE mask rendered flat-white to a
half-res RT each frame (saves/restores render target, clear colour,
overrideMaterial, visibility AND `shadowMap.autoUpdate` - without that guard the
extra `renderer.render()` rewrites the shadow atlas from a car-only scene, which
would have broken the environment piece), gathered with a 24-tap cone-weighted
disc. Radial falloff retuned to reach 72 px. Heat-haze warp now multiplied by
the mask. Added `uDebug` (0 off / 1 mask / 2 passthrough) - a diagnostic worth
keeping. Shots: `shots/boost-fx-r3-{before,after}.png`.
  Two secondaries were found ALREADY DONE and correctly so - do not let a future
  round "fix" them: chromatic aberration already ramps from zero at the focus of
  expansion, and the streaks are radial about the focus of expansion which under
  forward translation IS travel-aligned.
  Boost's remaining blocker is NOT boost's: a veiling bloom wash off the low sun
  flattens the car's left flank. That is post.js, already in the sky r6 brief.

**environment r7 BUILT** (needs r8 critic). The builder REFUTED its own brief
and was right to - record this, it is the most useful finding of the session.
  The critic's "only 120/822 meshes castShadow" was a MIS-DIAGNOSIS. world.js's
  `inst()` helper already defaults `cast: true`, so the gantry, awnings,
  colonnade columns, streetlights, bollards, barriers, bins, mullion fins,
  struts and fronds were ALREADY casting. The ~700 non-casters are almost all
  road.js ribbons (134 BufferGeometry) + road decals (363 PlaneGeometry) +
  car.js parts - not world.js's to fix. The only genuine missing casters in
  world.js were 36 kerb slabs. Casters 120 -> 156. The inner pavement slab is
  deliberately NOT a caster (clears the kerb by 2 cm - pure acne, no shadow).
  No acne on the kerb at normalBias 0.035 against a 0.22 m slab.
  THE REAL CAUSE of the flat 40-90/255 blue-grey band: `atmoTail()` applied the
  height-shade (`uShadeAmt`) and canyon-AO (`uCanyon`) terms as a multiply on
  `gl_FragColor.rgb`, i.e. AFTER lighting. A post-lighting multiply scales the
  sun by exactly as much as it scales the skylight, so a sunlit facade and a
  shaded one land on the SAME value - the key could never survive. These are
  sky-occlusion terms, so they moved into `FILL_FRAG` onto `irradiance` /
  `iblIrradiance`, and `canyonK` onto `radiance` (the canyon occludes the
  mirrored sky too). The terminator is now the strongest edge in the frame.
  Also: fill goes warm as sky occlusion rises (surviving fill in a canyon is
  road bounce, not sky), so the shaded half no longer converges on one flat blue.
  MEASUREMENT DISCIPLINE - absolute shadow-ab numbers are NOT comparable across
  this session. sky.js was rewritten twice mid-wave and road MAD moved
  1.04 -> 36 -> 28 with world.js untouched. The session-start baseline
  `1.0402/2.2396/3.2301` is now meaningless. This builder measured back-to-back
  reverted-vs-applied against the same sky state, twice: facade MAD +29%/+35%,
  full +8.6%/+8.9%, road flat (+0.3%/+2.2%, correct - tarmac is road.js's).
  Future critics MUST do the same or they will attribute sky's delta to world.
  Night is bit-identical by construction (new terms gated by `uDay`=0 at night),
  verified `shots/w7-night.png`. Shots: `shots/w7-{before,after,fill,kerb,bounce}.png`.
  Left open: at the current sun azimuth the street floor sits inside the
  right-hand block's shadow so props have no rim light - correct against
  daytime-downtown-02, wrong against -01. Depends on the sun angle = sky's call.

**crash r3 BUILT** (needs r4 critic). A cone, per-class drag and per-shard
velocity-stretch blur ALREADY existed; the critic was still right, for two
reasons the code hid. (1) The crashbreaker fountain - which dominates the
settled frame - fired straight UP at 1.02-1.35 rad half-angles, a near
hemisphere: that was the "party popper". (2) One spread/speed/drag distribution
per set meant every shard flew identically, so nothing read heavy vs light.
  Now: `doImpact` builds a real surface normal, reflects the impact direction
  off it and blends with retained momentum + lift to get an ejecta axis; the
  contact TANGENT is the wide axis of an ELLIPTICAL fan (wide `spreadT`, narrow
  `spreadN`) with core-weighted sampling for a dense spine and thin fringe.
  Mass classes (`MASS`/`MASS_MIX`) drive speed, drag, tumble, size, spread and
  blur budget together - heavy leaves slowly on low-drag arcs and stays in the
  core, light glass sprays 2-3x faster to the rim and stalls. A set is now a
  MATERIAL not a mass (mech 66% heavy, glass 80% light). Angular drag decoupled
  from linear (`spinDrag`) so a chip stalls while still spinning. Blur stretch
  1.8x heavy / 3.6x medium / 7.0x light along each shard's OWN velocity.
  Fountain now leans downrange, 0.48/0.20 rad.
  Secondaries done: slow-mo eased both ends (75 ms smoothstep in, zero-slope
  recovery); glass to near-mirror (roughness 0.018, envMapIntensity 3.8) with
  albedo pulled back to ~1.0 so the glint is a real reflection sweeping, not a
  flat bright colour.
  MEASURED: 128 shards, mean 17.1 m downrange vs 5.2 m lateral sigma (bias
  3.27), ZERO shards behind the impact point, scale spread 0.05-0.78 m.
  Shots: `shots/r3-before.png` -> `shots/r3-cone-e.png`.
  Left open: the contact dust plume already exists as three layers but renders
  as a large flat milky wash across frame-left. It needs work as ITS OWN piece -
  do not commission "more dust". Candidate 11th piece.

**road r6 BUILT** (needs r7 critic). Third builder this wave to refute its
brief's MECHANISM while confirming its SYMPTOM. Bisected with `#roaddebug` plus
four one-uniform-at-a-time builds: with albedo forced flat at 0.055 the pale
speckle was IDENTICAL, so the aggregate was never painted in diffuse at all.
Three lighting-side sources were making it:
  1. (dominant) micro-normal at full amplitude through the wet ramp -
     `uGrainAmt` was `lerp(1.0, 0.95, wet)`, so every chip facet caught its own
     highlight and the road rendered as lit gravel sitting on the film. Now
     `lerp(1.0, 0.34, wet)` - a water film physically levels those tilts. The
     reflection stage renormalises its own copy (`gMicroN /= max(0.25,
     uGrainAmt)`) so per-stone breakup of the neon streaks survives.
  2. the per-chip hard waterline REPLACED the macro mask outright in the near
     field, making wet/dry binary per stone: a matte-rough crown under a bright
     night hemisphere is BRIGHTER than a mirror at 25 deg - the exact inversion
     the critic saw. Now owns 22% of the decision, retires at 7 m not 14 m
     (past that the mip-averaged height field only gives a splotch staircase).
  3. chip-scale AO held full strength when wet - crowns bright, voids dark.
     Range narrowed, faded by `1 - uWet*0.60`.
  Aggregate is now entirely absent from albedo as briefed: the `0.62+albD*0.78`
  height-to-diffuse term (2.3x swing, crowns 40% above base) is gone, replaced
  by shallow cavity grime that fades as the surface soaks. Also: env probe
  pulled down across the whole wet surface not just pools; damp-crown roughness
  0.70/0.48 (was 0.94/0.74) for glints not a matte wash; mirror floor on damp
  crowns 0.03 -> 0.18; `addWetSmear` baked breakup changed from 900 round pebble
  bites to 260 down-road elongated ripples - the SAME albedo-aggregate mistake
  one layer up, it was stippling the neon smears into grit.
  Verified daytime-downtown still has full dry aggregate grain (normal map runs
  full amplitude when dry, so removing the albedo term did not flatten it).
  Shots: `shots/road-r6-before.png` -> `shots/road-surface-r6.png`.
  Left open: mid-right verge reads warmer/lighter than any reference - that is
  the sodium lamp's colour/intensity, outside road.js. Horizon streaks softer
  than reference -03 because the planar probe is HALF-RES.

**damage r3 BUILT** (needs r4 critic). Per-panel identity without splitting the
mesh: the body is one loft, but car.js already cuts real shutline channels at
fixed `(z,u)` stations, so those exact numbers were mirrored into a
`panelOf(z,u)` classifier (12 panels). The PANEL ID IS PART OF THE WELD KEY, so
two coincident vertices across a shutline no longer share a displacement and the
gap can open. Impacts deform the struck panel at full weight, seam-adjacent at
0.30, the rest at 0.05; `relax()` never averages across a seam.
  THE TAFFY CAUSE was one constant: `EDGE_LIMIT` 0.32 capped surface slope at
  18 deg and sanded every ridge flat. Now 0.90 (still inversion-safe), relax
  0.26 -> 0.05. Plus real fold frames - two tent-profile fold lines per struck
  panel (`|s - hd|`, a genuine derivative kink), the second folding INWARD so
  the sheet accordions instead of inflating.
  Crease normals: `computeVertexNormals` replaced by a two-pass split - average,
  then re-accumulate only faces within 24 deg of it. Paint wear is driven by the
  LAPLACIAN of the displacement field, so scuffing to primer then bare metal
  happens only on crease crests (first attempt normalised by local edge length
  and washed the whole car in mud - it is fixed at a 2 cm scale now).
  Verified: single front-right hit gives front-right 0.257 m, front-left 0,
  rear-left 0, rear-right 0, adjacent door 0.041. `reset()` still exact (max
  position and normal delta 0 after `setLevel(0.9)`). 43 ms per impact.
  Shots: `shots/_damage-r3-corner-final.png`, `shots/_damage-r3-close-final.png`.

  **SCENE PROBLEM - the damage critic must NOT use crash-cam.** damage-model and
  crash-cam currently share the `crash-cam` scene, but crash.js poses the car
  airborne, inverted and backlit at 10 m, so no panel detail is legible at all.
  The builder wrote `tools/damage-shot.mjs` (damage-only, new file) which poses a
  close camera in the car's frame and runs a damage expression. Brief every
  future damage critic to use THAT, not `shot.mjs --scene crash-cam`.
  Left open: detached front bumper reads as a limp sheet (its `slabGeo` thickness
  fades to zero at the outline) - cosmetic, and the pose is what is wrong.

**hud r3 BUILT** (needs r4 critic). Minimap is no longer live vector drawing: a
1024 px cartographic tile (+512 mip) is baked ONCE covering the whole city and
blitted into the card under the heading rotation. Content: land with per-block
tonal patchwork, water behind a wobbling irregular coastline + bay, parks with
shadowed tree stipple, building footprints from RECURSIVE PARCEL SUBDIVISION of
every block (consistent NW drop shadow, lit roof edge, three roof-tone
families), then roads as casing -> fill -> wear wash -> centre dashes, a rail
line with sleepers, 64 soft tonal blotches and two octaves of grain.
  Plan de-graph-papered: two diagonal boulevards, hashed mid-block service
  lanes, grid extended 2 blocks E / 1 N, three suburban loop roads and four
  low-density tracts so the card is never half-empty whichever way the car
  faces, plus a stadium bowl and civic plaza as landmarks. Range 330 -> 250 m.
  Plate is now a wobbled chamfered quad (no parallel edges, deckled perimeter)
  with drop shadow, inner bevel, diagonal sheen, vignette, and a torn ink
  splatter bleeding behind the whole assembly incl. the district name plate -
  the reference-01 treatment.
  Boost bar: heavy ink edge + top-lit/bottom-dark bevel, machined cell plates
  and inner shadow in the empty run, tip glow changed from a hard vertical edge
  to a radial bloom on the fill tip. Speedo: angled bevelled instrument plate
  with drop shadow behind the RPM/numerals/gear cluster, rev strip gained a tick
  scale and needle marker. Event feed fades right instead of a black bar.
  Shots: `shots/hud-r3-before.png` -> `shots/hud-r3-after.png`.
  Left open: suburban tract rows are slightly regular at high zoom.

**sky r6 BUILT** (needs r7 critic). THE SHADOW SAGA IS OVER - road shadow-ab MAD
1.04 -> **13.86**, meanOn/meanOff 70.54/82.21 (ratio 0.86: the road is genuinely
LIT with shadows on it, not uniformly dark). Facade MAD 3.47 -> 6.26. Visible in
`shots/r6-dd-final2.png` as a diagonal edge across the near-left lanes.

WHY THE SESSION-4 `sunElevation` FIX NEVER REACHED THE SCENE - two causes:
  1. `midday` authored TWO sun vectors. `sunElevation` drives only the painted
     disc/scattering; the actual `DirectionalLight` comes from `lightElevation`,
     which was still 68. Session 4 changed one and left the other.
  2. `sky.update()` rebuilt the light position from `uniforms.uSunDir` (the
     ATMOSPHERE vector) instead of its own `sunLightDir`, teleporting the key one
     tick after setup. main.js's defensive re-assert was reading
     `p.lightElevation` = 68 and so re-broke it every frame.
  Atmosphere and key are now the same vector for `midday`.

**THE BRIEF'S 25-30 deg WAS WRONG AND THE BUILDER PROVED IT.** At 27 and 44 deg
the ENTIRE carriageway goes into shade (road meanOn 34.6 vs meanOff 59.8 at
27 deg, no lit lane anywhere - `shots/r6-dd-a.png`, `r6-dd-e44.png`). Raycast
geometry: left frontage 24 m out and ~47 m tall, right 14 m out and ~20 m tall;
cross-street reach is `h/tan(e)*sin(offAxis)`, so at 35 deg off-axis **46-50 deg
is the LOWEST sun this canyon takes that still leaves a lit lane**. Settled at
47 deg / azimuth 145 - behind-RIGHT so the low 20 m frontage is the caster and
the big 47 m left facade becomes the sunlit side. Azimuth 215 shades everything
at any usable elevation. Do not let a future critic push the sun lower without
re-deriving this.
  lightIntensity 4.6->6.3, ambientIntensity 0.60->0.48, shadowNormalBias
  0.35->0.035, new per-preset `shadowOrtho` re-asserted each tick. Ortho box
  tightened from symmetric +/-100 to an asymmetric light-space box fitted to the
  visible frustum `{-74,+44,-32,+112}` = 118x144 m = 2.9x3.5 cm/texel at 4096
  (was 4.9).
  SSAO: radius 1.25 -> 3.0 m, intensity 2.4 -> 2.0, PLUS a second 10 m term
  computed off the SAME hemisphere kernel and TBN (one extra depth tap per
  sample, not a second pass). Two terms because a single 10 m radius steps over
  every 20 cm sill.
  DUSK BLOOM: threshold 1.00->1.40, radius 0.78->0.38, strength 0.55->0.50.
  Haze: raised the UNBOUNDED term `uni` 0.00022->0.00068, left `d0` at 0.0030 -
  measured that raising `d0` lifted the near tarmac by as much as the bloom fix
  had lowered it (`d0` is density at y0=0 and the bottom of frame is exactly
  there; `uni` is 0.4% at 6 m and 46% at 900 m).
  A/B measured with `tools/_px.mjs`: horizon p01 veil floor 117.6 -> 73.9
  (-37%), horizon saturation 0.143 -> 0.220 (+54%), full-frame median
  143.9 -> 119.3 (-17%), near-road median 18.2 -> 18.1 and sub-16 pixels
  31.7% -> 31.2% (blacks HELD, not lifted). Zenith did not change (199->198) -
  the washed region was the horizon band, not the zenith.

**car r6 BUILT** (needs r7 critic). Ran the mandated mirror test FIRST and it
paid off twice.
  1. A pure-white mirror car rendered a giant BLACK RECTANGLE over most of the
     frame. Bisected to `normalScale = 0`: the paint shader did
     `normalize(tbn * mapN)`, and a flake texel with encoded Z exactly on 0.5
     decodes to a ZERO VECTOR -> NaN -> the NaN smears through the bloom mip
     pyramid as a black rect with stair-stepped edges. Not reachable at the
     shipped normalScale 0.42, but it is a latent landmine; `mapN.z` is now
     floored. **REMEMBER THIS: that failure mode looks exactly like "the probe
     sees nothing".**
  2. With that avoided the mirror test PASSED - the probe sees barrier, road,
     pole, sky. So the probe was never the problem and neither was the clearcoat.
  THE ACTUAL CAUSE of "no reflected image" was `paintMat.roughness = 0.44`. On
  `metalness: 0.90` paint the BASECOAT lobe is most of what you see, and 0.44
  fetches five levels down the prefiltered chain - every environment feature is
  averaged away before the BRDF runs. The clearcoat contributes 4% at normal
  incidence and cannot redraw an image the basecoat erased. Reference -03
  confirms it: its bright-band/dark-band split is the BASECOAT reflecting, not
  the lacquer.
  Fixes: box-projected probe (new section 3a) patching three's `getIBLRadiance`
  chunk to intersect the reflected ray against a box whose floor is welded to
  the road, re-aimed from the capture point, with a fallback to the stock path
  if a future three.js changes the chunk; applied to paint, livery, glass,
  chrome, rims, rail. Basecoat roughness 0.44 -> 0.10, scatter now from the
  flake map, clearcoat IBL gain 1.45 -> 4.5 (now a uniform).
  `envMapIntensity` 1.85 -> 1.25 - at roughness 0.10 the old value CLIPPED R and
  G before B on the yellow daytime-downtown car's rear deck and went flat white,
  the exact failure `car-paint-closeup-02` calls out. Caught in regression.
  **DELIBERATE SUBSTITUTION - no SSR.** The brief asked for rocker SSR; box
  projection does that job better here because the probe already renders the
  real road into the down face, and unlike SSR it does not go blank when the
  reflected road is off-screen - which side-on it mostly is. Do not re-commission
  SSR without arguing against this.
  Shots: `shots/car-paint-r6-before.png` -> `car-paint-r6.png`; camslide pair
  `-camslide-a/-b.png` shows the horizon moving; regressions all clean.
  Left open: the reflected image on the DOOR is inherently low-contrast because
  the camera-side environment is a flat concrete barrier - reads well on wing,
  bonnet, rear quarter. A taller/more varied roadside object near `highway`
  u~0.62 would sell it; that is world.js.
  NEW TOOL, KEEP IT: `tools/_carpaint-eval-shot.mjs` boots a scene, runs a JS
  snippet against `window.__game`, re-renders and screenshots - this is what
  made the mirror test and A/B sweep cheap. `car.envBox` and `car.setCcGain()`
  are exposed for runtime A/B without a recompile.

**audio r6 BUILT** (needs r7 critic). Every primary target hit.
  Output stage rebuilt: peak control is now a `WaveShaper` (`clipCurve`, exactly
  linear below -3.3 dBFS, tanh knee to 0.99, 4x oversample) as the LAST node - a
  shaper has no attack/release/program dependence, so a transient is either
  untouched or shaved instantly and nothing after it is ducked. The old
  2 ms/20:1 compressor is demoted to a slow level rider (-3 dB, 4:1, 50 ms
  attack) that cannot react inside a crash. `glue` -20/3.2:1/12 ms ->
  -8/1.8:1/30 ms. `busFx` bypasses glue via a new `fxDirect` gain straight to
  the master sum, as `revReturn` already did.
  BIG SUPPORTING FIND: the safety stages sat UPSTREAM of a 0.62 master fader, so
  a peak measuring -1 dBFS was hitting the limiter at +4 dBFS and eating 5 dB
  with a 300 ms release - most of the sag came from that. They are now after the
  master gain. `crash()`'s engine duck 0.28x held 0.9 s -> 0.5x over 130 ms. New
  `BED_TRIM` (0.22) buys impact headroom, applied to `revReturn` and divided out
  of `busFx`'s send so wet/dry ratios are unchanged.
  City: per-space return high-pass (`revHP`) + a `FACADE` tap generator (two
  interleaved slapback trains, 27 ms / 63 ms round trips). Spaces now separated
  on level, colour AND shape: open = one dull distant slap (lp 900, hp 20,
  shelf +2), city = thin bright facade shimmer (lp 11000, hp 120, shelf -8),
  tunnel = dark long flutter (lp 2600, shelf +8).
  TRAP DOCUMENTED: `tapGain` multiplies the wet LEVEL by `sqrt(1+tapGain^2)`, so
  `revReturn` is NOT the DRR on its own - tapGain 2.6 is +8.9 dB of hidden wet.
  MEASURED r5 -> r6: crash peak minus bed peak -0.42 -> **+8.42 dB** (target >=8);
  whole-mix crest 8.14 -> **16.22** (target >=13); frames within 3 dB of loudest
  68.5% -> **1.0%**; post-impact sag "2-4 dB down for 1.4 s" -> **0 ms below
  pre-impact -1 dB** (target <=120 ms). open vs city 0.23 -> **6.68 dB** mean
  (city L/R corr 0.938 -> 0.248, centroid 1267 -> 1505 Hz). Flyby broadside L-R
  5.35 -> **11.33 dB** (24.61 dB in a 10 ms window at the true peak), pan swing
  7.9 -> **18.17 dB**.
  Honest regressions the builder flagged rather than hid: open vs tunnel
  5.86 -> 5.20 dB (raising tunnel's return pins it against the clipper - chose
  not to trade the primary for it); mix is 3.8 dB quieter in RMS, the deliberate
  cost of 8 dB of crest, with peak going UP to -0.70 dBFS; idle band error
  10.5 -> 11.5 (city shimmer over a near-silent idle) while crash improved
  15.1/17.1 -> 11.8/13.5. Argues loudness-range p90-p10 (4.6 -> 3.5) does not
  measure what it was cited for, since a full-throttle bed is steady by nature
  and the crash lives above p90 (p99 -9.5 vs p90 -16.0). That reasoning looks
  sound - do not let a future critic chase that one metric.
  The waveshaper makes `audio-isolate.mjs`'s subtraction slightly nonlinear;
  pre-event residuals stayed <=1e-5 so isolation is still valid.

### !!! CRITICAL CROSS-CUTTING FINDING - post.js DISPLAY CHAIN IS DEAD !!!

`main.js` never wires post.js's display chain. It imports only `createSsaoPass`,
then builds `renderer.toneMapping = ACESFilmicToneMapping` (main.js:56),
`new UnrealBloomPass(...)` (:101) and `new OutputPass()` (:104).
So `AgxOutputPass` and `DualFilterBloomPass` are both written, both correct and
BOTH DEAD. **Every render this project has ever judged is ACES, not AgX.** Every
preset's `lift` / `contrast` / `sat` / `dither` / `bloom.veil` goes nowhere.
That is why black-point and saturation edits produce no measurable change, and
almost certainly why the r5 critic "asked for AgX" - it genuinely is not in the
picture it was looking at.
The sky builder fixed a real bug in that dead path (`AgxOutputPass` was
overwriting `uGrade.w` with a hard-coded 1.18, discarding the preset's `sat`)
and authored grade values for when it goes live. They are inert today.
Wiring it is ~3 lines in main.js, which no builder owns. The builder
deliberately did NOT make a silent cross-owner edit - correct call, because
flipping the tonemapper mid-wave would invalidate five rounds of material tuning
that every other agent did under ACES.
**ORCHESTRATOR DECISION REQUIRED. Do this at a WAVE BOUNDARY, never mid-wave,
and follow it with a FULL critic sweep of all 10 pieces, because it changes
every material at once. Evaluate it as an A/B against the references before
committing - do not assume AgX is better here just because it is newer.**

### Concurrency hazard observed this wave - important

Around 00:24-00:25 EVERY scene started failing `waitForFunction` while
`./tools/lint.sh` still passed ok. audio/car/damage/hud/post/sky.js had all been
written in that window. It cleared on its own. So: lint catches syntax, but a
RUNTIME error from a half-written module looks identical to a hung renderer and
lint will NOT see it. If screenshots start timing out mid-wave, wait and retry
before you go bug-hunting - it may just be another builder mid-write.
Orchestrator re-verified after road r6 landed: `lint ok` +
`shots/_s5-midwave.png` renders fine.

NOTE the environment fix was SPLIT across two owners on purpose: the sun angle
and SSAO live in sky.js/post.js, the caster flags live in world.js. Neither
builder may touch the other's file.

If this session died during Wave B: run `./tools/lint.sh` FIRST. If it fails,
a builder left a syntax error - find and fix it before anything else. Then
screenshot each scene to see which builds landed, and run the Wave C critic
wave for every piece.

## SESSION 5 WAVE A (complete) - read this first

Verified on arrival: `./tools/lint.sh` = ok, `shots/_s5-sanity.png` renders a
live city in ~3.4 s. The three session-4 in-flight agents all LANDED
(world.js 23:50, camera.js 23:55, audio.js 23:59, main.js 00:00) - do not
relaunch them.

Wave A (critics only, launched at session-5 start, no builders running):
  chase-camera r3 critic   -> scene dusk-highway-chase
  environment  r6 critic   -> scene daytime-downtown (must first VERIFY the
                              shadow-diagnostic fix is visible, with evidence)
  audio        r5 critic   -> must first VERIFY r4's FDN reverb + doppler sign

**camera r3 critic: DONE - `real wins`.** Gap is NOT height (that landed:
y=1.94 = 1.23x spoiler top, roofline correctly below horizon) and NOT fov
(44.4 vfov / 71.9 hfov vs Burnout ~43/70 - correct, leave alone). Gap is the
rig is too CLOSE: camera sits 6.02 m behind the rear bumper so the depression
ratio tan = 0.315 vs Burnout's 0.21-0.22 in dusk-highway-chase-02/-03. Our car
fills 28.1% of frame height vs their 20.9%/21.7%; ground-contact line at 0.83
vs their 0.77. The r3 builder's "distance 8.0" never landed -
`camRig.config.distance` still reads 7.2.
FIX (apply directly, camera.js, it is a one-number change): `distance`
7.2 -> 10.2 (=9.0 m lens-to-bumper, h/d 0.215). Leave `height` 1.885 and
`fov` 42. If the car then reads detached, fix framing with `lookHeight`
1.05 -> 0.85, NOT by pulling the camera back in.
APPLIED to scenes.js dusk-highway-chase. Needs an r4 critic to confirm.

**environment r6 critic: DONE - `real wins`.** FIFTH report of "no shadows",
but this one finally has the cause, measured. `tools/shadow-ab.mjs` with the
ENTIRE shadow map toggled off moves mean road luminance by 0.9/255:
`road MAD 1.0402 / full MAD 2.2396 / facade MAD 3.2301`. Not a bias bug this
time - the geometry cannot produce road shadows at all.
  CAUSE 1: the daytime sun probes at 68 deg ELEVATION (world pos
  [404.5,222.5,-91.5] -> target [325.1,0,-49.3]). `shots/_shadowmap.png` shows
  every street corridor pure white in the light depth buffer. At 68 deg a 40 m
  block throws a 16 m shadow that lands on its own sidewalk. STATE claimed a
  session-4 fix set `sky.js midday.sunElevation` 68->42 - that change is NOT
  reaching this scene, and finding out why is part of the sky r6 brief.
  CAUSE 2: only 120 of 822 meshes have castShadow. PlaneGeometry 13/392,
  BufferGeometry 5/142, CylinderGeometry 52/72. Gantry, awnings, colonnade
  columns, bollards, barriers, bins all cast nothing.
  SSAO is genuinely alive and visible (radius 1.25, intensity 2.4) but is
  contact-scale only; deep colonnade recesses read the same value as the
  columns in front of them.
  FIX: sun to 25-30 deg, yawed 35-45 deg off the street axis; tighten the ortho
  box to the visible frustum (do NOT widen it); SSAO radius toward 3 m plus a
  second wide pass; castShadow across the prop pools. Keep shadowNormalBias
  near 0.035 - do not raise it to chase acne.

**audio r5 critic: DONE - `real wins`.** All three r4 fixes verified landed:
  (a) open vs tunnel now 5.86 dB mean / 10.1 dB max against a 5.45 dB
      low->high-rpm yardstick, L/R corr flips 0.946 -> -0.097, T-40 890 ->
      3380 ms. BUT open vs city is still 0.23 dB mean - bit-for-bit the r4
      number. Two of three spaces are still the same room.
  (b) panning shape correct, level rises monotonically over a 55.3 dB sweep
      peaking at closest approach, but broadside L-R is only 5.35 dB
      (corr 0.686) - the `busWorld = makeBus(0.45)` wet send dilutes it.
  (c) doppler sign FIXED: recede is pitch DOWN, -525 cents vs textbook -560.
  GAP: the glue compressor pancakes the crash. Isolated it peaks -2.99 dB with
  17.5 dB crest; in the busy mix it peaks -10.77 against a bed peak of -10.24 =
  -0.53 dB of punch, and the envelope FALLS for ~500 ms after impact. Whole-mix
  crest 8.14 dB vs reference 15.1-15.5. Cause audio.js:295-296, threshold -20 /
  ratio 3.2 / attack 12 ms with a bed already at -12.4 dB RMS.
After Wave A: run the Wave B builder fan-out listed under "Exact next action"
below, one builder per file, then a full critic wave.

## Exact next action

Every one of the 10 pieces has now been built and critiqued at least twice.
ALL TEN are still `real wins` - none has reached `ours wins` / `cannot tell`.
Rounds reached: sky 5, road 5, car 5, environment 5, camera 2 (critic pending),
boost 2, crash 2, damage 2, audio 4 (builder was still running at 02:05), hud 2.

Still in flight at 02:05 - check whether they landed before relaunching:
- the dedicated SHADOW-DIAGNOSTIC agent (owns world.js/post.js/main.js)
- audio r4 builder (owns audio.js + surgical main.js)
- chase-camera r2 critic

NEXT WAVE, one builder per file, brief = that piece's verdict block above and
nothing else:
  road r6      -> road.js     (aggregate out of albedo, into normal/height only)
  car r6       -> car.js      (box-projected local probe + SSR on the rocker)
  boost r3     -> boost.js    (hero stencil mask - diagnose why the existing
                               capsule mask does not work before rebuilding)
  crash r3     -> crash.js    (debris velocity cone from the contact manifold)
  damage r3    -> damage.js   (per-panel submeshes, crease-threshold normals)
  hud r3       -> hud.js      (baked satellite-style map tile + torn plate)
  sky r6       -> sky.js      (tighter bloom threshold/radius + depth-driven
                               near-field haze; IGNORE the critic's advice to add
                               an analytic sky model and AgX - both already exist)
  environment  -> hold until the shadow-diagnostic agent reports; its finding is
                  that piece's real r6 brief.

Then a critic wave. Rules that have already cost real time:
1. `./tools/lint.sh` before ANY screenshot. A syntax error looks exactly like a
   hung renderer (60 s timeout, no console output).
2. Never overlap visual builders with visual critics. Builders change what the
   critic is judging mid-render; several agents this session lost renders to
   another builder's in-flight edit and had to retry.
3. One builder per file per wave, always.
4. Audio is the only piece safe to run alongside a visual wave.

## Standing lesson for whoever runs the next session

Four separate rounds this session were spent on a symptom whose real cause was a
one-line bug somewhere else - inverted shadow bias, a parallel filter, a
near-overhead sun, a Nearest-filtered DataTexture. When a critic reports that a
feature is missing and the builder swears it built it, DO NOT commission more of
the feature. Probe the running scene (`tools/probe.mjs`) and find out why what
exists is invisible. `tools/probe.mjs --scene X --expr "JSON.stringify({...})"`
returns anything you can reach off `window.__game`; keep the expression small
and stringify it, or the output floods.

Critic prompt template: `tools/CRITIC.md`. Fresh builder + fresh critic per
piece per round, never shared context.

**environment r8: `real wins`.** SHADOWS ARE ALIVE — measured back-to-back THIS
round, do not let anyone report "no shadows" again:
`road MAD 13.2159 / max 102 / meanOn 67.32 / meanOff 78.38 over 613818 px`;
`full MAD 8.0386 / max 143 / meanOn 79.92 / meanOff 87.96`;
`facade MAD 6.2958 / max 126 / meanOn 44.47 / meanOff 50.77`.
GAP: the city is FLAT-PLANED. Every facade is a smooth extruded box wearing a
tiled window decal, so it generates no mid-frequency geometry of its own — no
window reveals, floor-slab ledges, cornices, awnings, fire escapes, roof AC
units/water towers, hanging blade signs, or overhead wires. That kills the
small-scale self-shadowing and clutter silhouette the references live on.
  Facade band (y 5-55%, sky excluded) mean Sobel gradient magnitude:
  ours 16.65 vs refs 39.51 / 23.61 / 21.24 (street-level shots; `-04` is a
  shallow-DOF hero frame at 7.43, NOT comparable) = we are 22-58% under.
  `%strong edges (>30)`: ours 16.3% vs refs 20.8-40.7%.
  Probe: of 822 meshes, 392 are PlaneGeometry vs only 150 boxes — the detail
  layer is decals, not solids, so the working shadow map has almost nothing thin
  to bite on above ground level.
  Same cause, secondary symptom: facade mean saturation 0.316 vs refs 0.476-0.537
  — the missing clutter is also where all the colour lives.
FIX (environment r9 brief): in `world.js` add a per-facade relief pass — inset
window quads 15-25 cm behind the wall plane, add a floor-slab/cornice band every
storey (thin boxes, `castShadow` on) — then hang a street-level clutter layer of
REAL SOLIDS at 8-15 per block (blade signs on brackets, awnings, fire-escape
ladders, roof AC boxes, water towers), instanced so cost stays flat. LEAVE THE
SUN ANGLE IN sky.js ALONE, it is working. Instead raise SSAO strength/radius in
`post.js`, since a ~1024 sun cascade will not resolve 20 cm reveals on its own.
NOTE the post.js half of this is a DIFFERENT OWNER from world.js — the sky/post
builder must do the SSAO change, the world builder must not touch post.js.

**crash-cam r4: `real wins`.** GAP: debris pieces are ~an order of magnitude too
large and too long-lived, so the frame reads as tumbling cardboard confetti
rather than shattered car. Probe at the shot instant (`crash.time` 3.94 s,
`timeScale` 0.67): panel-set live instance world scales are 0.26-0.78 m wide by
1.0-1.64 m TALL (a flying half-metre-by-metre-and-a-half sheet of red bodywork),
and the "mech" boxes are 0.13-0.60 m cubes with visible flat cube faces. 90 of
128 pieces are STILL AIRBORNE 3.9 s after impact, reaching 15.7 m altitude and
spanning 18 m of road, which is why they fill the whole right half of frame out
past the far building at unchanged apparent size. Every reference disagrees: in
`crash-cam-01` the debris fan is a dense cloud of CENTIMETRE-scale dark chips
clustered within a couple of metres of the contact patch; `crash-cam-04` is fine
glass grit plus small dark flakes. There is no half-metre panel in any of the four.
The r3 cone rebuild IS real and working (elliptical spread, three mass classes
with distinct drag) — it is just distributing objects of the wrong physical size,
so the good velocity structure is invisible. Do not rebuild the cone.
  Secondary tells, NOT the headline: slow-mo shutter mismatch is INVERTED from
  spec (our lane dashes and tarmac aggregate are crisp while the airborne car is
  the softest thing in frame; refs do the opposite), and there is no scuff/skid
  deposit under the impact.
FIX (crash r5 brief): in `game/crash.js` shrink the emitters AT SOURCE — drop
`panelGeo`/`mechGeo`/`glassGeo` base extents plus the `MASS.*.sz` ranges so panel
shards land at 8-25 cm and mech chunks at 4-12 cm — then roughly TRIPLE the
instance counts in `makeSet` so density replaces size. Add a per-piece airborne
lifetime (~0.8-1.2 s of crash time) that retires or hard-grounds a shard, and cap
the cone so the fan stays inside ~5 m of the manifold, killing the 18 m spread and
15 m apex. Raise the `blur`/`blurMax` floor on the heavy class so surviving large
pieces still streak instead of sitting sharp.
DUST SPLIT DECISION: **no.** The plume IS a flat milky wash disconnected from the
impact point (hangs over the left sidewalk, no column, no height thinning, no warm
sun tint) but it is not the biggest gap, and splitting it would hand two pieces
the same volumetric-lighting problem with no shared owner. Keep it inside
crash-cam as that piece's NEXT round. Piece 11 in the table stays retired.

**car-paint r7: `real wins`.** r6 VERIFIED: box projection landed and is live
(`THREE.ShaderChunk.envmap_physical_pars_fragment` still contains the exact
`IBL_NEEDLE`, chunk len 1400, match true; 8 `boxproj:*` programs compiled of 126;
`uBoxAmount = 1.0`; `paintMat.envMap` bound). It helped modestly: flank-crop std
28.4 -> 34.6, top band L 26.6 -> 35.6, frame `vivid` 0.014 -> 0.028. SSR on the
rocker was NOT built — car.js:756-760 argues the probe subsumes it, which is
defensible (the probe does render real road into the down face). But box
projection also DEEPENED the mid-flank hole: L 18.2 -> 9.5.
GAP: the metallic basecoat has no diffuse floor, so the flank between the
shoulder highlight and the rocker collapses to near-black. 10-band vertical
column through the door (x 0.50-0.60, y 0.40-0.66): ours runs L 9.5 / 16.6 / 22.7
across the lower three-fifths against a 45.3 shoulder band = 4.8x internal range,
floor at L 9.5. Reference `car-paint-closeup-03`'s equivalent column NEVER drops
below L 53.2 and spans only 53-73 (1.5x); `-04` spans 48-108. Whole-crop mean:
ours 25.9 vs ref03 65.9 and ref04 86.4 = 1.3-1.7 stops down, ENTIRELY in the
mid-tones, not the highlights (our per-band `max` 122-173 is in the right place).
  PHYSICAL CAUSE: car.js:1216 runs `metalness: 0.90, roughness: 0.10`, which
  zeroes the diffuse lobe, so 100% of the panel's mid-tone budget rides a narrow
  specular IBL cone pointed sideways into a dark dusk cityscape. Real automotive
  basecoat is a PIGMENTED DIELECTRIC BINDER loaded with aluminium flake — the
  binder scatters, and that is what holds ref03's rocker at L 53 while its sky
  band sits at 84. Modelling the whole basecoat as metal removed that floor, and
  correct box-projected parallax then aimed the mid-flank rays at real tarmac with
  nothing to catch them. Ours is also oversaturated in the hole (sat 0.81 vs
  ref03 0.75, ref04 0.42) — the signature of candy lacquer over black, not
  metallic paint.
FIX (car r8 brief): at car.js:1216 split the two layers instead of collapsing
them into one metal — drop `metalness` to ~0.18, raise base `roughness` to ~0.38
so the pigmented basecoat keeps a real diffuse lobe, and move the flake's
metallic sparkle to a `metalnessMap` driven by the existing `flake` texture
(car.js:1157) rather than a global metalness of 0.90. KEEP `clearcoat: 1.0 /
clearcoatRoughness: 0.018` and the 4.5x `ccGain` — they are doing the sharp
horizon and shoulder line correctly. Then re-tune `envMapIntensity` back UP from
1.25, since a dielectric basecoat no longer risks the `daytime-downtown` clip
that forced it down.
NEW TOOL: `tools/_crop.mjs` (regional luminance/saturation banding) — reuse it
alongside `_tm-measure.mjs`, do not rewrite.

**chase-camera r4: `real wins`, and the fix is ALREADY APPLIED — do not re-apply.**
The r3 `distance` 7.20 -> 10.2 change OVERSHOT by about as much as 7.20 undershot,
in the other direction. Measured at 10.2, 1920x1080:

| measurement | ours @10.2 | target | status |
|---|---|---|---|
| car height, % of frame height | 18.20% | 20.9-21.7% | too small (was 28.1%) |
| depression ratio (camH 1.941 / lens-to-bumper 9.672) | 0.201 | 0.21-0.22 | just under (was 0.315) |
| ground-contact line, fraction of frame height | 0.713 | 0.77 | too high (was 0.83) |
| FOV vertical / horizontal | 44.37 / 71.88 | ~43 / ~70 | CORRECT, untouched |

Measured distance sweep: `8.6` -> 22.67% / 0.765 / 0.251; `8.9` -> 21.64 / 0.753 /
0.240; `9.0` -> 21.32 / 0.750 / 0.236; `9.2` -> 20.70 / 0.742 / 0.230.
ORCHESTRATOR APPLIED `scenes.js` dusk-highway-chase `distance` 10.2 -> **9.0**
(lint ok), with the whole sweep recorded in the comment in place. `lookHeight`
stays 1.05 — at 9.0 the car does not read detached.
Other supporting numbers so r5 need not re-derive: horizon 0.494, roofline 0.555
(below horizon, correct), car WIDTH 13.22% of frame width vs refs' 20-23%.
IMPORTANT geometric constraint the critic found: the depression target 0.21-0.22
is UNREACHABLE at height y=1.94 — it needs 9.0-9.4 m lens-to-bumper, which pushes
car height back to ~19.5%. If a later round wants both numbers, HEIGHT is the
lever, not distance. The car-width shortfall points the same way.
NEXT: this piece needs only an r5 CRITIC to confirm 9.0, no builder.

**hud r4: `real wins`.** GAP: the boost bar is a hard-edged segmented battery, not
a bloomed flame. At mid-height (y=1015) ours has 3 px pure-black segment gutters at
x=280 and x=480 plus a 196 px exposed empty trough from x=489-685; the reference
(`hud-overlay-03`, y=712) has ZERO pixels below luma 120 across its entire 435 px
span. Vertically ours goes black -> 1 px white stroke (126,132,134) -> fill in 2 px
(y=983->987) where the reference feathers over 18 px (y=681 (31,54,44) -> y=699
(238,250,166)). Ours never blows out and is too green: peak fill (116,219,42),
R/G = 0.53; reference peak (238,250,166), R/G = 0.95.
FIX (hud r5 brief): in `hud.js` DELETE the `SEGS = 12` notch pass and the
empty-trough render entirely (~lines 482-500 plus the notch loop after it) — the
reference bar has no visible dividers and no unfilled track. Replace the flat fill
with an additive multi-pass glow: draw the fill 3x with
`globalCompositeOperation = 'lighter'` and increasing `filter: blur(4/10/20px)` so
the outer edge feathers ~18 px past the bar bounds, and shift the gradient stops
toward yellow-white (`#e8fa96` core, `#8fe03a` fringe) so the core clips near 245
luma instead of stalling at 219.
Also found, for LATER rounds of this piece (do not chase them now):
  - The r3 "baked satellite tile" brief only HALF landed. `bakeMapTile(1024)` at
    `hud.js:1033` does exist and is blitted as a cached texture (`mapTileFor` at
    :1188), but the tile's own content is drawn with per-building `fillRect` calls
    (:1107-1126) on a flat base, so it still reads as axis-aligned illustrated
    vector blocks with uniform-width white road strokes. Reference minimaps
    (`hud-overlay-01`, `-04`) are genuine aerial photo tiles with irregular
    canopy/roof texture. The tile is baked; it is not satellite-style.
  - Second-worst offender: the speedo/RPM panel is a ~99% OPAQUE flat black plate
    (sampled (5,8,14) inside vs (12,8,23) road just outside — it kills the scene
    behind it), 380x200 px, with clean un-outlined geometric digits. No reference
    frame has an opaque scrim; all four use translucent torn-splatter plates and
    amber numerals with hard black drop shadows. It reads as a debug overlay.
  - Positional geometry is FINE, do not spend a round on it: boost bar left margin
    72 px / 32.5% frame width (ref 32.8%); minimap right margin 41 px, bottom 42 px.

**boost-fx r4: `real wins`.** MASK IS FIXED — the r3 rebuild is verified good, it
is NOT the problem, stop looking at it. `uDebug=1` readback: mask = 0.000 exactly
at car centre (966,688); hole width 345 px at the car row and 389 px at mid-body
against a ~380 px on-screen car width; 560 px tall on the centreline (the extra
reach is the `uCarR*0.46..0.92` = 136-271 px JET CAPSULE, the one remaining loose
piece); total protected area 8.5% of frame; mask = 0.918 (post-ACES for 1.0) at all
four corners and the left edge midpoint. Blur is genuinely zero on the car and
genuinely full at the edge. `uCarR` is still 295 px but now only feeds the capsule.
GAP: the blur kernel is purely a function of SCREEN RADIUS, so the sky gets exactly
as much smear as the near tarmac and the frame's whole top half is dragged into
diagonal cloud streaks that no Burnout boost shot has. Measured from live uniforms
at r resolved off `uFocus=(0.504,0.508)`: kernel length is 52.1 px at sky top-left
(r=1.89), 52.1 px at sky mid-left (r=1.70) and 52.1 px at near road bottom-left
(r=1.93) — IDENTICAL, despite the sky being at infinite depth (true screen velocity
~0) and that tarmac being ~3 m away. It is inverted twice over: distant buildings
near the FOE get 0 px while the sky above them gets 52 px. `boost-blur-02`'s sky is
crisp with visible cloud edges and the tearing lives on ground and side geometry only.
FIX (boost r5 brief): in `boost.js` gate `lenPix` on DEPTH, not just radius — bind
the depth buffer to the pass and scale the kernel by screen-space velocity
(~1/viewZ), or at minimum multiply `falloff` by a `smoothstep` on linearized depth
so anything past ~150 m collapses to near-zero taps. That alone gives the sharp sky
and sharp vanishing point with 40+ px of tear only on the near road, which is what
`boost-blur-02` shows. Second pass, same round: split the flame into the two-stage
emitter INDEX.md calls for — a short blue-white core quad plus a longer green-yellow
plume that smears back — instead of the current pair of fat symmetric lime cones.

**damage-model r4: `real wins`.** The right harness finally got used — REUSE THIS
COMMAND, it is the only way panel detail is legible:
```
node tools/damage-shot.mjs --scene daytime-downtown --out shots/damage-model-r5.png \
  --do "d.setLevel(0.7)" --cam "3.9,1.6,4.2|0,0.75,0.3|40"
```
"SMOOTH TAFFY" IS NO LONGER THE RIGHT CRITICISM — the folds are there. Verified r3
claims: the per-panel split did NOT land as submeshes (the shell is still ONE
24,642-vertex mesh, `car.bodyMesh`); the per-panel identity landed inside the WELD
KEY instead, which is functionally fine for gap widening, so do not re-commission
submeshes. Crease normals DID land but weakly: mean edge dihedral 4.86 -> 8.18 deg,
sharp (>25 deg) edges 5.45% -> 8.66% of 57,430 edges. Damage falloff works (mean
displacement 0.132 m at z=+2.5 vs 0.001 m at z=-2.5) and crumple is correctly
net-inward (14,923 inward verts vs 2,056 outward).
GAP: the wreck has NO STRUCTURAL CRUSH. The car keeps its full length and its
wheels keep nominal positions, so it reads as an intact car wearing a dented skin
rather than a shortened wreck. Probed body bbox: rest 4.750 x 1.990 x 1.168 m; at
`setLevel(0.95)` (near-total wreck) 4.704 x 2.033 x 1.176 m. That is 46 mm of
longitudinal loss — 1% — while width and height GROW. Per-vertex displacement peaks
at 0.233 m at the nose bin. `crash-cam-02` loses roughly 0.6-0.9 m of front
overhang: the nose telescopes into the engine bay, the hood tents up over the
shortened bay, the front wheel jams rearward into a collapsed arch, and one wheel
has torn clean off and sits separately with its own contact shadow. In our shot the
front wheel arch is still a perfect unbroken circle at stock wheelbase and the
roofline is unshortened — the frame is rigid. The dents are decoration on an
uncrushable chassis.
FIX (damage r5 brief): in `damage.js` add a RIGID-BODY CRUSH STAGE that runs BEFORE
the per-weld displacement. Model the shell as 3-4 longitudinal crush zones (front
overhang, engine bay, cabin, rear) and per impact collapse the zones along the
impact axis by a scalar — translating every weld in a zone rearward and pulling the
zones behind it along — so total length drops 0.4-0.9 m at high severity instead of
46 mm. Drive the wheel transforms and the front arch geometry from that same crush
field so the front wheel migrates into the collapsed arch, and let the crush
accumulator SCALE the existing buckle amplitude rather than replacing it. Then add a
tear-off threshold on the front wheel so it detaches as a loose body with its own
contact shadow, matching `crash-cam-02`.

**road-surface r7: `real wins`.** r6 VERIFIED: "aggregate out of albedo" DID land —
road.js:822 is now only a 0.80->1.00 cavity darkening, further faded by `soak`
(documented in the comment at 812-822). But it did NOT help this scene, because the
wet path then GUTS the channel the detail was moved into: micro-normal at 34%
amplitude and `microAO` scaled by `(1 - uWet*0.60) = 0.40` (road.js:809-810). At
matched luminance (mean 101.4) ours hfRms 11.5 vs `-01.jpg` 16.4 — 30% LESS
chip-scale glint than the reference, while the same aggregate slope is simultaneously
being over-amplified into reflection warping. Aggregate now perturbs the mirror but
no longer shades the stone: exactly the water-surface read.
GAP: the wet road reads as CHOPPY STANDING WATER, not a millimetre-thick film over
stone. The planar-reflection ray is displaced by the chip normal far past a
resolvable budget, so every reflected vertical (streetlight, lit facade) shatters
into a stack of transverse chevron crests instead of an elongated coherent streak.
  Row-mean vs column-mean high-pass banding in the wet zone: ours rowBandRel 0.0166
  / colBandRel 0.0033 = 5.0:1 TRANSVERSE-band dominance. Wet-road reference
  `wet-night-asphalt-02.jpg` = 0.0037 / 0.0068 = 0.54:1 (streaks run DOWN-road, not
  across it); `-01.jpg` = 2.8:1. Ours has ~9x more cross-road ripple banding than the bar.
  CAUSE CHAIN in `game/road.js`: `uGrainAmt` is `lerp(1.0, 0.34, wet)` (line 1344)
  and the scene probes `wet = 1.0`; then line 873 does
  `gMicroN /= max(0.25, uGrainAmt)`, re-amplifying the slope 2.94x; then line 959
  feeds it in at `mix(0.030, 0.0022, water)` — 0.030 UV is ~58 px at 1920 wide,
  against the code's OWN stated budget of "a couple of screen pixels" (line 954),
  i.e. ~30x over.
FIX (road r8 brief): at `road.js:959` clamp the reflection disturb to a true
screen-space budget — replace `mix(0.030, 0.0022, water)` with a value derived from
`uReflTexel` (e.g. `disturb * uReflTexel * mix(3.0, 0.8, water)`) so displacement can
never exceed ~2-3 probe texels regardless of slope — and DELETE the
`gMicroN /= max(0.25, uGrainAmt)` re-amplification at line 873. Then put the
aggregate back where it is actually visible on a wet night: raise the wet floor of
`uGrainAmt` at line 1344 from 0.34 to ~0.70, and drop the `microAO` wet attenuation
at line 810 from 0.60 to ~0.30, so chip relief shows as fine specular glint breakup
(the `-01.jpg` sparkle field) rather than macro ripple distortion.

**audio r7: `real wins` — but r6 fixed nearly everything. Do not re-derive any of
this table.** All three long-running audio complaints are now measured PASSING:

| metric | r5 value | r7 measured | reference / target |
|---|---|---|---|
| crash punch, busy mix (crash peak - bed peak) | -0.53 dB | **+8.47 dB** (-7.32 vs -15.79) | - |
| crash peak above bed RMS | - | +9.74 dB (-7.32 vs -17.06) | - |
| post-impact envelope | FELL ~500 ms | **RISES**: tail rms -16.61 vs pre-crash bed -17.06 | - |
| whole-mix crest (ours-busy) | 8.14 dB | **16.22 dB** (peak -0.70, rms -16.92) | 15.1-15.5 HIT |
| busy loudness range p90-p10 | - | 3.5 dB (p99 -9.5) | - |
| open vs city, 40-band mean / max | 0.23 / 0.5 dB | **6.68 / 8.8 dB**, dL/R-corr -0.679 | yardstick 5.55 dB HIT |
| open/city/tunnel T-40 | 890 / - / 3380 ms | 640 / 810 / 3010 ms (d2370) | - |
| open/city/tunnel C80 | - | **4.0 / 3.0 / -6.4 dB** (d10.4) | >=8 dB spread HIT |
| tunnel tail L/R corr | -0.097 | 0.045 | <0.4 HIT |
| broadside L-R separation (isolated flyby) | 5.35 dB (corr 0.686) | **18.3 dB peak, pan swing 18.2 dB** | 15-25 dB HIT |
| flyby distance-level swing | 55.3 dB | 64.1 dB | ~+20 dB rolloff HIT |
| isolated crash crest / decay-to-10% | - | **24.85 dB / 230 ms** | 15.51/15.09 dB, 3095/590 ms FAIL |
| crash band abs-delta mean | - | 8.8 / 8.2 dB (best of all four families) | - |
| boost-solo band abs-delta mean | - | 9.0 / 12.9 dB (centroid 1705 vs 2486/550) | - |
| tyre band abs-delta mean (ours-squeal.wav) | 10.0-10.5 | 11.3 / 10.6 dB (centroid 2824 vs 1947/1610) | - |
| engine band abs-delta mean | 10.8 idle / 7.0 high | 11.5 idle / 7.2 high; idle crest 11.7 vs 19.5, envRoughness 5.99 vs 1.62 | - |

GAP: the crash now has PUNCH BUT NO BODY — r6 traded one for the other. Isolated, it
decays to 10% in 230 ms vs 3095 ms (crash-impact-01) and 590 ms (crash-impact-02),
and its crest is 24.85 dB vs the references' 15.51 / 15.09 — a 9.5 dB-too-peaky
spike, not a collision. Its 2-4.5 s tail measures -233 dB below peak in `open` and
`city` (bit-exact ZERO; only `tunnel` rings, at -21 dB), because audio.js:1219-1224
deliberately trimmed the dry sample to `dur: 0.55` and the longest surviving layer is
a single 1.3 s pink grain at 0.16 peak. Spectrum is FINE (band abs-delta 8.8 / 8.2 dB,
the best of all four families) — the defect is purely the envelope after the first 200 ms.
FIX (audio r8 brief): at audio.js:1194-1224 add a TWO-STAGE POST-IMPACT SETTLE rather
than lengthening the sample. (1) A modal ring bank: 4-6 high-Q bandpass/biquad
resonators at panel modes 180-1400 Hz with independent T60 0.8-1.5 s, excited by the
impact transient — supplies sustained metal without adding a new peak. (2) A
Poisson-scattered debris layer whose grain rate decays exponentially (~60/s down to
~5/s over 0.6-1.5 s) with level falling 25 dB across it, panned per-grain to
decorrelate. Then raise the pink bed at audio.js:1211 from `dur 1.3 / peak 0.16` to
~2.0 s with a -12 dB/s exponential, so decay-to-10% lands at 500-900 ms and crest
drops toward 15-17 dB.
TWO MEASUREMENT TRAPS for future rounds:
  - `ours-squeal-solo.wav` is INVALID: `audio-isolate.mjs:61` leaves `brake: 1` in the
    bed, so the bed already squeals at 0.88 and the A/B is a frequency-shifted partial
    cancellation (reports centroid 3971 Hz, band abs-delta 21.2 dB, zero tonal peak).
    Use `ours-squeal.wav`, or gate `brake` on the event.
  - Solo doppler now reads -429 cents (was -525). Sign is still correct; it is settled,
    do not re-test it.

## SESSION 6 EXACT NEXT ACTION (supersedes every earlier "Exact next action" below)

WAVE D BUILDERS IN FLIGHT, launched 01:35, ONE PER FILE:
  sky.js + post.js -> sky r8       (directional cloud LUT tap + cut alto/cirrus +
                                    raise ambient + highlight desat guard; ALSO owns
                                    the SSAO raise that the environment critic asked
                                    for, because world.js must not touch post.js)
  road.js          -> road r8      (clamp reflection disturb to uReflTexel, delete the
                                    gMicroN re-amplification, raise the wet grain floor)
  car.js           -> car r8       (metalness 0.90 -> ~0.18 + roughness ~0.38 +
                                    flake-driven metalnessMap, envMapIntensity back up)
  world.js         -> environment r9 (inset window reveals, per-storey cornice bands,
                                    instanced street/roof clutter, saturated paint)
  boost.js         -> boost r5     (depth-gate the blur kernel; two-stage flame)
  crash.js         -> crash r5     (shrink debris to 8-25 cm / 4-12 cm, triple counts,
                                    airborne lifetime, cap the fan, fix shutter polarity)
  damage.js        -> damage r5    (rigid-body crush zones before per-weld displacement,
                                    wheel migration, front wheel tear-off)
  hud.js           -> hud r5       (kill the segment notches + empty trough, additive
                                    3-pass bloom on the bar, translucent torn speedo plate)
  audio.js         -> audio r8     (modal ring bank + Poisson debris settle on the crash)
NO builder for chase-camera: its r4 fix is already applied to scenes.js.

WHEN THEY LAND: run `./tools/lint.sh`, render all seven scenes, then the WAVE E
CRITIC SWEEP — 10 critics, one per piece, NO builders running at the same time.
chase-camera needs an r5 critic to confirm `distance: 9.0` (targets: car height
20.9-21.7% of frame, contact line 0.77, depression 0.21-0.22 — and note depression
is unreachable at height y=1.94, height is the lever if a round wants both).
Critics whose briefs need non-default instructions:
  - damage r5 critic MUST use:
    `node tools/damage-shot.mjs --scene daytime-downtown --out shots/damage-model-r5.png --do "d.setLevel(0.7)" --cam "3.9,1.6,4.2|0,0.75,0.3|40"`
  - environment r9 critic must re-measure `tools/shadow-ab.mjs` back-to-back itself.
  - audio r8 critic must use `ours-squeal.wav`, NEVER `ours-squeal-solo.wav`
    (audio-isolate.mjs:61 leaves `brake: 1` in the bed, so the solo is invalid).
  - crash r5 critic: the dust plume is deliberately NEXT round, not this one.
  - no critic may test or recommend AgX. The tonemapper decision is CLOSED.
