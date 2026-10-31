# sw.js internals (load when editing install/activate/fetch)

**In-session generation check.** A registration's `scriptURL` is not its cache
identity: the browser can install changed worker bytes at the same URL.
`UpdateCheck.prepareLazyLoad()` asks the exact controller for
`apex-cache-generation` over a private MessageChannel before ScriptLoader injects.
The worker answers from `currentCacheName()`, not its URL. Parallel requests share
one handshake; later loads query again because a restarted worker can re-read
version.json. A replaced controller's reply cannot authorize a load. The wait is
bounded to 1.5 s per ScriptLoader.load invocation for older workers without this
protocol (not per serial dependency); a known newer build
still refuses lazy loading after timeout and shows UPDATE READY outside races.
Refs: [update()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update),
[scriptURL](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker/scriptURL),
[message ports](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableMessageEvent/ports).

**Cache name.** `apex26-{build}` from `version.json`. `INSTALL_COMPLETE` records required success; `INSTALL_SETTLED` records
completion of optional work. Activate retains older generations until settled,
then deletes only numerically older `apex26-*` generations; newer caches are
preserved. Essential failures abort install; this includes deferred GLX and career UI,
whose absence would remove offline rendering or career access. Other optional
failures are recorded and may degrade their features.

**Fetch.** Ordinary navigation is network-first with a bounded cache fallback. Online
`version.json` failure must not mask a newer generation with stale precache.
A `?b=` shell-bust navigation applies only to the game shell. Secondary HTML
queries fall back to their own queryless cached document, never the game shell.
Unversioned asset packs use a three-second network/cache race. Successful network
responses never await generation lookup or CacheStorage writes; synchronous
`waitUntil()` registration keeps those writes alive after the response is sent.
Everything else = cache-first (network-first on a dev host, where every tag reads
`?v=dev`). Deploy stamps **content hashes and shell generation** together; source tags
stay `?v=dev` (`.claude/rules/game-code.md`). Check with `npm run gen:check`.

**Hashed assets on a browser with no SW.** GitHub Pages serves every response with a short
`max-age` (not configurable), so `?v=<sha256>` assets are "immutable" only inside the SW: a browser
with no SW (or Safari before install) revalidates them. Measured headers and payload sizes:
`docs/notes/system-audit-4/live-site.md` (L3, L5); re-measure before quoting them.

## Install, guard and update

**Precache.** Install fetches `index.html` and parses every `<script src>` and
`<link rel="stylesheet">` into the **essential** set (plus `./`,
`index.html`, `version.json`). Cross-origin skipped. Other `<link>` tags →
**optional**. Files the parser cannot see live in `sw.js`'s `optional` Set:
**DEFERRED** backends, `vendor/three-0.187.0`, other vendors, self-hosted fonts.
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
