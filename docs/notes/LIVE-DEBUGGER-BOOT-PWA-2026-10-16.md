# Live debugger hunt: boot and delivery (2026-10-16)

Lane `cursor/live-debug-boot-pwa-5c1d`. Debug Chrome (headless, SwiftShader, 844x390)
at `http://127.0.0.1:3456/`, driven by the js-debugger MCP; the service worker was
also probed over raw CDP. Build under test: 1695 (dev host, `?v=dev` tags).
Prior art not re-reported: `docs/BUGS.md`, `DEFECT-LEDGER.md`, `BUG-HUNT*.md`.

**Verdict: no new defect in the five areas. No source change, so no fix and no new
unit test.** Design gaps are listed as observations (O1, O2, O3); §6 is the follow-up round that closed the first pass's not-run list. The static read
of `sw.js` 255-1075 and `store.js` 395-767 (never read before) found nothing the live
runs contradicted.

## Verdicts per area

| Area | Verdict | Evidence |
|---|---|---|
| 1 Boot / script-loader / lazy bundles | CONFIRMED-LIVE clean degrade; O1 measured (63.6 s static loading card on a hung file), deadline proposed | failure paths resolve `false` in ~40 ms, tags removed |
| 2 Service worker | CONFIRMED-LIVE (first install, offline reload, pack-missing, mid-session update, two tabs on different shell versions); O2, O3 open | §2, §6 |
| 3 Storage / mirror | CONFIRMED-LIVE (corrupt keys, quota refusal, restore); mid-restore `getItem` throw BY-DESIGN edge | §3 table |
| 4 Asset pack | CONFIRMED-LIVE degrade (`no-pack`); track switch during a pending load CONFIRMED-LIVE | §4, §6 |
| 5 Caught-exception pauses | BY-DESIGN (`parseStored` x2); remainder not stepped | §1, §5 |

No finding was REFUTED; no defect was CONFIRMED.

## 1. Boot sequence and script-loader

| Probe | Result |
|---|---|
| `ScriptLoader.create().load` of a file that does not exist | resolves `false` in 38 ms; the failed `<script>` is removed; no hung splash |
| strict load, one 404 + one good file | resolves `false` in 44 ms (strict drains `inflight` first) |
| non-strict load, one 404 + one good file | resolves `false`, the missing file is counted done so dependents proceed (documented) |
| `ready()` throws | resolves `false` (caught) |
| `UpdateCheck.blocksLazyLoad()` | `false` on a current build |

Pauses on caught exceptions: `parseStored` (`store.js:11`) fired twice during the
corrupt-key boot (callers `hud-elements.js profileOf`, `hud-layout.js mirrorMode`).
Both are the designed `JSON.parse` catch in `Store.get`: the key is one corrupt value, not
broken storage, so `store.broken` stays unset and the default is returned. Triage: by
design. Limit: `all` pauses fired on every corrupt key and each `debugger_state` echoed
a 10 KB stack, so I switched to `none` after those two; the remaining boot-time caught
throws were not individually stepped.

**O1 (observation, not fixed).** `inject()` in `js/core/script-loader.js` has no deadline
of its own: `UpdateCheck.prepareLazyLoad` bounds the generation query to 1.5 s, but a
script request that hangs (lie-fi, cold cache, no SW copy) leaves `pump()` waiting
until the browser gives up. Warm sessions are covered by the cache-first SW. A bounded
wait would change a boot contract (what a failed bundle means for RACE!), so it is an
issue, not a 20-line fix.

## 2. Service worker

| Scenario | Result |
|---|---|
| first install (wiped SW, caches, localStorage, IDB, reload) | active + controlling after one load; `apex26-1695` holds 539 entries; `apex26-store` IDB recreated |
| offline reload (serve process killed) | boots to the menu from cache; `apex-offline-status`: `known, coreReady, optionalTotal 238, optionalMissing 0` |
| asset pack and voice entries deleted from the cache, then offline reload | pack `error:"no-pack"`, `tier:"off"`; menu fine; `Assets.modelsReady()` resolved in 19 ms |
| quota on `cache.put` | covered by `tests/unit/service-worker.test.mjs` (`noteCacheWriteFail`); a raw-CDP probe of it is invalid because a worker's own `fetch` never reaches its fetch handler |
| 206 / partial | `assets/music/` Range requests bypass the handler; other 206s fail `cache.put` into `noteCacheWriteFail`; install never sees a 206 because it sends no Range |
| two tabs on different shell versions, mid-session `version.json` change | run live in the follow-up round, see §6 (first pass could not: no way to serve a second build; solved with a scratch server outside the repo) |

Static notes on `sw.js` 255-745: install ordering (shell put, required pool, marker,
critical pool, background pool, status record, SETTLED, `skipWaiting`) matches the
skill; a shell build that differs from the cache name aborts the install; `reuseHashed`
digest-checks an older generation's copy before trusting it.

**O2 (observation).** `cacheOptionalAsset(..., verifyGeneration=true)` (the
`apex-offline-retry` path) returns `false` for any `js/` URL not ending `?v=<12 hex>`.
On a shell without the `apex-lazy-v` map (dev, committed shell) every stamped key ends in
the numeric build, so a retry can never heal a missed optional script there. The deploy
writes the map, so a player is unaffected; it matters only to someone testing the retry on
a dev host.

## 3. Storage

| Scenario | Result |
|---|---|
| corrupt JSON in all 13 `apex26.*` keys, reload | boots to the menu; every key rewritten valid; `mirror.restored` 0 (the keys are not mirrored; defaults were re-written) |
| `Storage.setItem` throws `QuotaExceededError` on a plain key | `write` returns `{ok:true, durable:false, reason:"QuotaExceededError"}`; `get` serves the value from memory; `store.broken` set; the page keeps running |
| same on a mirrored key (`career.slot0`) | IDB row stored `lsOk:false`; value served from memory; after a reload `mirror.restored` 1 and the value landed in localStorage |
| IndexedDB unavailable / blocked | read statically: `mirrorOpen` resolves `null` on a missing `indexedDB`, a throwing `open`, `onerror`, `onblocked` or the 4 s timer, and never caches a failure; nothing outside `store.js` awaits `mirror.ready`, so a hung restore cannot hold boot |

Static findings on `store.js` 395-767, judged not worth a change: `mirrorRestore` returns
`0` from inside the row loop when `localStorage.getItem` throws mid-restore, skipping the
notify for keys already restored (needs `getItem` to fail after succeeding on an earlier
key); the restore `getAll` has no timeout, which only parks the mirror, never the page.

## 4. Asset pack

Pack unreachable: `__apex.assets()` reports `pack:false, error:"no-pack"`, the build
does not wait, the procedural look renders. A track switch during a pending load is in §6.

## 5. Pauses

See §1. Caught-exception pauses seen: `parseStored` x2 (by design). Uncaught: none across
every scenario above.

## 6. Follow-up round (the not-run list)

Setup: a scratch static server outside the repo (it serves the repo's files, answers
`/version.json` with a chosen build, can rewrite the shell's `apex-build` meta and append a
comment to `sw.js` so its bytes change, and can delay or 404 `assets/pack/` and chosen
files). The page ran on `127.0.0.2:3457`, a secure loopback origin that the worker's
dev-host regex (`127.0.0.1` only) does not match, so the production fetch paths ran.
The debugger only attaches to a page on `127.0.0.1`/`localhost`, so each run attached
there and then navigated.

| Scenario | Verdict | Evidence |
|---|---|---|
| Mid-session `version.json` ahead of the shell (CDN-skew stage) | CONFIRMED-LIVE | broke in the guard (`index.html:255`): `loaded 1695`, `v.build 1696`; one `?b=1696` navigation, then `apex26.shellReloadedTo=1696` stops a second reload; the URL is cleaned |
| Same window, runtime cache write | BY-DESIGN | a plain fetch created `apex26-1696` holding build-1695 content with no install markers; `computeCacheOrder` ranks an unfinished generation last and `sweepStaleCaches` refuses to sweep below an unsettled one, so the finished 1695 still answers. Stray unversioned entries (pack, fonts) written in that window stay in 1696 until the network-first path refreshes them (O3) |
| Full simulated deploy (version.json 1696 + shell meta + `sw.js` bytes), tab A left open on 1695, tab B opened after | CONFIRMED-LIVE | new worker installed and claimed within ~20 s; `apex26-1695` swept; tab A (old shell): `UpdateCheck.blocksLazyLoad()` true, a lazy `load()` resolved `false` in 2 ms, banner `UPDATE READY · RELOAD TO CONTINUE`; reloading it gave build 1696, `blocks` false, lazy load true, no `?b=` loop |
| Track switch while the pack is pending (15 s per request, uncached) | CONFIRMED-LIVE | `race('bahrain')` finished in 18 s with the pack still `false`; `Assets.modelsReady()` returned `-1` after 4.003 s (the cap) while Monaco built procedurally in 5.5 s; of two overlapping `race()` calls the first rejected (superseded) and the second won, final track monza, no stuck state |

**O1, measured.** With the worker's cache entry for `js/race/pit-lane.js` removed and the
server holding that file for 70 s, `race('bahrain')` kept the loading card on screen for
63.6 s: the same static track card at 6, 20, 40 and 60 s (no stall message, no timeout, no
way back), and the race then started normally. A warm returning player is protected
because the worker answers lazy files cache-first; the exposure is a cold first visit while
the precache is still filling, a swept or evicted cache, or a browser without the worker.
*Proposal, not implemented:* `inject()` in `js/core/script-loader.js` gets a deadline
(about 25 s) that removes the tag and resolves `false`, so a strict bundle fails to the
existing "did not load" path and the menu instead of waiting out the browser's own network
timeout; with a stall line on the loading card ("SLOW CONNECTION") at about 10 s. Not made
here because the number is a product call (a slow 2G first visit may legitimately take
longer), and a deadline turns a slow success into a failure.

**O3 (observation).** See the second row above: during a version skew the worker writes
runtime entries into a not-yet-installed generation. Safe for hashed `?v=` keys; only the
unversioned ones (pack, voice, fonts) can carry old-build bytes into the new generation
until refreshed.

## Tool observations (js-debugger MCP, recorded not patched)

- `debugger_attach` refuses any page whose URL host is not `127.0.0.1`, `localhost` or `[::1]`
  (`js-debugger-session.mjs:71`), so a page served from another loopback address or a
  custom hostname cannot be attached; attach first, then navigate.
- A probe in a background tab (`visibilityState hidden`) never gets frames, so `race()`
  waits forever: bring the tab to the front or close the others.
- `debugger_scripts` with a `filter` returned every script (the filter did not narrow it).
- `debugger_targets` lists page targets only; the `service_worker` target in
  `/json/list` cannot be attached. Workaround: a ~12-line raw-CDP script.
- `debugger_attach` needs `endpoint` as well as `targetId`; `debugger_evaluate` needs a
  `pauseToken`, so running code unpaused goes through `debugger_run`.
- A `debugger_run` queued across `location.reload()` stays `pending` forever; detach and
  re-attach recovers.
- `debugger_state` echoes every operation ever run, so output grows per call.
- `exceptions` `all` pauses on every `JSON.parse` catch; use `uncaught` unless hunting.

## Not run

`npm run test:service-worker`, the pwa/sw browser specs and `offline-precache-check` were
not run: no source changed, and `pick-tests` selects only `test:tooling-fast` (docs
integrity) for this diff. Everything in §6 was a live probe of unchanged code.
Nothing from the first pass's not-run list remains open; O1's deadline is a proposal.
