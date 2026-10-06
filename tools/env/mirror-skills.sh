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

# Process substitution (`<(…)`) needs /dev/fd. Some agents and CI images do not
# have it (this sandbox: "No such file or directory"). Temp files do.
scratch_list() {
  local fn="$1" out
  out="$(mktemp)"
  "$fn" >"$out"
  printf '%s\n' "$out"
}

if [[ "$MODE" == "--check" ]]; then
  if [[ ! -d "$DST" ]]; then echo "no mirror at .agents/skills (run without --check)"; exit 1; fi
  drift=0
  wantf="$(scratch_list want)"
  havef="$(scratch_list have)"
  diff "$wantf" "$havef" >/dev/null || drift=1
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if ! valid_entry "$name"; then echo "invalid mirror: $name" >&2; drift=1; fi
  done <"$wantf"
  if [[ "$drift" == 0 ]]; then
    echo "mirror up to date ($(wc -l <"$wantf" | tr -d ' ') skills)"
    rm -f "$wantf" "$havef"
    exit 0
  fi
  echo ".agents/skills differs from .claude/skills — re-run to repair"
  diff "$wantf" "$havef" || true
  rm -f "$wantf" "$havef"
  exit 1
fi

wantf="$(scratch_list want)"
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  [[ -f "$SRC/$name/SKILL.md" ]] || { echo "Missing source SKILL.md: $name" >&2; rm -f "$wantf"; exit 1; }
done <"$wantf"
mkdir -p "$DST"
havef="$(scratch_list have)"
# stale entries out
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  [[ -d "$SRC/$name" ]] || rm -rf "${DST:?}/$name"
done <"$havef"
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  if [[ "$MODE" == "--copy" ]]; then rm -rf "${DST:?}/$name"; cp -R "$SRC/$name" "$DST/$name"
  else [[ -L "$DST/$name" && "$(readlink "$DST/$name")" == "../../.claude/skills/$name" && -d "$DST/$name" ]] || { rm -rf "${DST:?}/$name"; ln -s "../../.claude/skills/$name" "$DST/$name"; }
  fi
done <"$wantf"
echo "mirrored $(wc -l <"$wantf" | tr -d ' ') skills into .agents/skills (${MODE:-symlinks})"
rm -f "$wantf" "$havef"
