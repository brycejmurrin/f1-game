#!/usr/bin/env bash
# Dashboard / environment-build install for Apex 26 Cloud Agents.
# Idempotent. Exit 0 when the snapshot already has usable deps even if apt
# or the npm registry is unreachable (restricted egress).
#
# Not `set -e`: apt-get update 404s on archive.ubuntu.com and npm can crash
# with "Exit handler never called!" after registry ECONNRESET
# (measured 2026-08-17, bld-20260817-e70b375f).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

need_pkg() {
  dpkg -s "$1" >/dev/null 2>&1
}

ensure_apt_pkgs() {
  local missing=()
  local p
  for p in mesa-vulkan-drivers vulkan-tools xvfb; do
    if need_pkg "$p"; then
      continue
    fi
    missing+=("$p")
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    echo "apt packages already present: mesa-vulkan-drivers vulkan-tools xvfb"
    return 0
  fi
  echo "apt missing: ${missing[*]} — attempting install"
  if ! sudo DEBIAN_FRONTEND=noninteractive apt-get update -y; then
    echo "WARN: apt-get update failed (Ubuntu mirrors often blocked on restricted egress)" >&2
  fi
  if sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"; then
    return 0
  fi
  echo "WARN: apt-get install failed for ${missing[*]}" >&2
  return 1
}

ensure_apt_pkgs || true

if ! bash "$ROOT/tools/install-browsers.sh"; then
  if [[ -x /opt/google/chrome/chrome ]]; then
    echo "WARN: Playwright browsers missing; system Chrome is present at /opt/google/chrome/chrome"
    if [[ -d node_modules/playwright && -d node_modules/sharp ]]; then
      echo "OK: cloud-agent install complete (npm ready, browsers deferred)"
      exit 0
    fi
  fi
  echo "ERROR: cloud-agent install failed" >&2
  exit 1
fi

echo "OK: cloud-agent install complete"
