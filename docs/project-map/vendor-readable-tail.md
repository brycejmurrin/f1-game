> Coverage update: Continuation closed: vendor-lint-complete.md and vendor-jsqr-complete.md close remaining source ranges. The earlier tentative enum-helper reachability concern is disproved by the lint report; retain it only as an initial hypothesis.

# Vendor readable tail: exact source-reading handoff

Snapshot: 2026-10-27. Supplements [vendor-map.md](vendor-map.md); it does not replace that broader ledger. This continuation read full source directly in separate bounded calls, never AST-only summaries. Source files were neither executed nor edited. No browser, network, installation, tests or commit ran. Hashing and text-reference searches are mechanical evidence and do not extend the source-reading intervals.

## Exact coverage and identity

All offsets are zero-based UTF-8 byte intervals `[start,end)`. Every slice listed below decoded successfully, including its boundary; no bytes were dropped. Each 12,000-byte source slice was returned with a 7,500-token budget and no truncation warning. The initial oversized combined AGENTS/vendor-map output was truncated and is excluded as source-reading evidence. The relevant vendor-map introduction, contracts and five roster entries were reread with bounded output. The final AGENTS section was separately read. Existing vendor-map prefix claims remain inherited evidence, while the ranges here were directly received in this continuation.

| File | Bytes | SHA-256 | Directly read here | Remaining |
| --- | ---: | --- | --- | --- |
| `vendor/three-0.186.1/addons/inspector/ui/Profiler.js` | 55172 | `54e498ae37a8ecc519ed5d366030e3b6616490882af3aff949b4b18daf3b6771` | complete `[0,55172)` | none |
| `vendor/three-0.186.1/addons/inspector/ui/Style.js` | 50211 | `766b31871eeca311823c61e6d6dd0362da16ad1076c93f32c7798e7a99640352` | complete `[0,50211)` | none |
| `vendor/trystero-0.25.4/noble-secp256k1.js` | 55700 | `e0d1bad238ceef8d5451713daf6d5b256ce871d3200fe7ee79dbc01179ec806a` | complete `[0,55700)` | none |
| `vendor/gpu-capture/webgl-lint.js` | 150774 | `17b14abb3ccd4aa57f379c374dc0bb395b31c7ecdb99adb7d6fa5581ddd3572d` | prefix `[0,12000)` | `[12000,150774)` |
| `vendor/jsqr-1.4.0/jsQR.js` | 256885 | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` | prefix `[0,24000)` | `[24000,256885)` |

Profiler slices: `[0,12000)`, `[12000,24000)`, `[24000,36000)`, `[36000,48000)`, `[48000,55172)`.
Style slices: `[0,12000)`, `[12000,24000)`, `[24000,36000)`, `[36000,48000)`, `[48000,50211)`.
Noble slices: `[0,12000)`, `[12000,24000)`, `[24000,36000)`, `[36000,48000)`, `[48000,55700)`.
Lint slices: `[0,12000)`.
jsQR slices: `[0,12000)`, `[12000,24000)`.

The five identities were recomputed locally from entire files and match the roster. Hashes prove snapshot identity, not upstream authenticity, correctness or reading of the remaining interiors. Total directly read here: 197,083 bytes; remaining assigned source: 371,659 bytes.

## Profiler and Style contracts

`Inspector.js:29` constructs `Profiler(this, options)`. Profiler extends Three `EventDispatcher`, imports Style/Graph plus Inspector storage helpers, and creates its DOM shell immediately. It uses browser DOM, navigator, viewport size, pointer capture and window events; it is not a DOM-free module. The nonce resolves from `options.nonce`, then inspector nonce, then null. Style exposes only `Style.init(container, nonce = null)`: create a style element, set a truthy nonce, assign the CSS string to textContent and append it. There is no deduplication or returned cleanup object.

Profiler owns the toggle FPS graph, built-in mini-panel buttons, docked tabs, detached in-page windows, maximize state, resize and pointer drag behavior. `addTab` expects tab identity/button/content, visibility, detach policy and active/dispose behavior; it assigns original order, visibility callback and profiler backreference. Built-in mini views move actual content children, rather than copying DOM. `removeTab` removes tab/window DOM and clears callback/backreference. Detach/reattach preserves original non-builtin ordering and changes active tab; touch detachment is blocked on detected mobile unless the pointer is a mouse. The detached windows are DOM panels, not separate browser windows.

Dock control explicitly implements bottom/right; mobile landscape selects right and portrait bottom. Main resize requires height >100 or width >200 and leaves a 50px viewport margin. Detached resize uses 250×150 minima, while movement intentionally permits half the panel outside the viewport. `getSize` returns zero when hidden/no tabs, otherwise occupied width for right dock or occupied height for bottom dock. `resize`, `orientationchange` and `layoutchange` notify consumers; the latter two carry position/isVertical. Alignment setters return the profiler.

Layout storage under Inspector's `layout` key records dock dimensions, active id, visibility, detached tab ids/order/rectangles. Storage failures warn and are caught. Loading sets a guard against recursive saves, constrains dimensions, restores matching tabs and clears pending detached records. Dispose calls each tab dispose, removes root and detached panels, and disposes the toggle graph. Window resize/orientation listeners installed by setup methods are anonymous/local closures and are not removed by this dispose method; source reading establishes that cleanup limitation, without measuring a runtime leak.

Style contains CSS scoped with `@scope (.three-inspector)`, dark variables, overlay pointer-event policy, dock/floating/maximized/no-tabs classes, mini panels, badges/tooltips, lists/graphs/console, parameter inputs, detached panels, viewer split controls and grid mode. It includes small portrait rules and larger coarse-pointer resize handles. Scoped CSS support is a runtime requirement not exercised here. CSS has top/left/floating classes beyond the bottom/right controls exposed by Profiler; their presence alone does not establish an enabled UI workflow.

Proven local path: `js/perf/three-inspector.js` dynamically imports the addon and assigns its Inspector to the TLX renderer. Its source documents dev-host default on, automation/deployed default off, query/storage opt-in and exclusive GPU timestamp ownership. Generator `tools/gen/vendor-three.mjs` copies Inspector addon source from npm examples. Three provenance and license remain those in vendor-map/manifest, not newly fetched upstream evidence.

## Noble contracts and provenance

The file retains Paul Miller's MIT notice and exposes ESM exports: `Point`, `Signature`, `getPublicKey`, `getSharedSecret`, `hash`, `hashes`, `keygen`, sync/async `sign`, `verify`, `recoverPublicKey`, `schnorr`, `utils`, `etc`, plus frozen `__TEST`. The directory version identifies Trystero, not an independently proven noble release; no exact noble package version is established by this source. Numerous local explanatory/hardening comments mean this must be assessed as the actual vendored snapshot rather than assumed byte-identical upstream.

Points use frozen projective coordinates and frozen curve constants; SEC1 parsing accepts 33-byte compressed / 65-byte uncompressed keys and rejects infinity. Private keys are exactly 32 bytes and scalars 1..N-1. ECDSA defaults to SHA-256 prehash, low-S and compact 64-byte output; recovered form prefixes recovery id and is 65 bytes. DER is explicitly unsupported. `prehash:false` accepts digest bytes, truncating long digests to 256 bits with an 8KiB local input cap. ECDH returns the serialized shared point, un-hashed, not an x-only derived symmetric key.

Async SHA/HMAC use WebCrypto; sync provider slots initially remain undefined. Exported hash slots are configurable and wrappers require exact 32-byte Uint8Array digests on every use. Randomness uses crypto.getRandomValues. Secret-key generation reduces 48–1024 seed bytes modulo N-1 plus one; omitted seed requests 48 random bytes. RFC6979 DRBG tries at most 1000 candidates, optionally mixes extra entropy, and scrubs its current state after successful generation. JS BigInt arithmetic and branch-shaped fake-point work do not establish hard constant-time execution.

Schnorr uses BIP340 tagged SHA-256, x-only 32-byte public keys, 64-byte signatures, 32-byte auxiliary randomness and self-verification before returning signatures. Its verification deliberately requires r>0 and s>0; comments explicitly acknowledge the s=0 rejection is stricter than BIP340/libsecp256k1. Invalid initial byte shapes throw; subsequent sync curve/encoding errors generally return false; async backend failures can reject. These exact error boundaries matter to callers.

`vendor/trystero-0.25.4/nostr/index.js:1,8,93` imports schnorr, creates an ephemeral keypair at module evaluation and signs event-id bytes asynchronously. `js/net/nostr.js` consumes the Nostr adapter as described in vendor-map; no claim follows that the game's invite path uses every ECDSA/ECDH API. Base-point wNAF lazily caches 33×128 = 4224 point objects on multiplication, rather than at import.

## Lint and jsQR: partial interior boundaries

Lint's received prefix establishes the side-effect AMD-or-factory wrapper, version 1.11.4 MIT header, GL enum names, scalar/vector/matrix/sampler metadata, binding queries, typed-array mappings and draw-call argument normalization. Its instrumentation install/configuration/cleanup code remains unread. `js/agent/apex-gpu-capture.js:11` injects it on explicit enable; the wrapper keeps at most 64 matching window-error findings. Disable clears its collector/mode/storage, but this wrapper does not undo previously executed script side effects. No claim about lint's own uninstall semantics follows until its tail is read. GPU manifest records the package version, local bytes/hash and capture date; it has no upstream tarball URL/hash.

jsQR's received prefix includes the UMD/webpack loader, BitMatrix, finite-field/poly helpers, public decoder entry, binarizer and start of format/mask decoding. Public `jsQR(data,width,height,options)` expects RGBA length width×height×4 (binarizer throws otherwise), then locates/extracts/decodes candidate matrices. Success returns binaryData/data/chunks/version and mapped corner/finder/alignment positions; failed scans return null. Default inversion mode is attemptBoth; NetScan explicitly supplies dontInvert, uses ImageData, limits the long edge to 640px and polls at 120ms. Its native BarcodeDetector branch precedes fallback injection. Later decoder internals and tables are unread; the Apache license and 1.4.0 directory identity are inherited provenance, without a tracked upstream hash manifest.

## Proven comment mismatches and limits

- Noble `Point.CURVE()` JSDoc around line 253 says readonly only at type level, but its returned object is runtime-frozen at the file top. Arithmetic snapshots are real; mutation permission wording is stale.
- Noble verify's inline lowS comment around line 781 says `>= N/2`; the actual shared predicate is `s > (N >> 1n)`. The implementation boundary should govern API documentation.
- Noble's 5KB headline and wNAF 32MB/speedup claims are unmeasured upstream-style size/performance prose. This snapshot is 55,700 bytes of readable JS; cache construction has 4224 points. Neither actual heap cost nor benchmark multipliers were measured.
- Profiler's detached-window default-size comments/estimates say 400×300, while Style supplies 500×400; initial position estimation therefore does not use the CSS dimensions. This is source evidence, not a reproduced placement issue.
- Profiler drag highlight refers to `--accent-color` while Style defines `--color-accent`. No runtime visibility judgment was made.
- Profiler non-detachable-tab setup installs a click callback that reads `isDragging` before an early return bypasses its `let` initialization (`Profiler.js:883–905`). That lexical path can throw when invoked for allowDetach=false; no browser reproduction or local repair is claimed.
- jsQR options assign `var options = defaultOptions`, then mutate that shared object. Defaults can therefore retain an earlier requested inversion mode. NetScan supplies its mode every call, so this alone does not prove a game regression.
- Lint prefix `enumArrayToString` pushes onto the same `enums` array that bounds its loop, rather than `enumStrings`. Text search finds only its definition in this file, so this is a source defect in an apparently unreferenced helper, not evidence of a reachable game hang.

Vendor sources and comments remain unchanged. These findings are maintenance inputs; source review is not runtime validation, a security audit, legal certification or proof of upstream conformance.

## Exact continuation batches

Read one source slice per call; promote only after receiving full untruncated content. Use `Path(file).read_bytes()[start:end].decode()` with adequate output budget; if a Unicode boundary splits, overlap and record it. Do not substitute grep/AST output for source reading.

Lint remaining 138,774 bytes, 12 slices:
`[12000,24000)`, `[24000,36000)`, `[36000,48000)`, `[48000,60000)`, `[60000,72000)`, `[72000,84000)`, `[84000,96000)`, `[96000,108000)`, `[108000,120000)`, `[120000,132000)`, `[132000,144000)`, `[144000,150774)`.

jsQR remaining 232,885 bytes, 20 slices:
`[24000,36000)`, `[36000,48000)`, `[48000,60000)`, `[60000,72000)`, `[72000,84000)`, `[84000,96000)`, `[96000,108000)`, `[108000,120000)`, `[120000,132000)`, `[132000,144000)`, `[144000,156000)`, `[156000,168000)`, `[168000,180000)`, `[180000,192000)`, `[192000,204000)`, `[204000,216000)`, `[216000,228000)`, `[228000,240000)`, `[240000,252000)`, `[252000,256885)`.
