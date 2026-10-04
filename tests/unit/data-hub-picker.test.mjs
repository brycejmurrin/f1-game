/* data-hub-picker.test.mjs — the session picker shared by LIVE, RESULTS and
 * TELEMETRY (js/data/hub.js buildPicker + ensureSession) against a late answer.
 *
 * Every tab reads one shared `sel`. A pick whose sessions request lands after
 * the player switched tabs used to run onPick on the detached picker, and its
 * invalidateOther bumped the generation of the tab now loading: that tab threw
 * away its own answer and showed LOADING forever. And a latestSession() that
 * landed after a pick overwrote the picked session while keeping it pinned.
 * The F1API here is a hand-settled FIFO (the transport is FIFO too), so each
 * test replays one exact interleaving.
 *
 * Run: node --test tests/unit/data-hub-picker.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function harness() {
  let docRoot = null;
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.dataset = {};
      this.style = { setProperty() {} }; this._cls = new Set(); this.listeners = {}; this.hidden = false; this.value = "";
      this._text = ""; this.id = "";
      const self = this;
      this.classList = { add: (c) => self._cls.add(c), remove: (c) => self._cls.delete(c), contains: (c) => self._cls.has(c),
        toggle: (c, on) => { (on === undefined ? !self._cls.has(c) : on) ? self._cls.add(c) : self._cls.delete(c); } };
    }
    set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get className() { return [...this._cls].join(" "); }
    set textContent(v) { this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
    get firstChild() { return this.children[0] || null; }
    get lastChild() { return this.children[this.children.length - 1] || null; }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
    append(...cs) { cs.forEach((c) => this.appendChild(c)); }
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    removeEventListener() {}
    dispatch(t) { (this.listeners[t] || []).forEach((f) => f({ target: this })); }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === docRoot; }
    querySelector(s) { const c = s.replace(/^\./, ""); for (const ch of this.children) { if (ch._cls.has(c)) return ch; const r = ch.querySelector(s); if (r) return r; } return null; }
    find(pred) { for (const ch of this.children) { if (pred(ch)) return ch; const r = ch.find(pred); if (r) return r; } return null; }
    selects() { const out = []; (function walk(n) { n.children.forEach((c) => { if (c.tagName === "SELECT") out.push(c); walk(c); }); })(this); return out; }
    focus() {}
    scrollIntoView() {}
  }
  docRoot = new El("html");
  const document = { createElement: (t) => new El(t), getElementById: () => null, addEventListener() {}, activeElement: null, hidden: false };
  const pending = [], resultKeys = [];
  const defer = (name, value) => new Promise((res) => pending.push({ name, res: () => res(value) }));
  const LATEST = { sessionKey: 500, meetingKey: 50, year: 2026, name: "Race", type: "Race", dateStart: "2026-10-04T12:00:00Z" };
  const F1API = {
    latestSession: () => defer("latestSession", LATEST),
    meetings: () => defer("meetings", [{ meetingKey: 50, name: "Latest GP", dateStart: "2026-10-01" }, { meetingKey: 40, name: "Picked GP", dateStart: "2026-09-01" }]),
    sessionsForMeeting: (mk) => defer("sessions(" + mk + ")", [{ sessionKey: mk * 10, meetingKey: mk, name: "Race", type: "Race", dateStart: "2026-09-01T12:00:00Z" }]),
    sessionResult: (sk) => { resultKeys.push(sk); return defer("sessionResult", []); },
    sessionDrivers: () => defer("drivers", []),
    weather: () => defer("weather", null), livePositions: () => defer("pos", { values: [], cursor: null }),
    liveIntervals: () => defer("int", { values: {}, cursor: null }),
    cancelAll() {}, cacheEntryT: () => null,
  };
  const ctx = vm.createContext({ document, F1API, Log: { info() {}, warn() {} }, navigator: { onLine: true }, queueMicrotask, console,
    localStorage: { length: 0, key: () => null, getItem: () => null }, setTimeout, clearTimeout, Teams: { LIST: [] },
    DataTelemetry: { create: () => ({ loadTelemetry: () => Promise.resolve(new El("div")), closeTelemPopup() {} }) },
    DataRealRace: { create: () => ({ loadRealRace: () => Promise.resolve(new El("div")), cancel() {} }) },
    DataExport: { create: () => ({ loadExport: () => Promise.resolve(new El("div")) }) } });
  for (const f of ["js/ui/dom.js", "js/data/schedule.js", "js/data/standings.js", "js/data/tab-utils.js", "js/data/results.js", "js/data/live.js", "js/data/hub.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const DataHub = vm.runInContext("DataHub", ctx);
  const flush = () => new Promise((r) => setImmediate(r));
  async function settle(expect) {
    await flush();
    const p = pending.shift();
    assert.ok(p, "nothing pending, wanted " + expect);
    assert.equal(p.name, expect, "the FIFO settles in call order");
    p.res(); await flush(); await flush();
  }
  async function drain() { await flush(); while (pending.length) { pending.shift().res(); await flush(); await flush(); } }
  const root = new El("dialog");
  docRoot.appendChild(root);
  DataHub.init(root);
  const content = () => root.find((n) => n.id === "dh-panel");
  const tab = (id) => root.find((n) => n.id === "dh-tab-" + id).dispatch("click");
  return { DataHub, root, content, tab, settle, drain, flush, pending, resultKeys };
}

// LIVE booted on the latest session, the player has just picked "Picked GP"
// (sessions(40) queued) — the shared opening of both interleavings below.
async function pickInLive(h) {
  h.DataHub.open("live");
  await h.drain();
  const gpSel = h.content().selects()[0];
  assert.equal(gpSel.children.map((o) => o.textContent).join(" | "), "Latest GP | Picked GP");
  gpSel.value = "40"; gpSel.dispatch("change"); await h.flush();
}

test("a late pick on a picker the player left does nothing: the tab now loading still renders", async () => {
  const h = harness();
  await pickInLive(h);
  h.tab("results"); await h.flush();               // first RESULTS visit: ensureSession queues latestSession
  await h.settle("sessions(40)");                  // LIVE's detached picker answers
  await h.settle("latestSession");
  await h.drain();
  assert.equal(h.content().querySelector(".dh-loading"), null, "RESULTS painted, not LOADING forever");
  assert.ok(h.content().querySelector(".dh-picker"), "…its own picker is up");
});

test("a pick that lands while latestSession() is in flight is not overwritten by it", async () => {
  const h = harness();
  await pickInLive(h);
  h.tab("results"); await h.flush();               // latestSession queued behind sessions(40)
  h.tab("live"); await h.flush();                  // back on LIVE: its cached picker is attached again
  await h.settle("sessions(40)");                  // the pick lands on a connected picker: pinned to 400
  await h.settle("latestSession");                 // …and the late latest answer must not replace it
  await h.drain();
  h.resultKeys.length = 0;
  h.tab("results");
  await h.drain();
  assert.deepEqual(h.resultKeys, [400], "RESULTS shows the session the player picked, not the latest one");
});
