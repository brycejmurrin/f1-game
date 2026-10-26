#!/usr/bin/env node
// vm-filename-lint — vm source loads in tests/unit and tests/helpers must name an ABSOLUTE filename.
// @doc Flags a vm source load in tests/unit or tests/helpers with a relative filename, which breakpoints and coverage miss.
// @section runner
//
// MEASURED (docs/notes/NODE-DEBUGGING-2026-10-19.md §Q1): V8 reports a vm script under exactly the `filename` it was
// given and Node turns only an absolute path into a `file://` URL. `filename: "js/game.js"` reports `js/game.js`, so a
// `file:///…/js/game.js` breakpoint hits 0 times and `--experimental-test-coverage` never lists the file. The fix is
// `filename: absSrc("js/game.js")` (tests/helpers/abs-src.mjs), which is `path.join(ROOT, rel)`.
//
// Flagged (`relative`): a `filename` that is a literal or a template/identifier with no path call around it. Accepted:
// any call (`absSrc(f)`, `path.join(ROOT, f)`, `fileURLToPath(…)`) or an expression that mentions `ROOT`.
// Informational (`missing`): a load with no `filename` at all; reported, not failed (a source string built at run time
// has no single file to name; the R1 preload hashes those back to js/).
// Ratcheted (`missing` with `src`): a filename-less load whose code is not a fixed snippet (a literal or a plain
// template) — a source text read from a file, which V8 coverage then cannot attribute. SRC_CEILING is the count
// (`tree.vmSrcLoads` in tests/data/ratchets.json since 2026-10-26, so a raise is a ratchets.d fragment; the test judges
// it diff-relative on a PR, tools/check/ratchets.mjs ratchetMode); it only goes down: above it fails; below it prints the lower value (not a failure, so a PR that removes loads never
// reddens another's run) (B·H11, PR #3388).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SCAN_DIRS = ["tests/unit", "tests/helpers"];

// method -> index of the options argument
const OPTS_AT = { runInContext: 2, runInNewContext: 2, runInThisContext: 1 };
const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);

export function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

export const FILE_LIKE = /\.(?:c|m)?js(?:#.*)?$/;
const isVm = (n) => n?.type === "Identifier" && n.name === "vm";

/** Every vm load in `src`: { node, optsIdx, line, filenameProp?, opts? }. `ast` is null when the file does not parse. */
export function findVmCalls(src) {
  let ast;
  try { ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module", loc: true, range: true }); }
  catch { return { ast: null, calls: [] }; }
  const calls = [];
  each(ast, (n) => {
    let optsIdx = -1;
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && isVm(n.callee.object) &&
        n.callee.property.type === "Identifier" && n.callee.property.name in OPTS_AT) {
      optsIdx = OPTS_AT[n.callee.property.name];
    } else if (n.type === "NewExpression" && n.callee.type === "MemberExpression" && isVm(n.callee.object) &&
               n.callee.property.type === "Identifier" && n.callee.property.name === "Script") {
      optsIdx = 1;
    } else return;
    const opts = n.arguments[optsIdx];
    const filenameProp = opts?.type === "ObjectExpression"
      ? opts.properties.find((p) => p.type === "Property" && !p.computed &&
          ((p.key.type === "Identifier" && p.key.name === "filename") || (p.key.type === "Literal" && p.key.value === "filename")))
      : undefined;
    calls.push({ node: n, optsIdx, opts, filenameProp, line: n.loc.start.line });
  });
  return { ast, calls };
}

const mentionsRoot = (expr) => {
  let hit = false;
  each(expr, (n) => { if (n.type === "Identifier" && n.name === "ROOT") hit = true; });
  return hit;
};

/** A filename expression V8 sees as absolute: any call, or anything built from ROOT. */
export function isAbsoluteExpr(expr) {
  if (!expr) return false;
  // A synthetic label ("vm-page:initScript") names no file, so there is nothing for a breakpoint to map to.
  if (expr.type === "Literal" && typeof expr.value === "string" && !FILE_LIKE.test(expr.value)) return true;
  if (expr.type === "CallExpression") return true;
  return mentionsRoot(expr);
}

export function lintSource(src, file = "<src>") {
  const { ast, calls } = findVmCalls(src);
  if (!ast) return { file, parseError: true, sites: [] };
  const sites = [];
  for (const c of calls) {
    if (c.filenameProp) {
      if (!isAbsoluteExpr(c.filenameProp.value)) sites.push({ line: c.line, kind: "relative" });
    } else if (c.opts?.type === "ObjectExpression" || !c.opts) {
      const code = c.node.arguments[0];
      const snippet = !code || code.type === "Literal" || (code.type === "TemplateLiteral" && code.expressions.length === 0);
      sites.push({ line: c.line, kind: "missing", src: !snippet });
    }
  }
  return { file, sites };
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "fixtures") yield* walk(p); }
    else if (/\.(js|mjs|cjs)$/.test(e.name)) yield p;
  }
}

export function lintAll(root = ROOT) {
  const out = [];
  for (const d of SCAN_DIRS) {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of walk(abs)) out.push(lintSource(fs.readFileSync(f, "utf8"), path.relative(root, f)));
  }
  return out;
}

export function count(results, kind) {
  return results.reduce((a, r) => a + r.sites.filter((s) => s.kind === kind).length, 0);
}

/** Filename-less loads of a source text (not a fixed snippet): the ratcheted count. */
export function countSrc(results) {
  return results.reduce((a, r) => a + r.sites.filter((s) => s.kind === "missing" && s.src).length, 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Read here, not at module scope: ratchets.mjs imports this file to count, and a static cycle deadlocks its main().
  const SRC_CEILING = (await import("./ratchets.mjs")).load().tree.vmSrcLoads;
  const results = lintAll();
  const bad = results.flatMap((r) => r.sites.filter((s) => s.kind === "relative").map((s) => `${r.file}:${s.line}`));
  for (const b of bad) console.error(`vm-filename-lint: relative filename at ${b} (use absSrc(rel) from tests/helpers/abs-src.mjs)`);
  const unparsed = results.filter((r) => r.parseError).map((r) => r.file);
  for (const u of unparsed) console.error(`vm-filename-lint: could not parse ${u}`);
  const src = countSrc(results);
  if (src > SRC_CEILING) console.error(`vm-filename-lint: ${src} source loads without a filename, over the ceiling ${SRC_CEILING} (pass { filename: absSrc(rel) })`);
  if (src < SRC_CEILING) console.log(`vm-filename-lint: ${src} source loads without a filename, under the ceiling ${SRC_CEILING}: lower SRC_CEILING to ${src}`);
  console.log(`vm-filename-lint: ${bad.length} relative, ${count(results, "missing")} without filename (${src} source loads, ceiling ${SRC_CEILING}), ${unparsed.length} unparsed`);
  process.exit(bad.length || unparsed.length || src > SRC_CEILING ? 1 : 0);
}
