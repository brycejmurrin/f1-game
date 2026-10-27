> Coverage update: Initial47-full/10-prefix snapshot retained. Readable-tail/lint/jsQR/Rapier and vendor-batch-01..20 reports close all source ranges. Rapier encoded WASM is explicitly binary-inspected rather than fictional semantic text reading.

# Vendor map and read ledger

Snapshot: 2026-10-27; scope is the 57 tracked `vendor/` files. This is a partial source-reading map, **not a claim that every vendor source has been read**. Forty-seven files were read completely in bounded, nontruncated calls, including every license, both manifests, patch rationale and recipe, all Trystero core/Nostr files and the smaller Three addons. Ten larger files have only their first 2,048 bytes read. Hashing and import/comment searches scanned additional bytes mechanically; those scans do not count as source reading. Initial oversized combined reads were truncated and were excluded until reread in smaller complete ranges.

Offsets below are zero-based byte intervals `[start,end)`, with `end` excluded. All files are UTF-8 text; minified bundles and Rapier's embedded WASM remain text containers. The complete SHA-256 is the identity of the audited bytes. No vendor or application source was modified; no browser, library installation or network operation was used. Parent lane owns verification.

## Runtime entry points and API boundaries

| Island | Proven local consumer / boundary | Loading and behavior |
| --- | --- | --- |
| Three 0.186.1 | `index.html:3639` import map maps `three` and `three/webgpu` to `three.webgpu.min.js`, `three/tsl` to `three.tsl.min.js`, addon prefix to `addons/` | TLX imports Three; `js/render/renderer-boot.js:11` preloads the three bundles after committing to THREE. `sw.js:293` optional vendor entries list the three bundles. Core is a static dependency of WebGPU; TSL re-exports the WebGPU TSL namespace. |
| Three Inspector | `js/perf/three-inspector.js:11,78,90` dynamically imports Inspector, constructs it, assigns `renderer.inspector` | Local-dev default, deployed/automation default off, explicit query/storage opt-in. Host holds TLX GPU timer while Inspector owns timestamp resolution. Inspector transitively loads all shipped Inspector tabs/UI. |
| Bloom addon | `spike/three-spike.js:19` imports `bloom` | Spike consumer proven; no production `js/` Bloom import found in path-text search. Eleven internal render targets, high-pass + five horizontal/vertical mips + composite; `dispose` frees targets/materials. |
| WebXR addons | Copied by `tools/gen/vendor-three.mjs:43`–45 | Shipped helpers: VR button requests immersive-vr; XR button tries AR then VR; fallback replaces a WebGPU renderer lacking XRGPUBinding with a caller-created WebGL backend. No production `js/` import found by path-text search. This is not a dead-code verdict. |
| jsQR 1.4.0 | `js/net/scan.js:5,141` script injection and `jsQR(img.data,cw,ch,{inversionAttempts:"dontInvert"})` | BarcodeDetector preferred when supported; fallback decoder loads on scan demand, image capped at 640 px edge and decoding every 120 ms. Browser-global UMD, separate Apache-2.0 license. |
| Rapier 0.19.3 | `js/physics/debris-world.js:11,176` dynamic import then `m.default.init()` | Compat ESM embeds base64 WASM. Wrapper uses World/EventQueue, rigid-body/collider descriptors, body types/events/joints for debris/incident side-world. The vendor module interior has not been audited. |
| Trystero Nostr 0.25.4 + noble | `js/net/nostr.js:34,307,422` dynamic import; calls `createEvent` and `subscribe` | Game publishes/subscribes directly through its own sockets. **It does not call Trystero joinRoom for the invite exchange** (`nostr.js:198` rationale, `:526` current implementation note). Module evaluation still generates Schnorr keys and builds strategy closures. Core imports are loaded even though full peer-room runtime is not selected. |
| Spector / webgl-lint | `js/agent/apex-gpu-capture.js:10`–11 and `js/agent/apex.js` | Explicit dev toggle injects scripts. Spector exposes UMD SPECTOR; lint is a side-effect UMD wrapper. Off by default. Neither payload is fully read. |

Local LSP evidence: `bash tools/mcp/lsp-mcp.sh def ThreeInspector --body --maxLines=90` resolved the wrapper at `js/perf/three-inspector.js:8`; its body was capped, so used only for the shown lines. `refs NetNostr --files` returned transport, nostr, rendezvous and lazy-bundles (9 refs). `refs DebrisWorld --files` returned game/apex/incident-sim/player-forces/collide/wall-clamp/debris-opts/race-control/debris-world/driving-coach (63 refs). `refs ApexGpuCapture --files` returned wrapper and apex (6 refs); tool explicitly reported a text-match fallback because window.ApexGpuCapture is untyped. These are source-navigation results, not browser execution evidence.

## Provenance, integrity and patch contracts

- Three manifest pins npm tarball `three-0.186.1.tgz` SHA-256 `8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7`, pristine readable bundle hashes and terser 5.51.2. Generator applies exact-count patches to readable builds before minifying; addons are copied. A local Python SHA-256/byte-count comparison checked all **26** manifest entries: zero mismatches. Tarball/pristine hashes are recorded provenance, not independently downloaded/verified here.
- GPU capture manifest pins spectorjs 0.9.30 and webglLint 1.11.4, records hunter #2964 and 2026-10-19. All **4** file hashes and lengths matched locally. Manifest lacks upstream URLs/tarball hashes; no external provenance claim is made.
- Rapier package identifies `@dimforge/rapier3d-compat` 0.19.3, Apache-2.0, dimforge/rapier.js and rapier.rs. Its package exports reference CJS/types files not included in this deliberately ESM-only vendor subset. jsQR has a separate Apache-2.0 license. Neither island has a tracked hash manifest; ledger hashes below establish this snapshot only.
- Three, Trystero, noble, Spector and lint license files are MIT-family notices; lint also retains Khronos attribution. Rapier/jsQR Apache licenses include redistribution/modified-file notice conditions. This records license content, not a legal compliance certification.
- Trystero carries generated TypeScript region markers and missing `.mjs.map` source-map URLs. Core relative imports resolve in the tracked subset; bare Nostr imports resolve through the shell import map. noble is vendored locally with MIT notice, but this subtree has no package.json/manifest stating its exact upstream version.

| Active patch | Mechanism / constraints read from recipe and rationale |
| --- | --- |
| 1 | identity texture-view swizzle becomes undefined (two sites), Chromium compatibility |
| 4 | WGSL render node variables move into main; compute global policy retained; graph helper functions must not capture moved vars |
| 5 | core yieldToMain preserves native scheduler receiver; MessageChannel fallback closes both ports; timer fallback |
| 6 | RenderObject dynamic cache hash uses shared five-slot scratch, retire on r187 review |
| 9, 10 | avoid unread UV matrix rebuild; base-node shared flipY/matrix uniforms; clone keeps updateMatrix; 9 old update path becomes unused under 10 |
| 11 | MRT resolve removes depth/stencil bits after first color attachment |
| 12 | per-binding GPU-buffer byte snapshot skips identical uniform-array uploads; 4-byte typed arrays only; range/other buffers retain original path |
| 13 | shared texture binding key includes texture identity **and sampler binding name**, separators; clone retains groupNode |
| 14 | render/compute sync/async scope and diagnostics rejections settle within pipeline; bounded 300-char catch reason |
| 15 | backend release hooks free GL shaders/programs, reference-count VAOs; compute VAOs pinned |
| 16 | move shared bind-group cache into Bindings with render-context WeakMap and final-owner eviction; preserves patch 13 key semantics |
| 17 | opt-in apexDiscardColor bitmask / apexDiscardDepth storeOp hints; caller owns last-use correctness; array-camera XR descriptors not patched |
| 18 | WGSL RGB output widened vec3→vec4 so source-alpha blending remains valid; GLSL untouched |
| 19 | shared binding-group dispatch shortcut checks array/member/group/cache identities/version and commits only after successful update |
| 20 | opt-in __apexUint16Index for owned static scalar Uint16 index data without restart; padded shadow aligns writes; format/length/restart changes throw |

Patch recipe order matters: 16 matches/replaces code after 13; 19 updates the already-modified Bindings class; 20 changes creation and update handling together. Retired IDs 2/3 assert upstream bind-group cleanup/polygon offset forms, while 7/8 remain intentionally unused. Canary/test descriptions in PATCHES.md are historical documentation; no canary tests ran in this read-only lane.

## Readable module responsibilities

Trystero dependency chain: Nostr → core index → strategy/topic-strategy and crypto/utils; strategy → offer-pool, handshake, peer, room, shared-peer, signal-handler; room → actions → action-wire, handshake and media; shared-peer → media. Nostr uses noble Schnorr signing for ephemeral public keys and signed NIP-01 EVENT frames. `subscribe` generates a REQ with kind derived from topic and #x topic tags. Relay management batches subscriptions (250 topics), tracks announcement acknowledgements and backs off rate-limit failures.

| Core file | Responsibility / boundary |
| --- | --- |
| action-wire | 32-byte action name + 2-byte nonce + tag + progress header (36 bytes); ~16 KB chunks; send backpressure; local receive hardening caps message 16 MiB, peer 32 MiB/64 incomplete messages, deferred 8 MiB/128; 30 s expiry/tombstones |
| actions | public message/request API, pending responses, abort/timeout/disconnect handling and 500 ms incoming request-handler buffering |
| crypto | AES-GCM signaling encryption with random 16-byte IV; SHA-256 room keys/namespaces; SHA-1 topic helper |
| handshake | password challenge-response plus optional user handshake; activates only after local pass and remote-ready; timeout/error cleanup |
| index | public core re-exports |
| media | local media identity WeakMaps and remote caches; stream/track metadata dispatch |
| offer-pool | 20 prewarmed offer peers, 57,333 ms TTL; lease expiry/recycling and cleanup |
| peer | RTCPeerConnection/data channel, candidate buffering, offer glare/rollback, optional test-only mDNS loopback, media operations |
| room | peer activation maps, actions/ping/leave/media surface and beforeunload cleanup |
| shared-peer | one underlying peer multiplexed across room-token frames, media ownership, idle cleanup |
| signal-handler | announcement/offer/answer/candidate state machine, glare ordering, retries/expiry and stale-peer recovery |
| strategy | room registry, signaling encryption, offer pool and shared room presence/announce scheduling |
| topic-strategy | topic subscribe/publish adapter, passive activation, self-subscription lifetime |
| utils | encoding/IDs, JSON/error helpers, socket retries, relay bookkeeping and online/offline reconnection |

Inspector: `Inspector` orchestrates `RendererInspector` timing/state with `Profiler` UI and tabs. RendererInspector collects nested render/compute frames (512 max), resolves GPU timestamps and supplies overdraw. Console bounds visible log elements at 200, filters/copies and counts unread messages. Memory reads renderer.info.memory; Performance averages CPU/GPU and graphs stats. Parameters builds typed Value editors and parameter groups; Settings offers storage/backend/trace/overdraw toggles and lazy extensions. Viewer renders node previews/full/split canvases and forwards input, with GPU-only node viewing. Extension adds persistent custom tabs and layout listeners. Graph/Item/List/Tab/Values/utils supply canvas charts, rows, layout/state and editors. Timeline records up to 500 frames by wrapping backend methods and provides hierarchical/count views, graph scrubbing and JSON export. Profiler and Style interiors remain incomplete as explicitly recorded below.

## Proven comment/documentation issues and concrete limits

1. **Missing patch rationale:** `PATCHES.md` jumps from §15 to §17. Manifest and recipe both include active patch **16**, final-owner shared bind-group eviction. Add a §16 rationale during authorized maintenance; do not remove the patch because its prose is absent.
2. **Stale bump navigation:** `PATCHES.md:33` attributes preloadThreeVendor to `js/game.js`; implementation is now `js/render/renderer-boot.js:11`. This can omit a hardcoded vendor directory during a bump.
3. **Wrong WebXR documentation:** `addons/webxr/VRButton.js` createButton JSDoc calls sessionInit an AR configuration and claims failure for immersive-ar. Its support check/requestSession both use **immersive-vr**. Intro also spells “appended ot”; XRButton repeats that typo. Generated addon comments should be corrected upstream or via generator policy, not by editing generated vendor files here.
4. **Shipping subset boundary:** Settings advertises Color Grading/TSL Graph imports under `addons/inspector/extensions/`, but those paths are absent from the 57-file subset. Generator lines 46–47 explicitly acknowledge they are not vendored. Selecting them can attempt an absent module; this source fact is not a browser reproduction or a claim of a production user flow.
5. **Historical wording needs care:** patch 14's “Present in pristine three 0.186.1” refers to the defect being present, as its recipe finds unhandled code and replaces it. Reading it as “fix already upstream” would incorrectly retire a live patch. Time-sensitive upstream statements were not refreshed over the network.
6. **Stale rendering comments:** Timeline labels its graph “Graph.js SVG” and refers repeatedly to “SVG Graph”; the imported Graph creates a canvas and draws with a 2D context. This is a comment-only discrepancy.
7. **Not a measured runtime finding:** shared-peer queues and public action-handler queues are separate from action-wire's hardening limits. No blanket claim that all Trystero buffering is bounded follows from the action-wire comment. The game direct-exchange path avoids joinRoom; do not infer current game exposure from an unused full-room API alone.

## Every-file ledger

“Complete” means the entire text was shown without truncation and read; “prefix” is exactly the read range shown. Every remaining interval is explicit. Hash verification is independent of reading status.

| File | Type / role | Bytes | SHA-256 | Read | Remaining |
| --- | --- | ---: | --- | --- | --- |
| `vendor/gpu-capture/MANIFEST.json` | JSON provenance/package metadata | 709 | `99e0f178845e50bf80de00c3f998126ea21abdb440d4cbfe23f8d59cd5109eae` | complete [0,709) | none |
| `vendor/gpu-capture/SPECTOR-LICENSE.txt` | license text | 1075 | `2d0995ba877a5f0ee647e8ccd3e185179994954d00d4957aedd66f76f6debd87` | complete [0,1075) | none |
| `vendor/gpu-capture/WEBGL-LINT-LICENSE.md` | license text | 2241 | `a5887987c58bac1c242439ebc7170a9759a9a344a9bfd444265eecee8687a3a7` | complete [0,2241) | none |
| `vendor/gpu-capture/spector.bundle.js` | minified JS bundle | 682744 | `5218807ed79ffa6b7753d8d1325d51baef590b27e0a8edd737c55983826ebf58` | prefix [0,2048) | [2048,682744) |
| `vendor/gpu-capture/webgl-lint.js` | UMD side-effect GL instrumentation | 150774 | `17b14abb3ccd4aa57f379c374dc0bb395b31c7ecdb99adb7d6fa5581ddd3572d` | prefix [0,2048) | [2048,150774) |
| `vendor/jsqr-1.4.0/LICENSE` | license text | 11358 | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` | complete [0,11358) | none |
| `vendor/jsqr-1.4.0/jsQR.js` | UMD decoder bundle | 256885 | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` | prefix [0,2048) | [2048,256885) |
| `vendor/rapier-0.19.3/LICENSE` | license text | 11343 | `4c05555705e3efde601fb1252ae48f1d63992af8a8fb8947745b7fa834e8f519` | complete [0,11343) | none |
| `vendor/rapier-0.19.3/package.json` | JSON provenance/package metadata | 823 | `0e0b00bc0e8d0dd7afed4da18831a5bc416fce03637c64b48329898dfd9e3320` | complete [0,823) | none |
| `vendor/rapier-0.19.3/rapier.mjs` | ESM bindings + embedded base64 WASM | 2238719 | `bce2c762b440101ebf8cbff038a71fe1884488becd0a53b9a7c0a7e3daf13a2b` | prefix [0,2048) | [2048,2238719) |
| `vendor/three-0.186.1/LICENSE.txt` | license text | 1081 | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` | complete [0,1081) | none |
| `vendor/three-0.186.1/MANIFEST.json` | JSON provenance/package metadata | 4673 | `87a6e6398941bd4b765f2f32cb50735e51755f0c4c4d9fc289b90177bea21339` | complete [0,4673) | none |
| `vendor/three-0.186.1/PATCHES.md` | patch rationale Markdown | 25229 | `50d4c3d5b3cdefc66dc74299be1d207f41a21e68ae0b198329c3f821c2feaa5d` | complete [0,25229) | none |
| `vendor/three-0.186.1/addons/inspector/Extension.js` | readable ESM JavaScript | 2026 | `04e555a52e240a52e3eda76fbc7ec3d19bb28207a41ac1f8d43fe4cf24fddba2` | complete [0,2026) | none |
| `vendor/three-0.186.1/addons/inspector/Inspector.js` | readable ESM JavaScript | 12054 | `ad63105e97f6f3f746632588036645ea6ada233cdc2d0758ffbb015599a9d4f1` | complete [0,12054) | none |
| `vendor/three-0.186.1/addons/inspector/RendererInspector.js` | readable ESM JavaScript | 10602 | `4252223601805bb32df911328e1626c3161284b5211d95ad399865d880dbeeae` | complete [0,10602) | none |
| `vendor/three-0.186.1/addons/inspector/tabs/Console.js` | readable ESM JavaScript | 9861 | `7cfaf8456722acdd98877e085861601b8e03dd19b71c6e04bafe8cad06bb593e` | complete [0,9861) | none |
| `vendor/three-0.186.1/addons/inspector/tabs/Memory.js` | readable ESM JavaScript | 4700 | `d0033867fbb34c62df64b0201b27a6ded163bdef2016d28db8dc27ff8ea08567` | complete [0,4700) | none |
| `vendor/three-0.186.1/addons/inspector/tabs/Parameters.js` | readable ESM JavaScript | 8703 | `2eb3aa11c8c067c3f64d8680b991f44d6de2deb700529aaefd77c5bc46cb36c9` | complete [0,8703) | none |
| `vendor/three-0.186.1/addons/inspector/tabs/Performance.js` | readable ESM JavaScript | 6301 | `d312db4453d35681f23baccdae42716c07325d18d1c7b82e9d6c0d38715c79bc` | complete [0,6301) | none |
| `vendor/three-0.186.1/addons/inspector/tabs/Settings.js` | readable ESM JavaScript | 5904 | `6f5926044e50465c596159b007bc399887f83bc9b7d0d38016f0eea56341ca09` | complete [0,5904) | none |
| `vendor/three-0.186.1/addons/inspector/tabs/Timeline.js` | readable ESM JavaScript | 44504 | `2d752424bbb461da80cc8218c3348991c73a29f02467fb7866532e8e92ae02bb` | complete [0,44504) | none |
| `vendor/three-0.186.1/addons/inspector/tabs/Viewer.js` | readable ESM JavaScript | 32869 | `ceae13e74498b1b2c9730c3d311c657c5e462477db30c2d7b0b4e5788a0887d7` | complete [0,32869) | none |
| `vendor/three-0.186.1/addons/inspector/ui/Graph.js` | readable ESM JavaScript | 4199 | `a472d2bff6191da471159eee9ebb08616581ad7a138841bc03c01d158688f904` | complete [0,4199) | none |
| `vendor/three-0.186.1/addons/inspector/ui/Item.js` | readable ESM JavaScript | 4186 | `dff0df175e734575102093a9b4e6fe90ad1b67131a44ef9b33061aa368d9f452` | complete [0,4186) | none |
| `vendor/three-0.186.1/addons/inspector/ui/List.js` | readable ESM JavaScript | 1528 | `47358b131fdadb488226e74c513a32ee3fb2e68ec177b612645b0f900b5b73b3` | complete [0,1528) | none |
| `vendor/three-0.186.1/addons/inspector/ui/Profiler.js` | readable ESM JavaScript | 55172 | `54e498ae37a8ecc519ed5d366030e3b6616490882af3aff949b4b18daf3b6771` | prefix [0,2048) | [2048,55172) |
| `vendor/three-0.186.1/addons/inspector/ui/Style.js` | readable ESM JavaScript | 50211 | `766b31871eeca311823c61e6d6dd0362da16ad1076c93f32c7798e7a99640352` | prefix [0,2048) | [2048,50211) |
| `vendor/three-0.186.1/addons/inspector/ui/Tab.js` | readable ESM JavaScript | 6088 | `8e5de0319aa154cd1650bb733dfd11f5d36bdbb355453f9038d24b1e4dad35d5` | complete [0,6088) | none |
| `vendor/three-0.186.1/addons/inspector/ui/Values.js` | readable ESM JavaScript | 8811 | `c583befa8c9d321ee1b151619ae58bd3e3de3753d9961720ce300d7ce491993b` | complete [0,8811) | none |
| `vendor/three-0.186.1/addons/inspector/ui/utils.js` | readable ESM JavaScript | 3871 | `c533e48658cf18063c6b79e500470fc10f63ff9a8c9e9c7f2afd75d1df8c5e97` | complete [0,3871) | none |
| `vendor/three-0.186.1/addons/tsl/display/BloomNode.js` | readable ESM JavaScript | 17242 | `f28a279656a37cf44bc09e45fd2de5df93a17cffad77f6da0a5bcd979cfd6525` | complete [0,17242) | none |
| `vendor/three-0.186.1/addons/webxr/VRButton.js` | readable ESM JavaScript | 5866 | `35a7621bbbe776203dad04cddc79c8e1b166dc3b6757d8b907f97df86d8a9d48` | complete [0,5866) | none |
| `vendor/three-0.186.1/addons/webxr/WebGLXRFallback.js` | readable ESM JavaScript | 2162 | `73d71e8c4aff1c3173d0ba20147311ee8cfb66e7e7203185c677559d00eeb1d0` | complete [0,2162) | none |
| `vendor/three-0.186.1/addons/webxr/XRButton.js` | readable ESM JavaScript | 4959 | `13ceb022e450bfc8ff48e7af8e39faceacf08fea84a844fb82858a126c4e0249` | complete [0,4959) | none |
| `vendor/three-0.186.1/three.core.min.js` | minified JS bundle | 389329 | `dae72ed2eea6703b95e6b57e26469ffa95733a9320675b4bfd1b5f5df1c12f8b` | prefix [0,2048) | [2048,389329) |
| `vendor/three-0.186.1/three.tsl.min.js` | minified JS bundle | 25647 | `2c38aa6be480f22bfa858b38f43fd25f5891f002f3f44fd41a95f674f5bccdf0` | prefix [0,2048) | [2048,25647) |
| `vendor/three-0.186.1/three.webgpu.min.js` | minified JS bundle | 714087 | `02a9bd70c638f841e62d76925f5cddea5950720ee2a2689927fdecfd26fb40db` | prefix [0,2048) | [2048,714087) |
| `vendor/three-patches/patches.mjs` | ESM exact-count patch source | 49734 | `587a37787598193e41bfbfff9540f4df5c51be97ae5e945546df74f424b01820` | complete [0,49734) | none |
| `vendor/trystero-0.25.4/LICENSE-noble-secp256k1` | license text | 1109 | `394c2e6e5552e5dba202bee6390b9d6aa2754d657f5b9869e83b3d265a315501` | complete [0,1109) | none |
| `vendor/trystero-0.25.4/LICENSE-trystero` | license text | 1060 | `bbf91fd979faac0def9551c570e2e9f92b4e02d22f38ca5d98860b6284e1ea25` | complete [0,1060) | none |
| `vendor/trystero-0.25.4/core/action-wire.js` | readable ESM JavaScript | 11523 | `0de547fd4785b32db50d3c63005cb2517364a17484d24618e658f43dfbaec760` | complete [0,11523) | none |
| `vendor/trystero-0.25.4/core/actions.js` | readable ESM JavaScript | 10671 | `312f1179d91f7020ddd923cf1136723376c9301e6d6f81814b979919b964cb26` | complete [0,10671) | none |
| `vendor/trystero-0.25.4/core/crypto.js` | readable ESM JavaScript | 1621 | `03e9cb5732f2f9725d9d01bba1e13d1a8e1ee616342bd67ab486b24ece01b13b` | complete [0,1621) | none |
| `vendor/trystero-0.25.4/core/handshake.js` | readable ESM JavaScript | 5264 | `42843c2a453faae73911e604f3b5dd105f286a2ad80c08a25deb53d5df75c4cf` | complete [0,5264) | none |
| `vendor/trystero-0.25.4/core/index.js` | readable ESM JavaScript | 727 | `4a8bbdbca66f269beb24e059014e852b673f5632b444d0269ecb7cc0780a43d4` | complete [0,727) | none |
| `vendor/trystero-0.25.4/core/media.js` | readable ESM JavaScript | 5498 | `bdc23cc7e0b8d24b3575cc413bcc9eaca0faf19d950ed98fc13aa3a4e9b2d645` | complete [0,5498) | none |
| `vendor/trystero-0.25.4/core/offer-pool.js` | readable ESM JavaScript | 3592 | `6e76e732a94edce0c9458ad4d5c26dbc06ce976d6103c1cff6778d4fd0f0f64e` | complete [0,3592) | none |
| `vendor/trystero-0.25.4/core/peer.js` | readable ESM JavaScript | 11791 | `51b916ad01df372416ae00b4561a2581c47b217c51655ecf0cd4dabd65b04e79` | complete [0,11791) | none |
| `vendor/trystero-0.25.4/core/room.js` | readable ESM JavaScript | 8403 | `f5efb7f535d9ca5b549df43a65531ba7cc2e48b260a9b0773a59be9c94d69505` | complete [0,8403) | none |
| `vendor/trystero-0.25.4/core/shared-peer.js` | readable ESM JavaScript | 12202 | `ac63f7e023bde23a33a6c8f5770b74a529e4b0e61da098d3776bdeb4c4b6dfed` | complete [0,12202) | none |
| `vendor/trystero-0.25.4/core/signal-handler.js` | readable ESM JavaScript | 17349 | `143bb18e6005da19ca748730492a815a2715abd3820e07d93cb810773e81de1b` | complete [0,17349) | none |
| `vendor/trystero-0.25.4/core/strategy.js` | readable ESM JavaScript | 15448 | `6b47d5773a9d88f9cee7631f5d80228eb99f6cd31a2d7e1f414eaadd482afee1` | complete [0,15448) | none |
| `vendor/trystero-0.25.4/core/topic-strategy.js` | readable ESM JavaScript | 3995 | `b259a34e551cff334ae47dbc6c7532d668f37b94f124d32ce27d08335f5a7485` | complete [0,3995) | none |
| `vendor/trystero-0.25.4/core/utils.js` | readable ESM JavaScript | 5725 | `6101a781b05145891c67045ad2c08bc10e880e09ae73b8a54cba6d8b800e36d9` | complete [0,5725) | none |
| `vendor/trystero-0.25.4/noble-secp256k1.js` | readable ESM JavaScript | 55700 | `e0d1bad238ceef8d5451713daf6d5b256ce871d3200fe7ee79dbc01179ec806a` | prefix [0,2048) | [2048,55700) |
| `vendor/trystero-0.25.4/nostr/index.js` | readable ESM JavaScript | 9468 | `0f876c1cd147a661ff392f16253bde4679f0e411748a29ffb9873fbe0bab07d7` | complete [0,9468) | none |

## Exact continuation batches

The source-reading task remains open for the following intervals. Read **one batch per tool call**, without summarization or grep substitution; promote a range only after receiving its entire untruncated output. The 12,000-byte maximum is chosen to keep even minified source below common output caps. Batches are independent byte slices of the immutable hash above. If a UTF-8 character straddles a boundary, use a binary-safe escaped representation or overlap a few bytes and record that overlap; never silently drop source bytes. Header prefixes can end mid-token and do not establish later definitions. The large Rapier base64 WASM segment must be distinguished from executable JS in a future audit; no decoded binary inspection is claimed here.

For an individual batch use Python `Path(file).read_bytes()[start:end]` and print its decoded content with an adequate output budget. First finish the two remaining readable Inspector files and noble, then jsQR/lint, then generated bundles.

### `vendor/three-0.186.1/addons/inspector/ui/Style.js`

Remaining 48,163 bytes; 5 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,50211)`.

### `vendor/three-0.186.1/addons/inspector/ui/Profiler.js`

Remaining 53,124 bytes; 5 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,55172)`.

### `vendor/trystero-0.25.4/noble-secp256k1.js`

Remaining 53,652 bytes; 5 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,55700)`.

### `vendor/three-0.186.1/three.tsl.min.js`

Remaining 23,599 bytes; 2 exact batches:

B1 `[2048,14048)`; B2 `[14048,25647)`.

### `vendor/gpu-capture/webgl-lint.js`

Remaining 148,726 bytes; 13 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,62048)`; B6 `[62048,74048)`; B7 `[74048,86048)`; B8 `[86048,98048)`; B9 `[98048,110048)`; B10 `[110048,122048)`; B11 `[122048,134048)`; B12 `[134048,146048)`; B13 `[146048,150774)`.

### `vendor/jsqr-1.4.0/jsQR.js`

Remaining 254,837 bytes; 22 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,62048)`; B6 `[62048,74048)`; B7 `[74048,86048)`; B8 `[86048,98048)`; B9 `[98048,110048)`; B10 `[110048,122048)`; B11 `[122048,134048)`; B12 `[134048,146048)`; B13 `[146048,158048)`; B14 `[158048,170048)`; B15 `[170048,182048)`; B16 `[182048,194048)`; B17 `[194048,206048)`; B18 `[206048,218048)`; B19 `[218048,230048)`; B20 `[230048,242048)`; B21 `[242048,254048)`; B22 `[254048,256885)`.

### `vendor/three-0.186.1/three.core.min.js`

Remaining 387,281 bytes; 33 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,62048)`; B6 `[62048,74048)`; B7 `[74048,86048)`; B8 `[86048,98048)`; B9 `[98048,110048)`; B10 `[110048,122048)`; B11 `[122048,134048)`; B12 `[134048,146048)`; B13 `[146048,158048)`; B14 `[158048,170048)`; B15 `[170048,182048)`; B16 `[182048,194048)`; B17 `[194048,206048)`; B18 `[206048,218048)`; B19 `[218048,230048)`; B20 `[230048,242048)`; B21 `[242048,254048)`; B22 `[254048,266048)`; B23 `[266048,278048)`; B24 `[278048,290048)`; B25 `[290048,302048)`; B26 `[302048,314048)`; B27 `[314048,326048)`; B28 `[326048,338048)`; B29 `[338048,350048)`; B30 `[350048,362048)`; B31 `[362048,374048)`; B32 `[374048,386048)`; B33 `[386048,389329)`.

### `vendor/gpu-capture/spector.bundle.js`

Remaining 680,696 bytes; 57 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,62048)`; B6 `[62048,74048)`; B7 `[74048,86048)`; B8 `[86048,98048)`; B9 `[98048,110048)`; B10 `[110048,122048)`; B11 `[122048,134048)`; B12 `[134048,146048)`; B13 `[146048,158048)`; B14 `[158048,170048)`; B15 `[170048,182048)`; B16 `[182048,194048)`; B17 `[194048,206048)`; B18 `[206048,218048)`; B19 `[218048,230048)`; B20 `[230048,242048)`; B21 `[242048,254048)`; B22 `[254048,266048)`; B23 `[266048,278048)`; B24 `[278048,290048)`; B25 `[290048,302048)`; B26 `[302048,314048)`; B27 `[314048,326048)`; B28 `[326048,338048)`; B29 `[338048,350048)`; B30 `[350048,362048)`; B31 `[362048,374048)`; B32 `[374048,386048)`; B33 `[386048,398048)`; B34 `[398048,410048)`; B35 `[410048,422048)`; B36 `[422048,434048)`; B37 `[434048,446048)`; B38 `[446048,458048)`; B39 `[458048,470048)`; B40 `[470048,482048)`; B41 `[482048,494048)`; B42 `[494048,506048)`; B43 `[506048,518048)`; B44 `[518048,530048)`; B45 `[530048,542048)`; B46 `[542048,554048)`; B47 `[554048,566048)`; B48 `[566048,578048)`; B49 `[578048,590048)`; B50 `[590048,602048)`; B51 `[602048,614048)`; B52 `[614048,626048)`; B53 `[626048,638048)`; B54 `[638048,650048)`; B55 `[650048,662048)`; B56 `[662048,674048)`; B57 `[674048,682744)`.

### `vendor/three-0.186.1/three.webgpu.min.js`

Remaining 712,039 bytes; 60 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,62048)`; B6 `[62048,74048)`; B7 `[74048,86048)`; B8 `[86048,98048)`; B9 `[98048,110048)`; B10 `[110048,122048)`; B11 `[122048,134048)`; B12 `[134048,146048)`; B13 `[146048,158048)`; B14 `[158048,170048)`; B15 `[170048,182048)`; B16 `[182048,194048)`; B17 `[194048,206048)`; B18 `[206048,218048)`; B19 `[218048,230048)`; B20 `[230048,242048)`; B21 `[242048,254048)`; B22 `[254048,266048)`; B23 `[266048,278048)`; B24 `[278048,290048)`; B25 `[290048,302048)`; B26 `[302048,314048)`; B27 `[314048,326048)`; B28 `[326048,338048)`; B29 `[338048,350048)`; B30 `[350048,362048)`; B31 `[362048,374048)`; B32 `[374048,386048)`; B33 `[386048,398048)`; B34 `[398048,410048)`; B35 `[410048,422048)`; B36 `[422048,434048)`; B37 `[434048,446048)`; B38 `[446048,458048)`; B39 `[458048,470048)`; B40 `[470048,482048)`; B41 `[482048,494048)`; B42 `[494048,506048)`; B43 `[506048,518048)`; B44 `[518048,530048)`; B45 `[530048,542048)`; B46 `[542048,554048)`; B47 `[554048,566048)`; B48 `[566048,578048)`; B49 `[578048,590048)`; B50 `[590048,602048)`; B51 `[602048,614048)`; B52 `[614048,626048)`; B53 `[626048,638048)`; B54 `[638048,650048)`; B55 `[650048,662048)`; B56 `[662048,674048)`; B57 `[674048,686048)`; B58 `[686048,698048)`; B59 `[698048,710048)`; B60 `[710048,714087)`.

### `vendor/rapier-0.19.3/rapier.mjs`

Remaining 2,236,671 bytes; 187 exact batches:

B1 `[2048,14048)`; B2 `[14048,26048)`; B3 `[26048,38048)`; B4 `[38048,50048)`; B5 `[50048,62048)`; B6 `[62048,74048)`; B7 `[74048,86048)`; B8 `[86048,98048)`; B9 `[98048,110048)`; B10 `[110048,122048)`; B11 `[122048,134048)`; B12 `[134048,146048)`; B13 `[146048,158048)`; B14 `[158048,170048)`; B15 `[170048,182048)`; B16 `[182048,194048)`; B17 `[194048,206048)`; B18 `[206048,218048)`; B19 `[218048,230048)`; B20 `[230048,242048)`; B21 `[242048,254048)`; B22 `[254048,266048)`; B23 `[266048,278048)`; B24 `[278048,290048)`; B25 `[290048,302048)`; B26 `[302048,314048)`; B27 `[314048,326048)`; B28 `[326048,338048)`; B29 `[338048,350048)`; B30 `[350048,362048)`; B31 `[362048,374048)`; B32 `[374048,386048)`; B33 `[386048,398048)`; B34 `[398048,410048)`; B35 `[410048,422048)`; B36 `[422048,434048)`; B37 `[434048,446048)`; B38 `[446048,458048)`; B39 `[458048,470048)`; B40 `[470048,482048)`; B41 `[482048,494048)`; B42 `[494048,506048)`; B43 `[506048,518048)`; B44 `[518048,530048)`; B45 `[530048,542048)`; B46 `[542048,554048)`; B47 `[554048,566048)`; B48 `[566048,578048)`; B49 `[578048,590048)`; B50 `[590048,602048)`; B51 `[602048,614048)`; B52 `[614048,626048)`; B53 `[626048,638048)`; B54 `[638048,650048)`; B55 `[650048,662048)`; B56 `[662048,674048)`; B57 `[674048,686048)`; B58 `[686048,698048)`; B59 `[698048,710048)`; B60 `[710048,722048)`; B61 `[722048,734048)`; B62 `[734048,746048)`; B63 `[746048,758048)`; B64 `[758048,770048)`; B65 `[770048,782048)`; B66 `[782048,794048)`; B67 `[794048,806048)`; B68 `[806048,818048)`; B69 `[818048,830048)`; B70 `[830048,842048)`; B71 `[842048,854048)`; B72 `[854048,866048)`; B73 `[866048,878048)`; B74 `[878048,890048)`; B75 `[890048,902048)`; B76 `[902048,914048)`; B77 `[914048,926048)`; B78 `[926048,938048)`; B79 `[938048,950048)`; B80 `[950048,962048)`; B81 `[962048,974048)`; B82 `[974048,986048)`; B83 `[986048,998048)`; B84 `[998048,1010048)`; B85 `[1010048,1022048)`; B86 `[1022048,1034048)`; B87 `[1034048,1046048)`; B88 `[1046048,1058048)`; B89 `[1058048,1070048)`; B90 `[1070048,1082048)`; B91 `[1082048,1094048)`; B92 `[1094048,1106048)`; B93 `[1106048,1118048)`; B94 `[1118048,1130048)`; B95 `[1130048,1142048)`; B96 `[1142048,1154048)`; B97 `[1154048,1166048)`; B98 `[1166048,1178048)`; B99 `[1178048,1190048)`; B100 `[1190048,1202048)`; B101 `[1202048,1214048)`; B102 `[1214048,1226048)`; B103 `[1226048,1238048)`; B104 `[1238048,1250048)`; B105 `[1250048,1262048)`; B106 `[1262048,1274048)`; B107 `[1274048,1286048)`; B108 `[1286048,1298048)`; B109 `[1298048,1310048)`; B110 `[1310048,1322048)`; B111 `[1322048,1334048)`; B112 `[1334048,1346048)`; B113 `[1346048,1358048)`; B114 `[1358048,1370048)`; B115 `[1370048,1382048)`; B116 `[1382048,1394048)`; B117 `[1394048,1406048)`; B118 `[1406048,1418048)`; B119 `[1418048,1430048)`; B120 `[1430048,1442048)`; B121 `[1442048,1454048)`; B122 `[1454048,1466048)`; B123 `[1466048,1478048)`; B124 `[1478048,1490048)`; B125 `[1490048,1502048)`; B126 `[1502048,1514048)`; B127 `[1514048,1526048)`; B128 `[1526048,1538048)`; B129 `[1538048,1550048)`; B130 `[1550048,1562048)`; B131 `[1562048,1574048)`; B132 `[1574048,1586048)`; B133 `[1586048,1598048)`; B134 `[1598048,1610048)`; B135 `[1610048,1622048)`; B136 `[1622048,1634048)`; B137 `[1634048,1646048)`; B138 `[1646048,1658048)`; B139 `[1658048,1670048)`; B140 `[1670048,1682048)`; B141 `[1682048,1694048)`; B142 `[1694048,1706048)`; B143 `[1706048,1718048)`; B144 `[1718048,1730048)`; B145 `[1730048,1742048)`; B146 `[1742048,1754048)`; B147 `[1754048,1766048)`; B148 `[1766048,1778048)`; B149 `[1778048,1790048)`; B150 `[1790048,1802048)`; B151 `[1802048,1814048)`; B152 `[1814048,1826048)`; B153 `[1826048,1838048)`; B154 `[1838048,1850048)`; B155 `[1850048,1862048)`; B156 `[1862048,1874048)`; B157 `[1874048,1886048)`; B158 `[1886048,1898048)`; B159 `[1898048,1910048)`; B160 `[1910048,1922048)`; B161 `[1922048,1934048)`; B162 `[1934048,1946048)`; B163 `[1946048,1958048)`; B164 `[1958048,1970048)`; B165 `[1970048,1982048)`; B166 `[1982048,1994048)`; B167 `[1994048,2006048)`; B168 `[2006048,2018048)`; B169 `[2018048,2030048)`; B170 `[2030048,2042048)`; B171 `[2042048,2054048)`; B172 `[2054048,2066048)`; B173 `[2066048,2078048)`; B174 `[2078048,2090048)`; B175 `[2090048,2102048)`; B176 `[2102048,2114048)`; B177 `[2114048,2126048)`; B178 `[2126048,2138048)`; B179 `[2138048,2150048)`; B180 `[2150048,2162048)`; B181 `[2162048,2174048)`; B182 `[2174048,2186048)`; B183 `[2186048,2198048)`; B184 `[2198048,2210048)`; B185 `[2210048,2222048)`; B186 `[2222048,2234048)`; B187 `[2234048,2238719)`.

