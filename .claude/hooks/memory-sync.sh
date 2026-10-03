#!/bin/bash
# memory-sync.sh restore|save — make Claude Code's AUTO MEMORY survive a cloud
# container (2026-09-24; research in docs/notes/AGENT-MEMORY.md).
#
# Auto memory lives at <config>/projects/<sanitized repo root>/memory/ — a
# MEMORY.md index plus one topic file per memory — and is machine-local. A cloud
# session's container is reclaimed afterwards, so it started empty every time;
# the CLI also turns auto memory OFF in remote sessions unless
# CLAUDE_CODE_DISABLE_AUTO_MEMORY is falsy (.claude/settings.json sets "0").
# `autoMemoryDirectory` cannot fix the location from here: the CLI ignores it in
# the checked-in settings and requires an absolute path. So the tracked copy is
# .claude/memory/ and this hook moves files between the two:
#
#   restore (SessionStart, from session-start.sh) and
#   save    (PostToolUse on Write|Edit, and Stop) both run ONE three-way sync
#           against a BASELINE — a copy of every file as of the last sync, in
#           artifacts/.memory-base/ — so each side's own edits are told apart:
#             * unchanged here, changed in the repo  → repo wins (refresh);
#             * changed here, unchanged in the repo  → live wins (saved, so it
#               rides the session's next commit);
#             * changed on both sides → MEMORY.md is line-merged (sessions add
#               index lines at once); a topic file keeps the REPO copy and the
#               conflict is reported, never overwritten;
#             * a deletion propagates only from the side that made it.
#           Until 2026-10-02 save copied every differing live file over the
#           repo and deleted repo files the session lacked: a resumed session,
#           whose live dir predated a branch checkout, reverted other sessions'
#           memories twice in one day. tests/unit/memory-sync.test.mjs pins it.
#
# Cloud only (CLAUDE_CODE_REMOTE=true) unless APEX_MEMORY_SYNC=1: on a laptop the
# live dir already persists and holds personal memories that must not be copied
# into a shared repo. Always exits 0 — a memory hiccup never blocks a turn.

MODE="${1:-save}"
INPUT=$(cat 2>/dev/null || true)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${APEX_MEMORY_SYNC:-}" = "1" ] || exit 0

# The live dir is keyed on the MAIN checkout (every worktree of a repo shares
# one), with every non-alphanumeric character replaced by '-'.
COMMON=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
MAIN=$([ -n "$COMMON" ] && dirname "$COMMON" || echo "$ROOT")
LIVE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/$(printf '%s' "$MAIN" | sed 's/[^A-Za-z0-9]/-/g')/memory"
REPO="$MAIN/.claude/memory"
BASE="$MAIN/artifacts/.memory-base"

MODE_OK=0
case "$MODE" in restore|save) MODE_OK=1 ;; esac
[ "$MODE_OK" = 1 ] || exit 0

if [ "$MODE" = save ] && [ -n "$INPUT" ]; then
  # PostToolUse: act only when the edited file is inside the live dir.
  FILE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")
except Exception: print("")' 2>/dev/null)
  if [ -n "$FILE" ]; then case "$FILE" in "$LIVE"/*) ;; *) exit 0 ;; esac; fi
fi

mkdir -p "$LIVE" "$REPO" "$BASE" 2>/dev/null || exit 0
LIVE="$LIVE" REPO="$REPO" BASE="$BASE" MODE="$MODE" python3 - <<'PY' || true
import os, shutil, sys
live, repo, base, mode = (os.environ[k] for k in ("LIVE", "REPO", "BASE", "MODE"))
def read(d, f):
    p = os.path.join(d, f)
    try:
        with open(p, encoding="utf-8") as h: return h.read()
    except OSError: return None
def write(d, f, text):
    with open(os.path.join(d, f), "w", encoding="utf-8") as h: h.write(text)
def drop(d, f):
    try: os.remove(os.path.join(d, f))
    except OSError: pass
def merge_index(b, l, r):
    """Line merge for MEMORY.md: the repo's lines, minus those this session
    removed, plus the lines this session added (appended, in its order)."""
    bl, ll = (b or "").splitlines(), l.splitlines()
    removed = {x for x in bl if x not in ll}
    added = [x for x in ll if x not in bl]
    out = [x for x in r.splitlines() if x not in removed]
    out += [x for x in added if x not in out]
    return "\n".join(out) + "\n"
names = {f for d in (live, repo, base) for f in os.listdir(d) if f.endswith(".md")}
n_in = n_out = 0
conflicts = []
for f in sorted(names):
    b, l, r = read(base, f), read(live, f), read(repo, f)
    if l == r:                                  # in step: record it
        if l is None: drop(base, f)
        else: write(base, f, l)
        continue
    live_changed, repo_changed = l != b, r != b
    if live_changed and not repo_changed:       # this session's edit or delete
        if l is None: drop(repo, f)
        else: write(repo, f, l)
        n_out += 1; final = l
    elif repo_changed and not live_changed:     # someone else's: take it
        if r is None: drop(live, f)
        else: write(live, f, r)
        n_in += 1; final = r
    elif f == "MEMORY.md" and l is not None and r is not None:
        final = merge_index(b, l, r)
        write(live, f, final); write(repo, f, final)
        n_in += 1; n_out += 1
    else:                                       # both changed a topic file
        conflicts.append(f)
        if r is not None: write(live, f, r)     # never overwrite the shared copy
        final = r
    if final is None: drop(base, f)
    else: write(base, f, final)
if mode == "restore" or n_in or n_out or conflicts:
    msg = f"memory: {n_in} in from .claude/memory/, {n_out} out"
    if conflicts: msg += "; CONFLICT kept the repo copy of " + ", ".join(conflicts) + " (re-apply your edit)"
    print(msg)
PY
exit 0
