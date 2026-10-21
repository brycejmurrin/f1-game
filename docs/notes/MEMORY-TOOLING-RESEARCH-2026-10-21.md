# Memory tooling research: leak gates, phone limits, GPU accounting (B·H12, 2026-10-21)

Asked by Bryce via OrchB 24: "use subagents to come up with new ideas to test or holes, also do a bunch of web
research on how to help profile, debug, test this stuff". Context: #3241 and #3377 fixed cross-race heap retention
found with CDP heap snapshots (`docs/notes/LIVE-MEMORY-H12-2026-10-20.md`). This note is what a CI leak gate could
stand on. Web sources were gathered by a research subagent; the claims marked "unverified" were not fetched in full.

## Leak-detection tools

| tool | how it decides "leak" | fits this repo? |
|---|---|---|
| [memlab](https://github.com/facebook/memlab) (Meta, MIT) | scenario `url` / `action` / `back`, heap snapshots before/after, objects allocated by `action` and still alive after `back`, clustered retainer traces; `leakFilter(node, heap)` to narrow | Puppeteer-based, no Playwright support documented, CI exit codes not documented → a nightly or manual runner, not a per-PR gate |
| [fuite](https://github.com/nolanlawson/fuite) (Apache-2.0) | repeats a scenario N times (default 7) and reports objects, listeners, DOM nodes and collections that grow with the count; raise iterations to cut false positives | Puppeteer-based; same shape as our own cycle harness |
| CDP `HeapProfiler` ([protocol JSON](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json)) | `collectGarbage`, `takeHeapSnapshot`, `startSampling`; diff offline | what `scratch/h12/leak-run.mjs` and `tools/gfx/mem-census.mjs` already use through `context.newCDPSession(page)` |
| CDP `Runtime.queryObjects(prototypeObjectId)` ([V8 inspector test](https://cobalt.googlesource.com/cobalt/+/master%5E/v8/test/inspector/runtime/query-objects.js)) | live instances of one prototype, after a GC | only for class-built objects (three.js `Mesh`/`BufferGeometry`/`Texture` under TLX); our tracks and cars are plain object literals sharing `Object.prototype`, so it cannot count them |
| Playwright | no first-class heap API; use a CDP session ([microsoft/playwright#20246](https://github.com/microsoft/playwright/issues/20246) reports an empty snapshot result in one setup; unresolved) | our harnesses stream `HeapProfiler.addHeapSnapshotChunk` and have not hit it |

Node's own snapshot-diff guide (warm up, snapshot, workload, snapshot, diff):
https://nodejs.org/en/learn/diagnostics/memory/using-heap-snapshot

## WeakRef / FinalizationRegistry as test oracles

- [MDN FinalizationRegistry](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry): cleanup
  callbacks are never synchronous, may be late or never run, and "should not be used for essential program logic".
- V8's own tests (mirrored in [WebKit JSTests](https://webkit.googlesource.com/WebKit/+/refs/heads/master/JSTests/stress/v8-finalizationregistry-and-weakref.js))
  create targets inside closures, call `gc()` and check in a later task.
- Measured here: `WeakRef.deref()` after four `gc()` + `setImmediate` rounds under `--expose-gc` (flag set with
  `v8.setFlagsFromString`, `gc` from `vm.runInNewContext("gc")`) was deterministic in every run of
  `tests/unit/traffic-arc-buckets.test.mjs` and `tests/unit/race-retain-vm.test.mjs`: red on the leaking code, green
  on the fix. Two traps found the hard way: never `assert.equal` an object that reaches a track (the failure diff
  ran the test runner out of memory and it died with SIGKILL), and the target must not be held by the test's own
  locals.

## Phone limits (what "too much" is)

No vendor publishes a per-tab budget. Older figures are in the H12 note (WebKit bugs 290623, 300782). New here:

- A WebKit engineer is quoted at ~1.5 GB WebContent soft limit on recent iPhones, lower on low-RAM models; a 2017
  bug cites 840 MB (unverified which bug holds the 1.5 GB quote): https://bugs.webkit.org/show_bug.cgi?id=171944 ,
  https://bugs.webkit.org/show_bug.cgi?id=277848
- An Apple forum post reports an `ActiveHard` 2048 MB kill on an iPhone 17 Pro, iOS 26 (poster's claim):
  https://developer.apple.com/forums/thread/823061 ; a three.js thread shows a `per-process-limit` jetsam log on
  iOS 26: https://discourse.threejs.org/t/memory-limit-crash-on-ios-26/86978
- Chrome on Android: no 2023–2026 primary source on renderer limits was found.

So new phones allow more, but the older iPhones we still target crash far lower (180 → 338 MB in bug 290623).
A gate should fail on GROWTH per race, not on an absolute MB figure.

## GPU memory accounting

- three.js `renderer.info.memory` ([docs](https://threejs.org/docs/pages/Info.html)): counts of geometries, textures and
  programs, plus byte estimates (`texturesSize`, `attributesSize`, `total`, ...); counts stay until `dispose()`
  ([how to dispose](https://threejs.org/manual/en/how-to-dispose-of-objects.html)). Exact for "was it disposed",
  not physical residency. TLX exposes it through `memState()` (`js/render/three/tlx.js`).
- [greggman/webgl-memory](https://github.com/greggman/webgl-memory): a `GMAN_webgl_memory` extension shim;
  `getMemoryInfo()` returns buffer/texture/renderbuffer/drawingbuffer byte ESTIMATES ("only a guess"). Useful as a
  trend for GLX, not a gate.
- WebGPU has no memory query; `device.lost` reasons are only "destroyed" or undefined
  ([MDN](https://developer.mozilla.org/docs/Web/API/GPUDevice/lost)). Real residency is only visible in
  `chrome://tracing` memory-infra dumps ([docs](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/README.md))
  or the macOS `gpu-census.yml` run.
- [Spector.js](https://github.com/BabylonJS/Spector.js): frame capture with texture data; a debugging tool, not a gate.

## Ideas, ranked (sent to OrchB 24)

1. **CI leak gate: "one circuit alive" race-cycle census.** `tools/gfx/mem-census.mjs` already tracks built-track
   identities with WeakSets (`aliveTracks`) in picker mode (`tests/specs/track-switch-memory.spec.js`). A race-cycle
   mode (race A → step → QUIT TO MENU → race B → collectGarbage → `aliveTracks ≤ 1`) would have caught #3241's leak
   on the first cycle. Identity counts, not MB: deterministic.
2. **VM twin, every commit:** extend `tests/unit/race-retain-vm.test.mjs` with qualifying → race, garage open/close
   and a 5-circuit switch.
3. **Heap-slope nightly** with the phone-profile cycle harness: cycle-3 minus cycle-2 post-GC heap under 2 MB.
4. **`renderer.info.memory` back to its menu baseline** after each teardown (TLX): the GPU-side counterpart of 1.
5. **memlab nightly scenario** (menu → race + quit → garage) for retainer clusters; separate Puppeteer runner.
6. **`queryObjects` counts** for three.js classes under TLX.
7. Fix the two verified low findings: the Data Hub schedule MutationObserver stays connected after the hub closes
   (`js/data/schedule.js:154`); photo-studio library rows and blob closures stay after close (`finishClose`).
8. Gate messages quote growth per race against the ~300 MB practical budget on a 2–4 year old iPhone.

## The gate, measured (2026-10-21)

`tests/specs/race-cycle-memory.spec.js` (test:gfx; 844×390 touch, TLX; monza and spa raced three times through
RESULTS → MENU, a garage visit after monza; ~47 s here):

| tree | verdict |
|---|---|
| 2eda36c6 (before #3241) | **failed**: cycle 1, spa built, `aliveTracks` = monza + spa |
| 30bccdad (#3241) | passed |
| #3377 merged with the deploy tip | passed (twice) |

TLX `renderer.info.memory` at the menu after spa, seven cycles: geometries 26 → 117 → 168 → 232 → 278 → 281 → 253,
textures 40 → 41 → 50 → 53 → 54 → 57 → 57. It climbs for ~five cycles, then flattens: caches filling, not a leak, and
too slow to settle for a cycle-on-cycle gate, so the spec logs it. The post-GC JS heap with TLX bound was 160–275 MB
here against ~40 MB with GLX bound on the same phone profile (the mobile UA binds GLX on this software adapter): a
lead for the TLX lane, not measured on a phone.
