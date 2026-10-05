# Night mast pools — Qatar and Bahrain (2026-10-05)

PR #923, branch `claude/night-lamp-tuning`, commits `96fb75d83` (round 1) and
`377ce10de` (round 2). Dated: what was true on the deploy tip `a7d27757f` and on
those two commits. Cite it for the evidence, not for current values — the
presets are tuner data and move.

## Symptom

TLX, `tod night`, dry, orbit cam el 18 / dist 40 at frac 0.3. Both circuits
read washed out: the desert and run-off lit a uniform warm yellow out to the
terrain edge, road + kerbs + run-off one flat near-white plane with no
per-lamp pool, Qatar's pit straight and pit fronts near white at frac 0. Day on
the same cams was normal.

## Diagnosis (Node, no browser)

Measured by building the real circuit (`tools/track/verify-track.cjs`
`buildContext().build(def, { night: true })`), applying `*` + `*|night` +
`<id>|night|dry` from `js/lighting/presets.js` onto `LT`, running
`buildTrackLights` and `LampBake.bake` over it (terrain via `Tracks.terrainY`,
road splat on), and sampling the diffuse + `bounceK`-scaled bounce layers ×
`lampLevel` every 7 nodes on both sides at fixed lateral offsets. Units are the
bake's irradiance (before albedo and exposure).

1. **Reach.** Qatar and Bahrain are the only circuits lit by `floodMastRing`.
   `floodMast` registers `radius = min(110, 1.5 × throw)` (90–100 m), and the
   fleet night `lampRadiusMul` 1.9 (on all 52 `night|dry` presets) multiplied
   it to a **median 171 m (Qatar) / 144 m (Bahrain)**. Every other circuit's
   lamps stop at 53–79 m (abudhabi / madrid carry a few masts, max 124 / 159 m).
   With Qatar's `terrainOuter` 120, every visible terrain texel was in range.
2. **Bounce.** `bounceK` 0.3 (the knob's max; default 0.04) has no cone, so over
   that radius it lit the sand evenly — half the road's value on the road
   itself, and most of the off-road light.
3. **Core.** The masts stand 30–34 m out and 39 m up, aimed at the near lane
   ~30° off vertical; the `flood_bank` hot core is 37°. The mast's own foot and
   the run-off around it sat INSIDE the core and lit like the road. BEAM CONE
   WIDTH scales only the skirt and VALLEY BLEED only the out-of-beam floor, so
   no knob reached it — hence the new **BEAM CORE** (`beamCore`, LAMPS/POOLS,
   `rebuild:true`, def 1): scales each street post's / flood bank's core
   half-angle, skirt width kept, in `buildTrackLights`. The cone rides the
   light record, so the bake and all three backends follow with no shader edit.
4. **Moon.** The far desert stayed grey under `sunColor × keyMul 2.055`.
5. **Not the cause:** the night ambient band (~0.02 after `ambientMul`) and the
   fleet `lampLevel` / `exposureMul`. `lampTemp` −0.792 turned the 5700 K
   banks amber (1 : 0.84 : 0.67), which on sand read yellow.

The other night circuits (singapore, vegas, jeddah, abudhabi — all 52 share the
same `night|dry` numbers) do not share cause 1: baked light is ~0 by 50 m past
the edge. They were left unchanged. Other weathers on these two circuits set
none of these knobs, so they already resolve to the defaults.

## The change — `qatar|night|dry` and `bahrain|night|dry`

| knob | tip | round 1 | round 2 (shipped) |
|---|---|---|---|
| lampRadiusMul | 1.9 | 1.3 | 1.3 |
| bounceK | 0.3 | 0.06 | 0.06 |
| poolEnergy | 0.655 | 1 | 0.85 |
| lampTemp | −0.792 | 0 | 0 |
| beamCore | (1) | — | 0.5 |
| beamCone | (1) | — | 0.5 |
| bleedMul | (1) | — | 0.6 |
| keyMul | 2.055 | — | 1 |

## Bake numbers, Qatar / Bahrain

| | tip | round 1 | round 2 |
|---|---|---|---|
| lamp radius median | 171 / 144 m | 117 / 99 m | 117 / 99 m |
| road centre | 11.3 / 11.4 | 10.1 / 9.8 | 6.7 / 6.2 |
| road valley/peak (110 m windows) | — | 0.71 / 0.68 | 0.37 / 0.48 |
| edge + 25 m, % of road | 96 / 98 % | 102 / 101 % | 44 / 29 % |
| edge + 50 m | 44 / 35 % | 18 / 14 % | 17 / 14 % |
| edge + 100 m | 16 / 15 % | 4 / 3 % | 4 / 3 % |
| vertical pit wall at the line (edge + 15 m, 3 m up) | 5.3 / 4.8 | 2.8 / 2.8 | 1.85 / 1.72 |

## Live `lightState` (TLX, frac 0.3, orbit el 18 / dist 40, night, dry)

| | tip | round 1 | round 2 |
|---|---|---|---|
| qatar meanLampRGB | [7145, 6004, 4785] | [9550, 9327, 9605] | [8118, 7928, 8164] |
| bahrain meanLampRGB | [8871, 7653, 6252] | [11854, 11872, 12522] | [10076, 10091, 10643] |

Exposure 0.9, floodEmit 0.0858 (0.78 × `floodEmitMul` 0.11), numLights 16,
bakedLights 289 / 236 and lampPosts 204 / 233 were unchanged throughout; each
round's `meanLampRGB` matched the prediction from `poolEnergy` × the
`lampTemp` white balance exactly.

What the round-2 frames showed: Qatar frac 0.3 — grey-blue road with white
markings, run-off bright only inside the mast rows, dark desert, black sky;
Qatar frac 0 — the pit straight and pit fronts have contrast; Qatar eye cam —
lamp heads visible, pools along the road; Bahrain frac 0.3 — pools, dark hills
behind. Accepted.

## Lessons

- `lampRadiusMul` multiplies a mast's registered THROW radius, not just the
  theme's verge radius: a fleet-wide preset value tuned on 30–36 m verge lamps
  more than doubles a stadium mast's reach. Check the radius distribution
  (`buildTrackLights` record [6]) before reading a far-field wash as exposure.
- A night picture can be judged in Node before a browser: the bake is the
  shader's diffuse pool verbatim, so lateral-offset ratios and valley/peak
  along the centreline predict "pool vs plane" and "dark beyond the run-off".
