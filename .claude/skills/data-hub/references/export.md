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
No unit test pins zip/CRC/gather (only `data-lazy-loader` load order and a browser-ui-hunt
"Gather prerequisite" check): a change here is browser-only unverified - say so.
Export status is a `.dh-export-status` `<div>` (not `<pre>`).
