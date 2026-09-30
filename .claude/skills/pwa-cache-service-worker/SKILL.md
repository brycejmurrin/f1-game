---
name: pwa-cache-service-worker
description: Use when editing sw.js, version.json, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache, or Playwright failures caused by bumping version.json mid-run in Apex 26.
---

# PWA cache and service worker

Hand-written `sw.js`, no build step. Discover essentials from `index.html`,
embed the build number in the cache name, network-first for the shell guard,
cache-first for immutable `?v=<sha256>` assets.

**Precache.** Install fetches `index.html` and parses every `<script src>` and
`<link rel="stylesheet">` into the **essential** set (plus `./`,
`index.html`, `version.json`). Cross-origin skipped. Other `<link>` tags →
**optional**. Files the parser cannot see live in `sw.js`'s `optional` Set:
**DEFERRED** backends, `vendor/three-0.186.0`, other vendors, self-hosted fonts.
The GLX files in it are promoted to REQUIRED at install (the fallback renderer:
offline without it is "graphics unavailable"); TLX/WGX stay best-effort.

**Shell version guard.** Inline script at the top of `index.html` ("SHELL VERSION GUARD"):
reads `<meta name="apex-build">`, fetches `version.json` no-store, and if the
deployed build is newer reloads once with `?b=<build>` (hash and query kept;
`sessionStorage` `apex26.shellReloadedTo` stops loops). It also registers
`sw.js?v=<build>` after load+idle, so a new build is a new registration URL.
Stale installed shell = this guard did not fire or `version.json` did not move.

**Cache name.** `apex26-{build}` from `version.json`. `activate` deletes older
`apex26-*` keys. Essential 404 aborts install; optional failures are
swallowed.

**Fetch.** Navigation + `version.json` = network-first (3 s → cache).
Everything else = cache-first (network-first on a dev host, where every tag reads
`?v=dev`). Always refresh **content hashes AND the
shell generation** together (`node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md))). Never bump `version.json`
during a Playwright run.

## When to Use

- Editing `sw.js`, install/activate/fetch, or precache lists.
- Stale PWA installs, offline boot, shell-not-updating.
- Adding/removing DEFERRED files or optional seeds.
- Test hangs after an accidental mid-run version bump.

## When NOT to Use

- Cross-origin API caching (Jolpica/OpenF1 excluded by origin).
- `blob:` music — SW declines non-HTTP schemes.
- In-race game bugs. JS/CSS-only edits → `node tools/gen/gen-shell.mjs --check` alone.

| Asset class | Install | Fetch |
|---|---|---|
| Shell (navigations) | Essential (404 = fail) | Network-first (3 s race) |
| Tagged `?v=` js/css | Essential (404 = fail) | Cache-first |
| `version.json` | Essential | Network-first (no-store) |
| `?v=<sha256>` assets | Essential if tagged | Cache-first |
| DEFERRED TLX/WGX / vendor / fonts | Optional (fail OK) | Cache-first on first use |
| DEFERRED GLX (`js/render/glx/`) | Required at install | Cache-first |

```sh
npm run test:service-worker
npm run test:tooling-fast
node tools/check/offline-precache-check.cjs   # offline precache contract — LAUNCHES CHROMIUM (Playwright), ~1 min
```

Related: `node tools/gen/gen-shell.mjs --check`, **check-changes**.

## Load on demand

- DEFERRED triple, offline check, mid-run bump, mistakes →
  [references/workflow.md](references/workflow.md).
