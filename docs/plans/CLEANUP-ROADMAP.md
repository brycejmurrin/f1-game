# Cleanup roadmap — dedupe and extract (2026-09)

Structured pass across `js/`: remove duplicated helpers, peel cohesive chunks out of
monoliths, lower line ratchets. **Not a rewrite** — IIFE globals, `<script>` load order,
no ESM.

**Execution rule:** one carve → one commit → guards → targeted tests → CI.

**Working branch:** `cursor/shared-frustum-df95` (Tier A continues)  
**Shipped so far:** PR [#102](https://github.com/brycejmurrin/f1-game/pull/102) (hash32 + dead `racingLineMix` + quali-net)

---

## Audit coverage

Eighteen parallel read-only bloat-auditor runs (see agent IDs in scratch matrix).
**Pending:** `js/camera`, `js/fx`.

| Module | Headline |
|--------|----------|
| js/core | store.js domain leaks (~110 ln) |
| js/physics | debris-world split; ~~dead racingLineMix~~ |
| js/garage | scene-dress + setup-livery; **block** preview extract |
| js/lighting | presets.js → JSON (~17k ln data) |
| js/render | frustum + inst-cells shared; split wgx |
| js/game.js | **0 ratchet slack** — quali-net first |
| js/track | build-guards ~860 ln; scenery contract frozen |
| js/car | car-aero + car-geom + liverytex split |
| js/ui | res-row helper; layer-id single source |
| js/net | lobby.js 1 ln slack — lobby-codes first |
| js/perf | metrics-snapshot split; clipboard dedup |
| js/career | career-guide extract; ~~hash32~~ |
| js/audio | engine.js monolith — music-playback first |
| js/race | quali-net + quali-session |
| js/data | telemetry monolith; api merge dup; session-picker |
| js/agent | apex ~111 ln slack; corners/cam/lobby |
| js/input | input.js 1.7k; bindings / pad-nav / hold-buttons |

---

## Tier A — do first (low risk, unlocks ratchets)

| # | Carve | From | Status |
|---|--------|------|--------|
| ✅ | `js/core/hash32.js` | career, daily-challenge, driver-ratings | **Done** (`03f8dd62`) |
| ✅ | Remove `AiDrive.racingLineMix` | ai-drive.js | **Done** (`91d23591`) |
| ✅ | **quali-net** (js/race/quali-net.js) | game.js (~130 ln) | **Done** (PR #102) |
| ✅ | **shared frustum helper** (js/render/shared/frustum.js) | 4 render copies | **Done** (this PR) |
| 1 | save-migrate | store.js | **NEXT** |
| 4 | race-settings + custom-team | game.js | Planned |
| 5 | res-row UI helper | duplicated row builders | Planned |
| 6 | lobby-codes | lobby.js (~230 ln) | Planned |
| 7 | car-aero | car3d.js (~520 ln) | Planned |
| 8 | copy-text clipboard helper | perf + elsewhere | Planned |
| 9 | music-playback | engine.js | Planned |

---

## Tier B — medium (manifest + tests)

| Carve | Notes |
|-------|-------|
| build-guards (track/scenery) | ~860 ln off tracks.js; 111-member scenery contract unchanged |
| scene-dress (garage) | ~470 ln |
| debris-render (physics) | split from debris-world |
| inst-cells (render/shared) | GLX + WGX dup |
| Lighting knobs help + profiles dedup | |
| api.js merge dedup (data) | ~48 ln, no new file — internal helpers only |
| session-picker (data/hub) | ~165 ln; LAZY_DATA order before hub |
| bindings (input) | ~190 ln |
| pad-menu-nav + hold-buttons (input) | spec-gated sequence |

---

## Tier C — large / infrastructure

| Carve | Size |
|-------|------|
| presets → lazy JSON asset (lighting) | ~17k ln |
| wgx split along GLX seams | ~6340 ln |
| generic-dress (track) | ~525 ln |
| setup-livery (garage) | large |
| telem-canvas (data/telemetry) | ~520 ln |
| agentview-corners (agent) | ~400 ln |
| apex-cam + apex-lobby (agent) | ~470 ln combined |

---

## Explicitly blocked

| Item | Reason |
|------|--------|
| Garage live preview from `game.js` | ~415 ln, ~15 `G` accessors |
| Split `updateCar()` / `render()` | Loop integrity |
| Merge GLSL / WGSL / TSL shaders | Different backends |

---

## Cross-cutting themes

1. **Horizontal dup** — frustum, inst-cells, team chips (hub/live/telemetry), OpenF1 merge (api.js), input binding loops
2. **Vertical monoliths** — game.js (10428 cap), wgx.js, telemetry.js, input.js, apex.js, debris-world.js
3. **Data not logic** — presets.js, KIT_DEF rows

**Dead exports to verify before delete:** hub `teamSwatch`, `streetLamp`, `trackAtmoBias`, `F1API.lastRace()`.

---

## Per-carve checklist

```sh
# optional boundary analysis (game.js extractions)
node tools/check/extract-module.mjs <file> <startLine> <endLine>

# after edits
node tools/gen/gen-shell.mjs          # if manifest changed
node tools/gen/gen-arch-table.mjs     # if manifest changed
node tools/check/ratchets.mjs --update   # if carving from ratcheted file
npm run test:guards
# targeted unit/spec per pick-tests
```

---

## PR / branch strategy

| Batch | Contents | Status |
|-------|----------|--------|
| PR #102 | hash32 + racingLineMix + ARCHITECTURE regen | CI green, draft |
| Next PR(s) | quali-net, then 1–3 Tier A carves each | Planned |

Review size is flexible: one carve per PR (safest) or batched Tier A slices (faster).

---

## Next action

1. **Carve save-migrate** from store.js — versioned localStorage migration helper.
2. Continue Tier A queue: race-settings + custom-team, res-row, lobby-codes.

Scratch working matrix (agent IDs, line-level BLOAT rows): `scratch/cleanup-roadmap-draft.md` (gitignored).
