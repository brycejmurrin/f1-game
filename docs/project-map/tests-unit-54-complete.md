# Unit batch 54 — complete source map

Read-only mapping of all 23 assigned files (4,862 lines), with 217 source registration sites expanding to 222 cases through parameterized registration loops. No test, browser, runtime edit or commit was performed. Source was read in individually returned slices of at most 80 lines and under 10,000 characters; all ranges below are inclusive. One aggregate presentation truncation was repaired by returning tooling-fast-runner lines 321–400 again. Assertions listed below are source call spans, including multiline calls, rather than a dump of predicates. Per-file targets, fixtures and limits apply to every case in that section.

## Navigation evidence

The repository AGENTS.md and `.claude/skills/code-nav/SKILL.md` were read. Attached apex-lsp definition/reference/symbol tools established these production seams (static usage, not execution):

| Symbol | Definition / production use |
|---|---|
| TLXShaders.viewport | `js/render/three/tsl-viewport.js:123`; used by TLX and post chain. |
| TLXShaders.postChain | `js/render/three/tlx-post.js:1311`; TLX creates the chain. |
| TLXShaders.lit | `js/render/three/tsl-lit.js:2956`; TLX creates lit materials. |
| TLXShaders.shadowSys | `js/render/three/tlx-shadow.js:969`; TLX creates shadow subsystem. |
| InstCells | `js/render/shared/inst-cells.js:9`; referenced by GLX, TLX and WGX. |
| TLX cullInstances | symbol search disambiguated three backend declarations; file-position lookup selected `js/render/three/tlx.js:2257`, with internal/freeInstancedBatch/export references. Bare-name lookup selected GLX, so that result was not used to attribute TLX. |
| matKeyFor | `js/render/three/tlx.js:1964`; materialFor and _captureRec use it. |
| releaseTexSource | `js/render/three/tlx.js:64`; createTexture and refillTexture install it. |
| setRange0 | `js/render/three/tlx.js:146`; blob/decal/coalesced stream append and upload paths use it. |
| warmDraws / pinPipelines | `js/render/three/tlx.js:3679` / `3851`; internal references confirmed. |
| CarDraw warmCockpitRig / G.gfx | module-file fallback located `js/car/car-draw.js:1485`, with export/caller coverage explicitly unverified; façade reference search found 111 G.gfx uses in car-draw and use across mirror/shadow/garage/UI modules. |

TLXShaders lookups explicitly reported text-match fallback for an untyped multi-assignment window object; load order remains relevant. Node tools outside js are linked from their imports and directly read source in these tests, not claimed as LSP-resolved symbols.

## Reading and source integrity

| Assigned source | Complete read ranges | SHA-256 |
|---|---|---|
| `tests/unit/tlx-inst-cells.test.mjs` | 1–80, 81–160, 161–240, 241–300 | `96a76850445c89f56f04e5aa64fa3dadf6e736a54fef4993ba7695a0ae48e477` |
| `tests/unit/tlx-mat-key-memo.test.mjs` | 1–80, 81–115 | `c8e906f39149900589d1fd591ece99dd11b2748e3726f36cd725bce4db86e400` |
| `tests/unit/tlx-mirror-inset.test.mjs` | 1–80, 81–123 | `c3ce6fdfe8c4c63d7a2ead35b1acf7d646627bb36bbb8322e64b34517101e3db` |
| `tests/unit/tlx-pipe-pin-warm.test.mjs` | 1–80, 81–125 | `ad02bbc5807e3ffc2a2554e460f37aa0ca632b2a7cb2528936688dfd6365c952` |
| `tests/unit/tlx-post-fixed-mats.test.mjs` | 1–80, 81–149 | `4c42270778d17b02586e0657be6173719aa9f7fd7b2f78ff2201a288cdd9908b` |
| `tests/unit/tlx-post-orient-cover-webgpu.test.mjs` | 1–53 | `eb02b66dd8df35fecfc3a5b40948922955db0f7a49889a9ca6cd26bba0c189d3` |
| `tests/unit/tlx-post-phone-res.test.mjs` | 1–80, 81–106 | `530b69869356a23578aa005b251c7fb5e26951be220c4c4db637e3510c94db6a` |
| `tests/unit/tlx-prune-pin.test.mjs` | 1–80, 81–86 | `ab4e5a16bc424f6d5fcf46b54c811de6b746d7c3dc08505a564f64c5efc1034f` |
| `tests/unit/tlx-recovery-lifecycle.test.mjs` | 1–80, 81–160, 161–174 | `f01bad803466f435d65c2b11f959bcac1993bf3f6b23aceb7ac2600df344dbb0` |
| `tests/unit/tlx-rig-warm.test.mjs` | 1–80, 81–160, 161–240, 241–320, 321–328 | `97d98a5e5789d8ce3305bea70eff0a30ce4a2dba829ed2895a01fc799f9d25c5` |
| `tests/unit/tlx-round2.test.mjs` | 1–80, 81–160, 161–240, 241–320, 321–390 | `731374db62afbfb2ef63037de23ff0dffb584e37dcc99d61a79f31766e3ce552` |
| `tests/unit/tlx-smith-root.test.mjs` | 1–80, 81–151 | `9eada21b08353372579d1dd2ec9b6f66c8824b7b8f6022ea6f027c539cbf5b02` |
| `tests/unit/tlx-texture-release.test.mjs` | 1–80, 81–160, 161–240, 241–320, 321–400, 401–412 | `f2406bf555677c0e0ab23124b15c4420f50b7ebe8f32f59ec70d2ec351961f05` |
| `tests/unit/tlx-viewport.test.mjs` | 1–80, 81–160, 161–240, 241–312 | `6e03d080e6f4730c5eda5b44a7b81c15f152b7e3ff6aed95e1f28a469ce90973` |
| `tests/unit/tolerance-diff.test.mjs` | 1–80, 81–86 | `908d414bb85d46cf8091d9c0258bf7470f6872901ebae290b77e85e7e64dd114` |
| `tests/unit/tooling-fast-runner.test.mjs` | 1–80, 81–160, 161–240, 241–320, 321–400, 401–480, 481–560, 561–640, 641–660 | `cd7ba13465a9d2baf2cca72739408253d230311061c2f3dc4708707b8ac3efbf` |
| `tests/unit/tooling-timings.test.mjs` | 1–61 | `07bacea19c549ecb3d42aa38ccd82ce92ad3a26c67649e141dbafa29e78f7817` |
| `tests/unit/tools-a12-guards.test.mjs` | 1–80, 81–160, 161–176 | `dc4abc15f605f8f3a8dca32ac6b36a931953c378e135ccab8593c62eade55697` |
| `tests/unit/tools-runnable.test.mjs` | 1–80, 81–160, 161–240, 241–320, 321–400, 401–480, 481–560, 561–640, 641–720, 721–800, 801–877 | `40046da9cc7244be3475c48bc2a8fdaf250a7fdbab3d45fcf7ee150216ba9c08` |
| `tests/unit/tools-w13a-agent-help.test.mjs` | 1–39 | `1396456e4bdc47670ee535cbb66ad614b38c8af88701e7d8bcd1ac478bb56f85` |
| `tests/unit/tools-w13a-helmet-sheet.test.mjs` | 1–25 | `1f4c65c17b00f746ea09f89c6dfcfc0909683a75c9f8d340fdce4d1d50b82e4a` |
| `tests/unit/tools-w13a-probe-page.test.mjs` | 1–70 | `a8a24463cf4d4d51a2565f404ddcaa6d0f8b85fe67124774d8659c27e0bf26aa` |
| `tests/unit/tools-w13a-quick-validate.test.mjs` | 1–44 | `cde31af391489cbff21c9290603bdb337f3ffb2025caeb72c74a48ac7e8614f2` |

## Cases and assertion evidence

A template-name row denotes all registrations created by its surrounding loop: mirror inset WGSL/GLSL; recovery initial failure true/false; Smith GLSL/WGSL; decal cleanup warming false/true; isolated bail isolated/ordinary. Other loops are fixture variations within one registration. Case titles below retain their exact source wording; the adjacent fixture/limit prose explains what those claims actually establish. Embedded test programs and TAP rows are synthetic inputs, not additional registrations of the outer suite.

### tlx-inst-cells.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 30, 173, 200, 201, 204, 205.

Exercised targets: TLX cullInstances/updateInstances/setInstanceRange/_writeInstanceMatrices; real Frustum and InstCells.

Fixtures and meaning: load (39–68) creates ten translated instances in 10 m cells and records writes; slab (71–76) supplies axis-aligned frusta. loadGpuPack (141–209) adds eight instances in unequal-sized cells, matrix/tint attributes, and independently flushed device arrays. Shared fixture assertions: lift 30; attribute.flush 173; flush 200–205.

Limits and cleanup: Same-cell movement must retain resident packs; changing prefixes must write exactly the required component ranges. Device arrays are simulated; no GPU upload, real camera frustum, fog, radial-cull or performance evidence.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| a moved camera over the same cells neither repacks nor uploads | 78–90 | 80, 81, 84, 85, 86, 87, 88–89 |
| a changed cell set repacks and uploads | 92–101 | 95, 96, 97, 98, 99, 100 |
| the shadow cull (upload:false) neither consults nor disturbs the key | 103–118 | 108, 109, 112, 113, 114, 116, 117 |
| updateInstances invalidates the cell key | 120–127 | 124, 125, 126 |
| apex26.instCellCache=0 turns the cell key off | 129–136 | 133, 135 |
| instance suffix ranges preserve GPU matrices and tint across unequal-cell changes | 211–225 | 214, 216, 218, 220, 222 |
| an interior cell replacement preserves only the common prefix | 227–238 | 234 |
| pending initial and suffix writes are unioned until the renderer consumes them | 240–252 | 245, 249, 251 |
| foreign instance writes invalidate prefix reuse and ignore a requested dirty suffix | 254–268 | 259, 260, 264 |
| shadow culls and independent main/mirror packs cannot lend each other a prefix | 270–282 | 275, 277, 279, 281 |
| matrix-only external writes leave tint clean and offset views are foreign packs | 284–300 | 289, 290, 296, 298, 299 |

### tlx-mat-key-memo.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 37, 40, 42, 43.

Exercised targets: TLX buildMatKey/matKeyFor, exercised by materialFor and warm capture.

Fixtures and meaning: liftMemo (35–47) extracts the actual WeakMap declaration through materialFor; FIELDS (52–57) supplies 13 mutable properties across plain/chunked/instanced combinations. Helper boundary assertions 37,40,42–43.

Limits and cleanup: Mutation parity uses the production builder as oracle, so shared mistakes in builder/memo can pass. The Object.is case compares primitive string values and cannot establish string identity or absence of allocation.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| the memo never returns a key a fresh build would not | 59–75 | 65, 68–69, 71–72 |
| depthBias is compared by VALUE — the array is mutated in place too | 77–88 | 83, 85, 87 |
| the chunked and instanced flags are part of the compare, not just the key | 90–105 | 98, 99, 100, 101, 102, 104 |
| a repeated call on unchanged input returns the SAME string instance | 107–115 | 114 |

### tlx-mirror-inset.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: TLXShaders.post and postChain, FXAA folded mirror graph.

Fixtures and meaning: Real vendored Three, fake-webgl2, real chunks/post factories; WGSL/GLSL builders compile graphs over mipmapped RenderTargets. The second case intercepts post construction, replaces renderer.render, and drives four off/on transitions with a 1×1 black fallback; the old nearest filter is a negative control.

Limits and cleanup: Validates emitted sampling/branch structure and sampler declaration, including exactly one explicit-gradient mirror sample. Fake GL and shader text do not establish pixel parity, device validity or speed. finally restores factory and disposes materials, targets, mirror and renderer.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| folded mirror: ${language} samples only the exact inset with explicit gradients | 16–64 | 38, 39, 41, 43, 44, 45, 46, 53, 55, 56, 58 |
| production mirror fallback declares its gradient sampler through cold/off/on/off transitions | 66–123 | 87, 88, 89, 90, 102, 108, 109, 110, 117 |

### tlx-pipe-pin-warm.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 27.

Exercised targets: TLX pinPipelines/prunePool against vendored Three pipeline ownership.

Fixtures and meaning: makePin (30–33) lifts pipeline pin state. rig (35–55) draws real BoxGeometry/NodeMaterial through fake GL and counts linkProgram, with wrapper dispose events mimicking prune. A 600-pipeline map includes a compute pipeline. Boundary assertion 27.

Limits and cleanup: Controls prove release/relink behavior and pin lifetime, factory interception before switches, bounded render-only retention, and prune ordering. No handset compilation timing. Renderer disposed via t.after; geometry/material objects are not explicitly disposed by rig.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| control (before the fix): dropping the last wrapper destroys its pipeline, and the next draw links it again | 57–65 | 60, 63, 64 |
| pinned (the fix): the warm's pipelines survive a prune drop, and race entry's draw builds nothing | 67–78 | 71, 73, 75, 76, 77 |
| armed before the first frame: a pipeline a RenderObject switches away from mid-warm is kept too | 80–99 | 97, 98 |
| pinPipelines: render pipelines only, capped, and a no-op without a pipeline cache | 101–116 | 109, 110, 111, 113–114, 115 |
| tlx.js wiring: prunePool arms the pin at the first present and sweeps before it drops a wrapper | 118–125 | 123, 124 |

### tlx-post-fixed-mats.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: TLXShaders.post/postChain and TLX spatial-upscale gate/viewport uv.

Fixtures and meaning: Source canaries inspect fixed AO/godray/bloom slots and fallback paths. sharpenFixture (53–77) executes actual arithmetic through scalar/vector Node stand-ins. Final case lifts resolve/sizing/upscale/UV code, recording draws for direct and software destinations at HIGH/MED/LOW/HIGH.

Limits and cleanup: Canaries are spelling-sensitive; arithmetic is numeric CPU emulation, and final mapping uses mocked draw/vector objects. Covers sharpen extrema and exact destination sizing, not TSL compilation or pixels. VM contexts own fixture state.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| tsl-post exposes fixed H/V blur and per-mip bloom materials with unique keys | 14–29 | 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28 |
| tlx-post present uses fixed mats by default and keeps a swap fallback | 31–49 | 33, 34, 35, 36, 37, 40, 41, 42, 43–44, 46, 47, 48 |
| halo-limited sharpen is opt-in and bounds bright and dark edge extrema | 79–89 | 81, 82, 83, 84, 86, 87, 88 |
| fixed phone FXAA maps the destination through HIGH → MED → LOW → HIGH | 91–149 | 99, 133, 134, 136, 137, 138, 140, 142, 143, 144, 145 |

### tlx-post-orient-cover-webgpu.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 22.

Exercised targets: postChain orientation-cover gate in tlx-post.

Fixtures and meaning: gate (21–35) runs the actual initialization slice in a VM with WebGPU/WebGL backend flags and records viewport mapper creation; source-anchor assertion 22.

Limits and cleanup: Phone WebGL retains cover, WebGPU refuses the square cover, desktop refuses it for both backends. This executes selection only, not actual Three target viewport behavior or stretched pixels.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| phone WebGL keeps the #3311 orientation cover | 37–41 | 39, 40 |
| phone WebGPU does not use the orientation cover (stretched-frame regression) | 43–48 | 45, 46, 47 |
| desktop never builds the cover | 50–53 | 51, 52 |

### tlx-post-phone-res.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 46, 47, 48.

Exercised targets: postChain PHONE_POST_SCALE/postSize/layoutHalf/layoutBloom/resize/syncAaRT.

Fixtures and meaning: layoutFixture (33–51) executes real helpers/layout code with a recording place function and fake target identities. Phone/desktop, fixed allocations, orientation-cover transpose, odd/minimum dimensions and scale restoration are fixtures. Extraction assertions 46–48.

Limits and cleanup: Verifies full scene-sized phone composite/AA and half-sized AO/godray/bloom, logical-versus-physical placement and exposed diagnostics. Source pins cover wiring and SSR texels; no actual target allocation or GPU output.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| tlx-post declares a phone post working size distinct from the scene | 13–22 | 14–15, 16–17, 18–19, 20–21 |
| phone post runs at the full scene resolution (pre-#3479 clarity) | 27–31 | 30 |
| phone composite keeps full scene detail, like desktop | 53–62 | 55, 56, 57, 58, 60, 61 |
| fixed phone allocations contain the logical post viewports after shrink and restore | 64–74 | 68, 69, 71, 73 |
| odd and minimum phone dimensions remain valid through a scale change | 76–82 | 78, 79, 81 |
| composite and FXAA draw at post size, scene stays at W×H | 84–94 | 85–86, 87–88, 89–90, 92–93 |
| #3311 phone orient cover: equal-pixel transpose keeps square physical | 96–106 | 100, 101, 103–104, 105 |

### tlx-prune-pin.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 29, 31.

Exercised targets: TLX prunePool/pinMesh/ensureStream/ensureGlowStream/wrapStream; car-draw and car-mesh pin wiring.

Fixtures and meaning: liftPrune (27–36) extracts constants/function; pool (38–51) builds geometry/material lookup maps and records dropped wrappers. Idle pinned/unpinned/fresh wrappers and six 30-second prunes test retention. Helper anchors 29,31.

Limits and cleanup: Behavior protects deploy-only geometry from repeated pruning; source checks require ERS/OT/rear-light and stream pin calls. No rendering or pipeline timing; mocked dropWrapper only records events.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| an idle wrapper of a pinned geometry survives the prune; an unpinned idle one does not | 53–65 | 61, 62, 63, 64 |
| a pinned wrapper survives every prune, not just the first | 67–74 | 72, 73 |
| TLX exports pinMesh and car-draw pins the deploy-only draws through the feature-detected hook | 76–86 | 78, 81, 83, 85 |

### tlx-recovery-lifecycle.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 17, 30.

Exercised targets: shadowSys.warm; TLX post retry lifecycle; lit.setSsrMrt; postChain state/needsDepth.

Fixtures and meaning: Acorn extracts actual vendored RenderObject/RenderObjects classes (24–35). shadowHarness (36–67) uses real Three scene/geometry and ownership Set, stubbing backend/compiler managers and injecting partial compile failure. SSR cases use real lit factory, then fake-GL post graph with camera matrices. Helper anchors 17,30.

Limits and cleanup: Checks eight warm replacements, first/partial failures, detachment, render-target restore, material MRT graph capability and diagnostic/depth gate agreement. No real context/device loss or GPU work. t.after retires fixtures; materials explicitly disposed in SSR cases.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| shadow replacement warm retires old render objects as well as geometry | 69–78 | 73, 74, 75, 76 |
| partial shadow warm failure retires new probes and retains last successful holders | 80–95 | 85, 86, 87, 88, 89, 90, 93, 94 |
| first shadow warm failure leaves no retained probe render objects | 97–103 | 99, 100, 101, 102 |
| SSR materials retain capability across post recovery (initial failure=${initialFailure}) | 106–141 | 118, 124, 127, 128, 130, 133, 135, 135, 136, 137, 137, 139 |
| post SSR diagnostics agree with uploaded road/car gates and required camera data | 144–174 | 170, 171, 172 |

### tlx-rig-warm.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 35.

Exercised targets: TLX warmDraws/startRigWarm/compileWarmProbe/_captureRec/finish graph selection; CarDraw warmCockpitRig/warmCockpitTelemetry and game entry/menu wiring.

Fixtures and meaning: rig (41–85) lifts actual warm state/functions over real Three/fake GL and actual lit graphs; materialFor, settling, mirror-stage and present dispatch are controlled substitutes. Rig layouts lack track attributes; transforms cover both determinant signs and coalesced skip. Timers and setImmediate exercise queued/active jobs.

Limits and cleanup: Counts compile calls and linkProgram, checks deduplication/queue ownership/menu gating, 20-second inactivity expiry, mirror world keys, and rounded finish IDs 60–85. Source checks connect harness dispatch to production. Renderer t.after; fake timers reset explicitly. No race-entry timing or visual proof; some geometry/material probes remain GC-owned.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| warmDraws captures without painting, then the next present compiles each pair, owned (game.js pauses on warming) | 99–117 | 105, 106, 107, 108, 109, 110, 111, 112–113, 114, 116 |
| after the warm, drawing the rig links nothing; without it the same draw links its program (the mid-race switch) | 119–137 | 133, 136 |
| A·W50: a double-sided pair compiles both windings (the race also draws the rig's DoubleSide keep material mirrored) | 139–149 | 146, 147–148 |
| a second warmDraws over pairs already compiled resolves at once and holds no present | 151–160 | 156, 157, 158, 159 |
| behind a requested program warm, warmDraws resolves at once and the rig still compiles before any frame paints | 162–179 | 171, 172, 173, 174, 176, 177, 178 |
| A·W56: a warmDraws meeting a queued rig job captures NOW and joins it, then both compile (was: refused) | 181–197 | 189, 192, 193, 195, 196 |
| A·W56: a warmDraws meeting a rig job already compiling queues its captured pairs behind it; fn runs once | 199–211 | 203, 206, 208, 209, 210 |
| A·W56: a queued rig job outlives a long held warm while presents come, and is dropped only when none came for 20 s | 213–238 | 219, 220, 224, 226, 236, 237 |
| A·W56: a queued rig job reports warmQueued until a present starts it, so the menu keeps its last warm frame owed | 240–254 | 247, 248, 249, 250, 251, 253 |
| menu path: opts.mirror runs the mirror stage over the race scene once per world, never on a software GPU or without a key | 256–272 | 260, 262, 263, 264, 266, 268, 271 |
| wiring: present() dispatches the rig warm after the entry and mirror warms; car-draw warms both seats; race entry awaits it | 274–297 | 275–276, 277, 278, 279, 280–281, 282–283, 285, 286, 287–288, 291, 292, 294, 295, 296 |
| finishes on demand: the 60-85 tint branch lives in its own lit graph, picked per draw by the geometry's ids | 299–328 | 306, 307, 308, 309, 310, 311, 313–314, 319, 320, 321, 322, 323, 324, 325, 326, 327 |

### tlx-round2.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 346.

Exercised targets: shadowSys caster/releaseGeometry; TLX lruVictim/post recovery/resize/setRange0/createTexMesh/pruneGeoRegistry/decal disposal; lit updateFrame.

Fixtures and meaning: Vendored core classes plus permissive proxy TSL/WebGPU surface; bootShadow (30–40), batchOf (42–48), bootLit (190–200), and decalRunHarness (350–369). Source slices execute timer/retry, resize/rAF, typed-index and cold-registry behavior; 40 decal geometries repeat with warming false/true.

Limits and cleanup: Combines executable ownership/arithmetic scheduling checks with explicit source pins (sun shadow strength, DPR/devtools, closures). Proxy graph cannot establish valid shaders. Asserts buffer/registry release, not measured heap. Several temporary core objects lack explicit disposal; no global browser state is created.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| TLX-06: the instanced caster draws its own shallow geometry, one caster mesh per geometry | 58–71 | 62, 63, 64, 65, 66, 70 |
| TLX-06: a batch that swapped geometry re-mints a caster and disposes the old clone | 73–84 | 81, 82, 83 |
| TLX-07: releaseGeometry parks idle slots at once, but queues the park while a warm is in flight | 86–119 | 98, 102, 103, 105, 108, 109, 118 |
| TLX-08: eviction picks the least recently DRAWN material, never one used this frame | 121–131 | 123, 127, 128, 129, 130 |
| TLX-01: begin() retries a dead post chain on a 2 s timer, 3-strike cap and truthful health kept | 133–159 | 139, 141, 141, 148, 148, 149, 150, 151, 151, 153, 154, 156, 156, 157 |
| TLX-02: a dead sun pass zeroes the lit shadow strength every frame | 161–163 | 162 |
| TLX-03: the DPR cap follows mobileTier, so GRAPHICS: HIGH on a phone gets full DPR | 165–167 | 166 |
| TLX-09: the pack DataArrayTexture drops its CPU copy after the first upload | 169–179 | 171, 176, 177, 178 |
| TLX-10: window.scene/camera/renderer/THREE only behind ?three-devtools=1 | 181–186 | 184, 185 |
| 1b-F3: the TLX mirror pass uploads the lamp shadow OFF; the main pass after it re-arms | 205–214 | 208, 210, 211, 213 |
| 5-F5: while begin() drives the frame, resize() schedules no rAF; with no begin() it still does | 218–250 | 227, 230, 244, 245, 247, 249 |
| TLX-11: present()'s failure-ladder closures are hoisted; update ranges reuse one object per attribute | 252–271 | 256, 257, 259, 267, 268, 269, 270 |
| setRange0 rewrites the same range without length=0 between same-frame calls | 273–290 | 286, 287, 288, 289 |
| createTexMesh uses Uint16 indices at or under 65535 verts and Uint32 above | 292–316 | 294, 312, 313, 314, 315 |
| pruneGeoRegistry's cold walk visits each geometry without requesting an iterator | 318–339 | 320, 337, 338 |
| freed batched decal geometries leave no runs or instance buffers, warming=${warming} | 371–389 | 377, 381, 384, 385, 386, 387, 387, 388 |

### tlx-smith-root.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tsl-lit smithViewRoot/V_SmithGGX and lamp/clearcoat acceptance graph.

Fixtures and meaning: litShader (13–36) builds actual lit graph with 16-lamp bound through GLSL fake rendering or WGSL builder. Scalar f32 emulation (43–52) compares the production visibility function with an independent previous equation over NoV/roughness/129 NoL values; sentinel fixtures cover 0/1/4/16/48 lamps.

Limits and cleanup: Checks exact f32 parity, lazy roots once only after accepted lamps, separate coat admission, and emitted scope nesting. Shader-text and CPU evaluation do not prove real GPU performance. Geometry/material/renderer disposed on normal path, without finally if construction/build throws.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| lamp Smith visibility caches preserve f32 arithmetic and defer roots until accepted | 38–89 | 65, 67, 73, 87 |
| lamp Smith ${language} caches retain actual acceptance and independent coat gates | 91–151 | 95, 97, 112, 115, 116, 118, 120, 121–122, 123–124, 126, 127, 131, 132, 148 |

### tlx-texture-release.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 29, 31.

Exercised targets: TLX texture creation/refill/free/source-release/retired pool; tsl-fx.releaseTexture; CarDraw decal lifetime and LiveryTex atlas.

Fixtures and meaning: liftRelease (35–40), Bitmap (43–46), liftTextures (48–59), poolRig (287–292). Real vendored Texture/dispose events; GPU init is stubbed. Actual atlas painter plus recording crest context tests shared phone scratch; carDrawVm tests player anisotropy and 12 deferred hi-res swaps. Pool loops 50 reuse and 20 live refills, dimensions/kinds, size-less handles, four-entry cap and age expiry.

Limits and cleanup: Tests ownership callbacks, image/version/sampler state and map retirement, not real uploaded pixels or memory. Source pins connect eager upload and retired-decal disposal. Most fixture textures/pools remain local and GC-owned; live handles intentionally survive individual pool checks.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| phone AI atlases snapshot before scratch reuse on STANDARD and HIGH, including pooled textures | 61–96 | 81, 82, 83, 84, 86, 90, 91, 93, 94 |
| player atlas anisotropy is final before eager upload releases its canvas, including pooled reuse | 98–127 | 113, 114, 116, 119, 120, 121, 122 |
| an owned bitmap stays open through upload and closes once when its texture is freed | 129–140 | 132, 134, 135, 137, 138, 139 |
| owned source disposal works before upload and after eager mobile upload | 142–153 | 146, 149, 151 |
| borrowed bitmaps are not closed by texture disposal | 155–160 | 158, 159 |
| a throwing source disposer cannot stop GPU disposal listeners or run twice | 162–171 | 169, 170 |
| CarDraw transfers its hi-res bitmap lifetime through TLX eviction and invalidation | 173–196 | 184, 186, 187, 189, 194, 195 |
| the source is swapped for a 1x1 stand-in without moving the texture version | 198–212 | 206, 207, 208, 209, 210, 211 |
| every released texture shares one stand-in, and a second release is a no-op | 214–221 | 219, 220 |
| ImageBitmap sources are kept (three's flipY uniform tests instanceof ImageBitmap) | 223–233 | 231, 232 |
| no document (worker / harness): the source is kept rather than nulled | 235–241 | 239, 240 |
| createTexture wires the release hook, and uploads at creation on every phone | 243–256 | 245, 246–247, 250, 252–253, 254, 255 |
| freeTexture retires the decal materials bound to the texture when it is disposed | 258–280 | 260, 263, 266, 275, 276, 277, 278, 279 |
| N same-size free/create cycles allocate ONE texture and re-fill it in place | 294–311 | 303, 304, 305, 306, 309, 310 |
| refillTexture re-fills the same texture in place: no create, the source re-uploads, the release hook re-arms | 316–331 | 322, 323, 324, 325, 326, 329, 330 |
| refillTexture refuses a different size, a different source kind, or a freed handle | 333–340 | 335, 336, 337, 339 |
| refillTexture uploads at once on a phone, as createTexture does | 342–348 | 346, 347 |
| a different size or source kind never takes a pooled texture | 350–360 | 355, 356–357, 358, 359 |
| an owned bitmap (car-draw's hi-res swap) closes when its texture is retired, and the texture takes the next one | 362–381 | 369, 370, 372, 373, 374, 376, 378, 379, 380 |
| a source with no size is disposed on free, never parked | 383–389 | 387, 388 |
| the pool is bounded and ages out: the oldest is disposed, with its decal materials | 391–403 | 396, 397, 398, 400, 401, 402 |
| a parked texture drops its CPU source | 405–412 | 409, 410, 411 |

### tlx-viewport.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: TLXShaders.viewport; postChain target reader ownership; TLX/sky viewport plumbing.

Fixtures and meaning: strip/fakeTSL/V2/load (19,86–111) record graph operations; real post factories and Three nodes with intercepted draws check uniforms at submission. postFixture (239–267) records per-chain disposable reader scopes; four rebuilds plus injected graph failure verify unwind.

Limits and cleanup: Source canaries restrict screenUV/raw texture uses and storage preference; executable cases check ratios/half-texel clamps during rebinding, lazy allocation, shedding and resize. No compilation/pixels. finally restores QuadMesh.render and disposes post; shared external reader is intentionally retained.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| canary: screenUV appears only as the import and the identity fallback | 21–33 | 32 |
| canary: every texture node in tsl-post is a VP.tex wrapper or on the explicit list | 35–48 | 44, 46 |
| canary: tlx.js hands every chain the same viewport mapper and the physical size | 50–55 | 52, 53, 54 |
| fixed targets preference is opt-in and stays off when storage is unavailable | 57–83 | 63, 80, 81 |
| disabled: the helper is the identity — the flag-off graph is the shipped one | 113–119 | 116, 117, 118 |
| enabled: wrappers follow the bound texture's logical rect | 121–144 | 130, 131, 133, 134, 136, 138, 139, 140, 143 |
| enabled: uv(view) is bound to the view's size uniform | 146–154 | 150, 152, 153 |
| post lazy targets use their logical rect on first activation and reopening | 156–222 | 188, 189, 190, 191, 212, 213, 214, 216, 219, 220 |
| texture rebind updates ratio and edge clamp immediately, without a global sync | 224–234 | 228, 230, 232, 233 |
| real post readers stay current through cold allocation, toggles, shedding and resize | 269–293 | 275, 278, 279, 287, 287, 291 |
| four real post rebuilds retire only their readers and preserve shared scene/sky readers | 295–312 | 301, 303, 305, 310, 311 |

### tolerance-diff.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tools/check/tolerance-diff check/loosenings/parseDiff/loadExceptions and CLI; ci workflow wiring.

Fixtures and meaning: diff (12–16) constructs synthetic test/production hunks; thresholds, direction changes, unrelated statements, test-only mode, valid/reasonless/stale exceptions exercise classification. CLI case writes one scratch diff, spawns bounded children and removes it in finally.

Limits and cleanup: Fixture production path is a label, not executed game code. Tests approximate recognized syntax; cannot prove every possible assertion style. The CLI case title says excepted but actually tests advisory exit override, not a CLI exceptions-file fixture.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| a widened toBeCloseTo next to a production change fails | 18–23 | 20, 21, 22 |
| tightening, an unrelated edit and a loop bound are not findings | 25–31 | 26, 27, 28, 30 |
| each bound direction: upper raised, lower dropped, a named tolerance grown | 33–43 | 35, 36, 37, 38, 39, 40, 42 |
| a test-only PR passes unless --always; production files are js/ css/ index.html sw.js | 45–50 | 47, 48, 49 |
| an excepted row passes; a stale or reasonless row is reported | 52–64 | 55, 56, 57, 59, 60, 62, 63 |
| parseDiff keeps files and hunks apart; the shipped exceptions file parses | 66–70 | 68, 69 |
| the CLI: --diff-file exits 1 on a finding, 0 once excepted via --advisory, and is wired into ci.yml | 72–86 | 79, 80, 81, 82, 83, 85 |

### tooling-fast-runner.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tools/ci/tooling-fast scheduler/runner/CLI/changed selector/TAP parser/sharding/timing estimates.

Fixtures and meaning: tmp (24) creates OS-temp fixture directories; real runner children model pass/failure/hung handles/test deadlines, empty/skipped/exit-zero files, bail and serial isolated prefix plus two-worker rendezvous. Pure fixtures exercise pin precedence, unknown paths, narrow infra classifiers, timing tables and LPT shard plans.

Limits and cleanup: Every temporary directory has finally removal; console.log restored in quiet case. Hung-file fixture verifies process state gone/zombie. These tests would launch Node children, not browsers; none were executed for this map. Source pins and broad accepted reason sets leave CLI rendering/order or exact real-index selection partly unproven.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| longest recorded duration first; unmeasured files ahead of all, in list order | 26–33 | 29–30, 31, 32 |
| timing estimate reports total and worker critical path | 35–42 | 37, 38, 39, 41 |
| local measurements override the committed table | 44–53 | 50, 51 |
| the committed timing table is well-formed and names real tooling-fast files | 55–63 | 58, 59, 62 |
| a runner schedules by the table it is given, and logs the order it used | 65–80 | 74, 76, 77, 78 |
| a hung FILE fails by name at the file wall, and its process group is killed | 82–110 | 97, 98, 100, 107, 108 |
| a hung TEST fails as \`not ok\` with its name via --test-timeout | 112–134 | 126, 130, 131, 132 |
| a failed child preserves named TAP subtests and assertion diagnostics | 138–158 | 147, 148, 149, 151, 152, 153, 154, 155, 156 |
| tapFailureDetail keeps deepEqual body rows and indexed actual members | 160–184 | 181, 182, 183 |
| deepequal TAP failures keep the actual member list and error body | 186–205 | 199, 201, 202, 203 |
| --quiet keeps START/PASS in the log only; the console still carries FAIL, its detail and the verdict | 207–233 | 220, 222, 223, 224, 226, 227, 228 |
| CLI: default --jobs stays 1 (AGENTS.md rule 4 load limits); --changed is a first-class flag | 235–241 | 236, 238, 239, 240 |
| CLI auto width (B4): --jobs=2 only on a quiet box with no live browser run; an explicit --jobs always wins | 243–254 | 244, 245, 246, 247, 248, 249, 250, 251, 252, 253 |
| --changed selects pinned unit tests for a tool edit, not the full suite | 256–269 | 262, 263, 264, 267, 268 |
| a file pin does not inherit a generic top-level tree pin | 271–284 | 283 |
| --changed fail-safes to the full list on infra paths | 286–292 | 290, 291 |
| --changed selector: one case per branch (empty, docs-only, tracked, unmatched, no-pin-match, matched) | 294–326 | 300, 303, 304, 309, 310, 311, 314, 315, 316, 319, 320, 323, 324, 325 |
| --changed selector with the REAL pin index: a tooling edit selects some pinned unit tests, never an empty set | 328–333 | 330, 331, 332 |
| --bail stops STARTING files after the first failure and says how many it skipped | 335–360 | 347, 348, 349, 350, 352, 353, 356, 357, 358 |
| CLI: --bail is a first-class flag and defaults off | 362–366 | 363, 364, 365 |
| CLI: --help and unknown flags never start the suite | 368–384 | 369, 370, 371, 372, 373, 375, 376, 377, 378, 380, 381, 382, 383 |
| tapSummary / emptyRunReason read the TAP footer | 387–404 | 390, 391, 392, 393, 394, 395, 396, 401, 402, 403 |
| a file that runs zero tests, skips every test, or calls process.exit(0) FAILS the runner; a real pass still passes | 406–427 | 419, 420, 422, 423, 424, 425 |
| isolated performance benchmarks run serially before ordinary files run in parallel with contiguous progress indices | 429–476 | 452, 453, 453, 453, 455–458, 462, 463, 467, 468, 470, 471, 472, 473, 474 |
| isolated scheduling counts unstarted files under bail after ${failIsolated ? "isolated" : "ordinary"} failure | 478–498 | 491, 491, 492, 493, 494, 495–496 |
| --changed: every selector result carries the real diff size; a fallback names the path that forced it | 501–511 | 505, 507, 508, 509, 510 |
| --changed header: reason, real diff size, files, because=<path>; the empty message tells the caller what to do | 513–519 | 514–515, 516, 517, 518 |
| --changed CLI: an empty selection reports reason=empty and the message tells the caller to drop --changed | 521–526 | 523, 524, 525 |
| #2890 classifiers: script-tag index.html, scripts-only package.json, version-only sw.js | 529–545 | 530–531, 532–533, 535–537, 538–540, 541–542, 543–544 |
| #2890 --changed: script-tag-only index.html selects a named set, not the full suite | 547–558 | 554, 555, 556, 557 |
| #2890 --changed: scripts-only package.json does not widen | 560–572 | 569, 570, 571 |
| #2890 --changed: sw.js version-only bump does not widen | 574–583 | 581, 582 |
| #2890 --changed: non-benign index.html still widens and names WIDENED: | 585–596 | 591, 592, 593, 594, 595 |
| #2890 --changed CLI prints WIDENED first and the long-run hint when estimated over ~2 min (source pin) | 598–605 | 600, 601, 602, 603, 604 |
| applyFileShard with timings packs longest first onto the least-loaded shard; unmeasured files cost the median | 607–627 | 611, 612, 616, 621, 622, 625, 626 |
| applyFileShard: equal costs, or no table at all, reproduce the old stride | 629–636 | 631, 632, 633, 634, 635 |
| ciShardFiles: the two CI halves partition the list, balanced by the committed table, slowest files apart | 638–660 | 646, 647, 652, 653, 655, 657, 658, 659 |

### tooling-timings.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tools/ci/tooling-timings parseDurations/median/foldTable/predictShards; tooling-fast shard configuration.

Fixtures and meaning: LOG (13–18) supplies PASS ms/s, FAIL and START lines; numeric arrays cover medians; fold fixture retains old unsampled entries and discards unlisted files; synthetic six-file table compares balanced and blind plans. Final case reads committed table and four-shard partition.

Limits and cleanup: Pure data and committed metadata only; no network, CI fetch, actual worker timing or on-disk table update. No cleanup needed.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| parseDurations reads PASS lines in ms and s, and ignores FAIL and START | 20–25 | 21, 24 |
| median of odd, even and empty samples | 27–31 | 28, 29, 30 |
| foldTable takes the CI median, keeps an unsampled old entry, drops unlisted files | 33–41 | 40 |
| predictShards: a measured table balances what an empty one cannot | 43–50 | 47, 49 |
| the committed table keeps the CI shards a partition of the list | 52–61 | 57, 59, 60 |

### tools-a12-guards.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: duplicate-key scanner; stage/output-path validation; fetchPack; wait-polling lint; generators; Chromium cache and Pages workflows.

Fixtures and meaning: fixture (16–21) creates scratch trees with put/rm. Synthetic files reuse real-looking repo labels, with duplicates, malformed JS and skipped dependencies. Refusal checks protect checkout/foreign files. Generator CLI typo loops compare SHA1 snapshots of nine output targets.

Limits and cleanup: Source checks cover reset-before-delete, image-key order and obsolete Pages plumbing. Scratch fixtures use finally; child help/invalid-flag cases have no timeout in several spawnSync calls. Generator NOT_YET_COVERED list consciously excludes five names; syntax guard is not full output behavior proof.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| DK1 dup-keys scans js/render/three/ (skip by path, not by basename) and reports unparseable files | 24–45 | 37, 38, 39, 40, 44 |
| S1 stageSite refuses the checkout, its parent, a foreign non-empty directory; keeps its files | 48–70 | 58, 60, 61, 62 |
| S1 stage.mjs treats a flag as a missing --out value (usage, exit 2) and creates nothing | 72–77 | 74, 75, 76 |
| S1 assertOutputDir keeps --reset / --out inside artifacts/ or scratch/; garage-angles-fetch refuses before unzipping | 79–96 | 83, 84, 85, 93, 94 |
| S1 garage-angles --reset checks its --out before the recursive rmSync | 98–105 | 101, 103–104 |
| WP1 wait-polling-lint counts a sloppy-mode .cjs and a parse failure is an error, not a zero | 108–119 | 112, 113, 117 |
| G1 every generator refuses an unknown flag with exit 2 and writes nothing | 122–139 | 129, 130, 132, 135, 136, 138 |
| G1 --help prints usage and exits 0 without writing (gen-lib generators) | 141–145 | 143, 144 |
| PA1 the Chromium cache key carries the runner image | 148–154 | 150, 152, 153 |
| PG1 pages.yml passes no fast-tier run and no ship_only/smoke_only plumbing to the gate (2026-10-16) | 156–162 | 158, 159, 161 |
| G1b every tools/gen/gen-*.mjs generator is in the G1 list or named here as not yet covered | 165–176 | 171, 172–173, 174, 175 |

### tools-runnable.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): 72.

Exercised targets: entire tools tree and workflows; MCP/CLI entry points; report server/report serializer; capture/harness conventions; AI wear flags; profile readiness budget.

Fixtures and meaning: toolFiles (31–45) recursively discovers non-scratch files, tool (70–74) resolves unique basenames. Syntax sweeps invoke node --check/bash -n/Python ast and JSON parse. Storage-fault helpers model denial/quota/corruption/closed DB. Curated help/typo/status matrices invoke real CLIs; report server uses localhost port 0, tokenized fetches, temporary roots and quotas. AST inspection evaluates profile WAIT_MS without booting a game.

Limits and cleanup: Parse-only does not validate tool behavior; help deadlines/output are indirect evidence that no browser booted. Regex bans/comment stripping and substring time-budget windows are lexical. Report-server finally closes child/API server and removes roots, but setup preceding try can leak on initialization failure. No tools in this suite were executed for this report.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| storage fault fixtures deterministically model denial, quota, corruption and closed IDB | 48–63 | 50, 52, 54, 56, 58, 61, 62 |
| the sweep sees the whole tools tree (a silent empty list proves nothing) | 76–81 | 77, 79 |
| every JS tool parses (node --check) | 83–91 | 90 |
| no tool derives a path from import.meta.url.pathname (Windows-broken) | 93–113 | 107–112 |
| the comment stripper actually strips (or every ban below is vacuous) | 128–141 | 138–139, 140 |
| no tool decides a verdict by comparing a coerced measurement to zero | 167–182 | 176–181 |
| no workflow decides a gate by comparing a coerced measurement to zero | 184–201 | 190, 191, 198–200 |
| the coerced-verdict ceiling has not been left far above the real count | 203–219 | 213, 218 |
| every shell tool parses (bash -n) | 221–229 | 228 |
| cloud-agent install is offline-tolerant (npm ECONNRESET must not fail a usable snapshot) | 231–246 | 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245 |
| every python tool parses (compile) | 248–257 | 256 |
| every JSON asset in tools/ parses | 259–267 | 266 |
| the MCP-facing entry points answer without touching a browser or a network | 269–317 | 316 |
| CLI clarity (#1702 #1699 #1696 #1694): help paths answer fast without side effects, typos are errors | 319–374 | 339, 340, 343, 348, 364, 365, 369, 370, 371, 373 |
| offline-precache-check --help prints usage and does not launch Chromium | 376–385 | 382, 383, 384 |
| garage-angles / render-car reject an unknown flag (exit 2 + usage) before Chromium; hud-mock -h is help | 387–417 | 400, 401, 402, 405, 407, 408, 409, 413, 416 |
| chrome-devtools-mcp.sh reports its state without launching Chrome | 419–427 | 424, 425, 426 |
| playwright-mcp.sh help and status exit 0 without launching Chromium | 429–442 | 432, 433, 434, 435, 436, 439, 440, 441 |
| chrome-devtools-mcp.sh help exits 0 without requiring Chromium | 444–453 | 450, 451, 452 |
| self-booting capture/physics tools use harness.mjs, not a subprocess server | 455–476 | 475 |
| no tool pins a Linux-only Chromium path as executablePath | 478–490 | 489 |
| a tool waiting on the track build budgets longer than a build takes | 492–519 | 517–518 |
| report-server: collects a POSTed bundle, and a hostile name cannot escape | 521–608 | 560–561, 563, 564, 570, 573, 574, 575–576, 586, 587, 590–591, 595, 596, 605 |
| report-server: rejects malformed bundles without saving or consuming session quota | 610–645 | 623, 625, 629, 631, 634, 634, 636, 639, 641, 641, 642, 643 |
| report-server: unfamiliar metadata is retained without unsafe coercion | 647–662 | 659, 660 |
| apex-report never serializes credentials or URL capabilities | 664–675 | 666–667, 669, 670–671, 672, 673–674 |
| aerial-survey.mjs is folded into survey-track --oblique | 677–695 | 678–679, 681, 682, 683, 686, 687, 688, 689, 691, 693, 694 |
| capture/shot.mjs clips the presented canvas instead of locator.screenshot | 697–710 | 701, 702, 703, 705–706, 707, 708, 709 |
| WGX validator distinguishes frame counts from circuit names before launching | 712–733 | 718, 719, 724, 726, 727, 731 |
| the survey forwarders are gone — layout-audit --survey is the entry point | 740–751 | 745, 747, 749, 750 |
| every AI instrument takes --wear and passes it into the VM's storage seed | 766–776 | 769, 773–774 |
| ai-ratings is data-only (no race, no --wear) and ai-race dispatches it | 778–787 | 780, 781, 782, 784, 785, 786 |
| the AI-only field instruments take the player out of the field (aiOnly) | 792–796 | 794 |
| --wear defaults to off, and a bad level is refused rather than defaulted | 798–816 | 800, 801, 802, 804, 805, 813, 814 |
| the game's shipped tyreWear default is not 'off' (so off must be opt-in, not inherited) | 818–829 | 826, 827–828 |
| occlusion-estimate resolves game-vm and --help exits without booting it | 831–842 | 836, 837, 840, 841 |
| profile-gameloop.mjs: page-ready waits come from APEX_PROFILE_WAIT_MS, never below 20 s | 844–849 | 846, 847, 848 |
| profile.mjs: page-ready waits (spans/hitch/trace/step) honour APEX_PROFILE_WAIT_MS, never below 30 s | 851–877 | 866, 869, 874, 875 |

### tools-w13a-agent-help.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tools/shot/agent help dispatch and generated hook index.

Fixtures and meaning: help (11–15) spawns bounded CLI processes for world/track/physState command-name collisions.

Limits and cleanup: Checks JSON row and unknown-hook exit/diagnostics; absence of wait/timeout text plus deadline is indirect browser-avoidance evidence. No file fixture cleanup.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| help world resolves the agent-index hook without Chromium | 17–25 | 19, 21, 23, 24 |
| help track does not boot Chromium (no index row → exit 1) | 27–33 | 29, 30, 31, 32 |
| help physState still works (non-colliding) | 35–39 | 37, 38 |

### tools-w13a-helmet-sheet.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tools/car/helmet-sheet nested output creation.

Fixtures and meaning: Real CLI writes one helmet sheet for driver 44, cell 80, front view into nested scratch renders.

Limits and cleanup: Checks parent creation, output existence and summary, without validating PNG pixels. Removes only the immediate output directory before/after; final removal is outside finally, so a failed spawn/assertion leaves output and ancestor directories.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| helmet-sheet creates parent dirs for a nested --out under scratch/renders | 12–25 | 16, 21, 22, 23 |

### tools-w13a-probe-page.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tools/shot/probe-page timeout parser/resolver/tileClips/screenshotPresentedCanvas.

Fixtures and meaning: Pure viewport/CLI fixtures plus mocked page/CDP sessions: full frame never resolves, each tile returns a tiny valid PNG, detach is stubbed, 30 ms timeout triggers four tiles.

Limits and cleanup: Checks area-dependent 60/180-second policy, option precedence, area coverage and fallback bytes/call count. Does not validate real CDP, actual output dimensions/stitch pixels or geometric non-overlap beyond summed area.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| shotTimeoutMs scales above 1.5 Mpx (1920×1080) | 9–13 | 10, 11, 12 |
| parseShotTimeout reads --shot-timeout forms and rejects junk | 15–21 | 16, 17, 18, 19, 20 |
| resolveShotTimeoutMs prefers explicit opts then viewport area | 23–28 | 24, 25, 26, 27 |
| tileClips covers the box in a 2×2 grid | 30–37 | 32, 33, 34, 36 |
| CDP full-frame timeout falls back to cdp-tiled when tileFallback is on | 39–70 | 67, 68, 69 |

### tools-w13a-quick-validate.test.mjs

Assertion call spans outside case callbacks (shared extraction/fixture guards): none.

Exercised targets: tools/check/quick-validate parseQuickValidatePort and CLI preflight.

Fixtures and meaning: Pure argument matrix for help/default 3477/valid 4123/invalid tokens; three bounded child help/bad-port invocations.

Limits and cleanup: Checks no server banner or socket error on help/refusal; server non-start is inferred from output/exit/deadline. No valid-port server integration or port-boundary matrix.

| Exact case name / contract | Case lines | Assertion call spans |
|---|---|---|
| parseQuickValidatePort: help, default, valid, reject | 12–22 | 13, 14, 15, 16, 18, 19, 21 |
| quick-validate --help and -h exit 0 with usage (no server) | 24–35 | 29, 30, 32, 33 |
| quick-validate rejects a non-numeric port before startStaticServer | 37–44 | 41, 42, 43 |

## Cleanup and interpretation findings

These are mapping findings, not patches or observed runtime failures.

- The material memo repeated-call case overclaims allocation evidence: JavaScript primitive strings compare by value under Object.is. The mutation/flag/depthBias cases provide the substantive stale-key protection.
- The helmet-sheet case performs final removal after assertions rather than in finally. Its immediate output directory can survive failure, and created ancestors survive the success path.
- Fake Three rig/pipeline and permissive-core fixtures often dispose the renderer while leaving geometry/material objects for local garbage collection. This does not prove a production leak; their ownership assertions concern the selected production path.
- Smith shader construction cleanup runs only after successful compilation; a failed build bypasses its normal disposal sequence.
- Report server tests clean up in finally after successful initialization, but temporary-root/server setup before try can escape teardown if initialization itself rejects.
- Several A12 generator/import CLI calls omit child-process timeout despite exercising expected preflight exits; a regression that enters work can hold the suite.
- Lexical source guards intentionally trade semantic breadth for stable low-cost regressions. Raw-source matches, comment stripping, source anchors and direct shader-text names are maintenance seams, not end-to-end behavior proof.
- The tolerance CLI title mentions an exception but actually exercises advisory override; exception acceptance is covered through the pure check API.
- None of the fake GL/TSL, shader-generation, CPU f32, mocked CDP or source-canary cases establishes handset visuals, GPU driver validity, device loss recovery, memory residency or frame performance.

Synthetic paths in these suites are fixture labels or generated child-file names: production-looking diff paths do not mean the game file was executed; fabricated staging trees include a small stand-in JavaScript child; unknown selection paths model fallback classification. Removed survey forwarders and retired aerial tooling are checked for absence, not treated as source files to navigate. Historical and archived documentary references encountered in comments are recorded only in the separate JSON companion `tests-unit-54-references.json`.
