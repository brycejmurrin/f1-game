# PIXEL TRUTH HUNT 2026-11-09: how many real pixels reach Bryce's iPhone

Kind: measurement · Re-measure-by: 2026-12-15

Bryce: "I really worry our ui aspect resolution pixel density and sizes is inaccurate and we have false
assumptions." This note is the pixel half of that hunt (the layout half is hunt B). Nothing here is copied from a
comment or a doc: every number was read off the running game.

**How it was measured.** Headless Chromium through the chrome-devtools MCP on the working tree at `e808230`, with
an iPhone user agent, viewport 852×393, `devicePixelRatio` 3, touch, and his real settings file
(`tests/data/settings-defaults-export.json`, imported through `SettingsExport.applySettings`). The backend that
booted was three.js WebGPU on a software adapter (`backendState().api = "webgpu"`, `isWebKit`, `liteGpu`).

**What this is not.** It is EMULATION. No real iPhone was reached: BrowserStack Automate refused the session
("Automate testing time expired", the account has no minutes). Safe-area insets and `display-mode: standalone` were
not emulated. Rows that depend only on arithmetic the page does (`canvas.width`, bitmap sizes, image sizes) carry
over to the phone; anything about Safari's own compositor does not, and says so. The one-call check on the real
phone is `__apex.renderScale().effective` over the phone bridge (skill `phone-bridge`).

## The answer in one table

3D view on an 852×393 CSS, DPR 3 phone (panel 2556×1179). Measured: `canvas.width × canvas.height` after each
`setRenderScale`, cross-checked against `__apex.renderScale().effective`.

| RESOLUTION | drawing buffer | of the panel per axis | of the panel's pixels | stretch on screen |
|---|---|---|---|---|
| LOW (his stored value) | 639×295 | 0.25 | 6 % | 4.0× |
| MED (the default since #5166) | 959×443 | 0.375 | 14 % | 2.67× |
| HIGH (the most a phone can ask for) | 1278×590 | 0.50 | 25 % | 2.0× |
| LOW after two crash strikes (`capDpr(1)`) | 426×197 | 0.167 | 3 % | 6.0× |

The HUD and menus are DOM and SVG and draw at the full 2556×1179. That contrast is what he reports: crisp,
large UI over a soft, stair-stepped scene.

## Findings, ranked

### F1. No setting lets a phone draw more than a quarter of its pixels (priority, #5222)

- **Claim.** `js/render/three/tlx.js:1261` said "GRAPHICS: HIGH on a phone restores full DPR"; `js/render/glx/glx.js:31`
  said a capable phone "can opt into the desktop-quality tier (full DPR + MSAA…) via GRAPHICS: HIGH";
  `js/audio/engine.js:116` says `mobileTier` is `IS_MOBILE && !gfxHigh`. The RESOLUTION row's top value is labelled
  HIGH with scale 1.0.
- **Code.** `js/render/shared/glx-facade.js:18` sets `mobileTier: isMobile` unconditionally. `DPR_CAP` is
  `mobileTier ? 1.5 : 2` in all three backends, and `capDpr(n)` (`tlx.js:5077`) can only lower it.
- **Measured.** `backendState()` → `mobileTier: true`; at `setRenderScale(1)` the canvas is 1278×590,
  `dprCap 1.5`, `ofDevice 0.5`. There is also no MSAA on this path (`renderer.samples = 1` under `_liteGpu`); edge
  quality is FXAA at buffer resolution, then the browser's stretch.
- **Kind.** Emulation; the arithmetic is device-independent. Confidence high.
- **Fix.** Not small, and it is a frame-time and memory trade, so it is an issue, not a patch: let RESOLUTION HIGH
  on a phone raise the cap (2.0 gives 1704×786, 44 % of the pixels), gated by the crash sentinel, measured on his
  phone first. This PR corrects the two false comments in `tlx.js` and `glx.js`; `audio/engine.js` is left (its
  conclusion still holds, its premise is stale).

### F2. The stored LOW (639×295) is what his phone draws today (priority; owned by #5205)

- **Measured.** With his export imported, boot gives `resMode "low"`, canvas 639×295, `pxPerCss 0.75`. A 4× stretch.
- **Fix.** PR #5205 (#5198 part 3) migrates an implicit stored LOW to MED. Not touched here. Note that MED is still
  only 14 % of the panel's pixels (F1).

### F3. The circuit picker's hero picture is an 800×450 raster on a 2411-device-pixel box (priority, #5223)

- **Claim.** None found; the stills are generated at one size (`tools/gen/track-stills.mjs`, all 52 files in
  `assets/stills/` are 800×450).
- **Measured.** On the RACE circuit picker `<img src="/assets/stills/bahrain.webp">` has `naturalWidth 800` in an
  803.7×172.4 CSS box: 0.33 source pixels per device pixel, a 3× stretch across the whole width, directly behind
  crisp text. Screenshot confirms the blur.
- **Kind.** Emulation; an image's natural size and CSS box do not depend on the GPU. Confidence high.
- **Fix.** Regenerate the stills at 1600×900 (or ship a `srcset` with a 2× file for DPR ≥ 2). 52 generated assets
  and a GPU render: an issue, not this PR.

### F4. Team crest tiles were a fixed 48 px bitmap (fixed here)

- **Code.** `js/ui/select-screen.js` `teamSwatch`: `c.width = 48; c.height = 48` for a 32 CSS px box.
- **Measured.** Garage TEAM row: 48×48 bitmap in a 32.9 CSS px box at DPR 3 = 0.49 texels per device pixel.
- **Fix (this PR).** `swatchPx(dpr)` = 32 × 1.5 × DPR, clamped 48…128. Re-measured live: 128×128, 1.30 per device
  pixel. Test: `tests/unit/team-swatch-density.test.mjs`.

### F5. The selected livery card stretches a 112×80 bitmap to 144×69 CSS px (#5224; file owned by #5183)

- **Code.** `js/garage/setup-sheet.js:917` `LiveryTex.swatchCanvas(team.id, liv, 112, 80, …)`.
- **Measured.** Garage LIVERY tab: the large card is 112×80 in a 143.9×68.8 CSS box: 0.26 per device pixel, and the
  aspect is wrong too (bitmap 1.40, box 2.09, so the crest is drawn 1.5× too wide). The small cards (39.4×24.2 CSS)
  are 0.95 and fine.
- **Fix.** Size the big card's bitmap from its box and DPR. The file is in PR #5183's diff, so it is an issue.

### F6. Phones below GRAPHICS: HIGH load the 128 px material pack (#5225)

- **Claim.** The brief described the 256 px pack as "restored in #5171". It was restored for GRAPHICS: HIGH only
  (`js/render/shared/assets.js:600` `_phoneBelowHigh`).
- **Measured.** His preset is MEDIUM: `Assets.state()` → `tier: "low"`, 14 layers, 569 858 bytes (the 128 px strip).
  Road layers tile every 2.8–5.5 m, so a texel is 2–4 cm. At a 639-wide buffer this is not the limit; at HIGH it
  starts to be.
- **Fix.** A choice (≈ +1.1 MB): an issue without `priority`.

### F7. Small 2D canvases stop at ratio 3 while CSS zoom pushes them past it (low)

- **Measured.** Minimap 330×330 in 115.5 CSS px (zoom 1.05): 0.95 per device pixel. Circuit preview map 0.92, track
  detail map 0.92, track detail elevation 0.74. All use `min(3, zoom × DPR)`.
- **Verdict.** Deliberate cap, small loss; no change proposed. The elevation strip is the worst of them.

### F8. `effective.buffer` is the render size, not `canvas.width`, when UPSCALE is on (low, doc)

- **Measured.** With `setSpatialUpscale(true)` at scale 0.5 the canvas is 1278×590 while
  `renderScale().effective.buffer` reads `[639,295]`. The hook is right about what is rendered and wrong only if
  read as "the drawing buffer", which is the word its comment uses. With UPSCALE off (his setting) the two agree.

## Assumptions that turned out TRUE (measured)

- `__apex.renderScale().effective` matches `canvas.width/height` at LOW, MED, HIGH and after `capDpr(1)`.
- The canvas CSS box is the whole viewport (852×393) and the buffer follows a rotation: after switching the
  emulated viewport to 393×852 the buffer became 295×639 within 2.5 s, and back again. No stale buffer.
- No `image-rendering: pixelated` on the game canvas (`auto`); only the QR canvases use it. The stretch is the
  browser's smooth filter, not a nearest sampler. (Chromium; Safari's filter was not observed.)
- No 2D canvas multiplies by DPR twice. The input trace settled at exactly 1.00 per device pixel.
- No visible element is drawn through a fractional CSS transform during a race. On the title only the SVG car
  frame is scaled (0.902), and SVG re-rasterises.
- The title car art, the flags and the menu icons are vector: no raster icon is on screen at any size.
- The governor does not move the scale while RESOLUTION is pinned (`auto: false` throughout).
- The crash sentinel is disarmed on `visibilitychange` hidden and on `pagehide`, so leaving the app mid-race
  should not cost a strike (code read, `js/ui/platform-session.js:331,344`; not exercised live).

## Not measured

- Anything on a real iPhone, in Safari or as a Home Screen app.
- The WebGL2 fallback, GLX and WGX at runtime (their DPR line is the same by code read only).
- Shadow map and reflection sizes; the loading card; the results sheet; the Data Hub.
- The garage 3D view: the software renderer never revealed the canvas in the time given. By code
  (`js/garage/setup-camera.js:964`) a phone is held at scale 0.72 there, about 1 buffer pixel per CSS pixel, which is
  a third of the panel per axis even at RESOLUTION HIGH.
