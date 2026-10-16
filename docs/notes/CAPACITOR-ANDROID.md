# Capacitor Android research citations (task 45)

Fetched 2026-09-29 while adding `mobile/`. Training-data versions are not
evidence; these URLs were read in-session.

| Topic | URL |
|---|---|
| Capacitor 8 config schema (`minWebViewVersion`, `androidScheme`, `server.url`, SystemBars) | https://capacitorjs.com/docs/config |
| Capacitor 8 Android (minSdk 24, WebView Chrome 60+) | https://capacitorjs.com/docs/android |
| Capacitor 8.0 upgrade (compile/target 36, Gradle 8.14.3, AGP 8.13.0, `density` in configChanges, Node 22+) | https://capacitorjs.com/docs/updating/8-0 |
| SystemBars (bundled with `@capacitor/core`; `insetsHandling: css`) | https://capacitorjs.com/docs/apis/system-bars |
| Filesystem plugin (`writeFile`, `Directory`) | https://capacitorjs.com/docs/apis/filesystem |
| Import maps Chrome 89+ | https://caniuse.com/import-maps |
| MDN `script type=importmap` | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap |
| npm pins used | `@capacitor/{core,cli,android}@8.5.2`, `@capacitor/filesystem@8.1.3`, `@capacitor/share@8.0.2` |

**Plugins without a bundler.** Capacitor’s public plugin docs show ESM
`import { Filesystem } from '@capacitor/filesystem'`. The game has no bundler.
The Android runtime still injects `window.Capacitor` and a `Plugins` proxy for
installed native plugins, which is what `js/core/native-download.js` calls
(`Filesystem.writeFile` / `Share.share` with `directory: "CACHE"`). That path
is **unit-tested with a fake proxy**, not on a device.

Task 10 as planned (`stage-site.sh`) is not in this tree; the merged
Electron spike supplies `tools/desktop/stage.mjs` and that is what
`mobile/scripts/sync-web.mjs` reuses. Task 15 as a `js/core/native.js` module
was missing (Electron used `window.__APEX_NATIVE__` only); this change adds
`Native` plus a Capacitor branch on the existing SW / Spotify gates.
