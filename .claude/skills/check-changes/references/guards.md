# Pre-push guards and how to read a failure

Load this before a push, or when a spec fails and you need to decide stale
expectation vs real regression.

## Universal guards (always, before push)

1. **Build guard for any track touched** — must print `OK <id>: ...`
   (`FAIL <id>: <msg>` means the game would strand on the menu):
   ```sh
   node tools/verify-track.cjs <id>
   node tools/verify-track.cjs --all    # js/track/* engine edits
   ```
   `tools/verify-change.mjs` already runs this inline when the plan names a
   circuit.

2. **`js/track/graph.js` edited? Also run scene-graph parity.**
   `pick-tests.mjs` does **not** route to it — this is the one source
   directory whose correctness check lives entirely outside the
   `test:<group>` map:
   ```sh
   node tools/graph-parity.cjs --all
   BASE=<pre-change-ref> node tools/graph-parity.cjs --all
   ```
   Builds each track twice (baseline ref + working tree) and diffs emitted
   prop geometry vertex for vertex. `verify-change` runs this inline when
   `graph.js` is in the plan.

3. **Cache version bumped — BOTH files?** Any `js/*.js` or `css/*.css`
   change: every `?v=N` in `index.html` AND `version.json`'s `build` must
   equal the same N (the deploy stamp; the repo carries `?v=dev`):
   ```sh
   node tools/bump-cache.mjs --check
   grep -o '?v=[0-9]\+' index.html | sort -u && cat version.json
   ```
   Cross-lineage merge: `node tools/gen-shell.mjs` regenerates the union shell
   (max of both + 1). Never `--apply` while a browser run is in flight.

4. **Smoke + load order** if you touched load order, `index.html`, or a core
   module (`index.html` script tags must match `tools/manifest.cjs`):
   ```sh
   npm run test:tooling-fast && node tools/test-bg.mjs smoke
   ```
   `test:tooling` also runs the slow full-fleet sweeps — reserve that for
   geometry pushes. Docs/skills/tools edits: `test:tooling-fast` covers
   docs-integrity.

## Reading failures

When a spec fails, first decide **stale expectation vs real regression**:
read the `__apex` hook values the test asserts on (`physState()`, `obs()`,
`wallStats()`, `groundY()`) and check whether the assertion still matches
the intended design. Magnitude-threshold specs and the legacy
`tests/manual/blank-scan.spec.js` / pixel soft-asserts in `tracks-visual`
drift; geometry/behaviour hooks are ground truth. Do not "fix" code to
satisfy a threshold that itself went stale.

A timeout on a busy box measures the machine, not the code — re-run that
spec **alone** (`node tools/test-solo.mjs <spec>`) before believing it.
Check `/proc/loadavg` (< 3) and for a live `playwright test` process first.

## Push

Only push to the active development branch; never to `main` without review.
The deploy branch is `claude/f1-game-project-26h3ng` — never push there
without review. Bump last, then commit + `git push -u origin <branch>`.
