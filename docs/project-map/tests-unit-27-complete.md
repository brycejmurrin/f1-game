# Unit group 27 — complete source map

Mapped 2026-10-27 against local HEAD `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. Scope is exactly group `27` in `unit-batches.json`: 21 files, 4,754 lines. “Complete” means each assigned source file was fully read and every test declaration/assertion site mapped; it is **not a test-pass claim**. No tests, browser, or production code were executed/changed by this mapping lane. Static AST parsing was used only to index case/assertion source locations.

Read protocol: every assigned file returned as contiguous source chunks of at most 100 lines and 10,000 characters. All final partial chunks included; two combined-output truncations were repaired by individually rereading affected chunks. Ranges below are inclusive source lines; assertion spans include arguments/messages, coalesced only where adjacent. Helper assertions are called out separately. Hashes are SHA-256 of exact source bytes.

## Read ledger

| File | Full read chunks | SHA-256 |
|---|---|---|
| `tests/unit/lamp-chunks.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–573 | `15450711d7f5fe3fdf100149c21ba90c6d4af019f87b96070752a6d2eee32e84` |
| `tests/unit/lamp-density.test.mjs` | 1–100, 101–200, 201–219 | `389d9be73f7d4e4c7fb07fef9b795c1842f049064e91021a32e94cc49a45d930` |
| `tests/unit/lamp-fixture-anchor.test.mjs` | 1–100, 101–200, 201–300, 301–399 | `bf007c6b93df9d901c7036d14609e9e2eac0df344f8b3a42b1759dbe9ba65161` |
| `tests/unit/lamp-shadow-pick.test.mjs` | 1–100, 101–164 | `dfed45df539e5e939fbdc126a98ba0eac6d5c536dd4876127ef06bad98cb6e63` |
| `tests/unit/lane-preamble.test.mjs` | 1–83 | `cc81f78566ab578828a521440c5cbf6352cdd0cef337b61170bcedb4fbf1d616` |
| `tests/unit/lap-format-rollover.test.mjs` | 1–77 | `05f9c628ba43f67a95af37ef495365cb10b67ca7ca740dff94a1f83e4ebfa6db` |
| `tests/unit/launch-gate.test.mjs` | 1–100, 101–150 | `921a3ae2747f9cb17eb363ac437c70ab895983153cfaacd404ba66256ad78c31` |
| `tests/unit/layers-anyopen-memo.test.mjs` | 1–92 | `d0591ab5a35e06b3016d1939869f2cb9a52f6728ca4f7844780475d3cc092a6d` |
| `tests/unit/layers-nav-memo.test.mjs` | 1–100, 101–111 | `1d1dd232cc762ae95a68b7e1768fd357f73b1bfe22e2cef11edd3168607ba2a4` |
| `tests/unit/lazy-audio-firstbind-vm.test.mjs` | 1–100, 101–195 | `27351025e84272590b4f5092a28e0c5a023ef79aa92f75b5482c66b19c4019e4` |
| `tests/unit/lazy-audio-yield.test.mjs` | 1–100, 101–200, 201–256 | `a12e6c45de71419dc4096f52cf9a2aefe2e9dc1768a5f37652f86f7eafca94de` |
| `tests/unit/lazy-bundles-prefetch.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–443 | `7c52dbd6284782d60bcb8a46cd07cfc85dca5aaa88074181e4246ea077259c1d` |
| `tests/unit/lazy-race-geom-warm.test.mjs` | 1–57 | `503275f0b6ad76785813ce074e8dd98aad54a40a924eacc5037db3b924ae1091` |
| `tests/unit/lazy-track-build.test.mjs` | 1–100, 101–117 | `92903088786f1d8612b21b2884cc323d21b000d56f418b90360904e47e1deb25` |
| `tests/unit/legend-parts-seed.test.mjs` | 1–100, 101–200, 201–294 | `3ced0baeb0eea26875dfe54c1e27540cd6da257c8ce9db85103bf97d9ee50918` |
| `tests/unit/legends-team.test.mjs` | 1–100, 101–200, 201–293 | `c3779b32e6d1f38be9fc42fde7fac16d0ba836311b1700d335f10e34ff308e45` |
| `tests/unit/legends.test.mjs` | 1–100, 101–200, 201–285 | `88b63b24e7a1c4237c019cd31cc8ba8e374832aee7788d9ddea7f0a9b6e83d37` |
| `tests/unit/lexical-window-guard.test.mjs` | 1–57 | `6aca79a38d8a164642963f3367329cf39fac6f1c28be1876f3c48f9fe44ef2a5` |
| `tests/unit/light-grid.test.mjs` | 1–100, 101–200, 201–300, 301–400, 401–500, 501–600, 601–700, 701–730 | `444bd359c2c03aba09eef8c157d518e91dcb4681ab4fd52bd58c44427aa7f085` |
| `tests/unit/light-presets-extreme-knobs.test.mjs` | 1–98 | `feb6a0827239412205484887ec799d2de829db9732ca445806ec4b44d3decf01` |
| `tests/unit/light-presets-knob-range.test.mjs` | 1–61 | `0620c94e564db10825246f5674ba646daacc796f8ccf3dfedc942dc9fde95719` |

## Production navigation and seams

Read `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`. Local `bash tools/mcp/lsp-mcp.sh` was used to avoid conflating a connected remote F1 checkout with this source snapshot. Successful outlines: LampChunks (6 exports), ChunkBins (10), TrackLights (2), FrameLights (7), ShadowPass.create, UiLayers functions, LazyBundles.create, CustomTeam.create, Legends (13), CarDraw, ScriptLoader (3), StartLights, Teams, LightKnobs and LightStore. Definitions confirmed LampChunks.resolve → `lamp-chunks.js:159` (GLX caller/export), Legends.team → `legends.js:281` (custom-team caller/export), Legends.parts → `:478`, Teams.isReal → `teams.js:299`, ShadowPass.create → `shadow-pass.js:16` and CarDraw.create → `car-draw.js:33`. TrackLights.buildTrackLights and DataTelemetryModel.summaryTime/signed returned module-file fallback definitions; export/caller coverage for those lookups is explicitly unverified.

Bounded production reads inspected LampChunks:15–313, TrackLights:85–384, LazyBundles:535–658 and 761–834, CustomTeam:65–139, UiLayers:278–377, FrameLights:659–730, ShadowPass:513–612, TLX lamp grid:6096–6172, CarDraw:976–1010, Legends:224–380 and 471–497, lane-preamble:31–120, launch-gate:43–174 and Python hook:1–75. The report does not imply full reads of every production/helper file.

| Target key | Production source / boundary |
|---|---|
| LC | js/render/shared/lamp-chunks.js:22–309 (capFor/buildTable/resolve/buildGrid/blitGrid) |
| TL | js/lighting/track-lights.js:85–437 (radius, post remap, density and record bake); js/lighting/lighting.js façade; js/lighting/knobs.js:27–253 |
| ANCH | tools/track/verify-track.cjs buildContext → js/track/tracks.js + circuit/scenery roster; js/lighting/track-lights.js:206 onward; js/race/start-lights.js:52 onward |
| SP | js/lighting/frame-lights.js:659 onward (lampLum/rank/warm-up) → js/render/shared/shadow-pass.js:513–559 (lamp selection) |
| PRE | tools/ci/lane-preamble.mjs:31–124 → tools/ui/layout-audit.mjs --list; tools/ci/tooling-fast.mjs TOOLING_FAST_USAGE; tools/ci/wait-for.mjs |
| FMT | js/data/telemetry-model.js:249–262; js/perf/metrics-overlay.js:487; js/race/real-replay.js:229; js/editor/designer.js:108; js/ui/results-sheet.js:562 |
| LG | tools/ci/launch-gate.mjs:43–174; .claude/hooks/launch-gate.py:33–75; .claude/settings.json PreToolUse |
| UI | js/ui/layers.js:198–220 (top), 278–384 (memo/observer/anyOpen/navOpen) |
| AUDIO | js/core/lazy-bundles.js:426–658,819–836 → js/game.js audio-ready/gesture wiring; js/audio/{engine,panel,driving-cues,stub}.js; js/ui/platform-session.js |
| LAZY | js/core/lazy-bundles.js:46–83,90–132,159–251,288–380,605–658,679–697,732–836; js/core/script-loader.js:45–102 onward; js/track/build-client.js; tools/manifest.cjs lazy rosters |
| WARM | js/car/car-draw.js:882 onward (warmCarAssets),976–1010 (warmFlaps/player warm) |
| BUILD | tools/manifest.cjs LAZY_TRACK_BUILD/EDGES/FULL/TRACK_VM → js/core/lazy-bundles.js:178–251; js/game.js:1964 loadTrackStepped; js/agent/apex.js lazyTrackEnsure |
| CUSTOM | js/career/custom-team.js:83–150 (seat/parts policy), customization preview and logo lifecycle in same create; js/data/legends.js:281–374,478–487; js/core/store.js getStored; js/data/garage-defaults.js |
| LEG | js/data/legends.js:43–207 roster,224–243 ratings,281–374 team/seat,399–487 period/year/parts,492–493 livery; js/car/parts.js; js/data/teams.js:272–299; js/game.js:1485 seatsFor |
| LEX | js/**/*.js classic script lexical/global exposure convention (scan-wide production target; not one export) |
| GRID | js/lighting/knobs.js:27–253; js/lighting/presets.js map; renderer source/upload/shader families and shell ranges listed below |
| PRESET | js/lighting/knobs.js:27–253 TUNE_DEFS ↔ js/lighting/presets.js window.LightPresets; js/lighting/profiles.js applies/clamps values |

Fixture limits shared across the group: `seedLog` evaluates real Log with const→var; `absSrc` changes VM diagnostic filenames only; `fnSource` extracts by declaration/closing indentation and `symbolSource` searches game.js plus manifest-created modules. `fake-audio-vm.cjs:1–36` records graph calls/state but rejects decoding and produces no sound. `seed-save-migrate.mjs:1–31` installs real migration code. `game-vm.cjs:1–85` documents inert DOM/renderer, manual frames/timers, script evaluation and Map storage; `car-draw-vm.mjs:1–100` documents real CarDraw over stub geometry/Parts/renderer. `tools/track/verify-track.cjs` and `tools/car/parts-sweep.mjs` are real helper entrypoints referenced by the tests, not independent assertion outcomes.

## lamp-chunks.test.mjs

Fixture 14–36: real LightBudget + Frustum + LampChunks via Function; stride-15 Float32 lamp records and AABBs. Seeded random/stable-sort oracle 73–106; TLX block extraction/counting shims 446–486; real ChunkBins 528. Helper assertion: 448 (block must exist).

Limits: Algorithm/byte/layout checks run without a renderer. Drag cost counts buildTable calls, not wall time. TLX block lifting is brace/string-format sensitive and has stub lit uploads; no GPU evidence.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| selection is nearest-first among lamps whose radius reaches the AABB | 38–51 | 50 | LampChunks.buildTable :33–90 | Ranks reaching lamps by squared distance to box; zero radius and out-of-radius records are excluded. |
| the cap formula: full at the ends, proportional between, floored at 8 | 53–60 | 54–59 | LampChunks.capFor :22–24 / LightBudget.CHUNK | Pins shared cap 24, proportional rounding and floor 8; off-knob is represented as full cap at this layer. |
| buildTable truncates each chunk's list at the knob's cap | 62–70 | 67, 69 | LampChunks.buildTable :33–90 | 30 reaching records yield full/half prefixes of 24/12. |
| bounded selection matches the stable full-sort lists and packed bytes | 72–108 | 102–104, 106 | LampChunks.buildTable :33–90 | Seeded 180 lamps plus NaN/negative/Infinity ties match independent full-sort lists, bytes, counts and offsets across seven knobs. |
| concat/offsets/counts are exactly the per-chunk lists back to back | 110–130 | 118–119, 122–125, 128–129 | LampChunks.buildTable :33–90 | Three boxes including unreachable box preserve packed offsets, counts and contiguous index lists. |
| resolve bakes once per lights identity, and re-caps rather than re-baking | 132–142 | 136, 138, 141 | LampChunks.resolve :159–169; _snap/_moved :141–157; _reCap :101–118 | Cache identity repeats; changed cap changes table and equal-content new lights identity invalidates. |
| resolve re-bakes when the SAME array is refilled with a different lamp set (L5) | 148–170 | 157, 160–161, 165, 168–169 | LampChunks.resolve :159–169; _snap/_moved :141–157; _reCap :101–118 | Same mutable buffer shrinking from five to two lamps and changing a radius rebakes without stale indices. |
| resolve does NOT re-bake for a colour-only refill (flicker moves every frame) | 172–178 | 177 | LampChunks.resolve :159–169; _snap/_moved :141–157; _reCap :101–118 | RGB-only mutation preserves cached object, separating frame flicker from selection geometry. |
| empty inputs stay well-formed | 180–187 | 182–183, 185–186 | LampChunks.buildTable :33–90 | Empty lamp set and empty chunk set retain valid empty arrays. |
| the bake is deterministic — two builds of the same triple agree byte for byte | 189–198 | 196–197 | LampChunks.buildTable :33–90 | Repeated deterministic synthetic bake matches concat and offsets; other fields are not compared here. |
| a knob move inside one cap does not re-bake at all | 206–215 | 210, 213–214 | LampChunks.resolve :159–169; _snap/_moved :141–157; _reCap :101–118 | Five slider positions sharing one cap return identical table object. |
| every cap re-caps to a table byte-identical to a fresh bake | 217–243 | 232–235, 237–238, 241–242 | LampChunks.resolve :159–169; _snap/_moved :141–157; _reCap :101–118 | 1,001 knob samples match fresh builds in all packed fields and lists; distinct cap count stays 10–17. Comment about fresh identity is stale: actual lights identity is reused. |
| a full drag costs ONE bake, not one per input event | 245–265 | 263–264 | LampChunks.resolve :159–169; _snap/_moved :141–157; _reCap :101–118 | Instrumented source records exactly one buildTable for full drag; export remains callable. This is operation-count evidence. |
| buildGrid places each chunk's (offset, count) at its own cell | 281–298 | 286, 291–293, 296–297 | LampChunks.buildGrid :212–275 | 3×3 occupied extent places correct pairs at sparse cells and leaves holes zero. |
| buildGrid survives a chunk with no cell, and an empty set | 300–314 | 306–307, 312–313 | LampChunks.buildGrid :212–275 | Unaddressed chunk does not skew extent; empty input returns bindable 1×1 two-value grid. |
| buildGrid round-trips a real bake through the cell mapping | 316–332 | 329–330 | LampChunks.buildGrid :212–275 | Two real chunk bakes round-trip their index slices through cell offsets. |
| blitGrid lands cell (x, z) on texture row z, not on a linear offset | 349–370 | 361, 365–367 | LampChunks.blitGrid :299–309 | 3-wide rows blit correctly into 8-wide texture storage; checks both offset and count lanes. |
| blitGrid refuses a grid the texture cannot hold, and leaves it untouched | 372–380 | 376–379 | LampChunks.blitGrid :299–309 | Oversized width/height and null grid return false and preserve destination sentinel values. |
| buildGrid merges the lamp lists of chunks that share a cell | 389–412 | 404–405, 408–409 | LampChunks.buildGrid :212–275 | Co-located road/prop boxes union unique reaching lamps under both orders and preserve original chunk ranges. |
| a merged cell respects the table's cap | 414–431 | 427, 429–430 | LampChunks.buildGrid :212–275 | Capped shared-cell union includes both contributors and no duplicates; does not specify global distance ordering. |
| TLX lamp grid: a PER-CHUNK LAMPS drag bakes once and re-grids only per cap | 488–518 | 496–498, 506, 509–510, 514 | js/render/three/tlx.js:6096–6172 → LampChunks.resolve/buildGrid | Lifted actual TLX block must enable upload, keep one bake across drag, re-grid on cap crossings and rebake changed chunk set. |
| ChunkBins key: gx * 4096 + gz over 72 m cells biased by 1024, and it round-trips | 530–541 | 531–535, 538–539 | js/render/shared/chunk-bins.js:19–29 | Pins 72m default, floor for negative coordinate, bias/stride and representative key inverse pairs. |
| ChunkBins.bin: centroid cells, vertex AABBs, emission order, absolute indices | 543–560 | 553, 555–559 | ChunkBins.bin/binSteps :36 onward | Three triangles pin first-seen cells, absolute typed indices and full vertex AABBs even across cell boundary. |
| the GLX and TLX chunked builders bin through ChunkBins (no private copy of the key) | 562–573 | 569, 571 | js/render/{glx/chunked,three/tlx-chunked}.js; webgpu/wgx-chunked.js exemption | Source scan bans private key copies except WGX allowlisted file and requires GLX/TLX shared bin call; textual architecture guard. |

## lamp-density.test.mjs

Fixture 13–61 VM-loads LightBudget/knobs/track/frame/façade after seedLog; 400-node synthetic ring. Ring records 114–136 provide known 5.5m pitch and compare density-2 extras against density-1 positions.

Limits: Synthetic CPU lighting and textual registry guards; no scenery renderer or visual energy assertion. count comparisons include constant downlights; targeted ring tests subtract/filter them.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| LAMP DENSITY densifies and thins the light set vs density 1 | 63–71 | 68–70 | TL | Density 2 increases and 0.5 reduces real baked record count relative to density 1. |
| densify inserts into gaps shorter than 2× stride (the MCP monza no-op) | 73–107 | 101, 105–106 | TL | Explicit ds=22/span=2 fixture confirms target stride 1 and inserted records; comment incorrectly calls it strictly inside old dead band. |
| a post spacing inside (gap, 2*gap) still gets a fill lamp per gap, wrap-around gap included | 138–147 | 145–146 | TL | Ds=5.5/span=3/target=2 yields 20 fill records including circular final gap. |
| a gap exactly one target wide is left alone | 149–154 | 153 | TL | Exactly target-wide gaps add no extra lights. |
| fill lamps alternate sides, carry no halo, and the wrap-around gap is filled | 156–168 | 162–163, 167 | TL | Two-post ring produces 28 fills, all halo-free, with first two lateral signs alternating. |
| a fill lamp never copies the signal kind or an aimAt from its neighbour | 170–186 | 179–181, 185 | TL | Signal or aimAt neighbors cannot taint synthetic fills; ordinary posts still differ as an anti-vacuity check. |
| LAMP DENSITY below 1 keeps every gap-th post and wraps like a ring | 188–197 | 194–196 | TL | Density 0.5 retains first then each target-spaced post count after subtracting fixed extras. |
| dressingExcluded lamps aliases match floodlights/lighting rules | 199–206 | 203–205 | js/track/scenery/build-props.js dressingExcluded/LIGHTING_KINDS | build-props source must query lamps and treat lamps/floodlights/lighting as one exclusion family. |
| street posts and flood banks share one lampPosts bake, one LAMPS tab | 208–219 | 210–212, 215–218 | js/lighting/track-lights.js + js/lighting/knobs.js LAMPS | One buildTrackLights and LAMPS group replace separate flood builder/tab; runtime definitions include >=20 lamps and expected controls. |

## lamp-fixture-anchor.test.mjs

Fixture 53–84 uses verify-track.buildContext, real lighting modules and StartLights; cached survey 191–284 builds selected Tracks.LIST once (APEX_CIRCUITS may narrow). Geometry occlusion helper 96–142 throws on missing props; centreline throw sampling 165–172; shared diagnostics carry thresholds. Helper assert 147 validates requested circuit.

Limits: Survey is CPU geometry/data evidence; halo anchoring uses registered positions, not pixel visibility. Pool reach is radius-only, not cone/energy/shadow brightness. Buried check uses first 2m toward one grid eye and propsGeo only (instanced batches absent). Dark-run scan is linear and does not merge end/start runs.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| no circuit paints a lens halo with no fixture under it | 286–291 | 287–290 | ANCH | No positive-glare record lies over 1m from a registered lamp lens; survey predicate 208–217. |
| every registered fixture's pool reaches the road | 293–299 | 294–298 | ANCH | Every baked record that matches a fixture reaches aimAt or every-other-node centreline sample by radius; survey predicate 220–237. Missing/unbaked fixture itself is not counted. |
| no circuit races through an unlit stretch of road | 301–320 | 315–319 | ANCH | At least 95% centreline nodes covered by a radius and no measured dark run >60m; survey 242–258, not photometric illumination. |
| every circuit's start lamps hang over its grid, on a gantry at the line or the engine's start gate | 322–341 | 329–331, 338–340 | ANCH | Five lamps must be near start (min of 40m and 3% lap), 4–16m above, unburied; all selected circuits counted and whole fleet exercises both host classes (260–280). |
| a circuit that dresses gantries stands one over its start line | 343–349 | 346–348 | ANCH | Circuit with any central gantries needs nearest within 40 arc metres of line; no-gantry circuits pass by design (264–269). |
| the start-gantry downlights stay fixture-less AND invisible | 351–373 | 364, 366–368, 372 | ANCH | Last three Bahrain records remain unparented, zero glare/volume and above node-zero road; proves invisible emitters retain positions, not measured pool brightness. |
| the pit canopy luminaires throw at the working lane, not at the racing road | 375–399 | 385, 392, 394–396 | ANCH | Bahrain/Silverstone six canopy lights each match fixture, energy 150–600, downward direction <-0.9 and radius <=20m. |

## lamp-shadow-pick.test.mjs

Fixture 24–69 real frame lighting, knobs, M4 and ShadowPass in VM with manual clock and recording gfx. Two 40m-radius/18m-height floods with aging/healthy index layouts; rad-8 washer distractor; settle ten seconds then count lamp x handovers.

Limits: No depth raster/GPU or perceptual flicker measurement. Handover counts record full rebuilds only; synthetic two-flood geometry and tier 0.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| the shipped LAMP FLICKER is on, so the parked case below exercises it | 71–75 | 74 | SP | Shipped flicker default must be positive and equal current LT value so parked test is meaningful. |
| parked within 1.2 m of the midline of two floods: at most one handover in 120 frames | 77–88 | 84–85 | SP | Two layouts across offsets -1.2..1.2m each build map and hand over at most once during 120 frames. |
| driving from one flood to the other hands over once, past the midline | 90–107 | 95, 104–106 | SP | 4s drive from -20 to +20 flood hands over exactly once beyond +0.5m and ends on destination. |
| a lamp that leaves the candidate set is replaced at once | 109–118 | 114, 117 | SP | Replacing source set with only right flood immediately switches map despite hysteresis. |
| frame.lampLum is each lamp's level without the flicker; the warm-up stays in it | 120–135 | 128, 130–131, 133–134 | SP | 12s sample pins one unflickered luminance per record, steady baked value, continuing RGB flicker and initial warm-up dimming. |
| with LAMP FLICKER cranked past the 20% hysteresis, the pick still does not trade (scores use lampLum) | 138–152 | 150–151 | SP | Maximum flicker must exceed 20% emitted swing while stationary picks remain stable; distinguishes lampLum scoring from hysteresis alone. |
| a tail-light or a small mover nearer than every flood never takes the lamp shadow map | 154–164 | 163 | SP | Nearer rad-8 mover and rad-20 tail record cannot win: radius filter plus tail range leave only flood. |

## lane-preamble.test.mjs

Imports real lane-preamble and TOOLING_FAST_USAGE; run/real wrappers 17–19 spawn Node CLI and layout-audit --list (would happen only if executed). Literal small catalog tests parser boundaries.

Limits: CLI/string and catalog tests; no browser audit actually performed by these assertions. Paths in printed instructions are validated only for existence/flag substrings.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| parseCatalog reads the real layout-audit catalog, including names followed by one space | 21–29 | 23–28 | PRE | Real list must expose >=40 screens, >=10 viewports and named regressions; empty and one-space synthetic catalogs parse correctly. |
| checkNames accepts exact names and prefix wildcards, and names the nearest valid one for a typo | 31–39 | 33–38 | PRE | Exact/prefix-wildcard names accepted; typo diagnostics, unknown wildcard and missing lists rejected with specific messages. |
| buildPreamble gives the exact commands, redirects the run, bounds the read, and steers to lsp_outline | 41–53 | 44–52 | PRE | Generated block contains bounded commands, redirection, output guidance and correct LSP name; scale/default validation and <1500 chars. |
| the CLI prints the block for valid names and exits 2 with ERROR for a typo, without a stack | 55–68 | 57–59, 61–64, 66–67 | PRE | CLI valid catalog names exit zero; typo/missing screen exit 2, stdout ERROR and empty stderr; --list includes desktop narrow. |
| --core prints the WORKING RULES alone; its scripts and flags exist; a survey block carries it too | 70–83 | 72–75, 78, 80–82 | PRE | Core under 2000 chars references existing tools/flags, waiter regex matches verdict, --core returns exact text and survey output appends it. |

## lap-format-rollover.test.mjs

model 21–26 loads real M4 + telemetry model; evalFn 27 evaluates fnSource/one-line extracted formatters in minimal VM. Results sheet is source regex only.

Limits: Finite representative examples, not exhaustive rounding or localization. Metrics/replay/designer functions are extracted away from UI; PB delta validates syntax rather than DOM output.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| telemetry summaryTime rounds before it splits | 29–36 | 31–35 | js/data/telemetry-model.js:249–255 summaryTime | Centisecond summary rolls 119.996/59.999 to next minute, normal padding remains, negative time yields dash. |
| telemetry signed() takes the sign from the rounded value | 38–45 | 40–44 | js/data/telemetry-model.js:257–262 signed | Rounded signed deltas normalize tiny negative to +0.00 and preserve true negative/positive rounded values. |
| the metrics overlay clock rounds before it splits | 47–53 | 49–52 | js/perf/metrics-overlay.js:487 fmtTime | Millisecond metrics clock rolls seconds to next minute and null becomes dash. |
| the replay's lap clock rounds before it splits | 55–62 | 57, 59–61 | js/race/real-replay.js:229 fmtLap | One-line replay formatter must exist, roll 119.9996, format normal lap, reject zero. |
| the track designer's estimate rounds before it splits | 64–71 | 66, 68–70 | js/editor/designer.js:108 fmtLap | One-line designer formatter must exist, roll decisecond estimate and reject zero. |
| the results sheet's PB delta takes its sign from the rounded value | 73–77 | 75–76 | js/ui/results-sheet.js:562 shown delta | PB delta source rounds to three places before sign and formatted suffix; no runtime sheet exercise. |

## launch-gate.test.mjs

Fixture 19–29 synthetic saved session envelope, temporary directory, real Python hook child with CLAUDE_PROJECT_DIR, structured create_session payload; no remote create_session. CLI child uses isolated receipt root; fixed clock for pageVerdict.

Limits: Offline gate/receipt behavior only. Tests do not authenticate a real MCP response, prove quota truth, launch a session or validate every internal-exception path. Temp paths/owner-3811/PR3811/session_X are test identities, not repository resources.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| verdict: allowed passes, a warning refuses, a typed override passes and keeps the quote | 31–42 | 32, 34–35, 37–41 | LG | Allowed passes; warning refuses; typed override preserved; absent quota is unknown/refused and non-JSON throws. |
| CLI writes the receipt: exit 0 on allowed, 1 on a warning, 2 on a missing page or a bare --override | 44–61 | 49–50, 52–57, 60 | LG | CLI creates receipts with ok/refused status, supports override argument orders, handles missing/bare inputs, and stale page defeats override. |
| hook: denies with no receipt, a refused receipt or a stale one; passes a fresh ok receipt | 63–83 | 65, 67, 71, 73, 75, 77–78, 80, 82 | LG | Hook denies missing/refused/stale/corrupt/unproven receipts and deploy outcome branch, accepts fresh valid/override receipt. |
| hook fails open on its own errors and ignores other tools | 85–92 | 88–91 | LG | Malformed hook JSON exits zero/silent, unrelated tool and array payload pass; this samples fail-open input handling. |
| settings.json wires the hook on create_session without onFailure block (fail open) | 94–100 | 97–99 | LG | PreToolUse wiring matches create_session exactly and no hook uses onFailure block. |
| audit 4 G13: a page needs its own timestamp, no hand-written mtime skew; the receipt is tied to the page and the launch | 104–150 | 107–109, 113–119, 123–125, 131–132, 139, 141–145, 147–149 | LG | 5s skew, timestamp extraction, absent/future/hand-touched refusal and both hook wrapper formats; CLI receipt hashes exact page, records launch/lane/PR and rejects invalid flags. |

## layers-anyopen-memo.test.mjs

boot 13–52 VM-loads whole layers.js over Map elements, counted style/rect, queued MutationObserver records and manual clock. overlay/rotate are non-gating; settings/pause gating.

Limits: Synthetic visibility/layout and observer behavior only; no actual CSS, browser mutation delivery, keyboard or focus traversal.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| anyOpen reads layout once per window, not once per call | 54–60 | 56, 58–59 | UI | First anyOpen computes false; next twenty calls preserve style/rect counters. |
| opening a gated layer is seen on the very next call | 62–68 | 64, 67 | UI | Showing settings with pending mutation makes next anyOpen true. |
| anyOpen consuming the dirty flag does not leave navOpen on a stale answer | 70–77 | 72, 75–76 | UI | Opening non-gating overlay keeps anyOpen false but invalidates navOpen cache so it returns true. |
| a record pending at recompute never turns the fresh answer into undefined/null | 79–92 | 86, 88, 91 | UI | Pending records during cold/expired top recompute preserve exact null; overlay recompute yields exact true, avoiding undefined/null memo-drain leak. |

## layers-nav-memo.test.mjs

boot 13–51 extends synthetic layers VM with counted querySelectorAll, pause candidate list, manual mutations/clock and observed set.

Limits: Counter-based memoization proof, not elapsed CPU measurement or real browser visibility. Test expires at +1000ms, so exact 250ms boundary is not pinned.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| navOpen reads layout once per window, not once per call | 53–60 | 55, 57–59 | UI | navOpen does initial rect/style reads and none for twenty repeated false answers. |
| a layer opening is seen on the very next call (observer record drops the memo) | 62–70 | 64, 67, 69 | UI | Pause opening/closing mutations are reflected immediately on next navOpen. |
| the zero-size wrapper rule still holds: a child that is shown opens the layer | 72–79 | 76, 78 | UI | Visible child can open a zero-size overlay wrapper. |
| the memo expires on its own, and the layers are watched | 81–89 | 85, 87–88 | UI | Unreported rotate visibility remains cached then expires at +1000ms; all three special layers are observed. |
| top() is memoised like navOpen(): per-frame pad polls do not re-query (audit4 UB2) | 91–111 | 93, 95–96, 99, 101, 103, 105, 107, 110 | UI | Twenty top calls avoid queries/style; pause mutations update immediately, unreported change expires, detached cached answer re-queries. |

## lazy-audio-firstbind-vm.test.mjs

18–29 boots real game-vm with carMeshes:false plus fake-audio-vm; window and document pointerdown routes triggered, settle and turns flush asynchronous scripts. Later cases override native flag, capture real panel/music, driving cue ticking and create wrappers.

Limits: Full-game VM integration with inert renderer/DOM and fake AudioContext (no decode/real acoustic output). Does not prove iOS activation policy; suspended context is manually simulated. Test wait limits are not load performance claims. Helper precondition assert at 22.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| first gesture + RACE with default settings has an AudioContext and a running engine | 31–41 | 34, 38–39 | AUDIO | First mouse gesture creates one context; Monza race after 300 throttle steps reports running context and engineOn. |
| the saved camera's audio mix survives the LAZY_AUDIO reinjection | 43–51 | 48–49 | AUDIO | Default saved helmet mode 19 restores onboard engine mix after lazy bind. |
| desktop shell binds LAZY_AUDIO at boot without a title gesture | 53–70 | 64, 67–68 | AUDIO | Native desktop marker starts one running context without title tap. |
| web boot still waits for the first gesture before creating an AudioContext | 72–80 | 77–78 | AUDIO | Web boot after eighty event turns keeps stub and creates zero contexts. |
| the first SOUND click while the bundle loads starts the title music (H22) | 82–114 | 106, 110–112 | AUDIO | Saved sound-off click on stub becomes true, real startMusic is called and context exists after bind. |
| the saved AUDIO DRIVING CUES level survives the LAZY_AUDIO reinjection | 116–127 | 124–125 | AUDIO | Saved cue level 7 survives bind and 40s Monza throttle simulation emits at least brake tone or corner call. |
| an activation-triggering pointerup unlocks a suspended context once the bundle landed (audit4 UB1) | 129–156 | 141, 148–149, 151, 154 | AUDIO | Touch pointerup resumes manually suspended context once; subsequent click/untrusted pointerup does not re-init after disarm. |
| a throw in onAudioReady retries only the part that threw (audit4 F1) | 158–195 | 187, 191–193 | AUDIO | AudioPanel.create forced throw retries panel exactly twice total while RadioVoice/Announcer stay one call each, avoiding listener stacking. |

## lazy-audio-yield.test.mjs

bootEnsure 16–82 real ScriptLoader/LazyBundles over fake roster/script insertion, activation, scheduler and timer bag; second radio harness 141–224 records pre-ready levels. Engine scripts are replaced by tiny synthetic objects.

Limits: Source structure plus synthetic scheduling; no actual paint/frame yield, network, AudioContext or native panel. Claimed before-onAudioReady radio order is not directly sampled inside ready callback; checked at completion.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| ensureAudio source yields before load and before onAudioReady; skips under game-vm | 84–105 | 86–100, 102–104 | AUDIO | Source pins paint/task yield placement, scheduler/timer fallback, game-vm bypass, prefetch-only idle and gesture/keyboard load triggers. |
| await ensureAudio resolves after onAudioReady; yields once on real UA | 107–120 | 112, 114–119 | AUDIO | Two ensure calls share promise; ready fires once before success, real stub replaced and activated init runs; recorded sched/timer/sched order. |
| game-vm UA skips yields but still completes ensureAudio | 122–132 | 129–131 | AUDIO | VM-marked UA completes bind/ready with no yield records. |
| restoreOnEngine does not init without user activation | 134–139 | 137–138 | AUDIO | Without hasBeenActive ensure completes but init count stays zero. |
| restoreOnEngine source restores volRadio alongside volMusic and volSfx | 226–233 | 229–232 | AUDIO | Restore source reads music/SFX/radio saved values and applies radio.setVolume. |
| saved volRadio reaches G.radio when the real engine binds, before onAudioReady | 235–244 | 238–243 | AUDIO | Stale radio 0.8 becomes saved 0.15 by completion and ready ran once. |
| lazy engine restores latest focus choice before context init and before native panel binding | 247–256 | 252–255 | AUDIO | Focus changes from 4 to 12 while load pending; latest applied focus is recorded before context init and ready completes once. |

## lazy-bundles-prefetch.test.mjs

world 37–76 runs real script-loader/lazy-bundles; scripts either actual manifest sources or synthetic body, failOnce errors, injection/log/eval-error recording. boot 313–354 captures idle/Worker/prefetch with custom resident Monza; drain manually runs callbacks.

Limits: No browser network/CDN/cache/Worker execution. fake <script> catches evaluation errors but still onloads; explicit evalErrors assertions cover only selected cases. fixture-agent-a.js / fixture-agent-b.js are synthetic script IDs (not repository files).

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| raceAssets: a circuit payload that cannot load never reaches the unhandled-rejection overlay | 78–94 | 92 | LAZY | Failed title circuit prefetch must not escape as unhandled rejection during sampled microtask/timer window. |
| ensureRaceSession: a partial failure is repaired by the next call, and the hook runs once | 96–120 | 107–115, 117, 119 | LAZY | Actual manifest race-session partial engineer failure returns false without hook; retry repairs only missing script, hook runs once and no eval errors. |
| `ensureNet: a failed ${failing} retries without re-injecting the script-level consts that landed` | 123–135 | 131–134 | LAZY | Two generated cases: lobby.js and qr.js initial failures repair only missing file; const-bearing landed net scripts inject once and evalErrors stay empty. |
| ensureAudio: a panel.js that failed after engine.js went real is loaded by the next call | 138–162 | 154–161 | LAZY | Engine landing without panel returns false/no hook; next call injects panel only, fires hook once and memoizes complete bundle. |
| loadAgentSurface: a failed load does not latch; a complete one is memoised | 164–181 | 175, 177–178, 180 | LAZY | Agent b failure retries b while landed a stays single injection; third complete load does not re-inject. Bind count checked only after first call. |
| ensureAudio: a throwing onAudioReady resolves false, clears the memo, and is retried | 185–202 | 193–195, 197–201 | LAZY | Thrown audio-ready hook resolves false/logs, retries without engine re-injection, then succeeds/memoizes once hook returns. |
| ensureRaceSession: a throwing onRaceSessionReady resolves false and the next call runs the hook again | 204–220 | 212–214, 216–219 | LAZY | Thrown race-session hook resolves false/logs; retry succeeds and hook latches only on return. |
| ensureDataHub: a throwing DataHub.init resolves false and a later tap retries | 222–233 | 228–232 | LAZY | Thrown DataHub init resolves false/logs; next call retries init without re-injecting const script. |
| ensureNet: a throwing createNetwork / wire resolves false and a later call retries | 235–249 | 242–243, 245–248 | LAZY | Thrown wire resolves false/logs, retries then memoizes successful connection. |
| ensureScenery: a failed fetch resolves false after one attempt; the next call fetches again; a landed one is true | 255–278 | 263, 269–272, 274–277 | LAZY | Scenery miss attempts once per ask, no negative cache; after resident closure, future asks do not fetch. |
| ensureScenery: the scenery closure is requested beside the circuit payload, not after it | 283–307 | 296–297, 302, 305–306 | LAZY | Circuit payload and scenery are requested concurrently; post-payload path joins held closure request, no duplicate fetch. |
| a player's title idle spawns no track-build Worker (R3-ASYNC-2) | 361–366 | 365 | LAZY | Ordinary player idle must construct zero track Workers. |
| the agent surface still warms the worker at title idle | 368–373 | 372 | LAZY | Agent-enabled idle constructs one warm Worker; no worker work is evaluated. |
| the idle audio prefetch asks for the content-hash key the loader will inject (R3-PHONE-8) | 375–386 | 379–381, 385 | LAZY | Content-hash map yields identical prefetch/inject URL; absent entries and dev shell fall back to build 4100. |
| a malformed or hostile map falls back to the build key | 388–395 | 393 | LAZY | Path-traversal-like value, malformed JSON and number-valued hash map fall back to build 9. |
| awaitPackSettled: yields until the pack uploads, then resolves true | 397–408 | 406–407 | LAZY | Pack wait crosses at least two injected yields until uploaded state then returns true. |
| awaitPackSettled: respects stale and timeout without hanging | 410–427 | 420, 426 | LAZY | Stale flag or zero timeout stops unsettled pack wait with false; no positive timeout duration tested. |
| startRace awaits the LAZY_RACE light presets before its first applyRaceSettings | 429–443 | 435, 438–439, 442 | LAZY | Source requires preset await before first race-settings apply; runtime surface exposes ensureLightPresets, but this case does not run a race. |

## lazy-race-geom-warm.test.mjs

carDrawVm real draw seam and real team roster; test supplies two flap descriptors and counting CarMesh functions, recreates real CarDraw and warms 22 cars.

Limits: Records calls rather than building real flap GPU meshes; confirms 44 set + 44 element requests and >=22 hinge solves, not frame-time improvement.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| race warmFlaps path mints flap set meshes for every rival | 14–57 | 54–56 | WARM | One warmCarAssets call requests closed/open sets and both individual flap elements for each of 21 rivals plus player. |

## lazy-track-build.test.mjs

Manifest and source checks plus one VM with only build-props in lazy build roster. Script append installs TrackBuildProps/TrackModels/TrackHiddenFaces stand-ins; real ScriptLoader/LazyBundles orchestrate.

Limits: Textual gates and synthetic readiness; no actual scenery toolkit evaluation or track geometry build.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| manifest pins LAZY_TRACK_BUILD off FULL and on TRACK_VM | 32–40 | 33, 35–36, 38–39 | BUILD | Exact thirteen-file build roster stays out of eager FULL, in TRACK_VM, with nonempty dependency edges. |
| ensureScenery awaits ensureTrackBuild before returning | 42–48 | 44, 46–47 | BUILD | ensureScenery source contains ensureTrackBuild and awaits its promise. |
| loadTrackStepped and lazyTrackEnsure gate on the track-build toolkit | 50–57 | 52, 55–56 | BUILD | Production loadTrackStepped source and agent lazyTrackEnsure source reference toolkit readiness gates. |
| ensureTrackBuild injects LAZY_TRACK_BUILD and marks TrackBuildProps resident | 59–117 | 112–116 | BUILD | Residency false becomes true after injection; named build-props URL requested and ensureScenery succeeds with stubbed toolkit. |

## legend-parts-seed.test.mjs

boot 29–58 VM-loads M4/Legends/CustomTeam with in-memory raw/read-default store and hook stubs; real Parts via parts-sweep.loadParts. fakeDialog 163–177 captures listeners. Fresh-install case additionally uses real GarageDefaults/GameStore/SaveMigrate over Map storage; upload case manually completes fake FileReader/Image.

Limits: Most tests have no rendered DOM/mesh; invalidation/debounce counts are effects, not visual output. Uploads have synthetic payloads and canvas. Raw vs fallback store path is covered by dedicated fresh-install case.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| an empty sheet is seeded with the picked legend's period car | 60–71 | 63–64, 67, 69–70 | CUSTOM | Missing raw sheet seeds Fangio period setup and checks torsion-bar/minimal-wing identity. |
| switching legend reseeds — you asked for his car, not the last one's | 73–80 | 77–79 | CUSTOM | Switching Fangio to Senna replaces parts with differing selected setup. |
| a re-sync of the SAME seat leaves the player's build alone | 82–89 | 88 | CUSTOM | Resync same legend preserves paid carbon brake edit. |
| boot does not overwrite a sheet saved in an earlier session | 91–98 | 97 | CUSTOM | Existing earlier-session sheet remains unchanged on initial append. |
| every legend's seeded sheet fits the garage budget | 100–112 | 105–106, 110 | CUSTOM | Every legend pick writes exact setup with finite cost <= real Parts budget. |
| boot rebuilds the SAVED legend, not legend 0: no Fangio sheet in Schumacher's paint | 114–128 | 121–123, 127 | CUSTOM | Saved Legends team/driver2 rebuilds Fangio identity/color/crest; non-Legends selection defaults to legend zero. |
| G1: syncing MY TEAM while MY TEAM is selected keeps the picked legend and its tuned build | 130–151 | 140, 145–146, 148–150 | CUSTOM | Syncing selected MY TEAM preserves prior Senna identity and tuned engine across repeated sync; no duplicate guest entries. |
| G1: with LEGENDS selected the picker's seat still wins through a MY TEAM sync | 153–161 | 160 | CUSTOM | When Legends selected, driver picker seat3 wins through syncCustomTeam. |
| MY TEAM preview invalidates the decal atlas as the livery changes, not only on SAVE | 179–206 | 189, 191, 197–198, 202, 205 | CUSTOM | Opening/editing logo tint invalidates draft decal atlas, identical changes dedupe, cancel invalidates to restore saved. |
| MY TEAM preview busts the mesh only for a changed draft, and debounces the 3D half (#3108) | 208–238 | 224, 228, 231–232, 234, 237 | CUSTOM | Name typing never busts geometry; ten color ticks coalesce into one <=150ms timer burst; change flushes immediately. |
| a fresh install's Legends seat 0 builds the period car, not the shipped sheet | 245–274 | 261–262, 273 | CUSTOM | Real fresh store has shipped fallback but no raw key; selecting default Schumacher writes his actual period car. |
| logo uploads cannot outlive CLEAR, a newer upload or foreign replacement | 276–294 | 287, 290, 293 | CUSTOM | CLEAR cancels pre-read upload; newest image C beats older B completion; foreign stored replacement defeats pending D. |

## legends-team.test.mjs

load 16–25 real M4/Legends/Teams and Parts only when needed. seatsFor 78–81 compiles actual symbolSource function with recorded Career.gridDrivers and chosen driverIdx. Tile line is a local derivation (135–138).

Limits: VM data/factory/grid selection checks; no actual team picker tile layout. Crest availability inferred from team IDs rather than rendering every atlas. Historical source claims are not externally reverified.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| the Legends team is its own id, not the custom slot | 27–34 | 29–33 | LEG | Guest identity legends is separate from custom/base roster and flags cannot cause double guest counting. |
| the team carries the whole roster, so the driver picker is the legend picker | 36–41 | 38–40 | LEG | Whole picker roster and code order exactly match Legends.LIST. |
| seatOf finds every legend, and refuses what is not one | 43–50 | 45–46, 48–49 | LEG | Every ID/code maps to own roster seat and invalid picks return -1. |
| the team's identity follows the legend it fields, not just its name | 52–60 | 55–59 | LEG | Fangio/Graham Hill differ in legend/tier/colors/stats but share Legends name. |
| every legend can field the team | 62–72 | 65–69, 71 | LEG | All roster entries produce complete bounded-tier team records; unknown team returns null. |
| a real team's seats come from Career.gridDrivers; LEGENDS never asks it | 83–91 | 86–87, 90 | js/game.js:1485 seatsFor → Career.gridDrivers | Real team uses Career two-seat roster; Legends bypasses Career seam. |
| the team grids exactly one car, whichever legend is picked | 93–100 | 97–98 | js/game.js:1485 seatsFor | Every valid picker index produces exactly its one corresponding driver. |
| an out-of-range or junk pick still grids one car | 102–111 | 108–109 | js/game.js:1485 seatsFor | Junk/negative/oversized/NaN picks still produce one nonempty driver seat. |
| only a SOURCED racing number exists; the rest are a neutral placeholder | 119–129 | 123–124, 127 | LEG | Only MAN/SEN have sourced numbers and those are >1; all others remain neutral. |
| the tile's driver line stays one line's worth for a legend | 131–142 | 140 | LEG | Locally derived single-seat surname/engine string stays <48 characters; no actual tile render asserted. |
| a legend wears a real marque crest or none — never a borrowed one | 144–174 | 153–154, 159, 163, 165–167, 172 | LEG | Marque must be one of current team IDs and match car name, >=8 mappings; Fangio/Senna correct and four unsupported crests null. |
| Teams.isReal separates the eleven constructors from the two grid guests | 176–188 | 182–187 | js/data/teams.js:299 isReal | Eleven base constructors pass isReal; Legends/custom/null/undefined do not. |
| a legend's parts override the era, so a shared decade is not a shared car | 196–213 | 200–202, 207–209, 211–212 | LEG | Shared-era Fangio/Moss and Lauda/Stewart factory keys differ; override merges with era and unknown returns null. |
| a duel rival's factory setup is the legend's, not the bare era | 218–222 | 220 | LEG | Four overridden rival factory setups equal merged parts rather than bare era. |
| no legend's car exceeds the parts budget | 227–233 | 231 | LEG | Every merged legend setup costs <= real Parts.BUDGET. |
| a legend's period car reaches the player's slot as well as a rival's | 240–254 | 247, 251 | LEG | Player and rival getFactorySetup preserves each period part and stays affordable. |
| TIER_V is a strictly descending pace ladder, fastest first | 265–281 | 267, 269–271, 278–280 | js/data/teams.js:286 TIER_V | Five pace tiers strictly descend; field spread 0.5–3% and every scale 0.9–1. |
| POINTS is the 2026 top-ten ladder, descending, with no fastest-lap point | 283–293 | 285–286, 288, 290–292 | js/data/teams.js:272 POINTS | Points exactly 25/18/15/12/10/8/6/4/2/1, descending ten places and larger win premium. |

## legends.test.mjs

load 11–21 real M4/Legends/Parts/Teams VMs; custom budget context 175 and real Parts resolution drive era checks. Header/spine enum are source parsing.

Limits: Consistency/history metadata guards do not validate external facts. RGB distances and visual-field counts are proxies, not screenshots; no physical dynamics or actual rendered silhouette.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| every legend's record is internally consistent | 23–40 | 26–29, 34–35, 37–38 | LEG | Record arithmetic/title explanation/trait/year formatting is coherent for every legend. |
| a legend code never collides with the 2026 grid | 42–50 | 45–46, 48–49 | LEG | Codes are three capitals, unique and disjoint from current grid; IDs unique. |
| ratings stay on the same 0-100 scale the grid uses | 52–60 | 56–57 | LEG | Each computed rating axis is integer 60–100. |
| ratings FOLLOW the record — a better rate can never score lower | 62–86 | 82–83 | LEG | Pace blend, win-rate craft and podium consistency order cannot invert their own record ranking; awareness/experience monotonicity not covered. |
| every legend offers a livery the picker can render | 88–102 | 91, 93–96, 100 | LEG | Every livery has namespaced ID/name and valid distinct primary/secondary RGB, plus optional accents. |
| the sources block is present, because these are claims about real people | 104–108 | 106–107 | LEG | Source attribution marker and tribute-not-replica disclaimer remain in file; not a citation fetch. |
| the file header's driver count matches the roster | 110–124 | 121–123 | LEG | First 200 source characters must spell current roster count using supported zero–twenty word list. |
| no two tributes read as the same car | 126–168 | 158, 160, 163–165 | LEG | All dominant colors separate >0.18 L1 except explicit Senna/Mansell exception, whose secondary separation >1 and exception remains necessary. |
| every legend names an era, and every era is in the table | 178–188 | 180–182, 186 | LEG | Every legend references valid period and parts; every period has a user. |
| every era covers every category with an option that exists | 190–202 | 194–196, 199 | LEG | Every era covers each Parts category with registered option and has no unknown categories. |
| every era fits the garage budget — parts.custom IS the player's sheet | 204–210 | 207–208 | LEG | All era sheets fit custom-team Parts budget. |
| the eras are actually different cars, and the wingless ones stay wingless | 212–251 | 220–221, 223–224, 226, 247–248 | LEG | Pre-1968 wing level zero exactly, era/year tables agree chronologically and each era pair differs by >=8 resolved visual fields. |
| no legend gets a halo — every one of them raced before 2018 | 253–264 | 256, 260–262 | LEG | Every selected car has no halo, year pre-2018 and within driver career; car year used rather than retirement year. |
| parts() hands back a copy, so a caller cannot edit the table | 266–271 | 269–270 | LEG | Changing returned Fangio parts does not mutate later parts; unknown lookup null. |
| every legend livery spineHeight is a registered Car3D id (not "low") | 273–280 | 278 | js/car/car-body-geom.js SPINE_HEIGHT_IDS ↔ Legends.LIST.livery | Livery spineHeight values belong to source-parsed frozen body-geometry enum. |
| Schumacher's teams cover his whole 1991-2012 career | 282–285 | 284 | LEG | Schumacher metadata includes Jordan/Benetton/Ferrari/Mercedes; not validating chronological detail. |

## lexical-window-guard.test.mjs

walk 20–27 scans all .js recursively under js; stripComments 29; lexical declarations/window assignments gathered 36–44, suspect dot property reads 46–54.

Limits: Regex architecture scan, not parser/scope control flow. Only column-zero const/let/class names; one explicit assignment anywhere exempts name globally; bracket reads/dynamic exposure not fully analyzed.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| no window.X guard reads a top-level lexical global that is never on window | 31–57 | 56 | LEX | No window/globalThis/self dot read names a lexical global lacking any explicit dot/string-bracket assignment onto those globals. |

## light-grid.test.mjs

defs 48–66 parses object literal registry (literal defaults only), presets 69–73 VM-loads actual map; integer grid helper 78–87. Backend comments stripped for presence scans; HTML ranges 491–513 and camera defs 515–532 parse source.

Limits: Primarily source/schema consistency, not GPU execution or pixel parity. Numeric constants in comments explain intended consumers; range guards do not execute consumers. Nonliteral defaults skipped; name-presence scans can pass unrelated occurrences. Whole presets loop skips unknown/nonnumeric values here (separate knob-range suite covers them).

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| the integer grid test does not trip on binary-float representation | 89–97 | 92–96 | GRID | Integer scaling accepts three binary-float trouble cases and rejects two off-grid values; guard self-test only. |
| every TUNE_DEFS default sits on its own slider's step grid | 99–110 | 101, 105–109 | GRID | >150 parsed knobs; each literal default lies on its own min+integer-step grid. |
| every slider maximum sits on its own min+step grid | 112–120 | 118–119 | GRID | Each parsed slider max lies on its own selectable step grid. |
| slider maxima stop where the consumer saturates, not past it | 122–203 | 129, 133–134, 136–139, 146–147, 149–150, 152, 154, 156, 158, 163, 165, 168–169, 173–174, 177, 181–182, 186–187, 190–191, 193–194, 197–198, 201–202 | GRID | Range ceilings/floors stay within documented live consumer bands for SSR, vignette, fog, contact, lamps, rays, materials, city glow, AO, mist and sky. Does not evaluate shader response. |
| GRAPHICS: LOW sheds look-defining post via lookPostShed (bloom/SSAO/god-rays) | 205–248 | 212–213, 215–216, 218–221, 223–226, 231–235, 240–242, 245–247 | js/perf/quality-preset.js + js/ui/post-fx-opts.js + js/game.js render options; knobs help | LOW tier4 and applyLookShed source control five look passes; road/car SSR cost gates and related help strings reflect quality shedding. |
| WGX god-ray knobs read TUNE_DEFS ids, not stale aliases | 250–261 | 257–260 | js/render/webgpu/wgx.js godray parameter reads | WGX uses registry godrayAniso/godrayFloor reads rather than dead hg aliases. |
| WGX T.* reads are TUNE_DEFS ids (no silent fallbacks) | 263–273 | 270–272 | js/render/webgpu/wgx.js T/knob reads | All executable WGX T.field/PostCommon.knob string keys exist in registry. |
| TLX k()/gk() keys are TUNE_DEFS ids (no silent fallbacks) | 275–286 | 284–285 | js/render/three/{tsl-lit,tlx-post,tsl-fx,tsl-sky,tlx}.js k/gk reads | All executable TLX k/gk string keys across five files exist in registry. |
| every TUNE_DEFS uniform is wired in executable code on GLX, WGX, and TLX | 292–322 | 308, 318–321 | GLX glx/post/shadow + glsl-{lit,post,sky}; WGX wgx/wgsl-{chunks,post}; TLX tlx/tlx-post/tsl-{lit,post,sky,fx} | >50 uniform knobs have ID/uniform substring in code across GLX/WGX/TLX; WGX windSpeed gap needs help admission and cannot go stale. |
| lamp-chunk sliders name their backend support honestly | 324–359 | 343–347, 350–354, 357–358 | GRID | Road/per-chunk lamp help says all three supported and explains three.js per-fragment behavior. |
| amount-knob defaults are not crushed into the first quarter of the slider | 361–393 | 389–392 | GRID | Eligible nonnegative amount defaults use >=25% travel; excludes unit-scale amounts, carReflect and intentionally gentle vibrance. |
| asymmetric white-balance sliders are not ±N when the mix is not | 395–453 | 404, 408–409, 413–414, 417–418, 423–424, 428–429, 432–435, 437, 440–442, 446–447, 449, 452 | GRID | Sun/lamp/ambient temperature ranges approach asymmetric channel-zero limits; city warm asymmetric; tint symmetric/coefficient documented; amount floors reach zero and material ceilings bounded. |
| every shipped preset value sits on its knob's step grid | 455–484 | 458, 473, 478–483 | GRID | >1500 numeric registered preset values land on selectable knob grids; unknown/nonnumber entries skipped in this suite. |
| CAMERA / SETTINGS / ADVANCED slider markup matches the JS clamps | 534–586 | 536, 539–540, 542, 546–547, 554–556, 560, 564–566, 577, 580 | index.html range markup; js/camera/offsets.js; js/input/steer-tuning.js; js/ui/scale.js | HTML camera/settings/advanced/audio slider ranges match parsed steering/UI/camera clamps and known bounds/help; no DOM interaction. |
| god-ray lamp arrays are sized to the ONE bound the beam march walks | 588–620 | 600, 604–605, 610, 617–618 | js/render/glx/shaders/glsl-post.js GODRAY_FS ↔ js/render/glx/post.js scratch/uploader | GLSL lamp loop define, JS nearest-light cap and six scratch buffers share one bound times component count. |
| puddle ripples: the ring constants and the rain uniform match on GLX, TLX and WGX | 628–649 | 632, 637, 640–641, 643–648 | js/render/{glx/shaders/glsl-lit,three/tsl-lit,webgpu/wgsl-chunks}.js ripple blocks; glx.js/wgx.js/game.js rain | Ripple literals/rates match three shader blocks and frame rain value reaches all upload paths; text/constants not actual shader equivalence. |
| the sun-glint knee and the world env-probe reflection reach every backend | 651–679 | 660–663, 666–669, 675–678 | same three lit sources + glx.js/wgx.js specKnee/probe upload | Specular knee/default/upload paths and world env-probe strength/distance/roughness sampling match prescribed backend forms. |
| WGX: every env-probe tap reads the y-down cube faces with -y | 681–692 | 686, 688, 690 | js/render/webgpu/wgsl-chunks.js envCube taps | All >=4 matched WGX env-probe sample directions flip y or use verified RgEnv alias. |
| car-paint flake sparkle fades out inside 4 m on all three backends | 694–702 | 700 | three lit shader source families spFade | All three flake sparkle forms include near 1.5–4m smoothstep suppression. |
| TSL lamp-grid: textureLoad(grid) only when inside (#2927) | 709–730 | 712, 714, 716–729 | js/render/three/tsl-lit.js PER-CHUNK LAMP SOURCE block | Bounded TSL source block initializes zero base/count, fetches grid only inside If(inside), assigns pair and uses count-positive fallback. |

## light-presets-extreme-knobs.test.mjs

Real desktop-mode LightKnobs and window.LightPresets VMs; atExtreme 57–65 uses 2% span threshold; extremePins 67–79 excludes shared * and *| stamps; explicit four-profile allowlist 31–41. Helper assertion 53 requires map.

Limits: Heuristic tuning policy, not visual correctness. Unknown/non-number/zero-span knobs ignored here. Allowlist reasons are nonempty truthy strings; historical comments are not reverified.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| per-track pins with >=3 knobs at range extremes are allowlisted | 81–98 | 93–97 | PRESET | Per-track profiles with >=3 extreme knobs must have reason and every allowlisted profile must still meet threshold; both unlisted and stale lists empty. |

## light-presets-knob-range.test.mjs

Real desktop LightKnobs and window.LightPresets VMs, empty KNOBLESS_ALLOW 19–21; helper assertion 33 requires exported object.

Limits: Only values present in map checked; no completeness, aesthetic quality, clamp application or rendered backend behavior. Desktop eval does not cover runtime mobile-specific defaults.

| Case (exact declared name) | Case range | Assertion spans | Target | Meaning / case-specific boundary |
|---|---|---|---|---|
| every shipped preset value is inside its knob [min, max] | 37–61 | 58–60 | PRESET | Every preset value is finite numeric, names existing registry knob and lies inclusively within min/max; no knobless exemption currently active. |

## Coverage accounting

180 test declaration sites mapped. The ensureNet template at `lazy-bundles-prefetch.test.mjs:122–136` expands to two named cases (`js/net/lobby.js`, `js/net/qr.js`), so 181 runtime case instances are represented if this group is run unchanged. Loops inside other cases are scenario matrices, not separate test registrations. Helpers with assertions outside case callbacks: lamp-chunks liftBlock :448; lamp-fixture-anchor nightLights :147; lazy-audio-firstbind bootAndGesture :22; preset loader checks extreme-knobs :53 and knob-range :33. Assertions nested in loader callbacks (e.g. scenery request shape) appear in the owning case’s span column.

No assertions in this report establish deployed behavior, physical audio output, browser activation semantics or renderer GPU support. Source text checks pin current forms and may require maintenance when code moves; VM/runtime checks test actual loaded product functions at the stated stub boundaries.

## Dependency snapshot hashes

Hashes identify the principal real dependencies; this is not a claim of full dependency-source reading. Inspected ranges are specified above. Remaining shader paths are the source-pin targets enumerated in the case rows.

| Dependency | SHA-256 |
|---|---|
| `js/render/shared/lamp-chunks.js` | `ef92e591fa9726d25bccb31ce8ebaed225266c5c69f99de6dee36401af2abbf3` |
| `js/render/shared/chunk-bins.js` | `2bcafae8e8f032d496facf2e5827f3610f4187dc6cbe00560d22298c5a9c4b43` |
| `js/render/shared/light-budget.js` | `cdfd5c32a1ecc55952aa082e6689c2a31f5a700c0faa719e3200fb4e6cf55e1e` |
| `js/render/shared/frustum.js` | `b18b607fd0db76124761bd8a3f23543d7274779082f9a1ef3385321fa54cd61d` |
| `js/lighting/track-lights.js` | `9c486661688c520f3f50344643b9031156ee31ca8e9c75c10f5023a8ebc8aed3` |
| `js/lighting/frame-lights.js` | `f491413e9d00405865c3033be7b092107b7f1acbf5418d9df5303ba62457957e` |
| `js/lighting/lighting.js` | `40226712d4f67c8a8c7473dd83377757c744a4d559a734bb9a1c1a5e2c2e8774` |
| `js/lighting/knobs.js` | `ddcb861d37e0b881cd0dcd46eea21b0858552f30e3bcf1442b9fb3796cf8165d` |
| `js/lighting/presets.js` | `3fd21c305419049ba13bd7f3616afd84725053bdb9c375ad111c6c17ceea9012` |
| `js/lighting/profiles.js` | `dd27530244bd9a7f0d269c356d1b589ba54153bc52d76e3c81294491874a76d8` |
| `js/render/shared/shadow-pass.js` | `5e0e8f64f3827a480d6c2587bd8a579d008e3733db0c58545e67380d9086c225` |
| `js/render/three/tlx.js` | `58669a10791324112e956d2b63adefd0c2b793147945a148d2eda447340922a2` |
| `js/render/three/tsl-lit.js` | `61b7e28fd524054b51f502570a47dea49e86c5313a3836a4680289130fced886` |
| `js/ui/layers.js` | `9af0dc5839747165234e36c223af907cc3f6de1b171d712ff03aa2567a75f231` |
| `js/core/lazy-bundles.js` | `1a25b67bbb1041ef6d4d50cf1c988d101b9ec9026993cb930ff1accec9660e52` |
| `js/core/script-loader.js` | `4fa6f897fc043cf45ffc0b564ac03d9b50a5510e7442289ddd0c0c02d4d22762` |
| `js/career/custom-team.js` | `0c307fd77ac7423e390be53b7ea584e008eef145e3ffc1b2cb74c65a8162eafc` |
| `js/data/legends.js` | `3dcd92109f8eee13b9114412fe164340b4b323d37fec696773b037560e947ba3` |
| `js/data/teams.js` | `6ff73b5e60b9d510d9a9d4a17129f1947811ce217fda0dc8c1ccf8b64fdfe838` |
| `js/car/parts.js` | `7b4c53b388b06b294b59faf46f44f5d01b7fccece83e8732b3c083194558fe4f` |
| `js/car/car-draw.js` | `e6f5ad077eb89dd69f6b24bc1cab6fe3b87a2e8f43867d9d11108d8cf41765e6` |
| `js/race/start-lights.js` | `e3f10e1f92d33b14eb2adc63102f62293c459f853f01b6e5ec4b1a1c83077392` |
| `js/game.js` | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `tools/manifest.cjs` | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| `tools/ci/lane-preamble.mjs` | `00a062e9fa6311ce3b47d5814c2acfb3bba17dea52c96c85ed13dfc118a68ad8` |
| `tools/ci/launch-gate.mjs` | `1913601a9a053152c996ccf751daffd5f19493b9c8cb518ec822274f9cac6600` |
| `.claude/hooks/launch-gate.py` | `316236039d2008ee509f2eee9b248ca2c32ec42bd9b718ab0e29711d8bc814c2` |
| `tests/helpers/game-source.mjs` | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| `tests/helpers/fn-source.mjs` | `3f40d63e82348c9e48ed950481386b75d3f8c17c03502748aa600d1444ae9e19` |
| `tests/unit/fake-audio-vm.cjs` | `bf3d952dddc793d791b722d55c1349d62e5a9e5b7987340086987356f94f7ec7` |
| `tests/helpers/car-draw-vm.mjs` | `35d84c40cd00dbd2db961ab089a5a23fbb2b8b0da12de18e48380da7182e2a32` |
| `tools/lib/game-vm.cjs` | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| `tools/track/verify-track.cjs` | `6eb4174e4ce20105e81c76fcfde2c6b2199818aeb2e22ba4612b909127be0b8b` |
| `tools/car/parts-sweep.mjs` | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
