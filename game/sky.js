// sky.js — analytic atmosphere, sun/moon, PMREM environment, aerial-perspective fog, grade.
// API: createSky(scene, renderer) -> sky object.
//   sky.apply(presetName)   set time of day ('dawn'|'midday'|'dusk'|'night', plus the aliases
//                           'day'/'noon' -> midday, 'sunrise' -> dawn, 'sunset' -> dusk);
//                           rebuilds sky LUT + clouds + env + fog + grade. Returns the preset.
//   sky.applyBloom(pass)    push the preset's bloom threshold/radius/strength/veil onto post.js's
//                           DualFilterBloomPass (duck-typed, so any bloom pass works).
//   sky.update(dt, focusPos) keeps the shadow camera on the car;  sky.PRESETS  tunable table.
//   sky.sun (DirectionalLight), sky.envTexture (PMREM), sky.preset (active preset object).
//
// THE ATMOSPHERE
// The sky is not a vertical colour lerp. It is a single-scattering integral through a spherical
// shell atmosphere — Rayleigh (8 km scale height), Mie (1.2 km) and an ozone absorption tent at
// 25 km — with a cheap isotropic multiple-scattering term added on top. That model is what
// produces, for free and correctly coupled:
//
//   * a teal/deep-blue zenith at dusk (the ozone Chappuis band absorbs the orange-red that the
//     kilometre-long twilight path would otherwise leave in the zenith),
//   * a Mie forward-scatter lobe (Henyey-Greenstein) around the sun; the bake carries the
//     wide grazing-path component, and the dome shader adds an explicit two-exponent radial
//     lobe on top (see CLOUDS AND THE SUN LOBE below) so the sun reads as a disc scattering
//     through kilometres of air rather than as one blown horizontal streak,
//   * progressive reddening into the haze band, since the long path preferentially extinguishes
//     blue before the scattered light reaches the eye,
//   * a real earth shadow: the sun-ray transmittance is zero for samples the planet occludes, so
//     with the sun a degree *under* the horizon there is no disc at all, only the wedge.
//
// The integral is far too expensive per pixel, so apply() bakes it once into a 384x192 half-float
// sky-view LUT parameterised by (azimuth-from-sun, horizon-warped elevation) — the Hillaire
// parameterisation, where the sqrt warp on elevation puts most of the rows in the few degrees
// either side of the horizon where all the interesting gradient lives. The dome shader is then a
// single bilinear tap plus stars and an optional (sun/moon) disc.
//
// CLOUDS AND THE SUN LOBE
// The dome shader carries two scrolling cloud decks and a radial Mie halo. Both are analytic,
// cost only the sky pixels, and need no textures:
//
//   * Each deck is a real horizontal slab at a FIXED ALTITUDE (alto ~2.8 km, cirrus ~8 km),
//     not a texture on the dome. The view ray is intersected with it — t = (H - camY) / d.y —
//     and the noise is sampled in world metres at the hit point, so the deck has a genuine
//     ceiling: a band of fixed width on the plane subtends less and less angle as it recedes,
//     and the layer stacks itself into thin ribbons that converge at the horizon for free.
//   * The domain is then rotated into a WIND frame and squashed ~4:1 along it (plus a second,
//     slower-scrolling low-frequency octave that shears the bands across the wind). Cloud
//     *shape* is therefore never a function of the sun direction — that was what made the old
//     deck read as spokes radiating from the sun, since the old uv = d.xz/d.y domain was
//     stretched along the depth axis, whose vanishing point is wherever the camera is pointed.
//     The sun enters only as *brightness*: the two sky-LUT taps the deck is lit by, a
//     pow(dot(V,S),7) silver lining, and one shadow tap displaced along the sun's azimuth.
//   * The perspective compression is unbounded, so the noise would alias into moire near the
//     horizon. Each deck computes the world-space footprint of one pixel on its own plane,
//     pushes it through the same anisotropic map, and drops the octaves that fall under it
//     (a hand-rolled mip chain); when nothing is left to resolve the deck dissolves into the
//     haze band instead of shimmering.
//   * Deck lighting is two taps of the sky LUT itself — the sky right next to the sun (warm)
//     and the sky overhead away from it (cool) — so undersides pick up the sodium horizon and
//     tops stay teal, and the whole thing re-derives itself correctly at any time of day
//     without a single hand-authored cloud colour. A pow(dot(V,S),7) term adds the silver
//     lining on the sun-facing edges.
//   * The halo is a radially symmetric tight lobe + wide aureole about the sun direction plus a
//     thin exp() horizon band, all in HDR. It is deliberately above 1.0 so the bloom pyramid
//     keys off *it* rather than off a clipped disc or an anisotropic streak kernel.
//
// This module also owns two global render-pipeline patches, installed once at import time
// (before any material is compiled) so they apply to every material in the game:
//
//   1. FOG  — three's FogExp2 chunk is replaced by a height-integrated exponential fog whose
//      colour is a view-direction-dependent "aerial perspective" lookup that matches the sky
//      dome. Far geometry therefore desaturates *toward the sky it is standing in front of*
//      instead of toward one flat fog colour, and haze pools near the ground.
//   2. UNIFORM PLUMBING — the extra fog uniforms are injected into THREE.ShaderLib as
//      Float32Array values. UniformsUtils.clone() copies typed arrays *by reference*, so every
//      material (including ones created later) shares one live copy that apply() writes into.
//
// Tonemapping is NOT here — post.js owns it (AgX + lifted black + dither). sky.js only
// publishes the live `toneLift` / `toneGrade` arrays that post.js's output pass reads.
//
// *** THE PER-PRESET GRADE IS LIVE. THIS NOTE USED TO SAY IT WAS DEAD. IT WAS WRONG. ***
// Found r6, TRUE THEN, FALSE SINCE, and corrected in Wave P after a Wave O critic caught the
// stale copy of it that was still sitting on the dusk preset's grade block below.
// What the code actually does, greped not remembered:
//     main.js:13   import { createSsaoPass, createBloomPass, createOutputPass } from './post.js'
//     main.js:75   renderer.toneMapping = THREE.NoToneMapping     (NOT ACESFilmic)
//     main.js:128  const outputPass = createOutputPass(toneMode)  -> post.js's GradedOutputPass
//     main.js:120  bloomMode === 'dual' ? createBloomPass(...) : new UnrealBloomPass(...)
// post.js:35 imports `toneLift` / `toneGrade` from this file and sky.js:1551-1555 writes them
// every apply(), so lift / dither / hiDesat / contrast / sat ALL REACH THE IMAGE, and they
// reach it on the DEFAULT path — post.js:414 only switches the TONEMAPPER on `#tone=agx`
// (TONE_AGX define); the grade block at post.js:224-240 runs either way. The shipping look is
// ACES + the authored grade. `renderer.toneMapping` is deliberately NoToneMapping because
// three only applies it when drawing straight to the canvas and RenderPass never does.
// `exposure` reaches the pass as uExposure via renderer.toneMappingExposure.
// The only preset field that still goes nowhere is bloom `veil` (no counterpart on
// UnrealBloomPass). Lifted blacks are AUTHORED. Do NOT re-derive the AgX matrices or the sky
// model: both exist. Do NOT "wire the real chain" — it is wired.
//
// Parameters other modules may care about:
//   sky.fogParams  Float32Array [density, heightFalloff, groundY, uniformDensity] — live.
//   sky.preset.bloom {threshold, radius, strength, veil}  — what applyBloom() will push.
//   Emissive materials need linear intensity > ~1.1 (day) / ~0.95 (dusk) / ~0.85 (night)
//   to register in bloom; the threshold is deliberately high and the radius wide.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ---------------------------------------------------------------------------
// shared live uniform storage (typed arrays => cloned by reference by three)
// ---------------------------------------------------------------------------
const fogParams = new Float32Array([0.0032, 0.055, 0.0, 0.00035]); // d0, k, y0, uniform
const fogLow = new Float32Array([0.55, 0.58, 0.62]);   // aerial colour at the horizon
const fogHigh = new Float32Array([0.18, 0.28, 0.42]);  // aerial colour looking up
const fogSun = new Float32Array([1.0, 0.6, 0.3, 0.0]); // rgb + gain of the sun-facing tint
const fogSunDir = new Float32Array([0.0, 1.0, 0.0]);
// AERIAL TERMINAL COLOUR — a 5x5 resample of the sky-view LUT, in the LUT's own
// parameterisation (u = azimuth from the sun, 0 = into it, 1 = anti-sun; v = the same
// sqrt-warped elevation the bake uses), already multiplied by the preset's skyGain so it
// is in the SAME radiance units as the dome. Filled by apply() -> writeSkyGrid().
// Why a grid of floats and not the LUT texture itself: UniformsUtils.clone() explicitly
// NULLS render-target textures (three r180 UniformsUtils.js, `isRenderTargetTexture`
// branch), and every built-in material gets its uniforms through that clone, so a
// sampler2D on the sky LUT cannot be plumbed the way the Float32Arrays here are. 25
// samples resolve the whole dome to within a few percent everywhere except the 2-3 deg
// right at the sun's own horizon row, where the grid reads slightly hot — bounded by the
// sky either side of it, which is the entire point of the change.
const AER_NU = 5, AER_NV = 5;
// Row 0 is NOT sampled at elevation 0. The LUT's exact horizon row is the grazing limit —
// a ray that never leaves the densest air — and at dusk it is 2x the radiance of the sky
// half a degree above it (probe: sun column 1.166,0.425,0.325 at 0 deg, 0.570,0.449,0.346
// at 3 deg, ~100 LUT rows inside that first degree). Nothing in frame is ever that ray:
// the sky the eye compares the ground against is the band 0-1.3 deg up, and the fog's own
// path is kilometres, not the thousand km the grazing row integrates. Sampling row 0 a
// third of a degree up is what makes the two sides of the horizon line agree.
const AER_EL0 = 0.4 * Math.PI / 180;
const fogSkyGrid = new Float32Array(AER_NU * AER_NV * 3);
// [skyMix, skyGain, haloWeight, unused] — skyMix 1 = terminal colour is purely the sky,
// 0 = the old hand-authored aerialLow/aerialHigh/sunTint path. Per-preset (aerialSky).
const fogAerial = new Float32Array([1.0, 1.0, 1.0, 0.0]);
// the dome's Mie halo, mirrored so the aerial terminal can carry it. The halo IS the
// aerosol forward lobe, and a horizontal path through the boundary layer scatters it into
// the eye exactly as the dome does; leaving it out would put distant geometry near the sun
// BELOW its own sky, which is the same seam as overshooting, with the sign flipped.
const fogHalo = new Float32Array([1.0, 0.6, 0.32, 3.0]);
const fogHalo2 = new Float32Array([20.0, 4.5, 0.8, 1.0]);
// read live by post.js's output pass: [dither LSBs, highlight desat, contrast, saturation]
export const toneLift = new Float32Array([0.0, 0.0, 0.0]);
export const toneGrade = new Float32Array([1.0, 0.15, 0.0, 1.0]);

const SKY_UNIFORMS = {
  uFogParams: { value: fogParams },
  uFogLow: { value: fogLow },
  uFogHigh: { value: fogHigh },
  uFogSun: { value: fogSun },
  uFogSunDir: { value: fogSunDir },
  uFogSkyGrid: { value: fogSkyGrid },
  uFogAerial: { value: fogAerial },
  uFogHalo: { value: fogHalo },
  uFogHalo2: { value: fogHalo2 },
};

// ---------------------------------------------------------------------------
// 1. fog: height-integrated exponential + aerial perspective
// ---------------------------------------------------------------------------
// vFogRay is worldPos - cameraPos, built from mvPosition so it survives skinning,
// morphing, instancing and batching without touching those chunks.
THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRay;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogRay = mvPosition.xyz * mat3( viewMatrix );
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  uniform vec4 uFogParams;
  uniform vec3 uFogLow;
  uniform vec3 uFogHigh;
  uniform vec4 uFogSun;
  uniform vec3 uFogSunDir;
  uniform vec3 uFogSkyGrid[25];
  uniform vec4 uFogAerial;
  uniform vec4 uFogHalo;
  uniform vec4 uFogHalo2;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  {
    float fogDist = length( vFogRay );
    vec3 fogDir = vFogRay / max( fogDist, 1e-4 );

    // optical depth through a density field d(y) = d0 * exp( -k * (y - y0) )
    float k = max( uFogParams.y, 1e-4 );
    float camRel = max( cameraPosition.y - uFogParams.z, -4.0 );
    float baseD = uFogParams.x * exp( -camRel * k );
    float dy = fogDir.y;
    float od;
    if ( abs( dy ) < 1e-3 ) {
      od = baseD * fogDist;
    } else {
      od = baseD * ( 1.0 - exp( -k * dy * fogDist ) ) / ( k * dy );
    }
    od += uFogParams.w * fogDist;          // thin unbounded haze so tall geometry still fades
    float fogFactor = clamp( 1.0 - exp( -od ), 0.0, 0.985 );

    // AERIAL COLOUR = THE SKY ITSELF IN THIS VIEW DIRECTION.
    // An opaque surface at infinite distance must converge to exactly the radiance of
    // the dome behind it. The old target was a hand-authored two-colour elevation ramp
    // plus an UNBOUNDED warm add ( uFogSun * pow(sd,5) ), and both were free to overshoot
    // the sky they were dissolving into: at dusk the terminal ground colour measured
    // saturation 0.720 against 0.341 for the sky one pixel above it, and B fell 93/255
    // across that boundary. Now the target is read out of the same sky-view LUT the dome
    // is drawn from — bilinear over a 5x5 (azimuth-from-sun, sqrt-warped elevation) grid,
    // in the LUT's own parameterisation — so the sun lobe arrives through the sky and can
    // never exceed it, and the horizon seam closes by construction.
    //
    // Below the horizon the elevation clamps to the horizon row rather than reading the
    // LUT's sub-horizon rows: airlight over a downward path is skylight, not ground.
    vec2 adh = fogDir.xz, ash = uFogSunDir.xz;
    float aldh = length( adh ), alsh = length( ash );
    float aca = ( aldh > 1e-5 && alsh > 1e-5 ) ? clamp( dot( adh, ash ) / ( aldh * alsh ), -1.0, 1.0 ) : 1.0;
    float fu = clamp( acos( aca ) * 0.3183098862, 0.0, 1.0 ) * 4.0;
    float ael = asin( clamp( fogDir.y, -1.0, 1.0 ) );
    float fv = clamp( sqrt( max( ael, 0.0 ) * 0.6366197724 ), 0.0, 1.0 ) * 4.0;
    // the 5s and the [25] above are AER_NU / AER_NV * AER_NU; change them together
    float iu = min( floor( fu ), 3.0 ), iv = min( floor( fv ), 3.0 );
    int ab = int( iv ) * 5 + int( iu );
    vec3 skyC = mix( mix( uFogSkyGrid[ ab ],     uFogSkyGrid[ ab + 1 ], fu - iu ),
                     mix( uFogSkyGrid[ ab + 5 ], uFogSkyGrid[ ab + 6 ], fu - iu ), fv - iv );

    // the same Mie lobe the dome adds on top of its own LUT tap, in the same units
    // ( the grid is pre-multiplied by skyGain, the halo is scaled by it here ).
    float acs = max( dot( fogDir, normalize( uFogSunDir ) ), 0.0 );
    vec3 aHalo = uFogHalo.rgb * ( pow( acs, uFogHalo2.x ) * uFogHalo.a
                                + pow( acs, uFogHalo2.y ) * uFogHalo2.z );
    float ahy = max( fogDir.y, 0.0 );   // clamped like the grid row, so the seam closes
    aHalo += uFogHalo.rgb * ( uFogHalo2.w * pow( acs, 3.0 ) * exp( -ahy * 11.0 ) );
    skyC += aHalo * smoothstep( -0.10, 0.02, ahy ) * exp( -ahy * 6.0 )
            * uFogAerial.y * uFogAerial.z;

    // legacy authored path, kept only so a preset can dial the sky target back
    // ( aerialSky < 1 ); at aerialSky = 1 none of it survives the mix.
    vec3 aerial = skyC;
    if ( uFogAerial.x < 0.999 ) {
      vec3 authored = mix( uFogLow, uFogHigh, smoothstep( -0.06, 0.5, fogDir.y ) );
      authored += uFogSun.rgb * ( pow( max( dot( fogDir, uFogSunDir ), 0.0 ), 5.0 ) * uFogSun.a );
      aerial = mix( authored, skyC, uFogAerial.x );
    }

    gl_FragColor.rgb = mix( gl_FragColor.rgb, aerial, fogFactor );
  }
#endif`;

// ---------------------------------------------------------------------------
// 2. plumb the extra fog uniforms into every built-in material
// ---------------------------------------------------------------------------
Object.assign(THREE.UniformsLib.fog, SKY_UNIFORMS);
for (const key of Object.keys(THREE.ShaderLib)) {
  Object.assign(THREE.ShaderLib[key].uniforms, SKY_UNIFORMS);
}

// ---------------------------------------------------------------------------
// 3. the atmosphere: single scattering + a cheap multiple-scattering term,
//    baked into a sky-view LUT (azimuth-from-sun, horizon-warped elevation)
// ---------------------------------------------------------------------------
const LUT_W = 384, LUT_H = 192;

const ATMOS_COMMON = /* glsl */`
precision highp float;
const float PI = 3.141592653589793;
const float Rg = 6360.0;        // planet radius, km
const float Rt = 6460.0;        // top of atmosphere, km
const float Hr = 8.0;           // Rayleigh scale height, km
const float Hm = 1.2;           // Mie scale height, km

uniform float uSunElev;         // radians; negative = below the horizon
uniform vec3  uSunIrr;          // top-of-atmosphere irradiance
uniform float uMieG;            // HG anisotropy
uniform float uTurbidity;       // Mie density multiplier
uniform float uRayScale;
uniform float uOzone;
uniform float uMs;              // isotropic multiple-scattering weight
uniform float uMsTint;          // spectral strength of the twilight illumination (see msSpectrum)
uniform float uMsBeam;          // twilight-arch weight; 0 disables it entirely (see ARCH_* below)
uniform float uCamH;            // observer altitude, km
uniform vec3  uGroundAlbedo;

vec3 betaR() { return vec3( 5.802, 13.558, 33.10 ) * 1e-3 * uRayScale; }
float betaMs() { return 3.996e-3 * uTurbidity; }
float betaMe() { return 4.440e-3 * uTurbidity; }
// Ozone, Chappuis band, re-projected onto the sRGB primaries (r10).
// It used to be vec3( 0.650, 1.881, 0.085 ), the Hillaire triple, which is banded for
// wavelength centres that are not our primaries and puts the absorption peak on GREEN. At
// dusk (sunElevation -0.9) the zenith ray's sun path is ~1000 km of slant through the 25 km
// tent, so that ordering stripped 2.9x more green than red and the whole dome went
// lavender-mauve — measured zenith linear G/R 1.40 against 2.27-2.71 in the references.
// The real Chappuis continuum peaks near 600 nm, i.e. on the RED primary (~610 nm), falls off
// through green (~550) and is nearly transparent in the blue (~460). Ordered that way the tent
// eats the orange out of the long twilight path and leaves the teal-cyan the references show.
// Magnitude is set so the total column absorption is close to the old triple's; the split is
// what changed. Values were then trimmed against the reference measurement, not derived: at
// ( 1.90, 1.35, 0.09 ) the zenith read G/R 2.23, just under band.
vec3 betaO() { return vec3( 2.350, 1.000, 0.100 ) * 1e-3 * uOzone; }

void densities( float h, out float dr, out float dm, out float doz ) {
  float hc = max( h, 0.0 );
  dr = exp( -hc / Hr );
  dm = exp( -hc / Hm );
  doz = max( 0.0, 1.0 - abs( hc - 25.0 ) / 15.0 );   // ozone tent, 10..40 km
}

vec3 extinction( float h ) {
  float dr, dm, doz; densities( h, dr, dm, doz );
  return betaR() * dr + vec3( betaMe() ) * dm + betaO() * doz;
}

// |P + tV| = R, with r = |P| and mu = dot(P/r, V). nearest -> smallest positive root.
float sphereDist( float r, float mu, float R, bool nearest ) {
  float b = r * mu;
  float c = r * r - R * R;
  float d = b * b - c;
  if ( d < 0.0 ) return -1.0;
  d = sqrt( d );
  float t0 = -b - d, t1 = -b + d;
  if ( nearest ) { if ( t0 > 0.0 ) return t0; if ( t1 > 0.0 ) return t1; return -1.0; }
  return t1;
}

// transmittance from a point to the sun, zero if the planet occludes it (earth shadow)
vec3 sunTransmittance( vec3 p, vec3 s ) {
  float r = length( p );
  float mu = dot( p / r, s );
  if ( sphereDist( r, mu, Rg, true ) > 0.0 ) return vec3( 0.0 );
  float tMax = sphereDist( r, mu, Rt, false );
  if ( tMax <= 0.0 ) return vec3( 1.0 );
  vec3 od = vec3( 0.0 );
  const int N = 8;
  for ( int i = 0; i < N; i++ ) {
    float t = ( float( i ) + 0.5 ) / float( N ) * tMax;
    od += extinction( length( p + s * t ) - Rg );
  }
  return exp( -od * ( tMax / float( N ) ) );
}

// ---------------------------------------------------------------------------
// WHAT ILLUMINATES THE MULTIPLE-SCATTER TERM (r13). THIS IS THE GREY-HORIZON FIX.
//
// The isotropic multiple-scattering term in scatter() below stands in for light that has
// bounced two or more times before it reaches the eye, and it used to be fed a source of
// exactly  ( sR + sM ) * msW  — no illumination spectrum at all. That is ACHROMATIC BY
// CONSTRUCTION wherever the path saturates: the analytic segment integral divides the
// source by ext, and low in the column ext = betaR*dr + betaMe*dm with betaMs ~ betaMe,
// so ( sR + sM ) / ext cancels betaR channel-for-channel and lands within a few percent of
// neutral in EVERY channel. Worse, what survives is then just uSunIrr * msW — a flat,
// wavelength-independent, azimuth-independent radiance FLOOR on every saturated path.
//
// With the dusk sun 0.9 deg UNDER the horizon, sunTransmittance() is exactly zero for every
// low-altitude sample (the planet occludes it), so that flat floor was the ONLY source the
// horizon row had. Measured: the dusk LUT at ( u = 0.50, elev = 0 ) baked 0.313, 0.322,
// 0.325 linear — B/R 1.04, i.e. grey — and the dome carried a neutral band across the middle
// of the frame that no dusk sky has. Midday's row (2.834, 3.219, 3.221) and night's
// (0.115, 0.125, 0.129) are the same floor at different weights: ONE defect, three presets.
//
// The light that actually illuminates a twilight atmosphere has GRAZED OVER THE TERMINATOR.
// So: raise the sample along its own zenith to the lowest radius whose sun ray misses the
// planet ( perigee r*sin(zenith) = Rg ) and take the transmittance THERE. That beam has run
// tens of scale heights of Rayleigh — which is what takes the blue out and leaves the sodium
// band — through the ozone tent, which bites the red back. Above that altitude the sample is
// already sunlit and the factor collapses to the ordinary direct transmittance, so the fix
// is a near no-op at high sun and self-limits with altitude: the zenith keeps its Rayleigh
// blue, only the long low paths warm up. It costs NOTHING: exactly one sunTransmittance()
// call per step either way, since the occlusion test is now explicit instead of hidden
// inside that function's early-out.
//
// occluded  <=>  a positive root of |P + tV| = Rg exists. With c = r^2 - Rg^2 > 0 the two
// roots share a sign and sum to -2*r*mu, so that is exactly ( mu < 0 && r*sin(z) <= Rg ).
// shadowDepth (r14) is how far the sample sits BELOW its own terminator, in km:
// Rg/sin(z) is the radius at which this sample's zenith line leaves the earth's shadow, so
// shadowDepth = Rg/sin(z) - r, and it is exactly 0 on the boundary and negative (clamped to
// 0) above it. At dusk (-0.9 deg) the whole shadow layer is only Rg*(1/cos(0.9deg)-1) = 785 m
// thick, which is what bounds ARCH_HSH below.
void sunLight( vec3 p, vec3 s, out vec3 tDirect, out vec3 tMs, out float shadowDepth ) {
  float r = length( p );
  vec3 up = p / r;
  float mu = dot( up, s );
  float sinz = sqrt( max( 1.0 - mu * mu, 1e-8 ) );
  if ( mu >= 0.0 || r * sinz > Rg ) {
    tDirect = sunTransmittance( p, s );
    tMs = tDirect;
    shadowDepth = 0.0;
    return;
  }
  tDirect = vec3( 0.0 );
  shadowDepth = Rg / sinz - r;
  // 1.00002 puts the perigee 130 m clear of the surface, so the ray misses (d < 0 in
  // sphereDist) while still being the near-tangent path that carries the twilight colour.
  tMs = sunTransmittance( up * ( Rg / sinz * 1.00002 ), s );
}

/**
 * The grazing beam's spectrum, LUMINANCE-NORMALISED and raised to uMsTint.
 *
 * msW's MAGNITUDE was tuned against the references over several rounds and is deliberately
 * NOT re-derived here — only its spectrum changes, so this cannot move any brightness
 * target on its own. uMsTint = 0 reproduces the old achromatic behaviour exactly; 1 is the
 * raw grazing spectrum, which is far too saturated to use (at dusk it measures B/R ~ 5e-5,
 * a tangent path through 35 air masses). The exponent is the one honest knob: it is
 * "how much of the terminator beam's own reddening survives into the diffuse term", which
 * a single-scattering model with an isotropic ms fudge has no way to derive. Authored per
 * preset because the beam's optical depth is a function of how far under the horizon the
 * sun is, and that is a preset parameter (dusk -0.9 deg, night -7.5 deg).
 */
vec3 msSpectrum( vec3 tMs ) {
  if ( uMsTint <= 0.0 ) return vec3( 1.0 );
  vec3 t = pow( max( tMs, vec3( 1e-6 ) ), vec3( uMsTint ) );
  return t / max( dot( t, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
}

// ---------------------------------------------------------------------------
// THE TWILIGHT ARCH (r14). WHERE THE SODIUM BAND'S RADIANCE COMES FROM.
//
// msSpectrum() above is LUMINANCE-NORMALISED, so the isotropic ms term carries the
// terminator beam's HUE and none of its RADIANCE, and it is weighted by ( sR + sM ) — the
// SAME density the cool Rayleigh single-scatter term uses. Warm and cool therefore fell off
// on one 8 km scale height and their ratio was altitude-invariant by construction; the only
// handle left was a flat gain on uMs, which brightens the zenith as hard as the horizon.
// Measured consequence: on any SATURATED path the analytic segment integral divides the
// source by ext, ( sR + sM ) / ext lands within 5% of neutral in every channel, and what
// survives is a flat radiance FLOOR of uSunIrr * msW * msSpectrum with no vertical structure
// at all. The dusk horizon row baked 0.383,0.314,0.154 and uSunIrr*msW*msSpectrum predicts
// 0.388,0.320,0.250 — the band WAS the floor.
//
// What the floor stands in for is not isotropic. A sample under the terminator is lit by the
// twilight ARCH: the band of still-sunlit air past the terminator, a few degrees tall, about
// the sun's azimuth, carrying the tangent-path spectrum. Scattering that into the eye has to
// go through the PHASE FUNCTIONS, which is what the floor threw away, and which is also what
// finally decouples the warm term from Rayleigh: the arch source is sR*pr + sM*pa, so it
// picks up the AEROSOL weight ( Hm = 1.2 km ) alongside betaR instead of being pure betaR.
//
// ARCH_G 0.70 — the arch is an EXTENDED source, so its effective lobe is broader than the
//   aerosol's own uMieG ( 0.80 at dusk ). Authored, not derived.
// ARCH_TINT 0.25 — the arch integrates over a RANGE of perigee altitudes, which flattens its
//   spectrum relative to a single tangent ray. Raw tMs measures B/R ~ 5e-5 at dusk (35 air
//   masses) and is unusable undiluted; at 0.25 the S region keeps linear B/R 0.18-0.26.
// ARCH_HSH 0.80 km — hand-over scale. The weight is ( 1 - exp( -shadowDepth / ARCH_HSH ) ),
//   i.e. ZERO exactly where the direct term switches on and saturating deep in shadow, so it
//   is continuous across the terminator in both directions. IT MUST NOT BE MUCH SHORTER THAN
//   THE 785 m SHADOW LAYER. A gated form with a 0.10 km shell hits every numeric target in
//   the brief and is a LIE: it is narrower than the 40-step march can resolve, so the bake
//   does not converge and it lays a hard step across the middle of the dome. At 0.80 km the
//   bake is converged; verified NS 40 vs 200.
//   (Wave O CORRECTED the two numbers this bullet used to quote — the "65 -> 69 -> 73" walk
//   and the "136-level hard step" are NOT reproducible. The argument that stands is the
//   unresolvability one: a 100 m gate inside a 785 m layer marched at a ~0.55 km minimum step
//   is unresolved by construction. Do not reinstate 0.10 on the strength of a scoreboard.)
//
// ARCH_EV 4.0 deg (r15) — THE BAND'S ANGULAR HEIGHT. WITHOUT THIS THE ARCH IS NOT LOCALISED
//   IN ELEVATION AND THE WHOLE DOME WARMS UP, WHICH IS WHAT r14 SHIPPED.
//   The comment above says the arch is "a few degrees tall", but nothing in the code said so.
//   pa is evaluated on dot( V, S ) and the dusk sun is 0.9 deg UNDER the horizon, so that dot
//   is dominated by AZIMUTH: a ray 20.8 deg up and 20.4 deg off the sun's azimuth sits at
//   cos 0.871, while the sodium band itself at 0.9 deg up and 34.6 deg off sits at cos 0.823 —
//   the ELEVATED ray scored a HIGHER phase value than the band did. Measured on the shipped
//   build, the arch multiplied the 20.8 deg row by 1.21x and the 89 deg zenith by 1.07x: a
//   flat warm floor, not a band. Consequence at x = 0.55-0.65 of dusk-highway-chase: top row
//   R 61.3 -> 72.9 against reference 56.5, saturation 0.406 -> 0.301 against 0.434.
//
//   AND IT CANNOT BE FIXED IN pa. The arch source is ( sR * pr + sM * pa ), and pr is the
//   MOLECULAR phase function, 3/(16 PI)( 1 + cos^2 ) — its total dynamic range over the whole
//   sphere is 2:1. A source localised to a few degrees is not representable in it at any
//   value of ARCH_G, so attenuating pa alone leaves the Rayleigh half of the arch behind:
//   measured, killing pa outright still only walked that row 72.4 -> 65 of a needed 61. This
//   is the project's dominant bug class (a quantity outside the range of its own consumer),
//   seen from the other side.
//   So the band's vertical profile goes on the SOURCE AMPLITUDE, where it applies to both
//   species: exp( -max( elev, 0 ) / ARCH_EV ). Azimuth stays in pa, which is what dot( V, S )
//   was already measuring.
//   LOWER BOUND, derived: the shadow layer is 785 m thick and a horizon ray stays inside it
//   for ~20 km (segment probe: sdep > 0 out to t = 19.7 km at 0.92 deg elevation), so the
//   sunlit band cannot subtend less than atan( 0.785 / 20 ) = 2.2 deg. 4.0 deg is authored
//   above that bound, and NOTHING HINGES ON THE EXACT VALUE: every ARCH_EV in 3.0-8.0 deg
//   passes all four row targets once uMsBeam is renormalised (see the sweep in
//   verdicts/wave-p/sky-lighting.md). The factor removes flux, so dusk's msBeam goes
//   2.5 -> 3.2 to hold the sodium row exactly where it already passed.
//   Bake convergence IMPROVES: NS 40 vs 200 max drift 2.20 -> 1.00 code levels.
const float ARCH_G    = 0.70;
const float ARCH_TINT = 0.25;
const float ARCH_HSH  = 0.80;
const float ARCH_EV   = 0.06981317;   // 4.0 deg in radians

// full in-scattering along V from an observer at altitude uCamH
vec3 scatter( vec3 V, vec3 S ) {
  float r = Rg + uCamH;
  vec3 P0 = vec3( 0.0, r, 0.0 );
  float mu = V.y;
  float tGround = sphereDist( r, mu, Rg, true );
  float tTop = sphereDist( r, mu, Rt, false );
  float tMax = tGround > 0.0 ? tGround : tTop;
  if ( tMax <= 0.0 ) return vec3( 0.0 );

  float cosT = dot( V, S );
  float pr = 3.0 / ( 16.0 * PI ) * ( 1.0 + cosT * cosT );
  float g = uMieG;
  float pm = ( 1.0 - g * g ) /
             ( 4.0 * PI * pow( max( 1.0 + g * g - 2.0 * g * cosT, 1e-4 ), 1.5 ) );
  // the twilight arch's own, broader lobe — see ARCH_G above
  float pa = ( 1.0 - ARCH_G * ARCH_G ) /
             ( 4.0 * PI * pow( max( 1.0 + ARCH_G * ARCH_G - 2.0 * ARCH_G * cosT, 1e-4 ), 1.5 ) );

  // the multiple-scattering fudge fades out as the sun sinks, otherwise a night sky glows.
  // The old 0.015 lower clamp is gone: measured, it was INACTIVE for all four presets
  // ( dusk 0.315, night 0.131, dawn 0.429, midday 1.0 ) and only bit below about -12 deg,
  // and the msSpectrum() factor now does that job physically — the terminator beam a deep
  // twilight sample sees has grazed the ground, so its transmittance dies on its own.
  float msW = uMs * clamp( sin( uSunElev ) * 1.6 + 0.34, 0.0, 1.0 );

  // The twilight arch is a BAND a few degrees tall sitting on the horizon, and pa above can
  // only carry its AZIMUTHAL reach (dot( V, S ) with the sun 0.9 deg under the horizon is an
  // azimuth measurement). Its VERTICAL profile therefore multiplies the source amplitude,
  // where it reaches the Rayleigh channel too — pr spans 2:1 over the whole sphere and cannot
  // represent a 4 deg source at any ARCH_G. See ARCH_EV above. View-direction constant, so it
  // is hoisted out of the march.
  float archEl = exp( -max( asin( clamp( mu, -1.0, 1.0 ) ), 0.0 ) / ARCH_EV );

  vec3 L = vec3( 0.0 ), T = vec3( 1.0 );
  const int NS = 40;
  for ( int i = 0; i < NS; i++ ) {
    // quadratic step distribution: dense near the observer where the air is dense
    float x0 = float( i ) / float( NS );
    float x1 = float( i + 1 ) / float( NS );
    float t0 = tMax * x0 * x0, t1 = tMax * x1 * x1;
    float ds = t1 - t0;
    if ( ds <= 0.0 ) continue;
    vec3 p = P0 + V * ( 0.5 * ( t0 + t1 ) );
    float h = length( p ) - Rg;
    float dr, dm, doz; densities( h, dr, dm, doz );
    vec3 sR = betaR() * dr;
    vec3 sM = vec3( betaMs() ) * dm;
    vec3 ext = max( sR + vec3( betaMe() ) * dm + betaO() * doz, vec3( 1e-9 ) );
    vec3 tDir, tMs; float sdep; sunLight( p, S, tDir, tMs, sdep );
    // the arch's illumination: the tangent beam's REAL spectrum, tempered but NOT normalised,
    // handed over from the direct term across the shadow boundary
    vec3 arch = uMsBeam * ( 1.0 - exp( -sdep / ARCH_HSH ) ) * archEl
              * pow( max( tMs, vec3( 1e-6 ) ), vec3( ARCH_TINT ) );
    vec3 src = uSunIrr * ( ( sR * pr + sM * pm ) * tDir
                           + ( sR * pr + sM * pa ) * arch
                           + ( sR + sM ) * msW * msSpectrum( tMs ) );
    vec3 segT = exp( -ext * ds );
    L += T * ( src - src * segT ) / ext;    // analytic integral over the segment
    T *= segT;
  }

  if ( tGround > 0.0 ) {
    vec3 gp = P0 + V * tGround;
    vec3 n = gp / length( gp );
    float ndl = max( dot( n, S ), 0.0 );
    // the ground bounce keeps the isotropic term only: the arch is a directional source and
    // a lambertian ground has no phase function to put it through.
    vec3 gDir, gMs; float gdep; sunLight( gp, S, gDir, gMs, gdep );
    L += T * uGroundAlbedo * uSunIrr *
         ( gDir * ndl / PI + msW * 0.35 * msSpectrum( gMs ) );
  }
  return L;
}`;

const ATMOS_FRAG = ATMOS_COMMON + /* glsl */`
varying vec2 vUv;
void main() {
  float a = vUv.x * PI;                       // 0 = toward the sun, PI = away
  float vv = vUv.y * 2.0 - 1.0;
  float l = sign( vv ) * vv * vv * ( PI * 0.5 );  // sqrt-warped elevation
  vec3 V = vec3( cos( l ) * cos( a ), sin( l ), cos( l ) * sin( a ) );
  vec3 S = vec3( cos( uSunElev ), sin( uSunElev ), 0.0 );
  gl_FragColor = vec4( max( scatter( V, S ), vec3( 0.0 ) ), 1.0 );
}`;

const ATMOS_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

// ---------------------------------------------------------------------------
// sky dome shader — one LUT tap, plus stars and an optional sun/moon disc
// ---------------------------------------------------------------------------
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
const float PI = 3.141592653589793;

uniform sampler2D uSkyLut;
uniform vec3 uSunDir;        // atmosphere sun (may be under the horizon)
uniform vec3 uDiscDir;       // sun or moon, whichever is the visible body
uniform vec3 uDiscColor;
uniform vec3 uZenithTau;     // vertical optical depth, for the disc's own extinction
uniform vec3 uGround;
uniform float uDiscSize, uDiscIntensity, uStars, uExp;
uniform float uTime;
uniform vec4 uCloudA;        // altostratus: x coverage cut, y softness, z scale (1/km), w drift
uniform vec4 uCloudB;        // cirrus:      x coverage cut, y softness, z scale (1/km), w drift
uniform vec4 uCloudC;        // low deck:    x coverage cut, y softness, z scale (1/km), w drift
uniform vec4 uCloudD;        // low deck:    x altitude (m), y stretch, z shear, w opacity
uniform vec4 uCloudSh;       // x HG g, y optical-depth gain, z aerial strength, w aerial height
uniform vec4 uCloudMix;      // x alto opacity, y cirrus opacity, z sun gain, w skylight gain
uniform vec4 uWind;          // xy unit wind dir in world XZ, z alto altitude (m), w cirrus (m)
uniform vec4 uCloudGeo;      // x alto stretch, y cirrus stretch, z alto shear, w cirrus shear
uniform vec4 uHalo;          // rgb Mie halo colour, a = tight-lobe gain
uniform vec4 uHalo2;         // x tight exponent, y wide exponent, z wide gain, w horizon lift

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// --- cheap 2D value noise + fbm (fixed octave counts, no dynamic loops) -----
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float e = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

// Band-limited fbm. lod is how many octaves the pixel footprint can still resolve;
// octave i fades out over the last octave before it goes sub-pixel, and the sum is
// renormalised by the amplitude actually used so the mean stays 0.5 as detail drops.
// Without this the perspective compression near the horizon turns into moire.
float fbmLod6(vec2 p, float lod) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    float w = clamp(lod - float(i), 0.0, 1.0);
    s += a * w * vnoise(p); n += a * w;
    a *= 0.5; p = ROT * p * 2.03;
  }
  return n > 1e-4 ? s / n : 0.5;
}

float fbmLod3(vec2 p, float lod) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 3; i++) {
    float w = clamp(lod - float(i), 0.0, 1.0);
    s += a * w * vnoise(p); n += a * w;
    a *= 0.5; p = ROT * p * 2.03;
  }
  return n > 1e-4 ? s / n : 0.5;
}

// radians subtended by one pixel; only used to size the noise LOD, so it is
// deliberately a little pessimistic (over-blurring beats shimmering).
const float PIX_ANG = 0.00055;

/** world-XZ metres -> the deck's wind-aligned, stretch:1 anisotropic domain (linear). */
vec2 windMap(vec2 v, vec2 w, float scale, float stretch) {
  return vec2(dot(v, w) / stretch, dot(v, vec2(-w.y, w.x))) * (0.001 * scale);
}

/**
 * Intersect the view ray with the horizontal slab at altitude H.
 * Returns xy = sample point in the wind domain, z = resolvable octaves,
 * w = 0..1 presence (goes to zero where the deck is finer than a pixel).
 */
vec4 deckSample(vec3 d, vec2 w, float H, float scale, float stretch) {
  float dy = max(d.y, 1e-4);
  float t = max(H - cameraPosition.y, 1.0) / dy;          // metres to the slab
  vec2 q = windMap(cameraPosition.xz + d.xz * t, w, scale, stretch);
  // footprint of one pixel on the slab: hugely elongated along the view near the
  // horizon (t/dy), only t across it. Both go through the same anisotropic map.
  vec2 e = normalize(d.xz + vec2(1e-6, 0.0));
  float foot = max(length(windMap(e * (PIX_ANG * t / dy), w, scale, stretch)),
                   length(windMap(vec2(-e.y, e.x) * (PIX_ANG * t), w, scale, stretch)));
  float lod = -log2(max(foot, 1e-6));
  return vec4(q, lod, smoothstep(0.10, 1.50, lod));
}

/** LUT tap by (azimuth-from-sun in [0,1], elevation in radians) — same warp as the bake. */
vec3 lutAt(float u, float elev) {
  float vv = 0.5 + 0.5 * sign(elev) * sqrt(abs(elev) / (PI * 0.5));
  return texture2D(uSkyLut, vec2(clamp(u, 0.0015, 0.9985), clamp(vv, 0.0015, 0.9985))).rgb;
}

/**
 * Henyey-Greenstein phase, normalised to 4*PI*p so an isotropic layer reads 1.0.
 * This is what splits a cloud field into warm and cool: a droplet scatters an
 * order of magnitude more light into the forward direction than sideways, so the
 * deck between the eye and the sun is a different *value*, not just a warmer tint.
 */
float hgPhase(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}

/**
 * Aerial perspective on a cloud deck. A band low in the frame is intersected tens
 * of km out, so it loses chroma and lifts toward the sky it hangs in front of.
 * Without this the only distance cue is the sun bloom and every streak in the
 * field reads at the same value regardless of how far away it actually is.
 */
vec3 cloudAerial(vec3 c, vec3 skyC, float h, float strength, float hEnd) {
  float ap = strength * (1.0 - smoothstep(0.0, max(hEnd, 1e-3), h));
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(mix(c, vec3(lum), 0.32 * ap), skyC, 0.68 * ap);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  // --- sky-view LUT lookup -------------------------------------------------
  // u: angle between the view and sun *azimuths* (the atmosphere is rotationally
  //    symmetric about the zenith, so [0,PI] covers the whole sphere with no seam).
  // v: sqrt-warped elevation, matching the bake.
  vec2 dh = d.xz, sh = uSunDir.xz;
  float ldh = length(dh), lsh = length(sh);
  float ca = (ldh > 1e-5 && lsh > 1e-5) ? clamp(dot(dh, sh) / (ldh * lsh), -1.0, 1.0) : 1.0;
  float l = asin(clamp(h, -1.0, 1.0));
  float u = acos(ca) / PI;
  float v = 0.5 + 0.5 * sign(l) * sqrt(abs(l) / (PI * 0.5));
  vec3 col = texture2D(uSkyLut, vec2(clamp(u, 0.0015, 0.9985), clamp(v, 0.0015, 0.9985))).rgb;

  vec3 sunN = normalize(uSunDir);
  float cs = max(dot(d, sunN), 0.0);          // forward-scatter cosine, radial about the sun

  // --- two cloud decks, each a real slab at a fixed altitude ----------------
  // t = (H - camY) / d.y puts the sample in world metres on the layer, so the deck
  // has a ceiling: perspective compresses it into thin ribbons that stack and
  // converge at the horizon on their own. The domain is wind-aligned and squashed
  // ~4:1 along that one vector (plus a slow shear octave), so cloud SHAPE carries no
  // sun-relative term at all. The sun only lights it, via two LUT taps that re-derive
  // themselves at any time of day:
  //   warmL = the sky right next to the sun  -> what an underside actually receives,
  //   coolL = the sky overhead away from it  -> the skylight fill on the tops.
  //
  // OPTICAL DEPTH IS WHAT MAKES A DECK A VOLUME. Coverage alpha alone gives every
  // streak the same value, which is the "2D noise painted on the dome" failure. So
  // each deck also carries a THICKNESS — how far the fbm overshoots its coverage cut,
  // plus a second tap displaced along the sun azimuth, which is density accumulated
  // along the sun ray. That becomes tau, and Tr = exp(-tau) splits the field in two:
  //   Tr -> 1 (thin): direct sunlight gets through, multiplied by the HG forward
  //     lobe, so a wisp between the eye and the sun blows out warm and clips,
  //   Tr -> 0 (thick): the direct term is extinguished and only the cool zenith
  //     skylight term survives, so the core self-occludes to blue-grey.
  // The warm/cool value split then falls out of the physics at any time of day.
  if ((uCloudMix.x + uCloudMix.y + uCloudD.w) > 0.0 && h > 0.004) {
    vec2 wnd = uWind.xy;
    vec2 sxz = (lsh > 1e-5) ? sh / lsh : vec2(1.0, 0.0);
    // *** DIRECTIONAL SKYLIGHT (r8). ***
    // These two taps used to be CONSTANTS — lutAt(0.02, 0.030) and lutAt(0.72, 1.10) —
    // so a deck at the zenith was shaded with the identical sodium/cool pair as one
    // sitting on the horizon. With alto at 0.92 opacity the dome was then a near-opaque
    // warm-lit sheet from the horizon to straight up, and the measured zenith strip came
    // out rgb 198/172/176 (sat 0.13, B/R 0.89, mean L 180): pale PINK, brighter than the
    // horizon, hue-inverted against every dusk reference (B/R 1.7-2.1, mean L 86-118).
    // That one fact produced the whole-frame warm cast and starved the road of skylight.
    //
    // coolL is the SKYLIGHT FILL on a deck's self-occluded side, so it has to be the sky
    // radiance where that deck actually is. It now taps the LUT at THIS PIXEL's own
    // (azimuth-from-sun, elevation) — the same (u, l) already feeding col — biased a
    // little toward the zenith and a little away from the sun, because a cloud's shaded
    // face integrates the whole hemisphere above it rather than the one direction we
    // happen to be looking through it. Overhead that is the deep teal the ozone tent
    // makes; near the horizon it is the dim blue-grey haze. It re-derives per pixel, so
    // no time of day needs a hand-authored cloud colour.
    vec3 coolL = lutAt(mix(u, 0.72, 0.30), mix(l, 1.10, 0.22)) * uCloudMix.w;
    // warmL is the DIRECT sodium band next to the sun, and it was measured to be the
    // ACTUAL source of the pink dome — not the atmosphere bake, which is correct. Probed
    // with sky.sampleLut(), the dusk LUT at 21 deg elevation reads [0.185, 0.285, 0.474]:
    // a proper teal, B/R 2.6. What buried it: this term taps lutAt(0.02, 0.030) — the
    // single hottest texel in the whole LUT, the sky 1.7 deg above the horizon right next
    // to the sun, [3.264, 1.498, 0.792] — and then multiplies it by the HG forward lobe,
    // which at g = 0.70 is still CLAMPED AT ITS 7.0 CEILING 20 degrees off the sun. The
    // deck 20 deg up therefore carried warm ~[3.6, 1.7, 0.9] against a sky of [0.19,
    // 0.29, 0.47] — twenty times the radiance of the sky it hung in, in red.
    //
    // So the gate is angular in TWO variables, not one:
    //   * cs, the angle from the sun, so the sun's colour cannot reach 90 deg away, and
    //   * h, the view elevation, because the band that does this lighting is a few degrees
    //     thick AT THE HORIZON. A deck we see 25 deg up is intersected 6-7 km out, where
    //     that band has already set below its own local horizon and cannot illuminate it.
    // Full strength along the horizon (where sodium-lit undersides are the whole point of
    // a dusk sky), down to a tenth by 21 deg, gone by 25.
    float sunReach = smoothstep(0.30, 0.86, cs) * (1.0 - smoothstep(0.05, 0.42, h));
    // r9 (wave R): the tap is no longer the FIXED texel (0.02, 0.030). coolL above was moved
    // onto the pixel's own (u, l) in r8 and warmL was left behind, so every cloud pixel out
    // to 25 deg was still lit by the single hottest texel in the LUT — and that texel is also
    // where the r8 arch lands hardest (archEl = exp(-elev / 4 deg) = 0.651 at 1.72 deg), so
    // warmL was a SECOND arch amplifier nobody had noticed. Measured with sky.sampleLut on
    // the shipping dusk LUT: the old fixed tap is [1.3262, 0.7627, 0.2465], B/R 0.186 — a
    // near-monochrome red, and the consumer multiplies it by (0.22 + 0.60 * phase) with
    // phase clamped at 7.0, i.e. up to 4.42x, against a local sky of ~[0.14, 0.21, 0.21].
    // That is a range violation of ~26x in red, and it is what turns the deck's wisps
    // grey-brown over a teal sky instead of leaving them lit-but-chromatic.
    //
    // It now takes the SAME mix() form as coolL, with the complementary weights: coolL goes
    // 30% / 22% toward the far cool corner (u 0.72, l 1.10 rad), warmL goes 70% / 78% toward
    // the near-sun horizon corner (u 0.02, l 0.030 rad). So both ends of the cloud's warm/cool
    // split are anchored on the pixel's own direction and re-derive at any time of day, and
    // neither is a hand-picked texel. At the measurement column (u 0.1132) and the valley row
    // (l 0.25 rad) the tap becomes (u 0.048, 4.49 deg) = [0.5249, 0.4663, 0.2416], B/R 0.460:
    // 2.53x less red, blue held to within 2%, and the arch's own leverage on it halves
    // (archEl 0.651 -> 0.325). uCloudMix.z (clouds.sunGain) is unchanged — see :1111
    // (NOT :1042; that address was copied forward from wave Q and points at comment prose in
    // this tree. Corrected wave R, re-greped after the final save.)
    //
    // *** WAVE R: THIS LINE WAS WRITTEN BY A KILLED ROUND-13 AGENT AND WAS NEVER MEASURED.
    // It is now measured, in a paired A/B with the pre-edit lutAt(0.02, 0.030) reconstructed
    // byte-exactly (leg A reproduced every wave-Q shipped figure to the digit, which is what
    // proves this line was round 13's ONLY code change in this file). Peer md5s held across
    // both legs. 1920x1080, x 0.55-0.65, _px.mjs 6b0e73db, satPx:
    //   valley y0.16-0.20  satPx 0.137 -> 0.225   (clear-sky ceiling 0.263, target band 0.19-0.27)
    //   mid    y0.24-0.28  satPx 0.137 -> 0.168   (hold: must not fall below 0.133)  HELD
    //   s      y0.46-0.48  rgb 210.3,185.1,105.6 -> 210.3,185.1,105.6   HELD to 0.0/255
    // So it closes 68% of the cloud veil's chroma penalty, not the ~50% that was asked for.
    // THE COST, and it is real: it takes R OUT of the same rows. v2 y0.18-0.22 99.4 -> 88.9
    // (-10.5/255), mid 100.5 -> 95.2, valley 101.8 -> 88.7. Those rows were already ~1.6x too
    // DARK against the elevation-registered reference, so this trades luma deficit for chroma.
    // Kept because the blind-crop failure this piece is judged on is "the wisps read as a dirty
    // grey-brown over a teal sky", which is chroma, and because the luma deficit is a GRADIENT
    // SHAPE problem no flat gain can fix — see the skyGain refusal in
    // verdicts/wave-r/sky-lighting.md. ***
    vec3 warmL = lutAt(mix(u, 0.02, 0.70), mix(l, 0.030, 0.78)) * (uCloudMix.z * sunReach);
    // Clamped because the HG peak is unbounded as g -> 1 and one pixel carrying 40x
    // the horizon radiance is a fireball in the bloom pyramid, not a silver lining.
    float phase = min(hgPhase(cs, uCloudSh.x), 7.0);
    float tauK = uCloudSh.y, apS = uCloudSh.z, apH = uCloudSh.w;

    // ---- cirrus: highest, thinnest, farthest -> composites first -----------
    vec4 B = deckSample(d, wnd, uWind.w, uCloudB.z, uCloudGeo.y);
    vec2 qB = B.xy + vec2(uTime * uCloudB.w, 0.0);
    // second, slower octave displacing the bands along the wind = shear
    qB.x += (vnoise(qB * 0.21 + vec2(7.7, uTime * uCloudB.w * 0.35)) - 0.5) * uCloudGeo.w;
    float nB = fbmLod6(qB + vec2(11.3, 4.7), B.z);
    float aB = smoothstep(uCloudB.x, uCloudB.x + uCloudB.y, nB) * uCloudMix.y * B.w;
    float dB = clamp((nB - uCloudB.x) / max(1.0 - uCloudB.x, 1e-3), 0.0, 1.0);
    float TrB = exp(-tauK * 0.50 * dB);
    // The cool coefficient is now a fraction of the LOCAL sky (see coolL above), so it
    // reads as a transmission: a thin veil passes most of the sky behind it and also
    // takes the direct warm term, a fully opaque core loses the direct term and lands
    // well UNDER the sky it covers. That is still the warm/thin vs cool/thick split the
    // old constants gave, but referenced to the right sky instead of to one fixed tap.
    vec3 colB = warmL * (0.22 + 0.60 * phase) * TrB
              + coolL * (0.60 + 0.32 * TrB);
    colB = cloudAerial(colB, col, h, apS, apH);
    col = mix(col, colB, clamp(aB, 0.0, 1.0));

    // ---- altostratus: mid deck --------------------------------------------
    vec4 A = deckSample(d, wnd, uWind.z, uCloudA.z, uCloudGeo.x);
    vec2 qA = A.xy + vec2(uTime * uCloudA.w, 0.0);
    qA.x += (vnoise(qA * 0.26 + vec2(2.3, uTime * uCloudA.w * 0.5)) - 0.5) * uCloudGeo.z;
    float nA = fbmLod6(qA, A.z);
    float aA = smoothstep(uCloudA.x, uCloudA.x + uCloudA.y, nA);
    float dA = clamp((nA - uCloudA.x) / max(1.0 - uCloudA.x, 1e-3), 0.0, 1.0);
    // one low-octave tap displaced along the sun's azimuth *on the deck*: density
    // between this point and the sun. ~900 m of throw, a shadow, not a domain warp.
    vec2 off = windMap(sxz * 900.0, wnd, uCloudA.z, uCloudGeo.x);
    float ns = smoothstep(uCloudA.x, uCloudA.x + uCloudA.y, fbmLod3(qA + off, A.z));
    float TrA = exp(-tauK * (0.85 * dA + 0.60 * ns));
    vec3 colA = warmL * (0.15 + 0.66 * phase) * TrA
              + coolL * (0.50 + 0.32 * TrA);
    colA = cloudAerial(colA, col, h, apS, apH);
    aA *= uCloudMix.x * A.w;
    col = mix(col, colA, clamp(aA, 0.0, 1.0));

    // ---- low deck: nearest, thickest, drifts slowest ------------------------
    // A single slab, however good, is still one sheet: it has no parallax against
    // itself. A second deck two thirds lower and scrolling at roughly half the rate
    // crosses the alto bands at a visibly different speed and converges to the
    // horizon on a different curve, which is what gives the field depth. It is also
    // the densest layer, so it carries most of the cool self-occluded value.
    vec4 C = deckSample(d, wnd, uCloudD.x, uCloudC.z, uCloudD.y);
    vec2 qC = C.xy + vec2(uTime * uCloudC.w, 0.0);
    qC.x += (vnoise(qC * 0.30 + vec2(19.1, uTime * uCloudC.w * 0.5)) - 0.5) * uCloudD.z;
    float nC = fbmLod6(qC + vec2(3.1, 21.7), C.z);
    float aC = smoothstep(uCloudC.x, uCloudC.x + uCloudC.y, nC);
    float dC = clamp((nC - uCloudC.x) / max(1.0 - uCloudC.x, 1e-3), 0.0, 1.0);
    vec2 offC = windMap(sxz * 700.0, wnd, uCloudC.z, uCloudD.y);
    float nsC = smoothstep(uCloudC.x, uCloudC.x + uCloudC.y, fbmLod3(qC + offC, C.z));
    float TrC = exp(-tauK * (1.15 * dC + 0.70 * nsC));
    vec3 colC = warmL * (0.11 + 0.58 * phase) * TrC
              + coolL * (0.44 + 0.32 * TrC);
    colC = cloudAerial(colC, col, h, apS, apH);
    aC *= uCloudD.w * C.w;
    col = mix(col, colC, clamp(aC, 0.0, 1.0));
  }

  // --- Mie forward lobe ------------------------------------------------------
  // A radially symmetric halo about the sun direction, not a horizontal streak:
  // a tight core lobe for the near-sun glare, a wide one for the aureole, plus a
  // thin exp() band that lifts the horizon either side of it. It is deliberately
  // HDR (>1) so the bloom pyramid keys off this and not off a clipped disc.
  vec3 halo = uHalo.rgb * (pow(cs, uHalo2.x) * uHalo.a + pow(cs, uHalo2.y) * uHalo2.z);
  halo += uHalo.rgb * (uHalo2.w * pow(cs, 3.0) * exp(-abs(h) * 11.0));
  // A boundary-layer term as well as the lower gate. The aureole is AEROSOL scatter,
  // and aerosol lives in the lowest ~1-2 km of the column, not in the whole dome: the
  // exponents alone still leave a tail that lands orange on the teal zenith, and the
  // old smoothstep(-0.10, 0.02, h) was a lower gate with no upper one, so nothing
  // stopped it. exp(-h*6) is 1 at the horizon, 0.53 at 6 deg, 0.12 at 20 deg — the
  // measured elevation where the pink was sitting at 4x the radiance of the sky
  // underneath it. Below the horizon it is left at 1 and the smoothstep does the work.
  col += halo * smoothstep(-0.10, 0.02, h) * exp(-max(h, 0.0) * 6.0);

  // --- the visible body ----------------------------------------------------
  // Kasten-Young air mass gives the disc the same reddening the sky already has,
  // and step(0, dir.y) means a sun below the horizon simply has no disc at all.
  if (uDiscIntensity > 0.0 && uDiscDir.y > -0.02) {
    vec3 dd = normalize(uDiscDir);
    float zdeg = degrees(acos(clamp(dd.y, -1.0, 1.0)));
    float am = 1.0 / (max(dd.y, 0.0) + 0.50572 * pow(max(96.07995 - zdeg, 0.0), -1.6364));
    vec3 tr = exp(-uZenithTau * am);
    float ang = acos(clamp(dot(d, dd), -1.0, 1.0));
    // soft limb darkening rather than a stamped circle
    float disc = 1.0 - smoothstep(uDiscSize * 0.82, uDiscSize * 1.12, ang);
    disc *= mix(0.72, 1.0, sqrt(max(1.0 - pow(min(ang / max(uDiscSize, 1e-4), 1.0), 2.0), 0.0)));
    col += uDiscColor * tr * disc * uDiscIntensity * smoothstep(-0.02, 0.02, dd.y);
  }

  // --- stars, only well above the horizon ----------------------------------
  if (uStars > 0.0) {
    vec3 q = floor(d * 460.0);
    float s = hash13(q);
    float star = smoothstep(0.9977, 1.0, s) * (0.30 + 0.70 * hash13(q + 7.1));
    col += vec3(0.82, 0.88, 1.0) * star * uStars * smoothstep(0.02, 0.30, h);
  }

  // --- below the horizon fades into the ground haze ------------------------
  col = mix(col, uGround, smoothstep(0.0, -0.09, h));

  col *= uExp;

  // pre-tonemap dither so the LUT's bilinear ramp never quantises in the HDR buffer
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  col += (n - 0.5) * 0.0035 * max(col, vec3(0.02));

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

// ---------------------------------------------------------------------------
// presets
// ---------------------------------------------------------------------------
// Colours are authored in sRGB hex and converted on apply().
//   atmosphere: sunElevation may be NEGATIVE — that is how dusk and night are authored.
//     A sun 1 degree under the horizon is geometrically occluded, so the bake produces the
//     wedge with no disc; the key light is decoupled (lightElevation) because a game still
//     wants a rim on the car after the disc has set. turbidity scales Mie (haze/aerosol),
//     mieG is the forward-scatter anisotropy, ms is the isotropic multiple-scatter weight.
//   disc: the *visible body*. At dusk there is none. At night it is the moon, at its own
//     azimuth, while the atmosphere's "sun" sits 8 degrees under the horizon to give the
//     residual sunset band the reference shots always have.
//   fog: d0 = density at groundY, k = height falloff (1/m), uni = unbounded haze term.
//   aerial: low/high are the fog colour at the horizon / overhead; sunTint reddens the
//           haze looking into the sun, which is the thing that sells low-sun distance.
//   grade: lift is the black point (per channel, so dusk shadows go blue not grey);
//          sat puts back the chroma AgX removes; bloom.veil is the wide veiling skirt.
//   clouds: two slabs at real altitudes. *Alt* is the layer height in metres — that number
//     alone sets how hard the deck compresses toward the horizon. *Scale* is now in 1/km of
//     the cross-wind cell (0.40 => 2.5 km bands), *stretch* the along-wind elongation (4:1),
//     *shear* how far the slow second octave slides bands along the wind, *windAzimuth* the
//     one direction the whole deck is combed into. *Cut* is the fbm threshold (higher = fewer,
//     more broken bands), *soft* the feather width, *drift* the scroll rate. alto/cirrus are
//     the layer opacities; sunGain/skyGain scale the two LUT taps the shading is built from,
//     so a deck never out-runs the sky it hangs in. A third *low* deck sits under both at
//     ~1.5 km and scrolls at roughly half the alto rate, so the field parallaxes against
//     itself instead of reading as one stretched sheet.
//     *hgG* is the Henyey-Greenstein anisotropy of the droplets (higher = a tighter, hotter
//     forward lobe toward the sun), *tau* the optical-depth gain that turns fbm thickness
//     into extinction (higher = thick cores self-occlude harder toward the cool sky colour),
//     *aerial*/*aerialH* the strength and elevation reach of the cloud aerial perspective.
//   halo: the Mie forward lobe. tight/wide are pow() exponents on dot(view, sun) and their
//     gains are HDR multipliers on `color`; horizon is a thin exp() band that lifts the
//     haze either side of the sun. These values are what the bloom threshold sees.
const DEFAULT_CLOUDS = {
  alto: 0.85, cirrus: 0.50, sunGain: 0.35, skyGain: 1.15,
  windAzimuth: 20,
  altoAlt: 2800, altoStretch: 4.0, altoShear: 0.55,
  altoCut: 0.50, altoSoft: 0.22, altoScale: 0.42, altoDrift: 0.0016,
  cirrusAlt: 8000, cirrusStretch: 5.0, cirrusShear: 0.80,
  cirrusCut: 0.50, cirrusSoft: 0.24, cirrusScale: 0.24, cirrusDrift: 0.0022,
  low: 0.55, lowAlt: 1500, lowStretch: 3.2, lowShear: 0.45,
  lowCut: 0.58, lowSoft: 0.20, lowScale: 0.62, lowDrift: 0.0008,
  hgG: 0.62, tau: 3.4, aerial: 0.85, aerialH: 0.26,
};
const DEFAULT_HALO = {
  color: 0xffa05a, tight: 20.0, tightGain: 3.0, wide: 4.5, wideGain: 0.8, horizon: 1.0,
};

export const PRESETS = {
  dusk: {
    sunElevation: -0.9, sunAzimuth: 102,
    sunIrr: 19.0, mieG: 0.80, turbidity: 1.15, rayleigh: 1.0, ozone: 1.0, ms: 0.055,
    msTint: 0.10,
    // r14: the twilight arch. Set by whole-gradient fit against reference/dusk-highway-chase-01
    // (12 rows, x 0.55-0.65 vs the ref's 0.66-0.74), CAPPED by the zenith gate: RMS to the ref
    // keeps falling out to msBeam ~13, but zenith B/G leaves its 1.05-1.25 band above 2.6.
    //
    // r15: 2.5 -> 3.2, a RENORMALISATION, not a gain. ARCH_EV (see the ARCH_* block in
    // ATMOS_COMMON) multiplies the arch source by exp( -elev / 4 deg ), which takes flux out
    // of every row including the horizon; 3.2 puts the sodium row back where it was. Held
    // fixed by measurement, at x 0.75-0.82 / y 0.46-0.48: rgb 210.1,184.7,105.3 meanCast 0.499
    // before, 210.3,185.1,105.6 meanCast 0.498 after. (r16/wave R: the "after" numbers that
    // used to sit here — 210.9,187.4,109.1 meanCast 0.483 — were a stale intermediate and
    // over-reported a 0.015 saturation loss that never happened. Re-greped and re-rendered:
    // the shipped tree measures 210.3,185.1,105.6 / 0.498. Also note that this y 0.46-0.48
    // box is 12% GEOMETRY in our frame — power lines, three lamp heads and a tower-block edge,
    // p99-p01 = 30.1 against the reference's 2.3 — so it is a HOLD GATE against our own
    // previous render and never a reference match. See verdicts/wave-q/sky-lighting.md.)
    // Do NOT read this as headroom — the zenith
    // gate above still binds, and 3.2 without ARCH_EV puts the 20.8 deg row at R 78.
    msBeam: 3.2,
    camAltitude: 0.03, groundAlbedo: 0.09,
    discSize: 0.0, discIntensity: 0.0, discColor: 0xffd2a4,
    // *** skyGain STAYS AT 0.55. WAVE R WAS BRIEFED TO SPEND IT AND MEASURED THAT IT IS THE
    // WRONG LEVER. Do not re-try it as a flat gain; the proof is one render, reproduced below.
    // The brief's case was "the dome between 8 and 21 deg is 1.8-2.2x too low, skyGain is the
    // only lever that moves the ladder". The first half is true only at the BOTTOM of that
    // range. Registered in elevation against reference/dusk-highway-chase-01 (see the T0
    // section of verdicts/wave-r/sky-lighting.md; ref horizon y 0.455 +/- 0.020, NOT the
    // 0.593-0.602 wave Q published, and OUR horizon is y 0.4923 not 0.5077 — wave Q inverted
    // the sign of its own pitch term), our ramp reads, as ours/ref at matched elevation:
    //     20.9 deg  1.10x     18.3 deg  0.90x     15.6 deg  0.73x
    //     13.0 deg  0.62x     10.3 deg  0.55x      7.7 deg  0.61x
    // That is not a level error, it is a SHAPE error: we hold 21 deg and 18 deg correctly and
    // lose the ramp below. Our span 21 -> 7.7 deg is 62.3 -> 135.3 = 2.17x; the registered
    // reference's is 55.6 -> 220 = 3.96x. We have HALF the vertical gradient.
    // Measured, skyGain 0.55 -> 1.00 on this tree (shots/_r-sg1.00.png): the 13.0 deg row goes
    // 88.9 -> 132.3 R (0.62x -> 0.92x, a pass) but the 20.9 deg row goes 61.3 -> 96.7 R, i.e.
    // 1.10x -> 1.74x, a 74% OVERSHOOT of a row that already passed, while 10.3 deg is still
    // only 0.80x. A flat multiplier cannot close a shape deficit: it breaks two passing rows to
    // half-fix two failing ones. It also costs chroma everywhere (valley satPx 0.225 -> 0.172,
    // out of its 0.19-0.27 band) because the ACES shoulder desaturates as it brightens.
    // AND IT IS NOT THE CLOUD DECK EITHER, proven with the same instrument: _skyprobe
    // --noclouds c (all three decks at 0, null leg byte-identical to shot.mjs) leaves the span
    // at 62.3 -> 137.4 = 2.21x against the needed 3.96x. The shape lives in the ATMOSPHERE
    // BAKE (ozone / rayleigh / turbidity / msW / the aerial terminal), not in skyGain and not
    // in the decks. That is the next round's gap. ***
    stars: 0, skyGain: 0.55, night: false,
    ground: 0x0f1217,

    // the disc has set but the last raking light has not: 2.6 deg of artistic licence
    lightElevation: 2.6, lightAzimuth: 102,
    lightColor: 0xffb478, lightIntensity: 2.3,
    ambient: 0x8496b0, groundBounce: 0x1f2028, ambientIntensity: 1.7,
    envIntensity: 2.4, shadowSpan: 165, shadowNormalBias: 0.7,

    // dusk haze is dim: far geometry goes to a dark blue-grey, and only the
    // wedge of sky around the sun picks up the warm sunTint.
    //
    // r6: uni 0.00022 -> 0.00068, d0 left at 0.0030. This is the other half of the
    // bloom fix. The frame needs SOME atmospheric lift — reference -02 is explicit that
    // nothing in it is 0,0,0 — but the bloom veil was supplying it, and a veil is a
    // function of BRIGHTNESS, so it lifted the black tarmac two metres in front of the
    // bumper by as much as it lifted the far hillside. Haze is a function of DISTANCE,
    // which is the physically right coupling: the near-field tarmac has 3 m of air in
    // front of it and stays black, the ridge has 900 m and goes blue.
    //
    // It is deliberately the UNBOUNDED term (uni, linear in path length) that goes up
    // and not d0. Raising d0 was tried first and measured: it lifted the near tarmac
    // just as much as the tightened bloom had lowered it (near-road median 18.2 -> 20.1
    // of 255, sub-16 pixels 32% -> 18%), because d0 is the density AT y0 = 0 and the
    // bottom of frame is exactly there. uni has no height term but is linear in
    // distance, so at 6 m it is 0.4% and at 900 m it is 46%. k stays at 0.055 (1/e at
    // 18 m of altitude) so what height-dependent haze there is pools in the lowest
    // sliver of frame the way reference -01 shows, instead of filling the sky.
    fog: { d0: 0.0030, k: 0.055, y0: 0.0, uni: 0.00068 },
    aerialLow: 0x6b5d47, aerialHigh: 0x24394f,
    sunTint: 0xff9147, sunTintGain: 0.68,

    // broken altostratus banding with a thin cirrus veil above it; undersides take
    // their light from the sodium band next to the sun, tops from the teal zenith
    clouds: {
      // r8: alto 0.92 -> 0.45, cirrus 0.60 -> 0.30, low 0.62 -> 0.30. At the old values
      // the deck occluded ~92% of the dome, so the analytic teal zenith the atmosphere
      // bake produces was simply not visible anywhere in the top third — measured zenith
      // p01->p99 spread was 89 levels of cloud banding against the references' 16-34,
      // which is what a CLEAR sky measures. The references' whole read is a deep teal
      // zenith DARKER than the sodium horizon; you cannot see that through a cloud deck.
      // Coverage now breaks over the horizon half where the sodium band lights it and
      // thins out overhead, which is also where the deck's own aerial-perspective term
      // is weakest and so where an opaque sheet was most obvious.
      alto: 0.38, cirrus: 0.16, sunGain: 0.46, skyGain: 1.00,
      windAzimuth: 16,
      altoAlt: 2600, altoStretch: 4.2, altoShear: 0.60,
      altoCut: 0.49, altoSoft: 0.21, altoScale: 0.44, altoDrift: 0.0016,
      cirrusAlt: 8200, cirrusStretch: 5.5, cirrusShear: 0.85,
      cirrusCut: 0.47, cirrusSoft: 0.22, cirrusScale: 0.26, cirrusDrift: 0.0024,
      // dusk droplets are the most forward-scattering case in the set: the sun is
      // behind the deck, so thin wisps near it blow out and the thick cores go teal
      low: 0.30, lowAlt: 1450, lowStretch: 3.4, lowShear: 0.50,
      lowCut: 0.57, lowSoft: 0.19, lowScale: 0.64, lowDrift: 0.0008,
      hgG: 0.70, tau: 4.2, aerial: 0.90, aerialH: 0.30,
    },
    // r9: tight 20 -> 300, wide 7 -> 45. pow(cos,n) has a half-width of about
    // 1.18/sqrt(n) radians: n=20 is 15 deg, n=7 is 25 deg. That is not an aureole,
    // that is a second sky — with the sun 0.9 deg UNDER the horizon it was laying
    // ~0.55 linear of 0xff9a4e over a 0.14 teal zenith 20 deg up, 4x the radiance of
    // the sky it sat in, which is the whole of the measured B/R 0.84 hue inversion.
    // n=300 is a 3.9 deg half-width and n=45 is 10 deg, which is what a real dusk
    // aureole subtends. The gains go UP (1.7 -> 3.4, 0.26 -> 0.95) because the peak
    // is what sells the set sun and the bloom pyramid keys off it: narrower, not
    // dimmer. `horizon` is the separate thin exp() band and stays as authored.
    halo: {
      color: 0xff9a4e, tight: 300.0, tightGain: 3.4, wide: 45.0, wideGain: 0.95, horizon: 0.22,
    },

    exposure: 1.30,
    // lift/dither/hiDesat/contrast/sat ARE LIVE, on the default ACES path, in every render.
    // This block used to carry a WARNING that they were inert dead code consumed only by an
    // AgxOutputPass main.js never built. That was FALSE and it contradicted the module note at
    // the top of this file: main.js:13 imports createOutputPass, :128 builds it, post.js:35
    // imports toneLift/toneGrade from here and sky.js:1551-1555 writes them each apply().
    // post.js:414 switches only the TONEMAPPER on #tone=agx; the grade block runs regardless.
    // Corrected in Wave P (Rule 5 — the constants disagreed with the prose). The five values
    // below reach the image; measured, the sky rows in this file's verdicts cannot be
    // reproduced without them. `veil` is the one field that really does go nowhere.
    //
    // lift is a FLAT
    // post-tonemap black offset, so it hits the near-field bumper and the far ridge
    // identically — the same screen-wide black-lift failure the bloom veil had. Cut to
    // a seventh of its old 0.044; the blue bias stays (dusk shadows read blue, not grey)
    // and the distance lift becomes the haze's job. contrast 0.05 -> 0.15 puts the toe
    // back under the near field once that flat lift is gone.
    lift: [0.006, 0.008, 0.015],
    dither: 1.0, hiDesat: 0.16, contrast: 0.15, sat: 1.32,
    // r6, the harsh critic's one remaining gap: "the bloom veil is screen-wide - it
    // lifts near-field blacks and washes out the zenith". This block IS live: main.js
    // duck-types applyBloom() onto an UnrealBloomPass, so threshold/radius/strength
    // reach the renderer (veil does not — that field only exists on post.js's
    // DualFilterBloomPass). threshold 1.00 -> 1.40 means
    // only genuinely over-white sources (the sun lobe, billboard faces, the tail-light
    // cores) enter the pyramid at all, instead of every mid-grey sky pixel; radius
    // 0.78 -> 0.38 halves the weight on the widest mips, which is where a screen-wide
    // skirt comes from. Reference -03 is the target: bright signs "bloom slightly but do
    // not clip to pure white; their glow spills a couple of pixels, not a soft halo".
    bloom: { threshold: 1.40, radius: 0.38, strength: 0.0, veil: 0.10 },
  },

  midday: {
    // 47 deg / azimuth 145, and the ATMOSPHERE and KEY vectors are now identical.
    //
    // History, because this number was wrong for five rounds: the preset used to author
    // the disc at one elevation and the key light at another (sunElevation 42 /
    // lightElevation 68). Only `lightElevation` reaches the DirectionalLight, and
    // main.js re-asserts the light from `p.lightElevation` every tick, so editing
    // `sunElevation` alone — which is what session 4 did — moved the painted disc and
    // left every cast shadow exactly where it was. tools/shadow-ab.mjs measured the
    // result: toggling the entire shadow map off changed mean road luminance by
    // 1.04/255, i.e. no building shadow reached the road at all. At 68 deg a 40 m block
    // throws a 16 m shadow that dies on its own sidewalk.
    //
    // The two vectors are deliberately NOT decoupled any more. Decoupling is right at
    // dusk (the disc has set but the key has not); in daylight it only means the sky
    // and the shadows disagree about where the sun is, and that is what hid this bug.
    //
    // WHY 145 AND NOT 215. The city path here runs along world +Z with the chase camera
    // looking down it, so azimuth 180 is straight down-street and 145/215 are the two
    // 35-deg-off-axis options. They are not symmetric, because the two frontages are not:
    // raycast from the road centre at the shot position, the LEFT wall stands 24 m away
    // and is still solid at a 60 deg grazing angle (~47 m tall), while the RIGHT wall
    // stands 14 m away and is clear by 60 deg (~20 m tall). Lighting from behind-left
    // (215) means the 47 m wall casts h/tan(e)*sin(35) across the street: even at 44 deg
    // that is 27 m and the whole carriageway goes into shade — measured, road meanOn
    // 48/255 against meanOff 85/255 with no lit lane anywhere in frame. That is the
    // session-4 failure mode with a different number in it.
    //
    // Lighting from behind-RIGHT (145) uses the LOW frontage as the caster instead, and
    // it also turns the tall left facade — the one that fills a third of the frame —
    // into the sunlit side, which is the daytime-downtown-02 read: a hard sun/shade
    // split across the canyon rather than one flat ambient value.
    //
    // WHY 47 AND NOT THE 25-30 THAT WAS ASKED FOR. Cross-street shadow reach is
    // h/tan(e)*sin(offAxis). Measured by raycasting the shot position toward the sun on
    // a 4 m road grid (x = -22..+14, z = -5..+40): at 35 and 45 deg every sample on the
    // carriageway is occluded, at 46-50 deg the samples from x = -22 to +2 are clear and
    // +6 to +14 are occluded, i.e. the shadow edge finally lands ON the road instead of
    // past the far kerb. 47 is the lowest sun this canyon can take and still have a lit
    // lane for a shadow to be legible against; below it the street is simply in shade
    // and shadow-ab reports a big MAD for the wrong reason (road meanOn 34 vs meanOff
    // 60 at 27 deg — everything dark — against 65 vs 75 here).
    sunElevation: 47, sunAzimuth: 145,
    sunIrr: 22.0, mieG: 0.76, turbidity: 1.5, rayleigh: 1.0, ozone: 1.0, ms: 0.11,
    camAltitude: 0.03, groundAlbedo: 0.12,
    discSize: 0.0060, discIntensity: 55.0, discColor: 0xfff4e4,
    // 0.90, not 1.0: the daytime dome is the brightest thing in frame and at unity
    // it drags the whole street up with it through the env probe and the bloom veil.
    stars: 0, skyGain: 0.90, night: false,
    ground: 0x37363a,

    lightElevation: 47, lightAzimuth: 145,
    // sin(47) = 0.73 against sin(68) = 0.93, so the road receives ~79% of the key it did
    // per unit intensity while the facades receive 1.8x more. 5.6 holds the sunlit
    // tarmac roughly where it was without blowing the lit wall faces out.
    lightColor: 0xffeeda, lightIntensity: 6.3,
    // ambientIntensity 0.60 -> 0.48. With a 47 deg key there is finally lit and shaded
    // road in the same frame, and the shadow depth is set by the key:fill ratio, not by
    // the shadow map. world.applyKeyFill() scales this by a further 0.58 for a >20 deg
    // sun, so the hemisphere fill lands at 0.28 against a 6.3 key.
    ambient: 0x9dc0e8, groundBounce: 0x4a463f, ambientIntensity: 0.48,
    // 0.035, matching main.js's city override. Session 4 proved a 0.35 m normalBias is
    // DEEPER than the 0.34 m facade relief it is supposed to shadow, so it biased every
    // step straight through its own shadow. Do not raise this to chase acne.
    envIntensity: 1.0, shadowSpan: 110, shadowNormalBias: 0.035,

    // Shadow ortho box, in LIGHT SPACE metres, re-asserted every tick by update().
    // main.js sets a symmetric +/-100 box after apply(); this replaces it, because a
    // symmetric box centred on the car spends half its texels behind the chase camera.
    //
    // Light-space axes for a 47 deg / 145 deg sun (three builds them with lookAt and
    // up = +Y): x_ls = (-0.819, 0, -0.574), y_ls = (-0.419, 0.682, 0.599). The street
    // runs along world +Z and the camera looks down it, so road 80 m ahead lands at
    // x_ls -46 / y_ls +48, 30 m behind the car at x_ls +17 / y_ls -18, and +/-30 m of
    // lateral spread adds +/-25 / +/-13. Tall casters project mostly into +y_ls (world
    // up contributes 0.682), which is why the top is the one side that stays generous:
    // an 80 m tower needs ~+55 there on top of its ground position, or its shadow is
    // clipped out of the map and the canyon floor comes back unshadowed.
    // 118 x 144 over a 4096 map = 2.9 x 3.5 cm/texel, against 4.9 for the +/-100 box.
    shadowOrtho: { left: -74, right: 44, bottom: -32, top: 112 },

    // Midday haze was doing far too much: d0 0.0028 with a slow k 0.026 falloff and a
    // 4e-4 unbounded term meant the far end of a street canyon was ~80% fog, so every
    // distant facade converged on one pale blue value and the vanishing point clipped
    // white. Reference daytime-downtown-04 has real aerial perspective but the far
    // towers still hold a legible dark/light separation, which needs both less total
    // density and a faster height falloff so the haze pools low instead of filling
    // the canyon. The aerial colours also come down off near-white for the same reason.
    fog: { d0: 0.0016, k: 0.038, y0: 0.0, uni: 0.00019 },
    aerialLow: 0x94a9bf, aerialHigh: 0x6f95bd,
    sunTint: 0xf2e6d2, sunTintGain: 0.14,
    // INTERIM CLAMP, and the reason is a finding about THIS preset, not about the aerial
    // path. At aerialSky 1.0 the terminal is the midday bake's own horizon row, and that
    // row is much brighter than the 0x94a9bf swatch it replaces: the horizon band goes
    // 126.4 -> 166.6 mean against 95.7/82.0/110.8/134.6 on the four daytime references,
    // i.e. off the top of the reference range. Halving the fog density does NOT fix it
    // (166.6 -> 147.9) because the vanishing point saturates the fog at any density — the
    // level there IS the dome's horizon level. So the authored swatch was silently
    // compensating for a too-bright midday bake horizon, and until that is fixed in the
    // bake this preset can only take part of the sky target. 0.15 is the largest weight
    // that keeps every band inside the reference envelope (horizon 126.4 -> 131.5 against
    // a 82-135 reference spread; full-frame 89.8 -> 90.0).
    aerialSky: 0.15,

    // high sun: fewer, harder-edged cumulus/alto patches, bright tops, cool bases
    clouds: {
      alto: 0.86, cirrus: 0.45, sunGain: 0.45, skyGain: 1.05,
      windAzimuth: 24,
      altoAlt: 3200, altoStretch: 3.6, altoShear: 0.50,
      altoCut: 0.52, altoSoft: 0.19, altoScale: 0.50, altoDrift: 0.0018,
      cirrusAlt: 8600, cirrusStretch: 5.0, cirrusShear: 0.75,
      cirrusCut: 0.50, cirrusSoft: 0.22, cirrusScale: 0.28, cirrusDrift: 0.0026,
      low: 0.50, lowAlt: 1600, lowStretch: 3.0, lowShear: 0.42,
      lowCut: 0.60, lowSoft: 0.18, lowScale: 0.66, lowDrift: 0.0009,
      hgG: 0.54, tau: 3.0, aerial: 0.62, aerialH: 0.20,
    },
    halo: {
      color: 0xffe6c4, tight: 26.0, tightGain: 2.2, wide: 7.0, wideGain: 0.22, horizon: 0.10,
    },

    exposure: 1.00,
    lift: [0.008, 0.010, 0.015],
    dither: 1.0, hiDesat: 0.15, contrast: 0.10, sat: 1.22,
    bloom: { threshold: 1.60, radius: 0.58, strength: 0.30, veil: 0.07 },
  },

  night: {
    // atmosphere sun is deep twilight; the visible body and the key light are the moon
    sunElevation: -7.5, sunAzimuth: 296,
    sunIrr: 20.0, mieG: 0.78, turbidity: 2.0, rayleigh: 1.0, ozone: 1.0, ms: 0.05,
    camAltitude: 0.03, groundAlbedo: 0.07,
    discElevation: 34, discAzimuth: 262,
    discSize: 0.0085, discIntensity: 2.6, discColor: 0xdae6ff,
    stars: 0.9, skyGain: 1.0, night: true,
    ground: 0x05070b,

    lightElevation: 34, lightAzimuth: 262,
    lightColor: 0x8ea8d8, lightIntensity: 0.45,
    // blue ambient so night shadows read blue, never black
    ambient: 0x35496e, groundBounce: 0x121722, ambientIntensity: 0.46,
    envIntensity: 0.9, shadowSpan: 120, shadowNormalBias: 0.6,

    fog: { d0: 0.0046, k: 0.048, y0: 0.0, uni: 0.00046 },
    aerialLow: 0x2a3550, aerialHigh: 0x0c1424,
    sunTint: 0x6b3f26, sunTintGain: 0.30,
    // Same interim clamp as midday, worse cause: the night bake's horizon row is a
    // NEUTRAL 0.115,0.125,0.129 linear (probe), ~5x the authored 0x2a3550
    // (0.023,0.036,0.080) and with no blue in it at all. At aerialSky 1.0 the horizon
    // band went 83.7 -> 99.7 and its saturation collapsed 0.133 -> 0.068, against
    // references that are dark and chromatic (full-frame sat 0.16-0.39, 9-26% of pixels
    // under 16). A grey night horizon is a bake bug; do not paper over it with fog.
    // 0.30 costs 4.7 on the horizon band and 0.007 of full-frame saturation.
    aerialSky: 0.30,

    // night deck is mostly a star mask: dim, wide, lit only by the residual
    // sunset band and the moon-side skylight
    clouds: {
      alto: 0.80, cirrus: 0.38, sunGain: 0.55, skyGain: 0.90,
      windAzimuth: 20,
      altoAlt: 2500, altoStretch: 4.5, altoShear: 0.60,
      altoCut: 0.52, altoSoft: 0.26, altoScale: 0.38, altoDrift: 0.0014,
      cirrusAlt: 8000, cirrusStretch: 5.5, cirrusShear: 0.85,
      cirrusCut: 0.54, cirrusSoft: 0.24, cirrusScale: 0.22, cirrusDrift: 0.0020,
      low: 0.46, lowAlt: 1400, lowStretch: 3.4, lowShear: 0.50,
      lowCut: 0.60, lowSoft: 0.22, lowScale: 0.58, lowDrift: 0.0007,
      hgG: 0.60, tau: 3.6, aerial: 0.80, aerialH: 0.24,
    },
    halo: {
      color: 0xff8a44, tight: 22.0, tightGain: 0.55, wide: 5.0, wideGain: 0.16, horizon: 0.55,
    },

    exposure: 1.55,
    lift: [0.022, 0.028, 0.046],
    dither: 1.2, hiDesat: 0.16, contrast: 0.05, sat: 1.26,
    bloom: { threshold: 0.90, radius: 0.82, strength: 0.60, veil: 0.30 },
  },

  dawn: {
    // sun a few degrees UP but still raking: cooler and pinker than dusk because the
    // morning air carries far less aerosol, so Mie is weak and Rayleigh dominates
    sunElevation: 3.2, sunAzimuth: 78,
    sunIrr: 20.0, mieG: 0.72, turbidity: 1.5, rayleigh: 1.05, ozone: 1.15, ms: 0.07,
    camAltitude: 0.03, groundAlbedo: 0.09,
    discSize: 0.0062, discIntensity: 14.0, discColor: 0xffd8b0,
    stars: 0, skyGain: 1.0, night: false,
    ground: 0x14171d,

    lightElevation: 3.2, lightAzimuth: 78,
    lightColor: 0xffc79a, lightIntensity: 2.6,
    ambient: 0x8ba6cc, groundBounce: 0x23242c, ambientIntensity: 0.85,
    envIntensity: 1.0, shadowSpan: 165, shadowNormalBias: 0.7,

    fog: { d0: 0.0034, k: 0.052, y0: 0.0, uni: 0.00026 },
    aerialLow: 0x8a7a6a, aerialHigh: 0x2c4560,
    sunTint: 0xffb27a, sunTintGain: 0.85,

    clouds: {
      alto: 0.90, cirrus: 0.62, sunGain: 0.38, skyGain: 1.25,
      windAzimuth: 12,
      altoAlt: 2700, altoStretch: 4.2, altoShear: 0.58,
      altoCut: 0.50, altoSoft: 0.22, altoScale: 0.42, altoDrift: 0.0015,
      cirrusAlt: 8200, cirrusStretch: 5.2, cirrusShear: 0.85,
      cirrusCut: 0.46, cirrusSoft: 0.22, cirrusScale: 0.25, cirrusDrift: 0.0022,
      low: 0.58, lowAlt: 1500, lowStretch: 3.3, lowShear: 0.48,
      lowCut: 0.58, lowSoft: 0.20, lowScale: 0.62, lowDrift: 0.0008,
      hgG: 0.66, tau: 3.9, aerial: 0.88, aerialH: 0.28,
    },
    halo: {
      color: 0xffb070, tight: 20.0, tightGain: 3.4, wide: 4.5, wideGain: 0.72, horizon: 0.85,
    },

    exposure: 1.22,
    lift: [0.036, 0.040, 0.056],
    dither: 1.0, hiDesat: 0.18, contrast: 0.05, sat: 1.30,
    bloom: { threshold: 1.05, radius: 0.74, strength: 0.50, veil: 0.30 },
  },
};

// friendlier names the scene table may use
const PRESET_ALIAS = { day: 'midday', noon: 'midday', sunset: 'dusk', sunrise: 'dawn' };

function sunDirection(elevDeg, aziDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevDeg);
  const theta = THREE.MathUtils.degToRad(aziDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

// vertical (zenith) optical depth of the whole column, used to redden the visible disc
// the same way the baked sky is reddened. Rayleigh*Hr + Mie*Hm + ozone tent (integral 15 km).
function zenithTau(p, out) {
  const r = p.rayleigh, t = p.turbidity, o = p.ozone;
  out.set(
    0.0464 * r + 0.005328 * t + 0.035250 * o,
    0.1085 * r + 0.005328 * t + 0.015000 * o,
    0.2648 * r + 0.005328 * t + 0.001500 * o,
  );
  return out;
}

const _c = new THREE.Color();
/** sRGB hex -> linear-working float triple, written into a Float32Array slot. */
function writeLinear(target, hex, offset = 0, scale = 1) {
  _c.setHex(hex, THREE.SRGBColorSpace);
  target[offset + 0] = _c.r * scale;
  target[offset + 1] = _c.g * scale;
  target[offset + 2] = _c.b * scale;
}

export function createSky(scene, renderer) {
  // ---- the baked sky-view LUT ---------------------------------------------
  const lutTarget = new THREE.WebGLRenderTarget(LUT_W, LUT_H, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  });
  lutTarget.texture.generateMipmaps = false;

  const atmosMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunElev: { value: 0 },
      uSunIrr: { value: new THREE.Vector3(20, 20, 20) },
      uMieG: { value: 0.78 },
      uTurbidity: { value: 2.2 },
      uRayScale: { value: 1.0 },
      uOzone: { value: 1.0 },
      uMs: { value: 0.06 },
      uMsTint: { value: 0.0 },
      uMsBeam: { value: 0.0 },
      uCamH: { value: 0.03 },
      uGroundAlbedo: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
    },
    vertexShader: ATMOS_VERT, fragmentShader: ATMOS_FRAG,
    depthTest: false, depthWrite: false,
  });
  const atmosQuad = new FullScreenQuad(atmosMat);

  /** Re-bake the atmosphere. ~75k texels x 40 view steps x 8 sun steps, once per apply(). */
  function bakeLut(p) {
    const u = atmosMat.uniforms;
    u.uSunElev.value = THREE.MathUtils.degToRad(p.sunElevation);
    u.uSunIrr.value.setScalar(p.sunIrr);
    u.uMieG.value = p.mieG;
    u.uTurbidity.value = p.turbidity;
    u.uRayScale.value = p.rayleigh;
    u.uOzone.value = p.ozone;
    u.uMs.value = p.ms;
    u.uMsTint.value = p.msTint !== undefined ? p.msTint : 0.0;
    // default 0: midday/night/dawn are UNTOUCHED by the arch. Midday and dawn have the sun
    // above the horizon so no sample is ever occluded and the term is inert anyway; night is
    // -7.5 deg, a 55 km shadow, where ( 1 - exp( -sdep/0.80 ) ) saturates at 1 for every
    // sample and the term would NOT be inert. Leaving it 0 there is deliberate.
    u.uMsBeam.value = p.msBeam !== undefined ? p.msBeam : 0.0;
    u.uCamH.value = p.camAltitude;
    u.uGroundAlbedo.value.setScalar(p.groundAlbedo);
    const prev = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(lutTarget);
    atmosQuad.render(renderer);
    renderer.setRenderTarget(prev);
    renderer.autoClear = prevAutoClear;
  }

  // ---- resample the baked LUT into the shared aerial grid -------------------
  // 25 one-texel readbacks, once per apply(), i.e. once per preset change. It is a GPU
  // sync, so it does NOT belong in update(); nothing about the grid is per-frame.
  const _lutPix = new Uint16Array(4);
  function lutTexel(u, elev, out) {
    const vv = 0.5 + 0.5 * Math.sign(elev) * Math.sqrt(Math.abs(elev) / (Math.PI * 0.5));
    const x = Math.min(LUT_W - 1, Math.max(0, Math.round(u * (LUT_W - 1))));
    const y = Math.min(LUT_H - 1, Math.max(0, Math.round(vv * (LUT_H - 1))));
    renderer.readRenderTargetPixels(lutTarget, x, y, 1, 1, _lutPix);
    out[0] = THREE.DataUtils.fromHalfFloat(_lutPix[0]);
    out[1] = THREE.DataUtils.fromHalfFloat(_lutPix[1]);
    out[2] = THREE.DataUtils.fromHalfFloat(_lutPix[2]);
  }
  const _lutRGB = [0, 0, 0];
  function writeSkyGrid(gain) {
    for (let i = 0; i < AER_NV; i++) {
      const t = i / (AER_NV - 1);
      // the bake's sqrt warp, inverted; row 0 is lifted off the exact horizon (see AER_EL0)
      const elev = i === 0 ? AER_EL0 : t * t * (Math.PI * 0.5);
      for (let j = 0; j < AER_NU; j++) {
        lutTexel(j / (AER_NU - 1), elev, _lutRGB);
        const o = (i * AER_NU + j) * 3;
        fogSkyGrid[o + 0] = _lutRGB[0] * gain;
        fogSkyGrid[o + 1] = _lutRGB[1] * gain;
        fogSkyGrid[o + 2] = _lutRGB[2] * gain;
      }
    }
  }

  const uniforms = {
    uSkyLut: { value: lutTarget.texture },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDiscDir: { value: new THREE.Vector3(0, 1, 0) },
    uDiscColor: { value: new THREE.Color(1, 1, 1) },
    uZenithTau: { value: new THREE.Vector3(0.06, 0.14, 0.27) },
    uGround: { value: new THREE.Color() },
    uDiscSize: { value: 0.006 },
    uDiscIntensity: { value: 0 },
    uStars: { value: 0 },
    uExp: { value: 1 },
    uTime: { value: 0 },
    uCloudA: { value: new THREE.Vector4(0.50, 0.30, 0.70, 0.006) },
    uCloudB: { value: new THREE.Vector4(0.54, 0.26, 0.28, 0.011) },
    uCloudC: { value: new THREE.Vector4(0.58, 0.20, 0.62, 0.0008) },
    uCloudD: { value: new THREE.Vector4(1500, 3.2, 0.45, 0.55) },
    uCloudSh: { value: new THREE.Vector4(0.62, 3.4, 0.85, 0.26) },
    uCloudMix: { value: new THREE.Vector4(0.85, 0.5, 0.25, 1.0) },
    uWind: { value: new THREE.Vector4(0.34, 0.94, 2800, 8000) },
    uCloudGeo: { value: new THREE.Vector4(4.0, 5.0, 0.55, 0.80) },
    uHalo: { value: new THREE.Vector4(1.0, 0.6, 0.32, 3.0) },
    uHalo2: { value: new THREE.Vector4(20.0, 4.5, 0.8, 1.0) },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  scene.add(skyMesh);

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 620;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x20242c, 0.5);
  scene.add(ambient);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(skyMesh.geometry, skyMat);
  envSky.scale.setScalar(10);
  envScene.add(envSky);

  let sunDist = 260;
  const sunLightDir = new THREE.Vector3(0, 1, 0);

  const api = {
    sun, ambient, skyMesh, envTexture: null, preset: null, presetName: null,
    // the baked sky-view LUT, exposed so tools/probe.mjs can read the ATMOSPHERE back
    // in HDR instead of inferring it from a tonemapped screenshot. Tuning the bake off a
    // PNG is guesswork: ACES compresses everything over ~1.0 toward white, so a dome
    // that is 2x too bright and a dome with the wrong hue look identical in the shot.
    // Read it with:  sky.sampleLut(uAzimuth01, elevationRadians) -> [r,g,b] linear.
    lutTarget,
    sampleLut(u, elev) {
      const vv = 0.5 + 0.5 * Math.sign(elev) * Math.sqrt(Math.abs(elev) / (Math.PI * 0.5));
      const x = Math.min(LUT_W - 1, Math.max(0, Math.round(u * (LUT_W - 1))));
      const y = Math.min(LUT_H - 1, Math.max(0, Math.round(vv * (LUT_H - 1))));
      const buf = new Uint16Array(4);
      renderer.readRenderTargetPixels(lutTarget, x, y, 1, 1, buf);
      const f = (h) => THREE.DataUtils.fromHalfFloat(h);
      return [f(buf[0]), f(buf[1]), f(buf[2])];
    },
    PRESETS,
    // live, shared with every material's shader — see the header note
    fogParams, fogLow, fogHigh, fogSun, fogSunDir, toneLift, toneGrade,

    apply(name) {
      const p = PRESETS[name] || PRESETS[PRESET_ALIAS[name]] || PRESETS.dusk;
      api.preset = p; api.presetName = name;

      // ---- atmosphere ------------------------------------------------------
      bakeLut(p);

      const dir = sunDirection(p.sunElevation, p.sunAzimuth);
      const lightDir = sunDirection(
        p.lightElevation !== undefined ? p.lightElevation : p.sunElevation,
        p.lightAzimuth !== undefined ? p.lightAzimuth : p.sunAzimuth);
      const discDir = sunDirection(
        p.discElevation !== undefined ? p.discElevation : p.sunElevation,
        p.discAzimuth !== undefined ? p.discAzimuth : p.sunAzimuth);

      uniforms.uSunDir.value.copy(dir);
      uniforms.uDiscDir.value.copy(discDir);
      uniforms.uDiscColor.value.setHex(p.discColor, THREE.SRGBColorSpace);
      uniforms.uDiscSize.value = p.discSize;
      uniforms.uDiscIntensity.value = p.discIntensity;
      uniforms.uGround.value.setHex(p.ground, THREE.SRGBColorSpace);
      uniforms.uStars.value = p.stars;
      uniforms.uExp.value = p.skyGain;
      zenithTau(p, uniforms.uZenithTau.value);
      // aerial terminal colour, in the dome's own units (hence * skyGain)
      writeSkyGrid(p.skyGain);
      fogAerial[0] = p.aerialSky !== undefined ? p.aerialSky : 1.0;
      fogAerial[1] = p.skyGain;
      fogAerial[2] = p.aerialHalo !== undefined ? p.aerialHalo : 1.0;

      // ---- cloud decks + Mie halo ------------------------------------------
      const c = p.clouds || DEFAULT_CLOUDS;
      uniforms.uCloudA.value.set(c.altoCut, c.altoSoft, c.altoScale, c.altoDrift);
      uniforms.uCloudB.value.set(c.cirrusCut, c.cirrusSoft, c.cirrusScale, c.cirrusDrift);
      uniforms.uCloudMix.value.set(c.alto, c.cirrus, c.sunGain, c.skyGain);
      const D = DEFAULT_CLOUDS;
      const pick = (k) => (c[k] !== undefined ? c[k] : D[k]);
      uniforms.uCloudC.value.set(pick('lowCut'), pick('lowSoft'),
        pick('lowScale'), pick('lowDrift'));
      uniforms.uCloudD.value.set(pick('lowAlt'), pick('lowStretch'),
        pick('lowShear'), pick('low'));
      uniforms.uCloudSh.value.set(pick('hgG'), pick('tau'),
        pick('aerial'), pick('aerialH'));
      const wa = THREE.MathUtils.degToRad(c.windAzimuth !== undefined ? c.windAzimuth : 20);
      uniforms.uWind.value.set(
        Math.sin(wa), Math.cos(wa),
        c.altoAlt !== undefined ? c.altoAlt : 2800,
        c.cirrusAlt !== undefined ? c.cirrusAlt : 8000);
      uniforms.uCloudGeo.value.set(
        c.altoStretch !== undefined ? c.altoStretch : 4.0,
        c.cirrusStretch !== undefined ? c.cirrusStretch : 5.0,
        c.altoShear !== undefined ? c.altoShear : 0.55,
        c.cirrusShear !== undefined ? c.cirrusShear : 0.80);
      const hl = p.halo || DEFAULT_HALO;
      _c.setHex(hl.color, THREE.SRGBColorSpace);
      uniforms.uHalo.value.set(_c.r, _c.g, _c.b, hl.tightGain);
      uniforms.uHalo2.value.set(hl.tight, hl.wide, hl.wideGain, hl.horizon);
      fogHalo[0] = _c.r; fogHalo[1] = _c.g; fogHalo[2] = _c.b; fogHalo[3] = hl.tightGain;
      fogHalo2[0] = hl.tight; fogHalo2[1] = hl.wide;
      fogHalo2[2] = hl.wideGain; fogHalo2[3] = hl.horizon;

      // ---- key light + shadow frustum ------------------------------------
      sunLightDir.copy(lightDir);
      sunDist = Math.max(240, p.shadowSpan * 2.4);
      sun.position.copy(lightDir).multiplyScalar(sunDist);
      sun.color.setHex(p.lightColor, THREE.SRGBColorSpace);
      sun.intensity = p.lightIntensity;
      const S = p.shadowSpan;
      sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
      sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
      sun.shadow.camera.far = sunDist * 2.2;
      sun.shadow.normalBias = p.shadowNormalBias;
      sun.shadow.camera.updateProjectionMatrix();

      // ---- ambient / skylight ---------------------------------------------
      ambient.color.setHex(p.ambient, THREE.SRGBColorSpace);
      ambient.groundColor.setHex(p.groundBounce, THREE.SRGBColorSpace);
      ambient.intensity = p.ambientIntensity;

      // ---- fog / aerial perspective ----------------------------------------
      fogParams[0] = p.fog.d0;
      fogParams[1] = p.fog.k;
      fogParams[2] = p.fog.y0;
      fogParams[3] = p.fog.uni;
      writeLinear(fogLow, p.aerialLow);
      writeLinear(fogHigh, p.aerialHigh);
      writeLinear(fogSun, p.sunTint);
      fogSun[3] = p.sunTintGain;
      fogSunDir[0] = dir.x; fogSunDir[1] = dir.y; fogSunDir[2] = dir.z;
      // FogExp2 exists only to make three define USE_FOG/FOG_EXP2; the patched
      // chunk ignores fogColor/fogDensity entirely.
      scene.fog = new THREE.FogExp2(new THREE.Color().setHex(p.aerialLow, THREE.SRGBColorSpace), 0.001);

      // ---- exposure + grade -------------------------------------------------
      renderer.toneMappingExposure = p.exposure;
      toneLift[0] = p.lift[0]; toneLift[1] = p.lift[1]; toneLift[2] = p.lift[2];
      toneGrade[0] = p.dither;
      toneGrade[1] = p.hiDesat;
      toneGrade[2] = p.contrast;
      toneGrade[3] = p.sat !== undefined ? p.sat : 1.0;

      // ---- environment ------------------------------------------------------
      if (api.envTexture) api.envTexture.dispose();
      const rt = pmrem.fromScene(envScene, 0.02);
      api.envTexture = rt.texture;
      scene.environment = rt.texture;
      scene.environmentIntensity = p.envIntensity;
      return p;
    },

    /** Push the preset's bloom shaping onto post.js's dual-filter pass. */
    applyBloom(pass) {
      if (!pass || !api.preset || !api.preset.bloom) return;
      const b = api.preset.bloom;
      pass.threshold = b.threshold;
      pass.radius = b.radius;
      pass.strength = b.strength;
      if (b.veil !== undefined && 'veil' in pass) pass.veil = b.veil;
    },

    /** Keep the shadow frustum centred on the focus point; drift the cloud decks. */
    update(dt, focus) {
      uniforms.uTime.value += (dt || 0);
      if (!focus) return;
      // sunLightDir, NOT uniforms.uSunDir. uSunDir is the *atmosphere* vector — where
      // the disc and the scattering live — and rebuilding the light position from it
      // silently teleported the key light one tick after setup whenever a preset
      // authored the two apart. That cost five rounds of shadow debugging; main.js
      // carries a defensive re-assert for the same bug. See the midday preset note.
      const dir = sunLightDir;
      sun.target.position.set(focus.x, 0, focus.z);
      sun.position.set(focus.x + dir.x * sunDist, dir.y * sunDist, focus.z + dir.z * sunDist);
      sun.target.updateMatrixWorld();
      sun.updateMatrixWorld();

      // Re-assert the authored ortho box. main.js widens the frustum once at setup;
      // a preset that has fitted its own box to the visible frustum owns it instead,
      // and has to keep saying so because setup runs after apply().
      const box = api.preset && api.preset.shadowOrtho;
      if (box) {
        const cam = sun.shadow.camera;
        if (cam.left !== box.left || cam.right !== box.right
          || cam.bottom !== box.bottom || cam.top !== box.top) {
          cam.left = box.left; cam.right = box.right;
          cam.bottom = box.bottom; cam.top = box.top;
          cam.updateProjectionMatrix();
        }
      }
    },

    dispose() { pmrem.dispose(); },
  };

  api.apply('dusk');
  return api;
}
