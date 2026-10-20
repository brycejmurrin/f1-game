# Timing-tile border quantization at a capped zoom

On body PR #3162 head `ff55f2036ab294fe6dcd9d7678ff7a38099671e9`, the existing
667×375 touch HUD independence case fails after the label line-height fix #3174.
Both HUD SIZE 100 and 200 publish a top zoom of 0.97, yet the TIME tile measures
95.53125 and 94.53125 CSS pixels respectively.

Temporary diagnostics inside the existing fixed-string measurement establish:

| HUD SIZE | Current zoom | TIME text width | Horizontal padding, each | Computed left border | Tile width |
| --- | --- | --- | --- | --- | --- |
| 100 | 0.9700000286 | 68.3125 | 13 | 2.06186 | 95.53125 |
| 200 | 0.9700000286 | 68.3125 | 13 | 1.03093 | 94.53125 |

The text is `8:88.888` in both measurements; font family, size and letter spacing
also match. Chromium has re-quantized the physical border through the canonical
and painted zoom passes. The painted border loses exactly one pixel. This is a
layout defect, rather than clock content or a tolerance problem.

Paint the accent with an inset shadow and reserve its former three-pixel width
with padding. Broadcast continues to use its own right dividers and zero stripe
allowance; compact density includes the allowance in its padding. The touch
and large-screen padding overrides reserve the same allowance. Forced colors
suppresses shadows and uses the existing unlayered system border, so it retains
its original padding without the allowance. Keep the existing monotonicity
assertion unchanged.

After the fix, the original 667×375 measurements are 96.4375 pixels at both
100% and 200%, with identical 68.3125-pixel text and a zero-width layout border.
All six focused browser cases pass without retries or skips: three phone sizes,
broadcast cockpit, broadcast heli and repeated-fit determinism. A separate DOM
fixture using the real styles and fonts compares standard, minimal and broadcast
at 667×375 and 1280×800, with forced colors on and off. All twelve before/after
comparisons preserve the tile width at zoom 1. These fixture comparisons are
layout evidence; they do not render the game or exercise the fit algorithm.

Reproduction: `node tools/ci/test-solo.mjs tests/specs/hud-layout.spec.js -g
'controls ignore HUD SIZE'`. Diagnostic instrumentation was removed after the
measurement. Local browser evidence uses software Chromium; no hardware-GPU or
iOS result is claimed. Raw logs and JUnit evidence remain in ignored `artifacts/`.

The final styles also pass 119 CSS/HUD/ratchet checks and a repeat of the unchanged
667×375 browser case after deduplicating the padding values. Existing size and
spacing ceilings are unchanged.

Use CI's Node 22 for local gating. This host's Node 24 defaults to a different
reporter for directly executed `node:test` files, which the debugger TAP summary
parser does not recognize. PID 1 is not a reaper here either. The unchanged
debugger/process-cleanup suites pass 18/18 under Node 22.23.3 with the installed
`docker-init -s` supervising the process tree. The initial host-runtime gate was
stopped after those failures and the CSS budget violations were found; it is not
a green gate. Raw logs distinguish that attempt from the corrected checks.
