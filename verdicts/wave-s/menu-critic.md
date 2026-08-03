# wave-s/menu-critic — independent judgement of game/menu.js

Fresh context. I edit no game code. Everything below is driven with playwright against a real
boot of `game/index.html`, clicking real buttons and pressing real keys, and every claim is
checked against engine state read out of `window.__game`, never against the DOM the menu drew.

Tree state at the start of this review, so nothing is inherited silently:

- HEAD `0bdb9df`, menu shipped at `973b29e` (`game/menu.js` 32 -> 445 lines, `verdicts/wave-s/menu.md`).
- `game/main.js` is DIRTY in the working tree and NOT the menu's doing: an uncommitted crash-feel
  edit (`CRASH_HOLD_S = 2.2`, `CRASH_DEMO_SEVERITY = 0.55`, C-key speed floor 30 -> 12). I test
  the tree as it stands and say so wherever it could touch a result (only the C-key row).
- I am running concurrently with a physics rewrite. Any frame-time figure below is a SMOKE TEST.

## Plan

1. Discoverability: enumerate the 9 rows the menu's CONTROLS list claims, press each key, read the
   engine effect. Then hunt for bindings that work and are NOT listed.
2. Each option proved from engine state: time of day (preset name + sun elevation), wet (road's
   wet value), res (renderSize()).
3. The res readout as an instrument: menu string vs the real drawing buffer.
4. WebAudio before/after the DRIVE click, and the `#nomenu=1` keypress path.
5. Pause: position/speed frozen while the canvas still repaints; resume with no dt jolt.
6. Break it: Esc mid-crash, Esc on start menu, DRIVE twice, 4 rapid TOD changes, resize with menu
   open, hold W + Esc + release W + resume.

(appended as I worked, below)

---

# RESULTS

Harness: playwright + chromium, `--use-angle=metal --ignore-gpu-blocklist`, viewport 1280x720,
`deviceScaleFactor: 1` unless a test says otherwise, repo served over http, player path (`#nomenu`
only where named). Every run listened for `console` errors and `pageerror`. **Total page errors and
console errors across all 12 runs: zero.**

## 1. Discoverability — a cold-booted player CAN learn every control

At cold boot the start menu is up, `isPaused() true`, and the card carries all nine control rows.
Screenshot of the boot state: `/tmp/mc/tod-MIDDAY.png` (the same card, midday). It is legible, the
whole list is above the fold at 720p, and it names the two things that were undiscoverable before:
`SHIFT boost - hold with throttle` and `ESC pause / resume`.

Claimed bindings, each PRESSED against a live game and read out of `physics.state`:

| listed | claim | measured | verdict |
|---|---|---|---|
| `W / ↑` | accelerate | W 2.5 s: 0 -> 25.512 m/s; ArrowUp 1.5 s: 25.512 -> 31.732 | works |
| `S / ↓` | brake, then reverse | S 3.5 s: 36.217 -> **-11.95**; ArrowDown: -10.962 -> -11.949 | works |
| `A / ←` | steer left | A 0.7 s: yaw 1.5708 -> 2.2945 (+0.72 rad), steer 0 -> +0.9989; ArrowLeft yaw 1.7121 -> 2.1504 | works |
| `D / →` | steer right | D 0.7 s: yaw 2.3826 -> 1.7765 (-0.61), steer -> -0.9986; ArrowRight yaw 2.1936 -> 1.8796 | works |
| `SHIFT` | boost - hold with throttle | coasting: 23.691 -> 14.613, `boosting false`, tank stays 1.000. With W held: 31.917 -> 42.477, `boosting true`, tank 1.000 -> 0.794. `ShiftRight` too: 36.618 -> 44.958, `boosting true` | works, and the "hold with throttle" wording is NECESSARY, not decoration |
| `SPACE` | handbrake | see D3 and the CORRECTION below: mislabelled at HEAD `0bdb9df`, accurate against the physics rewrite that landed mid-review | works (after the rewrite) |
| `R` | reset car | `crash.active true -> false`, speed 4.386 -> 0, `damage.level 0.599 -> 0` | works |
| `C` | crash | `crash.active false -> true`, `damage.level 0 -> 0.599` | works |
| `ESC` | pause / resume | verified in section 5 | works |

**Bindings that work and are NOT listed: none found.** `grep` over `game/*.js` finds exactly one
`keydown` listener in the whole codebase (`main.js:498`, handler at `:468`), plus the menu's own
Escape capture listener; `game/index.html` has no key handling at all. I then pressed 16 unlisted
keys (`B F G H M P T V X Z 1 2 Tab Enter Ctrl Alt`) on a live game and diffed
`{tod, wet, res, paused, menuOpen, crash, camMode}` after each: no change from any of them.

## 2. Every option provably lands in engine state

Read from the engine, never from the widget. `sky.presetName`, sun elevation from
`sun.position - sun.target.position` (the raw `sun.position` is shadow-follow and drifts with the
car, so it is not a valid probe), `renderer.toneMappingExposure`, `scene.fog.color`, and
`roadKit.wet` plus the road materials' own `anisotropy` / `envMapIntensity` — which `roadKit.setWet`
writes at `road.js:1890-1891` — so the wet proof is downstream of `ctx.getWet()`, not the same value
echoed back.

| clicked | ctx | sky.presetName | sun elev | exposure | fog |
|---|---|---|---|---|---|
| boot | dusk | `dusk` | 2.60 deg | 1.30 | `#6b5d47` |
| DAWN | dawn | `dawn` | 3.20 | 1.22 | `#8a7a6a` |
| MIDDAY | midday | `midday` | **47.00** | 1.00 | `#94a9bf` |
| DUSK | dusk | `dusk` | 2.60 | 1.30 | `#6b5d47` |
| NIGHT | night | `night` | 34.00 (moon) | 1.55 | `#2a3550` |

Four distinct presets, four distinct sun elevations, four distinct fog colours, and the rendered
frame behind the card changes with them (mean canvas luma over the four screenshots: dawn 60.2,
midday 50.3, night 49.0, dusk 42.3, at 1280x720).

| wet control | `getWet()` | `roadKit.wet` | road `anisotropy` | road `envMapIntensity` |
|---|---|---|---|---|
| DRY chip | 0 | 0 | 0.3000 | 0.900 |
| DAMP chip | 0.5 | 0.5 | 0.4250 | 1.200 |
| WET chip | 1 | 1 | 0.5500 | 1.500 |
| slider dragged to 35% | 0.35 | 0.35 | 0.3875 | 1.110 |
| slider hard right / hard left | 1 / 0 | 1 / 0 | — | — |

`lerp(0.30, 0.55, wet)` and `lerp(0.9, 1.5, wet)` reproduce every row exactly, so the value reached
the materials. The chip lit-state also correctly goes to NONE lit at wet 0.35 rather than lying.

Resolution, dragged with the real mouse on the real slider:

| slider | `getResScale()` | `renderSize()` w x h | `gl.drawingBufferWidth/Height` | `canvas.width/height` | composer target |
|---|---|---|---|---|---|
| hard left | 0.40 | 512 x 288 | 512 x 288 | 512 x 288 | — |
| 25% | 0.55 | 704 x 396 | — | — | — |
| 50% | 0.70 | 896 x 503 | — | — | — |
| hard right | 1.00 | 1280 x 720 | 1280 x 720 | 1280 x 720 | 1280 x 720 |
| 0.5 (set) | 0.50 | 640 x 360 | 640 x 360 | 640 x 360 | 640 x 360 |

The buffer really shrinks, `canvas.clientWidth/Height` stays 1280x720 (CSS upscale, as designed),
and the composer's `renderTarget1` follows — so post is not silently left at the old size.

## 3. The resolution readout is HONEST, including at devicePixelRatio 2

This is the one that could have been a blocking failure, so I ran it on a page where
`devicePixelRatio` is 2 (`deviceScaleFactor: 2`) and compared the menu's own printed string to
`renderer.getContext().drawingBufferWidth/Height`, which is the buffer and cannot be spun.

| dpr | menu prints | gl.drawingBuffer | composer target | verdict |
|---|---|---|---|---|
| 1 | `1280×720 (1.00)   window 1280×720` | 1280 x 720 | 1280 x 720 | exact |
| 1 | `640×360 (0.50)   window 1280×720` | 640 x 360 | 640 x 360 | exact |
| **2** | `1280×720 (1.00)   window 1280×720` | **1280 x 720** | 1280 x 720 | exact |
| **2** | `640×360 (0.50)   window 1280×720` | **640 x 360** | 640 x 360 | exact |

**No 2x lie. The instrument passes.** The readout also tracks a window resize while open: at
900x560 it printed `900×560 (1.00)   window 900×560` with `renderSize()` reporting 900x560, and
printed `1280×720` again on the way back.

The fps line beside it reads the paused frame (59.9 fps p50, 16.7 ms, n=1611 at 640x360 dpr 2) and
carries its own disclaimer in the card: "fps here is the paused frame, no physics: treat it as an
upper bound." That disclaimer is doing real work — the paused branch skips `tick()` entirely, so the
number is 3-4x the driving figure. It is honest because it says so; I would not have accepted the
line without it.

## 4. WebAudio — works on all three paths, but the before/after-click observation is NOT evidence here

| path | before | after | after what |
|---|---|---|---|
| player path | `running false`, `audio.ctx === null`, `suspended true` | `running true`, `ctx.state "running"`, 6 samples loaded, sampleRate 44100 | `click #bgmenu .go` |
| `#nomenu=1` | `running false`, `ctx null` | `running true`, `ctx.state "running"` | keydown `W` only, never a click |
| `#nomenu=1` | `running false`, `ctx null` | `running true`, `ctx.state "running"` | one canvas click (`main.js:500` pointerdown) |

Survives a pause round trip: still `running/"running"` while paused and after resume.

**KILL-CONTROL, and it overturns the framing of the builder's headline.** I called
`window.__audio.start()` from `page.evaluate` with **no user gesture whatsoever** on a cold
`#nomenu=1` boot: `running true`, `ctx.state "running"`. Headless chromium is not enforcing the
autoplay policy, so "suspended before the click, running after" cannot be measured in this
environment at all — before the click there is no AudioContext to be suspended, and after any input
it would run gesture or no gesture. The builder's own caveat pointed at the pointerdown fallback;
the stronger statement is that **no headless observation can attribute the unlock to the click**.
What is provable, and what I do accept: audio reaches `"running"` on the click path, on the keypress
path and on the canvas-click path, and there is no path I found where it fails to start.

Second correction to the same claim: the start menu is NOT the only gesture on the boot path. I
pressed `W` on the start menu before ever clicking DRIVE and got `running true`, because
`main.js:468 down()` runs its `audio.start()` even while the start menu is open — the menu's Escape
capture handler is the only key it intercepts.

## 5. Pause really pauses, and resume does not jolt

Esc pressed **while W was held**, 1280x720, ratio 1:

- `pos.x` frozen at `-371.0074` and `pos.z` at `-693.5000` and `speed` at `25.1361` across 2.5 s of
  wall clock (byte-identical readings 150 ms after Esc and 2650 ms after Esc).
- **The canvas is still live**: `frameStats.n` advanced 3 -> 45 over that window, i.e. 42 rAF
  callbacks in 2.5 s. Not a frozen frame, so it cannot read as a hang.
- HUD still painted while paused: 30395 non-transparent samples on the HUD canvas.
- Menu visible, `display: flex`.

Resume jolt: I sampled per-frame displacement for 60 consecutive frames starting at the resume.
First frames `[dt_ms, metres, m/s]`: `[17.6, 0.4161, 24.916] [22.2, 0.4125, 24.698]
[31.8, 0.8082, 24.270] [45.7, 0.7943, 23.852] [60.0, 1.1621, 23.241]`. Max single-frame
displacement over the 60 frames was **1.1621 m** on a 60 ms frame, and a 127.2 ms frame produced
0.9991 m — exactly `0.05 s x 19.98 m/s`, which is `clamp(dtRaw, 0, 0.05)` at `main.js:539` holding.
**No accumulated-dt fling.** The mechanism is `last = now` at `main.js:537`, executed before the
paused early-return, so the paused frames never bank time; the dt clamp is a second belt.

Esc during a crash: `crash.active true, crash.time 0.026` at the pause, still `0.026`-frozen 2.5 s
later, resumed and the replay continued from there (`crash.time 0.482`) and handed control back. No
error, no stuck state.

## 6. BREAK IT — defects found, ranked

Six of these are real at the time I ran them, and D3 has since been retracted (see CORRECTION at the
end). None of them is in `game/menu.js`; five are in `main.js`'s input/pause handling. That is the honest shape of the result: the menu module itself
survived everything I did to it.

### D1. Touching the res slider while paused BLANKS THE HUD until you resume. Every time.
Measured non-transparent pixels on the HUD canvas (`#hud canvas`, sampled every 7th alpha byte):
driving **19400**, paused **19387**, `setResScale(0.5)` while paused **0**, real slider drag to
0.60 while paused **0**, after Esc to resume **19412**. Mechanism, and I agree with the builder's
diagnosis: `resize()` (`main.js:193`) calls `hud.resize()`, which reassigns `canvas.width` and
therefore clears it, and the HUD is only ever repainted from `hud.update()` inside `tick()`, which
the paused branch at `main.js:539` returns before. The builder routed this as "a resize while
paused", which is true but undersells it: **the res slider is the menu's own headline instrument and
it triggers this on every single use**, while the card says "options apply live to the frame
behind". Rank it first. Owner: `main.js` (repaint the HUD from `resize()` when paused).

### D2. `C` and `R` fire THROUGH the pause menu and silently wreck or reset the run.
Repro: drive, Esc, then press `C` with the pause menu open. `crash.active false -> true`,
`damage.level 0 -> 0.599`, camera flipped to orbit, all while `isPaused() true` and the card is
still up. Then `R` with the menu still open: `crash.active -> false`, `speed 29.422 -> 0`,
`damage -> 0`. Resume and you are parked at 0 m/s having pressed nothing that the menu says does
that. Mechanism: `ctx.setPaused` (`main.js:535`) clears the polled `keys` map, but `down()`'s
discrete actions (`KeyR` at `:471`, `KeyC` at `:477`) are not gated on `paused` at all. Owner:
`main.js`. The pause contract in the comment at `main.js:531` says "no tick, no input"; the second
half of that sentence is not implemented.

### D3. `SPACE` is listed as HANDBRAKE and the handbrake does not brake.
Kill-control, matched entry speed, 1.000 s window, straight line, no throttle:
coast **34.165 -> 19.820 m/s (dv -14.345)**, SPACE held **34.128 -> 19.950 (dv -14.178)**. SPACE is
0.17 m/s SLOWER at stopping the car than doing nothing, i.e. it does not decelerate at all.
Mid-corner at matched speed with A held: yaw delta 1.1894 rad without SPACE vs 1.2128 with — no
extra rotation either. What it does change is `slip`, 0.766 -> 1.665 (2.17x). That is exactly
`physics.js:145`, the only line in the codebase that reads `input.handbrake`:
`const targetSlip = clamp(lat / 34, -1, 1) * (input.handbrake ? 2.2 : 1) * TUNE.driftGain;`.
So SPACE is a cosmetic drift-angle multiplier wearing the name of a brake. The menu can only label
what exists, so I am not scoring this against `menu.js` — **routing it to the physics rewrite that
is running concurrently**, which is the only place it can be fixed, and flagging that the menu label
will need to change with it.

### D4. Keys held or pressed while a menu is open leak into the drive.
Repro: hold `W` on the START menu, click DRIVE, touch nothing else — the car is at **10.037 m/s**
0.9 s later. `setPaused(true)` clears `keys` once, at the moment of pausing, and nothing clears it
on unpause, so anything pressed during the menu is already latched when the sim restarts. Same root
cause as D2. Owner: `main.js`.

### D5. Holding `W` across a pause loses the throttle on resume.
`30.156 m/s` before the pause; 1.2 s after resume with `W` still physically down, **16.629 m/s** and
falling. A synthetic `keydown{code:'KeyW', repeat:true}` — what a real OS auto-repeat sends —
restored it: 16.629 -> **27.506 m/s**. So on a real machine this self-heals after one key-repeat
interval (250-500 ms on stock macOS, and never if the user has key repeat off), and playwright's
`keyboard.down` sends no repeats, which is why it looks total in my harness. Real but minor; same
root cause as D2/D4. Owner: `main.js`. Reported because the brief asked for exactly this case.

### D6. Arrow keys do not move the sliders; both sliders are mouse-only.
Repro: pause, click the res slider (focus confirmed `INPUT/range`), press ArrowRight x4. `getResScale()`
stays **0.50** and the input's own `value` stays `"0.5"`. Cause: `main.js:495` calls
`e.preventDefault()` for `ArrowUp/Down/Left/Right/Space` unconditionally, which kills the native
range-input keyboard behaviour even while the game is paused with a menu open. **This one IS fixable
inside `menu.js`**: the module already owns a capture-phase window keydown listener, and having it
`stopPropagation()` on arrow keys while `open` would stop `main.js`'s listener running at all and
restore the default action. Routing to the menu owner with that concrete fix; it is also the same fix
that would stop D2/D4 for the arrow keys.

### D7 (minor). The card is clipped in windows shorter than ~600 px.
At 900x560 with the menu open: card rect top 17, bottom 579, `innerHeight` 560 — 19 px below the
fold, and the card's own scroll container is what is clipped, so the last rows need a scroll whose
scrollbar is itself partly offscreen. Fits cleanly at 720p. Owner: `menu.js`, low priority.

### Things I tried to break and could not
- **DRIVE clicked twice** (real dblclick, then a third forced `.click()` on the hidden button):
  one start only. `pos.x -400`, `speed 0`, `crash false`, no double `physics.reset`, no error. The
  `started` latch at `menu.js:404` holds.
- **Esc on the start menu**: ignored by design, menu stays open and `isPaused()` stays true. So the
  start menu cannot be dismissed without the click.
- **Four rapid TOD changes** with no waiting between clicks: ends on the last one clicked
  (`getTimeOfDay() dusk`, `sky.presetName "dusk"`), no error, no torn state. Note for the record:
  the four clicks took **1611 ms** of blocked main thread, ~400 ms per `applyTimeOfDay` (sky LUT +
  env rebuild). The menu is honest about the result; the cost is the sky module's.
- **Resize with the menu open**, 1280x720 -> 900x560 -> 1280x720: readout tracked both ways, engine
  size tracked, no error (but D1 applies to the HUD, and D7 to the card).
- **Esc spammed 6 times at 90 ms**: parity correct, ends open, no error, and the game was still
  driveable afterwards (16.768 -> 30.345 m/s, 41.06 m travelled).
- **SPACE and ENTER pressed immediately after a resume**: menu did not re-open,
  `document.activeElement` is `BODY`. The `hide()` blur at `menu.js:390` works.
- **Escape with the res slider focused**: closes the menu, `paused false`, focus back to `BODY`.

## Regression gate, verified driver-independently

On `#shot=1&scene=dusk-highway-chase`: `document.getElementById('bgmenu')` **false**,
`document.getElementById('bg-menu-style')` **false**, `window.__game.menu` **false**, no
`isPaused`, no `__frameStats`, `renderSize()` 1280x720 ratio 1, zero errors. `boot()` returns at
`main.js:444`, before `createMenu()` at `:601`. **The menu cannot move a rendered pixel.** No shot
comparison needed and none run.

## Builder claims I checked line by line (rule 5)

- `game/menu.js` in the worktree is **identical to commit `973b29e`** — `git diff 973b29e --
  game/menu.js` is empty. No unmeasured drift left behind.
- Palette is verbatim: `menu.js:31-35` `INK rgba(4,7,10,0.92)`, `PAPER rgba(232,240,248,0.95)`,
  `AMBER #ffb31f`, `AMBER_HOT #ffd34a` all match `hud.js:29/31/32/33` exactly. `GREEN #5fc51c` is
  `hud.js:53 C_READY.edge`, which `hud.js:442 boostColours()` uses for the boost bar — the "boost-bar
  green" description holds.
- `tornPolygon()` is at `menu.js:57` as claimed.
- Two line numbers in the report are wrong, both harmlessly: the SHIFT row is at **`menu.js:211`**,
  not `:239`, and the palette is `:31-35`, not `:31-38`. The edits themselves are exactly as
  described. `createMenu()` is now at `main.js:601`, not `:582`, because of the peer's uncommitted
  crash-feel edit (+19 lines) — the builder's number was right at their commit.
- `main.js` is dirty from a PEER, not from the menu builder: `CRASH_HOLD_S = 2.2` (was `4.5`
  inline), `CRASH_DEMO_SEVERITY = 0.55` (was `severity: 1`), C-key speed floor `Math.max(30, ...)`
  -> `Math.max(12, ...)`, banner `2.2` -> `1.4`. Only the `C` row of my binding table touches it,
  and `C` works either way.

```progress-metrics
menu res readout vs gl.drawingBuffer: exact at dpr 1 AND dpr 2 (1280x720 @1.00, 640x360 @0.50)
bindings listed and verified working: 9 of 9 (SPACE mislabelled, see D3)
unlisted working bindings found: 0 of 16 keys probed
pause freeze: pos/speed byte-identical over 2.5 s, 42 rAF frames still drawn
resume jolt: max 1.1621 m in one frame, dt clamp 0.05 holds at a 127 ms frame
handbrake kill-control, physics rewrite in tree: coast dv -1.144 vs SPACE dv -2.442 m/s over 1.000 s from 34.2 m/s
handbrake kill-control, HEAD 0bdb9df physics: coast dv -14.345 vs SPACE dv -14.178 (it did not brake at all)
smoke only (peers running), 1280x720 ratio 1 dpr 1 resScale 1: p50 16.7 ms, p90 49.9, p99 50.3, over16.7 64.5%, n=245
console/page errors across 12 playwright runs: 0
```

# VERDICT: PASS

A player who has never seen this game boots it, reads nine control rows off the start card, and
every one of them does something — I pressed all nine and read the engine, not the UI. All three
options land in engine state and not just in a widget: four distinct sky presets with four distinct
sun elevations, wet reaching the road materials' own anisotropy and envMapIntensity, and a
resolution slider whose printed size equals `gl.drawingBufferWidth` **including on a
devicePixelRatio-2 page**, which was the one blocking failure available and it did not happen.
Audio reaches `"running"` on the click path, the keypress path and the canvas path. Pause freezes
position and speed to the last decimal while still drawing 17 frames a second, and resume does not
fling the car.

It passes with seven defects on the board and I want the ranking on the record, because two of them
will bite a player in the first minute: **D1**, the HUD blanking every time the res slider moves
while paused, and **D2**, `C` and `R` firing through the pause menu and silently wrecking or
resetting the run. Neither lives in `game/menu.js` — five of the seven are `main.js`'s input and
pause handling, D3 is retracted against the physics rewrite that landed mid-review (see CORRECTION),
and only D7 (card clipped below ~600 px tall) and D6's fix belong to the menu owner. If D1 and D2
were in this piece's file I would have failed it.

Two claims in the builder's report are downgraded rather than accepted: the WebAudio before/after
observation is unmeasurable in headless chromium (kill-control: `audio.start()` with no gesture at
all reaches `"running"`), and the start menu is not the only gesture on the boot path — any keypress
on it already unlocks audio through `main.js:468`.

---

# CORRECTION, and a tree-state warning (process rule 2)

The concurrent physics rewrite landed in the working tree DURING this review
(`game/physics.js`, +499/-74, uncommitted). Everything above was measured against the tree as it
stood when each test ran, so two things have to be said plainly.

**D3 is RETRACTED against the current tree.** I re-ran the same matched-speed kill-control after the
rewrite appeared, 1.000 s window from 34.2 m/s:

| | coast | SPACE held | ratio |
|---|---|---|---|
| straight-line dv, HEAD `0bdb9df` physics | -14.345 m/s | -14.178 m/s | **0.99, i.e. no brake** |
| straight-line dv, rewritten physics | -1.144 m/s | **-2.442 m/s** | 2.13 |
| cornering dYaw over 0.9 s, rewritten | 0.1288 rad | **0.4445 rad** | 3.45 |
| cornering dv, rewritten | -1.04 m/s | **-4.61 m/s** | 4.43 |

The rewrite gives the handbrake a real rear-axle deceleration (`physics.js:337`,
`handbrakeDecel * m`) and a real grip cut (`physics.js:152 handbrakeMu: 0.40`, applied at `:318`),
where the old model's only use of `input.handbrake` was the `* 2.2` slip multiplier at the old
`physics.js:145`. **So `SPACE = HANDBRAKE` is an accurate label as of the current tree, and the
menu's control list needs no change.** I am leaving D3 on the record with its numbers because it was
true of the code that was shipped at HEAD when I started, and because the retraction is the useful
part: nothing in `menu.js` had to move for it.

**All nine bindings re-verified against the rewritten physics**, same procedure, zero page errors:
W 0 -> 19.375 m/s; ArrowUp 19.375 -> 29.766; A yaw 1.5708 -> 1.8828 with steer +0.9959; D steer
-0.9929 with yaw rising the other way; ArrowLeft/ArrowRight the same signs; SHIFT coasting
11.055 -> 9.955 with `boosting false`, SHIFT with throttle 25.062 -> 34.426 with `boosting true` and
the tank 1.000 -> 0.929; SPACE mid-corner yaw 3.7047 -> 4.0251; S 8.284 -> **-12.000**; ArrowDown
-11.914 -> -12.000; C `crash.active -> true`; R `-> false` with speed 0. No unlisted key did
anything (same 16-key probe).

**Tree-state warning for whoever drives this next, not a menu defect.** One of my re-runs caught the
rewrite mid-save and the page threw `pageerror: wallContact is not defined`, with the car immovable
at `speed -0.007` through every one of the thirteen key tests. The very next run of the identical
script was clean. `wallContact` is declared at `physics.js:246` now. Anyone measuring handling in the
next few minutes should re-check for that error before trusting a number — it fails silently as
"the car does not move" rather than as a crash.
