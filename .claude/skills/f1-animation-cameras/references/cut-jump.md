# Camera owners and cut-jump recipe

Owners in `js/camera/` (locate symbols with `rg`):
- `mode-switch.js` — the mode list; each mode's `cut` is its blend time in seconds (side, heli, trackside differ).
- `vantage.js` (`GameCams`) — per-mode framing/placement, incl. heli, side, cinematic, low and the ExtraRigs modes.
- `extra-rigs.js` — rival / pitwall / drone rigs.
- `director.js` — the live TV auto-cut (`tv` mode); `Director.live().status()` reports its state.
- `drive-broadcast.js` — lens/FOV only for broadcast cams; it does not move the rig.
- `cam-avoid.js` — wall/building avoidance for broadcast eyes; `cam-comfort.js` — touch comfort preset.

Recipe for "cut jumps" (e.g. at a hairpin when switching to TV):
1. Read the target mode's `cut` in `mode-switch.js`; a 0 means a hard cut by design.
2. Stage race, `go`, seeded reset (see `game.md`); sample `camState()` each frame across the switch.
3. `__apex.previewCam(mode, frac, speed, lat)` frames a mode at a track point without driving there.
4. Fixtures: `tests/unit/director.test.mjs` (cuts), `camera-ride.test.mjs` (rig math), `cam-avoid.test.mjs`.
Do not hide a jump with a compensating snap (see `game.md`).
