#!/bin/bash
# Rebuild game/map/paradise.json from the reference imagery. Wave T, the `digitise` piece.
#
# The chain is four tools and the intermediates are big raw blobs, so it lives here rather than in
# a comment nobody types correctly. Nothing in the game reads these intermediates - `paradise.json`
# is the durable artefact and is committed.
#
#   bash tools/map-build.sh [workdir]
set -euo pipefail
cd "$(dirname "$0")/.."
W="${1:-$(mktemp -d)}"
mkdir -p "$W"

echo "== decode"
node tools/_mapdump.mjs reference/map/ign-map.jpg "$W/ign"

echo "== trace"
node tools/_maptrace.mjs "$W/ign" --out "$W/raw.json" --preview "$W/prev"

echo "== graph"
node tools/_mapgraph.mjs "$W/raw.json" \
  --mask "$W/prev/04-opened" --img "$W/ign" --pins "$W/raw.json.pins" \
  --out game/map/paradise.json

echo "== validate"
node game/map/validate.mjs

echo "== overlay (the acceptance evidence - LOOK AT IT)"
node tools/_mapoverlay.mjs game/map/paradise.json --img "$W/ign" --out "$W/ov"
node tools/_mappng.mjs "$W/ov" verdicts/wave-t/digitise-overlay.png

echo
echo "workdir: $W"
echo "stage previews: $W/prev/*.rgba  (node tools/_mappng.mjs <prefix> out.png to view)"
