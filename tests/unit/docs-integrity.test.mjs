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
 * Run: node --test tests/unit/docs-integrity.test.mjs   (npm run test:tooling)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const ls = (dir, re) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f));

// ---------------------------------------------------------------------------
// Docs that describe the CURRENT code. Everything else under docs/ is a dated
// record and is exempt: docs/archive/, docs/research/, and docs/superpowers/
// were accurate when written. Exempting historical records is the POINT of
// keeping them — a provenance doc or implementation plan naming a file that
// will move or has not yet been created must not churn build logs.
const LIVE_DOCS = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/archive|research|tracks|superpowers/.test(e.name)) continue;
      walk(rel);
    } else if (e.name.endsWith(".md")) LIVE_DOCS.push(rel);
  }
})("docs");
LIVE_DOCS.push("CLAUDE.md", "AGENTS.md", "README.md");
const SKILL_DOCS = [];
(function walkSkills(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walkSkills(rel);
    else if (e.name.endsWith(".md")) SKILL_DOCS.push(rel);
  }
})(".claude/skills");

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

// tools/manifest.cjs's MOVED map (tools/move-tree.mjs) keys itself on the
// OLD path of every file the Phase 2b window relocates — that key is
// SUPPOSED to be gone from disk; it is the whole reason deploy.mjs can name
// the new path when a conflicted file was moved. Scan everything BUT that
// object literal.
function stripMovedBlock(text) {
  const at = text.indexOf("const MOVED = {");
  if (at < 0) return text;
  const end = text.indexOf("};", at);
  return end < 0 ? text : text.slice(0, at) + text.slice(end + 2);
}

function brokenPathsIn(file) {
  const bad = [];
  let text = read(file);
  if (file === "tools/manifest.cjs") text = stripMovedBlock(text);
  for (const m of new Set(text.match(PATH_RE) || [])) {
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
  // The scratch tree tools/move-tree.mjs is tested on. The names are
  // deliberately fictional (js/zzfix/…) so a real move's sweep can never
  // rewrite the fixture — see the header of move-tree.test.mjs.
  ["js/zzfix/", /move-tree\.test\.mjs|docs-integrity/],
  ["tests/unit/zzfix.test.mjs", /move-tree\.test\.mjs|docs-integrity/],
  ["tests/helpers/seed-zzfix.mjs", /move-tree\.test\.mjs|docs-integrity/],
  ["docs/archive/OLD.md", /move-tree\.test\.mjs|docs-integrity/],
  ["tools/nested/README.md", /move-tree\.test\.mjs|docs-integrity/],
  ["tests/unit/joins.test.mjs", /move-tree\.test\.mjs|docs-integrity/],
  // Fake package.json scripts inside the coverage-audit's own fixtures.
  ["tests/alpha.spec.js", /test-coverage-audit\.test\.mjs|docs-integrity/],
  ["tests/worker.test.mjs", /test-coverage-audit\.test\.mjs|docs-integrity/],
  // A path that MUST NOT EXIST. ci-coverage.mjs's glob resolver has to return
  // nothing for a spec that is not on disk, and the only way to test that is to
  // name one — so this entry is not a stale reference being tolerated, it is
  // the assertion. If someone ever creates the file, the test stops proving
  // anything and should fail; keeping the name absurd is what prevents that.
  ["tests/specs/there-is-no-such.spec.js", /ci-coverage\.test\.mjs|select-budget\.test\.mjs|docs-integrity/],
  // A path that MUST NOT EXIST. perf-try.test.mjs asserts the PerfTry module
  // was deleted after the ON paths baked in. Naming the old path is the
  // assertion; if someone recreates the file, this exemption should go too.
  ["js/game/perf-try.js", /perf-try\.test\.mjs|docs-integrity/],
  ["docs/LIVE.md", /docs-integrity/],
]);

test("a `file.js:NNN` citation in a comment points inside that file", () => {
  // Line numbers in comments are the one cross-reference nothing maintains. The
  // renderer backends carried 77 line citations into glx.js, written when it was
  // a monolith; the post chain and shaders were later split out into
  // js/render/glx/ and js/render/shaders/, and 16 of those citations ended up
  // pointing PAST THE END of the file they name.
  //
  // The reason to gate it rather than just fix it: the surviving set was MIXED.
  // Some citations were still right, so a reader could not tell which to trust,
  // and a wrong one sends them to unrelated code with every appearance of
  // authority. Out-of-range is the half that is mechanically checkable; prefer
  // naming a function or a symbol over a line number either way, because a
  // citation that stays inside the file can still point at the wrong thing.
  const roots = ["js", "tools", "tests"];
  const files = [];
  for (const r of roots) (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); }
      else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(rel);
    }
  })(r);

  const lineCount = new Map();
  const lines = (rel) => {
    if (!lineCount.has(rel)) {
      let n = 0;
      try { n = read(rel).split("\n").length; } catch (_) { n = -1; }
      lineCount.set(rel, n);
    }
    return lineCount.get(rel);
  };

  // Citations come in two shapes and BOTH have to be checked: a full path
  // followed by a colon and a line number, and a BARE FILENAME followed by the
  // same. The bare shape is the one that hid — a WebGPU comment cited a
  // four-digit line in glx.js against a file half that long, and a path-only
  // matcher sails straight past it. Bare names resolve by basename, and only
  // when that basename is UNIQUE in the repo (several files are named post.js,
  // and guessing between them yields false failures, which is worse than a miss).
  //
  // This test flagged its own comment when that comment quoted real stale
  // citations verbatim — correct behaviour, and the reason the examples above
  // are described rather than written out.
  const byBase = new Map();
  for (const f of files) {
    const b = path.basename(f);
    byBase.set(b, byBase.has(b) ? null : f);   // null marks "ambiguous"
  }

  const bad = [];
  for (const file of files) {
    const src = read(file);
    src.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/(?<![A-Za-z0-9_./-])((?:(?:js|tools|tests)\/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+)\.(?:js|mjs|cjs)):(\d+)(?:-(\d+))?/g)) {
        const cited = m[1];
        const target = cited.includes("/") ? cited : byBase.get(cited);
        if (!target) continue;                  // unknown or ambiguous basename
        const hi = Number(m[3] || m[2]);
        const n = lines(target);
        if (n > 0 && (Number(m[2]) > n || hi > n)) {
          bad.push(`${file}:${i + 1} cites ${m[0]} but ${target} has ${n} lines`);
        }
      }
    });
  }
  assert.deepEqual(bad, [],
    "a comment cites a line number past the end of the file it names — the code moved; cite a function or symbol instead");
});

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
      // Exact path first; then any key ending in "/" as a DIRECTORY prefix.
      // The prefix form exists for a whole tree that does not exist yet — the
      // tests/ split's destinations, named by the tool that plans the move and
      // by its guard — where listing every future filename would break on the
      // next case added and teach nobody anything.
      const exempt = SOURCE_EXEMPT.get(p)
        || [...SOURCE_EXEMPT].find(([k]) => k.endsWith("/") && p.startsWith(k))?.[1];
      if (exempt && exempt.test(file)) continue;
      broken.push(`${file} -> ${p}`);
    }
  }
  assert.deepEqual(broken, [],
    "a source comment points at a path that no longer exists — update it, or add a justified SOURCE_EXEMPT entry");
});

test("tests/manual/README.md indexes every suite in that directory, and only real ones", () => {
  // tests/manual/ is EXCLUDED from default discovery (testIgnore in
  // playwright.config.js), so its contents are precisely the files nothing else
  // checks — no group names them, no coverage audit claims them. That README's
  // table is their only index, which makes it the one place drift is invisible.
  //
  // It drifted the day this was written: act-probe.spec.js landed and the table
  // did not notice. Found by opening the file, not by anything going red — the
  // same species as every other rule in this repo that lives only in prose.
  const dir = path.join(ROOT, "tests/manual");
  const readme = read("tests/manual/README.md");
  const specs = [];
  (function walk(sub) {
    for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(sub, e.name));
      else if (e.name.endsWith(".spec.js")) specs.push(path.join(sub, e.name).split(path.sep).join("/"));
    }
  })("");

  const missing = specs.filter((s) => !readme.includes(s) && !readme.includes(path.posix.basename(s)));
  assert.deepEqual(missing, [],
    "a suite in tests/manual/ is absent from its README table — nothing else indexes these files");

  // The other direction: a row naming a file that has gone. An index that lists
  // what is not there is as misleading as one that omits what is.
  const listed = [...readme.matchAll(/`([A-Za-z0-9_/-]+\.spec\.js)`/g)].map((m) => m[1]);
  const ghosts = listed.filter((n) => !specs.some((s) => s === n || s.endsWith(`/${n}`) || path.posix.basename(s) === n));
  assert.deepEqual(ghosts, [], "the manual README lists a suite that no longer exists");
});

test("skills reference only files that exist", () => {
  const broken = [];
  for (const doc of SKILL_DOCS)
    for (const p of brokenPathsIn(doc)) broken.push(`${doc} -> ${p}`);
  assert.deepEqual(broken, [],
    "a skill points at a path that no longer exists — skills are run by agents, so a dead path is a dead end");
});

test("the scenery api member count in the docs matches the frozen contract", () => {
  const src = read("tests/unit/scenery-api-contract.test.mjs");
  const body = src.match(/const CONTRACT = \[([\s\S]*?)\];/);
  assert.ok(body, "could not find the CONTRACT array");
  const actual = body[1].split(",").map((s) => s.trim()).filter((s) => s && s.startsWith('"')).length;

  const wrong = [];
  for (const doc of [...LIVE_DOCS, ...SKILL_DOCS]) {
    for (const m of read(doc).matchAll(/(\d+)[- ]member[s]? (?:`?scenery\(api\)`?|`api`|API)/gi))
      if (Number(m[1]) !== actual) wrong.push(`${doc}: says ${m[1]}, contract has ${actual}`);
  }
  assert.deepEqual(wrong, [], "the frozen scenery(api) contract grew or shrank and the docs did not follow");
});

test("the test-suite counts in the agent docs and README.md match the files on disk", () => {
  // README was checked for circuits and part categories but NOT for suite
  // counts, so it sat at "101 specs / 37 unit suites" against 102/38 while
  // CLAUDE.md — the only file this test read — was correct. A guard that covers
  // one of two copies leaves the other free to drift, which is exactly what
  // happened.
  const specs = ls("tests/specs", /\.spec\.js$/).length;
  const units = ls("tests/unit", /\.test\.mjs$/).length;

  let sawSpecCount = false;
  for (const doc of ["CLAUDE.md", "AGENTS.md", "README.md", ...SKILL_DOCS]) {
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
  for (const doc of ["CLAUDE.md", "AGENTS.md", "README.md"]) {
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
  for (const doc of ["CLAUDE.md", "AGENTS.md", "README.md"]) {
    const text = read(doc);
    for (const m of text.matchAll(/(\d+)\s+(?:part |upgrade )?categor(?:y|ies)/gi))
      assert.equal(Number(m[1]), categories,
        `${doc} claims ${m[1]} part categories; Parts.CATALOG has ${categories}`);
  }
});

test("live docs and skills cite AGENTS.md as the rule owner, not CLAUDE.md", () => {
  // CLAUDE.md is a stub. Archive/research/superpowers may still say "CLAUDE.md
  // says" — those are dated records. Live docs that treat the stub as the
  // working reference send agents to an empty file.
  const owner = /CLAUDE\.md(?:'s|\s+says|\s+forbids|\s+mandates|\s+recommended|\s+documents|\s+measures|\s+asks|\s+carries the rules)|per CLAUDE\.md|contradicted CLAUDE\.md|\[`CLAUDE\.md`\]|held by a table in `CLAUDE\.md`|see \*\*Logging\*\* in `CLAUDE\.md`|summarised in CLAUDE\.md|from CLAUDE\.md\. Not a description/i;
  const allow = /moved from CLAUDE\.md|CLAUDE\.md is a stub|imports AGENTS\.md|do not edit rules into `?CLAUDE\.md`|@AGENTS\.md|byte-for-byte|advertised \d+ Playwright|CLAUDE\.md must import/;
  const extra = [".cursor/rules/apex-shared.mdc", "tools/README.md"];
  const jsFiles = [];
  (function walkJs(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walkJs(rel);
      else if (e.name.endsWith(".js")) jsFiles.push(rel);
    }
  })("js");
  const bad = [];
  for (const doc of [...LIVE_DOCS, ...SKILL_DOCS, ...extra, ...jsFiles]) {
    if (doc === "CLAUDE.md") continue;
    const isJs = doc.startsWith("js" + path.sep) || doc.startsWith("js/");
    read(doc).split("\n").forEach((line, i) => {
      if (allow.test(line)) return;
      if (isJs ? /CLAUDE\.md/.test(line) : owner.test(line))
        bad.push(`${doc}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(bad, [], "cite AGENTS.md for current rules; leave archive/research alone");
});

test("CLAUDE.md is a stub that imports AGENTS.md, not a second copy", () => {
  // CLAUDE.md and AGENTS.md spent months as byte-for-byte duplicates, both
  // loaded into every session (~490 lines of context for 244 of information)
  // — and they still drifted: one lost a clause the other kept, despite this
  // suite existing to stop exactly that. One canonical file ends the class:
  // AGENTS.md holds the content, CLAUDE.md is a Claude Code @import stub.
  // The line ceiling is what keeps rules from creeping back into the stub.
  const stub = read("CLAUDE.md");
  assert.ok(/^@AGENTS\.md$/m.test(stub),
    "CLAUDE.md must import AGENTS.md with a line reading exactly `@AGENTS.md`");
  const lines = stub.trim().split("\n").length;
  assert.ok(lines <= 15,
    `CLAUDE.md is ${lines} lines — it is a stub; rules belong in AGENTS.md`);
});

test("AGENTS.md's matTexMix default matches TUNE_DEFS", () => {
  // "Ships OFF … def: 0" survived the knob being flipped to 1.0, which inverted
  // the meaning of the whole asset-pack section.
  const lighting = read("js/lighting/knobs.js");
  const def = lighting.match(/\{\s*id:\s*"matTexMix"[^}]*?\bdef:\s*([\d.]+)/);
  assert.ok(def, "matTexMix is no longer a TUNE_DEFS entry with a def");
  const on = Number(def[1]) > 0;
  const agents = read("AGENTS.md");
  const section = agents.slice(agents.indexOf("Baked asset pack"), agents.indexOf("`window.__apex` dev API"));
  assert.ok(section, "the baked-asset-pack section moved");
  assert.equal(/\*\*Ships ON\.\*\*/.test(section), on,
    `matTexMix def is ${def[1]}, so the asset-pack section must say "Ships ON" iff that is > 0`);
  assert.ok(!/`matTexMix`[^\n]*`def: 0`/.test(section) || !on,
    "AGENTS.md still claims matTexMix has def: 0");
  // WGX implements createTextureArray / setMaterialMaps — the old "WGX does not"
  // trap sent agents hunting a missing port that already shipped.
  assert.doesNotMatch(section, /WGX does not/);
  assert.match(section, /GLX,\s*\n?TLX, and WGX implement it|GLX,\s*TLX, and WGX implement it/);

  // …and the same claim, outside the slice. The check above reads only the text
  // BETWEEN "Baked asset pack" and "`window.__apex` dev API", so the __apex hook
  // table — which sits after that boundary — kept saying "(ships at 0)" for as
  // long as the section above it said "Ships ON". Both were in the doc at
  // once. Scan the WHOLE file for a shipped-default claim about this knob.
  for (const m of read("AGENTS.md").matchAll(/matTex[^\n]*?ships at ([\d.]+)/gi)) {
    assert.equal(Number(m[1]), Number(def[1]),
      `AGENTS.md says matTex ships at ${m[1]}; TUNE_DEFS has def: ${def[1]}`);
  }
});

test("AGENTS.md's layout names the module-roster truth it defers to", () => {
  // History: js/game/sheetshape.js and js/game/topmodal.js shipped while absent
  // from the then-exhaustive layout, so an agent reading it concluded they did
  // not exist — and this guard required every js/game basename in the file.
  // The 2026-08-13 slimming inverted the contract: the layout is a directory
  // map that DEFERS enumeration to tools/manifest.cjs, so the honest assertion
  // is that the deferral is stated (the reader is told where the roster
  // lives), and that any module the doc still singles out by name actually
  // exists in the manifest (no ghosts — the reverse failure mode).
  const manifest = read("tools/manifest.cjs");
  const agents = read("AGENTS.md");
  assert.ok(manifest.length > 0, "tools/manifest.cjs unreadable");
  assert.ok(/tools\/manifest\.cjs/.test(agents),
    "AGENTS.md no longer points readers at tools/manifest.cjs for the module roster");
  // The no-ghosts half, implemented (round 6 — this header claimed it for a
  // year while the body was one line): any js/ module the layout section still
  // singles out by name must exist in the manifest.
  const layout = agents.split(/^## Layout$/m)[1].split(/^## /m)[0];
  const named = [...new Set([...layout.matchAll(/\bjs\/[\w./-]+\.js\b/g)].map((m) => m[0]))];
  assert.ok(named.length >= 3, `layout names ${named.length} js modules — extraction broke`);
  const ghosts = named.filter((n) => !manifest.includes(n));
  assert.deepEqual(ghosts, [],
    "AGENTS.md's layout names a module absent from tools/manifest.cjs (a ghost)");
});

test("AGENTS.md names the deploy branch", () => {
  // Three different answers were in the repo at once: the agent doc named a
  // branch nobody was on, pages.yml deploys from a third, and nothing said so.
  const agents = read("AGENTS.md");
  const pages = read(".github/workflows/pages.yml");
  const deploy = pages.match(/branches:\s*\[([^\]]+)\]/);
  assert.ok(deploy, "pages.yml no longer pins a deploy branch");
  const deployBranch = deploy[1].trim();
  assert.ok(agents.includes(deployBranch),
    `AGENTS.md must name the deploy branch (${deployBranch}) so nobody assumes their branch ships`);
});

test("every npm test:* group names specs that exist", () => {
  const pkg = JSON.parse(read("package.json"));
  const missing = [];
  // Admits SUBDIRECTORIES. Before the tests/ split (AUDIT-SYNTHESIS §R2) this
  // read `tests/[A-Za-z0-9_*-]+\.` — which stops matching the moment specs live
  // under tests/specs/, leaving `missing` empty and this test green while
  // checking nothing at all. `seen` below is what stops that being repeatable:
  // this repo's groups name well over a hundred files, so a pattern that finds
  // none of them is broken by definition.
  let seen = 0;
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    if (!name.startsWith("test:")) continue;
    for (const m of cmd.matchAll(/tests\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_*-]+\.(?:spec\.js|test\.(?:mjs|cjs))/g)) {
      const ref = m[0];
      seen++;
      if (ref.includes("*")) {                       // glob: at least one match must exist
        const re = new RegExp("^" + path.basename(ref).replace(/\*/g, ".*") + "$");
        if (!ls(path.dirname(ref), re).length) missing.push(`${name}: glob ${ref} matches nothing`);
      } else if (!fs.existsSync(path.join(ROOT, ref))) {
        missing.push(`${name}: ${ref}`);
      }
    }
  }
  assert.ok(seen > 100,
    `the spec-path pattern matched only ${seen} references across the test:* groups — ` +
    "it has gone stale against the paths in package.json, so this test is checking nothing");
  assert.deepEqual(missing, [], "an npm test group points at a spec that no longer exists");
});

test("every renderer backend directory is described in AGENTS.md", () => {
  // The TLX (three.js) backend shipped an entire js/render/three/ tree while
  // the agent doc still listed only GLX and WGX. A whole backend going
  // undocumented is the failure mode worth catching; individual files are
  // covered by grouped notation ("tlx-chunked/-post/-shadow.js") and are not
  // checked here.
  const agents = read("AGENTS.md");
  const missing = fs.readdirSync(path.join(ROOT, "js/render"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((d) => !agents.includes(`${d}/`));
  assert.deepEqual(missing, [], "a renderer backend/dir under js/render/ is missing from the AGENTS.md layout");
});

test("the skills index lists every skill", () => {
  const index = read(".claude/skills/README.md");
  const missing = fs.readdirSync(path.join(ROOT, ".claude/skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((s) => !index.includes(s));
  assert.deepEqual(missing, [], "a skill exists on disk but is not in .claude/skills/README.md");
});

test("the agents index lists every custom subagent and gitignore tracks the dir", () => {
  // .claude/* is ignored with an allowlist — without !.claude/agents/, a new
  // subagent would never ship. Same shape as the skills index guard.
  const gitignore = read(".gitignore");
  assert.ok(
    gitignore.includes("!.claude/agents/"),
    ".gitignore must allowlist !.claude/agents/ so subagents are trackable",
  );
  const index = read(".claude/agents/README.md");
  const agentsDir = path.join(ROOT, ".claude/agents");
  assert.ok(fs.existsSync(agentsDir), ".claude/agents/ must exist");
  const missing = fs.readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => f.replace(/\.md$/, ""))
    .filter((name) => !index.includes(name));
  assert.deepEqual(missing, [], "an agent .md exists but is not in .claude/agents/README.md");
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

test("tools/README documents live test-infra knobs and stays two-column in the runner section", () => {
  // SPLIT=N and FLOOR_SLACK are load-bearing: an agent who only reads the index
  // will not know test-shards can fan a group across Playwright shards, or that
  // fixture-consumer-audit fails when FLOOR lags actual adoption by more than 5.
  const index = read("tools/README.md");
  assert.match(index, /SPLIT=N/, "test-shards SPLIT fan-out must be indexed");
  assert.match(index, /FLOOR_SLACK/, "fixture-consumer upper-bound slack must be indexed");
  const specs = index.split("\n").find((l) => l.includes("**select-specs.mjs**")) || "";
  const recall = index.split("\n").find((l) => l.includes("**select-recall.mjs**")) || "";
  assert.ok(specs, "select-specs row missing");
  assert.ok(recall, "select-recall row missing");
  assert.doesNotMatch(specs, /\|\s*check-changes\s*\|/,
    "select-specs sits in the two-column runner table; do not leak the paired-skill column");
  assert.doesNotMatch(recall, /\|\s*check-changes\s*\|/,
    "select-recall sits in the two-column runner table; do not leak the paired-skill column");
});

test("the tools index lists every tool", () => {
  // Underscore-prefixed scripts are transient agent scratch by convention
  // (.gitignore: tools/_*.mjs) and are deliberately not indexed.
  //
  // WALKS SUBDIRECTORIES since the R3 family move (tools/net|car|capture|
  // lighting) — a moved tool must not silently exit the index guard. A file
  // in a subdir passes when the README names the FILE or names its SUBDIR
  // with a trailing slash (a family header covers its members the way
  // grouped notation covers renderer files).
  const index = read("tools/README.md");
  const missing = [];
  for (const e of fs.readdirSync(path.join(ROOT, "tools"), { withFileTypes: true })) {
    if (e.name === "README.md" || e.name.startsWith("_")) continue;
    if (!e.isDirectory()) {
      if (!index.includes(e.name)) missing.push(e.name);
      continue;
    }
    for (const f of fs.readdirSync(path.join(ROOT, "tools", e.name)))
      if (!f.startsWith("_") && !index.includes(f) && !index.includes(`${e.name}/`))
        missing.push(`${e.name}/${f}`);
  }
  assert.deepEqual(missing, [], "a tool exists on disk but is not in tools/README.md");
});

test("docs/README indexes every live engineering doc", () => {
  const index = read("docs/README.md");
  const missing = ls("docs", /\.md$/)
    .filter((f) => f !== "README.md" && !index.includes(f));
  assert.deepEqual(missing, [], "a doc under docs/ is not linked from docs/README.md");
});

test("docs/README indexes every research doc too", () => {
  // The walk above covers docs/ top level only, so four research docs sat
  // unindexed for weeks (round-6 finding) — a doc nobody can find is a doc
  // nobody reads before re-doing its work.
  const index = read("docs/README.md");
  const missing = ls("docs/research", /\.md$/)
    .filter((f) => !index.includes(`research/${f}`));
  assert.deepEqual(missing, [],
    "a doc under docs/research/ is not linked from docs/README.md");
});

test("every relative link in EVERY live doc resolves", () => {
  // The index links RELATIVELY ("[TESTING.md](TESTING.md)"), and the broken-path
  // guard above only matches paths that start with a known top-level directory
  // (js/, tools/, tests/, css/, …). So a docs-relative link pointed at nothing
  // and no test noticed — which is exactly what happened when six WebGPU notes,
  // ten research files and the scenery upgrade plan moved into docs/archive/ and
  // left thirteen dead rows behind in the table that indexes them.
  //
  // EVERY LIVE DOC, NOT JUST THE INDEX. This walked only docs/README.md, while
  // the four dated campaign records cite each other through TEN cross-record
  // links (AUDIT-SYNTHESIS is cited by TEST-AUDIT, CAMPAIGN and TOTAL-AUDIT;
  // CAMPAIGN by TEST-AUDIT and TOTAL-AUDIT; and so on). Archiving any one of
  // them would leave dead links in the others with nothing to say so — the
  // archive plan's whole first step is this widening, landed BEFORE any file
  // moves, because a guard that arrives after the commit it protects has
  // protected nothing (d6f09674's lesson, applied again). Links resolve
  // relative to the DOC'S OWN DIRECTORY, so research/-to-research/ hops and
  // README's rows both check under the same rule. docs/archive/ is excluded:
  // it describes trees that no longer exist, and that is its job.
  const dead = [];
  const docs = ["docs/README.md",
    ...ls("docs", /\.md$/).filter((f) => f !== "README.md").map((f) => `docs/${f}`),
    ...fs.readdirSync(path.join(ROOT, "docs", "research"))
      .filter((f) => f.endsWith(".md")).map((f) => `docs/research/${f}`),
    ...fs.readdirSync(path.join(ROOT, "docs", "tracks"))
      .filter((f) => f.endsWith(".md")).map((f) => `docs/tracks/${f}`),
  ];
  for (const doc of docs) {
    const dir = path.dirname(path.join(ROOT, doc));
    for (const m of read(doc).matchAll(/\]\(([^)#:\s]+)(?:#[^)]*)?\)/g)) {
      const href = m[1].trim();
      if (/^(https?:)?\/\//.test(href)) continue;        // external
      if (!fs.existsSync(path.resolve(dir, href))) dead.push(`${doc} -> ${href}`);
    }
  }
  assert.deepEqual(dead, [], "a live doc links to a path that does not exist");
});

test("every relative link inside docs/archive/ resolves", () => {
  // Archive docs cite each other and point at repo paths that existed when
  // written. Internal cross-links between archived records must still resolve
  // so the provenance chain is navigable; repo-path claims are exempt above.
  const dead = [];
  const archiveDocs = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".md")) archiveDocs.push(rel);
    }
  })("docs/archive");
  for (const doc of archiveDocs) {
    const dir = path.dirname(path.join(ROOT, doc));
    for (const m of read(doc).matchAll(/\]\(([^)#:\s]+)(?:#[^)]*)?\)/g)) {
      const href = m[1].trim();
      if (/^(https?:)?\/\//.test(href)) continue;
      if (!fs.existsSync(path.resolve(dir, href))) dead.push(`${doc} -> ${href}`);
    }
  }
  assert.deepEqual(dead, [], "an archived doc links to a path that does not exist");
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

test("the data hub does not hardcode a season year", () => {
  // js/data/api.js pinned /2026/ into four Jolpica URLs and js/data/hub.js
  // pinned [2026, 2025, 2024, 2023] as the session-picker years. Neither would
  // ever have thrown — the requests stay valid forever, they just describe a
  // season that is over, and YEARS[0] is the fallback for the selected year. So
  // from 2027 the whole hub would have quietly served the wrong season while
  // looking like it worked. Both now read the clock; this stops the literal
  // coming back.
  const bad = [];
  const api = read("js/data/api.js");
  for (const m of api.matchAll(/JOLPICA \+ "\/(\d{4})/g)) bad.push(`js/data/api.js: JOLPICA + "/${m[1]}`);
  const hub = read("js/data/hub.js");
  for (const m of hub.matchAll(/const YEARS\s*=\s*\[\s*(\d{4})/g)) bad.push(`js/data/hub.js: YEARS = [${m[1]}`);
  assert.deepEqual(bad, [],
    "a season year is hardcoded again — derive it from the clock, or the data hub silently ages out");
});
