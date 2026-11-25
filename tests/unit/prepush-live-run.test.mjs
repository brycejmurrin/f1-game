// prepush-live-run — the warn-only pre-push notice (#6557 P5): a READY PR whose ci.yml run on the replaced head is
// still running. Pure fixtures and a stub API: no network, and every path is a notice or silence, never a failure.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { liveRunNotice, lookup, LIVE_STATES } from "../../tools/ci/prepush-live-run.mjs";

const SHA = "a".repeat(40), OTHER = "b".repeat(40);
const run = (over) => ({ id: 1, head_sha: SHA, event: "pull_request", status: "in_progress", html_url: "https://x/runs/1", ...over });
const READY = { number: 42, draft: false };

test("a ready PR with a live pull_request run on the replaced head gets the notice", () => {
  const n = liveRunNotice({ pr: READY, runs: [run()], sha: SHA });
  assert.equal(/NOTICE — PR #42 is READY/.test(n) && /in_progress https:\/\/x\/runs\/1/.test(n) && /push goes ahead/.test(n), true, n);
  for (const status of LIVE_STATES) assert.notEqual(liveRunNotice({ pr: READY, runs: [run({ status })], sha: SHA }), null, status);
});

test("silence: a draft, no PR, a finished run, another sha, or a non-PR event", () => {
  assert.equal(liveRunNotice({ pr: { ...READY, draft: true }, runs: [run()], sha: SHA }), null);
  assert.equal(liveRunNotice({ pr: null, runs: [run()], sha: SHA }), null);
  assert.equal(liveRunNotice({ pr: READY, runs: [run({ status: "completed" })], sha: SHA }), null);
  assert.equal(liveRunNotice({ pr: READY, runs: [run({ head_sha: OTHER })], sha: SHA }), null);
  assert.equal(liveRunNotice({ pr: READY, runs: [run({ event: "workflow_dispatch" })], sha: SHA }), null);
  assert.equal(liveRunNotice({ pr: READY, runs: [], sha: SHA }), null);
});

test("lookup: asks for the branch's open PR, then ci.yml runs on the sha; an API error is silence", () => {
  const asked = [];
  const get = (p) => {
    asked.push(p);
    if (p.startsWith("pulls?")) return { json: [READY] };
    return { json: { workflow_runs: [run()] } };
  };
  assert.notEqual(lookup("claude/x", SHA, { get }), null);
  assert.equal(asked[0].includes(encodeURIComponent("brycejmurrin:claude/x")) && asked[1].includes(`head_sha=${SHA}`), true, asked.join(" "));
  assert.equal(lookup("claude/x", SHA, { get: () => ({ error: "no token" }) }), null);
  assert.equal(lookup("claude/x", SHA, { get: (p) => (p.startsWith("pulls?") ? { json: [READY] } : { error: "500" }) }), null);
  let calls = 0;
  assert.equal(lookup("claude/x", SHA, { get: () => { calls++; return { json: [{ ...READY, draft: true }] }; } }), null);
  assert.equal(calls, 1, "a draft PR needs no runs lookup");
});

test("the CLI exits 0 and prints nothing when skipped or given a bad sha", () => {
  const tool = path.resolve("tools/ci/prepush-live-run.mjs");
  for (const [args, env] of [[["--branch", "x", "--sha", SHA], { APEX_PREPUSH_NOTICE: "0" }], [["--branch", "x", "--sha", "nope"], {}], [[], {}]]) {
    const r = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(r.status === 0 && r.stdout === "" && r.stderr === "", true, `${args.join(" ")}: ${r.status} ${r.stderr}`);
  }
});
