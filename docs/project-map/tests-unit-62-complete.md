# Unit group 62 — complete source map

Read-only mapping of all 20 assigned files, 4260 lines. Every source line was read in individually returned windows of at most 98 lines (most 75–95), below 10000 characters; no test, browser, runtime edit or commit performed. Case and assertion spans below use original test line numbers. SHA256 covers complete file bytes. Assertion spans list complete call ranges (including multiline messages), with shared helper checks identified separately. Case names retain source spelling; generated families and table rows are expanded in notes. Source-text guards establish syntax presence, not execution.

LSP evidence: attached apex-lsp references (files mode) resolved WGX at wgx.js:11 to gfx.js; WGXDebugLabels at wgx-debug-labels.js:8 to wgx.js; WheelState at wheel-state.js:14 to player-forces.js; Wind at wind.js:39 to game.js, race-settings.js, particles.js and engineer.js; BitmapDecode at bitmap-decode-client.js:12 to assets.js; Assets at assets.js:4 across its rendering/build callers. XrBoot at xr-boot.js:9 reaches game/camera/car/mirror/broadcast/UI; XrSession at xr-session.js:18 reaches boot/UI/ApexXR; XrInput at xr-input.js:13 reaches session; XrRig at xr-rig.js:16 reaches boot/session/input; XRPlan at xr-plan.js:13 reaches opts/ApexXR; XROpts at xr-opts.js:14 reaches ApexXR/session; ApexXR at apex-xr.js:15 reaches renderer-boot/opts/boot; PlayerForces at player-forces.js:13 reaches game.js. GameAudio resolved engine.js:4 (stub homonym explicitly distinguished) with game/audio/lazy caller graph. These are source navigation results, not runtime verification.

## tests/unit/wgx-free-retire.test.mjs

Fixture/support ranges: 7–39 sources; 52–380 GPU harness; 382–385 geometry/helpers.

Complete read: 1–498. SHA256: `97c995ad9a068f1627f35db81f2cd23cb2032956b365cdcb4060323fa3aacd02`.

Fixture: VM of manifest-ordered WebGPU seams and shared shader/math/packing modules; fake GPU descriptors, resource destroy flags, scope stack, stalled readback and controlled timer. TRI, two instance matrices and 1001 road/prop quads exercise resource owners.

Targets: WGX.create / mesh and instanced/chunked frees in js/render/webgpu/wgx.js, WGXChunked, WGXShadow and WGXPost.

Semantics and limits: Pins balanced boot error scopes despite abandoned readback, best-effort submit validation and destruction after the owning submit; out-of-frame frees are immediate. Mock submit never executes GPU commands; no actual native safety or rendering proof. Most broad harness feature switches are unused here; extracted fixture is much larger than seven cases. Unref real watchdogs; no backend dispose asserted.

| Case name | Case range | Assertion spans |
|---|---|---|
| the swapchain self-test holds no error scope across its mapAsync | 392–404 | 396, 397, 398–399, 402, 403 |
| the swapchain self-test still reports a validation error from its submit | 406–421 | 416, 419, 420 |
| freeMesh retires its buffers while a frame is recording and destroys them at the submit | 425–436 | 430, 431, 433, 435 |
| freeMesh outside a frame destroys at once | 438–445 | 444 |
| freeMesh retires while only the pending shadow encoder is live | 447–460 | 456, 457, 459 |
| freeInstancedBatch retires the instance and shadow buffers in-frame | 462–475 | 470, 472, 474 |
| freeChunkedMesh retires its buffers in-frame (road ribbon and prop chunks) | 477–498 | 491, 492, 494, 496 |

## tests/unit/wgx-labels.test.mjs

Fixture/support ranges: 15–16 reads; 47–108 labels/GPU harness; 180–202 capture harness.

Complete read: 1–250. SHA256: `b9c0e59548f68ba5ce306089fa03ee02845dec347fb7455d6d9d2ac10c58485c`.

Fixture: VM fake GPU records descriptor labels and encoder debug groups; DOM/script and storage fakes control capture load success, failure and cancellation; vendored files read for SHA256.

Targets: WGXDebugLabels in js/render/webgpu/wgx-debug-labels.js; ApexGpuCapture in js/agent/apex-gpu-capture.js; wgx.js, apex.js, tools/manifest.cjs, vendor/gpu-capture/MANIFEST.json.

Semantics and limits: Generated labels, authored labels, debug group pairing and diagnostic names are behavioral; registration/default-off checks are source text. Capture stale completions cannot activate or clear a newer mode; failed scripts can retry. Vendor hashes and license presence do not execute vendor APIs or prove native diagnostics. Counters reset per labels VM; capture disable exercised only selected races.

| Case name | Case range | Assertion spans |
|---|---|---|
| GPU capture retries a failed vendor request with a fresh script | 18–45 | 36, 37, 39, 40, 43, 44 |
| WGXDebugLabels.install stamps labels on every create* descriptor | 110–124 | 120, 121, 122, 123 |
| install preserves an author-supplied label | 126–132 | 131 |
| beginRenderPass push/popDebugGroup names the pass label | 134–145 | 141–144 |
| a WGX validation-shaped message names the labelled object | 147–158 | 154, 155, 157 |
| wgx.js installs labels after a healthy requestDevice | 160–164 | 162, 163 |
| apex-gpu-capture is off by default and registered with one apex.js line | 166–178 | 168, 169, 170, 171, 173, 176, 177 |
| disabling GPU capture while Spector loads cannot start spying afterward | 204–218 | 208, 209, 214, 215, 216, 217 |
| an old GPU capture load failure cannot clear a newer mode | 220–234 | 224, 227, 228, 231, 232, 233 |
| vendored Spector + webgl-lint are hash-pinned and licensed | 236–250 | 240–244, 246, 247, 248, 249 |

## tests/unit/wheel-state.test.mjs

Fixture/support ranges: 16–38 loader; 50–53 axle defaults.

Complete read: 1–191. SHA256: `79ca34482ed7ed01803cc73e8ed7cfc7df7dd64c9934891b95720b9e5ac921e8`.

Fixture: Fresh VM per case loads mat4, consts, tyre-model and wheel-state; demand/capacity defaults, 1/60 s integration and synthetic forward/reverse rim states.

Targets: WheelState.axleStep / stepPlayer in js/physics/wheel-state.js, consumed by js/physics/player-forces.js.

Semantics and limits: Opt-in default and lock, spin, combined-slip, acceleration, placement resync, coasting and reverse-direction classification are numerical contracts. Isolated wheel force output does not prove whole-car handling or UI telemetry. Fresh VMs isolate enabled state.

| Case name | Case range | Assertion spans |
|---|---|---|
| WheelState defaults OFF and exposes axleStep / stepPlayer | 40–46 | 42, 43, 44, 45 |
| a brake demand above the front's capacity locks it (κ → −, wheelLock > 0, shortfall > 0) | 55–70 | 66, 67, 68, 69 |
| the same demand inside capacity never locks: κ settles at demand/capacity × peak | 72–84 | 81, 82, 83 |
| drive demand above the rear's capacity spins it (κR → +, wheelSpin > 0) | 86–101 | 97, 98, 99, 100 |
| an accelerating body under a gripping throttle reads no phantom lock (κR stays +) | 103–115 | 113, 114 |
| combined slip: a cornering rear pays for the same drive with more κ and less lateral grip | 117–130 | 127, 128, 129 |
| a placement (speed step > RESYNC_A·dt) re-syncs the rims instead of reading slip | 132–141 | 139, 140 |
| coast / free-roll keeps \|κ\| small and latScale ≈ 1 | 143–154 | 148, 149, 150, 151, 152, 153 |
| past the peak the lateral share is the sliding force's direction, not a 0.05 cliff | 156–162 | 160, 161 |
| axleStep runaway brake drives κ negative within ~100 ms | 164–177 | 175, 176 |
| reverse travel: a rim slower than the body is LOCKED, faster is SPINNING (travel direction, not raw κ sign) | 179–191 | 187, 188, 190 |

## tests/unit/wind-speed.test.mjs

Fixture/support ranges: 20–95 audio harness; 97 PH.

Complete read: 1–166. SHA256: `af9bc5dc9b8748d1407270975679c4c5c23198684ecc21bc708c976552508a9a`.

Fixture: Fake WebAudio nodes/AudioParams and delayed sample fetches run tone-model, signal, soundtrack, radio-fx and engine; 44100 Hz synthetic sample and PH engine context.

Targets: GameAudio.windFromSpeed / setEngine in js/audio/engine.js.

Semantics and limits: Crawl gate, monotonic gain/cutoff, quiet pit pace and speed-following glides are checked; steady frames allocate no nodes and do not reschedule. Fake params apply targets immediately, so ramp time constants and audible artifacts remain unproved. Shared live Set cleared at boot; no engine teardown contract.

| Case name | Case range | Assertion spans |
|---|---|---|
| windFromSpeed is silent at or below the crawl gate | 99–104 | 101, 102, 103 |
| wind gain and cutoff rise monotonically with speed | 106–123 | 111, 112, 114, 115, 121, 122 |
| setEngine wind level and cutoff follow speed, gated on the grid | 125–140 | 128, 138, 139 |
| setEngine wind ramps via setTargetAtTime and creates no nodes per frame | 142–166 | 153, 154, 155, 156, 160, 161, 164, 165 |

## tests/unit/wind-vm.test.mjs

Fixture/support ranges: 17–44 setup/teardown/straight runner.

Complete read: 1–87. SHA256: `36bae8443bb09575ea6badb5c8f55e62e6bb0458ce8c22571137f48f398a09d3`.

Fixture: One real createGame VM on Monza; longest aero straight, seeded fixed head/tail/crosswinds, driving help 0.7; rain AI-only run forces inters for 45 seconds.

Targets: Wind integration in js/game.js and js/race/wind.js; TyreModel.aquaplaneSafeV and AI pace integration.

Semantics and limits: Relative top-speed shifts, exact still/off trace equality, lateral nudge cap and AI safe-speed/non-retirement are in-game numerical evidence with inert DOM and no rendering. Pin cleared after each straight and in after; game closed.

| Case name | Case range | Assertion spans |
|---|---|---|
| a 30 km/h headwind costs top speed and a tailwind gives it back — a few km/h each way | 46–54 | 52, 53 |
| still air is the OFF level to the bit: wind 0 leaves the driving model untouched | 56–60 | 59 |
| a crosswind nudges the car sideways, within the cap | 62–68 | 66, 67 |
| AI on inters in standing water lifts at the aquaplane speed and keeps it on the road | 70–87 | 83, 84, 85, 86 |

## tests/unit/wind.test.mjs

Fixture/support ranges: 19–28 loader.

Complete read: 1–142. SHA256: `ebdbf1a7e6d215fbf5ee22cc2851deac475aa6f5e0831e3989561189436dd845`.

Fixture: Fresh Wind VM with mat4/consts, seedLog; seed/weather/circuit/time sampling, heading projection and pinned wind. Source reads race-settings plus gameSource helper.

Targets: Wind in js/race/wind.js; callers game.js, race-settings.js, fx/particles.js, race/engineer.js.

Semantics and limits: Deterministic walked/jumped clocks, exposure/weather ordering, bounded gusts/side forces, small drag changes, off no-op, 90-second gust-call bucket and pin lifecycle. Settings/boot persistence only source patterns. Finite sample sweeps do not establish every seed/time; fresh VMs isolate levels.

| Case name | Case range | Assertion spans |
|---|---|---|
| the wind is a pure function of (seed, circuit, weather, clock): fresh modules agree, walked or jumped | 30–39 | 34, 36, 37, 38 |
| fog is calm, a storm gusty; exposed circuits windier than sheltered streets | 41–54 | 52, 53 |
| gusts are bounded: total speed ≤ MAX_SPEED, side force ≤ LAT_CAP, and a strong gust is reachable | 56–75 | 65, 68, 69, 72, 73 |
| a headwind costs top speed and a tailwind gives it back — a few km/h at 30 km/h | 77–92 | 79, 82, 83, 87, 88, 90, 91 |
| level OFF is a true no-op: calm state, vmaxMul exactly 1, latA exactly 0 | 94–107 | 98, 99, 101, 102, 103, 104, 105, 106 |
| gustCall fires with a bucket in a strong gust, once per ~90 s bucket, and never in calm air | 109–120 | 116, 117, 119 |
| pin() holds a fixed wind with no gusts; level off keeps it calm; null releases it | 122–134 | 125, 126, 127, 128, 130, 132, 133 |
| race settings offer WIND off/real and persist it (phone players can turn it off) | 136–142 | 138, 139, 140, 141 |

## tests/unit/worker-pack-strip.test.mjs

Fixture/support ranges: 21–44 data/worker VM; 81–109 fake Worker/client; 148–167 asset upload harness.

Complete read: 1–189. SHA256: `37953aab9f01c6dd57c315d9b6b5e96ae7e44502c0bc3717dd00a8398b80a9d7`.

Fixture: VM real bitmap worker uses native DecompressionStream, Blob and shipped high/low albedo/normal PNGs; sharp is independent byte decoder. Fake Worker runs real worker in VM or throws/crashes. Assets VM captures upload layers.

Targets: js/workers/bitmap-decode-worker.js; BitmapDecode in bitmap-decode-client.js; Assets strip hook in js/render/shared/assets.js; assets/pack/manifest.json.

Semantics and limits: Byte identity, response sequence/stride and transfer-list identity; tagged/garbage refusal, exact opt-in, sparse views, worker failures and page fallback parity. Transfer list is inspected, not physically detached by real Worker. Fake terminate is inert; no timeout/resource teardown assertion.

| Case name | Case range | Assertion spans |
|---|---|---|
| worker strip: high mat-albedo-256.png matches sharp byte for byte and transfers its buffer | 48–62 | 54, 56, 57, 58, 59, 60, 61 |
| worker strip: high mat-normal-256.png matches sharp byte for byte and transfers its buffer | 48–62 | 54, 56, 57, 58, 59, 60, 61 |
| worker strip: low mat-albedo-128.png matches sharp byte for byte and transfers its buffer | 48–62 | 54, 56, 57, 58, 59, 60, 61 |
| worker strip: low mat-normal-128.png matches sharp byte for byte and transfers its buffer | 48–62 | 54, 56, 57, 58, 59, 60, 61 |
| worker strip: a PNG it does not take answers pix:null; garbage answers error, never a throw | 66–79 | 74, 75, 77, 78 |
| client strip: OFF by default — null, and no worker is spawned | 111–118 | 114, 115, 116 |
| client strip: ON returns per-layer views equal to sharp, undefined where the pack has no layer | 120–135 | 126, 127, 131, 132, 133 |
| client strip: a worker that cannot spawn or crashes answers null (the page decodes as before) | 137–144 | 140, 143 |
| assets hook: flag ON uploads the worker's layers; a null answer decodes on the page, same bytes | 169–189 | 173, 174, 176, 178, 180, 184, 185 |

Generated strip case 48–62 expands high/low × each present manifest albedo/normal filename (data 44–47). Assertion spans 54–61 apply to every shipped manifest member; names interpolate the actual filename.

## tests/unit/workflow-harness.test.mjs

Fixture/support ranges: 1–26 Git fixture/plan; 73 capture helper; 91–138 bounded child program.

Complete read: 1–221. SHA256: `9e30566b95de32cf2cd1301a9107a602fd1a54931a7cce4e74baee0090715404`.

Fixture: Temporary committed Git repositories, frozen worktrees, injected rg and LSP backends, local HTTP server/client and spawned bounded Node probe child.

Targets: tools/mcp/workflow-harness-core.mjs, workflow-harness.mjs and workflow-harness-client.mjs.

Semantics and limits: Schema/path policy, immutable snapshots, budgets including concurrency, token protection, envelopes/transcripts, serialization/microtask bounds and startup/stop cleanup. Probe child has outer 5 s bound. The synthetic value, generated-module and escaping-module paths exist only in temporary repositories; wrong/outside scripts are refusal fixtures, never game modules. Most cases close worktrees but leave fixture base dirs; hostile child case removes base.

| Case name | Case range | Assertion spans |
|---|---|---|
| bounded tools report schemas, exact paths, bounds, and semantic errors | 28–44 | 30, 31, 34, 35, 36, 37, 38, 41, 42, 43 |
| ripgrep no-match, missing dependency and backend failures retain distinct outcomes | 46–55 | 50, 51, 52, 54 |
| snapshot is pinned, mutation is rejected, baseline excludes LSP, and cap is id-safe | 57–67 | 60, 61, 62, 65, 66 |
| HTTP token, client args-file, quiet envelope, semantic exit, transcript and cleanup | 69–79 | 74, 75, 76, 77, 78 |
| probe help documents the script and IIFE contract | 81 | 81 |
| HTTP probes bound serialization and microtasks, reject Promise completions, and recover | 83–145 | 142, 143, 144 |
| concurrent submissions cannot exceed a worker budget | 147–152 | 150, 151 |
| invalid plans fail before creating or registering a worktree | 154–163 | 156, 157, 159, 161, 162 |
| already queued calls stay invalidated after source is restored | 165–174 | 169, 172, 173 |
| post-snapshot setup failures remove the registered worktree | 176–185 | 182, 183, 184 |
| ignored mutations permanently invalidate a run | 187–192 | 190, 191 |
| LSP arguments use schemas and the frozen path policy while RPC metrics reset per call | 194–199 | 198 |
| fake LSP enforces file paths and records RPC metrics independently for every call | 201–208 | 204, 205, 207 |
| tool descriptors are JSON Schemas and client help is value-free | 210–214 | 211, 212, 213 |
| malformed tool values are transcripted and unknown client options fail | 216–221 | 218, 219, 220 |

The child program string inside case 83–145 carries additional assertion spans at source lines 104, 117–118, 122, 125–126, 129–130, 132–133 and 135–136: HTTP success, five hostile timeout/recovery probes, three Promise completion refusals, synchronous/log/getter/toJSON values, script completion/null and worktree/stopped cleanup. They are string-embedded executable assertions rather than outer AST calls.

## tests/unit/workflow-lint-ci-plan.test.mjs

Fixture/support ranges: 16–27 YAML lookup helpers; 56–77 fake-gh runner.

Complete read: 1–107. SHA256: `2b6fa4cccfe864821a77ef926abba8ac8c978079826cc51fc8bd2249bead16f6`.

Fixture: Parsed production workflow YAML by named job/step; fake gh records fold-shell argv and refusal behavior in temp dir, removed finally; coverage gate shell invoked with synthetic env.

Targets:  .github/workflows/ci.yml; ratchets-fold.yml and changelog-fold.yml; base-green.sh / behind-ship.mjs named by structural checks.

Semantics and limits: Push plan narrows only on previous green; train/PR geometry bypasses lookup; behind-ship PR-only; refused fold PR dispatches CI and one issue then fails; coverage gap fails PR but warns train. Fake gh has no network; selected script tails and patterns do not run complete workflows. js/lonely is a synthetic gap string.

| Case name | Case range | Assertion spans |
|---|---|---|
| ci.yml: only `green` narrows the node plan on a push; the train and a PR need no lookup | 29–37 | 31, 32, 33, 34, 35, 36 |
| ci.yml: the sweeps filter's circuit lane needs no base-green lookup | 39–45 | 43, 44 |
| ci.yml: behind-ship is a non-blocking PR-only step in the structural guards job | 47–54 | 49, 50, 51–52, 53 |
| fold workflows FAIL when gh pr create is refused, and open one issue instead of a warning (audit3 #5) | 79–97 | 82, 85, 88, 90–91, 92, 94, 95 |
| selected-verdict reds a PR on a touched js dir with no coverage; the train only warns (ci-7d C7) | 99–107 | 100, 102, 104, 105, 106 |

Shared/fixture assertion calls outside test callbacks: 20, 25. These preconditions/helper checks contribute to calling cases.

## tests/unit/workflow-lint.test.mjs

Fixture/support ranges: 19–27 skip/resolver helpers; 77–107 CLI shim fixture.

Complete read: 1–134. SHA256: `81875514b507a600ba3316e6425e6bc332bb9e728816a89cda4dd632e9ee6d6c`.

Fixture: Real lintWorkflows and binary resolver; planted good/bad YAML; temporary CLI shim executables including a shellcheck path with spaces, removed in t.after.

Targets: tools/check/workflow-lint.mjs; tools/lib/lint-bins.mjs; .github/actionlint.yaml, .github/zizmor.yml and workflows.

Semantics and limits: Real linters may skip locally unless required; planted defects guard against inert lint execution; narrow suppressions and reasoned inline ignores. Shims establish override forwarding/finding propagation/unavailable override handling, not actual linter correctness. Fixture parent artifacts directory remains.

| Case name | Case range | Assertion spans |
|---|---|---|
| the tree's workflows are clean under actionlint | 29–32 | 31 |
| the tree's workflows are clean under zizmor (offline) | 34–37 | 36 |
| actionlint FAILS the planted bad workflow and passes the good one | 39–45 | 41, 42, 44 |
| zizmor FAILS the planted bad workflow and passes the good one | 47–54 | 49, 50, 51, 53 |
| the suppression configs stay narrow and reasoned (no blanket off) | 56–73 | 58, 60, 63, 64, 69, 70 |
| actionlint receives the resolved PATH-external shellcheck and propagates its finding | 109–121 | 112, 114, 115, 117, 119, 120 |
| an unavailable authoritative shellcheck override is skipped and explicitly disabled | 123–134 | 126, 128, 129, 131, 132, 133 |

Shared/fixture assertion calls outside test callbacks: 23. These preconditions/helper checks contribute to calling cases.

## tests/unit/world-physics-vm.test.mjs

Fixture/support ranges: 22–49 one-boot setup, cleanup, numeric helpers and race reset.

Complete read: 1–157. SHA256: `dc8308ab6c78fbc987671e507eff9bafc8e52bd8b4258e1c2a93b6dd77e9817f`.

Fixture: One createGame Monza VM; resets physics/headless before race, PACE 1, direct controls, jumps and fixed steps; errors read console/rejection records.

Targets: js/game.js / PlayerForces, track/AI integration via __apex; browser counterpart tests/specs/world-physics.spec.js.

Semantics and limits: Six numerical/error contracts cover progress, steering sign, assist cornering, AI progress and wheelbase response. Inert DOM excludes RESPONSE slider wiring and browser pageerror semantics; shared VM is closed after suite. Helper gt/lt assertion spans apply to each numerical call.

| Case name | Case range | Assertion spans |
|---|---|---|
| loads and runs a race with no uncaught errors | 51–58 | 57 |
| progress advances ~linearly with speed | 60–72 | 70, 71 |
| steer direction: +steer goes right (+x), -steer goes left | 74–88 | 86, 87 |
| no input runs wide with road-follow off; tracks the corner once switched on | 90–119 | 114, 116, 117 |
| AI stays on track and progresses after the racing-line flip | 121–136 | 133, 134, 135 |
| a shorter wheelbase turns in more | 138–157 | 156 |

Shared/fixture assertion calls outside test callbacks: 25, 26. These preconditions/helper checks contribute to calling cases.

## tests/unit/wx-grid.test.mjs

Fixture/support ranges: 5–9 imports; 47–54 pixel fixture; 64–70 lighting means; 79 turn fixture.

Complete read: 1–97. SHA256: `a1f5626cd3cc47a3dfc7e3e11b2333a4130caf2fa94e02ad5279c694c044f8ed`.

Fixture: Pure imported functions; synthetic 4x2 RGB buffer, lighting cell means and turn arrays.

Targets: tools/shot/lib/wx-grid.mjs.

Semantics and limits: 24-cell weather/time ordering, capture defaults, tile dimensions, Rec.709/saturation, statistics and invalid input, ratios, one-based turns and rebuild order. Does not capture browser pixels or validate actual lighting. No external lifecycle.

| Case name | Case range | Assertion spans |
|---|---|---|
| layout is 4 TOD × 6 weathers = 24, storm after rain | 11–25 | 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24 |
| sheetSize matches 6×4 labelled tiles | 27–33 | 29, 30, 31, 32 |
| luma709 and saturation01 are bounded | 35–44 | 36, 37, 39, 40, 41, 42, 43 |
| luminanceStats mean L / RGB / saturation over a flat buffer | 46–61 | 55, 56, 58, 59, 60 |
| lightingRatios: storm≈rain day and milky fog night | 63–76 | 72, 73, 74, 75 |
| turnFrac is 1-based into def.turns | 78–85 | 80, 81, 82, 83, 84 |
| sortCombosMinRebuild groups day vs dark | 87–97 | 90, 91, 93, 95, 96 |

## tests/unit/xr-backend-pin.test.mjs

Fixture/support ranges: 18–34 source loader/storage page/preferences; 63–73 UI harness.

Complete read: 1–82. SHA256: `3237030d38473fdcb05341e58e06496b139a9782ec593bafb16abc668f119fa7`.

Fixture: Fresh xr-boot VM per fake page over shared Map storage and reload counter; extra xr-ui VM fakes retained-capability mismatch.

Targets: XrBoot.ensureXrBackend / restorePinnedBackend / mountUi in js/xr/xr-boot.js; js/xr/xr-ui.js.

Semantics and limits: Three original renderer preference shapes restore exactly after a single pinned TLX-WebGL2 boot; missing/corrupt stash safe; retained caps path pins instead of starting incompatible session. Simulated reload never boots renderer; no native session.

| Case name | Case range | Assertion spans |
|---|---|---|
| ENTER VR on a GLX player: the pinned boot runs TLX-WebGL2, the next boot is the player's own pick | 35–49 | 39, 40, 41, 42, 47, 48 |
| ENTER VR on a WGX (WebGPU) player: the pinned boot runs TLX-WebGL2, the next boot is the player's own pick | 35–49 | 39, 40, 41, 42, 47, 48 |
| ENTER VR on a player on the defaults (both unset): the pinned boot runs TLX-WebGL2, the next boot is the player's own pick | 35–49 | 39, 40, 41, 42, 47, 48 |
| no stash, nothing restored; a corrupt stash is dropped without touching the pick | 52–59 | 54, 55, 57, 58 |
| armed retained-capability ENTER uses the reversible pin instead of a reload dead end | 62–82 | 75, 76, 77, 78, 80, 81 |

Generated case 35–49 expands label to a GLX player, a WGX (WebGPU) player, and a player on the defaults (both unset), from data 30–34.

## tests/unit/xr-cull-union.test.mjs

Fixture/support ranges: 21–88 VM, projections, poses, eye construction and sample checker.

Complete read: 1–125. SHA256: `f51068cc7285ce83f0b8543413bbd345dda60cdd07fac04da5ed861c4f98f524`.

Fixture: Real mat4/frustum/xr-rig/xr-boot VM with fake eyeFrames; asymmetric projection/pose construction and deterministic 40000 point/box samples per check.

Targets: XrBoot.applyEyes; XrRig composeEye; Frustum extraction/AABB in js/render/shared/frustum.js.

Semantics and limits: Both eyes survive shared culling with tight Quest union; rotated/canted/uneven eyes supported; mono exact eye0, flat untouched and invalid projection fallback. Sampling bounded synthetic geometry does not prove every headset or scene; identity and finite misses guarded.

| Case name | Case range | Assertion spans |
|---|---|---|
| a Quest-class asymmetric pair: the cull keeps everything the RIGHT eye sees, and stays tight | 90–97 | 93, 94, 95, 96 |
| head turned and pitched, and canted displays: still nothing an eye sees is culled | 99–104 | delegates to shared check (see below) |
| one drawn eye (IWER mono: a zero-width right view) keeps eye 0's matrix exactly; flat frames are untouched | 106–116 | 111, 114, 115 |
| a non-perspective eye falls back to eye 0 rather than culling with a broken frustum | 118–125 | 124 |

Shared/fixture assertion calls outside test callbacks: 69, 82, 83, 84. These preconditions/helper checks contribute to calling cases.

## tests/unit/xr-opts.test.mjs

Fixture/support ranges: 11–53 storage and boot VM.

Complete read: 1–127. SHA256: `772c4fdf936c7f74267dfec7e7149c7eef1eb05832da0052b410a77ced61f50f`.

Fixture: Map local/session storage, GameStore raw shim and navigator capabilities; VM xr-plan, xr-opts, apex-xr.

Targets: XROpts in js/xr/xr-opts.js; ApexXR in js/xr/apex-xr.js.

Semantics and limits: Defaults/invalid values, prefixed separate keys, nonpersisted boot override, fallback latch/reason and live control-source choice releasing XR-only input. No actual reload, device or native session; fresh storage per boot.

| Case name | Case range | Assertion spans |
|---|---|---|
| XROpts defaults: xr off, xrBackend webgl2 | 55–59 | 57, 58 |
| XROpts garbage values fall back to defaults | 61–65 | 63, 64 |
| XROpts keys use the apex26. prefix | 67–74 | 71, 72, 73 |
| arming VR does not modify apex26.gfxBackend (bootPick override only) | 76–88 | 86, 87 |
| ApexXR.bootPick is null when VR mode is off | 90–93 | 92 |
| ApexXR.noteFallback latches sessionStorage and logs | 95–101 | 98, 99, 100 |
| ApexXR.plan records webgpu→webgl2 when XRGPUBinding missing | 103–114 | 111, 112, 113 |
| VR driving input applies live and releases only XR-owned samples | 116–127 | 119, 120, 121, 122, 124, 126 |

## tests/unit/xr-phase0.test.mjs

Fixture/support ranges: 12–31 waiter; 60–69 rig/input boot; 442–540 deferred/native-session/space/clock harness; 896–915 capability loader harness.

Complete read: 1–1192. SHA256: `4a8560f0155a35572d1dbd4a1b506eca308ab0536dcc0b46197c7b87f32f378a`.

Fixture: VM rig/input/session/boot/UI with seedLog; virtual waiter clock; fake XR sessions/reference spaces, controlled promises and rAF queues, mathematical offset composition; actual pinned IWER classes with installation stub; TLX ownership methods sliced from shipped source.

Targets: js/xr/xr-rig.js, xr-input.js, xr-session.js, xr-boot.js, xr-ui.js; js/camera/mode-switch.js, vantage.js; js/render/three/tlx.js; tests/helpers/iwer-install.mjs.

Semantics and limits: Covers math, mapping, ownership and lazy boot transitions. No WebXR runtime/headset/GL presentation; source slicing can break on method markers. All explicit running sessions generally end; several visibility/UI cases leave only VM-owned fake callbacks. wait watchdog really timers but virtual producer never creates browser workload. near helper tolerance 1e-5 at line 539; waiter and install helpers are support, not production modules.

| Case name | Case range | Assertion spans |
|---|---|---|
| XR waiter uses one evaluation and requires progress beyond a nonzero baseline | 33–37 | 35, 36 |
| XR waiter rejects frozen and exactly-delta frames within the original budget | 39–45 | 42, 43 |
| XR waiter cannot accept progress first observed at the deadline | 47–51 | 49, 50 |
| XR waiter's Node watchdog rejects a blocked evaluation without page timers | 53–58 | 56, 57 |
| XrRig.stickToSteer deadzones and signs | 72–79 | 74, 75, 76, 77, 78 |
| XrRig.composeEye puts the seated eye at the world anchor with identity HMD | 81–98 | 95, 96, 97 |
| XrRig recenter defines the seated origin in the base space, not an inverse pose | 100–107 | 105, 106 |
| XrInput.mapFrame: right trigger thr, left brake, stick steer, stable squeeze gaze, edges | 109–161 | 143, 144, 145, 146, 147, 148, 154, 155, 156, 159, 160 |
| XrInput.inject feeds Input.remoteSample / remoteEvent | 163–182 | 176, 178, 179, 180, 181 |
| XrSession.sessionInit lists webgpu only when preferred; featureGranted reads enabledFeatures | 184–196 | 190, 192, 193, 194, 195 |
| vendor ships XRButton / VRButton / WebGLXRFallback and pinned IWER under tests/vendor | 198–216 | 205, 208, 209, 210, 212, 213, 215 |
| XrBoot façade: comfort off until presenting; applyEyes null outside XR | 218–229 | 222, 223, 224, 225, 226, 227, 228 |
| B4: XrBoot.afterTick dedupes window rAF so EXIT VR cannot double-loop | 231–256 | 247, 248, 249, 251, 253, 254, 255 |
| B5: VR cockpit cam override does not persist; restore returns to saved mode | 258–283 | 276, 277, 278, 280, 281, 282 |
| B3: ensureXrBackend refuses silently only when storage is blocked; else pins TLX+forceGL | 285–315 | 299, 300, 301, 302, 303, 304, 313, 314 |
| a pending VR entry waits for a fresh tap after renderer reload | 317–358 | 333, 347, 348, 349, 350, 351, 357 |
| CamModes.setCamMode({persist:false}) skips store.write | 360–383 | 378, 379, 381, 382 |
| XrUi.mount creates hidden #xr-enter until capability probe says yes | 385–438 | 395, 430, 431, 432, 434, 435, 437 |
| XR seated origin removes floor height and yaw, preserving stereo, pitch/roll and head movement | 542–570 | 552, 553, 557, 559, 560, 561, 564, 565, 567 |
| XR identity gaze remains car-forward across repeated recenter; unavailable pose waits for calibration | 572–586 | 576, 579, 582, 584 |
| XR transition cancels queued window tick and rejects stale callbacks across exit and re-entry | 588–609 | 592, 593, 594, 595, 598, 599, 601, 602, 604, 605, 608 |
| XR end during frame processing neither reschedules XR nor duplicates the window clock | 611–618 | 614, 615, 616, 617 |
| XR start is deduped and cancellation while requestSession is pending closes the late session | 620–630 | 625, 627, 628, 629 |
| XR ended during pending reference or renderer attachment cannot resume presentation | 632–650 | 642, 643, 644, 645, 646, 647, 648 |
| XR immediate retry survives stale reference resolve while replacement starts | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| XR immediate retry survives stale reference resolve while replacement presents | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| XR immediate retry survives stale reference reject while replacement starts | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| XR immediate retry survives stale reference reject while replacement presents | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| XR immediate retry survives stale attach resolve while replacement starts | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| XR immediate retry survives stale attach resolve while replacement presents | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| XR immediate retry survives stale attach reject while replacement starts | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| XR immediate retry survives stale attach reject while replacement presents | 653–689 | 670, 672, 674, 677, 678, 679, 680, 681, 683, 684, 685, 687 |
| TLX late XR compatible completion cannot overwrite or detach a replacement renderer session | 693–729 | 700, 720, 722, 723, 724, 725, 727, 728 |
| TLX late XR renderState completion cannot overwrite or detach a replacement renderer session | 693–729 | 700, 720, 722, 723, 724, 725, 727, 728 |
| XR reference, attachment and frame-request failures release ownership and keep one window loop | 732–750 | 740, 741, 742, 743, 744, 745, 746, 747, 748 |
| XR input accepts native indexed XRInputSourceArray without Array methods | 753–769 | 759, 762, 766, 767 |
| XR input injection failure releases controls and keeps rendering on one XR clock | 771–781 | 776, 777, 778, 779 |
| XR public recenter queues outside a frame, survives tracking loss, and applies on the next valid frame | 784–807 | 786, 789, 791, 792, 794, 797, 798, 800, 801, 805 |
| pinned IWER offset adapter restores standard rigid-transform viewer and stereo poses | 810–842 | 827, 834, 836, 838, 839, 841 |
| mountUi on a flat session does not fetch LAZY_XR | 844–863 | 859, 860, 862 |
| XrBoot.ensureXr: a retry after a failed load injects only the files not yet loaded | 868–890 | 886, 887, 888, 889 |
| fresh lazy XR boot publishes capability to settings and the next boot | 917–940 | 936, 937, 938, 939 |
| XrBoot.mountUi: a desktop browser with navigator.xr but no headset never fetches the XR bundle | 942–944 | 943 |
| XrBoot.mountUi: a headset (isSessionSupported true) fetches it | 946–948 | 947 |
| XrBoot.mountUi: a probe that throws, rejects or hangs keeps the old answer (fetch) | 950–955 | 951, 952, 953, 954 |
| XrBoot.mountUi: no navigator.xr fetches nothing; an armed VR mode or a pending enter fetches without probing | 957–964 | 958, 961, 962, 963 |
| XrInput prefers only a usable left stick and otherwise accepts the right controller | 967–984 | 971, 978, 981, 983 |
| XR overlay menu navigation is granted-only, edge-triggered and releases driving | 987–1004 | 992, 993, 994, 995, 999, 1001, 1002, 1003 |
| XR eye list is borrowed and shrinks exactly for a mono frame | 1006–1022 | 1013, 1014, 1015, 1016, 1017, 1019, 1021 |
| XR session asks for DOM overlay only when a document root exists | 1024–1031 | 1026, 1029, 1030 |
| nonidentity runtime reset waits for explicit recenter and cleans its base listener | 1034–1060 | 1044, 1045, 1047, 1049, 1051, 1053, 1056, 1057, 1059 |
| immersive cockpit blocks keyboard and latched look-back while flat cockpit still turns | 1062–1082 | 1075, 1077, 1079, 1081 |
| XR driving source choice preserves phone ownership and absent sticks do not claim steering | 1084–1106 | 1094, 1095, 1097, 1099, 1101, 1104, 1105 |
| live XR session obeys existing-controls choice and teardown preserves a newer phone sample | 1108–1124 | 1118, 1120, 1123 |
| XrRig.worldFromAnchorTo builds an orthonormal basis: -Z is the car's forward, +Y banks with up, translation is the eye | 1127–1141 | 1135, 1136, 1137, 1138, 1139, 1140 |
| XrBoot.present forwards to gfx.presentXR only when the backend can; setFoveation delegates or reports false | 1143–1165 | 1151, 1152, 1153, 1154, 1155, 1156, 1158, 1159, 1164 |
| XrUi.flashMessage disables the button for 3.5 s then restores the label; onClick shows the gate message and never starts a session | 1167–1192 | 1180, 1181, 1182, 1183, 1185, 1187, 1188, 1191 |

Shared/fixture assertion calls outside test callbacks: 539. These preconditions/helper checks contribute to calling cases.

Generated families: immediate retry case 653–689 expands phase reference/attach × outcome resolve/reject × replacement starts/presents (8 names); TLX case 693–729 expands compatible/renderState (2 names). Both semantic families assert replacement ownership survives old work; first also guards startup promise, error, frame clock and detach count. Shared check near (539) asserts numerical tolerance; sampled coordinate and pose loops invoke it at the listed spans. Fake loader tokens xr1/xr2 and plan/opts/apex/session/ui are roster sentinels, not JS paths; LAZY_XR test arrays name existing source but stub fetching.

## tests/unit/xr-plan.test.mjs

Fixture/support ranges: 11–26 VM/caps; 28–123 table.

Complete read: 1–161. SHA256: `fdf625f396413e5a4d865aef827594fb8de0b9f3035904ebfdfdbebda6322cf6`.

Fixture: Fresh XRPlan VM, 16 explicit capability/preference table rows, immutable prefs bag; GLX source inspection.

Targets: XRPlan.resolve in js/xr/xr-plan.js, used by xr-opts.js and apex-xr.js; js/render/glx/glx.js.

Semantics and limits: Pure resolver chooses off/GLX/experimental WebGPU with reasoned fallbacks and no prefs mutation; GLX xrCompatible is textual. Capability combinations are supplied, not queried from real browser.

| Case name | Case range | Assertion spans |
|---|---|---|
| XRPlan.resolve table (≥15 rows) | 125–147 | 127, 130, 131, 132, 134, 136, 137, 139–140, 143–144 |
| XRPlan never invents a gfxBackend write — resolve is pure | 149–155 | 154 |
| GLX getContext requests xrCompatible only when navigator.xr exists | 157–161 | 159, 160 |

Table scenarios (data ranges; all use assertion spans 130–144): no xr capability, vr off (29–33); xr present but immersive-vr unsupported (34–38); armed default → webgl2 / GLX (39–43); armed unset xrBackend → webgl2 (44–48); armed + webgpu with all caps → three / experimental (49–53); armed + webgpu missing gpu → fallback webgl2 (54–60); armed + webgpu missing XRGPUBinding → fallback webgl2 (61–67); fallback latch forces webgl2 even when webgpu caps ok (68–78); xr off ignores webgpu preference (79–83); garbage xr pref → off (84–88); garbage xrBackend → webgl2 when armed (89–93); xr=true boolean accepted as armed (94–98); Quest UA still arms webgpu experimental with a reason (99–104); empty input → off (105–109); armed with gfxBackend three still returns webgl2 override (never writes) (110–117); storage-blocked shape: missing caps.vr with xr on → off (118–122).

## tests/unit/xr-visibility-pause.test.mjs

Fixture/support ranges: 19–52 source loader, fake session, pause binding.

Complete read: 1–96. SHA256: `164543aa71017d1cf39d6d2c160109588fa6b246137fabd2cc3d6f279c501374`.

Fixture: VM real xr-session/boot with fake native session dispatching visibility/end and reference reset; spy pause/lost, optional pause binding.

Targets: XrBoot bound game pause path and XrSession visibility/reset ownership.

Semantics and limits: Blurred/hidden pause and release; visible does not resume; end pauses; absent pause safe; reset listener removed at end; public isVisible intentionally differs for blur. Several cases do not end fake sessions; no real timers/rAF/native resources allocated.

| Case name | Case range | Assertion spans |
|---|---|---|
| visible-blurred and hidden pause the race and drop the injected input; back to visible does not resume | 54–63 | 57, 58, 60, 62 |
| the headset session ending (taken off / exit) pauses too | 65–70 | 68, 69 |
| a game that binds no pause path still drops the input and does not throw | 72–76 | 75 |
| reference origin reset pauses and releases input once, with listener cleanup | 79–87 | 83, 84, 86 |
| visibility contracts differ on purpose: visible-blurred pauses (XrBoot: state !== visible) but XrSession.isVisible stays true until hidden | 89–96 | 92, 93, 95 |

Shared/fixture assertion calls outside test callbacks: 50. These preconditions/helper checks contribute to calling cases.

## tests/unit/yaw-damp-speed.test.mjs

Fixture/support ranges: 18–65 game setup/teardown, spatial pin and overshoot reducer.

Complete read: 1–121. SHA256: `34ecf7ace14e6a1f0f403b408bc0870a6ebc2e69044aac85648351d5826a8ba3`.

Fixture: One createGame VM, Monza straight spatial pin, seed42, retire other cars and speed-controlled step steer; source reads forces/consts.

Targets: PlayerForces in js/physics/player-forces.js.

Semantics and limits: Local speed damping 50→65 m/s and extra5 source pin; step overshoot/rise bands at 30/50/61.1/83.3; full-lock/lift-off shape. Spatial pin removes natural trajectory; no baseline bit comparison, coast token merely source-presence. Game closed.

| Case name | Case range | Assertion spans |
|---|---|---|
| speedYawDamp locals live in player-forces.js, not consts.js | 68–77 | 71, 72, 73, 74, 75, 76 |
| step-steer lock 0.5: ≤50 m/s unchanged; 61.1 ≤12%; 83.3 ≤14% | 79–99 | 86, 87–88, 89–90, 91–92, 94, 96, 97, 98 |
| fullLock yawMax and lift-off ratio stay on tip shapes | 101–121 | 111, 119, 120 |

## tests/unit/yaw-low-speed-substep.test.mjs

Fixture/support ranges: 17–79 two-game setup/teardown and chatter reducer.

Complete read: 1–117. SHA256: `6d390e8e7b1f79c1dfb03e7b0d141e459965aea3d270acd1a90b31d92395da81`.

Fixture: Two createGame VMs (pin/shipped seat), same Monza straight pin, seed42, constant speeds, warmup/settle and 58 measured ticks.

Targets: PlayerForces low-speed yaw integrator in js/physics/player-forces.js.

Semantics and limits: Local threshold8/substeps4 and multiplication-order source guard; yaw remains active with few sign flips and small median chatter at 3/4, pin also8 m/s. Stated high-speed bit identity is not directly compared. Both games closed.

| Case name | Case range | Assertion spans |
|---|---|---|
| LOW_YAW_* locals live in player-forces.js; fast-path rdot order preserved | 81–93 | 84, 85, 86, 88–91, 92 |
| pin seat: no Δr chatter at 3–4 m/s full lock; ≥8 m/s stays calm | 95–107 | 98, 99, 100, 101, 104, 105, 106 |
| shipped seat: no Δr chatter at 3–4 m/s full lock | 109–117 | 112, 113, 114, 115 |

## Cleanup assessment

No runtime cleanup changes proposed. Consolidation candidates are the oversized WGX harness and repeated XR storage/session fixtures, but preserving failure-shape fidelity matters more than reducing lines. Workflow harness temp base directories are not consistently removed even when worktrees close; lint fixtures and fake-gh dirs explicitly remove their own dirs. Mock GPU/native XR/audio teardown gaps are test limitations, not evidence of live leaks. Source guards of comments/tokens can outlive behavior; pair them with existing behavioral coverage before using as proof. This report adds no copied assertion predicates or historical path catalog.
