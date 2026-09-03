#!/usr/bin/env node
// assert-audit — does each test actually ASSERT anything?
// @doc Does each declared test ASSERT anything? Grades `asserting` / `implicit` / `vacuous`; flags empty `.catch(() => {})`.
// @section runner
//
// The third member of a family. tools/ci/test-observed.mjs answers "has this test
// ever run?"; this one answers the question that survives a yes: "and when it
// ran, did it check anything?" A test body with no assertion passes as long as
// nothing throws. It appears in the report as a green tick beside real tests,
// it inflates the pass count, and it goes on passing after the behaviour it was
// written for is gone. The governing law of this repo is "what a test asserts
// stays true; what only prose says drifts" — a test that asserts nothing is
// prose wearing a test's clothes.
//
// The classification has three tiers, not two, because Playwright hides real
// assertions inside auto-waiting calls:
//
//   asserting  — reaches an expect()/assert(), directly or through a helper
//                defined in the same file. hud-audit's eight capture tests call
//                assertHud(page, mode) and nothing else; a lexical scan of the
//                test body calls them vacuous and is WRONG. Helper following is
//                not a refinement here, it is the difference between a useful
//                report and a false-positive list nobody reads.
//   implicit   — no expect(), but waits on a condition (waitForFunction,
//                locator.waitFor, waitForSelector). Those FAIL on timeout, so
//                they do check something — weakly, with a timeout-shaped error
//                message instead of a diff.
//   vacuous    — neither. Passes if the page does not crash. That is a smoke
//                check at best and a screenshot harness at worst.
//
// Vacuous is not automatically a defect: a capture harness whose product is a
// PNG gallery is legitimately assertion-free. The fix for those is to move them
// out of the default suite (playwright.config.js already sets
// testIgnore: ["**/manual/**"]), not to bolt an expect() onto them. What is
// never legitimate is a vacuous test sitting in a group whose pass count is
// read as coverage.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TESTS = path.join(ROOT, "tests");

const TEST_FNS = new Set(["test", "sharedTest", "it"]);
// Modifiers that still declare a runnable test. `describe` is excluded by name
// below — it is a suite, and its body's assertions belong to its children.
const MODS = new Set(["only", "skip", "fixme", "serial", "parallel", "slow"]);
const ASSERT_BASES = new Set(["expect", "assert"]);
// Auto-waiting calls that fail on timeout. Matched on the METHOD name, since
// they are always reached through a page/locator receiver.
const IMPLICIT_METHODS = new Set(["waitForFunction", "waitFor", "waitForSelector"]);

const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);

function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

// `a.b.c(...)` → {base:"a", mods:["b","c"]}; anything else → null.
function resolveCallee(node) {
  let cur = node;
  const mods = [];
  while (cur.type === "MemberExpression" && !cur.computed && cur.property.type === "Identifier") {
    mods.unshift(cur.property.name);
    cur = cur.object;
  }
  return cur.type === "Identifier" ? { base: cur.name, mods } : null;
}

function titleOf(arg) {
  if (!arg) return null;
  if (arg.type === "Literal") return String(arg.value);
  if (arg.type === "TemplateLiteral") return arg.quasis.map((q) => q.value.cooked).join("${…}");
  return null;
}

// Every function bound to a module-scope NAME, so a test body's call to it can
// be followed. Covers `function f(){}`, `const f = () => {}` and
// `const f = async function(){}` — the three shapes the spec files use.
function collectHelpers(ast) {
  const helpers = new Map();
  each(ast, (n) => {
    if (n.type === "FunctionDeclaration" && n.id) helpers.set(n.id.name, n);
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init &&
        (n.init.type === "ArrowFunctionExpression" || n.init.type === "FunctionExpression")) {
      helpers.set(n.id.name, n.init);
    }
  });
  return helpers;
}

// What a single node contains, WITHOUT following calls.
function scanNode(node) {
  const out = { direct: 0, implicit: 0, calls: new Set(), swallow: 0 };
  each(node, (n) => {
    if (n.type !== "CallExpression") return;
    const r = resolveCallee(n.callee);
    if (r && ASSERT_BASES.has(r.base)) out.direct++;
    if (n.callee.type === "MemberExpression" && n.callee.property?.type === "Identifier") {
      const m = n.callee.property.name;
      if (IMPLICIT_METHODS.has(m)) out.implicit++;
      // `.catch(() => {})` with an empty body turns a rejection into a pass.
      if (m === "catch") {
        const a = n.arguments[0];
        if (a && (a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression") &&
            a.body.type === "BlockStatement" && a.body.body.length === 0) out.swallow++;
      }
    }
    if (r && !r.mods.length) out.calls.add(r.base);
  });
  return out;
}

// Test body + every helper it reaches, to a fixpoint. Without this, the eight
// hud-audit tests that assert ONLY through assertHud() read as vacuous.
function scanReachable(body, helpers) {
  const seen = new Set();
  const queue = [body];
  let direct = 0, implicit = 0, swallow = 0, viaHelper = false;
  let depth = 0;
  while (queue.length) {
    const node = queue.shift();
    const r = scanNode(node);
    if (depth > 0 && r.direct) viaHelper = true;
    direct += r.direct; implicit += r.implicit; swallow += r.swallow;
    for (const name of r.calls) {
      if (seen.has(name) || !helpers.has(name)) continue;
      seen.add(name);
      queue.push(helpers.get(name));
      depth = 1;
    }
  }
  return { direct, implicit, swallow, viaHelper };
}

// `import { test as freshTest } from "./fixtures.js"` declares tests under a
// name this tool has never heard of, and an unrecognised name is not a warning
// — it is silence. Those tests simply drop out of the ratchet, so one could
// lose its last assertion and nothing would say so. The alias is resolved from
// the import rather than guessed, and the local name is what the call site
// uses.
const TEST_SOURCES = /^(\.\/fixtures\.js|\.\.\/helpers\/fixtures\.js|@playwright\/test)$/;

function testNamesIn(ast) {
  const names = new Set(TEST_FNS);
  each(ast, (n) => {
    if (n.type !== "ImportDeclaration" || !TEST_SOURCES.test(n.source.value)) return;
    for (const s of n.specifiers) {
      if (s.type === "ImportSpecifier" && TEST_FNS.has(s.imported.name)) names.add(s.local.name);
    }
  });
  return names;
}

export function scanSource(src, file = "<src>") {
  let ast;
  try {
    ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module", loc: true });
  } catch (e) {
    return { file, parseError: e.message, tests: [] };
  }
  const testFns = testNamesIn(ast);
  const helpers = collectHelpers(ast);
  const tests = [];
  each(ast, (n) => {
    if (n.type !== "CallExpression") return;
    const r = resolveCallee(n.callee);
    if (!r || !testFns.has(r.base)) return;
    if (r.mods.includes("describe") || !r.mods.every((m) => MODS.has(m))) return;
    const title = titleOf(n.arguments[0]);
    // The last function argument is the body — test("x", {annotation}, fn) and
    // test("x", fn) both land here.
    const body = [...n.arguments].reverse().find(
      (a) => a && (a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression"));
    if (title == null || !body) return;
    const s = scanReachable(body, helpers);
    tests.push({
      title,
      line: n.loc.start.line,
      skipped: r.mods.includes("skip") || r.mods.includes("fixme"),
      direct: s.direct,
      implicit: s.implicit,
      swallow: s.swallow,
      viaHelper: s.viaHelper,
      verdict: s.direct > 0 ? "asserting" : s.implicit > 0 ? "implicit" : "vacuous",
    });
  });
  return { file, tests };
}

export function audit(dir = path.join(TESTS, "specs")) {
  const out = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".spec.js")).sort()) {
    const label = path.relative(ROOT, path.join(dir, name)).split(path.sep).join("/");
    out.push(scanSource(fs.readFileSync(path.join(dir, name), "utf8"), label));
  }
  return out;
}

// Files whose product is an image gallery, not an assertion. Listed rather than
// inferred: "no expect() anywhere in the file" would also swallow a real spec
// that had its last assertion deleted, which is the case worth catching.
export const CAPTURE_HARNESSES = new Set([
  "tests/specs/ui-audit.spec.js",
]);

function main() {
  const rows = audit();
  const all = rows.flatMap((r) => r.tests.map((t) => ({ ...t, file: r.file })));
  const live = all.filter((t) => !t.skipped);
  const vacuous = live.filter((t) => t.verdict === "vacuous");
  const implicit = live.filter((t) => t.verdict === "implicit");
  const swallow = live.filter((t) => t.swallow);

  console.log(`declared ${all.length} tests in ${rows.length} spec files ` +
              `(${all.length - live.length} skipped)`);
  console.log(`  asserting  ${live.filter((t) => t.verdict === "asserting").length}` +
              `   (${live.filter((t) => t.viaHelper && t.verdict === "asserting").length} only via a helper)`);
  console.log(`  implicit   ${implicit.length}   (waits on a condition, no expect)`);
  console.log(`  vacuous    ${vacuous.length}   (passes unless something throws)`);

  const group = (list) => {
    const by = new Map();
    for (const t of list) (by.get(t.file) ?? by.set(t.file, []).get(t.file)).push(t);
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  if (vacuous.length) {
    console.log("\nVACUOUS:");
    for (const [file, ts] of group(vacuous)) {
      const tag = CAPTURE_HARNESSES.has(file) ? "  [capture harness]" : "";
      console.log(`  ${file}  ${ts.length}${tag}`);
      if (!CAPTURE_HARNESSES.has(file)) for (const t of ts) console.log(`      :${t.line}  ${t.title.slice(0, 80)}`);
    }
  }
  if (implicit.length) {
    console.log("\nIMPLICIT ONLY (a timeout is the whole assertion):");
    for (const [file, ts] of group(implicit)) {
      console.log(`  ${file}  ${ts.length}`);
      for (const t of ts) console.log(`      :${t.line}  ${t.title.slice(0, 80)}`);
    }
  }
  if (swallow.length) {
    console.log("\nEMPTY .catch(() => {}) — a rejection becomes a pass:");
    for (const t of swallow) console.log(`  ${t.file}:${t.line}  ${t.title.slice(0, 70)}`);
  }
  const pe = rows.filter((r) => r.parseError);
  if (pe.length) {
    console.log("\nPARSE ERRORS:");
    for (const r of pe) console.log(`  ${r.file}: ${r.parseError}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
