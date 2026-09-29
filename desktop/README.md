# Apex 26 — desktop (Electron) spike

Installable shell around the **same static site** GitHub Pages ships. The game
keeps its no-build-step IIFE modules; packaging stages runtime files, then
Electron serves them over a privileged `app://apex/` origin.

**Pinned runtime:** Electron **44.4.5** (Chromium 152). v45 is alpha — stay on
stable until a deliberate bump.

## Why electron-builder (not Electron Forge)

Forge shines when you have a bundler pipeline (Webpack/Vite) and want its
plugin ecosystem. This game has **no bundler** — packaging only needs to
(1) copy the staged site into `extraResources` and (2) emit unsigned
Windows / macOS / Linux artifacts. electron-builder does that with a small
`desktop/package.json` `build` block and a CI matrix, without introducing a
game build step. Signing, notarization, and auto-update are deliberately
out of scope for this spike (`identity: null`, `signAndEditExecutable: false`).

Verified locally: Linux `--dir` pack + xvfb / Playwright `_electron` smoke.
Forge config and the full Actions OS matrix are exercised by CI when the PR
touches `desktop/` — treat Win/mac installer shapes as CI-verified when green,
not as a local claim on this box.

## Prerequisites

- Node ≥ 22 (same as the repo root; Electron 44 ships Node 24.x)
- From `desktop/`: `npm install` (Electron + electron-builder only live here)

## Local run

```sh
# from repo root — stage + launch (needs a display, or use smoke under xvfb)
cd desktop
npm install
npm start

# headless smoke (CI / cloud VM): stages, boots under xvfb, exits 0/1
cd desktop && npm install
xvfb-run -a npm run smoke

# Packaged Playwright _electron suite (research B7 / docs/notes/DESKTOP-TEST-PLAN.md)
npm run pack:test
APEX_DESKTOP_SOFT_GL=1 APEX_DESKTOP_NO_SANDBOX=1 xvfb-run -a npm run test:electron
npm run fuses:read
```

`npm start` / `npm run smoke` both:

1. Sync `package.json` version from `version.json` → `0.<build>.0`
2. Stage via `node tools/desktop/stage.mjs --out desktop/dist-site --stamp`
3. Launch Electron with `app://apex/` → staged `index.html`

Release `npm run pack` / `dist:*` keep `EnableNodeCliInspectArguments` and
`grantFileProtocolExtraPrivileges` **off**. Local / CI `_electron` uses
`npm run pack:test` (inspect on). Soft-GL and `no-sandbox` are env opt-ins
(`APEX_DESKTOP_SOFT_GL`, `APEX_DESKTOP_NO_SANDBOX`) — never implied by `CI=`.

## Protocol (`app://apex/`)

`desktop/app-protocol.js` registers a privileged custom scheme and serves the
staged site from disk. **Do not** replace it with bare `net.fetch(file:)` —
that path returns **200 without `Content-Range`** for Range requests
([electron#38749](https://github.com/electron/electron/issues/38749)). The
handler implements Accept-Ranges, **206** (incl. suffix ranges), **416**, MIME
types for game assets (js/mjs/wasm/ktx2/glb/mp3/…), and path-traversal
rejection. Site files live in `extraResources` (real files, not inside asar)
so Range streams work.

`localStorage` / IndexedDB persist under the fixed `app://apex` origin.
Service workers can register if privileged, but **`cache.addAll` fails**
(`Request scheme 'app' is unsupported`) — the game therefore **skips SW
registration** when `__APEX_NATIVE__.desktop` is set, and the scheme keeps
`allowServiceWorkers: false`.

Autoplay needs **no** Chromium CLI flag; `webPreferences.autoplayPolicy` is set
explicitly to `no-user-gesture-required` (Electron’s default).

## Soft GL / WebGPU

- Default (real GPU): no extra WebGPU flags; WebGL2 is the game’s fallback.
- Soft-GL / CI (`APEX_DESKTOP_SOFT_GL=1` or Linux `CI=true`): ANGLE SwiftShader
  + `enable-unsafe-webgpu` so `requestAdapter()` can return a software adapter.
  Without that switch, `requestAdapter()` is `null` on GPU-less boxes.
- Linux Vulkan feature flags (`VulkanFromANGLE`, etc.) were **unverified** in
  the 2026-09-29 probe — not enabled by default.

## Steam — deferred

Steamworks (`steamworks.js` 0.4.0) is **out of scope** for this spike:

- Unmaintained for packaging purposes (npm latest 2024; stewardship issues open).
- No Windows/Linux **arm64** binaries in the published package.
- Overlay unreliable on Linux / macOS; Steam Input gamepad regressions
  ([electron#45732](https://github.com/electron/electron/issues/45732)).
- Would force `asarUnpack` / redistributable `.dll`/`.so` layout and a narrower
  IPC surface (avoid `nodeIntegration: true`).

Revisit only after a maintained binding and a signed Steam depot plan exist.

## Package locally

```sh
cd desktop
npm run dist          # host platform
npm run dist:linux    # AppImage + unpacked dir
npm run pack          # unpacked dir only (faster check)
```

Artifacts land in `desktop/dist/`. They are **unsigned**.

## CI

`.github/workflows/desktop.yml` — PR **pack-smoke** (path-filtered) plus
**workflow_dispatch** / tags matching `desktop-v*` for full installers. It does
**not** run on push to the ship branch and does not touch the Pages release
train.

## Native flag

`preload.js` exposes `window.__APEX_NATIVE__ = { desktop: true, … }`. The game
uses it to skip service-worker registration and to disable Spotify OAuth
(redirect URI is `location.origin + pathname`, which is `app://…` and will not
match a Spotify dashboard entry).

## Trademark / store notes

Do not add F1 / FIA marks to installer metadata beyond what the game already
shows. Store listings (itch.io, etc.) need a separate IP review — flagged in
the PR, not solved here.
