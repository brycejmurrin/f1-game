// BOOK-OWN (#6819) end to end on a real git fixture (#6850): pinVerdict judges a change that adds a pin, bookPins
// turns the verdict into the fragment {tree:{assertPins:1}}, and the booked fragment turns the verdict green; two
// such fragments fold in either merge order and the merged tip still judges green. The module resolves its ROOT from
// its own location, so the fixture carries a copy of it and a runner, and runs them as a child process.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PIN = "assert." + "match(x, /y/);\n"; // split so this file is no pin itself
const UNIT = ["tests", "unit"].join("/"), BASE_FILE = UNIT + "/base-pins.mjs"; // fixture paths, built so they are no repo-path reference

const RUNNER = `
import fs from "node:fs";
import { pinVerdict, bookPins, mergeFragment, fold, load } from "./tools/check/ratchets.mjs";
const [op, arg] = process.argv.slice(2);
if (op === "verdict") {
  const v = await pinVerdict("assertPins");
  console.log(JSON.stringify({ ok: v.ok, growth: v.growth, booked: v.booked, unbooked: v.unbooked, ceiling: v.ceiling, value: v.value }));
} else if (op === "book") {
  const v = await pinVerdict("assertPins");
  const rows = bookPins([{ tree: true, metric: "assertPins", value: v.value, ceiling: v.ceiling, absorb: 5 }], [v]);
  const frag = mergeFragment({}, rows);
  fs.mkdirSync("tests/data/ratchets.d", { recursive: true });
  fs.writeFileSync("tests/data/ratchets.d/" + arg, JSON.stringify(frag));
  console.log(JSON.stringify(frag));
} else if (op === "fold") {
  console.log(JSON.stringify({ n: await fold(), ceiling: load().tree.assertPins.ceiling }));
}
`;

function fixture(t) {
  const dir = mkTmpDir("apex-bookown-");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => cp.execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const put = (rel, text, mode = "w") => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); (mode === "a" ? fs.appendFileSync : fs.writeFileSync)(path.join(dir, rel), text); };
  const commit = (msg) => { git("add", "-A"); git("commit", "-q", "--no-verify", "-m", msg); };
  const run = (op, arg = "") => JSON.parse(cp.execFileSync("node", ["run.mjs", op, arg], { cwd: dir, encoding: "utf8", env: { ...process.env, APEX_RATCHET_BASE_REF: "base", APEX_RATCHET_ABSOLUTE: "" } }));
  git("init", "-q", "-b", "main");
  for (const f of ["ratchets.mjs", "merge-hygiene.mjs"]) put(`tools/check/${f}`, fs.readFileSync(path.join(ROOT, "tools/check", f), "utf8"));
  put("run.mjs", RUNNER);
  // The tip has ONE pin of headroom: two pins counted, ceiling 3.
  put("tests/data/ratchets.json", JSON.stringify({ files: {}, tree: { assertPins: { ceiling: 3, slack: 20, absorb: 5 } } }, null, 1));
  put(BASE_FILE, PIN + PIN);
  commit("base");
  git("tag", "base");
  return { dir, git, put, commit, run };
}

test("BOOK-OWN e2e: pinVerdict red -> bookPins -> fragment {tree:{assertPins:1}} -> pinVerdict green", (t) => {
  const { git, put, commit, run } = fixture(t);
  git("checkout", "-q", "-b", "topic");
  put(BASE_FILE, PIN, "a");
  commit("adds a pin into the base's headroom");
  const red = run("verdict");
  assert.deepEqual([red.ok, red.growth, red.booked, red.unbooked], [false, 1, 0, 1], "headroom booked nothing: red at once");
  assert.deepEqual(run("book", "topic.json"), { tree: { assertPins: 1 } });
  const green = run("verdict");
  assert.deepEqual([green.ok, green.growth, green.booked, green.unbooked, green.ceiling], [true, 1, 1, 0, 4]);
});

test("BOOK-OWN e2e: two real fragments fold under any merge order and the merged tip judges green", (t) => {
  for (const order of [["a", "b"], ["b", "a"]]) {
    const { git, put, commit, run } = fixture(t);
    for (const n of ["a", "b"]) {
      git("checkout", "-q", "-b", n, "base");
      put(`${UNIT}/${n}-pin.test.mjs`, PIN);
      commit(`${n} adds a pin`);
      assert.deepEqual(run("book", `${n}.json`), { tree: { assertPins: 1 } }, `${n} books its own pin`);
      commit(`${n} fragment`);
    }
    git("checkout", "-q", "main");
    for (const n of order) git("merge", "-q", "--no-ff", "-m", `merge ${n}`, n);
    const merged = run("verdict");
    assert.deepEqual([merged.ok, merged.growth, merged.booked, merged.unbooked, merged.ceiling], [true, 2, 2, 0, 5], order.join(","));
    assert.deepEqual(run("fold"), { n: 2, ceiling: 5 }, "folding moves the number, never the ceiling");
    const folded = run("verdict");
    assert.deepEqual([folded.ok, folded.booked, folded.ceiling], [true, 2, 5], "ratchets.json now carries the sum");
  }
});
