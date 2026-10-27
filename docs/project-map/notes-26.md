# Notes batch 26 — performance evidence and corrections

Fully read all assigned 100,000 source bytes in individually returned, untruncated source reads of at most 9,824 bytes. Ranges are half-open. Current AGENTS.md was read. Notes are historical provenance, never command authority; no note commands, runtime, network, browser, tests, source edits or commits were performed.

## Topics, producers, backlinks and use

### [CPU hunt tail](../notes/PERF-HUNT-CPU-2026-10-17.md)

Date: 2026-10-17. Producer: CPU/HUD hunter (unnamed in assigned tail).

Scoped root selectors and real-hardware shownLayer/geometry-read cost; hardware census 39042826810 ties memo invalidation to root style changes.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [PERF-HUNT-CPU-2026-10-17.md](../notes/PERF-HUNT-CPU-2026-10-17.md).

Limits: Blink style evidence does not establish WebKit, phone GC/thermal or real-GPU frame timing.

### [TLX draw-call census](../notes/PERF-HUNT-TLX-2026-10-17.md)

Date: 2026-10-17. Producer: TLX hunter; branches cursor/tlx-chunk-dust-merge-4f7a and cursor/tlx-perf-r2-9b3e.

Dust merging and factor 2→3 reduce exact draw counts and stubbed render JS; records pixel comparisons, circuits and off-switches.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [TLX-PERF-HUNT-5-2026-10-16.md](../notes/TLX-PERF-HUNT-5-2026-10-16.md).

Limits: Stubbed shader links remove GPU work; hardware and backend gates explicitly not run.

### [iPhone audit](../notes/PERF-IPHONE-AUDIT-2026-10-21.md)

Date: 2026-10-21. Producer: External browser/local audit plus code/capability researcher (unnamed).

Software-GL freeze, governor ladder discriminator, phone allocation/thermal path, BrowserStack web profiling limits and ranked follow-ups.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [PHONE-GPU-TEST-2026-10-21.md](../notes/PHONE-GPU-TEST-2026-10-21.md).

Limits: Software freezes are not iPhone measurements; historical WebGL2 default is superseded by later known-wins reconciliation.

### [Known wins reconciliation](../notes/PERF-KNOWN-WINS-2026-10-23.md)

Date: 2026-10-23. Producer: A·X1 for OrchA 28.

Ranks sixteen leads, reconciles merged fixes against 95f836e9 and Device Farm ledger; distinguishes cold entry, menu warm, fallback visor issue and default-off levers.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [DEVICE-FARM-LEDGER-2026-10-23.md](../notes/DEVICE-FARM-LEDGER-2026-10-23.md).

Limits: Read-only reconciliation; old device/build numbers are not isolated current A/B evidence. Issue closure does not establish enabled defaults.

### [Performance options](../notes/PERF-OPTIONS-2026-09-16.md)

Date: 2026-09-16. Producer: Research/measurement author unnamed.

Race-entry attribution evolves from build/yield candidates to first-frame work; bottom-face cull is reverted at 0.27%; per-object occlusion claims are superseded by slower measured result and batched alternatives.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [MULTITHREADING-PLAN-2026-09-16.md](../notes/MULTITHREADING-PLAN-2026-09-16.md).

Limits: Read through final corrections: early positive occlusion conclusions are superseded. Historical Apple/Metal runs do not establish phone gains.

### [P1 build/shared/GLX fleet](../notes/PERF-P1-2026-10-18.md)

Date: 2026-10-18. Producer: Perf worker P1.

Grid-backed hintless projection and typed two-pass chunk bins; documents equivalence, memory wins and rejected VM/CSR micro-optimizations.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [PERF-FINDINGS.md](../notes/PERF-FINDINGS.md).

Limits: SwiftShader switch timing and loaded-box totals are limited; plain realm differs from verify VM. Open GLX lighting/copy leads need corroboration.

### [P2 main-thread fleet](../notes/PERF-P2-2026-10-18.md)

Date: 2026-10-18. Producer: Perf worker P2.

Scoped dialog selectors, emptiness-triggered root invalidation, hText character-data fix, remaining fit churn and corrected async-wait diagnosis.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [PERF-P2-HTEXT-2026-10-18.md](../notes/PERF-P2-HTEXT-2026-10-18.md).

Limits: Blink relative costs are not phone milliseconds; several pairs were contaminated by concurrent work.

### [HUD text invalidation](../notes/PERF-P2-HTEXT-2026-10-18.md)

Date: 2026-10-18. Producer: Perf worker P2.

Explains textContent child-list mutation versus firstChild.data; records CSSOM bisect, A/B and accessibility/smoke-test producer.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [PERF-P2-2026-10-18.md](../notes/PERF-P2-2026-10-18.md).

Limits: Headless-render trace measures style/JS mechanism, not GPU or phone FPS improvement.

### [Render CPU and flyby index](../notes/PERF-RENDER-CPU-2026-10-20.md)

Date: 2026-10-20. Producer: Fleet B·H9 for OrchB 24.

Extracted cell-walk helpers eliminate Chromium OSR exits with equal structure digests; real-GPU census ranks render JS and rejects tiny culling lead.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [PERF-SCENE-CPU-2026-10-20.md](../notes/PERF-SCENE-CPU-2026-10-20.md).

Limits: Node 22 does not reproduce Chromium OSR behavior; Mac GPU rankings do not prove phone cost.

### [Ranked performance research (opening part)](../notes/PERF-RESEARCH-2026-10-17.md)

Date: 2026-10-17. Producer: Docs research lane with delegated public-web readers; Bryce scope via orchestrator.

Prior-art inventory and top-ten phone plan; phone measurement first, bandwidth trims, allocation/GC caveats and opening WebGL disposal defect analysis.

Use: find measurement methods, rejected approaches and historical decisions before investigating this area. Backlink/context: [MEASURING-GPU-PERF-2026-09-16.md](../notes/MEASURING-GPU-PERF-2026-09-16.md).

Limits: Assigned part ends mid disposal discussion; remaining sections are outside batch. Forecasts, compatibility and upstream release claims are dated; no browser/GPU run.

## Coverage and SHA-256

Whole-file hashes identify source identity; assigned-part and chunk hashes identify only the bytes read. Full-file identity does not imply full-file reading for the CPU tail or research opening.

### docs/notes/PERF-HUNT-CPU-2026-10-17.md

Whole file: 7682 bytes; SHA-256 `d09df00caacd93ae43ebdb3b3404a83cb388b9d0ab2c15b1ad574f2f41cea53b`.
Assigned part [6553, 7682): SHA-256 `4ff774a485e4dd553fe5a87576443bb1f1707a97307666a8a8d50c6d7005610e`.

| Read chunk | SHA-256 |
|---|---|
| [6553, 7682) | `4ff774a485e4dd553fe5a87576443bb1f1707a97307666a8a8d50c6d7005610e` |

### docs/notes/PERF-HUNT-TLX-2026-10-17.md

Whole file: 6182 bytes; SHA-256 `897c7912fa882b427e48789fdf1956789ef31ce10c1ecb500d3abed5f5c0b51b`.
Assigned part [0, 6182): SHA-256 `897c7912fa882b427e48789fdf1956789ef31ce10c1ecb500d3abed5f5c0b51b`.

| Read chunk | SHA-256 |
|---|---|
| [0, 6182) | `897c7912fa882b427e48789fdf1956789ef31ce10c1ecb500d3abed5f5c0b51b` |

### docs/notes/PERF-IPHONE-AUDIT-2026-10-21.md

Whole file: 11640 bytes; SHA-256 `5d80d1c850db28cbdfabd808c317856c45f00ee78b1494c5f46bbeef064fa289`.
Assigned part [0, 11640): SHA-256 `5d80d1c850db28cbdfabd808c317856c45f00ee78b1494c5f46bbeef064fa289`.

| Read chunk | SHA-256 |
|---|---|
| [0, 8000) | `5c3921ec5c88e62693a6fcacfbfad30fda3b6864e24df0de90335fd2c97ab1e7` |
| [8000, 11640) | `3b4569d9a51910dd6ac073ca0b3cc9949a5821c2d022cf2a7dd34369b2c37808` |

### docs/notes/PERF-KNOWN-WINS-2026-10-23.md

Whole file: 14251 bytes; SHA-256 `1d7cb227416316bd315c4b7d00a58222a34ee97fa5124fa8dc5bfc96319ca457`.
Assigned part [0, 14251): SHA-256 `1d7cb227416316bd315c4b7d00a58222a34ee97fa5124fa8dc5bfc96319ca457`.

| Read chunk | SHA-256 |
|---|---|
| [0, 8000) | `6c8a838d114690a4f5bb42bea73c1cd22e8a022349afa007dafd19a95791a63a` |
| [8000, 14251) | `77b55a3afa0b9732da60337b3e84d88274beeb99111ec1466a195f4e8a791e91` |

### docs/notes/PERF-OPTIONS-2026-09-16.md

Whole file: 21504 bytes; SHA-256 `e2ce4951c158cfea45aecd770e39d06a13e85ebe7f3de0ed3bdf2031675e39dc`.
Assigned part [0, 21504): SHA-256 `e2ce4951c158cfea45aecd770e39d06a13e85ebe7f3de0ed3bdf2031675e39dc`.

| Read chunk | SHA-256 |
|---|---|
| [0, 8000) | `06f1343b291c453f2474934c0d3f0e250d5f239c7a67e4b7d2b6978db7e8b182` |
| [8000, 16000) | `02504b11c42d6de0ba072deaf7ea8222ac9f0bcbd87de0f75106d734dcce3835` |
| [16000, 21504) | `9cb447e7295cebd516569d1a1b6e9b196db7f8b87d6e36f5879b8c30cb5693b0` |

### docs/notes/PERF-P1-2026-10-18.md

Whole file: 9824 bytes; SHA-256 `f03173ce3de1d2fb12bce7203cfe81460a15a5c15abd55eeedfb1d43d1b2b888`.
Assigned part [0, 9824): SHA-256 `f03173ce3de1d2fb12bce7203cfe81460a15a5c15abd55eeedfb1d43d1b2b888`.

| Read chunk | SHA-256 |
|---|---|
| [0, 9824) | `f03173ce3de1d2fb12bce7203cfe81460a15a5c15abd55eeedfb1d43d1b2b888` |

### docs/notes/PERF-P2-2026-10-18.md

Whole file: 7478 bytes; SHA-256 `6fe99654056d1199664871bfc84f5f790797de045e7cf5a4c173bdf07e977958`.
Assigned part [0, 7478): SHA-256 `6fe99654056d1199664871bfc84f5f790797de045e7cf5a4c173bdf07e977958`.

| Read chunk | SHA-256 |
|---|---|
| [0, 7478) | `6fe99654056d1199664871bfc84f5f790797de045e7cf5a4c173bdf07e977958` |

### docs/notes/PERF-P2-HTEXT-2026-10-18.md

Whole file: 2290 bytes; SHA-256 `36651f0e05f44f3a620e5fb9b7b5bd45c0a0f65a50e46e9ddf46525a947eda1b`.
Assigned part [0, 2290): SHA-256 `36651f0e05f44f3a620e5fb9b7b5bd45c0a0f65a50e46e9ddf46525a947eda1b`.

| Read chunk | SHA-256 |
|---|---|
| [0, 2290) | `36651f0e05f44f3a620e5fb9b7b5bd45c0a0f65a50e46e9ddf46525a947eda1b` |

### docs/notes/PERF-RENDER-CPU-2026-10-20.md

Whole file: 3041 bytes; SHA-256 `50f2fefecf21116447cb942b4a2bac6aacd650dbec684b1781005ed719b0962b`.
Assigned part [0, 3041): SHA-256 `50f2fefecf21116447cb942b4a2bac6aacd650dbec684b1781005ed719b0962b`.

| Read chunk | SHA-256 |
|---|---|
| [0, 3041) | `50f2fefecf21116447cb942b4a2bac6aacd650dbec684b1781005ed719b0962b` |

### docs/notes/PERF-RESEARCH-2026-10-17.md

Whole file: 76714 bytes; SHA-256 `d97ed87c35cfe7910a79d6dafc2d3d1819915524558457e988a58d6600a58fe3`.
Assigned part [0, 22661): SHA-256 `6a6e5acccddf1a4ceac59f36cb0979c8b158a70140828e49f3a88840b00fa3a1`.

| Read chunk | SHA-256 |
|---|---|
| [0, 8000) | `88cd62e8e6e009b9d97f6856883f750029653a801d1a5dd19a748401b4fa7cb2` |
| [8000, 16000) | `f5a8fe3b978ff75d54617bb6de70e0b28c1dfbe04b2e0d194ad1c9b64205fe53` |
| [16000, 22661) | `20423a7828c1583b6578452933bcd2f5b16ecf44c6402cc9bf536ed25e358d67` |

## Historical path handling

Scratch scripts and legacy/base-ref identifiers are provenance only. Raw scratch/archive path inventory is in [notes-26-paths.json](notes-26-paths.json); none establishes a currently supported entrypoint. Backlinks identify historical evidence producers, not newly verified behavior.
