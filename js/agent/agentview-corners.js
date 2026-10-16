/* Apex 26 — AgentCorners: the corner table of the agent view (buildCorners, roadShapeAt, peakFracs, corners, nextCorner, upcomingCorners).
   Pure move out of agentview.js (#1666). create(bag) takes the game ctx G plus the view's own helpers (r1, wrapS, smoothK, sweep,
   severityOf) and the shared constants, and owns the per-track corner cache and its own sample scratch. */
const AgentCorners = (function () {
  "use strict";

  function create(bag) {
    const { G, r1, wrapS, smoothK, sweep, severityOf, LAT_GRIP, BRAKE_DECEL, STRAIGHT_R, STRAIGHT_EXIT_M } = bag;
    const scr = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
    let cornerCache = null;     // { key, corners: [...] }

    // corner table (static per track, built once)
    // def.turns is the curated FIA apex list authored in the def — real turn
    // numbering, in driving order. info().turns exposes only its LENGTH today,
    // which is the least useful projection of it available. Circuits without
    // curated turns fall back to curvature peaks.
    function buildCorners(track) {
      const total = track.total;
      const turns = (track.def && track.def.turns) || null;
      const fracs = turns && turns.length ? turns.slice() : peakFracs(track);
      const out = [];
      for (let i = 0; i < fracs.length; i++) {
        const frac = ((fracs[i] % 1) + 1) % 1;
        // The curated apexes are documented best-effort against this game's
        // centreline, so they can sit tens of metres off the actual bend. Snap
        // to the nearest smoothed-curvature peak, bounded by half the distance
        // to the neighbouring turns so a snap can't hop onto the wrong corner.
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
          // POSITIVE CURVATURE IS A LEFT-HAND TURN. Measured, not derived: park on
          // the centreline before a corner, drive with ZERO steer, and watch
          // which way you run wide — you always run wide to the OUTSIDE, so a
          // right-hander pushes you to negative lateral. Monza T1 (k = +0.037)
          // drifts to +9.2 m and T5 (k = −0.015) to −12.2 m, i.e. +k bends the
          // road LEFT. game.js agrees: its racing line is -sign(k) with the
          // comment "k>0 curves toward screen-left".
          dir: radius >= STRAIGHT_R ? "straight" : psi > 0 ? "L" : "R",
          radiusM: r1(radius),
          // Signed mean curvature over the whole corner (psi/arc = sign(psi)/radius),
          // NOT the point sample kA: kA is a lone 30 m reading that can flip sign at
          // an OSM-noisy apex, so dir (from psi) and k (from kA) could disagree.
          // Deriving k from the same swept psi keeps k, dir, radiusM and sweepDeg
          // one consistent story.
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
            prev.k = +(psi / arc).toFixed(5);   // keep k swept-consistent post-merge
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
      // Honest road facts, no prescribed line. The research verdict (GT Sophy
      // was given NO ideal line and learned it from geometry) is that a crude
      // "apex = inside edge" hint is confidently wrong — late apex is the
      // default onto a straight, chicanes link, the apex is a position not a
      // point. So instead of prescribing a line we report the geometry an agent
      // needs to CHOOSE one: how much road runs before the next corner
      // (straightAfterM) and whether that makes this a corner to prioritise
      // exit out of (exitsOntoStraight). Everything else the line needs —
      // curvature ahead, width, offset from centreline, heading vs tangent — is
      // already in world().ahead / ego.
      const n = out.length;
      for (let i = 0; i < n; i++) {
        const c = out[i], nx = out[(i + 1) % n];
        let gap = nx.entryS - c.exitS;
        if (gap < 0) gap += G.track.total;
        c.straightAfterM = r1(gap);
        c.exitsOntoStraight = gap >= STRAIGHT_EXIT_M;
        // Three things the track has always known and never told the agent:
        // how the road is TILTED, whether it climbs or falls, and where the
        // kerbs are. All three change how a corner is driven.
        Object.assign(c, roadShapeAt(c.s, c.entryS, c.exitS, c.dir));
        delete c._entry; delete c._exit; delete c._s;
      }
      return out;
    }

    // Banking, gradient and kerbs at a point on the road. `Tracks.bankAngle`,
    // `track.kerbL/kerbR` and the elevation samples all existed and were never
    // surfaced. Signs follow the usual convention: + bank = the road tilts down
    // to the RIGHT, + gradient = climbing.
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
        // + = right edge raised, which holds a LEFT-hander (see the sign note).
        out.camber = ((dir === "L") === (bankDeg > 0)) ? "banked into the turn"
                                                       : "off-camber";
      }

      const a = entryS != null ? entryS : s - 40, b = exitS != null ? exitS : s + 40;
      Tracks.sample(track, wrapS(a), scr); const y0 = scr.p[1];
      Tracks.sample(track, wrapS(b), scr); const y1 = scr.p[1];
      const run = Math.max(Math.abs(b - a), 1);
      const grade = (y1 - y0) / run * 100;
      out.gradientPct = r1(grade);
      out.elevation = grade > 1.5 ? "uphill" : grade < -1.5 ? "downhill" : "level";

      // Kerbs are per-node flags; report which sides carry one through the corner.
      if (track.kerbL && track.kerbR) {
        const nn = track.n, L = track.total;
        let kl = 0, kr = 0, samples = 0;
        for (let d = a; d <= b; d += 5) {
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

    // Fallback when a circuit has no curated turn list: maxima of the SMOOTHED
    // curvature. NOT __apex.corners()' rule (raw curvature per node), so on a
    // turns-less def the lists differ (pinned in agent-hooks-vm.test.mjs).
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

    // The single field an agent cannot derive from k and hw but can act on
    // immediately. Distance is measured to the corner's ENTRY, not its apex —
    // by the apex the decision has already been made.
    function nextCorner(s, speed) {
      const list = corners();
      if (!list.length) return null;
      const total = G.track.total;
      let best = null, bestD = Infinity;
      for (const c of list) {
        let d = c.entryS - s;
        if (d < -20) d += total;              // small negative = we're in it
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
        timeS: speed < 1 ? null : r1(distM / v),   // null when stopped: dist/0.1 read as ~2300 s
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
        let d = c.entryS - s;
        if (d < -20) d += total;
        return { c, d };
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
