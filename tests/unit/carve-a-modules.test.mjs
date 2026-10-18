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

test("DriveTune.create() keeps the live driving defaults", () => {
  const DriveTune = load("../../js/physics/drive-tune.js", "DriveTune");
  const t = DriveTune.create();
  assert.equal(t.PACE, 1);
  assert.equal(t.WHEELBASE, 3.2);
  assert.equal(t.STEER_EXPO, 2.4);
  assert.equal(t.FRONT_GRIP, 0.94);
  assert.equal(t.ROAD_FOLLOW, 0);
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

test("GradeTint keeps a neutral tint neutral and LightTuneEdit clears the chunk latch on a rising edge", () => {
  const GradeTint = load("../../js/fx/grade-tint.js", "GradeTint");
  const neutral = GradeTint.hue([1, 1, 1], 40);
  assert.ok(neutral.every((c) => Math.abs(c - 1) < 1e-9), JSON.stringify(neutral));
  const sat = GradeTint.sat([1, 0, 0], 0);
  assert.ok(sat[0] > 0 && sat[1] > 0 && sat[2] > 0);
  const LightTuneEdit = load("../../js/race/light-tune-edit.js", "LightTuneEdit");
  const LT = { perChunkLights: 0, carEnvCube: 0 };
  let stored = null;
  const ctx = {
    LT, ltStore: { set(id, v) { stored = [id, v]; return true; } }, gfx: { invalidateSoftPresent() {} },
    get perChunkOff() { return this._off; }, set perChunkOff(v) { this._off = v; }, _off: true,
    envProbeOff: false,
  };
  ctx.localStorage = undefined;
  LightTuneEdit.set("perChunkLights", 1, ctx);
  assert.equal(ctx.perChunkOff, false);
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
