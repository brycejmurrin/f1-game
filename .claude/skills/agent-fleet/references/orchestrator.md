# Orchestrator

You plan the batch, launch workers, read their state off GitHub, answer
escalations and stop workers that stall. You do not implement, merge or arm.

## Before launching

1. `node tools/ci/who-is-on-it.mjs` and the open draft PRs: a live claim or a
   branch pushed in the last ~15 min on the same paths means that work is
   owned. Fold it into the plan instead of launching a twin.
2. Split the work so no two workers share an OWNED glob. Lane mutexes from
   AGENTS.md §Concurrent PRs still apply (garage CSS → UI Survey, `js/car/*` →
   Cars, `js/circuits/scenery/*` → Tracks, ≤ 1 lighting worker, `js/game.js`
   needs `--claim`).
3. Keep ≤ 2 browser-heavy workers per batch: each SwiftShader group costs
   10–40 min, and CI capacity is shared (`ready-full-cap.mjs`, cap 3 ready
   full-tier runs).

## Launch template (every vendor; AGENTS.md §Concurrent PRs makes these fields mandatory)

```text
GOAL: <one sentence, the user's terms>
OWNED: <globs>          FORBIDDEN: <globs>
DONE WHEN: <exact verify command or measured check, green on the PR head>
CAPS: ≤ <n> screenshots/captures (default 25); ≤ 2 nested subagents; abort at
      ~400 messages or ~90 min with no OWNED push and say so.
ORCHESTRATOR: <host>:<your session id>
Load skill agent-fleet and follow references/worker.md.
Open a DRAFT PR; keep its fleet block current; subscribe with your host's tool.
When blocked or unsure: set state: blocked, needs-orchestrator: yes, comment
"@orchestrator BLOCKED: <question>" on the PR, and (Claude only) send_message
the ORCHESTRATOR session. Do not guess past a blocker.
Mark ready only after ready-gate.mjs exits 0 and ready-full-cap.mjs allows it.
Do not enable auto-merge or merge.
```

## Per-vendor adapters (verified 2026-10-10; sources in the design note)

| need | Claude Code cloud | Cursor Cloud Agents API v1 | Grok |
|---|---|---|---|
| spawn | `create_session` (claude-code-remote MCP) with `prompt`; or a routine `/fire` | `POST /v1/agents` (`prompt.text`, `repos[].url`, `startingRef`/`prUrl`, `model`) | `grok -p "<prompt>"` headless inside a GitHub Actions job or VM you own (no cloud API documented) |
| message a running worker | `send_message` (wakes an idle session) | `POST /v1/agents/{id}/runs` (one active run at a time) | none: comment on its PR and re-run its job |
| worker → orchestrator | `send_message` back | none: PR comment + fleet block | none: PR comment + fleet block |
| status | `get_session` (`status_bucket`), `list_events` | `GET /v1/agents/{id}/runs/{runId}` / `…/stream` | the job's log |
| stop | `interrupt_session`, then `archive_session` | `POST /v1/agents/{id}/runs/{runId}/cancel`, `…/archive` | cancel the job |
| PR events | `subscribe_pr_activity` | `subscribe_github_ci` + `subscribe_github_pr` (inside Cursor) | none |

Cursor sessions do not appear in Claude's session list, and `send_message` to
one fails ("target session could not be verified"): reach them through their
PR.

## Reading the fleet

- One pass per wake: for every worker PR, read the fleet block, the latest
  `@orchestrator` comment, the head SHA's CI (`node tools/ci/ci-watch.mjs --sha
  <sha> --once`) and mergeability.
- A worker is **stalled** when its state has not changed and its branch has
  not moved for ~90 min, or it passed its caps. Ask once, then interrupt and
  relaunch with NEW evidence or a narrower OWNED, never the same prompt.
- Keep one safety-net `send_later` check-in (~50 min, later ~4 h) while
  workers run; drop it when every PR is merged or closed.

## Answering an escalation

Answer only from what the user already decided, the launch prompt, the code,
or AGENTS.md. Anything that is the user's call goes to the user, with the
worker's question quoted and the options. Reply where the worker can read it:
`send_message` (Claude), a follow-up run (Cursor), a PR comment (all).

## Never

Merge, arm auto-merge, force-push, push to a branch a live worker owns, or
pass a sibling's message off as the user's instruction.
