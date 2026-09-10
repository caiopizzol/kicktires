#!/bin/sh
set -eu

[ "$#" -eq 2 ] && [ "$1" = --source ] || {
  echo 'Usage: sudo sh install.sh --source /path/to/agent-review' >&2; exit 1;
}
[ "$(id -u)" -eq 0 ] || { echo 'Run as root on the worker VM.' >&2; exit 1; }
export PATH=/opt/agent-review/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
. /etc/os-release
case "$ID:$VERSION_ID" in ubuntu:24.04|ubuntu:26.04) ;; *) echo 'Supported: Ubuntu 24.04 or 26.04.' >&2; exit 1 ;; esac
case "$(dpkg --print-architecture)" in
  amd64) arch=x64; bunarch=x64; nodehash=41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df; bunhash=951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f ;;
  arm64) arch=arm64; bunarch=aarch64; nodehash=e7adfca03d9173276114a6f2219df1a7d25e1bfd6bbd771d3f839118a2053094; bunhash=a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b ;;
  *) echo 'Supported architectures: amd64 and arm64.' >&2; exit 1 ;;
esac
checkout=$(cd "$2" && pwd)
[ -f "$checkout/scripts/install-worker.sh" ] || { echo 'Expected an Agent Review source checkout.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg tar unzip xz-utils util-linux coreutils
if ! command -v docker >/dev/null; then
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/agent-review-docker.asc
  chmod 644 /etc/apt/keyrings/agent-review-docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/agent-review-docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/agent-review-docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
systemctl enable --now docker
docker info >/dev/null
runtime=/opt/agent-review/runtime/bin
install -d -m 755 "$runtime"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
if [ ! -e "$runtime/node" ]; then
  curl -fL --retry 3 "https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-$arch.tar.xz" -o "$temporary/node.tar.xz"
  printf '%s  %s\n' "$nodehash" "$temporary/node.tar.xz" | sha256sum -c -
  tar -xf "$temporary/node.tar.xz" -C "$temporary"
  install -m 755 "$temporary/node-v24.14.0-linux-$arch/bin/node" "$runtime/node"
fi
if [ ! -e "$runtime/bun" ]; then
  curl -fL --retry 3 "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-$bunarch.zip" -o "$temporary/bun.zip"
  printf '%s  %s\n' "$bunhash" "$temporary/bun.zip" | sha256sum -c -
  unzip -q "$temporary/bun.zip" -d "$temporary"
  install -m 755 "$temporary/bun-linux-$bunarch/bun" "$runtime/bun"
fi
sh "$checkout/scripts/install-worker.sh" "$checkout"
echo 'Worker installed. Add a trusted profile and repository runner using docs/github-actions.md.'
