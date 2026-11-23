# Export tab (js/data/export.js, loadExport)

NOT a CSV and NOT the in-race
trace buffer. Gather = OpenF1 only (`meetings` -> `sessionsForMeeting` ->
`sessionDrivers` -> `fastestLap` -> `locationData`, paced; a 429 waits and retries, misses get one more
pass — timings are `gatherStartLines`) into `{circuits:{key:{trace,sf}}}`;
Download = hand-rolled `makeZip` of `startlines-<year>.json` + `img/<circuit>.png`
(canvas). "Empty" export = Download disabled until Gather completes, or every
circuit logged `· no lap/loc` (OpenF1 delayed/429 - read the status box), or
PNGs skipped (`toBlob` null). OpenF1 vs game comparison is the TELEMETRY tab (`telemetry.js`).
Pinned by `tests/unit/data-export.test.mjs` (zip/CRC/gather against `tests/helpers/f1-api-mock.js`);
browser-ui-hunt still checks the Gather prerequisite.
Export status is a `.dh-export-status` `<div>` (not `<pre>`).
