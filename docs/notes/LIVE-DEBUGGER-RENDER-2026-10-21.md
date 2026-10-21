# Live debugger — render lane (B·H26), 2026-10-21

Lane: phone TLX render cost and memory, plus the GLX flare depth gate.
Hunter session `claude:session_01GcdcsiDFCEGcgt4YfAa5yJ`, fleet B, wave 26.

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| R1 | `js/render/glx/post.js:536` (`flareMaybe`) | perf, low-med (GLX fallback only) | CODE-TRACED, fixed | The composite taps `texture(uDepth, uSunUV)` only when `uFlareStr > 0` and `uSunUV` is inside [0,1]^2 (`glsl-post.js` `sunVis`). `flareMaybe` asked only `sunDir.y > -0.02 && sunLight > 0.35`, so every daytime frame kept the scene depth (MSAA depth blit, or no `invalidateFramebuffer` on the direct phone path) even with the sun behind the camera. Same defect TLX fixed in #3431. Heading sweep at 844x390, 60 deg vertical fov: the old gate kept depth on 100 % of headings at every sun elevation; the new one on 28.6 % (elev 5-15 deg) and 0.3 % (30 deg). It is the only depth reader on a dry frame at PerfGov tier >= 2 with AO and god-rays off (`carReflect` is forced to 0 there). Fix: shared `PostCommon.flareTapsDepth(sun, flareMul)` (fround bound, same terms as the shader), GLX computes `sunScreen` once and reuses it for the uniforms. Pixel-identical by construction. Test: `tests/unit/tlx-hunt4b.test.mjs` B·H26-R1, 19/1 before, 20/0 after. |
| R2 | `js/render/three/tlx.js` `skyState()` | observability, low | CODE-TRACED, fixed | Angle 4 ("TLX phone tier has no clouds/stars") traced to the test box, not the phone: on software GL `softContent("sky")` (`softwareGL && !_forceHw.has("sky")`) arms `sky.fallbackNode`, a zenith-to-horizon gradient with no clouds, stars, moon, sun disc or city glow; GLX has no such swap. A real iPhone ("Apple GPU") does not match the software regex and draws `skyMatFull`. No mobile/tier/PerfGov/time-of-day gate skips clouds or stars on TLX (tsl-sky gates `cloud > 0.001 && up > 0.012`, `stars > 0.5 && up > 0.05` match GLX). `skyState().on` was true for both materials, so no probe could tell them apart: added `fallback`. Test: `gfx-backend-canary` B·H26-R2, 0/1 before, 1/0 after; the stale `softGpu()` comment beside the fallback canary corrected. Re-shoot TLX sky stills with `apex26.tlxForceHw=sky`, or read gpu-census `skyState`. |
| R2b | `docs/notes/PHONE-RENDERER-AB-2026-10-21.md:23,73-74` | docs, low | CODE-TRACED, not mine | The note probes `__tlx.memState().sky.cache`; `memState()` has no `sky` field (the hook is `skyState()`), and the cloud cache never decides whether clouds draw (off on software GL, per-pixel clouds still render). Reported to the orchestrator for that note's owner. |
| A4 | angle 4 | — | REFUTED (phone gap) / BY-DESIGN (software fallback) | See R2. |

Not GPU-measured: the saving is a full-res depth tile store on a tiled GPU, which software rendering cannot time; the claim is "a pass skipped, picture unchanged", not a frame-time number.
