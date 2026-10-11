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

// ── the custom-lamp cap (CUSTOM_LAMP_CAP in build-props.js) ────────────────────
// A fresh VM per call: the scenery closure is wrapped in the context so the test
// can see every lampPost() call a circuit makes and what the build did with it.
function buildWrapped(id, extra) {
  const T = buildContext(null, { quiet: false });
  const def = T.LIST.find((d) => d.id === id);
  const calls = [];
  const orig = T._vmContext.TrackScenery[id];
  T._vmContext.TrackScenery[id] = function (api) {
    const lp = api.lampPost;
    api.lampPost = (spec) => { calls.push(spec); return lp(spec); };
    orig(api);
    if (extra) extra(api);
  };
  const track = T.build(def, { night: true });
  const custom = (track.lampPosts || []).filter((p) => p.custom && !p.mast && !p.pit);
  return { T, track, calls, custom, warns: T._vmConsole.filter((l) => /lamp posts registered/.test(l)) };
}

test("hungaroring: every lampPost() call is lit, braking-zone clusters included (S1)", () => {
  // 127 calls against a cap of 96 refused the last 31 - three braking-zone
  // clusters drawn as poles with no light. Within the cap the set is untouched.
  const { calls, custom, warns } = buildWrapped("hungaroring");
  assert.ok(calls.length > 96, `hungaroring must still exceed the old cap of 96 (got ${calls.length})`);
  assert.equal(custom.length, calls.length, "every registered lamp must reach track.lampPosts");
  assert.deepEqual(warns, [], "nothing dropped, nothing to warn about");
});

test("a circuit within the cap keeps its lamp set whole (imola)", () => {
  const { calls, custom } = buildWrapped("imola");
  assert.equal(custom.length, calls.length);
  assert.ok(custom.every((p, i) => p.x === calls[i].pos[0] && p.z === calls[i].pos[2]), "same records, same order");
});

test("over the cap: always-on lamps survive, the rest thin, one warning", () => {
  const EXTRA = 200, ALWAYS = 6;
  const { track, calls, custom, warns } = buildWrapped("hungaroring", (api) => {
    // 200 more stacked on one stretch, then 6 `always` lamps registered LAST -
    // first-come-first-served would have refused every one of them.
    for (let i = 0; i < EXTRA; i++) {
      const a = api.anchor(50 + (i % 40), 1, 8);
      api.lampPost({ pos: [a.c[0], a.c[1] + 9, a.c[2]], k: 50 + (i % 40), side: 1, kind: "halogen" });
    }
    for (let i = 0; i < ALWAYS; i++) {
      const a = api.anchor(600 + i * 25, -1, 8);
      api.lampPost({ pos: [a.c[0], a.c[1] + 9, a.c[2]], k: 600 + i * 25, side: -1, kind: "led", always: true });
    }
  });
  assert.ok(calls.length >= 127 + EXTRA + ALWAYS, `the extras were registered too (${calls.length} calls)`);
  assert.equal(custom.length, 160, "the cap is the cap");
  assert.equal(custom.filter((p) => p.always).length, ALWAYS, "always-on lamps are never the ones thinned");
  assert.equal(track.hasAlwaysLamps, true);
  assert.equal(warns.length, 1, "exactly one Log.warn for the whole build");
  assert.match(warns[0], /hungaroring: \d+ lamp posts registered, cap 160 - dropped \d+/);
});
