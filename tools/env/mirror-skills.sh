#!/usr/bin/env bash
# @doc Repair the tracked .agents/skills/ Codex mirror: one symlink per skill dir (--check drift, --copy fallback).
# @skill check-changes
#
# .agents/skills/<name> -> ../../.claude/skills/<name> is TRACKED in git
# (tests/unit/agent-surface.test.mjs locksteps it), so a fresh clone already
# has the mirror. This script repairs it after a skill is added or renamed:
# every skill dir gets its link, stale links go. Codex builds that do not
# follow symlinks (openai/codex#11314, #22275) get real copies with --copy;
# never commit those. Claude Code and Cursor read .claude/skills/ natively.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/.claude/skills"
DST="$ROOT/.agents/skills"
MODE="${1:-}"
if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  cat <<'EOF'
usage: bash tools/env/mirror-skills.sh [--check|--copy|--help]

Repair the tracked .agents/skills/ Codex mirror (one symlink per skill dir).
  (default)  create/refresh symlinks
  --check    exit 1 if the mirror drifts; write nothing
  --copy     materialise real copies (never commit those)
EOF
  exit 0
fi
case "$MODE" in ''|--check|--copy) ;; *) echo "Usage: $0 [--check|--copy|--help]" >&2; exit 2 ;; esac
[[ -d "$SRC" ]] || { echo "Missing canonical .claude/skills directory" >&2; exit 1; }

want() { for entry in "$SRC"/*; do [[ ! -d "$entry" ]] || basename "$entry"; done | sort; }
have() { for entry in "$DST"/*; do [[ ! -e "$entry" && ! -L "$entry" ]] || basename "$entry"; done | sort; }
valid_entry() {
  local name="$1"
  [[ -f "$SRC/$name/SKILL.md" && -f "$DST/$name/SKILL.md" ]] || return 1
  if [[ -L "$DST/$name" ]]; then
    [[ "$(readlink "$DST/$name")" == "../../.claude/skills/$name" && -d "$DST/$name" ]]
  else
    [[ -d "$DST/$name" ]] && diff -qr "$SRC/$name" "$DST/$name" >/dev/null
  fi
}

if [[ "$MODE" == "--check" ]]; then
  if [[ ! -d "$DST" ]]; then echo "no mirror at .agents/skills (run without --check)"; exit 1; fi
  drift=0
  diff <(want) <(have) >/dev/null || drift=1
  while IFS= read -r name; do
    if ! valid_entry "$name"; then echo "invalid mirror: $name" >&2; drift=1; fi
  done < <(want)
  if [[ "$drift" == 0 ]]; then echo "mirror up to date ($(want | wc -l | tr -d ' ') skills)"; exit 0; fi
  echo ".agents/skills differs from .claude/skills — re-run to repair"; diff <(want) <(have) || true; exit 1
fi

while IFS= read -r name; do
  [[ -f "$SRC/$name/SKILL.md" ]] || { echo "Missing source SKILL.md: $name" >&2; exit 1; }
done < <(want)
mkdir -p "$DST"
# stale entries out
while IFS= read -r name; do [[ -d "$SRC/$name" ]] || rm -rf "${DST:?}/$name"; done < <(have)
while IFS= read -r name; do
  if [[ "$MODE" == "--copy" ]]; then rm -rf "${DST:?}/$name"; cp -R "$SRC/$name" "$DST/$name"
  else [[ -L "$DST/$name" && "$(readlink "$DST/$name")" == "../../.claude/skills/$name" && -d "$DST/$name" ]] || { rm -rf "${DST:?}/$name"; ln -s "../../.claude/skills/$name" "$DST/$name"; }
  fi
done < <(want)
echo "mirrored $(want | wc -l | tr -d ' ') skills into .agents/skills (${MODE:-symlinks})"
