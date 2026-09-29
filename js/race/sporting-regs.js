/* Apex 26 — SPORTING REGULATIONS the player is held to, as pure rules.
 *
 * Three 2026 articles the AI already obeyed by construction and the player
 * could ignore for free. Each is a small rule over car state, so it lives here
 * rather than in game.js (ratcheted) and is unit-tested without a browser:
 *
 *  1. TWO DRY COMPOUNDS (FIA 2026 SR B6.3.6). A dry Race must use at least two
 *     different dry specifications; breaking it is a disqualification, or 30 s
 *     when the race was suspended and not resumed. Whether the rule APPLIES
 *     (race length, dry, not a sprint, pits available) is PitLane's
 *     twoCompoundRule — one test, shared with the AI's planner.
 *  2. NO PASSING UNDER THE SAFETY CAR OR VSC (B5.12.2(c), B5.13.2(c)). A place
 *     gained under a caution must be given back; the 2026 Penalty Guidelines
 *     price one kept place at 10 s. Two and more are priced here at a
 *     drive-through and a stop-and-go equivalent (20 s / 30 s) — the game has
 *     no served penalties, only time added at the flag. A car that is retired,
 *     finished or in the pit lane is fair game (the regs' own exceptions), and
 *     a place TAKEN BACK from a car that passed you under the caution is not a
 *     new offence. A lapped car never changes places here: order is by
 *     cumulative progress, so lapping is not a position change.
 *  3. GRID IN CHAMPIONSHIP ORDER when no qualifying is held (B2.5.4(a),
 *     B2.3.4(a)). Before anyone has scored there is no order to use, and the
 *     caller keeps its own default; drivers still on zero keep the pace order.
 *
 * Sources: FIA 2026 F1 Sporting Regulations, Section B, Issue 07 (2026-06-25),
 *   https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf
 * and the 2026 Penalty Guidelines,
 *   https://www.fia.com/sites/default/files/2026_f1_penalty_guidelines.pdf
 *
 * Deterministic: no clock, no RNG. Writes nothing but what a caller hands it.
 */
const SportingRegs = (function () {
  "use strict";

  // ── 1. TWO DRY COMPOUNDS ────────────────────────────────────────────────
  // The HUD letter IS the compound class (TyreModel.codeForLife): S/M/H are the
  // dry specifications, I/W the wet ones. The stint log (TyreModel.fit) is the
  // one record of what a car actually ran, grid set included.
  const DRY = ["S", "M", "H"];
  const WET = ["I", "W"];
  const SUSPENDED_PEN_S = 30;
  const DSQ_WHY = "one dry compound";

  /** {dry: distinct dry compounds run, wet: any intermediate/wet set run}. */
  function compoundsRun(log) {
    const seen = new Set();
    let wet = false;
    for (const e of Array.isArray(log) ? log : []) {
      const code = e && e.code;
      if (DRY.indexOf(code) >= 0) seen.add(code);
      else if (WET.indexOf(code) >= 0) wet = true;
    }
    return { dry: seen.size, wet };
  }
  /** True when this log breaks B6.3.6: fewer than two dry compounds and no
   *  wet-weather set (running one lifts the obligation). */
  function compoundShort(log) {
    const r = compoundsRun(log);
    return !r.wet && r.dry < 2;
  }
  /** The verdict for ONE car at the flag: null, {dsq}, or {penaltyS}.
   *  `o.applies`: the race is one the rule covers; `o.suspended`: it ended
   *  under a red flag and was not resumed. A retired car is not judged — it
   *  was never going to make the stop it had planned. */
  function compoundVerdict(c, o) {
    if (!c || !o || !o.applies || c.retired) return null;
    if (!compoundShort(c.tyreLog)) return null;
    return o.suspended ? { penaltyS: SUSPENDED_PEN_S } : { dsq: DSQ_WHY };
  }
  /** Apply the verdict to every car: `c.dsq` names the reason, a suspended
   *  race adds the time instead. Returns the disqualified cars. */
  function applyCompoundRule(cars, o) {
    const out = [];
    for (const c of cars || []) {
      if (c) delete c.dsq;
      const v = compoundVerdict(c, o);
      if (!v) continue;
      if (v.dsq) { c.dsq = v.dsq; out.push(c); }
      else c.penalty = (c.penalty || 0) + v.penaltyS;
    }
    return out;
  }

  // ── 2. NO PASSING UNDER A CAUTION ───────────────────────────────────────
  const GIVE_BACK_S = 5;
  const CAUTION_MIN = 2;   // RaceControl levels: 2 VSC, 3 SC, 4 red
  /** Seconds for places kept: 10 for one, a drive-through (20) for two, a
   *  stop-and-go equivalent (30) for more. */
  function passPenaltyS(n) { return n <= 0 ? 0 : n === 1 ? 10 : n === 2 ? 20 : 30; }
  const inPit = (c) => !!(c && c.pitState && c.pitState !== "none");
  /** A car it is legal to pass under a caution. */
  function exempt(o) { return !o || !!o.retired || !!o.finished || inPit(o); }

  /** One watcher per race, for ONE car (the local player). tick() returns an
   *  event or null: {type:"warn", n} when a place is gained (the window
   *  opens), {type:"cleared"} when every place is back, {type:"penalty", n,
   *  sec} when the window runs out. Allocation-free per tick. */
  function createPassWatch(windowS) {
    const WIN = windowS > 0 ? windowS : GIVE_BACK_S;
    let ahead = new Set(), now = new Set(), primed = false;
    const owed = [], lostTo = [];
    let t = 0;
    function reset() { ahead.clear(); now.clear(); primed = false; owed.length = 0; lostTo.length = 0; t = 0; }
    function drop(list, o) { const i = list.indexOf(o); if (i >= 0) list.splice(i, 1); }
    function tick(p, field, level, dt) {
      if (!p) { reset(); return null; }
      now.clear();
      for (const o of field || []) if (o && o !== p && !o.retired && o.prog > p.prog) now.add(o);
      let ev = null, gained = false;
      const caution = level >= CAUTION_MIN && !p.finished && !p.retired && !inPit(p);
      if (primed && caution) {
        for (const o of ahead) {
          if (now.has(o) || exempt(o)) continue;
          if (lostTo.indexOf(o) >= 0) { drop(lostTo, o); continue; }   // taking back what was taken
          if (owed.indexOf(o) < 0) { owed.push(o); gained = true; }
        }
        // A car that came past US under the caution: re-passing it is not an offence.
        for (const o of now) if (!ahead.has(o) && !exempt(o) && owed.indexOf(o) < 0 && lostTo.indexOf(o) < 0) lostTo.push(o);
      }
      if (level < CAUTION_MIN) lostTo.length = 0;
      if (owed.length) {
        if (!p.finished) for (let i = owed.length - 1; i >= 0; i--) if (now.has(owed[i]) || owed[i].retired) owed.splice(i, 1);
        if (gained) {
          if (!(t > 0)) t = WIN;
          ev = { type: "warn", n: owed.length };
        }
        if (!owed.length) { t = 0; ev = { type: "cleared" }; }
        // FINISHED WITH PLACES OWED: the give-back window can no longer run
        // (the result countdown is shorter than it), and a passed car coasting
        // by the finished player must not clear the debt. Charge it now.
        else if (p.finished || (t -= dt) <= 0) {
          const n = owed.length;
          owed.length = 0; t = 0;
          ev = { type: "penalty", n, sec: passPenaltyS(n) };
        }
      } else t = 0;
      const sw = ahead; ahead = now; now = sw;
      primed = true;
      return ev;
    }
    function info() { return { owed: owed.length, t: +Math.max(0, t).toFixed(2) }; }
    return { tick, reset, info };
  }

  // ── 3. CHAMPIONSHIP-ORDER GRID ─────────────────────────────────────────
  /** Cars in championship order, or null when nobody has scored (the caller's
   *  default grid stands). `cmp(idA, idB)` is the standings comparator
   *  (SeasonCal.rank), `ptsOf(id)` the points it ranks. Drivers on zero keep
   *  the pace order (`tier`, then driverId) behind every scorer. */
  function champOrder(cars, cmp, ptsOf) {
    const list = Array.isArray(cars) ? cars : [];
    const scored = list.filter((c) => (ptsOf(c.driverId) || 0) > 0);
    if (!scored.length) return null;
    const rest = list.filter((c) => !((ptsOf(c.driverId) || 0) > 0));
    scored.sort((a, b) => cmp(a.driverId, b.driverId));
    rest.sort((a, b) => ((a.tier || 0) - (b.tier || 0)) || (String(a.driverId) < String(b.driverId) ? -1 : 1));
    return scored.concat(rest);
  }

  return Object.freeze({
    compoundsRun, compoundShort, compoundVerdict, applyCompoundRule,
    passPenaltyS, exempt, createPassWatch, champOrder,
    DRY, WET, SUSPENDED_PEN_S, DSQ_WHY, GIVE_BACK_S, CAUTION_MIN,
  });
})();
