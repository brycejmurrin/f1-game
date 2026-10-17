/* WATCH recording-gap cache (#2465).
 *
 * A complete IndexedDB recording may still contain an interior hole. An explicit
 * refresh must bypass memory, IndexedDB and the raw API cache and replace that
 * hole. A pit-stop hole and a red-flag hole stay in the recording: they are
 * stoppages, not a failed download.
 *
 * Run: node --test tests/unit/real-race-tab-gap-refresh.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const host = (v) => JSON.parse(JSON.stringify(v));

function load(extra = {}) {
  const sb = { Math, Array, Object, Number, String, Boolean, Date, isFinite, isNaN, console, Promise, JSON, Set, Map, RegExp, Float32Array, ...extra };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/teams.js"), "utf8"), ctx, { filename: "teams.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/real-race-tab.js"), "utf8"), ctx, { filename: "real-race-tab.js" });
  return { D: vm.runInContext("DataRealRace", ctx) };
}

function idb(records) {
  return { open() {
    const rq = {};
    queueMicrotask(() => {
      rq.result = { transaction() {
        const tx = {};
        const request = (value) => {
          const r = {};
          queueMicrotask(() => { r.result = structuredClone(value); r.onsuccess?.(); });
          return r;
        };
        tx.objectStore = () => ({
          get: (k) => request(records.get(k)),
          put: (v, k) => { records.set(k, structuredClone(v)); return request(k); },
        });
        setImmediate(() => tx.oncomplete?.());
        return tx;
      } };
      rq.onsuccess();
    });
    return rq;
  } };
}

function gapScript() {
  const t0 = 1_000_000;
  return {
    sessionKey: 2465, t0, complete: true, laps: 1, name: "Gap Grand Prix", session: "Race",
    weather: "dry", circuit: "Monza", country: "Italy", trackId: "monza", year: 2026,
    cautions: [{ level: 4, from: 1, to: 1, cause: "RED FLAG", tFrom: 50, tTo: 550 }],
    drivers: [
      { num: 1, code: "STL", name: "Stale", team: "A", grid: 1, pos: 1, stints: [], pits: [], lapStart: [0], laps: [600] },
      { num: 2, code: "PIT", name: "Pit", team: "B", grid: 2, pos: 2, stints: [], pits: [1], pitT: [50], pitDur: [500], lapStart: [0], laps: [600] },
      { num: 3, code: "RED", name: "Red", team: "C", grid: 3, pos: 3, stints: [], pits: [], lapStart: [0], laps: [600] },
    ],
  };
}

/** 0..50 and 550..600: 102 samples, one interior hole. Dense is one sample per second. */
function rows(num, repair) {
  const hole = num !== 1 || !repair;
  const ts = hole
    ? [...Array(51).keys(), ...Array.from({ length: 51 }, (_, i) => 550 + i)]
    : Array.from({ length: 601 }, (_, i) => i);
  return ts.map((t) => ({ date: 1_000_000 + t * 1000, x: 100 + t, y: 200 + t }));
}

test("explicit refresh replaces a stale interior gap and keeps pit and red-flag gaps", async () => {
  const records = new Map(), requests = [];
  let repair = false, rejectStale = false;
  const script = gapScript();
  const { D } = load({ indexedDB: idb(records), F1API: { locationData: async (_key, num, _start, _end, options) => {
    requests.push({ num, options });
    if (rejectStale && num === 1) throw new Error("offline");
    return rows(num, repair);
  } } });

  const first = await D.fetchTraces(script);
  assert.equal(first.complete, true, "an interior hole is still a usable recording, including a pit stop and a red flag");
  const gapsOf = (tr, num) => host(D.traceDetails(script, tr).find((d) => d.num === num).gaps);
  assert.deepEqual(gapsOf(first, 1), [[50, 550]], "the stale hole is disclosed");
  assert.deepEqual(gapsOf(first, 2), [[50, 550]], "the pit-stop hole is kept");
  assert.deepEqual(gapsOf(first, 3), [[50, 550]], "the red-flag hole is kept");
  assert.deepEqual(host(first.failed), []);

  const cached = await D.fetchTraces(script, null, first);
  assert.equal(requests.length, 3, "a later open reuses the persisted recording");
  assert.deepEqual(gapsOf(cached, 1), [[50, 550]]);

  repair = true;
  const fixed = await D.fetchTraces(script, null, first, { refresh: true });
  assert.equal(requests.length, 6, "refresh asks the API again for every car");
  assert.ok(requests.slice(3).every((r) => r.options && r.options.cache === false), "refresh bypasses the raw API cache");
  assert.deepEqual(gapsOf(fixed, 1), [], "the repaired feed replaces the stale hole");
  assert.deepEqual(gapsOf(fixed, 2), [[50, 550]], "refresh does not invent positions across a pit stop");
  assert.deepEqual(gapsOf(fixed, 3), [[50, 550]], "refresh does not invent positions across a red flag");
  assert.equal(fixed.complete, true);
  assert.deepEqual(gapsOf(records.get("2465"), 1), [], "the repaired recording replaces the persisted one");

  await D.fetchTraces(script);
  assert.equal(requests.length, 6, "the next open reuses the repaired recording");

  rejectStale = true;
  await assert.rejects(D.fetchTraces(script, null, fixed, { refresh: true }), /refresh did not load every car/);
  assert.deepEqual(gapsOf(records.get("2465"), 1), [], "a failed refresh leaves the playable recording in place");
});

function dom() {
  function el(tag, cls, text) {
    const node = {
      tag, cls: cls || null, text: text == null ? null : String(text), children: [], type: null, value: "", hidden: false, disabled: false, listeners: {},
      appendChild(c) { node.children.push(c); c.parent = node; return c; },
      setAttribute(k, v) { node[k] = v; },
      addEventListener(ev, fn) { (node.listeners[ev] = node.listeners[ev] || []).push(fn); },
      fire(ev) { (node.listeners[ev] || []).forEach((fn) => fn({ target: node, currentTarget: node })); },
    };
    Object.defineProperty(node, "textContent", {
      get() { return node.text; },
      set(v) { node.text = v == null ? null : String(v); },
    });
    return node;
  }
  const walk = (n) => [n, ...n.children.flatMap(walk)];
  return { el, clear: (n) => { n.children.length = 0; }, walk };
}

test("the positions control offers refresh while WATCH stays available", async () => {
  const records = new Map();
  let requests = 0;
  const script = gapScript();
  script.v = 6;
  const store = new Map();
  const { D } = load({
    indexedDB: idb(records),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
      key: () => null,
      length: 0,
    },
    Tracks: { LIST: [{ id: "monza", name: "MONZA" }] },
    RealRace: { replay() {} },
    F1API: { locationData: async (_k, num) => { requests++; return rows(num, requests > 3); }, cancelAll() {} },
  });
  await D.fetchTraces(script);
  D.remember(script);
  const ui = dom();
  const tab = D.create({
    el: ui.el, clear: ui.clear, emptyMsg: (t) => ui.el("div", null, t), spinner: () => ui.el("div"),
    sel: { meta: { sessionKey: script.sessionKey, name: "Race", type: "Race" } },
    ensureSession: () => Promise.resolve(), buildPicker: () => ui.el("div"),
    teamChip: (c) => ui.el("span", null, c), fmtDateTime: (v) => String(v),
    isOpen: () => true, close() {},
  });
  const tree = await tab.loadRealRace();
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  const nodes = ui.walk(tree);
  const refresh = nodes.find((n) => n.tag === "button" && n.textContent === "REFRESH POSITIONS · ABOUT 60 MB");
  assert.ok(refresh, "a saved recording with an interior gap offers an explicit refresh");
  assert.equal(refresh.hidden, false);
  assert.match(refresh["aria-label"], /60 megabytes/);
  const watch = nodes.find((n) => n.tag === "button" && String(n.textContent).startsWith("WATCH FROM"));
  assert.ok(watch);
  assert.equal(watch.disabled, false, "a pit or red-flag gap does not disable WATCH");
  const before = requests;
  refresh.fire("click");
  await tab.positionsSettled();
  assert.equal(requests, before + 3, "the refresh control downloads the field again");
  assert.equal(tab.traces().complete, true);
});
