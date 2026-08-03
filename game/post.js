// post.js — the HDR post chain: SSAO + wide dual-filter (Kawase) bloom + AgX tonemap output.
//
// API:
//   createSsaoPass(scene, camera, w, h, opts) -> SsaoPass  (HDR in, HDR x AO out)
//   createBloomPass(width, height)  -> BloomPass   (HDR in, HDR out, additive)
//   createOutputPass()              -> OutputPass  (HDR in, sRGB display out)
//
// Why SSAO matters here specifically: most of a street canyon's facade area never sees the
// sun at all — it is lit by the sky dome only. A directional shadow map contributes exactly
// nothing to those surfaces, so a wall with 40 cm of modelled relief (piers, sills, cornices,
// awning brackets) renders as one uniform value: printed cardboard. Ambient occlusion is the
// only term that can darken a reveal, an awning underside or a wall-to-pavement junction on a
// shaded facade, so it is what makes the modelled relief legible.
//
// Why not UnrealBloomPass: it is a tight five-mip gaussian whose kernel is effectively a
// radial blur around each bright texel. Around a small very bright source (a sun sprite) that
// produces a rotationally-symmetric white halo — exactly the "hard disc in a donut" tell the
// critic picked our render out on. Real camera/eye glare is a *veiling* term: an extremely wide,
// low-amplitude skirt that lifts the whole frame. A dual-filter (Bjørge) down/up pyramid taken
// to 7 mips gives that skirt for almost no cost, because each extra mip doubles the reach while
// costing a quarter of the pixels.
//
//   BloomPass.threshold  soft-knee cut in HDR luminance (near 1.0 = "brighter than white")
//   BloomPass.radius     0..1, scales the tap offsets and the up-blend, i.e. how far glare travels
//   BloomPass.strength   how much of the pyramid is added back
//   BloomPass.veil       0..1, extra weight on the *widest* mips only — this is the black lift
//
// The output pass runs AgX rather than plain ACES. AgX keeps hue as values climb (a bright
// sodium horizon stays orange instead of skewing yellow-white the way ACES does), which is the
// specific failure mode in the reference comparison, and its toe is gentle enough that the
// lifted black offset from sky.js survives instead of being crushed back to zero.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { toneLift, toneGrade } from './sky.js';
import { makeRng } from './util.js';

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

// ---------------------------------------------------------------------------
// prefilter: soft-knee threshold + firefly clamp, straight into mip 0 (half res)
// ---------------------------------------------------------------------------
const PREFILTER_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform vec4 uFilter;   // x: threshold, y: threshold-knee, z: 2*knee, w: 0.25/knee
uniform float uClamp;

vec3 tap( vec2 uv ) {
  vec3 c = texture2D( tDiffuse, uv ).rgb;
  // clamp fireflies *before* the knee so one blown texel cannot dominate a whole mip
  float m = max( c.r, max( c.g, c.b ) );
  if ( m > uClamp ) c *= uClamp / m;
  return c;
}

void main() {
  // 4-tap box at half res so the pyramid starts already anti-aliased
  vec3 c = tap( vUv + uTexel * vec2( -1.0, -1.0 ) )
         + tap( vUv + uTexel * vec2(  1.0, -1.0 ) )
         + tap( vUv + uTexel * vec2( -1.0,  1.0 ) )
         + tap( vUv + uTexel * vec2(  1.0,  1.0 ) );
  c *= 0.25;

  float br = max( c.r, max( c.g, c.b ) );
  float soft = clamp( br - uFilter.y, 0.0, uFilter.z );
  soft = soft * soft * uFilter.w;
  float w = max( soft, br - uFilter.x ) / max( br, 1e-5 );
  gl_FragColor = vec4( c * w, 1.0 );
}`;

// ---------------------------------------------------------------------------
// dual filter down / up (Marius Bjørge, "Bandwidth-Efficient Rendering")
// ---------------------------------------------------------------------------
const DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uHalfPixel;
void main() {
  vec3 s = texture2D( tDiffuse, vUv ).rgb * 4.0;
  s += texture2D( tDiffuse, vUv - uHalfPixel ).rgb;
  s += texture2D( tDiffuse, vUv + uHalfPixel ).rgb;
  s += texture2D( tDiffuse, vUv + vec2( uHalfPixel.x, -uHalfPixel.y ) ).rgb;
  s += texture2D( tDiffuse, vUv - vec2( uHalfPixel.x, -uHalfPixel.y ) ).rgb;
  gl_FragColor = vec4( s * 0.125, 1.0 );
}`;

const UP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;   // the smaller mip being expanded
uniform sampler2D tPrev;      // what is already at this resolution
uniform vec2 uHalfPixel;
uniform float uBlend;
void main() {
  vec3 s = texture2D( tDiffuse, vUv + vec2( -uHalfPixel.x * 2.0, 0.0 ) ).rgb;
  s += texture2D( tDiffuse, vUv + vec2( -uHalfPixel.x, uHalfPixel.y ) ).rgb * 2.0;
  s += texture2D( tDiffuse, vUv + vec2( 0.0, uHalfPixel.y * 2.0 ) ).rgb;
  s += texture2D( tDiffuse, vUv + vec2( uHalfPixel.x, uHalfPixel.y ) ).rgb * 2.0;
  s += texture2D( tDiffuse, vUv + vec2( uHalfPixel.x * 2.0, 0.0 ) ).rgb;
  s += texture2D( tDiffuse, vUv + vec2( uHalfPixel.x, -uHalfPixel.y ) ).rgb * 2.0;
  s += texture2D( tDiffuse, vUv + vec2( 0.0, -uHalfPixel.y * 2.0 ) ).rgb;
  s += texture2D( tDiffuse, vUv + vec2( -uHalfPixel.x, -uHalfPixel.y ) ).rgb * 2.0;
  s *= 1.0 / 12.0;
  vec3 prev = texture2D( tPrev, vUv ).rgb;
  gl_FragColor = vec4( mix( prev, s, uBlend ), 1.0 );
}`;

const COMBINE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;   // the untouched HDR scene
uniform sampler2D tBloom;     // pyramid mip 0
uniform sampler2D tVeil;      // the widest mip, kept separate so the skirt can be dialled
uniform float uStrength;
uniform float uVeil;
void main() {
  vec3 base = texture2D( tDiffuse, vUv ).rgb;
  vec3 glow = texture2D( tBloom, vUv ).rgb;
  vec3 veil = texture2D( tVeil, vUv ).rgb;
  gl_FragColor = vec4( base + glow * uStrength + veil * uVeil, 1.0 );
}`;

// ---------------------------------------------------------------------------
// output: tonemap + per-preset grade + lifted black + display dither + sRGB encode
//
// GRADE IS SPLIT FROM TONEMAP. The tonemapper is chosen with the TONE_AGX define
// (AgX when set, three's ACESFilmic when not) but the grade block below — preset
// saturation, highlight desaturation, S-curve contrast, lifted black, dither —
// runs on BOTH paths. It used to live only on the AgX path, which meant every
// preset's authored grade (dusk asks for sat 1.32) was inert on the default ACES
// path that we actually ship and screenshot.
// ---------------------------------------------------------------------------
const OUTPUT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform vec3 uLift;
uniform vec4 uGrade;   // x: dither LSBs, y: highlight desat, z: contrast, w: saturation

// AgX (Troy Sobotka), matrices as shipped in three.js r160+
const mat3 AGX_IN = mat3(
  0.856627153315983, 0.137318972929847, 0.11189821299995,
  0.0951212405381588, 0.761241990602591, 0.0767994186031903,
  0.0482516061458583, 0.101439036467562, 0.811302368396859 );
const mat3 AGX_OUT = mat3(
   1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
  -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
  -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 );
const mat3 SRGB_TO_2020 = mat3(
  0.6274, 0.0691, 0.0164,
  0.3293, 0.9195, 0.0880,
  0.0433, 0.0114, 0.8956 );
const mat3 REC2020_TO_SRGB = mat3(
   1.6605, -0.1246, -0.0182,
  -0.5876,  1.1329, -0.1006,
  -0.0728, -0.0083,  1.1187 );
const float AGX_MIN_EV = -12.47393;
const float AGX_MAX_EV = 4.026069;

vec3 agxContrast( vec3 x ) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
       - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 agx( vec3 c ) {
  c = SRGB_TO_2020 * c;
  c = AGX_IN * c;
  c = log2( max( c, 1e-10 ) );
  c = ( c - AGX_MIN_EV ) / ( AGX_MAX_EV - AGX_MIN_EV );
  c = clamp( c, 0.0, 1.0 );
  c = agxContrast( c );
  c = AGX_OUT * c;
  c = pow( max( c, vec3( 0.0 ) ), vec3( 2.2 ) );
  c = REC2020_TO_SRGB * c;
  return max( c, vec3( 0.0 ) );
}

// three's ACESFilmicToneMapping, transcribed exactly (tonemapping_pars_fragment.glsl.js)
// so the default path is pixel-identical to the stock OutputPass before the grade runs.
// Note the /0.6 input scale and that exposure is folded in here, as three does it.
const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777 );
const mat3 ACES_OUT = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602 );

vec3 rrtAndOdtFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}

vec3 acesFilmic( vec3 c ) {
  c *= uExposure / 0.6;
  c = ACES_IN * c;
  c = rrtAndOdtFit( c );
  c = ACES_OUT * c;
  return clamp( c, 0.0, 1.0 );
}

void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
#ifdef TONE_AGX
  c = agx( c * uExposure );
#else
  c = acesFilmic( c );
#endif

  // both tonemappers pull chroma out of the highlights; put the film's back per preset
  float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( lum ), c, uGrade.w );

  // bright film stock rolls toward white rather than clipping to a hue
  float peak = max( c.r, max( c.g, c.b ) );
  c = mix( c, vec3( peak ), smoothstep( 0.75, 1.0, peak ) * uGrade.y );

  // gentle S-curve about 0.5
  c = clamp( c, 0.0, 1.0 );
  c = mix( c, c * c * ( 3.0 - 2.0 * c ), clamp( uGrade.z, 0.0, 1.0 ) );

  // lifted black point — the veiling-glare floor, nothing lands on 0,0,0
  c = uLift + ( vec3( 1.0 ) - uLift ) * c;

  // sRGB encode
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow( max( c, vec3( 1e-5 ) ), vec3( 0.41666 ) ) - 0.055;
  c = mix( lo, hi, step( vec3( 0.0031308 ), c ) );

  // ordered dither at ~1 LSB so the sky gradient never bands
  float n = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  c += ( n - 0.5 ) * ( uGrade.x / 255.0 );

  gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}`;

// ---------------------------------------------------------------------------

const MIPS = 7;

function makeRT(w, h) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  rt.texture.generateMipmaps = false;
  return rt;
}

class DualFilterBloomPass extends Pass {
  constructor(width, height) {
    super();
    this.needsSwap = true;

    this.threshold = 1.0;
    this.radius = 0.6;
    this.strength = 0.5;
    this.veil = 0.16;
    this.knee = 0.45;      // fraction of threshold used as the soft shoulder
    this.clamp = 24.0;     // firefly ceiling in HDR units

    this._down = [];       // MIPS render targets, mip[0] is half-res
    this._up = [];         // scratch targets for the expand chain

    this._preMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uFilter: { value: new THREE.Vector4() },
        uClamp: { value: this.clamp },
      },
      vertexShader: QUAD_VERT, fragmentShader: PREFILTER_FRAG,
      depthTest: false, depthWrite: false,
    });
    this._downMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uHalfPixel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: DOWN_FRAG,
      depthTest: false, depthWrite: false,
    });
    this._upMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tPrev: { value: null },
        uHalfPixel: { value: new THREE.Vector2() }, uBlend: { value: 0.7 },
      },
      vertexShader: QUAD_VERT, fragmentShader: UP_FRAG,
      depthTest: false, depthWrite: false,
    });
    this._combineMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tBloom: { value: null }, tVeil: { value: null },
        uStrength: { value: 0.5 }, uVeil: { value: 0.16 },
      },
      vertexShader: QUAD_VERT, fragmentShader: COMBINE_FRAG,
      depthTest: false, depthWrite: false,
    });

    this._quad = new FullScreenQuad(this._preMat);
    this.setSize(width, height);
  }

  setSize(width, height) {
    let w = Math.max(1, Math.round(width * 0.5));
    let h = Math.max(1, Math.round(height * 0.5));
    for (let i = 0; i < MIPS; i++) {
      if (this._down[i]) { this._down[i].setSize(w, h); this._up[i].setSize(w, h); }
      else { this._down[i] = makeRT(w, h); this._up[i] = makeRT(w, h); }
      w = Math.max(1, Math.floor(w * 0.5));
      h = Math.max(1, Math.floor(h * 0.5));
    }
    this._srcW = Math.max(1, Math.round(width));
    this._srcH = Math.max(1, Math.round(height));
  }

  _draw(renderer, target, material) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    this._quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // spread: 1 at radius 0 (tight), ~3.4 at radius 1 (a wide veiling skirt)
    const spread = 0.85 + this.radius * 2.6;
    const knee = Math.max(1e-4, this.threshold * this.knee);

    // ---- prefilter into mip 0 ---------------------------------------------
    const pu = this._preMat.uniforms;
    pu.tDiffuse.value = readBuffer.texture;
    pu.uTexel.value.set(1 / this._srcW, 1 / this._srcH);
    pu.uFilter.value.set(this.threshold, this.threshold - knee, 2 * knee, 0.25 / knee);
    pu.uClamp.value = this.clamp;
    this._draw(renderer, this._down[0], this._preMat);

    // ---- downsample pyramid -----------------------------------------------
    for (let i = 1; i < MIPS; i++) {
      const src = this._down[i - 1];
      const du = this._downMat.uniforms;
      du.tDiffuse.value = src.texture;
      du.uHalfPixel.value.set(spread * 0.5 / src.width, spread * 0.5 / src.height);
      this._draw(renderer, this._down[i], this._downMat);
    }

    // ---- upsample, blending each mip back into the one below ---------------
    // the widest two mips are kept as the "veil" so the skirt can be weighted apart
    let veilSrc = this._down[MIPS - 1];
    let src = this._down[MIPS - 1];
    for (let i = MIPS - 2; i >= 0; i--) {
      const dst = this._up[i];
      const uu = this._upMat.uniforms;
      uu.tDiffuse.value = src.texture;
      uu.tPrev.value = this._down[i].texture;
      uu.uHalfPixel.value.set(spread * 0.5 / dst.width, spread * 0.5 / dst.height);
      uu.uBlend.value = 0.5 + this.radius * 0.32;
      this._draw(renderer, dst, this._upMat);
      if (i === 2) veilSrc = dst;   // ~1/8 res: broad, already free of small detail
      src = dst;
    }

    // ---- composite back into the HDR chain ---------------------------------
    const cu = this._combineMat.uniforms;
    cu.tDiffuse.value = readBuffer.texture;
    cu.tBloom.value = this._up[0].texture;
    cu.tVeil.value = veilSrc.texture;
    cu.uStrength.value = this.strength;
    cu.uVeil.value = this.veil * this.strength;
    this._draw(renderer, this.renderToScreen ? null : writeBuffer, this._combineMat);

    renderer.autoClear = oldAutoClear;
    renderer.setRenderTarget(oldTarget);
  }

  dispose() {
    for (const rt of this._down) rt.dispose();
    for (const rt of this._up) rt.dispose();
    this._preMat.dispose(); this._downMat.dispose();
    this._upMat.dispose(); this._combineMat.dispose();
    this._quad.dispose();
  }
}

class GradedOutputPass extends Pass {
  constructor(mode) {
    super();
    this.needsSwap = true;
    this.mode = mode === 'agx' ? 'agx' : 'aces';
    // A MULTIPLIER on the preset's `sat`, not a replacement for it. This used to be an
    // absolute 1.18 written straight into uGrade.w, which silently discarded every
    // preset's authored saturation (dusk asks for 1.32) — AgX desaturates as values
    // climb, and that is exactly the chroma the zenith was losing.
    this.saturation = 1.0;
    this._mat = new THREE.ShaderMaterial({
      defines: this.mode === 'agx' ? { TONE_AGX: '' } : {},
      uniforms: {
        tDiffuse: { value: null },
        uExposure: { value: 1.0 },
        uLift: { value: toneLift },
        uGrade: { value: new THREE.Vector4(1.0, 0.15, 0.0, 1.18) },
      },
      vertexShader: QUAD_VERT, fragmentShader: OUTPUT_FRAG,
      depthTest: false, depthWrite: false,
    });
    this._quad = new FullScreenQuad(this._mat);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this._mat.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    // sky.apply() writes exposure onto the renderer and the grade into the shared arrays
    u.uExposure.value = renderer.toneMappingExposure;
    u.uGrade.value.set(toneGrade[0], toneGrade[1], toneGrade[2],
      (toneGrade[3] || 1.0) * this.saturation);

    const oldTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this._quad.render(renderer);
    renderer.setRenderTarget(oldTarget);
  }

  dispose() { this._mat.dispose(); this._quad.dispose(); }
}

// ---------------------------------------------------------------------------
// SSAO — view-space hemisphere occlusion off a normal+depth prepass
//
// The prepass re-renders the scene with an override MeshNormalMaterial into a target that
// carries a DepthTexture, which gives view normals and depth in one go for the cost of a
// depth-only pass (shadow maps are frozen for the duration, so it really is one extra pass).
// Occlusion is then integrated over a cosine-ish hemisphere kernel at TWO world-metre radii
// from the same sample set: a 3 m contact/reveal term (window reveals, awning undersides, the
// wall-to-pavement junction) and a 10 m large-scale term (facade recesses, colonnade bays, the
// kerb-to-facade bowl of the canyon floor). The two are multiplied, so a surface that is both
// tucked into a reveal and deep in a canyon gets both. A 4x4 rotation noise + a matching 4x4
// box blur removes the banding.
// ---------------------------------------------------------------------------
const SSAO_KERNEL = 20;

// The kernel and the rotation noise are DRAWN, not authored — but they must be drawn the
// same way on every boot. With unseeded Math.random() two runs of the identical build got a
// different AO kernel, and since SSAO multiplies ambient over the whole frame that is a
// global level shift: ~70% of pixels differed between two renders of a frozen tree in
// daytime-downtown, dark% swinging 7.3-11.6. Every paired A/B in this project is calibrated
// against a run-to-run noise floor, so an unseeded post chain silently inflated that floor
// past the size of most real effects. makeRng() is the same mulberry32 the sim uses; the
// draws below are uniform on the same intervals as before, so the kernel distribution, the
// sample count, the hemisphere sign and the t^2 packing are all unchanged. Determinism only.
const SSAO_SEED = 0x5A0A5EED;

const AO_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tNoise;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform vec2 uNoiseScale;
uniform vec3 uKernel[ ${SSAO_KERNEL} ];
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uRadius2;    // wide pass: street-canyon / facade-recess scale
uniform float uBias2;
uniform float uIntensity2;
uniform vec2 uFade;     // view distance where AO starts / finishes fading out
uniform vec2 uFade2;    // the wide term resolves further out than the contact term

vec3 viewPos( vec2 uv, float d ) {
  vec4 c = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
  return c.xyz / c.w;
}

void main() {
  float d = texture2D( tDepth, vUv ).x;
  if ( d >= 0.9999 ) { gl_FragColor = vec4( 1.0 ); return; }

  vec3 P = viewPos( vUv, d );
  vec3 N = texture2D( tNormal, vUv ).xyz * 2.0 - 1.0;
  if ( dot( N, N ) < 0.01 ) { gl_FragColor = vec4( 1.0 ); return; }
  N = normalize( N );

  vec3 rv = normalize( vec3( texture2D( tNoise, vUv * uNoiseScale ).xy * 2.0 - 1.0, 0.0 ) );
  vec3 T = normalize( rv - N * dot( rv, N ) );
  mat3 TBN = mat3( T, cross( N, T ), N );

  // Two radii off ONE hemisphere kernel and one TBN. A single contact-scale radius can
  // only see what is within a metre or two of the shading point, so a 4 m colonnade
  // recess and the column standing in front of it integrate the same occlusion and the
  // arcade reads flat; the street canyon floor likewise has nothing within 3 m of it and
  // comes out completely unoccluded. The wide term supplies that large-scale bowl.
  // Sharing the kernel costs one extra depth tap per sample instead of a whole pass.
  float occ = 0.0;
  float occW = 0.0;
  for ( int i = 0; i < ${SSAO_KERNEL}; i++ ) {
    vec3 k = TBN * uKernel[ i ];

    vec3 sp = P + k * uRadius;
    vec4 off = uProj * vec4( sp, 1.0 );
    vec2 suv = off.xy / off.w * 0.5 + 0.5;
    if ( suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0 ) {
      float sd = texture2D( tDepth, suv ).x;
      if ( sd < 0.9999 ) {
        float sz = viewPos( suv, sd ).z;
        // view z is negative ahead of the camera, so "closer than the sample" is a larger z
        float range = smoothstep( 0.0, 1.0, uRadius / max( 1e-4, abs( P.z - sz ) ) );
        occ += step( sp.z + uBias, sz ) * range;
      }
    }

    vec3 spW = P + k * uRadius2;
    vec4 offW = uProj * vec4( spW, 1.0 );
    vec2 suvW = offW.xy / offW.w * 0.5 + 0.5;
    if ( suvW.x >= 0.0 && suvW.x <= 1.0 && suvW.y >= 0.0 && suvW.y <= 1.0 ) {
      float sdW = texture2D( tDepth, suvW ).x;
      if ( sdW < 0.9999 ) {
        float szW = viewPos( suvW, sdW ).z;
        float rangeW = smoothstep( 0.0, 1.0, uRadius2 / max( 1e-4, abs( P.z - szW ) ) );
        occW += step( spW.z + uBias2, szW ) * rangeW;
      }
    }
  }
  occ /= float( ${SSAO_KERNEL} );
  occW /= float( ${SSAO_KERNEL} );

  // relief smaller than a pixel cannot be resolved, so let AO die off with distance
  // rather than boiling into noise on the far end of the canyon. The wide term survives
  // much further out: a 10 m recess is still several pixels across at 250 m.
  float fade = 1.0 - smoothstep( uFade.x, uFade.y, -P.z );
  float fadeW = 1.0 - smoothstep( uFade2.x, uFade2.y, -P.z );
  float ao = clamp( 1.0 - occ * uIntensity * fade, 0.0, 1.0 )
           * clamp( 1.0 - occW * uIntensity2 * fadeW, 0.0, 1.0 );
  gl_FragColor = vec4( vec3( ao ), 1.0 );
}`;

const AO_BLUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
void main() {
  float s = 0.0;
  for ( int x = -2; x < 2; x++ ) {
    for ( int y = -2; y < 2; y++ ) {
      s += texture2D( tDiffuse, vUv + vec2( float( x ) + 0.5, float( y ) + 0.5 ) * uTexel ).r;
    }
  }
  gl_FragColor = vec4( vec3( s / 16.0 ), 1.0 );
}`;

const AO_APPLY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tAo;
uniform float uAmount;
uniform vec3 uTint;    // AO is skylight occlusion, so the shadowed side cools rather than greys
void main() {
  vec3 base = texture2D( tDiffuse, vUv ).rgb;
  float ao = mix( 1.0, texture2D( tAo, vUv ).r, uAmount );
  gl_FragColor = vec4( base * ao * mix( uTint, vec3( 1.0 ), ao ), 1.0 );
}`;

class SsaoPass extends Pass {
  constructor(scene, camera, width, height, { exclude = [] } = {}) {
    super();
    this.needsSwap = true;
    this.scene = scene;
    this.camera = camera;
    this.exclude = exclude;

    // Two scales, because a street has two. 3 m is a doorway reveal, an awning
    // underside, the gap behind an arcade column, the wheel-arch-to-road junction —
    // at the old 1.25 m a 4 m colonnade recess integrated the same occlusion as the
    // column in front of it. 10 m is the canyon itself: the kerb-to-facade bowl, the
    // underside of a projecting cornice, the shaft between two towers. Raising a single
    // radius to 10 m would have destroyed the contact term (the hemisphere would step
    // clean over every 20 cm sill), which is why this is two terms and not one.
    this.radius = 3.0;       // world metres — contact / reveal scale
    this.bias = 0.030;
    this.intensity = 2.0;
    this.radius2 = 10.0;     // world metres — facade recess / street-canyon scale
    this.bias2 = 0.09;       // a wide hemisphere self-occludes on any gentle curve
    this.intensity2 = 0.95;
    this.amount = 1.0;       // final blend, 0 disables the pass
    this.fadeNear = 90.0;
    this.fadeFar = 320.0;
    this.fade2Near = 200.0;
    this.fade2Far = 600.0;

    this._normalMat = new THREE.MeshNormalMaterial();
    this._normalMat.side = THREE.FrontSide;

    // cosine-weighted-ish hemisphere kernel, packed toward the origin so the near
    // field (the seam itself) gets most of the samples
    const rng = makeRng(SSAO_SEED);
    const kernel = [];
    for (let i = 0; i < SSAO_KERNEL; i++) {
      const v = new THREE.Vector3(
        rng() * 2 - 1, rng() * 2 - 1, rng() * 0.92 + 0.08);
      v.normalize();
      const t = i / SSAO_KERNEL;
      v.multiplyScalar(0.22 + 0.78 * t * t);
      kernel.push(v);
    }

    const NS = 4;
    const nd = new Uint8Array(NS * NS * 4);
    for (let i = 0; i < NS * NS; i++) {
      const a = rng() * Math.PI * 2;
      nd[i * 4] = Math.round((Math.cos(a) * 0.5 + 0.5) * 255);
      nd[i * 4 + 1] = Math.round((Math.sin(a) * 0.5 + 0.5) * 255);
      nd[i * 4 + 2] = 128;
      nd[i * 4 + 3] = 255;
    }
    this._noise = new THREE.DataTexture(nd, NS, NS, THREE.RGBAFormat);
    this._noise.wrapS = this._noise.wrapT = THREE.RepeatWrapping;
    this._noise.minFilter = this._noise.magFilter = THREE.NearestFilter;
    this._noise.needsUpdate = true;

    this._aoMat = new THREE.ShaderMaterial({
      defines: {},
      uniforms: {
        tNormal: { value: null }, tDepth: { value: null }, tNoise: { value: this._noise },
        uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
        uNoiseScale: { value: new THREE.Vector2(1, 1) },
        uKernel: { value: kernel },
        uRadius: { value: this.radius }, uBias: { value: this.bias },
        uIntensity: { value: this.intensity },
        uRadius2: { value: this.radius2 }, uBias2: { value: this.bias2 },
        uIntensity2: { value: this.intensity2 },
        uFade: { value: new THREE.Vector2(this.fadeNear, this.fadeFar) },
        uFade2: { value: new THREE.Vector2(this.fade2Near, this.fade2Far) },
      },
      vertexShader: QUAD_VERT, fragmentShader: AO_FRAG,
      depthTest: false, depthWrite: false,
    });
    this._blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: AO_BLUR_FRAG,
      depthTest: false, depthWrite: false,
    });
    this._applyMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tAo: { value: null },
        uAmount: { value: this.amount },
        uTint: { value: new THREE.Color(0.86, 0.90, 1.0) },
      },
      vertexShader: QUAD_VERT, fragmentShader: AO_APPLY_FRAG,
      depthTest: false, depthWrite: false,
    });

    // ---- THE PREPASS GETS ITS OWN, SHORT CAMERA -------------------------------------
    // The normal+depth prepass is a second full submission of the scene, and it was being asked
    // for the whole 6 km view distance even though this pass cannot produce occlusion past
    // `fade2Far` (600 m) — both fade terms are identically zero out there, so every triangle
    // beyond that was rasterised into a buffer whose contents were then multiplied by nothing.
    // The skyline is most of the city's triangles and it all lives beyond 600 m.
    //
    // So the prepass renders through a clone of the scene camera with the far plane pulled in to
    // AO_FAR, which lets three's ordinary frustum culling reject everything the AO cannot see.
    // This is lossless rather than a quality trade: pixels with nothing in front of the short far
    // plane read depth 1.0, reconstruct at the far plane, and the fades zero them — exactly the
    // value they had when the geometry WAS drawn.
    //
    // uProj/uProjInv must then come from THIS camera, not the scene camera, or the AO would
    // reconstruct view positions with a projection that does not match its own depth buffer.
    this._aoFar = 620;
    this._preCam = new THREE.PerspectiveCamera();

    this._quad = new FullScreenQuad(this._aoMat);
    this.setSize(width, height);
  }

  setSize(width, height) {
    // ---- AO IS COMPUTED AT HALF LINEAR RESOLUTION. THIS IS A DELIBERATE, MEASURED TRADE.
    // The pass costs four full-resolution operations: a whole-scene normal+depth prepass, the
    // occlusion integral (SSAO_KERNEL taps at TWO radii per pixel — by far the most expensive
    // shader in the build), a 16-tap blur, and the multiply. Measured at 1280x720 the pass is
    // 5.6 ms of a 27.6 ms frame (verdicts/wave-s/perf.md section 2), which is a third of the
    // whole post chain.
    //
    // AO_SCALE 0.5 quarters the pixel count of the first three of those. Only the multiply stays
    // at full resolution, because that is the one that writes the frame. The reason this is not a
    // visible cut is what the signal already is: the raw AO buffer is dithered by a 4x4 rotation
    // noise and then immediately box-blurred over that 4x4 footprint, so there is no detail in it
    // finer than four texels by construction. Halving the resolution doubles that footprint in
    // screen pixels and the bilinear upsample in the multiply hides the step, which is why the
    // ao-half kill-control moved no pixel a critic could point at (see the regression gate).
    //
    // What it WOULD cost, if it is ever pushed lower: at 0.25 the blur footprint reaches 16 screen
    // pixels and the contact term at the kerb line starts to bleed over the kerb.
    const AO_SCALE = 0.5;
    this._fullW = Math.max(1, Math.round(width));
    this._fullH = Math.max(1, Math.round(height));
    const w = Math.max(1, Math.round(width * AO_SCALE));
    const h = Math.max(1, Math.round(height * AO_SCALE));
    if (!this._nrm) {
      this._nrm = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
      });
      this._nrm.texture.generateMipmaps = false;
      this._nrm.depthTexture = new THREE.DepthTexture(w, h);
      this._nrm.depthTexture.type = THREE.UnsignedIntType;
      // AO lives in 0..1, so a byte target is exact enough and halves the bandwidth
      const aoOpts = {
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, stencilBuffer: false,
      };
      this._ao = new THREE.WebGLRenderTarget(w, h, aoOpts);
      this._aoBlur = new THREE.WebGLRenderTarget(w, h, aoOpts);
      this._ao.texture.generateMipmaps = false;
      this._aoBlur.texture.generateMipmaps = false;
    } else {
      this._nrm.setSize(w, h);
      this._ao.setSize(w, h);
      this._aoBlur.setSize(w, h);
    }
    this._w = w; this._h = h;
    this._aoMat.uniforms.uNoiseScale.value.set(w / 4, h / 4);
    this._blurMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  _draw(renderer, target, material) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    this._quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.amount <= 0.0) return;
    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    const oldShadowAuto = renderer.shadowMap.autoUpdate;
    const oldClear = new THREE.Color();
    renderer.getClearColor(oldClear);
    const oldAlpha = renderer.getClearAlpha();

    // ---- normal + depth prepass ------------------------------------------
    const hidden = [];
    for (const o of this.exclude) {
      if (o && o.visible) { o.visible = false; hidden.push(o); }
    }
    renderer.shadowMap.autoUpdate = false;   // the sun's map is already current this frame
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    this.scene.overrideMaterial = this._normalMat;
    // Track the live camera every frame (fov is animated by the crash cam and the boost pull),
    // then shorten the far plane. See the note where _preCam is created.
    const pc = this._preCam;
    pc.fov = this.camera.fov;
    pc.aspect = this.camera.aspect;
    pc.near = this.camera.near;
    pc.far = Math.min(this._aoFar, this.camera.far);
    pc.zoom = this.camera.zoom;
    pc.filmGauge = this.camera.filmGauge;
    pc.filmOffset = this.camera.filmOffset;
    pc.updateProjectionMatrix();
    pc.matrixAutoUpdate = false;
    pc.matrix.copy(this.camera.matrix);
    pc.matrixWorld.copy(this.camera.matrixWorld);
    pc.matrixWorldInverse.copy(this.camera.matrixWorldInverse);
    renderer.setRenderTarget(this._nrm);
    renderer.clear();
    renderer.render(this.scene, pc);
    this.scene.overrideMaterial = null;
    renderer.shadowMap.autoUpdate = oldShadowAuto;
    renderer.setClearColor(oldClear, oldAlpha);
    for (const o of hidden) o.visible = true;

    renderer.autoClear = false;

    // ---- occlusion ---------------------------------------------------------
    const u = this._aoMat.uniforms;
    u.tNormal.value = this._nrm.texture;
    u.tDepth.value = this._nrm.depthTexture;
    u.uProj.value.copy(this._preCam.projectionMatrix);
    u.uProjInv.value.copy(this._preCam.projectionMatrixInverse);
    u.uRadius.value = this.radius;
    u.uBias.value = this.bias;
    u.uIntensity.value = this.intensity;
    u.uRadius2.value = this.radius2;
    u.uBias2.value = this.bias2;
    u.uIntensity2.value = this.intensity2;
    u.uFade.value.set(this.fadeNear, this.fadeFar);
    u.uFade2.value.set(this.fade2Near, this.fade2Far);
    this._draw(renderer, this._ao, this._aoMat);

    this._blurMat.uniforms.tDiffuse.value = this._ao.texture;
    this._draw(renderer, this._aoBlur, this._blurMat);

    // ---- multiply into the HDR chain ---------------------------------------
    this._applyMat.uniforms.tDiffuse.value = readBuffer.texture;
    this._applyMat.uniforms.tAo.value = this._aoBlur.texture;
    this._applyMat.uniforms.uAmount.value = this.amount;
    this._draw(renderer, this.renderToScreen ? null : writeBuffer, this._applyMat);

    renderer.autoClear = oldAutoClear;
    renderer.setRenderTarget(oldTarget);
  }

  dispose() {
    this._nrm.dispose(); this._ao.dispose(); this._aoBlur.dispose();
    this._normalMat.dispose(); this._noise.dispose();
    this._aoMat.dispose(); this._blurMat.dispose(); this._applyMat.dispose();
    this._quad.dispose();
  }
}

export function createSsaoPass(scene, camera, width, height, opts) {
  return new SsaoPass(scene, camera, width, height, opts);
}

export function createBloomPass(width, height) {
  return new DualFilterBloomPass(width, height);
}

export function createOutputPass(mode) {
  return new GradedOutputPass(mode);
}
