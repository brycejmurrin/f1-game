#!/bin/bash
# PreToolUse guard for Write/Edit/MultiEdit/NotebookEdit AND Bash (the files a
# command writes, read by shellparse.py — 2026-10-04). Six rules from
# AGENTS.md that prose could only request, made deterministic:
#
#  1. §Verification 11 — a GENERATED file is never hand-edited, in any
#     checkout: version.json, js/roster.js, tools/carview.html, tools/README.md,
#     tools/shot/scenery-locations.json (2026-10-26, gen-scenery-locations.cjs)
#     outright (tests/data/ratchets.json too — moved by ratchets.mjs, not by
#     hand); index.html and sw.js only inside their @gen-shell blocks;
#     package.json only on a test:* script line (source: tests/groups.json).
#     Other generated docs (DEBUG-HOOKS/ARCHITECTURE tables, tools/README.md)
#     are NOT blocked here; `npm run gen:check` names their drift.
#  2. §Verification 2 — no js/, css/ or index.html edit while a `playwright
#     test` process is live (tests serve the working tree).
#  3. Inside a LINKED worktree (fixer agents) the shared-contract files stay
#     the main session's: index.html, manifest.cjs, version.json, sw.js,
#     roster.js, gen-shell.mjs, package.json, package-lock.json,
#     playwright.config.js.
#  4. A call from the track-surveyor subagent (hook input `agent_type`) writes
#     only js/circuits/<id>.js, js/circuits/scenery/<id>.js, scratch/ and
#     artifacts/ (2026-10-14; no escape hatch). Via Bash, removals (rm, mv
#     sources) count as writes and whole-tree git verbs (stash, reset --hard,
#     clean, switch, checkout <branch>) are refused (round 2).
#  5. Shared safety bans 1-2 (Fleet A + D, Bryce 2026-10-22), no escape hatch:
#     nothing typed by hand RAISES a ceiling in tests/data/ratchets.json or a
#     tests/data/ratchets.d fragment, and a fragment is edited only on its own
#     branch (lowering or reverting this branch's file is fine). A removal or
#     move (rm, git rm, mv, find -delete, a directory) counts. Cursor reaches
#     this file through .cursor/hooks/edit-guard.sh and shell-guard.sh.
#  6. Gate receipts (WP-L4, Bryce 2026-10-27), no escape hatch: nothing typed
#     writes, moves or removes artifacts/{merge,ready,launch}-gate/ or the
#     quota page artifacts/launch/ — the gate scripts and launch-page.py do.
# Every target is resolved with realpath first, so a symlink is judged as the
# file it points at (round 2, 2026-10-14).
#
# Escape hatch for a deliberately assigned edit: `touch .claude/allow-protected`
# at the repo root and retry (remove it when done). It lifts rules 1 and 3
# only — rule 2 (a live Playwright run) holds regardless. Exit 2 blocks; the
# reason on stderr reaches the model.
#
# FAIL CLOSED (2026-10-28): a missing python3, a crash (exit 1, a traceback) or
# any exit but 0/2 is a refusal here, whatever the host's hook runner does with
# it (Claude Code passes such a call unless onFailure is "block":
# https://code.claude.com/docs/en/hooks §Block the action when a hook fails).

if ! command -v python3 >/dev/null 2>&1; then
  echo "BLOCKED: protect-files needs python3 to read the call; none of its rules ran, so it is refused (fail closed)." >&2
  exit 2
fi
# Keep payloads on stdin; exporting full files hits the OS per-variable limit.
python3 "$(dirname "$0")/protect-files.py"
rc=$?
case "$rc" in
  0|2) exit "$rc" ;;
  *) echo "BLOCKED: protect-files.py failed with exit $rc, so its rules did not finish and this call is refused (fail closed). Report the hook error; do not work around it." >&2
     exit 2 ;;
esac
