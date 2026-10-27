# Unit batch 61 — complete source map

Read-only mapping of all six assigned files (4,660 lines). Every source line was read in individually returned chunks of at most 100 lines and 10,000 characters; an aggregate tool-output truncation was repaired by rereading the affected chunks. No tests, browser, runtime edits or commits were run by this lane. Line spans below are one-based and inclusive. Assertion spans include complete assert calls, with adjacent calls coalesced; helper assertions outside cases are recorded separately. Case titles state the checked semantic outcome; fixture/target/limitations apply to every row in their file.

## Production navigation evidence

Repository code-nav LSP shell used for definitions and usages (not symbol grep): WGX.create defines at js/render/webgpu/wgx.js:342 and is used by Gfx.create at js/render/gfx.js:301,303. WGXChunked.init defines at js/render/webgpu/wgx-chunked.js:10 and is consumed by WGX.create at wgx.js:1196. TyreModel.weatherGrip defines at js/physics/tyre-model.js:599 and feeds gripMult at js/game.js:639. RaceEntryProfile.noteWarm defines at js/perf/race-entry-profile.js:339 and is called by TLX startProgramWarm at tlx.js:3619. PhysicsConsts.WET_GRIP resolves at consts.js:157 via a text fallback because its window export is untyped. TLXShaders.idleYield resolves to its export at tlx-chunked.js:768 via an explicitly ambiguous/dynamic-export text fallback. WGSLChunks references resolve to wgx.js and wgx-shadow.js; duplicate declarations require file/line disambiguation for deeper lookups.

Manifest targets resolve to the current js/render/webgpu/wgx.js, wgx-post.js, wgx-shadow.js, wgx-chunked.js, wgx-roadlut.js, wgsl-chunks.js, wgsl-post.js and shared frustum.js / inst-cells.js paths. Deferred evaluation also loads wgsl-fx.js and wgx-debug-labels.js. VM filenames passed through absSrc label real loaded source; they do not create files. None of these assigned tests invents a nonexistent js target. Historical repro/validation mentions in comments are background claims only, not executed targets or current validation evidence; archive paths are intentionally omitted here.

## tests/unit/webgpu-lifecycle.test.mjs

Source SHA256: `7ded2a7fa37f3eef2187032fce85856dc3a6d0dd664b698e3c082287fc7cf37b`. Fully read: 1–3926. Mode: GPU VM / source.

Fixture: Real manifest-ordered WGX seams, WGSL sources and shared math/packing/light modules execute in isolated VM contexts. makeGpuHarness (165–510) records textures, buffers, queue writes, pipeline descriptors, canvas claims, render passes and error scopes; injectable loss, allocation, compilation, delayed device and submit failures drive recovery. scopedResized (764–783), lampRecs/IDENT16 (1172–1173), isolatedPost (3764–3781) supply shared setups. The isolated capture-submission matrix extracts real capture/shadow handoff bodies and models eleven outcomes for both post branches.

Production targets: WGX.create and returned gfx API; WGXPost.init/buildPost/ensureSpatial; WGXShadow; WGXChunked; WGSLChunks/WGSLPost/WGSLFx; Frustum, InstCells, VertexPack, PostCommon, LightBudget, LightKnobs, CanvasCssSize and M4. Additional references: js/game.js warm biases, GLX shader parity and bootGlx reach comparison.

Limits / cleanup: Mock GPU descriptors and queue effects prove allocation/ownership, packing, state gates and command ordering, not WGSL compilation, rendered pixels, hardware performance, or a browser canvas. Source pins preserve spelling/order/comments and may reject equivalent refactors. Timer warm waits are scheduling-sensitive. The shader derivative walk is lexical, not a WGSL validator. Several parity checks overlap and aggregate many concerns.

| Case name (semantic contract) | Case span | Assertion spans |
|---|---|---|
| WGX black-output probe ignores opaque alpha and resets on RGB light in any copied row | 54–93 | 82–83, 86, 89, 91–92 |
| WGX deferred seams expose WGXShadow / WGXChunked / WGXPost globals | 96–116 | 106–110 |
| WGX constructs SGSR resources only when spatial upscaling is requested | 118–136 | 121–122, 126, 129, 131–135 |
| WebGPU releases textures if decal or material-array view creation fails | 140–153 | 143, 146–147, 151–152 |
| WGX builds SSR only on the full tier and keeps the phone post chain | 512–539 | 526, 528–530, 533, 536–537 |
| WGX post construction omits the unused lite SSR uniform buffer | 541–554 | 549–552 |
| WebGPU caches canvas layout reads until a resize invalidates them | 556–575 | 570, 574 |
| software-present pipelines match the rgba8 attachment format | 577–585 | 578–580, 583–584 |
| post resize keeps old resources valid and cleans partial texture allocation | 587–606 | 592, 599, 601–605 |
| chunked uploads release production source channels and preserve debug sources | 608–629 | 623–624, 628 |
| the chunked road is one vertex buffer of contiguous (first, count) ranges | 631–660 | 648–650, 652–653, 657–659 |
| bloom texture is cleaned when its createView allocation fails | 662–678 | 666, 672, 674–677 |
| post resize destroys replaced bloom buffers and cleans partial buffer allocation | 680–704 | 686, 694–696, 701–703 |
| persistent resize allocation failures do not recreate the scene pair every frame | 706–720 | 710, 715, 718–719 |
| a different target size bypasses the allocation retry cooldown | 722–739 | 726, 731, 737–738 |
| the same target size retries after the allocation cooldown | 741–757 | 745, 750, 755–756 |
| a resize's targets swap in only when both error scopes pop clean | 785–795 | 788–790, 792–794 |
| an out-of-memory verdict keeps the old set, frees the new one and waits out the cooldown | 797–811 | 800–802, 804–807, 809–810 |
| a verdict for a size the canvas already left is discarded and the current size rebuilt | 813–822 | 819–821 |
| SGSR: the gather variant commits only on a clean scope; a failed one falls to the 4-tap | 824–844 | 829–830, 832, 839–840, 842–843 |
| flicker re-uploads the baked track set at most 30 times a second; a new set uploads at once | 851–871 | 856, 863, 867, 870 |
| WebGPU packed uniforms expose tuner defaults, offsets, and extreme uploads | 873–1001 | 874–883, 888, 893, 898–901, 906–909, 912–915, 917–918, 921–926, 932–934, 939, 943–944, 950–953, 966–977, 979–996, 1000 |
| WebGPU SkyU packs GLX-parity sky knobs at the expected lanes | 1003–1043 | 1005–1008, 1014, 1018, 1021–1029, 1035–1042 |
| WGSL sky consumes the GLX-parity knob lanes | 1045–1055 | 1046–1054 |
| WGSL consumes wet darkening, bloom knee, and vignette softness uniforms | 1057–1066 | 1058–1065 |
| WGSL flake basis guards degenerate normals before normalization | 1068–1072 | 1069–1071 |
| composite header describes implemented image effects | 1074–1076 | 1075 |
| WGX publishes the GLX-parity surface instead of undefined stubs | 1078–1104 | 1081–1093, 1095–1097, 1099–1100, 1102–1103 |
| WGX timer ignores late readbacks and waits for a timed pass after enabling | 1106–1150 | 1110, 1119, 1122, 1125–1126, 1131, 1133, 1136, 1140–1143, 1145, 1147–1149 |
| lamp shadow arm does not leak into the next frame | 1152–1169 | 1161, 1163–1164, 1166, 1168 |
| the WGX mirror pass runs with the lamp shadow off; the main pass after it re-arms (1b-F3) | 1177–1199 | 1188, 1190–1191, 1193, 1195–1197 |
| WGX per-chunk lamp masks stay cached across a mirror pass with its own lamp list | 1206–1243 | 1218, 1226, 1229, 1234, 1237, 1242 |
| the WGX shadow-lamp absolute index follows an in-place refill of the baked set (1b-F4) | 1246–1271 | 1254–1256, 1261, 1266, 1270 |
| god-ray uploads nearest lamps and remaps the shadowed index | 1273–1295 | 1284, 1288–1290, 1293–1294 |
| WGX requests timestamp-query when the adapter exposes it | 1297–1301 | 1298–1300 |
| depth-testing pipelines never use compare 'always' (skyLate erased the world) | 1303–1326 | 1317, 1321, 1323–1324 |
| GL depthBias [factor, units] maps to WebGPU slope scale / constant, not swapped | 1328–1386 | 1340, 1357, 1359–1362, 1371–1373, 1377–1379, 1384 |
| the lit-variant warm compiles through createRenderPipelineAsync, and first use still works without it | 1388–1414 | 1397, 1400, 1406–1407, 1412–1413 |
| a race-like frame after the boot warm compiles no pipeline synchronously (mirror + main) | 1421–1454 | 1423, 1443, 1446, 1450, 1453 |
| WGX source keeps the proven parity fixes | 1456–1462 | 1457–1461 |
| WGX R8 correctness gates hold (overflow sentinel, per-chunk hoist, SSR consume, mist) | 1470–1490 | 1474–1475, 1479–1480, 1483–1485, 1489 |
| WGX R8 perf changes hold (SSR depth stride, pooled merge-run, lamp-mask cache) | 1492–1518 | 1497–1501, 1505–1508, 1513, 1516–1517 |
| WGX ground mist matches GLX band/strength | 1520–1531 | 1522–1523, 1526–1527, 1529–1530 |
| WGX full parity batch is wired | 1534–1549 | 1535–1548 |
| WGX LIT keeps high-severity GLX parity sites | 1551–1600 | 1553, 1555, 1557, 1559, 1563–1565, 1567–1568, 1570–1571, 1573–1578, 1580–1581, 1588–1590, 1593–1599 |
| WGX god-ray and env probe match GLX gates | 1602–1615 | 1604–1606, 1608–1614 |
| WGX sky pipelines use less-equal depth (skyLate-safe) | 1617–1633 | 1618–1632 |
| WGSL closes the documented GLX look gaps | 1635–1772 | 1636–1639, 1643–1660, 1667–1673, 1680–1681, 1683–1684, 1692–1702, 1704–1739, 1742–1752, 1756–1771 |
| a device that arrives already lost is refused | 1782–1788 | 1787 |
| a shader that fails to compile is refused | 1790–1797 | 1793–1796 |
| a refusal leaves the canvas free for the WebGL2 fallback | 1799–1811 | 1802, 1807–1810 |
| Safari/compat: depth is textureLoad, adapter retries, lite stack skips timestamp | 1813–1836 | 1816–1820, 1827–1829, 1832–1835 |
| desktop harness still takes the full WGX stack (GLX-parity) | 1838–1845 | 1841–1844 |
| WGX MSAA follows the JSON-encoded gfxPreset: ULTRA 4×, HIGH 1×, unset 1× | 1847–1862 | 1857–1861 |
| software / empty-info adapter boots WGX (soft-present, MSAA 1) | 1864–1870 | 1867–1869 |
| non-enumerable GPUAdapterInfo (Lavapipe Xvfb) still counts as software | 1872–1881 | 1877–1880 |
| soft-present uses ephemeral staging buffers for visible 2D blit | 1883–1931 | 1884–1921, 1927–1930 |
| Safari UA downgrades rgba16float swapchain to bgra8unorm | 1933–1945 | 1940–1944 |
| Safari UA takes the slim WGX stack (msaa 1, no timestamp) | 1947–1956 | 1952–1955 |
| device.lost climbs the ladder: full -> lite (level 1 persisted, reload) | 1958–1968 | 1965–1967 |
| WGX escalation reloads (rung retry, then GLX skip) arm the Graphics reset notice (#3513) | 1970–1981 | 1979 |
| device.lost escalates in SCREENSHOTS capture mode: ${label} | 1994–2011 | 2005–2010 |
| capture mode still mutes the GPU-error flood ladder, and says so ONCE | 2014–2035 | 2029–2034 |
| device.lost on the lite rung climbs to minimal (level 2), not GLX | 2037–2051 | 2048–2050 |
| minimal rung: no post targets, no env probe, and a loss there exits to GLX | 2053–2077 | 2059–2060, 2062, 2067, 2069, 2072–2076 |
| a JS throw in begin() strikes out to GLX only at the cap, not on frame one | 2079–2100 | 2086, 2088–2097, 2099 |
| a minimal loss with blocked sessionStorage re-arms the boot canary instead of freezing | 2102–2117 | 2113–2116 |
| clean sessions heal the ladder: minimal steps back to lite after a streak | 2119–2134 | 2125, 2128–2129, 2132–2133 |
| phone WGX matches GLX: no MSAA even when the memory tier is HIGH | 2136–2147 | 2142–2146 |
| every sampleCount WGX requests is one WebGPU actually allows (1 or 4) | 2149–2173 | 2162, 2164–2165, 2169–2172 |
| rg11b10ufloat is only rendered into when the device grants the feature | 2175–2236 | 2192–2193, 2196, 2199, 2201–2202, 2208–2210, 2214–2215, 2220–2222, 2235 |
| no WGSL derivative sits where control flow can be non-uniform | 2238–2330 | 2267, 2272–2273, 2292–2293, 2301–2302, 2328 |
| MAT array upload is byte-exact like GLX texSubImage3D, not sRGB-converted | 2332–2343 | 2338–2342 |
| MAT/env mip blit UVs cover the full parent mip, not the top-left quadrant | 2345–2356 | 2349–2355 |
| the MAT array sampler asks for anisotropy, like GLX and TLX | 2358–2370 | 2363, 2365, 2367, 2369 |
| setMaterialMaps owns pack textures and destroys them on unload/replace | 2372–2430 | 2381, 2387, 2392–2395, 2401–2402, 2404–2405, 2407, 2410–2412, 2420, 2422–2424, 2426, 2428–2429 |
| WGSL derivative uniform control flow: fw1 is gone for good | 2432–2442 | 2440–2441 |
| derivatives stay OUT of the material helper bodies (the WGSL NaN-white road) | 2444–2463 | 2459–2461 |
| _mkBuffer uses writeBuffer (not mappedAtCreation) | 2465–2473 | 2470–2472 |
| WGX.gpuErrors and WGX.isSupported report clean error diagnostics | 2475–2487 | 2477–2479, 2483, 2486 |
| runtime uncaptured GPU errors escalate to GLX at the log cap | 2489–2517 | 2505–2506, 2508, 2510–2511, 2513–2516 |
| GPU errors spread across a session are not a flood | 2519–2542 | 2534–2536, 2541 |
| pipelines that share a shader module never use layout:'auto' | 2544–2574 | 2567, 2570–2572 |
| bloom pipelines target POST_HDR_FORMAT, the bloom mips' own format | 2576–2586 | 2582–2585 |
| WGX post parity: SSAO normal, haze plume space, bloom order, mirror tone curve | 2590–2659 | 2595–2596, 2598, 2601–2605, 2610, 2612–2620, 2624–2632, 2639, 2641, 2647–2648, 2651–2652, 2654–2658 |
| shadow model UBO flushes once per pass (not per cast) | 2661–2701 | 2666–2676, 2679, 2681, 2688–2689, 2693–2696, 2698–2700 |
| quad FX and decal UBOs flush once per lit pass (not per stamp) | 2703–2733 | 2708–2710, 2714–2719, 2722, 2724, 2727, 2730–2732 |
| blur separable passes use a dynamic-offset UBO ring (not one shared write) | 2735–2744 | 2738–2743 |
| drawParticles never destroys the VBO mid-frame (retire, flush after submit) | 2746–2763 | 2754–2762 |
| every lit-ring flush clamps its slot counter to the ring capacity | 2765–2779 | 2775–2778 |
| freeMesh owns the road-LUT storage buffer and clears the global bind group | 2781–2792 | 2788–2791 |
| freeChunkedMesh clears the road-LUT bind group its own core.freeBuf(m.sbuf) invalidates | 2794–2827 | 2808, 2811–2815, 2823–2826 |
| zero-count meshes never reach the queue as draws | 2829–2849 | 2835–2836, 2842–2845, 2847–2848 |
| per-chunk lamps: buffers, bindings, and the runtime-sized track set | 2851–2868 | 2858–2867 |
| per-chunk lamps: the chunked loop uses absolute shadow indices and zeroed slot lanes | 2870–2887 | 2876–2878, 2880, 2883–2886 |
| per-chunk lamps: a device loss while visible writes the crash latch | 2889–2897 | 2894–2896 |
| WGX cullInstances keys on the surviving cell set, and updateInstances clears both snapshots | 2899–2926 | 2910, 2914–2925 |
| a capture NEVER reconfigures the swapchain inside an encoded frame | 2929–2950 | 2939–2943, 2945–2946, 2949 |
| WGX shadow casts with an unchanged model reuse the bound ring slot | 2952–2978 | 2967, 2969, 2971, 2976 |
| WGX mirror frame records its mip ladder into the mirror's own submit | 2980–2993 | 2988, 2991–2992 |
| WGX mirror-pass cull gets its own pack, buffer and cell-set key: main and mirror no longer evict each other | 2995–3033 | 3010–3014, 3017–3019, 3021, 3025–3027, 3030–3032 |
| WGX post UBOs that depend only on size/knobs are not re-uploaded every frame | 3035–3059 | 3044, 3049, 3052–3054, 3058 |
| WGX shadow cull packs into the batch's OWN buffer and leaves the camera pack alone | 3061–3086 | 3074, 3076–3085 |
| C-P1: the WGX lamp shadow pass drops instanced cells and chunks beyond the lamp reach, exactly as GLX does | 3092–3165 | 3112–3115, 3117–3118, 3122–3123, 3129, 3131–3132, 3141, 3154–3155, 3160–3162, 3164 |
| the lamp bake light map is freed after ~2 s of bake-off frames (GLX _bakeOffN parity) | 3167–3200 | 3180, 3183–3184, 3187–3193, 3195–3197, 3199 |
| createMesh road-piece OOM destroys every piece already uploaded | 3208–3231 | 3212, 3226, 3228, 3230 |
| WGX live mirror glass: pGlass carries _fxMS, the group dies with the target, and every refusal | 3238–3324 | 3242, 3244, 3246–3250, 3252–3256, 3267–3268, 3271–3272, 3275–3276, 3278, 3280, 3282–3286, 3291–3292, 3295, 3297, 3302, 3304–3305, 3307, 3309–3311, 3316–3320, 3322–3323 |
| WGX car decals: premultiplied atlas + blend, and the lit frame group as group 1 (sun shadow, lamp pools) | 3326–3341 | 3330–3336, 3340 |
| WGX PCSS blocker: r32float, the full 16-texel footprint min, read with textureLoad | 3343–3356 | 3348–3352, 3354–3355 |
| WGX per-chunk lamp table: freeing a track's meshes rewinds the allocator instead of leaking it (08-F2) | 3362–3405 | 3393, 3397, 3399, 3401, 3403–3404 |
| P2: the WGX mirror inset is drawn inside the frame's final pass — one render pass fewer, same draw sequence | 3414–3460 | 3420, 3422, 3429, 3431, 3441–3447, 3450–3452, 3455–3459 |
| P6: WGX marks the MSAA colour, mirror depth and env depth TRANSIENT_ATTACHMENT when the browser has the flag | 3467–3519 | 3473, 3477–3479, 3485–3487, 3493, 3495–3497, 3505–3509, 3512–3514, 3516–3518 |
| P4: WGX fills the material array as the async readback lands, and never binds a half-filled array | 3527–3693 | 3566–3570, 3574–3575, 3577, 3580–3582, 3584–3586, 3606–3608, 3610–3615, 3626–3629, 3640–3642, 3652, 3654–3656, 3672, 3674–3676, 3686–3688, 3690, 3692 |
| drawParticles(…, dirty=false) skips the VBO upload when its slot holds the same batch (#2154) | 3697–3718 | 3703, 3711–3717 |
| freeTexture destroys at once outside a frame, after the submit inside one; a present that bails flushes (#2156) | 3722–3744 | 3728, 3731, 3733, 3735, 3738, 3743 |
| queued capture settles on device loss ${info.reason} | 3747–3753 | 3750, 3752 |
| queued capture settles at the JS-error strike cap | 3756–3762 | 3758 |
| optional post rolls back allocation ${throwAt} | 3783–3789 | 3785–3788 |
| optional post publishes the complete successful buffer set | 3791–3795 | 3793–3794 |
| exhausted spatial variants retire the UBO (scoped=${scoped}) | 3797–3804 | 3802–3803 |
| spatial variant fallback retains its successful UBO | 3806–3811 | 3810 |
| queued capture settles on ${hidden ? "hidden" : "recent-visible"} loss | 3813–3821 | 3818, 3820 |
| spatial async completion cannot publish onto a replaced device | 3823–3829 | 3828 |
| cancelled WGX init destroys a late device and never claims the canvas | 3832–3840 | 3837–3839 |
| revoked WGX late successful self-test preserves successor failure and bound markers | 3843–3855 | 3852–3854 |
| capture submission releases readbacks (full post=${fullPost}) | 3859–3926 | 3862, 3909–3914, 3916–3918, 3923–3924 |

Assertions outside case bodies: 770–771, 773, 777, 779–781.

## tests/unit/webgpu-menu-warm.test.mjs

Source SHA256: `4f4555f03baa5d8a0eee29daeb2586aba4e6c51dc1175d88f591241e0352cb55`. Fully read: 1–145. Mode: Mixed TLX source / VM / copied model.

Fixture: loadProfile (22–28) executes real RaceEntryProfile with deterministic performance.now; loadIdleYield (30–40) extracts the real helper with requestIdleCallback absent. TLX/CHUNKED source slices check scheduling and history wiring. The last two tests implement local copies of warmPlusOn and resolve logic.

Production targets: js/render/three/tlx.js, js/render/three/tlx-chunked.js and js/perf/race-entry-profile.js. Despite the filename, this concerns Three/TLX WebGPU warming, not the standalone WGX backend.

Limits / cleanup: No renderer boot or real idle callback. Copied gate/resolver behavior can remain green when production logic changes; source inclusion checks only partly connect those copies. The 500ms elapsed bound can fail under host contention.

| Case name (semantic contract) | Case span | Assertion spans |
|---|---|---|
| TLXShaders.idleYield resolves (setTimeout fallback when rIC missing) | 42–49 | 44–45, 48 |
| RaceEntryProfile.noteWarm records where; requestWarm still calls bare gfx.warm() | 51–70 | 55–58, 63, 65–66, 69 |
| warmPlusOn is on for WebGPU only when where===menu (source behaviour) | 72–101 | 76, 79–81, 84–86, 89, 91–92, 95, 98, 100 |
| warmPlusOn evaluates: WebGL always; WebGPU menu yes / race no | 103–123 | 116–122 |
| _resolveWarmWhere: explicit opts, RaceEntryProfile armed, else menu | 125–145 | 138–139, 141, 144 |

Assertions outside case bodies: 34.

## tests/unit/webgpu-uint16-index.test.mjs

Source SHA256: `303838ddfd8cd78a739ba08f017983a1b1ccdab8e4edc95424f7fb28023bd276`. Fully read: 1–154. Mode: Actual vendor class / byte queue VM.

Fixture: Acorn locates the real minified WebGPUAttributeUtils class by public method shape; real THREE.BufferAttribute and imported vendor constants seed the VM. fixture (29–59) records byte-backed buffers and validates aligned/in-bounds queue writes, updates and destruction. The primitive-state test extracts the real vendor method.

Production targets: vendor/three-0.186.1/three.webgpu.min.js: createAttribute/updateAttribute/destroyAttribute and _getPrimitiveState; __apexUint16Index opt-in contract.

Limits / cleanup: Tests actual vendor utility bytes, not a real GPU. Extraction depends on generated AST shape and mapped descriptor spelling. Partial-range semantics intentionally preserve GPU neighbors rather than unrelated newer CPU values; controls check upstream wide/restart behavior.

| Case name (semantic contract) | Case span | Assertion spans |
|---|---|---|
| opted-in odd Uint16 indices preserve mapped values and halve allocation with padding | 61–70 | 63–66, 68–69 |
| partial odd offsets and odd tails preserve unrequested neighboring GPU values | 72–81 | 76–78, 80 |
| same-sized subarray replacement respects source byteOffset | 83–87 | 86 |
| unsupported changes fail visibly before writes and preserve buffer lifecycle | 89–101 | 92–94, 96, 99 |
| invalid ranges are atomic and zero-count ranges perform no GPU write | 103–109 | 106, 108 |
| unmarked, dynamic, stream, vertex, storage, wide and restart controls retain upstream behavior | 111–127 | 119–120, 123–124, 126 |
| actual primitive state keeps narrow strip format and wide restart format consistent | 129–143 | 140–141 |
| shared marked attribute creates one buffer and release/recreation uses new source bytes | 145–154 | 148, 152–153 |

Assertions outside case bodies: 15, 25, 42–45.

## tests/unit/wet-grip-ladder.test.mjs

Source SHA256: `a0f8817c2da9836062fdb9a18d8100e553e4cc5843af5637722dad660ab20355`. Fully read: 1–102. Mode: Real physics VM / extracted expression.

Fixture: One VM loads mat4, PhysicsConsts, teams, Parts and TyreModel (29–38). grip/eff use real weatherGrip and catalog cornering costs (40–43); crossover (46–54) scans wetness in 0.001 increments. game-source symbolSource extracts the real gripMult expression for no-set behavior.

Production targets: js/physics/consts.js WET_GRIP; js/physics/tyre-model.js weatherGrip/treadFor; js/car/parts.js catalog cornering; js/game.js gripMult.

Limits / cleanup: Deterministic grip-table/ranking checks; no driving dynamics, aquaplaning, AI tyre changes, localized showers, or lap-time evidence. Switch intervals are deliberately broad; winners are sampled away from crossovers. gripMult extraction assumes a one-line expression.

| Case name (semantic contract) | Case span | Assertion spans |
|---|---|---|
| the slick column and the dry knot are untouched (dry physics cannot move) | 56–60 | 57–59 |
| the inter out-grips the full wet on a drizzly road, the full wet wins in rain | 62–67 | 63–66 |
| the inter→full crossover brackets treadFor's 0.72 switch | 69–74 | 72–73 |
| slicks win when dry and lose to inters near treadFor's 0.25 switch | 76–80 | 77, 79 |
| away from the crossovers, treadFor's tread is the effective-grip winner | 82–87 | 85 |
| a car with no fitted set (wear off) grips on the tread the conditions call for, not a hard-coded full wet | 89–102 | 93, 99, 101 |

Assertions outside case bodies: none.

## tests/unit/wgsl-bindings.test.mjs

Source SHA256: `8860685cc42a3cee66bec9fe573173d56c9c0aea4cdac6f99d9fa8706a4e6741`. Fully read: 1–140. Mode: Composed WGSL lexical guard.

Fixture: loadChunks (67–71) evaluates real WGSLChunks. stripComments (44–60) preserves newlines; declsOf (64–65) and crossProgramRefs (77–93) compare declared identifiers across SKY/LIT/BLIT/BLOCKER/SHADOW/DEPTH_RESOLVE. Mutation reproduces a wrong-program binding and comment injection verifies filtering.

Production targets: js/render/webgpu/wgsl-chunks.js composed program exports and resource names; LIT FrameU F versus SKY SkyU U.

Limits / cleanup: No WGSL compiler or identifier scope parser. Scans member access only; declsOf accepts var declarations beyond annotated resources. Can miss undefined names absent from every other program and can confuse local shadowing of another program binding. Mutation/anti-vacuity checks narrow that risk.

| Case name (semantic contract) | Case span | Assertion spans |
|---|---|---|
| every WGSL program only names bindings it declares | 95–105 | 99, 103–104 |
| the programs really do declare bindings, so the check is not vacuous | 107–117 | 113–116 |
| the guard fires on the real defect, rather than being asserted to | 119–132 | 127, 129–131 |
| a cross-program name inside a COMMENT is not a defect | 134–140 | 139 |

Assertions outside case bodies: none.

## tests/unit/wgx-chunked-fallback.test.mjs

Source SHA256: `5fe23694383d97e40f6f76addb8666e78a200617b025066430764f1777ea7635`. Fully read: 1–193. Mode: Real WGXChunked VM / fake core.

Fixture: fatGeo (22–47) makes a 50×50 grid (5000 triangles), exceeding the chunk threshold. loadApi (49–62) evaluates production WGXChunked. makeCore (64–133) provides configurable mkBuffer/attribute/device/fallback allocation failures and records fallback calls; road case supplies pull/LUT stubs.

Production targets: js/render/webgpu/wgx-chunked.js WGXChunked.init(core).createChunkedMesh; core.createMesh is a local stand-in rather than the real WGX upload.

Limits / cleanup: Proves fallback routing, intact geometry and live plain-mesh versus inert chunks shape. Does not prove real fallback allocation success or GPU cleanup: mock destroy methods do not count destruction; index/attr named case injects only attr failure.

| Case name (semantic contract) | Case span | Assertion spans |
|---|---|---|
| WGX chunked props: vertex-buffer alloc failure falls back to createMesh (chunks:null) | 135–149 | 139, 141–148 |
| WGX chunked props: index/attr alloc failure falls back to createMesh | 151–160 | 156–159 |
| WGX chunked props: if createMesh also fails, return empty chunks:[] (no throw) | 162–169 | 166–168 |
| WGX chunked road (trk) path: createBuffer failure falls back to createMesh | 171–193 | 190–192 |

Assertions outside case bodies: none.

## Parameter expansion and cleanup findings

Lifecycle template cases expand capture-mode label into NATIVE (local 0), saved 2D BLIT on hardware (local 1), and 2D BLIT this tab (session 1); device-loss capture into unknown/out-of-memory; rollback allocation into 1–6; exhausted spatial into scoped=false/true; visibility loss into hidden/recent-visible; capture submission into full post=false/true, each with success/main/shadow/submit/submit-destroy/copy/map/work-reject/work-throw/no-request/deferred and a following successful request. Internal matrices additionally cover SSR tiers, presets, biased draws, reach volumes, transient flags/knobs, and async material token replacement same/partial/different/unload. These are loop-generated cases or subcases, not omitted anonymous tests.

Resource evidence is strongest in lifecycle: failed views and partial allocation rollback, transactional resize, delayed error-scope verdicts, material supersession/free/unload, shadow/mirror/main buffer separation, retirement after submit, idle frees, LUT bind-group invalidation before free, lamp-table allocator rewind, bake-off retirement, cancelled device init and capture failure cleanup all assert ownership effects. The capture matrix requires exactly-once readback destruction and original rejection preservation. Successful harness backends are usually left to VM isolation; tests do not uniformly dispose all successful GPU-like resources, remove CSS listeners, or track every timer. Unref boot watchdogs cannot hold the runner open. Fallback fixture destroy no-ops leave leak behavior unmeasured.

Cleanup candidates (documentation findings only): split the very large lifecycle file by post/loss/culling/capture ownership while retaining shared harness contracts; replace duplicated menu gate/resolver models with extracted real helpers; extend fallback failure tests to count destroyed partial buffers and independently inject index-buffer failure; keep structural shader pins paired with compiler/real-device evidence outside this mapping. The unused bloomPipeWrong and insetLast locals do not establish assertions. No source cleanup was performed.
