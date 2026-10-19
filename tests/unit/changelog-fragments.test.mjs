/* changelog-fragments.test.mjs — CHANGELOG.md is written only by the fold; a PR adds a fragment.
 *
 * Every PR used to insert at the top of CHANGELOG.md, so each merge dirtied every other open PR. A PR now
 * adds docs/changelog.d/<slug>.md and the fold (tools/gen/gen-changelog.mjs --fold) writes CHANGELOG.md.
 *
 * Run: node --test tests/unit/changelog-fragments.test.mjs   (npm run test:tooling-fast)
 */
import "../helpers/git-fixture-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFragment, fold } from "../../tools/gen/gen-changelog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_BRANCH = "claude/f1-game-project-26h3ng";

const HIST = "# Changelog\n\nintro\n\n## 1695\n\n### Fixed\n- old fix.\n\n### New\n- old new.\n\n## 1690\n\n### Fixed\n- older.\n";

test("parseFragment accepts Category: entry lines and names every bad line", () => {
  const ok = parseFragment("f.md", "Fixed: a (#1).\n\nNew: b\n");
  assert.deepEqual(ok.entries, [{ category: "Fixed", text: "a (#1)." }, { category: "New", text: "b" }]);
  assert.equal(ok.problems.length, 0);
  const bad = parseFragment("f.md", "Fixed a\nBroken: x\n");
  assert.equal(bad.problems.length, 2);
  assert.equal(parseFragment("f.md", "\n").problems.length, 1);
});

test("fold: a new build lands above the newest section, categories in the fixed order", () => {
  const out = fold(HIST, 1696, [{ category: "Fixed", text: "x" }, { category: "New", text: "y" }]);
  assert.match(out, /intro\n\n## 1696\n\n### New\n- y\n\n### Fixed\n- x\n\n## 1695\n/);
  assert.ok(out.endsWith("- older.\n"));
});

test("fold: an existing build section is extended in place, never duplicated", () => {
  const out = fold(HIST, 1695, [{ category: "Fixed", text: "x" }, { category: "Improved", text: "z" }]);
  assert.equal(out.match(/^## 1695$/gm).length, 1);
  assert.match(out, /### Fixed\n- old fix\.\n- x\n\n### New\n- old new\.\n\n### Improved\n- z\n\n## 1690/, "existing categories keep their order; the new one is appended before the next build");
  assert.match(out, /- old fix\.\n- x\n/);
  assert.match(out, /### Improved\n- z\n\n## 1690/);
});

test("every committed fragment is well-formed", () => {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools/gen/gen-changelog.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

// A PR may not edit the build sections of CHANGELOG.md by hand: only a fold commit (which also deletes fragments)
// may. The intro above the first "## " is hand prose and stays editable.
test("this branch edits CHANGELOG.md sections only via a fold (a deleted fragment), never by hand", { skip: !baseRef() && !process.env.CI && "no local base ref (set up origin/" + BASE_BRANCH + "); CI must have one" }, () => {
  assert.ok(baseRef(), "CI has no base ref to compare CHANGELOG.md against — fetch the deploy branch (fetch-depth: 0)");
  // Against the MERGE-BASE, not the tip: a branch behind a tip that folded or gained entries has not edited them.
  const git = (...args) => cp.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const ref = git("merge-base", baseRef(), "HEAD").trim();
  const sections = (t) => t.slice(Math.max(0, t.search(/^## /m)));
  if (sections(git("show", `${ref}:CHANGELOG.md`)) === sections(git("show", "HEAD:CHANGELOG.md"))) return;
  const deleted = git("diff", "--name-status", `${ref}...HEAD`, "--", "docs/changelog.d")
    .split("\n").filter((l) => /^D\s+docs\/changelog\.d\/(?!README)/.test(l));
  assert.ok(deleted.length,
    "CHANGELOG.md is written by `node tools/gen/gen-changelog.mjs --fold`; a PR adds docs/changelog.d/<slug>.md instead (see docs/changelog.d/README.md)");
});

function baseRef() {
  for (const ref of [`origin/${BASE_BRANCH}`, BASE_BRANCH]) {
    try { cp.execFileSync("git", ["merge-base", ref, "HEAD"], { cwd: ROOT, stdio: "pipe" }); return ref; } catch { /* next */ }
  }
  return null;
}

// #2291 done-when: two PRs that each add an entry merge into the tip in either order with no conflict, and a
// fold commit on the tip conflicts with neither. Measured by `git merge-tree` on a scratch repo; the old way
// (each PR inserting under the same `## <build>` / `### Fixed`) is the control and DOES conflict.
test("fragments from two PRs and a fold on the tip merge clean; the old top-of-file insert conflicts", (t) => {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "changelog-hotspot-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => cp.execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const FRAGS = "docs/changelog.d";
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  const clean = (a, b) => cp.spawnSync("git", ["merge-tree", "--write-tree", "--no-messages", a, b], { cwd: dir }).status === 0;
  git("init", "-q", "-b", "ship");
  git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t"); git("config", "commit.gpgsign", "false");
  put("CHANGELOG.md", HIST);
  git("add", "-A"); git("commit", "-qm", "base");
  const branch = (name, edit) => { git("checkout", "-q", "-b", name, "ship"); edit(); git("add", "-A"); git("commit", "-qm", name); git("checkout", "-q", "ship"); };
  // Control: today's manual form, two PRs adding a line under the same ### Fixed.
  const insert = (line) => () => put("CHANGELOG.md", HIST.replace("### Fixed\n- old fix.\n", `### Fixed\n${line}\n- old fix.\n`));
  branch("old-a", insert("- a."));
  branch("old-b", insert("- b."));
  assert.equal(clean("old-a", "old-b"), false, "control: the shared insertion point conflicts (the measured #2222/#2237/#2245 shape)");
  branch("frag-a", () => put(`${FRAGS}/frag-a.md`, "Fixed: a.\n"));
  branch("frag-b", () => put(`${FRAGS}/frag-b.md`, "Fixed: b.\n"));
  branch("frag-c", () => put(`${FRAGS}/frag-c.md`, "New: c.\n"));
  assert.ok(clean("frag-a", "frag-b"), "two fragment PRs");
  git("merge", "-q", "--no-ff", "-m", "land a", "frag-a");
  // The release fold on the tip: CHANGELOG.md rewritten, the landed fragment deleted.
  put("CHANGELOG.md", fold(HIST, 1695, [{ category: "Fixed", text: "a." }]));
  fs.rmSync(path.join(dir, FRAGS, "frag-a.md"));
  git("add", "-A"); git("commit", "-qm", "fold");
  for (const b of ["frag-b", "frag-c"]) assert.ok(clean("ship", b), `${b} against a tip that landed a and folded`);
  git("merge", "-q", "--no-ff", "-m", "land b", "frag-b");
  assert.ok(clean("ship", "frag-c"), "frag-c after b landed too");
});
