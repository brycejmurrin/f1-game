---
name: cross-backend-parity
description: Use when a rendering look/knob/feature already differs between WebGL2 (GLX), WebGPU (WGX), and three.js (TLX), or when auditing backend drift after a lighting/rendering change. Night-looks-wrong first stop is lighting-tuner; WGX validation defects → webgpu-debug. After adding a knob, mirror it here.
---

# Keep GLX / WGX / TLX in parity

Three backends render the same game: GLX (`js/render/glx.js` + `shaders/`,
the shipped default), WGX (`js/render/webgpu/`, deferred opt-in), TLX
(`js/render/three/`, deferred opt-in). Drift between them is the project's
most persistent defect class (~53 parity commits in one 300-commit window;
`ff45ec90` shipped six knobs reading the wrong backend, `447e904b` five
parity defects found in one survey). A GLX fix is NOT done until it is
mirrored — or explicitly recorded as a gap — in the other two.

## The audit loop

1. **Surface parity is guard-asserted**: `node --test
   tests/unit/backend-surface-parity.test.mjs` — every Gfx façade member must
   exist on all three backends (or be a recorded gap). Run it FIRST after any
   façade change.
2. **The parity inventory** lives in `docs/research/WEBGPU-PARITY.md` — defect
   kinds are "API missing", "reduced shader", "plumbing" — read it before
   re-surveying from scratch.
3. **Knob mirroring**: a lighting/look knob has up to four homes — the GLSL in
   `js/render/shaders/*.js`, the WGSL in `js/render/webgpu/wgsl-chunks.js` /
   `wgsl-post.js`, the TSL in `js/render/three/`, and the CPU plumbing that
   uploads it. Grep the knob name across ALL of `js/render/` before calling a
   change complete; the shipped failure mode is a slider that works on one
   backend and silently does nothing on the others.
4. **WGX changes**: `node tools/wgx-validate.mjs --static` first (no browser).
   Full Dawn (`wgx-validate.mjs`, `--lite`, `--no-rg11b10`) is parent-session
   only — never a subagent. Defect classes: **webgpu-debug**.
5. **TLX sharp edges**: TSL values need `.toVar()` BEFORE conditional use;
   `ColorManagement.enabled = false` (the look is calibrated without sRGB
   re-encode); the backend loads via dynamic `import()` only at `TLX.create()`.

## Where the same thing lives three times (the drift hotspots)

| Concern | GLX | WGX | TLX |
|---|---|---|---|
| Lit material | `js/render/shaders/lit.js` | `wgsl-chunks.js` | `tsl-lit.js` |
| Post chain (bloom/godray/grade) | `js/render/glx/` passes | `wgsl-post.js` | three post nodes |
| Baked material pack | GLX texture array | WGX (per `asset-pack`) | TLX |
| Sky + sun | `sky.js` shader | sky pipelines in `wgx.js` | TLX sky |

When you fix a look on one backend, open the same concern's file on the other
two IN THE SAME SESSION. If the mirror is genuinely out of scope, record the
gap where the next session will find it (`docs/research/WEBGPU-PARITY.md`)
instead of leaving it implicit.

## Verification

- `tests/unit/backend-surface-parity.test.mjs` + `webgpu-lifecycle` +
  `gfx-backend-canary` (all in `test:tooling-fast`).
- Same-scene screenshots per backend via the `playwright-probe` skill
  (`apex26.gfxBackend` localStorage key switches; WGX pixels are blank
  in-container — use the deployed site or a real GPU for WGX visuals).
- `__apex.diag({download:false}).env.backend` is the truth of what bound.
