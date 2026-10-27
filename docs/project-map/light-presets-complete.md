# Lighting preset data: complete source map

Read 2026-10-27 in `/workspace/f1-game`. This closes the preset continuation in [lighting-fx-complete.md](lighting-fx-complete.md). All 7,228 lines of `js/lighting/presets.js` were visibly read, including the previously pending 201–7228. SHA-256: `3fd21c305419049ba13bd7f3616afd84725053bdb9c375ad111c6c17ceea9012` (matches the original lighting ledger). Source remained untouched; no browser, game runtime, tests, or commit was run by this lane. Parent owns documentation checks and commits.

Read `AGENTS.md`, `.claude/skills/code-nav/SKILL.md`, and the lighting/FX map. Attached apex-lsp references and hover corroborate the consumer contract. The data census below parses the source with installed Espree; it does not execute the preset script or constitute rendering validation.

## Exact read ledger

All intervals are inclusive. Each successful interval was returned without truncation. The attempted combined 6401–7228 read was truncated and is excluded; its three smaller replacement reads cover every line.

| File | Inclusive ranges inspected |
|---|---|
| `js/lighting/presets.js` | 1–800; 801–1600; 1601–2400; 2401–3200; 3201–4000; 4001–4800; 4801–5600; 5601–6400; 6401–6800; 6801–7000; 7001–7228 |
| Supporting consumer context only | `js/lighting/profiles.js` 1–80, 80–205, 230–266; `js/core/lazy-bundles.js` 725–745; `js/lighting/knobs.js` 1–45 |

The complete earlier lighting/FX implementation ledger remains in the companion map; these supporting excerpts do not claim another complete implementation pass.

## Schema and coverage

The file has one strict-mode assignment, `window.LightPresets = { ... }`; no functions, computed keys, imports, mutations after construction, or export wrapper. Values are sparse objects whose property names are registry knob IDs and whose leaf values are numeric literals (including unary negatives). It is JavaScript rather than JSON: comments and trailing commas are authored syntax.

AST inspection finds 1,056 unique top-level keys, 7,500 numeric leaf members, 127 distinct knob IDs, zero duplicate top-level keys, and zero duplicate knob properties within a row. The 1,040 track rows cover all 52 authored tracks × four times (`dawn`, `day`, `dusk`, `night`) × five weather keys (`dry`, `fog`, `overcast`, `rain`, `wet`), with no missing cells. There are no authored `storm` or `default` keys: the consumer resolves those aliases. Sixty-one rows are empty, all dawn/day wet conditions; an empty row inherits the shared/default layers and is valid.

The authored track IDs are abudhabi, albert_park, bahrain, baku, buenos_aires, catalunya, cota, estoril, hockenheim, hungaroring, imola, indianapolis, interlagos, istanbul, jacarepagua, jeddah, kyalami, madrid, magny_cours, mexico, miami, monaco, montreal, monza, mugello, nurburgring, paul_ricard, portimao, qatar, redbull, sepang, shanghai, silverstone, singapore, sochi, spa, suzuka, vegas, watkins_glen, zandvoort, fuji, jerez, korea, okayama, anderstorp, brands_hatch, buddh, dijon, donington, mont_tremblant, mosport, and zolder. This is a census of this file, not an independent roster synchronization assertion.

The remaining sixteen entries form the inheritance structure:

| Key class | Rows | Meaning |
|---|---:|---|
| `*` | 1 | Seventeen common paint/film-curve values, including carGloss and lift/gamma/gain channels |
| `*|<tod>` | 4 | perChunkLights 0.3 for each TOD, applied only when the renderer exposes the capability |
| `*|<tod>|<weather>` | 11 | dawn dry/wet; day dry/wet/rain; dusk dry/wet; night dry/wet/overcast/fog |

All 7,500 authored leaves are finite numbers and refer to known IDs in the 191 min/max registry definitions extracted from `knobs.js`; every authored number lies within that ID's declared range. This checks bounds and names, not the slider step lattice or visual intent. Sparse rows deliberately omit most registry knobs; the registry supplies those defaults.

## Resolution and consumers

LSP `LightPresets` references return seven occurrences in four files: assignment at presets:2; lazy-bundles:733/737; game:2492; profiles:156/176/239. The query explicitly reports a text-match fallback because the window property is untyped; hover returns `any`. This is navigation evidence, not a claim of a checker-enforced schema.

`LightStore.key()` maps `default` to track.def.night ? night : day and `storm` to rain. `keyFor()` redirects sunElev/sunAzim to the same track/TOD dry row in every weather. The ordinary effective value is registry default → shipped global → shipped shared condition → shipped track condition → capability TOD layer → player global → player condition, then registry clamp. Shipped values are looked up at call time, so lazy installation takes effect without replacing the store. Unknown fields would be ignored because application iterates TUNE_DEFS; none occur in this snapshot.

perChunkLights has its own merge: explicit track pin is combined with the capability layer using max(track pin, conditional value); player layers still win. Thus Monaco's authored zero in night dry/wet becomes 0.3 on a capable renderer, while its roadChunkLamps 1 remains an independent knob. On a renderer without the capability, the conditional TOD stamp is absent. The shared dawn/wet perChunkLights 1 can be replaced by conditional 0.3 when no track pin exists; shared and track pins have different precedence.

`ensureLightPresets()` returns immediately when the global exists, shares an in-flight script promise, reads back the global after loading, reports false on failure, and applies tuning after success. The loader records failure for a later race retry. The game also consults the global during race start. Presets provide values; the store, atmosphere and renderer own their interpretation and lifecycle (mapped in the companion report).

## Data variations worth preserving

Most rows are small environmental deltas, not full snapshots. Dawn/dry rows retain per-track azimuth (128.5 fleet, Paul Ricard 144.5) plus local mist, exposure or tint exceptions. Dawn/wet is unusually broad at the shared layer: 84 knobs cover grade, paint, sky, particles, lamp volumes and rain as well as lighting. Its zero cloudCover, short rainSpeed/rainStreak, drizzleCount 0.30 and ssrWetMul 1.28 are authored choices, not missing data.

Dry daylight differentiates desert/high-key tracks (Bahrain, Qatar, Vegas), coastal haze (Sepang and its related data), and altitude/clear-air looks (Kyalami/Fuji/Okayama). Fog/overcast/rain generally add denser air and softer key/shadows with local humidity, rain count, lightning and wind variations. Negative cloudCover and temperature offsets are valid signed knobs. Rain rows are distinct from wet rows; dry sun angles still resolve for both.

Night/dry has a conspicuous common per-track surface stamp: starBright 1.6, fogTint 0.06, lampFlicker 0, roadRough 1.13, ssrWetMul 0.34, surfDetail 2.45, tint 0.06 and wetDark 1.47, with local beam/pool/sky exceptions. Bahrain and Qatar retain lampRadiusMul 1.3; Qatar now has poolEnergy 0.6 and ssrDryNight 0.05, while Bahrain has poolEnergy 0.85. Abu Dhabi/Jeddah/Madrid have their own narrower beam and pool pins. Silverstone's cityGlowMul 2.35, reach 0.42 and warm/tint overrides are local authored sky exceptions.

Monaco night/wet is the largest track row (35 knobs), retaining a broad paint/grade snapshot and perChunkLights/roadChunkLamps pins. Spa dusk dry/wet retain elevated ambient/key and specific twilight controls; Spa night/wet retains a local sixteen-knob pool/fog/exposure profile, including radius 0.9 and ssrWetMul 0.9. Nürburgring and Anderstorp dusk/dry each have nineteen detailed knobs and sunElev 4.6 / sunAzim 96.5. Their bright sun offset is unusual but valid; no visual defect is inferred.

The final tracks are compact one-line rows rather than another schema. Several preserve common source-family data (Fuji/Okayama/Kyalami; Brands Hatch/Donington/Silverstone weather; Buddh/Sepang; Dijon/Magny-Cours; Mont Tremblant/Montreal; Mosport/Watkins Glen; Zolder/Spa weather), with individual dry/TOD exceptions. Similarity alone is not evidence of erroneous duplication or permission to collapse them.

## Proven comment discrepancy candidates

No source comments were edited. The shared night/dry rationale at presets:78–83 says Bahrain/Qatar's poolEnergy 1 was measured against radius 1.3. The current authored rows retain radius 1.3 but have poolEnergy 0.85 and 0.6 respectively; the later Qatar comment at 4916 describes its newer 0.6 trim. If the first text is retained as historical evidence, explicitly date/label the former energy rather than suggesting it is current.

The same block says the shared trims use radius 0.9 at presets:78–79, while the shared night/dry row at 95 uses 0.8. The later weather-matrix rationale at 122 explicitly records the 0.9 → 0.8 tightening, so the first block should identify its earlier revision. Spa's explicit 0.9 exception still matches the source.

Historical measured luma, old fleet stamps and explanatory before/after comments elsewhere are not independently revalidated by this source read. No data value is declared visually wrong from this pass, and no comment cleanup requires changing authored tuning.
