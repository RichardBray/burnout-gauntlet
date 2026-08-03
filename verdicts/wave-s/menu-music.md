# wave-s/menu-music — the soundtrack, two volume controls, a scene picker, and D1-D7

Owns exactly: `game/music.js`, `game/menu.js`, `game/audio.js`.
`game/main.js` is FROZEN this round and I have not touched it.
Running CONCURRENTLY with `handling-r2` and `traffic-r2`, so **every frame-time number below is a
SMOKE TEST and is labelled as such.** Audio assertions, key-event assertions and DOM geometry are
not contended.

## Tree state before I started (process rule 2)

`git status`: `PROMPT.md`, `driver.log`, `game/traffic.js` modified (a peer's, not mine);
`README.md`, `game/music/`, `verdicts/wave-s/perf-critic.md` untracked.
**None of my three files was dirty**: `git diff --stat -- game/music.js game/menu.js game/audio.js`
was empty, so I inherit nothing unmeasured. `game/music.js` was the stub the session driver
committed at `da65fcf`; `game/menu.js` was byte-identical to `973b29e`.

**Tree warning for the session driver, not a defect of mine:** partway through my round
`game/main.js` and `game/physics.js` appeared as MODIFIED in `git status`. `main.js` is the file
this round declared frozen and owned by nobody. I have not read those diffs as evidence and I have
not touched either file; every number below was taken against the tree as it stood at the time, and
the only results that could possibly be affected by a live `physics.js` are the m/s figures in D4
and D5 (whose assertions are about which keys reach the sim, not about how fast the car goes).

## Plan

1. Fill in `music.js` against its own contract header: own `AudioContext`, own gain straight to
   `destination`, no fetch and no context before `unlock()`, persists across a scene change.
2. `audio.js`: `setVolume` becomes the documented SFX control and grows a `getVolume()` so the menu
   slider can reflect the live value instead of a shadow copy.
3. `menu.js`: MUSIC row (track list, prev / play-pause / next, now-playing time), MUSIC and SFX
   volume sliders, and a real SCENE PICKER with no reload.
4. D1-D7, each one fixed inside a file I own or routed with the reason.
5. Verify audio by capture-and-assert: post-gain RMS in dBFS, plus a kill-control that drops
   `audio.js`'s master to zero and shows the music level does not move.

## THE INSTRUMENT I WROTE: `tools/_menumusic.mjs`

Playwright against a real boot of `game/index.html` over http, real button clicks and real key
presses through the real listeners, every claim read out of `window.__game` / `window.__audio` and
never out of the DOM the menu drew. Six sections, selectable as `argv[2]`:
`audio | defects | scene | shot | smoke | cost | all`.

Audio is measured, never listened to. `music.probe()` (music.js:295) lazily taps an `AnalyserNode`
off `musicGain`'s **output** — the same signal `ctx.destination` receives — and returns RMS and peak
in linear amplitude and dBFS. A media element cannot be rendered by an `OfflineAudioContext`
(`tools/audio-capture.mjs`'s technique does not apply to streamed audio), so this is the substitute,
and it is downstream of the gain rather than upstream of it, which is the part that matters for
permanent rule 3.

Full output of the final `all` run is reproduced in the sections below. **Every one of the 32
assertions passes.**

---

## 1. THE SOUNDTRACK. It plays, it is audible, and it is NOT on the master chain.

`game/music.js` was a 13-line stub whose every method was a no-op; it is now the real module
(288 lines). The graph is deliberately two nodes long:

```
<audio> -> MediaElementAudioSourceNode -> musicGain -> ctx.destination
```

`musicGain.connect(actx.destination)` is at **music.js:197** and there is nothing else in the path:
no compressor, no convolver, no shared bus. `actx` is a PRIVATE `AudioContext` constructed inside
`unlock()` (music.js:194), so `audio.js`'s chain is not merely bypassed, it is on a different
context and cannot be in this path even by accident.

### Measured, at 48 kHz, on the player path after a real click on DRIVE

| assertion | measured |
|---|---|
| before any gesture | `ownContext false`, `unlocked false`, `playing false`, `ctxState "none"` |
| after the DRIVE click | `unlocked true`, `ctxState "running"`, `playing true`, `Santa In A Hurry`, `duration 141.15 s`, `sampleRate 48000`, `error null` |
| **post-gain level, 24 windows over 1.2 s** | **RMS -18.90 dBFS, peak -6.92 dBFS** at `musicGain` 0.50 |
| natural variation, two untouched windows | 0.19 dB |
| track 2 (`Stormy Weather`) | RMS -27.38 dBFS |
| `pause()` | RMS floor (-999, i.e. exact zero samples), `playing false` |
| `toggle()` resumes | `time 3.10 s`, i.e. it did NOT restart |
| `next()` | `santa-in-a-hurry -> stormy-weather`, still playing |

-18.90 dBFS RMS with peaks at -6.9 dBFS is a mix-level soundtrack. Permanent rule 3's failure mode
was a spectral sweep that scored perfectly at an inaudible **-50 dB**; this is **31 dB** above that.

### THE ROUTING KILL-CONTROLS. Three of them, because one would not settle it.

**KC1 — `audio.setVolume(0)`, interleaved, with the engine at full load.** A single before/after is
invalid on program material (the natural drift is above), so this is a paired interleaved A/B: `W`
held so the glue bus and the level rider are actually working, then 8 windows alternating
sfx=0.62 / sfx=0.

| arm | windows (music RMS dBFS) | mean |
|---|---|---|
| SFX master 0.62 | -16.36, -16.88, -16.66, -16.23 | **-16.53** |
| SFX master 0 | -16.49, -16.40, -17.48, -17.04 | **-16.85** |

**Delta 0.321 dB, and the two arms INTERLEAVE** (the loudest sfx-zero window, -16.40, sits above the
quietest sfx-on window, -16.88). Systematic ducking cannot produce overlapping arms.

**KC2 — `audio.stop()`, which CLOSES audio.js's whole AudioContext (audio.js:1384).** If music
shared that context the music would die with it. Measured: SFX context `state "closed"`, music
context still `"running"`, music RMS -16.17 dBFS, still playing. This is the strongest available
proof that the two contexts are separate objects, and it needed no private-field access to make.

**KC3 — the positive control, i.e. proof that the level I measured is THIS gain's doing.**
`music.setMusicVolume(0)` collapses the same measurement from -18.90 to **-90.24 dBFS**, and
0.50 -> 0.25 costs **6.05 dB** against an ideal 6.02. So `musicGain` is the path, the probe is
reading the real signal, and the earlier "unchanged" results are not a probe that was measuring
nothing.

### Persistence across a scene change (contract rule 3)

Driven through the pause menu's own picker: track `stormy-weather` at `t 3.42 s` before
`applyScene('wet-night-asphalt')`, still `stormy-weather` at `t 5.16 s` after, `playing true`. The
module-level singleton in `main.js` is what makes this true and I did not need to change it.

### What it costs the frame — SMOKE TEST, two peers running

Interleaved, 4 s windows, `W` held, 1280x720 @ ratio 1 (dpr 1, resScale 1):
music ON p50 **33.35 ms** vs music OFF p50 **33.40 ms** over two passes each. An earlier pass of the
same test on a quieter machine read 16.70 vs 16.70 ms. **Not a result, a smoke test** — the point is
only that streaming an MP3 through two Web Audio nodes does not appear in the frame at all, which is
also why I used a media element rather than `decodeAudioData` (5-8 MB MP3s, three to five minutes
each, would be ~50 MB of Float32 PCM and a multi-second decode stall before the first note).

---

## 2. TWO VOLUME SLIDERS, and `setVolume` is now the SFX control

`audio.js` grew `getVolume()` (audio.js:1420) and a header note (audio.js:23-31) stating that this
module is the SFX side and that music is deliberately not routed through its chain. The menu's SFX
slider reads `ctx.audio.getVolume()` live rather than keeping a shadow copy, so it cannot disagree
with the mix if a scene preset, a harness or the console moves it.

Proven distinct, with the real keyboard on the real widgets: `music 0.50 -> 0.40` while
`sfx 0.62 -> 0.62`, then `sfx 0.62 -> 0.40` while music stayed at 0.40. Two sliders, two
destinations. Music volume also persists to `localStorage` (`bg.musicVolume`), best-effort inside a
try/catch so a private window cannot throw at boot.

---

## 3. THE SCENE PICKER. The user asked twice; it exists now, with no reload and no `main.js`.

**The blocker everyone assumed was not real.** "A scene change re-runs `boot()`" is true of the URL
path, but a scene in `scenes.js` is not a world: all seven share one world, one car and one road. A
scene is a camera rig, a bloom preset, a paint colour, a time of day, a wet level and a starting
place on a path — and every one of those is reachable from `ctx`. So `menu.js` imports `SCENES` and
calls `SCENES[id].setup(ctx)` in place (`applyScene`, menu.js:430). **No `main.js` edit, no reload,
nothing routed.**

Three things `setup()` does for the SHOT harness that a player must not inherit, undone explicitly:
it holds the throttle down, it hands the car to `followPath()` (an autopilot) and it hides the HUD.
The order is boot's order — `setup()` first, then `applyWet`, then `applyTimeOfDay` — because
`applyTimeOfDay` ends in `sky.applyBloom` and `world.applyKeyFill`, exactly as at main.js:426-432.
Doing it the other way leaves the scene's own bloom overriding the sky's, a state boot can never
produce.

Five in-place changes, read out of the engine, zero console errors:

| chip | tod | wet | sky preset | car x,z | HUD visible |
|---|---|---|---|---|---|
| Highway | dusk | 0 | dusk | -400.00, -693.50 | true |
| Boost | dusk | 0 | dusk | -560.00, -693.50 | true |
| Wet night | **night** | **1** | night | -289.14, -324.98 | true |
| Midday | **midday** | 0 | midday | 324.98, -289.14 | true |
| Sprint | dusk | 0 | dusk | -325.06, 213.83 | true |

Five distinct states of `{tod, wet, position}`, and the car is under player control afterwards
(`steer -1.000` from a held `D`, so no autopilot is latched).

`crash-cam` and `car-paint-closeup` are deliberately NOT offered: one triggers a wreck in its setup,
the other parks the car under a fixed lens with the beams off. They are screenshot compositions, not
places you can drive, and a picker that hands you either would read as broken.

---

## 4. D1-D7, each with the critic's own repro

### D1 — the res slider blanked the HUD until resume. FIXED, twice over.
Mechanism confirmed as the critic diagnosed it: `resize()` calls `hud.resize()`, which reassigns
`canvas.width` and therefore clears it, and the HUD is only repainted from `hud.update()` inside
`tick()`, which the paused branch returns before. Both halves of the fix are in `menu.js`:
`repaintHud()` (menu.js:680) called directly from the res slider's own handler, and again from the
4 Hz poll so that ANY paused resize — `ctx.setResScale()` from a console or a harness, a window
resize between two of our events — self-heals within 250 ms.

Non-transparent HUD pixels (sampled every 7th alpha byte), 1280x720:

| state | before this round (critic) | now |
|---|---|---|
| driving | 19400 | 30370 |
| paused | 19387 | 30449 |
| real slider dragged to 0.60 while paused | **0** | **30449** |
| `setResScale(0.5)` while paused, immediately | **0** | 0 |
| `setResScale(0.5)` while paused, after one 250 ms poll | **0 (until resume)** | **30449** |

(The absolute pixel counts differ from the critic's because the HUD is drawing a different run's
state, not because of anything I changed; the 0-vs-nonzero is the result.)

### D2 — `C` and `R` fired through the pause menu. FIXED.
`main.js`'s `down()` gates its discrete actions on nothing, and `main.js` is frozen. Fixed from this
side instead: the menu's capture-phase window `keydown` listener now calls `e.stopPropagation()`
whenever a menu is open (menu.js:800), which runs BEFORE main.js's bubble-phase listener and stops
it being invoked at all. That implements the second half of main.js:601's own contract — "no tick,
no input" — without touching the frozen file.
Measured, pause menu open, `C` then `R`: `speed 21.4448 -> 21.4448` (bit-identical), `crash false`,
`damage 0`, still paused, menu still open. The critic's run at HEAD got `crash true`,
`damage 0.599`, then `speed 29.422 -> 0`.

### D3 — the `SPACE = HANDBRAKE` label. RE-WORDED.
The critic retracted D3 against the physics rewrite (straight-line dv -1.144 -> -2.442 m/s, 2.13x;
cornering yaw 0.1288 -> 0.4445 rad, 3.45x), so the word is no longer a lie. The label now says both
things it does and says them in the order the player feels them (menu.js:338).
**BEFORE** `['SPACE', 'handbrake']` -> **AFTER** `['SPACE', 'handbrake - swings the tail, slows the
rear']`. Coordination note for `handling-r2`: if the e-brake ends up with a monotone speed cost and
real yaw, this wording still holds; if it ends up as rotation only, drop the second clause.

### D4 — keys held while a menu is open leaked into the drive. FIXED.
Same `stopPropagation` gate, so `keys` is never latched while a card is up. Repro: hold `W` on the
START card, click DRIVE, touch nothing — **-0.006 m/s** after 0.9 s, against the critic's
**10.037 m/s**. The start menu deliberately re-asserts nothing on close: `onStart` resets the car to
a standstill, and honouring a throttle held while someone reads the controls list would launch them.

### D5 — holding `W` across a pause lost the throttle. FIXED.
The menu tracks what is PHYSICALLY held from capture phase (`heldNow`), which is the only honest
source — the OS tells a page nothing, and main.js's `keys` map is cleared by `setPaused(true)` and
so forgets. On resume from a PAUSE (never from START) it re-dispatches a synthetic `keydown` for
exactly the polled codes still down (`reassertHeldKeys`, menu.js:786). `HELD_CODES` (menu.js:292)
excludes `KeyR` and `KeyC` on purpose: re-firing a crash on resume would be D2 wearing a hat.
Measured with `W` physically down across the pause: `heldKeys ["KeyW"]`, speed
**44.900 -> 53.324 m/s** across the pause. The critic measured 30.156 -> 16.629 and falling.

### D6 — arrow keys did not move the sliders. FIXED.
`main.js:495` `preventDefault()`s every arrow and Space unconditionally, which kills a range input's
native keyboard behaviour. The `stopPropagation` gate means that line no longer runs; the gate is
then careful NOT to `preventDefault` the keys a focused slider needs (`SLIDER_KEYS`, menu.js:298),
or it would have reproduced the bug inside my own listener. Everything else that would scroll the
page still gets `preventDefault`.
Measured: res slider `0.40 -> 0.60` on four `ArrowRight`; music slider `0.50 -> 0.40` on five
`ArrowLeft`; SFX slider `0.62 -> 0.40`. There is also a `:focus-visible` amber ring now, because a
keyboard-operable slider has to look focused.

### D7 — the card clipped below ~600 px. FIXED.
Three CSS changes, and `min-height: 0` is the load-bearing one: a flex item's default `min-height`
is `auto`, which refuses to shrink below its content, so the card's own `overflow-y` never engaged
and the excess was simply drawn past the fold. `94vh` on a nested flex item cannot clamp a child
whose content is taller.

| window | before (critic) | now |
|---|---|---|
| 900x560 | card top 17, **bottom 579 of 560** — 19 px past the fold | top 8.0, **bottom 552.0 of 560**, `scrollHeight 1073 > clientHeight 542` |
| 1024x420 | not tested | top 8.0, **bottom 412.0 of 420** |

### Bonus, and it is a REGRESSION I CAUSED AND THEN FIXED
This round adds four blocks to the card (scene, soundtrack, two volumes): measured content height
**956 px** against 702 px of card at 1280x720. That silently broke the round-1 critic's headline
discoverability finding — "the whole [controls] list is above the fold at 720p". Rather than shrink
every font, the fold is now allocated by MODE (`orderCard`, menu.js:597): on the START card the
controls list sits directly under DRIVE (a cold player is here to learn), and on the PAUSE card the
options come first and the controls go last (a player who has driven is here to change something).
`insertBefore` moves the existing nodes, so no listener is rebound. Cheap compactions too: five
scene chips on one line, one-line hint, row margin 11 -> 8 px. Content 956 -> 900 px, and at 720p
all nine control rows are above the fold on the start card again
(`shots/s/menu-music-start.png`, `-pause.png`, `-short.png`).

---

## 5. RULE 5 — BEFORE and AFTER literal values, with `file:line`

`game/music.js` — the stub at `:50-62` is replaced wholesale. Every method was a no-op returning a
constant; there were no other constants to change.

| where | BEFORE | AFTER |
|---|---|---|
| music.js:50-62 | `createMusic()` returned `{_stub: true, unlock(){}, setMusicVolume(){}, getMusicVolume(){return 0}, next(){}, prev(){}, play(){}, pause(){}, toggle(){}, tracks(){return []}, current(){...index:-1}, info(){return {stub:true, playing:false, tracks:0}}}` | the real module: private `AudioContext`, `musicGain -> destination`, media-element playlist |
| music.js:81 | (did not exist) | `TRACKS` = 3 entries, `music/santa-in-a-hurry.mp3`, `music/stormy-weather.mp3`, `music/bring-me-up-higher.mp3` |
| music.js:93 | (did not exist) | `DEFAULT_MUSIC_VOL = 0.50` |
| music.js:94 | (did not exist) | `FADE_S = 0.35` |
| music.js:95 | (did not exist) | `VOL_RAMP_S = 0.08` |
| music.js:197 | (did not exist) | `musicGain.connect(actx.destination)` |
| music.js:211 | (did not exist) | `srcNode = actx.createMediaElementSource(el)` |

`game/audio.js` — **no existing constant changed.** Additions only:

| where | BEFORE | AFTER |
|---|---|---|
| audio.js:1420 | (did not exist) | `getVolume() { return masterVol; }` |
| audio.js:54 | `setSpace: f, setListener: f, setEnabled: f, setVolume: f,` | `... setVolume: f, getVolume: () => 0,` (the no-op shim keeps the same shape) |
| audio.js:23 | `//   a.setEnabled(bool) / a.setVolume(0..1) / a.running / ...` | `//   a.setEnabled(bool) / a.setVolume(0..1) / a.getVolume() / a.running / ...` plus the 8-line SFX-vs-music note at `:25-31` |

`game/menu.js` — literal values changed:

| where | BEFORE | AFTER |
|---|---|---|
| menu.js:180 | `#bgmenu .row { margin: 0 0 11px; }` | `#bgmenu .row { margin: 0 0 8px; }` |
| menu.js:108 | (`#bgmenu` had no padding and no box-sizing) | `box-sizing: border-box; padding: 8px 0;` |
| menu.js:130 | `#bgmenu .shadow { ... max-height: 94vh; }` | `display: flex; max-height: 100%; min-height: 0;` |
| menu.js:139 | `#bgmenu .card { ... max-height: 94vh; overflow-y: auto; ... }` | `box-sizing: border-box; max-height: 100%; min-height: 0; overflow-y: auto;` |
| menu.js:338 | `['SPACE', 'handbrake'],` | `['SPACE', 'handbrake - swings the tail, slows the rear'],` |

`game/menu.js` — new code, no prior value: `PLACES` (:281), `HELD_CODES` (:292),
`SLIDER_KEYS` (:298), `applyScene` (:430), `orderCard` (:597), `repaintHud` (:680),
`reassertHeldKeys` (:786), the keydown/keyup gate (:790-834), the soundtrack block, the two volume
sliders, and the `resize` repaint. Diff: `menu.js +435`, `music.js +288/-22`, `audio.js +28`.

## 6. THE REGRESSION GATE

**My change cannot move a rendered pixel on any deterministic path, and that is proven by mechanism
rather than asserted.** On `#shot=1&scene=dusk-highway-chase`: `document.getElementById('bgmenu')`
false, `document.getElementById('bg-menu-style')` false, `window.__game.menu` false,
`music.info().ownContext` false, `music.info().unlocked` false, `audio.info().mode "noop"`,
`renderSize()` 1280x720 @ ratio 1, zero console/page errors. `boot()` returns at main.js:444, before
`createMenu()` — the menu module is never constructed and `createMusic()` builds nothing but an
array. **So no shot A/B was needed and none was run**, which also keeps GPU off the peers'
measurements. The one thing that DOES move rendered pixels is the scene picker, at the player's
explicit request, and it moves them to states `boot()` can already produce.

Also verified: `#nomenu=1` (the frame-time harness path) still constructs the menu closed and
hidden (`display: "none"`, `isOpen false`, `isPaused false`) with **no AudioContext and no music
stream** — a frame-time measurement must not be paying for an audio graph.

## 7. HONEST MISSES AND THINGS I DID NOT DO

- **The autoplay unlock still cannot be attributed to the click in headless chromium**, exactly as
  the round-1 critic established. I can prove `unlocked false` / `ownContext false` before any
  gesture and `running` after the click, but that is a statement about my own code path, not about
  the browser's policy. On a real machine the policy is what makes the gesture necessary; here it is
  not enforced. I am not claiming more than that.
- `unlockCount` reads **2** on the player path, because `menu.js`'s go handler calls `unlock()` and
  `main.js`'s `onStart` calls it again. It is idempotent, so this is harmless, but it is visible in
  `info()` rather than hidden, and if `main.js` ever unfreezes one of the two calls should go.
- **No gapless / crossfade between tracks.** `ended` hard-cuts to the next track. Paradise
  crossfades; doing it properly needs two elements and two gains, and it was not worth the
  complexity against D1-D7.
- **No shuffle, no per-track volume normalisation.** The three tracks differ by ~8 dB RMS
  (-18.90 vs -27.38 dBFS as measured above), which a player will hear as track 2 being quieter. A
  loudness pass over the three files, or a per-track trim in `TRACKS`, is the honest fix and I did
  not do it. It is the largest remaining audio defect in this piece.
- **The SFX volume does not persist to localStorage**; only music does. `audio.js` owns its own
  default (`volume` at construction, from `main.js`) and writing storage from inside the audio
  module felt like the wrong owner. Inconsistent, and stated as such.
- The `night` column in my scene-picker probe read `world.isNight`, which is not a property that
  exists; the time-of-day proof rests on `getTimeOfDay()` and `sky.presetName`, both of which are
  real. My probe field was wrong, not the code.
- **Frame time is a smoke test throughout**, per the concurrency rule. The two windows I took
  differed by 2x (16.70 vs 33.40 ms p50) between runs with no code change of mine in between, which
  is exactly why this round may not report an fps result.

## 8. ROUTED FINDINGS (nothing in my files can fix these)

1. **`main.js` should still gate `down()`'s discrete actions on `paused`.** My capture-phase gate
   fixes D2/D4/D5 completely for the menu, but it is a second mechanism guarding a contract
   main.js:601 states and does not implement. If any future UI opens without going through
   `menu.js`, `C` and `R` will fire through it again. One-line fix in `down()`: `if (paused) return;`
   after the `keys[e.code] = true` line, keeping the `audio.start()` call.
2. **`main.js`'s `resize()` should repaint the HUD when paused.** Same reasoning: my 4 Hz poll makes
   D1 invisible to a player, but the underlying blank-canvas-until-tick behaviour is still there for
   any caller that resizes while paused with no menu open (`#nomenu=1` plus `setResScale`, which is
   precisely what a frame-time harness does).
3. **`main.js` should expose the booted scene id** (e.g. `ctx.sceneId`). My picker reads it out of
   `location.hash` because `boot()` keeps it in a local and exposes no getter, which means a boot
   with no `#scene=` and a non-default default would light no chip.
4. **The three MP3s want a loudness pass** (see misses). That is an asset job, not a code one.
5. **`tools/progress.mjs` cannot see this round's verdicts, and that affects all three of us.**
   `node tools/progress.mjs` ran clean as my last step, but its `PLAY` map (tools/progress.mjs:48-55)
   is keyed on the ROUND-1 piece names, and it pairs `<piece>.md` with `<piece>-critic.md`. So
   `menu-music.md`, `handling-r2.md` and `traffic-r2.md` are parsed into `pieces` at
   tools/progress.mjs:87-106 and then dropped on the floor at `:142`, and the board still shows the
   round-1 `menu` metrics. `tools/progress.mjs` is in nobody's ownership table this round so I have
   not edited it. The fix is either three more `PLAY` keys or, better, an alias so a round-2 verdict
   updates its round-1 piece: `'menu': [...,'menu-music']`.
6. **`game/music/*.mp3` are still UNTRACKED in git** (20 MB across three files, and a `README.md`
   in that directory saying an earlier round already swept them once as unowned). `music.js` now
   depends on all three by path, so a fresh clone gets a soundtrack that 404s and reports
   `error "load failed: santa-in-a-hurry"` through `info()`. Committing 20 MB of binary is a
   repository-shape decision rather than a menu-music one, so I have left them alone and flagged it
   rather than quietly adding them to my commit.

```progress-metrics
music post-gain level: -18.90 dBFS RMS, -6.92 dBFS peak (24 windows, gain 0.50, 48 kHz)
kill-control audio.setVolume(0) x4 interleaved: music -16.53 vs -16.85 dBFS, delta 0.321 dB, arms overlap
kill-control audio.stop() closes the SFX context: music still running at -16.17 dBFS
scene picker: 5 scenes changed live with no reload, 5 distinct {tod,wet,position}, 0 errors
D1 paused HUD pixels while moving the res slider: 0 -> 30449
D2 C and R through the pause menu: speed 21.4448 -> 21.4448 m/s, crash false (was 0 m/s and wrecked)
D5 W held across a pause: 44.900 -> 53.324 m/s (was 30.156 -> 16.629)
D7 card at 900x560: bottom 552.0 of 560 (was 579 of 560)
assertions in tools/_menumusic.mjs: 32 of 32 PASS, 0 console/page errors across 7 boots
smoke only (two peers running), 1280x720 ratio 1 dpr 1: music ON p50 33.35 ms vs OFF 33.40 ms
```

# VERDICT: the music half is built and measured; D1-D7 are all closed inside my own files.

The soundtrack plays at **-18.90 dBFS RMS** through its own `AudioContext` and its own gain straight
to `destination`, and three kill-controls settle the routing claim rather than argue it: the SFX
master at zero moves the music by 0.321 dB with the arms overlapping, `audio.stop()` closes the SFX
context outright and the music keeps playing, and `setMusicVolume(0)` drops the same measurement by
71 dB, which proves the probe was measuring the real signal. Separate MUSIC and SFX sliders, both
keyboard-operable, both proven to move different things. The scene picker the user asked for twice
exists and needed no `main.js` edit — five scenes, live, no reload. All seven critic defects are
fixed in files I own, including the five the critic routed to `main.js`, because a capture-phase
`stopPropagation` on `window` is enough to implement the pause contract from the outside. The two
things I would fix next are in my misses: the three tracks are 8 dB apart in loudness, and there is
no crossfade.
