const Regulations = (function () {
  "use strict";

  const ERA_SEASONS = 4;
  const BAN_TOP = 2;

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
  function eraIndexFor(seasonsElapsed) {
    const n = Math.max(0, Math.floor(seasonsElapsed) || 0);
    return Math.floor(n / ERA_SEASONS);
  }
  function eraFor(seasonsElapsed) { return eraAt(eraIndexFor(seasonsElapsed)); }
  function seasonsLeft(seasonsElapsed) {
    const n = Math.max(0, Math.floor(seasonsElapsed) || 0);
    return ERA_SEASONS - (n % ERA_SEASONS);
  }

  const _banCache = new Map();
  function tieHash(eraId, id) {
    let h = 0x811c9dc5;
    const str = eraId + ":" + id;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
  }
  const CLASS_STATS = ["speed", "accel", "cornering", "braking"];
  function classKey(o) {
    return [o.cost || 0, ...CLASS_STATS.map((k) => (o[k] != null ? o[k] : 1)),
      o.wetTread != null ? o.wetTread : "", o.life != null ? o.life : ""].join("|");
  }
  function classRep(opts) {
    const ids = opts.filter((o) => !o.equivalent).map((o) => o.id).sort();
    return ids.length ? ids[0] : opts.map((o) => o.id).sort()[0];
  }
  function bannedIds(eraId) {
    let set = _banCache.get(eraId);
    if (set) return set;
    set = new Set();
    const era = ERAS.find((e) => e.id === eraId);
    if (era && era.cats.length && typeof Parts !== "undefined") {
      for (const cat of Parts.CATALOG) {
        if (!era.cats.includes(cat.id)) continue;
        const classes = new Map();
        for (const o of cat.options) {
          if ((o.cost || 0) <= 0) continue;
          const k = classKey(o);
          if (!classes.has(k)) classes.set(k, []);
          classes.get(k).push(o);
        }
        const ranked = [...classes.values()].map((opts) => ({ opts, cost: opts[0].cost || 0, rep: classRep(opts) }))
          .sort((a, b) => b.cost - a.cost
            || tieHash(eraId, a.rep) - tieHash(eraId, b.rep) || (a.rep < b.rep ? -1 : a.rep > b.rep ? 1 : 0));
        for (const c of ranked.slice(0, BAN_TOP)) for (const o of c.opts) set.add(o.id);
      }
    }
    _banCache.set(eraId, set);
    return set;
  }
  function isLegal(optId, eraId) { return !bannedIds(eraId).has(optId); }
  function legalityFor(eraId) {
    const banned = bannedIds(eraId);
    return banned.size ? (opt) => !banned.has(opt.id) : null;
  }

  return {
    ERAS, ERA_SEASONS, BAN_TOP,
    eraFor, seasonsLeft, bannedIds, isLegal, legalityFor,
  };
})();
Object.freeze(Regulations);
