// scenery-api-contract.test.mjs — freezes the shape of the `scenery(api)`
// object that js/tracks.js buildProps hands to every circuit's bespoke
// scenery callback (24 consumer files in js/tracks/).
//
// The api members below are the de-facto public contract those files were
// written against (docs/SCENERY-API.md). Any split/refactor of buildProps
// must keep this surface intact — this test catches an accidentally dropped
// or renamed member headlessly in seconds, without building all 24 circuits.
//
// If you ADD a member intentionally, append it here (additions are safe;
// removals/renames break circuit files and need a sweep of js/tracks/*.js).
//
// Run: node --test tests/scenery-api-contract.test.mjs  (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../tools/verify-track.cjs");

const CONTRACT = [
  "ATM", "COL", "MAT",
  "addBox", "addCone", "addCyl", "addFrustum", "addMountain", "addPrism", "addPyramid",
  "along", "anchor", "backdrop", "bankedKerbStrip", "billboard", "bowlSeatWall",
  "building", "bush", "cantilever", "circuitKit", "cityFront", "concreteCanyon", "conifer",
  "cross", "def", "ds", "every", "fence", "ferrisWheel", "floodMast",
  "floodMastRing", "forestEdge", "foundation", "gantry", "grandstand", "gridshellCanopy",
  "groundPatch", "groundPlane", "groundYAt", "groundedSegments", "guardrail",
  "hash", "hedge", "house", "hw", "landmarkKit", "ledFacadeBands", "lerp",
  "marshalPost", "modelDiagnostics", "modelGroup", "motorhome", "mountain",
  "n", "night", "norm", "onTrack", "out", "overheadSpan", "pal", "palm",
  "pastelStreetRow", "peak", "pine", "place", "prop", "px", "py", "pyMin",
  "pz", "recordBarrier", "ridge", "runoffApron", "sailCanopy", "sceneryTheme", "seat",
  "signBoard", "theme", "tower", "track", "tree", "tyreWall",
  "underpassPortal", "upOf", "vadd", "wall", "waterField", "waterSurface",
];

test("buildProps sceneryApi surface matches the frozen contract", () => {
  const Tracks = buildContext();
  // A non-reversed, non-source-coordinate def sees the raw (unwrapped) api.
  const def = Tracks.LIST.find(
    (d) => !d.reverse && d.sceneryCoordinates !== "source" && d.scenery,
  );
  assert.ok(def, "need at least one plain circuit with a scenery callback");
  let keys = null;
  def.scenery = (api) => { keys = Object.keys(api).sort(); };
  Tracks.build(def);
  assert.ok(keys, "scenery callback was not invoked during Tracks.build");
  assert.deepEqual(keys, CONTRACT);
});

test("reversed/source-coordinate defs get the same surface (wrapped)", () => {
  const Tracks = buildContext();
  const def = Tracks.LIST.find(
    (d) => (d.reverse || d.sceneryCoordinates === "source") && d.scenery,
  );
  if (!def) return; // no such circuit currently — nothing to check
  let keys = null;
  def.scenery = (api) => { keys = Object.keys(api).sort(); };
  Tracks.build(def);
  assert.ok(keys, "scenery callback was not invoked during Tracks.build");
  // transformSceneryApi must wrap helpers without adding/dropping members.
  assert.deepEqual(keys, CONTRACT);
});
