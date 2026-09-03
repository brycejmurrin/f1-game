# Lighting presets — per-track / time / weather

Goal: ship a hand-considered lighting-tuner preset for **every track × time-of-day ×
weather**, baked into `js/game/light-presets.js`. This doc is the shared brief: the
per-track subagents read it, and it tracks which tracks are done.

---

## How a preset resolves (later wins)

```
TUNE_DEFS default  →  file "*"  →  file "track|tod|wx"  →  player localStorage
```

- `js/game/lighting.js` `TUNE_DEFS` holds each knob's factory **default**.
- `js/game/light-presets.js` `window.LightPresets` holds the shipped overrides:
  - `"*"` — a **global baseline** applied to every condition (currently `carGloss: 0.35` near-matte paint, plus the shipped broadcast HDR grade: blacks/shadows/midtones/highlights/whites/toe/shoulder and small gainR/gainB trims).
  - `"track|tod|wx"` — a per-condition override that wins over `"*"`.
- A player's live tuner edits always win over the file; RESET falls back to the file.

**Key format:** `trackId|timeOfDay|weather`
- `timeOfDay` ∈ `dawn | day | dusk | night`  (the session "default" resolves to the track's own day/night)
- `weather` ∈ `dry | wet | rain | fog | overcast`
- So up to **20 combos per track**. Only list the knobs that should differ from the
  default/baseline for that combo — sparse is good (3–10 knobs each is typical).
  Omit a combo entirely if the default already looks right there.

---

## Global baseline (`"*"`)

| knob | value | why |
|---|---|---|
| `carGloss` | 0.35 | near-matte paint across the board (one notch above the slider min) |

Don't re-specify a `"*"` value in a per-condition preset unless you're deliberately overriding it.

---

## What each condition should feel like (intent)

- **day / dry** — clean daylight, natural contrast. A little `shadowTintAmt` (cool shadows)
  reads as a crisp sunny day. Desert tracks lean warm (`tint`+, `sunTemp`−); temperate/green
  tracks stay neutral-to-cool.
- **dawn** — low warm sun just up: `sunTemp`− (warm), `grMul`↑ (god-rays), `mistDensity`↑
  (ground mist), softer key. Pink/gold mood.
- **dusk** — golden hour: warm `sunTemp`−, `grMul`↑, floods just switching on. Richer, warmer than dawn.
- **night** — genuinely dark; the **lights do the work**. Street/city tracks: `cityGlowMul`↑,
  `glowAmp`↑, `floodEmitMul`↑, `starBright` low (city washes stars). Open/desert tracks: rely on
  floods (`lampLevel`, `poolEnergy`), keep ambient low, `starBright`↑ for a clear desert sky.
- **wet** — mirror-road: `ssrWetMul`↑, `wetDark`↑ (darker tarmac), cooler `tint`−, a touch more cloud.
- **rain** — wet + weather: keep `ssrWetMul` up, `fogDensityMul`↑ (lower visibility), `lightning`
  (storms), cooler and flatter. `rainCount` for storm density.
- **fog** — `fogDensityMul`↑↑, `mistDensity`↑, desaturate (`saturation`−), reduced reach, cooler/greyer.
- **overcast** — flat soft light: `keyMul`− (weaker sun), `ambientMul`↑ (soft fill), `cloudCover`+,
  low shadow contrast (`shadowStr`−), slight desaturation, cool-neutral `tint`.

### Theme cheatsheet
- `desert` (bahrain, abudhabi, qatar) — warm/amber, dusty warm `fogTint`+, high hard sun by day, floodlit at night, clear starry skies.
- `street_night` (baku, jeddah, singapore, vegas) — neon city; big `cityGlowMul`/`glowAmp` at night, warm-cool neon mix, reflective streets when wet.
- `street_day` (monaco) — Mediterranean harbour warmth, bright day, glamorous.
- `modern` (miami, madrid, mexico, shanghai) — city skyline backdrop, moderate, some neon at night.
- `green` (spa, silverstone, monza, suzuka, imola, interlagos, montreal, cota, hungaroring, redbull, zandvoort, albert_park) — natural parkland; cooler, lush; several are weather-prone (spa, zandvoort, interlagos) so wet/overcast matter more.

---

## Knob reference (id · range · default · effect)

_(from `TUNE_DEFS` in `js/game/lighting.js`. Focus on the per-condition-relevant ones; leave the rest at default.)_

_This list is auto-generated from `TUNE_DEFS` (ranges + defaults are exact). Some
knobs (e.g. `ssaoRadius`, `mistShare`, `carClearcoat`, `wetness`, `blackLift`,
`chromAb`, `grain`, `sharpen`, `speedBlur`) are repair/stylistic and rarely need a
per-condition preset — focus on the ones the intent notes above call out._

### SUN & MOON
- `keyMul` [0..4] def 1 — direct sun/moon intensity (diffuse + speculars + shadows)
- `sunTemp` [-2..2] def 0 — key white-balance (sun by day, moonlight at night); − warm, + cool
- `sunElev` [-60..60] def 0 — sun/moon height offset (deg); − lower = longer shadows + god-rays
- `sunAzim` [-180..180] def 0 — rotates the key-light compass direction
- `moonBright` [0..3] def 1 — moon disc/halo + soft blue fill (night)
- `grMul` [0..4] def 1 — volumetric sun-shaft / god-ray strength (dawn/dusk)
- `sunShaftMul` [0..4] def 1 — screen-space crepuscular rays from the sun disc (separate post pass from `grMul`)

### AMBIENT & BOUNCE
- `ambientMul` [0..4] def 1 — hemisphere fill (shadow/unlit + night readability floor)
- `ambTemp` [-2..2] def 0 — fill white-balance; − warm bounce, + cool sky
- `ambBalance` [-2..2] def 0 — tip fill toward ground(−) or sky(+)
- `nightAmbLift` [0..4] def 1 — scales the moody-night ambient floor/cap band ("how dark is night" master)
- `bounceK` [0..0.3] def 0.04 — lamp bounce onto walls/kerbs/car flanks

### SHADOWS
- `shadowStr` [0..2] def 1.15 — shadow darkness; lower lifts toward ambient, >1 crushes
- `shadowRange` [16..160] def 80 — sun shadow box half-size (m)
- `pcssPen` [5..500] def 80 — how fast shadows soften with caster distance
- `shadowBias` [0..0.01] def 0.001 — depth offset (acne vs peter-pan)
- `shadowTintAmt` [0..1.5] def 0 — cool-blue tint on shadowed areas (sunny-day look)
- `carShadow` [0..1] def 1 — real sun-projected car shadows (per-frame car-only map; desktop WebGL2 tier)
- `aoStr` [0..3] def 1 — SSAO crease/contact darkening
- `ssaoRadius` [0.1..4.1] def 0.6 — world-space reach of AO sampling
- `contactStr` [0..3] def 1 — grounding shadow under car/props

### LAMPS
- `lampLevel` [0.02..1.5] def 0.26 — lamp brightness ceiling (street posts + flood banks)
- `floodDay` [0..1.5] def 0 — light lamps during DAY sessions (0 = off; lit-stadium look under a blue sky)
- `poolEnergy` [0.05..2] def 0.55 — per-lamp pool luminance
- `lampRadiusMul` [0.3..3] def 1 — pool reach
- `bleedMul` [0..5] def 1 — out-of-beam floor (lifts valleys)
- `glareStr` [0..1.5] def 0.12 — lens-halo strength
- `lampTemp` [-2..2] def 0 — lamp white-balance; − sodium/amber, + LED/white
- `lampFlicker` [0..0.6] def 0.1 — aging-lamp pulse
- `beamCone` [0.4..2.2] def 1 — lamp cone width

### NIGHT GLOW & BLOOM
- `floodEmitMul` [0..3] def 1 — lit buildings/windows/signage brightness
- `glowAmp` [0.2..6] def 2.3 — HDR push for windows/neon/lenses
- `cityGlowMul` [0..5] def 1 — light-pollution dome on the horizon
- `cityGlowWarm` [-2..2] def 0 — skyglow dome white-balance + warm hue cast into night ambient
- `bloomMul` [0..4] def 1 — halo strength around bright sources
- `bloomSpread` [0.3..4] def 1 — halo width
- `threshOff` [-0.5..0.2] def 0 — bloom threshold offset (lower = mid-tones glow)
- `bloomKnee` [0..1] def 0.5 — how much bloom is suppressed over bright pixels (0 = milky, 1 = crisp)

### ATMOSPHERE
- `fogDensityMul` [0..5] def 1 — haze depth / distance fade
- `fogHeight` [0..0.2] def 0.018 — fog altitude falloff
- `fogTint` [-2..2] def 0 — haze white-balance; + warm/dusty, − cool/overcast
- `mistDensity` [0..4] def 1 — low ground mist (dawn/humid/fog)
- `mistHeight` [0.04..1.2] def 0.30 — ground-mist band height
- `lampFogBase` [0..1.5] def 0.45 — lamp tint on distant fog (clear night)
- `lampFogHaze` [0..2.5] def 0.6 — extra lamp-fog as haze/rain thickens
- `mistShare` [0..6] def 1.5 — ground-mist vs air-fog share of the lamp glow
- `fogClip` [0..2.5] def 0.7 — soft shoulder stopping lamp clusters whiting out the fog
- `lampVolBase` [0..0.8] def 0.05 — volumetric beam strength (clear)
- `lampVolHaze` [0..2.5] def 0.65 — beam swell in haze/rain
- `lampVolCap` [0..1.5] def 0.70 — beam ceiling

### ROAD & REFLECTIONS
- `ssrWetMul` [0..2.5] def 1 — wet-road mirror strength
- `ssrDryNight` [0..1] def 0.08 — dry tarmac lamp/neon sheen (night)
- `ssrDryDay` [0..0.6] def 0.07 — dry tarmac sky/tower sheen (day)
- `roadRough` [0.05..1.2] def 1 — dry tarmac roughness (lower = glossier)
- `surfDetail` [0..3.5] def 1 — road/terrain grain relief
- `ssrThick` [0.02..5] def 0.20 — SSR depth tolerance
- `wetDark` [0..2] def 1 — how much darker wet asphalt reads

### CAR
- `carReflect` [0..2.5] def 0.05 — world mirror on bodywork
- `carEnvCube` [0..1] def 0.3 desktop / 0 mobile — live cubemap probe (ON by default on desktop; mobile stays OFF for GPU cost)
- `carGloss` [0..1.6] def 1 — paint gloss (**`"*"` baseline 0.35 matte — leave alone unless a track needs different**)
- `carSpecular` [0..3.5] def 1 — specular highlight brightness
- `carClearcoat` [0..3.5] def 0.05 — lacquer coat catching crisp glints
- `carMetal` [0..5] def 1 — how metallic the paint reads
- `carGlow` [0..5] def 1 — night/wet livery self-glow
- `tailLightMul` [0..5] def 1 — trailing red glow on nearby cars

### SKY & WEATHER
- `cloudCover` [-1..1] def 0 — cloud amount offset (+ more)
- `cloudSpeed` [0..8] def 1 — cloud drift speed
- `starBright` [0..4] def 1 — night star intensity
- `wetness` [-0.05..1] def -0.05 — road wetness override (AUTO = follow weather)
- `rainCount` [20..1400] def 360 — rain streak density
- `rainStreak` [0.2..4] def 1 — rain streak length
- `rainWind` [-2..2] def 0.18 — rain slant
- `lightning` [0..6] def 1 — storm strike rate
- `weatherSunMute` [0..2] def 1 — how much bad weather dims the sun (0 = never, >1 = deeper murk)

### IMAGE & COLOUR
- `exposureMul` [0.1..3] def 1 — master brightness (pre-tonemap)
- `contrast` [0.5..3] def 1.12 — midtone gamma
- `saturation` [0..3] def 1 — colour intensity
- `vibrance` [0..1.5] def 0.20 — selective saturation on dull pixels
- `tint` [-2..2] def 0 — warm(+)/cool(−) white balance
- `gradeStr` [0..4] def 1 — cinematic split-tone amount
- `shadowHue` [-180..180] def 0 — split-tone shadow hue rotation
- `hiHue` [-180..180] def 0 — split-tone highlight hue rotation
- `vignette` [0..1] def 0.80 — corner darkening (lower = stronger)
- `vignetteSoft` [0.1..0.92] def 0.35 — vignette reach/inner edge (lower = broader, higher = thin corner ring)
- `blackLift` [0..0.2] def 0.005 — raised black floor (matte film base)
- `whitePoint` [0.4..4] def 1 — highlight roll-off knee
- `chromAb` [0..5] def 0 — lens colour-fringing (RGB split)
- `grain` [0..0.3] def 0 — film grain
- `flareMul` [0..3.5] def 1 — sun/lamp flare strength
- `sharpen` [0..2] def 0 — post-FXAA crispness
- `speedBlur` [0..2] def 0 — radial speed blur

**Rules of thumb:** stay within each range; keep edits tasteful (small offsets read better
than extremes); never re-state a knob at its default; respect the `"*"` matte-paint baseline.

---

## Progress

Status: ⬜ todo · 🟨 proposed (agent) · ✅ baked into `light-presets.js`

All 40 circuits now have a full `tod × weather` grid (800 condition keys plus `"*"`).

Full-grid **mcp-probe `look-survey`** (chase + `park` + `snapCam`). Contact
sheets land in [`docs/look-survey/`](look-survey/README.md) as each circuit
hits all 20 looks (`python3 tools/look-survey-sheet.py --ready`). First visual
pass was 4 looks × 40 circuits; the remaining 16 per track are still shooting.
Cross-cutting from the frames:
- Desert/street **nights** often flood/neon-hot with dusk-orange horizons —
  lamps, bloom, exposure, city glow pulled so lights own a darker sky.
- Weather-prone and many parkland **day|dry** looks had drifted toward
  overcast — sun/key lifted so rain/overcast keep the murk.
- Dawn on night-default tracks was often stadium-lit (`sunElev` too low);
  sun lifted and floods dimmed.
- Auto luma/`lightState` hints caught hot night p90 bloom and hot dusk on
  the remaining day-default circuits; hand-reviewed the first wave of
  night-defaults + weather greens + Monaco/Monza/Suzuka/Miami/Albert Park.
`"*"` unchanged. Jeddah night-dry at frac 0.35 reads as dark neon canyon
(intentional); Baku re-shot at frac 0.28.

| Track | id | theme | default | status |
|---|---|---|---|---|
| Abu Dhabi | `abudhabi` | desert | night | ✅ |
| Albert Park | `albert_park` | green | day | ✅ |
| Bahrain | `bahrain` | desert | night | ✅ |
| Baku | `baku` | street_night | night | ✅ |
| COTA | `cota` | green | day | ✅ |
| Hungaroring | `hungaroring` | green | day | ✅ |
| Imola | `imola` | green | day | ✅ |
| Interlagos | `interlagos` | green | day | ✅ |
| Jeddah | `jeddah` | street_night | night | ✅ |
| Madrid | `madrid` | modern | day | ✅ |
| Mexico City | `mexico` | modern | day | ✅ |
| Miami | `miami` | modern | day | ✅ |
| Monaco | `monaco` | street_day | day | ✅ |
| Montreal | `montreal` | green | day | ✅ |
| Monza | `monza` | green | day | ✅ |
| Qatar | `qatar` | desert | night | ✅ |
| Red Bull Ring | `redbull` | green | day | ✅ |
| Shanghai | `shanghai` | modern | day | ✅ |
| Silverstone | `silverstone` | green | day | ✅ |
| Singapore | `singapore` | street_night | night | ✅ |
| Spa | `spa` | green | day | ✅ |
| Suzuka | `suzuka` | green | day | ✅ |
| Las Vegas | `vegas` | street_night | night | ✅ |
| Zandvoort | `zandvoort` | green | day | ✅ |
| Buenos Aires | `buenos_aires` | green | day | ✅ |
| Catalunya | `catalunya` | modern | day | ✅ |
| Estoril | `estoril` | modern | day | ✅ |
| Hockenheim | `hockenheim` | green | day | ✅ |
| Indianapolis | `indianapolis` | modern | day | ✅ |
| Istanbul | `istanbul` | green | day | ✅ |
| Jacarepaguá | `jacarepagua` | modern | day | ✅ |
| Kyalami | `kyalami` | green | day | ✅ |
| Magny-Cours | `magny_cours` | green | day | ✅ |
| Mugello | `mugello` | green | day | ✅ |
| Nürburgring | `nurburgring` | green | day | ✅ |
| Paul Ricard | `paul_ricard` | modern | day | ✅ |
| Portimão | `portimao` | green | day | ✅ |
| Sepang | `sepang` | green | day | ✅ |
| Sochi | `sochi` | modern | day | ✅ |
| Watkins Glen | `watkins_glen` | green | day | ✅ |

---

## Per-track proposal file

Subagents never write `js/game/light-presets.js` (a partial bake wipes every
other key). Each track writes one JSON file, then the parent merges:

```
artifacts/lighting/proposals/<id>.json
node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs
```

```json
{
  "track": "sepang",
  "theme": "green",
  "nightDefault": false,
  "notes": "equatorial haze; monsoon rain should read thick",
  "combos": {
    "day|dry": { "fogDensityMul": 1.35, "tint": 0.12, "shadowTintAmt": 0.08 },
    "night|rain": { "lampLevel": 0.34, "ssrWetMul": 1.3, "fogDensityMul": 1.7 }
  }
}
```

`combos` keys are `tod|wx`. Values are sparse knob maps. Merge snaps against
live `TUNE_DEFS` in `js/game/lighting.js` (ranges/steps there win over the
table in this doc) and refuses unknown ids, out-of-range, or off-grid values.
Do not re-state a knob at its `TUNE_DEFS.def`, and do not re-state a `"*"`
baseline (`carGloss` 0.35, the shipped HDR grade) unless this condition must
override it.

## Workflow

1. One subagent per track proposes presets for all meaningful `tod × wx` combos (this doc = its brief; it also reads `js/circuits/<id>.js` for palette/locale).
2. Each subagent writes `artifacts/lighting/proposals/<id>.json` only.
3. Parent merges with `merge-proposals.mjs`, flips the row to ✅, then
   `node tools/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`) after the last js edit.

### Tuning one condition for the whole grid

The per-track pass above is the fine work. When the thing being decided is what a
CONDITION should feel like — "dusk in the wet" everywhere, not Bahrain in
particular — the tuner's **COPY ALL** row does the fan-out: it writes the
condition on screen to every other circuit at the same time-of-day and weather
(`LightStore.copyToTracks`, `__apex.lightCopy()`).

| chip | what lands on the other tracks | use it for |
|---|---|---|
| `MY EDITS` | only the knobs tuned on this condition, merged over each target's own | a change of INTENT for that condition — every circuit keeps its own character underneath |
| `FULL LOOK` | every live value, overriding each target's shipped per-condition preset | levelling a condition you want identical everywhere, or re-basing it before per-track work |

Then `COPY VALUES` and bake as usual. The export is `window.LightEdits` — the
LOCAL profiles only, current condition first — so a spread condition arrives as
one `"track|tod|wx"` entry per circuit and `merge-proposals.mjs` folds them into
`light-presets.js` without touching anything else. Note that a `FULL LOOK`
spread writes every live knob on 39 circuits, so the export after one is the
largest a delta gets; `MY EDITS` stays small. Both chips arm on the first click
and fire on the second, and `UNDO` reverts the whole fan-out while the panel is
open.

**`FULL LOOK` is the destructive one.** It writes a local profile that outranks
the shipped preset for every knob on 39 circuits, which is exactly what makes the
grid uniform — and exactly what erases the per-track character this doc's intent
notes describe. Reach for `MY EDITS` unless the uniformity IS the goal.
