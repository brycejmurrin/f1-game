# Live debugger — in-race phone perf (A·H10, 2026-10-24)

Lane: in-race CPU, render submission and memory on Bryce's iPhone (TLX WebGPU; iPhone 14 WebGL2). Base
`origin/claude/f1-game-project-26h3ng` @ b3779370. Prior art read first (not re-reported here):
`PERF-KNOWN-WINS-2026-10-23.md`, `PERF-IPHONE-AUDIT-2026-10-21.md`, `PERF-FRESH-HUNT-2026-10-21.md`,
`PERF-CPU-LOAD-2026-10-19.md`, `PERF-ALLOC-HUNT-2026-10-17.md`, `PERF-HUNT-CPU-2026-10-17.md`, `DEFECT-LEDGER.md`.
Out of scope (other lanes): governor, TLX chunk LOD / mirror / road culling (#3667), boot, GPU profiler, WGX, garage.

## Method

- Per-frame allocation census: Node game VM (`tools/lib/game-vm.cjs`), montreal, 22 cars, 300 warm + 600 pumped
  rAF frames, `HeapProfiler.startSampling` (512 B interval, collected objects included); restart growth with
  `--expose-gc` over four `race()` calls. Script: scratchpad `frame-prof.cjs` (reproduces PERF-CPU-LOAD's harness).
- Live TLX census: debug Chromium at 844×390 with `apex26.forceMobileTier=1`; hooks on the WebGL2 and WebGPU
  prototypes (`queue.submit`, `writeBuffer`, `beginRenderPass`, draws, bind groups). This container's TLX binds
  the WebGPU API over SwiftShader (`backendState.api: "webgpu"`, `softBlit`): the scene renders once per completed
  soft readback (~5/s) and the software path skips batches and post, so its pass sequence is NOT the phone's
  (`skipBatches: true`, a single swapchain pass of ~10 draws). Submission counts here are VM-ONLY noise; the
  WebGPU-leg numbers still come from Device Farm / gpu-census (row 14).
- Code hunt: two `code-hunter` passes (CPU loop + HUD; TLX frame path), every row through `finding-verifier`.

## Findings

| id | file:line | severity | verdict | evidence | expected phone gain |
|---|---|---|---|---|---|
| PP-1 | `js/render/three/tlx-post.js` scene target `count: tagOn ? 2 : 1` (~209), `tlx.js` `_wantTag()` → always true (~1346) | med | CODE-TRACED, fixed (PR 1) | The ssrTag attachment is kept on every chain so a wet spell never reallocates the scene target, but its only readers are the composite's SSR `If` (ssrOk && reflect|carReflect > 0.001) and the haze plume `If` (hazeStr > 0.002), `tsl-post.js:593-599, 683-689`. On a dry phone frame at tier ≥ 2: `po.carReflect = 0` (game.js), `opts.reflect = 0` (post-common.js:209), `po.haze = null` on mobileTier. Written and stored every frame, fetched by nothing. | WebGL2 leg only (ANGLE-Metal store action DontCare, same lever as A-P1 depth): one full-res attachment store per frame, 2 B/px (R16F with OES_draw_buffers_indexed) to 8 B/px (RGBA16F) ≈ 1.5–6 MB/frame at 0.74 Mpx; unmeasured on device. WebGPU r186 has no storeOp lever. |
| PP-2 | `js/ui/post-fx-opts.js` applyLookShed (48-55); `tlx-post.js` needsDepth flare branch (~1004) | low-med | CODE-TRACED, fixed (PR 1) | GRAPHICS LOW sheds bloom/SSAO/godray/contact/lampVol but left `flareMul`, so with the sun on screen needsDepth kept the full-res scene depth store for one `depthAt(sunUV)` tap (A-P1 defeated on exactly the frames LOW exists for). | WebGL2 leg: the depth store (4 B/px) on sunlit LOW frames. Look change: LOW loses the lens flare, in line with the other shed look-post. |
| PP-3 | `js/render/three/tlx-shadow.js` makeDepthTarget R8 colour (99-123), `depthMat.colorWrite = !isWebGPU` (244), endPass render (~594) | low | CODE-TRACED, fixed (PR 1) | WebGL cannot render colourless, so every depth pass writes an R8 colour read only by the PCSS blocker off the SUN map on desktop (`colorPcss`). Phones: sun map 1 MB per snap rebuild (~4/s at speed), never read. | WebGL2 leg: ~1 MB store per rebuild. |
| PP-4 | `js/render/three/tlx.js` `_mirTarget` count 2 (~1494), mirrorEnd render (~5389) | low | CODE-TRACED, fixed (PR 1) | Only `mirRT.texture` (attachment 0) is ever sampled (composite fold, glass); the tag attachment exists for program sharing (A·W14) and the depth is a renderbuffer nobody can read. Neither was invalidated. | WebGL2 leg: tag + depth store per mirror render (every frame on the lite rung). Related to known row 11 (RGBA8 + 400 m cull stay open). |
| PP-5 | `js/render/three/tsl-lit.js` setSsrMrt (2831), `tsl-fx.js` (83); called at `tlx.js` 6129/6152 and `_mirMrtArm` | low | CODE-TRACED, no fix | Two full material walks per present (+2 per mirror render) setting `mrtNode`. A latch buys nothing: the calls alternate true/false every frame by design, and a permanently-set `mrtNode` would arm MRT on the env faces (r186 merges material MRT even under `renderer.setMRT(null)`). Cost is a property write per material; measure before touching. | — |
| PP-6 | per-frame allocation census (VM, montreal) | info | VM-ONLY | 266 KB/frame total; `updateCarLateral` 46, `updateCarBrakePlan` 23, `updateCar` 21, `render` 8, `brakeTarget` 8 KB/frame — the known boxed-double picture (PERF-CPU-LOAD #1). New small rows: `Math.max`/`abs`/`hypot` boxing under `tickBody`, `fmtGapSec`, `updateCarBicycle` (5.7/3.7/4.6 KB/f) — HeapNumber returns across non-inlined calls, not fixable bit-identically. HUD writes go through the change caches; the 10 Hz tick holds. | — |
| PP-7 | race-restart memory (VM) | info | VM-ONLY | heapUsed after 4 `race()` restarts: +0.2, +1.2, +1.4, +1.5 MB (plateauing; no CPU-side leak). Renderer-side residency across restarts not traced (needs a hardware browser). | — |
| PP-8 | `js/game.js:4628` `ranked.concat(parked)` per step once a car is parked on road | low | CONFIRMED (verifier), not fixed | One ~22-entry array per physics step after any on-road retirement. Candidate for a claimed game.js pass with the other `for…of` sites; not worth a physics-digest cycle alone. | small |
| PP-9 | `js/ui/hud.js:74` hAttr: `String(value)` + `getAttribute` per call, ~9 per 10 Hz tick | low | CONFIRMED, BY-DESIGN | The comment at 75 says it compares the live DOM on purpose (external edits repaired). Leave. | — |
| PP-10 | `js/race/race-control.js` info() via `G.cautionInfo()` twice per HUD tick | low | PARTLY REFUTED | 11 fields, `sinceT` is a number; both HUD readers need `sector`/`owed`/`lowGrip`, so `cautionLevel()` is not a drop-in. A shared per-tick object would save two allocations per 100 ms: not worth it. | — |
| PP-11 | WebGPU leg: no storeOp lever for unread attachments (scene depth, ssrTag, mirror depth/tag, shadow colour) in vendored three r186 | med | CODE-TRACED, issue | Every discard above is WebGL2-only because `WebGPUBackend` stores every attachment (`discardDepth` is MSAA-only). On Bryce's path (iOS 26 WebGPU) the same bytes are stored every frame. Fix is a vendored-backend patch or a three bump — a design call, not a hunter fix. | WebGPU leg: the sum of PP-1..4, unmeasured. |

## Not run

- No device: every gain above is a bandwidth estimate; pixels are identical by construction (the next pass
  clears what was discarded, every reader is uniform-gated), and `apex26.tlxTagDiscard=0` /
  `apex26.tlxDepthDiscard=0` are the A/B switches for Device Farm (A·D1).
- Browser groups: `gfx` (TLX probe spec) on the pushed branch via `remote-group.mjs` — see the PR.
