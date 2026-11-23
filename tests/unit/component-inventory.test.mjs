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
// So this checks, all cheaply:
//   1. every family in css/ is named in the doc
//   2. the doc names no family that has left css/
//   3. every dead class is named in the doc
//   4. every class defined in more than one file is named in the doc
//   5. each family row names its real owner and exactly its other files
//   6. each shared-class bullet names exactly the files defining its classes
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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

// THE CLAIM THAT ACTUALLY ROTTED. `collect()` has always returned class -> Set(file),
// so the cross-file coupling data was computed and then never asserted — and the
// "Defined in more than one file" section duly went stale while all three tests
// stayed green. Twelve classes were missing when this was added, `.sheet-foot`
// among them: the most-shared class in the project, defined in SIX files
// (components, menus, overlays, carsetup, career, tuner) and named nowhere.
//
// This is the governing law of the repo in one test — what a guard asserts stays
// true, what only prose says drifts — applied to the guard that was itself only
// asserting the easy half.
test("every class defined in more than one file is named in the doc", () => {
  const doc = fs.readFileSync(DOC, "utf8");
  const shared = [...collect().entries()]
    .filter(([, files]) => files.size > 1)
    .map(([c]) => c)
    .sort();
  const missing = shared.filter((c) => !doc.includes("`." + c + "`"));
  assert.deepStrictEqual(missing, [],
    "classes are defined in more than one css/ file but are not named in " +
    "docs/COMPONENTS.md's \"Defined in more than one file\" section. A coupling " +
    "nobody wrote down is one nobody can collapse: " + missing.join(", "));
});

// THE REST OF THE CLAIMS ROTTED TOO. Until 2026-11-10 the family table quoted a
// rule count, an owner and an "also in" list per family, and the shared-class
// bullets named the files each class lived in — none of it asserted, and by the
// audit that dropped the counts most rows were wrong (`.bc-on` was said to live
// in four files; it lives in two). The counts are gone; owners and file sets are
// asserted here instead, from the same comment-stripped selectors `collect()`
// reads. A rule counts once per file per family, however many of the family's
// classes it names.
function familyFiles() {
  const fams = new Map(); // family -> Map(file -> rules)
  for (const f of fs.readdirSync(CSS).filter((x) => x.endsWith(".css"))) {
    const src = stripComments(fs.readFileSync(path.join(CSS, f), "utf8"));
    for (const m of src.matchAll(/([^{}]+)\{/g)) {
      if (/^\s*@/.test(m[1])) continue;
      const seen = new Set();
      for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) { const k = family(c[1]); if (k) seen.add(k); }
      for (const k of seen) {
        if (!fams.has(k)) fams.set(k, new Map());
        fams.get(k).set(f, (fams.get(k).get(f) || 0) + 1);
      }
    }
  }
  return fams;
}

const section = (doc, heading) => {
  const at = doc.indexOf("\n## " + heading);
  assert.ok(at >= 0, "docs/COMPONENTS.md lost its \"" + heading + "\" section");
  const end = doc.indexOf("\n## ", at + 4);
  return doc.slice(at, end < 0 ? undefined : end);
};

test("the family table names each family's owner and exactly its other files", () => {
  const doc = section(fs.readFileSync(DOC, "utf8"), "Families, and the file that owns each");
  const fams = familyFiles();
  const wrong = [];
  for (const row of doc.matchAll(/^\| `([a-z]+)-` \| `([\w-]+\.css)` \| ([^|]*) \|/gm)) {
    const [, fam, owner, alsoCell] = row;
    const files = fams.get(fam);
    if (!files) continue; // a family that left css/ is the second test's failure
    const top = Math.max(...files.values());
    const owners = [...files].filter(([, n]) => n === top).map(([f]) => f);
    const also = [...alsoCell.matchAll(/`([\w-]+\.css)`/g)].map((m) => m[1]).sort();
    const want = [...files.keys()].filter((f) => f !== owner).sort();
    if (!owners.includes(owner) || also.join() !== want.join()) {
      const o = owners.sort()[0];
      wrong.push("| `" + fam + "-` | `" + o + "` | " +
        ([...files.keys()].filter((f) => f !== o).sort().map((f) => "`" + f + "`").join(", ") || "—") + " |");
    }
  }
  assert.deepStrictEqual(wrong, [],
    "docs/COMPONENTS.md family rows disagree with css/ (owner = the file with the most " +
    "rules; also in = every other file). Expected:\n" + wrong.join("\n"));
});

test("every shared-class bullet names exactly the files that define its classes", () => {
  const doc = section(fs.readFileSync(DOC, "utf8"), "Defined in more than one file");
  const defs = collect();
  const covered = new Set();
  const wrong = [];
  for (const line of doc.split("\n")) {
    const m = line.match(/^- ((?:`\.[\w-]+`(?: \/ )?)+) — ((?:`[\w-]+`(?: \+ )?)+)/);
    if (!m) continue;
    const named = [...m[2].matchAll(/`([\w-]+)`/g)].map((x) => x[1] + ".css").sort().join(" + ");
    for (const c of [...m[1].matchAll(/`\.([\w-]+)`/g)].map((x) => x[1])) {
      covered.add(c);
      const real = [...(defs.get(c) || [])].sort().join(" + ");
      if (real !== named) wrong.push("." + c + ": doc " + named + " | css/ " + (real || "(not defined)"));
    }
  }
  const state = (doc.match(/^\*\*State classes\*\*[^\n]*(?:\n[^\n-][^\n]*)*/m) || [""])[0];
  for (const c of state.matchAll(/`\.([\w-]+)`/g)) covered.add(c[1]);
  const missing = [...defs].filter(([c, f]) => f.size > 1 && !covered.has(c)).map(([c]) => "." + c).sort();
  assert.deepStrictEqual(wrong, [], "shared-class bullets name the wrong files:\n" + wrong.join("\n"));
  assert.deepStrictEqual(missing, [],
    "classes defined in more than one css/ file have no bullet (or State classes entry): " + missing.join(", "));
});
