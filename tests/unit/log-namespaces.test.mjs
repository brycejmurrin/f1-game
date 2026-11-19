import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

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
  vm.runInContext(src + "\n;globalThis.__ns = Log.NAMESPACES;", ctx, { filename: absSrc("js/core/log.js") });
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

test("an undefined or function argument is recorded as text, not a blank (hunt 2026-11-02)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/core/log.js"), "utf8");
  const ctx = vm.createContext({ console, Date, performance: { now: () => 0 } });
  vm.runInContext(src + "\n;globalThis.__L = Log;", ctx, { filename: absSrc("js/core/log.js") });
  ctx.__L.error("game", "v=", undefined, () => 1);
  const rec = ctx.__L.records().pop();
  assert.equal(rec.msg, "v= undefined () => 1");
});

// Hunt #5779: LEVELS is an object literal, so an inherited key (`constructor`,
// `toString`, `__proto__`) parsed as a level — a function — every threshold
// comparison went NaN and all logging fell silent.
test("Log.level ignores Object.prototype keys as level names", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/core/log.js"), "utf8");
  const ctx = vm.createContext({ console, Date, performance: { now: () => 0 } });
  vm.runInContext(src + "\n;globalThis.__Log = Log;", ctx, { filename: absSrc("js/core/log.js") });
  const Log = ctx.__Log;
  const base = Log.level();
  for (const bad of ["constructor", "toString", "__proto__", "hasOwnProperty", "buffer:constructor", "track:toString"]) {
    assert.deepEqual(JSON.parse(JSON.stringify(Log.level(bad))), JSON.parse(JSON.stringify(base)), bad);
  }
  assert.equal(Log.level().console, "warn");
  assert.equal(Log.level("debug").console, "debug", "a real level still parses");
});

test("Log buffer is a fixed ring: wrap keeps newest-last order; an overflow emit shifts nothing (perf hunt, #5823)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/core/log.js"), "utf8");
  assert.equal(/bufHead[\s\S]*buf\[bufHead\][\s\S]*bufHead = \(bufHead \+ 1\) % RING/.test(src), true);
  const ctx = vm.createContext({ console, Date, performance: { now: () => 0 } });
  vm.runInContext(src + "\n;globalThis.__L = Log;", ctx, { filename: absSrc("js/core/log.js") });
  const L = ctx.__L;
  L.level("buffer:debug");
  L.clear();
  const RING = 500, N = 40000;
  for (let i = 0; i < RING + 25; i++) L.debug("game", "m" + i);
  const rec = L.records();
  assert.equal(rec.length, RING);
  assert.equal(rec[0].msg, "m25");
  assert.equal(rec[rec.length - 1].msg, "m" + (RING + 24));
  assert.equal(L.records({ limit: 3 }).map((r) => r.msg).join(","), "m522,m523,m524");
  L.clear();
  assert.equal(L.records().length, 0);
  // Why the ring beats push+shift is an operation count, not a stopwatch: a full Array's shift() moves all RING
  // slots on every overflow emit. Timing two loops with performance.now() tied under load (3.4 ms vs 3.4 ms, #5823),
  // so count the context's own Array moves instead: an overflow emit must make none.
  const moves = vm.runInContext(`(() => {
    const n = { shift: 0, splice: 0, unshift: 0 };
    for (const k of Object.keys(n)) { const f = Array.prototype[k]; Array.prototype[k] = function (...a) { n[k]++; return f.apply(this, a); }; }
    return n;
  })()`, ctx);
  vm.runInContext("[1, 2].shift()", ctx);
  assert.equal(moves.shift, 1, "the counter sees a shift in the Log's context (the check can fail)");
  moves.shift = 0;
  L.level("buffer:debug");
  L.clear();
  for (let i = 0; i < N; i++) L.debug("game", "x".repeat(64) + i);
  assert.equal(L.records().length, RING);
  assert.deepEqual({ ...moves }, { shift: 0, splice: 0, unshift: 0 }, `${N} overflow emits moved no Array slots`);
});
