# Burnout Paradise handling reference

Research target for wave S: turn Burnout Paradise's control scheme and handling model into numbers a builder can match.

This document is a reference, not an argument.
Every number carries a provenance tag and a confidence.
Where sources disagree the range is given and no average is taken.

## How to read the provenance tags

| tag | meaning |
|---|---|
| `MEASURED-BY-ME` | I measured it from video frames in this session. The clip, the timestamps, the instrument and the error bar are all stated. |
| `PUBLISHED` | Stated as fact by a documented source, including community datamining of the game's own attribute files. |
| `CONSENSUS` | Repeated by the community without a traceable measurement. Treat as a direction, not a value. |
| `MY-ESTIMATE` | I derived it. The derivation is shown so a critic can reject the reasoning rather than argue with the number. |
| `NOT FOUND` | I looked and could not establish it. Stated explicitly rather than filled in. |

A clearly-labelled estimate is useful.
An unlabelled one poisons the next three rounds, so there are none here.

## FRAME MEASUREMENT: ATTEMPTED, PARTLY SUCCEEDED, PARTLY FAILED

The brief asked me to try frame-by-frame video measurement and to say so plainly if I could not.
Here is exactly what happened, including the failures, because a fabricated measurement is the worst
outcome available in this project.

**What worked.** This sandbox has `ffmpeg`, `ffprobe` and `yt-dlp`, and it has network egress.
I downloaded a 180 s section of a 60 fps capture of the original PC game
(YouTube id `u6G4BlOfznU`, "Burnout Paradise (PC) No Commentary Gameplay", section 120-300 s,
format 298, 1280x720, 60/1 fps, 11009 frames) and stepped it frame by frame with numpy.
Two instruments came out of it and both are used below.

**Instrument A, the odometer.** Burnout Paradise's HUD has **no speedometer at all**, which I
confirmed by inspecting full frames.
It does have a `MILES DRIVEN` field that steps in exact 0.1 mi units, so the interval between two
consecutive steps is exactly 160.934 m of path travelled.
That yields an absolutely-calibrated ground speed with no scale assumption, no map calibration and
no field-of-view guess.
The only thing measured is *when* it steps.

**Instrument B, the race compass tape.** During events the HUD carries a linear compass tape with
`E`/`S`/`W` glyphs that slides horizontally behind a fixed centre marker, so tape translation is car
heading change.
It is self-calibrating: I recovered the scale from the glyph spacing in the label band, getting
E at 67.80 px and W at 195.08 px, so 127.28 px per 180 deg, i.e. **1.4142 deg per tape pixel**.
Tape displacement between frames was measured by sub-pixel 1-D phase correlation on a
high-percentile-gated luminance profile, which is necessary because the tape is drawn with no
opaque backing and the moving scenery behind it will otherwise capture the correlation.

**What failed, and I am recording it so nobody repeats it.**
I tried to build a speedometer out of the minimap by phase-correlating the north-locked satellite
imagery frame to frame and adding back the player arrow's in-frame drift.
It does not work, for three separate reasons that I only found by trying:

1. Frame-to-frame minimap motion at 60 fps is about 0.1 px, below the correlation noise floor.
   Naive incremental correlation reported a nearly stationary car while it was plainly driving at speed.
   Switching to a long baseline (30-frame keyframes) fixed the noise floor but not the rest.
2. The minimap **zoom is not constant across modes**. In free roam it shows a whole district; during a
   race it is zoomed in several-fold. Any px-to-metre scale calibrated in one mode is wrong in the other.
3. During races the map is **route-anchored, not car-centred**: the imagery holds nearly still and the
   arrow traverses it. In free roam the imagery scrolls. The two need different reductions.

I also tried the minimap player arrow as a heading instrument.
It is about 12x10 px and roughly 70 mask pixels, and its covariance major axis runs *across* the
chevron rather than along it, so the obvious moment method points 90 deg wrong.
Switching to a skewness scan fixed the bias but the result was bistable, flipping ~128 deg between
adjacent frames.
Heading from that arrow is not better than about +-10 deg and I did not use it for any number here.

**What I therefore could NOT measure and did not invent.**
No concurrent speed-and-yaw pair, because the odometer is a free-roam field and the compass tape is
a race field, and they never appear together.
Consequently the yaw-rate-versus-speed *curve* in section 3 is not measured by me; only points on it
are, with the speed bracketed rather than measured.
No boost camera numbers (section 5) and no collision speed-loss numbers (section 6) are measured by
me either. Both attempts are described where they failed.

---

## 1. CONTROL SCHEME

`PUBLISHED`, high confidence. Source: StrategyWiki, *Burnout Paradise/Controls*
(https://strategywiki.org/wiki/Burnout_Paradise/Controls, revision oldid=887618, listing PS3 / PS4 /
Xbox 360 / Xbox One / Switch columns).

| action | PlayStation | Xbox |
|---|---|---|
| Steer | left stick | left stick |
| Camera look | right stick | right stick |
| Accelerate | R2 | RT |
| Brake / reverse | L2 | LT |
| Boost (and Ground Break in Showtime) | Cross | A |
| E-brake / handbrake | Square | X |
| Rear view (look back) | L1 | LB |
| Change view | Triangle | Y |
| Next song | R1 | RB |
| Start event | L2 + R2 | LT + RT |
| Enter Showtime | L1 + R1 | LB + RB |
| Easy Drive menu | D-pad right | D-pad right |

PC keyboard defaults, `CONSENSUS` (Steam community thread on app 24740, users describing the
shipped defaults while complaining about them): boost is **Shift**, handbrake is **Space**, and
steering/throttle default to a flight-style A/Z plus arrows layout that most players rebind.
Low confidence on the exact steering keys; the Shift/Space pair is stated by a user reporting they
kept those two at default while rebinding everything else.

### The drift-button question: CONFIRMED, there is no drift button

The brief asked me to confirm or refute that Burnout Paradise has no separate drift button on the
default pad scheme.
**Confirmed.** The published binding table above is complete and contains no drift entry.
Drift is a *derived* state, not an input.

Two mechanisms are documented for entering it, and they are different from each other, which
matters for the builder:

- **E-brake plus steering load.** `PUBLISHED` (the binding table lists Square/X as
  "E-Brake or Handbrake"), and `CONSENSUS` from a GameFAQs PS4 controls thread that names Square for
  drifting and the e-brake.
- **A brake TAP plus steering.** `PUBLISHED` by burninrubber0, one of the two people who datamined
  the game's vehicle attribute files, describing chaindrifting as literally
  *"Tap brake, left, tap brake, right."*
  (https://www.reddit.com/r/Burnout/comments/arp9on/, author comment).

This is a correction to the brief's framing rather than a refutation of it.
The brief's hypothesis was "handbrake plus steering load"; the competitive-play answer is that a
**brake tap** while loaded in a turn is the primary entry, with the e-brake as the other route.
Confidence: high that both work, medium on which one the game treats as canonical.

Note for our model: `game/physics.js` already takes exactly the right input set,
`{throttle, brake, steer, boost, handbrake}`, with no drift input. That part is already faithful.

---

## 2. TOP SPEED AND TIME TO TOP SPEED

The single most valuable source here is community datamining of the game's own attribute files,
which recovered the developers' real attribute names.
`PUBLISHED`, high confidence, from burninrubber0 and Bo98 (same Reddit guide; Bo98 documents the
extraction method, the `BND2` archives, the `_AT` attribute bundles in `VEHICLES`, and the
`AttribSys` format shared with Need for Speed).

### The developers' actual attribute names

| attribute | meaning | unit |
|---|---|---|
| `MaxSpeed` | speed limit while **not** boosting | mph |
| `MaxBoostSpeed` | speed limit while boosting | mph |
| `BoostKickAcceleration` | the initial burst of acceleration when boost starts | (unit not recovered) |
| `DownForce` | affects airtime only, per the source's own hedge | (unit not recovered) |
| `DriftAngularDamping` | governs drift; lower value drifts more sharply | (unit not recovered) |

There is deliberately **no single "speed cap" value** in the game: the achievable speed is a result
of gear ratios, max RPM and other values, with `MaxSpeed` / `MaxBoostSpeed` acting as limiters on top.
That is an important structural fact and it is why downhill speeds blow past the caps.

### Top speed, roster spread

All `PUBLISHED` from the same datamining guide.

| car | `MaxSpeed` | `MaxBoostSpeed` | notes |
|---|---|---|---|
| Rai-Jin Turbo (Finish 1) | **201 mph** | - | highest `MaxSpeed` in the game; beats every car's `MaxBoostSpeed` too |
| Extreme Hot Rod | - | 200 mph | creeps to ~215 mph over time |
| Annihilator Street Rod | - | 200 mph | reaches 340 mph+ downhill off White Mountain |
| Civilian | - | 196 mph | 250 mph downhill |
| P12 88 Special | - | 195 mph (hover) | ~210 mph via a glitch |
| Citizen | - | 191 mph | 250 mph downhill |
| Annihilator Phoenix | - | 188 mph | 250 mph downhill |
| Annihilator | - | 183 mph | 250 mph downhill |
| Hippy Van | - | 177 mph | but maxes near 250 mph |

**Headline spread**: the fast end of the roster sits in a narrow **177-201 mph** band of caps
(285-323 km/h, 79-90 m/s), and real achieved speeds exceed those caps substantially on gradient,
up to 340 mph.
The game also has a **"Boost Limit" tier system running 1 to 10** (`PUBLISHED`, same source, which
names the fastest car at each Boost Limit), so "class" in Paradise is a 10-step ladder, not three buckets.

`NOT FOUND`: a `MaxSpeed`/`MaxBoostSpeed` figure for a specifically *mid-tier* Speed car.
The datamined guide only enumerates the extremes, because its purpose was to name the fastest car
per event.
I am not going to interpolate a number and present it as a roster figure.

`MY-ESTIMATE` for a mid-tier Speed car, derivation shown so it can be rejected: the top of the
roster clusters at 195-201 mph and the *slowest* car named anywhere in the fast list is 177 mph, so
a mid-tier Speed car plausibly caps around **165-180 mph (266-290 km/h, 74-80 m/s)**.
Confidence: low. This is an interpolation between two endpoints of a list that was never meant to
be a distribution.

### Acceleration

`PUBLISHED`, same source, and note the units carefully: these are **0-100 mph**, not 0-60.

| car | 0-100 mph |
|---|---|
| Extreme Hot Rod | **2.22 s** (quickest in game) |
| GT Nighthawk | 2.57 s (from its enormous `BoostKickAcceleration`) |
| Vegas / Vegas Carnivale | 3.45 s |
| Uberschall 8 / Uberschall Clear-View | 3.48 s |

`NOT FOUND`: any 0-60 mph figure for any Paradise car, and any 0-100 figure for a mid-tier car.
The brief asked for 0-60 and I could not get one. The community measures 0-100 because 60 mph is
uninterestingly early in this game.

`MY-ESTIMATE` for a useful builder target: the 2.22 s figure is a purpose-built drag car and the
"honorable mentions" at 3.45-3.48 s are already fast cars, so a mid-tier Speed car reaching
100 mph (44.7 m/s) in roughly **4-5 s** is my read, implying an average acceleration of
**9-11 m/s^2** over that interval.
Confidence: low-medium. Derivation: the named group brackets it from above only.

### `MEASURED-BY-ME`: one absolute ground-speed anchor

Clip `u6G4BlOfznU` section 120-300 s, the game's opening car, free roam, in traffic, no boost active.
The `MILES DRIVEN` field stepped twice inside one display window, and the interval between steps was
**4.00 s** for exactly 0.1 mi.

- **40.2 m/s = 144.8 km/h = 90.0 mph**, averaged over 160.934 m of path.
- Error bar: step edges localised to about +-0.1 s, so 4.00 +- 0.15 s, giving **+-1.5 m/s**.
- Cross-check: I independently read the digits off a frame grid at 10 Hz and confirmed a step from
  `1.0 mi` to `1.1 mi`, so the detector is firing on real value changes, not on flicker.
- What this is NOT: it is not a top speed and not a boosting speed. It is what ordinary free-roam
  cruising in traffic actually is, which is a useful thing for a builder to know because it says the
  *typical* speed is roughly half the roster's cap.

A methodological warning for whoever repeats this: `ffmpeg -ss` placed **before** `-i` is a
keyframe-approximate seek and shifted my absolute timestamps by up to ~0.9 s between runs.
Put `-ss` after `-i`, or only trust intervals taken inside a single decode pass.

---

## 3. YAW RATE VERSUS SPEED

This is the number the brief called the single most important curve, and it is the one I am least
able to hand over complete. Read the caveat before the table.

### `MEASURED-BY-ME`: yaw rates during a city race

Instrument B (compass tape), clip `u6G4BlOfznU`, race segment, tape scale 1.4142 deg/px.
All figures are averages over windows of >= 0.5 s.

**The quantisation caveat, stated up front.** The tape does not move smoothly. It holds still and
then jumps 2-7 px in a few frames. A car cannot yaw 14 deg in 100 ms, so those jumps are the
instrument, not the car: the tape is redrawn coarsely (the HUD as a whole updates below 60 Hz, and
about 20% of consecutive video frames are byte-identical in the minimap band).
**Only averages over windows of 0.5 s or longer are trustworthy.** Anything I quote per-frame would
be an artefact, so I quote none.

| driving state | timestamps (s) | tape travel | yaw rate |
|---|---|---|---|
| dead-straight avenue | 132.0-135.0 | 0.01 px over 3.0 s | **< 0.2 deg/s** (i.e. exactly zero) |
| dead-straight avenue | 127.0-128.5 | ~0.06 px | **< 0.2 deg/s** |
| sustained turn, hard | 139.25-139.75 | 13.39 px | **37.9 deg/s** |
| sustained turn | 136.75-137.25 | 10.07 px | **28.5 deg/s** |
| whole turn, averaged | 135.25-137.25 | 22.95 px = 32.5 deg | **16.2 deg/s** over 2.0 s |
| counter-turn, averaged | 137.25-140.00 | -32.93 px = -46.6 deg | **-16.9 deg/s** over 2.75 s |

Distribution of `|yaw|` over the clean part of the race window, sampled on +-0.25 s fits:
**p50 2.2 deg/s, p90 21.6 deg/s**.
The p99 and max are contaminated by HUD state transitions at the window edges (the race ends in a
takedown) and I am discarding them rather than reporting them.

**Highest clean sustained yaw rate I measured: ~38 deg/s (0.66 rad/s).**

### What this does and does not establish

It establishes the *magnitude band*: a Paradise car being raced hard through city streets spends
most of its time at essentially zero yaw and peaks around 30-40 deg/s.
It does **not** establish the curve, for two reasons a critic should hold me to:

1. **No concurrent speed.** The compass tape only exists during events; the odometer only exists in
   free roam. I could not read both at once, so I cannot put a speed on the axis.
   Contextually the race segment is fast city driving, and my one absolute anchor for comparable
   driving is 40.2 m/s, so these yaw rates plausibly sit near **40 m/s (144 km/h)** - but that
   pairing is `MY-ESTIMATE`, not a measurement.
2. **Player intent, not vehicle capability.** These are the yaw rates a player *used* following a
   road. The maximum the car *could* produce at that speed is necessarily higher. A curve of maximum
   yaw rate versus speed cannot be extracted from ordinary gameplay footage at all; it needs a
   controlled capture of a full-lock circle at held speeds.

### The shape of the curve

`CONSENSUS`, and consistent with the brief's own framing: Burnout cars turn hard at low speed and go
progressively straighter toward top speed.
I found no published curve, no numbers at 40/80/120/160/200 km/h, and no normalised curve.
`NOT FOUND`. Anyone who tells you otherwise should be asked for the source.

The one piece of *structural* evidence I did find is that the drift model is an **angular damping**
term (`DriftAngularDamping`, `PUBLISHED`), which means Paradise's rotation is treated as angular
momentum with damping rather than as a directly-commanded yaw rate.
That is a materially different architecture from ours and section 9 flags it.

---

## 4. DRIFT

### Entry

`PUBLISHED` / `CONSENSUS` as set out in section 1: a **brake tap while loaded in a turn** is the
competitive entry; the **e-brake plus steering** is the other. There is no drift button.

### Duration and how it holds

`PUBLISHED`, burninrubber0: drifts are chained deliberately, and the chain technique is
*"Tap brake, left, tap brake, right"*, so a single drift is short enough that sustained sliding
requires re-triggering, alternating direction.

`PUBLISHED`, same author, on **double drifting**, which is the most informative single sentence I
found about Paradise's drift physics:

> You do the same thing you would when chaindrifting, but right after beginning the drift you'd
> briefly turn the opposite way as if you're about to end the drift, then let the car go back into
> the drift **on its own**. [...] This tactic **regains a bit of speed and elongates the drift** vs
> normal chaindrifting.

Three things fall out of that, all high confidence:

1. **The drift is a self-sustaining state.** "Let the car go back into the drift on its own" means
   the slide persists and even re-develops without steering input holding it there. It is not an
   instantaneous function of the current steering angle.
2. **A drift is steerable in both directions without exiting.** Countersteering briefly does not
   cancel it.
3. **A drift does scrub speed, and the scrub is recoverable.** "Regains a bit of speed" only makes
   sense against a baseline that was losing speed.

### Scrub

`CONSENSUS`, medium confidence: Paradise's drift is famously low-scrub, which is exactly why
chaindrifting is the world-record technique for the Time Road Rules rather than a stylistic choice.
`PUBLISHED` corroboration: the Annihilator Street Rod's downhill speed "can be maintained over the
course of several minutes" specifically *through the use of* drift chaining and double drifting.
A drift that scrubbed meaningfully could not maintain speed for minutes.

`NOT FOUND`: a percentage or m/s figure for drift speed loss. I have no number and will not invent one.

### Yaw rate inside a drift versus outside it

`NOT FOUND` as a measured pair.
I could not measure slip angle: it requires heading and course simultaneously, and my only reliable
heading instrument (the compass tape) has no companion course instrument, for the reasons in the
failure log.
`PUBLISHED` structural fact only: `DriftAngularDamping` governs it, and a **lower** value means the
car **drifts more sharply**. The Rai-Jin Turbo Finish 1 has a slightly lower value than its other
finishes and is described as drifting more sharply as a result.
So drift sharpness is per-car and is implemented as a damping coefficient on yaw rate, not as a
yaw-rate multiplier.

### Exit

`MY-ESTIMATE` from the double-drift description: the drift ends when the countersteer is held rather
than tapped, or when the angular damping bleeds the rotation out. Confidence: medium, derived from
the one quoted source, not observed.

---

## 5. BOOST

### Duration of a full bar

This is the number where my measurement and a published figure meet, so it is the most solid thing
in this document.

`PUBLISHED`, high confidence. Burnout Wiki, *Speed boost*
(https://burnout.fandom.com/wiki/Speed_boost):

> A full burn of a Speed Boost bar will last for **exactly 8 seconds**, with the exception of the
> Hawker Mech, which lasts for about 10 seconds.

`MEASURED-BY-ME`, independently: **8.9 s**, one sample, interrupted.
Method: clip `u6G4BlOfznU`, boost bar crop 240x40 at (100, 618), flame mask `r>130 and r-b>55`,
rightmost filled column per frame.
The bar reached full at t=143.9-144.7 and then drained monotonically until the HUD was wiped by a
takedown crash at t=147.5.
Taking the clean linear portion t=145.4 to t=147.3, the bar shortened 47 px in 1.90 s = 24.7 px/s,
against a full bar extent I measure geometrically as 215-221 px, giving 8.7-8.9 s for a full bar.

The two agree to about 11%, which for a single interrupted sample with a "bar length is linear in
charge" assumption is good agreement.
**Use the published 8.0 s.** My number's value is that it corroborates the instrument, not that it
improves the figure.

Note the class asymmetry: the Speed bar is described as **about half the length** of the other boost
types' bars, and it is the shortest in the game. An Aggression or Stunt bar is therefore longer in
screen terms, though duration does not necessarily scale with it.

### Refill mechanism, and the Speed-class rule

`PUBLISHED`, high confidence, same Burnout Wiki page. This is the mechanic our model has no term for
at all, so it is worth quoting the structure precisely.

- Speed boost is **only usable when the boost bar is completely filled**. You cannot tap it at 40%.
- If the boost is spent completely in a single burst, the player performs a **burnout**, which
  refills *a portion* of the bar.
- If enough stunts or driving manoeuvres are performed *while boosting*, the bar is **completely**
  refilled. This is a **Burnout Chain**.
- The chain continues until one of exactly three things happens: the boost button is released, the
  player fails to refill the bar, or the player crashes.
- Driving through a **Gas Station** while boosting **guarantees** a burnout.
- A **Barrel Roll** or a **Takedown** completely fills a Speed boost bar.
- Boost is otherwise earned by driving dangerously: `CONSENSUS`, and visible in my own footage as the
  `NEAR MISS`, `TRAFFIC CHECK` and `CRASH ESCAPE` event feed firing next to the bar.

`MEASURED-BY-ME`, supporting: across the 22 s of race footage before the boost event, the bar sat
between 86% and 92% and crept upward slowly, reaching full exactly once.
The player never spent any of it below full. That is the Speed-class rule visible in behaviour.
It also puts a rough bound on passive-ish accumulation: roughly **10 percentage points over ~20 s of
hard racing**, i.e. of order **0.5 %/s** while merely driving fast among traffic, with the large
jumps coming from events.
Confidence: medium. It is one window, and I cannot separate time-based from event-based gain in it.

### Top-speed lift from boost

`PUBLISHED`, and this is the most important corrective finding in the whole document.

Boost in Paradise does **not** raise the ceiling much. `MaxBoostSpeed` values top out at 200 mph
while the Rai-Jin Turbo's non-boost `MaxSpeed` is 201 mph, which *beats every car's
`MaxBoostSpeed` in the game*.
For most cars the two limiters are close together, and the dramatic thing boost does is
`BoostKickAcceleration`, an **initial burst of acceleration** when boost starts.

So the character of Paradise boost is: **a large, immediate acceleration event with a modest ceiling
change**, not a ceiling multiplier.
Section 9 flags that our model has this backwards.

### WHAT BOOST DOES TO THE CAMERA

`NOT FOUND`, and I want to be blunt about it because the brief said camera numbers matter as much as
the physics ones.

I searched for published field-of-view, pull-back, shake or chromatic-edge figures and found nothing.
No source documents them numerically.

I then tried to measure it from my own footage and **the attempt failed as a controlled comparison**,
so I am reporting no number.
What I did: took a non-boosting frame (t=142.6) and a boosting frame (t=146.2) and measured the
player car's tail-light cluster separation as a proxy for its on-screen angular width.
Result: 141.4 px non-boost versus 151.9 px boosting.
Why I will not report that as a camera measurement:

- The comparison is **confounded on at least three axes**. The two frames are at different speeds,
  and Paradise's chase camera pulls back with speed independently of boost, so speed and boost are
  not separated. The boosting frame also has a side-on collision in progress and a second car's
  tail lights inside the crop, and the red mask picked up sparks: the boosting mask spans 99 px
  vertically against 21 px for the clean frame, which is proof of contamination.
- The sign is also counter-intuitive (the car reads *larger* while boosting), which is exactly the
  situation where a contaminated mask should be distrusted rather than explained.

What *is* qualitatively observable in the boosting frame, offered as description and not as
measurement: bright yellow-orange exhaust flame plumes at the rear, the event feed firing
(`NEAR MISS`, `CRASH ESCAPE`), and a visibly wider, lower framing of the car.
Getting real numbers here needs a controlled capture and section 8 gives the procedure.

---

## 6. COLLISION AND CRASH FEEL

`NOT FOUND` for the quantities the brief asked for.
I have no number for what a light scrape costs in speed versus what a real hit costs, and I did not
manufacture one.

Why I could not measure it: the same blocker as everywhere else. The game has no speedometer, and my
only absolute speed instrument is a 0.1 mi odometer step, which is far too coarse to resolve a speed
change across a single impact. A tick is roughly 4 s of driving; an impact is a fraction of a second.

What I can report:

- `MEASURED-BY-ME`, timing only: in my clip the player takes a takedown at t~147.5 and the entire
  driving HUD is wiped within 0.1 s (bar length goes 168 px -> 0 px between t=147.4 and t=147.5).
  A real crash is a hard state transition, not a speed penalty.
- `MEASURED-BY-ME`, observation: at t=146.2 the player car is scraping another car side-on with
  sparks visible and **the boost is still running and the bar is still draining normally**.
  A light scrape does not interrupt boost and does not end the run.
- `PUBLISHED`, structural: crashing is one of exactly three things that terminate a Burnout Chain,
  which confirms a crash is modelled as a discrete state change with consequences for the boost
  economy.
- `PUBLISHED`, on fragility: Speed-class cars have "generally a very low resistance to damage",
  and strength is a per-car statistic, so collision consequence is car-dependent, not global.

The distinction the brief is after (light scrape versus real hit) is real and visible in the footage
as *two different outcomes*, one of which preserves the run and one of which ends it.
I just cannot put m/s on either.

---

## 7. Summary table of usable numbers

| quantity | value | unit | provenance | confidence |
|---|---|---|---|---|
| Accelerate / brake / boost / e-brake / look-back | RT / LT / A / X / LB | - | `PUBLISHED` | high |
| Separate drift button | **none exists** | - | `PUBLISHED` | high |
| Drift entry | brake tap, or e-brake, plus steering load | - | `PUBLISHED` | high |
| Highest `MaxSpeed` in roster | 201 | mph | `PUBLISHED` | high |
| `MaxBoostSpeed` band, fast roster | 177-200 | mph | `PUBLISHED` | high |
| Achieved speed downhill, extreme | up to 340 | mph | `PUBLISHED` | medium |
| Quickest 0-100 mph | 2.22 | s | `PUBLISHED` | high |
| 0-100 mph, fast-but-not-top group | 3.45-3.48 | s | `PUBLISHED` | high |
| 0-60 mph, any car | - | - | `NOT FOUND` | - |
| Mid-tier Speed car cap | 165-180 | mph | `MY-ESTIMATE` | low |
| Mid-tier 0-100 mph | 4-5 | s | `MY-ESTIMATE` | low |
| Free-roam cruise speed in traffic | 40.2 +- 1.5 | m/s | `MEASURED-BY-ME` | high |
| Yaw rate, straight | < 0.2 | deg/s | `MEASURED-BY-ME` | high |
| Yaw rate, hard sustained turn | 28-38 | deg/s | `MEASURED-BY-ME` | medium |
| Yaw rate p50 / p90 while racing | 2.2 / 21.6 | deg/s | `MEASURED-BY-ME` | medium |
| Yaw rate versus speed curve | - | - | `NOT FOUND` | - |
| Full Speed boost bar duration | **8.0** | s | `PUBLISHED` | high |
| Full Speed boost bar duration | 8.7-8.9 | s | `MEASURED-BY-ME` | medium |
| Speed boost usable below full bar | **no** | - | `PUBLISHED` | high |
| Barrel roll / takedown boost gain | 100% refill | - | `PUBLISHED` | high |
| Gas station while boosting | guaranteed burnout | - | `PUBLISHED` | high |
| Boost accumulation while racing | ~0.5 | %/s | `MEASURED-BY-ME` | medium |
| Boost effect on ceiling | small; caps 177-200 vs `MaxSpeed` up to 201 | mph | `PUBLISHED` | high |
| Boost effect on acceleration | large initial burst (`BoostKickAcceleration`) | - | `PUBLISHED` | high |
| Boost camera FOV / pull-back / shake | - | - | `NOT FOUND` | - |
| Light scrape versus hard hit speed cost | - | - | `NOT FOUND` | - |

---

## 8. HOW TO MEASURE THIS IN OUR GAME

Procedures a critic can run literally against `game/physics.js`.
Every one of these is a headless node harness that imports the module directly; none of them needs
the renderer, so none of them is affected by peer agents or by frame time.

Common harness. `createPhysics` is pure and deterministic, so drive it at a fixed tick:

```js
import { createPhysics, TUNE } from '../game/physics.js';
const p = createPhysics({ blocks: [], bounds: 1e9 });   // no walls, no bounds clamp
const DT = 1 / 120;                                      // fixed tick; state that you used it
function run(seconds, input, onTick) {
  p.setInput(input);
  for (let i = 0; i < Math.round(seconds / DT); i++) { p.step(DT); onTick?.(i * DT, p.state); }
}
```

State the tick rate beside every number, because `physics.js` integrates explicitly and the drag and
`damp` terms are tick-rate sensitive.

**8.1 Top speed (target: 177-201 mph = 79-90 m/s unboosted).**
`p.reset(origin); run(120, {throttle:1})` and read `state.speed` at the end.
Report m/s and mph. Compare against `TUNE.vMax`.
Then the boosting equivalent with `{throttle:1, boost:true}`, but note the boost tank empties, so
temporarily force `state.boost = 1` each tick to find the true boosted ceiling and say that you did.

**8.2 Time to 100 mph (target: 2.22 s best in game, 3.45-3.48 s for fast-not-top).**
`p.reset(origin); run(20, {throttle:1})` and record the first time `state.speed >= 44.704`.
Do it twice, once with `boost:false` and once with `boost:true`, and report both.
Reject the run if `state.speed` never reaches 44.704.

**8.3 Yaw rate versus speed, the curve (target: monotonically falling with speed; ~38 deg/s
observed as a hard sustained rate in real gameplay).**
This is the one to build properly, because it is the curve nobody has.
For each target speed `v` in `{10, 20, 30, 40, 50, 60, 70, 78}` m/s:
force `state.speed = v` at the top of every tick, apply `{steer: 1, throttle: 1}`, run 3 s to let
`state.steer` settle (it is damped at 12/s so it needs ~0.5 s), then measure
`d(state.yaw)/dt` over the following 1 s and convert to deg/s.
Print a table of v (m/s and km/h) against yaw rate (deg/s) and against turn radius `v / yawRate_rad`.
Two acceptance checks:
- the curve must fall monotonically above the peak, and
- the peak must sit at a speed the player actually spends time at.
Note `TUNE.gripLow = 0.28` puts our peak at 0.28 * 78 = 21.8 m/s = 78.6 km/h.

**8.4 Yaw rate compared to my measurement (target band 28-38 deg/s at roughly 40 m/s).**
Run 8.3 at exactly `v = 40.2` m/s, which is my one absolutely-calibrated speed anchor.
Report the deg/s. Note explicitly that my figure is player-used yaw and ours is maximum-available
yaw, so ours being higher is expected; the question is by how much, and a factor of 2+ is a finding.

**8.5 Boost bar duration (target: exactly 8.0 s).**
`p.reset(origin); state.boost = 1;` then `run(20, {throttle:1, boost:true})` and record the time at
which `state.boost` first reaches 0.
Compare to 8.0 s. This is a one-line check against `TUNE.boostDrain` and it is currently wrong;
see 9.4.

**8.6 Boost may not be used below a full bar (target: it must refuse).**
`state.boost = 0.5`, apply `{throttle:1, boost:true}`, step once, and assert `state.boosting === false`.
This currently fails. `physics.js:111` gates on `state.boost > 0.001`.

**8.7 Boost gives acceleration, not mostly ceiling (target: ceiling lift small, acceleration lift large).**
Measure two ratios: `vMaxBoost / vMax` from 8.1, and the 0-100 mph time ratio from 8.2.
Burnout's ceiling ratio is close to 1.0 (200 vs up to 201 mph across the roster).
A ceiling ratio near 1.33 is a character error, not a tuning error.

**8.8 Drift persistence (target: a drift holds itself and survives a brief countersteer).**
Enter a slide, then set `steer: 0` and keep stepping.
Measure how long `|state.slip|` stays above half its peak.
Then repeat, applying a 0.15 s countersteer of `steer: -1` mid-slide, and check the slide re-develops.
Both currently fail by construction; see 9.5.

**8.9 Drift scrub (target: low, and recoverable).**
Run two 5 s passes from the same speed on a straight, one with a drift induced and one without, and
compare `state.distance` and final `state.speed`.
Report the speed delta as a percentage. Burnout's is small enough that world records are set by
chaining drifts for minutes, so a large scrub is wrong and so is exactly zero.

**8.10 Collision tiers (target: two distinguishable outcomes).**
Place a block, approach at a shallow angle for a scrape and head-on for a hit, and record
`state.speed` before and after each, plus whether `state.crashed` becomes true.
Currently both produce the same multiplier and neither sets `crashed`; see 9.7.

**8.11 Determinism guard for all of the above.**
Run any of these twice and assert bit-identical `state` traces.
`physics.js` has no RNG, so any difference means the harness leaked wall-clock time into `dt`.

**8.12 The two things a headless harness cannot check, routed to a camera/feel piece.**
Boost camera field-of-view push, pull-back distance, shake and chromatic edge; and crash camera
behaviour. `physics.js` has no camera term at all. To get real reference numbers, capture Paradise
footage where the *only* variable is the boost button: same car, same straight road, held at a
steady speed, boost tapped on and off, then measure a fixed-size world feature's on-screen width
across the transition. My failed attempt in section 5 failed precisely because it did not control
speed, so do control it.

---

## 9. Mapping onto `game/physics.js`

Read of `game/physics.js` at the state committed for wave S (166 lines, `TUNE` at lines 9-22).
I do not own this file and have changed nothing in it.

### 9.1 What each researched number governs

| researched quantity | governed by | current value | comment |
|---|---|---|---|
| Unboosted top speed | `TUNE.vMax` (`physics.js:10`) | 78 m/s = 174.6 mph | Sits inside the real 177-201 mph band, slightly under it. Closest thing to correct in the file. |
| Boosted top speed | `TUNE.vMaxBoost` (`:11`) | 104 m/s = 232.7 mph | Above every real `MaxBoostSpeed` (max 200 mph). See 9.3. |
| Time to 100 mph | `TUNE.accel` (`:12`) plus the headroom taper at `:121-122` | 16.5 | Plausible band; verify with 8.2 rather than by inspection. |
| Boost acceleration | `TUNE.boostAccel` (`:13`) | 30 | 1.82x base, sustained. Burnout's is an initial *kick*. See 9.3. |
| Braking | `TUNE.brakeDecel` (`:14`) | 30 m/s^2 (~3 g) | No reference figure found. Unverified. |
| Yaw rate versus speed | `TUNE.turnRate` (`:17`), `TUNE.gripLow` (`:18`), and the authority expression at `:138-140` | 1.55 rad/s, 0.28 | See 9.2. |
| Drift magnitude | `TUNE.driftGain` (`:19`) and the `targetSlip` expression at `:145` | 0.9, handbrake x2.2 | Architecturally different from Burnout. See 9.5. |
| Boost bar duration | `TUNE.boostDrain` (`:20`) | 0.19 /s | Wrong by 34%. See 9.4. |
| Boost refill | `TUNE.boostRefill` (`:21`) | 0.055 /s | Wrong mechanism entirely. See 9.4. |
| Collision speed loss | `state.speed *= 0.62` (`:60`), `*= 0.5` (`:64-65`) | single tier | See 9.7. |
| Control scheme | `setInput` (`:79`) | `{throttle, brake, steer, boost, handbrake}` | **Correct.** Matches Burnout's binding set, and correctly has no drift input. |

### 9.2 The yaw curve: right shape, probably too eager, and peaking at a defensible speed

The authority expression is

```js
const sn = clamp(Math.abs(state.speed) / TUNE.vMax, 0, 1.4);
const authority = clamp(sn / TUNE.gripLow, 0, 1) * (1 / (1 + Math.max(0, sn - TUNE.gripLow) * 1.35));
```

which is the right *shape*: zero at rest, a ramp to a peak at `sn = gripLow`, then a hyperbolic
falloff. That matches the documented character.

Evaluating it: at `sn = 1` (78 m/s) authority is 0.507, giving 0.786 rad/s = **45 deg/s**.
At 40 m/s (`sn = 0.513`) authority is 0.761, giving 1.179 rad/s = **67.6 deg/s**.

Against my measurement of 28-38 deg/s used in hard racing at roughly that speed, ours is
**about 1.8-2.4x more eager**, and the honest caveat from section 3 applies: mine is yaw the player
used, ours is yaw available at full lock, so some gap is correct.
The concern is not the absolute value, it is that the **falloff is shallow**: authority only halves
between the peak and `vMax`, so the car does not "go progressively straighter" as much as the
reference does. The `1.35` coefficient at `:139` is the knob and it is a bare literal with no
comment saying where it came from.

`gripLow = 0.28` puts peak turning at 21.8 m/s (78.6 km/h), which is a speed players genuinely
drive at, so that choice looks sound.

### 9.3 Boost has the ceiling-versus-acceleration split backwards

This is the highest-value finding in this section.

Ours: `vMaxBoost / vMax = 104 / 78 = 1.333`, a 33% ceiling lift, sustained for as long as boost is held.
Burnout: `MaxBoostSpeed` peaks at 200 mph while the best `MaxSpeed` is 201 mph, so the ceiling ratio
across the roster is close to **1.0**, and the felt event is `BoostKickAcceleration`, an initial burst.

So our boost is a top-speed multiplier where Burnout's is an acceleration event.
A builder chasing Paradise feel should shrink `vMaxBoost` toward `vMax` and move the energy into a
front-loaded acceleration term. Our model has **no term for a decaying initial kick at all**:
`:118` lerps `accel` to `boostAccel` through `boostBlend` and then holds it flat.

### 9.4 Boost economy: one number is simply wrong, and the mechanism is missing

**The number.** `TUNE.boostDrain = 0.19` per second on a 0-1 tank drains a full bar in
`1 / 0.19 = 5.26 s`. The published Speed-class figure is **exactly 8.0 s**, and my own measurement
independently gave 8.7-8.9 s. To hit 8.0 s the constant is `1 / 8 = 0.125`.
Ours is 34% too fast. This is a one-line, one-number, directly-referenced target and it is the
cleanest actionable item in this document.

**The mechanism.** `TUNE.boostRefill = 0.055` per second refills the tank passively in 18.2 s of
not boosting. Burnout has no passive time-based refill at all. It has:

- refill by driving dangerously (near miss, oncoming, traffic check, drift, air),
- a **burnout** on spending the whole bar in one burst, refilling a portion,
- a **Burnout Chain** refilling the bar completely from stunts performed *while boosting*, ending
  only on button release, failure to refill, or a crash,
- a guaranteed burnout from a gas station while boosting,
- a full refill from a barrel roll or a takedown.

`physics.js` has **no term for any of this**. There is no event input, no chain state, no
burnout concept. This is the largest single gap between our model and the reference, and it is a
gameplay-economy gap rather than a tuning gap, so it cannot be fixed by changing a constant.

**The class rule.** `:111` gates boosting on `state.boost > 0.001`, so our car can boost on a sliver
of tank. A Speed-class Paradise car cannot boost at all below a **full** bar. That gate is a
one-line change and it changes the whole rhythm of play: it converts boost from a resource you
meter into a resource you bank and then dump.

### 9.5 Drift: our model has no drift state, and cannot have Paradise's drift

`physics.js:144-146`:

```js
const lat = yawRate * state.speed;
const targetSlip = clamp(lat / 34, -1, 1) * (input.handbrake ? 2.2 : 1) * TUNE.driftGain;
state.slip = damp(state.slip, targetSlip, 6, dt);
```

`state.slip` is an **algebraic function of the current yaw rate and speed**, smoothed. It is not a state.
Consequences, each of which contradicts a documented Paradise behaviour:

- **It cannot persist.** Return the stick to centre and `yawRate` goes to zero, so `targetSlip` goes
  to zero and the slide decays within a `damp(…, 6, dt)` time constant of about 0.17 s.
  Paradise's drift is explicitly self-sustaining: "let the car go back into the drift *on its own*".
- **It cannot survive a countersteer.** A brief opposite input flips `targetSlip`'s sign immediately.
  In Paradise a brief countersteer is a *technique used inside* a drift (double drifting) that
  lengthens it.
- **There is no entry condition and no exit condition.** Paradise has both: a brake tap or e-brake
  loads it, and holding countersteer or letting damping bleed it out ends it.
- **The architecture differs.** Paradise's own attribute is `DriftAngularDamping`, i.e. drift is
  angular momentum with a damping coefficient, per-car. Ours is a commanded yaw rate with a
  cosmetic lateral offset.
- **There is no scrub.** `slip` only feeds a lateral position offset at `:154-156`, and that offset
  *adds* to `state.distance`. Drifting in our model costs no speed whatsoever. Paradise's drift
  scrubs a little and double drifting recovers some of it, which is why the technique exists.

The `handbrake ? 2.2 : 1` multiplier is the only drift trigger we have, and note that the
competitive Paradise entry is a **brake tap**, which in our model does nothing to `slip` except
indirectly by changing speed.

### 9.6 Terms Burnout has that we have no analogue for at all

- `BoostKickAcceleration` (front-loaded boost burst). No term.
- Event-driven boost economy: burnout, Burnout Chain, gas station, barrel roll, takedown. No term.
- The full-bar gate for Speed-class boost. No term (and `:111` actively contradicts it).
- A drift state machine with entry, hold, countersteer tolerance and exit. No term.
- `DriftAngularDamping` as a per-car coefficient. No analogue; `driftGain` is global and cosmetic.
- Per-car strength / damage resistance. No term.
- The Boost Limit 1-10 vehicle ladder. No term. Our model is a single car.
- `DownForce` and airtime. **Partially dead code**: `state.airborne` and `state.vy` are declared at
  `:37-38` and reset at `:76`, but `step()` never integrates `vy`, never sets `airborne`, and forces
  `state.pos.y = 0` at `:160`. There is no air state at all.
- Camera coupling of any kind. Correctly absent from `physics.js`; route to the camera piece.

### 9.7 Collision has one tier, and `crashed` is never set

`collide()` at `:51-67` applies `state.speed *= 0.62` for any building contact regardless of angle or
speed, and `*= 0.5` at the world bounds.
There is no light-scrape versus hard-hit distinction, and no dependence on approach angle or on
closing speed. In my footage a light side-on scrape preserved the run and the boost entirely while a
takedown ended it inside 0.1 s: two qualitatively different outcomes.

Separately, and worth flagging on its own: `state.crashed` is declared at `:39` and reset at `:76`
but is **never assigned `true` anywhere in `physics.js`**. Nothing in this module can crash the car.
Whatever owns the crash state, it is not this file, and a reader of `TUNE` would not guess that.

I do not own `physics.js` and have made no edit to it. Everything in 9.2 through 9.7 is a routed
finding for whoever does.
