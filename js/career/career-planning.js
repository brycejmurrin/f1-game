/* Career planning: pure projections and bounded choices; never changes Parts legality. */
const CareerPlanning = (function () {
  "use strict";
  const STAKE = 50;
  const clone = (v) => v == null ? null : JSON.parse(JSON.stringify(v));
  function missing(c, list) {
    const ids = c && c.season && c.season.calIds;
    const known = new Set(list.map((t) => t.id));
    return Array.isArray(ids) ? ids.filter((id) => !known.has(id)) : [];
  }
  function protect(c, list) {
    if (!c) return false;
    if (typeof SaveMigrate !== "undefined" && c.v > SaveMigrate.CAREER_V) return true;
    const ids = c.season && c.season.calIds;
    if (!Object.prototype.hasOwnProperty.call(c.season || {}, "calIds")) return false; // Genuine older unstamped saves keep the legacy migration.
    return !Array.isArray(ids) || !ids.length || ids.length > 64 ||
      ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length || missing(c, list).length > 0;
  }
  function remapWeekend(c, oldRound, newRound) {
    const s = c.season;
    if (c.briefStake && c.briefStake.year === c.year && c.briefStake.round === oldRound) c.briefStake.round = newRound;
    if (c.objPick && c.objPick.round === oldRound) c.objPick.round = newRound; else c.objPick = null;
    c.obj = null;
    if (s.startedRound === oldRound || (c.briefStake && c.briefStake.round === newRound && c.briefStake.escrow === STAKE)) s.startedRound = newRound;
    else delete s.startedRound;
  }
  function create(ctx) {
    const c = () => ctx.data();
    const api = () => ctx.api();
    const key = (r) => c().year + ":" + r;
    function stake(r) {
      const p = c() && c().briefStake;
      return p && p.year === c().year && p.round === r && p.committed ? STAKE : 0;
    }
    function chooseStake(committed) {
      if (!c() || ctx.blocked() || api().objectiveLocked() || api().seasonDone()) return false;
      if (committed && !api().freeMoney() && c().money < STAKE) return false;
      c().briefStake = { year: c().year, round: c().season.round, committed: !!committed, escrow: 0 };
      ctx.save(); return api().saveStatus().ok;
    }
    function escrow(r) {
      if (!stake(r) || ctx.blocked()) return 0;
      const p = c().briefStake;
      if (p.escrow === STAKE) return STAKE;
      if (!api().freeMoney() && c().money < STAKE) { p.committed = false; return 0; }
      c().money -= api().freeMoney() ? 0 : STAKE;
      p.escrow = STAKE;
      return STAKE;
    }
    function comparison() {
      const raw = ctx.raw();
      let stored = null;
      try { stored = JSON.parse(raw); } catch (_) { /* unreadable disk remains exportable */ }
      const summary = (v) => v ? { year: v.year, team: v.team, round: v.season && v.season.round,
        money: v.money, rep: v.rep, results: (v.results || []).length } : null;
      return { local: clone(c()), stored, rawStored: raw, rawLocal: ctx.protection() ? ctx.protection().raw : JSON.stringify(c()),
        localSummary: summary(c()), storedSummary: summary(stored), revision: ctx.revision(), armedRevision: ctx.armed() };
    }
    function factory() {
      if (!c()) return null;
      const level = api().facility();
      const team = Teams.LIST.find((t) => t.id === c().team);
      let savings = 0, count = 0;
      for (const cat of (Parts.CATALOG || [])) for (const opt of cat.options) {
        if ((!opt.cost || (c().owned || []).includes(opt.id)) || (Parts.isOptionAvailable && !Parts.isOptionAvailable(opt, team))) continue;
        const current = Math.round((opt.cost || 0) * 3 * (1 - Math.min(0.4, level * 0.05)));
        const next = Math.round((opt.cost || 0) * 3 * (1 - Math.min(0.4, (level + 1) * 0.05)));
        savings += current - next; count++;
      }
      return { savings, count, cost: api().facilityCost(), unlimited: api().freeMoney() };
    }
    function cash(price = 0, proposedWages) {
      if (!c()) return null;
      const unlimited = api().freeMoney();
      const wages = c().flavour === "myteam" ? (proposedWages == null
        ? (c().roster || []).reduce((n, d) => n + (Number(d.salary) || 0), 0) : Math.max(0, proposedWages)) : 0;
      const afterPurchase = c().money - (unlimited ? 0 : Math.max(0, Number(price) || 0));
      const cars = c().flavour === "myteam" ? 2 : 1;
      return { afterPurchase, wages, low: Math.max(0, afterPurchase - wages),
        high: Math.max(0, afterPurchase + api().prizeFor(1) * cars - wages), unlimited };
    }
    function transition() {
      if (!c() || typeof Regulations === "undefined") return null;
      const elapsed = api().seasonsElapsed();
      const next = Regulations.eraFor(elapsed + Regulations.seasonsLeft(elapsed));
      const banned = Regulations.bannedIds(next.id);
      const team = Teams.LIST.find((t) => t.id === c().team);
      const changes = [];
      for (const cat of (Parts.CATALOG || [])) {
        const opt = cat.options.find((o) => o.id === c().fitted[cat.id]);
        if (!opt || !banned.has(opt.id)) continue;
        // Same equivalent/default fallback order as Parts._resolve; explicit future filter.
        const available = (o) => o && !banned.has(o.id) && (!(o.teams || (o.team ? [o.team] : null)) || (o.teams || [o.team]).includes(team && team.id)) &&
          (!(o.suppliers || (o.supplier ? [o.supplier] : null)) || (o.suppliers || [o.supplier]).includes(team && team.engine));
        const equivalent = cat.options.find((o) => o.id === opt.equivalent);
        const replacement = available(equivalent) ? equivalent
          : cat.options.find((o) => o.id === Parts.DEFAULTS[cat.id]) || cat.options[0];
        changes.push({ category: cat.label || cat.id, from: opt.label || opt.id,
          to: replacement.label || replacement.id, replacement: replacement.id, cost: 0 });
      }
      return { name: next.name, seasons: Regulations.seasonsLeft(elapsed), changes };
    }
    function sponsorOffers() {
      const sp = api().sponsor();
      if (!sp || !c()) return [];
      // Derive both from original seed selection. Never temporarily mutate a live pick.
      const picks = c().sponsorPicks || {};
      const chosen = picks[key(sp.idx)] === 1 ? 1 : 0;
      let start = 0, idx = 0, kind;
      while (start <= c().season.round) {
        kind = api().SPONSOR_KINDS[Math.min(api().SPONSOR_KINDS.length - 1,
          Math.floor(api().rnd(c().year, "spon", idx) * api().SPONSOR_KINDS.length))];
        if (start + kind.window > c().season.round) break;
        start += kind.window; idx++;
      }
      const team = Teams.LIST.find((t) => t.id === c().team) || { tier: 2 };
      return [kind, api().SPONSOR_KINDS[(api().SPONSOR_KINDS.indexOf(kind) + 1) % api().SPONSOR_KINDS.length]].map((k, i) => {
        const value = k.type === "clean" ? sp.window : Math.max(1, Math.ceil(k.value(team) * sp.window / k.window));
        return { i, chosen: i === chosen, type: k.type, value, window: sp.window,
          pay: Math.round(k.pay * sp.window / k.window), label: api().sponsorLabel({ type: k.type, value, window: sp.window }) };
      });
    }
    function chooseSponsor(i) {
      const sp = api().sponsor();
      if (!c() || ctx.blocked() || !sp || c().season.round !== sp.start || api().objectiveLocked() || (i !== 0 && i !== 1)) return false;
      c().sponsorPicks = c().sponsorPicks || {};
      c().sponsorPicks[key(sp.idx)] = i;
      ctx.save(); return api().saveStatus().ok;
    }
    function lastSponsor() {
      if (!c() || !c().season.round) return null;
      const sp = api().sponsorAt(c().season.round - 1);
      return sp && sp.end === c().season.round - 1 && (c().paidSponsors || []).includes(sp.idx) ? sp : null;
    }
    return { protection: ctx.protection, adopt: ctx.adopt, comparison, factory, cash, transition,
      stake, chooseStake, escrow, sponsorOffers, chooseSponsor, lastSponsor };
  }
  return { create, protect, missing, remapWeekend, STAKE };
})();
Object.freeze(CareerPlanning);
