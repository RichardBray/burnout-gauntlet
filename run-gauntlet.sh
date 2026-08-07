#!/bin/bash
# Overnight driver for the Burnout Paradise gauntlet loop.
#
# Each iteration is a FRESH headless Claude Code session, so context window
# exhaustion can never stall the run - all state lives in STATE.md on disk.
#
# Accounts rotate. Each entry in ACCOUNTS is a CLAUDE_CONFIG_DIR with its own
# independent 5-hour window. When one hits its limit we mark it blocked until
# the reset epoch the CLI reports and immediately try the next account; only
# when every account is blocked do we sleep, and then only until the earliest
# reset. Set ACCOUNTS to a single entry to get the old sleep-and-wait behaviour.
#
# Run it wrapped in caffeinate so the machine stays awake:
#   caffeinate -dims bash run-gauntlet.sh

set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS="$DIR/logs"
DRIVER_LOG="$DIR/driver.log"
FALLBACK_SLEEP=$((5 * 60 * 60))
MIN_ROUND_SECONDS=60

# Personal account only. A single entry gives the sleep-and-wait behaviour described
# above: on a limit the driver sleeps until that account's own reset, with nothing to
# rotate to. Add "$HOME/.claude-work" back as a second entry to re-enable rotation.
ACCOUNTS=("$HOME/.claude")
# blocked_until[i] = epoch seconds before which ACCOUNTS[i] must not be used.
blocked_until=()
for _ in "${ACCOUNTS[@]}"; do blocked_until+=(0); done

mkdir -p "$LOGS"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$DRIVER_LOG"
}

# Epoch at which the account that produced this log regains capacity.
reset_epoch_from_log() {
  local logfile="$1" epoch now
  # The CLI reports limits as: "Claude AI usage limit reached|<epoch seconds>"
  epoch="$(grep -oE 'usage limit reached\|[0-9]+' "$logfile" | tail -1 | cut -d'|' -f2)"
  now="$(date +%s)"
  if [[ -n "$epoch" && "$epoch" -gt "$now" ]]; then
    printf '%s' "$epoch"
  else
    printf '%s' $((now + FALLBACK_SLEEP))
  fi
}

# Index of the next usable account. Sleeps until the earliest reset if all are
# blocked, so this always eventually returns something runnable.
pick_account() {
  local now soonest i
  while :; do
    now="$(date +%s)"
    soonest=""
    for i in "${!ACCOUNTS[@]}"; do
      if (( blocked_until[i] <= now )); then
        printf '%s' "$i"
        return
      fi
      if [[ -z "$soonest" ]] || (( blocked_until[i] < soonest )); then
        soonest="${blocked_until[i]}"
      fi
    done
    local wait=$(( soonest - now + 60 ))
    log "all ${#ACCOUNTS[@]} accounts limited - sleeping ${wait}s (until $(date -r $((now + wait)) '+%H:%M:%S'))"
    sleep "$wait"
  done
}

round=1
fast_failures=0
while :; do
  acct="$(pick_account)"
  config_dir="${ACCOUNTS[$acct]}"
  logfile="$LOGS/round-$(printf '%03d' "$round")-$(date '+%Y%m%d-%H%M%S').log"
  log "round $round starting on $(basename "$config_dir") -> $logfile"
  started="$(date +%s)"

  ln -sf "$logfile" "$DIR/current.log"

  # Equivalent of the `fcc` fish alias, with the config dir chosen above.
  #
  # CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 waits indefinitely for background
  # subagents. The default ceiling is 600s, and a builder round here routinely
  # runs 20-40 minutes: round 13 launched five agents, hit the ceiling at 884s,
  # and killed all five mid-edit, leaving five game/*.js files half-modified
  # with no verdicts. Without this the loop cannot complete a single wave.
  CLAUDE_CONFIG_DIR="$config_dir" \
  CLAUDE_CODE_NO_FLICKER=1 \
  CLAUDE_QUIET=1 \
  CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 \
  claude \
    --dangerously-skip-permissions \
    --model opus \
    --verbose \
    --output-format stream-json \
    -p "$(cat "$DIR/PROMPT.md")" \
    >"$logfile" 2>&1
  status=$?

  elapsed=$(( $(date +%s) - started ))
  log "round $round finished (exit $status, ${elapsed}s, $(basename "$config_dir"))"

  # A genuine lockout ALWAYS exits non-zero. Without that guard the pattern
  # below matches this very script whenever the agent reads its own driver,
  # and a healthy round gets punished with a 5-hour sleep.
  if (( status != 0 )) && grep -qiE 'usage limit reached\|[0-9]+|rate.?limit|too many requests|429' "$logfile"; then
    fast_failures=0
    blocked_until[acct]="$(reset_epoch_from_log "$logfile")"
    log "$(basename "$config_dir") limited until $(date -r "${blocked_until[acct]}" '+%H:%M:%S') - rotating"
  elif (( elapsed < MIN_ROUND_SECONDS )); then
    # Something failed fast (auth, crash, bad flag) - or a limit we failed to
    # recognise. Escalate the backoff so an unrecognised 5-hour lockout costs a
    # handful of quiet retries rather than thirty.
    fast_failures=$((fast_failures + 1))
    if (( fast_failures >= 3 )); then
      backoff=3600
    else
      backoff=600
    fi
    log "round ended in ${elapsed}s (fast failure #$fast_failures) - backing off ${backoff}s; tail: $(tail -3 "$logfile" | tr '\n' ' ')"
    sleep "$backoff"
  else
    fast_failures=0
    sleep 30
  fi

  round=$((round + 1))
done
