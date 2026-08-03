#!/bin/bash
# Human-readable live feed of whatever the gauntlet loop is doing right now.
# Follows current.log (a symlink the driver repoints each round) and renders
# the stream-json event log as one line per assistant message / tool call.
#
#   ./watch.sh

set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -e "$DIR/current.log" ]]; then
  echo "no round running yet - start ./run-gauntlet.sh first"
  exit 1
fi

tail -F -n 200 "$DIR/current.log" 2>/dev/null | jq -rj --unbuffered '
  def clip($n): if (. | length) > $n then .[0:$n] + "..." else . end;
  if .type == "assistant" then
    (.message.content // [])[] |
      if .type == "text" then (.text | clip(400)) + "\n"
      elif .type == "tool_use" then
        "  -> " + .name + " " + ((.input.description // .input.prompt // .input.file_path // .input.command // "") | tostring | clip(120)) + "\n"
      else empty end
  elif .type == "result" then
    "\n=== round done: " + (.subtype // "ok") + " (" + ((.num_turns // 0) | tostring) + " turns) ===\n"
  else empty end
'
