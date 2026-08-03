# WAVE R BUILDER — hud / `game/hud.js`

## STEP 0 — ABANDONED ROUND-13/14 EDIT AUDIT. RESULT: **NONE. PROVEN BY md5, NOT BY READING.**

`md5 game/hud.js = f0fd0f533c0a8988f001b2994d75c58b`, mtime `3 Aug 06:47`, taken before I touched anything.

`verdicts/wave-q/hud.md:4` records the file the wave-Q critic measured as
`md5 game/hud.js = f0fd0f533c0a8988f001b2994d75c58b` ("= the wave-P builder's B, byte-identical").

**The two hashes are equal, so `game/hud.js` is byte-identical to the wave-P builder's shipped B leg
and rounds 13 and 14 left ZERO edits in this file.** There is nothing to keep and nothing to revert.
`game/hud.js` is not on the addendum's §0 list of files carrying abandoned edits either, and this
md5 identity is the independent confirmation of that list for my file. Wave Q's rule-5 sweep
(`verdicts/wave-q/hud.md:34-46`) greped every wave-P literal to its claimed value on this exact
byte-stream, so every constant in the file is already accounted for by a written verdict.

Nothing reverted. Nothing inherited silently. Baseline for this round = the wave-Q numbers, as
instructed (no re-baselining; sky-lighting `333e59c` refused `skyGain` and moved
`scene.environment` <= 0.3%).

## WHAT I INTEND TO CHANGE

One thing: `hud.js:1403-1404`'s building-parcel setback, which is derived from `layout.roadW`
(`world.js:18`, 20 m) — a constant with no relationship to the four constants that actually draw
the road. Replace it with a corridor half-width derived from the SAME `ROAD_W` / `ROAD_CASE` /
`ROAD_WR` / `ROAD_WJ` / `ROAD_BOW` terms `strokeRoad` uses, at their worst case, per road class.
No `world.js` edit (environment builder owns it concurrently); if the correct fix needs one it goes
in this file as a HANDOFF.

---

(appended below as work proceeds)
