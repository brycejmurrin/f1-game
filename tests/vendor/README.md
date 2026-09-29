# tests/vendor/

Pinned third-party scripts used only by Playwright / unit tests. **Never ship
these on the production page** (index.html must not reference `tests/vendor/`).

## iwer-2.5.0.min.js

Pinned Meta Immersive Web Emulation Runtime (IWER) for Playwright XR specs.

- **Version:** 2.5.0
- **License:** MIT (IWER) — see upstream LICENSE. The UMD build also embeds
  code under **Apache-2.0** (notably `webxr-layers-polyfill` / related helpers
  inside the min bundle). Both licenses apply to this vendored file; keep the
  SPDX attributions if you re-copy from npm.
- **Source:** `node_modules/iwer/build/iwer.min.js` after `npm i iwer@2.5.0`
- **Docs:** https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html
- **Repo:** https://github.com/meta-quest/immersive-web-emulation-runtime

Specs inject it via Playwright `page.addInitScript({ path })` before Apex
boots, then call
`new XRDevice(metaQuest3).installRuntime({ forceInstall: true })`.
`forceInstall` is mandatory under headless Chromium (stub `navigator.xr`).
Set `device.stereoEnabled = true` so the right eye is non-zero width.

Do **not** use the Chrome Web Store “Immersive Web Emulator” extension on
Chrome 147+ (three.js #33414); use this pinned IWER instead.

Upgrade: bump the npm dep, re-copy the min build, rename this file, update
`tests/helpers/iwer-install.mjs` and the unit canary that asserts the path.
