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
stay `?v=dev` (AGENTS.md "Critical conventions"). Check with `node tools/gen/gen-shell.mjs --check`.
