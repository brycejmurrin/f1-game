# Live debugger — cockpit / helmet finishes (B·H33, 2026-10-21)

Lane: do paint finishes reach the COCKPIT and HELMET cameras, on TLX (three.js, default), GLX and WGX; and
the steering wheel's finish as seen from the seat. Branch `cursor/live-debug-cockpit-1-b5e3`.
Bryce's grant (orchestrator session, 2026-10-21 ~21:02Z): "proving cockpit and helmet views such that paint
finishes apply there and we improve the finish on the steering wheel".

## How a finish reaches the seat

A livery FINISH is a per-vertex surface-id remap (`CarMaterials.finishPass` → `applyFinish`, `FINISH_SURFACE`),
not a material. The cockpit and helmet cameras draw `CarDraw.cockpitBodyMesh` — a `Car3D.build(…, { cockpit:
true, noDriver: true, … })` of the SAME resolved livery — inside `drawCockpitRig` with the frame's `paint`
opts (`GradeTint.carPaint`, which sets `carFinish: true`, the flag the 60-85 finish block of every lit shader
gates on). The cache key carries `partsVisualKey`, which ends `|L:<livery id>`, so a different livery (and so
a different finish) is a different mesh. The steering wheel, cabin and dash are separate rig meshes
(`car-mesh.js`) that never carried a livery finish by design.

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| F1 | js/car/car-draw.js:1063 (buildPendingCockpitBody) | — | REFUTED (no gap) | VM: `Car3D.build` cockpit:true for mclaren / racingbulls / mercedes × matte, satin, brushed, chrome: every painted vertex (1404–1586 per team) carries the finish id, 0 gloss-20 left; exterior builds the same. Guard: `tests/unit/cockpit-wheel-finish.test.mjs` test 1. |
| F2 | js/car/car-draw.js:1216 + js/game.js drawCockpitRig call | — | CODE-TRACED (all three backends) | The body draws with the frame's `paint` opts (`carFinish: true`): TLX `tsl-lit.js` `matU.carFinish`, GLX `glsl-lit.js` `uCarFinish`, WGX `wgsl-chunks.js` `DrawU.mat3.z` all run the finish block for it, identically to the exterior. Source pin: test 2. |
| F3 | helmet camera | — | BY-DESIGN | `helmet` and `cockpit` share `cockpitBodyMesh` (car-draw.js:772, :941); `visor` draws the same body without the wheel. The driver's own helmet is not drawn in any first-person view (`noDriver`), so a helmet "finish" has nothing to land on. |
| F4 | livery `metallic` | low | BY-DESIGN | There is no `metallic` finish id; `FINISH_SURFACE` has `flake` (metallic flake), `pearl`, `xirallic`. A livery with `finish: "metallic"` renders gloss on every view, exterior included. |
| F5 | js/car/car-draw.js:1265 (drawCockpitRig wheel) | medium (look) | CODE-TRACED | The steering wheel draws with the rig's `_cockpitOpts` (roughness 0.88, clearcoat 0). The lit shaders' carbon branch takes `min(clearcoat, 0.42)` → 0 lacquer and `max(rough, 0.52)` → 0.88: the wheel's carbon reads as matte plastic, and its alloy fasteners, button bezels and LCD glass are all panel 26 (rough ≥ 0.72). One flat grey-black lump. Fix: B·H33 wheel finish (below). |
| F6 | js/car/car-draw.js:772 / :941 (warm) | low (perf) | CODE-TRACED | The warm pre-builds `cockpitBodyMesh` for `cockpit`/`helmet` only; `visor` draws the same mesh, so its first frame builds it. Not a finish defect; noted for the perf lane. |

## Live proof (pixels)

McLaren with a seeded custom livery (`c1` papaya, `finish` gloss/matte/chrome), monza 0.04 day, 844×390, the
`go → camera → jump` flow (park/freeze leaves the cockpit black: `tools/shot/repro-shot.mjs` header), script
`scratch/h33/cockpit-finish.mjs` (untracked). Mean |Δ| per channel vs gloss, 0–255:

| backend | view | matte: L pod / R pod / halo | chrome: L pod / R pod / halo | verdict |
|---|---|---|---|---|
| GLX | cockpit | 1.3 / 2.5 / 0.5 | 9.8 / 8.7 / 0.0 | CONFIRMED-LIVE |
| GLX | helmet | 1.4 / 2.6 / 0.6 | 12.2 / 10.6 / 0.0 | CONFIRMED-LIVE |
| TLX (WebGL2) | cockpit, helmet | — | — | NOT MEASURED: the cockpit 3D frame presents all-black under SwiftShader here (chase renders; GLX cockpit renders; mirror off changes nothing). Handed to B·H26 (render/three owner) as a possible TLX finding. The finish path is the same mesh + the same `carFinish` opts (F1, F2). |
| WGX | cockpit, helmet | — | — | NOT MEASURED: capture cap; code-traced (F2) |

The halo reads 0.0 for chrome because the factory halo is metal, not paint (`haloFinish` drives it). Matte's
small Δ is SwiftShader's flat diffuse; the finish id is on every painted vertex (F1).

Two harness traps cost this lane four black captures, recorded so the next one does not: the player team in a
fresh probe profile is NOT McLaren despite `store.get("team", 2)` (pin `installProbeInit({ team: 2 })` before
seeding `apex26.livery.<team>`), and a gloss seed carries no `finish` key, so it cannot prove the seed applied.

## Steering wheel finish

Options shown to Bryce as stills (same geometry, surface remap + finish draw opts; zero added vertices, no texture):

- `carbon` — lacquered twill carbon structure, rubber grips, brushed-alloy (29) hardware and bezels, glass LCD.
- `anodised` — carbon structure, team-accent anodised (44) bezels and hardware, glass LCD.
- `suede` — Alcantara (42) grips, matte (28) structure, gunmetal (39) hardware, glass LCD.

Picked by Bryce (AskUserQuestion, 2026-10-22): **A, carbon + alloy** — `CarMesh.WHEEL_DEFAULT = "carbon"`.
Close-up mean |Δ| vs stock in the wheel crop (GLX): carbon 3.4, anodised 3.5, suede 2.4. B and C stay in
`WHEEL_FINISHES` (no UI). Phone budget: no vertex, no texture; one more lit program (the wheel's opts differ
from the rig card's). GPU frame-time evidence: gpu-census.yml, see the PR.

## Status

F1–F6 recorded; wheel finish A shipped as default in PR #3454.
