/* ApexBridge (js/agent/apex-bridge.js): the phone bridge over one GitHub issue answers only the repo OWNER's apex-cmd
   comments made after its own hello, only from its command and __apex allowlists (no eval, saves, career or net), and
   never sends without the device token. VM with a fake fetch; no network. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const SRC = fs.readFileSync(new URL("../../js/agent/apex-bridge.js", import.meta.url), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const HELLO_AT = "2026-10-30T20:00:00Z";

// A fake api.github.com issue thread: GET lists `thread`, POST appends a comment and echoes it.
function fakeGitHub(thread = []) {
  const calls = [];
  let etag = 0;
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const json = (status, body, headers = {}) => ({
      status, ok: status < 300, json: async () => body, headers: { get: (k) => headers[k.toLowerCase()] || null },
    });
    if (opts.headers.Authorization !== "Bearer tok") return json(401, {});
    if (opts.method === "POST") {
      const c = { id: 1000 + thread.length, created_at: thread.length ? "2026-10-30T20:00:09Z" : HELLO_AT,
        author_association: "OWNER", body: JSON.parse(opts.body).body };
      thread.push(c);
      etag++;
      return json(201, c);
    }
    if (opts.headers["If-None-Match"] === "e" + etag) return json(304, null);
    return json(200, thread.slice(), { etag: "e" + etag });
  };
  return { fetch, calls, thread, bump: () => etag++ };
}

function load({ search = "?apex=1&bridge=42", tok = "", apex = {}, gh = fakeGitHub() } = {}) {
  const store = new Map(tok ? [["apex26.bridgeToken", tok]] : []);
  const ctx = vm.createContext({
    window: { __apex: apex, devicePixelRatio: 3, innerWidth: 844, innerHeight: 390 },
    location: { search, href: "https://brycejmurrin.github.io/f1-game/" + search, reload() {} },
    navigator: { userAgent: "test", gpu: {} },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    performance: { now: () => 0 },
    setTimeout: () => 0, clearTimeout() {},
    fetch: gh.fetch,
    Log: { info() {} },
    Object, Array, JSON, Math, Number, String, Set, Promise, Error, Date, encodeURIComponent,
  });
  vm.runInContext(SRC, ctx, { filename: absSrc("js/agent/apex-bridge.js") });
  return { api: vm.runInContext("ApexBridge", ctx), gh, store };
}
const flush = () => new Promise((r) => setImmediate(r));
const cmd = (id, obj, extra = {}) => ({
  id, created_at: "2026-10-30T20:00:05Z", author_association: "OWNER", body: "go\n```apex-cmd\n" + JSON.stringify(obj) + "\n```", ...extra,
});

test("needs ?bridge=<issue> and a device token before touching the network", async () => {
  assert.equal(load({ search: "?apex=1" }).api.boot(), false);
  const noTok = load();
  await flush();
  assert.equal(noTok.gh.calls.length, 0);
  assert.equal(noTok.api.active(), false);
  assert.equal(noTok.api.issueOf("?bridge=7&apex=1"), 7);
  assert.equal(noTok.api.issueOf("?bridge=x"), 0);
});

test("with a token it posts one hello carrying the device facts", async () => {
  const b = load({ tok: "tok" });
  await flush();
  assert.equal(b.api.active(), true);
  const hello = b.gh.thread[0];
  assert.equal(hello.body.split("\n")[0], "```apex-result");
  const body = JSON.parse(hello.body.replace(/```apex-result\n|\n```/g, ""));
  assert.equal(body.hello, true);
  assert.equal(body.facts.gpu, true);
  assert.equal(b.gh.calls[0].url, "https://api.github.com/repos/brycejmurrin/f1-game/issues/42/comments");
});

test("pickCommands: owner only, after the cutoff, not seen, fenced JSON", () => {
  const { api } = load({ search: "" });
  const seen = new Set([3]);
  const picked = api.pickCommands([
    cmd(1, { cmd: "ping" }),
    cmd(2, { cmd: "ping" }, { author_association: "NONE" }),
    cmd(3, { cmd: "ping" }),
    cmd(4, { cmd: "ping" }, { created_at: "2026-10-30T19:59:59Z" }),
    { id: 5, created_at: "2026-10-30T20:00:06Z", author_association: "OWNER", body: "```apex-result\n{}\n```" },
    { id: 6, created_at: "2026-10-30T20:00:07Z", author_association: "OWNER", body: "```apex-cmd\n{not json\n```" },
  ], HELLO_AT, seen);
  assert.deepEqual(plain(picked.map((p) => p.id)), [1, 6]);
  assert.equal(picked[1].msg.cmd, null);
});

test("a poll runs the owner's command once and answers with its comment id", async () => {
  const gh = fakeGitHub();
  const b = load({ tok: "tok", gh, apex: { perf: (o) => ({ fps: 60, o }) } });
  await flush();
  gh.thread.push(cmd(77, { cmd: "call", args: { method: "perf", args: [1] } }));
  gh.thread.push(cmd(78, { cmd: "call", args: { method: "perf" } }, { author_association: "CONTRIBUTOR" }));
  gh.bump();
  assert.equal(await b.api.pollOnce(), 1);
  const reply = JSON.parse(gh.thread.at(-1).body.replace(/```apex-result\n|\n```/g, ""));
  assert.equal(reply.re, 77);
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.value, { fps: 60, o: 1 });
  // Unchanged thread: the conditional request comes back 304 and nothing reruns.
  assert.equal(await b.api.pollOnce(), 0);
  const last = gh.calls.at(-1);
  assert.ok(last.opts.headers["If-None-Match"]);
  assert.equal(new URL(last.url).searchParams.get("since"), HELLO_AT);
});

test("a token GitHub rejects never links", async () => {
  const b = load({ tok: "bad" });
  await flush();
  assert.equal(b.api.active(), false);
  assert.equal(b.gh.thread.length, 0);
});

test("saves, career and net hooks are not callable", async () => {
  const hit = [];
  const apex = {};
  for (const m of ["save", "settingsFile", "persistState", "careerReset", "lobbyHost", "netHostStart", "garageFile", "eval"])
    apex[m] = () => hit.push(m);
  const { api } = load({ search: "", apex });
  for (const m of Object.keys(apex)) {
    const r = await api.handle({ cmd: "call", args: { method: m } });
    assert.equal(r.ok, false, m);
    assert.equal(r.error, "method not allowed: " + m);
  }
  assert.deepEqual(hit, []);
  for (const m of api.CALL_OK) assert.equal(/^(career|lobby|net|save|garageFile|settingsFile|persist)/.test(m), false, m);
});

test("unknown commands and inherited keys are refused", async () => {
  const { api } = load({ search: "" });
  for (const c of ["eval", "constructor", "__proto__", "toString"]) assert.equal((await api.handle({ cmd: c })).ok, false, c);
});

test("oversized results are truncated under GitHub's comment limit", async () => {
  const { api } = load({ search: "", apex: { logs: () => "x".repeat(300000) } });
  const r = await api.handle({ cmd: "call", args: { method: "logs" } });
  assert.equal(r.ok, true);
  assert.equal(r.value, null);
  assert.ok(r.truncated > 65536);
  assert.equal(r.head.length, 2000);
});
