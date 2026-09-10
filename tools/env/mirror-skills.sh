#!/usr/bin/env bash
# @doc Mirror `.claude/skills/` into the gitignored `.agents/skills/` Codex scans (`--check` reports drift).
# @skill check-changes
#
# Codex CLI discovers skills under .agents/skills/ and does not follow
# symlinks (openai/codex#11314, #22275), so the mirror is a real copy. Run it
# after a pull; `--check` reports drift without writing. Claude Code and
# Cursor both read .claude/skills/ natively and never need this.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/.claude/skills"
DST="$ROOT/.agents/skills"

if [[ "${1:-}" == "--check" ]]; then
  if [[ ! -d "$DST" ]]; then echo "no mirror at .agents/skills (run without --check)"; exit 1; fi
  if diff -rq "$SRC" "$DST" >/dev/null; then echo "mirror up to date"; exit 0; fi
  echo ".agents/skills differs from .claude/skills — re-run to refresh"; exit 1
fi

mkdir -p "$(dirname "$DST")"
rm -rf "$DST"
cp -R "$SRC" "$DST"
echo "mirrored $(find "$DST" -name SKILL.md | wc -l | tr -d ' ') skills into .agents/skills"
