# hunt-render: js/render/**, js/lighting/**, js/fx/**, js/car/** (pass 4, partial: about 10 min budget)
Inputs: BRIEF.md, docs/notes/system-audit-3/game-code.md (it has no render rows; DEFECT-LEDGER.md at the docs root does not exist at this path).
Ran: apex-lsp outline/refs (VisorOptics, Car3D exports), grep across tsl-lit/glsl-lit/wgsl-chunks/tlx.js/gfx.js/droplets.js/game.js. No node runs.

## Clean
- Material-pack blend `mix(albedo, albedo*tex.rgb*2.0, mix*far)` is identical in GLX glsl-lit.js:620, TLX tsl-lit.js:1059, WGX wgsl-chunks.js:360/367 (same far=1-(vd-90)/170, the same rough mix k*0.8, the same 1..16 mid gate).
- The normal-map amount (0.10 asphalt / 0.55 otherwise, times mix, fade and aa) is the same in TLX tsl-lit.js:1035 and WGX wgsl-chunks.js:209.
- WGX pack taps are under a uniform gate (packOn && D.lampRange.w) after every dpdx (wgsl-chunks.js:1003-1030), which satisfies the WebKit uniformity rule.
- On a failed bind, TLX unwinds `_createUndo` and disposes the renderer while keeping the context alive (tlx.js:6742-6775).
- Car3D.ALLOW_TEAM_BODY_SWAP is an intentional, test-pinned flag (body-styles.test.mjs:39), so it is not dead code.
- The CSS port image is scoped to body[data-helmet-cam][data-visor-port] (helmet-visor.css:13), so a stale --visor-port is harmless.

| id | finding | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| R1 | Visor overlay is never hidden on leaving the race. Only Droplets.tick (game.js:8261) calls VisorOptics.tick, and render() returns before that line in menu/home (game.js:7270, 7288-7289), in results without the live cam (7300) and with no track (7317). Race exit calls Droplets.clear() (game.js:4413), but VisorOptics.clear() has ZERO callers (only def+export, visor-optics.js:677/690). Trigger: race in HELMET cam with visor on and sun or lamp glints, then quit or finish. #fx-visor (z 3, plus-lighter or normal) keeps its last paint over the live Home garage and the results screen. | visor-optics.js:677; droplets.js:217,239; game.js:4413, 7270-7317 | A visible ghost glint or flare over the menu/results on his phone (helmet cam is his setup) | Call VisorOptics.clear() inside Droplets.clear() (droplets.js:239) or next to it at game.js:4413 and at the results entry. Unit test: tick on, then Droplets.clear, then VisorOptics.stats().shown===false | med (CODE-TRACED; no browser run) | NEW |
| R2 | VisorOptics._size creates the canvas one tick late. If the helmet is first entered with the visor OFF, _size records _w/_h with no canvas. Turning the visor ON then gives _size()=false (same w/h, _cv null), _lookup creates a 300x150 canvas, and `if (resized) _size()` is skipped. The first paint goes to a 300x150 backing store stretched to the viewport. It heals on the next tick. | visor-optics.js:383, 629-636 | One blurry frame; cosmetic | In tick, call _size() unconditionally after _lookup() (it is idempotent) | med | NEW |
| R3 | Gfx.create swallows the exception text. The outer catch logs only "Gfx.bind fallback webgl2" and drops `_` (gfx.js:299-301). If owner.check() throws after a backend was returned (gfx.js:276/295), the live TLX/WGX backend is dropped without destroy, so its renderer and context leak, and no reason is logged. | gfx.js:275-301 | Rare (abort in the microtask gap). A fallback without a reason costs triage time | Log e.message in the catch. On a failed owner.check() after a backend exists, dispose it | low (PLAUSIBLE) | NEW |
| R4 | Dead export: VisorOptics.clear (see R1). It is the fix, not something to delete. | lsp_references: 2 refs, def+export only | none | Wire it (R1) | high | NEW |

## Not done
- tlx.js (6810 lines): read only the mirror RT (1478-1518), the lamp grid (1679-1697) and the bind unwind/disposeKeepingContext. No full leak audit across track change (mirRT/_blitRT/lampGrid disposal on track change was not traced).
- car3d.js +572 and car-body-geom.js +775: export-level dead-code sampling only (ALLOW_TEAM_BODY_SWAP, wingBand, aeroFlaps, PANEL_COL all live). Internals not read.
- glx/, webgpu/wgx.js, shared/assets.js, js/lighting/**: not read beyond the pack-blend grep. Per-frame allocation audit not done.
- visor-optics.js per-paint allocations (gradient and string building, about 30 gradients/paint at HZ) were noted but not measured.
