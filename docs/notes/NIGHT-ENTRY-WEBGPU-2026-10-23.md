# First night race on three.js WebGPU: 14.5 s entry — a lamp-bake placeholder forked the lit WGSL (2026-10-23)

A·W14, Fleet A (OrchA 30's lane). On the iPhone 18 Pro Max, the first Monza night race on three.js WebGPU took
about 14.5 s to enter. On WebGL2 the same race takes about 3.6 s (A·D1, #3612 §9).

## 1. Device stage table (no new session)

Source: the #3618 BEFORE and AFTER Device Farm runs (`--scenario races --pins webgpu`; the BENCHMARK "WEATHER &
TRACKS" bench reloads the page before every race). Units 8CCEE2EE (build 20959) and D56CA871 (build 21093).
Times are BEFORE / AFTER.

| race (in run order) | cold build | warm total | scene | fx | draw | async pipelines in entry |
|---|---|---|---|---|---|---|
| Monza dry (1st) | 9.4 / 9.3 s | — | 3.6 / 3.6 s | 0.6 / 0.6 s | 2.7 / 2.6 s | 28 / 32, 4.3 / 4.2 s |
| Monza rain | 5.2 / 5.1 s | — | 0.6 / 0.6 s | — | 0.4 / 0.4 s | 38 / 42, 2.4 / 2.4 s |
| **Monza night** | **14.4 / 14.8 s** | **12.6 s** | **8.0 / 7.4 s** | 1.8 / 2.9 s | 2.3 / 2.2 s | 29 / 33, **9.9 / 10.4 s** (each up to ~600 ms) |
| Singapore night | 3.0 / 3.0 s | — | 0.6 / 0.6 s | — | 0.1 s | 35 / 39, **0.56 / 0.57 s** |

Breaking down the Monza night entry:
- `programWarm` runs from 1.69 s to 14.76 s, so the shader warm is 13.1 s of the entry.
- post, shadow and mirror are about 0.

Singapore night, run straight after Monza night, creates as many pipelines in 0.57 s. So the cost is a ONE-TIME
compile of new Metal pipelines: Safari's pipeline cache, which persists across sessions, serves them to every later
night race.

## 2. Why night compiled new pipelines

The bench reloads before each race, so the only reuse between a day race and a night race is the browser's pipeline
cache. That cache is keyed on the shader CODE.

`scratch/df/night-wgsl.mjs` uses lavapipe and three.js WebGPU. It boots a fresh page into Monza day, then a fresh
page into Monza night, hashes every shader module and pipeline descriptor, and diffs the two:

- Base: **16 of 44 night pipelines and 7 of 40 shader modules are not in the day page.**
  - After normalising TSL's build-order names, 3 of the 7 modules match a day module. They differ only in naming.
  - The other 4 differ in one tap. Day writes
    `textureLoad(bakeAtlas, clamp(floor(uv * dims)…))` where night writes `textureSampleLevel(bakeAtlas, sampler, uv, 0)`.
    The night version adds a sampler binding, which shifts every later name and binding number.
- Cause (`js/render/three/tsl-lit.js`, BAKED LAMP POOLS):
  - `BAKE_NODE` starts on `_bakeBlank`, a `DataTexture`, whose default filter is NEAREST.
  - `setLampBake` swaps in the real atlas, which is LINEAR (`_halfData(…, THREE.LinearFilter)`).
  - TSL emits `textureLoad` for a NEAREST float texture and `textureSampleLevel` for a LINEAR one, and it decides at
    BUILD time.
  - A page that builds its lit programs before any bake (day) and one that builds them with the bake set (night)
    therefore write different WGSL for the same graph. The comment above the node says "a new track never mints a
    program", which was true within a page but not across pages.
- Fix: `_bakeBlank` takes the atlas's filter (LINEAR); `_bakeIdxBlank` already matched its NEAREST indirection.
  - On the fix branch, the same probe reports **0 of 44 pipelines and 0 of 40 modules** differing between day and night.

## 3. Side effect inside one page (visual)

three.js caches the generated program at the first build, and swapping the node's texture does not rebuild it. So a
session whose first race was a day race kept the `textureLoad` (point-sampled) bake tap for every later night race.
Those races sampled the lamp-pool atlas without bilinear filtering.

After the fix, every page samples the atlas LINEAR, as a night-booted page already did and as GLX does
(`textureLod(uLampBake, …)`). This is a look change for night races entered after a day race in the same session:
filtered lamp pools instead of point-sampled ones.

## 4. What it should buy, and what it cannot

- Should buy: the day and night lit families become one set of pipelines.
  - A phone that has raced a day race on WebGPU (in this session or an earlier one) should enter its first night
    race without recompiling the lit family. On device that family was the ~7.4–8 s `scene` stage.
  - The night-only programs remain: the post chain, lamp-map depth casters, and one double-sided lit variant. Those
    cost ~1–3 s on first use.
- Cannot: shorten the very first race on a fresh phone. Day or night, that race compiles the lit family once.
- To verify after deploy: a Device Farm races run on an 18 Pro Max, comparing Monza night's `scene` stage and async
  pipeline time against §1. Because units are pooled and the cache persists, also compare Singapore night (the
  already-cached control).
