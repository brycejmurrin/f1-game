/* archive-sessions.test.mjs — the archive rule (AGENTS.md §Coordination, 2026-10-19) over a saved
 * list_sessions page: only an agent-created, idle, role-tagged session whose PR is merged or closed
 * is ARCHIVE; a session Bryce opened, an orchestrator, a watcher or a running one is KEEP.
 *
 * Run: node --test tests/unit/archive-sessions.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, extractSessions, roleOf, agentCreated, main, ARCHIVABLE_ROLES, prsOf, workState, eventsFor, PUSH_FLOOR_MIN } from "../../tools/ci/archive-sessions.mjs";

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
  assert.equal(decide(sess({ updated_at: ago(20) }), { now: NOW, idleMin: 5, prState: merged }).verdict, "ARCHIVE");
  assert.equal(decide(sess({ updated_at: ago(10) }), { now: NOW, idleMin: 5, prState: merged }).why, "touched 10 min ago (rule: idle ≥ 15)", "--idle-min never goes below the push floor");
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

// tx-bryce-routines-failed X7 (2026-10-26 14:30Z): W65 was archived mid-conflict-work with nothing pushed.
const EV = (min, k, body) => ({ created_at: ago(min), [k]: { internal_anthropic_catchall: body } });
const bash = (min, id, command) => EV(min, "assistant", { message: { content: [{ type: "tool_use", id, name: "Bash", input: { command } }] } });
const out = (min, id, text, is_error = false) => EV(min, "user", { message: { content: [{ type: "tool_result", tool_use_id: id, content: text, is_error }] } });

test("workState: last ok git push, a dirty git status with no commit after it, and an unanswered call (X7)", () => {
  const pushed = [bash(30, "a", "git status --short"), out(30, "a", " M tools/ci/archive-sessions.mjs"), bash(25, "b", "git commit -m x"), out(25, "b", "ok"),
    bash(10, "c", "git push -u origin cursor/x"), out(10, "c", "done")];
  const w = workState(pushed);
  assert.equal(w.lastPushAt, Date.parse(ago(10)));
  assert.deepEqual([w.dirty, w.midTool], ["", false]);
  const dirty = workState([bash(100, "a", "git status"), out(100, "a", "Changes not staged for commit:\n  modified: a.js")]);
  assert.equal(dirty.dirty, "git status at 18:20Z listed changes, no commit or push after it", "match /listed changes, no commit or push after it/");
  assert.equal(workState([bash(100, "a", "git push origin x"), out(100, "a", "rejected", true)]).lastPushAt, null, "a failed push is not a push");
  assert.equal(workState([...pushed, bash(5, "d", "git merge origin/main")]).midTool, true);
});

test("decide with events: a push under 15 min, a dirty tree or a mid-tool call keeps it; an unpushed summary keeps it (X7)", () => {
  const merged = () => "merged";
  const base = { now: NOW, prState: merged };
  const s = sess({ updated_at: ago(90) });
  assert.equal(decide(s, { ...base, work: () => ({ lastPushAt: NOW - 5 * 60000, dirty: "", midTool: false }) }).why, `last push 5 min ago (rule: ≥ ${PUSH_FLOOR_MIN})`);
  assert.equal(decide(s, { ...base, work: () => ({ lastPushAt: null, dirty: "git status listed changes", midTool: false }) }).why, "tree dirty per its last events (git status listed changes): ask it to push WIP first (X7)", "match /tree dirty/");
  assert.equal(decide(s, { ...base, work: () => ({ lastPushAt: null, dirty: "", midTool: true }) }).why, "its newest event is a tool call with no result: archived now it dies mid-tool (X7)", "match /mid-tool/");
  assert.equal(decide(s, { ...base, work: () => ({ lastPushAt: NOW - 60 * 60000, dirty: "", midTool: false }) }).verdict, "ARCHIVE");
  assert.equal(decide(sess({ post_turn_summary: "#3788 conflicts resolved locally, not pushed yet" }), base).why, "its last summary says \"not pushed\": ask it to push WIP and stand down first (X7)", "match /\"not pushed\"/");
});

test("main --events reads each session's saved pages by id; --help exits 0; unknown flags exit 2", () => {
  const page = JSON.stringify({ ccr: { data: [sess({ id: "session_01W65" }), sess({ id: "session_01DONE" })] } });
  const evPage = JSON.stringify({ ccr: { data: [bash(4, "p", "git push -u origin cursor/x"), out(4, "p", "ok")] } });
  const files = { "page.txt": page, "ev/session_01W65-p1.txt": evPage };
  const logs = [];
  const rc = main(["page.txt", "--events", "ev"], { read: (f) => files[f], list: () => ["session_01W65-p1.txt"], prState: () => "merged", log: (l) => logs.push(l), now: () => NOW });
  assert.equal(rc, 0);
  assert.equal(logs.find((l) => l.includes("session_01W65")), "KEEP    session_01W65  [Owner] A·#3020 · game · Sonnet — drive #3020 to merged       last push 4 min ago (rule: ≥ 15)", "match /^KEEP .*last push 4 min ago/");
  assert.equal(logs.find((l) => l.includes("session_01DONE")), "ARCHIVE session_01DONE  [Owner] A·#3020 · game · Sonnet — drive #3020 to merged       role owner, agent-created, idle 90 min, #3020 merged", "match /^ARCHIVE/");
  assert.equal(eventsFor("ev", "cse_01NONE", { list: () => ["session_01W65-p1.txt"] }), null);
  const h = [];
  assert.equal(main(["--help"], { log: (l) => h.push(l) }), 0);
  assert.equal(h[0].split("\n")[0], "usage: node tools/ci/archive-sessions.mjs <saved list_sessions page> [--offline] [--json] [--idle-min N] [--events <dir>]");
  assert.equal(main(["page.txt", "--definitely-not-a-flag"], { log: () => {} }), 2);
});
