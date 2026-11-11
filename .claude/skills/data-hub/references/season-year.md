# Season/year and stale-standings triage

Season/year: schedule and results take NO year argument and standings take an
OPTIONAL one. `F1API` derives the Jolpica season from the clock per call
(`season()` in `js/data/api.js`; URL = `/<year>/driverstandings.json`;
a past year caches `TTL_HISTORIC`). `loadStandings` (`standings.js`) asks for the current
year and, when that table is empty (intended: Jan to the opener), falls back to last
season's FINAL table, headings tagged `LAST SEASON · <y> FINAL` (pinned by
`tests/unit/data-standings.test.mjs`). Only the OpenF1 pickers carry a year
(`hub.js` `apiYears()` / `sel.year`; `export.js` its own); the year/GP/SESSION
picker drives RESULTS, LIVE and TELEMETRY (`invalidateOther`), never STANDINGS
or SCHEDULE.

"Standings show last year" — split on the heading tag first:

| Table | Cause | Check |
|---|---|---|
| TAGGED `LAST SEASON · <y> FINAL`, Jan → opener | intended fallback | none |
| TAGGED, mid-season | BUG: the current-year table came back empty (shape change, `jStandingsList` null, a 200 with an empty list), or the API served another year's body — `standingsSeasonOk` (`api.js`) refuses it (a `standings season mismatch` warn) and the fallback paints | fetch Jolpica `/<season()>/driverstandings.json`; read its `StandingsLists[0].season` through `jStandingsList` |
| UNTAGGED | wrong page clock (`season()` reads it, so the URL and the check both use the wrong year) | `F1API.season()` on the live page FIRST (mcp-probe `evaluate_script`; `F1API` is lazy — open DATA first or it is undefined), then the raw Jolpica body |
| any, in a browser spec | the mock (`tests/helpers/f1-api-mock.js` answers every year's standings path with one fixed-season body) | not a product bug |

Only at the year rollover (within an hour of New Year): a `MAX_AGE` tab node or an
`apex26.api.*` entry built under the old year. Otherwise the cache cannot hold a
different year: its key is `CACHE_PREFIX` + the URL, and the URL embeds the year.

Cache check (rollover only): API bodies live in localStorage under the prefix `apex26.api.`
(`CACHE_PREFIX`, `js/data/api-transport.js`). To rule a
stale entry out, remove every key with that prefix in the page and reload the
hub (a live-page step: mcp-probe `evaluate_script`, session only — a subagent
cannot run it).
Base URLs are the `JOLPICA` / `OPENF1` constants in `js/data/api.js`. From this
container outbound HTTPS goes through the agent proxy (`/root/.ccr/README.md`); a 403/407
or TLS error there is the proxy, not the API returning nothing.
