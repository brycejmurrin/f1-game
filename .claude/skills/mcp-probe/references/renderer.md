# Renderer probe recipes

**Use when:** this recipe family is the narrowest match for the question.

**Verification:** record the exact command, target (local or deployed), and returned evidence.

**Writes/ownership:** read-only; the parent owns browser startup and serialized MCP use.

## Probing a specific renderer

`node tools/mcp/mcp-cli.mjs probe` is the shape a renderer question takes. One
command, one browser, no heredoc:

```sh
npx serve -l 3456 .          # the page must be on 127.0.0.1 (see the trap below)
node tools/mcp/mcp-cli.mjs probe --backend webgpu --wait 12000 --console 'WGX|error' \
  --eval 'return JSON.stringify({gpuErrors: WGX.gpuErrors ? WGX.gpuErrors() : "n/a"});'
node tools/mcp/mcp-cli.mjs probe --dry-run --backend three   # inspect the batch, no browser
```

Four traps, each of which has cost a run:

- **`navigator.gpu` needs a SECURE CONTEXT.** It is undefined on `about:blank`
  no matter which Chrome flags are set, and reads exactly like a missing flag —
  measured across four flag combinations before the origin turned out to be the
  variable. Probe `http://127.0.0.1`. (The flags are needed too: the wrapper now
  passes `--enable-unsafe-webgpu`, without which headless Chrome exposes no
  WebGPU at all and every WGX probe reports "No available adapters".)
- **Script globals are not `window` properties.** `js/*.js` files assign
  `const GLX = …` at top level, a lexical binding: `window.GLX` is `undefined`
  while bare `GLX` works. Same for `Assets`, `Tracks`, `TLX`, `WGX`.
- **The backend pick lives in `localStorage`, and each invocation gets a fresh
  profile** — so it must be written and then RELOADED inside one batch. `--backend`
  does that; setting it as a separate command probes the default and looks like
  the backend silently ignoring you.
- **`--backend three` pins three to WebGL2** (`apex26.tlxForceGL=1`, what
  `tests/specs/tlx-probes.spec.js` sets). `--tlx-auto` leaves the pin unset
  (THREE PATH: AUTO — WebGPU when `navigator.gpu` works). `--tlx-auto-gl`
  is AUTO after `apex26.tlxAutoGL=1` (three WebGL2, still TLX — not game
  GLX). `--tlx-webgpu` pins three's WebGPU path.

What a clean WGX boot looks like: no `WGX` console line at all,
`WGX.gpuErrors()` 0, and `sessionStorage["apex26.gfxBound"]` ABSENT — that key
is written only when WGX refuses and hands the frame back to GLX, so its
presence (`"webgl2"`) is the failure signal, not the success one.

**Those are all ABSENCE signals — pair them with one positive.** Nothing was
logged is also what a probe that never reached the renderer looks like, and
`__apex.info().backend` is the *pick* at menu state, not what bound. Drive a
race and ask the canvas:

```sh
node tools/mcp/mcp-cli.mjs probe --backend webgpu --wait 8000 \
  --eval 'await __apex.race("monza"); await __apex.go();
          await new Promise(r=>setTimeout(r,7000));
          return String(document.querySelector("canvas").getContext("webgl2") === null);'
```

`true` proves it: a canvas is bound to one context type for life, so once
WebGPU has claimed it, `getContext("webgl2")` can only return null. It also
means the meshes uploaded, the pipelines built and the post targets allocated —
each of the four 2026-08-17 blockers failed a different one of those stages, and
the earlier ones masked the later ones, so **expect to find them one boot at a
time** rather than in a single pass. Two of the four were format/feature
validation errors that a mock device cannot model at all
(`sampleCount` 2, and `rg11b10ufloat` as a render target without
`rg11b10ufloat-renderable`).

SwiftShader WebGPU is a **validation and lifecycle** oracle — shaders compile,
bind groups match, buffers upload. It is not a visual one. For **pixels**:

```sh
node tools/gfx/gfx-probe.mjs --backend webgpu --lite montreal  # visible #game (primary)
node tools/gfx/wgx-capture.mjs montreal --lite                 # readback oracle → frame.png
node tools/gfx/wgx-lavapipe-probe.mjs montreal --lite   # second Vulkan stack (Lavapipe)
node tools/gfx/gfx-probe.mjs --backend three --lite montreal   # TLX via WebGL2
```

Missing `/usr/share/vulkan/icd.d/lvp_icd.json` → install `mesa-vulkan-drivers`
(and persist the Cloud env snapshot — see `AGENTS.md` §Cursor Cloud).

---