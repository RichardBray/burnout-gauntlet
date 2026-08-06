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

**Do not trust OpenGameArt's CC0 search filter.**
`field_art_licence_tid[]=17981` is documented as the CC0 filter and it returns CC-BY items anyway.
Six of the ten candidates shortlisted for T7 turned out to be CC-BY 3.0, CC-BY 4.0 or OGA-BY once
their own pages were read, including several that would have been the obvious picks for a racing
game (Synthwave To Drive At Oceanside, 90s Racer Techno, Techno Drive, Dreamstate, Thrust Sequence,
Wasteland Overdrive). They were dropped rather than shipped with an attribution obligation nobody
would remember to honour. Read the page. Every time.

| file | title | artist | genre | source | licence |
|---|---|---|---|---|---|
| `cc0-punk-rock-metal.ogg` | Punk Rock Metal | Kim Lightyear | rock | https://opengameart.org/content/punk-rock-metal-background-music | CC0 |
| `cc0-metal-energetic.ogg` | Metal Energetic | Kim Lightyear | rock | https://opengameart.org/content/metal-song-energetic | CC0 |
| `cc0-punk-flesh-and-blood.ogg` | Flesh And Blood | Kim Lightyear | rock | https://opengameart.org/content/punk-hardcore | CC0 |
| `cc0-elec-night-prowler.ogg` | Night Prowler | section31 | electronic | https://opengameart.org/content/night-prowler | CC0 |
| `cc0-elec-cyberpunk-moonlight-sonata.ogg` | Cyberpunk Moonlight Sonata | Joth | electronic | https://opengameart.org/content/cyberpunk-moonlight-sonata | CC0 |
| `cc0-elec-back-in-the-80s.ogg` | Back In The 80s | HoliznaCC0 | electronic | https://opengameart.org/content/happy-pop-electronic-collection | CC0 |
| `cc0-pop-jay.ogg` | Jay | Pro Sensory | pop | https://opengameart.org/content/pop-music | CC0 |
| `cc0-pop-lay-low.ogg` | Lay Low | Pro Sensory | pop | https://opengameart.org/content/pop-music | CC0 |
| `cc0-pop-happy-dance.ogg` | Happy Dance | HoliznaCC0 | pop | https://opengameart.org/content/happy-pop-electronic-collection | CC0 |

Credit is not required by CC0.
If any of these are kept in a released build it is still courteous to name the OpenGameArt
uploaders in the credits.

## Loudness: every track normalised to -12 LUFS

The nine tracks arrived spread across **9.4 LU** of integrated loudness, which is not a mixing
nuance - it is the difference between a track that buries the engine and one the player cannot
hear over it, on the same volume slider.

Measured with `ffmpeg -af ebur128`, before and after a two-pass `loudnorm` at `I=-12 TP=-1.5
LRA=11` in linear mode:

| track | before | after |
|---|---|---|
| Flesh And Blood | -8.4 | -11.9 |
| Night Prowler | -9.4 | -11.7 |
| Metal Energetic | -11.1 | -11.5 |
| Back In The 80s | -11.2 | -12.6 |
| Jay | -10.9 | -12.0 |
| Lay Low | -12.3 | -12.1 |
| Happy Dance | -13.0 | -12.0 |
| Cyberpunk Moonlight Sonata | -13.0 | -12.3 |
| Punk Rock Metal | -17.8 | -12.7 |

Spread after: **1.2 LU**. Two-pass rather than one-pass because a single-pass `loudnorm` is a
dynamic processor and will squash a track's own dynamics to hit the target; the two-pass form
measures first and then applies a fixed linear gain, which moves the level and changes nothing
else. `TP=-1.5` leaves headroom so no track clips once the music gain is applied on top.

**All nine files are now Ogg Vorbis (`-q:a 4`).** They were a mix of MP3 and Ogg; since every file
had to be re-encoded to carry the normalisation anyway, they were unified. This halved the
directory: 4.2 MB of source MP3 for the three original tracks became 4.0 MB for those three plus
11.9 MB for six more. Every harness under `tools/` that serves the game had `.ogg` added to its
MIME table in the same commit - a media element silently refuses a file served as
`application/octet-stream`, which fails as "the music does not play" with nothing in the console.

## Why the previous tracks were removed

Three Epidemic Sound tracks were here first (`santa-in-a-hurry`, `stormy-weather`,
`bring-me-up-higher`).
Epidemic Sound licenses for video and streaming, not for interactive software, so they could not
ship in a playable build.
They were deleted rather than left in place, because an unlicensed asset sitting in the tree is the
kind of thing that survives into a release by accident.

## Sourcing notes, if more tracks are needed

- **OpenGameArt filtered to CC0 + music** is still the best starting point, but see the warning
  above: the filter is a shortlist, not a guarantee.
  `https://opengameart.org/art-search-advanced?keys=rock&field_art_type_tid[]=12&field_art_licence_tid[]=17981`
  Swap `keys=` for `metal`, `punk`, `guitar`, `driving`, `synthwave`, `techno`, `pop`, `upbeat`.
- Read the licence off `License(s):` in the item's own page markup. `CC0` is the only acceptable
  value; `CC-BY 3.0`, `CC-BY 4.0` and `OGA-BY 3.0` all carry attribution obligations.
- Normalise anything new to the -12 LUFS target above before committing it, or it will be the one
  track people reach for the volume slider during.
- `tools/_t7-music.mjs` boots the real page, clicks the real DRIVE button and asserts that every
  file in the playlist actually decodes. Run it after adding anything.
