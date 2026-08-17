---
name: pwa-cache-service-worker
description: Use when editing sw.js, version.json, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache, or Playwright failures caused by bumping version.json mid-run in Apex 26.
---

# PWA cache and service worker

Hand-written `sw.js`, no build step. Discover essentials from `index.html`,
embed the build number in the cache name, network-first for the shell guard,
cache-first for immutable `?v=N` assets.

**Precache.** Install fetches `index.html` and parses every `<script src>` and
`<link rel="stylesheet">` into the **essential** set (plus `./`,
`index.html`, `version.json`). Cross-origin skipped. Other `<link>` tags →
**optional**. Files the parser cannot see live in `sw.js`'s `optional` Set:
**DEFERRED** backends (WGX/TLX + `vendor/three-0.184.0`), dynamic-import
vendors, self-hosted fonts.

**Cache name.** `apex26-{build}` from `version.json`. `activate` deletes older
`apex26-*` keys. Essential 404 aborts install; optional failures are
swallowed.

**Fetch.** Navigation + `version.json` = network-first (3 s → cache).
Everything else = cache-first. Always bump **`?v=N` AND `version.json`
together** (**bump-cache**). Never bump `version.json` during a Playwright
run.

## When to Use

- Editing `sw.js`, install/activate/fetch, or precache lists.
- Stale PWA installs, offline boot, shell-not-updating.
- Adding/removing DEFERRED files or optional seeds.
- Test hangs after an accidental mid-run version bump.

## When NOT to Use

- Cross-origin API caching (Jolpica/OpenF1 excluded by origin).
- `blob:` music — SW declines non-HTTP schemes.
- In-race game bugs. JS/CSS-only edits → **bump-cache** alone.

| Asset class | Install | Fetch |
|---|---|---|
| Shell + tagged js/css | Essential (404 = fail) | Network-first |
| `version.json` | Essential | Network-first (no-store) |
| `?v=N` assets | Essential if tagged | Cache-first |
| DEFERRED / vendor / fonts | Optional (fail OK) | Cache-first on first use |

```sh
npm run test:service-worker
npm run test:tooling-fast
node tools/test-bg.mjs service-worker
```

Related: **bump-cache**, **check-changes**.

## Load on demand

- DEFERRED triple, offline check, mid-run bump, mistakes →
  [references/workflow.md](references/workflow.md).
