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
  assert.equal(r.error, "HTTP 404");
  assert.equal(n, 1);
  assert.deepEqual(slept, []);
});

// 2026-10-26: one client for every tool (docs/notes/TOOLING-CONSOLIDATION-2026-10-26.md).
import { request, urlFor, ETAG_CACHE_MAX } from "../../tools/ci/github-api.mjs";

test("api() with an ETag store sends If-None-Match and reuses the body on a 304; without one it never does", () => {
  const etags = new Map(), seen = [];
  const reply = (stdout) => (_c, args) => { seen.push(args); return { status: 0, stdout }; };
  const env = { GH_TOKEN: "t" };
  assert.deepEqual(api("pulls/1", { env, etags, run: reply('{"n":1}\n200 W/"e1"') }), { json: { n: 1 } });
  assert.deepEqual(api("pulls/1", { env, etags, run: reply('\n304 W/"e1"') }), { json: { n: 1 }, cached: true });
  assert.ok(seen[1].includes('If-None-Match: W/"e1"'));
  api("pulls/1", { env, run: reply('{"n":1}\n200 W/"e1"') });
  assert.ok(!seen[2].some((a) => /^If-None-Match/.test(a)), "no store, no conditional GET");
  const small = new Map();
  for (const n of [1, 2, 3]) api(`x/${n}`, { env, etags: small, etagMax: 2, run: reply(`{}\n200 "e${n}"`) });
  assert.deepEqual([...small.keys()].map((u) => u.split("/").pop()), ["2", "3"], "the store is bounded, oldest out");
  assert.ok(ETAG_CACHE_MAX >= 100);
});

test("request(): a JSON body and the token ride curl's stdin config, never argv; a 4xx keeps its status", () => {
  let seen;
  const run = (_c, args, opts) => { seen = { args, opts }; return { status: 0, stdout: '{"message":"Validation Failed"}\n422' }; };
  const r = request("pulls/5", { method: "PATCH", body: { body: "line \"one\"\nline two" }, token: "SECRET", run });
  assert.equal(r.status, 422);
  assert.equal(r.json.message, "Validation Failed");
  assert.ok(seen.args.includes("-X") && seen.args.includes("PATCH"));
  assert.ok(!seen.args.some((a) => a.includes("SECRET") || a.includes("line two")), "token and payload off argv");
  const sent = JSON.parse(JSON.parse(/^data-binary = (".*")$/m.exec(seen.opts.input)[1]));
  assert.deepEqual(sent, { body: "line \"one\"\nline two" });
  assert.equal(api("pulls/5", { method: "PATCH", body: {}, token: "SECRET", run }).error, "HTTP 422");
});

test("request(): full URLs pass through, anonymous GETs carry no -K, follow adds -L", () => {
  assert.equal(urlFor("https://example.test/x"), "https://example.test/x");
  assert.equal(urlFor("pulls"), "https://api.github.com/repos/brycejmurrin/f1-game/pulls");
  let seen;
  const run = (_c, args, opts) => { seen = { args, opts }; return { status: 0, stdout: "plain log\n200" }; };
  const anon = request("actions/runs", { token: null, anonymous: true, run });
  assert.ok(!seen.args.includes("-K") && seen.opts.input === undefined);
  assert.equal(anon.badJson, true, "a text body is reported, not thrown");
  assert.equal(request("actions/runs", { token: null, run, env: {}, gh: () => null }).error.includes("GH_TOKEN"), true);
  request("actions/jobs/1/logs", { token: "t", follow: true, run });
  assert.ok(seen.args.includes("-L"));
});

test("request(): a 429 is retried like a 5xx", () => {
  const replies = ["{}\n429", '{"ok":1}\n200'];
  const slept = [];
  const r = api("x", { env: { GH_TOKEN: "t" }, sleepSync: (ms) => slept.push(ms), run: () => ({ status: 0, stdout: replies.shift() }) });
  assert.deepEqual(r, { json: { ok: 1 } });
  assert.equal(slept.length, 1);
});

test("request(): a 429's Retry-After is honoured up to MAX_RETRY_AFTER_S, and a longer one is returned at once", async () => {
  const { MAX_RETRY_AFTER_S } = await import("../../tools/ci/github-api.mjs");
  const slept = [];
  const replies = ["{}\n429  3", '{"ok":1}\n200 "e"'];
  assert.deepEqual(api("x", { env: { GH_TOKEN: "t" }, sleepSync: (ms) => slept.push(ms), run: () => ({ status: 0, stdout: replies.shift() }) }), { json: { ok: 1 } });
  assert.deepEqual(slept, [3000], "Retry-After seconds, not the backoff list");
  let calls = 0;
  const long = request("x", { token: "t", sleepSync: () => { throw new Error("must not sleep"); }, run: () => (calls++, { status: 0, stdout: `{}\n429 "e" ${MAX_RETRY_AFTER_S + 50}` }) });
  assert.equal(long.status, 429); assert.equal(long.retryAfter, MAX_RETRY_AFTER_S + 50); assert.equal(calls, 1);
});
