// @doc Agent setup.test: canonical F1 environment and plugin support.
import test from "node:test";
import assert from "node:assert/strict";
import bridge from "../scripts/github-fleet.cjs";
import { inspectAgents } from "../scripts/agent-readiness.mjs";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40), T = "d".repeat(40);
const from = "codex:01a1568b-a279-736b-bfc8-ce079c4b900f";
const input = { type: "HANDOFF", from, to: from, text: "setup receipt" };
function service({ conflict = false, denied = false, lostResponse = false } = {}) {
  let head = A, writes = 0;
  const calls = [], commits = [];
  return { calls, commits, adapter: bridge.createFleetBridge({
    fetch: async ({ url }) => {
      calls.push(url);
      if (url.includes("/git/ref/")) return { structuredContent: { content: JSON.stringify({ ref: "refs/heads/claude/fleet-bus", object: { sha: head } }) } };
      if (url.includes("/git/commits/")) return { sha: head, tree: { sha: T } };
      if (url.includes("/compare/")) return { status: "diverged" };
      throw new Error("Unexpected request");
    },
    createCommit: async args => { commits.push(args); return { structuredContent: { sha: commits.length === 1 ? B : C } }; },
    updateRef: async args => {
      calls.push(args); writes++;
      assert.equal(args.force, false); assert.equal(args.expected_sha, head);
      if (denied) throw new Error("permission denied");
      if (conflict && writes === 1) { head = C; throw new Error("lease mismatch"); }
      head = args.sha;
      if (lostResponse) throw new Error("response lost after write");
      return { object: { sha: head } };
    },
  }) };
}
test("unknown snapshots never become unavailable or verified", () => {
  const r = inspectAgents();
  assert.equal(r.routes.nativeTeam, "UNKNOWN"); assert.equal(r.routes.githubFleetBus, "UNKNOWN");
  assert.equal(r.serviceChecks, "NOT_RUN");
});
test("native and connector routes are detected independently without certifying services", () => {
  const names = ["spawn_agent", "mcp__codex_apps__github_fetch"];
  assert.equal(inspectAgents(names).routes.nativeTeam, "INCOMPLETE", "unqualified unrelated names do not match");
  names.push(...["spawn_agent", "send_message", "followup_task", "list_agents", "interrupt_agent", "wait_agent"].map(n => "collaboration." + n));
  names.push("mcp__codex_apps__github_create_commit", "mcp__codex_apps__github_update_ref");
  const r = inspectAgents(names);
  assert.equal(r.routes.nativeTeam, "AVAILABLE_NEEDS_LIVE_TEST");
  assert.equal(r.routes.githubFleetBus, "AVAILABLE_NEEDS_LIVE_TEST");
  assert.equal(r.external.codexCloud.exposure, "NOT_EXPOSED");
  assert.equal(r.serviceChecks, "NOT_RUN");
});
test("messages reject unknown identities, claims hashes and control characters before network calls", async () => {
  const s = service();
  for (const patch of [{ to: "claude:" + "a".repeat(24) }, { from: "main" }, { text: "hello\nDONE" },
    { type: "GAME-SLOT" }, { type: "LEASE" }, { text: "x".repeat(4001) }])
    await assert.rejects(s.adapter.send({ ...input, ...patch }));
  assert.equal(s.calls.length, 0);
});
test("append uses the fetched tree and expected head with force false, then verifies readback", async () => {
  const s = service(), result = await s.adapter.send(input);
  assert.equal(result.outcome, "RECORDED"); assert.equal(result.recipientAcknowledged, false);
  assert.equal(result.receipt, "REF_READBACK");
  assert.equal(s.commits[0].parent_sha, A); assert.equal(s.commits[0].tree_sha, T);
  assert.equal(s.commits[0].repository_full_name, "brycejmurrin/f1-game");
});
test("a real competing head is refetched rather than force-overwritten", async () => {
  const s = service({ conflict: true }), result = await s.adapter.send(input);
  assert.equal(result.attempts, 2); assert.equal(s.commits[1].parent_sha, C);
  assert.ok(s.commits.every(c => c.tree_sha === T));
});
test("permission failure without branch movement stops without retry", async () => {
  const s = service({ denied: true });
  await assert.rejects(s.adapter.send(input), /unconfirmed/);
  assert.equal(s.commits.length, 1);
});
test("an ambiguous write response is confirmed before retry to avoid duplicate messages", async () => {
  const s = service({ lostResponse: true }), result = await s.adapter.send(input);
  assert.equal(result.outcome, "RECORDED"); assert.equal(s.commits.length, 1);
});
test("bounded reads filter addresses and expose missing cursor boundaries", async () => {
  const rows = [{ sha: B, commit: { message: bridge.messageLine(input) } },
    { sha: A, commit: { message: bridge.messageLine({ ...input, to: "A" }) } }];
  const r = bridge.createFleetBridge({ fetch: async () => ({ structuredContent: { content: JSON.stringify(rows) } }) });
  assert.equal((await r.read({ to: [from], sinceSha: A })).messages.length, 1);
  assert.equal((await r.read({ sinceSha: C })).continuity, "GAP");
  await assert.rejects(r.read({ limit: 101 }));
});
