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

  // Guarded: the node VM harnesses load this file without js/core/log.js.
  function log(level, msg) { if (typeof Log !== "undefined") Log[level]("game", msg); }

  function finiteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function seasonDriverId(teamId, driverIndex) { return `${teamId}:${driverIndex}`; }

  // The two per-driver sparse arrays a championship carries beside `pts`:
  // finishes: driverId -> per-position counts (SeasonCal.award()).
  // roundPts: driverId -> points per ROUND (both legs of a sprint weekend land
  // in the same index); SeasonCal.netPts() reads it when scores are dropped,
  // so a string or a negative in a row must not reach the arithmetic raw.
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
      nextPts[id] = Math.min(Number.MAX_VALUE, (nextPts[id] || 0) + Math.max(0, finiteNumber(value)));
      // A STORED code wins: award() files the player's seat as "YOU", market
      // moves and MY TEAM hires re-label seats, and rewriting them from the
      // shipped roster on every load named the player's row after the AI.
      if (!codes[id]) codes[id] = driver ? driver.code : key;
    });
    roster.forEach((driver) => {
      if (Object.prototype.hasOwnProperty.call(nextPts, driver.id) && !codes[driver.id]) codes[driver.id] = driver.code;
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
  // `salary: "x"` or JSON exponent overflow (1e309); reject non-finite values.
  function cleanDeal(deal) {
    if (!deal || typeof deal !== "object" || Array.isArray(deal)) return null;
    deal.salary = finiteNumber(deal.salary);
    deal.bonusPt = finiteNumber(deal.bonusPt);
    deal.left = finiteNumber(deal.left);
    deal.years = finiteNumber(deal.years);
    return deal;
  }

  function clampSeat(seat, teamId) {
    const team = typeof Teams !== "undefined" && Teams && Array.isArray(Teams.LIST)
      ? Teams.LIST.find((t) => t && t.id === teamId) : null;
    const n = team && Array.isArray(team.drivers) && team.drivers.length ? team.drivers.length : 2;
    const i = Math.trunc(Number(seat)) || 0;
    return Math.max(0, Math.min(n - 1, i));
  }

  // Fill in every optional key so the rest of the code never guards for undefined,
  // and climb the migration ladder.
  //
  // PURE — it mutates the save it is handed and returns it, but it does NOT write.
  // Career.save() is the one thing that persists, and it knows the slot.
  function migrateCareer(career) {
    if (!career || typeof career !== "object" || Array.isArray(career)) {
      if (career != null) log("warn", "Career save rejected: not an object type=" + (Array.isArray(career) ? "array" : typeof career));
      return null;
    }
    let v = career.v | 0;
    while (v < CAREER_V && CAREER_MIGRATIONS[v]) { CAREER_MIGRATIONS[v](career); log("info", "Career save migrated v" + v + "->v" + (v + 1)); v++; }
    if (v > CAREER_V) log("warn", "Career save newer than build: v" + v + " > v" + CAREER_V + ", kept as-is");
    // Never DOWNGRADE: a save from a newer build (a stale cached shell opening
    // it) keeps its version, so that build's ladder is not re-run on it.
    career.v = Math.max(v, CAREER_V);
    career.flavour = career.flavour === "myteam" ? "myteam" : "driver";
    career.year = career.year | 0 || 2026;
    career.money = finiteNumber(career.money);
    career.rep = Math.max(0, Math.min(100, Number(career.rep) || 0));
    career.driver = career.driver && typeof career.driver === "object"
      ? career.driver : { name: "Your Name", code: "YOU", num: 99 };
    // NEVER null: title-menu / career-ui call career.team.toUpperCase() at boot, so
    // one imported row with no team stopped the game before the slot picker.
    // The default is Career.start's.
    career.team = typeof career.team === "string" && career.team ? career.team
      : career.flavour === "myteam" ? "custom" : "haas";
    // THE SEAT IS AN INDEX INTO THE TEAM'S GRID ROW. game.js copies it straight
    // into driverIdx, and makeCars marks the player by `di === driverIdx`, so a
    // hand-edited or imported `seat: 5` / `-1` gridded a race with no player car.
    // MY TEAM's player is always seat 0; a DRIVER seat is clamped to the row.
    career.seat = career.flavour === "myteam" ? 0 : clampSeat(career.seat, career.team);
    career.deal = cleanDeal(career.deal);
    career.seed = career.seed | 0;
    // A plain object or the empty season: a number or string here (a hand edit,
    // a partial write) made remapPoints' `season.round =` throw in strict mode,
    // and Career.load() runs at boot uncaught — one bad slot stopped the game.
    const sz = career.season;
    career.season = remapPoints(sz && typeof sz === "object" && !Array.isArray(sz) ? sz : { round: 0, pts: {}, teamPts: {}, driverCodes: {} });
    // Career always races Tracks.SEASON and never writes a frozen rule set into
    // its season; SeasonCal.netPts prefers season.config, so an imported one with
    // a huge `round` made it loop `round` times. (remapPoints keeps config: the
    // standalone season stores its frozen rules there.)
    delete career.season.config;
    career.owned = Array.isArray(career.owned) ? career.owned : [];
    career.fitted = career.fitted && typeof career.fitted === "object" ? career.fitted : {};
    // Only object rows: a null or a number in the ledger threw on the first
    // `r.round` read in the history screen (and history on the title screen's
    // Career.slots(); offers and moves the same way).
    const rows = (a) => (Array.isArray(a) ? a.filter((r) => r && typeof r === "object" && !Array.isArray(r)) : []);
    career.results = rows(career.results);
    career.history = rows(career.history);
    // Sparse maps keyed by seat / team: object rows only (a string row made
    // DriverRatings.get read fields of a primitive), and tdev's numbers finite
    // (`tdev:{haas:"abc"}` made tierV NaN).
    const objMap = (m) => {
      const out = {};
      if (m && typeof m === "object" && !Array.isArray(m)) {
        Object.keys(m).forEach((k) => { const r = m[k]; if (r && typeof r === "object" && !Array.isArray(r)) out[k] = r; });
      }
      return out;
    };
    career.dev = objMap(career.dev);
    career.tdev = career.tdev && typeof career.tdev === "object" && !Array.isArray(career.tdev) ? career.tdev : {};
    Object.keys(career.tdev).forEach((k) => { career.tdev[k] = finiteNumber(career.tdev[k]); });
    career.aiParts = career.aiParts && typeof career.aiParts === "object" && !Array.isArray(career.aiParts)
      ? career.aiParts : {};
    career.seats = objMap(career.seats);
    // An offer's salary is added to career.money on acceptance (a string was
    // concatenated); its years become the deal's.
    career.offers = rows(career.offers).map((o) => {
      for (const k of ["salary", "years"]) if (k in o) o[k] = finiteNumber(o[k]);   // present keys only: a partial row stays partial
      return o;
    });
    career.obj = career.obj && typeof career.obj === "object" ? career.obj : null;
    // Which of the round's three briefs was chosen, {round, i}. No CAREER_V rung:
    // absent reads as index 0, which is the kind the single dealt brief always
    // was, so a save written before the choice existed keeps the brief it had.
    career.objPick = career.objPick && typeof career.objPick === "object"
      && !Array.isArray(career.objPick) ? career.objPick : null;
    career.budgetLvl = Math.max(0, career.budgetLvl | 0);
    career.facility = career.facility | 0;
    career.moves = rows(career.moves);
    // MY TEAM's hired seat: rows or null — `roster: {}` threw in wageBill().
    // Its numbers as cleanDeal's: wageBill() sums `salary`, and one "x" turned
    // career.money into NaN, saved as null and read back as 0.
    career.roster = Array.isArray(career.roster) ? rows(career.roster).map((d) => {
      d.salary = finiteNumber(d.salary);
      d.left = finiteNumber(d.left);
      if (d.pending && typeof d.pending === "object" && !Array.isArray(d.pending)) d.pending.ask = finiteNumber(d.pending.ask);
      else d.pending = null;
      return d;
    }) : null;
    career.paidSponsors = Array.isArray(career.paidSponsors) ? career.paidSponsors : [];
    return career;
  }

  function migrateSeasonPoints(_store, season) {
    if (!season) return season;
    remapPoints(season);
    return season;
  }

  return { migrateCareer, migrateSeasonPoints, remapPoints, roundMap, finishMap, CAREER_V };
})();
Object.freeze(SaveMigrate);
