# WAVE K VERDICT — boost-fx (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/boost.js

PIECE: boost-fx   ROUND: k1
SCENE: boost-blur   OURS: shots/boost-fx-k1-a.png, shots/boost-fx-k1-b.png
REF: reference/boost-blur-02.jpg (blur), -01/-04 (flame)

BLIND CALL: ref-02 is real, instantly. In ref-02 the road is torn into long yellow-line
streaks that run right up to the tyres, so the car punches a hole in a moving world. In ours
the entire near road is a smooth flat gradient with ZERO streak — only the sky and viaduct
move, and the car reads as parked on a soft-focus backdrop. Second tell: our exhaust reads as
two green LED lamps, not fire.

VERDICT: real wins

## NUMBERS (`_smearmeas --foc 0.504,0.508`, resolution-matched, ref-02 `sips -Z 1920`)
- near-road streak, patch `0.02,0.25,0.70,0.85` — ref-02 (`--foc 0.62,0.50`):
  maxSmear **104.7 px @5deg, aniso 52.6, hpRms 6.02**.
  Ours: **3.0 px, aniso 2.6, hpRms 0.49** (identical on both runs).
- Same patch with the boost pass BYPASSED (`shots/_k1mask-nofx.png`): hpRms **1.99**,
  radSmear 3.0. Pass ON: hpRms **0.49**, radSmear 1.8. **The pass removes 75% of the HF energy
  and adds NO directional structure**, while `_boostkernel` reports lenPix **52.2** there.
- near-road tonal range `_px --region nearRoad=.10,.90,.86,1.00`: ref-02 p01 21.1 / p99 92.8
  (72 levels). Ours 24.1 / 46.1 (22 levels).
- Hero mask (`_heromask`, `uDebug=1`, `shots/_k1mask.png`): a **420x520 px SOLID BLOCK**
  (x 740-1160, y 560-1080). `--region underCar=.44,.56,.86,.94` and
  `justBehind=.42,.58,.80,.87` are both **p50 0, 100% <16** — ~175 px of pure tarmac below the
  valance still gets zero blur.
- Flame (`_plumemeas --box 0.40,0.60,0.74,0.95 --thr 8`): 101x170 px, aspect **1.68:1** (L) /
  1.61:1 (R), tip at y 995. Hue ramp `dR/dG`: **0.49 at the nozzle bin (y .813) -> 3.23 at the
  tail (y .913)**.
- Flame colour, composited `_px`: ours Lcore `.4365,.4469,.7944,.8130` = 82,124,67,
  **R/G 0.66**, p50 88. ref-01 nozzle `.21875,.234375,.2361,.2685` = 170,205,90, R/G 0.83,
  **p50 229**. ref-04 Lcore `.4271,.4427,.8333,.8565` = 182,124,80, R/G 1.47.
- Run-to-run variance (a vs b): Lcore G 123.9/121.6 (1.9%), Lblob 47.9/44.5 (7.1%), Ltail
  47.3/43.7 (7.6%). nearL smear identical. **+/-6% confirmed on RADIANCE, not on GEOMETRY.**

## CLAIMS CHECKED
- Plume 1.6:1 with a tip in frame — **reproduces** (1.68/1.61, tip y 995).
- "Added-light G/B holds above 700 through the tail" — reproduces but is **MEANINGLESS**:
  `dB` is -0.5 to -4.7 there, so it is a divide-by-zero. Retired.
- "Matching ref-01's far end going GREENER" — **FALSE, INVERTED.** Ours is green at the nozzle
  and orange at the tail; ref-01 is hot yellow-white at the nozzle (p50 229) and green
  downstream.
- "The jet capsule held the tarmac sharp, now fixed, tarmac now smears under the car" —
  **DOES NOT REPRODUCE in boost-blur.** Mask is still exactly 0 over the tarmac behind the
  car, and where the mask IS fully open (nearL, mask 1.000) the tarmac still does not smear.
  **The mask was never the binding constraint.**
- Depth gate: `uDepthOn 1`, viewDist 3.5-14 m near / 300 clamp far. Good, not re-chased.

## BIGGEST REMAINING GAP: the radial accumulation is a BOX MEAN
`game/boost.js` accumulates its radial taps as a box mean, so on a low-contrast source it is
an **energy sink, not a streak** — 52 px of kernel yields 1.8 px of correlation.
**Kernel length is not the lever.** Switch the accumulation to bright-biased / max-of-taps
along the radial axis (ref-03's "multi-tap accumulation, doubled and ghosted"; ref-02's 105 px
yellow bands) so the few high-contrast features present are *drawn* as bands instead of
averaged away.

## TARGETS FOR NEXT ROUND
1. `_smearmeas --foc 0.504,0.508 --patch 0.02,0.25,0.70,0.85` on our shot: maxSmear
   **>=60 px**, aniso **>=15**, hpRms **>=3.0** (ref-02 resized: 104.7 / 52.6 / 6.02).
2. `_px --region underCar=.44,.56,.86,.94` on `shots/_k1mask.png`: p50 **>=120** (now 0), with
   `carBody=.44,.56,.62,.75` staying at 0.
3. Flame `dR/dG` from `_plumemeas --box 0.40,0.60,0.74,0.95 --thr 8`: monotonically
   **non-increasing** nozzle->tail, nozzle >=0.80 (ref-01 0.83), tail <=0.80. Nozzle-core
   composited p50 >=180 (ref-01 229).

## RETIRED/CORRECTED
- **RETIRED "added-light G/B >700"** — artefact of dB~=0. Use composited G/B; ref-01 is
  **1.83-2.88**, ours 1.85 ALREADY PASSES.
- **CORRECTED** r8's ref-01 hue-ramp direction: nozzle hot-yellow -> far end green, and our
  ramp is the reverse.
- **RETIRED "protected fraction %" and "mask mean"** as boost health metrics — both are
  internal pass state and neither predicts the image-domain streak (mask 1.000 with a 1.8 px
  smear).
- Confirmed retired, do not re-chase: 6.5:1 (HUD bar), ref-04's "two 65x35 px" (livery panels;
  real exhaust ~1.25:1 at `Lblob=.4089,.4609,.8287,.9028`).
