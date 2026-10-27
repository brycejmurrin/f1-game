# Game entry: complete tail range map

## Source and coverage
GPT-6.1 Sol complete_net_input fully read js/game.js:6201–9554 (3,354 lines) at c4dc493d9 in eight contiguous untruncated chunks. LSP resolved named functions and callers; ambiguous render was queried by file and line 7239. No source changes or browser tests.

## Integration map
| Anchor/range | Contract |
|---|---|
| 6201–6234 | Lateral movement tail, crosswind/marbles, human skid telemetry and S.steer. |
| updateCarAdvance 6235 | Arc/progress/clocks, friend qualifying, sectors, authoritative line transition, TT validity/settlement, wrong-way and rescue; mirrors AI road pose to world. |
| rescuePlayer 6531 | Invalidates scored lap, releases incident owner, resets pose/slips/cues and anchors without advancing progress. |
| retireCar 6570 | Publishes owned retirement, parks car, records road obstruction, resets dynamics/pit/audio and announces. |
| checkRetirements 6610 | Planned distance DNFs, excluding network/real-race owners. |
| coast 6625 | Post-finish pace floor and pit compliance; updates road/world pose. |
| 6662–6759 | Light profile wrappers, frame/tail light assembly, GameCams initialization and renderer-loss persistence latches. |
| drawWorldMeshes 6815 | Terrain/road/chunks, culled instanced props, mirror caches, glass/water/gates; drops CPU ribbons after successful chunk creation. |
| renderLightingPrep 6976 | Sky/pit/wetness/lightning/day-night lamps, temperature/twilight, tails/studio override, shadows/fog/frame tuning. |
| render 7239–7310 | Headless/lost-context/loading/previews/warm/frozen-results gates and resize. |
| 7310–7550 | Menu/game camera solve, shared interpolated anchor/banking, ExtraRigs/CamFeel, cut/shake/damping, near plane/FOV/projection. |
| 7551–7739 | View/projection/inverses, SSR normal/XR eyes, fog/culling, shadows and bounded environment probe with finally cleanup. |
| 7740–8246 | Mirror/main world order; cars, shared anchors/basis, body-vs-wheel attitude, LOD/shadows/decals, cockpit/pit/aero/lights, ghosts/debris/particles/rain/droplets. |
| 8247–8457 | Grade/bloom/sun/lamp/post effects, PerfGov shedding and SSR gates, XR/backend present, handoff/probe proof. |
| tick 8475 | PerfSpans and LoopHealth fault wrapper, fatal overlay, renderer crash-probe and XR scheduling. |
| tickBody 8502 | Governor then Input, NetPlay before pause, preparation/replay/banner/hit-stop, up to five fixed physics steps, remainder alpha, cameras/render/HUD. |
| 8630–8710 | Steering/throttle UI and generation-owned gyro permission/calibration/fallback; first-gesture wiring. |
| 8711–8904 | Title/career/quit flow, lazy doors, settings search/availability, borrowed-car PhotoStudio isolation and appearance bridges. |
| openQuali 8928 | SessionEntry serializes preparation, peer model/results and DRIVE/SIMULATE/GRID/BACK choices. |
| openGarage 9055 | Unified origin/return owner, covered preview/pit arrival, solo pit-work freeze and comparable-spec work time. |
| 9190–9247 | Results destinations and network-to-solo restart cleanup. |
| setPaused 9249 | Pit ownership, solo wake/countdown, replay/audio/tool teardown; network pause is UI-only. |
| 9284–9434 | Post-finish skip, CamModes, recover/restart/quit, steer/throttle/mirror/calibration/pairing/key/export/manual-gear/aero controls. |
| 9435–9554 | Clean-hide probe disarm; custom teams/season/stable circuit/save ownership boot; coalesced resize/XR; lazy agent/editor/data/audio/network invite wiring. |

## LSP evidence
Callers checked for advancement/rescue/retirement/coast, lighting prep, tickBody, qualifying, garage, pause and steer mode. File/line render query resolved snapGameCam, three tickBody branches and injected PhotoStudio render callback. Input/net contracts independently fully read in net-input-complete.md.

## Verified stale comments
- 7144–7157: per-chunk lamps described as experimental and shedding at tier 1; current expression scales at tier 1 and disables at tier 2, excluding preset floor.
- 9009–9017: completed qualifying BACK described as hidden; current code makes it MENU with leave handling and friend confirmation.
- 9339–9345: gears described as tilt-only; actual disabled condition restricts touch non-tilt while desktop keyboard remains eligible.

## Remaining verification
Source reading complete for this range; actual GPU/device behavior unverified. Middle range and cross-range integration documented separately.
