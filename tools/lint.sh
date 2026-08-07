#!/bin/bash
# Parse-check every game module under ESM goal. `node --check foo.js` uses the
# CommonJS goal and silently misses duplicate top-level declarations, so copy to
# .mjs first. Run this before any screenshot; a syntax error shows up only as a
# 60 s waitForFunction timeout otherwise.
cd "$(dirname "$0")/.." || exit 1
tmp=$(mktemp -d); fail=0
# game/map/*.js is in this glob deliberately. It was NOT, until wave T's `generate` piece found the
# gap: graph.js and blocks.js are imported by game code and by node harnesses, and a syntax error in
# either linted clean and presented as a 60 s waitForFunction timeout - exactly the failure the
# comment above says this script exists to prevent. The name is flattened so game/map/foo.js and
# game/foo.js cannot collide in the temp dir.
for f in game/*.js game/map/*.js; do
  [ -e "$f" ] || continue
  flat="$tmp/$(echo "${f%.js}" | tr / _).mjs"
  cp "$f" "$flat"
  if ! out=$(node --check "$flat" 2>&1); then
    echo "SYNTAX $f"; echo "$out" | head -5; fail=1
  fi
done
rm -rf "$tmp"

# The road graph is data, and a hand-edited graph must not be able to land broken. T3's rule is
# that no road may go nowhere, and this is where that is enforced.
if [ -f game/map/paradise.json ]; then
  if ! out=$(node game/map/validate.mjs 2>&1); then
    echo "MAP game/map/paradise.json"; echo "$out" | tail -20; fail=1
  fi
fi

[ $fail -eq 0 ] && echo "lint ok"
exit $fail
