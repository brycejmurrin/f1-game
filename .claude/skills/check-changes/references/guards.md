# Pre-push guards and how to read a failure

Load this before a push, or when a spec fails and you need to decide stale
expectation vs real regression.

## Universal guards (always, before push)

1. **Build guard for any track touched** — must print `OK <id>: ...`
   (`FAIL <id>: <msg>` means the game would strand on the menu):
   ```sh
   node tools/track/verify-track.cjs <id>
   node tools/track/verify-track.cjs --all    # js/track/* engine edits
   ```
   `tools/ci/verify-change.mjs` already runs this inline when the plan names a
   circuit.

2. **`js/track/scenery/graph.js` edited? Also run scene-graph parity.**
   `pick-tests.mjs` does **not** route to it — this is the one source
   directory whose correctness check lives entirely outside the
   `test:<group>` map:
   ```sh
   node tools/track/graph-parity.cjs --all
   BASE=<pre-change-ref> node tools/track/graph-parity.cjs --all
   ```
   Builds each track twice (baseline ref + working tree) and diffs emitted
   prop geometry vertex for vertex. `verify-change` runs this inline when
   `graph.js` is in the plan.

3. **Shell / cache bust (no numeric bump).** Committed asset tags stay
   `?v=dev`; the deploy stamps content hashes. After a `js/`/`css/` edit:
   ```sh
   node tools/ci/bump-cache.mjs --check   # must stay clean (refuses --apply here)
   node tools/gen/gen-shell.mjs --check   # after tools/manifest.cjs: gen-shell.mjs
   ```
   Never hand-grep for `?v=[0-9]` on the repo shell, and never hand-edit
   `version.json`. Cross-lineage merge:
   `node tools/gen/gen-shell.mjs` regenerates the union shell.

4. **Structural guards (local edit loop)** — workers run the change-aware slice,
   not the full suite in the foreground:
   ```sh
   node tools/ci/tooling-fast.mjs --changed --jobs=3
   ```
   Run it in the background with `--jobs=3` (AGENTS.md rule 4; the default is 1). It is the
   edit-loop check: the full `tooling-fast` still runs before a code push
   (AGENTS.md rule 3), and CI and `deploy.mjs --gate-only` run the full ladder.
   Docs/skills/tools edits: `--changed` selects the docs-integrity family.
   Smoke + load order when you touched `index.html` or `tools/manifest.cjs`:
   ```sh
   node tools/ci/tooling-fast.mjs --changed && node tools/ci/test-bg.mjs smoke
   ```
   `test:tooling` also runs the slow full-fleet sweeps — reserve that for
   geometry pushes.

5. **A retired rule leaves no constant behind.** When AGENTS.md retires a rule,
   grep `tools/` and `.claude/hooks/` for its constant in the same PR (the
   ready-PR cap retired 2026-10-16 still ran as 3 in `ready-full-cap.mjs`, and
   sessions obeyed it).

## Reading failures

When a spec fails, first decide **stale expectation vs real regression**:
read the `__apex` hook values the test asserts on (`physState()`, `obs()`,
`wallStats()`, `groundY()`) and check whether the assertion still matches
the intended design. Magnitude-threshold specs and the legacy
`tests/manual/blank-scan.spec.js` / pixel soft-asserts in `tracks-visual`
drift; geometry/behaviour hooks are ground truth. Do not "fix" code to
satisfy a threshold that itself went stale.

A timeout on a busy box measures the machine, not the code — re-run that
spec **alone** (`node tools/ci/test-solo.mjs <spec>`) before believing it.
Check `/proc/loadavg` (< 3) and for a live `playwright test` process first.

## Push

Push your `cursor/<topic>-<hash>` branch; the deploy branch is
`claude/f1-game-project-26h3ng` — never push there without review. Run
`deploy.mjs --gate-only` first, then commit + `git push -u origin <branch>`.

## Coverage and structured results

A plan/selector must account for every requested material path: requested,
claimed and unclaimed paths remain visible in JSON. Mixed claimed/unclaimed
changes require the explicit fallback; selecting one known group does not
establish coverage for the rest. Skill/instruction Markdown has its own route.
Unknown flags and missing values fail before work; positional paths are explicit.
For experiment tools inspect `performed`, `notRun`, failures and positive
selected counts. MCP transport success is independent of domain verification.
