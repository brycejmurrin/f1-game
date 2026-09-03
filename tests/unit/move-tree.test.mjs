// move-tree.test.mjs — tools/move-tree.mjs on a scratch tree: the file moves,
// every EXACT path citation follows it, bare basenames are reported not
// rewritten, the manifest gains a MOVED entry, and a dry run changes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply, loadMoves, validate, sweep } from "../../tools/move-tree.mjs";

// Fixture comment markers are built at runtime so the docs-integrity comment
// scan does not read the scratch tree's example paths as citations.
const SL = "/" + "/";
function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-move-tree-"));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w("js/game/perf.js", `"use strict";\n${SL} see js/game/perf.js and js/game/perfect.js\n`);
  w("js/game/perfect.js", '"use strict";\n');
  w("tools/manifest.cjs", 'const FULL = [\n  "js/game/perf.js",\n  "js/game/perfect.js",\n];\nmodule.exports = {\n  FULL,\n};\n');
  w("tests/unit/perf.test.mjs", `const P = "js/game/perf.js"; ${SL} perf.js is the governor\n`);
  w("tests/helpers/seed-perf.mjs", 'path.resolve(dirname, "../../js/game/perf.js");\n');
  w("docs/ARCHITECTURE.md", "| `js/game/perf.js` | governor |\n| `js/game/perfect.js` | other |\n");
  w("docs/archive/OLD.md", "js/game/perf.js stays as history\n");
  w(".claude/worktrees/agent-x/docs/NOTE.md", "js/game/perf.js in a sibling worktree\n");
  w(".claude/worktrees/agent-x/.git", "gitdir: elsewhere\n");
  w("tools/nested/.git", "gitdir: elsewhere\n");
  w("tools/nested/README.md", "js/game/perf.js inside a nested checkout\n");
  w("moves.json", JSON.stringify({ moves: { "js/game/perf.js": "js/perf/governor.js" } }));
  return root;
}

test("a move rewrites exact path citations, leaves bare names and the archive, records MOVED", () => {
  const root = scratch();
  try {
    const moves = loadMoves(path.join(root, "moves.json"));
    assert.deepEqual(validate(root, moves), []);
    const res = apply(root, moves, { git: false, genShell: false });
    assert.equal(res.moved, 1);
    assert.ok(fs.existsSync(path.join(root, "js/perf/governor.js")));
    assert.ok(!fs.existsSync(path.join(root, "js/game/perf.js")));
    const manifest = fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8");
    assert.match(manifest, /"js\/perf\/governor\.js",\n  "js\/game\/perfect\.js"/, "the FULL entry moved, its neighbour did not");
    assert.match(manifest, /const MOVED = \{\n  "js\/game\/perf\.js": "js\/perf\/governor\.js",\n\};/);
    assert.match(manifest, /module\.exports = \{\n  MOVED,/);
    assert.equal(fs.readFileSync(path.join(root, "tests/unit/perf.test.mjs"), "utf8"),
      `const P = "js/perf/governor.js"; ${SL} perf.js is the governor\n`, "the exact path moved; the bare name stayed");
    assert.equal(fs.readFileSync(path.join(root, "tests/helpers/seed-perf.mjs"), "utf8"),
      'path.resolve(dirname, "../../js/perf/governor.js");\n',
      "a target path that is the SUFFIX of a longer relative path (../../js/game/perf.js) still gets rewritten — a `/` right before the match is a separator, not a name-extending character");
    assert.match(fs.readFileSync(path.join(root, "docs/ARCHITECTURE.md"), "utf8"), /`js\/perf\/governor\.js`[\s\S]*`js\/game\/perfect\.js`/);
    assert.equal(fs.readFileSync(path.join(root, "docs/archive/OLD.md"), "utf8"), "js/game/perf.js stays as history\n");
    assert.equal(fs.readFileSync(path.join(root, ".claude/worktrees/agent-x/docs/NOTE.md"), "utf8"), "js/game/perf.js in a sibling worktree\n", "subagent worktrees are never swept");
    assert.equal(fs.readFileSync(path.join(root, "tools/nested/README.md"), "utf8"), "js/game/perf.js inside a nested checkout\n", "a directory with its own .git is another checkout");
    assert.match(fs.readFileSync(path.join(root, "js/perf/governor.js"), "utf8"), /see js\/perf\/governor\.js and js\/game\/perfect\.js/);
    assert.ok(res.leftovers.some((l) => l.file === "tests/unit/perf.test.mjs" && l.name === "perf.js"), "the bare-name mention is reported for a human");
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
    sweep(root, [{ from: "js/game/perfect.js", to: "js/game/perfect2.js" }], { write: true });
    const after = fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8");
    assert.match(after, /const MOVED = \{\n  "js\/game\/perf\.js": "js\/perf\/governor\.js",\n\};/,
      "the MOVED key stays the pre-move literal even after a later, unrelated sweep touches the same file");
    // And a sweep for the SAME already-recorded move (idempotent re-run,
    // e.g. after fixing a boundary-regex bug) must not touch the key either.
    sweep(root, moves, { write: true });
    assert.equal(fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8").includes('"js/perf/governor.js": "js/perf/governor.js"'), false,
      "re-sweeping the move that was just recorded must not flip its own MOVED entry to an identity mapping");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("--plan changes nothing and still reports what would be rewritten", () => {
  const root = scratch();
  try {
    const before = fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8");
    const res = apply(root, loadMoves(path.join(root, "moves.json")), { plan: true, git: false, genShell: false });
    assert.ok(res.rewritten.length >= 3);
    assert.ok(fs.existsSync(path.join(root, "js/game/perf.js")));
    assert.equal(fs.readFileSync(path.join(root, "tools/manifest.cjs"), "utf8"), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a missing source or an occupied target refuses before touching anything", () => {
  const root = scratch();
  try {
    assert.deepEqual(validate(root, [{ from: "js/game/nope.js", to: "js/perf/x.js" }]), ["missing: js/game/nope.js"]);
    assert.deepEqual(validate(root, [{ from: "js/game/perf.js", to: "js/game/perfect.js" }]), ["target exists: js/game/perfect.js"]);
    assert.throws(() => apply(root, [{ from: "js/game/perf.js", to: "js/game/perfect.js" }], { git: false, genShell: false }), /target exists/);
    assert.ok(fs.existsSync(path.join(root, "js/game/perf.js")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
