# SFX

**These are OWNED and INTENTIONAL. Do not quarantine, move or delete them.**
`audio.js` loads all eight by name (see its `SFX` map); if they 404 the mix falls back to synthesis,
so a sweep that removes them degrades the game silently rather than breaking a build.

## Licence: all CC0 (public domain dedication)

Every file here is CC0 1.0 Universal.
Provenance was recovered from each file's own ID3 tags, which carry the source archive.org item URL,
and the licence was then read off each item page individually rather than assumed from the set.

| file | source item | licence |
|---|---|---|
| `boost-whoosh-01.mp3` | https://archive.org/details/SSE_Library_SWOOSHES | CC0 1.0 |
| `boost-whoosh-02.mp3` | https://archive.org/details/SSE_Library_SWOOSHES | CC0 1.0 |
| `crash-impact-01.mp3` | https://archive.org/details/SSE_Library_DESTRUCTION | CC0 1.0 |
| `crash-impact-02.mp3` | https://archive.org/details/SSE_Library_DESTRUCTION | CC0 1.0 |
| `engine-idle-02.mp3` | https://archive.org/details/SSE_Library_VEHICLES | CC0 1.0 |
| `engine-loop-01.mp3` | https://archive.org/details/SSE_Library_VEHICLES | CC0 1.0 |
| `tire-screech-01.mp3` | https://archive.org/details/SSE_Library_VEHICLES | CC0 1.0 |
| `tire-screech-02.mp3` | https://archive.org/details/SSE_Library_VEHICLES | CC0 1.0 |

All three items are from the USC Optical Sound Effects Library (USC Cinema / Sunset Editorial
collection), uploaded to archive.org by Jason Scott in May 2023, and carry the CC0 1.0 mark on the
item page itself.

Credit is not required by CC0.
Naming the USC Optical Sound Effects Library in the credits is courteous if these ship.

## Note on `reference/audio/`

`reference/audio/` holds byte-identical copies of these eight files.
`STATE-HISTORY.md` describes that directory as "tonal target only, not game rips", which was true of
its intent but is not a licence distinction: the files are CC0 either way, so shipping the copies in
`game/sfx/` is fine.
The relationship is worth knowing before anyone tries to dedupe the two directories - `audio.js`
loads from `sfx/`, so that is the copy that must stay.
