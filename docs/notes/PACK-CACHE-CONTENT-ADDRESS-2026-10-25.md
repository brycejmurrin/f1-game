# Pack content-address URLs (load-hunt L3)

Source: load-hunt note, row L3 (branch `cursor/load-hunt-a15c`, #3704; not yet on the deploy branch).

**Before.** Every `assets/pack/` request was `packNetworkFirst`: a network fetch
(HTTP 304 when unchanged) raced against `NAV_RACE_MS` (3 s) before the cached copy
answered. A warm start therefore made one network request per pack file it loaded
(2 material strips + each model), each able to wait 3 s on a dead-slow link.

**After.** `assets.js` requests `<file>?h=<md5>` using the manifest's md5
(`models.<id>.md5`, `materials[.low].albedoMd5/normalMd5`); `sw.js` answers a
`?h=<32 hex>` pack URL cache-first (`packCacheFirst`). The manifest and any URL
without a valid `?h=` stay network-first, so a record with no md5 behaves as before.
A rebake changes the md5, hence the URL, hence cannot hit the old entry.

**SW fetch counts** (counted in `tests/unit/pack-content-address.test.mjs`, "miss
fetches once"): cold (nothing cached) = 1 network fetch per pack file, same as before;
warm = 0 network fetches per pack file (before: 1 each). The manifest is 1 either way.
No timing claim: none measured in this container.

**Side fix.** The committed manifest carried no strip md5s, so `assets.mjs verify`
failed on them; the four `albedoMd5`/`normalMd5` fields are now stamped (same values
`stampMaterialHashes` writes).

## SECOND: pine W() allocation / GC (zero finding, no fix)

Profiled 4 builds each of Spa and Nürburgring (TRACK_VM, `node --cpu-prof --trace-gc`):
the whole process spent 652 ms (5 %) in GC of 12.6 s, 418 scavenges and 9 mark-compacts,
and the `pine` closure's self time was 2.0 s (16 %), the arithmetic of its 28 facets
rather than allocation. A scalar rewrite of the facet loop (no `W()`/`cross`/`norm`
arrays) kept Tracks.build typed arrays byte-identical (sha256, Spa/Nürburgring/Monza/Suzuka)
but moved nothing measurable: Spa 1380-1550 ms before vs 1426-1551 ms after, Nürburgring
1404-1516 vs 1376-1516 (steady-state builds, within run-to-run noise, far under the 5 %
bar). V8 already scalar-replaces the short-lived arrays, so the change was reverted and
`nature.js` is untouched. No second PR.
