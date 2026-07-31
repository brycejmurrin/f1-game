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
    const { wrapS, gripMult, LONG_GRIP, update, els, camVantage } = G;

    // Scratch matrices for rendering an arbitrary camera to text — so frame()
    // is not tied to the LAST live frame. Built once; every call overwrites them.
    const _vView = new Float32Array(16), _vProj = new Float32Array(16),
          _vVP = new Float32Array(16);
    function buildVP(eye, tgt, fovDeg, far) {
      const aspect = (G.gfx && G.gfx.aspect) || 2.16;
      M4.lookAtTo(_vView, eye, tgt, [0, 1, 0]);
      M4.perspectiveTo(_vProj, fovDeg * Math.PI / 180, aspect, 0.3, far || 3000);
      M4.mulTo(_vVP, _vProj, _vView);         // proj * view, column-major (as game.js)
      return _vVP;
    }

    // Resolve which camera frame() renders. Default is the LIVE frame — the one
    // actually on screen. Naming a mode ("cockpit", "heli", …) or an orbit
    // frames the shot WITHOUT moving the car or waiting for a render, which is
    // the text version of previewCam()/apex-capture's per-mode screenshots.
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
        const eye = [p.px + dx * dist * Math.cos(el), 0.6 + dist * Math.sin(el),
                     p.pz + dz * dist * Math.cos(el)];
        const tgt = [p.px, 0.6, p.pz];
        return { vp: buildVP(eye, tgt, o.fov || 45), eye, tgt, mode: "orbit", synthetic: true };
      }
      if (o.camera) {
        const m = String(o.camera).toLowerCase();
        if (!GameTables.CAM_MODES.some((c) => (c.id || c) === m)) {
          return fail("BadArgumentError",
                      'unknown camera "' + o.camera + '"',
                      "one of: " + GameTables.CAM_MODES.map((c) => c.id || c).join(", "));
        }
        const v = camVantage(m, p.s, p.x, p.speed || 0, 0, {});
        return { vp: buildVP(v.eye, v.tgt, v.fov), eye: v.eye.slice(),
                 tgt: v.tgt.slice(), mode: m, fovDeg: v.fov, synthetic: true };
      }
      const fr = G.frame, vp = fr && fr.viewProj;
      if (!vp) {
        return fail("NoFrameError",
                    "no rendered frame yet, and no camera was named",
                    'name a camera — frame({camera:"chase"}) — or headless(false) '
                    + "and let a frame draw");
      }
      return { vp, eye: fr.eye || G.camEye, tgt: G.camTgt,
               mode: (GameTables.CAM_MODES[G.camMode] || {}).id
                     || String(GameTables.CAM_MODES[G.camMode] || G.camMode),
               fovDeg: G.camFov, synthetic: false };
    }

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
    // Exact diffing is worthless here, and measuring said so: across a 20-step
    // driving loop it saved 1.17x, because in a moving car every number changes
    // every tick. The diff-history result this was modelled on came from
    // NetHack, where the world is discrete and mostly static between actions —
    // a racing sim is the opposite.
    //
    // So a change smaller than the agent could act on is not a change. This is
    // the round-hard principle applied to time: 0.3 km/h and 4 cm of lateral
    // drift are noise, and reporting them costs the same as reporting a corner
    // arriving.
    const DEAD_ABS = 0.25;      // absolute deadband
    const DEAD_REL = 0.02;      // ...or 2% of the value, whichever is larger

    function sameEnough(a, b) {
      if (typeof a !== "number" || typeof b !== "number") return a === b;
      return Math.abs(a - b) <= Math.max(DEAD_ABS, Math.abs(a) * DEAD_REL);
    }

    function deltaOf(prev, next) {
      if (prev === undefined) return next;
      if (Array.isArray(next) || Array.isArray(prev)) {
        // Arrays are all-or-nothing, but compare them through the deadband too
        // so a lookahead whose distances moved 10 cm doesn't resend the lot.
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

    // Merge only what was actually reported into the caller's believed state.
    // Without this a deadband leaks: each tick's change is individually too
    // small to send, the baseline advances anyway, and the caller's value drifts
    // arbitrarily far from the truth. Holding the baseline at the last REPORTED
    // value bounds the error at one deadband instead.
    function applyDelta(base, d) {
      if (d === undefined) return base;
      if (d === null || typeof d !== "object" || Array.isArray(d)) return d;
      const out = Array.isArray(base) ? base.slice()
                : (base && typeof base === "object") ? Object.assign({}, base) : {};
      for (const k of Object.keys(d)) out[k] = applyDelta(out[k], d[k]);
      return out;
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
          // Advance the baseline by what was REPORTED, not by the freshly
          // computed payload — otherwise the deadband silently drifts (see
          // applyDelta).
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

    // ── frame() — the rendered view, as text ────────────────────────────────
    // The screenshot replacement. visible() lists WHAT is on screen; this says
    // WHERE, by rasterising the scene into a coarse character grid — the same
    // information a screenshot carries about composition and occlusion, at a
    // few hundred tokens instead of an image the model reads worse than text
    // (BALROG: VLMs score lower with the image than without it).
    //
    // Every object is projected as its axis-aligned box, depth-sorted per cell.
    // That is a real hidden-surface solve at grid resolution, not a guess: a
    // grandstand in front of a treeline occludes it, and the cell says so.

    const GLYPHS = {
      road: "=", kerb: ":", car: "C", player: "@",
      tree: "t", pine: "t", palm: "t", conifer: "t", bush: ",", hedge: ",",
      building: "B", house: "h", motorhome: "m", tower: "I", structure: "#",
      grandstand: "A", billboard: "b", signBoard: "s", marshalPost: "p",
      gantry: "T", mountain: "^", peak: "^", ridge: "^", prop: "o",
      sky: ".", ground: "_",
    };

    function projPoint(vp, x, y, z) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (!(cw > 1e-6)) return null;
      return { x: cx / cw, y: cy / cw, w: cw };
    }

    // Screen rect of a world AABB. Projecting all eight corners and taking the
    // extent is conservative (it over-covers a rotated box) but never misses
    // geometry, which is the right error for an occlusion raster.
    function boxRect(vp, cx, cy, cz, hw, hh, hd) {
      // The object's CENTRE must be in front of the eye. Without this test a
      // box that merely straddles the near plane still projects a rect — and a
      // 22 m pine standing 20 m to the SIDE of the car straddles it, so it
      // painted the entire grid and reported the frame as 100% tree. Anything
      // whose centre is behind the camera is not in shot, whatever its corners
      // do.
      const mid = projPoint(vp, cx, cy, cz);
      if (!mid) return null;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      let near = Infinity, seen = 0;
      for (let i = 0; i < 8; i++) {
        const p = projPoint(vp, cx + (i & 1 ? hw : -hw), cy + (i & 2 ? hh : -hh),
                            cz + (i & 4 ? hd : -hd));
        if (!p) continue;
        seen++;
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        if (p.w < near) near = p.w;
      }
      if (!seen) return null;
      // Corners behind the plane are simply dropped; the surviving extent
      // understates a straddling box slightly, which is the safe direction —
      // over-covering is what wrecks the raster.
      //
      // Depth is the CENTRE, not the nearest corner. An anonymous assembly can
      // be 100 m long, and taking its near corner made its far end sort as if it
      // were right in front of the camera — one structure then won every cell
      // and reported the frame as 74% building with the road hidden behind it.
      return { x0, x1, y0, y1, near: mid.w };
    }

    // A box the camera stands inside is not an object in shot — it is a loose
    // hull that happens to enclose the viewer. Anonymous assemblies do this
    // whenever their primitives straddle the track.
    function containsEye(eye, cx, cy, cz, hw, hh, hd) {
      return Math.abs(eye[0] - cx) <= hw && Math.abs(eye[2] - cz) <= hd
             && Math.abs(eye[1] - cy) <= hh;
    }

    function frame(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const o = opts || {};
      const cam = resolveCamera(o);
      if (cam.ok === false) return cam;
      const vp = cam.vp;
      const fr = G.frame || {};             // lighting/cullDist still read live
      // ── raster geometry ──
      // A character cell is about twice as tall as it is wide, so a grid whose
      // ratio equals the viewport's renders SQUASHED. The default was 48x18:
      // ratio 2.67, halved by the cell aspect to an effective 1.33 against a
      // 2.16 viewport — a square object came out 1.6x too tall. Derive rows from
      // the real aspect unless the caller pins them.
      const cellAspect = clamp(o.cellAspect || 2, 1, 4);
      const viewAspect = (G.gfx && G.gfx.aspect) || 2.16;
      const cols = clamp(o.cols | 0 || 48, 8, 160);
      const autoRows = Math.round(cols / (viewAspect * cellAspect));
      const rows = clamp(o.rows | 0 || autoRows, 4, 60);
      const range = clamp(o.rangeM || 500, 50, 3000);
      const eye = cam.eye;

      // depth buffer + kind buffer, one entry per cell
      const N = cols * rows;
      const depth = new Float64Array(N).fill(Infinity);
      const kind = new Array(N).fill(null);
      const idOf = new Array(N).fill(null);
      const seenKinds = {};

      // NDC -> cell. NDC y is +up, rows run top-down.
      const cellX = (ndc) => Math.floor((ndc + 1) / 2 * cols);
      const cellY = (ndc) => Math.floor((1 - ndc) / 2 * rows);

      function paint(rect, k, id) {
        const cx0 = Math.max(0, cellX(rect.x0)), cx1 = Math.min(cols - 1, cellX(rect.x1));
        const cy0 = Math.max(0, cellY(rect.y1)), cy1 = Math.min(rows - 1, cellY(rect.y0));
        if (cx1 < cx0 || cy1 < cy0) return 0;
        let n = 0;
        for (let y = cy0; y <= cy1; y++) {
          for (let x = cx0; x <= cx1; x++) {
            const i = y * cols + x;
            if (rect.near < depth[i]) { depth[i] = rect.near; kind[i] = k; idOf[i] = id; n++; }
          }
        }
        return n;
      }

      const objects = [];

      // ── the road itself ──
      // Sampled as a lattice of surface points rather than a box: the ribbon is
      // long, thin and curved, and one AABB round it would cover the sky.
      const roadPts = clamp(o.roadSamples | 0 || 90, 10, 400);
      const player = G.player;
      const s0 = player && player.s != null ? player.s : 0;
      // The road is a surface, not a point cloud. Sampling its edges and filling
      // the span between them is the only way to cover it: near the camera the
      // ribbon is dozens of cells wide, and no affordable number of point
      // samples fills that — the first attempt reported a road that fills the
      // lower half of the render as 6% of the frame.
      //
      // Each pair of consecutive arc positions gives a trapezoid (left/right
      // edge at two depths); scan-fill it row by row with interpolated columns.
      const BEHIND = 60;
      const edgeAt = (d) => {
        const ss = wrapS(s0 + d);
        Tracks.sample(G.track, ss, scr);
        const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
        const ex = scr.r[0] / rl, ez = scr.r[2] / rl, y = scr.p[1] + 0.05;
        const L = projPoint(vp, scr.p[0] - ex * scr.hw, y, scr.p[2] - ez * scr.hw);
        const R = projPoint(vp, scr.p[0] + ex * scr.hw, y, scr.p[2] + ez * scr.hw);
        return L && R ? { L, R, w: (L.w + R.w) / 2 } : null;
      };
      let prev = null;
      for (let i = 0; i <= roadPts; i++) {
        const f = i / roadPts;
        const d = -BEHIND + Math.pow(f, 1.8) * (range + BEHIND);
        const cur = edgeAt(d);
        if (prev && cur) {
          const yA = cellY(Math.max(prev.L.y, prev.R.y)), yB = cellY(Math.max(cur.L.y, cur.R.y));
          const yLo = Math.max(0, Math.min(yA, yB)), yHi = Math.min(rows - 1, Math.max(yA, yB));
          for (let y = yLo; y <= yHi; y++) {
            const t = yA === yB ? 0 : (y - yA) / (yB - yA);
            const lx = prev.L.x + (cur.L.x - prev.L.x) * t;
            const rx = prev.R.x + (cur.R.x - prev.R.x) * t;
            const w = prev.w + (cur.w - prev.w) * t;
            let c0 = cellX(Math.min(lx, rx)), c1 = cellX(Math.max(lx, rx));
            if (c1 < 0 || c0 >= cols) continue;
            c0 = Math.max(0, c0); c1 = Math.min(cols - 1, c1);
            for (let x = c0; x <= c1; x++) {
              const idx = y * cols + x;
              if (w < depth[idx]) {
                depth[idx] = w;
                kind[idx] = (x === c0 || x === c1) && c1 > c0 + 1 ? "kerb" : "road";
                idOf[idx] = null;
              }
            }
          }
        }
        prev = cur || prev;
      }

      // ── scenery ──
      const reg = G.track.props;
      if (reg) {
        for (const p of reg.list) {
          const dx = p.x - eye[0], dz = p.z - eye[2];
          const dist = Math.hypot(dx, dz);
          if (dist > range) continue;
          if (containsEye(eye, p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2)) continue;
          // A sparse hull is scatter, not a wall. Painting one solid put a
          // 32x31 m box of lamp bases across 68% of the frame where the render
          // shows sky and trees. Small props are exempt — their boxes ARE their
          // geometry however low the ratio computes.
          if (p.fill != null && p.fill < 0.06 && p.w * p.d > 150) continue;
          const rect = boxRect(vp, p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2);
          if (!rect) continue;
          const painted = paint(rect, p.kind, null);
          if (painted) {
            seenKinds[p.kind] = (seenKinds[p.kind] || 0) + 1;
            if (painted >= 2) {
              objects.push({ kind: p.kind, distM: r1(dist), cells: painted,
                             sizeM: [p.w, p.h, p.d] });
            }
          }
        }
      }

      // ── cars (painted last so they win ties against scenery at equal depth) ──
      for (const c of G.cars) {
        const [wx, wz] = carWorld(c);
        const dist = Math.hypot(wx - eye[0], wz - eye[2]);
        if (dist > range) continue;
        // ~F1 dimensions; the box is axis-aligned, which over-covers a yawed car
        const rect = boxRect(vp, wx, 0.55, wz, 1.1, 0.55, 2.6);
        if (!rect) continue;
        const k = c.isPlayer ? "player" : "car";
        const painted = paint(rect, k, c.id != null ? c.id : G.cars.indexOf(c));
        if (painted) {
          seenKinds[k] = (seenKinds[k] || 0) + 1;
          objects.push({ kind: k, id: c.id, code: c.code || null,
                         distM: r1(dist), cells: painted });
        }
      }

      // ── sky / ground for everything untouched ──
      // Ray elevation per row from the camera pitch and vertical FOV; cheaper and
      // steadier than unprojecting, and it puts the horizon where the renderer
      // does to within a row.
      const tgt = cam.tgt || G.camTgt;
      const fwdY = (tgt[1] - eye[1]);
      const fwdH = Math.hypot(tgt[0] - eye[0], tgt[2] - eye[2]) || 1;
      const pitch = Math.atan2(fwdY, fwdH);
      const vfovR = (G.camFov || 60) * Math.PI / 180;
      let horizonRow = null;
      for (let y = 0; y < rows; y++) {
        const elev = pitch + (0.5 - (y + 0.5) / rows) * vfovR;
        if (horizonRow === null && elev <= 0) horizonRow = y;
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (kind[i] === null) kind[i] = elev > 0 ? "sky" : "ground";
        }
      }

      // Optional EDGE overlay — the same depth-discontinuity edges the car
      // render uses, over the scene's semantic glyphs. Silhouettes (a car
      // against the road, a building against the sky) become | - / \ lines, so
      // the composition reads as a drawing rather than a fill. Sky/ground are
      // left alone. Uses the cell depth buffer already built for occlusion.
      const edges = o.edges ? new Array(N).fill(null) : null;
      if (edges) {
        const FAR = 1e6;
        const dAt = (x, y) => { const i = y * cols + x;
          return (kind[i] === "sky" || kind[i] === "ground" || !isFinite(depth[i]))
            ? FAR : depth[i]; };
        let dmax = 1;
        for (let i = 0; i < N; i++) if (isFinite(depth[i]) && depth[i] < FAR && depth[i] > dmax) dmax = depth[i];
        for (let y = 1; y < rows - 1; y++) {
          for (let x = 1; x < cols - 1; x++) {
            const i = y * cols + x;
            if (kind[i] === "sky" || kind[i] === "ground") continue;
            const gx = dAt(x + 1, y) - dAt(x - 1, y), gy = dAt(x, y + 1) - dAt(x, y - 1);
            const mag = Math.hypot(gx, gy) / dmax;
            if (mag > (o.edgeThresh || 0.35)) {
              const AX = Math.abs(gx), AY = Math.abs(gy);
              edges[i] = AX > AY * 2.4 ? "|" : AY > AX * 2.4 ? "-" : (gx * gy > 0 ? "\\" : "/");
            }
          }
        }
      }

      const lines = [];
      for (let y = 0; y < rows; y++) {
        let line = "";
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          line += (edges && edges[i]) || GLYPHS[kind[i]] || "?";
        }
        lines.push(line);
      }

      // Optional DEPTH channel. A depth buffer is a real render target — this
      // is measured, not a synthesised shading model, and reading it needs no
      // shape recognition, which is the thing models are documented to be poor
      // at in character art. Digits are near (0) to far (9), logarithmic so the
      // near field where driving decisions live gets the resolution.
      let depthLines, depthScale;
      if (o.depth) {
        const near = 2, far = range;
        depthScale = [];
        for (let d = 0; d <= 9; d++) {
          depthScale.push(r1(near * Math.pow(far / near, d / 9)));
        }
        depthLines = [];
        for (let y = 0; y < rows; y++) {
          let line = "";
          for (let x = 0; x < cols; x++) {
            const w = depth[y * cols + x];
            if (!isFinite(w)) { line += " "; continue; }
            const t = Math.log(Math.max(w, near) / near) / Math.log(far / near);
            line += String(clamp(Math.round(t * 9), 0, 9));
          }
          depthLines.push(line);
        }
      }

      // legend covers only what actually appears, so it stays small
      const used = {};
      for (let i = 0; i < N; i++) used[kind[i]] = (used[kind[i]] || 0) + 1;
      const legend = {};
      for (const k of Object.keys(used)) legend[GLYPHS[k] || "?"] = k;

      objects.sort((a, b) => b.cells - a.cells);
      const cover = {};
      for (const k of Object.keys(used)) cover[k] = r1(used[k] / N * 100);

      return {
        apiVersion: API_VERSION, conventions: CONVENTIONS,
        camera: { eye: eye.map(r1), target: (cam.tgt || G.camTgt).map(r1),
                  fovDeg: r1(cam.fovDeg || G.camFov), pitchDeg: r1(pitch * 180 / Math.PI),
                  mode: cam.mode, synthetic: cam.synthetic, debugCam: !!G.dbgCam },
        // A synthetic camera is computed fresh, so it is never stale; only the
        // live view depends on a rendered frame.
        framePending: !cam.synthetic && !!G.headlessMode,
        warning: (!cam.synthetic && G.headlessMode)
          ? "headless(true) skips render(), so the live camera may be stale — "
            + "name a camera to compute a fresh one" : undefined,
        grid: {
          cols, rows, rangeM: range, horizonRow, lines,
          // Keep it small on purpose. ASCIIEval finds model accuracy is
          // sensitive to the LENGTH of the art and that a low-resolution
          // prompting strategy improves perception — more cells is not more
          // legible. https://arxiv.org/abs/2410.01733
          aspect: {
            viewport: r2(viewAspect), cellAspect,
            renderedAspect: r2(cols / rows / cellAspect),
            corrected: !o.rows,
            note: o.rows
              ? "rows pinned by the caller; if renderedAspect differs from "
                + "viewport the image is stretched"
              : "rows derived from viewport and cell aspect so the image is "
                + "not squashed",
          },
        },
        legend,
        depth: depthLines ? { lines: depthLines, scaleM: depthScale,
                              note: "digit -> metres via scaleM; blank = sky or "
                                    + "ground with no geometry" } : undefined,
        coveragePct: cover,
        objects: objects.slice(0, clamp(o.limit | 0 || 20, 1, 100)),
        lighting: {
          timeOfDay: G.raceTimeOfDay, weather: G.raceWeather,
          exposure: fr.exposure != null ? r2(fr.exposure) : null,
          sunDir: fr.sunDir ? fr.sunDir.map(r2) : null,
          fogDensity: fr.fogDensity != null ? +fr.fogDensity.toFixed(5) : null,
          lights: fr.lights ? fr.lights.length / 15 : 0,
        },
        note: "occlusion is solved per cell by depth, so a nearer object hides "
              + "what is behind it. Boxes are axis-aligned, so a yawed car or a "
              + "rotated building over-covers slightly at cell resolution.",
      };
    }

    // ── the high-detail rasterizer — edge + shade, from real triangles ──────
    // The Acerola / Kang pipeline (https://www.youtube.com/watch?v=gg40RWiaHRY),
    // geometry-native: instead of a screen-space Difference-of-Gaussians + Sobel
    // on luminance, edges come straight from the DEPTH buffer (silhouettes and
    // creases are exact depth discontinuities), and interiors are Lambert-shaded
    // from the real surface normals into a density ramp. Sharper than the
    // photographic version because it never guesses a shape from shading.
    //
    // Supersampled ss x ss per character cell for anti-aliasing and gradient
    // room; composed down to one glyph: an edge cell gets a directional line
    // (| - / \) from the depth gradient, an interior cell a ramp glyph from its
    // shade, empty stays blank.
    const RAMP = " .:-=+*oO#%@";           // dark -> light
    const LIGHT = (() => { const l = [0.4, 0.75, 0.5]; const m = Math.hypot(l[0], l[1], l[2]);
                           return [l[0] / m, l[1] / m, l[2] / m]; })();

    // tris: {pos, idx, nrm}. project(vx,vy,vz)->{x,y,depth}|null in sub-pixels.
    // Returns { lines, cols, rows } after composing.
    function rasterTris(pos, idx, nrm, project, cols, rows, ss, edgeThresh) {
      const sw = cols * ss, sh = rows * ss, S = sw * sh;
      const depth = new Float64Array(S).fill(Infinity);
      const shade = new Float32Array(S).fill(-1);
      const nTris = idx && idx.length ? idx.length : pos.length / 3;
      const vi = (t, k) => idx && idx.length ? idx[t + k] : t + k;
      const P = [null, null, null];
      for (let t = 0; t < nTris; t += 3) {
        const ia = vi(t, 0) * 3, ib = vi(t, 1) * 3, ic = vi(t, 2) * 3;
        P[0] = project(pos[ia], pos[ia + 1], pos[ia + 2]);
        P[1] = project(pos[ib], pos[ib + 1], pos[ib + 2]);
        P[2] = project(pos[ic], pos[ic + 1], pos[ic + 2]);
        if (!P[0] || !P[1] || !P[2]) continue;
        // flat shade from the geometric normal (averaged) if present
        let sh2 = 0.6;
        if (nrm) {
          const nx = nrm[ia] + nrm[ib] + nrm[ic], ny = nrm[ia + 1] + nrm[ib + 1] + nrm[ic + 1],
                nz = nrm[ia + 2] + nrm[ib + 2] + nrm[ic + 2];
          const nl = Math.hypot(nx, ny, nz) || 1;
          sh2 = clamp((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl, -1, 1) * 0.45 + 0.5;
        }
        const ax = P[0].x, ay = P[0].y, bx = P[1].x, by = P[1].y, cxx = P[2].x, cyy = P[2].y;
        const d = (bx - ax) * (cyy - ay) - (cxx - ax) * (by - ay);
        if (Math.abs(d) < 1e-9) continue;
        const minx = Math.max(0, Math.floor(Math.min(ax, bx, cxx)));
        const maxx = Math.min(sw - 1, Math.ceil(Math.max(ax, bx, cxx)));
        const miny = Math.max(0, Math.floor(Math.min(ay, by, cyy)));
        const maxy = Math.min(sh - 1, Math.ceil(Math.max(ay, by, cyy)));
        for (let y = miny; y <= maxy; y++) {
          for (let x = minx; x <= maxx; x++) {
            const w1 = ((bx - x) * (cyy - y) - (cxx - x) * (by - y)) / d;
            const w2 = ((cxx - x) * (ay - y) - (ax - x) * (cyy - y)) / d;
            const w3 = 1 - w1 - w2;
            if (w1 < -0.01 || w2 < -0.01 || w3 < -0.01) continue;
            const dz = w1 * P[0].depth + w2 * P[1].depth + w3 * P[2].depth;
            const i = y * sw + x;
            if (dz < depth[i]) { depth[i] = dz; shade[i] = sh2; }
          }
        }
      }
      // Edge magnitude + direction per sub-sample, Sobel on depth (empty = far).
      const far = 1e6;
      const dAt = (x, y) => { const i = y * sw + x; return isFinite(depth[i]) ? depth[i] : far; };
      const lines = [];
      // normalise depth spread so edgeThresh is scale-free
      let dmin = Infinity, dmax = -Infinity;
      for (let i = 0; i < S; i++) if (isFinite(depth[i])) { if (depth[i] < dmin) dmin = depth[i]; if (depth[i] > dmax) dmax = depth[i]; }
      const dspan = (dmax - dmin) || 1;
      for (let cy2 = 0; cy2 < rows; cy2++) {
        let line = "";
        for (let cx2 = 0; cx2 < cols; cx2++) {
          // aggregate the ss x ss block
          let cov = 0, shSum = 0, gx = 0, gy = 0, emax = 0;
          for (let sy = 0; sy < ss; sy++) {
            for (let sx = 0; sx < ss; sx++) {
              const X = cx2 * ss + sx, Y = cy2 * ss + sy, i = Y * sw + X;
              if (isFinite(depth[i])) { cov++; shSum += shade[i]; }
              if (X > 0 && X < sw - 1 && Y > 0 && Y < sh - 1) {
                const gxx = (dAt(X + 1, Y) - dAt(X - 1, Y));
                const gyy = (dAt(X, Y + 1) - dAt(X, Y - 1));
                const mag = Math.hypot(gxx, gyy) / dspan;
                if (mag > emax) { emax = mag; gx = gxx; gy = gyy; }
              }
            }
          }
          if (emax > edgeThresh) {
            const AX = Math.abs(gx), AY = Math.abs(gy);
            line += AX > AY * 2.4 ? "|" : AY > AX * 2.4 ? "-" : (gx * gy > 0 ? "\\" : "/");
          } else if (cov > 0) {
            const sAvg = shSum / cov;
            line += RAMP[clamp(Math.round(sAvg * (RAMP.length - 1)), 1, RAMP.length - 1)];
          } else line += " ";
        }
        lines.push(line.replace(/\s+$/, ""));
      }
      return { lines, cols, rows };
    }

    // ── carRender() — orthographic edge+shade elevations of the car ─────────
    // The text version of the car photo studio (render-car.mjs). Real mesh, real
    // normals; +z forward, +y up.
    function orthoCar(pos, idx, nrm, ha, va, hSign, vSign, oa, cols, cellAspect, ss, EDGE_T) {
      let h0 = Infinity, h1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const h = pos[i + ha] * hSign, v = pos[i + va] * vSign;
        if (h < h0) h0 = h; if (h > h1) h1 = h; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const wSpan = (h1 - h0) || 1, hSpan = (v1 - v0) || 1;
      const mPerCol = wSpan / cols;
      const rows = clamp(Math.round(hSpan / mPerCol / cellAspect), 4, 44);
      const sw = cols * ss, sh = rows * ss;
      const project = (x, y, z) => {
        const c = [x, y, z];
        const h = c[ha] * hSign, v = c[va] * vSign;
        return { x: (h - h0) / wSpan * (sw - 1), y: (v1 - v) / hSpan * (sh - 1),
                 depth: -c[oa] };            // nearest along the view axis
      };
      const r = rasterTris(pos, idx, nrm, project, cols, rows, ss, EDGE_T);
      return { lines: r.lines, cols, rows, mPerCol: r2(mPerCol) };
    }

    function carRender(mesh, cols, edgeT) {
      const pos = mesh.pos, idx = mesh.idx, nrm = mesh.nrm;
      const ss = 3, ET = edgeT || 0.45;
      return {
        legend: { "| - / \\": "edges (silhouette + creases)",
                  " .:-=+*oO#%@": "surface, dark -> lit" },
        side: orthoCar(pos, idx, nrm, 2, 1, 1, 1, 0, cols, 2, ss, ET),           // z,y  view along x
        top: orthoCar(pos, idx, nrm, 2, 0, 1, 1, 1, cols, 2, ss, ET),            // z,x  view along y (top-down)
        front: orthoCar(pos, idx, nrm, 0, 1, -1, 1, 2, Math.round(cols * 0.55), 2, ss, ET), // x,y view along z
        note: "orthographic edge+shade from the real mesh; +z forward (nose "
              + "to the right in side/top). Edges are true depth discontinuities; "
              + "the ramp is Lambert shading. mPerCol converts columns to metres.",
      };
    }

    // ── plan() — the world from ABOVE, as text ──────────────────────────────
    // frame() is first-person, so any "where am I on the circuit / what is
    // around me in world terms" question forces the reference-frame shift models
    // are documented to be worst at (REM 2512.00736: they "lack mechanisms for
    // dynamic perspective-taking"). plan() gives the allocentric view directly:
    // a top-down map, drawn car-up so forward is up and no rotation is needed to
    // drive, with metric axes so every cell is also a coordinate.
    //
    // Grounded in the split the research shows: VoT (+27% from a 2D text grid),
    // GSU (Cartesian coordinates beat an ASCII layout — so provide BOTH), STMR
    // (semantic + topological + metric together beats any one). This is the text
    // version of aerial-survey.mjs / the survey-track aerial.
    const PLAN_GLYPH = {
      road: ".", kerb: ":", car: "o", player: "@",
      tree: "t", pine: "t", palm: "t", conifer: "t", bush: ",", hedge: ",",
      building: "B", house: "h", motorhome: "m", tower: "I", structure: "#",
      grandstand: "A", billboard: "b", signBoard: "s", marshalPost: "p",
      gantry: "=", mountain: "^", peak: "^", ridge: "^", prop: "o",
    };

    function plan(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const o = opts || {};
      const p = G.player;
      const cols = clamp(o.cols | 0 || 60, 12, 200);
      const cellAspect = clamp(o.cellAspect || 2, 1, 4);
      // World-square cells: a char cell is ~2x taller than wide, so a row must
      // span cellAspect x the metres a column does, or the map is stretched.
      const rows = clamp(Math.round(cols / cellAspect), 6, 100);
      const radius = clamp(o.radiusM || 200, 20, 4000);
      const mPerCol = (2 * radius) / cols;
      const mPerRow = mPerCol * cellAspect;

      // Origin + orientation. Car-up rotates the world so the car's heading points
      // to -row (up); north-up leaves world axes (─north-up is +z? use +x=east,
      // -z=north as the map convention, matching mapPts y=north).
      let ox, oz, rot, frame;
      const carUp = o.northUp ? false : true;
      if (p && p.px != null) { ox = p.px; oz = p.pz; }
      else {
        const b = Tracks; Tracks.sample(G.track, 0, scr); ox = scr.p[0]; oz = scr.p[2];
      }
      if (carUp && p && p.head != null) {
        rot = -p.head; frame = "car-up (up = the way the car faces)";
      } else {
        rot = 0; frame = "north-up (up = -z / north, right = +x / east)";
      }
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      // world (x,z) -> cell. Rotate about origin, then scale. Up (-row) is the
      // rotated -z (forward) in car-up, or world -z in north-up.
      const toCell = (x, z) => {
        const dx = x - ox, dz = z - oz;
        const rx = dx * cosR - dz * sinR;      // rotated east
        const rz = dx * sinR + dz * cosR;      // rotated north(-ish): forward = -rz
        const cx = Math.round(cols / 2 + rx / mPerCol);
        const cy = Math.round(rows / 2 + rz / mPerRow);   // +rz downward
        return { cx, cy, rx, rz };
      };

      const grid = new Array(cols * rows).fill(null);
      const near = new Float64Array(cols * rows).fill(Infinity);
      const put = (cx, cy, kind, priority) => {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
        const i = cy * cols + cx;
        if (priority < near[i]) { near[i] = priority; grid[i] = kind; return true; }
        return false;
      };

      // ── the track ribbon ──
      // Walk the whole lap; for each node in range, fill across the road width so
      // the ribbon reads as a band, not a hairline. Priority 5 (below props/cars).
      const total = G.track.total, step = Math.max(2, mPerCol * 0.5);
      let onScreenNodes = 0;
      for (let s = 0; s < total; s += step) {
        Tracks.sample(G.track, s, scr);
        if (Math.hypot(scr.p[0] - ox, scr.p[2] - oz) > radius * 1.6) continue;
        const rl = Math.hypot(scr.r[0], scr.r[2]) || 1;
        const ex = scr.r[0] / rl, ez = scr.r[2] / rl;
        const half = scr.hw;
        for (let lat = -half; lat <= half; lat += mPerCol * 0.5) {
          const c = toCell(scr.p[0] + ex * lat, scr.p[2] + ez * lat);
          const kind = Math.abs(lat) > half - mPerCol * 0.5 ? "kerb" : "road";
          if (put(c.cx, c.cy, kind, 5)) onScreenNodes++;
        }
      }

      // ── named scenery ──
      const reg = G.track.props;
      const counts = {};
      if (reg) {
        for (const q of reg.list) {
          if (Math.hypot(q.x - ox, q.z - oz) > radius * 1.5) continue;
          const c = toCell(q.x, q.z);
          if (put(c.cx, c.cy, q.kind, 3)) counts[q.kind] = (counts[q.kind] || 0) + 1;
        }
      }

      // ── cars ──
      const cars = [];
      for (const car of G.cars) {
        const [wx, wz] = carWorld(car);
        if (Math.hypot(wx - ox, wz - oz) > radius * 1.5) continue;
        const c = toCell(wx, wz);
        const isP = car.isPlayer;
        put(c.cx, c.cy, isP ? "player" : "car", isP ? -1 : 1);
        if (!isP) cars.push({ id: car.id, code: car.code || null,
                              aheadM: r1(-c.rz), rightM: r1(c.rx) });
      }
      // Ensure the player is always the centre glyph in car-up.
      if (carUp && p && p.px != null) put(Math.round(cols / 2), Math.round(rows / 2), "player", -2);

      const lines = [];
      for (let y = 0; y < rows; y++) {
        let line = "";
        for (let x = 0; x < cols; x++) {
          const k = grid[y * cols + x];
          line += k ? (PLAN_GLYPH[k] || "?") : " ";
        }
        lines.push(line.replace(/\s+$/, ""));
      }

      const used = {};
      for (const k of grid) if (k) used[k] = 1;
      const legend = {};
      for (const k of Object.keys(used)) legend[PLAN_GLYPH[k] || "?"] = k;

      // ── the index: every notable thing on the map, keyed to its cell AND to
      // metric coordinates, so the raster is the gestalt and this is the ground
      // truth. GSU: coordinates beat an ASCII layout, so ship both.
      const cc = Math.round(cols / 2), cr = Math.round(rows / 2);
      const bearing = (rx, rz) => r1(Math.atan2(rx, -rz) * 180 / Math.PI); // 0=ahead,+=right
      const entry = (x, z, extra) => {
        const c = toCell(x, z);
        const o2 = { cell: [c.cx, c.cy], world: [r1(x), r1(z)],
                     aheadM: r1(-c.rz), rightM: r1(c.rx),
                     distM: r1(Math.hypot(c.rx, c.rz)), bearingDeg: bearing(c.rx, c.rz) };
        return Object.assign(o2, extra);
      };

      // Corners visible on the map, numbered — the topological skeleton.
      const cornersOnMap = [];
      for (const co of corners()) {
        Tracks.sample(G.track, co.s, scr);
        if (Math.hypot(scr.p[0] - ox, scr.p[2] - oz) > radius * 1.4) continue;
        cornersOnMap.push(entry(scr.p[0], scr.p[2],
          { turn: co.turn, dir: co.dir, radiusM: co.radiusM, severity: co.severity }));
      }
      cornersOnMap.sort((a, b) => a.distM - b.distM);

      // Individually notable structures (not the repeated tree/bush dressing).
      const NOTABLE = ["grandstand", "building", "tower", "house", "motorhome",
                       "mountain", "gantry", "structure", "billboard"];
      const landmarks = [];
      if (reg) {
        for (const q of reg.list) {
          if (NOTABLE.indexOf(q.kind) < 0) continue;
          if (Math.hypot(q.x - ox, q.z - oz) > radius * 1.4) continue;
          landmarks.push(entry(q.x, q.z, { kind: q.kind, sizeM: [q.w, q.h, q.d] }));
        }
        landmarks.sort((a, b) => a.distM - b.distM);
      }

      // A metric ruler so any glyph converts to metres without arithmetic.
      const tick = (n) => { let s = ""; for (let i = 0; i < cols; i++)
        s += (i === cc ? "|" : i % 10 === cc % 10 ? "'" : " "); return s; };
      const ruler = tick();
      const rulerLabel = (() => {
        const chars = new Array(cols).fill(" ");
        for (let i = 0; i < cols; i += 10) {
          const m = Math.round((i - cc) * mPerCol);
          const lab = (m > 0 ? "+" : "") + m;
          for (let j = 0; j < lab.length && i + j < cols; j++) chars[i + j] = lab[j];
        }
        return chars.join("").replace(/\s+$/, "");
      })();

      const p2 = G.player;
      const ego = p2 && p2.px != null ? {
        headingDeg: r1((p2.head || 0) * 180 / Math.PI),
        speedKph: r1((p2.speed || 0) * 3.6),
        elevationM: (Tracks.sample(G.track, p2.s, scr), r1(scr.p[1])),
        onTrackFrac: +(p2.s / total).toFixed(4),
        lateralM: r2(p2.x || 0),
        nextCorner: nextCorner(p2.s, p2.speed || 0),
      } : null;

      return {
        apiVersion: API_VERSION, conventions: CONVENTIONS,
        frame,
        origin: { x: r1(ox), z: r1(oz),
                  headingDeg: p && p.head != null ? r1(p.head * 180 / Math.PI) : null,
                  onTrackFrac: p && p.s != null ? +(p.s / total).toFixed(4) : null },
        scale: { radiusM: radius, metresPerCol: r2(mPerCol), metresPerRow: r2(mPerRow),
                 cols, rows,
                 note: "cell (col,row) from centre = ((col-" + cc
                       + ")*mPerCol, (row-" + cr + ")*mPerRow) in the "
                       + (carUp ? "car frame: -row = ahead, +col = right"
                                : "world frame: -row = north(-z), +col = east(+x)") },
        grid: { lines, ruler, rulerLabel,
                note: "ruler ' marks every 10 cols, | is centre; rulerLabel gives "
                      + "the metres east/right at those ticks" },
        legend,
        ego,
        corners: cornersOnMap,
        landmarks,
        cars: cars.sort((a, b) => Math.hypot(a.aheadM, a.rightM) - Math.hypot(b.aheadM, b.rightM)),
        sceneryCounts: counts,
        note: "top-down map with a metric index. The raster is the gestalt; "
              + "corners/landmarks/cars carry exact cell + world coords + bearing "
              + "so nothing needs measuring off the characters. {northUp:true} for "
              + "the world frame, {radiusM} to zoom.",
      };
    }

    // ── carView() — the car, without rendering it ───────────────────────────
    // Replaces tools/render-car.mjs for everything except "does it LOOK right":
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
        // Falling back to the first team would answer a question nobody asked
        // and look like a valid result.
        return fail("NoTeamError", 'unknown team "' + teamId + '"',
                    "call __apex.teams() for the valid ids");
      }
      const setup = o.parts || G.getTeamParts(team.id);
      const res = Parts.resolveSetup(setup, team);
      const style = Car3D.teamStyleOf(team.id);

      // Build the real mesh and measure it — the dimensions an agent would
      // otherwise read off a screenshot with a ruler.
      let geom = null, parts = null, render = null, meshRef = null;
      try {
        const mesh = Car3D.build(team.color, team.color2,
                                 { parts: res.visual, teamId: team.id });
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
        render = carRender(meshRef, o.cols | 0 || 46, o.edgeThresh);
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
        // The per-team silhouette knobs — what makes this chassis look like this
        // team's car independent of paint. Documented in js/car/car3d.js.
        chassis: {
          style,
          // TEAM_STYLE is keyed by team id and DEFAULT_STYLE is not exported, so
          // "does this team have a bespoke silhouette" is a key test, not an
          // identity test against a value that isn't reachable from here.
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
              + "visual check use tools/render-car.mjs. "
              + 'Pass {detail:"parts"} for per-part measured boxes.',
      };
    }

    // ── survey() — geometry defects, as a report ────────────────────────────
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
    // A CLIFF is a slope, not a height. Testing absolute rise between lateral
    // samples reported 157 "steps" on Spa, which is simply a hill: at 10 m
    // sample spacing a 1 m rise is a 10% grade. 0.55 is ~29 degrees.
    const CLIFF_SLOPE = 0.55;
    const OVER_ROAD_M = 0.15;   // terrain above road surface by this = poking through

    function survey(opts) {
      if (!G.track) {
        return fail("NoTrackError", "no track is loaded",
                    'call __apex.race("monza") first');
      }
      const o = opts || {};
      const track = G.track, total = track.total;
      const nAt = clamp(o.at | 0 || 24, 2, 200);
      const reach = clamp(o.reachM || 60, 10, 400);
      const nLat = clamp(o.lats | 0 || 13, 3, 41);
      const cap = clamp(o.limit | 0 || 20, 1, 200);

      // ── lateral ground profile ──
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
        // A null BETWEEN solid readings is a hole in the ribbon — props out
        // there fall back to the closed-form estimate and float or sink. A
        // trailing null at the outer edge is just where the ribbon stops.
        //
        // Nulls over the ROAD are not holes: the terrain ribbon starts ~2.2 m
        // beyond the tarmac by design and the road mesh covers the middle.
        // Counting those reported one "hole" per station on a clean circuit.
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

      // ── prop grounding ──
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
          const pr = judgeable ? Tracks.project(track, p.x, p.z) : null;
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
          // Candidates are deliberately NOT part of the verdict: they are a
          // screen with known over-reporting, not a defect count.
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
          terrainOverRoad: "tests/terrain-over-road.spec.js",
        },
        note: "pass {profile:true} for the full lateral ground table. A terrain "
              + "hole (null between solid readings) is the classic cause of "
              + "floating props — the closed-form ground estimate takes over there.",
      };
    }

    // ── worldModel() — the whole world as readable text ─────────────────────
    // scene() answers "what is near me". This answers "what IS this place" —
    // the entire circuit as one structured document.
    //
    // The problem is size, not availability. Suzuka records 3,422 point objects;
    // listed individually that is ~85k tokens of "pine, pine, pine" and it does
    // not describe the world any better than the raw vertex buffer did. So the
    // model AGGREGATES: contiguous runs of the same kind on the same side become
    // one feature — "412 pines along the left from 1.20 to 1.85 km" — which is
    // both an order of magnitude cheaper and closer to what the place actually
    // looks like. Individually interesting objects (grandstands, buildings,
    // towers, mountains) stay as landmarks, and the lap is broken into
    // corner-to-corner sections so the document can be read in order.
    //
    // detail: "summary" (totals + features + landmarks) | "sections" (+ a
    // corner-by-corner walk) | "full" (+ the raw object list, paginated).

    // Repeated dressing — clustered. Landforms cluster too: a mountain range is
    // emitted as hundreds of ridge segments and listing each as a landmark buries
    // the actual landmarks.
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
    // Same kind, same side, and no bigger gap than this between neighbours =
    // one continuous feature. 60 m is about the point where a treeline reads as
    // two stands rather than one.
    const CLUSTER_GAP_M = 60;
    // ...but a run is also cut here regardless of gaps. Without it, trees spaced
    // every 20 m around a park circuit collapse into ONE feature covering the
    // whole lap — true, and a useless description. Capping the run keeps every
    // feature locally meaningful ("trees along the left, 0.0-0.4 km").
    const CLUSTER_MAX_RUN_M = 400;

    let modelCache = null;

    // Arc position of a recorded prop. Most carry the node index they were
    // placed from, which is exact and free; landforms placed in world coords
    // (mountains, ridges) need the projection.
    // Gantries straddle the road (side 0); landforms are placed in world coords
    // and have no side at all. Collapsing both into "left" was wrong twice.
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
        return { s: k / G.track.n * G.track.total,
                 lat: p.side != null ? p.side : null };
      }
      const pr = Tracks.project(G.track, p.x, p.z);
      return pr ? { s: pr.s, lat: pr.lat } : { s: 0, lat: null };
    }
    function propS(p) { return propPos(p).s; }

    function buildModel() {
      const track = G.track, total = track.total;
      const reg = track.props;
      const pts = reg.list.map((p) => {
        const pos = propPos(p);
        // An anonymous structure has no side recorded, but its projected lateral
        // offset says which side of the road it stands on — far more useful than
        // calling every one of them "off-course".
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
                    'call worldModel({detail:"sections"})');
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
        // Contiguous runs of one kind on one side, collapsed. This is the bulk
        // of the circuit's dressing expressed as a few dozen lines.
        features: m.features,
        // Linear furniture — armco, catch fence, tyre walls, boundary walls —
        // recorded as spans by the emitters rather than per 3-6 m segment.
        spans: reg.spans.map((sp) => ({
          kind: sp.kind, side: sp.side > 0 ? "right" : "left",
          fromFrac: sp.s0, toFrac: sp.s1,
          lengthM: r1((((sp.s1 - sp.s0) % 1 + 1) % 1) * total),
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

    // ── rollout() — drive, then summarise ───────────────────────────────────
    // The single biggest token win available. A 5 s experiment at 60 Hz is 300
    // observations; reading them back frame by frame costs tens of thousands of
    // tokens to answer a question ("did that setup carry more speed through T4?")
    // that a digest answers in a few hundred.
    //
    // It also encodes the loop the real-time agent literature converges on: an
    // LLM cannot decide at 60 Hz, so the policy runs at policyHz (default 10)
    // while physics runs every tick. Pass a constant `input` instead and it is
    // a pure open-loop probe.

    // Which corner, if any, contains this arc position. entryS > exitS means the
    // corner wraps the start/finish line.
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
      const dt = clamp(o.dt || 1 / 60, 1 / 240, 1 / 10);
      const seconds = clamp(o.seconds != null ? o.seconds : 5, 0.05, 120);
      const ticks = Math.max(1, Math.round(seconds / dt));
      const policy = typeof o.policy === "function" ? o.policy : null;
      const policyEvery = Math.max(1, Math.round(1 / ((o.policyHz || 10) * dt)));
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
      if (o.input !== undefined) G._testInput = o.input || null;

      // A rollout calls world() internally when a policy is supplied, which would
      // otherwise advance seq and clobber the delta baseline of the caller's own
      // observation chain. Snapshot and restore it.
      const savedPayload = lastPayload, savedSeq = lastSeq, savedCounter = seq;

      const p = G.player;
      const list = corners();
      const startProg = p.prog || 0, startT = G.raceT || 0, startLap = p.lap || 0;
      const startFrac = p.s / G.track.total;
      let minSpeed = Infinity, maxSpeed = -Infinity, sumSpeed = 0;
      let offTicks = 0, offEvents = 0, wasOff = false;
      let minClear = Infinity, contacts = 0, wasContact = false;
      let terminalReason = null, terminalAtT = null;
      const cornerMin = {};
      const samples = [];

      for (let i = 0; i < ticks; i++) {
        if (policy && i % policyEvery === 0) {
          let inp = null;
          try { inp = policy(world({ detail: "brief" })); }
          catch (e) {
            lastPayload = savedPayload; lastSeq = savedSeq; seq = savedCounter;
            return fail("PolicyError", "the policy function threw: " + (e && e.message),
                        "fix the policy; it receives world({detail:'brief'}) and "
                        + "must return {steer,throttle,brake} or null");
          }
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

        if (!terminalReason) {
          const t = terminal();
          if (t.done) { terminalReason = t.reason; terminalAtT = r2(G.raceT - startT); }
        }

        if (i % sampleEvery === 0 || i === ticks - 1) {
          samples.push({ t: r2(G.raceT - startT), frac: +(p.s / G.track.total).toFixed(4),
                         speedKph: r1(sp * 3.6), lateralM: r1(p.x), gear: p.gear || 1 });
        }
      }

      lastPayload = savedPayload; lastSeq = savedSeq; seq = savedCounter;

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
        // The point of the whole exercise for tuning work: minimum speed through
        // each corner actually driven, which is what a setup change moves.
        cornerMinSpeedKph: Object.keys(cornerMin).map((t) =>
          ({ turn: t, minSpeedKph: r1(cornerMin[t] * 3.6) })),
        terminal: { done: !!terminalReason, reason: terminalReason, atS: terminalAtT },
        samples,
        note: "a digest of " + ticks + " physics ticks — call world() for the "
              + "current state, this describes the interval",
      };
    }

    // ── agentHelp() — discovery ─────────────────────────────────────────────
    // Progressive disclosure: ~200 tokens naming the surface and the loop, so an
    // agent can find its way without loading docs/DEBUG-HOOKS.md.
    function agentHelp() {
      return {
        apiVersion: API_VERSION, physicsVersion: PHYSICS_VERSION,
        conventions: CONVENTIONS,
        // Grouped by the question being asked, because the overlap between
        // scene/visible/frame/worldModel is the part that is genuinely
        // confusing — `whenToUse` below exists to settle it in one read.
        perceive: {
          "world({detail,horizonS,points,since})":
            "WHERE AM I — egocentric snapshot; detail brief|drive|full; "
            + "`since` returns only what changed",
          "frame({cols,rows,cellAspect,rangeM,depth,limit})":
            "WHAT DOES IT LOOK LIKE — the view as a depth-sorted character "
            + "raster; {camera:'cockpit'|...} renders any of the 13 modes fresh, "
            + "{edges:true} adds silhouette line-glyphs, {depth:true} a depth "
            + "channel. Keep the grid small. Screenshot replacement",
          "plan({radiusM,cols,northUp})":
            "WHERE ON THE MAP — top-down view, car-up, with a metric index "
            + "(corners/landmarks/cars carry cell + world coords). Allocentric "
            + "companion to frame(); the text version of an aerial",
          "scene({radius,kinds,limit})":
            "WHAT IS AROUND ME — named scenery by distance and bearing",
          "visible({limit})":
            "WHAT IS ON SCREEN — a list, not a picture. Needs a rendered frame",
        },
        know: {
          "trackInfo({what})":
            "STATIC per-track data — corners|sectors|profile|all. "
            + "Constant for a session: fetch once, never per tick",
          "worldModel({detail,offset,limit})":
            "WHAT IS THIS PLACE — the whole circuit as one document; "
            + "summary|sections|full",
          "survey({at,lats,reachM,limit,profile})":
            "IS ANYTHING BROKEN — floating/buried props, props over the racing "
            + "line, terrain through the road, holes and cliffs in the ground",
          "carView({team,parts,detail})":
            "WHAT AM I DRIVING — team, parts spec and effects, chassis "
            + 'silhouette, measured geometry; detail:"parts" adds per-part boxes',
        },
        act: {
          "rollout({seconds,dt,input,policy,policyHz,samples})":
            "drive an interval, return a digest instead of every frame",
          "terminal()": "{done, reason} — finished|wrong_way|rescued|null",
        },
        whenToUse: {
          "near vs on-screen": "scene() is a radius around the CAR and ignores "
            + "the camera; visible() and frame() are the CAMERA's view",
          "list vs picture": "visible() names what is in shot; frame() shows "
            + "where it sits and what hides what",
          "now vs always": "scene() is live; worldModel() is the static circuit",
          "per tick": 'world({detail:"brief", since:<seq>}) — ~355 bytes/step, '
            + "34x cheaper than full. detail is the big lever; `since` only pays "
            + "on brief or a static scene (measured: 1.2x on drive while moving)",
        },
        setup: ['__apex.race("monza")', "__apex.go()", "__apex.jump(0.1, 55)"],
        loop: "world() -> decide -> rollout({seconds, policy}) -> read the digest",
        cli: "node tools/agent.mjs <track> <help|world|frame|scene|visible|"
             + "track|model|car|survey|rollout> [flags]",
        notes: [
          "no agent hook returns null — failures are {ok:false, error, message, fix}",
          "an LLM cannot decide at 60 Hz: rollout runs your policy at policyHz "
            + "(default 10) while physics runs every tick",
          "visible() and frame() reflect the LAST RENDERED frame and are stale "
            + "under headless(true) — both set framePending when they are",
          "frame() rasterises axis-aligned boxes, so tree canopies (really cones) "
            + "over-cover and sky is under-reported in wooded scenes",
          "the ~89 hooks on __apex are the underlying dev console and still work",
        ],
      };
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
                    sizeM: [p.w, p.h, p.d], at: [p.x, p.y, p.z],
                    // whether sizeM came from the emitted geometry or the call
                    // site's guess, and for anonymous assemblies how much of the
                    // box is actually solid — a caller reasoning about clearance
                    // needs both
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

    return { world, trackInfo, visible, scene, worldModel, frame, plan, carView, survey, rollout, agentHelp, corners, terminal,
             API_VERSION, PHYSICS_VERSION };
  }

  return { create };
})();
