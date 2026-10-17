# three's WebGL fallback never freed GL programs, shaders or VAOs (#2651), 2026-10-17

Tool: `node tools/gfx/gl-object-census.mjs --cycles 3` (wraps `WebGL2RenderingContext.prototype.create*/delete*`,
picker mode, monza → monaco → spa × 3, forced `apex26.tlxForceGL=1`, i.e. three's WebGL2 backend, the iPhone path;
every row reports `webgl2Backend: true`). SwiftShader here; counts, never timing. The Metal CI leg runs three's
*WebGPU* backend (session 01UQC1Jf, PR #2637), so this fix does not touch that heap step.

## Before (pristine vendor 0.186.1, patches 1–14)
`deleted` = 0 for VertexArray, Program and Shader at every one of the 9 visits. Live objects:

| kind | after visit 1 | after visit 9 | per 3-circuit cycle |
|---|---|---|---|
| VertexArray | 58 | 446 | +149 |
| Program | 22 | 55 | +12 |
| Shader | 43 | 109 | +24 |

Buffers and textures are freed. (Buffer `live` reads negative from cycle 3: deleteBuffer is called more times than
createBuffer, i.e. some buffers are deleted twice. Not investigated here; it is a count, not a leak.)

## After (patch 15)
Programs and shaders flat for all 9 visits (22 / 43 live). VAOs flat per circuit within ±1:
monaco 41 / 41 / 41, spa 52 / 56 / 56, monza 58 / 59 / 60 (cycle 2→3 growth: 1, 0, 0 against 149 before).
A residual +1 on monza per cycle was not chased; the first draft of the patch (without the `setGeometry` release)
drifted +8 per cycle, which is what found the missing release.

## Fix
`vendor/three-0.186.1/PATCHES.md` §15: backport of three #34601 (program/shader/pipeline deletion) and a reduced #34610
(VAOs keep their attribute-id key, plus a reference count released on render-object dispose, geometry dispose and
`setGeometry`; compute VAOs are pinned). Retire at the r187 bump (not published; npm latest is 0.186.1).

## Not established
Whether an undeleted VAO kept its buffers alive in ANGLE-Metal (the hypothesis in PERF-RESEARCH-2026-10-17 §2.4) — this
container cannot test it; read Safari's Memory timeline across 5 switches on a phone.
