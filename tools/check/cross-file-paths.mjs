#!/usr/bin/env node
// cross-file-paths — every relative reference between files resolves to a file
// @doc Every relative reference between files resolves to a file that exists (espree extraction; built for the tests/ split).
// @section runner
// that exists.
//
// Built for the tests/ split (AUDIT-SYNTHESIS §R2), where the whole risk is
// that a path rewrite is MISSED rather than wrong. Most misses announce
// themselves — a static import in a spec that runs throws immediately. The ones
// that don't are the ones this exists for, and R2's lockstep marks five of them
// ⚠ "no guard turns red":
//
//   tools/ui/fit-audit.mjs and tools/ui/menu-fit.mjs wrap their import of
//   ../tests/helpers/f1-api-mock.js in `try { … } catch { /* degrades */ }`. That catch
//   is correct at runtime and fatal to a move: after the split the import fails
//   forever, the tools silently audit an empty data hub, and nothing anywhere
//   goes red.
//
//   tests/specs/f1-track-accuracy.spec.js reads its GeoJSON through
//   `new URL("./data/…", import.meta.url)` — a browser-side failure a grep for
//   `../helpers` will never find.
//
//   And a reference inside a spec that has never been executed here is silent
//   by definition (see tools/ci/test-observed.mjs).
//
// Parsed with espree, not grepped: this repo's test files are full of source
// strings that CONTAIN import statements (tests/unit/assert-audit.test.mjs and
// tests/unit/test-observed.test.mjs both build fixtures out of them), and a regex
// cannot tell a real import from a quoted one. A guard with false positives is
// a guard that gets switched off.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Where a move is planned or plausible. js/ is deliberately excluded: it has no
// imports at all (IIFE + script tags), and tools/manifest.cjs already owns that
// contract.
const SCAN_DIRS = ["tests", "tools"];
const EXTS = new Set([".js", ".mjs", ".cjs"]);
// Playwright snapshot dirs and generated galleries hold no source.
const SKIP_DIR = /(^|\/)(node_modules|galleries|.*\.spec\.js-snapshots)$/;

const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);

function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.test(p)) yield* walk(p);
    } else if (EXTS.has(path.extname(e.name))) {
      yield p;
    }
  }
}

const isRelative = (s) => typeof s === "string" && (s.startsWith("./") || s.startsWith("../"));

// Every relative specifier a mover could break, with the syntax that carried it
// (the syntax decides how it is resolved, and how loudly it fails).
export function referencesIn(src, file) {
  let ast;
  for (const sourceType of ["module", "script"]) {
    try {
      ast = espree.parse(src, { ecmaVersion: "latest", sourceType, loc: true });
      break;
    } catch (e) {
      if (sourceType === "script") return { file, parseError: e.message, refs: [] };
    }
  }
  const refs = [];
  const add = (spec, kind, node) => {
    if (isRelative(spec)) refs.push({ spec, kind, line: node.loc.start.line });
  };
  each(ast, (n) => {
    if ((n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" ||
         n.type === "ExportAllDeclaration") && n.source?.type === "Literal") {
      add(n.source.value, "import", n);
    }
    if (n.type === "ImportExpression" && n.source?.type === "Literal") {
      add(n.source.value, "dynamic import", n);
    }
    if (n.type === "CallExpression" && n.callee.type === "Identifier" &&
        n.callee.name === "require" && n.arguments[0]?.type === "Literal") {
      add(n.arguments[0].value, "require", n);
    }
    // `new URL("./data/x.json", import.meta.url)` — the shape that reads a data
    // file rather than importing code, and the one a `../helpers` grep misses.
    if (n.type === "NewExpression" && n.callee.type === "Identifier" &&
        n.callee.name === "URL" && n.arguments[0]?.type === "Literal") {
      add(n.arguments[0].value, "new URL", n);
    }
  });
  return { file, refs };
}

// require() may omit an extension; ESM may not. Accept the union rather than
// modelling both resolvers — this guard answers "does the target exist", not
// "which resolver would find it".
function resolves(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`,
                      path.join(base, "index.js"), path.join(base, "index.cjs")];
  return candidates.some((c) => fs.existsSync(c));
}

export function audit(root = ROOT) {
  const rows = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(root, file);
      const { parseError, refs } = referencesIn(fs.readFileSync(file, "utf8"), rel);
      if (parseError) { rows.push({ file: rel, parseError }); continue; }
      const broken = refs.filter((r) => !resolves(file, r.spec));
      rows.push({ file: rel, checked: refs.length, broken });
    }
  }
  return rows;
}

function main() {
  const rows = audit();
  const checked = rows.reduce((a, r) => a + (r.checked || 0), 0);
  const broken = rows.flatMap((r) => (r.broken || []).map((b) => ({ ...b, file: r.file })));
  const pe = rows.filter((r) => r.parseError);
  console.log(`checked ${checked} relative references across ${rows.length} files`);
  for (const b of broken) console.log(`  BROKEN ${b.file}:${b.line}  ${b.kind} "${b.spec}"`);
  for (const r of pe) console.log(`  PARSE  ${r.file}: ${r.parseError}`);
  if (broken.length || pe.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
