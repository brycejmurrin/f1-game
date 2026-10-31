# PHONE TEST › GPU TEST: run it, read it (B·H10, 2026-10-21)

The project cannot time a phone's GPU anywhere else. The CI Mac is a paravirtual GPU
(`TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md` §2). BrowserStack automation needs credentials this environment
lacks (`RENDER-SETTINGS-TOOLING-RESEARCH-2026-10-21.md` §2). The one real GPU we can reach is the owner's
phone, so this is a one-tap run whose file answers the open questions without a GPU timer.

## Run it (on the phone)

1. Low Power Mode OFF, phone not hot, the game open in Safari (or the home-screen app).
2. Pause (❚❚) › SETTINGS… › DISPLAY › METRICS › PHONE TEST › **GPU TEST**.
3. Keep the screen on and the page in front. It races a dry Monza on the helmet camera by itself for about
   3 min (7 phases × 25 s), then pauses.
4. Tap **SHARE** and send the file. A backgrounded or locked page stops the run early. The file says so
   (`gpuTest.reason`).

It restores the render scale, auto-resolution and mirror mode it touched, however it ends.

## Read it

The file is the usual PHONE TEST record (`schema: apex26.phone-soak/1`, `facts`, `samples`) plus `gpuTest`:

| field | meaning | what to do with it |
|---|---|---|
| `facts.gl.EXT_disjoint_timer_query_webgl2`, `facts.webgpuTimestamp` | Whether this device exposes a GPU timer at all (WebGL2 / WebGPU) | If both are false, `gpuTest.gpuTimer.supported` is false and every `phases[].gpu` is null. That is expected on an iPhone. |
| `gpuTest.phases[]` | One row per phase: `id`, `scale` (render scale actually bound), `mirror`, `tier`, `frames`, `p50/p95/p99/max` (ms between frames), `fps`, `over50` (% of frames > 50 ms), `gpu` (timer ms when supported), `links`/`pipes` (shader programs / pipelines created during the 20 s measure) | |
| `gpuTest.fill` | Least-squares fit of frame p50 against scale² over the s50/s75/s100 phases: `msPerFullFrame` is what a full-resolution frame spends on pixels, `interceptMs` is everything else | slope ≥ ~5 ms means fill-bound, so RESOLUTION and post passes are the levers. Near 0 means not fill-bound (CPU, vertex, or present), so look at `samples[].spans` and the mirror row. |
| `gpuTest.mirrorMs` | `default.p50 − mirrorOff.p50` | What the rear mirror costs on this phone. Compare with the triangle counts in `LIVE-FRAME-H10-2026-10-20.md` (~65–75k tris on the lite rung). |
| `gpuTest.firstBoost` | The `boost` phase (2026-10-30): BOOST set on directly, without a tap, at the start of its measure window. This is the session's first deploy, because the soak never boosts. `deployed`, `firstMaxMs` (worst frame in the first `windowMs`), and `links` / `pipes` built in that window | `pipes` or `links` > 0, with `firstMaxMs` in the hundreds, means the race warm missed a boost-only draw: name it with `tools/archive/perf/ers-deploy-census.mjs`. A clean row while a real first BOOST tap still stalls means the cost sits on the touch or audio-unlock path, not the renderer (`TLX-WEBGPU-PERF-3-2026-10-30.md` §6). |
| `gpuTest.driftMs` | `again.p50 − default.p50` | Thermal or throttling drift across the 3 min. Above a few ms, the phase deltas are partly heat, so repeat on a cool phone. |
| `phases[].links` / `pipes` > 0 | The page built new programs mid-race (the first-draw hitch, `LIVE-FRAME-H10` rounds 2–7) | Non-zero on any phase after `default` means the race warm missed something on this device. |
| `phases[].p50` ≈ 16.7 / 33.3 | Quantised to the display (60 Hz) or to 30 Hz | A run pinned at 33.3 in every phase is Low Power Mode or a 30 Hz cap. Check `cadence.hz`. |

Ready-made reading, in order:

1. `facts.backendPick.api`: `webgl2` is the iPhone path (TLX on three's WebGL2), `webgpu` is Android.
2. `fill.msPerFullFrame` decides whether resolution matters on this phone.
3. `mirrorMs` decides whether the mirror cost matters.
4. Any `links`/`pipes` > 0 is a warm bug to file with the phase id.
5. `driftMs` tells you whether to trust 2–4.
