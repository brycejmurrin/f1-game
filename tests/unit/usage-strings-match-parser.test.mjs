/* usage-strings-match-parser.test.mjs — #6758 (#6556 A5a/A5b/A12b): a usage string names every flag its parser takes.
 * Run: node --test tests/unit/usage-strings-match-parser.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const help = (rel) => spawnSync(process.execPath, [rel, "--help"], { cwd: ROOT, encoding: "utf8", timeout: 15000, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"] });

for (const [rel, flags] of [
  ["tools/perf/live-render-matrix.mjs", ["--leg", "--cap-scale", "--min-frames"]],
  ["tools/net/rtc-e2e-3p.mjs", ["--relay", "--turn="]],
  ["tools/gen/ensure-built.mjs", ["--quiet", "--list", "--all", "--with"]],
]) {
  test(`${rel} --help names ${flags.join(" ")}`, () => {
    const r = help(rel);
    assert.equal(r.status, 0, r.stderr);
    for (const f of flags) assert.ok(r.stdout.includes(f), `${rel} usage omits ${f}`);
  });
}

test("ensure-built --help does not advertise --check, and --check is still refused", () => {
  assert.ok(!help("tools/gen/ensure-built.mjs").stdout.includes("--check"));
  assert.equal(spawnSync(process.execPath, ["tools/gen/ensure-built.mjs", "--check"], { cwd: ROOT, encoding: "utf8" }).status, 2);
});
