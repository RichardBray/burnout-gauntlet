# WAVE R ADDENDUM — binding on every wave-R builder, on top of `tools/WAVE-P-BRIEF.md`

Read `tools/WAVE-P-BRIEF.md` first. It is complete and still binding. This file only adds what is
new in wave R, and it exists because round 13 failed in a way that cost a whole round.

## 0. STEP ZERO, BEFORE YOU PLAN ANYTHING — audit round 13's abandoned edits in YOUR file.

Round 13 launched this same batch and the harness killed all five agents mid-flight at 884s.
Four builders and one resolver had already written edits to disk. **Nobody wrote a verdict, so
there is no record of what any of those edits was trying to do.**
Files carrying abandoned round-13 edits: `game/boost.js`, `game/crash.js`, `game/audio.js`,
`game/sky.js`, `game/road.js`, and `tools/_sparkboost.mjs`, `tools/_idealblur.mjs`,
`tools/_stripemeas.mjs`, `tools/STANDING-CONSTRAINTS.md`.

For the file you own:

1. `git log --oneline` — commit `e1c1e82` is the tree exactly as round 13 left it. It is a
   BASELINE, not a known-good state. There is no earlier commit, so you cannot diff the abandoned
   edits away. You have to read for them.
2. Read your file's region of interest and look for edits that are half-finished, unmeasured, or
   obviously temporary: a debug uniform left forced, a bypass or early-return added for
   measurement, a constant nudged with no comment, a comment describing a change the code does not
   make (rule 5, and round 13 is exactly the condition that produces it).
3. Decide per edit, and **record the decision in your verdict with `file:line` and the literal
   value**: either (a) it is sound, you have measured it, and you keep it and claim it — or (b)
   you revert it to what the surrounding code and the wave-Q verdict imply, and say so.
   **An unmeasured edit you cannot justify gets reverted. Do not inherit it silently.**
4. `tools/STANDING-CONSTRAINTS.md` carries a large wave-R resolver amendment that IS sound and
   should be trusted — it is a `_px.mjs`/`_hudedge.mjs` `sat`-vs-`satPx` audit. Its companion
   `verdicts/wave-r/resolver.md` was never written by the killed resolver; session 15 RECONSTRUCTED
   it from the amendment (commit `b4b4794`) and it is labelled as a reconstruction on line 1.
   **Where the reconstruction and the amendment disagree, the amendment wins** — it is the record.

## 1. GIT NOW EXISTS. Use it, and it changes what your verdict has to prove.

The project was untracked for thirteen rounds. It is now a git repo.

- **Commit your own work when you land it**, one commit per builder, message
  `wave-r/<piece>: <one line>`. Do not commit other builders' files — you will collide.
  Do not `git add -A`; add only the files you own.
- The peer-md5 protocol in the wave-P brief still applies for A/B pair validity, unchanged.
  Git does not replace it: md5 protects a *measurement window*, git records *history*.
- **Rule 5 is now cheap to enforce and so it is enforced harder.** Your verdict's BEFORE/AFTER
  constant table will be checked with `git diff`. A prose claim that the diff does not support is
  the worst outcome available in this project.

## 2. The bar has not moved, and neither has the process.

`reference/` is the bar. Your headline gap is in your brief inline and in
`verdicts/wave-q/<piece>.md`. Write `verdicts/wave-r/<piece>.md` with the BEFORE and AFTER literal
value of every constant you touched, quoted with `file:line`, plus every measurement that supports
a claim, plus which frame type you rendered for any `_debrismeas` figure (ratios are cross-quotable
between agents, absolutes are not).

A miss you have PROVEN and explained is worth more than a hit you cannot reproduce. Round 13's
sky builder proving its own valley miss was cloud-limited, and the boost builder retracting its
own scored wave-N win, are the two behaviours this project most wants to see repeated.

## 3. WRITE YOUR VERDICT FILE FIRST, THEN UPDATE IT. NEW IN SESSION 15, AND IT IS BINDING.

Rounds 13 AND 14 both launched this exact batch and both produced **zero verdict files** while
leaving real edits on disk. The loss was never the edits — it was that no record existed of what
any edit was *for*, so the next round had to treat sound work as suspect and re-do it.

So: **`verdicts/wave-r/<piece>.md` is the FIRST file you write, before you plan or measure.**
Open it with your abandoned-edit audit from step 0 (`file:line` + literal value + keep/revert
decision) and a one-line statement of what you intend to change. Then append to it as you go:
every measurement when you take it, every constant when you change it. Never hold results in your
head to write up at the end — that is precisely the pattern that lost two rounds.

A verdict file that stops mid-sentence is a useful artefact. An empty `verdicts/wave-r/` is not.

## 4. WHY ROUNDS 13 AND 14 REALLY DIED, so nobody re-diagnoses it.

Session 14 correctly identified `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` (default 600s) as the
killer and correctly patched `run-gauntlet.sh`. **The patch never took effect.** The driver
(PID 60615) was started 2026-08-02 21:46 and bash had already parsed the `while :; do` loop body,
so the running loop kept using the pre-fix invocation — round 14 then died the same death as 13.
Session 15 made the fix driver-independent by putting it in **`.claude/settings.json`** (`env`
block), which every future round loads at startup regardless of how stale the driver is.
Session 15 itself still ran under the old env, so it launched its agents **synchronously**
(`run_in_background: false`) to sidestep the background-wait ceiling entirely.
**If a round's agents die together at a round-numbered elapsed time, check `env | grep
CLAUDE_CODE_PRINT` before you suspect the agents.**

**AND THERE WAS A SECOND, INDEPENDENT CAUSE — so do not stop at the env.** Round 13's abandoned
`game/audio.js:955 THUMP_PK = 0.00` made every boost ignition throw a `RangeError`
(`exponentialRampToValueAtTime` forbids a target of exactly 0), and in `audio-isolate.mjs` the throw
lands inside the `off.suspend().then()` callback so `off.resume()` never runs: a **19:33 deadlock at
0% CPU, with `lint ok` throughout.** Audio would have been killed even with the ceiling fixed.
**`lint ok` does not mean runnable.** Nothing in this project lints a forbidden Web Audio argument,
a non-compiling shader permutation, or an await that never settles. If your piece has a harness that
can hang, put a timeout on it before you trust a silent run.
