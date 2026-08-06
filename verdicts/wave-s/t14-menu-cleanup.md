# T14 - menu cleanup: drop the render scale block, Enter starts the game

Task source: `TASKS.md` T14, wave 1 agent C.
Built by **glm-5.2**, in a live session, briefed with `tools/BRIEF-T14.md`.
Verified independently by the orchestrator before the commit landed.
Files: `game/menu.js`, `tools/_t14-check.mjs`.

## What landed

**Render scale block removed** - the heading, the slider, the resolution/scale/window readout, the
fps line and the paused-frame caveat, plus the orphaned `#bgmenu .val` CSS rule. The 720p/1080p
cap selector was kept, as the task requires: it is a different control and the user did not ask
for it to go.

`ctx.renderSize()` was checked for other callers before anything was deleted and kept:
`main.js:1005` still calls it, and `resScale` stays pinned at 1.0 as internal machinery. Only the
UI went. `repaintHud()`'s 4 Hz poll was also kept - it still serves the resize listener and the
paused-HUD repaint.

**Enter starts the game.** The old click handler body moved verbatim into a new `primary()`
(`menu.js:764`); the go-button click and the Enter hook both call it, so there is exactly one
start path rather than two that can drift. Enter is handled inside the existing capture-phase
`keydown` listener (`menu.js:851`) with the same `preventDefault()` + `stopPropagation()` gate
every other menu key uses, so `main.js`'s bubble-phase listener never sees it. Enter is absent
from `HELD_CODES`, so `reassertHeldKeys` does not re-fire it on resume. Enter also resumes from
the pause menu.

## The one finding worth carrying forward

The brief flagged WebAudio unlock as "the one thing that can silently break". It nearly did, in
the TEST rather than in the code:

> **A synthetic `dispatchEvent` has `isTrusted = false`, and browsers refuse to resume an
> `AudioContext` for an untrusted event.**

A probe built on `dispatchEvent` would therefore have reported the unlock as broken when it was
fine - or, worse, passed a build where it really was broken, had the assertion been written the
other way round. The probe uses a trusted `page.keyboard.press('Enter')` instead. **Any future
input probe in this project that asserts anything audio-related must do the same.**

Result: after Enter, both `AudioContext`s report `state="running"`, none suspended, and
`music.info().unlocked === true` with `unlockCount = 2` - identical to the click path.

## Verification, re-run by the orchestrator rather than taken on trust

`bash tools/lint.sh` -> `lint ok`. `node tools/_t14-check.mjs` -> **14/14 PASS**: clean boot,
`data-opt=res` absent, `data-opt=cap` present, `.val` CSS gone, both resolution chips set the
right internal cap, Enter closes the start menu and unpauses, music unlocked, both audio contexts
running, Esc opens the pause menu, Enter resumes it, and a mouse click still works.

Routed findings: none.

## Regression gate

DOM/CSS inside the menu overlay only. No geometry, material or pass touched, so no rendered scene
can move. The menu card is shorter, which is the requested change and was checked against the
720p fold constraint noted at `menu.js:647`.

```progress-metrics
acceptance: 14/14 pass (tools/_t14-check.mjs)
audio unlock after Enter: 2/2 AudioContexts running, unlockCount 2
menu.js: -80 lines net
built by: glm-5.2 (live session), verified by orchestrator
```
