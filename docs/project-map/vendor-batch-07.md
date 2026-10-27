# Vendor batch 07 — Spector bundle tail

## Scope and reading evidence

Fully read `vendor/gpu-capture/spector.bundle.js` byte interval **[602048, 682744)** (80,696 bytes), the exact group `07` in `vendor-batches.json`. All offsets are zero-based, half-open UTF-8 byte offsets. Nine sequential source reads printed the complete interval: eight 10,000-byte calls and one 696-byte call, all untruncated. The interval itself was read as source, not substituted with AST summaries. Python only read bytes, decoded text, and calculated hashes; no vendor JavaScript was executed. Read the root `AGENTS.md` and the full local consumer `js/agent/apex-gpu-capture.js` as context. No nested `AGENTS.md` appeared under `docs/` or `vendor/` in the file listing.

- Whole file: 682,744 bytes; SHA-256 `5218807ed79ffa6b7753d8d1325d51baef590b27e0a8edd737c55983826ebf58` (matches batch manifest).
- Assigned part [602048,682744): SHA-256 `bc63ef524870151a384dafa90417974596d46ae59af28aab115dce918ac4f7ce`.
- Part starts inside a capture-menu log template and ends at the bundle closure. This does not claim the preceding 602,048 bytes were read by this batch.

| Start | End | Bytes | SHA-256 |
| --- | --- | --- | --- |
| 602048 | 612048 | 10000 | `e03fd6bfcdccd3adb1e1e001ece52d1450fdae3f88a46196f5a550f89ff21d69` |
| 612048 | 622048 | 10000 | `5f5226013abc70ef0baced53f57e4d5f6fd5a9ec2c5f662402aa4a8b2974ec99` |
| 622048 | 632048 | 10000 | `c4e6d2338d0e7b3040edbf6510e4b2bd6994bab971be1653e7401e8977c1f470` |
| 632048 | 642048 | 10000 | `ce60142cd74742671813c9a05711d9568edaa1738dc88549e44a1984117e11fe` |
| 642048 | 652048 | 10000 | `a89b2c544d5657e49a7457860c765d16c08d2be9a2f9b7fda8932db577f3c788` |
| 652048 | 662048 | 10000 | `fe60d75050d3082a5a3f498d1b4361591734af881ac5284ffa2331ac15c34b71` |
| 662048 | 672048 | 10000 | `f1ee6d6c75f35b4bc2a2104913b4f1aba47d7ed81deedc975cf817566ed02eb5` |
| 672048 | 682048 | 10000 | `6f013268808e7059294e61e5e556ead038995cab752d211d0af54d460cd5cfe3` |
| 682048 | 682744 | 696 | `3f62a18cf66285671fad03f214f11a8e38cda6e2b61a0894595caf24d990c3e7` |

## Semantic map

Symbols below are the shipped minified identifiers, with roles inferred from their actual methods and strings. The early classes continue the main Spector module from the preceding batch; they are not independent webpack modules.

| Read slice | Contents and relationships |
| --- | --- |
| [602048,612048) | Tail of menu log rendering; `_t` renders canvas list items and selection events, `Ct` emits capture/play/pause/next-frame actions, `At` renders the canvas chooser, `Rt` formats FPS. `St` owns the capture menu and its `ft` state tree: selected canvas, visibility/log state, DOM canvas discovery, list updates, auto-selection for a sole canvas, delayed capture event, action events and FPS updates. Three help-text constants describe selection, record/play controls and capture wait. CSS module `625` is installed through style-loader helpers. `wt` imports dropped JSON capture files through FileReader/JSON.parse; `xt` renders capture thumbnails, time and save/select links; `yt`, `Lt`, and beginning of `It` provide visual-state list/scroll behavior. |
| [612048,622048) | `It` completes framebuffer attachment/layer/cube-face display and selection. `Ft`/`Nt` render commands, status, marker/log text, shader links and command selection. `Mt`, `Ot`, `Bt`, `$t`, `Pt`, `kt`, `Dt` build command details, recursive JSON groups, images, documentation links and framebuffer previews. `Ut` creates captures/information/init/commands/end/close navigation, search and responsive menu behavior; `Gt`/`Wt` are result containers. `Xt` begins shader-source viewing/editing, translated-source tabs, preprocessing via imported module `29`, beautification switches and compile error annotations. |
| [622048,632048) | `Xt` configures Ace Monokai/GLSL, uses a 1500 ms edit debounce, emits changed vertex/fragment source, and implements recursive brace beautification, comment delimiter shielding and preprocessor indentation. Its replacement-string constants protect semicolons/braces inside comments. `zt` renders information columns. `Kt.getMDNLink` maps WebGL2, WebGL and ANGLE instanced-array function names to MDN paths, folding overloads into common documentation pages. `jt` starts the result-view controller: state IDs and component instances, capture selection/save, visual/command selection, shader tabs and edit events. |
| [632048,642048) | `jt` completes event wiring; serializes JSON captures into Blob downloads; handles command and visual navigation with arrow/PageUp/PageDown keys; opens shader editors from captured DrawCall/program metadata; switches information/init/end/commands views; recursively formats JSON, metadata, help links, arrays and image previews. Information shows canvas/context, analyses, frame memory and total memory. |
| [642048,652048) | `jt` renders command status/duration/result/help, associates filtered commands with visual states and previous/next links, and filters searches longer than two characters. `Yt` instruments WebXR: subclasses XR layer/binding types to retain GL contexts, wraps requestSession/updateRenderState and hands session RAF spying to the time spy; restores normal spying when sessions end. `qt` groups CaptureMenu/ResultView. `Zt` is Spector's main capture controller: timing/events/options, context discovery, UI and shader-rebuild integration, pause/play/FPS, canvas spying, canvas/context capture routing, retry/timeout setup and frame capture entry. |
| [652048,662048) | `Zt` completes start/stop, marker/log, frame/command capture, context spies, XR context lookup, frame-boundary callbacks and error/capture events. Command count is clamped to 10,000; no-frame timeout is 10 seconds, empty-frame captures retry. Webpack module `18` starts Ace searchbox: embedded CSS and close-icon data URI, search/replace DOM, options, focus and keyboard setup, delayed input search and commands. |
| [662048,672048) | Ace searchbox completes regex/case/whole-word/selection modes, marker management, search/highlight, capped match counter (999+), replace operations, show/hide and Search exports. Module `176` begins Ace documentation-comment and C/C++ highlight rules: TODO/FIXME/XXX/HACK, a large C function-name regex, keyword/type/modifier/operator constants, string escapes/printf formats, comments, numbers and directives. |
| [672048,682048) | Module `176` completes C/C++ highlighting, brace outdent, C-style folding/regions, C/C++ mode and GLSL mode/highlight rules. GLSL keyword/builtin tables cover shader types, qualifiers, math/texture functions and `gl_*` variables; modes inherit C-style behavior. Module `793` defines Monokai dark CSS, token colors and embedded indent-guide PNG and installs it via Ace DOM helpers. Tail begins webpack cache/require implementation. |
| [682048,682744) | Completes webpack module cache and factory invocation, default-export/interoperability/property/ES-module helpers and Node-style module metadata helper; entry sequence invokes module IDs `819`, `176`, `793`, `655`, `18`, `986`, then closes the bundle. |

## Contracts, constants and local use

Capture command statuses in this tail map `10 → unused`, `20 → disabled`, `30 → redundant`, `40 → valid`, `50 → deprecated`; view statuses map `0 → captures`, `10 → information`, `20 → init`, `30 → end`, `40 → commands`. Captures are consumed through `commands`, `initState`, `endState`, `VisualState.Attachments`, DrawCall shaders/program status, analyses and memory. Tagged WebGL objects use `__SPECTOR_Object_TAG`; metadata uses `__SPECTOR_Metadata`. `Number.MIN_VALUE`/`MAX_VALUE` act as init/end navigation sentinels. DOM, FileReader, Blob, URL, Ace, canvas/WebGL and optional WebXR globals are browser dependencies.

`js/agent/apex-gpu-capture.js` lazily injects this exact same-origin bundle, obtains `window["SPECTOR"].Spector`, constructs it, optionally calls `spyCanvases`, subscribes to `onCapture`/`onError`, and calls capture APIs. Its public `__apex.gpuCapture` route enables/disables capture and returns a reduced JSON summary of command names, canvas dimensions/id, marker count and frame time. It does not call the bundle's menu/result UI. Enabling is explicit via API, query parameter or persisted `apex26.gpuCapture` setting; the consumer is off by default.

A static integration detail deserves preservation without claiming a tested defect: the consumer calls `captureCanvas(canvas, true)` under a quick-capture comment, whereas the inspected vendor signature is `captureCanvas(e,t=0,n=false,i=false)` and passes `t` as command count, `n` as quickCapture. The fallback `captureNextFrame(canvas,true)` does put `true` in that API's quick-capture position. This batch documents the mismatch only; it changes no implementation. The vendor's `getAvailableContexts()` also visibly self-calls; no local consumer use was found in the inspected consumer.

## Limits

Static source mapping only. No runtime, network, browser, tests or commits were run. No assertion is made that browser APIs, shader rebuilds, capture timeouts, imported captures, WebXR wrappers or UI work in a live game. Upstream source names beyond readable exports/strings are not reconstructed, and earlier module bodies/export declarations remain the responsibility of other batches. Embedded CSS, regex tables, HTML and data URIs were included in the full-byte reads; they were not treated as omitted binary assets.
