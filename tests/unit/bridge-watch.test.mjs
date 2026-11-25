/* tools/bridge/watch.mjs (#6582 unit 10): the session-side phone-bridge watcher. Pins that it prints only NEW
   OWNER apex-result / hello replies, sends only GETs with the ETag, keeps the token out of every line and URL,
   and backs off from the rate-limit headers. Stubbed fetch and clock; no network. */
import test from "node:test";
import assert from "node:assert/strict";
import { parseResult, pickEvents, nextDelay, parseArgs, watch, FLOOR, LOW } from "../../tools/bridge/watch.mjs";

const TOKEN = "github_pat_SECRETSECRETSECRET";
const fence = (o) => "```apex-result\n" + JSON.stringify(o) + "\n```";
const hdrs = (o = {}) => ({ get: (n) => (n in o ? String(o[n]) : null) });
const C = (id, body, at = "2026-11-25T12:00:10Z", who = "OWNER") => ({ id, created_at: at, author_association: who, body });

test("parseResult reads one apex-result fence and refuses junk", () => {
  assert.deepEqual(parseResult(fence({ re: 5, ok: true })), { re: 5, ok: true });
  assert.equal(parseResult("```apex-cmd\n{\"cmd\":\"ping\"}\n```"), null);
  assert.equal(parseResult("```apex-result\nnot json\n```"), null);
  assert.equal(parseResult(null), null);
});

test("pickEvents: OWNER only, after since, each once, oldest first", () => {
  const state = { since: "2026-11-25T12:00:00Z", seen: new Set() };
  const list = [
    C(4, fence({ re: 3, cmd: "ping", ok: true }), "2026-11-25T12:00:20Z"),
    C(2, fence({ hello: true, facts: { sha: "abc1234", render: "tlx-webgpu" } })),
    C(3, fence({ re: 1, ok: true }), "2026-11-25T12:00:15Z", "NONE"), // a stranger's fake
    C(1, fence({ hello: true }), "2026-11-25T11:59:00Z"), // before since
    C(5, "```apex-cmd\n{}\n```"),
  ];
  const ev = pickEvents(list, state);
  assert.deepEqual(ev.map((e) => e.c.id), [2, 4]);
  assert.match(ev[0].line, /^hello id=2 .* sha=abc1234 render=tlx-webgpu$/);
  assert.match(ev[1].line, /^result id=4 re=3 cmd=ping ok=true /);
  assert.equal(pickEvents(list, state).length, 0, "seen ids never print twice");
});

test("nextDelay backs off from the rate-limit headers", () => {
  const now = 1_000_000;
  const base = { baseMs: 5000, now, errors: 0 };
  assert.deepEqual(nextDelay({ status: 200, headers: hdrs({ "x-ratelimit-remaining": 4000 }) }, base), { ms: 5000, why: null });
  assert.equal(nextDelay({ status: 200, headers: hdrs({ "x-ratelimit-remaining": LOW - 1 }) }, base).ms, 20000);
  const low = nextDelay({ status: 200, headers: hdrs({ "x-ratelimit-remaining": FLOOR - 1, "x-ratelimit-reset": now / 1000 + 120 }) }, base);
  assert.equal(low.ms, 121000);
  assert.match(low.why, /reset/);
  assert.equal(nextDelay({ status: 403, headers: hdrs({ "retry-after": 30 }) }, base).ms, 30000);
  assert.equal(nextDelay({ status: 429, headers: hdrs({ "x-ratelimit-remaining": 0, "x-ratelimit-reset": now / 1000 + 60 }) }, base).ms, 61000);
  assert.ok(nextDelay({ status: 403, headers: hdrs({ "x-ratelimit-remaining": 0, "x-ratelimit-reset": now / 1000 + 7200 }) }, base).ms <= 15 * 60_000, "capped");
  assert.equal(nextDelay(null, { ...base, errors: 3 }).ms, 40000);
  assert.equal(nextDelay(null, { ...base, errors: 9 }).ms, 60000);
});

test("parseArgs requires an issue and a clean repo", () => {
  assert.throws(() => parseArgs([]), /--issue/);
  assert.throws(() => parseArgs(["--issue", "5", "--repo", "a/b?x=1"]), /owner\/name/);
  assert.equal(parseArgs(["--issue", "7", "--every", "1"]).every, 2, "floor of 2 s");
});

test("watch: GETs only, ETag 304s, exits on the awaited reply, token never logged", async () => {
  const calls = [], lines = [];
  let t = Date.parse("2026-11-25T12:00:00Z");
  const pages = [
    { status: 200, headers: hdrs({ etag: '"e1"', "x-ratelimit-remaining": 4000 }), json: async () => [C(10, fence({ hello: true, facts: { sha: "f00" } }))] },
    { status: 304, headers: hdrs({ "x-ratelimit-remaining": 4000 }) },
    { status: 200, headers: hdrs({ etag: '"e2"', "x-ratelimit-remaining": 3999 }), json: async () => [C(10, fence({ hello: true })), C(12, fence({ re: 11, cmd: "frames", ok: true }), "2026-11-25T12:00:30Z")] },
  ];
  const io = {
    token: TOKEN,
    fetch: async (url, opts) => { calls.push({ url, opts }); return pages.shift(); },
    out: (s) => lines.push(s), err: (s) => lines.push(s),
    sleep: async (ms) => { t += ms; }, now: () => t, maxPolls: 10,
  };
  const why = await watch(parseArgs(["--issue", "6600", "--exit-on", "11"]), io);
  assert.equal(why, "exit-on");
  assert.equal(calls.length, 3);
  for (const c of calls) {
    assert.equal(c.opts.method, "GET", "never posts");
    assert.ok(!c.url.includes(TOKEN));
    assert.equal(c.opts.headers.Authorization, "Bearer " + TOKEN);
  }
  assert.equal(calls[0].opts.headers["If-None-Match"], undefined);
  assert.equal(calls[1].opts.headers["If-None-Match"], '"e1"');
  assert.match(calls[0].url, /\/repos\/brycejmurrin\/f1-game\/issues\/6600\/comments\?per_page=100&since=2026-11-25T12%3A00%3A00Z$/);
  assert.equal(lines.filter((l) => /^(hello|result) /.test(l)).length, 2, "hello once, then the result");
  assert.ok(lines.every((l) => !l.includes(TOKEN)));
});

test("watch stops on 401 and on its time budget", async () => {
  let t = 0;
  const base = { token: TOKEN, out() {}, err() {}, sleep: async (ms) => { t += ms; }, now: () => t };
  assert.equal(await watch(parseArgs(["--issue", "1"]), { ...base, fetch: async () => ({ status: 401, headers: hdrs() }) }), "auth");
  t = 0;
  const ok = async () => ({ status: 304, headers: hdrs({ "x-ratelimit-remaining": 4000 }) });
  assert.equal(await watch(parseArgs(["--issue", "1", "--minutes", "1"]), { ...base, fetch: ok }), "time");
});
