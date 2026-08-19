/* Apex 26 — RELIABILITY: whether a car reaches the flag at all. Every car used to finish every race, which makes a championship — and a career above all — a pure … */
const Reliability = (function () {
  "use strict";

// What the RELIABILITY race setting means, as a scale on every risk below. OFF is
// the shipped default: an existing save must not start losing cars because the
// game was updated.
const LEVELS = { off: 0, low: 0.5, real: 1 };

const TIER_RISK = [0.04, 0.055, 0.075, 0.10, 0.12];

const REASONS = ["engine", "engine", "gearbox", "gearbox", "accident"];

// Where in the race a failure can land, as a fraction of the full distance. Not
// [0,1]: a car that retires on the formation lap never raced, and one that
// retires within sight of the flag reads as the game cheating you.
const AT_LO = 0.06, AT_HI = 0.94;

// How much of the base risk full team development buys back. ±TDEV_MAX is a
// whole season or two of climbing, so it is worth a real slice — but never all of
// it, or a developed team becomes immortal and the mechanic stops existing.
const DEV_RELIEF = 0.40;

const BUILD_RELIEF = 0.33;
const BUILD_CATS = ["engine", "gearbox"];

const clamp = M4.clamp;                       // shared scalar helper (js/mat4.js)

function draw(seed, ...parts) { return Career.hash(seed, ...parts); }

function devNorm(teamId) {
  const span = Career.TDEV_MAX * Career.TDEV_TO_PACE;
  return span ? clamp((Career.paceMult(teamId) - 1) / span, -1, 1) : 0;
}

// How developed a fitted build's power unit and gearbox are, 0..1, as a fraction
// of the dearest option in each category. Cost is the right proxy: it is what the
// career economy charges to research the part, and SIGNATURE options are
// cost-identical clones of what they replace, so a team's own mesh never scores
// differently from the universal part it stands in for.
function buildQuality(setup, team) {
  if (!setup) return 0;
  const resolved = Parts.resolveSetup(setup, team);
  let sum = 0, n = 0;
  for (const cat of Parts.CATALOG) {
    if (BUILD_CATS.indexOf(cat.id) < 0) continue;
    const top = cat.options.reduce((m, o) => Math.max(m, o.cost || 0), 0);
    const opt = resolved.options[cat.id];
    if (!top || !opt) continue;
    sum += clamp((opt.cost || 0) / top, 0, 1);
    n++;
  }
  return n ? sum / n : 0;
}

function riskFor(car, scale, build, networked) {
  if (!scale) return 0;
  const tier = clamp(car.tier | 0, 0, TIER_RISK.length - 1);
  let risk = TIER_RISK[tier];
  risk *= 1 - DEV_RELIEF * devNorm(car.team && car.team.id);
  if (car.isPlayer && build > 0 && !networked) risk *= 1 - BUILD_RELIEF * clamp(build, 0, 1);
  return clamp(risk * scale, 0, 1);
}

function arm(cars, opts) {
  const o = opts || {};
  const scale = LEVELS[o.level] || 0;
  const seed = o.seed >>> 0, round = o.round | 0;
  Log.info("game", "Reliability.arm scale=" + scale + " n=" + (cars && cars.length));
  let planned = 0;
  for (const c of cars) {
    c.retired = false; c.dnf = null; c.dnfAt = null; c.dnfWhy = null;
    if (!scale) continue;
    const who = c.driverId || c.code || "";
    if (draw(seed, "dnf", round, who) >= riskFor(c, scale, o.build, o.networked)) continue;
    c.dnfAt = AT_LO + draw(seed, "dnfAt", round, who) * (AT_HI - AT_LO);
    c.dnfWhy = REASONS[Math.min(REASONS.length - 1,
      Math.floor(draw(seed, "dnfWhy", round, who) * REASONS.length))];
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
