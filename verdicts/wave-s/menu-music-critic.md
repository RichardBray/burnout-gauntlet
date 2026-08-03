# wave-s/menu-music-critic — independent judgement of game/music.js, game/menu.js, game/audio.js

Fresh context. I edit no game code. Everything below is driven with playwright against a real boot
of `game/index.html`, clicking real buttons and pressing real keys through the real listeners, and
every audio claim is re-derived with **my own** instrument (`tools/_musiccritic.mjs`), not with the
builder's `tools/_menumusic.mjs`.

Tree state at the start of this review, so nothing is inherited silently:

- HEAD `3ab92a5`. The piece landed at `446d1c1`; `92c2b39` (handling-r2) and `3ab92a5` (traffic-r2)
  landed on top of it.
- `game/main.js` is **DIRTY in the working tree and not this piece's doing**: +16 lines at `:645`
  forcing crash/boost subtrees visible for one `renderer.compile()`. That is a peer's shader-warm
  edit, in the file this round froze. I test the tree as it stands and say where it could matter.
- `game/music/*.mp3` are still untracked (20 MB) — the piece's own stated miss.
- Two peer critics may be running, so every frame-time number here is a SMOKE TEST.

## Plan

1. Re-derive the audibility number WITHOUT `music.probe()`: fetch the MP3, `decodeAudioData` it in
   an OfflineAudioContext, compute its own RMS, multiply by the gain, and check `probe()` against
   that prediction. A probe that agrees with an independently-decoded file cannot be reading a
   phantom.
2. Routing, both directions, with my own kill-controls: mute audio.js's master and measure music;
   mute music and measure audio.js's master (with my own analyser on audio.js's context, not the
   module's own reporting).
3. Two sliders, two things, driven as real mouse drags and real arrow keys.
4. Transport: skip, track selection, pause/resume, prev-restart rule.
5. Persistence across `applyScene`, and no autoplay before the gesture.
6. D1-D7 one at a time with the round-1 critic's own repros.
7. Break it: keys during transitions, rapid pause/resume, slider drag while paused, scene change
   mid-drive, resize, alt-tab key loss.
8. Control list completeness against `main.js`'s actual handlers.

(appended as I worked, below)

---

# RESULTS

Harness: `tools/_musiccritic.mjs`, playwright + chromium, `--use-angle=metal
--ignore-gpu-blocklist`, repo served over http, viewport 1280x720, `deviceScaleFactor: 1` unless a
row says otherwise, player path (real DRIVE click) unless a row says `#nomenu` or `#shot`. Every run
listened for `console` errors and `pageerror`. **Total page and console errors across all 14 boots:
zero.**

## 1. The soundtrack IS audible, and I can prove it without the builder's probe

The builder's audibility number comes out of `music.probe()`, an AnalyserNode the builder wrote,
tapped off a gain the builder wrote. That is the shape permanent rule 3 has been beaten by four
times, so I did not accept it. Two independent derivations:

**(a) The MP3s, decoded by me,** with `fetch` + `decodeAudioData` in a throwaway context that has
nothing to do with the game's graph:

| file | seconds | whole-file RMS | peak | first-8 s RMS |
|---|---|---|---|---|
| `santa-in-a-hurry.mp3` | 141.2 | **-9.71 dBFS** | +0.52 | -10.81 |
| `stormy-weather.mp3` | 210.5 | **-10.64 dBFS** | +0.35 | **-19.48** |
| `bring-me-up-higher.mp3` | 228.0 | **-10.16 dBFS** | +0.45 | -10.53 |

**(b) A tap I installed myself, on every node in the page that reaches a destination.** I patched
`AudioNode.prototype.connect` in an init script, *before the page builds any graph*, recorded every
node that connects to an `AudioDestinationNode`, and hung my own `AnalyserNode` off each one. No
cooperation from `music.js` or `audio.js` is required, and neither module knows it is being
measured.

- Destination-connecting nodes before any gesture: **0**.
- After the DRIVE click and 3.5 s of throttle: **exactly two**, on **two different AudioContexts**,
  one of which is `window.__audio.ctx` and one of which is not.
- SFX master sum: **-19.08 dBFS RMS / -8.47 peak**. Music gain: **-16.52 dBFS RMS / -6.20 peak**.

**The builder's headline of -18.90 dBFS RMS / -6.92 peak is CONFIRMED.** My own two instruments read
-19.22 (probe, 30 windows, gain 0.50) and -16.52 (my tap, 16 windows), and the level moves with the
track's own bar-to-bar loudness, which is why the three readings differ by a couple of dB. The
30-dB-plus margin over the historical -50 dBFS failure is real by any of the three measurements.

**And the cross-check that closes it:** predicted post-gain level from the *independently decoded
file* is `-10.81 dBFS (first 8 s) + 20log10(0.50) = -16.83 dBFS`. Probe read **-19.22**, a 2.39 dB
delta over a window a few seconds into a track that opens quietly. A probe agreeing with a file it
never touched cannot be reading a phantom.

Two anti-cheat checks, because a gain reading is worthless if nothing is playing: `current().time`
advanced **4.42 -> 5.94 s** over 1.5 s of wall clock (`readyState` 4, `networkState` 1), and
`setMusicVolume(0)` collapses the same measurement **-16.23 -> -90.55 dBFS**, i.e. the number I am
quoting is the signal and not a floor.

## 2. The routing claim SURVIVES a kill-control in BOTH directions, on measured audio

This is the claim I set out to break, because "it doesn't go through the master chain" is exactly
the kind of statement that gets asserted from a diagram. With my own tap on both sides I can mute
either one and measure the other, which the builder could not do (it only had the music side):

| action | SFX tap | MUSIC tap |
|---|---|---|
| both up | -19.08 dBFS | -16.52 dBFS |
| `audio.setVolume(0)` | **-88.33** | -16.38 |
| restored | -20.06 | -16.79 |
| `music.setMusicVolume(0)` | -21.21 | **-91.05** |

Each arm collapses by ~70 dB and moves the other side by **0.14 dB** and **1.15 dB** respectively -
inside the bar-to-bar variation of the music itself. Interleaved A/B x4 with the engine at full load
agrees: SFX 0.62 arm mean **-16.75 dBFS** (sd 0.23) vs SFX 0.00 arm mean **-16.62** (sd 0.17),
**delta 0.125 dB with the two arms overlapping**. The builder measured 0.321 dB; same result.

Three further controls:

- `audio.stop()`, which **closes** audio.js's context (`audio.js:1384`): SFX ctx `"closed"`, music
  ctx `"running"`, music **-16.64 -> -16.23 dBFS**, still playing. The music outlives the SFX
  engine's whole context.
- Halving the music gain costs **6.54 dB** against an ideal 6.02 (-16.09 -> -22.63), so the gain the
  slider writes is genuinely in series with the signal.
- Moving the music gain leaves `audio.getVolume()` at 0.62 across the move.

**Mechanism verified, not just the statistic.** `music.js:197` is literally
`musicGain.connect(actx.destination)`; `music.js:191` constructs a private `new AC()`; the graph is
`<audio> -> createMediaElementSource (:211) -> musicGain -> destination` and nothing else. My
`connect` patch proves by *enumeration* that there is no third path to a destination anywhere in the
page. This is the strongest form of this claim available and it holds.

## 3. Two sliders, two things - proven with a real mouse and with real arrow keys

| action | `music.getMusicVolume()` | `audio.getVolume()` | `musicGain.gain.value` |
|---|---|---|---|
| boot | 0.50 | 0.62 | 0.50 |
| real mouse click at 20% of the MUSIC slider | **0.18** | 0.62 | **0.180** |
| real mouse click at 80% of the SFX slider | 0.18 | **0.82** | 0.180 |
| 5 x ArrowRight on the focused MUSIC slider | 0.18 -> **0.28** | 0.82 | 0.280 |
| 5 x ArrowLeft on the focused SFX slider | 0.28 | 0.82 -> **0.72** | 0.280 |

Neither slider ever moved the other value, and `musicGain.gain.value` tracks the music slider to
three decimals, so the widget is not just moving a number. `localStorage` after the session holds
exactly one key: `bg.musicVolume = 0.28`, and it survives a reload (set 0.18, reload, read
**0.18**). There is no SFX key - the builder's stated miss, confirmed.

## 4. Transport: skip, selection, pause/resume all work, and resume is not from zero

Driven with real clicks on the real buttons and chips:

| action | result |
|---|---|
| NEXT | index 0 -> **1** (`stormy-weather`), playing, **-29.27 dBFS** |
| NEXT | -> **2** (`bring-me-up-higher`) |
| NEXT | wraps -> **0** (`santa-in-a-hurry`) |
| click track chip 3 | index **2**, playing, and **exactly one chip lit, the playing one** |
| PREV at t=4.97 s | restarts the same track, t -> **1.21** (the >3 s rule) |
| PREV at t<3 s | steps back, index 2 -> **1** |
| PLAY/PAUSE | `playing false`, level **-999 dBFS** (silent, i.e. the pause is real) |
| PLAY again | `playing true`, resumes at **3.42 s** from a pause at 1.91 s - not from zero, **-26.03 dBFS** |

Button label flips `Play` / `Pause` correctly. Three chips, three tracks, generated from
`music.tracks()`.

## 5. No autoplay before the gesture, and the music survives a scene change

Before any gesture: `ownContext false`, `unlocked false`, `playing false`, `ctxState "none"`,
`gainValue 0`, and **zero network requests for anything under `music/`** (I listened on the request
event, which is the check that cannot be spun by a state flag). Pressing `W` on the START card -
which the round-1 critic showed unlocks *audio.js* through `main.js:524` - leaves the music at
`ownContext false, playing false`. **Only the click starts it.** After DRIVE:
`unlocked true, playing true, ctxState "running", unlockCount 2`, and the first `music/*.mp3`
request appears, after the six SFX samples.

Round-1's caveat still stands and the builder restated it honestly: headless chromium does not
enforce the autoplay policy, so nothing here can attribute the *unlock* to the gesture as a browser
behaviour. What is provable is the code path - no context, no element and no request exist until
`unlock()` runs - and I have now also shown that a keypress is not a sufficient gesture for music
even though it is for SFX.

Scene change, driven by a **real click on a scene chip** (not the exposed `applyScene`):

| | track | position | scene | tod | wet |
|---|---|---|---|---|---|
| before | `santa-in-a-hurry` | 6.45 s | `dusk-highway-chase` | - | - |
| after | `santa-in-a-hurry` | **13.41 s** | `wet-night-asphalt` | `night` | 1 |

Same track, monotonic position, still playing, still audible (**-17.04 dBFS**), and the scene really
changed (time of day, wet and the car's position all moved). Five chips offered, `crash-cam` and
`car-paint-closeup` correctly excluded.

## 6. D1-D7, each re-run with the round-1 critic's own repro

| defect | round-1 critic's evidence | my measurement | verdict |
|---|---|---|---|
| **D1** res slider blanks the paused HUD | 19400 driving, **0** after a paused slider drag | driving 22209, paused 22183, after a **real mouse drag** on the res slider **22183**, external `setResScale(0.5)` 22183 immediately and 22183 after one poll | **CLOSED** |
| **D2** `C`/`R` fire through the pause menu | `crash false->true`, `damage 0->0.599`, `speed 29.422->0` | `speed 46.69512016062271` **bit-identical** before, after `C` and after `R`; `crash false`, `damage 0` | **CLOSED** |
| **D3** `SPACE` mislabelled | coast dv -1.144 vs SPACE -2.442; yaw 0.1288 vs 0.4445 | re-derived with **real keys** (see below) | **CLOSED** |
| **D4** key held on the START card leaks in | **10.037 m/s** 0.9 s after DRIVE | **-0.001 m/s** 1.2 s after DRIVE with W held on the title card | **CLOSED** |
| **D5** W held across a pause loses throttle | 30.156 -> **16.629 m/s and falling** | 63.630 -> **67.686 m/s**, `heldKeys ["KeyW"]` | **CLOSED** |
| **D6** arrow keys do not move the sliders | `resScale` stuck at 0.50 after 4 ArrowRight | res **0.50 -> 0.70 -> 0.60** (both directions), music 0.18 -> 0.28, sfx 0.82 -> 0.72 | **CLOSED** |
| **D7** card clips below ~600 px | card bottom **579** in a 560 px window | 900x560 bottom **552.0**/560; 1024x420 bottom **412.0**/420; 1280x720 bottom **712.0**/720 | **CLOSED** |

D3 re-derived my own way, and my first attempt was wrong in a way worth recording: injecting
`physics.setInput()` from `page.evaluate` gave **dyaw 0.0000 in both arms**, because `main.js:617`
calls `physics.setInput()` from the polled `keys` map every single tick and overwrites anything
injected. With **real keys only**, matched entry 34 m/s, `physics.reset`, 1.000 s, A held in both
arms:

| | dv | dyaw | slip | `drifting` |
|---|---|---|---|---|
| A alone | -4.963 m/s | 0.7202 rad | 0.182 | false |
| A + SPACE | **-11.228 m/s** | **0.8544 rad** | **0.958** | **true** |

2.26x the deceleration and 1.19x the rotation, and it enters the drift state. The label
`handbrake - swings the tail, slows the rear` (`menu.js:338`) is accurate against handling-r2's
shipped physics, and the order of the clauses matches which one is larger. The `handling-r2`
coordination the builder asked for is satisfied; no wording change needed.

## 7. The control list is complete and correct

Read off the card as a player sees it, then every row pressed against a live game:

```
W / ↑  ->  accelerate                              S / ↓  ->  brake, then reverse
A / ←  ->  steer left                              D / →  ->  steer right
SHIFT  ->  boost - hold with throttle              SPACE  ->  handbrake - swings the tail, slows the rear
R      ->  reset car                               C      ->  crash
ESC    ->  pause / resume
```

- **`SHIFT` = boost, the thing the user had to ASK about, is listed and the qualifier is load-bearing.**
  W alone 25.38 m/s; W + SHIFT **25.38 -> 47.71 m/s, `boosting true`, tank 1.000 -> 0.821**. SHIFT
  while coasting: **`boosting false`**. So the wording "hold with throttle" is not decoration - a bare
  "boost" label would have players pressing SHIFT while coasting and concluding it is broken.
- **Nothing is missing.** `main.js` has exactly one `keydown` handler (`:523`, registered `:553`), and
  it acts on `KeyR` (`:526`) and `KeyC` (`:532`) plus the polled map at `:618-628`
  (`KeyW/ArrowUp/KeyS/ArrowDown/KeyA/ArrowLeft/KeyD/ArrowRight/ShiftLeft/ShiftRight/Space`). Every one
  of those is on the card. `menu.js:292 HELD_CODES` is exactly that set of 11, and `KeyR`/`KeyC` are
  correctly absent from it.
- I pressed **23** unlisted keys (`B F G H M N P Q T V X Z E 1 2 , . [ ] Tab Enter Ctrl Alt`) against
  `{tod, wet, res, paused, crash, scene, musicIndex, musicPlaying}`: **zero** did anything.
- Fold allocation confirmed. START card order: `H1, sub, go, rule, controls, scene, tod, wet, res,
  rule, music, volume, foot` with the controls list bottom at **350 px of 720** - the whole list above
  the fold, which was round 1's headline pass. PAUSE card: controls moved to last, bottom 869 px. The
  tradeoff is deliberate and correct: a player who has already driven is there to change something.

## 8. Break it

| attempt | result |
|---|---|
| 10 x Escape at 80 ms with W held | parity correct (`paused false`, `open false`), car still drives 31.36 -> 42.30 m/s, music still playing |
| a real `KeyC` with zero delay immediately after the pause Escape | gated, `crash false` |
| wet slider dragged 0 -> 1 in 11 steps while paused | `wet 1`, still paused, no error |
| scene change **mid-drive** (drive, Esc, chip, Esc, drive) | 64.08 m/s at `hud-overlay`, `steer 0`, HUD visible, no autopilot |
| resize 1280x720 -> 900x560 while paused | HUD repainted (10781 px), card bottom 552 of 560, `renderSize()` 900x560 @ ratio 1 |
| `#shot=1` regression gate | `bgmenu` false, `bg-menu-style` false, `__game.menu` false, `music.info().ownContext` false, **zero `music/` requests**, `audio.info().mode "noop"`, `renderSize()` 1280x720 @ ratio 1, zero errors |
| `#nomenu=1` harness path | menu DOM exists but `display: none`, `isOpen() false`, `isPaused() false`, and after 10 s of throttle the music is still `unlocked false, ownContext false` - **a frame-time harness pays nothing for an audio graph** |
| **a swallowed keyup** | **BROKE IT. See F1.** |

## 9. Rule 5: every constant claim checked against the tree

I resolved all 20 `file:line` claims in the builder's report against the working tree and the BEFORE
side against `git show 446d1c1^`. **Every one is exactly as stated.** Spot checks:

- `music.js:93` `const DEFAULT_MUSIC_VOL = 0.50;`, `:94` `const FADE_S = 0.35;`, `:95`
  `const VOL_RAMP_S = 0.08;`, `:197` `musicGain.connect(actx.destination);`, `:211`
  `srcNode = actx.createMediaElementSource(el);` - all present, all as quoted.
- BEFORE: `git show 446d1c1^:game/music.js` really is the 13-line stub returning
  `{ _stub: true, unlock() {}, ... info() { return { stub: true, playing: false, tracks: 0 }; } }`.
- `menu.js:180` `margin: 0 0 8px` (BEFORE `11px` at old `:146`), `:130`/`:139`
  `max-height: 100%; min-height: 0` (BEFORE `max-height: 94vh` at old `:99`/`:107`), `:338`
  `['SPACE', 'handbrake - swings the tail, slows the rear'],` (BEFORE `['SPACE', 'handbrake'],` at
  old `:212`).
- `audio.js:1420` `getVolume() { return masterVol; }`, `:54` `... setVolume: f, getVolume: () => 0,`
  (BEFORE the noop shim had no `getVolume`, and old `:23` had no `getVolume()` in the contract line).
- `git diff 446d1c1 HEAD -- game/music.js game/menu.js game/audio.js` is **empty**: no peer has
  touched the three owned files since the commit, and no unmeasured drift was left behind.
- `bash tools/lint.sh` -> `lint ok`, and the page boots clean on all 14 runs.

## 10. Tree-state warning, and the frame-time smoke number

**`game/main.js` is DIRTY in the working tree and it is not this piece's doing.** +16 lines at
`:645-661` forcing `crash.group` and `boostFx.group` visible for one `renderer.compile()`. That is a
peer's shader-warm edit landing in the file this round declared FROZEN and owned by nobody. Every
number above was taken against the tree as it stands; the only one it could touch is the frame-time
smoke reading.

**SMOKE ONLY, two peer critics may be running, this is NOT a result.** `#nomenu=1`,
`scene=dusk-highway-chase`, throttle held, warm, `frameStats.reset()` then 6 s: **p50 43.5 ms, p90
71.2, p99 126.2, 91.0% over 16.7 ms, n=133, render 1280x720 @ pixelRatio 1, devicePixelRatio 1,
resScale 1**. I am not reporting this as a frame-time finding and nobody should quote it; it is here
only to record that the page runs and that the conditions were captured.

## 11. FINDINGS, ranked

### F1 (the one real defect, and it is IN THIS PIECE'S OWN FILE). A single swallowed keyup steers the car forever.

`menu.js:766` `const heldNow = new Set()` is added to on keydown (`:794`) and removed from **only**
on keyup (`:829`). There is no `blur`, `visibilitychange` or `focusout` handler anywhere in the file
that clears it. A key whose keyup is never delivered - the standard macOS `Cmd-Tab`-with-a-key-down
case, and any OS-level focus steal - is therefore latched in `heldNow` **permanently**, and
`reassertHeldKeys()` (`:786-791`) re-dispatches a `keydown` for it on **every subsequent resume**.

Airtight repro, with the keyboard completely idle and playwright's own key state empty:

```
drive, then one body-targeted keydown for KeyA and no keyup ever   // what the page sees after a focus steal
Escape (pause), Escape (resume)
-> physics.state.steer  -0.0000  ->  +0.9999985673551346
-> menu.heldKeys()  ["KeyC", "KeyA"]
```

And with a real held key plus a `blur`, it repeats on every resume, not just the first:
`steer -1.0000, -1.0000, -1.0000` over three consecutive pause/resume cycles.

The player-visible symptom is the worst kind: the car steers hard to one side with nobody touching
the keyboard, it survives further pauses, and the only escape is to press and release the phantom
key. **This defect did not exist before this round** - it is the cost of the D4/D5 fix, and it is the
one finding here that lives inside a file this piece owns. Fix is two lines in `menu.js`:
`window.addEventListener('blur', () => heldNow.clear())` plus the same on
`document.visibilitychange` when hidden. Severity: major, because the game becomes unsteerable and
the cause is invisible; frequency: needs a focus steal while a key is down.

### F2. The "three tracks are 8 dB apart" miss is MISATTRIBUTED, and the routed asset job would chase a non-problem.

The builder calls this "the largest remaining audio defect in the piece" and routes a loudness pass
over the MP3s. I decoded all three files myself: **whole-file RMS spread is 0.93 dB** (-9.71 /
-10.64 / -10.16, peaks +0.52 / +0.35 / +0.45). These three masters are as closely matched as
commercial masters get.

What the builder actually measured was `stormy-weather.mp3`'s **quiet intro**: its first 8 s read
**-19.48 dBFS** against a whole-file -10.64, an 8.8 dB gap that closes on its own once the track
opens up. My own reading a couple of seconds into track 2 reproduces the builder's number
(**-29.27 dBFS** post-gain) and it is the same artefact. Correct number, wrong cause - which is
exactly the failure this wave's critic brief exists to catch. **Do not commission a loudness pass on
these files.** If anything is worth doing it is a short fade-in or a start offset for track 2, and it
is cosmetic.

### F3. The capture gate works, but the stated mechanism is only half the story, and it is order-dependent.

`menu.js:806-813` explains the D2 fix as "a capture-phase `stopPropagation` on window runs before
main.js's bubble-phase listener". That is true for events whose target is `document.body`, which is
what a real keyboard produces - and I confirmed the gate holds for a real `KeyC` with zero delay,
and for a body-targeted synthetic one (`crash false` both times). But for an event whose **target is
`window` itself**, both listeners are "at target" and fire in **registration order**, and
`main.js:553` registered first. Measured: a window-targeted synthetic `KeyC` while paused
**wrecks the run** (`crash false -> true`).

Not player-reachable today, and the module relies on precisely this order for `reassertHeldKeys()`
to reach `main.js` at all - so this is not a bug to fix, it is a fragility to record. It is also the
concrete reason the builder's routed `main.js` finding (`if (paused) return;` after
`keys[e.code] = true`) still matters: the gate is a shim whose correctness depends on the target of
an event, not on a contract.

### F4 (minor, and stated by the builder). SFX volume does not persist; music does.
`localStorage` after a full session holds exactly `["bg.musicVolume"]`. A player who turns the
engine down finds it loud again next boot. The builder's reasoning (writing storage from inside
`audio.js` felt like the wrong owner) is sound, but `menu.js` could persist it and call
`audio.setVolume` on open, entirely inside owned files.

### F5 (minor, and stated). `game/music/*.mp3` are untracked, 20 MB, and `music.js` depends on all three by path.
Confirmed: `git status` shows `?? game/music/`. A fresh clone gets `info().error` "load failed". This
is a repository-shape decision and flagging rather than quietly committing 20 MB was the right call,
but the soundtrack does not exist for anybody but this machine until it is resolved.

### F6 (minor, and stated). No crossfade; `ended` hard-cuts to the next track.
`music.js:204` `el.addEventListener('ended', () => loadTrack(index + 1, { autoplay: true }))`. One
element, one gain, so a crossfade genuinely needs two of each. Correctly deprioritised behind D1-D7.

### F7 (note, not a defect). Skipping while paused resumes playback.
`next()` -> `play(i)` -> `loadTrack(target, { autoplay: true })` -> `startEl()` (`music.js:238`,
`:150`), and `prev()` past 3 s calls `startEl()` directly (`:250`). So pressing skip while the
soundtrack is paused starts it playing. Arguably what a player means by pressing skip; recorded so
the next owner knows it is deliberate-by-consequence rather than designed.

## 12. Claims I checked and ACCEPT as stated

- Post-gain music level, the routing off audio.js's master chain, survival of `audio.stop()`, the
  `setMusicVolume(0)` positive control, and the gain-halving linearity: all re-derived, all confirmed,
  two of them with an instrument the builder does not have.
- All seven of D1-D7, closed, each against the round-1 critic's own repro.
- The scene picker: five chips, real clicks, five distinct `{tod, wet, position}` states, HUD visible,
  no autopilot, no reload, no `main.js` edit, and a mid-drive change leaves the car under player
  control at 64 m/s.
- Music persists across a scene change without restarting.
- No autoplay before the click, and a keypress is not enough for music even though it is for SFX.
- `unlockCount` reads **2** on the player path, exactly as the builder disclosed.
- The regression gate: on `#shot=1` no menu, no music context and **no `music/` request at all**, and
  on `#nomenu=1` no audio graph is ever built. The piece cannot move a rendered pixel except through
  the scene picker, which the user asked for.
- The discoverability regression the builder caught in itself and fixed: the whole controls list is
  back above the fold on the START card (bottom 350 of 720).
- `tools/progress.mjs`'s `PLAY` map (`:48-55`) has no `menu-music` key, so this verdict and the
  builder's are parsed and dropped. Confirmed, and it is in nobody's ownership table, so I route it
  too rather than edit it.

```progress-metrics
music post-gain level, my own destination tap, 16 windows: -16.52 dBFS RMS / -6.20 peak at gain 0.50 (builder claimed -18.90; probe re-read -19.22)
routing kill-control, both directions, measured audio: SFX mute moves music 0.14 dB, music mute moves SFX 1.15 dB, each arm collapses ~70 dB
destination-connecting nodes in the whole page: 2, on 2 different AudioContexts (0 before the gesture)
independent cross-check: decoded MP3 -10.81 dBFS + 20log10(0.50) = -16.83 predicted vs -19.22 probed (2.39 dB)
D1-D7 re-run with the round-1 critic's own repros: 7 of 7 CLOSED
control list vs main.js handlers: 9 of 9 listed and pressed, 0 of 23 unlisted keys do anything
SPACE label check, real keys, 34 m/s, 1.000 s: dv -4.963 -> -11.228 m/s, dyaw 0.7202 -> 0.8544 rad, drifting false -> true
inter-track loudness, whole-file RMS: spread 0.93 dB (NOT the 8 dB the builder reported - that is stormy-weather's quiet intro)
new defect found in an owned file: a swallowed keyup steers the car forever (steer 0.0000 -> 1.0000, keyboard idle)
console/page errors across 14 playwright boots: 0
smoke only (peers may be running, NOT a result), #nomenu 1280x720 @ ratio 1 dpr 1 resScale 1: p50 43.5 ms, p90 71.2, p99 126.2, over16.7 91.0%, n=133
```

# VERDICT: PASS, with one new defect in an owned file

The soundtrack exists and it is genuinely audible: **-16.52 dBFS RMS on an analyser I installed
myself, before the page built a single audio node**, cross-checked against an MP3 I decoded with no
reference to the game's graph, with playback position advancing and a positive control that collapses
the same measurement by 74 dB. That is the strongest audibility evidence this project has produced,
and it is the fifth time it has had to be produced.

The routing claim - the one thing a diagram could have been substituted for - is settled by a
kill-control in **both** directions on measured signal, which the builder could only do in one. My
`connect` patch enumerates **every** node in the page that reaches a destination: there are exactly
two, on two different contexts, and muting either moves the other by ~1 dB or less while collapsing
itself by ~70 dB. Music cannot be passing through `audio.js`'s glue bus because there is no path from
one context to the other, and `audio.stop()` closing the SFX context leaves the music at -16.23 dBFS
and playing.

All seven of D1-D7 are closed, each re-run with the round-1 critic's own repro, and the numbers are
not close: `speed 46.69512016062271` is **bit-identical** across a `C` and an `R` through the pause
menu; the HUD holds 22183 of 22209 pixels through a real slider drag; `-0.001 m/s` where the critic
measured 10.037. The control list is complete against the only `keydown` handler in the codebase,
`SHIFT = boost` is listed with the qualifier that makes it usable, and the `SPACE` label the builder
coordinated with `handling-r2` is accurate against the shipped physics by my own real-key
kill-control. The scene picker the user asked for twice works with real clicks, mid-drive, with no
reload and no `main.js` edit. Every one of the 20 constant claims in the report resolves.

**It does not get a clean pass, for two reasons, and the first is the important one.** The D4/D5 fix
introduced a new defect in `menu.js` itself: `heldNow` is never cleared by anything but a keyup, so a
**single swallowed keyup latches a phantom key forever** and the resume re-asserts it every time -
measured `steer +0.9999985673551346` with the keyboard completely idle, and `-1.0000` on three
consecutive resumes. A player who Cmd-Tabs away with `D` down comes back to a car that steers itself
into a wall and stays that way. It is two lines to fix inside an owned file. And second, the
builder's own nominated "largest remaining audio defect" is **misattributed**: the three masters are
0.93 dB apart, not 8, and what was measured was one track's quiet intro. That is a correct number on
a wrong cause, which this wave's brief names as the specific failure that sends the next round at the
wrong file - and here it would have commissioned an asset job on files that need nothing.
