# Changelog

Player-facing notes for recent merges. Older history lives in git and the PR list.

## 2026-10-14 (build ~1695)

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
- Vendored three.js bumped 0.186.0 → 0.186.1 with local patches re-applied (#1488)

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

### Tooling & CI
- Agent-view tests wait for a rendered frame instead of a fixed rAF count (#1457)
- LoopHealth fault caps and quiet expiry covered by unit tests (#1463)
- Shipped-seat harness: game-vm seat option, player-dyn --seat, shipped twin test (#1474)
- Batch shots no longer save the previous framing; --hud reaches the image (#1484)
- Per-circuit geometry sweeps shard across 4 parallel runners (#1498)
- Perf hunt 4 research note: dynamic-buffer re-upload, lamp-shadow reach, census, first-draw stall (#1456)
- Skills survey: path/key/flag fixes and missing recipes across 29 skills (#1478)
- PR board encodes merge-commit-only, MERGE-HOLD, the 2-armed cap, and a PLAN column (#1481)

### Agent process
- Open the draft PR at the first commit with a live Plan checklist (#1451)
- Ready-gate checks the PR Plan checklist; fleet and steward skills follow the live-Plan rule (#1461)
- Merge-commit-only rule; MERGE-HOLD is the one PR-body veto (#1458)
- Player usage paths and session return loops mapped in docs (#1452)
- AGENTS.md under Codex’s 32 KiB cap; merge/push guards, fail-closed hooks, coordination skills (#1499)
