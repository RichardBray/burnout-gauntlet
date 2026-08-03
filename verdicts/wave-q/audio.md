PIECE: audio   ROUND: q (critic)   FILE UNDER AUDIT: `game/audio.js` md5 `fd60efd46dd2ea2b87538ee99e99b520`
BUILDER REPORT AUDITED: `verdicts/wave-p/audio.md`
TREE STATE AT RETURN: md5 `fd60efd46dd2ea2b87538ee99e99b520` (byte-identical to the builder's final),
`lint ok`. All diagnostic edits I made were reverted from a byte-exact backup taken BEFORE the first
edit (`/tmp/audio.js.WAVEQ-BACKUP`, md5 verified equal on restore). `shots/audio/*` re-rendered from
the shipped tree as my last action.

# VERDICT: real wins

## THE BLIND CALL, AND WHAT IN THE CROP DECIDED IT — BEFORE ANY NUMBER

The mp3 references carry a 10 kHz codec brick wall that identifies them instantly, so the raw
0.8 s spectrogram pair is not a blind test. I re-cut the pair with BOTH sides lowpassed at 9 kHz and
cropped to 0-0.35 s from each onset — a genuinely blind-able pair — and looked at those first.

`ffmpeg -ss <onset> -t 0.8 -i <f> -ac 1 -ar 44100 -af loudnorm=I=-20:linear=true` then
`-af "lowpass=f=9000:poles=2,lowpass=f=9000:poles=2"` and
`-lavfi "atrim=0:0.35,showspectrumpic=s=760x420:mode=combined:scale=log:fscale=log:start=50:stop=9000"`.
Onsets 0.0535 s (ours, `shots/audio/ours-boost-solo.wav`) / 2.2462 s (`reference/audio/boost-whoosh-01.mp3`).

Two things decided it, both visible without the legend:

1. **Where the loud mass stops.** The reference's brightest (yellow) region runs from 70 Hz up to
   roughly 700 Hz and tapers smoothly into orange through 1.5 kHz. Ours is capped at about 300 Hz
   and has a visible HORIZONTAL SEAM at 300-400 Hz where yellow steps straight to orange. Ours is a
   low rumble with a lit shelf above it; the reference is one mass whose centre of gravity sits an
   octave higher.
2. **The onset column.** In the reference the first 20 ms is a bright vertical bar spanning 70 Hz to
   7 kHz — a broadband impact. In ours the first 20 ms is a bright LF blob below 300 Hz and nothing
   distinguishable above 400 Hz; the frame at 0.30 s looks as loud as the frame at 0.01 s.

I picked the reference as real on (1) alone and (2) confirmed it.

**Credit where due, and it is real:** the wave-O critic's specific complaint — a SCOOPED 250-600 Hz
hole and a bimodal "sine kick plus noise burst" read — is GONE. There is no dark band at 250-600 Hz
in the new crop. The builder's claim on that point is true and I verified it visually before
measuring anything. What replaced the hole is a continuous mass that is still bottom-weighted, which
is a different and smaller defect than the one it fixed.

## RULE 5 — CONSTANTS: **CLEAN**. MECHANISM NARRATIVE: **ONE FALSE CAUSAL CLAIM**, see below.

Every literal in the builder's before/after table re-grepped against the tree, line numbers included:

| claimed | grepped | status |
|---|---|---|
| `:858 src.buffer = noisePink` | `:858` literal `noisePink` | OK |
| `:830-833 IGN_BODY_F0 720 / F1 520 / Q 0.90 / G 2.10` | `:830 720`, `:831 520`, `:832 0.90`, `:833 2.10` | OK |
| `:880-906` BODY layer, ends at `IGN_DEC * 0.85` | block present `:880-906`, `:902/:903/:905` all read `IGN_DEC * 0.85` | OK |
| `:930 THUMP_PK = 0.42` | `:930` literal `0.42` | OK |
| `:931 THUMP_STEP = 1.15` | `:931` literal `1.15` | OK |
| `:937/:938` thump osc `300 -> 150` | `:937 setValueAtTime(300, now)`, `:938 exponentialRampToValueAtTime(150, now + 0.18)` | OK |
| UNCHANGED `IGN_OVER 0.55` `:813` | `:813` literal `0.55` | OK |
| UNCHANGED `IGN_CRACK 0.90` `:819` | `:819` literal `0.90` | OK |
| UNCHANGED `CLIP_KNEE 0.68` `:342` | `:342` literal `0.68` | OK |
| UNCHANGED limiter `-3` / ratio `4` `:361-362` | `:361 threshold.value = -3`, `:362 ratio.value = 4` | OK |

The lying comment reported at `:908` is fixed: the block now reads "Starts at 300 Hz and falls to
150" and the code reads 300/150. `:912` reads "720 -> 520 Hz" and matches `IGN_BODY_F0/F1`. The
recorded MEASURED NULL at `:815-818` (`IGN_CRACK 1.30` bought +0.3 dB and did not move the hold) is a
correctly-scoped negative-result comment, not a claim about the shipped state. No comment-only edit.

### DO ANY UNMEASURED EDITS FROM THE CRASHED INSTANCE REMAIN? **NO — and here is the proof.**

I reconstructed leg A myself, independently of the builder's description, by applying only the
inverse of the ten table rows above (pink -> white at `:858`, delete the `:880-906` block, `THUMP_PK`
0.42 -> 0.55, `THUMP_STEP` 1.15 -> 0.60, thump osc 300 -> 210 and 150 -> 96) and re-rendering.
**I spot-checked far more than the four required. All thirteen of the wave-O critic's published
figures reproduce to the decimal, including the mono `--lu` figure the wave-O critic only quoted in
passing:**

| wave-O published | my reconstructed A | |
|---|---|---|
| onset 0.0537 s | 0.0537 s | OK |
| 0-20 ms +5.6 dB | +5.6 dB | OK |
| 0-50 ms +6.8 dB | +6.8 dB | OK |
| over20 +7.6 dB @ +48 ms | +7.6 @ +48 ms | OK |
| hold 160 / 154 / 229 ms | 160 / 154 / 229 ms | OK |
| solo peak 0.8071 | 0.8071 | OK |
| crash-solo peak 0.9980 | 0.9980 | OK |
| busy peak 0.9255 | 0.9255 | OK |
| steady -20.0 dBFS | -20.0 dBFS (rms 1.003e-1) | OK |
| tilt 2k-8k re 300-800 = +2.4 dB | +2.4 dB (-22.5 re -24.9) | OK |
| tilt 800-2k re 300-800 = -0.3 dB | -0.3 dB (-25.2 re -24.9) | OK |
| centroid 3351 / 1898 Hz | 3351 / 1898 Hz | OK |
| busy guard L +4.85 / R +4.84 (mono 3.91) | L +4.85 / R +4.84 (mono 3.91) | OK |

Thirteen for thirteen, and the reconstruction was built from the diff table rather than from the
wave-O file, so this is a genuine identity check and not a fit. Note that deleting the BODY block
removes two `R()` draws from the seeded PRNG stream, which shifts every subsequent random value in
the render; the figures still land exactly. That is only possible if the reconstruction is
functionally the wave-O build. **A is accepted as faithful. No unexplained edit remains anywhere in
`audio.js` on any path these thirteen figures touch — which is every measured path in the piece.**

### THE ONE THING THAT IS FALSE: "the pink swap alone was a REGRESSION ... 160 ms to 0 ms"

This is the headline of the builder's "THE ACTUAL BUG I FIXED" section and it is also what
`STATE.md:55` now records as a project-level lesson ("pink took the contiguous hold 160 -> 0 ms").
**I could not reproduce it, and the true cause is a different constant.**

Paired control, three builds, everything else identical, `node tools/audio-isolate.mjs` then
`node tools/_ignmeas.mjs shots/audio/ours-boost-solo.wav`, `IGN_ENV=1` for the frame dump:

| build | 0-20 | 0-50 | over20 | hold 10 ms hop | env frames 0,1 | solo peak |
|---|---|---|---|---|---|---|
| A (wave-O: white, no body, PK 0.55, STEP 0.60) | +5.6 | +6.8 | +7.6 @ +48 | **160 ms** | - | 0.8071 |
| **pink + BODY, PK 0.55, STEP 0.60** | +3.9 | +6.0 | +9.0 @ +39 | **160 ms** | 3.5 / 4.2 | 0.7891 |
| pink + BODY, **PK 0.42**, STEP 0.60 | +2.2 | +4.3 | +7.4 @ +38 | **0 ms** | **2.0 / 2.4** | 0.7335 |
| B (shipped: pink + BODY, PK 0.42, STEP 1.15) | +5.8 | +6.2 | +7.8 @ +39 | 150 ms | - | 0.7481 |

**The pink swap plus the BODY layer, with the thump untouched, holds 160 ms. The collapse to 0 ms
requires `THUMP_PK 0.55 -> 0.42`.** So the regression is real and the "invisible to every headline
metric except the hold" observation is real (over20 sits at +7.4 while the hold is 0) — but it was
caused by a level cut the wave-P work itself made to the thump, not by the source-colour swap, and
`THUMP_STEP 0.60 -> 1.15` is a compensation for that cut rather than a fix to a latent defect.

The builder's row-2 numbers (env 1.9/2.1, over20 +7.6) differ from my row-3 by 0.1-0.2 dB, which
means the crashed instance's tree also carried `IGN_BODY_G 2.60` / `IGN_BODY_F1 450` (the builder
mentions retuning both). That does not change the conclusion: I varied only `THUMP_PK` between rows
2 and 3 and the hold went 160 -> 0.

The builder's *mechanism* claim — that the LF thump, not either noise layer, sets the first 20 ms,
and that `THUMP_STEP` is the hold knob — is CORRECT and I confirmed both directions of it. Only the
attribution to pink is wrong. **`STATE.md:55` should be corrected: "`THUMP_PK 0.55 -> 0.42` took the
contiguous hold 160 -> 0 ms while `over20` stayed at +7.4, so no headline metric saw it."** The
transferable lesson survives intact and is arguably sharper: a level cut on the layer that owns the
first two frames is invisible to a peak-seeking metric.

## MY OWN B REPRODUCTION — every shipped figure, independently re-rendered

`node tools/audio-isolate.mjs`, `node tools/audio-scene.mjs --only=busy`, `--noboost`, on the tree as
delivered. Scene: audio-isolate `boost` stem / audio-scene `busy`. Level: default. No camera.

| metric | builder B | mine | ref-01 |
|---|---|---|---|
| onset | 0.0535 | 0.0535 | 2.2462 |
| tilt 2k-8k re 300-800, 0-0.25 s | -5.8 | **-5.8** (-27.7 re -21.9) | -5.7 |
| tilt 800-2k re 300-800 | -4.3 | **-4.3** | -3.3 |
| tilt 8k-15k re 300-800 | -24.3 | **-24.3** | -26.9 (codec) |
| centroid 0-0.25 / 0.25-0.45 | 1754 / 1731 | **1754 / 1731** | 2151 / 1911 |
| 0-20 ms | +5.8 | **+5.8** | +6.6 |
| 0-50 ms | +6.2 | **+6.2** | +7.5 |
| over20 | +7.8 @ +39 | **+7.8 @ +39** | +8.7 @ +39 |
| hold, 10 ms hop contiguous | 150 ms | **150 ms** | 110 ms |
| hold, 1 ms hop contiguous | 84 ms | **84 ms** | 68 ms |
| steady | -20.0 dBFS | **-20.0 dBFS** | - |
| solo peak / crash-solo / busy peak | 0.7481 / 0.9980 / 0.9279 | **0.7481 / 0.9980 / 0.9279** | - |
| busy guard channel-split | L +4.00 / R +4.15 | **L +4.00 / R +4.15** (mono 3.40) | - |

Everything reproduces. **The spectral-tilt headline is CONFIRMED HIT and it is a real win** — 8.1 dB
of error closed to 0.1 dB, with the spectrogram moving in the same direction as the number.

Sustained-overshoot definition, quoted unchanged: contiguous run from the DETECTED onset,
non-overlapping 10 ms rms frames, >= +3 dB over steady rms (onset+1.3-1.7 s), 400 ms cap, stop at the
first frame below. Hop matters as much as contiguity. Never quote total. `IGN_REL=0.1` on all mp3
references; the absolute 1e-4 gate on the refs stays VOID.

## THE TWO NULL TOOL AUDITS — BOTH CONFIRMED, DO NOT RE-RUN

**Control 1 — `audio-isolate.mjs` subtraction is linear-valid. CONFIRMED, CLEARED, KEEP IT.**
I re-ran it on the SHIPPED tree (the builder ran it on his pre-fix tree, which is why his quoted
numbers are 2.3/4.3/7.5/hold 0 — those are the PK 0.42 / STEP 0.60 build's numbers, not the shipped
build's; his conclusion is right but his figures are from the wrong leg, so re-anchor to mine).
`CLIP_KNEE 0.68 -> 0.99`, `limiter.threshold -3 -> 0`, `limiter.ratio 4 -> 1`, nothing else touched:
0-20 **+5.8**, 0-50 **+6.2**, over20 **+7.8 @ +39**, hold **150 ms** — identical to the un-bypassed
shipped run on all four, to 0.0 dB. All three diagnostic constants reverted and re-grepped (`:342`
0.68, `:361` -3, `:362` 4).

**Control 2 — the "halve `IGN_OVER`" linearity test is CONFOUNDED. CONFIRMED, DO NOT QUOTE IT.**
I did not re-run it and nobody should. The difference signal contains the sustained boost voice
(`out.gain` 0 -> 1, tc 0.02, then decaying to SUSTAIN with tc 0.34) and the engine sidechain duck,
neither of which scales with `IGN_OVER`, so the apparent 1.4 dB deficit is a FLOOR imposed by the
residual, not evidence of compression. Control 1 settles the question and is the one to cite.

## MY BUDGETED TOOL AUDIT: **the tilt target is blind to the defect the eye now sees, and I have its replacement with a paired control**

The seam at 300-400 Hz in the crop is not captured by anything currently measured, and the reason is
structural: **the tilt metric uses 300-800 Hz as its DENOMINATOR.** Under-filling 300-800 pushes the
2k-8k tilt MORE NEGATIVE, i.e. it scores as MORE reference-like. The metric that just passed at 0.1 dB
rewards the remaining defect.

Measured, same command family as the tilt, 0.25 s from onset:

| band ratio, 0-0.25 s from onset | ours (B) | ref-01 | gap |
|---|---|---|---|
| **100-300 re 300-800** | **+2.5 dB** (-19.4 / -21.9) | **-6.6 dB** (-53.8 / -47.2) | **9.1 dB** |

That is LARGER than the 8.1 dB tilt gap that was this round's headline, and no existing target can
see it. It is also exactly what the crop shows.

**Paired control — is it the ignition or the bed?** Same bands over the STEADY window
(`-ss onset+1.3 -t 0.4`), which contains the bed and the sustained voice but no ignition:

| 100-300 re 300-800 | onset window | steady window | ignition's own contribution |
|---|---|---|---|
| ours | +2.5 | +0.3 | **+2.2 dB** |
| ref-01 | -6.6 | -3.2 | **-3.4 dB** |

The bed accounts for 3.5 dB of the 9.1; **the ignition transient itself contributes 5.6 dB of
relative LF skew that the reference's ignition does not.** Ignition-attributable, controlled,
and orthogonal to every metric now in use. This is my proposed new target and it is target 1 below.

**Second audit finding, free: `audio.js` has ZERO imports, and `audio-isolate.mjs:46` /
`audio-scene.mjs:64` load `/audio.js` and nothing else.** The audio piece is structurally incapable
of cross-piece coupling. The builder's per-render `md5 game/*.js | grep -v audio.js` "PEERS STABLE"
protocol is theatre for this piece — three peers (`boost.js`, `sky.js`, `crash.js`) were edited by
other agents DURING my renders and every figure still reproduced to the decimal. Audio rounds can be
scheduled concurrently with any other piece. Drop the peer-md5 ritual from the audio brief; keep the
`audio.js` md5.

## RULING ON THE PROPOSED BAND RESTATEMENT

First, a correction to the brief I was handed: the builder's restatement is for **target 2, the
0-0.25 s centroid** (ref-01 2151 Hz), not the 0.25-0.45 s one. I rule on both.

**RULING: the PRINCIPLE is ACCEPTED — `<= 2500` is a defective one-sided target and must not be
re-issued. The PROPOSED NUMBERS `1900-2400` are REJECTED, and the target is RETIRED as an
independent target and demoted to a reported diagnostic.**

Reasoning, with the measurement that settles it. The centroid and the tilt are not two targets; they
are one degree of freedom measured twice. Across three builds I rendered this round —
A (+2.4 tilt / 3351 Hz), B (-5.8 / 1754 Hz), and the `THUMP_PK 0.55` variant (-6.5 / 1669 Hz) — the
relationship is **195 Hz of centroid per dB of tilt**, essentially linear. The tilt target's accepted
tolerance is -3..-7, i.e. **±2 dB around ref-01's -5.7**, which is **±390 Hz** of centroid. The
reference-consistent band is therefore **2151 ± 390 = 1761-2541 Hz**.

The builder's proposed 1900-2400 is **±250 Hz, 1.6x TIGHTER than the tilt tolerance it proxies for**,
which makes the centroid the binding constraint on a quantity the tilt already governs — and the two
then contradict each other. They already do: the shipped build passes the tilt with 0.1 dB of error
and would fail 1900-2400 by 146 Hz. A target that fails a build the target it duplicates calls
perfect is not a tightening, it is a second opinion with no standing. Against the correctly-derived
1761-2541 the shipped build scores 1754, a **marginal fail by 7 Hz** — which is the honest score, and
is worth exactly as much as the tilt's "hit by 0.1 dB" says it is: nothing new.

The builder's underlying observation is correct and important and I am keeping it — we DID overshoot
397 Hz past the reference and a ceiling scored that as clean. The right response is not a tighter
duplicate; it is to retire the duplicate and target the axis the tilt CANNOT see, which is the
100-300 re 300-800 ratio above.

**Second one-sided defect, not caught by the builder, in the same family.** Target 3's
`0.25-0.45 s centroid 1898` is anchored to **OUR OWN leg-A value**, with ref-01's 1911 quoted only in
parentheses. That is worse than one-sided: it pins the build to its own history. Restated against the
reference with the same ±390 Hz: **1521-2301 Hz**. Our 1731 **PASSES**. The builder scored itself
MISSED (-167 Hz / -8.7%, called "honest") against a mis-specified self-anchor. **That miss is
withdrawn — it was never a miss.** The builder's diagnosis that the window is structurally owned by
the crack and unmoved by body-layer tuning (1733 -> 1731 across a joint `IGN_BODY_G` / `F1` change)
stands and is a good null; it just was not failing anything.

**Sweep of the remaining targets for the same defect:**
- Target 1, tilt -3..-7: two-sided, reference-centred. **KEEP AS IS.** It is the one target that
  caught the overshoot correctly and it earned the builder's trust in it.
- hold 110-220 ms: two-sided, and the edges are the two references' own values (ref-01 110,
  ref-02 220). Legitimate. **KEEP.**
- over20 `+7..+10 dB at >= +30 ms`: the LEVEL half is two-sided and fine; **the TIME half `>= +30 ms`
  is one-sided and would score a +350 ms peak as a clean pass.** Low risk today (ours +39, ref-01
  +39) but it is the same defect. Restate as **+30..+70 ms** — ref-01 is +39; ref-02's +123 belongs to
  a doppler swish-by, not an ignition, and should not widen this.
- solo peak < 1.0, busy peak < 1.0: these are genuine CLIPPING limits, not reference values.
  One-sided is correct. **KEEP.**
- busy guard `>= +3 LU`: an audibility floor, one-sided is correct in kind. **KEEP.**
- steady -20.0 dBFS: an equality anchor on our own mix bus, not a reference match. Fine.

**Also, do not let ref-02 near the centroid targets.** `IGN_REL=0.1 node tools/_ignmeas.mjs --cent
reference/audio/boost-whoosh-02.mp3 0 0.25 0.25 0.45` returns **219 Hz / 245 Hz** — it is a sci-fi
doppler swish an octave and a half below ref-01, and averaging the two references would produce a
meaningless band. **ref-01 is the sole anchor for every spectral target on this piece.** Say so
explicitly in the next brief.

## BIGGEST REMAINING GAP

**`game/audio.js:937-938` — the thump oscillator's 300 -> 150 Hz sweep is the only high-weight
ignition layer below 500 Hz, so the ignition's energy centre sits an octave under the reference's:
100-300 re 300-800 is +2.5 dB ours against ref-01's -6.6 dB, a 9.1 dB gap of which 5.6 dB is
ignition-attributable by paired steady-window control.** The crack sweeps 2700 -> 800 and the BODY
sweeps 720 -> 520 at `IGN_BODY_G 2.10` (`:833`); between them nothing carries weight in 300-800 Hz
while the sine parks in 100-300. This is the horizontal seam at 300-400 Hz in the crop, it is the
reason the reference still wins the blind call, and no current target can see it because the tilt
metric uses 300-800 as its denominator and is REWARDED by the deficiency.

Second gap, unchanged and confirmed still open for a third round: `ours-crash-solo.wav` peak
**0.9980 / -0.4 dBFS**, byte-identical across every build I rendered.

## THE NOMINATED "CROSS-PIECE" GAP IS **NOT CROSS-PIECE**. THE HEADROOM ARGUMENT IS WRONG.

The builder nominated the onset-impact gap (0-20 +5.8 vs ref +6.6, 0-50 +6.2 vs +7.5) as blocked by
headroom, requiring either `BED_TRIM` (an orchestrator-owned mix decision) or a time-domain trade
against the hold. **I was asked to decide which, quantify both, and say who owns it. The answer is
neither, and the audio builder owns it, because there is a third option that costs nothing and the
builder already had his hand on it.**

The headroom argument substitutes the BUSY MIX PEAK for THE IGNITION'S CONTRIBUTION TO IT. Those are
different objects. The builder's own two numbers disprove his premise and he did not notice:
`ours-busy.wav` peaks **0.9279** and `ours-busy-noboost.wav` peaks **0.9272**. **The entire boost
layer — ignition included — moves the busy peak by 0.0007, i.e. 0.007 dB.** The busy peak is set by
the engine/crash bed, not by the ignition. There is no 0.6 dB ceiling on the ignition because the
ignition is not the thing touching the ceiling.

Measured, not argued. Three builds, `THUMP_PK` (`:930`) the ONLY variable, `THUMP_STEP` held at the
builder's own 1.15, everything else the shipped tree:

| `THUMP_PK` | 0-20 | 0-50 | over20 | hold | solo peak | **busy peak** | cent 0-0.25 | tilt 2k-8k |
|---|---|---|---|---|---|---|---|---|
| 0.42 (shipped) | +5.8 | +6.2 | +7.8 @ +39 | 150 ms | 0.7481 | **0.9279** | 1754 | -5.8 |
| **0.48** | **+6.8** | **+7.1** | **+8.5 @ +39** | 170 ms | 0.7762 | - | 1714 | - |
| 0.55 | +7.9 | +8.1 | +9.2 @ +39 | 170 ms | 0.8084 | **0.9279** | 1669 | -6.5 |
| **ref-01** | **+6.6** | **+7.5** | **+8.7 @ +39** | 110 ms | - | - | 2151 | -5.7 |

`THUMP_PK 0.48` lands 0-20 at +6.8 against the reference's +6.6, 0-50 at +7.1 against +7.5 and over20
at +8.5 @ +39 against +8.7 @ +39 — the nominated 1.9 dB gap essentially closed by one constant, with
the hold at 170 ms (inside 110-220) and the solo peak at 0.7762. **`THUMP_PK 0.55` overshoots the
reference on onset impact and STILL leaves the busy peak at 0.9279, unchanged to four decimals.**

Cost of each option, as asked:
- **`BED_TRIM 0.22` (`:349`/`:351`), orchestrator-owned:** cost is a re-baseline of every stem and
  every other piece's mix balance, plus the reverb return which is scaled by it (`:386`) and
  `busFx`'s send which is divided by it (`:1282`). **Not needed. Do not spend it.**
- **Time-domain trade against `IGN_BLOOM` / `IGN_HOLD`:** cost is the contiguous hold, which is a
  do-not-regress target and was just repaired. **Not needed. Do not spend it.**
- **`THUMP_PK 0.42 -> ~0.48` (`:930`), audio-builder-owned:** cost is 0.0000 on the busy peak,
  +0.0281 on the solo peak (0.7481 -> 0.7762, still 22% under 1.0), -40 Hz of 0-0.25 centroid, and
  +20 ms of hold (150 -> 170, inside the band). **This is the move.**

**OWNER: the audio builder. It does not go to the orchestrator and it does not need `BED_TRIM`.**
Note the shape of the error for the record: this is the "substitutes a term's ceiling instead of
identity" bug again — a limit was attributed to the ignition on the strength of a peak the ignition
does not set.

## TARGETS FOR THE NEXT ROUND

All spectral bands use, with `LO`/`HI` substituted and each band quoted RELATIVE to that file's own
300-800 Hz reading:
`ffmpeg -ss <onset> -t 0.25 -i <f> -map 0:a -ac 1 -ar 48000 -af
"highpass=f=LO:poles=2,highpass=f=LO:poles=2,lowpass=f=HI:poles=2,lowpass=f=HI:poles=2,volumedetect"`
Onsets: **2.2462 s** for `reference/audio/boost-whoosh-01.mp3`, and the DETECTED onset for ours
(0.0535 s on the current build — re-detect it, do not hardcode). Renders:
`node tools/audio-isolate.mjs`; `node tools/audio-scene.mjs --only=busy`; `--noboost`.
ref-01 is the SOLE spectral anchor; ref-02 is a doppler swish-by and sets no spectral target.

**1. NEW HEADLINE — LF/mid balance. `100-300 re 300-800`, 0-0.25 s from onset: BAND -4 to -9 dB.**
Ours +2.5, ref-01 -6.6. Band is ref ± the same ±2 dB the tilt target uses, since it is the same
family of measurement. **Report the paired steady-window control alongside it every time**
(`-ss onset+1.3 -t 0.4`, same bands): the ignition's own contribution is
`onset-window ratio − steady-window ratio` and must move from ours +2.2 toward ref-01's -3.4.
Quoting the onset window alone lets a bed change score as an ignition fix.
Mechanism to move it lives at `:937-938` (thump sweep endpoints) and `:830-833` (BODY centre and
gain), not in `IGN_OVER`.

**2. Onset impact — BAND, both halves. 0-20 ms: +6.0 to +7.2 dB. 0-50 ms: +6.9 to +8.1 dB.**
Ref-01 +6.6 / +7.5, band ±0.6 either side. Ours +5.8 / +6.2. `node tools/_ignmeas.mjs
shots/audio/ours-boost-solo.wav`. **Do not raise `IGN_OVER` and do not touch `BED_TRIM`** — the
measured lever is `THUMP_PK` at `:930`, ~0.48, and it costs nothing on the busy peak (proven above).
State the busy peak with and without boost when you claim any headroom constraint.

**3. Do-not-regress, all bands, all two-sided unless a clipping limit:**
- tilt 2k-8k re 300-800, 0-0.25 s: **-3 to -7 dB** (now -5.8, ref -5.7). KEEP AS IS.
- hold, 10 ms hop contiguous: **110-220 ms** (now 150). Quote the 1 ms hop figure too (now 84,
  ref 68) but do not target it.
- over20: **+7 to +10 dB at +30 to +70 ms** — the time half is now two-sided (was `>= +30 ms`).
  Now +7.8 @ +39; ref-01 +8.7 @ +39.
- steady **-20.0 dBFS**; solo peak **< 1.0** (now 0.7481); busy peak **< 1.0** (now 0.9279). The two
  peaks are clipping limits and one-sided is correct.
- busy guard **>= +3 LU** at 1.02-1.30 s, **CHANNEL-SPLIT, NEVER MONO** (now L +4.00 / R +4.15; mono
  reads 3.40 on this build, a 0.68 LU understatement). Exact args:
  `ffmpeg -i shots/audio/ours-busy.wav -filter_complex "channelsplit=channel_layout=stereo[l][r]"
  -map "[l]" L.wav -map "[r]" R.wav` (same for `ours-busy-noboost.wav`) then
  `node tools/_ignmeas.mjs --lu <busy>/L.wav <noboost>/L.wav 1.02 1.30` per channel.

**4. `--cent 0 0.25` is now a REPORTED DIAGNOSTIC, NOT A TARGET.** Print it (now 1754, ref-01 2151)
and print `0.25-0.45` (now 1731, ref-01 1911) so the trend stays visible, but score neither. The
tilt target governs this degree of freedom at 195 Hz/dB and a second target on the same axis with a
different tolerance can only manufacture contradictions.

**5. Fix `_ignmeas.mjs --lu` in the tool: K-weight per channel and SUM the mean squares, per
BS.1770, instead of averaging L+R in `readWavMono` (`_ignmeas.mjs:28-41`).** The channel-split
workaround is load-bearing and undocumented at the call site; the next builder who forgets it will
under-report the guard by ~0.7-1.0 LU and may "fix" a passing test. Paired control for the fix:
the repaired `--lu` run on the un-split stereo files must return L/R-consistent values, i.e. within
0.1 LU of the channel-split figures (+4.00 / +4.15) rather than 3.40.

**6. Still open, third round running: `ours-crash-solo.wav` peak 0.9980 / -0.4 dBFS.**

## RETIRED / RESTATED / CORRECTED THIS ROUND

- **RETIRED: `--cent 0 0.25 <= 2500 Hz` as a target** (one-sided; scored a 397 Hz overshoot past the
  reference as a clean pass). **The proposed replacement band 1900-2400 is ALSO REJECTED** — it is
  1.6x tighter than the tilt tolerance it duplicates and contradicts it on the shipped build. The
  centroid becomes a reported diagnostic. Derivation on file: 195 Hz per dB of tilt across three
  measured builds; the reference-consistent band would be 1761-2541 and adds nothing the tilt
  does not already say.
- **RETIRED: `0.25-0.45 s centroid = 1898`** — anchored to our own leg-A value, not to the reference.
  **The builder's self-scored MISS on it is WITHDRAWN**; against ref-01's 1911 ± 390 the shipped 1731
  passes. Also demoted to a diagnostic.
- **RESTATED: over20's time half, `>= +30 ms` -> `+30 to +70 ms`** (one-sided; ref-01 is +39).
- **CORRECTED: "the pink swap took the contiguous hold 160 -> 0 ms" is FALSE**, in
  `verdicts/wave-p/audio.md` and in `STATE.md:55`. Pink + BODY with the thump untouched holds 160 ms;
  the cause is `THUMP_PK 0.55 -> 0.42`, measured. The mechanism (the LF thump owns the first 20 ms;
  `THUMP_STEP` is the hold knob) is confirmed correct.
- **CORRECTED: the nominated next gap is NOT cross-piece and NOT headroom-blocked.** The busy peak
  is 0.9279 with boost and 0.9272 without — the ignition contributes 0.007 dB to it. `THUMP_PK 0.48`
  closes the gap at zero peak cost. `BED_TRIM` is not required and the orchestrator is not involved.
- **CORRECTED: control 1's published figures were measured on the pre-fix leg, not the shipped one.**
  Conclusion unaffected and `audio-isolate.mjs` stays CLEARED; re-anchor to +5.8 / +6.2 / +7.8 @ +39 /
  150 ms.
- **NEW, RECORDED: `audio.js` has zero imports and the audio harnesses load it alone.** The piece is
  structurally decoupled from every peer. Drop the peer-md5 protocol from the audio brief.
- **CONFIRMED, do not re-run:** control 1 (clip+limiter bypass) is NULL, subtraction linear-valid;
  control 2 (halve `IGN_OVER`) is CONFOUNDED by the sustained voice and the sidechain duck and must
  never be quoted as evidence of compression.
- **UNCHANGED AND RE-AFFIRMED:** the 1e-4 onset gate stays VOID on the mp3 references, use
  `IGN_REL=0.1`. `--lu` stays channel-split-only until the tool is fixed. The 8-15 kHz band on the
  refs sets no target (96 kbps lowpass). Analyse `ours-squeal.wav`, never `-solo`.
