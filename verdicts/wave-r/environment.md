# WAVE R BUILDER — environment (`game/world.js`)

Written FIRST, per `tools/WAVE-R-ADDENDUM.md` §3, then appended to as work proceeded.

---

## 0. STEP-ZERO AUDIT — ABANDONED ROUND-13/14 EDITS IN `game/world.js`: **NONE. PROVEN, NOT ASSERTED.**

`game/world.js` md5 on entry = **`023e9cd05d5b6757112340855d21390a`**, mtime `Aug  3 07:56:59 2026`.

That md5 is **exactly** the md5 `verdicts/wave-q/environment.md` §0 declares it audited (`023e9cd05d5b6757112340855d21390a`),
and §3 of that verdict rule-5-greped every literal in the file against the tree and returned **RULE-5 STATUS: CLEAN**.

Three independent git checks, all empty:

```
git diff e1c1e82 HEAD --stat -- game/world.js   -> empty (baseline == HEAD)
git diff HEAD        --stat -- game/world.js   -> empty (HEAD == worktree)
```

So the file has not moved one byte since the wave-Q critic rule-5-cleared it. `world.js` is NOT
in the addendum's list of files carrying abandoned round-13 edits, and that list is now confirmed
correct for this file by content, not by absence-of-mention.

**Per-item decisions (all KEEP, all measured by wave-Q §3 and re-verified by md5 identity):**

| `file:line` | literal | decision |
|---|---|---|
| `world.js:895` `const AIR_D0_FALLBACK = 0.0016;` | 0.0016 | KEEP — wave-Q §3 verified, unchanged since |
| `world.js:896` `const AIR_GAIN = 8.2;` | 8.2 | KEEP — wave-Q §3a re-derived the 200 m fixed point (crossover 199.55 m) |
| `world.js:897` `const AIR_D_START = 55.0;` | 55.0 | KEEP — wave-Q §3/§4 measured its A/B |
| `world.js:898` `const AIR_W = 0.85;` | 0.85 | KEEP |
| `world.js:902` `const AIR_D_MAX = 0.0144;` | 0.0144 | KEEP — wave-Q §3a verified the clamp algebra |
| `world.js:954-956` the `de`/`fq`/mix airlight block | verbatim as wave-Q quoted | KEEP as the BASE of job 1 |
| `world.js:2712-2717` pier row, `CylinderGeometry(1.5, 1.7, 1, 12)`, 44 @ 60 m | as quoted | job 2 target |

**No debug uniform is forced, no bypass or early-return exists, no constant is nudged without a
comment.** One comment-vs-code hazard is present and I am recording it rather than silently
inheriting it: `world.js:944-947` states the soft-start "can only ever REMOVE optical depth
relative to the old form ... so nothing downstream sees a larger number than it did before."
**Wave-Q §3b already proved that argument FALSE** (`uHazeD` rose 1.367x at the same time, so
`tau_new/tau_old` asymptotes to 1.367x, peak mix excess +0.0137 at 292 m). The CONSTANTS are right
and the 200 m fixed point is real; the prose is wrong. I am not reverting a constant for it — I am
correcting the comment as part of job 1, since job 1 edits that exact block.

**Intent this round, stated up front:**
- JOB 1 — `world.js:955`: replace the single achromatic extinction coefficient with a per-channel
  `kq = vec3(0.625, 1.0, 1.389)` (lambda^-4 at 610/550/450 nm, normalised on green). Target
  `cSpread` into 60..72 with far-band sobel 12-22, `lum` 78-90, `darkAll%` 6.0-8.5, road MAD > 12.
- JOB 2 — `world.js:2713-2714`: reduce the pier row's occluded solid angle by radius reduction.
  Target `anisAC3` into 0.09..0.17 with `resRMS` 5.5-6.1 and mean 80-85, cost measured on BOTH
  `daytime-downtown` AND `dusk-highway-chase` (plus `crash-cam`).
- `game/hud.js` will NOT be touched, and `world.js:18 layout.roadW` will NOT be changed — the hud
  builder reads it concurrently. I found no reason to want to change it.

---
## 1. BASELINE (A LEG), MY OWN, ON TODAY'S TREE

`game/world.js` md5 `023e9cd05d5b6757112340855d21390a`, mtime `Aug  3 07:56:59 2026`.
Peer digest `md5 game/*.js | grep -v world.js | md5 -q` = **`852913bb27ed7d91503ee8656df0a54b`**
(wave-Q's was `8f018c0b…`; peers have moved this round, which is exactly why I re-baselined rather
than quoting wave-Q's absolutes). `./tools/lint.sh` -> `lint ok`.

| metric | args | mine (A) | wave-Q | agree? |
|---|---|---|---|---|
| `cSpread` | `_facademeas shots/r-env-A1.png --band 0.05,0.55` | **53.03** | 53.01 | yes |
| `sobel` / `sat` / `lum` | same | 12.99 / 0.351 / 82.5 | 12.99 / 0.351 / 82.5 | exact |
| `dark%` / `darkAll%` | same | 10.8 / 6.47 | 10.8 / 6.47 | exact |
| band `px` | same | 619719 | 619694 | +25 px (peer drift) |
| far-band `sobel` | `--sky 999,110 --x 0.560,0.750 --band 0.180,0.440` | **17.40** | 17.41 | yes |
| road MAD | `shadow-ab.mjs` | **14.8256** | 14.8242 | yes |
| `anisAC3` / `resRMS` / `mean` | `_stripemeas … 0.1094 0.1563 0.6111 0.6852` on the cc-0.090 eval shot | **0.273 / 5.7 / 80.7** | 0.271 / 5.73 / 80.9 | yes |

**BEFORE-STATE CHECK, per the one-sidedness rule: the A leg FAILS both targets.** `cSpread` 53.03 is
below the 60..72 band; `anisAC3` 0.273 is above the 0.09..0.17 band. Neither target is a rubber stamp.

### 1a. MANDATORY `_anisonull` PASS — AND IT PRODUCES A CORRECTION TO THE TARGET BAND'S FLOOR

`node tools/_anisonull.mjs synth`, then `_stripemeas` at the **identical** patch fractions
`0.1094 0.1563 0.6111 0.6852` (= 90x81 px at 1920x1080), so the shape null is measured at the shape
actually used:

| synth field | resRMS | anisAC1 | **anisAC3** |
|---|---|---|---|
| `iso` (white noise, isotropic, per-pixel) | 34.67 | 0.033 | **0.014** |
| `isoblur` (3x3-box white noise — **isotropic but MULTI-PIXEL**) | 14.97 | 0.028 | **0.109** |
| `vert` (forced column comb) | 34.21 | 0.957 | **0.721** |
| `horiz` (forced row comb) | 33.19 | -0.966 | **-0.693** |

`anisAC3`'s null is 0.014 for a per-pixel isotropic field — clean, and it is NOT a `sqrt(H/W)` tool.
**But for an isotropic field whose correlation length exceeds one pixel the null rises to 0.109**, and
a rendered reflection at `resRMS 5.7` is firmly in that class, not the white-noise class.

**CONSEQUENCE, and it is a correction to my own brief: the target band `0.09 .. 0.17` has its FLOOR
BELOW the isotropy null of the statistic at this patch (0.109).** Anything measuring <= ~0.11 here is
not distinguishable from isotropic, which is precisely why the mesh-hidden floor is 0.097 — that is
the row's contribution reaching zero, not going negative. So the *usable* band is **0.11 .. 0.17**,
and an arm at 0.13 is already within noise of "the pier row is gone". Overshoot below 0.11 buys
nothing measurable and costs visible pixels. **I am therefore aiming at the middle-to-upper part of
the band with the smallest possible visible cost, not at the floor.**

---
