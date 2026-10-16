# Live debugger hunt — cars, ghosts, field LOD (2026-10-16)

Lane: `cursor/live-debug-cars-9b4f`. Tool: js-debugger MCP on a SwiftShader headless Chrome (844x600). Software-browser
evidence only: no GPU, device or long-session claim follows.

## Findings

| id | area | verdict | where |
|---|---|---|---|
| C1 | ghost | FIXED | `Ghost.record` accepted a NaN/Infinity frame and `finishLap` stored it as the best lap: `at()` returned NaN, `GhostShare.fileExport` refused it ("invalid"). Now non-finite frames are dropped and `finishLap` runs `valid()`. Test: `tests/unit/ghost.test.mjs`. |

## Ghost share decode (live, `GhostShare.decode`)

Round trip of a 200-sample lap: ok. Rejected as `corrupt` (no throw): truncated by 10 chars and by half, garbage body,
empty, null, number, magic only, one flipped character (hash mismatch), `%`-bad URL fragment, 100 zero chars, 70 000-char
body, `{"v":1}`, `[]`, a `__proto__` body, a 5 000-deep nested string. A `#ghost=` URL decodes. A file export for another
circuit decodes with its own track and `hasGuest()` follows the circuit.

## Field LOD

(filled in below as the run completes)

## Still to cover

Car builds (team x preset x part swaps, renderer memory counters), input-ghost replay drift, reversed/shifted circuit ghost.
