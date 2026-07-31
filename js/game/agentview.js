/* Apex 26 — AgentView: the agent-facing JSON view of the running game.

   __apex is a dev console: ~89 flat hooks, each answering one narrow question,
   most of them returning bare `false`/`null` when they can't. That is the right
   shape for a human at a REPL and the wrong shape for a text-only agent, which
   needs (a) one egocentric snapshot per decision, (b) semantics next to the
   numbers, and (c) an error that says what to do next.

   This module is that layer. It reads the same live state through the G ctx
   façade and composes it; it owns no state of its own beyond a per-track corner
   cache and the delta bookkeeping. __apex is unchanged underneath — see
   docs/AGENT-WORLD-API.md for the design and the research behind it.

   Conventions (repeated in every payload, because an agent cannot be assumed to
   have read this file): metres, m/s, seconds, radians unless a key says
   otherwise; +x is right of the centreline; +k is a right-hand turn; a rival's
   `lateralM` is relative to the PLAYER, not the centreline.
*/
const AgentView = (function () {
  "use strict";

  const API_VERSION = 1;

  // Bump whenever a physics change could invalidate a strategy an agent derived
  // from earlier observations. Cheap insurance: without it, agent-authored
  // racing lines silently rot when LONG_GRIP or PACE is retuned.
  const PHYSICS_VERSION = 1;

  const CONVENTIONS =
    "metres, m/s, seconds, radians unless the key says otherwise; " +
    "+x = right of centreline; +k = right-hand turn; " +
    "rival lateralM is relative to the player (+ = to your right)";

  // Corner-speed model for the suggested brake point. Deliberately approximate:
  // this is a coaching hint an agent can sanity-check against, not the physics
  // the car actually runs. Both are m/s^2.
  const LAT_GRIP = 26;
  const BRAKE_DECEL = 30;

  // Radius (m) -> label. An LLM has read a great many sentences about "a 45 m
  // hairpin" and none at all about "k = 0.0222", so both ship.
  const SEVERITY = [[30, "hairpin"], [70, "slow"], [150, "medium"], [350, "fast"]];
  const STRAIGHT_R = 800;      // above this radius, call it a straight
  const CORNER_K = 0.004;      // |k| below this is not cornering

  function severityOf(r) {
    for (const [lim, name] of SEVERITY) if (r < lim) return name;
    return r < STRAIGHT_R ? "kink" : "straight";
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // Radius in metres from curvature. Clamped rather than Infinity so the value
  // stays JSON-safe and comparisons don't have to special-case a straight.
  function radiusOf(k) {
    const a = Math.abs(k);
    return a < 1e-6 ? 99999 : Math.min(99999, 1 / a);
  }

  function create(G) {
    const { wrapS, gripMult, LONG_GRIP } = G;

    // Own scratch. apex.js shares `smp`/`smp2` with game.js and has to re-sample
    // to restore them after a lookahead loop (see obs()); borrowing that here
    // would make this module's aliasing hazards someone else's problem.
    const scr = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };

    // ── curvature, smoothed ─────────────────────────────────────────────────
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

    function smoothK(s, w) {
      const W = w || SMOOTH_W;
      return angDiff(headingAt(s + W), headingAt(s - W)) / (2 * W);
    }

    // Net heading swept between two arc positions, accumulated in short steps so
    // a hairpin past +/-pi doesn't wrap onto itself.
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

    // ── errors ──────────────────────────────────────────────────────────────
    // An agent gets nothing from `null`. Every failure says what went wrong and
    // what to call instead; `state` gives it enough to verify the fix worked.
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

    // ── corner table (static per track, built once) ──────────────────────────
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
        // Expand while the road keeps bending the same way and hasn't released
        // below a fifth of the peak. 300 m each side caps a long constant sweep.
        let entry = s, exit = s;
        for (let d = 5; d <= 300; d += 5) {
          const kk = smoothK(s - d);
          if (kk * sign > 0 && Math.abs(kk) > peak * 0.2) entry = s - d; else break;
        }
        for (let d = 5; d <= 300; d += 5) {
          const kk = smoothK(s + d);
          if (kk * sign > 0 && Math.abs(kk) > peak * 0.2) exit = s + d; else break;
        }

        // Radius from heading swept across the whole corner, not from any one
        // sample — this is what makes a noisy centreline describable.
        const arc = Math.max(exit - entry, 1);
        const psi = sweep(entry, exit);
        const radius = Math.abs(psi) < 1e-3 ? 99999 : Math.min(99999, arc / Math.abs(psi));

        Tracks.sample(track, wrapS(s), scr);
        out.push({
          turn: "T" + (i + 1),
          frac: +(wrapS(s) / total).toFixed(4),
          s: r1(wrapS(s)),
          dir: radius >= STRAIGHT_R ? "straight" : psi > 0 ? "R" : "L",
          radiusM: r1(radius),
          k: +kA.toFixed(5),
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

    // Some circuits number a double-apex as two turns (Parabolica, Campsa, the
    // Esses). After snapping, both apexes land in the same bend and the table
    // reports two ~90%-overlapping corners — which reads to an agent as two
    // separate braking events. Merge them, keeping both turn numbers.
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
      for (const c of out) { delete c._entry; delete c._exit; delete c._s; }
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

    // ── next corner ─────────────────────────────────────────────────────────
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
        suggestBrakeM: r1(brakeM), status,
        note: "suggestBrakeM assumes ~" + BRAKE_DECEL + " m/s^2 braking and ~"
              + LAT_GRIP + " m/s^2 lateral grip — a hint, not the car's physics",
      };
    }

    // ── look-ahead ──────────────────────────────────────────────────────────
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
          dir: Math.abs(k) < CORNER_K ? "straight" : k > 0 ? "R" : "L",
          widthM: r1(scr.hw * 2),
        });
      }
      return { horizonS, horizonM: r1(horizon), pts: out };
    }

    // ── rivals ──────────────────────────────────────────────────────────────
    // Per-rival rows, relative to the player. obs() today gives only aggregate
    // gapAhead/gapBehind in metres — correct, but an agent cannot decide which
    // side to attack from a scalar. GT Sophy encodes rivals as relative
    // position + velocity; the GT7 follow-up found orientation mattered too.
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
          code: c.code || null, team: c.team || null,
          rel: ahead ? "ahead" : "behind",
          gapM: r1(gapM),
          gapS: r2(gapM / Math.max(p.speed, 5)),
          lateralM: r1(lateralM),
          side: lateralM > 0.5 ? "right" : lateralM < -0.5 ? "left" : "same line",
          speedKph: r1(c.speed * 3.6),
          closingMps: r1(closing),
          threat: !ahead && gapM < 25 && closing > 0.5 ? "under attack"
                : ahead && gapM < 25 && closing > 0.5 ? "closing"
                : gapM < 25 ? "in range" : "clear",
          lap: c.lap,
        });
      }
      out.sort((a, b) => a.gapM - b.gapM);
      return limit ? out.slice(0, limit) : out;
    }

    // ── affordances ─────────────────────────────────────────────────────────
    // TextWorld and Jericho both ship an admissible-action list and agents lean
    // on it hard. The `unavailable` half matters just as much: it stops the
    // agent spending turns rediscovering a constraint.
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

      const wallR = Tracks.wallAt(G.track, p.s, 1);
      const wallL = -Tracks.wallAt(G.track, p.s, -1);
      const clearR = wallR - p.x, clearL = p.x - wallL;
      const ahead = rv.find((r) => r.rel === "ahead" && r.gapM < 40);
      if (ahead) {
        for (const [side, clear] of [["left", clearL], ["right", clearR]]) {
          const blocked = ahead.side === side && ahead.gapM < 12;
          if (clear > 3 && !blocked) {
            // NB the parens: `a || b + c` binds as `a || (b + c)`, so writing
            // `ahead.code || ("car " + id) + " " + gap` silently collapses the
            // whole reason to just "VER" whenever the rival has a driver code.
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

    // ── the one-line summary ────────────────────────────────────────────────
    // ~30 tokens. The NLE language wrapper, SC2Arena and Generative Agents all
    // converged on prose for the summary layer; it is cheap to build and it
    // doubles as a human-readable debug line.
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

    // ── delta ───────────────────────────────────────────────────────────────
    // diff history (ICML 2024) reports ~4x more usable interaction history at
    // fixed context by diffing consecutive observations. Arrays are replaced
    // wholesale — element-wise diffing costs more to describe than it saves.
    function deltaOf(prev, next) {
      if (prev === undefined) return next;
      if (Array.isArray(next) || Array.isArray(prev)) {
        return JSON.stringify(prev) === JSON.stringify(next) ? undefined : next;
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
      return prev === next ? undefined : next;
    }

    // ── world() ─────────────────────────────────────────────────────────────
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

      // Heading error against the local tangent, signed like steering: + = the
      // nose points right of where the road goes.
      let headErr = Math.atan2(scr.t[0], scr.t[2]) - p.head;
      while (headErr > Math.PI) headErr -= 2 * Math.PI;
      while (headErr < -Math.PI) headErr += 2 * Math.PI;

      const ranked = G.cars.slice().sort((a, b) => b.prog - a.prog);
      const pos = ranked.findIndex((c) => c.isPlayer) + 1;

      const axFrac = clamp(Math.abs(p.axEstSm || 0) / (LONG_GRIP || 34), 0, 1);
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
        payload.ahead = lookahead(p.s, p.speed, o.horizonS || 4, o.points || 5);
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
        };
        payload.terminal = terminal();
        payload.physics = {
          kRaw: +Tracks.curvature(G.track, p.s).toFixed(5),
          kSmoothed: +smoothK(p.s).toFixed(5),
          slipDeg: r1((p.slipDeg != null ? p.slipDeg : 0)),
          vLat: r2(p.vLat || 0), axEstSm: r2(p.axEstSm || 0),
          offTrackS: r2(p.offT || 0), onKerb: !!p.onKerb,
          brakeHeat: r2(p.brakeHeat || 0),
        };
      }

      if (o.since != null) {
        if (!lastPayload || o.since !== lastSeq) {
          payload.deltaBase = null;
          payload.note = "no delta available for seq " + o.since + " — full payload returned";
        } else {
          const d = deltaOf(lastPayload, payload) || {};
          lastPayload = payload; lastSeq = payload.seq;
          d.apiVersion = API_VERSION; d.seq = payload.seq;
          d.deltaBase = o.since;
          return d;
        }
      }
      lastPayload = payload; lastSeq = payload.seq;
      return payload;
    }

    // obs().done conflates "I spun" with "I was teleported" — an agent needs to
    // tell those apart to know whether its policy failed or the sim rescued it.
    function terminal() {
      const p = G.player;
      const rescued = p.rescueLastT != null && (G.raceT - p.rescueLastT) < 0.5;
      let reason = null;
      if (p.finished) reason = "finished";
      else if (p.wrongWay) reason = "wrong_way";
      else if (rescued) reason = "rescued";
      return { done: reason != null, reason };
    }

    // ── scene() — named scenery near you ────────────────────────────────────
    // visible() locates scenery MASS (72 m anonymous cells). This names it. The
    // data comes from track.props, the registry buildProps now fills at each
    // semantic emitter (js/track/tracks.js note()); before that existed the only
    // thing surviving a build with a label on it was track.lampPosts.
    function scene(opts) {
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
      const radius = Math.max(5, Math.min(o.radius || 150, 2000));
      const cap = Math.max(1, Math.min(o.limit | 0 || 24, 200));
      const kinds = Array.isArray(o.kinds) && o.kinds.length ? o.kinds : null;

      // Egocentric on the car when there is one, else on the camera — and say
      // which, because "40 m ahead" means nothing without knowing ahead of what.
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
        const b = angDiff(Math.atan2(x - ox, z - oz), head) * 180 / Math.PI;
        return { distM: r1(d), bearingDeg: r1(b) };
      };

      const byKind = {};
      const near = [];
      for (const p of reg.list) {
        byKind[p.kind] = (byKind[p.kind] || 0) + 1;
        if (kinds && kinds.indexOf(p.kind) < 0) continue;
        const dx = p.x - ox, dz = p.z - oz;
        if (dx * dx + dz * dz > radius * radius) continue;      // cheap reject
        const rr = rel(p.x, p.z);
        near.push({ kind: p.kind, distM: rr.distM, bearingDeg: rr.bearingDeg,
                    side: rr.bearingDeg > 8 ? "right" : rr.bearingDeg < -8 ? "left" : "ahead",
                    sizeM: [p.w, p.h, p.d], at: [p.x, p.y, p.z] });
      }
      near.sort((a, b) => a.distM - b.distM);

      // Floodlight masts kept their own registry long before this one existed
      // and carry a fixture kind, so they are worth surfacing alongside.
      const lamps = [];
      for (const l of (G.track.lampPosts || [])) {
        const dx = l.x - ox, dz = l.z - oz;
        if (dx * dx + dz * dz > radius * radius) continue;
        const rr = rel(l.x, l.z);
        lamps.push({ kind: l.kind, distM: rr.distM, bearingDeg: rr.bearingDeg,
                     side: rr.bearingDeg > 0 ? "right" : "left" });
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

    // ── visible() — what is actually on screen ──────────────────────────────
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
      // screenPct is only meaningful in frame. A point sitting on the eye plane
      // has w -> 0 and projects to absurd coordinates (57.7% vs 27629%) — that
      // is correct projective maths and useless to a reader, so don't ship it.
      return {
        inFrame,
        ndc: inFrame ? [r2(nx), r2(ny)] : null,
        screenPct: inFrame ? [r1((nx + 1) * 50), r1((1 - ny) * 50)] : null,
      };
    }

    // World XZ of a car. Only the player carries px/pz — AI cars live in (s, x)
    // and have to be rebuilt through the Frenet frame, the same way carOrbit()
    // does it in apex.js.
    function carWorld(c) {
      if (c.isPlayer && c.px != null) return [c.px, c.pz];
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
                    + "and let one frame draw before calling visible()");
      }
      const o = opts || {};
      const cap = Math.max(1, Math.min(o.limit | 0 || 16, 64));
      const eye = frame.eye || G.camEye;

      // Camera-forward, for bearings. + bearing = to the right of where you look.
      const fwd = [G.camTgt[0] - eye[0], G.camTgt[1] - eye[1], G.camTgt[2] - eye[2]];
      const fl = Math.hypot(fwd[0], fwd[2]) || 1;
      const bearingTo = (wx, wz) => {
        const a = Math.atan2(fwd[0] / fl, fwd[2] / fl);
        const b = Math.atan2(wx - eye[0], wz - eye[2]);
        return r1(angDiff(b, a) * 180 / Math.PI);
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
        // Everything here describes the LAST RENDERED frame. render() is skipped
        // under headless, and a jump()/camera change does not take effect until
        // a frame draws — so without this flag an agent can read a camera that
        // is hundreds of metres from where it just put the car.
        framePending: !!G.headlessMode,
      };
      if (G.headlessMode) {
        out.warning = "headless(true) skips render(), so this reflects the last "
                    + "drawn frame and may be stale — call headless(false) and "
                    + "let a frame draw for a live answer";
      }

      // ── scenery chunks ──
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

      // ── cars ──
      out.cars = [];
      for (const c of G.cars) {
        const [wx, wz] = carWorld(c);
        const p = project(vp, wx, 0.6, wz);           // ~roll-hoop height
        out.cars.push({
          id: c.id != null ? c.id : G.cars.indexOf(c),
          code: c.code || null, isPlayer: !!c.isPlayer,
          distM: distTo(wx, wz), bearingDeg: bearingTo(wx, wz),
          inFrame: !!(p && p.inFrame),
          screenPct: p ? p.screenPct : null,
          behindCamera: !p,
        });
      }
      out.cars.sort((a, b) => a.distM - b.distM);
      out.carsInFrame = out.cars.filter((c) => c.inFrame).length;

      // ── corners ──
      out.corners = [];
      for (const c of corners()) {
        Tracks.sample(G.track, c.s, scr);
        const wx = scr.p[0], wz = scr.p[2];
        const d = distTo(wx, wz);
        const p = project(vp, wx, scr.p[1], wz);
        // A corner behind the camera projects to null — but "T1 is 190 m behind
        // you" is exactly what an agent needs after a spin, so distance decides
        // inclusion and the projection only decides whether it is on screen.
        if (!(p && p.inFrame) && d > 400) continue;
        out.corners.push({ turn: c.turn, dir: c.dir, distM: d,
                           bearingDeg: bearingTo(wx, wz),
                           inFrame: !!(p && p.inFrame),
                           behindCamera: !p,
                           screenPct: p ? p.screenPct : null });
      }
      out.corners.sort((a, b) => a.distM - b.distM);

      return out;
    }

    // ── trackInfo() — static, fetch once per session ─────────────────────────
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
        track: { id: def.id, name: def.name, country: def.country || null,
                 lengthM: r1(G.track.total), street: !!def.street,
                 laps: def.laps || null },
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

    return { world, trackInfo, visible, scene, corners, terminal,
             API_VERSION, PHYSICS_VERSION };
  }

  return { create };
})();
