PIECE: audio   ROUND: p   FILE: `game/audio.js` (sole owner)
FINAL md5 `game/audio.js` = fd60efd46dd2ea2b87538ee99e99b520   `lint ok`

## HEADLINE: the spectral-tilt gap is CLOSED. +2.4 dB -> -5.8 dB against ref-01's -5.7 dB.

Mechanism, in order: the ignition crack's source is now PINK, not white; a new mid-band BODY
layer (pink through a resonant bandpass falling 720 -> 520 Hz over IGN_SWEEP) fills the
250-600 Hz hole; the LF thump was moved up under that formant; and the thump's attack was
front-loaded, which is what put the sustained-overshoot hold back.

## CONSTANTS CHANGED - before -> after, with file:line (Rule 5)

Note on provenance: a crashed earlier instance of this builder had already written the
pink/body part of this edit into the tree (audio.js mtime 06:04, md5 ee551f61...) with NO
verdict file and NO measurements. I re-derived everything from scratch, reconstructed the
wave-o file functionally (below), and measured the whole thing paired. Two of its constants
were wrong and one of its comments LIED; both are fixed here.

| file:line | before (wave-o, md5 81ab609d) | after |
|---|---|---|
| `game/audio.js:858` | `src.buffer = noiseWhite;` | `src.buffer = noisePink;` |
| `game/audio.js:830` | (did not exist) | `IGN_BODY_F0 = 720` |
| `game/audio.js:831` | (did not exist) | `IGN_BODY_F1 = 520` |
| `game/audio.js:832` | (did not exist) | `IGN_BODY_Q = 0.90` |
| `game/audio.js:833` | (did not exist) | `IGN_BODY_G = 2.10` |
| `game/audio.js:880-906` | (did not exist) | BODY layer: pink -> bandpass(F0->F1, Q) -> gain, envelope shares the crack's shape, ends at `IGN_DEC * 0.85` |
| `game/audio.js:930` | `THUMP_PK = 0.55` | `THUMP_PK = 0.42` |
| `game/audio.js:931` | `THUMP_STEP = 0.60` | `THUMP_STEP = 1.15`  <- **this one is mine, and it is the hold fix** |
| `game/audio.js:937` | `o.frequency.setValueAtTime(210, now)` | `setValueAtTime(300, now)` |
| `game/audio.js:938` | `expRampToValueAtTime(96, now + 0.18)` | `expRampToValueAtTime(150, now + 0.18)` |

UNCHANGED, re-grepped as the last action: `IGN_OVER = 0.55` (:813), `IGN_CRACK = 0.90` (:819),
`IGN_ATK 0.003`, `IGN_BLOOM 0.045`, `IGN_HOLD 0.130`, `IGN_PLAT 0.95`, `IGN_DEC 0.300`,
`IGN_FLOOR 0.06`, `IGN_TAIL 0.070`, `IGN_SWEEP 0.170`, `THUMP_BLOOM 0.050`, `THUMP_DEC 0.240`,
`THUMP_FLOOR 0.07`, `THUMP_TAIL 0.060`, `CLIP_KNEE 0.68` (:342), `limiter.threshold -3 /
ratio 4` (:361-362). Diagnostic edits to CLIP_KNEE and the limiter (below) were reverted and
re-grepped.

**COMMENT THAT LIED, now fixed** (`:908`): the earlier instance changed the thump oscillator
210 -> 96 Hz into 300 -> 150 Hz and left the comment saying "Starts at 210 Hz and falls to 96".
The comment now states 300 -> 150 and says why. Also `:912` said "720 -> 450 Hz" after I moved
F1 to 520; corrected.

## PAIRED ATOMIC A/B - A,B,A,B interleaved, peers md5-stable across all four

**A could NOT be reconstructed byte-exactly** (no backup of md5 81ab609d exists anywhere in the
tree; the crashed instance overwrote it in place). I reconstructed it FUNCTIONALLY - white
crack, body block deleted, THUMP_PK 0.55, THUMP_STEP 0.60, thump 210 -> 96 - and it reproduces
**every one of the wave-o critic's thirteen published figures to the decimal**, which is a
stronger identity check than an md5 for this purpose:

onset 0.0537 / 0-20 +5.6 / 0-50 +6.8 / over20 +7.6 @ +48 ms / hold 160-154-229 /
solo peak 0.8071 / crash peak 0.9980 / busy peak 0.9255 / steady -20.0 dBFS /
tilt 2k-8k re 300-800 = +2.4 / 800-2k = -0.3 / centroid 3351 and 1898 /
busy guard channel-split L +4.85 R +4.84.

All four runs used `md5 game/*.js | grep -v audio.js` before AND after each render window;
`PEERS STABLE` on all four. Renders are deterministic offline, so run 1 and run 2 of each
variant are bit-identical - both rounds agree exactly. No pair was voided.

| metric (exact args below) | A run1 | B run1 | A run2 | B run2 | ref-01 | target |
|---|---|---|---|---|---|---|
| tilt 2k-8k re 300-800, 0-0.25 s | **+2.4** | **-5.8** | +2.4 | -5.8 | -5.7 | -3..-7 **HIT** |
| tilt 800-2k re 300-800 | -0.3 | -4.3 | -0.3 | -4.3 | -3.3 | (no target) |
| tilt 8k-15k re 300-800 | -7.5 | -24.3 | -7.5 | -24.3 | -26.9 | codec, no target |
| centroid 0-0.25 s | **3351** | **1754** | 3351 | 1754 | 2151 | <=2500 **HIT** |
| centroid 0.25-0.45 s | 1898 | **1731** | 1898 | 1731 | 1911 | hold 1898 **MISSED** |
| hold, 10 ms hop contiguous | 160 ms | **150 ms** | 160 | 150 | 110 | 110-220 **HIT** |
| hold, 1 ms hop contiguous | 154 ms | 84 ms | 154 | 84 | 68 | (closer to ref) |
| over20 | +7.6 @ +48 | +7.8 @ +39 | same | same | +8.7 @ +39 | +7..+10 @ >=+30 **HIT** |
| 0-20 ms | +5.6 | +5.8 | same | same | +6.6 | **HIT** |
| 0-50 ms | +6.8 | +6.2 | same | same | +7.5 | **HIT** |
| steady | -20.0 dBFS | -20.0 dBFS | same | same | - | **HIT** |
| solo peak | 0.8071 | 0.7481 | same | same | - | <1.0 **HIT** |
| busy peak | 0.9255 | 0.9279 | same | same | - | <1.0 **HIT** |
| crash-solo peak | 0.9980 | 0.9980 | same | same | - | still on the ceiling, untouched |
| busy guard, CHANNEL-SPLIT | L+4.85 R+4.84 | **L+4.00 R+4.15** | same | same | - | >=+3 LU **HIT** |

### exact args, re-derivable
- render: `node tools/audio-isolate.mjs`; `node tools/audio-scene.mjs --only=busy`;
  `node tools/audio-scene.mjs --noboost`
- envelope: `node tools/_ignmeas.mjs shots/audio/ours-boost-solo.wav` (absolute 1e-4 gate, ours
  is digitally silent pre-event). Refs: `IGN_REL=0.1 node tools/_ignmeas.mjs reference/audio/boost-whoosh-01.mp3`.
  **The 1e-4 gate on the mp3 refs stays void.**
- tilt: onsets 2.2462 s (ref-01) / 0.0535 s (ours B) / 0.0537 s (ours A), 0.25 s window,
  `ffmpeg -ss <onset> -t 0.25 -i <f> -map 0:a -ac 1 -ar 48000 -af
  "highpass=f=LO:poles=2,highpass=f=LO:poles=2,lowpass=f=HI:poles=2,lowpass=f=HI:poles=2,volumedetect"`,
  each band quoted RELATIVE to that file's own 300-800 Hz.
- centroid: `node tools/_ignmeas.mjs --cent <f> 0 0.25 0.25 0.45` (onset-relative; `IGN_REL=0.1`
  prefixed for the mp3).
- busy guard, **CHANNEL-SPLIT, never mono**:
  `ffmpeg -i shots/audio/ours-busy.wav -filter_complex "channelsplit=channel_layout=stereo[l][r]" -map "[l]" L.wav -map "[r]" R.wav`
  then `node tools/_ignmeas.mjs --lu <busy>/L.wav <noboost>/L.wav 1.02 1.30` per channel.
- **Sustained-overshoot definition, quoted unchanged from wave-o:** contiguous run from the
  DETECTED onset, non-overlapping 10 ms rms frames, >= +3 dB over steady rms (onset+1.3-1.7 s),
  400 ms cap, stop at the first frame below. Hop matters as much as contiguity. Never quote total.

## TOOL AUDIT (budgeted one; two controls run, BOTH came back NULL - report them so nobody re-runs them)

**Control 1 - is the master chain eating the ignition? NO.** Hypothesis: bug-class-4, the
ignition is pushed past what `clip` (WaveShaper, knee 0.68) and `limiter` (compressor, -3 dB,
ratio 4, 50 ms attack, 300 ms release) can represent, so `audio-isolate.mjs`'s SUBTRACTION -
which assumes a linear chain - is invalid, and every published ignition number is measured
through a nonlinearity. The boost scene's bed is `rpm01 0.85, throttle 1, load 1`, i.e.
full-throttle, so the chain is plausibly already engaged.
Paired control: `CLIP_KNEE 0.68 -> 0.99`, `limiter.threshold -3 -> 0`, `limiter.ratio 4 -> 1`
(both safety stages effectively bypassed), everything else identical, same render, same args.
Result: **0-20 +2.3, 0-50 +4.3, over20 +7.5 @ +40, hold 0 ms - identical to the un-bypassed
run to 0.1 dB.** The subtraction is linear-valid at these levels. `audio-isolate.mjs` is
CLEARED for the ignition metrics. All three diagnostic constants were reverted and re-grepped.

**Control 2 - the "halve the level" linearity test is CONFOUNDED, do not use it.** I halved
`IGN_OVER 0.55 -> 0.275` expecting -6.02 dB and measured -4.6 dB on 0-20 and -2.9 dB on
absPeak, which LOOKS like 1.4-3.1 dB of compression. It is not. The difference signal also
contains the SUSTAINED boost voice ramping up (`out.gain` 0 -> 1, tc 0.02, then decaying to
SUSTAIN with tc 0.34) and the engine sidechain duck, neither of which scales with IGN_OVER.
Solving `10log10(p/4 + 1-p) = -4.6` gives p = 0.871, i.e. the ignition owns 87% of the 0-20 ms
energy and the residual 13% is the floor. Control 1 is what actually settles the question.
**Anyone who runs a halve-the-gain null on `ours-boost-solo.wav` and reads the deficit as
compression will be wrong.** That is the "substitutes a term's ceiling instead of identity"
bug in a new costume.

## THE ACTUAL BUG I FIXED, and it is bug-class-4 in reverse

The pink swap alone was a REGRESSION on the round's own do-not-regress target: it took the
contiguous hold from 160 ms to **0 ms**. The published `over20` was untouched at +7.6 dB, so
the defect was invisible to every headline metric except the hold.

Mechanism, measured not guessed. `IGN_ENV=1` on the pre-fix render:
`env(10ms) 1.9 2.1 5.8 4.2 5.7 8.7 4.7 6.8 6.4 4.1 7.6 3.5 6.2 6.1 5.2 3.8 2.1 ...`
Frames 0 and 1 sit at +1.9 / +2.1 dB, just under the +3 dB gate, so the contiguous run dies at
frame 0 while frames 2-15 are all comfortably over. The metric is correct; the signal was wrong.

My first hypothesis was that the pink source plus the downward 2700 -> 800 Hz sweep makes the
noise layers' broadband rms RISE over the sweep, so the envelope needed pre-emphasis. I tested
it: `IGN_CRACK 0.90 -> 1.30`, applied to BOTH noise layers. **It moved 0-20 ms by +0.3 dB and
did not move the hold off 0 ms.** Reverted to 0.90; the null is recorded in the comment at
`:815-818` so nobody re-tries it.

The real cause is the LF thump, which `IGN_CRACK` does not touch. `THUMP_STEP = 0.60` meant the
300 Hz sine started at 60% of its peak and RAMPED UP over its first 50 ms to `THUMP_BLOOM` -
and that sine, not either noise layer, is what sets the first 20 ms of the ignition. Front-
loading it (`0.60 -> 1.15`, so IGN_ATK is the thump's own peak and it settles back to THUMP_PK
by THUMP_BLOOM) took the hold **0 -> 170 ms in a single constant** with the solo peak at 0.797.
It is also the physically correct shape: the pressure step of an ignition is at the front.

## PAIRED WITH THE EAR (spectrogram, since I cannot listen)

Level-matched (`loudnorm=I=-20:linear=true`) log-frequency spectrograms, 0.8 s from each onset,
ours vs `boost-whoosh-01.mp3`. The wave-o critic's blind call was "ours is bimodal - a bright
sub-200 Hz thump streak, a SCOOPED 250-600 Hz hole, then a hiss shelf climbing to 18 kHz".
**That hole is gone.** Ours is now one continuous mass from ~150 Hz through ~2.3 kHz tilting
down with frequency, the same shape as ref-01, and the "sine kick plus noise burst" read is
gone. Remaining visible difference: ours still carries content to 18 kHz where ref-01 stops
dead at ~10 kHz - that is the 96 kbps codec lowpass and sets no target (standing constraint).
The number and the picture moved together.

## TARGETS

- **1. Spectral tilt (2k-8k re 300-800), 0-0.25 s from onset, target -3..-7: HIT.** +2.4 -> **-5.8**,
  ref-01 -5.7. Error 0.1 dB. This was the round's headline gap and it is closed.
- **2. `--cent ... 0 0.25` <= 2500 Hz: HIT.** 3351 -> **1754**. Note we now overshoot DARK -
  ref-01 is 2151, so we are 397 Hz under it. See RESTATE below.
- **3. Do-not-regress: MOSTLY HIT, one MISS.**
  - hold 110-220 ms: 160 -> **150** HIT (1 ms hop 154 -> 84; ref-01 is 68, so this moved TOWARD the ref)
  - over20 +7..+10 at >= +30 ms: +7.6 @ +48 -> **+7.8 @ +39** HIT
  - steady -20.0 dBFS: **-20.0** HIT. solo peak <1.0: 0.8071 -> **0.7481** HIT.
    busy peak <1.0: 0.9255 -> **0.9279** HIT.
  - **0.25-0.45 s centroid 1898 (ref 1911): MISSED - 1731, -167 Hz / -8.7%.** Honest number.
    Cause is structural, not tuning: I tried `IGN_BODY_G 2.60 -> 2.10` AND `IGN_BODY_F1
    450 -> 520` together and the 0.25-0.45 centroid moved 1733 -> 1731, i.e. NOT AT ALL. The
    body layer has ended by 0.325 s and does not live in that window. What sets it is the
    CRACK, and the crack is pink now. The 0-0.25 tilt and the 0.25-0.45 centroid pull in
    opposite directions through one source colour. (I kept the 2.10/520 variant anyway: it
    took the tilt from -6.1 to -5.8, i.e. onto ref-01's -5.7.)
- **4. Busy guard >= +3 LU at 1.02-1.30 s, channel-split: HIT.** +4.85/+4.84 -> **+4.00/+4.15**.
  It dropped 0.8 LU because the ignition's energy moved DOWN in frequency and BS.1770
  K-weighting penalises LF - that is the metric behaving correctly, not a level loss. Still
  1.0 LU of margin.
- **5. `ours-crash-solo.wav` peak 0.9980 / -0.4 dBFS: UNTOUCHED, still on the ceiling.** Not
  this round's gap, confirmed still open, byte-identical across all four runs.

## RESTATE I AM PROPOSING (not a retirement - a tightening)

**Target 2 should become a BAND, `--cent 0 0.25` = 1900-2400 Hz, not a ceiling of <=2500.**
Proof it needs to be two-sided: this round moved 3351 -> 1754 and the one-sided target scores
that as a clean pass, but 1754 is 397 Hz BELOW ref-01's 2151 - we overshot through the
reference and out the other side, and a ceiling cannot see that. Same class as the failure the
brief warns about. The tilt target (1) is already two-sided and caught it correctly (-5.8
against -5.7), which is why I trusted the tilt over the centroid when choosing between variants.

## WHAT I DID NOT DO

- Did not touch any file but `game/audio.js`. Peers md5-verified stable across all four render
  windows.
- Did not chase the 8-15 kHz band (96 kbps codec lowpass on the refs, no target - standing).
- Did not touch `ours-crash-solo.wav`'s 0.9980 ceiling.
- Did not fix `_ignmeas.mjs --lu`'s mono downmix in the tool itself. It is still defective; I
  worked around it by always measuring channel-split, as instructed. **A future round should
  make `--lu` K-weight per channel and sum, so the workaround stops being load-bearing** - the
  next builder who forgets it will under-report the guard by ~1 LU and may "fix" a passing test.

## BIGGEST REMAINING AUDIO GAP (for the wave-q critic)

**The ignition is now correctly coloured but it is 1.9 dB shy of the reference's ONSET IMPACT,
and level headroom is the reason - this is bug-class-4 and it is unresolved.** ref-01 opens at
0-20 ms = +6.6 dB and 0-50 ms = +7.5 dB over its own steady; we are at +5.8 and +6.2. The
obvious move is to raise `IGN_OVER` (`:813`, still 0.55), but the busy mix already peaks at
0.9279 and the solo at 0.7481 against a `CLIP_KNEE` of 0.68, so roughly 0.6 dB of broadband
headroom exists before the ignition starts setting the file peak. The energy has to come from
somewhere other than gain: either the bed comes down (`BED_TRIM 0.22` at `:349`, which touches
every other piece's balance and should be an orchestrator decision, not a builder's), or the
ignition's 0-50 ms is bought back in the time domain by shortening `IGN_BLOOM`/`IGN_HOLD` so
the same peak is spent earlier. I did not attempt either - the first is out of scope for one
builder and the second trades directly against the hold I just repaired.
Second remaining gap, unchanged from wave-o: `ours-crash-solo.wav` at 0.9980 / -0.4 dBFS.
