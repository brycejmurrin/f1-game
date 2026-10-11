/* Apex 26 — the race HUD's derived readouts, kept out of js/ui/hud.js.
   Pure helpers plus two small stateful pieces GameHud owns one of each:
     lapsApart   — a gap of a lap or more reads "+1L", not ~90 s of distance ÷ speed
     gapDecimals / fmtGapSec / fmtGap — shared gap spelling (2 dp under ~10 s)
     energy      — the ERS store as MJ (PhysicsConsts.ES_MJ) and deploy/harvest state
     bbText      — the brake-bias chip ("BB 56%")
     blueFlag    — a car a lap up closing on the player (the AI's own letPassCase test)
     lapTrace    — the player's best lap THIS RACE as time-at-distance, for the
                   DELTA chip when there is no ghost
     speaker     — throttled position / personal-best lines for #announce-live
   DISPLAY ONLY: everything reads car state (prog, s, lapTime, energy, speed),
   never track curvature or the racing line, and nothing here writes a car. */
const HudReadouts = (function () {
  "use strict";

  /** Whole laps between two cars `dist` metres of progress apart (0 under a lap). */
  function lapsApart(dist, L) {
    if (!(L > 0) || !(dist >= L)) return 0;
    return Math.floor(dist / L);
  }

  /** "▲ BEA +1L" / short "▼ -1L" — the lapped spelling of the gap chip. `n` is
   *  SIGNED like HudRelative's: + = that car is a lap UP, - = a lap down. */
  function lapGapText(arrow, code, n, short) {
    const l = (n > 0 ? "+" : "") + n + "L";
    return short ? arrow + " " + l : arrow + " " + code + " " + l;
  }

  // GAP DECIMALS. 2026 Overtake unlocks inside ~1.0 s, so every race HUD
  // profile needs hundredths near that threshold (0.94 vs 1.04). Under ~10 s
  // the chip / REL / tower share two decimals; above that, standard and
  // minimal drop to one (same character count as "9.94" → "10.4") while
  // broadcast keeps TV-style hundredths. Lap-down spells "-1L" (lapGapText).
  const GAP_FINE_LT = 9.95;
  /** Decimal places for a gap of `sec` seconds on HUD profile `profile`. */
  function gapDecimals(profile, sec) {
    const p = profile || "standard";
    if (p === "broadcast") return 2;
    const a = Math.abs(+sec);
    if (Number.isFinite(a) && a < GAP_FINE_LT) return 2;
    return 1;
  }
  /** Unsigned magnitude for the gap chip: "0.94", "10.4" — no sign, no "s". */
  function fmtGapSec(sec, profile) {
    const a = Math.abs(+sec);
    if (!Number.isFinite(a)) return "--";
    return a.toFixed(gapDecimals(profile, a));
  }
  /** Signed REL/tower form: "-0.94" ahead, "+0.94" behind; "99+" past ~100 s. */
  function fmtGap(sec, ahead, profile) {
    const a = Math.abs(+sec);
    const sign = ahead ? "-" : "+";
    if (!Number.isFinite(a)) return sign + "--";
    if (a >= 99.5) return sign + "99+";
    return sign + a.toFixed(gapDecimals(profile, a));
  }

  const esMJ = () => (typeof PhysicsConsts !== "undefined" && PhysicsConsts && PhysicsConsts.ES_MJ) || 4;

  /** deploy | harvest | idle from this tick's flags and the store's movement. */
  function ersState(deploying, e, ePrev) {
    if (deploying) return "deploy";
    if (Number.isFinite(e) && Number.isFinite(ePrev) && e - ePrev > 1e-4) return "harvest";
    return "idle";
  }

  /** {text, label} for the ENERGY bar: "3.2 MJ" in the bar, words for a reader. */
  function energy(e, st) {
    const mj = Math.max(0, Math.min(1, Number.isFinite(e) ? e : 0)) * esMJ();
    const n = mj.toFixed(1);
    const glyph = st === "deploy" ? "▼ " : st === "harvest" ? "▲ " : "";
    const word = st === "deploy" ? ", deploying" : st === "harvest" ? ", harvesting" : "";
    return { text: glyph + n + " MJ", label: "Energy " + n + " megajoules" + word };
  }

  /** "BB 56%" / "BB 56.5%" from c.brakeBias (front share, 0..1; null = ref). */
  function bbText(bb, ref) {
    const v = (bb != null && Number.isFinite(bb) ? bb : (ref || 0.56)) * 100;
    const r = Math.round(v * 2) / 2;
    return "BB " + (r % 1 ? r.toFixed(1) : r.toFixed(0)) + "%";
  }

  // ONE SPD PLATE. The wheel LCD (car-mesh getWheelStatus) and the floating
  // #hud-speed (phone cockpit brings it back under 900×600) both show speed.
  // AppearanceOpts.unitLabel() spells "KM/H" for settings copy; the wheel
  // fascia uses "KPH". Showing both at once read as dual conflicting plates
  // (cockpit shots 2026-10-05: MPH on the LCD + KM/H on the float, or SPD
  // stacked on KPH). Race plates share one short unit: MPH or KPH.
  const KPH_PER_MPH = 1.609344;
  /** "mph" | "kmh" — AppearanceOpts when present, else kmh. */
  function spdUnits() {
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && typeof AppearanceOpts.units === "function") {
      return AppearanceOpts.units() === "mph" ? "mph" : "kmh";
    }
    return "kmh";
  }
  /** Plate spelling for the wheel/cluster/HUD: "MPH" | "KPH" (never "KM/H"). */
  function spdUnit(units) {
    return (units || spdUnits()) === "mph" ? "MPH" : "KPH";
  }
  /**
   * One SPD readout from dash km/h: `{ n, unit }`.
   * `n` follows AppearanceOpts.speed when available (same rounding as settings);
   * `unit` is always the short plate form so the float cannot disagree with
   * the LCD. Pass `units` ("mph"|"kmh") to pin without reading AppearanceOpts.
   */
  function spdPlate(kph, units) {
    const u = units || spdUnits();
    const v = Number(kph);
    let n;
    if (units == null && typeof AppearanceOpts !== "undefined" && AppearanceOpts && typeof AppearanceOpts.speed === "function") {
      n = AppearanceOpts.speed(v);
    } else {
      n = Math.round((Number.isFinite(v) ? v : 0) / (u === "mph" ? KPH_PER_MPH : 1));
    }
    return { n: Number.isFinite(n) ? n : 0, unit: spdUnit(u) };
  }

  // BLUE FLAG. The AI yields (AiDrive.letPassCase in js/game.js) to a chaser a
  // HALF LAP or more up in progress inside 9 m; the flag marshal shows it a
  // little earlier, at about a second. Same lapping test, a time window.
  const BLUE_S = 1.2;
  /** The car that should be let through, or null. */
  function blueFlag(player, cars, L, vFloor) {
    if (!player || !cars || !(L > 0) || player.finished || player.retired) return null;
    let best = null, bestD = Infinity;
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (!o || o === player || o.retired || o.finished) continue;
      const up = o.prog - player.prog;
      if (!(up > L * 0.5)) continue;
      // Metres the lapping car is physically BEHIND the player on the road.
      const back = ((player.prog - o.prog) % L + L) % L;
      if (back <= 0 || back >= bestD) continue;
      if (back / Math.max(o.speed || 0, vFloor || 1) <= BLUE_S) { best = o; bestD = back; }
    }
    return best;
  }

  // THE BEST LAP AS TIME-AT-DISTANCE. Only a time-trial ghost was recorded per
  // distance, so a race had no DELTA at all. This keeps the current lap's
  // (s, lapTime) every few metres and adopts it as the reference when the lap
  // it describes became the player's new best (c.best is set at the crossing,
  // only for a valid lap). ~1000 pairs for a 5 km lap.
  const STEP_M = 5, CAP = 4096, JUMP_M = 150;
  function lapTrace() {
    let cur = mk(), ref = null, lap = -1, best = Infinity, total = 0;
    function mk() { return { s: new Float32Array(CAP), t: new Float32Array(CAP), n: 0, ok: true }; }
    function reset() { cur = mk(); ref = null; lap = -1; best = Infinity; total = 0; }
    /** Call every frame with the player car and the lap length. */
    function sample(c, L) {
      if (!c || !(L > 0)) return;
      if (L !== total) { reset(); total = L; }
      const lp = c.lap | 0;
      if (lp !== lap) {
        // The crossing just happened: the lap the trace holds is complete.
        // c.best only moves for a valid lap, and only down.
        if (lap >= 1 && lp === lap + 1 && cur.ok && cur.n > 8 && c.best < best && c.best === c.lastLap) {
          ref = cur; cur = mk();
        } else { cur.n = 0; cur.ok = true; }
        if (Number.isFinite(c.best)) best = Math.min(best, c.best);
        lap = lp;
      }
      if (lap < 1 || !cur.ok) return;
      const s = c.s, t = c.lapTime;
      if (!(s >= 0) || !(t >= 0)) return;
      const n = cur.n;
      if (n) {
        const ds = s - cur.s[n - 1];
        if (ds < STEP_M) { if (ds < -JUMP_M) cur.ok = false; return; }   // backwards across the lap = not one lap
        if (ds > JUMP_M) { cur.ok = false; return; }                      // a teleport (rescue, jump)
      }
      if (n >= CAP) return;
      cur.s[n] = s; cur.t[n] = t; cur.n = n + 1;
    }
    /** The reference lap's time at arc `s`, or null without a reference. */
    function timeAt(s) {
      if (!ref || !(s >= 0)) return null;
      const S = ref.s, T = ref.t, n = ref.n;
      if (s > S[n - 1] + JUMP_M) return null;
      if (s <= S[0]) return S[0] > 0 ? T[0] * (s / S[0]) : T[0];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
      if (s >= S[hi]) return T[hi] + (n > 1 ? (s - S[hi]) * (T[hi] - T[lo]) / Math.max(1e-6, S[hi] - S[lo]) : 0);
      return T[lo] + (T[hi] - T[lo]) * (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]);
    }
    return { sample, timeAt, reset, has: () => !!ref };
  }

  // THE SPOKEN HUD. #announce-live is shared with the radio card (game.js
  // showAnnounce) and the flag (hud.js sayFlag), so this yields to them: a
  // line waits until nobody else has written for FOREIGN_MS, and lines are at
  // least GAP_MS apart. A position is spoken only once it has HELD for
  // POS_HOLD_MS — a three-car scrap in a braking zone is one line, not six.
  // Track-limit strikes are NOT here: game.js already speaks them as a
  // race-control card through the same region.
  const POS_HOLD_MS = 2000, GAP_MS = 2000, FOREIGN_MS = 1500;
  function speaker(live) {
    let said = "", foreign = "", foreignT = -1e9, lastT = -1e9;
    let rank = 0, rankT = 0, rankSaid = 0, best = Infinity, queue = [];
    function reset() { rank = 0; rankT = 0; rankSaid = 0; best = Infinity; queue = []; }
    function push(key, text) {
      for (let i = 0; i < queue.length; i++) if (queue[i].key === key) { queue[i].text = text; return; }
      queue.push({ key, text });
    }
    /** HUD tick: the player's rank (0 = none), field size, best lap and its spelling. */
    function tick(now, p, fmt) {
      if (!live) return null;
      const cur = live.textContent || "";
      if (cur && cur !== said && cur !== foreign) { foreign = cur; foreignT = now; }
      if (p) {
        const r = p.rank | 0;
        if (r !== rank) { rank = r; rankT = now; if (!rankSaid) rankSaid = r; }   // the first rank is the grid slot: no news
        else if (r && r !== rankSaid && now - rankT >= POS_HOLD_MS) {
          rankSaid = r; push("pos", "Position " + r + (p.of ? " of " + p.of : ""));
        }
        if (Number.isFinite(p.best) && p.best < best) {
          // The first lap of a race is a best by definition — not worth a line.
          if (Number.isFinite(best)) push("pb", "New best lap, " + (fmt ? fmt(p.best) : p.best.toFixed(3)));
          best = p.best;
        }
      }
      if (!queue.length || now - foreignT < FOREIGN_MS || now - lastT < GAP_MS) return null;
      const line = queue.shift();
      if (line.key === "pb" && /BEST/i.test(foreign) && now - foreignT < 4000) return null;   // the engineer just said it
      said = line.text; lastT = now;
      // Through the region's one writer (js/ui/live-region.js) at HUD priority,
      // the lowest: it keeps the clear-then-write beat, and a flag or a radio
      // call in the same tick goes first instead of being overwritten.
      if (typeof LiveRegion !== "undefined") LiveRegion.say(said, "hud");
      else live.textContent = said;
      return said;
    }
    return { tick, reset };
  }

  return { lapsApart, lapGapText, gapDecimals, fmtGapSec, fmtGap, GAP_FINE_LT,
    ersState, energy, bbText, blueFlag, lapTrace, speaker, BLUE_S,
    spdUnits, spdUnit, spdPlate, KPH_PER_MPH };
})();
Object.freeze(HudReadouts);
