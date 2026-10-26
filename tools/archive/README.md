# tools/archive — one-shot probes kept for provenance

Each script here measured one thing once and is cited only by the dated note
that reports the measurement. They are not part of any workflow, skill, CI job
or npm script, so they left the live tree (system audit 2026-10-26 §7,
`docs/notes/TOOLING-CONSOLIDATION-2026-10-26.md`). Paths mirror the old ones
under `tools/` (relative imports were shifted one level), so a re-run is
`node tools/archive/<old path>`; none is maintained, and one already failed to
load before the move (`gen/trees/measure-tree-budget.mjs` uses `require` in an
ES module).

| script | measurement | cited by |
|---|---|---|
| `ci/measure-guard-commit.mjs` | commit-through-hook time vs the bash-guard budget | `docs/archive/notes/BASH-GUARD-TIMEOUT-MEASURE-2026-10-18.md` |
| `gen/trees/measure-tree-budget.mjs` | tree instance budget per circuit | `docs/notes/TREE-BUDGET-2026-10-19.md` |
| `gfx/decal-bake-probe.mjs` | decal bake pool A/B on WebGL2 | `docs/archive/notes/TLX-WEBGPU-PERF-2026-10-18.md` |
| `net/rtc-sync-probe.mjs` | host/guest WebRTC start skew | `docs/plans/skilltest-game-systems.md`; comment in `js/net/netplay.js` |
| `perf/touch-boost-probe.mjs` | first BOOST press on touch (CDP touch events) | `docs/notes/TOUCH-BOOST-FIRST-PRESS-2026-10-23.md` |
| `perf/devicefarm-boot.mjs` | cold boot on AWS Device Farm iPhones | `docs/notes/DEVICE-FARM-LEDGER-2026-10-23.md`, `docs/surveys/w24d-devicefarm.md` |
| `perf/ers-deploy-census.mjs` | pipelines built per ERS deploy press | `docs/notes/TOUCH-BOOST-FIRST-PRESS-2026-10-23.md`, `docs/notes/PERFTEST-HUNT-2026-10-24.md` |

Kept live although the audit listed them as note-only: `perf/devicefarm-opus-probe.mjs`
(imported by `perf/devicefarm-iphone.mjs opus`), `car/helmet-trace.mjs` (the
generator `js/car/helmets.js` cites for its measured shell), `gen/track-stills.mjs`
(writes `assets/stills/`, cited by `js/ui/select-screen.js`) and
`perf/garage-census.mjs` (routed by the `mcp-probe` skill).

Do not add new probes here by default: publish a probe's evidence
(`tools/shot/publish-evidence.mjs`) and delete the script, or keep it live with a
skill route. Move a script here only when a committed note cites it.
