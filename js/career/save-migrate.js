/* Apex 26 — versioned save migration (SaveMigrate). Career ladder and season
   points remaps extracted from js/core/store.js so persistence stays a cache
   wrapper and domain migration lives beside career. */
"use strict";

const SaveMigrate = (function () {

  const CAREER_V = 1;
  const CAREER_MIGRATIONS = [
    // v0 -> v1: the first shipped shape. A v0 save predates `v` entirely.
    (c) => { c.season = c.season || { round: 0, pts: {}, teamPts: {}, driverCodes: {} }; },
  ];

  function seasonDriverId(teamId, driverIndex) { return `${teamId}:${driverIndex}`; }

  // The two per-driver sparse arrays a championship carries beside `pts`:
  // finishes: driverId -> per-position counts (SeasonCal.award()).
  // roundPts: driverId -> points per ROUND (both legs of a sprint weekend land
  // in the same index); SeasonCal.netPts() reads it when scores are dropped,
  // so a string or a negative in a row used to reach the arithmetic raw.
  // Owned here so migrateCareer's remapPoints and SeasonCal.resume() sanitise
  // the same way; season-cal.js delegates to these.
  function roundMap(o) {
    const out = {};
    if (!o || typeof o !== "object") return out;
    for (const k of Object.keys(o)) {
      if (!Array.isArray(o[k])) continue;
      out[k] = o[k].map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    }
    return out;
  }
  function finishMap(o) {
    const out = {};
    if (!o || typeof o !== "object") return out;
    for (const k of Object.keys(o)) {
      if (!Array.isArray(o[k])) continue;
      out[k] = o[k].map((v) => (Number.isInteger(v) && v > 0 ? v : 0));
    }
    return out;
  }

  function seasonRoster() {
    const roster = [];
    Teams.LIST.forEach((team) => team.drivers.forEach((driver, driverIndex) => {
      roster.push({
        id: seasonDriverId(team.id, driverIndex),
        code: driver.code,
      });
    }));
    return roster;
  }

  // Remap a championship's points onto stable driver ids. PURE: mutates the passed
  // object and returns it, but never touches localStorage — career owns a championship
  // of the same shape nested inside its OWN save, and running the persisting variant
  // over it would overwrite the standalone `apex26.season` with career's standings.
  function remapPoints(season) {
    if (!season) return season;
    season.round = Number.isInteger(season.round) && season.round >= 0 ? season.round : 0;
    const oldPts = season.pts && typeof season.pts === "object" && !Array.isArray(season.pts) ? season.pts : {};
    const roster = seasonRoster();
    const nextPts = {};
    const codes = season.driverCodes && typeof season.driverCodes === "object" && !Array.isArray(season.driverCodes)
      ? Object.assign({}, season.driverCodes) : {};
    // Legacy display-code keys cannot be disambiguated after historical code collisions, so migration is best-effort.
    Object.entries(oldPts).forEach(([key, value]) => {
      const driver = roster.find((candidate) => candidate.id === key || candidate.code === key);
      const id = driver ? driver.id : key;
      nextPts[id] = (nextPts[id] || 0) + Math.max(0, Number(value) || 0);
      if (driver) codes[id] = driver.code;
      else if (!codes[id]) codes[id] = key;
    });
    roster.forEach((driver) => {
      if (Object.prototype.hasOwnProperty.call(nextPts, driver.id)) codes[driver.id] = driver.code;
    });
    season.pts = nextPts;
    season.driverCodes = codes;
    const oldTeams = season.teamPts && typeof season.teamPts === "object" && !Array.isArray(season.teamPts)
      ? season.teamPts : {};
    season.teamPts = {};
    Object.entries(oldTeams).forEach(([id, value]) => {
      const n = Number(value);
      if (id && isFinite(n)) season.teamPts[id] = Math.max(0, n);
    });
    season.finishes = finishMap(season.finishes);
    season.roundPts = roundMap(season.roundPts);
    return season;
  }

  // The contract's four numbers. A hand-edited or truncated save could carry
  // `salary: "x"`; Number()||0 keeps every later `+=` finite.
  function cleanDeal(deal) {
    if (!deal || typeof deal !== "object" || Array.isArray(deal)) return null;
    deal.salary = Number(deal.salary) || 0;
    deal.bonusPt = Number(deal.bonusPt) || 0;
    deal.left = Number(deal.left) || 0;
    deal.years = Number(deal.years) || 0;
    return deal;
  }

  // Fill in every optional key so the rest of the code never guards for undefined,
  // and climb the migration ladder.
  //
  // PURE — it mutates the save it is handed and returns it, but it does NOT write.
  // Career.save() is the one thing that persists, and it knows the slot.
  function migrateCareer(career) {
    if (!career || typeof career !== "object") return null;
    let v = career.v | 0;
    while (v < CAREER_V && CAREER_MIGRATIONS[v]) { CAREER_MIGRATIONS[v](career); v++; }
    career.v = CAREER_V;
    career.flavour = career.flavour === "myteam" ? "myteam" : "driver";
    career.year = career.year | 0 || 2026;
    career.money = Number(career.money) || 0;
    career.rep = Math.max(0, Math.min(100, Number(career.rep) || 0));
    career.seat = career.seat | 0;
    career.driver = career.driver && typeof career.driver === "object"
      ? career.driver : { name: "Your Name", code: "YOU", num: 99 };
    career.team = typeof career.team === "string" && career.team ? career.team : null;
    career.deal = cleanDeal(career.deal);
    career.seed = career.seed | 0;
    career.season = remapPoints(career.season || { round: 0, pts: {}, teamPts: {}, driverCodes: {} });
    career.owned = Array.isArray(career.owned) ? career.owned : [];
    career.fitted = career.fitted && typeof career.fitted === "object" ? career.fitted : {};
    // Only object rows: a null or a number in the ledger threw on the first
    // `r.round` read in the history screen.
    career.results = Array.isArray(career.results)
      ? career.results.filter((r) => r && typeof r === "object" && !Array.isArray(r)) : [];
    career.history = Array.isArray(career.history) ? career.history : [];
    career.dev = career.dev && typeof career.dev === "object" ? career.dev : {};
    career.tdev = career.tdev && typeof career.tdev === "object" ? career.tdev : {};
    career.seats = career.seats && typeof career.seats === "object" ? career.seats : {};
    career.offers = Array.isArray(career.offers) ? career.offers : [];
    career.obj = career.obj && typeof career.obj === "object" ? career.obj : null;
    career.budgetLvl = Math.max(0, career.budgetLvl | 0);
    career.facility = career.facility | 0;
    career.moves = Array.isArray(career.moves) ? career.moves : [];
    career.paidSponsors = Array.isArray(career.paidSponsors) ? career.paidSponsors : [];
    return career;
  }

  function migrateSeasonPoints(store, season) {
    if (!season) return season;
    remapPoints(season);
    store.set("season", season);
    return season;
  }

  return { migrateCareer, migrateSeasonPoints, remapPoints, roundMap, finishMap, CAREER_V };
})();
Object.freeze(SaveMigrate);
