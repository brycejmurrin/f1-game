# Root documentation groups 02–03 — complete reading and contract map

Read on 2026-10-27 in `/workspace/f1-game`; checkout HEAD at inspection:
`8a222466bc83de7cdbe6a42989f19f7824ce4c06`.
Scope: all three files in groups 02 and 03 of `docs-root-batches.json`, 6,198 lines.
The source files below are corroboration, not a claim to have fully read their whole subsystems.
No runtime/source/generated-reference edits, tests, browser runs, or commits were made.
The only authored output of this task is this map.

## Exact reading ledger

The ranges below were read as actual text, including generated tables and historical design sections;
none of these document reads was truncated. Ranges are inclusive, one-based, and cover each file once.
SHA-256 is over the complete original file bytes (including final newlines).

| Document | Lines | Fully read ranges | SHA-256 |
|---|---:|---|---|
| `docs/COMPONENTS.md` | 741 | 1–250, 251–500, 501–741 | `38f7412519c1dc6696e74ea144d868c9625632adf28feb2850d734c7557ad4df` |
| `docs/CONSOLE-RECIPES.md` | 6 | 1–6 | `8cfb2ed5f6591b6099c44043bc19e2f50c349714107e67eeefb597939c4de121` |
| `docs/DEBUG-HOOKS.md` | 5,451 | 1–550, 551–1100, 1101–1650, 1651–2200, 2201–2750, 2751–3300, 3301–3850, 3851–4400, 4401–4950, 4951–5451 | `0e94c823800b00378c4038acdf19c8e522381daaea01190949c1a4e5f25a783b` |

`AGENTS.md` was read completely before the documents. No nested `docs/**/AGENTS.md` was found.
The local `.claude/skills/code-nav/SKILL.md` was read and its shell LSP route used.

## Ownership and producers

### COMPONENTS.md

This is hand-authored UI inventory plus the absorbed layout-audit reference, rather than a generated reference.
Its first half maps shared primitives (`screen`, `sheet`, `pane`, `pane-pair`, `balanced-row`), preference-row versus
content-chip selection grammar, selector families/owners, cross-file coupling, and dead classes. Physical CSS,
`index.html`, and the owning UI modules remain implementation truth. `css/tokens.css` owns the selected look and
density/safe-area tokens; `js/ui/setting-row.js` owns native-select row wiring; `js/ui/sheet-shape.js` owns
container shape attributes and panel zoom fit. This document explains why these contracts exist.

`tests/unit/component-inventory.test.mjs` collects comment-stripped selector classes from every `css/*.css` file.
It checks every prefix is mentioned, no mentioned prefix has disappeared, every currently dead class is named,
and every class defined in multiple files is named. It does **not** assert quoted rule counts, class totals,
owner accuracy, or that a named coupling appears in its correct section. Deadness is substring presence in
`index.html` or any `js/**/*.js`, not proof that a DOM state reaches the selector. Its introductory comment
still describes a dead-class count check, but the implementation checks names, not the numeric claim.

`tools/lib/css-source.mjs` exports physical source families plus audit aliases and concatenates files for
source audits. `tests/unit/css-layers.test.mjs` is the cited loading/layer-order consumer; the class inventory
and CSS ratchets are different checks. A class-family map does not prove visual correctness.

The second half specifies a reproducible matrix driven by `tools/ui/menu-screens.mjs` exports `SCREENS`,
`VIEWPORTS`, `OVERLAY_IDS`, with routes that use player controls, and `tools/ui/layout-audit.mjs` as measurement
producer. Outputs are `artifacts/layout-audit/{audit.json,index.html}` or gallery manifest/shots/DOM files.
Axes are viewport size/shape, container size/shape, input modality, density, and safe area. The last four are
not interchangeable with screen width. Geometry probes produce clip/unreachable/overflow, ellipsis, tap, scroll,
starvation and error findings. Green means no configured finding; amber means a comfort-floor tap below `--tap`
but above WCAG; red means a hard finding; skipped means no measurement. `starved` is independently corroborated
at layout-audit lines 453–463: visible vertical auto/scroll region, hidden content >8, box height <44 pixels.

Limits explicitly preserved by the prose: observer results under `headless(true)` need a running-loop check;
animation, `display:contents`, label activation bounds, prior-screen state, and proxy box load can corrupt
measurements. Independent confirmation precedes CSS changes. The matrix is tooling coverage, not a visual
sign-off or a claim about a native phone raster.

### CONSOLE-RECIPES.md

Six-line intentional compatibility stub. The recipe content is the final section of DEBUG-HOOKS.md; the stub
keeps comment/tool/test citations valid. It has no schema, producer, or independent runtime API. Retain the
redirect rather than independently maintaining a second set of recipes.

### DEBUG-HOOKS.md

Mixed ownership: hand API reference, two generated blocks, historical agent-world research/design, and absorbed
console recipes. `ApexApi.create(G)` in `js/agent/apex.js` supplies the façade; hook clusters are spread from
`ApexCam`, `ApexTrack`, `ApexNet`, and `ApexLobby`. Agent composition lives in `js/agent/agentview.js`, with
rasters in `agentview-raster.js`. The source façade is instantiated by game boot; this is not an independent
service or a promise that every hook is loaded on an ordinary title page.

| Generated block | Producer / input | Consumer and checks | Limits |
|---|---|---|---|
| `hooks-table` | `tools/gen/gen-hooks-table.mjs`: Espree AST of `const api`, supported peeled spreads, signatures/comments; literal text from `agentHelp()` perceive/detail/know/act groups | Human hook discovery; `tests/unit/generated-docs.test.mjs`; `gen:docs` and `gen:check` | Signature syntax is not inferred return typing or async behavior; summaries are adjacent comments capped at 150 characters; see proven nested-return defect below |
| `flags-table` | `tools/gen/gen-flags-table.mjs`: execute `js/core/dev-flags.js` in a VM, enumerate `names()` and `REGISTRY` | Boot-flag discovery; generated-docs guard; same generation scripts | Table reflects nine registered flags, not every ad hoc URL/storage reader in the game |

`package.json` runs the two shared-document writers serially in `gen:docs`; `gen:check` invokes each `--check`.
Do not hand-edit these blocks. Fix source or generator, then regenerate in a future authorized change.
`tests/unit/hooks-documented.test.mjs` removes the generated index before looking for a heading/bold/table hand
entry. However its hook-name scan only recognizes indentation-shaped members in apex.js, not peeled modules;
its no-undocumented assertion is narrower than the full runtime surface.
`tools/docs/gen-agent-index.mjs` separately derives `docs/agent-index.json`, `docs/AGENT-HOOKS.md`, and impact data
from agentHelp, the manifest, and test groups. The CLI's `help <hook>` reads that JSON without a browser.
The long reference is not the producer of that machine-readable index.

## API and schema map

- **Staging and deterministic control:** `race`/`tt`, hydration, `go`, `park`/`jump`, `reset`, `seed`, `step`,
  `setInput`/`clearInput`, `obs`/`act`. Lap fractions map to arc metres; lateral positive means right, while raw
  curvature positive means left. Raw speeds are m/s, speedKph is km/h, and dashKph is pace-normalized. The source
  race descriptor is also thenable: await race to establish that build/grid work completed. `step` inputs are
  sanitized; this is distinct from a live renderer. Reset must remove episode transient fields and rewind the
  sim RNG without using cosmetic randomness. `carState` is numeric/boolean episode state for detecting leaks.
- **Camera and frame state:** camera modes, damping snapshot, camState lens, free/debug cameras, flyby shots,
  tuning, repro, garage framing. `snapCam` clears debug-camera overrides, so calling it after orbit/view cancels
  that shot. `awaitPresent` is the screenshot synchronization door; `headless(true)` makes frame-dependent
  answers stale. Framing and projection/lens evidence answer different questions. Repro reports team/halo but
  requires caller-driven reload to restore boot-only state.
- **Physics, race and field:** probe/scan/physState, ERS/aero zones, tyres, pit commitment/lane/box, caution,
  damage, timing, sectors/lap history, fieldState and carAt. Index order differs from race position; default
  carAt means player whereas carAt(0) means roster index zero. Damage and body attitude are display-only;
  activation zones wrap and require midFrac. Tyre life is fraction of selected race distance. Caution restrictions
  differ between overtake and aero. Data should be compared relatively against live tunables, not old example
  magnitudes.
- **Network/lobby:** human versus local roles, per-peer stable wire/driver IDs rather than cars-array indices,
  loopback virtual clocks, reliable events, readiness/start arming, SDP/candidate-pair probes and TURN diagnostics.
  Remote cars are replicated poses, not locally simulated; READY receipt requires a round trip. Relay-only
  per-server probes establish TURN presence; gathered local candidates do not establish transmitted or nominated
  candidates. Never treat raw credentials or SDP as necessary default report content.
- **Career:** live career flow differs from a stored save. Hooks expose compact careerState, money, facility,
  sim/rollover, regulations, ratings, reliability and qualifying. Slots require both flavour and index; delete
  returns durability/reason rather than claiming persistence merely because the live state changed. CareerSim
  uses a loaded track/grid and simulates every requested round on that circuit.
- **Rendering/performance/persistence:** assets/material-array state, resident texture census with explicit
  exclusions, CPU spans/GPU query availability, governor scale versus feature tier/autoShed/holds/crash floor,
  race-entry stages and self-time, lifecycle/context loss, store cache/mirror failures, allowlisted settings and
  garage exports, log ring and flag registry. Missing GPU timestamps or backend census is not a measured zero;
  SwiftShader cannot establish player GPU performance. Held tier and pinned render scale are separate controls.
- **Agent layer:** `world({detail,horizonS,points,corners,since})` is the per-decision egocentric spine;
  `field` is allocentric standings; `trackInfo`, `objective` and car setup facts are fetched once. Typed failure
  is `{ok:false,error,message,fix,...}` instead of raw-hook null/false. Envelopes carry API/physics versions,
  conventions, seq and time; world deltas require a known baseline and resync without since. `describe` and
  `query` pull stable-id detail, prototype+instances, and explicit truncation. `scene` radius is car-centric;
  visible scene is camera/frame-centric. `survey` scans the whole lap, and road-overlap AABB candidates require
  vertex-level confirmation. `rollout` runs physics with optional policy and returns digest/samples, restoring
  world delta state and stopping at the flag.
- **Bounds:** world points 2–12; view raster cols 8–400 / rows 4–150; car supersampling 1–6;
  trackProfile default100/max1000; trackShape default200/max2000; full circuit object pagination default500/max5000;
  rollout seconds0.05–120 / samples2–60; logs500 retained records; props registry cap40,000. These are documented
  bounds, not all independently re-executed. Rasters are approximate semantic boxes; coordinates and measured
  geometry remain the measurement channel. `trackGeometry(true)` applies to future builds and returns large
  raw buffers intended for file/code analysis.

`tools/shot/agent.mjs` is the concrete shell consumer: standardized boot/race/go/jump staging, JSON or raster
output, `--out`, and VM mode for non-pixel surfaces. CLI frame/plan/visible are deprecated aliases even though
the corresponding in-page aliases were removed. `tests/specs/agent-view.spec.js`, agent determinism, autopilot,
renderer/lifecycle/performance specs, unit guards and track verification are cited consumers; none was run here.

## Proven stale statements and producer defects

1. **Generated camera inventory is incomplete despite reporting 213 hooks.** `peeledHooks()` finds the first
   object-valued ReturnStatement anywhere under `hooks` using a depth-first walk. In `js/agent/apex-cam.js`,
   nested `clearShot` precedes the real hook object: line23 returns `{T,tries}`; the export object begins line32,
   with camera at34 and snapCam at47. A read-only static import of collectHooks returned
   `{hooks:213, async:3, T:{file:"js/agent/apex-cam.js",line:23,...}}` and no camera entry. This explains the
   bogus T/tries rows in the generated index. The generated-docs sanity regex also scans apex.js only, so it
   does not independently protect these peeled camera exports. Do not interpret 213 as the runtime hook count.
2. **Flags prose contradicts the registry.** DEBUG-HOOKS flags() says query→hash→storage and yes/no bools.
   `js/core/dev-flags.js` lines1–14, 35–46 and 65–93 explicitly use query→storage, never hash, and only
   1/on/true or 0/off/false. Legacy =1 query flags defer `=0` to storage rather than universally overriding it.
   The generated flags-table already correctly documents no hash channel.
3. **Console recipes describe the old default backend.** The final renderer recipe calls GLX the shipped/default
   renderer and TLX opt-in. `js/render/gfx.js` lines218–239 and the tlx.js header select TLX for unset/three,
   GLX for explicit webgl2/fallback, WGX opt-in. Thus the recipe's default-backend diagnosis is obsolete.
4. **WGX material/upscale absence is obsolete.** assets() prose says WGX has no texture-array path; the source
   Assets.supported at assets.js54–57 tests createTextureArray plus setMaterialMaps, both exported by
   wgx.js5975–5976, with the real createTextureArray implementation at4876. spatialUpscale's hand section says
   WGX/TLX unavailable, but apex.js1660–1674 detects backend setters/getters and TLX1170–1191/WGX2109–2119
   implement them. The generated agent surface already names all three. This is static implementation evidence,
   not a claim that any backend booted successfully in this task.
5. **UI matrix counts are old.** COMPONENTS says48 cells/28 roots. A read-only import of canonical menu-screens
   exports counted61 screens,31 distinct roots,12 viewports. Photo Studio at menu-screens91 is one concrete
   root absent from the prose top-level table. These are inventory counts, not measured passing cells.
6. **Physical CSS-family table is incomplete.** COMPONENTS' overlays chain ends loading.css; current
   tools/lib/css-source.mjs CSS_SOURCES also includes a11y-loading.css. The prose groups historical logical
   families, whereas the source now distinguishes blocking and deferred subfamilies and audit aliases.
7. **A runnable reset example assigns to const.** The headless/RL example declares `const obs` and later does
   `obs = next`; that JavaScript example cannot execute its second observation assignment as written. No runtime
   execution is needed to establish const-assignment invalidity.
8. **carOrbit's snapCam advice conflicts with implementation.** Its hand entry suggests snapCam to see the new
   debug pose. ApexCam.snapCam unconditionally clears G.dbgCam; the earlier camera warning correctly says never
   snap after free-camera placement. Capture should draw/present the free pose rather than clear it.

Historical sections are deliberately distinguished from stale current reference: the absorbed Agent world API
section explicitly labels §2 a pre-implementation audit and the toolbelt table an unbuilt sketch; its missing
registry/visibility descriptions and phasing are historical evidence, not present API guarantees. Old measured
payload byte counts, corpus sizes, GPU timings, dates and research conclusions are retained as attributed
observations, not revalidated facts. Open questions late in that history overlap work already marked shipped.

## Corroboration and verification limits

Local LSP commands resolved DevFlags.get to dev-flags.js97 and export114; ApexApi to apex.js2, exposing its
thenable staging contract; AgentView.agentHelp to agentview.js1856. The last lookup explicitly reported a
module-file fallback with export/caller coverage unverified; it is recorded as a definition location, not a
semantic reference census. Large definition bodies were capped intentionally; only the assigned documents
carry a complete-reading claim. Direct bounded source reads corroborated the producer and backend evidence.

Static imports called collectHooks and enumerated SCREENS/VIEWPORTS only. They wrote no generated files and
did not boot a game, Chromium, VM gameplay, test suite, or renderer. No timing/visual correctness claim follows.
The source and original documentation were left unchanged, including the proven defects above.
