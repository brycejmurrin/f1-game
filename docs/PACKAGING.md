# Apex 26 — packaging

Native wrappers around the **same staged site** GitHub Pages publishes.
There is no second gameplay codebase and no build step for the game itself.

- Desktop (Electron): `desktop/` — this document’s first section, plus that
  folder’s README.
- Android (Capacitor): `mobile/` — the Android section below.

Task 10's shared stage scripts already live in `tools/desktop/`. The Electron
spike (PR #422) shipped `desktop/main.js`, `app-protocol.js`, `preload.js`,
`tools/desktop/stage.mjs`, and `.github/workflows/desktop.yml`. This document
records **desktop packaging + icons** and the **Android sideload APK** path.

## Desktop (electron-builder 26)

**Do not change `appId` (`io.github.brycejmurrin.apex26`) or `productName`
(`Apex 26`).** Those identifiers plus the `app://apex/` origin are frozen:
changing them orphans localStorage / IndexedDB / `userData` (career, garage,
music). Single source: `desktop/lib/identity.cjs`. **Known gap closed for
career:** if a wrapper origin / app-id change does wipe the buckets, the player
can restore via CAREER BACKUP (`js/career/career-backup.js` — EXPORT / IMPORT
on the slot cards; format `apex26-career-backup-v1`). Garage / music still have
no equivalent dump.

### Version

- `desktop/package.json` field `apexVersion` is MAJOR.MINOR (`1.0`).
- PATCH is the stamped `version.json` `build` → app version `1.0.<build>`.
- `node desktop/scripts/set-version.mjs` writes `package.json` `version` before pack.
- To bump MAJOR.MINOR, edit `apexVersion` only.

The merged spike used `0.<build>.0`; this packaging pass switched to the
plan's `1.0.<build>` form. `pack:test` / Playwright `_electron` still work;
they now assert `1.0.${build}`.

### Commands (from `desktop/`)

```sh
npm install
npm run stage          # tools/desktop/stage.mjs → desktop/dist-site --stamp
npm run icons          # regenerate from icons/icon-512.png (committed already)
npm run set-version    # 1.0.<build>
npm run pack           # electron-builder --dir (unpacked, this host)
npm run dist:linux     # AppImage + .deb
npm run dist:win       # NSIS .exe x64 (CI / Windows host)
npm run dist:mac       # .dmg + .zip arm64+x64 (macOS host)
```

`npm run pack:test` is the CI smoke pack: same as `pack` but with
`EnableNodeCliInspectArguments` on so Playwright `_electron` can attach.

Override the staged tree with `APEX_SITE_DIR=/abs/path` (must contain
`version.json`). Default is `desktop/dist-site`.

Artifacts land in `desktop/dist/` (gitignored). **Unsigned.** Uninstall does
**not** delete app data (`nsis.deleteAppDataOnUninstall: false`).

### Artifact names

| OS | File |
|---|---|
| Windows NSIS | `Apex26-Setup-<version>-x64.exe` |
| macOS | `Apex26-<version>-<arch>.dmg` and `.zip` |
| Linux | `Apex26-<version>-<arch>.AppImage` and `.deb` |

Installer size is measured in the desktop CI workflow (task 30 / existing
`desktop.yml` release-build). Record numbers here when a tag/dispatch run
produces them — **not measured on cloud VMs**.

### Icons

Repo art is 512×512 (`icons/icon-512.png`). There is **no 1024 master**.
`desktop/scripts/make-icons.mjs` upscales to `desktop/build/icon-1024-PLACEHOLDER.png`
with a visible banner. Human: supply a 1024+ PNG/SVG master later.

### Notices

`desktop/scripts/notices.mjs` concatenates in-tree CREDITS/LICENSE files into
`desktop/build/THIRD-PARTY-NOTICES.txt` (generated, gitignored). Root
`package.json` is `UNLICENSED` — the game's own licence text is a human
decision and is not invented here.

### Out of scope here (desktop)

Signing, notarization, auto-update, GitHub Releases, tags, secrets, store
listings. No new workflow in this pass (`desktop.yml` already exists from the
spike).

### Task 25 notes

Adapted from plan 25 because task 20's `desktop/lib/identity.cjs` was **not**
in the merged spike: identity was inlined in `desktop/package.json` `build`.
This pass extracted `lib/identity.cjs` and moved the builder block to
`desktop/electron-builder.config.cjs` so `pack:test` CLI fuse overrides still
work.

## Android

Sideloadable **debug APK** path only. No Play listing, no signed AAB, no CI
workflow in this change (those are later tasks). Never treat unit tests as
device evidence.

### Identity (frozen)

| Field | Value | Source |
|---|---|---|
| `appId` | `io.github.brycejmurrin.apex26` | `mobile/lib/identity.json` |
| `appName` | Apex 26 | same |
| Android WebView origin | `https://localhost` | `server.androidScheme: "https"` (Capacitor default host `localhost`) |

Changing `appId` or `androidScheme` after a player has saves **orphans**
localStorage and IndexedDB. Tests pin the committed config to the identity
file. `server.url` must never ship (live-reload). Career saves can be restored
from a CAREER BACKUP file (`CareerBackup` / slot-card EXPORT·IMPORT); garage
and music still cannot.

### Dev loop

```sh
node tools/desktop/stage.mjs --out artifacts/site --stamp
node mobile/scripts/sync-web.mjs
cd mobile/android && ./gradlew assembleDebug
```

`sync-web.mjs` copies the stamped tree into `mobile/www` (Capacitor `webDir`)
and runs `npx cap sync android`. It **reuses** `tools/desktop/stage.mjs` (the
Electron/Pages stager). Unstamped `?v=dev` output is refused unless `--dev`.

Inspect a debug APK with `chrome://inspect`. Committed
`webContentsDebuggingEnabled` is `false`; flip locally, do not commit `true`.

Version: `APEX_VERSION_CODE` / `APEX_VERSION_NAME` (defaults `1` /
`0.0.0-dev`). Signing: `APEX_KEYSTORE_*` env only — no keystore in git.

### Customisations (lost if you re-run `npx cap add android`)

Documented in `mobile/README.md`: INTERNET + optional CAMERA, cleartext off,
`fullSensor` (portrait **menus** exist on the web; `#rotate-device` still
blocks a portrait race — landscape-only would fight that UI), immersive
keep-screen-on `MainActivity`, adaptive icons from `icons/icon-512.png` +
`icons/icon-maskable-512.png`.

`minWebViewVersion` is **100**. Import maps need Chromium 89+
([caniuse import-maps](https://caniuse.com/import-maps),
[MDN importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap));
100 is a comfortable floor above that and above Capacitor’s default 60
([config](https://capacitorjs.com/docs/config)).

SystemBars `insetsHandling: "css"` is bundled with `@capacitor/core` 8
([SystemBars](https://capacitorjs.com/docs/apis/system-bars)).

### Blob downloads and camera

Export buttons use `URL.createObjectURL` + `<a download>` (`settings-export.js`,
`results-sheet.js`, `driving-coach.js`, `data/export.js`, `select-screen.js`,
`agent/apex.js`, `career/career-backup.js`). Android WebView commonly ignores that. `NativeDownload`
intercepts those clicks when `Native.platform()` is `android`/`ios` **and**
`window.Capacitor.Plugins.Filesystem` + `Share` exist (no bundler — Capacitor
injects the Plugins proxy). Writes `Directory.CACHE` (`"CACHE"`) then Share.

QR join (`js/net/scan.js`) uses `getUserMedia`. The manifest has `CAMERA` with
`required=false`. Join-by-code still works if the WebView denies the camera.
**Not verified on a device.**

Spotify OAuth is off on any native shell (same as Electron): redirect URI
cannot be `https://localhost`.

Service worker registration is skipped when Capacitor reports native (an SW
*could* register on `https://localhost` and would double-cache packaged files).

### Android WebView unknowns

Every row is **Not verified** on a physical device or emulator in this change.
Do not treat a Node unit test as device evidence.

| Unknown | Why it matters | Status |
|---|---|---|
| Wake Lock API | `js/game.js` requests a screen wake lock; WebView support is uneven | **Not verified.** Native fallback: `FLAG_KEEP_SCREEN_ON` in `MainActivity` (always on while resumed). |
| Gamepad API | Bluetooth pads via `js/input/input.js` | **Not verified.** |
| Blob `<a download>` | Settings/coach/data export | **Not verified** in WebView. Shim `NativeDownload` is unit-tested against a fake `Capacitor.Plugins` proxy only. |
| CORS from `https://localhost` | Jolpica, OpenF1, Metered TURN (`js/net/transport.js`) | **Not verified.** CapacitorHttp is **not** enabled globally. |
| Camera / `getUserMedia` QR | `js/net/scan.js` | **Not verified.** `CAMERA` is optional in the manifest; code join remains. |
| `screen.orientation` lock | Race overlay vs menus | **Not verified.** Manifest uses `fullSensor` because portrait menus exist. |
| Fullscreen / system bars / insets | `#pm-fullscreen`, safe-area CSS | **Not verified.** SystemBars `insetsHandling: css`; MainActivity hides bars with transient swipe. |
| DeviceOrientation permission | Tilt steer | **Not verified.** |
| WebGL perf on low-end GPUs | 60 fps landscape | **Not verified.** |

Manual matrix (human): boot, canvas, `__apex.info()`, save survives restart,
touch/tilt, a paired gamepad, export share sheet, QR grant/deny, Jolpica
schedule fetch, TURN + a same-build web peer, chrome://inspect.

### What this VM did not run

`./gradlew assembleDebug` only if an Android SDK exists. Cloud agents often
lack the SDK and may not download Gradle — **Not run** unless the log says
otherwise. No emulator, no device.
