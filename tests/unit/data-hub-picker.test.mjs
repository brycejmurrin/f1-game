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

function harness({ motion, latest = undefined, realTelemetry = false, drivers = [], sessions, scheduleOnline = true,
                   emptyMeeting = null, emptyYear = null } = {}) {
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
    showModal() { this.open = true; }
    close() {
      if (!this.open) return;
      this.open = false;
      setTimeout(() => this.dispatch("close"), 0);   // native close queues its event
    }
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
  const pending = [], resultKeys = [], fastestKeys = [];
  const defer = (name, value) => new Promise((res, reject) => pending.push({ name, res: () => res(value), reject }));
  const LATEST = latest !== undefined ? latest
    : { sessionKey: 500, meetingKey: 50, year: 2026, name: "Race", type: "Race", dateStart: "2026-10-04T12:00:00Z" };
  const meetingYears = [];
  let cancels = 0, scheduleCalls = 0;
  const F1API = {
    schedule: () => { scheduleCalls++; return scheduleOnline ? Promise.resolve([]) : Promise.reject(new Error("offline")); },
    latestSession: () => defer("latestSession", LATEST),
    meetings: (year) => { meetingYears.push(year); return defer("meetings", year === emptyYear ? [] : [{ meetingKey: 50, name: "Latest GP", dateStart: "2026-10-01" }, { meetingKey: 40, name: "Picked GP", dateStart: "2026-09-01" }]); },
    sessionsForMeeting: (mk) => defer("sessions(" + mk + ")", mk === emptyMeeting ? [] : sessions || [{ sessionKey: mk * 10, meetingKey: mk, name: "Race", type: "Race", dateStart: "2026-09-01T12:00:00Z" }]),
    sessionResult: (sk) => { resultKeys.push(sk); return defer("sessionResult", []); },
    sessionDrivers: () => defer("drivers", drivers),
    fastestLap: (sessionKey, num) => { fastestKeys.push({ sessionKey, num }); return defer("fastestLap", null); },
    driverStandings: () => defer("driverStandings", []), constructorStandings: () => defer("constructorStandings", []),
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
  return { DataHub, root, content, tab, settle, api: F1API, get cancels() { return cancels; }, get scheduleCalls() { return scheduleCalls; }, setOnline: (v) => { scheduleOnline = v; }, setEmptyMeeting: (v) => { emptyMeeting = v; }, drain, flush, pending, resultKeys, fastestKeys, scrolls, document, byId, place, meetingYears };
}

function lateResults(h, cached) {
  const url = "https://api.openf1.org/v1/session_result?session_key=500";
  const data = [{ pos: 1, num: 44, laps: 70, points: 25, duration: 6000, gap: 0 }];
  const at = Date.now() - 4 * 3600000;
  const store = new Map(cached ? [["apex26.api." + url, JSON.stringify({ t: at, data })]] : []);
  let rejectBody, requests = 0;
  const ctx = vm.createContext({ Date, AbortController, setTimeout, clearTimeout, Log: { info() {}, warn() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: () => {
      requests++;
      return requests === 1 ? new Promise((_, reject) => { rejectBody = reject; }) : Promise.resolve(data);
    } }),
    localStorage: { get length() { return store.size; }, key: (i) => [...store.keys()][i],
      getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/api-transport.js"), "utf8"), ctx);
  const transport = vm.runInContext("F1Transport", ctx).create("https://api.openf1.org/v1", 7 * 86400000);
  let finished;
  Object.assign(h.api, { sessionResult: () => (finished = transport.request(url, 60000)),
    staleMark: transport.staleMark, staleSince: transport.staleSince });
  return { fail: () => rejectBody(new Error("body disconnected after headers")), get finished() { return finished; }, get requests() { return requests; }, at };
}

test("Results dates a late body-failure fallback when the nested request settles", async () => {
  const h = harness(), transport = lateResults(h, true);
  h.DataHub.open("results"); await h.flush(); await h.settle("latestSession");
  assert.match(h.content().textContent, /LOADING/);
  assert.equal(h.content().querySelector(".dh-footnote"), null, "a pending classification has no freshness claim");
  transport.fail(); await h.drain();
  assert.match(h.content().textContent, /offline copy/i);
  assert.doesNotMatch(h.content().textContent, /updated just now/);
  assert.match(h.content().textContent, /Car 44/);
  h.tab("schedule"); await h.drain(); h.tab("results"); await h.flush();
  assert.match(h.content().textContent, /offline copy/i, "provenance survives tab reuse");
  h.DataHub.close();
});

test("Results offers a working RETRY after a nested body failure, including tab reentry", async () => {
  const h = harness(), transport = lateResults(h, false);
  h.DataHub.open("results"); await h.flush(); await h.settle("latestSession");
  transport.fail(); await h.drain();
  assert.ok(h.content().querySelector(".dh-retry"));
  assert.doesNotMatch(h.content().textContent, /CACHED|updated just now/);
  h.tab("schedule"); await h.drain(); h.tab("results"); await h.flush();
  assert.ok(h.content().querySelector(".dh-retry"));
  h.content().querySelector(".dh-retry").dispatch("click"); await h.drain();
  await transport.finished; await h.flush();
  assert.equal(transport.requests, 2);
  assert.match(h.content().textContent, /Car 44/);
  assert.equal(h.content().querySelector(".dh-retry"), null);
  assert.match(h.content().textContent, /updated just now/);
  h.DataHub.close();
});

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

test("open() is a no-op while Settings is visible", async () => {
  // Cold DATA/WATCH → SETTINGS before ensureDataHub resolves: late open() must
  // not reveal the hub over #pmsettings. Pause itself stays out of BLOCKING_SEL
  // so intentional paused WATCH entry still works.
  const h = harness();
  h.place("pmsettings", false);
  h.root.hidden = true;
  h.DataHub.open("export");
  await h.drain();
  assert.equal(h.root.hidden, true, "hub must stay closed under Settings");
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
  // Keep each mutation handler so it can be exercised against a deferred load,
  // including summary buttons whose nodes LOAD subsequently detaches.
  const remove = h.content().querySelector(".dh-lane-x");
  const clear = h.content().querySelector(".dh-lane-clear");
  go.dispatch("click"); await h.flush();
  assert.equal(h.pending.filter((p) => p.name === "fastestLap").length, 2, "both lanes are fetching");
  return { chips, remove, clear };
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

// 14-F5: M24 aborted the lanes only on LEAVING the tab. Changing GP / YEAR / SESSION inside TELEMETRY left the
// COMPARE lanes ahead of the picker's own next request in F1API's serialized lane, so the new list waited them out.
const TWO = [{ num: 1, name: "A One", code: "ONE" }, { num: 2, name: "B Two", code: "TWO" }];

test("changing SESSION mid-COMPARE aborts the stale lane fetches before the new driver list is asked for", async () => {
  const h = harness({ realTelemetry: true, drivers: TWO });
  await startCompare(h);
  const [, sesSel] = h.content().selects();
  const before = h.cancels;
  sesSel.value = "500"; sesSel.dispatch("change");
  assert.equal(h.cancels - before, 1, "F1API.cancelAll() ran for the abandoned COMPARE");
  await h.drain();
  assert.ok(h.content().find((n) => n.classList.contains("dh-dchip")), "the new session's driver chips render");
});

test("changing GRAND PRIX mid-COMPARE aborts the lanes BEFORE the picker queues its sessions request", async () => {
  const h = harness({ realTelemetry: true, drivers: TWO });
  await startCompare(h);
  const [gpSel] = h.content().selects();
  const before = h.cancels;
  gpSel.value = "40"; gpSel.dispatch("change");
  assert.equal(h.cancels - before, 1, "cancelled synchronously, ahead of sessions(40)");
  assert.ok(h.pending.some((p) => p.name === "sessions(40)"), "the picker's own request is the one that follows");
  await h.drain();
});

test("changing GP / SESSION with no lane in flight cancels nothing", async () => {
  const h = harness({ realTelemetry: true, drivers: TWO });
  h.DataHub.open("telemetry");
  await h.drain();
  const [gpSel, sesSel] = h.content().selects();
  const before = h.cancels;
  sesSel.value = "500"; sesSel.dispatch("change"); await h.drain();
  gpSel.value = "40"; gpSel.dispatch("change"); await h.drain();
  assert.equal(h.cancels, before);
});

for (const outcome of ["success", "error"]) test(`deselecting a pending telemetry driver ignores its late ${outcome}`, async () => {
  const h = harness({ realTelemetry: true, drivers: TWO });
  h.DataHub.open("telemetry"); await h.drain();
  const chip = h.content().find((n) => n.classList.contains("dh-dchip"));
  chip.dispatch("click");
  h.content().find((n) => n.classList.contains("dh-livebtn") && /LOAD FASTEST LAP/.test(n.textContent)).dispatch("click");
  await h.flush();
  const request = h.pending.shift();
  assert.equal(request.name, "fastestLap");
  const before = h.cancels;
  chip.dispatch("click");
  assert.match(h.content().querySelector(".dh-telem-detail").textContent, /Select one driver/);
  if (outcome === "success") request.res(); else request.reject(new Error("late network failure"));
  await h.drain();
  assert.equal(!!h.root.querySelector(".dh-tpopup"), false, "old selection cannot open a modal");
  assert.equal(!!h.content().querySelector(".dh-error"), false, "old selection cannot replace the tray with an error");
  assert.match(h.content().querySelector(".dh-telem-detail").textContent, /Select one driver/);
  assert.equal(h.cancels, before + 1, "abandoned lane work releases the transport");
  h.DataHub.close();
});

for (const tab of ["results", "live", "telemetry"]) for (const empty of ["meeting", "year"]) {
  test(`${tab}: a successful empty ${empty} clears the previous session and survives sibling visits`, async () => {
    const year = new Date().getFullYear() - 1;
    const h = harness({ realTelemetry: true, drivers: TWO,
      emptyMeeting: empty === "meeting" ? 40 : null, emptyYear: empty === "year" ? year : null,
      latest: { sessionKey: 500, meetingKey: 50, year: new Date().getFullYear(), name: "OLD SESSION", type: "Race", circuit: "OLD CIRCUIT" } });
    h.DataHub.open(tab); await h.drain();
    assert.match(h.content().textContent, /OLD SESSION/);
    if (empty === "meeting") {
      const gp = h.content().selects()[0]; gp.value = "40"; gp.dispatch("change");
    } else {
      h.content().find((n) => n.tagName === "BUTTON" && n.textContent === String(year)).dispatch("click");
    }
    await h.drain();
    assert.doesNotMatch(h.content().textContent, /OLD SESSION|OLD CIRCUIT/);
    assert.match(h.content().textContent, /no data/);
    assert.ok(h.content().querySelector(".dh-empty"), "the old body is replaced by the tab's empty state");
    h.tab(tab === "results" ? "live" : "results"); await h.flush();
    assert.equal(h.pending.some((p) => p.name === "latestSession"), false, "empty explicit selection must not revert to latest");
    await h.drain();
    assert.doesNotMatch(h.content().textContent, /OLD SESSION|OLD CIRCUIT/);
    assert.ok(h.content().querySelector(".dh-picker"), "an empty selection keeps its picker available");
    h.tab(tab); await h.drain();
    if (empty === "meeting") {
      const gp = h.content().selects()[0]; gp.value = "50"; gp.dispatch("change");
    } else {
      h.content().find((n) => n.tagName === "BUTTON" && n.textContent === String(year + 1)).dispatch("click");
    }
    await h.drain();
    assert.match(h.content().textContent, /Race/);
    assert.doesNotMatch(h.content().selects()[1].textContent, /no data/);
    h.DataHub.close();
  });
}

for (const empty of ["meeting", "year"]) for (const nextTab of ["standings", "telemetry"]) {
  test(`a detached empty ${empty} stays selected while ${nextTab}'s current load settles`, async () => {
    const year = new Date().getFullYear() - 1;
    const h = harness({ realTelemetry: true, drivers: TWO, emptyMeeting: empty === "meeting" ? 40 : null,
      emptyYear: empty === "year" ? year : null });
    h.DataHub.open("results"); await h.drain();
    if (empty === "meeting") {
      const gp = h.content().selects()[0]; gp.value = "40"; gp.dispatch("change");
    } else h.content().find((n) => n.tagName === "BUTTON" && n.textContent === String(year)).dispatch("click");
    h.tab(nextTab); await h.flush();
    await h.settle(empty === "meeting" ? "sessions(40)" : "meetings");
    await h.drain();
    assert.equal(!!h.content().querySelector(".dh-loading"), false, "the abandoned pick did not invalidate the current loader");
    h.resultKeys.length = 0;
    h.tab("results"); await h.flush();
    assert.equal(h.pending.some((p) => p.name === "latestSession"), false, "the detached empty pick remains pinned");
    await h.drain();
    assert.deepEqual(h.resultKeys, [], "the previous race is not fetched again");
    assert.ok(h.content().querySelector(".dh-empty"));
    assert.match(h.content().textContent, /no data/);
    h.DataHub.close();
  });
}

for (const tab of ["results", "live", "telemetry"]) {
  test(`${tab}: a pinned empty meeting hydrates its body when sessions become available on rebuild`, async () => {
    const h = harness({ realTelemetry: true, drivers: TWO, emptyMeeting: 40 });
    h.DataHub.open(tab); await h.drain();
    const gp = h.content().selects()[0]; gp.value = "40"; gp.dispatch("change"); await h.drain();
    assert.ok(h.content().querySelector(".dh-empty"));
    h.DataHub.close(); h.setEmptyMeeting(null);
    h.DataHub.open(tab); await h.drain();
    assert.equal(h.content().selects()[1].children.some((op) => op.textContent === "Race"), true);
    const body = h.content().querySelector(tab === "results" ? ".dh-res-body" : ".dh-split-L");
    assert.match(body.textContent, /Race/, "the selected session and rendered body agree");
    if (tab !== "results") assert.ok(h.content().querySelector(".dh-live-title"), "session metadata is rendered outside the picker");
    if (tab === "telemetry") assert.ok(h.content().querySelector(".dh-dchip"));
    h.DataHub.close();
  });
}

test("detached hydration cannot invalidate or strand the newly loading session tab", async () => {
  const h = harness({ realTelemetry: true, drivers: TWO, emptyMeeting: 40 });
  h.DataHub.open("results"); await h.drain();
  const gp = h.content().selects()[0]; gp.value = "40"; gp.dispatch("change"); await h.drain();
  h.DataHub.close(); h.setEmptyMeeting(null);
  h.DataHub.open("results"); await h.flush();
  h.tab("telemetry"); await h.flush();
  await h.drain();
  assert.equal(!!h.content().querySelector(".dh-loading"), false);
  assert.ok(h.content().querySelector(".dh-dchip"), "the attached tab hydrates even if the detached picker filled shared metadata first");
  h.DataHub.close();
});

// A tray edit is a new intent even when the old provider ignores cancellation.
// Resolve AND reject the old requests: neither completion owns the new detail.
for (const mutation of ["chip", "remove", "clear"]) {
  for (const outcome of ["success", "failure"]) {
    test(`telemetry ${mutation} invalidates a pending comparison's late ${outcome}`, async () => {
      const h = harness({ realTelemetry: true, drivers: TWO });
      const controls = await startCompare(h);
      const before = h.cancels;
      (mutation === "chip" ? controls.chips[0] : controls[mutation]).dispatch("click");
      assert.equal(h.cancels, before + 1, "the abandoned lanes release the provider queue immediately");
      const detail = h.content().querySelector(".dh-telem-detail");
      const selected = detail.textContent;
      assert.match(selected, mutation === "clear" ? /Select one driver/ : /B Two/);
      assert.equal(detail.querySelector(".dh-spinner"), null);
      const old = h.pending.splice(0);
      assert.equal(old.length, 2);
      old.forEach((p) => outcome === "success" ? p.res() : p.reject(new Error("old lane failed")));
      await h.flush(); await h.flush();
      assert.equal(detail.textContent, selected, "late work preserves the current selection");
      assert.equal(h.root.querySelector(".dh-tpopup"), null, "late success cannot resurrect a popup");
      assert.equal(detail.querySelector(".dh-error"), null, "late failure cannot offer RETRY for old lanes");
    });
  }
}

test("a new telemetry load wins while cancelled lanes unwind, and its summary rebuild does not cancel it", async () => {
  const h = harness({ realTelemetry: true, drivers: TWO });
  const { chips } = await startCompare(h);
  chips[0].dispatch("click");
  const afterEdit = h.cancels;
  h.content().find((n) => n.classList.contains("dh-livebtn") && n.textContent === "LOAD FASTEST LAP").dispatch("click");
  await h.flush();
  assert.equal(h.pending.length, 3);
  h.pending.pop().res();                             // newest load finishes first
  await h.flush(); await h.flush();
  const popup = h.root.querySelector(".dh-tpopup");
  assert.ok(popup && popup.open, "the current successful load opens its popup");
  assert.match(popup.textContent, /B Two/);
  assert.doesNotMatch(popup.textContent, /A One/);
  assert.equal(h.cancels, afterEdit, "success calls syncChips without cancelling the new view");
  const old = h.pending.splice(0);
  old[0].res(); old[1].reject(new Error("cancelled old lane failed late"));
  await h.flush(); await h.flush();
  assert.equal(h.root.querySelector(".dh-tpopup"), popup, "out-of-order stale completions leave the current popup alone");
  assert.equal(h.content().querySelector(".dh-error"), null);
  h.DataHub.close();
});

test("tray mutation invalidation preserves a driver's cross-session comparison within one meeting", async () => {
  const h = harness({ realTelemetry: true, drivers: TWO, sessions: [
    { sessionKey: 499, meetingKey: 50, name: "Qualifying", type: "Qualifying" },
    { sessionKey: 500, meetingKey: 50, name: "Race", type: "Race" }
  ] });
  h.DataHub.open("telemetry"); await h.drain();
  h.content().querySelector(".dh-dchip").dispatch("click");
  const [, session] = h.content().selects();
  session.value = "499"; session.dispatch("change"); await h.drain();
  h.content().querySelector(".dh-dchip").dispatch("click");
  const go = h.content().find((n) => n.classList.contains("dh-livebtn") && /COMPARE 2/.test(n.textContent));
  assert.ok(go, "the Race lane survives the session switch and Qualifying adds a second lane");
  const before = h.cancels;
  go.dispatch("click"); await h.drain();
  assert.deepEqual(h.fastestKeys, [{ sessionKey: 500, num: 1 }, { sessionKey: 499, num: 1 }]);
  assert.equal(h.cancels, before, "a successful current comparison is not cancelled by syncChips");
  const popup = h.root.querySelector(".dh-tpopup");
  assert.ok(popup && popup.open);
  assert.match(popup.textContent, /A One R vs A One Q/);
  h.DataHub.close();
});
