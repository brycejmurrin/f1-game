# Root documentation groups 05 and 06 — complete reading map

Read on 2026-10-27 in `/workspace/f1-game`. Scope: all eleven files assigned by `docs-root-batches.json`, 5,604 lines (group 05: 4,964; group 06: 640). This is an evidence and ownership map, not a runtime verification report. Only this prose report was authored. No tests, browser, generators, commits or runtime edits were performed for this assignment.

## Full-read ledger

Ranges are inclusive, contiguous and cover every line. SHA-256 covers the raw file bytes. Initial oversized coverage reads were truncated by the tool presentation layer; the entire coverage page was subsequently reread in the bounded ranges below, and the lost ranges were not counted as evidence. Coverage-row ellipses already present in the document are generator output, not omitted reading.

| Group | File | Lines | Fully read ranges | SHA-256 |
|---|---|---:|---|---|
| 05 | `docs/SCENERY-API.md` | 1265 | 1–430; 431–850; 851–1265 | `9d63354157ccf6f1ffcffd38a025e8d8e6bd40d8107f74a72c3441292b8b37a4` |
| 05 | `docs/SCENERY-GROUNDING.md` | 6 | 1–6 | `f06da2670f0bc41633ccb73ac33b8b091387fdaa4a6aa0b009087a2e5b56795c` |
| 05 | `docs/TESTING-COVERAGE.md` | 1235 | 1–140; 141–280; 281–420; 421–600; 601–780; 781–960; 961–1100; 1101–1235 | `aa53df02bdf5101ad16d8cb1a89750a52df4e7559a73a58b306cb25074984c52` |
| 05 | `docs/TESTING.md` | 1389 | 1–340; 341–670; 671–1000; 1001–1389 | `62f3d08813712a3ad3d6974264cc609893ab08cec975ce410e13605c771648cb` |
| 05 | `docs/TRACK-DESIGNER.md` | 464 | 1–245; 246–464 | `28d311cb4a277d58bf2cdb6a1aed9ac6d4c87c4515a4786129396974fcd3932c` |
| 05 | `docs/UI-EXPLORER.md` | 91 | 1–91 | `98f50145d1915bec4d132e8b188f3c4def3f83dfcb6be695af307f9fea302a11` |
| 05 | `docs/UI-MAP.md` | 514 | 1–260; 261–514 | `a61e7e56b17df5eb3bec86a4f4214c2e395b3925d02e50dd1383159f74a0391d` |
| 06 | `docs/USAGE-PATHS.md` | 266 | 1–266 | `52cc0958133ca43991be742d4f77ef1ce2302b7e5a15bea0cea44845101dbc01` |
| 06 | `docs/VERIFICATION.md` | 80 | 1–80 | `06085434afacb59a748318696763c4a4c2bec7c060cf9b689a9a390337804ae7` |
| 06 | `docs/WORKERS.md` | 112 | 1–112 | `8a2cb218ce9a9874b21bd8eff0c506c058295dca964e71f2c95bca71bf83da37` |
| 06 | `docs/ui-experience-studio.md` | 182 | 1–182 | `d916afc8401fddf1a873293034058f2ca68d11faddeb8d5cfb999e67fd9c3046` |

## Producer, schema and consumer contracts

### SCENERY-API.md

Hand-authored developer reference; not a generated catalog. The current authoring producer is the lazy `window.TrackScenery[id] = function(api)` registry under `js/circuits/scenery/`; circuit definition data remains under `js/circuits/`. `TrackBuildProps` in `js/track/scenery/build-props.js` orchestrates shared dress, transforms coordinate-bearing helpers, and hands the frozen surface to the callback. LSP resolved that global to the local file at line 4; direct source reading covered lines 1–90. `js/circuits/scenery/monza.js` lines 1–35 corroborate the lazy registry and callback consumer. `tests/unit/scenery-api-contract.test.mjs` lines 1–200 were read: its explicit sorted CONTRACT and CONTRACT_SIZE=114 independently freeze the surface, probe plain and transformed definitions, read per-circuit landmark JSON, and assert wrapped K behavior. This is stronger evidence than the prose's member count alone; these tests were read, not executed.

| Document section/range | Producer → contract → consumer mapping |
|---|---|
| Introduction, 1–31 | Circuit data + lazy scenery closure → engine orchestration and palettes → track prop mesh. Shared city dressing is additional work rather than callback-owned geometry. |
| hwZones, 32–50 | Def windows `{s0,s1,hw,ease}` → control-point index fractions → `js/track/core/def.js`; distinguish these from arc fractions. This seam is mapped from the document, not independently executed. |
| Positioning and coordinate contract, 52–102 | `K`, anchor, terrain queries and TrackSpace conversions → source/racing coordinates and lateral metres beyond road edge → all trackside scenery authors. Raw world positions do not undergo node remapping. |
| Atomic/intentional models, 103–160 | Complete footprint + staged emission → finite nonempty atomic model, required IDs, overhead clearance, lamp fixture registration → TrackModels, diagnostics, verify-track and landmark fixtures. Separate 96 fixture / 512 mast budgets are documentary claims here, not newly measured counts. |
| Scene graph, 161–175 | Internal instance recipe and placement basis → track.graph → renderer batches/parity tool; deliberately outside the public 114-member callback surface. |
| Themes and kits, 176–245 | Definition theme/overrides + session → resolved palette/budgets → LandmarkKit and CircuitKit bounded atomic helpers. Stable IDs are persistence/diagnostic identities. |
| Dressing exclusions, 246–278 | Def windows/kinds/side → scenery-frame transform, reversed side and lamp aliases → shared city/foliage/mast passes. |
| Context/reservations, 279–329 | API arrays/utilities + `indexSolid` footprint → geometric occupancy, separate from driving limits → later scatter and deferred treelines. Authored earlier trees are not retroactively removed. |
| Placement/primitives, 330–364 | Track-relative helpers and world-coordinate primitives → distinct dimensions/basis/terrain queries → circuit closures. Source vs render Y and centre-vs-base semantics must survive refactors. |
| Vegetation/structures, 365–436 | Species and structure helpers → full-footprint guarded geometry/materials → props, lamps and occupancy index. Unknown tree names have a compatibility fallback. |
| Stands/open seating/building forms, 437–552 | Named livery/options/range walks → bounded tiers/crowd/roof/window models → shared emitters; costs in verts/metre are recorded estimates. |
| Barriers/baked models/palettes, 553–623 | Barrier helpers, model ID plus opts, ATM/COL → driving/occupancy geometry, packed-asset optional fallback, palette → track build and renderer. Literal asset IDs are a lazy-load dependency contract. |
| On-track guard/range pattern/workflow, 624–672 | Full oriented footprint rejection → suppress malformed/road-overlapping pieces → audits and authors. Ring sample is illustrative; workflow file location has drift (below). |
| Grounding structural gap/traps/advisories, 673–776 | Primitive geometry and actual surfaces → contact checks and sampled footprint warnings → author review, ground-audit report and shot jobs. Advisory findings do not add failure/baseline counts. Historical gap description is followed by shipped helpers, not a claim that no vertical tooling exists today. |
| Grounding intent/measurement, 777–871 | seat/foundation/atomic support/cantilevers → geometry support graph fixed point → float-audit; legitimate spans and water-borne objects need interpretation. |
| Float ratchet/history, 872–970 | Float counts + per-circuit baseline → absent=zero, no growth, no slack → scenery-grounding suite and sweeps. Inherited counts and Singapore source-line references are historical provenance, not current defect locations. |
| Clipping detector/blocking/safe buffers, 971–1083 | Primitive vertices/material/emission adjacency → SAT penetration filtering, occupancy yielding and finite-buffer validation → clip ratchet, build diagnostics. Dropped geometry must preserve driving boundary bookkeeping. |
| Renderer/canopy/barrier index, 1084–1210 | Depth bias/near plane, canopy radius and barrier segments → visual depth handling and world-space clearances → renderers/scatter/deferred foliage. AABB audit counts remain review upper bounds; they are not exact collision evidence. |
| Migration/checklist and appended refinements, 1211–1265 | Def coordinates, grounded atomic models, pit roof recipe, collision/exclusions → geometry/model diagnostics, audits and day/night review → new circuits and foundation edits. Last paragraphs record venue pass, tree relocation, motorhome reservations and circuit fixes; none were revalidated here. |

### SCENERY-GROUNDING.md

Lines 1–6 are a hand-authored compatibility redirect to SCENERY-API's Grounding section. It preserves source/test comment citation compatibility. Its old path is a stable provenance identifier, not a second implementation or a second source of grounding rules.

### TESTING-COVERAGE.md

The whole page is generated. `tools/docs/gen-coverage-table.mjs` was fully read (lines 1–100): it scans only root `tests/specs/*.spec.js` and root `tests/unit/*.test.{mjs,cjs}`, sorts filenames, and emits two Markdown tables. Description precedence is the consecutive `//` note immediately above a path in `tests/groups.json.toolingFast`, then headerSentence, then first sufficiently long `test`/`it` title, then a dash. Text is whitespace-normalized, capped at 220 characters with a word-boundary ellipsis, and pipe-escaped. This explains bare `@ts-check` rows and imperfect descriptive text; neither is an execution result. Manual tests and recursive subdirectories are outside this catalog's scan.

The Playwright section (1–179) and Node section (180–1235) map every row to its filename producer. Consumers are TESTING §5, human test selection, and generator freshness guards. `tests/unit/generated-docs.test.mjs` lines 1–65 corroborate the coverage generator's registered `--check` target. Editing descriptions belongs in test headers or manifest notes; never hand-edit this page. The table's words “guards,” “coverage” and “real” report source descriptions, not test results or device evidence.

### TESTING.md

Hand-authored operational guide over `tests/groups.json`, package scripts, Playwright config, selectors, fixtures and workflows. It combines current contracts and dated experiment records. Treat exact historic runtime/count samples as scoped observations, not current universal budgets.

| Document section/range | Producer → contract → consumer mapping |
|---|---|
| Overview, 1–26 | Test tree/config → discovery exclusions and dependency prerequisites → contributors. Installation sample is explicitly dated. |
| Running/selecting, 27–133 | test-bg/pick-tests/select-specs → bounded group/spec execution and overflow/spill/drop accountability → local work and selected CI legs. |
| Timings, 134–160 | JUnit/live reporter → per-bucket, run-start-deduplicated rolling samples → select-budget median/constant distinction; timing bot branch is evidence data. |
| Coverage, 161–188 | V8 browser/Node lists + original/rewritten VM source → lcov/HTML → coverage analysis; no ordinary run collection without flags. |
| Edit loop/Garage/waits/diagnostics, 189–329 | Working-tree source and fixtures → verify-once policy, correct door, polling-bound waits, structured failure attachments → developers. Measured click/wait timings explain constraints but are not present-host benchmarks. |
| Node debugger, 330–349 | Inspector and named VM filenames → bounded probe behavior and explicit disconnect → debugger workflow. |
| Groups/registration, 353–404 | `tests/groups.json` → package scripts + membership audits → selectors/CI/nightly; list-generation claim is stale (below). |
| Boot/topical/Node/partition tables, 405–526 | Manifest groups → named execution sets → local npm aliases, CI slices and nightly scheduling. Historical renamed groups are provenance only. Tables are descriptions; group manifest is authoritative membership. |
| Infrastructure/server/sweeps/output, 528–591 | Playwright project partition, per-port server and artifact roots → isolated result ownership and serial heavy geometry → runner/report consumers. Golden snapshots differ from capture-only galleries. |
| Fixtures/VM harnesses/adapters, 592–666 | Real-source VM/recording GL/mini DOM and vmPage adapter → behavioral assertions plus explicit fidelity limits → unit suites and twin substitution gate. Source pins do not establish rendering. |
| Shared pages, 667–776 | Worker-scoped fixtures → shallow reset plus explicit opener/reset obligations → portable specs; first-load/menu/cold-cache isolation still needs care. |
| CI-shape/lints/WebKit/real GPU, 777–906 | Workflow checkout shape, optional lint binaries, browser backend identity → loud skip vs required result and proxy/hardware distinctions → CI verdicts. Renderer gate description contains contradictory current claims; investigate workflow rather than assuming prose consensus. |
| Contention/navigation/click/boot studies, 907–1115 | Dated same-box comparisons → triage methods and reachability/setup pitfalls → contributors; they do not establish current timings or justify tolerance widening. |
| Release/merge/verdict/tier, 1117–1257 | pages/ci/land workflows + selectors → fixed-name checks, staged artifact, concurrency and carry-forward → PR readiness and live-state claims. Old merge-train instructions predate current Workers contract. |
| Flakes, 1258–1298 | Exact-name expiry ledger + failed-run logs → quarantine/tally/base-red proposals → runner/triage; permanent errors remain red. |
| Philosophy/viewports/catalog, 1300–1389 | Deterministic hooks and separate moment-of-truth reads → behavioral/geometry assertions with device context → tests; generated per-file catalog is linked rather than duplicated. |

`tools/gen/gen-test-groups.mjs` lines 1–80 were read: manifest entries select command/browser/node execution, isolated node files use the wrapper, `//` entries are filtered from executable files, scripts are regenerated and removed manifest scripts are deleted. `tools/ci/tooling-fast.mjs` lines 1–65 corroborate direct manifest loading and the changed/full distinction. No generated artifact was regenerated.

### TRACK-DESIGNER.md

Hand-authored player guide, explicitly synchronized with the designer's HOWTO content. It is not a machine-generated schema. Section mapping: opening/workspaces (1–45) → lazy editor and draft navigation; bridges/water/landscape (46–91) → definition zones and authored props; quick start/selection/shape/stamps/start line (92–180) → canvas/shape/stamps and undo; themes/atmosphere/props (181–287) → TrackThemes and TrackDesignerProps; road/random generation/elevation/turns (288–372) → randomise/profile/insight and zone data; checks/repairs (373–394) → TrackValidate/TrackFixes; save/session/test drive (395–414) → CustomTracks and session entry; share/files/library (415–440) → TrackCodec/import validation; input/limits/recovery/phone (441–464) → canvas/controller, draft recovery and appearance/layout.

LSP resolved CustomTracks to `js/editor/custom-tracks.js:14`. Directly read lines 1–55 corroborate apex26 custom registry/draft/previous-draft storage, 24 item/name limits, 8–200 points, width 5–8, 24 zones, the quarter-metre lattice and sanitized bounded input. `js/editor/codec.js` lines 1–60 corroborate APXT1 plain/deflate envelopes, APXT2 props trailer, 4096-char/16384-byte codec bounds, heights/country/look flags and 24-per-zone lists. Consumers are the designer, picker, TT/ghost content identity, file/share recipient, and multiplayer's separately bounded lobby payload. Name/country are labels rather than physical content identity. UI operation counts and current HOWTO parity were not executed or exhaustively compared.

### UI-EXPLORER.md

Hand-authored tool guide. Lines 1–30 define eight bounded investigation capabilities and evidence/coverage limits; 31–54 define command examples and declarative replay/oracle behavior; 55–72 define independent hosted task briefs; 73–91 define offline review, artifact interpretation and research provenance. Producer is `tools/ui/explorer.mjs` with core/catalog/modes/browser/inspector/report modules. Directly read CLI lines 1–95, core lines 1–160 and report lines 1–70. The entry dispatches shared browser acquisition and uses finite budgets; core rejects unknown fields and executable inputs, bounds scenario actions at 256 and validates typed actions/oracles; report accepts passed/failed/not-run/partial, fills missing capabilities, escapes content and restricts artifact references to local siblings. Consumer is offline HTML/report JSON, replay/minimization, and optional independent browser operator. No brief generation establishes that an independent run occurred.

The replay guide lists the main data actions but omits the source's supported `assert` action and binding oracle; the newer `inspect` CLI also is not documented in this page. This is incomplete discoverability, not a demonstrated broken existing example.

### UI-MAP.md

Hand-authored, explicitly dated 2026-09-18 observation plus source inventory. Lines 1–25 qualify the live walk and route current journeys to USAGE-PATHS. Navigation (26–350) maps title/settings/help/data/career/picker/TT/friend/season/Garage/pause/tools; persisted observed settings are explicitly not defaults. Weak-box recipe (351–378) is survey instrumentation and freezes canvas evidence. DOM inventory (379–494) maps layer roots, shell IDs and dynamically built controls. CSS ownership (495–514) points to style responsibility, not exhaustive interaction behavior. Consumer is agent/human navigation lookup and accessibility/layout investigation.

`js/ui/layers.js` was read completely. It privately defines DEFS, derives public LAYER_IDS, includes newer loading/bench/HUD-arrange/photo-studio roots, ranks native modal opening order before nonmodal z-index, and caches gating/ranking behind invalidation. Consequently the older canonical-root paragraph/table is incomplete, even though its two non-gating root semantics remain corroborated. Major runtime rows should be resolved through source/public LAYER_IDS rather than pretending the old table is exhaustive.

### USAGE-PATHS.md

Hand-authored regression journey inventory with an explicit source baseline SHA and no blanket browser-pass claim. Sections map: requested GP journey (1–66), M01–M17 menu doors (67–95), S01–S09 selection/Garage/preparation (96–123), C01–C13 qualifying/season/career (124–145), R01–R12 and device/session result matrix (146–181), D/N/E families for data/net/editor/tools (182–210), X01–X08 interruptions/recovery (211–228), then evidence protocol and existing test entry points (229–266). Stable row IDs are regression checklist identities, not executable scenarios or an exhaustive Cartesian product. Consumers record PASS/FAIL/BLOCKED/NOT RUN with SHA, save/input/device/actions/expected/actual/evidence; two repeated loops target retained state. Source links are ownership guides; existing unit/DOM pins do not certify entire journey arrows. The baseline SHA and all dated path strings remain provenance data. Runtime routes were not replayed in this assignment.

### VERIFICATION.md

Hand-authored command meaning/ladder reader. Local edit loop (1–26) → selector/verify-change/tooling-fast changed slice; pre-push (27–41) → full structural/deploy gate; docs (43–52) → prose guards and generated-reader checks; CI/Pages (54–64) → PR head versus staged/live evidence; status (66–73) → bounded session-status output, full JSON precedence and unknown-state preservation; related readers (75–80) → canonical rule/source homes. It consumes tool contracts rather than producing a result schema itself. Its foreground/full local prescription conflicts with the newer worker local floor; AGENTS and WORKERS own authority and current lane execution, not a stale command paragraph.

### WORKERS.md

Hand-authored current orchestration contract. Lines 1–31 define claims, one-task PR lane, readiness/landing and cost cap; 33–49 define seven `handoff` fields; 51–73 define labels; 75–85 define dispatcher behavior; 87–96 define host differences; 98–105 define landing token and ruleset; 107–112 explicitly retire the old fleet bus/board/message protocol. Retired filenames, branches, status lines and messages are provenance strings, not current operational links or instructions.

`tools/ci/dispatch.mjs` lines 1–120 and `tools/ci/dispatch.json` were read: pure state/config planning is separated from GitHub writes; create/archive operations are printed for host execution; caps, 2h/6h stale thresholds, 60m archive threshold and launch-comment identities are explicit. Its handoff parser accepts a fenced block with normalized key/value lines; it does not itself enforce the entire prose schema. `.github/workflows/land.yml` lines 1–85 corroborate `land`/ready triggers, CI-completion reevaluation, head-pinned auto-merge, hold/remove-land disarm and token fallback. Repository ruleset settings and deployed dispatcher schedule were not queried, so source design is not proof those external settings currently match.

### ui-experience-studio.md

Hand-authored acceptance contract/proposal. Visual direction (1–33) constrains actual game assets, legibility and responsive order; matrix (34–72) specifies A1–A6 appearance, H1–H3 Home, W1–W5 WATCH, G1–G3 Garage, C1–C4 career, P1–P3 pause/context/dialog, F1–F3 photo and X1–X2 recovery/input. Rows identify source seams and observable acceptance behavior, not test outcomes. Browser API contract (73–130) specifies presented-frame capture, no physics advance, explicit null/security outcomes, bounded Blob lifetime, transaction-completion durability, obsolete async completion rejection, bitmap/URL release and effective reduced motion. Research table (131–156) is dated external provenance, not newly fetched evidence. Validation record (157–182) describes scoped prior unit/rendered coverage and explicitly excludes live API/full remote-group guarantees. Consumers are product implementers and acceptance reviewers; this reading does not turn unchecked acceptance rows into passes.

## Proven drift and unresolved claims

| Claim | Local corroboration | Classification and action boundary |
|---|---|---|
| SCENERY-API 661–665 says rebuild the callback in the circuit definition file. | Its own introduction and current monza lazy registry place callback code under `js/circuits/scenery/`; contract test notes def.scenery is absent on shipped defs and registry is normal path. | Proven stale workflow destination; use lazy scenery source for a future edit. No original doc was changed. |
| SCENERY-API 575–577 says no models ship in a fresh checkout. | Pack manifest contains 41 model entries and all 41 referenced `.bin` files exist in this checkout. | Proven checkout contradiction. Optional fallback remains a valid interface contract; model availability is no longer accurately characterized by that sentence. No runtime loading was tested. |
| TESTING 367–371 says tooling-fast's list is generated into its script. | gen-test-groups header explicitly retires that copy since 2026-10-26; tooling-fast imports manifest loader directly. | Proven stale producer description. Manifest remains source; package scripts remain generated. |
| TESTING edit-loop table describes two CI structural shards; later table says four. | Internal documentary disagreement; generator/list observations do not resolve workflow count. | Proven prose inconsistency, not an independently measured current CI result. |
| TESTING 1187+ calls CI the one required deploy check. | Current Workers and land workflow explicitly require `CI` and `gate`. | Stale policy description relative to current orchestration source; external ruleset not queried. |
| UI-MAP calls `UiLayers.DEFS` canonical and inventories 30 roots. | DEFS is private; return surface exposes LAYER_IDS; current source includes newer roots missing from the table. | Proven source/interface drift; map is intentionally dated but DOM-canonical wording should not be read as current exhaustive API. |
| VERIFICATION says full local deploy gate is authoritative before each code push; Workers defines changed slice + one focused spec as local floor and PR tiers. | Both documents and AGENTS were fully read. | Document-policy disagreement following orchestration rewrite; do not infer a fresh authorization or launch tests from the older paragraph. |
| USAGE E02 calls TEST HERE rolling; TRACK-DESIGNER explicitly says standstill. | Both assigned pages. | Proven documentary disagreement. No session-entry execution was done to adjudicate actual behavior. |
| Scenic float/clip counts, removed source line numbers, old group names, old bus/board path strings, dated browser timings and prior validation narrative. | Explicit dates/history/retirement qualifiers in the documents. | Historical provenance rather than current defect/pass evidence. Do not convert archival strings into current links or repairs. |

## Verification limits and handback

Full document reading is complete. Corroboration is selective source inspection and two successful LSP definition lookups, not a source-wide behavioral proof. One initial LSP request mixing symbol and file was rejected; the corrected symbol-only calls resolved both globals. Source excerpts listed above were read for contract corroboration; all assigned document ranges were fully read without relying on truncated output. No assertion is made that existing generated docs currently pass `--check`, that audits are green, that external GitHub settings/schedules are active, that historical artifact paths exist, or that the UI works on real devices. No tests or browsers were run, as required by the assignment.
