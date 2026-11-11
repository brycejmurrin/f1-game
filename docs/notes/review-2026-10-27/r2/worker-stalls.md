# Worker stalls: why dispatcher children wait on "the user" (2026-10-27, read-only transcript review)

Source: list_events/get_session on the dispatcher (session_017YzwxyrKepo8YMEBFznBXv) and its children; brief text from
origin/cursor/dispatch-page-cutoff-4e2a (tools/ci/dispatch.mjs `commonLines`/`issuePrompt`, dispatch.json, docs/WORKERS.md,
.claude/hooks/context-cap.py). No worker called AskUserQuestion; none hit a hook or permission stop that ended the turn.

| session | issue | how the last worker-driven turn ended (quoted) | stall type | root cause |
|---|---|---|---|---|
| …XR8 | #2906 / PR #3924 | "The context cap was reached after the commit, so I stopped… The next step is to wait for `Structural guards`…" (09:45; BLOCKED, needs_action "resume session") | A cap-stop + C no wake | context-cap advisory at ~151k vs STOP AT 150k; set `needs-owner`, never called subscribe_pr_activity, so no CI event could wake it. 5 `git commit` permission denials earlier (chained commit cmds), not the stop. Revived 09:52 only by the orchestrator's send_message |
| …6QU | #3267 / PR #3926 | "**Decision for you:** should saved entries that leave a piece fully off-screen be clamped? I recommend not" (09:48, ~157k) | A cap-stop + B asks user | asked the user in chat AND set `needs-decision`+`needs-owner`; Bryce had to type "Ask the orchestrator or make the best deifsion" (09:48:56); it then chose its own pick in one turn |
| …Uc1 | #3254 / PR #3919 | "#3252 (the long Appearance scroll) was deferred and still needs your decision." (09:24) | B asks user | no `needs-decision` label (labels stayed ready/claimed/area:ui); Bryce typed "Check", then "Message your parent session to coordinate what to do"; worker then send_message'd the parent and said "I'm at my 150k context cap, so I'm stopping here until the parent replies" |
| …ZkU | #3263 | "I made no code change and opened no PR. I left the issue open so you can close it." | D no-op handed to user | brief has no "already fixed" exit; issue left open with `ready` (dispatcher removed it by hand later) |
| …JFyJ | #3265 | "I commented on #3265… left it open for you to close… Please restore any other labels you want, or close the issue." | D + E label wipe | same no-op gap; issue_write replaced the label list; Bryce typed "Check" then "Can you be archived" → self-archive mid-turn = FAILED bucket |
| …zwQo | #3156 / PR #3920 | "I stopped at my token budget and left a ranked gap list in a draft PR (#3920)… labelled `needs-owner` so a takeover worker can pick up" (118k) | A cap-stop | stopped below the cap; `needs-owner` from a worker triggers nothing — dispatcher waits 2 h of PR silence; Bryce had to say "3156 yes" for a relaunch |
| …WRM | #3264 / PR #3918 | 09:05: "The PR subscription will wake this session when CI finishes" → silent 31 min until Bryce typed "Chdck" (09:36), CI had passed | C missed wake | subscribed correctly, but the CI-complete event never woke it (only a mid-run check_suite event at 09:05) |
| …kDU2 | #2994 / PR #3923 | "PR #3923 is ready with `land` on it… any CI red or review comment will wake this session." | none (correct end) | REVIEW_READY just means idle-with-PR; one refused update_pull_request, retried OK |
| dispatcher | — | cycles are Bryce-typed ("Run dispatch", "apply", "3156 yes"); answers a child only when the child messages it (09:41 task-notification) | F no supervision | cycle reads get_session only to count live/archive; never list_events, never send_message to an idle/BLOCKED child |

Older sessions (list_sessions pages 1–3, fleet era): ~20 ended with a needs_action addressed to Bryce, e.g. "say \"commit\" to
commit, push…", "reply 1 (…), 2 (…), or 3 (stop)", "Pick a Round 4 scope…", and one BLOCKED on "Approve or deny
AskUserQuestion" (session_01PfAQjrkJvDyTMsca9X2aFo, still REQUIRES_ACTION). Same pattern, pre-dispatcher.

## Stall types ranked (8 current children)
1. **A — context-cap stop** (4: #2906, #3267, #3254, #3156). STOP AT 150k, but the FIRST request is already ~93k tokens
   (first_request_input_tokens 93,310–93,469), leaving ~57k of work. The hook says "finish the current unit, push, hand off".
2. **B/D — ends by addressing "you"** (4: #3267, #3254, #3263, #3265): a decision or a no-op result phrased to the user.
3. **C — no wake after ending** (2: #2906 never subscribed; #3264 subscribed but the completion event did not arrive).
4. **F — dispatcher never pings children** (all): idle/BLOCKED children are invisible until 2 h PR staleness. Bryce
   un-stuck 5 of 8 by typing into the child ("Check", "Chdck", "Message your parent…", "Ask the orchestrator…", "Can you be archived").
5. **E — issue_write replaces labels** (#3265 and siblings lost `bug`/`area:ui`).

## Brief/doc lines that cause or allow each
- A: dispatch.json `"workerStopAtK": 150`; brief `STOP AT: 150k`; `Cost cap… At the cap, or stuck: leave the Plan and the
  handoff block current, add needs-owner on the PR, end.`; context-cap.py "Over the soft cap: finish the current unit, push, hand off".
- A→F: dispatch.mjs rule (2) re-owns only when `idleH >= staleHours` (2 h); a worker-set `needs-owner` is not a trigger.
- B: WORKERS.md §7 "A question only Bryce can answer is `needs-decision` plus one comment… There is no AskUserQuestion in a worker."
  It never says "do not address the user in the final message" or "pick and proceed"; the brief does not repeat §7 at all.
  worker.md "blocked or question: a decision only the parent or user can make" (a subagent rule, but read by workers).
- C: WORKERS.md §4 "Subscribe to the PR… only while CI runs on your own head. No timers."; AGENTS.md rule 13 "a lane that has
  nothing to do ends its turn, and the dispatcher re-owns a PR that falls silent". No fallback if the wake never comes.
- D: brief `End at land…` is the only exit; no branch for "already fixed / no PR needed".
- F: WORKERS.md §Per vendor "no send_later, no bus, no orchestrator to report to"; dispatcher cycle (dispatch.mjs header
  steps 1–5) has no step that reads a child's last turn or messages it; archiveGuard keeps BLOCKED forever.
- E: brief says "add `claimed`" with no tool; issue_write `labels` replaces the set.

## Fixes
1. Raise `workerStopAtK` to ~300 (or make the cap count tokens above the first request: soft = first_request + 150k).
2. Brief line: "Nobody reads this chat. Never end a turn with a question or 'for you'. Decide (record the pick in the PR),
   or `needs-decision` + comment and keep going; to coordinate, send_message to session_id `@parent`."
3. Brief line: "Before ending a turn with CI running on your head: subscribe_pr_activity on it. At the cap: push, then
   send_message `@parent` 'cap: PR #n, next: …' and end" (instead of a silent needs-owner).
4. Brief line: "Already fixed: comment the evidence, close the issue as completed (state_reason completed), end."
5. Brief line: "Add labels with `gh api -X POST …/issues/<n>/labels -f 'labels[]=<l>'`, never issue_write labels."
6. Dispatcher cycle step: for each child whose bucket is BLOCKED/REVIEW_READY/idle with an open PR not labelled `land`
   (or a PR with `needs-owner` set by its own owner), read its last result via list_events and send_message a continue
   ("subscribe, finish to land, or decide"); for a child that finished with a no-op, close the issue and archive.
7. dispatch.mjs rule 2: treat a fresh `needs-owner` added by the PR's own worker as stale now (launch the takeover at once).
8. Dispatcher ignores `needs_action`/BLOCKED children today: add them to the Board ("children waiting") so Bryce sees them.
