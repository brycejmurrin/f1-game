# Live debugger — render lane (B·H26), 2026-10-21

Lane: phone TLX render cost and memory, plus the GLX flare depth gate.
Hunter session `claude:session_01GcdcsiDFCEGcgt4YfAa5yJ`, fleet B, wave 26.

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| R1 | `js/render/glx/post.js:536` (`flareMaybe`) | perf, low-med (GLX fallback only) | CODE-TRACED, fixed | The composite taps `texture(uDepth, uSunUV)` only when `uFlareStr > 0` and `uSunUV` is inside [0,1]^2 (`glsl-post.js` `sunVis`). `flareMaybe` asked only `sunDir.y > -0.02 && sunLight > 0.35`, so every daytime frame kept the scene depth (MSAA depth blit, or no `invalidateFramebuffer` on the direct phone path) even with the sun behind the camera. Same defect TLX fixed in #3431. Heading sweep at 844x390, 60 deg vertical fov: the old gate kept depth on 100 % of headings at every sun elevation; the new one on 28.6 % (elev 5-15 deg) and 0.3 % (30 deg). It is the only depth reader on a dry frame at PerfGov tier >= 2 with AO and god-rays off (`carReflect` is forced to 0 there). Fix: shared `PostCommon.flareTapsDepth(sun, flareMul)` (fround bound, same terms as the shader), GLX computes `sunScreen` once and reuses it for the uniforms. Pixel-identical by construction. Test: `tests/unit/tlx-hunt4b.test.mjs` B·H26-R1, 19/1 before, 20/0 after. |

Not GPU-measured: the saving is a full-res depth tile store on a tiled GPU, which software rendering cannot time; the claim is "a pass skipped, picture unchanged", not a frame-time number.
