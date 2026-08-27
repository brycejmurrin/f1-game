// EVERY RULE IN A LAYERED STYLESHEET MUST BE INSIDE ITS LAYER.
//
// WHY. css/tokens.css declares the cascade order once:
//
//     @layer reset, base, components, hud, overlays;
//
// and every other stylesheet opens with `@layer <name> {` and is meant to close
// it on its last line. The catch is that UNLAYERED normal declarations outrank
// EVERY cascade layer — that is the spec, not a quirk — so a rule that falls
// outside its file's layer silently beats every layered rule anywhere,
// regardless of specificity.
//
// This is not hypothetical. css/menus.css carried a stray `}` that closed
// `@layer components` two hundred lines early, which put the preview card's base
// rules outside the cascade. The result: `#sel-track-preview #sel-preview-elev
// { display: none }` — two IDs, inside the layer, written specifically to drop
// the elevation strip on a phone — lost to `#sel-preview-elev { display: block }`
// — one ID, unlayered. The strip stayed on screen, ate 30px of a 635px sheet,
// and the file accumulated comments blaming source order and container-query
// specificity for what was actually layer precedence. Three other stylesheets
// had picked up the same defect by having rules appended after their closing
// brace.
//
// The failure is invisible: no parse error, no console warning, and the page
// looks *almost* right. So it needs a test.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS_DIR = path.join(ROOT, "css");

// Braces inside comments are prose, not syntax — "{" shows up in more than one
// explanatory note in these files. Blank the comments, keeping line numbers.
function stripComments(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("/*", i)) {
      let j = text.indexOf("*/", i + 2);
      j = j < 0 ? text.length : j + 2;
      out.push("\n".repeat((text.slice(i, j).match(/\n/g) || []).length));
      i = j;
    } else {
      out.push(text[i]);
      i += 1;
    }
  }
  return out.join("");
}

const files = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css")).sort();

for (const file of files) {
  const raw = fs.readFileSync(path.join(CSS_DIR, file), "utf8");
  const src = stripComments(raw);
  const lines = src.split("\n");
  const first = (lines.find((l) => l.trim()) || "").trim();
  // tokens.css declares the order and layers its sections individually; files
  // that do not open with a single wrapping `@layer x {` are not this shape.
  if (!/^@layer\s+[\w-]+\s*\{/.test(first)) continue;

  test(`${file}: every rule is inside its @layer`, () => {
    let depth = 0;
    let closedAt = null;
    let lastContent = 0;
    lines.forEach((line, idx) => {
      const n = idx + 1;
      const before = depth;
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (before === 1 && depth === 0 && closedAt === null && n > 1) closedAt = n;
      if (line.trim()) lastContent = n;
    });

    assert.strictEqual(depth, 0,
      `${file} has unbalanced braces (final depth ${depth}). A stray '}' closes ` +
      `the layer early and everything after it becomes unlayered, which outranks ` +
      `every layer in the project.`);

    assert.ok(closedAt !== null, `${file} never closes its @layer block`);
    assert.strictEqual(closedAt, lastContent,
      `${file} closes its @layer at line ${closedAt} but has rules through line ` +
      `${lastContent}. Those ${lastContent - closedAt} trailing lines are UNLAYERED ` +
      `and therefore beat every layered rule in the project regardless of ` +
      `specificity. Move them inside the layer (or, if the closing brace is a ` +
      `stray, delete it).`);
  });
}

test("every stylesheet except tokens.css opens with its @layer wrapper", () => {
  // The per-file test above SKIPS files that don't open with `@layer x {` —
  // so a file that loses its wrapper entirely (the worst version of the
  // defect this guard exists for: every rule unlayered, outranking every
  // layer in the project) would silently exit the guard. Pin the roster.
  const unwrapped = files.filter((f) => {
    if (f === "tokens.css") return false;   // declares the order; sections layer individually
    const s = stripComments(fs.readFileSync(path.join(CSS_DIR, f), "utf8"));
    const first = (s.split("\n").find((l) => l.trim()) || "").trim();
    return !/^@layer\s+[\w-]+\s*\{/.test(first);
  });
  assert.deepStrictEqual(unwrapped, [],
    "these css/ files do not open with `@layer <name> {`, so ALL their rules " +
    "are unlayered (beating every layered rule) and the per-file guard above " +
    "cannot see them: " + unwrapped.join(", "));
});

test("the cascade order is declared exactly once, in tokens.css", () => {
  const decls = files.filter((f) => {
    const s = stripComments(fs.readFileSync(path.join(CSS_DIR, f), "utf8"));
    return /@layer\s+[\w-]+\s*(,\s*[\w-]+\s*)+;/.test(s);
  });
  assert.deepStrictEqual(decls, ["tokens.css"],
    "the layer ORDER statement decides which layer wins; it must live in one " +
    "place. Found in: " + decls.join(", "));
});

// A CLOSED DIALOG MUST HAVE NO BOXES, AND THE GUARD SAYING SO CAN BE DEFEATED.
//
// The generic rule `dialog.screen:not([open]) { display: none }` lives in
// the components layer. Two mechanisms beat it: any rule in a HIGHER layer
// (hud, overlays — layer rank ignores specificity), and any #id subject in
// the SAME layer (an id outranks the guard's specificity). Either way a
// closed-but-unhidden dialog gets layout in the seam between `hidden = false`
// and TopModal's showModal(), and Chromium then permanently drops child boxes
// when the already-laid-out subtree re-attaches into the top layer — measured
// on the customize screen: sheet head and foot at 0x0 with display:flex
// computed, healed only by a display flip or a clone, never by style
// invalidation. Rounds 10-11 fixed three instances by hand (the generic rule,
// then restatements for the data hub and the telemetry popup); this test is
// what makes the fourth instance impossible to ship. The remedy it demands is
// one line in the offending file: `<root>:not([open]) { display: none; }`.
test("a dialog styled from a winning position restates its closed state", () => {
  const tokens = stripComments(fs.readFileSync(path.join(CSS_DIR, "tokens.css"), "utf8"));
  const ORDER = tokens.match(/@layer\s+([\w\s,-]+);/)[1].split(",").map((s) => s.trim());
  const rank = (n) => ORDER.indexOf(n);
  const GUARD_RANK = rank("components");

  // Dialog roots are DERIVED, not hardcoded, so a new dialog joins the guard
  // by existing. Static roots from the shell; runtime roots from the
  // el("dialog", "<class>") idiom; a bare createElement("dialog") is opaque
  // to this scan and refused outright.
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const staticRoots = [...html.matchAll(/<dialog\s[^>]*\bid="([a-z0-9-]+)"/g)]
    .map((m) => ({ sel: "#" + m[1], family: m[1] }));
  assert.ok(staticRoots.length >= 10,
    "the <dialog id= scan found under 10 dialogs in index.html — the shell or " +
    "this regex changed shape; fix the derivation before trusting this guard");

  const jsDir = path.join(ROOT, "js");
  const jsFiles = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) jsFiles.push(p);
    }
  })(jsDir);
  const runtimeRoots = [];
  let bareCreate = null;
  for (const p of jsFiles) {
    const s = fs.readFileSync(p, "utf8");
    for (const m of s.matchAll(/\bel\(\s*"dialog"\s*,\s*"([^"]+)"/g)) {
      for (const cls of m[1].split(/\s+/)) runtimeRoots.push({ sel: "." + cls, family: cls });
    }
    if (/createElement\(\s*["']dialog["']\s*\)/.test(s)) bareCreate = path.relative(ROOT, p);
  }
  assert.strictEqual(bareCreate, null,
    `${bareCreate} creates a <dialog> with bare createElement, which this scan ` +
    "cannot name. Build it with el(\"dialog\", \"<class>\") so the closed-state " +
    "guard can see it.");

  // Runtime aliases: classes added to a static dialog after boot. One entry
  // today — the hub decorates itself. Each alias must still exist in js/, or
  // the map has drifted.
  const ALIAS = { datahub: [".dh-overlay"] };
  for (const [fam, sels] of Object.entries(ALIAS)) {
    assert.ok(staticRoots.some((r) => r.family === fam),
      `ALIAS names unknown dialog family "${fam}"`);
    for (const sel of sels) {
      const cls = sel.slice(1);
      assert.ok(jsFiles.some((p) => fs.readFileSync(p, "utf8").includes(`"${cls}"`)),
        `ALIAS ${sel} is no longer written anywhere in js/ — remove or update the entry`);
      runtimeRoots.push({ sel, family: fam });
    }
  }

  const roots = [...staticRoots, ...runtimeRoots];

  // Selector plumbing. Parens are blanked before any split so :has(...) and
  // :not(...) interiors cannot fake a comma or a combinator; the SUBJECT is
  // the last compound; pseudo-element subjects (::backdrop) have no element
  // box and are exempt.
  const blank = (s) => {
    let prev;
    do { prev = s; s = s.replace(/\([^()]*\)/g, (m) => " ".repeat(m.length)); } while (s !== prev);
    return s;
  };
  const subjects = (selector) => {
    const b = blank(selector);
    const out = [];
    let start = 0;
    for (let i = 0; i <= b.length; i++) {
      if (i === b.length || b[i] === ",") {
        const part = b.slice(start, i);
        const chunks = part.split(/[\s>+~]+/).filter(Boolean);
        if (chunks.length) {
          const idx = part.lastIndexOf(chunks[chunks.length - 1]);
          out.push(selector.slice(start + (idx - start), i).split(/[\s>+~]+/).pop());
        }
        start = i + 1;
      }
    }
    return out.filter(Boolean);
  };
  const bound = (root) => new RegExp(root.replace(/[.#]/g, "\\$&") + "(?![A-Za-z0-9_-])");
  const familiesIn = (subj) => {
    if (/::[a-z-]+$/.test(subj)) return [];
    const fams = new Set();
    for (const r of roots) if (bound(r.sel).test(subj)) fams.add(r.family);
    if (/^dialog(?![A-Za-z0-9_-])/.test(subj)) fams.add("*tag*");
    return [...fams];
  };

  const offenders = [];
  for (const file of files) {
    if (file === "components.css" || file === "tokens.css") continue;
    const src = stripComments(fs.readFileSync(path.join(CSS_DIR, file), "utf8"));
    const layerName = (src.match(/^\s*@layer\s+([\w-]+)\s*\{/m) || [])[1];
    const outranks = layerName ? rank(layerName) > GUARD_RANK : true;
    const guarded = new Set();
    const touched = new Map();
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim(), body = m[2];
      if (sel.startsWith("@")) continue;
      for (const subj of subjects(sel)) {
        for (const fam of familiesIn(subj)) {
          if (/:not\(\[open\]\)/.test(subj) && /(^|;)\s*display\s*:\s*none/.test(body)) {
            guarded.add(fam);
            continue;
          }
          // The cascade is PER-PROPERTY: only a display declaration can beat
          // the guard's display:none. A --fit-at or padding rule on a dialog
          // id is harmless however high it ranks.
          const setsDisplay = /(^|;)\s*display\s*:\s*(?!none\b)[a-z-]/.test(body);
          if (!setsDisplay) continue;
          const idSubj = subj.includes("#");
          if (outranks || idSubj) {
            if (!touched.has(fam)) touched.set(fam, []);
            touched.get(fam).push(subj);
          }
        }
      }
    }
    for (const [fam, sels] of touched) {
      if (!guarded.has(fam)) offenders.push(`css/${file}: ${fam} via ${[...new Set(sels)].join(", ")}`);
    }
  }

  assert.deepStrictEqual(offenders, [],
    "a dialog is styled from a position that BEATS the components-layer " +
    "`dialog.screen:not([open]) { display: none }` guard (a higher layer, or an " +
    "#id subject), without restating the closed state in the same file. A " +
    "closed-but-unhidden dialog then gets layout in the hidden->showModal seam, " +
    "and Chromium permanently drops child boxes on top-layer re-attach (the " +
    "customize head/foot bug). `[hidden]` is NOT the guard — hidden is app " +
    "state, open is platform state, and TopModal's observer leaves a window " +
    "where neither matches. Add `<root>:not([open]) { display: none; }` to the " +
    "named file, as the data hub and telemetry popup rules already do:\n  " +
    offenders.join("\n  "));
});
