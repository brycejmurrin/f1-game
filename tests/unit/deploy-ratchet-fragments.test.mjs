// deploy-ratchet-fragments — #5870: deploy.mjs's ratchets.json conflict cure (sync-pr reuses it) judges the
// overrun on EFFECTIVE ceilings (ratchets.json + tests/data/ratchets.d) and never folds or deletes a fragment.
// A throwaway repo whose deploy tip carries a fragment, like 8bb193ac's eagerBytes +1069; the snap is injected
// (it mimics ratchets.mjs --update --absolute: measure, write absolutes, delete every fragment).
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cureRatchets, effectiveRatchetsAt, unfoldFragments } from "../../tools/ci/deploy.mjs";
import { applyFragments } from "../../tools/check/ratchets.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const RATCHETS = "tests/data/ratchets.json", FRAG_DIR = "tests/data/ratchets.d", FRAG = `${FRAG_DIR}/claude--tip-raise.json`;
const FILE = ["fixture", "a.js"].join("/"); // a fixture row, not a repo path
const HISTORY = "docs/notes/CEILING-HISTORY.md";
const json = (o) => JSON.stringify(o, null, 2) + "\n";
const ratchets = (lines) => json({ files: { [FILE]: { lines } }, tree: { eagerBytes: { ceiling: 1000, slack: 0 } } });

function fixture() {
  const dir = mkTmpDir("apex-ratchet-frag-");
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe", encoding: "utf8" });
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  g("init", "-q", "-b", "tip"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  put(RATCHETS, ratchets(10)); put(HISTORY, "# history\n"); g("add", "-A"); g("commit", "-qm", "base");
  g("checkout", "-q", "-b", "pr");
  put(RATCHETS, ratchets(11)); g("commit", "-qam", "pr: a.js +1");
  g("checkout", "-q", "tip");
  // The tip raises eagerBytes by a FRAGMENT (+50) and a.js in the json: ratchets.json alone reads 1000, effective 1050.
  put(RATCHETS, ratchets(12)); put(FRAG, json({ tree: { eagerBytes: 50 } }));
  put(HISTORY, `# history\n- eagerBytes +50: ${FRAG}\n`); g("add", "-A"); g("commit", "-qm", "tip: fragment raise");
  g("checkout", "-q", "pr");
  assert.throws(() => g("merge", "--no-edit", "tip"), "ratchets.json conflicts");
  return { dir, g };
}

/** ratchets.mjs --update --absolute in miniature: effective ceilings snapped to `measured`, fragments folded away. */
const snapTo = (dir, measured) => async () => {
  const fragDir = path.join(dir, "tests/data/ratchets.d");
  const names = fs.existsSync(fragDir) ? fs.readdirSync(fragDir) : [];
  const eff = applyFragments(JSON.parse(fs.readFileSync(path.join(dir, RATCHETS), "utf8")),
    names.map((n) => ({ name: n, data: JSON.parse(fs.readFileSync(path.join(fragDir, n), "utf8")) })));
  eff.files[FILE].lines = measured.lines; eff.tree.eagerBytes.ceiling = measured.eagerBytes;
  fs.writeFileSync(path.join(dir, RATCHETS), json(eff));
  for (const n of names) fs.rmSync(path.join(fragDir, n));
  const h = path.join(dir, HISTORY);
  fs.writeFileSync(h, fs.readFileSync(h, "utf8").split(FRAG).join("ratchets.d/claude--tip-raise.json (folded)"));
};

const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });

test("effectiveRatchetsAt composes ratchets.json with the side's own fragments", () => {
  const { dir } = fixture();
  try {
    assert.equal(effectiveRatchetsAt("MERGE_HEAD", dir)["(tree)/eagerBytes"], 1050, "the tip: 1000 + its +50 fragment");
    assert.equal(effectiveRatchetsAt("HEAD", dir)["(tree)/eagerBytes"], 1000, "the PR carries no fragment");
    assert.equal(effectiveRatchetsAt("no-such-ref", dir), null);
  } finally { rm(dir); }
});

test("a union at the tip's EFFECTIVE ceiling cures, and the tip's fragment and history survive byte-for-byte", async () => {
  const { dir } = fixture();
  try {
    const fragBefore = fs.readFileSync(path.join(dir, FRAG), "utf8");
    const histBefore = fs.readFileSync(path.join(dir, HISTORY), "utf8");
    // Before #5870 this stopped: "union 1050 > 1000 + 0" (the json alone, the fragment ignored).
    const msg = await cureRatchets({ cwd: dir, snap: snapTo(dir, { lines: 13, eagerBytes: 1050 }) });
    assert.equal(msg, "ratchets re-measured on the union; 1 tests/data/ratchets.d fragment(s) kept");
    assert.equal(fs.readFileSync(path.join(dir, FRAG), "utf8"), fragBefore, "the tip's fragment is not folded or deleted");
    assert.equal(fs.readFileSync(path.join(dir, HISTORY), "utf8"), histBefore, "CEILING-HISTORY keeps the fragment's path");
    const out = JSON.parse(fs.readFileSync(path.join(dir, RATCHETS), "utf8"));
    assert.equal(out.tree.eagerBytes.ceiling, 1000, "ratchets.json keeps the tip's absolute; the fragment carries the +50");
    assert.equal(out.files[FILE].lines, 13, "a.js: the tip's 12 plus the PR's own +1");
    assert.equal(applyFragments(out, [{ name: "f", data: JSON.parse(fragBefore) }]).tree.eagerBytes.ceiling, 1050,
      "effective == the union's measurement");
  } finally { rm(dir); }
});

test("one byte past both sides' effective raises still stops", async () => {
  const { dir } = fixture();
  try {
    await assert.rejects(cureRatchets({ cwd: dir, snap: snapTo(dir, { lines: 13, eagerBytes: 1051 }) }),
      /effective ceilings[\s\S]*\(tree\)\/eagerBytes: union 1051 > 1050 \+ 0 = 1050/);
    await assert.rejects(cureRatchets({ cwd: dir, snap: snapTo(dir, { lines: 14, eagerBytes: 1050 }) }),
      /fixture\/a\.js\/lines: union 14 > 12 \+ 1 = 13/);
  } finally { rm(dir); }
});

test("unfoldFragments subtracts every fragment delta and keeps rows applyFragments drops", () => {
  const snapped = { files: { [FILE]: { lines: 20 }, "js/lighting/presets.js": { lines: 5 } }, tree: { eagerBytes: { ceiling: 1050 }, waits: 7 } };
  const out = unfoldFragments(snapped, [{ name: "x", data: { tree: { eagerBytes: 50, waits: 2 }, files: { [FILE]: { lines: 3 } } } }]);
  assert.deepEqual(out, { files: { [FILE]: { lines: 17 }, "js/lighting/presets.js": { lines: 5 } }, tree: { eagerBytes: { ceiling: 1000 }, waits: 5 } });
  assert.deepEqual(snapped.tree.eagerBytes, { ceiling: 1050 }, "pure: the input is untouched");
});
