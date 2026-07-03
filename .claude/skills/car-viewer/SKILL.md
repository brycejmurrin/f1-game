---
name: car-viewer
description: Inspect the procedural F1 car in ISOLATION (no track) from any angle, distance, livery, parts spec, and lighting — a fast standalone "photo studio" for verifying js/car3d.js, js/liverytex.js, js/liveries.js, or js/parts.js changes. Renders the real GLX-shaded car + LiveryTex decals on a plain backdrop, with controllable point-light rigs for reflection/material tests. Triggers - "show me the car", "render the <team> livery", "how does the new wing/gearbox/brake look", "check the sponsors/number on the car", "test the reflections", "car from the front/side/rear", "does the accent colour read".
---

# Car viewer — isolated car photo studio

A track-free way to look at just the car. Two front-ends over the same page:

- **Interactive:** open `tools/carview.html?…` in a browser — drag to orbit, wheel
  to zoom, dropdowns for team/livery/parts/lighting, keys for tod/exposure.
- **Headless (what you'll usually use):** `tools/render-car.mjs` loads that page,
  screenshots it from named preset angles (or a custom one), and writes a PNG per
  view + an `index.html` contact sheet under `tools/render-out/<team>/`.

It uses the real `GLX` renderer + `Car3D.build` + `LiveryTex` atlas, so what you
see is what races. No track/scene loads, so it's much faster than an in-race
`__apex.carOrbit` shot — prefer it for car-only checks. (For cockpit/hood cameras
or the car on a real circuit, use the `inspect-scene` skill instead.)

## Prereq

A static server for the repo root on port 3456:

```sh
python3 -m http.server 3456        # or: npx serve -l 3456 .
```

## Headless render

```sh
node tools/render-car.mjs [--views=a,b,c] [options]
# examples:
node tools/render-car.mjs                                   # mclaren, hero shot
node tools/render-car.mjs --team=ferrari --views=all        # every angle, contact sheet
node tools/render-car.mjs --team=redbull --views=tail,side --tod=night
node tools/render-car.mjs --team=haas --gearbox=f1_spec --brakes=ceramic --views=tail
node tools/render-car.mjs --team=mclaren --az=205 --el=18 --dist=6 --rig=rim   # custom angle + lighting
```

Then **Read the PNG(s)** it prints (e.g. `tools/render-out/ferrari/side.png`) to
look at the result. Output lives under `tools/render-out/<team>/` — throwaway,
don't commit it.

### Preset views (orbit az: 0 = behind, 180 = head-on)
`hero` (rear-3/4, default) · `front` · `rear` · `side` · `frontquarter` ·
`rearquarter` · `nose` (top-down on the number) · `tail` (rear wing + shark fin) ·
`top`. Groups: `--views=turntable` (5 around) or `--views=all`.
Or one ad-hoc angle: `--az=<deg> --el=<deg> --dist=<m>` (overrides `--views`).

### Options
- Car: `--team=` `--livery=` `--num=` and any part to inspect its geometry:
  `--engine= --aero= --brakes= --gearbox= --ers= --tyres= --suspension= --fuel=`
  (option ids are in `js/parts.js`).
- Lighting: `--tod=day|dusk|dawn|night|void` · `--rig=studio|3point|rim|topdown|none`
  · `--intensity=<n>` · `--exp=<n>` (exposure/brightness) · `--bg=RRGGBB`.
- Reflection tests: `--rig=rim` or `--rig=3point` throw hard speculars across the
  clearcoat; `--plight=x,y,z,r,g,b,intensity,radius` adds a point light (repeatable);
  `--sweep=1` orbits a bright light around the car so highlights sweep.
- `--w= --h=` viewport, `--url=` base URL (default `http://127.0.0.1:3456`).

## Interactive page (`tools/carview.html`)

Same params via the query string, e.g.
`tools/carview.html?team=ferrari&livery=fer_matte&az=40&el=16&dist=6&rig=3point&plight=3,2,3,1,0.8,0.6,3,14`.
Controls: **drag** orbit · **wheel** zoom · **1-5** tod presets · **+/−** exposure ·
**,/.** light intensity · **l** toggle sweep light · **space** turntable · **r** reset ·
`?hud=0` hides the panel for a clean frame.

Headless JS API on the page (used by the batch tool, handy from Playwright):
```js
CARVIEW.ready                              // true once the first frame drew
CARVIEW.angle(az, el, dist)                // re-aim the camera
CARVIEW.set({team, livery, num, parts:{gearbox:'f1_spec'}, tod, rig, intensity, exp, bg, sweep})
CARVIEW.addLight([x,y,z], [r,g,b], intensity, radius)   // probe light for reflections
CARVIEW.clearLights()
```

## Notes / gotchas

- **Decals need the reflected handedness.** The in-race car model matrix is a
  reflection (det −1), and decal UVs are authored for it, so the viewer draws the
  car through `REFLECT_X`. `carview.html`'s `carDecalData()` mirrors
  `game.js` — if you change the decal layout in `game.js`, update it here too or
  the sponsors/number will drift.
- Part **geometry** differences only show when you force the option
  (`--gearbox=f1_spec` etc.); the default build is the baseline look.
- A blank/near-black frame usually means the server isn't up or `CARVIEW.ready`
  never fired — the batch tool exits non-zero and says so.
