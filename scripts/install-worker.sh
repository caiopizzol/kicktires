#!/bin/sh
set -eu
umask 022

# Install committed source; never use a working tree as a live runner installation.
[ "$#" -eq 1 ] || { echo 'Usage: sudo install-worker.sh CHECKOUT' >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo 'Run this installer as root on the worker.' >&2; exit 1; }
[ "$(uname -s)" = Linux ] || { echo 'The worker requires Linux and Docker.' >&2; exit 1; }
export PATH="$PATH:/usr/sbin:/sbin"
source=$(cd "$1" && pwd)
for tool in git tar node bun docker flock groupadd getent install cmp; do
  command -v "$tool" >/dev/null || { echo "Install $tool before running this installer." >&2; exit 1; }
done
node -e 'if (+process.versions.node.split(".")[0] < 24) process.exit(1)' || { echo 'Node 24+ is required.' >&2; exit 1; }
bun --no-env-file -e 'const [a,b,c]=Bun.version.split(".").map(Number); if(a<1 || (a===1 && (b<3 || (b===3 && c<12)))) process.exit(1)' || { echo 'Bun 1.3.12+ is required.' >&2; exit 1; }
docker info >/dev/null
commit=$(git -C "$source" rev-parse --verify HEAD)
git -C "$source" diff --quiet HEAD -- || { echo 'Commit tracked changes first; the installer uses HEAD.' >&2; exit 1; }
[ -f "$source/src/github/cli.ts" ] || { echo 'Expected an Agent Review checkout.' >&2; exit 1; }

root=/opt/agent-review
release="$root/releases/$commit"
install -d -m 755 "$root/releases" "$root/bin" "$root/runtime/bin" /etc/agent-review
exec 9>"$root/install.lock"
flock --exclusive --wait 600 9
for tool in node bun; do
  if [ ! -e "$root/runtime/bin/$tool" ]; then
    install -m 755 "$(command -v "$tool")" "$root/runtime/bin/$tool"
  fi
done
export PATH="$root/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
node -e 'if (+process.versions.node.split(".")[0] < 24) process.exit(1)' || { echo 'Upgrade the installed worker Node runtime to 24+.' >&2; exit 1; }
bun --no-env-file -e 'const [a,b,c]=Bun.version.split(".").map(Number); if(a<1 || (a===1 && (b<3 || (b===3 && c<12)))) process.exit(1)' || { echo 'Upgrade the installed worker Bun runtime to 1.3.12+.' >&2; exit 1; }

if [ -e "$release" ]; then
  [ -f "$release/.agent-review-installed" ] || { echo "Unverified existing release: $release. Inspect it before retrying." >&2; exit 1; }
else
  mkdir "$release"
  trap 'rm -rf "$release"' EXIT HUP INT TERM
  git -C "$source" archive --format=tar HEAD > "$release/source.tar"
  tar -xf "$release/source.tar" -C "$release"
  rm "$release/source.tar"
  cd "$release"
  bun install --frozen-lockfile
  bun run check
  bun run build
  chmod -R go-w .
  printf '%s\n' "$commit" > .agent-review-installed
  chmod 644 .agent-review-installed
  trap - EXIT HUP INT TERM
fi

if docker image inspect agent-review-sandbox:0.1.0 >/dev/null 2>&1; then
  if [ -f /etc/agent-review/release ]; then
    active=$(cat /etc/agent-review/release)
    case "$active" in ''|*[!0-9a-f]*) echo 'Invalid active release.' >&2; exit 1 ;; esac
    [ "${#active}" -eq 40 ] || exit 1
    for file in Dockerfile.sandbox sandbox/browser-check.cjs; do
      cmp -s "$release/$file" "$root/releases/$active/$file" || {
        echo 'Sandbox source changed. Validate and rebuild the shared image during a planned worker upgrade.' >&2
        exit 1
      }
    done
  else
    echo 'Resuming first installation: rebuild the sandbox from the pinned source.'
    docker build -t agent-review-sandbox:0.1.0 -f "$release/Dockerfile.sandbox" "$release"
  fi
else
  docker build -t agent-review-sandbox:0.1.0 -f "$release/Dockerfile.sandbox" "$release"
fi
getent group agent-review >/dev/null || groupadd --system agent-review
install -d -m 755 /etc/tmpfiles.d
cat > /etc/tmpfiles.d/agent-review.conf <<'TMPFILES'
d /run/lock/agent-review 0755 root root -
f /run/lock/agent-review/review.lock 0660 root agent-review -
TMPFILES
install -d -m 755 /var/lock/agent-review
touch /var/lock/agent-review/review.lock
chown root:agent-review /var/lock/agent-review/review.lock
chmod 660 /var/lock/agent-review/review.lock

if [ ! -e /etc/agent-review/release ]; then
  install -m 755 "$release/scripts/run-github-review.sh" "$root/bin/review-pr"
  printf '%s\n' "$commit" > /etc/agent-review/release.next
  chmod 644 /etc/agent-review/release.next
  mv /etc/agent-review/release.next /etc/agent-review/release
  echo "Activated first worker release: $commit"
else
  echo "Installed release: $commit"
  echo "Active release unchanged: $(cat /etc/agent-review/release)"
fi
printf '\nNext: register a repository runner and install its trusted profile.\nSee %s/docs/github-actions.md\n' "$release"
