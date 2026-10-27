# Vendor batch 02 — Spector embedded Ace editor

Static source reading completed for `vendor/gpu-capture/spector.bundle.js` bytes **[102048,202048)** (100000 bytes, half-open byte offsets). Every byte was displayed and read in ten separate 10000-byte source slices, without truncation. Python read/decode/hash and regular-expression indexing only; no vendor evaluation, runtime, browser, network, tests, or commits.

Whole file: 682744 bytes; SHA-256 `5218807ed79ffa6b7753d8d1325d51baef590b27e0a8edd737c55983826ebf58`.
Assigned interval SHA-256: `fc715bc44830be6ef53d32772436e893b7f4cfd81d165809c422329409076c6e`.

## Exact source-read ledger

Each read decoded the exact listed bytes as UTF-8. Slices join contiguously, with no gaps or overlap.

| Byte range | Bytes | SHA-256 |
|---|---:|---|
| [102048,112048) | 10000 | `a6fbd2955f988405030673c52027d62d592b856523671bede3307fd1f977081e` |
| [112048,122048) | 10000 | `bb3dc360a34945ec83d88f3feb99bf90e666b2f3e6f56b8061f14efe1ad238ab` |
| [122048,132048) | 10000 | `7825ded38fdac29f505d6eb4052c8add502ea71a919aa9fb56aaba84b4f18880` |
| [132048,142048) | 10000 | `f5f0a2e83ce6a7e9da382135ab7c5cdc2906e8683d031fcf6c7746902c03b120` |
| [142048,152048) | 10000 | `9f714f7893d1bcc6c43e7dc8f6632ba4d47975a262cc93fd736ad5a57cf94768` |
| [152048,162048) | 10000 | `f835a1409a4a8f5cdafecb8f0c2715ff3c6c869954a6b966fabe87155ac50243` |
| [162048,172048) | 10000 | `1489cfc27ac6414a26e77597820fcabe09cdd3b9cee827c18590700f87469e46` |
| [172048,182048) | 10000 | `421b8775a4c5167651ebc4ba6019a6c073e5619024db3fea85af093b707317f6` |
| [182048,192048) | 10000 | `3b248133204b2d161957654f5110f73f4ca734bf0ee711fba60a426455b83663` |
| [192048,202048) | 10000 | `035a4308debbad4fca82aef8276c24c5809e08e0a1e9b595311cf772b46b0a64` |

## Bundle fragment boundaries

These are embedded `ace.define(name, dependencies, factory)` registrations, with `require`/`exports`/`module` factory arguments. Minified local identifiers are not stable API names. Registration starts delimit the following ranges; the last includes only the assigned prefix of folding.

| Reviewed range | Module | Completeness |
|---|---|---|
| [102048,102242) | `ace/mouse/default_handlers` | Partial boundary fragment |
| [102242,103564) | `ace/tooltip` | Complete module registration |
| [103564,105735) | `ace/mouse/default_gutter_handler` | Complete module registration |
| [105735,107049) | `ace/mouse/mouse_event` | Complete module registration |
| [107049,112974) | `ace/mouse/dragdrop_handler` | Complete module registration |
| [112974,117508) | `ace/mouse/touch_handler` | Complete module registration |
| [117508,118131) | `ace/lib/net` | Complete module registration |
| [118131,119979) | `ace/lib/event_emitter` | Complete module registration |
| [119979,122101) | `ace/lib/app_config` | Complete module registration |
| [122101,124864) | `ace/config` | Complete module registration |
| [124864,128978) | `ace/mouse/mouse_handler` | Complete module registration |
| [128978,130102) | `ace/mouse/fold_handler` | Complete module registration |
| [130102,132108) | `ace/keyboard/keybinding` | Complete module registration |
| [132108,135515) | `ace/lib/bidiutil` | Complete module registration |
| [135515,141010) | `ace/bidihandler` | Complete module registration |
| [141010,152631) | `ace/selection` | Complete module registration |
| [152631,156456) | `ace/tokenizer` | Complete module registration |
| [156456,159104) | `ace/mode/text_highlight_rules` | Complete module registration |
| [159104,159909) | `ace/mode/behaviour` | Complete module registration |
| [159909,161336) | `ace/token_iterator` | Complete module registration |
| [161336,168103) | `ace/mode/behaviour/cstyle` | Complete module registration |
| [168103,170311) | `ace/unicode` | Complete module registration |
| [170311,175969) | `ace/mode/text` | Complete module registration |
| [175969,176503) | `ace/apply_delta` | Complete module registration |
| [176503,178360) | `ace/anchor` | Complete module registration |
| [178360,184870) | `ace/document` | Complete module registration |
| [184870,187132) | `ace/background_tokenizer` | Complete module registration |
| [187132,187963) | `ace/search_highlight` | Complete module registration |
| [187963,191217) | `ace/edit_session/fold_line` | Complete module registration |
| [191217,194438) | `ace/range_list` | Complete module registration |
| [194438,196015) | `ace/edit_session/fold` | Complete module registration |
| [196015,202048) | `ace/edit_session/folding` | Partial boundary fragment |

## Semantic map

- Opening tail of `default_handlers`: wheel movement chooses permitted axis using velocity/time state and a 1.5 ratio, calls renderer `scrollBy`, and stops consumed events. Its earlier selection handlers are outside this batch.
- `Tooltip` lazily creates a hidden `.ace_tooltip`, supports text/HTML, position/class, show/hide, dimensions and DOM destruction. Gutter tooltip subclass clamps placement to window bounds. `GutterHandler` implements line selection, double-click select-all, delayed annotation HTML and hover dismissal; fold widgets are excluded.
- `MouseEvent` wraps client coordinates, caches document position and selection membership, and exposes stop/prevent, button, Shift, platform accelerator. `DragdropHandler` tracks dragWait/dragReady/drag states, copy/move effects, selected-text markers, cursor placement, edge scrolling, DataTransfer text and cleanup. Its transparent GIF is a drag image, not a game asset.
- Touch handling distinguishes scroll, cursor/anchor selection, wait, menu and zoom states. Long press (450 ms), repeated taps, inertial scroll and a mobile copy/cut/paste/undo/find/palette menu bridge editor commands and Clipboard APIs. This is editor touch behavior, not driving input.
- `net` supplies XHR GET, script injection and anchor-based URL qualification. `EventEmitter` supplies `_emit`/`_signal`, default handlers, once (including Promise), listener registration/removal and propagation/default flags. `AppConfig` adds option descriptors, forwarding, defaults, warnings and deferred error reporting.
- Ace `config` declares version **1.4.7**, packaged/module path settings, `.js` suffix, module URL overrides and worker blob preference. `moduleUrl`, `setModuleUrl` and `loadModule` deduplicate pending loads, resolve factories and optionally inject scripts. Initialization infers paths from script attributes/source. These capabilities exist in source; this inspection did not invoke them or establish which dynamic resources are available.
- `MouseHandler` composes default/gutter/drag/touch helpers, routes DOM mouse and wheel events, captures movement and runs operation cleanup. Options: scrollSpeed 2, dragDelay 150 on Mac otherwise 0, dragEnabled true, focusTimeout 0, tooltipFollowsMouse true. `FoldHandler` handles text/gutter clicks, accelerator remove versus expand, double-click parent folds and inline wrap toggle.
- `KeyBinding` maintains an ordered handler stack with attach/detach, keyboard status, command dispatch and insertstring fallback; consumed commands stop native events and signal keyboardActivity.
- `bidiutil` contains Unicode classification tables and reorder state machines. Exported constants are L=0, R=1, EN=2, ON_R=3, AN=4, R_H=5, B=6, RLE=7 and DOT. It produces logicalFromVisual/bidiLevels and visual index lookup. `BidiHandler` caches rows, expands tabs/full-width glyphs, handles wrapped RTL lines and invisible EOL/EOF markers, measures character widths, and converts cursor/selection geometry between logical columns and pixel offsets.
- `Selection` uses document anchors for lead/cursor and anchor, emits change events, supports forward/backward ranges, words/lines/files, soft tabs, folds, wrapped screen movement, bidi desired columns and surrogate-pair boundaries. Oriented-range and JSON conversion preserve direction; multi-range helpers are conditional hooks rather than a whole multi-select implementation here.
- `Tokenizer` compiles state rules into combined regexes and capture mappings, supports token callbacks/arrays and push-like state stacks. Token limit defaults to 2000; overflow is emitted in 500-character chunks and resets state. `TextHighlightRules` supports embedded/prefixed rules, normalization of include/push/pop rules and keyword mappers. `Behaviour` stores insertion/deletion handlers; `TokenIterator` walks token rows and exposes positions/ranges.
- `CstyleBehaviour` pairs braces, parentheses, brackets and quotes; wraps selection, skips recorded closing characters, deletes pairs and indents inserted newlines. Per-selection bookkeeping records auto/maybe inserted brackets; token types gate sane insertion. `unicode` expands compressed numeric intervals into the wordChars string. Text `Mode` uses that for word regexes, lazily creates tokenizer/highlight rules, toggles line/block comments, delegates embedded language modes, transforms actions and provides keyword completions. Its default worker is null and default indentation copies whitespace.
- `applyDelta` mutates line arrays for insert/remove. `Anchor` follows changes with insertion bias, clips positions and signals movement. `Document` stores lines/newline mode, inserts/removes/replaces text or full lines, applies/reverts deltas, clips positions, converts positions/indexes and splits inserts exceeding 20000 lines. Deprecated methods warn and forward.
- `BackgroundTokenizer` caches line tokens/states, invalidates on edits, schedules initial work after 700 ms and yields after roughly 20 ms every five processed rows. `SearchHighlight` caches regex offsets and draws markers, capped at MAX_RANGES=500 per row.
- `FoldLine` groups connected folds, shifts rows/chars, walks display content, splits/merges groups and converts display indices. `RangeList` keeps sorted ranges, merges overlaps, locates points and adjusts ranges on document deltas with bias. `Fold` extends RangeList for nested folds, relative child coordinates, cloning and restoration. The `Folding` mixin prefix queries fold lines/ranges, adds/removes/expands/unfolds, updates wrapping/row caches, generates display lines, clones fold data and begins toggleFold bracket logic. The toggleFold continuation lies beyond 202048; this batch cannot describe the rest of the mixin.

## Local consumer and limits

`js/agent/apex-gpu-capture.js:10` names this bundle. Its source through line 165 was read for context: the dev toggle defaults off, accepts query/storage opt-in, injects a same-origin script, then reads `window["SPECTOR"]`, constructs `Spector`, and optionally calls `spyCanvases`. `js/agent/apex.js:1489` identifies the hook registration. The local integration consumes Spector's capture API, not the Ace exports mapped here; these modules belong to the bundled editor/UI support. They do not implement Apex physics, render backends or game menus.

This interval contains no Spector top-level export or capture engine definition. Ace registration/dependency names and exported constructor/property names provide the semantic identities above. Static code shows possible DOM, timers, clipboard, XHR and script-loading effects, but no claim is made that any effect ran or is reachable in a particular game capture. Adjacent bytes and the remaining bundle belong to other batches; all completeness claims are limited to this interval.
