import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A top-level `const Foo = …` in a classic <script> is a GLOBAL LEXICAL
// binding, not a property of window. So `window.Foo` is undefined in every
// browser while bare `Foo` resolves — and a guard written `if (window.Foo)`
// is permanently false. The VM harnesses (tools/lib/game-vm.cjs and friends)
// rewrite ^const → var, which DOES create the window property, so every node
// test sees the opposite of production. That is how the BRAKE CUE slider,
// the menu select/tick sounds and haptics priming shipped dead (2026-09-22
// bug hunt). The fix is `typeof Foo !== "undefined"`; this scan keeps it so:
// any `window|globalThis|self.Name` read, where Name is a top-level
// const/let/class that no file ever assigns onto window, fails.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

test("no window.X guard reads a top-level lexical global that is never on window", () => {
  const files = walk(path.join(ROOT, "js")).map((p) => ({
    rel: path.relative(ROOT, p).split(path.sep).join("/"),
    code: stripComments(fs.readFileSync(p, "utf8")),
  }));
  const lexical = new Map();   // name -> declaring file
  const onWindow = new Set();
  for (const f of files) {
    for (const m of f.code.matchAll(/^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (!lexical.has(m[1])) lexical.set(m[1], f.rel);
    }
    for (const m of f.code.matchAll(/\b(?:window|globalThis|self)\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g)) onWindow.add(m[1]);
    for (const m of f.code.matchAll(/\b(?:window|globalThis|self)\s*\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]\s*=(?!=)/g)) onWindow.add(m[1]);
  }
  const bad = [];
  for (const f of files) {
    f.code.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/\b(?:window|globalThis|self)\s*\.\s*([A-Za-z_$][\w$]*)\b(?!\s*=(?!=))/g)) {
        const name = m[1];
        if (lexical.has(name) && !onWindow.has(name)) {
          bad.push(`${f.rel}:${i + 1} reads ${m[0].trim()} — ${name} is a top-level lexical in ${lexical.get(name)}; use typeof ${name} !== "undefined"`);
        }
      }
    });
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
