/* medal-ledger.test.mjs — #6961 (U4.3 of #6920): MedalLedger.tierFor wraps the real Quali.medalFor.
 * Run: node --test tests/unit/medal-ledger.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const ctx = vm.createContext({});
for (const f of ["js/race/quali-model.js", "js/race/medal-ledger.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
vm.runInContext("globalThis.Quali = Quali; globalThis.MedalLedger = MedalLedger;", ctx);
const { Quali, MedalLedger: ML } = ctx;

test("truth table at pole=100", () => {
  const row = [[99.99, "gold"], [100, "gold"], [100.01, "silver"], [102, "silver"], [103, "silver"],
    [103.01, "bronze"], [107, "bronze"], [107.01, null], [0, null], [NaN, null], [-5, null], [undefined, null]];
  for (const [t, m] of row) assert.equal(ML.tierFor("tt", t, { pole: 100 }), m, String(t));
  assert.equal(ML.tierFor("tt", 102, { pole: 100 }), Quali.medalFor(102, 100));
  for (const p of [0, undefined, NaN, -1]) assert.equal(ML.tierFor("tt", 100, { pole: p }), null);
  assert.equal(ML.tierFor("tt", 100), null);
});

test("matches Quali.medalFor across a sweep (daily too)", () => {
  for (let t = 90; t <= 115; t += 0.137) for (const kind of ["tt", "daily"])
    assert.equal(ML.tierFor(kind, t, { pole: 100 }), Quali.medalFor(t, 100));
  assert.equal(ML.tierFor("daily", undefined, { pole: 100 }), null);
});

test("drill is reserved", () => assert.equal(ML.tierFor("drill", 50, { pole: 100 }), null));

test("better keeps the held medal on ties and when it ranks higher", () => {
  const R = Quali.MEDAL_RANK;
  const old = (held, fresh) => ((R[held] || 0) > (R[fresh] || 0) ? held : fresh);   // session-records.js finish()
  const all = [null, undefined, "bronze", "silver", "gold"];
  for (const h of all) for (const f of all) assert.equal(ML.better(h, f), old(h, f), `${h}/${f}`);
  assert.equal(ML.better("gold", "apex"), "apex");
  assert.equal(ML.better("apex", "gold"), "apex");
  assert.ok(ML.rank("apex") > ML.rank("gold") && ML.rank(null) === 0 && ML.rank(undefined) === 0);
});

test("fourth tier: only with target, unassisted, target <= pole", () => {
  const t = (v, refs) => ML.tierFor("tt", v, refs);
  assert.equal(t(97, { pole: 100, target: 98 }), "apex");
  assert.equal(t(98, { pole: 100, target: 98 }), "apex");
  assert.equal(t(98.01, { pole: 100, target: 98 }), "gold");
  assert.equal(t(97, { pole: 100 }), "gold");
  assert.equal(t(97, { pole: 100, target: 98, assisted: true }), "gold");
  assert.equal(t(97, { pole: 100, target: 101 }), "gold");
  assert.equal(t(97, { pole: 100, target: 0 }), "gold");
  assert.equal(t(97, { pole: 100, target: NaN }), "gold");
  for (const v of [99.99, 100, 102, 105, 108]) assert.equal(t(v, { pole: 100, target: 90, assisted: true }), t(v, { pole: 100 }));
  for (const k of [0.8, 1.25]) for (const v of [90, 97, 98, 99.5, 102, 106, 120])
    assert.equal(t(v * k, { pole: 100 * k, target: 98 * k }), t(v, { pole: 100, target: 98 }), `${k}/${v}`);
});

test("exports are frozen", () => { assert.ok(Object.isFrozen(ML)); assert.deepEqual([...ML.TIERS].slice(0, 3), ["bronze", "silver", "gold"]); });
