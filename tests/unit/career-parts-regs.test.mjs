/* career-parts-regs.test.mjs — batch #5104: career part ownership and team development.
 *
 * #5043 — brakes and suspension both shipped an option with id "sport", and
 *   career.owned is a flat id list, so researching one unlocked the other. Fix:
 *   ownership goes through Parts.ownId (brakes Sport owns as "sport_brakes");
 *   fitted ids, share codes and presets keep the plain id. An old save's bare
 *   "sport" keeps everything it unlocked (SaveMigrate grants the new key too).
 * #5047 — rolloverTeams rounded with Math.round, so +1 stuck while -1 decayed and
 *   the documented ±8 was unreachable (the decay reached +4 but only -3). Now it
 *   rounds half toward zero: ±1 decays to 0 and the reach is ±3 both ways.
 * (#5038, the era ban by stat class, is pinned in career-regulations.test.mjs.)
 *
 * Run: node --test tests/unit/career-parts-regs.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { i18nStub } from "../helpers/i18n-stub.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const stored = new Map();
  const ctx = vm.createContext({ I18n: i18nStub(), Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console, Set, Map, WeakSet, WeakMap, Infinity, Error });
  ctx.window = ctx;
  ctx.GameStore = {
    CAREER_V: 1,
    store: {
      get: (k, d) => (stored.has(k) ? JSON.parse(JSON.stringify(stored.get(k))) : d),
      set: (k, v) => { stored.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    seasonDriverId: (t, i) => t + ":" + i,
    migrateCareer: (c) => c,
  };
  const list = [{ id: "albert_park", name: "albert_park" }, { id: "suzuka", name: "suzuka" }];
  ctx.Tracks = { LIST: list, SEASON: list.slice(), seasonIndex(i) { return this.LIST.indexOf(this.SEASON[i]); } };
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/core/hash32.js", "js/data/teams.js", "js/data/driver-ratings.js",
    "js/physics/consts.js", "js/car/parts.js", "js/career/save-migrate.js", "js/career/regulations.js",
    "js/career/career-planning.js", "js/career/career.js"])
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  ctx.GameStore.CAREER_V = vm.runInContext("SaveMigrate.CAREER_V", ctx);
  return { Career: vm.runInContext("Career", ctx), Parts: vm.runInContext("Parts", ctx), SaveMigrate: vm.runInContext("SaveMigrate", ctx) };
}
const opt = (Parts, cat, id) => Parts.CATALOG.find((c) => c.id === cat).options.find((o) => o.id === id);

test("#5043 every priced option has a catalogue-unique ownership key", () => {
  const { Parts } = load();
  const seen = new Map();
  for (const cat of Parts.CATALOG) for (const o of cat.options) {
    if (!(o.cost > 0)) continue;
    const key = Parts.ownId(o);
    assert.ok(!seen.has(key), `${cat.id}/${o.id} owns as "${key}", already the key of ${seen.get(key)}: researching one unlocks both`);
    seen.set(key, cat.id + "/" + o.id);
  }
  assert.equal(Parts.ownId(opt(Parts, "brakes", "sport")), "sport_brakes");
  assert.equal(Parts.ownId(opt(Parts, "suspension", "sport")), "sport");
  assert.equal(Parts.ownId(opt(Parts, "brakes", "style_brakes_open")), "style_brakes_open", "a STYLE row never inherits its root's key");
});

test("#5043 researching brakes Sport leaves suspension Sport locked, and the reverse", () => {
  for (const [first, other] of [["brakes", "suspension"], ["suspension", "brakes"]]) {
    const { Career, Parts } = load();
    Career.start({ flavour: "driver", teamId: "haas", seed: 3 });
    Career.engage(true);
    Career.freeMoney(true);
    const team = Career.data().team;
    const a = opt(Parts, first, "sport"), b = opt(Parts, other, "sport");
    assert.equal(Parts.isOptionAvailable(a, null, Career.owned(team)), false, `${first} Sport starts locked at Haas`);
    assert.equal(Parts.isOptionAvailable(b, null, Career.owned(team)), false, `${other} Sport starts locked at Haas`);
    assert.equal(Career.research(a), true, `research ${first} Sport`);
    assert.equal(Parts.isOptionAvailable(a, null, Career.owned(team)), true, `${first} Sport is now owned`);
    assert.equal(Parts.isOptionAvailable(b, null, Career.owned(team)), false, `researching ${first} Sport must not unlock ${other} Sport`);
    assert.equal(Career.research(b), true, `${other} Sport is still for sale`);
  }
});

test("#5043 an old save keeps what its bare \"sport\" unlocked; the remap is idempotent", () => {
  const { Parts, SaveMigrate } = load();
  const old = { v: SaveMigrate.CAREER_V, flavour: "driver", team: "haas", owned: ["sport", "stock"], fitted: { brakes: "sport", suspension: "sport" },
    aiParts: { ferrari: { owned: ["sport", "mystery"], fitted: null } } };
  const c = SaveMigrate.migrateCareer(JSON.parse(JSON.stringify(old)));
  const owned = new Set(c.owned);
  assert.ok(owned.has("sport") && owned.has("sport_brakes"), "both Sport rows stay unlocked: " + c.owned.join(","));
  assert.deepEqual({ ...c.fitted }, { brakes: "sport", suspension: "sport" }, "fitted ids are untouched");
  assert.equal(Parts.isOptionAvailable(opt(Parts, "brakes", "sport"), null, owned), true);
  assert.equal(Parts.isOptionAvailable(opt(Parts, "suspension", "sport"), null, owned), true);
  assert.deepEqual([...c.aiParts.ferrari.owned], ["sport", "mystery", "sport_brakes"], "an AI bag only gains the key");
  const again = SaveMigrate.migrateCareer(JSON.parse(JSON.stringify(c)));
  assert.deepEqual([...again.owned], [...c.owned], "a second load changes nothing");
  // The new key survives a reload, and a new save with only the brakes key does not unlock suspension.
  const fresh = SaveMigrate.migrateCareer({ v: SaveMigrate.CAREER_V, flavour: "driver", team: "haas", owned: ["sport_brakes"], fitted: {} });
  assert.deepEqual([...fresh.owned], ["sport_brakes"]);
  assert.equal(Parts.isOptionAvailable(opt(Parts, "suspension", "sport"), null, new Set(fresh.owned)), false);
});

test("#5047 tdevStep rounds symmetrically: +n and -n decay alike", () => {
  const { Career } = load();
  for (let v = -Career.TDEV_MAX; v <= Career.TDEV_MAX; v++)
    for (const shove of [0, 0.5, 1, 1.5, 2])
      assert.equal(Career.tdevStep(-v, -shove), -Career.tdevStep(v, shove) || 0, `tdevStep(${-v}, ${-shove}) mirrors tdevStep(${v}, ${shove})`);
  let up = 1, down = -1;
  for (let i = 0; i < 3; i++) { up = Career.tdevStep(up, 0); down = Career.tdevStep(down, 0); }
  assert.equal(up, 0, "+1 decays to neutral over three on-target winters (it used to stick at +1)");
  assert.equal(down, 0, "-1 decays to neutral");
  assert.equal(Career.tdevStep(3, 0), 1);
  assert.equal(Career.tdevStep(-3, 0), -1, "-3 and +3 halve alike (+3 used to give 2, -3 gave -1)");
  assert.equal(Career.tdevStep(2, 1), 2, "a .0 result is exact");
  assert.equal(Career.tdevStep(-2, -1), -2);
});

test("#5047 the documented ceiling TDEV_REACH is exactly what a winter reaches", () => {
  const { Career } = load();
  for (const sign of [1, -1]) {
    let v = 0;
    for (let i = 0; i < 20; i++) v = Career.tdevStep(v, sign * 99);   // the shove clamps to ±2
    assert.equal(v, sign * Career.TDEV_REACH, `a team that beats (misses) expectation every year settles at ${sign * Career.TDEV_REACH}`);
    let imported = sign * Career.TDEV_MAX;
    for (let i = 0; i < 20; i++) imported = Career.tdevStep(imported, sign * 2);
    // ±4 is also stable under a full shove (4/2 + 2 is exact), so an import parks one above the climb's reach.
    assert.ok(sign * imported >= Career.TDEV_REACH && sign * imported <= Career.TDEV_REACH + 1, `an imported ${sign * Career.TDEV_MAX} decays to ${imported}`);
  }
  assert.ok(Career.TDEV_REACH <= Career.TDEV_MAX, "the clamp is never below the reach");
});
