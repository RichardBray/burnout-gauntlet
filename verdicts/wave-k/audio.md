# WAVE K VERDICT — audio (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/audio.js

PIECE: audio (engine, boost, crash, tire)   ROUND: k1
SCENE: `busy` (tools/audio-scene.mjs:126, city, 4 s) + `boost` isolate
OURS: shots/audio/ours-busy.wav, ours-boost-solo.wav (re-rendered by the critic; `lint ok`)
REF: reference/audio/boost-whoosh-01.mp3, -02, crash-impact-02, tire-screech-01

BLIND CALL (by ear-equivalent measurement, labels withheld until after the call):
**picked the reference as real.** The tell is the IGNITION FRONT. Recording A dumps its maximum
energy 50 ms after onset and then relaxes into its sustain (+6.4 dB over steady in the first
20 ms, +9.7 dB peak overshoot). Recording B is *silent* for the first 20 ms, is still 11.9 dB
under its own sustain at 50 ms, and does not peak until +130 ms and then only by 2.4 dB.
**B swells; A cracks. Only a synthesiser ramps into a jet. B was ours.**

VERDICT: real wins

## NUMBERS
- Ignition transient, `ours-boost-solo.wav` (onset at file t=0.02, per `audio-isolate.mjs:97`),
  all re own steady level at +1.3-1.7 s: 0-20 ms **-inf**, 0-50 ms **-11.9 dB**, overshoot peak
  **+2.4 dB @ +130 ms**.
  `boost-whoosh-01`: +6.4 / +7.0 / **+9.7 dB @ +50 ms**.
  `-02`: +10.3 / +11.3 / **+15.6 dB @ +60 ms**.
- Same-timeline busy A/B (identical seed, boost pressed vs never pressed), K-weighted BS.1770:
  TRUE delta **+0.09 LU** at 1.02-1.20 s, **+0.49 LU** at 1.10-1.55, **+0.83 LU** at 1.55-2.00.
  Scale in the same render: tyre +0.90, crash +8.10 LU.
- Reference-aligned boost centroid: ours **1773 -> 2839 Hz** vs ref-01 **1928 -> 2837 Hz**.
  Confirmed.

## CLAIMS CHECKED
- Reproduced exactly: peaks (boost 0.6418, crash 0.9260), squeal bands 22.60/62.13/14.18,
  crash T60 1.92 s monotonic, boost stem post-onset -23.6 dB (claim -24.12), centroid
  3525 -> 4298 Hz, and **both r11 record corrections** — the 3525/4298 window artefact is real
  (`_r8audio.mjs:144` reads absolute 1.15-2.5 s of a file whose onset is at 0.02 s) and the
  f2-at-1860 Hz note at `audio.js:817` is accurate.
- **NOT REPRODUCED: "engaging boost now makes the mix audibly LOUDER."**
  `audio-scene-analyse.mjs:227` baselines the boost window against an *earlier window of the
  same file*, and that file is still fading in: on the boost-OFF render the same two windows
  differ by **+0.95 LU with boost never pressed**. So of r11's +0.83 dB, most is bed fade-in.
  Same-timeline truth is **+0.09 LU at the press — under the ~1 dB JND, i.e. INAUDIBLE.**
  The 1.88 dB swing is real; the sign flip is not.

## BIGGEST REMAINING GAP: the boost has no IGNITION TRANSIENT
`game/audio.js:703-712` gives the sustained voice a level trim and a 22 ms attack into
`DECAY_TC 0.34 / SUSTAIN 0.60`, i.e. **a contour that only rises** — there is no separate
one-shot ignition layer to bypass the `body` trim and put a crack in front of the swell.
FIX: add a parallel short burst (filtered noise + LF thump, ~8 dB above sustain, 3 ms attack,
120 ms decay), fed from **the gate edge, not from `env`**.

## TARGETS FOR NEXT ROUND
1. TRUE busy delta **>= +3 LU** in window 1.02-1.30 s, measured against a **same-timeline
   boost-off render** — add a `--noboost` flag to `tools/audio-scene.mjs` so this is
   re-derivable. **Never baseline on an earlier window again.**
2. `ours-boost-solo.wav`, onset at file t=0.02: rms(0-20 ms) - rms(+1.3-1.7 s) =
   **+6 to +10 dB**; overshoot peak **>= +8 dB** within 150 ms.
3. HOLD centroid 1773/2839. **Do not chase 3525/4298.**

## RETIRED/CORRECTED
- **RETIRED: the `audio-scene-analyse.mjs` "+boost delta-rms" number.** Its baseline is
  contaminated by the render's fade-in (+0.95 dB with boost OFF).
- **CORRECT `_r8audio.mjs:144`** windows to `[0.17,0.52]`/`[0.52,1.52]` — the solo file starts
  0.02 s before the event, so the current windows sit ~1 s late.
- Secondary, NOT the gap: boost bed 20-60 Hz envelope-modulation energy 18.8% vs ref-01's 2.9%
  (grainier sustain).
