// =============================================================================
// music.js — the soundtrack. MODULE SEAM, written by main.js's owner, filled in
// by the wave-S `menu-music` builder.
//
// This file exists as a stub so that `main.js` can import and wire the seam
// WITHOUT the music builder ever editing `main.js`. Three wave-S builders are
// running concurrently and `main.js` is owned by exactly one of them; the same
// pattern was used for `traffic.js` and `menu.js` in session 16 and it worked.
//
// THE CONTRACT. `main.js` calls exactly these, and nothing else:
//
//   createMusic()            -> a music object, constructed at boot, BEFORE any
//                               user gesture. Must NOT construct an AudioContext
//                               here and must not fetch: `tools/shot.mjs` boots
//                               this path and must never throw or block.
//   m.unlock()               Called from the START-menu click and from the pause
//                               menu's resume, i.e. from a real user gesture.
//                               This is the only legitimate place to construct or
//                               resume an AudioContext. Idempotent.
//   m.setMusicVolume(0..1)   Music gain. SEPARATE from audio.js's setVolume,
//                               which is now the SFX control.
//   m.getMusicVolume()
//   m.next() / m.prev()      Skip. Must be safe before unlock() (no-op or queue).
//   m.play(i) / m.pause() / m.toggle()
//   m.tracks()               -> [{ id, title, seconds? }] for the menu list.
//   m.current()              -> { index, id, title, playing, time?, duration? }
//   m.info()                 -> a plain object for a harness to assert on.
//
// THE RULES THAT ARE NOT NEGOTIABLE, from the user's own brief:
//
// 1. **Music gets its OWN gain node straight to `destination`.** Do NOT route it
//    through audio.js's master chain. That chain is a glue bus, a limiter and a
//    space reverb tuned for the engine; it would duck and colour the music along
//    with the exhaust, which is wrong.
// 2. **Own your own AudioContext.** `audio.js`'s `stop()` CLOSES its context
//    (audio.js:1384), and music must survive a scene change and an SFX stop.
//    Sharing the context couples music's lifetime to the engine's.
// 3. **Music persists across a scene change — it does not restart.** If a scene
//    change tears the world down, the music object and its playback position
//    must outlive it.
// 4. Respect the same click-to-unlock gesture as everything else. Nothing may
//    autoplay before `unlock()`.
//
// The three files on disk, already present in `game/music/`:
//   santa-in-a-hurry.mp3, stormy-weather.mp3, bring-me-up-higher.mp3
//
// UNTIL THIS IS FILLED IN, every method below is a safe no-op so the game boots.
// =============================================================================

export function createMusic() {
  const stub = {
    _stub: true,
    unlock() {},
    setMusicVolume() {},
    getMusicVolume() { return 0; },
    next() {}, prev() {}, play() {}, pause() {}, toggle() {},
    tracks() { return []; },
    current() { return { index: -1, id: null, title: null, playing: false }; },
    info() { return { stub: true, playing: false, tracks: 0 }; },
  };
  return stub;
}
