# WAVE N BUILDER REPORT — hud / `game/hud.js` (r14)

## PIECE / FILE / WHAT CHANGED, MECHANISM FIRST

**1. Minimap — the black floor was a GRAIN PASS, not the palette.**
`bakeMapTile`'s grain was `grainTex` (64x64 of grey 120-180 at a constant alpha
16/255) composited **source-over twice** (alpha 1, then 0.8 at 2.7x). That is a pure
additive lift of ~0.113 toward luma 150, i.e. a hard floor of ~17 on every pixel of the
card. The measured histogram agreed exactly: p01 16.3, 1.14% below 16 — a wall one code
value above the threshold. Darkening the palette alone moved p01 only 16.3 -> 14.3
because this pass put it straight back. It is the wave-M/K bug class: a lift term with no
range left for the thing underneath. Now composited **`overlay`**, which is zero-mean
about grey 128 — grain still modulates midtones and road fill but scales with signal.
Then the palette itself was re-ranged: ground/roofs/canopy/casing down, road fill up.

**2. Boost bar tear — the brief's mechanism was right about the fray but wrong about the
cause of the inversion.** See BRIEF CORRECTIONS.

## PAIRED A/B — `shots/hud-n-before.png` vs `shots/hud-n-after.png`

Rendered back to back, `node tools/shot.mjs --scene hud-overlay --w 1920 --h 1080`.
Peer `md5 game/*.js` (all 14 non-hud files) **identical across both renders** — verified,
`PEERS-STABLE-ACROSS-AB`. (Peers moved a lot mid-round: one intermediate render had the
road rendering as flat red/yellow bands and drove the rail baseline from 23 to 130. Only
this final pair is quotable.) `hud-n-after-b.png` repeats: ratio 0.72, minimap identical.

The "before" file was reconstructed by reverse-applying every edit and **verified against
the wave-M numbers**: it reproduces p01 16.3 / <16 1.16% / sat 0.043 / p99 212.4 and
rmsHF 3.37/5.65 ratio 1.68 and topRail 2.27 / bottomRail 1.54 / leftCap 0.33 / burnFront
2.37 / blown 17.26. Faithful.

| metric (exact args) | before | after | target |
|---|---|---|---|
| `_px.mjs --region minimap=0.8125,0.9896,0.750,0.963` p01 | 16.3 | **4.9** | <=6 OK |
| same, <16 | 1.16% | **15.53%** | >=7% OK |
| same, sat | 0.043 | **0.059** | >=0.055 OK |
| same, p99 | 212.4 | **235.8** | >=220 OK |
| same, p50 | 78.7 | 43.6 | (retired; ref01 52.8, ref03 83.9) |
| `_hudlick.mjs 0.057,0.224,0.883,0.954` top rmsHF | 3.37 | **4.08** | 3.9-4.2 OK |
| same, bot rmsHF | 5.65 | **2.96** | 2.6-3.0 OK |
| same, ratio bot/top | 1.68 | **0.73** | 0.60-0.80 OK |
| same, rmsLF top/bot | 2.35/1.89 | 2.47/3.43 | (ref 4.05/2.38, 3.31/1.73) |
| `_hudedge.mjs 0.057,0.224,0.884,0.944` rimTop/rimBot sat | 0.573/0.448 | **0.517/0.535** | split <=0.02 OK (0.018) |
| same, blown>=250 | 17.26% | **18.95%** | 17-27 OK |
| same, topRail %H | 2.27 | 2.14 | hold (ref 2.29/1.90) OK |
| same, leftCap %W | 0.33 | 0.33 | hold OK |
| same, burnFront %W | 2.37 | 2.36 | hold OK |
| same, bottomRail %H | 1.54 | **1.11** | hold — **MISSED** |

## CONSTANTS — BEFORE -> AFTER, with file:line (post-edit lines)

Fray eraser, rewritten as a per-RAIL registration (`hud.js:640-680`):
- `:660`  `ftH = ih * 3.0` -> `ftH = ih * 1.30`
- `:658`  NEW `FRAY_R0 = 0.40` (inner edge of the eroded band, in ih from centre)
- `:659`  NEW `FRAY_TOP_A = 0.85, FRAY_BOT_A = 0.45`
- `:607/:612` (old) `drawImage(frayTex, px, cy - ftH*0.5, ftW, ftH)` and
  `(..., cy - ftH*0.66, ftW2, ftH*1.3)` -> four draws at `cy - FRAY_R0*ih - H` and
  `cy + FRAY_R0*ih`, alphas `0.78*` / `0.42*` the two rail gains.

Lick generator (`hud.js:577,587,608-612`):
- `:577`  NEW `LICK_TA = 1.15, LICK_BN = 0.42, LICK_BW = 2.60` (were an implicit 1.0/1.0/1.0)
- `:587`  NEW `LICK_LT = 0.060, LICK_LB = 0.140` (low-frequency bow, new term)
- `LICK_N = 0.170, LICK_W = 0.045, LICK_F = 1.9` UNCHANGED (`:559`)

Body colour ramp (`hud.js:739,740,750,751`):
- `:739/:740` tip stops `cy -/+ ih*0.13` -> `cy -/+ ih*0.165`
- `:750` `st(cy + ih*0.40), col.core` -> `st(cy + ih*0.360), col.core`
- `:751` `st(cy + ih*0.50), col.edge` -> `st(cy + ih*0.425), col.edge`
- top stops `0.50/0.40` UNCHANGED. (Note: the r7 comment above these claims a "+/-0.22"
  tip plateau; the code has always read 0.13. Rule 5 — the comment was wrong, not the code.)

Minimap tile palette:
- `:1180` `ROAD_CASE = {freeway:12, arterial:9, street:6, lane:3.5, loop:4}` ->
  `{freeway:15, arterial:11.5, street:7.6, lane:4.4, loop:5}`
- `:1194-1195` `ROAD_FILL` `#dcb45c/#f1f2ec/#d9dcd5/#a8aca4/#c4c8c0` ->
  `#e6bd60/#f7fbf0/#e9efe2/#b6bcae/#d2d8c9`
- `:1197` `C_LAND = '#3a413c'` -> `'#0a0c09'`
- `:1198` `C_WATER = '#15303d'` -> `'#091820'`
- `:1199` `C_PARK  = '#2e4a2a'` -> `'#0e1c09'`
- `:1498` cell patchwork `v = 44 + round(tone*30)` -> `v = 5 + round(tone*34)`
- `:1546` tree crowns `v = 66 + round(rnd()*46)` -> `v = 28 + round(rnd()*56)`
- `:1556` footprint shadow `'rgba(3,6,7,0.62)'/'rgba(4,8,9,0.46)'` -> `'rgba(1,2,3,0.88)'/'rgba(2,4,5,0.78)'`
- `:1565` roof `v = 60 + round(tone*84)` -> `v = 16 + round(tone*126)`
- `:1580` roof shaded edge `'rgba(0,0,0,0.20)'` -> `'rgba(0,0,0,0.45)'`
- `:1585` road casing `'rgba(7,11,11,0.88)'` -> `'rgba(1,2,2,0.98)'`
- `:1638` grain pass composite `'source-over'` -> `'overlay'` (grainTex itself untouched)

Card presentation:
- `:1967` sheen `'rgba(214,232,248,0.10)'` -> `0.038`; `:1968` `0.02` -> `0.008`;
  `:1969` `'rgba(0,0,0,0.14)'` -> `0.26`
- `:1975` vignette outer `'rgba(0,0,0,0.58)'` -> `0.72`
- `:1984` bevel `'rgba(236,246,255,0.30)'` -> `0.13`; `:1985` `0.05` -> `0.02`
- `:2003` frame keyline `'rgba(206,220,234,0.55)'` -> `0.14`

## BRIEF CORRECTIONS (evidence)

**The fray-eraser mis-registration is REAL and the brief's geometry is exactly right, but
it is NOT what inverted the tear ratio.** `makeFrayTexture` confines every puff to within
40 px of one long edge of its 512x128 sheet, so a copy only erodes in the top 31% and
bottom 31% of its destination rect. Copy 2 at `cy - ftH*0.66`, height `ftH*1.3`, did land
its bands at [-1.98,-0.759] and [+0.703,+1.92] ih, missing the top rail. Fixing the
registration alone (`_hud-n1.png`) moved rimTop/rimBot sat 0.573/0.448 -> 0.470/0.495 —
**it fixed target 3 on its own** — and moved top rmsHF by 0.02 and bot rmsHF by +0.35.
The ratio got *worse*, 1.68 -> 1.81.

**The real cause of the inversion is `_hudlick`'s own threshold, and it is a property of
the composite, not of the generator.** Control render with the bottom rail fed the TOP
rail's noise verbatim (identical `nt`/`wt` on both, symmetric geometry): top rmsHF 3.32,
bot 5.22, ratio 1.57. Same curve, 1.6x the measured tear. Cause: the scene above the bar
is road at luma ~24 and below it is ~0, so the 50%-of-plateau threshold is 134 on the top
rail and 123 on the bottom; the lower threshold puts the bottom crossing further out into
the additive halo's soft foot, where the flecks live. Any future round that tries to
equalise the two rails geometrically will measure them unequal. Hence one explicit gain
per rail, and hence the coupling below.

**Targets 2 and 3 are coupled and partly antagonistic.** `_hudedge`'s rim sample is not a
fixed row — it is wherever the profile crosses 50%, which moves inboard on whichever rail
scatters less. Cutting the bottom rail's excursion to hit the tear ratio pushed rimBot sat
to 0.364. Recovered by pulling the ramp's lower core/edge stops in to 0.360/0.425, which
cost `blown>=250` (17.3 -> 14.7); that in turn was recovered by widening the tip plateau
0.13 -> 0.165 (blown 18.95). Any next round changing one of these three must re-check all
three.

**Confirmed from the brief:** `_hudlick.mjs` is a real contour metric and was used
throughout. The wave-K 10-strip sd was not used. No "unfilled track" was built. HUD was
not graded.

## WHAT I DID NOT DO

- **`bottomRail` 10-90 width 1.54 -> 1.11 %H is a real regression** (refs 1.75 / 1.62).
  `_hudedge`'s vertical profile is column-averaged, so that width is essentially
  proportional to the bottom rail's total excursion — the same quantity target 2 required
  me to halve. I bought back what I could with the new low-frequency bow term
  (`LICK_LB`: 0.91 -> 1.11 %H) but pushing it further (`LICK_LB = 0.175`) made the rail
  read as rolling hills and cost rimBot. Raising `FRAY_BOT_A` to 0.95 makes it worse on
  both counts (bottomRail 0.95, bot rmsHF 1.31). **The honest number is 1.11 and I could
  not hit the hold and the tear ratio at the same time.** Next round should decide which
  one it actually wants, or find a soft-foot term that widens the averaged profile without
  adding contour excursion.
- Eye check: with the tear ratio at 0.72 the bottom rail reads slightly too clean/hard
  against ref03, where both rails are soft fuzzy green. The number is right; the rail is
  marginally over-corrected.
- Minimap `<16` is now **15.5%**, above both refs (7.17 / 11.08). The target was a
  minimum, so this passes, but the card is at ref01's level of darkness, not ref03's
  (p50 43.6 vs 83.9). If the next critic wants ref03's district, lift the roof range, not
  the ground.
- The left cap is still a pale-outlined plate with three ribs (verdict item 4, cosmetic).
  Not touched.
