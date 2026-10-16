# Continuous process measurement for Apex 26 — plan

Goal: the fourth audit is a **file read**, not a 60-run scrape. Three audits
(`PROCESS-SPEEDUP-2026-09.md`, `-09-16.md`, `AGENT-PROCESS-RESEARCH-2026-09-16.md`)
each spent most of their session re-deriving the same table. Everything below
costs an agent **zero extra commands**: it is produced by machinery already
running (hooks, the live reporter, junit, the nightly CI cron at `ci.yml:171`).

Ranking is by *decisions unlocked ÷ effort*, not by size.

| # | item | effort | unlocks |
|---|---|---|---|
| 1 | CI process dashboard (nightly, committed) | 4–6 h | the whole §0 table, DORA, re-gate/cancel rates |
| 2 | Per-test duration history | 2–3 h | shard balance, 2× growth flags, `select-budget`'s constants |
| 3 | Waste detectors (5 one-liners) | 2 h | stops the waste at the moment it happens |
| 4 | Session ledger | 3–4 h | "where did this session's minutes go" |
| 5 | Time budgets & ratchets | 3 h | regressions fail loudly instead of drifting |

---

## 1. CI process dashboard — nightly, committed

**What.** One JSON + one markdown file holding per-job p50/p90/max, cancel
rate, same-SHA re-gate count, push→live latency, flake counts, and the four
DORA keys, over the last N runs.

**Source.** `GET /repos/{o}/{r}/actions/runs?per_page=100&branch=…` →
`id, head_sha, event, status, conclusion, run_attempt, run_started_at,
updated_at, path`; then per run `GET …/actions/runs/{id}/jobs?per_page=100` →
`name, started_at, completed_at, conclusion, run_attempt, runner_name,
steps[].{name,started_at,completed_at}` (verified against the REST docs).
`pages.yml` runs give push→live. In-workflow `GITHUB_TOKEN` (`actions: read`)
lifts the anonymous 60/h rate limit that would otherwise bite at ~120 calls.

**Fit.** `tools/ci/verify-change.mjs:197` already does an unauthenticated
`actions/runs` fetch, so the client shape exists. `ci.yml` already has a
`schedule: "17 3 * * *"` cron to sit behind.

**Plan.**
- `tools/ci/process-dashboard.mjs` (`@doc` header, `@section runner`):
  `--runs 60 --workflow ci.yml --out <json> --md <md> --json`.
- `.github/workflows/process-dashboard.yml`: `schedule: "47 4 * * *"` +
  `workflow_dispatch`; `permissions: {contents: write, actions: read}`;
  runs the tool, writes `$GITHUB_STEP_SUMMARY`, and **pushes to a dedicated
  `metrics` branch** — never to `claude/f1-game-project-26h3ng` (the
  deploy-branch review rule). Agents read it with
  `git fetch origin metrics && git show origin/metrics:process-dashboard.json`,
  one line in AGENTS.md §Verification.
- Schema (`process-dashboard.json`):

```json
{ "generated": "2026-09-17T04:47Z", "window": {"runs": 60, "from": "…", "to": "…"},
  "jobs": { "Pure-node unit suites": { "n": 58, "p50_s": 402, "p90_s": 560,
      "max_s": 910, "fail": 2, "cancelled": 4, "steps": {"npm ci": 1.4} } },
  "runs": { "n": 60, "cancelled_pct": 15.0, "regated_shas": 12,
            "fast_tier_p50_s": 720, "full_tier_p50_s": 822 },
  "deploy": { "push_to_live_p50_s": 840, "p90_s": 2640, "superseded": 2 },
  "flake": { "wake-lock.spec.js › late release": {"attempts": 5, "red": 4} },
  "dora": { "deploy_freq_per_day": 3.1, "lead_time_p50_s": 840,
            "change_fail_pct": 6.7, "mttr_p50_s": 1980 },
  "notes": ["cancelled runs may hide a real failure — ci.yml:283"] }
```

- Markdown twin = the §0 table of the research note, same column names, so
  the next audit pastes it.

**Verify.** `tests/unit/process-dashboard.test.mjs` runs the reducer over a
checked-in fixture of two runs + jobs JSON and asserts every derived number;
no network in the test. First real run cross-checked against the 2026-09-16
hand numbers (node-suites 11.3 min median, cancel 15 %, re-gate 20 %) — if it
disagrees, the reducer is wrong, not the audit.

**Decision.** Did B4/B5/item 1 actually land the savings they claimed? Is the
cancel rate still 15 %? Which job is the current fast-tier floor? These are
the questions every audit opened with.

**Effort** 4–6 h. **Risk:** API pagination/rate limits (bounded by `--runs`);
a noisy runner makes single-run times meaningless — always report p50/p90 with
`n`, never one run. Privacy: public repo metadata only, no session data.

---

## 2. Per-test duration history

**What.** A rolling per-test aggregate (`p50`, `p90`, `n`, `baseline`) that
drives duration-based sharding and flags any test whose p50 grew > 2×.

**Source.** `tests/helpers/live-reporter.js` already collects
`this.durations = [{name, dur}]` and prints the slowest 10 — the data exists
and is thrown away at `onEnd`. junit.xml (`artifacts/test-results*/junit.xml`,
`playwright.config.js:194`) carries `time` per `<testcase>` and is already
uploaded by five `upload-artifact` steps in `ci.yml`.

**Fit.** Additive: one `try/catch` write in `onEnd`, disabled by
`APEX_NO_DURATIONS=1`. `tools/ci/junit-failed.mjs` is the precedent for
parsing junit properly (its header records how a naive regex read zero
failures for two red runs — reuse `failedSpecsFrom`'s matcher shape).

**Plan.**
- Reporter appends `artifacts/logs/test-durations.jsonl`, one line per final
  result: `{"ts":…,"spec":"tests/specs/x.spec.js","test":"…","ms":38200,
  "status":"passed","retry":0,"workers":1,"group":"$APEX_GROUP","ci":false,
  "gl":"swiftshader","load1":1.7}`. Local file, gitignored.
- `tools/ci/test-durations.mjs --merge <jsonl|junit…> --into docs/data/…`
  folds new rows into a **bounded** aggregate keyed by `spec › test`:
  `{p50_ms, p90_ms, n, first_seen, baseline_ms, env}` — separate buckets for
  `ci+swiftshader`, `ci+llvmpipe`, `local`, because mixing them is how a
  "regression" turns out to be a renderer swap.
- The dashboard job (item 1) merges the nightly run's junit and commits the
  aggregate to `metrics` alongside the dashboard.
- Two consumers: (a) `smoke`/`selected` shard assignment by *duration*
  instead of count (B6 was balanced by hand — Playwright shards by count,
  per its own docs); (b) a `TIME REGRESSION` line in the job summary when
  `p50_ms > 2 × baseline_ms && n >= 8`.

**Verify.** Fixture junit + fixture jsonl → asserted aggregate. Re-derive
`select-budget.mjs`'s `MEASURED.secPerTest` (79.7 s, hardcoded from CI run
31197770813, 2026-08-07) from the aggregate and check the two agree within
20 %; if they do, replace the constant with a generated block and keep the
`@gen` marker so `protect-files.sh` guards it.

**Decision.** Which spec to port to the VM next (largest p50 × runs/week);
whether a shard split is needed; whether a "slow" test is slow or the box was.

**Effort** 2–3 h. **Risks:** retries double-count (key on the final result,
as the reporter already does); junit `time` semantics across retries is
**unverified** — check one file before trusting it. Growth flags must be
advisory for ≥ 4 weeks before they can fail anything.

---

## 3. Waste detectors — five one-line printers

**What.** Each known waste pattern gets one detector that prints one line at
the moment it happens and appends one ledger row. Advisory by default;
promoted to blocking only after the ledger shows it firing on real waste.

| detector | where | line |
|---|---|---|
| browser group for a docs-only diff | `test-bg.mjs` start path, reusing `pick-tests`' changed set | `WASTE: docs-only diff — group <g> buys nothing (AGENTS.md verification table). --force to run.` |
| twinned spec run in a browser | `run-playwright.mjs` (A1 already drops them) — add the counter | `COVERED BY VM TWIN: <spec> → <twin> (n dropped)` |
| two Playwright processes | `bash-guard.sh` PreToolUse on `npm test`/`test-bg`/`run-playwright`, reusing the `ps -eo args` probe `protect-files.sh:110` already runs | `WASTE: a playwright run is live (pid N) — AGENTS.md rule 5 is one group per batch.` |
| push over a live run | `bash-guard.sh` on `git push`, 3 s API lookup lifted verbatim from `verify-change.mjs:193-203` | `WARN: 2 live ci.yml runs on this branch — this push cancels them and loses their failures.` |
| hand-edited generated file in a commit | `bash-guard.sh` before the guards: `git diff --cached --name-only` ∩ the `GENERATED` set from `protect-files.sh` | `BLOCKED: version.json is staged and GENERATED — run its generator.` |

**Fit.** Four of the five live in `bash-guard.sh`, which already costs 30 ms
and already owns "AGENTS.md rules made deterministic". The fifth closes a real
hole: `protect-files.sh` guards `Edit`/`Write`, not a `sed -i` or `>` through
Bash.

**Plan.** Keep every detector **exit 0 + stdout** except the generated-file
one (exit 2, it has a clean fix). Each appends
`{"ev":"waste","kind":"docs_only_group","cost_est_s":1800}` to the session
ledger so item 1's dashboard can count "waste events per week" — the number
that says whether a detector earned its line.

**Verify.** One `tests/unit/bash-guard.test.mjs` case per detector, feeding
the hook synthetic stdin JSON (the hooks already take stdin JSON, so this is
a pure unit test — no session needed).

**Decision.** Promote to blocking, or delete. **Effort** 2 h.
**Risk:** a false positive that blocks is far worse than a missed line — hence
advisory-first. The push detector adds up to 3 s to `git push`; cap it.

---

## 4. Session ledger

**What.** `artifacts/sessions/<session_id>.jsonl` + a summariser that answers
"where did this session's minutes go" in one line.

**Source, and the key finding.** The hooks docs are explicit: **PostToolUse
carries no duration and no exit code.** Two routes:

- **(a) Hook pairing.** `PreToolUse` and `PostToolUse`/`PostToolUseFailure`
  share `tool_use_id`; stamp `t` at each and diff. Use `"async": true` so the
  append never sits in the agent's loop (async command hooks have no enforced
  timeout, i.e. they are off the critical path — *unverified that they are
  also off the latency path*; measure once with a sleep).
- **(b) Transcript reconstruction — cheaper and retroactive.** Every hook
  receives `transcript_path`, and this session's transcript entries carry
  `timestamp`, `uuid`, `parentUuid`, `type`, `toolUseResult`, `promptId`,
  `gitBranch` and, on assistant entries, `message.usage` (verified by reading
  the *key names* of this session's own JSONL — no content read). So a single
  `SessionEnd`/`Stop` hook can derive every per-tool duration post hoc with
  **no per-call hook at all**.

Recommendation: **(b) as the engine, (a) only for the events the transcript
cannot see** — `PermissionRequest` / `PermissionDenied` (the stall that
motivated the A5 allow-list), and the item-3 waste rows.

**Plan.**
- `.claude/hooks/ledger.sh` on `PermissionRequest|PermissionDenied`, async,
  appending `{"t":…,"ev":"perm_request","tool":"Bash","key":"npm run gen"}`.
- `tools/ci/session-ledger.mjs`:
  `--from-transcript <path> | --session <id> | --summarise | --json`.
- Row schema (one shape for both writers):

```json
{"t":1758000000,"ev":"tool","tool":"Bash","key":"test-bg smoke",
 "dur_ms":1840000,"ok":true,"group":"smoke","tokens":null}
```

- Summary (what a session prints at the end, or an audit reads in bulk):
  `browser 41m (2 groups: hooks 28, gfx 13) · node gates 9m · edits 37 ·
   commits 3 · permission stalls 4 (npm run gen ×2, git add ×2) ·
   waiting on tools 63% · waste 1`

**Privacy — the binding constraint.** `artifacts/` is gitignored, so the raw
ledger never leaves the box by construction. Store **timings, tool names,
repo-relative paths, and a redacted `key`** (Bash commands classified against
a shape allowlist — `npm run test:<group>`, `node tools/ci/*`, `git <verb>` —
everything else is literally `"other"`). Never `prompt`, never `tool_response`,
never file contents, never the session id in anything committed. If a row
reaches item 1's dashboard it is an aggregate with the date and the counters
only.

**Verify.** `tests/unit/session-ledger.test.mjs` over a synthetic transcript
fixture; a redaction test asserting no fixture command string survives into a
`key` unless it matched the allowlist.

**Decision.** Is the browser still *the* cost (the premise of all three
audits)? Which commands to add to the allow list, ranked by stalls? Is
`verify-change` being used at all, or is the ritual still hand-rolled?

**Effort** 3–4 h. **Risk:** transcript schema is undocumented and may change —
keep the parser tolerant and the tests fixture-based, and degrade to "no
ledger" rather than erroring at `SessionEnd` (which has a 1.5 s budget).

---

## 5. Budgets and time ratchets

The repo already has the right idiom: `tests/data/ratchets.json` — "a number
you must look at gets thought about". Extend it to time, with one rule: **a
time ratchet must never run the thing it measures.** It reads items 1–2's
files.

- **(a) Per-spec ceiling in `select-budget.mjs`.** Add
  `CEILING = { perSpecSec: 480, source: "docs/data/test-durations.json" }` and
  a `tests/unit/select-budget.test.mjs` case that fails when a selectable
  spec's CI p90 exceeds it. `agent-view.spec.js` (22–40 min) would have failed
  it months ago — that is the point: it forces port-or-split as a decision
  rather than as an audit finding.
- **(b) Per-session browser-minutes budget.** `test-bg.mjs` prints
  `budget: 38/45 browser-minutes this session` on each group start, from the
  ledger; refuses past 2× without `--force`, in the same voice as its existing
  loadavg refusal. Advisory number, derived from measured sessions, not guessed.
- **(c) Suite wall-time ratchets.** New `"time"` scope in `ratchets.json`:

```json
"time": {
  "test:tooling-fast": {"ceilingSec": 150, "slack": 40, "env": "jobs=3, idle"},
  "ci:Pure-node unit suites": {"metric": "p50", "ceilingSec": 480, "n_min": 20},
  "ci:fast-tier": {"metric": "p90", "ceilingSec": 1200, "n_min": 20}
}
```

  Checked by `tools/check/time-ratchets.mjs` **in the nightly dashboard job
  only** (never in `test:guards`, never in the edit loop). Over-ceiling fails
  the nightly and names the job — loud, but it cannot tax a commit.

**Verify.** Set each ceiling from the dashboard's first 20-run window plus
slack, then confirm the nightly is green for a week before anyone relies on
red meaning something.

**Effort** 3 h. **Risk:** runner variance — hence `p50`/`p90` with `n_min`,
never a single run, and a slack at least as generous as the ratchet file's
default `max(60, 4 %)`.

---

## 6. What NOT to measure (noise, or worse)

- **Hook latency.** Measured at 30–44 ms in the 09-16 research and explicitly
  recorded as "not a cost". Re-measuring it is how an audit wastes an hour.
- **Tokens/turn or cost as a productivity metric.** Available
  (`message.usage`, and OTel's `claude_code.token.usage`), and a trap: it
  rewards short sessions, not finished work. Keep tokens as *context* on a
  ledger row, never as a KPI.
- **Commits, lines changed, or files touched per session.** DORA's own
  guidance is that output counts are the metrics teams game first; here
  `ratchets.json` already punishes line growth for the right reason.
- **Single-run wall time of any CI job.** Runner variance dominates; the field
  notes are full of incidents where one slow job was the machine.
- **Pass rate of an individual test below n≈10**, or any flake number taken on
  a box at `loadavg > 3` — that measures the box (AGENTS.md rule 8).
- **"Thinking time" as a target.** Fine as a ledger column, useless as a goal.
- **Anything that needs an agent to run an extra command to produce it.** If it
  is not emitted by something already running, it will not be there at the
  next audit.
- **Prompts, tool outputs, diffs, session ids** in anything committed. Sessions
  are personal; the committed surface is timings and names only.

---

## Order

1. Item 1 (dashboard) — everything else has somewhere to land once it exists.
2. Item 2 (durations) — it is a 20-line change to a file that already has the
   data in memory.
3. Item 3 (detectors) — cheapest, and it is the only one that saves minutes
   *during* a session rather than explaining them afterwards.
4. Item 4 (ledger), then item 5 (budgets), which depends on 1, 2 and 4.

Unverified and worth one measurement each before relying on them: async hook
latency; junit `time` under retries; transcript entry semantics (key names
confirmed, meanings inferred); whether the `metrics`-branch push is acceptable
to whoever owns the repo's branch policy.
