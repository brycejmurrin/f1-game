# Process speed-up plan — tests, docs, agent surface, deploy (2026-09-01)

Measured in one session (this one), not estimated. Every number below has a
log in `artifacts/logs/` or a `file:line` behind it. The plan is ordered by
minutes saved per week of agent time divided by risk; the first tier needs no
browser run to land.

> Errata: none yet. Re-measure the "today" columns before relying on them.

## 0. Where the time goes today

| Step | Measured | Where |
|---|---|---|
| `test:tooling-fast` (122 files, serial) | 315–630 s | `tooling-fast-baseline.log`: cockpit-pale-surfaces 69 s, slider-effect 42 s, crest-marks 41 s = 48 % of the loop |
| one browser boot on SwiftShader | 11–33 s idle, 45 s budget | boot-guard tests in `tiny.log`; `fixtures.js:23` `BOOT_MS = 45000` |
| `dev-tools.spec.js` (56 JSON-only tests) | 1,917 s, avg 34 s/test | `tiny.log` — a fresh page per test, nothing rendered |
| `test:tiny` at 2 workers | 1,472 s, loadavg 7.7, 3 false timeouts | `tiny.log`; all 3 PASS solo |
| collision specs with hand-rolled 8 s boot waits | 9 of 33 red on a quiet box | `physics-collision-post.log`; 14/14 after `BOOT_MS` |
| `test:sweeps` | 999 s, of which ONE subtest is 559 s | `union-sweeps.log`: parts-visual-distinctness "every option resolves to itself" |
| a deploy (merge, bump, tooling-fast, sweeps, push, live check) | ~35–45 min session time, ~10 min Pages | this session, twice |
| build-number collisions | 34 of 105 builds introduced by 2–3 commits | `git log` on the deploy branch, last 200 commits: 144 touched `version.json` |
| CI deploy gate | 2 of 115 specs; 26 specs excluded from `selected` by their own timeouts, incl. all 16 `*-foundation` and every `webgl` spec | `tools/ci/ci-coverage.mjs`, `select-specs.mjs:46-52` |

Two facts frame everything: **the browser is the cost** (SwiftShader, 4 cores,
one worker is the honest maximum) and **most browser tests do not need a
browser** (they read `__apex` JSON after `step()`).

## 1. Tests

### 1.1 Do now (no browser run to land, ~1 h of edits)

1. **Every hand-rolled boot wait → `BOOT_MS`.** 59 specs still wait 5/8/10 s
   for `window.__apex` (top: ui-audit 15 sites, new-hooks 14, dev-tools 12,
   career 8). Today that cost ~35 min of reruns that bought no information.
   Mechanical edit; the three collision specs were done this session as the
   pattern (`import { BOOT_MS } from "../helpers/fixtures.js"`).
2. **Move the three slow unit files out of the edit loop.**
   cockpit-pale-surfaces, crest-marks, slider-effect (152 s of 315) → a
   `test:node-slow` group run by CI `guards` and by `verify-change` only when
   `js/car/` or `tools/lighting/slider-effect.mjs` changed. Keep car-mesh-anchors in
   fast (it is the deploy gate for the wing check). Edit loop → ~160 s.
3. **Split the 559 s sweeps subtest** into its own CI job; sweeps → ~7.5 min.
4. **`test-bg` refuses to start at loadavg > 3** and defaults render-project
   specs to one worker. Prevents the loadavg-7.7 inversion that produced
   every false red today.
5. **Close the silent greens**: `physics-characterization.spec.js:45` skips
   when `tests/data/physics-baseline.json` is absent, so the `driving-model`
   deploy job can pass on a skip — assert the file exists in node-fast.
   Park `ui-audit` (39 tests, asserts nothing) and `tracks-visual` out of the
   counts pick-tests reports.

### 1.2 The structural win: a node harness for the physics (~180 tests)

`tools/lib/track-build-vm.cjs` already runs the real track build in a Node VM and
`tests/unit/ai-drive.test.mjs` shows the pattern for `js/game/*`, but nothing
loads `js/game.js` in Node. A `tools/lib/game-vm.cjs` (game.js + physics-consts +
GLX/DOM/audio stubs on top of track-build-vm) turns these specs into
sub-second unit tests, because none of them reads a pixel or the DOM:

| spec | tests | what it reads |
|---|---|---|
| new-hooks | 56 | `__apex` JSON (one hidden 300 s foundation test at :793 to move out) |
| headless-api | 24 | step/physState/obs |
| obs-act-edge | 16 | obs/act |
| collisions-deep, collision-ai-fixes, collisions | 32 | step/probe/cars |
| active-aero, aero-zones, offtrack, elevation-tracks | 39 | step/physState |
| longitudinal, world-physics, drift | 18 | step/physState |

Port `physics-characterization` first (its golden is JSON already), prove
parity once against the browser numbers, then the rest. The `driving-model`
CI job collapses into `guards`. Risk: the stub surface; the one-off parity
proof is the mitigation.

**LANDED 2026-09-01 (second half): the thirteen twins**, one
`tests/unit/<spec>-vm.test.mjs` per spec above, all in `test:game-vm`, each
one boot per file and the browser spec's own assertions and thresholds
number for number (no tolerance was widened; the Playwright specs stay in
place as the truth until CI has run the twins). No harness stub had to be
extended — every hook the specs read already answers in the VM, including
`camState()` after `snapCam()` and the scenery diagnostics. What was left
in the browser, and why:

| spec | ported | left in the browser |
|---|---|---|
| headless-api | 24 / 24 | — |
| obs-act-edge | 16 / 16 | — |
| longitudinal | 6 / 6 | — |
| world-physics | 5 / 6 | RESPONSE slider — drives the `#pm-rate` DOM input |
| drift | 6 / 6 | — |
| active-aero | 13 / 13 | — |
| aero-zones | 10 / 10 | — (the aero-part sweep boots three extra VMs where the browser reloads) |
| offtrack | 8 / 8 | — |
| elevation-tracks | 47 / 47 | — (40 circuit builds; ~2 min, the whole set's floor) |
| collisions | 3 / 3 | — |
| collisions-deep | 15 / 15 | — |
| collision-ai-fixes | 14 / 14 | — |
| new-hooks | 55 / 56 | the hidden ~300 s Madrid foundation test (`test.setTimeout(300000)`, spec line 793) |

Three things the port had to get right that a copy would miss: (1) the
browser gives most of these specs a FRESH page per test, so each twin's
load helper restores `setPhysics(tuning-at-boot)` and `headless(false)` —
aero-zones' pace test left `pace: 1.5` behind and the X-mode trade read
`aeroX 0` until it did; (2) VM objects carry the VM realm's prototypes, so
`assert.deepEqual` (strict) reports "same structure but not reference-equal"
— compare JSON copies; (3) "before a track is loaded" tests boot with
`createGame({ storage: { trackId } })` and run first, since the VM cannot
reload a page. Measured (this container, 4 cores): a build is ~1 s, a
physics step ~1.2 ms with the full field; the per-file walls are in the
`docs/TESTING.md` coverage rows.

### 1.3 Shape

- **One boot per file** for the parts-* (five specs boot the same garage; the
  group is measured at 1 h 55 m) and multiplayer-* specs, via the
  `sharedTest` fixture that ten specs already use.
- **Groups 30 → 12** — LANDED 2026-09-01 as a DISJOINT partition of the
  115 specs (`driving`, `hooks`, `circuits`, `car`, `input`, `ui`, `modes`,
  `net`, `gfx`, plus `tiny`/`smoke`/`baseline`/`shimmer`/`gallery`; the union
  was diffed file for file before and after — nothing lost, nothing gained,
  `fast` gone because it double-ran nine specs). `test-groups.test.mjs` now
  asserts the disjointness; `docs/TESTING.md` §2 has the old→new map. The
  node groups (parts-unit, garage-unit, …) stayed: they are seconds each and
  every one is routed. The 18 scripts no rule picked are now 14, all of them
  partitions, on-demand galleries or tool entry points.
- **Source-text pins → behaviour.** 2,184 `assert.match` across 72 unit
  files; ~1,000 of them quote one file's code (gfx-backend-canary 440,
  ui-improve-pass 269, perf-try 146, …). Two broke today on a one-token
  refactor that changed no behaviour. Keep the lint-class invariants that
  scan every file (no-bare-console, vstd, storage-key-prefix,
  global-registry, silent-catch, css-*, load-order); convert the single-file
  pins to VM-loaded behavioural tests in the ai-drive style. Zero wall time;
  removes a whole class of false reds.

### 1.4 Split to run individually, and where that pays

Splitting pays on **runners**, not on this box. GitHub runners are separate
machines: a matrix with one runner per group (or per heavy spec) makes the
suite's wall time the slowest group instead of the sum — roughly 40 min of
serialized SwiftShader becomes 10–15, and a red spec no longer hides behind
a slow one. Locally, 4 cores and SwiftShader mean one worker; the local split
is *selection* (the touched spec via `select-specs`), never parallelism.
The renderer specs (`webgl`, `tlx`; 240–480 s budgets on SwiftShader, never
in CI today) boot in ~4 s on `macos-latest`'s real Metal adapter — give
`js/render/**` its own macOS job.

> **Landed 2026-09-01 (unverified until pushed — no Actions run yet):**
> `ci.yml` `renderer-filter` (ubuntu, path filter: `js/render/**`,
> `js/game/lighting*.js`, `light-presets.js`, `atmosphere.js`, `tuner.js`,
> the `test:gfx` specs, both playwright configs; fail-safe RUN on schedule /
> dispatch / unresolvable diff) → `renderer-macos` (`macos-latest`,
> `test:gfx` through `playwright.gpu.config.js` — the base config minus
> `--use-angle=swiftshader` plus `channel: "chromium"`; census-gated on
> `anyHardware === true`; `APEX_WORKERS=2`, `--timeout=600000`, 30 min cap,
> a guess). Skipped on the Pages call, so the deploy gate is unchanged.
> Guards: `tests/unit/ci-coverage.test.mjs`; `docs/TESTING.md` §Renderer
> specs on a real GPU. The 30-minute figure is not a measurement.

## 2. Docs

- **Archive is 45 % of `docs/`** (21,887 of 48,394 lines) and 38 of its 58
  files are cited by nothing outside the archive, yet `docs/README.md`
  indexes 24 of them. Move the 38 to an attic ledger (title + SHA), drop the
  24 index rows. Seven `research/` files break their own folder rule (cited
  only by the index): archive them.
- **Generate what drifts.** Today's audit found ~40 stale rows across nine
  docs; every one was a count, a path, or a signature. Generate:
  `DEBUG-HOOKS.md`'s hook table from `agentHelp()` (`js/agent/agentview.js:1986`
  already holds the manifest; keep hand prose for sharp edges only),
  `tools/README.md` from a `@doc` first-line summary in each tool header
  (70 KB hand-written today; the test only asserts row existence),
  `LIGHTING-TUNER-SLIDERS.md` from `slider-effect.mjs --md` (it says
  "generated" and is not), `AGENT-SURFACE.md`'s wrap table from
  `apex-tools-mcp.json`, `TESTING.md` §2 group membership from `pick-tests`.
- **AGENTS.md**: ~800 of 2,933 words are war stories (npm-install red run,
  the real-GPU census, soft-present mechanics, the four WGX boot defects,
  Cursor Cloud packages, WGSL rules). Keep each rule as one line with a
  pointer; move the paragraphs to `../ARCHITECTURE.md`, `CI-RENDERING-PERFORMANCE.md`,
  `WEBGPU-PARITY.md`, `apex-env-setup`. `PERF-FINDINGS.md`: keep §0 + the
  cited §2 sections, archive §3–§5 (~900 lines).

## 3. Agent surface (MCP, skills, agents)

**Security first: `tools/mcp/tinyfish-mcp.sh:41` ships a tracked TinyFish API key
(`TINYFISH_KEY_FALLBACK`) and `tinyfish-mcp.test.mjs:89` asserts it is
there.** The repo is public. Rotate the key, remove the fallback, and change
the test to assert the fallback is ABSENT. This is a decision for the owner,
not a refactor.

| Server (`.mcp.json`) | Today | Proposal |
|---|---|---|
| apex-tools | up, 30 wraps | keep, 30 → 12 wraps |
| playwright | fails to connect (wrapper passes `--browser chromium`; unconfirmed as the cause — launch with `--browser chrome` to test) | drop; playwright-official is the one `browser_*` |
| playwright-official | up | keep |
| chrome-devtools | clone missing, falls back to npx; only delta is `--enable-unsafe-webgpu` | keep this one |
| chrome-devtools-official | up, boots two servers + two watchdogs for one job | drop |
| tinyfish | down; `agent.tinyfish.ai` is not in the egress allowlist, so it cannot work in-container | drop; use the hosted TinyFish connector (it fetched github.io today) or WebFetch |
| probe | up; its tinyfish half is dead for the same reason, its chrome half duplicates chrome-devtools | drop from `.mcp.json`; keep `probe-mcp.py chrome-start` as a CLI |

Wraps to keep (12): the eight that pin a dangerous flag (`verify_change_fast`,
`bump_cache_check`, `pick_tests`, `select_specs`, `rotate_markings_check`,
`graph_parity`, `wgx_validate_static`, `status`) and four browser wraps
(`eval`, `shot`, `agent`, `gfx_probe`). The ten tree wraps that only spawn a
CLI with `--json` go: skills already cite the CLI. `agent-surface.test.mjs`
locksteps the table, so both change together.

Skills 44 → ~22: delete the four with no repo content (webgpu-inspector,
webapp-testing, pixel-perfect, apex-env-setup — 1,000+ lines, zero
references, two name tools that do not exist); fold the pointer skills into
the skill they point at (motion-capture + perf-profile → playwright-probe;
cross-backend-parity → `../ARCHITECTURE.md` (LANDED 2026-09-01 as §Cross-backend
parity; 32 → 31 skills); bake-lighting → lighting-tuner;
scene-graph-instancing → scenery-dress; debug-state → agent-view;
test-timeout-triage + bump-cache + deploy-merge → check-changes/references).
`skill-progressive.test.mjs` pins 33 names in a "previously fat" list and
requires `paths:` on four; one edit to that test is the gate. Four skills
(new-track, scenery-dress, webgl-debug, webgpu-debug) carry a Cursor `paths:`
field that hides them from the Claude Code skill list.

Agents: fold doc-drift-auditor into the total-audit workflow and
worktree-regression-check into verify-agent (`--base`). The five
prohibitions repeated verbatim in every agent file become one line pointing
at AGENTS.md §Verification 3/7 (the write ban is hook-enforced already).

## 4. Deploy

The whole merge cost is one file: `index.html` hashes and `version.json`,
and one build in three collided (34 of 105). Fix the cause, not the merge:

1. **Derive the shell generation in CI.** Keep per-file `?v=<sha256>` (stable
   URLs, V8 cache survives). Stop committing the monotonic build: `pages.yml`
   "Stage site" runs `node tools/ci/bump-cache.mjs --apply` --at $(git rev-list --count HEAD)`
   inside `_site/` and stamps `<meta name="apex-sha">`. Commit count on a
   fast-forward-only branch is integer, monotonic and unique per tip, which
   satisfies the guards in `index.html:86-122` (`v.build <= loaded`) and
   `sw.js:22-36` (safe integer). Every bump commit, re-bump and hash conflict
   disappears (14 of the last 40 deploy-branch commits). Risk: deployed
   `index.html` ≠ committed bytes; `deploy-staging.test.mjs` grows a case
   that runs the stamp against a temp `_site`.
2. **`tools/ci/deploy.mjs`**: fetch → merge (stop on any non-index conflict) →
   tooling-fast → `verify-track` for touched circuits → push, retry ×3 on
   non-fast-forward, refuse at loadavg > 3 or with a live Playwright.
   `--pr` opens/updates a PR into the deploy branch and enables auto-merge,
   so no session pushes to the deploy branch (the permission classifier
   blocked exactly that push today). Note GitHub auto-closes a PR whose head
   is fast-forwarded into the base (#67), so the merge must be GitHub's.
3. **Drop local sweeps from the protocol**: `ci.yml` runs them on the same
   diff; the local run duplicates 10 min.
4. **`verify-live` job in `pages.yml`**: curl `version.json?_=$RUN_ID` from
   the runner (it can reach github.io; the container cannot) until it equals
   the pushed build, else fail. Sessions read the run conclusion via the
   GitHub API. The deploy-research subagent shrinks to shipped-JS marker
   checks.
5. **Gate**: guards + driving-model (or node-fast once §1.2 lands) + ONE
   smoke shard of true boot tests + conditional sweeps ≈ 5 min. Full smoke
   (4 shards), `gpu-census` on macOS, `selected` over 24 h → nightly cron;
   its whole recorded failure history is timeouts, never assertions.
   *Landed 2026-09-01 (unverified until pushed):* `gpu-census.yml` carries
   `schedule: cron "17 3 * * *"` beside `ci.yml`'s boot group; the schedule
   run is the FULL check (`census_only` reads false with empty inputs) on the
   dispatch-default images and track (`inputs.images || '…'`,
   `inputs.track || 'montreal'` restated inline), gated by the same Verdict
   step. The renderer job (§1.4) is deliberately NOT in the gate; the gate is
   as this item describes. `selected` over 24 h is still open.
6. **Collisions**: after `deploy.mjs --pr` is habitual, a ruleset on the deploy
   branch requiring PR + merge queue with `merge_group:` in `ci.yml`.

Typical deploy: ~35–45 min → ~12–18 min session time, Pages ~5–7 min.

## 5. Order of work

| tier | items | effort | saves |
|---|---|---|---|
| A (today, no browser) | §1.1 1–5, §3 key rotation + fallback removal, `.mcp.json` 7 → 3, `test-bg` load refusal | ~2 h | ~35 min/day of false reds; 150 s per edit loop; 9 min per sweeps run |
| B (one PR each) | §4 1–4 (`deploy.mjs`, CI-derived build, `verify-live`), §1.3 groups, docs generation, skill merges | ~2 days | ~25 min per deploy; no more bump churn; docs stop drifting |
| C (the structural one) | §1.2 `game-vm.cjs` + port ~180 tests; renderer specs → macOS job | ~3 days | 1.5–2 h per full run; renderer specs in CI for the first time |

What NOT to do: widen any tolerance or timeout to make a spec pass (the
`BOOT_MS` change is a budget for a measured boot, not a tolerance); run more
than one browser worker on this box; keep both a committed and a derived
build number.
