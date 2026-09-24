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
// `--all --gate` is the full check (~3 s a circuit). This file samples SAMPLE
// so it stays well under a minute, with the same semantics as the fleet gates:
// a count over its cap fails, and a cap above the measured count fails as
// slack (lower it with --update) — the slack silently permits a regression.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const GA = require("../../tools/track/ground-audit.cjs");
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");
const MANIFEST = require("../../tools/manifest.cjs");

// Chosen to carry non-zero counts on every check, so a blind audit cannot pass:
// monaco (harbour, hillside city), monza (bowl, banking), spa (forest).
const SAMPLE = ["monaco", "monza", "spa"];

const base = GA.readBaseline();
let cached = null;
const measure = () => {
  if (cached) return cached;
  const env = buildContext();
  return (cached = SAMPLE.map((id) => GA.run(env, id)));
};

test("baseline names every check and only real circuits", () => {
  const roster = new Set(MANIFEST.CIRCUITS);
  for (const c of GA.CHECKS) {
    assert.equal(typeof base[c], "object", `baseline lacks the "${c}" table`);
    for (const [id, n] of Object.entries(base[c])) {
      assert.ok(roster.has(id), `${c}: unknown circuit "${id}"`);
      assert.ok(Number.isInteger(n) && n > 0, `${c}.${id}: caps are positive integers (absent = 0)`);
    }
  }
});

test("sampled circuits stay within the scenery-audit baseline", () => {
  const over = GA.overBaseline(measure(), base);
  assert.deepEqual(over, [], "scenery audits grew — `node tools/track/ground-audit.cjs <id> --why` " +
    "names the source line:\n  " + over.join("\n  "));
});

test("no stale cap on the sampled circuits — a cap above the measured count is a lie", () => {
  const slack = [];
  for (const r of measure())
    for (const c of GA.CHECKS) {
      const cap = (base[c] || {})[r.id] || 0;
      if (r.counts[c] < cap) slack.push(`${r.id} ${c}: baseline ${cap} but measured ${r.counts[c]}`);
    }
  assert.deepEqual(slack, [], "lower with `node tools/track/ground-audit.cjs --all --update`:\n  " + slack.join("\n  "));
});

test("anti-vacuity: every check finds something on the sample", () => {
  const r = measure();
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
