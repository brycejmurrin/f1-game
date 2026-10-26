/* fleet-archive.test.mjs — the archive rule (AGENTS.md §Concurrent PRs, 2026-10-19) over a saved
 * list_sessions page: only an agent-created, idle, role-tagged session whose PR is merged or closed
 * is ARCHIVE; a session Bryce opened, an orchestrator, a watcher or a running one is KEEP.
 *
 * Run: node --test tests/unit/fleet-archive.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, extractSessions, prOf, roleOf, agentCreated, main, ARCHIVABLE_ROLES } from "../../tools/ci/fleet-archive.mjs";

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
  for (const role of ["orchestrator", "watch", "fleet-watch", "merge-desk"])
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

// System audit 2026-10-26 §1: retired orchestrators piled up (ten ORCH B in six hours).
import { fleetOf, retired } from "../../tools/ci/fleet-archive.mjs";

test("a retired orchestrator is ARCHIVE once its successor's LIVE line is on the bus; never before", () => {
  const orch = (over = {}) => sess({ id: "session_01OLD", title: "[Done → B·O-queue9] B·O-queue8 orchestrator", updated_at: ago(90),
    tags: ["f1-game-fleet", "role:orchestrator", "fleet:B", "config:session-created"], ...over });
  const next = (L) => (L === "B" ? { letter: "B", id: "claude:session_01NEW" } : null);
  assert.equal(decide(orch({ title: "B·O-queue8", session_status: "SESSION_STATUS_COMPLETED" }), { now: NOW, successorOf: next }).verdict, "ARCHIVE", "completed counts as retired");
  // [session override, successorOf, verdict, why]
  const cases = [
    [{}, next, "ARCHIVE", /successor claude:session_01NEW LIVE/],
    [{ title: "B·O-queue8 orchestrator" }, next, "KEEP", /live orchestrator is never archived/],
    [{}, () => null, "KEEP", /no ORCH B LIVE line/],
    [{}, () => ({ letter: "B", id: "claude:session_01OLD" }), "KEEP", /still names this session/],
    [{ updated_at: ago(5) }, next, "KEEP", /touched 5 min ago/],
    [{ origin: "ios", tags: ["role:orchestrator", "fleet:B"] }, next, "KEEP", /not agent-created/],
    [{ tags: ["role:orchestrator", "config:session-created"], title: "[Done → x] y" }, next, "KEEP", /no fleet letter/],
    ...["watch", "fleet-watch", "merge-desk"].map((role) => [{ tags: [`role:${role}`, "fleet:B", "config:session-created"] }, next, "KEEP", /never archived/]),
  ];
  for (const [over, successorOf, verdict, why] of cases) {
    const r = decide(orch(over), { now: NOW, successorOf });
    assert.equal(r.verdict, verdict, JSON.stringify(over));
    assert.match(r.why, why, JSON.stringify(over));
  }
  assert.equal(fleetOf({ title: "[Done → ORCH C] ORCH C queue" }), "C");
  assert.equal(fleetOf({ title: "A·O7 orchestrator" }), "A");
  assert.equal(retired({ title: "[Done -> x] y" }), true);
  assert.equal(retired({ title: "x [Done → y]" }), false);
});

test("main reads the bus once, only for a retired orchestrator, and never with --offline", () => {
  const page = JSON.stringify({ ccr: { data: [
    sess({ id: "session_01OLD", title: "[Done → n] ORCH B q", tags: ["role:orchestrator", "fleet:B", "config:session-created"] }),
    sess({ id: "session_01OLD2", title: "[Done → n] ORCH B q2", tags: ["role:orchestrator", "fleet:B", "config:session-created"] }),
  ] } });
  let reads = 0;
  const bus = () => { reads++; return [{ text: "ORCH B LIVE claude:session_01NEW", from: "claude:session_01NEW", sha: "abc", at: 1 }]; };
  const logs = [];
  main(["page.txt"], { read: () => page, prState: () => "merged", log: (l) => logs.push(l), now: () => NOW, bus });
  assert.equal(reads, 1);
  assert.match(logs.at(-1), /= fleet-archive 2 archive, 0 keep/);
  reads = 0; logs.length = 0;
  main(["page.txt", "--offline"], { read: () => page, prState: () => "merged", log: (l) => logs.push(l), now: () => NOW, bus });
  assert.equal(reads, 0);
  assert.match(logs.at(-1), /0 archive, 2 keep/);
});

// merge-done.mjs — the DONE bus line from the merge commit itself (system audit 2026-10-26 §1:
// 88 of 326 merges in a week had no DONE line). Pinned here beside the other fleet bookkeeping.
import { doneFacts, doneText, alreadyDone, postDone, main as mergeDoneMain } from "../../tools/ci/merge-done.mjs";

const SHA = "a".repeat(40), P1 = "b".repeat(40), P2 = "c".repeat(40);
const commitRun = (subject, parents = [P1, P2], body = "") => (args) => args[0] === "log"
  ? { code: 0, out: [SHA, parents.join(" "), "brycejmurrin", subject, body].join("\0") } : { code: 1, out: "" };

test("merge-done: a two-parent PR merge yields the DONE facts; a squash or a sync merge does not", () => {
  const c = { sha: SHA, parents: [P1, P2], author: "brycejmurrin", subject: "Merge pull request #3785 from brycejmurrin/cursor/x", body: "" };
  assert.deepEqual(doneFacts(c, { actor: "orchB" }), { ok: true, pr: 3785, sha: SHA, parents: [P1, P2], actor: "orchB" });
  assert.equal(doneFacts({ ...c, body: "Merged-by: claude:session_01X\n" }).actor, "claude:session_01X");
  assert.equal(doneFacts(c).actor, "brycejmurrin");
  assert.match(doneFacts({ ...c, parents: [P1], subject: "Fix it (#3785)" }).why, /1 parent\(s\): not a merge commit \(a squash/);
  assert.match(doneFacts({ ...c, subject: "Merge remote-tracking branch 'origin/claude/f1-game-project-26h3ng'" }).why, /names no PR/);
  assert.equal(doneText(doneFacts(c, { actor: "x" })), `#3785 ${SHA} merge commit (parents bbbbbbb ccccccc) by x — posted from the commit by merge-done.mjs`);
});

test("merge-done: posts once; an existing DONE for the PR and sha (any prefix ≥ 7) is not repeated", () => {
  const sent = [];
  const send = (type, to, from, text) => { sent.push({ type, to, from, text }); return { ok: true }; };
  const run = commitRun("Merge pull request #12 from o/b");
  const r = postDone(SHA, { run, bus: () => [], send, log: () => {} });
  assert.equal(r.code, 0); assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].type, sent[0].to, sent[0].from], ["DONE", "*", "github:merge-done"]);
  assert.equal(alreadyDone([{ type: "DONE", text: `#12 ${SHA.slice(0, 7)} merged` }], { pr: 12, sha: SHA }), true);
  assert.equal(alreadyDone([{ type: "DONE", text: `#13 ${SHA.slice(0, 7)}` }], { pr: 12, sha: SHA }), false, "another PR");
  assert.equal(alreadyDone([{ type: "READY", text: `#12 ${SHA}` }], { pr: 12, sha: SHA }), false, "only DONE lines count");
  const again = postDone(SHA, { run, bus: () => [{ type: "DONE", text: `#12 ${SHA.slice(0, 9)} by orch` }], send, log: () => {} });
  assert.equal(again.already, true); assert.equal(sent.length, 1);
  assert.equal(postDone(SHA, { run: commitRun("Fix (#12)", [P1]), bus: () => [], send, log: () => {} }).code, 3);
  assert.equal(postDone(SHA, { run, bus: () => [], send: () => ({ ok: false }), log: () => {} }).code, 1);
  const dry = postDone(SHA, { run, bus: () => [], send, dryRun: true, log: () => {} });
  assert.equal(dry.dryRun, true); assert.equal(sent.length, 1, "a dry run sends nothing");
});

test("merge-done CLI: one sha or one --range; unknown flags and extra positionals are usage errors", () => {
  const err = console.error; console.error = () => {};
  try {
    assert.equal(mergeDoneMain([]), 2);
    assert.equal(mergeDoneMain(["--body", "x"]), 2);
    assert.equal(mergeDoneMain(["a", "b"]), 2);
    assert.equal(mergeDoneMain(["--range", "a..b", "c"]), 2);
  } finally { console.error = err; }
  const runR = (args) => args[0] === "rev-list" ? { code: 0, out: `${SHA}\n` } : commitRun("Merge pull request #7 from o/b")(args);
  const sent = [];
  assert.equal(mergeDoneMain(["--range", "x..y", "--actor", "bryce"], { run: runR, bus: () => [], send: (...a) => { sent.push(a); return { ok: true }; }, log: () => {} }), 0);
  assert.match(sent[0][3], /^#7 a{40} .* by bryce/);
});
