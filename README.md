# Apex 26

**[Play live on GitHub Pages &rarr;](https://brycejmurrin.github.io/f1-game/)**

An unofficial Formula 1 fan game and data hub built with raw WebGL2 — no
frameworks, no dependencies, no build step. Pure JS/CSS/HTML, runs in any
modern browser on desktop or mobile. A sibling of
[Neon Drift](https://github.com/brycejmurrin/driving-game): same
zero-dependency philosophy, this time in true 3D.

## The game

Race the full **2026 grid** — 11 teams, 22 cars, real drivers and liveries —
across the **24-round 2026 calendar** recreated as low-poly 3D tracks — plus 16
retired classics, 40 circuits in all: Bahrain, Monaco,
Silverstone, Spa, Monza, Suzuka, Singapore, COTA, Interlagos, Las Vegas, the
brand-new Madrid Madring (with its 24%-banked Monumental curve), Zandvoort in
its farewell year, Imola, Baku, Jeddah, Albert Park, Shanghai, Miami, Mexico
City, Montreal, Qatar, Red Bull Ring, Hungaroring, and Abu Dhabi. Night races
run under floodlights.

2026-regulation game mechanics:

- **Electric boost** — hold BOOST to deploy battery energy; deployment tapers
  away at high speed, exactly like the 2026 power units. Recharge by braking
  and lifting.
- **Overtake Mode** — get within 1 second of the car ahead and the OT light
  arms; trigger it for 4 seconds of full, taper-free deployment. The DRS
  replacement.
- **Manual gearbox** (optional, toggle in the pause menu) — an 8-speed
  'box with a live gear readout and tachometer. Shift up near the redline,
  down for corner exits; the limiter makes you upshift to reach top speed.
  Auto mode shifts for you.
- Five red lights, lights out. Real points (25-18-15-12-10-8-6-4-2-1).
- **Season mode**: all 24 rounds in calendar order with persistent
  championship standings.

### Controls

- **Mobile (tilt):** tilt the phone to steer — calibrates at the start
  lights. On-screen **GAS** / **BRAKE** pedals (left), **BOOST** / **OT**
  toggles (right). iOS asks motion permission on your first tap.
- **Mobile (no gyro):** touch the left/right side of the screen to steer;
  toggle TILT in the pause menu.
- **Desktop:** `←`/`→` or `A`/`D` steer, `↑`/`W` throttle, `↓`/`S` brake,
  `Space` toggle boost, `X` overtake, `C` change camera, `P`/`Esc` pause.
  Manual gears: `E` up, `Q` down.
- **Gamepad:** plug in or pair a controller (PS5 / Xbox / MFi — works on
  desktop browsers and iOS&nbsp;14.5+ Safari) for low-latency analog steering.
  Left stick steers, **RT**/**A** throttle, **LT**/**B** brake, **X** boost,
  **Y** overtake, **RB**/**LB** shift up/down, **View/Back** camera,
  **Menu/Start** pause. Supported pads also rumble on contact and kerbs.
- **Camera:** the **CAM** button (top-right, next to pause) or the `C` key
  cycle through **13 camera modes** — **CHASE** (close), **FAR** (pulled back),
  **DRIFT**, **COCKPIT** (onboard driver's eye), **HOOD** (nose cam), and more
  (overhead, heli, trackside, cinematic, T-cam…). Your choice is remembered.

Throttle is manual — hold GAS to accelerate. BOOST and OVERTAKE are taps that
toggle/activate rather than buttons you hold.

### Handling & tuning

The car runs a **dynamic bicycle model**: each axle generates grip from its slip
angle and saturates at a friction limit, so cornering is grip-limited — overcook
a corner and the front washes wide (understeer); loosen the rear and it steps out
(oversteer). Brake for the corners; the car rewards a tidy line.

**ADVANCED STEERING…** in the pause menu opens **STEERING & ASSISTS** —
**RELAX / STANDARD / PRO** presets, **STEERING** feel, **TILT SENSITIVITY**,
**DRIVING HELP**, **RACING LINE**, **ADAPTIVE BUTTONS** (keys / on-screen
arrows; default ON) and **BRAKE CUE** (a tick, never a takeover) — with lock,
speed steer and the rest tucked behind an **ADVANCED** disclosure.

### Car Setup

The **CAR SETUP** screen (accessible from the main menu) lets you configure
your car across **12 upgrade categories** before each race:

| Category | What it affects |
|---|---|
| **ENGINE** | Top speed and straight-line power |
| **AERO** | Downforce balance — drag vs. cornering grip |
| **SUSPENSION** | Mechanical grip and kerb handling |
| **BRAKES** | Braking distance and stability under heavy braking |
| **TYRES** | Grip level and degradation rate |
| **ERS** | Battery deployment curve and harvest efficiency |
| **GEARBOX** | Shift speed and ratio spread |
| **FUEL** | Fuel load trade-off (weight vs. range) |
| **EXHAUST** | Tailpipe layout — pipe count, bore, wastegate |
| **FLOOR** | Floor edge, fences and skid block |
| **COCKPIT** | Halo, mirrors and driver furniture |
| **WHEELS** | Rim and wheel-cover treatment |

Budget is **780 credits** per race. Toggle **UNLIMITED BUDGET** in the setup
screen to remove the cap for testing. Some parts are **factory/supplier-exclusive**
and only appear when your team uses that power unit (Mercedes, Ferrari, Red Bull
Ford, Honda, or Audi).

## The data hub

The **F1 DATA HUB** button opens a live data view powered by two free,
open APIs, fetched straight from your browser with polite caching:

- **[Jolpica F1](https://github.com/jolpica/jolpica-f1)** (the Ergast
  successor) — 2026 race schedule, driver & constructor standings, and the
  latest race result.
- **[OpenF1](https://openf1.org/)** — session info, weather, classification,
  and a **TELEMETRY** tab. Both the LIVE and TELEMETRY tabs have a
  **Year → Grand Prix → Session** picker (any session from 2023 on, defaulting
  to the latest), and in TELEMETRY you pick a driver to see their fastest-lap
  **speed / throttle / brake traces**, a **track map coloured by speed** (from
  car position data), tyre stints and pit stops. (True live telemetry needs a
  paid/relayed feed, so this uses OpenF1's free historical data — it populates
  ~30–60 min after a session.)

Responses are cached in localStorage with sensible TTLs so the volunteer-run
APIs aren't hammered.

## Running it

Any static file server works:

```sh
npx serve -l 3456 .
# or
python3 -m http.server 3456
# then open http://localhost:3456
```

For tilt steering on a phone, serve over HTTPS (e.g. GitHub Pages) — motion
sensors require a secure context.

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module contract.
Plain script-tag IIFE modules, grouped by domain: `js/render/` (WebGL2/WebGPU
renderers + shaders), `js/track/` (the spline → mesh track engine),
`js/circuits/` (the 40 circuit data files: 24 season rounds + 16 retired), `js/car/` (procedural car geometry,
liveries, the 12-category upgrade catalog, the 2026 grid), `js/data/`
(Jolpica/OpenF1 clients + the data hub UI), `js/game/` (input, audio, HUD,
cameras, lighting, …), with `js/game.js` as the entry (loop, physics, AI, race
logic). Load order is defined in `tools/manifest.cjs`.

## Testing & development

The project ships a **Playwright test suite** — 114 Playwright specs — plus
190 `node --test` unit suites, covering rendering, physics, UI across screens,
multiplayer, career and visual regression. The whole thing is ~40
minutes of software rendering, so the workflow is: ask which groups a change
needs, run those in the background, tail the log.

```sh
node tools/ci/pick-tests.mjs                    # which test:<group>s does this change need?
node tools/ci/test-bg.mjs driving hooks         # start them in the background, one at a time
tail -f artifacts/logs/smoke.log             # watch one live
node tools/ci/test-bg.mjs --status              # running / how each ended

npm run test:tiny                            # start here: page loads, __apex responds
npm run test:driving                         # the driving model, collisions, debris (browser; ~30 min on SwiftShader)
npm test -- tests/specs/autopilot.spec.js          # single file
node tools/track/verify-track.cjs --all            # headless build check, all 40 circuits (no browser)
```

`docs/TESTING.md` is the full reference: every group, every spec, the fixtures
and the philosophy.

Development server (pick either):

```sh
python3 -m http.server 3456
npx serve -l 3456 .
```

Development happens on `claude/<topic>` feature branches; the deploy branch is
`claude/f1-game-project-26h3ng`.

A debug scripting API — `window.__apex` — is available at runtime (devtools
console or headless harness). Full reference in
[docs/DEBUG-HOOKS.md](docs/DEBUG-HOOKS.md). Quick example:

```js
__apex.race("monza");        // load Monza, skip menus
__apex.park(0.1);            // stationary at 10% lap for a screenshot
__apex.probe();              // player telemetry
__apex.eyeAt(0.116, 0, 2.5); // track-relative free-cam (frac, lateral, height)
__apex.groundY(0.11, 12);    // rendered terrain height + gap vs the road at a point
```

## Credits

Music: free demo tracks from
[Beatscribe's Homebrew VGM assets](https://github.com/Beatscribe/homebrew_vgm)
([more at beatscribe.itch.io](https://beatscribe.itch.io)), released under
**CC0 1.0** (public domain) and downsampled for the web. See
[`assets/music/CREDITS.txt`](assets/music/CREDITS.txt). The engine and sound
effects are synthesized in-browser with the Web Audio API.

---

*Apex 26 is an unofficial fan project and is not associated in any way with
Formula 1, the FIA, or any F1 team. F1 data courtesy of the Jolpica and
OpenF1 community projects.*
