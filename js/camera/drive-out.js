/* Apex 26 — THE GARAGE DRIVE-OUT (DriveOut.create(G)): the pre-race flyby's opening shot, and the reverse of the pit-work arrival (js/garage/arrival.js). The camera stands inside YOUR team's bay on the circuit's own pit lane — js/track/scenery/pits.js builds the setup screen's bay there, doorway open — and the car rolls out of the door, onto the working lane and away towards the pit exit, before the flyby's usual shots. Prepended at race time, never in FlybySeq.DEFAULT (whose fractions the loading screen's radio check and its tests pin), with its own seconds added to the flyby's budget, so every other shot keeps the time it had. */
const DriveOut = (function () {
  "use strict";

  const SECONDS = 5.5;   // at the arrival tuner's speed 1
  const HOLD = 0.14;     // of the shot: the car sits in the bay before it moves
  // Bay-local numbers (js/garage/scene-prims.js: the door at z +6.4, the back
  // wall at -6.4, half width 5.4), re-expressed from the DOOR LINE: `l` metres
  // into the bay, `a` metres of arc along the racing direction.
  const L_CAR = 4.4;     // the car's centre at rest: nose ~1.6 m inside the door, tail clear of the back wall
  const A_CAR = -0.3;    // a hair off the door's centre, clear of the lite props' front jack
  const A_RUN = 9;       // arc the car covers along the working lane before the shot ends
  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

  /** The drive-out path in (a, l): a quadratic from rest in the bay, out through
   *  the door, turning onto the working lane at `laneL` (negative: out of the
   *  bay). Pure. Returns {a, l, yaw, v}: `yaw` in the car's own convention (0 =
   *  along the racing direction, the side of the pit lane set by `sd`), `v` the
   *  path speed in metres per unit of `u`. */
  function path(u, laneL, sd) {
    const w = u < HOLD ? 0 : ease((u - HOLD) / (1 - HOLD));
    const p0 = [A_CAR, L_CAR], c = [A_CAR, laneL], p2 = [A_CAR + A_RUN, laneL];
    const k0 = (1 - w) * (1 - w), k1 = 2 * (1 - w) * w, k2 = w * w;
    const a = k0 * p0[0] + k1 * c[0] + k2 * p2[0], l = k0 * p0[1] + k1 * c[1] + k2 * p2[1];
    const da = 2 * (1 - w) * (c[0] - p0[0]) + 2 * w * (p2[0] - c[0]);
    const dl = 2 * (1 - w) * (c[1] - p0[1]) + 2 * w * (p2[1] - c[1]);
    // +l is INTO the bay, which is away from the track: world +sd * right.
    const yaw = Math.atan2(dl * sd, da);
    const x = (u - HOLD) / (1 - HOLD), dw = x <= 0 || x >= 1 ? 0 : 6 * x * (1 - x) / (1 - HOLD);
    return { a, l, yaw, v: Math.hypot(da, dl) * dw };
  }

  /** The shot, in `box` anchors ({at: "box", off, x, y}: `off` metres of arc from
   *  the box, `x` metres from the door line INTO the bay). The eye dollies from the
   *  back of the bay to just inside the door on the UPSTREAM side, so the jamb
   *  never hides a car that turns downstream; "right" mirrors it. Pure. */
  function shot(laneL, cfg) {
    const m = cfg && cfg.angle === "right" ? -1 : 1, fov = (cfg && cfg.fov) || 54;
    return {
      id: "garage-out", dur: 0, ease: "inOut",
      eye: [{ at: "box", off: -3.6 * m, x: 11.0, y: 2.1 }, { at: "box", off: -3.0 * m, x: 1.2, y: 1.6 }],
      look: [{ at: "box", off: A_CAR, x: L_CAR - 1.8, y: 0.7 }, { at: "box", off: A_CAR + A_RUN * 0.8, x: laneL, y: 0.8 }],
      fov: [fov, fov],
    };
  }

  function create(G) {
    Log.info("game", "DriveOut.create");
    let box = null, saved = null, car = null, durS = SECONDS;
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };

    function cfg() {
      try { return GarageArrival.settings(G.store.get("garageArrival", null)); } catch (_) { return { enabled: false }; }
    }
    /** The player's own bay on THIS circuit, or null: no bays (Jeddah), a row too
     *  short for them, a team not in the row (a legend takes MY TEAM's, as
     *  PitLane does). */
    function findBox() {
      const track = G.track, pit = track && track.pit, player = G.player;
      if (!pit || !pit.hasBays || !pit.row || !pit.row.boxes || !pit.row.boxes.length || !player) return null;
      const t = player.team, id = t ? (typeof t === "object" ? t.id : t) : null;
      let i = typeof TrackPit !== "undefined" && TrackPit.rowOf ? TrackPit.rowOf(pit, id) : -1;
      if (i < 0) i = pit.row.boxes.length - 1;
      const b = pit.row.boxes[i];
      if (!b || !Number.isFinite(b.s) || (pit.row.placed && pit.row.placed.indexOf(b.s) < 0)) return null;
      const o = pit.off || {};
      const out = +o.workOut, corr = +o.corrOut;
      if (!(out > 0) || !(corr > 0)) return null;
      return { s: b.s, sd: pit.side < 0 ? -1 : 1, out, laneL: -(out - corr) / 2 };
    }

    /** The opening shot for this race, or null (tuner off, no bay). Arms the
     *  sequencer's box anchor and remembers the bay for car(). */
    function lead() {
      saved = null; car = null; box = null;
      const c = cfg();
      if (!c.enabled || typeof FlybySeq === "undefined" || !FlybySeq.setBox) return null;
      box = findBox();
      FlybySeq.setBox(box);
      if (!box) return null;
      const sh = shot(box.laneL, c);
      sh.ms = Math.round(SECONDS * 1000 / (c.speed || 1));
      durS = sh.ms / 1000;
      return sh;
    }

    const FIELDS = ["s", "x", "xVis", "px", "pz", "rPrevPx", "rPrevPz", "rPrevS", "rPrevX", "head", "rPrevHead", "yawVis", "rPrevYawVis", "steerVis", "speed"];
    /** Pose the player's car for the shot on air (FlybySeq.shotAt), and put it
     *  back on its grid slot once the drive-out has gone. Every frame: nothing
     *  in the menu re-seats a car, and the render interpolates rPrev* -> px by a
     *  stale alpha, so both halves are written together. */
    function pose(at) {
      const c = G.player, track = G.track;
      if (!box || !c || !track || !at) return;
      if (at.index !== 0) {
        if (saved && car === c) for (const k of FIELDS) c[k] = saved[k];
        saved = null; car = null;
        return;
      }
      if (!saved || car !== c) { saved = {}; for (const k of FIELDS) saved[k] = c[k]; car = c; }
      const p = path(at.t, box.laneL, box.sd);
      const s = ((box.s + p.a) % track.total + track.total) % track.total;
      Tracks.sample(track, s, smp);
      const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
      const x = box.sd * (smp.hw + box.out + p.l);
      c.s = s; c.x = x; c.xVis = x;
      c.px = smp.p[0] + smp.r[0] / rl * x; c.pz = smp.p[2] + smp.r[2] / rl * x;
      c.head = Math.atan2(smp.t[0], smp.t[2]) + p.yaw;
      c.yawVis = p.yaw; c.steerVis = 0;
      c.speed = p.v / durS;
      c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevHead = c.head; c.rPrevYawVis = c.yawVis;
    }

    /** Back to the grid, now: a skip or a stop mid-shot. */
    function reset() {
      const c = car;
      if (saved && c) for (const k of FIELDS) c[k] = saved[k];
      saved = null; car = null;
    }

    return { lead, pose, reset, box: () => box };
  }

  return Object.freeze({ create, path, shot, SECONDS, HOLD, L_CAR, A_CAR, A_RUN });
})();
