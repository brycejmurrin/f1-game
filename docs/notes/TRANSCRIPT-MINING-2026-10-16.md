# Transcript mining — 2026-10-16

Where Claude Code sessions on this repo get stuck, what they waste, and what to build. Orchestrated by
`session_015NYY5os8qCWtYUJjRUXAUu` (Opus) at Bryce's request ("hunting through session transcripts for issues,
ways to improve tools, ci cd, where they are getting stuck, where we may want new tools, skills or subagents"),
with 11 Sonnet worker sessions digesting transcripts through skill `agent-fleet` `references/transcripts.md`.
Tracking issue and sub-issues: see the PR that adds this note.

## Method and coverage

- **Inventory.** `list_sessions` (`mine: true`, paged until `has_more: false`) returned **318 sessions**,
  2026-06-04 → 2026-10-16: **315 archived**, 2 running, 1 idle; status buckets 254 completed, 61 failed,
  2 working, 1 review-ready; **$47.8k** recorded `usage.cost_usd` (299 sessions report it). The `tags` filter
  (`cowork-local` / `cowork-remote`) answered `tags filter is not currently available`; `ListAgents` found no
  Remote Control or local sessions. Archived sessions were read the same way as live ones (none unarchived).
- **Sharding.** 11 batches by signal: fleet orchestrators and Merge Desk; the 2026-10-09/10 bug-hunt fleet;
  the 2026-10-15 track survey/fix fleet; every failed session; every session over ~$300; then a second pass over
  completed workers first judged from metadata only, and a deep re-read past quota noise.
- **Read.** **122 unique sessions** (73 % of recorded spend, **all 61 failed ones**). Each worker read
  `get_session` plus the newest 1–3 `list_events` pages (100 events each); one deep re-read paged back up to 10
  pages. **Not read:** 196 sessions — 106 from June–mid-September under older tooling, 78 cheap track
  survey/fix workers of the same fleets that were sampled, 12 others. The middle of the giant sessions (the
  $1–2k ones are thousands of events deep) is not read; their cost analysis comes from usage counters.
- **Verification.** Each top claim below was re-checked against the tree at `e50540f0` (2026-10-16); findings
  whose cause has since been fixed are listed as STALE at the end, not ranked.

## Ranked findings

Ranked by frequency × cost. Evidence lines are verbatim from the transcript digests.

### 1. "Failed" sessions are almost all quota-parked — and fleets drain the shared quota together

- **50 of the 61 failed sessions** ended on an account usage limit, not on the work: 41 `You've hit your weekly
  limit`, 8 `You've hit your session limit` (five-hour), 1 `You're out of usage credits`. Those 50 sessions had
  spent **~$8.5k** when they stopped. The other 11 are user interrupts mid tool call (`[ede_diagnostic]
  result_type=user … stop_reason=tool_use`), none of them a tool or CI failure.
- Fleets trip the limit together: the 2026-10-15 track fleet launched ~18 Sonnet fix workers in an hour and 8 of
  them died at ~08:56Z on `rate_limit_info {rateLimitType: five_hour, status: rejected}`; four $100+ sessions on
  2026-08-05 parked within the same minute; a 99-subagent wave (`subagents 99 (86 ok, 9 failed) · api_error`,
  $1,141) hit the weekly wall mid-wave.
- Parked sessions keep getting woken. `send_later` check-ins, PR events and messages each produce an instant
  `TURN success · 1 steps · 1 s · $818.99 cumulative · api_error`; one session's newest **~550 events** are only
  that line. No spend, but the status reads `failed`, unpushed work sits in the container (a fuji worker died
  with 181 local commits), and every transcript reader pays a 250–380 KB page per 100 noise rows.
- Launches burst into a second limit: three fix sessions launched within 25 s got `Sandbox allocation failed …
  provision_error_category: rate_limited` and never ran (issues #1705, #1711, #1956 are still open from them).
- **Nothing in AGENTS.md, `launch-policy.md` or `orchestrator.md` mentions account quota** (grep for
  rate limit / weekly / five-hour / quota: empty).

### 2. Context size, not work, drives the cost of the long sessions

- The seven most expensive sessions of 2026-09-23/24 cost ≈ $7.9k between them; their usage counters show
  **2.3–5.6 B cache-read tokens** with end contexts of **408–706 k**. The 2026-10-09 fleet's $794 / $532 workers
  show 2.74 B / 2.09 B cache reads (contexts 353 k / 699 k).
- Waiting workers stay alive and re-read their context on every wake: on 2026-10-15 a buddh fix worker ran
  06:18Z → 00:15Z over 28 worker epochs (144.8 M cache-read tokens, $32); montreal and mont_tremblant sat at
  771 k and 709 k context while only polling. In the 11 track-fix workers read in full, every `check_suite
  completed` wake cost $0.04–0.06 (`21:29:42 $12.55 → 21:36:48 $12.74`), so the post-green wait was roughly $3–5
  of each $11–20 session; the cheapest workers (donington $1.48, flow-b $3.87) never sat through a CI wait.

### 3. The CI queue hold stalls workers for hours

- `= queue hold (134 Linux jobs in flight / 40, 98 queued, 2 macOS / 5)` (montreal, held 20:59Z → after
  00:21Z); `180 Linux jobs in flight / 40, 146 queued` (fuji, 08:34Z); a Spa PR whose shards take 2.2 min waited
  ~10 h for `ready-full-cap: REFUSE mark-ready — 3/3`. Browser legs queue 2–3 h after ready.
- Workers have no blocking way to wait: `queue-depth.mjs` takes only `--json`, `--write`, `--push`; there is no
  `--wait`, trend or ETA. Each worker instead re-arms a `send_later`, wakes, re-runs the gauge and narrates
  "still on hold".
- The 2026-10-15 fleet's own launch burst drove the gauge from ~100 to 180 jobs in flight; nothing tells an
  orchestrator to stop launching while the gauge holds. Epic #1949 covers the job-count side.

### 4. The harness Stop hook argues with the repo's own rules

`~/.claude/stop-hook-git-check.sh` (wired by the harness's `launcher-settings.json`, not this repo) exits 2 on
any uncommitted change, untracked file or unpushed commit. Seen in at least 14 read sessions:

- during a queue hold or a pending `tooling-fast` (`23:33:48 … 1 unpushed commit(s) on branch
  'cursor/hud-band-allocator-5e2c'` while the push was held by rule 3);
- after a PR merged and the local merge commits were superseded (mexico ×2, sochi, anderstorp — each worker
  re-discovers `git checkout --detach origin/<deploy>` or `git reset --hard`);
- with a mid-verification edit held on purpose (`I'm intentionally leaving menus.css uncommitted right now`);
- on stale-seeded workers (165–341 "unpushed" commits that were the old seed base).

Each costs a turn and nudges toward an unverified push. The repo cannot change the hook, but `stop-guard.sh`
handles only a live Playwright run and no doc tells a worker the sanctioned reply.

### 5. Hand-rolled wait loops: fragile, misread, killed by restarts

- `until [ -z "$(pgrep -f 'ci/deploy\.mj[s]')" ]; do sleep 25; done` reported a false "failed" because the
  trailing `grep -c` exits 1 on zero FAILs; `for i in $(seq 1 56); do grep -qE '= run (passed|failed…'` re-implemented
  `test-bg.mjs --wait`; `timeout 2400 bash -c 'until awk … /proc/loadavg …'` gates; `TASK stopped … Stopped by a
  worker restart` killed 7 and 5 such watchers in two sessions.
- One turn polled `ReadNotifications` 27 times inside a single 540-step, 2,922 s turn ($185 session).
- `deploy.mjs` has no `--wait` / `--status` verb, and there is no generic "wait until load < N / file non-empty"
  helper, so each session improvises.

### 6. Sessions started outside auto mode stall on prompts nobody answers

- `Waiting on permission: mcp__Claude_Code_Remote__send_later` — a $754 session ended blocked on a one-line
  check-in (default mode, `permission_mode_seq 1001`).
- An orchestrator in default mode: `Running them in Auto needs this session switched to Auto first.`
  ($131); a bahrain fix worker in default mode had a human approving each re-run.
- Two $794 / $532 fleet workers were launched in PLAN mode.
- Compound commands fall outside allow rules: `git push -q origin <branch> 2>&1 | tail -1; git rev-parse …
  → DENIED (permission-rule)`, then the plain push passes; `git push …; git fetch …; git worktree add …` likewise
  (`4 permission denials` in one turn).
- `DENIED (automode-unavailable) … the server-side auto mode classifier gave no verdict` is transient; sessions
  switched tools instead of retrying.

### 7. `ci-watch` is noisy where workers need it quiet, and silent where they need it to speak

- One event per job wakes the model per job; workers reply to green jobs (`Two jobs are green on the re-run…`,
  7 narration turns on one run). `ci-watch.mjs` has no failures-only mode.
- A GPU-census watch `was looping and re-reporting the same cancelled run` for ~30 min, leaving the lighting PR
  without a Verdict.
- A PR's only run was cancelled and `the run-ci label produced no newer run` (~20 min, then a hand dispatch);
  a deploy-tip watch re-resolved the tip twice after `cancelled with 0 jobs`.
- Workers page `actions_list list_workflow_jobs` instead: `result (58,322 characters …) exceeds maximum allowed
  tokens`, then `TypeError: string indices must be integers` ×2 parsing the spill file (twice, two sessions).

### 8. Duplicate and superseded work

- Merge Desk re-cuts left the original worker running: monza `#2144 is now a DUPLICATE of #2027` (3 CI cycles);
  monaco's #2276 ran a full ~3 h cycle before `#2276 was closed without merging`.
- Three 2026-09-23 sessions each tracked the same merges of #342/#343/#346/#348 to the end.
- A 14-minute `sync-pr` gate ran on a branch whose owner `has already pushed their own catch-up merge
  (5111cc5)`; a session raised 14 geometry baselines (~25 min) for a commit another session had already reverted.
- `git checkout --theirs` on a whole conflicted file dropped a unique fix (`--theirs took the whole file,
  dropping my unique footprint fix`).

### 9. PR-body and handoff plumbing is done by hand

- Workers build PR bodies with throwaway `python3 … s.replace("__SHA3__", …)` and add labels with raw
  `curl … Authorization: Bearer $GITHUB_TOKEN` (the GitHub MCP has no label call).
- A worker's full-body refresh re-opened a Plan item the orchestrator had struck (`re-striking it first, then
  merging`).
- The worker hand-off is the same 8–10 calls every time (ci-watch → ready-gate → pull_request_read →
  update_pull_request → SWEEP → parent message → delete_trigger), 2–4 times per PR.
- Handoffs into fresh sessions name a file on a branch the new clone never fetched (4 sessions: `No
  HANDOFF-lighting-tuner-sliders.md exists anywhere`; `Found it. It was on claude/tinyfish-mcp-track-research-o1w4lk,
  which wasn't fetched`); and a pending `need_input` question (the two-compound rule; "Should I deploy this
  batch?") is lost when its session is archived.

### 10. Fleet hygiene

- Merge Desk archived `113 of your 114 open sessions` in one 216 s turn, including two live orchestrators; the
  desk id in memory (`session_01WQY3pk…`) now returns `not found` (memory corrected in this PR).
- `who-is-on-it.mjs --release` prints only the generic "stand down or coordinate" banner, so a worker cannot
  tell whether its release took (reproduced on the current tree).
- Configured vs served model drift in the 2026-10-10 fleet (configured Sonnet served Opus, and the reverse).

### 11. Mining the transcripts is itself expensive

`list_events` at `limit: 100` returned 85–400 k characters per page and always spilled; most tail pages of
parked sessions are pure `api_error` rows; `session-transcript.mjs` skips `rate_limit_event` records but does
not collapse repeated `api_error` turns or flag a session as quota-parked; a `before_id` from another session's
page is rejected (`Invalid before_id`). Workers fell back to metadata-only for 29 sessions in the first wave.

## STALE (fixed since the sessions ran)

| finding | why stale |
|---|---|
| ratchet raise over the auto-absorb had no PR-legal path; ship red on `hud.js` blocked ~6 PRs (2026-10-10) | `ratchets.mjs` ceiling catch-up and per-branch `ratchets.d/` fragments (#2291); #2337 / #1686 track the rest |
| squash merges by workers (#1356, #1363, #1370) | merge-commit-only since 2026-10-13, enforced by `github-mcp-guard.sh` |
| triage subagent hit its 20-turn limit with no report | `ci-red-triage.md` now delivers a partial report before its last two turns |
| `apex_garage close` left its lock and Chromium alive | `apex-extras.mjs` close now returns `lockFree: true`; job cancel reports survivors |
| Stop hook flagging `deploy.mjs`'s own merge commits | the deploy branch is protected; work lands through PRs |
| two browser groups at once (loadavg 18), version-bump collisions, github.io egress rediscovered | rules 4–5 / `test-bg.mjs`, `?v=dev` shell, agent `deploy-research` |

## Proposals

| # | kind | change | payoff | issue |
|---|---|---|---|---|
| 1 | skill / policy | `launch-policy.md` + `orchestrator.md`: a **quota gate** — read `rate_limit_info` from `get_session` before each launch, stop at `allowed_warning`, cap concurrent workers, stagger launches ≥ 30 s, verify each with `get_session` | the main cause of 50 of 61 failures; avoids stranded unpushed work | sub-issue |
| 2 | skill / hook | **quota-park protocol**: on the first limit `api_error`, a worker (or its orchestrator) writes `state: blocked`, `blocker: quota until <reset>` to the fleet block, deletes its own check-in triggers, and stops replying | ends the hundreds of empty wakes; Merge Desk sees parked PRs | sub-issue |
| 3 | tool | `session-transcript.mjs`: collapse repeated `api_error` turns into one `×N quota retries` line, classify a session `quota-parked`, add a `--summary` (metadata) mode | 5–10× cheaper transcript mining | sub-issue |
| 4 | tool | `queue-depth.mjs --wait <min>` (blocking, exits on ok) plus a trend line; orchestrators hold launches on `= queue hold` | replaces send_later polling over 3–10 h holds | sub-issue (under #1949) |
| 5 | tool | `ci-watch.mjs --failures-only` (and `--jobs`: pending legs one line each, queued-leg age), dedupe by run id, report `no run for head — dispatch` and `superseded → <tip>` | removes per-job wakes and the 58 k-char `actions_list` spills | sub-issue |
| 6 | doc / skill | `worker.md`: what to do while held (refresh the PR body, end the turn silently, one timer), the sanctioned reply to the harness Stop hook (held push, merged PR → `git checkout --detach origin/<deploy>`), "one git verb per Bash call", hand off to Merge Desk instead of staying alive after `SWEEP`, compact or hand off past ~300 k context | cuts idle-wake spend ($3–5 per fix worker) and the Stop-hook detours | sub-issue |
| 7 | tool | `deploy.mjs --wait / --status` and a generic `wait-for.mjs` (new, in tools/ci) (`--load-below`, `--file-nonempty`, `--pid-gone`) | ends hand-written pgrep/until loops and their inverted exit codes | sub-issue |
| 8 | tool | a new `pr-body.mjs` in tools/ci: render the template, tick/strike a Plan item by index without clobbering others, add labels (`run-ci`) through the REST API | removes ad-hoc python/curl body edits and Plan clobbering | sub-issue |
| 9 | process | Merge Desk re-cut sends the original worker `STAND DOWN <PR> recut by <PR>`; workers re-check `who-is-on-it` before opening a replacement | saves the 3 h duplicate cycles | sub-issue |
| 10 | tool | `who-is-on-it.mjs --release` prints `released: <claim>` or `no claim for this session` | workers can trust the release | sub-issue |
| 11 | skill | handoff convention: a handoff names branch + sha and starts with `git fetch origin <branch>`; "write a handoff prompt" is chat text unless a file is asked for; a `need_input` question on a session being archived becomes an issue | the 4 failed cold starts; lost decisions | in tracking issue |
| 12 | launch | launch template asserts `permission_mode: auto` and the intended model, and the orchestrator checks both with `get_session` | the default/plan-mode stalls of finding 6 | in tracking issue |

Lower-value items kept in the tracking issue only: tools-less worktree guard skip for image branches
(`APEX_SKIP_GUARDS` was discovered by the model), `build-gallery.cjs` REST fallback on GraphQL 403, a
`--theirs`-on-whole-file warning, a destructure-usage lint (a rebase dropped `camVantage` and broke 32 circuit
tests), a hard-coded span-kind allow-list (`tieredBowl`), and printing full 40-char shas wherever a merge call
needs them.
