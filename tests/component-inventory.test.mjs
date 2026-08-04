// THE COMPONENT INVENTORY MUST NOT GO STALE.
//
// docs/COMPONENTS.md maps every class family in css/ to the file that owns it
// and, more importantly, lists the classes defined in MORE THAN ONE file —
// the cross-file coupling that is invisible from either file alone.
//
// That list is not a nicety. `.res-row` and `.res-pos` are defined in both
// components.css and career.css (the championship table deliberately reuses the
// results row), and the only reason anyone knew was that a cascade-layer fix
// happened to grep for it. A map that silently rots is worse than none, because
// it is trusted.
//
// So this checks three things, all cheap:
//   1. every family in css/ is named in the doc
//   2. the doc names no family that has left css/
//   3. the dead-class count the doc quotes is still right
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = path.join(ROOT, "css");
const DOC = path.join(ROOT, "docs", "COMPONENTS.md");

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");

function collect() {
  const defs = new Map(); // class -> Set(file)
  for (const f of fs.readdirSync(CSS).filter((x) => x.endsWith(".css"))) {
    const src = stripComments(fs.readFileSync(path.join(CSS, f), "utf8"));
    for (const m of src.matchAll(/([^{}]+)\{/g)) {
      if (/^\s*@/.test(m[1])) continue;
      for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        if (!defs.has(c[1])) defs.set(c[1], new Set());
        defs.get(c[1]).add(f);
      }
    }
  }
  return defs;
}

const family = (c) => (c.match(/^([a-z]+)-/) || [, null])[1];

test("docs/COMPONENTS.md names every class family in css/", () => {
  const doc = fs.readFileSync(DOC, "utf8");
  const fams = new Set();
  for (const c of collect().keys()) { const f = family(c); if (f) fams.add(f); }
  const missing = [...fams].filter((f) => !doc.includes("`" + f + "-`")).sort();
  assert.deepStrictEqual(missing, [],
    "class families exist in css/ but are not in docs/COMPONENTS.md. A family " +
    "that nobody wrote down is a component nobody can find: " + missing.join(", "));
});

test("docs/COMPONENTS.md names no family that has left css/", () => {
  const doc = fs.readFileSync(DOC, "utf8");
  const fams = new Set();
  for (const c of collect().keys()) { const f = family(c); if (f) fams.add(f); }
  const stale = [...doc.matchAll(/`([a-z]+)-`/g)].map((m) => m[1])
    .filter((f) => !fams.has(f));
  assert.deepStrictEqual([...new Set(stale)].sort(), [],
    "docs/COMPONENTS.md lists families no longer defined in css/");
});

test("the dead-class list is still accurate", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const jsDir = path.join(ROOT, "js");
  const js = fs.readdirSync(jsDir, { recursive: true })
    .filter((p) => String(p).endsWith(".js"))
    .map((p) => fs.readFileSync(path.join(jsDir, String(p)), "utf8")).join("\n");
  const dead = [...collect().keys()].filter((c) => !html.includes(c) && !js.includes(c)).sort();
  const doc = fs.readFileSync(DOC, "utf8");
  const named = dead.filter((c) => doc.includes("`" + c + "`"));
  assert.deepStrictEqual(dead, named,
    "classes are defined in css/ but referenced from neither index.html nor js/, " +
    "and docs/COMPONENTS.md does not name them: " +
    dead.filter((c) => !named.includes(c)).join(", "));
});
