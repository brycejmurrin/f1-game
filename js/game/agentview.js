/* Apex 26 — AgentView: the agent-facing JSON view of the running game. __apex is a dev console: ~180 flat hooks, each answering one narrow question, most of them … */
const AgentView = (function () {
  "use strict";

  const API_VERSION = 1;

  // Bump whenever a physics change could invalidate a strategy an agent derived
  // from earlier observations. Cheap insurance: without it, agent-authored
  // racing lines silently rot when LONG_GRIP or PACE is retuned.
  const PHYSICS_VERSION = 1;

  const CONVENTIONS =
    "metres, m/s, seconds, radians unless the key says otherwise; " +
    "+x = right of centreline; +k = LEFT-hand turn; " +
    "side is centreline-relative (which side of the road) EXCEPT scene()'s side, " +
    "which is egocentric (which side of your nose — see its bearingDeg; its " +
    "trackSide is the centreline side for cross-referencing); " +
    "rival lateralM is relative to the player (+ = to your right)";

  const LAT_GRIP = 26;
  const BRAKE_DECEL = 30;

  const SEVERITY = [[30, "hairpin"], [70, "slow"], [150, "medium"], [350, "fast"]];
  const STRAIGHT_R = 800;      // above this radius, call it a straight
  const CORNER_K = 0.004;      // |k| below this is not cornering
  const STRAIGHT_EXIT_M = 120; // a gap this long after a corner is "onto a straight"

  function severityOf(r) {
    for (const [lim, name] of SEVERITY) if (r < lim) return name;
    return r < STRAIGHT_R ? "kink" : "straight";
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const clamp = M4.clamp;                     // shared scalar helper (js/mat4.js)

  // Every comparison against NaN is false, so a non-numeric argument does not
  // announce itself — it silently disables whatever test it feeds. A string
  // radius survives `o.radius || 150` (non-empty strings are truthy), turns the
  // distance check into `> NaN`, and scene() then returns the WHOLE registry
  // while reporting radiusM: NaN. The same NaN in query()'s window makes every
  // row fail instead, which reads as "nothing there". Both look like answers.
  // isNum decides whether to reject; numOr coerces with a fallback.
  const isNum = (v) => v != null && v !== "" && Number.isFinite(+v);
  const numOr = (v, dflt) => (isNum(v) ? +v : dflt);

  // Radius in metres from curvature. Clamped rather than Infinity so the value
  // stays JSON-safe and comparisons don't have to special-case a straight.
  function radiusOf(k) {
    const a = Math.abs(k);
    return a < 1e-6 ? 99999 : Math.min(99999, 1 / a);
  }

  function create(G) {
    Log.info("game", "AgentView.create");
    const { wrapS, gripMult, LONG_GRIP, update, els, camVantage } = G;

    const _vView = new Float32Array(16), _vProj = new Float32Array(16),
          _vVP = new Float32Array(16);
    function buildVP(eye, tgt, fovDeg, far) {
      const aspect = (G.gfx && G.gfx.aspect) || 2.16;
      M4.lookAtTo(_vView, eye, tgt, [0, 1, 0]);
      M4.perspectiveTo(_vProj, fovDeg * Math.PI / 180, aspect, 0.3, far || 3000);
      M4.mulTo(_vVP, _vProj, _vView);         // proj * view, column-major (as game.js)
      return _vVP;
    }

    function resolveCamera(o) {
      const p = G.player;
      if (o.camera || o.orbit) {
        if (!p || p.px == null) {
          return fail("PlayerNotPlacedError",
                      "a chosen camera frames the car, which has no position yet",
                      "call __apex.jump(frac, speed) first, or omit camera to use the live view");
        }
      }
      if (o.orbit) {
        // {az deg (0=behind), el deg, dist m} around the car — the text carOrbit.
        const az = (o.orbit.az || 0) * Math.PI / 180, el = (o.orbit.el || 15) * Math.PI / 180;
        const dist = clamp(o.orbit.dist || 12, 2, 400);
        const head = p.head || 0;
        const dx = Math.sin(head + Math.PI + az), dz = Math.cos(head + Math.PI + az);
        Tracks.sample(G.track, wrapS(p.s), scr);
        const y0 = scr.p[1] + 0.6;
        const eye = [p.px + dx * dist * Math.cos(el), y0 + dist * Math.sin(el),
                     p.pz + dz * dist * Math.cos(el)];
        const tgt = [p.px, y0, p.pz];
        return { vp: buildVP(eye, tgt, o.fov || 45), eye, tgt, mode: "orbit", synthetic: true };
      }
      if (o.camera) {
        const m = String(o.camera).toLowerCase();
        if (!GameTables.CAM_MODES.some((c) => (c.id || c) === m)) {
          return fail("BadArgumentError",
                      'unknown camera "' + o.camera + '"',
                      "one of: " + GameTables.CAM_MODES.map((c) => c.id || c).join(", "));
        }
        const v = camVantage(m, p.s, p.x, p.speed || 0, 0, {
          carPos: (p.px != null && p.pz != null) ? [p.px, p.pz] : null,
          carHead: p.head,
        });
        return { vp: buildVP(v.eye, v.tgt, v.fov), eye: v.eye.slice(),
                 tgt: v.tgt.slice(), mode: m, fovDeg: v.fov, synthetic: true };
      }
      const fr = G.frame, vp = fr && fr.viewProj;
      if (!vp) {
        return fail("NoFrameError",
                    "no rendered frame yet, and no camera was named",
                    'name a camera — render({what:"view", camera:"chase"}) — or headless(false) '
                    + "and let a frame draw");
      }
      return { vp, eye: fr.eye || G.camEye, tgt: G.camTgt,
               mode: (GameTables.CAM_MODES[G.camMode] || {}).id
                     || String(GameTables.CAM_MODES[G.camMode] || G.camMode),
               fovDeg: G.camFov, synthetic: false };
    }

    const scr = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };

    // curvature, smoothed
    // Tracks.curvature differentiates the tangent over a 12 m window, which is
    // fine for physics but too sharp to describe a corner: the OSM-derived
    // centrelines carry local zigzags, so at Monza the point curvature through
    // Curva Grande reads +0.024, +0.022, -0.039 over 50 m. Taken literally that
    // is a 22 m hairpin followed by a left. It is noise.
    //
    // Everything agent-facing therefore uses a 30 m half-window, and corner
    // radius comes from heading integrated across the whole corner rather than
    // from any single sample. Raw k is still reported in `full` detail.
    const SMOOTH_W = 30;

    function headingAt(s) {
      Tracks.sample(G.track, wrapS(s), scr);
      return Math.atan2(scr.t[0], scr.t[2]);
    }

    function angDiff(a, b) {
      let d = a - b;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    }

    const bearingDegTo = (dx, dz, head) =>
      r1(-angDiff(Math.atan2(dx, dz), head) * 180 / Math.PI);

    function smoothK(s, w) {
      const W = w || SMOOTH_W;
      return angDiff(headingAt(s + W), headingAt(s - W)) / (2 * W);
    }

    function sweep(from, to) {
      const step = 5;
      let psi = 0;
      for (let s = from; s < to; s += step) {
        psi += angDiff(headingAt(Math.min(s + step, to)), headingAt(s));
      }
      return psi;
    }

    let cornerCache = null;     // { key, corners: [...] }
    let seq = 0;
    let lastPayload = null;     // for detail-agnostic delta mode
    let lastSeq = 0;

    function fail(error, message, fix) {
      return {
        ok: false, error, message, fix,
        state: { raceState: G.state, track: G.track ? G.track.def.id : null,
                 playerReady: !!(G.player && G.player.px != null) },
      };
    }

    function notReady() {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      if (!G.player) {
        return fail("NoPlayerError", "the car grid has not been built",
                    "call __apex.race(id) then __apex.go()");
      }
      if (G.player.px == null) {
        return fail("PlayerNotPlacedError",
                    "player.px is uninitialised, so world position is unknown",
                    "call __apex.jump(frac, speed) or __apex.step(1/60, 1) first");
      }
      return null;
    }

    // corner table (static per track, built once)
    // def.turns is the curated FIA apex list from CircuitMarkings — real turn
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
        // CircuitMarkings apexes are documented best-effort against this game's
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
          // POSITIVE CURVATURE IS A LEFT-HAND TURN. spline.js's curvatureRaw
          // used to say "+ = right" and this table used to agree with it; both
          // were wrong, and every corner on every circuit came back with the
          // opposite hand. Measured, not derived: park on
          // the centreline before a corner, drive with ZERO steer, and watch
          // which way you run wide — you always run wide to the OUTSIDE, so a
          // right-hander pushes you to negative lateral. Monza T1 (k = +0.037)
          // drifts to +9.2 m and T5 (k = −0.015) to −12.2 m, i.e. +k bends the
          // road LEFT. game.js agrees and always did: its racing line is
          // -sign(k) with the comment "k>0 curves toward screen-left", which is
          // why the AI drives correct apexes while this label read backwards.
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

    // Fallback when a circuit has no curated turn list: local curvature maxima.
    // Same rule __apex.corners() uses, kept in step deliberately.
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
        severity: best.severity, distM, timeS: r1(distM / v),
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

    function paceSev(radiusM) {
      if (radiusM == null || radiusM >= STRAIGHT_R) return 6;
      if (radiusM < 30) return 1;
      if (radiusM < 60) return 2;
      if (radiusM < 120) return 3;
      if (radiusM < 250) return 4;
      if (radiusM < 500) return 5;
      return 6;
    }

    function pacenotes(s, speed) {
      const seq = upcomingCorners(s, speed, 3);
      if (!seq.length) return "clear road ahead";
      return seq.map((c) => {
        const sev = paceSev(c.radiusM);
        const tags = [];
        if (c.elevation === "uphill") tags.push("uphill");
        else if (c.elevation === "downhill") tags.push("downhill");
        if (c.camber === "off-camber") tags.push("off-camber");
        if (c.exitsOntoStraight) tags.push("into-str");
        if (sev <= 2) tags.push("don't-cut");
        return c.dir + sev + " @" + Math.round(c.distM) + "m"
             + (tags.length ? " " + tags.join(" ") : "");
      }).join(", ");
    }

    // Time-scaled, not distance-scaled. obs().scan is fixed at [10,30,60] m,
    // which is 1.2 s of warning at 50 m/s and 6 s at 10 m/s — backwards. GT
    // Sophy previews ~6 s of travel; the span follows velocity.
    function lookahead(s, speed, horizonS, pts) {
      const v = Math.max(speed, 8);              // floor so a stopped car still sees
      const horizon = clamp(v * horizonS, 40, 600);
      const n = Math.max(2, Math.min(pts | 0 || 5, 12));
      const out = [];
      for (let i = 1; i <= n; i++) {
        const d = horizon * (i / n);
        const ss = wrapS(s + d);
        const k = smoothK(ss);
        Tracks.sample(G.track, ss, scr);
        const radius = radiusOf(k);
        out.push({
          d: r1(d), t: r1(d / v),
          radiusM: radius >= STRAIGHT_R ? null : r1(radius),
          dir: Math.abs(k) < CORNER_K ? "straight" : k > 0 ? "L" : "R",  // +k = LEFT
          widthM: r1(scr.hw * 2),
        });
      }
      return { horizonS, horizonM: r1(horizon), pts: out };
    }

    // Per-rival rows, relative to the player. obs() today gives only aggregate
    // gapAhead/gapBehind in metres — correct, but an agent cannot decide which
    // side to attack from a scalar. GT Sophy encodes rivals as relative
    // position + velocity; the GT7 follow-up found orientation mattered too.
    // Rivals are a SALIENCY-CAPPED, COMPACT list — the driving loop wants the
    // nearest few framed relative to the car, not the whole grid (that is
    // field()). The rule the research is loudest on: emit an IDENTIFIER, never
    // the record. An earlier revision spread `team: c.team` — the entire team
    // object (colour float-arrays, both drivers, stats, _cssColor) — across
    // every rival, ~45 lines of noise each. A rival needs a name, a gap, a side
    // and a closing rate; nothing else is actionable at 200 km/h.
    function rivals(limit) {
      const p = G.player, out = [];
      for (const c of G.cars) {
        if (c.isPlayer) continue;
        let gap = c.prog - p.prog;              // + = ahead of us
        const ahead = gap >= 0;
        const gapM = Math.abs(gap);
        const lateralM = (c.x || 0) - (p.x || 0);
        // + closing = the gap is shrinking, whichever side the rival is on
        const closing = ahead ? (p.speed - c.speed) : (c.speed - p.speed);
        out.push({
          id: c.id != null ? c.id : G.cars.indexOf(c),
          code: c.code || null,
          team: teamIdOf(c),                     // a string id, NOT the object
          rel: ahead ? "ahead" : "behind",
          gapM: r1(gapM),
          gapS: r2(gapM / Math.max(p.speed, 5)),
          lateralM: r1(lateralM),
          side: lateralM > 0.5 ? "right" : lateralM < -0.5 ? "left" : "same line",
          closingMps: r1(closing),
          // AI pace, 0.92-1.02. Without it every rival looks equally fast and
          // an agent cannot tell a car it should hold off from one it will
          // never keep behind. Rounded to 2dp — it is a comparison, not a dial.
          pace: r2(c.skill != null ? c.skill : 1),
          threat: !ahead && gapM < 25 && closing > 0.5 ? "under attack"
                : ahead && gapM < 25 && closing > 0.5 ? "closing"
                : gapM < 25 ? "in range" : "clear",
        });
      }
      out.sort((a, b) => a.gapM - b.gapM);
      return limit ? out.slice(0, limit) : out;
    }

    // A car's team as a stable string id, never the team OBJECT. Cars carry
    // team as either an id string or the resolved Teams record (js/game.js
    // makeCars), so normalise both to the id.
    function teamIdOf(c) {
      const t = c && c.team;
      if (!t) return null;
      return (typeof t === "object" ? (t.id || t.short || null) : t);
    }

    function field(opts) {
      const bad = notReady();
      if (bad) return bad;
      const o = opts || {};
      const detail = o.detail || "brief";
      if (["brief", "full"].indexOf(detail) < 0) {
        return fail("BadArgumentError", 'detail must be "brief" or "full"',
                    'call field({detail:"full"})');
      }
      const total = G.track.total;
      const sorted = G.cars.slice().sort((a, b) => b.prog - a.prog);
      const leader = sorted[0];
      const rows = sorted.map((c, i) => {
        const ahead = sorted[i - 1];
        const gapLeadM = leader.prog - c.prog;
        const intervalM = ahead ? ahead.prog - c.prog : 0;
        const v = Math.max(c.speed || 0, 5);
        const row = {
          pos: i + 1,
          id: c.id != null ? c.id : G.cars.indexOf(c),
          code: c.code || null,
          team: teamIdOf(c),
          isPlayer: !!c.isPlayer,
          lap: c.lap || 0,
          gapToLeaderS: i === 0 ? 0 : r2(gapLeadM / Math.max(leader.speed || v, 5)),
          intervalS: i === 0 ? 0 : r2(intervalM / v),
        };
        if (detail !== "brief") {
          row.frac = +(c.s / total).toFixed(4);
          row.speedKph = r1((c.speed || 0) * 3.6);
          row.gapToLeaderM = r1(gapLeadM);
          row.finished = !!c.finished;
          row.pace = r2(c.skill != null ? c.skill : 1);
          row.cuts = c.cuts || 0;
          row.timePenaltyS = c.penalty || 0;
        }
        return row;
      });
      const playerRow = rows.find((r) => r.isPlayer);
      return {
        apiVersion: API_VERSION, seq: ++seq, t: r2(G.raceT || 0),
        raceState: G.state,
        of: G.cars.length,
        lapsTarget: G.lapsTarget || null,
        player: playerRow ? { pos: playerRow.pos, lap: playerRow.lap,
                              gapToLeaderS: playerRow.gapToLeaderS,
                              intervalS: playerRow.intervalS } : null,
        positions: rows,
        note: "allocentric race order; gaps in seconds. world().rivals is the "
              + "egocentric nearest-few for a driving decision",
      };
    }

    function affordances(nc, rv) {
      const p = G.player, can = [], cannot = [];

      if (nc && nc.status.startsWith("BRAKE")) {
        can.push({ id: "brake", why: nc.status });
      } else if (nc && nc.suggestBrakeM > 0) {
        can.push({ id: "coast_to_brake_point",
                   why: nc.turn + " in " + nc.distM + " m; brake at "
                        + r1(nc.distM - nc.suggestBrakeM) + " m" });
      }

      const energy = p.energy || 0;
      if (energy > 0.05) {
        can.push({ id: "deploy_ers", why: "energy " + r2(energy) });
      } else {
        cannot.push({ id: "deploy_ers", why: "energy " + r2(energy) + " is below 0.05" });
      }

      if (p.xArmed) {
        can.push({ id: "active_aero_x_mode",
                   why: "straight road ahead; X-mode trades downforce for ~+7.5% top speed" });
      } else {
        cannot.push({ id: "active_aero_x_mode",
                      why: "not armed here — needs ~3 s of straight road ahead and no braking" });
      }

      const wallR = Tracks.wallAt(G.track, p.s, 1);
      const wallL = -Tracks.wallAt(G.track, p.s, -1);
      const clearR = wallR - p.x, clearL = p.x - wallL;
      const ahead = rv.find((r) => r.rel === "ahead" && r.gapM < 40);
      if (ahead) {
        for (const [side, clear] of [["left", clearL], ["right", clearR]]) {
          const blocked = ahead.side === side && ahead.gapM < 12;
          if (clear > 3 && !blocked) {
            const who = ahead.code || ("car " + ahead.id);
            can.push({ id: "overtake_" + side,
                       why: who + " " + ahead.gapS + " s ahead, "
                            + r1(clear) + " m clear to your " + side });
          } else {
            cannot.push({ id: "overtake_" + side,
                          why: blocked ? "rival is on that line"
                                       : r1(clear) + " m to the barrier" });
          }
        }
      }
      if (p.wrongWay) {
        can.push({ id: "reset", why: "facing the wrong way — __apex.resetPlayer()" });
      }
      return { affordances: can, unavailable: cannot };
    }

    function briefLine(ego, nc, rv) {
      const bits = [];
      bits.push("Lap " + ego.lap + ", P" + ego.pos);
      bits.push(r1(ego.speedKph) + " km/h in " + ego.gear);
      if (nc) {
        bits.push(nc.status.startsWith("in ")
          ? nc.status + " (" + nc.dir + ", " + nc.radiusM + " m)"
          : nc.turn + " " + nc.dir + " in " + nc.distM + " m — " + nc.status);
      }
      bits.push(ego.onTrack
        ? r1(Math.abs(ego.lateralM)) + " m " + (ego.lateralM > 0 ? "right" : "left") + " of centre"
        : "OFF TRACK");
      const near = rv[0];
      if (near && near.gapM < 40) {
        bits.push((near.code || "car " + near.id) + " " + near.gapS + " s "
                  + near.rel + " (" + near.threat + ")");
      }
      return bits.join(", ") + ".";
    }

    const DEAD_ABS = 0.25;      // absolute deadband
    const DEAD_REL = 0.02;      // ...or 2% of the value, whichever is larger

    function sameEnough(a, b) {
      if (typeof a !== "number" || typeof b !== "number") return a === b;
      return Math.abs(a - b) <= Math.max(DEAD_ABS, Math.abs(a) * DEAD_REL);
    }

    function deltaOf(prev, next) {
      if (prev === undefined) return next;
      if (Array.isArray(next) || Array.isArray(prev)) {
        if (Array.isArray(prev) && Array.isArray(next) && prev.length === next.length) {
          for (let i = 0; i < next.length; i++) {
            if (deltaOf(prev[i], next[i]) !== undefined) return next;
          }
          return undefined;
        }
        return next;
      }
      if (next && typeof next === "object" && prev && typeof prev === "object") {
        const out = {};
        let changed = false;
        for (const k of Object.keys(next)) {
          const d = deltaOf(prev[k], next[k]);
          if (d !== undefined) { out[k] = d; changed = true; }
        }
        return changed ? out : undefined;
      }
      return sameEnough(prev, next) ? undefined : next;
    }

    function applyDelta(base, d) {
      if (d === undefined) return base;
      if (d === null || typeof d !== "object" || Array.isArray(d)) return d;
      const out = Array.isArray(base) ? base.slice()
                : (base && typeof base === "object") ? Object.assign({}, base) : {};
      for (const k of Object.keys(d)) out[k] = applyDelta(out[k], d[k]);
      return out;
    }

    function world(opts) {
      const bad = notReady();
      if (bad) return bad;

      const o = opts || {};
      const detail = o.detail || "drive";
      if (["brief", "drive", "full"].indexOf(detail) < 0) {
        return fail("BadArgumentError", 'detail must be "brief", "drive" or "full"',
                    'call world({detail:"drive"})');
      }

      const p = G.player;
      const total = G.track.total;
      Tracks.sample(G.track, p.s, scr);
      const hw = scr.hw;
      const wallR = Tracks.wallAt(G.track, p.s, 1);
      const wallL = -Tracks.wallAt(G.track, p.s, -1);

      let headErr = Math.atan2(scr.t[0], scr.t[2]) - p.head;
      while (headErr > Math.PI) headErr -= 2 * Math.PI;
      while (headErr < -Math.PI) headErr += 2 * Math.PI;

      const ranked = G.cars.filter((c) => !c.retired).sort((a, b) => b.prog - a.prog);
      const pos = ranked.findIndex((c) => c.isPlayer) + 1;

      // The friction ellipse's longitudinal axis is weather-scaled, exactly as in
      // js/game.js's own combined-slip block and in apex.js's two copies. Dividing
      // by the dry LONG_GRIP alone reported a slip budget the physics never had —
      // optimistic by ~28% in the rain, i.e. wrong in the direction that puts an
      // agent reading world() into the barrier.
      const axFrac = clamp(Math.abs(p.axEstSm || 0)
                           / ((LONG_GRIP || 34) * (gripMult ? gripMult() : 1)), 0, 1);
      const slipFactor = Math.sqrt(Math.max(0, 1 - axFrac * axFrac));

      const ego = {
        lap: p.lap, pos, of: G.cars.length,
        frac: +(p.s / total).toFixed(4), s: r1(p.s),
        speedKph: r1(p.speed * 3.6), speed: r1(p.speed), gear: p.gear || 1,
        lateralM: r2(p.x), headingErrDeg: r1(headErr * 180 / Math.PI),
        onTrack: Math.abs(p.x) <= hw,
        halfWidthM: r1(hw),
        clearLeftM: r1(p.x - wallL), clearRightM: r1(wallR - p.x),
        energy: r2(p.energy || 0),
        penalties: {
          cuts: p.cuts || 0,
          // Off the RESETTING warning counter, not the lifetime `cuts` total —
          // after a penalty the ladder starts again, so a report derived from
          // `cuts` went to 0 and stayed there for the rest of the race.
          freeCutsLeft: Math.max(0, 3 - (p.cutWarn || 0)),
          timePenaltyS: p.penalty || 0,
          note: "cuts 1-3 warn; each cut from the 4th adds +5 s to your race time",
        },
        ers: {
          charge: r2(p.energy || 0),
          deploying: !!p.deploying,
          overtakeArmed: !!p.otArmed,
          boostRemainingS: r1(p.otT || 0),
          cooldownS: r1(p.otCool || 0),
          note: "overtake arms within ~1 s of the car ahead; 4 s boost, then 16 s cooldown",
        },
        aero: {
          mode: (p.aeroX || 0) > 0.05 ? "X" : "Z",
          flap: r2(p.aeroX || 0),
          requested: !!p.xOn,
          armed: !!p.xArmed,
          note: "X-mode = low drag, ~+7.5% top speed, ~45% less aero downforce. "
              + "Arms only with ~3 s of straight road ahead and shuts under braking",
        },
        grip: {
          slipFactor: r2(slipFactor),
          longUsedPct: Math.round(axFrac * 100),
          state: axFrac < 0.1 ? "neutral — full lateral grip available"
               : (p.axEstSm || 0) < 0 ? Math.round(axFrac * 100)
                   + "% of grip spent braking; lateral grip reduced"
               : Math.round(axFrac * 100)
                   + "% of grip spent accelerating; lateral grip reduced",
          surface: G.raceWeather === "dry" ? "dry" : G.raceWeather,
          gripMult: r2(gripMult ? gripMult() : 1),
        },
      };

      const nc = nextCorner(p.s, p.speed);
      const rv = rivals(detail === "full" ? 0 : 4);

      const payload = {
        apiVersion: API_VERSION, physicsVersion: PHYSICS_VERSION,
        seq: ++seq, t: r2(G.raceT || 0), detail,
        conventions: CONVENTIONS,
        raceState: G.state,
        track: { id: G.track.def.id, name: G.track.def.name, lengthM: r1(total) },
        ego,
        nextCorner: nc,
        brief: briefLine(ego, nc, rv),
      };

      if (detail !== "brief") {
        payload.pacenotes = pacenotes(p.s, p.speed);
        payload.ahead = lookahead(p.s, p.speed, o.horizonS || 4, o.points || 5);
        payload.nextCorners = upcomingCorners(p.s, p.speed, o.corners || 3);
        payload.rivals = rv;
        const aff = affordances(nc, rv);
        payload.affordances = aff.affordances;
        payload.unavailable = aff.unavailable;
      }

      if (detail === "full") {
        payload.session = {
          weather: G.raceWeather, timeOfDay: G.raceTimeOfDay,
          lapsTarget: G.lapsTarget, timeTrial: !!G.timeTrial,
          sector: (G.sectorIdx || 0) + 1,
          sectorBests: (G.sectorBests || []).map((v) => (isFinite(v) ? r2(v) : null)),
          sectorLast: (G.sectorLast || []).map((v) => (v == null ? null : r2(v))),
          // The seed makes a payload self-describing: an agent (or a bug report)
          // can reproduce the exact episode this snapshot came from with
          // reset(frac, speed, x, seed). Mode flags matter because they silently
          // change the rules — raceLineAssist steers for you, seasonMode changes
          // what a result means, unlimitedBudget removes the parts constraint
          // objective() describes.
          seed: G.seed,
          seasonMode: !!G.seasonMode,
          difficulty: G.difficulty != null ? G.difficulty : null,
          raceLineAssist: G.raceLineAssist != null ? G.raceLineAssist : null,
          unlimitedBudget: !!G.unlimitedBudget,
        };
        payload.terminal = terminal();
        payload.physics = {
          kRaw: +Tracks.curvature(G.track, p.s).toFixed(5),
          kSmoothed: +smoothK(p.s).toFixed(5),
          slipDeg: r1((p.slipDeg != null ? p.slipDeg : 0)),
          vLat: r2(p.vLat || 0), axEstSm: r2(p.axEstSm || 0),
          offTrackS: r2(p.offT || 0), onKerb: !!p.onKerb,
          brakeHeat: r2(p.brakeHeat || 0),
          rpm: Math.round(p.rpm || 0),
          offroad: !!p.offroad,
          stuckS: r2(p.stuckT || 0),
          wallContactS: r2(p.wallT || 0),
          vertLoad: r2(p.vertLoad != null ? p.vertLoad : 0),
        };
        payload.tunables = {
          WHEELBASE: G.WHEELBASE, PACE: G.PACE, DRIFT: G.DRIFT,
          ROAD_FOLLOW: G.ROAD_FOLLOW, PLAYER_GRIP: G.PLAYER_GRIP,
          FRONT_GRIP: G.FRONT_GRIP, YAW_DAMP: G.YAW_DAMP,
          YAW_INERTIA: G.YAW_INERTIA, LONG_GRIP: LONG_GRIP,
          note: "live values — __apex.setPhysics() mutates these at runtime",
        };
      }

      if (o.since != null) {
        if (!lastPayload || o.since !== lastSeq) {
          payload.deltaBase = null;
          payload.note = "no delta available for seq " + o.since + " — full payload returned";
        } else {
          const d = deltaOf(lastPayload, payload) || {};
          lastPayload = applyDelta(lastPayload, d);
          lastPayload.seq = payload.seq;
          lastSeq = payload.seq;
          d.apiVersion = API_VERSION; d.seq = payload.seq;
          d.deltaBase = o.since;
          return d;
        }
      }
      lastPayload = payload; lastSeq = payload.seq;
      return payload;
    }

    function terminal() {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      if (!G.player) {
        return fail("NoPlayerError", "the car grid has not been built",
                    "call __apex.race(id) then __apex.go()");
      }
      const p = G.player;
      const rescued = p.rescueLastT != null && (G.raceT - p.rescueLastT) < 0.5;
      let reason = null;
      if (p.retired) reason = "retired";
      else if (p.finished) reason = "finished";
      else if (p.wrongWay) reason = "wrong_way";
      else if (rescued) reason = "rescued";
      return { done: reason != null, reason };
    }

    const _raster = AgentRaster.create({
      G, fail, resolveCamera, model, corners, nextCorner, carWorld, scr,
      clamp, r1, r2, API_VERSION, CONVENTIONS, wrapS,
    });
    const frame = _raster.frame, plan = _raster.plan, carRender = _raster.carRender;
    // carView() — the car, without rendering it
    // Replaces tools/car/render-car.mjs for everything except "does it LOOK right":
    // team identity, livery, the full parts spec and what it does to the car,
    // the chassis silhouette knobs, and measured geometry from a real build.
    function carView(opts) {
      const o = opts || {};
      // player.team is the team OBJECT, not an id (js/game.js makeCars), so
      // taking it directly never matched Teams.LIST and every default-argument
      // call failed with NoTeamError.
      const pt = G.player && G.player.team;
      const teamId = o.team
                     || (pt && typeof pt === "object" ? pt.id : pt)
                     || (Teams.LIST[G.teamIdx] || Teams.LIST[0]).id;
      const team = Teams.LIST.find((t) => t.id === teamId);
      if (!team) {
        return fail("NoTeamError", 'unknown team "' + teamId + '"',
                    "call __apex.teams() for the valid ids");
      }
      const setup = o.parts || G.getTeamParts(team.id);
      const res = Parts.resolveSetup(setup, team);
      const style = Car3D.teamStyleOf(team.id);

      // Build the real mesh and measure it — the dimensions an agent would
      // otherwise read off a screenshot with a ruler.
      // render stays undefined (not null) unless asked for, so the key is
      // absent from the payload rather than a null the caller must filter.
      let geom = null, parts = null, render, meshRef = null;
      try {
        // measure: true asks Car3D.build for out.parts — the per-section bounding
        // boxes partGeometry reports. It is OPT-IN because computing it walks
        // every vertex of all 19 sections a SECOND time after the mesh is
        // already complete, allocating 19 objects each holding three fresh
        // arrays, for a field nothing on the render path reads: car3d.js's own
        // header documents the return shape as {pos,nrm,col,mat,idx} and parts
        // is not in it. This call site is its only consumer in the tree.
        // Measured in a plain realm on a real 11,028-vert car: 0.109 ms of a
        // 3.915 ms build (2.8%), and ~12-14 builds happen at a race start, so
        // gating it takes ~1.4 ms off the race-start hitch — the same beat
        // DebrisWorld.prime() was moved out of.
        const mesh = Car3D.build(team.color, team.color2,
                                 { parts: res.visual, teamId: team.id, measure: true });
        meshRef = mesh;
        const pos = mesh.pos;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity,
            z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < pos.length; i += 3) {
          if (pos[i] < x0) x0 = pos[i]; if (pos[i] > x1) x1 = pos[i];
          if (pos[i + 1] < y0) y0 = pos[i + 1]; if (pos[i + 1] > y1) y1 = pos[i + 1];
          if (pos[i + 2] < z0) z0 = pos[i + 2]; if (pos[i + 2] > z1) z1 = pos[i + 2];
        }
        const mats = {};
        for (const m of (mesh.mat || [])) mats[m] = (mats[m] || 0) + 1;
        parts = mesh.parts || null;
        geom = {
          vertices: pos.length / 3, triangles: (mesh.idx || []).length / 3,
          lengthM: r2(z1 - z0), widthM: r2(x1 - x0), heightM: r2(y1 - y0),
          wheelbaseM: r2(Car3D.AXLES.frontZ - Car3D.AXLES.rearZ),
          wheelRadiusM: Car3D.AXLES.wheelY,
          boundsM: { x: [r2(x0), r2(x1)], y: [r2(y0), r2(y1)], z: [r2(z0), r2(z1)] },
          note: "car local space: +z forward, +y up, +x right; origin at the "
                + "chassis datum, not the floor",
        };
      } catch (e) {
        geom = { error: "build failed: " + (e && e.message) };
      }

      // Orthographic text elevations — the text version of the car photo studio
      // (render-car.mjs). A filled-triangle silhouette from the real mesh, so
      // the outline is measured, not drawn. Three standard views; +z forward.
      if ((o.detail === "render" || o.detail === "all" || o.render) && meshRef && !geom.error) {
        render = carRender(meshRef, o.cols | 0 || 46, o.edgeThresh, o.ss);
      }

      return {
        apiVersion: API_VERSION,
        team: { id: team.id, name: team.name, short: team.short,
                engine: team.engine, tier: team.tier,
                colors: { primary: team.color, secondary: team.color2 },
                stats: team.stats,
                drivers: team.drivers.map((d) => ({ name: d.name, code: d.code, num: d.num })) },
        parts: {
          budget: Parts.BUDGET, spent: res.cost,
          remaining: Parts.BUDGET - res.cost,
          chosen: Parts.CATALOG.map((cat) => {
            const id = res.setup[cat.id];
            const opt = cat.options.find((x) => x.id === id) || cat.options[0];
            return { category: cat.id, label: cat.label, option: opt.id,
                     optionLabel: opt.label, cost: opt.cost, desc: opt.desc,
                     tier: res.tiers ? res.tiers[cat.id] : undefined,
                     supplier: opt.supplier };
          }),
          mods: res.mods,
        },
        chassis: {
          style,
          bespokeSilhouette: Object.prototype.hasOwnProperty.call(
            Car3D.TEAM_STYLE, team.id),
          axles: Car3D.AXLES,
          stations: { nose: Car3D.CHASSIS.nose, monocoque: Car3D.CHASSIS.monocoque,
                      cockpit: Car3D.CHASSIS.cockpit, floor: Car3D.CHASSIS.floor },
        },
        geometry: geom,
        render,
        // Per-part boxes, measured from the vertices each section of Car3D.build
        // emitted. "How big is the rear wing", "does the shark fin exist on this
        // team", "is the nose the right length" — without rendering the car.
        // NOT `parts` — that key is the parts SPEC above, and a second `parts`
        // in the same literal silently won, deleting the spec from the payload.
        partGeometry: (o.detail === "parts" || o.detail === "all") ? parts : undefined,
        partCount: parts ? parts.length : undefined,
        note: "everything the car viewer shows except appearance itself — for a "
              + "visual check use tools/car/render-car.mjs. "
              + 'Pass {detail:"parts"} for per-part measured boxes.',
      };
    }

    // survey() — geometry defects, as a report
    // The survey-track workflow currently says "assert with screenshots + the
    // probe, not by reasoning about coordinates" — because the coordinates were
    // not trustworthy enough to reason about. With measured prop bounds they
    // are, so the defect classes that workflow hunts by eye become queryable:
    // terrain holes that make props float, cliffs and steps, a sagging ribbon,
    // props over the racing line, terrain above the road.
    //
    // Thresholds are calibrated, not guessed. Props are deliberately sunk below
    // grade (place() by 0.8 m, anchor() by 0.3 m) so a naive "base above ground"
    // test flags every prop in the game; FLOAT_M is measured against that.
    // Only things that are supposed to stand ON the ground can "float".
    // Gantries span the track overhead, anonymous structures include roofs and
    // canopies, and landforms are placed in world coords — a 12.8 x 1.1 x 49.3 m
    // slab 13 m up is a roof, not a defect, and flagging it buries the real ones.
    const GROUNDED_KINDS = ["tree", "pine", "palm", "conifer", "bush", "hedge",
                            "prop", "building", "house", "motorhome", "tower",
                            "grandstand", "billboard", "signBoard", "marshalPost"];
    const FLOAT_M = 0.6;        // base this far ABOVE terrain = floating
    const BURIED_M = 4;         // base this far BELOW terrain = swallowed
    const CLIFF_SLOPE = 0.55;
    const OVER_ROAD_M = 0.15;   // terrain above road surface by this = poking through

    function survey(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const o = opts || {};
      const track = G.track, total = track.total;
      const nAt = clamp((o.stations | 0) || (o.at | 0) || 24, 2, 200);
      const reach = clamp(o.reachM || 60, 10, 400);
      const nLat = clamp(o.lats | 0 || 13, 3, 41);
      const cap = clamp(o.limit | 0 || 20, 1, 200);

      // lateral ground profile
      const profile = [], holes = [], cliffs = [], overRoad = [];
      for (let i = 0; i < nAt; i++) {
        const frac = i / nAt;
        const s = frac * total;
        Tracks.sample(track, s, scr);
        const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
        const ex = scr.r[0] / rl, ez = scr.r[2] / rl;
        const roadY = scr.p[1];
        const row = [];
        for (let j = 0; j < nLat; j++) {
          const lat = -reach + (2 * reach) * (j / (nLat - 1));
          const ty = Tracks.terrainY(track, scr.p[0] + ex * lat, scr.p[2] + ez * lat);
          row.push({ latM: r1(lat), terrainY: ty == null ? null : r2(ty) });
          // terrain poking through the racing surface
          if (ty != null && Math.abs(lat) <= scr.hw && ty - roadY > OVER_ROAD_M) {
            overRoad.push({ frac: +frac.toFixed(3), latM: r1(lat),
                            aboveRoadM: r2(ty - roadY) });
          }
        }
        const ribbonFrom = scr.hw + 2.4;
        for (let j = 1; j < row.length - 1; j++) {
          if (Math.abs(row[j].latM) < ribbonFrom) continue;
          if (row[j].terrainY == null && row[j - 1].terrainY != null
              && row.slice(j + 1).some((c) => c.terrainY != null)) {
            holes.push({ frac: +frac.toFixed(3), latM: row[j].latM });
          }
        }
        for (let j = 1; j < row.length; j++) {
          const a = row[j - 1].terrainY, b = row[j].terrainY;
          const dLat = Math.abs(row[j].latM - row[j - 1].latM) || 1;
          if (a != null && b != null && Math.abs(b - a) / dLat > CLIFF_SLOPE) {
            cliffs.push({ frac: +frac.toFixed(3),
                          fromLatM: row[j - 1].latM, toLatM: row[j].latM,
                          riseM: r2(b - a), slope: r2(Math.abs(b - a) / dLat) });
          }
        }
        profile.push({ frac: +frac.toFixed(3), roadY: r2(roadY),
                       halfWidthM: r1(scr.hw), samples: row });
      }

      const reg = track.props;
      const floating = [], buried = [], voidProps = [], propsOverRoad = [];
      let checked = 0;
      if (reg) {
        for (const p of reg.list) {
          const grounded = GROUNDED_KINDS.indexOf(p.kind) >= 0;
          if (grounded && p.measured) {
            checked++;
            const base = p.y - p.h / 2;
            const ty = Tracks.terrainY(track, p.x, p.z);
            if (ty == null) {
              voidProps.push({ kind: p.kind, at: [p.x, p.y, p.z] });
            } else {
              const gap = base - ty;
              if (gap > FLOAT_M) {
                floating.push({ kind: p.kind, at: [p.x, p.y, p.z], gapM: r2(gap),
                                sizeM: [p.w, p.h, p.d] });
              } else if (gap < -BURIED_M) {
                buried.push({ kind: p.kind, at: [p.x, p.y, p.z], gapM: r2(gap),
                              sizeM: [p.w, p.h, p.d] });
              }
            }
          }
          // Footprint over the racing surface. The lateral half-extent is NOT
          // max(w,d)/2: a 160 m grandstand runs its length ALONG the track, and
          // treating that as a radius flagged every stand on the circuit as
          // sitting on the road. For a world-axis-aligned box the true extent
          // along the track's right vector is the support function |w/2*ex| +
          // |d/2*ez|.
          // Anonymous hulls are mostly air (see `fill`), so an AABB overlapping
          // the road is not evidence of geometry on it — that reported 181
          // offenders on a circuit whose real prop-over-road count is zero.
          // Named props have tight measured boxes and can be judged; a dense
          // structure still can.
          // Gantries straddle the road by design — flagging them is noise.
          const judgeable = p.kind !== "gantry"
                            && ((p.measured && p.kind !== "structure")
                                || (p.fill != null && p.fill > 0.3));
          const pr = judgeable ? Tracks.project(track, p.x, p.z, null, p.y) : null;   // p.y: pick the right deck where the track crosses itself
          if (pr) {
            Tracks.sample(track, pr.s, scr);
            const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
            const ex = scr.r[0] / rl, ez = scr.r[2] / rl;
            const latHalf = Math.abs(p.w / 2 * ex) + Math.abs(p.d / 2 * ez);
            const over = scr.hw - (Math.abs(pr.lat) - latHalf);
            if (over > 0 && p.y + p.h / 2 > scr.p[1] + 0.3) {
              propsOverRoad.push({ kind: p.kind, at: [p.x, p.y, p.z],
                                   frac: +(pr.s / total).toFixed(3),
                                   lateralM: r1(pr.lat), halfWidthM: r1(scr.hw),
                                   overlapM: r2(over) });
            }
          }
        }
      }

      const md = track.modelDiagnostics || {};
      const byWorst = (a, b) => Math.abs(b.gapM || b.overlapM || 0)
                              - Math.abs(a.gapM || a.overlapM || 0);
      floating.sort(byWorst); buried.sort(byWorst); propsOverRoad.sort(byWorst);

      return {
        apiVersion: API_VERSION, conventions: CONVENTIONS,
        track: { id: track.def.id, name: track.def.name, lengthM: r1(total) },
        sampledAt: nAt, reachM: reach, latsPerStation: nLat,
        thresholds: { floatingAboveM: FLOAT_M, buriedBelowM: BURIED_M,
                      cliffSlope: CLIFF_SLOPE, terrainAboveRoadM: OVER_ROAD_M,
                      note: "props are deliberately sunk below grade (place 0.8 m, "
                            + "anchor 0.3 m), so `floating` means base above "
                            + "TERRAIN, not above zero" },
        summary: {
          propsChecked: checked,
          floating: floating.length, buried: buried.length,
          overVoid: voidProps.length,
          propsOverRoadCandidates: propsOverRoad.length,
          terrainHoles: holes.length, groundCliffs: cliffs.length,
          terrainOverRoad: overRoad.length,
          modelsSuppressed: (md.suppressed || []).length,
          modelsInvalid: (md.invalid || []).length,
          clean: !floating.length && !buried.length && !overRoad.length
                 && !holes.length && !cliffs.length && !(md.invalid || []).length,
        },
        floating: floating.slice(0, cap),
        buried: buried.slice(0, cap),
        overVoid: voidProps.slice(0, cap),
        // A SCREEN, not a verdict. Registry boxes are world-axis-aligned and
        // carry no orientation, so an elongated object on a curve inflates its
        // apparent lateral extent: on Monza this lists 6 candidates where the
        // vertex-level ground truth (tools/measure-props-over-road.mjs) is 0.
        propsOverRoadCandidates: propsOverRoad.slice(0, cap),
        terrainHoles: holes.slice(0, cap),
        groundCliffs: cliffs.slice(0, cap),
        terrainOverRoad: overRoad.slice(0, cap),
        modelDiagnostics: { suppressed: (md.suppressed || []).slice(0, cap),
                            invalid: (md.invalid || []).slice(0, cap) },
        profile: o.profile ? profile : undefined,
        authoritative: {
          propsOverRoad: "tools/measure-props-over-road.mjs (vertex-level)",
          terrainOverRoad: "tests/specs/terrain-over-road.spec.js",
        },
        note: "pass {profile:true} for the full lateral ground table. A terrain "
              + "hole (null between solid readings) is the classic cause of "
              + "floating props — the closed-form ground estimate takes over there.",
      };
    }

    const CLUSTER_KINDS = ["pine", "tree", "palm", "conifer", "bush", "hedge",
                           "prop", "signBoard", "marshalPost", "billboard",
                           "ridge", "peak", "structure"];
    // An anonymous assembly this big is a building-scale mass — a casino
    // frontage, a pit complex — and belongs with the landmarks even though the
    // emitters never named it. Below it, structures are street furniture and
    // cluster like everything else repeated.
    const BIG_STRUCTURE_M3 = 6000;
    // Individually notable structures — a driver would point at these.
    const LANDMARK_KINDS = ["grandstand", "building", "house", "motorhome",
                            "tower", "mountain", "gantry"];
    const CLUSTER_GAP_M = 60;
    const CLUSTER_MAX_RUN_M = 400;

    let modelCache = null;

    function sideOf(v) {
      if (v == null) return "off-course";
      return v > 0 ? "right" : v < 0 ? "left" : "across";
    }

    // Arc position and signed lateral offset of a recorded prop. Most carry the
    // node index they were placed from, which is exact and free.
    //
    // The rest need projecting — and the hint argument must be OMITTED, not
    // passed as 0. Tracks.project treats a hint as "search +/-16 nodes around
    // here", so hinting 0 snapped every anonymous structure on the circuit to
    // s = 0 and reported them all sitting on the start line.
    function propPos(p) {
      if (p.k != null) {
        const k = ((p.k % G.track.n) + G.track.n) % G.track.n;
        return { s: k / G.track.n * G.track.total, lat: null, sideSel: p.side != null ? p.side : null };
      }
      const pr = Tracks.project(G.track, p.x, p.z, null, p.y);   // p.y: see js/track/spline.js on self-crossing circuits
      return pr ? { s: pr.s, lat: pr.lat } : { s: 0, lat: null };
    }
    function propS(p) { return propPos(p).s; }

    function buildModel() {
      const track = G.track, total = track.total;
      const reg = track.props;
      const pts = reg.list.map((p) => {
        const pos = propPos(p);
        const side = p.side != null ? sideOf(p.side)
                   : pos.lat == null ? "off-course"
                   : pos.lat > 0 ? "right" : "left";
        return { p, s: pos.s, frac: pos.s / total, side, lat: pos.lat };
      });
      pts.sort((a, b) => (a.p.kind === b.p.kind
        ? (a.side === b.side ? a.s - b.s : a.side < b.side ? -1 : 1)
        : (a.p.kind < b.p.kind ? -1 : 1)));

      const features = [], landmarks = [], singles = [];
      let i = 0;
      while (i < pts.length) {
        const cur = pts[i];
        const bigStructure = cur.p.kind === "structure"
          && cur.p.w * cur.p.h * cur.p.d >= BIG_STRUCTURE_M3;
        if (bigStructure) { landmarks.push(cur); i++; continue; }
        if (CLUSTER_KINDS.indexOf(cur.p.kind) < 0) {
          (LANDMARK_KINDS.indexOf(cur.p.kind) >= 0 ? landmarks : singles).push(cur);
          i++; continue;
        }
        let j = i + 1;
        while (j < pts.length && pts[j].p.kind === cur.p.kind
               && pts[j].side === cur.side
               && pts[j].s - pts[j - 1].s <= CLUSTER_GAP_M
               && pts[j].s - cur.s <= CLUSTER_MAX_RUN_M) j++;
        const run = pts.slice(i, j);
        if (run.length < 3) { singles.push(...run); i = j; continue; }
        let hSum = 0, hMax = 0;
        for (const r of run) { hSum += r.p.h; if (r.p.h > hMax) hMax = r.p.h; }
        features.push({
          kind: cur.p.kind, count: run.length, side: cur.side,
          fromFrac: +run[0].frac.toFixed(4),
          toFrac: +run[run.length - 1].frac.toFixed(4),
          fromS: r1(run[0].s), toS: r1(run[run.length - 1].s),
          runLengthM: r1(run[run.length - 1].s - run[0].s),
          avgHeightM: r1(hSum / run.length), maxHeightM: r1(hMax),
        });
        i = j;
      }
      features.sort((a, b) => a.fromS - b.fromS);
      landmarks.sort((a, b) => a.s - b.s);
      singles.sort((a, b) => a.s - b.s);
      return { pts, features, landmarks, singles };
    }

    function model() {
      const key = G.track.def.id + "|" + G.track.props.count + "|" + Math.round(G.track.total);
      if (!modelCache || modelCache.key !== key) {
        modelCache = { key, m: buildModel() };
      }
      return modelCache.m;
    }

    function propId(i) { return "prop:" + i; }

    function parseId(id) {
      const s = String(id == null ? "" : id);
      const c = s.indexOf(":");
      return c < 0 ? { kind: s, ref: "" } : { kind: s.slice(0, c), ref: s.slice(c + 1) };
    }

    function describe(idOrOpts) {
      const bad = notReady();
      if (bad) return bad;
      const o = (idOrOpts && typeof idOrOpts === "object") ? idOrOpts : { id: idOrOpts };
      if (o.id == null || o.id === "") {
        return fail("BadArgumentError", "describe(id) needs an id",
                    'ids look like "prop:12", "corner:T3", "car:4", "span:2" — '
                    + "scene()/trackInfo()/field() return them");
      }
      const { kind, ref } = parseId(o.id);
      const track = G.track, total = track.total;

      if (kind === "corner") {
        const want = String(ref).toUpperCase();
        const c = corners().find((x) => x.turn.toUpperCase() === want);
        if (!c) {
          return fail("NotFoundError", 'no corner "' + ref + '" on ' + track.def.id,
                      'call trackInfo({what:"corners"}) for the turn ids');
        }
        const m = model();
        const near = m.pts.filter((q) => {
          return Math.abs(M4.wrapDelta(q.s - c.s, total)) <= 80;
        });
        const byKind = {};
        for (const q of near) byKind[q.p.kind] = (byKind[q.p.kind] || 0) + 1;
        return {
          apiVersion: API_VERSION, id: "corner:" + c.turn, type: "corner",
          corner: c,
          sceneryWithin80m: byKind,
          note: "the full corner record plus what stands within 80 m of its apex",
        };
      }

      if (kind === "car") {
        const idx = /^\d+$/.test(ref) ? Number(ref) : NaN;
        const car = G.cars.find((c, i) => (c.id != null ? c.id : i) === idx);
        if (!car) {
          return fail("NotFoundError", "no car " + ref,
                      "call field() for the grid and its car ids");
        }
        const p = G.player;
        const gap = (car.prog || 0) - (p.prog || 0);
        return {
          apiVersion: API_VERSION, id: "car:" + idx, type: "car",
          code: car.code || null, name: car.name || null, team: teamIdOf(car),
          isPlayer: !!car.isPlayer,
          lap: car.lap || 0, frac: +((car.s || 0) / total).toFixed(4), s: r1(car.s || 0),
          speedKph: r1((car.speed || 0) * 3.6), lateralM: r2(car.x || 0),
          onKerb: !!car.onKerb, gapToPlayerM: car.isPlayer ? 0 : r1(gap),
          rel: car.isPlayer ? "self" : gap >= 0 ? "ahead" : "behind",
          finished: !!car.finished,
        };
      }

      if (kind === "span") {
        const idx = /^\d+$/.test(ref) ? Number(ref) : NaN;
        const sp = (track.props && track.props.spans) || [];
        if (!(idx >= 0 && idx < sp.length)) {
          return fail("NotFoundError", "no span " + ref,
                      "spans are indexed 0.." + Math.max(0, sp.length - 1)
                      + '; call render({what:"circuit"}) to list them');
        }
        const s = sp[idx];
        const s0M = s.s0 * total, s1M = s.s1 * total;
        return {
          apiVersion: API_VERSION, id: "span:" + idx, type: "span",
          kind: s.kind, side: sideOf(s.side),
          fromS: r1(s0M), toS: r1(s1M),
          lengthM: r1(((((s.s1 - s.s0) % 1 + 1) % 1) || 1) * total),
          fromFrac: +s.s0.toFixed(4), toFrac: +s.s1.toFixed(4),
          heightM: s.h != null ? r1(s.h) : null,
          gapM: s.gap != null ? r1(s.gap) : null,
          note: "linear furniture recorded as a span, not per segment",
        };
      }

      if (kind === "prop") {
        const idx = /^\d+$/.test(ref) ? Number(ref) : NaN;
        const list = (track.props && track.props.list) || [];
        if (!(idx >= 0 && idx < list.length)) {
          return fail("NotFoundError", "no prop " + ref,
                      "props are indexed 0.." + Math.max(0, list.length - 1)
                      + "; call scene() or query() for ids near you");
        }
        const p = list[idx];
        const pos = propPos(p);
        const out = {
          apiVersion: API_VERSION, id: propId(idx), type: "prop",
          kind: p.kind,
          world: [r1(p.x), r1(p.y), r1(p.z)],
          sizeM: [r1(p.w), r1(p.h), r1(p.d)],
          volumeM3: r1(p.w * p.h * p.d),
          s: r1(pos.s), frac: +(pos.s / total).toFixed(4),
          side: p.side != null ? sideOf(p.side)
              : pos.lat == null ? "off-course" : pos.lat > 0 ? "right" : "left",
          lateralM: pos.lat == null ? null : r1(pos.lat),
          measured: !!p.measured, parts: p.parts != null ? p.parts : null,
          fill: p.fill != null ? r2(p.fill) : null,
        };
        if (p.board) out.boardText = p.board;
        if (p.value != null) out.value = p.value;
        if (G.player && G.player.px != null) {
          const dx = p.x - G.player.px, dz = p.z - G.player.pz;
          out.distM = r1(Math.hypot(dx, dz));
          out.bearingDeg = bearingDegTo(dx, dz, G.player.head);
        }
        // Which corner it stands by — the anchor a driver would actually use.
        const cs = corners();
        if (cs.length) {
          let best = null, bestD = Infinity;
          for (const c of cs) {
            const d = M4.wrapDelta(pos.s - c.s, total);
            if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = c; }
          }
          if (best) {
            out.nearestCorner = { id: "corner:" + best.turn, turn: best.turn,
                                  alongM: r1(bestD) };
          }
        }
        return out;
      }

      return fail("BadArgumentError", 'unknown id kind "' + kind + '"',
                  'ids are "prop:<n>", "corner:<turn>", "car:<n>" or "span:<n>"');
    }

    // atmosphere() — the light, as text
    // The largest reservoir of world state that never reached the agent.
    // __apex.lightState() is rich but raw: RGB triples, a sun vector, a fog
    // density. An agent cannot do anything with [0.31, 0.44, 0.68]. So this
    // NARRATES it — sun elevation and where it sits relative to the car,
    // brightness, whether the floodlights are carrying the scene, how far you
    // can see through the fog — and keeps the raw numbers alongside for anything
    // that wants to measure rather than read.
    function lum(c) { return c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : 0; }

    function atmosphere() {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const fr = G.frame || {}, sky = G.frameSky || {};
      const tod = G.raceTimeOfDay || "default";
      const wx = G.raceWeather || "dry";
      const sun = fr.sunDir || sky.sunDir || null;

      const dark = tod === "night" || tod === "dusk" || tod === "dawn"
                || (tod === "default" && !!(G.track.def && G.track.def.night));

      const body = dark ? "moon" : "sun";
      let elevDeg = null, relBearingDeg = null, where = null;
      if (sun) {
        elevDeg = r1(Math.asin(clamp(sun[1], -1, 1)) * 180 / Math.PI);
        if (G.player && G.player.px != null) {
          const b = bearingDegTo(sun[0], sun[2], G.player.head);
          relBearingDeg = r1(b);
          const a = Math.abs(b);
          where = elevDeg < 0 ? "below the horizon"
                : a < 30 ? (dark ? "ahead" : "ahead — low sun in your eyes on this stretch")
                : a > 150 ? "behind you"
                : b > 0 ? "to your right" : "to your left";
        }
      }

      const ambSky = fr.ambientSky ? fr.ambientSky.slice(0, 3) : null;
      const ambGround = fr.ambientGround ? fr.ambientGround.slice(0, 3) : null;
      const skyL = lum(ambSky), sunL = lum(fr.sunColor);
      const nLights = fr.lights ? fr.lights.length / 15 : 0;
      const flood = G._lastFloodEmit || 0;

      const fog = fr.fogDensity != null ? +fr.fogDensity : null;
      const visM = fog && fog > 1e-6 ? Math.round(Math.sqrt(3) / fog) : null;

      const brightness = skyL > 0.55 ? "bright"
                       : skyL > 0.25 ? "overcast-bright"
                       : skyL > 0.08 ? "dim"
                       : "dark";
      const wet = wx === "wet" || wx === "rain";

      const bits = [];
      bits.push(tod === "default" ? (dark ? "night" : "day") : tod);
      bits.push(brightness);
      if (wet) bits.push(wx === "rain" ? "raining, road wet and reflective"
                                       : "road wet and reflective");
      else if (wx !== "dry") bits.push(wx);
      if (dark && (flood > 0.01 || nLights > 0)) {
        bits.push("floodlit (" + Math.round(nLights) + " lights active)");
      }
      if (where) bits.push(body + " " + where);
      if (visM != null && visM < 900) bits.push("visibility ~" + visM + " m");
      if (sky.stars) bits.push("stars out");
      if (sky.moon) bits.push("moon up");

      return {
        apiVersion: API_VERSION, seq: ++seq,
        brief: bits.join(", ") + ".",
        timeOfDay: tod, weather: wx, wetRoad: wet,
        dark, brightness,
        sun: { body, elevationDeg: elevDeg, relBearingDeg, where,
               brightness: r2(sunL),
               note: "elevation + = above the horizon; relBearingDeg is from the "
                     + "car's nose, + = to its right. At night the renderer keeps "
                     + "the sun direction and dims it to moonlight, so `body` says "
                     + "which one this actually is" },
        lights: { active: Math.round(nLights), floodEmit: r2(flood),
                  builtForNight: !!G.builtTrackNight },
        visibility: { fogDensity: fog != null ? +fog.toFixed(5) : null,
                      approxRangeM: visM },
        exposure: fr.exposure != null ? r2(fr.exposure) : null,
        raw: { ambientSky: ambSky ? ambSky.map(r2) : null,
               ambientGround: ambGround ? ambGround.map(r2) : null,
               sunColor: fr.sunColor ? fr.sunColor.slice(0, 3).map(r2) : null,
               sunDir: sun ? sun.slice(0, 3).map(r2) : null,
               fogColor: fr.fogColor ? fr.fogColor.slice(0, 3).map(r2) : null },
        note: "grip is affected by weather — see world().ego.grip.gripMult. "
              + "Raw RGB is kept for measurement; read `brief` to know the scene",
      };
    }

    function query(opts) {
      const bad = notReady();
      if (bad) return bad;
      const o = opts || {};
      const track = G.track, total = track.total;
      const reg = track.props;
      if (!reg) {
        return fail("NoRegistryError", "this track was built without a prop registry",
                    'reload the track with __apex.race("<id>")');
      }
      const cap = clamp(o.limit | 0 || 40, 1, 400);
      const kinds = o.kind ? (Array.isArray(o.kind) ? o.kind : [o.kind]) : null;

      // near: metres around the car. from/to: an arc-position window in metres.
      if (o.near != null && !isNum(o.near)) {
        return fail("BadArgumentError", "near must be a finite number of metres",
                    "e.g. query({kind:'pine', near:150})");
      }
      if ((o.fromS != null && !isNum(o.fromS)) || (o.toS != null && !isNum(o.toS))) {
        return fail("BadArgumentError",
                    "fromS/toS must be finite arc positions in metres",
                    "e.g. query({fromS:0, toS:400}); a non-numeric bound used to "
                    + "filter every row out and read as an empty result");
      }
      const nearM = o.near != null ? Math.max(1, +o.near) : null;
      const hasWin = o.fromS != null && o.toS != null;
      const s0 = hasWin ? wrapS(+o.fromS) : 0, s1 = hasWin ? wrapS(+o.toS) : 0;
      const inWindow = (s) => {
        if (!hasWin) return true;
        return s0 <= s1 ? (s >= s0 && s <= s1) : (s >= s0 || s <= s1);
      };
      const px = G.player.px, pz = G.player.pz, head = G.player.head;

      const hits = [];
      for (let i = 0; i < reg.list.length; i++) {
        const p = reg.list[i];
        if (kinds && kinds.indexOf(p.kind) < 0) continue;
        const pos = propPos(p);
        if (!inWindow(pos.s)) continue;
        const dx = p.x - px, dz = p.z - pz;
        const d = Math.hypot(dx, dz);
        if (nearM != null && d > nearM) continue;
        hits.push({ i, p, pos, d,
                    bearingDeg: bearingDegTo(dx, dz, head) });
      }
      hits.sort((a, b) => (nearM != null ? a.d - b.d : a.pos.s - b.pos.s));
      const total_ = hits.length;
      const page = hits.slice(0, cap);

      const protos = {};
      for (const h of page) {
        const k = h.p.kind;
        (protos[k] || (protos[k] = [])).push(h.p);
      }
      const prototypes = {};
      for (const k of Object.keys(protos)) {
        const arr = protos[k];
        const mid = arr[Math.floor(arr.length / 2)];
        prototypes[k] = { sizeM: [r1(mid.w), r1(mid.h), r1(mid.d)], count: arr.length };
      }

      const instances = page.map((h) => {
        const row = {
          id: propId(h.i), kind: h.p.kind,
          s: r1(h.pos.s),
          side: h.p.side != null ? sideOf(h.p.side)
              : h.pos.lat == null ? "off-course" : h.pos.lat > 0 ? "right" : "left",
          distM: r1(h.d), bearingDeg: h.bearingDeg,
        };
        const pr = prototypes[h.p.kind].sizeM;
        const dv = [h.p.w, h.p.h, h.p.d];
        for (let a = 0; a < 3; a++) {
          if (pr[a] > 0.01 && Math.abs(dv[a] - pr[a]) / pr[a] > 0.25) {
            row.sizeM = [r1(dv[0]), r1(dv[1]), r1(dv[2])];
            break;
          }
        }
        if (h.p.board) row.boardText = h.p.board;
        return row;
      });

      return {
        apiVersion: API_VERSION, seq: ++seq, conventions: CONVENTIONS,
        filter: { kind: kinds, near: nearM, fromS: hasWin ? r1(s0) : null,
                  toS: hasWin ? r1(s1) : null, limit: cap },
        matched: total_, returned: instances.length,
        truncated: total_ > instances.length ? total_ - instances.length : 0,
        prototypes,
        instances,
        note: "prototypes give the shape per kind; an instance repeats sizeM only "
              + "when it differs >25%. Call describe(id) for everything about one. "
              + "Results are capped — narrow with kind/near/fromS+toS rather than "
              + "raising limit",
      };
    }

    // Which corner-to-corner section an arc position falls in.
    function sectionsOf(list, total) {
      if (!list.length) return [{ from: "start", to: "start", s0: 0, s1: total }];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i], b = list[(i + 1) % list.length];
        out.push({ from: a.turn, to: b.turn, s0: a.s, s1: b.s });
      }
      return out;
    }

    function inSection(s, sec, total) {
      return sec.s0 <= sec.s1 ? (s >= sec.s0 && s < sec.s1)
                              : (s >= sec.s0 || s < sec.s1);
    }

    function worldModel(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      if (!G.track.props) {
        return fail("NoRegistryError",
                    "this track was built without a prop registry",
                    'reload the track with __apex.race("<id>")');
      }
      const o = opts || {};
      const detail = o.detail || "summary";
      if (["summary", "sections", "full"].indexOf(detail) < 0) {
        return fail("BadArgumentError",
                    'detail must be "summary", "sections" or "full"',
                    'call render({what:"circuit", detail:"sections"})');
      }
      const track = G.track, total = track.total, def = track.def;
      const reg = track.props;
      const m = model();
      const cs = corners();

      const byKind = {};
      for (const p of reg.list) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
      const spanByKind = {};
      for (const sp of reg.spans) spanByKind[sp.kind] = (spanByKind[sp.kind] || 0) + 1;

      const out = {
        apiVersion: API_VERSION, conventions: CONVENTIONS, detail,
        track: {
          id: def.id, name: def.name, country: def.country || null,
          lengthM: r1(total), street: !!def.street, laps: def.laps || null,
          theme: def.theme || null, night: !!def.night,
        },
        layout: {
          corners: cs.length,
          turns: cs.map((c) => c.turn + " " + c.dir + " r" + c.radiusM),
          sectors: def.sectors
            ? [{ sector: 1, fromFrac: 0, toFrac: def.sectors[0] },
               { sector: 2, fromFrac: def.sectors[0], toFrac: def.sectors[1] },
               { sector: 3, fromFrac: def.sectors[1], toFrac: 1 }]
            : null,
        },
        totals: {
          objects: reg.count, spans: reg.spanCount,
          byKind, spansByKind: spanByKind,
          lampPosts: (track.lampPosts || []).length,
          registryComplete: reg.dropped === 0, dropped: reg.dropped,
        },
        features: m.features,
        spans: reg.spans.map((sp) => ({
          kind: sp.kind, side: sp.side > 0 ? "right" : "left",
          fromFrac: sp.s0, toFrac: sp.s1,
          lengthM: r1(((((sp.s1 - sp.s0) % 1 + 1) % 1) || 1) * total),
          gapM: sp.gap, h: sp.h != null ? sp.h : undefined,
        })),
        landmarks: m.landmarks.map((L) => ({
          kind: L.p.kind, frac: +L.frac.toFixed(4), s: r1(L.s), side: L.side,
          sizeM: [L.p.w, L.p.h, L.p.d], at: [L.p.x, L.p.y, L.p.z],
          parts: L.p.parts,
          offsetM: L.lat != null && L.p.side == null ? r1(Math.abs(L.lat)) : undefined,
        })),
        note: "kind 'structure' is an ANONYMOUS assembly of primitives the "
              + "circuit's own scenery() emitted without a named helper — real "
              + "measured bounds, no label. features are CLUSTERED runs of one kind on one side; landmarks "
              + "are individually notable structures; spans are linear furniture. "
              + 'Use detail:"full" for the unaggregated object list.',
      };

      if (detail === "sections" || detail === "full") {
        const secs = sectionsOf(cs, total);
        out.sections = secs.map((sec) => {
          const contains = {};
          for (const q of m.pts) if (inSection(q.s, sec, total)) {
            contains[q.p.kind] = (contains[q.p.kind] || 0) + 1;
          }
          const corner = cs.find((c) => c.turn === sec.from);
          return {
            from: sec.from, to: sec.to,
            fromFrac: +(sec.s0 / total).toFixed(4),
            lengthM: r1(((sec.s1 - sec.s0 + total) % total)),
            corner: corner ? { dir: corner.dir, radiusM: corner.radiusM,
                               severity: corner.severity } : null,
            contains,
          };
        });
      }

      if (detail === "full") {
        const off = Math.max(0, o.offset | 0);
        const lim = clamp(o.limit | 0 || 500, 1, 5000);
        out.objects = reg.list.slice(off, off + lim).map((p) => ({
          kind: p.kind, at: [p.x, p.y, p.z], sizeM: [p.w, p.h, p.d],
          side: sideOf(p.side),
          frac: +(propS(p) / total).toFixed(4),
          board: p.board, value: p.value,
        }));
        out.objectPage = { offset: off, limit: lim, returned: out.objects.length,
                           total: reg.count,
                           more: off + out.objects.length < reg.count };
      }

      return out;
    }

    function cornerAt(s, list) {
      for (const c of list) {
        if (c.entryS <= c.exitS) { if (s >= c.entryS && s <= c.exitS) return c; }
        else if (s >= c.entryS || s <= c.exitS) return c;
      }
      return null;
    }

    function rollout(opts) {
      const bad = notReady();
      if (bad) return bad;
      const o = opts || {};
      // A NaN here survives clamp() (every comparison is false), makes ticks NaN,
      // and `i < NaN` never runs a single tick — so the digest came back looking
      // successful with Infinity/-Infinity speeds and no ok:false to warn you.
      if ((o.dt != null && !isNum(o.dt)) || (o.seconds != null && !isNum(o.seconds))
          || (o.policyHz != null && !isNum(o.policyHz))) {
        return fail("BadArgumentError",
                    "dt, seconds and policyHz must be finite numbers",
                    "omit them for the defaults (dt 1/60, seconds 5, policyHz 10)");
      }
      if (o.policy != null && typeof o.policy !== "function") {
        return fail("BadArgumentError", "policy must be a function",
                    "policy is world => ({steer,throttle,brake}); use `input` for "
                    + "a constant input instead");
      }
      const dt = clamp(numOr(o.dt, 1 / 60), 1 / 240, 1 / 10);
      const seconds = clamp(numOr(o.seconds, 5), 0.05, 120);
      const ticks = Math.max(1, Math.round(seconds / dt));
      const policy = typeof o.policy === "function" ? o.policy : null;
      const policyEvery = Math.max(1, Math.round(1 / (numOr(o.policyHz, 10) * dt)));
      const nSamples = clamp(o.samples | 0 || 12, 2, 60);
      const sampleEvery = Math.max(1, Math.floor(ticks / nSamples));

      // Promote out of the countdown, exactly as act() does, so physics advances.
      if (G.state === "count") {
        G.state = "race"; G.raceT = 0;
        if (els && els.lights) {
          els.lights.hidden = true;
          for (const l of els.lights.children) l.classList.remove("on");
        }
      }
      // savedInput is captured BEFORE the o.input write so a rollout is fully
      // side-effect-free: a POLICY's last per-tick decision must not stay
      // latched as the live loop's input after the rollout returns.
      const savedPayload = lastPayload, savedSeq = lastSeq, savedCounter = seq, savedInput = G._testInput;
      if (o.input !== undefined) G._testInput = o.input || null;

      const p = G.player;
      const list = corners();
      const startProg = p.prog || 0, startT = G.raceT || 0, startLap = p.lap || 0;
      const startFrac = p.s / G.track.total;
      let minSpeed = Infinity, maxSpeed = -Infinity, sumSpeed = 0;
      let offTicks = 0, offEvents = 0, wasOff = false;
      let minClear = Infinity, contacts = 0, wasContact = false;
      let terminalReason = null, terminalAtT = null;
      const terminalEvents = []; let lastSeenReason = null;
      const cornerMin = {};
      const samples = [];

      for (let i = 0; i < ticks; i++) {
        if (policy && i % policyEvery === 0) {
          let inp = null;
          try { inp = policy(world({ detail: "brief" })); }
          catch (e) {
            lastPayload = savedPayload; lastSeq = savedSeq; seq = savedCounter;
            if (policy) G._testInput = savedInput;
            return fail("PolicyError", "the policy function threw: " + (e && e.message),
                        "fix the policy; it receives world({detail:'brief'}) and "
                        + "must return {steer,throttle,brake} or null");
          }
          if (inp && !isNum(inp.steer)) inp = Object.assign({}, inp, { steer: 0 });
          G._testInput = inp || null;
        }
        for (let j = 0; j < G.cars.length; j++) {
          const c = G.cars[j]; c.rPrevS = c.s; c.rPrevX = c.x;
        }
        update(dt);

        const sp = p.speed || 0;
        if (sp < minSpeed) minSpeed = sp;
        if (sp > maxSpeed) maxSpeed = sp;
        sumSpeed += sp;

        Tracks.sample(G.track, p.s, scr);
        const off = Math.abs(p.x) > scr.hw;
        if (off) { offTicks++; if (!wasOff) offEvents++; }
        wasOff = off;

        const cl = Math.min(Tracks.wallAt(G.track, p.s, 1) - p.x,
                            p.x + Tracks.wallAt(G.track, p.s, -1));
        if (cl < minClear) minClear = cl;
        const inContact = (p.contactT || 0) > 0;
        if (inContact && !wasContact) contacts++;
        wasContact = inContact;

        const cAt = cornerAt(p.s, list);
        if (cAt) {
          const prev = cornerMin[cAt.turn];
          if (prev === undefined || sp < prev) cornerMin[cAt.turn] = sp;
        }

        // Record EVERY terminal event, not just the first. Freezing on the first
        // one hid a later, more important state: a run that was rescued early and
        // then went on to FINISH reported only "rescued", so an agent scoring the
        // interval off digest.terminal never learned the race was completed.
        // Repeat rescues were invisible the same way.
        {
          const t = terminal();
          if (t.done && t.reason) {
            const atS = r2(G.raceT - startT);
            if (t.reason !== lastSeenReason) {
              terminalEvents.push({ reason: t.reason, atS });
              lastSeenReason = t.reason;
            }
            if (!terminalReason) { terminalReason = t.reason; terminalAtT = atS; }
          } else if (!t.done) {
            lastSeenReason = null;   // re-arm, so a second rescue is its own event
          }
        }

        if (i % sampleEvery === 0 || i === ticks - 1) {
          samples.push({ t: r2(G.raceT - startT), frac: +(p.s / G.track.total).toFixed(4),
                         speedKph: r1(sp * 3.6), lateralM: r1(p.x), gear: p.gear || 1 });
        }
      }

      lastPayload = savedPayload; lastSeq = savedSeq; seq = savedCounter;
      if (policy) G._testInput = savedInput;

      const elapsed = (G.raceT || 0) - startT;
      const lapsDone = (p.lap || 0) - startLap;
      return {
        apiVersion: API_VERSION, physicsVersion: PHYSICS_VERSION,
        conventions: CONVENTIONS,
        ran: { ticks, dt: +dt.toFixed(5), seconds: r2(elapsed),
               policy: policy ? "closed-loop at " + (o.policyHz || 10) + " Hz"
                              : "open-loop constant input" },
        from: { frac: +startFrac.toFixed(4), lap: startLap },
        to: { frac: +(p.s / G.track.total).toFixed(4), lap: p.lap || 0 },
        distanceM: r1((p.prog || 0) - startProg),
        speedKph: { min: r1(minSpeed * 3.6), max: r1(maxSpeed * 3.6),
                    mean: r1(sumSpeed / ticks * 3.6), final: r1((p.speed || 0) * 3.6) },
        offTrack: { events: offEvents, seconds: r2(offTicks * dt),
                    pct: r1(offTicks / ticks * 100) },
        minClearanceM: r1(minClear),
        wallContacts: contacts,
        lapsCompleted: lapsDone,
        lastLapS: lapsDone > 0 && p.lastLap ? r2(p.lastLap) : null,
        cornerMinSpeedKph: Object.keys(cornerMin).map((t) =>
          ({ turn: t, minSpeedKph: r1(cornerMin[t] * 3.6) })),
        terminal: { done: !!terminalReason, reason: terminalReason, atS: terminalAtT,
                    events: terminalEvents,
                    last: terminalEvents.length
                      ? terminalEvents[terminalEvents.length - 1] : null },
        samples,
        note: "a digest of " + ticks + " physics ticks — call world() for the "
              + "current state, this describes the interval",
      };
    }

    function render(opts) {
      const o = opts || {};
      const what = o.what || "view";
      let out, kind;
      switch (what) {
        case "view":    out = frame(o);      kind = "camera view";   break;
        case "map":     out = plan(o);       kind = "top-down map";  break;
        case "circuit": out = worldModel(o); kind = "whole circuit"; break;
        case "car":
          out = carView(Object.assign({}, o, { detail: o.detail || "render" }));
          kind = "car elevations";
          break;
        default:
          return fail("BadArgumentError",
                      'what must be "view", "map", "circuit" or "car"',
                      'call render({what:"view"})');
      }
      if (out && out.ok !== false) {
        out.what = what;
        out.aid = "APPROXIMATE " + kind + " raster — a coarse composition aid, "
                + "not a measurement. Read geometry from world()/scene()/"
                + "trackInfo(), not from these glyphs.";
      }
      return out;
    }

    // Static win condition / trade-offs only — learn car dynamics via rollout()/act().
    function objective() {
      return {
        apiVersion: API_VERSION,
        goal: "Finish the race ahead of the other 21 cars. Race position is by "
            + "distance covered (prog), so completing laps fastest wins.",
        winCondition: {
          race: "lowest total time over lapsTarget laps; time penalties are added",
          timeTrial: "lowest single lap time; no rivals to pass",
        },
        tradeoffs: [
          "TRACK LIMITS: running wide is faster but cuts 1-3 warn and every cut "
          + "from the 4th adds +5 s. Free speed until it suddenly is not.",
          "ERS: charge drains ~0.20/s deploying and regenerates ~0.115/s, so "
          + "deployment costs roughly 2 s of recharge per 1 s spent. Spend it "
          + "where speed converts to distance — long straights, not corners.",
          "OVERTAKE BOOST: arms only within ~1 s of the car ahead; 4 s of boost "
          + "then 16 s of cooldown, so firing it early wastes the window.",
          "PARTS: a 600-credit budget across 12 categories. Every credit in "
          + "engine/aero is a credit not in brakes/tyres — see carView().",
        ],
        constraints: [
          "Driving backwards flags wrongWay; staying stuck ~3 s triggers an "
          + "automatic rescue that costs far more time than recovering yourself.",
          "Barriers are hard: the car is clamped, not stopped. Contact scrubs "
          + "speed and you keep the position loss.",
        ],
        units: "metres, m/s, seconds, degrees where a key says Deg. +x is right "
             + "of the centreline; +k is a LEFT-hand turn.",
        note: "STATIC facts about the game. How the CAR behaves is not described "
            + "here on purpose — learn it by calling rollout()/act() and reading "
            + "world(), which stays true when the physics is retuned.",
      };
    }

    function agentHelp() {
      return {
        apiVersion: API_VERSION, physicsVersion: PHYSICS_VERSION,
        conventions: CONVENTIONS,
        perceive: {
          "world({detail,horizonS,points,corners,since})":
            "WHERE AM I — egocentric snapshot, the per-tick spine. "
            + "detail brief|drive|full; `since` returns only what changed",
          "field({detail})":
            "THE GRID — race order, gap-to-leader and interval. "
            + "world().rivals is the egocentric nearest-few",
          "scene({radius,kinds,limit} | {visible:true})":
            "WHAT IS AROUND ME — named scenery by distance and bearing; "
            + "{visible:true} switches to the camera's on-screen list",
          "atmosphere()":
            "WHAT IS THE LIGHT DOING — day/night, sun or moon, floodlights, "
            + "fog visibility, wet road. Raw values kept for measurement",
          "render({what,cols,ss,...})":
            "SHOW IT — the one optional raster, APPROXIMATE. "
            + "what: 'view'|'map'|'circuit'|'car'. For intuition, not measurement",
        },
        detail: {
          "describe(id)":
            "EVERYTHING ABOUT ONE THING — 'prop:12' | 'corner:T3' | 'car:4' | "
            + "'span:2'. ids come back from scene()/query()/trackInfo()/field()",
          "query({kind,near,fromS,toS,limit})":
            "A BOUNDED SLICE — filters compose; returns prototype + instances so "
            + "repeated dressing costs one shape plus a position each. Narrow the "
            + "filter rather than raising limit",
        },
        know: {
          "trackInfo({what})":
            "STATIC substrate — corners|sectors|profile|all. Fetch ONCE. Corners "
            + "carry radius, apexSpeedKph, straightAfterM/exitsOntoStraight (no "
            + "line), plus bankingDeg/camber, gradientPct/elevation and kerbs",
          "carView({team,parts,detail})":
            "WHAT AM I DRIVING — team, parts spec + effects, chassis silhouette, "
            + 'measured geometry; detail:"parts" adds per-part boxes',
          "survey({stations,lats,reachM,limit,profile})":
            "IS ANYTHING BROKEN — floating/buried props, props over the line, "
            + "terrain through the road, holes and cliffs",
          "perf()":
            "GOVERNOR SNAPSHOT — scale/fps/tier/autoTier/userTier/strikes "
            + "(alias of renderScale report)",
        },
        act: {
          "rollout({seconds,dt,input,policy,policyHz,samples})":
            "drive an interval, return a digest instead of every frame",
          "terminal()": "{done, reason} — retired|finished|wrong_way|rescued|null",
          "objective()": "WHAT AM I TRYING TO DO — win condition, the trade-offs (track limits, ERS, overtake, parts budget), hard constraints. Static; read once",
          // agentHelp() itself is deliberately absent: it is not an act, and an
          // entry describing the call whose output you are already reading is
          // the one line in here that can never tell anybody anything.
        },
        // What the numbers MEAN, in terms of what to do about them. The single
        // best-measured context intervention available: BIRD text-to-SQL went
        // 34.9% -> 54.9% purely from one sentence per question tying surface
        // identifiers to domain meaning. The value is in "what changes if you
        // act on it", not "what it is" — a field named headingErrDeg already
        // says it is a heading error in degrees.
        //
        // It lives HERE, in the read-once manifest, and deliberately not in
        // world(): per-tick payloads are the hot path, and the same augmentation
        // done carelessly costs +67% execution steps (MCP description study).
        // Static meaning belongs where it is read once. Keep every line short.
        // Fields whose meaning the PAYLOAD already carries in a `note`
        // (grip.state, penalties.note, ers.note, nextCorner.note) are absent
        // on purpose — saying it in both places is the bloat this is meant
        // to avoid, and the payload copy travels with the value.
        fields: {
          "ego.headingErrDeg": "+ = nose right of the road; steer the opposite sign to null it",
          "ego.lateralM": "+ = right of centreline; the road runs out at halfWidthM",
          "ego.clearLeftM/RightM": "metres to the barrier each side; small = no room to defend",
          "ego.onTrack": "false means you are on grass — grip is gone, straighten first",
          "nextCorner.status": "the braking call — BRAKE NOW means brake this instant",
          "nextCorner.apexSpeedKph": "roughly the fastest you can be at the apex and still hold it",
          "nextCorner.exitsOntoStraight": "true = prioritise exit speed over entry speed here",
          "pacenotes": "the road ahead as a co-driver call: dir + severity 1-6 @ distance",
          "rivals[].closingMps": "+ = the gap is shrinking, whichever side they are on",
          "rivals[].pace": "AI skill ~0.92-1.02; a slower car will not hold the position",
          "terminal.reason": "why the episode ended — retired vs finished vs wrong_way vs rescued",
          "session.seed": "replay this exact episode with reset(frac, speed, x, seed)",
        },
        read: {
          telemetry: "probe() physState() obs() scan() inputState() cars() carAt(i)",
          timing: "timing() sectorState() lapHistory() fieldState()",
          rendering: "camState() viewState() lightState() gpuTimer() lightTune()",
          geometry: "corners() wallStats() trackProfile() trackShape() groundY(f,l)",
          catalog: "tracks() teams() info()",
        },
        control: {
          stage: 'race(id) go() jump(frac,speed,x) park(f) reset(f,v,x,seed) finishRace()',
          reproduce: "seed(n) sets the sim seed; same seed + same inputs => same "
                   + "result. Pin it before any A/B or the comparison is noise",
          drive: "act({steer,throttle,brake},dt,n) setInput(o) step(dt,n) clearInput()",
          world: "weather('wet') setTimeOfDay('night') setPhysics(o) headless(bool)",
          field: "aiPlace(i,frac,v,x) setEnergy(v) setLap(n)",
        },
        model: {
          "static vs dynamic": "trackInfo()+carView() are constant — fetch once. "
            + "world()+field()+scene() are the live frame — read per decision",
          "decide vs show": "read world()/scene()/trackInfo()/the read hooks to "
            + "DECIDE; call render() only to SEE — its glyphs are approximate",
          "lean default, pull detail": "the world is stored in FULL but never "
            + "dumped — a flat serialisation is huge and reads worse. Keep the "
            + "default lean and pull with describe(id)/query() where a decision "
            + "needs it",
          "per tick": 'world({detail:"brief", since:<seq>}) — ~355 bytes/step, '
            + "34x cheaper than full. detail is the big lever",
        },
        setup: ['__apex.race("monza")', "__apex.go()", "__apex.jump(0.1, 55)"],
        loop: "world() -> decide -> rollout({seconds, policy}) -> read the digest",
        cli: "node tools/agent.mjs <track> <help|world|field|scene|atmosphere|"
             + "objective|model|describe|query|render|track|car|survey|rollout> [flags]",
        notes: [
          "no agent hook returns null — failures are {ok:false, error, message, fix}",
          "an LLM cannot decide at 60 Hz: rollout runs your policy at policyHz "
            + "(default 10) while physics runs every tick",
          "render({what}) and scene({visible:true}) reflect the LAST RENDERED "
            + "frame and are stale under headless(true) — flagged when so",
        ],
      };
    }

    // scene() — named scenery near you
    // visible() locates scenery MASS (72 m anonymous cells). This names it. The
    // data comes from track.props, the registry buildProps now fills at each
    // semantic emitter (js/track/tracks.js note()); before that existed the only
    // thing surviving a build with a label on it was track.lampPosts.
    function scene(opts) {
      const o0 = opts || {};
      if (o0.visible) return visible(o0);
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const reg = G.track.props;
      if (!reg) {
        return fail("NoRegistryError",
                    "this track was built without a prop registry "
                    + "(centreline-only build, or props were never generated)",
                    'reload the track with __apex.race("<id>")');
      }
      const o = opts || {};
      if (o.radius != null && !isNum(o.radius)) {
        return fail("BadArgumentError", "radius must be a finite number of metres",
                    "pass radius as a number (5-2000), e.g. scene({radius:150}) — "
                    + "a non-numeric radius used to disable the distance filter "
                    + "and return the whole registry");
      }
      const radius = Math.max(5, Math.min(numOr(o.radius, 150), 2000));
      const cap = Math.max(1, Math.min(o.limit | 0 || 24, 200));
      const kinds = Array.isArray(o.kinds) && o.kinds.length ? o.kinds : null;

      let ox, oz, head, from;
      if (G.player && G.player.px != null) {
        ox = G.player.px; oz = G.player.pz; head = G.player.head; from = "player";
      } else {
        const eye = (G.frame && G.frame.eye) || G.camEye;
        ox = eye[0]; oz = eye[2]; from = "camera";
        head = Math.atan2(G.camTgt[0] - ox, G.camTgt[2] - oz);
      }
      const rel = (x, z) => {
        const d = Math.hypot(x - ox, z - oz);
        const b = bearingDegTo(x - ox, z - oz, head);
        return { distM: r1(d), bearingDeg: b };
      };

      const byKind = {};
      const near = [];
      for (let pi = 0; pi < reg.list.length; pi++) {
        const p = reg.list[pi];
        byKind[p.kind] = (byKind[p.kind] || 0) + 1;
        if (kinds && kinds.indexOf(p.kind) < 0) continue;
        const dx = p.x - ox, dz = p.z - oz;
        if (dx * dx + dz * dz > radius * radius) continue;      // cheap reject
        const rr = rel(p.x, p.z);
        const psd = propPos(p);
        // The stable id is the registry index — derived, not stored, so it
        // survives a rebuild and costs nothing. describe(id) expands any row.
        // `side` here is EGOCENTRIC (which side of your nose, from bearingDeg);
        // `trackSide` is the stable centreline side worldModel()/describe() report,
        // so the same prop cross-references cleanly between the two frames.
        near.push({ id: propId(pi),
                    kind: p.kind, distM: rr.distM, bearingDeg: rr.bearingDeg,
                    side: rr.bearingDeg > 8 ? "right" : rr.bearingDeg < -8 ? "left" : "ahead",
                    trackSide: p.side != null ? sideOf(p.side)
                             : psd.lat == null ? "off-course"
                             : psd.lat > 0 ? "right" : "left",
                    sizeM: [p.w, p.h, p.d], at: [p.x, p.y, p.z],
                    measured: p.measured || undefined,
                    parts: p.parts, fill: p.fill });
      }
      near.sort((a, b) => a.distM - b.distM);

      // Floodlight masts kept their own registry long before this one existed
      // and carry a fixture kind, so they are worth surfacing alongside.
      const lamps = [];
      for (const l of (G.track.lampPosts || [])) {
        const dx = l.x - ox, dz = l.z - oz;
        if (dx * dx + dz * dz > radius * radius) continue;
        const rr = rel(l.x, l.z);
        const lp = Tracks.project(G.track, l.x, l.z, null, l.y);   // centreline side, like props; l.y disambiguates a crossover
        lamps.push({ kind: l.kind, distM: rr.distM, bearingDeg: rr.bearingDeg,
                     side: rr.bearingDeg > 0 ? "right" : "left",
                     trackSide: lp ? (lp.lat > 0 ? "right" : "left") : "off-course" });
      }
      lamps.sort((a, b) => a.distM - b.distM);

      return {
        apiVersion: API_VERSION, seq: ++seq, conventions: CONVENTIONS,
        origin: { from, x: r1(ox), z: r1(oz),
                  headingDeg: r1(head * 180 / Math.PI),
                  note: "distM and bearingDeg are from " + from
                        + "; +bearing = to its right, 0 = straight ahead" },
        radiusM: radius,
        counts: { lapTotal: reg.count, byKindLapTotal: byKind, inRadius: near.length },
        props: near.slice(0, cap),
        truncated: near.length > cap ? near.length - cap : 0,
        lamps: lamps.slice(0, cap),
        registry: {
          recorded: reg.count, dropped: reg.dropped, cap: reg.cap,
          complete: reg.dropped === 0,
          note: reg.dropped
            ? reg.dropped + " placements past the " + reg.cap + " cap were not "
              + "recorded — the registry is emission-ordered, so the omissions "
              + "are NOT spatially uniform and this list under-reports late-built areas"
            : "every semantic placement on this track is recorded",
        },
        note: "semantic placements only (trees, buildings, grandstands, billboards, "
              + "mountains, generic props) — not every primitive, and not kerbs, "
              + "barriers or road furniture",
      };
    }

    // visible() — what is actually on screen
    // The renderer already answers this every frame: it extracts frustum planes
    // from frame.viewProj and tests them against per-chunk AABBs. Nothing was
    // retained, so the answer was thrown away 60 times a second. This runs the
    // SAME cull test (GLX.makeFrustumPlanes / aabbInFrustum, exported from
    // js/render/glx/chunked.js rather than reimplemented here so the two cannot
    // drift) and reports it.
    //
    // Scenery resolution is the 72 m chunk grid, and chunks are anonymous mixed
    // geometry — this says "scenery mass is in view over there", not "that is a
    // grandstand". Naming things needs the prop registry.

    // Project a world point through a COLUMN-MAJOR view-proj (m[col*4+row]).
    function project(vp, x, y, z) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (!(cw > 1e-6)) return null;                 // at or behind the eye
      const nx = cx / cw, ny = cy / cw;
      const inFrame = nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1;
      return {
        inFrame,
        ndc: inFrame ? [r2(nx), r2(ny)] : null,
        screenPct: inFrame ? [r1((nx + 1) * 50), r1((1 - ny) * 50)] : null,
      };
    }

    // World XZ of a car. Prefer the mirrored px/pz (player + field); else Frenet.
    function carWorld(c) {
      if (c.px != null) return [c.px, c.pz];
      Tracks.sample(G.track, c.s, scr);
      const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
      return [scr.p[0] + scr.r[0] / rl * c.x, scr.p[2] + scr.r[2] / rl * c.x];
    }

    function visible(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const frame = G.frame;
      const vp = frame && frame.viewProj;
      if (!vp) {
        return fail("NoFrameError",
                    "no rendered frame yet, so there is no camera matrix to test against",
                    "headless(true) skips render() — call __apex.headless(false) "
                    + "and let one frame draw before calling scene({visible:true})");
      }
      const o = opts || {};
      const cap = Math.max(1, Math.min(o.limit | 0 || 16, 64));
      const eye = frame.eye || G.camEye;

      // Camera-forward, for bearings. + bearing = to the right of where you look.
      const fwd = [G.camTgt[0] - eye[0], G.camTgt[1] - eye[1], G.camTgt[2] - eye[2]];
      const fl = Math.hypot(fwd[0], fwd[2]) || 1;
      const bearingTo = (wx, wz) => {
        const a = Math.atan2(fwd[0] / fl, fwd[2] / fl);
        return bearingDegTo(wx - eye[0], wz - eye[2], a);
      };
      const distTo = (wx, wz) => r1(Math.hypot(wx - eye[0], wz - eye[2]));

      const out = {
        apiVersion: API_VERSION, seq: ++seq, conventions: CONVENTIONS,
        camera: {
          eye: eye.map(r1), target: G.camTgt.map(r1), fovDeg: r1(G.camFov),
          mode: (GameTables.CAM_MODES[G.camMode] || {}).id
                || String(GameTables.CAM_MODES[G.camMode] || G.camMode),
          debugCam: !!G.dbgCam,
        },
        framePending: !!G.headlessMode,
      };
      if (G.headlessMode) {
        out.warning = "headless(true) skips render(), so this reflects the last "
                    + "drawn frame and may be stale — call headless(false) and "
                    + "let a frame draw for a live answer";
      }

      const mesh = G.track.meshes && G.track.meshes.props;
      const chunks = mesh && mesh.chunks;
      if (!chunks) {
        out.scenery = {
          available: false,
          why: mesh ? "this track's props mesh is too small to be chunked "
                      + "(under 2000 tris), so there is no spatial index"
                    : "no props mesh on this track",
        };
      } else if (typeof GLX === "undefined" || !GLX.makeFrustumPlanes) {
        out.scenery = { available: false,
                        why: "chunk culling is a GLX feature; the active renderer does not expose it" };
      } else {
        const planes = GLX.makeFrustumPlanes(vp);
        const cd = frame.cullDist || 0;
        const hits = [];
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          if (!GLX.aabbInFrustum(planes, ch.min, ch.max)) continue;
          const cx = (ch.min[0] + ch.max[0]) / 2, cz = (ch.min[2] + ch.max[2]) / 2;
          const d = distTo(cx, cz);
          if (cd > 0 && d > cd) continue;            // fog hides it; so does the GPU
          hits.push({ distM: d, bearingDeg: bearingTo(cx, cz),
                      centre: [r1(cx), r1((ch.min[1] + ch.max[1]) / 2), r1(cz)],
                      sizeM: [r1(ch.max[0] - ch.min[0]), r1(ch.max[1] - ch.min[1]),
                              r1(ch.max[2] - ch.min[2])] });
        }
        hits.sort((a, b) => a.distM - b.distM);
        out.scenery = {
          available: true, cellSizeM: mesh.cellSize || null,
          totalCells: chunks.length, visibleCells: hits.length,
          cullDistM: cd || null,
          nearest: hits.slice(0, cap),
          truncated: hits.length > cap ? hits.length - cap : 0,
          note: "cells are " + (mesh.cellSize || "?") + " m of MIXED anonymous "
                + "geometry — this locates scenery mass, it does not name it",
        };
      }

      out.cars = [];
      for (const c of G.cars) {
        const [wx, wz] = carWorld(c);
        const p = project(vp, wx, 0.6, wz);           // ~roll-hoop height
        const bearing = bearingTo(wx, wz);
        out.cars.push({
          id: c.id != null ? c.id : G.cars.indexOf(c),
          code: c.code || null, isPlayer: !!c.isPlayer,
          distM: distTo(wx, wz), bearingDeg: bearing,
          inFrame: !!(p && p.inFrame),
          screenPct: p ? p.screenPct : null,
          behindCamera: Math.abs(bearing) > 90,
        });
      }
      out.cars.sort((a, b) => a.distM - b.distM);
      out.carsInFrame = out.cars.filter((c) => c.inFrame).length;

      out.corners = [];
      for (const c of corners()) {
        Tracks.sample(G.track, c.s, scr);
        const wx = scr.p[0], wz = scr.p[2];
        const d = distTo(wx, wz);
        const p = project(vp, wx, scr.p[1], wz);
        if (!(p && p.inFrame) && d > 400) continue;
        const bearing = bearingTo(wx, wz);
        out.corners.push({ turn: c.turn, dir: c.dir, distM: d,
                           bearingDeg: bearing,
                           inFrame: !!(p && p.inFrame),
                           behindCamera: Math.abs(bearing) > 90,
                           screenPct: p ? p.screenPct : null });
      }
      out.corners.sort((a, b) => a.distM - b.distM);

      return out;
    }

    // trackInfo() — static, fetch once per session
    // Constant for the whole session, so it must never ride in the per-tick
    // payload. Progressive disclosure: hand the agent a pointer, not the data.
    function trackInfo(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const what = (opts && opts.what) || "corners";
      if (["corners", "sectors", "profile", "all"].indexOf(what) < 0) {
        return fail("BadArgumentError",
                    'what must be "corners", "sectors", "profile" or "all"',
                    'call trackInfo({what:"all"})');
      }
      const def = G.track.def;
      const base = {
        apiVersion: API_VERSION, conventions: CONVENTIONS,
        // Static circuit identity. `gp` and `realLengthKm` come straight off the
        // circuit def and were never surfaced: they ground the model in the real
        // world (this is Monza, the Italian GP, really 5.79 km) and let an agent
        // sanity-check the built geometry against the circuit it claims to be —
        // lengthM is what we built, realLengthKm is what it should be.
        track: { id: def.id, name: def.name, country: def.country || null,
                 gp: def.gp || null,
                 lengthM: r1(G.track.total),
                 realLengthKm: def.lengthKm || null,
                 lengthErrorPct: def.lengthKm
                   ? r1((G.track.total / 1000 - def.lengthKm) / def.lengthKm * 100)
                   : null,
                 street: !!def.street,
                 laps: def.laps || null,
                 startFrac: def.startFrac != null ? def.startFrac : null,
                 reverse: !!def.reverse },
      };
      if (what === "corners" || what === "all") {
        base.corners = corners();
        base.cornerCount = base.corners.length;
        base.source = def.turns && def.turns.length ? "CircuitMarkings (curated FIA apexes)"
                                                    : "curvature peaks (no curated turn list)";
      }
      if (what === "sectors" || what === "all") {
        const sec = def.sectors || null;
        base.sectors = sec
          ? [{ sector: 1, fromFrac: 0, toFrac: sec[0] },
             { sector: 2, fromFrac: sec[0], toFrac: sec[1] },
             { sector: 3, fromFrac: sec[1], toFrac: 1 }]
          : null;
      }
      if (what === "profile" || what === "all") {
        const n = 60, pts = [];
        for (let i = 0; i < n; i++) {
          const s = i / n * G.track.total;
          Tracks.sample(G.track, s, scr);
          pts.push({ frac: +(i / n).toFixed(3), y: r1(scr.p[1]),
                     widthM: r1(scr.hw * 2),
                     radiusM: r1(Math.min(radiusOf(Tracks.curvature(G.track, s)), 9999)) });
        }
        base.profile = pts;
      }
      return base;
    }

    return { world, field, trackInfo, scene, describe, query, atmosphere, objective,
             carView, render, survey, rollout, agentHelp, corners, terminal,
             API_VERSION, PHYSICS_VERSION };
  }

  return { create };
})();
