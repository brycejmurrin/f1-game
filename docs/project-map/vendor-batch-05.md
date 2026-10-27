# Vendor batch 05 — Spector editor tail and GL vocabulary

## Coverage and identity

Fully read `vendor/gpu-capture/spector.bundle.js` bytes **[402048,502048)** (100000 bytes), in ten consecutive 10000-byte UTF-8 decoded outputs, without truncation. This is source inspection, not library execution or an AST-only inventory. Half-open offsets are bytes in the original file, not character offsets. No runtime, browser, network, tests, or commit was performed.

Whole file: 682744 bytes; SHA-256 `5218807ed79ffa6b7753d8d1325d51baef590b27e0a8edd737c55983826ebf58`.

Assigned part [402048,502048) SHA-256: `231dc69fdb92e020c844b25f584368117ca046ddacb9cf326c27dd26b17c7fe5`.

| Read slice | Bytes | SHA-256 |
|---|---:|---|
| [402048,412048) | 10000 | `b7559d8a9ac2c19de519fb31ec7e1c81c772173be50615227f7655be52366345` |
| [412048,422048) | 10000 | `82f296506945be067dbb6343277648a8c32f227a8d3b521cf6b4588c984f5290` |
| [422048,432048) | 10000 | `20f56a531c7bfcda3324e9ec87a9d2f67c0bd059f77f00e431acc3a567ad7141` |
| [432048,442048) | 10000 | `97fe2a1fa9f35a6b7a1a357557956bf57f4da215a00de95d0f290b531ba56f7b` |
| [442048,452048) | 10000 | `6cbb9265a5940b27a8e2cae636099d22ecaa5d213741f18b23856bcbc66e633c` |
| [452048,462048) | 10000 | `98aa2626f35c07b77b2bb3d5ef41326968f0538903c613182682a3ba96b273ae` |
| [462048,472048) | 10000 | `745227d7bbea0f98eda0ba1b96561aa94a6acc8ee443ed196fab738e53c8dc10` |
| [472048,482048) | 10000 | `37e5af4637ce525a7626ab0f1cb96a3be35e1e4fcc9fed0a60f266d3110d3fea` |
| [482048,492048) | 10000 | `c610b517b6e13043dd634c98a1ceba648d4ca859de07deb5b063e11e25c050ec` |
| [492048,502048) | 10000 | `ee99aad3eba98679946ba10466adb7f565ce190fa341120e1d2984e2d57d0d73` |

## Semantic fragment map

| Byte extent within this part | Module or fragment | Meaning |
|---|---|---|
| [402048,415264) | Tail of Ace multi-selection module | Starts mid-expression (`his.$onRemoveRange`). Selection range bookkeeping, overlap merge, split into lines, block/rectangular selection using document/screen coordinates; Editor integration initializes handlers and binds Alt crosshair feedback. Selection-marker add/remove and render refresh, entering/leaving multiselect mode, command dispatch by `multiSelectAction`, virtual per-selection execution, selection text joining, find-all/select-more, transpose, cursor alignment and assignment alignment. Session changes detach old selection events and bind new ones. `enableMultiselect` and `enableBlockSelect` options default true. |
| [415264,416486) | `ace/mode/folding/fold_mode` | `FoldMode` base: start/stop marker classification, null default range, indentation blocks skipping blank lines, opening/closing bracket block ranges. |
| [416486,419093) | `ace/theme/textmate` | Light TextMate theme (`isDark=false`, `ace-tm`), syntax colors, selections, errors, gutter and active-line styling, embedded base64 PNG indentation guide; CSS imported through Ace DOM helper. |
| [419093,424895) | `ace/line_widgets` | `LineWidgets` integrates row heights and screen length with session layout; attaches renderer before/after hooks, handles fold/change row remapping and stacked old widgets, creates/removes widget DOM, measures dimensions, updates fold/layout signals, positions widgets with scroll and gutter offsets. |
| [424895,428183) | `ace/ext/error_marker` | `showErrorMarker` navigates sorted annotation rows with binary search, cycles direction, creates inline error/warning/info/OK widget and arrow, moves/unfolds cursor, installs dismissal handlers and injects widget CSS. Empty annotations display “Looks good!”. |
| [428183,430114) | `ace/ace` and Ace export bootstrap | Exposes config, require/define, Range, Editor, EditSession, UndoManager and VirtualRenderer. `edit` resolves element IDs, replaces textarea/input with pre, creates editor/session/resize lifecycle, reuses an existing editor. `createEditSession` installs UndoManager. Bootstrap initializes config and copies Ace exports to `window.ace`; CommonJS export wrapper follows. |
| [430114,432880) | Webpack CSS loader modules 655, 379, 569, 216, 565, 795, 589 | 655 wires style-loader to CSS module 827. 379 reference-counts style identifiers and updates/removes entries. 569 caches selector targets and supports iframe head insertion. 216 creates style elements; 565 applies webpack nonce; 795 wraps CSS with supports/media/layer and optional inline source map, then updates/removes style; 589 writes legacy stylesheet cssText or text nodes. Browser DOM side effects are visible statically. |
| [432880,435448) | Main module 986 opening | Declares public `EmbeddedFrontend` and `Spector` export bindings (their implementations are beyond this fragment). Class `i` checks/invokes program hook `__SPECTOR_rebuildProgram`; enum `r` gives noLog/error/warning/info 0–3, logger `s` defaults warning. Observable `o` returns numeric callback IDs, binds optional receivers and triggers registered callbacks. Clock `a` uses navigationStart+performance.now or a Date-based fallback. Analysis base `l` appends named analysis objects; `c` counts/sorts command frequencies (`Commands`), `h` totals commands/draw/clear (`CommandsSummary`). Draw-name list `u` includes core, ANGLE, instanced, range and WEBGL multidraw/base-instance variants. |
| [435448,435707) | Constant helper `d` | `isWebGlConstant` checks numeric reverse map `p`; `stringifyWebGlConstant` handles null, command-specific zero/one names, known enum names and numeric fallback. |
| [435707,500639) | WebGL constants metadata on `d` | Name/value/description records, with extensionName on extension records. Covers draw modes and buffer clear bits; blend factors/equations; raster/depth/stencil/scissor/viewport/pack/unpack state; buffers/attributes; errors; shader/program types/status and limits; texture units 0–31, formats/filtering/wrap; framebuffer/renderbuffer status and attachments; WebGL2 texture arrays/3D and integer/float/snorm formats; queries, draw buffers, sampler types, pixel/copy buffers; matrix/vector types; transform feedback; uniform blocks; sync fences/timeouts. Extension families include instancing, renderer info, anisotropy, S3TC/ETC/EAC/PVRTC/ETC1/ATC compressed formats, depth/half-float/color-buffer-float, minmax, sRGB, derivatives, draw buffers, VAOs and disjoint timer queries. These are reporting metadata, not game rendering configuration. |
| [500639,501363) | Enum disambiguation and lookup initialization | `zeroMeaningByCommand` maps zero to NO_ERROR/ZERO/NONE/POINTS by API; `oneMeaningByCommand` maps one to ONE/LINES. Name map `m` and numeric map `p` are populated by iterating own static members of `d`; same-value aliases consequently share/overwrite numeric entries in declaration order. |
| [501363,502048) | Partial primitive analyzer `g extends l` | Initializes totals for triangles/strips/fans, lines/strips/loops and points; inspects command names and argument counts for arrays/elements and instanced/ANGLE draws before `appendToPrimitives`. Ends mid-condition `commandAr`; remaining algorithm and registration are outside this part. |

## Local consumer context and limits

Read `js/agent/apex-gpu-capture.js` completely for consumer context. `SPECTOR_SRC` is the same-origin vendored bundle. `wanted()` enables it only via explicit query/local-storage preference; `enable()` injects the script, reads `window["SPECTOR"]`, creates `new ns.Spector()` and optionally calls `spyCanvases()`. `captureOnce()` subscribes through the observable-style `onCapture.add` / `onError.add` APIs, calls `captureCanvas(canvas,true)` (fallback `captureNextFrame`), and uses an 8-second timeout. `summarizeCapture()` retains command count, at most 64 command names, canvas identity/dimensions, marker count and frame end time. The game consumer does not directly access the Ace modules, constants tables, CSS loader, primitive analyzer or EmbeddedFrontend in this part; they support the vendored capture/reporting/editor package internally.

The interval begins inside a multi-select function and ends inside primitive analysis. Module names and boundaries above are literal source evidence; minified names are scoped to their webpack/Ace contexts and are not stable public API names. Constants descriptions were read as bundled text, not validated against WebGL specifications: visible oddities include `FUNC_SUBSTRACT`, duplicated ATC numeric values, and extension-name metadata inconsistencies. No claim is made that these tables are authoritative or that runtime capture, editor construction, DOM injection, timing fallback, or analysis is correct. Whole-bundle execution and paths outside the assigned interval remain unverified by this batch. Hashing read the full file as bytes solely to establish identity; semantic coverage here is the assigned interval plus the explicitly named local consumer.
