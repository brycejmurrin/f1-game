# Auxiliary group 03: phone renderer comparison evidence

This group maps 160,000 assigned text bytes: the phone renderer A/B harness tail, the complete gallery builder, the complete macOS GLX census, and the macOS TLX WebGL2 census through its final console-warning fragment. The last 195 bytes of the TLX census belong to group 04; the harness head belongs to group 02. Whole-file identity hashes, exact half-open assigned ranges, individual read chunks, historical paths and semantic contracts are in auxiliary-03-evidence.json. Every assigned byte was returned untruncated in an individual read of at most 9,000 bytes; all four whole-file hashes match the batch inventory. No binaries are assigned.

## Position in the project

These are retained diagnostic and report artifacts rather than shipped game modules, package configuration or plugin entrypoints. The phone renderer comparison note and hand-assembled gallery facts are actual textual consumers. The GPU census workflow invokes its game-check producer with matching GLX and three-WebGL2 output filename patterns. The historical note ties the retained captures to GPU census run 39549012663 and build 1695. This is static provenance, without a fresh network or hardware verification.

The original comparison recommended changing the phone default, but the contemporary note records the owner's subsequent decision to keep TLX default. It also corrects the apparent missing TLX clouds/stars: the local screenshots used a software fallback sky. Neither the earlier recommendation nor a generated report grants authority to change current defaults.

## Harness tail contract

The assigned tail finishes a memory sample, implements race retries, memory and performance modes, installs a closed-loop driver, then dispatches the CLI mode and shuts down. Supplemental head context establishes Node filesystem/path imports, the shared browser/server harness and screenshot helpers, an 844×390 DPR-3 touch profile, iPhone user agent, SwiftShader, and a three backend pinned to WebGL2. Group 02 owns the remaining head and still-capture implementation.

The race helper stops the previous driver, freezes, awaits race entry, waits for a truthy track, and unfreezes, attempting three times with three-second retry delays. Its gate does not compare the requested track or establish final start-sequence commitment. Memory mode samples the menu after six seconds, then Monza, Monaco and Spa after ten seconds of racing each in the same browser. Samples distinguish JS heap, ArrayBuffer backing stores, embedder memory and optional renderer counts.

Performance mode accepts track list, seconds and CPU throttle, defaulting to Monza/Monaco, 30 seconds and 4×. It settles the race for four seconds, drives for three seconds, applies CDP throttle, clears timing/distance records, measures and restores throttle. Its page driver reads the debugging probe and forward scan, derives curvature speed targets, brakes before curves, corrects lateral position and recovers stalls. It records requestAnimationFrame intervals, distance and the governor snapshot. Marking clears collected intervals but retains previous timestamp/progress state, so the first retained sample crosses the measurement boundary.

Both modes write backend/tier/environment/rows/errors JSON in finally, before closing browser/server; an output-write failure can bypass those local close calls, although outer shutdown remains. Other effects include logging, creating output directories, page input/freeze/HUD changes and CDP throttling. The unused menu helper and driver variable remain scratch cleanup candidates. The retry comment says “retry once” although the implementation makes three attempts; the output-directory comment also differs from flat memory/performance filenames. None was edited or run.

## Gallery builder contract

The Python stdlib generator directly loads two local JSON documents: keyed image pairs and hand-assembled facts. Its docstring describes memory/performance/census inputs, but these influence facts indirectly. A fixed twelve-scene order skips absent pairs, merges caption overrides, and emits paired images, a three-times crop that flips on click/Enter/space, and heatmaps. Difference severity thresholds are 5% and 15%.

Facts supplies headings, dates, recommendation, metric tiles, three tables, notes and footer. Most prose is HTML escaped; table cells and recommendation intentionally accept trusted local HTML. The generator requires the gallery directory, valid files and expected keys, then overwrites its HTML output. Generated content uses lazy sibling images and Google Fonts stylesheet URLs; the Python generator itself performs no network requests. Responsive layout and dark-mode selectors are present in source, but generated HTML/images were not built or visually inspected.

## Census interpretation

| Contract | GLX capture | TLX WebGL2 capture |
|---|---|---|
| Identity | backend webgl2, live GLX | backend three, path webgl2 |
| Environment | darwin arm64, Apple GPU adapter | same platform/adapter class, mobile tier |
| Driven window | 24.9 fps, p50 33.4 ms, p95 78 ms | 25.9 fps, p50 36.4 ms, p95 74.2 ms |
| Race entry | 5,916.2 ms, longest block 1,439 ms | 19,146.1 ms, longest block 502 ms |
| GPU timing | 12.9 ms; main scene plus post | 9.23 ms; summed three render passes |
| Timing resolution | scale 0.9, 1152×648 | scale 0.8, 1024×576 |
| Warm-up | no explicit warm request | 14,951 ms, completed, no failed attempt |

The GLX capture's path label says webgpu, but its backend, graphics API and overlay establish GLX WebGL2. Conversely the TLX filename's webgl2 label identifies three's WebGL2 path. Neither filename alone establishes renderer identity. Both capture a dry Monza helmet-camera API race entry and twenty beats, with native presentation, zero recorded GPU errors and no off-road frames. The GLX complete capture explicitly records page/browser closure; those final TLX metadata bytes are outside this group's assignment.

Both schemas retain race entry marks/legs, cumulative beat timings, mirror statistics, CPU samples, window intervals, gap attribution, long-animation-frame records, geometry/upload profiles, GPU work and hitch distribution. TLX adds material-pool/UBO details, warm stages, depth and backend/environment/sky state. Embedded source URLs, line numbers, local ports and runner paths describe the historical capture and are not current navigation evidence.

Top-level success does not validate every diagnostic: both pass-composition sections report zero observed rendering frames, and both spike CPU joins report zero sample coverage and a failed clock join. TLX explicitly skips unsupported occlusion and multi-draw comparisons and reports no depth discards. GLX retains off/off2/on snapshots: occlusion pixel differences exceed its noise floor, whereas multi-draw differences do not; its GPU deltas also show substantial baseline noise. These observations do not establish a performance improvement.

The GPU medians have different timing boundaries and dynamic resolution/tier settings, so they are not equal-work measurements. The CI Mac's paravirtual Apple GPU with mobile caps is also not an iPhone Safari result. Local SwiftShader frame timings were rejected by the contemporary note as phone-performance evidence.

## Navigation, cleanup and limits

Attached LSP resolves the current GLX facade and its install, isMobile and mobileTier exports. Attempts to resolve the historical race/API members encounter checker-visible dynamic-facade limits; no current definition is invented. Textual searches supply report and workflow consumers. No runtime symbol search was replaced with a claimed current source location from historical stack text.

Potential comment cleanup is confined to the harness retry/output descriptions and gallery docstring; historical recommendations need their subsequent decision/correction context. Preserve invalid/skipped diagnostic fields when summarizing. This pass made documentation only: no source changes, tests, browser sessions, runtime probes, network calls, staging or commits. Consumer searches were scoped and do not prove absence of every external consumer.
