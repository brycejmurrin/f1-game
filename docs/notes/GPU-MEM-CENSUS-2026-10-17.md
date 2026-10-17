# GPU memory census and memory research, 2026-10-17

Tool: `node tools/gfx/gpu-mem-census.mjs [track] [--mobile]` (this note's evidence). Companion to the pass census (draws and triangles per pass, PR #2699) and
`docs/notes/PERF-RESEARCH-2026-10-17.md` §9c (what an iPhone allows). Counts only: no GPU or phone number.

## What the tool counts

Bytes the game ASKED the GL for, computed from the wrapped allocation calls (`texStorage2D/3D`, `texImage2D/3D`, `renderbufferStorage[Multisample]`,
`bufferData`) with a bytes-per-texel table and the full mip chain, minus the matching `delete*` calls. The wrap is installed before the page boots, so startup
allocations are included. It is NOT the driver's resident set (padding, tiling, the drawing buffer and the OS compositor surfaces are not counted), and
compressed uploads are not tracked because the game makes none.

First run reported a 125 MB "6408x5121" texture. That was the probe, not the game: `6408` and `5121` are the GL enums `RGBA` and `UNSIGNED_BYTE` in the
six-argument `texImage2D(target, level, internalformat, format, type, source)` form. The size of a DOM-source upload is now read from the source.

## Monaco, after boot and 60 warm frames, links stubbed

| | desktop tier | phone tier (`--mobile`) |
|---|---|---|
| textures | 64.5 MB in 57 objects | 25.2 MB in 51 |
| renderbuffers | 5.0 MB | 0 |
| buffers | 37.2 MB in 1,332 | 31.7 MB in 1,208 |
| **total** | **106.6 MB** | **56.9 MB** |

Phone tier by format: `RGBA8` 2D 12.9 MB (28 textures, biggest 1.67 MB), depth `DEPTH_COMPONENT24` 4.9 MB (the 1024x1024 sun-shadow depth is 4 MB of it),
`RGBA16F` 2.7 MB (the 640x360 scene colour is 1.76 MB), the material texture arrays 2.4 MB (128x128x17, two of them), `R8` 1.1 MB, the rest under 1 MB each.
Desktop adds a 1024x1280 and a 1024x1024 `RGBA8` (6.7 and 5.3 MB), 256x256x17 arrays (4.8 MB each) and the MSAA `RGBA16F` renderbuffer (2.9 MB).

## Reading

- **GPU-resident memory is small on the phone tier: about 57 MB asked for, against a WebContent budget of roughly 1.0–1.5 GB on current iPhones** (a single
  reporter's figure, see below). The JS heap after GC is 140–150 MB in the same scene (`docs/notes/PERF-HUNT-SESSION-MEMORY-2026-10-17.md`), so on the
  numbers we have, the heap, not GPU textures, is the larger share of what the game owns. Texture compression (ASTC is exposed on 99.96 % of iOS
  reports, web3dsurvey) could shrink the 12.9 MB of `RGBA8` by about 4x at best: roughly 10 MB. That is not a lever worth a build step; it stays in
  `PERF-RESEARCH` §3 as not-to-do.
- **The two things that would move the total are not textures.** The 1,208–1,332 separate GL buffers (31–37 MB, ~26 KB each) are chunk and prop geometry;
  index LOD for distant chunks and the mirror pass (#2657) shrinks triangle counts, and a merge (#2643) shrinks the object count, but the bytes only drop
  if the merged geometry is smaller. The 1024x1024 sun-shadow depth is 4 MB, the biggest single phone-tier allocation (see `PERF-RESEARCH` §2 item 2, depth-only shadow target).
- **Not claimed:** compositor backing stores, the drawing buffer, ANGLE-Metal's own copies, anything async that loads after 60 frames (the baked model
  pack), or a number from a real iPhone. The census says the game does not ask for much; it cannot say what iOS bills the process.

## What the web research added (2026-10-17, TinyFish and Context7)

| finding | source | status for us |
|---|---|---|
| A single EmulatorJS report (iOS 18.7, Safari 26.5, 2026-05-25): WebContent killed by Jetsam `per-process-limit` after 60–90 s on a locked-60 Hz WebGL canvas; JS, WASM and JIT flat, the "page" memory category in Web Inspector grew about 14 MB/s (one framebuffer per frame), billed to a ~1.0–1.5 GB limit | https://github.com/EmulatorJS/EmulatorJS/issues/1220 | One reporter, hypothesis only (the issue is closed as a duplicate of an open one and no WebKit bug is filed). It is the failure mode a 10-minute phone soak would catch: put "Web Inspector Timeline → Memory, watch the page category, 10 min" in `PERF-RESEARCH` §4 B |
| Resizing an on-screen WebGL canvas leaked memory on iOS Safari (iPad Air 3, iOS 14.2: 300 MB to 1.25 GB, then killed); fixed in iOS 14.3, duplicate of WebKit bug 217212 | https://bugs.webkit.org/show_bug.cgi?id=219780 | Historical and fixed. Do NOT cite it as a reason against render-scale changes; #2655's reallocation count (77 per Monza sweep) is the live concern |
| WebKit refuses canvas allocations over 16,777,216 pixels per canvas, and over a total canvas-memory ceiling (384–576 MB in 2019 reports) | https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ and https://bugs.webkit.org/show_bug.cgi?id=195325 | 2D-canvas facing, years old. Our largest canvas at phone size is orders below it. Noted so nobody chases it |
| MDN WebGL best practices (page dated 2026-10-07): prefer `texStorage` (some drivers allocate a full mip chain with `texImage`), `invalidateFramebuffer` on tile GPUs, depth+stencil round up to 4 bytes, mipmaps cost ~30 %, `alpha:false` can be costly, size a per-pixel VRAM budget | https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices | Covered or not ours: `invalidateFramebuffer` is in `PERF-RESEARCH` §2 item 2; TLX requests `alpha:false` and `stencil:false`, but three's WebGL backend hardcodes `alpha: !0` (comments in `js/render/three/tlx.js`). Whether three allocates through `texStorage` was not checked here. The per-pixel VRAM budget is a method we could adopt for a render-scale ceiling, not a change |
| Apple A15 and later offer lossy texture compression through Metal (50 % off uncompressed textures); not exposed to WebGL or WebGPU | https://www.ludicon.com/castano/blog/2026/01/choosing-texture-formats-for-webgpu-applications/ | Not reachable from the web; nothing to do |

## Not run

Other circuits (the chunk and buffer counts scale with the circuit), `--real-link` (programs are stubbed, so no program or shader memory is counted),
a phone viewport (844x390), a 10-minute soak (the growth question the census cannot answer), and any real-device reading. One run per tier, no spread claimed.
