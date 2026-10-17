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
node tools/car/carshot.mjs 40 day 2 artifacts/tmp/apex-carshot.jpg   # az tod teamIdx out (CLI; no MCP wrap since 2026-09)
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

## Capture speed and freshness

`garage-angles` accepts `--backend=three` (TLX) or `--backend=webgl2` (the
legacy default). Use `--livery=shipped` to keep each team's shipped/custom paint,
rather than selecting the catalog `default` livery. For example:

```sh
node tools/shot/garage-angles.mjs --backend=three --livery=shipped --team=all --full-views --views=hero,front,side,rear,top,wingFront,wingRear
```

Garage sessions pause rendering while idle and wait for an actual present after
the final camera mutation. The native garage uses the renderer's present signal;
its race camera counter does not advance. `apex_garage` forwards `backend` on
`op open` and accepts `livery: "shipped"`.

`render-car` reuses the shared owned Chromium launcher and generation barrier;
there is no timed-success fallback. `--jpeg --quality=80` saves smaller review
images and updates the contact sheet's filenames; PNG remains the default.
`carshot` uses construction/presentation barriers instead of fixed sleeps and
accepts shared capture profiles, browser/GPU selection, tracing and asset cache
flags. Its JSON sidecar records readiness, backend and capture timing. Three.js
scene captures use the renderer's native readback in the presenting task, avoiding
a black compositor surface; page scope requires `--backend=webgl2`. Black or
HUD-only frames are rejected.

## Angle grids

```sh
# ONE Chromium, many angles (soft #game-soft/#view → CDP — never page.screenshot):
node tools/garage-angles-fetch.mjs --out artifacts/garage-before   # BEFORE pack; do not recapture the grid
node tools/shot/garage-angles.mjs --team=redbull --views=spine --out=scratch/renders/garage-spine
# every axis is a LIST — one boot walks the product (--plan prints it first):
node tools/shot/garage-angles.mjs --team=redbull,ferrari --part.engine=all --views=hero,side --plan
node tools/car/carshot.mjs 40 day 2 artifacts/tmp/carshot.jpg  # tiny cropped JPEG
```
