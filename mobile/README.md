# Apex 26 — Capacitor Android (sideload)

Wraps the site the Pages deploy publishes, staged by the same function
(`stageSiteMinified` in `tools/desktop/stage.mjs`, the one `stage.mjs --out
_site` runs on Pages) and then stamped. Not a second copy of the game. What is
true today:

- `js/` matches the Pages bytes only when terser is installed at the repo root
  (`npm ci`); otherwise a local sync stages it unminified and logs a warning
  (`tools/desktop/minify.mjs` `unminifiedPolicy`).
- Nothing in CI builds `mobile/`: no workflow syncs, assembles or tests an APK,
  and no APK has been built or run on a device by this repo's automation.
- Store listing, signed AAB and CI are later tasks.

## Identity (frozen)

Single source: `lib/identity.json`. `appId` is `io.github.brycejmurrin.apex26`
(placeholder until a Play listing exists — **do not change after first store
release**). `server.androidScheme` is `https` (origin `https://localhost`).
Changing either orphans localStorage / IndexedDB.

`capacitor.config.json` must stay byte-equal on those fields (unit-tested).
Never set `server.url` (live-reload) in the committed config.

## Dev loop

From the repo root:

```sh
node tools/desktop/stage.mjs --out artifacts/site --stamp
node mobile/scripts/sync-web.mjs          # copies into mobile/www + cap sync
# or, unstamped local tags:
node mobile/scripts/sync-web.mjs --dev
```

Then open `mobile/android` in Android Studio, or:

```sh
cd mobile/android && ./gradlew assembleDebug
```

Chrome inspect: `chrome://inspect` against a **debug** APK. Committed config
keeps `webContentsDebuggingEnabled: false`; flip it locally for a sideload
session — do not commit `true`.

`APEX_VERSION_CODE` / `APEX_VERSION_NAME` override Gradle `versionCode` /
`versionName` (defaults `1` / `0.0.0-dev`). Signing reads `APEX_KEYSTORE_PATH`,
`APEX_KEYSTORE_PASSWORD`, `APEX_KEY_ALIAS`, `APEX_KEY_PASSWORD` only when set.

## Regenerated vs committed

`npx cap add android` produced `android/`. Customisations that a re-add would
wipe (keep this list current):

- `AndroidManifest.xml`: INTERNET, VIBRATE, optional CAMERA (`required=false`),
  `usesCleartextTraffic=false`, `fullSensor` orientation (portrait menus exist;
  race still shows `#rotate-device` on the web), `density` in `configChanges`.
- `MainActivity.java`: keep-screen-on + transient immersive system bars.
- Adaptive icons from `icons/icon-512.png` + `icons/icon-maskable-512.png`
  (`node mobile/scripts/gen-icons.mjs`).
- `app/build.gradle`: version + optional env signing.
- `res/xml/file_paths.xml`: the FileProvider exposes ONLY
  `cache/apex26-downloads/v2/` (where `js/core/native-download.js` writes
  exports for the share sheet). A re-add restores Capacitor's template, which
  exposes the whole external storage root (`external-path path="."`).

`www/` and Gradle `build/` are gitignored.

## Plugins without a bundler

The game has no bundler. Native plugins are reached only through
`window.Capacitor.Plugins` (injected by the Capacitor Android runtime). See
`js/core/native-download.js`.
