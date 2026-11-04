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

- A console may run `node tools/ci/dispatch.mjs --plan` (read-only) to see what the next cycle would do; `--apply`
  is the Action's, never a session's.
- Bryce's switches are labels on the Dispatch issue (#3899): `dispatch:pause` stops launches (running owners carry
  on), `dispatch:merge-pause` stops arming; `priority` on an issue or PR launches or lands it first.
- Bryce's setup, once: the "Apex worker" scheduled task with an API trigger and the saved prompt from
  `dispatch.mjs`'s header; the `LAND_TOKEN` secret (skill `steward` `references/vendors.md`).
- The dispatcher's one state store is its task list (TaskCreate / TaskUpdate, one task per stream); no `roster.md`.
  Workers report by one-line `send_message` (`tools/ci/worker-prompt.md` Coordination); read those before the Board.
- Session sweep: `node tools/ci/archive-sweep.mjs --sessions <list_sessions JSON file>` prints the sessions whose PR
  merged or closed in one call; archive each with `archive_session`. Do not page `list_sessions` repeatedly.
