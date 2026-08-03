# WAVE O CRITIC — ADDENDUM. Read this AFTER `tools/WAVE-K-BRIEF.md`. You are ROUND o1.

## Rule 5 — DO NOT TRUST A DOCSTRING, AND DO NOT TRUST A BUILDER REPORT

The Wave L crash.js builder rewrote its comments and changed ZERO constants, then reported a
win. An intermediate screenshot proved it had the fix working and reverted it before saving.
It cost a full critic round to detect, and only a live-scene probe caught it.

So, binding on you:
- **Grep the constants your builder claims it changed and confirm the literal values.** Its
  report quotes BEFORE -> AFTER with file:line precisely so you can check it in one command.
- A comment is not evidence. A builder's screenshot is not evidence. Render it yourself.
- If a claim reproduces, say so explicitly. If it does not, that is your headline finding.

## Wave N was unusually honest — several builders DISPROVED their own briefs

Five Wave N briefs named the wrong mechanism and the builder proved it with a live override
rather than following instructions. Treat that as the standard, not as insubordination. If your
builder says your predecessor was wrong, **check its disproof before you re-issue the target.**

## MEASUREMENT TOOLS THAT ARE NOW KNOWN-BROKEN. Do not quote them naively.

1. `_facademeas` band sat measures the BLUE AIRLIGHT CAST, not paint. The whole palette lever is
   worth +0.046 against a 0.48 target. The environment sat target is RETIRED.
2. `_hudlick` inverts: its threshold is 134 above the bar vs 123 below. A control feeding the
   bottom rail the top rail's noise verbatim still measured inverted. Compensate per rail.
3. `tools/damage-shot.mjs:33` hardcodes a 1600x1000 viewport and SILENTLY IGNORES `--w/--h`.
   Every absolute-px claim through it is void. Fractional regions are still fine.
4. `_debrismeas` `aspMed` is decoupled on spark patches (scores WORSE with sparks hidden — it is
   measuring debris). Use `aspP90`. Its blob-size branch silently drops blobs over `--maxpx`, so
   the statistic IMPROVES as sparks get worse. Bare `aniso` in boost patch 1 is likewise retired.
5. The 1e-4 audio onset gate cannot be used on the mp3 refs — codec noise puts ref-01's onset at
   0.0001 s and returns a bogus -28.9 dB overshoot. Use `IGN_REL=0.1`.

**If you find a sixth, that finding is worth more than your verdict.** Seven have now been found.

## TWO TARGETS ARE PROVEN UNREACHABLE. Re-issuing either is a wasted wave.

- damage `p01/p50 <= 0.30` is mutually exclusive with guardrail 3: the authored lifted-black
  grade floors the panel p01 at ~25, so it needs p50 >= 85 against a max of ~46.
- sky ref-01's 22x red ramp over 20 deg elevation is a PAINTED 2008 DOME, not an atmosphere. No
  single-scattering profile beats 1/sin(e) = 3.3x; ours is 5.3x and our 21 deg row already
  matches ref to within 5/255. A form exists that hits all six targets and it is a LIE (a 100 m
  shell the 40-step march cannot resolve, laying a 136-level hard step across the dome). The
  builder rejected it correctly. **Do not reinstate it.**

## Write your brief to `verdicts/wave-o/<piece>.md` BEFORE returning it. Non-negotiable.
