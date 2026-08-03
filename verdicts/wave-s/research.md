# wave-s / research - Burnout Paradise handling research

## Contract

I own exactly one file: `docs/BURNOUT-HANDLING.md` (new). I write NO game code.
I read `game/physics.js` to map researched numbers onto TUNE constants, and I do not edit it.

This piece cannot move a rendered pixel. Per the brief's regression-gate clause ("If your change
cannot move a pixel (a new tool, a doc), say that and skip this"), I take no before/after shots.

I take NO frame-time measurements at all. Not my piece, and I am running concurrently with three
peers, which invalidates them anyway.

## Tree check (brief process rule 2)

Before starting: `docs/` was empty, `verdicts/wave-s/` did not exist. No inherited unmeasured
edits in my ownership. Peers hold `game/*.js`; I never touch those.

## Method log

### Step 1. Frame-by-frame video measurement: ATTEMPTED, PARTLY SUCCEEDED

An earlier draft of this verdict said the attempt failed outright. That was written before I checked
the sandbox properly and it was wrong, so it is corrected here rather than left standing.

The sandbox does have `ffmpeg`, `ffprobe` and `yt-dlp`, and it does have network egress. I pulled a
180 s section of a 60 fps capture of the original PC game (YouTube `u6G4BlOfznU`, section 120-300 s,
format 298, 1280x720, 11009 frames) and stepped it frame by frame with numpy in a venv at
`/tmp/bpvenv`. Scripts live in `/tmp/bp/` (`track.py`, `track2.py`, `compass.py`, `odo.py`,
`analyze.py`, `combined.py`); they are scratch and deliberately not committed.

Burnout Paradise's HUD has **no speedometer**, which I confirmed on full frames. So the direct
approach was not available and I had to build instruments out of other HUD elements.

**Two instruments worked and produced the measured numbers in the doc:**

- The `MILES DRIVEN` odometer steps in exact 0.1 mi units, so a step interval is exactly 160.934 m
  of path with no scale assumption anywhere. Gave 40.2 +- 1.5 m/s free-roam cruise from a 4.00 s
  interval, cross-checked by reading the digits off a 10 Hz frame grid.
- The race HUD's linear compass tape is a self-calibrating heading instrument: glyph spacing gives
  1.4142 deg per tape pixel (E at 67.80 px, W at 195.08 px, 127.28 px per 180 deg), and sub-pixel
  1-D phase correlation on a high-percentile-gated luminance profile tracks its travel. Gave the
  yaw-rate figures.
- The boost bar's filled length gave a full-bar drain time of 8.7-8.9 s, which independently
  corroborates the published "exactly 8 seconds" to within 11%.

**Three things failed and are documented in the doc so nobody repeats them:**

- Minimap-as-speedometer. Fails three ways: frame-to-frame motion (~0.1 px at 60 fps) is below the
  correlation noise floor; the map zoom is not constant between free roam and races, so any px-to-m
  scale is mode-specific; and during races the map is route-anchored rather than car-centred.
- Minimap arrow as a heading instrument. About 70 mask pixels; its covariance major axis runs across
  the chevron rather than along it, so the obvious moment method points 90 deg wrong, and the
  skewness fix was bistable by ~128 deg. Not used for any number.
- Boost camera A/B from footage. My non-boost/boost frame pair was confounded on speed (the chase
  cam pulls back with speed independently of boost), had a collision in progress, and the red mask
  picked up sparks and a second car. **I report no camera number.** The brief said camera numbers
  matter as much as physics ones and I did not get them.

Also worth recording as a trap: `ffmpeg -ss` placed before `-i` is a keyframe-approximate seek and
shifted absolute timestamps by up to ~0.9 s between runs. Only intervals inside a single decode pass
are trustworthy.

### Step 2. Web research via Firecrawl

Best source by a wide margin is community datamining of the game's own attribute files, which
recovered the developers' real attribute names: `MaxSpeed`, `MaxBoostSpeed`, `BoostKickAcceleration`,
`DownForce`, `DriftAngularDamping`. Every number in the doc carries a provenance tag
(`MEASURED-BY-ME` / `PUBLISHED` / `CONSENSUS` / `MY-ESTIMATE` / `NOT FOUND`) and a confidence.
Where sources disagreed I gave the range and did not average.

Honest gaps, all tagged `NOT FOUND` rather than filled in: no 0-60 figure exists for any Paradise
car (the community measures 0-100 mph); no published yaw-rate-versus-speed curve; no numeric drift
scrub figure; no boost camera figures; no light-scrape-versus-hard-hit speed cost.

The brief's drift hypothesis was confirmed with one correction: there is definitively **no drift
button** in the published binding table, but the competitive entry is a **brake tap** while loaded in
a turn, not only the handbrake.

### Step 3. physics.js mapping

Final section of the doc maps each researched quantity to a `TUNE` key or code path with verified
`file:line` references, and flags what our model has no term for. All line numbers and literals were
checked against the file with `grep`/`sed`, not from memory (brief rule 5).

Headline routed findings, none of which I acted on because I do not own the file:

1. `TUNE.boostDrain = 0.19` drains a full tank in 5.26 s; the published Speed-class figure is exactly
   8.0 s, so the value should be 0.125. Ours is 34% too fast. Cleanest actionable item found.
2. Boost has the ceiling-versus-acceleration split backwards. Ours lifts the ceiling 33%
   (`vMaxBoost/vMax = 104/78`); Burnout's roster ratio is near 1.0 and the felt event is
   `BoostKickAcceleration`, an initial burst we have no term for.
3. `physics.js:111` lets the car boost on a sliver of tank; Speed-class Paradise cars cannot boost at
   all below a full bar.
4. No event-driven boost economy at all: no burnout, no Burnout Chain, no gas station, no barrel roll
   or takedown refill. `boostRefill` is a passive time-based term Burnout does not have.
5. No drift state. `state.slip` is an algebraic function of current yaw rate and speed, so a drift
   cannot persist through centred steering and cannot survive the brief countersteer that Paradise
   players use *inside* a drift to lengthen it. Also no scrub at all.
6. Collision has one tier (`*= 0.62`) with no angle or closing-speed dependence, and `state.crashed`
   is declared and reset but **never assigned true anywhere in the file**, verified by grep.
7. `state.vy` and `state.airborne` are dead: never integrated, never set, and `pos.y` is forced to 0.
8. The yaw curve has the right shape but a shallow falloff (authority only halves between the peak at
   `gripLow` and `vMax`), so it does not go straight at speed as much as the reference does. The
   `1.35` coefficient at `:139` is a bare literal with no provenance.

### Outcome

Deliverable is `docs/BURNOUT-HANDLING.md`, including a "HOW TO MEASURE THIS IN OUR GAME" section
with 12 concrete headless procedures against `game/physics.js` that a critic can run literally.
No game code changed. One commit, my two files only.
