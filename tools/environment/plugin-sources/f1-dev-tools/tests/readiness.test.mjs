// @doc Readiness.test: canonical F1 environment and plugin support.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collect, toolNames } from "../scripts/readiness.mjs";

const sha = "a".repeat(40);
function runner({ fail, status = {}, doctor = {}, catalog = {} } = {}) {
  return (command, args) => {
    if (command === "git") return args[0] === "rev-parse" ? sha : "";
    const name = args[2];
    if (name === fail) throw new Error("private command output must not escape");
    return JSON.stringify(name === "apex_status"
      ? { ok: true, lock: { held: false }, next: { action: "ready" }, ...status }
      : name === "apex_catalog" ? { ok: true, tracks: ["monaco"], cams: ["park"], ...catalog }
        : { ok: true, out: { ok: true, summary: { pass: 1, warn: 0, fail: 0 }, checks: [], ...doctor } });
  };
}
const inspect = (options = {}) => collect({ checkout: "/fixture", run: runner(), present: () => true, ...options });

test("no host snapshot remains unknown despite local success", () => {
  const r = inspect();
  assert.equal(r.localChecks, "PASS"); assert.equal(r.overall, "PARTIAL");
  assert.equal(r.host.servers["apex-tools"].exposure, "UNKNOWN");
  assert.equal(r.host.serviceChecks, "SKIP"); assert.equal(r.renderedBehavior, "SKIP");
});
test("empty host snapshot differs from unknown", () => {
  const r = inspect({ names: [] });
  assert.equal(r.host.servers["apex-tools"].exposure, "NOT_EXPOSED");
});
test("actual names establish exposure without certifying services", () => {
  const r = inspect({ names: toolNames({ tools: [{ name: "mcp__apex_tools__apex_profile" }, "lsp_definition", "mcp.js.debugger_status"] }) });
  assert.ok(Object.values(r.host.servers).every((s) => s.exposure === "EXPOSED"));
  assert.equal(r.overall, "PARTIAL"); assert.equal(r.host.serviceChecks, "SKIP");
});
test("manifest-shaped data and malformed name rows are rejected", () => {
  assert.throws(() => toolNames({ mcpServers: { "apex-tools": {} } }));
  assert.throws(() => toolNames([{}])); assert.throws(() => toolNames(["token=secret"]));
  assert.deepEqual(toolNames(["apex_status", "apex_status"]), ["apex_status"]);
});
test("failed probe preserves failure and still collects independent diagnostics", () => {
  const r = inspect({ run: runner({ fail: "apex_status" }) });
  assert.equal(r.overall, "FAIL"); assert.equal(r.cli.apex_catalog.outcome, "PASS");
  assert.equal(r.cli.apex_doctor.outcome, "PASS");
  assert.ok(!JSON.stringify(r).includes("private command output"));
});
test("nested doctor failure cannot become success through the transport", () => {
  const r = inspect({ run: runner({ doctor: { ok: false, summary: { fail: 1 } } }) });
  assert.equal(r.cli.apex_doctor.outcome, "FAIL"); assert.equal(r.localChecks, "FAIL");
});
test("hollow and unreadable results are failures", () => {
  assert.equal(inspect({ run: () => "not JSON" }).overall, "FAIL");
  assert.equal(inspect({ run: runner({ status: { next: undefined } }) }).cli.apex_status.outcome, "FAIL");
  assert.equal(inspect({ run: runner({ catalog: { tracks: null } }) }).cli.apex_catalog.outcome, "FAIL");
});
test("Git evidence failure cannot be omitted from readiness", () => {
  const r = inspect({ run: (cmd, args, cwd) => cmd === "git" ? "bad SHA" : runner()(cmd, args, cwd) });
  assert.equal(r.git.outcome, "FAIL"); assert.equal(r.overall, "FAIL");
});
test("passing prerequisites and an unheld lock still respect load wait advice", () => {
  const r = inspect({ run: runner({ status: { next: { action: "wait", reason: "busy loadavg" }, loadavg: [4.87] } }) });
  assert.equal(r.localChecks, "PASS"); assert.equal(r.cli.apex_status.summary.advice.action, "wait");
  assert.ok(r.next.some((s) => s.includes("before a browser launch")));
});
test("doctor warnings and missing optional wrappers remain visible", () => {
  const r = inspect({ present: () => false, run: runner({ doctor: {
    ok: true, summary: { pass: 1, warn: 1, fail: 0 }, checks: [{ id: "runtime.tmux", status: "warn", message: "tmux missing" }],
  } }) });
  assert.equal(r.localChecks, "PASS"); assert.equal(r.cli.apex_doctor.summary.warnings[0].id, "runtime.tmux");
  assert.ok(r.next.some((s) => s.includes("wrapper is missing")));
});
test("help is launch-free; missing explicit checkout fails with structured evidence", () => {
  const entry = fileURLToPath(new URL("../scripts/readiness.mjs", import.meta.url));
  const help = execFileSync(process.execPath, [entry, "--help"], { encoding: "utf8" });
  assert.match(help, /No installs/);
  const missing = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  assert.equal(missing.status, 1); assert.equal(JSON.parse(missing.stdout).overall, "FAIL");
  assert.match(JSON.parse(missing.stdout).reason, /--checkout is required/);
});
