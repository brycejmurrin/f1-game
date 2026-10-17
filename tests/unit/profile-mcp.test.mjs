/* profile-mcp.test.mjs — the profiler's MCP surface pins its argv (dryRun, no browser): the run is
 * apex_job_start kind "profile" (the guarded door); apex_profile_query reads saved artifacts only.
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

test("there is no standalone apex_profile browser tool (needs a .claude guard entry); the job kind is listed", () => {
  const names = JSON.parse(spawnSync(process.execPath, [MCP, "list-tools"], { encoding: "utf8", cwd: ROOT }).stdout).map((t) => t.name);
  assert.ok(!names.includes("apex_profile")); assert.ok(names.includes("apex_profile_query"));
  const js = JSON.parse(spawnSync(process.execPath, [MCP, "list-tools"], { encoding: "utf8", cwd: ROOT }).stdout).find((t) => t.name === "apex_job_start");
  assert.ok(js.inputSchema.properties.kind.enum.includes("profile"));
});

test("apex_job_start kind profile dryRun: profile.mjs argv with mode, repeat and base", () => {
  const argv = argvOf(call("apex_job_start", { kind: "profile", dryRun: true, track: "monza", repeat: 3, frames: 90, base: "origin/main" }));
  assert.ok(argv.some((a) => a.endsWith("perf/profile.mjs")));
  assert.deepEqual(argv.slice(argv.indexOf("monza")), ["monza", "--mode", "spans", "--frames", "90", "--repeat", "3", "--base", "origin/main"]);
});

test("profile job refuses a base that looks like a flag and an unknown mode", () => {
  assert.match(call("apex_job_start", { kind: "profile", dryRun: true, base: "--upload-pack=x" }).out, /base may not start|base must be a git ref/);
  assert.match(call("apex_job_start", { kind: "profile", dryRun: true, mode: "bogus" }).out + "", /mode|enum|bad_args/);
});

test("apex_profile_query dryRun: query.mjs, artifacts-only path", () => {
  const argv = argvOf(call("apex_profile_query", { dryRun: true, file: "artifacts/profiles/vegas-spans.json", top: 5 }));
  assert.ok(argv.some((a) => a.endsWith("perf/query.mjs"))); assert.ok(argv.includes("--top"));
  assert.doesNotMatch(call("apex_profile_query", { dryRun: true, file: "package.json" }).out, /"ok":\s*true/);
});
