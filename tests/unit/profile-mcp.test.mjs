/* profile-mcp.test.mjs — apex_profile / apex_profile_query pin their argv (dryRun, no browser).
 * Run: node --test tests/unit/profile-mcp.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");
function call(name, args) {
  const r = spawnSync(process.execPath, [MCP, "call", name, JSON.stringify(args)], { encoding: "utf8", cwd: ROOT, env: { ...process.env, APEX_MCP_MOCK: "1" }, timeout: 20000 });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const argvOf = (r) => JSON.parse(r.out).argv;

test("apex_profile dryRun: profile.mjs argv with mode, repeat and base", () => {
  const argv = argvOf(call("apex_profile", { dryRun: true, track: "monza", repeat: 3, frames: 90, base: "origin/main" }));
  assert.ok(argv.some((a) => a.endsWith("perf/profile.mjs")));
  assert.deepEqual(argv.slice(argv.indexOf("monza")), ["monza", "--mode", "spans", "--frames", "90", "--repeat", "3", "--base", "origin/main"]);
});

test("apex_profile refuses a base that looks like a flag", () => {
  const r = call("apex_profile", { dryRun: true, base: "--upload-pack=x" });
  assert.match(r.out + r.err, /base must be a git ref|bad_args|not match/);
});

test("apex_profile_query dryRun: query.mjs, artifacts-only path", () => {
  const argv = argvOf(call("apex_profile_query", { dryRun: true, file: "artifacts/profiles/vegas-spans.json", top: 5 }));
  assert.ok(argv.some((a) => a.endsWith("perf/query.mjs")));
  assert.ok(argv.includes("--top"));
  const bad = call("apex_profile_query", { dryRun: true, file: "package.json" });
  assert.doesNotMatch(bad.out, /"ok":\s*true/);
});
