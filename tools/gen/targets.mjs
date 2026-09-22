#!/usr/bin/env node
// @doc Prints the GENERATED doc paths (`TARGET` of every gen-*.mjs doc generator), one per line; the hooks derive their block list from it.
//
// The commit hook (.claude/hooks/bash-guard.sh) treats a commit as prose-only
// — and skips the ratchets and guards — when every staged path is docs, EXCEPT
// a generated doc, whose source is code. That exception list was four
// hard-coded names in the hook, so a fifth generator would have landed as
// "prose" and skipped the generated-docs guard. This prints the list from the
// generators themselves; the hook falls back to its own copy only when node
// cannot run.
//
//   node tools/gen/targets.mjs          # docs/ARCHITECTURE.md … one per line
//   node tools/gen/targets.mjs --json
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The doc generators, in the order `npm run gen:docs` runs them. Each
 *  exports `TARGET`, the repo-relative file it writes. */
export const GENERATORS = [
  "./gen-tools-readme.mjs",
  "./gen-slider-doc.mjs",
  "./gen-hooks-table.mjs",
  "./gen-arch-table.mjs",
];

export async function targets() {
  const out = [];
  for (const g of GENERATORS) {
    const m = await import(g);
    if (typeof m.TARGET !== "string") throw new Error(`${g} exports no TARGET string`);
    out.push(m.TARGET);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = await targets();
  if (process.argv.includes("--json")) console.log(JSON.stringify(t));
  else for (const x of t) console.log(x);
}
