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
      if (n.parent && n.parent.style) return { width: 2 * (W / 10 + INS.l), height: 2 };            // 10vw + env() padding, inside zoom 2
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
