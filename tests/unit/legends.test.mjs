// The LEGENDS contract. The risk here is not a crash — it is a number quietly
// drifting from the record it claims to come from, or a "fact" being tuned
// because someone preferred a different ranking. So: the facts are checked for
// internal consistency, and the ratings are checked to FOLLOW the facts.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

function load(files) {
  const ctx = vm.createContext({ console, Object });
  for (const f of files) vm.runInContext(fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), ctx, { filename: f });
  return (name) => vm.runInContext(name, ctx);
}
// mat4.js first: legends.js aliases M4.clamp at eval, the same way
// js/data/driver-ratings.js does.
const get = load(["js/core/mat4.js", "js/data/legends.js"]);
const Legends = get("Legends");
const Teams = load(["js/core/mat4.js", "js/data/teams.js"])("Teams");

test("every legend's record is internally consistent", () => {
  for (const l of Legends.LIST) {
    const r = l.record;
    assert.ok(r.starts > 0, `${l.id}: starts`);
    assert.ok(r.wins <= r.podiums, `${l.id}: ${r.wins} wins cannot exceed ${r.podiums} podiums`);
    assert.ok(r.podiums <= r.starts, `${l.id}: podiums cannot exceed starts`);
    assert.ok(r.poles <= r.starts, `${l.id}: poles cannot exceed starts`);
    assert.ok(r.titles >= 1, `${l.id}: a legend without a title needs a different table`);
    assert.ok(l.trait && l.trait.length > 20, `${l.id}: needs a trait line`);
    assert.ok(/^\d{4}–\d{4}$/.test(l.years), `${l.id}: years must read 1991–2012`);
  }
});

test("a legend code never collides with the 2026 grid", () => {
  const grid = new Set(Teams.LIST.flatMap((t) => t.drivers.map((d) => d.code)));
  for (const l of Legends.LIST) {
    assert.ok(!grid.has(l.code), `${l.code} (${l.name}) collides with a current driver's code`);
    assert.match(l.code, /^[A-Z]{3}$/, `${l.code} must be three capitals like the grid's`);
  }
  assert.equal(new Set(Legends.LIST.map((l) => l.code)).size, Legends.LIST.length, "codes must be unique");
  assert.equal(new Set(Legends.LIST.map((l) => l.id)).size, Legends.LIST.length, "ids must be unique");
});

test("ratings stay on the same 0-100 scale the grid uses", () => {
  for (const l of Legends.LIST) {
    const r = Legends.ratings(l.id);
    for (const [axis, v] of Object.entries(r)) {
      assert.ok(Number.isInteger(v), `${l.id}.${axis} must be an integer`);
      assert.ok(v >= 60 && v <= 100, `${l.id}.${axis} = ${v} is off the grid's scale`);
    }
  }
});

test("ratings FOLLOW the record — a better rate can never score lower", () => {
  // The whole point of deriving rather than hand-picking. If someone tunes a
  // favourite up, this fails.
  //
  // Each axis is ranked against ITS OWN definition, not a stricter one. `pace`
  // is documented as a BLEND (mostly pole rate, a little win rate), so ranking
  // it by pole rate alone asserts a contract the formula never made — and it
  // fails on a real pair: Mansell out-qualified Prost per start (.171 vs .166)
  // while Prost won far more (.256 vs .166), which is exactly the case the
  // blend exists to handle.
  const r = (l) => l.record;
  const key = {
    pace:        (l) => 0.34 * (r(l).poles / r(l).starts) + 0.12 * (r(l).wins / r(l).starts),
    craft:       (l) => r(l).wins / r(l).starts,
    consistency: (l) => r(l).podiums / r(l).starts
  };
  for (const [axis, score] of Object.entries(key)) {
    const sorted = [...Legends.LIST].sort((a, b) => score(b) - score(a));
    for (let i = 1; i < sorted.length; i++) {
      const hi = Legends.ratings(sorted[i - 1].id)[axis], lo = Legends.ratings(sorted[i].id)[axis];
      assert.ok(hi >= lo,
        `${sorted[i - 1].code} scores better on ${axis}'s own formula than ${sorted[i].code} but rates lower (${hi} < ${lo})`);
    }
  }
});

test("every legend offers a livery the picker can render", () => {
  const isRgb = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === "number" && v >= 0 && v <= 1);
  const livs = Legends.liveries();
  assert.equal(livs.length, Legends.LIST.length);
  for (const liv of livs) {
    assert.match(liv.id, /^legend_[a-z]+$/, "a legend livery id must be namespaced so it cannot collide");
    assert.ok(liv.name && liv.name.length > 2, `${liv.id}: needs a display name`);
    assert.ok(isRgb(liv.c1) && isRgb(liv.c2), `${liv.id}: c1/c2 must be [r,g,b] in 0..1`);
    for (const k of ["stripe", "accent"]) if (liv[k]) assert.ok(isRgb(liv[k]), `${liv.id}.${k}`);
    // c1 vs c2 must be TELLABLE APART on a race camera — two near-identical
    // colours make the tribute read as a plain single-tone car.
    const d = Math.abs(liv.c1[0] - liv.c2[0]) + Math.abs(liv.c1[1] - liv.c2[1]) + Math.abs(liv.c1[2] - liv.c2[2]);
    assert.ok(d > 0.25, `${liv.id}: c1 and c2 differ by only ${d.toFixed(2)} — indistinguishable at speed`);
  }
});

test("the sources block is present, because these are claims about real people", () => {
  const src = fs.readFileSync(new URL("../../js/data/legends.js", import.meta.url), "utf8");
  assert.match(src, /SOURCES \(fetched/, "the record must say where it came from");
  assert.match(src, /TRIBUTE PALETTE, not a replica/, "the livery claim must stay honest");
});
