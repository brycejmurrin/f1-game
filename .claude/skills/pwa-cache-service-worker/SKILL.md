---
name: pwa-cache-service-worker
description: "Use when editing sw.js, version.json, PWA offline install, stale shell, cache invalidation, shell version guard, DEFERRED backend precache, or Playwright hangs from a mid-run version.json bump."
---

# PWA cache and service worker

Hand-written `sw.js`, no build step. Discover essentials from `index.html`,
embed the build number in the cache name, network-first for the shell guard,
cache-first for immutable `?v=<sha256>` assets.

**Precache.** Install fetches `index.html` and parses every `<script src>` and
`<link rel="stylesheet">` into the **essential** set (plus `./`,
`index.html`, `version.json`). Cross-origin skipped. Other `<link>` tags →
**optional**. Files the parser cannot see live in `sw.js`'s `optional` Set:
**DEFERRED** backends, `vendor/three-0.186.1`, other vendors, self-hosted fonts.
The GLX files in it are promoted to REQUIRED at install (the fallback renderer:
offline without it is "graphics unavailable"); TLX and its vendor dependency are the critical optional pool,
WGX/scenery/fonts the background pool after it, then SETTLED, then skipWaiting (the flag is read only once install settles). Required failures abort
install; optional failures are recorded without making install incomplete.

**Shell version guard.** Inline script at the top of `index.html` ("SHELL VERSION GUARD"):
reads `<meta name="apex-build">`, fetches `version.json` no-store, and if the
deployed build is newer reloads once with `?b=<build>` (hash and query kept;
`sessionStorage` `apex26.shellReloadedTo` stops loops). It also registers
`sw.js?v=<build>` after load+idle, so a new build is a new registration URL.
Stale installed shell = this guard did not fire or `version.json` did not move (diagnose: workflow.md).
The deploy stamps the build (`2000 + commit count`, `pages.yml`) into `version.json` and the meta; the
committed numbers are not what is live. Live check: `tools/ci/pages-live-sha.sh` / **deploy-research**.

**Fetch.** Navigation is network-first with a bounded cache fallback; everything else
cache-first (network-first on a dev host, where every tag reads `?v=dev`). The deploy
stamps content hashes and shell generation together; source tags stay `?v=dev`
(AGENTS.md "Critical conventions"). Check with `node tools/gen/gen-shell.mjs --check`.
The in-session generation handshake, cache naming/retention and fetch races are in
[references/sw-internals.md](references/sw-internals.md).

**CSP.** `<meta http-equiv="Content-Security-Policy">` is a gen-shell block
(`CSP` in `tools/gen/gen-shell.mjs`, first in `<head>`): a new third-party
script, frame or non-https endpoint must be added THERE, or the browser
refuses it. `load-order.test.mjs` pins its shape.

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
| `assets/pack/` (unversioned) | Runtime only | Network-first (3 s race to cache) |
| DEFERRED TLX/WGX / vendor / fonts | Optional (fail OK) | Cache-first on first use |
| DEFERRED GLX (`js/render/glx/`) | Required at install | Cache-first |

```sh
npm run test:service-worker
npm run test:tooling-fast
node tools/check/offline-precache-check.cjs   # offline precache contract — LAUNCHES CHROMIUM (Playwright), ~1 min
```

Related: `node tools/gen/gen-shell.mjs --check`, **check-changes**.

## Load on demand

- DEFERRED triple, offline check, mid-run bump, mistakes, stale-shell diagnosis →
  [references/workflow.md](references/workflow.md).
- Handshake, cache name, fetch races → [references/sw-internals.md](references/sw-internals.md).
- PWA perf / CWV playbook → [references/web-quality-perf.md](references/web-quality-perf.md).
