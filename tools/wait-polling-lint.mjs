#!/usr/bin/env node
// wait-polling-lint — a `waitForFunction` timeout that cannot fire is not a bound.
//
// MEASURED (tests/manual/timeout-probe.spec.js): `{ timeout: 3000 }` against a
// predicate that can never be true ran **109,665 ms** on a parked Monza and
// died on the TEST budget instead — 36x its declared bound. It overran on a
// menu page too. Only a predicate that THROWS terminates promptly (11 ms),
// because the exception propagates without polling.
//
// The cause is Playwright's default `polling: 'raf'`: the predicate is
// re-evaluated once per animation frame, and a page running the game loop under
// SwiftShader starves that so badly the declared timeout never gets a turn. The
// fix is `{ polling: 100, timeout: N }`, which polls on a timer instead.
//
// WHY A RATCHET AND NOT A FIX. There are 382 such call sites — 312 under
// tests/ and 70 more under tools/, which this lint claimed to scan for months
// while its file filter admitted only `.js` and every tool is `.mjs`/`.cjs`.
// Rewriting them all in one commit would be a
// 300-site behavioural change landing without a run to back it — the exact
// shape of mistake this session has already made once (58614db2). So: freeze
// the population, require `polling` on anything NEW, and let the existing sites
// be fixed where they can be verified. Same pattern as tests/silent-catch and
// the module-size ceiling.
//
// The visible symptom this prevents: a test reporting `Test timeout of Nms
// exceeded` while pointing at a line that claims to wait 30 s. `tlx-probes`'
// M6 skid spent 344 s inside a 30 s wait that way, and the wrong conclusion
// drawn from it cost two probes before a third measured the truth.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Waits whose default polling is `raf`. `waitForTimeout` is a fixed sleep and
// `waitForSelector`/`locator.waitFor` are driven by the DOM-mutation observer
// rather than by rAF, so they are not exposed to this.
const RAF_WAITS = new Set(["waitForFunction"]);

const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);
function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

const hasKey = (obj, name) =>
  obj && obj.type === "ObjectExpression" &&
  obj.properties.some((p) => p.type === "Property" && !p.computed &&
    ((p.key.type === "Identifier" && p.key.name === name) ||
     (p.key.type === "Literal" && p.key.value === name)));

export function lintSource(src, file = "<src>") {
  let ast;
  try {
    ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module", loc: true });
  } catch (e) {
    return { file, parseError: e.message, sites: [] };
  }
  const sites = [];
  each(ast, (n) => {
    if (n.type !== "CallExpression") return;
    if (n.callee.type !== "MemberExpression" || n.callee.property?.type !== "Identifier") return;
    if (!RAF_WAITS.has(n.callee.property.name)) return;
    // The options object is the last object-literal argument.
    const opts = [...n.arguments].reverse().find((a) => a.type === "ObjectExpression");
    const timeout = hasKey(opts, "timeout");
    const polling = hasKey(opts, "polling");
    // A wait with NO declared timeout inherits the test budget and is honest
    // about it. The defect is a declared bound that cannot fire.
    if (timeout && !polling) sites.push({ line: n.loc.start.line, method: n.callee.property.name });
  });
  return { file, sites };
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* walk(p); }
    // Any JS source, whatever the extension. The trailing clause used to be
    // `endsWith(".js")`, which admitted nothing at all from the tools/ tree the
    // scan list below deliberately includes: every tool is .mjs or .cjs, so the
    // ~50 Playwright-driving waits under tools/ were invisible to a ratchet
    // that reported on them by name.
    else if (/\.(js|mjs|cjs)$/.test(e.name)) yield p;
  }
}

// tests/manual/ is excluded from default discovery and run by hand — and one
// file there must NOT pass polling: timeout-probe.spec.js exists to measure
// what the DEFAULT does, so linting it into compliance would delete the
// evidence for this lint.
const EXEMPT = /^tests\/manual\//;

export function lintAll(root = ROOT) {
  const out = [];
  for (const dir of ["tests", "tools"]) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (EXEMPT.test(rel)) continue;
      const r = lintSource(fs.readFileSync(file, "utf8"), rel);
      if (r.parseError || r.sites.length) out.push(r);
    }
  }
  return out;
}

export function count(root = ROOT) {
  return lintAll(root).reduce((a, r) => a + r.sites.length, 0);
}

function main() {
  const rows = lintAll();
  const n = rows.reduce((a, r) => a + r.sites.length, 0);
  console.log(`waitForFunction calls with a declared timeout but no polling: ${n}`);
  for (const r of rows.sort((a, b) => b.sites.length - a.sites.length)) {
    if (r.parseError) { console.log(`  PARSE ${r.file}: ${r.parseError}`); continue; }
    console.log(`  ${String(r.sites.length).padStart(3)}  ${r.file}`);
  }
  console.log("\nFix: pass { polling: 100, timeout: N } — the default 'raf' polling is");
  console.log("starved by the game's render loop, so the declared timeout never fires.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
