# tests/vendor/iwer-2.5.0.min.js

Pinned Meta Immersive Web Emulation Runtime (IWER) for Playwright XR specs.

- **Version:** 2.5.0 (MIT)
- **Source:** `node_modules/iwer/build/iwer.min.js` after `npm i iwer@2.5.0`
- **Docs:** https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html
- **Repo:** https://github.com/meta-quest/immersive-web-emulation-runtime

**Never ship this on the production page.** Specs inject it via Playwright
`page.addInitScript({ path })` before Apex boots, then call
`new XRDevice(metaQuest3).installRuntime({ forceInstall: true })`.
`forceInstall` is mandatory under headless Chromium (stub `navigator.xr`).

Upgrade: bump the npm dep, re-copy the min build, rename this file, update
`tests/helpers/iwer-install.mjs` and the unit canary that asserts the path.
