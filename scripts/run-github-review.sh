#!/bin/sh
set -eu

[ "$#" -eq 1 ] || { echo "Usage: review-pr TRUSTED_PROFILE" >&2; exit 1; }
profile=$1
release=$(cat /etc/agent-review/release)
case "$release" in
  ''|*[!0-9a-f]*) echo 'Expected a pinned release commit' >&2; exit 1 ;;
esac
[ "${#release}" -eq 40 ] || exit 1

export PATH=/opt/agent-review/runtime/bin:/usr/bin:/bin
export AGENT_REVIEW_RUNS_DIR="$HOME/agent-review-runs"
installation="/opt/agent-review/releases/$release"
entry="$installation/src/github/cli.ts"
[ -r "$entry" ] || { echo 'Reviewer release is not installed' >&2; exit 1; }

cd "$installation"
printf 'Agent Review release: %s\n' "$release"
exec flock --exclusive --close --wait 600 /var/lock/agent-review/review.lock \
  timeout --signal=TERM --kill-after=30s 1200 \
  bun --no-env-file "$entry" --profile "$profile"
