// Regression ratchet: the three SMALL-SCALE vertical scenery checks must not grow.
//
// tools/track/ground-audit.cjs adds what float-audit and coplanar-faces miss
// (a 2026-09-24 scenery hunt found every one of these by eye first):
//   * buried       a prop whose whole top lies > 2 cm under Tracks.terrainY —
//                  invisible paint, decals or slabs laid at the wrong height;
//   * unsupported  a prop whose bottom stands > 0.15 m above the ground and
//                  that no chain of touching prims connects to it — a lamp
//                  head 0.5 m off its yoke, a 1.1 m floating sign. float-audit
//                  only flags bases > 1.2 m up, with a 6 m support radius;
//   * flatCoplanar same-facing HORIZONTAL faces in one plane (coplanar-audit
//                  --flat), a population coplanar-faces.test.mjs never counts.
//
// The fleet baseline lives in tests/data/scenery-audit-baseline.json and is a
// RATCHET: `node tools/track/ground-audit.cjs --all --update` only lowers it;
// `--all --gate` is the full check (~3 s a circuit). This file gates the WHOLE
// roster, narrowed by APEX_CIRCUITS (tools/lib/circuit-scope.cjs) exactly like
// the other fleet sweeps: a circuit-only PR audits its own circuits, a fleet
// diff all of them. A count over its cap fails, and a cap above the measured
// count fails as slack (lower it with --update) — the slack silently permits
// a regression.
//
// It sampled monaco/monza/spa until 2026-10-15 (#2210): suzuka grew buried
// 2 -> 3 on the deploy tip and no CI job saw it, because nothing outside the
// sample was ever measured. SAMPLE remains the anti-vacuity set.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { staleStrictIds } from "../../tools/lib/stale-rows.mjs";

const require = createRequire(import.meta.url);
const GA = require("../../tools/track/ground-audit.cjs");
const { buildContext, shipped } = require("../../tools/lib/track-build-vm.cjs");
const MANIFEST = require("../../tools/manifest.cjs");
const FP = require("../../tools/track/footprint-support.cjs");

// Chosen to carry non-zero counts on every check, so a blind audit cannot pass:
// monaco (harbour, hillside city), monza (bowl, banking), spa (forest).
// `unsupported` is the one fixes keep driving to 0 (spa's reached 0 in 2026-10),
// so it is carried by two circuits whose baseline still has rows (miami, bahrain):
// one more fix cannot blind the guard. When their rows reach 0, pick two that still
// have non-zero rows in tests/data/scenery-audit-baseline.json (measured == cap, or
// the "no stale cap" test below fails on the lowered row).
const SAMPLE = ["monaco", "monza", "spa", "miami", "bahrain"];

const { scope } = require("../../tools/lib/circuit-scope.cjs");
const ROSTER = scope(MANIFEST.CIRCUITS);

const base = GA.readBaseline();
let cached = null;
const measure = () => {
  if (cached) return cached;
  const env = buildContext();
  return (cached = ROSTER.map((id) => GA.run(env, id)));
};

test("baseline names every check and only real circuits", () => {
  const roster = new Set(MANIFEST.CIRCUITS);
  for (const c of GA.CHECKS) {
    assert.equal(typeof base[c], "object", `baseline lacks the "${c}" table`);
    for (const [id, n] of Object.entries(base[c])) {
      assert.ok(roster.has(id), `${c}: unknown circuit "${id}"`);
      assert.ok(Number.isInteger(n) && n >= 0, `${c}.${id}: caps are non-negative integers (absent = 0)`);
    }
  }
});

test("every (scoped) circuit stays within the scenery-audit baseline", () => {
  assert.ok(ROSTER.length > 0, `APEX_CIRCUITS=${process.env.APEX_CIRCUITS} names no circuit`);
  assert.equal(measure().length, ROSTER.length, "the sweep dropped a circuit");
  const over = GA.overBaseline(measure(), base);
  assert.deepEqual(over, [], "scenery audits grew — `node tools/track/ground-audit.cjs <id> --why` " +
    "names the source line:\n  " + over.join("\n  "));
});

// Gating the whole roster makes every stale row a candidate, so the #2183
// policy applies (tools/lib/stale-rows.mjs): on a PR only its own circuits'
// stale rows fail (all of them when it edits the baseline); the rest are
// advisories. Local runs stay strict.
test("no stale cap on the measured circuits — a cap above the measured count is a lie", (t) => {
  const strict = staleStrictIds("tests/data/scenery-audit-baseline.json");
  const slack = [];
  for (const r of measure())
    for (const c of GA.CHECKS) {
      const cap = (base[c] || {})[r.id] || 0;
      if (!(r.counts[c] < cap)) continue;
      const line = `${r.id} ${c}: baseline ${cap} but measured ${r.counts[c]}`;
      if (strict === null || strict.has(r.id)) slack.push(line);
      else t.diagnostic(`STALE (advisory: not in this diff) ${line}`);
    }
  assert.deepEqual(slack, [], "lower with `node tools/track/ground-audit.cjs --all --update`:\n  " + slack.join("\n  "));
});

test("anti-vacuity: every check finds something on the sample", (t) => {
  const r = measure().filter((x) => SAMPLE.includes(x.id));
  if (r.length < SAMPLE.length) return t.skip(`APEX_CIRCUITS scopes out part of ${SAMPLE.join("/")}`);
  for (const c of GA.CHECKS)
    assert.ok(r.some((x) => x.counts[c] > 0), `${c} reads 0 on ${SAMPLE.join("/")} — the audit went blind`);
  assert.ok(r.every((x) => x.props > 5000), "the harness built bare circuits (no scenery)");
});

test("lineOf names the circuit's own scenery line, past emitter plumbing", () => {
  const st = [
    "addBox (js/track/core/geom.js:10:3)",
    "dface (js/track/scenery/city.js:410:7)",
    "monaco (js/circuits/scenery/monaco.js:1192:5)",
  ].join("  <-  ");
  assert.equal(GA.lineOf(st), "monaco@circuits/scenery/monaco.js:1192");
  assert.equal(GA.lineOf("js/track/scenery/structures.js:128:13"), "track/scenery/structures.js:128");
  assert.equal(GA.lineOf(""), "?");
});

// Use the real emitter, including handedness, vertex order and index buffers.
// These fixtures exercise geometry outcomes rather than mirroring the audit.
let fixtureEnv;
function fixture(boxes, terrainY) {
  const env = fixtureEnv || (fixtureEnv = buildContext());
  const from = env.mark(), buf = { pos: [], nrm: [], col: [], idx: [], mat: [] };
  for (const [c, size, basis] of boxes) env.TrackGeom.addBox(buf, c, size, [0.5, 0.5, 0.5], basis);
  const prims = env.prims.slice(from);
  const result = FP.analyseFootprints(prims, terrainY);
  env.trim(from);
  return { result, prims, buf };
}

test("partial footprint: one grounded edge cannot hide the tilted high edge", () => {
  const c = Math.cos(0.12), s = Math.sin(0.12);
  const basis = [[c, s, 0], [-s, c, 0], [0, 0, 1]];
  const ground = (x) => x < 0 ? 3 - 5 * c - 5 * s : -5;
  const { result, prims, buf } = fixture([[[0, 3, 0], [10, 10, 10], basis]], ground);
  const legacy = GA.analyse({ Tracks: { terrainY: (_, x, z) => ground(x, z) } },
    { meshes: { props: { __cap: { pos: buf.pos } } } }, prims, { coplanar: false });
  assert.equal(legacy.counts.unsupported, 0, "the existing minimum-gap check accepts this box");
  assert.equal(result.findings.length, 1);
  assert.ok(result.findings[0].maxGap > 3);
  assert.equal(result.findings[0].samples.length, 9, "four corners, four edges, centre");
  assert.ok(new Set(result.findings[0].samples.map((x) => x.at[1].toFixed(3))).size > 1,
    "tilted bases retain every corner's actual height");
});

test("partial footprint: grounded slab and a full foundation stack pass", () => {
  assert.equal(fixture([[[0, 5, 0], [10, 10, 10]]], () => 0).result.findings.length, 0);
  const boxes = [[[0, 12, 0], [10, 10, 10]], [[0, 5, 0], [11, 4, 11]], [[0, 1.5, 0], [12, 3, 12]]];
  for (const order of [boxes, [...boxes].reverse()]) {
    const { result } = fixture(order, () => 0);
    assert.equal(result.findings.length, 0, "stack support must not depend on emission order");
    assert.ok(result.candidates > 0, "not vacuously out of scope");
  }
});

test("footprint support: overlapping foundations and stripped buried faces remain solid", () => {
  const ground = (x) => x < -4 ? 0 : -6;
  const overlapping = fixture([[[0, 5, 0], [10, 10, 10]], [[0, -2.5, 0], [11, 7, 11]]], ground);
  assert.equal(overlapping.result.findings.length, 0, "foundation extends through the base by one metre");
  const { prims, buf } = fixture([[[0, 5, 0], [10, 10, 10]], [[0, -3, 0], [11, 6, 11]]], ground);
  const kept = [];
  for (let i = 0; i < buf.idx.length; i += 3) {
    const tri = buf.idx.slice(i, i + 3);
    if (!tri.every((k) => buf.pos[k * 3 + 1] === -6)) kept.push(...tri);
  }
  assert.ok(kept.length < buf.idx.length, "fixture strips a real buried bottom face");
  buf.idx = kept;
  assert.equal(FP.analyseFootprints(prims, ground).findings.length, 0);
});

test("footprint support: modelGroup remapping retains exact nonzero vertex ranges", () => {
  const ground = (x) => x < -4 ? 0 : -6;
  const { prims, buf } = fixture([[[0, 5, 0], [10, 10, 10]], [[0, -3, 0], [11, 6, 11]]], ground);
  const { buf: target } = fixture([[[50, 5, 50], [10, 10, 10]]], () => 0);
  const base = target.pos.length / 3;
  target.pos.push(...buf.pos); target.nrm.push(...buf.nrm); target.idx.push(...buf.idx.map((k) => k + base));
  target.__blocks = [{ from: buf, base }];
  const mapped = shipped(prims, new Set([target]));
  assert.equal(mapped.length, prims.length);
  assert.ok(mapped.every((p) => p.s >= base * 3 && p.buf === target));
  assert.equal(FP.analyseFootprints(mapped, ground).findings.length, 0);
});

test("footprint support: disconnected baked mesh faces cannot masquerade as a solid column", () => {
  const env = buildContext(), from = env.mark();
  const buf = { pos: [], nrm: [], col: [], idx: [], mat: [] };
  env.TrackGeom.addBox(buf, [0, 8, 0], [10, 10, 10], [0.5, 0.5, 0.5]);
  const pos = [-6, 0, -6, 6, 0, -6, 6, 0, 6, -6, 0, 6,
    -6, 3, -6, 6, 3, -6, 6, 3, 6, -6, 3, 6];
  env.TrackGeom.addMesh(buf, { pos, idx: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7] });
  const { findings, unknownSamples } = FP.analyseFootprints(env.prims.slice(from), () => 0);
  assert.equal(findings.length, 1, "uncertainty produces a review finding rather than a false pass");
  assert.equal(findings[0].supportedSamples, 0);
  assert.equal(findings[0].unverifiedSamples, 9);
  assert.equal(unknownSamples, 9);
  const report = FP.diagnostic({ px: [0], pz: [0] }, "monaco", findings[0]);
  assert.equal(report.kind, "unverifiedFootprint");
  env.trim(from);
});

test("partial footprint: a neighbouring box or a floating foundation cannot supply support", () => {
  const ground = (x) => x < -4 ? 0 : -6;
  const mass = [[0, 5, 0], [10, 10, 10]];
  const adjacent = [[5.1, -3, 0], [0.1, 6, 10]];
  assert.equal(fixture([mass, adjacent], ground).result.findings.length, 1);
  const floating = [[0, -2, 0], [10, 4, 10]];
  const f = fixture([mass, floating], ground).result.findings.find((x) => x.p.maxY === 10);
  assert.ok(f, "contact with a foundation that floats at the same sample is not grounding");
});

test("footprint support: AABB contact cannot hide a completely floating mass", () => {
  const { result, prims, buf } = fixture([[[0, 8, 0], [10, 10, 10]], [[5.1, 1.5, 0], [0.1, 3, 10]]], () => 0);
  const legacy = GA.analyse({ Tracks: { terrainY: () => 0 } },
    { meshes: { props: { __cap: { pos: buf.pos } } } }, prims, { coplanar: false });
  assert.equal(legacy.counts.unsupported, 0, "nearby touching bounds fool the existing graph");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].supportedSamples, 0);
  assert.equal(result.findings[0].unsupportedSamples, 9);
});

test("partial footprint: a rotated neighbour's AABB is not a foundation", () => {
  const c = Math.SQRT1_2, basis = [[c, 0, c], [0, 1, 0], [-c, 0, c]];
  const { result } = fixture([[[0, 5, 0], [10, 10, 10]], [[0, -3, 0], [12, 6, 2], basis]],
    (x, z) => x < -4 && z < -4 ? 0 : -6);
  const f = result.findings.find((x) => x.p.maxY === 10);
  assert.ok(f, "a rotated thin support leaves large corners open inside its bounds");
  assert.equal(f.samples[1].support === "primitive" && f.samples[2].support === "primitive", false);
});

test("partial footprint: roof skins, bridge decks and thin cantilever arms stay out of scope", () => {
  const c = Math.cos(0.4), s = Math.sin(0.4), basis = [[c, s, 0], [-s, c, 0], [0, 0, 1]];
  const { result } = fixture([[[0, 8, 0], [15, 0.5, 12]], [[0, 3, 0], [20, 0.5, 5], basis]], () => 0);
  assert.equal(result.candidates, 0, "use actual box thickness, not a tilted deck's AABB height");
  assert.equal(result.findings.length, 0);
});

test("partial footprint: missing terrain is explicitly unjudged", () => {
  const { result } = fixture([[[0, 5, 0], [10, 10, 10]]], () => null);
  assert.equal(result.unknownSamples, 9);
  assert.equal(result.findings.length, 0);
  assert.equal(fixture([[[0, 5, 0], [10, 10, 10]]], () => 0).result.unknownSamples, 0);
});

test("partial footprint: the ground audit includes actual road and water surfaces", () => {
  for (const surface of ["road", "water"]) {
    const { prims, buf } = fixture([[[0, 5, 0], [10, 10, 10]]], () => null);
    const track = { meshes: { props: { __cap: { pos: buf.pos } },
      [surface]: { __cap: { pos: [-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10], idx: [0, 1, 2, 0, 2, 3] } } } };
    const result = GA.analyse({ Tracks: { terrainY: () => -8 } }, track, prims, { coplanar: false });
    assert.equal(result.partial.candidates, 1);
    assert.equal(result.partial.unknownSamples, 0);
    assert.equal(result.partial.findings.length, 0, `${surface} supports the entire base`);
  }
});

test("partial footprint: an overhead road or water surface cannot ground a floating mass", () => {
  const mass = [[0, 12, 0], [4, 4, 4]]; // base 10 m, wholly below the upper deck
  const surface = (heights) => ({ __cap: {
    pos: heights.flatMap((y) => [-20, y, -20, 20, y, -20, 20, y, 20, -20, y, 20]),
    idx: heights.flatMap((_y, i) => [0, 1, 2, 0, 2, 3].map((v) => v + i * 4)),
  } });
  const audit = (boxes, terrain, mesh = "road", heights = [30]) => {
    const { prims, buf } = fixture(boxes, () => terrain);
    const track = { meshes: { props: { __cap: buf }, [mesh]: surface(heights) } };
    return GA.analyse({ Tracks: { terrainY: () => terrain } }, track, prims, { coplanar: false });
  };
  for (const mesh of ["road", "water"]) {
    const floating = audit([mass], 0, mesh);
    assert.equal(floating.partial.findings.length, 1);
    assert.equal(floating.partial.unknownSamples, 0);
    assert.ok(floating.partial.findings[0].samples.every((s) => s.gap === 10 && s.support === "none"));
    assert.equal(audit([mass], 0, mesh, [10]).partial.findings.length, 0, `${mesh} at the base supplies support`);
    assert.equal(audit([mass], 0, mesh, [10, 30]).partial.findings.length, 0);
    assert.equal(audit([mass], 0, mesh, [10 + FP.CONTACT / 2]).partial.findings.length, 0, "contact slack remains accepted");
    assert.equal(audit([mass], 0, mesh, [10 + FP.CONTACT + .001]).partial.findings.length, 1, "surface beyond contact slack cannot certify support");
  }
  const buried = audit([mass], 20);
  assert.equal(buried.partial.findings.length, 0, "solid terrain still supports a buried base");
  const plinth = [[0, 5, 0], [6, 10, 6]];
  assert.equal(audit([mass, plinth], 0).partial.findings.length, 0, "real grounded plinth supports the mass below an upper deck");
  const detachedPlinth = [[0, 8, 0], [6, 4, 6]];
  const detached = audit([mass, detachedPlinth], 0);
  assert.ok(detached.partial.findings.some((f) => f.p.maxY === 14), "recursive foundation checks must also exclude overhead decks");
  const unknown = audit([mass], null);
  assert.equal(unknown.partial.unknownSamples, 9, "upper decks do not convert missing terrain into known support");
});

test("partial footprint: captured Monaco city slab reports the missed nine-metre corner", () => {
  const env = buildContext(), track = env.Tracks.build(env.Tracks.LIST.find((d) => d.id === "monaco"), {});
  const anchor = [-276.47003, 20.53050, 488.56760];
  const basis = [[-0.4946993, 0, -0.8690642], [-0.1001116, 0.993343, 0.0569867], [-0.8632788, -0.1151947, 0.4914061]];
  const h = 23.634680339950137, centre = anchor.map((x, k) => x + basis[1][k] * h / 2);
  const { result } = fixture([[centre, [17.146675212468836, h, 14.524461868657454], basis]],
    (x, z) => env.Tracks.terrainY(track, x, z));
  assert.equal(result.findings.length, 1);
  const f = result.findings[0];
  assert.ok(f.maxGap > 9 && f.maxGap < 10, `captured corner gap: ${f.maxGap}`);
  assert.ok(f.samples.some((s) => s.support === "ground"), "uphill corner touches terrain");
  const report = FP.diagnostic(track, "monaco", f);
  // Monaco's folded road is closer at Mirabeau than at the emitting hairpin
  // node. This is a NEAREST racing node, not the original authored placement.
  assert.equal(report.node, 288);
  assert.equal(report.frac, 288 / track.px.length);
  assert.equal(report.shots.length, 3);
  assert.ok(report.bounds.min.every(Number.isFinite));
  env.trim(0); env.release(track);
});
