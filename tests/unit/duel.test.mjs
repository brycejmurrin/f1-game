// The DUEL contract. Two behaviours worth pinning, both of which a refactor
// could break without a crash: bump() must lift the rival's RACECRAFT more than
// his pace (a rival that is only faster reads as a cheat), and asLegend() must
// hand over the legend's OWN ratings rather than bumping whoever was there.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

function load(files) {
  const ctx = vm.createContext({ console, Object, Math });
  for (const f of files) vm.runInContext(fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), ctx, { filename: f });
  return (name) => vm.runInContext(name, ctx);
}
const get = load(["js/core/mat4.js", "js/data/legends.js", "js/race/duel.js"]);
const Duel = get("Duel");
const Legends = get("Legends");

// The smallest DriverRatings that exercises both paths: get() applies the
// deltas the way the real one does, skill() collapses the five axes the way the
// real one does. A stub, so the test measures duel.js and not driver-ratings.js.
const DR = {
  get: (code, tier, d) => {
    const base = { pace: 80, craft: 80, awareness: 80, consistency: 80, experience: 80 };
    for (const k of Object.keys(base)) base[k] = Math.min(100, base[k] + ((d && d[k]) || 0));
    return base;
  },
  skill: (r, roll) => (r.pace + r.craft) / 200 + roll * 0,
};

const car = () => ({ isPlayer: false, code: "XXX", name: "Test Driver", tier: 2, skill: 0.5 });

test("pick() takes the fastest non-player car", () => {
  const cars = [{ isPlayer: true, skill: 9 }, { isPlayer: false, skill: 0.4 }, { isPlayer: false, skill: 0.8 }];
  assert.equal(Duel.pick(cars).skill, 0.8);
  assert.equal(Duel.pick([{ isPlayer: true, skill: 9 }]), null);
});

test("the bump lifts racecraft harder than pace, and leaves awareness alone", () => {
  const B = Duel.BUMP;
  // Pace is the SMALLEST lift that happens: a same-spec car out-dragging the
  // player down a straight reads as a cheat, so the difficulty lives in craft.
  assert.ok(B.craft > B.pace, `craft ${B.craft} must outweigh pace ${B.pace}`);
  assert.ok(B.consistency > B.pace && B.experience > B.pace, "…and so must the other two");
  // AWARENESS STAYS 0, and this assertion exists because an earlier version of
  // this test demanded the opposite. In js/physics/ai-drive.js awareness is the
  // CAUTION axis and runs the wrong way for a benchmark:
  //     letPassDelay = lerp(4.2, 1.8, awareness)  — higher concedes SOONER
  //     awareMul     = lerp(1.25, 0.7, awareness) — higher attacks LESS
  // so +10 bought a rival that yields quicker and overtakes less. Lowering it
  // instead would cost the rival its box-exit and launch reaction, which is a
  // worse car rather than a harder one. Zero is the considered answer.
  assert.equal(B.awareness, 0, "bumping awareness makes the rival concede sooner, not drive better");
  const c = Duel.bump(car(), DR);
  assert.equal(c.duelRival, true);
  assert.ok(c.craft > 0.8, "the lifted racecraft axis reaches the car as 0..1");
  assert.equal(c.awareness, 0.8, "…and the untouched one arrives at the base, undisturbed");
  assert.equal(c.code, "XXX", "an ordinary duel keeps the rival's identity");
});

test("asLegend replaces the driver with the legend's own ratings — no bump on top", () => {
  const r = Legends.ratings("fangio");
  // Compare against a SNAPSHOT, not against the object asLegend was handed: an
  // implementation that bumped the ratings in place would otherwise be measured
  // against its own mutation and pass. (Both mutants of that shape survived an
  // earlier version of this test.)
  const want = Object.assign({}, r);
  const c = Duel.asLegend(car(), { id: "fangio", name: "Juan Manuel Fangio", code: "FAN", ratings: r }, DR);
  assert.equal(c.name, "Juan Manuel Fangio");
  assert.equal(c.code, "FAN");
  assert.equal(c.legendId, "fangio");
  assert.equal(c.duelRival, true);
  // The legend's numbers arrive INTACT: /100, not bumped and then divided.
  assert.equal(c.craft, want.craft / 100);
  assert.equal(c.awareness, want.awareness / 100);
  assert.equal(c.consistency, want.consistency / 100);
  assert.equal(c.experience, want.experience / 100);
  assert.equal(c.skill, DR.skill(want, 0.5), "skill comes from the legend's axes, not a tier draw");
});

test("asLegend degrades to the ordinary duel when the legend has no ratings", () => {
  const c = Duel.asLegend(car(), { id: "ghost", name: "Nobody" }, DR);
  assert.equal(c.code, "XXX", "an unknown legend must not rename the rival");
  assert.equal(c.duelRival, true);
  assert.equal(Duel.asLegend(null, { id: "x" }, DR), null);
});

test("every legend in the roster is duel-ready", () => {
  for (const l of Legends.LIST) {
    const c = Duel.asLegend(car(), { id: l.id, name: l.name, code: l.code, ratings: Legends.ratings(l.id) }, DR);
    assert.equal(c.code, l.code, `${l.id}: ratings() must resolve for every roster entry`);
    for (const k of ["craft", "awareness", "consistency", "experience"]) {
      assert.ok(c[k] > 0 && c[k] <= 1, `${l.id}: ${k} = ${c[k]} is outside 0..1`);
    }
  }
});

/* THE RIVAL RACES THE LEGEND'S CAR, not the grid slot's. This shipped broken:
   asLegend swapped the name and the five axes and stopped there, so a duel
   against Schumacher was a 2026 Red Bull with MSC on the timing screen. */
test("asLegend hands the rival the legend's own team, paint and number", () => {
  const t = Legends.raceTeam("schumacher");
  const c = Duel.asLegend(car(), { id: "schumacher", code: "MSC", name: "Michael Schumacher",
                                   ratings: Legends.ratings("schumacher"), team: t }, DR);
  assert.equal(c.team, t, "the rival flies the legend's team object");
  assert.equal(c.color, t.color, "…and the timing screen / minimap colour follows the paint");
  assert.equal(c.num, t.drivers[0].num);
  // NO TEAM, NO SWAP: a caller that omits it still gets the ratings-only duel,
  // which is what keeps js/race/duel.js ignorant of the legend table.
  const bare = Duel.asLegend(car(), { id: "senna", code: "SEN", name: "A", ratings: Legends.ratings("senna") }, DR);
  assert.equal(bare.team, undefined, "no team handed over means the grid slot's car is kept");
});

/* ONE KEY PER LEGEND. car-draw.js caches the decal atlas and every mesh under
   team.id, and the PLAYER may be in the legends slot at the same time — two
   cars keyed "legends" would share one atlas and read the player's stored
   `livery.legends` for the rival's paint. */
test("a duel rival's team id is unique per legend and never the player's slot", () => {
  const ids = Legends.LIST.map((l) => Legends.raceTeam(l.id).id);
  assert.equal(new Set(ids).size, ids.length, "every legend needs its own cache key");
  assert.ok(!ids.includes(Legends.team("schumacher").id), "…and none may collide with the player's legends slot");
  assert.equal(Legends.raceTeam("nobody"), null);
});

/* The era's SILHOUETTE. An AI car has no garage sheet, so its shape comes from
   Parts.getFactorySetup(team) — which knows nothing of a runtime-minted id and
   would hand Fangio a 2026 chassis. raceTeam carries the period setup instead. */
test("every legend's duel car carries his period setup and his own paint", () => {
  for (const l of Legends.LIST) {
    const t = Legends.raceTeam(l.id);
    // parts(), not PERIOD — a legend may override the era with what made HIS
    // car itself (Fangio's torsion bars, Moss's discs), and the rival must
    // race that, not the decade's generic machine.
    assert.deepEqual(t.factory, Legends.parts(l.id), `${l.id}: his own car's setup rides on the team`);
    assert.deepEqual(t.color, l.livery.c1, `${l.id}: paints in his tribute colours`);
    assert.equal(t.drivers.length, 1, `${l.id}: a rival is already cast — one seat, not twelve`);
    assert.equal(t.drivers[0].code, l.code);
  }
});
