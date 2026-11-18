/* Apex 26 — ENERGY PLAN (#1580): a manual, per-sector ERS deployment policy
 * for the local player.
 *
 * One policy per timing sector (c._secIdx 0..2):
 *   manual — the player's own BOOST toggle, untouched (the default; a plan of
 *            three MANUALs is exactly today's game);
 *   deploy — BOOST is switched ON as the car enters the sector;
 *   save   — BOOST is switched OFF as the car enters the sector (it harvests).
 *
 * The plan acts at most ONCE per sector entry (at the entry, or later in the
 * sector when a DEPLOY waited on a flat battery), and only by asking for the same
 * BOOST toggle a press makes (game.js reads `toggleFor` beside
 * Input.consumeBoostToggle). So the player can still press BOOST mid-sector
 * to override, the existing gates (battery, box, caution, pit limiter) still
 * decide whether a wish becomes deploy, and the input ghost records the flip
 * as an ordinary toggle, so a replay never needs the plan. Time trial ignores
 * the plan: a TT lap is the player's own run.
 * Reads no track curvature: the only track input is the timing-sector index.
 *
 * FORECAST (#1629): learn() folds each completed sector's net battery change
 * (the player's) into a mean/variance per (sector, boosted); forecast() walks the
 * plan and predicts each sector exit with a 0..1 confidence; setOverride() pins a
 * sector. Display/agent only: physics reads none of it.
 */
const EnergyPlan = (function () {
  "use strict";

  const KEY = "ersPlan";
  const POLICIES = Object.freeze(["manual", "deploy", "save"]);
  const NEUTRAL = Object.freeze(["manual", "manual", "manual"]);
  let current = NEUTRAL.slice();
  // Per car: the sector the plan last acted on (or found already satisfied),
  // so it fires at most once per entry.
  const seen = new WeakMap();
  const secE0 = new WeakMap();   // per car: battery at its sector start (#1629)

  /** A clean 3-entry plan, or null when `p` is not one. */
  function clean(p) {
    if (!Array.isArray(p) || p.length !== 3) return null;
    return p.every((v) => POLICIES.includes(v)) ? p.slice() : null;
  }
  function plan() { return current.slice(); }
  function isNeutral(p) { return (p || current).every((v) => v === "manual"); }
  /** Set the plan; an invalid one is refused (returns false) and the old plan stands. */
  function setPlan(p) {
    const c = clean(p);
    if (!c) return false;
    current = c;
    return true;
  }
  function fromStore(store) { if (!store || !setPlan(store.get(KEY, null))) current = NEUTRAL.slice(); return plan(); }

  /** Pure: does policy `pol` want the BOOST toggle flipped on entering a sector? */
  function wantsFlip(pol, boostOn, energy) {
    if (pol === "deploy") return !boostOn && energy > 0;
    if (pol === "save") return !!boostOn;
    return false;
  }

  /** Per step for the local player car: true on the step the plan flips BOOST. */
  function toggleFor(c, tt) {
    if (!c || tt) return false;
    const sec = c._secIdx;
    if (sec == null) return false;
    if (seen.get(c) === sec) return false;
    const pol = current[sec], on = !!c.boostOn;
    const flip = wantsFlip(pol, on, c.energy || 0);
    // Stamp only once the plan acts or its wish already holds (MANUAL, DEPLOY
    // with BOOST on, SAVE with it off). A DEPLOY a flat battery blocked at
    // entry stays pending and acts when charge returns, once, in that sector.
    if (flip || pol !== "deploy" || on) seen.set(c, sec);
    return flip;
  }

  // ---- forecast (#1629) ---- stats[sec][boosted] = {n, mean, m2} (Welford)
  let stats, override;
  function reset() { stats = [[null, null], [null, null], [null, null]]; override = [null, null, null]; }
  reset();
  function learn(sec, dE, boosted) {
    if (!(sec >= 0 && sec < 3) || !Number.isFinite(dE)) return false;
    const k = boosted ? 1 : 0, s = stats[sec][k] || (stats[sec][k] = { n: 0, mean: 0, m2: 0 });
    const d = dE - s.mean;
    s.n++; s.mean += d / s.n; s.m2 += d * (dE - s.mean);
    return true;
  }
  /** null clears the override. */
  function setOverride(sec, dE) {
    if (!(sec >= 0 && sec < 3) || (dE != null && !Number.isFinite(dE))) return false;
    override[sec] = dE == null ? null : dE;
    return true;
  }
  function sectorModel(sec, boosted) {
    if (override[sec] != null) return { mean: override[sec], conf: 1, n: 0, overridden: true };
    const s = stats[sec][boosted ? 1 : 0];
    if (!s) return { mean: 0, conf: 0, n: 0, overridden: false };
    const sd = s.n > 1 ? Math.sqrt(s.m2 / (s.n - 1)) : 0.1;   // 1 lap ~0.4, 3 tight laps ~0.77
    return { mean: s.mean, conf: Math.min(1, Math.max(0, (1 - Math.exp(-s.n / 2)) / (1 + 8 * sd))), n: s.n, overridden: false };
  }
  /** Battery at each sector exit from `fromSec`: {rows:[{sec,policy,boosted,start,end,conf}], end, conf (weakest)}. */
  function forecast(energy, fromSec, liveBoost, p) {
    const pl = clean(p) || current, rows = [];
    let e = Math.min(1, Math.max(0, +energy || 0)), conf = 1;
    for (let i = 0; i < 3; i++) {
      const sec = ((fromSec | 0) + i) % 3, pol = pl[sec];
      const boosted = pol === "deploy" || (pol !== "save" && !!(liveBoost && i === 0));
      const m = sectorModel(sec, boosted), start = e;
      e = Math.min(1, Math.max(0, e + m.mean));
      conf = Math.min(conf, m.conf);
      rows.push({ sec, policy: pol, boosted, start, end: e, conf: m.conf });
    }
    return { rows, end: e, conf };
  }
  /** game.js, the player at a sector change. A WeakMap, not a car field: cars sit at V8's fast-property cap. */
  function sectorExit(c, fwd, tt) {
    const e0 = secE0.get(c);
    if (fwd && !tt && e0 != null) learn(c._secIdx, c.energy - e0, !!c.boostOn);
    secE0.set(c, c.energy);
  }
  /** __apex.ersForecast; `o` = {override, reset}. */
  function report(c, o) {
    o = o || {};
    if (o.reset) reset();
    if (Array.isArray(o.override)) o.override.forEach((v, i) => setOverride(i, v));
    return { plan: plan(), energy: c ? c.energy : null, sector: c ? c._secIdx : null, forecast: forecast(c ? c.energy : 0, c && c._secIdx != null ? c._secIdx : 0, c && c.boostOn), learned: learned() };
  }
  function learned() { return stats.map((_, sec) => ({ sec, off: sectorModel(sec, false), on: sectorModel(sec, true), override: override[sec] })); }
  return Object.freeze({ KEY, POLICIES, NEUTRAL, clean, plan, setPlan, fromStore, isNeutral, wantsFlip, toggleFor, learn, setOverride, reset, forecast, learned, sectorExit, report });
})();
Object.freeze(EnergyPlan);
