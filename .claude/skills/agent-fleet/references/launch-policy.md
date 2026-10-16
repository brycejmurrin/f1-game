## Launch policy (moved from AGENTS.md §Concurrent PRs)

Binding on every orchestrator, desk or person writing a cloud launch prompt.

- Cloud launch prompts must include `OWNED:` / `FORBIDDEN:` path globs, done-when, shot/test caps, and the exact line `Do not enable auto-merge or merge.` (it limits that worker's own actions; it is not a veto and never goes into a PR body — a hold is `MERGE-HOLD:`),
  mark ready only after `ready-gate.mjs` exits 0; stand down on overlap. The template in `references/orchestrator.md` carries every field.
- **Hard lines** (full list and why: `orchestrator.md` §Hard lines): `permission_mode: "auto"`; `source_revision` = the deploy branch or a NAMED integration branch; model stated; who opens the PR and its base; the full deliverable checklist in the first brief. **Quota gate:** read `rate_limit_info` from `get_session` before each `create_session` and each Agent wave > 5, stop at `allowed_warning`, stagger launches ≥ 30 s and confirm each (#2380).
- Model id `default` only for a cloud launch; never invent another. Own notes go to `docs/notes/<topic>.md`.
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
- Sync agents: sync with `sync-pr.mjs` only when GitHub reports CONFLICTING/DIRTY or a required tip check is red; a Finish/Update run syncs only if CONFLICTING; one Sync agent per PR (refuse duplicates);
  never Sync and merge in one run (`behind-ship.mjs` warns over 10 behind, never fails). No auto-update-branch bots.
  Abort or stop and report a Finish/Update run past ~120 messages or > 2 tip moves with no progress while clean-behind.
  Normalize a messy merge with `node tools/check/merge-hygiene.mjs --fix`, then `gen-test-groups.mjs`.
- **Paced push: retired 2026-10-16** (CI/CD review #2333 finding 7). The `PUSH SLOT` rule existed
  because every session waited on the same `queue-depth.mjs` hold and pushed in the minute it
  released; with no hold there is nothing to pace. Push when your own cycle is green.
- Every worker hand-back reports its head SHA; on a token failure it stops and reports. Batch small tooling/doc fixes into ONE PR; tooling/docs/MCP/prompt-only PRs stay off merge-train auto-launch and per-PR resolve swarms.
