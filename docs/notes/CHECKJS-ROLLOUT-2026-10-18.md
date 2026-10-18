# Opt-in checkJs rollout (2026-10-18)

Type-check plain-JS modules through JSDoc and the repo's local `tsc` (TypeScript 7.x, `noEmit`). No build step, nothing
ships, no runtime change. Bryce: "Set that up with one session" (2026-10-18).

## How it works

The config is `tsconfig.checkjs.json`, not `tsconfig.json`: a root `tsconfig.json` is discovered before the root `jsconfig.json` that
the `apex-lsp` MCP server (PR #2832) uses for its whole-`js/` project, and would shrink that project to `js/physics`. The checker
passes `-p tsconfig.checkjs.json` explicitly.

- `tsconfig.checkjs.json`: `allowJs`, `checkJs: false`, `noEmit`, `include` = `js/physics/*.js` + `types/checkjs-globals.d.ts`.
  With `checkJs` off, tsc still parses every included file (so cross-file globals such as `ContactGeometry` and
  `AiDrive` are inferred from their own JS) but REPORTS only files that start with `// @ts-check`. Chosen over an
  explicit per-file `include` list: opting in is one line in the file, and the checker cannot drift from a list.
- `node tools/check/check-js-types.mjs [--json]` runs it (~0.5 s); `tests/unit/check-js-types.test.mjs` is in
  `test:tooling-fast`.
- `strict` is off; `strictNullChecks` is on (it found the only real findings in the starters: `ctx.leadProg` etc.
  after a `Number.isFinite` guard tsc cannot narrow). `noImplicitAny` stays off so untyped params cost nothing.

## Opt a file in

1. Put `// @ts-check` on line 1 of the file (a pure comment).
2. `node tools/check/check-js-types.mjs`. Fix with JSDoc only: `@param`, `@type`, or `/** @type {number} */ (expr)`
   casts. Never reshape runtime code to please tsc.
3. A global defined in a file OUTSIDE tsconfig `include` (e.g. `Log`) gets an ambient `declare const` in
   `types/checkjs-globals.d.ts`. A global defined in an included file must NOT be declared there (duplicate
   declaration).
4. Add the file to the starter list in `tests/unit/check-js-types.test.mjs` if it should be pinned.

Starters: `js/physics/wall-end-face.js`, `ai-band.js`, `ai-corridor.js`.

## Rollout order

1. `js/physics/` (pure, small, few globals) — `include` already covers the directory; opt files in one by one.
2. `js/track/` — add `js/track/*.js` to `include`, then opt in.
3. Everything else only when asked. `js/game.js` and `js/render/**` are out of scope until the façade types
   (`types/game-ctx.d.ts`, `check-gctx.mjs`) are the model for them.

## What NOT to do

- No `.ts` files, no ES modules (`import`/`export`), no bundler, no transpile step.
- No `checkJs: true` globally: ~every module would go red at once.
- No `@ts-ignore` to get green; fix the type or narrow the claim.
- Do not run it on the shipped files' behalf: `types/` and `tsconfig.checkjs.json` are never served or cached.

## References

- TSConfig `checkJs` / `allowJs` / `noEmit`: https://www.typescriptlang.org/tsconfig/#checkJs
- Type checking JS files (`// @ts-check`, JSDoc): https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html
- JSDoc supported tags: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html

## Bite proof

Changing `const FACE_KEEP = 0.2;` to `"0.2"` in `wall-end-face.js` makes the checker exit 1
(`TS2363` at the `c.speed *= FACE_KEEP` line); reverted.
