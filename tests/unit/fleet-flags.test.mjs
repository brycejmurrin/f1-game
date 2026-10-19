/* fleet-flags.test.mjs — tools/ci/fleet-flags.mjs: the four orchestrator flags from get_session JSON (#2666). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, format } from "../../tools/ci/fleet-flags.mjs";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const sess = (o = {}) => ({ ccr: { id: "session_01ABCDEFGH", title: "lane", session_status: "SESSION_STATUS_RUNNING", status_bucket: "SESSION_STATUS_BUCKET_WORKING", connection_status: "connected", configured_model: "claude-sonnet-5-5", updated_at: "2026-10-17T11:55:00Z", external_metadata: { last_served_model: "claude-sonnet-5-5", context_usage: { used_tokens: 100000, max_tokens: 1000000 } } }, ...o });

test("a healthy session has no flags", () => assert.deepEqual(assess(sess(), NOW).flags, []));

test("served != configured model is flagged (the silent Opus switch)", () => {
  const s = sess(); s.ccr.external_metadata.last_served_model = "claude-opus-5-5";
  assert.match(assess(s, NOW).flags[0], /model drift: configured claude-sonnet-5-5, served claude-opus-5-5/);
  s.ccr.external_metadata.last_served_model = "claude-sonnet-5-5[1m]";   // a context-window suffix is not drift
  assert.deepEqual(assess(s, NOW).flags, []);
});

test("cost over cap and context over 300k are flagged; thresholds are overridable", () => {
  const s = sess({ cost_usd: 36.6 }); s.ccr.external_metadata.context_usage.used_tokens = 750000;
  const f = assess(s, NOW).flags;
  assert.ok(f.some((x) => /cost \$36\.60 > cap \$15/.test(x)) && f.some((x) => /context 750k > 300k/.test(x)));
  assert.deepEqual(assess(s, NOW, { costCap: 50, contextCap: 900000 }).flags, []);
});

test("stalled: disconnected or stale while the summary says working; idle sessions are not stalled", () => {
  const d = sess(); d.ccr.connection_status = "disconnected";
  assert.match(assess(d, NOW).flags[0], /stalled: disconnected/);
  const old = sess(); old.ccr.updated_at = "2026-10-17T10:00:00Z";
  assert.match(assess(old, NOW).flags[0], /stalled: no update for 120 min/);
  old.ccr.status_bucket = "SESSION_STATUS_BUCKET_COMPLETED"; old.ccr.session_status = "SESSION_STATUS_IDLE";
  assert.deepEqual(assess(old, NOW).flags, []);
});

test("format prints one row per session and tolerates missing fields", () => {
  const t = format([assess(sess(), NOW), assess({}, NOW)]);
  assert.equal(t.split("\n").length, 3); assert.match(t, /ok/);
});

test("cost is read from external_metadata.usage.cost_usd; an explicit cost_usd wins", () => {
  const s = sess(); s.ccr.external_metadata.usage = { cost_usd: 20.5 };
  assert.equal(assess(s, NOW).cost, 20.5);
  assert.ok(assess(s, NOW).flags.some((x) => /cost \$20\.50 > cap \$15/.test(x)));
  assert.equal(assess({ ...s, cost_usd: 3 }, NOW).cost, 3);
});
