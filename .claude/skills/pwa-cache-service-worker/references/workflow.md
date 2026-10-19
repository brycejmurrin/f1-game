# PWA / service-worker workflow and mistakes

Load this when adding a DEFERRED file, debugging a stale install, or a
Playwright hang after a mid-run `version.json` bump.

## Contents

- Workflow
- Common mistakes
- Trace: "WGX/TLX not available offline after install"
- Diagnose: players still get the old shell until hard-refresh

## Workflow

1. **Identify what changed.**
   - New tagged `<script>` / `<link>` in `index.html` → picked up automatically
     on next install. Committed tags stay `?v=dev`; the deploy stamps content
     hashes. Do **not** hand-bump numeric `?v=N`.
   - New file with **no tag** (DEFERRED backend, font, on-demand vendor) →
     update `tools/manifest.cjs` `DEFERRED`, then `node tools/gen/gen-shell.mjs`
     (writes `js/roster.js` and the `sw.js` optional seed).
     `tests/unit/load-order.test.mjs` asserts the generated blocks match.

2. **Edit `sw.js` carefully.**
   - Keep essential vs optional — never promote DEFERRED/vendor to essential
     unless every user loads it on first paint.
   - Preserve network-first for navigate + `version.json`.
   - Do not cache cross-origin or blob requests.

3. **Sync the DEFERRED triple** (`tools/manifest.cjs` → `js/roster.js` → `sw.js` optional seed; step 1's `gen-shell.mjs` writes the last two), then:
   ```sh
   npm run test:tooling-fast
   ```

4. **Shell sync (not a numeric bump).**
   ```sh
   node tools/gen/gen-shell.mjs --check
   # after a tools/manifest.cjs change:
   node tools/gen/gen-shell.mjs
   ```
   Tags in the committed shell read `?v=dev`. `bump-cache --apply` refuses on
   this repo. `version.json` is a generated file (the edit hook blocks a hand edit).
   **Never deploy during a Playwright run:** the shell guard compares the page's
   `<meta name="apex-build">` with a no-store `version.json`, and a newer build
   reloads every open page mid-test (timeouts).

5. **Test offline behaviour.**
   ```sh
   npm run test:service-worker
   ```
   Manual: install PWA, go offline, reload — shell and tagged assets should
   serve from `apex26-{build}`.

6. **Pre-push.** `node tools/ci/pick-tests.mjs` routes `sw.js`, `manifest.json` and
   `index.html` to `service-worker`; a generated-roster-only edit (`js/roster.js`)
   that touches precache discovery is not routed there, so run
   `npm run test:service-worker` yourself.

## Common mistakes

- Hand-maintaining a precache manifest parallel to `index.html`.
- Hand-bumping numeric `?v=N` or only `version.json`.
- **Stale pause menu after deploy** — pause/settings DOM is inline in
  `index.html` (not `?v=` JS). If buttons/layout are old while in-race HUD
  updated, the installed shell did not reload.
- Adding a DEFERRED file to `index.html` — breaks the opt-in load model.
- Forgetting the `sw.js` optional entry — first TLX/WGX boot misses cache.
- Promoting vendor/fonts to essential — the install fails on one unreachable
  optional path (GLX is required; TLX/vendor are critical optional dependencies).
- Judging "still stale" from the committed `version.json` / `apex-build` meta — the deploy
  restamps both (`2000 + commit count`); read the LIVE shell's `apex-sha` meta (`tools/ci/pages-live-sha.sh`,
  **deploy-research**), and remember the guard reloads once per session per build
  (`apex26.shellReloadedTo`), so clear it in a retest.
- Expecting the SW to cache Jolpica/OpenF1 — same-origin guard blocks it.
- Caching `blob:` music URLs — throws or breaks playback.
- Expecting `test:service-worker` to catch DEFERRED drift — it does not; the
  seed is pinned by `load-order.test.mjs` ("sw.js seeds every DEFERRED file",
  in `tooling-fast`) and `gen-shell --check`.
- Editing `js/` during an in-flight browser test.

## Trace: "WGX/TLX not available offline after install"

`sw.js` `install`: GLX (`js/render/glx/`) → `required` (aborts install on miss);
everything else in `optional` (WGX, TLX, vendor, fonts) → `stamped` (`?v=<build>`
key for `js/render/{glx,webgpu,three}/` etc.), pooled, misses swallowed and
logged once as `precache: N of M optional assets not cached`. The seed is the
`@gen-shell:sw-optional` block, from `swOptionalFiles()` in `gen-shell.mjs`
(`DEFERRED` + `LAZY_*`). Unit pins: seed presence = `load-order.test.mjs`;
optional-miss tolerance = `service-worker.test.mjs`. Install VM tests also pin GLX promotion and stamped lazy-group keys;
`offline-precache-check.cjs` provides separate native offline boot evidence. Node checks: `node --test tests/unit/load-order.test.mjs`,
`node tools/gen/gen-shell.mjs --check`. Verdict to record: seed present + check
clean = precache list is fine; a remaining miss is a stamping/timeout
(`OPTIONAL_ASSET_MS` 4 s) issue, verified only by the browser check.

## Diagnose: players still get the old shell until hard-refresh

Run in order; stop at the first mismatch. Live URL: https://brycejmurrin.github.io/f1-game/
1. `bash tools/ci/pages-live-sha.sh <url>` = the deployed commit. Not the tip? Pages has not
   published it yet (deploy-research); nothing to fix in the shell.
2. `curl -s <url>/version.json` vs `curl -s <url>/index.html | grep apex-build`: build in
   version.json should be >= the meta. Equal = clients are current; a higher json build
   means the guard should reload them once.
3. Guard fired? In the page, `sessionStorage['apex26.shellReloadedTo']` holds the build it
   already tried; a stale value equal to the live build means one reload was spent (clear it
   to retest). The reload URL gains `?b=<build>`.
4. Registered worker: `navigator.serviceWorker.getRegistration()` → `active.scriptURL` should
   end `sw.js?v=<build>`; the cache `apex26-<build>` should exist.
5. Fixed only by hard-refresh = the navigation came from the HTTP cache or CDN, not the worker
   (hard-refresh skips both): compare `curl -sI <url>/index.html` cache headers, and check the
   guard's `version.json` fetch is `no-store`.
