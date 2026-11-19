var Reliability = (function () {
  "use strict";

  const LEVELS = { off: 0, low: 0.5, real: 1 };

  const TIER_RISK = [0.04, 0.055, 0.075, 0.10, 0.12];

  const REASONS = ["engine", "engine", "gearbox", "gearbox", "accident"];

  const AT_LO = 0.06, AT_HI = 0.94;

  const DEV_RELIEF = 0.40;

  const BUILD_RELIEF = 0.33;
  const BUILD_CATS = ["engine", "gearbox"];

  const clamp = M4.clamp;

  function draw(seed, ...parts) { return Career.hash(seed, ...parts); }

  function retirementRisk(input) {
    if (!input.scale) return 0;
    const tier = clamp(input.tier | 0, 0, TIER_RISK.length - 1);
    const development = input.developmentSpan
      ? clamp((input.pace - 1) / input.developmentSpan, -1, 1) : 0;
    let risk = TIER_RISK[tier] * (1 - DEV_RELIEF * development);
    if (input.isPlayer && input.build > 0 && !input.networked)
      risk *= 1 - BUILD_RELIEF * clamp(input.build, 0, 1);
    return clamp(risk * input.scale, 0, 1);
  }

  function retirementPlan(atSample, reasonSample) {
    return {
      at: AT_LO + atSample * (AT_HI - AT_LO),
      why: REASONS[Math.min(REASONS.length - 1, Math.floor(reasonSample * REASONS.length))],
    };
  }

  function qualityFor(costs) {
    let sum = 0;
    for (const [cost, top] of costs) sum += clamp(cost / top, 0, 1);
    return costs.length ? sum / costs.length : 0;
  }

  function buildQuality(setup, team) {
    if (!setup) return 0;
    const resolved = Parts.resolveSetup(setup, team);
    const costs = [];
    for (const cat of Parts.CATALOG) {
      if (BUILD_CATS.indexOf(cat.id) < 0) continue;
      const top = cat.options.reduce((m, o) => Math.max(m, o.cost || 0), 0);
      const opt = resolved.options[cat.id];
      if (!top || !opt) continue;
      costs.push([opt.cost || 0, top]);
    }
    return qualityFor(costs);
  }

  function arm(cars, opts = {}) {
    const scale = LEVELS[opts.level] || 0;
    const seed = opts.seed >>> 0, round = opts.round | 0;
    Log.info("game", "Reliability.arm scale=" + scale + " n=" + (cars && cars.length));
    let planned = 0;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      c.retired = false; c.dnf = null; c.dnfAt = null; c.dnfWhy = null;
      if (!scale) continue;
      const who = c.driverId || c.code || ("i" + i);
      const failureSample = draw(seed, "dnf", round, who);
      const developmentSpan = Career.TDEV_MAX * Career.TDEV_TO_PACE;
      const risk = retirementRisk({
        tier: c.tier, pace: developmentSpan ? Career.paceMult(c.team && c.team.id) : 1,
        developmentSpan, scale, isPlayer: c.isPlayer, build: opts.build, networked: opts.networked,
      });
      if (failureSample >= risk) continue;
      const retirement = retirementPlan(draw(seed, "dnfAt", round, who), draw(seed, "dnfWhy", round, who));
      c.dnfAt = retirement.at;
      c.dnfWhy = retirement.why;
      planned++;
      Log.info("game", "Reliability DNF plan " + who + " why=" + c.dnfWhy);
    }
    if (planned) Log.info("game", "Reliability.arm planned=" + planned);
    return cars;
  }

  function plan(cars) {
    const out = [];
    (cars || []).forEach((c, i) => {
      if (!c.retired && c.dnfAt == null) return;
      out.push({ idx: i, code: c.code, retired: !!c.retired,
                 why: c.dnf || c.dnfWhy || null,
                 at: c.dnfAt != null ? +c.dnfAt.toFixed(4) : null });
    });
    return out;
  }

  const isLevel = (v) => Object.prototype.hasOwnProperty.call(LEVELS, v);

  return { TIER_RISK, REASONS, arm, plan, buildQuality, isLevel };
})();
Object.freeze(Reliability);
