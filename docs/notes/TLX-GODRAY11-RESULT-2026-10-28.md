# `apex26.tlxGodray11` — stays default-off (2026-10-28)

Issue #2649 remaining slice: godray pair RGBA16F → R11F_G11F_B10F (TLX parity with GLX `hdr3`).

## What ships

The knob already lives in `js/render/three/tlx-post.js` (`gr11Knob` / `ensureGR`): on WebGPU when
`rg11b10ufloat-renderable` is present, `apex26.tlxGodray11=1` builds the godray pair as rg11b10 **only on
unfolded frames** (no AO-in-alpha). A day frame with D7 fold (`apex26.tlxAoFold`, default on) keeps RGBA16F
because composite reads AO from `.a`. Night / AO-off rebuilds to rg11b10 and back when a fold arrives.

Counted oracle (unit): `post.state().formats.godray` and `post.state().godrayPairBytes` — half-res pair drops
from 8 B/px to 4 B/px per target (2 targets). See `tests/unit/tlx-hunt4b.test.mjs` (`godray11:`).

## A/B / floor

- Device Farm batch #3954 measured `tlxSkyCache512` for this issue, not a solo godray11 arm. The combined
  format-arm recipe in `TLX-WEBGPU-PASS-AUDIT-2026-10-27.md` never cleared a phone fill-bound floor for godray alone.
- `tools/perf/profile.mjs --base` on this box is SwiftShader: spans are not quoted as a GPU win (AGENTS.md).
  Floor-first interleaved run recorded under `artifacts/profiles/` for the session; deltas stay inside noise for
  main-thread rows that are not fill-bound.
- Look change (11/11/10 vs half-float RGB): frozen pixel diff needs a hardware renderer; not run here (same
  constraint as the sky-cache note).

## Verdict

**Not default-on.** Flag stays opt-in (`=1`). No further paid Device Farm run is approved for this slice.
Re-open only with a fill-bound phone arm (`--pin-scale 1`) that separates fps/p95 outside noise, or a hardware
frozen-frame diff that bounds banding.
