# Brakes — 2026 carbon disc / Brembo / scoop

Category `brakes`. Alias `brakeStyle` / `design.brakes`. Shared `Car3D.build`
mesh (GLX / WGX / TLX). Flat-shaded. Tyre tread, compound band, cover vanes,
hub cap, spokes, tape and dish are **untouched** — only the brake bits that
already live inside `addWheel`, plus the body-side duct fairings.

## Current draw sites (`js/car/car3d.js`)

| Site | Lines | What it draws today |
|---|---|---|
| `buildBrakeParts` | 1205–1214 | Defaults: `duct` from tier, `caliperPos` 0, `coverOpen` tier-2→1, `rotor` 1/2, `rotorScale` 1/1.12, `scoop` null (derive), `discFace` 0 |
| `addWheel` rotor | 437–454 | 18-seg gunmetal ring + `rotor*3` carbon vane boxes. Always metal `[0.24,0.24,0.26]` |
| `addWheel` cover `discFace` | 505–519 | Drilled (10) / slotted (6) **boxes on the aero cover**, not the disc |
| `addWheel` caliper | 569–587 | Three axle-aligned boxes on a ±10° arc + two pad plates + one crown bridge. Pads/bridge ignore `caliperPos` (hardcoded 12 o'clock) |
| Body `brakeDucts` | 2675–2698 | Per-side `DARK` inlet box scaled by `duct`. `scoop≥1` a flat carbon winglet; `scoop≥2` outboard fence + lower deflector. Rear is the box only |
| `buildWheel` / `buildWheelLayers` | 593–607 | Player wheels; caliper goes to `fixedOut` when layered |

Catalog already exposes `duct`, `caliperPos`, `coverOpen`, `rotor`,
`rotorScale`, `scoop`, `discFace` plus materials `cal` / `rim`
(`VISUAL_FIELD_REGISTRY.geometry.brakes` / `.material.brakes`).

## 2026 F1 look we are matching

Covered 18" wheels with a **carbon-carbon disc** (dark hatched face, aluminium
bell at the hat) glimpsed through the aero-cover cutouts. A **Brembo-style
radial monobloc** clamped at 12 o'clock: one casting, piston bosses on both
faces, a weight-saving window, mount ears toward the upright, a bleed nipple
on the crown — not three stacked cubes. Front brake duct is a **forward-facing
scoop**: carbon lips around an `INTAKE` void, not a shelf floating over the
tyre. `discFace` 1 = cross-drilled ring on the **rotor**; 2 = circumferential
slots on the **rotor**. Cover-face marks stay (they are the closed-cover tell).

## Knobs

Existing knobs keep their defaults. **One new geometry knob:**

| Knob | Default | 0 (shipped) | 1 | 2 |
|---|---|---|---|---|
| `caliper` | **0** | Current 3-box + pads + bridge, byte-identical | Brembo monobloc: body, window, 4 piston bosses/face, pads, mount ear, bleed | Six-piston: wider body, 6 bosses/face |

Gated extra (existing knobs, `=== 0` / default-tier inert):

- `rotor >= 2` — aluminium **bell/hat** ring inside the disc (additive quads). Ring + vanes at `rotor === 1` unchanged.
- `discFace > 0` — drilled/slotted **rotor-face** marks (additive `addBox` on each disc face). Cover marks at 505–519 stay so closed covers still read. `discFace === 0` adds nothing.
- Carbon tint (`SURFACES.carbon`, `[0.12,0.12,0.13]`) on the rotor ring only when `rotor >= 2` **or** `discFace > 0`. Default `rotor: 1, discFace: 0` keeps gunmetal metal.
- `scoop >= 1` — forward **inlet void + upper/lower lip** on the front winglet; small rear mouth. Existing winglet box stays. `scoop === 0` (default derive from `duct: 1`) unchanged.
- `scoop >= 2` — inboard cheek fence (existing outboard fence + deflector stay).

Integrator must append `"caliper"` to `VISUAL_FIELD_REGISTRY.geometry.brakes`
and add `["brakes", "caliper", 1]` to the `KNOBS` list in
`tests/specs/parts-physics.spec.js` (the deform/inert loop is hardcoded).
`NEUTRAL.brakes` needs no `caliper` key (merge default 0).

## Triangle estimate

`addBox` = 12 tris, `addQuad` = 2, rotor `SEG` = 18.

| Build | Brake tris | Delta vs today |
|---|---|---|
| Default body `Car3D.build(c,c,{noWheels:true})` — scoop derived 0, 4 duct boxes | 48 | **0** |
| Default wheels (`rotor: 1`, `discFace: 0`, `cal` null) | rotor ring 72 + 3 vane boxes 36, per face×2 | **0** |
| `scoop: 1` body extra | 3 front mouth boxes × 2 sides = 72; rear mouth 2 × 2 = 48 | +120 body |
| `scoop: 2` extra on top of 1 | 1 inboard cheek × 2 = 24 | +24 |
| `rotor: 2` hat | 18 quads × 2 faces = 72 / wheel | +72 / wheel |
| `discFace: 1` on rotor | 10 boxes × 2 faces = 240 / wheel | +240 / wheel |
| `discFace: 2` on rotor | 6 boxes × 2 faces = 144 / wheel | +144 / wheel |
| `caliper: 0` (if `cal` set) | 6 boxes = 72 / wheel | 0 |
| `caliper: 1` | ~15 boxes = 180 / wheel | +108 vs old caliper |
| `caliper: 2` | ~19 boxes = 228 / wheel | +156 vs old caliper |

Default-body delta **must be 0**: extra duct faces are behind `scoop >= 1`,
and wheels are excluded from the 2400-tri body cap.

SIGNATURE Ferrari (`discFace: 2`, derived `scoop: 1`, tagged `caliper: 1`):
body +120, and on AI wheels (4×) hat if tier-2 `rotor: 2` (+288) + slotted
rotor (+576) + monobloc vs 3-box (+432). Well under the 1.6× default-body
allowance for a single-option recipe; wheel tris sit outside the 2400 cap.

## Default-body byte identity

`buildBrakeParts` for recipe-less tier 1:

```
cal: null, duct: 1, rim: null, caliperPos: 0, coverOpen: 0,
rotor: 1, rotorScale: 1, scoop: null, discFace: 0, caliper: 0
```

`scoop` null + `duct: 1` → derived 0. No mouth, no cheek, no hat, no rotor
face marks, no caliper (and if `cal` were set, `caliper: 0` is the old mesh).
Rotor ring stays `[0.24,0.24,0.26]` / `SURFACES.metal`.

## SIGNATURE tagging

All eleven `tag: "SIGNATURE"` brake options get `caliper` (mesh-only; cost and
stats already match `equivalent`). Six-piston McLaren / Red Bull use `2`; the
rest use Brembo `1`. Universals that *are* those equivalents (`brembo_evo`,
`six_piston`, …) are tagged the same so buying the part in the garage shows
the new hardware — otherwise only AI FACTORY_PRESETS would.

See `parts-delta.json`.
