import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("careerSlotDelete preserves conflict and session-only durability metadata", () => {
  let result, loads = 0, refreshes = 0;
  const slots = [{ flavour: "driver", i: 0, used: false }];
  const context = vm.createContext({
    CamModes: { CAM_MODES: [] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) },
    Career: { deleteSlot: () => result, load: () => { loads++; }, slots: () => slots },
  });
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8"), context);
  const api = vm.runInContext("ApexApi", context).create({ track: {}, refreshCareerButton: () => { refreshes++; } });
  result = { ok: false, durable: false, reason: "conflict" };
  assert.equal(api.careerSlotDelete("driver", 0), result);
  assert.equal(loads, 0); assert.equal(refreshes, 0);
  result = { ok: true, durable: false, reason: "quota" };
  const session = api.careerSlotDelete("driver", 0);
  assert.equal(session.ok, true); assert.equal(session.durable, false); assert.equal(session.reason, "quota");
  assert.equal(session.slots, slots);
  result = { ok: true, durable: true, reason: null };
  assert.equal(api.careerSlotDelete("driver", 0).durable, true);
  assert.equal(loads, 2); assert.equal(refreshes, 2);
});
