# Car-viewer presets, options, page API

Load this when picking a `--preset`, a custom orbit, or the live `CARVIEW` API.

## Preset views

Orbit az: 0 = behind, 180 = head-on.
`hero` (rear-3/4, default) · `front` · `rear` · `side` · `frontquarter` ·
`rearquarter` · `nose` (top-down on the number) · `tail` (rear wing + shark
fin) · `top`. Groups: `--views=turntable` (5 around) or `--views=all`.
Ad-hoc: `--az=<deg> --el=<deg> --dist=<m>` (overrides `--views`).

## Named shot sets (`--preset=<name>`)

3 purpose-built shots per preset (overrides `--views`). `--preset=list` prints
names.

- `wing` (alias `aero`) — behind / front / front-3-quarter. Clears the
  rear-wing endplate at every downforce level.
- `engine` `brakes` `tyres` `ers` `gearbox` — close, part-focused (main +
  ±30°), aimed via a `look` offset at the part (front axle z≈+1.7 / rear
  z≈-1.6 in `js/car/car3d.js` `addWheel`). `ers`/`fuel` default to dusk.
- `suspension` `fuel` — kept **wider** on purpose: wishbones are thin/dark
  inboard of the wheel; fuel tells (airbox collar vs exhaust ember) are too
  far apart for one tight crop.
- `livery` — side / front-3-quarter / rear-3-quarter for sponsor placement.

```sh
node tools/car/render-car.mjs --team=mclaren --preset=brakes --brakes=ceramic
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
node tools/car/render-car.mjs --team=mclaren --preset=livery --lightset=day,dusk,night
```

`--lightset=day,dusk,night` renders every shot at each tod as a grid (rows =
shot, columns = tod).

## Options

- Car: `--team=` `--livery=` `--num=` and `--engine= --aero= --brakes=
  --gearbox= --ers= --tyres= --suspension= --fuel=` (ids in `js/car/parts.js`).
  The CLI parses these 8 of 12 categories; `tools/carview.html` has all 12
  (exhaust, floor, cockpit, wheels too).
- Lighting: `--tod=day|dusk|dawn|night|void` ·
  `--rig=studio|3point|rim|topdown|none` · `--intensity=<n>` · `--exp=<n>` ·
  `--bg=RRGGBB`.
- Reflection: `--refl=<0..1>` is a **studio dial** on all shine (roughness,
  metalness, specular, clearcoat, sparkle, `carEnvCube`). Default `0.2`.
  **Not** in-game chrome: that is `finish:"chrome"` on a livery
  (`--livery=mer_chrome`). Universal id `chrome` is a **gloss** palette named
  "Chrome".
- Look: `--look=<m>` along Z (+nose / −rear), `--lookx=<m>` along X. Preset
  shot-sets already set this.
- Reflection tests: `--rig=rim` or `--rig=3point`;
  `--plight=x,y,z,r,g,b,intensity,radius` (repeatable); `--sweep=1`.
- `--w= --h=` viewport, `--url=` (default `http://127.0.0.1:3456`).

All-teams side batch (`custom` / MY TEAM is runtime-only — grep
`js/data/teams.js`):

```sh
grep -oP 'id: "\K[^"]+' js/data/teams.js | while read -r t; do
  node tools/car/render-car.mjs --team="$t" --views=side --out=scratch/renders/cars-grid/
done
```

## Interactive page

`tools/carview.html?team=ferrari&livery=fer_matte&az=40&el=16&dist=6&rig=3point`.
Controls: drag orbit · wheel zoom · **1-5** tod · **+/−** exposure · **,/.**
intensity · **l** sweep · **space** turntable · **r** reset · `?hud=0` hides
the panel.

```js
CARVIEW.ready
CARVIEW.angle(az, el, dist)
CARVIEW.set({team, livery, num, parts:{gearbox:'f1_spec'}, tod, rig, intensity, exp, refl, look, lookX, bg, sweep})
CARVIEW.addLight([x,y,z], [r,g,b], intensity, radius)
CARVIEW.clearLights()
```

`refl`/`look`/`lookX` take effect live (no rebuild).

## Gotchas

- Decals need reflected handedness. The in-race model matrix is a reflection
  (det −1); the viewer draws through `REFLECT_X`. `carview.html`'s
  `carDecalData()` mirrors `js/game.js` — change one, update the other.
- Part geometry only shows when you force the option (`--gearbox=f1_spec`);
  the default build is the baseline look.
- A blank/near-black frame usually means the server is down or
  `CARVIEW.ready` never fired — the batch tool exits non-zero.
