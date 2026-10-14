# Donington Park — circuit survey (2026-10-14)

Parent brief: [`donington.md`](../donington.md). Live: [Donington on GitHub Pages](https://brycejmurrin.github.io/f1-game/).

**Scope:** `js/circuits/donington.js` + `js/circuits/scenery/donington.js` only. Shared shot tooling / `artifacts/shots` git policy lands in a separate PR (`tools: shared shot tooling for circuit surveys`); this branch does **not** change `tools/shot/*`, `.gitignore`, or fleet baselines.

## Code map

| Piece | Path | Role |
|---|---|---|
| Circuit def | `js/circuits/donington.js` | OSM centreline, `startFrac` 0.9072, green `pal`, 11 `turns`, `furniture.lamp: "none"`, `terrainOuter` 110. |
| Scenery | `js/circuits/scenery/donington.js` | Lazy `TrackScenery["donington"]`; pit/S-F via `sl()`; heroes: Hollywood, EMA airliner, Ratcliffe, Starkey's bridge. |
| Lighting | `js/lighting/presets.js` | Full `donington|{tod}|{weather}` grid; day look donor = Silverstone. |
| Landmarks | `tests/data/landmarks/donington.json` | Three required `modelGroup` ids. |

**API (for follow-up captures):** `__apex.weather("dry"|"wet"|"rain"|"overcast"|"fog")`, `__apex.setTimeOfDay("dawn"|"day"|"dusk"|"night")` (`docs/DEBUG-HOOKS.md`). Batch `weather` on `shot.mjs` is **not** on this branch — see PR handoff.

**Frame debt:** `_sceneryShift` ≈ 0.10; corners use authored `K(s)`; pit row uses `sl(f)` only.

## Survey frames (36) — sector coverage, day / dry

Planned committed path after shared tooling: `artifacts/shots/tracks/donington/<name>.png`. Until rebase, copies live on the survey agent VM only. Captures use GLX (`node tools/shot/shot.mjs … --backend webgl2`).

### Sector 1 — pit straight, Collection, Redgate

| Pits (orbit) | Start/finish (cinematic) | Collection (orbit) |
|:---:|:---:|:---:|
| `s1-pits-day-dry-orbit.png` | `s1-sf-day-dry-cinematic.png` | `s1-collection-day-dry-orbit.png` |

| Redgate (trackside) | | |
|:---:|:---:|:---:|
| `s1-redgate-day-dry-trackside.png` | | |

### Sector 2 — Hollywood, Craner, Old Hairpin

| Hollywood (orbit) | Craner infield (eye) | Craner (trackside) |
|:---:|:---:|:---:|
| `s2-hollywood-day-dry-orbit.png` | `s2-craner-infield-day-dry-eye.png` | `s2-craner-day-dry-trackside.png` |

| Old Hairpin (orbit) | | |
|:---:|:---:|:---:|
| `s2-oldhairpin-day-dry-orbit.png` | | |

### Sector 3 — Starkey's, Schwantz, McLeans, EMA, Ratcliffe

| Starkey's (park) | Under bridge (eye) | Schwantz (trackside) |
|:---:|:---:|:---:|
| `s3-starkeys-day-dry-park.png` | `s3-starkeys-day-dry-under-bridge.png` | `s3-schwantz-day-dry-trackside.png` |

| McLeans (orbit) | EMA airliner (orbit) | Ratcliffe horizon (orbit) |
|:---:|:---:|:---:|
| `s3-mcleans-day-dry-orbit.png` | `s3-ema-day-dry-orbit.png` | `s3-ratcliffe-day-dry-horizon.png` |

### Sector 4 — Coppice, Esses, Melbourne, Goddards

| Coppice (trackside) | Esses (orbit) | Melbourne (trackside) |
|:---:|:---:|:---:|
| `s4-coppice-day-dry-trackside.png` | `s4-esses-day-dry-orbit.png` | `s4-melbourne-day-dry-trackside.png` |

| Goddards (orbit) | | |
|:---:|:---:|:---:|
| `s4-goddards-day-dry-orbit.png` | | |

*(36 filenames above — full sector + landmark pass at day/dry; PR panel images use the same names under `artifacts/shots/tracks/donington/` once committed post-rebase.)*

## Deferred — weather / TOD matrix (6 key views)

**Blocked** on shared `shot.mjs` batch `weather` + `artifacts/shots/tracks/**` gitignore. After rebase, re-capture **only** these with dry/wet/rain/overcast/fog and dusk/night where noted:

| View | Frac | Cam | TOD / wx variants |
|---|---|---|---|
| Hollywood stand | 0.188 | orbit | dusk, night, overcast, rain, fog, wet |
| Craner outside | 0.321 | trackside | wet, rain, fog |
| Starkey's Bridge | 0.455 | park | dusk, night, wet |
| Esses stand | 0.759 | orbit | night, rain |
| Start/finish | 0.05 | cinematic | dusk, overcast |
| EMA departure | 0.64 | orbit | dusk, overcast |

**Early observations from provisional wx shots (not on branch):** night paddock neon reads Vegas-donor, not club circuit (B5); `lamp: "none"` leaves mid-lap cockpit very dark (B6); rain/wet road on GLX looks sane (B8).

## Findings and backlog

**Audits (this branch, scenery only):** `verify-track` OK; `audit-circuit` OK — float 2/2 (EMA sky), clip severe **7** (cap **8**, not lowered), coplanar 0, props tris 242282 (below fleet cap 243034).

| ID | Finding | Severity |
|---|---|---|
| B1 | `forestEdge` conical vs brief broadleaf. | Med |
| B2 | Tan horizon beyond `terrainOuter` / `farHill`. | Med |
| B3 | Hollywood `modelGroup` internal clip ~2.4 m³ at s≈0.176. | Med |
| B4 | Starkey's kit crowd `along` overlap s≈0.44. | Low |
| B5 | Night neon on club buildings (donor palette). | Med — deferred wx pass |
| B6 | No floodlight pass (`lamp: "none"`). | Med |
| B7 | Esses lit vs dark Schwantz/Coppice at night. | Low |
| B8 | Goddards `grandstandEx` suppressed (berm). | Low |

## Ranked improvements

1. **Done (this PR):** Pre-Hollywood `forestEdge` trim; Old Hairpin hedge gap; Coppice/Schwantz understorey; EMA altitude 95 m; survey doc + 36-frame day/dry plan.
2. **After shared tooling rebase:** Commit PNGs; run 6-view weather/TOD matrix; refresh PR panels.
3. **Next:** Hollywood mesh clip fix; night palette for `night: false` classics.
4. **Deferred:** Broadleaf `rank()` vs `forestEdge`; Donington lighting look-survey.

## Fixes applied

`js/circuits/scenery/donington.js` only — see diff vs `origin/claude/f1-game-project-26h3ng`.
