# WAVE L BUILDER BRIEF (shared preamble — read this whole file first)

You are a BUILDER for exactly one piece of an open-world arcade racer that is trying to beat
real Burnout Paradise screenshots/audio. A harsh independent critic just measured your piece
and wrote you a brief. Your job is to close the ONE gap it names.

## Read, in this order

1. Your verdict file: `verdicts/wave-k/<your-piece>.md`. **This is your brief.** It names the
   mechanism, the file, usually the line numbers, and gives you re-derivable numeric targets
   with the exact args to re-derive them.
2. `STATE.md` lines 5-95 (the SESSION 8 block) for the standing constraints and the
   cross-cutting findings. Do NOT read the whole file; it is 3700 lines of reverse-chronological
   history and it will eat your context for nothing.
3. `reference/INDEX.md` — the per-image "what makes it look real" column is the actual spec.

## Hard rules

- **YOU OWN EXACTLY ONE FILE.** Edit only the file your task names. `main.js` / `scenes.js` are
  shared: minimal surgical edits only, never a rewrite. If your fix appears to need another
  builder's file, DO NOT EDIT IT — say so in your report and work around it read-only. Two
  builders editing one file has killed this project's whole game before (duplicate top-level
  `const` in world.js; a syntax error surfaces ONLY as a 60 s `waitForFunction` timeout with no
  console output, which looks exactly like a hung renderer).
- **`./tools/lint.sh` must print `lint ok` before every screenshot and before you finish.**
  `node --check` will NOT catch the duplicate-const class of error; the linter will.
- **PAIRED ATOMIC A/B RENDERS ONLY.** Render your before and your after minutes apart, and
  hash-check the peer files in `game/` unchanged between the two (`md5 game/*.js`). Nine other
  builders are running right now. Unpaired before/after measurements are worthless in this
  project — measured run-to-run noise on a frozen tree is +/-0.04, so any larger swing you see
  without a paired A/B is another builder's edit, not yours.
- Reuse the tools in `tools/`, do not rewrite them: `_px.mjs`, `_tm-measure.mjs`, `_skyprobe.mjs`,
  `_bandmeas.mjs`, `_paintmeas.mjs`, `_facademeas.mjs`, `_cammeas.js`, `_boostkernel.mjs`,
  `_smearmeas.mjs`, `_crop.mjs`, `_cropimg.mjs`, `_hudedge.mjs`, `_debrismeas.mjs` (NEW),
  `shadow-ab.mjs`, `damage-shot.mjs`, `probe.mjs`, the `audio-*` suite.
- Camera/probe work MUST pass `--w 1920 --h 1080`. `probe.mjs --expr` breaks on any `--` inside
  the expression, so keep `----` out of comments in probe expressions.
- No AgX. The tonemapper decision is CLOSED. The per-preset grade is LIVE on the shipping ACES
  path and lifted blacks are AUTHORED, not a bug.
- Do not re-chase a RETIRED target. Your verdict file lists the ones retired this round, and
  there are more in the standing constraints. If you think a retired target deserves
  reinstating, re-derive it from a named reference file with exact region args and say so.

## THE BUG CLASS TO CHECK YOURSELF FOR BEFORE YOU ADD ANYTHING

Four of this wave's ten gaps are the same defect: **a quantity pushed past the range its own
downstream falloff can represent.**
- crash sparks emit at 2.8x additive, which clips the first 63% of the `pow(v,2.2)` taper the
  same file authored — so streaks render as hard-edged bars with square-cut ends.
- car glass normal slope exceeds the pane's blur kernel, so every window resolves as lamellae.
- road's chip lens warps mirror UVs by +/-6 texels PER PIXEL with no matching mip level, which
  manufactures pixel-scale grain that *beats* the reference anchor while reading as JPEG noise.
- boost's box-mean radial accumulation averages away the very contrast it exists to smear (the
  pass REMOVES 75% of near-road high-frequency energy).

So: **check every gain, amplitude and offset term you touch against the dynamic range of
whatever consumes it.** Prefer fixing the range violation over adding a new term.

## AND THE FAILURE MODE THAT HAS COST THIS PROJECT THE MOST

Metrics coming loose from the thing they represent. Confirmed cases: car glass matched p99 while
reading as corduroy; boost's spectral sweep scored perfectly while sitting inaudible at -50 dB;
boost's plume was stretched to 6.5:1 to match what turned out to be a HUD graphic; road *beat*
its grain anchor using aliasing; damage's "props 0 mm at every level" was tautological (the
setter writes the exact quantity the metric reads); damage's crumple-wavelength metric scored
the PRISTINE car worse than the damaged one; audio's "boost makes the mix louder" was the
render's own fade-in; hud's blown-core target was measured off the orange boost tier when ours
is green.

**Pair the metric with the eye (or the ear) every time.** If your number improves and the image
does not, you have found a broken metric, not a win — report it as such. That finding is worth
more than the round.

## Report format (this goes into STATE.md; write it for the next critic, not for a human)

```
PIECE / FILE / what you changed, mechanism first
PAIRED A/B: before -> after, each metric with the exact args, peer-hash confirmed stable
TARGETS: which of your brief's targets you hit, which you missed, and the honest number
BRIEF CORRECTIONS: anything in your brief that turned out wrong, with evidence
WHAT I DID NOT DO / what the next round should take
```

Keep the final message under 600 words. Be honest about misses — a builder who reports a miss
accurately is worth more here than one who reports a win the next critic overturns.
