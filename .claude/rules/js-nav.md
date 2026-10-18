---
paths:
  - "js/**"
---

# js/ navigation — loads with any js/ file

- A named symbol (`Name`, `Head.member`, `G.member`): ask MCP `apex-lsp`, not grep.
  `lsp_definition` (`body: true` returns the source), `lsp_references` (rows name
  the enclosing function), `lsp_callers` before changing a shared function,
  `lsp_outline` for a module's exports. Shell: `tools/mcp/lsp-mcp.sh <cmd> <target>`.
- After editing a js/ file: `lsp_diagnostics {file}` lists only the errors the
  edit introduced (per-file `// @ts-check`, minus git HEAD). The tests still decide.
- "text match" in a header means the checker cannot type that symbol
  (`window.X`, a file ending in `module.exports`): the rows come from text.
- grep stays right for text, comments, log strings and CSS. Workflows and limits:
  skill `code-nav`.
