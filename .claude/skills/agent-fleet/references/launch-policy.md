## Launch policy (moved from AGENTS.md §Concurrent PRs)

Binding on every orchestrator, desk or person writing a cloud launch prompt.

- Cloud launch prompts must include `OWNED:` / `FORBIDDEN:` path globs, done-when, shot/test caps, and the exact line `Do not enable auto-merge or merge.` (it limits that worker's own actions; it is not a veto and never goes into a PR body — a hold is `MERGE-HOLD:`),
  mark ready only after `ready-gate.mjs` exits 0; stand down on overlap. The template in `references/orchestrator.md` carries every field.
- **Hard lines** (full list and why: `orchestrator.md` §Hard lines): `permission_mode: "auto"`; `source_revision` = the deploy branch or a NAMED integration branch; model stated; who opens the PR and its base; the full deliverable checklist in the first brief. **Quota gate:** read `rate_limit_info` from `get_session` before each `create_session` and each Agent wave > 5, stop at `allowed_warning`, stagger launches ≥ 30 s and confirm each (#2380).
- **Model by task** (Bryce 2026-10-19, "decide which workers should be opus or [sonnet] based on the issue. Make this standard."). Every
  `create_session` and fresh-session scheduled task passes an explicit model, and the brief carries `MODEL: <id> — <reason>`:
  - `claude-opus-5-5`: a design or look call, a rework of a rejected approach, a red with no known cause, or a change in physics,
    a renderer backend or `js/game.js`.
  - `claude-sonnet-5-5`: everything else: port a known fix, sync, one screen's CSS, tests, docs, PR babysitting, surveys.
  - A Sonnet worker that finds the task is Opus-shaped sets `needs-decision` rather than grinding; never Fable for a worker.
    An Opus lane keeps the Sonnet cost cap (below). Never invent another id. Own notes go to `docs/notes/<topic>.md`.
- Lane mutex: garage CSS → UI Survey; `js/car/*` → Cars; scenery (`js/circuits/scenery/*`) → Tracks; `js/game.js` needs `who-is-on-it --claim` before an edit. Lighting: ≤ 1 concurrent lighting agent, OWNED=`js/lighting/**` only, no scenery PRs from that lane.
- Review farm: ≤ 2 concurrent review agents unless the user overrides. ≤ 2 parallel nested subagents inside one cloud agent; more → separate agents with disjoint OWNED.
- Resolve swarm: only red/dirty PRs with no specialist owner (capped); one `--claim` per PR; stand down if a specialist already owns the paths.
- Refuse a launch whose sole goal is "read/understand the project" or "investigate all", and a bare "continue working" without a new delta or a narrower scope.
- **Survey lane (read-only first):** track/UI survey launches are findings-only for
  the first pass — measurements, captures, and a written report. No PR unless a
  single fix is **under 20 lines** in the surveyor's OWNED pair (circuit def +
  scenery for tracks; one screen/CSS slice for UI survey). Larger fixes become one
  tracking issue (or an entry in `docs/tracks/surveys/<id>.md` / the circuit survey
  gallery), not an open-ended survey branch. Prefer each lane skill's **Where things
  live** map over repo-wide `grep` churn.
- **Follow-up cap:** each worker gets at most **two** orchestrator follow-up rounds
  after the first hand-back (three attempts total). Round 3 needs a new launch
  prompt with new evidence or a narrower OWNED — never "keep going" on the same scope.
- **Closeout (every worker, including surveys):** fold findings into **one** tracking
  issue or the survey gallery doc; list redundant draft PRs the work superseded
  (closing them is for a human or Merge Desk — do not close or merge from the worker);
  `--release` the claim; set fleet `state: done`; archive the agent. No fourth
  "polish" round without a new claim.
- Feature / Survey / Chromium-play budgets: abort at > ~400 messages or > ~90 min with no OWNED push; ≤ 25 apex-eval/shot/Playwright captures unless the user raises the cap (sample the matrix over menus/teams/tracks). 
  Never fork or relaunch an errored or > 400-message agent on the same prompt: a new launch needs new evidence or a narrower OWNED.
- **Pre-launch claim (mandatory):** before spawning any worker, the orchestrator runs
  `node tools/ci/who-is-on-it.mjs` and refuses the launch when the same task text,
  path overlap, or an active `--claim` already covers the OWNED globs. The worker's
  first loop step is its own `--claim "<task>" --session <id>` (or the host claim
  tool); two agents must not take the same job.
- Twin guard: `who-is-on-it.mjs` plus a title/PR scan; stand down when the same title, the same PR feature or an overlapping OWNED is already running.
- Pin long Chromium/visual smoke to `apex-sha` or the PR's Pages preview; never bind a loop to the moving production github.io (tip-vs-Pages is Monitor-only).
- Sync agents: sync with `sync-pr.mjs` only when GitHub reports CONFLICTING/DIRTY or a required tip check is red; a Finish/Update run syncs only if CONFLICTING; one Sync agent per PR (refuse duplicates); ONE conflict-only resync lane serves the queue: it takes only PRs `needs-sync.mjs` rates `conflict` or `stale-red`, never a clean-behind one;
  never Sync and merge in one run (`behind-ship.mjs` warns over 10 behind, never fails). No auto-update-branch bots.
  Abort or stop and report a Finish/Update run past ~120 messages or > 2 tip moves with no progress while clean-behind.
  Normalize a messy merge with `node tools/check/merge-hygiene.mjs --fix`, then `gen-test-groups.mjs`.
- **Paced push: retired 2026-10-16** (CI/CD review #2333 finding 7). The `PUSH SLOT` rule existed
  because every session waited on the same `queue-depth.mjs` hold and pushed in the minute it
  released; with no hold there is nothing to pace. Push when your own cycle is green.
- Every worker hand-back reports its head SHA; on a token failure it stops and reports. Batch small tooling/doc fixes into ONE PR; tooling/docs/MCP/prompt-only PRs stay off merge-train auto-launch and per-PR resolve swarms.
- **Cost and context (retro 2026-10-17, `docs/notes/AGENT-RETRO-2026-10-17.md`).** Three long-lived Opus sessions were 53 % of one night's
  ≈ $660: a 750 k-context orchestrator at ≈ $0.35 per 5 s wake, a Home CSS fixer at $100 with nothing committed. The launch
  prompt names the model and a `cost cap`; a lane that is switched to Opus keeps the Sonnet cap. An orchestrator hands off past 200k
  context. Default: the fleet check-in is a fresh-session scheduled task at ≥ 15 min that stops after 2 unchanged checks; the user
  may choose a tighter cadence (Bryce chose 5 min on 2026-10-17), and then the orchestrator follows that.
- **Size stop (per role, 2026-10-19).** Every launch prompt ends `STOP AT: <limit> context or $<cap>` (orchestrator.md hard line 12):

| Role | STOP AT (context) |
|---|---|
| reviewer | 120k |
| worker | 150k, at a verified checkpoint |
| PR owner | 150k (docs-only PR: 100k) |
| synth | 150k |
| fleet watcher | 100k |
| orchestrator | 200k |

  At every wake read your own `context_usage` via `get_session` (no id); at or over STOP AT: push, post the partial or FINAL, send HANDOFF, end.
- **Cost and context (2026-10-19, `docs/notes/FLEET-COST-2026-10-19.md`, prices from platform.claude.com pricing).** Per-call cost is
  about context x cache-read price ($0.20 / MTok Opus 5.5, $0.10 Sonnet 5.5), and a session's cost is roughly quadratic in its calls.
  Cache reads were 41-69 % of every long session's bill. A handoff at 150k instead of 300k cuts cache-read dollars per unit of work by
  about 40 %; Opus to Sonnet halves them again. Keep tool results small (comms.md §Output budget), route verbose reads through a subagent.
- **Monitoring and reporting.** Every hunter and PR-owner launch prompt carries the block in `role-pr-owner.md` §Monitoring and reporting
  (own the PR to merged or STOP AT; `fleet-status:` line in the fleet block plus a PR comment per state change; decisions to the orchestrator via needs-decision).
- **Desk field.** Every launch prompt carries `merge_desk: <session id | none>`; `none` means the lane reports `SWEEP-N/A` and never runs
  `list_sessions` to look for one (7 lanes, 24 calls, 2026-10-16).
- **Before launching an owner:** `who-is-on-it.mjs`, armed auto-merge, PR `updated_at` < 15 min. Skip a PR that is armed and green or is
  being driven (6 owners did no work on 2026-10-17).
- **Hunters and perf lanes:** stop after the first zero-finding round and put the note in the single docs PR (5 of 13 debugger hunts and
  P3 returned no defect for ≈ $41; four docs-only notes each paid a full CI run). Cap a hunter at ~3 rounds or 25 min, then FINAL.
- **A lane that edits `.claude/**`** needs Bryce's quoted grant in its own launch prompt; a relayed grant is refused by the classifier
  (019c5Yi lost 9 min until a typed `Approved:`).
- **Stand-down** is a message with a 2-minute window to push a WIP findings note before any interrupt (five mid-probe lanes lost
  findings that exist only in their transcripts, 00:13:35Z).
