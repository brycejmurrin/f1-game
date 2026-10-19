// carve-a-modules.test.mjs — the hunt-2 bags moved out of game.js keep their old values.
// Run: node --test tests/unit/carve-a-modules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function load(file, name, extra) {
  const context = vm.createContext(Object.assign({ performance: { now: () => 1000 } }, extra));
  vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), "utf8"), context);
  return vm.runInContext(name, context);
}

test("DriveTune.create() hands out independent tune bags; ROAD_FOLLOW ships off", () => {
  // The defaults themselves are pinned by the physics gates that measure them
  // (physics-characterization); copying the literals here guarded nothing.
  const DriveTune = load("../../js/physics/drive-tune.js", "DriveTune");
  const t = DriveTune.create(), u = DriveTune.create();
  assert.notEqual(t, u);
  for (const [k, v] of Object.entries(t)) if (typeof v === "number") assert.ok(Number.isFinite(v), k + " is finite");
  t.PACE = 0.5;
  assert.notEqual(u.PACE, 0.5, "a tuned bag must not leak into the next create()");
  // AGENTS.md §Physics: the arc must not reach the driver — road-follow is off unless assisted.
  assert.equal(u.ROAD_FOLLOW, 0);
});

test("LapRecord.create() starts a fresh time-trial and three open sectors", () => {
  const LapRecord = load("../../js/race/lap-record.js", "LapRecord");
  const r = LapRecord.create();
  assert.equal(r.ttRecord, Infinity);
  assert.equal(r.ttLaps.length, 0);
  assert.equal(r.sectorIdx, 0);
  assert.equal(r.sectorValid, true);
  assert.equal(JSON.stringify(r.sectorBests), JSON.stringify([Infinity, Infinity, Infinity]));
  assert.equal(JSON.stringify(r.sectorLast), JSON.stringify([null, null, null]));
  const r2 = LapRecord.create();
  r.ttLaps.push(1); r.sectorBests[0] = 30;
  assert.equal(r2.ttLaps.length, 0, "a fresh record shares no arrays with the last");
  assert.equal(r2.sectorBests[0], Infinity);
});

test("StormFlash decays a flash that is still up after the rain stops", () => {
  const StormFlash = load("../../js/race/storm-flash.js", "StormFlash");
  const s = StormFlash.create();
  s._ltFlash = 1;
  s._ltBase = { ambientSky: [0.1, 0.1, 0.1], ambientGround: [0.1, 0.1, 0.1], exposure: 1 };
  const frame = { ambientSky: [1, 1, 1], ambientGround: [1, 1, 1], exposure: 2 };
  s.step(0.5, { raining: false, LT: { lightningDecay: 8 }, frame });
  assert.ok(s._ltFlash < 0.05, "half a second at decay 8 drops the flash near zero, got " + s._ltFlash);
  s.step(0.5, { raining: false, LT: { lightningDecay: 8 }, frame });
  assert.equal(s._ltFlash, 0);
  assert.equal(frame.exposure, 1);
  assert.equal(frame.ambientSky[0], 0.1);
});

test("StormFlash in the rain: a strike sets exposure FROM the base, thunder follows its drawn delay, and the scene restores", () => {
  let strikes = [{ delay: 1.2 }];
  const StormFlash = load("../../js/race/storm-flash.js", "StormFlash", {
    Storm: { strikeIn: () => strikes.shift() || null, flashOk: () => true },
  });
  const s = StormFlash.create();
  const base = { ambientSky: [0.1, 0.1, 0.1], ambientGround: [0.05, 0.05, 0.05], exposure: 1 };
  s._ltBase = base;
  const frame = { ambientSky: [0, 0, 0], ambientGround: [0, 0, 0], exposure: 0 };
  const thunder = [];
  const env = (t) => ({ raining: true, state: "race", raceT: t, skyT: t, seed: 1, weather: {}, reduced: false, frame,
    LT: { lightning: 1, lightningDecay: 8, lightningFlash: 1 }, audio: { thunder: (v) => thunder.push(v) },
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) });
  const dt = 1 / 60;
  s.step(dt, env(dt));
  const f = s._ltFlash;
  assert.ok(f > 0.8 && f < 1, "the strike lit the flash and this frame decayed it: " + f);
  assert.ok(Math.abs(frame.exposure - (base.exposure + 0.22 * f)) < 1e-12, "exposure is base + 0.22·flash, " + frame.exposure);
  assert.ok(Math.abs(frame.ambientSky[0] - (0.1 + 0.55 * f)) < 1e-12);
  // Every frame of the flash SETS from the base (the old `+=` washed a storm to white).
  let maxExp = frame.exposure;
  for (let i = 2; i < 240; i++) { s.step(dt, env(i * dt)); maxExp = Math.max(maxExp, frame.exposure); }
  assert.ok(maxExp <= base.exposure + 0.22 + 1e-12, "exposure never climbs past one flash: " + maxExp);
  assert.equal(s._ltFlash, 0);
  assert.equal(frame.exposure, base.exposure, "the scene is back to its base after the strike");
  assert.equal(frame.ambientGround[0], base.ambientGround[0]);
  assert.equal(thunder.length, 1, "one strike, one thunder");
  assert.ok(Math.abs(thunder[0] - (1 - (1.2 - 1) / 5)) < 1e-12, "thunder volume from the DRAWN delay: " + thunder[0]);
});

test("GradeTint keeps a neutral tint neutral and LightTuneEdit clears the chunk latch on a rising edge", () => {
  const GradeTint = load("../../js/fx/grade-tint.js", "GradeTint");
  const neutral = GradeTint.hue([1, 1, 1], 40);
  assert.ok(neutral.every((c) => Math.abs(c - 1) < 1e-9), JSON.stringify(neutral));
  const sat = GradeTint.sat([1, 0, 0], 0);
  assert.ok(sat[0] > 0 && sat[1] > 0 && sat[2] > 0);
  const removed = [];
  // The module reads the GLOBAL localStorage (setting ctx.localStorage did nothing): record its removeItem.
  const LightTuneEdit = load("../../js/race/light-tune-edit.js", "LightTuneEdit",
    { localStorage: { removeItem: (k) => removed.push(k) } });
  const LT = { perChunkLights: 0, carEnvCube: 0 };
  let stored = null;
  const ctx = {
    LT, ltStore: { set(id, v) { stored = [id, v]; return true; } }, gfx: { invalidateSoftPresent() {} },
    get perChunkOff() { return this._off; }, set perChunkOff(v) { this._off = v; }, _off: true,
    envProbeOff: false,
  };
  LightTuneEdit.set("perChunkLights", 1, ctx);
  assert.equal(ctx.perChunkOff, false);
  assert.deepEqual(removed, ["apex26.perChunkOff"], "the persisted latch is cleared too");
  assert.deepEqual(stored, ["perChunkLights", 1]);
});

test("AnnounceBanner holds the floor: a higher card queues instead of replacing the one on screen", () => {
  const said = [];
  const els = {
    announceText: { textContent: "" }, announceWho: { textContent: "" }, announceNum: { textContent: "" },
    announce: { className: "", dataset: {}, hidden: true }, announceLive: { textContent: "" },
  };
  const AnnounceBanner = load("../../js/race/announce-banner.js", "AnnounceBanner", {
    RadioVoice: { SPEAKERS: { info: "radio", warning: "control" } },
    GameAudio: { radioLeadS: () => 0, radioSting() {} },
    LiveRegion: { say(t) { said.push(t); } },
  });
  const banner = AnnounceBanner.create({
    els: () => els, player: () => ({ name: "A B", num: 1 }), state: () => "race",
    hudProfile: () => "full", camMode: () => 0, camModes: () => [{ id: "chase" }],
    radioVoice: () => ({ say() {} }), history: () => null,
  });
  assert.equal(banner.announce("WEAR", 2, "info"), true);
  assert.match(els.announceText.textContent, /WEAR/);
  assert.equal(banner.announce("FLAG", 2, "warning"), true);
  assert.match(els.announceText.textContent, /WEAR/, "the floor keeps the first card up");
  banner.tick(3);
  assert.match(els.announceText.textContent, /FLAG/);
});
