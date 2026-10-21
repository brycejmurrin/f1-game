# Phone renderer A/B: TLX vs GLX (B·H23, 2026-10-21)

Bryce, 2026-10-21 05:12Z: "Keep both but let's test and side by side first." The question is whether phones
should default to GLX (plain WebGL2) instead of TLX (three.js). This note holds the measurements. Switching the
default is a later PR, after Bryce decides.

Status: in progress. Stills, memory and frame times are being measured. Sections below fill in as each lands.

## Harness

`scratch/h23/ab.mjs` (force-added) emulates the owner's phone in Chromium: 844×390 landscape, DPR 3, touch,
an iPhone Safari user agent. So `GLX.isMobile` and `mobileTier` are true, the pointer is coarse and the
resolution defaults to LOW (0.5). TLX is pinned to three's WebGL2 path (`apex26.tlxForceGL=1`), which is the
iPhone path (`PHONE-GPU-TEST-2026-10-21.md`, `facts.backendPick.api`). It renders on SwiftShader. Pixels and
memory counts from this box are valid. Frame times are relative only: a software rasteriser is not a phone GPU.
