PIECE: crash-cam            ROUND: o1
SCENE: crash-cam            OURS: shots/crash-o1.png, shots/o-o1-BL-sparks.png (boost LIVE),
                                  shots/o-o1-B0-sparks.png (uAmount=0)
REF: reference/crash-cam-04.jpg

BLIND CALL: real, instantly. Ref crash-cam-04 has ~60 discrete gold sparks skittering on the
tarmac, each a sharp 6 px comma with a hard head. Our shipping frame's whole lower half is one
brown radial smear; at 4x (`_cropimg shots/o-o1-BL-sparks.png 1300 1550 420 560 4`) the sparks
are soft ORANGE PARALLELOGRAM SLABS ~130x70 px with flat top edges. Nothing reads as a spark.

VERDICT: real wins

## CLAIMS CHECKED — WAVE N REPORTED HONESTLY. ALL 15 CONSTANTS VERIFIED BY GREP.

`crash.js` :2158 `r = 1.10`, :2159 `0.609`, :2160 `0.216`, :2128 ceiling `0.30`, :2133
`0.012 + len*0.012, 0.012, 0.032`, :499/:1002 `0.012`, :1422 `0.015`, :1424 `0.008`,
:1650 `0.013`, :1652 `0.016`, :1794/:1821 `0.013`, :2331 `0.009`, :212 `STREAK_VC = 0.86`,
:223-225 the two-branch nose taper. All present, literal values exact. Probe reproduces
lenPx p50 **12.523** / p90 **33.58** / max **60.005**, peak r **1.0093** to four figures, and
its self-declared MISS on p50 (12.52 vs band 8-12). Its self-report of the unchanged `6.4` at
:1287 is also true. **Rule 5 clean. Wave N crash is trustworthy.**

## THE OPEN CROSS-PIECE ITEM, MEASURED. THE BUILDER'S OWN DIAGNOSIS IS WRONG.

Harness `/tmp/crashmeas-o.mjs` (Wave N's, uAmount no longer forced) renders four screenshots in
ONE boot: boost LIVE and uAmount=0, each x sparks-visible/hidden. Ran twice. Live `uAmount`
in crash-cam is **0.2709**. `_debrismeas --bg 15 --delta 12 --minpx 4 --maxpx 4000
--patch 0.677,0.807,0.389,0.519` (patch A, 249x141 px), two runs:

| | boost 0 | boost LIVE | ref crash-cam-04 `--patch 0.00,0.30,0.63,0.73` |
|---|---|---|---|
| spark-only fill | 0.81 / 0.78% | **1.32 / 1.27%** | 3.17% (total) |
| blobs, sparks on | 48 / 52 | **17 / 15** | 63 |
| blob density /1e4 px | 14.2 | **4.6** | **10.1** |
| areaMed | 16 / 10 | 45 / 49 | 6 |
| aspP90 on / off | 6.39 / 4.3 | **4.9 / 5.3 (INVERTED)** | 9.83 |

The sparks are **not invisible under boost**. Fill goes UP (0.80 -> 1.30%). What collapses is
COUNT: boost's smear fuses 3-4 slivers into one blob and triples its area, so 50 sparks become
16 slabs. Raising density alone therefore buys more slabs, not more sparks.

## SIXTH TOOL FINDING — `aspP90` IS ONLY VALID AT uAmount=0

With boost live, patch A aspP90 is 4.9 with sparks and 5.0-5.6 with sparks HIDDEN: the
spark-sensitive statistic Wave N nominated to replace `aspMed` **inverts under the shipping
post chain**, because the smear isotropises a 12x1.4 sliver. Any aspP90 target must state
`uAmount=0`, or use blob DENSITY instead, which stays monotone in both states.

BIGGEST REMAINING GAP: boost's full-screen smear pass (`game/boost.js`) runs at uAmount 0.2709
during crash-cam and is applied AFTER the sparks are in the framebuffer, with no depth or
luminance gate on the additive layer. A 12 px sliver convolved with that kernel becomes a
130x70 px slab — the exact defect Wave N removed, re-created downstream. `game/crash.js` cannot
fix it; the gain is already at unity and the geometry already matches the probe band.

TARGETS FOR NEXT ROUND (crash and boost must agree on the first one):
1. **ONE NUMBER: patch A blob density with boost LIVE = 4.6 per 1e4 px -> 10.1** (ref anchor,
   `crash-cam-04 --patch 0.00,0.30,0.63,0.73`, 63 blobs / 62208 px). In patch A that is
   **16 blobs -> 35**. Route: boost narrows its kernel or gates the additive layer FIRST;
   crash then raises `SPARKS` count (currently 150, 114 live) to close the residual.
   **Do not raise `r` above 1.10.** Re-derive with `/tmp/crashmeas-o.mjs --tag <t>` +
   `_debrismeas` args above.
2. areaMed under boost live 47 -> <= 15 (ref 6). This is the slab test; it fails on kernel
   width alone and cannot be moved from crash.js.
3. length p50 12.52 -> 8-12 px: still 0.5 px over. Lower the :2128 ceiling's companion floor
   `0.09`, not the ceiling.

RETIRED/CORRECTED:
- Wave N's "the spark field is nearly invisible under boost" is **CORRECTED**: it is
  over-visible and wrong-shaped. Fill rises 63%; count falls 68%.
- **aspP90 on spark patches is now conditional on uAmount=0** (see above). aspMed stays retired.
- Confirmed run-to-run stability: two full boots agree to 0.05 pt fill and 2 blobs. The ±6%
  boost variance in STANDING-CONSTRAINTS did not appear on this metric.
