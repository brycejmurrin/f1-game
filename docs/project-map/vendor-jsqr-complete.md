# jsQR complete source map

Snapshot: 2026-10-27. Completes the jsQR entry in [vendor-readable-tail.md](vendor-readable-tail.md) and [vendor-map.md](vendor-map.md). This continuation directly read every byte of `vendor/jsqr-1.4.0/jsQR.js`, including the previously read prefix, in separate bounded source calls. No library execution, browser, network, tests, installation or commit ran; vendor source and comments remain unchanged.

## Exact reading and identity ledger

Offsets are zero-based UTF-8 byte intervals `[start,end)`. The assigned remaining range `[24000,256885)` is 232,885 bytes and was directly received in twenty calls: nineteen 12,000-byte slices and the final 4,885 bytes. Two additional calls reread `[0,24000)`. All twenty-two slices decoded successfully with no overlap, gap, replacement or boundary adjustment. Every call had a 7,500-token output budget and returned untruncated (12,000-byte slices reported 3,001 original tokens; final slice 1,222). The resulting full coverage is `[0,256885)`; remaining source: none.

Whole-file size: **256,885 bytes**. SHA-256: `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`, recomputed locally and matching the inherited ledger. Hashes establish local snapshot identity, not upstream authenticity or conformance. Slice hashes below were mechanically computed after reading.

| Directly read interval | Bytes | SHA-256 |
| --- | ---: | --- |
| `[0,12000)` | 12000 | `ac4ba891b3e579fd113ff235e76828e81b89e2447c08cde1dab3063481b02bf8` |
| `[12000,24000)` | 12000 | `e633369df487d87f79679fe25a612c05071720169c1c9fb08b94e2edaa0f059f` |
| `[24000,36000)` | 12000 | `d47bb9932e2ad4e2a5c5fc4af5b39a5d00459985e7665f72b93e186d697d5e4b` |
| `[36000,48000)` | 12000 | `6ef45d148bd8ad9dc6550a70efeed03f2ba011037a7fec182fd34080115cb590` |
| `[48000,60000)` | 12000 | `03b488c29089079fc9c5ba1e08ba0b8e660c7812d1b1aa46b480d29784d01bd9` |
| `[60000,72000)` | 12000 | `3bbb9dab94d842247e7e2bc512b425cc3e29c652003f834ae1415b80f2a47943` |
| `[72000,84000)` | 12000 | `da8ead51f4c35150685d4231b43e607685b39a57df1df462cd2e6851d4ded553` |
| `[84000,96000)` | 12000 | `6797368e7dd9566b8122819a8d62268e623c9cb17e0723c5324007302d2ae258` |
| `[96000,108000)` | 12000 | `f62d16773f1f40416c09c817fbcbcad9c4769e854b39e978d54672abf6d3644c` |
| `[108000,120000)` | 12000 | `c821931817bb877898b1ec95f308c9eb50959dd0ca405bc6d478eb1c3c71ed88` |
| `[120000,132000)` | 12000 | `ddc2d9b0ad994022bc711b8d843f70619af38a48bce83659a453a0cb4d6239c1` |
| `[132000,144000)` | 12000 | `93aa2ab2b9d80c414546e2b6dce58321cfa8f78262e9c565f0356b44d2b5e3c3` |
| `[144000,156000)` | 12000 | `44584bcf65257ecb14e75749e6935c8ace863a0b2025a3e55af7b30b0d57ab95` |
| `[156000,168000)` | 12000 | `5b319bc1ed692af812b3050c2437f25b958bd8ee8164b48de508d4da397af1fc` |
| `[168000,180000)` | 12000 | `f64f2ecc7cd8cd2ae3070e038b59988bcd28839db9d337e05a2fe99bbdb77435` |
| `[180000,192000)` | 12000 | `ac63642d1dc1b29896eef732f9ffe20c2adddfdde65854a726f2af18879b93ad` |
| `[192000,204000)` | 12000 | `a2693369d97c55b320aca2120be2af6be8d52e6bc901185f98cf58ded4754288` |
| `[204000,216000)` | 12000 | `bfd9978c382120dafe63f24f7e763d622b1e5a0030d93814ebf09a80b8da274d` |
| `[216000,228000)` | 12000 | `0fae2752470d8940a240b088f5c31e3cc61e8c2bca5504f23f56351e8b6d4d45` |
| `[228000,240000)` | 12000 | `1f5b04b83c1c4462064f902113bed2443d2c291374aa20769739f76aad682040` |
| `[240000,252000)` | 12000 | `c59ba5ca35afac4b09ee5299847d097464b6bf127ca4b147509c8c59fc80f33a` |
| `[252000,256885)` | 4885 | `5645e93a58a353dfa8cb4fa3f6fde136499d47a3aaed542ad0f758c96094f83b` |

## Public contract and pipeline

The UMD wrapper exports the factory result as CommonJS `module.exports`, AMD, `exports.jsQR`, or `self`/root `jsQR`. Webpack entry module 3 ends by exporting the function; the bundle unwraps its `default`, and `jsQR.default = jsQR` provides a self-alias. Internal webpack module exports are implementation details, not separate public browser APIs. The decoder itself has no camera, DOM, networking, timer or worker API.

`jsQR(data,width,height,providedOptions={})` synchronously consumes RGBA samples; binarization checks exactly `data.length === width * height * 4` and throws otherwise. It does not separately validate positive integer dimensions or typed-array identity. Alpha is ignored. RGB luminance uses 0.2126/0.7152/0.0722 weights. Binarization uses 8×8 blocks, dynamic-range threshold 24, low-contrast neighbor adjustment and a 5×5 blackpoint neighborhood. BitMatrix reads outside bounds as false; writes have no explicit bounds guard.

The public option is `inversionAttempts`, initially `attemptBoth`. `attemptBoth` scans normal then inverse; `invertFirst` scans inverse then normal; `dontInvert` scans normal. **Source defect:** `onlyInvert` selects the inverted matrix but does not request its creation (`shouldInvert` only recognizes attemptBoth/invertFirst); this passes undefined into locator and can throw. Also `options = defaultOptions` mutates shared defaults: a provided truthy value persists into later calls that omit it; unknown truthy modes scan normal without fallback. No runtime reproduction was performed. NetScan explicitly passes dontInvert every call.

Locator scans rows for finder 1:1:3:1:1 and alignment 1:1:1 runs, merges quads, scores horizontal/vertical/diagonal ratios and size, chooses the best finder group, orders its three points using distances/cross product, estimates dimensions and alignment, and returns original-center plus recentered alternatives where possible. `MAX_FINDERPATTERNS_TO_SEARCH = 4` is tested with `i > 4`, permitting indices 0 through 4. This is candidate heuristic search, not multi-code enumeration. Dimensions derive from module size and are adjusted modulo four; version-1 alignment can be an estimated point.

Extractor composes quadrilateral/projective transforms, samples each module at its center with floored source coordinates, and returns the matrix plus a mapping function. Matrix decoder reads version and format from redundant regions; exact matches win, otherwise the closest table entry is accepted within three differing bits. Versions 1–6 derive from dimensions; the static version table covers 1–40 and all four error-correction block layouts. Eight masks and reserved finder/alignment/timing/version regions determine zigzag paired-column codeword reads.

Codewords are deinterleaved into short/long data blocks and parity. Too few returns null; surplus truncates. Reed–Solomon copies each block, builds GF(256) using primitive 0x011D, evaluates syndromes, then uses Euclidean algorithm, Chien search and Forney magnitudes for correction. Failure paths return null. Corrected data bytes concatenate into payload decoding. If matrix decoding fails, the decoder transposes differing bits across the top-left/bottom-right diagonal and tries once more, mutating only the extracted matrix.

Payload parsing supports numeric, alphanumeric, byte, Kanji and ECI chunks. Character-count widths depend on version ranges 1–9, 10–26, 27–40. Numeric values above their encoding bounds throw; BitStream reads require 1–32 available bits. Byte text uses percent encoding plus decodeURIComponent as UTF-8; invalid UTF-8 preserves raw bytes but supplies empty text. Kanji converts 13-bit values to Shift-JIS and uses the large bundled literal Unicode mapping (fully read). ECI records assignment numbers without changing the byte text decoder. Structured Append and FNC1 appear only as commented mode constants and have no implemented branch. Unsupported mode values have no explicit rejection branch, so mode nibbles can be consumed without a corresponding payload handler. Payload exceptions are caught by decodeMatrix, returning null; the public entry has no blanket catch for all malformed inputs or upstream helper failures.

Success is the first decoded candidate, containing `binaryData` (plain byte array), `data` (text), `chunks`, `version`, and `location`. Location includes four projected corners, three finder points and the bottom-right alignment point. Failed searches generally return null; this is not an unconditional no-throw API. It supplies no confidence, authenticity, URL validation or scan scheduling.

## Local consumers and lifecycle

`js/net/scan.js` was read in full. It injects `vendor/jsqr-1.4.0/jsQR.js` on demand, marks the script `data-apex-lazy`, shares the in-flight load promise, and clears the memoized promise on network failure or a loaded script missing the global. BarcodeDetector is feature-detected per start (qr_code support plus callable detect); a supported detector bypasses jsQR loading. There is no per-frame fallback from a throwing native detector to jsQR.

Fallback frames draw camera video to a reusable canvas, cap the long edge at 640px, obtain ImageData and invoke jsQR with dontInvert every 120ms. Exceptions and empty decoded text are ignored. Native detect is asynchronous with one call in flight. Generation checks prevent obsolete starts/results from delivering into replacement scans. The first truthy text stops tracks/timer, detaches video.srcObject and invokes the callback. `supported` checks getUserMedia, not permission status; start requests environment-facing video (ideal 1280×720), no audio, and reports unsupported/no_decoder/denied/no_camera/no_canvas/cancelled outcomes. These are source contracts, not exercised device behavior.

Text references establish `tools/manifest.cjs` includes scan.js in the lobby bundle; `js/core/lazy-bundles.js` recognizes NetScan readiness. Inspected caller excerpts: `js/net/lobby-codes.js` creates a scanner and routes accepted text through deliver(kind,text), with caller generation protection; `js/input/phone-pad.js` reuses NetScan (or injected dependency), parses scanned pairing URLs and connects using the extracted/trimmed code. `js/net/lobby.js` also checks supported. Only scan.js calls jsQR directly in the searched local js sources. These excerpt/reference inspections do not claim complete reading of those larger caller files.

## Provenance, comments and limits

The local directory labels this snapshot 1.4.0; its only sibling is LICENSE. The LICENSE header was inspected and identifies Apache License 2.0; complete-license coverage/hash remains inherited from vendor-map (`11,358` bytes, SHA-256 `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08`). There is no package.json or tracked upstream archive/hash manifest in this directory. No upstream retrieval or byte equality check was performed. The JS bundle has webpack/transpiled module structure and no embedded version/license banner; directory identity and repository license evidence should not be overstated as independently authenticated upstream provenance.

Comments explain Bresenham-style runs, three-bit version/format tolerance, mirroring, recentering and finite-field correction. Those explanations are source rationale, not independent proof of QR specification compliance. NetScan's “40 KB script” and hardware/platform/performance claims are comments: the actual readable file is 256,885 bytes, and compression, timing, native acceleration and platform availability were not measured here. Its “more pixels buys nothing” claim is not established by this read. No source comments were rewritten.

This is complete source-reading coverage of this one bundle, not runtime validation, a benchmark, a security audit, a legal certification, or proof that arbitrary QR data decodes correctly. Large literal tables were read but not checked against external canonical data. Findings above are maintenance inputs; no library fix is included.
