# Live debugger hunt: track designer and custom circuits (2026-10-16)

Lane `cursor/live-debug-editor-5b2e`. Debug Chrome 844x390 over CDP, SwiftShader, driven through the js-debugger MCP.
Source SHA at start: deploy tip 43d845f3. Status: IN PROGRESS (skeleton; rows below are measured live).

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

Generated with `TrackRandom.generateValid`, upserted, `await __apex.race(id)` built (162 pts, 4844 m). Lap run: see below.

## Area 3 — share codes

- 20 random designs: 19 round-tripped with equal `canonical()` and id; #6 was refused by `sanitize` (random radius gave a loop under `loopMin`), which is correct.
- Truncation at every 1/32 of a code: magic/version/bounds/check, never a throw.
- 13 garbage inputs (empty, null, `{}`, 20 kB body, bad version, doubled code): a reason each, no throw.
- Every single-character flip of the body: 121 `check`, 2 `version`, none accepted.
- Name `"  é́😀日本語 "` x30 sanitizes to `MY CIRCUIT` (non-ASCII is stripped by design).
- `CustomTracks.sanitizeName({toString(){throw 1}})` throws. Not reachable from a share code or JSON (strings only); noted, no fix.

## Area 4 — undo/redo, autosave, deletion, touch

Pending.

## Pauses triaged

Pending.
