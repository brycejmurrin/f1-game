# WGX / GLX CPU hunt, round 2 — 2026-10-17 (lane P4)

Companion to `PERF-HUNT-WGX-GLX-2026-10-17.md` (on PR #2660's branch). Same instrument: a Playwright census that wraps
`GPUQueue/GPURenderPassEncoder/GPUDevice` (WGX) or `WebGL2RenderingContext` (GLX) prototypes and attributes each call to its
JS caller stack; Monza (Vegas for night), 320x180, 20 frames after a 25-frame warm-up. Counts only — SwiftShader time is not
evidence. Two read-only `code-hunter` subagents (WGX: 10 rows, GLX: 11 rows) supplied the candidates.

## Landed as draft PRs
| PR | change | per frame, Monza |
|---|---|---|
| #2660 | WGX mirror pass gets its own instance pack/buffer/cell-set key | writeBuffer 81 -> 40 |
| #2675 | WGX skips post-UBO writes whose bytes are unchanged | writeBuffer 81 -> 65 |
| #2682 | GLX material-uniform caches survive begin(), stored in a Float64Array | uniform1f 178 -> 162 |

## REFUTED by measurement — do not retry
**GLX lazy global light-set restore** (hunter GLX F1: begin() uploads the 48-lamp set, terrain's per-chunk upload overwrites it,
each per-chunk drawChunked re-uploads it on exit). Implemented (begin/restore mark the set stale, `litMaterial` flushes it on the
first draw not on the per-chunk path; unit tests fail on base) and measured at night on Vegas, GLX, before/after:
`uniform4fv` 112.4 -> 111.0 per frame (-1.5, ~1.3 %), `uniform1i` 156.6 -> 155.6, draw counts equal. Single runs, so inside any
plausible noise floor, and `litMaterial` is called BEFORE the per-chunk upload so each chunked mesh still needs an `ownLights`
bypass. The saving does not pay for the new stale-flag state machine across glx.js/chunked.js; the change was dropped.
Why the estimate was wrong: the per-chunk path already re-uploads only when the chunk's light LIST changes (`_sameList`), so
begin()'s set is overwritten rarely enough that few full-set uploads are wasted.

## Still open (not taken), from the hunter reports
WGX: shadow model bind dedupe (wgx-shadow.js `_shadowSetModel`), fold the mirror mip ladder into the mirror's encoder (one
submit + one createCommandEncoder less per mirror frame), pooled render-pass descriptors in the post chain (~100 short-lived
objects per frame), drawDecal group-1 bind filter, drawChunked redundant group-1 bind on the night mask path.
GLX: per-unit texture-bind cache across begin() (~16 calls per begin), decal constant state (~7 calls per decal), particle
frame uniforms, `LampBake.liveOnlyAt` linear scan per lamp per upload, closure in per-chunk drawChunked, shadow `uInstanced`
alternation, ctxGone() isContextLost per draw.
Noted but out of lane: HUD layout (`shownLayer` 205 ms + `getBoundingClientRect` 83 ms over 40 frames) dominates main-thread
JS in the CPU profile; the WGX renderer itself is ~1 % of it (`cullInstances` 21 ms, `writeBuffer` 19 ms).
