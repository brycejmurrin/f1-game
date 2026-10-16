// ratchet-merge-hotspot.test.mjs — two PRs that each auto-raise a ratchet
// must merge into the tip, in either order, with no conflict (#2291).
//
// Measured 2026-10-15 21:57Z: #2231, #2242, #2254 and #2289 were DIRTY on
// tests/data/ratchets.json alone. Each PR grew the SAME module as another
// (js/game.js or js/agent/apex.js), and the commit hook's --auto-raise wrote a
// different absolute ceiling onto the same JSON line. Sorting and
// one-entry-per-line (tools/check/merge-hygiene.mjs) cannot fix a same-line
// fight, and GitHub's mergeability check runs no custom .gitattributes merge
// driver (a driver needs `git config merge.<name>.driver`, which never reaches
// the server; union would keep both numbers). So the auto-raise writes a
// per-branch DELTA fragment (tests/data/ratchets.d/<branch>.json) that only
// its own branch ever touches, and the effective ceiling is the base plus
// the sum of every fragment.
//
// End to end: a scratch repo carries a copy of the real tool and a tiny
// ratchets.json. Every branch grows a source file and runs the tool's own
// `--auto-raise`, as the commit hook does, so the test covers the write path
// rather than a hand-made fixture.
import "../helpers/git-fixture-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = ["tools/check/ratchets.mjs", "tools/check/merge-hygiene.mjs"];

function repo() {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "ratchet-hotspot-"));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  const tool = (...a) => cp.execFileSync(process.execPath, ["tools/check/ratchets.mjs", ...a],
    { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_EVENT_NAME: "", GITHUB_ACTIONS: "" } });
  git("init", "-q", "-b", "ship");
  git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t"); git("config", "commit.gpgsign", "false");
  for (const t of TOOLS) write(t, fs.readFileSync(path.join(ROOT, t), "utf8"));
  // Two modules, 200 lines each; a 4-line block comment at the top keeps
  // lines != codeLines so both metrics move.
  const body = (n) => ["/*", " * fixture", " */", "// x", ...Array.from({ length: n - 4 }, (_, i) => `var a${i} = ${i};`)].join("\n");
  write("js/ui/hud.js", body(200) + "\n");
  write("js/agent/apex.js", body(200) + "\n");
  write("js/car/car3d.js", body(200) + "\n");
  // Start every ceiling AT its value: the tool writes the normalised form.
  write("tests/data/ratchets.json", JSON.stringify({ files: {
    "js/agent/apex.js": { codeLines: 1, lines: 1 }, "js/car/car3d.js": { lines: 1 }, "js/ui/hud.js": { codeLines: 1, lines: 1 } } }));
  tool("--update");
  git("add", "-A"); git("commit", "-qm", "base");
  /** Branch `name` off ship, insert `add` lines into `file` after line `at`
   *  (distinct per PR, so the SOURCE merges clean and only the ratchet can
   *  fight), run the hook's --auto-raise, and commit everything it wrote. */
  const pr = (name, file, add, at, from = "ship") => {
    git("checkout", "-q", "-b", name, from);
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    lines.splice(at, 0, ...Array.from({ length: add }, (_, i) => `var ${name.replace(/\W/g, "_")}${i} = 1;`));
    fs.writeFileSync(path.join(dir, file), lines.join("\n"));
    tool("--auto-raise");
    git("add", "-A"); git("commit", "-qm", name);
    git("checkout", "-q", "ship");
  };
  /** `git merge-tree --write-tree a b`: the conflicted paths ([] = clean). */
  const conflicts = (a, b) => {
    const r = cp.spawnSync("git", ["merge-tree", "--write-tree", "--name-only", "--no-messages", a, b], { cwd: dir, encoding: "utf8" });
    return r.status === 0 ? [] : r.stdout.trim().split("\n").slice(1).filter(Boolean);
  };
  return { dir, git, tool, pr, conflicts };
}

test("two PRs auto-raising the SAME module's ceiling merge clean, in either order", (t) => {
  const r = repo();
  t.after(() => fs.rmSync(r.dir, { recursive: true, force: true }));
  r.pr("cursor/a-1111", "js/ui/hud.js", 7, 50);
  r.pr("cursor/b-2222", "js/ui/hud.js", 12, 150);
  assert.deepEqual(r.conflicts("cursor/a-1111", "cursor/b-2222"), [], "A and B both raised js/ui/hud.js — the measured #2231/#2242 shape (two PRs growing game.js)");
  // Land A on the tip, then B must still merge (the sync treadmill case).
  r.git("merge", "-q", "--no-ff", "-m", "land A", "cursor/a-1111");
  assert.deepEqual(r.conflicts("ship", "cursor/b-2222"), [], "B against a tip that already carries A");
  r.git("merge", "-q", "--no-ff", "-m", "land B", "cursor/b-2222");
  // The merged tree is under every effective ceiling, and not loose.
  const v = JSON.parse(r.tool("--json"));
  assert.equal(v.ok, true, `merged tip red: ${JSON.stringify(v.over.concat(v.loose))}`);
  const game = v.rows.filter((x) => x.file === "js/ui/hud.js");
  for (const x of game) assert.equal(x.ceiling, x.value, `${x.metric}: ceiling ${x.ceiling} tracks the merged value ${x.value} exactly`);
});

test("PRs raising different modules, and a tip that LOWERED one, never share a hunk", (t) => {
  const r = repo();
  t.after(() => fs.rmSync(r.dir, { recursive: true, force: true }));
  r.pr("cursor/c-3333", "js/agent/apex.js", 3, 180);
  r.pr("cursor/d-4444", "js/car/car3d.js", 5, 100);
  // The #2254/#2289 shape: the tip extracted lines out of apex.js (a lowered
  // ceiling) while an open PR grew it.
  r.git("checkout", "-q", "-b", "cursor/extract-5555", "ship");
  const apex = path.join(r.dir, "js/agent/apex.js");
  const kept = fs.readFileSync(apex, "utf8").split("\n");
  kept.splice(20, 100); // past the 60-line slack, so the hook LOWERS the ceiling
  fs.writeFileSync(apex, kept.join("\n"));
  r.tool("--auto-raise");
  r.git("add", "-A"); r.git("commit", "-qm", "extract");
  r.git("checkout", "-q", "ship");
  r.git("merge", "-q", "--no-ff", "-m", "land extract", "cursor/extract-5555");
  for (const [a, b] of [["cursor/c-3333", "cursor/d-4444"], ["ship", "cursor/c-3333"], ["ship", "cursor/d-4444"]])
    assert.deepEqual(r.conflicts(a, b), [], `${a} x ${b}`);
});

test("--fold sums the fragments into ratchets.json and deletes them, ceilings unchanged", (t) => {
  const r = repo();
  t.after(() => fs.rmSync(r.dir, { recursive: true, force: true }));
  r.pr("cursor/e-6666", "js/ui/hud.js", 4, 100);
  r.git("merge", "-q", "--no-ff", "-m", "land E", "cursor/e-6666");
  const before = JSON.parse(r.tool("--json")).rows.map((x) => `${x.file} ${x.metric} ${x.ceiling}`);
  assert.ok(fs.readdirSync(path.join(r.dir, "tests/data/ratchets.d")).some((f) => f.endsWith(".json")), "the raise went to a fragment");
  r.tool("--fold");
  const left = fs.existsSync(path.join(r.dir, "tests/data/ratchets.d"))
    ? fs.readdirSync(path.join(r.dir, "tests/data/ratchets.d")).filter((f) => f.endsWith(".json")) : [];
  assert.deepEqual(left, [], "fold deletes every fragment");
  assert.deepEqual(JSON.parse(r.tool("--json")).rows.map((x) => `${x.file} ${x.metric} ${x.ceiling}`), before);
});
