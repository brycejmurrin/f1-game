# Rendering and world audit — 2026-11-11

This is a bounded audit and focused correction, **not a clean bill of health for
all rendering/world systems**. Source, mock execution, software presentation,
and physical-device evidence are separate below.

## Source and coordination

Initial checkout: clean branch `work`, HEAD
`ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb`, one worktree at
`/workspace/f1-game`. Work branch: `cursor/render-world-audit-ae73`.
Fetched deploy tip at establishment: `d6986f112`; its merge base with this
checkout is `ae73c6766`. Tests here use that checkout plus this patch, not the
newer deploy tip. No unrelated dirty files were present. The final gate-component fetch observed
deploy tip `cfb6632bf72457a421fe53ebd974d0e7510786ad`; the tested checkout
was not silently merged with that newer tip.

Open PR diffs were enumerated before edits. PR
[#5341](https://github.com/brycejmurrin/f1-game/pull/5341) was OPEN, draft,
BLOCKED, head `b67dc07133f1e739456c3e9b497dc5f79663ce98`, with no merge commit.
Its actual diff fixes mirror UV scale in `glx/post.js` and lamp-bake partial
allocation/retirement in `webgpu/wgx.js`; neither is included in this patch.
Green checks do not establish that it merged. A later status refresh at
04:38 UTC found the same head OPEN and BLOCKED, now **ready rather than draft**,
still with no merge timestamp; checks included running/pending entries.
A handoff refresh found the same OPEN/ready/BLOCKED head, still unmerged.
Other overlaps: #5397 TLX pool,
#5398 track workers, #5303 scenery engine, #5287 circuit data, #5263/#5351 XR,
#5276 post shaders, #5388 lighting panel, #5418 Kyalami scenery. Those edit
runtime paths were avoided. `docs/DEBUG-HOOKS.md` also appears in #5339 and
#5296; their inspected hunks do not touch the assets/texture-census sections
corrected here (917–953 in this base). The regenerated impact map is a shared
output across many PRs and must be regenerated if a merge conflicts. Saved
status, full diffs and path lists are under
`artifacts/render-audit/` (local, ignored evidence).

## Prioritized findings

1. **P2, fixed — GLX deletes retained material textures.**
   `js/render/glx/glx.js`, `setMaterialMaps`: rebinding the same texture objects
   for a scale change deleted them before publishing them again. Aliasing the
   two slots also deleted/forgot one object twice on clear. WGX already retains
   incoming texture identities. GLX now releases only outgoing identities once,
   through its context-loss-aware `freeTexture`. A test executes both shipping
   function bodies with a deletion-checking GL double over three lifecycle
   cycles. It fails on original source and passes on the patch. This proves
   ownership decisions, not driver residency or native rendered pixels.
2. **P2, fixed — implicit GLB normals were smoothed.**
   `js/render/shared/gltf.js`, `toMesh`: an indexed primitive without NORMAL
   accumulated normals at shared vertices, rounding authored hard edges.
   glTF 2.0 requires implicit flat normals. Such primitives now emit separate
   triangle corners, preserve their source colours, then derive face normals
   after mirrored-winding correction. Authored normals retain their indexed
   path. Two perpendicular triangles, reflected/nonuniform transforms and
   distinct colours fail on original source and pass after correction. A second
   primitive with authored normals checks the post-expansion vertex base;
   reverting only `vertBase += emitted` makes that assertion fail.
   Increased vertex storage for missing-normal indexed meshes is an intentional
   correctness cost; this is not a performance optimization.
3. **P2, fixed — instance bounds underbound sheared transforms.**
   `js/render/shared/frustum.js`, `bucketInstances`: largest-column length is
   not a conservative radius multiplier for a nonorthogonal basis. For
   `x'=x+y+z`, a unit-sphere corner reaches sqrt(3), beyond the old sqrt(2)
   bound. World-axis row lengths now give conservative transformed-sphere
   extents. Test checks vertex containment, a formerly rejected visible corner,
   a wholly outside negative control, and explicit versus derived radius.
   GLX, TLX and WGX consume this helper. No claim that a particular shipped
   circuit currently emits this shear, or that tighter bounds improve FPS.
4. **P2, fixed — batch asset importer bakes incorrect normals and winding.**
   `tools/gen/import-models.mjs`, `importFile` / `normalTransform`: this separate
   importer previously substituted world-up for absent normals, transformed
   supplied normals with the position matrix, and kept winding on reflected
   nodes. It now splits absent-normal corners, derives geometric face normals,
   uses inverse-transpose directions and restores reflected front faces.
   At zero determinant, cofactor-transformed surface normals preserve surviving
   flattened planes instead of rejecting valid zero-scale glTF nodes. A CLI fixture checks mixed missing/authored
   normals under a rotated child and reflected nonuniform parent through the actual AX26 writer and
   reader, within its snorm16 quantization bound. Original source fails corner
   count; an isolated old-normal-transform mutation fails the geometric-normal
   assertion. All five importer tests pass, including a zero-scale flattened-plane case.
   The manifest's Kenney source archive returned HTTP 403, so the 41 committed
   baked models were **not regenerated or certified unaffected**. This fixes
   subsequent imports; historical baked-normal correctness remains unverified.
   Corner expansion can also reach the existing `--max-verts` admission limit;
   that threshold was not raised or independently justified by this audit.
5. **P2, unresolved — GLX cover coordinates need a dedicated pixel probe.**
   `glx/post.js` `setCoverScale` and `glx/shaders/glsl-post.js` `POST_VS`,
   `SSAO_FS.viewPosD`: on a non-square mobile square allocation, `vUV` is
   physical texture UV, but reconstruction uses `uv*2-1` as logical clip XY.
   At the logical centre of an 844x390 image in an 844-square target this
   produces NDC y about -0.538 instead of 0. PR #5341's exact-size mirror
   change does not correct this path. Source arithmetic is established;
   visual severity and the complete post-chain remedy remain unverified.
   Coordinate work overlaps open post-chain PRs and is not partially rewritten
   here. Probe: corner-labelled non-square colour/depth textures, known planar
   depth, SSAO/contact and SSR separately, both orientations, exact-size versus
   cover targets, checking full coverage and reconstructed view coordinates.

Specification consulted directly:
https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc
(geometry section: absent normals have implicit flat normals). A fetched copy
is saved as `artifacts/render-audit/gltf-spec.adoc`.

## Coverage map and omissions

Inventory (`rg --files`, not a claim of inspection): render 47 files, track
engine 29, circuits 105, lighting 9, workers 2, XR 8, vendored three directory
28. Complete paths: `artifacts/render-audit/inventory.json`.

| Area | Examined evidence | Explicit limit |
|---|---|---|
| Selection/facade | `gfx.js` contract, stable `glx-facade.js`, game boot and Assets binding | No forced backend-failure boot matrix |
| GLX | Material creation/publication/free, texture ledger, post cover and SSAO reconstruction | Whole shader/post chain, shadows, decals and particles not fully reviewed |
| TLX WebGL2/WebGPU | Material-array creation, pending tokens, lazy upload, publication; viewport helper; vendor manifest/runtime | No complete pipeline, environment, shadow or instancing-cache audit |
| WGX | Material ownership, readiness, lamp-bake #5341 diff, chunk allocation rollback and source retention | No complete allocation-failure matrix or device-loss run |
| Shared geometry | GLB parser/transform/index/colour/normal path, vertex packing, frustum/instance cells, chunk bins; GLX/TLX chunk preparation source-release sites | No all-shape topology/winding sweep |
| Track/circuits | Local rules, worker/client ownership and permit checks, mesh/terrain/pit entrypoints, open scenery/circuit diffs | No circuit-by-circuit geometry/landmark visibility survey; no circuit edits |
| Lighting/assets | Assets request generations, decode/release/upload, lamp bake cache/job/reset, mirror lamp ranking | Mutable-light cache and weather appearance not visually settled; atlases/licences not independently re-audited; historical Kenney rebake blocked by source HTTP 403 |
| Workers | Bitmap client cancellation/timeout/stale-worker handling, strip decoder, track-worker readiness/permits | No browser transfer/cancellation stress matrix |
| XR | Session generation/clock callback, borrowed frame lifetime, rig projection/union/recenter and open XR diffs | No headset, stereo raster, XRGPUBinding, foveation or native session restoration |
| Tests/docs/vendor | New behavioral negative controls, batch asset import CLI and AX26 round trip, related existing tests, stale diagnostics prose, vendor patch catalogue | Passing mocks/source guards do not validate GPU execution |

## Ownership and representation notes

- GLB output is newly owned CPU mesh data. The loader borrows its input buffer;
  colours and positions are copied by source index, output indices address the
  emitted mesh. It does not release collision/replay arrays. Car loading and
  authoring tooling consume it; LSP found car build/load consumers.
- Instance cell bounds are CPU data created at batch construction from local
  positions/radius and world matrices. Backends own the batch/GPU pack. This
  patch changes bounds only, not pass packing or source-buffer retention.
- Material array creation returns caller-held tokens; `setMaterialMaps`
  transfers ownership to the backend. GLX's published slots and texture ledger
  must agree by object identity. WebGPU retirement has encoder/submission
  constraints that GLX deletion tests do not model. WGX publication failure
  still needs injected bind-group failures; this audit does not call it atomic.
- Assets uses generation checks across awaited download/decode/fill work;
  `unload` invalidates pending work. `uploaded` is an application publication
  flag. It is not shader compilation, GPU completion, sampled output or present.
- GLX chunk construction can clear caller source fields before allocating its
  VAO/VBO/IBO (`glx/chunked.js`, `createChunkedMesh`); its catch releases GPU
  objects but does not reconstruct those CPU fields. TLX synchronous chunk
  preparation also has early source release; cooperative/worker preparation
  preserves raw inputs. Road/terrain replay stamps `_keepPositions`. This is
  an ownership distinction, not proof that retry/recovery is correct: inject
  second-buffer failure and a GL error without a JS throw, then exercise
  replay/fallback and grounding. No retention policy was changed here.
- Main/mirror use different camera state and instance packs. `MirrorPass`
  saves/restores frame state around drawing; preparation before that try/finally
  deserves a throwing-dependency probe. Do not infer main-pass correctness
  from a mirror draw call.
- XR eye matrices are per-frame borrowed bags. `_xrFrame` is cleared after the
  callback and session/generation checks reject stale callbacks. These source
  guards do not establish native frame cadence or a correctly attached layer.
- Track source index, spline fraction, arc metres and racing-line position
  remain distinct; `_sceneryShift` is not a universal conversion. No fraction
  mapping or CPU-retention policy was changed by this patch.

## Historical claims and documentation corrections

Vendored manifest identifies three **0.186.1**; importing the actual core bundle
reports `REVISION=186`. The manifest lists local patches; upstream issue status
in `PATCHES.md` is historical, not proof about today's upstream or this runtime.
No vendor patch was removed based on a comment. The vendor hash check passed for all 26 manifest-listed files. This verifies
artifact identity, not the necessity of every patch.

Corrected `DEBUG-HOOKS.md`: WGX implements material arrays; `pack` reflects a
cached manifest; `uploaded` is not completed GPU/presentation evidence;
`texCensus` tracks calculated allocation bytes, not driver residency.
Corrected Assets' lazy-upload comments and the frustum's orthogonal-basis /
byte-identical-bounds claim. Removed the batch importer's “good enough” normal
transform comment and corrected its stale one-level-transform description.
Added a changelog fragment via its source path.

## Verification and remaining probes

Initial hosted status/LSP calls failed HTTP 429. Local doctor showed every npm
dependency missing. `npm ci` succeeded; existing `f1-env doctor`/`resume`
then passed (one tunnel, readyz 200, control-plane polling and local MCP status).
Hosted status, LSP callers/references/diagnostics and diagnostic capabilities
subsequently succeeded. Later hosted status reported server 1.19.0 / PID 4883,
absent from this executor; the local route reported 1.17.0. Hosted execution
therefore does not establish checkout identity. Patch diagnostics were repeated
with local `tools/mcp/lsp-mcp.sh`; browser probes use the local checkout harness.
No credential/profile or trust settings were changed.

Workflow deviation: the already-failing first full local gate was interrupted
by direct PID signals, instead of the repository's prescribed
`tooling-fast.mjs --stop` route. Its interrupted log is retained; no Actions
run was cancelled. The replacement run is judged independently.

| Check | Outcome | Evidence / limit |
|---|---|---|
| Three new regression cases on original source | FAIL as intended | `baseline-negative.log`, `glx-baseline-negative.log` |
| Assets + frustum unit suites on patch | PASS, 91 tests | `regressions.log`; CPU/VM and backend doubles |
| Mixed-primitive offset mutation | FAIL as intended; unmutated PASS | `multi-primitive-negative.log`, `multi-primitive.log`; wrong following-primitive indices rejected |
| Corrected assets + frustum + ratchet suites | PASS, 110 tests | `corrected-regressions.log`; VM source filenames supplied, no threshold increases |
| Batch importer CLI suite | PASS, 5 tests | `import-normals.log`; actual writer/reader, reflected nonuniform normals and valid flattened planes |
| Batch importer negative controls | FAIL as intended | `import-normals-negative.log`, `import-direction-final-negative.log`, `import-transpose-final-negative.log`; final mutant sources preserved separately |
| Historical Kenney catalogue rebake | SKIP | Recorded source archive returned HTTP 403 (`kenney-download.log`); existing binaries unchanged |
| LSP diagnostics for three runtime fixes | PASS, zero high-signal diagnostics | HEAD subtraction explicitly unavailable due changed dependencies |
| Initial changed structural slice | FAIL | 136 passed, 2 generated-index suites failed (`tooling-changed.log`) |
| Regenerate via `npm run gen`; both failed index suites | PASS, 24 tests | `generated-guards.log`; generated impact map retained |
| Vendored three hashes | PASS | `vendor-three.mjs --check`, 26 manifest-listed files |
| GLX live material ownership | PASS | `glx-live.json`, three cycles, all retained/moved/released true, GL error 0 |
| WGX software boot/display | PASS | `wgx/state.json`, observed WebGPU, zero GPU errors, display completion, scene generation 3 shown |
| TLX WebGL2 software boot/display | PASS | `tlx-gl/state.json`, forceWebGL true, GPU errors 0, presents 18 |
| TLX WebGPU requested with Lavapipe flags | FAIL, screenshot deadline | `tlx-gpu/state.json`: API WebGPU observed, software adapter, gpuErrors 0; full probe failed during screenshot-page. Missing configured Lavapipe ICD means flags do not establish Lavapipe execution. |
| Batch-import LSP diagnostic preprocessing | FAIL (tool defect) | `import-lsp.log`: three shebang errors. `lsp-mcp.mjs` prepends @ts-check before the shebang; Node syntax check and actual CLI pass. No LSP-clean claim for this tool file. |
| WGX static validation | PASS | `wgx-static.log`; source validation only, not 60 rendered frames despite the output field |
| First full pre-push attempt | FAIL then interrupted | Ratchet rejected +3 GLX lines and two VM loads missing filenames; corrected without raising limits. Remaining files were not completed (`prepush-interrupted.log`). |
| Full structural suite in replacement gate | PASS, 702 files | `prepush-wrapper-incomplete.log`; before final importer edge-case correction. Outer wrapper disappeared before later phases or a terminal deploy verdict, so the complete gate is INCOMPLETE |
| Final-source full structural suite | PASS, 702 files | `prepush-final.log`, terminal tooling-fast verdict |
| Both outer deployment wrappers | FAIL / incomplete orchestration | `/proc` exit_code 9 (SIGKILL), zero cgroup OOM events; cause unproven (`wrapper-failure.json`). Status markers remained misleadingly running. No complete `deploy.mjs` pass claimed. |
| Remaining canonical gate phases, run separately | PASS | All 16 node groups, parts census and targeted build-worker suite; `remaining-gate-result.json`, `remaining-gate-phases.log`. Shipped selectors/run helper/limits used; no thresholds changed. |
| Full fleet sweeps | SKIP | Not selected by the shipped path predicate; this is not proof that every geometry path is unaffected. |
| Selected complete browser groups `gfx`, `hooks`, `tiny`, `audit` | SKIP | Final verify-change plan selects these; targeted backend probes were run, not these complete groups |
| Native Metal/iPhone/Quest, driver residency | SKIP | Hardware probe refused `google / swiftshader`; no physical device evidence |
| Comparable performance baseline/candidate | SKIP | No measured bottleneck experiment; no performance gain claimed |

Read-only review found no further supported runtime defect in the three runtime
changes and identified the mixed-primitive test gap, now covered. It supplied
source reasoning, not another test or GPU run. Follow-up review of the batch
import correction caught an over-broad singular-transform rejection before
commit; that rejection was removed and flattened-plane acceptance tested. Follow-up
source review accepted the cofactor treatment of surviving flattened faces.

Additional unresolved probes: TLX fixed-target origin against both actual
backends with corner marks; nonuniform/sheared shader normals versus geometric
normals (GLX/WGX still multiply the model 3x3); the runtime GLB supplied-normal
`abs(det)<1e-12` fallback versus the corrected batch cofactor path (probe a
flattened YZ plane and small nonzero determinants; existing frozen-arithmetic
tests are not a geometric oracle for that fallback); WGX second/later bind-group and
view failures with encoder-held resources; mirror preparation failure and
pass-specific pack contents; late worker completion after track/backend
replacement; native XR enter/end/reenter with distinct eye projections and
single-clock presented-frame traces. These are hypotheses/test gaps, not passes.

Diagnostic-tool follow-up: `tools/mcp/lsp-mcp.mjs` `diagnose` prepends a
comment before the input shebang, producing TS1005/2304/2552 on a valid
Node CLI. Preserve the shebang at the first line and verify line mapping with
a shebang fixture; this focused graphics patch does not alter the MCP server.


Runtime provenance: Debian container, local dirty patch on `ae73c6766`, fresh
harness browser contexts. Browser probes preceded comment/brace-only GLX
cleanup and later test/tool-importer refinements; the tested renderer behavior
was not changed afterward. GLX: ANGLE Vulkan SwiftShader, 844x390 DPR1, Montreal,
observed API WebGL2, tier0/scale1, reduced-motion false, visible complete page,
local service worker activated. WGX: software WebGPU, 844x390, Montreal park,
lite true, MSAA1, mobile false (phone-sized viewport is not phone emulation).
The WGX image was inspected and is nonblank. Its captured display completion
is explicitly not physical scanout, nor visual validation of the new fixtures.
TLX WebGL2: software adapter, Montreal, 640x360, lite true. TLX WebGPU:
software adapter with requested Lavapipe flags, Montreal, 640x360, lite true;
actual configured ICD was absent and the screenshot-page deadline failed.
GLX's live test loads the F1 diagnostic helper and records the API manifest,
page/renderer identity and presentation wait separately from `isTexture` checks.
The failed native probe is retained under `native-probe/`; it is an unsupported
hardware test, not a game regression. No software timings are used as player
performance evidence.

Performance opportunities remain hypotheses: compare batch culling/upload CPU
cost across main/mirror/shadow with matched pass contents; profile repeated
material/texture binding work before adding cache shortcuts; measure import
vertex expansion on a real model population. The flat-normal fixture expands
4 vertices to 6, an operation/storage count, not a timing result. No baseline /
candidate device performance measurement was collected or claimed.

The canonical node groups completed separately were `game-vm-a`, `net-unit`,
`audio-unit`, `state-unit`, `desktop-unit`, `garage-unit`, `vm-page-a`,
`vm-page-b`, `node-slow`, `steering-unit`, `mcp`, `service-worker`,
`lifecycle-unit`, `agent-contract`, `game-vm-b1` and `game-vm-b2`.
No standalone successful `deploy.mjs --gate-only` verdict is claimed.
