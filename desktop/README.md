# Apex 26 — desktop (Electron) spike

Installable shell around the **same static site** GitHub Pages ships. The game
keeps its no-build-step IIFE modules; packaging stages runtime files, then
Electron serves them over a privileged `app://apex/` origin.

## Why electron-builder (not Electron Forge)

Forge shines when you have a bundler pipeline (Webpack/Vite) and want its
plugin ecosystem. This game has **no bundler** — packaging only needs to
(1) copy the staged site into `extraResources` and (2) emit unsigned
Windows / macOS / Linux artifacts. electron-builder does that with a small
`desktop/package.json` `build` block and a CI matrix, without introducing a
game build step. Signing, notarization, and auto-update are deliberately
out of scope for this spike (`identity: null`, `signAndEditExecutable: false`).

## Prerequisites

- Node ≥ 22 (same as the repo root)
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
```

`npm start` / `npm run smoke` both:

1. Sync `package.json` version from `version.json` → `0.<build>.0`
2. Stage via `node tools/desktop/stage.mjs --out desktop/dist-site --stamp`
3. Launch Electron with `app://apex/` → staged `index.html`

## Package locally

```sh
cd desktop
npm run dist          # host platform
npm run dist:linux    # AppImage + unpacked dir
npm run pack          # unpacked dir only (faster check)
```

Artifacts land in `desktop/dist/`. They are **unsigned**.

## CI

`.github/workflows/desktop.yml` — **workflow_dispatch** and tags matching
`desktop-v*`. It does **not** run on push to the ship branch and does not
touch the Pages release train.

## Native flag

`preload.js` exposes `window.__APEX_NATIVE__ = { desktop: true, … }`. The game
uses it to skip service-worker registration and to disable Spotify OAuth
(redirect URI is `location.origin + pathname`, which is `app://…` and will not
match a Spotify dashboard entry).

## Trademark / store notes

Do not add F1 / FIA marks to installer metadata beyond what the game already
shows. Store listings (itch.io, etc.) need a separate IP review — flagged in
the PR, not solved here.
