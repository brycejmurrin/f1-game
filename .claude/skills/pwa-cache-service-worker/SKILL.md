---
name: pwa-cache-service-worker
description: Use when editing sw.js, version.json, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache, or Playwright failures caused by bumping version.json mid-run in Apex 26.
---

# PWA cache and service worker

Apex 26 ships as a static site with a hand-written service worker (`sw.js`) and
no build step. Caching strategy: discover essentials from `index.html`, embed
build number in the cache name, network-first for the shell guard, cache-first
for immutable `?v=N` assets.

## Overview

**Precache discovery.** On install, `sw.js` fetches `index.html` and parses
every `<script src>` and `<link rel="stylesheet">` tag into the **essential**
set (plus `./`, `index.html`, `version.json`). Cross-origin URLs are skipped.
Metadata/icons from other `<link>` tags go to **optional**.

**Optional seed.** Files the tag parser cannot see are listed explicitly in
`sw.js`'s `optional` Set: **DEFERRED** renderer backends (WGX/TLX +
`vendor/three-0.184.0`), dynamic-import vendors (jsQR, Trystero), and
self-hosted fonts from `css/tokens.css`. GLX-only users must not fail install
over ~1 MB they never fetch.

**Cache name.** `apex26-{build}` where `{build}` comes from `version.json`.
Every bump starts a fresh generation; `activate` deletes older `apex26-*` keys
once install completes.

**Fetch strategies.**
- **Network-first:** navigation requests and `version.json` (shell version guard
  in `index.html` must always see the latest build when online; 3 s timeout → cache).
- **Cache-first:** everything else — `?v=N` URLs are immutable by convention.

**Install failure modes.** Any **essential** 404 aborts install. **Optional**
failures are swallowed — install still succeeds.

**Version coupling.** Always bump **`?v=N` in `index.html` AND `version.json`
together** — see **`bump-cache`**. Never bump `version.json` during a Playwright
run: the shell guard force-reloads open pages mid-spec.

**Adding a DEFERRED file** (no `<script>` tag): register in **`tools/manifest.cjs`
`DEFERRED`**, mirror in **`js/game.js` `BACKEND_FILES`**, seed in **`sw.js`
optional** — `tests/load-order.test.mjs` asserts all three stay equal.

## When to Use

- Editing `sw.js`, install/activate/fetch handlers, or precache lists.
- Debugging stale PWA installs, offline boot, or shell-not-updating reports.
- Adding/removing DEFERRED renderer files or other optional precache seeds.
- Explaining why `version.json` and `?v=N` must move in lockstep.
- Diagnosing test hangs after an accidental mid-run version bump.

## When NOT to Use

- **Cross-origin API caching** — Jolpica/OpenF1 fetches are explicitly excluded
  (`url.origin !== self.location.origin`); do not route data-hub traffic through the SW.
- **`blob:` music** — uploaded tracks in `music-lib.js` use blob URLs; the SW
  declines them (and must not `cache.put` non-HTTP schemes).
- **In-race game bugs** — physics, HUD, rendering; the SW only affects load/cache.
- JS/CSS edits with no SW change — use **`bump-cache`** alone; SW auto-syncs via tag parse.

## Quick Reference

| Asset class | Install | Fetch |
|---|---|---|
| Shell + tagged js/css | Essential (404 = fail) | Network-first |
| `version.json` | Essential | Network-first (no-store) |
| `?v=N` assets | Essential if tagged | Cache-first |
| DEFERRED backends, vendor, fonts | Optional (fail OK) | Cache-first on first use |
| Cross-origin, blob:, non-GET | Never cached | Pass-through / ignored |

Files:

| File | Role |
|---|---|
| `sw.js` | Install precache, fetch routing, cache sweep |
| `version.json` | `{ "build": N }` — cache name + shell guard |
| `index.html` | Tag source of truth for essentials; `?v=N` on assets |
| `tools/manifest.cjs` | `DEFERRED` map (must match BACKEND_FILES + sw optional) |
| `js/game.js` | Injects DEFERRED backends at boot |

Commands:

```sh
npm run test:service-worker          # install/fetch/version-guard unit tests
npm run test:tooling-fast            # includes load-order.test.mjs DEFERRED asserts
node tools/test-bg.mjs service-worker  # if grouped in CI locally
```

Related skills: **`bump-cache`**, **`check-changes`**.

## Workflow

1. **Identify what changed.**
   - New tagged `<script>`/`<link>` in `index.html` → picked up automatically on
     next install; still bump `?v=N` + `version.json`.
   - New file with **no tag** (DEFERRED backend, font, on-demand vendor) →
     update manifest + game.js + sw.js optional seed.

2. **Edit `sw.js` carefully.**
   - Keep essential vs optional split — never promote DEFERRED/vendor to essential
     unless every user loads it on first paint.
   - Preserve network-first for navigate + `version.json`.
   - Do not cache cross-origin or blob requests.

3. **Sync DEFERRED triple.** After manifest change:
   ```sh
   npm run test:tooling-fast
   ```
   Fix any `load-order.test.mjs` mismatch before proceeding.

4. **Bump version last.** Use **`bump-cache`** after all JS/CSS/index edits.
   Verify one uniform N:
   ```sh
   grep -o '?v=[0-9]\+' index.html | sort -u && cat version.json
   ```

5. **Test offline behaviour.**
   ```sh
   npm run test:service-worker
   ```
   For manual check: install PWA, go offline, reload — shell and tagged assets
   should serve from `apex26-{N}`.

6. **Pre-push.** For `sw.js` edits, `pick-tests` routes to `service-worker` —
   run `npm run test:service-worker`. For shell/cache-bust work (`index.html` /
   `version.json` only), also run `npm run test:service-worker` manually —
   pick-tests routes those paths to `tooling-fast`, not `service-worker`.

## Common Mistakes

- Hand-maintaining a precache manifest parallel to `index.html` — use tag parse + optional seed.
- Bumping only `?v=N` or only `version.json` — PWA users keep stale shell or wrong cache name.
- **Bumping `version.json` mid Playwright run** — shell guard reloads every open page → timeouts.
- **Stale pause menu after deploy** — pause/settings DOM is inline in `index.html` (not `?v=` JS). If buttons/layout are old while in-race HUD updated, the installed shell didn't reload: check `?v=N` ↔ `version.json` and the shell version guard.
- Adding a DEFERRED file to `index.html` — breaks the opt-in load model; use manifest DEFERRED.
- Forgetting `sw.js` optional entry — install passes but first TLX/WGX boot misses cache.
- Promoting vendor/fonts to essential — GLX-only install fails on unreachable optional CDN/path.
- Expecting the SW to cache Jolpica/OpenF1 — same-origin guard blocks it by design.
- Caching `blob:` music URLs — throws or breaks playback; guard exists for a reason.
- Running `test:service-worker` without fixing load-order first — DEFERRED drift fails both.
- Editing `js/` during an in-flight browser test — server serves working tree; version bump is worse.
