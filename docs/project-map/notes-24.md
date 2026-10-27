# Notes batch 24 — performance hunt provenance

Fully read the entire assigned 100,000 bytes as historical evidence. Byte ranges are half-open; source hashes identify complete files, part hashes identify assigned ranges, and chunk hashes identify individually returned source reads (each at most 9,500 bytes). Historical commands and recommendations are not current execution authority. No runtime, network, browser or test work was performed.

## Coverage and hashes

### docs/notes/PERF-HUNT-2-2026-10-13.md

Whole file: 104898 bytes; SHA-256 `83b1a722c49ec3a676f93ea8696771918e56060f099f194a30af5dc744287563`.
Assigned part [97835, 104898): SHA-256 `97d4733c8602f2958c86ce59bacc956e3ce8dbf8a702d2ed18fece62a93ffae8`.

| Read chunk | SHA-256 |
|---|---|
| [97835, 104898) | `97d4733c8602f2958c86ce59bacc956e3ce8dbf8a702d2ed18fece62a93ffae8` |

### docs/notes/PERF-HUNT-2026-08-18.md

Whole file: 16478 bytes; SHA-256 `f8a99d87002894fb0815c6e853baca618a4ee8f2e55a30ffe29590d0fe153c11`.
Assigned part [0, 16478): SHA-256 `f8a99d87002894fb0815c6e853baca618a4ee8f2e55a30ffe29590d0fe153c11`.

| Read chunk | SHA-256 |
|---|---|
| [0, 9000) | `bfa0fb418c12a3fe8e7a1fa33420acda7df0a1c98ae3c997ab727ca7b3fa3ce9` |
| [9000, 16478) | `82b2289f5457e6ac9cd3a1598b53322fce50957c2a7fb0ad42977cd7d652492b` |

### docs/notes/PERF-HUNT-3-2026-10-13.md

Whole file: 73334 bytes; SHA-256 `7a093d17f1cf1618adba215006d0a15873fd9ceaf3b7844404d5e10102b92841`.
Assigned part [0, 73334): SHA-256 `7a093d17f1cf1618adba215006d0a15873fd9ceaf3b7844404d5e10102b92841`.

| Read chunk | SHA-256 |
|---|---|
| [0, 9500) | `b0da06fa216953da79eac39d3a8c79ac7a73f32c4f5d04308a03f3e90871ade3` |
| [9500, 19000) | `ecb74b16f5fa13dc4ac157ad20d644b093fc3176479027204b7913f36a8a5e86` |
| [19000, 28500) | `edd872050dd7b36da591ffb69c22148458b44d71f358c83e7eea80777321bd38` |
| [28500, 38000) | `b61f9fee6e325626b0c887867bafa19a2064ed84a57813d4614f349b204864c2` |
| [38000, 47500) | `df6fb898471304d6bf7491a04d8cbaaf36eebe325a39eaf27fe701e275e7c168` |
| [47500, 57000) | `deea437764c945262e7e1eb398cfcacfab7cf9bceb96984ec179dc90e6c58821` |
| [57000, 66500) | `020e4a0b0602273d8e656c1c966c917cf0b0fcedefd2ee90bb6fe0cea86db807` |
| [66500, 73334) | `3da3dfa62bbbc85aea3bff5282a20750f86cce8e641147ea230bda303d08e84d` |

### docs/notes/PERF-HUNT-4-2026-10-14.md

Whole file: 96572 bytes; SHA-256 `5253a69a8d639e6168662e67d07c9a763d2cd4f40af7e75d554adecafe78b067`.
Assigned part [0, 3125): SHA-256 `7810836e1f307ffca0e649b8da5c5d885eb069f0c18956618bc00e8e3d7850f7`.

| Read chunk | SHA-256 |
|---|---|
| [0, 3125) | `7810836e1f307ffca0e649b8da5c5d885eb069f0c18956618bc00e8e3d7850f7` |

## Semantic map

### Hunt 2 tail: 2026-10-13, PR #1448

Producer: the parent fix pass and four Opus worktree lanes (GLX, SIM, FRAME, BUILD); individual names are absent. The opening continuation inventories worker transfer, race-entry prefetch, world retention and service-worker precache. Lessons 7–8 explain governor-dependent software captures and matching same-tree floors. The landed/skipped table records renderer gates, updateCar splitting, cached AI look-ahead, grouped lights, coarse build grids and transferred buffers. Closing browser evidence distinguishes base-red hooks/physics failures from lane regressions and warns that digest coverage only includes exercised paths. Use this tail to interpret hunt 3 and PR #1448; it does not independently establish present behavior or include the earlier hunt-2 findings.

### August hunt: 2026-08-18, updated through 2026-08-19

Producer: an unnamed read-only leftover-hunt author/session; initial cache 1388 and later union cache 1421 are dated snapshots. Opening status tables supersede most original ranked leftovers. Instruments and counted sections distinguish Node scene-graph/boot counts from unavailable GPU timing. Already-taken tables reject duplicate proposals; ranked sections preserve the rationale for TLX shadow count propagation, WGX uniform-ring flushes, lazy agent loading, DebrisWorld wake-aware skipping and typed build accumulators. Explicit exclusions separate look/correctness changes and negligible costs from performance work. The closing suggested implementation list is historical. Use for mechanism provenance and why tempting optimizations were rejected; all counts, locations and shipped claims require current corroboration.

### Hunt 3: 2026-10-13, tip bc587c9d1 and PR #1449

Producer: two read-only Opus hunters (TLX and bugs), followed by parent verification and BUGS/TLX-1/TLX-2 worktree lanes. The shortlist joins rendering candidates R1–R13 to bugs K1–K5/X1–X8. Section A documents real vendored three r186 over fake GL, per-object CPU benchmarks and a game-vm render-object census: wheel-heavy bunched frames motivate attribute instancing and coalescing; shared texture bindings, unread MRT tags, opted-out environment probes, sky bandwidth, pooled wrappers, SSR thresholds, rain copying, mirror mips and caster spikes form the remaining list. Deferred designs explain F1, B14, A2, E4, E8 and D4, with checked-clean items and explicit measurement gaps.

Section B traces null-track loop failure during asynchronous race switches; jump progress/lap double counting; unawaited shared-page race starts; fused-crown normal mismatch; and duplicate menu builds. It distinguishes real defects from seat-dependent pit-lane test assumptions and VM harness artifacts. The transfer-list and accumulator fixture findings are test coverage gaps. Checked-clean sections document the split updateCar state, caches, worker transfer and scenario fuzz.

The fix-pass table records what landed, skipped items, browser evidence and corrected design assumptions: wheel bases can reflect, and shared texture keys need binding names. Lessons 11–12 explain day capture floors and lamp-ramp chromatic shifts. Final pinned A/B evidence, default-off look knobs and real-GPU census tables preserve the limits of comparisons when governor scale/tier changes. Use for rationale and historical verification provenance, especially asynchronous race readiness and render-object reduction. Fake GL CPU measurements are not GPU measurements; phone multipliers and tile bandwidth remain estimates; scratch instruments are not maintained tooling.

### Hunt 4 opening: 2026-10-14, tip a52e9108b

Producer: parent researcher/census operator plus three read-only Opus hunters (three/upstream, simulation/V8, GLX/WGX/shared post). This part contains the introduction, evidence rule, platform research and only the beginning of the shortlist (A-H1 and a partial C-P1 row). It cites Safari 26/WebGPU, Chrome/Android WebGPU and real-GPU census runs; A-H1 identifies DynamicDrawUsage forced uploads. Use to understand the next batch’s scope and evidence policy. The assigned range ends mid-row, so it cannot support a complete hunt-4 summary. Platform claims are dated external research, not a fresh compatibility check.

## Backlinks and navigation

- Related historical notes: [hunt 2](../notes/PERF-HUNT-2-2026-10-13.md), [August hunt](../notes/PERF-HUNT-2026-08-18.md), [hunt 3](../notes/PERF-HUNT-3-2026-10-13.md), [hunt 4](../notes/PERF-HUNT-4-2026-10-14.md), [performance findings](../notes/PERF-FINDINGS.md), [TLX first hunt](../notes/TLX-PERF-HUNT-2026-10-11.md).
- Current reference entry points to corroborate historical claims: [architecture](../ARCHITECTURE.md), [testing](../TESTING.md), [render map](render.md), [three map](three-complete.md), [simulation map](simulation.md), [tooling map](tooling.md).
- Cross-batch boundaries: hunt-2 preceding bytes belong to batch 23; hunt-4 continuation belongs to batch 25. Raw scratch/archive identifiers are quarantined in [notes-24-historical-paths.json](notes-24-historical-paths.json).

## Reading limits

Only assigned byte ranges are claimed as fully read. One accidental whole-file hunt-4 output was truncated and is excluded from coverage; the assigned [0,3125) prefix was then read independently and untruncated. No historical operational instruction was executed. Hashes are local content evidence, not validation of the historical performance or correctness assertions.
