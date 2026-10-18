# Chrome DevTools MCP — heap and LCP (adapted)

<!-- Source: https://github.com/ChromeDevTools/chrome-devtools-mcp/tree/main/skills
     Commits: memory-leak-debugging, debug-optimize-lcp @ ff5204aaf572725557b4bb2f3f542fa3ead5f6a5
     License: Apache-2.0 -->

Apex uses the box **chrome-devtools** MCP against `http://localhost:3456` (skill **mcp-probe**). Prefer MCP tools over reading raw `.heapsnapshot` files.

## Memory (phone / long sessions)

1. Baseline `take_heapsnapshot` after `__apex.jump()` on a track.
2. Drive one lap or open Garage; repeat interaction ~10× to amplify leaks.
3. Second snapshot; use `compare_heapsnapshots` summary before drilling classes.
4. Suspect detached DOM, closures holding `G`, unremoved listeners, unbounded caches.
5. `close_heapsnapshot` when done — snapshots are large.

Fix in `js/` only with a measured before/after; census skill **perf-memory-census**.

## LCP / load (PWA shell)

1. `performance_start_trace` on cold load of `/` with throttling if reproducing mobile.
2. Read LCP element — often `#game` soft-present wait; compare with `awaitSoftPresent()` in tests.
3. Service worker / `version.json` stale shell → **pwa-cache-service-worker**, not renderer shaders.
