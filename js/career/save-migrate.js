"use strict";

const SaveMigrate = (function () {

  const CAREER_V = 2;
  const CAREER_MIGRATIONS = [
    (c) => { c.season = c.season || { round: 0, pts: {}, teamPts: {}, driverCodes: {} }; },
    (c) => { c.briefStake = null; c.sponsorPicks = {}; },
  ];

  function log(level, msg) { if (typeof Log !== "undefined") Log[level]("game", msg); }

  function scalarNumber(value) {
    if (value !== null && value !== undefined && typeof value !== "number"
        && typeof value !== "string" && typeof value !== "boolean") return NaN;
    return Number(value);
  }

  function finiteNumber(value) {
    const n = scalarNumber(value);
    return Number.isFinite(n) ? n : 0;
  }

  function careerVersion(value) {
    if (value === undefined) return 0;
    if (typeof value === "string") {
      if (!/^\d+$/.test(value)) return null;
      value = Number(value);
    }
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  const TDEV_LIMIT = 8;
  const DEV_LIMIT = 12;
  const EXP_LIMIT = 40;
  const FACILITY_LIMIT = 8;

  function clampTo(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  const MONEY_MAX = 1e9;
  const SALARY_MAX = 1e5;
  const salaryIn = (v) => clampTo(finiteNumber(v), 0, SALARY_MAX);

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

  function cleanOffer(o) {
    if ("years" in o) o.years = clampTo(Math.round(finiteNumber(o.years)), 1, 3);
    if ("salary" in o) o.salary = salaryIn(o.salary);
    return o;
  }

  function cleanResult(row) {
    if ("r" in row) row.r = Math.max(0, Math.trunc(finiteNumber(row.r)));
    if ("p" in row) row.p = Math.max(0, Math.trunc(finiteNumber(row.p)));
    if ("pts" in row) row.pts = Math.max(0, finiteNumber(row.pts));
    return row;
  }

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

  function roundMap(o) {
    const out = {};
    if (!o || typeof o !== "object") return out;
    for (const k of Object.keys(o)) {
      if (k === "__proto__" || !Array.isArray(o[k])) continue;
      out[k] = o[k].map((v) => {
        const n = typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN;
        return Number.isFinite(n) && n > 0 ? n : 0;
      });
    }
    return out;
  }
  function finishMap(o) {
    const out = {};
    if (!o || typeof o !== "object") return out;
    for (const k of Object.keys(o)) {
      if (k === "__proto__" || !Array.isArray(o[k])) continue;
      out[k] = o[k].map((v) => {
        const n = typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN;
        return Number.isInteger(n) && n > 0 ? n : 0;
      });
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

  function remapPoints(season) {
    if (!season) return season;
    season.round = Number.isInteger(season.round) && season.round >= 0 ? season.round : 0;
    const oldPts = season.pts && typeof season.pts === "object" && !Array.isArray(season.pts) ? season.pts : {};
    const roster = seasonRoster();
    const nextPts = {};
    const codes = season.driverCodes && typeof season.driverCodes === "object" && !Array.isArray(season.driverCodes)
      ? Object.assign({}, season.driverCodes) : {};
    Object.entries(oldPts).forEach(([key, value]) => {
      const driver = roster.find((candidate) => candidate.id === key || candidate.code === key);
      const id = driver ? driver.id : key;
      nextPts[id] = Math.min(Number.MAX_VALUE, (Object.hasOwn(nextPts, id) ? nextPts[id] : 0) + Math.max(0, finiteNumber(value)));
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

  function cleanDeal(deal) {
    if (!deal || typeof deal !== "object" || Array.isArray(deal)) return null;
    deal.salary = salaryIn(deal.salary);
    deal.bonusPt = finiteNumber(deal.bonusPt);
    deal.left = finiteNumber(deal.left);
    deal.years = finiteNumber(deal.years);
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

  function cleanParts(career) {
    if (typeof Parts === "undefined" || !Array.isArray(Parts.CATALOG) || !Parts.CATALOG.length) return;
    const byCategory = new Map();
    const all = new Set();
    const split = [];
    for (const cat of Parts.CATALOG) {
      if (!cat || typeof cat.id !== "string" || !Array.isArray(cat.options)) continue;
      const ids = new Set();
      for (const opt of cat.options) {
        if (!opt || typeof opt.id !== "string") continue;
        ids.add(opt.id); all.add(opt.id);
        if (typeof opt.own === "string" && opt.own !== opt.id) { all.add(opt.own); split.push(opt); }
      }
      byCategory.set(cat.id, ids);
    }
    const grantSplit = (out) => {
      for (const opt of split) if (out.includes(opt.id) && !out.includes(opt.own)) out.push(opt.own);
      return out;
    };
    career.owned = Array.isArray(career.owned) ? grantSplit(career.owned.filter((id, i, a) =>
      typeof id === "string" && all.has(id) && a.indexOf(id) === i)) : [];
    const bags = career.aiParts && typeof career.aiParts === "object" && !Array.isArray(career.aiParts) ? career.aiParts : {};
    for (const id of Object.keys(bags)) {
      const bag = bags[id];
      if (bag && typeof bag === "object" && Array.isArray(bag.owned)) grantSplit(bag.owned);
    }
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
    career.money = clampTo(finiteNumber(career.money), 0, MONEY_MAX);
    career.rep = Math.max(0, Math.min(100, finiteNumber(career.rep)));
    const driver = career.driver && typeof career.driver === "object" && !Array.isArray(career.driver)
      ? career.driver : {};
    driver.name = typeof driver.name === "string" && driver.name ? driver.name : "Your Name";
    driver.code = typeof driver.code === "string" && driver.code ? driver.code : "YOU";
    driver.num = typeof driver.num === "number" && Number.isFinite(driver.num)
      ? Math.max(0, Math.min(999, Math.trunc(driver.num))) : 99;
    career.driver = driver;
    career.team = typeof career.team === "string" && career.team ? career.team : (career.flavour === "myteam" ? "custom" : "haas");
    if (career.flavour === "driver" && typeof Teams !== "undefined" && Array.isArray(Teams.LIST) && Teams.isReal
        && !Teams.isReal(Teams.LIST.find((t) => t && t.id === career.team))) {
      log("warn", "Career save named an unknown team; seated at haas.");
      career.team = "haas";
      if (career.deal && typeof career.deal === "object") career.deal.team = "haas";
    }
    career.seat = career.flavour === "myteam" ? 0 : clampSeat(career.seat, career.team);
    career.deal = cleanDeal(career.deal);
    career.seed = finiteNumber(career.seed) | 0;
    const sz = career.season;
    career.season = remapPoints(sz && typeof sz === "object" && !Array.isArray(sz) ? sz : { round: 0, pts: {}, teamPts: {}, driverCodes: {} });
    delete career.season.config;
    career.owned = Array.isArray(career.owned) ? career.owned : [];
    career.fitted = career.fitted && typeof career.fitted === "object" ? career.fitted : {};
    cleanParts(career);
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
    career.objPick = career.objPick && typeof career.objPick === "object"
      && !Array.isArray(career.objPick) ? career.objPick : null;
    career.budgetLvl = Math.max(0, finiteNumber(career.budgetLvl) | 0);
    career.facility = clampTo(finiteNumber(career.facility) | 0, 0, FACILITY_LIMIT);
    career.moves = rows(career.moves);
    career.roster = Array.isArray(career.roster) ? rows(career.roster).map((d) => {
      d.salary = salaryIn(d.salary);
      d.left = finiteNumber(d.left);
      if (d.pending && typeof d.pending === "object" && !Array.isArray(d.pending)) d.pending.ask = salaryIn(d.pending.ask);
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

  function validateCareerSave(v) {
    if (v == null) return true;
    if (typeof v !== "object" || Array.isArray(v)) return false;
    try {
      const c = JSON.parse(JSON.stringify(v));
      return migrateCareer(c) !== null;
    } catch (_) { return false; }
  }

  return { migrateCareer, migrateSeasonPoints, remapPoints, roundMap, finishMap, CAREER_V,
           careerVersion,
           validateCareerSave,
           LIMITS: Object.freeze({ TDEV_MAX: TDEV_LIMIT, DEV_MAX: DEV_LIMIT, EXP_MAX: EXP_LIMIT, MONEY_MAX, SALARY_MAX, FACILITY_MAX: FACILITY_LIMIT }) };
})();
Object.freeze(SaveMigrate);
