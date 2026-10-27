# Root documentation group 01 — complete read map

Snapshot: `8a222466bc83de7cdbe6a42989f19f7824ce4c06`, 2026-10-27. Scope is exactly group `01` in `docs-root-batches.json`: ten files, 4,978 lines. Read `/workspace/f1-game/AGENTS.md` first. This report changes no runtime or generated reference. No tests, browser, generator, commit, deployment or external messaging was run.

## Full-read ledger

SHA-256 is over the complete bytes, including trailing newlines. Ranges below were read, not inferred from headings or search results. A combined Surface/Bugs call initially truncated; its affected ranges were reissued in bounded calls. Every final range below was available untruncated. The six shorter documents were read together within the output budget.

| Document | Lines | Fully read ranges | SHA-256 |
|---|---:|---|---|
| `docs/AGENT-HOOKS.md` | 119 | 1–119 | `bc97e2bb1741758539d79495f2f2e12f21fdbb5129d8bf66b53ef637d23e9c91` |
| `docs/AGENT-SURFACE.md` | 691 | 1–350; 351–579; 580–691 | `01d0331bed6676ae85175c7017a27bd5ab6401f8c29e3598f88339b4e3d8173e` |
| `docs/AGENT-WORLD-API.md` | 6 | 1–6 | `89baa6bca21dd5c022468b490f2adf0f5ae2cf15889b4e605e2aab504735196f` |
| `docs/ARCHITECTURE-MAP.md` | 153 | 1–153 | `cf9b28d98a0b4e9a678deb7452088df8795cd943f42a5104485d0eb675158793` |
| `docs/ARCHITECTURE-REVIEW.md` | 6 | 1–6 | `9494a0a19e0d66244569686cbcba8c1a9563e22f0ada2efc39415b27179b3a1c` |
| `docs/ARCHITECTURE.md` | 2228 | 1–450; 451–900; 901–1350; 1351–1800; 1801–2228 | `183673a23b2ac674dc4b374fe36aa86593fcd738a107b4607a5cb38ce8125b08` |
| `docs/BUGS.md` | 369 | 1–180; 181–369 | `cace72ae25dec5f65e8412167606d6077ac0e3e7f538af28a7dcb95e2fb5bcbf` |
| `docs/CAPTURE-REVIEW.md` | 87 | 1–87 | `bce2e4bb8b6e6ec2f6f6739771731c4d67a01dbe8b27e23ed8edc5daf6115220` |
| `docs/CAREER.md` | 1095 | 1–370; 371–740; 741–1095 | `d78981cd782700a0b83b5a72ebcdd2e4603a64f40352d634cd6d9c3b9694bd16` |
| `docs/CODE-STANDARDS.md` | 224 | 1–224 | `9ce3d9e06c78d0ede6ec58b67c3be77747e7992cbaaf3be4045ea16eacd36024` |

## Evidence standard

“Corroborated” means the named implementation or producer was inspected in this checkout. “Contract” means documentation gives a rule; it is not a claim that all code satisfies the rule. “Historical” preserves the dated observation and is not an open-defect census. No browser output, native GPU, live Pages deployment, host MCP attachment, current cloud dashboard or timing was verified. Existing runtime/full-read reports are complementary; this report does not re-label selected source reads as full runtime reads.

Selected semantic navigation used the attached `apex-lsp` definitions for `SeasonCal.award` and `ThreeInspector`; compact gateway results omitted bodies, so the exact source ranges were then read locally. Source witnesses include `js/career/season-cal.js` 455–520, `js/perf/three-inspector.js` 1–122, `js/career/career-ui-boot.js` 1–70, `js/career/career-ui.js` 1–32, `js/render/three/tlx.js` 6810–6860, `js/game.js` 7525–7545, and `.github/workflows/land.yml` 1–80. Producer witnesses include `tools/docs/gen-agent-index.mjs` 1–100, `tools/gen/gen-arch-table.mjs` 1–90, `tools/shot/design-matrix.mjs` 1–95, `tools/shot/capture-gallery.mjs` 1–75, `.github/workflows/capture-gallery.yml` 1–51, and `tests/unit/agent-surface.test.mjs` 1–100. Reading a test establishes its intended assertion, not a passing verdict.

## Contracts, producers and consumers

### AGENT-HOOKS.md — 1–119

Producer: `tools/docs/gen-agent-index.mjs`, from the statically extracted `agentHelp()` in `js/agent/agentview.js`. Sibling machine-readable output is `docs/agent-index.json`; impact-map generation also reads manifest and test groups. Whole page is generated: change the producer/input and regenerate, never edit the page.

Section map: 1–8 establishes provenance and shell lookup; 9–18 perceive describes world/scene/render/field/atmosphere/presentation; 19–24 detail is bounded describe/query; 25–33 know contains car/performance/survey/static track data; 34–40 act is objective/rollout/terminal; 41–57 fields documents egocentric signs, episode/seed and corner status; 58–89 read indexes raw observation hooks; 90–111 control indexes staging/input/time/weather; 112–119 model distinguishes static/dynamic data and approximate raster from measurement. `perf` occurs in know and read with different descriptions/signatures; this is a generated help grouping, not independently proven duplicate runtime functions.

Consumers: agent shell users; `docs/README.md`; generated-path/deploy classification; `tests/unit/agent-indexes.test.mjs`, `gen-agent-index-order.test.mjs`, and `deploy-tool.test.mjs`. Corroborated generator target constants and static AST extraction exist. This page is an index, not an exhaustive substitute for `DEBUG-HOOKS.md`. No Markdown relative links; its backtick references are navigation text.

### AGENT-SURFACE.md — 1–691

Producer: authored workflow map, with table parity enforced by `tests/unit/agent-surface.test.mjs`; no whole-page generator. Repository catalogs and wrappers produce the real schemas/tool inventory. Consumers include `AGENTS.md`, skill/persona indexes, code-nav/mcp-probe/check-changes/debugger/survey workflows, MCP implementation, doctor/config tests and plugin source workflows.

Section map:

- 1–18 routes need → skill → MCP/CLI and separates source, browser and deployment research.
- 19–129 Bootstrap describes canonical skill bodies, symlink mirrors, six-server catalogs, host-specific trust/allowlists, shared output gateway, persona adaptation and cloud diagnostics. Dashboard/host observations are dated and cannot be proved by git configuration alone.
- 130–242 MCP servers maps six current catalog entries, historical removed servers, CLI fallbacks, occupancy/ports and task routes. The removed-server table is deliberately historical; its old daemon/service descriptions do not imply current attachment. Network availability and package launch behavior are environment-specific.
- 243–256 Layers separates skill triggers, persona contracts, wrappers and CLIs.
- 257–443 Wrap map tracks historical inventory growth, current rows, parts/livery catalog discovery, timing observations and pinned argument restrictions. Read help before use: a tree-kind tool can own a browser job. The parity test actually parses `WRAP-MAP`, compares catalog names, and checks CLI/skill existence; it does not establish execution success.
- 444–463 Never wrap excludes full browser groups, deploy writers, network workflows, daemons and live Pages from these wraps.
- 464–494 How to call gives host/CLI paths, dry-run, lock and persistent debugger lifecycle.
- 495–507 Combined galleries separates saved-report combination from capture.
- 508–514 Three Inspector is opt-in TLX integration; its default wording contains the confirmed error below.
- 515–685 UI inspector documents read-only sampling, semantic/live/saved adapters, bounded settlement, replay assertions, viewport/touch/safe-area emulation, reverse-size history, CSS candidate limitations and provenance comparison. A matching value is explicitly not a behavior/reload pass. These are detailed tool contracts; this task did not exercise them.
- 686–691 routes free design workflow to DESIGN-TOOLS and parent ownership.

All nine local Markdown targets resolve at the snapshot (inventory below). External documentation links are references, not fetched or verified in this pass. `gh (read-only in Cloud)` is host-specific wording, not an authorization rule established by this report.

### AGENT-WORLD-API.md — 1–6

Producer: authored compatibility redirect. Contract: the Agent world API lives in `DEBUG-HOOKS.md`; keep this path for source/test comments. Consumers actually include `js/agent/apex.js`, `tests/unit/agentview-api-contract.test.mjs`, `tests/specs/agent-view.spec.js`, and docs index. Only relative link resolves. Do not duplicate or reconstruct a second API here.

### ARCHITECTURE-MAP.md — 1–153

Producer: authored contributor orientation; `tools/manifest.cjs` remains load-order authority. Consumers: docs index and the full architecture/bug references. Section map: 1–6 contracts/rules pointers; 7–22 static IIFE layout; 23–42 boot and façade; 43–73 domain table and extracted helpers/CSS cascade; 74–87 frame/data flow and coordinates; 88–96 flow/session axes; 97–122 generation, checks and release path; 123–133 change-to-owner routing; 134–145 ratchet/headroom policy; 146–153 related references.

Core distinction is track engine versus circuit data, one `G` façade for session state, explicit per-domain helpers, and one renderer seam. Snapshot source searches corroborate `flow`/`setFlow` and the state coordinator; this is not a complete call graph proof. “Every runtime JS file … assigns one global” is a simplified house pattern: the full index itself identifies entry/accumulator exceptions; do not enforce it literally without the actual registry guard. “Every ratchet … slack: 0” is a snapshot-sensitive assertion not remeasured here. All thirteen local Markdown targets exist; the verification anchor was not independently parsed.

### ARCHITECTURE-REVIEW.md — 1–6

Producer: authored compatibility redirect. Standing architecture assessment is a dated note; defect register has its own note. Consumers include select-screen/css-zoom source, scenery Singapore, architecture-oriented tests and UI skill references. Both relative targets resolve. The old root path stays useful as a citation; current assessment content belongs in notes.

### ARCHITECTURE.md — 1–2228

Producer: mixed authored contract and generated module map. `tools/gen/gen-arch-table.mjs` owns only the `@gen-arch:modules` span (80–704); it reads manifest plus source headers/globals. Header/roster changes require regeneration. The surrounding prose stays authored. Consumers include `AGENTS.md`, renderer rules, renderer/probe/refactoring skills, update/boot/render source comments, generation and load-order guards, and docs index.

Section map and claim boundaries:

- 1–68: no npm runtime delivery, feature-lazy vendor libraries, directory ownership, manifest-generated shell/rosters, units and IIFE conventions. The intro is a contract/sketch rather than a replacement for current manifest.
- 69–706: generated module index across 33 directories, including FULL/tag, DEFERRED and LAZY families, per-circuit aggregated rows. Header-derived Purpose text can contain old measurements; generation does not validate behavior.
- 708–750: July reorg and follow-ups. The 4,700 and 9,759 line figures are explicitly historical, not current file lengths.
- 751–805: extraction lessons: seams/testability, leftover-symbol checks, boundary crossings, explicit dependency injection and ratchets. Historic candidate/crossing/member counts stay measurements from their date.
- 806–850: Log levels/retained strings and nonallocating math interface (with explicit allocating identity/norm exceptions).
- 851–860: GLSL sources/shared composition and eval ordering. “No interpolation” is prose not revalidated for every shader here.
- 861–961: renderer seam/default TLX, optional GLX/WGX, boot canary/fallback, vendored imports, and identity-preserving descriptor-copy/track injection. Positive backend proof still requires runtime evidence.
- 962–1016: GLX core/pass split, draw API, FBO/output viewport/eye-size override and clipping/scissor contract. Example dimensions/light slots are descriptive and can drift with shared budgets.
- 1017–1062: GLTF baked mesh representation, Teams roster/points/tier data, pure TrackGeom, generic scenery data ownership.
- 1063–1093: shared track components and buildProps split, pit consumers, 114-member scenery compatibility surface. Some split-era wording still calls guards nested; treat the source module index as ownership truth.
- 1094–1199: lazy circuit data/scenery, authored/racing coordinate distinction, build/sample/curvature/mesh and terrain/prop guards. Whole-circuit absence of over-road defects is a suite goal, not a result from this pass.
- 1200–1235: Car3D local axes and helper composition; car/livery/parts/ghost responsibilities. Historic simplified mesh description is not a current geometry census.
- 1236–1263: Input helper composition and keyboard/tilt/touch API sketch. This is not a full device priority matrix.
- 1264–1315: audio graph/layers, unlock, engine tone and pitch invariants. Requires audible/runtime evidence for sound quality.
- 1316–1387: F1 API queues/cache/TTL/error behavior and Data Hub lazy tab/controller/model/view ownership. Provider availability and real data were not fetched.
- 1388–1422: relocation of former grab-bag rows and lighting registry/track/frame/profile ownership. Historical former filename is a relocation explanation, not a live path.
- 1423–1447: CarMesh and render-only particle/rain duties. See stale CarMesh ownership note below.
- 1448–1492: prose table of important extracted modules, intentionally not exhaustive. It contains the confirmed career global drift below.
- 1493–1574: four states, flow/session, physics/ERS/AI/penalties/season and camera overview. Numerical gameplay summary is version-sensitive; repeating cut-ladder prose needs reconciliation with sporting rules rather than trusting the old overview.
- 1575–1597: static DOM/CSS, generated cache hashing/version and Pages runtime-only staging. Actual Pages deployment not observed.
- 1598–1682: consolidated renderer mental model, backend/pass table and safety keys; no second renderer implementation is implied by the folded reference.
- 1683–1705: XR selection/override/fallback task-stage contract; device support and stereo presentation not verified.
- 1706–1740: historical WebKit failure diagnosis, private-storage cap, fixes and later device-evidence policy. The ranked causes are preserved bisect candidates, explicitly not the cause of that resolved incident.
- 1741–1767: screenshot controls and software readback model; host/software GPU statements require environment evidence before generalizing.
- 1768–2015: long dated parity snapshot (wet road/particles/cloud/moon/ripples/MSAA/decals/material/env/foliage/line/garage/lights/instancing/TLX caveats). It mixes landed reference claims, honest gaps and historical failures. It includes conflicting MSAA claims confirmed below; none of the “all three” visual claims was rendered by this task.
- 2016–2043: mirror features or record a gap, façade parity, WGSL validation and same-scene comparison workflow.
- 2044–2089: mocks cannot prove boot; real shader/device failure examples and positive renderer signal recipe. This report does not claim that recipe passed.
- 2090–2115: persistence latches/reset paths; relies on renderer-picker lists/canary guard, not on a live reset check here.
- 2116–2228: depth/near-plane/decal guidance, dated clipping incidents, projected-depth evidence and explicit remaining visual debt. Near-plane sample is confirmed incomplete below.

All fourteen distinct local Markdown targets exist, including the self-link, redirect RENDERERS, research, plans and tracks directory. Fragment/link existence is weaker than truth of linked contents.

### BUGS.md — 1–369

Producer: authored dated hunt ledger/current shortlist, not generated telemetry. Consumers include prior-art scout, BUGS comments in store/season/net/scenery/settings sources, scenery audit tools, regression tests and docs index. Relative targets all exist.

Section map: 1–16 scope/severity; 17–136 B1–B8 fixed narrative (axis capture, TT ladder, READY relay, points/classification, store mirror, career seeds, export allowlists/logo); 137–284 S1–S10 scenery register (shift wrappers, species, measured residual shifts, pit audit identity, slabs/water, over-road detection, dead tables and baked model guards); 285–294 intentional exclusions; 295–304 relationship to dated ledger; 305–330 October 9 backlog; 331–369 October 10 tooling backlog. S3 remains documented authoring debt; table values are an October census, not a newly measured build.

B4's correction at 72–83 explicitly supersedes the earlier `finished` gate. Source `SeasonCal.award` confirms `classified` gates points and countback; a classified retirement can score, while fastest-lap bonus additionally excludes retirement. The original fix/test sentence above the correction is historical context. The warning at 303–304 makes both later backlogs historical, so their “not yet fixed”, old source line numbers, obsolete tool paths, branch ownership and squash-only claim must not be promoted to today's contract. Current `land.yml` explicitly requires merge commits. No fresh verification of every B/S/backlog row is claimed.

### CAPTURE-REVIEW.md — 1–87

Producer: authored workflow over `tools/shot/design-matrix.mjs`, its library modules, `capture-gallery.mjs`, bounded request runner and capture workflow. Consumers: docs index and people producing portable design evidence. The only Markdown local target, authored Design Lab README, exists.

Section map: 1–39 native matrix plan/capture, variants, limits, source-bound resume/index-only and receipts; 40–67 export validated existing images to portable static collection; 68–87 bounded macOS capture fallback plus a dated local CDN/WebGL failure. Source corroborates a plan reports browser discovery with `launchVerified:false`, one persistent garage child, source rechecks, backend/readiness/method receipts, image hashes and selected/full coverage. Exporter validates contained image paths, hashes and formats and preserves native/geometry/unverified classes; it does not run a browser or upload. Workflow corroborates macOS, 15-minute job, checkout of event SHA, read-only contents, no cancellation and seven-day retention. The 24-image cap belongs to the request runner contract and was not independently read in full here. Example artifact names are prospective outputs, not existing evidence or live links. CDN and browser failures describe the author's environment; this task did not reproduce them.

### CAREER.md — 1–1095

Producer: authored mechanics/persistence/UI reference. Runtime producers are Career, SaveMigrate/GameStore, CareerBackup, CareerScreen/boot façade, SeasonCal, Quali, Parts/Regulations/AI development, reliability and game coordinator. Economy tool measurements are dated numeric evidence. Consumers include career/garage skills, source career header, audit workflow, career-seat rollover test and docs index. No Markdown links; numerous backtick source references are textual navigation.

Section map:

- 1–57: owner list, two axes and active-career gating; confirmed UI owner name is stale below.
- 58–177: six flavour-separated slots, active slot save-before-switch, backup merge/revision gates, durable mirror, two legacy migrations, picker door and season alias. Backup compact one-line fields are contracts; imports/restores were not exercised.
- 178–248: stateless mixed hash draws, unconditional sim roll, ratings across all modes, tier/development pace. Measured distribution/pace numbers are not remeasured.
- 249–333: ownership versus fitted cap, research and budget ladders, regulation refits and garage UI/write funnel. These preserve distinction between listing and actual resolution.
- 334–412: custom-team works cap/two-car build, hire wages, winter renewal/poaching/pending seat and market move disclosure.
- 413–545: three objectives/seeded choices/lock, result and craft reputation channels, debouncing, journal debrief and winter player development. “No retirement term” is a deliberate product rule; no new driving cause is inferred.
- 546–639: reliability risk/stream-free arm, retirement placement/classification, save/hub display and OFF/LOW/REAL opt-in. Points prose is confirmed stale below.
- 640–739: in-place rollover, bounded history, development/market/offers, regulation legality filters/cache keys and AI shelving/restoration. History count is not elapsed-season authority.
- 740–805: ambition/goal commitments and expiring-term offers, renew versus move garage ownership.
- 806–869: historical economy measurements, sponsor windows, facility sink and explicit extra-funds preference. Repricing/rebalancing invalidates numeric conclusions until remeasurement.
- 870–944: modelled qualifying, live-car ID remap, GP/championship grid rules, standalone-only sprint format and classification lifetime.
- 945–970: debug hook examples; staging and one-circuit simulation limits are explicit.
- 971–1005: derived history totals, bounded archive assumption and UI registries/phone action-bar rationale. Totals cover retained history; this report does not extend the 10-entry archive into an all-time guarantee.
- 1006–1020: test routing and assertions as claimed coverage, not executed verification. Its retirement-no-points summary shares stale classification semantics.
- 1021–1095: twelve-category Parts array, budget/physics/ERS/visual recipes and team SIGNATURE clones. Cooldown column is explicitly historical; no active lockout is implied.

### CODE-STANDARDS.md — 1–224

Producer: authored house-style checklist, informed by actual guards; no generator. Consumer: docs index and engineers doing a scoped style pass. No Markdown relative links.

Section map: 1–13 guard precedence; 14–41 behavior-preserving style/frozen interfaces; 42–73 strict IIFE order and shared helper homes; 74–108 naming; 109–125 declarations and value idioms; 126–144 function API/ownership rules; 145–156 loops/control flow; 157–172 dedup/dead-code proof; 173–205 rationale-focused comments and retained evidence; 206–212 formatting; 213–224 read/identify surface/edit/verify/report procedure. This is normative, not an assertion that all existing code follows every style rule. Its grep-for-symbol recipe predates AGENTS' semantic LSP routing; use current higher-priority AGENTS for named symbols and grep for text/comments. “No ES modules” describes project runtime conventions, with vendor/dynamic-import exceptions explained by ARCHITECTURE. Style-only edits must preserve public signatures and deterministic floating-point ordering.

## Proven stale prose and bounded follow-ups

1. **Inspector deployed default reversed.** Surface 510 says it is “off under the Playwright harness and on the deployed site.” `ThreeInspector.wanted()` at source 32–40 returns URL override, then stored value, then `devHost() && !navigator.webdriver`; source header explicitly says deployed default OFF. Correct the authored sentence to default off on deployed/automation, default on dev hosts, with URL/store opt-in precedence. No generated table change needed.
2. **Career screen global moved.** Career 9 and Architecture prose table 1463 identify `career-ui.js` as `CareerUI`; source begins `const CareerScreen`, while `career-ui-boot.js` owns `CareerUI` and lazily delegates `create(G)`. Architecture's generated index already reflects the split. Update only authored ownership prose via normal review, preserving generated index ownership.
3. **Career retirement scoring is out of date.** Career 606–610 says award pays `c.retired ? 0 : table[i]`, and test summary 1013–1014 says retirement scores no points. `SeasonCal.award` 488–490 instead prefers explicit `c.classified`, falling back to `!c.retired`; a classified retirement can score. BUGS B4 correction already explains the 90% rule. Reword current mechanics/test summary; keep historical discovery evidence distinguishable.
4. **TLX “MSAA still off” paragraph conflicts with implementation.** Architecture 1959–1960 (TLX parity paragraph) says MSAA remains off because three exposes no resolved depth. Source `sceneSamplesFor` 6827–6848 returns 2/4 on desktop WebGL2 when supported, 0 on native WebGPU/mobile, and its call sets the scene target. Architecture's earlier SCENE MSAA bullet at 1820–1826 is already closer to current behavior. Consolidate authored prose by path; no visual success inferred.
5. **Near-plane example omits newer onboard modes.** Architecture 2158–2170 reserves 0.3 only for cockpit/hood, but game source 7537–7539 also includes visor/helmet. Its free-camera 0.3 statement remains corroborated. Update example and “only” wording, retaining dated clipping incident as history.

Other candidates are not promoted to confirmed defects: the CarMesh 1423–1432 paragraph says drawing stays in game.js although later prose/index names CarDraw; that is likely extraction drift but needs the exact dependency ownership read before correction. Map ratchet saturation, shader interpolation, gameplay numbers, host attachment/egress, browser timings and all visual parity claims need their appropriate source/runtime witnesses. Historical BUGS squash-only observation is obsolete relative to current `land.yml`, but is explicitly under historical warning and should remain a dated observation rather than be rewritten as a current policy.

## Relative-link inventory

The inventory records distinct Markdown destinations, resolved relative to each original document (not this report). Every listed local path existed at the snapshot. It does not validate fragment IDs or external URLs. Backtick source paths and historical deleted names are not Markdown links and were mapped descriptively above rather than emitted as nonexistent live links.

- `AGENT-HOOKS.md`: none.
- `AGENT-SURFACE.md`: `../.claude/agents/README.md`; `../.claude/skills/README.md`; `../tools/README.md`; `DEBUG-HOOKS.md`; `DESIGN-TOOLS.md`; `agent-output/README.md`; `notes/LSP-MCP-2026-10-18.md`; `research/AGENT-JS-DEBUGGER-MCP.md`; `research/APEX-TOOLS-MCP.md`.
- `AGENT-WORLD-API.md`: `DEBUG-HOOKS.md`.
- `ARCHITECTURE-MAP.md`: `../AGENTS.md`; `AGENT-SURFACE.md`; `ARCHITECTURE.md`; `BUGS.md`; `CAREER.md`; `DEBUG-HOOKS.md`; `PHYSICS.md`; `SCENERY-AND-TRACK-BUILD.md`; `TESTING.md`; `VERIFICATION.md#ci-and-pages`; `notes/ARCHITECTURE-REVIEW.md`; `notes/DEFECT-LEDGER.md`; `plans/2026-09-30-carve-headroom.md`.
- `ARCHITECTURE-REVIEW.md`: `notes/ARCHITECTURE-REVIEW.md`; `notes/DEFECT-LEDGER.md`.
- `ARCHITECTURE.md`: `ARCHITECTURE-MAP.md`; `ARCHITECTURE.md`; `BUGS.md`; `DEBUG-HOOKS.md`; `FLOW.md`; `RENDERERS.md`; `SCENERY-API.md`; `notes/ARCHITECTURE-REVIEW.md`; `notes/CAMERA-FEEL.md`; `notes/DEFECT-LEDGER.md`; `notes/OCCLUSION-PROBE.md`; `plans/2026-09-24-refactor-readability.md`; `research/WEBGPU-PARITY.md`; `tracks`.
- `BUGS.md`: `ARCHITECTURE-MAP.md`; `ARCHITECTURE.md`; `SCENERY-AND-TRACK-BUILD.md`; `SCENERY-API.md`; `notes/DEFECT-LEDGER.md`.
- `CAPTURE-REVIEW.md`: `../sites/design-lab/README.md`.
- `CAREER.md`: none.
- `CODE-STANDARDS.md`: none.

## Completion and limits

All ten assigned documents were fully read and mapped. Generated ownership, authored contracts, compatibility redirects, historical evidence and source-confirmed drift are separated above. Read-only link existence and selected source checks were performed; tests/browser/generation were deliberately not run under the assignment. This report neither approves deployment nor declares every documented behavior verified.
