# Render / GPU perf hunt on the phone, 2026-10-17 (Hunter A)

Lane: render and GPU cost on Bryce's iPhone 15 (landscape 852x393, DPR 3). CPU, game loop, physics, boot and memory
leaks are Hunter B's. Software SwiftShader here is not a player's GPU; every GPU number below comes from
`gpu-census.yml` on `macos-latest` (Apple GPU under Metal through ANGLE, Chrome), the one real GPU this fleet reaches,
and is still a Mac, not an iPhone.

## Prior art (do not redo)
Today's notes already cover the counted side: `PASS-CENSUS-2026-10-17.md` (draws/triangles per pass),
`GPU-MEM-CENSUS-2026-10-17.md` (~57 MB GPU-resident on the phone tier), `RES-SCALE-FIXED-TARGETS-2026-10-17.md` (#2655,
FINAL), `THERMAL-GOVERNOR-2652.md` (#2652, shipped default off), `PERF-HUNT-TLX-2026-10-17*.md` (dust merge, merge
factor 3, two dry rounds). Open render-perf issues: #2649 (tile-bandwidth trims), #2657 (mirror / distant index LOD),
#2654 (three-way iPhone A/B), #2656 (render-object diet), #1633 (phone soak).

## Finding 1 — the iPhone's render path had no GPU timer (fixed, PR below)
TLX's `gpuTimer` was gated to three's WebGPU backend (`_gpuSupported` in `js/render/three/tlx.js`), so three on WebGL2,
the path the iPhone runs, reported `supported:false` everywhere, including on real hardware. Census run 39042826810
(macos-latest, montreal, helmet, desktop tier): the GLX leg timed `gpuFrame.medianMs` 12.68 (main+post), the TLX
WebGL2 leg `gpuTimerStart.supported:false` and no `gpuFrame`.

three r186's WebGL backend already times every outermost `render()` with `EXT_disjoint_timer_query_webgl2`
(`WebGLTimestampQueryPool`: a nested render while a query is active is skipped, not double-counted) and maps the
extension to the `timestamp-query` feature, so the fix is the gate. SwiftShader exposes the extension too (measured in
this container: `getExtension("EXT_disjoint_timer_query_webgl2")` is non-null), so the gate also requires
`!softwareGL`, which keeps the `tlx-probes` M9 spec's `{supported:false}` on CI. iOS Safari does not expose the
extension, so a player's phone is unaffected either way; the timer is opt-in (`__apex.gpuTimer(true)`).

## Ranked leads (survey, before building)
| # | lead | why it ranks | status |
|---|---|---|---|
| 1 | TLX WebGL2 GPU timer | every GPU claim on the iPhone path needs it | fixed (this note's PR) |
| 2 | phone-tier census on Apple GPU (`ls apex26.forceMobileTier=1`) | first GPU ms for the phone tier's pipeline | next |
| 3 | mirror pass on the phone tier: 133k road triangles into ~5.4k px, plus a mip rebuild per frame | 73 % of the main pass's triangles | needs 1+2 |
| 4 | #2649 tile-bandwidth trims (sky cache 512, godray R11F, FB invalidate) | blocked on a GPU timer | needs 1+2 |
| 5 | per-pass GPU split (three keeps a timestamp per render()) | names the costliest pass | open |

## Not measurable here
Anything about the phone's own GPU time, thermals, ProMotion cadence or the iOS memory budget. The Mac census is an
Apple GPU with a different tile memory, bandwidth and clocks; a Mac win is a direction, a phone soak (#1633) is the
verdict.
