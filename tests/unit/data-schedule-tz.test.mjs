// THE SCHEDULE'S DATE AND TIME COME FROM ONE INSTANT IN ONE ZONE.
// js/data/schedule.js printed the start time in the viewer's zone but the date
// in UTC, so a Las Vegas GP (2026-11-22, 04:00Z) read "22 Nov · 20:00 PST" in
// California — a day adrift. NEXT was also picked against today's UTC date.
// The zone is pinned BEFORE any Date use: Node re-reads process.env.TZ.
process.env.TZ = "America/Los_Angeles";

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../../js/data/schedule.js", import.meta.url), "utf8");
const API_SRC = readFileSync(new URL("../../js/data/api.js", import.meta.url), "utf8");
const ctx = vm.createContext({});
vm.runInContext(SRC + ";globalThis.DataSchedule = DataSchedule;", ctx, { filename: "js/data/schedule.js" });
const S = ctx.DataSchedule;

const VEGAS = { date: "2026-11-22", time: "04:00:00Z", name: "Las Vegas Grand Prix" };

test("the zone pin took effect", () => {
  assert.equal(new Date(Date.parse("2026-11-22T04:00:00Z")).getDate(), 21, "LA is UTC-8 in November");
});

test("Las Vegas: the date is the viewer's LOCAL day of the race instant (21 Nov in LA)", () => {
  const label = S.dateLabel(VEGAS);
  assert.match(label, /21/, label);
  assert.doesNotMatch(label, /22/, label);
  assert.match(label, /Nov/, label);
});

test("a date-only entry stays a UTC calendar day (the earlier UTC+13 fix)", () => {
  const label = S.dateLabel({ date: "2026-11-22" });
  assert.match(label, /22/, label);
});

test("NEXT compares the race instant with now, not today's UTC date", () => {
  const at = Date.parse("2026-11-22T04:00:00Z");
  assert.equal(S.isUpcoming(VEGAS, at - 60e3), true, "a minute before lights out");
  assert.equal(S.isUpcoming(VEGAS, at + 60 * 60e3), true, "an hour in: still running");
  assert.equal(S.isUpcoming(VEGAS, at + 3 * 3600e3), false,
    "three hours after the start it is over, even though the UTC date is still the 22nd");
  // Date-only entries keep the day comparison.
  assert.equal(S.isUpcoming({ date: "2026-11-22" }, Date.parse("2026-11-22T20:00:00Z")), true);
  assert.equal(S.isUpcoming({ date: "2026-11-22" }, Date.parse("2026-11-23T01:00:00Z")), false);
});

test("a malformed time falls back to the date-only rules", () => {
  const r = { date: "2026-11-22", time: "garbage" };
  assert.ok(Number.isNaN(S.raceInstant(r)));
  assert.match(S.dateLabel(r), /22/);
});

test("schedule venue lines do not stamp a native title (scroll leaves it hung)", async () => {
  const nodes = [];
  function el(tag, cls, text) {
    const n = {
      tag, cls, text: text || "", attrs: {}, listeners: {}, children: [],
      addEventListener(t, f) { (n.listeners[t] = n.listeners[t] || []).push(f); },
      removeAttribute(k) { delete n.attrs[k]; },
      set title(v) { n.attrs.title = v; },
      get title() { return n.attrs.title; },
      appendChild(c) { n.children.push(c); return c; },
      classList: { add() {} },
      scrollWidth: 0, clientWidth: 0
    };
    nodes.push(n);
    return n;
  }
  const ctx2 = vm.createContext({
    F1API: { schedule: () => Promise.resolve([{
      round: 1, name: "Australian Grand Prix", circuit: "Albert Park Circuit",
      locality: "Melbourne", country: "Australia", date: "2026-03-08", time: "05:00:00Z"
    }]) }
  });
  vm.runInContext(SRC + ";globalThis.DataSchedule = DataSchedule;", ctx2, { filename: "schedule.js" });
  const { loadSchedule } = ctx2.DataSchedule.create({ el, emptyMsg: (t) => el("div", "empty", t) });
  await loadSchedule();
  const sub = nodes.find((n) => n.cls === "dh-race-sub");
  assert.ok(sub, "a venue line exists");
  assert.equal(sub.attrs.title, undefined, "no title until the line actually ellipsizes");
  sub.listeners.mouseenter[0]();
  assert.equal(sub.attrs.title, undefined, "a fully-visible line still has no title");
  sub.scrollWidth = 400; sub.clientWidth = 120;
  sub.listeners.mouseenter[0]();
  assert.equal(sub.attrs.title, "Albert Park Circuit · Melbourne, Australia");
  sub.listeners.mouseleave[0]();
  assert.equal(sub.attrs.title, undefined, "leave clears the tip so scroll cannot hang it");
});

// #2190 (3): the Schedule node is reused for hours, so NEXT must say when it
// moves on; hub.js drops a reused node whose `nextFlipAt` has passed.
test("nextFlipAt: NEXT moves on at race start + 2 h (or the next UTC day for a date-only entry)", () => {
  const at = Date.parse("2026-11-22T04:00:00Z");
  const items = [{ date: "2026-11-08", time: "18:00:00Z" }, VEGAS, { date: "2026-12-06", time: "13:00:00Z" }];
  assert.equal(S.nextFlipAt(items, at - 3600e3), at + 2 * 3600e3);
  assert.equal(S.nextFlipAt(items, at + 2 * 3600e3), Date.parse("2026-12-06T15:00:00Z"));
  assert.equal(S.nextFlipAt([{ date: "2026-11-22" }], Date.parse("2026-11-22T10:00:00Z")), Date.parse("2026-11-23T00:00:00Z"));
  assert.equal(S.nextFlipAt(items, Date.parse("2027-01-01T00:00:00Z")), Infinity);
});

test("nextRace uses instants across DST and keeps a date-only fallback", () => {
  const springForward = [
    { name: "Finished", date: "2026-03-08", time: "07:30:00Z" },
    { name: "DST edge", date: "2026-03-08", time: "10:30:00Z" },
    { name: "Later", date: "2026-03-15" }
  ];
  assert.equal(S.nextRace(springForward, Date.parse("2026-03-08T10:00:00Z")).name, "DST edge");
  assert.equal(S.nextRace(springForward, Date.parse("2026-03-08T13:00:01Z")).name, "Later");
  assert.equal(S.nextRace([{ name: "Calendar only", date: "2026-11-01" }],
    Date.parse("2026-11-01T23:59:59Z")).name, "Calendar only");
  assert.equal(S.nextRace([{ date: "2026-11-01" }], Date.parse("2026-11-02T00:00:00Z")), null);
});

test("weekendSessions returns conventional and sprint weekends in UTC order", () => {
  const normal = S.weekendSessions({
    date: "2026-03-08", time: "05:00:00Z",
    sessions: {
      fp1: { date: "2026-03-06", time: "01:30:00Z" },
      fp2: { date: "2026-03-06", time: "05:00:00Z" },
      fp3: { date: "2026-03-07", time: "01:30:00Z" },
      q: { date: "2026-03-07", time: "05:00:00Z" }
    }
  });
  assert.deepEqual(Array.from(normal, (x) => x.key), ["fp1", "fp2", "fp3", "q", "r"]);
  assert.deepEqual(Array.from(normal, (x) => x.label), ["FP1", "FP2", "FP3", "Q", "R"]);
  assert.ok(normal.every((x) => Number.isFinite(x.startMs) && x.endMs > x.startMs && x.est === true));

  const sprint = S.weekendSessions({
    date: "2026-10-25", time: "19:00:00Z",
    sessions: {
      fp1: { date: "2026-10-23", time: "17:30:00Z" },
      sq: { date: "2026-10-23", time: "21:30:00Z" },
      s: { date: "2026-10-24", time: "18:00:00Z" },
      q: { date: "2026-10-24", time: "22:00:00Z" }
    }
  });
  assert.deepEqual(Array.from(sprint, (x) => x.key), ["fp1", "sq", "s", "q", "r"]);
  assert.equal(sprint.find((x) => x.key === "sq").endMs - sprint.find((x) => x.key === "sq").startMs, 45 * 60e3);
  assert.equal(sprint.find((x) => x.key === "s").endMs - sprint.find((x) => x.key === "s").startMs, 30 * 60e3);
  assert.deepEqual(Array.from(S.weekendSessions({ date: "2026-11-22" }), (x) => x.key), [],
    "a date-only race cannot invent a session instant");
});

test("F1API.schedule preserves Jolpica weekend session dates and times", async () => {
  const body = { MRData: { RaceTable: { Races: [{
    round: "19", raceName: "United States Grand Prix", date: "2026-10-25", time: "19:00:00Z",
    FirstPractice: { date: "2026-10-23", time: "17:30:00Z" },
    SprintQualifying: { date: "2026-10-23", time: "21:30:00Z" },
    Sprint: { date: "2026-10-24", time: "18:00:00Z" },
    Qualifying: { date: "2026-10-24", time: "22:00:00Z" }
  }] } } };
  const noop = () => {};
  const apiCtx = vm.createContext({
    F1Transport: { create: () => ({
      request: () => Promise.resolve(body), cancelAll: noop, cacheEntryT: noop,
      staleMark: noop, staleSince: noop, forget: noop
    }) }
  });
  vm.runInContext(API_SRC + ";globalThis.F1API = F1API;", apiCtx, { filename: "js/data/api.js" });
  const [race] = await apiCtx.F1API.schedule();
  assert.deepEqual(JSON.parse(JSON.stringify(race.sessions)), {
    fp1: { date: "2026-10-23", time: "17:30:00Z" },
    sq: { date: "2026-10-23", time: "21:30:00Z" },
    s: { date: "2026-10-24", time: "18:00:00Z" },
    q: { date: "2026-10-24", time: "22:00:00Z" },
    r: { date: "2026-10-25", time: "19:00:00Z" }
  });
});

test("countdown is stable at boundaries and never goes negative", () => {
  assert.equal(S.countdown(2 * 86400e3 + 3 * 3600e3 + 4 * 60e3 + 5e3), "2d 03h 04m");
  assert.equal(S.countdown(3 * 3600e3 + 4 * 60e3 + 5e3), "3h 04m 05s");
  assert.equal(S.countdown(4 * 60e3 + 5e3), "4m 05s");
  assert.equal(S.countdown(999), "0m 00s");
  assert.equal(S.countdown(0), "STARTED");
  assert.equal(S.countdown(-1), "STARTED");
});


test("countdown ownership retires document observers and timers, including queued deliveries", async () => {
  const observers = new Set(), timers = new Set(), microtasks = [];
  class Observer {
    constructor(fn) { this.fn = fn; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  function el(tag, cls, text) {
    return {tag, cls, text, attrs: {}, isConnected: false, parentElement: null, children: [],
      addEventListener() {}, removeAttribute(k) { delete this.attrs[k]; },
      setAttribute(k, value) { this.attrs[k] = value; },
      appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
      classList: {add() {}}, scrollWidth: 0, clientWidth: 0};
  }
  const context = vm.createContext({MutationObserver: Observer,
    document: {documentElement: {}, querySelector: () => null},
    queueMicrotask: fn => microtasks.push(fn),
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: id => timers.delete(id),
    F1API: {schedule: () => Promise.resolve([{...VEGAS, date: "2099-11-22"}])}});
  vm.runInContext(SRC + ";globalThis.S = DataSchedule;", context);
  const {loadSchedule} = context.S.create({el, emptyMsg: t => el("div", "empty", t)});
  for (let i = 0; i < 40; i++) {
    const wrap = await loadSchedule();
    const observer = Array.from(observers)[0];
    wrap.dispose(); wrap.dispose();
    // A queued delivery or initial sync cannot restart a disposed interval.
    wrap.isConnected = true;
    while (microtasks.length) microtasks.shift()();
    observer.fn();
  }
  assert.equal(observers.size, 0);
  assert.equal(timers.size, 0);
  const cached = await loadSchedule();
  cached.isConnected = true;
  while (microtasks.length) microtasks.shift()();
  assert.equal(timers.size, 1, "late attachment starts the countdown");
  const observer = Array.from(observers)[0];
  cached.hidden = true; observer.fn();
  assert.equal(timers.size, 0);
  assert.equal(observers.size, 1, "a cached view keeps its observer until replaced");
  cached.hidden = false; observer.fn();
  assert.equal(timers.size, 1, "cached view resumes on return");
  cached.dispose(); observer.fn();
  assert.equal(timers.size, 0);
  assert.equal(observers.size, 0);
});
