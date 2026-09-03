// move-tree.test.mjs — tools/move-tree.mjs on a scratch tree: the file moves,
// every EXACT path citation follows it, bare basenames are reported not
// rewritten, the manifest gains a MOVED entry, and a dry run changes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply, loadMoves, validate, sweep, splitSegmentMentions } from "../../tools/move-tree.mjs";

// Fixture comment markers are built at runtime so the docs-integrity comment
// scan does not read the scratch tree's example paths as citations.
//
// The fixture paths are DELIBERATELY fictional (js/zzfix/…): this tool's own
// sweep rewrites exact repo paths everywhere under tests/, so a fixture built
// from real ones is rewritten by the very moves it exists to test — batch 2 of
// the Phase 2b window turned this file's move map into an identity mapping
// that way (2026-09-03). A name no move map can ever contain is immune.
const SL = "/" + "/";
function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-move-tree-"));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w("js/zzfix/alpha.js", `"use strict";\n${SL} see js/zzfix/alpha.js and js/zzfix/alphabet.js\n`);
  w("js/zzfix/alphabet.js", '"use strict";\n');
  w("tools/manifest.cjs", 'const FULL = [\n  "js/zzfix/alpha.js",\n  "js/zzfix/alphabet.js",\n];\nmodule.exports = {\n  FULL,\n};\n');
  w("tests/unit/zzfix.test.mjs", `const P = "js/zzfix/alpha.js"; ${SL} alpha.js is the bare name\n`);
  w("tests/helpers/seed-zzfix.mjs", 'path.resolve(dirname, "../../js/zzfix/alpha.js");\n');
  w("docs/ARCHITECTURE.md", "| `js/zzfix/alpha.js` | governor |\n| `js/zzfix/alphabet.js` | other |\n");
  w("docs/archive/OLD.md", "js/zzfix/alpha.js stays as history\n");
  w(".claude/worktrees/agent-x/docs/NOTE.md", "js/zzfix/alpha.js in a sibling worktree\n");
  w(".claude/worktrees/agent-x/.git", "gitdir: elsewhere\n");
  w("tools/nested/.git", "gitdir: elsewhere\n");
  w("tools/nested/README.md", "js/zzfix/alpha.js inside a nested checkout\n");
  w("moves.json", JSON.stringify({ moves: { "js/zzfix/alpha.js": "js/zzfix/beta.js" } }));
  return root;
}

test("a move rewrites exact path citations, leaves bare names and the archive, records MOVED", () => {
  const root = scratch();
  try {
    const moves = loadMoves(path.join(root, "moves.json"));
    assert.deepEqual(validate(root, moves), []);
    const res = apply(root, moves, { git: false, genShell: false });
    assert.equal(res.moved, 1);
    assert.ok(fs.existsSync(path.join(root, "js/zzfix/beta.js")));
    assert.ok(!fs.existsSync(path.join(root, "js/zzfix/alpha.js")));
    const manifest = fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8");
    assert.match(manifest, /"js\/zzfix\/beta\.js",\n  "js\/zzfix\/alphabet\.js"/, "the FULL entry moved, its neighbour did not");
    assert.match(manifest, /const MOVED = \{\n  "js\/zzfix\/alpha\.js": "js\/zzfix\/beta\.js",\n\};/);
    assert.match(manifest, /module\.exports = \{\n  MOVED,/);
    assert.equal(fs.readFileSync(path.join(root, "tests/unit/zzfix.test.mjs"), "utf8"),
      `const P = "js/zzfix/beta.js"; ${SL} alpha.js is the bare name\n`, "the exact path moved; the bare name stayed");
    assert.equal(fs.readFileSync(path.join(root, "tests/helpers/seed-zzfix.mjs"), "utf8"),
      'path.resolve(dirname, "../../js/zzfix/beta.js");\n',
      "a target path that is the SUFFIX of a longer relative path (../../js/zzfix/alpha.js) still gets rewritten — a `/` right before the match is a separator, not a name-extending character");
    assert.match(fs.readFileSync(path.join(root, "docs/ARCHITECTURE.md"), "utf8"), /`js\/zzfix\/beta\.js`[\s\S]*`js\/zzfix\/alphabet\.js`/);
    assert.equal(fs.readFileSync(path.join(root, "docs/archive/OLD.md"), "utf8"), "js/zzfix/alpha.js stays as history\n");
    assert.equal(fs.readFileSync(path.join(root, ".claude/worktrees/agent-x/docs/NOTE.md"), "utf8"), "js/zzfix/alpha.js in a sibling worktree\n", "subagent worktrees are never swept");
    assert.equal(fs.readFileSync(path.join(root, "tools/nested/README.md"), "utf8"), "js/zzfix/alpha.js inside a nested checkout\n", "a directory with its own .git is another checkout");
    assert.match(fs.readFileSync(path.join(root, "js/zzfix/beta.js"), "utf8"), /see js\/zzfix\/beta\.js and js\/zzfix\/alphabet\.js/);
    assert.ok(res.leftovers.some((l) => l.file === "tests/unit/zzfix.test.mjs" && l.name === "alpha.js"), "the bare-name mention is reported for a human");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a re-sweep never rewrites the MOVED block's own historical keys", () => {
  const root = scratch();
  try {
    const moves = loadMoves(path.join(root, "moves.json"));
    apply(root, moves, { git: false, genShell: false });
    // Simulate a second sweep over the tree AFTER the move landed (a later
    // batch, or a deliberate re-sweep) naming a DIFFERENT file whose target
    // path happens to share no text with the first move — the MOVED block
    // must still read exactly as it did right after the first apply.
    const before = fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8");
    sweep(root, [{ from: "js/zzfix/alphabet.js", to: "js/zzfix/alphabet2.js" }], { write: true });
    const after = fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8");
    assert.match(after, /const MOVED = \{\n  "js\/zzfix\/alpha\.js": "js\/zzfix\/beta\.js",\n\};/,
      "the MOVED key stays the pre-move literal even after a later, unrelated sweep touches the same file");
    // And a sweep for the SAME already-recorded move (idempotent re-run,
    // e.g. after fixing a boundary-regex bug) must not touch the key either.
    sweep(root, moves, { write: true });
    assert.equal(fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8").includes('"js/zzfix/beta.js": "js/zzfix/beta.js"'), false,
      "re-sweeping the move that was just recorded must not flip its own MOVED entry to an identity mapping");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a path built from separate quoted segments is REPORTED, not rewritten", () => {
  const root = scratch();
  try {
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
    w("tests/unit/joins.test.mjs", 'readFileSync(path.join(ROOT, "js", "zzfix", "alpha.js"));\n');
    const moves = loadMoves(path.join(root, "moves.json"));
    const found = splitSegmentMentions(root, moves);
    assert.ok(found.some((m) => m.file === "tests/unit/joins.test.mjs" && m.from === "js/zzfix/alpha.js"),
      "a path.join()-style segment list naming a moved file must be reported — the token sweep cannot see it");
    const res = apply(root, moves, { git: false, genShell: false });
    assert.equal(fs.readFileSync(path.join(root, "tests/unit/joins.test.mjs"), "utf8"),
      'readFileSync(path.join(ROOT, "js", "zzfix", "alpha.js"));\n',
      "and it is left exactly as it was — the call shape varies too much to edit blind");
    assert.ok(res.splitSegments.length >= 1, "apply() surfaces the same list to its caller");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("--plan changes nothing and still reports what would be rewritten", () => {
  const root = scratch();
  try {
    const before = fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8");
    const res = apply(root, loadMoves(path.join(root, "moves.json")), { plan: true, git: false, genShell: false });
    assert.ok(res.rewritten.length >= 3);
    assert.ok(fs.existsSync(path.join(root, "js/zzfix/alpha.js")));
    assert.equal(fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8"), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a missing source or an occupied target refuses before touching anything", () => {
  const root = scratch();
  try {
    assert.deepEqual(validate(root, [{ from: "js/zzfix/nope.js", to: "js/zzfix/x.js" }]), ["missing: js/zzfix/nope.js"]);
    assert.deepEqual(validate(root, [{ from: "js/zzfix/alpha.js", to: "js/zzfix/alphabet.js" }]), ["target exists: js/zzfix/alphabet.js"]);
    assert.throws(() => apply(root, [{ from: "js/zzfix/alpha.js", to: "js/zzfix/alphabet.js" }], { git: false, genShell: false }), /target exists/);
    assert.ok(fs.existsSync(path.join(root, "js/zzfix/alpha.js")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
