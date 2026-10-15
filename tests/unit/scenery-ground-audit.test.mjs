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
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");
const MANIFEST = require("../../tools/manifest.cjs");

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
