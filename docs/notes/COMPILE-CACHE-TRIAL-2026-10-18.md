# V8 compile cache trial (#1715)

Measured on the Cloud Agent VM (linux, loadavg ~1–2), 2026-10-18.

## game-vm (`tools/lib/vm-script-cache.cjs` + `game-vm.cjs`)

Three cold boots (`APEX_VM_COMPILE_CACHE=0`), then three warm boots with
`artifacts/.vmcache/` populated (content-hash keyed `vm.Script` cachedData):

| run | bootMs (monza, race+60 steps) |
|-----|-------------------------------|
| cold 1 | 447 |
| cold 2 | 311 |
| cold 3 | 282 |
| warm 1 | 350 |
| warm 2 | 251 |
| warm 3 | 251 |

Median cold 311 ms, warm 251 ms (~19 % off boot; compile is only part of boot).

## tooling-fast (`NODE_COMPILE_CACHE` via `tools/lib/node-compile-cache.cjs`)

Three serial runs of a fixed subset (`tests/unit/test-observed.test.mjs`,
`tests/unit/node-compile-cache.test.mjs`, `tests/unit/agent-config.test.mjs`)
with cache cleared, then with `artifacts/.node-compile-cache` warm:

| | wall (3 files, `--jobs=1`) |
|--|--|
| cold | 8978 ms |
| warm | 8540 ms |

(~5 % on this tiny subset; full `tooling-fast --jobs=3` gain is expected to be a few seconds.)

Coverage runs must keep `NODE_DISABLE_COMPILE_CACHE=1` or unset
`NODE_V8_COVERAGE` / `APEX_JS_COVERAGE` so V8 coverage stays precise
(Node docs: deserialized code cache can blur coverage).

## CI

`node-suites` sets `NODE_COMPILE_CACHE` to `artifacts/.node-compile-cache`.
`tooling-fast.mjs` and `run-group.mjs` inject the same for child `node --test`
processes. No workflow change is required for guards shards beyond what
tooling-fast already passes to children.
