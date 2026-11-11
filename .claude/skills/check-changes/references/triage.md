# Triage a test timeout — machine, wait, budget, or bug?

A timeout on this suite usually measures the MACHINE, not the code: every
Playwright worker is a full SwiftShader Chromium, and past ~4 busy cores they
starve each other into 120 s timeouts that read exactly like test failures.
Measured 2026-08-17: the same three smoke specs "failed" in three separate
loaded runs and passed solo in 8.1 s / 69 s / 25.6 s — zero code delta.

## Step 0 — "it timed out": which timeout? (read-only, seconds)

Browser groups run on CI, not here (AGENTS.md rule 5). A `cancelled` job with zero
failures is a timeout until proven otherwise (rule 8); a `remote-group.mjs` waiter
running out of `--timeout` is the WAITER giving up, not a test result (the run is
left alive: `node tools/ci/remote-group.mjs --watch <run-id>`). Read the shard log,
not the exit code:

```sh
node tools/ci/ci-watch.mjs --once --failures-only    # this HEAD's red/cancelled jobs and their failing step
gh run view <run-id> --log-failed | grep -aE 'x FAIL|! retry|= FAILURES|= slowest|= run ' | head
#   per-test 78.0s-style durations; `while setting up "context"` = load
```

No verdict line yet = still running: wait (skill `steward`), do not re-dispatch.
A red with only ~120 s timeouts goes to step 1.

## The decision tree

**1. Was the runner starved?** Check the log's failure text and the timeline first.
`Test timeout … while setting up "context"` is the classic load signature —
the browser couldn't even boot a context. Cross-check the sibling shards on the
same `head_sha` and the spec's usual duration (`tests/data/spec-timings.json`).
→ Re-run the group on the pushed branch: `node tools/ci/remote-group.mjs <group>`
(a green run of the same sha is reused; `--force` re-dispatches). PASS there =
contention, but a pass that needed the retry is still a red (rule 9). FAIL again
= real; bisect. A local solo re-run (`test-solo.mjs`) is for a Bryce-attended
session on his explicit grant only.

**2. Could the failure be a code regression at all?** Diff the tree the
failing run served against the last passing run's tree. A prose-only delta
does not change the served game or harness. Tools, fixtures and tests can
change backend choice, initialization, assets or serving: inspect those
deltas before ruling out a regression. The measured `.claude/`-Markdown-only
case produced unrelated smoke failures; it does not establish the same for
executable tool/test changes.

**3. Did a `waitForFunction` overrun its declared timeout?** (3 s declared,
100+ s observed.) That is rAF starvation: the default polling clock is
requestAnimationFrame, which starves under SwiftShader exactly when the page
renders. Every wait on a rendering page needs `{ polling: 100 }` —
`tests/unit/wait-polling.test.mjs` ratchets this. If the wait still overruns
WITH polling, the predicate may be unreachable — instrument whether it can
ever become true before touching timeouts (the measured M6 case: the waited-on
hook was never called on that path at all).

**4. Is the budget simply undersized?** A test that takes ~100+ s even solo
on a quiet box is NEAR its budget, not flaky (the minimap smoke spec runs
134–174 s loaded). Raise the budget with a written reason — never widen an
assertion tolerance to make a spec pass.

**5. Passes loaded but fails solo?** (The inversion.) One worker serializes
the whole file onto one machine-state; look for shared-page state leaks and
order dependence — `docs/notes/TESTING-FIELD-NOTES.md` has the worked example.

## Stale generated indexes (not load, not a rerun)

When the failure mentions `gen:check`, `agent-indexes.test.mjs`,
`impact-map.json`, ARCHITECTURE.md module tables, or a merge left only generated
paths conflicted (`package.json` test scripts, `docs/agent-index.json`, ratchet
deltas) — run **`npm run gen`**, then **`npm run gen:check`**, commit ONLY the
generated outputs (never hand-edit them; `protect-files.sh`), run
`npm run test:tooling-fast`, push. Generators: the `gen` chain in `package.json`.
Do not re-dispatch CI until gen is clean.

## One red shard outside the diff — flake or base red?

Before one re-run (`docs/VERIFICATION.md` §5: at most once, timeout/infra,
`node tools/ci/ci-rerun.mjs`): name the test and assertion (agent `ci-red-triage`),
confirm the sibling shards on the same `head_sha` are green, and check the deploy
tip — the same test red there is base red, not your flake; an unselected or unread
base result is UNKNOWN, not green. A pass that needed the retry is still a red
(rule 9): list it in the PR.

## Rules that prevent the class

- No local browser test runs (AGENTS.md rule 5); a subagent never starts one (rule 10,
  `bash-guard.sh`). Browser+browser pairing on this box is the measured source of the
  entire 120 s class; on CI each shard owns its runner.
- `verify-change.mjs` plans ONE group per batch and reports browser batches as not-run;
  name them in the PR or run them with `remote-group.mjs`.
- Verdicts come from a log's closing line: `remote-group.mjs` ends `= group <verdict>`,
  `ci-watch.mjs` ends `= ci <verdict>`, a `tooling-fast` log ends
  `= tooling-fast passed|failed (<n> files, <m> failed)`. Match with `grep -E '^= '` — never the process table.
