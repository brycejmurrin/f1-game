/* Apex 26 — ProgressBackup: the `progress` section of the SAVES & DATA settings file (#5992).
   Six kinds of player progress were in no export: the standalone season setup (seasonCfg),
   circuit mastery, ghosts (ghost.v1), the onboarding marks (onboarded + onboardRaces, pitTaught)
   and the player's own circuits (customTracks, carried in their own `apex26.tracks` collection
   format). collect() reads them; apply() MERGES, never overwriting progress blindly:
   - seasonCfg: the file's setup wins (normalized by SeasonCal when it is loaded);
   - circuitMastery: per entry key, the better best and the larger completed count;
   - ghosts: per circuit/context id, the faster valid trace, inside Ghost's 512 KiB budget;
   - onboarding: a mark seen on either device stays seen;
   - circuits: CustomTracks.importCollection (validated, existing designs win).
   Old settings files without `progress` still import. Career, the season save itself, photos and
   replays are not here. Needs GameStore at call time; SeasonCal and CustomTracks are optional. */
const ProgressBackup = (function () {
"use strict";

const GHOST_KEY = "ghost.v1", GHOST_MAX_BYTES = 512 * 1024, GHOST_MIN_SAMPLES = 8;
const MASTERY_MAX = 63;   // js/race/race-insights.js keeps the last 63 entries
const ID_RE = /^[\x20-\x7E]{1,256}$/;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const nonNegInt = (v) => Number.isInteger(v) && v >= 0;
const store = () => (typeof GameStore !== "undefined" && GameStore.store) || null;
const clone = (v) => JSON.parse(JSON.stringify(v));

// The same validity rule as js/car/ghost.js valid(): a finite positive time and
// three equal-length monotone sample arrays.
function ghostOk(g) {
  if (!isObj(g) || !(g.time > 0) || !Number.isFinite(g.time)) return false;
  const { t, s, x } = g;
  if (!Array.isArray(t) || !Array.isArray(s) || !Array.isArray(x) || s.length < GHOST_MIN_SAMPLES
    || t.length !== s.length || x.length !== s.length) return false;
  for (let i = 0; i < t.length; i++) {
    if (!Number.isFinite(t[i]) || !Number.isFinite(s[i]) || !Number.isFinite(x[i]) || t[i] < 0) return false;
    if (i && (t[i] < t[i - 1] || s[i] < s[i - 1])) return false;
  }
  return true;
}
function masteryOk(e) {
  // RaceInsights negates places gained, metres closed and seconds defended so lower is better.
  return isObj(e) && typeof e.key === "string" && e.key.length <= 512 && Number.isFinite(e.best)
    && (e.best >= 0 || /:(?:start|slipstream|defend):all$/.test(e.key));
}
function masteryEntries(raw) {
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.entries)) return [];
  // Fold a single device's old tune classes before comparing devices by max completed.
  return RaceInsights.normalizeMasteryEntries(raw.entries.filter(masteryOk).map(e =>
    nonNegInt(e.completed) ? e : { ...e, completed: 0 }));
}

function collect() {
  const s = store();
  if (!s) return {};
  const out = {};
  const season = s.get("seasonCfg", null);
  if (isObj(season)) out.seasonCfg = clone(season);
  const mastery = masteryEntries(s.get("circuitMastery", null));
  if (mastery.length) out.circuitMastery = { version: 1, entries: clone(mastery) };
  const ghosts = s.get(GHOST_KEY, null);
  if (isObj(ghosts)) {
    const keep = {};
    for (const [id, g] of Object.entries(ghosts)) if (ID_RE.test(id) && ghostOk(g)) keep[id] = g;
    if (Object.keys(keep).length) out.ghosts = clone(keep);
  }
  for (const k of ["onboarded", "onboardRaces", "pitTaught"]) {
    const v = s.get(k, null);
    if (nonNegInt(v) && v > 0) out[k] = v;
  }
  if (typeof CustomTracks !== "undefined" && CustomTracks.exportCollection) {
    try {
      const c = CustomTracks.exportCollection();
      if (c && Array.isArray(c.items) && c.items.length) out.circuits = clone(c);
    } catch (_) { /* a broken registry exports nothing rather than failing the file */ }
  }
  return out;
}

function apply(bag) {
  const r = { applied: 0, skipped: 0, rejected: 0, failed: 0 };
  const s = store();
  if (!isObj(bag) || !s) return r;
  // GameStore retains refused writes in memory. A matching merge must still reach disk before reload.
  const pending = new Set(s.failedKeys ? s.failedKeys().map((f) => f.key) : []);
  const put = (k, v) => {
    let res;
    try { res = s.write ? s.write(k, v) : { durable: s.set(k, v) }; } catch (_) { res = null; }
    if (res && res.durable) r.applied++; else r.failed++;
  };

  if ("seasonCfg" in bag) {
    let v = bag.seasonCfg;
    if (isObj(v) && typeof SeasonCal !== "undefined" && SeasonCal.normalize) {
      try { v = SeasonCal.normalize(v); } catch (_) { v = null; }
    }
    if (isObj(v)) put("seasonCfg", clone(v)); else r.rejected++;
  }

  if ("circuitMastery" in bag) {
    const incoming = masteryEntries(bag.circuitMastery);
    if (!incoming.length) r.rejected++;
    else {
      const local = masteryEntries(s.get("circuitMastery", null));
      const byKey = new Map(local.map((e) => [e.key, clone(e)]));
      let moved = false;
      for (const e of incoming) {
        const have = byKey.get(e.key);
        const completed = nonNegInt(e.completed) ? e.completed : 0;
        if (!have) { byKey.set(e.key, { key: e.key, best: e.best, completed: Math.min(9999, completed) }); moved = true; continue; }
        const best = Math.min(have.best, e.best), done = Math.min(9999, Math.max(nonNegInt(have.completed) ? have.completed : 0, completed));
        if (best !== have.best || done !== have.completed) { have.best = best; have.completed = done; moved = true; }
      }
      if (moved || pending.has("circuitMastery")) put("circuitMastery", { version: 1, entries: Array.from(byKey.values()).slice(-MASTERY_MAX) });
      else r.skipped++;
    }
  }

  if ("ghosts" in bag) {
    if (!isObj(bag.ghosts)) r.rejected++;
    else {
      const local = s.get(GHOST_KEY, null);
      const merged = isObj(local) ? clone(local) : {};
      let moved = false;
      for (const [id, g] of Object.entries(bag.ghosts)) {
        if (!ID_RE.test(id) || !ghostOk(g)) { r.rejected++; continue; }
        const have = merged[id];
        if (ghostOk(have) && have.time <= g.time) {
          // Retry the merged map once, preserving the faster session lap.
          if (!moved && pending.has(GHOST_KEY)) moved = true;
          else r.skipped++;
          continue;
        }
        const next = Object.assign({}, merged, { [id]: clone(g) });
        if (JSON.stringify(next).length * 2 > GHOST_MAX_BYTES) { r.skipped++; continue; }   // local ghosts keep the budget
        merged[id] = next[id]; moved = true;
      }
      if (moved) put(GHOST_KEY, merged);
    }
  }

  const flag = (k, merge) => {
    if (!(k in bag)) return;
    const v = bag[k];
    if (!nonNegInt(v)) { r.rejected++; return; }
    const have = s.get(k, 0), cur = nonNegInt(have) ? have : 0, next = merge(cur, v);
    if (next === cur && !pending.has(k)) r.skipped++; else put(k, next);
  };
  flag("onboarded", (a, b) => (a | b) >>> 0);
  flag("onboardRaces", (a, b) => Math.max(a, b));
  flag("pitTaught", (a, b) => (Math.max(a, b) ? 1 : 0));

  if ("circuits" in bag) {
    if (typeof CustomTracks === "undefined" || !CustomTracks.importCollection) r.skipped++;
    else {
      let res = null;
      try { res = CustomTracks.importCollection(bag.circuits); } catch (_) { res = null; }
      if (!res || !res.ok) r.rejected++;
      else if (!res.durable) r.failed++;
      else if (res.added || res.retried) r.applied++;
      else r.skipped++;
    }
  }
  return r;
}

return Object.freeze({ collect, apply, ghostOk });
})();
