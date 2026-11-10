# Apex 26 — desktop (Electron) spike

Installable shell around the static site GitHub Pages ships (three.js on
WebGPU first, WebGL2 fallback). The game keeps its no-build-step IIFE modules;
`npm run stage` runs `tools/desktop/stage.mjs`, the same stager and allow-list
the Pages deploy runs, then Electron serves the result over a privileged
`app://apex/` origin.

**Same bytes as Pages — only with root deps.** The stage minifies `js/` with
terser from the REPO ROOT's `node_modules`. Without a root `npm ci` a pull
request or local stage ships `js/` unminified and logs a `::warning::`; a
release build (`APEX_RELEASE_BUILD=1`, a tag, or any non-PR GitHub Actions
event) fails instead (`tools/desktop/minify.mjs` `unminifiedPolicy`). The
version stamp is this checkout's commit count, as on Pages.

**Never released.** No Windows or macOS pack, installer or release build has
ever run (every desktop CI run to date was an Ubuntu pull-request pack-smoke).

**Pinned runtime:** Electron **44.10.2** (Chromium 152.0.7977.169, Node
24.22.2; released 2026-11-03). It clears GHSA-x562-297c-g43g (fixed in 44.5.0)
and GHSA-jr5w-w6x2-84p9 (fixed in 44.9.1). Re-run `npm audit` in `desktop/`
before any release; stay on the newest patch of the pinned major.

## Why electron-builder (not Electron Forge)

Forge shines when you have a bundler pipeline (Webpack/Vite) and want its
plugin ecosystem. This game has **no bundler** — packaging only needs to
(1) copy the staged site into `extraResources` and (2) emit unsigned
Windows / macOS / Linux artifacts. electron-builder does that from
`desktop/electron-builder.config.cjs`, without introducing a
game build step. Signing, notarization, and auto-update stay out of
scope (`identity: null`, `signAndEditExecutable: false`).

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

1. Sync `package.json` version from `version.json` → `1.0.<build>` (`apexVersion`)
2. Stage via `node tools/desktop/stage.mjs --out desktop/dist-site --stamp`
3. Launch Electron with `app://apex/` → staged `index.html`

Builder config lives in `desktop/electron-builder.config.cjs` (appId/productName
from `desktop/lib/identity.cjs`). Release `npm run pack` / `dist:*` keep
`EnableNodeCliInspectArguments` and `grantFileProtocolExtraPrivileges` **off**.
`npm run pack:test` (inspect on). Soft-GL and `no-sandbox` are env opt-ins
(`APEX_DESKTOP_SOFT_GL`, `APEX_DESKTOP_NO_SANDBOX`) for an **unpackaged** run
only (`npm start`, `npm run smoke`) — never implied by `CI=`. A packaged build
(`app.isPackaged`) ignores them and logs that it did (`lib/debug-flags.cjs`);
the packaged Playwright suite passes the same Chromium switches as argv.

## What is and is not protected

Builds are **unsigned** (`identity: null`, `signAndEditExecutable: false`) and
have **no update channel** (`publish: null`): a player gets a fix only by
downloading a new installer by hand.

Fuses flipped at pack time (Electron 44 fuses; none needs a certificate):

| Fuse | Setting | Effect |
| --- | --- | --- |
| `runAsNode` | off | `ELECTRON_RUN_AS_NODE` cannot turn the app into a Node runtime |
| `nodeOptions` | off | `NODE_OPTIONS` / `NODE_EXTRA_CA_CERTS` ignored |
| `nodeCliInspect` | off (on in `pack:test` only) | `--inspect*` and `SIGUSR1` ignored |
| `onlyLoadAppFromAsar` | on | app code loads only from `app.asar` |
| `embeddedAsarIntegrityValidation` | on | macOS + Windows: `app.asar` whose header hash does not match the hash embedded at pack time is refused. Linux: not supported, no effect |
| `grantFileProtocolExtraPrivileges` | off | `file://` gets no extra privileges (the game uses `app://`) |
| `cookieEncryption` | on | cookies encrypted with the OS key store (macOS needs a signed app for the Keychain; unsigned it is untested) |

What this does **not** protect: without code signing, nothing verifies the
binary itself. Someone who can write to the install folder can flip the fuses
back, edit the embedded asar hash (Info.plist on macOS, an exe resource on
Windows) or replace the executable. The staged site in `resources/site/` is
outside the asar and is **not** integrity-checked on any OS. Windows
SmartScreen and macOS Gatekeeper will warn on (or, on macOS, block) these
unsigned downloads. The fuses stop ambient misuse (an environment variable, a
command-line flag, a stray `app/` folder); they are not tamper-proofing.

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
- Soft-GL / CI (explicit `APEX_DESKTOP_SOFT_GL=1`; `CI=true` alone does not enable it): ANGLE SwiftShader
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

Artifacts land in `desktop/dist/`. They are **unsigned** (see §What is and is
not protected).

## CI

`.github/workflows/desktop.yml` — PR **pack-smoke** (path-filtered to
`desktop/**`, `tools/desktop/**`, and the workflow file) plus
**workflow_dispatch** / tags matching `desktop-v*` for full installers. It does
**not** run on ordinary `js/` / `css/` PRs, on push to the ship branch, or on
the Pages release train.

## Native flag

`preload.js` exposes `window.__APEX_NATIVE__ = { desktop: true, … }`. The game
uses it to skip service-worker registration and to disable Spotify OAuth
(redirect URI is `location.origin + pathname`, which is `app://…` and will not
match a Spotify dashboard entry).

## Trademark / store notes

Do not add F1 / FIA marks to installer metadata beyond what the game already
shows. Store listings (itch.io, etc.) need a separate IP review — flagged in
the PR, not solved here.
