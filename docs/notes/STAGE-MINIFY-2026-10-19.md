# Deploy-only JS minify + staged-boot gate — 2026-10-19

Issue #3110 finding 1: phone cold start is dominated by script download and
parse of 7.1 MB of unminified startup JS. This lane (B·W5·L18, Bryce's grant
"Separate PR with boot gate") minifies js/ at stage time only. Source, tests
and a local serve stay unminified (no build step for development).

## What changed

- `tools/desktop/minify.mjs` — terser over the STAGED `js/**/*.js` (no
  `vendor/` path; root `vendor/` and `sw.js` are not under js/, so the
  vendored three.js island, rapier, jsQR and the worker shell ship as they are).
- `tools/desktop/stage.mjs` — the CLI minifies after the copy and before any
  stamp, so bump-cache's `?v=` content hashes and SRI digests are computed over
  the minified bytes. `--no-minify` stages source bytes (the A/B baseline).
  `stageSite()` (the sync copy the unit tests call) is unchanged;
  `stageSiteMinified()` is copy + minify.
- `.github/workflows/ci.yml` job `staged-boot` — stages and stamps exactly as
  pages.yml's deploy job does, serves `_site` alone and runs `smoke.spec.js`
  against it. It runs on the same tiers as `smoke` (ready/full PR runs, the
  pages.yml gate, which calls ci.yml; not the draft fast tier), is in
  `ci-verdict` needs and in its full-tier REQUIRE_SUCCESS list.
  pages.yml itself is not edited: its gate IS ci.yml (`jobs.ci.uses`).
- `tests/unit/stage-minify.test.mjs` (tooling-fast, ~20 s).

## Options and why

| option | value | reason |
|---|---|---|
| compress | `false` | no folding, no dead-code drop, no `a["b"]`→`a.b`; only whitespace, comments and local names change |
| mangle | locals only (`toplevel: false`) | classic scripts share top-level `const`/`function` names (HARD_EDGES) |
| keep_fnames / keep_classnames | `true` | Log tags, stack frames, `fn.name` |
| format.keep_quoted_props, quote_style 3 | `true`, original quotes | `Assets.modelIds(String(fn))` finds model ids as quoted literals in scenery closures |
| format.comments | `"some"` (default) | `@license` / `@preserve` / `/*!` survive |
| sourceMap | `<file>.map` beside each file, no `url` | never linked or fetched; `sources` names the repo path |

Docs read: https://terser.org/docs/api-reference/ (minify, sourceMap
`url`/`filename`, keep_fnames, compress false, module/toplevel defaults) and
https://github.com/terser/terser#format-options (keep_quoted_props,
quote_style, comments). terser 5.51.2 was already an exact devDependency.

## Risks checked on the MINIFIED output

- **String(fn) scans** (`js/core/lazy-bundles.js` sceneryModels,
  `js/track/build-client.js`, `js/track/build-worker.js` → `Assets.modelIds`):
  the unit test evaluates every `js/circuits/scenery/*.js` and circuit file
  source and minified and asserts each closure names the same model ids.
- **Top-level names / HARD_EDGES**: the unit test parses every target before
  and after (terser AST) and asserts identical top-level declarations.
- **Directives**: every file whose first statement was `"use strict"` still
  starts with it.
- **`fn.name` / `Function.prototype.toString`**: keep_fnames; no other
  `toString()` of a function in js/ (grep, 2026-10-19).
- **Boot**: the `staged-boot` job (smoke.spec.js against the stamped `_site`).

## Determinism

pages.yml `verify-live` rebuilds the stamped tree with the same stage.mjs and
compares response bytes, so the stage must be byte-reproducible.
MEASURED: two `node tools/desktop/stage.mjs --out <dir>` runs from the same
checkout, `diff -r` → identical (542 files + 542 maps). The unit test pins the
same property on a sample with different `jobs` concurrency.

## Measurements

FILLED BELOW.
