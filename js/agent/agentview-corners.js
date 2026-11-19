const AgentCorners = (function () {
  "use strict";

  function create(bag) {
    const { G, r1, wrapS, smoothK, sweep, severityOf, LAT_GRIP, BRAKE_DECEL, STRAIGHT_R, STRAIGHT_EXIT_M } = bag;
    const scr = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
    let cornerCache = null;

    function buildCorners(track) {
      const total = track.total;
      const turns = (track.def && track.def.turns) || null;
      const fracs = turns && turns.length ? turns.slice() : peakFracs(track);
      const out = [];
      for (let i = 0; i < fracs.length; i++) {
        const frac = ((fracs[i] % 1) + 1) % 1;
        const nom = frac * total;
        const prevF = fracs[(i - 1 + fracs.length) % fracs.length];
        const nextF = fracs[(i + 1) % fracs.length];
        const gapBack = ((frac - prevF + 1) % 1) * total;
        const gapFwd = ((nextF - frac + 1) % 1) * total;
        const win = Math.max(20, Math.min(120, gapBack * 0.45, gapFwd * 0.45));

        let s = nom, peak = Math.abs(smoothK(nom));
        for (let d = -win; d <= win; d += 4) {
          const a = Math.abs(smoothK(nom + d));
          if (a > peak) { peak = a; s = nom + d; }
        }

        const kA = smoothK(s);
        const sign = kA >= 0 ? 1 : -1;
        let entry = s, exit = s;
        for (let d = 5; d <= 300; d += 5) {
          const kk = smoothK(s - d);
          if (kk * sign > 0 && Math.abs(kk) > peak * 0.2) entry = s - d; else break;
        }
        for (let d = 5; d <= 300; d += 5) {
          const kk = smoothK(s + d);
          if (kk * sign > 0 && Math.abs(kk) > peak * 0.2) exit = s + d; else break;
        }

        const arc = Math.max(exit - entry, 1);
        const psi = sweep(entry, exit);
        const radius = Math.abs(psi) < 1e-3 ? 99999 : Math.min(99999, arc / Math.abs(psi));

        Tracks.sample(track, wrapS(s), scr);
        out.push({
          turn: "T" + (i + 1),
          frac: +(wrapS(s) / total).toFixed(4),
          s: r1(wrapS(s)),
          dir: radius >= STRAIGHT_R ? "straight" : psi > 0 ? "L" : "R",
          radiusM: r1(radius),
          k: +(psi / arc).toFixed(5),
          sweepDeg: r1(psi * 180 / Math.PI),
          severity: severityOf(radius),
          widthM: r1(scr.hw * 2),
          entryS: r1(wrapS(entry)),
          exitS: r1(wrapS(exit)),
          lengthM: r1(arc),
          apexSpeedKph: r1(Math.sqrt(LAT_GRIP * Math.min(radius, 2000)) * 3.6),
          _entry: entry, _exit: exit, _s: s,
        });
      }
      return mergeOverlaps(out);
    }

    function mergeOverlaps(list) {
      const out = [];
      for (const c of list) {
        const prev = out[out.length - 1];
        if (prev) {
          const overlap = Math.min(prev._exit, c._exit) - Math.max(prev._entry, c._entry);
          const shorter = Math.min(prev._exit - prev._entry, c._exit - c._entry);
          if (overlap > 0 && shorter > 0 && overlap / shorter > 0.5
              && prev.dir === c.dir) {
            const entry = Math.min(prev._entry, c._entry);
            const exit = Math.max(prev._exit, c._exit);
            const arc = Math.max(exit - entry, 1);
            const psi = sweep(entry, exit);
            const radius = Math.abs(psi) < 1e-3 ? 99999
                                                : Math.min(99999, arc / Math.abs(psi));
            prev.turn = prev.turn.split("-")[0] + "-" + c.turn;
            prev.radiusM = r1(radius);
            prev.k = +(psi / arc).toFixed(5);
            prev.sweepDeg = r1(psi * 180 / Math.PI);
            prev.severity = severityOf(radius);
            prev.lengthM = r1(arc);
            prev.entryS = r1(wrapS(entry));
            prev.exitS = r1(wrapS(exit));
            prev.apexSpeedKph = r1(Math.sqrt(LAT_GRIP * Math.min(radius, 2000)) * 3.6);
            prev._entry = entry; prev._exit = exit;
            continue;
          }
        }
        out.push(c);
      }
      const n = out.length;
      for (let i = 0; i < n; i++) {
        const c = out[i], nx = out[(i + 1) % n];
        let gap = nx.entryS - c.exitS;
        if (gap < 0) gap += G.track.total;
        c.straightAfterM = r1(gap);
        c.exitsOntoStraight = gap >= STRAIGHT_EXIT_M;
        Object.assign(c, roadShapeAt(c.s, c.entryS, c.exitS, c.dir));
        delete c._entry; delete c._exit; delete c._s;
      }
      return out;
    }

    function roadShapeAt(s, entryS, exitS, dir) {
      const track = G.track, out = {};

      let bankRad = 0;
      const bk = Tracks.banking ? Tracks.banking(track, wrapS(s), 0) : null;
      if (bk && bk.roll) bankRad = bk.roll;
      else if (Tracks.bankAngle) bankRad = Tracks.bankAngle(track, wrapS(s)) || 0;
      const bankDeg = r1(bankRad * 180 / Math.PI);
      out.bankingDeg = bankDeg;
      if (Math.abs(bankDeg) < 1.5 || (dir !== "L" && dir !== "R")) {
        out.camber = "flat";
      } else {
        out.camber = ((dir === "L") === (bankDeg > 0)) ? "banked into the turn"
                                                       : "off-camber";
      }

      const a = entryS != null ? entryS : s - 40, b = exitS != null ? exitS : s + 40;
      const L = track.total;
      Tracks.sample(track, wrapS(a), scr); const y0 = scr.p[1];
      Tracks.sample(track, wrapS(b), scr); const y1 = scr.p[1];
      let run = b - a; if (run < 0) run += L;
      run = Math.max(run, 1);
      const grade = (y1 - y0) / run * 100;
      out.gradientPct = r1(grade);
      out.elevation = grade > 1.5 ? "uphill" : grade < -1.5 ? "downhill" : "level";

      if (track.kerbL && track.kerbR) {
        const nn = track.n;
        let kl = 0, kr = 0, samples = 0;
        for (let off = 0; off <= run; off += 5) {
          const d = a + off;
          const k = Math.floor((((d % L) + L) % L) / L * nn) % nn;
          if (track.kerbL[k]) kl++;
          if (track.kerbR[k]) kr++;
          samples++;
        }
        const sides = [];
        if (samples && kl / samples > 0.2) sides.push("left");
        if (samples && kr / samples > 0.2) sides.push("right");
        out.kerbs = sides.length ? sides : null;
      }
      return out;
    }

    function peakFracs(track) {
      const n = 400, out = [];
      let prev = 0, cur = Math.abs(smoothK(0));
      for (let i = 1; i <= n; i++) {
        const s = (i % n) / n * track.total;
        const next = Math.abs(smoothK(s));
        if (cur > 0.006 && cur >= prev && cur >= next) out.push(((i - 1) % n) / n);
        prev = cur; cur = next;
      }
      return out;
    }

    function corners() {
      const key = G.track.def.id + "|" + Math.round(G.track.total);
      if (!cornerCache || cornerCache.key !== key) {
        cornerCache = { key, corners: buildCorners(G.track) };
      }
      return cornerCache.corners;
    }

    function entryDist(entryS, s, total) {
      let d = ((entryS - s) % total + total) % total;
      if (d > total - 20) d -= total;
      return d;
    }

    function nextCorner(s, speed) {
      const list = corners();
      if (!list.length) return null;
      const total = G.track.total;
      let best = null, bestD = Infinity;
      for (const c of list) {
        const d = entryDist(c.entryS, s, total);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) return null;

      const v = Math.max(speed, 0.1);
      const vApex = Math.sqrt(LAT_GRIP * Math.min(best.radiusM, 2000));
      const brakeM = speed > vApex
        ? (speed * speed - vApex * vApex) / (2 * BRAKE_DECEL)
        : 0;
      const distM = Math.max(0, r1(bestD));
      const inCorner = bestD <= 0;

      let status;
      if (inCorner) status = "in " + best.turn;
      else if (brakeM <= 0) status = "no braking needed for " + best.turn;
      else if (distM <= brakeM) status = "BRAKE NOW for " + best.turn;
      else status = "brake in ~" + r1(distM - brakeM) + " m";

      return {
        turn: best.turn, dir: best.dir, radiusM: best.radiusM,
        severity: best.severity, distM,
        timeS: speed < 1 ? null : r1(distM / v),
        apexSpeedKph: best.apexSpeedKph,
        straightAfterM: best.straightAfterM,
        exitsOntoStraight: best.exitsOntoStraight,
        bankingDeg: best.bankingDeg, camber: best.camber,
        gradientPct: best.gradientPct, elevation: best.elevation,
        kerbs: best.kerbs,
        suggestBrakeM: r1(brakeM), status,
        note: "suggestBrakeM assumes ~" + BRAKE_DECEL + " m/s^2 braking and ~"
              + LAT_GRIP + " m/s^2 lateral grip — a hint, not the car's physics. "
              + "No racing line is prescribed: exitsOntoStraight flags a corner "
              + "worth prioritising exit out of; read ego.lateralM (offset from "
              + "centre), ahead.pts (curvature) and headingErrDeg to choose a line",
      };
    }

    function upcomingCorners(s, speed, n) {
      const list = corners();
      if (!list.length) return [];
      const total = G.track.total;
      const rows = list.map((c) => {
        return { c, d: entryDist(c.entryS, s, total) };
      }).sort((a, b) => a.d - b.d).slice(0, Math.max(1, n | 0));
      return rows.map(({ c, d }) => {
        const vApex = Math.sqrt(LAT_GRIP * Math.min(c.radiusM, 2000));
        const brakeM = speed > vApex
          ? (speed * speed - vApex * vApex) / (2 * BRAKE_DECEL) : 0;
        return {
          turn: c.turn, dir: c.dir, radiusM: c.radiusM, severity: c.severity,
          distM: Math.max(0, r1(d)), apexSpeedKph: c.apexSpeedKph,
          exitsOntoStraight: c.exitsOntoStraight, suggestBrakeM: r1(brakeM),
          camber: c.camber, elevation: c.elevation, kerbs: c.kerbs,
        };
      });
    }

    return { corners, nextCorner, upcomingCorners };
  }

  return { create };
})();
Object.freeze(AgentCorners);
