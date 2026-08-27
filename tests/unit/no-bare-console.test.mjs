import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// AGENTS.md: logging goes through Log (js/log.js), never bare console.* —
// namespace first arg, console threshold warn, ring buffer info. Stated for
// years, enforced never; a round-6 census found one live violation (fixed)
// and one legitimate exception. This scan keeps it that way. The exception:
// js/net/nostr.js does not LOG through console — it saves, replaces and
// restores console.warn to intercept a Trystero vendor warning, the one seam
// available ("Intercepting console.warn is not elegant. It is the ONLY
// seam…"), so its console references are the interception mechanism itself.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ALLOW = {
  "js/log.js": "the Log implementation itself",
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

test("no bare console.* outside js/log.js (allowlisted seams excepted)", () => {
  const bad = [];
  for (const p of walk(path.join(ROOT, "js"))) {
    const rel = path.relative(ROOT, p).split(path.sep).join("/");
    if (ALLOW[rel]) continue;
    const src = fs.readFileSync(p, "utf8");
    // Strip comments so prose mentioning console.log does not count.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const m of code.matchAll(/\bconsole\s*\.\s*(log|warn|error|info|debug|trace)\s*\(/g)) {
      const line = code.slice(0, m.index).split("\n").length;
      bad.push(`${rel}:~${line} console.${m[1]}`);
    }
  }
  assert.deepEqual(bad, [],
    "bare console.* in js/ — route through Log (namespace first arg; " +
    "Log.enabled(ns, level) guards hot paths), or allowlist a genuine seam " +
    "with its reason: " + bad.join(", "));
});
