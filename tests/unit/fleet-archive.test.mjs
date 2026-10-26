/* fleet-archive.test.mjs — the archive rule (AGENTS.md §Concurrent PRs, 2026-10-19) over a saved
 * list_sessions page: only an agent-created, idle, role-tagged session whose PR is merged or closed
 * is ARCHIVE; a session Bryce opened, a live orchestrator, a watcher or a running one is KEEP. A retired
 * orchestrator (successor LIVE on the bus, no enabled trigger) is ARCHIVE, and --hand refuses a branch
 * that is not on origin (FLEET-B-TRANSCRIPT-AUDIT-2026-10-26 rows 4 and 8).
 *
 * Run: node --test tests/unit/fleet-archive.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, extractSessions, extractTriggers, prOf, roleOf, fleetOf, agentCreated, main, liveOrchViaBus, branchOnOrigin, ARCHIVABLE_ROLES }
  from "../../tools/ci/fleet-archive.mjs";

const NOW = Date.parse("2026-10-19T20:00:00Z");
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const sess = (over = {}) => ({
  id: "session_01X", title: "[Owner] A·#3020 · game · Sonnet — drive #3020 to merged", session_status: "SESSION_STATUS_IDLE",
  updated_at: ago(90), origin: "claude_code_mcp_seed", tags: ["f1-game-fleet", "role:owner", "pr:3020", "config:session-created"], ...over,
});

test("extractSessions reads the MCP envelope text and raw JSON alike", () => {
  const page = `<other-session nonce="x">\n    {"ccr":{"data":[{"id":"session_01A","tags":[]}],"has_more":false}}\n</other-session>`;
  assert.deepEqual(extractSessions(page).map((s) => s.id), ["session_01A"]);
  assert.deepEqual(extractSessions('{"data":[{"id":"session_01B"}]}').map((s) => s.id), ["session_01B"]);
  assert.throws(() => extractSessions("nothing here"), /no JSON/);
});

test("prOf, roleOf and agentCreated read the tags, with the title as the PR fallback", () => {
  assert.equal(prOf(sess()), 3020);
  assert.equal(prOf(sess({ tags: ["role:worker"], title: "[W16] Frame-loop tracks (#2965) (Sonnet)" })), 2965);
  assert.equal(prOf(sess({ tags: ["role:worker"], title: "no number" })), null);
  assert.equal(roleOf(sess()), "owner");
  assert.equal(roleOf({ tags: ["f1-game-fleet"] }), null);
  assert.equal(agentCreated(sess()), true);
  assert.equal(agentCreated({ tags: ["role:owner"], origin: "ios" }), false);
});

test("the rule: ARCHIVE only when role, agent-created, idle and PR done all hold", () => {
  const merged = () => "merged";
  const r = decide(sess(), { now: NOW, prState: merged });
  assert.equal(r.verdict, "ARCHIVE"); assert.match(r.why, /#3020 merged/);
  assert.equal(decide(sess(), { now: NOW, prState: () => "closed" }).verdict, "ARCHIVE");
  assert.match(decide(sess(), { now: NOW, prState: () => "open" }).why, /still open/);
  assert.match(decide(sess(), { now: NOW, prState: () => "unknown" }).why, /pr-unknown/);
  assert.match(decide(sess({ tags: ["f1-game-fleet"], origin: "ios" }), { now: NOW, prState: merged }).why, /Bryce opened/);
  assert.match(decide(sess({ origin: "ios", tags: ["role:owner", "pr:3020"] }), { now: NOW, prState: merged }).why, /not agent-created/);
  for (const role of ["watch", "fleet-watch", "merge-desk"])
    assert.match(decide(sess({ tags: [`role:${role}`, "pr:3020", "config:session-created"] }), { now: NOW, prState: merged }).why, /never archived/);
  assert.match(decide(sess({ session_status: "SESSION_STATUS_RUNNING" }), { now: NOW, prState: merged }).why, /still running/);
  assert.match(decide(sess({ updated_at: ago(10) }), { now: NOW, prState: merged }).why, /touched 10 min ago/);
  assert.equal(decide(sess({ updated_at: ago(10) }), { now: NOW, idleMin: 5, prState: merged }).verdict, "ARCHIVE");
  assert.match(decide(sess({ tags: ["role:worker", "config:session-created"], title: "no pr here" }), { now: NOW, prState: merged }).why, /no PR/);
  assert.match(decide(sess({ session_status: "SESSION_STATUS_ARCHIVED" }), { now: NOW, prState: merged }).why, /already archived/);
  for (const role of ["worker", "pr-owner", "sync", "review", "hunter"]) assert.ok(ARCHIVABLE_ROLES.includes(role), role);
});

test("main prints one row per session, caches PR lookups, and --offline never calls out", () => {
  const page = JSON.stringify({ ccr: { data: [sess(), sess({ id: "session_02Y", tags: ["role:worker", "pr:3020", "config:session-created"] }),
    sess({ id: "session_03Z", tags: [], origin: "ios", title: "Fleet agents roles analysis" })] } });
  const calls = [];
  const logs = [];
  const rc = main(["page.txt"], { read: () => page, prState: (n) => { calls.push(n); return "merged"; }, log: (l) => logs.push(l), now: () => NOW });
  assert.equal(rc, 0);
  assert.deepEqual(calls, [3020], "one lookup per PR, cached");
  assert.match(logs.join("\n"), /ARCHIVE session_01X/);
  assert.match(logs.join("\n"), /KEEP {4}session_03Z .*Bryce opened/);
  assert.match(logs.at(-1), /= fleet-archive 2 archive, 1 keep/);
  const off = [];
  main(["page.txt", "--offline", "--json"], { read: () => page, prState: () => { throw new Error("called"); }, log: (l) => off.push(l), now: () => NOW });
  assert.equal(JSON.parse(off[0]).filter((r) => /pr-unknown/.test(r.why)).length, 2);
});

const orch = (over = {}) => sess({ id: "session_01OLD", title: "[Orch] B·O-queue4", tags: ["fleet:b", "role:orchestrator", "config:session-created"], ...over });
const liveIs = (id) => (letter) => (letter === "B" ? id : null);

test("a retired orchestrator is ARCHIVE; a live one, or one whose triggers were not read, is KEEP", () => {
  const opts = { now: NOW, liveOrch: liveIs("claude:session_01NEW"), triggers: [] };
  const trig = [{ id: "trig_1", enabled: true, persistent_session_id: "session_01OLD" }, { id: "trig_2", enabled: false, persistent_session_id: "session_01OLD" }];
  // [case, session, options, verdict, the reason's opening words]
  const cases = [
    ["retired", orch(), opts, "ARCHIVE", "retired orchestrator: ORCH B LIVE is session_01NEW"],
    ["disabled trigger only", orch(), { ...opts, triggers: trig.slice(1) }, "ARCHIVE", "retired orchestrator: ORCH B LIVE"],
    ["live", orch(), { ...opts, liveOrch: liveIs("claude:session_01OLD") }, "KEEP", "live orchestrator of fleet B"],
    ["no LIVE line", orch(), { ...opts, liveOrch: () => null }, "KEEP", "orchestrator: no ORCH B LIVE"],
    ["triggers unread", orch(), { ...opts, triggers: null }, "KEEP", "retired orchestrator, triggers not read"],
    ["enabled trigger", orch(), { ...opts, triggers: trig }, "KEEP", "retired orchestrator with 1 enabled trigger(s): trig_1"],
    ["no fleet tag", orch({ tags: ["role:orchestrator", "config:session-created"] }), opts, "KEEP", "orchestrator with no fleet: tag"],
    ["recent", orch({ updated_at: ago(5) }), opts, "KEEP", "touched 5 min ago"],
    ["running", orch({ session_status: "SESSION_STATUS_RUNNING" }), opts, "KEEP", "still running"],
    ["Bryce's", orch({ origin: "ios", tags: ["fleet:b", "role:orchestrator"] }), opts, "KEEP", "role orchestrator but not agent-created"],
  ];
  for (const [name, s, o, verdict, why] of cases) {
    const r = decide(s, o);
    assert.deepEqual([r.verdict, r.why.startsWith(why)], [verdict, true], `${name}: ${r.verdict} ${r.why}`);
  }
  assert.equal(fleetOf(orch()), "B");
});

test("liveOrchViaBus reads the bus once and names the newest LIVE line per letter", () => {
  let reads = 0;
  const entries = [{ text: "ORCH B LIVE claude:session_01OLD", sha: "a", at: 1 }, { text: "ORCH B LIVE claude:session_01NEW", sha: "b", at: 2 }];
  const live = liveOrchViaBus(() => { reads++; return { entries }; });
  assert.equal(live("B"), "claude:session_01NEW");
  assert.equal(live("A"), null);
  assert.equal(reads, 1);
  assert.equal(liveOrchViaBus(() => { throw new Error("offline"); })("B"), null);
});

test("extractTriggers reads a list_triggers page; main --triggers archives the retired orchestrator", () => {
  assert.deepEqual(extractTriggers('x {"triggers":[{"id":"trig_9"}]}').map((t) => t.id), ["trig_9"]);
  assert.throws(() => extractTriggers("{}"), /no triggers/);
  const pages = { "s.txt": JSON.stringify({ data: [orch()] }), "t.txt": JSON.stringify({ triggers: [] }) };
  const logs = [];
  const rc = main(["s.txt", "--triggers", "t.txt"], { read: (f) => pages[f], prState: () => "open", log: (l) => logs.push(l), now: () => NOW,
    liveOrch: liveIs("claude:session_01NEW") });
  assert.equal(rc, 0);
  assert.match(logs.join("\n"), /ARCHIVE session_01OLD .*retired orchestrator/);
  const off = [];
  main(["s.txt", "--offline", "--triggers", "t.txt"], { read: (f) => pages[f], log: (l) => off.push(l), now: () => NOW, liveOrch: () => { throw new Error("called"); } });
  assert.match(off.join("\n"), /KEEP .*no ORCH B LIVE/);
});

test("--hand refuses a branch that is not on origin", () => {
  const run = (branch, state) => { const logs = []; return { rc: main(["--hand", branch], { branchState: () => state, log: (l) => logs.push(l) }), out: logs.join("\n") }; };
  assert.deepEqual([run("cursor/x-1a2b", "pushed").rc, run("cursor/x-1a2b", "missing").rc, run("cursor/x-1a2b", "unknown").rc], [0, 1, 1]);
  assert.match(run("cursor/x-1a2b", "missing").out, /REFUSE .*only in the container/);
  assert.equal(main(["--hand"], { log: () => {} }), 1);
  const fake = (status, stdout) => () => ({ status, stdout });
  assert.equal(branchOnOrigin("b", fake(0, "abc\trefs/heads/b\n")), "pushed");
  assert.equal(branchOnOrigin("b", fake(0, "")), "missing");
  assert.equal(branchOnOrigin("b", fake(128, "")), "unknown");
});
