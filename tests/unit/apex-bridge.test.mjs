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

function load({ search = "?apex=1&bridge=42", tok = "", apex = {}, gh = fakeGitHub(), extra = {} } = {}) {
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
    ...extra,
  });
  vm.runInContext(SRC, ctx, { filename: absSrc("js/agent/apex-bridge.js") });
  return { api: vm.runInContext("ApexBridge", ctx), gh, store, ctx };
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
  assert.equal(new URL(last.url).searchParams.get("since"), "2026-10-30T20:00:05Z", "the window moved up to the newest comment read");
  assert.equal(await b.api.pollOnce(), 0, "the boundary command comes back (since is inclusive) and is not rerun");
  assert.equal(gh.thread.filter((c) => c.body.includes('"re":77')).length, 1, "answered exactly once");
});

// A thread like GitHub's: oldest first, `since` (inclusive, on updated_at) and per_page honoured.
function pagedGitHub() {
  const thread = [];
  const calls = [];
  let n = 0;
  const at = (s) => new Date(Date.parse(HELLO_AT) + s * 1000).toISOString().replace(".000Z", "Z");
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const json = (status, body) => ({ status, ok: status < 300, json: async () => body, headers: { get: () => null } });
    if (opts.method === "POST") {
      const c = { id: 5000 + thread.length, created_at: at(n), updated_at: at(n++), author_association: "OWNER", body: JSON.parse(opts.body).body };
      thread.push(c);
      return json(201, c);
    }
    const q = new URL(url).searchParams;
    const since = q.get("since");
    return json(200, thread.filter((c) => c.updated_at >= since).slice(0, +q.get("per_page")));
  };
  const add = (c) => { const t = at(n++); thread.push({ created_at: t, updated_at: t, author_association: "OWNER", ...c }); };
  return { fetch, calls, thread, add };
}

test("a command past the first page of 100 is served, and the poll window moves past what it read", async () => {
  const gh = pagedGitHub();
  const b = load({ tok: "tok", gh, apex: {} });
  await flush();
  for (let i = 0; i < 120; i++) gh.add({ id: 100 + i, body: "chatter " + i, author_association: "NONE" });
  gh.add({ id: 999, body: "```apex-cmd\n" + JSON.stringify({ cmd: "ping" }) + "\n```" });
  let served = 0;
  for (let i = 0; i < 4 && !served; i++) served += await b.api.pollOnce();
  assert.equal(served, 1, "the command on page 2 was never served");
  assert.equal(gh.thread.filter((c) => c.body.includes('"re":999')).length, 1);
  const polls = gh.calls.filter((c) => !c.opts.method || c.opts.method === "GET");
  const sinces = polls.map((c) => new URL(c.url).searchParams.get("since"));
  assert.equal(sinces[0], HELLO_AT);
  assert.ok(sinces[1] > HELLO_AT, `the second poll reads past the hello (${sinces[1]})`);
  const before = gh.calls.length;
  await b.api.pollOnce();
  const lastPage = gh.calls.at(-1);
  assert.equal(gh.calls.length, before + 1, "a quiet poll posts nothing");
  assert.ok(new URL(lastPage.url).searchParams.get("since") > sinces[1]);
});

test("a token GitHub rejects never links, and is forgotten so the box asks again", async () => {
  const b = load({ tok: "bad" });
  await flush();
  assert.equal(b.api.active(), false);
  assert.equal(b.gh.thread.length, 0);
  assert.equal(b.store.has("apex26.bridgeToken"), false);
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
  for (const m of ["careerMoney", "careerSlotDelete", "lobbyHost", "netStop", "save", "persistState", "settingsFile", "garageFile", "garageParts", "loadCarModel", "constructor", "__proto__", "hasOwnProperty", "Eval"])
    assert.equal(api.callAllowed(m), false, m);
  for (const m of ["info", "rollout", "pit", "tt", "weather", "garageTeam", "hud", "uiScale"]) assert.equal(api.callAllowed(m), true, m);
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

// A BenchRun stand-in: the real pathPrefs mapping, run() refusing a second start.
function fakeBench(plan = null) {
  const runs = [];
  return {
    runs, KEY: "apex26.benchRun", TESTS: [{ id: "quick", label: "QUICK PATHS", legs: [{}, {}] }],
    pathPrefs: (path, base) => (path ? { backend: "three", threePath: path === "webgl2" ? "1" : "0" } : base),
    run: (id) => { if (plan) return false; runs.push(id); return true; },
    stop: () => !!plan,
  };
}

test("path pins the BENCHMARK three.js path and reloads; AUTO clears the pin", async () => {
  const reloads = [];
  const b = load({ search: "", extra: { BenchRun: fakeBench(), setTimeout: (fn) => { reloads.push(fn); return 0; } } });
  const r = await b.api.handle({ cmd: "path", args: { to: "webgl2" } });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.value.pinned), { backend: "three", threePath: "1" });
  assert.equal(r.value.reloading, true);
  assert.equal(b.store.get("apex26.gfxBackend"), "three");
  assert.equal(b.store.get("apex26.tlxForceGL"), "1");
  assert.equal(reloads.length, 1);
  await b.api.handle({ cmd: "path", args: { to: "auto", reload: false } });
  assert.equal(b.store.has("apex26.tlxForceGL"), false);
  assert.equal(reloads.length, 1);
  const st = await b.api.handle({ cmd: "path" });
  assert.equal(st.value.backend, "three");
  assert.equal(st.value.threePath, null);
  assert.equal((await b.api.handle({ cmd: "path", args: { to: "vulkan" } })).error, "path.to must be one of webgpu, webgl2, auto");
});

// #5555 finding 5: LAZY_PERF lands at idle, so a command sent right after a reload used to answer
// "BenchRun unavailable". The perf commands ask the game's LazyBundles instance for the rig first.
test("#5555: bench, a path pin, gpuTest and recorder wait for the lazy perf rig instead of throwing", async () => {
  let asks = 0;
  const b = load({ search: "", extra: { LazyBundles: { create() {}, live: () => ({ ensurePerfRig }) } } });
  async function ensurePerfRig() {
    asks++;
    b.ctx.BenchRun = fakeBench();
    b.ctx.GpuTestRun = { status: () => "idle" };
    b.ctx.PhoneRecorder = { isOn: () => false };
    return true;
  }
  assert.deepEqual((await b.api.handle({ cmd: "bench", args: { op: "start", test: "quick" } })).value, { started: "quick" });
  assert.equal(asks, 1);
  assert.equal((await b.api.handle({ cmd: "gpuTest", args: { op: "status" } })).value, "idle");
  assert.equal((await b.api.handle({ cmd: "recorder", args: { op: "isOn" } })).value, false);
  assert.equal((await b.api.handle({ cmd: "path", args: { to: "webgl2", reload: false } })).ok, true);
  assert.equal(asks, 4, "each perf command asks; the instance memoises");
  await b.api.handle({ cmd: "ping" });
  assert.equal(asks, 4, "a non-perf command never pulls the rig");

  // The rig could not load: the command still answers what is missing, and a rejecting loader is not a crash.
  const dead = load({ search: "", extra: { LazyBundles: { create() {}, live: () => ({ ensurePerfRig: async () => { throw new Error("offline"); } }) } } });
  assert.equal((await dead.api.handle({ cmd: "bench", args: { op: "tests" } })).error, "BenchRun unavailable");
  // No instance yet (a harness, or before game.js made it): unchanged.
  assert.equal((await load({ search: "" }).api.handle({ cmd: "bench", args: { op: "tests" } })).error, "BenchRun unavailable");
});

test("bench starts a known BenchRun test and reads its plan back", async () => {
  const bench = fakeBench();
  const b = load({ search: "", extra: { BenchRun: bench } });
  assert.deepEqual((await b.api.handle({ cmd: "bench", args: { op: "start", test: "quick" } })).value, { started: "quick" });
  assert.deepEqual(bench.runs, ["quick"]);
  assert.equal((await b.api.handle({ cmd: "bench", args: { op: "start", test: "nope" } })).error, "unknown bench test: nope");
  b.store.set("apex26.benchRun", JSON.stringify({ test: "quick", state: "complete", i: 2, summary: { fps: 58 },
    legs: [{ label: "Lap WEBGPU", state: "done" }, { label: "Lap WEBGL2", state: "failed", reason: "x" }] }));
  const st = await b.api.handle({ cmd: "bench", args: { op: "status" } });
  assert.deepEqual(plain(st.value.legs[1]), { label: "Lap WEBGL2", state: "failed", reason: "x" });
  assert.deepEqual(plain((await b.api.handle({ cmd: "bench", args: { op: "result" } })).value.summary), { fps: 58 });
  assert.equal((await b.api.handle({ cmd: "bench", args: { op: "leg", i: 1 } })).value.reason, "x");
  assert.equal((await b.api.handle({ cmd: "bench", args: { op: "eval" } })).ok, false);
});

test("snap downscales the canvas and steps JPEG quality down under the reply cap", async () => {
  const drawn = [];
  const canvas = (id, w, h) => ({ id, width: w, height: h, hidden: false });
  const doc = {
    getElementById: (id) => (id === "game" ? canvas("game", 2532, 1170) : null),
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage: (src, x, y, w, h) => drawn.push([src.id, w, h]) }),
      // 0.6 → 90k chars, 0.5 → 75k, 0.4 → 60k, 0.3 → 45k: the first that fits is 0.3.
      toDataURL: (type, q) => "data:" + type + ";base64," + "A".repeat(Math.round(q * 150000)),
    }),
  };
  const b = load({ search: "", extra: { document: doc, requestAnimationFrame: (fn) => fn(0) } });
  const r = await b.api.handle({ cmd: "snap", args: { w: 320 } });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(drawn), [["game", 320, 148]]);
  assert.equal(r.value.q, 0.3);
  assert.equal(r.value.from, "game");
  assert.equal(r.value.chars, r.value.jpeg.length);
  const none = load({ search: "", extra: { document: { getElementById: () => null }, requestAnimationFrame: (fn) => fn(0) } });
  assert.equal((await none.api.handle({ cmd: "snap" })).error, "no rendered canvas");
});

test("display reads the CSS→device pixel ledger: zoom chain, viewport, canvas backing, build and SW caches", async () => {
  // html > body > #hud (zoom 1.5) > #hud-time (font 14px). #game is a sibling of #hud with a 3× backing.
  const node = (id, tag, parent, o = {}) => ({ id, tagName: tag, nodeType: 1, parentElement: parent, hidden: false,
    getAttribute: (k) => (o.attrs || {})[k] || null, getBoundingClientRect: () => ({ width: o.w || 0, height: o.h || 0 }), ...o });
  const html = node("", "HTML", null, { clientWidth: 852, clientHeight: 393 });
  const body = node("", "BODY", html);
  const hud = node("hud", "DIV", body, { clientWidth: 852, clientHeight: 393 });
  const time = node("hud-time", "SPAN", hud, { w: 40, h: 14 });
  const game = node("game", "CANVAS", body, { clientWidth: 852, clientHeight: 393, width: 1917, height: 884, w: 852, h: 393, attrs: { "data-engine": "three" } });
  const byId = { hud, "hud-time": time, game };
  const styles = new Map([[html, { zoom: "1", transform: "none", vars: { "--ui-scale": "1.5", "--vwz": "8.52px" } }],
    [body, { zoom: "1", transform: "none" }], [hud, { zoom: "1.5", transform: "none", fontSize: "16px" }],
    [time, { zoom: "1", transform: "none", fontSize: "14px" }], [game, { zoom: "1", transform: "none" }]]);
  const doc = { documentElement: html, getElementById: (id) => byId[id] || null,
    querySelector: (q) => (/apex-sha/.test(q) ? { content: "abc123" } : /apex-build/.test(q) ? { content: "25547" } : null) };
  const b = load({ search: "", apex: { renderScale: () => ({ scale: 0.75, tier: 2 }) }, extra: {
    document: doc,
    getComputedStyle: (e) => { const s = styles.get(e) || {}; return { ...s, getPropertyValue: (n) => (s.vars || {})[n] || "" }; },
    matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }),
    visualViewport: { scale: 1, width: 852, height: 393, offsetLeft: 0, offsetTop: 0 },
    screen: { width: 852, height: 393 },
    caches: { keys: async () => ["apex26-voice", "apex26-25547", "other"] },
  } });
  const r = await b.api.handle({ cmd: "display" });
  assert.equal(r.ok, true);
  const v = r.value;
  assert.equal(v.dpr, 3);
  assert.deepEqual(plain(v.client), [852, 393]);
  assert.deepEqual(plain(v.visualViewport), { scale: 1, w: 852, h: 393, x: 0, y: 0 });
  assert.deepEqual(plain(v.standalone), { nav: false, mq: true, fullscreen: false });
  assert.equal(v.vars.root["--ui-scale"], "1.5");
  assert.equal(v.vars.root["--hud-scale"], null);
  assert.deepEqual(plain(v.game.buffer), [1917, 884]);
  assert.equal(v.game.engine, "three");
  assert.equal(v.game.chain.zoomProduct, 1);
  assert.equal(v.hud.chain.zoomProduct, 1.5);
  assert.deepEqual(plain(v.hud.chain.steps), [{ el: "#hud", zoom: 1.5 }]);
  assert.equal(v.hud.time.fontSize, "14px");
  assert.equal(v.hud.time.chain.zoomProduct, 1.5);
  assert.equal(v.renderScale.scale, 0.75);
  assert.deepEqual(plain(v.build), { sha: "abc123", build: "25547", swCaches: ["apex26-voice", "apex26-25547"], sw: null });
  // No DOM at all (a VM, a very early call): every field degrades to null instead of throwing.
  const bare = await load({ search: "" }).api.handle({ cmd: "display" });
  assert.equal(bare.ok, true);
  assert.equal(bare.value.game, null);
  assert.equal(bare.value.hud, null);
});

test("batch runs steps in order, stops at the first failure, and keeps reload last", async () => {
  const calls = [];
  const apex = { race: (t) => calls.push("race " + t), go: () => calls.push("go") };
  const { api } = load({ search: "", apex });
  const r = await api.handle({ cmd: "batch", args: { steps: [
    { cmd: "call", args: { method: "race", args: ["monza"] } }, { cmd: "call", args: { method: "go" } }, { cmd: "ping" }] } });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.value.map((s) => [s.cmd, s.ok])), [["call", true], ["call", true], ["ping", true]]);
  assert.deepEqual(calls, ["race monza", "go"]);
  const bad = await api.handle({ cmd: "batch", args: { steps: [{ cmd: "call", args: { method: "save" } }, { cmd: "ping" }] } });
  assert.deepEqual(plain(bad.value.map((s) => s.ok)), [false]);
  const early = await api.handle({ cmd: "batch", args: { steps: [{ cmd: "reload" }, { cmd: "ping" }] } });
  assert.equal(early.value[0].error, "reload must be the last step");
  const nest = await api.handle({ cmd: "batch", args: { steps: [{ cmd: "batch", args: { steps: [] } }] } });
  assert.equal(nest.value[0].error, "batch cannot nest");
  assert.equal((await api.handle({ cmd: "batch", args: { steps: new Array(11).fill({ cmd: "ping" }) } })).ok, false);
});

test("tokenShape describes a pasted token without revealing it", () => {
  const { api } = load({ search: "" });
  assert.equal(api.tokenShape("github_pat_" + "a".repeat(82)), "93 chars, github_pat_ prefix, 0 odd chars");
  assert.equal(api.tokenShape("ghp_abc"), "7 chars, ghp_ prefix, 0 odd chars");
  assert.equal(api.tokenShape("github_pat_ab​c"), "15 chars, github_pat_ prefix, 1 odd char (U+200B)");
  assert.equal(api.tokenShape(""), "0 chars, unknown prefix, 0 odd chars");
});

test("a failing reply post does not skip the queued commands behind it (HUNT-2026-11-02)", async () => {
  const gh = pagedGitHub();
  const real = gh.fetch;
  let failNext = false;
  gh.fetch = async (url, opts) => {
    if (opts.method === "POST" && failNext) { failNext = false; return { status: 500, ok: false, json: async () => ({}), headers: { get: () => null } }; }
    return real(url, opts);
  };
  const ran = [];
  const b = load({ tok: "tok", gh, apex: { perf: (o) => { ran.push(o); return o; } } });
  await flush();
  for (const o of [1, 2, 3]) gh.add({ id: 200 + o, body: "```apex-cmd\n" + JSON.stringify({ cmd: "call", args: { method: "perf", args: [o] } }) + "\n```" });
  failNext = true;
  await assert.rejects(b.api.pollOnce());
  for (let i = 0; i < 3; i++) await b.api.pollOnce();
  assert.deepEqual([...new Set(ran)].sort(), [1, 2, 3], "commands 2 and 3 still ran after command 1's reply failed");
});

test("geom reads the device's own geometry: insets, viewport units, the zoom self-test, and wish vs painted scale", async () => {
  // A WebKit-like engine with STANDARDIZED zoom: a 100 px box at zoom 2 reports a 200 px rect, and vw / env() lengths
  // inside it are multiplied by the zoom. Viewport 852x393, insets 59/0/59/21, HUD SIZE 1.5525 capped to 0.99.
  const W = 852, H = 393, INS = { l: 59, t: 0, r: 59, b: 21 };
  const mk = () => { const n = { style: { cssText: "" }, children: [], offsetWidth: 100, currentCSSZoom: 2, appendChild(c) { c.parent = n; n.children.push(c); }, remove() { n.removed = true; },
    getBoundingClientRect() {
      const c = n.style.cssText, m = /height:100(vh|svh|dvh|lvh)/.exec(c), w = /width:100(vw|svw)/.exec(c);
      if (n.parent && n.parent.style) {
        const paddingOutsideWidth = c.includes("box-sizing:content-box") ? INS.l : 0; // tokens.css defaults to border-box
        return { width: 2 * (W / 10 + paddingOutsideWidth), height: 2 };
      }
      if (m) return { left: 0, top: 0, width: 1, height: m[1] === "lvh" ? 430 : H, right: 1, bottom: H };
      if (w) return { left: 0, top: 0, width: W, height: 1, right: W, bottom: 1 };
      if (/zoom:2/.test(c)) return { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 };
      if (/env\(safe-area-inset-left/.test(c)) return { left: INS.l, top: INS.t, right: W - INS.r, bottom: H - INS.b, width: W - INS.l - INS.r, height: H - INS.t - INS.b };
      return { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
    } }; return n; };
  const nodes = [];
  const vars = { "--ui-scale": "1.09", "--hud-scale": "1.5525", "--hud-btn-scale": "2.45", "--hud-z-top": "0.99", "--hud-z-dock": "1.186", "--hud-z-dock-l": "1.942", "--sal": "59px" };
  const html = { clientWidth: W, clientHeight: H, dataset: { textSize: "large" } };
  const body = { appendChild: (n) => { n.parent = null; nodes.push(n); }, getAttribute: (k) => ({ "data-density": "compact", "data-shape": "wide" })[k] || null, classList: { contains: () => false } };
  const b = load({ search: "", extra: {
    document: { documentElement: html, body, createElement: () => mk(), getElementById: () => null, querySelector: () => null },
    getComputedStyle: (e) => (e === html ? { getPropertyValue: (n) => vars[n] || "" } : { paddingLeft: INS.l + "px", getPropertyValue: () => "" }),
    matchMedia: (q) => ({ matches: q === "(pointer: coarse)" || q === "(max-height: 400px)" }),
    visualViewport: { scale: 1, width: W, height: H, offsetLeft: 0, offsetTop: 0 },
    screen: { width: 393, height: 852, availWidth: 393, availHeight: 852, orientation: { type: "landscape-primary", angle: 90 } },
  } });
  const r = await b.api.handle({ cmd: "geom" });
  assert.equal(r.ok, true);
  const v = r.value;
  assert.deepEqual(plain(v.client), [W, H]);
  assert.deepEqual(plain(v.insets), { left: 59, top: 0, right: 59, bottom: 21, fixedBox: [W, H] });
  assert.equal(v.units.svh, 393);
  assert.equal(v.units.lvh, 430, "a large viewport taller than the small one is reported, not folded into vh");
  assert.equal(v.units.vw, W);
  assert.deepEqual(plain(v.zoom), { currentCSSZoom: 2, rectOf100At2: 200, offsetOf100At2: 100, vwInZoom2: 2, envInZoom2: 2 });
  assert.equal(v.media["(max-height: 400px)"], true);
  assert.equal(v.media["(min-width: 900px)"], false);
  assert.deepEqual(plain(v.tiers), { density: "compact", shape: "wide", desktop: false, html: { textSize: "large" } });
  assert.equal(v.wish.hud, "1.5525");
  assert.equal(v.paint.hudTop, "0.99", "the cap the HUD paints at is reported beside the slider's wish");
  assert.equal(v.paint.dockLeft, "1.942");
  assert.equal(v.paint.kb, null);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].removed, true, "the probe node never stays in the page");
  // No DOM: the viewport numbers still answer and the probes are null.
  const bare = await load({ search: "" }).api.handle({ cmd: "geom" });
  assert.equal(bare.ok, true);
  assert.equal(bare.value.insets, null);
  assert.equal(bare.value.zoom, null);
});

// UI NAVIGATION (#6383): a mini DOM that plays the TIME TRIAL route the way the game's own handlers do. Every screen
// change happens inside an onclick, so a nav that arrives proves the bridge pressed the real controls.
function menuDom({ state = "menu", dailyLocked = false } = {}) {
  const els = new Map();
  const log = [];
  const game = { state, door: { built: null, dark: null, readyFor: null, want: { tod: "default", weather: "dry" }, driveOut: false } };
  const el = (id, { parent = null, hidden = false, tag = "BUTTON" } = {}) => {
    const n = { id, tagName: tag, nodeType: 1, hidden, disabled: false, parentElement: parent, children: [], dataset: {}, attrs: {}, onclick: null,
      getAttribute: (k) => n.attrs[k] ?? null, setAttribute: (k, v) => { n.attrs[k] = String(v); },
      dispatchEvent: (e) => { log.push(id + ":" + e.type); return true; },
      click: () => { log.push(id + ":click"); if (n.onclick) n.onclick({ type: "click" }); } };
    if (parent) parent.children.push(n);
    if (id) els.set(id, n);
    return n;
  };
  const show = (id) => { for (const s of ["overlay", "select", "race-settings", "carsetup"]) els.get(s).hidden = s !== id; };
  const overlay = el("overlay", { tag: "DIV" });
  for (const id of ["mb-tt", "mb-race", "mb-daily", "mb-career", "mb-vs"]) el(id, { parent: overlay });
  const select = el("select", { tag: "DIV", hidden: true });
  const strip = el("sel-tracks", { parent: select, tag: "DIV" });
  ["spa", "monza"].forEach((t, i) => {
    const r = el(null, { parent: strip });
    r.dataset.trackIdx = String(i);
    r.onclick = () => { for (const c of strip.children) c.setAttribute("aria-pressed", c === r ? "true" : "false"); game.door.readyFor = { trackId: t, tod: game.door.want.tod, weather: game.door.want.weather }; };
  });
  for (const id of ["sel-go", "sel-car", "sel-back"]) el(id, { parent: select });
  const rs = el("race-settings", { tag: "DIALOG", hidden: true });
  const row = (name, values, key) => {
    const sel = el("rs-" + name + "-sel", { parent: rs, tag: "SELECT" });
    sel.options = values.map((value) => ({ value }));
    sel.value = values[0];
    sel.disabled = dailyLocked;
    const next = el("rs-" + name + "-next", { parent: rs });
    next.onclick = () => { sel.value = values[(values.indexOf(sel.value) + 1) % values.length]; game.door.want[key] = sel.value; if (game.door.readyFor) game.door.readyFor[key] = sel.value; };   // scheduleFlybyTrack re-preps
    el("rs-" + name + "-prev", { parent: rs });
  };
  row("weather", ["dry", "wet", "rain", "storm", "overcast", "fog"], "weather");
  row("time", ["default", "dawn", "day", "dusk", "night"], "tod");
  const go = el("rs-go", { parent: rs });
  el("rs-cancel", { parent: rs });
  const cs = el("carsetup", { tag: "DIV", hidden: true });
  const done = el("cs-done", { parent: cs });
  els.get("mb-tt").onclick = () => setTimeout(() => show("select"), 30);   // the title's View Transition lands later
  els.get("mb-daily").onclick = () => { strip.children[1].onclick(); show("select"); };
  els.get("sel-go").onclick = () => show("race-settings");
  els.get("sel-car").onclick = () => show("carsetup");
  done.onclick = () => show("race-settings");
  // RACE!: the garage drive-out plays while the state is still "menu", then the countdown.
  go.onclick = () => {
    rs.hidden = true;
    setTimeout(() => { game.door.driveOut = true; game.door.built = game.door.readyFor.trackId; }, 50);
    setTimeout(() => { game.door.driveOut = false; game.state = "count"; }, 1500);
  };
  const document = { getElementById: (id) => els.get(id) || null };
  const apex = { info: () => ({ state: game.state }), menuPrep: () => ({ door: plain(game.door) }) };
  const extra = { document, setTimeout, Date, Tracks: { LIST: [{ id: "spa" }, { id: "monza" }] },
    Event: class { constructor(type) { this.type = type; } } };
  return { els, log, game, apex, extra };
}

test("tap: any visible control outside the denied areas, with the real pointer + click sequence", async () => {
  const dom = menuDom();
  const b = load({ search: "", apex: dom.apex, extra: dom.extra });
  const refused = {
    "mb-career": "mb-career is refused: inside #mb-career (saves, career, net or the link)",
    "mb-vs": "mb-vs is refused: inside #mb-vs (saves, career, net or the link)",
    "sel-tracks": "sel-tracks is not a control",
    "#mb-tt": "id must be an element id (letters, digits, - and _)",
    "rs-go, mb-career": "id must be an element id (letters, digits, - and _)",
    "nowhere-at-all": "#nowhere-at-all not in the page",
  };
  for (const [id, error] of Object.entries(refused)) {
    const r = await b.api.handle({ cmd: "tap", args: { id } });
    assert.equal(r.ok, false, id);
    assert.equal(r.error, error, id);
  }
  assert.equal((await b.api.handle({ cmd: "tap", args: {} })).error, "name the control: id, tile, text or data");
  for (const tile of ["../x", "monza']", "nowhere"]) assert.equal((await b.api.handle({ cmd: "tap", args: { tile } })).ok, false, tile);
  assert.equal(dom.log.length, 0, "a refused tap touches nothing");
  // A hidden control is refused, not clicked.
  assert.equal((await b.api.handle({ cmd: "tap", args: { id: "sel-go" } })).error, "sel-go is not visible (screen title)");
  const r = await b.api.handle({ cmd: "tap", args: { id: "mb-tt", until: "select", ms: 2000 } });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.value), { tapped: "mb-tt", screen: "select", state: "menu", ok: true });
  assert.deepEqual(dom.log, ["mb-tt:pointerdown", "mb-tt:pointerup", "mb-tt:click"]);
  assert.equal((await b.api.handle({ cmd: "tap", args: { id: "sel-go", until: "nowhere" } })).ok, false, "until names a screen");
  assert.deepEqual(plain((await b.api.handle({ cmd: "screen" })).value), { screen: "select", state: "menu" });
});

test("nav tt/setup: title → TIME TRIAL → tile → SESSION SETUP → weather/time chevrons → RACE!, a screen per step", async () => {
  const dom = menuDom();
  const b = load({ search: "", apex: dom.apex, extra: dom.extra });
  const r = await b.api.handle({ cmd: "nav", args: { flow: "tt", track: "monza", weather: "rain", tod: "night", entry: "setup" } });
  assert.equal(r.ok, true, r.error);
  const v = r.value;
  assert.equal(v.ok, true, JSON.stringify(v.steps));
  assert.deepEqual(plain(v.steps.map((s) => [s.step, s.screen, s.ok])), [
    ["mb-tt", "select", true], ["tile:monza", "select", true], ["sel-go", "setup", true],
    ["weather", "setup", true], ["time", "setup", true], ["rs-go", "drive-out", true],
  ]);
  assert.equal(v.steps[3].value, "rain");
  assert.equal(v.state, "menu", "RACE! answers once the drive-out is up, not after it");
  assert.ok(v.steps[5].ms < 1000);
  assert.deepEqual(plain(v.door), { built: "monza", dark: null, readyFor: { trackId: "monza", tod: "night", weather: "rain" }, want: { tod: "night", weather: "rain" }, driveOut: true });
  assert.equal(dom.log.filter((l) => l === "rs-weather-next:click").length, 2, "dry → wet → rain by the chevron, as a thumb would");
  assert.ok(JSON.stringify(r).length < 60000);
});

test("nav garage entry goes through YOUR CAR and the garage's DONE; daily pins its own world", async () => {
  const g = menuDom();
  const bg = load({ search: "", apex: g.apex, extra: g.extra });
  const rg = await bg.api.handle({ cmd: "nav", args: { track: "spa", entry: "garage", go: false } });
  assert.deepEqual(plain(rg.value.steps.map((s) => s.step + "@" + s.screen)), ["mb-tt@select", "tile:spa@select", "sel-car@garage", "cs-done@setup"]);
  assert.equal(rg.value.screen, "setup", "go:false stops on SESSION SETUP");
  const d = menuDom({ dailyLocked: true });
  const bd = load({ search: "", apex: d.apex, extra: d.extra });
  assert.equal((await bd.api.handle({ cmd: "nav", args: { entry: "daily", weather: "rain" } })).error, "daily pins its own circuit, weather and hour (flow tt, no track/weather/tod)");
  const rd = await bd.api.handle({ cmd: "nav", args: { entry: "daily" } });
  assert.deepEqual(plain(rd.value.steps.map((s) => s.step)), ["mb-daily", "sel-go", "rs-go"]);
  assert.equal(rd.value.door.built, "monza");
});

test("nav refuses a bad route up front and reports where a route stopped", async () => {
  const dom = menuDom();
  const b = load({ search: "", apex: dom.apex, extra: dom.extra });
  assert.equal((await b.api.handle({ cmd: "nav", args: { track: "monza", entry: "lobby" } })).error, "nav.entry must be setup, garage or daily");
  assert.equal((await b.api.handle({ cmd: "nav", args: { track: "monza", flow: "career" } })).error, "nav.flow must be tt or race");
  assert.equal((await b.api.handle({ cmd: "nav", args: {} })).error, "nav.track is required");
  const bad = await b.api.handle({ cmd: "nav", args: { track: "monza", weather: "snow" } });
  assert.equal(bad.value.ok, false);
  assert.deepEqual(plain(bad.value.steps.at(-1)), { step: "weather", ok: false, screen: "setup", error: "weather must be one of dry, wet, rain, storm, overcast, fog" });
  // Not on the title any more: nav refuses rather than guessing a route from mid-menu.
  assert.equal((await b.api.handle({ cmd: "nav", args: { track: "monza" } })).error, "nav starts on the title screen (now setup)");
  // In a batch, a nav that did not arrive stops the steps after it.
  const dom2 = menuDom({ dailyLocked: true });
  const b2 = load({ search: "", apex: dom2.apex, extra: dom2.extra });
  const out = await b2.api.handle({ cmd: "batch", args: { steps: [{ cmd: "nav", args: { track: "monza", tod: "night" } }, { cmd: "ping" }] } });
  assert.equal(out.value.length, 1);
  assert.equal(out.value[0].value.steps.at(-1).error, "time is locked on this session");
});

test("every TAP_DENY area names a real id in the shell or the game, so a renamed area cannot open silently", () => {
  const { api } = load({ search: "" });
  const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const made = { "cr-career": "js/ui/settings-export-body.js", "pm-files": "js/ui/settings-export-body.js", "pm-settings-file": "js/ui/settings-export-body.js",
    "pm-other-save-files": "js/ui/settings-export-body.js", "pm-share-code": "js/ui/settings-export-body.js", "pm-restore": "js/ui/settings-export-body.js",
    "cs-garage-file": "js/ui/settings-export-body.js", "cs-garage-reset": "js/ui/settings-export-body.js", "ct-import": "js/camera/tuner-panel.js",
    "bridge-link": "js/agent/bridge-link.js", "apex-bridge": "js/agent/apex-bridge.js" };
  for (const p of api.TAP_DENY) {
    const live = ids.has(p) || [...ids].some((id) => id.startsWith(p + "-"));
    if (made[p]) assert.ok(fs.readFileSync(new URL("../../" + made[p], import.meta.url), "utf8").includes('"' + p), p + " is made by " + made[p]);
    else assert.equal(live, true, p + " (or " + p + "-…) is in index.html");
  }
  // Every control the old allow-list named stays pressable (ld-skip: RACE!'s SKIP TO RACE, js/ui/loading-screen.js).
  for (const id of ["mb-tt", "mb-race", "sel-go", "rs-go", "cs-done", "cs-arrival-skip", "ld-skip", "pausebtn", "pm-resume", "pm-quit", "hud-end-session", "res-menu"])
    assert.equal(api.TAP_DENY.some((p) => id === p || id.startsWith(p + "-")), false, id + " is not in a denied area");
});

// THE WIDE SURFACE (Bryce 2026-11-25, "Broad allow-list"): find by label text or data attribute, set a control or a
// settings key, send a key, scroll. A small DOM with querySelectorAll; every press is logged.
function wideDom() {
  const log = [];
  const all = [];
  const node = (tag, props = {}, parent = null) => {
    const n = { tagName: tag, nodeType: 1, hidden: false, disabled: false, parentElement: parent, children: [], dataset: {}, attrs: {}, textContent: "",
      scrollTop: 0, scrollHeight: 900, clientHeight: 300, value: "", checked: false, type: "", options: [], onclick: null,
      getAttribute: (k) => n.attrs[k] ?? null, setAttribute: (k, v) => { n.attrs[k] = String(v); },
      dispatchEvent: (e) => { log.push((n.id || tag) + ":" + e.type + (e.key ? "=" + e.key : "")); return true; },
      click: () => { log.push((n.id || tag) + ":click"); if (n.onclick) n.onclick(); },
      scrollIntoView: () => log.push((n.id || tag) + ":into"), ...props };
    if (parent) parent.children.push(n);
    all.push(n);
    return n;
  };
  const body = node("BODY", { id: "" });
  const pm = node("DIV", { id: "pausemenu" }, body);
  const audio = node("BUTTON", { id: "pm-audio", textContent: " MUSIC & SOUND…  Music, radio " }, pm);
  const files = node("BUTTON", { id: "pm-open-files", textContent: "SAVES & DATA…" }, pm);
  node("BUTTON", { id: "pm-a", textContent: "RESET" }, pm);
  node("BUTTON", { id: "pm-b", textContent: "RESET" }, pm);
  const tab = node("DIV", { id: "pm-tab-hud", textContent: "HUD" }, pm); tab.attrs.role = "tab"; tab.attrs["data-tab"] = "hud";
  const row = node("DIV", { id: "pm-units" }, pm);
  const sel = node("SELECT", { id: "pm-units-sel", value: "kph", options: [{ value: "kph" }, { value: "mph" }] }, row);
  const next = node("BUTTON", { id: "pm-units-next" }, row); next.attrs["data-step"] = "1";
  next.onclick = () => { sel.value = sel.value === "kph" ? "mph" : "kph"; };
  const box = node("INPUT", { id: "pm-mirror", type: "checkbox" }, pm);
  box.onclick = () => { box.checked = !box.checked; };
  const range = node("INPUT", { id: "pm-fov", type: "range", value: "60" }, pm);
  const career = node("DIV", { id: "career" }, body);
  node("BUTTON", { id: "cr-x", textContent: "MUSIC & SOUND" }, career);   // same label, inside a denied area
  const document = { body, activeElement: audio, scrollingElement: body,
    getElementById: (id) => all.find((n) => n.id === id) || null,
    querySelectorAll: () => all.filter((n) => n.tagName !== "BODY" && n.tagName !== "DIV" || n.attrs.role) };
  pm.querySelectorAll = () => document.querySelectorAll().filter((n) => { for (let e = n; e; e = e.parentElement) if (e === pm) return true; return false; });
  const store = new Map();
  const GameStore = { store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => { if (v === undefined) store.delete(k); else store.set(k, v); return true; },
    raw: (k) => (store.has(k) ? store.get(k) : null), rawSet: (k, v) => { store.set(k, v); return true; }, rawDel: (k) => { store.delete(k); return true; } } };
  const SettingsExport = { SPEC: [{ k: "radioChat", lane: "json", def: "normal", oneOf: ["off", "key", "normal", "chatty"] },
    { k: "volMusic", lane: "json", def: 0.7 }, { k: "buildWorker", lane: "raw", def: "1", oneOf: ["0", "1"] }, { k: "voiceTune", lane: "json", def: {} }] };
  class Event { constructor(type, o = {}) { this.type = type; Object.assign(this, o); } }
  return { log, files, sel, box, range, store, extra: { document, setTimeout, Date, Event, GameStore, SettingsExport } };
}

test("wide tap: by visible label or data attribute; a denied area or an ambiguous label is refused with its reason", async () => {
  const w = wideDom();
  const b = load({ search: "", extra: w.extra });
  const r = await b.api.handle({ cmd: "tap", args: { text: "music & sound" } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.tapped, "pm-audio", "the label prefix finds the one visible control outside #career");
  assert.equal((await b.api.handle({ cmd: "tap", args: { data: { tab: "hud" } } })).value.tapped, "pm-tab-hud");
  assert.equal((await b.api.handle({ cmd: "tap", args: { text: "RESET" } })).error, "2 controls match text:RESET (pm-a, pm-b): add nth or within");
  assert.equal((await b.api.handle({ cmd: "tap", args: { text: "RESET", nth: 1 } })).value.tapped, "pm-b");
  assert.equal((await b.api.handle({ cmd: "tap", args: { text: "saves & data" } })).error, "no visible control matches text:SAVES & DATA", "a door into a denied area is not even found");
  assert.equal((await b.api.handle({ cmd: "tap", args: { id: "pm-open-files" } })).ok, false);
  assert.equal((await b.api.handle({ cmd: "tap", args: { data: { "bad name": "x" } } })).ok, false);
  assert.equal(w.log.filter((l) => l.startsWith("pm-open-files") || l.startsWith("cr-x")).length, 0, "nothing denied was pressed");
});

test("set: a control through its own UI path, or a SETTINGS FILE key through the store; tables and unknown keys refused", async () => {
  const w = wideDom();
  const b = load({ search: "", extra: w.extra });
  const s1 = await b.api.handle({ cmd: "set", args: { id: "pm-units-sel", value: "mph" } });
  assert.equal(s1.value.value, "mph");
  assert.ok(w.log.includes("pm-units-next:click"), "a SettingRow is stepped by its own chevron");
  assert.equal((await b.api.handle({ cmd: "set", args: { id: "pm-units-sel", value: "furlongs" } })).error, "pm-units-sel must be one of kph, mph");
  assert.equal((await b.api.handle({ cmd: "set", args: { id: "pm-mirror", value: true } })).value.value, true);
  assert.equal((await b.api.handle({ cmd: "set", args: { id: "pm-fov", value: 72 } })).value.value, 72);
  assert.ok(w.log.includes("pm-fov:input") && w.log.includes("pm-fov:change"), "a range fires input then change");
  assert.equal((await b.api.handle({ cmd: "set", args: { id: "pm-audio", value: 1 } })).ok, false, "a button is not settable");
  const k = await b.api.handle({ cmd: "set", args: { key: "radioChat", value: "chatty" } });
  assert.deepEqual(plain(k.value), { key: "radioChat", was: null, now: "chatty", reload: true });
  assert.equal((await b.api.handle({ cmd: "set", args: { key: "buildWorker", value: "0" } })).value.now, "0");
  assert.equal(w.store.get("apex26.buildWorker"), "0", "a raw-lane key is written as the settings file writes it");
  for (const [key, value] of [["radioChat", "loud"], ["volMusic", "high"], ["voiceTune", {}], ["careerSlot", 1], ["bridgeToken", "x"], ["nope", 1]])
    assert.equal((await b.api.handle({ cmd: "set", args: { key, value } })).ok, false, key);
  assert.equal((await b.api.handle({ cmd: "set", args: { key: "radioChat" } })).error, "set needs a value");
});

test("key goes to the focused element (allow-listed keys only); scroll moves the page or a visible element", async () => {
  const w = wideDom();
  const b = load({ search: "", extra: w.extra });
  const k = await b.api.handle({ cmd: "key", args: { key: "Escape" } });
  assert.equal(k.value.to, "pm-audio");
  assert.ok(w.log.includes("pm-audio:keydown=Escape") && w.log.includes("pm-audio:keyup=Escape"));
  assert.equal((await b.api.handle({ cmd: "key", args: { key: "Space", id: "pm-mirror" } })).value.to, "pm-mirror");
  assert.equal((await b.api.handle({ cmd: "key", args: { key: "F12" } })).ok, false);
  assert.equal((await b.api.handle({ cmd: "key", args: { key: "Enter", id: "pm-open-files" } })).ok, false, "no key into a denied area");
  assert.equal((await b.api.handle({ cmd: "scroll", args: { by: 120 } })).value.top, 120);
  assert.equal((await b.api.handle({ cmd: "scroll", args: { id: "pausemenu", to: "bottom" } })).value.top, 900);
  assert.equal((await b.api.handle({ cmd: "scroll", args: { id: "career", by: 10 } })).ok, false);
  await b.api.handle({ cmd: "scroll", args: { id: "pm-fov", into: true } });
  assert.ok(w.log.includes("pm-fov:into"));
  assert.equal((await b.api.handle({ cmd: "scroll", args: {} })).ok, false);
});

// DRIVING (#6397): `drive` hands the car to SoakRun's driver (JSON in, no policy function); this pins the command's
// argument contract, its goal verdict and the release paths. The driver itself: soak-run.test.mjs, drive-to-box-vm.
function fakeDriver(result = { reason: "box", inBox: true, policy: "box", ms: 900, laps: 0, steps: [{ phase: "lane" }] }) {
  const calls = [];
  let active = false;
  const S = {
    driving: () => active,
    drive(o) { calls.push(["drive", o]); active = true; return Promise.resolve(result).then((r) => { active = false; return r; }); },
    driveStop(why) { calls.push(["stop", why]); const was = active; active = false; return was ? { reason: why } : null; },
    driveStatus: () => ({ active, last: { reason: "box" } }),
  };
  const hud = { id: "hud-end-session", nodeType: 1, hidden: false, parentElement: null };
  const extra = { SoakRun: S, setTimeout, Date, document: { getElementById: (id) => (id === "hud-end-session" ? hud : null) } };
  return { S, calls, extra };
}

test("drive: JSON only — to:box drives into the box and reports the pit actions; bad shapes are refused up front", async () => {
  const d = fakeDriver();
  const b = load({ search: "", apex: { info: () => ({ state: "race" }) }, extra: d.extra });
  assert.ok(b.api.CMDS.drive, "drive is a bridge command");
  const r = await b.api.handle({ cmd: "drive", args: { to: "box" } });
  assert.equal(r.ok, true);
  assert.equal(r.value.ok, true, "the goal was met");
  assert.equal(r.value.inBox, true);
  assert.equal(r.value.state, "race");
  assert.deepEqual(plain(r.value.pitActions), ["hud-end-session"], "END TIME TRIAL is on screen for the next tap");
  assert.deepEqual(plain(d.calls[0]), ["drive", { to: "box", ms: 240000 }]);
  for (const args of [{}, { to: "pit" }, { to: "box", laps: 1 }, { laps: 0 }, { laps: 9 }, { laps: 1.5 }, { seconds: 0 }, { seconds: 9999 }, { policy: "x => x" }]) {
    const bad = await b.api.handle({ cmd: "drive", args });
    assert.equal(bad.ok, false, JSON.stringify(args));
  }
  const grid = await b.api.handle({ cmd: "drive", args: { to: "grid" } });
  assert.equal(grid.ok, false, "to:grid is refused with its reason");
  assert.equal(d.calls.length, 1, "a refused drive never reaches the driver");
});

test("drive: a missed goal reads ok:false so a batch stops before its tap; wait:false answers at once; stop releases", async () => {
  const d = fakeDriver({ reason: "timeout", inBox: false, policy: "box", steps: [] });
  const b = load({ search: "", apex: { info: () => ({ state: "race" }) }, extra: d.extra });
  const steps = [{ cmd: "drive", args: { to: "box" } }, { cmd: "tap", args: { id: "hud-end-session" } }];
  const out = (await b.api.handle({ cmd: "batch", args: { steps } })).value;
  assert.equal(out.length, 1, "the tap never ran");
  assert.equal(out[0].value.ok, false);
  const w = await b.api.handle({ cmd: "drive", args: { laps: 1, wait: false } });
  assert.equal(w.value.started, true);
  assert.deepEqual(plain(d.calls[1]), ["drive", { laps: 1, ms: 240000 }]);
  const s = await b.api.handle({ cmd: "drive", args: { stop: true } });
  assert.equal(s.ok, true);
  assert.equal(d.calls[2][0], "stop");
  assert.equal((await b.api.handle({ cmd: "drive", args: { status: true } })).value.active, false);
});

// #6417: the first snap after an idle gap read solid black. A canvas without preserveDrawingBuffer holds a frame only
// in the task that presented it; this fake clears it in the NEXT task, as the compositor does, so only a read made
// in present()'s own continuation sees the picture.
function presentingCanvas() {
  const st = { buffer: "black", reads: [], waits: [] };
  const waiters = [];
  const GLX = {
    softPresent: () => false,
    awaitSoftPresent(ms, mode) { st.waits.push([ms, mode]); return new Promise((res) => waiters.push(res)); },
  };
  const present = () => {
    st.buffer = "frame";
    for (const w of waiters.splice(0)) w("frame");
    setTimeout(() => { st.buffer = "black"; }, 0);   // composited: the drawing buffer is gone
  };
  const doc = {
    getElementById: (id) => (id === "game" ? { id: "game", width: 1600, height: 900, hidden: false } : null),
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => st.reads.push(st.buffer) }),
      toDataURL: () => "data:image/jpeg;base64,AAAA" }),
  };
  return { st, GLX, present, doc };
}

test("snap waits for the renderer's next present and reads it in that task, not a rAF later (#6417)", async () => {
  const f = presentingCanvas();
  const b = load({ search: "", extra: { document: f.doc, GLX: f.GLX, setTimeout, requestAnimationFrame: () => { throw new Error("no rAF read"); } } });
  const p = b.api.handle({ cmd: "snap", args: { w: 320 } });
  await flush();
  assert.deepEqual(plain(f.st.waits), [[1500, "frame"]], "a headed canvas waits for a frame from inside present()");
  assert.deepEqual(f.st.reads, [], "nothing is read before the game draws");
  setTimeout(f.present, 5);
  const r = await p;
  assert.equal(r.ok, true);
  assert.deepEqual(f.st.reads, ["frame"], "read while the presented frame is still in the buffer");
  assert.equal(r.value.fresh, "frame");
  // Nothing presents (paused): the read still answers, and says it is stale.
  const g = presentingCanvas();
  g.GLX.awaitSoftPresent = () => Promise.resolve("stale");
  const s = await load({ search: "", extra: { document: g.doc, GLX: g.GLX } }).api.handle({ cmd: "snap" });
  assert.equal(s.value.fresh, "stale");
});
