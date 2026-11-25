---
name: dispatcher
description: "Use when asked how workers get launched, why an issue was not picked up, or to plan or run a dispatch cycle by hand: the dispatch Action, dispatch.mjs --plan, the Board. Not for: owning one PR → steward."
---

# Dispatch — a GitHub Action, not a session

Dispatch is `.github/workflows/dispatch.yml` running `tools/ci/dispatch.mjs` (cron plus issue / comment events and
`workflow_run` after CI or a Pages train, one concurrency group): it plans over GitHub state and `tools/ci/dispatch.json` (the caps), writes
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

A session that launches workers itself (`create_session`) while the Action is off writes its briefs from
[`references/orchestrator-brief.md`](references/orchestrator-brief.md): what to check before a wave, the brief
template, the standing roles it may launch without an issue (the Gardener, skill `gardener`), and what to send
while workers run.
Channels, `land` lanes, relayed grants and a shared phone, from a five-worker run:
[`references/sibling-sessions.md`](references/sibling-sessions.md).

## Why was issue #n not picked up?
0. Is the Action running at all? `gh api repos/brycejmurrin/f1-game/actions/workflows -q '.workflows[]|select(.path==".github/workflows/dispatch.yml").state'`:
   `disabled_manually` means no cycle comes and the Board comment is as old as the last run; workers are launched by
   hand (`references/orchestrator-brief.md`).
1. `--plan` output: a `SKIP issue #n: <why>` line names a per-issue reason (open PR closing it, live claim,
   `lane:cursor`); caps and `dispatch:pause` print `SKIP issue [Worker] #n <title>: …`, and land-queue backpressure is
   ONE global `SKIP issue launches paused: …` line with no per-issue row. `IGNORED priority|ready|dispatch:pause on #n`
   means an agent, not Bryce, set that label. The Board comment's Skipped list shows the last cycle's reasons.
2. No line for #n at all: it failed the ready filter (task rule 1 in the `dispatch.mjs` header; `planDispatch`).
3. Planned but no claim comment: read the Dispatch run's log (`gh run list --workflow dispatch.yml`, then
   `gh run view <id> --log`) for `= launch skipped …`, `= fire failed <status>` or `= fire skipped: …`.
