#!/bin/bash
# PreToolUse guard for Write/Edit/MultiEdit/NotebookEdit. Three rules from
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
#
# Escape hatch for a deliberately assigned edit: `touch .claude/allow-protected`
# at the repo root and retry (remove it when done). It lifts rules 1 and 3
# only — rule 2 (a live Playwright run) holds regardless. Exit 2 blocks; the
# reason on stderr reaches the model.

# Keep payloads on stdin; exporting full files hits the OS per-variable limit.
exec python3 "$(dirname "$0")/protect-files.py"
