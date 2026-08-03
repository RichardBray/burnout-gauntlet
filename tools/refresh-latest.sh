#!/bin/bash
# Repoint shots/<piece>-latest.png at the newest render for that piece, so
# progress.html shows the CURRENT round rather than whatever was last hand-copied.
#
# Preference order per piece:
#   1. newest shots/<piece>-*.png      (a critic's or builder's own labelled shot)
#   2. newest shots/<sceneId>-*.png    (a plain scene render, for pieces whose
#                                       shots are named after the scene instead)
# `audio` has no image and is skipped by design.
#
# Run after every wave:  ./tools/refresh-latest.sh
set -u
cd "$(dirname "$0")/.." || exit 1

# piece : scene : extra shot-name prefixes critics actually use
# (critics abbreviate — sky-k1.png, crash-k1.png, world-k1.png — so the piece name
#  alone misses their shots and the board silently shows a stale round.)
pieces=(
  "sky-lighting:dusk-highway-chase:sky"
  "road-surface:wet-night-asphalt:road"
  "car-paint:car-paint-closeup:car"
  "environment:daytime-downtown:world environment"
  "chase-camera:dusk-highway-chase:camera cam"
  "boost-fx:boost-blur:boost"
  "crash-cam:crash-cam:crash"
  "damage-model:crash-cam:damage"
  "hud:hud-overlay:hud"
)

for entry in "${pieces[@]}"; do
  IFS=':' read -r piece scene aliases <<<"$entry"

  # Pick the newest shot across ALL candidate prefixes at once. Do NOT stop at the
  # first prefix that matches: the piece name is the least abbreviated, so a
  # first-match rule keeps a stale `sky-lighting-r11-build.png` in preference to the
  # newer `sky-k1.png` and the board reports the wrong round.
  # Excludes the -latest.png target itself and leading-underscore scratch files.
  cands=""
  for pre in "$piece" $aliases "$scene"; do
    cands="$cands $(ls shots/"$pre"-*.png 2>/dev/null)"
  done
  # Drop shots taken in a scene OTHER than this piece's primary scene. Critics render
  # secondary scenes too (sky-k1-night.png, car-k1-dusk.png), and those would otherwise
  # win on mtime and get paired against the primary scene's reference image — an
  # apples-to-oranges comparison on the board.
  filter=""
  for tok in dusk night wet daytime midday; do
    case "$scene" in *"$tok"*) ;; *) filter="$filter -e -$tok" ;; esac
  done
  newest=$(ls -t $cands 2>/dev/null \
           | grep -v -- "-latest\.png$" | grep -v '/_' \
           | { [ -n "$filter" ] && grep -v $filter || cat; } | head -1)

  if [ -z "$newest" ]; then
    echo "  --  $piece: no render found"
    continue
  fi
  cp "$newest" "shots/$piece-latest.png"
  echo "  ok  $piece <- $newest"
done

# Regenerate the board's data file. progress.html reads progress.json, NOT STATE.md —
# it used to scrape a markdown table out of STATE.md and went silently blank for
# several waves when that table's columns changed. Keep this call here so the board
# can never lag the verdicts on disk.
node tools/progress.mjs
