/* replay-buf.test.mjs — instant-replay ring (js/camera/replay-buf.js).
 * Budget, wrap, interpolate, restore equality, solo/net scrub gates,
 * career-settle / endRace source pins, pause-menu scrub audio (game-vm).
 * Run: node --test tests/unit/replay-buf.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createGame, settle: vmSettle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const { install: installFakeAudio } = require("./fake-audio-vm.cjs");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot(document) {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Float32Array, Float64Array, Uint8Array,
    isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    document,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/camera/replay-buf.js"), ctx, { filename: "replay-buf.js" });
  return vm.runInContext("ReplayBuf", ctx);
}

function cars(n, base) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      s: (base || 0) + i, x: i * 0.1, head: 0.01 * i, speed: 50 + i,
      px: i, py: 1, pz: i * 2, steer: 0, retired: false, finished: false,
    });
  }
  return out;
}

test("budget stays under 0.7 MB for 22 cars / 20 s", () => {
  const R = boot();
  assert.ok(R.budgetOk(22, R.capacityFor(22)), "capacityFor must fit");
  assert.ok(R.frameBytes(22) * R.capacityFor(22) <= R.MAX_BYTES);
  assert.ok(R.capacityFor(22) >= R.HZ * 10, "at least 10 s at 22 cars");
});

test("recorded heading and mesh yaw cross the ±π boundary without facing backwards", () => {
  const R = boot(), field = cars(1), api = R.create({ cars: field, netPlay: { active: () => false } });
  for (const direction of [-1, 1]) {
    api.reset(field);
    Object.assign(field[0], { head: direction * (Math.PI - 0.02), yawVis: -direction * (Math.PI - 0.04), px: 10, steer: -0.5 });
    api.sample(0, field);
    Object.assign(field[0], { head: -direction * (Math.PI - 0.02), yawVis: direction * (Math.PI - 0.04), px: 20, steer: 0.5 });
    api.sample(1, field);
    for (const t of [0.25, 0.5, 0.75]) {
      const pose = api.at(t).cars[0];
      assert.ok(Math.cos(pose.head) < -0.999, "heading continues through the branch cut");
      assert.ok(Math.cos(pose.yawVis) < -0.999, "mesh yaw continues through the opposite branch cut");
      assert.ok(Math.abs(pose.px - (10 + 10 * t)) < 1e-6, "positions still interpolate linearly");
      assert.ok(Math.abs(pose.steer - (t - 0.5)) < 1e-6, "non-angular controls still interpolate linearly");
    }
  }
});

test("sample wraps and at() interpolates; restore is bit-exact on captured fields", () => {
  const R = boot();
  const field = cars(4);
  const G = { cars: field, netPlay: { active: () => false }, paused: true };
  const api = R.create(G);
  api.reset(field);
  for (let i = 0; i < R.HZ * 3; i++) {
    for (const c of field) { c.s += 1; c.px += 0.5; }
    api.sample(i / R.HZ, field);
  }
  const w = api.window();
  assert.ok(w.frames >= R.HZ * 2, "frames=" + w.frames);
  assert.ok(w.bytes <= R.MAX_BYTES);

  const cap = R.capacityFor(4);
  for (let i = 0; i < cap + 50; i++) {
    for (const c of field) c.s += 0.5;
    api.sample(10 + i / R.HZ, field);
  }
  const w2 = api.window();
  assert.equal(w2.frames, cap, "ring never exceeds capacity");

  const mid = api.at((w2.t0 + w2.t1) / 2);
  assert.ok(mid && mid.cars.length === 4);
  assert.ok(Number.isFinite(mid.cars[0].s));

  const before = field.map((c) => ({ s: c.s, x: c.x, head: c.head, speed: c.speed, px: c.px, py: c.py, pz: c.pz, steer: c.steer }));
  assert.equal(api.beginScrub(), true);
  assert.equal(api.apply(w2.t0), true);
  assert.notEqual(field[0].s, before[0].s, "scrub moves the field");
  assert.equal(api.endScrub(), true);
  for (let i = 0; i < field.length; i++) {
    assert.equal(field[i].s, before[i].s);
    assert.equal(field[i].x, before[i].x);
    assert.equal(field[i].px, before[i].px);
    assert.equal(field[i].speed, before[i].speed);
  }
  assert.equal(api.isScrubbing(), false);
});

test("beginScrub is a no-op when netPlay is active", () => {
  const R = boot();
  const field = cars(2);
  const G = { cars: field, netPlay: { active: () => true } };
  const api = R.create(G);
  api.reset(field);
  for (let i = 0; i < R.HZ * 4; i++) api.sample(i / R.HZ, field);
  assert.equal(api.sample(1, field), false, "sampling off under netplay");
  assert.equal(api.beginScrub(), false);
});

test("injected pose ownership denies sampling, pause-card offering and scrub entry even with a populated ring", () => {
  const button = { hidden: true }, R = boot({ getElementById: id => id === "pm-replay" ? button : null });
  let eligible = true;
  const field = cars(2), G = { cars: field, netPlay: { active: () => false } };
  const api = R.create(G, () => eligible);
  for (let i = 0; i < R.HZ * 4; i++) api.sample(i / R.HZ, field);
  api.refreshButton(); assert.equal(button.hidden, false, "ordinary solo replay is offered");
  const frames = api.window().frames, before = field.map(c => ({ ...c }));
  eligible = false;
  api.onTick(6, field, "race"); assert.equal(api.sample(7, field), false);
  assert.equal(api.window().frames, frames, "WATCH cannot add recorded puppets to the ring");
  api.onPause(true); assert.equal(button.hidden, true, "WATCH cannot offer a competing replay door");
  assert.equal(api.beginScrub(), false); assert.equal(api.isScrubbing(), false);
  assert.deepEqual(field, before, "denied entry leaves the recorded owner's poses untouched");
});

test("a clock rewind discards the wrapped future ring and tags before rebuilding a fresh replay window", () => {
  const button = { hidden: true }, R = boot({ getElementById: id => id === "pm-replay" ? button : null });
  const field = cars(1), G = { cars: field, netPlay: { active: () => false }, raceT: 101 }, api = R.create(G);
  for (let i = 0; i < R.MAX_FRAMES + 20; i++) {
    field[0].px = i; api.sample(80 + i / R.HZ, field);
  }
  api.pushTag("retirement", 99, 0); api.refreshButton(); assert.equal(button.hidden, false);
  field[0].px = 42; G.raceT = 10;
  assert.equal(api.sample(10, field), true);
  const w = api.window(); assert.equal(w.frames, 1); assert.equal(w.t0, 10); assert.equal(w.t1, 10);
  assert.equal(api.lastTag(), null); assert.equal(api.status().tags, 0);
  assert.equal(api.at(10).cars[0].px, 42, "the replay contains the restored checkpoint, never the discarded future");
  api.refreshButton(); assert.equal(button.hidden, true); assert.equal(api.beginScrub(), false);
  for (let i = 1; i <= R.HZ * 3; i++) { G.raceT = 10 + i / R.HZ; api.sample(G.raceT, field); }
  api.refreshButton(); assert.equal(button.hidden, false, "the new timeline earns its own replay threshold");
  assert.ok(api.window().t0 <= api.window().t1);
});

test("a backwards timestamp within the same 30 Hz slot is recorded on its new timeline", () => {
  const R = boot(), field = cars(1), api = R.create({ cars: field, netPlay: { active: () => false } });
  api.sample(10.04, field); field[0].px = 123;
  assert.equal(api.sample(10.035, field), true, "discard the future before applying the cadence gate");
  assert.equal(api.window().frames, 1); assert.equal(api.window().t0, 10.035);
  assert.equal(api.at(10.035).cars[0].px, 123);
});

test("a paused checkpoint rewind cannot enter a stale ring before the next simulation sample", () => {
  for (const refresh of [false, true]) {
    const button = { hidden: true }, R = boot({ getElementById: id => id === "pm-replay" ? button : null });
    const field = cars(1), G = { cars: field, netPlay: { active: () => false }, raceT: 20 }, api = R.create(G);
    for (let i = 0; i < R.HZ * 4; i++) api.sample(16 + i / R.HZ, field);
    api.refreshButton(); assert.equal(button.hidden, false);
    G.raceT = 2; field[0].px = 123;
    if (refresh) { api.refreshButton(); assert.equal(button.hidden, true); }
    assert.equal(api.beginScrub(), false, "an already-visible stale REPLAY door is harmless");
    assert.equal(api.window().frames, 0); assert.equal(field[0].px, 123);
  }
});

test("reopening Pause during scrub restores the live pose before checkpoint or other pause actions", () => {
  const button = { hidden: true }, dock = { hidden: true };
  const R = boot({ getElementById: id => id === "pm-replay" ? button : id === "pm-replay-dock" ? dock : null });
  const field = cars(1), G = { cars: field, netPlay: { active: () => false }, raceT: 4 }, api = R.create(G);
  for (let i = 0; i < R.HZ * 4; i++) { field[0].px = i; api.sample(i / R.HZ, field); }
  const before = field.map(c => ({ ...c }));
  assert.equal(api.beginScrub(), true); assert.notEqual(field[0].px, before[0].px);
  api.onPause(true);
  assert.equal(api.isScrubbing(), false); assert.deepEqual(field, before); assert.equal(button.hidden, false);
  assert.equal(dock.hidden, true, "reopening Pause hides the now-ended replay dock");
  field[0].px = 567; api.tickScrub(0.05); api.endScrub();
  assert.equal(field[0].px, 567, "ended scrub cannot overwrite a subsequent checkpoint restore");
});

test("a forward JUMP IN beyond the replay window cannot blend countdown poses into the mid-race timeline", () => {
  for (const pausedDoor of [false, true]) {
    const button = { hidden: true }, R = boot({ getElementById: id => id === "pm-replay" ? button : null });
    const field = cars(1), G = { cars: field, netPlay: { active: () => false }, raceT: 4 }, api = R.create(G);
    for (let i = 0; i < R.HZ * 4; i++) { field[0].px = i; api.sample(i / R.HZ, field); }
    api.pushTag("pass", 3, 0); api.refreshButton(); assert.equal(button.hidden, false);
    G.raceT = 100; field[0].px = 1234;
    if (pausedDoor) {
      assert.equal(api.beginScrub(), false, "a paused JUMP IN cannot enter the previously offered stale ring");
      assert.equal(api.window().frames, 0);
    }
    assert.equal(api.sample(G.raceT, field), true);
    assert.equal(api.window().frames, 1); assert.equal(api.window().t0, 100); assert.equal(api.window().t1, 100);
    assert.equal(api.at(95).cars[0].px, 1234, "an earlier request clamps to the first mid-race pose");
    assert.equal(api.lastTag(), null);
    api.refreshButton(); assert.equal(button.hidden, true, "the jumped timeline must earn fresh replay history");
    for (let i = 1; i <= R.HZ * 3; i++) { G.raceT = 100 + i / R.HZ; api.sample(G.raceT, field); }
    api.refreshButton(); assert.equal(button.hidden, false);
  }
});

test("scrubbed poses render wholly at recorded positions and yaw for every renderAlpha, then restore exact live history", () => {
  const R = boot(), field = cars(2), G = { cars: field, netPlay: { active: () => false } }, api = R.create(G);
  Object.assign(field[0], { s: 10, px: 10, pz: 20, head: 0.5, yawVis: -0.4 }); api.sample(0, field);
  Object.assign(field[0], { s: 20, px: 20, pz: 30, head: 0.6, yawVis: -0.2 }); api.sample(1, field);
  Object.assign(field[0], { s: 1000, px: 1000, pz: 2000, head: 2, yawVis: 0.8,
    rPrevS: 999, rPrevX: undefined, rPrevPx: 999, rPrevPz: 1999, rPrevHead: 1.9, rPrevYawVis: 0.7 });
  const before = field.map(c => ({ ...c }));
  // Use the game's actual render helpers: a camera-only assertion would miss
  // the body mixing the historical pose with its live interpolation endpoints.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8"), render = vm.createContext({ _rp: {}, renderAlpha: 0, Math });
  for (const name of ["renderPosOf", "yawVisInterp", "headInterp"]) {
    const start = game.indexOf("function " + name + "("); assert.ok(start >= 0);
    vm.runInContext(game.slice(start, game.indexOf("\n}", start) + 2), render);
  }
  assert.equal(api.beginScrub(), true);
  for (const time of [0, 0.5, 1]) {
    api.apply(time); const recorded = api.at(time).cars[0];
    for (const alpha of [0, 0.5, 1]) {
      render.renderAlpha = alpha;
      const position = render.renderPosOf(field[0]);
      assert.equal(position.x, recorded.px); assert.equal(position.z, recorded.pz);
      assert.equal(render.headInterp(field[0]), recorded.head);
      assert.equal(render.yawVisInterp(field[0]), recorded.yawVis);
      assert.equal(field[0].rPrevS, recorded.s); assert.equal(field[0].rPrevX, recorded.x);
    }
  }
  api.endScrub(); assert.deepEqual(field, before, "restore values and originally absent history/yaw fields exactly");
  assert.ok(Object.hasOwn(field[0], "rPrevX"), "an own undefined history value is preserved");
  assert.equal(Object.hasOwn(field[1], "rPrevPx"), false, "scrub-created history is removed");
  assert.equal(Object.hasOwn(field[1], "yawVis"), false, "scrub-created presentation yaw is removed");
});

test("module never writes Ghost storage and stays under the RAM budget constant", () => {
  const text = fs.readFileSync(path.join(ROOT, "js/camera/replay-buf.js"), "utf8");
  assert.doesNotMatch(text, /localStorage|GameStore|apex26\.ghost/);
  assert.match(text, /MAX_BYTES = 720 \* 1024/);
});

test("retirement edge auto-tags; jumpLastTag seeks; scrubbing blocks settle path in game.js", () => {
  const R = boot();
  const field = cars(2);
  const G = { cars: field, netPlay: { active: () => false } };
  const api = R.create(G);
  api.reset(field);
  for (let i = 0; i < R.HZ * 4; i++) api.sample(i / R.HZ, field);
  field[1].retired = true;
  api.sample(5, field);
  const tag = api.lastTag();
  assert.ok(tag && tag.kind === "retirement" && tag.car === 1);

  assert.equal(api.beginScrub(), true);
  assert.equal(api.jumpLastTag(), true);
  const st = api.status();
  assert.ok(Math.abs(st.scrubT - tag.t) < 1e-6);
  assert.equal(api.isScrubbing(), true);

  // Contract: endRace / career score must refuse while scrubbing (source pin —
  // a settle spy would need the full game boot; the call sites are the gate).
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /replayBuf\.isScrubbing\(\)/);
  assert.match(game, /replayBuf\.onRaceStart|replayBuf\.reset/);
  assert.match(game, /Career\.scoreRound/);
  // scoreRound must sit AFTER the scrubbing early-return in endRace.
  const scrubGate = game.indexOf("if (replayBuf.isScrubbing())");
  const score = game.indexOf("Career.scoreRound");
  assert.ok(scrubGate >= 0 && score > scrubGate, "scrub gate precedes career score");
  // Ghost.flush still leads endRace (ghost.test pin); scrub return follows it.
  assert.match(game, /function endRace\(forcedOrder\) \{\s*Ghost\.flush\(\);/);
  api.endScrub();
});

test("a car crossing the start/finish line interpolates through the seam, not round the lap", () => {
  // s is stored wrapped to [0, L): L-1.3 -> 1.37 across the line. A plain lerp
  // of field 0 swept the car (and the replay camera on it) back through the
  // whole lap in one 1/30 s sample — s 3293.7 -> 2503 -> 1644 -> 824 -> 1.4.
  const R = boot(), L = 3295, field = cars(1);
  const api = R.create({ cars: field, track: { total: L }, netPlay: { active: () => false } });
  api.reset(field);
  Object.assign(field[0], { s: L - 1.3, pz: 0 });
  api.sample(10, field);
  Object.assign(field[0], { s: 1.37, pz: 2.67 });
  api.sample(10 + 1 / R.HZ, field);
  for (const u of [0.25, 0.5, 0.75]) {
    const s = api.at(10 + u / R.HZ).cars[0].s;
    const want = (L - 1.3 + 2.67 * u) % L;
    assert.ok(s >= 0 && s < L, `s stays in [0, L): ${s}`);
    const err = Math.abs(((s - want + L / 2) % L + L) % L - L / 2);
    assert.ok(err < 1e-2, `u=${u}: s=${s.toFixed(3)} should be ${want.toFixed(3)} (through the line)`);
  }
  // …and the pure helper without a lap length behaves as before.
  const out = R.lerpCar(new Float32Array(9), Float32Array.of(10, 0, 0, 0, 0, 0, 0, 0, 0), Float32Array.of(20, 0, 0, 0, 0, 0, 0, 0, 0), 0.5);
  assert.equal(out[0], 15);
});

test("a grid over 22 cars (MY TEAM / LEGENDS) records instead of resetting every sample", () => {
  const R = boot();
  assert.ok(R.budgetOk(24, R.capacityFor(24)), "24 cars fit the byte cap");
  for (const n of [23, 24, 26]) {
    const field = cars(n);
    const api = R.create({ cars: field, netPlay: { active: () => false } });
    for (let i = 0; i < R.HZ * 2; i++) api.sample(i / R.HZ, field);
    const w = api.window();
    assert.ok(w.frames >= R.HZ * 2 - 1, n + " cars: frames=" + w.frames);
    assert.equal(w.cars, Math.min(R.MAX_CARS, n));
  }
});

async function bootSoloRaceForScrubAudio() {
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = installFakeAudio(sb); } });
  const sb = g.sandbox;
  sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
  await vmSettle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  sb.GameAudio.init();
  g.G.soundOn = true;
  await g.race("monza", "day", "dry");
  g.apex.headless(true);
  g.apex.setInput({ throttle: true, steer: 0 });
  const t0 = sb.performance.now();
  for (let i = 1; i <= 240; i++) g.pumpFrame(t0 + i * 1000 / 60);
  return { g, sb, G: g.G, t0, frameBase: 240 };
}

test("solo pause replay scrub feeds engine and rivals; rpm tracks speed; radio silent", async () => {
  const { g, sb, G, t0, frameBase } = await bootSoloRaceForScrubAudio();
  try {
    const doc = g.sandbox.document;
    G.els.pausebtn.onclick();
    assert.equal(G.paused, true);
    assert.equal(sb.GameAudio.debug().engineOn, false, "plain pause silences the engine");
    const rb = G.replayBuf;
    assert.ok(rb && rb.window().frames >= 90, "need ~3 s of ring before scrub");
    let radioCalls = 0;
    const origRadio = sb.GameAudio.radioVoice.bind(sb.GameAudio);
    sb.GameAudio.radioVoice = (...a) => { radioCalls++; return origRadio(...a); };
    assert.equal(rb.beginScrub(false), true);
    assert.equal(rb.isScrubbing(), true);
    const player = G.player;
    for (let i = 1; i <= 20; i++) g.pumpFrame(t0 + (frameBase + i) * 1000 / 60);
    assert.equal(sb.GameAudio.debug().engineOn, true, "scrub/play feeds the engine voice");
    const rivals = sb.GameAudio.rivalState().filter((v) => v.gain > 0.001);
    assert.ok(rivals.some((v) => v.hz > 200), "at least one rival above idle pitch during scrub");
    assert.equal(radioCalls, 0, "no new radio voice lines during replay scrub");
    const w = rb.window();
    rb.apply(w.t0);
    const slow = player.speed, rpmSlow = player.rpm;
    rb.apply(w.t1);
    const fast = player.speed, rpmFast = player.rpm;
    assert.notEqual(slow, fast, "precondition: scrub window spans different speeds");
    assert.notEqual(rpmSlow, rpmFast, "rpm must follow replayed speed, not stay pinned");
    assert.ok(rpmFast > rpmSlow === fast > slow, "rpm ordering matches speed ordering");
    rb.endScrub();
    g.pumpFrame(t0 + (frameBase + 25) * 1000 / 60);
    assert.equal(sb.GameAudio.debug().engineOn, false, "back on the pause menu: engine off again");
    doc.getElementById("pm-resume").onclick();
    assert.equal(G.paused, false);
    g.step(3);
    assert.equal(sb.GameAudio.debug().engineOn, true, "resume restores live race engine");
  } finally { g.close(); }
});

function rivalPanWithGain(sb) {
  const rows = sb.GameAudio.rivalState().filter((v) => v.gain > 0.001);
  assert.ok(rows.length, "need at least one audible rival voice");
  return rows[0].pan;
}

test("dbgCam during replay scrub pans rivals from the free camera, not chase", async () => {
  const { g, sb, G, t0, frameBase } = await bootSoloRaceForScrubAudio();
  try {
    G.els.pausebtn.onclick();
    assert.equal(G.replayBuf.beginScrub(false), true);
    const rival = G.cars.find((c) => c !== G.player);
    assert.ok(rival, "need a rival car");
    g.apex.headless(false);
    const saveFrustum = G.gfx.makeFrustumPlanes;
    G.gfx.makeFrustumPlanes = null;
    const origTickScrub = G.replayBuf.tickScrub.bind(G.replayBuf);
    G.replayBuf.tickScrub = (dt) => {
      origTickScrub(dt);
      G.player.s = 500; G.player.x = 0;
      rival.s = 502; rival.x = 0;
      G.player.px = 0; G.player.pz = 0; G.player.py = 5;
      rival.px = 0; rival.pz = -18; rival.py = 5;
    };
    const eye = [0, 5, 0];
    G.dbgCam = { eye: eye.slice(), target: [100, 5, 0], fov: 70, far: 2500 };
    g.pumpFrame(t0 + (frameBase + 1) * 1000 / 60);
    const panLeft = rivalPanWithGain(sb);
    G.dbgCam = { eye: eye.slice(), target: [-100, 5, 0], fov: 70, far: 2500 };
    g.pumpFrame(t0 + (frameBase + 2) * 1000 / 60);
    const panFlip = rivalPanWithGain(sb);
    assert.ok(panLeft < -0.15, `rival on visual left should pan negative, got ${panLeft}`);
    assert.ok(panFlip > 0.15, `180° free cam should flip pan positive, got ${panFlip}`);
    assert.notEqual(Math.sign(panLeft), Math.sign(panFlip), "pan follows dbgCam heading");
    G.gfx.makeFrustumPlanes = saveFrustum;
  } finally { g.close(); }
});

test("pause + free camera without scrub stays silent (#1262)", async () => {
  const { g, sb, G, t0, frameBase } = await bootSoloRaceForScrubAudio();
  try {
    G.els.pausebtn.onclick();
    assert.equal(G.paused, true);
    assert.equal(sb.GameAudio.debug().engineOn, false);
    g.sandbox.document.getElementById("pc-toggle").onclick();
    assert.equal(G.photoMode, true);
    assert.equal(G.replayBuf.isScrubbing(), false);
    for (let i = 1; i <= 5; i++) g.pumpFrame(t0 + (frameBase + i) * 1000 / 60);
    assert.equal(sb.GameAudio.debug().engineOn, false, "plain pause + photo cam: no engine");
    assert.ok(sb.GameAudio.rivalState().every((v) => v.gain < 0.001), "no rival voices open");
  } finally { g.close(); }
});

test("clearing dbgCam and resuming chase restores player-track rival pan", async () => {
  const { g, sb, G, t0, frameBase } = await bootSoloRaceForScrubAudio();
  try {
    G.els.pausebtn.onclick();
    assert.equal(G.replayBuf.beginScrub(false), true);
    g.apex.headless(false);
    const saveFrustum = G.gfx.makeFrustumPlanes;
    G.gfx.makeFrustumPlanes = null;
    G.dbgCam = { eye: [0, 5, 0], target: [100, 5, 0], fov: 70, far: 2500 };
    g.pumpFrame(t0 + (frameBase + 1) * 1000 / 60);
    assert.equal(sb.GameCams.getListenerBasis().external, true, "dbgCam publishes external basis");
    G.replayBuf.endScrub();
    G.dbgCam = null;
    g.sandbox.document.getElementById("pm-resume").onclick();
    assert.equal(G.paused, false);
    const rival = G.cars.find((c) => c !== G.player);
    assert.ok(rival);
    const me = G.player;
    me.s = 500; me.x = 0; me.speed = 55;
    rival.s = 500; rival.x = -3; rival.speed = 50; rival.retired = false;
    g.apex.setInput({ throttle: true, steer: 0 });
    for (let i = 1; i <= 30; i++) g.pumpFrame(t0 + (frameBase + 10 + i) * 1000 / 60);
    assert.equal(sb.GameCams.getListenerBasis().external, false, "chase cam republishes non-external basis");
    G.gfx.makeFrustumPlanes = saveFrustum;
  } finally { g.close(); }
});
