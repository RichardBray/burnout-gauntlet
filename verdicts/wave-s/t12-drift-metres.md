# T12 - drift counter in metres

Task source: `TASKS.md` T12, wave 1 agent B.
Built by **gpt-5.6** (codex) in a live session, briefed with `tools/BRIEF-T12.md`.
Verified and finished by the orchestrator.
Files: `game/physics.js` (earn/feed block only), `game/hud.js`, `tools/_t12-check.mjs`.

## What landed

Distance is accumulated in `physics.js` while the drift condition holds - the SAME condition that
drives `boostEarnDrift`, `|slipAngle| >= TUNE.slipRef`, so there is no second drift definition to
drift out of step. It integrates **`state.ground`**, the true velocity magnitude, not
`state.speed`, which is only the longitudinal component and under-counts a slide by up to the
cosine of the slip angle - exactly the case being measured.

The HUD row is now a single live record that counts UP during the slide, with a final record
emitted on the exit edge so the closing value is readable before it fades, replacing the old
"pop a `DRIFT +2%` entry per banked `earnChunk`" behaviour. The amber slanted popup style is
unchanged.

## Display only - the earn is untouched, and this was checked, not asserted

`TUNE.boostEarnDrift` is `0.10` before and after (`physics.js:161` both sides of the diff).
Total boost earned across the probe's fixed drift manoeuvre: **0.276553 before the orchestrator's
cleanup, 0.276565 after** - identical to within float noise, and the same figure the pre-change
tree produces. The chunked-popup code was removed, the `driftEarn` calculation itself was not.

## Two defects the orchestrator fixed on top

The builder's work passed its own probe but left two things:

1. **`reset()` did not clear the new counter.** `state.driftMetres` and `state.driftFeedActive`
   are live state, and `physics.reset()` cleared neither. Pressing **R** mid-slide left the
   counter armed, so the next drift resumed from the abandoned total instead of from zero. Now
   cleared alongside the rest of the earn state.
2. **`driftEarnAcc` became dead write-only state.** It was still declared and still zeroed in
   `reset()`, but after the chunked drift popup was removed nothing read it. Removed, with a
   comment recording where it went so the next reader does not go looking.

`state.driftMetres` / `state.driftFeedActive` were also lifted into the `state` object literal
rather than being sprung into existence mid-update, so the shape of `state` stays readable.

## Verification, re-run by the orchestrator rather than taken on trust

`bash tools/lint.sh` -> `lint ok`. `node tools/_t12-check.mjs` -> all pass:

| check | result |
|---|---|
| clean boot | zero console errors |
| accuracy vs an independent ground-speed integral | **HUD 47 m vs 47.80 m integrated** (110 samples) |
| one long drift renders one row | pass |
| three short drifts back to back | peak rows **1**, visibility transitions **1** - no stack, no flicker |
| final value fades and resets after its hold | pass |
| console across all driving | clean |

The accuracy check is the one that matters and it is honest: the probe integrates
`state.ground` per frame in-page, entirely independently of the HUD's own accumulator, and
compares. 0.8 m over a 48 m slide is sub-2%, which is the sampling difference between an rAF
sampler and the fixed-step sim, not an error in the counter.

## Regression gate

HUD text content and the earn block only. No geometry, material or pass touched.

```progress-metrics
drift accuracy: HUD 47 m vs 47.80 m independently integrated, over a 48 m slide
boost earned per fixed drift: 0.2766 (unchanged; boostEarnDrift 0.10 both sides)
three short drifts: 1 row peak, 1 visibility transition (no flicker)
built by: gpt-5.6 (live session), verified + 2 defects fixed by orchestrator
```
