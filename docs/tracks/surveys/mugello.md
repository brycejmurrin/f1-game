# Mugello — circuit survey (2026-10-14)

**Circuit id:** `mugello` · **Deploy brief:** [`docs/tracks/mugello.md`](../mugello.md) · **Live:** [Tuscan GP on GitHub Pages](https://brycejmurrin.github.io/f1-game/)

**Screenshots:** **16** dry **day** frames in `artifacts/shots/tracks/mugello/*__dry-day.jpg` (gitignored until rebased on shared PR *tools: shared shot tooling for circuit surveys*). **Weather / dusk / dawn / night matrix — deferred** (needs batch `weather` + committed `artifacts/shots/tracks/**`).

## Code map

| Layer | Path | Role |
|--------|------|------|
| Track def | `js/circuits/mugello.js` | OSM centreline, `theme: "green"`, elevations, `bankZones`, `night: false`, `furniture.lamp: "none"`. |
| Scenery | `js/circuits/scenery/mugello.js` | Vine quilt, casali, cypress, stands, casale, pieve, terrazza, mountains. |
| Landmarks | `tests/data/landmarks/mugello.json` | Centrale, Poggio Secco, Materassi (required `modelGroup`s). |

**Sectors:** `sectors: [0.34, 0.666]`.

## Dry day — by sector (16 frames)

### Sector 1

| Frame | Lap `s` | Shot file (under `artifacts/shots/tracks/mugello/`) |
|-------|---------|-----------------------------------------------------|
| San Donato trackside | 0.145 | `sector1-san-donato__dry-day.jpg` |
| Poggio Secco orbit | 0.218 | `sector1-poggio__dry-day.jpg` |
| Materassi trackside | 0.238 | `sector1-materassi__dry-day.jpg` |
| Pieve campanile | 0.235 | `sector1-pieve__dry-day.jpg` |

### Sector 2

| Frame | Lap `s` | Shot file |
|-------|---------|-----------|
| Casanova-Savelli | 0.312 | `sector2-casanova__dry-day.jpg` |
| Valley sightline | 0.36 | `sector2-valley__dry-day.jpg` |
| Arrabbiata orbit | 0.50 | `sector2-arrabbiata-orbit__dry-day.jpg` |
| Arrabbiata chase | 0.52 | `sector2-arrabbiata-chase__dry-day.jpg` |
| Casale hero | 0.498 | `sector2-casale__dry-day.jpg` |
| Arrabbiata GA hill | 0.505 | `sector2-hill-58__dry-day.jpg` |

### Sector 3

| Frame | Lap `s` | Shot file |
|-------|---------|-----------|
| Correntaio | 0.62 | `sector3-correntaio__dry-day.jpg` |
| Bucine | 0.88 | `sector3-bucine__dry-day.jpg` |
| Main straight orbit | 0.00 | `sector3-start-orbit__dry-day.jpg` |
| Grid chase | 0.00 | `sector3-start-park__dry-day.jpg` |
| Tribuna Centrale | 0.005 | `sector3-centrale__dry-day.jpg` |
| Pit straight orbit | 0.98 | `sector3-pit-orbit__dry-day.jpg` |

PR and review panels use the same filenames as HTML `<img>` tags once `artifacts/shots/tracks/**` is committable (shared tooling PR).

## Weather and lighting (follow-up after shared tooling)

Planned: **6 hero views** × (`wet` | `rain` | `overcast` | `fog` | `dusk` | `dawn` | `night`) via `__apex.weather()` + `setTimeOfDay()` in batch jobs.

| Hero | `s` | Weather/lighting risks to check |
|------|-----|----------------------------------|
| `sector3-start-orbit` | 0.00 | Fog horizon vs `pal.fogColor`; night with no lamps |
| `sector1-san-donato` | 0.145 | Wet gravel vs road sheen |
| `sector2-casanova` | 0.312 | Terrazza z-fight under overcast |
| `sector2-arrabbiata-orbit` | 0.50 | Rain on banking |
| `sector3-centrale` | 0.005 | Dusk exposure on Ferrari reds |
| `sector3-bucine` | 0.88 | Mist in valley behind terrazza |

## Findings and fixes

**Fixed (this branch):** vine soil burial; `openArea` for Casanova/Bucine terrazza; Poggio/Materassi plinth on `groundUnder`.

**Open:** terrazza clip at baseline cap (5 severe); no floodlights (`lamp: "none"`); heavy prop count.

**Audit:** buried 6→3, float 0, clip severe 5/5 cap — `audit-circuit mugello` all `ok: true`.

```sh
node tools/track/verify-track.cjs mugello
node tools/track/audit-circuit.cjs mugello
```
