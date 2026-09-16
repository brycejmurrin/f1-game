/* Apex 26 — DUEL: a practice race against ONE rival with his rating lifted.
 *
 * A format, not a mode: it runs the ordinary race loop and only changes who is
 * on the grid and how good he is. That is why it lives beside the other race
 * concerns rather than in game.js — the entry file decides WHEN to apply it,
 * this file owns WHAT it means.
 *
 * The trim is the same one Quali and Time Trial already do to `cars` after
 * makeCars(), so nothing downstream needs a field-size case: grid order,
 * classification and the results sheet all read cars.length.
 */
const Duel = (function () {
  "use strict";

  // NOT A SPEED MULTIPLIER. Bumping pace alone makes a rival that drives like a
  // rookie and simply arrives faster — the tell players catch first. Pace is the
  // SMALLEST lift of the five for the same reason DIFF.hard stops at 1.030
  // (js/physics/consts.js): a same-spec car out-dragging the player down a
  // straight reads as a cheat, so the straight stays the player's.
  //
  // The difficulty lives in craft and awareness, which is what makes the rival
  // defend, commit to a move and stop making mistakes under pressure
  // (js/physics/ai-drive.js reads all four racecraft axes).
  //
  // Axes clamp at 100 inside DriverRatings.get, so a top-rated driver takes less
  // of this than a midfielder — the duel is hardest in a slower car, which is
  // the right way round for a benchmark.
  const BUMP = { pace: 4, craft: 10, awareness: 10, consistency: 8, experience: 8 };

  // Re-derive the five axes with the bump applied, through the SAME deltas
  // argument Career.devFor() already uses for driver development — so the lift
  // reaches the driving loop by the path that exists, and no AI car grows a
  // second stat source. `skill` feeds `c.tierV * c.skill * dd.ai` (top speed);
  // the four racecraft axes feed js/physics/ai-drive.js.
  function bump(c, DriverRatings) {
    const r = DriverRatings.get(c.code, c.tier, BUMP);
    // Mid-roll, not a fresh draw: a benchmark should be the same opponent every
    // time you restart, and it keeps the sim's RNG stream position untouched —
    // the contract reliability.js and career.spec.js depend on.
    c.skill = DriverRatings.skill(r, 0.5);
    c.craft = (r.craft || 75) / 100; c.awareness = (r.awareness || 75) / 100;
    c.experience = (r.experience || 75) / 100; c.consistency = (r.consistency || 75) / 100;
    c.duelRival = true;
    return c;
  }

  // The field's quickest driver, so the benchmark is the best the grid has
  // before the bump rather than a synthetic entry — it keeps a real team,
  // livery and driver code. Returns null when there is nobody to race.
  function pick(cars) {
    return cars.filter((c) => !c.isPlayer).sort((a, b) => b.skill - a.skill)[0] || null;
  }

  /* RACE AGAINST A LEGEND. bump() lifts whoever is fastest on the grid; this
   * REPLACES the rival's driver instead — his name, his code and his five axes
   * taken straight from js/data/legends.js, which are absolute rather than a
   * tier-relative draw, so no BUMP is applied on top. Fangio arrives at his own
   * numbers, not at a midfielder's plus ten.
   *
   * The rival keeps his CAR. Swapping the team object would change the id every
   * decal atlas and mesh cache is keyed by (js/car/liverytex.js), so a legend
   * rival races in the machinery he was given, with his name on the timing
   * screen. Giving him his own livery is a caching change, not a data one, and
   * is deliberately not smuggled in here. */
  function asLegend(c, legend, DriverRatings) {
    if (!c || !legend) return c;
    const r = legend.ratings || null;
    if (!r) return bump(c, DriverRatings);      // unknown legend: the ordinary duel
    c.skill = DriverRatings.skill(r, 0.5);      // mid-roll, same as bump()
    c.craft = (r.craft || 75) / 100; c.awareness = (r.awareness || 75) / 100;
    c.experience = (r.experience || 75) / 100; c.consistency = (r.consistency || 75) / 100;
    c.name = legend.name; c.code = legend.code;
    c.duelRival = true; c.legendId = legend.id;
    return c;
  }

  return { BUMP, bump, pick, asLegend };
})();
Object.freeze(Duel);
