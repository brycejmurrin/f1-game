# LSP MCP client case timeout on CI — 2026-10-19

**Symptom:** `Pure-node unit suites (slow)` failed on PR #2920 head `299904e7`
([run 39158195670](https://github.com/brycejmurrin/f1-game/actions/runs/39158195670))
with `testTimeoutFailure` after 90000 ms on
`tests/unit/lsp-mcp.test.mjs` — "MCP client: definition, references and symbols
on the real tree". Sibling real-tree cases in the same file then finished in
~8–12 s each (cold `tsc --lsp` project load under load).

**Where the time went (measured locally, then matched to the CI shape):**

| Step | Alone (quiet box) | Mechanism |
|---|---:|---|
| MCP initialize + first `lsp_definition` | ~1.2 s | spawn MCP child → `tsc --lsp` → open `js/core/log.js` → load jsconfig (~540 files) |
| `lsp_references Tracks.curvature` (limit 2000) | ~0.3–1 s warm | semantic refs + per-row `where()` / `documentSymbol` (serial) |
| `lsp_callers M4.lerp` (limit 2000) | ~0.4–1.1 s warm | **~35 serial** `textDocument/references` RPCs for `const lerp = M4.lerp` aliases |
| Whole case (pre-fix) | ~1.6–2.5 s | one MCP child, one tsc |

Raising the case timeout was rejected: alone it is already seconds; the 90 s
budget was spent on **serial LSP fan-out** once the runner was contended
(`test:mcp` default concurrency = CPU count; several files each start
`tsc --lsp` ~400 MB). The ship tip also added freeze/assign export assertions
to the same case, so every later PR inherits more serial work.

**Fix (this PR):**

1. **Pipeline** alias/export reference hops and `locRows` enclosing-function
   lookups inside `tools/mcp/lsp-mcp.mjs` (`Promise.all` over independent LSP
   request ids — the pending map already supports concurrency).
2. **Share** one MCP child across the real-tree client cases; **split** the
   freeze/assign + pipeline-isolation assertions into a sibling case with its
   own timeout budget.
3. Drop `limit: 2000` from the client case (assertions use header totals /
   ≥30 rows; default page 200 is enough).
4. Run `test:mcp` with `--test-concurrency=1` so parallel cold starts cannot
   starve the case on a 2-core Actions runner.

**Local timings (this host, after the fix):** see the PR body Verified section
(`test:mcp` ×3). Timeout was not raised.
