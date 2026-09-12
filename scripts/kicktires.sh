#!/bin/sh
set -eu
export PATH=/opt/kicktires/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
release=$(cat /etc/kicktires/release)
case "$release" in ''|*[!0-9a-f]*) echo 'Invalid installed release.' >&2; exit 1 ;; esac
[ "${#release}" -eq 40 ] || exit 1
exec bun --no-env-file "/opt/kicktires/releases/$release/scripts/setup-worker.ts" "$@"
