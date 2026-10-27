# `apex26.tlxSkyCache512` on the phone tier: no measured win, stays default-off (2026-10-27)

Issue #2649. Evidence: Device Farm batch #3954 (iPhone 14, iOS 27.0, TLX WebGPU, monza night, helmet; session
e7248d2e-92b9-4ff9-8bdd-067e91251b11; full tables in `DEVICE-FARM-BATCH-3954-2026-10-27.md` on PR #3957).

| arm | fps | p95 ms | p99 ms |
|---|---|---|---|
| `tlxSkyCache512=1` | 59.7 | 17 | 20 |
| default arms | 59.6 | 17–18 | 24–26 |

Within noise at default scale: no fps win, and the flag changes the look, so it is **not** made default-on.

Not done: the frozen pixel diff. Software GL takes the fallback sky and never builds the cache, and device screenshots
are live frames (noise 5.6 B-vs-B, 6.0 B-vs-S), so a diff there cannot resolve a ≤1.9 LSB change. Only a hardware
frozen-frame diff or a pinned-scale arm could change the verdict; no further paid Device Farm run is approved.

Also closed here: the "iOS Safari stays RGBA16F" comment at `js/render/three/tlx-post.js` was stale (web3dsurvey
reports `EXT_color_buffer_float` on iOS; the runtime probe decides per device) and is reworded.

Still open from #2649, unmeasured: godray pair R11F (look change, alpha carries folded SSAO), depth-only shadow RT
(needs r187). The draw-order audit is a negative result (`TLX-DRAW-ORDER-AUDIT-2026-10-17.md`).
