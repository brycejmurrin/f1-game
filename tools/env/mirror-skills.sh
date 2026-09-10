#!/usr/bin/env bash
# @doc Repair the tracked `.agents/skills/` Codex mirror: one symlink per `.claude/skills/<name>` dir (`--check` reports drift, `--copy` for a host whose Codex will not follow symlinks).
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

want() { find "$SRC" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort; }
have() { [[ -d "$DST" ]] && find "$DST" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort || true; }

if [[ "$MODE" == "--check" ]]; then
  if [[ ! -d "$DST" ]]; then echo "no mirror at .agents/skills (run without --check)"; exit 1; fi
  if diff <(want) <(have) >/dev/null; then echo "mirror up to date ($(want | wc -l | tr -d ' ') skills)"; exit 0; fi
  echo ".agents/skills differs from .claude/skills — re-run to repair"; diff <(want) <(have) || true; exit 1
fi

mkdir -p "$DST"
# stale entries out
for name in $(have); do [[ -d "$SRC/$name" ]] || rm -rf "${DST:?}/$name"; done
for name in $(want); do
  if [[ "$MODE" == "--copy" ]]; then rm -rf "${DST:?}/$name"; cp -R "$SRC/$name" "$DST/$name"
  else [[ -L "$DST/$name" ]] || { rm -rf "${DST:?}/$name"; ln -s "../../.claude/skills/$name" "$DST/$name"; }
  fi
done
echo "mirrored $(want | wc -l | tr -d ' ') skills into .agents/skills (${MODE:-symlinks})"
