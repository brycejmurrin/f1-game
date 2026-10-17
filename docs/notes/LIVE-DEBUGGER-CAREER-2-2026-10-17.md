# Live debugger career hunt, round 2 — 2026-10-17

Lane: career / garage / menus / saves, js-debugger MCP, debug Chrome :9222, headless software GL, deploy tip 7d96dc5b. Round 1 (partial; the session stopped early): angle 1 only.

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| L1 | js/car/custom-liveries.js:25 `getLiveryId` -> js/game.js:1511 `partsVisualKey` (`"\|L:" + getLiveryId(teamId)`) | low | CONFIRMED-LIVE, storage-tamper only | `localStorage["apex26.livery.mercedes"] = {"toString":1}`, reload, click `#mb-garage`: `debugger_exception_log` shows `TypeError: Cannot convert object to primitive value` at game.js:1511 via `previewKey` (setup-camera.js:517) <- `prebuildKey` (:1069) <- `ready` (prebuild.js:148) <- `tick` (prebuild.js:215), repeating every prebuild tick (18 entries in one open). |
| L1b | (verdict amended by the orchestrator) | | CONFIRMED-LIVE (tamper-only) | Cars lane owns js/car/*; not fixed here. |
| L2 | js/career/save-migrate.js remapPoints (`nextPts[id] \|\| 0`) | low | CONFIRMED-LIVE | live `SaveMigrate.migrateCareer` over 912 hostile mutations: `season.pts = {toString:1}` -> `{toString: NaN}` (inherited `Object.prototype.toString` is truthy, so `fn + 0` is a string and `Math.min` gives NaN). Reached by a save/backup whose pts key is a prototype member name; the NaN reaches Object.entries(season.pts) consumers (career-ui.js:1259, results-sheet.js:772). Fixed with `Object.hasOwn`; test fails before (NaN) and passes after. |

Call path / reachability: every product writer is string-gated (`SettingsExport.garageValue` `livery.` branch requires a string; `ShareCode` decode keeps `id` only if `typeof === "string"`; MY TEAM identity goes through `CareerTeamIdentity.sanitize`, `livery.custom` accepts a string only). So the value can only arrive by direct localStorage edit (or an UNDO record edited by hand). Hardening, not an exploitable import bug. Suggested fix (file is outside this lane's OWNED globs, so not applied): `getLiveryId` returns `"default"` unless the stored value is a string, and `getCustomLiveries` returns `[]` unless `Array.isArray`. Not tested: the non-array `livery.custom.<team>` variant (the page had not reloaded when I read the log; the exception log read back the first repro).

## Clean (round 2)
Angle 2: setup share code round trip decodes and applies (stored values are clamped on read by `SetupTune.get`, BY-DESIGN); designer APXT code round trips identically, 300 single-char mutations: 0 throws, 6 decoded all finite. Angle 3 live: 912 hostile-value mutations over every path (depth<=3) of a MY TEAM save through `SaveMigrate.migrateCareer`: 0 throws, only L2 non-finite. `restore-points.js` `Number(d.money)` runs on already-migrated JSON, safe.

## Round B (angles 4 and 5), all CLEAN
| area | verdict | evidence |
|---|---|---|
| 4 seasons driven through the real career flow (hub `#cr-go` -> quali -> race staged, then `careerSim(24)` + `careerRollover()` x4, haas seat 1) | CLEAN | 0 non-finite values in `careerState()` (depth 4) at every step; money 1200 -> 29212; rep 44 -> 98; `deal.left` reaches 0 and 2 offers are on the table (BY-DESIGN: offers only in the expiry winter). `careerSim` needs the career flow staged: `race()` gives `flow:"gp"` and returns `[]`. |
| R&D / facility purchase at the edges | CLEAN | cost 3000 refused at money 0, bought at exactly 3000 (money -> 0, level 1, discount 0.05). `careerMoney(1e308)` and `careerMoney(-5)` both read back 0 (test hook clamps; not product). |
| Slot switching mid-season | CLEAN | slot driver2 at round 5 (money 1777, 22 finish rows), switched to driver1, driver0, myteam0 and back: each slot kept its own round/money/pts; driver2 returned identical. |
| Input pad setters with hostile args | TAMPER-ONLY | `Input.setPadLabelMode({toString:1})` and `setPadBinding({toString:1}, ...)` throw "Cannot convert object to primitive value" (bindings.js:281 `PAD_NAME_SETS[m]`, :252 `Number(index)`). Callers pass `store.get("padLabels")` (key-binds.js:400), which settings import validates (round 1: `{toString:1}` in every setting is refused), so only a hand-edited localStorage reaches it. js/input is outside this lane; not fixed. |
| Static sweep of `x[k] \|\| 0` on saved maps (garage, career, season-cal) | CLEAN | other sites index by roster ids or fixed axis names, not by save-supplied keys (L2 was the only one fed by save keys). |

## Not run
Settings-file round trip was not repeated (round 1 of 2026-10-16 covers it). A driven (not simulated) race for the economy; `modes` browser group. Cleanup: tampered keys removed, debugger detached, exception log left active on the page (page closes with the Chrome).
