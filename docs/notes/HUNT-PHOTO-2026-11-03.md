# Bug hunt: photo mode — camera, controls, framing, capture (2026-11-03)

Kind: hunt · Re-measure-by: 2027-02-01

Lane 15 (HALF:front, `lane:cursor`). Slice: `js/camera/photo-*.js` (OWNED).
`js/camera/replay-buf.js` held by #4572 — not touched. Method: claim + open-PR path
scan (no live PR held OWNED files) → apex-lsp outlines/callers on Photomode /
PhotoKit / PhotoLooks → finding-verifier on five candidates → fix the top three
with unit tests. No browser run (AGENTS.md rule 5).

Prior art (do-not-re-report): blur release + Space on `#pc-restore` (#3562) +
alias holds + stick capture / lostpointercapture + pointerleave hold trap
(`photomode-hold.test.mjs`, DEFECT-LEDGER 2026-09-22); look presets (#1574);
Photo Studio scale bump around capture (#3656); racing-line per-shot toggle;
free-cam bar overlap (#2159, UI).

## Ranked findings (player impact ÷ fix risk)

| # | Where | Verdict | What | Action |
|---|-------|---------|------|--------|
| 1 | `js/camera/photo-kit.js` `saveMark` / `marksFor` | CONFIRMED (unit) | Bare `+mark.eye[i]` persisted NaN / short vectors; `FreeCam.place` then wrote NaN into `photoCam` and `aim()` yielded NaN yaw/pitch. Corrupt rows already on disk still reached LOAD. | **Fixed:** `vec3()` gate on save; `marksFor` filters non-finite rows. Test: `photo-kit.test.mjs` "HUNT-PHOTO #1". |
| 2 | `js/camera/photo-cam.js` `enterPhotoMode` | CONFIRMED | Header claimed a render-scale bump; enter only `setAutoRes(false)` + saved `_photoPrevScale`, so a governor-softened 0.7/0.85 stayed soft for the whole free-cam shot. Photo Studio already raises to 1 around capture only. | **Fixed:** `setRenderScale(1)` when prior scale `< 1`; exit still restores. Test: `photo-kit.test.mjs` "HUNT-PHOTO #2". |
| 3 | `js/camera/photo-cam.js` `#pc-fov` `oninput` | CONFIRMED (handler; HTML range mitigates drag) | `photoCam.fov = +e.target.value` with no 20..110 clamp (FreeCam's `clampFov` is unused on this path). A non-finite value leaves FOV at NaN/0. | **Fixed:** clamp to 20..110, default 60. Test: `photo-kit.test.mjs` "HUNT-PHOTO #3". |
| 4 | `js/camera/photo-kit.js` `showOverlays(true)` | CONFIRMED API; low reach | `on === true` is a no-op. FreeCam re-shows via `setGrid`/`applyDof`, never `showOverlays(true)`. | Left: helper incomplete; no player path today. |
| 5 | `js/camera/photo-looks.js` `createLookSession.end` | PARTIAL | `set(id, undefined)` when `get` missed a LOOK_KEY. Shipped `ltWrite` rejects non-finite, so LT is not NaN'd; a bare setter would sticky-apply. | Left (cap 3); harden end() to skip `undefined` in a follow-up. |
| 6 | Bookmarks keyed by `track.id \|\| track.name` | design | Rename / id drift orphans marks across saves. | Left: data-model follow-up. |
| 7 | CSS DoF + composition grid | design | Soft-focus overlay, not optical DoF (flyby plan rejection stands). Grids are viewport DOM, not lens. | None. |
| 8 | Canvas drag-look (`#game`) | low | No `setPointerCapture` on the scene drag (sticks already capture). Window listeners usually see bubbled moves; edge leave without cancel is rare. | Left. |
| 9 | Capture / share / crop | out of OWNED | Lives in `js/ui/photo-studio.js` (scale raise around readback already shipped). | Other lane. |

## Covered and cleared

Enter/exit key wiring (WASD, R/Space/F altitude aliases, Shift boost, blur release),
thumbsticks + UP/DOWN hold (`holdTargetGone`), Studio / `#pc-restore` Space ownership
(#3562), look preset apply/end with a full LT map, grid cycle, DoF CSS vars at blur~0,
bookmark FIFO at `MAX_MARKS`, online photo tick vs solo physics hold
(`photomode-hold.test.mjs`).

## Not covered (next hunt)

`js/camera/free-cam.js` `place()` finite guard (defence in depth after #1);
Photo Studio capture/share/IDB (`js/ui/photo-studio.js`); free-cam panel layout on
844×390; optical DoF if backends ever grow it.
