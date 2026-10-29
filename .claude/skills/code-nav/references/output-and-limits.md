# Reading apex-lsp output, and its limits

## Reading the output

- Rows read `file:line:col  [tag] (Module › fn)  source`. The tags:
  - `[def]`: the declaration, always listed first for a definition;
  - `[export]`: the IIFE's `return { … }` entry;
  - `[alias]`: `const { x } = Head` or `const x = Head.x`;
  - `[use]`: a read or call.
- "N definitions (+M export/alias rows)": N real declarations. Several
  same-named top-level functions (`wrapS`) are all listed, never one guessed.
  For references, a name with more than 4 unrelated declarations (`create`:
  170) is refused, because following one would be a guess. Pass `Head.member`
  or `file`+`line` instead. A case slip gets "did you mean TLX (…)?".
- `lsp_callers` follows `const lerp = M4.lerp` to the local calls, marked
  `(via lerp)`. Counted the plain way, `M4.lerp` has 11 alias lines; its real
  callers are 112 calls in 53 functions.
- "N of them through a destructure or alias": text counts include those rows,
  which grep would miss.
- "text match: …" in the header: the checker cannot type the symbol, so the
  rows come from text, following destructures. That happens for `window.X`
  globals (`PhysicsConsts`, `CssZoom`) and for files ending in
  `module.exports = X` (`ghost.js`, `ghost-share.js`, `input-ghost.js`,
  `forecast.js`, `share-code.js`), which the checker scopes to their own file.
- An error such as "has no member" or "not found" is the answer; the next step is
  SKILL.md §Which call (on a miss).
- Long output pages: the footer names the next `offset`, and `format: "concise"`
  on `lsp_references` drops the source text. Start with counts (`files: true`)
  when file scope is enough; otherwise use a bounded page. Follow the footer's
  `offset` when impact analysis needs every caller/use; a first page is not exhaustive.
- Read progressively: outline → relevant definition with `body: true` → affected
  callers. Request detailed references or a larger `maxLines` when source context
  is needed; do not infer a complete body from a capped excerpt. Keep tool errors
  and diagnostics visible rather than summarizing them into a success.

## Limits (measured 2026-10-18, `docs/notes/LSP-MCP-2026-10-18.md`)

- The first call takes ~1–2 s (project load). After that it's 7–70 ms, and up to
  ~155 ms for text answers over `G`. `tsc` holds ~400 MB, starts on the first
  call and exits after 10 idle minutes (`APEX_LSP_IDLE_MS`).
- JS parameters are optional to the checker: TS2554 catches too many
  arguments, never too few. TS2339 (property missing) is filtered out as noise.
- A façade passed under another name (`create(ctx)`) is not followed. In this
  tree `ctx` is a different object.
- Hover types JS parameters as `any` unless JSDoc says otherwise.
- Factory instances, conditional receivers, callbacks and inline HTML can
  escape a static query. Follow the returned binding before claiming no
  consumers; use the bounded cross-check procedure in
  [code investigations](../../../../docs/research/AGENT-CODE-INVESTIGATIONS.md).
