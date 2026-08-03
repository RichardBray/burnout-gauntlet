// boost.js — the "going very fast" package.
//
// Four cooperating pieces, all gated on one 0..1 `amount` with a fast attack and a slow decay:
//
//   1. A full-screen pass (runs after bloom, before the output/tonemap pass, so it is HDR in
//      and HDR out) doing: barrel distortion -> tyre heat-haze warp -> radial motion blur about
//      the *focus of expansion* -> colour-buffer speed streaks -> chromatic aberration -> vignette.
//   2. A per-pipe afterburner jet: a raymarched cone volume anchored to each tailpipe and
//      oriented down the exhaust axis, with the blackbody ramp running ALONG the jet
//      (tinted throat -> blue -> green-yellow -> orange -> olive smoke).
//   3. A world-space dust + spark trail off the rear contact patches.
//   4. The car's own exhaust heat glow (car.setBoostGlow).
//
// Why the blur origin is the focus of expansion and not the frame centre: under forward camera
// translation every static point in the world slides directly away from the projection of the
// velocity vector. That point sits above screen centre on a chase cam that looks slightly down
// at the road, which is exactly where the streaks converge in the reference stills. Blurring
// about the frame centre instead parks the still point on the tarmac and shears the sky sideways.
//
// Why the hero car gets a soft mask: in Burnout the car punches a hole through the blur field.
// The hole is the car's *silhouette* — an offscreen white-on-black render of the hero mesh alone,
// dilated and softened by ~4% of frame height — not a blob sized off its bounding radius. That
// distinction is the whole effect: the tarmac a car-width away has to be tearing at 40+ px while
// the panel lines stay untouched. A generous radial hole zeroes the blur over the car *and* over
// everything adjacent to it, which leaves blur only at the frame corners and reads as a dirty
// lens rather than as speed.
//
// API: createBoost(car) -> fx.  fx.pass (ShaderPass for the composer), fx.group (add to scene),
//   fx.update(dt, {amount, speed, pos, yaw}) — amount is the smoothed 0..1 boost blend.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeRng, clamp, lerp, damp, smoothstep } from './util.js';

// ===========================================================================
// 1. the screen-space pass
// ===========================================================================

const BoostShader = {
  uniforms: {
    tDiffuse: { value: null },
    tHero: { value: null },         // half-res hero-car silhouette, white on black
    tDepth: { value: null },        // half-res scene depth, same target as tHero
    uCamNF: { value: new THREE.Vector2(0.35, 6000) },  // camera near / far, for linearisation
    uDepthOn: { value: 0 },         // 1 once tDepth holds this frame's depth
    uAmount: { value: 0 },          // 0..1 envelope
    uSpeed01: { value: 0 },         // 0..1 speed term, scales kernel length a little
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },   // focus of expansion, uv
    uCar: { value: new THREE.Vector2(0.5, 0.5) },     // hero car centre, uv
    uJet: { value: new THREE.Vector2(0.5, 0.5) },     // far tip of the exhaust jets, uv
    uCarR: { value: 90 },                             // hero car screen radius, px
    uHeroSoft: { value: 30 },                         // silhouette dilate/soften radius, px
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    // 0 = normal. 1 = show the hero mask as greyscale. 2 = passthrough (pass disabled in place).
    // Diagnostic only; flipped by hand when the mask needs verifying.
    uDebug: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tHero;
    uniform sampler2D tDepth;
    uniform float uAmount, uSpeed01, uTime, uCarR, uHeroSoft, uDebug, uDepthOn;
    uniform vec2 uFocus, uCar, uJet, uResolution, uCamNF;
    varying vec2 vUv;

    // window-space depth -> positive view distance in metres.
    float viewDist(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      float n = uCamNF.x, f = uCamNF.y;
      return (2.0 * n * f) / (f + n - (d * 2.0 - 1.0) * (f - n));
    }

    // interleaved-gradient noise — cheap, isotropic, no visible lattice. Used to jitter the tap
    // positions so a 16-tap kernel does not lay down 16 discrete ghosts, which is the "stack of
    // copies" banding that gives away every cheap radial blur.
    float ign(vec2 p) {
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }

    // ---- over-unity shoulder for the two max() branches ----------------------------------
    // This pass runs INSIDE the HDR chain (main.js adds it to the composer before the output
    // pass, and post.js:256 makes the composer target HalfFloatType), so tDiffuse really does
    // carry values well above 1.0 — crash.js emits its sparks additively at r = 2.8.
    //
    // A mean is safe with that: 2.8 over one tap of twenty arrives as 0.14. A max() is NOT.
    // max() latches the single brightest station on the ray and then paints that value across
    // the whole kernel at full strength, so one over-unity spark becomes a ~90 px solid bar
    // whose ends are square because there is no headroom left above it for a taper to work in.
    // You cannot roll a value off with max(); the roll-off has to happen to the value itself,
    // BEFORE it is broadcast down the ray.
    //
    // So both max() branches push their latched value through this shoulder first. It is a
    // Reinhard knee applied to LUMA (chroma rides along, so a red spark stays red rather than
    // desaturating toward white as it compresses):
    //
    //     out = KNEE + H * ex / (H + ex),   ex = max(lum - KNEE, 0),  H = CEIL - KNEE
    //
    // Unit slope at ex = 0 (nothing below the knee is touched at all, so ordinary in-range
    // lane paint and taillights smear exactly as before), asymptote at CEIL. With
    // PK_KNEE 1.00 / PK_CEIL 1.60: 1.0 -> 1.000, 1.5 -> 1.273, 2.0 -> 1.375, 2.8 -> 1.450,
    // 10.0 -> 1.563, inf -> 1.600. Local gain at the 2.8 spark level is H^2/(H+ex)^2 = 0.0625,
    // i.e. 16:1 compression, and the whole 1.5..inf family lands inside 0.33 of a stop of
    // headroom instead of spanning the entire buffer. That headroom is what the along-ray
    // taper then has room to work in.
    const float PK_KNEE = 1.00;
    const float PK_CEIL = 1.60;
    vec3 shoulder(vec3 c) {
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      if (lum <= PK_KNEE) return c;
      float H = PK_CEIL - PK_KNEE;
      float ex = lum - PK_KNEE;
      return c * ((PK_KNEE + H * ex / (H + ex)) / lum);
    }

    void main() {
      vec2 res = uResolution;
      float halfH = 0.5 * res.y;

      // ---- radial frame, measured in pixels so 16:9 does not squash the falloff ----------
      vec2 dPix = (vUv - uFocus) * res;
      float rPix = length(dPix);
      float r = rPix / halfH;              // 1.0 == half the frame height
      vec2 dir = rPix > 1e-4 ? dPix / rPix : vec2(0.0, 1.0);
      vec2 stepUv = dir / res;             // one pixel along the radial direction, in uv
      // The angular coordinate is the PERPENDICULAR coordinate of the radial frame: it is
      // constant along a ray and varies only across rays. Hoisted here from the speed-line
      // block below. It is used ONLY by the speed-line band gate now; the bright-biased branch
      // used to hash floor(ang) for its sampling phase and that wedge lattice is deleted.
      float ang = atan(dir.y, dir.x);

      // ---- hero hole ------------------------------------------------------------------------
      // mask is 0 on the hero car and 1 everywhere the world is allowed to tear.
      //
      // This used to be an analytic capsule sized off the car's projected width. It was in the
      // right place and it did zero the kernel over the bodywork, but its soft edge ran from
      // 0.75*R to 2.15*R — with R ~ 295 px at 1080p that is a 600 px-radius hole. Everything
      // within half a screen of the car came out sharp too, so there was no torn world *touching*
      // the car and the only visible blur was out at the frame corners: a dirty lens, not a boost.
      // The contrast IS the effect, so the hole now has to be the car's actual silhouette.
      //
      // tHero is a half-res render of the hero mesh alone, white on black, with correct
      // self-occlusion. A cone-weighted 8x3 disc gather over a uHeroSoft-pixel radius turns that
      // hard silhouette into a coverage field that falls off smoothly outward - three rings
      // rather than one, because two rings quantise the ramp into visible steps.
      float cov = texture2D(tHero, vUv).r * 1.5;
      float cw = 1.5;
      for (int i = 0; i < 8; i++) {
        float a = (float(i) + 0.5) * 0.7853981634;
        vec2 d = vec2(cos(a), sin(a)) * (uHeroSoft / res);
        cov += texture2D(tHero, vUv + d * 0.35).r * 1.00;
        cov += texture2D(tHero, vUv + d * 0.70).r * 0.60;
        cov += texture2D(tHero, vUv + d).r        * 0.30;
        cw += 1.90;
      }
      cov /= cw;
      // Half coverage lands on the silhouette itself, so the knee sits below it: the bodywork and
      // a couple of pixels of its own edge are fully protected, and the ramp to open world runs
      // out over the dilation radius. A hard cut here is the seam the reference never shows.
      float hero = smoothstep(0.03, 0.62, cov);

      // The plumes are not in tHero (their impostor is a bounding quad, not a silhouette), so
      // they need their own protection. It used to be an analytic capsule on the car's centreline,
      // 0.32..0.66 of uCarR — at uCarR ~ 295 px that is 94 px of FULL protection ramping to 195,
      // i.e. a ~400 px round disc for a plume pair 300 px across. Two problems with that.
      //
      // The plume one is that it re-created the oversized analytic hole the silhouette prepass
      // exists to replace, so a car-width of tarmac either side of the jets came out sharp.
      // The worse one is the crash beat: main.js now drives uAmount from
      // max(boostBlend, crash.shutter01), so during a crash this disc is at full size around a car
      // that is not boosting, and it — not the silhouette — is what holds the ring of tarmac
      // around the wreck sharp. (The silhouette itself is correct and does pick up the crash-posed
      // car: measured mask 0.002 over the wreck's red roof panel.) Simply shrinking the capsule
      // put a visible seam across the plumes, because they sit ~110 px off the centreline the
      // capsule is measured from and a tight centreline capsule misses them entirely.
      //
      // So: SWEEP the silhouette back along the jet vector instead. A pixel is protected if the
      // car covered it anywhere between the pipes and the jet tip, which is exactly the region a
      // jet leaving the pipes can occupy, at the jets' real offsets and no wider. It costs four
      // extra 9-tap gathers and it collapses to almost nothing when the jet is short — during the
      // crash beat uJet - uCar is 66 px, so the swept hole is the wreck plus ~53 px rather than a
      // 400 px disc. The sweep stops at 0.8 of the jet vector, not 1.0: uJet is taken on the
      // centreline and the off-axis plumes project past it, but the silhouette's own lower edge
      // already starts ~100 px above the plume tip, so 0.8 covers it with less spare tarmac held
      // sharp. Measured protected fraction of the lower frame: 22.8% before (with the plumes
      // themselves only half covered), 28.9% now (plumes fully covered).
      vec2 jv = uJet - uCar;
      float jcov = 0.0;
      for (int i = 1; i <= 4; i++) {
        vec2 o = vUv - jv * (float(i) * 0.20);
        // two rings, same reason as the gather above: one ring quantises the ramp into steps and
        // a stepped mask edge is a seam straight across the tarmac.
        float c = texture2D(tHero, o).r * 1.5, w = 1.5;
        for (int k = 0; k < 4; k++) {
          float ak = (float(k) + 0.5) * 1.5707963268;
          vec2 d = vec2(cos(ak), sin(ak)) * (uHeroSoft / res);
          c += texture2D(tHero, o + d * 0.55).r * 1.00;
          c += texture2D(tHero, o + d * 1.05).r * 0.50;
          w += 1.50;
        }
        jcov = max(jcov, c / w);
      }
      hero = max(hero, smoothstep(0.12, 0.66, jcov));

      float mask = 1.0 - clamp(hero, 0.0, 1.0);

      // ---- how fast is THIS pixel actually moving across the screen? -----------------------
      // Under forward camera translation the radial screen speed of a static point is
      // proportional to (radius from the focus of expansion) / (view depth). The radial term was
      // already here; the 1/depth term was not, so the sky — at infinity, with a true screen
      // velocity of zero — was smeared exactly as hard as tarmac 3 m from the lens, and the whole
      // top half of frame turned into diagonal cloud streaks. No boost shot in the reference set
      // has that: in boost-blur-02 and -04 the sky and the distant hills are crisp and every
      // bit of the tearing lives on near ground and near side geometry.
      //
      // Z_REF is the depth that earns the full kernel. Anything nearer is clamped (it would want
      // more than the kernel is long); anything further falls off as 1/z, and past ~150 m a
      // smoothstep takes what is left to nothing so the vanishing point and the skyline stay
      // sharp. The 0.05 floor is the camera's own rotation and shake, which really is
      // depth-independent — it keeps a couple of pixels of life in the far field instead of
      // freezing it into a pasted-on still.
      float vdist = uDepthOn > 0.5 ? viewDist(vUv) : 14.0;
      const float Z_REF = 14.0;
      float velo = clamp(Z_REF / max(vdist, 1.0), 0.0, 1.0);
      velo *= 1.0 - smoothstep(95.0, 190.0, vdist);
      velo = max(velo, 0.05);

      if (uDebug > 3.5) { gl_FragColor = vec4(vec3(vdist / 300.0), 1.0); return; }
      if (uDebug > 1.5 && uDebug < 2.5) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      if (uDebug > 0.5 && uDebug < 1.5) { gl_FragColor = vec4(vec3(mask), 1.0); return; }

      // ---- barrel distortion + tyre heat haze, applied to the sampling coordinate ---------
      float k = uAmount * 0.030;
      vec2 uv0 = uFocus + (vUv - uFocus) * (1.0 - k * r * r);

      // Heat shimmer sits in a flat ellipse *below* the car — the strip of ground it has just
      // crossed. It must not reach the bodywork: warping the car's own silhouette reads as a
      // broken mesh, not as hot air.
      vec2 hz = (vUv - (uCar + vec2(0.0, -0.165))) / vec2(0.185, 0.060);
      float haze = exp(-dot(hz, hz) * 1.6) * uAmount * mask;
      float hw = sin(vUv.y * 190.0 - uTime * 15.0) * sin(vUv.x * 97.0 + uTime * 6.3)
               + 0.6 * sin(vUv.y * 331.0 + uTime * 26.0);
      uv0 += vec2(hw * 0.0016, hw * 0.0032) * haze;

      // ---- kernel length -------------------------------------------------------------------
      // Zero at the focus of expansion (a point on the velocity axis has no screen-space motion)
      // and growing outward. The previous curve did not reach half strength until r = 0.9, which
      // stacked a second attenuation on top of the already-oversized hero hole: the tarmac
      // alongside the car — the closest, fastest-moving surface in frame — barely moved. It now
      // ramps from just outside the FOE, so the road beside the car carries 40+ px of streak and
      // the car's sharp edge cuts straight through it.
      float falloff = pow(smoothstep(0.04, 1.05, r), 1.15);
      // ---- THE SPEED SPLIT IS ALREADY EXACTLY RIGHT. DO NOT "FIX" IT. (wave R) --------------
      //
      // Every wave since N has read the 0.30 as an arbitrary floor and reached for it. Both the
      // wave-P comment that used to stand here and the wave-Q brief's headline gap argued the same
      // thing: "a shutter smear is a distance travelled during the exposure, so at uSpeed01 = 0 it
      // is zero, and a 30% floor is not defensible." That argument is WRONG, and it is wrong for a
      // reason you can only see by reading the producer rather than this line.
      //
      //   boost.js:1425   const spd01 = clamp((Math.abs(speed) - 26) / 66, 0, 1);
      //
      // uSpeed01 is NOT a speed fraction. It is an AFFINE map with a 26 m/s dead zone, so
      // uSpeed01 = 0 means "at or below 26 m/s", NOT "stopped". Inverting it, speed = 26 + 66*s,
      // and a smear that is genuinely linear in speed, normalised to 1.0 at s = 1 (92 m/s), is
      //
      //   (26 + 66*s) / 92  =  0.2826 + 0.7174*s
      //
      // against the shipped 0.30 + 0.70*s. Within 6% at s = 0 and exact at s = 1. **The 0.30 IS
      // the physically correct affine reconstruction of the dead zone, arrived at by accident.**
      // Driving it to zero would be a range violation in the other direction: it would claim the
      // car is stationary at 26 m/s.
      //
      // So this factor cannot be the lever at either end, and the arithmetic bounds how much is on
      // the table. Replacing 0.30 + 0.70*s with the exact 0.2826 + 0.7174*s moves the crash beat
      // (s = 0, uAmount 0.27087) from 5.85 px to 5.51 px, a 6% change. Even the *maximally*
      // aggressive reading - pretend uSpeed01 really is a speed fraction and use bare uSpeed01 -
      // only takes the crash beat to 0 while also taking boost-blur 41.0 -> 27.7 px, i.e. it pays
      // for the crash beat with a third of the scene the pass exists for. The crash-beat damage is
      // NOT here. It is in the mean at :378-396, and it is fixed by the length gate below.
      float lenPix = uAmount * (0.30 + 0.70 * uSpeed01) * 72.0 * falloff * mask * velo;

      // ---- THE SUB-FEATURE LENGTH GATE: a mean shorter than what it consumes is pure loss ----
      //
      // Rule 4 in the spatial domain. A trailing mean of length L over a feature of width w
      // attenuates that feature's peak to roughly w/L while producing a streak only L long. So
      // there is a band of kernel lengths in which this pass is ALL cost and NO smear, and both
      // edges of that band are SET by the narrowest, shortest thing in frame rather than chosen:
      //
      //   * lower knee 3.0 px = 2x the spark sliver's own width (widPx p50 1.426, standing
      //     constraint 2j). At L = 2w the sliver has already lost half its contrast.
      //   * upper knee 12.5 px = the sliver's own LENGTH (lenPx p50 12.52). A smear shorter than
      //     the object it smears is not a smear, it is a softer copy of the object.
      //
      // This is the same conclusion the bright-biased branch's gate at :507 reached independently
      // ("below ~9 px the pk ray and the mean ray cover the same handful of pixels"), applied to
      // the branch that was actually doing the damage.
      //
      // It gates the OUTPUT, not lenPix. Shortening the kernel instead keeps the attenuation and
      // merely shrinks the streak - the wrong half of the trade.
      //
      // MEASURED, paired A/B interleaved A,B,A,B with peer md5 held (wave R; tools/_sparkboost.mjs,
      // beauty frames, spark-attributable = visible minus hidden, patch S 0.30,0.75,0.42,0.72,
      // uAmount 0.27087, uSpeed01 0). At lenPix 5.85 px this gate stands at 0.216, and boost LIVE's
      // retention of the boost-0 spark population improves as follows. It is a real recovery of
      // roughly 2x on the tail and it is NOT a pass of T3's >= 90% bar; do not read it as one.
      //   _debrismeas blob count      63% -> 79%   (46/73 -> 56/71)
      //   _sparkdiff diff-image p99   46% -> 65%   (50.45/109.75 -> 71.57/109.75)
      //   _sparkdiff pctGE40          32% -> 72%   (0.038/0.119 -> 0.086/0.119)
      // and the fusion the gate was aimed at is measurably reduced: patch-S areaMed 14 -> 9,
      // majMed 6.2 -> 4.8, with the blob count on the sparks-visible frame 136 -> 220 because
      // slivers that were bridged into one component now resolve separately.
      // _debrismeas meanContrast is quoted here only as a ratio and only because T3 asks for it
      // (patch-A delta 55% -> 61%); standing constraint 2j retired it as a brightness target.
      //
      // At boost-blur the near tarmac runs lenPix 38.9-41.2 px ('_boostkernel'), so kg is exactly
      // 1.0 over the entire road and T1/T2 are untouched there BY CONSTRUCTION — verified, not
      // assumed: A and B agree to the printed digit on P1a/P1b/P1/P2roadL/P6sky, fx and nofx, over
      // two independent interleaved pairs (T1 ratio 0.394 both legs). What does come
      // back toward sharp is the sky (lenPix 2.0), the horizon (1.6) and the viaduct (7.8-8.6) -
      // which is what reference/boost-blur-02's INDEX line asks for anyway: the kernel "scales
      // with radial distance from the vanishing point ... at center it is nearly zero".
      float kg = smoothstep(3.0, 12.5, lenPix);

      if (uDebug > 2.5 && uDebug < 3.5) { gl_FragColor = vec4(vec3(lenPix / 100.0), 1.0); return; }

      // ---- multi-tap radial blur, with the chromatic split riding inside it ----------------
      // The R/B offset has to be applied per tap rather than as a separate sharp sample: a
      // sharp red and blue over a blurred green is a green/magenta fringe on every soft edge
      // in frame, which is far more visible than the aberration itself.
      //
      // Gated on distance to the nearest frame EDGE, not on the radius r. reference/INDEX.md
      // asks for fringing in the outer ~20% of frame; the frame is a rectangle, so a radial gate
      // cannot express that — at 16:9 an r threshold tight enough to keep the fringe out of the
      // middle of the sides has already run off the top and bottom of the picture, and one loose
      // enough to reach the top edge is halfway to frame centre horizontally. edge01 is 1.0 on
      // the border and 0 at centre, so 0.80 is literally the outer fifth.
      vec2 eRect = abs(vUv - 0.5) * 2.0;
      float edge01 = max(eRect.x, eRect.y);
      //
      // Red-CYAN, per INDEX, which means green and blue have to move TOGETHER and opposite to
      // red. Splitting R one way and B the other is a red/blue split: on a hard edge with a short
      // kernel it lays down three separate coloured bars and reads as a full rainbow, which is
      // exactly what a lamp post at the frame edge did once the depth gate stopped smearing it.
      float caAmt = uAmount * mask * smoothstep(0.80, 1.00, edge01);
      vec2 caOff = stepUv * (caAmt * 2.6);

      // THE ACCUMULATION IS BRIGHT-BIASED, NOT A BOX MEAN.
      //
      // What was here was 'acc / wsum': a straight weighted mean of the taps. On a high-contrast
      // source that reads as a smear; on a low-contrast one it is an ENERGY SINK — it averages
      // away exactly the contrast it exists to stretch. Measured on the near road,
      // '_smearmeas --foc 0.504,0.508 --patch 0.02,0.25,0.70,0.85': 52 px of kernel
      // ('_boostkernel' lenPix 52.2 there) produced 1.8 px of radial correlation, and the pass
      // REMOVED 75% of the patch's high-frequency energy — hpRms 0.49 with the pass on against
      // 1.99 with it bypassed. A mean cannot do anything else: the mean of a 52 px window of
      // near-uniform tarmac is that tarmac, minus its grain. Kernel length is not the lever;
      // lengthening a mean deepens the sink.
      //
      // reference/boost-blur-02's near road is torn into long yellow-line BANDS running right up
      // to the tyres, and -03's INDEX line names the mechanism: everything but the hero car is
      // "doubled and ghosted by multi-tap accumulation". Both are what you get when a streak
      // carries the BRIGHTEST thing its ray swept rather than the average of everything it swept.
      // So the taps feed two accumulators — the mean, and a trail-decayed PEAK — and the output is
      // max(mean, peak), blended in by kernel length.
      //
      // The peak is selected on LUMA and the whole tap is then carried, rather than taking a
      // per-channel max: a per-channel max picks its maximum at a different tap in each channel,
      // which tints every band (a red taillight and a green plume up-ray compose into yellow).
      // Luma-selected, the band carries the colour of the thing that drew it, which is what makes
      // -02's bands read as *lane paint* smeared and not as a generic bright wash.
      //
      // Two range properties, deliberately, because a mean/peak blend is a gain term:
      //   * the peak is 'tap * (1 - 0.58 t)', so it is bounded ABOVE by the brightest tap. The
      //     pass can lift a pixel to something already in frame along that pixel's own motion
      //     vector and no further — it cannot manufacture radiance, so the tonemap downstream
      //     never sees a value the frame did not already contain.
      //   * 'max(mean, peak)' is bounded BELOW by the mean, so the pass can no longer be a sink.
      //     One-directional on purpose: the failure being fixed was subtractive.
      //
      // 20 taps rather than 16 because a peak is a sparse operator where a mean is a dense one: at
      // 16 taps over 72 px the spacing is 4.5 px and a 3 px-wide lane line falls between taps for
      // most pixels, which turns the band into dropout rather than ghosting.
      const int N = 20;
      float j = ign(gl_FragCoord.xy + vec2(uTime * 61.0, uTime * 37.0));
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      for (int i = 0; i < N; i++) {
        float t = (float(i) + j) / float(N);
        // taps run inward only, so the smear trails the pixel instead of blurring symmetrically
        float w = 1.0 - 0.55 * t;
        vec2 s = uv0 - stepUv * (t * lenPix);
        // the split grows along the kernel, so even where the kernel has collapsed to nothing
        // the fringe is a soft ramp rather than one hard-edged coloured bar
        vec2 co = caOff * (0.45 + t);
        vec2 sGB = s - co * 0.5;
        acc += vec3(texture2D(tDiffuse, s + co).r,
                    texture2D(tDiffuse, sGB).g,
                    texture2D(tDiffuse, sGB).b) * w;
        wsum += w;
      }
      vec3 mean = acc / max(wsum, 1e-4);

      // ---- the BRIGHT-BIASED branch: same ray as the mean, a little longer, still a FILTER ---
      //
      // WHAT THIS BRANCH USED TO BE, AND WHY IT WAS DELETED
      //
      // It was a max() over NP=16 sparse stations whose sampling phase 'pj' was a hash of
      // floor(ang * PK_BANDS), i.e. a per-angular-wedge CONSTANT, over PK_REACH = 6 x lenPix.
      // Every part of that is wrong in the same direction, and it did not smear the frame, it
      // SYNTHESISED a pattern into it:
      //
      //   * max() over a sparse station set is piecewise-constant in its own argument. Walk one
      //     pixel down a ray and pkLen changes slightly, so the 16 absolute sample positions all
      //     slide; the latched station stays latched until one crosses off its source feature,
      //     then the output JUMPS. Piecewise-constant along the ray IS a comb — a row of hard
      //     bright teeth at the station period, with gaps between them.
      //   * floor() on the angular coordinate made 'pj' discontinuous at every wedge boundary,
      //     and max() carries that discontinuity straight to the output at full amplitude. 16
      //     stations x 12 wedges/radian = a herringbone.
      //   * PK_REACH 6 let a pixel latch content up to ~430 px up-ray, so bare tarmac inherited
      //     the hazard barrier and the car flank at nearly full value.
      //
      // MEASURED, with '_heromask --scene boost-blur' (fx and nofx grabbed in ONE boot) and
      // '_smearmeas --foc 0.504,0.508 --patch 0.28,0.40,0.72,0.92': the pass's own input scored
      // hpRms 1.15 and its output 14.44 — a 12.6x HIGH-FREQUENCY INCREASE out of something whose
      // entire job is to be a blur. reference/boost-blur-02 in the same patch is 5.26.
      // '_cropimg' 538-778 x 768-994 on both: nofx is plain dark tarmac with nothing in it, fx is
      // a countable row of cream teeth plus a fan of dark chevrons. Scale-persistence P could not
      // see any of this (1.354 against ref-02's 1.30) because a 20 px coherent comb survives a 2x
      // downsample perfectly — P rejects per-pixel aliasing only.
      //
      // THE RULE THIS BRANCH NOW OBEYS: a blur may not add high-frequency energy. Concretely,
      // the output must be a CONVEX COMBINATION of the taps — weights non-negative, normalised by
      // their own sum. That single property buys all three fixes at once:
      //
      //   * bounded above by the brightest tap and below by the dimmest, so the pass still cannot
      //     manufacture radiance the frame did not contain along that pixel's motion vector;
      //   * CONTINUOUS in the sampling phase, in r and in ang, so there is no lattice left to
      //     print. No comb, no herringbone, and no need for the wedge hash at all;
      //   * an averaging operator, so a sub-station impulse is attenuated by roughly its share of
      //     the weight instead of being latched and broadcast at full value. That is the crash-cam
      //     fix as well: crash.js's additive sparks used to be latched by the max() and painted
      //     across the kernel, fusing 3-4 discrete slivers into one ~130x70 px slab.
      //
      // It keeps the thing the max() was actually wanted for — a streak that carries the
      // BRIGHTEST thing its ray swept rather than the average of everything it swept, which is
      // what makes -02's bands read as smeared lane paint and not as a grey wash — by putting the
      // luma in the WEIGHT rather than in a selection. This is a one-dimensional range-weighted
      // (bilateral-style) blur along the motion vector.
      //
      // PK_BIAS is how much a bright station outweighs a dark one. PK_LCAP caps the luma that
      // enters the weight, so an over-unity spark cannot buy unbounded weight and re-create the
      // latch: a tap at luma >= PK_LCAP counts (1 + PK_BIAS * PK_LCAP) = 2.8x a black one, no
      // more, whether it arrives at 0.6 or at 2.8. One spark among NP = 24 taps therefore lands
      // at 2.8 / (2.8 + 23) = 10.9% weight instead of 100%.
      //
      // PK_REACH drops 6.0 -> 2.2 for the same reason the range violation above was a bug: the
      // reach has to be inside what the falloff and the source content can support. 2.2 x lenPix
      // is ~115 px on the near-road patch, which is the scale of -02's own bands, and ~23 px in
      // the crash beat where uAmount is 0.271.
      //
      // 'j' — the mean's per-pixel jitter — is now the RIGHT jitter for this branch, where under
      // the old max() it was catastrophic. That asymmetry was correctly diagnosed once and then
      // solved in the wrong direction: a mean averages a per-pixel phase away (variance falls as
      // 1/N and never reaches the image), a max lands it in the image one-for-one. The answer was
      // to stop using a max, not to move the jitter onto the angular axis where it turned 1 px
      // noise into a 60 px comb.
      const float PK_REACH = 2.2;
      const float PK_BIAS = 3.0;
      const float PK_LCAP = 0.60;
      const int NP = 24;
      float pkLen = lenPix * PK_REACH;
      vec3 pacc = vec3(0.0);
      float pwsum = 0.0;
      for (int i = 0; i < NP; i++) {
        float t = (float(i) + j) / float(NP);
        float u = 0.03 + 0.97 * t;
        vec3 tap = texture2D(tDiffuse, uv0 - stepUv * (u * pkLen)).rgb;
        // Weighted on LUMA and carrying the whole tap: a per-channel weighting picks a different
        // profile in each channel, which tints the streak (a red taillight and a green plume
        // up-ray compose into yellow). Luma-weighted, the streak carries the colour of the thing
        // that drew it.
        float pl = dot(tap, vec3(0.2126, 0.7152, 0.0722));
        float w = (1.0 - 0.45 * t) * (1.0 + PK_BIAS * min(pl, PK_LCAP));
        pacc += tap * w;
        pwsum += w;
      }
      vec3 pk = pacc / max(pwsum, 1e-4);
      // Belt and braces on the over-unity case. The convex combination above already bounds pk by
      // the brightest tap, so this only bites when the ray is bright END TO END (a wall of sparks,
      // the blown vanishing point of -03) rather than on a single hot texel. See shoulder().
      pk = shoulder(pk);
      // 'max(pk - mean, 0)' is ONE-SIDED: this term can only ever ADD. That is deliberate (the
      // original failure was a pass that acted as an energy sink) but it means the term is a gain,
      // and a gain needs a gate tied to the length of the kernel it is spread over.
      //
      // THE GATE IS WHY THE CRASH BEAT IS SAFE. main.js drives uAmount from
      // max(boostBlend, crash.shutter01), so this pass is live at uAmount 0.271 during a takedown
      // with uSpeed01 = 0 — measured, '--scene crash-cam'. That puts lenPix at ~10.7 px and the
      // speed-line branch below at exactly zero (it multiplies by uSpeed01). The only thing boost
      // could still do to crash.js's additive sparks was wrap each one in a bright-biased halo the
      // width of pkLen, and at delta >= 12 that halo is what bridged neighbouring slivers into one
      // blob: with the gate at smoothstep(2.5, 16.0) it stood at 0.42 of full strength on a 10 px
      // kernel that has nothing to smear in the first place.
      //
      // So the gate now opens over 9 -> 34 px of kernel: below ~9 px the pk ray and the mean ray
      // cover the same handful of pixels and the blend is a no-op by construction, and the crash
      // beat sits at 0.02 instead of 0.42. At full boost lenPix on the near road is ~61 px
      // (measured with _boostkernel at the stip patch), so the gate is saturated there and the
      // boost-blur behaviour is untouched. It also keeps the depth-gated far field and the sky on
      // the plain mean, which is what it was originally for.
      float bb = smoothstep(9.0, 34.0, lenPix) * (0.45 + 0.55 * uSpeed01);
      vec3 blurred = mean + bb * max(pk - mean, vec3(0.0));
      // 'kg' (declared at the kernel-length block above) crossfades the whole smear out where the
      // kernel is shorter than the features it is averaging. The sharp end is the t = 0 tap of the
      // mean loop, i.e. THIS pixel with the barrel distortion, the heat haze and the chromatic
      // split all still applied and only the SMEAR removed. Gating against a bare
      // texture2D(tDiffuse, vUv) would silently make kg a gate on three unrelated effects.
      vec2 co0 = caOff * 0.45;
      vec3 sharp = vec3(texture2D(tDiffuse, uv0 + co0).r,
                        texture2D(tDiffuse, uv0 - co0 * 0.5).g,
                        texture2D(tDiffuse, uv0 - co0 * 0.5).b);
      vec3 col = mix(sharp, blurred, kg);

      // ---- speed lines, pulled straight out of the colour buffer -------------------------
      // A decaying, luma-GATED ACCUMULATION along a much longer radial ray: bright things (lane
      // paint, lamps, sky hotspots) leave a trail carrying their own colour, dark things leave
      // nothing. Gated by an angular hash so only some bands streak — a solid ring of streaks
      // reads as a filter. 'ang' is hoisted above; note this hash is sin(), not floor(sin()),
      // so it is CONTINUOUS across bands, unlike the wedge lattice that used to sit above.
      float band = fract(sin(ang * 23.7) * 43758.5453);
      // Gated on velo for the same reason the kernel is: a max()-decay ray 260 px long run over
      // the sky was the other half of the diagonal cloud streaking, and it was the *brighter*
      // half because the sky is the brightest thing in frame and max() latches onto it.
      float lineAmt = uAmount * uSpeed01 * mask * velo
                    * smoothstep(0.42, 0.88, band)
                    * smoothstep(0.62, 1.55, r);
      if (lineAmt > 0.001) {
        float sLen = 260.0 * uAmount * (0.4 + 0.6 * uSpeed01);
        // THIS WAS THE SECOND max() IN THE PASS AND IT HAD THE SAME DEFECT AS THE FIRST.
        // 'smear = max(smear, ...)' over 10 sparse stations, phased by the per-wedge hash 'pj',
        // is piecewise-constant along the ray and discontinuous across wedges — the other half of
        // the cream picket fence measured at hpRms 14.44 against an input of 1.15. A max also
        // broadcasts one hot texel over the whole 260 px ray at full value, which is what fused
        // crash.js's sparks into slabs.
        //
        // It is now an accumulation, and the normalisation is the point. Dividing by the sum of
        // the REALISED weights (gate x envelope) would renormalise a single bright station back up
        // to its full value, which is the latch again in disguise. So it divides by the sum of the
        // DECAY ENVELOPE ALONE, with the luma gate left inside the numerator:
        //
        //     smear = SUM(s_i * gate_i * env_i) / SUM(env_i)
        //
        // That is an affine, monotone, continuous functional of the taps with the two properties
        // this branch needs. A ray that is bright END TO END (a tunnel light strip, -03's blown
        // vanishing point) has every gate at 1 and comes out at full envelope-weighted strength,
        // so the streaks -03 asks for are unchanged. A ray with ONE bright station among 16 comes
        // out at that station's envelope share, ~19% — the trail is still there and still carries
        // that station's colour, but it is not a solid bar. Sparse impulses get attenuated ~5x
        // instead of being amplified to 100%.
        //
        // 'j' not 'pj': with an accumulation the per-pixel phase averages out (see the long note
        // on the branch above), and 16 taps rather than 10 puts the stations 15 px apart at full
        // boost so consecutive envelope terms overlap rather than printing discrete ghosts.
        vec3 sacc = vec3(0.0);
        float senv = 0.0;
        for (int i = 0; i < 16; i++) {
          float t = (float(i) + j) / 16.0;
          // The shoulder goes on before the gate, not after: a 260 px ray is the longest thing in
          // this pass, so it is the branch most able to turn one over-unity texel into a bar.
          vec3 s = shoulder(texture2D(tDiffuse, uv0 - stepUv * (t * sLen)).rgb);
          // only genuinely bright things get to leave a trail. Without this gate the ray picks up
          // tarmac speckle and the road boils into coloured stipple.
          float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
          float env = exp(-t * 2.0);
          sacc += s * (smoothstep(0.55, 1.30, lum) * env);
          senv += env;
        }
        vec3 smear = sacc / max(senv, 1e-4);
        col = mix(col, max(col, smear), lineAmt * 0.9);
      }

      // ---- vignette + a cold edge wash ----------------------------------------------------
      col *= 1.0 - smoothstep(0.55, 1.70, r) * uAmount * 0.42;
      float edge = smoothstep(0.70, 1.70, r) * uAmount * 0.30;
      col = mix(col, col * vec3(0.90, 0.97, 1.14), edge);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ===========================================================================
// 2. afterburner jet
// ===========================================================================
//
// One camera-facing impostor quad per tailpipe, inside which the fragment shader raymarches an
// analytic tapered cone whose axis is the real exhaust axis in car space. The impostor is only
// a bounding proxy — all of the shape is the volume integral, so:
//
//   * the silhouette is the cone's own silhouette: hard-edged, elongated, and it foreshortens
//     correctly instead of collapsing (the failure mode of a card that contains the axis) or
//     rounding off into a blob (the failure mode of a stack of camera-facing puffs);
//   * the colour ramp is a function of the AXIAL station u, so the gradient runs along the jet
//     rather than radially outward. Radially there is only the density edge;
//   * the tip is nearer the camera than the nozzle on a chase cam, so perspective alone makes
//     the tip smear while the root stays tight, which is what `boost-blur-01` shows.
//
// On the JET AXIS, and why it is solved rather than authored.
//
// A jet fired exactly astern out of a pipe that sits xPipe metres off the car's centreline does
// NOT project parallel to the car's longitudinal axis on a chase cam. The jet runs *toward* the
// lens, so its tip is nearer than its nozzle and magnifies: the projected axis leans outboard and
// downward by atan(xPipe / (camY - pipeY)) — about 17 deg at this game's chase-cam geometry, and
// notably INDEPENDENT of jet length (both screen displacements scale with the same
// 1/zTip - 1/zNozzle). Two of those, mirrored, diverge ~34 deg. Adding an authored outboard splay
// on top took that to a measured 53 deg: two 200 px lances raked into the tarmac, the left one
// leaving frame at the bottom corner. reference/boost-blur-01 measures the two jet axes at 18.0
// and 19.5 deg — 1.5 deg apart, i.e. parallel to each other and to the car's length.
//
// So the tailpipe offset sets the jet's ORIGIN only, and the direction gets a small INBOARD rake
// that cancels the perspective divergence, leaving the two plumes parallel on screen and letting
// foreshortening — not authored splay — decide how long they read. The rake is solved against the
// live camera each frame (`solveRake`) instead of being a magic constant, because its value is a
// function of camera distance and height and the jets are seen from more than one camera.
const JET_DROOP = 0.020;   // rad, down — real pipes point a little at the road
const JET_RAKE_MAX = 0.20; // |tan| clamp on the solved inboard rake, ~11 deg
// How far toward straight-astern the *visible* plume axis sits, as a fraction. The rake has to be
// solved for that axis and not for the raw pipe axis, or the correction comes out ~40% short. It
// folds in two things that cannot be read off the geometry: the shader's downstream relaxation
// toward straight astern (the `bend` term), and the extra weight the near, magnified, smoke-flared
// far station carries in the projected mass distribution. So it is calibrated against a PCA of the
// isolated flame mask rather than derived — at 0.50 the two jet axes measure within 1 deg of the
// car's longitudinal axis; at 0.18 (the naive brightness-weighted bend) they sat 7.5 deg out.
const JET_RELAX_EFF = 0.50;
const JET_STEPS = 96;

const FlameShader = {
  vertexShader: /* glsl */`
    attribute float aSide;   // -1 / +1, which pipe
    uniform float uLen, uWide;
    uniform vec3 uPipe;      // nozzle in car space, x taken as |x|
    uniform vec3 uAxis;      // unit exhaust axis in car space for the +x pipe
    varying vec3 vView;      // view-space position of this quad corner
    varying vec3 vN, vD;     // nozzle and unit axis, view space
    varying vec3 vB;         // straight astern in view space: where the burnt gas gets left
    varying float vSide;

    void main() {
      vSide = aSide;
      vec3 nozzle = vec3(uPipe.x * aSide, uPipe.y, uPipe.z);
      vec3 axis   = vec3(uAxis.x * aSide, uAxis.y, uAxis.z);

      vec3 n = (modelViewMatrix * vec4(nozzle, 1.0)).xyz;
      vec3 tip = (modelViewMatrix * vec4(nozzle + axis * uLen, 1.0)).xyz;
      vN = n;
      vD = normalize(tip - n);
      // The car is moving; the gas is not. Whatever left the pipe a moment ago is sitting in
      // still air directly astern of where it was emitted, not out along the splayed pipe axis.
      // So the plume has to relax from the pipe axis toward the car's own backward direction as
      // it goes downstream — which is what makes the two plumes converge into one trailing
      // streak in boost-blur-01 instead of staying two separate splayed lances.
      vB = normalize(mat3(modelViewMatrix) * vec3(0.0, 0.0, -1.0));

      // Bounding sphere of the cone, billboarded so the proxy always covers the projection.
      // The proxy carries a single depth for the whole volume, so it is pushed forward to the
      // nearest point of the jet: on a chase cam the jet fires *toward* the lens, so a depth
      // taken at the mid-station lets the car's own valance and diffuser clip a band out of the
      // middle of the plume. Real geometry in front of the jet still occludes it.
      vec3 c = 0.5 * (n + tip);
      // Radial margin is 3.5x uWide, not 2x. The plume's transverse density is a Gaussian pair
      // (see densP in the fragment shader) so it has no hard silhouette any more: it keeps adding
      // a few percent of peak out to ~2.5 plume radii. At the old 2x margin the outer wing — the
      // whole point of an optically thin volume — got scissored off at the proxy edge and left a
      // faint straight cut down each side of the jet.
      float rad = 0.5 * length(tip - n) + uWide * 3.5;
      float zFront = max(n.z, tip.z) + 0.02;
      vec3 anchor = vec3(c.xy * (zFront / c.z), zFront);
      vec4 mv = vec4(anchor, 1.0);
      mv.xy += position.xy * rad * 1.5;
      vView = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform float uAmount, uFlicker, uTime, uLen, uWide, uCoreW, uCoreLen, uSmear;
    varying vec3 vView;
    varying vec3 vN, vD, vB;
    varying float vSide;

    // R2 / Roberts low-discrepancy dither for the march start offset. White-noise jitter (the
    // ign() hash used by the screen pass) is the right answer when the result is going to be
    // resolved over many taps, but here it is one sample per pixel through a thin, dim tail: any
    // two neighbouring pixels get uncorrelated offsets and the residual march error comes out as
    // single-pixel salt-and-pepper stipple, which was clearly visible down the plume tail. The R2
    // sequence maximally *separates* neighbouring offsets instead of randomising them, so the same
    // residual becomes a fine even weave below the noise floor rather than isolated hot pixels.
    float r2dither(vec2 p) {
      return fract(dot(p, vec2(0.7548776662, 0.5698402910)));
    }

    void main() {
      vec3 rd = normalize(vView);
      vec3 c = vN + vD * (uLen * 0.5);
      float rBound = uLen * 0.5 + uWide * 3.5;   // must match the proxy margin in the vertex shader

      // ray (origin = eye) against the bounding sphere: gives the march interval
      float b = dot(rd, c);
      float disc = b * b - dot(c, c) + rBound * rBound;
      if (disc <= 0.0) discard;
      float sq = sqrt(disc);
      float t0 = max(b - sq, 0.02);
      float t1 = b + sq;

      // tighten to the axial slab 0 <= s <= uLen. On a chase cam the ray is nearly parallel to
      // the axis and the sphere interval is mostly empty; without this the fixed step count is
      // spent on vacuum and the cone bands.
      float dn = dot(rd, vD);
      float sN = dot(vN, vD);
      if (abs(dn) > 0.08) {
        float ta = (sN) / dn;
        float tb = (sN + uLen) / dn;
        t0 = max(t0, min(ta, tb));
        t1 = min(t1, max(ta, tb));
      }
      if (t1 <= t0) discard;

      float dt = (t1 - t0) / float(${JET_STEPS});
      float jit = r2dither(gl_FragCoord.xy + vec2(uTime * 71.0, uTime * 43.0));

      // colour stops. Chromaticity only — the amplitude is separate so the ramp cannot be washed
      // out by the intensity falloff.
      // Deeply saturated on purpose: the body sits high enough to tonemap near the top of the
      // curve, and any channel that is not held right down there gets dragged up with the rest
      // and the plume washes out to a pale yellow-white instead of Burnout's poster green.
      //
      // cThroat is deliberately NOT 1,1,1. The throat used to be a hueless clipped white blob;
      // reference -01's throat is small and *tinted* — it reads as the hottest part of the same
      // flame, which means it has to keep a trace of the flame's own chromaticity even at its
      // brightest.
      //
      // THE RAMP DIRECTION WAS INVERTED. It ran green at the nozzle -> orange at the tail: the
      // measured composited ramp was dR/dG 0.49 at the nozzle bin (y .813) rising to 3.23 at the
      // tail (y .913), which is a green LED lamp with a red-hot fringe, not fire. reference -01
      // is the other way round and it is not close: its nozzle is hot yellow-white
      // (region .21875,.234375,.2361,.2685 = 170,205,90, R/G 0.83, p50 229) and it gets GREENER
      // downstream (sat 0.294 at the throat to 0.553 at the far end, G/B 2.23). Fire is hottest
      // where it leaves the pipe; everything downstream is cooling. So the stations now run
      // hot-yellow -> lime -> green -> olive-green, dR/dG monotonically NON-INCREASING, and the
      // orange stop is gone entirely. (Orange belongs to reference -04, which INDEX calls out as
      // "a different boost tier than -01"; it is not this scene's flame and putting it downstream
      // of the green was what inverted the ramp.)
      //
      // cThroat carries -01's measured nozzle chromaticity directly, normalised on green:
      // 170/205 = 0.83 R, 205/205 = 1.00 G, 90/205 = 0.44 B. It is deliberately NOT 1,1,1 — a
      // hueless throat clips to paper white the moment the path integral gets long, which on a
      // chase cam looking down the barrel is always. At this chromaticity it still tonemaps to
      // something the eye calls white-hot while the bloom halo around it stays yellow.
      const vec3 cThroat = vec3(0.83, 1.00, 0.44);
      const vec3 cLime   = vec3(0.52, 1.00, 0.10);
      const vec3 cGreen  = vec3(0.20, 1.00, 0.34);
      const vec3 cHot    = vec3(0.83, 1.00, 0.40);
      // The far end is the most SATURATED and the GREENEST part of the jet, not a grey soot
      // streak: reference -01 measures sat 0.553 / G/B 2.23 there — a dying flame. This stop is
      // (0.11, 0.60, 0.26): G/B 2.31 to match, and R/G 0.18 so it sits at or below cGreen's 0.20
      // and the dR/dG ramp stays monotonically non-increasing all the way to the tip. It is also
      // dimmer than every stop upstream of it, which is what makes the tail read as smoke.
      const vec3 cSmoke  = vec3(0.11, 0.60, 0.26);

      float coreLen = max(uCoreLen, 0.04);

      vec3 acc = vec3(0.0);
      for (int i = 0; i < ${JET_STEPS}; i++) {
        float t = t0 + (float(i) + jit) * dt;
        vec3 p = rd * t;
        float s = dot(p, vD) - sN;
        float u = s / uLen;
        if (u < 0.0 || u > 1.0) continue;

        // The centreline relaxes from the pipe axis toward straight astern as it goes downstream:
        // the gas is left in still air behind the car, so only the root is on the splayed axis.
        // uSmear is how far that relaxation is allowed to go, which is a function of road speed.
        float bend = uSmear * smoothstep(0.0, 0.85, u) * 0.7;
        vec3 cen = vN + s * mix(vD, vB, bend);
        vec3 perpV = p - cen;
        float r = length(perpV);

        // ---- STAGE 2 radius: flare, neck, then bloom back out as smoke -------------------
        // The unperturbed profile has to exist before the turbulence does, because the azimuthal
        // turbulence has to be faded out relative to it (see below).
        // Root width nudged 0.30 -> 0.34 (the tip is unchanged, the two terms still sum to 1.0).
        // With a Gaussian transverse profile the nozzle station is where every near-axis ray has
        // its longest chord, so it is the one place that still reaches the top of the tonemap; a
        // slightly fatter root spreads that over enough pixels that it reads as a core with a
        // gradient instead of a clipped disc with a rim.
        float flareP = 0.34 + 0.66 * pow(u, 0.42);
        // fire body: flares off the nozzle and necks down to a thread by mid-plume
        float bodyR = uWide * flareP * (1.0 - 0.62 * smoothstep(0.22, 0.72, u));
        // smoke: the burnt gas has stopped reacting, lost its pressure and is now just expanding
        // into still air, so the trail widens again downstream of the neck. This is the shape that
        // makes the plume end in a soft streak rather than on a cone wall.
        float smokeR = uWide * 1.55 * smoothstep(0.50, 1.0, u);
        float rBase = max(max(bodyR, smokeR), 0.004);

        // Turbulence has an azimuthal term as well as an axial one, so the silhouette breaks up
        // into licks instead of staying a perfect lathe. The basis is built off the axis rather
        // than off any world axis so it stays continuous as the jet swings.
        //
        // The azimuthal terms are faded out as r -> 0. ang is atan2 of the perpendicular offset,
        // so on and near the centreline it is ill-conditioned: adjacent pixels a fraction of a
        // millimetre apart in the perpendicular plane get wildly different azimuths, and sin(5*ang)
        // of that is per-pixel noise, not turbulence. Down the necked tail almost every sample is
        // near-axial, which is exactly where the stipple was.
        vec3 ref = abs(vD.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 e1 = normalize(cross(vD, ref));
        float ang = atan(dot(perpV, cross(vD, e1)), dot(perpV, e1));
        float azFade = smoothstep(0.10, 0.62, r / rBase);
        float turbAx = sin(u * 19.0 - uTime * 32.0 + vSide * 1.9)
                     + 0.55 * sin(u * 43.0 - uTime * 20.0 + vSide * 0.7);
        float turbAz = 0.70 * sin(ang * 3.0 + u * 24.0 - uTime * 25.0 + vSide)
                     + 0.40 * sin(ang * 5.0 - u * 35.0 + uTime * 16.0);
        float turb = turbAx + turbAz * azFade;

        // ---- STAGE 2: the long green-yellow plume, dissolving into olive smoke ------------
        // This is the tier that carries the area and the colour. Its density EDGE softens
        // downstream (hardP) so the tail dissolves into a smeared streak rather than ending on a
        // cone wall. That soft tail plus the bend above is the "trails and smears back from the
        // car's own motion" of reference -01; the flame there is a lance at the pipe and a soft
        // grey-green smudge two car-lengths back.
        float radP = max(rBase * (1.0 + 0.15 * turb * smoothstep(0.08, 1.0, u)), 0.004);
        // The transverse density is a GAUSSIAN PAIR, not a coverage top-hat.
        //
        // What was here was smoothstep(radP, radP*hardP, r) with hardP starting at 0.80: density
        // exactly 1.0 for every sample inside 0.8 radP and exactly 0.0 outside radP. Integrated
        // along the barrel that is a top-hat chord — every near-axis ray gets the same path length,
        // so the plume composites as a flat-topped disc with a ~11 px shoulder and adds literally
        // nothing beyond its own silhouette. Measured: interior flat to 8% across four bins,
        // peak/background 8.1x, spill 0.5% of peak. A real emissive volume cannot look like that.
        //
        // An optically thin volume seen end-on shows the ABEL TRANSFORM of its emissivity, and the
        // Abel transform of a Gaussian is a Gaussian — peaked on axis, no flat core, falling
        // continuously to zero. Two terms, because the plume is two things sharing an axis:
        //   * the reacting body, tight (k = 4.2, so half-max sits at 0.48 radP — deliberately the
        //     same half-max width the top-hat had, so this is a reshaping and not a fattening);
        //   * entrained/heated air around it, 3.7x broader and 23% as dense, which is what carries
        //     the additive spill. reference/boost-blur-01 approaches its core gradually over ~90 px
        //     for a core only ~35 px across: the visible footprint is ~2.5x the core, and a single
        //     Gaussian narrow enough to keep the core width cannot also do that.
        // Nothing here ever reaches zero, which is the point — the proxy margin above was widened
        // to give the wing somewhere to land.
        float q = r / radP;
        float densP = (exp(-4.20 * q * q) + 0.30 * exp(-0.30 * q * q)) * (1.0 / 1.30)
                    * smoothstep(0.0, 0.020, u);
        // The fire amplitude decays hard, but a floor survives all the way to u = 1 so the last
        // third of the plume is dim olive smoke that is still there when the orange has gone.
        // Zeroing this at 1.0 (as it used to) is what made the plume terminate ON the orange stop.
        // Emissivity per unit length. Was (0.34 + 1.70 exp(-2.6 u)); now much lower at the root.
        // Once the top-hat is gone the ONLY thing setting the on-axis peak is this times the chord
        // length, and the old value put the plume 8.1x over the tarmac it sits on with its whole
        // core jammed against the top of the tonemap — which is the other half of why it
        // composited as a flat opaque disc. reference -04 runs its flame 1.9x over the road and
        // the tarmac texture still modulates visibly THROUGH the flame body; that transparency is
        // a brightness property as much as it is a density one.
        //
        // The axial decay also slowed, exp(-2.6 u) -> exp(-1.7 u). At 2.6 the emission was
        // effectively over by u = 0.5, which made the plume a stubby lozenge rather than a jet.
        // Slowing the decay moves brightness from the root (already the brightest thing in frame,
        // since it has the longest chord) into the mid and far plume.
        //
        // Scaled 1.60x over r7's (0.055 + 0.170) because uLen came down ~1.9x in the same edit:
        // looking down the barrel the on-axis path integral is proportional to jet LENGTH, so
        // shortening the jet without touching emissivity would have dimmed the whole plume in
        // exact proportion and taken the mid-plume band back under the reference's 1.9x.
        float ampP = (0.088 + 0.272 * exp(-u * 1.7)) * (1.0 - 0.62 * smoothstep(0.48, 1.0, u));

        // The tint ramp is parameterised by EMITTED RADIANCE, not by axial fraction.
        //
        // It used to be smoothstep stations on u: green->yellow 0.10..0.46, ->orange 0.44..0.68,
        // ->smoke 0.58..0.92. u is a fraction of the MODELLED jet length, which is not the same
        // thing as the fraction of the VISIBLE jet: ampP falls ~7x from root to tip, so the plume
        // drops under legibility around u ~ 0.7 — already past the orange->smoke handover. Every
        // part of the jet that was still bright enough to see was therefore being handed the smoke
        // stop, and the measured result was the giveaway: the plume body's saturation (0.215) was
        // LOWER than the bare tarmac it covers (0.46). An additive emitter can only desaturate its
        // background if what it adds is near-neutral, i.e. what we were showing was the smoke tail
        // and the flame never got drawn at all. reference/boost-blur-01 does the opposite — its jet
        // gets GREENER with distance, sat 0.294 at the throat to 0.553 at the far end.
        //
        // dim is 1 - (emissivity / root emissivity): 0 where the plume is at full brightness and
        // rising as the emission dies, so the stations move with the visible extent instead of
        // with the model. cSmoke's station is deliberately placed past the point where ampP has
        // dropped to ~0.18 of root (u ~ 0.90 at the current decay), so smoke only opens on the
        // part of the trail that is genuinely near background and the whole legible body of the
        // jet stays on the green -> lime -> orange run.
        float dim = 1.0 - clamp(ampP * (1.0 / 0.360), 0.0, 1.0);
        // hot -> lime -> green -> olive-green, i.e. COOLING downstream. dim is 0 at the nozzle,
        // so cHot lands on the root and cSmoke only opens where the emission is near background.
        vec3 tintP = mix(cHot, cLime, smoothstep(0.03, 0.30, dim));
        tintP = mix(tintP, cGreen, smoothstep(0.34, 0.68, dim));
        tintP = mix(tintP, cSmoke, smoothstep(0.82, 0.94, dim));

        // ---- STAGE 1: the short tinted throat -------------------------------------------
        // A separate, much shorter and much TIGHTER cone living inside the root of the plume, on
        // the undeviated pipe axis (this gas has not had time to be left behind). Keeping it a
        // distinct stage rather than the first few percent of one ramp is what lets it read as two
        // tiers: it has its own length, width, pulse and edge.
        //
        // It used to be both too long (~0.35 of jet length measured, driven by a uCoreLen that was
        // never rescaled with uLen) and WIDER than the plume it is supposed to live inside, with a
        // 16x hueless white filament on top: that combination is a clipped white blob on the
        // bumper, not a throat. reference -01's throat is ~0.12 of jet length and holds a tint.
        // uCoreLen is now driven as a fraction of uLen from update(), uCoreW is a fraction of
        // uWide, and the filament is tinted and held to a level the tonemap can still resolve.
        float uc = s / coreLen;
        vec3 stage1 = vec3(0.0);
        if (uc <= 1.0) {
          float rc = length(p - vN - vD * s);
          float flareC = 0.44 + 0.56 * pow(uc, 0.55);
          float closeC = 1.0 - smoothstep(0.34, 1.0, uc);
          // axial turbulence only: the throat is a thread, so its azimuth is pure aliasing
          float radC = max(uCoreW * flareC * closeC * (1.0 + 0.07 * turbAx), 0.003);
          // Same Abel argument as the plume: the throat is a volume too, so its chord profile is a
          // Gaussian and not a disc. Tighter (k = 5.2) and with a much smaller wing than the plume,
          // because the throat really is a nearly-opaque thread and it is the one part allowed to
          // have a defined edge — but even that edge is a falloff, not a step.
          float qc = rc / radC;
          float densC = (exp(-5.20 * qc * qc) + 0.14 * exp(-0.55 * qc * qc)) * (1.0 / 1.14)
                      * smoothstep(0.0, 0.07, uc);
          // shock diamonds stand in the supersonic core only, so they belong to this stage
          float dia = exp(-uc * 3.0) * (0.5 + 0.5 * cos(uc * 12.0 - 0.6));
          // The throat is only 0.12 of the jet, so its share of any ray's path integral is ~12%
          // however bright it is; if it is not several times hotter per unit length than the body
          // it cannot read as a separate tier at all. 1.70 against the body's 0.225 root keeps that
          // 7.5x contrast. It came down from 6.00 only because the body came down further — the
          // ratio is what makes the two-tier read, and at 6.00 against the new body the throat was
          // a hueless white slab (measured sat 0.27 across a 21 px band) instead of a hot core.
          float ampC = 1.70 * (1.0 - smoothstep(0.52, 1.0, uc)) * (1.0 + 0.90 * dia);
          // The tint runs hot-yellow -> lime, never through neutral and never through blue. A blue
          // throat was the other half of the inverted ramp: it put the COOLEST hue in the frame at
          // the hottest station, so the only warm pixels in the whole jet were the ones at the far
          // tail. Handing off to cLime instead means the throat's own gradient continues into the
          // plume's, so dR/dG falls monotonically across the stage boundary instead of stepping.
          vec3 tintC = mix(cThroat, cLime, smoothstep(0.10, 0.70, uc) * 0.82);
          // the bloom filament: a thin on-axis thread, the only part hot enough to clear the bloom
          // threshold upstream. It carries the throat's own tint so the bloom halo around it is
          // faintly green rather than a grey smudge, and it is 6x rather than 16x so the body of
          // both stages still tonemaps as colour instead of being dragged to white with it.
          // The bloom filament. It was exp(-6 (rc/0.32 radC)^2) * 16, then multiplied by a top-hat
          // densC on top — a 1/e radius of about a seventh of the throat width at 16x the body,
          // i.e. a ~10 px pinpoint that clipped to white and read as a specular highlight stuck on
          // the bumper rather than as the hottest part of a flame. Three changes: it is 2.8x wider
          // (0.90 radC), 3.4x dimmer, and it is ADDED rather than multiplied by densC, so its own
          // Gaussian is the only thing shaping it and it does not inherit a second falloff that
          // squares it into a dot. What clears the bloom threshold is now a small halo with a
          // gradient, which is what -01 shows against the sky.
          float coreR = max(radC * 0.90, 0.004);
          float fil = exp(-1.80 * (rc / coreR) * (rc / coreR)) * exp(-uc * 3.8)
                    * smoothstep(0.0, 0.09, uc);
          stage1 = tintC * ampC * densC + cThroat * fil * 0.95;
        }

        acc += (tintP * ampP * densP + stage1) * 4.20 * dt;
      }

      // Soft knee on the path integral. Looking straight down the barrel the chord through the
      // cone is several times longer than in profile; without this the jet clips to paper white
      // exactly on the chase cam, which is the view that matters most. The coefficient sets the
      // asymptote (1/k): at 0.035 that was ~29, i.e. no cap at all in practice, and every near-axis
      // ray of the plume body slammed flat against the top of the tonemap as one hueless lime
      // plateau. 0.18 caps at ~5.6, which keeps the body on the shoulder of the curve where its
      // green -> yellow -> orange -> olive ramp still resolves, and leaves the throat — the only
      // thing an order of magnitude above the body — as the one part that reaches white.
      float lum = dot(acc, vec3(0.2126, 0.7152, 0.0722));
      acc /= 1.0 + 0.18 * lum;

      gl_FragColor = vec4(acc * uAmount * uFlicker, 1.0);
    }
  `,
};

/** Two impostor quads, one per pipe, in one buffer, one draw call. */
function buildFlameGeometry() {
  const pos = new Float32Array(2 * 4 * 3);
  const aSide = new Float32Array(2 * 4);
  const idx = new Uint16Array(2 * 6);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let q = 0;
  for (const side of [-1, 1]) {
    for (let c = 0; c < 4; c++) {
      const v = q * 4 + c;
      pos[v * 3] = corners[c][0];
      pos[v * 3 + 1] = corners[c][1];
      pos[v * 3 + 2] = 0;
      aSide[v] = side;
    }
    const b = q * 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
    q++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -4), 10);
  return g;
}

// ===========================================================================
// 3. dust / spark trail
// ===========================================================================

const TrailShader = {
  vertexShader: /* glsl */`
    attribute float aSize;
    attribute float aLife;   // 1 at birth -> 0 at death
    attribute float aType;   // 0 dust, 1 spark
    varying float vLife;
    varying float vType;
    uniform float uPixH;
    void main() {
      vLife = aLife; vType = aType;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float grow = mix(1.0 + (1.0 - aLife) * 2.4, 1.0, aType); // dust puffs expand, sparks do not
      gl_PointSize = max(1.0, aSize * grow * uPixH / max(0.1, -mv.z));
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    varying float vLife;
    varying float vType;
    uniform float uAmount;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float d = dot(p, p);
      if (d > 1.0) discard;
      float soft = 1.0 - d;
      if (vType > 0.5) {
        // spark: tiny, very hot, snaps out
        float a = pow(soft, 2.5) * pow(vLife, 1.6);
        gl_FragColor = vec4(vec3(16.0, 6.4, 1.3) * a * uAmount, 1.0);
      } else {
        // dust: broad, dim, fades in then out
        float a = pow(soft, 1.4) * vLife * (1.0 - vLife) * 4.0;
        gl_FragColor = vec4(vec3(0.66, 0.57, 0.47) * a * 0.20 * uAmount, 1.0);
      }
    }
  `,
};

// ===========================================================================

export function createBoost(car) {
  const pass = new ShaderPass(BoostShader);
  pass.enabled = false;
  const group = new THREE.Group();
  group.frustumCulled = false;

  const rng = makeRng(0x5EED17);

  // ---- hero silhouette target --------------------------------------------------------------
  // Half res is deliberate: the bilinear fetch already gives the edge a pixel of softness, the
  // dilation in the pass is measured in full-res pixels regardless, and it is a depth-tested
  // draw of one mesh per frame. Depth buffer on, so the spoiler occludes the roof correctly and
  // the silhouette is the real outline rather than a convex hull.
  const heroRT = new THREE.WebGLRenderTarget(2, 2, {
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    generateMipmaps: false,
  });
  heroRT.texture.name = 'boost.hero';
  // The same target carries the frame's scene depth. The blur kernel has to be gated on depth
  // (the sky is at infinity and does not move across the screen; tarmac 3 m away moves a great
  // deal), and nothing upstream in the composer hands this pass a depth texture — the SSAO pass
  // builds one but it is that pass's private prepass and it early-returns when SSAO is off, so
  // depending on it would silently kill the gate. Piggy-backing on the silhouette target instead
  // costs one extra half-res depth-only draw on boosting frames and is self-contained.
  heroRT.depthTexture = new THREE.DepthTexture(2, 2);
  heroRT.depthTexture.type = THREE.UnsignedIntType;
  heroRT.depthTexture.name = 'boost.depth';
  pass.uniforms.tHero.value = heroRT.texture;
  pass.uniforms.tDepth.value = heroRT.depthTexture;
  // toneMapped:false and fog:false or the "white" comes back grey and the knee eats the mask.
  const heroMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
  // Depth-only: writes z, touches no colour, so the silhouette drawn afterwards is the only
  // thing in the colour attachment.
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, fog: false, toneMapped: false });
  const _clearCol = new THREE.Color();
  const _visSave = [];

  // ---- afterburner plumes ----------------------------------------------------------------
  // They live under fx.group rather than under the car so that anything the composer is told
  // to exclude by group (SSAO, for one) excludes the plumes too; their world matrix is composed
  // from the car's each frame instead.
  const flameGeo = buildFlameGeometry();
  const flameMat = new THREE.ShaderMaterial({
    uniforms: {
      uAmount: { value: 0 }, uFlicker: { value: 1 }, uTime: { value: 0 },
      // uLen/uWide size the long green-yellow plume; uCoreLen/uCoreW size the short blue-white
      // core that lives inside its root. Both are absolute metres.
      uLen: { value: 1 }, uWide: { value: 0.16 },
      uCoreLen: { value: 0.3 }, uCoreW: { value: 0.085 },
      uSmear: { value: 0.5 },
      // car.js puts the tailpipes at (+-0.50, 0.365, -2.30) with a 0.09 half-depth, so the
      // nozzle mouth is at z = -2.39; start the jet a hair clear of the chrome.
      // The x here is the jet ORIGIN only; the jet DIRECTION is uAxis and is built along the
      // car's -Z longitudinal axis, not out through the pipe's offset.
      uPipe: { value: new THREE.Vector3(0.50, 0.365, -2.42) },
      // Straight astern with a touch of droop. uAxis.x — the small inboard rake that cancels the
      // chase cam's perspective divergence — is solved against the live camera in update().
      uAxis: { value: new THREE.Vector3(0, -Math.tan(JET_DROOP), -1).normalize() },
    },
    vertexShader: FlameShader.vertexShader,
    fragmentShader: FlameShader.fragmentShader,
    transparent: true,
    // explicit one/one rather than AdditiveBlending: the shader writes raw HDR radiance and
    // must not be scaled by alpha, otherwise the core drops under the bloom threshold.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    depthWrite: false,
    // No depth test. The impostor carries one depth for a volume that spans ~2 m along the view
    // axis, so any per-fragment depth comparison is wrong somewhere, and the wrong-in-the-
    // occluding-direction case punches a black band across the middle of the plume. A jet that
    // fires rearward at a chase camera has nothing between it and the lens, so the honest answer
    // for this element is to composite it unconditionally over the frame.
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const flames = new THREE.Mesh(flameGeo, flameMat);
  flames.matrixAutoUpdate = false;    // driven straight off the car's world matrix
  flames.frustumCulled = false;
  flames.renderOrder = 6;
  flames.visible = false;
  group.add(flames);

  // ---- ground trail -----------------------------------------------------------------------
  const MAX = 320;
  const tPos = new Float32Array(MAX * 3);
  const tSize = new Float32Array(MAX);
  const tLife = new Float32Array(MAX);
  const tType = new Float32Array(MAX);
  const tVel = new Float32Array(MAX * 3);
  const tRate = new Float32Array(MAX);        // 1 / lifetime
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  trailGeo.setAttribute('aSize', new THREE.BufferAttribute(tSize, 1));
  trailGeo.setAttribute('aLife', new THREE.BufferAttribute(tLife, 1));
  trailGeo.setAttribute('aType', new THREE.BufferAttribute(tType, 1));
  trailGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uPixH: { value: 540 }, uAmount: { value: 0 } },
    vertexShader: TrailShader.vertexShader,
    fragmentShader: TrailShader.fragmentShader,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 5;
  trail.visible = false;
  group.add(trail);

  let head = 0;
  function spawn(x, y, z, vx, vy, vz, size, type, life) {
    const i = head; head = (head + 1) % MAX;
    tPos[i * 3] = x; tPos[i * 3 + 1] = y; tPos[i * 3 + 2] = z;
    tVel[i * 3] = vx; tVel[i * 3 + 1] = vy; tVel[i * 3 + 2] = vz;
    tSize[i] = size; tType[i] = type; tLife[i] = 1; tRate[i] = 1 / life;
  }

  // ---- state ------------------------------------------------------------------------------
  let t = 0;
  let env = 0;            // our own attack/decay envelope on top of whatever main.js hands us
  let dustAcc = 0, sparkAcc = 0;
  let pixH = 1080;

  // Combustion pulse: a stepped random resampled at ~20 Hz and smoothstep-interpolated between
  // steps. Sines beat but they are still periodic, and at 20 Hz a periodic flicker reads as a
  // strobe; stepped noise reads as burning. Two decorrelated channels so length and core width
  // do not pulse in lockstep.
  const PULSE_HZ = 20;
  const pulses = [
    { tick: -1, prev: 1, next: 1, v: 1 },
    { tick: -1, prev: 1, next: 1, v: 1 },
  ];
  /** @returns {number} 0.8..1.2 */
  function pulse(ch, time) {
    const p = pulses[ch];
    const tick = Math.floor(time * PULSE_HZ);
    if (tick !== p.tick) {
      p.prev = p.next;
      p.next = 0.80 + rng() * 0.40;   // +-20%
      p.tick = tick;
    }
    const f = clamp(time * PULSE_HZ - tick, 0, 1);
    p.v = lerp(p.prev, p.next, f * f * (3 - 2 * f));
    return p.v;
  }

  let cameraRef = null;
  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();
  const _r = new THREE.Vector3();
  const _axis = new THREE.Vector3();

  /** The scene owns the camera (main.js does scene.add(camera)); find it lazily, no globals. */
  function findCamera() {
    if (cameraRef && cameraRef.parent) return cameraRef;
    let root = group;
    while (root.parent) root = root.parent;
    let found = null;
    root.traverse((o) => { if (!found && o.isPerspectiveCamera) found = o; });
    cameraRef = found;
    return found;
  }

  // ---- solving the inboard rake ------------------------------------------------------------
  // See the note above JET_DROOP. We want the projected jet axis to be parallel to the projected
  // car longitudinal axis; the free variable is the jet direction's car-space x coefficient `a`
  // (positive outboard), and the residual is the 2-D cross product of the two projected
  // directions, measured in PIXELS. Pixels and not NDC: NDC x carries a 1/aspect that NDC y does
  // not, so an angle taken in NDC on a 16:9 frame is wrong by nearly a factor of two.
  //
  // The residual is a smooth rational function of `a` with a single zero in the region of
  // interest, so three secant steps from a bracket that spans "straight astern" to "well inboard"
  // land on it to far better than the 4 deg tolerance, for a handful of project() calls a frame.
  const _noz = new THREE.Vector3();
  const _tip = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _back = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _dj = new THREE.Vector3();
  const _cen = new THREE.Vector3();
  const _sn = new THREE.Vector2();
  const _st = new THREE.Vector2();
  const _sg = new THREE.Vector2();
  let rake = 0;

  /**
   * Project into pixel offsets from frame centre. NDC z leaves [-1,1] behind the near plane, which
   * is the only degenerate case that matters here (the jet is always metres from the lens).
   * @returns {boolean} false if the point is not in front of the camera
   */
  function projPx(v, camera, out) {
    v.project(camera);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z < -1 || v.z > 1) return false;
    const res = pass.uniforms.uResolution.value;
    out.set(v.x * 0.5 * res.x, v.y * 0.5 * res.y);
    return true;
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} len jet length, m
   * @returns {number} car-space x coefficient for the jet direction (negative = inboard)
   */
  function solveRake(camera, len) {
    const m = flames.matrix.elements;
    _right.set(m[0], m[1], m[2]).normalize();
    _up.set(m[4], m[5], m[6]).normalize();
    _back.set(-m[8], -m[9], -m[10]).normalize();
    const pipe = flameMat.uniforms.uPipe.value;

    // target: the car's own longitudinal axis, taken on the centreline so it carries no
    // perspective divergence of its own.
    _cen.set(0, pipe.y, pipe.z).applyMatrix4(flames.matrix);
    if (!projPx(_p.copy(_cen), camera, _sn)) return rake;
    if (!projPx(_p.copy(_cen).addScaledVector(_back, len), camera, _st)) return rake;
    _sg.copy(_st).sub(_sn);
    if (_sg.lengthSq() < 1e-6) return rake;
    _sg.normalize();

    // the +x nozzle, in world
    _noz.set(pipe.x, pipe.y, pipe.z).applyMatrix4(flames.matrix);
    if (!projPx(_p.copy(_noz), camera, _sn)) return rake;

    const residual = (a) => {
      _dj.copy(_back).addScaledVector(_right, a).addScaledVector(_up, -Math.tan(JET_DROOP))
        .normalize();
      // the shader relaxes the centreline toward straight astern downstream, so the axis that
      // actually shows up on screen is the relaxed one, not the raw pipe axis.
      _dj.lerp(_back, JET_RELAX_EFF).normalize();
      _tip.copy(_noz).addScaledVector(_dj, len);
      if (!projPx(_p.copy(_tip), camera, _st)) return NaN;
      _st.sub(_sn);
      if (_st.lengthSq() < 1e-6) return NaN;
      _st.normalize();
      return _st.x * _sg.y - _st.y * _sg.x;
    };

    let a0 = 0, f0 = residual(a0);
    let a1 = -0.12, f1 = residual(a1);
    if (!Number.isFinite(f0) || !Number.isFinite(f1)) return rake;
    for (let i = 0; i < 3; i++) {
      const dfd = f1 - f0;
      if (Math.abs(dfd) < 1e-9) break;
      const a2 = a1 - f1 * (a1 - a0) / dfd;
      const f2 = residual(a2);
      if (!Number.isFinite(f2)) break;
      a0 = a1; f0 = f1; a1 = a2; f1 = f2;
    }
    rake = clamp(a1, -JET_RAKE_MAX, JET_RAKE_MAX);
    return rake;
  }

  /**
   * Draw the frame's scene depth and the hero car's silhouette into heroRT: colour is the
   * silhouette (flat white on black), the attached depth texture is the scene.
   *
   * Two renders, in this order:
   *   1. everything that writes depth in the real frame, EXCEPT the car, with a colour-write-off
   *      override material. Fills the depth attachment and leaves the colour attachment black.
   *   2. the car alone, flat white, depth-tested against (1). So the silhouette is correctly
   *      occluded by anything actually in front of the car, and the car's own z lands in the
   *      depth texture as a bonus.
   *
   * The exclusion rule for (1) is "the object's real material does not write depth", which is
   * how the sky box drops out: it is drawn with depthTest:false/depthWrite:false and sits as a
   * unit cube at the origin, so under an override material it would stamp a small patch of
   * near depth into the middle of the frame and that patch would come out as the only smeared
   * part of the sky. Same rule sheds this module's own additive plumes and trail.
   *
   * Done by hiding direct children of the scene rather than by reparenting or by layers: the
   * car's own layer/parent assignments belong to car.js and main.js, and this pass must not
   * leave a footprint on them. Every piece of renderer state touched here is saved and restored
   * in the same call, including autoClear and shadowMap.autoUpdate — without the shadow guard
   * these extra renders would re-rasterise the shadow atlas from a partial scene and hand every
   * other module a broken shadow map for the frame.
   */
  function writesDepth(o) {
    if (o === group) return false;
    const m = o.material;
    if (m && m.depthWrite === false) return false;
    return true;
  }

  function renderHeroMask(renderer) {
    const camera = findCamera();
    if (!camera) return false;
    let scene = group;
    while (scene.parent) scene = scene.parent;
    if (!scene.isScene) return false;
    // the ancestor of the car that is a direct child of the scene
    let node = car.group;
    while (node.parent && node.parent !== scene) node = node.parent;
    if (node.parent !== scene) return false;

    const kids = scene.children;
    _visSave.length = 0;
    for (let i = 0; i < kids.length; i++) _visSave.push(kids[i].visible);

    const prevOverride = scene.overrideMaterial;
    const prevTarget = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_clearCol);
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevShadowNeeds = renderer.shadowMap.needsUpdate;
    const prevAutoClear = renderer.autoClear;

    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.autoClear = false;
    renderer.setRenderTarget(heroRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);

    // ---- 1. scene depth, car excluded --------------------------------------------------
    for (let i = 0; i < kids.length; i++) {
      kids[i].visible = _visSave[i] && kids[i] !== node && writesDepth(kids[i]);
    }
    scene.overrideMaterial = depthMat;
    renderer.render(scene, camera);

    // ---- 2. hero silhouette, depth-tested against it -----------------------------------
    for (let i = 0; i < kids.length; i++) kids[i].visible = kids[i] === node;
    scene.overrideMaterial = heroMat;
    renderer.render(scene, camera);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(_clearCol, prevAlpha);
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    renderer.shadowMap.needsUpdate = prevShadowNeeds;
    renderer.autoClear = prevAutoClear;
    scene.overrideMaterial = prevOverride;
    for (let i = 0; i < kids.length; i++) kids[i].visible = _visSave[i];
    return true;
  }

  // The mask has to be produced inside the composer's render, after the frame's transforms are
  // final and while a renderer is in hand, so the pass's own render is wrapped rather than the
  // mask being built from update().
  const basePassRender = pass.render.bind(pass);
  pass.render = function boostPassRender(renderer, writeBuffer, readBuffer, dt, maskActive) {
    if (pass.uniforms.uAmount.value > 0.004) {
      const cam = findCamera();
      if (cam && cam.isPerspectiveCamera) pass.uniforms.uCamNF.value.set(cam.near, cam.far);
      // uDepthOn gates the depth term off entirely if the prepass could not run, so a missing
      // camera or a reparented car degrades to the old radius-only kernel rather than to a
      // frame-wide depth of `near` and no blur at all.
      pass.uniforms.uDepthOn.value = renderHeroMask(renderer) ? 1 : 0;
    }
    basePassRender(renderer, writeBuffer, readBuffer, dt, maskActive);
  };

  const fx = {
    pass, group, flames, trail,

    update(dt, { amount: amt = 0, speed = 0, pos, yaw = 0 } = {}) {
      const step = Math.min(Math.max(dt || 0, 0), 0.1);
      t += step;

      // fast attack, slow decay. main.js already smooths boostBlend; this shapes the *look* so
      // the effect slams in and then bleeds off, rather than tracking the tank symmetrically.
      const target = clamp(amt, 0, 1);
      env = step > 0 ? damp(env, target, target > env ? 11.0 : 2.0, step) : target;
      if (target <= 0 && env < 0.004) env = 0;
      const a = env;
      const on = a > 0.004;

      const spd01 = clamp((Math.abs(speed) - 26) / 66, 0, 1);
      const camera = findCamera();

      // ---- pass uniforms -----------------------------------------------------------------
      pass.enabled = on;
      const u = pass.uniforms;
      u.uAmount.value = a;
      u.uSpeed01.value = spd01;
      u.uTime.value = t;

      if (on && camera && pos) {
        // focus of expansion: where a point infinitely far along the velocity vector lands
        _p.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(2000).add(camera.position);
        _p.project(camera);
        u.uFocus.value.set(
          clamp(_p.x, -1.4, 1.4) * 0.5 + 0.5,
          clamp(_p.y, -1.4, 1.4) * 0.5 + 0.5,
        );
        // hero car centre + its screen radius, for the blur hole
        _q.set(pos.x, pos.y + 0.65, pos.z).project(camera);
        u.uCar.value.set(_q.x * 0.5 + 0.5, _q.y * 0.5 + 0.5);
        _p.set(pos.x + Math.cos(yaw) * 2.3, pos.y + 0.65, pos.z - Math.sin(yaw) * 2.3);
        _p.project(camera);
        const res = u.uResolution.value;
        u.uCarR.value = clamp(
          Math.hypot((_p.x - _q.x) * 0.5 * res.x, (_p.y - _q.y) * 0.5 * res.y),
          26, res.y * 0.55,
        );
      }

      // ---- exhaust jets ---------------------------------------------------------------------
      const lenPulse = pulse(0, t);
      const widePulse = pulse(1, t);
      // brightness rides the length pulse: a jet that gets longer got more fuel
      const flick = lerp(0.84, 1.16, clamp((lenPulse - 0.8) / 0.4, 0, 1));

      flames.visible = on;
      const fu = flameMat.uniforms;
      // Length is the velocity stretch: a stationary car on the limiter spits a stub, a car at
      // terminal velocity trails roughly its own length. Reference `-01` is about one car-length.
      // Capped at ~1.7 m: the jet runs *toward* a chase cam and magnifies as it comes, so past
      // that the tip crosses the bottom of the frame and the taper and orange tail are lost
      // outside it — which is exactly why the reference chase-cam shot (`-04`) has short flames
      // while the side-on one (`-01`) has a car-length plume.
      //
      // 0.8..2.2 broke exactly that rule. At 1.75 m the plume's background-subtracted footprint
      // measured 145 x >258 px with its bottom edge ON row 1079: the tip, the taper and the whole
      // far tail were off the bottom of the picture, so the jet had no end and no aspect at all.
      // r7 tuned that length toward "6.5:1", which came from `--region 0.078,0.380,0.847,0.921`
      // on reference -04 — a 580 x 80 px block that is the bottom-left HUD BOOST BAR, not a flame.
      // Ref -04's actual exhaust is two 65 x 35 px blobs, ~1.9:1 on a chase cam; ref -01, side-on,
      // runs ~4:1 over its green length. This scene is a chase cam, so 1.9-2.5:1 with a visible
      // tip is the target and the range comes down accordingly.
      const jetLen = lerp(0.55, 1.45, smoothstep(0, 1, a) * (0.42 + 0.58 * spd01)) * lenPulse;
      fu.uLen.value = jetLen;
      // Narrower than it was (0.11..0.27, then 0.09..0.17): straight down the barrel the plume's
      // own cross-section is most of its screen footprint, so a wide cone reads as a fat lime egg
      // rather than as a jet. Width has to come down WITH the shortened length or the aspect goes
      // the wrong way: at 0.09..0.17 against the new uLen the footprint measured 131 x 186 px,
      // 1.42:1, and reaching the ~1.9:1 chase-cam target by lengthening alone would have put the
      // tip back off the bottom of the frame. reference -01's jet is a LANCE — ~170 px long over
      // ~50 px thick at the pipe, tapered — so narrow is the direction the reference points in.
      fu.uWide.value = lerp(0.072, 0.132, a) * (0.5 + 0.5 * widePulse);
      // The throat is a fraction of the plume, in BOTH dimensions, and it has to be rescaled with
      // it: a fixed 0.30 m core inside a jet whose length swings 0.8..2.2 m was 0.35 of the jet at
      // the short end. reference -01's throat is ~0.12 of jet length, and it is narrower than the
      // plume it sits in, not wider.
      fu.uCoreLen.value = jetLen * 0.12;
      fu.uCoreW.value = fu.uWide.value * 0.42 * widePulse;
      if (on) {
        fu.uAmount.value = a;
        fu.uFlicker.value = clamp(flick, 0, 1.3);
        fu.uTime.value = t;
        car.group.updateWorldMatrix(true, false);
        flames.matrix.copy(car.group.matrixWorld);
        flames.matrixWorldNeedsUpdate = true;
        // must follow flames.matrix: the rake is solved in world space off the car's own basis
        if (camera) fu.uAxis.value.set(solveRake(camera, jetLen), -Math.tan(JET_DROOP), -1)
          .normalize();
      }

      // Tell the screen-space pass where the jets end, so the blur hole becomes a capsule that
      // covers them. Taken on the car's centreline: the two tips straddle it symmetrically.
      if (on && camera) {
        const axis = _axis.copy(fu.uAxis.value).multiplyScalar(jetLen);
        _r.set(0, fu.uPipe.value.y + axis.y, fu.uPipe.value.z + axis.z)
          .applyMatrix4(flames.matrix).project(camera);
        u.uJet.value.set(
          clamp(_r.x, -1.6, 1.6) * 0.5 + 0.5,
          clamp(_r.y, -1.6, 1.6) * 0.5 + 0.5,
        );
      }

      // ---- ground trail ----------------------------------------------------------------------
      trailMat.uniforms.uAmount.value = a;
      trailMat.uniforms.uPixH.value = pixH * 0.5;
      if (on && pos && step > 0) {
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const back = spd01 * a;
        dustAcc += step * (70 * a);
        sparkAcc += step * (34 * a * spd01);
        const nDust = Math.floor(dustAcc); dustAcc -= nDust;
        const nSpark = Math.floor(sparkAcc); sparkAcc -= nSpark;

        for (let kk = 0; kk < nDust; kk++) {
          const lx = (rng() < 0.5 ? -0.86 : 0.86) + (rng() - 0.5) * 0.5;
          const lz = -1.52 - rng() * 0.7;
          // kicked-up dust is nearly static in world space; it only drifts back and rises
          spawn(pos.x + lx * cy + lz * sy, 0.06 + rng() * 0.12, pos.z - lx * sy + lz * cy,
            -sy * (1.2 + rng() * 3.0 * back) + (rng() - 0.5) * 1.4,
            0.5 + rng() * 1.7,
            -cy * (1.2 + rng() * 3.0 * back) + (rng() - 0.5) * 1.4,
            0.10 + rng() * 0.16, 0, 0.45 + rng() * 0.35);
        }
        for (let kk = 0; kk < nSpark; kk++) {
          const lx = (rng() < 0.5 ? -0.86 : 0.86) + (rng() - 0.5) * 0.3;
          const lz = -1.52 - rng() * 0.3;
          const kick = 5 + rng() * 13;
          spawn(pos.x + lx * cy + lz * sy, 0.05 + rng() * 0.08, pos.z - lx * sy + lz * cy,
            -sy * kick + (rng() - 0.5) * 3.0,
            0.8 + rng() * 3.2,
            -cy * kick + (rng() - 0.5) * 3.0,
            0.028 + rng() * 0.030, 1, 0.16 + rng() * 0.18);
        }
      }

      // integrate + retire
      let anyLive = false;
      for (let i = 0; i < MAX; i++) {
        if (tLife[i] <= 0) continue;
        tLife[i] -= tRate[i] * step;
        if (tLife[i] <= 0) { tLife[i] = 0; tSize[i] = 0; continue; }
        anyLive = true;
        const j = i * 3;
        const spark = tType[i] > 0.5;
        const drag = spark ? 2.6 : 1.9;
        const g = spark ? -9.0 : 0.35;   // sparks fall, dust keeps rising
        tVel[j] -= tVel[j] * drag * step;
        tVel[j + 1] += g * step;
        tVel[j + 1] -= tVel[j + 1] * drag * 0.35 * step;
        tVel[j + 2] -= tVel[j + 2] * drag * step;
        tPos[j] += tVel[j] * step;
        tPos[j + 1] = Math.max(0.02, tPos[j + 1] + tVel[j + 1] * step);
        tPos[j + 2] += tVel[j + 2] * step;
      }
      trail.visible = on && anyLive;
      if (trail.visible) {
        trailGeo.attributes.position.needsUpdate = true;
        trailGeo.attributes.aSize.needsUpdate = true;
        trailGeo.attributes.aLife.needsUpdate = true;
        trailGeo.attributes.aType.needsUpdate = true;
      }

      // ---- exhaust heat on the bodywork -------------------------------------------------
      // Barely on. car.js's glow is a fat isotropic additive sphere at the bumper: it is the
      // one element in this file that reads as a round bloom haze rather than as burning gas,
      // so it is held down to a faint warmth on the valance and nothing more. The jet does the
      // work now.
      // Halved again from 0.07: with the plumes now narrow and parallel, car.js's isotropic
      // sphere was the widest bright thing back there — a blue lozenge across the whole valance.
      car.setBoostGlow(on ? a * 0.035 : 0);
    },

    setSize(w, h) {
      const W = Math.max(2, w), H = Math.max(2, h);
      pass.uniforms.uResolution.value.set(W, H);
      // dilation scaled to frame height so the hole reads the same at any resolution
      pass.uniforms.uHeroSoft.value = Math.max(8, H * 0.042);
      const hw = Math.max(2, Math.floor(W * 0.5));
      const hh = Math.max(2, Math.floor(H * 0.5));
      // RenderTarget.setSize only resizes the colour attachments, so the depth texture's image
      // dimensions are carried by hand; dispose() then forces it to be reallocated at the new
      // size on the next bind. Getting this wrong shows up as a depth texture stuck at 2x2, i.e.
      // one constant depth for the whole frame.
      const dt = heroRT.depthTexture;
      if (dt && (dt.image.width !== hw || dt.image.height !== hh)) {
        dt.image.width = hw;
        dt.image.height = hh;
        dt.dispose();
      }
      heroRT.setSize(hw, hh);
      pixH = H;
    },

    dispose() {
      if (heroRT.depthTexture) heroRT.depthTexture.dispose();
      heroRT.dispose(); heroMat.dispose(); depthMat.dispose();
      flameGeo.dispose(); flameMat.dispose();
      trailGeo.dispose(); trailMat.dispose();
    },
  };

  if (typeof window !== 'undefined') fx.setSize(window.innerWidth, window.innerHeight);
  fx.update(0, {});
  return fx;
}
