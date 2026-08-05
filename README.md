# Burnout Gauntlet

An open-world arcade racer in Three.js, built by a self-looping agent that compares its own output against real Burnout Paradise references.

## Play it

Start the static server, then open the game.
The server must be running: the game loads ES modules and fetches assets, so opening `index.html` as a `file://` URL will not work.

```sh
cd /Users/robray/fc/demos/burnout-gauntlet
node tools/serve.mjs
```

- Game: http://localhost:8777/game/index.html
- Progress board: http://localhost:8777/

The server serves the repo root on port 8777, so one process covers the game, the reference stills, the critic screenshots and `STATE.md`.
Leave it running in its own terminal tab.

### Controls

| action | keys |
|---|---|
| throttle | W / Up |
| brake | S / Down |
| steer | A D / Left Right |
| boost | Shift |
| handbrake | Space |

Click the page once before driving.
Browsers only allow audio to start after a user gesture, so the engine stays silent until you click.

A specific camera situation can be loaded directly by hash, which is how the critics render matched comparisons: `game/index.html#scene=dusk-highway-chase`.
The scene ids live in `game/scenes.js`.

## Run the improvement loop

```sh
cd /Users/robray/fc/demos/burnout-gauntlet
caffeinate -dims bash run-gauntlet.sh
```

Each round is a fresh headless Claude Code session driven by `PROMPT.md`, so a full context window can never stall the run.
All state lives on disk in `STATE.md`, which every round reads on startup and rewrites before it ends.

`caffeinate -dims` keeps the machine awake, including with the lid closed while on AC power, and stops the moment the script exits.
Note that it does not guarantee the network stays associated: one overnight round lost DNS and burned 94 minutes in API retries.

The driver rotates between the accounts listed in `ACCOUNTS` (a `CLAUDE_CONFIG_DIR` each, one 5-hour window each).
When one is rate limited it marks that account blocked until the reset time the CLI reports and switches to the next, sleeping only when every account is blocked.

Editing `run-gauntlet.sh` while it runs has no effect until you restart it, because bash parses the whole loop into memory up front.
Editing `PROMPT.md` takes effect on the next round with no restart needed.

### Watch it work

```sh
bash watch.sh
```

Renders the live round's event stream as one line per message and tool call.
It follows `current.log`, a symlink the driver repoints each round, so it survives round boundaries.

Other views:

- `driver.log` - one line per round: start, exit code, duration, account, any rate-limit sleep
- `logs/round-NNN-*.log` - the full stream-json event log for each round
- `STATE.md` - the handoff file, and the fastest way to see where the work actually is

## Layout

```
game/            the game itself, static ES modules, three.js via importmap
reference/       real Burnout Paradise stills and audio, labelled by camera situation
reference/INDEX.md  one line per reference, with a "what makes it look real" spec column
shots/           critic screenshots
verdicts/wave-*/ one report per piece per wave
tools/           measurement harnesses, the screenshot harness, lint.sh
STATE.md         live state: current wave, per-piece status, exact next action
STATE-HISTORY.md older sessions, kept for grep only, never read in full
PROMPT.md        what each round is told to do
run-gauntlet.sh  the driver loop
```

Render a scene to a PNG without a browser:

```sh
node tools/shot.mjs --scene dusk-highway-chase --out shots/check.png
```

Check the tree parses after any interruption:

```sh
bash tools/lint.sh
```

Be aware that `lint ok` means the tree parses, not that the game runs.
Render a scene as well before trusting a mid-round stop.
