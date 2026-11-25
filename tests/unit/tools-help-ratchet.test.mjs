/* tools-help-ratchet.test.mjs — every tools/ CLI answers --help before it works (#6556 U0).
 *
 * The 2026-11-25 tools review found ~60 CLIs whose --help wrote tracked files, launched Chromium, hit
 * the network or ran a full scan. Two halves:
 *  1. STATIC RATCHET over the roster (every git-tracked tools/ script that reads process.argv or has a
 *     shebang): it must carry a help path (exitIfHelp / strictFlags / argGate / a literal "--help"),
 *     or be named in tests/data/tools-help-offenders.d/<dir>.json. A listed file that gained a help path
 *     FAILS until its entry is deleted, so the list only shrinks. A marker is not proof the help path is
 *     safe; half 2 proves that for the tools whose --help used to write.
 *  2. NO SIDE EFFECTS for the six tracked-file writers: --help exits 0 with a usage line, a stray
 *     argument exits 2, and neither changes `git status` or the target's bytes.
 *
 * Run: node --test tests/unit/tools-help-ratchet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRAG_DIR = path.join(ROOT, "tests/data/tools-help-offenders.d");
const ENTRY = /^#!|process\.argv/m;
const HELP = /exitIfHelp|strictFlags|argGate|["'`]--help["'`]|["'`]-h["'`]/;

const tracked = execFileSync("git", ["ls-files", "tools"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter((f) => /\.(mjs|cjs|js)$/.test(f) && fs.existsSync(path.join(ROOT, f)));
const roster = tracked.filter((f) => ENTRY.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
const rosterSet = new Set(roster);
const dirOf = (f) => f.split("/")[1].replace(/\.(mjs|cjs|js)$/, "");

const frags = fs.readdirSync(FRAG_DIR).filter((f) => f.endsWith(".json")).sort();
const offenders = new Map();
for (const name of frags) {
  const { offenders: list } = JSON.parse(fs.readFileSync(path.join(FRAG_DIR, name), "utf8"));
  for (const f of list) offenders.set(f, name);
}

test("the roster is real: at least 300 tools/ CLIs found", () => {
  assert.ok(roster.length >= 300, `only ${roster.length} CLIs matched; the ENTRY pattern drifted`);
});

test("each offender fragment lists only tracked CLIs of its own tools/<dir>, sorted, no duplicates", () => {
  for (const name of frags) {
    const { offenders: list } = JSON.parse(fs.readFileSync(path.join(FRAG_DIR, name), "utf8"));
    assert.ok(Array.isArray(list) && list.length, `${name}: empty fragment; delete the file`);
    assert.deepEqual(list, [...new Set(list)].sort(), `${name}: keep the list sorted and unique`);
    for (const f of list) {
      assert.equal(`${dirOf(f)}.json`, name, `${f} belongs in ${dirOf(f)}.json, not ${name}`);
      assert.ok(rosterSet.has(f), `${name}: ${f} is not a tracked tools/ CLI any more; delete the entry`);
    }
  }
});

test("every tools/ CLI has a --help path or is a named offender (new CLIs must handle --help)", () => {
  const missing = roster.filter((f) => !offenders.has(f) && !HELP.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(missing, [], "add exitIfHelp(argv, USAGE) from tools/lib/cli-args.mjs before any work");
});

test("a fixed offender leaves the list (the ratchet only shrinks)", () => {
  const fixed = [...offenders.keys()].filter((f) => HELP.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(fixed, [], "these now handle --help: delete them from tests/data/tools-help-offenders.d");
});

// ---- half 2: the six tracked-file writers (#6556 U1) ----
// target: a file git status cannot see (gitignored) or the one the tool rewrites; bytes must not change.
const WRITERS = [
  ["tools/gen/bake-elevation.mjs", "js/track/circuit-elevations.js", ["not_a_circuit"]],
  ["tools/gen/bake-flyby.mjs", "js/camera/flyby-seq.js", ["--bogus"]],
  ["tools/gen/voice-corpus.mjs", null, ["--bogus"]], // its tracked corpus is held by the git-status check
  ["tools/gen/trees/install-trees.mjs", "assets/pack/manifest.json", ["stray"]],
  ["tools/ci/spec-timings.mjs", "tests/data/spec-timings.json", ["--bogus"]],
  ["tools/shot/gen-scenery-locations.cjs", "tools/shot/scenery-locations.json", ["--bogus"]],
];
const status = () => execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
const bytes = (rel) => (rel && fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel)) : null);
const run = (rel, args) => spawnSync(process.execPath, [rel, ...args], {
  cwd: ROOT, encoding: "utf8", timeout: 15000, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"],
});

for (const [rel, target, stray] of WRITERS) {
  const base = path.basename(rel);
  test(`${base}: --help and a stray argument write nothing`, () => {
    const before = status(), was = bytes(target);
    const help = run(rel, ["--help"]);
    assert.equal(help.error, undefined, `${base} --help did not return in 15 s`);
    assert.equal(help.status, 0, help.stderr || help.stdout);
    assert.deepEqual(help.stdout.split(" ", 3), ["usage:", "node", rel], "the first line is `usage: node <path> ...`");
    const bad = run(rel, stray);
    assert.equal(bad.error, undefined, `${base} ${stray.join(" ")} did not return in 15 s`);
    assert.equal(bad.status, 2, bad.stderr || bad.stdout);
    assert.equal(bad.stdout, "", `${base} printed a result for a refused argument`);
    assert.equal(status(), before, `${base} changed the working tree`);
    assert.deepEqual(bytes(target), was, `${base} rewrote ${target}`);
    assert.ok(!fs.existsSync(path.join(ROOT, "--help")), `${base} wrote a file named --help`);
  });
}
