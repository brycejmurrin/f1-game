# WGX / GLX CPU hunt, round 3 — 2026-10-17 (lane P4)

Follows `PERF-HUNT-WGX-GLX-ROUND2-2026-10-17.md`. Same census (Playwright, prototype-wrapped GPU/GL calls attributed by JS
caller stack, Monza, 320x180, car at 55 m/s via `jump(0.1, 55, 0)`, 25 warm-up frames). Counts only; SwiftShader time is not evidence.

## Landed as drafts (owners hold them)
| PR | change | per frame, Monza |
|---|---|---|
| #2691 | WGX shadow casts with an unchanged model reuse the bound ring slot | shadow `setBindGroup` 4.2 -> 2.4 |
| #2694 | WGX mirror mip ladder recorded into the mirror's own encoder/submit | `queue.submit`, `createCommandEncoder`, `finish` 4.4 -> 3.4 |
| #2697 | GLX per-pass sampler units 6-9 bound only when the texture object changes | `activeTexture` 50.7 -> 33.9, `bindTexture` 45.2 -> 36.8 |

## #2660 re-measured (the owner saw 7.3/frame on both trees)
A/B on the two parents of merge `fad18e77`: before `3292a9e1`, after `fad18e77`, each in its own git worktree served by the same
census script, three alternating runs per side, 30 frames each: `queue.writeBuffer` per frame
**before 64.7 / 64.1 / 64.2, after 22.3 / 22.4 / 22.1** (spread < 1; difference -42, far outside it). The `cullInstances`
instance-buffer uploads are 43 of the 64 on the "before" side (24 from the mirror pass, 19 from the main pass) and 0 after.
(The 81 -> 40 in the PR body was measured against an older base that also lacked other merged changes; the like-for-like
number is 64 -> 22.) The effect needs BOTH culls to fire every frame: a rear-view mirror pass that actually renders prop
batches plus the main pass, with a camera whose visible cell sets are stable across frames. A scene with the mirror off, or
one where `mirrorLite` skips the prop batches (the game sets it on the lower mirror rungs), shows only the main-pass culls
and little to save, which is consistent with 7.3/frame on both trees.

## REFUTED — do not retry
**Pooled post-chain render-pass descriptors** (#2688 item): sampling heap profile (`HeapProfiler.startSampling`, interval 512 B,
minor + major GC objects included) over 40 Monza frames on WGX: ~49 MB sampled = ~1.2 MB per frame, and no function under
`js/render/webgpu/` is in the top 40. The post chain's ~100 small descriptor objects per frame are lost in the noise next to
`updateCarLateral` (171 KB/frame), `updateCar` (103 KB/frame) and a `Math.max` call site (98 KB/frame) in the game loop
(issue #2650 now carries those numbers). A pooled descriptor would also make the mock harness's `recordPass` log alias.

## Still open (#2688)
GLX: decal constant state (`uTex`, `uGlow`, unit-5 bind, blendFunc pair per decal), particle frame uniforms re-sent for both
blend groups, `LampBake.liveOnlyAt` linear scan, closure in per-chunk `drawChunked`. WGX: drawDecal group-1 bind filter,
`drawChunked` redundant group-1 bind on the night-mask path.
