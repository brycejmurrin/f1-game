# Car viewer — isolated car photo studio

Track-free look at just the car. Two front-ends over the same page:

- **Interactive:** `tools/carview.html?…` — drag orbit, dropdowns, tod keys.
- **Headless:** `tools/car/render-car.mjs` — named angles, PNG + contact sheet
  under `scratch/renders/cars/<team>/`.

Real `GLX` + `Car3D.build` + `LiveryTex`. Prefer this for car-only checks;
cockpit/hood on a circuit → **playwright-probe** `shot.mjs`.

## Prereq

Every command below boots Chromium (BROWSER-ONLY); `render-car` needs the `:3456` server, `carshot`/`garage-angles` self-boot.

```sh
node tools/car/carshot.mjs 40 day 2 artifacts/tmp/apex-carshot.jpg   # az tod teamIdx out (CLI; no MCP wrap)
python3 -m http.server 3456        # or: npx serve -l 3456 .
node tools/car/render-car.mjs                                   # mclaren hero
node tools/car/render-car.mjs --team=ferrari --views=all
node tools/car/render-car.mjs --team=redbull --preset=livery   # side / front-3/4 / rear-3/4 livery shot
node tools/car/render-car.mjs --team=redbull --preset=spine
node tools/shot/garage-angles.mjs --team=redbull --views=spine --out=scratch/renders/garage-spine
node tools/shot/garage-angles.mjs --plan --preset=mark --team=redbull --spineLogo=wrap
node tools/shot/garage-angles.mjs --fast --preset=quick --team=redbull --spineLogo=wrap
```

`--preset=spine` / `--shot=label,az,el,dist` (repeatable) keep ONE Chromium for
many angles. Garage multi-angle: `tools/shot/garage-angles.mjs` (soft-present
`#game-soft` capture; `--preset=wall|fin|flank|mark`, `--plan`, `--fast`).
See **garage-parts-livery** `references/garage-angles.md`. Batch audits: `tools/car/audit-parts.mjs` →
`scratch/renders/parts/<category>/`; `tools/car/audit-aero.mjs` →
`scratch/renders/aero/`.

`--refl` is a **studio dial** on all shine — not in-game chrome
(`finish:"chrome"` on a livery). Related: **garage-parts-livery**,
**lighting-tuner**.

## Load on demand

- Preset views / shot sets, CLI options, `CARVIEW` API, decal handedness →
  [references/car-viewer-presets.md](car-viewer-presets.md).
