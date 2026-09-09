#!/usr/bin/env bash
set -euo pipefail

source_root="${1:?pass the Linux-visible GKOS-Engine worktree path}"
qualification_root="${TMPDIR:-/tmp}/gkos-navigation-effects-linux-qualification"
node_cache="${TMPDIR:-/tmp}/gkos-node22-qualification"

mkdir -p "$node_cache"
cd "$node_cache"
curl -fsSLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
archive="$(awk '/linux-x64.tar.xz$/ { print $2 }' SHASUMS256.txt | head -n 1)"
test -n "$archive"
if [[ ! -f "$archive" ]]; then
  curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$archive"
fi
grep "  $archive$" SHASUMS256.txt | sha256sum -c -
if [[ ! -d "$node_cache/${archive%.tar.xz}" ]]; then
  tar -xf "$archive"
fi
node_root="$node_cache/${archive%.tar.xz}"

case "$qualification_root" in
  /tmp/gkos-navigation-effects-linux-qualification|/var/tmp/gkos-navigation-effects-linux-qualification) ;;
  *) echo "refusing to replace unexpected qualification path: $qualification_root" >&2; exit 1 ;;
esac
rm -rf -- "$qualification_root"
mkdir -p "$qualification_root"
tar \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=GKOS-Engine-Baseline \
  --exclude=GKOS-Engine-R4 \
  --exclude=gkos-standard-R15 \
  --exclude=build_instruct \
  -C "$source_root" -cf - . | tar -C "$qualification_root" -xf -

cd "$qualification_root"
export PATH="$node_root/bin:$PATH"
node --version
npm ci --ignore-scripts
npm run typecheck
npm run test:navigation
npm run pack:check
