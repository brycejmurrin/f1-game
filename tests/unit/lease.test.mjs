// lease — the owner lease grammar and states (tools/ci/lib/lease.mjs; #6887 phases 3 + 4, #7050): `landing` and
// `released`, the adopted-unleased check, and its readers (pr-board, child-health, ship-pr). Pure; no network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handoffLease, leaseState, leaseWord, ownerEvents, adoptedUnleased, LEASE_STATES } from "../../tools/ci/lib/lease.mjs";
import { evaluate, brief, leaseLabel } from "../../tools/ci/pr-board.mjs";
import { classifyChild, deadOwnedPrs } from "../../tools/ci/child-health.mjs";
import { main as ship, leaseRefusal } from "../../tools/ci/ship-pr.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/pr-board/lease-11-26.json"), "utf8"));
const handoff = (owner) => `## Plan\n- [ ] land: x\n\n\`\`\`handoff\nhead: abc\nowner: ${owner}\nnext: y\n\`\`\``;
const at = (iso, body) => ({ created_at: iso, body });

test("11-26 fixture: every PR that ended at land reads landing; released only where the newest owner act is `releases PR #n`", () => {
  const now = Date.parse(FX.now);
  for (const f of FX.prs) {
    const labels = f.labels;
    assert.equal(leaseState({ ...handoffLease(f.body), labels, comments: f.comments, number: f.number }, now), f.expect.lease, `#${f.number}`);
  }
  assert.deepEqual(FX.prs.filter((f) => f.expect.lease === "released").map((f) => f.number), [6712]);
  const prs = FX.prs.map((f) => ({ pr: { number: f.number, title: "t", head: { sha: "s", ref: "b" }, labels: f.labels.map((name) => ({ name })), body: f.body }, runs: [], checkRuns: [], comments: f.comments }));
  const rows = evaluate(prs, { now }).rows;
  assert.deepEqual(rows.map((r) => [r.number, r.lease]), FX.prs.map((f) => [f.number, f.expect.lease]).sort((a, b) => a[0] - b[0]));
  assert.equal(leaseLabel(rows.find((r) => r.number === 6712), now), "released", "no time suffix on a released lease");
});

test("owner grammar: `owner: landing …` and `owner: released …` win over labels and the until-time", () => {
  assert.equal(leaseWord("landing claude:session_abcdef12"), "landing");
  assert.equal(leaseWord("none (released by claude:session_x)"), null, "a mid-line word is prose, not the grammar");
  const t = Date.parse("2026-11-27T00:00:00Z");
  assert.equal(leaseState({ ...handoffLease(handoff("landing claude:session_abcdef12")), labels: [] }, t), "landing");
  assert.equal(leaseState({ ...handoffLease(handoff("released claude:session_abcdef12 until 2026-11-27T03:00Z")), labels: ["land"] }, t), "released");
  assert.equal(leaseState({ ...handoffLease(handoff("none")), labels: [] }, t), "none", "owner: none with no release comment stays none");
  assert.equal(leaseState({ ...handoffLease(handoff("claude:s until 2026-11-27T03:00Z")), labels: [] }, t), "live", "the old states are unchanged");
  assert.deepEqual(LEASE_STATES, ["none", "open", "live", "parked", "lapsed", "landing", "released"]);
});

test("ownerEvents: adopts and releases for this PR only, oldest first", () => {
  const evs = ownerEvents([
    at("2026-11-26T02:00:00Z", "releases PR #7 at abc"),
    at("2026-11-26T01:00:00Z", "adopts PR #7 — claude:session_one"),
    at("2026-11-26T03:00:00Z", "adopts PR #8 — claude:session_other"),
    at("2026-11-26T04:00:00Z", "see releases PR #7 above"),
  ], 7);
  assert.deepEqual(evs.map((e) => [e.kind, e.session]), [["adopt", "claude:session_one"], ["release", null]]);
});

// #6849 at 05:52Z: `adopts PR #6849 — claude:session_01BEw9UH2EnmpdF9otmgPFuC` posted, Hand-off still `owner: none`.
const ADOPT_6849 = at("2026-11-26T05:52:08Z", "adopts PR #6849 — claude:session_01BEw9UH2EnmpdF9otmgPFuC at head ef8359cc0baa83807d3e020c4c2c10b2f9e06bbf (red: Pure-node unit suites vm-b2). Triage now.");

test("adopted-unleased: #6849's 05:52Z state is flagged; a written lease or a later release clears it", () => {
  const body = handoff("none");
  assert.deepEqual(adoptedUnleased(body, [ADOPT_6849], 6849), { session: "claude:session_01BEw9UH2EnmpdF9otmgPFuC", at: "2026-11-26T05:52:08Z" });
  assert.equal(adoptedUnleased(handoff("claude-code:session_01BEw9UH2EnmpdF9otmgPFuC until 2026-11-26T09:52Z"), [ADOPT_6849], 6849), null, "the host may differ; the session id matches");
  assert.equal(adoptedUnleased(body, [ADOPT_6849, at("2026-11-26T06:30:00Z", "releases PR #6849 at ef8359cc")], 6849), null);
  assert.equal(adoptedUnleased(body, [], 6849), null, "no adoption: nothing to flag");
  const row = evaluate([{ pr: { number: 6849, title: "t", head: { sha: "s", ref: "b" }, labels: [{ name: "land" }], body }, runs: [], checkRuns: [], comments: [ADOPT_6849] }]).rows[0];
  assert.equal(row.adoptedUnleased, "claude:session_01BEw9UH2EnmpdF9otmgPFuC");
  const fields = brief({ rows: [{ ...row, suggest: "WAIT", why: "" }] }).split("\n")[0].split(" | ");
  assert.equal(fields[5], "lease landing; adopted-unleased: claude:session_01BEw9UH2EnmpdF9otmgPFuC");
});

test("ship-pr refuses an adopted-unleased PR before ready-gate runs; a leased one goes on to ready-gate", () => {
  const out = [];
  let ran = 0;
  const go = (body) => { out.length = 0; return ship(["--pr", "6849"], { run: () => (ran++, 0), log: (l) => out.push(l), closing: () => ({ ok: true, lines: [] }), getPr: () => ({ json: { body, head: { sha: "s" } } }), getComments: () => ({ json: [ADOPT_6849] }) }); };
  assert.equal(go(handoff("none")), 1);
  assert.equal(ran, 0, "ready-gate never ran");
  assert.equal(out[0], "ship refused #6849: adopted-unleased — claude:session_01BEw9UH2EnmpdF9otmgPFuC adopted at 2026-11-26T05:52:08Z but the Hand-off owner: line does not name it.");
  assert.deepEqual(out, leaseRefusal(6849, handoff("none"), [ADOPT_6849]));
  assert.equal(go(handoff("claude:session_01BEw9UH2EnmpdF9otmgPFuC until 2026-11-26T09:52Z")), 0);
  assert.equal(ran, 1);
  assert.equal(ship(["--pr", "6849"], { run: () => 0, log: () => {}, closing: () => ({ ok: true, lines: [] }), getPr: () => ({ json: { body: handoff("none") } }), getComments: () => ({ error: "HTTP 500" }) }), 0, "unreadable comments: no refusal, ready-gate judges");
});

test("child-health reads both words: a released owner is skipped, a landing one is NONE", () => {
  const dead = classifyChild({ id: "session_deadDDDD", title: "w", status_bucket: "SESSION_STATUS_BUCKET_FAILED" }, { is_error: true, result: "boom" });
  const prs = [
    { number: 1, title: "a", body: handoff("released claude:session_deadDDDD"), labels: [] },
    { number: 2, title: "b", body: handoff("landing claude:session_deadDDDD"), labels: [] },
    { number: 3, title: "c", body: handoff("claude:session_deadDDDD until 2026-11-26T01:00Z"), labels: [] },
  ];
  assert.deepEqual(deadOwnedPrs([dead], prs).map((r) => [r.pr, r.act, r.lease]), [[2, "NONE", "landing"], [3, "PARK", "lapsed"]]);
});

test("#7507 member 3: CRLF bodies, trailing notes after the until-time, and whole-token session ids", () => {
  const crlf = handoff("claude:session_a until 2026-11-28T10:00Z").replace(/\n/g, "\r\n");
  assert.deepEqual(handoffLease(crlf), { owner: "claude:session_a", until: "2026-11-28T10:00Z" });
  const noted = handoffLease(handoff("claude:session_a until 2026-11-28T10:00Z (renewed)"));
  assert.deepEqual(noted, { owner: "claude:session_a", until: "2026-11-28T10:00Z" });
  assert.equal(leaseState(noted, Date.parse("2026-11-28T09:00Z")), "live");
  const adopt = (s) => [at("2026-11-28T08:00Z", `adopts PR #9 — claude:${s}`)];
  const body = handoff("claude:session_12 until 2026-11-28T10:00Z");
  assert.deepEqual(adoptedUnleased(body, adopt("session_1"), 9), { session: "claude:session_1", at: "2026-11-28T08:00Z" },
    "session_1 is not named by an owner line that says session_12");
  assert.equal(adoptedUnleased(body, adopt("session_12"), 9), null);
  assert.equal(adoptedUnleased(handoff("landing claude:session_1"), adopt("session_1"), 9), null);
  assert.equal(adoptedUnleased(crlf, adopt("session_a"), 9), null, "a CRLF lease names its adopter");
});
