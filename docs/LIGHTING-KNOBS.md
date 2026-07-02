# Lighting knobs — what each tunable changes, and how to A/B it

Every hand-tuned lighting constant, what it *physically* does, and the metric
that must move when you change it. The machine-readable version of this table
lives in `tools/ab-lighting.mjs` (`KNOBS`) — each entry pins the EXACT source
string, an alternate value, a canonical scene, and an expected metric
direction.

```sh
node tools/ab-lighting.mjs list          # the catalog (marks which knobs are value-sweepable)
node tools/ab-lighting.mjs run all       # render A/B for every knob → scratch/ab/
node tools/ab-lighting.mjs run lampFog.base pcss.penScale
npm run test:ab                          # fast invariants + catalog integrity
```

## Dialling a value in (the tuning loop)

```sh
node tools/ab-lighting.mjs sweep lamp.radius 24 30 40   # render candidates → labelled strip + metrics
node tools/ab-lighting.mjs try lamp.bleed "<full replacement string>"   # structural knobs
node tools/ab-lighting.mjs apply lamp.radius 40         # adopt the winner
```

`sweep` works on any knob whose `find`/`b` differ by exactly one number (the
`list` output marks these `sweepable=<current>`); it renders the scene once
per candidate and writes a side-by-side strip plus the watched metric for
each. Structural knobs take `try` with a full replacement string instead.

`apply` is the write step, and it does three things atomically: swaps the
value into the real source file (only if the find-string is still unique),
self-syncs this catalog (the applied value becomes the new `find`, the old
value becomes the new `b`, edits confined to that knob's own entry — so the
catalog-integrity test stays green and the knob now A/Bs the reverse), and
bumps the `?v=` cache version in index.html. After applying: re-render the
knob to confirm, `npm run test:ab`, commit.

The harness serves the repo through an in-memory server and swaps the knob's
source string for variant B — the working tree is never modified, and the same
mechanism works for GLSL shader constants and JS driver constants alike.
Per-lamp flicker is frozen during renders so night A/Bs isolate the knob. Each
run writes `<knob>-AB.jpg` side-by-sides plus `results.json` with per-region
metrics (`mean`, `p10`, `p90`, `contrast`, `bloomPct`, `edgeE`).

A knob PASSES when swapping A→B produces a **visible change**: either a
whole-frame colour delta above the noise floor (per-channel, so a luma-neutral
hue shift still counts), OR a >3% move in its watched region metric (for knobs
whose footprint is small/localized — lamp halos, the fog band, a subtle
penumbra). The harness exits non-zero if any gated knob produces no visible
change — "this constant does nothing anymore" is a caught regression.

A handful of knobs are marked **`subtle`**: their effect is real but too small,
localized, or chromatically neutral for a robust automated whole-frame gate
(the lens-halo scale, the city-glow *hue* tint, the PCSS penumbra-growth rate).
These are still rendered, measured, and composited every run for human review —
they just don't fail the exit code. The `-AB.jpg` side-by-side is the judge.

`tests/lighting-ab.spec.js` additionally fails if any catalog `find` string no
longer matches its file exactly once, so retuning a constant forces the
catalog to follow.

## Lamp geometry & energy (game.js `buildTrackLights`)

| Knob | What it changes | Watch |
|---|---|---|
| `lamp.poolEnergy` — `0.55 / max(hAim/al, 0.35)` | Master lamp-pool energy scale (the 0.55) plus the raking-incidence clamp floor (0.35 — normalises pool luminance for shallow-angle beams; only engages on low masts). | road mean ↓ |
| `lamp.aimPoint` — `hw*0.5` | Where the beam lands: 0.5 = centre of the near lane (pool sits under the fixture — the "lamps emit downward" look); 0 = centreline (pool drifts inboard). | pool position, energy ~stable |
| `lamp.radius` — floodColor radii 28-36 | The windowing envelope `(1-(d/r)^4)^2`. Too small and the pool's far corner (21-25 m from the lens) silently dies. | road p90 ↓ when shrunk |
| `lamp.sodiumCone` (and every KIND `cIn/cOut`) | Hot-core size vs soft skirt. Wider inner cone = flatter pool = the "ambient wash" failure mode; the pool/valley rhythm lives here. | road contrast ↓ when widened |
| `lamp.bleed` — KIND `blB/blV` (0.06-0.16) | Out-of-beam light floor. Lifts the valleys between pools; too high erases the scallop rhythm, too low reads pitch black between masts. | road p10 |
| `lamp.glareW` — per-kind field 14 | drawGlow lens-halo strength AND size per lamp kind (0 = fixture-less lights get no halo — edge washers). | frame p90 |
| KIND `volW` — field 13 | Per-kind volumetric beam presence in GODRAY (flood banks 1.0 → tails 0.25). | beam-region mean at night-fog |

## Glowing fog & volumetrics

| Knob | What it changes | Watch |
|---|---|---|
| `lampFog.base` — `0.45 + 0.6*groundMist`, cap 0.9 | How strongly lamps tint the fog itself (the glowing-fog amount). Clear night ≈0.55, fog night ≈0.80, day 0. | fogwall mean |
| lampFog sun gate — `(0.55-sunLum)/0.30` | Cuts lamp-fog glow when the sun is bright (dawn/dusk mist already carries the sun tint; both together blew out). | dusk fog delta ≈ 0 |
| `lampFog.softClip` — `lf/(1+maxCh*0.7)` | Reinhard shoulder that stops a lamp cluster pushing the fog wall past the night bloom threshold (0.93) into white wash. | fogwall bloomPct |
| `lampFog.mistShare` — `lampFogC * 1.5` | Ground-mist share of the glow vs the air-fog share (mist hugs the road where the lamps aim). | near mean |
| `vol.lampRange` — `td < 200` | How far along each ray lamps volumetrically in-scatter (was 110 — distant lamps had no glow). | fogwall mean |
| `vol.beamHeight` — `exp(-Δy*0.07)` | Beam height falloff. Bigger constant = beams hug the road; smaller = tall light cones. | sky mean |
| `vol.lampStrength` — `0.05 + 0.65*mist`, cap 0.70 | Master beam strength, mist-swelled; the 0.05 base is the clear-night hint. | fogwall mean |
| GODRAY `N = 32` | March resolution: banding vs cost (half-res pass). | banding by eye |

## Ambient

| Knob | What it changes | Watch |
|---|---|---|
| `amb.bounceK` — `att * 0.04` | Per-lamp bounce fill: pool light bounced onto walls/kerbs/car flanks, outside the beam cone. The local-colour ("sodium verge") term. Budget: night frame mean lift < 10%. | wallL mean |
| `amb.nightCap` — capSky/capGnd bands | Night ambient ceiling: neon cities get a higher warm band than open circuits. B (old near-black) makes the foreground unreadable — that's the point of the test. | near p10 |
| `amb.cityGlowHue` — `0.82 + 0.28*cg/max` | Ambient hued toward the circuit's sky-glow (magenta canyons / amber towns); near energy-neutral. | colour cast, mean ~stable |

## Reflections

| Knob | What it changes | Watch |
|---|---|---|
| `ssr.dryFloors` — `lights ? 0.16 : 0.07` | Scene-mirror amount on DRY roads (night lamp sheen / day faint tower-and-sky mirror). Wet uses the wetness ramp directly. | road structure |
| `ssr.sheenFade` — `min(uReflect/0.20, 1)` | Below 0.2 the darker-mirror substitution fades quadratically — faint reflections read as sheen, not dark towers replacing sunlit tarmac. | day road mean stability |
| `ssr.roadMask` — `smoothstep(0.40, 0.75, upDot)` | Which surfaces count as "road" for SSR; the 0.40 edge keeps banked corners (Zandvoort) reflective. | banked road mean |

## Shadows

| Knob | What it changes | Watch |
|---|---|---|
| `pcss.penScale` — `(z-zb) * 80` | How fast penumbra grows with receiver-blocker gap (80 ≈ 3.2 m gap → full softness). | road edgeE ↓ when raised |
| `pcss.radiusRange` — `mix(1.5, 6.0, pen)` | Contact crispness → max softness range. B (6,6) = PCSS off, uniformly soft (the old fixed-radius look). | road edgeE |
| `shadow.box` — ortho ±55, snap 10 | Texel density (5.4 cm) vs guaranteed coverage radius (~48 m). Doubling the box halves density. | shadow edge sharpness |
| `shadow.biasClamp` — `(0.0005, 0.004)` | Acne (too low) vs peter-panning/detached shadows (too high). | road mean ↑ when over-biased |

## Surface detail (LIT_FS `uDetail` blocks)

| Knob | What it changes | Watch |
|---|---|---|
| `detail.reliefStrength` — `uDetail*0.4*mnFade` | Micro-normal relief strength: two-octave asphalt/verge bumpiness (fades 25→95 m and with wetness). B flattens it. | near edgeE |
| `detail.crackStrength` — `crack*0.30` (+ zone gate 0.40-0.70) | Crack line darkness and which stretches are cracked. Auto-fades to ~24% on wet roads (`min(uDetail*4,1)` with wet detail 0.06). | near p10 |
| `detail.patch` — `pm*0.05` albedo + `±0.08` roughness | Repair-patch visibility: fresh asphalt darker AND glossier than the weathered surround. | near mean |

## Night energy budget (the four-knob set that decides "how dark is night")

| Knob | What it changes | Watch |
|---|---|---|
| `night.glowAmp` — `glow * 2.3` | Emissive HDR push for windows/lenses/neon. This one constant is ~half the night frame energy; 3.2 was the historical too-bright look. | frame bloomPct |
| `night.floodEmit` — `0.78` | Prop emissive ramp after dark (how lit the lit geometry is). | frame mean |
| `night.exposure` — street 0.86 / other 0.90 | The master dark-stays-dark knob (ACES input scale). | frame mean |
| `night.bloomThresh` — `0.97` (+ bloom 0.65-0.70) | What counts as "bright enough to halo". Lowering it blooms the mid-tones — instant fog-of-glow. | frame bloomPct |

## Reading the metrics

- `mean` — plain region luminance; the workhorse.
- `p10` / `p90` — valley floor / pool peak; their ratio (`contrast`) is the
  pool-vs-valley scallop rhythm that makes light read as *cast by fixtures*.
- `bloomPct` — % of pixels near-white; the wash/blow-out tripwire.
- `edgeE` — mean horizontal gradient (edge energy); shadow-edge sharpness and
  fine-detail presence.

When you retune a value: run its knob, eyeball the `-AB.jpg`, keep the JSON.
When you *rename or restructure* code around a value: `npm run test:ab` tells
you which catalog entries to update.
