# GLX output target

Task 30 of the Quest VR plan. GLX's final pass is an explicit output FBO +
viewport (`GLX.setOutputTarget` / `core.outputFBO()`), not a runtime wrap of
`bindFramebuffer` / `viewport`. Default (no override) is still the canvas
backbuffer at `(0,0,width,height)` — 2D behaviour unchanged. Class-(C) FBO
resets after texture setup stay `null` and are marked
`/* glx-default-fb: reset only */`. See `docs/ARCHITECTURE.md` (GLX internals)
and `tests/unit/glx-output-target.test.mjs`.
