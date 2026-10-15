# Changelog

Player-facing changes for each shipped build. Add one section per exact `build` number from `version.json` (for example `1695` — not a date range or approximate build).

Under each build, use only these categories:

- **New** — new player-visible features or content
- **Improved** — clearer UX, visuals, or performance without fixing a regression
- **Fixed** — bugs and regressions
- **Removed** — features or UI removed on purpose

Do not list internal refactors, agent workflows, CI, or tooling. Older history lives in git and merged PRs.

## 1695

### Fixed
- Start lights keep real time on slow devices: a low frame rate no longer leaves the grid stuck at 0 KPH while the lights crawl on (#1882).
- HUD editing restores hidden readouts and keeps its toolbar within the screen.
- Increasing BUTTON SIZE keeps phone controls consistent; the default broadcast map clears the pedals and stays put when first edited.
- Rotating a phone while editing the HUD keeps Settings accessible afterward.
- Share-code imports preserve a durable recovery copy and show persistent feedback with Undo guidance.
- Restoring a career backup keeps your Daily Challenge class bests, so the share line no longer reads NO LAP (#2165).
- A malformed settings file shows REFUSED instead of an error overlay; undoing a share code no longer pins the shipped garage setup (#2191).
- Saving an edited Track Designer circuit on full storage no longer deletes its lap records and ghosts (#2192).
- A career whose save was restored from backup storage at launch opens again instead of switching to another slot (#2193).
- CONTINUE on a career names the save's own next circuit and round count, matching the career hub (#2160).
- CONTINUE no longer offers yesterday's Daily, which opened today's on another circuit (#2155).
- RACE IN PORTRAIT can be turned off again: SETTINGS › DISPLAY › RACE IN PORTRAIT (#2157).
- A controller's D-pad Left/Right leaves the circuit search and pairing-code fields instead of doing nothing (#2161).

### Gameplay
- Low-speed full-lock steering no longer chatters the yaw (#1497)
- Startup preferences, shortcut entry, and delayed menu navigation behave correctly again (#1495)
- Post-race and replay cameras stay locked on their cars (#1465)
- WATCH camera controls and commentary keep working after seeks (#1492)
- Failed asset downloads are refused instead of treated as success; parts save waits more reliably (#1453)

### UI & HUD
- Pause menu fits short phones with a 2-column tray and capped sheet (#1483)
- Phone HUD docks at full size; TEXT SIZE reaches the digits; flag/radio/DELTA readouts cleaned up (#1460)
- Radio card stays off the road in portrait; lane shift survives a republish (#1468)
- Race Settings presets wrap 2×2 on phone portrait (#1454)
- Garage portrait keeps the tab strip peeking and TEAM DRIVER clear (#1464)
- Results screen keeps your row in view and clamps long names (#1479)
- Title WATCH door fits the compact 2×2 grid (#1472)
- Title footer rooms fit on desktop (2×2 plus explore icons) (#1489)
- HUD speed and the cockpit wheel LCD share one speed-digit path (#1485)
- Race portrait HUD survey cells repaint correctly; desktop 1440×900 viewport measured (#1469)

### Graphics & Scenery
- Cockpit side-mirror glass no longer shows the rear view upside down (#1450)
- Wet-road reflections stay on at GRAPHICS MEDIUM (phones get the wet mirror again) (#1471)
- Wet SSR skips useless marches and keeps WGX road-gate parity (#1482)
- Spa night|wet amber lamps match the dry twin’s spread again (#1476)
- Fleet night|dry lamp flood trimmed so nights are less washed out (#1486)
- Bahrain realism: thinner mast forest and lamp heads, sand ground, no pink/cyan slabs (#1459)
- Untextured grey/sand theme-filler slabs removed from run-off (#1480)
- Open-rim tyre recipes retargeted after the cover opt-in (#1473)
- Open-rim fixed disc and caliper stay visible in FieldLod lite (#1500)
- Car materials and body geometry moved toward pure-move paths (#1466)

### Performance
- Garage on phone sheds the bay present cost (#1441)
- Garage tap no longer stalls the main thread as hard (#1477)
- Hunt 3: fewer three.js render-object costs, track-switch loop death fixed, jump() progress double-count fixed, mirror/env/SSR/rain/mip savings (#1449)
- Hunt 4: StreamDraw dynamic buffers, WGX lamp-shadow reach, census instruments (#1467)
- Hunt 4 TLX-W: 4-byte strides, mirror mip cap, scene-depth discard, draw warm (#1491)
- Hunt 4 CAR: livery upload as ImageBitmap; aero flaps through CarDraw.coOpt (#1494)

### Multiplayer
- Room code stays hidden until the invite and first publish succeed (#1455)
- Expired room codes no longer show TURN/network failure copy (#1470)

### Audio
- Results HIGHLIGHTS montage plays engine notes with the field (#1462)
