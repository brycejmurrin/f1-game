/* changelog-fragments.test.mjs — CHANGELOG.md is written only by the fold; a PR adds a fragment.
 *
 * Every PR used to insert at the top of CHANGELOG.md, so each merge dirtied every other open PR. A PR now
 * adds docs/changelog.d/<slug>.md and the fold (tools/gen/gen-changelog.mjs --fold) writes CHANGELOG.md.
 *
 * Run: node --test tests/unit/changelog-fragments.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
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
  assert.match(out, /### Fixed\n- old fix\.\n- x\n\n### New\n- old new\.\n\n## 1690|### Improved\n- z/);
  assert.match(out, /- old fix\.\n- x\n/);
  assert.match(out, /### Improved\n- z\n\n## 1690/);
});

test("every committed fragment is well-formed", () => {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools/gen/gen-changelog.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

// A PR may not edit the build sections of CHANGELOG.md by hand: only a fold commit (which also deletes fragments)
// may. The intro above the first "## " is hand prose and stays editable.
test("this branch edits CHANGELOG.md sections only via a fold (a deleted fragment), never by hand", { skip: !baseRef() }, () => {
  const ref = baseRef();
  const git = (...args) => cp.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
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
