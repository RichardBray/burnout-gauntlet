PIECE: audio   ROUND: r (builder)   FILE: `game/audio.js`
TREE AT OPEN: `game/audio.js` md5 `193c8f6a6427a967e31d34dec629038b`, mtime 2026-08-03 08:36.
Wave-Q verdict audited md5 `fd60efd46dd2ea2b87538ee99e99b520`. **THE FILE ON DISK IS NOT THE FILE
WAVE Q AUDITED.** `git diff game/audio.js` is EMPTY because commit `e1c1e82` already contains the
08:36 edit, so git cannot diff it away - it had to be read for, exactly as the addendum says.

PEER-MD5 PROTOCOL: DROPPED for this piece per `wave-q/audio.md` and STANDING-CONSTRAINTS 1j
(`audio.js` has zero imports; `audio-isolate.mjs:46` / `audio-scene.mjs:64` load it alone).
`audio.js`'s own md5 is quoted at every leg below.

INTENT, one line: verify `THUMP_PK 0.42 -> 0.48` against ref-01 on the three onset figures with the
busy peak unmoved, and repair whatever the killed round-13/14 agent left behind.

---

# STEP 0 - AUDIT OF THE ABANDONED 08:36 EDIT. ONE DEFECT, AND IT IS A LIVE SILENT REGRESSION.

Method: every literal in `wave-q/audio.md`'s rule-5 table re-grepped against the tree at the line
the critic quoted, plus a read of `:800-1000` (the whole ignition/thump region) for half-finished
work. Wave Q verified thirteen constants; twelve are unchanged. One is not.

| file:line | wave-Q audited literal | ON DISK AT 08:36 | decision |
|---|---|---|---|
| `game/audio.js:955` `THUMP_PK` | `0.42` | **`0.00`** | **REVERT-AND-REPLACE (see below)** |
| `:956` `THUMP_STEP` | `1.15` | `1.15` | keep, unchanged |
| `:962` thump osc start | `300` | `300` | keep, unchanged |
| `:963` thump osc end | `150` | `150` | keep, unchanged |
| `:813` `IGN_OVER` | `0.55` | `0.55` | keep, unchanged |
| `:821` `IGN_CRACK` | `0.90` | `0.90` | keep, unchanged |
| `:832` `IGN_BODY_F0` | `720` | `720` | keep, unchanged |
| `:833` `IGN_BODY_F1` | `520` | `520` | keep, unchanged |
| `:834` `IGN_BODY_Q` | `0.90` | `0.90` | keep, unchanged |
| `:835` `IGN_BODY_G` | `2.10` | `2.10` | keep, unchanged |
| `:858` `src.buffer` | `noisePink` | `noisePink` | keep, unchanged |
| `:342` `CLIP_KNEE` | `0.68` | `0.68` | keep, unchanged |
| `:361`/`:362` limiter | `-3` / `4` | `-3` / `4` | keep, unchanged |
| `:351` `BED_TRIM` | `0.22` | `0.22` | keep, untouched by me |

## `game/audio.js:955  THUMP_PK = 0.00` - and the comment above it claims 0.48.

`THUMP_PK` multiplies EVERY gain node of the LF thump (`:966`, `:967`, `:968`). At `0.00` the
thump - the layer the wave-P and wave-Q verdicts both establish owns the first 20 ms of the
ignition - is **entirely silent**. This is not a nudge; it is a deleted layer.

It is also a rule-5 violation of the worst available kind. `:938-954` is a 17-line comment block
the killed agent wrote, headed "MEASURED, wave R, paired A,B,A,B with THUMP_PK the only variable",
stating "0.42 -> 0.48 moves the 0-20 ms frame +5.8 -> +6.8 dB" and citing a busy peak of 0.9278.
`:917` says "wave R put it back up to 0.48 (see below)". **The code below reads 0.00.** So the
tree carries prose asserting a shipped value of 0.48 over a literal of 0.00 - and 0.00 is a
plausible null-control value (the obvious "delete the thump and see what it was worth" test),
left mid-flight when the harness killed the agent at 884 s.

DECISION: **not inherited.** `0.00` is unmeasured-by-me, is not what any verdict implies, and is
the exact class the addendum says gets reverted. It goes to the value I measure and claim below.
The comment block's numbers are treated as UNVERIFIED CLAIMS and re-derived from scratch; where my
measurement disagrees with them the comment is corrected in place.

This is the second time an unmeasured inherited edit has shipped an invisible regression in
`audio.js` (STANDING-CONSTRAINTS 1j). Both times it was inaudible in screenshots and invisible to
`lint`.

NO OTHER abandoned edit found: no forced debug flag, no early return, no bypass, no commented-out
node in `:800-1000`, and the twelve other literals match wave Q to the digit.

---

# TARGETS, EACH AS A BAND, EACH SWEPT FOR ONE-SIDEDNESS AND FOR ALREADY-PASSING

From `wave-q/audio.md` §"TARGETS FOR THE NEXT ROUND" target 2 and target 3.

| # | target | band | one-sided? | does BEFORE already pass? |
|---|---|---|---|---|
| T1 | 0-20 ms over steady | **+6.0 .. +7.2 dB** (ref-01 +6.6 +/-0.6) | no, two-sided | measured below |
| T2 | 0-50 ms over steady | **+6.9 .. +8.1 dB** (ref-01 +7.5 +/-0.6) | no, two-sided | measured below |
| T3 | over20 level | **+7 .. +10 dB** | no | measured below |
| T4 | over20 time | **+30 .. +70 ms** (ref-01 +39) | two-sided as restated in wave Q | measured below |
| T5 | hold, 10 ms hop | **110 .. 220 ms** (ref-01 110 / ref-02 220) | no | measured below |
| T6 | busy peak | **< 1.0** | one-sided AND CORRECTLY SO - clipping limit | measured below |
| T7 | solo peak | **< 1.0** | one-sided, clipping limit | measured below |
| T8 | tilt 2k-8k re 300-800 | **-3 .. -7 dB** (ref-01 -5.7) | no | measured below |
| T9 | steady | **-20.0 dBFS** equality on our own bus | anchor, not a ref match | measured below |

Self-anchoring sweep: T1-T5 and T8 are all anchored on `reference/audio/boost-whoosh-01.mp3`
(ref-01 is the sole spectral anchor; ref-02 is a doppler swish-by and sets nothing per
STANDING-CONSTRAINTS 2d). None is anchored on one of our own previous legs. T6/T7 are physical
clipping limits and T9 is a mix-bus equality, which 1d explicitly exempts.

**The BEFORE state on disk (`THUMP_PK 0.00`) is expected to FAIL T1/T2 hard, so these targets are
not rubber stamps against the tree as inherited.** But the honest A-leg for judging the 0.42 -> 0.48
question is the wave-Q SHIPPED build (`THUMP_PK 0.42`), which is what wave Q measured and what the
comment claims to compare against. So I render THREE legs, not two:

- **leg A0** = the tree as inherited, `THUMP_PK 0.00`. Quantifies the damage of the abandoned edit.
- **leg A** = `THUMP_PK 0.42`, the wave-Q shipped build. The reference point for the claim.
- **leg B** = `THUMP_PK 0.48`, the proposed ship.

`THUMP_PK` at `:955` is the ONLY variable across all three. A,B,A,B interleaved per the wave-P
recovery protocol; both rounds must agree.

---

# MEASUREMENTS

Appended as taken. Probe named on every number.

## M0 - REFERENCE ANCHOR, re-derived from the mp3, not quoted from wave Q

PROBE: `IGN_REL=0.1 node tools/_ignmeas.mjs reference/audio/boost-whoosh-01.mp3`

```
onset 2.2462 s   steady rms 7.296e-3 (-42.7 dBFS)
0-20 ms   6.6 dB      0-50 ms   7.5 dB      over20   8.7 dB @ +39 ms
hold>=+3dB  HEADLINE(10ms hop, contiguous) 110 ms | 1ms-hop contiguous 68 ms | total 106 ms
absPeak  -24.1 dBFS
```

Reproduces `wave-q/audio.md` exactly (+6.6 / +7.5 / +8.7 @ +39 / 110 / 68). `IGN_REL=0.1` per
STANDING-CONSTRAINTS 2d - the absolute 1e-4 gate is VOID on the mp3 refs. So T1-T5's anchors are
independently confirmed before any of our own legs were rendered.

## M0b - REFERENCE BAND RATIOS, re-derived (context for the KNOWN COST of 0.48)

PROBE, per `wave-q/audio.md`'s exact args (2x 2-pole highpass + 2x 2-pole lowpass, `volumedetect`,
`-ac 1 -ar 48000`), onset 2.2462 s on ref-01:

| window | 100-300 | 300-800 | 2k-8k | derived ratio |
|---|---|---|---|---|
| onset, `-ss 2.2462 -t 0.25` | -53.8 | -47.2 | -52.9 | 100-300 re 300-800 = **-6.6**; 2k-8k re 300-800 = **-5.7** |
| steady, `-ss 3.5462 -t 0.4` | -58.4 | -55.2 | - | 100-300 re 300-800 = **-3.2** |

All three reproduce `wave-q/audio.md` to the decimal (-6.6 / -5.7 / -3.2), so the LF-skew anchor and
the tilt anchor are both independently re-derived from the mp3 before any of our legs.

## M0c - GAP 2 (`ours-crash-solo.wav` peak), re-confirmed still open on the A0 tree

PROBE: `node tools/_ignmeas.mjs shots/audio/ours-crash-solo.wav` on the crash-solo written by this
round's own `node tools/audio-isolate.mjs` run at 11:20 on the inherited tree -> `absPeak -0.4 dBFS`,
and a direct int16 max over the file gives peak **0.9980**. Fourth round at 0.9980. Not in my scope
this round (the fix is in the crash voice's own level, not the ignition), recorded so the count is
honest.

---

# M1 - THE ABANDONED EDIT IS NOT A SILENT REGRESSION. IT IS A THROW. E2E-REPRODUCED.

PROBE: `node tools/audio-isolate.mjs` on the inherited tree (`audio.js` md5
`193c8f6a6427a967e31d34dec629038b`), full stdout+stderr:

```
ours-crash-solo.wav  peak=0.9980  pre-event residual=9.27e-6 (must be ~0)
pageerror RangeError: Failed to execute 'exponentialRampToValueAtTime' on 'AudioParam':
  The float target value provided (0) should not be in the range (-1.40130e-45, 1.40130e-45).
page.evaluate: Target page, context or browser has been closed
  at render (tools/audio-isolate.mjs:45:15)
node tools/audio-isolate.mjs  14.17s user 1% cpu 19:33.44 total
```

MECHANISM, and it is exact. `game/audio.js:968` is
`tg.gain.exponentialRampToValueAtTime(lvl * THUMP_PK * THUMP_FLOOR, now + THUMP_DEC)`.
With `THUMP_PK = 0.00` the target is exactly `0`, and the Web Audio spec forbids a zero target on
`exponentialRampToValueAtTime`. So **every single boost ignition throws a RangeError from inside
`ignite()`**, at `:968`, before `:969`'s run-out and before `o.connect(tg); tg.connect(input)` at
`:970` ever execute. `:966` and `:967` are `linearRampToValueAtTime` and tolerate 0, which is why
the defect hides at exactly one of the four gain calls.

CONSEQUENCES, all reproduced above:
1. In the harness the throw happens inside the `off.suspend(t).then(...)` callback at
   `audio-isolate.mjs:70-74`, so `off.resume()` is never called and **the offline render deadlocks**.
   The crash clip (which does not call `ignite()`) completed normally in ~6 min; the boost clip then
   sat at **0% CPU for 19 minutes** before I killed it and node died with an uncaught exception.
   **`audio-isolate.mjs` cannot complete at all on the inherited tree.**
2. In the live game the throw propagates out of `ignite()` -> `set()` -> the per-frame audio update
   on every boost activation, and the thump's oscillator is never connected.

So the inherited state is not "the thump is quiet". It is "boost is broken and the audio measurement
harness hangs forever". A screenshot cannot see it, `node --check` cannot see it, and
`bash tools/lint.sh` prints **`lint ok`** on it - I ran it. This is the third distinct way this
project has been bitten by an unmeasured inherited edit and the first where the edit was fatal.

**This also fully explains why rounds 13 AND 14 produced no audio verdict.** Both rounds' audio
agents would have hit a 19-minute silent deadlock on their first `audio-isolate.mjs` call - which,
against session 14's 600 s `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`, is a guaranteed kill before any
measurement returned. Addendum §4 attributes the round-13/14 deaths to the wait ceiling alone; for
audio specifically the ceiling was the trigger and **the tree itself supplied the 19-minute stall.**
Whoever set `THUMP_PK = 0.00` was almost certainly killed while waiting on the very hang it caused.

---

# M2 - LEG A (`THUMP_PK 0.42`), the wave-Q shipped value. REPRODUCES WAVE Q EXACTLY.

`game/audio.js:955  THUMP_PK 0.00 -> 0.42`, the only edit. `audio.js` md5
**`028d10b5c4a4abcc7f857aacd8d9be57`**.

PROBE: `node tools/audio-isolate.mjs --only=boost` then
`node tools/_ignmeas.mjs shots/audio/ours-boost-solo.wav`

```
ours-boost-solo.wav  peak=0.7481  pre-event residual=3.48e-5 (must be ~0)
onset 0.0535 s   steady rms 1.002e-1 (-20.0 dBFS)
0-20 ms   5.8 dB     0-50 ms   6.2 dB     over20   7.8 dB @ +39 ms
hold>=+3dB  HEADLINE(10ms hop, contiguous) 150 ms | 1ms-hop contiguous 84 ms | total 213 ms
absPeak  -3.6 dBFS
```
`shots/audio/ours-boost-solo.wav` md5 `a9b26b5ec6febec0555e2544ab9866a2`.

Against `wave-q/audio.md`'s B table: onset 0.0535 / +5.8 / +6.2 / +7.8 @ +39 / 150 / 84 / peak
0.7481 / steady -20.0 dBFS. **Eight for eight, to the decimal.** Two things follow: the isolate
render is deterministic on this piece with the peer-md5 protocol dropped (three peers - `sky.js`,
`boost.js`, `road.js` - were being edited by other batch-1 builders during this render, and every
figure still lands), and `THUMP_PK` really is the ONLY thing the 08:36 agent moved, since restoring
that one literal restores all eight of wave Q's figures.

Also verified here: the `--only=boost` flag I added to `audio-isolate.mjs:41-48` is sound - it
reproduces wave Q's full-run figures exactly, at ~4 min instead of ~13.

## ALREADY-PASSING SWEEP, settled on real numbers

Leg A **FAILS T1 (+5.8 vs band +6.0..+7.2) and FAILS T2 (+6.2 vs band +6.9..+8.1)**, and passes
T3/T4 (+7.8 @ +39), T5 (150 ms), T7 (0.7481), T9 (-20.0 dBFS). So T1 and T2 are not rubber stamps
against either candidate BEFORE state: the inherited tree cannot even render, and the wave-Q shipped
build misses both by 0.2 and 0.7 dB. T3/T4/T5/T7/T9 are do-not-regress holds and are declared as
such, not claimed as wins.

## LINT, and it is a PEER's file, not mine

`bash tools/lint.sh` prints **`SYNTAX game/sky.js`** (`Unexpected identifier 'lutAt'` at
`game/sky.js:838`), not `lint ok`, because the concurrent wave-R sky builder has `sky.js` open
mid-edit. `game/audio.js` itself passes the same ESM-goal check `lint.sh` applies
(`cp game/audio.js $t/audio.mjs && node --check $t/audio.mjs` -> clean). I do not touch `sky.js`.
Re-checked immediately before commit; see the closing section.

## M2b - LEG A spectral + busy figures

PROBE (band args exactly as `wave-q/audio.md` §TARGETS, detected onset 0.0535 s, not hardcoded):
`ffmpeg -ss <t> -t <d> -i shots/audio/ours-boost-solo.wav -map 0:a -ac 1 -ar 48000 -af
"highpass=f=LO:poles=2,highpass=f=LO:poles=2,lowpass=f=HI:poles=2,lowpass=f=HI:poles=2,volumedetect"`

| window | 100-300 | 300-800 | 2k-8k | ratios |
|---|---|---|---|---|
| onset `-ss 0.0535 -t 0.25` | -19.4 | -21.9 | -27.7 | 100-300 re 300-800 **+2.5**; tilt 2k-8k **-5.8** |
| steady `-ss 1.3535 -t 0.4` | -28.7 | -29.0 | - | 100-300 re 300-800 **+0.3** |

PROBE: `node tools/_ignmeas.mjs --cent shots/audio/ours-boost-solo.wav 0 0.25 0.25 0.45`
-> `0-0.25s 1754 Hz | 0.25-0.45s 1731 Hz` (REPORTED DIAGNOSTIC, not scored - retired as a target).

PROBE: `node tools/audio-scene.mjs --only=busy` -> `ours-busy.wav peak=0.9279`
PROBE: `node tools/audio-scene.mjs --only=busy --noboost` -> `ours-busy-noboost.wav peak=0.9272`

All of +2.5 / -5.8 / +0.3 / 1754 / 1731 / 0.9279 / 0.9272 reproduce `wave-q/audio.md` to the decimal.
**Leg A is confirmed identical to the wave-Q shipped build on all fifteen figures I measured.**

---

# M3 - LEG B (`THUMP_PK 0.48`). THE CLAIM VERIFIES.

`game/audio.js:955  THUMP_PK 0.42 -> 0.48`, the only edit between M2 and M3. `audio.js` md5
**`b7f04678ec03573b6693b88f1e435c94`**.

PROBE: `node tools/audio-isolate.mjs --only=boost`; `node tools/_ignmeas.mjs shots/audio/ours-boost-solo.wav`

```
ours-boost-solo.wav  peak=0.7762  pre-event residual=2.31e-5 (must be ~0)
onset 0.0534 s   steady rms 1.002e-1 (-20.0 dBFS)
0-20 ms   6.8 dB     0-50 ms   7.1 dB     over20   8.5 dB @ +39 ms
hold>=+3dB  HEADLINE(10ms hop, contiguous) 170 ms | 1ms-hop contiguous 84 ms | total 217 ms
absPeak  -3.2 dBFS
```
`ours-boost-solo.wav` md5 `58c748896c60275241c31e8c4a00e58f`.

PROBE, bands (same ffmpeg form as M2b, detected onset 0.0534 s):

| window | 100-300 | 300-800 | 2k-8k | ratios |
|---|---|---|---|---|
| onset `-ss 0.0534 -t 0.25` | -18.8 | -21.7 | -27.8 | 100-300 re 300-800 **+2.9**; tilt **-6.1** |
| steady `-ss 1.3534 -t 0.4` | -28.7 | -29.0 | - | 100-300 re 300-800 **+0.3** |

PROBE: `node tools/_ignmeas.mjs --cent ... 0 0.25 0.25 0.45` -> **1714 Hz / 1730 Hz** (diagnostic).
PROBE: `node tools/audio-scene.mjs --only=busy` -> `ours-busy.wav peak=0.9279`
PROBE: `node tools/audio-scene.mjs --only=busy --noboost` -> `ours-busy-noboost.wav peak=0.9272`
PROBE, busy guard, CHANNEL-SPLIT per STANDING-CONSTRAINTS 2d: `ffmpeg ... channelsplit` then
`node tools/_ignmeas.mjs --lu <b>/L.wav <n>/L.wav 1.02 1.30`
-> **L +4.26 LU** (-12.29 re -16.55), **R +4.40 LU** (-12.36 re -16.76). Un-split mono on the same
pair reads **+3.75 LU**, a 0.51-0.65 LU understatement, so the channel-split rule is re-confirmed
live and the mono figure is NOT quoted as the guard.

## PAIRED A/B, LEG A -> LEG B, `THUMP_PK` THE ONLY VARIABLE

| metric | band | A (0.42) | **B (0.48)** | ref-01 | verdict |
|---|---|---|---|---|---|
| T1 0-20 ms | +6.0 .. +7.2 | +5.8 FAIL | **+6.8** | +6.6 | **HIT** |
| T2 0-50 ms | +6.9 .. +8.1 | +6.2 FAIL | **+7.1** | +7.5 | **HIT** |
| T3 over20 level | +7 .. +10 | +7.8 | **+8.5** | +8.7 | HIT (held) |
| T4 over20 time | +30 .. +70 ms | +39 | **+39** | +39 | HIT (held) |
| T5 hold 10 ms hop | 110 .. 220 ms | 150 | **170** | 110 | HIT (held) |
| T6 busy peak | < 1.0 | 0.9279 | **0.9279** | - | HIT, **unchanged to 4 dp** |
| T7 solo peak | < 1.0 | 0.7481 | **0.7762** | - | HIT, 22% under |
| T8 tilt 2k-8k | -3 .. -7 dB | -5.8 | **-6.1** | -5.7 | HIT (held) |
| T9 steady | -20.0 dBFS | -20.0 | **-20.0** | - | HIT (held) |
| guard L/R | >= +3 LU | +4.00/+4.15 | **+4.26/+4.40** | - | HIT (held, improved) |
| 1 ms-hop hold | diagnostic | 84 | **84** | 68 | unmoved |
| centroid 0-0.25 | diagnostic | 1754 | **1714** | 2151 | -40 Hz |
| centroid 0.25-0.45 | diagnostic | 1731 | **1730** | 1911 | unmoved |
| 100-300 re 300-800 | (next round's T) | +2.5 | **+2.9** | -6.6 | **COST: +0.4 dB the wrong way** |
| same, ignition-only | (next round's T) | +2.2 | **+2.6** | -3.4 | **COST: +0.4 dB the wrong way** |

**THE BRIEFED CLAIM HOLDS, in full and without qualification.** `THUMP_PK 0.42 -> 0.48` puts all
three onset figures inside a +/-0.6 dB band on ref-01 (+6.8 vs +6.6, +7.1 vs +7.5, +8.5 @ +39 vs
+8.7 @ +39), and the busy peak is **0.9279 in both legs, identical to four decimal places** - so the
"headroom-blocked / needs `BED_TRIM`" premise wave Q overturned is overturned again by direct
measurement, and **`BED_TRIM` (`:351`) was not touched: it reads `0.22` before and after.**
Nine of nine targets pass; two were failing before.

**AND THE COST IS REAL AND I AM NOT HIDING IT.** The 08:36 comment block's "KNOWN COST" claim of
"+2.5 to +2.9" is the one thing in it that my measurement CONFIRMS: `100-300 re 300-800` goes
+2.5 -> +2.9 at the onset and the ignition-attributable part goes +2.2 -> +2.6, both AWAY from
ref-01's -6.6 / -3.4. This is exactly the range-violation family the wave-P brief warns about: one
constant owns two axes. `THUMP_PK` is both the impact knob and the LF-skew knob, so the wave-Q
headline target (LF/mid balance) and the wave-Q target 2 (onset impact) pull opposite ways on it.
0.4 dB added to a 9.1 dB gap to close a 1.0/0.9 dB gap is the right trade at this ratio, but the next
round must move the skew by FREQUENCY (`:962-963`), not by level, or it will simply undo this.

---

# M4 - A,B,A,B INTERLEAVE. BOTH ROUNDS AGREE.

| leg | `audio.js` md5 | 0-20 | 0-50 | over20 | hold(10ms) | solo peak |
|---|---|---|---|---|---|---|
| A round 1 | `028d10b5c4a4abcc7f857aacd8d9be57` | +5.8 | +6.2 | +7.8 @ +39 | 150 | 0.7481 |
| B round 1 | `b7f04678ec03573b6693b88f1e435c94` | +6.8 | +7.1 | +8.5 @ +39 | 170 | 0.7762 |
| A round 2 | `028d10b5c4a4abcc7f857aacd8d9be57` | +5.8 | +6.2 | +7.8 @ +39 | 150 | 0.7481 |
| B round 2 | `b7f04678ec03573b6693b88f1e435c94` | +6.8 | +7.1 | +8.5 @ +39 | 170 | 0.7762 |

Both rounds agree on every figure to the decimal, so the pair is valid. Peer-md5 not run (dropped
for this piece), and three peers moved during the window with zero effect - which is the decoupling
claim from `wave-q/audio.md` holding up under test rather than being taken on trust.

**HONEST CAVEAT, and it corrects an assumption the harness invites.** The rendered WAVs are NOT
byte-identical between identical legs: A round 1 `a9b26b5ec6febec0555e2544ab9866a2` vs A round 2
`d009cd49f20be8e5938c8cc56d99765e`, and the isolate's own pre-event residual moves 3.48e-5 / 2.60e-5
/ 2.53e-5 / 2.48e-5 across the four runs. Every `_ignmeas` and band figure is nonetheless identical
to the last printed digit, so the noise is at the subtraction's LSB and not in the measured
quantities - the same shape as STANDING-CONSTRAINTS 1h's residual GPU tie-breaks. **Do not claim
byte-identity for `audio-isolate.mjs` output; claim metric-identity, which is what reproduces.**

---

# M5 - KILL-CONTROL ON THE NOMINATED NEXT GAP. THE OBJECT IS RIGHT, AND THE GAP IS HALF THE SIZE IT LOOKS.

Required by STANDING-CONSTRAINTS 1e before nominating anything. The nominated gap is the ignition's
LF/mid skew, mechanism claimed at `game/audio.js:962-963` (the thump's 300 -> 150 Hz sine sweep).
**Kill-control: is the thump actually the carrier?** One render, `THUMP_PK 0.48 -> 0.001` (0.001 and
not 0, because 0 throws - see M1), everything else the shipped tree.

PROBE: `node tools/audio-isolate.mjs --only=boost`, `node tools/_ignmeas.mjs`, same band ffmpeg.

| metric | B (`THUMP_PK 0.48`) | KILL (`0.001`) | ref-01 |
|---|---|---|---|
| 100-300 re 300-800, onset | +2.9 | **-0.1** | -6.6 |
| 100-300 re 300-800, steady | +0.3 | +0.3 | -3.2 |
| **ignition-attributable skew** | **+2.6** | **-0.4** | **-3.4** |
| 0-20 ms | +6.8 | -3.4 | +6.6 |
| 0-50 ms | +7.1 | -1.5 | +7.5 |
| over20 | +8.5 @ +39 ms | +5.0 @ +113 ms | +8.7 @ +39 ms |
| hold 10 ms hop | 170 ms | 0 ms | 110 ms |
| solo peak | 0.7762 | 0.7287 | - |

**RESULT: the gap survives its kill-control, but it is re-sized downward by half.** Deleting the
thump moves the ignition-attributable skew +2.6 -> -0.4 dB, so the thump carries **3.0 dB** of it and
is genuinely the dominant carrier - the nominated object is correct, unlike seven previous
nominations. **But ref-01 sits at -3.4, so even a thump removed ENTIRELY leaves 3.0 dB of the
6.0 dB ignition gap standing.** That residual 3.0 dB is an UNDER-FILL of 300-800 Hz by the crack
(`:858-878`) and the BODY layer (`:832-835`, `IGN_BODY_G 2.10`), not an excess in 100-300.
So: moving `:962-963` up in frequency can close at most half the gap, and any brief that hands the
whole 6.0 dB to the thump sweep is over-promising by 2x. Raise `IGN_BODY_G` / re-centre
`IGN_BODY_F0/F1` for the other half.

The control also re-confirms wave Q's mechanism claim hard, in the strongest form yet measured: with
the thump gone the 0-20 ms frame collapses +6.8 -> **-3.4 dB** and the contiguous hold goes 170 ->
**0 ms**, while over20's peak slides from +39 ms out to +113 ms. The LF thump does not merely
contribute to the first 20 ms; it IS the first 20 ms.

---

# M6 - PAIRED WITH THE EAR, not just the number

Blind-able crop, both sides identically processed, exactly the method `wave-q/audio.md` used:
`ffmpeg -ss <onset> -t 0.8 -i <f> -ac 1 -ar 44100 -af "loudnorm=I=-20:linear=true,lowpass=f=9000:poles=2,lowpass=f=9000:poles=2"`
then `-lavfi "atrim=0:0.35,showspectrumpic=s=760x420:mode=combined:scale=log:fscale=log:start=50:stop=9000"`.
Onsets 0.0534 s (ours, shipped B) / 2.2462 s (ref-01). Both PNGs looked at.

**The number and the eye agree, in BOTH directions, which is the point of doing this.**
- **The fix is visible.** Ours now opens on a bright vertical column at t=0 reaching to ~7 kHz - the
  broadband impact whose absence was the wave-Q critic's decider #2 ("the frame at 0.30 s looks as
  loud as the frame at 0.01 s"). It no longer does; the first frame is now the loudest.
- **The remaining defect is equally visible and it is the one the numbers say.** Ours' yellow mass
  tops out at ~300-400 Hz with a hard horizontal boundary and its brightest region sits BELOW 250 Hz.
  Ref-01's yellow runs from ~150 Hz to ~900 Hz, is brightest at 250-700 Hz, and goes DIMMER below
  150 Hz. That is +2.9 dB vs -6.6 dB drawn out. The seam wave Q identified is not closed and I am
  not claiming it is.

No broken-metric finding this round: every figure that moved moved in the direction the crop moved.

---

# WHAT I SHIPPED - BEFORE/AFTER LITERALS, `git diff`-checkable

Final `game/audio.js` md5 **`69f4c81ecaf1d3e52c6578accffedf00`**, mtime 11:45, rendered AFTER this
save (M6's crop and the confirming `_ignmeas` run below both post-date it).

| file:line | BEFORE (tree as inherited, 08:36) | AFTER | why |
|---|---|---|---|
| `game/audio.js:967` `THUMP_PK` | **`0.00`** | **`0.48`** | 0.00 throws on every ignition (M1); 0.48 verified on ref-01 (M3/M4) |
| `game/audio.js:933` comment | "peaking 0.7480" | "peaking 0.7481" | rule 5: measured 0.7481, four dp |
| `game/audio.js:943-946` comment | "0.7480 -> 0.7762", "0.9278 both", "ours-busy 0.9278" | "0.7481 -> 0.7762", "0.9279 both", "ours-busy 0.9279" | rule 5: my re-render reads 0.9279 / 0.9272 |
| `game/audio.js:955-966` | (absent) | +12 lines: the kill-control result, and a NEVER-SET-TO-ZERO hazard note naming the exponentialRamp throw and the 19-min deadlock | so this cannot happen a third time |
| `tools/audio-isolate.mjs:41-48` | `const CLIPS = ['crash','boost','squeal'];` | `--only=<clip>` filter + 6-line rationale | 4 min instead of 13 per paired leg; verified identical output (M2) |

NOT TOUCHED, re-grepped as the last action: `:351 BED_TRIM = 0.22`, `:813 IGN_OVER = 0.55`,
`:835 IGN_BODY_G = 2.10`, `:968 THUMP_STEP = 1.15`. `BED_TRIM` was explicitly out of scope and
explicitly not needed - proven by the busy peak sitting at 0.9279 in both legs.

`bash tools/lint.sh` -> **`lint ok`** (the transient `SYNTAX game/sky.js` seen during M2 was the
concurrent sky builder's in-flight file and cleared on its own; `audio.js` passed the ESM-goal check
at every step).

## TARGETS: 9 HIT, 0 MISSED, 2 OF THEM WERE FAILING BEFORE

T1 **+6.8** (band +6.0..+7.2, was +5.8 FAIL) HIT. T2 **+7.1** (band +6.9..+8.1, was +6.2 FAIL) HIT.
T3 **+8.5** / T4 **+39 ms** / T5 **170 ms** / T6 **0.9279** / T7 **0.7762** / T8 **-6.1** /
T9 **-20.0 dBFS**, all inside band, all held not regressed. Guard L **+4.26** / R **+4.40** LU.
Diagnostics, unscored: centroid 1714 / 1730 Hz; 1 ms-hop hold 84 ms.

## BRIEF CORRECTIONS

1. **The brief said "verification-and-ship, not an investigation." That was right about the claim
   and wrong about the file.** The one-line change verifies exactly as briefed, but the constant it
   was to be applied to was `0.00`, not `0.42`, and at `0.00` the piece does not render at all. Had
   I trusted the tree and edited 0.42 -> 0.48 by pattern match, the edit would have silently failed
   to apply and I would have reported wave Q's numbers as my own.
2. **Addendum §4's account of rounds 13/14 is incomplete for audio.** The 600 s wait ceiling was the
   killer, but audio's own tree supplied a 19-minute deadlock in the first tool call any audio agent
   makes. Fixing the ceiling alone would NOT have let round 15's audio agent finish.
3. `wave-q/audio.md` quotes the busy peak as 0.9279 and the comment block left in the tree quotes
   0.9278. Mine is **0.9279** with boost, **0.9272** without, twice. Wave Q is right.

## BIGGEST REMAINING GAP, WITH ITS KILL-CONTROL ALREADY RUN (M5)

**The ignition's LF/mid balance. `100-300 re 300-800` over 0-0.25 s from onset is +2.9 dB ours
against ref-01's -6.6 dB; ignition-attributable by paired steady-window control, +2.6 vs -3.4.**
Kill-control done, one render, `THUMP_PK 0.48 -> 0.001`: the skew goes +2.6 -> **-0.4**, so the thump
at `:962-963` carries **3.0 dB** and is the right object - **but the other 3.0 dB is 300-800 Hz
under-fill by the crack and BODY layers, so `:962-963` alone can close at most half.** Next round
should raise `:962-963` (300 -> 150 becomes something like 420 -> 260) AND lift `IGN_BODY_G` (`:835`,
2.10) / re-centre `IGN_BODY_F0/F1` (`:832`/`:833`), and must re-check T1/T2 after, because M3 proves
the thump's level and its frequency both land on the same +/-0.6 dB onset band. Band: **-4 to -9 dB**
with the steady-window control quoted beside it every time.

Second gap, fourth round open, not mine this round: `ours-crash-solo.wav` peak **0.9980 / -0.4 dBFS**
(M0c).
