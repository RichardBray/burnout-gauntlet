# WAVE P — post.js SSAO determinism fix + tree-wide RNG audit

PIECE: post-determinism   FILE EDITED: `game/post.js` (only file edited in `game/`)
TOOLS EDITED: none (a throwaway `_pxdiff.tmp.mjs` was created at repo root and deleted again)
SCENES MEASURED: `daytime-downtown`, `car-paint-closeup`, `crash-cam`, `dusk-highway-chase`
SOURCE OF THE DEFECT REPORT: `verdicts/wave-p/environment.md` §2a

---

## 0. HEADLINE

The defect is real and it is fixed.
Two cold boots of the identical build in `daytime-downtown` used to differ in **69.90%** of pixels with a **max channel delta of 120 levels**.
After the fix the same pair differs in **0.0048%** of pixels (100 px of 2073600) with a **max channel delta of 9 levels**, and **every metric `tools/_facademeas` prints is identical across boots on all four presets.**

It is **not** byte-identical, and I am not going to claim it is.
The last ~100 pixels are GPU-side, not JS-side, and I prove that below in §4.
The honest headline is: *the JS render state is now bit-identical across boots, and the residual is two orders of magnitude below the resolution of every metric this project scores on.*

---

## 1. THE EDIT — BEFORE -> AFTER, LITERAL

Pre-edit `md5 game/post.js = 83d31b199ade6ef1139769d29dc320ea` (kept byte-exact at `/tmp/post.BEFORE.js`, used as the A leg of §3).
Post-edit `md5 game/post.js = 21160a8f42b2ad03dadc4f8dbdc57f46`.
Peer hash `md5 -q game/*.js | md5 -q` = `397dfb9507180f7a6192068d6ef3aab7` before, `da7cfeaeeeb6d6e2158a9e29065ae6d0` after, and **held constant across every render inside each leg** (re-sampled after each batch).

```
BEFORE  post.js:606-614
            const kernel = [];
            for (let i = 0; i < SSAO_KERNEL; i++) {
              const v = new THREE.Vector3(
                Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 0.92 + 0.08);

AFTER   post.js:618-622
            const rng = makeRng(SSAO_SEED);
            const kernel = [];
            for (let i = 0; i < SSAO_KERNEL; i++) {
              const v = new THREE.Vector3(
                rng() * 2 - 1, rng() * 2 - 1, rng() * 0.92 + 0.08);

BEFORE  post.js:619    const a = Math.random() * Math.PI * 2;
AFTER   post.js:632    const a = rng() * Math.PI * 2;

NEW     post.js:36     import { makeRng } from './util.js';
NEW     post.js:470    const SSAO_SEED = 0x5A0A5EED;
NEW     post.js:460-469  comment block explaining why the seed exists
```

`makeRng` is `util.js:8-16`, the project's existing mulberry32 (`a = (a + 0x6D2B79F5)|0`, `Math.imul` mix, `>>> 0 / 4294967296`) — the same generator the sim, `car.js`, `damage.js` and `world.js` already use.
No new PRNG was introduced.

### WHY THIS IS A DETERMINISM CHANGE AND NOT A QUALITY CHANGE — BY CONSTRUCTION

`makeRng()` returns uniform `[0,1)`, exactly like `Math.random()`.
The three draws per kernel sample are consumed in the same order onto the same intervals (`*2-1`, `*2-1`, `*0.92+0.08`), so the hemisphere is the same hemisphere: same `+z` bias, same `0.08` floor that keeps a sample off the tangent plane.
`SSAO_KERNEL = 20` (`post.js:458`) is untouched, so the sample count is untouched.
`v.normalize()` then `v.multiplyScalar(0.22 + 0.78 * t * t)` (`post.js:625-627`) — the origin-packing law — is untouched.
The 4x4 noise texture still draws one uniform angle per texel and still writes `cos/sin` mapped to `[0,255]` with `b=128, a=255`; `NS = 4`, `RepeatWrapping`, `NearestFilter` all untouched.
No radius, bias, intensity, fade or amount constant was read, let alone written.

The kernel is a *different draw* from the same distribution — that is unavoidable and is the whole point.
§3 measures whether that draw lands inside the population the old unseeded code was sampling from. It does, on every metric.

`./tools/lint.sh` = `lint ok`, run before the edit, after the edit and as the last action.

---

## 2. TREE-WIDE AUDIT — EVERY `Math.random` / `Date.now` / `new Date` / `performance.now` IN `game/`

```
$ grep -rn "Math\.random\|Date\.now()\|new Date(\|performance\.now()" game/
game/util.js:4       comment  "Everything here MUST be deterministic: no Math.random, no Date.now."
game/main.js:362     let last = performance.now();
game/post.js:609     Math.random() * 2 - 1, ... (FIXED, now :622)
game/post.js:619     const a = Math.random() * Math.PI * 2; (FIXED, now :632)
game/camera.js:188   comment  "deterministic value noise (no Math.random)"
game/car.js:24       comment  "no external textures, no network, no Math.random"
game/damage.js:30    comment  "seeded rng only, no Math.random, no Date.now"
```

| hit | render-affecting? | action |
|---|---|---|
| `post.js:609` (was) | **YES** — SSAO kernel, multiplies ambient over the whole frame | **FIXED** |
| `post.js:619` (was) | **YES** — SSAO rotation noise, sets the per-texel dither of the same term | **FIXED** |
| `main.js:362` `performance.now()` | **NO** | **DELIBERATELY LEFT** |
| `util.js:4`, `camera.js:188`, `car.js:24`, `damage.js:30` | n/a, comments only | none |

**Why `main.js:362` is left, and it is not a judgement call.**
It is the wall-clock seed of the *playable* `requestAnimationFrame` loop's variable `dt` (`main.js:363-365`).
It sits **after** the `if (shotMode) { ... return ctx; }` early return at `main.js:307-327` and is therefore never evaluated in any screenshot run.
The screenshot path integrates a fixed `FIXED_DT` for a fixed `steps` count (`main.js:310-311`), renders four identical frames, waits one rAF and renders once more (`main.js:320-322`).
No harness in `tools/` boots without `shot=1`.

**Zero remaining unseeded entropy sources in `game/`.** `Math.random` now appears in the tree only inside comments forbidding it.

---

## 3. NOT A QUALITY CHANGE — PAIRED A/B, `daytime-downtown`, `--band 0.05,0.55`

`node tools/_facademeas.mjs shots/_det-before-dd{1..6}.png --band 0.05,0.55`
BEFORE leg is n=6 cold boots because the before leg is non-deterministic and a point estimate of it would be meaningless.

| run | sobel | sat | lum | dark% | darkAll% | cSpread |
|---|---|---|---|---|---|---|
| before-dd1 | 13.08 | 0.352 | 81.3 | 10.9 | 6.72 | 51.65 |
| before-dd2 | 12.96 | 0.352 | 81.5 | 10.4 | 6.37 | 51.97 |
| before-dd3 | 12.68 | 0.353 | 80.4 | 11.6 | 7.19 | 51.41 |
| before-dd4 | 12.90 | 0.352 | 82.0 | 11.2 | 6.76 | 52.79 |
| before-dd5 | 13.03 | 0.349 | 86.7 | **7.3** | **4.22** | **55.68** |
| before-dd6 | 13.37 | 0.351 | 82.8 | 10.0 | 6.16 | 51.75 |
| **BEFORE RANGE** | **12.68-13.37** | **0.349-0.353** | **80.4-86.7** | **7.3-11.6** | **4.22-7.19** | **51.41-55.68** |
| **AFTER (n=3, all three identical)** | **12.99** | **0.351** | **82.5** | **10.8** | **6.47** | **53.01** |
| inside range? | YES | YES | YES | YES | YES | YES |

**Every single after value lands inside the before range, and none of them is at an edge of it.**
On the two metrics the brief singled out: `dark%` 10.8 sits at the 55th percentile of the before spread `7.3-11.6`; `cSpread` 53.01 sits mid-range of `51.41-55.68`.
`darkAll%` 6.47 and `lum` 82.5 likewise.
This is a determinism change, not a look change.

Worth noting for whoever reads §2a of `environment.md` next: `before-dd5` (dark% 7.3, lum 86.7) is a **single unseeded boot that would have read as a -3.5 point dark% regression** against `before-dd3`, on a frozen tree, with nothing changed. That is the size of the thing this fix removes.

---

## 4. DETERMINISM, EMPIRICAL — BEFORE vs AFTER, ALL FOUR PRESETS

Method: two (three for `daytime-downtown`) **cold** `node tools/shot.mjs` invocations per preset, each of which launches its own chromium process, at 1920x1080. Peer md5 sampled after each batch and held.

| preset | BEFORE pixels differing | BEFORE max Δ | BEFORE >16/255 | AFTER pixels differing | AFTER max Δ | AFTER >16/255 |
|---|---|---|---|---|---|---|
| `daytime-downtown` | **69.90%** (dd1v2) / **71.88%** (dd3v4) | **120** / **88** | 2.05% / 2.61% | **0.0048%** (100 px) | **9** | **0** |
| `car-paint-closeup` | **58.87%** | **91** | 0.27% | **0.0012%** (24 px) / **0.0006%** (13 px) | **2** | **0** |
| `crash-cam` | **85.54%** | **83** | 3.86% | **0.0005%** (10 px) / **0.0023%** (47 px) | **1** | **0** |
| `dusk-highway-chase` | **24.99%** | **73** | 1.57% | **0.0041%** (85 px) / **0.0045%** (93 px) | **7** | **0** |

I measured `daytime-downtown` at **69.9-71.9%**, not the 77-81% quoted in `environment.md` §2a. Same order, same conclusion, different sampling — I am quoting what I measured.

**PNG md5s are still different after the fix, so this is NOT byte-identical, and here is what the residual actually is.**

Two boots' JS render state is now provably bit-identical. `tools/probe.mjs`, `daytime-downtown`, 1920x1080, two consecutive cold boots:

```
run 1 -> {"noise":[254,143,45,225,1],"k0":["0.082598","0.083561","0.185998"],
          "k19":["0.570557","0.472584"],"cam":["325.114379","2.059602","-58.613436"],
          "sceneHash":89541815}
run 2 -> {"noise":[254,143,45,225,1],"k0":["0.082598","0.083561","0.185998"],
          "k19":["0.570557","0.472584"],"cam":["325.114379","2.059602","-58.613436"],
          "sceneHash":89541815}
```

`sceneHash` is a rolling hash over `traverseVisible` of every visible object's world-matrix translation at 1e-3 m. Identical.
Compare the same probe pre-fix, from `environment.md` §2a: `noise [3,156,0,132,13]` vs `noise [102,3,203,25,219]`.

The residual 100 differing pixels in `daytime-downtown` are confined to **rows y=654-687** — a 34-row horizontal strip at the far-distance / horizon band — spread across x=711-1911, at Δ=1 for all but a handful.
That is the signature of GPU rasterisation and depth-resolve tie-breaking at extreme range under ANGLE/Metal (tile scheduling is not order-guaranteed), not of a JS entropy source. There is no remaining JS entropy source to find; §2 is exhaustive.

Chasing the last 100 pixels would mean pinning the driver, not editing the project, and it is **below the resolution of every metric in `tools/`** — see §5, where it moves nothing.

---

## 5. THE TRUE FROZEN-TREE RUN-TO-RUN RENDER NOISE — MEASURED, TO REPLACE THE FALSE `+/-0.04`

`node tools/_facademeas.mjs <n cold boots> --band 0.05,0.55`, post-fix, peer `da7cfeaeeeb6d6e2158a9e29065ae6d0` held throughout.

| preset | n | sobel | sat | lum | dark% | darkAll% | cSpread | sky% | band px |
|---|---|---|---|---|---|---|---|---|---|
| `daytime-downtown` | 3 | 12.99 | 0.351 | 82.5 | 10.8 | 6.47 | 53.01 | 40.2 | 619694 |
| `car-paint-closeup` | 3 | 5.05 | 0.387 | 89.5 | 7.3 | 7.22 | 67.00 | 1.0 | 1024922 |
| `crash-cam` | 3 | 6.10 | 0.344 | 64.4 | 12.6 | 12.36 | 57.13 | 1.9 | 1015877 |
| `dusk-highway-chase` | 3 | 4.78 | 0.342 | 132.9 | 0.1 | 0.07 | 59.86 | 7.9 | 953588 |

**Every replicate of every preset printed the identical line, to the last digit, including the integer band-pixel count.**

> **RUN-TO-RUN RENDER NOISE ON A FROZEN TREE, MEASURED, POST-FIX:
> `0.00` on `sobel`, `strong%`, `sat`, `lum`, `dark%`, `darkAll%`, `cSpread`, `sky%` and band `px`, on all four presets, at n=3 each.
> Pixel-level residual: `<= 0.005%` of pixels, `<= 9/255` max channel delta, `0` pixels above 16/255.**

The project should replace the `+/-0.04` constant with **`0.00` at metric resolution**, plus the pixel-level residual as the honest caveat.
`darkAll%` is quoted to 2 dp and reproduces exactly, so a real effect of `0.01 darkAll%` is now resolvable in **2 renders**, not 8.

**Before this fix, in `daytime-downtown`, the true noise was: `dark%` +/-2.2, `darkAll%` +/-1.5, `lum` +/-3.2, `cSpread` +/-2.1, `sobel` +/-0.35, `sat` +/-0.002** (half-ranges of the n=6 table in §3).
`+/-0.04` was wrong by a factor of ~55 on `dark%`.

---

## 6. CONSEQUENCES FOR THE REST OF THE PROJECT

- `environment.md` §2a's blocking dependency is **CLEARED**. Environment measurements no longer need n>=4 interleaving for the SSAO reason; the n>=2 peer-checked pair is sufficient again.
- `environment.md` §6's retirement of the wave-o `canyon MAXED = +0.9 dark%` ceiling can now be **re-opened cheaply** — 2 renders will resolve it. I did not re-open it; not my piece.
- Any verdict that quoted a single-render delta smaller than the §5 "before" half-ranges, in **any** SSAO-on scene, is still suspect for its own reasons and should be re-derived on the current tree. That is a large set and I am not enumerating it.
- Nothing about the look changed (§3), so no existing *ranking* conclusion is invalidated by this edit — only the precision claims around it.

## 7. WHAT I DID NOT DO

- Did NOT touch any SSAO tuning constant: `radius 3.0`, `bias 0.030`, `intensity 2.0`, `radius2 10.0`, `bias2 0.09`, `intensity2 0.95`, `amount 1.0`, `fadeNear 90.0`, `fadeFar 320.0`, `fade2Near 200.0`, `fade2Far 600.0` (`post.js:601-609`) are all unchanged, and `SSAO_KERNEL = 20` (`post.js:458`) is unchanged.
- Did NOT touch bloom, AgX output, or any other file in `game/`.
- Did NOT touch any file in `tools/`. The `_pxdiff.tmp.mjs` helper was created at repo root and **deleted**; it is not in the tree.
- Did NOT fix `main.js:362` — see §2 for why it cannot affect a screenshot.
- Did NOT chase the residual ~100 GPU-side pixels (§4).
- Did NOT re-derive any wave-o or wave-p look conclusion.
