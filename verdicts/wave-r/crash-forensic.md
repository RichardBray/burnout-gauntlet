# WAVE R FORENSIC — crash.js (not a builder pass)

STATUS: OPEN. Written before investigation, appended as I go, per addendum section 3.

PIECE: crash-forensic   FILE: `game/crash.js` (only file I may edit)
Task: establish what the unexplained 08:36-today edit to `crash.js` actually was, classify every
hunk, keep-with-measurement or revert each functional one, and rule the wave-R batch-3 crash brief
CONTAMINATED or CLEAR.

## THE TWO HYPOTHESES

**H1 (original).** `boost-fx` left a debris-bypass patch in `crash.js` as temporary measurement
instrumentation. The wave-Q crash/boost work deliberately BYPASSED boost to measure debris, so a
leftover bypass or forced-uniform is exactly the shape of thing that survives a killed round.
If true it is a FUNCTIONAL change and the batch-3 brief's `density 7.42 / areaMed 32-38` figures
are in danger.

**H2 (leading, raised by today's resolver, NOT a clearance).** The 08:36 edit is the resolver's own
COMMENT-ONLY prose rewrite at `crash.js:2133-2150`, done in the same pass that rewrote
`tools/_stripemeas.mjs:13-25` prose while closing standing item 9. The resolver explicitly declined
to treat this as cleared because it never verified the edit is comment-only. Verifying that is my
job. H2's being "leading" is not evidence.

H2 is CONFIRMED only if BOTH hold: (a) no hunk of the 08:36 edit lies outside `:2133-2150`, and
(b) nothing inside that range is an executable token.

## GROUND TRUTH

`verdicts/wave-p/crash-cam.md` and `verdicts/wave-q/crash-cam.md` quote literal constants with
`file:line`. Those quotes are the record of what `crash.js` held when last audited. The wave-Q
rule-5 table is the densest such record and is my primary check surface:

| claim | quoted location + literal |
|---|---|
| `aniso` on `streakTexture()` | `:249` `aniso: 16` |
| other texture aniso | `:75` 4, `:123` 4, `:178` 8, `:194` 4, `:353` 4, `:387` 8 |
| emitter colour | `:2196-2198` `1.10`, `0.609`, `0.216` |
| `SPARKS` | `:498` `const SPARKS = 150;` |
| `STREAK_VC` | `:212` `0.86` |
| spawn `streak:` literals | `:515` .012, `:1438` .015, `:1440` .008, `:1666` .013, `:1668` .016, `:1810` .013, `:1837` .013, `:2369` .009 |
| `len` | `:2144` `clamp(sp*s.streak, 0.09, 0.30)` |
| `wid` | `:2149` `clamp(0.012 + len*0.012, 0.012, 0.032)` |
| `heat` | `:2195` `Math.pow(u, 0.55)` |
| wave-M/N comment block | `:2130-2148` (the false-anchor prose the wave-Q critic ordered corrected) |
| wave-P corrected prose | `:2160-2193` |
| `panelMat` | `:449` `MeshPhysicalMaterial` |

Note the tension H2 must survive: wave-Q places the wave-M/N comment block at `:2130-2148` and
`len`/`wid` EXECUTABLE lines at `:2144`/`:2149`. The resolver's claimed comment-only range
`:2133-2150` OVERLAPS both. Either line numbers shifted (prose was rewritten to a different length,
which is itself consistent with H2) or the edit touched executable code (H1-shaped). Resolving that
overlap is the crux of this forensic.

## PLAN

1. Establish the 08:36 mtime and what else on disk shares it.
2. Read `crash.js` and check every ground-truth literal above against the tree. Any literal that
   does not match at its quoted line, or matches only after a line shift, is a hunk.
3. Classify each hunk comment-only / cosmetic / functional. Record `file:line` + literal
   BEFORE (from the verdicts) and AFTER (from the tree).
4. For each functional hunk: measure it or revert it. Unmeasured and unjustified = reverted.
5. Re-measure `density` and `areaMed` with boost BYPASSED via `tools/_debrismeas.mjs`, same
   invocation as wave-Q, quoting frame type. Compare against `7.42 / 32-38`.
6. `bash tools/lint.sh` = `lint ok`, AND actually run the crash scene (lint ok != runnable;
   round 13's `audio.js` deadlocked a harness 19:33 at 0% CPU while linting clean).
7. Commit ONLY `game/crash.js` + this verdict. Never `git add -A` — three peers have work in flight.

Boost landed and committed this round (`2c7f7cc`), so the crash x boost window is CLOSED and
stable; boost's determinism on `crash-cam` measured 0.00 on every `_debrismeas`/`_sparkdiff` column
over two boots today, so any movement I see is real, not noise. Peers are editing `game/world.js`
and `game/hud.js` concurrently — if a render shifts under me, reconstruct and interleave A,B,A,B.

I do not re-issue the retired `density 10.1 / areaMed <=15 under boost` targets.

---

## FINDINGS (appended live)
