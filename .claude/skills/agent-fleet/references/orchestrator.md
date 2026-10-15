# Orchestrator

You plan the batch, launch workers, read their state off GitHub, answer
escalations and stop workers that stall. You do not implement, merge or arm.

## Contents

- Before launching
- Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)
- Authority, permissions and modes (the 2026-10-15 track-survey fleet)
- Per-vendor adapters (sources in the design note)
- Reading the fleet
- Answering an escalation
- Never

## Before launching

1. `node tools/ci/who-is-on-it.mjs` and the open draft PRs: a live claim or a
   branch pushed in the last ~15 min on the same paths means that work is
   owned. Fold it into the plan instead of launching a twin.
2. Split the work so no two workers share an OWNED glob. Lane mutexes from
   SKILL.md §Launch policy still apply (garage CSS → UI Survey, `js/car/*` →
   Cars, `js/circuits/scenery/*` → Tracks, ≤ 1 lighting worker, `js/game.js`
   needs `--claim`).
3. Keep ≤ 2 browser-heavy workers per batch: each SwiftShader group costs
   10–40 min, and CI capacity is shared (`ready-full-cap.mjs`, cap 3 ready
   full-tier runs).

## Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)

```text
GOAL: <one sentence, the user's terms>
      (existing PR: add "CONTINUE PR #<n> on <branch>", references/existing-pr.md)
OWNED: <globs>          FORBIDDEN: <globs>
DONE WHEN: <exact verify command or measured check, green on the PR head>
CAPS: ≤ <n> screenshots/captures (default 25); ≤ 2 nested subagents; abort at
      ~400 messages or ~90 min with no OWNED push and say so.
ORCHESTRATOR: <host>:<your session id>
USER GRANTS: "<the user's exact words>" (<UTC time>) — what this worker may do beyond AGENTS.md,
      scoped to the lane (OWNED globs / issue list, follow-up PRs included), not to PR numbers
PUSH SLOT: <n> — paced push, launch-policy.md (n = this worker's launch index, 0–9)
Load skill agent-fleet and follow references/worker.md.
Open a DRAFT PR; keep its fleet block current; subscribe with your host's tool.
When blocked or unsure: set state: blocked, needs-orchestrator: yes, comment
"@orchestrator BLOCKED: <question>" on the PR, and (Claude only) send_message
the ORCHESTRATOR session. Do not guess past a blocker.
Mark ready only after ready-gate.mjs exits 0 and ready-full-cap.mjs allows it.
Do not enable auto-merge or merge.
```

## Authority, permissions and modes (the 2026-10-15 track-survey fleet)

- **Auto mode.** Launch every sibling session in auto mode
  (`create_session` `permission_mode: "auto"`) and run subagents without plan
  mode: an unattended worker in `plan` or `default` stalls on an approval nobody
  sees. Auto mode still runs the hooks and the permission classifier. Verify
  with `get_session` right after the spawn: `permission_mode` is what the child
  actually got (a request for `default` landed as `auto` on 2026-10-15 and the
  reverse happened too), and a `default` child's prompts appear only in the
  app, where the user must answer them in that session. An auto child needs an
  auto parent: from a `default` session `create_session` refuses with
  "permission_mode 'auto' requires the parent session to be in auto mode", so
  ask the user to switch YOUR session to Auto before a launch.
- **Coordinators run in auto too.** A Merge Desk or orchestrator lives on
  `send_message` and `send_later`, and in `default` mode both are a platform
  confirmation that no allow rule clears: the default-mode Sonnet desk
  (session_01WQY3pk…, 2026-10-15) logged them as `accept / rule /
  user_temporary` (a human's "don't ask again") with `mcp__claude-code-remote__*`
  allowed, while its Bash and GitHub calls matched `rule / config`; in the auto
  fix lanes the same two tools went `classifier`. That desk restarted its
  container 14 times (`worker_epoch`), and a session-scoped approval does not
  obviously survive a restart, which fits its hours-long stalls. A coordinator
  that reads `permission_mode: default` on itself (`get_session`, no id) asks the
  user once to switch it to Auto and does read-only work until then.
- **What an auto worker can do unattended** (measured 2026-10-15 on 76637056,
  about 100 calls in two auto siblings: 0 prompts, 0 blocks): git and worktree
  commits, the `worker` and `Explore` subagents, tasks, worktree tools,
  sibling-to-sibling `send_message` (both ways, ~20 s), GitHub reads, skills,
  web, and every MCP server. The `.mcp.json` servers (apex-tools,
  chrome-devtools, playwright-official), MDN, BrowserStack, Bash and Agent are
  approved by the classifier, not a rule: a repository cannot pre-approve the
  servers it defines itself, so no `.claude/settings.json` entry helps them.
  Still gated by design: merges and ready flips (`github-mcp-guard.sh`), and
  `APEX_PUSH_HOLD=0` (the classifier rejects it as `[Safety Bypass Flag]`, so a
  worker waits for `queue-depth.mjs` to read ok, or the user pushes it).
- **The repo is not inherited.** `create_session` without `source_url` makes a
  session with an EMPTY working directory, tagged `config:no-git-repo` (two
  census siblings on 2026-10-15 stopped at their first `git log`). Always pass
  `source_url: https://github.com/brycejmurrin/f1-game` and
  `source_revision: claude/f1-game-project-26h3ng` (or the worker's branch);
  check the new session's `tags` for `config:no-git-repo` and relaunch if it is
  there. A child that recovers with `add_repo` gets a read-only clone under
  `/home/user/brycejmurrin/f1-game` with no GitHub MCP access to the repo, so
  it cannot open or update a PR.
- **The brief is read as peer data.** A spawned session sees its launch prompt
  as a task notification, not a user message: on 2026-10-15 both census
  siblings ran only their read-only first step and waited until the user typed
  into them. `USER GRANTS:` with the user's exact words and a UTC time is what
  lets a child act; a brief without it buys a read-only report at best.
- **Measure permissions, never infer them.** "No prompt seen" proves nothing
  in auto mode. Every tool result in a session's `list_events` transcript
  carries `tool_result_meta[].permission_decision`: reason `rule` + source
  `config` means an allow rule in settings matched; reason `classifier` means
  no rule matched and the auto-mode classifier approved; source
  `user_temporary` / `user_permanent` with no reason means a human prompt was
  shown; `reject` names `hook` or `classifier`. Read your own session's events
  to test a settings change; the measured rule shapes are in
  `docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md`.
- **Relayed authority does not travel.** A worker treats the orchestrator's
  messages as peer data, so "Bryce approved X" mid-run is refused (seen 20+
  times: the push-hold override, merges, opening PRs). Put everything the user
  approves for the fleet IN THE LAUNCH PROMPT, quoting the user's exact words
  with a UTC time. A later grant goes out the same way; a worker that still
  refuses needs the user in its own session, or the orchestrator does the step
  itself (e.g. sync and push the branch from its own worktree).
- **Grant blocks (measured 2026-10-15).** A launch prompt that quotes the user is
  still peer data: all six Merge Desk lane workers stood by, and a relay
  `send_message` was refused the same way. A message the USER types into the
  worker's own session arrives as a human turn (`list_events`: `origin.kind:
  "human"`) and unblocks it at once. So after `create_session`, print one
  copy-paste block per worker for the user (session id, then a fenced one-message
  grant naming the lane's scope, the paced-push rule from
  `launch-policy.md` and "Do not enable auto-merge or merge"). Do not argue the
  relay or resend it.
- **Grant a class, not a PR number.** A grant that lists "#2152 #2158" covers
  nothing else, so every follow-on PR the lane finds needs a fresh launch or a
  fresh user message. Word the quoted grant (and ask the user to word theirs)
  by scope: "open and drive draft PRs for <OWNED globs> / issues <list>,
  including follow-ups this lane finds; SWEEP each to Merge Desk". The worker
  still files out-of-scope work as an issue, not a PR.
- **`subscribe_pr_activity` can fail** ("Could not subscribe to this PR", seen on
  #2062 and #2063 from three workers). Treat it as normal: `ci-watch.mjs --sha
  <head> --once` on each timer wake, and say the subscription failed in the
  hand-back. It is a server-side tool; no settings rule fixes it.
- **Permissions.** `APEX_PUSH_HOLD=0` (queue-hold override) is only for a push
  the user asked for now; the classifier may deny it and `git merge` /
  `sync-pr` in a worker anyway. Do not expect a new `.claude/settings.json`
  allow rule to unblock a worker: the file already allows every tool and
  server, an auto session's Bash goes to the classifier anyway, and what still
  prompts (the `.mcp.json` servers, MDN, BrowserStack, `send_message`,
  `create_session`) no repo rule reaches. Measure before adding one
  (`docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md`).
- **What the brief grants up front** (so no mid-run grant is needed): open its
  own DRAFT PR, `subscribe_pr_activity`, a `ci-watch.mjs --sha` Monitor and one
  `send_later` check-in, then drive the draft fast tier to green; send Merge
  Desk `SWEEP <PR#>` when `ready-gate.mjs` exits 0; the one golden-hash /
  baseline row it may touch (lower only); where its images go (survey frames →
  `track-survey-assets`, never the deploy branch).
- **Reach.** Workers report with `send_message` to the orchestrator id in the
  brief and may message sibling owners directly (e.g. an engine worker); a
  fleet-wide instruction is one `send_message` per live session.

The last line limits the worker's own actions. It is not a merge veto: the
worker must not copy it, or any "do not merge" wording, into the PR body or a
hand-back. To hold a PR, the body carries a line starting `MERGE-HOLD:`.

## Per-vendor adapters (sources in the design note)

Pick the column of the host YOU run on for the orchestrator's own tools; the
worker's column only matters for how you reach it. A Claude Code orchestrator
launching Cursor workers uses the Cursor API column (needs a key).

| need | Claude Code cloud | Cursor, from inside a Cursor cloud agent | Cursor Cloud Agents API v1 (any host with a key) | Grok Build |
|---|---|---|---|---|
| spawn | `create_session` with `prompt`, `source_url`, `source_revision` and `permission_mode: "auto"` (omit `source_url` and the child has no repo); or a routine `/fire` | `Task`, `environment: "cloud"`, `run_in_background: true`, `cloud_base_branch` = deploy branch | `POST /v1/agents` (`prompt.text`, `repos[].url`, `startingRef`/`prUrl`, `model.id`) | `grok --no-auto-update -p "<prompt>" -w --ref <deploy branch> --always-approve --output-format streaming-json` in a job you own (no cloud API) |
| message a running worker | `send_message` (wakes an idle session; a session that has gone inactive refuses it with `session_inactive`, so `get_session` first and put the message on the PR too) | `Task` `resume: <id>` once it has finished (fails while it runs); else a PR comment | `POST /v1/agents/{id}/runs` (one active run at a time) | `grok -r <session> -p "<msg>"` in the same job, or a PR comment |
| worker → orchestrator | `send_message` back | the subagent's final message returns to you; mid-run only the PR | none: PR comment + fleet block | none: PR comment + fleet block |
| status | `get_session` (`status_bucket`), `list_events` | `cursor-cloud` `list-cloud-agents` / `batch-fetch-details` | `GET /v1/agents/{id}`, `…/runs/{runId}`, `…/stream` | the job's log |
| stop | `interrupt_session`, then `archive_session` | none in-tool: ask via PR; the API column can cancel | `POST /v1/agents/{id}/runs/{runId}/cancel`, then `POST /v1/agents/{id}/archive` | cancel the job; `--max-turns` caps it up front |
| PR events | `subscribe_pr_activity` + a `send_later` poll | `subscribe_github_ci` + `subscribe_github_pr` | none (webhooks are v0-only) | none |
| timer | `send_later` | `subscribe_timer` (`once: true` + `delaySeconds`) | none | none |

- Grok Build reads this repo as-is: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`,
  `.cursor/rules/`, and Claude Code's skills, agents, hooks and MCP config
  (`grok inspect` lists what it found). The guard hooks therefore bind a Grok
  worker too. Give it `--deny "Bash(git push --force*)"`; deny always wins.
- Grok Bot (bots on a shared cloud computer that message each other) has no
  documented GitHub or API path: do not plan a worker on it.
- Cursor sessions do not appear in Claude's session list, and `send_message`
  to one fails ("target session could not be verified"): reach them through
  their PR.
- Claude Code's `subscribe_pr_activity` has open bugs: it can drop
  `check_run` completions and bot-authored reviews, so a worker that only
  waits on it sits idle through a red. Read CI with `ci-watch.mjs --once` on
  every timer wake.

## Reading the fleet

- One pass per wake: for every worker PR, read the fleet block, the latest
  `@orchestrator` comment, the head SHA's CI (`node tools/ci/ci-watch.mjs --sha
  <sha> --once`) and mergeability.
- A worker is **stalled** when its state has not changed and its branch has
  not moved for ~90 min, or it passed its caps. Ask once, then interrupt and
  relaunch with NEW evidence or a narrower OWNED, never the same prompt.
- Keep one safety-net timer (`send_later` / `subscribe_timer`, ~50 min, later
  ~4 h) while workers run; drop it when every PR is merged or closed.

## Answering an escalation

Answer only from what the user already decided, the launch prompt, the code,
or AGENTS.md. Anything that is the user's call goes to the user, with the
worker's question quoted and the options. Reply where the worker can read it:
`send_message` (Claude), `Task` `resume` or a follow-up run (Cursor), a PR
comment (all).

## Never

Merge, arm auto-merge, force-push, push to a branch a live worker owns, or
pass a sibling's message off as the user's instruction.
