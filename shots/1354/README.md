# shots/1354
Visual sign-off for PR #1354 at head c3b9d8f40, TLX (three.js, WebGL2 pinned) on SwiftShader, montreal. Pixels are sign-off only; the assertions are in the PR's unit files.

- 1-tlx-boot-cockpit.png: the live TLX boot signal. A real presented frame (halo, wheel display, kerbs, props), tools/shot/shot.mjs park cam. gfx-probe --backend three: ok, gpuErrors 0.
- 2-chase.png: chase camera right after snapCam (not yet eased), car, kerb and props render.
- 3-lookback.png: look-back held (KeyB): Input.lookingBack() = true, camera faces back down the road behind the car. Proves the look-back view renders and is not a TV/director shot.
- 4-rain.png: rain at ~30 Hz staleness cap: streaks visible and wet-road sheen on the chase view.
- 5-garage.png: garage turntable (webgl2, tools/shot/garage-frame.mjs), exercising the garage wins/ctx caches path.

Not shown: a flyby frame. The flybyCam(0.35) hook returned shot "turn-first", finite eye, not inside any building, but the capture still showed the chase camera, so no flyby pixels are claimed.
Not run: TLX WebGPU leg (no Vulkan ICD in this container); gpu-census on macos-latest.
Ship tip fd9eb4a shows the same checkRetirements console fault and a byte-identical black gfx-probe canvas (17259 B), so neither is from this PR.
