---
name: dispatcher
description: "Use when asked how workers get launched, why an issue was not picked up, or to plan a wave of workers: the orchestrator session, create_session briefs, ready-sweep, the Board. Not for: owning one PR → steward."
---

# Dispatch — the orchestrator session launches workers

There is no dispatch Action: `.github/workflows/dispatch.yml` and its planner `dispatch.mjs` were retired on 2026-11-25
(#6536, Bryce's answer relayed there; the Action had been `disabled_manually` since 2026-11-05). The orchestrator is
the session Bryce steers in his own chat (skill `steward` §CI): it reads GitHub state, launches each worker with
`create_session` and a one-line address (`ISSUE n` / `CONTINUE PR n` / `DEPLOY-RED <run id>`) plus a brief, and
re-owns a silent PR (`needs-owner`, one `CONTINUE PR n`). A launched session loads skill `steward` §Lane.

- The brief: [`references/orchestrator-brief.md`](references/orchestrator-brief.md) (what to check before a wave,
  the brief template, the standing roles it may launch without an issue (the Gardener, skill `gardener`), what to
  send while workers run, standing routines). The base prompt every worker shares is
  `tools/ci/worker-prompt.md` (also the "Apex worker" scheduled task's saved prompt, for a hand fire).
- The launch rule: a `ready` issue without `claimed`, `blocked`, `needs-decision` or `epic`, not a `batched` member
  (its `batch` issue is the ONE launch), and with no open PR that closes it. `node tools/ci/ready-sweep.mjs` (GETs
  only) lists those units, their stale cites and the "ready over cap" row; `node tools/ci/pr-board.mjs --json` lists
  open PRs with their heads, leases and owners.
- Bryce's steering is his own click: `priority` on an issue or PR goes first; `dispatch:merge-pause` on the Dispatch
  issue (#3899) stops `land.yml` arming. They count only as his own click (`tools/ci/lib/provenance.mjs`).
  `dispatch:pause` was the Action's switch and nothing reads it now.
- The Board is issue #1780: the orchestrator posts `tip-red:` bulletins there; `tip-alarm.yml` posts the tip's red
  and green notes and labels it `deploy:red`.

Channels, `land` lanes, relayed grants and a shared phone, from a five-worker run:
[`references/sibling-sessions.md`](references/sibling-sessions.md).

## Why was issue #n not picked up?
1. Nothing launches on its own: an issue waits until the orchestrator's next wave. Ask whether one is running.
2. `node tools/ci/ready-sweep.mjs --json`: #n absent from the launchable list means it failed the launch rule above
   (a label, a batch, or an open PR closing it); `--issue <n>` prints its cites for agent `finding-verifier`.
3. Launched but no claim comment on the issue: the worker never started or stood down; read its session
   (`get_session`, `list_events`) and relaunch once.
