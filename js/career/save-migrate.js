/* Apex 26 — versioned save migration (SaveMigrate). Career ladder and season
   points remaps extracted from js/core/store.js so persistence stays a cache
   wrapper and domain migration lives beside career. */
"use strict";

const SaveMigrate = (function () {

  const CAREER_V = 2;
  const CAREER_MIGRATIONS = [
    // v0 -> v1: the first shipped shape. A v0 save predates `v` entirely.
    (c) => { c.season = c.season || { round: 0, pts: {}, teamPts: {}, driverCodes: {} }; },
    // v1 -> v2: legacy Standard brief and original sponsor. No economy changes.
    (c) => { c.briefStake = null; c.sponsorPicks = {}; },
  ];

  // Guarded: the node VM harnesses load this file without js/core/log.js.
  function log(level, msg) { if (typeof Log !== "undefined") Log[level]("game", msg); }

  // Disk JSON may contain objects with non-callable toString/valueOf fields.
  // Coerce scalar legacy numbers only; object coercion can throw during boot.
  function scalarNumber(value) {
    if (value !== null && value !== undefined && typeof value !== "number"
        && typeof value !== "string" && typeof value !== "boolean") return NaN;
    return Number(value);
  }

  function finiteNumber(value) {
    const n = scalarNumber(value);
    return Number.isFinite(n) ? n : 0;
  }

  // A version marker has one representation policy at every ingress. Missing
  // means the pre-versioned v0 shape; explicit markers must be non-negative
  // safe integers, with digit-only JSON strings accepted for compatibility.
  function careerVersion(value) {
    if (value === undefined) return 0;
    if (typeof value === "string") {
      if (!/^\d+$/.test(value)) return null;
      value = Number(value);
    }
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  // Mirrors of career.js's TDEV_MAX / DEV_MAX / EXP_MAX (this file loads first
  // and cannot read them; save-migrate.test.mjs pins the three pairs equal).
  const TDEV_LIMIT = 8;
  const DEV_LIMIT = 12;
  const EXP_LIMIT = 40;

  function clampTo(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // A sparse {key: number} map -> only the finite entries, clamped. Career
  // multiplies tdev into every AI car's pace and adds dev into every rating:
  // one "abc" or 1e308 there became NaN or an infinite lap time for the grid.
  // A non-numeric entry is DROPPED (absent reads as 0), not zeroed in place.
  function numMap(o, lo, hi) {
    const out = {};
    if (!o || typeof o !== "object" || Array.isArray(o)) return out;
    for (const k of Object.keys(o)) {
      if (k === "__proto__") continue;
      const v = o[k];
      const n = typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN;
      if (Number.isFinite(n)) out[k] = clampTo(n, lo, hi);
    }
    return out;
  }

  // driverId -> per-axis deltas over the shipped DriverRatings table. Only the
  // five quality axes are authored by career; experience is the age proxy and
  // runs 0..EXP_LIMIT, the rest are signed.
  function devMap(o) {
    const out = {};
    if (!o || typeof o !== "object" || Array.isArray(o)) return out;
    for (const k of Object.keys(o)) {
      if (k === "__proto__" || !o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) continue;
      const row = {};
      for (const axis of ["pace", "craft", "awareness", "consistency"])
        Object.assign(row, numMap({ [axis]: o[k][axis] }, -DEV_LIMIT, DEV_LIMIT));
      Object.assign(row, numMap({ experience: o[k].experience }, 0, EXP_LIMIT));
      out[k] = row;
    }
    return out;
  }

  // driverId -> {name, code, num}: the AI driver a market move seated there.
  // An entry that is not a named, coded driver is dropped and the shipped
  // driver stays in the seat.
  function seatMap(o) {
    const out = {};
    if (!o || typeof o !== "object" || Array.isArray(o)) return out;
    for (const k of Object.keys(o)) {
      const d = o[k];
      if (k === "__proto__" || !d || typeof d !== "object" || Array.isArray(d)) continue;
      if (typeof d.name !== "string" || !d.name || typeof d.code !== "string" || !d.code) continue;
      out[k] = { name: d.name, code: d.code, num: clampTo(Math.trunc(finiteNumber(d.num)), 0, 999) };
    }
    return out;
  }

  // Offers are signed verbatim by acceptOffer(): a string salary there reached
  // settleRound as `money + "9"` and concatenated the balance.
  // Only keys that are present: a stub row stays a stub (acceptOffer refuses it).
  function cleanOffer(o) {
    if ("years" in o) o.years = clampTo(Math.round(finiteNumber(o.years)), 1, 3);
    if ("salary" in o) o.salary = Math.max(0, finiteNumber(o.salary));
    return o;
  }

  // A settled round's three numbers: round index, finishing position, points.
  // Only keys that are present are coerced, so a row never gains a round it did
  // not have (the season guard reads `row.r`).
  function cleanResult(row) {
    if ("r" in row) row.r = Math.max(0, Math.trunc(finiteNumber(row.r)));
    if ("p" in row) row.p = Math.max(0, Math.trunc(finiteNumber(row.p)));
    if ("pts" in row) row.pts = Math.max(0, finiteNumber(row.pts));
    return row;
  }

  // The cumulative career record. career.history is a rolling archive of the
  // last HISTORY_MAX seasons, so every "N seasons · M titles" total read off it
  // stopped climbing at 11 / 10. The tally outlives the archive: rollover() adds
  // each closing season to it, and a save from before it existed derives it once
  // here from whatever history it still has (a lower bound for a long career).
  const TALLY_KEYS = ["seasons", "wins", "podiums", "titles", "cTitles", "pts"];
  function tallyOf(history) {
    const t = { seasons: 0, wins: 0, podiums: 0, titles: 0, cTitles: 0, pts: 0 };
    for (const h of Array.isArray(history) ? history : []) {
      if (!h || typeof h !== "object") continue;
      t.seasons++;
      t.wins += Math.max(0, finiteNumber(h.wins));
      t.podiums += Math.max(0, finiteNumber(h.podiums));
      t.pts += Math.max(0, finiteNumber(h.pts));
      if (h.pos === 1) t.titles++;
      if (h.cPos === 1) t.cTitles++;
    }
    return t;
  }
  function cleanTally(t, history) {
    if (!t || typeof t !== "object" || Array.isArray(t)) return tallyOf(history);
    const out = {};
    for (const k of TALLY_KEYS) out[k] = Math.max(0, finiteNumber(t[k]));
    return out;
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
      if (k === "__proto__" || !Array.isArray(o[k])) continue;
      out[k] = o[k].map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    }
    return out;
  }
  function finishMap(o) {
    const out = {};
    if (!o || typeof o !== "object") return out;
    for (const k of Object.keys(o)) {
      if (k === "__proto__" || !Array.isArray(o[k])) continue;
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
      nextPts[id] = Math.min(Number.MAX_VALUE, (Object.hasOwn(nextPts, id) ? nextPts[id] : 0) + Math.max(0, finiteNumber(value)));
      // A STORED code wins: award() files the player's seat as "YOU", market
      // moves and MY TEAM hires re-label seats, and rewriting them from the
      // shipped roster on every load named the player's row after the AI.
      if (!Object.hasOwn(codes, id) || !codes[id]) codes[id] = driver ? driver.code : key;
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
      const n = scalarNumber(value);
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
    // A goal type that names an Object.prototype member ("constructor",
    // "__proto__") is junk: it is what Career.goalKind would have indexed a plain
    // table with. Unknown-but-plain types stay (they already resolve as champPos).
    const g = deal.goal;
    if (g && typeof g === "object" && !Array.isArray(g) && (typeof g.type !== "string" || g.type in Object.prototype)) g.type = "champPos";
    return deal;
  }

  function clampSeat(seat, teamId) {
    const team = typeof Teams !== "undefined" && Teams && Array.isArray(Teams.LIST)
      ? Teams.LIST.find((t) => t && t.id === teamId) : null;
    const n = team && Array.isArray(team.drivers) && team.drivers.length ? team.drivers.length : 2;
    const i = Math.trunc(scalarNumber(seat)) || 0;
    return Math.max(0, Math.min(n - 1, i));
  }

  // Part ownership and fitted setup entries are player input too.  Keeping an
  // arbitrary string here used to be harmless until a catalog lookup changed:
  // an imported `owned: ["future-part"]` could never be bought again, while a
  // fitted `category: "future-part"` was handed to Parts.resolveSetup as if it
  // were a real option.  Normalize against the live catalog once it is loaded;
  // early schema validation can run before Parts, so leave the arrays alone in
  // that narrow case and let the boot-time Career.load pass do the filtering.
  function cleanParts(career) {
    if (typeof Parts === "undefined" || !Array.isArray(Parts.CATALOG) || !Parts.CATALOG.length) return;
    const byCategory = new Map();
    const all = new Set();
    for (const cat of Parts.CATALOG) {
      if (!cat || typeof cat.id !== "string" || !Array.isArray(cat.options)) continue;
      const ids = new Set();
      for (const opt of cat.options) {
        if (!opt || typeof opt.id !== "string") continue;
        ids.add(opt.id); all.add(opt.id);
      }
      byCategory.set(cat.id, ids);
    }
    if (Array.isArray(career.owned)) {
      career.owned = career.owned.filter((id, i, a) =>
        typeof id === "string" && all.has(id) && a.indexOf(id) === i);
    } else career.owned = [];
    const fitted = {};
    if (career.fitted && typeof career.fitted === "object" && !Array.isArray(career.fitted)) {
      for (const cat of Object.keys(career.fitted)) {
        if (cat === "__proto__" || !byCategory.has(cat)) continue;
        const id = career.fitted[cat];
        if (typeof id === "string" && byCategory.get(cat).has(id)) fitted[cat] = id;
      }
    }
    career.fitted = fitted;
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
    const version = careerVersion(career.v);
    if (version === null) {
      log("warn", "Career save rejected: invalid version marker.");
      return null;
    }
    if (version > CAREER_V) {
      log("warn", "Career save requires a newer build (v" + version + "); update the game to open it. Save preserved.");
      return null;
    }
    let v = version;
    while (v < CAREER_V && CAREER_MIGRATIONS[v]) { CAREER_MIGRATIONS[v](career); log("info", "Career save migrated v" + v + "->v" + (v + 1)); v++; }
    career.v = CAREER_V;
    career.flavour = career.flavour === "myteam" ? "myteam" : "driver";
    career.year = finiteNumber(career.year) | 0 || 2026;
    career.money = finiteNumber(career.money);
    career.rep = Math.max(0, Math.min(100, finiteNumber(career.rep)));
    // Driver identity is read by title/cards and by rating lookups. Keep a
    // malformed existing slot recoverable: JSON can persist objects/functions'
    // JSON-safe cousins in these leaves, and a later template interpolation
    // would throw before the player could reach the import/recovery controls.
    const driver = career.driver && typeof career.driver === "object" && !Array.isArray(career.driver)
      ? career.driver : {};
    driver.name = typeof driver.name === "string" && driver.name ? driver.name : "Your Name";
    driver.code = typeof driver.code === "string" && driver.code ? driver.code : "YOU";
    driver.num = typeof driver.num === "number" && Number.isFinite(driver.num)
      ? Math.max(0, Math.min(999, Math.trunc(driver.num))) : 99;
    career.driver = driver;
    // A missing team defaults as Career.start does: a null here threw on the title
    // screen's `.toUpperCase()` at boot, from an imported row like {"money":100}
    // (slotPayloadOk does not look at the team).
    career.team = typeof career.team === "string" && career.team ? career.team : (career.flavour === "myteam" ? "custom" : "haas");
    // THE SEAT IS AN INDEX INTO THE TEAM'S GRID ROW. game.js copies it straight
    // into driverIdx, and makeCars marks the player by `di === driverIdx`, so a
    // hand-edited or imported `seat: 5` / `-1` gridded a race with no player car.
    // MY TEAM's player is always seat 0; a DRIVER seat is clamped to the row.
    career.seat = career.flavour === "myteam" ? 0 : clampSeat(career.seat, career.team);
    career.deal = cleanDeal(career.deal);
    career.seed = finiteNumber(career.seed) | 0;
    // A plain object or the empty season: a number or string here (a hand edit,
    // a partial write) made remapPoints' `season.round =` throw in strict mode,
    // and Career.load() runs at boot uncaught — one bad slot stopped the game.
    const sz = career.season;
    career.season = remapPoints(sz && typeof sz === "object" && !Array.isArray(sz) ? sz : { round: 0, pts: {}, teamPts: {}, driverCodes: {} });
    // A career season never carries a frozen rules snapshot (that is the
    // standalone Season screen's). An imported one with a huge `round` made
    // SeasonCal.netPts loop `round` times, so it is dropped on the way in.
    delete career.season.config;
    career.owned = Array.isArray(career.owned) ? career.owned : [];
    career.fitted = career.fitted && typeof career.fitted === "object" ? career.fitted : {};
    cleanParts(career);
    // Only object rows: a null or a number in the ledger threw on the first
    // `r.round` read in the history screen (and history on the title screen's
    // Career.slots(); offers and moves the same way).
    const rows = (a) => (Array.isArray(a) ? a.filter((r) => r && typeof r === "object" && !Array.isArray(r)) : []);
    career.results = rows(career.results).map(cleanResult);
    career.history = rows(career.history);
    career.tally = cleanTally(career.tally, career.history);
    career.dev = devMap(career.dev);
    career.tdev = numMap(career.tdev, -TDEV_LIMIT, TDEV_LIMIT);
    career.aiParts = career.aiParts && typeof career.aiParts === "object" && !Array.isArray(career.aiParts)
      ? career.aiParts : {};
    career.seats = seatMap(career.seats);
    career.offers = rows(career.offers).map(cleanOffer);
    career.obj = career.obj && typeof career.obj === "object" ? career.obj : null;
    // Which of the round's three briefs was chosen, {round, i}. No CAREER_V rung:
    // absent reads as index 0, which is the kind the single dealt brief always
    // was, so a save written before the choice existed keeps the brief it had.
    career.objPick = career.objPick && typeof career.objPick === "object"
      && !Array.isArray(career.objPick) ? career.objPick : null;
    career.budgetLvl = Math.max(0, finiteNumber(career.budgetLvl) | 0);
    career.facility = finiteNumber(career.facility) | 0;
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
    const stake = career.briefStake;
    career.briefStake = stake && Number.isInteger(stake.year) && Number.isInteger(stake.round) && stake.round >= 0
      ? { year: stake.year, round: stake.round, committed: stake.committed === true, escrow: stake.escrow === 50 ? 50 : 0 } : null;
    const picks = career.sponsorPicks;
    career.sponsorPicks = {};
    if (picks && typeof picks === "object" && !Array.isArray(picks))
      for (const key of Object.keys(picks).slice(0, 1024))
        if (/^\d{4,8}:\d{1,3}$/.test(key) && (picks[key] === 0 || picks[key] === 1)) career.sponsorPicks[key] = picks[key];
    career.paidSponsors = Array.isArray(career.paidSponsors) ? career.paidSponsors : [];
    if (career.myTeamIdentity && typeof CareerTeamIdentity !== "undefined") career.myTeamIdentity = CareerTeamIdentity.sanitize(career.myTeamIdentity);
    const winter = career.winterReport;
    if (winter && typeof winter === "object" && Number.isInteger(winter.year)) {
      const text = (v) => typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").slice(0, 120) : "";
      const stat = (v) => typeof v === "number" && Number.isFinite(v) ? Math.max(-100, Math.min(100, v)) : 0;
      career.winterReport = { year: winter.year, eraChanged: winter.eraChanged === true, explanation: typeof winter.explanation === "string" ? winter.explanation.slice(0, 500) : "", carBuildsChanged: winter.carBuildsChanged === true,
        team: winter.team && typeof winter.team === "object" ? { id: text(winter.team.id), before: stat(winter.team.before), after: stat(winter.team.after) } : null,
        drivers: rows(winter.drivers).slice(0, 2).map((d) => { const axes = {}; for (const key of ["pace", "craft", "awareness", "consistency", "experience"]) { const a = d.axes && d.axes[key] || {}; const before = stat(a.before), after = stat(a.after); axes[key] = { before, after, delta: after - before }; } return { code: text(d.code), name: text(d.name), player: d.player === true, axes }; }),
        teams: rows(winter.teams).slice(0, 3).map((t) => { const before = stat(t.before), after = stat(t.after); return { id: text(t.id), name: text(t.name), before, after, delta: after - before, rankBefore: Math.max(1, Math.min(30, finiteNumber(t.rankBefore) | 0)), rankAfter: Math.max(1, Math.min(30, finiteNumber(t.rankAfter) | 0)) }; }) };
    } else delete career.winterReport;
    return career;
  }

  function migrateSeasonPoints(_store, season) {
    if (!season) return season;
    remapPoints(season);
    return season;
  }

  // SaveSchemaRegistry career validator: clone before migrateCareer because the
  // ladder mutates in place and a validation pass must not touch live cache data.
  function validateCareerSave(v) {
    if (v == null) return true;
    if (typeof v !== "object" || Array.isArray(v)) return false;
    try {
      const c = JSON.parse(JSON.stringify(v));
      return migrateCareer(c) !== null;
    } catch (_) { return false; }
  }

  return { migrateCareer, migrateSeasonPoints, remapPoints, roundMap, finishMap, CAREER_V, tallyOf,
           careerVersion,
           validateCareerSave,
           LIMITS: Object.freeze({ TDEV_MAX: TDEV_LIMIT, DEV_MAX: DEV_LIMIT, EXP_MAX: EXP_LIMIT }) };
})();
Object.freeze(SaveMigrate);
