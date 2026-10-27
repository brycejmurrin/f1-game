/* archive-sessions.test.mjs — the archive rule (AGENTS.md §Concurrent PRs, 2026-10-19) over a saved
 * list_sessions page: only an agent-created, idle, role-tagged session whose PR is merged or closed
 * is ARCHIVE; a session Bryce opened, an orchestrator, a watcher or a running one is KEEP.
 *
 * Run: node --test tests/unit/archive-sessions.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, extractSessions, roleOf, agentCreated, main, ARCHIVABLE_ROLES, prsOf } from "../../tools/ci/archive-sessions.mjs";

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

test("prsOf, roleOf and agentCreated read the tags, with every PR from the tags and the title", () => {
  assert.deepEqual(prsOf(sess()), [3020]);
  assert.deepEqual(prsOf(sess({ tags: ["role:worker"], title: "[W16] Frame-loop tracks (#2965) (Sonnet)" })), [2965]);
  assert.deepEqual(prsOf(sess({ tags: ["role:worker"], title: "no number" })), []);
  assert.deepEqual(prsOf(sess({ tags: ["pr:3689", "pr:3691", "pr:3723"], title: "fix #3691, then #3750" })), [3689, 3691, 3723, 3750]);
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
  for (const role of ["orchestrator", "watch", "fleet-watch", "merge-desk"])
    assert.match(decide(sess({ tags: [`role:${role}`, "pr:3020", "config:session-created"] }), { now: NOW, prState: merged }).why, /never archived/);
  assert.match(decide(sess({ session_status: "SESSION_STATUS_RUNNING" }), { now: NOW, prState: merged }).why, /still running/);
  assert.match(decide(sess({ updated_at: ago(10) }), { now: NOW, prState: merged }).why, /touched 10 min ago/);
  assert.equal(decide(sess({ updated_at: ago(10) }), { now: NOW, idleMin: 5, prState: merged }).verdict, "ARCHIVE");
  assert.match(decide(sess({ tags: ["role:worker", "config:session-created"], title: "no pr here" }), { now: NOW, prState: merged }).why, /no PR/);
  assert.match(decide(sess({ session_status: "SESSION_STATUS_ARCHIVED" }), { now: NOW, prState: merged }).why, /already archived/);
  for (const role of ["worker", "pr-owner", "sync", "review", "hunter"]) assert.ok(ARCHIVABLE_ROLES.includes(role), role);
});

test("a multi-PR session is ARCHIVE only when every PR it names is merged or closed", () => {
  // 2026-10-26: pr:3689 pr:3691 pr:3723 read only the first tag, so a merged #3689 archived a session with #3723 open.
  const multi = sess({ tags: ["role:worker", "pr:3689", "pr:3691", "pr:3723", "config:session-created"], title: "fleet fixes (#3760)" });
  const states = { 3689: "merged", 3691: "closed", 3723: "open", 3760: "merged" };
  const kept = decide(multi, { now: NOW, prState: (n) => states[n] });
  assert.equal(kept.verdict, "KEEP"); assert.equal(kept.why, "#3723 still open");
  const done = decide(multi, { now: NOW, prState: (n) => (n === 3691 ? "closed" : "merged") });
  assert.equal(done.verdict, "ARCHIVE"); assert.ok(done.why.endsWith("#3689 merged, #3691 closed, #3723 merged, #3760 merged"), done.why);
  const offline = decide(multi, { now: NOW, prState: (n) => (n === 3689 ? "merged" : "unknown") });
  assert.equal(offline.verdict, "KEEP"); assert.ok(offline.why.startsWith("#3691, #3723, #3760 state unknown (pr-unknown)"), offline.why);
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
  assert.match(logs.at(-1), /= archive-sessions 2 archive, 1 keep/);
  const off = [];
  main(["page.txt", "--offline", "--json"], { read: () => page, prState: () => { throw new Error("called"); }, log: (l) => off.push(l), now: () => NOW });
  assert.equal(JSON.parse(off[0]).filter((r) => /pr-unknown/.test(r.why)).length, 2);
});

test("Q5: a no-archive tag or an in-flight post_turn_summary keeps an otherwise archivable session", () => {
  const merged = () => "merged";
  assert.equal(decide(sess(), { now: NOW, prState: merged }).verdict, "ARCHIVE");
  const pinned = decide(sess({ tags: [...sess().tags, "no-archive"] }), { now: NOW, prState: merged });
  assert.equal(pinned.verdict, "KEEP"); assert.ok(/no-archive/.test(pinned.why));
  for (const text of ["CI watch, tooling-fast, macOS census still running on #3766", "#3693 gate running … then #3696"]) {
    const r = decide(sess({ post_turn_summary: text }), { now: NOW, prState: merged });
    assert.equal(r.verdict, "KEEP", text); assert.ok(/in flight/.test(r.why));
  }
  assert.equal(decide(sess({ post_turn_summary: { text: "census running" } }), { now: NOW, prState: merged }).verdict, "KEEP");
  assert.equal(decide(sess({ post_turn_summary: "Merged and handed off." }), { now: NOW, prState: merged }).verdict, "ARCHIVE");
});


