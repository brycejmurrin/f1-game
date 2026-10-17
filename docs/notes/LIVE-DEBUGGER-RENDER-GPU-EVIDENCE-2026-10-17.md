# Render evidence on a drawing runner, 2026-10-17

No player-facing change. This records the available real-GPU evidence for
#2572 and #1651 without changing a workflow, tool or runtime switch. Timing
numbers come only from GitHub's `macos-latest` Apple/Metal runner.

## Provenance

| item | revision |
|---|---|
| Race-entry attribution (slice 1, PR #571) | `d2375da1539c755761281a39410c3e1f5b7002dd` |
| Warm-gated flyby (slice 2, PR #575) | `e86df65a996ca2448308fff2c6eac114ca98d6dc` |
| Vegas after run | `38513041950`, ship `7f0a0c240` |
| Spa after run | `38507400652`, ship `a52e9108b` |

Grok Bot selected route B: use the historical Apple/Metal baseline as the
before arm and the latest existing instrumented ship run for each requested
circuit as the after arm. This is not a matched-revision A/B.

## Race-entry results

`raceEntry.longestBlockMs` is the contiguous column and
`raceEntry.blockMs` is total long-task time. Both selected runs reported
`anyHardware: true`, Apple adapters and successful workflow verdicts.

| circuit | backend | historical before: contiguous / total | ship after: contiguous / total | source |
|---|---|---:|---:|---|
| vegas | GLX / Metal | 2193 / 4856 ms | 1722 / 6931 ms | `PERF-OPTIONS-2026-09-16.md`; run `38513041950` |
| vegas | TLX / WebGPU / Metal | not available | 1134 / 7935 ms | run `38513041950` |
| spa | GLX / Metal | not available | 1326 / 5876 ms | run `38507400652` |
| spa | TLX / WebGPU / Metal | not available | 1486 / 8457 ms | run `38507400652` |

These single after samples do not demonstrate an improvement: vegas GLX's
longest block is lower while total blocking is higher, and no historical spa
arm exists. They do prove that the shipped instrumentation returned real-GPU
race-entry numbers on both requested circuits.

## TLX and GLX scenario matrix

| scenario | TLX | GLX |
|---|---|---|
| bahrain/monaco rebuild A/B ×3 | not run on real GPU | not run on real GPU |
| context loss during build and backend switch | not run on real GPU | not run on real GPU |
| quality shed/restore with mirror, shadow and post live | not run on real GPU | not run on real GPU |
| visibility/pageshow and 844×390 ↔ 390×844 | not run on real GPU | not run on real GPU |
| night floodlights, mirror and material-pack toggles | not run on real GPU | not run on real GPU |

## Gaps

- The historical before arm has no named spans. It predates
  `RaceEntryProfile`, so only vegas GLX's contiguous and total values survive;
  there is no historical spa before value.
- The selected after artifacts expose only `raceCall`, `trackReady` and
  `parked`; their revisions predate the detailed `raceEntrySpans` analyzer.
  Therefore no named-span before/after delta can be reported.
- No #2572 same-circuit rebuild, context-loss, visibility/pageshow, orientation,
  quality-tier or night-toggle sweep ran on a real-GPU runner. The existing
  workflow runs one race per backend and does not invoke that scenario sweep.
- The original live-debugger sweep remains functional evidence, but its TLX
  resource rows were headless or SwiftShader. Route B deliberately makes no
  workflow/tool/off-switch change, so those gaps remain for a follow-up harness
  owned by Bryce.
