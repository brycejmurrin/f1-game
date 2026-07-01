# localStorage schema

All persistent state lives in `localStorage`. Keys are prefixed `apex26.` and
written through the `store` helper in `js/game.js` (`JSON.stringify`/`parse`,
silently no-ops on quota errors) — with two exceptions noted at the bottom.

```js
const store = {
  get(k, d) { /* localStorage.getItem("apex26." + k) → JSON.parse, or d */ },
  set(k, v) { /* localStorage.setItem("apex26." + k, JSON.stringify(v)) */ },
};
```

## Keys written via `store` (all prefixed `apex26.`)

| Key | Type | Meaning |
|-----|------|---------|
| `team` | string | Selected team id (e.g. `"mercedes"`) |
| `driver` | number | Selected driver index within the team |
| `track` | string | Last selected circuit id |
| `difficulty` | number | AI difficulty index |
| `season` | object | Season-mode progress: round, standings, points |
| `customTeam` | object | Custom team name/colours/drivers |
| `parts.<teamId>` | object | Car-setup selections per team (see `js/parts.js`) |
| `unlimitedBudget` | bool | Removes the 600 cr parts budget cap |
| `ttlb.<trackId>` | array | Per-track time-trial leaderboard — top 10 laps, sorted ascending, each `{t, team, driver, …}` |
| `camMode` | number | Camera mode index (persisted between sessions) |
| `sound` | bool | SFX on/off |
| `music` | bool | Music on/off |
| `manual` | bool | Manual gearbox on/off |
| `pace` | number | Pace/assist slider |
| `preset` | string | Steering preset id |
| `drivingHelp` | number | Driving-help assist level |
| `raceLine` | bool | Racing-line assist overlay |
| `steerMode` | string | `"tilt"` \| `"buttons"` \| `"touch"` |
| `buttonSteer` | number | Button-steer rate setting |
| `steerExpo` / `steerLock` / `steerRate` / `steerSmooth` / `steerSpeed` | number | Advanced steering sliders (pause menu) |
| `tiltDeg` | number | Tilt-steering calibration angle |

## Exceptions (not via `store`)

| Key | Owner | Meaning |
|-----|-------|---------|
| `apex26.api.<url>` | `js/api.js` | F1API response cache: `{t: Date.now(), data}` per fetched URL (`CACHE_PREFIX = "apex26.api."`) |
| `apex_ghost_v1` | `js/ghost.js` | **Not `apex26.`-prefixed.** Time-trial ghost laps: `{ <trackId>: {t, s[], x[], …} }` — parallel `(t, s, x)` arrays of the best lap |

## Conventions

- Always go through `store.get/set` for new game settings — it centralises the
  prefix, JSON codec, and quota-error swallowing.
- Clearing state in tests: `localStorage.clear()` is safe; every module treats a
  missing key as "use default".
