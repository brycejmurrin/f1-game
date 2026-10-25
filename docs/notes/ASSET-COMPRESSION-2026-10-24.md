# Asset compression survey (2026-10-24, A·H18)

Lane brief: cut download size, GPU memory and decode time for every shipped
asset, without visible or audible quality loss, measured on Bryce's iPhone path
(TLX on three r186 WebGPU). This note has the inventory, what GitHub Pages
already compresses, a ranked plan and the measurements behind each rank. It
updates `docs/notes/ASSET-WEIGHT-AUDIT-2026-10-18.md`. Two of that audit's
inputs were wrong: voice is 32 kbps, not 64, and the model pack is 0.41 MB, not 2.0.

Tree: deploy tip `dd923f85`. Tools: `du`/`stat`, `ffprobe`, `sharp` 0.33 (repo
devDependency), `gzip -9`, and `curl` against the live site through a
`deploy-research` subagent. Scratch scripts are in `scratch/compress/`, which is ignored.

## 1. Inventory

| Class | Files | Bytes on disk | Format today | Fetched by a player |
|---|---|---|---|---|
| `assets/voice/*.bin` | 24 packs (+24 `.json`) | 97 MB | Concatenated per-clip MP3, 24 kHz mono **32 kbps** (`tools/gen/voicepack.mjs` `ENCODING`) | Per selected voice. Network-first, the whole `.bin` is fetched and **kept in the JS heap** (`v.bin`, `js/audio/voice-pack.js`) |
| `assets/music/*.mp3` | 6 | 23.2 MB | MP3 stereo 44.1 kHz: menu 160, song2 192, song5 192, song3/4 ~126, song6 128 kbps | Streamed through `<audio>` (Range), one track at a time |
| `assets/atlases/*.png` | 6 | 15.1 MB | RGBA PNG 4×4 sheets | **Never**: author-time input to `assets.mjs bake-atlas` (`assets/atlases/README.md`), but staged to Pages |
| `assets/pack/mat-*-{128,256}.png` | 4 | 2.24 MB | 8-bit RGBA, untagged, filmstrip of 17 layers | One tier per device: phone `low` 128 (570 KB), desktop 256 (1.67 MB) |
| `assets/pack/models/*.bin` | 41 | 0.41 MB | AX26 v2 (f32 pos, i16 nrm, u8 col/mat, u16 idx) | Per circuit, before its build (`modelsReady`) |
| `assets/stills/*.webp` | 52 | 1.3 MB | WebP, 15–37 KB each | Per circuit card |
| `assets/sfx/*.mp3` | 2 | 0.65 MB | MP3 128 kbps stereo | Lazy audio bundle |
| `assets/fonts/*.woff2` | 8 | 0.13 MB | Latin-subset woff2 | Boot |
| `assets/pack/manifest.json`, `webbake.js` | 2 | 64 KB | JSON / JS | Boot |

### What GitHub Pages already does (measured live, 2026-10-24)

`curl -H 'Accept-Encoding: gzip, br'` against https://brycejmurrin.github.io/f1-game/:

| Type | Content-Encoding | Example (raw → wire) |
|---|---|---|
| `application/json`, `application/javascript`, `text/html` | gzip | `assets/pack/manifest.json` 36,787 → 3,256 |
| `application/octet-stream` (`.bin`) | **gzip** | `models/k_bannertowergreen.bin` 20,858 → 3,955; `voice/george.bin` 4,072,204 → 3,677,200 (−9.7 %) |
| `image/png`, `image/webp`, `audio/mp3`, `font/woff2` | none | stored bytes are the wire bytes |

- Brotli is never offered, so gzip is the ceiling.
- Every response carries `cache-control: max-age=600`, an ETag and `vary: Accept-Encoding`, through Fastly.
- I found no GitHub-authored page that lists Pages' compressed MIME types (https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages is silent), so this table is the evidence.

Consequence: **pre-compressing anything Pages already gzips buys nothing.** The
model pack goes out at about 0.1 MB (local `gzip -9` of all 41 files: 405,610 →
96,722 B). Re-quantising models (the 2026-10-18 audit's int16-position row) or
meshopt/Draco would save tens of KB on the wire and cost a decoder: **dropped**.

## 2. Ranked plan (bytes × frequency × GPU memory)

| # | Step | Measured win | Who pays today | Risk / gate | Verdict |
|---|---|---|---|---|---|
| 1 | **Voice packs to Ogg Opus 16–20 kbps**, with a decode probe and MP3 fallback | **−30 to −41 % of first-race voice bytes, on the wire and in the JS heap** (§3.1) | Every player, every cold cache: default george + emma + heart, then fable after lights-out ≈ 15.7 MB raw / ~14.2 MB gzip | Safari `decodeAudioData` Opus support is patchy by version and container (§3.1): needs a real-iPhone probe (A·D2) before any pack ships. Regenerate from PCM, never MP3→Opus. Touches `js/audio/voice-pack.js` (not this lane's file) | **Do next**, as its own PR series |
| 2 | Drop `assets/atlases/` from Pages staging (`tools/desktop/stage-files.mjs`) | −15.1 MB of the ~140 MB Pages artifact; 0 B per player | Deploy upload time (the 10-minute Pages deployment timeout, `pages.yml` comment) | None for players; `tests/unit/deploy-staging.test.mjs` pins the allow-list. Outside A·H18's OWNED, so it goes to the orchestrator | **Hand off** (one-line PR) |
| 3 | Music: menu/song2/song5 at 128 kbps | −3.9 MB across the three tracks (menu 3.90 → ~3.12 MB, song2 4.65 → ~3.10, song5 4.76 → ~3.18) | Only while each track streams. The menu track plays every session | The source is Bryce's own MP3s: a 192 → 128 transcode is lossy on lossy, so this is a listening call for Bryce, not an agent | **Ask Bryce** |
| 4 | Pack PNG: lossless re-encode (sharp, zlib 9, adaptive filters) | −0.3 % to −4 % (albedo-256 413,577 → 409,762; normal-256 1,255,621 → 1,206,846; albedo-128 gets *larger*, 144,375 → 144,993) | Boot, once per device | None, but not worth the churn | **Drop** |
| 5 | Pack to lossless WebP (2026-10-18 audit, row 4) | ~20–30 % wire (audit estimate) | — | **Regression**: `_decodeStripBytes` (`js/render/shared/assets.js`, hunt B·H6) inflates the PNG IDAT in JS, so TLX/WGX skip the `readLayerBytes` GPU readback, which was a 3.7 s mid-race hitch on the macOS census (run 39451254370). A WebP strip falls back to `createImageBitmap` and brings that readback back | **Rejected** |
| 6 | Pack to KTX2 / Basis (UASTC/ETC1S) transcoded to ASTC/BC/ETC2 | GPU: phone tier 2.97 MB → ~0.74 MB (ASTC 4×4); desktop 11.9 → ~3.0 MB (§3.2) | GPU residency only. Wire gets *worse*: the Basis transcoder (JS + wasm, a few hundred KB) is larger than the whole 570 KB phone tier | Already rejected and test-pinned (`docs/research/ASSET-API-RESEARCH.md` rollout row 4). A 2.2 MB phone saving is small next to the 26.7 MB garage livery (`PERF-KNOWN-WINS-2026-10-23.md`, #3609) | **Stays rejected.** Reopen only if a census shows the material arrays in the top GPU consumers |
| 7 | Pre-encoded ASTC KTX2 (no transcoder) for WebGPU `texture-compression-astc` / WebGL `WEBGL_compressed_texture_astc`, PNG fallback elsewhere | GPU −2.2 MB on iPhone | — | Needs an offline `astcenc` step and a compressed-array upload path in TLX/GLX/WGX (`js/render/three/**` is shared) and a macOS gpu-census. Wire roughly flat: 17 × 128² × 1 B × 4/3 = 371 KB per strip before gzip | **Park** with #6 |
| 8 | sfx: strip the embedded 300×300 cover-art PNG from `f1_engine.mp3` | −4 KB (485,120 → 481,070) | — | — | **Drop** (noise) |
| 9 | Fonts, stills, icons | Already woff2 Latin subsets (0.13 MB total) and 15–37 KB WebP | — | — | **Nothing to do** |

## 3. Measurements

### 3.1 Voice: Opus vs AAC vs the shipped MP3 (size only)

`scratch/compress/voice-est.mjs <id> <kbps> <n>`: each of the first 150 clips
was cut from the shipped `.bin` by its `.json` offsets and re-encoded with
ffmpeg 6 as a **self-contained** Ogg Opus file (`libopus`, `-application voip`,
mono). That container is what a per-clip `decodeAudioData` slice needs: each
clip carries its own OpusHead/OpusTags, so the per-clip overhead is counted. AAC
used ffmpeg's native encoder at 24 kbps, ADTS. The run measures size only: the
input was the 32 kbps MP3, so the output quality says nothing about a real
render from PCM.

| Pack (150 clips) | Seconds | MP3 32k | Opus 20k | Opus 16k | AAC 24k |
|---|---|---|---|---|---|
| george | 131.0 | 559,464 | 356,860 (63.8 %) | 294,023 (52.6 %) | 437,806 (78.3 %) |
| fable | 126.5 | 541,128 | 341,345 (63.1 %) | — | 419,383 (77.5 %) |

Opus is already entropy-coded, so Pages' gzip takes nothing more from it,
while the MP3 packs gzip about 9.7 %. Wire saving for the default first race:
from ~14.2 MB (gzip) to ~10.0 MB at 20 kbps, or ~8.3 MB at 16 kbps, i.e.
−30 % to −41 %. The decoded-PCM cache (`CACHE_S`) does not change. The retained
`.bin` heap shrinks by the raw ratio: 15.7 MB → 8.3–10 MB on a phone. AAC
saves only ~13 % net of gzip: **not worth a second format**.

Safari is the gate:
- https://caniuse.com/opus: iOS Safari is "partial" for 11–18.3 and "supported" from 18.4, but that covers `<audio>` only.
- https://bugs.webkit.org/show_bug.cgi?id=238546 and https://bugs.webkit.org/show_bug.cgi?id=245428: WebM Opus worked in `<audio>` while `decodeAudioData` failed, the reverse on some iPadOS releases, and still broken on Safari 17.4.

So the runtime must **probe decode, not `canPlayType`**. Decode one tiny
embedded Opus clip through the real `AudioContext` once, choose `<id>.opus.bin`
only when that probe succeeds, and otherwise keep today's MP3 `.bin`. The probe
result goes in `__apex.audio`-style debug output so a Device Farm run can read
it. Container choice (Ogg vs WebM vs CAF) waits on that iPhone probe.

Implementation shape (for the follow-up PRs):
1. `tools/gen/voicepack.mjs`: keep the trimmed WAV per clip in the existing
   cache and encode both MP3 (unchanged) and Opus. The `.json` gains an
   `"opus": {file, sha256, bytes, clips}` block with its own offsets, so old
   readers ignore it. Every pack is re-rendered from Kokoro PCM, not transcoded.
2. `js/audio/voice-pack.js`: the decode probe plus the format pick. That file
   belongs to the audio lane, so the change is agreed on the bus first.
3. iPhone before/after through A·D2: probe verdict, bytes fetched and heap.

### 3.2 GPU memory of the material arrays

GLX allocates `texStorage3D(RGBA8, full mip chain, size, size, 17)` per array
(`js/render/glx/glx.js` `createTextureArray`). There are two arrays (albedo +
roughness, normal + AO):

| Tier | Per array | Both arrays | ASTC 4×4 / BC7 (1 B/px) both |
|---|---|---|---|
| `low` 128 (phones) | 17 × 128² × 4 × 4/3 = 1.49 MB | **2.97 MB** | 0.74 MB |
| high 256 | 17 × 256² × 4 × 4/3 = 5.94 MB | **11.9 MB** | 3.0 MB |

### 3.3 Pack PNG re-encode (lossless check)

`scratch/compress/repng.mjs`: sharp decode → raw RGBA → PNG re-encode → decode, with a byte compare.

- Without `effort` the round trip is byte-identical, and the sizes are in row 4.
- Any `effort`/`colours` option makes sharp quantise to a palette. That path is smaller (normal-256 → 328,975) but **not lossless**: the byte compare failed, so it was not used.

## 4. Status of this lane

- This note is the survey deliverable (draft PR).
- Step 1 is the only change worth a game PR. It waits on two things:
  - an iPhone decode probe through A·D2, which needs Bryce's Go in that session;
  - bus agreement with the audio lane on `js/audio/voice-pack.js`.
- Step 2 goes to OrchA, because it is outside OWNED.
- Step 3 goes to Bryce as a listening decision.
- No texture-format change is proposed, so no gpu-census is needed for this PR.
