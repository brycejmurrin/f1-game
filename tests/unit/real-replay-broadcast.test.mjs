// REAL REPLAY BROADCAST (js/race/broadcast.js with the replay): tower, director rules, battles, PiP and
// the running order's speeds. Split from real-replay-vm.test.mjs (M1-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
import { ROOT, host, scriptIn, line, transportReplay } from "../helpers/real-replay-fixtures.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

test("WATCH event cursor preserves equal-time dispatch, caption bounds, rewinds, restart and reel cuts", () => {
  const { replay, G, options } = transportReplay({}, { completeSubject: true });
  const seen = [], cards = [];
  G.raceRadio = { commentates: () => true, replayEvent: (h) => { seen.push(h.t); return true; } };
  G.announce = (...args) => cards.push(args);
  options.script.passes = [0, 1, 4, 4, 5, 12, 20].map((t, i) => ({ t, lap: i + 1, by: 1, over: 2 }));
  replay.start(options);
  replay.tick(0);
  replay.tick(4);
  replay.tick(0);
  assert.deepEqual(seen, [0, 1, 4, 4], "inclusive time boundary and same-time order, once each");
  replay.seek(8); replay.tick(0);
  assert.deepEqual(seen.slice(4), [5], "caption window includes exactly T minus three seconds");
  replay.tick(0); assert.equal(seen.length, 5, "no repeated event while the clock holds");
  replay.seek(1); replay.tick(0);
  assert.deepEqual(seen.slice(5), [0, 1], "rewind releases the previous cursor history");
  replay.setSpeed(8); replay.seek(4); replay.tick(0);
  assert.equal(cards.length, 3, "fast playback captions both equal-time events and the window's earlier event");
  const valid = cards.at(-1)[3];
  replay.seek(20); assert.equal(valid(), false, "seek still invalidates accepted caption callbacks");
  replay.setSpeed(1); replay.tick(0); assert.equal(seen.at(-1), 20);
  replay.start({ ...options, reel: true });
  seen.length = 0; replay.tick(0); replay.skip(); replay.skip(); replay.tick(8);
  assert.deepEqual(seen, [0, 12], "restart and explicit reel cuts reset to the new event window");
  replay.stop();
});

// ── BROADCAST (js/race/broadcast.js): the timing tower and the AUTO director ──
test("BROADCAST event windows retain stable ties and absolute shown indices without rereading race history", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/race/broadcast.js"), "utf8");
  const B = vm.runInNewContext(source + "; Broadcast", {});
  const rank = { out: 4, pass: 3, fastest: 2, pit: 1 };
  const list = Array.from({ length: 203 }, (_, i) => ({ t: Math.floor(i / 3), kind: ["pit", "pass", "out", "radio", "fastest"][i % 5], num: i % 7 ? i % 5 : null }));
  const old = (T, shown, lead, ok) => {
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (h.t < T) continue;
      if (h.t > T + lead) break;
      if (shown.has(i) || h.num == null || !rank[h.kind] || (ok && !ok(h.num))) continue;
      if (!best || rank[h.kind] > rank[best.h.kind]) best = { i, h };
    }
    return best;
  };
  for (const T of [-1, 0, 1, 25, 25.5, 66, 67, 100]) for (const lead of [0, 1, 8]) for (const shown of [new Set(), new Set([2, 75, 77, 200])]) {
    for (const ok of [undefined, (num) => num !== 1, (num) => num === 1]) {
      const actual = B.nextEvent(list, T, shown, lead, ok), expected = old(T, shown, lead, ok);
      assert.equal(actual?.i, expected?.i, "same stable absolute event index at " + T);
      if (actual) assert.equal(actual.h, expected.h, "the original event object is retained");
    }
  }
  let reads = 0;
  const counted = list.map((h) => ({ ...h, get t() { reads++; return h.t; } }));
  assert.equal(B.nextEvent(counted, 100, new Set(), 8), null);
  assert.ok(reads <= 8, "a fully past 203-event history takes logarithmic timestamp reads: " + reads);
});

test("BROADCAST tower: the grid at lights out, the leader and gaps at the last line, the car out last, the fastest lap once it is set", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const { script } = scriptIn(g);
    const B = vm.runInContext("Broadcast", g.ctx);
    const racing = script.drivers.filter((d) => !d.dns);
    const grid = host(B.towerAt(script, 0));
    assert.deepEqual(grid.map((r) => r.code), host(racing.slice().sort((a, b) => (a.grid || 99) - (b.grid || 99)).map((d) => d.code)), "before the first line the grid is the order");
    assert.ok(grid.every((r) => r.gap == null && !r.out), "no gaps and nobody out yet");
    // Just after the leader starts lap 32: 31 laps done at the front.
    const lead = script.drivers.find((d) => d.pos === 1);
    const T = lead.lapStart[31] + 1;
    const rows = host(B.towerAt(script, T));
    assert.equal(rows[0].code, "RUS"); assert.equal(rows[0].lap, 31); assert.equal(rows[0].gap, null);
    assert.ok(rows[1].gap > 0, "P2 carries a gap: " + rows[1].gap);
    assert.ok(rows[1].interval > 0 && Math.abs(rows[1].interval - rows[1].gap) < 1e-6, "P2's interval is its gap");
    const out = rows.filter((r) => r.out);
    assert.ok(out.some((r) => r.code === "STR"), "Stroll out on lap 8");
    assert.ok(rows.findIndex((r) => r.out) >= rows.length - out.length, "the cars out come last");
    for (let i = 2; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (!a.out && !b.out && a.lap === b.lap && !a.down && !b.down && a.gap != null && b.gap != null) assert.ok(b.gap >= a.gap, "gaps grow down the tower at one line: " + a.code + " " + a.gap + " / " + b.code + " " + b.gap);
    }
    assert.ok(rows.filter((r) => !r.out).every((r) => /^[SMHIW]$/.test(r.tyre || "")), "every running car shows its tyre");
    assert.equal(B.fmtGap(rows[0], "gap"), "LEADER");
    assert.match(B.fmtGap(rows[1], "gap"), /^\+\d+\.\d{1,2}$/);   // hundredths under ~10 s (HudReadouts.fmtGapSec), tenths above
    // The fastest lap turns purple only once it is set.
    const f = script.fastest;
    assert.ok(host(B.towerAt(script, f.t - 1)).every((r) => !r.fastest));
    assert.deepEqual(host(B.towerAt(script, f.t + 1)).filter((r) => r.fastest).map((r) => r.num), [f.num]);
  } finally { g.close(); }
});

test("BROADCAST towerAt: pools rows and skips rebuild when the timing-line sample is unchanged", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const { script } = scriptIn(g);
    const B = vm.runInContext("Broadcast", g.ctx);
    const lead = script.drivers.find((d) => d.pos === 1);
    const T0 = lead.lapStart[31] + 1;
    const T1 = T0 + 0.2; // still between timing lines at 4 Hz tower tick
    const a = B.towerAt(script, T0);
    const snap = host(a);
    const b = B.towerAt(script, T1);
    assert.equal(b, a, "same pooled array when the discrete sample is unchanged");
    assert.equal(B.towerSample(script, T0), B.towerSample(script, T1), "sample key stable between crossings");
    assert.deepEqual(host(b), snap, "pooled rows keep the same tower content across a skipped rebuild");
    // Advance past the next leader crossing: sample and content must move.
    const T2 = lead.lapStart[32] + 1;
    assert.notEqual(B.towerSample(script, T0), B.towerSample(script, T2), "a new timing line changes the sample");
    const c = B.towerAt(script, T2);
    assert.equal(c, a, "still the module pool");
    assert.equal(c[0].lap, 32, "leader lap advances after the next crossing");
    assert.notDeepEqual(host(c).map((r) => r.lap), snap.map((r) => r.lap), "row content updates on a new sample");
  } finally { g.close(); }
});

test("BROADCAST director rules: the tightest battle up the order first, the next event by weight, never the same shot twice", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const B = vm.runInContext("Broadcast", g.ctx);
    const cars = [{ key: "a", prog: 1000, speed: 60 }, { key: "b", prog: 970, speed: 60 }, { key: "c", prog: 600, speed: 60 }, { key: "d", prog: 590, speed: 60 }, { key: "e", prog: 400, speed: 60 }];
    const fights = host(B.battles(cars));
    assert.deepEqual(fights.map((x) => x.key), ["d", "b"], "0.17 s for P4 beats 0.5 s for P2; 3 s is no battle");
    const list = [{ t: 10, kind: "pit", num: 1 }, { t: 11, kind: "pass", num: 2 }, { t: 12, kind: "radio", num: 4 }, { t: 30, kind: "out", num: 3 }];
    assert.equal(B.nextEvent(list, 5, new Set(), 8).h.kind, "pass", "a pass outranks a stop in the same window");
    assert.equal(B.nextEvent(list, 5, new Set([1]), 8).h.kind, "pit", "shown once");
    assert.equal(B.nextEvent(list, 5, new Set(), 3), null, "nothing in the next 3 s");
    for (let n = 0; n < 6; n++) assert.notEqual(B.shotFor("pass", "side", n), "side");
  } finally { g.close(); }
});

test("BROADCAST holds an event through its aftermath and keeps the wall-clock minimum at every replay rate", () => {
  for (const speed of [0.25, 1, 8]) {
    const ctx = vm.createContext({ Log: { info() {}, debug() {} },
      CamModes: { CAM_MODES: ["side", "heli", "chase", "tcam", "cinematic", "low"].map((id) => ({ id })) } });
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/broadcast.js"), "utf8"), ctx, { filename: absSrc("js/race/broadcast.js") });
    const B = vm.runInContext("Broadcast", ctx), cuts = [];
    const cars = [{ code: "AAA" }, { code: "BBB" }];
    const G = { camMode: 0, setCamMode: (m) => { G.camMode = m; } };
    const bc = B.create(G, { setFollow: (c) => cuts.push(c.code) });
    const eventAt = 5 * speed + 6 * Math.max(1, speed);
    const st = { script: { drivers: [] }, T: 0, speed, reel: false, follow: cars[0],
      list: [{ t: eventAt, kind: "pass", num: 1 }, { t: eventAt + 3, kind: "pit", num: 2 }],
      isOut: () => false, carOf: (n) => cars[n - 1], running: () => [] };
    const advance = (dt) => { st.T += dt * speed; bc.tick(dt, st); };
    bc.start({ auto: true, tower: false });
    advance(5);
    assert.deepEqual(cuts, ["AAA"], speed + "x selects the upcoming pass");
    advance(4.9);
    assert.equal(cuts.length, 1, speed + "x retains the five wall-second minimum");
    advance(0.1);
    advance((eventAt + 2 - st.T) / speed - 0.01);
    assert.equal(cuts.length, 1, speed + "x keeps the pass through its aftermath");
    advance(0.02);
    assert.deepEqual(cuts, ["AAA", "BBB"], speed + "x can cover the next event after the hold");
    bc.setLocked(true); bc.setLocked(false);
    st.list.push({ t: st.T + 5 * speed + 1, kind: "pass", num: 1 });
    advance(5.1);
    assert.equal(cuts.at(-1), "AAA", "a released viewer lock does not retain the old event hold");
    bc.resetTiming(); st.T = 0;
    st.list = [{ t: 1, kind: "pass", num: 2 }];
    advance(0.01);
    assert.equal(cuts.at(-1), "BBB", "a seek releases the old event hold");
    bc.manual(); bc.setAuto(true);
    st.list.push({ t: 1, kind: "pit", num: 1 });
    advance(0.01);
    assert.equal(cuts.at(-1), "AAA", "AUTO immediately releases the viewer's hold");
    bc.stop();
  }
});

test("BROADCAST battles: reuses one pooled array across calls (Director / PiP / ExtraRigs hot path)", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const B = vm.runInContext("Broadcast", g.ctx);
    const cars = [{ key: "a", prog: 1000, speed: 60 }, { key: "b", prog: 970, speed: 60 }, { key: "c", prog: 600, speed: 60 }, { key: "d", prog: 590, speed: 60 }];
    const a = B.battles(cars);
    const snap = host(a);
    const b = B.battles(cars);
    assert.equal(b, a, "same pooled fights array");
    assert.deepEqual(host(b), snap, "content stable across reuse");
    assert.equal(b.length, 2);
    // Fewer battles: length shrinks without allocating a new array.
    const tight = [{ key: "a", prog: 1000, speed: 60 }, { key: "b", prog: 400, speed: 60 }];
    const c = B.battles(tight);
    assert.equal(c, a, "still the pool when the fight count drops");
    assert.equal(c.length, 0, "3 s gap is not a battle");
  } finally { g.close(); }
});

test("BROADCAST battles: the crawl floor rides the pace scale when the caller passes vTop()/VMAX (4-F6)", () => {
  // The same slow corner at OVERALL SPEED pace 1 and pace 0.5: every ground speed and so every progress gap
  // halves. In seconds it is the same fight, but a raw 20 m/s floor reads it twice as tight at the low pace.
  const B = vm.runInContext("(function(){" + fs.readFileSync(path.join(ROOT, "js/race/broadcast.js"), "utf8") + ";return Broadcast;})()", vm.createContext({}), { filename: absSrc("js/race/broadcast.js") });
  const at = (k) => host(B.battles([{ key: "a", prog: 1000 * k, speed: 5 * k }, { key: "b", prog: 1000 * k - 8 * k, speed: 5 * k }], k));
  const full = at(1), half = at(0.5);
  assert.equal(full.length, 1);
  assert.ok(Math.abs(full[0].gapS - 0.4) < 1e-9, "pace 1: 8 m under the 20 m/s floor is 0.4 s: " + full[0].gapS);
  assert.ok(Math.abs(half[0].gapS - full[0].gapS) < 1e-9, "pace 0.5 reads the same seconds: " + half[0].gapS);
  const real = host(B.battles([{ key: "a", prog: 1000, speed: 5 }, { key: "b", prog: 992, speed: 5 }]));
  assert.ok(Math.abs(real[0].gapS - 0.4) < 1e-9, "no scale (WATCH's real m/s): the plain 20 m/s floor");
});

test("BROADCAST in WATCH (camera AUTO): the tower goes up, the director cuts to the car in the next event with a new shot, a follow key hands the picture over, the results take it down", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx), R = vm.runInContext("RealReplay", g.ctx), CM = vm.runInContext("CamModes", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-22, 48, 1, -5, 400), 18: line(-30, 45, -1, -5, 60) } };
    const side = CM.CAM_MODES.findIndex((m) => m.id === "side");
    RR.launch(script, { seat: "LEC", watch: true, camera: "auto", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    let bc = RR.status().replay.broadcast;
    assert.ok(bc && bc.auto && bc.tower, JSON.stringify(bc));
    assert.equal(G.camMode, side, "AUTO opens on the TV trackside shot");
    const doc = g.sandbox.document;
    assert.equal(doc.getElementById("bc-tower").hidden, false, "the tower is up");
    assert.ok(doc.body.classList.contains("bc-on"));
    g.apex.go();
    g.step(30);
    assert.ok(RR.status().replay.broadcast.rows >= 20, "a row per driver: " + RR.status().replay.broadcast.rows);
    // The next event with a traced car in it, a few seconds ahead.
    const codeOf = (num) => script.drivers.find((d) => d.num === num).code;
    const h = R.highlightsFor(script).find((x) => (x.num === 63 || x.num === 16) && ["pass", "pit", "out", "fastest"].includes(x.kind) && x.t > 20 && x.t < 380);
    assert.ok(h, "an event for Russell or Leclerc in the first 380 s");
    RR.replay().follow(h.num === 63 ? "LEC" : "RUS");   // on the OTHER car, so the cut is visible
    const before = RR.status().replay.broadcast;
    // The director's first cut comes SHOT_MIN_S after the opening shot: land the clock so the event is
    // still ahead then, inside its lead.
    RR.replay().seek(h.t - 9);
    g.step(60 * 7);
    bc = RR.status().replay.broadcast;
    assert.equal(bc.manual, false);
    assert.ok(bc.cuts > before.cuts, "the director cut: " + JSON.stringify(bc));
    assert.equal(RR.status().replay.follow, codeOf(h.num), "onto the car in the " + h.kind + " at " + h.t);
    assert.notEqual(bc.shot, "side", "with a new shot");
    // A follow key: the viewer has the picture, and the director waits.
    g.sandbox.dispatchEvent({ type: "keydown", code: "Period", repeat: false, target: null, preventDefault() {}, stopPropagation() {} });
    assert.equal(RR.status().replay.broadcast.manual, true);
    // UI-10 (hunt2): focus left on a transport button after a click kept the
    // replay keys dead. Its character keys now reach the replay; Space stays the
    // button's own, and a select keeps every key.
    const key = (code, target) => g.sandbox.dispatchEvent({ type: "keydown", code, repeat: false, target, preventDefault() {}, stopPropagation() {} });
    const inBar = (tagName, extra) => ({ tagName, ...extra, closest: (sel) => (sel === ".watch-transport" ? {} : null) });
    const sp0 = RR.status().replay.speed, paused0 = RR.status().replay.paused;
    key("Equal", inBar("BUTTON"));
    assert.ok(RR.status().replay.speed > sp0, "speed up from a focused transport button");
    key("Minus", inBar("INPUT", { type: "range" }));
    assert.equal(RR.status().replay.speed, sp0, "and down from the focused timeline");
    key("Space", inBar("BUTTON"));
    assert.equal(RR.status().replay.paused, paused0, "Space presses the focused button, never pauses on top of it");
    key("Equal", inBar("SELECT"));
    assert.equal(RR.status().replay.speed, sp0, "a focused select keeps its keys");
    // #2101: Ctrl/Cmd/Alt chords are the browser's (Ctrl+Plus zoom): speed unchanged and the default NOT prevented;
    // the bare key and Shift+Equal ("+") still change speed.
    let prevented = 0;
    const chord = (code, mods, target) => g.sandbox.dispatchEvent({ type: "keydown", code, repeat: false, target, ...mods, preventDefault() { prevented++; }, stopPropagation() {} });
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      chord("Equal", mods, inBar("BUTTON")); chord("Minus", mods, null);
    }
    assert.equal(RR.status().replay.speed, sp0, "modifier chords leave the playback speed alone");
    assert.equal(prevented, 0, "and leave the browser's zoom default alone");
    chord("Equal", { shiftKey: true }, inBar("BUTTON"));
    assert.ok(RR.status().replay.speed > sp0, "Shift+Equal is still the plus key");
    key("Minus", inBar("BUTTON"));
    assert.equal(RR.status().replay.speed, sp0);
    // The flag: the results take the tower down with the replay.
    RR.replay().seek(405);
    g.step(60 * 8);
    assert.equal(G.state, "results");
    g.step(1);
    assert.equal(doc.getElementById("bc-tower").hidden, true, "the tower comes down");
    assert.ok(!doc.body.classList.contains("bc-on"));
  } finally { g.close(); }
});

test("BROADCAST PiP pick: the followed car's battle partner (the car BEHIND when sandwiched), else the car in the next event, never the followed car", async () => {
  const g = await createGame({ track: "baku" });
  try {
    const B = vm.runInContext("Broadcast", g.ctx);
    const pick = (fights, follow, ev, kind) => host(B.pipPick(fights, follow, ev, kind));
    const fights = [{ key: "b", ahead: "a", gapS: 0.4 }, { key: "c", ahead: "b", gapS: 0.6 }];
    assert.deepEqual(pick(fights, "a", null), { key: "b", cam: "tcam", kind: "battle" }, "the leader: the car on its tail");
    assert.deepEqual(pick(fights, "b", null), { key: "c", cam: "tcam", kind: "battle" }, "sandwiched: the car BEHIND, the threat");
    assert.deepEqual(pick(fights, "c", null), { key: "b", cam: "tcam", kind: "battle" }, "the chaser: the car it is hunting");
    assert.deepEqual(pick([], "a", "h", "pit"), { key: "h", cam: "chase", kind: "pit" }, "no battle: the car in the next event");
    assert.equal(pick([], "a", "a", "pass"), null, "never the followed car");
    assert.equal(pick([], "a", null), null);
    // With the running order: the inset is never empty while another car runs.
    const run = [{ key: "a" }, { key: "b" }, { key: "c" }];
    const pickR = (follow, ev, kind) => host(B.pipPick([], follow, ev, kind, run));
    assert.deepEqual(pickR("a", null), { key: "b", cam: "tcam", kind: "behind" }, "the leader: the car behind");
    assert.deepEqual(pickR("b", null), { key: "c", cam: "tcam", kind: "behind" });
    assert.deepEqual(pickR("c", null), { key: "b", cam: "chase", kind: "ahead" }, "last: the car ahead");
    assert.deepEqual(pickR("z", null), { key: "a", cam: "chase", kind: "leader" }, "the followed car is out: the leader");
    assert.deepEqual(pickR("a", "c", "pit"), { key: "c", cam: "chase", kind: "pit" }, "an event still outranks the fallback");
    assert.equal(host(B.pipPick([], "a", null, null, [{ key: "a" }])), null, "alone on track: no inset");
  } finally { g.close(); }
});

test("BROADCAST PiP in WATCH with no battle (3 s apart): the inset is still up, on the car behind", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-164, 50, 1, -5, 400) } };   // Leclerc 150 m = 3 s back
    RR.launch(script, { seat: "RUS", watch: true, camera: "side", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    g.apex.go();
    g.step(60);
    const bc = RR.status().replay.broadcast;
    assert.ok(bc && bc.pip, "a PiP: " + JSON.stringify(bc));
    assert.equal(bc.pip.code, "LEC");
    assert.equal(bc.pip.label, "BEHIND · LEC");
    RR.replay().stop();
  } finally { g.close(); }
});

test("WATCH in-game AUTO: a picked shot hands the viewer the picture, AUTO hands it back at once; the commentary hears the replay", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx), R = vm.runInContext("RealReplay", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-22, 48, 1, -5, 400) } };
    const heard = [];
    const rr = G.raceRadio, real = rr.replayEvent;
    rr.replayEvent = (h, a, b) => { heard.push({ kind: h.kind, a: a && a.code, b: b && b.code }); return real(h, a, b); };
    RR.launch(script, { seat: "RUS", watch: true, camera: "side", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    const rp = RR.replay();
    assert.equal(rp.autoOn(), false, "a hub shot other than AUTO: the viewer's camera");
    assert.equal(rr.debug().watch, true, "the commentator is in WATCH mode");
    assert.equal(rp.setAuto(true), true);
    assert.equal(rp.autoOn(), true);
    g.apex.go();
    g.step(5);
    assert.equal(RR.status().replay.broadcast.manual, false, "AUTO is not read as a viewer change");
    rp.takePicture();
    assert.equal(rp.autoOn(), false, "a picked shot: the viewer has the picture");
    rp.setAuto(true);
    assert.equal(rp.autoOn(), true, "AUTO: the director at once, no 20 s wait");
    // A traced car's highlight at 1x: handed to the commentator, not captioned.
    const h = R.highlightsFor(script).find((x) => (x.num === 63 || x.num === 16) && ["pass", "pit", "out", "fastest"].includes(x.kind) && x.t > 20 && x.t < 380);
    assert.ok(h, "an event for Russell or Leclerc");
    rp.seek(h.t - 1);
    g.step(60 * 2);
    assert.ok(heard.some((e) => e.kind === h.kind && e.a === script.drivers.find((d) => d.num === h.num).code), JSON.stringify({ h, heard }));
    rp.stop();
    assert.equal(rr.debug().watch, false, "the WATCH is over for the commentator");
    assert.equal(rp.autoOn(), false);
  } finally { g.close(); }
});

test("BROADCAST PiP in WATCH: two cars 8 m apart put the partner in the inset (labelled, through the mirror pass); the results clear it", async () => {
  const g = await createGame({ track: "baku", storage: { tyreWear: "real" } });
  try {
    const { G } = g;
    const RR = vm.runInContext("RealRace", g.ctx), MP = vm.runInContext("MirrorPass", g.ctx);
    const { script } = scriptIn(g);
    const traces = { frame: "track", cars: { 63: line(-14, 50, 0, -5, 400), 16: line(-22, 50, 1, -5, 400) } };   // Leclerc 8 m behind Russell, same pace
    RR.launch(script, { seat: "RUS", watch: true, camera: "side", traces, startLap: 1 });
    await g.settle(() => G.track && G.track.def && G.track.def.id === "baku" && (G.state === "count" || G.state === "race"), 8000);
    g.step(2);
    g.apex.go();
    g.step(60);
    const bc = RR.status().replay.broadcast;
    assert.ok(bc && bc.pip, "a PiP: " + JSON.stringify(bc));
    assert.equal(bc.pip.code, "LEC", "the car on Russell's tail");
    assert.equal(bc.pip.label, "ONBOARD · LEC");
    const mp = MP.instance().state().pip;
    assert.equal(mp.code, "LEC", "the mirror pass has the subject");
    assert.equal(mp.cam, "tcam");
    // Follow Leclerc: the inset turns to the car he is hunting.
    RR.replay().follow("LEC");
    g.step(20);
    assert.equal(RR.status().replay.broadcast.pip.code, "RUS");
    RR.replay().seek(405);
    g.step(60 * 8);
    assert.equal(G.state, "results");
    g.step(1);
    assert.equal(MP.instance().state().pip.code, null, "the results clear the subject");
  } finally { g.close(); }
});

test("BROADCAST manual camera ownership keeps the on-air shot and AUTO baseline current", () => {
  const { replay, G, options } = transportReplay();
  replay.start({ ...options, camera: "heli" });
  assert.equal(replay.status().broadcast.shot, "heli", "a fixed-camera launch reports its actual shot");
  G.camMode = 3; replay.takePicture();
  assert.equal(replay.status().broadcast.shot, "chase", "camera picker updates the on-air baseline");
  G.camMode = 2; replay.setLocked(true);
  assert.equal(replay.status().broadcast.shot, "heli", "transport camera lock updates the baseline too");
  replay.setAuto(true);
  replay.eventStep(1);
  assert.notEqual(replay.status().broadcast.shot, "heli", "AUTO chooses a different shot from the viewer's actual one");
  replay.stop();
});

test("WATCH broadcast: the running order's speeds are the cars' own, whatever the replay rate (battles()/PiP/director read them)", () => {
  // Broadcast.battles() divides a progress gap by the running order's speed to get SECONDS: at 8x the
  // same two cars must read the same battle as at 1x (c.speed is the trace's m/s; the rate rides c.replayRate).
  const grab = (rate) => {
    let seen = null;
    const ctx = vm.createContext({ M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
      Log: { info() {}, warn() {}, debug() {} },
      CamModes: { CAM_MODES: [{ id: "cockpit" }, { id: "heli" }] },
      Broadcast: { create: () => new Proxy({}, { get: (_t, k) => (k === "tick" ? (_dt, st) => { seen = st; } : () => ({})) }) },
      Tracks: { sample: (_track, s, out) => { out.p = [s, 0, 0]; out.t = [1, 0, 0]; out.r = [0, 0, 1]; out.hw = 7; } } });
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-replay.js"), "utf8"), ctx, { filename: absSrc("js/race/real-replay.js") });
    const R = vm.runInContext("RealReplay", ctx);
    const a = { code: "RUS" }, b = { code: "LEC" }, da = { code: "RUS", num: 63, pos: 1, lapStart: [0] }, db = { code: "LEC", num: 16, pos: 2, lapStart: [0] };
    const G = { track: { total: 100000 }, cars: [a, b], state: "race", camMode: 0, followCar: (c) => { G.player = c; }, snapGameCam() {}, setCamMode() {} };
    const replay = R.create(G);
    assert.equal(replay.start({ script: { drivers: [da, db] }, traces: { frame: "track", cars: { 63: line(0, 50, 0, 0, 60), 16: line(-20, 50, 0, 0, 60) } },
      seats: new Map([[a, da], [b, db]]), startLap: 1, camera: "heli", rate }), true);
    replay.seek(10);
    replay.tick(0);
    const rows = JSON.parse(JSON.stringify(seen.running().map((r) => ({ key: r.key.code, prog: r.prog, speed: r.speed }))));
    replay.stop();
    const B = vm.runInContext("(function(){" + fs.readFileSync(path.join(ROOT, "js/race/broadcast.js"), "utf8") + ";return Broadcast;})()", vm.createContext({}), { filename: absSrc("js/race/broadcast.js") });
    return { rows, fights: JSON.parse(JSON.stringify(B.battles(rows))) };
  };
  const one = grab(1), eight = grab(8);
  assert.equal(one.rows.length, 2);
  assert.ok(Math.abs(one.rows[0].speed - 50) < 0.01, "1x: the trace's own speed " + one.rows[0].speed);
  assert.deepEqual(eight.rows.map((r) => r.speed), one.rows.map((r) => r.speed), "8x reports the same speeds as 1x");
  assert.equal(one.fights.length, 1, "20 m at 50 m/s is a battle");
  assert.deepEqual(eight.fights, one.fights, "the same two cars give the same battles at rate 1 and rate 8");
});
