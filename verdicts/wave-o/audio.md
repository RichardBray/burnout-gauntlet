PIECE: audio            ROUND: o1
SCENE: audio-isolate `boost` / audio-scene `busy`
OURS: shots/audio/ours-boost-solo.wav (re-rendered by me)   REF: reference/audio/boost-whoosh-01.mp3

BLIND CALL: I picked OURS as the fake. Level-matched (loudnorm I=-20) 0.8 s clips from each
onset, rendered as log/log spectrograms: ref-01 is a single continuous body centred at
340-600 Hz that tilts DOWN with frequency and dies above ~11 kHz. Ours is bimodal - a bright
sub-200 Hz thump streak, a SCOOPED 250-600 Hz hole, then a hiss shelf that keeps climbing to
18 kHz. It reads as "noise burst plus sine kick", not "fuel roar". The new envelope is right;
the spectrum is not.

VERDICT: real wins

CLAIMS CHECKED - every headline reproduced, one correction
- Constants re-grepped (Rule 5), all literal in `game/audio.js`: IGN_DEC 0.300 (:819),
  IGN_FLOOR 0.06 (:820), IGN_HOLD 0.130 (:817), IGN_PLAT 0.95, IGN_TAIL 0.070, IGN_SWEEP 0.170,
  IGN_CRACK 0.90, THUMP_DEC 0.240, THUMP_FLOOR 0.07, THUMP_PK 0.55, THUMP_STEP 0.60,
  THUMP_BLOOM 0.050, THUMP_TAIL 0.060. Ramp calls at :852-856 and :878-882 are as reported.
  md5 81ab609d5a05b51d9e08e53d26ad44f6. `lint ok`. NO comment-only edit here.
- My own re-render: solo peak 0.8071, crash 0.9980, squeal 0.2383, busy 0.9255 - identical.
  Steady -20.0 dBFS, ignition absPeak -4.3 dBFS. LEVEL IS REAL, not a -50 dB repeat.
- `_ignmeas` ours: over20 +7.6 dB @ +48 ms; hold 160/154/229 ms; 0-20 +5.6; 0-50 +6.8.
  IGN_REL=0.1 refs: -01 +6.6/+7.5/+8.7 @ +39, hold 110/68/106; -02 +10.9/+12.1/+14.6 @ +123,
  hold 220. Both headline targets HIT. The IGN_REL=0.1 gate is CONFIRMED - it reproduces the
  wave-m figures to the decimal; the 1e-4 gate on refs is confirmed void.
- COULD NOT reproduce the BEFORE column: reconstructing it needs an edit to `game/audio.js`,
  which the critic charter forbids. BEFORE numbers stand unverified.

**SIXTH BROKEN TOOL - `_ignmeas.mjs --lu` DOWNMIXES TO MONO AND UNDERSTATES THE DELTA ~1 LU.**
`readWavMono` averages L+R (`out[i]=s/ch`); BS.1770 sums per-channel mean squares. The boost
layer is partly decorrelated across channels, so the average cancels it more than the bed.
Proof: ffmpeg-channelsplit both files, run `--lu` per channel. 1.02-1.30 s -> L +4.85 / R +4.84
(mono says 3.91). 1.55-2.00 s -> L +2.33 / R +2.38, which reproduces the wave-m critic's +2.35
EXACTLY. BEFORE mono 2.39 @1.02-1.20 + the same ~1.1 offset = wave-m's 3.50; BEFORE mono 2.07 +
offset = wave-m's 3.15. Two independent windows agree.
=> **The builder's item 3 is WRONG. The busy guard was PASSING at +3.15, and is now +4.85.**
   wave-m was right; `--lu` is the defective side. Fix `--lu` to K-weight per channel and sum,
   or always run it channel-split.

DEFINITION PINNED (item 1). "Sustained-overshoot duration" = CONTIGUOUS run from the DETECTED
onset, non-overlapping 10 ms rms frames, >= +3 dB over steady rms (onset+1.3..1.7 s), 400 ms cap,
stop at the first frame below. Onset gate: absolute 1e-4 for our WAVs, `IGN_REL=0.1` for mp3.
The hop matters as much as the contiguity - ref-01 is 110 ms at a 10 ms hop and 68 ms at 1 ms.
Never quote "total". `_ignmeas` prints all three; quote the first.

NUMBERS - the gap, re-derivable
`ffmpeg -ss <onset> -t 0.25 -i <f> -map 0:a -ac 1 -ar 48000 -af
"highpass=f=LO:poles=2,highpass=f=LO:poles=2,lowpass=f=HI:poles=2,lowpass=f=HI:poles=2,volumedetect"`
onsets 2.2462 (ref-01) / 0.0537 (ours), bands re each file's own 300-800 Hz:

| band | ref-01 | ours |
|---|---|---|
| 300-800 Hz | 0.0 dB (-47.2) | 0.0 dB (-24.9) |
| 800-2000 | -3.3 | -0.3 |
| 2000-8000 | **-5.7** | **+2.4** |
| 8000-15000 | -26.9 | -7.5 (ref band is 96 kbps codec-limited; do NOT target it) |

Headline: **spectral tilt (2-8 k re 300-800) is +2.4 dB ours vs -5.7 dB ref-01 - 8.1 dB too
bright.** Same defect the 0-0.25 s centroid reports (3351 vs 2151 Hz), stated causally.

BIGGEST REMAINING GAP: the ignition crack has NO MID-BAND BODY - it is WHITE noise through a
Q=0.5 bandpass, so its spectrum tilts UP where a fuel roar tilts down.
`game/audio.js:838 src.buffer = noiseWhite` and `:842 mkFilt('bandpass', 2700, 0.5)`. White noise
is flat, a Q=0.5 bandpass has effectively no resonant shelf, and the thump ends at 96 Hz, leaving
a hole from 200-600 Hz - exactly where ref-01 puts its whole body. `noisePink` ALREADY EXISTS
(`:96,:1199`, unused by `ignite`) and is a one-token swap. Pink is -3 dB/oct: 550 Hz -> 4 kHz is
2.9 oct = -8.7 dB, which moves +2.4 to -6.3 against ref's -5.7. Pair it with a real 400-600 Hz
formant (drop the bandpass endpoints and raise Q) rather than raising IGN_SWEEP.

TARGETS FOR NEXT ROUND (all with the band command above, onsets as stated)
1. Spectral tilt (2000-8000 re 300-800), 0-0.25 s from onset: **-3 to -7 dB** (ours +2.4, ref-01 -5.7).
2. `_ignmeas --cent ... 0 0.25`: **<= 2500 Hz** (ours 3351, ref-01 2151).
3. HOLD, do not regress: 10 ms-hop contiguous hold 110-220 ms (now 160); over20 +7..+10 dB at
   >= +30 ms (now +7.6 @ +48); steady -20.0 dBFS, solo peak < 1.0 (0.807), busy peak < 1.0 (0.926);
   0.25-0.45 s centroid 1898 (ref 1911).
4. Busy guard >= +3 LU at 1.02-1.30 s, **measured CHANNEL-SPLIT** (now +4.85).
5. Not this round's gap, still open: `ours-crash-solo.wav` peak 0.9980 / -0.4 dBFS, on the ceiling.

RETIRED/CORRECTED
- `_ignmeas --lu` mono downmix: understates the busy delta by ~1 LU. Sixth broken tool.
- The builder's "the busy guard may have been silently failing" is RETRACTED - it passed.
- `_r8audio.mjs:144` absolute centroid windows (3520/4286) formally retired; use `--cent`.
- 8-15 kHz band on the mp3 refs sets NO target (96 kbps lowpass).
