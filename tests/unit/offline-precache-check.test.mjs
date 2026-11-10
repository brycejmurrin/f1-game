/* offline-precache-check.test.mjs — the browser offline check's contract,
 * without a browser (W24 row 5): it waits for SETTLED (COMPLETE lands before
 * the scenery pools), its header no longer claims sw.js skips clients.claim(),
 * it can serve a staged + stamped site (the bytes pages.yml ships), and a CI
 * group runs it.
 *
 * Run: node --test tests/unit/offline-precache-check.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stageSite, stampStaged } from "../../tools/desktop/stage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = path.join(ROOT, "tools/check/offline-precache-check.cjs");
const src = fs.readFileSync(CHECK, "utf8");
const run = (...args) => spawnSync(process.execPath, [CHECK, ...args], { cwd: ROOT, encoding: "utf8", timeout: 20000 });

test("the check waits for SETTLED, which sw.js writes after the scenery pools (COMPLETE lands before them)", () => {
  const waits = [...src.matchAll(/c\.match\("(__apex_install_\w+__)"\)/g)].map((m) => m[1]);
  assert.deepEqual(waits, ["__apex_install_settled__"]);
});

test("--help prints the flags; a bad --root or an unstamped dir exits 2 before any browser", () => {
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.equal(help.stdout.indexOf("--stage") >= 0, true);
  assert.equal(help.stdout.indexOf("--root=") >= 0, true);
  assert.equal(run("--stage", "--root=x").status, 0, "both flags at once prints usage");
  const missing = run("--root=artifacts/does-not-exist");
  assert.equal(missing.status, 2);
  assert.equal(missing.stderr.indexOf("not a staged site") >= 0, true);
  const unstamped = run("--root=.");
  assert.equal(unstamped.status, 2, "the working tree reads ?v=dev, so it is not a stamped site");
  assert.equal(unstamped.stderr.indexOf("not stamped") >= 0, true);
});

test("a stamp at committed+1 (no full history) yields a shell with no ?v=dev tag", (t) => {
  const base = path.join(ROOT, "artifacts", "tmp");
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, "offline-stage-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dest = path.join(dir, "site");
  stageSite(dest, { root: ROOT });
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).build;
  assert.equal(stampStaged(dest, { at: committed + 1, sha: "0".repeat(40) }), committed + 1);
  const html = fs.readFileSync(path.join(dest, "index.html"), "utf8");
  assert.doesNotMatch(html, /\?v=dev"/);
  assert.ok(fs.existsSync(path.join(dest, "sw.js")));
});

test("a CI browser group runs the check against a stamped stage", () => {
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8")).groups;
  const g = groups["test:offline-precache"];
  assert.ok(g && g.kind === "browser", "test:offline-precache is a browser group (nightly rotation, remote-group.mjs)");
  assert.deepEqual(g.files, ["tests/specs/offline-precache.spec.js"]);
  const spec = fs.readFileSync(path.join(ROOT, g.files[0]), "utf8");
  assert.ok(spec.includes('"tools/check/offline-precache-check.cjs", "--stage"'), "the spec runs the check on a stamped stage");
});
