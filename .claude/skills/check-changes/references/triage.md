# Triage a test timeout — machine, wait, budget, or bug? (folded from the test-timeout-triage skill)

A timeout on this suite usually measures the MACHINE, not the code: every
Playwright worker is a full SwiftShader Chromium, and past ~4 busy cores they
starve each other into 120 s timeouts that read exactly like test failures.
Measured 2026-08-17: the same three smoke specs "failed" in three separate
loaded runs and passed solo in 8.1 s / 69 s / 25.6 s — zero code delta.

## The decision tree

**1. Was the box busy?** Check the log's failure text and the timeline first.
`Test timeout … while setting up "context"` is the classic load signature —
the browser couldn't even boot a context. Cross-check what ELSE ran during the
window (`/proc/loadavg` now; other `artifacts/logs/*.log` timestamps; node
sweeps, subagents, a second Playwright process — all count).
→ Re-run the spec ALONE: `node tools/test-solo.mjs <spec> [-g "grep"]`.
It refuses to start until the 1-min load is quiet, runs at 1 worker, and
prints the load beside the verdict. PASS solo = contention, done — do NOT
"fix" the test. FAIL solo = real; bisect.

**2. Could the failure be a code regression at all?** Diff the tree the
failing run served against the last passing run's tree. If the delta is
docs/tools/tests only, a rendering-path failure is impossible — say so and
move on (measured: a `.claude/`-markdown-only delta "broke" two smoke specs).

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
order dependence — `docs/TESTING.md` §Field notes has the worked example.

## Rules that prevent the class

- ONE Playwright process. `verify-change.mjs` batches at **one browser
  group** (padded with node-only groups). `test-bg.mjs` caps total groups
  at `floor(CORES/WORKERS)` with no browser/node split — `smoke` +
  `physics` is allowed on 4 cores. Browser+browser pairing is the measured
  source of the entire 120 s class.
- Everything long runs in the BACKGROUND with a log (`AGENTS.md`); check
  `node tools/test-bg.mjs --status` and `/proc/loadavg < 3` before starting.
- Verdicts come from the log's terminal line `= run <status>  (N/M done,
  K failed)` — match with `grep -E '= run (passed|failed|timedout|interrupted)'`
  (ERE alternation; fixed-string/BRE grep never matches) — never the process
  table.
- `tools/verify-change.mjs` runs the whole selection serialized correctly and
  labels timeout outcomes with the triage command.
