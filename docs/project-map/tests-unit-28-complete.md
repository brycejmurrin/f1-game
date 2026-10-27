# Unit group 28 — complete source map

Read-only review at `8a222466bc83de7cdbe6a42989f19f7824ce4c06` (2026-10-27 UTC). All 21 assigned test files / 4,678 lines were read from numbered source in individually returned slices of at most 90 lines and under 10,000 characters. Any display-truncated slice was reread in full. No tests or browser runs were performed. No runtime/test source was edited.

Ranges are inclusive, 1-based. Each row records the declaration range, exact assertion-call spans, production target key, and observable meaning. Repeated loop invocations share source spans. Hashes are SHA-256 of full source bytes; they describe this working-tree snapshot, not a test verdict. Target keys expand immediately above each table. Fake URLs, branch names and generated WGSL are fixture descriptions rather than live file links.

## Navigation and shared evidence

Read `AGENTS.md` and `.agents/skills/code-nav/SKILL.md`. Used the checkout’s `bash tools/mcp/lsp-mcp.sh` outline/definition interface. LSP located LightStore, LightKnobs, Atmosphere, TrackLights, LightTune, GfxQuality, LiveryTex, CarMesh, CarDraw, Helmets, CarMaterials, CustomLiveries, LiveryDesign, GarageLiveryDesignEditor and GarageSurfaceOutline. `Car3D.wingBand` resolves to export alias `js/car/car3d.js:2893`; following `wingBandGeom` resolves the real body in `js/car/car-body-geom.js:807–836`. `bodyAnchors` resolves to 1787–1801 in that same file. Failed member outline requests were replaced with these definition lookups. LSP fallback definitions for sunColour, contour, painter and getCockpitDecalMesh explicitly leave caller/export coverage unverified; this map uses their source bodies, not an inferred reference closure.

Read production `profiles.js:1–386` completely, including legacy import migration, TOD-keyed sun slots, capability layers, max merge, sparse base/write agreement, effects, copy/restore and reset/tuned. Read bounded definition bodies for applyFinish (110–133), history (359–375), drawAtlas (341–358), sunColour (1192–1223), contour (10–42), styled (390–406), painter (411–421), wingBandGeom (807–836), bodyAnchors (1787–1801), and cockpit decal (445–477). Tool sources read at lighting-tuner-sweep 40–94, lit-wgsl-census 24–95, live-frame-census 30–54/132–180, live-run-check 1–89, livery-contrast 38–118, parts-sweep 96–132 and mesh-distance 1–56.

`tools/car/livery-contrast.mjs:42–60` loads real log/team/livery/design/graphics/crest/texture modules against RecCtx and returns recorded authored hi-res atlas operations. Its 80–115 sweep uses point grids, 15% area ownership, alpha/redraw filtering and a 2:1 floor; it does not score every small mark or browser-rendered lighting. `tools/car/parts-sweep.mjs:96–120` loads actual geometry/material/car/decal modules (optional CarShade); it supplies CPU mesh data, not a GPU. `tests/helpers/mesh-distance.mjs:16–56` computes closest point-to-triangle distance and selected triangle extraction. `seedLog` stubs the logger; `absSrc` gives VM diagnostic filenames; `symbolSource`/`fnSource` extract actual function text; mini-dom is an in-memory DOM substitute.

## light-presets

Full read: `tests/unit/light-presets.test.mjs:1–522`. SHA-256 `bf8c0c339d6c95be80f0a78a2bae8e157ba8f3ac9748c63013846ae092f5a93d`.

Targets: P: `js/lighting/presets.js`; K: `js/lighting/knobs.js:27`; S: `js/lighting/profiles.js:59–269`; source gates: `js/race/storm-flash.js`, `js/lighting/atmosphere.js`, and S.

Fixture and limits: VM presets()/tuneIds() (35–50), real-knob real-store resolveLive (206–231), filesystem circuit roster, TOD/WX (105–108), DAWN_DRY_HOIST (151–181). Shipped data is real; browser, physics and visual output are absent.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| every shipped preset knob is a real TUNE_DEFS id | 53–77 | 55, 68, 73–76 | P + K | Unknown knobs rejected against regex registry (with scan floors) |
| the global baseline profile, if present, is a plain knob map | 79–90 | 86, 88–89 | P | missing baseline actually fails despite optional wording |
| shipped presets never pin wetness (look=drive) | 92–103 | 101–102 | P | shipped road wetness stays physics-owned |
| every circuit ships a full tod×weather grid with no wetness pins | 110–125 | 116, 120, 122–123 | P | every circuit has 20 objects |
| no lit condition ships the crushing stamp: ambientMul ≥ 0.15 and keyMul ≥ 0.1 outside night | 127–149 | 148 | P | non-night lighting floor prevents crushed fill |
| shared *\|dawn\|dry stamp supplies the fleet dawn fill | 183–204 | 186, 188, 190–191, 202–203 | P | dawn hoist exact map and no redundant pins |
| *\|dawn\|dry hoisted knobs resolve identically on every track | 233–254 | 239, 241, 247, 252–253 | P + S + K | real resolver applies clamped dawn values fleet-wide |
| shared *\|night\|dry stamp supplies the fleet night authenticity knobs | 256–283 | 259–270, 282 | P | night stamp exact values and no core per-track pins |
| day rain resolves the shared wet grade on every track (storm inherits it) | 285–297 | 288, 291, 296 | P + S + K | rain stamp resolves fleet-wide (storm is mentioned but not exercised here) |
| overcast and fog nights resolve the dry night's lamp pools on every track | 299–318 | 305, 308, 317 | P + S + K | overcast/fog lamp pools equal dry night |
| shared *\|dawn\|wet stamp supplies the fleet wet-dawn look | 320–344 | 323–331, 343 | P | dawn-wet stamp permits fogTint/mistHeight exceptions |
| shared *\|day\|dry stamp supplies the fleet clear-daylight authenticity knobs | 346–373 | 349–360, 371–372 | P | dry-day exact stamp forbids duplicate pins |
| shared *\|day\|wet stamp supplies the fleet wet-daylight authenticity knobs | 375–407 | 378–389, 404, 406 | P | wet-day exact stamp permits named atmosphere exceptions and Spa shadow-only override |
| shared *\|dusk\|dry stamp supplies the fleet dry-twilight authenticity knobs | 409–431 | 412–419, 430 | P | dusk-dry core pins forbidden except Spa |
| shared *\|dusk\|wet stamp supplies the fleet wet-twilight authenticity knobs | 433–455 | 436–443, 454 | P | dusk-wet core pins forbidden except Spa |
| shared *\|night\|wet stamp supplies the fleet wet-night authenticity knobs | 457–482 | 460–470, 481 | P | wet-night core pins forbidden except Spa |
| spa\|night\|wet lamp spread matches its dry twin (no amber flood) | 484–493 | 490–491 | P | Spa wet/dry lamp-spread parity with unstamped shared knobs |
| no preset sets a condition-gated knob where its gate is shut (dead entries) | 495–522 | 510–512, 521 | P + source gates | source gate premises plus preset condition-key audit |

## light-store-cond-layer

Full read: `tests/unit/light-store-cond-layer.test.mjs:1–142`. SHA-256 `b9d7bab1a4919444fc38ff5db54f4fbfb92a75b39d199e49b3ce4bb41ac2e8ab`.

Targets: S: `js/lighting/profiles.js:113–269`; Q: `js/perf/quality-preset.js:167`.

Fixture and limits: Two synthetic definitions and Vegas/Monza roster, deep-copy store, mutable capability, real store and GfxQuality (27–72). UI/storage APIs are stubs.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| the *\|night layer resolves on ULTRA with a capable backend at night | 74–78 | 76–77 | S | Night conditional value and untouched default |
| 'default' time-of-day resolves through track.def.night before matching the key | 80–85 | 82, 84 | S | default TOD follows track night flag |
| EVERY preset gets the layer — flipped live through the real GfxQuality.set -> LightStore.reapply | 87–106 | 96, 98, 101, 103–104 | S + Q | low/medium/high/ultra setter triggers live reapply after capability changes |
| MOBILE gets the layer too — capability is the only gate left | 108–119 | 113, 116, 118 | S | mobile permitted but absent/null capability denied |
| a player edit always wins — an explicit 0 beats the layer and persists sparsely | 121–128 | 123, 125, 127 | S | explicit zero survives apply (persistence bytes are not asserted) |
| dragging TO the layer's own value stores nothing (base() includes the layer) | 130–137 | 135–136 | S | assigning resolved baseline leaves no override key |
| the day key never fires at night and vice versa | 139–142 | 141 | S | day layer excluded at night (reverse direction is not independently exercised) |

## light-store-copy

Full read: `tests/unit/light-store-copy.test.mjs:1–356`. SHA-256 `4440c595309536fe247cb30183427ebd6de9ae3c74c7dbcc103a1fcfed8759e5`.

Targets: S: `js/lighting/profiles.js:38–384`.

Fixture and limits: Five definitions with rebuild/rain flags, three-track roster and switchable race conditions, cache objects/effect counters, in-memory cloned persistence (34–104). No real browser/localStorage.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| edits mode copies this profile's overrides to every other track at the same time+weather | 106–120 | 112–115, 117–118 | S | Edits fans two tuned knobs to two other circuits and reports counts |
| a copy touches no other condition, and not the track it came from | 122–133 | 127, 130–132 | S | source and non-target TOD/weather remain resolved as before |
| edits mode merges — a target's own tuning survives for knobs the copy does not name | 135–145 | 143–144 | S | unrelated target override survives merge |
| full look overrides a target's shipped per-track preset; edits mode leaves it alone | 147–160 | 153, 156–158 | S | look replaces shipped defaults while edits preserves them |
| full look makes every track resolve identically at that time and weather | 162–181 | 172, 179 | S | full registry produces identical resolved look on both targets |
| a copy stores only what the target would not have resolved to anyway | 183–198 | 193–194, 197 | S | target-relative sparse deltas retain only necessary default overrides |
| edits mode with nothing tuned copies nothing and says so | 200–208 | 203–204, 207 | S | no-edits refuses without writes or spreading shipped settings |
| undo restores every target exactly, including the ones that had no profile | 210–224 | 219–223 | S | restore reinstates exact profiles including absence |
| the session 'default' time-of-day copies under the look it actually resolves to | 226–237 | 228, 231–232, 235–236 | S | default source time copies resolved night into explicit target night only |
| copying with no track loaded is refused rather than keyed on undefined | 239–245 | 241, 243–244 | S | no-track refuses and leaves profiles empty |
| a copy does not disturb the live scene — no reapply, no rain reinit | 247–257 | 255–256 | S | fanout leaves live scene effect counters untouched |
| a saved lightTune with a non-object profile is dropped, and moving a knob no longer throws | 259–268 | 263, 265–267 | S | malformed profile/array and nonnumeric property sanitation preserve valid numeric edits |
| setting a knob to its live value stores no override, whichever layer supplied it | 274–286 | 282, 284–285 | S | setting each live layer value stores no per-condition overrides |
| set() clamps to the knob range and refuses non-finite or unknown input | 289–301 | 291–295, 297–298, 300 | S | clamp bounds and refuse unknown/nonfinite/non-number input without LT change |
| set() back to the resolved value drops the override and the empty profile | 303–309 | 306, 308 | S | reverting to base removes override and empty profile |
| set() fires only the live effect its knob asks for, once | 311–327 | 317, 320–321, 324, 326 | S | rebuild/rain/plain knobs have isolated counted effects including dry-road suppression |
| a reapply knob re-runs applyRaceSettings in a race but not from the menu | 329–342 | 337, 340 | S | apply-only knob invokes race rederivation outside menu/select only |
| tuned() counts the condition's overrides and reset() clears them (and the global layer) | 344–356 | 346, 350, 352–355 | S | tuned excludes global layer and reset clears current/global while preserving another condition |

## light-store-perchunk-pin

Full read: `tests/unit/light-store-perchunk-pin.test.mjs:1–211`. SHA-256 `c1c0ce7ba00a47dfa7a9559269705f5c4f52bd058eacdea59f4605d4b8a1be1d`.

Targets: S: `js/lighting/profiles.js:122–269`; gate: `js/game.js`; note: `js/lighting/tuner-panel.js`; edit: `js/race/light-tune-edit.js`; API: `js/agent/apex.js`; post: `js/ui/post-fx-opts.js`.

Fixture and limits: Three synthetic knobs and three circuits, real store and a real Monaco shipped profile (18–67, 99–115). Last two cases inspect source text rather than rendering.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| track-pinned perChunkLights survives a lower condLayer value | 69–76 | 75 | S | Per-track high pin survives lower conditional value |
| condLayer still raises an unpinned track and a low track pin | 78–88 | 84, 87 | S | conditional raises low or absent pin |
| non-perChunkLights knobs keep cond-over-track order | 90–97 | 96 | S | ordinary lamp knob keeps conditional-over-track precedence |
| Monaco shipped roadChunkLamps profile is unchanged by perChunk merge | 99–115 | 106, 113–114 | S | Monaco road flag survives special merge while perChunk zero is raised |
| per-chunk lamps: every half shares ONE gate, and it is autoShed | 119–186 | 148–152, 157–162, 165–166, 170–171, 173–174, 180–185 | gate + note + API + post | regex/string agreement of road/scenery/tuner/API shed gates and post shed routing (not measured governor behavior) |
| the display-reset latch clears from EITHER chunk slider, as the tuner promises | 188–211 | 199–202, 206, 209–210 | edit + note | source retry latch accepts either chunk knob consistent with tuner classification |

## lighting-ab-catalog

Full read: `tests/unit/lighting-ab-catalog.test.mjs:1–35`. SHA-256 `3595c7121c9682e45148a9f243a158b1787be38d33ab30475612902a2487e075`.

Targets: A: `tools/lighting/ab-lighting.mjs:72–225` plus each catalog entry’s real `file`.

Fixture and limits: Imports real KNOBS/FREEZE_FLICKER catalog and reads declared source files (13–16). No variant server or raster output.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| A/B knob catalog matches the source exactly (1 hit per knob) | 18–35 | 19, 34 | A | Every patch find-string and flicker freeze matches once, each B differs from A, exact-string drift detection only |

## lighting-reapply

Full read: `tests/unit/lighting-reapply.test.mjs:1–154`. SHA-256 `631f429725cdcb4ce8d8fd3bd58529e501685ec4b86eb2758c62b95c3a0447ed`.

Targets: S: `js/lighting/profiles.js:17–36`; A: `js/lighting/atmosphere.js:13`; game: `js/game.js`.

Fixture and limits: Real registry loaded through lighting modules with seedLog (44–51); source text strips registry, extracts bodies and scans a fixed nine-file consumer set (61–70, 90–147).

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| _nightAmbientBand is only reached from applyRaceSettings | 73–85 | 83–84 | S | Caller-file premise checks only game/atmosphere scans (does not prove global absence of other callers) |
| every apply-only knob is registered in APPLY_RACE_IDS | 87–154 | 105, 117, 120, 150–153 | S | apply-only registered knobs based on qualified-read scan with floodEmit carved out as per-frame, textual fixed-file model rather than whole-program proof |

The synthetic Map label `js/lighting/atmosphere.js floodEmit() (per frame)` at test line 127 describes an extracted string; it is not a repository path. The name “only reached” is stronger than its two-file scan can prove.

## lighting-rebuild

Full read: `tests/unit/lighting-rebuild.test.mjs:1–113`. SHA-256 `fc0ffd1418b3d8774cb9ccea95f19bb46987d8750f19c6923dc2098047ea3881`.

Targets: K: `js/lighting/knobs.js:27`; B: `js/lighting/track-lights.js:19,143–206`; F: `js/lighting/frame-lights.js`.

Fixture and limits: Real lighting registry VM (35–42), brace-matched build/frame function lists (44–63). The source model is limited to explicitly named functions.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| the light functions this test models still exist | 65–68 | 67 | K | All modeled function bodies must exist |
| floodColor is not called from a per-frame path | 70–80 | 78–79 | K | floodColor absent from listed per-frame functions |
| every build-only knob carries rebuild:true | 82–101 | 97–100 | K | build-only LT reads require rebuild registry flag |
| LAMPS tuner group merges the old FLOODLIGHTS + LAMP BEHAVIOUR tabs | 103–113 | 106–112 | K | unified LAMPS group has minimum size, legacy groups absent, pool/behavior sections and density rebuild retained |

## lighting-sun-scratch

Full read: `tests/unit/lighting-sun-scratch.test.mjs:1–110`. SHA-256 `7723388dc1db332413ed2004b5421e9758b6d009c64643e6105ae37834ff7b87`.

Targets: A: `js/lighting/atmosphere.js:13`.

Fixture and limits: Deterministic RNG, real log/matrix/knobs/atmosphere, stub bake/storage/DOM/renderer and Spa palette (14–49); near helper (59–60).

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| a weather-blend tick reuses the sun-colour arrays and does not call Array.map | 63–87 | 72–74, 77–79, 81, 84, 86 | A | Blend keeps sun/ambient array identity, horizon alias, midpoint/end color behavior and zero VM Array.map calls |
| dawn sunDir is one scratch, and sunElev still offsets it | 89–110 | 94, 99–100, 104 | A | dawn frame/sky share reusable direction with numerical azimuth/elevation reference, CPU identity/formula assertions do not measure total allocations or GPU |

## lighting-tuner-reset-weather

Full read: `tests/unit/lighting-tuner-reset-weather.test.mjs:1–436`. SHA-256 `3dbca9c6bcf0d254858cb26ca6cb6bf5fef34b0cc49eb416f40eb33998fe0c9f`.

Targets: S: `js/lighting/profiles.js:38–384`; T: `js/lighting/tuner-panel.js:5`; E: `js/race/light-tune-edit.js`; W: `js/race/weather-arc.js:38`; A: `js/lighting/atmosphere.js:13`; B: `js/lighting/track-lights.js:156,206`.

Fixture and limits: loadStore (35–61) uses synthetic definitions and Monaco dusk; bootTuner (77–106) supplies fake DOM/storage/capability/clipboard, real panel/store/edit module and extracted game setter; bootArc (239–256) stubs audio/particles/net; bootAtmo (297–326) real presets/knobs/atmosphere/store with synthetic palette; loadLightTune/ringTrack/redness (391–420) constructs 400-node circular track and 15-float lamp records.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| rain knobs re-seed an arriving shower on a dry road, and leave a cleared wet road alone | 63–75 | 70, 74 | S | Rainfall-view gate reinitializes incoming rain despite dry road but ignores standing water with no rainfall |
| lighting-1: drag updates profile count and returning to baseline restores defaults without persistence | 108–118 | 110, 112, 114–115, 117 | S + T + E | real panel updates tuned count during drag and persists only release |
| lighting-2: shared sun slot exports next to wet edits, distinguishes dry knobs, and loads once per key | 120–136 | 128–134 | S + T + E | copied export preserves all keys, groups shared sun once and labels weather scope |
| lighting-3: chunk knob edits refresh dependent notes, clear latch on rising edges, and keep gate precedence | 138–164 | 140, 142, 144, 147, 151, 155, 158, 161–163 | S + T + E | dependent notes track sliders, rising-edge retries and capability/reset/shed precedence without drag persistence |
| L8: RESET in the wet clears the sun edit the tuner filed under \|dry, and the count agrees | 166–177 | 169–171, 174–176 | S | wet reset clears shared sun and count/value agree |
| L8: a wet RESET removes only the TOD-keyed ids from \|dry; a dry lampLevel edit survives | 179–190 | 184, 187, 189 | S | wet reset preserves dry non-sun edits |
| L8: RESET in the dry still clears its own slot (sun + the rest) | 192–198 | 195, 197 | S | dry reset removes current slot and counts once |
| L8: the RESET button goes through the store, not a bare delete of the weather key | 200–204 | 202–203 | T + S | source RESET button delegates store reset/tuned |
| R3-PERSISTENCE-3: a pre-10-04 wet sun edit moves to \|dry at load, applies, and the export carries no dead entry | 207–216 | 209–213, 215 | S | legacy sun edits migrate/persist into dry slot and stay live |
| R3-PERSISTENCE-3: ambiguous legacy sun edits are dropped (dry slot already set, or weathers disagree) | 218–230 | 225–229 | S | dry takes precedence, conflicting wet/rain dropped, agreeing legacy values merge once |
| R3-PERSISTENCE-3: a clean save is not rewritten at load | 232–236 | 234–235 | S | clean save has zero boot writes |
| M3: a live frame (physics tick + render) advances frame.wetness once, at 0.8/s | 258–264 | 263 | W | live tick plus sync integrates wetness once at expected exponential rate |
| M3: headless (no render) keeps the tick as the producer | 266–271 | 270 | W | headless tick remains wetness producer |
| M10: endSession restores the chip's weather and re-lights for it (cut apply, rain hidden), once | 273–288 | 276, 278, 282–284, 287 | W | ending moved weather restores dry with single cut relight and hidden rain, idempotently |
| M10: a session whose weather never moved does not re-light at the flag | 290–294 | 293 | W | unmoved weather causes no relight |
| M11: a blended re-apply that starts mid-strike fades from the pre-strike look | 328–344 | 340–343 | A + S | lightning-spiked frame fade begins from unspiked base |
| M11: with no strike the fade source is still the frame (unchanged behaviour) | 346–355 | 354 | A + S | no-strike fade retains current frame source |
| M37: floodEmit follows the TWILIGHT FLOOR / RAMP knobs (relational, no copy of the formula) | 357–388 | 367–369, 371, 377–378, 385 | A + S | twilight emission direction/monotonic bounds/scaling tested across dawn/dusk knob pairs |
| M12: densified fills never inherit the pit-entrance `signal` kind | 422–428 | 427 | B | synthetic signal density creates no extra red signals |
| M12: fills still inherit an ordinary mast kind (the circuit's lamp colour) | 430–436 | 435 | B | sodium density retains amber color in additional fills |

## lighting-tuner-sweep

Full read: `tests/unit/lighting-tuner-sweep.test.mjs:1–44`. SHA-256 `76d7bf395e066cc98ff4c74566388e505f45dfa6e3f6c118bc4f929891973f97`.

Targets: H: `tools/lighting/lighting-tuner-sweep.mjs:40–87`.

Fixture and limits: Pure imported helpers; fixed condition catalog and synthetic min/default/max definition. No browser sweep or image differences.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| pushExtreme uses min for sunElev on day conditions | 13–17 | 15–16 | H | Day sun elevation uses minimum while night uses farthest extreme |
| knobGateReason marks night-only and lamp knobs on day-dry | 19–26 | 21–25 | H | selected night/lamp/software gates produce diagnostic reasons and ambient stays ungated |
| verdict treats gated rows separately from inert | 28–33 | 29–32 | H | gate/live/inert/noisy classification on four samples |
| KNOB_OPEN fog and overcast gates match wx | 35–40 | 36–39 | H | fog/overcast opening corresponds to weather |
| FLOOR stays above measured idle noise | 42–44 | 43 | H | configured signal floor is at least 2 (does not remeasure idle noise) |

## lit-wgsl-census

Full read: `tests/unit/lit-wgsl-census.test.mjs:1–58`. SHA-256 `4a080f4c49ff749b6fe87056860ba77ae33cea1ae34aebcb6b17500482c3c3a5`.

Targets: H: `tools/perf/lit-wgsl-census.mjs:30–95`.

Fixture and limits: Synthetic padded WGSL strings (8–10) and module arrays; no compiler, capture, GPU cache or browser.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| normaliseWgsl: build-order renumbering normalises equal, a real edit does not | 12–15 | 13–14 | H | Known TSL renumbering equalizes while real text edits differ |
| normaliseWgsl: distinct names keep distinct slots, a repeat (incl. its _sampler twin) keeps its slot | 17–20 | 19 | H | distinct identifiers get distinct stable slots with sampler twin reuse |
| classify: lit = large fragment with a comparison sampler; small or vertex-only is not | 22–26 | 23–25 | H | large comparison-sampler fragment classified lit, small fragment not, vertex stage recognized |
| summarise + diffSummaries: identical -> unchanged; renumber -> changed but namesOnly; edit -> changed | 28–43 | 32–33, 36–38, 41–42 | H | identical summaries unchanged, renumber recognized names-only but raw family changes, semantic edit not names-only |
| diffSummaries: a non-lit module change leaves the lit family hash alone | 45–50 | 48–49 | H | vertex-only edit affects all hash but not lit family |
| summarise: a module created twice is one row (capture length must not move the counts or the hash) | 52–58 | 55–57 | H | duplicate module capture leaves rows/count-derived hashes stable |

## live-frame-census

Full read: `tests/unit/live-frame-census.test.mjs:1–58`. SHA-256 `9cd1f193319e9445c5ae46b9e7c04606ac9cb251f5f23e95a00baa8b206eb2ef`.

Targets: H: `tools/gfx/live-frame-census.mjs:30–49,132–179`.

Fixture and limits: Argument arrays; overlapping synthetic Chrome trace events; four-sample CPU profile (30–58). Profile URLs are descriptive fixture strings, not live repository/browser references.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| live-frame-census parseArgs: defaults are the phone census rows | 5–11 | 7–10 | H | Default phone rows/backends/helmet/empty storage |
| live-frame-census parseArgs: overrides, unknown backend dropped, window holds trace + profile, ls pairs | 13–20 | 15–19 | H | override parsing drops unknown backend, enlarges window, splits storage at first equals and rejects unknown flags |
| live-frame-census pct/dist: nearest-rank percentiles | 22–28 | 24–27 | H | nearest-rank sorting, empty null and distribution aggregate |
| live-frame-census analyseTrace: merged toplevel busy per thread, GC split | 30–44 | 40–43 | H | overlapping thread busy intervals merge to 15ms and GC durations split |
| live-frame-census analyseProfile: self time by function and file | 46–58 | 54–57 | H | equal sample weights yield duration/idle/function/file self time with query removal and 1-based line labels |

## live-run-check

Full read: `tests/unit/live-run-check.test.mjs:1–65`. SHA-256 `fe232d59d2ffc060065579764f63b536ccac6136f2f4b40061fcd813466b52eb`.

Targets: H: `tools/ci/live-run-check.mjs:32–83`.

Fixture and limits: Injected gitOk/runsPayload (12–23), fake fetch responses and failures. Example workflow URLs/branch/SHA are descriptive fixtures, not live status evidence.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| warnLine: zero → null; singular and plural wording | 25–35 | 26–34 | H | Zero warning absent and singular/plural exact text |
| liveCiRuns: keeps only ci.yml paths; maps id/sha/url | 37–49 | 44–48 | H | CI path filter retains two fake runs, truncates SHA and formats warning |
| liveCiRuns: API failure / bad git → null (advisory, never throws) | 51–56 | 52–55 | H | bad git/non-ok response returns null and absent/empty run formatting silent |
| checkLiveRun: packages live + warn | 58–65 | 63–64 | H | wrapper packages fake run and warning |

## livery-contrast-w13b

Full read: `tests/unit/livery-contrast-w13b.test.mjs:1–55`. SHA-256 `e8eff8d1c8bdaa0ec5815a294ac86f694ef9f56a99925906aa46de63b18b492f`.

Targets: A: `tools/car/livery-contrast.mjs:38–115`; D: `js/car/livery-design.js:76,95`; T: `js/car/liverytex.js:1658`.

Fixture and limits: Real team/livery atlas recorder; bare() strips authored zone colors (15–25). 24×24 sampling; contrast sweep excludes small area/transparent/redraw operations.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| lightning, twoTone and keylineSplit clear 2.0:1 on every team's crest (bare SIDE) | 27–37 | 36 | A | Three default spine designs on all-team crest/tail clear area floor with no side |
| Mercedes lightning no longer paints identical RGB on itself | 39–44 | 43 | A | Mercedes lightning has no identical-color low-contrast collision |
| Alpine and Audi twoTone / keylineSplit crest fields clear 2.0:1 | 46–55 | 52 | A | Alpine/Audi twoTone/keylineSplit crest passes, no complete every-design/every-side matrix or visual raster proof |

## livery-contrast

Full read: `tests/unit/livery-contrast.test.mjs:1–577`. SHA-256 `d219dcb3f68937d159c01a2e529e7d2a969b8d879a4061dc09f1fd0cb4e4df66`.

Targets: T: `js/car/liverytex.js:166,675,1192,1447,1658`; G: `js/car/livery-graphics.js:5`; A: `tools/car/livery-contrast.mjs:38–115`.

Fixture and limits: loadAtlas real modules via recording canvas; local CSS luminance/contrast (30–41), mark difference sampler (239–278), fill operation selector (463–466), geometry occlusion via real parts-sweep/flank-occlusion/spine-station (429–447). Sampling is CPU vector-operation analysis, not browser antialiasing/lighting.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| no design paints a large area that cannot be seen on what it covers | 52–69 | 68 | T | All-team selected crown×side large-area derived defaults clear area floor, authored picks stripped |
| the wrap sun and the flank band are picked against what they land on | 71–80 | 78 | T | actual direct assertion tests sunColour against cover, despite title also mentioning flank band |
| the tricolour is two colours, not one repeated | 82–112 | 107, 110 | T | two visible tricolour band colors contrast except derived two-color liveries |
| a colour you PICK is the colour that gets painted, contrast or not | 114–161 | 126–127, 147–148, 153, 155–160 | T | low-contrast authored tint survives seven surfaces plus number detail/fin handoff |
| pickOn guards Array.isArray(bg) before reading bg[0] | 163–170 | 166–169 | T | source null-guard shape pins pickOn safety |
| SPINE TOP wrap survives a partial livery (no c1/c2) | 172–183 | 177–178, 180–181 | T | partial wrap palette and sun do not throw without c1/c2 |
| design fills are picks, and only when picked | 192–220 | 219 | T | magenta field reaches three chosen regions only after explicit pick |
| the plate-less crown mark keeps authored colour; team data stays legible | 280–305 | 304 | T | plate-less authored mark exact while stock mark/outline/halo supports floor |
| a flank lettering side clears the flank; authored logo/emblem keep free colour | 307–364 | 363 | T | flank lettering contrast samples actual changed ground and authored/stock brand palette policies |
| the wrap's flank badge clears the cover; authored TEAM LOGO stays exact | 366–404 | 385, 403 | T | wrap badge actually paints below chosen v and palette preserves authored/free brand colors |
| a flank MARK lands where the flank is visible, under every crown | 428–457 | 454–456 | T | selected teams/crowns/marks stay below 25% geometry occlusion with empty known-gap ledger |
| a leftover CREST INK on a stored livery moves lettering only, never a derived fill | 468–500 | 499 | T | old crestInk does not recolor six derived-fill designs on stock/dark palettes |
| an authored DETAIL is the number keyline, contrast or not | 502–532 | 518, 523–524, 529–530 | T | authored number keyline preserved below floor while derived same-on-same prevented |
| the Red Bull wrap's two bulls stand on the ridge: each side's top crosses the shoulder and they meet on the spine | 534–559 | 554, 557–558 | T | Red Bull crown has shared non-sun ink near center and both shoulders |
| the shoulder shelf never lands on its own saddle (ferrari, audi: shipped saddleTint) | 561–577 | 576 | T | Ferrari/Audi shipped saddle across full spine ID matrix has no large-area side collisions |

Local `markOnItsGround` (242–278) is declared but has no call in this file; the lettering case instead implements its own difference sampler. Comments describing prior known hidden Red Bull entries are historical: KNOWN is empty in the actual test.

## livery-cover-graphics

Full read: `tests/unit/livery-cover-graphics.test.mjs:1–238`. SHA-256 `0c684d04ef2b113338b87afd848707b978825777f4c1242035de4ff20249ccf7`.

Targets: G: `js/car/livery-graphics.js:5`; T: `js/car/liverytex.js:1658`; O: `js/car/surface-outline.js:10,44`.

Fixture and limits: VM graphics with injected color/palette/clip/number helpers and recorder (20–92), source TEX for closure arms; synthetic 16×16 raster/canvas/texture/free/draw mocks for outlines (190–238).

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| fade is an ordered halftone: regular grid, radius ramps, no hash clumps | 94–148 | 98, 111, 115, 119, 122, 124–125, 134, 138, 140, 144–145 | G | Fade at 1024/2048 has uniform-row ordered dots, regular spacing, growth and readable bounded radii |
| cap rear cut uses a feathered gradient, not a hard fillRect edge | 150–165 | 158–159, 163–164 | G | cap builds gradient and feather band at cut line |
| Mercedes mid-cover starfield is an ordered grid, not a hashed skip | 170–178 | 171, 173–177 | T | source starfield regular-grid/ramp markers replace hash skip |
| Ferrari saddleFlanks rake is feathered, not a hard fill edge | 180–188 | 182–187 | T | source saddle flank has rounded anti-aliased rake with fixed stations |
| inspection contour follows changed fill boundaries only inside actual cover atlas regions | 190–207 | 200–203, 205–206 | O | outline only changed fill boundary inside cover regions, excludes ink flip/interior/no-change |
| inspection probes do not mutate the draft, survive scratch canvas reuse, and retire transient textures | 209–238 | 226–235, 237 | O | outline probes clone frozen draft, snapshot reused canvas, draw correct mesh, reject inert/unsegmented/error cases and free owned textures once |

## livery-decal-surfaces

Full read: `tests/unit/livery-decal-surfaces.test.mjs:1–370`. SHA-256 `4e65d4c4b43800e19e194be4898aab186291eba4ac29866de2efe58d6c1b4655`.

Targets: M: `js/car/car-mesh.js:36,445–477`; G: `js/car/car-body-geom.js:807–836,1787–1801`; build: `js/car/car3d.js`; shade: `js/car/car-shade.js`.

Fixture and limits: loadParts flat and shade VMs, Ferrari visual tiers, engine override (31–40); UV region vertex selection (43–54), posed flap triangles (59–69), nearest triangle helper; sentinel cover-skin/ring selection and flank interpolation (237–266). Numerical mesh evidence excludes raster z-fighting, other teams and moving aero poses.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| Car3D.wingBand places the band on the flap's POSED skin, not its design chord | 72–97 | 73, 81, 83, 87, 92–93 | M | Five non-DRS levels use top rear element and band corners within 12mm of posed skin |
| with a DRS package the band rides the drs plane, which flies with the RW Flap | 99–120 | 106, 109, 111, 116 | M | two DRS packages use top rearDrs plane within 12mm |
| the fin panel and badge sit on the blade at every cover height | 123–163 | 141–142, 145–146, 162 | M | each cover height×three engines omits swallowed fin or keeps vertices within 20mm and above cover |
| the crown stack orders bodywork under the livery drape | 166–172 | 168–171 | M | stack clearance orders vent/shield/decal and flank trim |
| the tail strip clears the heat shield and the spine vent on every cover | 174–198 | 197 | M | tail at shield/vent sampled stations clears by 3mm across covers/engines |
| `the flank band clears the pinstripe and the service hatches — ${label} car` | 201–226 | 210, 225 | M | expanded flat and rounded cases require flank vertices to clear trim by 3mm across engine/coke variants |
| rounded: the flank band's edges stay their 14 mm off the coke-bottle skin, sampled every 1 cm | 268–290 | 273, 277, 288–289 | M | both rounded side edges sampled every cm stay within 2mm of nominal offset, with straight-edge negative control |
| rounding OFF draws today's decal sheet, and ON moves only the flank band | 292–322 | 313, 315–316, 320–321 | M | shade off byte-equals flat and shade on changes only flank, adds 20 triangles, legacy imported body unchanged |
| the cockpit nose decal is the race decal, not its mirror image | 325–370 | 342, 344, 350, 354, 357–358, 369 | M | cockpit built textured quad and race nose agree in V front and U side orientation |

The declaration at 201–226 expands into **flat car** and **rounded car** cases from the loop at 200. All listed cover heights and engine/coke variants execute inside each expansion.

## livery-design

Full read: `tests/unit/livery-design.test.mjs:1–642`. SHA-256 `e72052e0ff5e0db177b16523bc0aaad2ad3d5870fc0772502a4950126cfb91c1`.

Targets: D: `js/car/livery-design.js:24,40,76–375`; E: `js/garage/livery-design-editor.js:9–18`; S: `js/garage/setup-sheet.js`; C: `js/car/custom-liveries.js:70`; M: `js/car/car-materials.js:93–133`; T: `js/car/liverytex.js:1658`.

Fixture and limits: VM load/JSON plain adapter (12–18), drawing recorder/regions/flank transforms (45–61), real atlas/parts/crest recorders, extracted setup-sheet draft/pill/color functions; editorFixture (176–206) mini-dom patched sibling/move semantics and preview callbacks. mini-dom checks accessible attributes/state, not browser layout or assistive technology.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| history coalesces a drag, isolates the original, and drops abandoned redo | 20–33 | 24–26, 28, 31–32 | D | History drag coalescing, clone isolation, redo abandonment and bounded retention |
| imported pattern controls are finite and bounded; zero offset survives | 35–43 | 38–40, 42 | D | imported pattern ranges reject malformed/nonfinite inputs and clamp preserving zero |
| every design paints bounded finite artwork; legacy designs stay byte untouched | 62–75 | 66–70, 73–74 | D | all patterns bounded finite drawing with balanced state and legacy no-op |
| one wrap uses the same longitudinal station on crown and both flanks | 77–93 | 82–83, 85–87, 90–91 | D | shared longitudinal transforms align crown/tail/flanks and side exclusions |
| regional finish overrides only painted vertices and allows gloss over global matte | 95–109 | 104–108 | M + T | regional finish modifies only paint and overrides global matte (moving aero source check) |
| wrap lettering gets a contrasting keyline on solid and gradient artwork | 111–127 | 125 | D + T | wrap adds contrasting lettering strokes relative to crown-only on two art kinds/four lettering kinds |
| actual car mesh retains geometry and carbon while regional finishes reach the moving wing | 129–146 | 134, 136–137, 140, 142–143, 145 | M + T | real complete mesh preserves geometry/nonpaint materials and routes finishes including moving wing |
| design fields survive draft, stored livery and live resolver round-trips | 148–174 | 162, 165, 171–172 | S + C | all design/finish fields survive draft/store/resolver and inherit omission versus preview null clearing |
| existing SPINE TOP controls drive undo, palettes and pattern adjustments without duplicate menus | 208–238 | 210–212, 214–218, 220–224, 226, 229, 232–233, 235–237 | E + S + D | editor controls/placement/history/compare/palette/swap/reset stay integrated without duplicate menus |
| sparse pinstripes paint the visible crown and tail centreline | 241–247 | 245 | D | sparse pinstripes paint crown/tail center sample red |
| integrated adjustments disable only controls unused by the current spine design | 250–259 | 254–258 | E + S + D | availability tracks gradient/wrap/honeycomb/legacy usefulness |
| surface sections and spine families preserve one button per choice and label their scope | 262–273 | 265–268, 270, 272 | E + S + D | headings/grouping preserve unique choice buttons and hidden swatches |
| neutral transform controls preserve existing paint and changed transforms register every surface | 276–293 | 282–283, 287, 289, 291–292 | D | neutral transforms preserve ops while shared rotation/stretch transform spans surfaces |
| new design controls support undo, redo, reset and meaningful line-weight availability | 295–307 | 300–301, 303–306 | E + S + D | transform controls undo/redo/reset and line-weight applicability |
| a greyed control explains itself on screen, and the line goes when it comes back | 311–331 | 317–318, 320–321, 323, 325–328, 330 | E + S + D | disabled rows visibly explain with ARIA description and remove explanation on activation |
| SPINE ONLY greys except on CAP and CONTRAST greys without a fin — and the painter agrees | 334–359 | 337–338, 340–342, 344–345, 352, 355, 357 | E + S + D | spineOnly disabled except cap and contrast disabled without fin, confirmed with three-team atlas comparisons |
| HALO FINISH is live whatever the HALO colour — and Car3D agrees on every cockpit | 363–382 | 368, 378 | E + S + D | halo finish available for all colors and changes mesh across three teams/all cockpit options |
| TAIL STYLE TEAM names the motif it paints — and the atlas agrees for every team | 385–394 | 387, 391–392 | E + S + D | TEAM tail label names selected motif and atlas equals named style across nonlegend teams |
| a paint job started from the team's own scheme saves the marks the editor showed, on every team | 398–420 | 407, 415, 419 | S + T | copied/new team paint seeds saved custom marks to match original preview and negative control is sensitive |
| car-area tabs: every control in exactly one area, advanced rows reachable, edits survive a tab switch | 423–465 | 426–431, 434, 438, 442, 447–448, 451–452, 456, 461–462, 464 | E + S + D | one accessible area pane/tab per setting, advanced reachability, edits survive tabs and keyboard scroll-reset behavior |
| optional colour inheritance and palette selection stay accessible through clear, drag and restore | 467–494 | 481–482, 484–487, 489–491, 493 | E + S + D | inherited color/palette ARIA states sync through clear/input/restore |
| 2026-motif designs: named, registered in their colour/line lists, and each paints distinct art | 496–537 | 500, 502–503, 508, 511, 515, 517–518 | D | six motif registrations deterministic/distinct and both fade dimensions actually shrink |
| classic paint layouts: named, two-colour, deterministic, and each paints distinct art | 539–554 | 544–545, 547, 549–550, 553 | D | five classic layouts registered two-color deterministic/distinct |
| REPEATS, LINE WEIGHT and KEYLINE are live exactly where the editor offers them | 557–582 | 573–574, 576, 578–579, 581 | D | repeats/weight/keyline affect ops exactly according to availability catalogs, defaults stable and tricolour second band live |
| editor greys REPEATS / LINE WEIGHT / KEYLINE per layout | 584–596 | 588, 592–594 | E + S + D | six selected editor layouts gray each unused control |
| a live draft resolves to the same object until the draft is replaced | 600–614 | 611–613 | C | same draft identity yields same resolved object and replacement refreshes |
| a colour drag step writes nothing the editor already shows | 622–642 | 641 | E + S + D | three color-only drag updates produce zero already-current DOM writes |

## livery-draft-mesh-cache

Full read: `tests/unit/livery-draft-mesh-cache.test.mjs:1–73`. SHA-256 `4f0cd460aa71a77255a90c867de1b68bdcb785ac0f4f8137165707c9f6198647`.

Targets: C: `js/car/car-draw.js:33,2127`; S: `js/garage/setup-sheet.js:1621` endLivPreview.

Fixture and limits: carDrawVm recording renderer/build/free counters and mutable livery-ID store revision (10, 13–66). Geometry creation is stubbed by helper; last case source-scans teardown.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| invalidateCustomMeshCaches(teamId) rebuilds that team's bodies and keeps every other team's | 12–29 | 21–22, 25–28 | C | Team-scoped invalidation rebuilds three own bodies, frees entries and retains other team hits |
| no argument keeps the MY TEAM meaning: only custom: entries go | 31–47 | 42, 44–46 | C | argumentless invalidation preserves factory team and rebuilds exactly MY TEAM whole/body |
| a livery change misses; the saved livery's mesh is still a hit after it | 51–67 | 58–59, 62–63, 65–66 | C | livery-ID change misses once and returning to saved ID reuses original mesh |
| the livery editor drops the team's body caches when its draft ends | 69–73 | 72 | S + C | source editor draft end calls team-specific invalidation |

## livery-finish-contract

Full read: `tests/unit/livery-finish-contract.test.mjs:1–308`. SHA-256 `876395452bafdcc49da222b75a78638a762e95e682cdfd942c2ac295d9b6ce85`.

Targets: M: `js/car/car-materials.js:4–37,93–133`; build: `js/car/car3d.js`; W: `js/render/webgpu/wgx.js:2764,2842` _interleave/_expandPull/layouts; V: `js/render/webgpu/wgsl-chunks.js`; pack: `js/render/shared/vertex-pack.js`.

Fixture and limits: Real material modules and loadParts Ferrari mesh (13–20, 71–73); source field lists, synthetic sections/zones; extracted real WGX packing and expansion with real quantisers (116–137); actual source arithmetic interpreted in JS with GPU f32 fetch emulation and dimension checks (190–267). Does not compile WGSL, submit GPU draws, or establish renderer boot.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| reserved finish ids are unique, past the shipped chain, and disjoint from FINISH_SURFACE | 25–36 | 27–28, 32–35 | M | Reserved material IDs unique, past shipped IDs and consistent with declared finish reservations |
| every new livery field is in every field list the game keeps | 38–52 | 48–49, 51 | M + field lists | six colors/six pills appear in persistent/draft/hint lists with type separation |
| zone finishes: a sidepod/fin/mirror finish remaps only that section's paint vertices | 54–60 | 59 | M | pod/fin/mirror finish remaps only matching paint sections |
| no zone field set = the whole-car finish path, byte for byte | 62–67 | 66 | M | inherited zone leaves whole-car satin behavior |
| every finish moves exactly the paint vertices of a built car to its surface id | 75–86 | 78, 81, 83–84 | M + build | every built-car finish moves exactly baseline paint count and preserves unrelated surfaces |
| a zone finish reaches the built mesh for its section only | 88–95 | 92–94 | M + build | built pod zone changes some paint only with count conservation |
| expanded finishes preserve nested-zone precedence, nose override and protected surfaces | 97–111 | 104, 107–109 | M | four expanded finishes honor nested zones/nose overrides and protect carbon/glass/emissive/mirror |
| WGX carries every packed car id independently of indexed vertex_index without growing its vertices | 139–158 | 142–143, 147, 150, 153, 155–156 | W + V + pack | 66 car IDs survive independent snorm padding route, 28-byte stride/storage/index preserved and unrelated bytes unchanged |
| WGX world prefix preserves natural surfaces and fractional fields without capturing invalid ids | 160–183 | 172–176, 178, 181 | W + V + pack | world integer/fractional IDs roundtrip with tolerance while invalid/malformed metadata retain fallback and unrelated bytes |
| WGX vertex transport delivers classified ids and rotates normals independently of normal.w | 269–295 | 279–286, 289–294 | W + V + pack | real layout/arithmetic preserves car/world classification, independent normals/shadow positions and explicit flat vs missing/road fragment fallback |
| WGX indexed expansion preserves packed car/world/fractional surface bytes through triangle reordering | 298–308 | 303, 305–306 | W + V + pack | reordered indexed expansion preserves all vertex bytes and storage sidecar in required triangle order |

## livery-helmet-style

Full read: `tests/unit/livery-helmet-style.test.mjs:1–111`. SHA-256 `c123b6cb50472503333a1f1d001983360bcc288f07bfc86cdbded090b4d55f7a`.

Targets: H: `js/car/helmets.js:388–421`; build: `js/car/car3d.js`; S: `js/garage/setup-sheet.js`; E: `js/garage/livery-design-editor.js`.

Fixture and limits: Ferrari real Car3D default-tier mesh, separate helmet VM, bounding-box helmet selector and outside record comparator (11–31). FIELD samples at 12×18 test pattern visibility independent of raster.

| Case (verbatim name) | Test range | Assertion spans | Target | Meaning / specific limit |
|---|---|---|---|---|
| team / unset / unknown style: mesh byte-identical, colours ignored | 33–37 | 36 | H + build | Team/unset/invalid style ignores picked colors and preserves mesh |
| each style repaints only the helmet vertices | 39–46 | 43–44 | H + build | each nonteam style changes mesh only inside helmet bounds |
| base and accent colours land on the shell, base alone under solid | 48–57 | 52, 55 | H + build | solid uses base only, remaining styles carry base/accent |
| design zones: cap on the crown, band round the shell, stripe front-to-back, chevron down the face | 59–72 | 63–67, 69–71 | H | selected angular/height samples verify cap/band/stripe/chevron/flash/split geometry |
| new styles stay distinct on the FIELD tessellation (not lost under the 12 x 18 mesh) | 74–90 | 85, 87 | H | all accent styles occupy at least six field cells and distinct masks |
| styled(): team/unknown returns the design itself; missing colours fall back to the design | 92–100 | 94–96, 98–99 | H | invalid/team styles preserve object identity while missing colors use design fallback |
| the garage lists the HELMET pill row, both colour rows and an editor section | 102–111 | 105–106, 108–110 | H + S + E | source UI builds and appends both color rows and editor section, exact style roster pinned |

## Assertion helpers and completeness

The case tables list direct assertions lexically inside each callback, including nested helpers declared within that callback. Reused assertions outside callbacks are additional setup/oracle checks:

| Test file | Shared helper assertion spans | Role |
|---|---|---|
| `light-presets.test.mjs` | 49: presets VM must assign an object | Fixture/oracle preconditions inherited by callers; not additional named tests. |
| `lighting-reapply.test.mjs` | 57: APPLY_RACE_IDS source anchor exists | Fixture/oracle preconditions inherited by callers; not additional named tests. |
| `lighting-sun-scratch.test.mjs` | 60: near compares each channel within 1e-12 | Fixture/oracle preconditions inherited by callers; not additional named tests. |
| `livery-design.test.mjs` | 204: editorFixture click requires an existing enabled button | Fixture/oracle preconditions inherited by callers; not additional named tests. |
| `livery-finish-contract.test.mjs` | 119,127: packing extraction boundaries; 194,200,203,219,221–223,226–229: actual layout/expression anchors and matching format/stride/shadow contract; 251,255,259,262: normal dimensional/operand and shadow-format invariants | Fixture/oracle preconditions inherited by callers; not additional named tests. |

Total: **180 test declarations**, **181 concrete named cases** after the flat/rounded loop expansion. All declaration rows, assertion spans, fixtures, real-source routes and material limitations are mapped. No skipped/todo declarations appear in the assigned files. This is source-review evidence only; execution outcomes remain unverified.

## Production/helper snapshot hashes

These hashes identify dependencies cited above; full-file length is identity metadata, not a claim that every production line was reviewed. Reviewed definition/source ranges are stated in the navigation paragraph and target lists.

| Dependency | File lines | SHA-256 |
|---|---|---|
| `js/agent/apex.js` | 2495 | `fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1` |
| `js/car/car-body-geom.js` | 2184 | `64e03e1a29424dc31a400125dd58c08d4cc6bb49b5600b61f9922b9774df4ecf` |
| `js/car/car-draw.js` | 2174 | `e6f5ad077eb89dd69f6b24bc1cab6fe3b87a2e8f43867d9d11108d8cf41765e6` |
| `js/car/car-materials.js` | 218 | `62c97ca53785694bc278a44102d1e1daed13ced517ff358041e523be34eb394e` |
| `js/car/car-mesh.js` | 2105 | `c13a3031510b4f20ac8c658c300a2e8bcee98f0599c658c5fd59d80deae28003` |
| `js/car/car-shade.js` | 892 | `7925b2a38efded2ef0298391dd6f9f1a27cfd1e9e2eae89d5936bfae692a9dbe` |
| `js/car/car3d.js` | 2899 | `d2ca91950cf1e65dc4161bda35b23148b409095016ed6618ca8ff7d0f714483e` |
| `js/car/custom-liveries.js` | 196 | `e1e4da7e32edcfbacb478dc474c9f70758b1388c6f9176386734aa0b043c8987` |
| `js/car/helmets.js` | 898 | `5d3f8631f6c8110ce5b6c86a5eb7fc7d54d1198f1cf0f83083e4289961b7e2e0` |
| `js/car/livery-design.js` | 377 | `b915ca64854f3a3a55414e4191cd56335fd69c1e18e47fd5720927b706f5ef61` |
| `js/car/livery-graphics.js` | 507 | `ddecd391e04e52d62731bd1669931de8b7d68f71c119882c1f39619b8a556c48` |
| `js/car/liverytex.js` | 2676 | `da5d9bec070227b89d688ac965af5210b4c7c99cc25724b62c16ce9c84a2e713` |
| `js/car/surface-outline.js` | 91 | `9755b8dcceb713a68c5f27146fad4ce93a6bba9601657cc8a9267d01ddff90f9` |
| `js/game.js` | 9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `js/garage/livery-design-editor.js` | 336 | `3136040bffa230743810cc988e9649e7827a525358b6e5b8bd16d0b3dfe59d0a` |
| `js/garage/setup-sheet.js` | 1725 | `4c6302ec91946cfb134e8155d314e421844d73524d6f3dac5e679efba699f4da` |
| `js/lighting/atmosphere.js` | 852 | `ec92281afd7017ffa361419ca0d9f226a88a5923e3ae582a106f52b8e2077982` |
| `js/lighting/frame-lights.js` | 769 | `f491413e9d00405865c3033be7b092107b7f1acbf5418d9df5303ba62457957e` |
| `js/lighting/knobs.js` | 258 | `ddcb861d37e0b881cd0dcd46eea21b0858552f30e3bcf1442b9fb3796cf8165d` |
| `js/lighting/presets.js` | 7228 | `3fd21c305419049ba13bd7f3616afd84725053bdb9c375ad111c6c17ceea9012` |
| `js/lighting/profiles.js` | 386 | `dd27530244bd9a7f0d269c356d1b589ba54153bc52d76e3c81294491874a76d8` |
| `js/lighting/track-lights.js` | 450 | `9c486661688c520f3f50344643b9031156ee31ca8e9c75c10f5023a8ebc8aed3` |
| `js/lighting/tuner-panel.js` | 465 | `88ecca2398df0f26ff1a892946450038bd358e378439c021054fb8e5f54f9a55` |
| `js/perf/quality-preset.js` | 259 | `99c8a546d722c21d6adeee6d72f689c5c3cfc305709f5935c0f303edcc621aa8` |
| `js/race/light-tune-edit.js` | 43 | `ecd00744a9ff70225441b71e5649cca327e792c398e6884cf18e41e47f28e79f` |
| `js/race/weather-arc.js` | 527 | `f37f07774dd376bb19dfaa88c0894b099cb7b542b46caf8ebbd81f2370bc8b1f` |
| `js/render/shared/vertex-pack.js` | 143 | `e2a915731b863bad067263b2d3af7888bd269464c9ab6ee01727a4b6d1d77a1c` |
| `js/render/webgpu/wgsl-chunks.js` | 2636 | `b292f62c1e082cc021ac6c566f9ac03a10c1e9b39dae2be6217fc8c645b060ee` |
| `js/render/webgpu/wgx.js` | 6085 | `7ce7dd4b81578e15a31cd102eb36229a8c2b7c8e59f65aed837cbfbe1888d855` |
| `js/ui/post-fx-opts.js` | 83 | `49b65f2768466fb76d1c92c2d86a2d1e74786489062404e04b97d0e01e5cba45` |
| `tests/helpers/mesh-distance.mjs` | 56 | `75c07bfb1c80ab42119fd48eb5dc45a4c897f6299dee868a366131c776732e7f` |
| `tools/car/livery-contrast.mjs` | 148 | `2f79e0f06fe976ed80baf732639d0bdef515a7eac589aefcd9ddb990e0c4642c` |
| `tools/car/parts-sweep.mjs` | 1011 | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
| `tools/ci/live-run-check.mjs` | 105 | `8f9000801fe09f4d16041fe636e23476f5b0b6d3e8bb2f983e9a241233742b90` |
| `tools/gfx/live-frame-census.mjs` | 313 | `d686a490fac4e591988c7f1c29623dd8ac6d96eda8075b8be7de4263994bde52` |
| `tools/lighting/ab-lighting.mjs` | 597 | `f4e180bd1835c09226c6f1b82ba331ac114472aa6960cb7469b42bb0f71ebb60` |
| `tools/lighting/lighting-tuner-sweep.mjs` | 228 | `56ae527e0d39a73ed0aa3bf40ec3749852636e448ee0705d91c397f983d3226b` |
| `tools/perf/lit-wgsl-census.mjs` | 193 | `42fd04dce333927bf0f795f4ea64cc14d34bd0117d3696d8848348ed6576a42d` |
