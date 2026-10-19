import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// AGENTS.md: logging goes through Log (js/core/log.js), never bare console.* —
// namespace first arg, console threshold warn, ring buffer info. Stated for
// years, enforced never; a round-6 census found one live violation (fixed)
// and one legitimate exception. This scan keeps it that way. The exception:
// js/net/nostr.js does not LOG through console — it saves, replaces and
// restores console.warn to intercept a Trystero vendor warning, the one seam
// available ("Intercepting console.warn is not elegant. It is the ONLY
// seam…"), so its console references are the interception mechanism itself.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ALLOW = {
  "js/core/log.js": "the Log implementation itself",
  "js/net/nostr.js": "console.warn interception seam for a Trystero vendor warning (save/replace/restore, not logging)",
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Blank out comments and string/template contents (keeping newlines) so a `//` inside a
// string literal ('http://…') does not swallow the rest of the line, and prose or string
// text mentioning console.log never counts.
function codeMask(src) {
  let out = "", i = 0;
  const blank = (t) => t.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); const j = e < 0 ? src.length : e; out += blank(src.slice(i, j)); i = j; }
    else if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); const j = e < 0 ? src.length : e + 2; out += blank(src.slice(i, j)); i = j; }
    else if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      out += c + blank(src.slice(i + 1, j)) + (src[j] || ""); i = j + 1;
    } else { out += c; i++; }
  }
  return out;
}
const bareConsole = (src) => [...codeMask(src).matchAll(/\bconsole\s*\.\s*(log|warn|error|info|debug|trace)\s*\(/g)]
  .map((m) => m[1]);

test("the bare-console scan detects known-bad fixtures and ignores prose", () => {
  assert.deepEqual(bareConsole("console.log(1);"), ["log"]);
  assert.deepEqual(bareConsole("const u = 'http://x.test'; console.warn(u);"), ["warn"],
    "a // inside a string must not hide a later console call");
  assert.deepEqual(bareConsole("x();\n  console\n .error('e')"), ["error"]);
  assert.deepEqual(bareConsole("// console.log(1)\n/* console.warn(2) */ const s = 'console.info(3)';"), []);
});

test("no bare console.* outside js/core/log.js (allowlisted seams excepted)", () => {
  const bad = [];
  for (const p of walk(path.join(ROOT, "js"))) {
    const rel = path.relative(ROOT, p).split(path.sep).join("/");
    if (ALLOW[rel]) continue;
    for (const kind of bareConsole(fs.readFileSync(p, "utf8"))) bad.push(`${rel} console.${kind}`);
  }
  assert.deepEqual(bad, [],
    "bare console.* in js/ — route through Log (namespace first arg; " +
    "Log.enabled(ns, level) guards hot paths), or allowlist a genuine seam " +
    "with its reason: " + bad.join(", "));
});
