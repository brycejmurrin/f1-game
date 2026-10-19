// claude-usage.mjs: request dedupe, unknown-vs-zero usage, trigger classification, sidechains and the
// teleport-copy case, on a synthetic fixture (never a real transcript: those carry prompts and paths).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDigest, addRecord, digestFile, finish, render, triggerOf } from "../../tools/ci/claude-usage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = path.join(ROOT, "tests", "fixtures", "claude-usage");

async function digest(...files) {
  const d = createDigest();
  for (const f of files) await digestFile(d, path.join(FIX, f));
  return finish(d);
}

test("block rows of one request count once; message.id is the fallback key", async () => {
  const r = await digest("session.jsonl");
  assert.equal(r.requests, 6);
  assert.equal(r.unidentifiedRequests, 0);
  // req_1 output is the max of its rows (40), not the sum (50).
  assert.equal(r.byTrigger.human.output_tokens, 40);
  assert.equal(r.byTrigger.human.cache_read_input_tokens, 1000);
  // msg_6 had two rows repeating tool t3: two tools, one request.
  const legacy = r.turns.find((t) => t.trigger === "unclassified");
  assert.deepEqual([legacy.requests, legacy.tools], [1, 2]);
});

test("absent usage is unknown, never zero; malformed lines and API errors are counted", async () => {
  const r = await digest("session.jsonl");
  assert.equal(r.malformed, 1);
  assert.equal(r.apiErrors, 1);
  assert.equal(r.total.unknown.output_tokens, 1);         // req_2 reported nothing
  assert.equal(r.total.unknown.cache_read_input_tokens, 2); // req_2 + req_4's partial usage
  assert.equal(r.byTrigger.task_notification.input_tokens, 3);
  assert.match(render(r), /cache-read 1,800 \+2 unknown/);
});

test("triggers: host field first, envelope only as inferred, otherwise unclassified", async () => {
  const r = await digest("session.jsonl");
  assert.deepEqual(Object.keys(r.byTrigger).sort(), ["human", "inferred:task_notification", "task_notification", "unclassified"]);
  assert.equal(triggerOf({ origin: { kind: "task-notification" } }), "task_notification");
  assert.equal(triggerOf({ message: { content: "<agent-message from=x>hi</agent-message>" } }), "inferred:peer_message");
  assert.equal(triggerOf({ message: { content: "<system-reminder>\n[SYSTEM NOTIFICATION - NOT USER INPUT]" } }), "inferred:system_notification");
  // A user who types about a notification is not one.
  assert.equal(triggerOf({ message: { content: "audit the <task-notification> handling" } }), "unclassified");
});

test("isMeta skill bodies and tool results do not open turns; sidechains are kept apart", async () => {
  const r = await digest("session.jsonl");
  assert.equal(r.turns.length, 4);
  assert.equal(r.metaRecords, 1);
  assert.equal(r.sidechainRequests, 1);
  assert.equal(r.sidechain.cache_read_input_tokens, 200);
  assert.equal(r.total.cache_read_input_tokens, 1800);
  assert.ok(!r.limits.some((l) => /no sidechain/.test(l)));
});

test("a repeat-teleport copy adds no requests or turns", async () => {
  const one = await digest("session.jsonl");
  const both = await digest("session-copy.jsonl", "session.jsonl");
  assert.equal(both.requests, one.requests);
  assert.equal(both.turns.length, one.turns.length);
  assert.deepEqual(both.total, one.total);
});

test("low-tool turns are reported as a proxy and the limits are printed", () => {
  const d = createDigest();
  addRecord(d, { type: "user", uuid: "u", turnOrigin: "task_notification", message: { content: "x" } });
  addRecord(d, { type: "assistant", requestId: "r", message: { content: [], usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 } } });
  const r = finish(d);
  assert.deepEqual([r.byTrigger.task_notification.lowToolTurns, r.byTrigger.task_notification.lowToolInput], [1, 6]);
  assert.match(render(r), /# limit: lowToolTurns is a proxy/);
  assert.match(render(r), /# limit: no sidechain rows/);
});

test("CLI: aggregate by default, --json parses, a bad --limit exits 2", () => {
  const cli = path.join(ROOT, "tools", "ci", "claude-usage.mjs");
  const out = execFileSync(process.execPath, [cli, FIX], { encoding: "utf8" });
  assert.match(out, /^# claude-usage: 2 file\(s\)/);
  assert.doesNotMatch(out, /top \d+ turns/);
  assert.equal(JSON.parse(execFileSync(process.execPath, [cli, FIX, "--json"], { encoding: "utf8" })).requests, 6);
  assert.throws(() => execFileSync(process.execPath, [cli, FIX, "--limit", "0"], { stdio: "pipe" }), (e) => e.status === 2);
});
