// Exercise the real replay module and the announce queue's validity contract without a game renderer.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function fixture({ rate = 1, commentary = false, reel = false, radio = false, sound = false, volume = 0.8 } = {}) {
  const ctx = vm.createContext({ M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
    Log: { info() {}, warn() {}, debug() {} },
    Audio: class { constructor() { this.paused = true; } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } },
    Tracks: { sample: (_track, s, out) => { out.p = [s, 0, 0]; out.t = [1, 0, 0]; out.r = [0, 0, 1]; out.hw = 7; } } });
  vm.runInContext(fs.readFileSync(new URL("../../js/race/real-replay.js", import.meta.url), "utf8"), ctx);
  const drivers = [{ code: "AAA", num: 1, pos: 1 }, { code: "BBB", num: 2, pos: 2 }];
  const cars = drivers.map((d) => ({ code: d.code }));
  const pending = [], commentaryCalls = [];
  const G = { cars, track: { total: 1000 }, state: "race", raceT: 0, camMode: 0, soundOn: sound,
    followCar: (car) => { G.player = car; }, radio: { volume: () => volume },
    raceRadio: { commentates: () => commentary, replayEvent: (event) => { commentaryCalls.push(event); return true; } },
    announce: (text, duration, kind, still) => { pending.push({ text, duration, kind, still }); return true; } };
  const times = Array.from({ length: 201 }, (_, i) => i / 2);
  const trace = (speed) => ({ t: times, prog: times.map((t) => t * speed), x: times.map(() => 0) });
  const eventTimes = reel ? [10, 50] : [3, 10];
  const script = { laps: 5, drivers,
    passes: radio ? [] : eventTimes.map((t, i) => ({ t, lap: i + 1, by: i ? 2 : 1, over: i ? 1 : 2, pos: 1 })),
    radio: radio ? eventTimes.map((t, i) => ({ t, num: i + 1, url: "https://example.test/radio.mp3" })) : [] };
  const options = { script, traces: { frame: "track", cars: { 1: trace(50), 2: trace(45) } },
    seats: new Map(cars.map((c, i) => [c, drivers[i]])), camera: "side", rate, reel };
  const replay = vm.runInContext("RealReplay", ctx).create(G);
  assert.equal(replay.start(options), true);
  // game.js drains accepted cards only when `still` is absent or still true.
  const drain = () => pending.splice(0).filter((card) => !card.still || card.still()).map((card) => card.text);
  return { replay, options, pending, drain, commentaryCalls };
}

test("fallback replay captions cannot drain across seeks, stop, restart or finish", () => {
  for (const mode of [{ rate: 1, commentary: false }, { rate: 4, commentary: true }]) {
    const { replay, options, pending, drain, commentaryCalls } = fixture(mode);
    const reach = (T) => replay.tick((T - replay.status().T) / mode.rate);
    reach(3);
    const first = pending[0].text;
    assert.match(first, /AAA PASSES BBB/);
    replay.setPaused(true); replay.follow("BBB"); replay.setPaused(false);
    assert.deepEqual(drain(), [first], "ordinary camera and pause controls preserve the current caption");
    replay.seek(2); reach(3); replay.seek(9);
    assert.deepEqual(drain(), [], "a forward seek discards an accepted old caption");
    reach(10);
    assert.match(pending[0].text, /BBB PASSES AAA/);
    replay.seek(2);
    assert.deepEqual(drain(), [], "rewinding discards the future event's caption");
    reach(3);
    assert.deepEqual(drain(), [first], "the replayed event owns a fresh valid caption");
    replay.seek(2); reach(3); replay.stop();
    assert.deepEqual(drain(), [], "stopping invalidates accepted captions");
    replay.start(options); reach(3);
    replay.start(options); reach(3);
    assert.deepEqual(drain(), [first], "re-entry cannot revive a previous run's caption");
    reach(10); reach(107);
    assert.equal(replay.status().finished, true);
    assert.deepEqual(drain(), [], "a completed replay cannot emit stale captions over results");
    assert.equal(commentaryCalls.length, 0, "these events take the caption path, including fast playback");
    replay.stop();
  }
});

test("fallback replay captions retain each intended highlight and expire on manual and automatic reel cuts", () => {
  for (const automatic of [false, true]) {
    const { replay, pending, drain } = fixture({ reel: true });
    replay.tick(8); // First segment starts at T=2; its event is at T=10.
    assert.match(pending[0].text, /AAA PASSES BBB/);
    assert.equal(!pending[0].still || pending[0].still(), true, "the active highlight's caption stays valid");
    if (automatic) replay.tick(6); else replay.skip();
    assert.equal(replay.status().T, 42);
    assert.deepEqual(drain(), [], "a reel boundary discards accepted copy from the old segment");
    replay.tick(8);
    assert.match(drain()[0], /BBB PASSES AAA/, "the destination highlight receives its own valid caption");
    replay.stop();
  }
});

test("fallback replay radio captions share timeline ownership whether audio is playing or muted", () => {
  for (const mode of [{ sound: false }, { sound: true, volume: 0 }, { sound: true }]) {
    const { replay, pending, drain } = fixture({ ...mode, radio: true });
    replay.tick(3);
    assert.equal(pending[0].kind, "info");
    assert.equal(pending[0].text, "RADIO · AAA");
    replay.seek(9);
    assert.deepEqual(drain(), [], "radio text from before the seek cannot drain later");
    replay.tick(1);
    assert.deepEqual(drain(), ["RADIO · BBB"], "the next radio caption stays usable");
    replay.seek(2); replay.tick(1); replay.stop();
    assert.deepEqual(drain(), [], "radio text is also invalidated by exit");
  }
});
