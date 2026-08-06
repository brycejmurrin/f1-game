// agentview-api-contract.test.mjs — freezes the shape of the agent-view
// surface: the object AgentView.create(G) returns, and the raster band that
// js/game/agentview-raster.js must keep providing to it.
//
// Why this exists: agentview.js grew past 3400 lines and the rasters were split
// into js/game/agentview-raster.js. A split like that fails SILENTLY — a
// dropped export doesn't throw at load, it throws the first time an agent calls
// the one method nobody tested, and `__apex` wires these names through by hand.
// The scenery split is guarded the same way (tests/scenery-api-contract.test.mjs);
// this is that guard for the agent view.
//
// If you ADD a method intentionally, append it here — additions are safe.
// Removals/renames are not: they break docs/AGENT-WORLD-API.md, the
// agentHelp() manifest, tools/agent.mjs, and .claude/skills/agent-view.
//
// Run: node --test tests/agentview-api-contract.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The agent-facing surface, as documented. The one-time deprecated aliases
// (visible/worldModel/frame/plan) were removed after every caller migrated to
// render({what}) and scene({visible}); REMOVED pins them out so a merge can't
// quietly resurrect them.
const CURRENT = [
  "world", "field", "trackInfo", "scene", "describe", "query", "atmosphere",
  "objective", "carView", "render", "survey", "rollout", "agentHelp",
  "corners", "terminal",
];
const REMOVED = ["visible", "worldModel", "frame", "plan"];
const CONSTS = ["API_VERSION", "PHYSICS_VERSION"];

// What agentview.js relies on the raster module to hand back.
const RASTER = ["frame", "plan", "carRender"];

// These files declare their module with a top-level `const`, which lands in the
// context's global LEXICAL scope rather than on the global object — so the
// binding has to be read back by evaluating its name, not off `ctx`.
function evalGlobals(files) {
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number,
                                 isNaN, isFinite, console });
  for (const f of files) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return (name) => vm.runInContext(name, ctx);
}

test("agentview-raster.js exposes create() and the three rasters", () => {
  const get = evalGlobals(["js/game/agentview-raster.js"]);
  const AgentRaster = get("AgentRaster");
  assert.equal(typeof AgentRaster, "object", "AgentRaster global missing");
  assert.equal(typeof AgentRaster.create, "function",
               "AgentRaster.create missing — agentview.js calls it at create()");

  // create() only destructures ctx, so an empty object is enough to read the
  // shape back without booting a track.
  const band = AgentRaster.create({});
  for (const name of RASTER) {
    assert.equal(typeof band[name], "function",
                 `AgentRaster lost ${name}() — agentview.js destructures it`);
  }
});

test("AgentView.create() still returns the whole documented surface", () => {
  const get = evalGlobals([
    "js/game/agentview-raster.js",
    "js/game/agentview.js",
  ]);
  const AgentView = get("AgentView");
  assert.equal(typeof AgentView, "object", "AgentView global missing");
  assert.equal(typeof AgentView.create, "function");

  // A minimal G: create() destructures a few helpers up front but does not
  // touch the track until a method is called.
  const view = AgentView.create({
    wrapS: (s) => s, gripMult: () => 1, LONG_GRIP: 34,
    update: () => {}, els: {}, camVantage: () => {},
  });

  for (const name of CURRENT) {
    assert.equal(typeof view[name], "function", `agent view lost ${name}()`);
  }
  for (const name of REMOVED) {
    assert.equal(view[name], undefined,
                 `removed alias ${name}() is back on the surface — callers were `
                 + `migrated to render({what})/scene({visible}); keep it out`);
  }
  for (const name of CONSTS) {
    assert.equal(typeof view[name], "number", `${name} missing`);
  }
});

test("the raster band reaches agentview through ctx, not a global grab", () => {
  // agentview.js must not reference the raster functions except through the
  // create() handshake — otherwise the split silently re-couples.
  const src = readFileSync(join(ROOT, "js/game/agentview.js"), "utf8");
  assert.match(src, /AgentRaster\.create\(/,
               "agentview.js no longer creates the raster band");
  assert.doesNotMatch(src, /function\s+(frame|plan|carRender)\s*\(/,
                      "a raster function was re-defined in agentview.js — it "
                      + "belongs in js/game/agentview-raster.js");
});
