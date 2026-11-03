# Hunt 2026-11-02 — track engine, camera, fx (#4454)

Slice `js/track/`, `js/camera/`, `js/fx/`. Prior-art scout first (BUGS.md, DEFECT-LEDGER, git log), five sonnet
code-hunters (track core, build client/worker, camera x3, fx), one finding-verifier pass over every row.
All findings were verified by code reading only; nothing was measured or run in a browser.

Coverage honesty: hunters ran out of budget on `js/track/core/{mesh,geom,hidden-faces,pit,def}.js`, most of
`js/track/scenery/` (about 11k lines, only grepped), `js/camera/flyby-seq.js`, `flyby-sight.js` and
`js/fx/visor-optics.js` 1-379. These are unaudited, not clean. `js/fx` (other files) and `build-client/worker` read clean.

## Confirmed, fixed in this PR
| # | where | finding |
|---|---|---|
| 1 | `flyby-editor.js` dur row | Dragging DURATION left the scrub `u` stale; the shot under `u` changed, `preview()` re-selected a neighbour and the next input edited the wrong shot. Fix: `setU(midOf(sel))` in the dur handler. |
| 2 | `tuner-panel.js` HERE→ALL | The 1800 ms "COPIED" timer was never cleared; a fast third click showed "HERE → ALL" while armed. Fix: share `armT`, clear on arm. |
| 3 | `cam-avoid.js` `freeEye` | Three `FlybySeq.insideProp` queries per frame in open air (heli/side/cinematic/low). Now one. Test added. |
| 4 | `results-cam.js` `cheqPose` | A pose with `carPos: null` overwrote the px/pz fallback. Guarded. |
| 5 | `offsets.js` `set()` | Unreachable `Object.keys(prof).length` delete removed. |

## Confirmed, follow-ups (not fixed)
1. `offsets.js:229` `context()` allocates `{track,car}` ~12-16x per chase frame (memoise per `store.rev`). Perf, est.
2. `replay-buf.js:198` `at(t)` does two O(count) scans plus a cars array per scrub frame (binary search + pool).
3. `director.js:141` `applyShot` allocates extra/carPos/solve closure/dbgCam per TV frame.
4. `tuner-panel.js:371` `scrollIntoView` on every slider input (re-centres the tab strip; forced layout).
5. `cockpit-opts.js:92,112` stored visor beams "1"/"2" reload as 100%/200%; only reachable programmatically.
6. `trackside.js:103` `track._tsIdx` not reset on restart (hysteresis holds the old camera; rare).
7. `replay-buf.js:319,389` redundant `resetFollow`/`resetSmoothing` after `snapCamera`.
8. `flyby-editor.js` every slider input does 3 JSON.stringify passes plus a chip rebuild (est. hundreds of µs).
9. `js/track/core/surface.js:176` `TrackSurface.heightAt` wrapper drops `side` (skips pit flattening); only a test uses it. Delete or forward `side`. Left alone: `js/track/` reaches the fleet geometry build.
10. `js/track/core/spline.js:92,112,151,308` samplers have no `isFinite(s)` guard; no real caller found.
11. `tracks.js:128` / `surface.js:77` bridge-rise bump duplicated (agree today).
12. `spline.js:216` `project()` allocs closures per call (not on the player hot path).
13. `pits.js` `BAY_CACHE`: check `TrackGeom.addMesh` does not mutate cached bay arrays (unchecked).

No `js/track/` file changed in this PR, so no geometry sweeps are implicated.
