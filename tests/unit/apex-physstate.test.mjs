/* apex-physstate.test.mjs — __apex.physState() with no track (audit4 hunt-core-b B3).
 * A stepped rebuild or the menu flyby drop nulls G.track while the last race's player
 * keeps px; physState() used to hand null to Tracks.sample and throw in a spec's poll.
 * Run: node --test tests/unit/apex-physstate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

function loadApex(G, extra) {
  const context = vm.createContext(Object.assign({
    CamModes: { CAM_MODES: [{ id: "chase" }] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) },
  }, extra));
  const load = (f) => vm.runInContext(fs.readFileSync(absSrc("js/agent/" + f), "utf8"), context, { filename: absSrc("js/agent/" + f) });
  for (const f of ["apex-net.js", "apex-cam.js", "apex-track.js", "apex-lobby.js", "apex.js"]) load(f);
  return vm.runInContext("ApexApi", context).create(G);
}

// building: true = the stepped rebuild window, so the hook wrapper does not auto-load a track.
test("physState() reports no track instead of sampling a null track", () => {
  let sampled = 0;
  const api = loadApex({ player: { px: 3, pz: 4, s: 10, speed: 20 }, track: null, cars: [] },
    { Tracks: { building: () => true, sample: (t) => { sampled++; if (!t) throw new TypeError("null track"); } } });
  assert.equal(JSON.stringify(api.physState()), JSON.stringify({ error: "no track" }));   // cross-realm object: compare by value
  assert.equal(sampled, 0);
});

test("physState() is still null before the player is placed", () => {
  const api = loadApex({ player: { px: null }, track: null, cars: [] }, { Tracks: { building: () => true, sample: () => {} } });
  assert.equal(api.physState(), null);
});
