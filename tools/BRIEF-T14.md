# BRIEF - T14: menu cleanup. Remove the render scale block, Enter starts the game.

You are working in `/Users/robray/fc/demos/burnout-gauntlet`, a browser game (three.js, plain ES
modules, no build step). Branch `player-traffic-collision`. Read this whole file before editing.

## FILES YOU OWN, AND ONLY THESE

- `game/menu.js`

Peer agents are editing `game/traffic.js`, `game/physics.js` and `game/hud.js` **right now**.
Do not open them to edit. If your fix belongs in someone else's file, write the finding down in
your report and STOP - do not reach across. `game/main.js` in particular is owned by another agent
this round; if you believe a change there is required, report it, do not make it.

## THE TASK, VERBATIM FROM THE BACKLOG

### 1. Remove the render scale block entirely

The user chose to remove the **whole thing**, not just the slider: the
"RENDER SCALE - LOWER TO BUY FRAMES" heading, the slider, the resolution/scale/window readout, the
fps line and the paused-frame caveat all go.

The block runs from `menu.js:545`
(`const resRow = addRow('res', 'Render scale - lower to buy frames')`) through its readout at
`menu.js:689`. Line numbers are a starting point, not gospel - verify against the current file.

It existed to serve the frame-time work. The user has since fixed the game to 720p or 1080p and
does not want the knob.

**The 720p/1080p cap selector STAYS** (around `menu.js:516-525`). That is a different control and
the user did not ask for it to go. Do not touch it.

Also:
- Remove any now-dead helpers, CSS and `ctx` plumbing that the block used **and nothing else used**.
- **Check `ctx.renderSize()` and the fps sampler for other callers BEFORE deleting anything.**
  `grep -rn "renderSize" game/` first. If something else calls it, it stays.
- `resScale` in `main.js` stays. It is pinned at 1.0 and remains internal machinery, including the
  `#hudres` and HUD-path size comparison logic in `main.js`. **Only the menu UI goes.**

### 2. Enter starts the game

Today the start menu requires a click (around `menu.js:818`, the `onStart` call). Pressing Enter
must do exactly the same thing, through the same code path, including `music.unlock()`.

- **The keypress is a legitimate user gesture for WebAudio, so unlocking still works - but VERIFY
  THAT.** It is the one thing here that can silently break, and "it should work" is not a check.
- Enter should also **resume from the pause menu**, for symmetry. Esc already closes it.
- Respect the existing **capture-phase key handling** (around `menu.js:873`) and the **held-key
  re-assertion** (around `menu.js:845`), so Enter does not leak a keydown into `main.js`.

## ACCEPTANCE CRITERIA - you are scored on these

- Render scale block gone. The menu card should now be comfortably shorter; there is a 720p fold
  constraint noted in a comment around `menu.js:647` - re-check the card against it.
- No dead code, no orphaned CSS, no console errors from a removed `ctx` method.
- Enter starts the game from the start menu, **and audio unlocks - verify audio explicitly**.
- Enter resumes from the pause menu.
- Mouse start still works exactly as before.
- 720p and 1080p both still render at the right internal size with the slider gone.

## HOW TO VERIFY - this is not optional

`bash tools/lint.sh` catches **syntax only**. This project has shipped a runtime crash that linted
clean. You must boot the real page and check the console.

Serve and drive it with playwright, which is already installed:

```bash
cd /Users/robray/fc/demos/burnout-gauntlet
node tools/_devtune-check.mjs      # read this file first - it is a worked example of the
                                   # server + playwright + console-error harness for this game
```

Copy that file's server/boot preamble into your own throwaway probe under
`/Users/robray/fc/demos/burnout-gauntlet/tools/_t14-check.mjs` and use it to:
1. boot `index.html` (no `#nomenu=1`, you need the start menu) and assert zero console errors;
2. assert the render-scale row is absent from the DOM;
3. dispatch an Enter keydown and assert the game starts (`window.__ready`/menu closed) and that
   the audio context is running, not suspended;
4. open the pause menu and assert Enter resumes it.

## RULES

- **Do not `git add -A`.** Do not commit at all - the orchestrator commits. Just leave the edits.
- Do not raise `POOL` in traffic.js or `NPC_DENSITY` in world.js. Not your files anyway.
- Do not "improve" anything you were not asked to change. No refactors, no renames, no reformatting.
- If you find a real bug outside your file, report it, do not fix it.

## OUTPUT FORMAT - keep it tight

Return **at most 30 lines**, in exactly this shape, and nothing else:

```
FILES CHANGED: <list>
DELETED: <what went, with the line range it occupied>
KEPT (and why): <anything you were tempted to delete but found another caller for>
ENTER PATH: <where you hooked it, and how you stopped it leaking to main.js>
AUDIO UNLOCK: <verified how, with the assertion you ran and its result>
VERIFY: <the probe you ran and its output, pass/fail per acceptance criterion>
ROUTED FINDINGS: <anything belonging to a file you do not own, or "none">
```

No narration, no summary of what you are about to do, no restating this brief.
