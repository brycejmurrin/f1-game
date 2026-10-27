# Unit group 21d — final renderer raw-review continuation

Scope: `tests/unit/gfx-backend-canary.test.mjs`, exact requested ranges **6879–7213 and 7230–7566**, 672 lines. Whole file: 7648 lines, 492646 bytes, SHA-256 `33a435d522a6bb6672574f77e199265d4a658d6c6119d371bbf88692e60ef080`.

This extends [the existing semantic/AST map](tests-unit-21-complete.md), reusing its declaration numbers, assertion spans and production P identifiers. No new parse, tests, browser, production edits or commit. Read the repository AGENTS.md; no nested docs AGENTS.md was found. The initial oversized combined documentation output was truncated and is excluded as evidence; the relevant map preamble/helpers and rows 250–274 were subsequently returned untruncated. All eight raw source outputs below were individually returned untruncated, each at most 90 lines and 6478 UTF-8 bytes (therefore under 100 lines / 10000 characters).

## Gap-free requested-range ledger

Hashes cover exact UTF-8 source bytes, including line terminators. The four consecutive chunks in each requested interval cover every line, including blank lines and comments. No claim is made here for intervening 7214–7229 (already covered by the earlier map).

| Raw lines returned | Lines | Bytes | SHA-256 |
|---|---:|---:|---|
| 6879–6968 | 90 | 6181 | `1a0800e56730aa6152ec82258f4192424edd25813570ebd9a69d7a72987346b1` |
| 6969–7058 | 90 | 6003 | `d3dcc3258b00edf320ec72a08eaec6bc1e719772beb7644bf2bf301d0e892045` |
| 7059–7148 | 90 | 5782 | `c461394ed86c548c2e4846f313b561d16268a9bfceed31a4a5258d3252d4e11c` |
| 7149–7213 | 65 | 4224 | `ead32b07211ae01a7408bdaf1fe6db5a3fe46c9d982c733a2ca8a7e51009cbd7` |
| 7230–7319 | 90 | 6478 | `9e15769ebd8d34b7f5da69ba9c8f5dda0f5856db4467d94719948c4a12c88f0b` |
| 7320–7409 | 90 | 6030 | `a196a2a62ef01e522b6b84520000427a269bf759e311b73d9e3468b524ac8ace` |
| 7410–7499 | 90 | 5522 | `6a1b4d221b762c62d793dae5ad08ca3c5870ce8252da5d21efb5632db5733b0c` |
| 7500–7566 | 67 | 4382 | `e7d7923fbf8220ae3cfdd578602481a6b098bfef310e69a339db6bfaa06400f8` |

Requested interval hashes: 6879–7213 (335 lines, 22190 bytes) `7353c49f7420d098f34f6231da480132c910a2d22f684817599bf803332c564c`; 7230–7566 (337 lines, 22412 bytes) `95f8ce3b2a1e5d11709af5c49997dbb4946551b89bfa6bb032912b6bdde355a4`.

## Semantic additions and corrections to the AST map

| Declarations / lines | Raw-review detail and actual evidence |
|---|---|
| 250–251 / 6879–6893 | WGX lamp-only godray is a source pin for shared grLite and one blur pair. Lamp cache pins radius/cone/aim plus TLX float-rounded VP equality; no numerical light projection is executed. |
| 252 / 6895–6921 | Actual pool slice runs through new Function: slot identity survives cursor reset, geo/mat/model references clear, subsequent FX has undefined emissive/alpha, and the nine-key shape includes split=null. Four reset call sites are only text counted. |
| 253–254 / 6923–6955 | Restore budgets and highp remain pins. **254 is extracted execution, not source-pin-only:** eval runs actual menuFinish with cancellation at assets, idle and lamps; none may call shared FlybySeq duration/vary/plan or assign _menuFly. |
| 255–257 / 6957–7018 | Flip propagation is source parity. **256 executes extracted wantMirrorWarm:** hardware AUTO eagerly warms by default; optional lazy warm marks owed/used/deferred, software AUTO clears owed, explicit mirror/PiP ON forces warm, both OFF clears owed. **257 executes warmMirror asynchronously:** injected compile rejects after a microtask while checking destination/material/texture; previous target and texture must restore. |
| 258–260 / 7021–7070 | **258 executes the mirrorBegin entry guard** with the allocation/submission tail replaced by a counter: 120 blocked calls do no work, drained read resumes, hardware ignores soft read state. **259 executes carShadowBegin:** 60 held calls keep the map rather than begin; drained/software-off resume. These are extracted fixtures, not source pins alone. Scene-MSAA target/depth wiring is pinned. |
| 261–262 / 7078–7212 | GLX recording mock checks spare unit 5, mip generation only after unbinding mirror FBO, return to unit 0, opaque unlit double-sided glass and cull restoration; missing/open/PiP/dead images refuse. TLX executes drawMirrorGlass with local record collection and six refusal overrides; warming/MRT adjacency, two winding signs, UV layout, opaque depth-writing double-side and flipped-V texture expression are pins. |
| 263–264 / 7230–7279 | Existing tlxSceneSamples helper exercises defaults, JSON/raw/legacy ULTRA, color/depth caps, RGBA8, mobile and native-WebGPU. Local webglRenderer logs extension calls: extracted disposeKeepingContext frees objects without loseContext, preserves unrelated extension lookup, skips bare WebGL backend and disposes WebGPU despite rejected promise. Both abort sites are pinned. |
| 265–266 / 7285–7333 | Recording GLX validates premultiply upload toggles, upload ordering, ONE blend then normal blend restoration, shadow unit 0 / bake units 12–13 and frame-token uniform caching. **266 title mentions WGSL but body only reads GLSL, TSL lit/fx and TLX; no WGSL evidence here.** Four GLSL PCF taps and TSL fallback expressions are text checks. |
| 267–268 / 7338–7370 | **267 is mixed pins + extracted loop execution:** GLX/TLX float targets and GLSL loop are pinned; eval runs the extracted JS TSL min loop with additive fake min and records 16 distinct coordinates at k=4. This proves emitted coverage, not numerical min/filter correctness. Pause/settings presentation remains a text pin. |
| 269–270 / 7376–7453 | Local async VM runners execute extracted screenshot UI. GLX stale response avoids canvas read/download; live response reads and reports SAVED. TLX actual waiter slices run against timer stubs: reads occur during simulated present microtasks, timeout avoids reads/download. Canvas/compositor are simulated; no native browser evidence. |
| 271–272 / 7456–7497 | Mirror lamp-shadow disabling is pinned in regular/chunked GLX. Recording mock injects throwing fogColor getter into begin; later main pass avoids prior mirror/probe FBO, caller matrices/eye restore, aborted mirror count does not increase and subsequent mirror opens. |
| 273–274 / 7501–7566 | gfxContextLost extracted through symbolSource executes cheap accessor, fallback, null/missing and throw cases; GLX loss event plus extracted WGX/TLX accessors exercise boolean changes. COPY DIAG VM runner provides nullable __apex, fake clipboard/state/log: player JSON works and dev diag wins with download=false. No real clipboard or browser UI. |

## Helper additions and limits

Local helpers previously absent from the shared-helper table: 7167–7179 run(st) captures TLX mirror-glass records via new Function; 7252–7262 webglRenderer logs disposal and extension forwarding; 7380–7390 screenshot run(answer) uses VM DOM/download stubs and bounded event-loop turns; 7420–7445 run(presents) simulates TLX waiters and presenting-task microtasks; 7469–7470 lastFbo/boom inspect recording GL and inject an accessor throw; 7503–7505 run/bs measure diagnostic snapshot fallback; 7543–7556 run(apex) captures asynchronous diagnostic clipboard payloads. Pool extraction at 6906–6909 and blocker tap/min stubs at 7349–7358 are local fixtures, not production helpers.

The source was reviewed, not executed. These descriptions identify what the tests would exercise; they do not report passing tests. Extraction uses indexOf, regex, fnBody/eval/new Function and assumes stable source boundaries. Mock GL calls cannot prove shader compilation, GPU correctness, native framebuffer behavior, visual glass orientation or actual compositor timing. Earlier-map mode labels understated execution in declarations 254, 256–259 and 267; the corrections above preserve that evidence distinction. This continuation closes only its two assigned raw-review gaps; other workers own the remaining intervals.
