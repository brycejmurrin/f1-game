// child-health — the quota watchdog (#5844). Fixtures are hand-built in the shapes measured on 2026-11-19: a
// `list_sessions {children:true}` page inside its untrusted envelope, `list_events kinds:["result"]` pages, and open
// PR bodies with a ```handoff block. The 429 text is the 2026-11-18 incident's. Pure functions plus one offline CLI
// run (--prs from a file); no network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { classifyChild, deadOwnedPrs, lastResult, ownerSession, render, resetOf, sessionsFrom } from "../../tools/ci/child-health.mjs";

const QUOTA_TEXT = 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"usage_limit_reached"}} · You\'ve hit your Fable limit · resets 5am (UTC)';
const envelope = (obj) => `<other-session nonce="x" untrusted="true">\nDATA\n    ${JSON.stringify({ ccr: obj })}\n</other-session nonce="x">`;
const row = (id, bucket, extra = {}) => ({ id, title: `worker ${id}`, status_bucket: `SESSION_STATUS_BUCKET_${bucket}`, updated_at: "2026-11-18T22:40:00Z", ...extra });
const resultPage = (...bodies) => envelope({ data: bodies.map(([at, b]) => ({ created_at: at, result: { internal_anthropic_catchall: b } })), has_more: false });
const handoff = (owner) => `## Plan\n- [ ] land: x\n\n\`\`\`handoff\nhead: abc\nowner: ${owner}\nnext: y\n\`\`\``;
const pr = (number, owner, labels = []) => ({ number, title: `PR ${number}`, body: handoff(owner), labels: labels.map((name) => ({ name })) });

const SESSIONS = envelope({ data: [
  row("session_quotaAAAA", "FAILED"),
  row("session_failedBBBB", "FAILED"),
  row("session_aliveCCCC", "WORKING"),
  row("session_lostDDDD", "WORKING", { connection_status: "disconnected" }),
  row("session_idleEEEE", "COMPLETED"),
], has_more: false });

test("sessionsFrom reads the enveloped list_sessions page and a bare array", () => {
  assert.equal(sessionsFrom(SESSIONS).length, 5);
  assert.deepEqual(sessionsFrom('[{"id":"session_x1y2z3"}]'), [{ id: "session_x1y2z3" }]);
});

test("lastResult picks the newest result body", () => {
  const r = lastResult(resultPage(["2026-11-18T22:00:00Z", { subtype: "success", is_error: false }], ["2026-11-18T22:32:24Z", { subtype: "error_during_execution", is_error: true, result: QUOTA_TEXT }]));
  assert.equal(r.is_error, true);
  assert.equal(r.created_at, "2026-11-18T22:32:24Z");
  assert.equal(lastResult(envelope({ data: [] })), null);
});

test("classifyChild: a 429 usage_limit_reached is quota, with its reset", () => {
  const c = classifyChild(row("session_quotaAAAA", "FAILED"), { is_error: true, subtype: "error_during_execution", result: QUOTA_TEXT, created_at: "2026-11-18T22:32:24Z" });
  assert.equal(c.dead, true);
  assert.equal(c.cause, "quota");
  assert.equal(c.resets, "5am (UTC)");
  assert.equal(c.bucket, "failed");
});

test("classifyChild: an idle child whose newest result is a quota error is dead too", () => {
  const c = classifyChild(row("session_idleEEEE", "COMPLETED"), { is_error: true, result: QUOTA_TEXT });
  assert.equal(c.dead, true);
  assert.equal(c.cause, "quota");
});

test("classifyChild: other failures, lost workers, missing pages, live children", () => {
  assert.equal(classifyChild(row("session_failedBBBB", "FAILED"), { is_error: true, result: "TypeError: x is undefined" }).cause, "failed");
  assert.equal(classifyChild(row("session_lostDDDD", "WORKING", { connection_status: "disconnected" })).cause, "disconnected");
  assert.equal(classifyChild(row("session_failedBBBB", "FAILED")).cause, "unknown");
  const alive = classifyChild(row("session_aliveCCCC", "WORKING"), { is_error: false, subtype: "success", result: "done; usage limit ok" });
  assert.equal(alive.dead, false);
  assert.equal(alive.cause, null);
});

test("resetOf reads an epoch resetsAt and the banner wording", () => {
  assert.equal(resetOf('{"resetsAt":1795669200}'), new Date(1795669200 * 1000).toISOString());
  assert.equal(resetOf("You've hit your limit · resets 5am (UTC)"), "5am (UTC)");
  assert.equal(resetOf("no reset here"), null);
});

test("ownerSession pulls the id out of a Hand-off owner value", () => {
  assert.equal(ownerSession("claude:session_01BEw9UG7X1pKmQr7hkqyiM4"), "session_01BEw9UG7X1pKmQr7hkqyiM4");
  assert.equal(ownerSession("cursor:bc-1234"), null);
  assert.equal(ownerSession("-"), null);
});

test("deadOwnedPrs: PARK, RELAUNCH, NONE for land, and live or foreign owners skipped", () => {
  const children = [
    classifyChild(row("session_quotaAAAA", "FAILED"), { is_error: true, result: QUOTA_TEXT }),
    classifyChild(row("session_failedBBBB", "FAILED"), { is_error: true, result: "boom" }),
    classifyChild(row("session_aliveCCCC", "WORKING")),
  ];
  const prs = [
    pr(5786, "claude:session_quotaAAAA"),
    pr(5778, "claude:session_quotaAAAA", ["needs-owner"]),
    pr(5768, "claude:session_failedBBBB", ["land"]),
    pr(5790, "claude:session_aliveCCCC"),
    pr(5791, "cursor:bc-1"),
    { number: 5792, title: "no handoff", body: "", labels: [] },
  ];
  const out = deadOwnedPrs(children, prs);
  assert.deepEqual(out.map((r) => [r.pr, r.act]), [[5768, "NONE"], [5778, "RELAUNCH"], [5786, "PARK"]]);
  assert.equal(out[2].next, "add needs-owner, then launch CONTINUE PR 5786 on another model (or after 5am (UTC))");
  assert.equal(out[0].cause, "failed");
  assert.deepEqual(render(children, out).split("\n"), [
    "= child-health: 3 children, 2 dead, 3 PRs with a dead owner",
    "DEAD session_quotaAAAA quota resets 5am (UTC) — worker session_quotaAAAA",
    "DEAD session_failedBBBB failed — worker session_failedBBBB",
    "NONE     #5768 owner session_failedBBBB (failed) → land PR: never re-owned (steward §After land)",
    "RELAUNCH #5778 owner session_quotaAAAA (quota) → launch CONTINUE PR 5778 on another model (or after 5am (UTC))",
    "PARK     #5786 owner session_quotaAAAA (quota) → add needs-owner, then launch CONTINUE PR 5786 on another model (or after 5am (UTC))",
  ]);
});

test("CLI: offline run with saved pages exits 1 and prints JSON", () => {
  const dir = path.resolve("artifacts/tmp/child-health-test");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "kids.txt"), SESSIONS);
  fs.writeFileSync(path.join(dir, "a.txt"), resultPage(["2026-11-18T22:32:24Z", { is_error: true, result: QUOTA_TEXT }]));
  fs.writeFileSync(path.join(dir, "prs.json"), JSON.stringify([pr(5786, "claude:session_quotaAAAA")]));
  const run = (extra) => spawnSync(process.execPath, ["tools/ci/child-health.mjs", "--sessions", path.join(dir, "kids.txt"),
    "--results", `session_quotaAAAA=${path.join(dir, "a.txt")}`, "--prs", path.join(dir, "prs.json"), ...extra], { encoding: "utf8" });
  const r = run(["--json"]);
  assert.equal(r.status, 1, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.prs[0].act, "PARK");
  assert.equal(j.children.filter((c) => c.dead).length, 3);
  assert.equal(spawnSync(process.execPath, ["tools/ci/child-health.mjs"], { encoding: "utf8" }).status, 2);
  assert.equal(run(["--bogus"]).status, 2);
});

test("classifyChild: a blocked or need_input child is WAITING, not dead, and the brief names it", () => {
  const b = classifyChild(row("session_waitFFFF", "BLOCKED", { post_turn_summary: { needs_action: "approve the Bash prompt" } }));
  assert.equal(b.dead, false);
  assert.equal(b.waiting, true);
  assert.equal(b.needs, "approve the Bash prompt");
  const n = classifyChild(row("session_waitGGGG", "WORKING", { post_turn_summary: { status_category: "need_input" } }));
  assert.equal(n.waiting, true);
  assert.equal(classifyChild(row("session_aliveCCCC", "WORKING")).waiting, false);
  assert.equal(classifyChild(row("session_failedBBBB", "BLOCKED"), { is_error: true, result: "boom" }).waiting, false);
  assert.match(render([b, n], []), /^WAITING session_waitFFFF need_input — .*approve the Bash prompt → answer it/m);
});

test("#6757: --help prints a real usage line (not the file URL) and exits 0", () => {
  const r = spawnSync(process.execPath, ["tools/ci/child-health.mjs", "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split(" ").slice(0, 3).join(" "), "usage: node tools/ci/child-health.mjs");
  assert.doesNotMatch(r.stdout, /file:\/\//);
});
