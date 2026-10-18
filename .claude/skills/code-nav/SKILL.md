---
name: code-nav
description: "Use when finding where a JS symbol is defined, who uses or calls it, its exports or type, an edit's new errors: apex-lsp, not grep. Dead code → slim-bloat."
---

# Code navigation with apex-lsp (instead of grep)

`apex-lsp` is the project MCP server (`.mcp.json`) over TypeScript 7's own
`tsc --lsp` (`tools/mcp/lsp-mcp.mjs`). It resolves the names the way the
checker does: script-global IIFEs across files, re-exports, destructures.
Measurements, sources and limits: [`docs/notes/LSP-MCP-2026-10-18.md`](../../../docs/notes/LSP-MCP-2026-10-18.md).

## Which call

| You want | MCP call | Shell (same tools, one process per call) |
|---|---|---|
| where it is defined (and its code) | `lsp_definition {symbol, body: true}` | `tools/mcp/lsp-mcp.sh def Liveries.forTeam --body` |
| every use, each with its enclosing function | `lsp_references {symbol}` | `… refs Tracks.curvature` |
| who would an edit touch (callers) | `lsp_callers {symbol}` | `… callers AiDrive.cornerK` |
| which files use it, counts only | `lsp_references {symbol, files: true}` | `… refs G.player --files` |
| a module's exports without reading it | `lsp_outline {symbol}` or `{file}` | `… outline GameHud` / `… outline js/physics/consts.js` |
| a name you only half know | `lsp_symbols {query}` | `… sym clamp` |
| its type / JSDoc | `lsp_hover {symbol}` | `… hover G.wrapS` |
| did my edit break anything in this file | `lsp_diagnostics {file}` | `… diag js/ui/hud.js` |

Targets: `Name` (a global such as `GameHud`), `Head.member` (`Liveries.forTeam`),
`G.member` (the façade: answered from `interface GameCtx` in `types/game-ctx.d.ts`),
or `file` + `line` [+ `column`] (ONE-based; shell `js/ui/hud.js:237:15`).

grep stays right for: text, comments, log strings, CSS/HTML, regex shapes, files
outside `js/`. The `lsp-hint.py` hook names the apex-lsp call after a grep for a
bare JS symbol. Take it for the next lookup.

## Workflows

1. **Understand a module.** `lsp_outline {symbol: "Ghost"}` lists the exports,
   then `lsp_definition {symbol: "Ghost.snapshot", body: true}` gives the body.
   That's two calls and no full-file Read.
2. **Before changing a shared function.** `lsp_callers` lists the functions that
   use it. Read those, not every grep hit. For a façade member, `files: true`
   first: `G.player` has 413 uses in 45 files.
3. **After an edit, before the test run.** `lsp_diagnostics {file}` gives only the
   errors the edit **introduced**: per-file `// @ts-check`, high-signal codes
   (unknown name, "did you mean" typo, too many arguments, assign to const,
   calling a non-function, redeclare, syntax), minus the same file at git HEAD.
   `all: true` lists the pre-existing ones as well. This is a fast first check,
   not a substitute for the tests.

## Reading the output

- Rows read `file:line:col  [tag] (Module › fn)  source`. The tags:
  - `[def]`: the declaration, always listed first for a definition;
  - `[export]`: the IIFE's `return { … }` entry;
  - `[alias]`: `const { x } = Head` or `const x = Head.x`;
  - `[use]`: a read or call.
- "N definitions (+M export/alias rows)": N real declarations. Several
  same-named top-level functions (`wrapS`) are all listed, never one guessed.
- "text match: …" in the header: the checker cannot type the symbol, so the
  rows come from text, following destructures. That happens for `window.X`
  globals (`PhysicsConsts`, `CssZoom`) and for files ending in
  `module.exports = X` (`ghost.js`, `ghost-share.js`, `input-ghost.js`,
  `forecast.js`, `share-code.js`), which the checker scopes to their own file.
- An error such as "has no member" or "not found" is the answer. Fall back to
  `lsp_symbols`; don't guess a neighbour.
- Long output pages: the footer names the next `offset`, and `format: "concise"`
  drops the source text.

## Limits (measured)

- The first call takes ~1 s (project load). After that it's 7–70 ms, and up to
  ~155 ms for text answers over `G`. `tsc` holds ~400 MB, starts on the first
  call and exits after 10 idle minutes (`APEX_LSP_IDLE_MS`).
- JS parameters are optional to the checker: TS2554 catches too many
  arguments, never too few. TS2339 (property missing) is filtered out as noise.
- A façade passed under another name (`create(ctx)`) is not followed. In this
  tree `ctx` is a different object.
- Hover types JS parameters as `any` unless JSDoc says otherwise.

## Verify the tool itself

```sh
node --test tests/unit/lsp-mcp.test.mjs   # MCP client on the real tree + fixtures, ~7 s
node tools/mcp/lsp-eval.mjs               # 12 pinned questions, apex-lsp vs grep
```
