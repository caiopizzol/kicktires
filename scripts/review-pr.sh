#!/bin/sh
set -eu

[ "$#" -eq 1 ] || { echo "Usage: review-pr TRUSTED_PROFILE" >&2; exit 1; }
profile=$1
release=$(cat /etc/kicktires/release)
case "$release" in
  ''|*[!0-9a-f]*) echo 'Expected a pinned release commit' >&2; exit 1 ;;
esac
[ "${#release}" -eq 40 ] || exit 1

export PATH=/opt/kicktires/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export KICKTIRES_RUNS_DIR="$HOME/kicktires-runs"
installation="/opt/kicktires/releases/$release"
entry="$installation/src/github/cli.ts"
[ -r "$entry" ] || { echo 'Reviewer release is not installed' >&2; exit 1; }

cd "$installation"
printf 'kicktires release: %s\n' "$release"
exec flock --exclusive --close --wait 600 /var/lock/kicktires/review.lock \
  timeout --signal=TERM --kill-after=30s 1200 \
  bun --no-env-file "$entry" --profile "$profile"
