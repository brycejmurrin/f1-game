# Helmet camera + visor: what the path costs over chase (2026-11-04)

Kind: measurement · Re-measure-by: 2027-01-15

Bryce plays on an iPhone, phone landscape, THREE PATH: WEBGPU (TLX, D-013), HELMET camera with the helmet visor on and
HUD > MIRROR on (`tests/data/settings-defaults-export.json`: `gfxBackend three`, `gfxPreset medium`, `resMode low`,
`hudMirror on`). The ask: make that path cheaper. Tip measured: `ae67cb87`. Prior art not re-reported: #3657,
`PERF-GPU3-2026-10-30.md`, `TLX-WEBGPU-PERF-3-2026-10-30.md`, `PERF-CENSUS-WEBGPU-2026-11-04.md`,
`LIVE-DEBUGGER-COCKPIT-FINISH-2026-10-21.md`.

This container has no Lavapipe and no GPU. The local numbers below are on TLX's WebGL2 path under SwiftShader
(`apex26.tlxForceGL=1`), phone tier (`apex26.forceMobileTier=1`, the mirror's `lite` rung). They are COUNTS
(calls, triangles, paints) or desktop-CPU JS milliseconds, never iPhone frame times.

## 1. Pass census, monaco, phone tier (`pass-census.mjs monaco --mobile --by-mesh --camera <cam>`)

| camera | main pass calls / tris | mirror 138x39 calls / tris | shadow + post | total calls / tris |
|---|---|---|---|---|
| chase | 48.4 / 189,611 | – | 10.8 / 9,511 | 59.2 / 199,121 |
| helmet | 55.5 / 184,875 | 10 / 62k–80k | 10.6 / 7,152 | 76.1 / 271,859 |

The WebGPU arm on Lavapipe (`PERF-CENSUS-WEBGPU-2026-11-04.md`, desktop tier, so the mirror's `full` rung) shows the
same shape: helmet +13 calls and +109k tris, the mirror 10 calls / 115k tris at 230x66.

What the helmet adds, ranked:

1. **The mirror pass, ~10 calls and 62k–80k triangles into a 138x39 target** (276x78 supersampled). By mesh, most of
   it is ONE merged chunk draw of the world-scenery record (101 chunks, ~230 m cells): 0.7 calls and 50k tris per
   frame. The phone rung culls at 120 m (`LITE_CULL`, B·H10), but the radial test is per CELL (nearest AABB point), and
   one Monaco cell behind the car holds 180,744 indices (60k tris) on its own. Whenever any corner of it is within 120 m
   the whole cell draws, so the mirror's real reach is up to the cell's far side (~350 m), not 120 m. The road split
   (`tlx-chunked.js` splitRanges) already solved this for the road; the scenery record has no such split. Any fix
   removes geometry the mirror shows today (between 120 m and the cell edge): a look change, filed for Bryce (§4).
2. **The cockpit rig in the main pass, ~+7 calls net.** The chase body (40,524 indices, 13.5k tris) goes; the cockpit
   body, cabin and wheel come (~11k tris), plus ~10 small separate draws on the wheel: gear digit, LED strip, up to
   three speed digits, ERS bar, aero lamp, mirror lenses (6–384 indices each). Each is its own material/opts draw.
   Merging them needs a per-frame dynamic mesh or a key per speed string: no clear win over the upload it adds; not
   taken.
3. **The visor: no render pass at all.** It is DOM: an SVG eye-port on `#hud::before`, one 2D canvas (`#fx-visor`) at
   15 Hz composited `over` on WebGL2 and `plus-lighter` on WebGPU (#3657), and an optional feDisplacementMap (VISOR
   REFRACTION, off by default and off in Bryce's export). Its GPU cost is the compositor's, which no software probe
   measures.

## 1b. Real GPU: macOS gpu-census, TLX on WebGPU (Dawn on Metal), monaco, phone tier, visor CLEAR

Runs 41874226665 (helmet) and 41877458922 (chase), both on `ae67cb87`, `path: webgpu`, Apple adapter. The ls seed
`apex26.hudMirror=on` did not take (`mirror.mode` read `auto`), so chase drew no mirror: the gap is everything HELMET
adds. `gpuByPass` reads `supported: false` on the runner, so there are no per-pass GPU times.

| leg | median passes | submits | normal frame ms | uploads KB/frame | writeBuffer/frame | createBuffer/frame | createBindGroup/frame |
|---|---|---|---|---|---|---|---|
| chase | 11 | 11 | 9.36 | 19.7 | 52.1 | 0.40 | 0.17 |
| helmet + visor | 15 | 13 | 14.03 | 24.8 | 74.4 | 0.80 | 0.26 |

The four extra passes are the mirror: its MRT scene pass (276x79, ssrTag and depth discarded) once a frame, plus ~2.7
single-target passes on the same target, the mip levels the cockpit glass samples (`glassLod` 2.2, chain capped at
`mipCap` 3, A-H5). The largest upload site is the merged-chunk index regrow (`createIndexAttribute`, 138 KB, 0.02 per
frame), already tracked in `TLX-WEBGPU-PERF-3-2026-10-30.md` §3. The runner's frame time is a CI Mac's, not an iPhone's.

## 2. CPU spans, monaco, phone tier, seed 42, 60 frames, 2 repeats (`__apex.perf` spans, ms mean per frame)

| arm | render | hud | physics | frame |
|---|---|---|---|---|
| chase | 7.39 / 7.81 | 0.27 / 0.32 | 6.37 / 5.96 | 53.9 / 57.2 |
| helmet, visor off | 9.07 / 7.79 | 0.36 / 0.27 | 5.46 / 5.21 | 85.5 / 74.3 |
| helmet, visor clear | 8.95 / 8.58 | 0.26 / 0.27 | 5.92 / 5.08 | 82.8 / 73.9 |

- The visor's own paint: 46 paints per run, **0.33 / 0.25 ms per paint** (`VisorOptics.stats().msAvg`, desktop CPU).
  At 15 Hz under 60 fps that is ~0.08 ms per frame amortised. The `render` span moves by about the run-to-run spread.
- The `frame` gap (chase ~55 ms, helmet ~80 ms) is the mirror's second world pass rasterised on SwiftShader. It says
  the mirror is the helmet path's cost; it says nothing about an Apple GPU.

## 3. Leads checked and refuted (measured, not fixed)

- **Visor `lightMap` garbage** (hunt-render-lighting-fx F2, system-audit-4: "allocates per light per paint").
  A Node 22 bench (`--expose-gc`, js/fx/visor-optics.js in a VM, 48 night lamps, 8 glints kept, 20k warm calls, six
  2,000-call windows of `used_heap_size`): **1.7 KB per call**, three runs 1,721 / 1,725 / 1,737 B median. At 15 Hz that is ~0.4 KB per 60 fps frame against the game loop's
  ~188 KB/frame (`vm-alloc-census`). Optimised code escape-analyses most of it away. Not worth a change.
- **Visor per-tick DOM reads.** `CockpitOpts.*` choices are cached (`picked`), the tint is read once per port build
  (7f6622e8), and `_size` compares numbers. Nothing per frame touches layout.
- **Mirror mip chain on WebGPU.** Already capped (A-H5, `_mirMipCap = 3`).

## 4. For Bryce (`needs-decision`)

The mirror is the one big cost the helmet adds, and every way to make it cheaper changes what the mirror shows:

- (a) **Honour the 120 m mirror reach at sub-cell granularity** (split dense scenery cells into index ranges with their
  own AABBs, as the road already is). The mirror stops drawing scenery 120–350 m behind; on monaco it drops the 60k-tri
  cell when only its corner is in reach. **My pick:** it is what B·H10 asked for ("shorter mirror draw distance"), and
  the main pass is untouched.
- (b) Mirror at 1 frame in 2 on the phone rung (#4272, already with Bryce): halves the mirror's whole cost, reads as lag.
- (c) Leave it.

## 5. PHONE TEST (Bryce's iPhone, skill `phone-bridge`)

Only the phone answers these; Lavapipe and SwiftShader cannot:

1. monaco, HELMET, visor CLEAR, mirror ON vs mirror OFF: fps and `__apex.perf()` autoTier over 60 s each. The size of
   the mirror's cost on an Apple GPU.
2. The same with visor OFF vs CLEAR on WebGPU: re-checks #3657's "free on WebGPU" on today's tip.
3. singapore at night (the most lamps, so the most glints and beams), visor CLEAR vs OFF.

## Next

- A gpu-census run with timestamp queries (`gpuByPass`) on a runner that supports them: the mirror's GPU ms.
- If Bryce picks (a): the scenery split, measured with `--by-mesh` before and after on monaco and monza.
