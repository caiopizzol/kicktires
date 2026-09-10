#!/bin/sh
set -eu

release=$1
profile=$2
case "$release" in
  ''|*[!0-9a-f]*) echo 'Expected a pinned release commit' >&2; exit 1 ;;
esac
[ "${#release}" -eq 40 ] || exit 1

export PATH=/opt/agent-review/runtime/bin:/usr/bin:/bin
export AGENT_REVIEW_RUNS_DIR="$HOME/agent-review-runs"
entry="/opt/agent-review/releases/$release/src/github/cli.ts"
[ -r "$entry" ] || { echo 'Reviewer release is not installed' >&2; exit 1; }

exec flock --exclusive --close --wait 600 /var/lock/agent-review/review.lock \
  timeout --signal=TERM --kill-after=30s 1200 \
  bun "$entry" --profile "$profile"
