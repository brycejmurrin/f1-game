// @doc Deploy-only minify of the staged js/ tree (terser, names kept, unlinked .map beside each file).
// @skill check-changes
/**
 * minify.mjs — shrink the STAGED copy of js/**\/*.js, never the source.
 *
 * Runs inside stageSite() after the copy and before any stamp, so bump-cache's
 * ?v= content hashes and SRI digests cover the minified bytes (issue #3110
 * finding 1; docs/notes/STAGE-MINIFY-2026-10-19.md has the measurements).
 *
 * The options are chosen for what this codebase reads back out of itself:
 *   - compress: false. No constant folding, no dead-code drop, no `a["b"]` → `a.b`:
 *     only whitespace, comments and local names change.
 *   - mangle locals only (toplevel: false). Every file is a classic-script IIFE
 *     assigning one global, and top-level `const`/`function` names are shared
 *     across scripts (tools/manifest.cjs HARD_EDGES), so the top level stays.
 *   - keep_fnames + keep_classnames: Log tags, stack frames and any `fn.name`
 *     read stay readable.
 *   - keep_quoted_props + quote_style 3: String(fn) scans of scenery closures
 *     (js/core/lazy-bundles.js sceneryModels, js/track/build-client.js,
 *     js/track/build-worker.js → Assets.modelIds) find model ids as QUOTED
 *     literals; a `{ "id": … }` key must keep its quotes or the circuit loses
 *     its baked model. tests/unit/stage-minify.test.mjs pins every closure.
 *   - comments "some" (terser's default): @license / @preserve / /*! survive.
 * Options reference: https://terser.org/docs/api-reference/ and
 * https://github.com/terser/terser#format-options (terser pinned in package.json).
 *
 * Each minified file gets `<file>.map` next to it with NO sourceMappingURL
 * comment: the player never fetches it, a developer de-minifying a stack trace
 * from the live site points a tool at it (sources name the repo path).
 */
import fs from "node:fs";
import path from "node:path";
import { minify } from "terser";

/** terser options: one frozen object so the test and the stage cannot drift. */
export const MINIFY_OPTIONS = Object.freeze({
  compress: false,
  mangle: { toplevel: false },
  toplevel: false,
  module: false,
  keep_fnames: true,
  keep_classnames: true,
  format: { comments: "some", keep_quoted_props: true, quote_style: 3 },
});

/** Staged paths (POSIX, relative to the site root) the minifier must not touch. */
export function minifyExcluded(rel) {
  return !rel.startsWith("js/") || !rel.endsWith(".js")
    || rel.split("/").includes("vendor");   // a vendored island ships as its authors built it
}

/** Every staged js file to minify, sorted (POSIX paths relative to `siteRoot`). */
export function minifyTargets(siteRoot) {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        const rel = path.relative(siteRoot, abs).split(path.sep).join("/");
        if (!minifyExcluded(rel)) out.push(rel);
      }
    }
  };
  if (fs.existsSync(path.join(siteRoot, "js"))) walk(path.join(siteRoot, "js"));
  return out.sort();
}

/**
 * Minify one source text. Returns { code, map }.
 * @param {string} src
 * @param {string} rel staged path, e.g. "js/core/log.js"
 */
export async function minifySource(src, rel) {
  const r = await minify({ [rel]: src }, {
    ...MINIFY_OPTIONS,
    format: { ...MINIFY_OPTIONS.format },
    sourceMap: { filename: path.posix.basename(rel) },   // no `url`: the shipped file never links its map
  });
  if (typeof r.code !== "string") throw new Error(`minify: terser returned no code for ${rel}`);
  return { code: r.code, map: typeof r.map === "string" ? r.map : JSON.stringify(r.map) };
}

/**
 * Minify the staged tree in place; writes `<file>.map` beside each file.
 * Deterministic: same input bytes and options → same output bytes.
 * @param {string} siteRoot
 * @param {{ jobs?: number }} [opts]
 * @returns {Promise<{ files: number, before: number, after: number }>}
 */
export async function minifyStaged(siteRoot, opts = {}) {
  const targets = minifyTargets(siteRoot);
  const jobs = Math.max(1, opts.jobs || 8);
  let before = 0, after = 0, next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const rel = targets[next++];
      const abs = path.join(siteRoot, rel);
      const src = fs.readFileSync(abs, "utf8");
      let out;
      try { out = await minifySource(src, rel); }
      catch (e) { throw new Error(`minify: ${rel}: ${e.message}`); }
      before += Buffer.byteLength(src);
      after += Buffer.byteLength(out.code);
      fs.writeFileSync(abs, out.code);
      fs.writeFileSync(abs + ".map", out.map);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  return { files: targets.length, before, after };
}
