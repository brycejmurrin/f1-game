/* tmpdir-ratchet.test.mjs — unit tests make temp dirs with mkTmpDir(), not under the OS temp dir (#6552 item 1).
 *
 * tests/helpers/tmp-dir.mjs mkTmpDir() puts a dir under artifacts/tmp and removes it at process exit
 * (AGENTS.md: regenerable output goes in artifacts/ or scratch/, never /tmp). A tests/unit file that
 * calls mkdtempSync and reads the OS temp dir fails here unless it is:
 *   - ALLOWED: it needs a dir outside the repo (dropped-group-runs copies a tool out to prove it has no
 *     repo imports; git-fixture-env builds fixture repos that must not nest inside a repo; f1-dev-tools
 *     points a symlink at a dir outside artifacts/ and scratch/ to prove the escape is refused;
 *     mcp-debugger-tools-boot starts the MCP wrappers from a cwd outside the repo to prove they cd to it;
 *     tooling-fast-runner feeds the runner a test path outside the repo to prove it is annotated as unsafe), or
 *   - an OFFENDER row in tests/data/tmpdir-offenders.json: a file not migrated yet. The list only
 *     shrinks: a migrated file must drop its row, and no new row may be added.
 *
 * Run: node --test tests/unit/tmpdir-ratchet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UNIT = path.join(ROOT, "tests", "unit");
const SELF = path.basename(fileURLToPath(import.meta.url));
const ALLOWED = new Set(["dropped-group-runs.test.mjs", "f1-dev-tools.test.mjs", "git-fixture-env.test.mjs",
  "mcp-debugger-tools-boot.test.mjs", "tooling-fast-runner.test.mjs"]);
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "data", "tmpdir-offenders.json"), "utf8"));
const OFFENDERS = DATA.offenders;

// Built from pieces so this file does not match itself.
const MKDTEMP = new RegExp("\\bmkdtempSync" + "\\(");
const TMPDIR = new RegExp("\\btmpdir" + "\\(\\)");
const offends = (src) => MKDTEMP.test(src) && TMPDIR.test(src);

function scan() {
  return fs.readdirSync(UNIT)
    .filter((f) => /\.(mjs|cjs|js)$/.test(f) && f !== SELF)
    .filter((f) => offends(fs.readFileSync(path.join(UNIT, f), "utf8")))
    .sort();
}

test("the pattern needs both mkdtempSync( and tmpdir()", () => {
  assert.equal(offends('fs.mkdtempSync(path.join(os.tmp' + 'dir(), "x-"))'), true);
  assert.equal(offends('mkdtempSync(join(tmp' + 'dir(), "x-"))'), true);
  assert.equal(offends('mkTmpDir("x-")'), false);
  assert.equal(offends('fs.mkdtemp' + 'Sync(path.join(ROOT, "scratch", "x-"))'), false);
  assert.equal(offends('const t = os.tmp' + 'dir();'), false);
});

test("no new tests/unit file makes a temp dir under the OS temp dir (use mkTmpDir)", () => {
  const listed = new Set([...ALLOWED, ...OFFENDERS]);
  const fresh = scan().filter((f) => !listed.has(f));
  assert.deepEqual(fresh, [], `use mkTmpDir() from tests/helpers/tmp-dir.mjs in: ${fresh.join(", ")}`);
});

test("the offender list only shrinks: every row still offends, sorted, unique, not allowlisted", () => {
  const live = new Set(scan());
  const fixed = OFFENDERS.filter((f) => !live.has(f));
  assert.deepEqual(fixed, [], `migrated — delete these rows from tests/data/tmpdir-offenders.json: ${fixed.join(", ")}`);
  assert.deepEqual(OFFENDERS, [...new Set(OFFENDERS)].sort(), "offenders: sorted and unique");
  assert.deepEqual(OFFENDERS.filter((f) => ALLOWED.has(f)), [], "an allowlisted file is not an offender");
  assert.ok(OFFENDERS.length <= DATA.ceiling, `offenders ${OFFENDERS.length} > ceiling ${DATA.ceiling}: the list never grows`);
});
