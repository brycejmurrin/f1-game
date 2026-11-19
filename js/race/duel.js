var Duel = (function () {
  "use strict";

  const BUMP = { pace: 4, craft: 10, awareness: 0, consistency: 8, experience: 8 };

  const LEGEND_BUMP = { pace: 3, craft: 12, awareness: 0, consistency: 10, experience: 10 };

  const LEGEND_CAR = 1.08;

  function up(v, d) { return Math.min(100, (v || 75) + (d || 0)) / 100; }

  function bump(c, DriverRatings) {
    const r = DriverRatings.get(c.code, c.tier, BUMP);
    c.skill = DriverRatings.skill(r, 0.5);
    c.craft = (r.craft || 75) / 100; c.awareness = (r.awareness || 75) / 100;
    c.experience = (r.experience || 75) / 100; c.consistency = (r.consistency || 75) / 100;
    c.duelRival = true;
    return c;
  }

  function pick(cars) {
    return cars.filter((c) => !c.isPlayer).sort((a, b) => b.skill - a.skill)[0] || null;
  }

  function asLegend(c, legend, DriverRatings) {
    if (!c || !legend) return c;
    const r = legend.ratings || null;
    if (!r) return bump(c, DriverRatings);
    c.craft = up(r.craft, LEGEND_BUMP.craft); c.awareness = up(r.awareness, LEGEND_BUMP.awareness);
    c.experience = up(r.experience, LEGEND_BUMP.experience); c.consistency = up(r.consistency, LEGEND_BUMP.consistency);
    c.skill = DriverRatings.skill(Object.assign({}, r, { pace: Math.min(100, r.pace + LEGEND_BUMP.pace) }), 0.5);
    if (c.tierV) c.tierV *= LEGEND_CAR;
    c.name = legend.name; c.code = legend.code;
    if (legend.team) {
      c.team = legend.team;
      c.color = legend.team.color;
      if (legend.team.drivers[0].num != null) c.num = legend.team.drivers[0].num;
    }
    c.duelRival = true; c.legendId = legend.id;
    return c;
  }

  return { BUMP, LEGEND_BUMP, LEGEND_CAR, bump, pick, asLegend };
})();
Object.freeze(Duel);
