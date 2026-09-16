// The LEGENDS contract. The risk here is not a crash — it is a number quietly
// drifting from the record it claims to come from, or a "fact" being tuned
// because someone preferred a different ranking. So: the facts are checked for
// internal consistency, and the ratings are checked to FOLLOW the facts.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

function load(files, extra = {}) {
  const ctx = vm.createContext(Object.assign({ console, Object, Math }, extra));
  for (const f of files) vm.runInContext(fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), ctx, { filename: f });
  return (name) => vm.runInContext(name, ctx);
}
// mat4.js first: legends.js aliases M4.clamp at eval, the same way
// js/data/driver-ratings.js does.
const get = load(["js/core/mat4.js", "js/data/legends.js"]);
const Parts = load(["js/core/mat4.js", "js/car/parts.js"], { Log: { info() {}, warn() {}, error() {} } })("Parts");
const Legends = get("Legends");
const Teams = load(["js/core/mat4.js", "js/data/teams.js"])("Teams");

test("every legend's record is internally consistent", () => {
  for (const l of Legends.LIST) {
    const r = l.record;
    assert.ok(r.starts > 0, `${l.id}: starts`);
    assert.ok(r.wins <= r.podiums, `${l.id}: ${r.wins} wins cannot exceed ${r.podiums} podiums`);
    assert.ok(r.podiums <= r.starts, `${l.id}: podiums cannot exceed starts`);
    assert.ok(r.poles <= r.starts, `${l.id}: poles cannot exceed starts`);
    // A legend has a TITLE or a written reason it belongs without one. Moss is
    // the case this exists for, and the point is that a zero cannot be silent:
    // it has to be argued in the data, where a reader sees it.
    if (r.titles < 1) {
      assert.ok(l.noTitle && l.noTitle.length > 30,
        `${l.id}: no title and no noTitle reason — say why the roster keeps him`);
    }
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

test("no two tributes read as the same car", () => {
  // THE BUG THIS EXISTS FOR, found by RENDERING the eight and looking at them
  // (scratch/renders/legends), not by any assertion: Lauda's 1975 Ferrari and
  // Schumacher's 2004 Ferrari were both simply "a red car", and Prost's
  // Williams and Mansell's Williams were both "a white car with blue". Both
  // pairs passed the per-livery c1-vs-c2 check above, which only looks INSIDE
  // one livery.
  //
  // THE RULE IS ON c1 ALONE, and the first draft of this test got that wrong in
  // a way worth recording: weighting c1 against c2 scored the Lauda/Schumacher
  // pair 2.63 — a comfortable pass — because their SECONDARIES are far apart
  // (white trim against dark). The eye does not average them. It reads the
  // dominant colour and calls it a red car, so the dominant colour is what has
  // to differ, and a deliberate exception is written down rather than smuggled
  // in by a formula that happens to pass.
  const MIN_C1 = 0.18;
  const ALLOWED = {
    // Two white cars, and they are NOT confusable on track: the accents are at
    // opposite ends — Senna's red against Mansell's blue-and-red-5 — which the
    // side-by-side render confirms. Kept explicit so the next white tribute has
    // to make the same argument instead of inheriting the exemption.
    "legend_senna|legend_mansell": "both white; separated by accent (red vs blue), confirmed in the render"
  };
  const livs = Legends.liveries();
  const d = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  for (let i = 0; i < livs.length; i++) {
    for (let j = i + 1; j < livs.length; j++) {
      const key = `${livs[i].id}|${livs[j].id}`;
      const sep = d(livs[i].c1, livs[j].c1);
      if (ALLOWED[key]) {
        // An exemption that is no longer needed is a stale comment pretending
        // to be a decision, so it has to still be doing work.
        assert.ok(sep <= MIN_C1, `${key} is exempt but now separates by ${sep.toFixed(2)} — drop the ALLOWED row`);
        // …and the escape hatch is not a free pass: the SECONDARIES must carry it.
        assert.ok(d(livs[i].c2, livs[j].c2) > 1.0, `${key} leans on its accent, so the accents must be far apart`);
        continue;
      }
      assert.ok(sep > MIN_C1,
        `${livs[i].name} and ${livs[j].name} share a dominant colour (${sep.toFixed(2)}) — ` +
        "they read as the same car. Render them side by side before arguing with this.");
    }
  }
});

// ── PERIOD CAR SHAPES ────────────────────────────────────────────────────────
// The era table names option ids in another file's catalog, so the failure mode
// is a silent one: a typo resolves to the DEFAULT part and the legend quietly
// drives a 2026 car. These check the join, and that the eras stay era-shaped.

const CUSTOM = { id: "custom", custom: true, engine: "Custom" };
const catOf = (id) => Parts.CATALOG.find((c) => c.id === id);

test("every legend names an era, and every era is in the table", () => {
  for (const l of Legends.LIST) {
    assert.ok(l.era, `${l.id}: no era`);
    assert.ok(Legends.PERIOD[l.era], `${l.id}: era "${l.era}" is not in PERIOD`);
    assert.ok(Legends.parts(l.id), `${l.id}: parts() returned nothing`);
  }
  const used = new Set(Legends.LIST.map((l) => l.era));
  for (const era of Object.keys(Legends.PERIOD)) {
    assert.ok(used.has(era), `PERIOD.${era} is dead — no legend uses it`);
  }
});

test("every era covers every category with an option that exists", () => {
  for (const [era, setup] of Object.entries(Legends.PERIOD)) {
    for (const cat of Parts.CATALOG) {
      const want = setup[cat.id];
      assert.ok(want, `${era}: no ${cat.id} — it would fall back to the 2026 default`);
      assert.ok(cat.options.some((o) => o.id === want),
        `${era}: ${cat.id} "${want}" is not in the catalog`);
    }
    for (const k of Object.keys(setup)) {
      assert.ok(catOf(k), `${era}: "${k}" is not a parts category`);
    }
  }
});

test("every era fits the garage budget — parts.custom IS the player's sheet", () => {
  for (const [era, setup] of Object.entries(Legends.PERIOD)) {
    const cost = Parts.getCost(setup, CUSTOM);
    assert.ok(cost <= Parts.BUDGET,
      `${era}: ${cost} cr over the ${Parts.BUDGET} budget — the garage would refuse every new fit`);
  }
});

test("the eras are actually different cars, and the wingless ones stay wingless", () => {
  const order = Object.keys(Legends.PERIOD);
  const lvl = (e) => Parts.resolveSetup(Legends.PERIOD[e], CUSTOM).visual.aero.lvl;
  // NOT monotonic, and deliberately so: the 1994 rule cut and the 1998 narrow
  // track really did take wing off the cars (active92 3.25 > narrow98 3). The
  // claim that holds is the one that dates a car — wings arrived in 1968.
  for (const e of order) {
    const pre = Legends.ERA_YEAR[e] < 1968;
    assert.equal(lvl(e) === 0, pre,
      `${e} (${Legends.ERA_YEAR[e]}) has ${lvl(e)} wing — wings arrived in 1968`);
  }
  assert.deepEqual(Object.keys(Legends.ERA_YEAR).sort(), order.slice().sort(),
    "ERA_YEAR and PERIOD name different eras");
  const years = order.map((e) => Legends.ERA_YEAR[e]);
  assert.deepEqual(years, years.slice().sort((a, b) => a - b), "the table is out of chronological order");
  // Not one shared setup with a paint change. An id-level check only catches an
  // exact duplicate, so measure what a player actually sees: the resolved
  // VISUAL fields, which is what js/car/car3d.js builds geometry from. The
  // closest pair today is front50 vs slim60 — the two cigars — at 16 of 103
  // fields, so 8 is a floor that leaves room to retune without going vacuous.
  const MIN_VISUAL_DIFF = 8;
  const visualOf = (era) => {
    const v = Parts.resolveSetup(Legends.PERIOD[era], CUSTOM).visual;
    const flat = {};
    for (const cat of Object.keys(v)) {
      for (const k of Object.keys(v[cat])) if (k !== "id") flat[`${cat}.${k}`] = JSON.stringify(v[cat][k]);
    }
    return flat;
  };
  const vis = Object.fromEntries(order.map((e) => [e, visualOf(e)]));
  const fields = new Set(order.flatMap((e) => Object.keys(vis[e])));
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      let d = 0;
      for (const k of fields) if (vis[order[i]][k] !== vis[order[j]][k]) d++;
      assert.ok(d >= MIN_VISUAL_DIFF,
        `${order[i]} and ${order[j]} differ in only ${d} of ${fields.size} visual fields — same car, new paint`);
    }
  }
});

test("no legend gets a halo — every one of them raced before 2018", () => {
  for (const l of Legends.LIST) {
    const v = Parts.resolveSetup(Legends.parts(l.id), CUSTOM).visual;
    assert.ok(!v.cockpit.halo, `${l.id} (${l.era}): a halo on a pre-2018 car`);
    // The CAR's year, not the driver's last season: Vettel raced to 2022, but
    // his car here is the 2013 RB9. ERA_YEAR exists for exactly this gap.
    const year = Legends.ERA_YEAR[l.era];
    assert.ok(year < 2018, `${l.id}: ${l.era} is ${year} — the halo claim needs revisiting`);
    assert.ok(year >= +l.years.split("\u2013")[0] && year <= +l.years.split("\u2013")[1],
      `${l.id}: ${l.era} is ${year}, outside his ${l.years} career`);
  }
});

test("parts() hands back a copy, so a caller cannot edit the table", () => {
  const a = Legends.parts("fangio");
  a.aero = "extreme";
  assert.equal(Legends.parts("fangio").aero, "minimal");
  assert.equal(Legends.parts("nobody"), null);
});
