# Season/year and stale-standings triage

Season/year: schedule and results take NO year argument and standings take an
OPTIONAL one. `F1API` derives the Jolpica season from the clock per call
(`season()`, `js/data/api.js` ~L18; URL = `/<year>/driverstandings.json`;
a past year caches 7 d). `loadStandings` (`standings.js`) asks for the current
year and, when that table is empty (Jan to the opener), falls back to last
season's FINAL table, headings tagged `LAST SEASON · <y> FINAL` (pinned by
`tests/unit/data-standings.test.mjs`). Only the OpenF1 pickers carry a year
(`hub.js` `apiYears()` / `sel.year`; `export.js` its own); the year/GP/SESSION
picker drives RESULTS, LIVE and TELEMETRY (`invalidateOther`), never STANDINGS
or SCHEDULE. So "standings show last year after a picker change" = the
`LAST SEASON` tag above (intended), a wrong system clock, a stale
`apex26.api.*` cache entry, a 60 min `MAX_AGE` node, or the mock
(`tests/helpers/f1-api-mock.js` pins `season: "2026"` and answers EVERY
year's path with it).

Cache check: API bodies live in localStorage under the prefix `apex26.api.`
(`CACHE_PREFIX`, `js/data/api-transport.js`; past-year entries 7 d). To rule a
stale entry out, remove every key with that prefix in the page and reload the
hub. Then fetch the live Jolpica `/<year>/driverstandings.json` yourself to
tell a stale cache from the API itself returning last year's table.
