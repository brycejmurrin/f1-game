# Plan: fix what slows agent sessions down (from 300 transcripts)

**Date:** 2026-10-16 · **Owner ask (Bryce):** "re read all transcripts and reports so we can draft a plan to fix
issues, help agents, add new tools or skills or workflows etc". **Evidence:** pass 1
[`docs/notes/TRANSCRIPT-MINING-2026-10-16.md`](../notes/TRANSCRIPT-MINING-2026-10-16.md) (122 sessions) plus pass 2
(this plan: 178 more sessions, deep reads of the six most expensive, 24 Sonnet miner sessions in all). Tracking issue
#2379. **Prior plan this extends, not replaces:** [`2026-09-30-agent-skills-and-tools.md`](2026-09-30-agent-skills-and-tools.md).

## Coverage

All 313 sessions on this repo (318 listed; 5 belong to other repos) were read at least at their newest page; 300 by
transcript digest, the rest from `get_session` metadata where the transcript had expired. Pages are mostly session
tails: the edit phase of long sessions and the middle of the $1–2k sessions are under-sampled, and their cost
attribution comes from usage counters (TURN `$` restarts after compaction). Every claim below that names a current
file was checked on the deploy tip `e50540f0` / `dbc5cfd5`; findings already fixed are in §STALE.

## What the 300 sessions say, in one table

| # | theme | how often | what it cost | the fix family |
|---|---|---|---|---|
| A | **Account quota** ends sessions mid-work and keeps waking them | 50 of 61 "failed" sessions; 4 fleets | ~$8.5k spent before the wall; 13 subagents and 181 commits stranded | launch gate + park protocol |
| B | **Context size** — long sessions re-read 300–770 k tokens on every turn | every session over ~$150 | ~90 % of spend is cache reads; idle wakes $0.26–0.55 each at 677 k | hand off at a checkpoint; per-prompt cost signal |
| C | **The phone user polls and ships by typing** ("Check", "Push to deploy branch", "write a handoff prompt") | ≥ 25 sessions; 11 of 18 late-July sessions end in "Push to default deploy branch" | ~$1–1.5 per poll turn; whole hand-written handoff docs | three user-invocable skills: `/check`, `/ship`, `/handoff` |
| D | **Waiting is hand-rolled** (pgrep self-match, `sleep N; tail`, 30-min Monitor expiry, per-job narration) | ~40 stale-waiter turns in 25 surveys alone; most fix workers | $0.3–1 per PR in narration; false "failed" verdicts | blocking `--wait` verbs on the tools that already exist |
| E | **Launch briefs are incomplete or contradictory** (default/plan mode, wrong seed revision, "no PR" vs rule 12, missing checklist) | 3 of 14 fix workers parked on a prompt; 12 of 25 surveyors refused a relayed PR ask | 2–5× cost on stale-seeded workers; parent hand-opened 8+ PRs | launch template with hard lines + a pre-launch self-check |
| F | **PR plumbing by hand** (body edits, labels, Deferred lines, hand-back, post-merge parents, re-cut races) | 4/14 hit `ready-gate plan-open` on "Deferred:"; 4/14 rebuilt a fix someone pushed first | 3 h duplicate cycles; whole-body rewrites | `pr-body.mjs`, `handback`, `post-merge`, stand-down protocol |
| G | **Survey toolchain** lives on an unmerged branch and has a destructive flag bug | 25/25 surveys used it; 14+ overwrote tracked `gallery/` | 30–60 % of non-capture survey turns spent re-writing report builders | land and fix the gallery builder; `survey-report.mjs`; brief checklist |
| H | **Hook and guard friction** (harness Stop hook vs held pushes; ratchet on an unrelated commit; classifier denies read-only calls) | ≥ 30 sessions | a deliverable abandoned (gpu-census step); merges unverifiable | scope ratchets to the staged diff; allow rules; Stop-hook counter-guidance |
| J | **Screenshots fill the request** until it is too large to send or compact | 2 sessions, both dead | $431 of sessions ended by `Request too large (max 32MB)` | image budget at the tool + skill + hook |
| I | **CI signal is misleading** (hollow draft tier, external cancel sweeps, stale baselines after sibling merges, sweeps skipped on drafts) | hollow tier in 5+; stale-baseline follow-up PR | a user override merged an unexercised PR | `ci-watch` honest verdict lines; lower-only baseline update |

## Workstreams

Each row is one PR-sized item. **Issue:** an existing number, or **NEW** (to file under #2379). **Size:** S ≤ 1 h,
M ≤ half a day, L more. **Payoff** is the measured cost it removes.

### WS1 — Quota and launches (theme A, E) · lane: agent-fleet docs + one tool

| item | issue | size | payoff |
|---|---|---|---|
| Launch template hard lines in `agent-fleet/references/orchestrator.md` + `launch-policy.md`: `permission_mode: "auto"`, `source_revision` = deploy branch (or a NAMED integration branch), model stated, who opens the PR and its base, the full deliverable checklist (sections, weathers, merges), push slot | NEW (extends #2380) | S | 3/14 parked fix workers; stale-seed workers cost $5.55–9.50 vs $1.74–2.74; 12 refused relayed PR asks |
| Pre-launch quota check: read `rate_limit_info` from `get_session` before every `create_session` and every Agent wave > 5; stop at `allowed_warning`; stagger launches ≥ 30 s | #2380 | S | the 50/61 failures; `Sandbox allocation failed … rate_limited` |
| Quota-park protocol: first limit `api_error` → fleet block `blocked: quota until <reset>`, push dirty worktrees, delete own check-ins, stop replying; one `send_later` at the reset time so the user never types "limit has reset, try again"; workflow-authoring documents `resumeFromRunId` for a `parallel()` that returned nulls on quota | #2381 | S | ~550-row api_error tails; stranded worktrees; hand retries since June |
| `ListAgents`-free self-check line in worker.md: `SendMessage` is for in-session subagents; a parent `session_…` id needs `send_message` | NEW | S | one failed hand-back call per worker |

### WS2 — Waiting and CI verdicts (theme D, I) · lane: tools/ci

| item | issue | size | payoff |
|---|---|---|---|
| `ci-watch.mjs`: `--failures-only` (default for Monitors), `--wait` that long-polls past the 30-min Monitor limit, dedupe by run id, `= ci hollow (draft, no run-ci)`, `= ci superseded (merged / new head)`, `= ci cancelled-external`, `--jobs` (pending legs only), retry on 5xx, print the matched run id/tier | #2384 | M | per-job narration ($0.3–1/PR), 58–410 k-char `actions_list` spills, hollow drafts read as green |
| `queue-depth.mjs --wait <min>` with ~2 min hysteresis and a trend line | #2383 | S | 3–10 h holds polled by send_later; ok→hold flip 16 s later |
| `deploy.mjs --status / --wait / --gate-only --wait-idle`; a generic `wait-for.mjs` (`--load-below`, `--file-nonempty`, `--pid-gone`, `--log-line`) | #2386 | M | hand-rolled pgrep/until loops with inverted exit codes |
| `shot.mjs --batch` prints one final `= batch done N/M failed=K` and writes raw frames/sidecars to a gitignored dir; `--resume` skips validated frames | NEW (with #1982) | S | ~40 stale-waiter turns in 25 surveys; Stop-hook untracked-file nags |
| bash-guard: refuse `until/while … pgrep -f` and `sleep N; <cmd>` with a pointer to the right waiter | NEW | S | the self-matching waiter class |
| `test-bg.mjs` writes a `.done` marker with its verdict so a restarted session reads the result | NEW | S | waiters killed by worker restarts |

### WS3 — The phone user's three verbs (theme C) · lane: skills

| item | issue | size | payoff |
|---|---|---|---|
| `/check` skill: one call → session-status + `ci-watch --once` + live `version.json` (cache-busted) + ancestor-of-live, five lines | NEW | S | "Check" ×3 per session at ~$1.2 each; 380 KB spills per check |
| `/ship` skill: check-changes → `deploy.mjs --pr` → ready-gate → SWEEP; records "gate skipped by user" when asked; takes "push" as the grant | NEW | M | the most common closing request (11/18 late-July sessions) |
| `/handoff` skill: paste-ready prompt from git + PR body (Goal/Plan/Next), verifies the branch on the remote (`git cat-file -e origin/<br>:<path>`), never a repo-root HANDOFF file; states branch + sha so a cold session fetches it | NEW | S | 6+ hand-written handoffs; 4 cold starts that could not find the doc |
| `new-branch` helper (fetch tip, `checkout -B cursor/<topic>-<hash> --no-track`, push -u, draft PR) | NEW | S | "431 unpushed commit(s)" Stop-hook confusion |
| skill-hint.py trigger phrases for the three verbs | NEW | S | routes the one-word prompts |

### WS4 — Context and cost (theme B) · lane: docs + ledger

| item | issue | size | payoff |
|---|---|---|---|
| worker.md + AGENTS.md: at a verified checkpoint past ~300 k context, hand off (PR body + `/handoff`) instead of waiting in the big session; watch-only work goes to a fresh small session or Merge Desk | #2385 | S | $10 per ready→live watch at 677 k; $15 of a $50 PR on "keep it mergeable" |
| Session ledger detectors: cost per user prompt, "turn < 15 s costing > $0.20", context > 400 k, served model ≠ configured, permission_mode_seq outliers | #1714 | M | makes B visible per session |
| Wave tracker columns `$ so far` / `subagents N`; Sonnet/medium default for carve workers in `.claude/agents/worker.md` | NEW | S | 99 Opus xhigh subagents ≈ $11 each in one wave |
| **Image budget.** Screenshot tools default to ≤ 800 px JPEG for anything a model will `Read`; playwright-probe / survey-track / mcp-probe say "≤ 8 images, then compact; never re-Read an old shot"; a PostToolUse(Read) counter warns at ~15 image reads | NEW | M | two sessions ($311, $120) died on `Request too large (max 32MB)` and `/compact` itself failed (`Compaction canceled`) — no current rule covers it |
| `contact-sheet.mjs <track\|all> --frames N`: one montage JPEG per track; capture runs > 20 frames start with a ≤ 10-frame sample shown to the user | NEW | S | "For each track show me all" sent 600 frames as 24 attachments; "Stop it and do 10 shots first" |

### WS5 — PR plumbing (theme F) · lane: tools/ci + Merge Desk

| item | issue | size | payoff |
|---|---|---|---|
| `pr-body.mjs`: tick/strike/now/add a Plan item without clobbering, `- [~]` deferred items, labels (`run-ci`) via REST | #2387 | M | whole-body rewrites; clobbered strikes; label curls |
| `ready-gate.mjs` treats `- [~]` / "Deferred:" as closed | NEW | S | 4/14 plan-open re-runs |
| `handback.mjs --pr N`: one SWEEP + one parent DONE; `post-merge.mjs <pr>`: two-parent check, release claim, delete own check-ins | NEW | S | 7/14 hand-verified parents; duplicate hand-back messages; stale check-ins |
| Merge Desk `TAKING <PR>` / `STAND DOWN <PR> superseded by <PR>` before any re-cut; workers re-check before re-cutting; `recut-pr.mjs` | #2388 | M | 4/14 rebuilt a fix already pushed; 3 h duplicate cycles |
| `sync-pr.mjs`: auto-take-ship for paths the PR does not own; three-dot diff in its summary | NEW (near #2354) | M | hand conflict surgery on atmosphere.js / clip-baseline.json |
| Draft PRs that touch code get `run-ci` at creation (template + `pr-body.mjs`) | NEW | S | hollow drafts; manual ci.yml dispatches |

### WS6 — Survey toolchain (theme G) · lane: Tracks/survey

| item | issue | size | payoff |
|---|---|---|---|
| Land the gallery builder (`build-gallery.cjs` + `survey-gallery-lib.cjs` in tools/track, and its unit test) from `cursor/survey-gallery-fix-a1` / PR #1862 with: `--out DIR` and `--out=DIR`, unknown flags exit 2, never write tracked `gallery/` without `--in-place`, REST/ls-remote discovery (no GraphQL), `--no-fetch` = no network, `--only <id>` / `--check`, storm weather parsed, rows deduped by cell id | NEW (with #1983, #1982) | M | 14+ surveys overwrote tracked `gallery/`; 403 noise on every run; 20–590 s full builds |
| A new `survey-report.mjs <id> --findings f.json --check` in tools/track: downscale + embed, light/dark, 390 px overflow + decode + JS-error check, "Code & scenery deep-dive" emitter counts with verified file:line | NEW | M | the biggest survey saver: 30–60 % of non-capture turns |
| survey-track SKILL: `apex_shot_survey` for > 3 shots (never a loop of `apex_shot`), the commit recipe (`git add -f` alone, then commit), the brief checklist; apex_shot description points at apex_shot_survey | NEW (+ #1984) | S | a 52-shot serial survey took 56 min |

### WS7 — Hooks, guards and permissions (theme H) · lane: .claude/hooks + settings

| item | issue | size | payoff |
|---|---|---|---|
| bash-guard ratchet check fails only for ratchets of files in the staged diff; when the tip itself is over, print the owner/recipe | NEW (near #1686/#2337) | M | an unrelated workflow commit blocked; deliverable abandoned |
| Allow rules for read-only `git log/rev-parse/show`, `ci-watch.mjs`, and `delete_trigger` of the session's own triggers; verify merge parents via `mcp__github__get_commit` | NEW | S | classifier denied a post-merge parent check and a read-only ci-watch |
| Stop-hook counter-guidance: the harness `~/.claude/stop-hook-git-check.sh` cannot be changed here, so (a) gitignore every sidecar/raw/jobs path tools write, (b) worker.md says the sanctioned reply when a push is held or a PR merged (`git checkout --detach origin/<deploy>`), and that a user's "don't commit X" beats the hook (one July session deadlocked between the two), (c) stop-guard.sh also checks `git worktree list` for dirty/unpushed worktrees | #2385 + NEW | S | ≥ 14 sessions; 601-commit false counts |
| PreToolUse `if:` filters | #1711 (in flight) | S | hook spawns |
| bash-guard message for split add/commit prints the exact two commands | NEW | S | one denied turn per survey follow-up commit |

### WS8 — Tests and baselines (theme I) · lane: tests/tools

| item | issue | size | payoff |
|---|---|---|---|
| Lower-only baseline update inside `verify-track` (clip/float/props) so a sibling merge cannot leave a stale cap | NEW (near #1686) | M | a whole follow-up PR + failed full tier |
| `pick-tests` / ready-gate warn when a circuit/baseline diff's sweeps are skipped on the draft tier | NEW (refines #1949) | S | drafts green without the shards that later failed |
| Remaining #1956 specs | #1956 (in flight) | M | train reds |
| CI uploads per-spec llvmpipe timings; nightly merge into `spec-timings.json` | NEW | M | sessions sampling timings with 3 remote groups |

### WS9 — Transcript mining itself · lane: tools/ci

| item | issue | size | payoff |
|---|---|---|---|
| `session-transcript.mjs`: fold quota/heartbeat runs, drop image blobs, `--summary`; transcripts.md: a `kinds` filter cuts page SIZE to 5–20 KB for narrative reads | #2382 | S | 250–2,700 KB pages of noise |

## Order of work

1. **This week, all S, highest payoff first:** WS1 launch template + quota gate + park; WS2 `ci-watch` verdict
   lines and `queue-depth --wait`; WS3 `/check` and `/handoff`; WS4 image budget (skill lines first, tool default next); WS5 `ready-gate` deferred + `run-ci` at creation;
   WS6 gallery `--out`/tracked-path fix (on its branch) and the survey-track skill lines; WS7 allow rules.
2. **Next:** WS6 `survey-report.mjs` and landing the gallery builder; WS3 `/ship`; WS5 `pr-body.mjs`, `handback`,
   `post-merge`; WS2 `deploy.mjs --wait` + `wait-for.mjs` + shot batch done line; WS8 lower-only baselines.
3. **Then:** WS4 ledger detectors (#1714); WS5 re-cut protocol + `sync-pr` auto-take; WS7 ratchet scoping;
   WS8 CI timings; WS9.

Run lanes in parallel only on disjoint paths (tools/ci · skills/docs · hooks/settings · survey tools), at most four
workers at once, launched with the WS1 template — this plan's own first item.

## STALE (fixed since the sessions ran — do not rebuild)

Version/cache bumps and their merge conflicts (`?v=dev` + pages.yml hashing); direct pushes to the deploy branch and
hand-rolled deploy loops (protected branch, `deploy.mjs --pr`); squash merges (merge-commit-only guard); load
oversubscription (test-bg refuses at loadavg ≥ 3); PID kills (bash-guard, `test-bg --stop`); `apex_garage close`
lock (`lockFree`); `ci-red-triage` partial report; Pages concurrency cancelling runs; `.mcp.json` absolute paths;
github.io egress (agent `deploy-research`); `shot.mjs` leaking Chromium on the error path (cleanup now in `finally`); `who-is-on-it --release` output; split add/commit staging (bash-guard
ADD_PATHS); `ready-full-cap` curl; `sync-pr` stage timeouts.

## What worked (make it the default)

Cheapest fix workers were seeded from the deploy branch and checked "diff vs ship = only my circuit files"; one
watch, one report, delete the trigger, done. Surveys cost $2–3 and 35–45 min when the brief was complete.
`remote-group.mjs --no-wait` + `--watch` ran 3–4 groups with no local load. Measuring before shipping and bisecting
regressions beat theorising. Workers never merged or armed; relayed-authority refusals held.
