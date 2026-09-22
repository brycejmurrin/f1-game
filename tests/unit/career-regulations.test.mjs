/* career-regulations.test.mjs — the regulation era ruleset, in a VM.
 *
 * The defect this fixes is measured in docs/notes/CAREER-CEILING-FIX-2026-09-22.md:
 * an optimal capped build is finished in 2.6-3.7 seasons and a career is
 * unbounded, so car development has no second act. An era makes the dearest
 * options in three categories illegal for four seasons.
 *
 * THE ONE PROPERTY THAT MATTERS IS SYMMETRY. AI cars resolve from
 * Parts.getFactorySetup() and never develop, so a rule that reached only the
 * player would leave them worse than a grid that lost nothing — a punishment
 * dressed as a reset. The tests below spend most of their effort on that: that
 * a ban moves the AI's factory build, that the factory CACHE cannot serve a
 * pre-era build, and that no category is ever left with nothing legal in it.
 *
 * Run: node --test tests/unit/career-regulations.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = { console, Math, JSON, Object, Array, String, Number, Boolean,
                isFinite, isNaN, Map, Set, WeakMap, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js",
                   "js/car/parts.js", "js/career/regulations.js"])
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  const grab = (n) => vm.runInContext(n, ctx);
  return { Parts: grab("Parts"), Teams: grab("Teams"), Regulations: grab("Regulations") };
}

test("the first era is OPEN, and it lasts the whole first build", () => {
  // The measurement says an optimal build takes 2.6-3.7 seasons. A rule change
  // landing inside that window taxes the part of the mode that already works.
  const { Regulations } = load();
  assert.equal(Regulations.ERAS[0].id, "open");
  assert.equal(Regulations.ERAS[0].cats.length, 0, "the opening era restricts nothing");
  for (let season = 0; season < Regulations.ERA_SEASONS; season++)
    assert.equal(Regulations.eraFor(season).id, "open",
      `season ${season} is still inside the opening era`);
  assert.notEqual(Regulations.eraFor(Regulations.ERA_SEASONS).id, "open",
    "and the first rule change lands the season after it");
  assert.ok(Regulations.ERA_SEASONS >= 4,
    "an era shorter than the first build would interrupt it");
});

test("eras advance on a fixed cadence and wrap", () => {
  const { Regulations } = load();
  const n = Regulations.ERAS.length, k = Regulations.ERA_SEASONS;
  for (let i = 0; i < n * 2; i++)
    assert.equal(Regulations.eraFor(i * k).id, Regulations.ERAS[i % n].id,
      `season ${i * k} sits in era ${i % n}`);
  assert.equal(Regulations.seasonsLeft(0), k, "a fresh career has the full era ahead");
  assert.equal(Regulations.seasonsLeft(k - 1), 1, "and one season left at its end");
});

test("a ban takes the DEAREST options, is derived from the catalog, and never takes a free one", () => {
  const { Parts, Regulations } = load();
  for (const era of Regulations.ERAS) {
    const banned = Regulations.bannedIds(era.id);
    if (!era.cats.length) { assert.equal(banned.size, 0, `${era.id} bans nothing`); continue; }
    assert.equal(banned.size, era.cats.length * Regulations.BAN_TOP,
      `${era.id} takes BAN_TOP from each of its categories`);
    for (const cat of Parts.CATALOG) {
      const hit = cat.options.filter((o) => banned.has(o.id));
      if (!era.cats.includes(cat.id)) {
        assert.equal(hit.length, 0, `${era.id} must not touch ${cat.id}`);
        continue;
      }
      // Every banned option outprices every surviving priced one.
      const kept = cat.options.filter((o) => !banned.has(o.id) && (o.cost || 0) > 0);
      for (const b of hit) for (const k of kept)
        assert.ok((b.cost || 0) >= (k.cost || 0),
          `${era.id}/${cat.id}: ${b.id} (${b.cost}) should outprice kept ${k.id} (${k.cost})`);
      for (const b of hit)
        assert.ok((b.cost || 0) > 0, "a cost-0 option is the fallback and can never be banned");
    }
  }
});

test("NO ERA EVER EMPTIES A CATEGORY — _resolve() always has somewhere to fall", () => {
  const { Parts, Regulations } = load();
  for (const era of Regulations.ERAS) {
    const banned = Regulations.bannedIds(era.id);
    for (const cat of Parts.CATALOG) {
      const legal = cat.options.filter((o) => !banned.has(o.id));
      assert.ok(legal.length > 0, `${era.id} left ${cat.id} with nothing legal`);
      assert.ok(legal.some((o) => o.id === Parts.DEFAULTS[cat.id]),
        `${era.id} must leave ${cat.id}'s DEFAULT legal — it is the fallback`);
    }
  }
});

test("A REGULATION MOVES THE AI's FACTORY BUILD, not just the player's", () => {
  // The symmetry property. If this fails the feature is a punishment.
  const { Parts, Teams, Regulations } = load();
  const era = Regulations.ERAS.find((e) => e.cats.length);
  const teams = Teams.LIST.filter((t) => Teams.isReal(t));
  const before = teams.map((t) => Parts.getCost(Parts.getFactorySetup(t), t));

  Parts.setLegality(Regulations.legalityFor(era.id), era.id);
  const after = teams.map((t) => Parts.getCost(Parts.getFactorySetup(t), t));

  const moved = after.filter((c, i) => c !== before[i]).length;
  assert.ok(moved > 0, "an era that changes no AI car is a tax on the player alone");
  for (let i = 0; i < teams.length; i++)
    assert.ok(after[i] <= before[i], `${teams[i].id}: a ban cannot make a works car dearer`);

  Parts.setLegality(null, "");
  const restored = teams.map((t) => Parts.getCost(Parts.getFactorySetup(t), t));
  assert.deepEqual(restored, before, "and the grid comes back when the era lapses");
});

test("the factory CACHE cannot serve a pre-regulation build", () => {
  // The bug this guards was found by reading: factoryCache was keyed
  // `${id}|${engine}` with no ruleset in it, so every AI would have kept racing
  // its pre-era car while the player obeyed the new rules.
  const { Parts, Teams, Regulations } = load();
  const team = Teams.LIST.find((t) => Teams.isReal(t) && t.id === "mclaren")
    || Teams.LIST.find((t) => Teams.isReal(t));
  const era = Regulations.ERAS.find((e) => e.cats.length);

  const open = Parts.getFactorySetup(team);              // fills the cache
  assert.ok(open, "a factory build resolves before any era");
  Parts.setLegality(Regulations.legalityFor(era.id), era.id);
  const regulated = Parts.getFactorySetup(team);
  const banned = Regulations.bannedIds(era.id);
  for (const cat of era.cats)
    assert.ok(!banned.has(regulated[cat]),
      `${team.id} is still fitting a banned ${cat} — the cache served a stale build`);
  assert.notEqual(Parts.legalityKey(), "", "the ruleset identifies itself to the cache");
  Parts.setLegality(null, "");
  assert.deepEqual(Parts.getFactorySetup(team), open, "and the open build returns");
});

test("a banned option resolves to something legal rather than throwing or sticking", () => {
  const { Parts, Teams, Regulations } = load();
  const team = Teams.LIST.find((t) => Teams.isReal(t));
  const era = Regulations.ERAS.find((e) => e.cats.length);
  const banned = [...Regulations.bannedIds(era.id)];
  const cat = Parts.CATALOG.find((c) => c.options.some((o) => o.id === banned[0]));
  const setup = { [cat.id]: banned[0] };

  Parts.setLegality(Regulations.legalityFor(era.id), era.id);
  const res = Parts.resolveSetup(setup, team);
  assert.ok(res.setup[cat.id], "the category still resolves to something");
  assert.notEqual(res.setup[cat.id], banned[0], "and it is not the banned option");
  assert.ok(Number.isFinite(res.cost), "the build still prices");
  Parts.setLegality(null, "");
});

test("legalityFor returns nothing for an unrestricted era", () => {
  // So the open era installs NO predicate at all rather than a function that
  // always says yes — the difference shows up in Parts.legalityKey(), which is
  // what the factory cache keys on.
  const { Regulations } = load();
  assert.equal(Regulations.legalityFor("open"), null);
  assert.equal(typeof Regulations.legalityFor(
    Regulations.ERAS.find((e) => e.cats.length).id), "function");
});
