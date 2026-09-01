---
name: cross-backend-parity
description: Use when a rendering look/knob/feature already differs between WebGL2 (GLX), WebGPU (WGX), and three.js (TLX), or when auditing backend drift after a lighting/rendering change. Night-looks-wrong first stop is lighting-tuner; WGX validation defects → webgpu-debug.
---

# Keep GLX / WGX / TLX in parity — pointer

The reference is `docs/RENDERERS.md` (§Who does what, §Parity snapshot) and the
defect inventory `docs/research/WEBGPU-PARITY.md`. A GLX fix is not done until
it is mirrored — or recorded as a gap there — in the other two backends.

1. `node --test tests/unit/backend-surface-parity.test.mjs` first (façade members on all three).
2. Grep the knob across ALL of `js/render/` (GLSL `shaders/`, WGSL `webgpu/wgsl-*.js`, TSL `three/`, CPU plumbing).
3. WGX: `node tools/wgx-validate.mjs --static`; live Dawn is parent-session only → **webgpu-debug**.
4. Same-scene shots per backend: **playwright-probe** / `gfx-probe.mjs`; `__apex.diag({download:false}).env.backend` is what bound.
