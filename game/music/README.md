# Soundtrack

Three tracks supplied by the user on 2026-08-03, to be wired up as in-game music with
separate music and SFX volume controls in the menu.

- `santa-in-a-hurry.mp3` — J.F. Gloss
- `stormy-weather.mp3` — instrumental
- `bring-me-up-higher.mp3` — instrumental

**These are OWNED and INTENTIONAL. Do not quarantine, move or delete them.**
An earlier round swept them as unowned assets because no verdict claimed them and no code
referenced them yet, which was correct process applied to the wrong object: they are an input
to the work, not output from it. The requirement is stated in `PROMPT.md`.

Routing note for whoever wires them up: music must go through its own gain straight to the
destination, NOT through `audio.js`'s master chain. That chain has a glue bus, a limiter and a
per-space convolution reverb, all of which are correct for engine and crash audio and wrong for
music — the soundtrack would duck under the engine and pick up tunnel reverb.
