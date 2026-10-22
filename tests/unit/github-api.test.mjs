// github-api — the shared GET-only GitHub REST helper (extracted from the retired ready-full-cap, #3013).
import test from "node:test";
import assert from "node:assert/strict";
import { api, RETRY_DELAYS_MS } from "../../tools/ci/github-api.mjs";

test("api() reads past spawnSync's 1 MB default (ENOBUFS on 100 open PRs, 2026-10-14)", () => {
  let opts;
  const run = (_c, _a, o) => { opts = o; return { status: 0, stdout: "{}\n200", stderr: "" }; };
  api("pulls", { run, env: { GH_TOKEN: "t" } });
  assert.ok(opts.maxBuffer >= 16 << 20, `maxBuffer ${opts.maxBuffer} — a page of PR JSON exceeds 1 MB`);
  const failed = api("pulls", { run: () => ({ status: null, stdout: "", stderr: "", error: { code: "ENOBUFS" } }), env: { GH_TOKEN: "t" } });
  assert.match(failed.error, /ENOBUFS/, "a spawn error is named, not reported as a bare curl failure");
});

test("api() retries a transient 502 then returns JSON (W18f — shared curl door had no backoff)", () => {
  let n = 0;
  const slept = [];
  const run = () => {
    n += 1;
    if (n === 1) return { status: 0, stdout: "Server Error\n502", stderr: "" };
    return { status: 0, stdout: "{\"ok\":true}\n200", stderr: "" };
  };
  const r = api("actions/runs/1/jobs", { run, env: { GH_TOKEN: "t" }, sleepSync: (ms) => slept.push(ms) });
  assert.deepEqual(r.json, { ok: true });
  assert.equal(n, 2);
  assert.deepEqual(slept, [RETRY_DELAYS_MS[0]]);
});

test("api() does not retry a permanent 404", () => {
  let n = 0;
  const slept = [];
  const run = () => { n += 1; return { status: 0, stdout: "missing\n404", stderr: "" }; };
  const r = api("nope", { run, env: { GH_TOKEN: "t" }, sleepSync: (ms) => slept.push(ms) });
  assert.match(r.error, /HTTP 404/);
  assert.equal(n, 1);
  assert.deepEqual(slept, []);
});
