/* session-records-assists.test.mjs — #5024: GRIP STEER and WheelState are part of the
 * record/ghost key (Bryce, 2026-11-11: "Yes, separate key"), only when not OFF, and a
 * STANDARD daily runs with both OFF.
 * Run: node --test tests/unit/session-records-assists.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");

function load() {
  let level = 1, wheel = false, daily = null;
  const announced = [];
  const G = { player: { team: { id: "mclaren" }, tierV: 1 }, track: { def: { id: "monza" }, n: 1, total: 1 },
    session: "tt", raceWeather: "dry", difficulty: "normal", raceTimeOfDay: "day", store: { rev: 1 },
    recordControls: null, announce: (m) => announced.push(m), daily: { current: () => daily } };
  const ctx = vm.createContext({ G, Teams: { LIST: [{ id: "mclaren" }] }, Input: { setSteerSpeedRef() {} },
    PhysicsConsts: { REVISION: 1 }, Ghost: { contextKey: (c) => JSON.stringify(c) },
    GripSteer: { level: () => level, setLevel: (v) => { level = v; } },
    WheelState: { enabled: () => wheel, setEnabled: (v) => { wheel = !!v; } } });
  vm.runInContext(read("js/race/session-phys.js") + ";globalThis.SessionPhys = SessionPhys;", ctx, { filename: absSrc("js/race/session-phys.js") });
  vm.runInContext(read("js/race/session-records.js"), ctx, { filename: absSrc("js/race/session-records.js") });
  // game.js recordControls, through the same SessionPhys.controls seam
  G.recordControls = () => ctx.SessionPhys.controls({ autoThrottle: false, gearsManual: false, steerMode: "keys", aero: "auto" });
  const rec = vm.runInContext("SessionRecords.create(G)", ctx);
  return { G, rec, announced, set: (o) => { if ("level" in o) level = o.level; if ("wheel" in o) wheel = o.wheel; },
    get: () => ({ level, wheel }), setDaily: (d) => { daily = d; } };
}

test("#5024: GRIP STEER and WheelState ON each change the key; OFF leaves the old key byte-identical", () => {
  const h = load();
  const off = h.rec.current();
  assert.ok(!off.includes("gripSteer") && !off.includes("wheelState"), "OFF adds no field: pre-#5024 keys stay valid");
  h.set({ level: 8 });
  const grip = h.rec.current();
  assert.notEqual(grip, off, "GRIP 8 is its own class");
  h.set({ level: 1, wheel: true });
  const wheel = h.rec.current();
  assert.notEqual(wheel, off, "WheelState ON is its own class");
  assert.notEqual(wheel, grip);
  h.set({ wheel: false });
  assert.equal(h.rec.current(), off);
});

test("#5024: a STANDARD daily forces both OFF, restores them after, and refuses a lap if one is turned back on", () => {
  const h = load();
  h.set({ level: 8, wheel: true });
  h.rec.prepareDaily();
  assert.deepEqual(h.get(), { level: 1, wheel: false }, "prepareDaily: both OFF");
  h.setDaily({ class: "standard" });
  h.set({ level: 6 });
  assert.equal(h.rec.accept(), false, "GRIP STEER turned on mid-daily: the lap is refused");
  assert.match(h.announced.at(-1), /STANDARD DAILY/);
  h.rec.restoreDaily();
  assert.deepEqual(h.get(), { level: 8, wheel: true }, "restoreDaily: the driver's own settings come back");
});
