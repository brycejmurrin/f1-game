# Export tab (js/data/export.js, loadExport)

NOT a CSV and NOT the in-race
trace buffer. Gather = OpenF1 only (`meetings` -> `sessionsForMeeting` ->
`sessionDrivers` -> `fastestLap` -> `locationData`, paced 2-5 s/call, ~10 min,
429 waits 90 s, misses retried once after 2 min) into `{circuits:{key:{trace,sf}}}`;
Download = hand-rolled `makeZip` of `startlines-<year>.json` + `img/<circuit>.png`
(canvas). "Empty" export = Download disabled until Gather completes, or every
circuit logged `· no lap/loc` (OpenF1 delayed/429 - read the status box), or
PNGs skipped (`toBlob` null). In-race samples: **agent-view**; OpenF1 vs game
comparison is the TELEMETRY tab (`telemetry.js`, `telemetry-compare.spec.js`).
`tests/unit/data-export.test.mjs` pins zip/CRC/gather against `tests/helpers/f1-api-mock.js`
(file list, header CRC-32 and sizes, JSON shape, empty meetings, failed fetch).
`data-lazy-loader` still pins load order; browser-ui-hunt still checks the Gather prerequisite.
Export status is a `.dh-export-status` `<div>` (not `<pre>`).
