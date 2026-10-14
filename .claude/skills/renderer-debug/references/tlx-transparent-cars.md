# Transparent / see-through cars (TLX)

Cause: the lit fragment writes the SSR car-paint tag (0.35) into ALPHA
(`ctx.ssrTag` in `js/render/three/tsl-lit.js`). three's WebGL backend
(`WebGLBackend.init()`) hardcodes `alpha: true` and ignores `alpha:false`, so an
alpha-composited canvas shows the page through the cars. GLX cannot hit this: it
asks for `alpha: false`. Comments in `js/render/three/tlx.js` (search "see-through")
and `tests/unit/gfx-backend-canary.test.mjs` explain the opaque-canvas gate.

Probe (browser, parent session only; pin the backend):
`node tools/shot/apex-eval.mjs <track> '__apex.diag({download:false}).env.backend' --backend three`
then read the canvas context attributes (`getContext("webgl2").getContextAttributes().alpha`
must be `false`).

Guards: `tests/unit/gfx-backend-canary.test.mjs`; live
`tests/specs/tlx-probes.spec.js` ("the canvas is OPAQUE").

After a WGX failure on Mac/iPhone the pick may land on TLX-on-WebGL2, not GLX:
re-read `env.backend` before choosing a section.
