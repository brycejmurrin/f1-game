# Perf hunt 7 — what the player waits through, and what gets the iOS tab killed (2026-10-30)

Scope: boot → menu → race entry, garage open, track switch, race → quit, memory growth,
network / asset loading and the PWA cache. Default backend TLX (three r186, WebGPU path on
Bryce's iPhone). Branch `claude/apex-26-perf-hunt-7-818htt`, base `2220af2c` (= live apex-sha).

## Leads (macOS gpu-census run 40838027433, 2026-10-29, `entry=api`)

Read from the run's artifact (`game-webgpu-macos-latest.json` = TLX/WebGPU,
`game-wgx-macos-latest.json` = WGX), `raceEntryProfile` / `raceEntrySpans` / `gapWork`.
`entry=api` calls `__apex.race()` ~8.2 s after load, before the title's idle prefetches, so its
`resets` leg is the cold worst case, not the menu path a player takes.

| leg / mark | TLX (WebGPU) | WGX | lead as briefed |
|---|---:|---:|---|
| `scenery` | 21 ms | 29 ms | — |
| `resets` (ensureRaceSession + ensureAudio + ensureLightPresets + resets) | **4,419 ms** | 1,219 ms | engine.js onload 569 ms inside it |
| `loadTrack` (paced build) | **2,535 ms** | 1,205 ms | track build cpuTotal 1,083 ms, props/geo 478 ms |
| `warmCarAssets` span | **3,139 ms** (54 yields, max step 283 ms, CPU 3,069 ms) | — | warmCarAssets 1,219 ms |
| `mirrorPrepare` span (waits on the entry's program warm) | 14,183 ms (`warm:scene` 8,144 + `warm:draw` 5,268) | 3,697 ms rAF gap lands here | mirrorPrepare LoAF 3,766 ms |
| worst rAF gap before race() | 3,206 ms | **5,573 ms** | 5,573 ms |
| race-entry long tasks | 62 tasks, 10,495 ms blocked, longest 1,111 ms | — | 31 long tasks (3,589 ms) |

TLX `resets` LoAF: one 1,942 ms frame whose biggest script is `lazy-bundles.js`
`Scheduler.yield.then` 787 ms (bundle evaluation), plus idle work that was due at the same time
(`build-client.js kick` 189 ms, `scroll-fade.js` 148 ms, `aria-state.js` 102 ms, `garage/prebuild.js tick` 75 ms).

## Measurements

_In progress — see the PR Plan._
