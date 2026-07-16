# Lighting presets — per-track / time / weather

Goal: ship a hand-considered lighting-tuner preset for **every track × time-of-day ×
weather**, baked into `js/light-presets.js`. This doc is the shared brief: the
per-track subagents read it, and it tracks which tracks are done.

---

## How a preset resolves (later wins)

```
TUNE_DEFS default  →  file "*"  →  file "track|tod|wx"  →  player localStorage
```

- `js/game/lighting.js` `TUNE_DEFS` holds each knob's factory **default**.
- `js/light-presets.js` `window.LightPresets` holds the shipped overrides:
  - `"*"` — a **global baseline** applied to every condition (currently `carGloss: 0.35`, near-matte paint).
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

### SUN & MOON
- `keyMul` [0..2.5] def 1.0 — direct sun/moon intensity (diffuse+spec+shadows)
- `sunTemp` [-1..1] def 0 — key white-balance; − warm, + cool
- `sunElev` [-40..40] def 0 — sun height offset (deg); − lower = longer shadows + god-rays
- `sunAzim` [-180..180] def 0 — key compass direction
- `moonBright` [0..1.5] def 1.0 — moon disc/halo + blue fill (night only)
- `grMul` [0..2.5] def 1.0 — sun-shaft / god-ray strength (dawn/dusk)

### AMBIENT & BOUNCE
- `ambientMul` [0.3..3] def 1.0 — hemisphere fill (shadow/unlit + night readability floor)
- `ambTemp` [-1..1] def 0 — fill white-balance; − warm bounce, + cool sky
- `ambBalance` [-1..1] def 0 — tip fill toward ground(−) or sky(+)
- `bounceK` [0..0.15] def 0.04 — lamp bounce onto walls/kerbs

### SHADOWS
- `shadowStr` [0..1] def 1.0 — shadow darkness; lower lifts toward ambient
- `shadowRange` [32..96] def 64 — sun shadow box half-size (m)
- `pcssPen` [10..300] def 80 — how fast shadows soften with distance
- `shadowBias` [0..0.005] def 0.001 — depth offset (acne vs peter-pan)
- `shadowTintAmt` [0..1] def 0 — cool-blue tint on shadowed areas (sunny-day look)
- `aoStr` [0..1.5] def 1.0 — SSAO crease/contact darkening
- `contactStr` [0..1.5] def 1.0 — grounding shadow under car/props

### FLOODLIGHTS (night/dusk/dawn)
- `lampLevel` [0.05..1] def 0.26 — floodlight brightness ceiling
- `poolEnergy` [0.1..1.2] def 0.55 — per-lamp pool luminance
- `lampRadiusMul` [0.5..2] def 1.0 — pool reach
- `bleedMul` [0..3] def 1.0 — out-of-beam floor (lifts valleys)
- `glareStr` [0..0.8] def 0.12 — lens-halo strength
- `lampTemp` [-1..1] def 0 — lamp white-balance; − sodium/amber, + LED/white
- `beamCone` [0.7..1.5] def 1.0 — flood cone width

### NIGHT GLOW & BLOOM
- `floodEmitMul` [0..1.6] def 1.0 — lit buildings/windows/signage brightness
- `glowAmp` [0.5..4] def 2.3 — HDR push for windows/neon/lenses
- `cityGlowMul` [0..3] def 1.0 — light-pollution dome on the horizon
- `bloomMul` [0..2] def 1.0 — halo strength around bright sources
- `bloomSpread` [0.5..2.5] def 1.0 — halo width
- `threshOff` [-0.3..0.1] def 0 — bloom threshold offset (lower = mid-tones glow)

### ATMOSPHERE
- `fogDensityMul` [0..3] def 1.0 — haze depth / distance fade
- `fogHeight` [0..0.12] def 0.018 — fog altitude falloff
- `fogTint` [-1..1] def 0 — haze white-balance; + warm/dusty, − cool/overcast
- `mistDensity` [0..2.5] def 1.0 — low ground mist (dawn/humid/fog)
- `mistHeight` [0.08..0.8] def 0.30 — ground-mist band height
- `lampFogBase` [0..1] def 0.45 — lamp tint on distant fog (clear night)
- `lampFogHaze` [0..1.5] def 0.6 — extra lamp-fog as haze/rain thickens
- `lampVolBase` [0..0.4] def 0.05 — volumetric beam strength (clear)
- `lampVolHaze` [0..1.5] def 0.65 — beam swell in haze/rain
- `lampVolCap` [0..1] def 0.70 — beam ceiling

### ROAD & REFLECTIONS
- `ssrWetMul` [0..1.5] def 1.0 — wet-road mirror strength
- `ssrDryNight` [0..0.5] def 0.08 — dry tarmac lamp/neon sheen (night)
- `ssrDryDay` [0..0.3] def 0.07 — dry tarmac sky/tower sheen (day)
- `roadRough` [0.4..1.4] def 1.0 — dry tarmac roughness (lower = glossier)
- `surfDetail` [0..2] def 1.0 — road/terrain grain relief
- `wetDark` [0..1.3] def 1.0 — how much darker wet asphalt reads

### CAR
- `carGloss` [0.3..2.5] def 1.0 — paint gloss (**baseline 0.35 matte — leave alone unless a track needs different**)
- `carReflect` [0..1.5] def 0.05 — world mirror on bodywork
- `carSpecular` [0..2] def 1.0 — specular highlight brightness
- `carGlow` [0..3] def 1.0 — night/wet livery self-glow
- `tailLightMul` [0..3] def 1.0 — trailing red glow on nearby cars

### SKY & WEATHER
- `cloudCover` [-0.5..0.5] def 0 — cloud amount offset (+ more)
- `cloudSpeed` [0..4] def 1.0 — cloud drift speed
- `starBright` [0..2.5] def 1.0 — night star intensity
- `rainCount` [60..900] def 360 — rain streak density
- `rainWind` [-0.8..0.8] def 0.18 — rain slant
- `lightning` [0..3] def 1.0 — storm strike rate

### IMAGE & COLOUR
- `exposureMul` [0.5..1.6] def 1.0 — master brightness
- `contrast` [0.7..1.6] def 1.12 — midtone gamma
- `saturation` [0..2] def 1.0 — colour intensity
- `vibrance` [0..0.8] def 0.20 — selective saturation on dull pixels
- `tint` [-1..1] def 0 — warm(+)/cool(−) white balance
- `gradeStr` [0..2.5] def 1.0 — cinematic split-tone amount
- `vignette` [0.4..1] def 0.80 — corner darkening (lower = stronger)
- `flareMul` [0..2] def 1.0 — sun/lamp flare strength

**Rules of thumb:** stay within each range; keep edits tasteful (small offsets read better
than extremes); never re-state a knob at its default; respect the `"*"` matte-paint baseline.

---

## Progress

Status: ⬜ todo · 🟨 proposed (agent) · ✅ baked into `light-presets.js`

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

---

## Workflow

1. One subagent per track proposes presets for all meaningful `tod × wx` combos (this doc = its brief; it also reads `js/tracks/<id>.js` for palette/locale).
2. Proposals are baked into `js/light-presets.js` and the row flipped to ✅.
3. Bump `index.html` `?v=` + `version.json`, verify no page errors, then push.
