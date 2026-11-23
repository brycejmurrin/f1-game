# JavaScript boundaries review — 2026-10-30

Source: fetched origin deploy branch `claude/f1-game-project-26h3ng`, base
`7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`. Initial checkout was clean at
`2220af2c1`; isolated branch `cursor/js-boundaries-7c6d11`. No other checkout
was switched, reset or stashed. Twenty-one open PRs were inspected; none owned
`js/data/export.js` or `tests/unit/data-export.test.mjs` at selection time.

## Evidence and architectural fit

This is a classic-script IIFE application with generated static and lazy rosters,
not a bundled React application. Requiring `tools/manifest.cjs` gives FULL 325
files / 247 declared hard evaluation edges; LAZY_DATA 18/34, RACE_SESSION 21/5,
NET 23/19 and TRACK_BUILD 17/17. These are declared constraints, not a complete
runtime dependency graph. ScriptLoader owns page-level evaluated/evaluating
registries: instance-local registries would permit duplicate lexical declarations.

Semantic code-nav CLI traced `LazyBundles.create` to `game.js:75` and
`DataExport.create` to its sole caller, `data/hub.js:832`. LazyBundles deliberately
reads context lazily and tolerates an early TDZ; eager dependency injection would
change boot behavior. It has 864 physical lines, two context fields and six injected
callbacks, but its loader branches differ in residency, retry and fallback policy.
A generic loader would conceal meaningful differences.

The `G.player` reference query reports 431 sites in 53 files, explicitly as text
matches for façade accesses. This is a coupling signal, not runtime frequency or
complete alias resolution. `check-gctx` uses scope-resolved references and typed
shadows to check façade names and writability; it does not check expressions
throughout every module. Narrow JSDoc/checkJs seams remain useful.

## Primary-source synthesis

Sources were inspected by an independent research worker on 2026-10-30 using
web fetch/search. Ordinary web search failed; TinyFish fetch worked.

- **Language guarantees:** [TC39 Scripts and Modules](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html)
  (living 2027 draft, accessed 2026-10-30) distinguishes global script environments
  from module linking/evaluation. ESM conversion changes semantics, not just syntax.
  [MDN modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
  (modified 2026-08-21) documents strict mode, module scope, live bindings and cyclic
  initialization hazards. Current local rules prohibit new ESM outside the vendored island.
- **Lazy loading:** [MDN dynamic import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)
  (modified 2026-09-15) documents promise rejection and module caching. An ESM island
  is possible from a classic script, but adds an async boundary, MIME/CORS requirements
  and failure tests. Re-importing is not a lifecycle reset; import has no AbortSignal option.
- **Ownership and cancellation:** [MDN AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
  (modified 2026-09-01) describes one-shot cooperative cancellation. Stale-result
  guards remain necessary for uncancellable work. DataExport deliberately checks hub
  visibility around pacing sleeps: close/reopen between checkpoints survives. Replacing
  that with cancellation would change behavior. Keep error identity, timing and fallback
  policy intact; swallowing a rejection is not a behavior-preserving extraction.
- **Contracts:** [TypeScript JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
  and [checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html) (living docs,
  accessed 2026-10-30) support incremental static checking without runtime imports.
  Runtime validation belongs at untrusted API/storage boundaries; static types do not
  validate fetched data. Whole-project TS needs stable ownership and global declarations.
- **Engine observations:** [V8 Fast properties](https://v8.dev/blog/fast-properties)
  (2017-08-30) explains shape sharing and dictionary properties;
  [V8 Trash talk](https://v8.dev/blog/trash-talk) (2019-01-03) explains reachability and
  generational collection. These are historical engine explanations, not cross-browser
  speed guarantees. Do not pool objects, eliminate closures or snapshot mutable G fields
  solely on appearance. Profile representative frame/GC behavior before hot-loop changes.
- **Delivery alternatives:** [web.dev code splitting](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting)
  (2018-11-05) explains deferred payload costs. Bundling needs measured startup benefit,
  side-effect declarations, reproducible assets and revised cache/deploy tests. Broad ESM
  migration first needs evaluation-time cycle analysis. Neither is justified by line count.

## Candidate ranking

| Rank | Candidate | Benefit | Risk / overlap / verification cost |
| --- | --- | --- | --- |
| 1 | Private DataExport ZIP codec outside UI factory | Removes instance authority from two codec functions and one table; existing archive oracle | Low; no open-PR overlap; strong byte/header and feed tests |
| 2 | Results stint DOM builder with explicit list/colour callback | Removes G/car/tyre authority from renderer | Low-medium; no open-PR overlap; preserve receiver and live per-segment reads; existing UI audit tests |
| 3 | DataIcs input extraction | Narrower schedule dependency | Medium; already narrow seam; public contract design needed |
| 4 | Generic lazy-loader consolidation | Less superficial repetition | High; distinct retries, fallback and residency; broad lifecycle matrix |
| 5 | ESM/bundling/whole-project types | Potential long-term graph tooling | High; policy, deployment and boot prerequisites; cross-session ownership |

## Implemented boundary

CRC_TABLE, crc32 and makeZip now live privately in the existing DataExport IIFE.
Archive operations accept only their file data; they cannot capture ctx, hubOpen,
DOM helpers or gather state. No new file, export, façade member, manifest edge or
script order was introduced. Public surface remains `{create}` and each instance
still exposes `{loadExport,gatherStartLines}`. Factory nesting loses 44 lines of codec
logic; total file size is essentially unchanged. Line count is not the benefit.

The 256-entry Uint32Array is now initialized once when the already-lazy data module
evaluates, rather than once per create. This moves 1 KiB of table allocation earlier
within the data bundle lifecycle and retains it for the module lifetime. All supported
browsers already require typed arrays. TextEncoder and Blob remain operation-time
reads. No asynchronous, request, logging, download or cancellation code changed.
There is no claim of gameplay or frame-time improvement.

Before/after external module edges: unchanged; exported members: 1/1; instance public
members: 2/2; codec helpers nested under UI factory: 2/0; CRC tables per 100 instances:
100/1. Pure algorithm dependency sets stay built-ins plus explicit files; lexical
access to instance state is eliminated. A private-instrumentation probe compares empty,
empty-file, Unicode-name/known CRC and multiple binary-file ZIPs byte-for-byte across
base and candidate, without adding test-only production exports.

## Remaining questions

Which runtime G dependencies cross lazy rosters without declared hard edges? Which
modules need expression checking beyond façade parity? Can operation identity and
teardown contracts be documented before changing cancellation? Does measured browser
startup justify an ESM island? None is answered by this cold-path extraction.

Hosted Apex/LSP initially returned HTTP 429; checkout semantic CLI worked. Real GPU,
heap and frame profiling are outside this change's evidence. A Node CPU/allocation
probe is only evidence about factory construction and deterministic table counts.

## Verification results

- Original export suite: 10/10 pass; expanded suite against original source: 11/11 pass.
- Refactored expanded suite: 11/11 pass, including independent instances and identical archives.
- Private codec probe: all four ZIP fixtures byte-identical across versions and first/hundredth
  instances; observed tables/functions 100/100 before and 1/1 after. CPU profile captured
  under ignored `artifacts/review/`; its short synthetic workload is not frame-time evidence.
- Semantic diagnostics: zero introduced errors in `js/data/export.js`.
- Full browser groups and actual GPU performance remain unverified. Consult the PR Hand-off
  for the final structural and single-spec outcomes; those checks were running when this note
  was drafted. Regenerable logs live under ignored `artifacts/review/`.
