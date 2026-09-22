/* Apex 26 — career regulation eras. A rolling ruleset that makes some catalog
 * options illegal for a few seasons, GRID-WIDE, so car development has a second
 * act. See docs/notes/CAREER-CEILING-FIX-2026-09-22.md for the measurements.
 *
 * THE DEFECT THIS EXISTS FOR. Measured, not assumed: an optimal capped build
 * costs ~18,900-22,800 cr of research plus a 16,500 cr budget ladder against
 * ~6,100-8,100 cr a season, so THE CAR IS FINISHED IN 2.6-3.7 SEASONS — and a
 * career is unbounded. Worse, at the cap six of eleven teams converge on
 * materially the same build, so near the top the seat you hold stops changing
 * your car and the contract ladder terminates too.
 *
 * WHY IT IS A LEGALITY FILTER AND NOT A CONFISCATION. The obvious fix — take the
 * player's parts away every few years — is a punishment, not a reset: AI cars
 * never leave Parts.getFactorySetup(), so removing only the player's parts
 * leaves them worse than a grid that lost nothing. This bans option IDS, and
 * Parts._resolve() consults the ban for EVERY resolution and falls back to
 * DEFAULTS — the same path the AI's factory build takes. One predicate, whole
 * grid, and `career.owned` is never touched: a part you researched is not legal
 * this era, and it comes back when the era lapses.
 *
 * MEASURED SHUFFLE, on the first cut of this table: banning the dearest options
 * across three categories moved 4 of 11 grid slots on the AI side alone and
 * compressed the field spread by 42% — two backmarkers came out marginally
 * AHEAD, because their presets were barely using the premium options a
 * front-runner's was built on. A pecking-order change, not a flat nerf.
 */
const Regulations = (function () {
  "use strict";

  // HOW LONG AN ERA RUNS, and how much of each affected category it takes.
  //
  // FOUR SEASONS lands the first rule change AFTER the car is finished (2.6-3.7
  // seasons) rather than during the climb — a regulation that interrupts the
  // first build is a tax on the part of the mode that already works.
  //
  // TWO options, not the whole category. Falling all the way back to DEFAULTS
  // guts a car; taking the dearest two leaves mid-shelf rungs legal, so an era
  // is a re-optimisation rather than a demolition. Both numbers are the tuning
  // surface — change them here and re-run tools/car/career-economy.mjs.
  const ERA_SEASONS = 4;
  const BAN_TOP = 2;

  // THE FIRST ERA IS OPEN, deliberately: seasons 1-4 of a new career run under
  // no restriction at all, which is the window the measurements say the first
  // build occupies. Every era after it takes three of the twelve categories,
  // grouped so the ruleset reads like a rule and not a random draw.
  const ERAS = [
    { id: "open", name: "OPEN REGULATIONS", cats: [],
      blurb: "No restrictions. Build the car you want." },
    { id: "powertrain", name: "POWERTRAIN FREEZE", cats: ["engine", "ers", "fuel"],
      blurb: "The dearest engine, ERS and fuel packages are outlawed. Everyone loses them." },
    { id: "aero", name: "AERO RESET", cats: ["aero", "floor", "suspension"],
      blurb: "Wings, floors and suspension are cut back to a common shelf." },
    { id: "chassis", name: "CHASSIS RULES", cats: ["brakes", "gearbox", "exhaust"],
      blurb: "Braking, transmission and exhaust development is capped for everyone." },
  ];

  function eraAt(i) { return ERAS[((i % ERAS.length) + ERAS.length) % ERAS.length]; }
  // Seasons elapsed, not the calendar year: a career that starts in 2026 and one
  // resumed from an older save must see the same era on their own Nth season.
  function eraIndexFor(seasonsElapsed) {
    const n = Math.max(0, Math.floor(seasonsElapsed) || 0);
    return Math.floor(n / ERA_SEASONS);
  }
  function eraFor(seasonsElapsed) { return eraAt(eraIndexFor(seasonsElapsed)); }
  // Seasons until the NEXT ruleset — what the hub counts down.
  function seasonsLeft(seasonsElapsed) {
    const n = Math.max(0, Math.floor(seasonsElapsed) || 0);
    return ERA_SEASONS - (n % ERA_SEASONS);
  }

  // The banned set is derived from the catalog rather than listed, so repricing
  // or adding an option moves the ban with it and no id can rot. Cached per era
  // because _resolve() asks per category per resolution.
  const _banCache = new Map();
  function bannedIds(eraId) {
    let set = _banCache.get(eraId);
    if (set) return set;
    set = new Set();
    const era = ERAS.find((e) => e.id === eraId);
    if (era && era.cats.length && typeof Parts !== "undefined") {
      for (const cat of Parts.CATALOG) {
        if (!era.cats.includes(cat.id)) continue;
        // Dearest first, take BAN_TOP. A cost-0 option is never banned: the
        // DEFAULTS are all cost-0 and _resolve() falls back to them, so banning
        // one would leave a category with nothing legal in it.
        const ranked = cat.options.filter((o) => (o.cost || 0) > 0)
          .sort((a, b) => (b.cost || 0) - (a.cost || 0));
        for (const o of ranked.slice(0, BAN_TOP)) set.add(o.id);
      }
    }
    _banCache.set(eraId, set);
    return set;
  }
  function isLegal(optId, eraId) { return !bannedIds(eraId).has(optId); }
  // The predicate Parts.setLegality() installs, bound to one era.
  function legalityFor(eraId) {
    const banned = bannedIds(eraId);
    return banned.size ? (opt) => !banned.has(opt.id) : null;
  }

  return {
    ERAS, ERA_SEASONS, BAN_TOP,
    eraAt, eraFor, eraIndexFor, seasonsLeft, bannedIds, isLegal, legalityFor,
  };
})();
Object.freeze(Regulations);
