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

function harness({ motion, latest = undefined, realTelemetry = false, drivers = [], scheduleOnline = true } = {}) {
  let docRoot = null;
  const scrolls = [];
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
    get parentElement() { return this.parentNode; }
    scrollWidth = 0; clientWidth = 0; scrollLeft = 0; offsetLeft = 0; offsetWidth = 0;
    querySelector(s) { const c = s.replace(/^\./, ""); for (const ch of this.children) { if (ch._cls.has(c)) return ch; const r = ch.querySelector(s); if (r) return r; } return null; }
    find(pred) { for (const ch of this.children) { if (pred(ch)) return ch; const r = ch.find(pred); if (r) return r; } return null; }
    selects() { const out = []; (function walk(n) { n.children.forEach((c) => { if (c.tagName === "SELECT") out.push(c); walk(c); }); })(this); return out; }
    focus() {}
    scrollIntoView(o) { scrolls.push({ id: this.id, o }); }
  }
  docRoot = new El("html");
  const byId = {};
  const docListeners = {};
  const document = {
    createElement: (t) => new El(t),
    getElementById: (id) => byId[id] || null,
    querySelectorAll(sel) {
      const out = [];
      String(sel).split(",").forEach((part) => {
        const id = part.replace(/:not\(\[hidden\]\)/g, "").replace(/^#/, "").trim();
        if (id && byId[id]) out.push(byId[id]);
      });
      return out;
    },
    addEventListener(t, f, opts) {
      const cap = opts === true || !!(opts && opts.capture);
      (docListeners[t + (cap ? ":cap" : "")] ||= []).push(f);
    },
    dispatch(t, ev, cap) { (docListeners[t + (cap ? ":cap" : "")] || []).forEach((f) => f(ev)); },
    activeElement: null, hidden: false,
    documentElement: { dataset: motion ? { motion } : {} },
  };
  function place(id, hidden) {
    const n = new El("dialog"); n.id = id; n.hidden = hidden !== false; byId[id] = n; docRoot.appendChild(n); return n;
  }
  const pending = [], resultKeys = [];
  const defer = (name, value) => new Promise((res) => pending.push({ name, res: () => res(value) }));
  const LATEST = latest !== undefined ? latest
    : { sessionKey: 500, meetingKey: 50, year: 2026, name: "Race", type: "Race", dateStart: "2026-10-04T12:00:00Z" };
  const meetingYears = [];
  let cancels = 0, scheduleCalls = 0;
  const F1API = {
    schedule: () => { scheduleCalls++; return scheduleOnline ? Promise.resolve([]) : Promise.reject(new Error("offline")); },
    latestSession: () => defer("latestSession", LATEST),
    meetings: (year) => { meetingYears.push(year); return defer("meetings", [{ meetingKey: 50, name: "Latest GP", dateStart: "2026-10-01" }, { meetingKey: 40, name: "Picked GP", dateStart: "2026-09-01" }]); },
    sessionsForMeeting: (mk) => defer("sessions(" + mk + ")", [{ sessionKey: mk * 10, meetingKey: mk, name: "Race", type: "Race", dateStart: "2026-09-01T12:00:00Z" }]),
    sessionResult: (sk) => { resultKeys.push(sk); return defer("sessionResult", []); },
    sessionDrivers: () => defer("drivers", drivers),
    fastestLap: () => defer("fastestLap", null),
    weather: () => defer("weather", null), livePositions: () => defer("pos", { values: [], cursor: null }),
    liveIntervals: () => defer("int", { values: {}, cursor: null }),
    cancelAll() { cancels++; }, cacheEntryT: () => null,
  };
  const ctx = vm.createContext({ document, F1API, Log: { info() {}, warn() {} }, navigator: { onLine: true }, queueMicrotask, console,
    localStorage: { length: 0, key: () => null, getItem: () => null }, setTimeout, clearTimeout, Teams: { LIST: [] },
    DataTelemetry: { create: () => ({ loadTelemetry: () => Promise.resolve(new El("div")), closeTelemPopup() {} }) },
    DataRealRace: { create: () => ({ loadRealRace: () => Promise.resolve(new El("div")), cancel() {} }) },
    DataExport: { create: () => ({ loadExport: () => Promise.resolve(new El("div")) }) } });
  // realTelemetry: the real telemetry.js + model on a stubbed view (the canvas player is not under test).
  if (realTelemetry) {
    ctx.M4 = { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) };
    ctx.DataTelemetryView = { create: () => ({ buildTelemetryView() {}, pauseAnim() {} }) };
    delete ctx.DataTelemetry;
  }
  const files = ["js/ui/dom.js", "js/data/schedule.js", "js/data/standings.js", "js/data/tab-utils.js", "js/data/results.js", "js/data/live.js"];
  if (realTelemetry) files.push("js/data/telemetry-model.js", "js/data/telemetry.js");
  files.push("js/data/hub.js");
  for (const f of files)
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
  root.id = "datahub";
  docRoot.appendChild(root);
  byId.datahub = root;
  DataHub.init(root);
  const content = () => root.find((n) => n.id === "dh-panel");
  const tab = (id) => root.find((n) => n.id === "dh-tab-" + id).dispatch("click");
  return { DataHub, root, content, tab, settle, get cancels() { return cancels; }, get scheduleCalls() { return scheduleCalls; }, setOnline: (v) => { scheduleOnline = v; }, drain, flush, pending, resultKeys, scrolls, document, byId, place, meetingYears };
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

test("returning to the tab whose pick landed detached rebuilds it: no picker stuck on loading…", async () => {
  const h = harness();
  await pickInLive(h);
  h.tab("results"); await h.flush();
  await h.settle("sessions(40)");                  // LIVE's detached picker answers
  await h.drain();
  h.tab("live");                                   // back inside LIVE's cache window
  await h.drain();
  const [gpSel, sesSel] = h.content().selects();
  assert.ok(gpSel.children.length > 1, "the GP select is filled");
  assert.notEqual(sesSel.children.map((o) => o.textContent).join(" | "), "loading…", "the session select is not stuck on loading…");
});

// The strip only pans when it overflows AND the chip is clipped. A wrap row
// (desktop) or a fully-visible chip must not scroll SCHEDULE off the left.
function markStripOverflow(h, overflow) {
  const strip = h.root.find((n) => n.classList.contains("dh-tabs"));
  assert.ok(strip, "the tab strip exists");
  strip.scrollLeft = 0;
  if (!overflow) {
    strip.scrollWidth = 400;
    strip.clientWidth = 400;
    for (const id of ["schedule", "standings", "results", "live", "telemetry", "race", "export"]) {
      const b = h.root.find((n) => n.id === "dh-tab-" + id);
      b.offsetLeft = 8;
      b.offsetWidth = 72;
    }
    return;
  }
  strip.scrollWidth = 980;
  strip.clientWidth = 360;
  let x = 400;
  for (const id of ["schedule", "standings", "results", "live", "telemetry", "race", "export"]) {
    const b = h.root.find((n) => n.id === "dh-tab-" + id);
    b.offsetLeft = x;
    b.offsetWidth = 80;
    x += 80;
  }
}

// MOTION: REDUCED reaches the tab strip. scrollIntoView's explicit `behavior`
// beats CSS scroll-behavior, so neither reduced-motion backstop (the OS query's
// `scroll-behavior: auto`, html[data-motion]) could reach this glide: the hub
// has to ask, live, at the call.
test("the active tab scrolls into view instantly under MOTION: REDUCED, smoothly otherwise", async () => {
  const h = harness({ motion: "reduce" });
  markStripOverflow(h, true);
  h.DataHub.open("live"); await h.drain();
  h.tab("results"); await h.drain();
  const reduced = h.scrolls.filter((c) => c.id === "dh-tab-results").pop();
  assert.ok(reduced, "switching tabs scrolls the active tab button into view");
  assert.equal(reduced.o.behavior, "auto", "MOTION: REDUCED must not glide the tab strip");
  h.document.documentElement.dataset = {};          // the player turns it back off, mid-session
  h.tab("live"); await h.drain();
  const full = h.scrolls.filter((c) => c.id === "dh-tab-live").pop();
  assert.equal(full.o.behavior, "smooth", "read live: full motion glides again without a reload");
});

test("a fully-visible tab strip does not scrollIntoView (SCHEDULE stays put)", async () => {
  const h = harness();
  markStripOverflow(h, false);
  h.DataHub.open("export"); await h.drain();
  assert.equal(h.scrolls.length, 0, "no overflow → the strip must not pan");
});

// Late ensureDataHub().then(open) used to unhide the hub after How to Play
// (or another title sheet) was already up — both dialog.screen, last
// showModal wins. Skip the open; a How to Play click while the hub is
// already up closes it first (capture, before game.js unhides #howtoplay).
test("open() is a no-op while How to Play is visible", () => {
  const h = harness();
  h.place("howtoplay").hidden = false;
  h.root.hidden = true;
  h.DataHub.open("schedule");
  assert.equal(h.root.hidden, true, "hub must stay closed under How to Play");
  assert.equal(h.DataHub.isOpen(), false);
});

test("open() still works when How to Play is hidden", async () => {
  const h = harness();
  h.place("howtoplay").hidden = true;
  h.root.hidden = true;
  h.DataHub.open("export");
  await h.drain();
  assert.equal(h.root.hidden, false, "title-only: hub opens from #overlay as before");
  assert.equal(h.DataHub.isOpen(), true);
});

test("a How to Play door click closes an open hub", async () => {
  const h = harness();
  const help = h.place("mb-help");
  help.hidden = false;
  const ico = h.document.createElement("svg");
  help.appendChild(ico);
  h.DataHub.open("export");
  await h.drain();
  assert.equal(h.DataHub.isOpen(), true);
  h.document.dispatch("click", { target: ico }, true);
  assert.equal(h.DataHub.isOpen(), false);
  assert.equal(h.root.hidden, true);
});

test("RESULTS cold-start with empty latestSession defaults year (never meetings(null))", async () => {
  // Off-season: latestSession is null. Leaving sel.year null made buildPicker
  // call F1API.meetings(null) → OpenF1 ?year=null and no active year pill.
  const h = harness({ latest: null });
  h.DataHub.open("results");
  await h.drain();
  assert.ok(h.meetingYears.length, "RESULTS still asks for meetings");
  assert.ok(h.meetingYears.every((y) => y != null), "year is never null/undefined");
  assert.doesNotMatch(String(h.meetingYears[0]), /^null$/i);
  const year = new Date().getFullYear();
  assert.equal(h.meetingYears[0], year);
  const active = h.content().find((n) => n.classList.contains("dh-pill") && n.classList.contains("active"));
  assert.ok(active, "one year pill is active");
  assert.equal(active.textContent, String(year));
});

// M24: leaving TELEMETRY mid-COMPARE used to leave its OpenF1 lane fetches queued in F1API's serialized lane, so the next
// tab waited behind work nobody would render. Only hub close() and WATCH cancelled.
async function startCompare(h) {
  h.DataHub.open("telemetry");
  await h.drain();                                   // latestSession, meetings, sessions, drivers
  const chips = [];
  (function walk(n) { n.children.forEach((c) => { if (c.classList.contains("dh-dchip")) chips.push(c); walk(c); }); })(h.content());
  assert.equal(chips.length, 2, "two drivers to pick");
  chips.forEach((c) => c.dispatch("click"));
  const go = h.content().find((n) => n.classList.contains("dh-livebtn") && /COMPARE 2/.test(n.textContent));
  assert.ok(go, "COMPARE 2 LAPS is offered");
  go.dispatch("click"); await h.flush();
  assert.equal(h.pending.filter((p) => p.name === "fastestLap").length, 2, "both lanes are fetching");
}

test("leaving TELEMETRY mid-COMPARE cancels the in-flight lane fetches once, and the tab rebuilds on return", async () => {
  const h = harness({ realTelemetry: true, drivers: [{ num: 1, name: "A One", code: "ONE" }, { num: 2, name: "B Two", code: "TWO" }] });
  await startCompare(h);
  const before = h.cancels;
  h.tab("results"); await h.flush();
  assert.equal(h.cancels - before, 1, "F1API.cancelAll() ran for the abandoned COMPARE");
  await h.drain();
  h.tab("telemetry"); await h.drain();
  assert.ok(h.content().find((n) => n.classList.contains("dh-dchip")), "TELEMETRY is rebuilt with its driver chips, not left half-failed");
  const again = h.cancels;
  h.tab("live"); await h.drain();
  assert.equal(h.cancels, again, "leaving with no lane in flight cancels nothing");
});

// 14-F8: a SCHEDULE / STANDINGS / EXPORT tab that failed stayed "failed" across a
// hub close and reopen (close() only dropped the picker tabs), so a player who
// opened DATA offline, reconnected and reopened it was shown the old error card
// until they found RETRY. A reopen is a fresh intent.
test("closing and reopening the hub retries a tab that failed, instead of repainting its error", async () => {
  const h = harness({ scheduleOnline: false });
  h.DataHub.open("schedule"); await h.drain();
  assert.ok(h.content().querySelector(".dh-error"), "offline: SCHEDULE shows its error card");
  assert.equal(h.scheduleCalls, 1);
  h.DataHub.close(); await h.flush();
  h.setOnline(true);
  h.DataHub.open("schedule"); await h.drain();
  assert.equal(h.scheduleCalls, 2, "the reopen asked again");
  assert.equal(h.content().querySelector(".dh-error"), null, "…and the error card is gone");
});

test("closing the hub keeps a good tab's cached copy (only failures are forgotten)", async () => {
  const h = harness();
  h.DataHub.open("schedule"); await h.drain();
  assert.equal(h.scheduleCalls, 1);
  h.DataHub.close(); await h.flush();
  h.DataHub.open("schedule"); await h.drain();
  assert.equal(h.scheduleCalls, 1, "inside its freshness window the reopen reuses the copy");
});
