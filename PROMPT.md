Keep improving the arcade racer in `game/`. Read STATE.md first; it is your only memory.

**The visual bar is MET. Stop improving visuals.** `reference/` and the pixel metrics are now a
REGRESSION GATE, not a target: you may not make any scene look worse, and you may not spend a
single agent on making one look better. Burnout Paradise is a console game and this is a web game;
that comparison is closed. Do not open new visual waves. Do not write new visual critic sweeps.

The bar is now **how it plays**, and it has two halves:

1. **60 fps sustained at 1280x720** during normal driving, on this machine, measured - not
   estimated. Build a frame-time harness first if you do not have one, and report p50/p99 frame
   times with the visuals unchanged. 720p means 1280x720 REAL pixels in the render target: this is
   a Retina machine where `devicePixelRatio` is 2, so cap the renderer's pixel ratio and upscale
   the result to fill the window. A 720p canvas at ratio 2 is secretly 2560x1440 and would make
   every fps number a lie. State the render size and pixel ratio beside every measurement. Spend the frames you free however you judge best: baked
   lighting, baked//static reflection probes, a smaller map, instancing, aggressive culling, LODs.
   You decide. Visual regression gate still applies.
2. **Handling that feels like Burnout Paradise.** Use Firecrawl to research its control scheme and
   handling model, and to pull gameplay video you can step through frame by frame to measure real
   behaviour - time to top speed, yaw rate versus speed, drift entry and hold, boost duration and
   what boost does to the camera. Turn those into numbers and match them.

Concrete defects to fix, all confirmed by the user playing it:

- **Steering is INVERTED.** Right steers left. `game/main.js:371` maps right to `+1`, but
  `physics.js:141` does `yaw += yawRate*dt` and +Y yaw is counter-clockwise. Fix the sign at the
  INPUT mapping, not at `yawRate` - negating `yawRate` also flips `lat` on line 144, which drives
  `slip` and `lean`, and the car would bank the wrong way through corners.
- **The traffic is a car park.** 2667 vehicles, all static. `laneTraffic()` in `world.js` fills
  both carriageways with standing cars because density won a screenshot metric - a still cannot
  tell parked from moving, so the loop optimised toward something wrong. Cut the count hard and
  make the survivors DRIVE: lanes, sensible speeds, junction behaviour, spawn near the player and
  despawn behind. A handful of moving cars beats thousands of parked ones.
- **The car does not feel right.** This is the handling work above, not a tuning tweak. Three
  specific findings from the user driving it, all confirmed in the code:
  - **The handbrake adds no rotation at all.** `input.handbrake` appears in exactly one place in
    `physics.js` (line 145), scaling `targetSlip` by 2.2. It never touches `yawRate`. So it
    inflates the car's visual body angle while it continues travelling straight. A handbrake turn
    has to actually rotate the car: give it real yaw authority, and a rear-grip loss that the
    throttle can hold or catch.
  - **The camera out-turns the car, by construction.** `camera.js:286` aims at `s.yaw + slip*0.30`,
    plus `steerLead 0.26` rad of aim lead and `slipSwing 2.1` m of lateral swing. Camera yaw is
    defined as car yaw plus a slip term, so the camera always rotates further than the car does,
    and the handbrake's 2.2x slip multiplier widens the gap exactly when the player is asking for
    rotation. Measure the real relationship in the Burnout capture: how far the chase camera lags
    or leads the car's heading through a corner, and match that instead of guessing.
  - **Turning falls away with speed.** `turnRate` peaks at 28% of vMax (`gripLow 0.28`) and then
    decays through `1/(1 + (sn-gripLow)*1.35)`, so the car turns least where it is driven most.
    Whatever the researched yaw-rate-versus-speed curve says, this is the code that has to match
    it.
- **NPC CAR COUNT IS SET BY THE USER. DO NOT RAISE IT.** After driving it the user asked for 60%
  fewer cars, twice. The bindings are `POOL = 22` in `traffic.js` (was 56) and `NPC_DENSITY = 0.40`
  in `world.js` (which scales kerb ranks and signal queues), giving roughly 458 total against 1468
  before. A round has already reverted `POOL` to 56 once while rewriting that file - the density
  reasoning in those comments is sound about what a frame can SEE, and is overruled anyway by the
  person driving. If a critic reports the street reads empty, report it and leave the number alone.
- **`damage.setLevel()` costs 160 ms EVERY call, and a crash calls it.** Measured on a cold page
  at 1280x720: 268.6 ms first call, 160.1 ms on every call after. So every crash drops roughly ten
  frames, and this is a p99 stall defect that no p50 work will touch - it is exactly the kind of
  thing the 399 ms p99 is made of. The first-call extra (~108 ms) and a separate ~69 ms of
  effect-shader compile were the pause on the first C press; the shader half is already fixed by
  warming `crash.group` and `boostFx.group` through one `renderer.compile` at boot (`main.js`,
  warm stage). The 160 ms is regeneration work that should not be happening synchronously inside
  a frame at all. Find it and get it off the frame.
- **No music.** Three tracks are already on disk in `game/music/`: `santa-in-a-hurry.mp3`,
  `stormy-weather.mp3`, `bring-me-up-higher.mp3`. Wire them up as a soundtrack with track
  selection and skip, and add SEPARATE music and SFX volume controls to the menu (`audio.js`
  already has a master `setVolume`; that becomes the SFX control). Route music through its own
  gain straight to the destination - do NOT feed it through the existing master chain, or the
  glue bus, limiter and space reverb will duck and colour the music along with the engine, which
  is wrong. Music must persist across a scene change rather than restarting, and must respect the
  same click-to-unlock-audio gesture as everything else.
- **No way to pick a scene, and the controls are undiscoverable.** Add a START menu plus an Esc
  PAUSE menu with the same options, so a scene can be changed without reloading. Both knobs already
  exist at runtime - `sky.apply('dawn'|'midday'|'dusk'|'night')` and `world.setWet(0..1)` - so this
  is plumbing, not rendering work. Put time of day, wet/dry, a resolution scale for the fps work,
  and the full control list (including boost = Shift, which the user had to ask about) in it. The
  start menu's click is also the legitimate user gesture that unlocks WebAudio, which `main.js:360`
  currently leaves to chance. Do NOT build falling rain: wet/dry covers the look, and Paradise has
  no rain, so there is no reference to judge it against.

Then keep going on feel: whatever makes it least fun to drive is the next piece.

Same loop as before. Break the work into pieces that can be judged alone. For each piece, fan out
a builder and a SEPARATE critic with fresh context. Critics now judge by PLAYING and by measuring
frame time and handling numbers against the researched Burnout values - not by comparing stills.
Keep looping each piece until its critic passes it.

Keep `progress.html` current, now showing fps and handling numbers alongside each piece.

**Update STATE.md INCREMENTALLY, as each piece lands - not at the end of the session.** A round can
be killed or stall at any moment: session 16 ran for five hours, exited cleanly, and left STATE.md
stamped from its first fifteen minutes with an unfilled `WAVE S RESULTS` placeholder, so the next
round had to reconstruct the whole wave from 65 verdict files. Treat "the piece table and the exact
next action are current" as a standing invariant, true at every moment, rather than a closing task.
A row must never say RUNNING for a builder that is no longer running. Keep your own context lean: delegate heavy work to sub-agents and keep only their verdicts.

Fan out sub-agents and ultracode.
