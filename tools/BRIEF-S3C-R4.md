# BRIEF — `generate-mesh` S3c ROUND 4. ONE BLOCKING FINDING. SMALL, BOUNDED.

Round 3 (`b0c8f40`) was FAILED on exactly one thing. Read the `## ROUND 3` section of
`/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c-critic.md`, then
`/Users/robray/fc/demos/burnout-gauntlet/tools/BRIEF-S3C-R3.md`. `tools/BRIEF-S3C.md`,
`tools/WAVE-T-MAP-BRIEF.md` and `tools/WAVE-S-PLAY-BRIEF.md` still bind.

**ALMOST EVERYTHING IN ROUND 3 PASSED AND MUST NOT BE DISTURBED.** The critic verified: the
WORLD/DRIVER provenance split is genuine in the code, not just in the output; the WORLD assertions
were NOT weakened to buy the green baseline; all five chains independently pass connectivity, tarmac
and block checks; `game/` was untouched; and the `pos.y = 0` limitation is honestly disclaimed.
Route length was ruled **NON-BLOCKING** — do not lengthen the routes for its own sake.

**Change `tools/_s3c-drive.mjs` and nothing else.** If you think you need to touch `game/`, stop and
say why in the verdict instead. Do not touch `paths.city` or `paths.highway`.

## THE ONE BLOCKING FINDING

Baseline exits 0 while the car never drives three of the boundaries the routes enumerate:
**harbor 1/2, palmbay 2/3, mountain 1/2** on `driver crosses every authored 200 m boundary`.

The probe DETECTS this at `tools/_s3c-drive.mjs:353-354`, but at `:384-392` only `fatal` driver
findings affect the exit code, and boundary misses are created with the default `fatal = false`. So
the baseline exits green while failing its own central coverage assertion.

**A check cannot close the built-world seam risk at a boundary it did not traverse.** Authored
geometry crossing a plane is preflight; it does not test the driven seam.

## THE MINIMUM TO PASS, AS THE CRITIC STATED IT

1. **Make a missed authored boundary BASELINE-FATAL.** It stays a **DRIVER** failure — it must never
   become a WORLD accusation. Preserve the provenance split exactly as it is.
2. **Make the baseline actually drive every enumerated boundary in all five districts**, either by
   adjusting the follower or by choosing honest connected routes that the car can genuinely
   traverse.

Then baseline must exit **0** with **every** route crossing **every** enumerated boundary — green
because the drive happened, not because the miss was tolerated.

**THE TRAP, AND IT IS THE ONE THIS REPOSITORY FALLS INTO: do not get to green by making the
boundaries easier to hit.** Do not delete a boundary from the enumeration, do not widen
`BOUNDARY_TOLERANCE` (currently 18) until a miss counts as a hit, do not shorten a route to dodge a
plane, and do not teleport the car. Any of those is a metric passing without the thing it measures,
and it fails round 4 outright. If you change `BOUNDARY_TOLERANCE` at all, quote the BEFORE and AFTER
literal and justify it as a geometric fact, not as a way to get green.

If a boundary genuinely cannot be driven — because the follower cannot hold that corner at all — say
so plainly with the numbers and leave it FATAL and red rather than tolerated. **An honest red is a
pass for this round; a tolerated miss is not.**

## ALL FOUR MODES MUST STILL BEHAVE

| mode | exit | WORLD | DRIVER |
|---|---|---|---|
| baseline | 0 | 0 | **0** |
| `--poison=wall` | 1 | >=1 | 0 |
| `--poison=sever` | 1 | >=1 | 0 |
| `--poison=driver` | 1 | **0** | >=1 |

`--poison=driver` producing **zero** WORLD failures is the property that took three rounds to get.
Do not regress it.

## UNCHANGED HARD CONSTRAINTS

`#map=grid` must not move. Zero new materials. `POOL = 24` (`game/traffic.js:89`) and
`NPC_DENSITY = 0.16` (`game/world.js:3343`) are the user's numbers. Never bulk-edit `game/world.js`
by pattern match. `lint ok` does not mean runnable. Never import real Paradise geometry or extracted
game data. Do not report a frame-time number. Do not open a visual wave.

## YOUR ENVIRONMENT

A delegated sandbox **cannot bind a socket** — Chromium dies with `listen EPERM` — and the probe
needs a browser. **Do not fake a run, do not weaken the probe so it runs in node, do not claim a
pass.** Verify what you can in pure node against `game/map/*.js`, then say "probe written, not
executed, blocked by listen EPERM". The orchestrator runs it and all three poisons. **An honestly
unrun probe is a pass for this round; a claimed run is a fail.** Both previous rounds did this
correctly.

## OUTPUT

Append a `## ROUND 4` section to
`/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c.md`, **maximum 80 lines**:
what you changed and why it makes the drive happen rather than the miss tolerated, the BEFORE/AFTER
literal of any constant you touched, and the per-route enumerated-versus-crossed boundary counts.
Commit; no co-author line.

Final reply: at most 30 lines.
