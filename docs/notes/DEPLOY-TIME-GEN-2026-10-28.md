# Build generated files at deploy time — inventory and staged design

2026-10-28 (Pacific). Decision: Bryce, answering in the parent session: "Build at deploy". It is recorded in
the landing-and-agent-ops plan §4 on PR #4059 (branch `cursor/landing-ops-plan-2b7d`, not yet merged). Evidence is in
that branch's pr-landing research note, §"Generated files collide because their output depends on
merge order" and in the plan's §1 item 3.

Why: a generated file the site serves is committed today. Two PRs can each pass alone yet change it differently,
and then the deploy tip's `gen:check` fails for every PR behind them. On 2026-10-27, #4020 and #3982 caused a
`docs/agent-index.json` `order` drift, and nothing landed for ~30 min. The cure: stop committing what the deploy can
build, and make the rest order-independent.

## 1. Inventory

"Served" means the file is inside `tools/desktop/stage-files.mjs`'s allow-list (`STAGE_ROOT_FILES`, `STAGE_DIRS`),
so Pages ships it. Class (a) means build at deploy. Class (b) means keep it committed but make it order-independent.
Class (c) means it cannot move as-is; its replacement plan is in the last column.

| File | Generator | Runtime / test / CI readers | Served | Class | Stage / note |
|---|---|---|---|---|---|
| `js/track/circuit-meta.js` | `tools/gen/gen-circuit-meta.mjs` (from `js/circuits/<id>.js` + `tools/manifest.cjs` `CIRCUITS`) | browser: one `<script>` tag in `index.html` (`?v=dev`), title/picker `TrackDefs`; `sw.js` precache via its tag parser; node: `tools/lib/game-vm.cjs` (loads every `FULL` file), `tests/helpers/game-source.mjs`, `tests/helpers/glx-mock.mjs`, `load-order`, `global-registry`, `frozen-globals`, `circuit-meta`, `circuit-def-fields` tests; `gen-arch-table` (a row of `docs/ARCHITECTURE.md` reads its header) | yes (`js/`) | (a) | **Stage 1** (§3) |
| `js/roster.js` | `tools/gen/gen-shell.mjs` (from `tools/manifest.cjs`) | browser: `ApexRoster.DEFERRED` / lazy bundles, `js/game.js`; `sw.js`; ~40 files in tests/tools (`load-order`, net-lobby VM tests, `select-specs`, `select-budget`, wall specs) | yes | (a) | Stage 2: needs `gen-shell.mjs` split into per-target renderers |
| `cockpit-view.html`, `controller.html` (`@gen-shell` blocks) | `gen-shell.mjs` | browser root pages; `sw.js` optional precache | yes | (a) | Stage 3, with `index.html` (template + build) |
| `index.html` `@gen-shell` blocks (script tags, title art) | `gen-shell.mjs`, `title-art.mjs` (from `js/car/car3d.js`) | every page load; `load-order` (script order == `FULL`), `bump-cache` stamp, `sw.js` tag parser, `global-setup.js` (`apex-build` meta), every spec | yes | (a) | Stage 3: the most widely read file. It needs a template source (`index.src.html`) or a build that rewrites the blocks in `_site`, and every dev server would serve the built copy. Not stage 1 (brief). |
| `sw.js` `@gen-shell` blocks (`sw-optional`, `sw-lazy-agent`) | `gen-shell.mjs` | the service worker; `offline-precache-check.cjs`; pwa specs | yes | (a) | Stage 3, with `index.html` |
| `tools/carview.html` | `gen-shell.mjs` | `tools/car/render-car.mjs`, car tools (dev servers only) | no (`tools/` is not staged) | (a) | Stage 2, with `js/roster.js` (same generator) |
| `locales/en.json`, `locales/manifest.json` | `tools/gen/gen-locales.mjs` (from `I18n.t` / `data-i18n` call sites) | i18n runtime; `sw.js` `SW_LOCALES` precache; `deploy-staging` test | yes (`locales/`) | (a) | Stage 2 candidate. First verify that no translated catalog is hand-authored next to `en.json`, because translations are inputs, not outputs. |
| `version.json` | deploy stamp (`tools/ci/bump-cache.mjs --apply` inside `stage.mjs`); the committed copy is a frozen dev placeholder `{ "build": 1695 }` | `sw.js` version guard, `index.html` boot guard, `poll-live-shell.mjs`, `bump-cache` repo check (meta == version.json) | yes | already (a) in effect | Keep the dev placeholder committed: every dev server needs one. Stage 2 prerequisite: the stamped copy gains `"sha"` (see §4) |
| `package.json` `test:*` scripts | `tools/gen/gen-test-groups.mjs` (from `tests/groups.json`) | npm itself, CI `npm run test:<group>`, `test-bg.mjs`, `remote-group.mjs` | no | (c) | npm reads `package.json` before any build can run. Replacement: one runner (`node tools/ci/run-group.mjs <group>`, or `npm test -- --group <g>`) reads `groups.json` at run time; then the generated scripts are deleted. Stage 4. |
| `tools/README.md` | `gen-tools-readme.mjs` (`@doc` headers) | agents, GitHub readers | no | (b) | Rows sorted by path; `deploy.mjs` cures conflicts by regenerating |
| `docs/agent-index.json`, `docs/AGENT-HOOKS.md`, `tests/data/impact-map.json` | `tools/docs/gen-agent-index.mjs` | `select-specs`/`pick-tests` (impact map), agents | no | (b) | Replace the positional `order` field with a stable key (plan §3 item 5). This is the field that broke the tip on 2026-10-27. |
| `docs/agent-output/catalog.json` | `gen-output-surface.mjs` | MCP output gateway, agents | no | (b) | Keyed by tool path |
| `docs/ARCHITECTURE.md`, `docs/DEBUG-HOOKS.md`, `docs/LIGHTING-TUNER-SLIDERS.md`, `docs/TESTING-COVERAGE.md` (generated blocks) | `gen-arch-table`, `gen-flags-table` + `gen-hooks-table`, `gen-slider-doc`, `gen-coverage-table` | readers of the docs; `generated-docs` test | no | (b) | Docs with generated blocks inside hand-written prose cannot be gitignored |
| `.cursor/rules/*` | `gen-cursor-rules.mjs` | Cursor | no | (b) | Agent configuration must be in the checkout |
| `CHANGELOG.md` | `gen-changelog.mjs --fold` (from `docs/changelog.d/` fragments) | release notes | no | (b) | Already fragment-based |
| `tests/data/ratchets.json`, `ratchets.d/*.json` | `tools/check/ratchets.mjs` | the ratchet gate | no | (b) | Already fragment-based |
| `tools/shot/scenery-locations.json` | `tools/shot/gen-scenery-locations.cjs` (~2 min) | shot tools | no | (b) | Slow; keep it committed |
| `js/track/circuit-elevations.js`, `assets/pack/*` | `bake-elevation.mjs` (SRTM), `assets.mjs` bakes | game runtime | yes | (c) | Baked from inputs that are not in the repo (or are slow to fetch): keep them committed |

## 2. Costs and where a build has to happen

- **A checkout is not servable or testable until it is built.** Every place that serves or tests a checkout must
  build first. The command must be idempotent and fast. `gen-circuit-meta` takes ~0.1 s and uses node builtins only,
  so it can run before `npm install`.

  | Entry | Where the build hooks in |
  |---|---|
  | `npm install` / `npm ci` | `package.json` `prepare` |
  | Claude Code session | `.claude/hooks/session-start.sh`, every session. Its `npm install` runs only when `node_modules` is stale, so `prepare` alone is not enough. |
  | Branch switch, pull, merge, new worktree | `.githooks/post-checkout` and `post-merge`. `core.hooksPath` is shared by every worktree; in this container it is the absolute main-checkout path, so the hooks take effect only once the main checkout's branch has them. |
  | Playwright (every route: `run-playwright`, `test-bg`, CI groups, `remote-group`, bare `npx playwright test`) | `tests/helpers/global-setup.js` |
  | Node suites | `tools/ci/tooling-fast.mjs`, `tools/ci/guards-verdict.mjs` (`test:guards`, the commit hook) |
  | `gen:check` (merge-gate runs it in a throw-away worktree) | the generator's `--check` |
  | `tools/shot/*` and the apex-tools MCP | `tools/lib/harness.mjs` `startStaticServer` |
  | chrome-devtools / js-debugger MCP | `tools/mcp/debug-chrome.mjs`, `tools/mcp/cdmcp-cli.py` |
  | CI | `.github/actions/setup-apex` (all 31 uses; `npm ci` runs `prepare` too) |
  | Cursor | `tools/env/cloud-agent-install.sh`. Its `npm install` uses `--ignore-scripts`, so `prepare` does not run there. |
  | Codex | No repo bootstrap; it relies on `prepare` and on AGENTS.md rule 11 |
  | Deploy (`pages.yml`, the verify-live recreate, the desktop and Android packagers) | `tools/desktop/stage.mjs`. It renders the files into the staged tree from source, never from a local copy, so every caller of `stage.mjs` gets the same bytes. |

- **Deployed bytes ≠ committed bytes.** Provenance is the source commit. `index.html` already carries
  `<meta name="apex-sha">` (stamped by `stage.mjs`). The stamped `version.json` has only `build`, so it should gain
  `"sha"` before stage 2. `verify-live.mjs` already compares the live bytes with a fresh stage of the same commit, so a
  deterministic generator keeps that check valid.
- **The service worker's precache list** reads the script tags of the staged `index.html`. A built file listed in a
  tag is precached exactly like a committed one. Stage 3 changes the blocks themselves, so the precache check
  (`offline-precache-check.cjs`) must run on the staged tree.
- **Open PRs that edited a now-untracked file** hit a modify/delete conflict when they sync. `deploy.mjs`
  `cureableConflicts` (used by `sync-pr.mjs`) must take the deletion (`git rm --cached`). `merge-gate` already refuses
  such a PR with "sync-pr.mjs first".
- **Re-adding the file must fail.** An old branch's conflict resolution or a `git add -f` could commit the file again.
  `gen:check` must fail when git tracks a built path.
- **Tests that freeze generated output** become generate-then-assert, and no test may delete a built file another
  parallel test reads. Writes go through a temp file plus a rename.
- **Worktree window.** Until the main checkout has the git hooks, a fresh agent worktree has no built file. A bare
  `node --test` of a `FULL`-reading test then fails with ENOENT on the path; `tooling-fast` and `test:guards` build
  first.

## 3. Stage 1: `js/track/circuit-meta.js`

**Why this file.** It is served, but only one static `<script>` tag names it, and the tag carries no hash. Every
reader is either the browser or a node reader inside the repo that the build hooks above cover. Its generator is
deterministic, ~0.1 s, and uses node builtins only. The alternative was `js/roster.js`, which has ~40 reader files
and shares `gen-shell.mjs` with `index.html`/`sw.js`. `index.html`/`sw.js` blocks were excluded by the brief.

### Stage 1 status (2026-10-28): implementation applied; verification tracked in the PR

The worker ran out of turns before the verification ladder finished. This PR preserves the unapplied code in
[the stage-1 patch](DEPLOY-TIME-GEN-2026-10-28.stage1.patch) (851 lines), committed at `9c5654f4f`. The patch
is durable in Git; the original container-local copy is not needed. The queue continuation applied the patch and added the npm `prepare` build entry.
The PR Plan records current verification and remaining gates; the checks below retain the original handoff requirements.

What the patch does (27 files):

- `.gitignore` gains `/js/track/circuit-meta.js`, and `git rm --cached` untracks the file.
- `tools/lib/generated-paths.mjs` adds `BUILT_PATHS` and `isBuilt()`, the one list of build products.
- New `ensure-built.mjs` in tools/gen/:
  - `ensureBuilt()` builds what is missing or stale, through `gen-lib.mjs` `ensureFile` (temp file + rename).
  - `buildInto(dir)` renders into a staged tree.
  - The CLI takes `--quiet` and `--list`.
  - It fails at import when `BUILT_PATHS` and its generator table disagree.
- `tools/gen/gen-circuit-meta.mjs`: `--check` (gen:check) now:
  - exits 1 only when git tracks the file;
  - rebuilds a missing or stale local copy and passes;
  - writes atomically.
- `tools/desktop/stage.mjs` `stageSite` calls `buildInto(dest, { root })` using the selected source checkout.
  Copy-only test fixtures explicitly pass `build: false`; alternate real checkouts build from their own manifest and circuits.
- `tools/ci/deploy.mjs` `cureableConflicts` adds `builtF`, cured by `git rm -q --cached`.
- Build calls are added in:
  - `tooling-fast.mjs`
  - `guards-verdict.mjs` (a dynamic import that skips in fixtures copying only that file)
  - `tests/helpers/global-setup.js`
  - `tools/lib/harness.mjs` (repo root only)
  - `debug-chrome.mjs`, `cdmcp-cli.py`
  - `.github/actions/setup-apex/action.yml` (skipped when the tool is absent)
  - `tools/env/cloud-agent-install.sh`
  - `.claude/hooks/session-start.sh` (silent unless it fails)
  - new `.githooks/post-checkout` and `post-merge`, which always exit 0
- AGENTS.md rule 11 moves the file into a "built, never committed" sentence on the existing line (no new rule line),
  pinned by a new `rulebook-guards` CANON row.
- New-track skill text updated; `docs/agent-output/policies.json` gains an entry for the new tool.
- Tests:
  - `circuit-meta.test.mjs`: untracked, built, idempotent, `buildInto` leaves no temp file.
  - `deploy-staging.test.mjs`: every `BUILT_PATHS` file is gitignored, untracked, under a staged dir, and staged
    from source.
  - `deploy-tool.test.mjs`: a real modify/delete merge cured by `git rm --cached`.

What passed before the stop:

- `node --test tests/unit/circuit-meta.test.mjs tests/unit/deploy-staging.test.mjs tests/unit/rulebook-guards.test.mjs`
  → 19 pass, 0 fail.
- The two new `deploy-tool.test.mjs` tests → 2 pass.

Nothing broke in what was run.

What remains, in order:

1. Apply the patch on this branch, then run `npm run gen`. `tools/README.md`, `docs/agent-index.json` and the impact
   map must list the new tool.
2. Run `npm run gen:check`.
3. Run `node tools/ci/pick-tests.mjs`, then `node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet`. The diff
   touches `tooling-fast.mjs`, `deploy.mjs` and `.github/`, so expect a wide selection; run it in the background with
   a log.
4. Run `node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs` (AGENTS.md byte and
   rule-line budgets).
5. Simulate a fresh clone of the pushed branch into `artifacts/`: run the ensure-built tool, and confirm
   the file appears before anything serves.
6. `package.json` `prepare` now appends the build entry in this stage-1 implementation:
   `"prepare"` becomes the current `git config` command followed by `&& node <the ensure-built tool>`. Use `&&`, not `;`,
   because npm uses cmd.exe on the Windows desktop runner.
7. The queue continuation authorization explicitly covers completing this stage-1 implementation, including
   its session-start build hook. No unrelated hook or settings change is included.
8. Browser groups run on the PR's CI only. The diff touches `tests/helpers/global-setup.js` and `.github/`, which
   select-specs routes to the full gate.

## 4. Stage order

1. **Stage 1** — `js/track/circuit-meta.js` (above). It proves the build hooks, the `BUILT_PATHS` list, the
   conflict cure and the `gen:check` "not tracked" guard.
2. **Stage 2**:
   - Stamp `"sha"` into the deployed `version.json`.
   - Split `gen-shell.mjs` into per-target renderers.
   - Move `js/roster.js` and `tools/carview.html` into `BUILT_PATHS`.
   - Evaluate `locales/en.json` + `manifest.json`.
3. **Stage 3** — the `@gen-shell` blocks of `index.html`, `sw.js`, `cockpit-view.html`, `controller.html`. This needs
   a template source and a dev-server story, because every local server serves `index.html` directly. It is the
   largest change and lands last among the served files.
4. **Stage 4** — `package.json` test scripts, replaced by one runner that reads `tests/groups.json` at run time.
5. **Throughout** — the class (b) docs lose positional fields (agent-index `order`) so they merge order-independently.
   `deploy.mjs` keeps curing their conflicts by regenerating.

Sources:

- npm runs `prepare` on a local `npm install` and on `npm ci`
  ([npm docs: scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/)).
- git runs hooks from the working-tree root, and post-checkout's exit status becomes the checkout's
  ([githooks](https://git-scm.com/docs/githooks)).
- Pages deploys from a custom-workflow artifact
  ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)).

Implementation references checked 2026-10-28: https://git-scm.com/docs/githooks documents checkout/merge hook working directories and post-checkout exit behavior; https://docs.npmjs.com/cli/v11/using-npm/scripts documents prepare lifecycle execution and shell semantics.
