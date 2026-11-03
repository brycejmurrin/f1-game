---
name: dispatcher
description: "Use when asked how workers get launched, why an issue was not picked up, or to plan or run a dispatch cycle by hand: the dispatch Action, dispatch.mjs --plan, the Board. Not for: owning one PR → steward."
---

# Dispatch — a GitHub Action, not a session

Dispatch is `.github/workflows/dispatch.yml` running `tools/ci/dispatch.mjs` (hourly cron plus `issues` /
`pull_request` label events, one concurrency group): it plans over GitHub state and `tools/ci/dispatch.json` (the
caps), writes labels and the Board comment (issue #1780) with `GITHUB_TOKEN`, fires one "Apex worker" scheduled task
per `CREATE_SESSION` with a one-line address (`ISSUE n` / `CONTINUE PR n` / `DEPLOY-RED`), and posts the claim
comment with the returned session id. The exact rules, line formats and the saved worker prompt are the header of
`tools/ci/dispatch.mjs` (their one home). A launched session loads skill `steward` §Lane.

- ONE launcher exists: the dispatch Action. Once the persistent dispatcher session is live, no orchestrator test-runs a
  cycle or adopts a PR by hand (seen 2026-11-03: two launchers adopted #4597 seven seconds apart). The plan also skips a
  `CONTINUE PR n` while an `adopts PR #n` comment is under 10 minutes old, or while head CI runs with 0 failed jobs and
  no conflict; each skip is a row on the Board.
- A console may run `node tools/ci/dispatch.mjs --plan` (read-only) to see what the next cycle would do; `--apply`
  is the Action's, never a session's.
- Bryce's switches are labels on the Dispatch issue (#3899): `dispatch:pause` stops launches (running owners carry
  on), `dispatch:merge-pause` stops arming; `priority` on an issue or PR launches or lands it first.
- Bryce's setup, once: the "Apex worker" scheduled task with an API trigger and the saved prompt from
  `dispatch.mjs`'s header; the `LAND_TOKEN` secret (skill `steward` `references/vendors.md`).
