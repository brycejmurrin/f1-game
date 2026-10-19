# Test suite review 2026-10-19 — pass-2 fix plans

Generated with `SYNTHESIS.md`. Each lane is one PR-sized owner session; OWNED globs are disjoint between lanes. A lane stays **draft** until every batch it draws from has a final report.

Model picks: the launch prompt named `.claude/skills/agent-fleet/references/launch-policy.md` §Model by task, but that section does not exist on this branch or the deploy tip (grep for "Model by task" finds nothing under `.claude/` or `docs/`). The picks below follow what does exist: lanes run Sonnet (memory `sessions-run-sonnet`), and a lane switched to Opus keeps the Sonnet cap (launch-policy.md). Opus is picked only where a lane must redesign a cross-backend file.

Every lane: one draft PR into the deploy branch, `Closes` nothing (the parent #2952 stays open until all lanes land), test-only unless the lane says otherwise; never widen a tolerance or quarantine to get green (AGENTS.md rule 9). A rewritten test must be shown to fail on the defect it targets (revert the guarded line locally, see red, restore).

## Order and dependencies

1. **L0 debugger + loader filenames first.** It gives every later lane line breakpoints in vm-loaded code (DBG-02) and the MCP on Node targets (DBG-01, #2957). Lanes that only fix vacuous asserts (S effort) may start in parallel; lanes converting source scans to behaviour wait for L0's helper change to land.
2. **L2 canary split before L3 and L5.** The canary holds TLX/WGX and perf pins that L3/L5 would otherwise both edit; L2 moves them into per-backend files that L3/L5 then own.
3. **L11 test lints last**: the lint for fixed `slice(x, x+N)` windows and asserts after `//` lands only after L2 and L5 have removed today's hits, so it lands green.
4. Independent, any order: L1 camera, L4 lighting, L6 XR, L7 flyby, L8 UI/CSS, L9 tooling misc, L10 physics and agent contracts.
5. **Product bugs found by tests go to their own issue**, not into a test lane's scope creep: R1-01 (`tuner-panel.js` scope buttons never get `aria-pressed`) is a shipped a11y bug; L1 carries it because the test and the fix must land together. Open a sub-issue of #2952 for it at L1 launch.

## Lanes

### L0 — Debugger on Node targets + vm filenames (draft)

- **Goal:** the js-debugger MCP attaches to `node --inspect-brk` test processes and every vm-loaded module carries its repo path as filename, so pass-2 lanes can set line breakpoints
- **Owned:** `tools/mcp/js-debugger-*.mjs`, `tests/unit/js-debugger-*.test.mjs`, `tests/helpers/fn-source.mjs`, `tests/helpers/game-source.mjs`, `tests/helpers/vm-page.js`, `.claude/skills/js-debugger/**`
- **Closes:** DBG-01, DBG-02, DBG-03 (3 findings; effort S×1 M×2 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/js-debugger-*.test.mjs && npm run test:tooling-fast`
- **Effort:** M (two PRs, ~1 day of agent time)
- **Model:** claude-opus-5-5 — an MCP protocol change plus a helper contract every lane depends on; it keeps the Sonnet cost cap (launch-policy.md, cost and context)
- **Depends on:** none; coordinate with #2957's claimant and the DEBUGGER-A/B notes before launch (they may already own the MCP half)
- **PR slices:** PR 1: MCP node targets (#2957); PR 2: filename option in test-helper loaders + a lint for vm.run* without filename

### L1 — Camera tests behave, not scan (draft)

- **Goal:** camera tests drive the real rig on a curved track, the tuner scope bug is fixed with its test, and vacuous asserts are gone
- **Owned:** `tests/unit/cam-*.test.mjs`, `tests/unit/camera-*.test.mjs`, `tests/unit/free-cam.test.mjs`, `tests/unit/results-cam.test.mjs`, `tests/specs/camera*.spec.js`, `tests/helpers/camera-*.mjs (new)`, `js/camera/tuner-panel.js`
- **Closes:** R1-01, R1-03, R1-05, R1-07, R1-12, R1-14, R1-16, R1-18, R2-06, R3-12 (10 findings; effort S×7 M×3 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/cam-*.test.mjs tests/unit/camera-*.test.mjs tests/unit/free-cam.test.mjs tests/unit/results-cam.test.mjs && npm test -- tests/specs/camera-tuner.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L0 PR 2 for R1-07/R1-18 (behaviour conversions); the rest can start now
- **PR slices:** PR 1: R1-01 bug + test, R1-03, R2-06, R3-12 (S fixes); PR 2: shared curved-track fixture, R1-05, R1-07, R1-12, R1-14, R1-16, R1-18

### L2 — Split gfx-backend-canary; render contracts (draft)

- **Goal:** the 7k-line canary becomes per-behaviour files with honest names, `read()` names the file it reads, and fixed slice windows are gone
- **Owned:** `tests/unit/gfx-backend-canary.test.mjs`, `tests/unit/gfx-*.test.mjs (new splits)`, `tests/unit/render-final-contracts.test.mjs`, `tests/unit/renderer-boot-timeout.test.mjs`, `tests/unit/gfx-debug-overlay.test.mjs`, `tests/unit/render-lighting-prep.test.mjs`, `tests/specs/instanced-draw.spec.js`
- **Closes:** R2-02, R2-03, R2-12, R2-13, R2-16, R2-19, R3-13 (7 findings; effort S×5 M×1 L×1)
- **Draws from batches:** render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/gfx-*.test.mjs tests/unit/render-*.test.mjs tests/unit/renderer-boot-timeout.test.mjs && npm run gen:check && npm run test:tooling-fast`
- **Effort:** L (split is mechanical but 252 tests; budget two sessions)
- **Model:** claude-opus-5-5 — a 7k-line cross-backend file split where test identity and group membership must survive; it keeps the Sonnet cost cap (launch-policy.md, cost and context)
- **Depends on:** none; must land before L3/L5 touch moved pins
- **PR slices:** PR 1: mechanical split, no assertion changes (gen + groups.json rows); PR 2: slice windows → fnBody/span, read() fix, R2-12/R2-16/R2-19; PR 3: R2-13 delete, R3-13 frameContent

### L3 — TLX/WGX behaviour over text pins (draft)

- **Goal:** TLX and WGX tests run the lifted code on fake GL/GPU instead of matching source; WGX text pins move to one labelled file
- **Owned:** `tests/unit/tlx-*.test.mjs`, `tests/unit/hunt-tlx-*.test.mjs`, `tests/unit/webgpu-lifecycle.test.mjs`, `tests/unit/<new: wgx-source-pins>.test.mjs`, `tests/unit/tex-census.test.mjs`
- **Closes:** R2-08, R3-04, R3-05, R3-06, R3-15, R3-17 (6 findings; effort S×4 M×2 L×0)
- **Draws from batches:** render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/tlx-*.test.mjs tests/unit/hunt-tlx-*.test.mjs tests/unit/webgpu-lifecycle.test.mjs tests/unit/tex-census.test.mjs; a real WGSL compile needs gpu-census.yml (path rule render-wgx)`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2 PR 1 (moved pins); L0 PR 2 helps R3-05/R3-06

### L4 — Lighting tests run the real LightStore (draft)

- **Goal:** preset and lamp tests run the real resolver and fail on NaN, missing geometry or a scoped run
- **Owned:** `tests/unit/light-*.test.mjs`, `tests/unit/lamp-*.test.mjs`, `tests/unit/lighting-*.test.mjs`, `tests/unit/night-washout-presets.test.mjs`, `tests/specs/image-grade-visual.spec.js`
- **Closes:** R2-04, R2-07, R2-09, R2-14, R2-15, R2-20, R3-09 (7 findings; effort S×4 M×3 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/light-*.test.mjs tests/unit/lamp-*.test.mjs tests/unit/lighting-*.test.mjs && npm test -- tests/specs/image-grade-visual.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none (lamp-fixture-anchor is a sweeps file: run `npm run test:sweeps` scope for R2-07)

### L5 — Perf and frame-time gates that can fail (draft)

- **Goal:** perf tests either gate on something real or are labelled telemetry; dead assert in perf-try fixed; globals restored
- **Owned:** `tests/unit/perf-*.test.mjs`, `tests/unit/render-rate.test.mjs`, `tests/unit/frame-*.test.mjs`, `tests/specs/perf-frametime.spec.js`, `tests/helpers/perf-frametime.mjs`
- **Closes:** R1-04, R1-17, R2-01, R2-05, R2-11, R3-03 (6 findings; effort S×4 M×2 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/perf-*.test.mjs tests/unit/render-rate.test.mjs tests/unit/frame-*.test.mjs && npm test -- tests/specs/perf-frametime.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2 PR 1 if perf pins move; R2-01 (S) can go now
- **PR slices:** PR 1: R2-01, R2-05, R1-04 (S); PR 2: R3-03 decision (STRICT vs telemetry: ask Bryce), R2-11, R1-17

### L6 — XR asserts and gaps (draft)

- **Goal:** XR tests assert exact fallback reasons and the VR spec checks pause, pin and capture for real
- **Owned:** `tests/unit/xr-*.test.mjs`, `tests/specs/vr-emulated.spec.js`, `tests/specs/xr-plan.spec.js`, `tests/specs/presets.spec.js`
- **Closes:** R3-07, R3-10, R3-14, R3-18 (4 findings; effort S×3 M×1 L×0)
- **Draws from batches:** render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/xr-*.test.mjs && npm test -- tests/specs/vr-emulated.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L7 — Flyby files: split the slow one, reconcile limits (ready to launch)

- **Goal:** flyby-shots leaves toolingFast in fast pieces, and the flyby audit has a negative control
- **Owned:** `tests/unit/flyby-*.test.mjs`, `tests/helpers/flyby-audit-rules.mjs`
- **Closes:** R1-06, R1-10, R1-11 (3 findings; effort S×2 M×1 L×0)
- **Draws from batches:** render-1
- **Verify:** `node --test tests/unit/flyby-*.test.mjs && npm run gen:check && npm run test:tooling-fast`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L8 — UI/CSS fit tests on cssRules; one formatter table (draft)

- **Goal:** tuner CSS fit checks parse rules instead of regex, contrast is computed, and every lap/race-clock formatter shares one table test
- **Owned:** `tests/unit/ui-fit-*.test.mjs`, `tests/unit/appearance-*.test.mjs`, `tests/unit/lap-format-rollover.test.mjs`
- **Closes:** R1-08, R2-21, R3-11 (3 findings; effort S×2 M×1 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/ui-fit-*.test.mjs tests/unit/appearance-*.test.mjs tests/unit/lap-format-rollover.test.mjs`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L9 — Tooling tests on fixtures (draft)

- **Goal:** tooling tests run on fixtures instead of live repo state, misplaced smokes move home, local shader validation is honest
- **Owned:** `tests/unit/apex-memory.test.mjs`, `tests/unit/census-verdict.test.mjs`, `tests/unit/shader-validate.test.mjs`, `tests/unit/skill-render-ui-surface.test.mjs`, `tests/unit/game-tools-help.test.mjs`, `tests/unit/assets-pack.test.mjs`, `tests/unit/vertex-pack.test.mjs`, `tests/unit/elev-presets.test.mjs`, `tools/env/apex-memory.mjs`
- **Closes:** R1-02, R1-09, R1-13, R1-15, R2-10, R2-18, R3-16 (7 findings; effort S×7 M×0 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/apex-memory.test.mjs tests/unit/census-verdict.test.mjs tests/unit/shader-validate.test.mjs tests/unit/game-tools-help.test.mjs tests/unit/assets-pack.test.mjs tests/unit/elev-presets.test.mjs && npm run test:tooling-fast`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** R2-10 touches lighting-tuner-sweep.test.mjs, which L4 owns: L9 adds the CASES to game-tools-help, L4 deletes them from lighting-tuner-sweep

### L10 — Physics and agent contracts that can fail (draft)

- **Goal:** wall contact is pinned on both walls, the determinism spec can fail, and the assets spec reads real GL errors
- **Owned:** `tests/unit/wall-clamp.test.mjs`, `tests/specs/agent-determinism-frame.spec.js`, `tests/specs/assets-api.spec.js`
- **Closes:** R3-01, R3-02, R3-08 (3 findings; effort S×2 M×1 L×0)
- **Draws from batches:** render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/wall-clamp.test.mjs && npm test -- tests/specs/agent-determinism-frame.spec.js tests/specs/assets-api.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; physics-1/physics-2 reports may add wall/physics rows to this lane

### L11 — Test-tree lints (draft)

- **Goal:** tools/check lints stop the recurring patterns at commit time: fixed slice windows, asserts after //, vm.run* without filename, `>= 0` / always-true asserts
- **Owned:** `tools/check/<new: test-pattern-lint>.mjs`, `tests/unit/<new: test-pattern-lint>.test.mjs`
- **Closes:**  (0 findings; effort S×0 M×0 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/<new: test-pattern-lint>.test.mjs && npm run test:guards`
- **Effort:** S
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2, L5 and L0 PR 2 landed (so the lint lands green)
