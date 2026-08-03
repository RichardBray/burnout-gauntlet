# wave-s / fps-harness

Piece: build the frame-time harness this wave is judged on.
Owned files: `tools/fps.mjs` (new). No edits to `game/*`.

**I am running CONCURRENTLY with three peer agents.**
Every frame-time number in this file is a SMOKE TEST, not a result.
Nothing was tuned against any of them.

## Tree check before starting (process rule 2)

`git status` at start: `PROMPT.md`, `driver.log`, `game/index.html`, `game/main.js`, `game/world.js`,
`progress.json` modified by peers/driver; `README.md` and three `verdicts/wave-r/*.md` untracked.
None of those are mine. I touch none of them.
`tools/` is clean, so `tools/fps.mjs` starts from nothing.

## Regression gate

This piece cannot move a pixel: it adds one new file under `tools/` that nothing in `game/`
imports. No shot comparison is applicable. The harness only pokes live objects through
`window.__game` inside its own throwaway browser pages.

## Design decisions and why

1. **rAF-to-rAF only.** The harness reads `window.__frameStats.stats()` and never brackets
   `composer.render()` itself. Permanent rule 3 territory: a CPU-side bracket is satisfiable
   without the thing it claims to measure.

2. **The pixel-ratio guard fails the run, it does not annotate it.** `assertRenderSize()` compares
   the buffer that `ctx.renderSize()` reports against the size the CLI asked for and refuses to
   emit a statistic on a mismatch. A harness that reports a number next to a warning is a harness
   whose numbers get quoted without the warning.

3. **Draw-call counters are averaged over a real frame window, not read after one `render()`.**
   `WebGLRenderer.info` resets at the top of every `renderer.render()` call, and the composer calls
   render once per enabled pass, so reading `info.render.calls` after a frame returns the cost of
   the LAST PASS ONLY - a couple of hundred triangles for a fullscreen quad. The harness sets
   `info.autoReset = false`, resets once, counts N real rAF frames, and divides. This is exactly
   the class of bug this wave exists to catch, in the instrument rather than the game.

4. **Subsystem attribution re-measures the baseline after the sweep.** A single baseline at the
   top of a 12-toggle sweep drifts (thermal, peer load, the car driving into a different part of
   the city). Deltas are quoted against the mean of the opening and closing baseline, and the
   drift between the two is printed so a delta smaller than the drift can be dismissed on sight.

5. **Toggles that change shader defines force `material.needsUpdate`.** `renderer.shadowMap.enabled`
   is a program define; flipping it without invalidating materials measures nothing at all. The
   harness re-warms for the full warmup after any toggle so the recompile stall lands outside the
   measurement window.

## Log

- Wrote this verdict first, before `tools/fps.mjs` existed.
- Read `tools/shot.mjs` (static server + ANGLE/Metal launch flags reused verbatim), `game/main.js`
  (frameStats, ctx surface, resScale contract), `game/physics.js` (`placeOnPath`/`clearPath` for
  the `city` scenario), `game/scenes.js`, `game/traffic.js`.
- **Finding, routed, no owner action needed from me:** `game/traffic.js` is a 35-line STUB. It
  builds an empty `THREE.Group`, and `update`/`setNight`/`reset` are all no-ops with `count = 0`.
  So the `traffic-hidden` row of the subsystem table is expected to read ~0 ms, and it is not
  evidence that traffic is cheap - there is no traffic. Any wave-S piece reasoning about traffic
  cost must know this. Confirmed below by measurement.
