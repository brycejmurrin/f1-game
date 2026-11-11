#!/usr/bin/env bash
# @doc Opt-in Blender 4.2.23 LTS install (the version the crew exporters pin), SHA-256 verified; --plan never installs.
# The cloud image does not ship Blender and the container is ephemeral, so a
# design session runs this once. Idempotent: an installed matching version is
# reused. Source: https://download.blender.org/release/Blender4.2/ (official
# tarball plus its published .sha256 list, checked before extraction).
set -euo pipefail

VERSION="4.2.23"
PREFIX="${BLENDER_PREFIX:-/opt}"
DIR="$PREFIX/blender-$VERSION-linux-x64"
BASE="https://download.blender.org/release/Blender${VERSION%.*}"
TARBALL="blender-$VERSION-linux-x64.tar.xz"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<HELP
usage: bash tools/env/install-blender.sh [--plan] [--help]

Installs Blender $VERSION LTS into $DIR (BLENDER_PREFIX overrides /opt) and
links /usr/local/bin/blender. --plan prints what would happen and exits.
HELP
  exit 0
fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--plan" ) ]]; then echo "Unknown arguments; use --help" >&2; exit 2; fi

if command -v blender >/dev/null && blender --version 2>/dev/null | head -1 | grep -q "Blender $VERSION"; then
  echo "blender: $(command -v blender) ($VERSION, already installed)"; exit 0
fi
if [[ "${1:-}" == "--plan" ]]; then echo "would install $BASE/$TARBALL into $DIR"; exit 0; fi

WORK="$(mktemp -d "$PREFIX/.blender-dl.XXXX")"
trap 'rm -rf "$WORK"' EXIT
curl -sSfL "$BASE/$TARBALL" -o "$WORK/$TARBALL"
curl -sSfL "$BASE/blender-$VERSION.sha256" -o "$WORK/sums"
(cd "$WORK" && grep " $TARBALL\$" sums | sha256sum -c -)
tar -xf "$WORK/$TARBALL" -C "$PREFIX"
ln -sfn "$DIR/blender" /usr/local/bin/blender
blender --version | head -1
