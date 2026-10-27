# Unit group 40 — complete source map

Read-only mapping of all 16 group-40 files (4,468 lines) at `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. No tests, browser runs, source edits or commits. Case descriptions record intent and assertion evidence, not passing results.

## Read evidence

Source was read in separate contiguous returns of at most 90 lines and under 10,000 characters (largest window: 7,307 characters). The initial globally truncated aggregate was discarded for affected windows and those windows were returned again. Ranges below are inclusive; SHA-256 pins exact test bytes.

| file | SHA-256 | complete read windows |
|---|---|---|
| `tests/unit/props-over-road.test.mjs` | `8bef0ca8a401897f87f3c2d2f7513c0a02522a1e2708825012bf22a86c520614` | 1-80, 81-160, 161-240, 241-320, 321-400, 401-459 |
| `tests/unit/props-tri-ratchet.test.mjs` | `90b2ccfbf2f05480c26e74e50f5ea7416c82321d991806e37140d82c1ceaf1be` | 1-80, 81-131 |
| `tests/unit/prune-branches.test.mjs` | `10bfb0c0c3a4c0899e4e17241ba54513939614c67a682bb57b46f6afffb6ac74` | 1-80, 81-133 |
| `tests/unit/pu-harvest-audio.test.mjs` | `505859816180f3d0bc86c74f672e4aeaf4b3b6c4b97d0ecdbd82ac23272d2b87` | 1-80, 81-145 |
| `tests/unit/publish-evidence.test.mjs` | `beb3c61a6c26352dfba464f8e6444925605cbb62bf231c5504085b2e221befdd` | 1-70, 71-140, 141-209 |
| `tests/unit/publish-shots.test.mjs` | `ac0539f06e7a7e47f2744dd6ca4c05380a20ac7045fb65f714bd87c07d4f8a6c` | 1-70, 71-140, 141-210 |
| `tests/unit/puddles.test.mjs` | `d5fc9d56e7f16bef68ee9a527fa4bd49fa50f505b9c57dd317fe3b478ccea9ce` | 1-80, 81-160, 161-240 |
| `tests/unit/qatar-day-sf-orbit.test.mjs` | `14d8fc830f88451d6b7ff5137315daa8010b928f15c0f0addaab2d5c9a9e2dd6` | 1-90 |
| `tests/unit/quali-handoff-vm.test.mjs` | `271aa3a56ea82a3c63d946deff81227fdf46df9fedb981ec6991cca58fd734d5` | 1-80, 81-121 |
| `tests/unit/quali-pace-parity-vm.test.mjs` | `030627ea6ba14462e313c1c2d2c70827c13612b0e7d78b8ec62dd232cf3cf782` | 1-70 |
| `tests/unit/quali-persist.test.mjs` | `b4157c909c11830fccfb4bf17ad371a93bd4912a487c2074ea8dab70556b75c3` | 1-80, 81-160, 161-240, 241-320, 321-400, 401-480, 481-555 |
| `tests/unit/quality-preset-phone.test.mjs` | `4453193af44057941212a61e58861f2d49f6c4a3af8ae6bec0586b1099fb2d67` | 1-80, 81-150 |
| `tests/unit/queue-depth.test.mjs` | `061623d160b17582f52bf81090cdfc765d3f94c5d7a3d9343c132ec6c0356cbf` | 1-80, 81-160, 161-240, 241-296 |
| `tests/unit/quick-validate.test.mjs` | `5cc93fe7acb65112638538f3951770961d523d8b4ac3113d21a02ce1fbd990ef` | 1-67 |
| `tests/unit/race-control.test.mjs` | `46e0f6e90dc2dc69d6d10a76bbfa94d1f246b07d1db718b6eb1502b921720262` | 1-80, 81-160, 161-240, 241-320, 321-400, 401-480, 481-560, 561-640, 641-720, 721-800, 801-880, 881-960, 961-1035 |
| `tests/unit/race-entry-profile.test.mjs` | `9e85afbddce4eeef47130c7d4c8c39d555aa9c4c05ca91c534c232cf6a79bfe7` | 1-80, 81-160, 161-240, 241-320, 321-400, 401-480, 481-557 |

## Navigation and evidence boundaries

Repository AGENTS.md and `.claude/skills/code-nav/SKILL.md` were read. Attached apex-lsp definition resolved RaceControl to js/race/race-control.js:2; outlines resolved RaceControl (20 exports), Quali (7), QualiSheet (1), RaceEntryProfile (31), GfxQuality (12), Puddles (7), GameAudio (155 exports, first 40 returned), and TrackHiddenFaces (41 internal rows, export inference unavailable). Target ranges below combine these declarations with explicit source loads and AST function-declaration spans (AST parsing is navigation only, not execution). They do not imply full production-file audits.

Bounded production source reads: tools/ci/prune-branches.mjs:104-155; tools/shot/publish-evidence.mjs:139-171; tools/ci/queue-depth.mjs:128-189; tools/check/quick-validate.mjs:52-95; tools/shot/export-history-evidence.mjs:1-48; tools/lib/solid-in-road.cjs:83-116; tools/track/props-tris.cjs:35-81.

Helpers are identified from imports and use: game-vm.cjs boots real module code behind stub DOM/graphics/timers; abs-src labels evaluated code; seed-log and seed-store provide required globals; game-source/symbolSource and fn-source extract current source bodies; mkTmpDir and git-fixture-env isolate temporary repositories. These helper relationships are not separate full helper audits. Any filename under temporary roots (including gallery/view.png, artifacts/survey, seed.txt, shots/topics, remote.git, work/node_modules, unsafe tab names and symlink/external targets) is descriptive test data, not a claim that a live project path exists.

## Cases

`range` encloses the test declaration; `assertionSpans` includes explicit assert calls inside its callback, including nested callback assertions. Helper/setup assertions are separate per file. The descriptive case name states the behavioral invariant; the final column identifies what kind of evidence supports it and the relevant boundary.

### tests/unit/props-over-road.test.mjs

Fixture and semantics: Shared real-track VM; indexed triangle sampler at 1200 lap samples × five lateral rungs; empty exceptions and 0.20–5 m vertical band. Shanghai and Mont Tremblant always build, other fleet rows follow APEX_CIRCUITS. Memoized verdicts, primitive trimming and explicit geometry retention.

Limits: VM geometry can differ from browser geometry; surface sampling can miss narrow objects and unrecorded primitives. Planted slab/crown and grounded/lifted pillar are anti-vacuity controls; basin probes use fixed real-circuit coordinates.

Shared/helper assertion spans: 285.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| no prop geometry on or above the racing line, on any circuit | 305-321 | 315-320 | tools/lib/solid-in-road.cjs:83-114; js/track/tracks.js (Tracks.build/setKeepGeometry/sample/terrainY/banking) | Behavior/source contract in fixture above; stated file limits apply. |
| shanghai's track-owned props stay at the shared clean tolerance | 323-331 | 328,329-330 | tools/lib/solid-in-road.cjs:83-114; js/track/tracks.js (Tracks.build/setKeepGeometry/sample/terrainY/banking) | Behavior/source contract in fixture above; stated file limits apply. |
| mont_tremblant's forest crowns stay at the shared clean tolerance | 333-338 | 335,336-337 | tools/lib/solid-in-road.cjs:83-114; js/track/tracks.js (Tracks.build/setKeepGeometry/sample/terrainY/banking) | Behavior/source contract in fixture above; stated file limits apply. |
| the audit still measures: a planted slab and a planted forest crown are found | 340-379 | 360,361,372,375-376,377-378 | js/track/tracks.js:471-478 | Behavior/source contract in fixture above; stated file limits apply. |
| no grounded solid stands on the tarmac, on any circuit | 381-400 | 396-399 | tools/lib/solid-in-road.cjs:83-114; js/track/tracks.js (Tracks.build/setKeepGeometry/sample/terrainY/banking) | Behavior/source contract in fixture above; stated file limits apply. |
| the solid-in-road audit still measures: a planted pillar is found, a lifted one is not | 402-428 | 423,424-425,427 | js/track/tracks.js:471-478; tools/lib/solid-in-road.cjs:83-111 | Behavior/source contract in fixture above; stated file limits apply. |
| basin probes outside the road carve are real numbers under the asphalt | 433-459 | 450,454 | js/track/tracks.js:471-478; js/track/tracks.js:788-805 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/props-tri-ratchet.test.mjs

Fixture and semantics: Real track-build subprocess memoized across cases; tools/track/props-tris-baseline.json and scoped manifest roster; hand-built typed geometry with block metadata.

Limits: Counts and exact corner-column identity concern VM buffers, not GPU image or frame-time performance. Growth allowance 0.5%; stale floor 99%.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| every circuit is measured | 67-72 | 71 | tools/track/props-tris.cjs:35-80; js/track/core/hidden-faces.js:27 (TrackHiddenFaces.compact) | Behavior/source contract in fixture above; stated file limits apply. |
| props triangles stay within 0.5 % of the per-circuit baseline | 74-86 | 85 | tools/track/props-tris.cjs:35-80; js/track/core/hidden-faces.js:27 (TrackHiddenFaces.compact) | Behavior/source contract in fixture above; stated file limits apply. |
| baseline has no stale entries — a cap far above the measured count is a lie | 88-99 | 95,98 | tools/track/props-tris.cjs:35-80; js/track/core/hidden-faces.js:27 (TrackHiddenFaces.compact) | Behavior/source contract in fixture above; stated file limits apply. |
| vertex compaction keeps every triangle identical and drops only unreferenced vertices | 101-105 | 103,104 | tools/track/props-tris.cjs:35-80; js/track/core/hidden-faces.js:27 (TrackHiddenFaces.compact) | Behavior/source contract in fixture above; stated file limits apply. |
| compact() on a hand-built buffer: order-preserving remap, blocks shifted | 107-131 | 120,121,122,123,124,125,126,129,130 | js/track/core/hidden-faces.js:555-612 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/prune-branches.test.mjs

Fixture and semantics: Pure branch/time/merge/PR/verdict fixtures plus workflow source inspection; NOW and day ages deterministic.

Limits: No remote deletions or GitHub permission behavior executed. Synthetic branch names and sha-* strings are inputs, not repository refs.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| only merged, quiet branches with no open PR are pruned; everything else says why it stayed | 22-33 | 28,29-32 | tools/ci/prune-branches.mjs:120-143 | Behavior/source contract in fixture above; stated file limits apply. |
| a squash-merged branch goes only while its tip IS the merged PR's head | 35-41 | 39,40 | tools/ci/prune-branches.mjs:146-155; tools/ci/prune-branches.mjs:120-143 | Behavior/source contract in fixture above; stated file limits apply. |
| claims markers are pruned on age alone, a day at least, and an open PR still wins | 43-48 | 46,47 | tools/ci/prune-branches.mjs:120-143 | Behavior/source contract in fixture above; stated file limits apply. |
| an ABSORBED verdict prunes; a judgement verdict only when opted in, and the reason is kept | 50-59 | 54,55,56,58 | tools/ci/prune-branches.mjs:120-143 | Behavior/source contract in fixture above; stated file limits apply. |
| a lossy prune is archived to refs/archive (outside any clone) first; merged, absorbed and expired claims are not | 61-65 | 63-64 | tools/ci/prune-branches.mjs:104-106 | Behavior/source contract in fixture above; stated file limits apply. |
| the first run's archive TAGS move to refs/archive, and nothing else is touched | 67-70 | 69 | tools/ci/prune-branches.mjs:72-81 | Behavior/source contract in fixture above; stated file limits apply. |
| push results are read per ref: a refused ref falls back to a tag, the rest count as landed | 72-83 | 80,81,82 | tools/ci/prune-branches.mjs:87-96; tools/ci/prune-branches.mjs:99-102 | Behavior/source contract in fixture above; stated file limits apply. |
| the claims board is never pruned, however old or unmerged | 85-89 | 87,88 | tools/ci/prune-branches.mjs:120-143 | Behavior/source contract in fixture above; stated file limits apply. |
| --also refuses a verdict that is not a judgement call (merged/active) | 91-97 | 95,96 | tools/ci/prune-branches.mjs:162-261 | Behavior/source contract in fixture above; stated file limits apply. |
| a branch with no readable commit time is kept, never read as old | 99-103 | 101,102 | tools/ci/prune-branches.mjs:120-143 | Behavior/source contract in fixture above; stated file limits apply. |
| parseRefs reads for-each-ref lines and drops origin/HEAD | 105-108 | 107 | tools/ci/prune-branches.mjs:72-155,162; .github/workflows/prune-branches.yml | Behavior/source contract in fixture above; stated file limits apply. |
| --apply without the open-PR list refuses (an unknown PR set is not an empty one) | 110-116 | 114,115 | tools/ci/prune-branches.mjs:162-261 | Behavior/source contract in fixture above; stated file limits apply. |
| the workflow is dispatch-only, dry-run by default, and passes --apply only when ticked | 118-133 | 121,122,123,124,125,126,127,128,129,130,131,132 | tools/ci/prune-branches.mjs:72-155,162; .github/workflows/prune-branches.yml | Workflow text policy; no workflow execution. |

### tests/unit/pu-harvest-audio.test.mjs

Fixture and semantics: Real audio modules in VM with recorded AudioParam values, synthetic mono decoded samples, deferred fetch releases, 44.1 kHz context and identity tune.

Limits: Control-level meter changes verify whine, cylinder cut and harvest routing; no actual speaker output, waveform quality or browser AudioContext.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| ERS deploy whine level and pitch rise with deploy at speed | 91-105 | 100,104 | js/audio/engine.js:1658-2164 | Behavior/source contract in fixture above; stated file limits apply. |
| cylinder-cut engages on part-throttle and full-pack regen, not at full throttle | 107-116 | 110,112,115 | js/audio/engine.js:1658-2164 | Behavior/source contract in fixture above; stated file limits apply. |
| lift-and-coast harvest is audible off throttle and brake; full throttle stays dry | 118-129 | 124,125,128 | js/audio/engine.js:1658-2164 | Behavior/source contract in fixture above; stated file limits apply. |
| braking harvest still follows hard deceleration | 131-145 | 143,144 | js/audio/engine.js:807-829; js/audio/engine.js:1511-1514; js/audio/engine.js:2573-2583; js/audio/engine.js:1658-2164 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/publish-evidence.test.mjs

Fixture and semantics: Throwaway real Git checkout and nested SVG/image files; real tar extraction and hashes; injected gh runner records command policy and release metadata.

Limits: Filesystem/Git/archive work is real when tests run; GitHub upload/auth/digest replies are mocked. Temporary artifacts/survey, gallery/view.png and external/symlink paths are fixture paths.

Shared/helper assertion spans: 86, 91, 92, 92, 93, 94, 96.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| plan reads only the requested output directory and creates no upload files | 27-34 | 29,30,31,32,33 | tools/shot/publish-evidence.mjs:30-52 | Real local filesystem/archive/Git; injected GitHub responses. |
| input cannot be symlinked outside the checkout or contain symlinks and dependencies | 36-47 | 41,43,46 | tools/shot/publish-evidence.mjs:30-52 | Real local filesystem/archive/Git; injected GitHub responses. |
| bundle round-trips nested gallery files and records their hashes and source provenance | 49-67 | 56,57,58,61,62,64,65,66 | tools/shot/publish-evidence.mjs:54-129 | Real local filesystem/archive/Git; injected GitHub responses. |
| a redirected upload output is rejected before it can create files elsewhere | 69-75 | 73,74 | tools/shot/publish-evidence.mjs:54-129 | Real local filesystem/archive/Git; injected GitHub responses. |
| publication anchors tags outside game history, verifies every asset, and reuses matching uploads | 101-113 | 104,105,107,110,112 | tools/shot/publish-evidence.mjs:54-129; tools/shot/publish-evidence.mjs:139-171 | Real local filesystem/archive/Git; injected GitHub responses. |
| changed local data and mismatched remote hashes fail without overwriting | 115-122 | 118,119,121,121 | tools/shot/publish-evidence.mjs:54-129; tools/shot/publish-evidence.mjs:139-171 | Real local filesystem/archive/Git; injected GitHub responses. |
| authentication errors are not treated as missing releases | 124-127 | 126 | tools/shot/publish-evidence.mjs:54-129; tools/shot/publish-evidence.mjs:139-171 | Real local filesystem/archive/Git; injected GitHub responses. |
| existing conflicting tags and draft releases require inspection instead of replacement | 129-136 | 131-134,135 | tools/shot/publish-evidence.mjs:54-129; tools/shot/publish-evidence.mjs:139-171 | Real local filesystem/archive/Git; injected GitHub responses. |
| historical exports preserve committed bytes and blob identities despite working-tree edits | 138-152 | 146,147,148,149,150,151 | tools/shot/export-history-evidence.mjs:17-48 | Real local filesystem/archive/Git; injected GitHub responses. |
| historical selections reject traversal, ref/pathspec injection, missing paths and wrong checkouts | 154-168 | 157,159,160,161,162,166,167 | tools/shot/export-history-evidence.mjs:7-15; tools/shot/export-history-evidence.mjs:17-48 | Real local filesystem/archive/Git; injected GitHub responses. |
| historical export refuses committed links and symlinked output before writing outside the checkout | 170-184 | 175,182,183 | tools/shot/export-history-evidence.mjs:17-48 | Real local filesystem/archive/Git; injected GitHub responses. |
| optional direct image assets preserve nested filename collisions and are verified on publication | 186-203 | 192,195,197,198,201,202 | tools/shot/publish-evidence.mjs:54-129; tools/shot/publish-evidence.mjs:139-171 | Real local filesystem/archive/Git; injected GitHub responses. |
| direct assets cannot select missing or non-image files | 205-209 | 207,208 | tools/shot/publish-evidence.mjs:54-129 | Real local filesystem/archive/Git; injected GitHub responses. |

### tests/unit/publish-shots.test.mjs

Fixture and semantics: Throwaway bare remote and clone, real 1×1 PNG, fake node_modules directory; CLI subprocess and Git inspection of published branch trees.

Limits: Remote pushes target the temporary bare repository only; no production origin or GitHub network. shots/<topic> names, seed.txt, image files and README are synthetic.

Shared/helper assertion spans: 32, 47.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| assertShotsBranch lets only shots/<name> through | 68-74 | 69,71,73 | tools/ci/publish-shots.mjs:67-72 | Real local CLI/Git subprocess; temporary remote only. |
| --help documents the node_modules requirement | 76-82 | 78,79,80,81 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| refuses a non-PNG, naming the file | 84-96 | 91,92,93,95 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| refuses a file over 400 KB and suggests downscaling | 98-106 | 101,102,103,104,105 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| refuses a topic with a wrong prefix or odd characters | 108-116 | 112,113,115 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| refuses a missing file and an empty file list | 118-123 | 119,121,122 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| refuses when node_modules is missing | 125-135 | 130,131 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| --dry-run prints the plan and leaves remote, worktrees and branches untouched | 137-147 | 139,140,141,142,143,144,145,146 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| full publish: branch cut from ship tip, README, push, cleanup | 149-175 | 157,159,160,161,162,163,164,165,167,168,170,171,172,173,174 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| an existing topic is refused without --append | 177-185 | 181,182,183,184 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| --append stacks a fast-forward commit on the existing branch | 187-203 | 190,192,193,195,197,198,201,202 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |
| --append to a topic that does not exist is refused | 205-210 | 207,208,209 | tools/ci/publish-shots.mjs:67-134,176-270 | Real local CLI/Git subprocess; temporary remote only. |

### tests/unit/puddles.test.mjs

Fixture and semantics: Real reference math loaded with mat4; deterministic grids, pinned numeric samples, extracted scalar shader expressions and backend source string checks.

Limits: Backend constants/plumbing are lexical parity assertions; shaders are not compiled or rasterized. Numeric reference and scalar snippets do not establish a player GPU appearance.

Shared/helper assertion spans: 161, 162.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| GLX key GGX follows the final ripple normal while diffuse keeps its original normal | 26-62 | 30,31,36,45,49,50,52,53,57,60,61 | js/render/shared/puddles.js:34-96; js/render/glx/shaders/glsl-lit.js; js/render/glx/shaders/glsl-post.js; js/render/three/tsl-lit.js; js/render/webgpu/wgsl-chunks.js; js/lighting/knobs.js | Behavior/source contract in fixture above; stated file limits apply. |
| SSR receivers: porous ground keeps damp shading without borrowing the road mirror | 67-94 | 83,84,85,87,88,89,90 | js/render/shared/puddles.js:34-96; js/render/glx/shaders/glsl-lit.js; js/render/glx/shaders/glsl-post.js; js/render/three/tsl-lit.js; js/render/webgpu/wgsl-chunks.js; js/lighting/knobs.js | Behavior/source contract in fixture above; stated file limits apply. |
| reference: no puddles below road wetness 0.6, and none with the knob at 0 | 96-103 | 100,101 | js/render/shared/puddles.js:84-89 | Lexical backend parity/plumbing; no shader execution. |
| reference: puddles grow with wetness and shrink back to their deepest spots when drying | 105-124 | 110,111,117,122,123 | js/render/shared/puddles.js:84-89 | Behavior/source contract in fixture above; stated file limits apply. |
| reference: the crown drains, the gutter and the low side of a camber hold water | 126-135 | 131,133,134 | js/render/shared/puddles.js:84-89; js/render/shared/puddles.js:72-77 | Behavior/source contract in fixture above; stated file limits apply. |
| reference: pinned sample values (a change here is a look change on all three backends) | 137-156 | 152,154,155 | js/render/shared/puddles.js:84-89; js/render/shared/puddles.js:49-54; js/render/shared/puddles.js:67-69 | Behavior/source contract in fixture above; stated file limits apply. |
| parity: the mask's field, road weight and growth carry the reference constants on GLX, TLX and WGX | 168-188 | 170,171,172,174,174,175,176,177,178,179,180,181,182,183,184,185,187 | js/render/shared/puddles.js:34-96; js/render/glx/shaders/glsl-lit.js; js/render/glx/shaders/glsl-post.js; js/render/three/tsl-lit.js; js/render/webgpu/wgsl-chunks.js; js/lighting/knobs.js | Lexical backend parity/plumbing; no shader execution. |
| parity: inside a puddle — near-zero roughness, darker albedo, a stronger mirror — on all three | 190-217 | 193,194,195,196,197,198,199,200,201,203,204,205,208,209,212,214,215,216 | js/render/shared/puddles.js:34-96; js/render/glx/shaders/glsl-lit.js; js/render/glx/shaders/glsl-post.js; js/render/three/tsl-lit.js; js/render/webgpu/wgsl-chunks.js; js/lighting/knobs.js | Lexical backend parity/plumbing; no shader execution. |
| parity: the reference hash is the surface hash the three shaders sample | 219-225 | 221,222,223,224 | js/render/shared/puddles.js:34-96; js/render/glx/shaders/glsl-lit.js; js/render/glx/shaders/glsl-post.js; js/render/three/tsl-lit.js; js/render/webgpu/wgsl-chunks.js; js/lighting/knobs.js | Lexical backend parity/plumbing; no shader execution. |
| the PUDDLES knob reaches every backend | 227-240 | 230,231,231,231,233,234,235,237,237,238,239 | js/render/shared/puddles.js:34-96; js/render/glx/shaders/glsl-lit.js; js/render/glx/shaders/glsl-post.js; js/render/three/tsl-lit.js; js/render/webgpu/wgsl-chunks.js; js/lighting/knobs.js | Lexical backend parity/plumbing; no shader execution. |

### tests/unit/qatar-day-sf-orbit.test.mjs

Fixture and semantics: Qatar real daytime VM build and source gap check; fixed dual_lite az45/el20/dist42 orbit calculation.

Limits: Vertex bubble is a geometric proxy for camera clearance, not screenshot/occlusion proof; fixed Lusail Hill region and emission IDs only.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| qatar main grandstand gap clears the dual_lite S/F orbit eye (~28 m) | 42-50 | 45,47,48-49 | js/circuits/scenery/qatar.js (mainGrandstand/hero emitters); tools/track/verify-track.cjs (buildContext) | Behavior/source contract in fixture above; stated file limits apply. |
| qatar day S/F orbit eye is clear of main-stand mass; pit + Lusail Hill emit | 52-90 | 55,60,64,69,77-78,89 | js/circuits/scenery/qatar.js (mainGrandstand/hero emitters); tools/track/verify-track.cjs (buildContext) | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/quali-handoff-vm.test.mjs

Fixture and semantics: Shared createGame Monza VM, mini-DOM controls, settle then microtask flush; one-shot injected DOM failure.

Limits: No WebRTC/STUN/TURN or real friend peer; callback/exit state and rejection recording are exercised in the VM. Escape test uses its shared button door.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| the friend-race gate survives openQuali's await, and TO THE GRID runs the lobby's callback | 35-59 | 46,50,51,52,57-58 | js/race/quali-net.js:148-152 | Behavior/source contract in fixture above; stated file limits apply. |
| a failed openQuali lands on the menu instead of rejecting into the void | 65-86 | 82,84,85 | js/race/quali-net.js:148-152 | Behavior/source contract in fixture above; stated file limits apply. |
| friend quali: after SIMULATE BACK becomes MENU, and a second press quits cleanly (a silent rival cannot trap the player) | 88-105 | 92,95,97,98,100,103,104 | js/race/quali-net.js:148-152 | Behavior/source contract in fixture above; stated file limits apply. |
| solo quali: after SIMULATE the sheet has a MENU exit (one press) and Escape's door works | 107-121 | 110,113,115,116,119,120 | js/race/quali-net.js:148-152 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/quali-pace-parity-vm.test.mjs

Fixture and semantics: Monza and Monaco AI-only races at PACE .44/1/1.34, every fourth grid car retained, first full driven lap, 600 s simulation cap.

Limits: Median model/driven ratio must remain within 3% of its own PACE-1 calibration; this is sampled relative parity, not absolute lap-time accuracy or every-circuit coverage.

Shared/helper assertion spans: 37, 41, 53.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| monza: the modelled field's lap tracks the driven lap at every PACE | 59-69 | 67 | js/race/quali-model.js:86 (Quali.create/carLap/referencePole); tools/lib/game-vm.cjs | Expands to monza and monaco; helper assertions require applied PACE, ≥4 retained cars and ≥4 timed laps. |
| monaco: the modelled field's lap tracks the driven lap at every PACE | 59-69 | 67 | js/race/quali-model.js:86 (Quali.create/carLap/referencePole); tools/lib/game-vm.cjs | Expands to monza and monaco; helper assertions require applied PACE, ≥4 retained cars and ≥4 timed laps. |

### tests/unit/quali-persist.test.mjs

Fixture and semantics: Two-car VM model with stub career/hash/store/physics, optional three-car no-time case; separate minimal sheet DOM, real Dom formatter, game-source function extraction.

Limits: Model behavior is real in stub context; lifecycle/caution/pause/lobby wiring is source-shape evidence only. Fixed seeded hash fixture proves determinism, not transport agreement.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| clear() keeps a driven persist; clear(true) forgets it | 93-104 | 100,101,103 | js/race/quali-model.js:436-440 | Behavior/source contract in fixture above; stated file limits apply. |
| restore fills names, gaps, and isPlayer from live cars | 106-124 | 117,118,119,120,121,122,123 | js/race/quali-model.js:419-423 | Behavior/source contract in fixture above; stated file limits apply. |
| begin() restores a driven persist instead of resimming | 126-140 | 137,138,139 | js/race/quali-model.js:444-448 | Behavior/source contract in fixture above; stated file limits apply. |
| simulate(0) does not persist an all-AI provisional | 142-147 | 145,146 | js/race/quali-model.js:385-390 | Behavior/source contract in fixture above; stated file limits apply. |
| a driven simulate persists; an active netPlay session does not | 149-158 | 152,153,157 | js/race/quali-model.js:385-390 | Behavior/source contract in fixture above; stated file limits apply. |
| openQuali restores via begin(); quit-to-menu keeps persist; friend-race uses fresh | 160-256 | 163-164,167,170,171-172,177-178,179-180,181,182,186,187-188,197-198,199-200,210-211,212-213,214-215,221-223,224-225,226,227,235,236-237,238,239,247,248,253,254,255 | js/race/quali-model.js:86 (Quali.create); js/ui/quali-sheet.js:14 (create); js/race/quali-net.js; game lifecycle via symbolSource; js/career/season-cal.js; js/career/career-ui.js | Source wiring contract; no execution of that lifecycle. |
| friend-race BACK aborts to the lobby; a null quali grid does not P12-shuffle | 258-266 | 259,260,265 | js/race/quali-model.js:86 (Quali.create); js/ui/quali-sheet.js:14 (create); js/race/quali-net.js; game lifecycle via symbolSource; js/career/season-cal.js; js/career/career-ui.js | Source wiring contract; no execution of that lifecycle. |
| friend-race title quit cancels the lobby instead of aborting back into it | 268-276 | 273,274,275 | js/race/quali-model.js:86 (Quali.create); js/ui/quali-sheet.js:14 (create); js/race/quali-net.js; game lifecycle via symbolSource; js/career/season-cal.js; js/career/career-ui.js | Source wiring contract; no execution of that lifecycle. |
| order() is null when a live car is missing from the persist | 278-286 | 285 | js/race/quali-model.js:408-418 | Behavior/source contract in fixture above; stated file limits apply. |
| persistOrder skips a conflicted career save | 288-293 | 291,292 | js/race/quali-model.js:385-390 | Behavior/source contract in fixture above; stated file limits apply. |
| the sheet paints quali.rows(): a rival's DRIVEN lap is tagged, the title carries the player's P | 325-349 | 329,330,334,336,337,339,340,341,342,343,344,346,348 | js/race/quali-model.js:385-390; js/race/quali-model.js:454-456; js/ui/quali-sheet.js:69-74; js/ui/quali-sheet.js:75-79; js/ui/quali-sheet.js:25-66 | Behavior/source contract in fixture above; stated file limits apply. |
| the model no longer owns any DOM — build/open/close live on the sheet | 351-359 | 353,354,355,356,357-358 | js/race/quali-model.js:454-456 | Behavior/source contract in fixture above; stated file limits apply. |
| an in-memory classification does not follow the player to another circuit | 374-393 | 385,389,391,392 | js/race/quali-model.js:419-423; js/race/quali-model.js:408-418 | Behavior/source contract in fixture above; stated file limits apply. |
| award-time clear: game.js drops the memory when the round scores | 395-402 | 398-399,400-401 | js/race/quali-model.js:86 (Quali.create); js/ui/quali-sheet.js:14 (create); js/race/quali-net.js; game lifecycle via symbolSource; js/career/season-cal.js; js/career/career-ui.js | Source wiring contract; no execution of that lifecycle. |
| equal seeds give identical AI qualifying rows; a different seed does not | 411-421 | 419,420 | js/race/quali-model.js:393-396 | Behavior/source contract in fixture above; stated file limits apply. |
| a player whose every lap was deleted (driven = Infinity) is NO TIME, last — not handed the model's lap | 423-438 | 434,435,436,437 | js/race/quali-model.js:385-390; js/race/quali-model.js:454-456 | Behavior/source contract in fixture above; stated file limits apply. |
| NO TIME survives persist -> restore | 442-453 | 446,447,451,452 | js/race/quali-model.js:385-390; js/race/quali-model.js:444-448; js/race/quali-model.js:454-456 | Behavior/source contract in fixture above; stated file limits apply. |
| a persisted order is refused once the player's team or driver changed | 456-476 | 461,464,467,468,471,475 | js/race/quali-model.js:385-390; js/race/quali-model.js:419-423; js/race/quali-model.js:408-418 | Behavior/source contract in fixture above; stated file limits apply. |
| clear(true) forgets the seat stamp with the rest | 478-484 | 481,483 | js/race/quali-model.js:385-390; js/race/quali-model.js:436-440 | Behavior/source contract in fixture above; stated file limits apply. |
| a one-off GP's driven order persists for the one-off GP but not season round 1 at the same circuit | 492-505 | 496,498,499,501,502,504 | js/race/quali-model.js:385-390; js/race/quali-model.js:436-440; js/race/quali-model.js:419-423; js/race/quali-model.js:408-418 | Behavior/source contract in fixture above; stated file limits apply. |
| a one-off GP's qualifying never overwrites the grid a season round is keeping | 507-524 | 515,519,520,523 | js/race/quali-model.js:385-390; js/race/quali-model.js:436-440; js/race/quali-model.js:419-423 | Behavior/source contract in fixture above; stated file limits apply. |
| a career slot's order is refused by another slot, the championship and the one-off GP | 526-541 | 530,532,534,536,538,540 | js/race/quali-model.js:385-390; js/race/quali-model.js:436-440; js/race/quali-model.js:419-423 | Behavior/source contract in fixture above; stated file limits apply. |
| the quali sheet prints pole with three decimals, like its gaps | 546-555 | 553,554 | js/ui/quali-sheet.js:69-74 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/quality-preset-phone.test.mjs

Fixture and semantics: Real GfxQuality evaluated with seeded store/log; synthetic UA, memory/gpu hints, map storage and SettingRow paint capture.

Limits: Checks policy, persistence and row data rather than measured phone fps, actual reload or browser rendering.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| facade applies the phone memory cap on the first legacy/import boot | 29-40 | 35,36,37,38,39 | js/perf/quality-preset.js:54-111,167-257; js/render/shared/glx-facade.js | Behavior/source contract in fixture above; stated file limits apply. |
| capId / maxId: phones never keep ULTRA; desktop does | 42-53 | 44,45,46,47,48,49,50,51,52 | js/perf/quality-preset.js:58-58; js/perf/quality-preset.js:60-68 | Behavior/source contract in fixture above; stated file limits apply. |
| defaultId: weak phones LOW, capable MEDIUM, desktop HIGH, legacy phone HIGH | 55-65 | 58,59,60,62-63 | js/perf/quality-preset.js:99-106 | Behavior/source contract in fixture above; stated file limits apply. |
| isWeakPhone: deviceMemory < 4 and missing navigator.gpu | 67-76 | 69,70,71,72,73-74,75 | js/perf/quality-preset.js:75-91 | Behavior/source contract in fixture above; stated file limits apply. |
| set() on a phone clamps ULTRA to HIGH and skips it in cycle() | 78-107 | 91,92,93,94,95-96,101,102 | js/perf/quality-preset.js:167-194; js/perf/quality-preset.js:222-246; js/perf/quality-preset.js:54-54; js/perf/quality-preset.js:196-201 | Behavior/source contract in fixture above; stated file limits apply. |
| phone ULTRA row is disabled with the NOT ON PHONES note | 109-150 | 111,140,142,143,144 | js/perf/quality-preset.js:167-194; js/perf/quality-preset.js:222-246 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/queue-depth.test.mjs

Fixture and semantics: Synthetic jobs/status pages/PR lists and fake clock; API request history records pagination and queue priority; source checks for documentation contracts.

Limits: No live Actions/API timing; hold is informational. Per-page=1 fallback infers OS from one sampled job, and truncation remains an explicit lower bound. Wait clock advances instantly.

Shared/helper assertion spans: 83.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| thresholds are the measured account slots | 20-27 | 21,22,23,24,25,26 | tools/ci/queue-depth.mjs:82-122,128-247,262-368; .gitignore; AGENTS.md; plugin skill source files | Behavior/source contract in fixture above; stated file limits apply. |
| jobs split by runner label; completed and environment-waiting jobs hold no slot | 29-39 | 30,31,32,33,38 | tools/ci/queue-depth.mjs:128-142 | Behavior/source contract in fixture above; stated file limits apply. |
| ok under every threshold; the line names jobs in flight, queued and macOS | 41-47 | 44,45,46 | tools/ci/queue-depth.mjs:149-187; tools/ci/queue-depth.mjs:128-142; tools/ci/queue-depth.mjs:190-199 | Behavior/source contract in fixture above; stated file limits apply. |
| each threshold alone is a hold | 49-59 | 51,52,53,55,56,58 | tools/ci/queue-depth.mjs:149-187; tools/ci/queue-depth.mjs:128-142; tools/ci/queue-depth.mjs:190-199 | Behavior/source contract in fixture above; stated file limits apply. |
| a run count never drives the verdict: 20 live runs with few jobs is ok | 61-70 | 67,68,69 | tools/ci/queue-depth.mjs:207-246 | Behavior/source contract in fixture above; stated file limits apply. |
| #2181: queued runs are examined FIRST — 35 in-progress runs no longer hide 5 queued runs' 50 jobs | 90-105 | 95,96,97,98,100,103,104 | tools/ci/queue-depth.mjs:207-246 | Behavior/source contract in fixture above; stated file limits apply. |
| #2181: queued runs past the cap are counted by their jobs total (per_page=1), and lists page past 100 | 107-120 | 111,112,113,114,115,116,117,118,119 | tools/ci/queue-depth.mjs:207-246 | Behavior/source contract in fixture above; stated file limits apply. |
| measure: bounded examination, dedupe across status lists, truncation reported | 122-132 | 126,127,128,129,130,131 | tools/ci/queue-depth.mjs:207-246 | Behavior/source contract in fixture above; stated file limits apply. |
| measure: any API failure is an error, never an ok | 134-140 | 135,136-138,139 | tools/ci/queue-depth.mjs:207-246 | Behavior/source contract in fixture above; stated file limits apply. |
| #2182: pushTargets reads the destination branch of every git push in a command | 143-159 | 145,146,147,148,149,150,151,152,153,154,155,156,157,158 | tools/ci/queue-depth.mjs:262-289 | Behavior/source contract in fixture above; stated file limits apply. |
| #2182: pushStartsCi — only a ready PR or a draft labelled run-ci starts CI; unknown answers never skip | 161-183 | 162,163,164,165,166,167,169,170,171-172,173,174,174,175,178,179,180,181-182 | tools/ci/queue-depth.mjs:297-306; tools/ci/queue-depth.mjs:318-329 | Behavior/source contract in fixture above; stated file limits apply. |
| the written status file is gitignored and the docs cite the tool and JOBS | 185-196 | 186,188,189,193,194 | tools/ci/queue-depth.mjs:82-122,128-247,262-368; .gitignore; AGENTS.md; plugin skill source files | Behavior/source contract in fixture above; stated file limits apply. |
| #2266: running, queued and the oldest-queued age are reported; a starved queue holds | 201-225 | 203,209,210,211,212,215,216,219,222,223,224 | tools/ci/queue-depth.mjs:149-187; tools/ci/queue-depth.mjs:128-142; tools/ci/queue-depth.mjs:190-199 | Behavior/source contract in fixture above; stated file limits apply. |
| 2026-10-26: only queued and in_progress runs are listed; a waiting run (environment gate) holds no runner | 227-236 | 231,234,235 | tools/ci/queue-depth.mjs:207-246 | Behavior/source contract in fixture above; stated file limits apply. |
| an old queued job with half the slots running is a released lane leg, not starvation | 238-245 | 243,244 | tools/ci/queue-depth.mjs:149-187; tools/ci/queue-depth.mjs:128-142 | Behavior/source contract in fixture above; stated file limits apply. |
| a `pending` job waits in a CI lane, not for a runner: counted apart, never a hold | 247-257 | 252,253,254,255,256 | tools/ci/queue-depth.mjs:149-187; tools/ci/queue-depth.mjs:128-142; tools/ci/queue-depth.mjs:190-199 | Behavior/source contract in fixture above; stated file limits apply. |
| --wait: holds until ok has held for 2 min, then exits 0 with the trend | 266-276 | 270,271,272,273,274,275 | tools/ci/queue-depth.mjs:343-368 | Behavior/source contract in fixture above; stated file limits apply. |
| --wait: a hold between oks resets the 2 min clock | 278-283 | 281,282 | tools/ci/queue-depth.mjs:343-368 | Behavior/source contract in fixture above; stated file limits apply. |
| --wait: 124 on timeout with the last trend; an API error retries, three in a row exit 3 | 285-296 | 289,290,293,295 | tools/ci/queue-depth.mjs:343-368 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/quick-validate.test.mjs

Fixture and semantics: Probe data and stub apex with immediate zero-budget polling; source inspection of always-on globals list.

Limits: No live game or browser; verifies evaluator/failure labeling and armed-state gating, not real race startup.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| quick validator accepts a fully passing probe | 14-16 | 15 | tools/check/quick-validate.mjs:20-39 | Behavior/source contract in fixture above; stated file limits apply. |
| quick validator rejects failing race and camera hooks | 18-23 | 19-22 | tools/check/quick-validate.mjs:20-39 | Behavior/source contract in fixture above; stated file limits apply. |
| live probe marks false camera results as failed and objects as successful | 39-42 | 40,41 | tools/check/quick-validate.mjs:52-87 | Behavior/source contract in fixture above; stated file limits apply. |
| live probe waits for the race to arm, and says so when it never does | 44-59 | 48,49,50,53,54,57,58 | tools/check/quick-validate.mjs:52-87; tools/check/quick-validate.mjs:20-39 | Behavior/source contract in fixture above; stated file limits apply. |
| the always-on globals list does not require a DEFERRED backend island | 61-67 | 65,66 | tools/check/quick-validate.mjs:20-43,52-89 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/race-control.test.mjs

Fixture and semantics: Real RaceControl VM with supplied hazards/store/net ownership and 60 Hz clock; literal cars for timing/classification; seeded 300-trial ring-vs-scan differential.

Limits: No physical debris simulation or WebRTC; source checks cover extracted restart placement and comparator allocation shape. Temporal constants and snapshot contracts are exercised in simulated time.

Shared/helper assertion spans: none outside test callbacks.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| a winner never ends the race while a human is still driving | 79-91 | 85-86,89-90 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| finishOrder ranks a missing or non-finite finishT after a real clock | 93-107 | 103,104,105,106 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:158-164 | Behavior/source contract in fixture above; stated file limits apply. |
| runOrder serves a running car's time penalty on the road, at the race's speed | 109-121 | 117,120 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:170-172 | Behavior/source contract in fixture above; stated file limits apply. |
| lineTransition gives normal and incident motion the same chequered-flag rule | 123-135 | 128,129,130,131,132,133,134 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:117-152 | Behavior/source contract in fixture above; stated file limits apply. |
| lineTransition times the lap to the crossing inside the step, not the step's end | 141-163 | 147,148,149,156,157,158,161,162 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:117-152 | Behavior/source contract in fixture above; stated file limits apply. |
| same-step chequered crossings follow time in every roster order, including incident motion | 165-200 | 176-177,180,181,183,184,185,186,187,188,198,199 | js/race/race-control.js:71-71; js/race/race-control.js:117-152; js/race/race-control.js:83-89; js/race/race-control.js:94-97; js/race/race-control.js:98-103; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| lineTransition undoes a backward crossing and restores the lap clock | 202-217 | 206,207,208,209,212,213,214,216 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:117-152 | Behavior/source contract in fixture above; stated file limits apply. |
| the finish policy closes completed human races and bounded edge cases | 219-233 | 221-224,226-228,230-232 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| a Data Hub JUMP IN counts the hard cap from the clock it was seeded to, not from zero | 235-248 | 242,243,244,246,247 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| a finisher's outstanding time penalty holds the countdown until the field has had that long to cross | 250-267 | 257,258,259,260,262,263,265-266 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| green with an empty track, and the level->label table | 269-277 | 273,274,275,276 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| the three thresholds raise the right flag | 279-294 | 291,292 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| a caution RAISES immediately but does not LOWER before the hold | 296-312 | 304,308,311 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| a stuck hazard cannot neutralise the race forever | 314-334 | 323,326-327,330,333 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| the cap's re-arm hold never masks an ESCALATION | 336-356 | 344,346,350,354-355 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| a cap-forced drop does not leak its hold into the next race | 358-376 | 366,368,374-375 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| debris going inactive mid-race freezes a flying flag | 378-388 | 384,387 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| a frozen flag still AGES — the hard cap fires even with debris trapped | 390-403 | 398,401-402 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| switching the layer off DROPS a flag already flying | 405-417 | 411,413,414,416 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:311-316; js/physics/debris-world.js:205-211 | Behavior/source contract in fixture above; stated file limits apply. |
| CAUTIONS off: a host's safety car a guest inherits on disconnect still ages out | 419-433 | 430,432 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:507-521; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| the enabled flag reads BOTH storage formats | 435-447 | 444-445 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255 | Behavior/source contract in fixture above; stated file limits apply. |
| a guest adopts the host's flag verbatim and computes nothing itself | 449-468 | 458,462,463,464,465,467 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:507-521 | Behavior/source contract in fixture above; stated file limits apply. |
| the host broadcasts on CHANGE only | 470-483 | 481,482 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255 | Behavior/source contract in fixture above; stated file limits apply. |
| OVERTAKE is off on lap 1 and under the SAFETY CAR, not a yellow or a VSC (Art. B7.2.2) | 485-517 | 493,496,502,503,507,508,512,513,516 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/race/race-control.js:619-626; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| OVERTAKE stays off after the Safety Car comes in until the leader next crosses the Line (Art. B7.2.2c) | 519-549 | 525,526,530,531,533,538,541,542,546,548 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/race/race-control.js:628-635; js/race/race-control.js:619-626; js/race/race-control.js:285-297; js/physics/debris-world.js:558-573 | Behavior/source contract in fixture above; stated file limits apply. |
| after a red flag OVERTAKE returns at the leader's first crossing after the standing restart (Art. B7.2.2b) | 551-567 | 556,559,560,564,566 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/race/race-control.js:619-626; js/race/race-control.js:628-635; js/race/race-control.js:592-592; js/race/race-control.js:602-602 | Behavior/source contract in fixture above; stated file limits apply. |
| a red flag whose restart is declined (a car has finished) still holds OVERTAKE to the next crossing (#2166) | 569-586 | 576,579,580,583,585 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/race/race-control.js:628-635; js/race/race-control.js:592-592; js/race/race-control.js:600-600; js/race/race-control.js:619-626 | Behavior/source contract in fixture above; stated file limits apply. |
| game.js redFlagRestart lowers the hold only on the path that rewinds the lap | 588-593 | 590,591,592 | js/race/race-control.js:20-224,246-648,651-742; js/physics/debris-world.js (redHazardTotal); game redFlagRestart via symbolSource | Selected runtime seam plus source ordering/allocation shape. |
| it is inert when the side-world is down or the race is not running | 595-604 | 599,603 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| sixteen settled hazards raise RED, which outranks the safety car and holds OVERTAKE off | 609-618 | 612,613,614,615,616,617 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:619-626; js/race/race-control.js:592-592 | Behavior/source contract in fixture above; stated file limits apply. |
| one scraping car's settled debris can call a safety car but never a red flag | 620-631 | 627,628,629,630 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:592-592 | Behavior/source contract in fixture above; stated file limits apply. |
| RED eligibility counts attributed shards, never source-less furniture | 633-640 | 637,638,639 | js/race/race-control.js:20-224,246-648,651-742; js/physics/debris-world.js (redHazardTotal); game redFlagRestart via symbolSource | Behavior/source contract in fixture above; stated file limits apply. |
| the red procedure: stopping, held, then exactly ONE restart request and a re-arm hold | 642-657 | 646,647,649,650,651,652,654,656 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:592-592 | Behavior/source contract in fixture above; stated file limits apply. |
| apply(): a hostile or malformed CAUTION from the host is coerced, and info() never throws | 659-676 | 667,668,669,670,673,674,675 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:507-521; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| clearHold(): once the surface is cleared at the restart, a NEW hazard is not masked by the re-arm hold | 678-685 | 681,684 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:592-592; js/race/race-control.js:600-600; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| a networked race never goes red — it holds a SAFETY CAR instead — and reset() drops a pending restart | 687-697 | 691,692,696 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:285-297; js/physics/debris-world.js:558-573; js/race/race-control.js:592-592 | Behavior/source contract in fixture above; stated file limits apply. |
| a guest mirrors the red phase from the host's payload | 699-706 | 702,703,705 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:507-521; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| hold(): a scripted flag flies past the SC cap and the MIN_HOLD drop, and hands back on release | 708-742 | 711,713,714,716,717,722,723,728,730,732,734,737,739,741 | js/race/race-control.js:20-224,246-648,651-742; js/physics/debris-world.js (redHazardTotal); game redFlagRestart via symbolSource | Behavior/source contract in fixture above; stated file limits apply. |
| hold(): a held flag flies with the CAUTIONS setting OFF, and release drops it there too | 744-754 | 747,750,751,753 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635; js/race/race-control.js:528-534 | Behavior/source contract in fixture above; stated file limits apply. |
| hold(): release and lowering take effect at once — with debris off, and with the switch off | 756-778 | 760,762,766,766,770,772,776,777 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:528-534; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| a red flag applied with the CAUTIONS switch off still runs its procedure and asks for the restart | 780-792 | 783,785,787,789,790,791 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:507-521; js/race/race-control.js:628-635; js/race/race-control.js:592-592 | Behavior/source contract in fixture above; stated file limits apply. |
| Time Trial and qualifying never raise a caution from the player's own debris | 794-806 | 800,805 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| a caution flying when a session turns into a lone lap is dropped | 808-816 | 812,815 | js/race/race-control.js:246-643; js/physics/debris-world.js:213-255; js/physics/debris-world.js:1105-1151; js/race/race-control.js:628-635 | Behavior/source contract in fixture above; stated file limits apply. |
| scQueueFrac and holdCap read the per-tick snapshot, so cars[] order cannot change the verdict | 818-845 | 829,834,835,840,844 | js/race/race-control.js:682-717; js/race/race-control.js:729-740 | Behavior/source contract in fixture above; stated file limits apply. |
| settleLineStep with no or one entry never sorts, and the comparator is not rebuilt per call | 847-853 | 852 | js/race/race-control.js:94-97 | Selected runtime seam plus source ordering/allocation shape. |
| SOLO: a finished player waits for the AI still running, bounded by the post-finish cap | 855-870 | 857,861,862,863,864,865-866,867,868,869 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| SOLO: the wait clock restarts when the player is no longer done (a new race, a red-flag restart) | 872-877 | 876 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| SOLO: a retired player keeps the race running until the field finishes or the cap | 879-890 | 884,885,886-887,888,889 | js/physics/debris-world.js:1105-1151; js/race/race-control.js:31-56 | Behavior/source contract in fixture above; stated file limits apply. |
| classify(): a flagged finisher below 90 % of the winner's laps stays in the order, ahead of slower unclassified cars | 892-907 | 902,903,904,905-906 | js/race/race-control.js:190-205 | Behavior/source contract in fixture above; stated file limits apply. |
| classify(): a retirement earns no future crossing ahead of the winner | 909-917 | 915,916 | js/race/race-control.js:190-205 | Behavior/source contract in fixture above; stated file limits apply. |
| all-DNF classification uses the retired leader's completed distance, excluding DSQ references | 919-934 | 926,927,928,929,930,931,932,933 | js/race/race-control.js:190-205; js/race/race-control.js:211-216 | Behavior/source contract in fixture above; stated file limits apply. |
| all-DNF short runs retain zero-lap and finished-retired semantics | 936-950 | 940,941,942,945,947,948,949 | js/race/race-control.js:211-216; js/race/race-control.js:190-205 | Behavior/source contract in fixture above; stated file limits apply. |
| all-DNF fallback leaves flagged and no-flag running references unchanged | 952-965 | 958,958,959,963,963,964 | js/race/race-control.js:190-205; js/race/race-control.js:211-216 | Behavior/source contract in fixture above; stated file limits apply. |
| replay flag snapshots bypass live hazards and red restarts, and normal apply/reset release ownership | 967-985 | 973,975,975,976,976,978,978,980,984 | js/race/race-control.js:20-224,246-648,651-742; js/physics/debris-world.js (redHazardTotal); game redFlagRestart via symbolSource | Behavior/source contract in fixture above; stated file limits apply. |
| manual settlement shares the corrected-time opportunity, even after an ordinary wait was armed | 988-999 | 992,994,995,996,998 | js/race/race-control.js:31-56; js/race/race-control.js:21-30 | Behavior/source contract in fixture above; stated file limits apply. |
| scQueueFrac's per-step ring (#3109 row 12) answers exactly what the plain field scan answers | 1001-1027 | 1020,1025 | js/race/race-control.js:682-717; js/race/race-control.js:71-71 | Behavior/source contract in fixture above; stated file limits apply. |
| holdCap reads c.rank's slot and falls back to indexOf when the slot is not c | 1029-1035 | 1032,1034 | js/race/race-control.js:729-740 | Behavior/source contract in fixture above; stated file limits apply. |

### tests/unit/race-entry-profile.test.mjs

Fixture and semantics: Controlled performance clock, injected longtasks/Fake PerformanceObserver, deferred session promises, stub handoff/warming/render/input/network and sliced lifecycle/tick source.

Limits: No actual browser observer delivery, compositor paint, GPU warmup or measured startup performance; source slicing tests selected branches only.

Shared/helper assertion spans: 345.

| name / asserted meaning | range | assertionSpans | target | evidence / limits |
|---|---|---|---|---|
| loading probe waits past countdown until a ready presentation closes the plate | 22-34 | 27,28,29,30,31,32,33 | js/perf/race-entry-profile.js:115-443; js/race/session-entry.js; js/ui/platform-session.js; game tickBody via gameSource; tools/shot/loading-probe.mjs (loadingProbeReady); tools/manifest.cjs | Behavior/source contract in fixture above; stated file limits apply. |
| legs match the startRaceBody stopwatch shape | 45-60 | 53,54,54,55,55,56,56,58,59 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:289-293; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| marks record handoff / warm / present readiness once | 62-76 | 72,73,74,75 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:295-308; js/perf/race-entry-profile.js:311-322; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| synthetic longtasks feed blockMs and maxBlockMs | 78-87 | 84,85,86 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| tickFrame ends the window two frames after present:ready | 89-100 | 92,94,96,98,99 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:311-322; js/perf/race-entry-profile.js:325-328; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| PerformanceObserver longtask entries are recorded when supported | 102-125 | 112,113,121,122,124 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:414-430; js/perf/race-entry-profile.js:281-287 | Behavior/source contract in fixture above; stated file limits apply. |
| menu entry session stays armed through present:ready and resumes into startRace | 127-143 | 136,139,140,141,142 | js/perf/race-entry-profile.js:233-239; js/perf/race-entry-profile.js:295-308; js/perf/race-entry-profile.js:311-322; js/perf/race-entry-profile.js:325-328; js/perf/race-entry-profile.js:241-259; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| beginUi + afterPaint + continueWindow keep UI cover marks into startRace | 145-165 | 149,150,155,156,160,161,162,164 | js/perf/race-entry-profile.js:233-239; js/perf/race-entry-profile.js:414-430; js/perf/race-entry-profile.js:267-279; js/perf/race-entry-profile.js:241-259 | Behavior/source contract in fixture above; stated file limits apply. |
| continueWindow restarts the leg clock: the body's first lap is not the garage-out and flyby | 167-176 | 175 | js/perf/race-entry-profile.js:233-239; js/perf/race-entry-profile.js:241-259; js/perf/race-entry-profile.js:289-293; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| manifest lists the module before quality-preset (load order) | 178-183 | 182 | js/perf/race-entry-profile.js:115-443; js/race/session-entry.js; js/ui/platform-session.js; game tickBody via gameSource; tools/shot/loading-probe.mjs (loadingProbeReady); tools/manifest.cjs | Behavior/source contract in fixture above; stated file limits apply. |
| requestWarm / raiseHandoff / span / afterPresent keep game.js thin | 185-212 | 190,191,193,194,202,205,207,208,210,211 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:331-336; js/perf/race-entry-profile.js:414-430; js/perf/race-entry-profile.js:346-350; js/perf/race-entry-profile.js:352-356; js/perf/race-entry-profile.js:368-378 | Behavior/source contract in fixture above; stated file limits apply. |
| afterPresent lowers handoff on ctxLost even while warming (race-start fail-fast) | 214-228 | 226,227 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:368-378; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| hidden mirror preparation keeps the handoff up until its main present | 232-245 | 240,241,243,244 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:368-378; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| race-entry ticks pump input and network while holding physics and governor | 247-278 | 266,267,269,270,274,276,277 | js/perf/race-entry-profile.js:115-443; js/race/session-entry.js; js/ui/platform-session.js; game tickBody via gameSource; tools/shot/loading-probe.mjs (loadingProbeReady); tools/manifest.cjs | Behavior/source contract in fixture above; stated file limits apply. |
| hiding or leaving the page cancels preparation when animation frames stop | 280-307 | 285,300,303,306 | js/perf/race-entry-profile.js:115-443; js/race/session-entry.js; js/ui/platform-session.js; game tickBody via gameSource; tools/shot/loading-probe.mjs (loadingProbeReady); tools/manifest.cjs | Behavior/source contract in fixture above; stated file limits apply. |
| a superseded asynchronous preparation cannot mark the next entry | 315-323 | 322 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:358-363; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| runSession duplicates retain latch identity, marks, and a single observer | 349-363 | 352,355,356,357,358,359,361 | js/perf/race-entry-profile.js:381-400; js/perf/race-entry-profile.js:295-308; js/perf/race-entry-profile.js:414-430; js/perf/race-entry-profile.js:281-287 | Behavior/source contract in fixture above; stated file limits apply. |
| runSession cancellation disconnects the observer without committing | 365-376 | 371,372,373,374,375 | js/race/session-entry.js:13-13 | Behavior/source contract in fixture above; stated file limits apply. |
| an older prerequisite settlement cannot end or append marks to the newer window | 378-394 | 385,386,387,388,389,390,391,392 | js/perf/race-entry-profile.js:295-308; js/perf/race-entry-profile.js:414-430; js/perf/race-entry-profile.js:281-287 | Behavior/source contract in fixture above; stated file limits apply. |
| an older rejected prerequisite cannot end the newer window | 396-405 | 400,401,402,403 | js/perf/race-entry-profile.js:281-287 | Behavior/source contract in fixture above; stated file limits apply. |
| observer callbacks are conservatively scoped to the owning generation | 407-419 | 413,415,416 | js/perf/race-entry-profile.js:414-430; js/perf/race-entry-profile.js:281-287 | Behavior/source contract in fixture above; stated file limits apply. |
| stageTable and diffStages summarise span legs for probes | 421-440 | 433,434,435,436,439 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:295-308; js/perf/race-entry-profile.js:289-293; js/perf/race-entry-profile.js:175-189; js/perf/race-entry-profile.js:191-210; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| nested spans report selfMs: gridCountdown minus the car warm it encloses (#3674) | 442-460 | 451,452,453,454,455,456,457,459 | js/perf/race-entry-profile.js:141-173 | Behavior/source contract in fixture above; stated file limits apply. |
| software GL reports span starts to the progress sink | 462-471 | 470 | js/perf/race-entry-profile.js:233-239; js/perf/race-entry-profile.js:137-139; js/perf/race-entry-profile.js:295-308 | Behavior/source contract in fixture above; stated file limits apply. |
| introBudgetExpired fires after the soft budget elapses | 473-480 | 477,479 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:133-135 | Behavior/source contract in fixture above; stated file limits apply. |
| successful completion waits for presentation even when no handoff exists | 482-502 | 486,487-488,489,490,491,494,495,497,499,500,501 | js/perf/race-entry-profile.js:368-378; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| a raised handoff observes ready presentation before an asynchronous body settles | 504-525 | 517,519,520,522,524 | js/perf/race-entry-profile.js:346-350; js/perf/race-entry-profile.js:368-378 | Behavior/source contract in fixture above; stated file limits apply. |
| false commit, invalid settings, and failures release only their active observer | 527-547 | 539,540,541,542,543,544,545 | js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |
| ended duration stays fixed and a new window resets its terminal clock | 549-557 | 553,554,555,556 | js/perf/race-entry-profile.js:212-228; js/race/session-entry.js:14-54; js/perf/race-entry-profile.js:281-287; js/perf/race-entry-profile.js:414-430 | Behavior/source contract in fixture above; stated file limits apply. |

Coverage accounting: 210 explicit test declarations and 211 named cases; the parameterized qualifying parity declaration is expanded into monza and monaco rows. Other loops exercise multiple data rows/iterations within their named case. No assertion predicate dump or test verdict is claimed.

## Important interpretation limits

The deploy-era comments and measured timings in these test headers explain why guards exist; they are not measurements repeated by this mapping. In pu-harvest-audio the deploy test reads ersLevel(), so its title mentioning pitch is broader than the direct assertions. In race-control the empty settlement call plus absence of an arrow comparator does not exercise an actual one-entry settlement. The solo quali handoff exit case invokes the button shared with Escape, rather than dispatching a keyboard event. The first quality facade case covers first-boot mobile tier policy with synthetic user agents, not real iPhone memory. Props-over-road keeps the surface and grounded-solid guards separate because neither subsumes the other; the browser-versus-VM divergence documented in its header remains a coverage boundary.
