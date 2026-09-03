---
name: car-viewer
description: Use when the user asks to show/render/check the car, inspect a team livery, sponsors, number, wing/gearbox/brake/part geometry, reflections/material finish, isolated F1 car, or front/side/rear/car-viewer shots in Apex 26.
---

# Car viewer — isolated car photo studio

Track-free look at just the car. Two front-ends over the same page:

- **Interactive:** `tools/carview.html?…` — drag orbit, dropdowns, tod keys.
- **Headless:** `tools/car/render-car.mjs` — named angles, PNG + contact sheet
  under `scratch/renders/cars/<team>/`.

Real `GLX` + `Car3D.build` + `LiveryTex`. Prefer this for car-only checks;
cockpit/hood on a circuit → **playwright-probe** `shot.mjs`.

## Prereq

```sh
node tools/car/carshot.mjs 40 day 2 artifacts/tmp/apex-carshot.jpg   # az tod teamIdx out (CLI; no MCP wrap since 2026-09)
python3 -m http.server 3456        # or: npx serve -l 3456 .
node tools/car/render-car.mjs                                   # mclaren hero
node tools/car/render-car.mjs --team=ferrari --views=all
node tools/car/render-car.mjs --team=redbull --views=tail,side --tod=night
```

Read the PNGs it prints. Batch audits: `tools/car/audit-parts.mjs` →
`scratch/renders/parts/<category>/`; `tools/car/audit-aero.mjs` →
`scratch/renders/aero/`.

`--refl` is a **studio dial** on all shine — not in-game chrome
(`finish:"chrome"` on a livery). Related: **garage-parts-livery**,
**lighting-tuner**.

## Load on demand

- Preset views / shot sets, CLI options, `CARVIEW` API, decal handedness →
  [references/presets.md](references/presets.md).
