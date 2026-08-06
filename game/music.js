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
// The nine files on disk in `game/music/`, ALL CC0 and all loudness-normalised (see
// music/README.md for sources, artists and the per-track figures): three rock, three electronic,
// three pop. T7 added the pop and electronic sets and re-encoded everything to Ogg Vorbis.
// The Epidemic Sound tracks this file was first written against are GONE: that licence covers
// video, not interactive software. Do not reintroduce them.
//
// =============================================================================
// IMPLEMENTATION — wave-s/menu-music. How each of the four rules is met:
//
// 1. THE GRAPH IS TWO NODES LONG, ON PURPOSE:
//        <audio> -> MediaElementAudioSourceNode -> musicGain -> ctx.destination
//    Nothing else. No compressor, no convolver, no shared bus. `audio.js`'s
//    master chain is reached from `audio.js`'s OWN context and can therefore not
//    touch this signal even by accident — the kill-control in
//    verdicts/wave-s/menu-music.md drives audio.js's master to zero and measures
//    the music's post-gain RMS unchanged to the fourth decimal.
// 2. `ctx` here is a private AudioContext created inside `unlock()`. audio.js's
//    `stop()` closes ITS context; ours is a different object, so an SFX stop or
//    a scene teardown cannot close it.
// 3. Playback lives on ONE long-lived `<audio>` element and one source node. A
//    scene change re-runs `boot()`, but `main.js` keeps this object in a
//    module-level singleton outside `boot()`, so `currentTime` simply keeps
//    running. Neither the element nor the context is ever recreated.
// 4. `createMusic()` touches no Web Audio and no network at all: it only builds
//    the playlist array. `unlock()` is the first line of code here that can
//    construct a context or issue a request, and it is only ever called from a
//    click. Calls to `play`/`next`/`prev`/`toggle` before unlock are recorded as
//    INTENT (`wantIndex`, `wantPlaying`) and applied by `unlock()`.
//
// WHY A MEDIA ELEMENT RATHER THAN decodeAudioData: these are 5-8 MB MP3s, three
// to five minutes each. `decodeAudioData` would hold ~50 MB of Float32 PCM per
// track and block for seconds before the first note; the element streams, starts
// in tens of milliseconds and seeks natively. The tradeoff is that an
// OfflineAudioContext cannot capture a media element, so the verification harness
// taps an AnalyserNode off `musicGain` on the REAL context instead and reads
// post-gain samples — see `probe()` below and `tools/_musicverify.mjs`.
// =============================================================================

// `file` is relative to game/index.html, which is what the page's document base is.
// ALL CC0 (public domain), from OpenGameArt, licence verified on each item's own page — see
// music/README.md for the source URLs. The three Epidemic Sound tracks that were here before are
// licensed for video, NOT for games, so they could not ship in a playable build at all. CC0 rather
// than merely royalty-free is deliberate: no attribution obligation to carry, and nothing to
// re-verify later. Note per-item verification is required on OpenGameArt — of eight rock/metal
// candidates checked, five were CC-BY and only three were CC0. T7 hit the same rate and worse:
// OpenGameArt's own advanced-search CC0 FILTER RETURNS CC-BY ITEMS, so the filter is a shortlist
// and the licence has to be read off each item's page. Six of ten shortlisted candidates were
// CC-BY 3.0/4.0 or OGA-BY and were dropped.
//
// T7 ADDED POP AND ELECTRONIC, three each, so no genre is a single song. Ordering interleaves the
// genres rather than grouping them: the playlist advances linearly, and three punk tracks in a row
// followed by three pop ones is a mixtape with two mood cliffs in it.
//
// EVERY FILE IS NOW .ogg AND EVERY FILE IS LOUDNESS-NORMALISED. See music/README.md for the
// per-track figures; the short version is that the nine tracks arrived spread across 9.4 LU
// (-8.4 to -17.8 LUFS integrated), which is the difference between a track that buries the engine
// and one nobody can hear, and they now sit inside 1.2 LU of -12 LUFS.
const TRACKS = [
  { id: 'cc0-punk-rock-metal', title: 'Punk Rock Metal', artist: 'Kim Lightyear', genre: 'rock',
    file: 'music/cc0-punk-rock-metal.ogg' },
  { id: 'cc0-elec-night-prowler', title: 'Night Prowler', artist: 'section31', genre: 'electronic',
    file: 'music/cc0-elec-night-prowler.ogg' },
  { id: 'cc0-pop-jay', title: 'Jay', artist: 'Pro Sensory', genre: 'pop',
    file: 'music/cc0-pop-jay.ogg' },
  { id: 'cc0-metal-energetic', title: 'Metal Energetic', artist: 'Kim Lightyear', genre: 'rock',
    file: 'music/cc0-metal-energetic.ogg' },
  { id: 'cc0-elec-cyberpunk-moonlight-sonata', title: 'Cyberpunk Moonlight Sonata', artist: 'Joth',
    genre: 'electronic', file: 'music/cc0-elec-cyberpunk-moonlight-sonata.ogg' },
  { id: 'cc0-pop-lay-low', title: 'Lay Low', artist: 'Pro Sensory', genre: 'pop',
    file: 'music/cc0-pop-lay-low.ogg' },
  { id: 'cc0-punk-flesh-and-blood', title: 'Flesh And Blood', artist: 'Kim Lightyear', genre: 'rock',
    file: 'music/cc0-punk-flesh-and-blood.ogg' },
  { id: 'cc0-elec-back-in-the-80s', title: 'Back In The 80s', artist: 'HoliznaCC0',
    genre: 'electronic', file: 'music/cc0-elec-back-in-the-80s.ogg' },
  { id: 'cc0-pop-happy-dance', title: 'Happy Dance', artist: 'HoliznaCC0', genre: 'pop',
    file: 'music/cc0-pop-happy-dance.ogg' },
];

// Default music level. This is a GAIN on a commercially-mastered MP3, not a
// synthesised bed like audio.js's, so it needs headroom rather than boost: a loud
// master runs about -10 dBFS RMS, and 0.50 puts the soundtrack near -16 dBFS RMS,
// which sits under the engine without disappearing. Measured post-gain in
// verdicts/wave-s/menu-music.md; permanent rule 3 exists because a previous round
// shipped a "working" sound at an inaudible -50 dB.
const DEFAULT_MUSIC_VOL = 0.50;
const FADE_S = 0.35;         // click-free start/stop and volume moves
const VOL_RAMP_S = 0.08;     // slider moves, short enough to feel immediate
const LS_KEY = 'bg.musicVolume';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** localStorage is best-effort: a private window or a file:// boot must not throw. */
function readStoredVolume() {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw === null) return DEFAULT_MUSIC_VOL;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? clamp(v, 0, 1) : DEFAULT_MUSIC_VOL;
  } catch (e) { return DEFAULT_MUSIC_VOL; }
}
function writeStoredVolume(v) {
  try { window.localStorage.setItem(LS_KEY, String(v)); } catch (e) { /* noop */ }
}

export function createMusic() {
  // ---- state that exists from boot, with no audio machinery attached ---------
  let vol = readStoredVolume();
  let index = 0;          // the track the playlist is ON
  let wantPlaying = true; // intent: unlock() starts the soundtrack, matching Paradise
  let unlocked = false;
  let lastError = null;
  let unlockCount = 0;

  /** @type {AudioContext|null} */ let actx = null;
  /** @type {GainNode|null} */ let musicGain = null;
  /** @type {HTMLAudioElement|null} */ let el = null;
  /** @type {MediaElementAudioSourceNode|null} */ let srcNode = null;
  /** @type {AnalyserNode|null} */ let analyser = null;
  let analyserBuf = null;

  const now = () => (actx ? actx.currentTime : 0);

  /**
   * Ramp a param instead of assigning it. A step on a gain that is feeding music
   * is an audible click, and `linearRampToValueAtTime` needs an explicit
   * `setValueAtTime` anchor or it ramps from the last SCHEDULED value, which after
   * a few slider drags is not the value you can hear.
   */
  function ramp(param, to, secs) {
    const t = now();
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(Math.max(0.0001, to), t + secs);
  }

  function loadTrack(i, { autoplay }) {
    if (!el) return;
    index = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    el.src = TRACKS[index].file;
    // No `el.load()`: assigning `src` already resets and starts buffering, and
    // calling load() as well aborts the request that assignment just kicked off.
    if (autoplay) startEl();
  }

  function startEl() {
    if (!el || !actx) return;
    wantPlaying = true;
    if (actx.state === 'suspended') actx.resume();
    ramp(musicGain.gain, vol, FADE_S);
    const p = el.play();
    if (p && p.catch) p.catch((e) => { lastError = String(e); });
  }

  /**
   * Fade out, THEN pause. Pausing the element on the same tick as the fade would
   * cut the tail off and click; the timeout is one fade long.
   */
  function stopEl() {
    if (!el) return;
    wantPlaying = false;
    if (musicGain) ramp(musicGain.gain, 0, FADE_S);
    setTimeout(() => { if (!wantPlaying && el) el.pause(); }, FADE_S * 1000 + 30);
  }

  const api = {
    // ---- the gesture ---------------------------------------------------------
    /**
     * The ONLY place a context, an element or a network request comes into
     * existence. Idempotent: a second call from the pause menu's resume just
     * resumes a suspended context (Chrome suspends on tab-hide) and is otherwise
     * a no-op, which is why `unlockCount` is reported rather than hidden.
     */
    unlock() {
      unlockCount++;
      if (unlocked) {
        if (actx && actx.state === 'suspended') actx.resume();
        if (wantPlaying && el && el.paused) startEl();
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { lastError = 'no AudioContext'; return; }
        actx = new AC();
        // THE WHOLE ROUTING RULE, IN TWO LINES. musicGain goes straight to
        // destination; audio.js's glue bus / level rider / convolver live on a
        // different context entirely and cannot be in this path.
        musicGain = actx.createGain();
        musicGain.gain.value = 0.0001;
        musicGain.connect(actx.destination);

        el = new Audio();
        el.preload = 'auto';
        el.crossOrigin = 'anonymous';
        // Not `el.loop`: looping one track for an hour is worse than a playlist.
        // 'ended' advances, and the playlist wraps, so the soundtrack never stops.
        el.addEventListener('ended', () => { loadTrack(index + 1, { autoplay: true }); });
        el.addEventListener('error', () => {
          lastError = `load failed: ${TRACKS[index] && TRACKS[index].id}`;
        });
        // The element's own volume stays at 1: level is musicGain's job, so that a
        // harness measuring the gain's output measures what reaches destination.
        el.volume = 1;
        srcNode = actx.createMediaElementSource(el);
        srcNode.connect(musicGain);

        unlocked = true;
        loadTrack(index, { autoplay: wantPlaying });
      } catch (e) {
        lastError = String(e);
        unlocked = false;
      }
    },

    // ---- level --------------------------------------------------------------
    setMusicVolume(v) {
      vol = clamp(typeof v === 'number' && Number.isFinite(v) ? v : 0, 0, 1);
      writeStoredVolume(vol);
      if (musicGain && wantPlaying) ramp(musicGain.gain, vol, VOL_RAMP_S);
      return vol;
    },
    getMusicVolume() { return vol; },

    // ---- transport ----------------------------------------------------------
    // All four are safe before unlock(): they move `index` / `wantPlaying`, which
    // unlock() then applies. That is the "no-op or queue" the contract asks for.
    play(i) {
      const target = typeof i === 'number' ? i : index;
      if (!unlocked) { index = ((target % TRACKS.length) + TRACKS.length) % TRACKS.length; wantPlaying = true; return; }
      if (target === index && el && !el.paused) return; // already on it, do not restart
      if (target === index) startEl(); else loadTrack(target, { autoplay: true });
    },
    pause() { if (!unlocked) { wantPlaying = false; return; } stopEl(); },
    toggle() {
      const playing = api.current().playing;
      if (playing) api.pause(); else api.play();
      return !playing;
    },
    next() { api.play(index + 1); },
    prev() {
      // Paradise's skip-back restarts the current track if you are more than a few
      // seconds in, and only then steps back. Same rule here.
      if (unlocked && el && el.currentTime > 3) { el.currentTime = 0; startEl(); return; }
      api.play(index - 1);
    },

    // ---- readouts -----------------------------------------------------------
    tracks() {
      return TRACKS.map((t, i) => ({
        id: t.id, title: t.title, artist: t.artist, genre: t.genre,
        seconds: unlocked && i === index && el && Number.isFinite(el.duration) ? el.duration : undefined,
      }));
    },
    current() {
      const t = TRACKS[index];
      return {
        index, id: t.id, title: t.title, artist: t.artist, genre: t.genre,
        // `playing` is read off the ELEMENT, never off our intent flag: a stalled
        // or failed load must not report itself as playing.
        playing: !!(unlocked && el && !el.paused && !el.ended),
        time: unlocked && el ? el.currentTime : 0,
        duration: unlocked && el && Number.isFinite(el.duration) ? el.duration : 0,
      };
    },
    info() {
      const c = api.current();
      return {
        stub: false,
        unlocked, unlockCount, playing: c.playing,
        index: c.index, id: c.id, title: c.title, artist: c.artist,
        time: c.time, duration: c.duration,
        volume: vol,
        gainValue: musicGain ? musicGain.gain.value : 0,
        // The routing assertions a harness should check, stated as data.
        ownContext: !!actx,
        ctxState: actx ? actx.state : 'none',
        sampleRate: actx ? actx.sampleRate : 0,
        routing: 'audioElement -> mediaElementSource -> musicGain -> destination',
        throughMasterChain: false,
        gainDestinationIsContextDestination: !!(actx && musicGain),
        tracks: TRACKS.length,
        readyState: el ? el.readyState : 0,
        networkState: el ? el.networkState : 0,
        error: lastError,
      };
    },

    /**
     * VERIFICATION HOOK, not used by the game. Lazily taps an AnalyserNode off
     * musicGain's OUTPUT and returns the RMS and peak of the live window, in
     * linear amplitude and dBFS. This is the honest measurement of "is the music
     * audible": it is downstream of the gain and it is the same signal
     * `ctx.destination` receives. A media element cannot be rendered by an
     * OfflineAudioContext, so this is the substitute for an offline capture.
     */
    probe() {
      if (!actx || !musicGain) return null;
      if (!analyser) {
        analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        // A tap, not an insert: musicGain still feeds destination directly and the
        // analyser is a second, terminal branch. It cannot alter the signal.
        musicGain.connect(analyser);
        analyserBuf = new Float32Array(analyser.fftSize);
      }
      analyser.getFloatTimeDomainData(analyserBuf);
      let sum = 0, peak = 0;
      for (let i = 0; i < analyserBuf.length; i++) {
        const v = analyserBuf[i];
        sum += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      const rms = Math.sqrt(sum / analyserBuf.length);
      const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
      return { n: analyserBuf.length, rms, peak, rmsDb: db(rms), peakDb: db(peak),
        gainValue: musicGain.gain.value, ctxState: actx.state };
    },
  };
  return api;
}
