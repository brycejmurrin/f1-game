# TLX-WebGPU GPU cost per pass: what the macos-latest runner can and cannot measure (2026-10-20)

Lane B·H7 (Fleet B, wave 4: "perf hunters across the renderers"). Question: on
TLX (three r186 WebGPU) at the phone tier, which GPU passes cost the most, and
which can be made cheaper without changing a pixel? Starting fact from B·H6: TLX-WebGPU
runs ~18 fps in the census driven window with CPU p50 ~10 ms, so it looks GPU-bound
(census 39449331814).

Short answer: the only real-GPU runner the project can reach **cannot resolve
per-pass GPU cost**, and its TLX-WebGPU frame time **does not respond** to
resolution, the post chain or the shadow system. Finding a fill or shader cost
needs a real phone. Separately, the mobile tier **loses the WebGPU device**,
which looks like the more likely cause of "WebGPU feels laggy" (§3).

Evidence branch: `cursor/tlx-gpu-cost-h7m1` (census request leg `tlx-gpu-cost`,
`scratch/tlx-gpu-cost.mjs`, repro `scratch/h7-tex.mjs`). It is a measurement
branch and is not for merging.

## 1. The runner

- macos-latest's WebGPU adapter is `vendor: apple`, **Apple Paravirtual device**
  (`census-macos-latest.json`: WebGL renderer "ANGLE Metal Renderer: Apple
  Paravirtual device"). The feature list has **no `timestamp-query`**, so
  `__apex.gpuTimer()` is `{supported:false}` on the TLX-WebGPU leg and there is no
  per-pass GPU time.
- **`queue.onSubmittedWorkDone()` never resolved** in a live race with
  `gpuErrors 0` (8 s cap, every attempt; census 39475376136). Fence-based
  throughput timing does not work there either.
- What is left is frame pacing: freeze the sim, pin the clock and scale, hold the
  governor, toggle arms live and interleaved, and take the mean rAF interval with
  the game's own loop rendering.

## 2. Results (phonelike = 844x390 css x 1.5 = 1266x585 present, GRAPHICS MEDIUM, scale pinned 1)

Census 39479899011, monaco, chase, n=8 interleaved samples per arm (30 frames each):

| arm | frame ms | delta | passes / frame |
|---|---|---|---|
| base | 32.0 (CPU 2.6) | | 12.5 (= submits) |
| render scale 0.5 (1/4 pixels) | 32.0 | 0.0 | 12.5 |
| render scale 0.75 | 35.9 | +3.9 | 12.5 |
| bloom + SSAO/contact + godray off | 37.4 | +5.4 | 4.2 |
| bloom off | 35.6 | +3.7 | 7.3 |
| SSAO + contact off | 36.1 | +4.2 | 12.5 |
| godray off | 31.4 | -0.5 | 12.5 |
| PBR pack off (`matTex 0`) | 36.2 | +4.2 | 12.5 |

Census 39484606006 (one browser per row; boot-level arm `apex26.tlxShadowOff=1`):

| row | base | post off | scale 0.5 |
|---|---|---|---|
| chase | 42.7 | 38.4 | 38.3 |
| cockpit (mirror on, 20.7 passes) | 35.8 | 41.5 | 38.3 |
| chase, shadows off | 47.6 | 44.5 | 49.1 |
| cockpit, shadows off | 39.3 | 51.4 | 45.0 |

How to read these:

- One quarter of the pixels gives the same frame time, and dropping 8 of 12.5 passes
  (the whole post chain bar composite + FXAA) gains nothing. Neither does
  dropping the shadow system. Whole runs drift by ~10 ms (32 vs 43 ms base), and
  every arm sits inside that noise.
- CPU per frame is 2.6–5 ms, so the frame is waiting on something that is
  neither our JS nor our pixels. The 30 Hz quantization in rev 14 (32 ms = two
  60 Hz intervals) points at the paravirtual device's present / queue path.
  On the same runner every backend is slow (census 39449331814 driven window:
  TLX-WebGPU 18.3 fps, TLX-WebGL2 30.6, GLX 23.5, WGX 28.4).
- Consequence: the "GPU-bound" reading on this runner is not evidence that our
  fragment, fill or post cost limits a phone. A fill or shader fix cannot show a
  before/after there, so none was shipped on this evidence.

Pass inventory at 1266x585 MEDIUM (desktop-class Chrome, counted at
`beginRenderPass`): one 256² r8 + depth pass (a shadow caster map; the sun map did not redraw in the window); scene MRT rgba16f + r16f tag +
depth24plus (stored, sampled); godray march + one blur pair at half res
(rgba16f; SSAO folded into its alpha); bloom bright + 2 down + 2 up (rg11b10);
composite to rgba8; FXAA to the canvas. The cockpit adds a 211x60 rgba16f
mirror and its 7 mip/blur passes. One queue submit per pass.

## 3. Mobile tier loses the WebGPU device

With `apex26.forceMobileTier=1`, TLX-WebGPU's `renderer.onDeviceLost` fires
("A valid external Instance reference no longer exists", reason unknown) 20–40 s
into a race, and again ~20 s into the title menu after each reload. The handler
in `js/render/three/tlx.js` counts `apex26.ctxLostReloads` 1, 2, 3, and the third
loss pins the tab to three's WebGL2 path.

- Seen on the real Mac GPU (census 39468515776, every phone-tier row) and on
  local lavapipe (`H7_MOBILE=1 H7_VP=desk node scratch/h7-tex.mjs`).
- Mobile tier alone triggers it: desktop viewport + mobile tier loses the
  device; the phone viewport (844x390 @3x) without mobile tier stays up.
- Ruled out: the pass counter instrumentation (a counters-off arm fails the
  same way), `powerPreference: "low-power"`, and any page-side
  `WEBGL_lose_context.loseContext()` or `GPUDevice.destroy()` (both wrapped;
  neither was called). On the Mac, an `[Invalid Texture] ... CreateView`
  validation error at race start came first; lavapipe did not log one.
- Not yet bisected across the mobile-tier gates. Reported as INCIDENT on the
  fleet bus (f88da35).

Caveat: this is desktop Chromium told to take the mobile tier, not a handset.
It needs one real-phone reading (phone recorder, GOV panel `ctxLostReloads`)
before it is called a player defect.

## 4. Pixel-identical candidate, held

The canvas pass carries a depth24plus attachment that three r186 stores every
frame (`depthStoreOp` is `discard` only for multisampled targets that opt out),
although nothing drawn after FXAA reads it. At 1266x585 that is ~3 MB written per
frame, estimated well under 0.1 ms on a phone. It is not measurable on this
runner, and the fix needs either a vendor patch or toggling `renderer.depth`
around three's cached canvas descriptor. Held until a real-phone measurement
says the post chain matters.

## 5. Next

1. Bisect the mobile-tier device loss (§3). It is the cheapest lead on the
   owner's "laggy" report.
2. GPU cost per pass needs a handset: Bryce's phone with `?gfxdebug=1` / the
   phone recorder, A/B'ing `apex26.tlxShadowOff=1` and GRAPHICS LOW, is the
   only instrument that can rank fill against geometry for him.
3. Do not read census fps on this runner as GPU fill cost (§2).
