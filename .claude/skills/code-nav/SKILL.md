---
name: code-nav
description: "Use when finding where a JS symbol is defined, who calls it, what a rename touches, or which type errors an edit added (apex-lsp, not grep). Not for: dead code → slim-bloat; breakpoints → js-debugger; live game state → agent-view."
---

# Code navigation with apex-lsp (instead of grep)

`apex-lsp` is the project MCP server (`.mcp.json`) over TypeScript 7's own
`tsc --lsp` (`tools/mcp/lsp-mcp.mjs`). It resolves the names the way the
checker does: script-global IIFEs across files, re-exports, destructures.
Measurements, sources and limits: [`docs/notes/LSP-MCP-2026-10-18.md`](../../../docs/notes/LSP-MCP-2026-10-18.md).

## Before the first lookup

Run from the checkout root with Node 22+ and the checkout's npm dependencies
installed (`npm ci` on a fresh checkout). A host without SessionStart setup
must do this explicitly; an import error such as missing `espree` is a setup
failure, not a missing symbol. Bootstrap/trust conditions:
[AGENT-SURFACE.md](../../../docs/AGENT-SURFACE.md#bootstrap-auto-setup).

Use attached `lsp_*` tools when listed by the session. Configured `.mcp.json`
or an installed plugin does not establish attachment. Without those tools,
use `bash tools/mcp/lsp-mcp.sh` with the table's commands; do not rebuild the
server or change global host configuration to perform a lookup.

## Which call

Configured MCP calls default to compact presentation. Add `outputLevel: "full"`
when the next decision requires the complete bounded definition/reference page;
native `limit`, `offset`, `maxLines` and `format` still determine what is fetched.
`output_read` retrieves a saved result without repeating a call. Shell examples
below also support the common terminal entrypoint, for example
`node tools/agent-run.mjs -- node tools/mcp/lsp-mcp.mjs refs Tracks.curvature --concise --limit=40`.

| You want | MCP call | Shell (same tools, one process per call) |
|---|---|---|
| where it is defined (and its code) | `lsp_definition {symbol, body: true}` | `tools/mcp/lsp-mcp.sh def Liveries.forTeam --body` |
| uses, with enclosing functions (first page) | `lsp_references {symbol, format: "concise", limit: 40}` | `… refs Tracks.curvature --concise --limit=40` |
| who would an edit touch (first caller page) | `lsp_callers {symbol, limit: 40}` | `… callers AiDrive.cornerK --limit=40` |
| which files use it, counts only | `lsp_references {symbol, files: true}` (or `lsp_callers {…, files: true}`; any call takes `path` to scope) | `… refs G.player --files` |
| a module's exports without reading it | `lsp_outline {symbol, limit: 40}` or `{file, limit: 40}` | `… outline GameHud --limit=40` / `… outline js/physics/consts.js --limit=40` |
| a name you only half know | `lsp_symbols {query}` | `… sym clamp` |
| its type / JSDoc | `lsp_hover {symbol}` | `… hover G.wrapS` |
| did my edit break anything in this file | `lsp_diagnostics {file}` | `… diag js/ui/hud.js` |

Targets: `Name` (a global such as `GameHud`), `Head.member` (`Liveries.forTeam`),
`G.member` (the façade: ONLY the rows of `interface GameCtx` in `types/game-ctx.d.ts`),
a contract type (`TrackModel`, found in `types/*.d.ts`),
an IIFE-local function (most of `js/game.js`: `updateCar`, `dashKph`; not on GameCtx, so
`G.updateCar` misses): the bare name (`lsp_definition {symbol: "updateCar"}`) or `file` + `line`,
or `file` + `line` [+ `column`] (ONE-based; shell `js/ui/hud.js:237:15`).

On a miss (`has no member`, `not found`): `lsp_symbols {query: <member>}`, then retry with the
bare name or the `file` + `line` it lists. Never guess a neighbour or fall back to grep.

grep stays right for: text, comments, log strings, CSS/HTML, regex shapes, files
outside `js/`. The `lsp-hint.py` hook names the apex-lsp call after a grep for a
bare JS symbol. Take it for the next lookup.

## Workflows

1. **Understand a module.** `lsp_outline {symbol: "Ghost", limit: 40}` lists the exports,
   then `lsp_definition {symbol: "Ghost.snapshot", body: true, maxLines: 60}` gives the body
   (the default cap is 40 lines, max 400; pass `maxLines` for a longer one).
   That's two calls and no full-file Read.
2. **Before changing a shared function.** `lsp_callers {symbol, limit: 40}` lists the functions that
   use it. Read those, not every grep hit. For a façade member, `files: true`
   first: `G.player` has hundreds of uses across dozens of files.
3. **After an edit, before the test run.** `lsp_diagnostics {file}` gives only the
   errors the edit **introduced**: per-file `// @ts-check`, high-signal codes
   (unknown name, "did you mean" typo, too many arguments, assign to const,
   calling a non-function, redeclare, syntax), minus the same file at git HEAD.
   `all: true` lists the pre-existing ones as well. If project configuration or another JS/declaration
   dependency differs from HEAD, subtraction is skipped and the output says so:
   a per-file HEAD overlay cannot establish whether a cross-file/config error is old.
   Configuration edits (including locally resolved extends chains) reload the persistent project before answering.
   This is a fast first check, not a substitute for the tests.

## Reading the output and limits

Row tags (`[def]`/`[export]`/`[alias]`/`[use]`), refused ambiguous names, text-match fallbacks, paging, and the measured limits (load time, TS2554/TS2339, façade aliases) → [references/output-and-limits.md](references/output-and-limits.md).

## Verify the tool itself

```sh
node --test tests/unit/lsp-mcp.test.mjs   # MCP client on the real tree
node --test tests/unit/lsp-mcp-fixture.test.mjs # hermetic fixture workspaces
node tools/mcp/lsp-eval.mjs               # 12 pinned questions, apex-lsp vs grep
```
