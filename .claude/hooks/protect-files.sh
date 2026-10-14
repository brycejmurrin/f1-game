#!/bin/bash
# PreToolUse guard for Write/Edit/MultiEdit/NotebookEdit AND Bash (the files a
# command writes, read by shellparse.py — 2026-10-04). Four rules from
# AGENTS.md that prose could only request, made deterministic:
#
#  1. §Verification 11 — a GENERATED file is never hand-edited, in any
#     checkout: version.json, js/roster.js, tools/carview.html, tools/README.md
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
# Every target is resolved with realpath first, so a symlink is judged as the
# file it points at (round 2, 2026-10-14).
#
# Escape hatch for a deliberately assigned edit: `touch .claude/allow-protected`
# at the repo root and retry (remove it when done). It lifts rules 1 and 3
# only — rule 2 (a live Playwright run) holds regardless. Exit 2 blocks; the
# reason on stderr reaches the model.

# Keep payloads on stdin; exporting full files hits the OS per-variable limit.
exec python3 "$(dirname "$0")/protect-files.py"
