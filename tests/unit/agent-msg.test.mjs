// agent-msg — central cross-agent messaging CLI (tools/ci/agent-msg.mjs).
// Payload shape, --to alias→bus address, arg parsing, auth redaction, missing-env
// fallback (warn + bus still posted), --dry-run (no network / no bus), and webhook
// POST via injected fetch. No network. Under 0.2 s.
// Run: node --test tests/unit/agent-msg.test.mjs   (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import {
  MSG_TYPES, busTypeFor, busTextFor, buildPayload, resolveBusTo, redactSecrets, parseArgs, postWebhook, main,
  relayEnvNames, relayRoute, relayTextFor, relayBackoff, fireRelay,
} from "../../tools/ci/agent-msg.mjs";
import { TYPES, formatLine, parseLine } from "../../tools/ci/fleet-bus.mjs";

const ME = "cursor:bc-agent-msg-test-0ff0";

test("busTypeFor: INFO/QUESTION/REQUEST → HANDOFF; READY/HANDOFF/INCIDENT keep type", () => {
  assert.equal(busTypeFor("INFO"), "HANDOFF");
  assert.equal(busTypeFor("QUESTION"), "HANDOFF");
  assert.equal(busTypeFor("REQUEST"), "HANDOFF");
  assert.equal(busTypeFor("READY"), "READY");
  assert.equal(busTypeFor("HANDOFF"), "HANDOFF");
  assert.equal(busTypeFor("INCIDENT"), "INCIDENT");
  for (const t of ["READY", "HANDOFF", "INCIDENT"]) assert.ok(TYPES.includes(t), t);
  assert.ok(TYPES.includes(busTypeFor("INFO")));
});

test("busTextFor prefixes mapped types and optional #pr", () => {
  assert.equal(busTextFor("INFO", "hello"), "[INFO] hello");
  assert.equal(busTextFor("QUESTION", "need sync?", 12), "#12 [QUESTION] need sync?");
  assert.equal(busTextFor("READY", "abc ready-gate 0", 3499), "#3499 abc ready-gate 0");
});

test("buildPayload: shape, pr null vs number, whitespace collapsed in text", () => {
  const p = buildPayload({
    from: ME, to: "DAD", type: "READY", pr: 3499, text: "  abc\nready  ",
    sha: "deadbeef", ts: "2026-10-22T07:00:00.000Z",
  });
  assert.deepEqual(p, {
    from: ME, to: "DAD", type: "READY", pr: 3499, text: "abc ready",
    sha: "deadbeef", ts: "2026-10-22T07:00:00.000Z",
  });
  assert.equal(buildPayload({ from: ME, to: "A", type: "INFO", text: "x" }).pr, null);
  assert.equal(buildPayload({ from: ME, to: "A", type: "INFO", pr: "", text: "x" }).pr, null);
});

test("resolveBusTo: all→*, DAD→D, Apex Merge Queue→merge-desk; letters pass through", () => {
  assert.equal(resolveBusTo("all"), "*");
  assert.equal(resolveBusTo("ALL"), "*");
  assert.equal(resolveBusTo("*"), "*");
  assert.equal(resolveBusTo("DAD"), "D");
  assert.equal(resolveBusTo("dad"), "D");
  assert.equal(resolveBusTo("Apex Merge Queue"), "merge-desk");
  assert.equal(resolveBusTo("Tools Explorer"), "tools");
  assert.equal(resolveBusTo("Profiler"), "tools");
  assert.equal(resolveBusTo("A"), "A");
  assert.equal(resolveBusTo("B·O3"), "B·O3");
  assert.equal(resolveBusTo("orchestrator"), "orchestrator");
  assert.equal(resolveBusTo("#3499"), "#3499");
});

test("redactSecrets never leaves the auth value or URL userinfo in output", () => {
  const env = {
    APEX_AGENT_WEBHOOK_AUTH: "Bearer super-secret-token-xyz",
    APEX_AGENT_WEBHOOK_URL: "https://user:passw0rd@hooks.example/agent",
  };
  const raw = "fail Authorization: Bearer super-secret-token-xyz at https://user:passw0rd@hooks.example/agent";
  const out = redactSecrets(raw, env);
  assert.equal(out.includes("super-secret-token-xyz"), false);
  assert.equal(out.includes("passw0rd"), false);
  assert.equal(out.includes("Bearer super-secret"), false);
  assert.ok(out.includes("[REDACTED]"), "auth scrubbed");
  assert.ok(out.includes("[WEBHOOK_URL]"), "url scrubbed");
});

test("parseArgs: send flags, type uppercased, --pr, --no-bus, --dry-run; refuses junk", () => {
  assert.deepEqual(parseArgs(["send", "--to", "DAD", "--type", "ready", "--pr", "12", "hello world"]), {
    cmd: "send", to: "DAD", type: "READY", pr: 12, text: "hello world", noBus: false, dryRun: false, as: "",
  });
  assert.equal(parseArgs(["send", "--to", "A", "--type", "INFO", "--no-bus", "--dry-run", "x"]).noBus, true);
  assert.equal(parseArgs(["send", "--to", "A", "--type", "INFO", "--dry-run", "x"]).dryRun, true);
  assert.throws(() => parseArgs(["send", "--to", "A", "no type"]), /--type/);
  assert.throws(() => parseArgs(["send", "--type", "INFO", "no to"]), /--to/);
  assert.throws(() => parseArgs(["send", "--to", "A", "--type", "PING", "x"]), /unknown type/);
  assert.throws(() => parseArgs(["send", "--to", "A", "--type", "READY", "--pr", "x", "t"]), /--pr/);
  assert.throws(() => parseArgs(["send", "--to", "A", "--type", "READY"]), /text argument/);
  assert.doesNotThrow(() => parseArgs(["send", "--to", "A", "--type", "READY", "--dry-run"]));
});

test("postWebhook: posts JSON with Authorization; inject fetch (no network)", async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 204, text: async () => "" };
  };
  const payload = buildPayload({ from: ME, to: "A", type: "INFO", text: "hi", sha: "abc", ts: "t" });
  const r = await postWebhook("https://hooks.example/x", "Bearer tok", payload, { fetchFn });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://hooks.example/x");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.equal(calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), payload);
  const miss = await postWebhook("", "tok", payload, { fetchFn });
  assert.equal(miss.ok, false);
  assert.equal(calls.length, 1, "missing env never fetches");
});

test("main --dry-run prints payload (no auth) and neither posts nor buses", async () => {
  const out = [], errs = [], bus = [];
  const fetchFn = async () => { throw new Error("fetch must not run"); };
  const code = await main(
    ["send", "--to", "DAD", "--type", "QUESTION", "--pr", "7", "--dry-run", "need sync?"],
    {
      env: { APEX_FLEET_AS: ME, APEX_AGENT_WEBHOOK_URL: "https://h", APEX_AGENT_WEBHOOK_AUTH: "secret" },
      fetchFn,
      sendBus: (...a) => { bus.push(a); return { ok: true, sha: "abc" }; },
      log: (l) => out.push(l),
      err: (l) => errs.push(l),
      headShaFn: () => "sha1sha1sha1",
      now: () => "2026-10-22T00:00:00.000Z",
    },
  );
  assert.equal(code, 0);
  assert.equal(bus.length, 0);
  const payload = JSON.parse(out.join("\n"));
  assert.equal(payload.to, "DAD");
  assert.equal(payload.type, "QUESTION");
  assert.equal(payload.pr, 7);
  assert.equal(payload.from, ME);
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});

test("main: missing webhook env warns, still mirrors to bus, exits 0", async () => {
  const errs = [], bus = [];
  const code = await main(
    ["send", "--to", "all", "--type", "INFO", "hello fleets"],
    {
      env: { APEX_FLEET_AS: ME },
      fetchFn: async () => { throw new Error("no fetch"); },
      sendBus: (type, to, from, text) => {
        bus.push({ type, to, from, text });
        return { ok: true, sha: "abc1234", line: formatLine(type, to, from, text) };
      },
      log: () => {},
      err: (l) => errs.push(l),
      headShaFn: () => "deadbeef",
      now: () => "t",
    },
  );
  assert.equal(code, 0);
  assert.equal(bus.length, 1);
  assert.deepEqual(bus[0], { type: "HANDOFF", to: "*", from: ME, text: "[INFO] hello fleets" });
  assert.ok(errs.join("\n").includes("APEX_AGENT_WEBHOOK"), "warns about missing env");
  assert.equal(errs.join("\n").includes("Bearer"), false);
});

test("main: webhook + bus; --pr prefixes bus text; --no-bus skips bus; DAD→D on bus only", async () => {
  const bus = [], calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return { ok: true, status: 200, text: async () => "ok" };
  };
  const code = await main(
    ["send", "--to", "DAD", "--type", "READY", "--pr", "3499", "abc ready-gate 0"],
    {
      env: {
        APEX_FLEET_AS: ME,
        APEX_AGENT_WEBHOOK_URL: "https://hooks.example/agent",
        APEX_AGENT_WEBHOOK_AUTH: "Bearer keep-secret",
      },
      fetchFn,
      sendBus: (type, to, from, text) => {
        bus.push({ type, to, from, text });
        return { ok: true, sha: "fff", line: `${type} to:${to} from:${from} ${text}` };
      },
      log: () => {},
      err: () => {},
      headShaFn: () => "sha",
      now: () => "ts",
      readyCheck: () => ({ ok: true }),
    },
  );
  assert.equal(code, 0);
  assert.equal(calls[0].body.to, "DAD", "webhook keeps the raw --to");
  assert.equal(calls[0].body.pr, 3499);
  assert.equal(calls[0].auth, "Bearer keep-secret");
  assert.deepEqual(bus[0], { type: "READY", to: "D", from: ME, text: "#3499 abc ready-gate 0" });

  bus.length = 0;
  calls.length = 0;
  const code2 = await main(
    ["send", "--to", "A", "--type", "REQUEST", "--no-bus", "review please"],
    {
      env: {
        APEX_FLEET_AS: ME,
        APEX_AGENT_WEBHOOK_URL: "https://hooks.example/agent",
        APEX_AGENT_WEBHOOK_AUTH: "Bearer keep-secret",
      },
      fetchFn,
      sendBus: (...a) => { bus.push(a); return { ok: true }; },
      log: () => {},
      err: () => {},
      headShaFn: () => "sha",
      now: () => "ts",
    },
  );
  assert.equal(code2, 0);
  assert.equal(bus.length, 0);
  assert.equal(calls.length, 1);
});

test("main: webhook error redacts auth; bus line round-trips through fleet-bus parsers", async () => {
  const errs = [];
  const secret = "Bearer leak-me-now";
  const code = await main(
    ["send", "--to", "A", "--type", "INCIDENT", "runner down"],
    {
      env: {
        APEX_FLEET_AS: ME,
        APEX_AGENT_WEBHOOK_URL: "https://hooks.example/agent",
        APEX_AGENT_WEBHOOK_AUTH: secret,
      },
      fetchFn: async () => { throw new Error(`connect failed auth=${secret}`); },
      sendBus: (type, to, from, text) => {
        const line = formatLine(type, to, from, text);
        assert.deepEqual(parseLine(line), { type, to, from, text });
        return { ok: true, sha: "1", line };
      },
      log: () => {},
      err: (l) => errs.push(l),
      headShaFn: () => "sha",
      now: () => "ts",
    },
  );
  assert.equal(code, 1);
  assert.equal(errs.join("\n").includes("leak-me-now"), false);
  assert.ok(errs.join("\n").includes("[REDACTED]"), "auth redacted in webhook error");
});

test("main: a READY whose ready-gate receipt is missing or refused is not sent", async () => {
  const errs = [], bus = [], calls = [];
  const deps = (verdict) => ({
    env: { APEX_FLEET_AS: ME, APEX_AGENT_WEBHOOK_URL: "https://hooks.example/agent", APEX_AGENT_WEBHOOK_AUTH: "Bearer x" },
    fetchFn: async () => { calls.push(1); return { ok: true, status: 200, text: async () => "ok" }; },
    sendBus: (type) => { bus.push(type); return { ok: true, sha: "f", line: type }; },
    log: () => {}, err: (l) => errs.push(l), headShaFn: () => "sha", now: () => "ts",
    readyCheck: (_root, args) => { assert.equal(args.pr, 12); return verdict; },
  });
  const argv = ["send", "--to", "A", "--type", "READY", "--pr", "12", "abc1234 ready-gate 0"];
  assert.equal(await main(argv, deps({ ok: false, why: "the last ready-gate run on #12 refused (plan-open)" })), 1);
  assert.ok(errs.join("\n").includes("READY refused: ") && errs.join("\n").includes("plan-open"), errs.join("\n"));
  assert.deepEqual([bus.length, calls.length], [0, 0], "nothing sent");
  assert.equal(await main(argv, deps({ ok: true })), 0);
  assert.deepEqual([bus.length, calls.length], [1, 1]);
});

// ── Cross-account relay: --to <L> with APEX_<L>_RELAY_URL/TOKEN (audit 2026-10-26 rows 3, 11) ──
const RELAY_URL = "https://api.example/v1/claude_code/routines/trig_x/fire";
const RELAY_TOKEN = "sk-ant-oat01-relay-secret-value";
const relayEnv = { APEX_FLEET_AS: ME, APEX_A_RELAY_URL: RELAY_URL, APEX_A_RELAY_TOKEN: RELAY_TOKEN };
const resp = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  text: async () => JSON.stringify(body),
});

test("relayRoute: a letter with the canonical pair → relay; retired names refused; else webhook", () => {
  assert.deepEqual(relayEnvNames("a").url, "APEX_A_RELAY_URL");
  assert.equal(relayRoute("A", relayEnv).kind, "relay");
  assert.equal(relayRoute("a", relayEnv).letter, "A");
  assert.equal(relayRoute("A", { APEX_A_RELAY_URL: RELAY_URL }).kind, "webhook", "half a pair is not a route");
  assert.equal(relayRoute("DAD", relayEnv).kind, "webhook");
  assert.equal(relayRoute("B", relayEnv).kind, "webhook");
  const old = relayRoute("A", { APEX_A_INBOX_URL: "x", FLEET_A_INBOX_TOKEN: "y" });
  assert.equal(old.kind, "retired");
  assert.deepEqual(old.legacy, ["APEX_A_INBOX_URL", "FLEET_A_INBOX_TOKEN"]);
});

test("relayBackoff: 429 honours Retry-After up to the cap; 5xx exponential; other 4xx never; bounded", () => {
  assert.equal(relayBackoff(429, 1, "30"), 30);
  assert.equal(relayBackoff(429, 1, "3600"), null, "a reset past the cap stops");
  assert.equal(relayBackoff(429, 1, null), 2);
  assert.equal(relayBackoff(503, 1), 2);
  assert.equal(relayBackoff(500, 2), 4);
  assert.equal(relayBackoff(500, 3), null, "bounded");
  for (const s of [400, 401, 403, 404]) assert.equal(relayBackoff(s, 1, "1"), null, String(s));
});

test("fireRelay: one POST with the documented headers; returns request id and session id", async () => {
  const calls = [];
  const r = await fireRelay(RELAY_URL, RELAY_TOKEN, "INFO from:me hi", {
    fetchFn: async (url, init) => { calls.push({ url, init }); return resp(200, { type: "routine_fire", claude_code_session_id: "session_9" }, { "request-id": "req_1" }); },
    sleep: async () => { throw new Error("no sleep on success"); },
  });
  assert.deepEqual([r.ok, r.status, r.requestId, r.sessionId, r.tries], [true, 200, "req_1", "session_9", 1]);
  assert.equal(calls.length, 1);
  const h = calls[0].init.headers;
  assert.equal(h.Authorization, `Bearer ${RELAY_TOKEN}`);
  assert.ok(h["anthropic-version"]);
  assert.equal(h["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: "INFO from:me hi" });
  assert.equal((await fireRelay("http://plain", RELAY_TOKEN, "x", { fetchFn: async () => { throw new Error("no"); } })).ok, false);
});

test("fireRelay: stops on 4xx at once; retries 429/5xx at most twice; never retries a network error", async () => {
  let n = 0;
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  const r400 = await fireRelay(RELAY_URL, RELAY_TOKEN, "x", {
    fetchFn: async () => { n++; return resp(400, { type: "error", error: { type: "invalid_request_error", message: "routine_paused" } }, { "request-id": "req_p" }); }, sleep,
  });
  assert.deepEqual([r400.ok, r400.tries, n, waits.length, r400.requestId], [false, 1, 1, 0, "req_p"]);
  assert.equal(r400.error, "HTTP 400 invalid_request_error: routine_paused");

  n = 0;
  const r429 = await fireRelay(RELAY_URL, RELAY_TOKEN, "x", {
    fetchFn: async () => { n++; return n < 3 ? resp(429, {}, { "retry-after": "5" }) : resp(200, {}); }, sleep,
  });
  assert.deepEqual([r429.ok, r429.tries, waits], [true, 3, [5000, 5000]]);

  n = 0; waits.length = 0;
  const r503 = await fireRelay(RELAY_URL, RELAY_TOKEN, "x", { fetchFn: async () => { n++; return resp(503); }, sleep });
  assert.deepEqual([r503.ok, n, waits], [false, 3, [2000, 4000]], "1 + 2 retries, then stop");

  n = 0;
  const rNet = await fireRelay(RELAY_URL, RELAY_TOKEN, "x", { fetchFn: async () => { n++; throw new Error("reset"); }, sleep });
  assert.deepEqual([rNet.ok, n], [false, 1]);
});

test("main --to A with the relay pair: fires once, mirrors to the bus, skips the webhook, never prints the token", async () => {
  const out = [], errs = [], bus = [], calls = [];
  const code = await main(["send", "--to", "A", "--type", "INFO", "--pr", "12", "slot free"], {
    env: { ...relayEnv, APEX_AGENT_WEBHOOK_URL: "https://hooks.example/agent", APEX_AGENT_WEBHOOK_AUTH: "Bearer w" },
    fetchFn: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return resp(200, { claude_code_session_id: "session_7" }, { "request-id": "req_9" }); },
    sendBus: (type, to, from, text) => { bus.push({ type, to, text }); return { ok: true, sha: "1" }; },
    log: (l) => out.push(l), err: (l) => errs.push(l), headShaFn: () => "sha", now: () => "ts",
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RELAY_URL, "relay, not the webhook");
  assert.equal(calls[0].body.text, `INFO from:${ME} #12 slot free`);
  assert.deepEqual(bus, [{ type: "HANDOFF", to: "A", text: "#12 [INFO] slot free" }]);
  const all = out.concat(errs).join("\n");
  assert.ok(all.includes("request-id req_9"), all);
  assert.equal(all.includes(RELAY_TOKEN), false);
  assert.equal(all.includes(RELAY_URL), false);
});

test("main --to A: a relay 401 exits 1 once with the error redacted; retired names exit 1 naming the pair", async () => {
  const errs = [];
  let n = 0;
  const code = await main(["send", "--to", "A", "--type", "INFO", "--no-bus", "x"], {
    env: relayEnv,
    fetchFn: async () => { n++; return resp(401, { type: "error", error: { type: "authentication_error", message: `bad ${RELAY_TOKEN}` } }); },
    sendBus: () => { throw new Error("no bus"); }, log: () => {}, err: (l) => errs.push(l), headShaFn: () => "s", now: () => "t",
    sleep: async () => { throw new Error("4xx never sleeps"); },
  });
  assert.deepEqual([code, n], [1, 1]);
  assert.equal(errs.join("\n").includes(RELAY_TOKEN), false);
  assert.ok(errs.join("\n").includes("[APEX_A_RELAY_TOKEN]"));

  errs.length = 0;
  const code2 = await main(["send", "--to", "A", "--type", "INFO", "x"], {
    env: { APEX_FLEET_AS: ME, APEX_A_INBOX_URL: "https://old", APEX_A_INBOX_TOKEN: "old-token-value" },
    fetchFn: async () => { throw new Error("must not fire"); },
    sendBus: () => { throw new Error("must not bus"); }, log: () => {}, err: (l) => errs.push(l), headShaFn: () => "s", now: () => "t",
  });
  assert.equal(code2, 1);
  assert.deepEqual(errs, ["agent-msg: retired env name(s) APEX_A_INBOX_URL, APEX_A_INBOX_TOKEN — the canonical pair is APEX_A_RELAY_URL + APEX_A_RELAY_TOKEN (Bryce renames them in the environment; references/communication.md)"]);
  assert.equal(errs.join("\n").includes("old-token-value"), false);
});

test("main --to A --dry-run with the relay pair names the route, fires nothing", async () => {
  const out = [];
  const code = await main(["send", "--to", "A", "--type", "INFO", "--dry-run", "x"], {
    env: relayEnv, fetchFn: async () => { throw new Error("no"); }, sendBus: () => { throw new Error("no"); },
    log: (l) => out.push(l), err: () => {}, headShaFn: () => "s", now: () => "t",
  });
  assert.equal(code, 0);
  assert.ok(out.join("\n").includes("would fire relay APEX_A_RELAY_URL"));
  assert.equal(out.join("\n").includes(RELAY_TOKEN), false);
  assert.equal(relayTextFor({ type: "READY", from: "x", pr: null, text: "t" }), "READY from:x t");
});
