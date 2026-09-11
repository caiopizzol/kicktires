#!/bin/sh
set -eu
umask 022

checkout=
version=${KICKTIRES_VERSION:-}
case "$#:${1:-}" in
  0:) ;;
  2:--source) checkout=$(cd "$2" && pwd) ;;
  2:--version) version=$2 ;;
  *) echo 'Usage: sudo sh install.sh [--source CHECKOUT | --version FULL_COMMIT_SHA]' >&2; exit 1 ;;
esac
if [ -z "$checkout" ]; then
  case "$version" in ''|*[!0-9a-f]*) echo 'Specify a full release commit with --version.' >&2; exit 1 ;; esac
  [ "${#version}" -eq 40 ] || { echo 'Expected a full 40-character commit.' >&2; exit 1; }
fi
[ "$(id -u)" -eq 0 ] || { echo 'Run as root on the worker VM.' >&2; exit 1; }
export PATH=/opt/kicktires/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
. /etc/os-release
case "$ID:$VERSION_ID" in ubuntu:24.04|ubuntu:26.04) ;; *) echo 'Supported: Ubuntu 24.04 or 26.04.' >&2; exit 1 ;; esac
case "$(dpkg --print-architecture)" in
  amd64) arch=x64; bunarch=x64; nodehash=41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df; bunhash=951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f ;;
  arm64) arch=arm64; bunarch=aarch64; nodehash=e7adfca03d9173276114a6f2219df1a7d25e1bfd6bbd771d3f839118a2053094; bunhash=a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b ;;
  *) echo 'Supported architectures: amd64 and arm64.' >&2; exit 1 ;;
esac
validate_checkout() {
  [ -f "$checkout/scripts/install-worker.sh" ] || { echo 'Expected a kicktires source checkout.' >&2; exit 1; }
  if command -v git >/dev/null; then
    git -C "$checkout" rev-parse --verify HEAD >/dev/null
    git -C "$checkout" diff --quiet HEAD -- || { echo 'Commit tracked source changes before installing.' >&2; exit 1; }
  fi
}
if [ -n "$checkout" ]; then validate_checkout; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg diffutils tar unzip xz-utils util-linux coreutils
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
if [ -z "$checkout" ]; then
  checkout="$temporary/source"
  if [ -n "${GH_TOKEN:-}" ]; then
    cat > "$temporary/askpass" <<'ASKPASS'
#!/bin/sh
case "$1" in *Username*) printf '%s\n' x-access-token ;; *) printf '%s\n' "$GH_TOKEN" ;; esac
ASKPASS
    chmod 700 "$temporary/askpass"
    export GIT_ASKPASS="$temporary/askpass" GH_TOKEN
  fi
  export GIT_TERMINAL_PROMPT=0
  git init -q "$checkout"
  git -C "$checkout" remote add origin https://github.com/caiopizzol/kicktires.git
  git -C "$checkout" -c credential.helper= fetch --depth 1 origin "$version" || {
    echo 'Cannot download kicktires. For a private repository, supply GH_TOKEN with repository read access or use --source.' >&2; exit 1;
  }
  git -C "$checkout" checkout -q --detach FETCH_HEAD
  [ "$(git -C "$checkout" rev-parse HEAD)" = "$version" ] || exit 1
fi
unset GH_TOKEN GIT_ASKPASS
validate_checkout
if ! command -v docker >/dev/null; then
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/kicktires-docker.asc
  chmod 644 /etc/apt/keyrings/kicktires-docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/kicktires-docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/kicktires-docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
systemctl enable --now docker
docker info >/dev/null
runtime=/opt/kicktires/runtime/bin
install -d -m 755 "$runtime"
if [ ! -e "$runtime/node" ]; then
  curl -fL --retry 3 "https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-$arch.tar.xz" -o "$temporary/node.tar.xz"
  printf '%s  %s\n' "$nodehash" "$temporary/node.tar.xz" | sha256sum -c -
  tar -xf "$temporary/node.tar.xz" -C "$temporary"
  install -m 755 "$temporary/node-v24.14.0-linux-$arch/bin/node" "$runtime/node.next"
  mv "$runtime/node.next" "$runtime/node"
fi
if [ ! -e "$runtime/bun" ]; then
  curl -fL --retry 3 "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-$bunarch.zip" -o "$temporary/bun.zip"
  printf '%s  %s\n' "$bunhash" "$temporary/bun.zip" | sha256sum -c -
  unzip -q "$temporary/bun.zip" -d "$temporary"
  install -m 755 "$temporary/bun-linux-$bunarch/bun" "$runtime/bun.next"
  mv "$runtime/bun.next" "$runtime/bun"
fi
sh "$checkout/scripts/install-worker.sh" "$checkout"
echo 'Worker installed. Add a trusted profile and repository runner using docs/github-actions.md.'
