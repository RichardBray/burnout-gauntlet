# BRIEF - T12: drift counter in metres

You are working in `/Users/robray/fc/demos/burnout-gauntlet`, a browser game (three.js, plain ES
modules, no build step). Branch `player-traffic-collision`. Read this whole file before editing.

## FILES YOU OWN, AND ONLY THESE

- `game/hud.js`
- `game/physics.js` - **THE EARN/FEED BLOCK ONLY** (around `physics.js:1720-1760`, where
  `state.earnFeed` is pushed and `TUNE.boostEarnDrift` is applied), plus the `TUNE` constants that
  belong to it.

**A peer agent is in `physics.js` at the same time, in the COLLISION RESOLVER
(`hitCarBody`, around `physics.js:771-930`). Stay out of that region entirely.**
Another peer owns `game/traffic.js` and `game/menu.js`. Do not open those to edit.
If your fix belongs in someone else's file or region, write the finding down and STOP.

## WHAT THE USER WANTS

Reference image: `reference/hud/drift-metres.png` - **look at it before you start.**

The drift readout should count DISTANCE, shown as `DRIFT: 142 m`, in the existing amber popup
style above the boost bar.

## THE DECISION THAT IS ALREADY MADE - do not reopen it

**DISPLAY ONLY.** The boost EARN stays time-based at `TUNE.boostEarnDrift = 0.10` per second
(`physics.js:169`). Only the HUD number changes to metres. **Do not change how much boost a drift
earns.** You will be checked on this specifically.

## WHAT ALREADY EXISTS

`hud.js:2810-2822` turns `physics.state.earnFeed` entries into popups above the boost bar, with
`drift: 'DRIFT'` in the label map at `hud.js:2815`, and treats drift as a "passive chunk" with a
shorter popup life. Read that code before writing any.

## SCOPE

- Accumulate slide distance in `physics.js` while the drift condition holds - the **same condition
  that already drives `boostEarnDrift`**, i.e. `|slipAngle| >= slipRef`. Distance travelled while
  drifting, in metres. Do not invent a second drift condition.
  - Note: `state.speed` is only the LONGITUDINAL component of velocity and under-reads by the
    cosine of the slip angle - which is exactly the situation you are measuring. Use
    `state.ground`, the true ground speed. Getting this wrong makes a deep drift under-count by up
    to 30% and it will not be obvious.
- The popup **counts UP live during the drift** rather than appearing once per earn chunk. In the
  reference it is a single row whose number climbs while the slide lasts.
- Reset the counter when the drift ends. The final value should be readable for a moment before it
  fades.
- Keep the amber slanted popup style **exactly** as it is. This is not a restyle.

## ACCEPTANCE CRITERIA - you are scored on these

- The number climbs smoothly during a slide and **matches actual distance travelled**. Verify
  against a known-length drift - drive a slide, integrate ground speed independently, compare.
- Ends and fades cleanly. **A chain of short drifts does not produce a flickering stack of rows.**
- **No change to how much boost a drift earns.** Confirm the earn rate is untouched and show the
  evidence.
- No frame-time regression.

## HOW TO VERIFY - this is not optional

`bash tools/lint.sh` catches **syntax only**. This project has shipped a runtime crash that linted
clean. Boot the real page and check the console.

Playwright is already installed. Read `tools/_devtune-check.mjs` first - it is a worked example of
the server + playwright + console-error harness for this game, including how to drive the car
through the page's own key listeners. `tools/_hr3c-live.mjs` is a richer example of scripted
driving with an in-page rAF sampler.

Write your own throwaway probe at `tools/_t12-check.mjs` that:
1. boots on `#nomenu=1`, asserts zero console errors;
2. holds a handbrake slide for a fixed duration, samples `state.ground` per frame in-page and
   integrates it, and compares that independent integral against the number the HUD is showing;
3. does three short drifts back to back and asserts the popup does not stack or flicker;
4. records total boost earned across a fixed drift, before and after your change, to prove the
   earn rate is unmoved.

## PROJECT RULES THAT BIND YOU

- **Rule 5: do not trust a docstring, verify the constant.** Your report is checked against
  `git diff`. Quote BEFORE and AFTER literal values with `file:line`. A comment claiming a change
  the code does not make is the worst outcome available here.
- The visual bar is a **REGRESSION GATE, not a target**. Do not spend one minute making the HUD
  look better than asked. Do not restyle anything.
- Do not `git add -A`. **Do not commit at all** - the orchestrator commits. Leave the edits.
- Do not raise `POOL` in traffic.js or `NPC_DENSITY` in world.js.
- Do not refactor, rename, or reformat anything you were not asked to change.

## OUTPUT FORMAT - keep it tight

Return **at most 35 lines**, in exactly this shape, and nothing else:

```
FILES CHANGED: <list, with the line ranges you touched>
PHYSICS: <where the distance accumulates, which condition gates it, which speed field it uses>
HUD: <how the live-counting popup replaces the per-chunk one>
EARN UNTOUCHED: <the before/after boost-earned figures proving the rate did not move>
ACCURACY: <HUD metres vs independently integrated metres, for a named drift>
STACKING: <what three back-to-back drifts produced>
CONSOLE: <clean / the errors>
ROUTED FINDINGS: <anything belonging to a file or region you do not own, or "none">
```

No narration, no summary of what you are about to do, no restating this brief.
