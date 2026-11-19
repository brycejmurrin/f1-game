const HudReadouts = (function () {
  "use strict";

  function lapsApart(dist, L) {
    if (!(L > 0) || !(dist >= L)) return 0;
    return Math.floor(dist / L);
  }

  function lapGapText(arrow, code, n, short) {
    const l = (n > 0 ? "+" : "") + n + "L";
    return short ? arrow + " " + l : arrow + " " + code + " " + l;
  }

  const GAP_FINE_LT = 9.995;
  function gapDecimals(profile, sec) {
    const p = profile || "standard";
    if (p === "broadcast") return 2;
    const a = Math.abs(+sec);
    if (Number.isFinite(a) && a < GAP_FINE_LT) return 2;
    return 1;
  }
  function fmtGapSec(sec, profile) {
    const a = Math.abs(+sec);
    if (!Number.isFinite(a)) return "--";
    return a.toFixed(gapDecimals(profile, a));
  }
  function fmtGap(sec, ahead, profile) {
    const a = Math.abs(+sec);
    const sign = ahead ? "-" : "+";
    if (!Number.isFinite(a)) return sign + "--";
    if (a >= 99.5) return sign + "99+";
    return sign + a.toFixed(gapDecimals(profile, a));
  }

  const esMJ = () => (typeof PhysicsConsts !== "undefined" && PhysicsConsts && PhysicsConsts.ES_MJ) || 4;

  function ersState(deploying, e, ePrev) {
    if (deploying) return "deploy";
    if (Number.isFinite(e) && Number.isFinite(ePrev) && e - ePrev > 1e-4) return "harvest";
    return "idle";
  }

  function energy(e, st) {
    const mj = Math.max(0, Math.min(1, Number.isFinite(e) ? e : 0)) * esMJ();
    const n = mj.toFixed(1);
    const word = st === "deploy" ? ", deploying" : st === "harvest" ? ", harvesting" : "";
    return { text: n + " MJ", label: "Energy " + n + " megajoules" + word };
  }

  function bbText(bb, ref) {
    const v = (bb != null && Number.isFinite(bb) ? bb : (ref || 0.56)) * 100;
    const r = Math.round(v * 2) / 2;
    return "BB " + (r % 1 ? r.toFixed(1) : r.toFixed(0)) + "%";
  }

  const KPH_PER_MPH = 1.609344;
  function spdUnits() {
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && typeof AppearanceOpts.units === "function") {
      return AppearanceOpts.units() === "mph" ? "mph" : "kmh";
    }
    return "kmh";
  }
  function spdUnit(units) {
    return (units || spdUnits()) === "mph" ? "MPH" : "KPH";
  }
  function spdDigits(kph, units) {
    const u = units || spdUnits();
    const v = Number(kph);
    let n;
    if (units == null && typeof AppearanceOpts !== "undefined" && AppearanceOpts && typeof AppearanceOpts.speed === "function") {
      n = AppearanceOpts.speed(v);
    } else {
      n = Math.round((Number.isFinite(v) ? v : 0) / (u === "mph" ? KPH_PER_MPH : 1));
    }
    if (!Number.isFinite(n)) n = 0;
    return Math.max(0, Math.min(999, n));
  }
  const _plate = { n: 0, unit: "" };
  function spdPlate(kph, units) {
    const u = units || spdUnits();
    _plate.n = spdDigits(kph, units == null ? null : u); _plate.unit = spdUnit(u);
    return _plate;
  }

  const BLUE_S = 1.2, BLUE_HOLD_S = 1.6;
  function blueFlag(player, cars, L, vFloor, held) {
    if (!player || !cars || !(L > 0) || player.finished || player.retired) return null;
    let best = null, bestD = Infinity;
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (!o || o === player || o.retired || o.finished) continue;
      const up = o.prog - player.prog;
      if (!(up > L * 0.5)) continue;
      const back = ((player.prog - o.prog) % L + L) % L;
      if (back <= 0 || back >= bestD) continue;
      if (back / Math.max(o.speed || 0, vFloor || 1) <= (o === held ? BLUE_HOLD_S : BLUE_S)) { best = o; bestD = back; }
    }
    return best;
  }

  const STEP_M = 5, CAP = 4096, JUMP_M = 150;
  function lapTrace() {
    let cur = mk(), ref = null, lap = -1, best = Infinity, total = 0;
    function mk() { return { s: new Float32Array(CAP), t: new Float32Array(CAP), n: 0, ok: true }; }
    function reset() { cur = mk(); ref = null; lap = -1; best = Infinity; total = 0; }
    function sample(c, L) {
      if (!c || !(L > 0)) return;
      if (L !== total) { reset(); total = L; }
      const lp = c.lap | 0;
      if (lp !== lap) {
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
        if (ds < STEP_M) { if (ds < -JUMP_M) cur.ok = false; return; }
        if (ds > JUMP_M) { cur.ok = false; return; }
      }
      if (n >= CAP) return;
      cur.s[n] = s; cur.t[n] = t; cur.n = n + 1;
    }
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

  const POS_HOLD_MS = 2000, GAP_MS = 2000, FOREIGN_MS = 1500;
  function speaker(live) {
    let said = "", foreign = "", foreignT = -1e9, lastT = -1e9;
    let rank = 0, rankT = 0, rankSaid = 0, best = Infinity, queue = [];
    function reset() { rank = 0; rankT = 0; rankSaid = 0; best = Infinity; queue = []; }
    function push(key, text) {
      for (let i = 0; i < queue.length; i++) if (queue[i].key === key) { queue[i].text = text; return; }
      queue.push({ key, text });
    }
    function tick(now, p, fmt) {
      if (!live) return null;
      const cur = live.textContent || "";
      if (cur && cur !== said && cur !== foreign) { foreign = cur; foreignT = now; }
      if (p) {
        const r = p.rank | 0;
        if (r !== rank) { rank = r; rankT = now; if (!rankSaid) rankSaid = r; }
        else if (r && r !== rankSaid && now - rankT >= POS_HOLD_MS) {
          rankSaid = r; push("pos", "Position " + r + (p.of ? " of " + p.of : ""));
        }
        if (Number.isFinite(p.best) && p.best < best) {
          if (Number.isFinite(best)) push("pb", "New best lap, " + (fmt ? fmt(p.best) : p.best.toFixed(3)));
          best = p.best;
        }
      }
      if (!queue.length || now - foreignT < FOREIGN_MS || now - lastT < GAP_MS) return null;
      const line = queue.shift();
      if (line.key === "pb" && /BEST/i.test(foreign) && now - foreignT < 4000) return null;
      said = line.text; lastT = now;
      if (typeof LiveRegion !== "undefined") LiveRegion.say(said, "hud");
      else live.textContent = said;
      return said;
    }
    return { tick, reset };
  }

  function cbCuesOn() {
    return typeof A11yOpts !== "undefined" && A11yOpts.cuesOn && A11yOpts.cuesOn();
  }

  function sectorTimingKind(t, sessionBest, personalBest) {
    if (t == null) return "";
    if (sessionBest) return "session";
    if (personalBest) return "personal";
    return "slow";
  }

  function flagCueKind(caution, blue) {
    if (blue) return "blue";
    if (!caution || !(caution.level > 0)) return "";
    if (caution.level === 4) return "red";
    if (caution.level === 3) return "sc";
    if (caution.level === 2) return "vsc";
    if (caution.level === 1) return "yellow";
    return "";
  }

  function paintSectorRow(rowEl, t, sessionBest, personalBest) {
    if (!rowEl || !rowEl.dataset) return;
    if (!cbCuesOn()) {
      if (rowEl.dataset.secTiming != null) delete rowEl.dataset.secTiming;
      return;
    }
    const k = sectorTimingKind(t, sessionBest, personalBest);
    if (k) {
      if (rowEl.dataset.secTiming !== k) rowEl.dataset.secTiming = k;
    } else if (rowEl.dataset.secTiming != null) delete rowEl.dataset.secTiming;
  }

  function paintFlag(el, opt) {
    if (!el || !el.dataset) return;
    if (!cbCuesOn()) {
      if (el.dataset.flagCue != null) delete el.dataset.flagCue;
      return;
    }
    const k = opt && opt.blue ? "blue" : flagCueKind(opt && opt.caution, false);
    if (k) {
      if (el.dataset.flagCue !== k) el.dataset.flagCue = k;
    } else if (el.dataset.flagCue != null) delete el.dataset.flagCue;
  }

  function inPit(car) { return !!(car && car.pitState && car.pitState !== "none"); }
  return { inPit, lapsApart, lapGapText, gapDecimals, fmtGapSec, fmtGap,
    ersState, energy, bbText, blueFlag, lapTrace, speaker, BLUE_S,
    spdUnits, spdUnit, spdDigits, spdPlate, KPH_PER_MPH,
    sectorTimingKind, flagCueKind, paintSectorRow, paintFlag };
})();
Object.freeze(HudReadouts);
