# Garage finishes and parts — survey and proposal (2026-10-17)

Lane: car livery / finish / parts customization. Asked by Bryce: "can we add more finishes or consider how to
customize other parts etc". This is PART 1 (survey + proposal). No feature code; what to build is Bryce's ruling.
Sources read: `js/car/car-materials.js`, `car-material-shade.js`, `car3d.js`, `liveries.js`, `livery-design.js`,
`js/garage/setup-sheet.js`, `js/ui/settings-export.js`, the GLX / TLX / WGX lit shaders, `tools/carview.html`.

## 1. What exists today

**Finishes (7, whole-car).** `CarMaterials.FINISH_SURFACE = {satin 26, chrome 27, matte 28, carbon 31, brushed 29,
pearl 30}`; gloss (surface 20) is the default and remaps nothing. The garage chip row is derived from that table
(`["gloss", ...Object.keys(FINISH_SURFACE)]`), so a new row appears in the UI by itself.

**Per-zone finishes.** `coverFinish`, `wingFinish`, `haloFinish` (pill rows, default `inherit`). `applyFinish` walks the
mesh `sections` and rewrites ids only on vertices that are still `SURFACES.paint` (20), so carbon parts, glass, rubber
and decals are never touched. The mesh already names these sections: `engineCover frontWing rearAssembly halo
sidepods sharkFin mirrors suspension brakeDucts wheels sponsorBoard bodyDetail` — only three have a finish field.

**Mechanism.** A finish is a vertex surface-id remap, not a uniform and not a texture: the lit shader branches per id
(GLX `glsl-lit.js` `surfaceId == 26..31`, mirrored in TLX `tsl-lit.js` and WGX `wgsl-chunks.js`; the shade numbers
are pinned in `car-material-shade.js` and `tests/unit/car-materials.test.mjs`). Ids 20–33 are taken; 34+ is free.

**Paint design (already rich).** 21 spine-top pattern overlays (`livery-design.js` PATTERNS: gradient, twoTone,
checker, camo-adjacent shards/herringbone, speedlines ...) with `patternTint/patternSecond`, placement, width, repeat,
opacity, rotation; `bodySplit` (left/right two-tone); `lower` / `upper` zone colours; 19 spine-top and 16 spine-side
designs; `numFont`; sponsors pill; `wingCarbon`; fin shape/style/badge. Pattern overlays are painted into the livery
atlas, so they cost no shader work.

**Saved.** Custom liveries live under `apex26.livery.<team>` / `apex26.livery.custom.<team>`; the garage file
(`apex26-garage-v1`, prefixes `parts. livery. setup. setupPresets.`) carries them, and `applyGarage` validates shape per
key. A new livery field is added in exactly two places (`LIV_DRAFT_COLORS|PILLS`) plus `Liveries.forTeam`'s copy list,
and a `LIV_ROW_HINT` entry (`tests/unit/team-livery.test.mjs` pins it). **Unknown or missing field = today's look**, so
any new field degrades by construction; an unknown finish string already falls back to the livery finish / gloss
(`finishOf`).

**Parts that change the look today** (catalog, 12 categories, mesh-only `visual` recipes): engine cover/inlets,
aero wings and floor, suspension, brakes (caliper colour `cal`, rim colour `rim`, rotor, ducts), tyres (band colour
per compound, sidewall lettering rings), wheels (spokes, tape, dish, deflectors, nut colour), exhaust/fuel flame
colour, cockpit. These are **catalog choices** (cost/stat bearing), not free colour pickers.

## 2. Render evidence (car studio, TLX/GLX soft path, Ferrari, day, same camera)

The sheet (committed on `track-survey-assets`, not here — repo rule: no new docs images) shows the seven shipped finishes via
`node tools/car/render-car.mjs --team=ferrari --preset=livery --finish=<f>` (one small tooling change: `finish` is now
a forwarded `render-car` flag; `carview.html` already honoured `?finish=`).

Sheet: <https://github.com/brycejmurrin/f1-game/blob/014ff2d6c2268e6c3f7840074c37788ce905204b/gallery/garage-finishes/garage-finishes-current.jpg?raw=1> (branch `cursor/garage-finishes-survey-4f2a`, based on `track-survey-assets`).

Findings from the sheet:

- **Chrome reads as near-white on a red car** — the env mirror dominates the albedo, so team identity is lost; it
  works on dark/neutral paints (the liveries that ship it are all dark or neutral). A "tinted chrome" (mirror with
  albedo-coloured reflection) is the real gap here, not a new finish.
- **Pearl and brushed are close at this angle** (both read pinkish-silver); pearl's hue swing needs grazing angles, so
  in the garage's default 3/4 it is the weakest-distinct finish. Strengthening it is cheaper than adding a neighbour.
- Satin vs gloss is subtle at day; matte and carbon are unmistakable.

## 3. Finishes: gap vs real motorsport and candidates

Cost model: every candidate is **ALU in the existing per-id branch, no new texture, no new draw call, no new uniform**
unless noted. Phone budget: there is no per-finish number documented in the repo (`docs/RENDERERS.md` /
`PERF-FINDINGS.md` carry none), so the rule used here is *a finish may add a vertex-id branch and ≤ ~12 ALU ops in the
near field (fade to the base colour beyond ~26 m like the weave/brush fades), no extra texture fetch, no extra shader
variant*. The three backends branch on an id inside one uber-shader, so ids add code size, not variants.

| Candidate | Exists? | Per-backend render | Cost | Risk | Studio proof |
|---|---|---|---|---|---|
| Gloss / satin / matte / chrome / brushed / pearl / carbon | yes | shipped, parity-tested | — | — | sheet above |
| **Metallic flake** (sparkle in the clear) | no | object-space hash noise × view-dependent spec boost; near-field only; same code on GLX/TLX/WGX | low (~10 ALU, id 34) | moiré/shimmer under motion → must fade by distance and use the same AA discipline as `weaveFade` | prototype in slice 1 |
| **Candy / tinted clear** | no | darker saturated base + saturated fresnel rim; high gloss | low (id 35) | on-screen saturation near bloom threshold | prototype in slice 1 |
| **Tinted chrome** (mirror in team hue) | partial (chrome is untinted) | multiply env lobe by albedo | trivial (edit id 27 path, flag-gated) | changes shipped chrome cars → needs opt-in | slice 1 variant |
| **Strong pearl / chameleon** | partial (pearl 30) | widen the cos-palette sweep, second hue from `patternSecond` | low | needs a second colour field | follow-up |
| Two-tone / fade | **yes, paint-only** (`bodySplit`, `lower/upper`, `gradient`/`twoTone` patterns) | atlas | 0 | only discoverability | UI "finish packs" |
| Camo / pattern overlays | **yes** (21 patterns) | atlas | 0 | a `camo` painter is one more PATTERNS id | new painter only |
| Carbon weave | yes (31) | shipped | — | — | sheet |
| Wet-look | no | gloss + clearcoat bump (no new id: a uniform on id 20) | trivial | indistinguishable from gloss at phone distance | skip |
| Glow / neon accents | no | needs emissive; id 25 is **reserved** for the rain light (`car3d.js` ~936) | medium + bloom cost on phone | collides with the rain-light contract; bloom is the phone's most expensive pass | defer; do as a *part* (wheel nut / brake disc tint) |

**Ranked top 5 finishes (value per cost):**
1. **Tinted chrome** — fixes the one visibly weak shipped finish (white-washed red car); trivial, opt-in flag.
2. **Zone finishes for the remaining named sections** (`sidepods`, `sharkFin`, `mirrors`) — 0 shader cost, reuses
   `applyFinish`, turns 7 finishes into per-part combinations (matte body + chrome mirrors + carbon fin).
3. **Metallic flake** — the finish players ask for first; new id, near-field-only ALU.
4. **Candy** — second new id, same pattern as flake; shares the saturation-guard code.
5. **Pearl strengthening / chameleon** — makes an existing finish read at default camera; needs a second colour.

## 4. Parts beyond paint

| Part | Today | What it needs | Class | Value/cost |
|---|---|---|---|---|
| Wheel rim colour / finish | rim colour comes from the **brakes catalog option** (`visual.rim`), nut colour from wheels option; no player pick | livery field `rimTint` + `wheels` section finish, passed to `addWheel(rimColor)` (already a parameter) | paint-only | high |
| Brake caliper colour | per brakes option (`cal`) | livery `caliperTint`; `BRAKE_CALIPER` fallback exists | paint-only | high |
| Tyre sidewall stripe / ink | band colour by compound (`TYRE_BAND`), lettering rings by tyre option | `sidewallInk` colour on surface 33 vertices | paint-only | medium |
| Helmet / driver suit | designs keyed by race number (`helmets.js`), generated for unknown numbers; **no player pick** | UI over the existing zone vocabulary (per-vertex colour, no texture) | paint-only, UI-heavy | medium |
| Mirrors / endplates / sidepod inlets | `mirrors`, `sidepods` sections exist; colour follows c1/c2 | zone tint + zone finish fields | paint-only | medium |
| Car number font | exists (`numFont`) | — | done | — |
| Decal / sticker placement | sponsors pill, fixed stations | per-station offsets in the atlas | atlas only | low |
| Halo shape | halo tint + finish exist | new meshes for shape | mesh | low |
| Brake-disc glow | rotor mesh exists | emissive vertex colour at heat; avoid id 25 | mesh colour + physics-adjacent state | low |
| Underglow / exhaust flames | exhaust flame colour from fuel option | new quad + bloom | new mesh + bloom | skip on phone |

**Ranked top 5 parts:** (1) wheel rim tint + finish, (2) caliper tint, (3) zone finishes/tints for sidepods, fin and
mirrors, (4) tyre sidewall ink, (5) player helmet picker.

## 5. Recommended first slice

**Slice 1 — "FINISH PACK A" (paint-only, flag-less because it degrades by construction):**
- `podFinish`, `finFinish`, `mirrorFinish` zone fields (same pill row shape as `coverFinish`, default `inherit`), plus
  `rimTint` / `caliperTint` colour rows with `LIV_ROW_HINT` text and the garage-file validation;
- tinted-chrome as an opt-in finish id **only if** Bryce wants shipped chrome liveries left alone (new id 34
  `mirrorTint`), otherwise no new shader id at all in slice 1.
- Spec: a new livery-zone-finish spec (new group in `tests/groups.json`, TESTING.md §5 row, `npm run gen`),
  plus unit coverage in `car-materials.test.mjs` / `team-livery.test.mjs`; before/after car-studio sheets.
- No change to physics, parts stats or `__apex` physics hooks. Old garage files load unchanged (missing field = today).

**Slice 2** — metallic flake + candy (two shader ids across GLX/TLX/WGX, shade numbers pinned in
`car-material-shade.js`, WGX/TLX parity test, phone-safe fade). **Slice 3** — sidewall ink + player helmet picker.

## 7. More candidates (second pass — same cost model, still unrendered)

**More finishes.** All are ids in the existing per-id branch (≤ ~12 ALU, near-field fade, no texture) unless noted.

| Candidate | Idea | Cost / risk |
|---|---|---|
| Gunmetal / anodised | metal-lobe finish with a dark tinted albedo (between brushed 29 and chrome 27) | trivial; reuses the `METAL` constants; reads on phone because the dark env boost already exists |
| Gold / rose-gold plate | chrome with a fixed warm tint, ignoring livery hue | trivial; overrides team colour on purpose, so opt-in per zone (mirrors, halo, wing) rather than whole car |
| Frosted / ice satin | satin + cool fresnel rim | trivial; near-duplicate of satin at phone distance — only worth it as a zone finish |
| Oil-slick / holographic | pearl with a wider cos-palette and a higher blend (needs `patternSecond`-style second hue) | low; the strongest "wow" per ALU after flake, but moiré-prone on motion |
| Suede / velvet | matte + fresnel brightening at grazing angles | low; cheap, but looks like matte face-on |
| Race-worn (grime, scuffs, tyre-marbles) | **not** a finish: a per-race wear tint driven by race progress | medium; couples livery to race state and the field LOD — defer, and keep it out of the garage save |
| Flat vintage / non-reflective | matte with the env lobe forced off | trivial; arguably matte already covers it |

**More parts / zones.** Sections already named in the mesh: `sponsorBoard`, `sidepods`, `sharkFin`, `mirrors`,
`suspension`, `brakeDucts`, `wheels`, `bodyDetail`, `bolsters`, `cockpit`, `driver`, `helmet`, `exhaust`.

| Part | Today | Needs | Class |
|---|---|---|---|
| Suspension arm colour (carbon vs painted vs polished) | section `suspension` exists | a `suspensionFinish` field | paint-only |
| Brake-duct / bargeboard trim colour | `brakeDucts` section; floor board built in `car3d.js` | tint field | paint-only |
| Cockpit steering wheel grips / marker | `getCockpitWheel(liv, style)` is already livery-keyed | expose grip colour as a livery field | paint-only, player-visible in cockpit camera |
| Seat bolsters / cabin trim | `bolsters`, `cockpit` sections | tint field; cockpit view dims light accents already (`_ckAcc`) | paint-only |
| Sponsor board colour | `sponsorBoard` is an opaque panel at the pod line | tint, keep sponsor ink legible via the existing contrast guards | paint-only |
| Exhaust tip heat colour | tip glow comes from the fuel option | player pick of heat tint | paint-only, exhaust section |
| Rear-light / rain-light colour | surface 25 is reserved and contractual | do **not** expose | skip |

**Revised ranking after this pass.** Finishes: unchanged top 5; add *gold/gunmetal as zone-only finishes* to slice 1
because they are free once zone fields exist. Parts: add *steering-wheel grip colour* and *suspension finish* to slice 1
for the same reason (a field plus a section map entry); keep helmet picker in slice 3.

## 6. Not verified here / caveats

- The candidate shader finishes (flake, candy, tinted chrome) have **no render yet**: a believable proof needs the
  prototype itself; slice 1/2 delivers it. Only shipped finishes are rendered above.
- Phone cost is argued from the shader structure (id branch, no texture), not measured on a device; a slice that adds
  an id should dispatch `gpu-census.yml` (macos) per `AGENTS.md`.
- Pattern, zone and finish counts above were read from source on `claude/f1-game-project-26h3ng` @ `bf2b3dd5`.
