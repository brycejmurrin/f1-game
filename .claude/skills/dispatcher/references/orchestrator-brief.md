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
- One PR per worker, adoptions too: batches of 4-6 adopted PRs landed 3 of ~31 in 2 h 38 min, the one-PR worker in 11
  min (#5847). One issue or batch issue, one PR; a fix touching a generated or digest source gets its own PR [5]. A
  combined unit only for PRs that conflict with each other, three at most, fixed at launch [13].
- Group at launch: at most 3 small `ready` issues of one area or the same files become one `batch` issue
  (`## Members`, `## Merge order`; `dispatch.mjs` `batchMembers`), one worker, one PR, about 400 changed lines at most
  (Bryce's `decision: B1`, PR #6377); unrelated issues stay one PR each.
- Adopt only a lapsed or handed-back lease, never a parked one (skill `steward` §Lane 3). `pr-board.mjs --brief`
  prints `lease …` and `churn: adopted Nx`; a churn PR (3+ adopters) gets one worker that stays until `land`.
- Re-verify on the deploy tip first; a worker closes an already-fixed issue with evidence and opens no PR.
- Settle every human step before launch (device check, `config-ok`, decision) and cite its comment URL [10].
- `config-ok` on a ROUTINE config path and `ratchet-raise` you add yourself, after you have read the PR's config diff
  or its raise and the CEILING-HISTORY reason, with one comment per add naming them (D-034, D-042); never let the
  PR's own worker add either. A PROTECTED path (merge-gate `PROTECTED_CONFIG_PATH`: the gate's import closure,
  `land.yml`, every host's hooks and settings) needs Bryce's own tap (#5455); `ci.yml`, `pick-tests`, `preflip-probe`
  and the other `tools/ci/` files are routine. The gate cannot tell you from the worker: this half is a rule, not a check.
- Launch with `create_session` environment_id `env_01T3kL7W7688bnn8RpTx8GsY` (environment "I"), permission_mode
  `auto`; the orchestrator stays in auto too. A `plan` or `default` child stalls on an unanswered prompt (retro).
- One Claude Link window per wave: ONE hands-off bridge `drive` run (#6425) for every pending device check, one ask to
  Bryce (~35 of his 115 prompts on 2026-11-24 were link plumbing; memory `phone-checks-via-claude-link.md`).
- A TAKEOVER brief states evidence, not a verdict: the lease line, the newest commit trailer and comment time on the
  PR, never "the owner cannot be reached" [11]. Post the adoption comment yourself before launching.

## The brief

Generate it, do not hand-write it: `node tools/ci/brief.mjs render --spec <spec.json> --sessions <list_sessions.json>`
prints the template below from task facts (role, issue/PR, scope, owned and forbidden paths, STOP AT, the tip state,
env and permission mode), predicts the `config-ok` / `ratchet-raise` human steps from the owned paths, and refuses a
duplicate launch (an open PR closing the issue, or a live session tagged `apex:issue-<n>` / `apex:pr-<n>`; PR #6349
was launched twice). Pass the tag it prints to `create_session`. A hand-edited brief: `brief.mjs lint <file>` before
sending (missing STOP AT or tip state refuses). Spec fields and exits: the tool's header.

```text
<ISSUE n | CONTINUE PR n> for orchestrator <session id>. AGENTS.md and skill `steward` bind; this
brief adds only task facts.

ASK (Bryce's words, with the time): "<quote>"
TASK: <the one unit; what a player or an agent would see when it is done>
EVIDENCE: <the measurement or repro, its command, the precedent PR to copy; name JS symbols as apex-lsp calls, e.g. `lsp_callers Tracks.curvature`>
STATE: head <sha> at <time>; open PRs that touch the same paths (shared, not a blocker: D-033): <list>; decisions already made: <comment URLs>
PROFILE (phone UI only): newest `tests/data/settings-live-export-*.json`, dated <date>; quote it, do not trust a
  number in this brief over that file [16]
HUMAN STEPS ARRANGED: <e.g. "config-ok: send me the head sha once pushed"> | none
STOP AND TELL ME: <the condition, e.g. a ceiling or budget blocks you: send the numbers, change nothing>
STOP AT: start+<N>k (a context budget above the session's measured start; `context-cap.py` reads this form) [6]
MESSAGE ME ONLY WHEN: blocked, refused (facts only), a decision is needed, merged, or handing off [8]
SUBAGENTS: <the role's row in `.claude/agents/README.md` §Roles, e.g. "prior-art-scout, code-hunter per slice, finding-verifier">
```

## While workers run

- Each cycle, and on every child-session event, run the quota watchdog `tools/ci/child-health.mjs` (#5844; usage in
  its header): save `list_sessions {children:true}` and each failed child's `list_events kinds:["result"]` page, then
  act on every PARK / RELAUNCH row it prints (`needs-owner`, a `CONTINUE PR <n>` brief on another model or after the
  reset) and every WAITING row (a child in need_input: answer it, or park and relaunch its PR). Six PRs sat ownerless 7.8–9.1 h on 2026-11-18 because nothing read the children between waves.
- Big reads stay out of your context: session transcripts (`list_events`), `actions_list` and job logs go through a
  subagent, or to a file read with `jq`, never inline. At ~400k context, rotate: skill `handoff` (Orchestrator ending).
- Messages reach a busy worker when its turn ends (median 0.3 min, p90 7.5, max 78). Send a hold or stop with
  priority "now", name its exceptions in the same message, and expect a push to cross it [12].
- Push rules for every worker (D-046): one push per fix round, never while CI runs on that head; flip draft→ready only
  after the draft CI run has finished. A flip or push that cancels a live run is the orchestrator's to name in the PR.
- Never push to, flip or label a live owner's PR, nor edit its body beyond ticking a Plan line: message the owner
  [11, 17]. What you may do unasked and report after: AGENTS.md §Coordination.
- **Tip-red bulletin.** On a red deploy tip, name the failing job and test (agent `ci-red-triage`) and the one fixing
  PR (the `deploy:red` claim, skill `steward` [`references/labels.md`](../../steward/references/labels.md)); launch a
  fixer only if none exists. Then post ONE comment on the Board issue (#1780) starting `tip-red:` (red sha, failing
  test, fixing PR) and send it to every live worker session; when the fix lands, one `tip-green:` comment and message.
  Five workers each archived the same aged note while #6406 fixed it (2026-11-25). After a shared cure lands, each PR syncs once [4, 5].
- What needs Bryce goes in ONE list, first line first, each entry a link and the exact `decision:` line or label
  [8, 10]. Worker status does not go to Bryce.
- Never tell a worker to cancel, re-run or dispatch a run [17]; your own CI acts follow skill `steward` §CI (logged).
- A refusal by a hook or the classifier is reported as facts and routed to Bryce with the session link; nobody, the
  orchestrator included, redoes the refused effect by another tool [10].
- A goal the session cannot finish alone (it waits on Bryce, CI or another session) is answered once with the list
  of blockers and the time of the next check; it is not a reason to keep the turn open [7].

## Standing routines

Bryce, 2026-11-25 (memory `orchestrator-routines.md`): two `create_trigger` tasks bound to your own session, initiation
`human_request`; a successor re-creates both and disables the old ones (`update_trigger enabled:false`), never deletes.
- **FULL `19 * * * *`:** notifications to 0; deploy tip (red: the bulletin above, one `DEPLOY-RED` fixer, pause pushes);
  ONE subagent surveys open PRs (CI, gate, conflicts, `owner:`) and live sessions into `scratch/`; act reversibly and
  log it (a `CONTINUE PR` per ownerless red or conflict, nudge idle owners, archive the finished, `rerun_failed_jobs`
  only for infra or a designed cancel, diff read before `config-ok`, protected and `needs-decision` items to Bryce by
  AskUserQuestion); queue health per #6463; one Claude Link window per wave; the task list; rotate at ~400k.
- **LIGHT `49 * * * *`, no subagent:** notifications, deploy tip, open PRs (`ci-watch` on ready+land or new reports);
  red or conflict → the owner, else one `CONTINUE PR`; green draft 30+ min, idle owner → nudge to land; fixable gate
  row or voided `config-ok` → the owner (Bryce-only: AskUserQuestion); a merge → one line, archive the worker.
