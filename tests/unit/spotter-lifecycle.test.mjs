/* Spotter lifecycle: an accepted decode is not yet an audible warning. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function fixture() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL("../../js/race/spotter.js", import.meta.url), "utf8"), ctx);
  const requests = [];
  let live = null;
  const pack = {
    ensure() {}, plan: () => ({}), busy: () => !!live,
    speak(voice, text, options) { live = { text, options }; requests.push(live); return true; },
    stop() { const old = live; live = null; old?.options.onEnd?.(); },
  };
  const player = { s: 100, x: 0, speed: 50 };
  const rival = { s: 100, x: -2 };
  const G = { state: "race", soundOn: true, player, cars: [player, rival], track: { total: 1000 },
    store: { get: () => true }, vTop: () => 100, radio: { pack, volume: () => 1 } };
  const spotter = ctx.Spotter.create(G);
  const tick = (count = 10) => { for (let i = 0; i < count; i++) spotter.update(0.1); };
  const finish = (audible = false) => {
    const old = live; assert.ok(old, "a warning was scheduled");
    if (audible) assert.equal(old.options.valid(), true);
    live = null; old.options.onEnd?.(); return old;
  };
  return { G, rival, tick, finish, requests, pack };
}

test("a warning lost during decoding is retried while the car remains alongside", () => {
  const f = fixture(); f.tick(); f.finish(); f.tick();
  assert.deepEqual(f.requests.map(r => r.text), ["Car left.", "Car left."]);
});

test("a decode failure cannot produce clear for a warning that was never heard", () => {
  const f = fixture(); f.tick(); f.finish(); f.rival.s += 30; f.tick();
  assert.deepEqual(f.requests.map(r => r.text), ["Car left."]);
});

test("a failed side change retains an earlier audible warning and still calls clear", () => {
  const f = fixture(); f.tick(); f.finish(true);
  f.rival.x = 2; f.tick(); f.finish(); f.rival.s += 30; f.tick();
  assert.deepEqual(f.requests.map(r => r.text), ["Car left.", "Car right.", "Clear."]);
});

test("an old decode completion cannot erase a replacement field's warning", () => {
  const f = fixture(); f.tick(); const old = f.requests[0];
  f.G.cars = [...f.G.cars]; f.tick();
  assert.equal(f.requests.length, 2);
  old.options.onEnd?.(); f.finish(true); f.rival.s += 30; f.tick();
  assert.equal(f.requests.at(-1).text, "Clear.");
});

test("a failed still-there decode retains the initial heard side for clear", () => {
  const f = fixture(); f.tick(); f.finish(true); f.tick(45); f.finish();
  f.rival.s += 30; f.tick();
  assert.deepEqual(f.requests.map(r => r.text), ["Car left.", "Still there.", "Clear."]);
});

test("real VoicePack decode rejection restores the spotter's pending warning", async () => {
  const starts = [];
  const timers = new Map(); let timerId = 0;
  const ctx = vm.createContext({ Promise, Map, Set,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    Log: { info() {} },
    fetch: async (url) => ({ ok: true,
      json: async () => ({ clips: { "car left": [0, 1, 0.5], clear: [1, 1, 0.5] } }),
      arrayBuffer: async () => new ArrayBuffer(2) }),
    GameAudio: { now: () => 0, decodeClip: () => Promise.reject(new Error("context lost")),
      radioVoice: (...args) => { starts.push(args); return { end: 1, stop() {} }; } },
  });
  for (const file of ["js/audio/voice-pack.js", "js/race/spotter.js"])
    vm.runInContext(fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), ctx);
  const pack = ctx.VoicePack.create({}); pack.ensure("george");
  const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  await drain(); assert.equal(pack.ready("george"), true);
  const player = { s: 100, x: 0, speed: 50 }, rival = { s: 100, x: -2 };
  const spotter = ctx.Spotter.create({ state: "race", soundOn: true, player, cars: [player, rival],
    track: { total: 1000 }, vTop: () => 100, store: { get: () => true }, radio: { pack, volume: () => 1 } });
  const calls = [];
  for (let i = 0; i < 10; i++) { const key = spotter.update(0.1); if (key) calls.push(key); }
  assert.deepEqual(calls, ["car left"]); await drain();
  assert.equal(pack.busy(), false); assert.equal(starts.length, 0);
  for (let i = 0; i < 10; i++) { const key = spotter.update(0.1); if (key) calls.push(key); }
  assert.deepEqual(calls, ["car left", "car left"], "actual rejected decode permits another timely warning");
  await drain();
});

test("rapid pre-validation failures retain the call gap instead of decoding each tick", () => {
  const f = fixture(); f.tick(4); f.finish();
  // The first request was at 0.3 s; keep rejecting any retry immediately.
  for (let i = 0; i < 4; i++) {
    const before = f.requests.length; f.tick(1);
    if (f.requests.length > before) f.finish();
  }
  assert.equal(f.requests.length, 1, "no retry before the 0.6 s call gap expires");
  f.tick(2);
  assert.equal(f.requests.length, 2, "the pending warning retries once the gap expires");
});

for (const pending of ["still there", "side change", "initial warning"]) {
  test(`invalid ${pending} retains only warnings previously heard`, () => {
    const f = fixture(); f.tick();
    if (pending !== "initial warning") {
      f.finish(true);
      if (pending === "still there") f.tick(45);
      else { f.rival.x = 2; f.tick(); }
    }
    const delayed = f.requests.at(-1);
    f.rival.s += 30;
    assert.equal(delayed.options.valid(), false, "the delayed call no longer describes traffic");
    f.finish(); f.tick();
    const clear = f.requests.filter(r => r.text === "Clear.");
    assert.equal(clear.length, pending === "initial warning" ? 0 : 1,
      "clear follows an earlier heard warning, never an invalid initial warning");
  });
}

test("real VoicePack drops stale still-there audio but retains the heard warning for clear", async () => {
  const starts = [], decoders = [];
  const timers = new Map(); let timerId = 0;
  const ctx = vm.createContext({ Promise, Map, Set,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    Log: { info() {} }, fetch: async () => ({ ok: true,
      json: async () => ({ clips: { "car left": [0, 1, 0.5], "still there": [1, 1, 0.5], clear: [2, 1, 0.5] } }),
      arrayBuffer: async () => new ArrayBuffer(3) }),
    GameAudio: { now: () => 0, decodeClip: () => new Promise(resolve => decoders.push(resolve)),
      radioVoice: () => { starts.push(true); return { end: 1, stop() {} }; } },
  });
  for (const file of ["js/audio/voice-pack.js", "js/race/spotter.js"])
    vm.runInContext(fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), ctx);
  const pack = ctx.VoicePack.create({}); pack.ensure("george");
  const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  await drain(); assert.equal(pack.ready("george"), true);
  const player = { s: 100, x: 0, speed: 50 }, rival = { s: 100, x: -2 };
  const spotter = ctx.Spotter.create({ state: "race", soundOn: true, player, cars: [player, rival],
    track: { total: 1000 }, vTop: () => 100, store: { get: () => true }, radio: { pack, volume: () => 1 } });
  const calls = [];
  const tick = n => { for (let i = 0; i < n; i++) { const key = spotter.update(0.1); if (key) calls.push(key); } };
  tick(10); decoders.shift()({ duration: 0.5 }); await drain();
  assert.equal(starts.length, 1, "the initial warning actually reached audio"); pack.stop("spotter");
  tick(45); assert.equal(calls.at(-1), "still there");
  rival.s += 30; decoders.shift()({ duration: 0.5 }); await drain();
  assert.equal(starts.length, 1, "stale still-there is not played");
  tick(10); assert.equal(calls.at(-1), "clear");
  decoders.shift()({ duration: 0.5 }); await drain();
  assert.equal(starts.length, 2, "clear reaches audio after the heard initial warning");
  pack.stop("spotter");
});
