// @doc Agent setup.test: canonical F1 environment and plugin support.
import test from "node:test";
import assert from "node:assert/strict";
import { inspectAgents } from "../scripts/agent-readiness.mjs";

test("unknown snapshots never become unavailable or verified", () => {
  const r = inspectAgents();
  assert.equal(r.routes.nativeTeam, "UNKNOWN");
  assert.equal(r.serviceChecks, "NOT_RUN");
});
test("native routes are detected without certifying services; no fleet-bus route remains (docs/WORKERS.md)", () => {
  const names = ["spawn_agent", "mcp__codex_apps__github_fetch"];
  assert.equal(inspectAgents(names).routes.nativeTeam, "INCOMPLETE", "unqualified unrelated names do not match");
  names.push(...["spawn_agent", "send_message", "followup_task", "list_agents", "interrupt_agent", "wait_agent"].map(n => "collaboration." + n));
  const r = inspectAgents(names);
  assert.equal(r.routes.nativeTeam, "AVAILABLE_NEEDS_LIVE_TEST");
  assert.deepEqual(Object.keys(r.routes), ["nativeTeam"]);
  assert.equal(r.external.codexCloud.exposure, "NOT_EXPOSED");
  assert.equal(r.serviceChecks, "NOT_RUN");
});
