# Editor complete source map

## Scope and evidence

All 20 `js/editor/*.js` files, 8,832 lines, were read in full in this lane on 2026-10-27, at checkout HEAD `64809115e276d7a2b03ccf5678773a001e817db3`. Source/comment bodies were read, not merely outlines. Bounded output which truncated or omitted a section was followed by a narrower reread; the ledger records these overlaps. SHA-256 below fingerprints the source bytes, independently of HEAD. No runtime source was edited. This is a static source map, not browser verification.

Read rules: root `AGENTS.md`, `.claude/skills/code-nav/SKILL.md`, its `references/output-and-limits.md`; module load truth checked in `tools/manifest.cjs:214` and `:1153`. LSP queries ran through the checkout's `tools/mcp/lsp-mcp.sh` server against this local tree.

## Coverage and hash ledger

| File under js/editor/ | Lines | Fully read ranges (inclusive) | SHA-256 |
|---|---:|---|---|
| bridge-panel.js | 105 | 1–105 | `62069a798e2d29829445f9f0a1aa6e16d580035043ef5a8724032fb9f48ee989` |
| canvas.js | 822 | 1–220; 221–520; 521–822 | `1f2f75fe7db76d34808af5b0def1fee7e7a8e7522943aa85e76f1f85543fd56b` |
| codec.js | 368 | 1–368 (310–368 reread after bounded-output tail truncation) | `bc7c87c5e76045489ce0ac4707cc35de399637aa57215ba6b7a885b70c5a0cf6` |
| custom-tracks.js | 632 | 1–320; 321–632 | `060b22134e9f11d71158ef90887683f1a99133c998c7b13b549bcadc45bed9f6` |
| designer.js | 2542 | 1–260; 261–520; 521–780; 781–1040; 1041–1300; 1301–1560; 1561–1820; 1821–2080; 2081–2340; 2341–2542 | `c214312492b142c04deac859ad0805f2469b5b740f952d564c2a72f100fceb5d` |
| elev-presets.js | 122 | 1–122 | `f1393e3d5107db1eab95bbe257412bfdda0d489af09ede09ea9dcff274690976` |
| fixes.js | 404 | 1–200; 201–404; 250–335 reread to replace truncated middle | `c35178af7c0beea40cc942b88f8a0e7cafb0800f851a07c0fe71534db0845aaa` |
| followup-tools.js | 95 | 1–95 | `e8cd0a9a055fb8627b5894dcfc802f5f4d71e223c5cfa3956bd4af0a773e44d6` |
| insight.js | 429 | 1–215; 216–429 (omitted batch outputs reread separately) | `21ebcf0fb24000d570394582fc3f8adca98da6076252e1244c37e111e4253acd` |
| profile.js | 402 | 1–205; 206–402 | `e9e6c26e3ff70cb864d7ada186b120a526f4cbbd5792e43bc79e0cb23f6fe34e` |
| props.js | 348 | 1–180; 181–348 | `f9dfb2e270f7c4b47fef61e1a694ecc506b9adf5b90779ebbb35df4dbee76926` |
| randomise.js | 202 | 1–202; 130–202 reread to replace truncated tail | `2846fa341b58857f663907f71ac14f14d9d8301d734147b106c221c8cc30a932` |
| scenery-panel.js | 313 | 1–160; 161–313 | `35d628d3601aca62ed365cfd35e0eaced0d626265429163b52c77874332d9dc7` |
| scenery-preview.js | 150 | 1–150; 65–100 reread to replace truncated middle | `7d6baaac1595b3215c68ec7e331277b1a8af7f1338363f15bd1bc29a88f68097` |
| selection-panel.js | 68 | 1–68 | `3331984427136171cd4a11d0e8e4256d69b98747f81a0d6989aef5c95ecef990` |
| shape.js | 356 | 1–180; 181–356 | `a5a512d177406b15101728cffcc32ccb060f0969726caf8d6b1ad513db8c7b46` |
| stamps.js | 199 | 1–199 | `4aa77d2c3a26c1678c98b988a1da710bb6eb86ac0b4f47b2a101f3d0f464b649` |
| track-themes.js | 942 | 1–240; 241–480; 481–720; 721–942 | `6c42bda0cb9ce57045ae2c1fb6310c2bb855764fdde715922cc35336c3fd68bf` |
| validate.js | 267 | 1–140; 141–267 | `b2f261b79484b520ffc6cd151bdd191e18639242e4fd50a94842f15dd47179b2` |
| workspace.js | 66 | 1–66 | `a4711c94566aa38f093aec5094d1efa31eb1430c2b1e95365583f127a3c72bd5` |

## File responsibilities and contracts

| File | Contract |
|---|---|
| bridge-panel.js | DesignerBridges.create → {root, refresh}; validates 80–1000 m even spans, quarter-metre rise, overlap and lap fit; onChange returns a copied design to screen history. |
| canvas.js | DesignerCanvas.create → map API; pointer press/drag/range/pinch/draw state machine; emits copied points and selection callbacks; cached built-road rings, heat, scenery footprints, issues and ghost stamps; destroy removes listeners/observer. |
| codec.js | TrackCodec: defensive APXT1/APXT2 binary records, FNV16, base64url, optional bounded deflate; URL fragment and apex26.track envelope; async decode re-sanitizes through registry. |
| custom-tracks.js | CustomTracks: sanitize/canonical/content id, storage/drafts, Tracks.LIST tail sync, durable ghost retirement, collection preflight/commit, lazy editor door/hash/test-return ownership. |
| designer.js | TrackDesigner singleton screen/controller: composition, history, editing/remapping, debounced preview/draft, inspector state, library/import/share/card and race/test-drive handoff. |
| elev-presets.js | ElevPresets: pure quarter-metre node-height sanitize and deterministic flat/rolling/hilly cosine-bump sampling; clamps ±60 m through registry limit. |
| fixes.js | TrackFixes: copied remedy proposals for start/length/bounds/spacing/point count/kink/radius/fold/crossing/clearance; fixAll rejudges up to three ordered rounds. |
| followup-tools.js | DesignerFollowup: all-or-nothing scenery recipes with exact-state preview guard; repair before/after review and stale guard; read-only Spa corner cards. |
| insight.js | TrackInsight: engine-road speed, curvature bands/corner fits, passing zones, FIA advisory/vertical-g, daily seed, circuit tracing, style features/score and memory cards. |
| profile.js | DesignerProfile.create → elevation strip API; built-height trace with control ticks, shared point/range selection, bounded group vertical delta, keyboard editing, zoom/pan, cancel/destroy. |
| props.js | TrackDesignerProps: append-only 25 codec kinds, total 16/per-kind caps, sanitize/place/batch/edit/remove, arc fractions, minimum effective gaps, existing scenery-api emission and full water/terrain road-footprint guard. |
| randomise.js | TrackRandom: seeded hull/displaced-midpoint loop generator, engine-smoothing approximation for start placement, bounded validation attempts, style candidate generation/ranking and local mutation. |
| scenery-panel.js | DesignerScenery.create → {root, refresh, placement}; theme/object search and categories, atmosphere presets, point/range/both-side placement, placed-object editor; mutations delegated to screen callbacks. |
| scenery-preview.js | DesignerSceneryPreview.plan/draw: replay theme/authored scenery into at most 1800 simplified 2D ground/object footprints; generic roadside pass and optional pit garages; illustrative rather than a renderer. |
| selection-panel.js | DesignerSelection.create → {root, refresh}; shared point/range numbers, cycle/all/clear/focus, profile zoom/pan; screen callbacks own selection. |
| shape.js | TrackShape pure [x,z] geometry: heading/arcs/spirals/Dubins, RDP/resample/Catmull, projection, spacing/hull, grid crossing/clearance, RNG and forward inclusive wrapped spans. |
| stamps.js | TrackStamps: parameter clamps, compensated arc/spiral sampling, downstream Dubins rejoin, protected tangent spacing/point-budget thinning, segment-based seed loop. |
| track-themes.js | TrackThemes: append-only 30 preset/share indexes and look indexes; cloned TrackDef fields, city exclusion windows, seeded survey and per-dresser-isolated scenery closures; authored props emitted last. |
| validate.js | TrackValidate: loose registry sanitize → raw def → line-less engine centerline; bounded polygon preflight; red/amber/info verdict with road geometry/clearance/grade/pits and advisory insight; speed/lap/turn helpers. |
| workspace.js | DesignerWorkspace: disclosure group helper, share/files menu Escape ownership, remembered rail positions per pane/mode, checks summary and context help. |

## Architecture and state ownership

The boot half is `track-themes.js → props.js → custom-tracks.js` in FULL. Themes depend on `TrackSceneryData` at evaluation; registry depends on store, hash, track engine, definition factory, theme and props. `CustomTracks.sync()` evaluates before game resolves a stored stable track id, converts sanitized stored records through `toRaw → TrackDef.fromRaw`, and appends their `custom:true` definitions. The other 17 files are LAZY_EDITOR. The manifest loads shape first and screen last, with explicit shape-consumer edges and `followup-tools → scenery-panel`. Registry lazy loading retains the evaluated-file set so a failed bundle retry cannot redeclare already evaluated top-level const modules.

`CustomTracks.create(G,{load,door})` stores the live facade and backend loader. The title door and `#track=` hash route load/init/open the screen; title-door navigation ownership, hash generation and post-await race checks guard delayed completions. Hashes defer intact mid-race and strip only their own fragment after a valid ownership check. TEST HERE uses a memory-only return record; after-start hooks restore its position on restarts and a menu return consumes the record before share hashes.

`TrackDesigner` owns the working design, selection/span, modes/tools, undo/redo, verdict and all durable edit callbacks. Presentation factories receive `el`, `btn`, `group` and callbacks; they do not save storage. Map/profile own temporary gesture state, while screen commit copies/snaps geometry, pushes history (100 entries), remaps affected data, schedules 80 ms preview and 600 ms draft, then refreshes controls. Arrow nudge runs on the same selection coalesce within 500 ms. Name/library origin stay outside same-lineage undo; cross-design history restores its own labels/link. Replacing unsaved work stashes a previous draft and history entry; lifecycle hide/pagehide flushes pending draft.

Coordinates are `[x,z]` world metres, implicit closed loops, heading direction `(sin θ,cos θ)` and positive heading/curvature LEFT. Storage points/heights snap to 0.25 m; bounds ±10 km; 8–200 points; saved polygon 1–14 km and loose draft ceiling 20 km. Built-race validation separately requires 2.5–7 km. Heights are parallel to points by index. Width/other zone anchors and props are lap fractions; width zones convert polygon arc fractions to engine control-index fractions in `toRaw`. Reverse flips prop sides and zone direction; START rotates heights and shifts anchors; insert/delete/stamp match surviving controls, drop/clamp anchors inside replacements and interpolate new node heights. Full-lap width `0→1` is a special sentinel retained through sanitize/remap/codec.

Validation uses the real line-less engine centerline, never the canvas approximation. Verdict includes `{ok,red,amber,issues,stats,def,tr,turns}`; issue positions are built arc metres (`s`), node/control indices, or explicit map coordinates. Save/race/share require the current verdict to be green; warnings remain advice. Radius red is below 9 m, amber below 15 m; grade red above 15%, amber above 8%, measured over 40 m; node-scale folds and clearance/pit reach have separate gates. Polygon length preflight avoids huge centerline work before build. Crossing reports cap at 64, clearance retains six closest candidate pairs; these are intentionally bounded diagnostic summaries.

Registry identity is `custom-` plus 32-bit FNV of canonical shape/look/seed/props/surface fields; name and country are labels excluded from identity. Empty/default additions preserve old ids. Registry upsert replaces an edited origin id and preserves creation time; geometry replacement/removal only retires the old board/ghosts after a durable storage write. A failed durable write may remain playable in memory and is reported as non-durable. Sync refuses in-race tail mutation. Collection import preflights all rows with optional full validator; UI's asynchronous review uses a WeakMap-held private snapshot, exact library revision, cancellation, and one-use commit plan.

Share codec uses APXT1 when no authored props, APXT2 with append-only prop-kind trailer; flags cover zones/name/look/country/heights and an optional trailing surface byte carries kerb/berms. Points/heights use second-order signed deltas; checksums are 16-bit FNV, plain base64url or shorter deflate-raw. Decoder bounds code to 4096 chars and inflated bytes to 16384, checks version/checksum/field caps and re-sanitizes the result. The fragment never reaches the host. File envelope is `apex26.track`, collection envelope `apex26.tracks`; file input bounds are 64 KiB single or 24 times that for library. Export/card snapshot before awaits; picture card captures one design/verdict/link/name and serializes native sharing via cardBusy.

Theme order (30 entries), look option order and prop kinds (25) are wire indexes: append only. Theme `sceneryFor` surveys built straight/slow/outward geometry and uses seed/theme/tag hashing to emit independent dressers through the engine scenery API. Survey failure leaves generic scenery; one dresser failure does not stop others. Generic city exclusions, forest/reference-length budget, fixed horizon ring and lamp spacing limit cost. Props are capped at 16 total and per kind; stored gap and effective minimum-rendered gap are distinct for compatibility. Water and terrain authored footprints scan every road segment before emission. Overhead preview replays the same recipe into simplified capped footprints; relief, small furniture and its additional generic dressing remain illustrative.

## Verified integration and LSP evidence

Queries used `refs <symbol> --concise --limit=40` and followed `CustomTracks`' second page with `--offset=40`; file counts used `refs TrackDesigner --files`. No absence claim rests on a first page.

| Query | Returned local evidence | Meaning |
|---|---|---|
| CustomTracks.create | 3 rows / 2 files | `js/game.js:8740` wires G, backend script loader and title door. |
| CustomTracks | 70 rows / 13 files, both pages read | Editor consumers plus game, lobby-settings, lobby, picker, settings export; registry is shared beyond the editor screen. |
| TrackDesigner | 16 rows / 3 files, complete page | Registry init/open/test return plus picker edit entry at `js/ui/select-screen.js:1279`. |
| TrackValidate.check | 11 rows / 3 files | Screen preview/random generation/library review and fixes; callbacks exported through options remain consumers. |
| TrackThemes.sceneryFor | 4 rows / 3 files | Registry raw def scenery and overhead preview both use the closure factory. |
| TrackCodec.decode | 4 rows / 3 files | Registry hash consumer and screen pasted/file import. |
| TrackDesigner.placeTest | 4 rows / 2 files | CustomTracks.afterStart invokes it; screen also calls its local binding after awaited start. |

Consumer bodies cross-checked: `js/game.js:2758` observes committed owned start outcome before `CustomTracks.afterStart`; `:8740` wires the door. `js/ui/select-screen.js:1260` creates EDIT for custom definitions and lazy-opens a stored design with originId. `js/net/lobby-settings.js:1–105` sanitizes/limits custom wire payloads to 24576 JSON characters, normalizes circuit settings and installs an ephemeral TrackDef into LIST; `js/net/lobby.js:825–850` publishes the saved custom body with `track:-1` on host SETTINGS. These source reads establish actual online support despite older editor wording. This map does not claim every external consumer body was fully read.

## Verified comment/copy discrepancies (left unchanged)

- `custom-tracks.js:8` says the online lobby sees none of custom tracks; `designer.js:76` tells players there is no online play on their circuits. The lobby settings payload/install and host publish paths above implement custom friend-race sharing. These statements are stale; this lane did not test a network session.
- `codec.js:107–111` describes the registry fraction sanitizer as rounding up to and keeping 1.0. Actual `custom-tracks.js:46` uses modulo 65535 after rounding, so that result wraps to 0; props use the same wrap. The decoder's quarter-step handling still serves the separate full-lap width sentinel (`HWZ_FULL_END`). Comment should distinguish legacy explanation from current behavior.
- `validate.js:7` describes an 8% grade cap. Actual limits at lines 20–21 gate red at 15% and advise at 8%; the following detailed source comment already explains this fleet-based policy. `stamps.js:16` says the validator reds below the 15 m hairpin floor, while validator radius red is 9 m and 15 m is amber. Stamp minimum 15 m is intentional authoring policy, not the validator gate.
- `designer.js:7` says preview is never mid-drag. Canvas explicitly handles an earlier edit's scheduled preview landing mid-drag (`canvas.js:729–732`), retaining stale-road display after a moved drag. The stronger header statement should say a drag commits its edit on release.
- `insight.js:286–287` promises START FROM produces 60–120 points. The main trace only searches epsilon when above 120 and does not enforce a 60-point minimum; the alternative authored-path fallback does enforce 60–120. This is an upper-target heuristic, not a universal output invariant.
- `designer.js:1300` calls shareCode an APXT1 code and `:1414` describes only bare APXT1 imports. Actual codec emits/accepts APXT2 for props. The codec header already documents both versions.

## Limits and hand-off

All scoped source bodies are covered; runtime behavior, touch gesture quality, race placement, compression compatibility, terrain appearance, network delivery and test suites were not exercised. Pure helper APIs generally assume their internal caller's valid non-empty arrays; sanitizer/codec/validator are the hostile-input seams, so do not infer every exported geometry helper is defensive. Static LSP can miss factory instances, callbacks, HTML and conditional receivers; the screen composition and selected external consumers were read to supplement it. No dead-code claim is made.

No browser, source fix, commit or push was performed. Parent owns documentation integrity checks and integration with the broader project map. Any follow-up should edit comments/copy only after preserving these separate policy thresholds and compatibility sentinels.
