#!/usr/bin/env bash
# @doc After a shallow checkout, fetch the one commit CI will diff against.
# @section runner
set -eu
BASE="${1:-}"
case "$BASE" in
  ""|0000000000000000000000000000000000000000) exit 0 ;;
esac
if git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  exit 0
fi
git fetch --depth=1 origin "$BASE" 2>/dev/null || git fetch --depth=1 origin "$BASE^{commit}" 2>/dev/null || true
git cat-file -e "${BASE}^{commit}" 2>/dev/null || {
  echo "could not fetch comparison base $BASE" >&2
  exit 1
}
