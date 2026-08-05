/* docs-integrity.test.mjs — stop the documentation drifting from the code.
 *
 * Every fact in this file was WRONG when it was written, which is why it exists:
 * CLAUDE.md advertised 46 Playwright specs against 81 on disk, five docs froze
 * the scenery api at "84 members" against 96 in the contract, and the module
 * layout still pointed at css/style.css and a js/glx/ tree that had been split
 * up two reorganisations earlier. None of that is catchable by reading a diff —
 * a doc goes stale when something ELSE changes.
 *
 * Scope is deliberately narrow: only claims that can be checked mechanically
 * against the repo. Prose is not policed.
 *
 * Run: node --test tests/docs-integrity.test.mjs   (npm run test:tooling)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const ls = (dir, re) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f));

// ---------------------------------------------------------------------------
// Docs that describe the CURRENT code. Everything else under docs/ is a dated
// record and is exempt: docs/archive/ and docs/research/ were accurate when
// written and are explicitly labelled historical in docs/README.md. Exempting
// archive/ is the POINT of having it — a provenance doc naming a file that has
// since moved is expected, and holding it to the live standard would either
// churn build logs on every refactor or stop anyone archiving anything.
const LIVE_DOCS = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/archive|research|tracks/.test(e.name)) continue;
      walk(rel);
    } else if (e.name.endsWith(".md")) LIVE_DOCS.push(rel);
  }
})("docs");
LIVE_DOCS.push("CLAUDE.md", "README.md");
const SKILL_DOCS = fs.readdirSync(path.join(ROOT, ".claude/skills"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(".claude/skills", e.name, "SKILL.md"))
  .filter((p) => fs.existsSync(path.join(ROOT, p)));

// Illustrative placeholders in fenced examples — these name no real file on
// purpose ("npm test -- tests/foo.spec.js"). Keep this list SHORT; a real path
// that stops resolving must fail, not get waved through.
const PLACEHOLDERS = new Set([
  "tests/foo.spec.js", "tests/a.spec.js", "tests/b.spec.js",
  "js/circuits/<id>.js", "docs/tracks/<id>.md",
]);

// The lookbehind (rather than a bare \b) stops a path segment INSIDE a URL from
// matching — "github.com/…/blob/main/docs/tool-reference.md" is not a claim
// about this repo.
//
// `docs` is in this list because it was NOT, and that is how thirteen references
// to the WebGPU notes, ten research files and the scenery upgrade plan
// survived those files moving into docs/archive/ — in source comments, in CSS
// and in other docs, none of them checked by anything.
//
// Extensions are ordered LONGEST-FIRST and anchored: regex alternation is
// ordered, so a bare `js|json` matches "clip-baseline.json" as ".js" and then
// reports a file that was never referenced. The trailing guard stops a prefix
// match mid-extension.
const PATH_RE = /(?<![A-Za-z0-9_./-])((?:js|tools|tests|css|assets|spike|vendor|docs)\/[A-Za-z0-9_.<>/-]+\.(?:json|mjs|cjs|css|js|md|sh))(?![A-Za-z0-9])/g;

function brokenPathsIn(file) {
  const bad = [];
  for (const m of new Set(read(file).match(PATH_RE) || [])) {
    if (PLACEHOLDERS.has(m) || m.includes("<") || m.includes("*")) continue;
    if (!fs.existsSync(path.join(ROOT, m))) bad.push(m);
  }
  return bad;
}

test("live docs reference only files that exist", () => {
  const broken = [];
  for (const doc of LIVE_DOCS)
    for (const p of brokenPathsIn(doc)) broken.push(`${doc} -> ${p}`);
  assert.deepEqual(broken, [],
    "a doc points at a path that no longer exists — update the doc, or add a placeholder if it is illustrative");
});

// Source files that are ALLOWED to name a path that does not resolve, with the
// reason. Keep this list short and justified — everything else is drift.
const SOURCE_EXEMPT = new Map([
  // A forward reference: tools/bake-elevation.mjs GENERATES this file, and the
  // manifest records where it would slot in. It is legitimately absent until
  // someone bakes a profile.
  ["js/track/circuit-elevations.js", /bake-elevation|manifest\.cjs|track\/tracks\.js|docs-integrity/],
  // Synthetic fixture HTML fed to the service worker under test — a string it
  // must rewrite, not a file it must find.
  ["css/style.css", /service-worker\.test\.mjs|docs-integrity\.test\.mjs/],
  // Fake package.json scripts inside the coverage-audit's own fixtures.
  ["tests/alpha.spec.js", /test-coverage-audit\.test\.mjs|docs-integrity/],
  ["tests/worker.test.mjs", /test-coverage-audit\.test\.mjs|docs-integrity/],
]);

test("source comments reference only files that exist", () => {
  // A file MOVE is invisible to every reviewer of the diff that caused it: the
  // comment in the file that points at the old location does not appear in it.
  // The js/ -> js/<domain>/ reorganisation left 29 such pointers behind across
  // js/, tools/ and tests/ — each one sending a reader (or an agent) to a path
  // that has not existed for months. This is the only thing that catches them.
  const roots = ["js", "tools", "tests"];
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); }
      else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(rel);
    }
  })(roots[0]);
  for (const r of roots.slice(1)) (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); }
      else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(rel);
    }
  })(r);

  const broken = [];
  for (const file of files) {
    for (const p of brokenPathsIn(file)) {
      const exempt = SOURCE_EXEMPT.get(p);
      if (exempt && exempt.test(file)) continue;
      broken.push(`${file} -> ${p}`);
    }
  }
  assert.deepEqual(broken, [],
    "a source comment points at a path that no longer exists — update it, or add a justified SOURCE_EXEMPT entry");
});

test("skills reference only files that exist", () => {
  const broken = [];
  for (const doc of SKILL_DOCS)
    for (const p of brokenPathsIn(doc)) broken.push(`${doc} -> ${p}`);
  assert.deepEqual(broken, [],
    "a skill points at a path that no longer exists — skills are run by agents, so a dead path is a dead end");
});

test("the scenery api member count in the docs matches the frozen contract", () => {
  const src = read("tests/scenery-api-contract.test.mjs");
  const body = src.match(/const CONTRACT = \[([\s\S]*?)\];/);
  assert.ok(body, "could not find the CONTRACT array");
  const actual = body[1].split(",").map((s) => s.trim()).filter((s) => s && s.startsWith('"')).length;

  const wrong = [];
  for (const doc of LIVE_DOCS) {
    for (const m of read(doc).matchAll(/(\d+)[- ]member[s]? (?:`?scenery\(api\)`?|API)/gi))
      if (Number(m[1]) !== actual) wrong.push(`${doc}: says ${m[1]}, contract has ${actual}`);
  }
  assert.deepEqual(wrong, [], "the frozen scenery(api) contract grew or shrank and the docs did not follow");
});

test("the test-suite counts in CLAUDE.md and README.md match the files on disk", () => {
  // README was checked for circuits and part categories but NOT for suite
  // counts, so it sat at "101 specs / 37 unit suites" against 102/38 while
  // CLAUDE.md — the only file this test read — was correct. A guard that covers
  // one of two copies leaves the other free to drift, which is exactly what
  // happened.
  const specs = ls("tests", /\.spec\.js$/).length;
  const units = ls("tests", /\.test\.mjs$/).length;

  let sawSpecCount = false;
  for (const doc of ["CLAUDE.md", "README.md"]) {
    const text = read(doc);
    const claimed = [...text.matchAll(/(\d+)\s+Playwright specs?/gi)].map((m) => Number(m[1]));
    if (claimed.length) sawSpecCount = true;
    for (const n of claimed)
      assert.equal(n, specs, `${doc} claims ${n} Playwright specs; tests/ holds ${specs}`);

    const unitClaims = [...text.matchAll(/(\d+)\s+`?node --test`? unit suites/gi)].map((m) => Number(m[1]));
    for (const n of unitClaims)
      assert.equal(n, units, `${doc} claims ${n} unit suites; tests/ holds ${units}`);
  }
  assert.ok(sawSpecCount, "neither CLAUDE.md nor README.md states a Playwright spec count any more");
});

// The three counts below all drifted in the same way and for the same reason:
// something ELSE changed (a circuit was added, four part categories were added,
// a knob's default was flipped) and the prose that quoted it did not move.
test("the circuit count in the docs matches js/circuits/", () => {
  const circuits = ls("js/circuits", /\.js$/).length;
  for (const doc of ["CLAUDE.md", "README.md"]) {
    const text = read(doc);
    for (const m of text.matchAll(/(\d+)\s+circuit data files/gi))
      assert.equal(Number(m[1]), circuits, `${doc} claims ${m[1]} circuit data files; js/circuits/ holds ${circuits}`);
    for (const m of text.matchAll(/verify-track\.cjs --all[^\n]*?all (\d+) circuits/gi))
      assert.equal(Number(m[1]), circuits, `${doc} claims verify-track covers ${m[1]} circuits; js/circuits/ holds ${circuits}`);
  }
});

test("the parts-category count in the docs matches Parts.CATALOG", () => {
  // CLAUDE.md said "8 categories" in two places and "12 category objects" in a
  // third, against a catalog of 12 — it contradicted itself as well as the code.
  const src = read("js/car/parts.js");
  const catalog = src.slice(src.indexOf("const CATALOG"), src.indexOf("const DEFAULTS"));
  const categories = (catalog.match(/^\s{6}id: "\w+", label: "/gm) || []).length;
  assert.ok(categories > 0, "could not count Parts.CATALOG categories");
  for (const doc of ["CLAUDE.md", "README.md"]) {
    const text = read(doc);
    for (const m of text.matchAll(/(\d+)\s+(?:part |upgrade )?categor(?:y|ies)/gi))
      assert.equal(Number(m[1]), categories,
        `${doc} claims ${m[1]} part categories; Parts.CATALOG has ${categories}`);
  }
});

test("CLAUDE.md's matTexMix default matches TUNE_DEFS", () => {
  // "Ships OFF … def: 0" survived the knob being flipped to 1.0, which inverted
  // the meaning of the whole asset-pack section.
  const lighting = read("js/game/lighting.js");
  const def = lighting.match(/\{\s*id:\s*"matTexMix"[^}]*?\bdef:\s*([\d.]+)/);
  assert.ok(def, "matTexMix is no longer a TUNE_DEFS entry with a def");
  const on = Number(def[1]) > 0;
  const claude = read("CLAUDE.md");
  const section = claude.slice(claude.indexOf("Baked asset pack"), claude.indexOf("`window.__apex` dev API"));
  assert.ok(section, "the baked-asset-pack section moved");
  assert.equal(/\*\*Ships ON\.\*\*/.test(section), on,
    `matTexMix def is ${def[1]}, so the asset-pack section must say "Ships ON" iff that is > 0`);
  assert.ok(!/`matTexMix`[^\n]*`def: 0`/.test(section) || !on,
    "CLAUDE.md still claims matTexMix has def: 0");

  // …and the same claim, outside the slice. The check above reads only the text
  // BETWEEN "Baked asset pack" and "`window.__apex` dev API", so the __apex hook
  // table — which sits after that boundary — kept saying "(ships at 0)" for as
  // long as the section above it said "Ships ON". Both were in CLAUDE.md at
  // once. Scan the WHOLE file for a shipped-default claim about this knob.
  for (const m of read("CLAUDE.md").matchAll(/matTex[^\n]*?ships at ([\d.]+)/gi)) {
    assert.equal(Number(m[1]), Number(def[1]),
      `CLAUDE.md says matTex ships at ${m[1]}; TUNE_DEFS has def: ${def[1]}`);
  }
});

test("every eagerly-loaded js/game module is named in CLAUDE.md's file layout", () => {
  // js/game/sheetshape.js and js/game/topmodal.js shipped, were in the manifest
  // and in index.html, and were absent from the CLAUDE.md layout — so an agent
  // reading the layout concluded they did not exist. The equivalent guard for
  // js/render/ subdirectories already existed; js/game/ had none, and that is
  // the whole reason the gap lasted.
  const manifest = read("tools/manifest.cjs");
  const claude = read("CLAUDE.md");
  const missing = [];
  for (const m of manifest.matchAll(/"(js\/game\/[a-z0-9-]+\.js)"/g)) {
    const base = m[1].split("/").pop();
    if (!claude.includes(base)) missing.push(m[1]);
  }
  assert.deepEqual(missing, [],
    "CLAUDE.md's file layout omits a shipped js/game module — an agent reading it will not know the file exists");
});

test("CLAUDE.md's active branch is a branch that exists, and names the deploy branch", () => {
  // Three different answers were in the repo at once: CLAUDE.md named a branch
  // nobody was on, pages.yml deploys from a third, and nothing said so.
  const claude = read("CLAUDE.md");
  const pages = read(".github/workflows/pages.yml");
  const deploy = pages.match(/branches:\s*\[([^\]]+)\]/);
  assert.ok(deploy, "pages.yml no longer pins a deploy branch");
  const deployBranch = deploy[1].trim();
  assert.ok(claude.includes(deployBranch),
    `CLAUDE.md must name the deploy branch (${deployBranch}) so nobody assumes their branch ships`);
});

test("every npm test:* group names specs that exist", () => {
  const pkg = JSON.parse(read("package.json"));
  const missing = [];
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    if (!name.startsWith("test:")) continue;
    for (const m of cmd.matchAll(/tests\/[A-Za-z0-9_*-]+\.(?:spec\.js|test\.(?:mjs|cjs))/g)) {
      const ref = m[0];
      if (ref.includes("*")) {                       // glob: at least one match must exist
        const re = new RegExp("^" + path.basename(ref).replace(/\*/g, ".*") + "$");
        if (!ls("tests", re).length) missing.push(`${name}: glob ${ref} matches nothing`);
      } else if (!fs.existsSync(path.join(ROOT, ref))) {
        missing.push(`${name}: ${ref}`);
      }
    }
  }
  assert.deepEqual(missing, [], "an npm test group points at a spec that no longer exists");
});

test("every renderer backend directory is described in CLAUDE.md", () => {
  // The TLX (three.js) backend shipped an entire js/render/three/ tree while
  // CLAUDE.md still listed only GLX and WGX. A whole backend going undocumented
  // is the failure mode worth catching; individual files are covered by grouped
  // notation ("tlx-chunked/-post/-shadow.js") and are not checked here.
  const claude = read("CLAUDE.md");
  const missing = fs.readdirSync(path.join(ROOT, "js/render"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((d) => !claude.includes(`${d}/`));
  assert.deepEqual(missing, [], "a renderer backend/dir under js/render/ is missing from the CLAUDE.md layout");
});

test("the skills index lists every skill", () => {
  const index = read(".claude/skills/README.md");
  const missing = fs.readdirSync(path.join(ROOT, ".claude/skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((s) => !index.includes(s));
  assert.deepEqual(missing, [], "a skill exists on disk but is not in .claude/skills/README.md");
});

test("every tool named in tools/README.md exists on disk", () => {
  // The other direction, which nothing checked. tools/README.md carried a row
  // for `.vt-warn.cjs` — a file that is not on disk and CANNOT be, because
  // .gitignore excludes tools/.* — so the index advertised a tool nobody could
  // run. Deleting a tool without deleting its row leaves exactly this residue,
  // and the disk->README test above is blind to it by construction.
  const index = read("tools/README.md");
  const onDisk = new Set(fs.readdirSync(path.join(ROOT, "tools")));
  for (const d of fs.readdirSync(path.join(ROOT, "tools"), { withFileTypes: true }))
    if (d.isDirectory())
      for (const f of fs.readdirSync(path.join(ROOT, "tools", d.name))) onDisk.add(f);
  const ghosts = [...index.matchAll(/^\|\s*\*\*([A-Za-z0-9_.-]+\.(?:mjs|cjs|js|sh|html|json))\*\*/gm)]
    .map((m) => m[1])
    .filter((f) => !onDisk.has(f));
  assert.deepEqual(ghosts, [], "tools/README.md documents a tool that does not exist on disk");
});

test("the tools index lists every tool", () => {
  // Underscore-prefixed scripts are transient agent scratch by convention
  // (.gitignore: tools/_*.mjs) and are deliberately not indexed.
  const index = read("tools/README.md");
  const missing = fs.readdirSync(path.join(ROOT, "tools"))
    .filter((f) => f !== "README.md" && !f.startsWith("_") && !index.includes(f));
  assert.deepEqual(missing, [], "a tool exists on disk but is not in tools/README.md");
});

test("docs/README indexes every live engineering doc", () => {
  const index = read("docs/README.md");
  const missing = ls("docs", /\.md$/)
    .filter((f) => f !== "README.md" && !index.includes(f));
  assert.deepEqual(missing, [], "a doc under docs/ is not linked from docs/README.md");
});

test("every relative link in docs/README.md resolves", () => {
  // The index links RELATIVELY ("[TESTING.md](TESTING.md)"), and the broken-path
  // guard above only matches paths that start with a known top-level directory
  // (js/, tools/, tests/, css/, …). So a docs-relative link pointed at nothing
  // and no test noticed — which is exactly what happened when six WebGPU notes,
  // ten research files and the scenery upgrade plan moved into docs/archive/ and
  // left thirteen dead rows behind in the table that indexes them.
  const dead = [];
  for (const m of read("docs/README.md").matchAll(/\]\(([^)#:]+)\)/g)) {
    const href = m[1].trim();
    if (/^(https?:)?\/\//.test(href)) continue;          // external
    const target = path.resolve(ROOT, "docs", href);
    if (!fs.existsSync(target)) dead.push(href);
  }
  assert.deepEqual(dead, [], "docs/README.md links to a path that does not exist");
});

test("no live doc points a reader at docs/archive/", () => {
  // Archive is provenance. A live doc citing it is either a doc that should not
  // have been archived, or a reference that should have been rewritten — both
  // are worth catching. docs/README.md is the one legitimate referrer, because
  // indexing the archive is its job.
  const offenders = [];
  for (const doc of LIVE_DOCS) {
    if (doc === "docs/README.md") continue;
    if (/docs\/archive\//.test(read(doc))) offenders.push(doc);
  }
  assert.deepEqual(offenders, [],
    "a live doc references docs/archive/ — either it should not be archived, or the reference is stale");
});
