# R2 Opus hunt: land.yml, merge/ready/launch gates, dispatch, archive, hooks (at deploy tip)
F1 MED land.yml:51 — plain pull_request: a same-repo PR editing land.yml runs its own post/arm (statuses:write, contents:write, LAND_TOKEN) → can post gate=success or merge. Also any workflow with statuses:write can post `gate`. Fix: pull_request_target (no checkout) or a merge-gate row refusing PRs touching land.yml/merge-gate.mjs; pin gate to the Actions integration. CODE-TRACED (= R1 WP-L1)
F2 MED land.yml:239 — verdict/<n>.json written in the job that ran PR gen:check/ratchet code; a detached process can rewrite it before upload; post doesn't recheck content. PLAUSIBLE (= WP-L2)
F3 MED shellparse.py:1650 + github-mcp-guard.sh — ready receipt_check gets no head → green receipt for head A authorises ready flip after unverified head B within 10 min. CODE-TRACED
F4 MED launch-gate.py:42 — receipt's lane/pr/page sha never compared to tool_input, never consumed: one receipt admits any number of create_session for 120 s. CODE-TRACED (= WP-L3c)
F5 MED dispatch.mjs:186 — landProblem reads check-runs only; `gate` is now a commit status → a land PR the gate refuses parks forever (no needs-owner). Fetch commits/<sha>/status. CODE-TRACED
F6 low dispatch.mjs:282 — stale-PR rule ignores a live role:worker session naming the PR → duplicate CONTINUE worker. CODE-TRACED
F7 low dispatch.mjs:391 — --apply without --sessions = {sessions:[],complete:true} bypasses maxLiveWorkers. CODE-TRACED
F8 low archive-sessions.mjs:150 — checks only session_status RUNNING (not status_bucket BLOCKED/WORKING); prsOf treats issue #n in titles as PR. Reuse dispatch archiveGuard. CODE-TRACED
F9 low land.yml:301 — write_gate compares created_at (whole s) to AT (ns) as strings; same-second stale status wins → gate stays pending. CODE-TRACED
F10 low ready-gate.mjs:68 — shard fallback needs only A+B of four. CODE-TRACED
F11 low perf land.yml:154 — 4-PR train slice held by perpetually-refused old PRs. PLAUSIBLE
fixed-at-head: merge receipt bypass (gate-receipt.mjs:105 throws for merge).
