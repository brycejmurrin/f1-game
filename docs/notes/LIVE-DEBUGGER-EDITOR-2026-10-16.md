# Live debugger hunt: track designer and custom circuits (2026-10-16)

Lane `cursor/live-debug-editor-5b2e`. Debug Chrome 844x390 over CDP, SwiftShader, driven through the js-debugger MCP.
Source SHA at start: deploy tip 43d845f3. Status: DONE for this lane. **No defect found in `js/editor/`; no code changed.** Everything below was measured live.

## Verdict per area

| area | verdict | evidence |
|---|---|---|
| 1 pathological layouts | clean | Area 1 table: every bad layout refused by `sanitize` or RED in `TrackValidate.check`; no NaN, no throw |
| 2 racing a custom design | clean on one layout; seam class untested | 600 s, 21 AI cars, all gaps/laps finite, none retired; #2545 node-0 corner not probed |
| 3 share codes / import | clean | 19/20 round-trips equal (the 20th correctly refused), truncation/garbage/bit-flip all give a reason, 12 hostile collections handled, no prototype pollution |
| 4 undo/redo, autosave, delete-selected | clean | stack capped at 100, draft restored after reload, stale index heals to Bahrain |
| 4 touch editing at 844x390 | NOT TESTED | see viewport gap below |
| 5 caught-exception pauses | 1 pause, benign | table in Pauses triaged |

Overall: no defect in `js/editor/`, no code changed.

## Viewport gap

The debug Chrome was launched with `--window-size=844,390` but `innerWidth x innerHeight` read 844x198 (headless window-size counts browser chrome). At 198 px tall the designer's main canvas was never laid out, so the touch result above is not evidence about a real phone. A follow-up should launch with `--window-size=844,520` or set the viewport over CDP (`Emulation.setDeviceMetricsOverride` 844x390 with touch), then read `innerHeight` before trusting any layout.

## Tool problems (js-debugger MCP, recorded only; `tools/mcp/` untouched)

- `debugger_attach` fails with `Missing argument: endpoint` when given only `targetId`; the endpoint must be passed again.
- `debugger_evaluate` while not paused fails with `Missing argument: pauseToken`; use `debugger_run` then `debugger_state`.
- `debugger_evaluate` rejects `frameIndex` (`Unknown argument`), so frame selection is not available through it.
- `debugger_source` requires `scriptId` (not `url`) and rejects `endLine`; I fell back to reading the file with `sed`.
- `debugger_exceptions` takes `state`, not `mode`.
- `debugger_run` while paused answers `Use debugger_evaluate while paused`, and a `debugger_run` started before a pause stays `pending` until resume.
- `debugger_state` returns the full results of the last ~10 operations on every call, so a long probe run re-sends old outputs each time; keep run results short.
- `debugger_exceptions all` also pauses on caught exceptions raised by my own synthetic events (the setPointerCapture row), which is expected but needs `uncaught` before any longer run.

## Area 1 — pathological layouts (sanitize → TrackValidate.check)

`CustomTracks.sanitize(raw, {loose:true})` then `TrackValidate.check`:

| layout | sanitize | verdict |
|---|---|---|
| 40 pts on a line | kept | RED radius, clearance |
| figure-8 (48 pts) | kept | RED crossing, clearance |
| spiky star 900/250 m | null | refused |
| ring with one point pulled to the centre | kept | ok:true, AMBER radius |
| hairpin 12 m / 8 m apart | kept | RED radius, fold, clearance, start |
| 2 pts, 1000 pts, duplicates, start==end, all-same | null | refused |
| 9999 m coordinates | null | refused (perimeter cap) |
| 200 pts ring r=700 | kept | ok |

No NaN pause or throw in these. Validation behaves as documented.

## Area 2 — racing a custom design

Generated with `TrackRandom.generateValid(4242, …)`, upserted (162 pts, 4844 m, id `custom-a1d2f2d6`), `await __apex.race(id)` built and counted down.
Then `go()` and `step(1/60, 600)` x 60 (600 s of sim, 21 AI cars + an idle player): every `gapToLeaderS`, `intervalS` and `lap` stayed finite, nobody retired, all AI cars were on lap 4 (leader past the 3-lap target; the race stayed in `race` because the idle player had not finished). No NaN, no wall-stuck cars on this layout.

Operator mistake, not a defect: my first run used `step(60)`, which is `dt = 60 s`, so the race jumped to `results` at t = 1080 s with all laps 0. The same call on Monza gave the identical result. `step(dt, n)` takes seconds then a count.

Not covered: the seam class of #2545 (a corner straddling node 0) needs a hand-made layout with a corner at the start line; one random layout proves nothing about it. Left to a follow-up.

## Area 3 — share codes

- 20 random designs: 19 round-tripped with equal `canonical()` and id; #6 was refused by `sanitize` (random radius gave a loop under `loopMin`), which is correct.
- Truncation at every 1/32 of a code: magic/version/bounds/check, never a throw.
- 13 garbage inputs (empty, null, `{}`, 20 kB body, bad version, doubled code): a reason each, no throw.
- Every single-character flip of the body: 121 `check`, 2 `version`, none accepted.
- Name `"  é́😀日本語 "` x30 sanitizes to `MY CIRCUIT` (non-ASCII is stripped by design).
- `CustomTracks.sanitizeName({toString(){throw 1}})` throws. Not reachable from a share code or JSON (strings only); noted, no fix.

- `CustomTracks.preflightCollection` (async) on 12 hostile collections: null, string, number, `[]`, `{}`, `items: null`, `[null,1,"a",{}]` -> `format`/`invalid`; 500 items -> `full`; a `__proto__`/`constructor.prototype` item -> `invalid`, and `({}).pwn` stayed undefined; 5000 props, 100000 hwZones and a 1 MB name -> `ok` in 2-38 ms (all capped by sanitize). No throw.

## Area 4 — undo/redo, autosave, deletion, touch

- Undo/redo: randomise, reverse, rename -> 4 undos then 4 redos, state restored; after 120 further randomises the stack unwinds exactly 100 steps (`UNDO_CAP`), not unbounded.
- Delete the selected custom circuit while a race is up: `CustomTracks.remove(id)` returns ok/durable, the record is gone from storage, but `Tracks.LIST` still carries it until the next `sync()` (sync refuses inside a race by design) and `apex26.track` keeps the stale index 52. After a reload the list is 52 built-ins, the stored index resolves to 0 (`bahrain`), no throw. Self-healing, no fix.
- Autosave: edit + 2.5 s idle writes `apex26.customTrackDraft` ("MID EDIT"); after `location.reload()` `CustomTracks.draft()` returns it and `TrackDesigner.open()` restores it.
- Touch at 844x390: **not driven.** The debug Chrome's inner viewport was 844x198 and the designer's main canvas was not laid out (only the two 289x72 / 289x48 profile canvases measured). Synthetic two-finger pointer sequences on those produced no error and no edit. A real phone-landscape pass needs Playwright with touch emulation (`tests/specs` designer specs), which this lane did not run.

## Pauses triaged

Exceptions set to `all` during the undo/redo and touch probes; one pause:

| where | what | verdict |
|---|---|---|
| `js/editor/canvas.js` `onDown`, `canvas.setPointerCapture(ev.pointerId)` | NotFoundError for a synthetic `PointerEvent` | benign: already wrapped in try/catch with the comment "a synthetic event"; real pointers capture fine. Resumed, then exceptions set to `uncaught`. |

No uncaught exception in any area.

## Not run

- `npm run test:tooling-fast`: this PR changes one prose note, so the docs-only fast path applies (`tests/unit/docs-integrity.test.mjs`, green at commit).
- Editor browser specs from `pick-tests`: not run, nothing under `js/editor/` changed.
- Build-worker path for custom geometry: not attached (no worker target was exercised).

## Follow-ups worth an issue

- Seam probe for #2545 on a hand-made custom layout.
- Touch editing at 844x390 under Playwright.
- `sanitizeName` throws for a non-string whose `toString` throws; unreachable from JSON/share codes, so no change.
