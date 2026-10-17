# Agent retro — 2026-10-17

Second transcript pass after `TRANSCRIPT-MINING-2026-10-16.md` (that note's quota, queue-hold and `session-transcript.mjs`
findings are fixed or tracked; this one does not repeat them). Four read-only miners read the newest 1-3 event pages of
**92 sessions** created 2026-10-16 20:21Z → 2026-10-17 09:12Z (orchestrator, Debugger/Profiler hunts, overnight PR owners,
perf and UI lanes, tip fixes, cleanup). Per-batch tables with session ids and quotes: `scratch/retro/findings-{A,B,C,D}.md`
(local, not committed). Coverage caveat: pages are the last 20-30 % of each long session, early friction is under-sampled;
costs are `get_session` / `result` totals; ids are the last 8 characters.

## Numbers

| | |
|---|---|
| sessions read | 92 (A 12, B 20, C 29, D 29, plus orchestrator-2 and others) |
| known cost | ≈ $660: A $362, B $168, C $48, D $85 |
| Opus share | ≈ $391 (59 %): orchestrator 013meHKL $214, Home fixer 01SudPYx $100, orchestrator-2 013vFtRq $39, hunter 01FPG2ri $38 |
| model drift | 3 sessions configured Sonnet, `user_switched_model: claude-opus-5-5` (01SudPYx, 01FPG2ri, 01P6yDbF); none elsewhere |
| quota-parked | 0 (the 10-16 fix held) |
| user-typed prompts in batch C | 0; classifier denials: 3 (one `.claude` commit, two kill attempts) |

## Ranked findings (frequency × cost)

### 1. Giant-context Opus sessions: tiny wakes cost cents-to-dollars, forever — ≈ $353
- 013meHKL: `$212.61 → $214.35` over 5 wakes of 3-39 s ≈ $0.35 each at ~750 k context; Bryce at 09:18 "Check on sessions every 5 mins"
  ≈ 12 wakes/h ≈ $4/h idle. 013vFtRq: hourly no-change check-ins `$27.02@17:47 → $31.02 → $35.16 → $39.19@20:57`, "Unchanged for a
  third check-in in a row, so I'm stopping" (534 k ctx). 01SudPYx: $100.12 at 722 k ctx, 27-54 s turns $0.6-1.0.
- Cause: long-lived sessions never roll; check-ins re-read the whole context.
- Fix: **role card / launch policy** (applied in this PR, `launch-policy.md`): hand off past ~300 k, fleet check as a
  fresh-session scheduled task ≥ 15 min, stop after 2 unchanged. **Tool** (issue): `session-status.mjs` shows cost and context per session.

### 2. Silent Opus switch with no cost ceiling — $143
- 01SudPYx, 01FPG2ri, 01P6yDbF show configured `claude-sonnet-5-5` and `"user_switched_model":"claude-opus-5-5"`. Hunter 09:05:39
  "The session has cost about $36.6, well past the brief's ~$15 limit" (2.5× cap).
- Fix: **launch policy** (applied): the cost cap survives a model switch; lanes self-report cumulative cost at each checkpoint.
  **Tool** (issue): `session-status.mjs --cost` flags configured≠served model.

### 3. Screenshot / phone-matrix loops with the commit held for human review — $102, 7 h, nothing committed
- 01SudPYx 09:06:27 "Still uncommitted on purpose... I'll commit and push once the screenshots look right"; 09:09, 09:16, 09:19 each "12
  phone cases are re-running... about 6 minutes"; reads `phone-852-*.png` although its title says "no screenshots". 013v67cB (711 s) and
  01WHiAhg (204 s) were user-rejected on the same shape.
- Cause: a moving reference ("like your Oct 6 screenshot"; Oct 14 vs Oct 15) and a goal that needs the user's eye; breaks AGENTS rule 12.
- Fix: **skill** `css-play` / `ui-menu-a11y`: diff against the named known-good commit first, assert numerically (the matrix already prints
  `bad []`), cap probes at 3, commit WIP to the topic branch at every green check. **Hook** (below, proposal H3): warn on an unpushed
  diff older than 1 h in a UI fixer.

### 4. The global Stop hook nags on state the agent must not change — ≥ 8 sessions, ~1 wasted turn each, plus ~9 in the newest pages alone
- `~/.claude/stop-hook-git-check.sh` fires on hook-written `.claude/memory/MEMORY.md` (#2635: 4× 08:11-08:17; hunter 09:02:15, 09:02:31,
  09:03:18 "the only uncommitted files are the memory-sync hook's .claude/memory/ files. They aren't mine"; P1 07:41 `git checkout
  .claude/memory/MEMORY.md`), on a push deliberately held for live CI (011e3TN 22:09:16, 01USdi7 22:09:00 "I'm not pushing yet, even though
  the stop hook asks me to... A push now would cancel it", 01UQC1Jf 08:56), and `stop-guard` after a raw `npm test` (#2420).
- Cause: the hook lives outside the repo (user home) and does not know about live CI or memory-sync's tracked files; AGENTS rule 4 says the
  opposite of what it asks.
- Fix: **hook** — H1 below (user-level, Bryce applies) and H2 (repo `memory-sync.sh`). Issue filed.

### 5. Idle-wait and per-job wake turns — ≈ $5-10 per night in owners, more in 350-600 k lanes
- ~15 of 29 overnight owners: 01LrsKua 06:07-06:11 five 1-step wakes with one SAY per job leg; 01GBFeP "Another job passed (hud-layout 1 of 3).
  Nothing to act on."; 01VN3Sk 10 one-step "still waiting" turns; three wake channels per owner (subscribe + Monitor + send_later) give
  "only the subscription confirmation", "old monitor expiring". Lanes also idle 30-40 min between ready and merged at 380-600 k context
  (01Bpu9n 23:13→23:43, 01SzLrB 23:09→23:47).
- Cause: the documented Monitor line was plain `ci-watch`, which emits one event per job; `--failures-only` already exists (#2384) but no
  card named it. 019yzRi5 04:35:13 also lost a Monitor to a grep that never matched the `[ci-watch]` prefix.
- Fix: **AGENTS.md + role-pr-owner** (applied): Monitor on `ci-watch.mjs --sha S --timeout 30 --failures-only`, no SAY on a green leg.
  Lane ends after the final REPORT once merge is armed (launch policy, applied).

### 6. Merge Desk hunt by lanes when no desk exists — 7 lanes, 24 `list_sessions` calls, each a >100 KB spill
- 01SzLrB 23:09:21 "The session list is too big to read inline. I'm grepping the saved file for the Merge Desk session"; 01S6mpe,
  01K1BG6, 01USkCX, 01J97XL, 01HmJta, 01Em9nv the same; SWEEP never went out.
- Fix: **AGENTS.md** (applied): SWEEP only to a desk id named in the launch prompt, else `SWEEP-N/A`, never `list_sessions` to find one;
  **launch policy** (applied): `merge_desk: <id|none>` in every launch.

### 7. Hand-rolled `pgrep -f` waiters die with their task; no way to stop `tooling-fast` / `sync-pr` — ≥ 7 sessions, ~20-35 min each
- 019c5Yi waiter stopped 00:04:15; 01PCjXP 22:52:39; 01Bpu9n/01HmiRC sync-pr bg command stopped at limit 22:59:53, 22:26:33; 01VquK7H
  handed off at "tooling-fast itself is still running (291 of 651), and only my waiter timed out". 01Ri6oFt 03:41:44 bash-guard "BLOCKED:
  pkill -f / killall matches your own shell", then 03:41:54 PID lookup DENIED "[Interfere With Workloads]": "I won't kill the running
  tooling-fast". 01SudPYx 09:05:58 own-shell `pgrep -f ... kill` exit 144. 01JTiBjt interrupted in sync-pr at loadavg 6.4.
- Cause: `wait-for.mjs` had `--file-nonempty` but no way to wait on a verdict line; the guard points at `test-bg --stop`, which covers browser groups only.
- Fix: **tool** (applied): `wait-for.mjs --log-matches <log> '<re>'` (+ unit test). **Tool** (issue): `--stop` for tooling-fast / sync-pr.
  AGENTS rule 4 now names the waiter. (Part of the old sync-pr complaint is stale: #2186 made verify diff-aware and staged; the residual
  is the `--changed` fallback and the 20-min `tooling-fast` stage budget.)

### 8. Hunts and perf lanes with no stop rule — ≈ $41 for report-only/no-defect lanes, 4 docs-only notes with full CI each
- Debugger hunts $168; 5 of 13 found nothing (01VtJTk $14.54 two rounds, 01USkCX $8.88, 01Em9nv $8.02, 01USdi7 $6.86, 013HC75 $2.76).
  Perf: P3 "two dry rounds, no PR"; P1 "Round 1 landed no performance fix... noise"; the Review lane re-did `APEX_PROFILE_WAIT_MS`
  (#2636) for `tools/perf/profile.mjs` at 09:22:58; hunters 35 % of batch C cost ($16.72 of $47.86).
- Fix: **launch policy** (applied): first zero-finding round ends the lane, one docs PR, hunter ≤ ~3 rounds / 25 min. **Doc** (issue): a
  clean-areas index linked from launch prompts.

### 9. Known flakes and inherited reds cost owners an hour each
- Metal `track-switch-memory` heap growth blocked #2604 and #2634 (green only on the one re-run, which rule 9 counts as red); Tip fix 2
  had closed #2602 "needed no change" at 00:56, ~8 h before the others hit it; 01UQC1Jf 09:05 "I haven't named what the step is yet" ($2.48,
  70+ min, ~13 min per Metal cycle). Also `time-trial.spec.js > Driving zoom matrix desktop` (019yzRi5 04:44) and vm-b2 (01HLisSP).
  01Ri6oFt waited 02:51→03:08 on an inherited red. Deploy-red on Fable cost $3.42 for "NOTHING TO FIX" (013vkLjN).
- Fix: **issue**: one owner for the Metal heap flake, `ci-watch` prints "base red since <sha>: <job>" and flake-quarantine membership;
  deploy-red prefilter "fix already on tip". (Quarantine edits are out of this session's scope.)

### 10. Auto-merge fires while the full tier is still running — 3 sessions
- 01FJARce 05:08:46 "It merged while the full-tier CI run (#39004511487) was still in progress ... I never saw its final verdict";
  01NKRpiR 00:01:57 "29 jobs with 0 failed, still running". 01WH2pNv / 01T5YQa2 DONE admit unchecked merge parents.
- Fix: **CI issue**: the required `CI` check waits for the selected-spec verdict. **Role card**: list "merged before full tier completed" as Not run.

### 11. Branch collisions and sync-pr's brittleness — 6 sessions, ~1 h per incident
- 01LWveXj 01:36:57 push refused, "Another session already pushed a base merge (3dab79fea)"; 01Ri6oFt 02:54:06 "the sync-pr-... claim is not
  mine"; 01AytiBQ 11:21 did not re-run tooling-fast on the final merge commit; 01VYzvqx 10:43 sync-pr "killed at its background time limit",
  resume "refused on load average ... 4.14 ... the box itself is idle"; a stale `sync-pr-*` branch made sync-pr exit silently (10:19);
  01Bpu9n merged a tip 27 commits stale; 015B3Jm4 started a hand `git merge` with a custom resolve.py on a PR with a live Cursor session.
- Fix: **issue**: sync-pr re-fetches before merging, cleans a stale `sync-pr-*` branch, load gate waits instead of refusing, a branch lock.
  **Launch policy**: owner owns its pushes; an orchestrator sync goes through `who-is-on-it --claim`.

### 12. Banned or unsafe command shapes and a push over a red local run
- 0125WDXz / 012oa4np / 01R2V6zE chained `who-is-on-it --release; pkill -f "http.server 3456"`: bash-guard blocked the whole command and the
  claim stayed held. Lane B ran `tooling-fast ...; git push` and pushed despite "= run failed (39 passed, 1 failed)". #2420 ran a 55-spec
  local shard repro. 01NHN9Bw 09:19:26 `git commit` → "bash-guard.sh: timed out; blocking because onFailure is block" at loadavg 5.0
  (guards 180 s, `.claude/settings.json`), gfx-backend-canary FAILED at loadavg 5.01 but passed alone; an open chrome-devtools MCP browser
  keeps the load gate tripping.
- Fix: **hook** H4/H5; **issue**.

### 13. Status artefacts and routing
- 13 archived-after-merge sessions read `status_bucket=failed` (`[ede_diagnostic] result_type=user ... stop_reason=tool_use`): archive only
  after DONE. 01RzXgd4's in-session `SendMessage` READY at 00:28 never reached the orchestrator; 012oJBFo 09:13:16 "No agent named
  'claude-code-remote:session_013meHK...' is reachable" (use `send_message` with the bare `session_id`, not `to:`); the orchestrator's
  09:20:48 "Did my 09:14Z three.js scope addition reach you?" had no ack; P1 01MVmREu `disconnected` since 07:41 while its summary said
  "round 2 hunting". Hollow draft runs without `run-ci` (013HC75 23:08:41, #2403) and a circular Plan item "ready-gate exits 0" (01Em9nv).
- Fix: **skill** `agent-fleet` comms (message form, ACK for scope additions, treat `connection_status≠connected` as stalled); steward docs-only recipe.

## What worked
READY / NEW-PR / FINAL formats were followed by every lane; no session merged or armed itself; merge parents were verified where checked;
Sonnet owner and research turns cost cents; no quota parks; no relayed-grant refusals except one.

## Applied in this PR
`AGENTS.md` (rule 4 waiter, rule 12 Monitor + SWEEP-N/A); `tools/ci/wait-for.mjs --log-matches` + `tests/unit/wait-for.test.mjs`;
`.claude/skills/agent-fleet/references/role-pr-owner.md` (Monitor `--failures-only`) and `launch-policy.md` (cost, desk field, pre-launch
check, hunter caps, `.claude` grants, stand-down window).

## Ready-to-apply diffs (hooks; self-modification, not applied)

H1 — user-level `~/.claude/stop-hook-git-check.sh` (outside the repo; Bryce applies): treat the tracked memory dir and a held push as clean.
```diff
-git status --porcelain
+git status --porcelain -- . ':(exclude).claude/memory'
@@ before the "unpushed commits" check
+# a CI run is live on the pushed tip (AGENTS.md rule 4): the push is held on purpose
+[ -f "$ROOT/.claude/push-hold" ] && exit 0
```
H2 — `.claude/hooks/memory-sync.sh`: after `save`, mark the synced files so they stop dirtying the tree:
`git update-index --assume-unchanged .claude/memory/*.md 2>/dev/null || true` (and `--no-assume-unchanged` before `restore`).
H3 — new `.claude/hooks/ui-fixer-uncommitted.sh` (UserPromptSubmit/Stop, advisory): if branch matches `cursor/*` and `git diff --stat` is non-empty and
the newest of `git log -1 --format=%ct` and the last commit is > 3600 s old, print "commit WIP to the topic branch (rule 12)".
H4 — `bash-guard.sh`: refuse `... ; git push` / `&& git push` when the latest `artifacts/logs/tooling-fast*.log` for HEAD ends `= run failed`.
H5 — `bash-guard.sh` hook timeout in `.claude/settings.json`: raise the `git commit` guard 180 → 300 s when `/proc/loadavg` ≥ 3, or retry once on timeout.

## Not done / out of scope here
CI workflow changes (finding 10) and game code are issues only. No quarantine edits. Sessions read, never messaged.

## Agent-surface follow-up (Bryce, 2026-10-17 ~11:45Z)

Ten findings from the fleet run, landed as one-liners in skills and role templates (AGENTS.md untouched):
grants and next item named in the launch brief, cost cap / effort check, `get_session` before assigning (orchestrator.md);
HANDOFF template and 350 k / 300 k rotation (comms.md); `run-ci` and run id + ran-job ids in every READY, sync verify by diff
size (role-pr-owner.md, steward); one owner per red tip (steward §3, orchestrator.md); retired-rule grep (check-changes);
Pages-train batching (ci-watch, orchestrator.md); PRs with no live owner on the wake list (orchestrator.md).
