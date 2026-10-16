/* Apex 26 — SPORTING REGULATIONS the player is held to, as pure rules.
 *
 * Four 2026 articles the AI already obeyed by construction and the player
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
 *     finished or in the pit lane is fair game (the regs' own exceptions), so
 *     is one slowed or stopped by an obvious problem (the caller's `troubled`
 *     predicate: an incident takeover, a car stuck or beached), and
 *     a place TAKEN BACK from a car that passed you under the caution is not a
 *     new offence. A lapped car never changes places here: order is by
 *     cumulative progress, so lapping is not a position change.
 *  3. GRID IN CHAMPIONSHIP ORDER when no qualifying is held (B2.5.4(a),
 *     B2.3.4(a)). Before anyone has scored there is no order to use, and the
 *     caller keeps its own default; drivers still on zero keep the pace order.
 *  4. FALSE START at a standing start (FIA 2026 SR B5.11.1): the grid holds the
 *     car until lights-out; a breach is throttle already engaged at the green
 *     (clutch-style early release) or meaningful speed before the minimum human
 *     reaction window (~0.2 s). Priced at +5 s (2026 Penalty Guidelines).
 *  5. BLUE FLAGS for a car being lapped (ISC App. H 2.5.5(e), App. L Ch. IV
 *     2(a); 2026 Driving Standards §K; Penalty Guidelines Flag Signals). The
 *     caught driver must let the lapping car through at the first opportunity;
 *     §K treats failing to do so by the next straight as a likely breach, and
 *     eight consecutive light panels as almost certain. The 2026 Penalty
 *     Guidelines price a race breach at 5 s / 10 s / drive-through (0 pts) —
 *     the game has no served penalties, so the first sustained hold-up is +5 s
 *     at the flag after a warning, one penalty per blue-flag episode.
 *
 * OVERALL SPEED: any speed or gap threshold here is a fraction of the caller's
 * envelope (`vRef` = vTop()) or a TIME gap (metres / max(speed, floor·vRef)).
 * Never a literal m/s — PACE is a ground-speed scale, so a raw 9 m/s gate would
 * fire at every OVERALL SPEED setting differently.
 *
 * Sources: FIA 2026 F1 Sporting Regulations, Section B, Issue 07 (2026-06-25),
 *   https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf
 * the 2026 Penalty Guidelines,
 *   https://www.fia.com/sites/default/files/2026_f1_penalty_guidelines.pdf
 * and the 2026 Driving Standards Guidelines §K (Blue Flags),
 *   https://api.fia.com/sites/default/files/2026_f1_driving_standards_guidelines.pdf
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
   *  sec} when the window runs out. Allocation-free per tick. `troubled(o)`,
   *  optional, names a car slowed by an obvious problem — passing it is legal,
   *  and it is read at the moment of the pass. */
  function createPassWatch(windowS, troubled) {
    const WIN = windowS > 0 ? windowS : GIVE_BACK_S;
    const fair = typeof troubled === "function" ? (o) => exempt(o) || !!troubled(o) : exempt;
    let ahead = new Set(), now = new Set(), primed = false, finished = false;
    const owed = [], lostTo = [];
    let t = 0;
    function reset() { ahead.clear(); now.clear(); primed = false; finished = false; owed.length = 0; lostTo.length = 0; t = 0; }
    function drop(list, o) { const i = list.indexOf(o); if (i >= 0) list.splice(i, 1); }
    function tick(p, field, level, dt) {
      if (!p) { reset(); return null; }
      now.clear();
      const finishPass = p.finished && !finished;
      for (const o of field || []) {
        if (!o || o === p || o.retired) continue;
        const aheadNow = finishPass && o.finished && (o.lap || 0) === (p.lap || 0)
          && Number.isFinite(p.finishT) && Number.isFinite(o.finishT)
          ? o.finishT < p.finishT : o.prog > p.prog;
        if (aheadNow) now.add(o);
      }
      let ev = null, gained = false;
      // The first finished sample still contains the final racing step. A
      // pass made on that step must be charged before post-flag coasting.
      const caution = level >= CAUTION_MIN && !finished && !p.retired && !inPit(p);
      if (primed && caution) {
        for (const o of ahead) {
          // Two cars can take the flag in this same sample: the later finisher
          // was still racing when passed, not an already-finished exemption.
          const justBehind = finishPass && o.finished && (o.lap || 0) === (p.lap || 0) && !o.retired && !inPit(o)
            && Number.isFinite(p.finishT) && o.finishT >= p.finishT && !(typeof troubled === "function" && troubled(o));
          if (now.has(o) || (fair(o) && !justBehind)) continue;
          if (lostTo.indexOf(o) >= 0) { drop(lostTo, o); continue; }   // taking back what was taken
          if (owed.indexOf(o) < 0) { owed.push(o); gained = true; }
        }
        // A car that came past US under the caution: re-passing it is not an offence.
        for (const o of now) if (!ahead.has(o) && !fair(o) && owed.indexOf(o) < 0 && lostTo.indexOf(o) < 0) lostTo.push(o);
      }
      if (level < CAUTION_MIN) lostTo.length = 0;
      if (owed.length) {
        if (!p.finished) for (let i = owed.length - 1; i >= 0; i--) if (now.has(owed[i]) || exempt(owed[i])) owed.splice(i, 1);
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
      primed = true; finished = !!p.finished;
      return ev;
    }
    /** The open give-back window, for the HUD's flag chip: places owed, the
     *  seconds left, and the code of the first car to let by (null if none). */
    function info() { return { owed: owed.length, t: +Math.max(0, t).toFixed(2), code: owed.length ? owed[0].code || null : null }; }
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

  // ── 4. BLUE FLAGS (being lapped) ───────────────────────────────────────
  // Time gap that shows the flag (same window as HudReadouts.BLUE_S). Floor is
  // a fraction of vRef so the gate rides OVERALL SPEED with the HUD.
  const BLUE_GAP_S = 1.2;
  const BLUE_VFLOOR = 0.26;          // · vRef — matches hud.js's G.vTop() * 0.26
  // §K: breach almost certain after 8 consecutive light panels. Without a
  // marshalling board we count sustained hold-up TIME at that scale: warn at
  // half (4 s), then +5 s (Penalty Guidelines race tariff, first step) at 8 s.
  const BLUE_WARN_S = 4;
  const BLUE_HOLD_S = 8;
  const BLUE_PEN_S = 5;

  // ── 5. FALSE START (standing start, at lights-out) ───────────────────────
  // The grid holds cars until green; detection is throttle-at-green or a launch
  // faster than the minimum reaction window (fraction of vRef, not literal m/s).
  const JUMP_START_PEN_S = 5;
  const JUMP_START_WHY = "false start";
  const JUMP_START_THROTTLE = 0.12;
  const JUMP_START_REACT_S = 0.2;
  const JUMP_START_SPEED_VREF = 0.04;

  /** Throttle already engaged when the lights go out (auto-throttle exempt). */
  function jumpStartEarlyThrottle(throttleLevel, autoThrottleOn) {
    if (autoThrottleOn) return false;
    const t = typeof throttleLevel === "number" && isFinite(throttleLevel) ? throttleLevel : 0;
    return t > JUMP_START_THROTTLE;
  }

  /** Meaningful speed inside the minimum reaction window after green. */
  function jumpStartFastLaunch(tSinceGreen, speed, vRef) {
    if (!(vRef > 0) || !(tSinceGreen >= 0) || tSinceGreen >= JUMP_START_REACT_S) return false;
    const v = typeof speed === "number" && isFinite(speed) ? speed : 0;
    return v > vRef * JUMP_START_SPEED_VREF;
  }

  /** The lapping car the blue flag is shown for, or null. `o.total` is lap
   *  length, `o.vRef` the envelope (vTop). Time gap, never a literal m/s. */
  function blueFlagCar(p, field, o) {
    if (!p || !o || !(o.total > 0) || !(o.vRef > 0)) return null;
    if (p.finished || p.retired || inPit(p)) return null;
    const L = o.total, floor = o.vRef * BLUE_VFLOOR;
    let best = null, bestD = Infinity;
    for (const c of field || []) {
      if (!c || c === p || c.retired || c.finished || inPit(c)) continue;
      const up = (c.prog || 0) - (p.prog || 0);
      if (!(up > L * 0.5)) continue;
      const back = (((p.prog || 0) - (c.prog || 0)) % L + L) % L;
      if (!(back > 0) || back >= bestD) continue;
      if (back / Math.max(c.speed || 0, floor) <= BLUE_GAP_S) { best = c; bestD = back; }
    }
    return best;
  }

  /** One watcher per race, for the local player. tick() returns an event or
   *  null: {type:"warn", code} once the blue has been held past BLUE_WARN_S,
   *  {type:"penalty", sec, code} once past BLUE_HOLD_S. Hold time is per
   *  lapping car (a new lapper restarts the clock, #2163); the penalty latches
   *  for the whole unbroken blue spell, so a train of lappers charges one.
   *  `ctx`: {total, vRef, caution, race}. Exemptions: caution (SC/VSC/red),
   *  pit lane / finished / retired (on either car), quali/TT (`race` false),
   *  and a player the caller's `troubled` predicate names (stuck / stricken). */
  function createBlueFlagWatch(troubled) {
    const bad = typeof troubled === "function" ? troubled : () => false;
    let hold = 0, warned = false, pen = false, code = null, who = null;
    function reset() { hold = 0; warned = false; pen = false; code = null; who = null; }
    function tick(p, field, ctx, dt) {
      if (!p || !ctx || !ctx.race || p.finished || p.retired || inPit(p)
          || (ctx.caution | 0) >= CAUTION_MIN || bad(p)) {
        reset();
        return null;
      }
      const lapper = blueFlagCar(p, field, ctx);
      if (!lapper) { reset(); return null; }
      if (who !== lapper) { hold = 0; warned = false; who = lapper; }
      code = lapper.code || null;
      hold += dt > 0 ? dt : 0;
      if (!warned && hold >= BLUE_WARN_S) {
        warned = true;
        return { type: "warn", code };
      }
      if (!pen && hold >= BLUE_HOLD_S) {
        pen = true;
        return { type: "penalty", sec: BLUE_PEN_S, code };
      }
      return null;
    }
    function info() {
      return { hold: +Math.max(0, hold).toFixed(2), warned, pen, code };
    }
    return { tick, reset, info };
  }

  return Object.freeze({
    compoundsRun, compoundShort, compoundVerdict, applyCompoundRule,
    passPenaltyS, exempt, createPassWatch, champOrder,
    blueFlagCar, createBlueFlagWatch,
    DRY, WET, SUSPENDED_PEN_S, DSQ_WHY, GIVE_BACK_S, CAUTION_MIN,
    BLUE_GAP_S, BLUE_VFLOOR, BLUE_WARN_S, BLUE_HOLD_S, BLUE_PEN_S,
    jumpStartEarlyThrottle, jumpStartFastLaunch,
    JUMP_START_THROTTLE, JUMP_START_REACT_S, JUMP_START_SPEED_VREF,
    JUMP_START_PEN_S, JUMP_START_WHY,
  });
})();
