// conflict-cure.test.mjs — deploy.mjs's / sync-pr.mjs's cure of a conflicted
// index.html and package.json keeps BOTH sides' hand edits (ledger L13, 2026-10-09).
//
// The cure used to `checkout --theirs index.html` and `--ours package.json`,
// which threw the other side's non-conflicting hand edits away (a DOM element, a
// dependency) and then regenerated only the generated parts. The pure halves
// live in tools/lib/conflict-cure.mjs; the real-git test below builds an actual
// conflicted merge and feeds the resolvers what git hands them.
//
// Run: node --test tests/unit/conflict-cure.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveGenBlocks, mergeJson3, mergePackageJson } from "../../tools/lib/conflict-cure.mjs";

const SHELL = (scripts, extra = "", after = "") => `<head>
<!-- @gen-shell:scripts -->
${scripts}
<!-- /@gen-shell:scripts -->
</head>
<body>
${extra}<p>hand</p>
<p>keep</p>
<p>keep</p>
<p>keep</p>
${after}
</body>
`;

test("resolveGenBlocks collapses a hunk inside a @gen-shell span and keeps everything else", () => {
  const text = SHELL("<<<<<<< HEAD\n<script src=a.js></script>\n=======\n<script src=b.js></script>\n>>>>>>> origin/ship");
  const r = resolveGenBlocks(text);
  assert.deepEqual(r.unresolved, []);
  assert.equal(r.text, SHELL("<script src=a.js></script>"));
  assert.doesNotMatch(r.text, /<<<<<<<|>>>>>>>/);
});

test("a hunk in hand-written markup, or one that touches a span marker, is NOT resolved", () => {
  const outside = SHELL("<script src=a.js></script>").replace("<p>hand</p>", "<<<<<<< HEAD\n<p>ours</p>\n=======\n<p>theirs</p>\n>>>>>>> origin/ship");
  const r = resolveGenBlocks(outside);
  assert.equal(r.unresolved.length, 1, "hand-written DOM conflicts stop the cure");
  assert.match(r.text, /<<<<<<< HEAD/, "the markers stay for a human");
  const atEdge = "<!-- @gen-shell:css -->\n<<<<<<< HEAD\nx\n<!-- /@gen-shell:css -->\n=======\ny\n>>>>>>> t\n";
  assert.equal(resolveGenBlocks(atEdge).unresolved.length, 1, "a hunk spanning a close marker is not inside the block");
  // the title-art block uses the `@gen-shell:/name` spelling for its close
  const art = "<!-- @gen-shell:title-art -->\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> t\n<!-- @gen-shell:/title-art -->\n<<<<<<< HEAD\nq\n=======\nr\n>>>>>>> t\n";
  const ra = resolveGenBlocks(art);
  assert.deepEqual(ra.unresolved, [8], "the title-art block resolves, the hunk after its close does not");
  assert.match(ra.text, /^<!-- @gen-shell:title-art -->\na\n<!-- @gen-shell:\/title-art -->\n/);
});

test("mergeJson3 keeps a dependency one side added, a deletion the other left alone, and flags a real clash", () => {
  const base = { scripts: { start: "a", "test:x": "1" }, devDependencies: { a: "1", c: "1" } };
  const ours = { scripts: { start: "a", "test:x": "2", build: "b" }, devDependencies: { a: "1", c: "1" } };
  const theirs = { scripts: { start: "a", "test:x": "3" }, devDependencies: { a: "1", b: "1", c: "1" }, engines: { node: ">=22" } };
  const r = mergeJson3(base, ours, theirs);
  assert.deepEqual(r.conflicts, [], "a test script differing on both sides is the generator's to rewrite");
  assert.equal(r.merged.scripts.build, "b", "our script survives");
  assert.deepEqual(Object.keys(r.merged.devDependencies), ["a", "b", "c"], "their dependency joins, still sorted");
  assert.deepEqual(r.merged.engines, { node: ">=22" });
  assert.equal(r.merged.scripts["test:x"], "2", "ours kept for the generator to overwrite");
  const gone = mergeJson3({ x: 1, y: 2 }, { x: 1 }, { x: 1, y: 2, z: 3 });
  assert.deepEqual(gone.merged, { x: 1, z: 3 }, "deleted by one side, untouched by the other: stays deleted");
  const clash = mergeJson3({ dependencies: { a: "1" }, name: "n" }, { dependencies: { a: "2" }, name: "n" }, { dependencies: { a: "3" }, name: "n" });
  assert.deepEqual(clash.conflicts, ["dependencies.a"]);
  assert.deepEqual(mergeJson3({}, { k: 1 }, { k: 2 }).conflicts, ["k"], "add/add of different values");
});

test("a real conflicted merge: hand edits on both sides survive the cure", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-cure-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" });
  const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  const pkg = (o) => JSON.stringify(o, null, 2) + "\n";
  try {
    g("init", "-q", "-b", "base"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    write("index.html", SHELL("<script src=base.js></script>\n<script src=z.js></script>"));
    write("package.json", pkg({ name: "x", scripts: { "test:x": "node --test", start: "s" }, devDependencies: { a: "1" } }));
    g("add", "-A"); g("commit", "-qm", "base");
    // THEIRS (the deploy tip): a new script tag in the block, a DOM element, a dependency, a test script.
    g("checkout", "-q", "-b", "tip");
    write("index.html", SHELL("<script src=base.js></script>\n<script src=tip.js></script>\n<script src=z.js></script>", "", "<div id=tip-panel></div>\n"));
    write("package.json", pkg({ name: "x", scripts: { "test:x": "node --test tip", start: "s" }, devDependencies: { a: "1", tip: "1" } }));
    g("commit", "-qam", "tip");
    // OURS (the PR): its own script tag at the same place, its own DOM element, a script, a dependency.
    g("checkout", "-q", "-b", "ours", "base");
    write("index.html", SHELL("<script src=base.js></script>\n<script src=ours.js></script>\n<script src=z.js></script>", "<div id=ours-panel></div>\n"));
    write("package.json", pkg({ name: "x", scripts: { "test:x": "node --test ours", start: "s", lint: "l" }, devDependencies: { a: "1", ours: "1" } }));
    g("commit", "-qam", "ours");
    assert.throws(() => g("merge", "--no-edit", "tip"), "the merge conflicts");
    g("checkout", "--merge", "--", "index.html");
    const shell = resolveGenBlocks(fs.readFileSync(path.join(dir, "index.html"), "utf8"));
    assert.deepEqual(shell.unresolved, [], "the only conflict is in the generated block");
    assert.match(shell.text, /ours-panel/, "OUR hand-written element survives");
    assert.match(shell.text, /tip-panel/, "THEIR hand-written element survives (the old --theirs kept only this one)");
    assert.doesNotMatch(shell.text, /<<<<<<<|>>>>>>>/);
    const stage = (n) => { try { return g("show", `:${n}:package.json`); } catch { return ""; } };
    const m = mergePackageJson(stage(1), stage(2), stage(3));
    assert.deepEqual(m.conflicts, []);
    const merged = JSON.parse(m.text);
    assert.equal(merged.scripts.lint, "l", "OUR non-test script survives (the old --ours kept only this side)");
    assert.deepEqual(Object.keys(merged.devDependencies), ["a", "ours", "tip"], "THEIR dependency is not dropped");
    assert.ok(m.text.endsWith("}\n"));
    // What the replaced cure did, on this same conflict: each wholesale side lost the other's edit.
    g("checkout", "--theirs", "--", "index.html");
    assert.doesNotMatch(fs.readFileSync(path.join(dir, "index.html"), "utf8"), /ours-panel/, "--theirs dropped our element");
    g("checkout", "--ours", "--", "package.json");
    assert.doesNotMatch(fs.readFileSync(path.join(dir, "package.json"), "utf8"), /"tip"/, "--ours dropped their dependency");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
