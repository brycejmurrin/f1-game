# Dev tooling scout: animation, phone GPU, render debugging — 2026-10-29

Bryce, 2026-10-29: "brainstorm and consider other tools we could use or install to help development with debugging
performance rendering emulating phone gpu runs anything", then "feel free to do as much web research as you want".
Written while another session animates the garage entry and exit in Blender. Two rows were measured in this container
(§1, §2). The rest is web research with its source, and each one says what it would need. Already in the repo and not
repeated here: Spector and webgl-lint (`GPU-CAPTURE-2026-10-19.md`), the three.js Inspector (`THREE-INSPECTOR-2026-10-16.md`),
`gpu-census.yml`, AWS Device Farm iPhones (`DEVICE-FARM-ANALYSIS-2026-10-24.md`), PHONE TEST › GPU TEST
(`PHONE-GPU-TEST-2026-10-21.md`), lavapipe WebGPU probes, the memory censuses (`MEMORY-TOOLING-RESEARCH-2026-10-21.md`),
`tools/shot/motion-capture.mjs` (recordVideo + ffmpeg frames), and `gltf-transform` + `gltf-validator` in package.json.

## 1. Blender without Blender: `pip install bpy` (measured)

`bpy` 5.2.3 (PyPI, 2026-10-22) is Blender as a Python module. It requires Python 3.13 exactly, and this container
has 3.13.17. The Linux x86-64 wheel is 403 MB (https://pypi.org/project/bpy/).

```sh
python3 -m venv <scratch>/bpyenv && <scratch>/bpyenv/bin/pip install bpy==5.2.3
<scratch>/bpyenv/bin/python tools/garage/author-crew-motion.py -- --output-dir artifacts/garage-blender-bpy
```

- Installs in one pip call, and `bpy.app.version_string` is `5.2.3 LTS`.
- The run takes 0.93 s wall and writes `garage-guide-actions.blend` plus `crew-motion.json` (25 samples).
- **The 25×7 samples are bit-identical to the committed `KEYS` in `js/garage/crew-motion.js`** (authored with
  Blender 4.3 per its header comment): max |Δ| = 0. The move to 5.2 does not change this script's output.

Consequence: an agent in a cloud container can re-run and verify Blender-authored motion without the desktop
Blender install or a display. That covers the garage entry/exit work. A CI job could regenerate and diff the `@blender-motion`
block, the same way `gen:check` diffs other generated output. Caveat: the wheel pins one Python minor per Blender
release, so a runner on another Python needs `uv python install 3.13` or similar.

## 2. WebGPU compatibility mode works in this container (measured)

Chrome 146 shipped `requestAdapter({ featureLevel: "compatibility" })`. It is WebGPU restricted to what
OpenGL ES 3.1 and D3D11 can do (https://developer.chrome.com/blog/new-in-webgpu-146). The harness Chromium
153.0.8010.12 on lavapipe (`WEBGPU_LAVAPE_CHROMIUM_ARGS`) returned:

| limit | core | compatibility |
|---|---|---|
| `maxTextureDimension2D` | 8192 | 4096 |
| `maxColorAttachments` | 8 | 4 |
| `maxStorageBuffersInVertexStage` | 8 | **0** |
| `maxComputeInvocationsPerWorkgroup` | 256 | 128 |
| `core-features-and-limits` | yes | no |

What it is and is not:
- **Not an iPhone emulator.** Apple GPUs run core WebGPU. Also, `wgx.js` and `tlx.js` call `requestDevice()`
  with no `requiredLimits`, so every device already gets the spec-default limits. A "clamp to iPhone limits" shim
  would therefore change nothing; the only per-device differences WGX requests are the optional features
  `timestamp-query` and `rg11b10ufloat-renderable`.
- **Is a cheap gate for older Android and GLES-class devices.** Boot TLX WebGPU or WGX under compatibility on lavapipe,
  and any validation error (for example a storage buffer read in a vertex shader) names what would fail there.
  The cost is one probe flag, `featureLevel`, in the boot path of `gfx-probe.mjs`.

## 3. Real mobile GPU counters (web research, needs hardware)

| route | what it gives | needs | source |
|---|---|---|---|
| Quest Browser + `ovrgpuprofiler` | real tile-based (Adreno) GPU render-stage traces and realtime counters for a web page; `adb shell ovrgpuprofiler -e`, load the page, `adb shell ovrgpuprofiler -t` | a Quest over adb (Remote Control computer); the doc's flow says "enter VR", so a 2D page is unverified | https://developers.meta.com/horizon/documentation/web/webxr-perf-tools/ |
| `meta-vr` MCP (`perf_trace_capture`, `perf_trace_gpu_counters`) | Perfetto on Quest from an agent | same device; one forum report says GPU counters needed a factory reset | https://developers.meta.com/horizon/documentation/native/android/ts-perfettoguide/ |
| Android GPU Inspector (AGI) | Mali / Adreno / PowerVR counters | an Android phone, Bryce-side | https://developer.android.com/agi/sys-trace/counters |
| Samsung Sokatoa (2026-03) | multi-frame, vendor-neutral Android GPU profiler (Xclipse, Adreno, Mali); open source "later in 2026" | an Android phone | https://www.androidauthority.com/samsung-sokatoa-multi-frame-gpu-profiler-3648819 |
| Safari Web Inspector from Linux/Windows | timelines on Bryce's actual iPhone (THREE PATH: WEBGPU) without a Mac | `ios-webkit-debug-proxy` + usbmuxd, or the ios-safari-remote-debug-kit WebKit frontend | https://github.com/google/ios-webkit-debug-proxy , https://github.com/HimbeersaftLP/ios-safari-remote-debug-kit |
| iOS Simulator Safari on `macos-latest` | iOS WebKit + Metal shader/validation path (correctness only; host GPU timings) | an Xcode job; WebGPU in the simulator is unverified (Dawn notes the simulator advertises a reduced Metal family) | https://dawn.googlesource.com/dawn/+/2a49ad12f8a9bf7451cb71983647d662fbe70224 |

## 4. CPU side: calibrated throttling

Chrome DevTools (134+) calibrates "low-tier mobile" and "mid-tier mobile" CPU presets to the host machine. They model
main-thread JS and layout only, not the GPU, memory or thermal behaviour, and Chrome found visually complex pages ran
2× slower on real phones than under simulation (https://developer.chrome.com/blog/devtools-grounded-real-world). Useful
for the sim tick (`SIM-TICK-PROFILE-2026-10-29.md`) and garage CPU work; never a GPU verdict.

## 5. Looked at and parked

| tool | why parked | source |
|---|---|---|
| RenderDoc on Chrome | the published WebGL and WebGPU capture guides are Windows (D3D11 / D3D12) only; ANGLE's tips say Linux has "no supported workaround" | https://edw.is/renderdoc-webgl/ , https://toji.dev/webgpu-profiling/renderdoc , https://chromium.googlesource.com/angle/angle/+/HEAD/doc/DebuggingTips.md |
| WebGPU Inspector extension (Brendan Duncan, Chrome 1.0.1, 2026-03-03) | full frame capture (commands, buffers, textures); a human desktop tool, which overlaps the WGX labels + Spector for agents | https://chromewebstore.google.com/detail/holcbbnljhkpkjkhgkagjkhhpeochfal |
| Mesa `GALLIUM_HUD` counters on llvmpipe CI | no file output (Mesa bug 99125 asks for it); llvmpipe's primitives-generated query has D3D semantics | https://gitlab.freedesktop.org/mesa/mesa/-/issues/2168 |
| GitHub Linux GPU runner (T4, 4 core) | real GPU timings at $0.052–0.07/min (sources disagree), larger runners never use included minutes; self-hosted g4dn ~$0.009/min | https://docs.github.com/en/actions/concepts/runners/larger-runners , https://runs-on.com/runners/gpu |
| Theatre.js | keyframe sequence editor for three.js; 0.7 line, ESM + a build-step-shaped studio; only if garage camera timing keeps being retuned by hand | https://www.theatrejs.com/docs/0.5/getting-started/with-three-js |
| Tweakpane 4 | ESM-only since v4 (vendored `import`, not an IIFE global); a dev-only timing panel for garage easing | https://tweakpane.github.io/docs/migration/v4 |
| Replay.io | time-travel recording of a browser session, now with an MCP for agents; licence and pricing not checked | https://blog.replay.io/how-replay-works |

## Next steps, ranked

1. Document `pip install bpy` as the container route in the garage Blender script's header, and optionally add a CI
   diff of the `@blender-motion` block (§1).
2. A `--compat` flag on `tools/gfx/gfx-probe.mjs` that boots WebGPU with `featureLevel: "compatibility"` and reports
   validation errors (§2).
3. If a Quest is reachable: one `ovrgpuprofiler -t` trace of a race, the first real tile-GPU numbers this project has
   (§3).
4. For Bryce's iPhone: `ios-webkit-debug-proxy` from a Windows or Linux machine, for Safari timelines on the path he
   plays (§3).
