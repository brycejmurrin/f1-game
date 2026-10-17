# Live debugger career hunt, round 2 — 2026-10-17

Lane: career / garage / menus / saves, js-debugger MCP, debug Chrome :9222, headless software GL, deploy tip 7d96dc5b. Round 1 (partial; the session stopped early): angle 1 only.

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| L1 | js/car/custom-liveries.js:25 `getLiveryId` -> js/game.js:1511 `partsVisualKey` (`"\|L:" + getLiveryId(teamId)`) | low | CONFIRMED-LIVE, storage-tamper only | `localStorage["apex26.livery.mercedes"] = {"toString":1}`, reload, click `#mb-garage`: `debugger_exception_log` shows `TypeError: Cannot convert object to primitive value` at game.js:1511 via `previewKey` (setup-camera.js:517) <- `prebuildKey` (:1069) <- `ready` (prebuild.js:148) <- `tick` (prebuild.js:215), repeating every prebuild tick (18 entries in one open). |

Call path / reachability: every product writer is string-gated (`SettingsExport.garageValue` `livery.` branch requires a string; `ShareCode` decode keeps `id` only if `typeof === "string"`; MY TEAM identity goes through `CareerTeamIdentity.sanitize`, `livery.custom` accepts a string only). So the value can only arrive by direct localStorage edit (or an UNDO record edited by hand). Hardening, not an exploitable import bug. Suggested fix (file is outside this lane's OWNED globs, so not applied): `getLiveryId` returns `"default"` unless the stored value is a string, and `getCustomLiveries` returns `[]` unless `Array.isArray`. Not tested: the non-array `livery.custom.<team>` variant (the page had not reloaded when I read the log; the exception log read back the first repro).

## Not run
Angles 2 (setup/designer share codes), 3 (Number()/`|0` loader sweep), 4 (R&D, contract expiry, slot switch mid-season), 5 (settings round trip beyond round 1 of 2026-10-16). Cleanup: tampered keys removed, debugger detached, exception log left active on the page (page closes with the Chrome).
