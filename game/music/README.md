# Soundtrack

**These are OWNED and INTENTIONAL. Do not quarantine, move or delete them.**
An earlier round swept this directory as unowned assets because no verdict claimed it and no code
referenced it yet, which was correct process applied to the wrong object: these are an input to the
work, not output from it.
The requirement is stated in `PROMPT.md` and the track list is in `game/music.js`.

## Licence: all CC0 (public domain dedication)

Every track here is CC0, taken from OpenGameArt, with the licence read off each item's own page
rather than inferred from a search filter.
CC0 rather than merely royalty-free is a deliberate choice: there is no attribution obligation to
carry into the build and nothing to re-verify later.

| file | title | source | licence |
|---|---|---|---|
| `cc0-punk-rock-metal.mp3` | Punk Rock Metal | https://opengameart.org/content/punk-rock-metal-background-music | CC0 |
| `cc0-metal-energetic.ogg` | Metal Energetic | https://opengameart.org/content/metal-song-energetic | CC0 |
| `cc0-punk-flesh-and-blood.mp3` | Flesh And Blood | https://opengameart.org/content/punk-hardcore | CC0 |

Credit is not required by CC0.
If any of these are kept in a released build it is still courteous to name the OpenGameArt
uploaders in the credits.

## Why the previous tracks were removed

Three Epidemic Sound tracks were here first (`santa-in-a-hurry`, `stormy-weather`,
`bring-me-up-higher`).
Epidemic Sound licenses for video and streaming, not for interactive software, so they could not
ship in a playable build.
They were deleted rather than left in place, because an unlicensed asset sitting in the tree is the
kind of thing that survives into a release by accident.

## Sourcing notes, if more tracks are needed

- **OpenGameArt filtered to CC0 + music** is the only source found with actual rock and a true
  public-domain dedication:
  `https://opengameart.org/art-search-advanced?keys=rock&field_art_type_tid[]=12&field_art_licence_tid[]=17981`
  Swap `keys=` for `metal`, `punk`, `guitar`, `driving`.
  **Verify each item individually.** Of eight rock/metal candidates checked, five were CC-BY and
  only three were CC0 — the search filter is not sufficient evidence.
- **Abstraction / Tallbeard "FREE Music Loop Bundle"** (https://tallbeard.itch.io/music-loop-bundle)
  is CC0, 100+ seamless loops built for games, and higher production quality than most of
  OpenGameArt — but it is ambient, chiptune and upbeat, with no rock.
- **NCS (ncs.io) IS NOT USABLE HERE.** Their usage policy makes tracks free for YouTube and Twitch
  creators only; to "Can I use NCS music in my game?" the answer is their commercial licensing form.
  Stream-safe is not game-safe.
- **Pixabay** allows free commercial use with no attribution and does not exclude games, but it is a
  bespoke royalty-free grant rather than a public-domain dedication. Fine if CC0 is not a hard
  requirement; not equivalent to CC0.
- **White Bat Audio** (Karl Casey) is the closest match to Burnout's actual sound. Free with credit,
  but "major film and game projects/releases" need a sync licence by email, so it is a per-project
  judgement rather than a blanket yes.

## Routing note

Music goes through its own gain straight to `destination`, NOT through `audio.js`'s master chain.
That chain has a glue bus, a level rider and a per-space convolution reverb, all correct for engine
and crash audio and wrong for music: the soundtrack would duck under the engine and pick up tunnel
reverb.
