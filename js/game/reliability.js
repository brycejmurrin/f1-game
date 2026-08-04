/* Apex 26 — RELIABILITY: whether a car reaches the flag at all.

   Every car used to finish every race, which makes a championship — and a career
   above all — a pure pace ranking. A reliability-led DNF is what makes a points
   finish in a bad car feel earned and what lets a title fight swing on something
   other than lap time.

   THE RATING IS DERIVED, NOT AUTHORED. There is no per-team reliability table to
   keep in step with teams.js: risk comes from the team TIER (the same number that
   already says how good the car is), is relieved by career TEAM DEVELOPMENT
   (Career.paceMult), and is relieved again by what the player has actually SPENT
   on the two components an F1 car retires from — the power unit and the gearbox.
   So a back-marker breaks, a developing team stops breaking, and money buys
   finishes as well as lap time.

   THE DRAW TOUCHES NO STREAM. makeCars() spends exactly one simRnd() per driver
   and the stream position after it is a hard contract (see driverSkill in
   game.js) — drawing here would shift every seeded result that follows. This is
   a STATELESS hash instead, Career.hash(seed, ...parts), with the career's seed
   inside a career and the SIM seed outside one. Nothing is consumed, and the same
   (seed, round, driver) always retires the same car at the same point of the race.

   The whole model is a plan drawn at the green light: arm() writes `dnfAt` (a
   fraction of race distance) and `dnfWhy` onto each car, and game.js retires the
   car when it gets there. Pure rules — no DOM, no game state, no physics.
   Consumes globals Career and Parts. */
const Reliability = (function () {
  "use strict";

// What the RELIABILITY race setting means, as a scale on every risk below. OFF is
// the shipped default: an existing save must not start losing cars because the
// game was updated.
const LEVELS = { off: 0, low: 0.5, real: 1 };

// Per-race failure probability of a works car, by team tier. Tuned against a
// 22-car grid: at REAL the field loses roughly one and a half cars a race, which
// is a busy but recognisable modern-F1 weekend, and a tier-4 car is three times
// as likely to be one of them as a tier-0 car.
const TIER_RISK = [0.04, 0.055, 0.075, 0.10, 0.12];

// Drawn one slot per entry, so the weighting IS the table: mechanical failure is
// the common case and the accident is the tail. Kept to three because each one
// has to read as a distinct sentence on the HUD, not as flavour text.
const REASONS = ["engine", "engine", "gearbox", "gearbox", "accident"];

// Where in the race a failure can land, as a fraction of the full distance. Not
// [0,1]: a car that retires on the formation lap never raced, and one that
// retires within sight of the flag reads as the game cheating you.
const AT_LO = 0.06, AT_HI = 0.94;

// How much of the base risk full team development buys back. ±TDEV_MAX is a
// whole season or two of climbing, so it is worth a real slice — but never all of
// it, or a developed team becomes immortal and the mechanic stops existing.
const DEV_RELIEF = 0.40;

// The same, for the player's own build. ENGINE and GEARBOX are the two categories
// a real car retires from, and they are the expensive end of the catalog, so this
// is the R&D economy paying for finishes: a fully specced power unit and gearbox
// cut the risk by a third.
const BUILD_RELIEF = 0.33;
const BUILD_CATS = ["engine", "gearbox"];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The stateless draw. Career owns the hash (and the xorshift finalizer that makes
// it a draw rather than a ramp — see js/game/career.js); this passes its own seed
// in because a Grand Prix has no career seed to hash on.
function draw(seed, ...parts) { return Career.hash(seed, ...parts); }

// Career team development as -1..+1, where +1 is a fully developed team. Read off
// paceMult rather than career.tdev so this stays on the one accessor game.js
// already trusts — and so it is exactly 0 outside a career, with no branch.
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

// One car's probability of not finishing. `build` is buildQuality() for a car
// whose setup we know — which is the human cars only: an AI runs its team's works
// car, and that is precisely what `tier` already encodes.
function riskFor(car, scale, build) {
  if (!scale) return 0;
  const tier = clamp(car.tier | 0, 0, TIER_RISK.length - 1);
  let risk = TIER_RISK[tier];
  risk *= 1 - DEV_RELIEF * devNorm(car.team && car.team.id);
  if (car.human && build > 0) risk *= 1 - BUILD_RELIEF * clamp(build, 0, 1);
  return clamp(risk * scale, 0, 1);
}

// Draw the whole field's retirements for one race. ALWAYS clears first, so this
// is also how a car's flags are reset between sessions — a level of "off" leaves
// every car armed with nothing rather than skipping the reset.
//
// `opts`: { level, seed, round, build }. `round` is the career/season round in a
// championship and a per-session race counter otherwise, so two Grands Prix in a
// row are not handed the same casualties.
function arm(cars, opts) {
  const o = opts || {};
  const scale = LEVELS[o.level] || 0;
  const seed = o.seed >>> 0, round = o.round | 0;
  for (const c of cars) {
    c.retired = false; c.dnf = null; c.dnfAt = null; c.dnfWhy = null;
    if (!scale) continue;
    const who = c.driverId || c.code || "";
    if (draw(seed, "dnf", round, who) >= riskFor(c, scale, o.build)) continue;
    c.dnfAt = AT_LO + draw(seed, "dnfAt", round, who) * (AT_HI - AT_LO);
    c.dnfWhy = REASONS[Math.min(REASONS.length - 1,
      Math.floor(draw(seed, "dnfWhy", round, who) * REASONS.length))];
  }
  return cars;
}

// The armed plan, for the debug hook and the tests. Cars with nothing to come and
// nothing behind them are left out — an empty list is the honest answer for a
// race everybody finishes.
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

const levels = () => Object.keys(LEVELS);
const isLevel = (v) => Object.prototype.hasOwnProperty.call(LEVELS, v);

return { LEVELS, TIER_RISK, REASONS, DEV_RELIEF, BUILD_RELIEF, BUILD_CATS,
         AT_LO, AT_HI, arm, plan, riskFor, buildQuality, levels, isLevel };
})();
