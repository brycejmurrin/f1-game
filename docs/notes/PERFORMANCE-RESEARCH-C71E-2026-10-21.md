# Performance and lifecycle research, 2026-10-21

Three distinct defects were reproduced and corrected: closing the opt-in Three.js Inspector left its renderer invalid; opt-in trace spans retained browser timing entries after recording stopped; and the persistent car sound controller suppressed pit-stop edges after a race-clock rewind. No general racing FPS improvement is claimed.

## Source and capability baseline

- Isolated shallow clone of `claude/f1-game-project-26h3ng`: `7b6a3a75158f8061d43b7b4c9618042f4a7de1a1`. Topic: `cursor/research-perf-c71e`. The moving deploy branch is not the experiment identity.
- Published HTML fetched at about 05:06 UTC on 2026-10-21 reports `apex-sha=eda39fd598b163032d1f96d69c710e8e50ca3839`, build `20150`. Public `version.json` contains only the build number. The legacy Pages-build API instead returned a July build and is unsuitable for live identity.
- [PR #3407](https://github.com/brycejmurrin/f1-game/pull/3407) was OPEN/DRAFT at `0dcb92eadf425e29e365f010b90918dc042d81d4`. All 59 file patches applied forward cleanly to this baseline; none applied in reverse. Its implementation had not landed in this baseline. Its draft CI skeleton skipped 19 of 20 jobs. Its measurements were excluded from this investigation's baseline.
- Other active work was checked through open PR filenames, recent branches, claims and fleet bus: road split, program warm, race entry, governor, atlas ownership, previous-world retention, screen observers, WGX post/reflections, HUD/settings and a separate `c91f` investigation. No patch here changes those owned paths. The audio regression strengthens an existing test outside #3407's touched lines; that overlap was announced on the bus.
- Runtime: static script-tag IIFE game with a small ES-module vendor island; no application framework. `tools/manifest.cjs` owns module order. TLX (Three) is default, GLX explicit/fallback, WGX opt-in. Libraries: patched Three.js `0.186.1`, Rapier `0.19.3`, Trystero `0.25.4`, JSQR `1.4.0`. Optional diagnostic vendors include Spector.js `0.9.30` and webgl-lint `1.11.4`. Playwright tooling is `1.63.0`.
- Host: authenticated `gh`, Node `24.19.0`, Chromium `154.0.8037.57`, V8 `15.4.80.11` in the browser. No physical GPU was exposed. The phone UA is emulated by Chromium, and does not establish Safari execution.
- Actually exposed: Context7 resolve/query, web search/open, GitHub connector, native spawn/message/follow-up/status/wait, shell. Plugin Management confirmed Context7 and GitHub installed. Apex/LSP/debugger/Chrome MCP tools were not attached; supported checkout CLIs were used. `ensure-mcp-ready.sh` ran once. Starting a local daemon did not attach tools to the host.
- Context7 resolved `/mrdoob/three.js`, but advertised only `r110` as an explicit version. Current examples were checked against installed `0.186.1` and tagged `r186` source. Rapier current output-target examples were rejected where `0.19.3` lacked that contract. MDN Context7 was also queried by the UI/audio lanes.
- Six native lanes performed bounded source/web investigation. The parent alone launched Chromium and drove CDP/debugger/profiles. Workers paused tests, microbenchmarks and LSP startups during timing. Read-only cross-review used different agents from the authors.

The deploy branch advanced to `50cc71dd` during the investigation. The source baseline stayed fixed. Shallow-history ahead/behind counts from repository status tools are not a complete ancestry comparison and can include the fetched merge's entire second-parent history.

## Ranked findings

| Rank | Trigger and status | Evidence and mechanism | Impact / ownership / action |
|---|---|---|---|
| 1 | Enable then close Inspector on actual TLX: **verified fix** | Before: actual renderer stores `null`; its next `render()` throws `Cannot read properties of null (reading 'beginRender')`. After: three real close-button cycles restore original InspectorBase and timestamp setting; rendering succeeds. | Diagnostic mode correctness and unnecessary timestamp work. `js/perf/three-inspector.js`; patched here. |
| 2 | `__apex.perf({on:true,measure:true})`: **verified resource improvement** | Before: 600 steps retain 1,800 entries, 1,200 retain 3,600; stop/reset retains 3,600. After: 264 and 528 retained, zero after stop/reset; observer and trace still receive all 3,600. | Bounds retained User Timing data below 512 per phase. Opt-in recording only; not default racing allocation savings. `js/perf/spans.js`; patched here. |
| 3 | Rewind race clock, then enter/leave pit box below old clock: **verified fix** | Baseline reseeds edges every frame until the old high-water mark; actual sounds are absent. Corrected finite clock adoption allows each new forward edge once, including a new race with a new car. | Persistent audio controller correctness. `js/audio/car-sfx.js`; patched here. |
| 4 | Scratch material readback partially completes: **controlled failure reproduction** | Actual Assets readback + TLX upload + real Three DataArrayTexture, injected nonthrowing GL readback failure: supplied layers `[1,2,3]`, completed `[1,3]`, texture reports ready, missing layer neutral. | Fallback/browser-bake reliability candidate; shipped all-raw PNG loading bypasses this path. TLX owned elsewhere; defer completion-set tracking and retry test. Natural-device incidence unknown. |
| 5 | WGX raw material upload: **operation-count finding** | Actual helper at 256 px allocates 4,456,448 staging bytes and copies 3,932,160 bytes per map; direct views preserve packed output. No timing/GC saving demonstrated. | Loading CPU-copy candidate, WGX under active ownership. Defer to owner with source/packed-output evidence. |
| 6 | Inspector close: **controlled console-retention reproduction**, plus source-supported listener candidate | The actual vendored console method fails to restore its default-null hook; the first detached Inspector still receives later messages. Serial toggles retain the first wrapper rather than proving unbounded chaining. Profiler/Timeline global listeners also lack corresponding cleanup. | Separate from fixed null-renderer defect. Do not describe this PR as complete Inspector leak cleanup. Needs browser listener/heap root comparison and generator-owned vendor patch. |
| 7 | Yawed dense collision SAT: **deferred experiment** | 40,000 helper cases match; full overlap trig calls 24→12. Ordinary four game scenarios call SAT zero times. Synthetic resolver timing ranges overlap and unchanged control moves too. | No ordinary-race benefit established. Candidate remains in evidence only; no physics patch. |
| 8 | Caption lifetime and older Safari zoom: **hypotheses** | Caption strip has no race-reset/expiry owner; older WebKit lacks `currentCSSZoom` used by some pixel sizing paths. | Needs actual spotter/transition reproduction and real-engine zoom comparison. No speculative UI patch. |

## Measurement and reproduction

Primary evidence is under `artifacts/research-c71e/`; the published evidence bundle linked from the PR preserves scripts, ledgers, raw profiles, source identities and negative findings. Regenerable reports are not committed as capture output.

Phone baseline: viewport 844×390 landscape, DPR 2, touch enabled (5 points), reduced motion queried and saved, seeded before awaited race construction, 22 cars, Monza GP race, dry default weather, shipped camera/quality, throttle true and steer 0.02. The baseline selected Three but **actually ran GLX**, on ANGLE Vulkan SwiftShader. Inspector validation deliberately pinned TLX's **actual WebGL2** path. No hardware WebGPU or phone-GPU timing claim follows.

```js
__apex.seed(42);
await __apex.race("monza");
__apex.go();
__apex.headless(true);
__apex.reset(0.02, 55, 0, 42);
__apex.setInput({ throttle: true, steer: 0.02 });
```

`agentHelp()` was read once on the initial game page. Every measured race asserted intended track, active race and a 22-car field, and recorded changing physical state. `headless(true)` suppresses drawing, not simulation. The baseline CPU sample used 3,000 warm-up steps and 12,000 profiled steps; allocation sampling used a separate 6,000 steps with collected objects included. A fresh unprofiled repeated comparison was kept separate from diagnostic sampling. The initial baseline-only timings were exploratory and are not an A/B improvement claim.

CPU self-time leaders in the captured diagnostic include `updateCar`, lateral dynamics, brake planning, tyre update and collision traffic. Most strongest-looking allocation sites overlap #3407 or other active work, so no duplicate patch was made. Allocation weights are sampled churn with collected objects included, **not retained live bytes**. Fixed-step time is **not rendered frame time**.

The native debugger stopped in `PerfSpans.end`, exposing `measure=true`, the open span, timestamps and actual call frame. The owned breakpoint was removed and the target resumed; detach reported no cleanup errors. Instrumentation was removed before timing. No source instrumentation is committed.

An unprofiled `ABBA BAAB` comparison ran the actual fixed-step game path with the baseline/candidate recorder methods, opt-in measures enabled, 3,000 warm-up and 6,000 timed steps per leg. Baseline median 1,428.55 ms (range 1,325.0–1,557.1); candidate median 1,356.05 ms (1,281.2–1,401.1), four legs each. Ranges overlap: **no speed win claimed**. Retained entries were consistently 18,000 versus 1,104. Raw physical start/finish fields matched; the cumulative `driving.insights.distance` counter differed across resets, so this is not an all-state parity claim. No source change here affects physics. The SAT candidate separately matched 443,063 normal-race and 2,668,310 spun-contact raw primitive values with `Object.is`, but its measured reach/cost did not justify shipping it.

For timing retention, Chrome trace uses both duration begin/end and zero-duration instant records. Counting starts plus instant records yields all 3,600 produced measures; 1,592 starts plus 2,008 instant records were observed. Named clearing preserved metadata and unrelated timeline entries. Clearing performance entries does not clear a separately retained observer queue before it is delivered.

Audio reproduction used the real CarSfx module and controlled race clocks/car identities. Baseline regression failed two cases; corrected reproduction passed three, including the existing 20 ms rewind tolerance. It is not a physical audio/device latency measurement.

## Why these changes match the actual APIs

Three r186's renderer setter detaches the old inspector, assigns the new value and calls `setRenderer(this)` on it; null is invalid. Restoring the prior InspectorBase lets the upstream detach release its supported panel resources. The patch changes only state still owned by this wrapper, preserves a later external replacement, and restores the prior timestamp flag. Import cancellation and failure paths retain valid ownership. See [Renderer source](https://github.com/mrdoob/three.js/blob/r186/src/renderers/common/Renderer.js), [InspectorBase source](https://github.com/mrdoob/three.js/blob/r186/src/renderers/common/InspectorBase.js), and [Inspector source](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/inspector/Inspector.js); the installed minified setter was exercised too.

User Timing appends measures to the browser's performance entry buffer. `clearMeasures(name)` removes that name from the global buffer, while active observers have their own queued entries. Blink emits trace records independently. The patch clears only names the recorder emitted, in batches of 512, and releases partial batches on stop/reset/measure-off. It leaves span statistics and unrelated measures intact. See [User Timing processing](https://www.w3.org/TR/user-timing/), [Performance Timeline](https://www.w3.org/TR/performance-timeline/), [named clearing](https://developer.mozilla.org/en-US/docs/Web/API/Performance/clearMeasures), [Chrome custom tracks](https://developer.chrome.com/docs/devtools/performance/extension), and [Blink implementation](https://chromium.googlesource.com/chromium/src/+/c701061e45c73c8b3669811f8ae8087301ae34a3/third_party/blink/renderer/core/timing/performance_user_timing.cc). Browser trace/observer experiments, rather than documentation alone, established preservation here.

The sound defect is an application state-machine error rather than an AudioParam scheduling optimization. A rewind must silently seed the current pit state and adopt the new finite clock in the same update. Subsequent forward transitions then run normally. No audio tuning, physics defaults, precision, tolerances or quality settings were changed.

## Negative findings and measurement traps

- `UiLayers.anyOpen`: 600 actual browser calls produced **zero** `getElementById` calls. Although a toolbar is described as lazy, boot explicitly creates it for layer ownership. Proposed cache rewrite rejected.
- Rapier `translation(target)` advice from newer docs does not apply to installed `0.19.3`; passing an extra object does not remove its returned-vector allocation. Debris is opt-in and its existing initialization is awaited.
- Three update-range support is present in r186. The r179 issue was fixed in r181; TLX already uses cached ranges/appropriate usage. Do not apply obsolete blanket advice from [issue 31814](https://github.com/mrdoob/three.js/issues/31814) without its [fix 31816](https://github.com/mrdoob/three.js/pull/31816).
- GLX blocking-query suspicion was on experimental occlusion culling, which ships off. No default-rendering stall was demonstrated.
- Dropping Three CPU attribute arrays can break later material/mirror uploads. Existing guarded code and prior blank-road evidence make a blanket removal unsafe.
- WGX padded-attribute allocation is not applicable to current aligned Float32 dynamic streams.
- BitmapDecode timeout recovery looked suspicious, but source navigation found no actual production caller. Dormant-code behavior was not promoted to a reachable loading bug.
- Screen wake-lock late-grant handling already releases unwanted grants and checks sentinel ownership.
- V8 can change Wasm compilation tier under debugging; detach and rewarm before unprofiled Rapier measurements. See [V8 pipeline](https://v8.dev/docs/wasm-compilation-pipeline).
- Debugger/trace overhead and software raster waits must not be called player FPS. [V8's real-workload methodology](https://v8.dev/blog/real-world-performance) explains why helper speed alone is insufficient; [Chrome heap guidance](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots) distinguishes reachable objects and retained size.

The six detailed ledgers record questions, versions, source URLs, application, experiments, confirm/reject criteria, outcomes and remaining uncertainty. They include implementation links, release history and browser issues that were read, rather than search snippets alone.

## Verification and remaining work

The PR body is the live checklist and records exact current-tip gates. Initial focused verification: 112 audio/span tests plus 11 Inspector tests passed. Independent review is retained with the evidence. Actual browser Inspector close cycles and trace retention/delivery passed as described above.

The first full structural run completed 810 files successfully and failed one pre-existing test in `validation-cli.test.mjs`. The same single test failed on the untouched `7b6a3a75` baseline. Its fixture killed a detached child, then immediately exited before Node could reap it; this container's non-reaping PID 1 retained the zombie, so the unchanged `kill(pid, 0)` assertion correctly stayed true. The fixture now awaits the child's `exit` event before exiting itself. Its 1,500 ms timeout, 3,000 ms polling bound and assertion remain unchanged; production CI tools were not changed. See [Node child-process events](https://nodejs.org/download/release/v24.19.0/docs/api/child_process.html#event-exit) and [Linux zombie lifecycle](https://man7.org/linux/man-pages/man2/waitpid.2.html). Baseline/fixed receipts and independent source triage are in the evidence's `gate-triage/` directory.

The supported evidence publisher prepared a checksum manifest/archive, but the GitHub asset upload host returned HTTP 401 while repository push/API access worked. No successful release publication is claimed; the PR links the prepared local bundle and records any later publication outcome. `ensure-mcp-ready` also reported an unavailable chrome-devtools source tag and missing tmux/channel alias; the installed Chromium and persistent native debugger fallback were usable and were the route actually exercised.

Physical phone behavior, hardware-GPU timing and broad visual signoff remain unverified. The separate upstream Inspector retention issue/candidates, fallback layer-readback failure, WGX loading copies and UI compatibility hypotheses are explicitly deferred. This investigation does not merge, mark ready, or deploy.
