# PWA / service-worker workflow and mistakes

Load this when adding a DEFERRED file, debugging a stale install, or a
Playwright hang after a mid-run version bump.

## Workflow

1. **Identify what changed.**
   - New tagged `<script>`/`<link>` in `index.html` → picked up automatically
     on next install; still bump `?v=N` + `version.json`.
   - New file with **no tag** (DEFERRED backend, font, on-demand vendor) →
     update `tools/manifest.cjs` `DEFERRED`, then `node tools/gen/gen-shell.mjs`
     (it writes `js/roster.js` and the `sw.js` optional seed).
     `tests/unit/load-order.test.mjs` asserts the generated blocks match.

2. **Edit `sw.js` carefully.**
   - Keep essential vs optional — never promote DEFERRED/vendor to essential
     unless every user loads it on first paint.
   - Preserve network-first for navigate + `version.json`.
   - Do not cache cross-origin or blob requests.

3. **Sync the DEFERRED triple**, then:
   ```sh
   npm run test:tooling-fast
   ```

4. **Bump version last** (`node tools/gen/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`)). Verify one uniform N:
   ```sh
   grep -o '?v=[0-9]\+' index.html | sort -u && cat version.json
   ```

5. **Test offline behaviour.**
   ```sh
   npm run test:service-worker
   ```
   Manual: install PWA, go offline, reload — shell and tagged assets should
   serve from `apex26-{N}`.

6. **Pre-push.** `sw.js` edits: `pick-tests` routes to `service-worker`.
   Shell/cache-bust only (`index.html` / `version.json`): also run
   `npm run test:service-worker` manually — pick-tests routes those paths to
   `tooling-fast`, not `service-worker`.

## Common mistakes

- Hand-maintaining a precache manifest parallel to `index.html`.
- Bumping only `?v=N` or only `version.json`.
- **Bumping `version.json` mid Playwright run** — shell guard reloads every
  open page → timeouts.
- **Stale pause menu after deploy** — pause/settings DOM is inline in
  `index.html` (not `?v=` JS). If buttons/layout are old while in-race HUD
  updated, the installed shell did not reload.
- Adding a DEFERRED file to `index.html` — breaks the opt-in load model.
- Forgetting the `sw.js` optional entry — first TLX/WGX boot misses cache.
- Promoting vendor/fonts to essential — GLX-only install fails on an
  unreachable optional path.
- Expecting the SW to cache Jolpica/OpenF1 — same-origin guard blocks it.
- Caching `blob:` music URLs — throws or breaks playback.
- Running `test:service-worker` before fixing load-order — DEFERRED drift
  fails both.
- Editing `js/` during an in-flight browser test.
