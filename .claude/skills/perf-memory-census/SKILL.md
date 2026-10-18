---
name: perf-memory-census
description: "Use when phone memory, heap growth, CPU copies (#1647), ChunkBins, or GPU census budgets need measured before/after — tools/perf, chrome-devtools heap/LCP, gpu-census.yml on macos-latest."
---

# Performance and memory census

Measure first; renderer changes need numbers in the PR, not adjectives.

## Repo tools

- `node tools/perf/profile.mjs` / `query.mjs` — game-loop CPU, scoped counters
- `gpu-census.yml` — dispatch on `macos-latest` for real GPU; read Verdict step
  (software SwiftShader here is not player evidence)
- `__apex` + **mcp-probe** for interactive heap/LCP on local `:3456`

## Workflow

1. Record baseline: track, backend (`__apex.diag().env.backend`), device class.
2. Chrome DevTools MCP: `take_heapsnapshot`, `performance_start_trace` / stop —
   see [references/chrome-devtools-perf.md](../renderer-debug/references/chrome-devtools-perf.md).
3. Compare after a change; cite paths and MB deltas.
4. For TLX/GLX duplicate CPU buffers (#1647), name the subsystem (shadow, road,
   chunked mesh) before proposing a copy removal.

Related: **renderer-debug**, **playwright-probe** `references/perf-profile.md`.
