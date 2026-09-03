// floodmast-lamp-register.test.mjs — floodMast / floodMastRing must register
// lens positions into track.lampPosts so night pools anchor to the tall
// fixtures (unless opts.light:false). Catches the old "draw-only mast" hole
// that left Singapore/Bahrain on synthetic fallback lights with no fixture.
//
// Run: node --test tests/unit/floodmast-lamp-register.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

let _Tracks;
function Tracks() {
  return _Tracks || (_Tracks = buildContext());
}

function build(id) {
  const T = Tracks();
  const def = T.LIST.find((d) => d.id === id);
  assert.ok(def, `circuit ${id} registered`);
  // Night build so NIGHT lens albedos match the live game path; registration
  // itself is independent of session darkness, but the mast draw path branches.
  return T.build(def, { night: true });
}

test("singapore floodMastRing registers mast lamps (floodlights excluded)", () => {
  const track = build("singapore");
  const posts = track.lampPosts || [];
  const mast = posts.filter((p) => p && p.mast);
  assert.ok(mast.length > 40, `expected dozens of mast lamps, got ${mast.length}`);
  assert.ok(mast.every((p) => p.custom && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
  // Warm Singapore ring uses cool:false → halogen kind.
  assert.ok(mast.some((p) => p.kind === "halogen"), "warm ring should register halogen");
});

test("bahrain floodMastRing registers mast lamps (floodlights excluded)", () => {
  const track = build("bahrain");
  const mast = (track.lampPosts || []).filter((p) => p && p.mast);
  assert.ok(mast.length > 20, `expected mast lamps on Sakhir ring, got ${mast.length}`);
  assert.ok(mast.some((p) => p.kind === "flood_bank"), "cool ring should register flood_bank");
});

test("qatar Musco masts register as the night lighting rig", () => {
  const track = build("qatar");
  const mast = (track.lampPosts || []).filter((p) => p && p.mast);
  assert.ok(mast.length > 40, `expected Musco mast lamps, got ${mast.length}`);
  assert.ok(mast.every((p) => p.kind === "flood_bank"), "cool Musco banks register flood_bank");
  // Generic floodlights dressing is excluded — only mast-tagged posts remain.
  const generic = (track.lampPosts || []).filter((p) => p && !p.mast && !p.custom);
  assert.equal(generic.length, 0, "generic mast pass must stay suppressed on Lusail");
});
