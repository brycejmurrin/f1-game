# Unit group 21a — raw-source continuation, lines 1–2185

Source: `tests/unit/gfx-backend-canary.test.mjs`; whole file 7648 lines, 492646 bytes; SHA-256 `33a435d522a6bb6672574f77e199265d4a658d6c6119d371bbf88692e60ef080`.

This supplement reuses [the existing semantic and assertion inventory](tests-unit-21-complete.md). Every source line 1–2185, including comments and blank lines, was returned and reviewed verbatim in the 16 individually bounded results below. Each result contains at most 150 source lines and fewer than 10000 source characters; none was truncated. The earlier oversized combined AGENTS/map output is not raw-source evidence. This supplement closes only the 1–2185 raw-review gap, with no inference about other gaps in the original map.

## Raw fixture and semantic additions

- Lines 29–106: source loaders resolve repository-relative paths; GAME_REL reads concatenate renderer boot, lazy bundles, platform session, then game.js. Comment stripping removes block comments and full-line comments, rather than parsing JavaScript. span checks both endpoint positions; spanBack checks the end then the last start preceding it. fnBody counts literal braces and has no string/comment/template awareness or explicit final-depth assertion.
- Lines 177–212: local async bind helper injects TLX/WGX factories and storage into actual Gfx VM code. Revoked-init-owner coverage aborts during async creation and observes disposal and the fallback log; it does not race a real browser initialization.
- Lines 239–248: bootLiveBackend keeps timeout callbacks pending, records requested backend creates, and snapshots the session bound latch at apex-gfx-live dispatch. Successful bind coverage additionally verifies descriptor-copied live getters and stable GLX identity.
- Lines 465–481: fatGeo creates 2000 triangles for the chunked path and is rebuilt because upload consumes position/index arrays. Loss tests compare a live free against post-loss no-call behavior, covering resource release and cull refusals without a driver.
- Lines 544–596: mkBudgetVm is a local TLX fixture with injected error ring, overlay recorder, storage, reload and unavailable panel. Extracted refuseTab and onDeviceLost run against this controlled state; the recordGfxBudgetExhausted stub is a fixture implementation, so its own formatting is not independent production verification.
- Lines 646–692: viewport regression drives canvas-box and viewport values separately, then exhausts 40 resize calls to verify the distrust window remains bounded. This models delayed reflow but performs no browser layout.
- Lines 755–768: decal eviction executes a sliced source fragment with eval and controlled current/old materials. The fragment is bounded by indexOf anchors without explicit anchor assertions here; extraction fragility remains despite behavioral observations.
- Lines 969–977: makeStorage stringifies writes, exposes the backing Map, and returns null for absence. It lacks browser quota/security/event behavior; dedicated blocked-storage tests inject throws separately.
- Lines 1022–1135: reset-state coverage freezes separate LS/SS lists, scans render JS for direct literal storage writers and allowlisted computed keys, then scans all js for literal/constant writers to reject obsolete LS entries. These regex mechanisms are lane-aware in the first direction but cannot resolve arbitrary aliases, dynamic expressions, or code semantics; the converse writer scan merges storage lanes.
- Lines 1227–1282: RESET click test has its own inline minimal DOM (host insert/replace, id registration, children) plus timer queue, sentinel and reload counters. It verifies injection and delayed reload in a VM, without layout or native events.
- Lines 1426–1481: verdictScript checks workflow linkage and a tool marker; fixture constructors shallow-merge gfx overrides. runVerdict writes synthetic macos-latest artifacts in a temporary directory, invokes the actual CLI with IMAGE/CENSUS_LS/summary path, joins stdout/stderr, and removes fixtures in finally. These operations were read, not executed in this review.
- Lines 1610–1749: local A/B, menu, camera, LoAF, depth and timing fixtures verify report formatting and missing-data explanations. Some fixtures call real frame-hitch analysers; none measures performance or real hardware here. Gate tests distinguish hardware-only missing/bind/swapchain expectations from unconditional errors/artifact absence.
- Lines 1785–2057: GL mock assertions cover cache transitions, copied matrix values, camera/shadow/mirror pack independence, reach pruning and depth VAO reuse. The shared-buffer replay includes a small GL-state interpreter mapping attribute 5 through VAOs to buffer bytes and checks eight frames of lamp/mirror/main order; the per-pass helper brackets mirrorBegin/mirrorEnd with finally. These are stronger than call counts but still a recorded-call model without raster output.
- Lines 2060–2184: debris capability fallback and shared pose helper, stride-16 light packing against shader shape, sky gates, no-upload shadow options and slim WGX formats remain mixed mock/source contracts. The final TLX persistFail pin uses unchecked indexOf slicing, another local extraction limitation not eliminated by the guarded global helpers.

## Gap-free raw ledger

Hashes cover exact UTF-8 source bytes for inclusive line ranges, retaining newline bytes. The first range starts at 1, each next starts immediately after the preceding end, and the final end is 2185 (2185 total source lines).

| Raw lines returned | SHA-256 | Status |
|---|---|---|
| 1–150 | `777c410ed7cbee0f558c296f8ebca8295417b5183f945e9caaee4a1e0d81c0f9` | verbatim returned; untruncated |
| 151–290 | `806d1bce1a3f371be0ea69efa743c89eab48e62bc544ba875cda3baae6068364` | verbatim returned; untruncated |
| 291–440 | `10cc973453ca97ecec4ce23e6da991c054ec1de5e937336a5a2729cb0d964242` | verbatim returned; untruncated |
| 441–590 | `21a952ddb3cab1e30ef3a6a915424b1f0d8cf1796d0e12af8b27a381009d6e0f` | verbatim returned; untruncated |
| 591–734 | `93e5971d15251cc748e9336b5d78797872f6c2ce83fca7f7323d9aa6718db96e` | verbatim returned; untruncated |
| 735–852 | `a1ab03d6b1977d1ed00037907cef8a5557a3075c916d992bba1baea2f658935d` | verbatim returned; untruncated |
| 853–1002 | `c607de5620944ced4b847101104b7a0e9ca039f1ed186b34d059f3f3d7ffe1a4` | verbatim returned; untruncated |
| 1003–1145 | `cc881ffca187c445b8fe83e7941c1af8c5bbc0b68340e8cb6e6d7f77353e4cfa` | verbatim returned; untruncated |
| 1146–1295 | `1cd75bf2e1883b70ccad271d1d0260d341292e2ea2475f534b2274166216fc8b` | verbatim returned; untruncated |
| 1296–1422 | `398ae510614a75e04b317f69fb730003597894a9dbc4a141b112caeb0f46c924` | verbatim returned; untruncated |
| 1423–1572 | `030854b4e277575377296b7195320aaa8f9c2bb7602ee0b50a8a6acc5e3618ca` | verbatim returned; untruncated |
| 1573–1677 | `95d1342a46810185ce1db53a12dde9c869e8b5b7abb5e0a7f45d08a3022c7e86` | verbatim returned; untruncated |
| 1678–1784 | `668e774c66ade5cd3e7ec43412a33d7746629bdd6c9cc05c5ea8d3ce182dc0b3` | verbatim returned; untruncated |
| 1785–1919 | `06f5396d1e5c2f3024692a49abe2d5c378c6b21cd2ab6e8f055b0ed0f7f4cfbc` | verbatim returned; untruncated |
| 1920–2046 | `8eaf368a0282ee131f1cb4c65bec3e8a77f13e6acad6ec0502426c0ee9540e6f` | verbatim returned; untruncated |
| 2047–2185 | `11e79601158ca25d886b2ebe2a3ab61467a2048c8b5c07da488739a671a11921` | verbatim returned; untruncated |

No tests or browsers were run; no source or test files were edited. Raw review does not establish that these tests pass.
