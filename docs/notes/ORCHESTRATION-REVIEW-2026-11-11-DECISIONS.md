# Orchestration review 2026-11-11 — decisions recorded and issues filed

Kind: decision · Re-measure-by: 2026-12-11

Split out of [ORCHESTRATION-REVIEW-2026-11-11.md](ORCHESTRATION-REVIEW-2026-11-11.md) on 2026-11-11, unchanged, because
that note crossed the 40 KB note cap when it merged (#5424). Section references below (§Proposed patches, §Ranked
findings, P1–P9, ranks) point at that note.

## Decisions recorded

Relayed by orchestrator A (messages of 2026-11-11 05:16Z and 05:20Z): Bryce answered all seven through its question
prompt between about 05:00Z and 05:25Z (Nov 10, 9:00–9:25 PM PT). These are a record of intent, not a `decision:` comment on GitHub: nothing here
grants a change, and each patch below still needs its own PR and his `config-ok` click on that PR. This review did
not read the answers at the source.

| decision | his answer, as relayed | patches it unlocks | where the work goes |
|---|---|---|---|
| 1. Red deploy tip | "Gate holds merges, one fixer" | P4 (the `base` row in `merge-gate.mjs`, `tip-red` in `needs-sync.mjs`, the train running the specs of every merge since the last green train). The "one fixer" half is orchestrator behaviour, already in the brief template. | A new issue for the `base` row; #5407 (two green PRs crossing on a stale merge ref) is its sibling and should land with it, since a held gate does not stop a crossing. #5420 if the Dispatch workflow is to launch the fixer later. |
| 2. Ready flip | "Ready flip reuses the draft verdict" | P3 (`ci.yml`, first half: reuse the same-sha draft verdict and run only the full-only jobs). The draft leg cap, P3's second half, was option (b) and is not unlocked. | A new issue; #5403 (the full-tier verdict does not require `selected-verdict`) touches the same job and should be read first, so that a reused verdict is one the full tier actually requires. |
| 3. Generated files | "Build them, stop committing" | No numbered patch: move the generated `test:*` lists in `package.json`, `docs/agent-output/catalog.json`, `tools/shot/scenery-locations.json` and `tests/data/impact-map.json` to `BUILT_PATHS` in `tools/lib/generated-paths.mjs` (a config path), one file per PR, the way #5349 and #5389 did. It also removes most of what P1 exists to tolerate, but P1 is still needed for real `tools/ci/**` changes arriving through a sync. | A new issue per file, `scenery-locations.json` first (step 1 landed as #5255; it is D1 of the 2026-11-09 review). `package.json` is the hardest: the script lines are read by `npm run`, so the build step must run before any `npm run test:*`. |
| 4. Session start | "Leaner environment + budget above start" | P9 (`tools/ci/worker-prompt.md`: the cap as a budget above the measured start) and the `STOP AT` line of the brief template, which already says so. The leaner environment is not a repo patch: it is the worker's cloud environment and connector list, which Bryce configures. | #5212 (orchestration redesign; "strip worker connectors" is its D2). A worker environment needs a setup that still has the GitHub and apex tools and drops the web-search, Drive, docs, three.js and BrowserStack connectors, which is about 90k of the 102k start. |
| 5. Check-ins | "Event-driven, one fallback": no self check-ins while the PR subscription works; one check-in of at most 50 minutes when it was refused; the session ends when it adds `land` | P8, first half (AGENTS.md rule 13 says which reading holds) and the matching line in `tools/ci/worker-prompt.md`. The steward wording in this PR already matches. | Issue draft I5 below. AGENTS.md is Bryce's to change. |
| 6. Class grants | "Yes, one daily class grant": one `decision:` comment of his on the Board may cover a named class for that day; the gate checks the comment is his and that the diff stays inside the class | New gate work in `tools/ci/merge-gate.mjs` and `tools/ci/lib/provenance.mjs` (config paths), and P7 so that a cancelled or base-red run is a sync reason with no grant at all. | Issue draft I6 below. |
| 7. Orchestrator autonomy | "Reversible acts, reported after": tick a Plan line, re-request a gate, close a duplicate, archive a finished session, message workers. Never: merge, cancel a run, recommend cancelling one, or touch his labels | No gate patch. P5 guards the label half (an MCP label write must not drop his label). The rest is wording: AGENTS.md §Coordination and the brief template in this PR. | Issue draft I7 below. |
| Transcripts | "Discard, keep the findings" | Nothing: the raw transcripts are not pushed, published or copied; they go when this session's container does. The findings, quotes and session ids stay in this note. | — |

### Decided on Bryce's delegation

Bryce to this review session, 2026-11-11 ~05:22Z (Nov 10, 9:22 PM PT): "Consider all decisions and make them for
me". The decisions below are this session's, made on that delegation. A delegation in chat is not a `config-ok`:
every PR that touches a config path still needs his own click on that PR.

- **The seven decisions** stand as option (a) each, which is also what the orchestrator relayed as his answers.
- **Order of work**, by clicks and CI rounds saved: #5432 (P1 and P2: a sync must not void `config-ok`; a click
  re-runs the gate), #5427 (build the generated files), #5425 (gate holds on a red tip; with #5407), #5426 (ready
  flip reuses the draft verdict), #5431 (orchestrator autonomy wording and the label guard), #5428 (cap as a
  budget, start + 250k), #5429 (rule 13 wording), #5430 (class grants).
- **`package.json`** is not gitignored: its generated `test:*` lines are replaced by one wrapper that reads
  `tests/groups.json` at run time, so a new test no longer edits it (#5427).
- **`sync-only` is made permanent by P1** (#5432), with no grant; class grants (#5430) start with
  `generated-only` and `force-clean-behind`.
- **Draft leg cap** (decision 2, option b) is not taken: it trades coverage for speed, and the reuse alone removes
  the duplicate work.
- **AGENTS.md wording** for rule 13 and for orchestrator autonomy is decided as written in #5429 and #5431; the
  edits ship in their own PRs, inside the existing byte and rule-line budgets.
- **Rank 15 against #5404** (does a re-run-to-green land or not): whoever takes #5416 settles it first, by test.
- **The raw transcripts** are discarded with this session's container.
- **This PR lands**: it is prose, its checks are green, and the skill wording should reach the next wave of
  workers. A `hold` label from Bryce stops it.

### Issues filed

Filed by this session on that delegation, unlabelled (the orchestrator schedules them): I1 #5425, I2 #5426,
I3 #5427, I4 #5428, I5 #5429, I6 #5430, I7 #5431, I8 #5432. The drafts below are their bodies. Each is
written for a worker starting cold. Every one touches a config path, so each PR needs Bryce's `config-ok`. Existing
issues that already carry part of the work: #5407 (crossings), #5403 (full-tier verdict), #5416 (the `now:` Plan
item and the re-run row: P6), #5401 (preflip cap), #5402 (worker-prompt report line: P9, second half), #5212
(worker environment), #5420 (Dispatch readiness).

- **I1 (decision 1, P4). gate: hold merges while the deploy tip is red on code.** In `tools/ci/merge-gate.mjs` add
  a row `base`: read the newest COMPLETED `pages.yml` run on the deploy branch; `pending` when a job other than the
  publish/deploy step failed; `ok` otherwise, and `ok` for a PR labelled `deploy:red` or `priority`. Reuse
  `dispatch.mjs`'s test for a platform failure. Add `tip-red` to `tools/ci/needs-sync.mjs` and make `sync-pr`
  refuse on it. Tests: a fixture run failed in a spec leg holds; one failed only in publish does not (run
  42880431465 is the real case); a `deploy:red` PR passes. Second PR: the train selects the union of the specs of
  every merge since the last green train (the 13:33Z train on 2026-11-10 carried #5346 and did not run its spec).
- **I2 (decision 2, P3 first half). ci: the ready flip reuses the same-sha draft verdict.** In
  `.github/workflows/ci.yml`, on `ready_for_review`, look for a successful draft-tier run on the same `head_sha`;
  when there is one, skip the selected-spec legs it ran and run only the full-only jobs (node suites, smoke,
  staged boot, sweeps, renderer). Pattern: `tools/ci/pages-reuse-verdict.sh`. Read #5403 first. Tests: a flip with
  a green draft on the same sha starts no selected leg; a flip after a new push runs everything. Measure: 108 of
  117 flips in the review window qualified.
- **I3 (decision 3). build, do not commit: the four generated files that still conflict.** One PR per file, in
  this order: `tools/shot/scenery-locations.json` (step 1 was #5255), `tests/data/impact-map.json`,
  `docs/agent-output/catalog.json`, the generated `test:*` lists in `package.json`. For each: add it to
  `BUILT_PATHS` in `tools/lib/generated-paths.mjs`, gitignore it, make `tools/gen/ensure-built.mjs` build it,
  remove it from git, and prove with `git merge-tree` that two PRs which each regenerate it no longer conflict
  (#5349 and #5389 are the precedents). `package.json` last: `npm run test:*` reads those lines, so decide between
  a wrapper script that reads `tests/groups.json` at run time and a build step, and state which in the PR.
- **I4 (decision 4, P9 first half). worker prompt: the cap is a budget above the start.** In
  `tools/ci/worker-prompt.md` and `.claude/hooks/context-cap.py`, accept `STOP AT: start+<N>k` (or measure the
  first request and add the budget). The environment half goes on #5212: a worker environment without the
  web-search, Drive, docs, three.js and BrowserStack connectors.
- **I5 (decision 5, P8 first half). AGENTS.md rule 13 says one thing about check-ins.** Wording for Bryce to
  approve: "no timed check-ins while `subscribe_pr_activity` works; when it was refused, one check-in of at most 50
  minutes, re-armed only after a state change; a session ends when it adds `land`". Mirror it in
  `tools/ci/worker-prompt.md` and `steward/references/host-watch.md` (the latter is already close). 52 sessions
  armed timers and 9 refused under the present wording.
- **I6 (decision 6). gate: a daily class grant on the Board.** A `decision:` comment by Bryce (author is the
  owner, `performed_via_github_app` null, not edited) on the Board issue, of the form `decision: class <name>
  until <date>`, lets the gate pass the named row for any PR whose diff stays inside the class. Start with two
  classes that cost him clicks in the window: `sync-only` (a push that is only a merge of the deploy tip and leaves
  the PR's own config-path diff unchanged: `config-ok` stays valid; this is P1 expressed as a class) and
  `generated-only` (a `package.json` diff that is only generated lines). The gate must name the grant comment in
  its evidence and refuse when the diff leaves the class. `tools/ci/merge-gate.mjs` and
  `tools/ci/lib/provenance.mjs` are config paths. Related, with no grant needed: P7 (`needs-sync` treats a
  cancelled or base-red last run as a sync reason).
- **I7 (decision 7). what the orchestrator may do without asking.** AGENTS.md §Coordination, for Bryce to
  approve: "an orchestrator session does reversible things without asking and reports afterwards (tick a Plan
  line, re-request a gate, close a duplicate, archive a finished session, message workers); it never merges,
  cancels a run, recommends cancelling one, or changes a label Bryce set." Then P5
  (`.claude/hooks/github-mcp-guard.sh`: refuse an MCP label write that would drop `config-ok`, `hold`, `land` or
  `needs-decision`).
- **I8 (no decision needed, ranks 1 and 2). P1 and P2** as written under §Proposed patches: the `config-ok`
  comparison on the PR's own config diff, and a re-gate when `config-ok` is added. If I6's `sync-only` class
  ships first, P1 is that class made permanent.
