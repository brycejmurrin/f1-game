import test from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../tools/ci/actions/api.mjs";

const NOW = 1_800_000_000_000;
const reply = (status, json, headers = {}, exit = status >= 400 ? 1 : 0) => ({ status: exit, stdout: `HTTP/2.0 ${status} Response\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join("")}\r\n${json === undefined ? "" : JSON.stringify(json)}`, stderr: "" });

test("API preserves response diagnostics and keeps token/body out of argv", () => {
  let call;
  const api = createApi({ repo: "o/r", now: NOW, env: { GH_TOKEN: "secret" }, run: (...args) => { call = args; return reply(201, { id: 1 }, { "X-GitHub-Request-Id": "req" }); } });
  const response = api("issues", { method: "POST", body: { title: "private text" } });
  assert.equal(response.status, 201); assert.equal(response.requestId, "req");
  assert.ok(call[1].includes("repos/o/r/issues"));
  assert.ok(!call[1].join(" ").includes("secret")); assert.ok(!call[1].join(" ").includes("private text"));
  assert.deepEqual(JSON.parse(call[2].input), { title: "private text" });
  assert.equal(call[2].maxBuffer, 128 << 20, "bounded buffer includes base64 overhead for a 64 MiB state blob");
});

test("permission 403 differs from primary and secondary limits without retrying or sleeping", () => {
  for (const [response, type, blocked] of [
    [reply(403, { message: "Resource not accessible by integration" }), "permission", false],
    [reply(403, { message: "API rate limit exceeded for installation" }, { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(NOW / 1000 + 120) }), "primary-rate-limit", true],
    [reply(403, { message: "You have exceeded a secondary rate limit" }, { "Retry-After": "90" }), "secondary-rate-limit", true],
    [reply(429, { message: "Slow down" }, { "Retry-After": "120" }), "secondary-rate-limit", true],
  ]) {
    let calls = 0; const cooldown = {};
    const api = createApi({ now: NOW, cooldown, run: () => { calls++; return response; } });
    assert.equal(api("issues").errorType, type); assert.equal(calls, 1);
    assert.equal(!!cooldown.notBefore, blocked);
    if (blocked) { assert.equal(api("pulls").errorType, "cooldown"); assert.equal(calls, 1); }
  }
});

test("successful response reserves remaining server quota; only explicit store write bypasses cooldown", () => {
  let calls = 0; const cooldown = {};
  const api = createApi({ now: NOW, cooldown, run: () => { calls++; return reply(200, {}, { "X-RateLimit-Remaining": "10", "X-RateLimit-Reset": String(NOW / 1000 + 60) }); } });
  assert.equal(api("issues").status, 200);
  assert.equal(cooldown.reason, "quota-reserve");
  assert.equal(api("actions/workflows/x/dispatches", { method: "POST", storeWrite: true, bypassCooldown: true }).errorType, "cooldown");
  assert.equal(api("contents/state.json", { method: "PUT", body: {}, storeWrite: true }).errorType, "cooldown");
  assert.equal(api("contents/state.json", { method: "PUT", body: {}, storeWrite: true, bypassCooldown: true }).status, 200);
  assert.equal(calls, 2);
});

test("cycle budget is bounded and migration bypass must be explicit", () => {
  let calls = 0; const api = createApi({ maxRequests: 1, run: () => { calls++; return reply(200, {}); } });
  api("issues"); assert.equal(api("pulls").errorType, "budget");
  assert.equal(api("pulls", { bypassBudget: true }).status, 200);
  assert.equal(calls, 2); assert.equal(api.metrics.deferred, 1);
});

test("ETag 304 returns cached body and transient failure sets recoverable cooldown", () => {
  const seen = []; let time = NOW;
  const responses = [reply(200, { value: 1 }, { ETag: '"a"' }), reply(304), reply(502, { message: "gateway" }), reply(200, {})];
  const api = createApi({ now: () => time, run: (_cmd, args) => { seen.push(args); return responses.shift(); } });
  api("issues"); const reused = api("issues");
  assert.deepEqual(reused.json, { value: 1 }); assert.equal(reused.cached, true);
  assert.ok(seen[1].includes('If-None-Match: "a"'));
  assert.equal(api("pulls").errorType, "transient");
  assert.equal(api("pulls").errorType, "cooldown");
  time += 5001; assert.equal(api("pulls").status, 200);
});

test("transport, malformed response and off-host URL fail closed", () => {
  const api = createApi({ now: NOW, run: () => ({ status: 1, stdout: "", stderr: "sensitive diagnostics" }) });
  assert.equal(api("issues").errorType, "transport");
  assert.ok(!api("issues").error.includes("sensitive"));
  const malformed = createApi({ run: () => ({ status: 0, stdout: "HTTP/2.0 200 OK\n\nnot json" }) });
  assert.equal(malformed("issues").errorType, "invalid-json");
  assert.equal(createApi({ run: () => assert.fail("no network") })("https://other.test/path").errorType, "invalid-request");
});

test("only explicitly reserved canonical ledger reads bypass cooldown and normal cycle budget", () => {
  let calls = 0;
  const api = createApi({ now: NOW, maxRequests: 1, cooldown: { notBefore: NOW + 60_000 }, run: () => { calls++; return reply(200, {}); } });
  for (const endpoint of ["issues", "contents/secrets.json?ref=bot%2Factions-state", "contents/state.json?ref=main", "contents/state.json?ref=bot%2Factions-state&extra=true"]) {
    assert.equal(api(endpoint, { storeRead: true, bypassCooldown: true }).errorType, "cooldown");
  }
  assert.equal(calls, 0);
  const endpoint = "contents/state.json?ref=bot%2Factions-state";
  assert.equal(api(endpoint, { storeRead: true }).errorType, "cooldown");
  assert.equal(api(endpoint, { storeRead: true, bypassCooldown: true }).status, 200);
  assert.equal(api(endpoint, { storeRead: true, bypassCooldown: true }).status, 200, "reserved read can finish cooldown persistence after normal budget");
  assert.equal(calls, 2);
});

test("cooldown permits only the exact same-repo immutable blob learned from canonical large state Contents", () => {
  const sha = "a".repeat(40), other = "b".repeat(40), state = "contents/state.json?ref=bot%2Factions-state";
  let calls = 0;
  const api = createApi({ repo: "o/r", now: NOW, maxRequests: 1, cooldown: { notBefore: NOW + 60_000 }, run: (_cmd, args) => {
    calls++;
    return args.includes("repos/o/r/" + state) ? reply(200, { encoding: "none", sha }) : reply(200, { encoding: "base64", sha, content: "e30=" });
  } });
  const reserved = { storeRead: true, bypassCooldown: true };
  assert.equal(api(`git/blobs/${sha}`, reserved).errorType, "cooldown", "caller assertion alone grants nothing");
  assert.equal(api(state, reserved).status, 200);
  for (const endpoint of [`git/blobs/${other}`, `/repos/other/repo/git/blobs/${sha}`, `git/blobs/${sha}?ref=main`, `git/refs/${sha}`]) assert.equal(api(endpoint, reserved).errorType, "cooldown");
  assert.equal(api(`git/blobs/${sha}`, { bypassCooldown: true }).errorType, "cooldown", "explicit storeRead is still required");
  assert.equal(api(`git/blobs/${sha}`, reserved).status, 200);
  assert.equal(calls, 2);
  for (let i = 0; i < 9; i++) assert.equal(api(`git/blobs/${sha}`, reserved).status, 200);
  assert.equal(api(`git/blobs/${sha}`, reserved).errorType, "budget", "ten reserved calls remain a hard bound");
});

test("304 cached canonical Contents grants its exact blob; other branches and invalid SHAs grant none", () => {
  const sha = "c".repeat(40), state = "contents/state.json?ref=bot%2Factions-state", cache = new Map();
  cache.set(`repos/o/r/${state}`, { etag: '"state"', json: { encoding: "none", sha } });
  let calls = 0;
  const api = createApi({ repo: "o/r", now: NOW, etags: cache, cooldown: { notBefore: NOW + 60_000 }, run: () => ++calls === 1 ? reply(304) : reply(200, {}) });
  assert.equal(api(state, { storeRead: true, bypassCooldown: true }).cached, true);
  assert.equal(api(`git/blobs/${sha}`, { storeRead: true, bypassCooldown: true }).status, 200);
  for (const [endpoint, body] of [["contents/state.json?ref=main", { encoding: "none", sha }], [state, { encoding: "none", sha: "not-a-sha" }], [state, { encoding: "base64", sha }]]) {
    const reader = createApi({ repo: "o/r", now: NOW, run: () => reply(200, body) });
    reader(endpoint);
    reader.cooldown.notBefore = NOW + 60_000;
    assert.equal(reader(`git/blobs/${sha}`, { storeRead: true, bypassCooldown: true }).errorType, "cooldown");
  }
});
