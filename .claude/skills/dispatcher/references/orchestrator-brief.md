# A worker brief written by an orchestrator session

Read when a session, not the dispatch Action, launches workers (`create_session`). The Action's own one-line address
and the saved worker prompt are `tools/ci/worker-prompt.md`; this is the longer brief a human-steered orchestrator
writes. Every line below rests on a measured cost in `docs/notes/ORCHESTRATION-REVIEW-2026-11-11.md` (rank in
brackets). A brief is task facts; the rules live in AGENTS.md and skill `steward`, so cite them, do not restate them:
restated rules drifted into three wordings and one contradicted the skill [14].

## Before launching

- Count first: open draft PRs and queued CI jobs (`node tools/ci/pr-board.mjs --json`, the Actions queue). Launch
  only what the runner pool can serve; 25 sessions in 29 minutes produced 45 open PRs and no merge for 111 minutes
  [12]. PRs whose diff selects browser specs wait hours for runners; tooling and docs PRs do not [3].
- One PR per worker, by default and for adoptions too: batches of 4-6 adopted PRs landed 3 of ~31 in 2 h 38 min
  while the one-PR worker landed in 11 min (#5847). One issue or one
  batch issue, one PR; a fix that touches a generated or digest source gets its own PR [5]. A combined unit only for
  PRs that conflict with each other, three at most, the queue fixed at launch [13].
- Adopt only a lapsed or handed-back lease, never a parked one (skill `steward` §Lane 3). `pr-board.mjs --brief`
  prints `lease …` and `churn: adopted Nx`; a churn PR (3+ adopters) gets one worker that stays until `land`.
- Re-verify on the deploy tip first; a worker closes an already-fixed issue with evidence and opens no PR.
- Settle every human step before launch (a device check, a `config-ok` the diff will need, a decision) and cite the
  comment URL, so the worker verifies it instead of waiting [10].
- `config-ok` on a ROUTINE config path and `ratchet-raise` you add yourself, after you have read the PR's config diff
  or its raise and the CEILING-HISTORY reason, with one comment per add naming them (D-034, D-041); never let the
  PR's own worker add either. A PROTECTED path (merge-gate `PROTECTED_CONFIG_PATH`: the gate's import closure,
  `land.yml`, every host's hooks and settings) needs Bryce's own tap (#5455); `ci.yml`, `pick-tests`, `preflip-probe`
  and the other `tools/ci/` files are routine. The gate cannot tell you from the worker: this half is a rule, not a check.
- A TAKEOVER brief states evidence, not a verdict: the lease line, the newest commit trailer and comment time on the
  PR, never "the owner cannot be reached" [11]. Post the adoption comment yourself before launching.

## The brief

```text
<ISSUE n | CONTINUE PR n> for orchestrator <session id>. AGENTS.md and skill `steward` bind; this
brief adds only task facts.

ASK (Bryce's words, with the time): "<quote>"
TASK: <the one unit; what a player or an agent would see when it is done>
EVIDENCE: <the measurement or repro, its command, the precedent PR to copy>
STATE: head <sha> at <time>; open PRs that touch the same paths (shared, not a blocker: D-033): <list>; decisions already made: <comment URLs>
PROFILE (phone UI only): newest `tests/data/settings-live-export-*.json`, dated <date>; quote it, do not trust a
  number in this brief over that file [16]
HUMAN STEPS ARRANGED: <e.g. "config-ok: send me the head sha once pushed"> | none
STOP AND TELL ME: <the condition, e.g. a ceiling or budget blocks you: send the numbers, change nothing>
STOP AT: start+<N>k (a context budget above the session's measured start; `context-cap.py` reads this form) [6]
MESSAGE ME ONLY WHEN: blocked, refused (facts only), a decision is needed, merged, or handing off [8]
```

## While workers run

- Each cycle, and on every child-session event, run the quota watchdog `tools/ci/child-health.mjs` (#5844; usage in
  its header): save `list_sessions {children:true}` and each failed child's `list_events kinds:["result"]` page, then
  act on every PARK / RELAUNCH row it prints (`needs-owner`, a `CONTINUE PR <n>` brief on another model or after the
  reset). Six PRs sat ownerless 7.8–9.1 h on 2026-11-18 because nothing read the children between waves.
- Messages reach a busy worker when its turn ends (median 0.3 min, p90 7.5, max 78). Send a hold or stop with
  priority "now", name its exceptions in the same message, and expect a push to cross it [12].
- Never push to, flip or label a live owner's PR, nor edit its body beyond ticking a Plan line: message the owner
  [11, 17]. What you may do unasked and report after: AGENTS.md §Coordination.
- A base red: one message naming the failing leg and the one fix PR; workers hold, the fixer lands, then one release
  message. After a shared cure lands, each PR syncs once [4, 5].
- What needs Bryce goes in ONE list, first line first, each entry a link and the exact `decision:` line or label
  [8, 10]. Worker status does not go to Bryce.
- Never tell a worker to cancel, re-run or dispatch a run [17]; your own CI acts follow skill `steward` §CI (logged).
- A refusal by a hook or the classifier is reported as facts and routed to Bryce with the session link; nobody, the
  orchestrator included, redoes the refused effect by another tool [10].
- A goal the session cannot finish alone (it waits on Bryce, CI or another session) is answered once with the list
  of blockers and the time of the next check; it is not a reason to keep the turn open [7].
