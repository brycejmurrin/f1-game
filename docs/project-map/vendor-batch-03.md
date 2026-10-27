# Vendor batch 03 — Spector embedded Ace sessions and editor

Static source reading completed for `vendor/gpu-capture/spector.bundle.js` bytes **[202048,302048)** (100000 bytes, half-open UTF-8 byte offsets). The complete interval was displayed and read in ten separate 10000-byte calls, with no output truncation. Reading, decoding, SHA-256 and regular-expression boundary indexing were the only analysis operations; no library evaluation, runtime, browser, network, tests or commits were performed.

Whole file: 682744 bytes; SHA-256 `5218807ed79ffa6b7753d8d1325d51baef590b27e0a8edd737c55983826ebf58`.
Assigned interval SHA-256: `2ce4402bd70393a178ccc96c99ef72c850632f240650383b6efdccff92c20fae`.

## Exact source-read ledger

All slices decode as UTF-8 and join contiguously with no overlap or gaps.

| Byte range | Bytes | SHA-256 |
|---|---:|---|
| [202048,212048) | 10000 | `2313cba7bd6afe81b0c0a4ca1141fd762e9e73b0cd090315e39d80d69d5994ef` |
| [212048,222048) | 10000 | `f757f9c7cc2d3b37eb8464ee6878b5ee9b81f0313f8455d5b33b99bb77c9459e` |
| [222048,232048) | 10000 | `741eee3db8d4a0b73decfc1fdca5eb0bcffb9becbd838e5b7551962aa534b539` |
| [232048,242048) | 10000 | `229475fdc52647e8a0ec7f6b116bb169c134aa965a1ea09bf330d3eec0e9ccf2` |
| [242048,252048) | 10000 | `2f97f41dce2464dc5b4815d5a93850f998bdad229d04f929f01f51c27138369e` |
| [252048,262048) | 10000 | `66815690547c26e0dcc0bb0f6988da469a24a4f56d1666c883af2079be618028` |
| [262048,272048) | 10000 | `7946141632d1323d4469eceabaa86d4687a7e008d45d6d1381fc8097d54178a8` |
| [272048,282048) | 10000 | `5f37d3a0c30c4e9155b51894b4266b59930f81345c0b4c63e6b8d4eb3da7492a` |
| [282048,292048) | 10000 | `663c458c510a2ed18891deb11e6c9399f1395823a9ca9df7db9502ba66d34805` |
| [292048,302048) | 10000 | `6a6e3db52593cf7f0aa113c9fc2e042fe292a885bf1f0b23c1fd895c82e591d7` |

## Fragment and API map

The identities below come from embedded `ace.define` registrations, dependency strings, exports and method names. Factory-local minified letters are not stable APIs.

| Reviewed range | Registration / exported identity | Extent |
|---|---|---|
| [202048,206527) | `ace/edit_session/folding`, `Folding` mixin | Tail; starts within `toggleFold` |
| [206527,208800) | `ace/edit_session/bracket_match`, `BracketMatch` mixin | Complete registration |
| [208800,235071) | `ace/edit_session`, `EditSession` | Complete registration |
| [235071,239035) | `ace/search`, `Search` | Complete registration |
| [239035,242338) | `ace/keyboard/hash_handler`, `HashHandler`, `MultiHashHandler` | Complete registration |
| [242338,244086) | `ace/commands/command_manager`, `CommandManager` | Complete registration |
| [244086,262712) | `ace/commands/default_commands`, `commands` | Complete registration |
| [262712,302048) | `ace/editor`, constructor prototype and option definitions | Prefix; ends within renderer option forwarding |

### Folding and bracket matching

The folding tail finishes toggle selection/comment folding, chooses short placeholders for single-line text, locates comment/string token boundaries with TokenIterator, and folds all eligible widget ranges. `foldAll` defaults its collapse depth to 100000. Fold styles are `manual`, `markbegin`, `markbeginend`, with `markbegin` the initial style; manual clears folds. `$setFolding` changes mode callbacks and event subscriptions. Widget actions interpret Shift as children, Ctrl/Meta as all, Alt as siblings; invalid widgets acquire `ace_invalid`. Document and tokenizer changes invalidate cached widgets. The beginning of this mixin belongs to batch 02.

`BracketMatch` exports matching and bracket-range methods, plus opening/closing token scans with nesting counters and token-type regex filtering. `$brackets` includes parentheses, square/curly brackets and angle brackets; the public `findMatchingBracket`/`getBracketRange` character tests shown here recognize parentheses, square and curly pairs. Returned ranges carry cursor orientation.

### EditSession

`EditSession` composes Document, Selection, BidiHandler, background tokenization, search highlighting, EventEmitter, Folding and BracketMatch. Construction initializes breakpoint/decorations, front/back markers, fold data, unique `session` IDs, document listeners and mode/options. Document changes mark dimensions dirty, invalidate row caches, adjust folds/wrap data, record undo deltas and notify the tokenizer and subscribers.

Its API covers document/value/selection/token access; undo manager and selection restoration; tabs and overwrite; gutter decoration/breakpoints; static/dynamic markers; selected-word and line highlighting; annotations; mode loading and worker start/termination; scroll state; text insertion/removal/replacement/movement; indent/outdent and folded-line-aware move/duplicate operations. Missing undo managers use a no-op fallback. Marker IDs increase from 1. Mode IDs load through Ace config, cache instances where appropriate, and fall back initially to text mode; worker creation errors warn and clear the worker.

The session computes widths and coordinate conversions with tabs, full-width Unicode ranges, folds, line widgets, wrap indent and optional bidi/pixel offsets. Display-token categories distinguish fold placeholders (3/4), wide glyph halves (1/2), punctuation (9), spaces (10), tabs (11/12). Wrap splitting favors suitable boundaries and limits indentation; internal delta handling shifts/splits/merges folds and splices caches. `screenToDocumentPosition` and `documentToScreenPosition` use row caches and folded display lines. Optional font metrics replace fixed character width lookup. `destroy` detaches tokenizer document and stops the worker.

Options include wrap off/free/printMargin/numeric limit; wrapMethod `auto`; indentedSoftWrap true; firstLineNumber 1; useWorker true; useSoftTabs true; tabSize 4; navigateWithinSoftTabs false; overwrite false; foldStyle/newLineMode/mode setters. Prototype wrap limit begins at 80 with wrap disabled. These are source defaults, not measured game configuration.

### Search and keyboard command dispatch

`Search` stores options, builds literal/regex searches with case/whole-word support, assembles per-line regexes for multiline needles, finds one/all ranges, supports backward/forward wrapping and skipCurrent, and performs full-match replacement with optional case preservation. Invalid regex construction returns false; zero-length iterations advance to avoid loops. Session selection/range supplies the starting point when absent.

`HashHandler` maps platform-specific key strings into modifier hashes and commands, supports chained key sequences and command removal. `MultiHashHandler` shares the prototype but allows ordered command alternatives; bind positions default to -100 for default commands and 0 otherwise. Parsing uses Ace key-name/modifier tables, logs invalid modifiers and returns false. Keyboard dispatch tracks `$keyChain` and yields a null command while awaiting a chain continuation.

`CommandManager` extends MultiHashHandler with EventEmitter. `exec` resolves names/arrays, checks editor readOnly and command availability, emits exec/afterExec and invokes command handlers through its default exec listener. Macro recording stores command/argument tuples; replay guards recursion and restores replay state with finally; trimming serializes names.

`default_commands.commands` is an editor command descriptor array: names, descriptions, Windows/Mac key bindings, exec functions, readOnly flags, multi-selection actions and scroll policies. It covers settings/error navigation, folding, find/replace, cursor and selection movement, paging/scrolling, macros, bracket matching, clipboard, removal/duplication/sorting, comments, numeric change, undo/redo, indentation, insertion/transposition/case, join/invert selection and command/language prompts. Extension-dependent commands call config.loadModule for settings_menu, error_marker, searchbox and prompt support; this read does not establish their availability. `copy` itself is an empty handler, while cut mutates the selected range and paste delegates to the editor. The shipped spelling `openCommandPallete` is preserved in source.

### Editor prefix

The constructor composes renderer, TextInput (when document exists), mouse/fold handlers, KeyBinding, CommandManager/default commands, Search and EditSession; assigns `editor` IDs; registers history and operation listeners; and delays input events by 31 ms. Operations capture before/after selections and undo boundaries and apply descriptor scroll policies. Mergeable commands are backspace, del and insertstring, with a 2000 ms grouping window unless mergeUndoDeltas is always.

`setSession` removes all old listeners, binds document/mode/tokenizer/wrap/fold/marker/breakpoint/annotation/scroll/selection events, updates renderer state and signals old/new session ownership. Value, theme, font and renderer setters form the consumer-facing editor surface. Bracket and tag highlights schedule after 50 ms; selected-word highlight rejects selections over 5000 characters. Focus/blur control cursor visuals; document/tokenizer changes update affected rows.

Clipboard handling emits copy/cut/paste events, tracks empty-selection line copy mode, and distributes pasted lines over matching multi-selection counts. Insertion consults mode behavior transforms, overwrite and soft tabs, handles selection replacement/newline whitespace, then indentation/outdent; composition can extend/restore selection. Editing methods implement deletion, words/lines, transpose/case, indentation, sorting/comments, numeric digit increments, paired word toggling, duplicate/move/copy lines and multi-selection adjustments. The word pair table includes true/false, width/height, directions, show/hide and operators.

Navigation spans pages, visible rows, lines/files/words, bracket/tag matches and gotoLine unfolding. Search/replace methods compose Search with selection, reveal and renderer scroll; replaceAll proceeds backward through matches. Undo/redo invoke the session manager. Destroy forwards to renderer/session and signals destroy. Auto-scroll uses beforeRender/afterRender bounds and a DOM anchor. Cursor style controls blinking/slim CSS; prompt lazily loads the extension.

The option prefix defines line selection style; active-line/selected-word highlighting true; readOnly/copyWithEmptySelection false; cursor styles ace/slim/smooth/wide; mergeUndoDeltas true; behavior/wrap behavior true; keyboard/value/session forwarding; line numbers and relative-line-number hooks; placeholder DOM creation/removal. It then begins renderer option forwarding and cuts off inside `showPrint...`. Later option definitions, the Editor export and other registrations are outside this assigned interval; no completeness claim is made for the entire Editor module.

## Local consumer context and limits

`js/agent/apex-gpu-capture.js:10` points to this bundle. Its lines 1–180 were read for context: the dev feature is off by default, query/storage opt-in chooses Spector or lint, and enabling injects the same-origin script, reads `window["SPECTOR"]`, constructs `Spector` and optionally calls `spyCanvases`. The integration reports compact capture summaries. Apex consumes the Spector capture surface; the Ace exports here support its bundled editor UI and are not Apex driving controls, game menus or renderer implementations.

This interval contains no top-level SPECTOR export or capture-engine definition. DOM, timers, dynamic module loads and worker calls describe possible source behavior, with no execution/reachability claim. This is a complete byte read of the assigned interval and a semantic fragment map, not runtime validation or a review of adjacent bytes.
