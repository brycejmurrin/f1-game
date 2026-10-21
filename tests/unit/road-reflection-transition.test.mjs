// Wet-road SSR: bounded overload fades, immediate safety/off controls, and real governor recovery.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";

const source = fs.readFileSync(new URL("../../js/render/shared/post-common.js", import.meta.url), "utf8");
const common = eval(source + ";PostCommon");
function rig() {
  const opts = {}, state = { value: NaN, target: 1, time: 0 };
  return { opts, state, at(now, auto = 0, { wet = 1, strength = 0.9, tier = 4, emergency = false } = {}) {
    common.roadReflection(opts, wet, strength, tier, auto, state, now, emergency);
    return opts.reflect;
  } };
}

test("measured cuts and recovery are continuous, bounded and refresh-rate independent", () => {
  for (const hz of [30, 60, 120]) {
    const r = rig(), step = 1000 / hz;
    assert.equal(r.at(0), 0.9);
    assert.equal(r.at(100, 4), 0.9, "the transition frame does not pop");
    let prev = 0.9;
    for (let ms = step; ms < 180; ms += step) {
      const value = r.at(100 + ms, 4);
      assert.ok(value <= prev && value > 0);
      prev = value;
    }
    assert.equal(r.at(280, 4), 0, "finite fade permits SSR pass skipping");
    assert.equal(r.at(500, 0), 0, "recovery also starts continuously");
    prev = 0;
    for (let ms = step; ms < 400; ms += step) {
      const value = r.at(500 + ms, 0);
      assert.ok(value >= prev && value <= 0.9);
      prev = value;
    }
    assert.equal(r.at(900, 0), 0.9);
    assert.equal(r.opts.ssrQuality, 2);
  }
});

test("manual off, dry shedding and crash safety do not wait for the fade", () => {
  const r = rig();
  r.at(0);
  assert.equal(r.at(10, 0, { strength: 0 }), 0);
  assert.equal(r.at(20), 0.9);
  assert.equal(r.at(30, 0, { wet: 0 }), 0);
  assert.equal(r.at(40), 0.9);
  assert.equal(r.at(50, 4, { emergency: true }), 0);
  assert.equal(r.at(60, 4, { emergency: true, tier: 0 }), 0);
  assert.equal(r.at(70, 0), 0, "leaving safe mode recovers gradually");
  assert.equal(r.at(470), 0.9);
});

test("caller reset starts at the new policy without stale strength; invalid clocks do not corrupt state", () => {
  const r = rig();
  r.at(0); r.at(10, 4); r.at(100, 4);
  r.state.value = NaN;
  assert.equal(r.at(101), 0.9, "healthy new race/backend initializes immediately");
  r.state.value = NaN;
  assert.equal(r.at(102, 4), 0, "shed new race/backend initializes off");
  r.at(200, 0);
  assert.equal(r.at(NaN, 0), 0);
  assert.equal(r.at(190, 0), 0);
  assert.equal(r.at(400, 0), 0.45, "backwards time is not counted twice");
  assert.equal(r.at(10000, 0), 0.9, "elapsed hidden-tab time settles the target");
});

test("a real LOW governor cut reaches zero before its rejected-cut verification and recovers", () => {
  seedLogGlobal(); seedStoreGlobal();
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.window = { __APEX_BUILD: 1 };
  const gov = eval(fs.readFileSync(new URL("../../js/perf/governor.js", import.meta.url), "utf8") + ";PerfGov");
  gov.init({ isMobile: true, getRenderScale: () => 0.5000000000000001, setRenderScale: () => false });
  gov.setUserTier(4);
  const r = rig(), transitions = [];
  let ms = 0, zeroAt = null, restoredAt = null, lastTier = gov.autoTier();
  r.at(ms, lastTier);
  transitions.push(lastTier);
  for (let frame = 1; frame <= 650; frame++) {
    ms += 33.3; gov.tick(33.3);
    const tier = gov.autoTier();
    const value = r.at(ms, tier, { emergency: gov.tierFloor() >= 4 });
    if (tier !== lastTier) {
      transitions.push(tier);
      if (tier === 4) assert.equal(value, 0.9);
      else { restoredAt = ms; assert.equal(value, 0); }
      lastTier = tier;
    }
    if (tier === 4 && value === 0 && zeroAt === null) zeroAt = ms;
  }
  assert.deepEqual(transitions, [0, 4, 0]);
  assert.ok(zeroAt !== null && restoredAt - zeroAt > 1000,
    "the verification window observes fully disabled SSR, not the short fade");
  assert.equal(r.opts.reflect, 0.9);
});
