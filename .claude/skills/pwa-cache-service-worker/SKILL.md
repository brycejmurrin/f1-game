---
name: pwa-cache-service-worker
description: "Use when editing the service worker (sw.js), version.json or the PWA manifest: an installed app stuck on an old build, offline play, stale shell, or precache lists. Not for: audio → audio-debug; textures → asset-pack; picking tests → check-changes."
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
The GLX files and the career UI (`career-ui.js`, `career-planning-ui.js`) in it are promoted to
REQUIRED at install (`isRequiredLazy` in `sw.js`: offline without GLX is "graphics unavailable",
without the career UI there is no career); TLX and its vendor dependency are the critical optional pool,
WGX/scenery/fonts the background pool after it, then SETTLED, then skipWaiting (the flag is read only once install settles). Required failures abort
install; optional failures are recorded without making install incomplete.

**Shell version guard.** Inline script at the top of `index.html` ("SHELL VERSION GUARD"):
reads `<meta name="apex-build">`, fetches `version.json` no-store, and if the
deployed build is newer reloads once with `?b=<build>` (hash and query kept;
`sessionStorage` `apex26.shellReloadedTo` stops loops). It also registers
`sw.js?v=<build>` after load+idle, so a new build is a new registration URL.
The guard runs ONCE, at boot.

**In-session update (`UpdateCheck`, `js/ui/update-check.js`; contract `docs/ARCHITECTURE.md`).** An
installed iOS PWA usually RESUMES instead of cold-booting, so the boot guard never runs: UpdateCheck
re-reads `version.json` when the tab is foregrounded (at most every `THROTTLE_MS`, a failed read
retried after `FAIL_BACKOFF_MS`), shows the UPDATE READY chip (hidden during a race), and `apply()`
reloads. Stale installed app = compare the PHONE's booted build with the live `version.json`
(diagnose: workflow.md), never the live meta with the live json.
The deploy stamps the build (`2000 + commit count`, `pages.yml`) into `version.json` and the meta; the
committed numbers are not what is live. Live check: `bash tools/ci/pages-live-sha.sh <url>` / **deploy-research**.

**Fetch.** Per-class policy is the table below; dev-host `?v=dev`, the generation
handshake, cache retention and fetch races → [references/sw-internals.md](references/sw-internals.md).

**`sw.js` anchors** (grep the symbol): `currentCacheName()` (`version.json` no-store →
`apex26-<build>`), `cacheBuild()` (numeric parse of the name), `sweepStaleCaches()` (deletes only
numerically OLDER caches, after `INSTALL_SETTLED`), the `install` / `activate` listeners, and the
`fetch` listener's `isVersion` branch (`version.json` network-first; precached at install and served
from that key offline, never written at runtime).

**Generated parts.** The `@gen-shell:sw-optional` block in `sw.js` and the `@gen-shell` blocks of
`index.html` are GENERATED (AGENTS.md rule 11; `protect-files` refuses a hand edit): edit
`tools/manifest.cjs`, run `npm run gen`, and `npm run gen:check` names drift.

**CSP.** `<meta http-equiv="Content-Security-Policy">` is a gen-shell block
(`CSP` in `tools/gen/gen-shell.mjs`, first in `<head>`): a new third-party
script, frame or non-https endpoint must be added THERE, or the browser
refuses it. `load-order.test.mjs` pins its shape.

## First workflow

1. Identify the symptom: install failure, offline boot, stale shell, or resumed-app update.
2. Compare the affected device's booted build with live evidence from **deploy-research**;
   use [stale-shell diagnosis](references/workflow.md) before changing cache policy.
3. Edit the owning source; manifest/CSP/generated-shell changes follow the Generated parts section.
4. Run the targeted service-worker node checks below; the parent owns the offline browser probe
   under [AGENTS.md verification rules](../../../AGENTS.md#verification--scale-it-to-the-change).

## When to Use

- Editing `sw.js`, install/activate/fetch, or precache lists.
- Stale PWA installs, offline boot, shell-not-updating.
- Adding/removing DEFERRED files or optional seeds.
- A test pointed at a moving `version.json` (the live host, or a stub) reloads mid-run.

## When NOT to Use

- Cross-origin API caching (Jolpica/OpenF1 excluded by origin).
- `blob:` music — SW declines non-HTTP schemes.
- In-race game bugs. JS/CSS-only edits need no cache bump (`.claude/rules/game-code.md`).

| Asset class | Install | Fetch |
|---|---|---|
| Shell (navigations) | Essential (404 = fail) | Network-first, `cache:"no-cache"` revalidation (304 when unchanged) |
| Tagged `?v=<sha256>` js/css/assets | Essential (404 = fail) | Cache-first (immutable only inside the SW) |
| `version.json` | Essential | Network-first (no-store) |
| `assets/pack/` (unversioned) | Runtime only | Network-first (3 s race to cache) |
| DEFERRED TLX/WGX / vendor / fonts | Optional (fail OK) | Cache-first on first use |
| DEFERRED GLX (`js/render/glx/`), career UI (`isRequiredLazy`) | Required at install | Cache-first |

```sh
npm run test:service-worker
npm run test:tooling-fast
node tools/check/offline-precache-check.cjs   # offline precache contract — LAUNCHES CHROMIUM (Playwright), ~1 min
```

Related: `npm run gen:check`, **check-changes**.

## Load on demand

- DEFERRED triple, offline check, mid-run bump, mistakes, stale-shell diagnosis →
  [references/workflow.md](references/workflow.md).
- Handshake, cache name, fetch races → [references/sw-internals.md](references/sw-internals.md).
