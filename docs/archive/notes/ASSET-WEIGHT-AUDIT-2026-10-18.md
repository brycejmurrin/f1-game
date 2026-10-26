# Asset weight audit (2026-10-18)

Read-only measurement of shipped bytes against web-game practice (KTX2/Basis textures,
glTF+Draco/Meshopt models, Opus audio, startup under ~2 MB, lazy loading). Numbers from
`du`/`ls` on the deploy-branch tree at 5f6e3234.

## Totals

- `assets/`: 146,216,173 B. By folder: voice 101.5 MB, music 23.2 MB, atlases 15.1 MB,
  pack 4.3 MB (models 2.0 MB), stills 1.3 MB, sfx 0.65 MB, fonts 0.13 MB.
- `vendor/`: 4,175,745 B (rapier.mjs 2.24 MB, three.webgpu.min.js 0.71 MB,
  three.core.min.js 0.39 MB, jsQR.js 0.26 MB).
- Audio is MP3 only: no ogg, webm or opus anywhere.

## Startup payload

- Raw 8,112,672 B; gzip -9 equivalent **2,669,634 B (≈ 2.67 MB)**, over the ~2 MB target.
  That is index.html 89 KB, 276 `defer` scripts 2.28 MB, CSS 75 KB, fonts 28 KB and the GLX
  backend 197 KB (all gzipped). `defer` delays execution, not download.
- `js/game.js` alone is 652,788 B raw.
- Already lazy (`tools/manifest.cjs`): scenery 2.17 MB, audio 0.58 MB, track build 0.54 MB,
  net 0.47 MB, editor 0.41 MB, agent 0.34 MB, plus the circuit, data, race and career bundles.
- `sw.js` precaches 262 files (9.5 MB of JS, fonts and icons) and no large media; pack and
  voice are network-first and cached on first use. A `Range:` music request bypasses the
  cache, so music does not play offline.

## Savings opportunities

| Asset | Now | Proposal | Est. saving | Risk |
|---|---|---|---|---|
| `assets/voice/*.bin` (24) | Concatenated MP3, 64 kbps 24 kHz mono, 101.5 MB | Opus 24–32 kbps mono with MP3 fallback | ~50–60 % (2–3.5 MB per voice set a player fetches) | Med: older iOS Safari Opus decode; clip offsets in each `.json` must be rebuilt |
| `assets/atlases/*.png` (6) | 15.1 MB, never fetched by the game | Leave out of the deploy staging | 15 MB deployed, 0 B per player | Low |
| music song2/song5/menu | MP3 192/192/160 kbps, 13.3 MB | MP3 128 kbps, or Opus ~96 kbps with fallback | 3.5–6.5 MB | Low–Med |
| `assets/pack/mat-*-256.png` | PNG filmstrips, 1.67 MB (each strip 4.46 MB of GPU RGBA8) | Lossless WebP (~20–30 %). **KTX2/UASTC was already decided NO** (`docs/plans/2026-09-14-texture-memory-plan.md` Task 4, `docs/research/ASSET-API-RESEARCH.md` rollout row 4, pinned by a test since #2756); reopen only with a measured texture-size or load-time problem | 0.3–0.5 MB wire | Low (WebP decode is native) |
| `assets/pack/models` (AX26 v2) | 2.0 MB, float32 positions | int16 positions per model | 0.4–0.8 MB | Low–Med: writer and reader both change |
| Startup JS | 2.28 MB gzipped | Move more of the FULL list to lazy bundles | Varies | Med; minifying conflicts with the no-build rule |

## Prior art

No earlier record exists for Opus voice packs, music bitrate, the deployed-but-unused atlases or the startup payload size. KTX2 is covered above. `docs/notes/GPU-MEM-CENSUS-2026-10-17.md` and `docs/notes/PERF-RESEARCH-2026-10-17.md` hold the GPU-memory side.

## Already well optimised

WebP stills at 15–37 KB each; subset woff2 fonts; low-bitrate mono voice packs fetched per
voice; music streamed via `<audio>`; quantised AX26 v2 models; a 128 px low pack tier; lazy
audio, scenery, editor, net and career bundles; non-critical CSS via the `media=print` swap.

## Suggested order

1. Drop `assets/atlases/` from the deploy staging: `assets/atlases/README.md` says the game never fetches them (only `tools/gen/assets.mjs bake-atlas` reads them), so zero player risk.
2. Re-encode the three high-bitrate music tracks to 128 kbps MP3: no format risk.
3. Opus voice packs with MP3 fallback: the largest per-player win.
4. Lossless WebP pack textures. Not KTX2: rejected and test-pinned (see the table).
