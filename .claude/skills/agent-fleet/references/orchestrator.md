# Orchestrator

You plan the batch, launch workers, read their state off GitHub, answer
escalations and stop workers that stall. You do not implement, merge or arm.

## Contents

- Before launching
- Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)
- Authority, permissions and modes (the 2026-10-15 track-survey fleet)
- Per-vendor adapters (sources in the design note)
- Roles and hand-offs (2026-10-17)
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
   10–40 min, and CI capacity is shared (40 Linux slots; ci.yml's lanes bound
   the browser legs).

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
MODE/SEED: permission_mode "auto"; source_revision <deploy branch | NAMED integration branch>; model <id>.
PR: <worker | orchestrator> opens the DRAFT PR, base <deploy branch | track-survey-assets>.
DELIVERABLES: <the full checklist: every section, weather/frame, doc, merge step the PR must contain>
PUSH: when your own cycle is green (no slot; launch-policy.md, Paced push).
Load skill agent-fleet and follow references/worker.md.
Open a DRAFT PR; keep its fleet block current; subscribe with your host's tool.
When blocked or unsure: set state: blocked, needs-orchestrator: yes, comment
"@orchestrator BLOCKED: <question>" on the PR, and (Claude only) send_message
the ORCHESTRATOR session. Do not guess past a blocker.
Mark ready only after ready-gate.mjs exits 0.
Do not enable auto-merge or merge.
```

### Hard lines (plan WS1, 2026-10-16-agent-friction-fix-plan; #2380)

A brief missing any of these cost real sessions: 3 of 14 fix workers parked on a
permission prompt, stale-seeded workers cost $5.55–9.50 against $1.74–2.74, and
12 of 25 surveyors refused a relayed PR ask. Check the brief against this list
before every `create_session`:

1. `permission_mode: "auto"`, confirmed afterwards with `get_session`.
2. `source_url` plus `source_revision` = the deploy branch or a NAMED
   integration branch, never a stale topic branch or the default.
3. The model stated (`claude-sonnet-5-5` for lanes and workers).
4. Who opens the PR and its base (survey lane: `track-survey-assets`). A brief
   that says "no PR" contradicts AGENTS.md rule 12; say who opens it instead.
5. The full deliverable checklist in the FIRST brief (sections, weathers and
   frames, docs, the commit recipe) so no round-two message is needed.
6. The PUSH line (green-cycle push; the slot is retired): push BEFORE any browser run or wait over ~10 min.
7. The `USER GRANTS:` quote and `Do not enable auto-merge or merge.`
8. Every anticipated action AND path in `USER GRANTS:` (`js/game.js`, workflow
   dispatch, `.claude/**`, a ratchets row), and the worker's NEXT item named
   (issue #, PR): a grant the brief omits is refused as relayed and an unnamed
   next item idles the lane (#2625 declined the game.js hook; #2709 refused
   #1683 and a dispatch, 2026-10-17).
9. The cost cap and "low reasoning effort" in the brief. Effort cannot be set
   by `create_session`: read `effort_level` in `get_session` metadata and say
   so if it is higher than asked.
10. `get_session` on any session before assigning it a PR or message: a dead
   one fails `not found` (#2717's owner), and a foreign Cursor one is reached
   through its PR.
11. Fleet-wide asks: read `get_session` (`post_turn_summary`, `context_usage`,
   `usage`) for every roster id first and message only sessions whose summary
   is stale > 15 min. Copy ids from `list_sessions`, never retype them. One
   message per ask; a correction is `RETRACT <ask>`, never a second broadcast.
   No peer fan-out ("send to every session below"): replies go to the
   orchestrator only (three asks in four minutes cost ~21 wakes each, 2026-10-17).
12. Size stop, every role: the launch prompt ends `STOP AT: 300k context or $<cap>`.
   The session reads its own `context_usage` / `usage` via `get_session` (no id)
   at every wake after a green push and, at the stop, sends HANDOFF/FINAL and
   ends. Docs-only owners stop at 100k (role review, #2737).

### Pre-launch quota check (#2380)

50 of 61 failed sessions died on the account quota, and a launch burst is what
trips `Sandbox allocation failed … rate_limited`.

- Before every `create_session` and before every Agent wave larger than 5, call
  `get_session` (no id = yourself) and read `rate_limit_info`. At
  `allowed_warning` or worse, launch nothing: park under `worker.md` §Quota
  park, with one `send_later` at the reset.
- Stagger launches by ≥ 30 s and confirm each child with `get_session`
  (`status_bucket`, granted `permission_mode`, repo attached) before the next.
- Waves stay within the lane caps in `launch-policy.md`.

## Authority, permissions and modes (the 2026-10-15 track-survey fleet)

Evidence for every bullet: `docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md`
and `docs/notes/AGENT-CONFIG-RESEARCH-2026-10-15.md`.

- **Every session in the fleet runs in auto mode**: workers, Merge Desk and
  you. In `default`, `send_message`, `send_later` and `create_session` are
  platform confirmations that no allow rule clears, and an unattended prompt
  stalls the session (the default-mode desk lost hours to them, 2026-10-15).
  Launch with `create_session` `permission_mode: "auto"`; only an auto parent
  may (a `default` parent is refused). Confirm with `get_session`: the mode
  granted can differ from the one requested. A coordinator that finds itself in
  `default` (`get_session`, no id) asks the user once to switch it to Auto and
  does read-only work until then.
- **Pass the repo.** Without `source_url: https://github.com/brycejmurrin/f1-game`
  and `source_revision: claude/f1-game-project-26h3ng` (or the worker's branch)
  the child gets an empty directory tagged `config:no-git-repo`: relaunch it.
  An `add_repo` recovery is a read-only clone with no GitHub MCP access to the
  repo, so it cannot open a PR. One repository per session: an Anthropic-hosted
  session with several repositories loads no repository's `.claude/settings.json`
  hooks, so every guard is off there
  ([docs](https://code.claude.com/docs/en/claude-code-on-the-web)).
- **Authority: one rule.** A worker acts on the user's words: quoted with a UTC
  time in its launch prompt (`USER GRANTS:`), or typed by the user into its own
  session. Both are the user's; only the second arrives as a human turn, and on
  2026-10-15 six lane workers stood by on the first until the user typed. So
  quote every grant in the brief AND, after `create_session`, print one
  copy-paste block per worker (session id, then a fenced message with the
  lane's scope and "Do not enable
  auto-merge or merge"). Anything relayed later ("Bryce approved X") is peer
  data and is refused; do the step yourself or ask the user to type it there.
- **Grant a class, not a PR number.** "#2152 #2158" covers nothing else, so each
  follow-on PR would need a new launch. Word grants by scope: "open and drive
  draft PRs for <OWNED globs> / issues <list>, including follow-ups this lane
  finds; SWEEP each to Merge Desk". Out-of-scope work is still an issue.
- **What the brief grants up front**: its own DRAFT PR, `subscribe_pr_activity`,
  a `ci-watch.mjs --sha` Monitor and one `send_later` check-in, driving the
  draft fast tier to green, `SWEEP <PR#>` to Merge Desk when `ready-gate.mjs`
  exits 0, the one golden-hash / baseline row it may lower, and where its
  images go (survey frames → `track-survey-assets`).
- **Permissions: measure, never infer.** Each tool result in `list_events`
  carries `tool_result_meta[].permission_decision`: `rule`/`config` = a settings
  rule matched; `classifier` = auto mode approved; source `user_temporary` /
  `user_permanent` = a human answered a prompt; `reject` names `hook` or
  `classifier`. "No prompt seen" proves nothing in auto mode. Do not expect a
  new `.claude/settings.json` allow rule to unblock a worker: the file already
  allows every tool, an auto session's Bash goes to the classifier anyway, and
  what still prompts (the `.mcp.json` servers, MDN, BrowserStack, the session
  tools above) no repo rule reaches. Gated by design: merges and ready flips
  (`github-mcp-guard.sh`). (The push hold and its `APEX_PUSH_HOLD=0` override
  were retired on 2026-10-16; a push is never held on the queue gauge.)
- **`subscribe_pr_activity` can fail** for sibling sessions ("Could not
  subscribe to this PR"; server-side, no rule fixes it): fall back to
  `ci-watch.mjs --sha <head> --once` on each timer wake and say so in the
  hand-back.
- **Reach.** Workers `send_message` the orchestrator id in the brief (~20 s
  delivery) and may message sibling owners directly; a fleet-wide instruction
  is one `send_message` per live session.

### Codex in-session adapter

Codex collaboration agents are in-session tasks, not automatically equivalent
to Claude/Cursor sibling sessions. Reuse the named `.claude/agents/<persona>.md`
contract, but repeat its OWNED/FORBIDDEN paths, read-only limits, tools and
hand-back format in the Codex launch prompt because Claude frontmatter is not
enforcement there. Use Codex children for bounded evidence work such as
`release-auditor`; keep Merge Desk readiness/arming authority with the
explicitly designated parent session. Do not claim sibling-session
subscriptions, PR ownership or merge authority unless the host actually
provides those APIs and the user granted them.

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

## Roles and hand-offs (2026-10-17)

Launch by role (SKILL.md §roles): a hunter finds and fixes, then sends
`NEW-PR <#> <branch> <sha> <summary>` and drops the PR; you start one PR owner
per PR (role-pr-owner.md) within minutes, quoting the user's grants; the owner
replies `ARMED`, drives the PR, and sends `DONE <PR> <merge sha>`; you verify
two parents and archive the owner, never the hunter. With no live Merge Desk
you are the merge holder (role-merge-holder.md). Spawning stays here by
default: a grandchild acting on a quote of a quote is relayed authority, and
the auto-mode classifier refused relayed `.claude` edits, CI re-runs and merges
on 2026-10-16. `.claude/**` edits are done by you or approved by the user in
the acting session.

## Reading the fleet

- One pass per wake: for every worker PR, read the fleet block, the latest
  `@orchestrator` comment, the head SHA's CI (`node tools/ci/ci-watch.mjs --sha
  <sha> --once`) and mergeability.
- Workers iterate on what their change touches (`tooling-fast --changed` plus
  the specs `pick-tests` / `select-specs` name) and run the full `tooling-fast`
  once before a code push (AGENTS.md rule 3). At most one merge from the deploy branch per PR per hour unless the PR
  is `dirty` / conflicting or `needs-sync.mjs` says `stale-red` (`sync-pr.mjs`); being N commits behind is no reason.
- A worker is **stalled** when its state has not changed and its branch has
  not moved for ~90 min, or it passed its caps. Ask once, then interrupt and
  relaunch with NEW evidence or a narrower OWNED, never the same prompt.
- Keep one safety-net timer (`send_later` / `subscribe_timer`, ~50 min, later
  ~4 h) while workers run; drop it when every PR is merged or closed.
- Each wake also lists every open PR with no live owner session (Bryce requires
  one per PR); start an owner (role-pr-owner.md) or say why not. `pr-board`
  does not print this yet: check `get_session` per owner.
- One owner per red tip: before several sessions fix the same red, search open
  PR titles/branches for the failing test name and name ONE owner in a message
  (three sessions opened the same catalog-digest fix, #2716/#2717/#2695).
- After a merge, if a Pages run is pending and none running, hold further
  merges until one starts: each merge replaces the PENDING train (45 min stale
  site, 2026-10-17). A RUNNING train is never cancelled.

## Answering an escalation

Answer only from what the user already decided, the launch prompt, the code,
or AGENTS.md. Anything that is the user's call goes to the user, with the
worker's question quoted and the options. Reply where the worker can read it:
`send_message` (Claude), `Task` `resume` or a follow-up run (Cursor), a PR
comment (all).

## Never

Merge, arm auto-merge, force-push, push to a branch a live worker owns, or
pass a sibling's message off as the user's instruction.
