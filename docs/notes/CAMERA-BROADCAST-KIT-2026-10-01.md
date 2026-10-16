# Camera broadcast kit — wall avoid, trackside, photo extras, comfort (2026-10-01)

Shipped on `cursor/camera-broadcast-kit-cdab` against `claude/f1-game-project-26h3ng`.

## Delivered

| # | Outcome | Module | Notes |
|---|---|---|---|
| 1 | Wall / building avoidance for heli, side, cinematic, low on **open** circuits | `js/camera/cam-avoid.js` | Street `corr` unchanged. Steps toward the road when `FlybySeq.insideProp`, then `clearEye`. Wired from `vantage.js` after look-back, before ground clamp. |
| 2 | TRACKSIDE fixed cams (CAM_MODES append) | `js/camera/trackside.js` | One eye per measured corner; auto-switch with hysteresis; aims at the subject car. |
| 3 | Photo kit: DoF, composition grids, bookmarks | `js/camera/photo-kit.js` + free-cam UI | DoF is a CSS soft-focus overlay (backends still have no optical DoF — flyby plan rejection stands for GPU DoF). Bookmarks: `apex26.freecamMarks`. |
| 4 | Auto comfort on touch / XR | `js/camera/cam-comfort.js` | First boot only; stored `camComfortPref` always wins. OR'd into `camComfort()`. |

## Deferred / remains

- GPU / backend optical depth of field (needs GLX+TLX+WGX post).
- Per-circuit authored TV camera packs (flyby 4.12).
- Live TV director / instant replay / results orbit (broadcast-feel plan slices A–C — other PRs).
- Individual comfort FOV / blur / speed-line toggles (player-a11y comfort block).

## Concurrent work

Other agents may be editing camera feel / tuner / director. This PR keeps
diffs focused on new `js/camera/` modules plus append-only `CAM_MODES` and
thin call sites in `vantage.js` / `mode-switch.js` / `game.js` / free-cam.
