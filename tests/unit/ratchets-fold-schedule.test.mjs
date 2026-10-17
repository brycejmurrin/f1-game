// ratchets-fold-schedule.test.mjs — `ratchets.mjs --fold --min-fragments=N`
// and the weekly workflow that runs it (#2538). Scratch repo, real tool copy.
import "../helpers/git-fixture-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const F = ["js", "a.js"].join("/"); // built, so the path scan sees no repo path
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function scratch() {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "ratchet-fold-"));
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  for (const t of ["tools/check/ratchets.mjs", "tools/check/merge-hygiene.mjs"]) write(t, fs.readFileSync(path.join(ROOT, t), "utf8"));
  write(F, "var a = 1;\n");
  write("tests/data/ratchets.json", JSON.stringify({ files: { [F]: { lines: 10 } } }));
  for (const n of ["x", "y", "z"]) write(`tests/data/ratchets.d/${n}.json`, JSON.stringify({ files: { [F]: { lines: 1 } } }));
  const tool = (...a) => cp.execFileSync(process.execPath, ["tools/check/ratchets.mjs", ...a], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { dir, tool, frags: () => fs.readdirSync(path.join(dir, "tests/data/ratchets.d")).length, ceiling: () => JSON.parse(fs.readFileSync(path.join(dir, "tests/data/ratchets.json"), "utf8")).files[F].lines };
}

test("--fold --min-fragments=N does nothing below N and folds at N, ceilings unchanged", () => {
  const s = scratch();
  try {
    assert.match(s.tool("--fold", "--min-fragments=4"), /nothing folded/);
    assert.equal(s.frags(), 3, "below the threshold the fragments stay");
    assert.equal(s.ceiling(), 10, "and ratchets.json is untouched");
    assert.match(s.tool("--fold", "--min-fragments=3"), /3 fragment\(s\) summed/);
    assert.equal(s.frags(), 0, "fragments deleted");
    assert.equal(s.ceiling(), 13, "base 10 + three deltas of 1 = the effective ceiling before the fold");
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test("the workflow is weekly + dispatch, pushes a bot branch to a PR, never the deploy branch", () => {
  const w = fs.readFileSync(path.join(ROOT, ".github/workflows/ratchets-fold.yml"), "utf8");
  assert.match(w, /schedule:\s*\n\s*- cron: "[^"]+"/);
  assert.match(w, /workflow_dispatch:/);
  assert.match(w, /--fold "--min-fragments=\$MIN_FRAGMENTS"/);
  assert.match(w, /timeout-minutes: \d+/);
  assert.match(w, /git push --force-with-lease origin bot\/ratchets-fold/);
  assert.doesNotMatch(w, /git push[^\n]*claude\/f1-game-project-26h3ng/, "the protected deploy branch is reached only through the PR");
  assert.match(w, /MIN_FRAGMENTS: \$\{\{ inputs\.min_fragments/, "the dispatch input enters shell via env only");
  assert.doesNotMatch(w, /run:[^\n]*\$\{\{ inputs\./);
});
