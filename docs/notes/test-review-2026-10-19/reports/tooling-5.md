<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT tooling-5 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260418512
- Posted: 2026-10-19T05:32:42Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT tooling-5

Batch tooling-5: 38 files, all `tests/unit` (0 specs). **Run: 38/38 pass** with `node --test <file>` (0 fail; 5 subtests skipped: 4 in workflow-lint, 1 in test-observed). Slowest: tt-lap-validity-vm 39 s, tools-runnable 37 s, wait-polling 35 s, wind-vm 27 s; the rest are under 14 s. No flakes seen in one run. Source of every test and its module read by me plus two read-only subagents (19 files each). I re-checked the cited lines of every Top finding myself; the subagents' line numbers for the second half were partly wrong and are not used here.

**Debugger method (said once):** js-debugger MCP cannot attach to node, so I drove the Node inspector over CDP: `node --inspect-brk --experimental-test-isolation=none --test <file>`, a ws script calls `Debugger.setBreakpointByUrl` with condition `console.log('HIT …'), false`, and counts HITs. Counts below are real breakpoint hits (`hit (cdp)`). Code evaluated by `vm.runInContext` has no resolvable URL, and code in child processes is not attached, so for those I used `NODE_V8_COVERAGE` function/block counts (`hit (coverage)`). Breakpoints on a line with a default parameter (`now = Date.now()`) do not fire when the argument is passed; I re-placed those inside the body. Scripts live in my scratch dir `artifacts/test-review/tooling-5/{dbg,cov,covline}.mjs`.

## Per-file table
| file | purpose (failure means) | run | debugger | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| surface-id-parity | a car surface id shades the same on GLX/WGX/TLX | pass 14, 0.6s | **n.a.** (pure source-text scan of shader files) | mixed: id-set parity strong; many literal-regex pins of shader expressions; comments not stripped in most tests | regex stands in for rendering; `>=20` filter skips low ids | regroup (parity vs constant pins) |
| sweep-shards | CI geometry-sweep shard packing | pass 3, 0.2s | hit (cdp) sweep-shards.mjs:57 x14 | mixed: coverage-once only, balance never asserted; `seconds > 0` (:20) pins nothing | none | strengthen |
| sync-pr-robust | stale sync-branch cleanup, remote-moved refusal, `--stop` | pass 4, 1.3s | hit (cdp) sync-pr.mjs:146 x3, :153 x2, run-pid.mjs:57 x1 | mixed/strong; `--stop` test is a real process | fake git matches by substring (:12), argv unchecked; "process tree" (:32) has no descendants | keep, tighten |
| test-bg-outcome | background run never reads green when exit != 0 | pass 9, 0.5s | hit (cdp) test-bg.mjs:168 x15, :113 x17 | strong (real zombie fixture asserts Z first) | one `indexOf` source-order pin | keep |
| test-coverage-audit | every test file belongs to a `test:*` group | pass 3, 1.3s | hit (cdp) test-coverage-audit.mjs:24 x3, :40 x53 | strong (tripwire >100 files, real orphan check) | none | keep |
| test-groups-generated | groups.json is the single source for scripts; node-group runner | pass 11, 3.2s | hit (cdp) gen-test-groups.mjs:40 x56, run-node-group.mjs:12 x2; runNodeGroup hit (coverage) x7 | strong (real children, rendezvous proves parallelism, signal forwarding) | none | keep (best of batch) |
| test-groups | package.json / pick-tests RULES / TESTING.md / playwright.config consistency | pass 15, 4.3s | hit (cdp) pick-tests.mjs:62 x1 (import time only; rest is scans of config and docs) | mixed; one test dormant (:315-337) | `RULES.slice(2)` (:78) positional; uses a Playwright internal | regroup |
| test-observed | titles extracted like the live reporter | pass 10 + 1 skip, 2.0s | hit (cdp) test-observed.mjs:71 x326, :113 x3526 | mixed: observed half is `t.skip` whenever artifacts/logs is absent (:135) | real specs + live logs | strengthen |
| three-inspector | opt-in three.js Inspector costs nothing when off | pass 5, 0.3s | hit (coverage) wanted x13, enable x2, set x357 | strong for `wanted()` matrix; greps for the rest | async `enable` race untested | strengthen |
| throttle-latch | touch GAS latch, pad toggle, HUD tap buttons | pass 21, 0.6s | hit (cdp, vm src) input.js:1784 throttleLevel x1; coverage throttleLevel x21, paintLatch x24, setThrottleLatch x10 | strong behaviour; :270-297 are greps | recording DOM stub, fine; `[0]` on a regex match (:276) throws TypeError | keep, move greps |
| tolerance-diff | PR gate against loosened test tolerances | pass 7, 0.6s | hit (cdp) tolerance-diff.mjs:51 x18, :84 x11 | strong (rule names and from/to numbers) | fixed scratch filename for the CLI | keep |
| tooling-fast-runner | scheduler, hung-file kill, empty-run detection, `--changed` | pass 25, 9.4s | hit (cdp) tooling-fast.mjs:1488 x8, :1415 x16, :1781 x3 | strong (real children, /proc proof the group is dead) | one source-text pin (:434-437) | keep; add selector branches |
| tools-a12-guards | regression guards DK1/S1/WP1/G1/PA1/PG1 | pass 10, 9.5s | hit (cdp) dup-keys.mjs:103 x1, stage.mjs:66 x12, output-paths.mjs:43 x14, wait-polling-lint.mjs:73 x2 | mixed/strong; S1 destination matrix strong; PA1/PG1 are text negations | hand-written generator list (:123) | regroup per tool |
| tools-runnable | every tool parses, `--help`, report-server, one-off pins | pass 36, 36.8s | hit (cdp) cli-args.mjs:95 wearArg x8; **report-server.mjs NOT-HIT (coverage)**: the server child is SIGTERMed, V8 never flushes, so the HTTP test could not be proven to reach `safeName` / `createReportRoute` | mixed: strong report-server and wearArg asserts; weak `--help` (exit 0 + one word) | many tool-specific greps; version-string pin | regroup into 4 files |
| traffic-arc-buckets | bucket neighbour scan equals full scan | pass 4, 0.3s | hit (coverage) fillArcBuckets x9, forArcNear x72, scanTraffic x6; **scanTow x0, scanOtAhead x0** | **weak** for the central test | the "full" and "bucket" scanners are copies inside the test (:77-215) | rewrite |
| tree-counts-catch | `catch {}` counted by the bare-catch ratchet | pass 2, 0.3s | hit (cdp) tree-counts.mjs:51 x8 | strong, exact counts | none | keep, add braces-in-strings case |
| trim-comments | comment trimmer keeps prose, drops dividers | pass 9, 0.9s | hit (coverage, child process) trimFile x7, isDividerLine x42 | mixed; KEEP test vacuous (:67-80) | scratch dir not removed in `finally` | strengthen |
| tt-lap-validity-vm | a cut lap is not a timed lap; strike ladder | pass 5, 38.9s | hit (coverage) game.js `if (c.offT > 1.2)` block x10220, `lapValid` x5998 | strong (each test first proves the engine counted the cut) | real game in VM, inert DOM | keep; add quali and AI cuts |
| tumftm-import | TUMFTM CSV to designer envelope | pass 10, 0.7s | hit (cdp) tumftm.mjs:188 x6, :240 x2 | mixed; `racelineOffsets` assert is an OR (:97-98) | stale title "three true missing" (:28) | strengthen |
| twin-fidelity | mutant needles still match their spec | pass 6, 0.3s | hit (cdp) twin-fidelity.mjs:35 x1, :47 x1, :73 x3 | mixed/strong | mutants never executed; catcher names not matched to titles | strengthen |
| twinned-specs | specs skipped on the gate really have VM twins | pass 10, 1.5s | hit (cdp) twinned-specs.mjs:324 x2, :255 x8, :236 x10 | strong; scans of run-playwright.mjs weak | `return` hides the E2E half (:159) | keep, fix :159 |
| validation-cli | invalid/uncovered requests cannot report green | pass 25, 8.8s | hit (cdp) pick-tests.mjs:426 x3, sync-pr.mjs:135 x1, :95 x4, ratchets.mjs:311 x1 (other tools not probed) | mostly strong; `assert.ok(report.changes)` (:274) | 12 unrelated tools in one file; mock game object | regroup |
| verify-live | deploy verifier compares live bytes to stamped tree | pass 5, 0.4s | hit (cdp) verify-live.mjs:29 x13, :78 x5, :119 x3 | mixed: "exact hashes" test (:43) asserts a substring (:54) | served and checked-out bytes come from one Map | strengthen |
| vertex-pack | JS packer and GLSL decoder share a wire format | pass 13, 0.9s | hit (coverage) pack x2056, bindAttribs x2, toHalf x242058 (cdp src toHalf x157k) | strong round trips | GLSL decode macros only scanned; always one vertex | strengthen |
| viewer | 3D viewer builds what the engine builds | pass 5, 9.6s | hit (cdp) viewer-data.mjs:32 x5, :55 x3, :72 x3 | mixed | page inline script never executed | keep |
| visual-oracle | shared pixel oracle for visual specs | pass 2, 0.3s | hit (cdp) visual-oracle.js:2 x4, :13 x3 | mixed: no boundary or error cases | none | strengthen (cheap) |
| vm-page-lifecycle | VM page adapter pumps promises, runs hooks honestly | pass 12, 6.9s | hit (cdp) vm-page.js:266 x5; makeVmTest hit (coverage, child) x7 | strong | mock handle by design | keep |
| wait-for | wait tools replacing pgrep loops | pass 10, 1.6s | hit (cdp) wait-for.mjs:73 x17, :86 x4, deploy-status.mjs:25 x15 | strong (fake clock, exact elapsed) | cwd-relative paths; assumes PID 2147483646 free | keep |
| wait-polling | `waitForFunction` needs `polling` | pass 13, 35.2s | hit (cdp) wait-polling-lint.mjs:73 x8656, :135 x6 | strong lint cases; tree-state tests are a ratchet | career-boot scan belongs elsewhere | keep |
| wake-lock-vm | screen wake lock held for races | pass 13, 7.5s | hit (coverage) hold x16, drop x22, releaseLock x13 | mixed: two "degrades silently" tests (:209-233) assert only no errors | mock sentinel | strengthen |
| wgsl-bindings | WGSL programs only name bindings they declare | pass 4, 0.3s | **not-hit as behaviour**: only the template string at wgsl-chunks.js:14 is parsed (cdp x1); the module supplies strings and the checker lives in the test | strong (anti-vacuity, original-defect repro) | checker logic private to the test; dead branch :380 | keep |
| who-is-on-it | multi-session claim board | pass 17, 1.5s | hit (cdp) who-is-on-it.mjs:122 x4, :105 x9, :148 x8, :166 x5, :197 x2, :259 x4 | mixed/strong; vacuous `doesNotMatch` (:197, :199) | 3 greps of CLI wording; writes dangling objects to the real repo | strengthen |
| wind-speed | speed-scaled air-rush audio | pass 4, 0.6s | hit (cdp, vm src) engine.js windFromSpeed x4; coverage windFromSpeed x49, windCutoff x18 | mixed: fake `setTargetAtTime` is instant (time constants unverified) | whole WebAudio faked | keep |
| wind-vm | wind in the real game | pass 4, 26.5s | hit (coverage) vmaxMul x75180, carInto x24122, pin x15 | strong (bit-identical off vs still air) | none | keep |
| wind | pure wind model | pass 6, 2.1s | hit (coverage) sync x604, vmaxMul x7, latAccel x24, carInto x5, setLevel x3, gustCall x1, **pin x0** | strong; one regex scan of game.js | gustCall positive path unasserted | strengthen |
| workflow-lint | workflows clean under actionlint/zizmor | pass 1 + **4 skip**, 0.2s | **not-hit** (coverage lintWorkflows x0; binaries absent) | strong where it runs | skips locally | keep; see #11 |
| yaw-damp-speed | high-speed step-steer yaw overshoot band | pass 3, 7.0s | hit (coverage) player-forces `step` x2880 (name match across VM scripts) | mixed: `null <= 220` is true (:94-96) | constants pinned by regex | strengthen |
| yaw-low-speed-substep | no yaw-rate chatter at 3-4 m/s | pass 3, 13.7s | hit (coverage) player-forces `step` x2670 | **weak**: passes when yaw is zero (:97-109) | `P.speed` reset every tick; regex pins | strengthen |

## Top findings (ranked)
| # | file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|---|
| 1 | traffic-arc-buckets.test.mjs:77-215, 247-282 | The "full-field vs bucket" equivalence compares two hand-written scanners in the test. Production `Collide.scanTow` and `scanOtAhead` run 0 times (coverage); only `fillArcBuckets`/`forArcNear` and, in the last test, `scanTraffic` are production. The copies have drifted: they skip `finished` cars (:87, :128) while collide.js:175-177 keeps them as blockers | A regression in production AI traffic / tow / overtake scanning passes; this is the test named to prevent it | compare production scanners against one brute-force reference with current semantics (finished cars included, real BACK) | high |
| 2 | yaw-low-speed-substep.test.mjs:97-109 | Only `flips <= 4` and `step < 0.02` are asserted; `yawLast` (:78) is never asserted. A dead steering path gives flips=0, step=0 and passes | "no chatter" is vacuously true if the car does not yaw | assert `Math.abs(yawLast) > ~0.5` and `yrs.length === TICKS` | high |
| 3 | yaw-damp-speed.test.mjs:63, 94-96 | `rise_ms` is `null` when 10/90% is never reached (:63) and `null <= 220` is true in JS | a car that never reaches the yaw band passes the rise checks | `assert.ok(Number.isFinite(o.rise_ms))` first | high |
| 4 | verify-live.test.mjs:43-54 (module :119-120) | Server and checkout bodies come from one Map, so the `live bytes differ from checked-out commit` branch cannot fire; title says "exact hashes", assert is `includes("does not match shell")`. No test for index.html mismatch or a missing lazy-integrity block | the release verifier's second error path and its cheapest regressions are unguarded | serve different bytes from the checkout; assert hashes in the message | high |
| 5 | validation-cli.test.mjs:274 | `assert.ok(report.changes)` is true for any object | `presetChanges` check mode could report nothing and pass | assert the planted change's key / count | high |
| 6 | test-observed.test.mjs:135 | observed-log half is `t.skip` whenever `artifacts/logs` is absent (gitignored, so always in CI); this run shows `# SKIP` on test 11 | the reporter-format compatibility the file exists for is never checked in CI | parse a committed sample log line with `parseLiveReporterLine` | high |
| 7 | tumftm-import.test.mjs:97-98 | `racelineOffsets` assert is `abs(mean) > 0.05 \|\| any abs(v) > 0.5`; the synthetic raceline is inset ~2 m | wrong sign or magnitude passes | assert mean ~ +/-2 with the expected sign. Also :28 title says three missing, data lists four | high |
| 8 | trim-comments.test.mjs:67-80 | KEEP-keyword test ignores exit status and only asserts the text survives; no removable line in the same file | a no-op tool passes; `measured` is not shown to be what saves the line | add a removable block to the same file and assert it goes | high |
| 9 | wake-lock-vm.test.mjs:209-233 | the two "degrades silently" tests assert `errorsSince(m) == []` only; no request counter | passes if the game never asks for a lock | count `request()` calls; assert >= 1 | medium |
| 10 | who-is-on-it.test.mjs:195-199, 237 | `doesNotMatch(out, /ago {2}STALE /)` and `/hidden — older than/` run against the live repo with `--no-fetch`; with no stale rows they cannot fail. :237 hard-codes the deploy branch; three more tests grep CLI wording | looks like a `--all` test, tests nothing in a clean checkout | feed a fixture listing to `main()` with injected git | medium |
| 11 | workflow-lint.test.mjs (4 of 5 tests skip) | here `lintWorkflows` ran 0 times; actionlint/zizmor are not installed (`tools/env/install-lint-bins.sh`), so only the suppression scan guards locally | workflows can break while a local run says green; `APEX_REQUIRE_LINT_BINS=1` is not default | install bins in the SessionStart hook, or require them in the pre-push gate | medium |
| 12 | tools-runnable.test.mjs:520-599 | report-server HTTP test: coverage shows `safeName`/`createReportRoute` never flush from the SIGTERMed child, so I could not prove the test reaches them (it passes). Also weak `--help` checks (:285-316) | the one network-facing tool's traversal guard has no proof of reach | have the server exit cleanly so coverage flushes; add one in-process call | medium |
| 13 | test-groups.test.mjs:78, 315-337 | `RULES.slice(2)` assumes the first two rules are the "always" rules; the pinned-project test is documented dormant (`matched === 0`) | reordering RULES silently changes what is checked; the dormant test only has the fallback assert | flag rules explicitly; test the logic on a synthetic scripts table | high |
| 14 | sweep-shards.test.mjs:19-20 | only coverage-once and `seconds > 0`; balance never asserted; no check that `SWEEP_TIMINGS_SEC` keys are real files | LPT packing or a stale key degrades CI shard balance silently | assert spread and exact fallback seconds; cross-check keys vs package.json | medium |
| 15 | twinned-specs.test.mjs:159 | `if (APEX_RUNNER_E2E !== "1") return;` passes the test with its second half unrun | report overstates coverage | split into a `{ skip }` test | medium |

Further, lower-ranked items (read-verified): sync-pr-robust.test.mjs:12 (fake git matches by substring, never asserts argv) and :32 (title says process tree; no descendants); tools-a12-guards.test.mjs:123 (generator list is hand-written, not discovered from tools/gen); wind.test.mjs gustCall positive path never asserted (calls=1, the off-level null); vertex-pack.test.mjs always packs one vertex (:64-66) and the GLSL decode macros are only scanned; wind-speed.test.mjs:27 fake `setTargetAtTime` sets value instantly so glide constants are unverified; surface-id-parity regexes run on comment-containing source; wgsl-bindings.test.mjs:380 dead `m.group ? ...` branch; throttle-latch.test.mjs:276 `match(...)[0]` throws a TypeError, not an assertion; viewer.test.mjs `import("sharp")` is unconditional; validation-cli.test.mjs is 12 unrelated tools in one file.

## Gaps (grep'd tests/ before listing)
- `Collide.scanTow`, `Collide.scanOtAhead`: nothing in traffic-arc-buckets runs them (coverage 0); `race-step-snap.test.mjs` also references scanTow, I did not check whether it runs it.
- tt-lap-validity-vm: qualifying cut, AI cuts, and the practice-lap branch of `lapValid` have no test here.
- `Wind.gustCall` positive path; `Wind.pin` (0 calls in wind.test.mjs; covered only by wind-vm).
- tooling-fast `selectToolingFastChanged` branches `tracked`, `docs-only`, `unmatched`, `no-pin-match`; `buildToolingFastPinIndex`.
- test-bg.mjs `start()` load refusal, `supersede`, `spawnGroup`, `stop`, `sweep`, `waitDeadlineFromMin`.
- sweep-shards CLI (`--shard` range, `--json`) and `sweepFilesFromPackage`.
- twin-fidelity `withMutant` / `runSpec` (restore-in-finally) and a catcher-name-to-title check.
- three-inspector async `enable` (import failure, token cancel).
- who-is-on-it `main()` claim/release flow, `pushClaim`, `--hours`.
- verify-live html mismatch, `jsonBlock` missing, ECONNRESET retry, 429/502/504.
- report-server quota/413 path.

## Not run
- Nothing skipped by me. Skipped by the files themselves: workflow-lint (4 tests, actionlint/zizmor not installed), test-observed (1 test, no live-reporter log). validation-cli: only pick-tests, sync-pr and ratchets were breakpointed, not its other tools. Debugger notes: `tools-runnable` report-server and `workflow-lint` are not-hit as stated; `surface-id-parity` is n.a. (a pure source-text scan, itself a finding); `wgsl-bindings` only parses strings. No repo files edited; tolerances, quarantines and ratchets untouched.

---
_Generated by [Claude Code](https://claude.ai/code)_
