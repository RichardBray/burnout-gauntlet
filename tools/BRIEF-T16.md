# BRIEF - T16: near misses must appear in the boost feed, with the chain multiplier

You are working in `/Users/robray/fc/demos/burnout-gauntlet`. Branch `player-traffic-collision`.
Read this whole file before editing. **The tree has moved since your last task** - T1, T12, T14
and T17 have all landed. `git log --oneline -6` and re-read anything you think you remember.

## FILES YOU OWN

- `game/traffic.js`
- `game/hud.js` (the earn-feed popup text only)

No peer agents are running this round, so `physics.js` is free if you genuinely need it - but you
almost certainly do not, and see "Multiplier" below.

## WHAT THE USER REPORTED

Drift and oncoming popups appear above the boost bar. **Near misses never do.**

## ALMOST ALL OF THIS IS ALREADY BUILT. DO NOT BUILD A NEW SYSTEM.

The wiring is complete end to end and the popup should already be showing:

- `traffic.js:500` emits `nearMiss` with an intensity.
- `main.js:221` wires it: `physics.setEventSource(() => traffic.drainEvents())`.
- `physics.js:1729-1734` applies the chain multiplier and pushes `{type, mult, earn}` onto
  `state.earnFeed`.
- `hud.js:2813` maps `nearMiss: 'NEAR MISS'` and renders `x${mult}`.

**The event is simply not firing often enough to be seen.** Line numbers are a starting point,
not gospel - `hud.js` and `physics.js` both moved in T12. Verify against the current file.

## THE CAUSE, AND THE FIX THE USER CHOSE

**Near miss only tests against LIVE traffic.** `traffic.js:1167` opens a near-miss pass while
iterating the 22-car pool. Parked cars reach `traffic.js` as `statics` and are used for pass audio
only (`traffic.js:746`, the `onPass` whoosh). Parked cars vastly outnumber live ones - there are
**342** of them against a pool of 22 - so most of what the player squeezes past can never fire an
event.

**The user chose: parked cars count, at full intensity.** Threading past a parked car at speed is
a near miss and earns boost like any other.

## SCOPE

- Fire `nearMiss` against static bodies using the **same clearance geometry as the live path**:
  `NEAR_MISS_R = 3.4`, `NEAR_MISS_OUT = 1.4`, `EVENT_SPEED_MIN = 12` (`traffic.js:128-130`).
  **Reuse the open/close hysteresis. Do not write a second detector with different thresholds.**
- The static path needs per-body pass state, which live vehicles carry as `nmOn/nmMin/nmRel`
  (`traffic.js:317`). Statics have no such slot. Add one **without making the static list
  expensive to scan** - only bodies within the pass radius of the hero need tracking.
- **Do not double-fire alongside the existing `onPass` whoosh.** They should be the same pass.
- Confirm the whole path once statics are in: event drains, chain applies, popup renders.

### A CONSTRAINT FROM T1 THAT DID NOT EXIST WHEN THIS TASK WAS WRITTEN

T1 landed since. A struck parked car is now **promoted** to a live wrecked pool car: its static
body gets `b.gone = true` and it leaves the baked population. Your static scan **must skip
`b.gone` bodies**, or a car that has already been knocked away will keep firing near misses from
the spot it used to be parked in. Check what the live path does with wrecked cars and be
consistent.

## MULTIPLIER - do not touch it

**Keep the existing shared chain**, `earnChainWindow = 3.0` and `earnChainMax = 4`. Two near
misses inside 3 s gives x2, and mixing a near miss with an oncoming pass or a traffic check chains
too. That is Paradise's behaviour, it is already correct, and it was simply never visible.
**Do not add a second near-miss-only counter.**

## POPUP TEXT

**Drop the percentage** for near miss only. The HUD currently builds `` `${name}${mult} +${...}%` ``.
Near miss renders as `NEAR MISS X2`, no `+6%` - the bar already shows the gain.

Scoped to near miss ONLY. Leave drift and traffic check as they are. If they look inconsistent
side by side, **raise it in your report rather than changing them unasked.**

## THE BOOST ECONOMY - THE USER'S EXPLICIT INSTRUCTION

This is an economy change, not just a HUD fix. Expect the bar to fill noticeably faster.

**MEASURE the new fill rate under normal driving and REPORT IT AS A NUMBER.**
If it is now too generous, **say so with the number. DO NOT quietly retune `boostPerNearMiss`.**
The user has reserved that decision. Report, do not adjust.

Measure it properly: time to fill an empty bar while driving a normal line through the city, and
the same measurement on the pre-change tree so there is a before and an after. A worktree pinned
to the previous commit is the clean way to get the before.

## ACCEPTANCE CRITERIA

- Driving normally past parked cars produces visible NEAR MISS popups.
- Two near misses inside 3 s show `X2`; the chain climbs to `X4` and decays after 3 s of quiet.
- The chain is shared: near miss into oncoming into check escalates across types.
- No double-firing. One pass, one event, one whoosh.
- **New boost fill rate measured and reported, before and after.**
- No frame-time regression from scanning static bodies. **State the per-frame cost, and confirm
  the scan is bounded by proximity rather than by the size of the static list.**

## HOW TO VERIFY

`bash tools/lint.sh` catches syntax only. Boot the real page and check the console.
`tools/_t12-check.mjs` (yours) and `tools/_t1-repro.mjs` are both worked examples of the
server + playwright + scripted-driving harness in this repo. Write `tools/_t16-check.mjs`.

## RULES

- Do not raise `POOL` in traffic.js or `NPC_DENSITY` in world.js. Both are user-set.
- **Rule 5: verify the constant, do not trust a docstring.** Quote BEFORE and AFTER literals with
  `file:line`.
- Do not `git add -A`. **Do not commit** - the orchestrator commits.
- No refactors, renames or reformatting you were not asked for.

## OUTPUT FORMAT - at most 35 lines, exactly this shape, nothing else

```
FILES CHANGED: <list with line ranges>
DETECTOR: <how statics reuse the live clearance geometry and hysteresis>
PASS STATE: <where per-body state lives, and how the scan stays proximity-bounded>
GONE BODIES: <how T1-promoted cars are excluded>
DOUBLE-FIRE: <how you proved one pass = one event = one whoosh>
FILL RATE: <before X s, after Y s, same measured manoeuvre — and your verdict on whether it is
            too generous. DO NOT retune it.>
PER-FRAME COST: <ms, and what bounds the scan>
CONSOLE: <clean / errors>
ROUTED FINDINGS: <or "none">
```

No narration. No restating this brief.
