---
name: webgl-debug
description: Use when the user reports a blank/dark/black GLX canvas, lights wrong, shadow acne, bloom too strong/missing (GPU path), HDR/hdrMode issues, WebGL/GLX errors, GL_INVALID_OPERATION, shader compile failures, uniform-array light bugs, instancing problems, or GLX renderer artifacts. Washed-out night or slider-flat scenes → lighting-tuner first. WebGPU black screen or NaN-white road → webgpu-debug. Temporal shimmer while driving → motion-capture.
paths: js/render/glx.js,js/render/glx/**,js/render/shaders/**
---

# Debug WebGL2 / GLX renderer issues

The renderer lives in `js/render/glx.js` (the `GLX` IIFE). It uses WebGL2 with
uniform-array point lights, a 2048² sun shadow map (+ 512² PCSS blocker map),
ACES tone-map, bloom, and lens flare. Most rendering bugs fall into a small set
of root causes — probe first, then read shader source.

Washed-out night or slider-flat scenes → **lighting-tuner**. WebGPU black /
NaN-white road → **webgpu-debug**. Temporal shimmer while driving →
**motion-capture**.

## Load on demand

- First probes (hdrMode, lightState, GL errors, 15-float light record) → [references/probes.md](references/probes.md).
- Common failure modes, Playwright probe pattern, apex-eval one-liners → [references/failures.md](references/failures.md).
