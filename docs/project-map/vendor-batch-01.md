# Vendor batch 01 — Spector preprocessor and embedded editor foundations

## Scope and read evidence

Source: `vendor/gpu-capture/spector.bundle.js`, vendored `spectorjs` 0.9.30 per `vendor/gpu-capture/MANIFEST.json`. Assignment: `vendor-batches.json` group `01`, half-open byte interval `[2048,102048)` (100,000 bytes). Offsets below are UTF-8 byte offsets, zero-based, end-exclusive. Whole file: 682,744 bytes; SHA-256 `5218807ed79ffa6b7753d8d1325d51baef590b27e0a8edd737c55983826ebf58`. Assigned interval SHA-256: `0dc592edb49fb072d681b5f9bbbeb4c737c8ff891ea9e4d914a325ca89c0bd80`.

Every assigned byte was printed and read, in the following ten separate calls using Python byte slices decoded as UTF-8. Each output contained exactly 10,000 source bytes and was untruncated (tool budget 6,500 tokens; actual approximately 2,501). No interval gaps or overlap. Hashing and textual boundary extraction were static operations; the bundle was never imported or executed.

| Range | Bytes | SHA-256 |
|---|---:|---|
| `[2048,12048)` | 10,000 | `d25c46c7bc0e86c0f8ec8eff2b6f4187d37ee4fdc2e8caa58e1a3c285e4691cc` |
| `[12048,22048)` | 10,000 | `eb8d89fbe15842da29ed450a58e40263df1ed4783696a9e3f21dec76ae74846b` |
| `[22048,32048)` | 10,000 | `be76fb4c5781af345d49885e42363bf3c67bf7f03e9cff44319d03287e87522f` |
| `[32048,42048)` | 10,000 | `6a0e8d5361aaa095dc3ea68b83d37c27a18678887ea4a1bd373c0a59b7d724f2` |
| `[42048,52048)` | 10,000 | `300575a4334a48f5b749e7677496a65b50af4e12d08728f47bae0a1d787100f1` |
| `[52048,62048)` | 10,000 | `826aac02e4eaa8f4d10cfdd2710e1772ce0ff66769647b407250150c9fa23a39` |
| `[62048,72048)` | 10,000 | `ac94d964c5511c7f7613bb4624de428e1895b01c35fe1111bba0011b3965381c` |
| `[72048,82048)` | 10,000 | `371cbb73cc73b1270d8cae5e8d4eb0ff1993bc612e7703f4ef8993ae4efab80e` |
| `[82048,92048)` | 10,000 | `9cf2f4b50e3d21626b7c02e870cc728720f0dc64f14bd1179b3604c750b7dd44` |
| `[92048,102048)` | 10,000 | `18071a1f0e00068ec61b761fac43231bc77495d2466f40c866ad9cc6dce8c228` |

## Semantic fragment map

Webpack module numbers identify bundle-local modules, not application globals. Numeric boundaries below use the first byte of the module key except module 416, whose leading definition is outside this assignment. Ace boundaries use the first byte of `ace.define`. These are source landmarks, not claims that an independently executable fragment begins there.

| Assigned source span | Module / API | Semantics and relationships |
|---|---|---|
| `[2048,2526)` | Tail of 416, `visit` traversal | Continues AST replacement: replace array slot or parent property; honor skipped nodes; recursively visit typed nodes and arrays, adjust index after removal, invoke exit visitor. Its setup begins before the assigned interval. Module 168 uses its exported visitor. |
| `[2526,4274)` | 851, default generator | `makeGenerator` from module 83 supplies recursive generation. Handlers serialize program/segment/text, whitespace-preserving literals and identifiers, unary/binary/group expressions, integer constants and GLSL preprocessor directives (`if`, `ifdef`, `ifndef`, `elif`, `else`, `define`, function-like defines, `undef`, `error`, `version`, `pragma`, `line`, `extension`). |
| `[4274,4962)` | 29, preprocessor facade | Exposes `generate`, `preprocessAst`, `preprocessComments`, `parser`, `preprocess` and default preprocess. Pipeline: optionally strip comments, module 180 `parse`, module 168 AST preprocessing, module 851 generation. `preserveComments` selects input treatment. |
| `[4962,33129)` | 180, parser and `SyntaxError` | Generated memoized parser (`74 * position + ruleId` cache keys). Its rule entry is `start`/`vt`; failure sentinel, furthest position and expected-token list create located syntax errors. `format` provides source line/caret diagnostics; `buildMessage` escapes expected/found values. Parses directive blocks, nested conditionals, define argument lists, identifiers, decimal/octal/hex integer tokens with optional unsigned suffix, whitespace and comments. Expression hierarchy covers primary/group, defined/unary, multiplication/division/remainder, addition/subtraction, shifts, comparisons, equality, bitwise and/xor/or and logical and/or. `dn` constructs typed nodes; `mn` flattens nonempty pieces, `pn` collapses singleton whitespace pieces, `gn` folds binary operations. End-of-input is required. |
| `[33129,38587)` | 168, `preprocessComments` / `preprocessAst` | Comment scanner preserves newlines and separates block-comment boundaries. Object/function macros expand recursively while omitting the currently expanded name from the define environment. Argument scanner tracks parentheses, checks argument counts and rejects unterminated invocations. Token-pasting helper removes whitespace around `##`. Visitors track defines/undefs, expand text and identifiers, choose conditional branches or remove them, and strip directives unless `preserve` says otherwise; `stopOnError` can throw. Evaluator dispatches typed expression nodes with arithmetic, comparison and bitwise/logical operators; integer evaluation visibly uses `parseInt(token,10)`. `defined` operands are skipped during macro identifier traversal. |
| `[38587,43027)` | 866, capture-menu CSS | css-loader array export `Z`; canvas picker, capture/play/pause/next-frame controls, FPS and error log styles; visibility controlled by `.active`. Includes a Google Fonts import string. |
| `[43027,57689)` | 625, result-view CSS | Full-screen capture results, responsive navigation (1024px breakpoint), capture thumbnails/save icon, visual-state column, command list/detail panels, JSON keys/images, shader source editor/menu/footer. Command status classes color deprecated, unused, disabled, redundant and valid commands. Source-editor CSS reserves 40% for adjacent content. |
| `[57689,58876)` | 827, Ace theme CSS | Monokai overrides for tokens, selections, brackets, active line and gutter; orange keywords, blue constants, green selection outlines. |
| `[58876,59741)` | 645, css-loader list runtime | List `toString` serializes CSS with supports/media/layer wrappers. `i` imports string/list fragments, optionally deduplicates module IDs, composes nested wrappers and appends entries. |
| `[59741,59795)` | 81, CSS item formatter | Returns item index 1, the actual CSS source string, for module 645. |
| `[59795,61279)` | 819 opening, Ace packaged loader | Establishes `ace.define` and `ace.require`, preserving originals; caches named payloads/modules; resolves relative module paths and plugin `!` names; invokes payload functions with local require, exports and module. These are editor loader internals, distinct from Webpack’s outer `n`. |
| `[61279,62515)` | `ace/lib/regexp` | Compatibility checks for unmatched captures and empty global matches; conditionally replaces RegExp exec/test and supports named captures from `_xregexp`. |
| `[62515,71159)` | `ace/lib/es5-shim` | Conditional compatibility implementations: bind, splice, array iteration/reduction/index methods, Object descriptors/prototypes/create/keys/freeze/etc., Date.now and String.trim. Captures legacy getter/setter hooks; helper `F` coerces integer offsets, `N` enforces object conversion. Includes Unicode whitespace constant. |
| `[71159,71543)` | `ace/lib/fixoldbrowsers` | Requires regexp and ES5 patches; supplies Element.remove when absent. |
| `[71543,72741)` | `ace/lib/useragent` | OS enum and getOS, platform/browser/version flags, old IE, Gecko, Opera, WebKit/Chrome/Edge, AIR, Android/ChromeOS/iOS/mobile. iOS forces Mac flag for editor behavior. |
| `[72741,76323)` | `ace/lib/dom` | Array-tree DOM builder supports class/value/function/ref attributes. Document head, element/text/fragment creation, CSS classes and style injection, scrollbar measurement, computed styles, animation/transform/high-DPI flags, rounded translate with position fallback. CSS import becomes a no-op without document. |
| `[76323,76651)` | `ace/lib/oop` | Prototype inheritance with constructor descriptor, mixin and implement helpers. |
| `[76651,78525)` | `ace/lib/keys` | Modifier key codes, modifier bit masks (`ctrl=1`, `alt=2`, `shift=4`, meta=8), function and printable key tables, reverse lookup aliases, synthesized modifier prefixes, lowercase keyCodeToString. |
| `[78525,83355)` | `ace/lib/event` | Cross-browser listeners/cancellation, button mapping, document capture, normalized wheel deltas, double/triple/quad clicks, modifier/AltGr and command-key dispatch. Scheduling includes postMessage nextTick, idle blocking and requestAnimationFrame/fallback. |
| `[83355,86875)` | `ace/range`, `Range` | Row/column start/end geometry, comparisons/containment/intersection, setters, clipping, extending, cloning/collapsing, document-to-screen conversion and translation. Static fromPoints and comparePoints (assigned twice identically). |
| `[86875,88922)` | `ace/lib/lang` | String/array/object utilities, recursive plain-object/array copy, map creation, regex/HTML escaping, match offsets, cancellable deferredCall and delayedCall timers. |
| `[88922,89139)` | `ace/clipboard` | `lineMode`, cancellation timestamp, short 50ms paste-cancellation predicate. |
| `[89139,97064)` | `ace/keyboard/textinput`, `TextInput` | Hidden textarea creation and focus management; reflects selection/context into textarea; computes changed text and cursor restoration; undo/redo input types; browser clipboard copy/cut/paste; IME composition lifecycle; command mode/read-only controls; native context menu positioning; iOS selectionchange-to-navigation bridging and destroy cleanup. Uses event, useragent, dom, lang, clipboard and key tables above. |
| `[97064,102048)` | Opening `ace/mouse/default_handlers` | Constructor installs down/double/triple/quad/wheel handlers and selection state methods. Anchor helper picks nearest range end. Handles focus waiting, mouse capture, text/word/line/all selection, bracket-aware double click and scroll direction/velocity tracking. Interval ends mid-wheel-handler expression; rest belongs to batch 02. |

## Local consumer context

`js/agent/apex-gpu-capture.js:10` owns `SPECTOR_SRC`. Its `loadScript` (`:63`) injects the same-origin script on demand; `enable` (`:125`) reads `window["SPECTOR"]`, constructs `ns.Spector` and optionally calls `spyCanvases`. `captureOnce` (`:182`) subscribes to `onCapture`/`onError` and calls `captureCanvas(canvas,true)`, falling back to `captureNextFrame`. `summarizeCapture` (`:160`) reduces captures to command names/count, canvas dimensions/id, markers and frame-end time. Query/storage preference handling keeps capture opt-in.

The mapped preprocessor and Ace APIs are internal support code, not directly called by this local wrapper. UI CSS is shipped within Spector even though the wrapper’s capture route requests quick capture and consumes JSON summaries. The link from these internals to Spector shader-source/result UI is supported by names and module dependencies here; this interval does not contain the top-level Spector implementation or prove when editor modules initialize. CSS contains external font URLs as source data; no request was made.

## Limits

This is a static complete read of the assigned interval, not a whole-bundle audit. Prefix `[0,2048)` and suffix `[102048,682744)` are outside this ledger. Module boundaries were extracted textually from the source; no AST or vendor code was executed. Local consumer source and vendor manifest were read. Attached LSP tools target a remote F1 Cloud connection, so they were not called under the no-network assignment; minified vendor-local IDs and embedded Ace modules are mapped from the source instead. No runtime, browser, network, tests or commits were performed. No behavioral correctness, browser compatibility or live capture success is asserted.
