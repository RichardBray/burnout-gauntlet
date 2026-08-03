# WAVE K VERDICT — hud (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/hud.js

PIECE: hud   ROUND: k1
SCENE: hud-overlay   OURS: shots/hud-k1.png (+ hud-k1b.png)
REF: reference/hud-overlay-01.jpg, -03.jpg, boost-blur-04.jpg

BLIND CALL: picked the reference as real, on the boost bar. Ours has a **dead-straight top rail
sitting over a lumpy bottom rail** — two isolated rounded bulges on an otherwise flat
underside. Nothing that emits reads smooth on one side and bumpy on the other. Both reference
bars are torn at the same frequency and amplitude on *both* rails, with tendrils that detach
from the body. Ours reads as a progress bar with a glow filter; theirs reads as a burning wick.

VERDICT: real wins

## NUMBERS (all `_hudedge.mjs <file> <x0,x1,y0,y1>`; column metric = `_px.mjs` 10 equal-width `--region` strips, sd of p50 luma)
- Core box, ours `0.057,0.224,0.884,0.944`: rgb 232,243,179 sat 0.264 p50 245.5
  **blown250 17.17%**. ref01 `0.0875,0.231,0.872,0.917`: sat 0.280 p50 247.7 **27.35%**.
  ref03 `0.094,0.336,0.869,0.925`: sat 0.326 p50 244.2 **18.99%**.
- Rim: ours sat 0.509 B/G 0.491 — ref01 sat 0.507 B/G 0.493. Near-exact.
- Edges (%H / %W): ours 1.76 / 1.43 / 0.33 / 2.36. ref03 1.90 / 1.62 / — / 2.22.
  ref01 2.29 / 1.75 / 0.36 / 2.67. All in range.
- **LICK-ZONE SD — THE GAP.** top band `0.0573,0.2292,0.8639,0.8843` vs bottom
  `...,0.9528,0.9731`: ours **4.0 / 28.2 = ratio 7.0** (second render 4.2 / 28.6 = 6.8).
  ref01 (`...,0.8411,0.8611` / `...,0.9256,0.9456`) 19.2 / 14.9 = **0.78**.
  ref03 (`...,0.84,0.86` / `...,0.9263,0.9463`) 14.1 / 10.1 = **0.72**.
- Core interior along-axis: ours CV 0.010, ref01 0.011, ref03 0.011 — matched, NOT the gap.

## CLAIMS CHECKED
- Reproduced: all four edge widths (1.76/1.43/0.33/2.36 vs claimed 1.78/1.44/0.33/2.32), the
  rim B/G 0.487->0.491, the core blown. r8's cited ref anchors come from `hud-overlay-03`; it
  never said so.
- **Could not reproduce "notch RMS 3.2 vs ref 1.2" — NO NOTCH TOOL EXISTS ON DISK.** r8 fixed
  the four-edge tool but left this metric a throwaway again.

## BIGGEST REMAINING GAP: `game/hud.js:559-560` — hard-coded ASYMMETRIC lick amplitude
Top `ih*(0.075*nt + 0.05*wt^2)`, bottom `ih*(0.185*nb + 0.155*wb^2)`. r8 fixed the bottom's
*frequency* (0.33->0.38) but **never touched amplitude**, so the bottom throws 2.5-3.1x the
top's excursion and the top rail is effectively ruled. Raise the top's coefficients to parity
and lift both toward a common ~0.13/0.11 so each rail's per-column sd lands in the reference
band.

## TARGETS FOR NEXT ROUND
1. Lick-zone sd **14-19 on BOTH rails**, ratio bottom/top **0.7-1.0** (args above; **render
   twice**, it is noise-phase dependent).
2. HOLD: four edge widths, rim sat 0.50-0.52 / B/G 0.48-0.50, blown250 within 17-27%.
3. Minimap contrast, `_px.mjs --region minimap=`: ours (`0.8125,0.9896,0.750,0.963`) p50 78.7
   p99 212 sat 0.041 sub-16 1.14%; ref01 (`0.747,0.931,0.720,0.931`) p50 51.2 p99 255
   sat 0.091 sub-16 11.08%. **Ours is a flat grey vector card with no blacks and no whites.**

## RETIRED/CORRECTED
- **"blown core 2.75-3.87%" is RETIRED as a HUE ARTEFACT.** It was taken off `boost-blur-04`,
  whose bar is the *orange* boost tier; luma weights G at 0.72 and R at 0.21, so an orange bar
  measures 0% blown while an identically-hot GREEN bar measures 19-27%. Corrected green-tier
  target 17-27% from `hud-overlay-01`/`-03` at native resolution. **Ours at 17.17% already
  meets it — this gap is CLOSED, do not chase it further.**
- **Do NOT `sips -Z 1920` `hud-overlay-01` (1600x900) or `-03` (1280x800)** for any
  spatial-frequency metric; upscaling fake-smooths them. Use `boost-blur-04` (natively
  1920x1080) or measure at native res.
- Noted, NOT scored: the reference bar's *unfilled* track is a real HUD graphic (dark ruled
  channel with hatched segment cells, `hud-overlay-01` x395-600, y775-832) that ours lacks
  entirely. Cannot be judged from our shot — we capture at BOOST READY, i.e. full bar.
  **Capture at partial boost before briefing it.**
- Confirmed per standing constraints: no grade/tonemap gap reported on the HUD.
