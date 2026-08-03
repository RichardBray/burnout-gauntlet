# WAVE N BUILDER — sky-lighting (n1) — game/sky.js

## PIECE / FILE / WHAT CHANGED, MECHANISM FIRST

The twilight tint carried no radiance because on any SATURATED path the analytic segment
integral divides the source by `ext`, `(sR+sM)/ext` lands within 5% of neutral in every
channel, and what survives is a flat floor of `uSunIrr * msW * msSpectrum` with NO vertical
structure. Verified numerically, not assumed: a python replica of `scatter()` reproduces the
shipped LUT to 3 dp (`e=0` side 0.383,0.314,0.155 vs probe 0.383,0.314,0.154) and, through a
replica of the whole display chain (skyGain 0.55 -> ACES @ exposure 1.30 -> sat 1.32 / hiDesat
0.16 / contrast 0.15 / lift -> sRGB), predicts the shipped PIXELS to a few units. The floor
predicts 0.388,0.320,0.250 at the horizon. **The sodium band WAS the floor.**

FIX: the ms floor stands in for an isotropic grey source; what actually lights a sample under
the terminator is the twilight ARCH, a directional source carrying the tangent-path spectrum.
Added it as a third source that goes through the PHASE FUNCTIONS, which (a) gives it the
tangent beam's real, un-normalised radiance and (b) weights it `sR*pr + sM*pa`, so it picks up
the AEROSOL scale height (1.2 km) alongside betaR instead of sharing Rayleigh's 8 km — the
exact coupling the brief named. `sunLight()` gained an out param `shadowDepth = Rg/sin(z) - r`;
the arch weight `(1 - exp(-shadowDepth/ARCH_HSH))` is 0 exactly where the direct term switches
on, so the two hand over continuously.

CONSTANTS (all `game/sky.js`, BEFORE -> AFTER):
- `:387  void sunLight( vec3 p, vec3 s, out vec3 tDirect, out vec3 tMs )`
  -> `:393  void sunLight( ..., out vec3 tMs, out float shadowDepth )`; `:405 shadowDepth = Rg / sinz - r;` (new), `:401 shadowDepth = 0.0;` on the sunlit branch.
- `:464  const float ARCH_G    = 0.70;`   NEW (arch lobe, broader than dusk `mieG` 0.80)
- `:465  const float ARCH_TINT = 0.25;`   NEW (exponent on tMs; raw tMs is B/R ~5e-5)
- `:466  const float ARCH_HSH  = 0.80;`   NEW (km; hand-over scale)
- `:484-485 float pa = ...`               NEW (HG at ARCH_G)
- `:512-513 vec3 arch = uMsBeam * ( 1.0 - exp( -sdep / ARCH_HSH ) ) * pow( max( tMs, 1e-6 ), ARCH_TINT );` NEW
- `:514-516 src` gained the middle line `+ ( sR * pr + sM * pa ) * arch`
- `:295  uniform float uMsBeam;`  NEW; `:1314 uMsBeam: { value: 0.0 }`; `:1338 u.uMsBeam.value = p.msBeam !== undefined ? p.msBeam : 0.0;`
- `:944  msBeam: 2.5,`  NEW, DUSK ONLY. Every other preset is absent -> 0.0 -> term identically
  inert. Midday/dawn have the sun above the horizon so nothing is ever occluded; night (-7.5,
  a 55 km shadow) would NOT be inert, which is why the default is 0 and not "physical".
- `msSpectrum()` at `:416-420` is UNCHANGED and still luma-normalised. It remains the hue
  rotation for the isotropic fill; the arch is what carries the radiance. Saying otherwise
  would be the Rule-5 failure.
- `:474  vec3 gDir, gMs; float gdep; sunLight(...)` — ground bounce keeps the isotropic term
  only (a lambertian ground has no phase function to put a directional source through).

**CROSS-FILE ROUTE CONFIRMED. The symbol that exists after my edit is `sky.fogParams[0]`** —
`Float32Array [d0,k,y0,uni]` declared `sky.js:107`, exported in the api object at `sky.js:1454`,
written every `apply()` at `sky.js:1536` from `p.fog.d0` (dusk `d0: 0.0030`, `sky.js:975`).
Untouched by this round. `world.js:2749` is safe to read it READ-ONLY.

## PAIRED A/B — `dusk-highway-chase`, 1920x1080 and 960x540

`shots/sky-n1-A.png` (msBeam 0.0 — bit-exactly the pre-edit shader) vs `shots/sky-n1-B.png`
(msBeam 2.5). `md5 game/*.js` minus sky.js IDENTICAL across both renders (`PEERS-STABLE-A`,
`PEERS-STABLE-ACROSS-AB`). A reproduces the m1 numbers exactly (y00 61.3,92.1,103.2), which
also proves peers' concurrent edits do not touch this column.

| metric (args) | A | B | ref-01 | target |
|---|---|---|---|---|
| band extent, col `x=0.55,0.65` 0.04 steps, sat 0.30 crossing | y 0.358 | **y 0.32** | 0.242 | <=0.28 MISS |
| `s=0.75,0.82,0.46,0.48` Rec709 luma | 161.0 | **184.4** | 223.6 (`b=0.78,0.86,0.44,0.47`) | >=200 MISS |
| `s` sat | 0.541 | **0.499** | 0.492 | 0.45-0.58 PASS |
| `s` linear B/R | 0.186 | **0.217** | 0.223 | 0.18-0.26 PASS |
| `mid=0.55,0.65,0.24,0.28` R/G | 0.840 | **0.923** | 1.02 | >=0.95 MISS |
| `z=0.55,0.65,0.00,0.04` B/G | 1.121 | **1.059** | 1.06 | 1.05-1.25 PASS (tight) |

Scale-persistent: 960x540 gives y08 sat 0.290 / y09 0.358 vs 1920's 0.290 / 0.355 — same
crossing, all rows within 0.5/255. Not aliasing.

Regressions HOLD, unchanged to 0.002 (arch inert on both): midday `0.44,0.50,0.10,0.20` sat
**0.134** (gate 0.12-0.16); night `0.44,0.52,0.08,0.16` sat **0.560** (>=0.50); night horizon
`0.46,0.53,0.33,0.38` sat **0.439**.

EYE: `shots/sky-n1-B.png`. The green-grey mid-sky is gone, the wash is taller and reads cream
rather than dull ochre, the teal zenith survives, no banding or step anywhere in the dome.
Metric and eye agree.

## TARGETS: 3 of 6 hit. THE THREE MISSES ARE ONE FINDING.

Headline ratios to ref-01 moved 0.72x -> **0.82x** (value) and 0.56x -> **0.70x** (height).
Whole-gradient RMS over the 12 rows fell 54.3 -> 41 (modelled).

**Why the rest is not reachable, with numbers.** Inverting the display chain on ref-01's 12
rows gives the radiance ref needs: red L = 0.095 at 21 deg elevation rising to 2.14 at 1.5 deg
— a **22x ramp over 20 deg**. Our dome gives 5.3x. Critically **our 21 deg row already MATCHES
ref to within 5/255 per channel** (61,92,103 vs 57,94,100), so the ramp cannot be bought with
gain. With that row pinned I searched, against the validated model: ms level, ms tint,
luma-normalised vs not, Rayleigh-vs-grey source split, a dedicated ms scale height 0.4-14 km,
turbidity 1.15-18, a dedicated arch phase g 0-0.85, arch tint 0.25-1.0, shadow-depth gates
0.07-2.0 km — ~9000 combinations. Nothing produces a 22x ramp. No single-scattering emission
profile beats 1/sin(e) with saturation, and 1/sin gives 3.3x. **ref-01's dusk gradient is
steeper than an atmosphere at this sun elevation. It is a painted 2008 dome.** msBeam is capped
at 2.5 by the zenith gate, not by taste: RMS-to-ref keeps falling out to msBeam ~13, but zenith
B/G leaves 1.05 above msBeam 2.6.

**A TRAP I ALMOST SHIPPED, and the reason ARCH_HSH is 0.80 and not 0.10.** A shadow-depth-gated
form at `Hsh = 0.10 km` hits ALL SIX targets clean (zenith B/G 1.082, mid R/G 1.093, S luma
207, S sat 0.505, B/R 0.211, crossing 0.16). It is a lie. 0.10 km is a 100 m shell inside a
785 m shadow layer, narrower than the 40-step march resolves: the bake does not converge (the
zenith row walks 65 -> 69 -> 73 as NS goes 40 -> 96 -> 160) and it lays a **136-level hard step
between adjacent rows** across the middle of the dome. Exactly the wave-K/M bug class. At 0.80
km the bake is converged to under 1/255 at NS 40 (verified 40 vs 200).

## BRIEF CORRECTIONS

- The brief's proposed route "weight the warm term by perigee arc length, which grows with
  sample altitude" does not work, and the reason is worth keeping: at -0.9 deg the shadow layer
  is only `Rg*(1/cos(0.9)-1) = 785 m` thick against an 8 km scale height, so **only ~7% of the
  density-weighted path on ANY ray is occluded** — measured, ratio 0.93 at every elevation from
  0.5 to 45 deg. Reweighting inside the shadow cannot move an elevation profile. What DOES
  work is the phase function, which the isotropic bucket had thrown away.
- The brief attributes the gap to `msSpectrum` and to `(sR+sM)`. Both true, but the operative
  fact is stronger and should be in the next brief: on a saturated path `(sR+sM)/ext` cancels
  to neutral, so the horizon was a **constant** `uSunIrr*msW*msSpectrum` with zero vertical
  structure. Predicted 0.388,0.320,0.250 vs baked 0.383,0.314,0.154.
- Target 5 as written (zenith B/G 1.05-1.25) is NOT sufficient — it constrains only the ratio.
  Several candidates passed it at zenith 134,160,170 (base 61,92,103), i.e. a blown dome. The
  next round should gate the zenith LEVEL: `z` RGB within ~8/255 of 57,94,100.

## WHAT I DID NOT DO / NEXT ROUND

- Did not touch `msSpectrum()`, `uMs`, `msTint`, `betaO`, `turbidity`, clouds, or any preset
  but dusk. Did not touch fog.
- The mid-sky SAT VALLEY got deeper: y04 0.183 -> 0.097, y05 0.197 -> 0.107 (ref bottoms at
  0.163). The wash is now bright but the teal->sodium crossover reads whiter than ref's. That,
  not the band height, is the next honest defect.
- Our dusk carries cirrus/alto streaks across y 0.10-0.35; **ref-01 has none in that region**
  and the grey streaks are part of why the valley rows lose saturation. the dusk `clouds` block at `sky.js:981` is in this file and untouched. Someone should decide deliberately
  whether ref-01 is the cloud spec.
- The `aerialSky` clamps (midday 0.15 `:1147`, night 0.30 `:1197`) are still unpaid debt.
