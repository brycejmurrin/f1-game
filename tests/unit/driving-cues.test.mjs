/* driving-cues.test.mjs — assist-gated audio driving cues (plan slice 3).
 * Fail-before: OFF path must not read curvature; left k → L; no announce.
 * Run: node --test tests/unit/driving-cues.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/audio/driving-cues.js"), "utf8");

function load() {
  const curvatureCalls = [];
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    M4: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
    PhysicsConsts: { FIXED_DT: 1 / 60, LAT_MAX: 22, BRAKE: 22, VMAX: 72 },
    Tracks: {
      curvature(track, s) {
        curvatureCalls.push(s);
        // +k = LEFT. A left-hander peaks near s=40 on a 200 m lap.
        const L = track.total || 200;
        const u = ((s % L) + L) % L;
        if (u > 30 && u < 55) return 0.04;
        if (u > 120 && u < 145) return -0.035;
        return 0.001;
      },
    },
    BrakeCue: { on: () => false, debug: () => ({ urgency: 0 }) },
    GameAudio: {
      driveBrakeTone() { ctx._brakeN = (ctx._brakeN || 0) + 1; },
      cornerCall(side) { ctx._calls = (ctx._calls || []).concat([side]); },
    },
    performance: { now: () => ctx._t },
    document: undefined,
    window: {},
    _t: 0,
    _brakeN: 0,
    _calls: [],
    curvatureCalls,
  };
  vm.runInNewContext(SRC.replace(/^const\b/gm, "var"), ctx);
  return ctx;
}

test("slider 1 is OFF; mid notches are on", () => {
  const { DrivingCues } = load();
  assert.equal(DrivingCues.fromSlider(1).on, false);
  assert.equal(DrivingCues.fromSlider(7).on, true);
  assert.equal(DrivingCues.labelOf(1), "OFF");
  assert.match(DrivingCues.labelOf(7), /^CUES 7$/);
});

test("OFF path performs zero curvature reads over N ticks", () => {
  const ctx = load();
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 10, speed: 50, axEstSm: 0, finished: false, retired: false },
    track: { total: 200 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(1);
  for (let i = 0; i < 30; i++) { ctx._t = i * 16; ctx.DrivingCues.tick(); }
  assert.equal(ctx.curvatureCalls.length, 0, "OFF must not touch Tracks.curvature");
  assert.equal(ctx._brakeN, 0);
  assert.equal(ctx._calls.length, 0);
});

test("left-hand curvature ahead yields L corner call; urgency rises into a corner", () => {
  const ctx = load();
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 5, speed: 55, axEstSm: 0, finished: false, retired: false },
    track: { total: 200 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 20; i++) { ctx._t = i * 50; ctx.DrivingCues.tick(); }
  assert.ok(ctx.curvatureCalls.length > 0, "ON must sample curvature");
  assert.ok(ctx._calls.indexOf("L") >= 0, "left peak ahead must call L, got " + JSON.stringify(ctx._calls));
  const dbg = ctx.DrivingCues.debug();
  assert.ok(dbg.urgency > 0.1, "flat-out into a slow left must raise urgency, got " + dbg.urgency);
});

test("source never calls announce or raceRadio", () => {
  // Ban call sites and identifiers — comments may name the forbidden APIs.
  assert.equal(/\bannounce\s*\(/.test(SRC), false);
  assert.equal(/\braceRadio\s*\./.test(SRC), false);
  assert.equal(/\bG\.announce\s*\(/.test(SRC), false);
});

test("urgency is 0..1 only — never a brake command", () => {
  const { DrivingCues } = load();
  const u = DrivingCues.urgencyOf(70, 0.04, 40, 0, 22, 22);
  assert.ok(u >= 0 && u <= 1);
});

test("cornerSide maps +k to LEFT and -k to RIGHT", () => {
  const ctx = load();
  const track = { total: 200 };
  // From s=5, look covers the +k peak at 30..55.
  assert.equal(ctx.DrivingCues.cornerSide(track, 5, 60, 8), 1);
  // From s=100, look covers the -k peak at 120..145.
  assert.equal(ctx.DrivingCues.cornerSide(track, 100, 60, 8), -1);
});

test("one call per turn: a long sweeper is called ONCE, and the next turn on the same side is called again", () => {
  // Was: lastCallS = the car's position, so any turn still inside the lookahead
  // re-fired every CALL_COOLDOWN_M — a 400 m sweeper said "L" six times. A
  // same-side call now needs straight road since the last one.
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 500 && u < 900) return 0.02;    // a 400 m left sweeper
    if (u > 1400 && u < 1500) return 0.03;  // straight between, then another left
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 300, speed: 60, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 1300; i++) { ctx._t = i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.deepEqual(ctx._calls, ["L", "L"], "the sweeper once, the later left once");
});

test("two same-side turns split by a straight shorter than the lookahead are each called", () => {
  // Was: callArmed re-armed only when the WHOLE window (~100 m on the top notch)
  // ran straight, so after a 60 m straight the second left was never called.
  // It now re-arms once the car is past the called turn's exit.
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 1000 && u < 1100) return 0.03;  // left
    if (u > 1160 && u < 1260) return 0.03;  // 60 m straight, then another left
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 800, speed: 70, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(10);
  for (let i = 0; i < 600; i++) { ctx._t = i * 1000 / 60; G.player.s = 800 + i; ctx.DrivingCues.tick(); }
  assert.deepEqual(ctx._calls, ["L", "L"], "each left once, got " + JSON.stringify(ctx._calls));
});

test("a double-apex dip inside one long turn does not re-arm the call", () => {
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 500 && u < 700) return 0.02;
    if (u >= 700 && u < 730) return 0.008;  // eases below K_CALL, never opens up
    if (u >= 730 && u < 900) return 0.02;
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 300, speed: 60, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(10);
  for (let i = 0; i < 800; i++) { ctx._t = i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.deepEqual(ctx._calls, ["L"], "one turn, one call, got " + JSON.stringify(ctx._calls));
});

test("the call memory resets when the cues stand down (a new race starts clean)", () => {
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => (s > 500 && s < 900 ? 0.02 : 0);
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 300, speed: 60, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 400; i++) { ctx._t = i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.equal(ctx._calls.length, 1);
  G.state = "results"; ctx.DrivingCues.tick();          // the race ends
  G.state = "race"; G.player.s = 300;                    // the next one, same corner ahead
  for (let i = 0; i < 400; i++) { ctx._t = 10000 + i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.equal(ctx._calls.length, 2, "the first call of the next race is not suppressed");
});

test("cornerExit uses the nearest same-side entry, so a sharper second turn already in the window still gets its own call", () => {
  // Was: cornerExit walked from the sharpest peak in the window, so a sharper
  // second left already inside the lookahead stretched exit past both turns and
  // the second left was never called.
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 1000 && u < 1080) return 0.02;   // first left
    if (u > 1120 && u < 1200) return 0.05;   // sharper second, 40 m gap
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    // Start with BOTH turns already inside a long lookahead window.
    player: { s: 970, speed: 90, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 100,
  };
  // Lower BRAKE so lookHi is long enough to cover both at the first call.
  ctx.PhysicsConsts.BRAKE = 10;
  ctx.PhysicsConsts.VMAX = 100;
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(10);
  for (let i = 0; i < 350; i++) { ctx._t = i * 1000 / 60; G.player.s = 970 + i; ctx.DrivingCues.tick(); }
  assert.deepEqual(ctx._calls, ["L", "L"], "each left once, got " + JSON.stringify(ctx._calls));
});

test("a rewind behind lastCallS does not re-arm and double-call the same turn", () => {
  // Was: ((p.s - lastCallS) % L + L) % L after a flashback behind lastCallS is
  // nearly a full lap, which satisfied >= callExitM and re-armed; the next
  // approach then called the same sweeper again.
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 500 && u < 900) return 0.02;
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 300, speed: 60, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 250; i++) { ctx._t = i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.equal(ctx._calls.length, 1, "sweeper called once on approach");
  G.player.s = 350;   // flashback / rewind behind lastCallS
  for (let i = 0; i < 5; i++) { ctx._t = 5000 + i * 16; ctx.DrivingCues.tick(); }
  for (let i = 0; i < 300; i++) { ctx._t = 6000 + i * 1000 / 60; G.player.s = 350 + i; ctx.DrivingCues.tick(); }
  assert.deepEqual(ctx._calls, ["L"], "same sweeper is not called again after rewind, got " + JSON.stringify(ctx._calls));
});

test("crawling through a chicane: opposite-side flips are spaced, not machine-gunned", () => {
  // Was: an opposite-side call had no cooldown, so a car nearly stopped in a
  // chicane, whose window peak flipped side every few ticks, fired a blip per
  // flip (8 calls in ~3 s at Monza T1). The fine L/R alternation stands in for
  // that near-tie peak jitter.
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 500 && u < 600) return (Math.floor(u / 0.75) % 2 ? 0.03 : -0.03) * (1 + u / 1e4);
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 480, speed: 2, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  let flips = 0, prev = 0;
  for (let i = 0; i < 180; i++) {               // 3 s at 60 Hz, 2 m/s
    ctx._t = i * 1000 / 60; G.player.s = 480 + i * 2 / 60;
    const side = ctx.DrivingCues.cornerSide(G.track, G.player.s, 28 * 0.85, 4);
    if (side && side !== prev) { flips++; prev = side; }
    ctx.DrivingCues.tick();
  }
  assert.ok(flips >= 6, "fixture must flip side repeatedly, got " + flips);
  assert.ok(ctx._calls.length <= Math.ceil(flips / 3),
    flips + " flips must not yield " + ctx._calls.length + " calls: " + JSON.stringify(ctx._calls));
});

test("a race-pace chicane still gets both calls (1.4 s / 69 m apart)", () => {
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 1000 && u < 1040) return 0.03;    // left
    if (u > 1069 && u < 1110) return -0.03;   // right, 69 m on
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 800, speed: 50, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 400; i++) { ctx._t = i * 1000 / 60; G.player.s = 800 + i * 50 / 60; ctx.DrivingCues.tick(); }
  assert.deepEqual(ctx._calls, ["L", "R"], "both chicane calls, got " + JSON.stringify(ctx._calls));
});

test("audio driving cues stay silent during a real-race WATCH (same gate as the spotter)", () => {
  const curvatureCalls = [];
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    M4: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
    PhysicsConsts: { FIXED_DT: 1 / 60, LAT_MAX: 22, BRAKE: 22, VMAX: 72 },
    RealRace: { status: () => ({ watch: true }) },
    Tracks: {
      curvature(track, s) {
        curvatureCalls.push(s);
        const L = track.total || 200;
        const u = ((s % L) + L) % L;
        if (u > 30 && u < 55) return 0.04;
        return 0.001;
      },
    },
    BrakeCue: { on: () => false, debug: () => ({ urgency: 0 }) },
    GameAudio: {
      driveBrakeTone() { ctx._brakeN = (ctx._brakeN || 0) + 1; },
      cornerCall(side) { ctx._calls = (ctx._calls || []).concat([side]); },
    },
    performance: { now: () => ctx._t },
    document: undefined,
    window: {},
    _t: 0,
    _brakeN: 0,
    _calls: [],
    curvatureCalls,
  };
  vm.runInNewContext(SRC.replace(/^const\b/gm, "var"), ctx);
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 40, speed: 70, axEstSm: 0, finished: false, retired: false },
    track: { total: 200 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 200; i++) { ctx._t = i * 50; G.player.s = 35 + i; ctx.DrivingCues.tick(); }
  assert.equal(ctx._brakeN, 0, "no brake tone while watching");
  assert.deepEqual(ctx._calls, [], "no corner calls while watching");
  assert.equal(curvatureCalls.length, 0, "watch path must not read curvature");
});

/* Bug-hunt 2 H11: under LAZY_AUDIO the real create() runs AFTER boot, so the
 * #pm-audiocues row it injects was never reached by steer-tuning's boot-time
 * oninput wiring and first paint — it showed 1/OFF and did nothing. */
function fakeShell(saved) {
  const byId = {};
  const mk = (id) => (byId[id] = { id, value: "", textContent: "", oninput: null });
  const host = {
    insertBefore() { mk("pm-audiocues"); mk("pm-audiocues-v"); },
  };
  const row = { parentNode: host, nextSibling: null };
  byId["pm-brakecue"] = { closest: () => row };
  const store = {
    data: { audioCues: saved }, writes: [],
    get(k, d) { return k in store.data ? store.data[k] : d; },
    set(k, v) { store.data[k] = v; store.writes.push([k, v]); },
  };
  const G = {
    paused: false, state: "menu", soundOn: false, store,
    $: (id) => byId[id] || null, player: null, track: null, vTop: () => 72,
  };
  return { G, byId, store };
}
test("injected AUDIO DRIVING CUES slider is painted from the store and wired (H11)", () => {
  const ctx = load();
  ctx.document = { createElement: () => ({ className: "", innerHTML: "" }) };
  const { G, byId, store } = fakeShell(5);
  ctx.DrivingCues.create(G);
  assert.equal(String(byId["pm-audiocues"].value), "5", "first paint must show the saved level, not 1");
  assert.equal(byId["pm-audiocues-v"].textContent, "CUES 5");
  assert.equal(typeof byId["pm-audiocues"].oninput, "function", "injected slider must carry its own handler");
  byId["pm-audiocues"].oninput({ target: { value: "8" } });
  assert.deepEqual(store.writes.at(-1), ["audioCues", 8]);
  assert.equal(ctx.DrivingCues.debug().level, 8, "the live level follows the slider");
  assert.equal(byId["pm-audiocues-v"].textContent, "CUES 8");
  byId["pm-audiocues"].oninput({ target: { value: "1" } });
  assert.equal(byId["pm-audiocues-v"].textContent, "OFF");
  assert.equal(ctx.DrivingCues.on(), false);
});
