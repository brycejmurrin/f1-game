VERDICT: FIX — paths and flags are clean, but "green" is read from workflow runs only. The skill never reads the one required check, `gate`, cannot show "merged", and misreads `= ci none` under `--once`.
METRICS: 46 lines / ~2.4 KB (~600 tok) / description 165 chars / 0 references files
PATHS: OK. session-status.mjs, ci-watch.mjs, test-bg.mjs, pages-live-sha.sh, pr-board.mjs, agents ci-red-triage + deploy-research and skill steward all exist. The routing set (tests/data/skill-routing/queries/check.json) and the smoke recipe (skill-smoke-recipes.json:815, pins `livePrLines: head`) also exist.
COMMANDS: the flags are valid: session-status `--pr [N]` (:232), ci-watch `--sha` `--once` (KNOWN_FLAGS :322), test-bg `--status` (:16), and pages-live-sha.sh `<url>` (prints a sha or nothing, exits 0). Two claimed meanings are wrong:
- SKILL.md:26 says "`none` = the push started no run". Under `--once` the 3-minute none-check (ci-watch.mjs:503) never fires, so `= ci none` (exit 124, :521) is printed right away and also means "not created yet". The real "no run" answer is the longer `= ci none — no workflow run … after 3 min` line (:515), and only a watcher without `--once` prints it.
- SKILL.md:15 has no mapping for the other `= ci` verdicts: `hollow` (exit 5, :497), `superseded (merged|new head)` (exit 4, :489), `blocked` and `none-yet`.

SONNET GAPS:
- 1 (gate/land/hold missing): CONFIRMED, and it is worse than stated. See WALKTHROUGH.
- 2 (merged → superseded): PARTLY WRONG. ci-watch prints `superseded (merged)` only when the head is none, running or cancelled (:484). A merged head whose CI passed prints `= ci passed`. The real gap is that step 1 cannot detect "merged" at all.
- 3 (description): CONFIRMED but minor. "live" is already a trigger. "did it deploy / is it shipped" is missing.
- 4 (~100 s undated): CONFIRMED.

WALKTHROUGH ("check — is my PR green and is it live?"; the live ruleset requires only `gate`, integration 15368):
1. Step 1, `session-status.mjs --pr`, prints draft/ready, `mergeable_state` and "CI on that head <ciSummary>". That summary covers Actions workflow runs only (:213). It includes the `Land` workflow, whose jobs succeed even when the `gate` they post is a FAIL. The line then says "gate: run `node tools/ci/ready-gate.mjs`" (:224), but ready-gate is the draft→ready receipt, not the `gate` check.
2. Step 2 gives `= ci passed`. The template has slots for CI and run only, so the agent drops `mergeable_state blocked` and answers "green".
3. FIRST WRONG STEP: SKILL.md:15, reporting `CI:` as "green". The PR #3914 case (#3917 body) is the counterexample: `CI` was green and `gate` was success, yet the PR sat BLOCKED because `gate` was filed in a stale suite. No step in the skill reads `gate` or `auto_merge`. After #3917, `gate` becomes a commit STATUS, which `check-runs` readers also miss: merge-gate.mjs:251, pr-board.mjs:275.
4. A merged PR breaks step 1 too. With no N, the lookup finds open PRs only (:206) and prints "Live PR state unavailable: no open PR", so the agent writes `PR none`. With `--pr N` it prints "ready", because `pr.draft` is false (:222). The template's `merged` value (:13) cannot be produced from the tools it names.
5. Liveness for "merged, not live yet": land.yml's GITHUB_TOKEN fallback starts no Pages train, so the change ships on the 6-hourly cron (WORKERS.md:99-102). The skill reports only `live: no`. The fix is to also run `ci-watch.mjs --sha <merge sha> --pages --once` (the tool's own hint at :489).
6. Step 4 never fetches the deploy branch, so an un-fetched live sha gives exit 128, read as "unknown". It should say `git fetch origin claude/f1-game-project-26h3ng` first.

STRUCTURE: small and well under limits. No line is over 400 chars, and nothing is duplicated except the pointer to "Live? = ancestor" (AGENTS.md §Git). The line "~100 s" (:45) is an undated measurement. Proposed text for the unclear lines:
- Replace :15 with `CI: <= ci …> · gate: <success|failure|pending|expected> · <land|hold|-> · auto-merge <armed|off> · <mergeable_state>`.
- Replace :26 with "(`--once` prints `none` before a fresh push's run exists: re-run after 3 min; `hollow` = a draft ran nothing, not green; `superseded (merged)` → step 4 plus `--pages` on the merge sha)".
- Add after :20: "Green = the `gate` check/status is success on the PR head; `= ci passed` alone is not green (the ruleset requires only `gate`)."

ENFORCEMENT: read-only by prose. bash-guard already refuses cancels and kills, so no hook is needed. The `gate` read belongs in a TOOL, not in prose: session-status `--pr` should print it, because the skill's job is to relay tool lines.

GAPS (ranked, each a separate PR):
1. tools/ci/session-status.mjs:213-225. Add a `gate` line to `fetchLivePr`/`livePrLines`, read from BOTH `commits/{sha}/check-runs?check_name=gate` and `commits/{sha}/status` (the #3917 form), plus labels (`land`/`hold`), `auto_merge != null`, and `merged`/`merged_at`. Drop the "gate: run ready-gate.mjs" wording or label it "ready-gate (draft→ready)". Extend tests/unit/session-status.test.mjs.
2. .claude/skills/check/SKILL.md:13-18 and :20. Add the gate/land/auto-merge/mergeable slot to the template, plus the "green = `gate` success" sentence above (depends on 1, or a `gh api` fallback in the meantime).
3. .claude/skills/check/SKILL.md:22-24 and session-status.mjs:206,222. Handle a merged PR: look up `state=all`, print `merged <sha7>` from `merge_commit_sha`, and have the skill pass that sha to step 4.
4. .claude/skills/check/SKILL.md:25-26. Correct the meaning of `none` under `--once` and map `hollow`, `superseded`, `blocked` and `none-yet`.
5. .claude/skills/check/SKILL.md:31-39. Fetch the deploy branch before `merge-base`. When merged but not live, add `ci-watch.mjs --sha <merge sha> --pages --once` and report the train state (or the cron fallback).
6. .claude/skills/check/SKILL.md:3 and :45. Add "did it deploy / shipped" to the description, and date or drop "~100 s".

OUT OF SCOPE:
- AGENTS.md §Git branch & deploy ("required checks, `CI` and `gate`") and docs/WORKERS.md:23,102 ("requires the checks `CI` and `gate`"): stale. The live ruleset requires only `gate`.
- .claude/skills/README.md:38: the check row also omits `gate`.
- tools/ci/merge-gate.mjs:251 and pr-board.mjs:275 read `gate` and CI through check-runs only. They need a status-aware read once #3917 lands.
