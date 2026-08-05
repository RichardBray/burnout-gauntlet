// audio.js - AAA arcade-racer audio bed on raw WebAudio.
//
// Procedural first: an RPM-tracked harmonic engine stack with separate load/overrun
// voicings, gear-shift transients, a boost afterburner that sidechain-ducks the engine,
// slip-angle tyre scrub/squeal, speed-driven wind, a layered metal+glass impact synth,
// doppler/distance-panned rival engines, a synthesised convolution reverb with
// open/city/tunnel presets, and a master chain of a gentle glue bus (which impacts
// and the reverb return both bypass) into a slow level rider and a zero-time-constant
// waveshaper brickwall, so a 17 dB-crest impact survives peak control intact.
// The CC0 SFX in `sfx/` are layered on top when they decode; if they 404 the mix is
// unchanged apart from losing one layer.
//
// API - createAudio({enabled}) -> a
//   a.start()                       resume the context (MUST come from a user gesture)
//   a.stop()                        ramp out and close
//   a.update(dt, s)                 per-frame mix drive, see PARAMS below
//   a.crash(intensity, opts)        one-shot impact
//   a.gearShift(from, to, load)     one-shot shift transient (update() auto-fires it too)
//   a.boostHit(strength)            one-shot boost ignition (update() auto-fires it too)
//   a.setSpace(id)                  'open' | 'city' | 'tunnel'
//   a.setListener(pos, fwd, up, vel)
//   a.addRival(id, opts) / a.updateRival(id, s) / a.removeRival(id)
//   a.setEnabled(bool) / a.setVolume(0..1) / a.getVolume() / a.running / a.ready / a.info()
//
// THIS MODULE IS THE **SFX** SIDE OF THE MIX, AND `setVolume` IS THE SFX CONTROL.
// wave-s/menu-music added `game/music.js`, which owns the soundtrack on its OWN
// AudioContext with its own gain straight to `destination`. Music is deliberately NOT
// routed through the chain described above: the glue bus, the level rider and the
// per-space convolver are correct for an engine and wrong for a commercial master, and
// sharing them would duck the soundtrack under the exhaust and give it tunnel reverb.
// So `setVolume`/`getVolume` here move engine, tyres, wind, impacts and rivals ONLY, and
// the menu shows them under the label SFX beside a separate MUSIC slider.
//
// PARAMS for update(dt, s): rpm01, load, throttle, brake, handbrake, speed (m/s),
//   boost 0..1, boosting, slip 0..1, gear, airborne, wet 0..1, listener {pos,fwd,up,vel}.
//
// Screenshot mode passes enabled:false and gets a fully-shaped no-op object back, so
// tools/shot.mjs never constructs an AudioContext, never fetches, and never throws.

const SPEED_OF_SOUND = 343;

// ---------------------------------------------------------------------------
// no-op shim (headless / unsupported) - same shape as the real thing
// ---------------------------------------------------------------------------
function makeNoop() {
  const f = () => {};
  return {
    get running() { return false; },
    get suspended() { return true; },
    get ctx() { return null; },
    ready: Promise.resolve(false),
    enabled: false,
    start: f, stop: f, update: f, crash: f, pass: f, gearShift: f, boostHit: f,
    // Same shape as the real api: -1 means "nothing was built". main.js calls this at boot.
    prewarm: () => -1,
    setSpace: f, setListener: f, setEnabled: f, setVolume: f, getVolume: () => 0,
    addRival: () => null, updateRival: f, removeRival: f,
    info: () => ({ mode: 'noop', running: false, state: 'closed', space: 'open', samples: 0, rivals: 0, sampleRate: 0 }),
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const centsOf = (ratio) => 1200 * Math.log2(Math.max(1e-4, ratio));

/** Deterministic LCG so a given session always sounds the same. */
function makeRandom(seed = 0x9e3779b9) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Ramp an AudioParam without ever producing a discontinuity. */
function ramp(param, value, now, tc = 0.05) {
  if (tc <= 0) param.setValueAtTime(value, now);
  else param.setTargetAtTime(value, now, tc);
}

export function createAudio({ enabled = true, volume = 0.62, space = 'city' } = {}) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!enabled || !AC) return makeNoop();

  // -------------------------------------------------------------------------
  // state
  // -------------------------------------------------------------------------
  let ctx = null;
  let running = false;
  let built = false;
  let masterVol = volume;
  let muted = false;
  let curSpace = SPACES_HAS(space) ? space : 'city';
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });

  const R = makeRandom(0x5eed17);
  // The IRs get their OWN stream. They used to draw one sample per IR sample from the
  // shared R, so any change to a reverb preset reshuffled every voice built after it
  // (per-cylinder firing skew, noise-loop start offsets, tap scatter) and showed up as
  // a spurious engine "regression".
  const RIR = makeRandom(0x13ecb0);
  const samples = Object.create(null);   // name -> AudioBuffer
  const rivals = new Map();
  const irs = Object.create(null);
  const buses = [];

  let noiseWhite = null, noisePink = null;
  let master, clip, limiter, glue, preMaster, fxDirect, convolver, revReturn, revLP, revHP, revShelf;
  let engine = null, boostVoice = null, tyreVoice = null, windVoice = null;
  let busEngine, busBoost, busTyre, busWind, busWorld, busFx;

  // per-frame edge-detect state
  const prev = { load: 0, gear: 0, boost: 0, slip: 0, rpm01: 0, speed: 0, inited: false };
  let overrunTimer = 0;

  // ===========================================================================
  // buffers
  // ===========================================================================
  function makeNoise(seconds, pink) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      // Voss-McCartney-ish pink via a cascade of one-poles
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = R() * 2 - 1;
        if (!pink) { d[i] = w; continue; }
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return b;
  }

  /**
   * Synthesised impulse response.
   *
   * The late field is a Schroeder/FDN reverberator rendered offline: eight
   * mutually-prime delay lines mixed by a normalised Hadamard matrix, each with a
   * one-pole damper in its feedback path, followed by a four-stage Schroeder
   * all-pass diffuser. The delay set, the all-pass set and the excitation noise
   * are drawn INDEPENDENTLY per channel, so the two tails decorrelate instead of
   * being one shared noise burst scaled by a `width` knob (which is why the old
   * tunnel tail sat at 0.91 inter-channel correlation).
   *
   * Levelling is explicit and is the whole point of this rewrite. `convolver.
   * normalize` is off (see buildMaster), so nothing divides the IR by its own
   * power any more. Instead the *late field alone* is normalised to unit L2 norm
   * in every space. A unit-norm IR convolved with a source of RMS r returns wet
   * of RMS r, so the direct-to-reverberant ratio of a bus is
   * `send x revReturn x ||h||` - a 0.7 s room and a 3.6 s tunnel are levelled
   * identically and only their *shape* differs. Early reflections are then added
   * on top at `tapGain` times the late field's norm, so the tunnel's flutter comb
   * keeps a fixed, audible relationship to its own tail.
   *
   * CAREFUL: those taps are why `||h||` is in that expression and is not 1. The
   * whole IR's norm is sqrt(1 + tapGain^2), so tapGain 2.6 is +8.9 dB of wet, not
   * a shape change - raising it without dividing `revReturn` back down puts nine
   * decibels into the bed and eats the impact headroom the output stage exists to
   * protect. `revReturn` is calibrated against the product, not on its own.
   *
   * Previously WebAudio's equal-power normalisation divided each IR by its total
   * power, scaling the long dense tunnel IR down by very nearly the same factor
   * its send was scaled up: the two cancelled and all three spaces rendered as
   * the same room (0.23 dB apart over a 40-band envelope).
   */
  function makeIR({ seconds, rt60, size = 1, hfDamp = 0.5, width = 0.9,
    predelay = 0.005, taps = [], tapGain = 0.5, buildUp = 0, fadeOut = 0.12 }) {
    const sr = ctx.sampleRate;
    const n = Math.max(64, Math.floor(sr * seconds));
    const buf = ctx.createBuffer(2, n, sr);
    const pd = Math.floor(predelay * sr);
    const burstN = Math.max(2, Math.round(sr * 0.0025));
    const a = clamp(hfDamp, 0.03, 1);            // feedback damper, 1 = no damping

    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);

      // --- FDN core -------------------------------------------------------
      const lens = new Int32Array(FDN_N);
      const fb = new Float32Array(FDN_N);
      const lines = [];
      for (let j = 0; j < FDN_N; j++) {
        lens[j] = nextPrime(FDN_RATIOS[c][j] * FDN_BASE * size * sr);
        lines.push(new Float32Array(lens[j]));
        // per-line feedback for the requested RT60, corrected for the damper's
        // broadband loss so short/long lines still decay at the same rate
        fb[j] = Math.pow(10, (-3 * lens[j]) / (sr * Math.max(0.05, rt60)));
      }
      const idx = new Int32Array(FDN_N);
      const damp = new Float32Array(FDN_N);
      const v = new Float32Array(FDN_N);
      const sgn = [];
      for (let j = 0; j < FDN_N; j++) sgn.push(RIR() < 0.5 ? -1 : 1);

      for (let i = 0; i < n; i++) {
        let inSig = 0;
        if (i >= pd && i < pd + burstN) {
          const k = i - pd;
          inSig = (k === 0 ? 1 : 0) + (RIR() * 2 - 1) * Math.exp(-k / (burstN * 0.4)) * 0.8;
        }
        let s = 0;
        for (let j = 0; j < FDN_N; j++) { v[j] = lines[j][idx[j]]; s += v[j]; }
        d[i] = s * FDN_NORM;
        fwht(v);
        for (let j = 0; j < FDN_N; j++) {
          const x = v[j] * FDN_NORM * fb[j] + inSig * sgn[j];
          damp[j] += a * (x - damp[j]);
          lines[j][idx[j]] = damp[j];
          idx[j] = idx[j] + 1 === lens[j] ? 0 : idx[j] + 1;
        }
      }

      // --- per-channel all-pass diffusion ---------------------------------
      for (const ms of AP_MS[c]) allpassInPlace(d, nextPrime(ms * 1e-3 * Math.sqrt(size) * sr), 0.68);

      // --- diffuse-field build-up -----------------------------------------
      // A large space's diffuse field takes time to establish: energy has to make
      // several wall crossings before it is spread. Modelling that keeps the tunnel's
      // wet out of the first ~100 ms, which is exactly what separates a big diffuse
      // room (low clarity) from a small bright one at the same wet LEVEL.
      const bu = Math.max(0, buildUp) * sr;
      if (bu > 1) {
        for (let i = pd; i < n && i < pd + bu; i++) {
          const u = (i - pd) / bu;
          d[i] *= u * u;
        }
      }

      // --- tail fade ------------------------------------------------------
      // The IR buffer has to end somewhere; a hard cut on a still-audible tail is a
      // step discontinuity and clicks. A raised-cosine fade over the last `fadeOut`
      // of the buffer lets a space run a long, nearly flat RT60 (a real road tunnel
      // is 5-8 s) inside a buffer we can actually afford to convolve, and the fade
      // itself becomes the end of the decay.
      const fo = Math.round(clamp(fadeOut, 0, 0.9) * n);
      for (let i = n - fo; i < n; i++) {
        if (i < 0) continue;
        const u = (i - (n - fo)) / fo;
        d[i] *= 0.5 * (1 + Math.cos(Math.PI * u));
      }

      // --- normalise the LATE FIELD to unit L2, then lay the taps on top ----
      let e = 0;
      for (let i = 0; i < n; i++) e += d[i] * d[i];
      const k = 1 / Math.sqrt(Math.max(1e-12, e));
      for (let i = 0; i < n; i++) d[i] *= k;

      let te = 0;
      for (const [, g] of taps) te += g * g;
      const tk = te > 0 ? (tapGain * (c === 0 ? 1 : width)) / Math.sqrt(te) : 0;
      const skew = c === 0 ? 0 : 13;             // few-sample L/R skew on the comb
      for (const [tt, g] of taps) {
        const i = pd + skew + Math.floor(tt * sr);
        // the comb rides the same build-up, so the flutter swells in rather than
        // slapping straight onto the transient
        const u = bu > 1 ? Math.min(1, (i - pd) / bu) : 1;
        if (i < n) d[i] += g * tk * u * u;
      }
    }
    return buf;
  }

  // ===========================================================================
  // node sugar
  // ===========================================================================
  function mkGain(v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function mkFilt(type, freq, q, dest) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    if (dest) f.connect(dest);
    return f;
  }
  function loopNoise(pink, dest, g = 1) {
    const s = ctx.createBufferSource();
    s.buffer = pink ? noisePink : noiseWhite;
    s.loop = true;
    s.loopEnd = s.buffer.duration - 0.05;
    const out = mkGain(g, dest);
    s.connect(out);
    s.start(ctx.currentTime + R() * 0.05);
    return { src: s, gain: out };
  }
  function shaperCurve(drive) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return c;
  }

  /**
   * Brickwall curve for the output stage: exactly linear below `t`, then a tanh
   * knee asymptotic to `L`. A WaveShaper has NO time constants at all, which is
   * the whole reason it is here - see buildMaster.
   */
  function clipCurve(t, L) {
    const n = 8192, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      const y = a <= t ? a : t + (L - t) * Math.tanh((a - t) / (L - t));
      c[i] = x < 0 ? -y : y;
    }
    return c;
  }

  // ===========================================================================
  // master chain + reverb
  // ===========================================================================
  //
  // Output stage. The round-5 chain was a -20 dB / 3.2:1 glue compressor into a
  // 2 ms / 20:1 feed-forward "brickwall", and it destroyed impact: the engine bed
  // alone runs about -12 dB RMS, so the mix sat 8-10 dB INSIDE the glue threshold
  // permanently and every transient arrived pre-squashed, while the 2 ms limiter
  // attack caught the crash's own 30 ms rise. A 17.5 dB-crest crash measured
  // -0.4 dB of punch over the bed once it was in the mix, and the short-term
  // envelope stayed 2-4 dB BELOW its pre-impact level for a second afterwards -
  // audible pumping instead of a hit.
  //
  // Three changes, in order of how much they matter:
  //
  //   1. `clip` - peak control is now a WaveShaper, not a compressor. A shaper has
  //      no attack, no release and no program dependence whatsoever: a transient
  //      is either under the knee (untouched, bit-exact) or shaved instantly, and
  //      nothing that follows it is ducked. Below CLIP_KNEE the curve is exactly
  //      y = x, so the whole bed passes through linear and only the top of an
  //      impact ever meets the knee. 4x oversampling keeps the shaved peak from
  //      aliasing. This is what lets a 15 dB crest survive peak control.
  //   2. `limiter` is demoted to a slow LEVEL RIDER - 50 ms attack, so it cannot
  //      react inside a crash transient at all, and a high threshold so it only
  //      engages on sustained overload. Fast peak duty belongs to `clip`.
  //   3. `glue` is lifted to -8 dB / 1.8:1 with a 30 ms attack, which puts the bed
  //      at the knee instead of ten dB inside it, and `busFx` (impacts) now
  //      bypasses it entirely through `fxDirect`, exactly as the reverb return
  //      already did. An impact therefore reaches the output stage with its own
  //      dynamics intact and does not modulate the bed on the way.
  //
  // Note the node ORDER: the two safety stages are now AFTER the master volume
  // gain, not before it, so both of their thresholds are in true dBFS. Round 5 had
  // them upstream of a 0.62 volume gain, which meant a peak measuring -1 dBFS at
  // the output was hitting the limiter at +4 dBFS and eating 5 dB of gain reduction
  // with a 300 ms release - most of the post-impact sag came from that alone.
  const CLIP_KNEE = 0.68;    // -3.3 dBFS: everything below this is bit-exact
  const CLIP_CEIL = 0.995;
  // Headroom budget. The bed (engine/tyre/wind/boost/rivals) is trimmed so its own
  // peaks land around -10 dBFS, which is what leaves room for an impact to stand
  // 8-10 dB proud of it instead of both being pinned at the ceiling. The mix runs
  // quieter than round 5 by design - the loudness went into crest factor.
  // BED_TRIM sits on the DRY path only, so it is also applied to `revReturn` (below)
  // and divided back out of busFx's send - otherwise trimming the bed would silently
  // make every space ten dB wetter and every impact ten dB drier.
  const BED_TRIM = 0.22;
  const FX_DIRECT = 1.0;

  function buildMaster() {
    clip = ctx.createWaveShaper();                 // instantaneous brickwall, last
    clip.curve = clipCurve(CLIP_KNEE, CLIP_CEIL);
    clip.oversample = '4x';
    clip.connect(ctx.destination);

    limiter = ctx.createDynamicsCompressor();      // slow level rider, NOT a peak limiter
    limiter.threshold.value = -3; limiter.knee.value = 6;
    limiter.ratio.value = 4; limiter.attack.value = 0.05; limiter.release.value = 0.30;
    limiter.connect(clip);

    master = mkGain(0.0);                          // volume + fade, sums the whole mix
    master.connect(limiter);

    glue = ctx.createDynamicsCompressor();         // gentle bus glue, bed sits at the knee
    glue.threshold.value = -8; glue.knee.value = 6;
    glue.ratio.value = 1.8; glue.attack.value = 0.030; glue.release.value = 0.25;
    glue.connect(master);

    preMaster = mkGain(BED_TRIM, glue);
    // Impacts skip the glue bus and land on the master sum directly.
    fxDirect = mkGain(FX_DIRECT, master);

    convolver = ctx.createConvolver();
    // OFF, deliberately. See makeIR: equal-power normalisation divides by the IR's
    // total power, which cancelled the per-space send differences almost exactly.
    convolver.normalize = false;
    // The wet return skips the glue bus compressor and lands straight on the
    // master sum. Feeding it through the glue meant every dry transient ducked the
    // tail by the same amount it excited it, which flattened the difference between
    // a 0.3 s shoulder and a 4 s tunnel to a couple of dB no matter what the send
    // was. Parallel-wet is also just better practice: the room stops pumping.
    revReturn = mkGain(SPACES[curSpace].revReturn * BED_TRIM, master);
    revLP = mkFilt('lowpass', SPACES[curSpace].lp, 0.7, revReturn);
    // Per-space return high-pass. This is the knob that finally separates city from
    // open: a facade 5-10 m away reflects HF almost perfectly but is far too small
    // to return anything below a couple of hundred Hz, so a street canyon's wet is a
    // BRIGHT, thin shimmer sitting on top of a dry engine, where a tunnel's is a
    // dark bass-heavy roar. Doing it with the low-shelf alone needed absurd gains and
    // still muddied the engine's body; a real high-pass moves the bands cleanly and
    // leaves the 60-300 Hz exhaust untouched.
    revHP = mkFilt('highpass', SPACES[curSpace].hp, 0.6, revLP);
    revShelf = mkFilt('lowshelf', 240, undefined, revHP);
    revShelf.gain.value = SPACES[curSpace].shelf;
    convolver.connect(revShelf);
    for (const id of Object.keys(SPACES)) {
      irs[id] = makeIR({ ...SPACES[id].ir, taps: SPACES[id].ir.taps() });
    }
    convolver.buffer = irs[curSpace];
  }

  /**
   * Every source routes through one of these dry+send pairs. `sendAmt` is now the
   * bus's *relative* contribution to the reverb only - the absolute wet level is
   * the per-space `revReturn`, so a space change moves one gain instead of six.
   */
  function makeBus(sendAmt = 1, dryDest = null) {
    const input = mkGain(1.0);
    const dry = mkGain(1.0, dryDest || preMaster);
    const send = mkGain(sendAmt, convolver);
    input.connect(dry); input.connect(send);
    const b = { input, dry, send, sendAmt };
    buses.push(b);
    return b;
  }

  // ===========================================================================
  // engine voice (reused for the player car and for every rival)
  // ===========================================================================
  //
  // Source-filter model, NOT a harmonic comb. A real exhaust is a jittered train
  // of combustion events (broadband, dense, only quasi-periodic) excited into a
  // set of *stationary* pipe/cabin resonances. The pitch of the excitation slides
  // with rpm; the resonances do not move at all. Everything below follows from
  // that split:
  //
  //   excitation  pulse-train wavetable (one band-limited combustion event per
  //               cylinder per cycle, with per-cylinder firing-order skew and
  //               compression imbalance plus +/-3.5% timing and +/-4% amplitude
  //               jitter per event) resampled by playbackRate, backed by a
  //               sub-firing-order sine/triangle bank and a combustion noise bed
  //               that fills the inter-harmonic gaps
  //   body        a FIXED formant bank at 80 / 165 / 300 / 1100 Hz - only the
  //               peak gains breathe with load, the centre frequencies never move
  //   drive       saturation sits AFTER the body, so the boosted low orders
  //               generate their own upper harmonics instead of us having to
  //               synthesise isolated high partials
  //
  // Consequence: the low-frequency body stays put from idle to redline instead of
  // the whole comb translating up out of the bottom two octaves.

  const PULSE_CYCLES = 32;    // engine cycles baked into one seamless loop
  const PULSE_BASE_HZ = 25;   // engine-cycle rate the wavetable is authored at
  const pulseBanks = Object.create(null);

  /**
   * Wavetable of `PULSE_CYCLES` four-stroke engine cycles for a given cylinder
   * count, plus a matching control-rate gate envelope. Because the jitter is
   * baked over 32 cycles the loop point is sub-audio and the spectrum is dense
   * and inharmonic rather than a clean integer comb.
   */
  function makePulseBank(cylinders) {
    const key = 'c' + cylinders;
    if (pulseBanks[key]) return pulseBanks[key];
    const sr = ctx.sampleRate;
    const n = Math.round((sr * PULSE_CYCLES) / PULSE_BASE_HZ);
    const pulse = ctx.createBuffer(1, n, sr);
    const gate = ctx.createBuffer(1, n, sr);
    const P = pulse.getChannelData(0);
    const G = gate.getChannelData(0);

    const spacing = n / (PULSE_CYCLES * cylinders);   // samples between firings
    const tauP = spacing * 0.22;                      // pressure-pulse decay
    const tauN = spacing * 0.38;                      // turbulence decay
    const tauG = spacing * 0.55;                      // gate decay
    const atk = Math.max(1, spacing * 0.02);
    const evLen = Math.ceil(tauN * 5);
    const gLen = Math.ceil(tauG * 5);

    // fixed per-cylinder character: firing-order timing skew + compression imbalance
    const skew = [], bal = [];
    for (let c = 0; c < cylinders; c++) {
      skew.push((R() * 2 - 1) * 0.055);
      bal.push(1 + (R() * 2 - 1) * 0.10);
    }

    for (let cyc = 0; cyc < PULSE_CYCLES; cyc++) {
      for (let c = 0; c < cylinders; c++) {
        const at = (cyc * cylinders + c + skew[c] + (R() * 2 - 1) * 0.035) * spacing;
        const amp = bal[c] * (1 + (R() * 2 - 1) * 0.04);
        const i0 = Math.floor(at);
        let nz = 0;
        for (let k = 0; k < evLen; k++) {
          const a = 1 - Math.exp(-k / atk);
          nz = nz * 0.7 + (R() * 2 - 1) * 0.3;
          // wrap so the loop joint is seamless
          P[(i0 + k) % n] += amp * (a * Math.exp(-k / tauP) + nz * a * Math.exp(-k / tauN) * 0.6);
        }
        for (let k = 0; k < gLen; k++) {
          const i = (i0 + k) % n;
          const v = amp * (1 - Math.exp(-k / atk)) * Math.exp(-k / tauG);
          if (v > G[i]) G[i] = v;
        }
      }
    }

    // circular one-pole smoothing (warm-up pass first so the loop joint matches)
    const smooth = (buf, fc, passes) => {
      const k = Math.exp((-2 * Math.PI * fc) / sr);
      for (let p = 0; p < passes; p++) {
        let z = 0;
        for (let i = 0; i < n; i++) z = buf[i] + k * (z - buf[i]);
        for (let i = 0; i < n; i++) { z = buf[i] + k * (z - buf[i]); buf[i] = z; }
      }
    };
    smooth(P, 8000, 2);          // band-limit: playbackRate tops out near 2.6x
    let mean = 0;
    for (let i = 0; i < n; i++) mean += P[i];
    mean /= n;
    let pk = 1e-6;
    for (let i = 0; i < n; i++) { P[i] -= mean; pk = Math.max(pk, Math.abs(P[i])); }
    for (let i = 0; i < n; i++) P[i] *= 0.9 / pk;
    smooth(G, 3000, 1);
    let gp = 1e-6;
    for (let i = 0; i < n; i++) gp = Math.max(gp, G[i]);
    for (let i = 0; i < n; i++) G[i] /= gp;

    pulseBanks[key] = { pulse, gate };
    return pulseBanks[key];
  }

  // Sub-firing-order partials. 0.25x/0.5x of the firing rate are crank order and
  // half-engine order; the 0.125x member keeps something in the 40-120 Hz window
  // at redline and the 1.0x member does the same at idle.
  const SUB_ORDERS = [0.125, 0.25, 0.5, 1.0];
  const SUB_CENTRE = 130;       // Hz - centre of the fixed "body" window
  const SUB_WIDTH = 0.95;       // octaves (gaussian sigma in log2 space)

  // Fixed exhaust-box / cabin formants. f and q are constant for all time.
  const FORMANTS = [
    { f: 80, q: 1.0, g0: -3.0, g1: 3.0 },
    { f: 165, q: 1.3, g0: 0.0, g1: 10.0 },
    { f: 300, q: 1.8, g0: 8.0, g1: 9.0 },
    { f: 1100, q: 1.1, g0: 7.0, g1: 2.0 },
  ];

  function makeEngineVoice(dest, { cylinders = 8, idle = 780, redline = 7600, detune = 0 } = {}) {
    const bank = makePulseBank(cylinders);
    const out = mkGain(1.0, dest);
    const duck = mkGain(1.0, out);                       // boost sidechain
    const post = mkFilt('lowpass', 3000, 0.6, duck);     // tailpipe / air absorption
    const shaper = ctx.createWaveShaper();
    shaper.curve = shaperCurve(2.6); shaper.oversample = '2x';
    shaper.connect(post);
    const driveIn = mkGain(1.0, shaper);                 // saturation AFTER the body

    // fixed formant bank, wired 1100 -> 300 -> 165 -> 80 back from the drive
    let node = driveIn;
    const forms = [];
    for (let i = FORMANTS.length - 1; i >= 0; i--) {
      const p = FORMANTS[i];
      const f = mkFilt('peaking', p.f, p.q, node);
      f.gain.value = p.g0;
      forms.unshift(f);
      node = f;
    }
    const hp2 = mkFilt('highpass', 60, 0.7, node);
    const hp1 = mkFilt('highpass', 60, 0.7, hp2);
    const bodyIn = mkGain(1.0, hp1);

    const startAt = ctx.currentTime + 0.005 + R() * 0.02;

    const subSum = mkGain(1.0, bodyIn);
    const subs = SUB_ORDERS.map((m, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = 60;
      o.detune.value = detune + (i % 2 ? 7 : -7);
      const g = mkGain(0, subSum);
      o.connect(g); o.start(startAt);
      return { o, g, m };
    });

    const pulseSrc = ctx.createBufferSource();
    pulseSrc.buffer = bank.pulse; pulseSrc.loop = true;
    const pulseG = mkGain(0.0, bodyIn);
    pulseSrc.connect(pulseG); pulseSrc.start(startAt);

    // combustion bed - broadband energy between the firing orders
    const bed = loopNoise(true, null, 1.0);
    const bedBP = mkFilt('lowpass', 700, 0.55, bodyIn);
    const bedG = mkGain(0.0, bedBP); bed.gain.connect(bedG);

    // Valvetrain / injector clatter, amplitude-modulated by the *same* jittered
    // firing schedule via the gate wavetable. Bypasses the body so a cold idle
    // keeps its bright mechanical rattle instead of turning to mud.
    const clatter = loopNoise(false, null, 1.0);
    const clatterAM = mkGain(0.25);
    const clatterBP = mkFilt('bandpass', 1900, 0.5, duck);
    const clatterOut = mkGain(0.0, clatterBP);
    clatter.gain.connect(clatterAM); clatterAM.connect(clatterOut);
    const gateSrc = ctx.createBufferSource();
    gateSrc.buffer = bank.gate; gateSrc.loop = true;
    const gateDepth = mkGain(0.9);
    gateSrc.connect(gateDepth); gateDepth.connect(clatterAM.gain);
    gateSrc.start(startAt);

    const nyq = ctx.sampleRate * 0.45;
    let dop = 0;                                          // doppler, cents

    return {
      out, duck,
      detune(c) { dop = c; },
      set(now, { rpm01 = 0, load = 0, gainMul = 1, tc = 0.04 }) {
        const rpm = idle + rpm01 * (redline - idle);
        const fire = (rpm / 60) * (cylinders / 2);        // 4-stroke firing rate
        const ratio = Math.pow(2, (detune + dop) / 1200);

        // one wavetable pass per engine cycle; the gate tracks it sample-locked
        const rate = clamp(((rpm / 120) / PULSE_BASE_HZ) * ratio, 0.05, 4);
        ramp(pulseSrc.playbackRate, rate, now, tc);
        ramp(gateSrc.playbackRate, rate, now, tc);

        // Sub-order bank. The weights are a gaussian window on *absolute*
        // frequency, so which order carries the body changes with rpm while the
        // body itself stays in the 40-120 Hz region. Normalising by the weight
        // sum keeps the level steady as orders hand over.
        let wsum = 0;
        const w = [];
        for (const s of subs) {
          const f = fire * s.m * ratio;
          const lg = Math.log2(Math.max(8, f) / SUB_CENTRE) / SUB_WIDTH;
          const v = Math.exp(-0.5 * lg * lg) * clamp((f - 28) / 22, 0, 1);
          w.push(v); wsum += v;
        }
        const subLvl = (0.08 + 0.52 * Math.pow(rpm01, 0.7)) * (0.35 + 0.65 * load) * gainMul;
        const kw = subLvl / Math.max(0.5, wsum);
        for (let i = 0; i < subs.length; i++) {
          ramp(subs[i].o.frequency, clamp(fire * subs[i].m * ratio, 8, nyq), now, tc);
          ramp(subs[i].g.gain, w[i] * kw, now, 0.06);
        }

        ramp(pulseG.gain, (0.55 + load * 0.45) * gainMul, now, 0.06);
        ramp(bedG.gain, (0.16 + load * 0.40 + (1 - rpm01) * 0.08) * gainMul, now, 0.06);
        ramp(bedBP.frequency, 380 + rpm01 * 260 + load * 320, now, 0.08);

        ramp(clatterOut.gain, (0.07 + (1 - rpm01) * 0.40) * (0.55 + load * 0.45) * gainMul, now, 0.07);
        ramp(clatterBP.frequency, 1000 + (1 - rpm01) * 800 + load * 400, now, 0.08);

        // formant CENTRES never move - only how hard each one is driven
        for (let i = 0; i < forms.length; i++) {
          const p = FORMANTS[i];
          ramp(forms[i].gain, p.g0 + (p.g1 - p.g0) * rpm01, now, 0.1);
        }
        const hpf = 175 - rpm01 * 78;   // idle is a mid-forward rattle, not a boom
        ramp(hp1.frequency, hpf, now, 0.1);
        ramp(hp2.frequency, hpf, now, 0.1);

        ramp(driveIn.gain, 0.7 + load * 0.9 + rpm01 * 0.3, now, 0.07);
        ramp(post.frequency, 1500 + rpm01 * 800 + load * 900, now, 0.06);
        ramp(out.gain, gainMul * (0.30 + load * 0.28 + rpm01 * 0.14), now, 0.06);
      },
      dispose(now) {
        ramp(out.gain, 0, now, 0.08);
        setTimeout(() => {
          const all = [...subs.map((x) => x.o), pulseSrc, gateSrc, bed.src, clatter.src];
          for (const n of all) { try { n.stop(); } catch (e) { /* already stopped */ } }
          try { out.disconnect(); } catch (e) { /* noop */ }
        }, 400);
      },
    };
  }

  // ===========================================================================
  // boost / tyres / wind
  // ===========================================================================
  //
  // Boost / afterburner.
  //
  // Every stage is wired in SERIES. A filter constructed with mkFilt(..., dest)
  // is already connected to dest, so feeding it afterwards with `x.connect(f)`
  // inserts it *before* f in the chain - it never makes a parallel branch. The
  // jet hiss chain reads:
  //
  //   pink noise -> jetG -> jetF (bandpass) -> jetPk (peaking) -> jetLP (2-pole
  //                 lowpass, ~3.8-5.0 kHz) -> out -> input -> hp1 -> hp2 -> bus
  //
  // so the bandpass genuinely band-limits the hiss instead of being bypassed.
  // The source is pink (-3 dB/oct) rather than white, which lands the sustained
  // jet near the reference recordings' ~2.3 kHz centroid instead of 6.5 kHz.
  //
  // `input` is the public entry for the whole boost bus - the boostHit and
  // gear-shift one-shots go through it too, so they share the 24 dB/oct 58 Hz
  // high-pass. Boost lives above the engine's sub range; both references are
  // 30+ dB down by 30 Hz and letting the whoosh rumble down there only muds the
  // mix. `out` carries the sustained voice's amplitude contour (fast attack,
  // exponential fall into a lower sustain) so boost reads as an event rather
  // than a static wall of noise.
  function buildBoost(destBus) {
    const hp2 = mkFilt('highpass', 72, 0.7, destBus.input);
    const hp1 = mkFilt('highpass', 72, 0.7, hp2);
    const input = mkGain(1.0, hp1);
    // Trim for the SUSTAINED voice only - the boostHit / gear-shift one-shots enter
    // at `input` and deliberately do not get it. Measured in the busy scene, the
    // afterburner used to sit ~30 dB under the engine bed, so pressing boost only
    // ever showed up as the sidechain duck it triggers: +boost measured -1.05 dB
    // against the engine-only bed, i.e. Burnout's signature sound made the mix
    // QUIETER. Anything below roughly -24 dB rms in that window cannot even pay
    // back its own duck. This is the level knob; SUSTAIN below is the shape knob.
    const BODY = 14.0;
    const body = mkGain(BODY, input);
    const out = mkGain(0.0, body);
    // Held boost is a sustained afterburner, not a one-shot with a tail. At the old
    // 0.22 the contour was 13 dB down inside a second, which put the whole spectral
    // sweep below (see SWEEP_TC) after the level had already collapsed - the sweep
    // scored well only because band-share and centroid are ratios and so level-blind.
    const SUSTAIN = 0.60;      // -4.4 dB below the ignition peak
    const DECAY_TC = 0.34;     // s, exponential fall from peak into the sustain
    const REL_TC = 0.09;       // s, fall to silence when boost lets go
    let gate = false;
    let env = 0;               // contour, integrated per frame so the sidechain can share it
    // Sweep contour. Still NOT `env` - the amplitude contour settles inside ~1 s and
    // the reference whoosh keeps brightening past that - but no longer 3x slower than
    // the level it rides on: at 0.45 s the 6th-power climb is half done ~1.0 s after
    // ignition, which is where boost-whoosh-01's own 1928 -> 2837 Hz climb sits.
    const SWEEP_TC = 0.45;
    let swp = 0;

    // Gusting: two mutually prime LFOs on the contour gain so the held bed never
    // settles onto one level. Without this the sustain is a flat wall of noise.
    const gustD = mkGain(0.0);
    gustD.connect(out.gain);
    for (const [hz, amt] of [[0.63, 0.62], [1.37, 0.38]]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = hz;
      const g = mkGain(amt, gustD); o.connect(g); o.start();
    }

    // Broadband low/mid bed. Wide enough (58 Hz - ~600 Hz) to fill in between the
    // roar cluster's partials; both references are smooth and hot through there.
    const rumble = loopNoise(true, null, 1.0);
    const rumbleF = mkFilt('lowpass', 420, 0.7, out);
    const rumbleG = mkGain(0.0, rumbleF); rumble.gain.connect(rumbleG);

    const jet = loopNoise(true, null, 1.0);                  // afterburner hiss
    const jetLP = mkFilt('lowpass', 4200, 0.7, out);
    const jetPk = mkFilt('peaking', 2000, 2.2, jetLP); jetPk.gain.value = 6;
    const jetF = mkFilt('bandpass', 1500, 0.6, jetPk);
    const jetG = mkGain(0.0, jetF); jet.gain.connect(jetG);

    // duct turbulence - the hiss breathes instead of sitting at one level
    const turb = ctx.createOscillator(); turb.type = 'sine'; turb.frequency.value = 1.1;
    const turbD = mkGain(0.0); turb.connect(turbD); turbD.connect(jetG.gain); turb.start();

    // the Burnout "roar": a detuned saw/square cluster through a moving bandpass
    const roarF = mkFilt('bandpass', 420, 0.65, out);
    const roarG = mkGain(0.0, roarF);
    const roarOsc = [70, 104.5, 151.3, 209].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i > 1 ? 'square' : 'sawtooth';
      o.frequency.value = f; o.detune.value = i * 7 - 10;
      const g = mkGain(0.9 / (i + 1), roarG); o.connect(g); o.start();
      return o;
    });

    // -----------------------------------------------------------------------
    // IGNITION one-shot - the crack in front of the swell.
    //
    // The defect this closes is this project's signature bug class: a quantity
    // pushed past the range its own downstream can represent. `body` above is
    // the level trim for the SUSTAINED voice only, and every one-shot in this
    // file (api.boostHit, the gearShift blow-off grains) deliberately enters at
    // `input`, i.e. DOWNSTREAM of body. So each time body was raised to make
    // held boost audible in the mix it silently demoted the ignition one-shot
    // by the same amount - at body=7.5 the "transient" sat 17.5 dB UNDER the
    // sustain it exists to crack over. Measured result: a contour that ONLY
    // RISES. Silent for the first 20 ms, still 11.9 dB under its own sustain at
    // 50 ms, peak only +2.4 dB and not until +130 ms. A real afterburner
    // light-up does the opposite - it dumps its maximum energy ~50 ms after
    // onset and then RELAXES into sustain (boost-whoosh-01 +6.4 dB in the first
    // 20 ms and +9.7 dB peak overshoot at +50 ms; -02 +10.3 / +15.6 dB).
    // A synthesiser ramps into a jet; a jet cracks.
    //
    // Two consequences for the wiring, both deliberate:
    //  * the layer is scaled IN UNITS OF the sustained voice - BODY * SUSTAIN *
    //    IGN_OVER - so the level trim and the transient can never drift apart
    //    again. Change BODY and the overshoot RATIO is unchanged.
    //  * it is fired from the GATE EDGE, never from `env`. `env` is a per-frame
    //    integrator sampled at 60 Hz and cannot express a 3 ms attack at all;
    //    ramp() on out.gain has a 20 ms floor. Sample-accurate one-shot only.
    // Three-stage envelope, not a spike. A 3 ms attack straight into a 120 ms
    // exponential fall puts the energy maximum inside the FIRST 20 ms window,
    // where neither reference has it: on a 20 ms sliding rms, boost-whoosh-01
    // peaks at +39 ms and -02 at +123 ms, both with the crack already present at
    // +3 ms. That is what an afterburner does physically - the igniter cracks,
    // then the fuel-rich bloom builds for another ~40 ms before it relaxes. So:
    // crack to IGN_CRACK in 3 ms, bloom to full at 45 ms, then fall.
    //
    // ...and then stage 3 deleted stages 1 and 2. This is the SAME bug class one
    // more time, in the time axis instead of the amplitude axis: a quantity pushed
    // past the range its own downstream can represent. `lvl` is ~4.6, so
    // `exponentialRampToValueAtTime(1e-4, now + IGN_DEC)` was asking a 125 ms ramp
    // to traverse 93 dB - 746 dB/s. IGN_DEC was therefore a FLOOR-REACHING time,
    // not a decay time constant, and the only part of it anyone can hear (the top
    // 10 dB) was over in ~13 ms. Measured consequence: the energy maximum landed at
    // +3 ms and the envelope was back inside +3 dB of its own sustain after 30 ms,
    // where boost-whoosh-01 stays elevated for 110 ms and -02 for >310 ms. A click,
    // not a light-up.
    //
    // The fix is to give the fall a FLOOR EXPRESSED IN UNITS OF THE SUSTAIN
    // (IGN_FLOOR * lvl, -24 dB) so the ramp spends its whole duration inside the
    // audible range, add an explicit near-peak plateau, and only then run out to
    // silence with a short linear tail (an exponential can never reach 0, so the
    // node stop() used to chop a -80 dB step - now it stops on an actual zero).
    // Rate check: 24.4 dB over the 170 ms from IGN_HOLD to IGN_DEC = 143 dB/s,
    // versus 746 dB/s before, i.e. the top 10 dB now takes ~70 ms instead of 13.
    // IGN_SWEEP is split out from IGN_DEC deliberately: the crack's 2700 -> 800 Hz
    // colour trajectory is a MEASURED-GOOD result (centroid 1877 -> 2878 Hz) and
    // must not be stretched just because the amplitude tail got longer.
    const IGN_OVER = 0.55;     // ignition peak over the sustained level
    const IGN_ATK = 0.003;     // s
    // MEASURED NULL, do not re-try: raising this to 1.30 as a pre-emphasis against the
    // pink source's rising sweep bought +0.3 dB on the 0-20 ms frame and did NOT move
    // the contiguous hold off 0 ms (measured on the THUMP_PK 0.42 / THUMP_STEP 0.60
    // build, whose hold was 0 ms - not on any shipped build). The noise layers are not
    // what set the first 20 ms of the ignition; the LF thump is. THUMP_STEP owns the
    // hold and THUMP_PK owns the impact level (see the thump block below).
    const IGN_CRACK = 0.90;    // fraction of the peak reached by IGN_ATK
    const IGN_BLOOM = 0.045;   // s, where the energy maximum lands
    const IGN_HOLD = 0.130;    // s, end of the near-peak plateau
    const IGN_PLAT = 0.95;     // fraction of the peak still standing at IGN_HOLD
    const IGN_DEC = 0.300;     // s, at which the fall reaches IGN_FLOOR (NOT silence)
    const IGN_FLOOR = 0.06;    // fall target as a FRACTION OF lvl (-24.4 dB)
    const IGN_TAIL = 0.070;    // s, linear run-out from IGN_FLOOR to true zero
    const IGN_SWEEP = 0.170;   // s, filter 2700 -> 800 Hz; owns the colour, not the level
    // Wave-P: the crack's SOURCE is now pink, and a mid-band BODY layer fills the
    // 200-600 Hz hole the thump-plus-hiss pair used to leave. See the block comment
    // in ignite() for the measured tilt these four constants are set against.
    const IGN_BODY_F0 = 720;   // Hz, body formant at the instant of ignition
    const IGN_BODY_F1 = 520;   // Hz, where it settles - a DOWNWARD tilt, like ref-01
    const IGN_BODY_Q = 0.90;   // resonant enough to read as a body, not a shelf
    const IGN_BODY_G = 2.10;   // fraction of lvl
    let lastIgn = -1;
    /**
     * Filtered-noise crack + LF thump. `boostHit` routes here too, so the two
     * entry points (the voice's own a>0.02 gate and update()'s a>0.08 edge)
     * cannot double-fire: whichever arrives first wins the 80 ms debounce.
     */
    function ignite(now, amount = 1) {
      if (now - lastIgn < 0.08) return;
      lastIgn = now;
      const lvl = BODY * SUSTAIN * IGN_OVER * (0.6 + 0.4 * clamp(amount, 0, 1));

      // The crack. Opens wide at 2.7 kHz and closes to 800 Hz as it decays, so the
      // transient hands over to a sustain the spectral sweep can still climb from.
      //
      // WAVE P: the source is PINK, not white. A Q=0.5 bandpass has ~6 dB/oct skirts
      // and effectively no resonant shelf, so a WHITE source through it produced a
      // spectrum that tilted UP - measured band tilt (2-8 kHz re 300-800 Hz over the
      // first 250 ms from the detected onset) was +2.4 dB against boost-whoosh-01's
      // -5.7 dB, i.e. 8.1 dB too bright, and it read as a hiss shelf climbing to
      // 18 kHz rather than a fuel roar. Pink is -3 dB/oct; 550 Hz -> 4 kHz is 2.9
      // octaves, so it lands the tilt on the reference. `noisePink` already existed
      // (built at the noise-buffer site alongside noiseWhite) and ignite() was the
      // one voice not using it.
      const src = ctx.createBufferSource();
      src.buffer = noisePink; src.loop = true;
      src.playbackRate.value = 0.85 + R() * 0.3;
      const f = mkFilt('bandpass', 2700, 0.5);
      // The 2700 -> 800 Hz close is NOT delayed to sit under the longer amplitude
      // tail, though it was tried: holding the bandpass open through IGN_BLOOM
      // bought only +0.1..+0.3 dB on the sustained-overshoot frames and cost
      // +600 Hz of centroid in the onset+0-250 ms window (ref-01 is 2151 Hz there).
      // The colour trajectory owns IGN_SWEEP and the level owns IGN_DEC; keeping
      // them separate is the point of the split, not making them equal.
      f.frequency.setValueAtTime(2700, now);
      f.frequency.exponentialRampToValueAtTime(800, now + IGN_SWEEP);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(lvl * IGN_CRACK, now + IGN_ATK);
      g.gain.linearRampToValueAtTime(lvl, now + IGN_BLOOM);
      g.gain.linearRampToValueAtTime(lvl * IGN_PLAT, now + IGN_HOLD);
      g.gain.exponentialRampToValueAtTime(lvl * IGN_FLOOR, now + IGN_DEC);
      g.gain.linearRampToValueAtTime(0, now + IGN_DEC + IGN_TAIL);
      src.connect(f); f.connect(g); g.connect(input);
      src.start(now, R() * 1.5); src.stop(now + IGN_DEC + IGN_TAIL + 0.02);
      src.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };

      // BODY. The crack above and the thump below used to be the WHOLE ignition, and
      // level-matched log/log spectrograms of the first 0.8 s showed exactly what that
      // costs: boost-whoosh-01 is ONE CONTINUOUS MASS centred 340-600 Hz that tilts
      // down with frequency, while ours was bimodal - a sub-200 Hz thump streak, a
      // scooped hole from 250-600 Hz, and a hiss shelf above. Two objects, not one.
      // This layer is the missing middle: pink noise through a resonant bandpass that
      // falls IGN_BODY_F0 -> IGN_BODY_F1 over the same IGN_SWEEP the crack uses, so
      // the two colours move together instead of splitting apart. It shares the
      // crack's envelope shape but ends earlier (IGN_DEC * 0.85) - a mid formant held
      // as long as the noise layer starts to read as a vowel.
      const bsrc = ctx.createBufferSource();
      bsrc.buffer = noisePink; bsrc.loop = true;
      bsrc.playbackRate.value = 0.9 + R() * 0.2;
      const bf = mkFilt('bandpass', IGN_BODY_F0, IGN_BODY_Q);
      bf.frequency.setValueAtTime(IGN_BODY_F0, now);
      bf.frequency.exponentialRampToValueAtTime(IGN_BODY_F1, now + IGN_SWEEP);
      const bl = lvl * IGN_BODY_G;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0, now);
      bg.gain.linearRampToValueAtTime(bl * IGN_CRACK, now + IGN_ATK);
      bg.gain.linearRampToValueAtTime(bl, now + IGN_BLOOM);
      bg.gain.linearRampToValueAtTime(bl * IGN_PLAT, now + IGN_HOLD);
      bg.gain.exponentialRampToValueAtTime(bl * IGN_FLOOR, now + IGN_DEC * 0.85);
      bg.gain.linearRampToValueAtTime(0, now + IGN_DEC * 0.85 + IGN_TAIL);
      bsrc.connect(bf); bf.connect(bg); bg.connect(input);
      bsrc.start(now, R() * 1.5); bsrc.stop(now + IGN_DEC * 0.85 + IGN_TAIL + 0.02);
      bsrc.onended = () => { try { bg.disconnect(); } catch (e) { /* noop */ } };

      // LF thump. Starts at 300 Hz and falls to 150, not to 70: `input` feeds two
      // cascaded 72 Hz high-passes (24 dB/oct), so a thump that ends below the
      // corner spends its last half being deleted by the bus it sits on. Wave P
      // moved the pair up from 210 -> 96 so the thump lands UNDER the new mid-band
      // BODY formant (IGN_BODY_F0/F1, 720 -> 520 Hz) and the two read as one mass
      // rather than as a sub streak with a hole above it. THUMP_PK came down 0.55 ->
      // 0.42 in that move because the body layer now carries some of the weight the
      // thump used to carry alone; wave R put it back up to 0.48 (see below). It is
      // kept SHORTER than the crack on purpose - a low sine held as long as the
      // noise layer reads as a boom.
      //
      // THUMP_STEP IS THE CONTIGUOUS-HOLD KNOB, and it was the wave-P regression.
      // MEASURED, on the isolated boost stem: this sine, not either noise layer, is
      // what sets the first 20 ms of the ignition (halving IGN_OVER moves the 0-20 ms
      // frame by -4.6 dB, so the ignition owns ~87% of that window's energy, yet a
      // +2.1 dB pre-emphasis applied to BOTH noise layers via IGN_CRACK moved it only
      // +0.3 dB). At 0.60 the thump RAMPED UP over its first 50 ms to THUMP_BLOOM,
      // so the two 10 ms frames at the detected onset sat at +1.9 / +2.1 dB over
      // steady - just under the +3 dB gate - and the contiguous sustained-overshoot
      // hold read 0 ms while over20 was a healthy +7.6 dB. >1 makes IGN_ATK the
      // thump's own peak and lets it settle back to THUMP_PK by THUMP_BLOOM, which
      // is also the physically right shape: the pressure step of an ignition is at
      // the front. MEASURED, paired, THUMP_STEP the only variable: 0.60 -> 1.15 took
      // the 10 ms-hop contiguous hold 0 -> 150 ms on the THUMP_PK 0.42 build, with the
      // boost-solo stem peaking 0.7481. (An earlier revision of this comment claimed
      // "0 -> 170 ms ... peak 0.797"; those are the THUMP_PK 0.55 build's figures and
      // were never the shipped ones. Corrected in wave R from a re-render.)
      //
      // THUMP_PK IS THE ONSET-IMPACT KNOB, and it is NOT headroom-limited.
      // MEASURED, wave R, paired A,B,A,B with THUMP_PK the only variable:
      // 0.42 -> 0.48 moves the 0-20 ms frame +5.8 -> +6.8 dB, the 0-50 ms frame
      // +6.2 -> +7.1 dB and over20 +7.8 -> +8.5 dB @ +39 ms, against
      // boost-whoosh-01's +6.6 / +7.5 / +8.7 @ +39 - all three inside a +/-0.6 dB
      // band on the reference. Cost: the boost-solo stem peak goes 0.7481 -> 0.7762
      // and the BUSY MIX peak does not move at all (0.9279 both, four decimals),
      // because the busy peak is set by the engine/crash bed and not by the ignition
      // (ours-busy 0.9279 with boost, 0.9272 without). So BED_TRIM (:351) is NOT the
      // constraint here and must not be touched for onset impact, and IGN_OVER (:813)
      // must not be raised either - it scales the crack and the body along with the
      // thump and drags the spectral tilt off the reference.
      // KNOWN COST, do not lose it: 0.48 also moves 100-300 re 300-800 over the first
      // 250 ms from +2.5 to +2.9 dB, i.e. AWAY from ref-01's -6.6. The thump is both
      // the impact layer and the LF-skew layer; the two targets pull opposite ways on
      // this one constant and the skew has to be fixed by MOVING the thump in
      // frequency (the o.frequency sweep just below, :962-963), not by cutting level.
      // KILL-CONTROL, wave R, measured: THUMP_PK 0.48 -> 0.001 (an effectively deleted
      // thump) moves the ignition-attributable 100-300 re 300-800 skew +2.6 -> -0.4 dB
      // against ref-01's -3.4, so the thump carries 3.0 dB of the 6.0 dB gap and the
      // OTHER 3.0 dB is 300-800 Hz UNDER-FILL by the crack and the BODY layer. Moving
      // the sweep below can close at most half of it; the rest needs IGN_BODY_G / F0/F1.
      //
      // NEVER SET THUMP_PK TO EXACTLY 0, INCLUDING AS A NULL CONTROL. The gain chain
      // below ends in exponentialRampToValueAtTime, whose target may not be zero, so
      // THUMP_PK = 0 throws a RangeError out of ignite() on EVERY boost activation and
      // deadlocks tools/audio-isolate.mjs (it throws inside the off.suspend() callback,
      // so off.resume() never runs - a silent 19-minute hang, `lint ok` throughout).
      // That is exactly how this file was found at the start of wave R. Use 0.001.
      const THUMP_PK = 0.48;     // fraction of lvl
      const THUMP_STEP = 1.15;   // multiple of THUMP_PK present at IGN_ATK (front-loaded)
      const THUMP_BLOOM = 0.050; // s, where the LF pressure bloom peaks
      const THUMP_DEC = 0.240;   // s, at which the fall reaches THUMP_FLOOR
      const THUMP_FLOOR = 0.07;  // fraction of the thump peak (-23.1 dB)
      const THUMP_TAIL = 0.060;  // s, linear run-out to true zero
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(300, now);
      o.frequency.exponentialRampToValueAtTime(150, now + 0.18);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0, now);
      tg.gain.linearRampToValueAtTime(lvl * THUMP_PK * THUMP_STEP, now + IGN_ATK);
      tg.gain.linearRampToValueAtTime(lvl * THUMP_PK, now + THUMP_BLOOM);
      tg.gain.exponentialRampToValueAtTime(lvl * THUMP_PK * THUMP_FLOOR, now + THUMP_DEC);
      tg.gain.linearRampToValueAtTime(0, now + THUMP_DEC + THUMP_TAIL);
      o.connect(tg); tg.connect(input);
      o.start(now); o.stop(now + THUMP_DEC + THUMP_TAIL + 0.02);
      o.onended = () => { try { tg.disconnect(); } catch (e) { /* noop */ } };
    }

    return {
      out, input, ignite,
      get env() { return env; },
      /** Returns the contour value so the engine sidechain can track it. */
      set(now, dt, amount, speed01) {
        const a = clamp(amount, 0, 1);
        const on = a > 0.02;
        if (on && !gate) { env = 1; ignite(now, a); }        // ignition
        else if (on) env += (SUSTAIN - env) * (1 - Math.exp(-dt / DECAY_TC));
        else env += (0 - env) * (1 - Math.exp(-dt / REL_TC));
        gate = on;
        ramp(out.gain, env, now, 0.02);
        ramp(gustD.gain, on ? 0.085 * env : 0, now, 0.20);
        // Spectral sweep. The boost decay used to be spectrally STATIC - centroid
        // 1830 -> 1900 Hz across the whole tail - where the reference whoosh climbs
        // 1928 -> 2837 Hz and hands the band balance over to 2-8k as it goes. Hanging
        // the jet's three corner frequencies on `bright`, and trading the rumble bed
        // away for hiss as it rises, gives that climb.
        //
        // The 6th power is not decoration. A plain exponential rise is already ~40%
        // done 250 ms in, which lifts the *start* of the tail as much as the end and
        // measures as a bright decay rather than a rising one. Raising it to a high
        // power holds the opening dark and puts the whole excursion in the second
        // half of the tail, which is the shape the reference actually has.
        if (on) swp += (1 - swp) * (1 - Math.exp(-dt / SWEEP_TC));
        else swp += (0 - swp) * (1 - Math.exp(-dt / REL_TC));
        const swp3 = swp * swp * swp;
        const bright = swp3 * swp3 * a;
        ramp(rumbleG.gain, a * 0.62 * (1 - bright * 0.80), now, 0.09);
        ramp(rumbleF.frequency, 380 + a * 240, now, 0.12);
        ramp(jetG.gain, a * 0.34 * (0.85 + bright * 1.60), now, 0.09);
        ramp(turbD.gain, a * 0.15, now, 0.15);
        ramp(jetF.frequency, 1000 + a * 800 + speed01 * 400 + bright * 2400, now, 0.12);
        ramp(jetPk.frequency, 1700 + a * 900 + bright * 2400, now, 0.12);
        ramp(jetLP.frequency, 3800 + a * 900 + speed01 * 300 + bright * 4600, now, 0.12);
        ramp(roarG.gain, a * a * 0.20, now, 0.10);
        ramp(roarF.frequency, 300 + a * 700 + speed01 * 500, now, 0.12);
        for (let i = 0; i < roarOsc.length; i++) ramp(roarOsc[i].detune, -20 + a * 260 + i * 9, now, 0.15);
        // sidechain drive: 1 on the ignition transient, 0 once we reach the sustain
        return (env - SUSTAIN) / (1 - SUSTAIN);
      },
    };
  }

  function buildTyres(destBus) {
    const out = mkGain(1.0, destBus.input);

    const scrub = loopNoise(false, null, 1.0);               // broadband rubber scrub
    const scrubF = mkFilt('bandpass', 720, 1.5, out);
    const scrubG = mkGain(0.0, scrubF); scrub.gain.connect(scrubG);

    const sqSrc = loopNoise(false, null, 1.0);               // two resonant squeal formants
    const sqG = mkGain(0.0); sqSrc.gain.connect(sqG);
    // Q here is a POWER budget, not just a colour. Noise power through a bandpass is
    // proportional to its noise bandwidth f0/Q, so the old Q=18/22 pair passed only
    // ~64 Hz and ~108 Hz of the white source (about -26 dB) and the squeal band simply
    // never showed up in the mix - a full slide measured the same as the engine bed.
    // Q~5 gives ~165 Hz and ~380 Hz, and f1 sits on the 820 Hz reference formant.
    const f1 = mkFilt('bandpass', 820, 5, out);
    const f2 = mkFilt('bandpass', 1860, 7, out);
    // f2 is both higher and wider, so it would out-power f1 if fed at parity; trim it
    // so the 820 Hz formant stays the loudest thing in the squeal and 2-8k does not
    // overshoot the reference's ~15%. MEASURED, do not "fix" this again: 0.52 (about
    // 3.5 dB under f1, matching tire-screech-01's own 7.1 / 5.3 dB formant split) was
    // tried and is a net regression - b2k_8k 14.2% -> 19.9% against the reference's
    // 15.0%, and b400_2k 62.1% -> 59.9% AWAY from the reference's 73.7% - because a
    // Q=7 skirt at 1880 Hz dumps most of the added power above 2 kHz. It also does
    // NOT make 1896 Hz appear in a top-5 prominence scan, because those five slots
    // are five smoothed maxima of the SAME warbling f1 (the +/-45 Hz warble splits one
    // formant across 794-835 Hz), not evidence that a second formant is missing.
    const f2G = mkGain(0.32, f2);
    sqG.connect(f1); sqG.connect(f2G);
    const warb = ctx.createOscillator(); warb.type = 'sine'; warb.frequency.value = 6.2;
    const warbD1 = mkGain(45); warb.connect(warbD1); warbD1.connect(f1.frequency);
    const warbD2 = mkGain(110); warb.connect(warbD2); warbD2.connect(f2.frequency);
    warb.start();

    const roll = loopNoise(true, null, 1.0);                 // rolling road roar
    const rollF = mkFilt('bandpass', 130, 0.9, out);
    const rollG = mkGain(0.0, rollF); roll.gain.connect(rollG);

    return {
      out,
      set(now, { slip, brake, handbrake, speed01, wet }) {
        const lock = clamp(Math.max(slip, brake * 0.75, handbrake ? 0.85 : 0), 0, 1);
        const moving = clamp(speed01 * 3, 0, 1);
        // squeal only past the grip threshold, and standing water kills it
        const squeal = clamp((lock - 0.22) / 0.6, 0, 1) * moving * (1 - wet * 0.55);
        ramp(scrubG.gain, (lock * 2.0 + wet * moving * 0.34) * moving, now, 0.05);
        ramp(scrubF.frequency, 400 + lock * 500 + speed01 * 300, now, 0.06);
        ramp(sqG.gain, squeal * squeal * 8.0, now, 0.05);
        // base tuned so a hard lock (lock~0.95) lands f1 near the 820 Hz reference
        // formant rather than the 1.47 kHz the old 980 base produced.
        ramp(f1.frequency, 640 + lock * 160 + speed01 * 120, now, 0.07);
        ramp(f2.frequency, 1500 + lock * 380, now, 0.07);
        ramp(warb.frequency, 4.5 + lock * 9, now, 0.1);
        ramp(rollG.gain, moving * (0.10 + speed01 * 0.16), now, 0.08);
        ramp(rollF.frequency, 90 + speed01 * 190, now, 0.1);
      },
    };
  }

  function buildWind(destBus) {
    const out = mkGain(0.0, destBus.input);
    const src = loopNoise(true, null, 1.0);
    const hp = mkFilt('highpass', 140, 0.7, out);
    const lp = mkFilt('lowpass', 700, 0.9, hp);
    src.gain.connect(lp);
    // buffeting, so it never reads as flat static
    const buffet = ctx.createOscillator(); buffet.type = 'sine'; buffet.frequency.value = 0.7;
    const bd = mkGain(0.0); buffet.connect(bd); bd.connect(out.gain); buffet.start();
    return {
      out,
      set(now, speed01, boostAmt) {
        const s = clamp(speed01, 0, 1.25);
        const g = s * s * 0.30 * (1 + boostAmt * 0.5);
        ramp(out.gain, g, now, 0.12);
        ramp(bd.gain, g * 0.28, now, 0.2);
        ramp(lp.frequency, 320 + s * 2600, now, 0.12);
        ramp(hp.frequency, 110 + s * 220, now, 0.12);
        ramp(buffet.frequency, 0.5 + s * 2.2, now, 0.2);
      },
    };
  }

  // ===========================================================================
  // one-shot atoms
  // ===========================================================================
  function playSample(name, { level = 1, rate = 1, dest = null, offset = 0, dur = null } = {}) {
    const buf = samples[name];
    if (!buf) return false;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const length = Math.max(0.05, (dur || Math.max(0.05, buf.duration - offset)) / rate);
    const fade = Math.min(0.03, length * 0.25);
    const vg = mkGain(0, dest || busFx.input);
    vg.gain.setValueAtTime(0, now);
    vg.gain.linearRampToValueAtTime(level, now + fade);
    vg.gain.setValueAtTime(level, now + length - fade);
    vg.gain.linearRampToValueAtTime(0, now + length);
    src.connect(vg);
    src.start(now, offset, dur || undefined);
    src.stop(now + length + 0.02);
    src.onended = () => { try { vg.disconnect(); } catch (e) { /* noop */ } };
    return true;
  }

  /**
   * Short filtered-noise grain - the atom every impact and mechanical hit is built from.
   *
   * `endRel` makes the DECAY RATE explicit instead of implicit. By default the gain
   * ramps from `peak` down to an absolute 1e-4, so the dB/s slope silently depends on
   * how loud the grain is: a 0.3-peak 2 s bed falls at 35 dB/s, which is one reason
   * long beds kept vanishing. Passing `endRel` ends the ramp at `peak * endRel`, so a
   * caller can ask for "-24 dB over 2 s" and actually get it.
   * `pan` decorrelates a grain cloud; without it a debris shower sums to a perfectly
   * centred mono blob.
   */
  function grain(dest, { at, dur, freq, q, type = 'bandpass', peak, pink = false, endRel = 0, pan = 0 }) {
    const src = ctx.createBufferSource();
    src.buffer = pink ? noisePink : noiseWhite;
    src.loop = true;
    src.playbackRate.value = 0.7 + R() * 0.6;
    const f = mkFilt(type, freq, q);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, at);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak), at + Math.min(0.006, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(endRel > 0 ? Math.max(1e-5, peak * endRel) : 1e-4, at + dur);
    src.connect(f); f.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p); p.connect(dest);
    } else {
      g.connect(dest);
    }
    src.start(at, R() * 1.5);
    src.stop(at + dur + 0.02);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
  }

  /**
   * One structural mode of a panel: a decaying sine plus a co-located band of noise,
   * with an exact -60 dB time.
   *
   * Why not a self-ringing high-Q bandpass fed by the transient, which is the textbook
   * modal synth? Because with a biquad the decay time is Q/(pi*f) - T60 and timbre are
   * then the same knob, a 1.4 s ring at 190 Hz needs Q~120, and the amplitude you get
   * out is whatever the excitation happened to have inside a 1.6 Hz band. Unmeasurable
   * and unbalanced across the bank. Here the ENVELOPE owns the T60, so the bank can be
   * tuned straight at a target decay, and Q only owns the colour. The sine core is the
   * pitched metal, the noise skin stops it reading as a tuned bell, and because the
   * envelope starts at zero and stays well under the impact transient the bank adds
   * sustain without adding a peak - which is the whole point when the crest is already
   * too high.
   */
  function ringMode(dest, { at, freq, t60, peak, noise = 0.6, q = 11, pan = 0 }) {
    const atk = 0.006;
    const stop = at + atk + t60;
    const out = ctx.createGain();
    out.gain.setValueAtTime(1e-4, at);
    out.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak), at + atk);
    out.gain.exponentialRampToValueAtTime(Math.max(1e-6, peak * 1e-3), stop);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      out.connect(p); p.connect(dest);
    } else {
      out.connect(dest);
    }

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.detune.value = (R() * 2 - 1) * 14;
    o.connect(mkGain(1 - noise, out));
    o.start(at); o.stop(stop + 0.02);

    // A Q-band of white noise is only f/q wide, so a fixed gain would put the skin
    // 20 dB under the sine and make it Q-dependent. Scaling by sqrt(q) cancels the
    // bandwidth term (amplitude goes as sqrt(BW) = sqrt(f/q)), so `noise` reads as a
    // real sine/noise BALANCE at any Q: 0.6 lands the two paths within a dB.
    const src = ctx.createBufferSource();
    src.buffer = noiseWhite; src.loop = true;
    src.playbackRate.value = 0.8 + R() * 0.4;
    const f = mkFilt('bandpass', freq, q);
    f.connect(mkGain(noise * 6 * Math.sqrt(q), out));
    src.connect(f);
    src.start(at, R() * 1.5); src.stop(stop + 0.02);

    o.onended = () => { try { out.disconnect(); } catch (e) { /* noop */ } };
  }

  function tone(dest, { at, dur, f0, f1, peak, type = 'sine' }) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(8, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, at);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak), at + 0.006);
    g.gain.exponentialRampToValueAtTime(1e-4, at + dur);
    o.connect(g); g.connect(dest);
    o.start(at); o.stop(at + dur + 0.02);
    o.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
  }

  // ===========================================================================
  // rivals - doppler + distance
  // ===========================================================================
  const listener = { pos: [0, 0, 0], fwd: [0, 0, 1], up: [0, 1, 0], vel: [0, 0, 0] };
  const vec3 = (v, d) => (v == null ? d :
    [v.x !== undefined ? v.x : v[0], v.y !== undefined ? v.y : v[1], v.z !== undefined ? v.z : v[2]]);

  function makeRival(id, opts = {}) {
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 6;
    panner.maxDistance = 500;
    panner.rolloffFactor = 1.15;
    panner.connect(busWorld.input);
    const air = mkFilt('lowpass', 12000, 0.7, panner);   // distance = air absorption
    const voice = makeEngineVoice(air, {
      cylinders: opts.cylinders || 6,
      idle: opts.idle || 820,
      redline: opts.redline || 7200,
      detune: opts.detune === undefined ? (R() * 40 - 20) : opts.detune,
    });
    const r = {
      id, panner, air, voice,
      pos: [0, 0, 0], vel: [0, 0, 0], dopplerCents: 0,
      gainMul: opts.gain === undefined ? 0.55 : opts.gain,
    };
    rivals.set(id, r);
    return r;
  }

  function setPannerPos(p, x, y, z) {
    if (p.positionX) {
      const t = ctx.currentTime;
      p.positionX.setTargetAtTime(x, t, 0.02);
      p.positionY.setTargetAtTime(y, t, 0.02);
      p.positionZ.setTargetAtTime(z, t, 0.02);
    } else if (p.setPosition) p.setPosition(x, y, z);
  }

  function applyListener() {
    const L = ctx.listener;
    const t = ctx.currentTime;
    if (L.positionX) {
      const set = (p, v) => p.setTargetAtTime(v, t, 0.02);
      set(L.positionX, listener.pos[0]); set(L.positionY, listener.pos[1]); set(L.positionZ, listener.pos[2]);
      set(L.forwardX, listener.fwd[0]); set(L.forwardY, listener.fwd[1]); set(L.forwardZ, listener.fwd[2]);
      set(L.upX, listener.up[0]); set(L.upY, listener.up[1]); set(L.upZ, listener.up[2]);
    } else {
      if (L.setPosition) L.setPosition(listener.pos[0], listener.pos[1], listener.pos[2]);
      if (L.setOrientation) {
        L.setOrientation(listener.fwd[0], listener.fwd[1], listener.fwd[2],
          listener.up[0], listener.up[1], listener.up[2]);
      }
    }
  }

  // ===========================================================================
  // build
  // ===========================================================================
  function build() {
    ctx = new AC({ latencyHint: 'interactive' });
    noiseWhite = makeNoise(3, false);
    noisePink = makeNoise(3, true);
    buildMaster();

    // `sendAmt` is a wet/dry RATIO (see makeBus). Only busEngine keeps a large one:
    // the player's engine is the source the space presets are audibly hung on, and a
    // street canyon that does not change the sound of your own exhaust is not a
    // space. The rest are trimmed, because the city preset's return went up 14 dB in
    // round 6 and everything sharing it would otherwise have drowned.
    busEngine = makeBus(0.35);
    busBoost = makeBus(0.14);
    busTyre = makeBus(0.30);
    busWind = makeBus(0.12);
    // Rivals live on busWorld and are the only *positioned* sources in the mix, so
    // they get the driest send of the lot: the wet return is a centred, highly
    // correlated pair and every dB of it dilutes the panner's L/R contrast at
    // broadside, which is the one moment the pan is supposed to be near-total.
    // (For the record: with the listener facing +z and up +y, right is -x, so a
    // rival at x=+4 passes on the driver's LEFT. The tools' comments say right;
    // the game is correct and the comments are not.)
    busWorld = makeBus(0.08);
    // busFx's dry bypasses BED_TRIM, so its send has to be divided by it to express
    // the same wet/dry ratio the other buses get from their raw `sendAmt`.
    busFx = makeBus(0.30 / BED_TRIM, fxDirect);

    engine = makeEngineVoice(busEngine.input, { cylinders: 8, idle: 760, redline: 7800 });
    boostVoice = buildBoost(busBoost);
    tyreVoice = buildTyres(busTyre);
    windVoice = buildWind(busWind);

    applyListener();
    built = true;
  }

  // ---- optional CC0 sample layer -------------------------------------------
  const SAMPLE_FILES = {
    boostWhoosh: 'sfx/boost-whoosh-01.mp3',
    boostRoar: 'sfx/boost-whoosh-02.mp3',
    crashGlass: 'sfx/crash-impact-01.mp3',
    crashDry: 'sfx/crash-impact-02.mp3',
    screechLoop: 'sfx/tire-screech-01.mp3',
    screechHit: 'sfx/tire-screech-02.mp3',
  };
  async function loadSamples() {
    await Promise.all(Object.entries(SAMPLE_FILES).map(async ([key, url]) => {
      try {
        const res = await fetch(new URL(url, import.meta.url).href, { cache: 'force-cache' });
        if (!res.ok) return;
        samples[key] = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { /* synth-only fallback, by design */ }
    }));
  }

  // ===========================================================================
  // public api
  // ===========================================================================
  const api = {
    get running() { return running; },
    get suspended() { return !ctx || ctx.state !== 'running'; },
    get ctx() { return ctx; },
    ready,
    enabled: true,

    /**
     * Build the graph WITHOUT starting it, so the cost is paid behind the boot bar instead of
     * on the player's first keystroke. Returns the milliseconds it took, or -1 if it was
     * already built or unavailable.
     *
     * WHY THIS EXISTS (wave-s/perf-r3). `start()` is called from the first `keydown`
     * (main.js:582) and from the START-menu click, and on a cold graph it does all of `build()`
     * synchronously: a new AudioContext, two 3-second stereo noise buffers, the synthesised
     * reverb IR, five buses and four voices. Measured with `long-animation-frame`, which names
     * the offending script:
     *
     *   LoAF blocking=242 ms  scripts=[{ sourceURL: main.js, sourceFunctionName: "down",
     *                                    invoker: "DOMWindow.onkeydown", duration: 282.1 }]
     *
     * That is a 162-282 ms freeze on the first key the player presses, and it was the second of
     * the two causes behind the 174-330 ms hitch perf-critic-r2 section 4b found in 4 of 4 cold
     * boots. Kill-control: with `audio.start` stubbed out after `__ready` and before the first
     * key, the hitch is gone in 4 of 4 boots and the first 700 ms of play delivers 41-45 frames.
     *
     * IT IS STILL SILENT, and that is by construction, not by taste:
     *   - a context constructed without a user gesture is created SUSPENDED, so its graph is
     *     not rendered at all until something resumes it, and `start()` is the only resume;
     *   - `master = mkGain(0.0)` (:374) — the master sum starts at zero gain and is only ramped
     *     up by `start()`, so even a resumed prewarmed graph would put nothing on the output;
     *   - `running` stays false and the `suspended` getter still reports true, so every
     *     existing caller sees exactly the state it saw before.
     * The one thing that IS different from before: nodes now reach `ctx.destination` before the
     * first gesture, where previously there were zero. wave-s/menu-critic's routing audit
     * counted them, so this is declared loudly rather than slipped in, and
     * `#audiowarm=0` turns it off for anyone who needs the old timing back.
     */
    prewarm() {
      if (built || !AC) return -1;
      const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
      try { build(); } catch (e) { return -1; }
      return (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    },

    start() {
      if (running) return;
      try {
        if (!built) build();
        if (ctx.state === 'suspended') ctx.resume();
        running = true;
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(0.0001, now);
        master.gain.linearRampToValueAtTime(muted ? 0.0001 : masterVol, now + 0.5);
        loadSamples().then(() => readyResolve(true), () => readyResolve(false));
      } catch (e) {
        running = false;
        readyResolve(false);
      }
    },

    stop() {
      if (!running || !ctx) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      running = false;
      const dying = ctx;
      setTimeout(() => { try { dying.close(); } catch (e) { /* noop */ } built = false; }, 400);
    },

    setEnabled(v) {
      muted = !v;
      if (!running) return;
      ramp(master.gain, muted ? 0 : masterVol, ctx.currentTime, 0.08);
    },

    /**
     * THE SFX VOLUME. Engine, tyres, wind, impacts, rivals and the reverb return —
     * everything on this module's master sum. It does NOT touch the soundtrack:
     * `music.js` runs on its own AudioContext (see the header note), so there is no node
     * shared between the two and no ordering in which this call can move the music.
     * `verdicts/wave-s/menu-music.md` proves that by kill-control: `setVolume(0)` here
     * leaves the music's post-gain RMS unchanged.
     */
    setVolume(v) {
      masterVol = clamp(v, 0, 1);
      if (running && !muted) ramp(master.gain, masterVol, ctx.currentTime, 0.08);
    },

    /**
     * The live SFX volume. Added for wave-s/menu-music: the menu's SFX slider has to
     * reflect the value the mix is actually at, and a shadow copy in the menu would drift
     * the moment anything else called setVolume (a scene preset, a harness, the console).
     */
    getVolume() { return masterVol; },

    /**
     * 'open' | 'city' | 'tunnel' - swaps the IR under a short return mute and moves
     * the wet return level, its damping lowpass, its return highpass and its low
     * shelf. All four move together, because level alone was never enough to tell
     * open from city: they are separated on level, colour and shape at once.
     */
    setSpace(id) {
      if (!SPACES[id]) return;
      curSpace = id;
      if (!built) return;
      const now = ctx.currentTime;
      const cfg = SPACES[id];
      ramp(revReturn.gain, 0, now, 0.03);
      setTimeout(() => {
        if (!built || !convolver) return;
        convolver.buffer = irs[id];
        ramp(revReturn.gain, SPACES[curSpace].revReturn * BED_TRIM, ctx.currentTime, 0.06);
      }, 140);
      ramp(revLP.frequency, cfg.lp, now, 0.15);
      ramp(revHP.frequency, cfg.hp, now, 0.15);
      ramp(revShelf.gain, cfg.shelf, now, 0.15);
    },

    setListener(pos, fwd, up, vel) {
      listener.pos = vec3(pos, listener.pos);
      listener.fwd = vec3(fwd, listener.fwd);
      listener.up = vec3(up, listener.up);
      listener.vel = vec3(vel, listener.vel);
      if (built) applyListener();
    },

    addRival(id, opts) {
      if (!running || rivals.has(id)) return rivals.get(id) || null;
      return makeRival(id, opts);
    },

    updateRival(id, s = {}) {
      const r = rivals.get(id);
      if (!r || !running) return;
      const now = ctx.currentTime;
      if (s.pos) { r.pos = vec3(s.pos, r.pos); setPannerPos(r.panner, r.pos[0], r.pos[1], r.pos[2]); }
      if (s.vel) r.vel = vec3(s.vel, r.vel);

      // Manual doppler - WebAudio dropped the built-in one. Project both velocities
      // onto the listener->source axis `u` and shift pitch by the classic ratio
      //
      //     f / f0 = (c - v_listener) / (c + v_source)      both RECEDING-positive
      //
      // `u` points from the listener at the source, so r.vel . u is already
      // receding-positive but listener.vel . u is approaching-positive and has to be
      // negated. Getting that wrong inverts the whole effect: a rival pulling away
      // rose +550 cents instead of falling -560.
      const dx = r.pos[0] - listener.pos[0], dy = r.pos[1] - listener.pos[1], dz = r.pos[2] - listener.pos[2];
      const dist = Math.hypot(dx, dy, dz) || 1e-3;
      const ux = dx / dist, uy = dy / dist, uz = dz / dist;
      const vs = r.vel[0] * ux + r.vel[1] * uy + r.vel[2] * uz;      // source receding +
      const vl = -(listener.vel[0] * ux + listener.vel[1] * uy + listener.vel[2] * uz); // listener receding +
      const ratio = clamp((SPEED_OF_SOUND - vl) / (SPEED_OF_SOUND + vs), 0.6, 1.7);
      r.dopplerCents = centsOf(ratio);
      r.voice.detune(r.dopplerCents, now, 0.03);
      r.voice.set(now, {
        rpm01: clamp(s.rpm01 === undefined ? 0.5 : s.rpm01, 0, 1),
        load: clamp(s.load === undefined ? 0.7 : s.load, 0, 1),
        gainMul: r.gainMul,
        tc: 0.05,
      });
      ramp(r.air.frequency, clamp(15000 - dist * 32, 900, 15000), now, 0.1);
    },

    removeRival(id) {
      const r = rivals.get(id);
      if (!r) return;
      rivals.delete(id);
      if (ctx) r.voice.dispose(ctx.currentTime);
    },

    /** Clutch cut + mechanical clunk + blow-off (up) or throttle blip (down). */
    gearShift(from, to, load = 1) {
      if (!running) return;
      const now = ctx.currentTime;
      const up = to > from;
      const d = engine.duck.gain;
      d.cancelScheduledValues(now);
      d.setValueAtTime(Math.max(0.05, d.value), now);
      d.linearRampToValueAtTime(up ? 0.22 : 0.55, now + 0.018);
      d.linearRampToValueAtTime(1.0, now + (up ? 0.16 : 0.11));

      grain(busEngine.input, { at: now + 0.004, dur: 0.055, freq: 340, q: 6, peak: 0.34 * load });
      tone(busEngine.input, { at: now + 0.004, dur: 0.09, f0: 96, f1: 52, peak: 0.30 * load });

      if (up) {
        grain(boostVoice.input, { at: now + 0.03, dur: 0.20, freq: 3600, q: 1.1, peak: 0.20 * load });
        grain(boostVoice.input, { at: now + 0.03, dur: 0.11, freq: 6800, q: 0.9, peak: 0.10 * load });
      } else {
        grain(busEngine.input, { at: now + 0.02, dur: 0.18, freq: 700, q: 1.6, peak: 0.22 * load });
      }
    },

    /** Boost ignition transient. */
    boostHit(strength = 1) {
      if (!running) return;
      const now = ctx.currentTime;
      const s = clamp(strength, 0, 1);
      const dest = boostVoice.input;      // shares the boost bus high-pass
      // The ignition transient proper lives in the boost voice, scaled against
      // the sustained level it has to crack over (see buildBoost/ignite). It is
      // debounced, so the voice's own gate edge and this public entry point can
      // both call it. Everything below is TEXTURE layered on top of that, and is
      // deliberately NOT body-scaled.
      boostVoice.ignite(now, s);
      if (!playSample('boostWhoosh', { level: 0.55 * s, rate: 0.92 + R() * 0.1, dest, dur: 1.4 })) {
        const src = ctx.createBufferSource(); src.buffer = noisePink; src.loop = true;
        const f = mkFilt('bandpass', 380, 1.1);
        f.frequency.setValueAtTime(380, now);
        f.frequency.exponentialRampToValueAtTime(2600, now + 0.30);
        const g = ctx.createGain();
        g.gain.setValueAtTime(1e-4, now);
        g.gain.exponentialRampToValueAtTime(0.42 * s, now + 0.03);
        g.gain.exponentialRampToValueAtTime(1e-4, now + 0.55);
        src.connect(f); f.connect(g); g.connect(dest);
        src.start(now); src.stop(now + 0.6);
      }
      // f1 stays inside the bus high-pass so the thump lands instead of vanishing
      tone(dest, { at: now, dur: 0.35, f0: 150, f1: 72, peak: 0.42 * s });
      tone(dest, { at: now + 0.02, dur: 0.28, f0: 160, f1: 520, peak: 0.10 * s, type: 'sawtooth' });
    },

    /**
     * A car flying past: the air it drags with it. Pink noise through a bandpass that
     * sweeps UP then falls, panned across the head in the same gesture.
     *
     * TIMING IS THE WHOLE EFFECT, and it is why this is fired from the pass OPENING rather
     * than from traffic.js's event queue. That queue fires at closePass(), gated on
     * clearance re-opening past 3.4 + 1.4 m, which measured 127 ms late at the median and
     * 225 ms at p90 over a 45 s drive - far enough behind the car that the whoosh reads as
     * belonging to the next one. Fired at the opening instead, `dur` IS the lead-in: the
     * band peak lands around the closest point on its own.
     *
     * `side` is -1 for a car going by on the left and +1 on the right, already resolved by
     * the caller - this takes a stereo side and not a world position on purpose, because
     * the panner rig (busWorld) is for sustained sources that need distance and doppler,
     * and a 300 ms burst that is over before the geometry moves does not.
     */
    pass(intensity = 1, { side = 0, relSpeed = 30 } = {}) {
      if (!running) return;
      const now = ctx.currentTime;
      const I = clamp(intensity, 0, 1);
      // Relative speed sets the BRIGHTNESS and the LENGTH: a 50 m/s oncoming pass is a short
      // bright rip, a 12 m/s overtake is a longer, duller swell. 50 m/s is the measured
      // median relative speed of a real pass, so it sits mid-range here rather than at a limit.
      const rel = clamp(relSpeed / 60, 0.1, 1.3);
      const dur = 0.34 - 0.12 * rel;
      const fPeak = 620 + 1500 * rel;

      const src = ctx.createBufferSource();
      src.buffer = noisePink; src.loop = true;
      // Q 0.6, not 1.1. Air rushing past is BROADBAND - a narrow band on pink noise is both
      // the wrong shape (it whistles) and lossy enough that the burst measured at or under
      // the idle engine floor no matter what the gain constant said.
      const f = mkFilt('bandpass', fPeak * 0.45, 0.6);
      // Up into the pass and down out of it. Two ramps, not one: a single sweep across the
      // whole burst gives a siren, and a car going by is symmetrical about the moment it is
      // beside you.
      f.frequency.setValueAtTime(fPeak * 0.45, now);
      f.frequency.exponentialRampToValueAtTime(fPeak, now + dur * 0.45);
      f.frequency.exponentialRampToValueAtTime(fPeak * 0.40, now + dur);

      const g = mkGain(1e-4);
      // 2.2 is MEASURED, not guessed (tools/_passlevel.mjs): at full intensity and 50 m/s it
      // lands the whoosh ~11 dB under a full crash at the master output, and ~1.8x above the
      // idle engine floor. Both halves matter - an earlier 0.42 sat BELOW the engine, and the
      // reading that seemed to justify it was measuring the engine itself. Changing the bus or
      // the filter Q changes this number: re-measure, do not scale it by ear.
      g.gain.exponentialRampToValueAtTime(2.2 * I, now + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(1e-4, now + dur);

      let tail = g;
      if (side && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        // Sweeps from slightly ahead-of-centre out to the passing side and back in, which is
        // what makes it read as movement rather than as a noise burst parked in one ear.
        p.pan.setValueAtTime(clamp(side * 0.25, -1, 1), now);
        p.pan.linearRampToValueAtTime(clamp(side * 0.95, -1, 1), now + dur * 0.5);
        p.pan.linearRampToValueAtTime(clamp(side * 0.35, -1, 1), now + dur);
        g.connect(p); tail = p;
      }
      // busFx, NOT busWind, and the routing is the whole reason this used to be inaudible.
      // Every bed bus (engine/tyre/wind/boost/rivals) lands on `preMaster`, which is BED_TRIM
      // = 0.22, about 13 dB down, and then goes through the glue compressor - so a whoosh on
      // busWind was trimmed 13 dB AND ducked by the engine, at exactly the throttle setting a
      // pass happens at. A pass is an EVENT, like an impact, so it belongs on the path built
      // for events: busFx's dry bypasses both via `fxDirect`.
      tail.connect(busFx.input);
      src.connect(f); f.connect(g);
      src.start(now); src.stop(now + dur + 0.02);
      src.onended = () => { try { tail.disconnect(); g.disconnect(); f.disconnect(); } catch (e) { /* noop */ } };
    },

    /**
     * Boost press refused by the full-bar rule: a short two-note "not yet" thunk. Falling
     * minor-second dyad, low and dry, on busFx like every other event - it has to read as a
     * deliberate refusal, not a glitch. Quiet by design: it fires on a button the player
     * just pressed, so no distance or surprise to sell.
     */
    boostDenied() {
      if (!running) return;
      const now = ctx.currentTime;
      const g = mkGain(1e-4);
      g.gain.exponentialRampToValueAtTime(0.55, now + 0.012);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 0.16);
      for (const [f0, f1] of [[330, 262], [165, 131]]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(f1, now + 0.10);
        o.connect(g);
        o.start(now); o.stop(now + 0.18);
        o.onended = () => { try { o.disconnect(); } catch (e) { /* noop */ } };
      }
      g.connect(busFx.input);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* noop */ } }, 400);
    },

    /**
     * NPC car horn at a head-on hero. Classic dual-tone (F#4/A#4 region) from two slightly
     * detuned squares through a bandpass - the beat between them is what reads "car horn"
     * rather than "synth chord". Per-call random detune so a street of honkers is a crowd,
     * not a loop. `urgency` sets length: a startled blip vs leaning on it. Panned to the
     * car's side, level scaled down with distance.
     */
    horn({ side = 0, urgency = 0.6, dist = 30 } = {}) {
      if (!running) return;
      const now = ctx.currentTime;
      const dur = 0.22 + 0.7 * clamp(urgency, 0, 1);
      const det = 0.96 + Math.random() * 0.08;              // per-car pitch identity
      const lvl = 0.5 * clamp(1 - dist / 90, 0.25, 1);
      const f = mkFilt('bandpass', 780 * det, 1.4);
      const g = mkGain(1e-4);
      g.gain.exponentialRampToValueAtTime(lvl, now + 0.02);
      g.gain.setValueAtTime(lvl, now + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(1e-4, now + dur);
      let tail = g;
      if (side && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(clamp(side * 0.7, -1, 1), now);
        g.connect(p); tail = p;
      }
      for (const f0 of [370, 466]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(f0 * det, now);
        // small downward drift as it goes by - cheap doppler read
        o.frequency.linearRampToValueAtTime(f0 * det * 0.97, now + dur);
        o.connect(f);
        o.start(now); o.stop(now + dur + 0.02);
        o.onended = () => { try { o.disconnect(); } catch (e) { /* noop */ } };
      }
      f.connect(g);
      tail.connect(busFx.input);
      setTimeout(() => { try { tail.disconnect(); g.disconnect(); f.disconnect(); } catch (e) { /* noop */ } }, (dur + 0.3) * 1000);
    },

    /**
     * Boost bar just reached FULL: a bright rising two-note chime, the inverse of
     * boostDenied's falling refusal. It answers the full-bar rule - the moment this plays,
     * the button works. Same dry busFx event path, slightly louder than the refusal because
     * it fires without a button press to anchor attention.
     */
    boostReady() {
      if (!running) return;
      const now = ctx.currentTime;
      const g = mkGain(1e-4);
      g.gain.exponentialRampToValueAtTime(0.7, now + 0.015);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 0.30);
      for (const [f0, f1, dly] of [[523, 659, 0], [1046, 1318, 0.07]]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f0, now + dly);
        o.frequency.exponentialRampToValueAtTime(f1, now + dly + 0.09);
        o.connect(g);
        o.start(now + dly); o.stop(now + dly + 0.24);
        o.onended = () => { try { o.disconnect(); } catch (e) { /* noop */ } };
      }
      g.connect(busFx.input);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* noop */ } }, 600);
    },

    /**
     * Impact: body thud + sub, a bank of metallic resonances, a glass shard cloud and a
     * debris tail, with the CC0 crash layered underneath when it decoded.
     */
    crash(intensity = 1, { glass = 1, metal = 1 } = {}) {
      if (!running) return;
      const now = ctx.currentTime;
      const I = clamp(intensity, 0, 1.4);
      const dest = busFx.input;

      // Let the hit breathe - but briefly. A 0.28x duck held for 0.9 s is 11 dB of
      // engine gone for a second, which measured as the mix envelope sitting BELOW
      // its pre-impact level for ~1.4 s: pumping, not impact. The gesture is worth
      // keeping, so it is now a 130 ms dip that is back to unity before the crash's
      // own body has decayed.
      const d = engine.duck.gain;
      d.cancelScheduledValues(now);
      d.setValueAtTime(Math.max(0.05, d.value), now);
      d.linearRampToValueAtTime(0.5, now + 0.015);
      d.linearRampToValueAtTime(1.0, now + 0.13);

      tone(dest, { at: now, dur: 0.42, f0: 170, f1: 34, peak: 0.80 * I });
      tone(dest, { at: now, dur: 0.70, f0: 72, f1: 24, peak: 0.55 * I });

      const nMetal = 5 + Math.floor(R() * 4);
      for (let i = 0; i < nMetal; i++) {
        grain(dest, {
          at: now + R() * 0.24 * (i / nMetal + 0.2),
          dur: 0.06 + R() * 0.34,
          freq: 600 + R() * 3900, q: 8 + R() * 16,
          peak: (0.30 + R() * 0.28) * I * metal,
        });
      }
      grain(dest, { at: now, dur: 0.32, freq: 900, q: 0.6, peak: 0.45 * I * metal });

      const nGlass = 14 + Math.floor(R() * 12);
      for (let i = 0; i < nGlass; i++) {
        grain(dest, {
          at: now + 0.02 + Math.pow(R(), 1.6) * 0.95,
          dur: 0.012 + R() * 0.05,
          freq: 3200 + R() * 6200, q: 10 + R() * 20,
          peak: (0.06 + R() * 0.14) * I * glass,
        });
      }

      // ---------------------------------------------------------------------
      // Post-impact settle, two stages. Round 6 bought punch by deleting body:
      // everything above is over inside 230 ms, so the isolated crash measured a
      // 24.9 dB crest (references: 15.5 / 15.1) and a bit-exact-zero 2-4.5 s tail
      // in `open` and `city`. A collision is not a spike - it is a spike followed
      // by a structure ringing and parts landing. Both stages below are deliberately
      // ZERO-ATTACK-FREE and sit 8-14 dB under the transient, so they lengthen the
      // decay and raise the RMS without touching the peak the punch metric reads.
      // ---------------------------------------------------------------------

      // ---------------------------------------------------------------------
      // Frequency-dependent damping. Round 7 gave the tail a body but damped it the
      // WRONG WAY ROUND: measured T60 rose from 0.91 s at 63 Hz to 4.81 s at 8 kHz, a
      // 5.3x spread, where crash-impact-02 FALLS 2.16 -> 1.16 s (0.54x). Physically the
      // HF must die first - a mode's loss factor rises with frequency and air absorption
      // goes as f^2 - so a real wreck's tail darkens as it fades. A static band cannot
      // express that; the cutoff has to move. Two cascaded 2-pole lowpasses (24 dB/oct)
      // sweeping 9 kHz -> 250 Hz over ~1.9 s ARE the damped-mode envelope: at 8 kHz the
      // corner passes by within ~200 ms so that band's decay is set by the sweep, while
      // 63 Hz stays in the passband the whole time and decays only at its own modal rate.
      // Only the TAIL is routed through it. The impact transient, the metal grains, the
      // glass shards and the dry sample all stay wired straight to `dest`, because the
      // attack has to keep its full bandwidth and its peak - the crest and centroid
      // metrics read the first 50 ms and must not move.
      // ---------------------------------------------------------------------
      const tail = ctx.createGain();
      {
        const F_HI = 9000, F_LO = 1000, SWEEP = 1.5;
        const d1 = mkFilt('lowpass', F_HI, 0.7);
        const d2 = mkFilt('lowpass', F_HI, 0.7, dest);
        for (const fp of [d1.frequency, d2.frequency]) {
          fp.setValueAtTime(F_HI, now);
          fp.exponentialRampToValueAtTime(F_LO, now + SWEEP);
        }
        tail.connect(d1); d1.connect(d2);
      }

      // Stage 1 - modal ring bank. Bending-mode frequencies of a car's own panels:
      // door/roof skins land in the low hundreds, wheel arches and the bonnet higher.
      // Independent T60s make the bank fan out rather than fade as one block. The last
      // two are the long, quiet structural modes - a wrecked shell genuinely creaks
      // for seconds, and they are what puts real energy in the 2-4.5 s window that a
      // 0.8-1.5 s bank alone cannot reach.
      // The amplitudes used to be tilted UP with frequency to protect the band shape,
      // but with the sweeping lowpass above in place the HF tilt is no longer load-
      // bearing and it was starving the bottom: the isolated crash measured only 4.3%
      // of its energy under 120 Hz against 20.1% in crash-impact-02. So the low half of
      // the bank is now the LOUD, LONG half. The two sub modes are the shell's whole-body
      // boom rather than a panel bending mode, which is what actually carries a wreck's
      // 63 Hz band for two seconds; 163/349 are up ~10 dB and 188/274 now ring past 2 s.
      const MODES = [
        { f: 34, t60: 1.40, a: 0.185, q: 2.5 },
        { f: 45, t60: 1.70, a: 0.56, q: 3 },
        { f: 68, t60: 2.30, a: 0.30, q: 3 },
        { f: 96, t60: 2.15, a: 0.33, q: 3.5 },
        { f: 122, t60: 2.25, a: 0.34, q: 3.5 },
        { f: 163, t60: 2.60, a: 0.26, q: 4 },
        { f: 188, t60: 2.20, a: 0.345, q: 4 },
        { f: 274, t60: 2.10, a: 0.435, q: 4.5 },
        { f: 349, t60: 2.20, a: 0.33, q: 5 },
        { f: 406, t60: 1.40, a: 0.34, q: 10 },
        { f: 611, t60: 1.30, a: 0.38, q: 11 },
        { f: 902, t60: 1.15, a: 0.36, q: 12 },
        { f: 1342, t60: 1.05, a: 0.30, q: 13 },
        { f: 1980, t60: 0.90, a: 0.28, q: 14 },
      ];
      for (let i = 0; i < MODES.length; i++) {
        const m = MODES[i];
        ringMode(tail, {
          // The sub modes come in 60-140 ms LATE on purpose. They are the shell's
          // whole-body boom, which builds as the structure folds rather than arriving
          // with the first contact, and holding them off the transient keeps them from
          // stacking onto the sample peak - the crash is already at 0 dBFS.
          at: now + (m.f < 130 ? 0.06 + R() * 0.08 : 0.012 + R() * 0.035),
          freq: m.f * (0.94 + R() * 0.12),
          t60: m.t60 * (0.85 + R() * 0.3),
          peak: m.a * I * (0.5 + 0.5 * metal),
          q: m.q,
          // Wide skins on the low modes. A bank of ten sines is a COMB: measured against
          // ref-02 our band curve matched at the mode frequencies and sat 8-10 dB low in
          // the troughs between them. A mode's noise skin is f/q wide, so dropping Q on
          // the low half and pushing its sine/noise balance toward noise makes the bank
          // sum to a continuum - which is what crushing sheet steel actually radiates.
          noise: m.f >= 130 && m.f < 420 ? 0.86 : 0.6,
          // alternate sides: eight modes all centred would re-correlate the tail that
          // the tunnel measurement wants decorrelated
          pan: (i % 2 ? 1 : -1) * (0.15 + R() * 0.4),
        });
      }

      // Stage 2 - debris. A Poisson process whose rate falls 60/s -> 5/s while its
      // level falls 25 dB, which is what "bits stop arriving AND the bits that do
      // arrive are smaller" sounds like. Exponential inter-arrival times, not a fixed
      // grid: a grid at 60/s is a 60 Hz buzz.
      {
        const T = 1.5;
        let t = 0.05;
        for (let n = 0; n < 220; n++) {
          const u = clamp(t / T, 0, 1);
          t += -Math.log(1 - R() * 0.999) / (60 * Math.pow(5 / 60, u));
          if (t >= T) break;
          const fall = Math.pow(10, (-25 * u) / 20);
          grain(tail, {
            at: now + t,
            dur: 0.018 + R() * 0.07,
            freq: 420 + Math.pow(R(), 1.5) * 4200,
            q: 5 + R() * 16,
            peak: (0.14 + R() * 0.19) * I * fall * (0.55 + 0.45 * metal),
            pan: (R() * 2 - 1) * 0.85,
          });
        }
        // sparse late settle: a handful of low creaks out past the debris shower
        for (let i = 0; i < 7; i++) {
          grain(tail, {
            at: now + 1.3 + R() * 1.6,
            dur: 0.09 + R() * 0.5,
            freq: 190 + Math.pow(R(), 2) * 1400,
            q: 7 + R() * 12,
            peak: (0.012 + R() * 0.022) * I,
            pan: (R() * 2 - 1) * 0.7,
          });
        }
      }

      // Pink settle beds. These two mid/HF beds were the actual inverted-damping
      // culprit: at dur 2.0 s and 2.4 s they OUTLASTED every low mode, so the last
      // second of the crash was a bright hiss over a bass that had already gone. They
      // are now 0.7 s and 0.6 s - long enough to bridge the transient into the ring
      // bank, short enough that they no longer set the HF decay time - and they go
      // through `tail`, so what is left of them darkens as it fades. The 700 Hz
      // continuation keeps its 4 s length: it is what stops the SOURCE reaching a
      // bit-exact zero at 4 s (without it, `open` and `city` measured the tail at
      // -233 dB and only `tunnel` "rang", which was the reverb masking silence), and
      // at 700 Hz the sweep still darkens it without deleting it.
      grain(dest, { at: now + 0.06, dur: 0.70, freq: 1500, q: 0.5, peak: 0.30 * I, pink: true, endRel: 0.10 });
      grain(tail, { at: now + 0.35, dur: 4.0, freq: 700, q: 0.6, peak: 0.045 * I, pink: true, endRel: 0.08 });
      grain(dest, { at: now + 0.05, dur: 0.95, freq: 3000, q: 0.5, peak: 0.57 * I, pink: true, endRel: 0.08 });
      // The references' top two octaves are not empty - crash-impact-02 still sits 25 dB
      // under its peak at 9 kHz where we were 47 dB under. This 6 kHz splash supplies
      // that, DIRECT and short: brightness has to come from a loud burst inside the
      // impact, never from a long HF bed, or the damping slope inverts again.
      grain(dest, { at: now + 0.035, dur: 0.60, freq: 6000, q: 0.4, peak: 0.70 * I * glass, pink: true, endRel: 0.05 });
      grain(dest, { at: now + 0.028, dur: 0.45, freq: 13000, q: 0.5, peak: 0.55 * I * glass, pink: true, endRel: 0.04 });
      // Low body bed. Ten discrete modes leave a COMB: measured against ref-02 the band
      // curve matched at the mode frequencies but sat 8-9 dB low in the troughs between
      // them (95, 200 and 440 Hz). Real crush noise fills those - it is a continuum, not
      // a bank - so this is one wide (Q 0.4, so roughly 70-700 Hz) low bed through the
      // same damping, which smooths the comb without adding another tuned pitch.
      grain(tail, { at: now + 0.03, dur: 1.5, freq: 210, q: 0.4, peak: 0.45 * I, pink: true, endRel: 0.10 });

      // Trimmed to the impact itself. The CC0 crashes are 2.5 s and 4.2 s long and
      // most of that is the *recording's own room* - layering that under our
      // convolver put a fixed 4 s tail into every space, which is a second reason
      // open/city/tunnel all sounded alike (and it dominated the measured decay time
      // whichever way the coin fell on which of the two samples played). The dry
      // layer now supplies the transient only; the room comes from setSpace.
      playSample(R() < 0.5 ? 'crashGlass' : 'crashDry',
        { level: 0.55 * I, rate: 0.94 + R() * 0.12, dest, dur: 0.55 });
    },

    /** Per-frame mix drive. Cheap by design: AudioParam ramps only, no node churn. */
    update(dt, s = {}) {
      if (!running || !built) return;
      const now = ctx.currentTime;
      const rpm01 = clamp(s.rpm01 || 0, 0, 1);
      const speed = Math.abs(s.speed || 0);
      const speed01 = clamp(speed / 90, 0, 1.3);
      const boostAmt = clamp(s.boost || 0, 0, 1);
      const wet = clamp(s.wet || 0, 0, 1);
      const brake = clamp(s.brake || 0, 0, 1);
      const slip = clamp(Math.abs(s.slip || 0), 0, 1);
      const throttle = s.throttle === undefined ? 1 - brake : clamp(s.throttle, 0, 1);
      const load = clamp(s.load === undefined ? throttle * (0.35 + rpm01 * 0.65) : s.load, 0, 1);
      const gear = s.gear || 0;

      if (!prev.inited) { prev.gear = gear; prev.load = load; prev.boost = boostAmt; prev.inited = true; }

      // edge-triggered one-shots
      if (gear && prev.gear && gear !== prev.gear) api.gearShift(prev.gear, gear, 0.5 + load * 0.5);
      if (boostAmt > 0.08 && prev.boost <= 0.08) api.boostHit(0.6 + speed01 * 0.4);

      engine.set(now, { rpm01, load, gainMul: 1, tc: 0.035 });

      // overrun crackle: a sharp throttle lift at high rpm pops the exhaust
      overrunTimer = Math.max(0, overrunTimer - (dt || 0));
      if (load < prev.load - 0.30 && rpm01 > 0.45 && overrunTimer <= 0) {
        overrunTimer = 0.35;
        const n = 2 + Math.floor(R() * 4);
        for (let i = 0; i < n; i++) {
          grain(busEngine.input, {
            at: now + R() * 0.38, dur: 0.02 + R() * 0.05,
            freq: 700 + R() * 2200, q: 3 + R() * 6,
            peak: (0.10 + R() * 0.16) * rpm01,
          });
        }
      }

      // Boost sidechain, driven by the afterburner's own contour rather than by a
      // flat `boostAmt`. `boostVoice.set` returns the contour normalised so that the
      // sustain reads 0 - the engine pumps down hard on the ignition transient and is
      // fully back by the time the whoosh settles. A permanently-held 4.7 dB dip in
      // the engine for as long as boost is pressed just sounded like a broken mix.
      // Depth is 0.28, not the old 0.45: at 0.45 the engine lost 4.7 dB the instant
      // boost was pressed, and since the engine is the loudest thing in the bed that
      // duck alone measured -1.05 dB on the whole mix - more than the afterburner was
      // putting back. The pump has to be a transient colour, not a net level loss.
      const bEnv = boostVoice.set(now, dt || 0, boostAmt, speed01);
      ramp(engine.duck.gain, 1 - clamp(bEnv, 0, 1) * 0.28, now, 0.08);

      tyreVoice.set(now, { slip, brake, handbrake: !!s.handbrake, speed01, wet });
      windVoice.set(now, s.airborne ? speed01 * 1.15 : speed01, boostAmt);

      if (s.listener) api.setListener(s.listener.pos, s.listener.fwd, s.listener.up, s.listener.vel);

      prev.load = load; prev.gear = gear; prev.boost = boostAmt;
      prev.slip = slip; prev.rpm01 = rpm01; prev.speed = speed;
    },

    info() {
      return {
        mode: 'webaudio',
        running,
        state: ctx ? ctx.state : 'closed',
        space: curSpace,
        samples: Object.keys(samples).length,
        rivals: rivals.size,
        sampleRate: ctx ? ctx.sampleRate : 0,
      };
    },
  };

  return api;
}

// ---------------------------------------------------------------------------
// FDN geometry (module scope - it never depends on the context)
// ---------------------------------------------------------------------------
const FDN_N = 8;
const FDN_NORM = 1 / Math.sqrt(FDN_N);
const FDN_BASE = 0.0165;   // s, shortest loop at size 1
// Two unrelated ratio sets so the left and right networks share no delay length.
const FDN_RATIOS = [
  [1.00, 1.13, 1.29, 1.44, 1.61, 1.77, 1.93, 2.11],
  [1.07, 1.22, 1.35, 1.53, 1.68, 1.86, 2.04, 2.23],
];
// Independent Schroeder all-pass chains, ms.
const AP_MS = [[5.1, 7.3, 11.1, 14.9], [6.2, 8.9, 12.7, 17.3]];

/** Smallest prime >= n. Mutually-prime loop lengths keep the modes from piling up. */
function nextPrime(x) {
  let n = Math.max(3, Math.floor(x));
  if (n % 2 === 0) n++;
  for (; ; n += 2) {
    let p = true;
    for (let d = 3; d * d <= n; d += 2) if (n % d === 0) { p = false; break; }
    if (p) return n;
  }
}

/** In-place fast Walsh-Hadamard transform, length 8. Scale by 1/sqrt(8) to unitarise. */
function fwht(v) {
  for (let len = 1; len < FDN_N; len <<= 1) {
    for (let i = 0; i < FDN_N; i += len << 1) {
      for (let j = i; j < i + len; j++) {
        const a = v[j], b = v[j + len];
        v[j] = a + b; v[j + len] = a - b;
      }
    }
  }
}

/** Standard Schroeder all-pass, applied in place. Adds density, not colour. */
function allpassInPlace(d, L, g) {
  const buf = new Float32Array(L);
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    const b = buf[p];
    const v = d[i] + g * b;
    d[i] = b - g * v;
    buf[p] = v;
    p = p + 1 === L ? 0 : p + 1;
  }
}

// ---------------------------------------------------------------------------
// reverb presets - `taps` is a thunk so each IR gets its own scatter
//
// `revReturn` scales the wet; `rt60` and `size` shape the tail; `tapGain` is the
// early-reflection energy as a fraction of the late field's - and, see makeIR, also
// multiplies the wet LEVEL by sqrt(1 + tapGain^2), so the two are calibrated
// together. The tunnel is the outlier by design: a 6.5 s slow tail, almost no HF
// damping, a +8 dB low shelf and a 60 Hz flutter comb carrying 1.7x the tail's own
// energy.
// ---------------------------------------------------------------------------
//
// The three presets are now separated on THREE independent axes at once, because
// round 5 separated open from city on none of them and they measured 0.23 dB apart
// over a 40-band envelope - literally the same room:
//
//   level  revReturn 0.45 / 1.20 / 1.95, but read that through the tapGain factor
//          above: the effective wet/dry the player's engine sees is roughly
//          0.38 / 1.17 / 1.35. An open road is not a room, so its wet is one dull
//          distant slap; a street canyon and a tunnel are both genuinely wet.
//   colour lp 900 / 11000 / 2600, plus a return high-pass at 20 / 120 / 20 Hz and a
//          240 Hz shelf of +2 / -8 / +8 dB. This is the axis that actually moves a
//          banded spectral envelope, and it is what finally split open from city.
//          Open hears one reflection from far away, and distance is a low-pass: air
//          absorption plus ground and foliage scatter, so its wet is a dull thud.
//          A concrete or glass facade 5-10 m away reflects HF almost perfectly but
//          is far too small to return anything below a couple of hundred Hz, so
//          city's wet is a thin bright shimmer sitting on a dry engine - the
//          BRIGHTEST of the three and the one that adds the least total energy.
//          A long tunnel is dark: the HF is absorbed over hundreds of metres.
//   shape  open is a bare pair of late slap reflections on almost no tail; city is
//          early-reflection dominated (tapGain 2.6 against a 0.55 s tail) with a
//          facade tap pattern; tunnel is a 6.5 s diffuse tail with a 60 Hz flutter
//          comb.
//
const SPACES = {
  open: {
    revReturn: 0.45, lp: 900, hp: 20, shelf: 2.0,
    ir: {
      seconds: 0.36, rt60: 0.20, size: 0.55, hfDamp: 0.85, width: 0.55, predelay: 0.020,
      tapGain: 2.20, fadeOut: 0.35, taps: () => [[0.082, 1.0], [0.121, 0.42]],
    },
  },
  city: {
    revReturn: 1.20, lp: 11000, hp: 120, shelf: -8.0,
    ir: {
      seconds: 1.1, rt60: 0.55, size: 0.70, hfDamp: 0.60, width: 0.85, predelay: 0.013,
      tapGain: 2.60, buildUp: 0.03, fadeOut: 0.25, taps: () => FACADE(0.027, 0.063, 5, 0.9),
    },
  },
  tunnel: {
    revReturn: 1.95, lp: 2600, hp: 20, shelf: 8.0,
    ir: {
      seconds: 4.0, rt60: 6.5, size: 1.9, hfDamp: 0.20, width: 0.98, predelay: 0.006,
      tapGain: 1.70, buildUp: 0.06, fadeOut: 0.30, taps: () => PERIODIC(0.0165, 30, 0.955, 0.90),
    },
  },
};
function SPACES_HAS(id) { return Object.prototype.hasOwnProperty.call(SPACES, id); }
const TAP_RNG = makeRandom(0xB0057);
/**
 * Regular echo train - the tunnel's flutter comb. `skip` delays the first tap so the
 * comb lands entirely in the late field: the first few bounces off a tunnel's walls
 * are swallowed by the car and the road surface anyway, and keeping them out of the
 * first 80 ms is what lets the tunnel read as diffuse (low C80) rather than merely
 * loud. Spacing 16.5 ms is a 60.6 Hz comb - the classic parallel-wall ring.
 */
function PERIODIC(spacing, count, falloff, g0, skip = 0) {
  const out = [];
  for (let k = 1 + skip; k <= count + skip; k++) out.push([spacing * k, g0 * Math.pow(falloff, k - skip)]);
  return out;
}
/**
 * Street-canyon early reflections. A car in a city street sits between two roughly
 * parallel hard facades at unequal distances, so the pattern is two interleaved
 * slapback trains - `near` and `far` round-trip times and their repeats - rather
 * than the diffuse scatter a room gives. `near`/`far` are round trips: 27 ms is a
 * facade 4.6 m away, 63 ms is one 10.8 m across the street.
 */
function FACADE(near, far, count, g0, falloff = 0.70) {
  const out = [];
  for (let k = 1; k <= count; k++) {
    const g = g0 * Math.pow(falloff, k - 1);
    out.push([near * k * (0.94 + TAP_RNG() * 0.12), g]);
    out.push([far * k * (0.94 + TAP_RNG() * 0.12), g * 0.75]);
  }
  return out;
}
