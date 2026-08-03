# WAVE M VERDICT — audio (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/audio.js

PIECE: audio (boost ignition)   ROUND: m1
SCENE: `busy` (tools/audio-scene.mjs:143, city, 4 s) + `boost` isolate (tools/audio-isolate.mjs)
OURS: shots/audio/ours-boost-solo.wav, ours-busy.wav, ours-busy-noboost.wav (all re-rendered by
the critic at m1; `./tools/lint.sh` = `lint ok`; pre-event residual 3.09e-5, subtraction valid)
REF: reference/audio/boost-whoosh-01.mp3 (primary), -02.mp3, tire-screech-01.mp3

BLIND CALL: **picked the reference as real**, on the SHAPE of the light-up, not its height.
Two 10 ms-rms envelopes re their own steady level. A: +5.7 +7.3 +8.0 +6.9 +9.1 +8.2 +5.1 +3.5
+6.6 +5.3 +4.6 dB — elevated for 110 ms, then relaxes. B: +6.1 +5.1 +3.0 +1.3 +2.6 -0.4 -2.6 —
back to steady inside 30 ms. **B is a CLICK. A is an afterburner lighting.** B was ours.

VERDICT: real wins

## NUMBERS (re-derivable; all re steady rms at onset+1.3-1.7 s)
- **Onset of `ours-boost-solo.wav` is file t=0.0531 s, NOT 0.02.** First |x|>1e-4 at 0.0531.
  `audio-isolate.mjs:66-73` steps 1/60 with `on = t > EVENT_AT`, so the gate first goes true at
  t=1.0167, and the WebAudio schedule lands ~19 ms later.
- Ignition, anchored to 0.0531: 0-20 ms **+5.6 dB**, 0-50 ms **+4.0 dB**, 20 ms-window overshoot
  **+6.0 dB @ +4 ms**. ref-01: +6.6 / +7.5 / **+8.7 @ +40 ms**. ref-02: +10.9 / +12.1 / +14.5 @ +122.
- **NEW HEADLINE — sustained-overshoot duration** = ms within 400 ms of onset for which the
  10 ms sliding rms stays >= +3 dB over steady. Ours **30 ms**; ref-01 **110 ms**; ref-02 **>310 ms**.
  A louder spike cannot satisfy this, which is the point.
- Same-timeline busy delta (ours-busy.wav minus ours-busy-noboost.wav, K-weighted BS.1770):
  1.02-1.30 s **+3.15 LU**, 1.02-1.20 **+3.50**, 1.00-1.10 **+3.89**, 1.10-1.55 +2.63, 1.55-2.00 +2.35.
- Centroid, onset-relative windows: **1877 -> 2878 Hz** (ref-01 1928 -> 2837). First 150 ms = 4500 Hz.
- Squeal unregressed: `ours-squeal.wav` bands 22.60/62.13/14.18, f2 826 Hz (ref-01 820).

## CLAIMS CHECKED
none available - Wave L reports lost, re-measured from scratch.

## Wave K targets, adjudicated
1. Busy delta >= +3 LU same-timeline: **PASS, +3.15 LU** (was +0.09). `--noboost` flag exists at
   `audio-scene.mjs:59,143`. Boost is now unambiguously audible. Close this target.
2. 0-20 ms +6..+10 dB, overshoot >= +8 dB: **NEAR MISS, +5.6 / +6.0.**
3. Hold centroid 1773/2839: **PASS at 1877/2878.**

## BIGGEST REMAINING GAP: the ignition DECAYS 4x too fast — it is a click, not a light-up
`game/audio.js:820` (`g.gain.exponentialRampToValueAtTime(1e-4, now + IGN_DEC)`) and `:836`
(the thump, to 1e-4 at +0.18 s). `lvl` is ~4.6, so the ramp spends **93 dB** across IGN_DEC=0.170:
the perceptually relevant top 10 dB is over in ~18 ms. **IGN_DEC is a floor-reaching time, not a
decay time constant** — the project's signature bug class again (a quantity pushed past the range
its downstream can represent). The three-stage envelope authored at `:791-795` is real and correct
in intent, but stage 3 deletes stages 1-2 before they can be heard, which is why the measured
energy maximum lands at +4 ms while both references peak at +40 / +122 ms.
FIX: ramp to a FLOOR SET IN UNITS OF THE SUSTAIN (e.g. `lvl * 0.06`, ~-24 dB) rather than 1e-4,
and extend IGN_DEC to ~0.30 s; or stage it — hold near `lvl` to +90 ms, then fall. Do NOT raise
`IGN_OVER` to chase the peak; the peak is nearly there and a taller spike makes the click worse.

## TARGETS FOR NEXT ROUND
1. **Sustained-overshoot duration >= 90 ms** on `ours-boost-solo.wav`, onset re-detected as first
   |x|>1e-4 (currently 0.0531), 10 ms sliding rms vs steady at onset+1.3-1.7 s. Ours 30, ref-01 110.
2. 20 ms-window overshoot **+7 to +10 dB**, and its time **>= +30 ms** after onset (ours +6.0 @ +4 ms;
   ref-01 +8.7 @ +40 ms). Both must pass together — this is what forbids a spike.
3. HOLD: busy delta >= +3 LU at 1.02-1.30; centroid 1877/2878; squeal 22.60/62.13/14.18.

## RETIRED/CORRECTED
- **RETIRED: "ignition is -inf for the first 20 ms" (Wave K).** Artefact of assuming onset at file
  t=0.02. The true onset is 0.0531; measured from 0.02 the window is mostly pre-gate.
  **Every future boost measurement must detect the onset, never hardcode it.**
- **STILL UNFIXED: `_r8audio.mjs:144`** windows are still absolute `[1.0,1.15]/[1.15,1.5]/[1.5,2.5]`,
  ~1 s late, and the first returns NaN (0.15 s < the 8192 FFT). Its 3520/4286 Hz output is void.
  Make them onset-relative. **Do not chase 3520/4286.**
- **CORRECTED: `_r8audio.mjs` ref-02 onset detection is wrong** (reports 0.56 s, centroid 254 ->
  558 Hz). Use `boost-whoosh-01.mp3` as the sole centroid comparator.
- Secondary, NOT the gap: `ours-crash-solo.wav` peak is 0.9980, at the digital ceiling.
