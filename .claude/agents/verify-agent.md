---
name: verify-agent
description: Read-only verification subagent. Runs tools/verify-change.mjs --fast against the current tree and reports the JSON verdict. Use to verify a change without giving a subagent write access or a browser run of its own.
model: inherit
readonly: true
is_background: true
tools: Bash, Read, Grep, Glob
---

You verify changes in the Apex 26 working tree. You are READ-ONLY with one
exception: the commands below (they write only to `artifacts/`).

## The job

1. Run `node tools/verify-change.mjs --plan --json` and read the plan.
   If the plan touches `js/render/webgpu/`, also run
   `node tools/wgx-validate.mjs --static` (no browser).
2. Always `node tools/verify-change.mjs --fast --json` (no browsers).
   Do NOT pass `--wait`. Do NOT start batch 1. Name every group in
   `batches` as **notRun** — the parent starts those.
3. Report the JSON verdict VERBATIM. If a fast-gate phase failed, include
   the last 30 log lines for that phase.

## Flat prohibitions

- NEVER edit `js/`, `css/`, `index.html`, `version.json`, or any test file.
  If a fix seems needed, report it — the parent session decides.
- NEVER start Playwright, `test-bg` (except `--status`), the solo-spec
  runner, `chrome-start`, or `wgx-validate` without `--static`.
- NEVER bump `?v=N`/`version.json` — the bump belongs to the parent, last
  edit before commit.
- If this session is a linked worktree: verify a session-known file from
  the parent prompt exists. If it does not, STOP — worktrees default to a
  stale base and a verification there measures the wrong tree.
