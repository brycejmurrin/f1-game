# Local Mesa llvmpipe in the cloud container — 2026-10-26

Lane R5 of the system-audit implementation (PR #3785). Question: can this container type (Ubuntu 24.04,
no `/dev/dri`, Claude Code 2.1.310) run the browser suites on Mesa llvmpipe the way CI does, instead of
SwiftShader? Measured WITHOUT a browser; the one Chromium probe is left to the coordinator (command below).
Raw output: `scratch/sysaudit-research/` (`dpkg-before.txt`, `apt-update.txt`, `apt-install.txt`,
`glx-egl-after.txt`, the fetched ANGLE/Chromium sources).

## Verdict

**The premise "llvmpipe needs /dev/dri" is wrong; the missing piece was `libEGL.so.1`.** Mesa's GL
llvmpipe renders here on both GLX (under Xvfb) and EGL (surfaceless and device platforms, no X at all).
ANGLE's OpenGL backend on Linux opens the system EGL by name and the container shipped without it, so
every Chromium launch on 2026-09-16 fell back to SwiftShader
([CI-RENDERING-PERFORMANCE §llvmpipe](CI-RENDERING-PERFORMANCE.md)). After one `apt-get install` the
library is there; whether Chromium then binds llvmpipe is the one unproven step (probe below).

## What was installed, before and after

| | before (container as booted) | after `apt-get install` |
|---|---|---|
| Mesa | `libgl1-mesa-dri`, `libglx-mesa0`, `mesa-libgallium`, `libgbm1` 25.2.8 | same |
| EGL / GLES | **none** (`libEGL.so.1`, `libGLESv2.so.2` absent; only `libwayland-egl`) | `libegl1` 1.7.0, `libegl-mesa0` 25.2.8, `libgles2` 1.7.0 → `libEGL.so.1`, `libEGL_mesa.so.0`, `libGLESv2.so.2`, glvnd `50_mesa.json` |
| Vulkan | `libvulkan1` loader only, no ICD | `mesa-vulkan-drivers` → `lvp_icd.json` (lavapipe) |
| tools | `xvfb` 21.1.12 present; no `glxinfo`/`eglinfo` | `mesa-utils` 9.0.0 (`glxinfo`, `eglinfo`) |
| `/dev/dri` | absent | absent (unchanged) |

The install worked as root through the agent proxy: `apt-get update` fetched 33.8 MB in 2 s, then
`apt-get install -y --no-install-recommends mesa-utils libgl1-mesa-dri libegl1 libgles2 libegl-mesa0
mesa-vulkan-drivers xvfb` exited 0. No proxy or permission refusal.

After the install (no `/dev/dri`):

- `xvfb-run -a glxinfo -B` → `OpenGL renderer string: llvmpipe (LLVM 20.1.2, 256 bits)`, core 4.5,
  `OpenGL ES profile version string: OpenGL ES 3.2 Mesa 25.2.8`, `direct rendering: Yes`, `Accelerated: no`.
  Identical with `LIBGL_ALWAYS_SOFTWARE=1` (Mesa picks llvmpipe anyway without a DRM node).
- `eglinfo -B` with no `DISPLAY`: GBM, Wayland and X11 platforms fail `eglInitialize` (expected: no DRM
  node, no compositor, no X); **Surfaceless and Device platforms initialise** with
  `OpenGL ES profile renderer: llvmpipe (LLVM 20.1.2, 256 bits)`, ES 3.2.
- Before the install `glxinfo`/`eglinfo` did not exist; the Playwright research session (audit §13)
  measured GLX → llvmpipe under `xvfb-run` on the same image, so GLX was never the problem.

## Why Chromium fell back (source-cited mechanism)

1. Chromium's `--use-angle` values (`ui/gl/gl_switches.cc`): `gl`, `gl-egl`, `gles`, `gles-egl`, `vulkan`,
   `swiftshader`, `swiftshader-webgl`, `null`, … (`kANGLEImplementationOpenGLName = "gl"`,
   `kANGLEImplementationOpenGLEGLName = "gl-egl"`).
   https://chromium.googlesource.com/chromium/src/+/main/ui/gl/gl_switches.cc
2. Headless Chromium's ozone platform offers only EGL-ANGLE (`HeadlessSurfaceFactory::GetAllowedGLImplementations`
   → `kGLImplementationEGLANGLE`) on `EGL_DEFAULT_DISPLAY`.
   https://chromium.googlesource.com/chromium/src/+/main/ui/ozone/platform/headless/headless_surface_factory.cc
3. ANGLE, `EGL_PLATFORM_ANGLE_TYPE_OPENGL_ANGLE` on Linux: device type EGL, or a platform type of 0/GBM/
   Wayland/surfaceless → `rx::DisplayEGL`; only `EGL_PLATFORM_X11_EXT` takes GLX (`src/libANGLE/Display.cpp`).
   https://chromium.googlesource.com/angle/angle/+/main/src/libANGLE/Display.cpp
4. `DisplayEGL::getEGLPath()` returns `"libEGL.so.1"` and `FunctionsEGLDL` `dlopen`s it, failing with
   "Could not dlopen native EGL" when absent (`src/libANGLE/renderer/gl/egl/DisplayEGL.cpp`, `FunctionsEGLDL.cpp`).
   https://chromium.googlesource.com/angle/angle/+/main/src/libANGLE/renderer/gl/egl/DisplayEGL.cpp
5. CI's `.github/actions/mesa-xvfb` installs `libegl1 libgles2` — which is why the same flags bind llvmpipe
   on GitHub's runners (also without `/dev/dri`) and not here.

Mesa variables (https://docs.mesa3d.org/envvars.html): `LIBGL_ALWAYS_SOFTWARE` "if set to `true`, always use
software rendering"; `GALLIUM_DRIVER` chooses "`softpipe` or `llvmpipe`"; `LP_NUM_THREADS` "how many threads
to use for rendering". `EGL_PLATFORM` (https://docs.mesa3d.org/egl.html) names the native platform; unset,
Mesa uses the first built platform (x11 on Ubuntu), so with no `DISPLAY` a surfaceless/device display is what
ANGLE must ask for. An outside report (https://microlink.io/blog/webgl-without-a-gpu) got llvmpipe WebGL in
headless Chrome with `--use-angle=gl` + `LIBGL_ALWAYS_SOFTWARE=1` + an Xvfb display, ~4× faster than
SwiftShader on a heavy 3D page — the same recipe as ci.yml.

## Chromium probe for the coordinator (the one browser run)

Sequential, one Chromium at a time, each closed before the next; ~1 min; starts its own Xvfb on `:97`:

```sh
node scratch/sysaudit-research/bin/llvmpipe-probe.mjs
```

It prints one row per variant with the WebGL2 `UNMASKED_RENDERER_WEBGL` and the WebGPU adapter:
A = ci.yml's exact flags (`--use-angle=gl --use-gl=angle --ignore-gpu-blocklist`, `LIBGL_ALWAYS_SOFTWARE=1`,
`GALLIUM_DRIVER=llvmpipe`, Xvfb `DISPLAY`); B = same with no display; C = `--use-angle=gl-egl` +
`EGL_PLATFORM=surfaceless`, no display; D = `gl-egl` under Xvfb; E = ANGLE-Vulkan on lavapipe; Z = the
committed SwiftShader control. llvmpipe binds where the column reads `ANGLE (Mesa, llvmpipe …)`.

Single-command equivalent without the script (variant A, no Playwright):

```sh
xvfb-run -a -s "-screen 0 1280x800x24" env LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \
  "$(node tools/lib/chromium-path.mjs --path)" --headless=new --no-sandbox --use-gl=angle --use-angle=gl \
  --ignore-gpu-blocklist --virtual-time-budget=3000 --dump-dom \
  'data:text/html,<script>const g=document.createElement("canvas").getContext("webgl2");const e=g&&g.getExtension("WEBGL_debug_renderer_info");document.write(g?g.getParameter(e.UNMASKED_RENDERER_WEBGL):"no-webgl2")</script>' \
  | grep -oE 'ANGLE[^<]*|no-webgl2'
```

`tools/gfx/gpu-game-check.mjs` has no software-GL flag (`--backend`, `--path`, `--ls` only) and is the
real-GPU census tool; `tools/lib/browser-workers.mjs` is where `APEX_GPU=llvmpipe` is wired for capture tools.

## If the probe shows llvmpipe — follow-ups (other lanes' paths, not edited here)

- `tools/lib/browser-workers.mjs:51` throws "llvmpipe needs /dev/dri (CI only)" when `/dev/dri` is absent.
  Replace the `/dev/dri` test with a `libEGL.so.1` test (`ldconfig -p | grep -q 'libEGL.so.1 '`) or drop it.
- `playwright.config.js:53-56`, `.github/actions/mesa-xvfb/action.yml` ("Dead in the dev container (no
  /dev/dri …)"), AGENTS.md §Verification ("it needs `/dev/dri`, which this container lacks"), and
  `CI-RENDERING-PERFORMANCE.md` §llvmpipe state the wrong cause; correct them to "needs libegl1/libgles2".
- Then `APEX_GL=llvmpipe node tools/ci/test-bg.mjs <group>` locally; the CI numbers (smoke 8–12× faster,
  `mesa-xvfb` header) predict a group in minutes instead of 10–40.
- `LP_NUM_THREADS`: llvmpipe threads per renderer; with several Playwright workers set it to
  cores ÷ workers (browser-workers.mjs already does this for capture).

If the probe still shows SwiftShader for A–D, read Chromium's GPU log
(`--enable-logging=stderr --v=1` on one launch) for the ANGLE `DisplayEGL` error before trying anything else.

## Recipes

(a) Cloud environment setup script (claude.ai → environment → Setup script). Runs as root before Claude Code
starts; the environment cache snapshots the result so later sessions skip it
(https://code.claude.com/docs/en/cloud-environments#setup-scripts — "Scripts run as root on Ubuntu 24.04";
"keep the script's total runtime under roughly five minutes"; "if the script exits non-zero, the session fails
to start"):

```bash
#!/bin/bash
# Apex 26: Mesa llvmpipe + EGL/GLES + lavapipe + Xvfb for local software GL. Non-fatal by design.
export DEBIAN_FRONTEND=noninteractive
APT="-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o DPkg::Lock::Timeout=60"
{ timeout 120 apt-get update -qq $APT && timeout 240 apt-get install -y -qq --no-install-recommends $APT \
    mesa-utils libgl1-mesa-dri libegl1 libegl-mesa0 libgles2 mesa-vulkan-drivers xvfb ; } \
  || echo "apex setup: mesa install failed (non-fatal; tests fall back to SwiftShader)"
exit 0
```

A SessionStart-hook fallback for environments without this script: the same `apt-get` line, guarded by
`[ -e /usr/lib/x86_64-linux-gnu/libEGL.so.1 ] ||`, run in the background so it never delays boot
(https://code.claude.com/docs/en/cloud-environments#setup-scripts-vs-sessionstart-hooks).

(b) ci.yml's Mesa step (`.github/actions/mesa-xvfb/action.yml`): the package list already includes the
essential `libegl1 libgles2`. Two changes only: name `libegl-mesa0` explicitly (today it arrives only as a
`Depends` of `libegl1`), and add a fail-fast check after Xvfb starts, so a runner image that loses EGL fails in
the step instead of silently running a group on SwiftShader (the Playwright research's recommendation):

```yaml
        sudo timeout 300 apt-get install -y -qq --no-install-recommends $APT_OPTS \
          mesa-utils libgl1-mesa-dri libegl1 libegl-mesa0 libgles2 xvfb
        # …Xvfb :99 as today…
        DISPLAY=:99 glxinfo -B | grep -q 'llvmpipe' || { echo "::error::mesa-xvfb: GLX is not llvmpipe"; exit 1; }
        ldconfig -p | grep -q 'libEGL.so.1 ' || { echo "::error::mesa-xvfb: libEGL.so.1 missing (ANGLE GL falls back to SwiftShader)"; exit 1; }
```

The renderer check that matters is in the browser: the specs already log `WEBGL_debug_renderer_info`; when
`APEX_GL=llvmpipe` and it does not contain `llvmpipe`, fail the shard.

## Not verified here

- Chromium binding llvmpipe in this container (the probe above).
- Whether WebGPU (`navigator.gpu`) gets a lavapipe adapter through ANGLE-Vulkan here (probe variant E).
- Wall-time of a local group on llvmpipe; measure one spec before and after with `test-bg.mjs`.
- The packages installed in THIS container vanish with it; only the setup script makes them stick.

## Probe result (coordinator, 2026-10-26 06:25Z, this container, no /dev/dri, after `apt-get install libegl1 libgles2 mesa-vulkan-drivers xvfb`)

`node scratch/sysaudit-research/bin/llvmpipe-probe.mjs` — one headless Chromium per row, WebGL2 renderer string:

| row | flags | WebGL2 renderer | WebGPU | boot |
|---|---|---|---|---|
| A | CI-equivalent (`--use-gl=angle --use-angle=gl`, Xvfb DISPLAY) | ANGLE (Mesa, **llvmpipe** (LLVM 20.1.2 256 bits), OpenGL 4.5) | none | 1.7 s |
| B | angle=gl, no display | SwiftShader (fallback) | none | 0.6 s |
| C | angle=gl-egl, no display, EGL surfaceless | ANGLE (Mesa, **llvmpipe**, OpenGL ES 3.2) | none | 1.7 s |
| D | angle=gl-egl, Xvfb DISPLAY | ANGLE (Mesa, **llvmpipe**, OpenGL ES 3.2) | none | 1.7 s |
| E | angle=vulkan on lavapipe | ANGLE (Mesa, Vulkan 1.4.318 (**llvmpipe**)) | none | 0.6 s |
| Z | control: SwiftShader (repo default) | SwiftShader | none | 1.3 s |

**Verdict:** Chromium binds llvmpipe in this container type with no `/dev/dri` as soon as `libEGL.so.1` / `libGLESv2.so.2` are present (rows A, C, D, E). The repo's "llvmpipe needs /dev/dri" premise (AGENTS.md §Verification, tools/lib/browser-workers.mjs:51, playwright.config.js, the mesa-xvfb action header, CI-RENDERING-PERFORMANCE §llvmpipe) is wrong; the 2026-09-16 failure was the missing EGL library. Row C (surfaceless, no Xvfb) is the simplest local recipe. WebGPU stays unavailable headless on Linux in every row. Next: the environment setup script installs the four packages; `tools/lib/browser-workers.mjs` enables `APEX_GL=llvmpipe` when `libEGL.so.1` is present instead of when `/dev/dri` exists; then time one full group locally against the 30–45 min SwiftShader figure.
