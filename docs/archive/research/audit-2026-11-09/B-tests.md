# Tests and testing gaps (sibling B)

Verbatim report as received on 2026-11-10 UTC (audit of commit e8082307). Rows that describe unpatched security or gate-bypass detail are withheld from this public repo at the owner's request.

AUDIT tests part 1/2

# AUDIT — tests/ (suite and its gaps) at e80823076a2413edfe4edfd68ce58b5d793b6904

Auditor session: tests slice. Nothing in the repo was changed outside `scratch/` and `artifacts/logs/`; mutation
experiments ran in five throw-away copies outside the repo, now deleted. No browser, no Playwright, no GitHub calls.
Full report on disk in this session's container: `scratch/audit/tests.md`; per-slice reader reports
`scratch/audit/readers/*.md`; mutation results `scratch/audit/mut/batch-N-result.md`.

## 1. Summary

- `tests/` is 1,096 node unit files (15,176 tests), 179 Playwright specs, 79 helpers and about 150 data/fixture
  files. The unit suite is the real gate; the specs run only on CI.
- **Green at this commit, with two load-sensitive exceptions.** A full run of every unit file (one process each)
  gave 15,157 pass, 2 fail, 15 skipped, 2 todo. Both failures are wall-clock budgets that failed at machine load
  ~11 and passed 2/2 when re-run alone (T-60).
- **The suite executes a lot of real code** (636 files run production code, 384 mix execution with source-text
  checks, 42 are text-only), and most behavioural tests are strong. But about 11% of all assertions (8,209 of
  71,700 `assert.*` calls, in 542 of 1,096 files) are regex matches on source text, and those are where it leaks.
- **Mutation testing confirmed the leak.** Of 79 production mutations chosen from the readers' strongest claims,
  55 survived every unit test that was run against them, 21 were missed by the test that claims the behaviour and
  caught only by an unrelated one, and 3 claims were refuted. Survivors include a break of the "arc must not reach
  the driver" physics rule, the safety-car pass watch, "any open menu hides the HUD", and five cases where
  commenting out a production line left its test green.
- **The selection machinery has holes that let a red merge.** For a `js/game.js`-only PR, 11 unit files
  (including `game-vm` and the physics characterization) run on no PR leg; hook-only PRs are classified as docs;
  infra-only diffs select zero specs and pass; 25 geometry sweep files are skipped for editor changes that feed them.
- **Eight of ten flaky-quarantine rows expired** (2026-11-04 and 11-09) and nothing warns. They fail closed, so
  those tests block again, but `ci-watch` still tells an agent a retry pass is allowed.
- **Several tests never run anywhere**: gated on env vars no workflow sets (`APEX_RUNNER_E2E`,
  `APEX_LIVERY_PARITY`, `APEX_CHROME`, `APEX_SHIMMER`, the perf `*_STRICT` gates) or on tools CI does not install.
- Overall: a large, mostly honest suite with a real but bounded class of cannot-fail tests, and a change-aware
  selection layer that is less safe than its docs say. No P0.

Model note: the first 21 unit-slice readers and spec slices 01-02 ran on the session model before the coordinator's
instruction to use Opus arrived (they were minutes from done); every later subagent (spec 03-04, helpers, selection,
all verifiers and all mutation runners) ran on Opus.

## 2. Findings

Row format: `ID | P | kind | file:line | claim | evidence | fix | VERIFIED/UNVERIFIED | NEW/KNOWN`.
"Mutation" evidence means: the production edit was applied in a scratch copy, the cited test file was re-run, then
up to six related unit files. SURVIVED-ALL = nothing run went red.

### 2a. Selection, gating and tooling

T-01 | P1 | tool-gap | tools/ci/node-plan.mjs:243; tools/ci/run-group.mjs:28; .github/workflows/ci.yml:418,1058,1065 | On a PR touching only `js/game.js`, 11 unit files run on no PR leg: game-vm, physics-characterization-vm, real-replay-vm, real-replay-audio-focus, real-replay-broadcast, real-replay-frame-fit, real-replay-transport, red-flag-fuel-vm, redbull-orbit-clear, lockup-bench-vm, session-entry-vm | A simulation built on the real node-plan / pick-unit-slices / tooling-fast modules: `reason matched skipTf true … guards changed matched 112`; `--skip-tf` drops tooling-fast members from vm-b1/b2 on the premise the guards legs ran them, but guards run `tooling-fast --changed` (112 files) | Make `--skip-tf` conditional on guards mode being full, or have the vm-b legs keep any file the guards plan did not select | VERIFIED | NEW
T-02 | P1 | bug | tools/ci/select-specs.mjs:960-977,1480; tools/ci/selected-gate-verdict.mjs:176 | An infra-only diff selects zero specs and the gate passes, though the code comment says it "must fail safe to the full gate" | `node tools/ci/select-specs.mjs --files tools/ci/select-specs.mjs --json` → `"reason":"infra","selected":[],"shards":[]`; same for ci.yml + package-lock.json + playwright.config.js + flaky-quarantine.json; verdict: `"…an empty plan is a pass"`; the step only prints `::warning::` | For `reason === "infra"` select the boot/smoke floor at minimum, or fail closed | VERIFIED | NEW
T-03 | P1 | bug | tools/ci/select-specs.mjs:1481-1484; tools/ci/ci-select-specs-step.sh:50 | Unmatched paths fail closed only when every changed path is unmatched; add any matched file and nothing runs | `--files vendor/three-0.187.0/three.core.min.js,overlay.html,controller.html,bench.html` → `[unmatched] … SELECTION NOT TRUSTWORTHY` (exit 1, can never go green); the same list plus `README.md` → `[matched] -> groups: (none) … selected 0 tests` (green) | Route `vendor/` and the standalone html pages; treat "some paths unmatched" as partial and add the floor | VERIFIED | NEW
T-04 | P1 | bug | tools/ci/change-kind.mjs:11; tools/ci/tooling-fast.mjs:1014 | `.claude/hooks/*.sh` and `.claude/settings.json` are classified docs, so a hook-only PR skips the tests that guard the hooks | `DOCS = [/^docs\//, /\.md$/, /^\.claude\//, …]`; `selectToolingFastChanged(['.claude/hooks/bash-guard.sh'])` → `docs-only 7`, with bash-guard-hardening, cross-tool-guards, pre-commit-guards all `false` although each names the hook | Exclude `.claude/hooks/` and `.claude/settings.json` from DOCS | VERIFIED | NEW
T-05 | P1 | tool-gap | tools/ci/geometry-paths.mjs:86; .github/workflows/ci.yml:2126-2164 | The sweeps trigger does not match inputs the sweep suites load through helpers, so a PR or train changing only e.g. `js/editor/validate.js` runs none of the 25 sweeps-only unit files | `node tools/ci/geometry-paths.mjs --ere` has no `js/editor/`, `js/core/hash32.js`, `js/ui/track-maps.js` or `tests/helpers/`; `tests/helpers/editor-vm.mjs:19,38` loads them for track-themes-build / track-validate-fleet / kerb-berm-surface; `tests/helpers/barrier-runoff-probe.cjs` likewise. (The finder's path `tools/track/barrier-runoff-probe.cjs` was wrong; the helper path is right.) | Derive the trigger from what the suites actually load (the coverage map in §3 can generate it) | VERIFIED | NEW
T-06 | P1 | test-gap | tools/ci/pick-unit-slices.mjs:131 | `tests/unit/physics-characterization-vm.test.mjs` runs on no PR leg when only `js/circuits/monza.js`, `js/track/tracks.js` or `js/car/parts.js` change, although both characterization copies race Monza | Simulation prints NOT RUN for each of the three; for `js/car/parts.js` the plan runs only test:node-slow and test:vm-page-b. (Refuted for `tools/lib/game-vm.cjs`: that path forces run-all.) | Add those paths to the driving slice | VERIFIED | NEW
T-07 | P2 | drift | tests/data/flaky-quarantine.json; tests/unit/flaky-quarantine.test.mjs:66,190; tools/ci/ci-watch.mjs:263,285 | 8 of 10 quarantine rows are expired as of 2026-11-10 (image-grade-visual 11-04; hud-layout x2, garage-out-before-card, parts-livery-zones x2, parts-livery-designs, garage-pick-cost 11-09) and nothing reports it | The loader drops expired rows silently (`flaky-policy.mjs:25`), the unit test pins `new Date("2026-10-16")`, and ci-watch reads raw rows and prints "a retry pass is allowed once". Active rows: hud-mirror (11-15, no `signature`, so any failure message is waived) and session-quit-memory (11-13). All titles still match their specs | Delete or renew the 8 rows per their own `review` text; make the unit test fail on rows expired at the real date; filter ci-watch by expiry; add a signature to hud-mirror | VERIFIED | NEW
T-08 | P1 | test-gap | tests/helpers/perf-frametime.mjs:34; tests/helpers/perf-race-entry.mjs:19; tests/specs/perf-frametime.spec.js:210; tests/specs/perf-race-entry.spec.js:122 | Frame-time and race-entry regressions only fail when a `*_STRICT` env var is set, and nothing sets one | `STRICT = process.env.APEX_PERF_FRAMETIME_STRICT === "1" || …`; `grep STRICT .github/workflows tools/ci package.json` finds no setter | Set STRICT on one scheduled lane, or stop presenting these as gates | VERIFIED | NEW
T-09 | P2 | test-gap | tools/ci/select-specs.mjs:1418,1480 | A `css/hud.css`-only diff runs one spec (css-player-smoke); hud-layout.spec.js is not selected | `--files css/hud.css` → `JOB selected-1: 1 tests … css-player-smoke.spec.js`; `--files js/ui/hud.js` → 14 shards including hud-layout | Route css files through the same group map as their js owners | VERIFIED | NEW
T-10 | P2 | tool-gap | tools/ci/pick-tests.mjs:430-483 | Specs pick-tests names as extras are not consumed by CI's selection: for `js/ui/modal.js`, data-lifecycle, settings-reload and ui-audit are named and run on no PR leg | `pick-tests.mjs js/ui/modal.js` lists 10 extra specs; `select-specs --files js/ui/modal.js --json` schedules 7. (AGENTS.md's "they run on the PR" refers to groups, so the doc line itself is not false.) | Feed `extraSpecs` into select-specs or drop them from the picker's output | VERIFIED | NEW
T-11 | P2 | dead | playwright.config.js:271-287; tools/ci/nightly-group.mjs:35,37,84 | Three specs are run by no routine CI job: webkit-boot (webkit project exists only with APEX_WEBKIT=1; the only workflow that installs WebKit is dispatch-only), ui-audit (only in test:gallery, excluded from the rota) and material-shimmer (`test.skip` unless APEX_SHIMMER) | Code lines as cited | Schedule them or move to tests/manual so counts are honest | VERIFIED | KNOWN in part (ui-audit: docs/TESTING.md:440)
T-12 | P2 | contradiction | docs/VERIFICATION.md:74 vs ci.yml:378-389,418; tools/ci/ready-gate.mjs:69-91 | The doc says the Structural guards legs run the full tooling-fast; the workflow narrows them to `--changed` on PRs that touch no tools/tests/.github/package.json, and ready-gate accepts that green as proof of the tip | Lines as cited; ready-gate has no notion of mode | Fix the doc and have ready-gate read the guards mode | VERIFIED | NEW
T-13 | P3 | correction | tests/groups.json:1434,1440,1461,2139 | "37 specs are in no browser group" (my own first computation) is wrong: group file lists contain globs (`parts-*`, `*-foundation`, `collision*`, `physics-*`); after expansion only material-shimmer.spec.js is group-less | One-off expansion: `specs 179 literal-miss 37 after-glob 1` | None; noted because a naive reader of groups.json will repeat the mistake | VERIFIED | NEW
T-14 | P3 | drift | playwright.config.js:207 | `--retries=0` holds only on the selected legs; every other browser job retries once (`retries: process.env.CI ? 1 : 0`), gated by the flaky reporter | Config line; selection agent's read of ci.yml:2978 | State it in VERIFICATION.md §5 | UNVERIFIED (second reader did not re-check ci.yml) | NEW
T-15 | P2 | tool-gap | tools/check/ratchets.mjs:127 (ASSERT_PIN), :194; tests/unit/overlay-render.test.mjs:47 | The source-pin ratchet does not count the shape `const b = src.includes(…); assert.equal(b, true)`, and at least three test files use that shape on purpose to stay under the ceiling | Comment in the test: `// Booleans computed outside assert.* so assertPinsAll does not count them (tip is at ceiling; this PR must not raise ratchets.d)`. `countPinsAll` does count `ok(/re/.test())` and `doesNotMatch` (that part of the reader's claim was refuted) | Count `includes`/`test` results that flow into an assert | VERIFIED | NEW

### 2b. Unit tests that cannot fail — confirmed by mutation (SURVIVED-ALL)

All rows VERIFIED. All NEW unless marked.

U-01 | P1 | test-gap | tests/unit/gfx-backend-canary.test.mjs:4922 | "the player tows on car positions only" (arc must not reach the driver) only bans the strings `Tracks.curvature`/`kMax` | js/game.js:5359 gate replaced with a read of the static curvature LUT (`track.curv[…] < 0.004`): cited test, curvature-channels, traffic-arc-buckets, physics-rows-vm, world-physics-vm, ai-drive all green | VM test: same car positions on a straight and in a corner with identical input must give identical `c.towing`
U-02 | P1 | test-gap | tests/unit/sporting-regs.test.mjs:241 | Safety-car pass watch predicate checked by word presence | js/game.js:718 `(o.rescueT || 0) > 0.25` → `< 0.25` (every car "stricken", SC/VSC pass penalties and blue flags off): cited + race-flow-vm, collision-contact-vm, flags, red-flag-vm green | Drive a pass under caution in game-vm and assert the warn event
U-03 | P1 | test-gap | tests/unit/pause-hud-layout.test.mjs:54 | "any open screen hides race HUD chrome" matches the selector prefix and four bare selectors | css/hud.css:1798 `visibility: hidden` → `visible`: cited + ui-improve-pass, phone-touch-surface, hud-layout, hud-elements, uilayers-modal-order, hud-survey green | Assert the declaration with css-rules `decl()`
U-04 | P1 | test-gap | tests/unit/dock-layout.test.mjs:173 | "store.subscribe on steerMode reloads that scheme's offsets" fires a listener the test wrote itself | js/ui/dock-layout.js:441-455 whole subscribe block deleted: cited + deep-link, hud-dock-pack, settings-export green. Player effect: touch docks keep the old scheme's offsets after a STEERING INPUT change | Capture and fire the production listener
U-05 | P1 | test-gap | tests/unit/physics-rows-vm.test.mjs:250 | "the overtake scan skips pit-lane and retired cars" is regex only | js/game.js:4782 `_otSkipLane` → `return false`: cited + ot-ahead-scan-gate, overtake-mode, pit-lane-vm, red-flag-pit-vm green | Call `Collide.scanOtAhead` with a car in the lane
U-06 | P1 | test-gap | tests/unit/tyre-model.test.mjs:279 | "the player's top speed pays for worn rubber" matches statement text | js/game.js:4989 `vmax *= trMul` → `vmax *= trMul / trMul`: cited + mechanics-integration-vm, player-dynamics-vm, tyre-strategy-vm, red-flag-fuel-vm green | Compare terminal speed on worn vs fresh tyres in game-vm
U-07 | P1 | test-gap | tests/unit/real-race.test.mjs:651 | Test installs its own `G.endRace` copy of the DSQ branch | js/game.js:2963 `status().watch` → `isWatch()` (a driven JUMP IN race loses published DSQ markers): cited + career-settle, net-authority, sporting-regs, classification-vm, real-replay-vm green | Run the real endRace in a non-watch real race
U-08 | P1 | test-gap | tests/unit/net-lobby-friend-quali.test.mjs:90 | "a paused friend race brakes the car" pins one line | js/game.js:961 `PAUSED_NET_INPUT` `brake: true` → `false`: cited + throttle-latch, net-session green | Step a paused networked car and assert it decelerates
U-09 | P1 | test-gap | tests/unit/flyby-intro.test.mjs:67 | The reduced-motion assertion matches a code comment | js/game.js:3876 added `if (motionReduced()) return false;` leaving the comment: cited + garage-arrival, loading-card, async-lifecycle, garage-prebuild, flyby-shots green | Run the harness with `motionReduced: () => true`
U-10 | P1 | test-gap | tests/unit/ctx-lost-notice.test.mjs:118 | `includes()` over a slice is satisfied by commented-out code | js/game.js:4535 `// GfxEscalation.resetReloadBudget();`: cited + 6 gfx/renderer files green | Seed the session key in game-vm and assert it is cleared at lights-out
U-11 | P1 | test-gap | tests/unit/post-fx-opts.test.mjs:108 | Same shape | js/game.js:8451 `// PostFxOpts.gate(po);` (GRAPHICS AO / GOD-RAYS OFF stops working): cited + 6 files green | Pump one frame with a recording gfx stub
U-12 | P1 | test-gap | tests/unit/race-session-lazy.test.mjs:148 | Retry loop asserted by regex; harness only ever answers "back" | js/game.js:2469 retry `while` wrapped in `/* */`: cited + daily-intro-session-late, session-stub-surface, lazy-bundles-prefetch, garage-arrival green | Add a retry case to `runStartRaceBody`
U-13 | P1 | test-gap | tests/unit/title-warm.test.mjs:119 | Same shape | js/game.js:3537 `// titleWarm.start();`: cited + 5 files green | Assert `titleWarm.state()` advances in the VM
U-14 | P1 | test-gap | tests/unit/quali-persist.test.mjs:243,446 | Same shape (about 30 regexes, two include trailing comments) | js/game.js:2998 `if (settles) {} // if (settles) quali.clear();`: cited + game-round2-vm, race-settings-vm, career-settle, season-cal, race-setup-sheets green | Score a round in game-vm and assert `G.qualiResults()` is null
U-15 | P1 | test-gap | tests/unit/replay-buf.test.mjs:327 | Order-of-strings check never checks the guard returns | js/game.js:2890 `return;` → `Log.info("scrub");` (career round scored mid-scrub): cited + 5 files green | Call `G.endRace()` while scrubbing
U-16 | P1 | test-gap | tests/unit/camera-feel.test.mjs:345 | "snapGameCam is a cut … latched look-back all reset" never calls snapGameCam | js/game.js:2349 `CamFeel.resetLatch()` removed: cited + replay-buf, photomode-hold, free-cam, director, apex-cam-fallback green | Latch, call `G.snapGameCam()`, assert not looking back
U-17 | P1 | test-gap | tests/unit/career-legends.test.mjs:121 | Asserts on `o.team` / `m.team`, fields that do not exist (offers carry `teamId`, moves `from`/`to`) | js/career/career.js:1589 `Teams.isReal(t) &&` removed (Legends can offer a drive): cited + career-settle, career-round2, career-data-audio-improvements, save-migrate, career-backup green | Assert `teamId` and force non-empty offers
U-18 | P1 | test-gap | tests/unit/career-settle.test.mjs:1280 | "ambition moves WHO the rival is" checks only id types | js/career/career.js:691 `+ delta` → `- delta`: cited + 5 career files green | Compare rival ratings across rungs
U-19 | P1 | test-gap | tests/unit/collision-contact-vm.test.mjs:227 | Yaw-blend table tests run a test-local mirror | js/physics/collide.js:51 `YAW_HI` 60° → 45°: cited + contact-geometry, traffic-arc-buckets, damage, collide-wall-limits green | Lift `yawMix` from the source slice already evaluated in the file
U-20 | P1 | test-gap | tests/unit/pit-lane.test.mjs:1581 | "stuck is the nearest car ahead" is regex | js/race/pit-lane.js:1510 `<=` → `>=` (AI undercut latches on the wrong car): cited + ai-strategy, pit-lane-vm, pit-think-cache, tyre-strategy-vm green | Use the file's own `strategySession()`
U-21 | P1 | test-gap | tests/unit/perf-governor.test.mjs:1709 | "sheds render scale … and restores": restore never run | js/perf/governor.js:1233 restore deleted (garage can leave scale at 0.55): cited + perf-sentinel, scale-defaults, garage-perf-mesh-free, thermal-drift green | Begin/End through `raceScaleGov` and assert `[0.55, 1]`
U-22 | P1 | test-gap | tests/unit/rank-sort-alloc-vm.test.mjs:40 | The sort counter only credits calls whose direct caller is `update` | js/game.js:4432 insertion loop → `a.sort(…)` inside `rankByProg`: cited + frame-hotpath-alloc, perf-vm-alloc-budget, perf-hot-bench green | Count any frame below `update`; add a positive control
U-23 | P1 | test-gap | tests/unit/garage-crew-choreo.test.mjs:203 | Compares the clip with the test's own copy of the slide | js/race/pit-lane.js:1670 `0.55` → `0.80`: cited + pit-lane-vm, pit-lane, car-presentation-vm, pit-complex green | Compare against the real `stopAnim().off`
U-24 | P1 | test-gap | tests/unit/meeting-picker-labels.test.mjs:16 | Tests a copy of `js/data/hub.js:703-718` | hub.js:710 `(… || 0) + 1` → `= 1` (duplicate meetings lose the date): cited + 6 data files green | Evaluate the real function text
U-25 | P1 | test-gap | tests/unit/net-lobby-lifecycle.test.mjs:2607 | Guest SETTINGS "rate-gated" assert accepts every reachable outcome (`98 || 5 || 6`) | js/net/lobby.js:668 `&& underRate(settingsTimes)` removed: cited + lobby-settings, fuzz-untrusted-inputs, net-authority, net-seed-sync-vm, net-roster, netplay-resilience green | Count applied settings
U-26 | P1 | test-gap | tests/unit/career-cross-tab.test.mjs:387 and :424/429 | Regexes ignore polarity | js/career/career-ui.js:1747 `!` dropped; js/ui/title-menu.js:260 `!entering` → `entering`: cited + 6 files green each | Press the real BACK handler; fire the real store subscriber
U-27 | P1 | test-gap | tests/unit/ui-sheets-audit.test.mjs:1035 | Regex only | js/race/ceremony.js:54 added `c.finishT = ran;` (0.5 s floor stamp returns on RESULTS): cited + race-ceremony and 5 VM files green | Run finish against cars at the floor and read the sheet
U-28 | P1 | test-gap | tests/unit/scroll-strips.test.mjs:74 | Checks that `touch-action:` exists, not its value | css/carsetup.css:405 `pan-x` → `none` (dead tab strip on a phone): cited + 5 files green | Require `pan-x` / `contain`
U-29 | P1 | test-gap | tests/unit/ui-fit-camtune-tap-r5.test.mjs:15 (same form in ui-fit-flyby-tap-r6, ui-fit-lighttune-tap-r6, ui-fit-lighting-flyby-stack, ui-fit-tap-scroll-round3) | Regex on raw CSS matches commented-out rules | css/tuner.css:1334-1339 rule wrapped in `/* */`: cited + 6 files green | Port to `cssRules` + `decl` as the r7 files already do
U-30 | P1 | test-gap | tests/unit/hud-control-clearance.test.mjs:33; tests/unit/hud-layout.test.mjs:927 | Lazy `[\s\S]*?` crosses the rule's closing brace | css/hud.css:1219 `right:` line deleted from `body:not(.desktop) #hud-sectors` (sector plate back over BOOST on a phone): both cited + hud-feel, hud-fit-idempotent, hud-elements, hud-metrics-layout green | Bound regexes to one rule
U-31 | P1 | test-gap | tests/unit/title-home-scene-prepaint.test.mjs:33-47, :107 | Greedy regexes satisfied by other rules; the only rendering test returns early because `/usr/local/bin/google-chrome` is absent and `APEX_CHROME` is set nowhere | css/menus.css:302 and :410 deletions survive cited + photo-studio, title-layout, title-art, title-fx | Make :107 a Playwright spec or fail when no browser; bound the regexes | VERIFIED | KNOWN for :107 (docs/archive/notes/test-review-2026-10-19/SYNTHESIS.md:73, still unfixed), NEW for :33-47
U-32 | P1 | test-gap | tests/unit/delta-sign-colour.test.mjs:45 | Counts `// >0: … behind` comments | js/data/telemetry-player.js:221 `delta > 0.02` → `delta < -0.02` (trailing driver painted green): cited + 5 telemetry/data files green | Run the paint block with a fake classList
U-33 | P2 | test-gap | tests/unit/crowd-audio.test.mjs:186 | `swell > 0 || bed > 0.01` is true from the bed alone | js/audio/crowd.js:338-342 swell + cheer removed: cited + audio-tune, crowd-ctx-rebuild green | Assert the swell value
U-34 | P1 | test-gap | tests/unit/track-night-override.test.mjs:34 | "no js/track/ module reads def.night" scans js/track non-recursively (5 of 33 files) | js/track/scenery/structures.js:399 `NIGHT ?` → `def.night ?`: cited + source-integrity green | Walk recursively; key the allow-list by relative path
U-35 | P1 | test-gap | tests/unit/light-grid.test.mjs:306 | "every TUNE_DEFS uniform is wired" uses substring `includes` | js/render/webgpu/wgx.js:4169,4702 `PostCommon.knob(T, "tint")` → `0` (WARM/COOL slider dead on WGX): light-grid, gfx-backend-canary, image-grade-shaders, light-presets green | Match on word boundaries and require the upload
U-36 | P2 | test-gap | tests/unit/run-pid.test.mjs:74 | Zombie test returns before its only assert (node reaps the child within the 300 ms wait, 3/3 probes) | tools/lib/deploy-status.mjs:15 zombie check deleted: cited + wait-for, agent-output green | Inject the stat reader
U-37 | P2 | test-gap | tests/unit/tlx-mat-key-memo.test.mjs:50 | Field list omits `carFinish` | js/render/three/tlx.js:2056 `c.cf === !!o.carFinish &&` removed: cited + tlx-hunt3, cockpit-wheel-finish, tlx-rig-warm, gfx-backend-canary, surface-id-parity green | Derive the list from buildMatKey
U-38 | P2 | test-gap | tests/unit/livery-contrast.test.mjs:64; livery-contrast-w13b.test.mjs:32 | "No bad regions" with no proof any region was scored | tools/car/livery-contrast.mjs:40 `AREA_SHARE` 0.15 → 1 (sweep returns nothing): both + fill-gating green | Assert a scored count > 0
U-39 | P2 | test-gap | tests/unit/cvd-palette.test.mjs:121 | Loop over a production-owned list with no floor | js/ui/cvd-palette.js:59 `GROUPS = []`: cited + nontext-contrast, appearance-opts green | Pin the group roster
U-41 | P2 | test-gap | tests/unit/hud-status-stack.test.mjs:35 | Greps hud.js, where `hud-gearbox` appears only in comments | js/ui/hud-radio-lane.js:316 gearbox obstacle dropped (radio card over SPEED/GEAR): cited + 6 hud files green | Put a gearbox rect under the card and call `radioPaintedCollapse`
U-42 | P2 | test-gap | tests/unit/hud-speed-parity.test.mjs:63 | Compares f(x) with f(max(0,x)) | js/car/car-draw.js:1633 `dash * 1.09` (wheel LCD disagrees with HUD): cited + 6 car/cockpit files green | Compare drawn LCD digits with `#hud-speed-n`
U-43 | P2 | test-gap | tests/unit/hunt-tlx-create-undo.test.mjs:30 | Asserts `removes >= 4` and `adds > 0`, never adds ≤ removes | js/render/three/tlx.js:212 added an un-undone `addEventListener`: cited + 6 tlx files green | Assert equality and pair handlers
U-44 | P2 | test-gap | tests/unit/webgpu-menu-warm.test.mjs:103,125 | Tests local copies of `warmPlusOn` and `_resolveWarmWhere` | js/render/three/tlx.js:3448 `return true` → `false`: cited + tlx-hunt4b, tlx-hunt4c, tlx-fx-warm, gfx-backend-canary green | Slice and evaluate the real block
U-45 | P2 | bug (in a test) | tests/unit/webgpu-lifecycle.test.mjs:2280,2303 | A `/g` regex reused with `.test()` keeps `lastIndex`, so the function after a matching one is searched from an offset | js/render/webgpu/wgsl-chunks.js:2245 `let zz = dpdx(1.0);` as first statement of the next `vs_main`: 141/141 green + 4 more files | Drop the `g` flag for `.test()`
U-46 | P2 | test-gap | tests/unit/wgsl-bindings.test.mjs:226 | JS model hard-codes the shader constants | wgsl-chunks.js:786 `0.2501` → `0.10` (hard holes in cloud shadow): cited + 4 files green | Extract constants from the WGSL
U-47 | P2 | test-gap | tests/unit/wgx-shadow-size-source.test.mjs:17 | `includes()` of the original line | js/render/webgpu/wgx.js:3234 added `d[74] = 1 / 2048;` (wrong only on the lite 1024 map): cited + 3 files green | Assert the uniform value in the harness
U-48 | P2 | test-gap | tests/unit/keyboard-first-audio-vm.test.mjs:30; lazy-audio-firstbind-vm.test.mjs:38; tests/unit/fake-audio-vm.cjs:20 | Fake AudioContext is born "running", so "contextState === running" cannot fail | js/audio/engine.js:522 `ctx.resume()` → `null` (the iOS resume-in-gesture): both cited + audio-recovery, audio-panel-boot, lazy-bundles-getcontext, real-replay-audio-focus green | Start the fake suspended | VERIFIED | KNOWN (SYNTHESIS.md:65, unfixed)
U-50 | P2 | test-gap | tests/unit/deploy-stamp.test.mjs:176 | Both asserts test `html.includes(integrity)` on the whole page | tools/ci/bump-cache.mjs:76 preload predicate → `false` (preload loses integrity, Chrome drops it): cited + deploy-staging-build green | Match per tag
U-51 | P2 | test-gap | tests/unit/season-cal.test.mjs:1006 | One regex over game.js | js/game.js:9499 added an unguarded `SeasonCal.save(season)` (a lossy season written back at boot): cited 69/69 + save-migrate, game-vm, career-backup, game-round2-vm, race-flow-vm green | Boot the VM with a lossy stored season
U-52 | P2 | test-gap | tests/unit/lockup-smoke-vm.test.mjs:39 | Message says "every locked frame", assert is `okFrames > 0` | js/game.js:6249 lock term gated above 40 m/s (regex-preserving form): both tests in the file + 6 more green | Assert okFrames equals locked frames
U-53 | P2 | test-gap | tests/unit/vegas-day-strip.test.mjs:53 | All four needles are `//` comments | js/circuits/scenery/vegas.js:652-659 fountain loop deleted, comment kept: cited + scenery-guards, props-tri-ratchet, scenery-grounding, track-validate-fleet green | Build the circuit and assert emitted geometry
U-54 | P2 | bug (in a helper) | tests/helpers/mini-dom.mjs:124,175 (77 importers) | `removeEventListener` of a never-registered function deletes the LAST registered listener (`l.splice(l.indexOf(fn), 1)` with -1) | Node demo: add a, b; remove(never) → `[a]`. With production mutated to remove the wrong reference (js/editor/canvas.js:790, js/editor/profile.js:387), designer-canvas and designer-profile "destroy removes every input subscription" still pass | Guard `indexOf >= 0`
U-55 | P2 | test-gap | tests/unit/import-hardening-apxc1.test.mjs:82 | Title claims a gate the test cannot reach; the gate is dead code | js/camera/offsets.js:635,646: `MAX_DECODED_BYTES == MAX_SHARE_CHARS`, so both checks are unreachable (mutation is equivalent) | Remove the dead checks or lower the cap | VERIFIED (as dead code, not as a hole) | NEW

### 2c. Tests blind to their own claim, caught only by an unrelated test (WEAK-TEST-ONLY)

One row; all VERIFIED by mutation, NEW, P3 (the behaviour is covered, the named test is not the one covering it, and
several kills are incidental). cited test → actual killer:
W-01 | P3 | test-gap | perf-governor.test.mjs:1061 → perf-sentinel; steer-lock-taper.test.mjs:26 → low-speed-lock; speed-coupling.test.mjs:60 → player-dynamics-vm (incidental); tyre-squeal-race-vm.test.mjs:52 → lockup-smoke-vm (a regex pin, so the 0.10 rad squeal onset has no behavioural test at all); tyre-peak-slip.test.mjs:38 → player-forces; camera-defaults.test.mjs:796 → render-final-contracts; camera-ride.test.mjs:323 → cockpit-wheels; ui-journey-career.test.mjs:109 → career-backup; uilayers-modal-order.test.mjs:148 → menu-a11y-audit (incidental TypeError); a11y-loading-hint.test.mjs:52 → loading-card; stand-curve-gap.test.mjs:45, bahrain-grandstand-rake.test.mjs:73 and scenery-guards.test.mjs:281 → props-tri-ratchet / prop-clipping baseline staleness only (no test checks terrace gaps, "bahrain has grandstands" or one-tree-per-spot directly); ship-filter-paths.test.mjs:32 → ci-ship-filter-geometry; render-effective-res.test.mjs:19 and renderer-soft-lifecycle.test.mjs:309 → gfx-backend-canary; radio-voice.test.mjs:165 / radio-duration.test.mjs:57 → pause-hud-layout; hud-status-stack.test.mjs:35 (tick call) → hud-announce-lane-cache, hud-pins; factory-ai-setup.test.mjs:28 → career-ai-dev; gfx-backend-canary.test.mjs:4246 → loop-health; audio-recovery.test.mjs:272 → wake-lock-vm | see batch result files | Retitle or delete the blind test; where the kill is a ratchet, add the direct assertion

Refuted by mutation (dropped): net-grid-separation.test.mjs:105 (killed, though only because the fixture is reversed);
barrier-runoff-jumps.test.mjs:90 (the file's fleet tests build production and catch it); import-hardening (U-55, dead code).

### 2d. Tests that never run

N-01 | P2 | test-gap | tests/unit/twinned-specs.test.mjs:161 | Skipped unless `APEX_RUNNER_E2E=1`; set nowhere in .github, tools or package.json. It is the only executed check that an empty Playwright run does not report a pass | grep; unit run shows 1 skip | Extract the verdict into a pure function and test it | VERIFIED | KNOWN (test-review-2026-10-19 tooling-5.md:76, unfixed)
N-02 | P2 | test-gap | tests/unit/livery-tier.test.mjs:521 | Skipped unless `APEX_LIVERY_PARITY`; set nowhere; js/car/car-draw.js:691 cites it as the texel-parity contract | grep; 1 skip in the run | Run it in one lane or delete it and the citation | VERIFIED | NEW
N-03 | P2 | test-gap | tests/unit/slider-effect.test.mjs:137,352,376 | Skipped without Pillow/numpy; no workflow installs either (they ran in this container) | grep of .github for pip/Pillow/numpy/setup-python: none; runner image contents not checked | Install in CI or fail when `CI` is set | VERIFIED by grep, runner image UNVERIFIED | NEW
N-04 | P2 | test-gap | tests/unit/shader-validate.test.mjs:63-86; tests/unit/workflow-lint.test.mjs:29-47 | 8 tests skip without glslang/naga/actionlint/zizmor; `APEX_REQUIRE_LINT_BINS=1` is set only in the `lints` job (ci.yml:747), which is itself conditional (`if: inputs.fast_tier_run == ''`, ci.yml:742) | 8 skips in the run; ci.yml lines as cited by two readers, not re-checked by a verifier | Report the skip in the tooling-fast summary | UNVERIFIED (ci.yml condition) | NEW
N-05 | P2 | test-gap | tests/unit/agent-config.test.mjs:824-848 and :694 | The `claude plugin validate` test always skips in cloud containers (its own comment) and CI has no CLI; the agent-memory test returns early because its directory was deleted 2026-11-03 | 1 skip in the run; reader's read of :694 | Delete the dead test; count the validator as not covered | UNVERIFIED (:694) | NEW
N-06 | P2 | test-gap | tests/unit/announcer.test.mjs:604,611 | Two `todo` tests park live player-facing defects: no Baku night line, and js/data/circuit-lore.js:159 ships "Turn eight … lasts most of a minute" for Istanbul | 2 todo in the run; lore line read by the reader | Track with an owner; they are invisible in a green suite | UNVERIFIED (lore line not re-read) | NEW
N-07 | P3 | test-gap | tests/unit/frame-hotpath-alloc.test.mjs:150 | GC microbench returns unless `globalThis.gc` exists; no runner passes `--expose-gc`; it also tests closures defined in the test | reader + grep | Delete or drive the real `cullInstances` | UNVERIFIED | NEW
N-08 | P3 | dead | tests/manual/tracks-visual.spec.js:18 | Whole-file `test.skip(true)`; baselines never generated | reader | Delete or generate | UNVERIFIED | KNOWN (DEFECT-LEDGER.md:2656 OPEN)
Other skips seen in the run, all conditional and legitimate here: changelog-fragments (no base ref locally), evaluate-scope-lint (commit absent from the shallow clone), physics-baseline-provenance (shallow boundary), test-observed (no reporter log).

### 2e. Playwright specs (read only; all 15 rows re-checked by an independent reader, none refuted)

S-01 | P1 | test-gap | tests/specs/parts-livery-contrast.spec.js:77-83 | "legible by ink or halo" takes the max over a fixed near-black/near-white pair, which is ≥ 4.23 for every background | `Math.max(ratio(ink, bg), ratio(halo, bg))` with `D = [0.06,0.06,0.08], L = [0.97,0.97,0.98]`; a node sweep gave a minimum of 4.2307 against a 4.2 threshold | Assert the ratio of the ink actually chosen | VERIFIED | KNOWN in part (test-review-2026-10-19 lists :34 as re-implementation)
S-02 | P1 | test-gap | tests/specs/collision-ai-fixes.spec.js:306 (and its twin tests/unit/collision-ai-fixes-vm.test.mjs:223) | "AI carry banked-corner speed" measures AI launching from the grid in both runs: `__apex.reset()` calls `gridUp()` and moves only the player (js/agent/apex.js:2093-2113); threshold is `banked > flat * 0.5` | Code as cited ("no AI reaches frac 0.65" is inferred, not measured) | Place AI on the bank with `aiPlace` | VERIFIED | NEW
S-03 | P1 | test-gap | tests/specs/elevation-tracks.spec.js:306-314,375 (40 per-circuit tests) | "gravity never pushes past top speed" starts the descent at ~41-45 m/s; the cap `vmax * 1.06` (js/game.js:5593, ≈76 m/s) is never reached | FLAT_LAUNCH = 40; 150 steps add at most ~26 m/s | Start at `physState().vmaxNow` | VERIFIED | NEW
S-04 | P1 | test-gap | tests/specs/hud-layout.spec.js:637-664 | The test waits 400 ms for a re-fit that cannot happen: the page is frozen and `fitHud`'s only caller returns early when `G.frozen` (js/ui/hud.js:1814,1860) | Code as cited | Force a fit and wait on `--hud-fit-stamp` | VERIFIED | NEW
S-05 | P1 | test-gap | tests/specs/hud-layout.spec.js:1658-1711 | The "second fit ran" predicate ends `(zTop === prev.zTop || zTop !== undefined)`, always true; `invalidateFit()` only sets a flag | Lines 1702; js/ui/hud.js:2308-2320 | Same as S-04 | VERIFIED | NEW
S-06 | P2 | test-gap | tests/specs/career.spec.js:136-148 | Assigns a property on the in-memory save and then reads localStorage; no save path runs (the test still fails if starting a career rewrites the free-play key) | js/agent/apex.js:1061; js/career/career.js:143 | Fit through the career garage UI | VERIFIED | NEW
S-07 | P2 | test-gap | tests/specs/car-effects.spec.js:82-101 | Brake-glow / exhaust-flame asserts read values the `__apex` hook computes itself (apex.js:2013-2017); the draw has its own thresholds (car-draw.js:1932, 2087) | Code as cited | Share one threshold or report a draw-side flag | VERIFIED | NEW
S-08 | P2 | test-gap | tests/specs/parts-budget.spec.js:215-222 | "unlimited mode hides budget fill bar" passes with nothing bought: both branches give `scaleX(0)` (setup-sheet.js:644) | Code as cited | Buy a part first | VERIFIED | NEW
S-09 | P2 | test-gap | tests/specs/menu-survey.spec.js:63-74 | `cycleTo` sets the select's value itself and the test asserts the label it just selected | Lines 67,72 | Assert the stored setting / body class | VERIFIED | NEW
S-10 | P2 | test-gap | tests/specs/props-over-road.spec.js:116-117; tests/specs/interlagos-foundation.spec.js:93-109 (same shape in several foundation specs and new-hooks.spec.js) | Missing geometry or all-null probes report a clean result: `continue` then `max: 0`; `Math.max(...[])` is -Infinity ≤ 0.18 | Lines as cited. Whether the probes are in fact null on today's builds was not measured | Assert a minimum sample count | VERIFIED (shape) | NEW
S-11 | P2 | test-gap | tests/specs/time-trial.spec.js:428-456 | `flashed` is computed and never asserted | Lines 452-456 | Assert it | VERIFIED | NEW
S-12 | P2 | test-gap | tests/specs/hud-mirror.spec.js:231-248,430 | For TLX, `requirePixels` is false and the upside-down check runs only `if (bands)`; a null capture skips it (the header says this backend shipped upside down on 2026-10-13) | Lines as cited | Require bands on the software path | VERIFIED | NEW
S-13 | P2 | design | tests/helpers/fixtures.js:133,143,146,256 | About 201 specs run with GLX pinned, tyre wear off, wind off and the McLaren seat; the product ships TLX, wear and wind on. The choice is documented in the helper, but a TLX-only regression is out of reach of every spec except tlx-probes and the perf legs (whose "TLX WebGPU" leg falls back to WebGL2 on CI, perf-boost-press-pipelines.spec.js:36) | Helper lines read directly | Run one representative shard per domain on the shipped default | VERIFIED | NEW
S-14 | P3 | design | 24 spec files, 73 `waitForTimeout` calls (plus 6 in helpers); worst: ui-button-touch 10, menu-survey 10, gamepad 6, season 6, ui-scale 5, dev-tools 4 (one inside a helper used by ~25 tests) | grep count | Replace with waits on state | VERIFIED (count) | NEW
S-15 | P3 | design | Pixel asserts are rare and weak: only menu-baseline.spec.js uses snapshots (2 calls); tlx-probes, vr-emulated, instanced-draw and parts-catalog treat "PNG larger than N bytes" on a software render as non-blank | readers + grep | Use `frameContent(...).nonblank` on the presented canvas | UNVERIFIED (byte-size cases not re-checked) | NEW

### 2f. Run results

T-60 | P2 | test-gap | tests/unit/game-vm.test.mjs ("boot and track build do not hang"); tests/unit/perf-hot-bench.test.mjs ("monza hot functions stay within the hang ceiling") | Both failed in the full run at load ~11 (`boot 3039 ms + track 14628 ms`; `step 16.417 ms/call (cap 9.978 …)`) and passed 2/2 re-run alone. By AGENTS rule 9 a pass that needed a retry is a red; these are wall-clock asserts in the unit tier | Logs: `artifacts/logs/audit-unit/{game-vm,perf-hot-bench}.test.mjs.log` and `.rerun1/2.log` | Scale the budgets by load (perf-hot-bench's cap evidently does not scale enough) or move them to a serial lane | VERIFIED | NEW
T-61 | P3 | perf | Slowest unit files in the run (under shared load): elevation-tracks-vm 759 s, adapted-specs 577 s, race-flow-fixes-vm 538 s, cover-legibility 431 s, coplanar-faces 405 s, track-themes-build 353 s. race-flow-fixes-vm repeatedly exceeded 200 s for the mutation runners | `artifacts/logs/audit-unit/_results.ndjson` | — | VERIFIED | NEW

### 2g. Remaining reader findings (not independently re-checked)

The 26 readers recorded 486 findings (27 rated P1, 229 P2, 230 P3). About 105 of the strongest were mutation-tested or
re-read as above. The remaining ~370 are UNVERIFIED and stay in `scratch/audit/readers/<slice>.md`, each with file:line,
quoted code and a proposed mutation. Recurring shapes, by count of files flagged WEAK or VACUOUS (112 of 1,096 unit files):
source-text word-presence under a behavioural title; CSS regexes not bounded to a rule; test-local re-implementation;
loops and `if` blocks that can run zero times with no floor; either-branch asserts; constants restated in the test.
Notable unverified P2s worth a look first: `tests/unit/car-materials.test.mjs:59,135` (three-backend shader parity is
regex and "the number appears somewhere in the file"); `tests/unit/curvature-channels.test.mjs:57` (the arc-rule guard
is a per-file call count); `tests/unit/apex-tools-mcp.test.mjs:1016` (schema conformance runs against the mock);
`tests/unit/environment-json.test.mjs:138` (unlinks `/usr/local/cargo/bin/node` on the real machine during the test);
`tests/unit/skill-progressive.test.mjs:579` (requires a skill to name `bloat-auditor`, an agent that no longer exists);
`tests/unit/no-bare-console.test.mjs:20` (stale allow-list entry for js/net/nostr.js).
Helpers: `tools/lib/game-vm.cjs:174-234` and mini-dom auto-create any element id, so a renamed DOM id cannot fail a
unit test (UNVERIFIED). Orphans: `tests/data/frame-lights.pre-viewlights.txt`, `tests/fixtures/stop-hook-git-check.sample.sh`;
dead helper code in `tests/helpers/track-helpers.js` (describeTrack and six helpers) (UNVERIFIED).

(continues in part 2/2: coverage map, audit coverage, what could not be checked)

AUDIT tests part 2/2

## 3. Coverage map (js/ and tools/ → unit tests that execute them)

Method: every unit file was run a second time under `NODE_V8_COVERAGE` (one process each) and reduced to
per-source-file function hits. 1,095 of 1,096 files were measured; `track-themes-build.test.mjs` had not finished
when the map was cut. The map counts a test as *executing* a file only if it called at least one function beyond the
top-level script. Machine-readable result: `scratch/audit/coverage-map.json` (per file: lines, tests that load it,
tests that execute it, best single-test function coverage, and the list of executing tests); text summary:
`scratch/audit/coverage-report.txt`. Two limits: (1) 559 unit files evaluate lifted source slices through
filename-less `vm` scripts or `new Function`, which V8 cannot attribute, so execution through that route is not
counted; (2) function offsets differ between harnesses, so the percentage is "best single test", a lower bound on the
union, not the union itself. Browser specs were not measured.

**js/ (612 files, 302,081 lines).** Almost everything is at least executed by the unit tier: the game-VM harness
(`tools/lib/game-vm.cjs`) boots the whole manifest, so ~134 tests execute most files. That is breadth, not proof:
section 2b shows executed lines whose behaviour nothing asserts.
- Never loaded by any unit test (2): `js/render/webgpu/wgsl-fx.js` (549 lines, the WGX particle/FX shaders),
  `js/render/webgpu/wgx-roadlut.js` (181).
- Loaded, no function ever called (2): `js/lighting/presets.js` (7,251 lines of preset data), `js/car/crest-paths.js` (86).
- Executed by one or two tests only (25 files). By size: `js/render/webgpu/wgsl-chunks.js` (2,707 lines, 2 tests, and
  those are largely regex over the shader text, see the unverified webgpu-lifecycle findings), `js/editor/designer.js`
  (2,477, 1 test), `js/render/webgpu/wgsl-post.js` (1,483, 1), `js/camera/flyby-editor.js` (667, 1, 40% of functions),
  `js/render/webgpu/wgx-shadow.js` (565, 1), `js/camera/tuner-panel.js` (520, 1, 38%), `js/data/api-transport.js` (513, 2),
  `js/xr/xr-session.js` (491, 2, 49%), `js/data/live.js` (443, 2), `js/data/export.js` (349, 1, 40%),
  `js/perf/gfx-debug-overlay.js` (306, 1), `js/render/webgpu/wgx-post.js` (210, 1).
- Widely loaded but shallow (best single test calls under 40% of the file's functions), ranked by player-facing
  weight: `js/agent/apex.js` (76/238 functions; the `__apex` surface every spec depends on), `js/physics/debris-world.js`
  (19/67), `js/ui/photo-studio.js` (21/95), `js/ui/hud-arrange.js` (8/53, the HUD arrange editor), `js/ui/experience.js`
  (24/62), `js/net/rendezvous.js` (13/44), `js/net/handshake.js` (8/28), `js/net/sdp.js` (2/18), `js/ui/title-flow.js`
  (7/23), `js/ui/home-world.js` (8/25), `js/garage/setup-trials.js` (9/31), `js/car/crest-draw.js` (13/34),
  `js/render/shared/puddles.js` (2/11), `js/perf/soak-run.js` (3/16), `js/ui/editor-workspace.js` (5/13).
- Largest files by lowest best-test function coverage: `js/agent/apex.js` 32%, `js/input/input.js` (2,631 lines) 52%,
  `js/career/career-ui.js` (1,821) 53%, `js/car/car-draw.js` (2,233) 64%, `js/audio/engine.js` (3,301) 67%,
  `js/render/glx/glx.js` (2,893) 71% from only 13 executing tests.
- Input is the thinnest player-critical area relative to the owner's setup (phone, touch): `input.js` at 52% and the
  touch dock refresh hole in U-04.

**tools/ (505 files, 123,023 lines).** 79 files are never loaded by a unit test and 35 are loaded without any
function being called; most are probes, census and shot tools that need a browser. Among the files that gate or
drive CI (`tools/ci`, `tools/check`, 126 files):
- Never loaded: `tools/ci/js-debugger-smoke.mjs`, `tools/ci/debug-unit.mjs`, `tools/check/ai-tactics.mjs`,
  `tools/check/ai-strategy-census.mjs`, `tools/check/brake-cue-calibrate.mjs`.
- Loaded but no function called: **`tools/ci/run-playwright.mjs`** (290 lines; the Playwright runner whose pass/fail
  verdict CI reads, and whose only executing test is the never-run N-01), `tools/ci/spec-staleness.mjs`,
  `tools/check/offline-precache-check.cjs`, `tools/check/check-physics.mjs`, and the `tools/check/ai-*.mjs` family
  (ai-band, ai-field, ai-human, ai-line, ai-pace, ai-race, ai-stuck, defend-duel).
- Under half of functions called: `tools/ci/prune-branches.mjs` (17/36), `tools/check/shader-validate.mjs` (8/18).
The selection tools themselves (pick-tests, select-specs, tooling-fast, node-plan, pick-unit-slices) are executed by
their tests; their holes (T-01..T-06) are logic the tests do not ask about, not unexecuted code.

C-01 | P2 | test-gap | tools/ci/run-playwright.mjs | The runner that decides whether a Playwright group passed has no executing unit test; its verdict line is checked by regex (tests/unit/twinned-specs.test.mjs:152) and by a test that never runs (N-01) | coverage map: loaded by tests, 0 functions called | Extract and unit-test the verdict | VERIFIED | NEW
C-02 | P2 | test-gap | js/render/webgpu/wgsl-fx.js; js/render/webgpu/wgx-roadlut.js | Not loaded by any unit test (WGX is opt-in, so player exposure is low) | coverage map | Add to the WGX harness or accept and record | VERIFIED | NEW

## 4. Coverage of this audit

- **Read in full by a subagent:** all 1,096 unit test files plus `fake-audio-vm.cjs` (21 slices), all 179 specs
  (4 slices), all 79 helpers, tests/manual, tests/unit/fixtures, and the selection tools, workflows and their pinning
  tests listed in the selection brief. Each reader reported its file count as equal to its slice size.
- **Run:** every unit file once in isolation (results above); every unit file a second time under V8 coverage (1,095 of 1,096 measured);
  79 production mutations; the selection tools against dozens of hypothetical diffs.
- **Sampled:** tests/fixtures and tests/data were surveyed for consumers, not read line by line; the 263 KB vendored
  IWER bundle was read by header only. Mutation and re-reading covered about 105 of the readers' strongest claims, not all 486.
- **Not reached:** Playwright specs were not run (by instruction), so every spec finding is from reading. CI history
  was not consulted, so "passes only on retry" is known for this container only, not for CI.

## 5. Wanted to check and could not

- Whether the env-gated tests (N-03, N-04) run on the real CI runner image: needs a look at a CI log or the image.
- Whether the specs' null-probe and missing-geometry branches (S-10) are actually taken on today's builds: needs a browser.
- Function coverage from the browser tier: the map in §3 is unit-only, so files listed as never executed may still be
  exercised by specs on CI.
- 559 unit files evaluate lifted source slices through filename-less `vm` scripts or `new Function`; V8 cannot
  attribute that execution to a file, so §3 understates coverage for code tested that way.
- The remaining ~370 reader findings (§2g) were not second-checked for lack of time; they are marked UNVERIFIED rather than dropped.
- The required-check name (`gate` in docs vs `CI` in ci.yml/merge-gate comments) was not checked against the live ruleset (no GitHub calls).

Status: all subagents and both unit passes have finished; nothing is still running, so there will be no addendum. The repo working tree is clean (`git status` shows nothing outside ignored scratch/ and artifacts/).

