# Apex 26

**[Play live on GitHub Pages &rarr;](https://brycejmurrin.github.io/f1-game/)**

An unofficial Formula 1 fan game and data hub built with raw WebGL2 — no
frameworks, no dependencies, no build step. Pure JS/CSS/HTML, runs in any
modern browser on desktop or mobile. A sibling of
[Neon Drift](https://github.com/brycejmurrin/driving-game): same
zero-dependency philosophy, this time in true 3D.

## The game

Race the full **2026 grid** — 11 teams, 22 cars, real drivers and liveries —
across **12 real circuits** recreated as low-poly 3D tracks: Bahrain, Monaco,
Silverstone, Spa, Monza, Suzuka, Singapore, COTA, Interlagos, Las Vegas, the
brand-new Madrid Madring (with its 24%-banked Monumental curve), and
Zandvoort in its farewell year. Night races run under floodlights.

2026-regulation game mechanics:

- **Electric boost** — hold BOOST to deploy battery energy; deployment tapers
  away at high speed, exactly like the 2026 power units. Recharge by braking
  and lifting.
- **Overtake Mode** — get within 1 second of the car ahead and the OT light
  arms; trigger it for 4 seconds of full, taper-free deployment. The DRS
  replacement.
- Five red lights, lights out. Real points (25-18-15-12-10-8-6-4-2-1).
- **Season mode**: all 12 rounds in calendar order with persistent
  championship standings.

### Controls

- **Mobile (tilt):** tilt the phone to steer — calibrates at the start
  lights. On-screen BOOST / OT / BRAKE buttons. iOS asks motion permission on
  your first tap.
- **Mobile (no gyro):** steer with the on-screen arrows or screen halves;
  toggle TILT in the pause menu.
- **Desktop:** `←`/`→` or `A`/`D` steer, `Space` boost, `X` overtake mode,
  `↓`/`S` brake, `P`/`Esc` pause.

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
python3 -m http.server 8000
# then open http://localhost:8000
```

For tilt steering on a phone, serve over HTTPS (e.g. GitHub Pages) — motion
sensors require a secure context.

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module contract.
Plain script-tag IIFE modules, in load order: `mat4` (matrix math), `glx`
(WebGL2 renderer), `teams` (2026 grid data), `tracks` (spline → mesh circuit
builder), `car3d` (procedural car geometry), `input` (keyboard/touch/tilt),
`audio` (WebAudio synth), `api` (Jolpica/OpenF1 clients), `data` (data hub
UI), `game` (loop, physics, AI, race logic).

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
