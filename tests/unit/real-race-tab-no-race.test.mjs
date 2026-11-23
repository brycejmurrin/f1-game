/* WATCH & DRIVE before the race has run (#5063).
 *
 * 1. An empty pre-race OpenF1 body must not stay cached behind the seven-day
 *    TTL: scriptFor forgets the raw bodies BEFORE it throws "no race".
 * 2. "No race timing yet" is an answer, not a fetch failure: no RETRY.
 * 3. A WATCH tapped while the same race's positions load starts the replay
 *    when they land, instead of being dropped.
 *
 * Run: node --test tests/unit/real-race-tab-no-race.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { evalRealRace } from "../helpers/eval-real-race.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function load(extra = {}) {
  const store = new Map();
  const sb = { Math, Array, Object, Number, String, Boolean, Date, isFinite, isNaN, console, Promise, JSON, Set, Map, RegExp, Float32Array,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), key: () => null, length: 0 },
    Tracks: { LIST: [{ id: "monza", name: "MONZA" }] }, ...extra };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/teams.js"), "utf8"), ctx, { filename: absSrc("js/data/teams.js") });
  evalRealRace(ctx);
  return { D: vm.runInContext("DataRealRace", ctx) };
}

function dom() {
  function el(tag, cls, text) {
    const node = {
      tag, cls: cls || null, text: text == null ? null : String(text), children: [], type: null, value: "", hidden: false, disabled: false, listeners: {},
      appendChild(c) { node.children.push(c); c.parent = node; return c; },
      append(...cs) { cs.forEach((c) => node.appendChild(c)); },
      setAttribute(k, v) { node[k] = v; },
      addEventListener(ev, fn) { (node.listeners[ev] = node.listeners[ev] || []).push(fn); },
    };
    Object.defineProperty(node, "textContent", { get() { return node.text; }, set(v) { node.text = v == null ? null : String(v); } });
    return node;
  }
  const walk = (n) => [n, ...n.children.flatMap(walk)];
  return { el, clear: (n) => { n.children.length = 0; }, walk };
}

/** F1API.request over a cache that keeps what it served, like api-transport's seven-day TTL. */
function cachingApi() {
  const cache = new Map(), forgotten = [];
  return {
    cache, forgotten,
    api: {
      request: async (url, _ttl, opts) => {
        if (!(opts && opts.cache === false) && cache.has(url)) return cache.get(url);
        const body = [];                                          // OpenF1's pre-race 404 "No results found" → []
        if (!(opts && opts.cache === false)) cache.set(url, body);
        return body;
      },
      forget: (url) => { forgotten.push(url); cache.delete(url); },
      cancelAll() {},
    },
  };
}

test("an empty pre-race body is forgotten before scriptFor throws NO_RACE (#5063)", async () => {
  const f = cachingApi();
  const { D } = load({ F1API: f.api });
  const tab = D.create({});
  await assert.rejects(tab.scriptFor(11420), /No race timing published/);
  const drivers = [...f.cache.keys()].filter((u) => u.includes("/drivers?"));
  assert.deepEqual(drivers, [], "the empty /drivers body must not stay cached for a week");
  assert.ok(f.forgotten.some((u) => u.includes("/drivers?session_key=11420")), "forgetRaw ran for the session");
});

test("no race timing yet shows NO_RACE without a RETRY (#5063)", async () => {
  const f = cachingApi();
  const { D } = load({ F1API: f.api });
  const ui = dom();
  const tab = D.create({
    el: ui.el, clear: ui.clear, emptyMsg: (t) => ui.el("div", "dh-empty", t), spinner: () => ui.el("div"),
    sel: { meta: { sessionKey: 11420, name: "Race", type: "Race" } },
    ensureSession: () => Promise.resolve(), buildPicker: () => ui.el("div"),
    teamChip: (c) => ui.el("span", null, c), fmtDateTime: (v) => String(v), isOpen: () => true, close() {},
  });
  const tree = await tab.loadRealRace();
  await settle();
  const nodes = ui.walk(tree);
  assert.ok(nodes.some((n) => /No race timing published/.test(n.textContent || "")), "the slot says no timing yet");
  assert.ok(!nodes.some((n) => /could not fetch/i.test(n.textContent || "")), "not the fetch-failure copy");
  assert.ok(!nodes.some((n) => n.tag === "button" && n.textContent === "RETRY"), "no RETRY to spend requests on");
});

function idb() {
  const records = new Map();
  return { open() {
    const rq = {};
    queueMicrotask(() => {
      rq.result = { transaction() {
        const tx = {};
        const request = (value) => { const r = {}; queueMicrotask(() => { r.result = value === undefined ? undefined : structuredClone(value); r.onsuccess?.(); }); return r; };
        tx.objectStore = () => ({ get: (k) => request(records.get(k)), put: (v, k) => { records.set(k, structuredClone(v)); return request(k); } });
        setImmediate(() => tx.oncomplete?.());
        return tx;
      } };
      rq.onsuccess();
    });
    return rq;
  } };
}

test("a WATCH tapped during LOAD POSITIONS starts once the positions land (#5063)", async () => {
  const launched = [], pending = [];
  const t0 = 1_000_000;
  const script = { sessionKey: 5063, t0, complete: true, laps: 6, name: "Queue Grand Prix", session: "Race", v: 6,
    weather: "dry", circuit: "Monza", country: "Italy", trackId: "monza", year: 2026, cautions: [], rain: [],
    drivers: [1, 2].map((num) => ({ num, code: "Q" + num, name: "Q " + num, team: "T", grid: num, pos: num, stints: [], pits: [],
      lapStart: [0, 10, 20, 30, 40, 50], laps: [10, 10, 10, 10, 10, 10], lapsDone: 6 })) };
  const rows = () => Array.from({ length: 301 }, (_, i) => ({ date: t0 + (i - 90) * 500, x: i, y: i }));   // > 100 samples: RealReplay can fit it
  const { D } = load({
    indexedDB: idb(),
    RealRace: { replay() {}, launch: (_s, o) => { launched.push(o); return true; } },
    F1API: { locationData: () => new Promise((resolve) => pending.push(() => resolve(rows()))), cancelAll() {} },
  });
  const tab = D.create({ isOpen: () => true, close() {} });
  assert.equal(tab.loadTraces(script, null, null), true, "LOAD POSITIONS starts the download");
  await settle();
  tab.watch(script, null, 5, false);                       // RACE STORY → WATCH on lap 5, mid-download
  while (pending.length) { pending.shift()(); await settle(5); }
  await tab.positionsSettled();
  await settle();
  assert.equal(launched.length, 1, "the queued WATCH launched the replay");
  assert.equal(launched[0].startLap, 5);
  assert.equal(launched[0].watch, true);
});
