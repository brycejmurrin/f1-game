---
name: dispatcher
description: "Use when asked how workers get launched, why an issue was not picked up, or to plan or run a dispatch cycle by hand: the dispatch Action, dispatch.mjs --plan, the Board. Not for: owning one PR → steward."
---

# Dispatch — a GitHub Action, not a session

Dispatch is `.github/workflows/dispatch.yml` running `tools/ci/dispatch.mjs` (cron plus issue / PR / check-suite /
comment events, one concurrency group): it plans over GitHub state and `tools/ci/dispatch.json` (the caps), writes
labels, digests, nudges and the Board comment (the issue titled `Board`) with `GITHUB_TOKEN`, fires Bryce's "Apex
worker" scheduled task once per planned launch with a one-line address (`ISSUE n` / `CONTINUE PR n` / `DEPLOY-RED`),
and posts the claim comment with the returned session id. The exact rules and line formats are the header of
`tools/ci/dispatch.mjs` (their one home); the worker's saved prompt is `tools/ci/worker-prompt.md`. A launched
session loads skill `steward` §Lane.

- A console may run `node tools/ci/dispatch.mjs --plan` (read-only; `--help` for flags; it pages every issue and PR,
  so run it in the background) to see what the next cycle would do; `--apply` is the Action's, never a session's.
- Bryce's switches are labels on the issue titled `Dispatch`: `dispatch:pause` stops launches (running owners carry
  on), `dispatch:merge-pause` stops `land.yml` arming; `priority` on an issue or PR launches or lands it first. They
  count only as Bryce's own click (`tools/ci/lib/provenance.mjs`).
- Bryce's setup, once: the "Apex worker" scheduled task with an API trigger and the saved prompt from
  `tools/ci/worker-prompt.md`, whose URL and token are the `WORKER_FIRE_URL` / `WORKER_FIRE_TOKEN` secrets
  `dispatch.yml` reads; the `LAND_TOKEN` secret for `land.yml` (skill `steward` `references/vendors.md`).

## Why was issue #n not picked up?
1. `--plan` output: a `SKIP issue #n: <why>` line names the reason (open PR closing it, live claim, a cap reached,
   paused, land-queue backpressure, `lane:cursor`); `IGNORED priority on #n` means an agent, not Bryce, set the label.
   The Board comment's Skipped list shows the last cycle's reasons.
2. No line for #n at all: it failed the ready filter (task rule 1 in the `dispatch.mjs` header; `planDispatch`).
3. Planned but no claim comment: read the Dispatch run's log (`gh run list --workflow dispatch.yml`, then
   `gh run view <id> --log`) for `= launch skipped …`, `= fire failed <status>` or `= fire skipped: …`.
