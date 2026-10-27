# Unit tests 09: complete read ledger

Read 2026-10-27 at HEAD `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. Scope: group 09 in `docs/project-map/unit-batches.json`, 24 files, 4881 lines. All setup, comments, test bodies, assertions and cleanup read in bounded nontruncated chunks. Initial combined truncated responses were replaced by bounded reads. No tests, browser sessions, production edits or commits were run for this mapping.

AGENTS.md and `.claude/skills/code-nav/SKILL.md` read. Production bindings below come from explicit imports/source loads and bounded LSP definitions, not inferred nonexistent files. LSP resolved RaceControl.classify to js/race/race-control.js:190–205; TrackMaps.aspect to js/ui/track-maps.js:209–218; ApexClipboard.write to js/core/clipboard.js:62–74; CockpitFinishes.view to js/camera/cockpit-finishes.js:34–49; CarMesh.getCockpitWheel to js/car/car-mesh.js:1183 (body excerpt 1183–1222, remainder not read by this query); DrivingCoach declaration to js/race/driving-coach.js:3 (bounded module excerpt only). These are navigation evidence, not complete production-file reads.

## Full file ledger

| File | Lines / full read range | SHA-256 |
|---|---|---|
| `tests/unit/ci-pages-train.test.mjs` | 395; 1–395 | `d768948b479e5280f52a28b4e7e8c8f804a251e15988b190738e246fe2fd74d0` |
| `tests/unit/ci-pr-base.test.mjs` | 150; 1–150 | `84a8e47216bdc246850b3a947863d8cc3698d61e5a8aeb54b137f40ebb28cab5` |
| `tests/unit/ci-ship-filter-geometry.test.mjs` | 351; 1–351 | `cbeb156cbf0a050d8ce6fe146d4c0c1d34b6dd0037e83397a0ea6b714853c6ea` |
| `tests/unit/ci-ship-smoke-renderer.test.mjs` | 433; 1–433 | `9f45dc28d843a5f49839fa66aeeceee9d63a050d4012500151860d8cf88d720c` |
| `tests/unit/ci-verdict.test.mjs` | 155; 1–155 | `6160f39e457074d2cf805c85a0af442c1a8a24befa15ea607bc345f1ee16bd32` |
| `tests/unit/ci-watch.test.mjs` | 606; 1–606 | `afdf2ad2f770115c507753114aa9e47935193fe1652cce46e3a79e3ddb875de1` |
| `tests/unit/ci-workflow-triggers.test.mjs` | 369; 1–369 | `9dd8ed65aac4b3716f918565db0e1862f547435f0e47782a027ba9cf56993331` |
| `tests/unit/circuit-axis.test.mjs` | 87; 1–87 | `6520c16b63298c58c2341f4277eeff73cfe4f081e722ace009886e4b49cc0453` |
| `tests/unit/circuit-corner-anchors.test.mjs` | 99; 1–99 | `d25deeeab00e105e3911ef41e49de03b28f0518343bc49bdb6c19437be11a7a5` |
| `tests/unit/circuit-count-shell.test.mjs` | 34; 1–34 | `281f839f070e22e1a36a1096284e49fc420a96f3639bc659011d90b4f48e29f8` |
| `tests/unit/circuit-def-fields.test.mjs` | 430; 1–430 | `7cc178cacccaad4e8d3e393419e41ed3e8231e8bf56e05be76d76c30f4651394` |
| `tests/unit/circuit-meta.test.mjs` | 46; 1–46 | `f95b54f2548c71794cbea69ca5dc65cd63311d3db9a2cf030a90b0e046439b21` |
| `tests/unit/circuit-scope.test.mjs` | 103; 1–103 | `36d31fe3ccfafad5f5b46c440dc5c6b497f5530eeb267d7cd2d9613d54b039d0` |
| `tests/unit/circuit-vocab.test.mjs` | 124; 1–124 | `c9cb9a5077c75a565637f51e6e4652e3e9469d510b6e631dcb534a5c97a03e41` |
| `tests/unit/class-usage.test.mjs` | 49; 1–49 | `df81b2976c5d968e793e0122f4b08482d751fb1eb702ea0a277df92023de7662` |
| `tests/unit/classification-vm.test.mjs` | 384; 1–384 | `da54410a5a01af692c0e69c37cc3f31c36e7a761d4856865e85be6a4e1238a8b` |
| `tests/unit/cli-args.test.mjs` | 108; 1–108 | `2fdc4abc7226d4ebd39c97c72175a7e30af0c344d54ec6e98826b1ad1929e713` |
| `tests/unit/cli-only-ids.test.mjs` | 48; 1–48 | `b99b1dc1614d63b92b079a26e182371147d8196670dab457877396be74b81cee` |
| `tests/unit/clipboard.test.mjs` | 121; 1–121 | `e6135eb69ee21c88437a9db11a6cf075c2ea72ea15bd01672620faedcce4aefc` |
| `tests/unit/coach-clone.test.mjs` | 81; 1–81 | `01ce7a66f673bc2c7e627f296bcf2b69f11abaf4eb08feba597f6fce9cb49cc2` |
| `tests/unit/cockpit-crest-stripe.test.mjs` | 111; 1–111 | `a486ed01f7f995ab49c183f579c00874a430803138690f1973c314c5b77fd0b2` |
| `tests/unit/cockpit-pale-surfaces.test.mjs` | 234; 1–234 | `b3f068515d466bb0d30037eb61d53e9da3f8508bfc948dffc7c006a2fc7beaba` |
| `tests/unit/cockpit-preview.test.mjs` | 122; 1–122 | `b017226fb9345a0d51160b346be36f3ceab81c8966eb5d1b3416db7846195c04` |
| `tests/unit/cockpit-wheel-finish.test.mjs` | 241; 1–241 | `c008d956d5fc1487898f39544b6974037f14f15d1dbce679fc76b8081c5d94f1` |

## Case contracts and assertion source spans

Rows identify every test declaration template, including parameterized loops. Contract wording follows the source title and is constrained by each file’s fixture and limits; it is not a pass result. Spans identify complete assert calls, including predicate callbacks, not just names. There are 204 declaration templates. Parameter loops include sixteen clone values, three clipboard selection-failure steps and three invalid-id CLI tools; other within-case matrices are described in fixture notes. Assertions outside cases are listed separately. Temporary fixture file names, fake repositories/URLs, placeholder refs/SHAs and synthetic app/notes directories are test data, not claims that those repository paths or network resources exist. No network URL is reproduced here.

### ci-pages-train

Targets: CI/Pages workflow slices via tests/helpers/ci-workflow.mjs; real pages-publishable.sh and pages-reuse-verdict.sh; desktop stage-files.mjs; Chromium composite action and spec-timings.yml.

Fixture: Workflow regex/YAML checks plus disposable Git A→B→C ancestry and two-parent same/different-tree merges. PATH curl/gh stubs supply live SHA, runs and job conclusions; reverted gate-input history is constructed. Assertions include reuse provenance and exact stdout fields.

Limits: Source spelling and simulated Git/API behavior; no GitHub scheduling, actual network, staged browser boot or deploy. Reuse fixtures include missing job records, reused-only Pages passes, fast-tier pushes, failure/cancelled/wrong workflow/self/API failure.

| Case body | Contract | Assertion spans |
|---|---|---|
| 15–18 | no workflow demotes the change-aware gate to advisory | 16, 17 |
| 20–67 | one CI run per branch head: push and pull_request share a group, manual runs keep their own | 40–41, 42–43, 44, 45–46, 51, 59–60, 62, 64, 65–66 |
| 69–125 | a Pages run publishes EXACTLY the commit it tested, and never moves the site backwards | 81–82, 83, 84–85, 86–87, 89, 94–95, 97–98, 99, 100–101, 103, 104, 105, 115, 116, 120, 121–122, 123–124 |
| 127–157 | pages-publishable.sh returns true for forward ancestry, unreadable live shell or missing provenance; false for same/newer/unrelated live SHA | 150, 151, 152, 153, 154, 155 |
| 159–181 | a Pages run reuses a gate that already passed on the SAME tree, and only then | 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178–179, 180 |
| 183–312 | same-tree completed full gate returns reuse/source/run; changed-and-reverted gate inputs, fast-only/reuse-only/missing/failed/cancelled/self/wrong-event or wrong-workflow evidence refuse reuse | 200, 201, 213, 259–260, 261–262, 263, 265, 268, 269–270, 275–277, 282–284, 285–286, 288–289, 290–291, 292–293, 294–295, 296, 297–298, 299, 300, 301, 302, 303, 304, 305–306, 307–308, 309, 310 |
| 314–332 | workflow contents-read baseline; deploy alone holds Pages/OIDC writes; every other job declares token limits; timings dependency setup follows successful junit fetch | 318, 319, 322, 323, 324, 330, 331 |
| 334–359 | every ROOT html page is named in the Stage site whitelist | 346, 351–352, 355–358 |
| 361–383 | cached browser jobs never enter apt through --with-deps | 367, 368–370, 371, 372–373, 378, 379, 382 |
| 385–395 | ship filter chooses a successful active deployment, not merely the newest record | 389, 390, 391, 392, 393, 394 |

### ci-pr-base

Targets: tools/ci/ci-pr-base.sh, ci-resolve-before.sh, reuse-draft-fast.sh; ci.yml ratchet shell; tools/check/ratchets.mjs and tools/hooks/ratchet-reason.mjs.

Fixture: Disposable real Git merge with stale event base versus moved first parent; copied real ratchet tools and 100→200→250 ceilings; fake gh run/date/jobs for draft reuse.

Limits: Calls extracted workflow shell locally, no remote PR or Actions. The repeated select-job regex checks establish occurrence in that slice, not that every individual renderer/XR step invokes it.

| Case body | Contract | Assertion spans |
|---|---|---|
| 22–47 | a merge checkout answers its first parent; anything else echoes the fallback | 31, 32, 40, 41, 42, 43 |
| 49–61 | every workflow step that diffs a pull request resolves its base through the helper | 52, 53, 55, 56, 58, 59–60 |
| 63–110 | Structural guards ignores ship ceiling raises but still rejects a PR raise | 68, 94, 95, 96, 99, 100, 101, 105, 106 |
| 112–150 | 15-F5: a green draft run is reused only while the base branch has not moved since it started | 132, 133, 135, 136, 138, 139, 145, 146, 147, 149 |

### ci-ship-filter-geometry

Targets: ci.yml select shipfilter/geometry and sweeps-roll-up/ci-verdict; tools/ci/queue-depth.mjs hasCiRunMarker; real geometry router/package suite list; reuse-draft-fast.sh.

Fixture: Real Git docs/code/smoke branches, unpublished base and synthetic PR merges; fake deployments curl. Geometry uses fake git diff. YAML predicates evaluated by shared evalTemplate against body-marker/label/draft/ready/edit cases; Bash rollup result matrix.

Limits: Subset expression evaluator fixes cancelled=false/success=true and JS equality, not full Actions engine. Orphan-shell citation test searches tracked text references, not execution/reachability. No remote runners.

| Case body | Contract | Assertion spans |
|---|---|---|
| 15–92 | ship-filter: a ready PR skips smoke only when neither its own diff nor its base ships anything new (C2a) | 17, 59, 66, 67, 69, 70, 72, 73, 74, 76, 77, 80, 81, 82, 84, 86, 87, 88 |
| 95–138 | ci.yml runs on PRs into the deploy branch only, and a label event other than run-ci on a draft runs nothing | 99–100, 101, 102, 108, 111, 112, 118, 122, 123, 126, 127, 129, 131–132, 135, 136–137 |
| 143–225 | a CI: run body line opts a draft into the fast tier exactly like run-ci, and a body edit starts it only once | 168, 169, 171, 172, 176, 177, 179, 182, 183, 188, 189, 190, 195, 196, 197, 198, 200, 214, 215, 216, 217, 220, 222, 223, 224 |
| 227–264 | shared geometry planning runs despite fast reuse: README skips, track engine runs fleet, lighting selects targeted suites; missing base/direct dispatch/nightly fail safe to fleet, called schedule uses supplied base | 230, 231, 232, 233, 234, 249, 254, 255, 257, 258, 259, 260, 261, 262 |
| 266–280 | Bash rollup passes successful shards or skipped shards with geometry=false and empty targeted set; unknown/nonempty plan, failure or cancellation fails; planner success required | 277, 279 |
| 282–298 | draft sweeps predicate and opted-out verdict name persist; smoke/driving/XR and browser-group retain cancelled failure artifacts; selected markers last seven days; GPU verdict runs unless cancelled | 284, 285, 288, 289, 292, 294, 297 |
| 303–314 | every tools/ci/*.sh is cited by a workflow, another tool or a test | 307, 313 |
| 316–351 | ci-verdict always reports under an evaluated name, and never CI where it does no work (P9, #2664) | 324, 327, 344, 345, 346, 347, 348, 350 |

### ci-ship-smoke-renderer

Targets: ci.yml browser, renderer-macos and staged-boot jobs; pages.yml; tools/ci/ci-coverage.mjs report/groupSpecs; select-specs.mjs gate; Playwright configs; Mesa and Chromium actions; timing data.

Fixture: Source slices and parsed YAML plus report-derived group membership; llvmpipe timing history; staged-boot expressions run in VM for absent/empty/llvmpipe/swiftshader inputs. Mesa shell runs with sudo/Xvfb/seq/sleep stubs, missing socket and synthetic elapsed budget.

Limits: No rendering or GPU execution. Mesa tests establish failures before DISPLAY export and bounded retry budget, not apt installation or real X server health. Smoke timing cap is a history-based guard, not a fresh measurement.

| Case body | Contract | Assertion spans |
|---|---|---|
| 16–39 | a GREEN run's junit survives — the timings CI already measures | 31, 32, 33, 34, 37 |
| 41–94 | the timings merge is its own workflow, and never pushes to the deploy branch | 50–51, 53–54, 56–57, 61–62, 63, 67–68, 69–70, 73–74, 76, 82–83, 84, 90–91, 92–93 |
| 96–130 | the ship filter is ONE job whose answer every smoke shard reads | 109, 110–111, 112, 113, 115, 116–117, 124–125, 128–129 |
| 132–139 | the ship filter no longer polices the committed generation — the deploy stamps it | 137, 138 |
| 155–162 | smoke's command-line timeout is not tripled inside the spec | 157–159, 160–161 |
| 164–178 | the selected gate cannot rerun the fixed-budget smoke spec | 166, 168–169, 170–172, 173, 174–175, 176–177 |
| 180–194 | the golden-menu check is blocking AND never runs on the Pages call | 188, 189, 190–191, 192–193 |
| 196–229 | every browser gate but the parity anchor runs on Mesa llvmpipe, and gl: swiftshader opts out | 209–210, 212, 214–215, 216–217, 223–224, 227–228 |
| 240–257 | the renderer specs have their own macOS job that runs test:gfx | 241, 242, 243, 244, 248, 249, 250, 254, 255, 256 |
| 259–276 | the renderer job never passes --use-angle=vulkan (it drops macOS to SwiftShader) | 264, 265, 266, 270, 271, 272, 273, 275 |
| 278–293 | the renderer job proves the adapter before trusting the run, and uploads its report on every run | 279, 280, 281, 286, 287, 291, 292 |
| 295–329 | the renderer job is path-filtered on a cheap runner and joins the deploy gate for renderer releases | 296, 302, 303, 304, 305, 306–307, 308–309, 310–312, 321, 323, 324, 325, 326, 328 |
| 331–340 | the deploy-gate count includes what the renderer job runs | 333–334, 337, 338, 339 |
| 342–352 | the smoke job carries no concurrency group of its own | 350, 351 |
| 354–388 | smoke.spec.js is ONE shard on PRs and the Pages call; the wide nightly/dispatch run keeps four | 362–363, 364, 369, 371–372, 383, 384–385, 386, 387 |
| 391–405 | staged-boot honors the SwiftShader opt-out for renderer env as well as setup | 401, 402, 403 |
| 422–427 | Mesa setup fails before exporting a missing Xvfb display | 424, 425, 426 |
| 429–433 | Mesa retries share a total deadline instead of exhausting the caller job | 431, 432 |

Setup/helper assertion spans: 151.

### ci-verdict

Targets: tools/ci/ci-verdict.mjs verdict/summary/ADVISORY and CLI; ci.yml ci-verdict wiring.

Fixture: Pure needs result objects and subprocess CLI with NEEDS/REQUIRE_SUCCESS; null/array/empty/all-skipped, cancelled-selected and baseline cases; summary text and workflow needs list.

Limits: Finite aggregator policy and text wiring checks; no actual branch protection. The case called advisory cancelled now tests baseline-trial, which ADVISORY explicitly excludes.

| Case body | Contract | Assertion spans |
|---|---|---|
| 12–22 | success and skipped needed jobs pass | 18, 19, 20, 21 |
| 24–28 | a failed or cancelled needed job fails the aggregator | 25, 26, 27 |
| 30–38 | a green selected-verdict cannot waive a cancelled selected job | 36, 37 |
| 40–47 | selected cancelled still fails when selected-verdict also failed | 45, 46 |
| 49–56 | baseline-trial is blocking: failure fails CI | 50, 55 |
| 58–61 | advisory cancelled still fails (run was interrupted) | 60 |
| 63–78 | CLI exits 0 on all-success NEEDS and 1 on failure | 76, 77 |
| 81–93 | an empty needs payload, or one with no success at all, fails | 82, 83, 84, 85, 87, 88, 90, 92 |
| 95–109 | CLI exits 2 when NEEDS is unset, empty or {} and 1 when everything was skipped | 104, 105, 106, 107, 108 |
| 112–120 | REQUIRE_SUCCESS: a required job that was skipped or missing fails the aggregator; others may still skip | 114, 116, 117, 118, 119 |
| 122–132 | the CLI reads REQUIRE_SUCCESS: the same needs JSON passes bare and fails strict (a replayed hollow draft-tier run) | 130, 131 |
| 134–143 | ci.yml wiring (#2664): REQUIRE_SUCCESS only on a non-draft PR run, naming jobs ci-verdict needs; the draft fast tier is not named CI | 139, 141, 142 |
| 146–155 | summary lists executed vs skipped jobs and names the required set | 149, 150, 151, 153, 154 |

### ci-watch

Targets: tools/ci/ci-watch.mjs watcher policy/API/state helpers; tools/ci/github-token.mjs; workflow endpoints are injected fixtures.

Fixture: Synthetic run/job records, current and historical PR associations with pagination and malformed heads, fake HTTP payloads/ETags, request spies, in-memory fs/state, fake clock/wait callbacks. Terminal codes and diagnostic lines are asserted as well as pure helper decisions.

Limits: No live GitHub, real token retrieval, disk state persistence or real sleep. api delegates transport details; tests inject curl process result. afterThreeMinutes uses a 240000 ms fake clock. The state test uses a fake fs Map. Tie policy prefers non-cancelled twins before higher id.

| Case body | Contract | Assertion spans |
|---|---|---|
| 19–26 | the newest run per workflow wins, so a superseded push run is not a red | 24, 25 |
| 28–35 | a same-second tie goes to the higher run id, whatever order the API lists them in | 32, 34 |
| 37–46 | a same-second tie prefers the live run over a cancelled twin even when the cancelled one has the higher id (#2944) | 41, 43, 45 |
| 48–60 | verdict: failed as soon as a job fails, done only when every run completed | 51, 52, 54, 55, 57, 58–59 |
| 62–78 | each finished job is one event; skipped jobs are silent; a red names its step and URL | 71–74, 75, 77 |
| 80–87 | only a failed or timed-out job gets its annotations printed | 83, 84, 85, 86 |
| 89–102 | --pages reads the NEWEST train run that contains the SHA | 99, 100, 101 |
| 104–119 | no run yet: none only without a PR; a conflicting PR is blocked, never green | 106, 107, 109, 111, 112, 116, 117, 118 |
| 121–127 | githubToken: env wins; else gh auth token; never invents a token | 122, 123, 124, 125, 126 |
| 133–146 | exact commit-associated PR lookup ignores a stale broad list and confirms current head/conflicts | 142, 143, 144, 145 |
| 148–160 | commit associations require an open exact current head, not closed or historical associations | 154, 155, 156, 158, 159 |
| 162–173 | stale association head cannot hide the current exact-head open PR | 170, 171, 172 |
| 175–186 | malformed association or individual PR head remains unknown, never absence | 179, 180, 183, 184 |
| 188–205 | detail lookup budget spans pages and never declares absence from unchecked open associations | 200, 201, 202, 203, 204 |
| 207–216 | PR lookup transport, shape and detail errors remain unknown instead of no PR | 209, 213, 215 |
| 218–232 | association pagination confirms later-page current heads and never blesses partial lists | 228, 229, 230, 231 |
| 234–247 | API polling asks HTTP caches to revalidate and preserves failed HTTP/JSON as errors | 236, 237, 238, 239, 240, 243, 245 |
| 249–274 | API polling is conditional: the URL's ETag rides in If-None-Match and a 304 reuses the body (audit finding 8) | 253, 254, 259, 260, 262, 263, 265, 266, 267, 268–269, 273 |
| 276–279 | ci-watch polls every 60 s by default (360–480 GETs/h at 30 s crossed the token limit at ~15 watches) | 278 |
| 289–301 | no-run watcher reports current conflicting PR as blocked even when broad discovery is stale | 298, 299, 300 |
| 303–316 | no-run watcher never returns green when PR or commit-check discovery is unknown | 312, 313, 314 |
| 318–330 | confirmed absence still needs successful PR and zero-check evidence; indexed checks keep waiting | 326, 327, 327, 328 |
| 332–339 | job-list API failure cannot turn a completed successful run into a zero-job green verdict | 336, 337, 338 |
| 341–365 | a pending ship-fast run replaced by a newer push is SUPERSEDED, not a timeout | 346, 347–348, 349, 358, 359, 361, 362 |
| 367–374 | resolveSha: a short sha becomes the full id (local prefix first, then GitHub), never reaches the API short | 370, 371, 373 |
| 376–381 | resolveSha: an unresolvable or ambiguous short sha is a clear error, not a short sha for the API (was HTTP 422) | 378, 379, 380 |
| 383–401 | #2184: a label-noise run (all jobs skipped, success) never hides the real verdict on the head | 387, 389, 390, 397, 398, 399, 400 |
| 403–416 | #2184: = ci none-yet names the PR's mergeable_state | 414, 415 |
| 422–465 | #2259: an older completed run plus a label at T and no run after T is never = ci passed | 438, 439, 440, 441, 444, 445, 448, 449, 451, 455, 457–459, 460–462, 463, 464 |
| 483–494 | 5xx retries back off 1000 then 2000 ms before success, persistent 500 totals four tries, 404 returns after one call | 486, 487, 490, 490, 493, 493 |
| 496–504 | --failures-only: a green job and the run announcement stay silent; a red job and the final line speak | 500, 501, 502, 503 |
| 506–519 | a persisted state never replays a job event after a re-arm, and the final line still prints | 511, 512, 513, 514, 518 |
| 521–532 | hollow: a draft whose only real job is the skeleton is = ci hollow, never passed | 524, 525, 526, 528, 529, 531, 531 |
| 534–544 | cancelled-external: the only run, every job cancelled within 60 s, no newer run | 537, 538, 539, 540, 542, 543 |
| 546–562 | superseded: a merged PR or a moved PR head ends the watch; the merge commit itself is not superseded | 549, 550, 551, 552, 553, 558, 559, 561 |
| 564–576 | --jobs: one line per queued/pending leg with its wait age; running and finished legs are only counted | 572, 573, 575 |
| 578–583 | a run cancelled once is reported once per process pair: floor line names the dispatch escape hatch | 581, 582 |
| 585–596 | inheritedNotes (#2665): says base red since <sha> only when the deploy tip's same job is red, and names a quarantined test | 589, 589, 590, 591, 594, 595 |
| 598–606 | baseRunFor reads the deploy branch's newest completed run once per workflow and survives a failing lookup | 602, 602, 603, 604, 605 |

### ci-workflow-triggers

Targets: ci.yml/pages.yml/desktop.yml and all workflow job caps; base-verdict.sh, pages-live-sha.sh; selected-gate-verdict.mjs; ci-coverage report.

Fixture: YAML/source predicates and inline node compilation; real disposable Git ancestor tree with fake gh/curl; selected-verdict no-execution evidence cases.

Limits: No scheduler/remote execution. Node-inline check sees only specifically formatted standalone single-quoted node -e blocks in three workflows; cap scan exempts reusable-workflow calls.

| Case body | Contract | Assertion spans |
|---|---|---|
| 18–59 | docs-only pushes do not start CI (Actions minutes, 2026-09-02) | 26, 30, 31, 33, 36, 40–41, 42, 44, 47, 48, 49, 50, 56, 57 |
| 61–68 | desktop pack-smoke is full-tier only (ready PRs, not drafts) | 63–64, 66–67 |
| 70–102 | pages.yml is a release train: schedule + dispatch, one deploy branch, nothing-new short-circuit | 79, 80, 83, 84, 85, 88, 89, 90, 91, 92, 94, 97, 98, 99, 101 |
| 104–144 | ci.yml treats a Pages call as the gate it is, whatever the caller's event | 113–114, 115–116, 117–118, 121, 125–126, 135–136, 139–140, 141, 142–143 |
| 146–217 | strict ancestor completed CI/Pages run supplies green/red named-job notice and summary; self/head/unmerged/wrong-workflow/in-progress candidates excluded; API failure stays advisory exit 0 | 185, 186, 187, 190, 191, 192, 195–197, 198–199, 202–203, 204–205, 206–207, 208–209, 210–211, 214, 215 |
| 219–226 | ci.yml runs the base verdict where the checkout can answer it, and never lets it decide | 220, 221–222, 223, 224, 225 |
| 228–245 | live shell SHA extracted exactly; missing meta or failed curl yields empty stdout and success exit | 239, 240, 241, 242, 243 |
| 247–280 | every inline node -e '…' script in the workflows is syntactically complete (no apostrophe can close the quote early) | 268, 271–272, 273–274, 279 |
| 288–298 | the CI guard shards stop starting files after their first failure (--bail) | 292, 293–294, 297 |
| 300–329 | selected-verdict: one fixed-name check that always judges the change-aware gate | 302, 303, 304, 307–308, 309, 313, 314, 317–319, 321–322, 325, 327, 328 |
| 331–349 | all non-reusable jobs declare timeout; publishable has contents-read only; deploy lock holder cap ≤30 minutes | 345, 347, 348 |
| 354–369 | every fetch-depth: 0 checkout in ci.yml is blob-less (C6), and merge_group is gone (finding 7) | 361, 364, 365, 367, 368 |

### circuit-axis

Targets: tools/ui/circuit-axis.mjs CIRCUITS/parseCircuits/circuitTag; js/ui/track-maps.js TrackMaps.aspect; verify-track.cjs context and shipped circuit files.

Fixture: Recorded five-aspect spread checked against real track VM aspect within 0.02; default/bare/list/empty circuit flags and tagged cell parsing.

Limits: No browser map layout, pickCircuit click behavior, unknown circuit-id validation, CSS or raster appearance. Aspect range uses clamped TrackMaps.aspect.

| Case body | Contract | Assertion spans |
|---|---|---|
| 15–24 | the spread actually spans tall to wide | 17, 18, 19, 22–23 |
| 26–45 | the recorded aspects are what TrackMaps.aspect() measures on the shipped defs | 40, 42–43 |
| 47–56 | every circuit in the spread is a real circuit file | 53–54 |
| 58–64 | the axis is off unless asked for | 61, 62, 63 |
| 66–68 | bare --circuits means the whole spread | 67 |
| 70–73 | --circuits=a,b names them | 71, 72 |
| 75–77 | an empty --circuits= is an error, not a silent no-op | 76 |
| 79–87 | a tagged cell id stays parseable back into screen and circuit | 83, 85, 86 |

### circuit-corner-anchors

Targets: verify-track.cjs built tracks; authored Imola/Hungaroring/Monaco/Bahrain definitions; js/circuits/scenery/bahrain.js anchor prelude.

Fixture: Real centerlines; curated-turn fractions to nearest node; bank lift argmax near named corners; extracted Bahrain anchor declarations at authored and +0.01 scenery shift.

Limits: Selected numerical geography constraints, not independent surveying or full scenery mesh render. Bahrain executes only declarations before circuitKit, not callback mesh output.

| Case body | Contract | Assertion spans |
|---|---|---|
| 19–33 | 19 turns; Tosa/Alta meet spatial and curvature gates, following Alta turns left, T8 uphill right; sector offsets are 115m and 190m | 25, 26, 27, 28, 29, 30, 31–32 |
| 35–45 | 14 ascending turns: T4 left, T5 right at .40–.46 lap, T6/T7 right-left, T10 left at .60–.63 lap | 39, 40, 41, 42, 43, 44 |
| 47–77 | T3/T7 bank-zone identities and curvature signs; >0.3m lift peaks within 6m of named apex; T1/T4 lift is zero | 68, 70, 71, 75 |
| 80–99 | extracted SF/T1F/FC declarations remain within .01m of start/T1/T14 at authored scenery shift and shift+.01 | 86, 96 |

### circuit-count-shell

Targets: tools/lib/game-vm.cjs roster boot; Tracks.LIST/SEASON; index.html and manifest.json descriptions.

Fixture: Booted game counts season/classic/all, then regex shell descriptions derived from those counts, with roster anti-shrink floor 52.

Limits: Copy consistency, not circuit geometry quality or SEO; no browser. VM created at module scope has no explicit close in this file.

| Case body | Contract | Assertion spans |
|---|---|---|
| 20–23 | Tracks.LIST is season rounds plus classics | 21, 22 |
| 25–29 | index.html meta description states the real circuit count | 27, 28 |
| 31–34 | manifest.json description states the season and classic counts | 33 |

### circuit-def-fields

Targets: verify-track.cjs TrackDefs/Tracks; js/track/tracks.js and def factory/build pipeline; circuit defs/elevations, OSM import manifest; tools/gen/gen-circuit-meta.mjs and tools/manifest.cjs.

Fixture: Real roster/centerlines and generated meta stubs in TRACK_VM; authored versus built own fields; missing Monaco path injection; Korea flat relief; control points/sectors/banking/hairpins/elevation samples.

Limits: Presence does not generally prove value equality (specific fields and meta keys do). Geometry gates are finite sample thresholds and selected tracks for hairpin/elevation identities. OSM neither-filter ignores missing built ids; roster guard elsewhere supplies membership.

| Case body | Contract | Assertion spans |
|---|---|---|
| 52–84 | every authored circuit exists built; every authored own key is built-own unless baseHW/pal/crossover engine-only exemption; false/zero/null count as present | 56, 61, 76–82 |
| 90–118 | the five once-dropped fields carry their authored values | 96–97, 101, 102, 103, 106–107, 111, 112, 116–117 |
| 124–153 | Monaco/Spa/Monza/Silverstone distances within one lap of references; five authored overrides exact; Monaco differs from Spa; every FULL exceeds three laps | 132, 133, 143, 147–148, 152 |
| 162–188 | the title's meta stubs carry the menu fields their hydrated defs do (gpLaps included) | 176, 177, 187 |
| 195–239 | the folded per-circuit data reaches the built def | 198, 199, 201, 205, 211, 213, 214, 215, 216, 217, 218, 219, 225, 235 |
| 250–267 | OSM ids have SRTM samples or undulate=false; Korea explicitly flat, no baked profile, built relief <1e-6m; at least twelve imports | 256, 259, 260, 261, 266 |
| 274–287 | no circuit trace has two control points closer than 1 m | 286 |
| 291–300 | every circuit names two ascending sector splits | 299 |
| 306–319 | sample ±20m every 4m at each sector split; peak absolute curvature ≤.015 (the .0035 comment is suggested authoring target) | 318 |
| 326–353 | turn anchors are valid 1-based integers; fractional anchors after scenery/reverse mapping have smoothed curvature ≥.004 or lie ≤60m from a curated turn | 352 |
| 360–382 | Korea/Buddh/Bahrain/Singapore/Magny-Cours node radius ≥4m; halfwidth×right-vector change ≤.97×node chord | 381 |
| 389–430 | extremes within .02 lap: Spa Les Combes high, Stavelot low and Eau Rouge valley; Kemmel rise >60m, Monaco Casino crest 35–50m and harbour low; both grades <.18 | 409, 421, 422, 428, 429 |

### circuit-meta

Targets: tools/gen/gen-circuit-meta.mjs check/META_KEYS; tools/manifest.cjs; js/track/circuit-meta.js.

Fixture: Generator check plus isolated VM raw generated TrackDefs; count/id/name/country/meta-only/no-path checks; FULL/LAZY_CIRCUIT composition.

Limits: No asynchronous hydration or menu browser behavior; roster cardinality plus all-id membership pins one-per-id indirectly.

| Case body | Contract | Assertion spans |
|---|---|---|
| 15–19 | js/track/circuit-meta.js exists and matches the generator | 16, 18 |
| 21–37 | meta roster has one stub per CIRCUITS id with no path payload | 26, 29, 32, 33, 34, 35 |
| 39–46 | FULL carries meta only; LAZY_CIRCUIT lists every authored def | 41, 42, 43, 44, 45 |

### circuit-scope

Targets: tools/lib/circuit-scope.cjs scope/scoped/shard/inShard; select-specs CIRCUIT_FILTERED_TESTS; select-budget declaredTests; ci.yml and audit/sweep source contracts.

Fixture: Subprocess scope environment, five-id shard partitions and malformed shard matrix; regex audit consumers and suite floors; static elevation twin/spec declared-count equality.

Limits: Consumer wiring is source matching, not running fleet sweeps. Unknown scope legitimately returns empty; scoped suite anti-vacuity is inspected structurally.

| Case body | Contract | Assertion spans |
|---|---|---|
| 22–29 | scope(): unset keeps every id in order; set keeps the named ids only | 26, 27, 28 |
| 31–50 | shard(): i/n shards are a disjoint, order-preserving partition; unset keeps all; malformed throws | 34, 35, 36, 37, 38, 39, 41, 44, 45–46, 48–49 |
| 52–61 | every audit CLI's --all resolves its roster through scope() | 55, 58, 60 |
| 63–84 | the sweep suites that rebuild the roster are scoped, listed, and hold the SCOPED floor | 72, 75, 76, 77, 81, 82 |
| 86–103 | ci.yml: the sweeps job scopes a circuit-only pull request and hands the ids to test:sweeps | 93, 94, 95, 96, 97–98, 102 |

### circuit-vocab

Targets: js/track/scenery/build-props.js SPECIES and data.js STAND_LIVERIES; authored TrackDefs through verify-track context.

Fixture: Character-scanned top-level literal table keys plus palm/fir/broad/none aliases; all authored tree and standSet words; empty KNOWN_UNHANDLED list honesty.

Limits: No mesh dispatch execution or alias geometry checks. Literal parser is a hand scanner, not a complete JS parser. Empty parked list makes its per-key assertion loop vacuous by design.

| Case body | Contract | Assertion spans |
|---|---|---|
| 83–99 | every furniture.tree names a species the scatter dispatch honours | 96–98 |
| 104–109 | nothing in KNOWN_UNHANDLED is a species the engine now honours | 108 |
| 111–124 | every standSet entry names a real grandstand livery | 120–123 |

Setup/helper assertion spans: 40, 72.

### class-usage

Targets: tools/check/class-usage.mjs sweep/KNOWN; index.html, js/ and css/ scanner inputs.

Fixture: Real tree applied-but-undefined census; queried/explained exclusions; stale KNOWN detection; >300 total and >150 JS extraction floors plus set-row shell anchor.

Limits: Static extraction, not computed CSS or runtime class/style reachability. A queried class is accepted as a hook without requiring CSS.

| Case body | Contract | Assertion spans |
|---|---|---|
| 19–25 | every applied class is defined, queried, or explained | 21–24 |
| 30–37 | KNOWN names no class that is now defined or gone | 34–36 |
| 43–49 | the sweep still reads both markup and Dom.el() | 45, 46, 48 |

### classification-vm

Targets: tools/lib/game-vm.cjs real game loop; RaceControl classification/finishOrder, G.endRace; SeasonCal awards; tyre compound rules; post-finish pause control.

Fixture: Headless Monza VM races; explicit car lap/progress/finish/retired/DSQ and speed placements, real steps and pause skip-results; short season setup and direct settlement snapshots; roster reordering on same-step flag and caution-pass cases.

Limits: Synthetic placements exercise real loop/settlement but no renderer/network/browser results sheet. Rule thresholds and points verified for selected lap counts only. Historical comments about 2.2 s automatic end are stale relative to explicit POST_FINISH_CAP skip controls in later cases.

| Case body | Contract | Assertion spans |
|---|---|---|
| 27–46 | a lapped car that takes the flag is classified behind a lead-lap car still running | 43, 44, 45 |
| 48–75 | late retirement with 9/10 completed laps classifies above early 4/10 retirement; this case asserts classification/order, not awarded points | 70, 71, 72, 73 |
| 77–139 | flagged finishers need 90 percent distance, rounded down, before scoring | 104, 105, 106, 107, 110–111, 113, 114, 115, 118, 119, 125, 126, 128, 129, 130, 131, 133, 135 |
| 141–169 | with no finisher, the 90 % rule measures the leader still running | 162, 163, 164, 165, 166, 167 |
| 171–198 | a car still RUNNING below 90 % of the winner's laps is not classified, and follows by distance | 192, 193, 194, 195–196 |
| 200–231 | a finisher two laps down is still in order with a finPos, after every classified car | 222, 223, 224, 225, 227, 228, 229 |
| 233–260 | no finisher at 4/10 completed laps awards winner 13 points and pays exactly nine places | 254, 255, 257, 258 |
| 262–292 | all retired at 10/9/8 of 20 laps: first two classify, third does not; unique field positions, 19/14/0 points and exactly two scorers | 280, 281, 282, 283, 284, 284, 284, 285, 286, 287, 288, 289, 290 |
| 294–316 | the live loop flags a lapped human on the same step as the winner in either roster order | 310, 311, 312, 313 |
| 318–344 | finishing-step pass under level-3 caution adds 10 seconds once; race remains active for rival corrected-time opportunity; subsequent steps do not duplicate penalty | 331, 332, 333, 334, 336, 337, 338, 340, 342 |
| 346–384 | after the flag a finished car's rank follows the classification, not its coast progress (PERF-HUNT-4 B-F2) | 373, 376, 377, 378, 380, 381, 382 |

### cli-args

Targets: tools/lib/cli-args.mjs makeFlags/parseFlags/strictFlags/pickIds/CliArgError; tools/lib/git-run.mjs; rulebook tools/ci CLIs and ratchets help.

Fixture: Pure argv matrices; child Node help/error programs; captured console and injected exit; Git nonexistent-ref failure and injected porcelain output; per-tool help/typo subprocesses with load-sensitive budgets.

Limits: Help/unknown-flag probes assert early exit, not meaningful tool work. Header <0.2 s and test title within 10 s predate broad CLI loop; actual budget is 30 s at load>8.

| Case body | Contract | Assertion spans |
|---|---|---|
| 14–22 | an unknown flag throws CliArgError naming the near miss and what is accepted | 15–21, 16, 17, 18, 19 |
| 24–27 | a bare unknown flag is rejected, a known one and a positional are not | 25, 26 |
| 29–35 | --name=value and --name value read the same | 30, 31, 32, 34 |
| 37–43 | has() sees both the bare and the = spelling; list() drops empty entries | 39, 40, 41, 42 |
| 45–57 | --help: exitIfHelp prints the text and exits 0; a CLI built on parseFlags exits 1 with the message, no stack | 49, 50, 52, 53, 54, 55, 56 |
| 59–73 | strictFlags: --help prints usage (+ any flag it omits) and exits 0; a typo prints the near miss + usage and exits 2 | 68, 70, 71, 72 |
| 75–84 | git-run: gitRun never throws, gitMust names the step, gitTry reads '' on failure, gitOut throws | 77, 78, 79, 80, 81, 83 |
| 90–108 | rulebook CLIs: --help exits 0 within 10 s; --definitely-not-a-flag exits 2 | 107 |

### cli-only-ids

Targets: tools/lib/cli-args.mjs pickIds; tools/ui/menu-screens.mjs; menu-fit.mjs, fit-audit.mjs, layout-audit.mjs early validation.

Fixture: Small id lists, real SCREENS/VIEWPORTS, and unknown-id CLI subprocesses; layout-audit uses list mode.

Limits: No browser work or successful full audits. Three dynamic case instances use one template and selected known-id diagnostic anchors.

| Case body | Contract | Assertion spans |
|---|---|---|
| 15–21 | pickIds: absent flag is no filter; matches by substring, exact or prefix | 17, 18, 19, 20 |
| 23–30 | pickIds: an unknown or empty id throws and lists the valid ids | 25–26, 27, 28, 29 |
| 32–38 | pickScreens / pickViewports: a pattern matching nothing throws, valid ones still work | 33, 34, 35, 36, 37 |
| 42–47 | {tool} {flag}=<unknown> exits non-zero with the valid ids, before any browser | 44, 45, 46 |

### clipboard

Targets: js/core/clipboard.js ApexClipboard through tests/helpers/seed-clipboard.mjs; mini-dom.mjs.

Fixture: VM navigator promise clipboard stub; order log and execCommand; missing/denied API; focus/select/setSelectionRange injected exceptions and textarea/focus cleanup.

Limits: No secure-context, permissions or user-gesture browser semantics. preferSync test checks call order/result, not OS clipboard contents; ordinary successful API test checks first call rather than absence of later calls.

| Case body | Contract | Assertion spans |
|---|---|---|
| 43–48 | write prefers the async clipboard API then falls back to execCommand | 46, 47 |
| 50–55 | write succeeds on clipboard alone when execCommand is gone | 53, 54 |
| 57–63 | preferSync runs execCommand before the clipboard promise | 60, 61, 62 |
| 65–72 | read returns clipboard text and surfaces denial | 67, 69, 71 |
| 75–98 | fallback removes its textarea and restores focus when {step} throws | 94, 95, 96, 97 |
| 101–110 | a focus-restoration error cannot report an already successful copy as failed | 107, 108, 109 |
| 112–121 | failed execCommand still removes its textarea and restores focus | 118, 119, 120 |

### coach-clone

Targets: js/race/driving-coach.js factory jsonClone, extracted before captureCar.

Fixture: Real lifted function compared with JSON round trip over sixteen shapes: tyre record/log, null pitNext, nested/empty containers, bool/string, ±0, NaN/Infinity object/array, undefined/function object/array, Date and deep mix; deep copy mutation isolation.

Limits: No complete capture/restore/rewind integration, performance assertion, cyclic object/BigInt/top-level undefined/custom toJSON matrix. Source anchor assertions guard extraction.

| Case body | Contract | Assertion spans |
|---|---|---|
| 65–67 | jsonClone matches the JSON round trip: {name} | 66 |
| 70–81 | jsonClone returns a copy, never the original | 75, 76, 77, 78, 80 |

Setup/helper assertion spans: 32, 34.

### cockpit-crest-stripe

Targets: tools/car/cockpit-pale-sweep.mjs loader/EYE and Car3D.build; shipped universal and team stripe liveries; fitted Parts visual tiers.

Fixture: One team, no wheels/driver/halo; differential builds with/without stripe recover inserted vertices; wheel yaw ±25°, pitch −40..−5°, range <1.5m. Cockpit has zero hits and chase has hits for each stripe livery.

Limits: No rendering/occlusion, only vertex-cone geometry; assumes stripe is pure insertion and does not reorder vertices. No explicit minimum livery count, so both loops could vacate if no stripes ship.

| Case body | Contract | Assertion spans |
|---|---|---|
| 86–97 | no livery crest stripe runs through the driver's steering wheel | 92–96 |
| 99–111 | the chase build still carries the crest stripe it is drawn for | 107–110 |

### cockpit-pale-surfaces

Targets: tools/car/cockpit-pale-sweep.mjs loadCar3D/buildCockpit/sweep/isPale; js/car/car3d.js; car-mesh.js forearms; shipped teams/liveries.

Fixture: Real CPU mesh raycasts for team accent and pale-field-selected BY_TEAM liveries, synthetic white accent/body; fixed rear-tub and coaming slices; hood paint preservation; VM forearm first colour for synthetic and >50 shipped liveries.

Limits: No tone-map/GPU visual proof. Raycast uses nearest triangle vertex colour at fixed eye/FOV/sample step; body colour and empty ALLOWED exemption. Livery prefilter covers BY_TEAM, not universal-only liveries; forearm only samples its first vertex colour. Box guards cover specific mesh slices.

| Case body | Contract | Assertion spans |
|---|---|---|
| 38–59 | ≥8 team cockpit raycasts find no pale non-body/non-allowed colour bucket; c1 body paint is exempt | 39, 56–58 |
| 61–66 | a white accent is dimmed rather than passed through | 65 |
| 68–75 | the sweep can actually see a pale surface (the guard is not vacuous) | 74 |
| 77–83 | white and .85/.85/.9 are pale; yellow, teal and dark grey are not | 78, 79, 80, 81, 82 |
| 94–123 | no shipped LIVERY puts a pale non-body surface in the driver's view | 95, 107–108, 120–122 |
| 138–156 | the cockpit tub wall under the wheel is not body paint | 152, 153–155 |
| 172–191 | the dash coaming under the wheel is not body paint | 187, 188–190 |
| 196–210 | the cockpit hood and nose keep the livery | 208–209 |
| 217–234 | no shipped livery dresses the cockpit forearms in a pale slab | 232, 233 |

### cockpit-preview

Targets: js/camera/cockpit-preview.js, cockpit-opts.js, cockpit-finishes.js, js/car/car-materials.js; mini-dom.mjs.

Fixture: Map settings store, fake Teams/Liveries and iframe CockpitPreviewFrame delivery/dispose recorder; MutationObserver callback list; bound car immutable livery/parts and race object snapshot.

Limits: No actual iframe page/render/WebGL, browser focus lifecycle or real storage. Equality of supplied fake race object establishes no mutation of that object, not all live game state.

| Case body | Contract | Assertion spans |
|---|---|---|
| 40–53 | preview open, angle changes and close preserve race state and custom saved choices | 45, 46, 46, 48, 50, 50, 51, 51, 52 |
| 55–63 | changing options and coordinated presets repaints the same iframe and remains persisted after close | 58, 59, 59, 61, 61, 62 |
| 65–74 | collapse and Escape dispose the frame, stale load callbacks cannot reopen it, mount is idempotent | 66, 68, 69, 73, 73, 73 |
| 76–81 | bound player car reader supplies exact paint and parts without a settings write | 79, 79, 79, 80, 80 |
| 83–122 | finish changes repaint the existing preview with independent resolved body, halo and wheel choices | 90, 90, 91, 92, 96, 97, 98, 99, 100, 101, 104, 105, 106, 107, 108, 109, 112, 113, 114, 118, 119, 120, 121 |

### cockpit-wheel-finish

Targets: Car3D via tools/car/parts-sweep.mjs; js/car/car-mesh.js and car-materials.js; cockpit-finishes.js; real drawCockpitRig via tests/helpers/car-draw-vm.mjs.

Fixture: Actual mesh arrays/histograms and made/freed fake GPU handles; three factory teams × four body finishes; rig draw recorder with CarMesh proxy; Map settings reloads; immutable livery; standard/faired halo surface diffs; same-colour matte/chrome cache changes.

Limits: CPU material ids/options and VM draw forwarding, no appearance/GPU execution. Surface-remap test compares position count and triangles, not all position values (later livery-specific test does full equality). First body-forwarding test fixture only requests cockpit, despite title naming helmet too.

| Case body | Contract | Assertion spans |
|---|---|---|
| 41–55 | a livery finish lands on every painted vertex of the cockpit/helmet build, as on the exterior | 48, 51, 52 |
| 77–80 | the cockpit and helmet cameras draw the body with the frame's paint opts (carFinish), as the exterior | 79 |
| 82–89 | drawCockpitRig draws the steering wheel with CarMesh.cockpitWheelOpts(rig opts) | 85, 86, 87, 88 |
| 91–101 | drawCockpitRig supplies its body finish to the active front flaps without rewriting fitted paint | 95, 96, 97, 98, 99, 100 |
| 103–111 | the shipped wheel is Bryce's pick A: lacquered carbon, black rubber grips, bright alloy, glass LCD | 105, 107, 109, 110 |
| 113–130 | every wheel finish is a surface remap of the same geometry; stock is today's wheel | 115, 118, 122, 123, 124, 125, 128 |
| 132–143 | the wheel draws with lit opts that let its surfaces' lobes through; stock keeps the rig's | 136, 140, 141 |
| 145–163 | invalid raw defaults wheel carbon/body livery/halo livery; each choice round-trips storage; events only on changes, body stamp ignores wheel changes; invalid writes select first choice | 148, 148, 148, 153, 154, 155, 156, 157, 160, 161 |
| 165–193 | body and halo finish overrides cache stable views and preserve the fitted livery independently | 169, 170, 171, 174, 175, 177, 178, 179, 182, 183, 185, 186, 188, 189, 191, 192 |
| 195–213 | the actual standard and faired cockpit halos take the selected surface without changing geometry or other materials | 203, 204, 205, 207, 209, 210 |
| 215–241 | livery wheel finish follows paint material, preserves gloves and LCD, and keys equal-color finishes separately | 221, 221, 223, 224, 228, 229, 231, 233, 234, 236, 237, 238, 239, 240 |

## Comment and coverage findings

- ci-pages-train concurrency comments at 31–39 retain the retired ship-fast history while 40–46 explicitly assert that group is gone. Its publication comment at 74–75 says newest-wins gate cancellation; assertions at 64–66 require the Pages gate never cancels. Treat comments as history, assertions as contract.
- ci-ship-smoke-renderer title and comments at 96–105 still call ship filtering one job; 106–108 and actual assertions establish a select step. Similar old job wording remains in other split CI suites.
- ci-workflow-triggers train introduction at 71–75 says three ticks hourly; 81–83 asserts the current six-hour backstop. Assertion diagnostic at 99 says there is no push event, while 77–79 asserts a push trigger; actual protected property is no use of event.before as live diff base.
- classification-vm title “finisher two laps down” sets lap=7 and allows the live loop to determine its eventual flagged distance; the guaranteed property is under-90% flagged car retention and distinct finPos for the entire field.
- cockpit-pale-surfaces hood-and-nose title at 196 is broader than its 203–208 hood slice; that case proves painted vertices in the hood box, not nose preservation. Rear-cap message says expected 24 while threshold is at least 12.
- cockpit-wheel-finish surface remap checks preserve array length and triangle topology generally; the livery-specific case also compares full position arrays. The first finish test covers three factory teams, not every car/team/part combination.
- No runtime green is claimed. Browser behavior, actual Actions execution, GPU appearance, network service semantics and real-world circuit validation remain outside this static read ledger.
