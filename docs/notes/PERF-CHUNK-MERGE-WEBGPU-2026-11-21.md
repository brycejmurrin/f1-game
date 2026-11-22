# TLX chunk merge on WebGPU at Monza and Spa

Kind: measurement · Re-measure-by: 2027-02-21
Summary: Parked software WebGPU counts for merge factors 2, 3 and 4. Keep the shipped factor of 3 pending hardware timing.

## Setup

Issue [#4680](https://github.com/brycejmurrin/f1-game/issues/4680) asks whether chunk size saves enough draw work to offset the extra geometry it submits. The earlier A/B measured the WebGL2 path. This run measures Three’s WebGPU path at revision `647a30043b` in Chromium 154.0.8037.57 on Debian 13 using the verified `google/swiftshader` adapter. The scene uses the desktop tier, a 640 × 360 output, the default helmet camera and the software renderer’s `skipBatches: true` path. That path omits instanced scenery, so its absolute counts cover a smaller draw set than a hardware adapter with batching enabled. [Earlier WebGL2 results](PERF-CHUNK-MERGE-AB-2026-11-11.md)

Each row below comes from one fresh browser boot with 60 warm-up frames and a 60-frame parked window. Render targets, camera-still checks, adapter identity, memory counters at both ends and original output tables are in the [complete JSON records](PERF-CHUNK-MERGE-WEBGPU-2026-11-21.json). File keys identify the track, lap fraction and merge factor. The command below reproduces the first Monza viewpoint at factor 2.

```sh
APEX_CHROMIUM_PATH=/usr/bin/chromium node tools/gfx/pass-census.mjs monza --webgpu --park --park-at 0.1 --ls tlxChunkMerge=2 --warm 60 --frames 60 --json artifacts/chunk/monza-0.1-2.json
```

## Parked results

Calls and triangles are per render of the named pass. The mirror target is 230 × 66 and the shadow target is 256 × 256. Bytes are Three’s end-of-window memory counters. The last column sums attribute and index buffers. The values describe allocated buffers.

| Track | Lap | Factor | Main calls | Main triangles | Mirror calls | Mirror triangles | Shadow calls | Shadow triangles | Three total bytes | Attribute + index bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| monza | 0.1 | 2 | 32 | 105,256 | 10 | 15,704 | 1 | 15,496 | 94,236,819 | 42,054,128 |
| monza | 0.1 | 3 | 32 | 113,332 | 10 | 15,704 | 1 | 15,496 | 94,536,535 | 42,353,844 |
| monza | 0.1 | 4 | 32 | 131,994 | 10 | 15,704 | 1 | 15,496 | 94,860,131 | 42,680,960 |
| monza | 0.45 | 2 | 32 | 98,905 | 10 | 17,358 | 1 | 15,496 | 94,256,753 | 42,074,062 |
| monza | 0.45 | 3 | 32 | 111,804 | 10 | 17,214 | 1 | 15,496 | 94,553,877 | 42,371,186 |
| monza | 0.45 | 4 | 32 | 107,393 | 10 | 17,196 | 1 | 15,496 | 94,881,479 | 42,698,788 |
| monza | 0.8 | 2 | 32 | 48,859 | 9 | 19,175 | 1 | 15,496 | 94,225,675 | 42,042,984 |
| monza | 0.8 | 3 | 32 | 52,919 | 9 | 19,083 | 1 | 15,496 | 94,519,567 | 42,340,396 |
| monza | 0.8 | 4 | 32 | 53,754 | 9 | 19,083 | 1 | 15,496 | 94,851,499 | 42,668,808 |
| spa | 0.1 | 2 | 32 | 100,690 | 10 | 54,044 | 1 | 15,496 | 89,924,065 | 37,741,726 |
| spa | 0.1 | 3 | 32 | 106,597 | 10 | 53,464 | 1 | 15,496 | 89,954,981 | 37,772,642 |
| spa | 0.1 | 4 | 32 | 161,354 | 10 | 53,769 | 1 | 15,496 | 90,176,505 | 37,994,166 |
| spa | 0.45 | 2 | 31 | 100,865 | 10 | 18,124 | 1 | 15,496 | 89,444,887 | 37,262,548 |
| spa | 0.45 | 3 | 31 | 103,062 | 10 | 17,795 | 1 | 15,496 | 89,481,691 | 37,299,352 |
| spa | 0.45 | 4 | 31 | 108,236 | 10 | 18,025 | 1 | 15,496 | 89,692,865 | 37,510,526 |
| spa | 0.8 | 2 | 31 | 121,395 | 9 | 18,040 | 1 | 15,496 | 89,361,781 | 37,182,962 |
| spa | 0.8 | 3 | 31 | 125,689 | 9 | 17,869 | 1 | 15,496 | 89,441,099 | 37,258,408 |
| spa | 0.8 | 4 | 31 | 134,402 | 9 | 18,216 | 1 | 15,496 | 89,697,265 | 37,518,446 |

Across the six viewpoints, main-pass triangles at factor 2 ranged from -11.5% to -2.1% relative to factor 3. At factor 4 the range was -3.9% to +51.4%.

The largest factor-4 increase occurred at Spa 0.1. The main pass rose from 106,597 to 161,354 triangles (+51.4%). Factor 4 submitted fewer main-pass triangles than factor 3 at Monza 0.45. The main, mirror and shadow draw-call counts stayed constant across factors at each viewpoint.

Every pass had identical minimum and maximum calls and triangles within its sampling window. Three’s memory counters also matched at both ends of all 18 windows.

## Decision

Keep factor 3. One software boot per cell can show how much geometry this view submitted, and supplies no measurement of mobile frame time or boot-to-boot variation. The benchmark records Three’s per-pass triangle counter. Submitted indices and the largest submitted chunk require per-draw instrumentation. The open timing comparison needs at least three alternating fresh boots per factor on a physical GPU with the same tier and camera, with a device and backend identified for each series.
