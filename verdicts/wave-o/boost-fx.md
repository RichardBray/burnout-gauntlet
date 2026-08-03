PIECE: boost-fx            ROUND: o1
SCENE: boost-blur          OURS: shots/boost-fx-o1a.png, -o1b.png, shots/_bo1-bb-{fx,nofx}.png
REF: reference/boost-blur-02.jpg (`sips -Z 1920` -> 1920x1200)

BLIND CALL: ref, instantly. Ours has a dense picket-fence of hard repeating white/red
chevron teeth flanking the car - you can count them. Ref's streaks are continuous.

VERDICT: real wins

CLAIMS CHECKED (Rule 5 grep first)
- `md5 game/boost.js = 229e0a08a3136458dbccc7b1276f9ed6` - byte-identical to the builder's
  reported final state. `PK_KNEE 1.00` :111, `PK_CEIL 1.60` :112, `shoulder()` :113,
  `PK_BANDS 12.0` :394, `pj` :395, `NP 16` :410, `dsub` :412, `pk = shoulder(pk)` :433,
  `shoulder(texture2D(...))` :465, `ang` hoisted to :134. **Every constant REPRODUCES.**
  `crash.js:2158` reads `const r = 1.10 * heat`. Also verified.
- Scale-persistence P **REPRODUCES**: `_smearmeas --foc 0.504,0.508 --patch
  0.28,0.40,0.72,0.92`, P = hpRms(960x540)/hpRms(1920). Ours 19.96/14.74 = **1.354** and
  19.81/14.63 = **1.354** on two independent renders. Ref-02 6.85/5.26 = **1.30**.

## HEADLINE - THE ANTI-STIPPLE WIN IS REAL BUT THE PASS NOW SYNTHESISES A COMB

`_bo1-bb-nofx.png` is the pass's own input, grabbed in the SAME boot as `-fx.png`.
Same patch: **hpRms 1.70 (nofx) -> 14.74 (fx). An 8.7x HIGH-FREQUENCY INCREASE from a
blur.** Ref-02 there is 5.26. `_cropimg <file> 538 768 778 994 2 40` on both: nofx is plain
dark tarmac, fx is a hard sawtooth chevron field. **The pass is not smearing content; it is
manufacturing a periodic pattern.** NP=16 stations x PK_BANDS=12 wedges/radian = each
angular wedge shows the same 16 stations at its own fixed offset, i.e. a herringbone.

**SEVENTH TOOL FINDING - P CANNOT SEE THIS.** Scale-persistence only rejects *per-pixel*
aliasing. A 20 px coherent comb survives downsampling perfectly and scores P=1.35. P went
0.57 -> 1.36 by replacing 1 px noise with a low-frequency comb. Pair P with the input ratio.

Also: the "stip" patch is NOT content-matched. Ours contains a hazard-stripe barrier + the
red car flank; ref-02's is bare tarmac + two lane lines. P=1.35 vs 1.30 is a self-consistency
agreement, not a smear match. Do not read it as "our smear matches ref-02".

## CROSS-PIECE, crash x boost - I AGREE WITH THE CRASH-CAM CRITIC

Independent 2x2 (boost on/off x sparks on/off) in ONE boot via `tools/probe.mjs --scene
crash-cam --w 1920 --h 1080`; `uAmount = 0.2709` live. `_debrismeas --bg 15 --delta 12
--minpx 4 --maxpx 4000 --patch 0.677,0.807,0.389,0.519`:

| | boost 0 | boost LIVE |
|---|---|---|
| spark-only fill | 0.76% | **1.23%** |
| blob count | 48 | **18** |
| density /1e4 px (patch = 3.50e4) | 13.7 | **5.1** |
| areaMed | 13 | **37** |
| spark-only p99 lift (`_px`) | +5.2 | +3.4 |

**Sparks are NOT dissolved - fill goes UP, count collapses 62%.** The kernel fuses 3-4
slivers into one slab. Peak comes down (shoulder works) but area triples. Same defect
crash.js just removed, re-created in my pass. Ordered fix confirmed: **boost narrows the
kernel FIRST, then crash raises SPARKS.** One number: **patch-A density 5.1 -> 10.1 /1e4 px,
areaMed 37 -> <=15.** I independently confirm the **aspP90 inversion**: fx 6.17 (sparks on)
vs 6.39 (off) - inverted; nofx 8.08 vs 4.20 - correct. Valid only at uAmount=0.

## NEAR-ROAD RECLASSIFICATION - CONFIRMED, TARGET RETIRED

Builder is right, and it is worse than it said. `_cropimg` 38-480 x 756-918: our near road
is a featureless dark blue-grey gradient, RGB ~30, **no lane paint at all**; ref-02 has two
yellow lines at ~140 luma. nofx hpRms there is **2.12** - nothing up-ray beats the local
mean, so `max(pk-mean,0)` is ~0 whatever the phase. **Content gap, owner `game/road.js`.**
Second, independent reason to retire: at `--foc 0.504,0.508` ref-02 itself scores
radSmear **3.5** in that patch (its VP is off-frame left; its aniso 52.6 is at 5 deg,
horizontal, not radial). **The `radSmear >= 15` target was never derivable from ref-02.**

BIGGEST REMAINING GAP: the 260 px speed-line / peak branch is a *generator*, not a filter -
16 discrete stations with a per-wedge quantised phase paint a hard chevron comb over tarmac
that had none. Mechanism: band-quantised `pj` + too few stations over `PK_REACH * lenPix`.
File: `game/boost.js:394-395, 409-412, 455-470`.

TARGETS FOR NEXT ROUND
1. `_smearmeas --foc 0.504,0.508 --patch 0.28,0.40,0.72,0.92`, `_heromask --scene boost-blur`
   fx vs nofx in one boot: **hpRms(fx)/hpRms(nofx) <= 1.2** (now 8.7). A blur may not add HF.
2. Same patch, same run: radSmear **4.1 -> >= 12** while (1) holds. Ref-02 maxSmear 62.4 px.
3. Hold P = hpRms(960)/hpRms(1920) in [1.0, 1.5] (now 1.354; ref 1.30). Gate, not headline.
4. Crash-cam patch A, boost LIVE: blob density **5.1 -> 10.1 /1e4 px**, areaMed 37 -> <= 15,
   spark-only fill <= 3.0%. Boost must land before crash raises SPARKS.

RETIRED/CORRECTED
- Target 1 (near-road radSmear/aniso/hpRms >= 15/15/3.0) **RETIRED** - twice over: no content
  (ours) and no radial smear in the reference (ref-02 radSmear 3.5 at that foc). To road.js.
- Bare `aniso` in patch 1 stays retired.
- `aspP90` is **not** a safe aspMed replacement under boost LIVE - it inverts. Use density.
- Scale-persistence P added to the broken-metric list *for this use*: blind to synthesised
  low-frequency structure. Always pair it with the fx/nofx hpRms ratio.
