// verify-track-def-checks — tools/track/verify-track.cjs is the documented local
// floor for a circuit edit (AGENTS.md rule 3), so it must refuse circuit DATA
// the build itself never trips on. Each bad input below reported plain OK
// before 2026-11-10: a figure-8 centreline crossing itself at grade,
// duplicated / out-of-order turns, an apex at frac 1.7, and a lengthKm 20 %
// off the built lap. The guard also builds with the baked asset
// pack, as tools/lib/track-build-vm.cjs and a browser do.
//
// Run: node --test tests/unit/verify-track-def-checks.test.mjs   (~15 s)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VT = require("../../tools/track/verify-track.cjs");
const Tracks = VT.buildContext(null, { quiet: true, assets: true });
const def = (id) => Tracks.LIST.find((d) => d.id === id);
const withDef = (id, patch) => Object.assign({}, def(id), patch);

test("the real defs pass the data checks (monza, suzuka with its bridge, spa within its baseline)", () => {
  for (const id of ["monza", "suzuka", "spa", "albert_park"]) assert.doesNotThrow(() => VT.defChecks(Tracks, def(id)), id);
});

test("turns: a duplicate, an out-of-order apex and a fraction outside [0,1] fail", () => {
  const t = def("monza").turns;
  assert.throws(() => VT.defChecks(Tracks, withDef("monza", { turns: [t[0], t[0], ...t.slice(1)] })), /duplicates turns\[0\]/);
  assert.throws(() => VT.defChecks(Tracks, withDef("monza", { turns: [t[1], t[0], ...t.slice(2)] })), /before turns\[0\].*lap order/);
  assert.throws(() => VT.defChecks(Tracks, withDef("monza", { turns: [...t.slice(0, -1), 1.7] })), /= 1\.7 is not a lap fraction in \[0,1\]/);
  assert.throws(() => VT.defChecks(Tracks, withDef("monza", { turns: [-0.1, ...t] })), /not a lap fraction/);
});

test("lengthKm: 20 % off the built centreline fails; the tolerance holds the measured fleet spread", () => {
  const m = def("monza");
  assert.throws(() => VT.defChecks(Tracks, withDef("monza", { lengthKm: m.lengthKm * 1.2 })), /lengthKm .* % off the built centreline/);
  assert.throws(() => VT.defChecks(Tracks, withDef("monza", { lengthKm: m.lengthKm * 0.8 })), /off the built centreline/);
  assert.ok(VT.LENGTH_TOL <= 0.05, "a few percent, not a blanket pass");
});

// A flat figure-8 centreline on anderstorp's def: the build, the mesh checks and
// the required-model check all pass it (measured on the pre-fix tool); only the
// editor's road rules see the road crossing itself at grade.
const fig8 = (n = 120, a = 900, b = 420) => Array.from({ length: n }, (_, i) => {
  const t = i / n * 2 * Math.PI;
  return [+(a * Math.sin(t)).toFixed(2), 0, +(b * Math.sin(2 * t)).toFixed(2), 7, 0];
});
test("road rules: a centreline crossing itself at grade fails the full verifyDef", () => {
  const bad = withDef("anderstorp", { points: fig8(), turns: null, lengthKm: null, elevations: [], bridges: [] });
  assert.throws(() => VT.verifyDef(Tracks, bad, { quiet: true }),
    /TrackValidate\.judge\) read RED: crossing — The road crosses itself at grade/);
});

test("the judge baseline is shrink-only data: known circuits, known codes, nothing a fixed circuit still carries", () => {
  const base = require("../../tools/track/verify-track-baseline.json").judgeReds;
  const ids = new Set(Tracks.LIST.map((d) => d.id));
  for (const [id, codes] of Object.entries(base)) {
    assert.ok(ids.has(id), `${id} is not a circuit`);
    for (const c of codes) assert.ok(["start", "grade"].includes(c), `${id}: ${c} — only the real-world start/grade reds are baselined`);
  }
  // Without its entry spa's grade is a failure; an entry a circuit no longer earns is one too.
  assert.throws(() => VT.defChecks(Tracks, def("spa"), { judgeReds: {} }), /read RED: grade/);
  assert.throws(() => VT.defChecks(Tracks, def("monza"), { judgeReds: { monza: ["start"] } }), /no longer reads RED — drop it \(shrink-only\)/);
  assert.ok(!base.monza, "monza carries no exception");
});

test("the guard builds with the baked asset pack (more prop verts than a pack-less build)", () => {
  const withPack = VT.verifyTrack("monza", { quiet: true });
  const bare = VT.verifyTrack("monza", { quiet: true, assets: false });
  assert.ok(withPack.props > bare.props, `pack ${withPack.props} vs bare ${bare.props}`);
});
