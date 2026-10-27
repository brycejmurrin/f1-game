# Root documentation group 04 — complete reading map

Read on 2026-10-27 at checkout HEAD `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. Scope is exactly group `04` of `docs-root-batches.json`: 15 documents, 4,687 lines. Root AGENTS.md read; no nested docs AGENTS.md was found. Every document was read through EOF in bounded chunks; oversized combined output was reread in smaller chunks. Hashes below identify the actual bytes read, not an assertion about the deployed site.

No runtime, generated reference, browser, test, publication or commit operation was performed. This report maps documentation contracts; it does not certify all runtime consumers or dated measurements.

## Full-read ledger

| Document | Lines | Read ranges (inclusive) | SHA-256 |
|---|---:|---|---|
| `docs/DESIGN-TOOLS.md` | 161 | 1–161 | `1fd1930c872933942a66a24fdb556f7605ba6ca1bcd5403f201b4a640fcc85e6` |
| `docs/EVIDENCE-STORAGE.md` | 217 | 1–217 | `c1295ea3dc09530a5e22d5704d92e62f91e089afc2299b676d3e11bc987685c6` |
| `docs/FLOW.md` | 112 | 1–112 | `dccd325762511f4ed7797f113cebeb13b46a6c6f5549215dd96e43efee30c31b` |
| `docs/LAYOUT-AUDIT.md` | 6 | 1–6 | `9e74d30c1a529b09eb9df063ca86213b7c401b71f2431b5e8132ef57873bb1ee` |
| `docs/LIGHTING-TUNER-SLIDERS.md` | 859 | 1–300; 301–600; 601–859 | `ffa003c786dc1599a1cf2e7f256c0adae28a2667b7d92f6a20b2b64515a0059c` |
| `docs/LIGHTING.md` | 786 | 1–240; 241–520; 521–786 | `cc311d78570b9873da8c1d16abb843ebc4f2437e8e4d2740ee6c3ea12842c68b` |
| `docs/MULTIPLAYER.md` | 373 | 1–200; 201–290; 291–373 | `89a85a6247e20d71c57d9bd35a9b7054482d04de90fc4ae78f548bbc199b7c5e` |
| `docs/NOTES-INDEX.md` | 228 | 1–70; 71–140; 141–180; 181–228 | `1f09d0e6f5e22cc7814b5cd991379e57c3bfbb2c5227db5e63b77923e9e1e876` |
| `docs/PACKAGING.md` | 197 | 1–197 | `2b115af1bca7ee1b0a8587ab5a5bced6ad55218da51d7119177a8bece5a9de53` |
| `docs/PERF-FINDINGS.md` | 6 | 1–6 | `dc5a8519c90811814e7b82786aab7e2f141f9b795b714e975977bdcd00adb1c0` |
| `docs/PHYSICS.md` | 1238 | 1–220; 221–440; 441–680; 681–920; 921–1238 | `17eaa6db7667488427de7a6be529f3f84c2741bd53bfe37f0bc573e7cfc41374` |
| `docs/PLATFORM.md` | 99 | 1–99 | `457185cbe3e9ff53cebe0e1ff41708cdc800c653ba5e2a20aeabd418ec0271f8` |
| `docs/README.md` | 70 | 1–70 | `6054e28500aea419e23e2bbbd06dd26605771dae645e7aabd0cf5abfa4b2e7bb` |
| `docs/RENDERERS.md` | 6 | 1–6 | `099e50a12146ed3c55de6923a73e46ebe27606bad397d0bdaeedc89917994dfc` |
| `docs/SCENERY-AND-TRACK-BUILD.md` | 329 | 1–180; 181–329 | `2335c780c64fd95baa65eff32ea12f81dccee1f56b04215861764fcd73a0e928` |

## Document and section contracts

### DESIGN-TOOLS.md (1–161)

Authored workflow reference, consumed by environment/design/asset operators. Setup/diagnostics distinguishes dependency readiness, local disposable MCP contract checks, tunnel process status and actual native-chat calls. Profile generation preserves identity/credential references; service supervision owns startup/restarts and bounded tunnel retries. UI inspection produces token/axe JSON and HTML plus a source/environment-bearing review manifest (`shots[].file,label,metadata,before`); contained local image paths are required. Viewer reuses real game geometry. Procedural room sections define validate→plan→compose→export with actual Function/Form approvals, Y-up→Z-up mapping and south-wall opening limits. glTF checks produce hashes/budget/errors and separate dedup/prune output, with contained resources and explicit unsupported-codec failure. Routing/test/reference sections identify workflow owners, contract tests and upstream documentation. These are producer/consumer descriptions, not evidence the tools ran here.

### EVIDENCE-STORAGE.md (1–217)

Authored storage policy; producers are `tools/shot/publish-evidence.mjs` and `.github/workflows/archive-evidence.yml`; consumers are PR/document links, downloaders and historical catalog reviewers. CI artifact archival records workflow-run provenance separately from actual capture provenance (`captureSourceSha:null`). Historical Git selections record blob identity/path/hash/bytes under `files/` and optional direct-image mappings. Capture/inspect/publish creates archive + manifest + checksum, optional direct assets, prerelease and receipt; packaging SHA/dirty/tracked-diff are not capture-SHA proof. Receipt retries preserve bundle identity and reject conflicts. Blocked-publication instructions preserve all receipt-adjacent assets, require authorized transfer and digest verification. Download/extract preserves gallery-relative links; retention distinguishes expiring Actions artifacts, linked release evidence, runtime assets and baselines. No deletion/history rewrite is authorized by this page.

### FLOW.md (1–112)

Authored session integration snapshot, explicitly cross-checked at a dated SHA. State-machine section contracts `menu/count/race/results` and transition reasons through `setState`; session entry contracts asynchronous prepare/commit/valid/recover, cancellation and teardown. Route table distinguishes full intro, cover-only, direct restart and red-flag regrid. Exit section separates ResultsCam, Director and result surfaces, with eligibility gates for TT/quali/net/WATCH/mobile/perf tier. Producers are game session/intro/results functions; consumers are menu/HUD/results UI and usage-path verification. Function-location table is navigation, not immutable ownership: extracted runtime modules and current source maps take precedence.

### LAYOUT-AUDIT.md, PERF-FINDINGS.md, RENDERERS.md (six lines each)

Authored compatibility redirect stubs consumed by old source/test/tool citations. Destinations are respectively COMPONENTS.md Layout axes, notes/PERF-FINDINGS.md dated measurement ledger, and ARCHITECTURE.md renderer seam/output target. They produce no runtime artifacts and should not be mistaken for full references or duplicated current content.

### LIGHTING-TUNER-SLIDERS.md (1–859)

Mixed authored measurement record and generated registry projection. Intro/audit classifies per-frame, uniform, build-only and apply-only invalidation; state-versus-pixel sections establish conditional recipes, noise controls and historical lamp-cap measurements. Distance, per-chunk road/tail-light and blind-spot sections preserve dated A/B findings; their figures do not establish current real-GPU speed. Resolution/grid sections explain per-condition local overrides and integer-grid representability. Marked `GENERATED: tune-defs` block supplies id/label/range/default/uniform/preset/consumer columns for 191 entries in 11 groups. Producer `tools/gen/gen-slider-doc.mjs` reads knobs/presets and qualified member reads, owns only marked block plus H1 count; consumers are tuner developers, classifier/capture recipes and generated-doc guards. Tail CLI recipes distinguish Playwright A/B ramps from Chrome MCP look matrices and identify stored/state/pixel evidence. Consumer basename tallies are an index, not complete dataflow proof (string-key reads are invisible; three/webgpu directories are excluded by generator).

### LIGHTING.md (1–786)

Authored renderer/lighting/preset reference. Model/grading sections describe directional, hemispheric and point sources; HDR combine→lift/gamma/gain→tonal masks→toe/shoulder→ACES→display grade→lens chain; CompositeU offsets describe GPU packing. Point-light section defines 15-float records `[xyz,rgb,radius,aimXYZ,coneIn,coneOut,bleed,volW,glareW]`, bound-backend slot limits, fixture-anchor and pool-radius invariants, synthetic gap-fill and glare restrictions. Time-of-day/track lamps sections map atmosphere to per-frame lights and fixture geometry. Inspection exposes lightState/time/copy APIs. Hand-tuned constants section maps `ab-lighting.mjs` KNOBS source-string swaps, scenes and watched region metrics; run/sweep/try are measurement routes, apply writes source and resynchronizes catalog. Preset sections define layered sparse knob maps, dry-keyed sun, weather crossfade exclusions, theme intent, dated fleet progress and proposal schema `{track,theme,nightDefault,notes,combos:{'tod|wx':{id:value}}}`. Parent merge tool validates live registry ranges/steps. COPY MY EDITS merges local deltas; FULL LOOK writes complete local overrides with undo while open. Authored ranges and simplified precedence are weaker than live registry/profile implementation.

### MULTIPLAYER.md (1–373)

Authored network rationale and wire reference. Transport defines unreliable state/reliable event channels, deterministic pump/loopback and awaited ICE credentials. SDP defines compact reconstruction with browser validation/fallback and relay-first capped candidate selection. Nostr/rendezvous sections define signalling-only public relays, sealed v2 envelopes with slot AAD, PBKDF2/HKDF routing, short-code threat limits and fingerprint verification; optional private Worker protocol 3 uses separate high-entropy token, routing id and owner capability, rejects old routes and sets document-only relay URL. QR/scan sections separate encoding, OS camera link entry and BarcodeDetector/jsQR fallback cleanup. Handshake binds shell build and answer offer identity. Snapshot section defines 13-byte normal and 15-byte aged car entries, short-wrap interpolation, predicted contact versus delayed draw and arrival timestamps. Session provides ping validation, clock/heartbeat/stall grace and ICE restart. NetPlay defines own-car authority, host AI/race-control authority, clamped remote poses, epochs/classification and star-relayed wire IDs. Lobby defines sequential offers, connection-bound identities, part IDs/budget and rate limits. Phone section defines input samples, events, dashboard and haptics channels, freshness fallback, shared tilt filter, menu seam and generated controller script roster. Consumers are lobby/netplay/contact/input/HUD and controller page. Public relay acceptance and device behavior remain runtime questions.

### NOTES-INDEX.md (1–228)

Authored navigation catalog: notes table contains dated measurement/provenance summaries and supersession; research table records source citations and dated plans; archive table is explicitly provenance only; deferred maintenance and mechanics lists do not authorize implementation or history deletion. Producers are human/agent note authors; consumers are source citations, skills and document readers. `Supersedes:`/`Superseded by:` pair conventions are guarded by docs-integrity. An indexed summary is not a current runtime contract. Historical spike paths, removed tools/moves, archived transcripts and old plan statuses must be resolved against current source before use. This pass read index rows, not all indexed documents.

### PACKAGING.md (1–197)

Authored wrapper reference. Desktop identity is frozen in `desktop/lib/identity.cjs`; version combines apexVersion MAJOR.MINOR and stamped build PATCH. Staging/version/icons/notices and builder commands produce same staged site, platform packages and notices; unsigned and signing/store/update scope is explicit. Android identity/config preserve WebView save origin; sync-web reuses stamped stage, Capacitor sync then Gradle. NativeDownload intercepts blob export with Filesystem/Share, while camera/OAuth/SW behavior differs from web. Unknowns/manual matrix clearly distinguish fake-proxy unit evidence from actual devices. Producers are desktop/mobile scripts and workflows; consumers are wrappers/installers and player storage. Task/PR narrative is historical implementation context; it does not prove today's packaged binaries or device behavior.

### PHYSICS.md (1–1238)

Authored model/policy reference. Opening section defines mutable versus immutable tuning, PACE/vTop/vStd/aStd discipline, tyre lateral/combined-slip/load/surface/brake-bias channels and body/world basis. Aero/OT sections separate flap travel from switch, fixed zones from earned per-lap allowance and race-wide low-grip/leader gates. World-space authority, hard barrier/contact exceptions, opt-in road-follow and versioned settings migration protect driver control. Weather/tyres sections define tread-indexed grip matrix, road/car/field call shapes, wear-off competent-field policy and scripted/catchup AI pace. Racing-line/racecraft sections describe baked geometry, matched planner/actuator, pass/defend/yield/launch/hash/RNG invariants and per-circuit strategy. Slipstream/wake distinguishes benefit from aero loss; contact/braking sections describe finite relaxation, normal/friction impulse, yielding and compound braking ratios. Wheel state is opt-in torque/slip. Wear/pit section defines distance-normalized life, force-driven wear, commit gesture, lane state, temperatures, axle bias, severity, owned-compound selection and engineer advice. Final curvature table classifies assist-gated, AI-only, surface and broadcast consumers, with no-curvature exceptions for own-state grip steer/local rain/incident recovery. Producers are physics/race/game modules; consumers include integration, HUD/audio/coach, pits, AI, replay/net and contract tests. Dated measurements are rationale, not a fresh benchmark.

### PLATFORM.md (1–99)

Authored device/static-host rationale. Static hosting/cache section describes HTTPS and content-hash staging. iOS input section gives support/mapping/poll/deadzone/edge/rumble and gesture/zoom boundaries, referring device-specific details to research. Rendering/power section describes fixed-step integration and gesture-resumed audio; device checklist requests actual thermal/fps/input/cache verification. Producers are input/game/shell/deploy; consumers are Safari/player controls. Broad 60-fps/A15/A16 comfort wording is unsupported by this read-only pass and cannot supersede device measurements.

### README.md (1–70)

Authored routing, not generated schema: ordered agent/human reading paths, area-doc table, agent/evidence table, redirect list and directory catalog. Producers are maintainers; consumers are arriving agents/readers. NOTES-INDEX owns long dated catalogs. A directory link or current title does not turn its historical contents into current architecture evidence.

## Selected source and LSP corroboration

Attached Apex LSP definition calls returned `LightTune` at `js/lighting/lighting.js:8`, `NetSnapshot` at `js/net/snapshot.js:4`, and `TrackBuildProps` at `js/track/scenery/build-props.js:4`. These confirm symbol routing only; source checks below use local checkout bytes (remote workspace synchronization was not independently established).

- `tools/gen/gen-slider-doc.mjs:1–100` explicitly declares marked-block/H1 ownership, registry/preset inputs, excluded backend directories and member-read limitations. This corroborates the generation boundary and limits the table's all-consumers interpretation.
- `js/render/shared/light-budget.js:1–36` defines MAX 48, MOBILE 24, LITE 16, CHUNK 24 and TAIL_RESERVE 5, bound slots and fallback/clamp. This matches LIGHTING's current slot contract; 32-slot sweep numbers remain historical.
- `js/net/snapshot.js:12–15` defines type 2 aged packets, CAR_BYTES 13 and AGED_BYTES +2; encoding/decoding references at 112–142 corroborate the documented wire sizes.
- `tools/shot/publish-evidence.mjs:15,153–159` pins storage scaffold and prerelease/latest=false; `.github/workflows/archive-evidence.yml:135` records explicit unverified capture SHA. No asset upload was attempted.
- Existing complete source reports provide broader previously read context: physics-complete.md, lighting-fx-complete.md, light-presets-complete.md, net-input-complete.md, platform-complete.md, track-engine-complete.md, tools-gen-complete.md and tools-shot-complete.md. They are evidence indexes, not substitute fresh runtime tests.

## Proven stale claims and precise limits

1. SCENERY-AND-TRACK-BUILD §1–2 says circuit definitions are tagged scripts and boot pushes all full defs. `tools/manifest.cjs:112–114,200` instead supplies generated picker `CIRCUIT_META`, with full defs hydrated per pick through `LAZY_CIRCUIT`. Scenery remains separately lazy. This is a current-load-order discrepancy.
2. LIGHTING §Tonal controls gives blacks/shadows ±1.5 and midtones/highlights ±3. Current `js/lighting/knobs.js:200–204` gives blacks ±0.6, shadows ±0.55, midtones −2…1.4, highlights −1…1.5, whites −1.8…3. Generated slider rows reflect these narrower/asymmetric ranges.
3. PHYSICS opening known-exceptions item (2) says pastF/frontUtil still use rear `CURVE_PEAK_X`; `js/physics/player-forces.js:336,349` now uses `CURVE_PEAK_X_F` for both. Later prose saying front utilization equals x/(π/2) is stale for that same reason. The source report independently flags old tyre-model comments in this area.
4. PHYSICS settings migration says schema currently 4; `js/input/steer-tuning.js:414` is 5. The per-step ladder concept remains distinct from the stale current number.
5. PHYSICS aero narrative describes only curvature-run zone discovery; `js/physics/aero-zones.js:109,182` has authored turn-pair zones resolved before fallback. It is incomplete as a current zone-producer description.
6. LIGHTING-TUNER's authored audit refers to 178/183 knobs and shipping GLX while generated H1/block says 191. The measured audit populations and old caps are historical; they do not certify every current knob/backend. Generator explicitly excludes deferred backend directories, so no consumer-count row proves cross-backend liveness.
7. LIGHTING profile resolution's short arrow omits documented shared time/weather stamps; later progress prose acknowledges these. Resolve actual order from profiles, especially sun dry-keying/crossfade inputs, before authoring overrides.

Historical paths are quoted as text here, never offered as live implementation links. In particular `spike/backends/README.md`, removed `tools/moves/`, old capture output under `docs/look-survey/`, and archived workflow/tool names in NOTES-INDEX are provenance or legacy references. Existence, retained archive bytes and current applicability are separate questions. No attempt was made to repair generated docs or rewrite historical records.

## Completion boundary

All 15 scoped document bodies were read. The source corroborations are selected, not full rereads of every cited producer/consumer. No tests, browser sessions, hardware measurements, external reference verification, tunnel/network recovery or native packaging were run. Parent owns any later documentation checks, reconciliation and commit.
