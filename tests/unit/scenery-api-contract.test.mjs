// scenery-api-contract.test.mjs — freezes the shape of the `scenery(api)`
// object that js/track/tracks.js buildProps hands to every circuit's bespoke
// scenery callback (40 consumer files in js/circuits/).
//
// The api members below are the de-facto public contract those files were
// written against (docs/SCENERY-API.md). Any split/refactor of buildProps
// must keep this surface intact — this test catches an accidentally dropped
// or renamed member headlessly in seconds, without building every circuit.
//
// If you ADD a member intentionally, append it here (additions are safe;
// removals/renames break circuit files and need a sweep of js/circuits/*.js).
//
// Run: node --test tests/unit/scenery-api-contract.test.mjs  (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/verify-track.cjs");
const MANIFEST = require("../../tools/manifest.cjs");

const CONTRACT = [
  "ATM", "COL", "MAT",
  "acacia", "addBox", "addCone", "addCyl", "addFrustum", "addMountain", "addPrism", "addPyramid",
  "along", "anchor", "backdrop", "bakedModel", "bakedModels", "bankedKerbStrip",
  "billboard", "bleacher", "bowlSeatWall",
  "broadcastCompound", "broadleafFall", "building", "bush", "cameraTower", "cantilever", "circuitKit",
  "cityFront", "concreteCanyon", "conifer",
  "cross", "cypress", "def", "ds", "every", "fence", "ferrisWheel", "floodMast",
  "floodMastRing", "forestEdge", "foundation", "frameAt", "gantry", "grandstand", "grandstandEx",
  "gridshellCanopy",
  "groundPatch", "groundPlane", "groundUnder", "groundYAt", "groundedSegments", "guardrail",
  "hash", "hedge", "house", "hw", "indexSolid", "lampPost", "landmarkKit", "ledFacadeBands", "lerp",
  "marshalPost", "modelDiagnostics", "modelGroup", "motorhome", "mountain",
  "n", "night", "norm", "onTrack", "out", "overheadSpan", "pal", "palm",
  "pastelStreetRow", "peak", "pine", "place", "plane", "prop", "px", "py", "pyMin",
  "pz", "recordBarrier", "ridge", "runoffApron", "sailCanopy", "scaffoldStand",
  "sceneryTheme", "seat",
  "signBoard", "signDigit", "spectatorHill", "sponsorHoarding", "stonePine", "terrace", "terrainYAt", "theme",
  "tieredBowl", "tower", "track", "tree",
  "tyreWall",
  "underpassPortal", "upOf", "vadd", "wall", "waterBand", "waterField", "waterSurface",
];

// The member COUNT is asserted separately from the deepEqual above it: a paste
// that drops one name while adding another still satisfies "these are sorted and
// equal" if BOTH lists are edited together, and the count is the cheap tripwire
// that says how many things circuits may call. Bump it deliberately.
const CONTRACT_SIZE = 111;

test("the frozen contract is the size it declares", () => {
  assert.equal(CONTRACT.length, CONTRACT_SIZE);
  assert.equal(new Set(CONTRACT).size, CONTRACT_SIZE, "duplicate member in CONTRACT");
  assert.deepEqual(CONTRACT, [...CONTRACT].sort(), "CONTRACT must stay sorted");
});

test("buildProps sceneryApi surface matches the frozen contract", () => {
  const Tracks = buildContext();
  // A non-reversed, non-source-coordinate def sees the raw (unwrapped) api.
  // The shipped closures live in window.TrackScenery now (LAZY_SCENERY), so
  // "has a scenery callback" is a question about the manifest roster, not about
  // def.scenery — which is undefined on every shipped circuit today. The probe
  // below is assigned to def.scenery, which tracks.js resolves FIRST precisely
  // so an explicit override still beats the registry.
  const withScenery = new Set(MANIFEST.LAZY_SCENERY.map((f) => f.split("/").pop().replace(/\.js$/, "")));
  const def = Tracks.LIST.find(
    (d) => !d.reverse && d.sceneryCoordinates !== "source" && (d.scenery || withScenery.has(d.id)),
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
