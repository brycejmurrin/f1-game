# App packaging

Sideload / desktop shells around the **same stamped site** the Pages train
publishes. There is no second copy of gameplay code.

- Desktop (Electron): `desktop/` — see that folder’s README.
- Android (Capacitor, this section): `mobile/`.

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
file. `server.url` must never ship (live-reload).

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
`agent/apex.js`). Android WebView commonly ignores that. `NativeDownload`
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
