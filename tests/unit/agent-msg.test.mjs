// agent-msg — central cross-agent messaging CLI (tools/ci/agent-msg.mjs).
// Payload shape, --to alias→bus address, arg parsing, auth redaction, missing-env
// fallback (warn + bus still posted), --dry-run (no network / no bus), and webhook
// POST via injected fetch. No network. Under 0.2 s.
// Run: node --test tests/unit/agent-msg.test.mjs   (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import {
  MSG_TYPES, busTypeFor, busTextFor, buildPayload, resolveBusTo, redactSecrets, parseArgs, postWebhook, main,
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
  assert.match(errs.join("\n"), /READY refused: .*plan-open/);
  assert.deepEqual([bus.length, calls.length], [0, 0], "nothing sent");
  assert.equal(await main(argv, deps({ ok: true })), 0);
  assert.deepEqual([bus.length, calls.length], [1, 1]);
});
