# Playback DOM mutations and observer fanout

Measured against `cfefcbf7fd3f972ce2adaaf1c5579946acbbd085`, then against the
write-on-change patch in `telemetry-player.js` and `watch-transport.js`.

## Cause

WATCH already avoided unchanged text and value writes, but reassigned both event
buttons' `disabled` properties on every 100 ms update. Reassigning an already
true disabled property generates an attribute mutation in Chromium. SettingDeps
observes that attribute on the document and schedules its settings refresh.

Telemetry reassigned gauge and lane-board `textContent` on each paint, even
when the formatted sample was unchanged. Those replacements also wake the
Data Hub's AriaState observer and its control scans. Numeric speed values need
string normalization before comparing against DOM text; otherwise equality
would never suppress them.

## Evidence

One Chromium session per revision, 844×390 viewport with touch enabled. The
fixture loads the production transport, telemetry model/player, SettingDeps and
AriaState modules. Replay state and telemetry samples are synthetic; canvas
rendering is stubbed. This isolates actual DOM mutation delivery and observer
fanout, not elapsed frame time or the full game screen's refresh cost.

| Stable workload | Before | After |
| --- | ---: | ---: |
| WATCH, 30 ticks: disabled attribute mutations | 30 | 0 |
| WATCH, 30 ticks: settings element lookups | 4,260 | 0 |
| Telemetry, 60 four-lane frames: child-list mutations | 840 | 0 |
| Telemetry, 60 four-lane frames: Data Hub control queries | 236 | 0 |

The probe also verifies forward event bounds, rewind bounds, changed speed,
gear, throttle and DRS, and an unchanged comparison lane. Both revisions pass
those behavior checks and have no browser errors. Ticks are accelerated to one
per animation frame; production WATCH runs at 10 Hz. Control-query counts can
depend on observer batching, whereas redundant mutation elimination is the
direct invariant.

The VM additionally counted repeated style-width assignments, but Chromium
reported no unchanged style mutations. Therefore this patch leaves width and
class updates alone. Avoid optimizing a mock-only cost without browser evidence.

## Change and regression coverage

Compare against current DOM values before writing disabled state or formatted
text. There is no parallel cached state to invalidate when panels rebuild or
another caller edits the DOM. Event selection, telemetry math, formatting,
classes and accessibility behavior are unchanged.

Existing `real-replay-transport.test.mjs` and `telemetry-trace.test.mjs` cover
stable writes, rounded values, null readings, neutral gear, DRS changes, signed
gaps, rewind and repair after external DOM changes. The focused pair passes
38 tests. Browser mutation artifacts and the reproduction script are local
ignored evidence under `artifacts/performance-audit/` and
`scratch/performance-audit/ui-dom-probe.mjs`.

This establishes avoided DOM and observer work. It does not establish a phone
FPS gain, a GPU improvement, or a complete accessibility audit.

## Measurement references

- [DOM textContent semantics](https://dom.spec.whatwg.org/#dom-node-textcontent)
- [Mutation observer delivery](https://dom.spec.whatwg.org/#mutation-observers)
- [Chrome Performance recording guidance](https://developer.chrome.com/docs/devtools/performance/reference)

Use operation counts for this invariant and separate runtime measurements for
user-visible timing. CPU throttling and software rendering do not reproduce a
physical phone's CPU/GPU behavior.
