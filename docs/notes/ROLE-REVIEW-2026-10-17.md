# Role and subagent review, 2026-10-17

Grant (Bryce, typed in the orchestrator session `session_0194ATfoAWFex31kfebbgFH8`, relayed in this lane's launch prompt):
"Use session to review transcripts and how these roles have worked and if we should change the templates and subagents".
Read-only review; this note changes no template, skill, agent or hook. Overlap rule: PR #2727 (retro) already edits
orchestrator/comms/role-pr-owner/steward/ci-watch/check-changes for rotation (350k/300k), duplicate fixes, hollow green,
sync cost, effort, dead owners. Those items are cited, not repeated.

## Method and limits
Sessions read with `list_events` (`kinds: user,assistant,result`, newest page of 100, one older page for the orchestrator)
and `get_session` for cost and context. Newest pages cover only ~4–12 minutes each (11:46–12:06Z), so this is a snapshot
of the late night, not the whole history. **CONFIRMED** = I read the cited event (`session_id` / event uuid). **PLAUSIBLE** = inferred.
Dollar and minute figures are the sessions' own `usage.cost_usd` or my estimates (marked `est.`).

Sample: owners `session_014JRFBdoQbkyLMRVJwWKhEU` (#2685/#2716), `session_013cfQWJez7Hn2Bk7Q3hZ3e1` (#2725/#2699/#2711),
`session_014m73tfEqiAuduuk9aDkj8w` (#2726); implementers `session_01ErVSUbPa3cJtA9SWWtzxsc` (kinks A),
`session_01555beWX831K4k2HGgNTKrX` (tools lane), `session_017K4x5yyiAmYPNzvKZd9TH9` (icon picker); orchestrator
`session_01At8xamFzpa95Ut6iGvQ98L` (archived, status `failed` with `stop_reason=tool_use` after the handoff).

## Size per role (get_session, 12:06Z)
| role | session | context | cost | note |
|---|---|---|---|---|
| orchestrator | 01At8xam… | 648k tokens | $18.84, 134M cache-read | every wake re-read ~630k (assistant `33a00c24-47dd-4689-b9bb-4efc93b2ee4e`, cache_read 629173) |
| owner, 3 PRs | 013cfQWJ… | 447k | $10.31, 78M cache-read | effort low; 2 h 15 min old |
| owner, 2 PRs | 014JRFBd… | 180k | $1.32 | respawn, 31 min old |
| owner, 1 PR | 014m73tf… | 221k | $3.07 | 26 local commits unpushed |
| implementers | kinks A / icon picker | 170k / 147k | $1.64 / $0.91 | cheap; stopped at PR + CI watch |
| tools lane | 01555beW… | record shows 0 | not reported | cost invisible to the orchestrator's roster (its roster line also showed "0 k $ 0") |
An owner or orchestrator costs ~linearly with context per wake; the implementers are not the cost problem, the two long-lived roles are.

## Findings (ranked by saved minutes / dollars)

### 1. Fleet-wide asks cost ~21 wakes each, three times in four minutes (CONFIRMED, est. $5–10)
FLEET SYNC (11:58:56Z, user `239a1b70-5a0e-4450-bec5-9332b199f3a9` in 014m73tf), a garbled FLEET BROADCAST, its correction "IGNORE my previous… CORRECT version" (user `047d2f15-6b2a-4f67-a762-f92c0d13c9fb`
in 014JRFBd), then ROLL CALL at 12:01:57 (user `cba03e2a-926b-4379-8d3e-ad4a84848314`, "Disregard my earlier FLEET BROADCAST messages").
The owner declined two as garbled/relayed (assistant `1c9cffdf-885a-43db-b241-be03904d0e4f`, `78d72ae5-860a-443c-993d-39662e74f3a5`)
and answered the third (`5c41fd7d-cfc1-422f-aa19-b6138ac45e08`). Every recipient woke at 150–450k context. `get_session` already
returns `post_turn_summary`, `context_usage` and `usage`; the orchestrator itself used it that way (`33a00c24…` roster).
Edit `references/orchestrator.md` (Hard lines, after item 10): add
```
11. Fleet-wide asks: read `get_session` (post_turn_summary, context_usage, usage) for every roster id first; message
    only sessions whose summary is stale > 15 min. Copy ids from `list_sessions`, never retype them. One message per
    ask; a correction replaces it ("RETRACT <ask>"), never a second broadcast. Peer fan-out ("send to every session
    below") is forbidden: replies go to the orchestrator only.
```

### 2. `ready-full-cap.mjs` contradicts the policy it enforces (CONFIRMED, ~5 min and one timer per owner)
AGENTS.md says "No desk cap on ready full-tier runs (retired 2026-10-16)"; `tools/ci/ready-full-cap.mjs:35` still has `MAX_LIVE = 3`.
013cfQWJ held #2711 on "REFUSE mark-ready — 3/3" (result `0bbe4864-06e6-4ffc-bb44-9cefbfccd2e3`, "a timer will re-check at 12:15Z"),
then marked it ready only when the orchestrator said "the cap is 8" (assistant `e19d1189-d785-4de7-85eb-527ce4c8e621`, 12:05:20).
PR #2724 (raise MAX_LIVE) is the tools-lane fix; #2727 notes it open. Until it lands, `references/role-pr-owner.md`, "On every wake" step 4:
```
-   mark ready only when it exits 0 AND `ci-watch` shows `= ci passed` …
+   mark ready only when it exits 0 AND `ci-watch` shows `= ci passed` …
+   `ready-full-cap` is advisory (AGENTS.md: no desk cap): on REFUSE, send ONE line `CAP? <PR>` to the orchestrator and
+   mark ready on its "go"; never arm a timer for a cap refusal.
```

### 3. Tracked `.claude/memory/` is dirtied by the sync hook in every checkout (CONFIRMED)
`git checkout` aborted with "Your local changes to .claude/memory/MEMORY.md would be overwritten" (user `3a561b17-1b4f-47d4-83aa-f0153bc22509`, 013cfQWJ),
solved by an ad-hoc stash (assistant `d38077cc-b1be-4146-a897-aa4639687045`). The same two files are re-explained as "not mine" in four
separate wakes (`b58fd269-7b86-4c8a-82ea-ab2296a0579d`, `cbdfe540-8989-443f-bea4-2f6adb566a52`, others in the same page). `.gitignore:10-11`
un-ignores `.claude/memory/`, so the hook output is a tracked-file diff in every session. Cheapest role-card fix, `role-pr-owner.md` §Traps:
```
- `.claude/memory/*` shows as modified/untracked after the memory-sync hook runs. It is not yours and not in any PR.
  Before a checkout: `git stash push -q -- .claude/memory`; never commit it, never mention it in a REPORT.
```
Structural fix (tools lane, not a template): have `memory-sync.sh save` run only at SessionEnd, or `git update-index --skip-worktree` the two paths.

### 4. `tooling-fast --changed` silently runs the full floor (CONFIRMED, ~12 min per occurrence)
Tools lane: "662-file run fell back to full floor; ~12 min" (orchestrator reply `33a00c24…`), and again `--changed reason=tracked changed=0 files=664` at
loadavg 4.52 with 1 failure inherited from the tip (user `7bdead21-419c-44a8-93c7-2bb2cad4baf3`). The rule says load < 3 before a long run.
Cause in the transcript: the branch was already committed, so the working-tree diff was empty. `references/worker.md` and role-pr-owner "Keep the box free":
```
- `tooling-fast --changed` diffs the WORKING TREE: right after a commit it sees 0 files and runs all 664. Use
  `node tools/ci/tooling-fast.mjs --changed --base origin/claude/f1-game-project-26h3ng --jobs=3` after committing.
```
(PLAUSIBLE: the flag name; verify against `tooling-fast.mjs --help` before editing.)

### 5. Holding 26 commits through a long browser run (CONFIRMED, risk not minutes)
014m73tf ran `tlx-probes` via `npm test --retries=0` (not `test-bg.mjs`; stop-guard said "not started by test-bg", user `622e2e6e-7f34-4a54-ba2b-184a24b958a1`)
with 26 unpushed commits, "as the grant says to push once after this run" (assistant `84737910-e4c4-478c-98ce-b0c4688277ef`); the stop hook nagged four times in 6 minutes.
AGENTS.md rule 12 says push at every verified checkpoint and before any wait over ~10 min. A reclaimed container loses all 26.
Launch template PUSH line (`orchestrator.md` Hard line 6), append:
```
   Push BEFORE starting any browser run or wait over ~10 min; a "push once at the end" in a grant means once per green
   cycle, not once per session.
```

### 6. Echo wakes answered with a full turn (CONFIRMED, small but constant)
013cfQWJ answers its own subscription confirmation and its own ready action each in a turn (`5d969214-b0bd-40ae-b75d-b01b9676235a`, `9921d4fe-a2da-4633-b39c-a7793b22dd99`); the
tools lane and the owners also call `ReadNotifications` ×3–5 per quiet minute (digest of 013cfQWJ and 014JRFBd pages). Add to `role-pr-owner.md` "On every wake":
```
0. A wake that only echoes your own action (subscription confirmed, ready marked, your own comment): end the turn with no
   tool call and no prose. Do not call ReadNotifications unless a notice says one is pending.
```

### 7. Respawned owners resend READY after a rotation (CONFIRMED, ~1 message per owner per rotation)
`READY 2716 8145c469 (relayed from my earlier message to the old orchestrator)` (assistant `fcdb24e3-02c1-4e20-8e35-96282c969943`) and a second ACK on the merge
(`8ae3e7c0-76b3-4362-8562-4dbc10713098`). Cause: the HANDOFF carried the roster but not each owner's last REPORT/READY. #2727 edits the HANDOFF body for rotation;
add one field there: `last-lines: <PR> <sha7> <READY|REPORT|DONE> <UTC>` per owner, so the new orchestrator never asks for a resend.

### 8. Relayed grants: refusals are correct and cost one turn; make them cheaper (CONFIRMED)
014JRFBd refused a relayed ask to close #2717 ("a relayed ask isn't a grant", `8ae3e7c0…`) and warned that its `.claude/**` push "may be refused unless Bryce types approval"
(`fed4fa71-238d-411b-b704-4509814d83df`). Launch prompts for a PR that touches `.claude/**` should say so up front: launch-policy already requires Bryce's quoted
grant in the lane's own prompt (`launch-policy.md` "A lane that edits `.claude/**`"); whether the #2685 respawn prompt carried one is NOT CONFIRMED (I did not read its first events).
Wording for the owner launch (`role-pr-owner.md` Launch, `USER GRANTS:`): `"USER GRANTS: <quote, UTC>; .claude/** edits: <quote> | NONE — push is expected to need a typed Approved: from Bryce in this session"`.

### 9. Smaller measured friction (CONFIRMED, one call each)
- `mcp__github__get_job_logs` with `failed_only` and no `run_id` errors (user `f7a6bba5-102c-4c7f-a1a3-34bca233dfe4`, kinks A): add "pass `run_id` with `failed_only`" to the `ci-red-triage` tool notes.
- `pkill -f "http.server 3456"` denied by `bash-guard.sh` (user `6975d43f-03ca-405a-9706-50ace012fe58`, icon picker): the hook text is right; the worker card should say "serve with `npx serve` in the background and stop it with the printed PID".
- `sync-pr.mjs` refused clean-behind, then kinks A re-ran it with `--force-clean-behind` (assistant `e5215e2e-8cb7-40f0-b8f5-7f3f5dda9e1e`); I did not read why (PLAUSIBLE: to clear the inherited `track-shot-survey` red). AGENTS.md says sync only when CONFLICTING or a required tip check is red, so the card should say who may use the flag.
- Hollow green is real: replay of run `39026875787` (PR #2702 head `9e0886b3`) showed a draft fast-tier `CI` success with `smoke: skipped` (user `54faf09c-3a42-490a-a67a-5de39939a8de`); the fix is deploy commit `8d3a3b0a` (#2664). Owners should still read `ci-watch --once` at the head sha; already in #2727.

### 10. Subagents (usage CONFIRMED only for the orchestrator's last turn)
Orchestrator turn result `2e19ed65-46f6-45a2-b198-f28c4786534b`: 6 background subagents, `general-purpose` ×3, `deploy-research` ×2, `ci-red-triage` ×1, 0 failed.
The owner and implementer pages show 0 subagent rows (their digests: "0 subagent rows"), so `verify-agent`, `ci-watcher`, `worker`, `finding-verifier`, `merge-desk`, `prior-art-scout`, `code-hunter`
were not seen in this sample; absence in a 100-event window is not proof of non-use. `general-purpose` ×3 is the one mismatch to check (PLAUSIBLE: the PR-board reads belong to `ci-watcher`, scoped changes to `worker`); I did not read those subagents' prompts.
Recommendation: do not change `.claude/agents/*` on this evidence. Add `by_type` from the `result.subagent_stats` field to `tools/ci/session-transcript.mjs --summary` so the next retro can count agent types across the whole night instead of one page.

## Ranking (saved time or money, descending, est.)
1. Fleet-wide asks protocol (finding 1): $5–10 per incident, plus 4 minutes of every owner.
2. `--changed` base after commit (finding 4): ~12 min each, recurring per lane.
3. Orchestrator rotation enforcement (covered by #2727; evidence: 648k context, $18.84, `01At8xam…`).
4. Cap advisory (finding 2): ~5 min and a timer per owner until #2724 lands.
5. memory-sync stash trap (finding 3): ~1 turn per wake per session; structural fix removes it.
6. Push before long runs (finding 5): protects 26 commits; no minutes saved unless a container is reclaimed.
7. Handoff `last-lines` (finding 7): ~1 message per owner per rotation.
8. Echo wakes (finding 6): ~$0.1–0.2 per echo at 450k context.
9. `.claude/**` grant line in owner launch (finding 8).
10. Agent-type counting in the transcript digest (finding 10).
