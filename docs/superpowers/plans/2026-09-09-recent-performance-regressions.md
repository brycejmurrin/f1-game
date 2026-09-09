# Recent Performance Regressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all confirmed regressions from the preceding 24 hours while preserving explicit player and capture-tool opt-ins.

**Architecture:** Defaults change only when storage has no player preference.
Expensive detail, capture, and upscaling resources become demand-driven at
their existing seams. Each subsystem keeps its current public interface.

**Tech Stack:** Browser IIFE JavaScript, Node test runner, WebGL2, WebGPU,
Playwright tooling.

## Global Constraints

- No new dependencies or generated-file edits.
- Detailed player, cockpit, and garage helmets remain unchanged.
- Stored renderer and quality selections remain authoritative.
- SGSR and soft-present failures keep their existing safe fallbacks.

---

### Task 1: Conservative mobile defaults

**Files:**
- Modify: `tests/unit/gfx-backend-canary.test.mjs`
- Modify: `tests/unit/perf-governor.test.mjs`
- Modify: `js/game.js`
- Modify: `js/perf/quality-preset.js`

- [ ] Add source-contract tests requiring no implicit THREE assignment for a
  coarse pointer and requiring `defaultId(true) === "medium"` without legacy
  `gfxHigh`.
- [ ] Run both tests and confirm they fail on the current implicit THREE/HIGH
  defaults.
- [ ] Remove the coarse-pointer override from `js/game.js`; return `"medium"`
  from `defaultId(true)` unless legacy `gfxHigh` selects ULTRA.
- [ ] Re-run both tests and confirm they pass.

### Task 2: Cheap field helmets

**Files:**
- Modify: `tests/unit/helmets.test.mjs`
- Modify: `js/car/helmets.js`
- Modify: `js/car/car3d.js`

- [ ] Add a test whose counting design function proves `simplePaint` evaluates
  paint once while retaining the base triangle count and visor material.
- [ ] Run the helmet test and confirm `simplePaint` is not implemented.
- [ ] Teach `Helmets.build()` to use one base paint plus the existing analytic
  visor classification when `S.simplePaint`; pass it for field/silhouette cars.
- [ ] Re-run the helmet and car-presentation tests.

### Task 3: Coalesced livery rebuilds

**Files:**
- Modify: `tests/unit/team-livery.test.mjs`
- Modify: `js/garage/setup-sheet.js`

- [ ] Add a source-contract test requiring one trailing preview timer, timer
  replacement on input, and synchronous flush from `endLivPreview()`.
- [ ] Run it and confirm the current immediate `_spMeshKey` bust fails.
- [ ] Keep swatch DOM updates immediate but delay `livePreviewDraft()` by 75 ms;
  flush pending state before save/close.
- [ ] Re-run team-livery and setup-preview-hull tests.

### Task 4: Demand-driven GLX soft-present

**Files:**
- Modify: `tests/unit/renderer-soft-lifecycle.test.mjs`
- Modify: `js/render/glx/glx.js`

- [ ] Add a test requiring `present()` to call `softBlit()` only when waiters
  exist and requiring `awaitSoftPresent()` to request the next present.
- [ ] Run it and confirm the periodic WebDriver readback fails the contract.
- [ ] Remove the periodic pacing counter; retain the overlay and execute
  readback only for a pending waiter.
- [ ] Re-run `test:webgpu-lifecycle`.

### Task 5: Lazy SGSR initialization

**Files:**
- Modify: `tests/unit/renderer-soft-lifecycle.test.mjs`
- Modify: `tests/unit/webgpu-lifecycle.test.mjs`
- Modify: `js/render/glx/post.js`
- Modify: `js/render/webgpu/wgx.js`

- [ ] Add contracts proving SGSR link/pipeline construction is enclosed by a
  spatial-upscale request and runtime enable calls the initializer.
- [ ] Run both unit files and confirm eager construction fails.
- [ ] Add idempotent `ensureSpatial()` helpers in GLX and WGX; call them at boot
  only for stored/query opt-in and from `setSpatialUpscale(true)`.
- [ ] Run `node tools/gfx/wgx-validate.mjs` and the lifecycle unit tests.

### Task 6: Three-boot benchmark

**Files:**
- Modify: `tests/unit/ci-coverage.test.mjs`
- Modify: `tools/gfx/soft-present-bench.mjs`

- [ ] Add a contract asserting the benchmark has exactly one `page.goto()` and
  no `page.reload()`.
- [ ] Run it and confirm the current seven-boot implementation fails.
- [ ] Install one init script that derives storage from each leg's query and
  navigate once per leg.
- [ ] Re-run the focused test.

### Task 7: Integrated verification

- [ ] Run all focused Node tests.
- [ ] Run `npm run test:guards`.
- [ ] Run `node tools/ci/verify-change.mjs --fast`.
- [ ] Use `node tools/ci/pick-tests.mjs` to identify at most the most specific
  browser spec and run it through `test-bg.mjs` if selected.
- [ ] Save concise test output under `/opt/cursor/artifacts/`, commit, push, and
  update the draft pull request.
