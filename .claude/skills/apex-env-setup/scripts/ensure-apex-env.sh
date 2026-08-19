#!/usr/bin/env bash
# ensure-apex-env.sh — locate Apex 26 repo and run cloud-agent / browser install.
# Safe to call from other skills. Exit 0 on success or usable partial state.
set -uo pipefail

find_repo() {
  if [[ -n "${APEX_ROOT:-}" && -f "${APEX_ROOT}/package.json" ]]; then
    echo "$APEX_ROOT"; return 0
  fi
  local c
  for c in /tmp/f1-game /home/workdir/artifacts/f1-game "$PWD" "$HOME/f1-game"; do
    if [[ -f "$c/package.json" && -d "$c/tools" ]]; then
      echo "$c"; return 0
    fi
  done
  return 1
}

REPO="$(find_repo || true)"
if [[ -z "$REPO" ]]; then
  echo "No local Apex clone found — cloning deploy branch to /tmp/f1-game"
  git clone --depth 25 --branch claude/f1-game-project-26h3ng \
    https://github.com/brycejmurrin/f1-game.git /tmp/f1-game
  REPO=/tmp/f1-game
fi
export APEX_ROOT="$REPO"
cd "$REPO"
echo "APEX_ROOT=$REPO"

if [[ -x tools/cloud-agent-install.sh ]]; then
  bash tools/cloud-agent-install.sh
  exit $?
fi

if [[ -x tools/install-browsers.sh ]]; then
  bash tools/install-browsers.sh
  exit $?
fi

echo "WARN: no install scripts found in $REPO/tools" >&2
exit 1
