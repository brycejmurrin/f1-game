# Changelog

Player-facing changes for each shipped build, one section per exact `build` number from `version.json` (for example `1695` — not a date range or approximate build).

Do not edit the build sections in a PR: add a fragment `docs/changelog.d/<slug>.md` (see its README). `node tools/gen/gen-changelog.mjs --fold` writes the sections at release.

Under each build, use only these categories:

- **New** — new player-visible features or content
- **Improved** — clearer UX, visuals, or performance without fixing a regression
- **Fixed** — bugs and regressions
- **Removed** — features or UI removed on purpose

Do not list internal refactors, agent workflows, CI, or tooling. Older history lives in git and merged PRs.

## 1695

### New
- Track Designer: add, edit and remove road bridges; place ponds, lakes and straight river sections from a water palette.

### Improved
- Track Designer workspaces separate drawing, road editing, elevation, scenery and testing controls, reducing repeated menus.

### Fixed
- WATCH HIGHLIGHTS: scrubbing or pressing NEXT now cuts to the right car for the coming highlight, and the replay clock no longer jumps back (#2196).
- WATCH: the timeline reaches the formation and start footage before lights-out (#2202).
- Phone-controller reconnect diagnostics no longer include the pairing code.
- VS FRIEND: running into the back of your friend's car is one clean bump, so you no longer stay glued to their gearbox for several frames (#2164).
- A rival's pass-by whoosh no longer keeps hissing under the pause menu, the results sheet or the title screen (#2187).
- The team-radio key-up squelch now plays on phones, and on desktop it follows the master and SFX volume (#2189).
- Data Hub: a session with no data yet (Results on a race weekend, WATCH & DRIVE, Telemetry, Live) now says nothing is published yet instead of showing a load failure with a RETRY that never works (#2185).
- Data Hub: a tab served from the stored copy after a failed refresh shows that copy's age and "offline copy" instead of "updated just now"; the Schedule's NEXT marker moves on once a race ends; large telemetry downloads are no longer fetched again on every visit (#2190).
- Start lights keep real time on slow devices: a low frame rate no longer leaves the grid stuck at 0 KPH while the lights crawl on (#1882).
- On street circuits a retired car parked on the track is now solid: you hit it instead of driving through it, and AI cars steer around it (#2162).
- Photo captures on the THREE.JS WebGL2 path yield while waiting for GPU readback; capture resources are released on failure or timeout.
- Browsed-away high-resolution livery bitmaps are released when their THREE.JS textures are freed.
- Blue flags: letting one lapping car through no longer counts toward a penalty for the next one in the queue (#2163).
- Overtake stays off after a red flag that ends once a car has taken the chequered flag, until the leader next crosses the line (#2166).
- A car handed back after a heavy shunt never drives backwards at speed (#2167).
- AI cars hold their line under the Safety Car and VSC instead of weaving to defend (#2175).
- The PIT WALL camera no longer films from inside grandstands and pit buildings; it moves in toward the wall until the view is clear (#2252).
- HUD editing restores hidden readouts and keeps its toolbar within the screen.
- Garage category buttons follow the list’s scroll direction on touch screens.
- The game still opens when the browser blocks access to saved data at startup.
- Increasing BUTTON SIZE keeps phone controls consistent; the default broadcast map clears the pedals and stays put when first edited.
- Data Hub cancels superseded telemetry selections, clears old session content when a Grand Prix or year has no data, and keeps keyboard navigation inside telemetry dialogs.
- Telemetry comparison gaps stay at their finish values when the reference lap ends before playback.
- Rotating a phone while editing the HUD keeps Settings accessible afterward.
- Spotify now-playing updates recover when a response body stalls.
- Share-code imports preserve a durable recovery copy and show persistent feedback with Undo guidance.
- Restoring a career backup keeps your Daily Challenge class bests, so the share line no longer reads NO LAP (#2165).
- A malformed settings file shows REFUSED instead of an error overlay; undoing a share code no longer pins the shipped garage setup (#2191).
- Saving an edited Track Designer circuit on full storage no longer deletes its lap records and ghosts (#2192).
- A career whose save was restored from backup storage at launch opens again instead of switching to another slot (#2193).
- Career regulation changes refit cheaper owned parts when the fitted-cost cap falls, preserving research and credits while keeping the car within budget.
- Track Designer on a landscape phone: the map gets most of the screen and UNDO / FIT VIEW sit beside it instead of covering it (#2152).
- Touch: sliders, dropdowns and fold-out rows (OVERALL SPEED, Spotify, EXTRA PAINT, EXTRA FUNDS, free-camera FOV) are big enough to tap (#2158).
- Free camera with the lighting panel open: the camera bar no longer covers the panel's FREE CAMERA button on a phone (#2159).
- VS FRIEND: a short network outage mid-race (up to the race's 25 s grace) no longer ends the session; your friend's car is driven by AI until their connection comes back (#2195).
- VS FRIEND room code: INVITE ANOTHER no longer leaves a dead room behind. Closing back to the room brings the same code back for the next friend (#2197).
- Phone as controller: an expired pairing code takes its QR down and frees the button, and a phone whose link dropped keeps trying to reconnect for about a minute (#2198).
- VS FRIEND results: the host's finishing order is kept when the host leaves just after the flag (#2199).
- VS FRIEND lobby: an expired room code is taken down instead of staying shareable, a failed code join frees its connection, and the scan camera turns off when the lobby leaves its step (#2200).

- Returning tabs refuse changed lazy scripts after a release, preventing mixed-version audio, race and multiplayer code.
- Cached phone-controller links keep their own page offline, and updates preserve working offline Career access when its UI cannot be installed.
- Career saves from a newer game version stay protected until the game is updated or the slot is explicitly deleted.

- Repeated track and lighting warm-ups reuse their renderer probes and release them with their resources, avoiding retained warm-up meshes.
- Fog races are thick but readable again: the track no longer fades to a white wall within ~150 m, and dawn/dusk fog no longer sits under a bright clear sky (#2256, #2257).
- Qatar at night: the floodlit start straight no longer clips to pure white (#2260).

- Restoring a backup keeps a completed sprint's progress even when the sprint awarded no points.
- Friends who leave qualifying still join the race when the connection's outgoing queue is busy.
- WATCH restores recorded flags and weather after seeking, and a paused red flag no longer restarts the race.
- Saving an edited custom circuit preserves its replacement identity across reloads, including a full library.
- HUD shift and toggle buttons respond to keyboard and assistive activation; inverted wheels navigate menus consistently with driving.

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
