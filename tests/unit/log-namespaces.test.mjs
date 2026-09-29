import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// js/core/log.js declares Log.NAMESPACES, and nothing enforced it: "race" and
// "xr" were in use for months without being declared, so a `?log=race:debug`
// reader had no list to discover them from. This scan asks that every LITERAL
// namespace passed to a Log call in js/ or an index.html inline script is
// declared. A computed namespace (a variable) is out of scope — it cannot be
// read statically — and a comment mentioning a call does not count.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CALL = /\bLog\s*\.\s*(error|warn|info|debug|trace|time)\s*\(\s*(["'`])([^"'`\n]*)\2/g;

function namespaceList() {
  // Evaluate log.js for real (not a regex over the array) so the test reads
  // exactly what the page's Log.NAMESPACES will hold.
  const src = fs.readFileSync(path.join(ROOT, "js/core/log.js"), "utf8");
  const ctx = vm.createContext({ console, Date, performance: { now: () => 0 } });
  vm.runInContext(src + "\n;globalThis.__ns = Log.NAMESPACES;", ctx, { filename: "log.js" });
  return Array.from(ctx.__ns);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

function sources() {
  const out = [];
  for (const p of walk(path.join(ROOT, "js"))) {
    out.push({ rel: path.relative(ROOT, p).split(path.sep).join("/"), code: fs.readFileSync(p, "utf8") });
  }
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  let i = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    out.push({ rel: `index.html#inline-script-${++i}`, code: m[1] });
  }
  return out;
}

test("Log.NAMESPACES evaluates from log.js and is duplicate-free", () => {
  const list = namespaceList();
  assert.ok(list.length > 0, "Log.NAMESPACES is empty");
  assert.equal(new Set(list).size, list.length, "Log.NAMESPACES has duplicates: " + list.join(","));
});

test("every literal Log.<level>(ns, …) namespace is declared in Log.NAMESPACES", () => {
  const declared = new Set(namespaceList());
  const bad = [];
  let calls = 0;
  for (const { rel, code: raw } of sources()) {
    const code = stripComments(raw);
    for (const m of code.matchAll(CALL)) {
      calls++;
      if (!declared.has(m[3])) {
        const line = code.slice(0, m.index).split("\n").length;
        bad.push(`${rel}:~${line} Log.${m[1]}("${m[3]}")`);
      }
    }
  }
  // A scan that silently matched nothing would pass forever.
  assert.ok(calls > 100, `the scan matched only ${calls} Log calls — the pattern has drifted`);
  assert.deepEqual(bad, [],
    "undeclared Log namespace — add it to NAMESPACES in js/core/log.js " +
    "(or use an existing one): " + bad.join(", "));
});
