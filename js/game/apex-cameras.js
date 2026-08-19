// PARENT LOCKSTEP: LAZY_AGENT after apex.js predecessor; AGENT_FILES + LAZY_EDGES
"use strict";
/* Apex 26 — __apex debug free-cam shot helpers.
   ApexCameras.create(G). Extracted from apex.js: view / eyeAt / orbit /
   cinematic / studio / carOrbit / dolly / roadside / tourShots. G already
   owned dbgCam / track / smp / smp2 / frame / _studioRig / cars / player.
   ApexApi.create must call ApexCameras.create(G). */
const ApexCameras = (function () {
  function create(G) {
    Log.info("apex", "ApexCameras.create");
    const { smp, smp2 } = G;

    // Debug free camera for surveying track layouts/scenery — look at anything.
    // Call with no args (or "chase") to restore the chase cam. Option forms:
    //   {}                                       aerial of the whole track
    //   { s, radius }                            focus a lap-fraction s
    //   { azimuth, elevation, zoom, fov, fog }   aerial/focus framing (degrees)
    //   { s, side, dist, height, look }          stand TRACKSIDE at s, look outward
    //                                            (side "L"/"R"/±1; look:"in" faces track)
    //   { eye:[x,y,z], yaw, pitch, fov }         free-look from a point (degrees)
    //   { eye:[x,y,z], target:[x,y,z], fov }     fully explicit
    // Returns the resolved {eye, target, ...}.
    function view(opts) {
      if (!G.track) return false;
      // Only an explicit "chase" restores the game camera. view() with NO args is the
      // documented whole-track aerial — fall through to the bbox branch below (it was
      // wrongly short-circuiting to chase, so view() framed the road instead).
      if (opts === "chase" || (opts && opts.mode === "chase")) { G.dbgCam = null; return { mode: "chase" }; }
      opts = opts || {};
      // free-look: explicit eye, aimed by yaw (0 = -Z, +90 = +X) and pitch (deg)
      if (opts.eye && (opts.yaw != null || opts.pitch != null)) {
        const yaw = (opts.yaw || 0) * Math.PI / 180, pit = Math.min(80, Math.max(-80, opts.pitch || 0)) * Math.PI / 180;
        const d = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
        const e = opts.eye;
        G.dbgCam = { eye: e.slice(), target: [e[0] + d[0] * 100, e[1] + d[1] * 100, e[2] + d[2] * 100], fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
        return { eye: e.slice(), yaw: opts.yaw || 0, pitch: opts.pitch || 0 };
      }
      if (opts.eye && opts.target) {
        G.dbgCam = { eye: opts.eye.slice(), target: opts.target.slice(), fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
        return G.dbgCam;
      }
      // trackside survey: stand beside the track at fraction s, look out at the
      // scenery on `side` (or back at the track with look:"in")
      if (opts.s != null && opts.side != null) {
        Tracks.sample(G.track, opts.s * G.track.total, smp);
        const side = opts.side === "L" ? -1 : opts.side === "R" ? 1 : (opts.side || 1);
        const dist = opts.dist != null ? opts.dist : 14, height = opts.height != null ? opts.height : 9;
        const p = smp.p, r = smp.r;
        const eye = [p[0] + r[0] * side * dist, p[1] + height, p[2] + r[2] * side * dist];
        const target = opts.look === "in"
          ? [p[0], p[1] + 1, p[2]]
          : [p[0] + r[0] * side * (dist + 80), p[1] + height * 0.4, p[2] + r[2] * side * (dist + 80)];
        G.dbgCam = { eye, target, fov: Math.min(170, Math.max(1, opts.fov || 62)), far: opts.far || 6000, fog: opts.fog };
        return { eye, target };
      }
      // centre + span: a focus point at lap-fraction s, or the whole-track bbox
      let cx, cy, cz, span;
      if (opts.s != null) {
        Tracks.sample(G.track, opts.s * G.track.total, smp);
        cx = smp.p[0]; cy = smp.p[1]; cz = smp.p[2];
        span = Math.max(10, opts.radius || 180);
      } else {
        let nx = Infinity, xx = -Infinity, nz = Infinity, xz = -Infinity, ny = Infinity, xy = -Infinity;
        for (let i = 0; i < G.track.n; i++) {
          const x = G.track.px[i], z = G.track.pz[i], y = G.track.py[i];
          if (x < nx) nx = x; if (x > xx) xx = x; if (z < nz) nz = z; if (z > xz) xz = z;
          if (y < ny) ny = y; if (y > xy) xy = y;
        }
        cx = (nx + xx) / 2; cy = (ny + xy) / 2; cz = (nz + xz) / 2;
        span = Math.max(xx - nx, xz - nz);
      }
      const az = (opts.azimuth != null ? opts.azimuth : 35) * Math.PI / 180;
      const el = Math.min(85, Math.max(5, opts.elevation != null ? opts.elevation : 55)) * Math.PI / 180;
      const dist = span * (opts.zoom != null ? opts.zoom : 1.0) * 0.95 + 60;
      const eye = [
        cx + Math.cos(el) * Math.sin(az) * dist,
        cy + Math.sin(el) * dist,
        cz + Math.cos(el) * Math.cos(az) * dist,
      ];
      G.dbgCam = { eye, target: [cx, cy, cz], fov: Math.min(170, Math.max(1, opts.fov || 55)), far: Math.max(6000, dist * 4), fog: opts.fog };
      return { eye, target: [cx, cy, cz], span: Math.round(span) };
    }
    // Place the debug free-cam at a track-relative point and aim it at another —
    // far easier than hand-computing world coords for view({eye,target}). The eye
    // sits at lap-fraction `f`, `lat` m off the centreline (+right), `h` m up; it
    // looks at lap-fraction `lookF` (default f+0.01), `lookLat` off centre, `lookH`
    // up (default 1). Ideal for inspecting roadside geometry — verges, barriers,
    // berms — at eye level. e.g. eyeAt(0.116, 0, 2.5) ≈ a driver's-eye look ahead;
    // eyeAt(0.116, 40, 3, 0.116, 0) stands out in the scenery looking back at the
    // track edge.
    function eyeAt(f, lat = 0, h = 2.5, lookF, lookLat = 0, lookH = 1) {
      if (!G.track) return false;
      // `h` is height above the ROAD SURFACE, which on a banked corner is not the
      // centreline plane: at Zandvoort the outer edge stands 2.4 m proud of it.
      // Without the bank term, eyeAt(f, -6.5, 1.2) put the eye a metre UNDER the
      // tarmac and rendered the world from inside the terrain — which reads
      // exactly like the ground covering the track, and is the sort of false
      // alarm this hook exists to rule out. Ride the bank like the in-race
      // cameras do (game.js applies the same banking() dy).
      const sPos = ((f % 1) + 1) % 1 * G.track.total;
      Tracks.sample(G.track, sPos, smp);
      const bk = Tracks.banking(G.track, sPos, lat);
      const eye = [smp.p[0] + smp.r[0] * lat, smp.p[1] + h + (bk ? bk.dy : 0), smp.p[2] + smp.r[2] * lat];
      const lf = lookF == null ? f + 0.01 : lookF;
      const lPos = ((lf % 1) + 1) % 1 * G.track.total;
      Tracks.sample(G.track, lPos, smp2);
      const lbk = Tracks.banking(G.track, lPos, lookLat);
      const tgt = [smp2.p[0] + smp2.r[0] * lookLat, smp2.p[1] + lookH + (lbk ? lbk.dy : 0), smp2.p[2] + smp2.r[2] * lookLat];
      G.dbgCam = { eye, target: tgt, fov: 60, far: 6000 };
      return { eye, target: tgt };
    }
    // Orbit the debug free-cam around a track point at lap-fraction `f`: `az`
    // degrees around (0 = looking from +s/ahead), `el` degrees elevation, `dist` m
    // out, aimed `h` m above the point. Sweep `az` to inspect a spot (a prop, a
    // berm, a suspected gap) from every side without per-shot coord math.
    function orbit(f, az = 35, el = 18, dist = 30, h = 1.5, opts = {}) {
      if (!G.track) return false;
      Tracks.sample(G.track, ((f % 1) + 1) % 1 * G.track.total, smp);
      const cx = smp.p[0], cy = smp.p[1] + h, cz = smp.p[2];
      const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
      // basis: track tangent = "ahead", right = smp.r
      const fwd = [smp.t[0], 0, smp.t[2]], rt = [smp.r[0], 0, smp.r[2]];
      const dir = [Math.cos(a) * fwd[0] + Math.sin(a) * rt[0], 0, Math.cos(a) * fwd[2] + Math.sin(a) * rt[2]];
      const eye = [cx + dir[0] * Math.cos(e) * dist, cy + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
      // Never let a low/negative elevation sink the eye under the ground (which
      // renders the track's underside through the terrain). Floor it just above road.
      eye[1] = Math.max(eye[1], smp.p[1] + 1.2);
      const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
      G.dbgCam = { eye, target: [cx, cy, cz], fov, far: opts.far || 6000, fog: opts.fog };
      return { eye, target: [cx, cy, cz], fov };
    }

    // cinematic(frac, opts) — auto outside-of-corner camera.  Reads the local track
    // curvature to put the camera on the outside of the bend so the car fills the
    // frame naturally.  Straight sections use a three-quarter chase angle.
    //   opts.dist  (default 60)   orbit radius
    //   opts.el    (default 18)   elevation degrees
    //   opts.h     (default 1.5)  look-at height above road
    //   opts.fov   (default 52)   field of view degrees
    //   opts.azOff (default 0)    extra azimuth twist on top of auto angle
    // Returns the same {eye, target, fov, az} object as orbit() plus the curvature k.
    function cinematic(frac, opts = {}) {
      if (!G.track) return false;
      const fr = ((frac % 1) + 1) % 1;
      const k = Tracks.curvature(G.track, fr * G.track.total);
      // +k is a LEFT-hand bend (measured — agentview.js corner-table note), whose
      // outside is the RIGHT side of the road; orbit()'s az>0 is the right side.
      // So az = +sign(k)·mag puts the camera on the outside, shooting across the
      // apex. (This read -sign(k) for as long as the old "+k = right" comment
      // lived: the cinematic cam sat on the INSIDE of every corner.)
      // Strength scales with |k| up to a tight-hairpin cap so the angle doesn't over-rotate.
      const kAbs = Math.min(Math.abs(k), 0.05);
      const baseAz = k === 0 ? 35 : Math.sign(k) * (70 + 40 * kAbs / 0.05);
      const az = baseAz + (opts.azOff || 0);
      const dist = opts.dist != null ? opts.dist : 60;
      const el   = opts.el   != null ? opts.el   : 18;
      const h    = opts.h    != null ? opts.h    : 1.5;
      const fov  = opts.fov  != null ? opts.fov  : 52;
      const res  = orbit(fr, az, el, dist, h, { fov, far: opts.far, fog: opts.fog });
      return res ? Object.assign(res, { az: +az.toFixed(1), k: +k.toFixed(5) }) : false;
    }

    // carOrbit(idx, az, el, dist, h, opts) — orbit the debug free-cam around any
    // car on the grid (0 = player).  `idx` indexes the same array as __apex.cars().
    // az/el/dist/h/opts are identical to orbit() but the basis is the car's own
    // heading rather than the track tangent, so az=0 is always behind the car,
    // az=180 is head-on.  Returns {eye, target, fov, carIdx, speed}.
    // studio(opts?) — summon a studio light rig around the player car for paint /
    // reflection inspection on any track at any time of day. Follows the car.
    //   studio()                         → default 6-lamp ring + overhead key
    //   studio({ n, dist, h, intensity, color: [r,g,b], radius, spin })
    //   studio(false)                    → off (session lamps restored)
    // Pair with carOrbit(0, az, el, 4) to walk around the lit car.
    function studio(arg = true) {
      if (arg === false || arg === 0) {
        if (G._studioRig && G._studioRig._ambStash) {   // restore the session ambient
          G.frame.ambientSky = G._studioRig._ambStash[0];
          G.frame.ambientGround = G._studioRig._ambStash[1];
        }
        G._studioRig = null;
        return false;
      }
      const o = typeof arg === "object" && arg ? arg : {};
      if (G._studioRig && G._studioRig._ambStash) {     // re-config: restore before re-stash
        G.frame.ambientSky = G._studioRig._ambStash[0];
        G.frame.ambientGround = G._studioRig._ambStash[1];
      }
      G._studioRig = {
        n: o.n || 6, dist: o.dist || 7, h: o.h != null ? o.h : 4.5,
        intensity: o.intensity != null ? o.intensity : 1.6,
        color: o.color || [1, 1, 1], radius: o.radius || 18, spin: o.spin || 0,
        fill: o.fill != null ? o.fill : 0.5,
      };
      // FILL: lift the scene ambient toward a neutral studio level while the rig
      // is up — at night the ambient is near-black and an unlit car body reads as
      // a silhouette no matter how many rig lamps hit it. Stashed + restored by
      // studio(false). (setTimeOfDay() while active rebuilds ambient — call
      // studio() again after switching time of day.)
      const f = G._studioRig.fill;
      if (f > 0) {
        G._studioRig._ambStash = [G.frame.ambientSky, G.frame.ambientGround];
        const mixv = (a, b) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        G.frame.ambientSky = mixv(G.frame.ambientSky || [0, 0, 0], [0.30, 0.31, 0.35]);
        G.frame.ambientGround = mixv(G.frame.ambientGround || [0, 0, 0], [0.20, 0.19, 0.18]);
      }
      return G._studioRig;
    }
    function carOrbit(idx = 0, az = 180, el = 14, dist = 25, h = 1.0, opts = {}) {
      // idx 0 (or negative) = THE PLAYER, as documented — cars[] is built in
      // team-list order, so raw index 0 is actually a Mercedes AI; orbiting it
      // while the player parks elsewhere framed the wrong car entirely.
      if (!G.track || !G.cars || !G.cars.length) return false;
      const c = (idx <= 0 || !G.cars[idx]) ? (G.player || G.cars[0]) : G.cars[idx];
      if (!c) return false;
      // World pose when mirrored (player + field); else Frenet (s, x).
      const s = ((c.s % G.track.total) + G.track.total) % G.track.total;
      Tracks.sample(G.track, s, smp);
      const cx = (c.px != null) ? c.px : smp.p[0] + smp.r[0] * (c.x || 0);
      const cz = (c.pz != null) ? c.pz : smp.p[2] + smp.r[2] * (c.x || 0);
      const cyf = smp.p[1] + h;
      // Heading basis: a human car has a real yaw (c.head); AI uses the tangent.
      const hd = (c.human && c.head != null) ? c.head : Math.atan2(smp.t[0], smp.t[2]);
      const fwdX = Math.sin(hd), fwdZ = Math.cos(hd);
      const rtX  = Math.cos(hd), rtZ  = -Math.sin(hd);
      const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
      // az 0 = camera BEHIND the car (eye along -forward), az 180 = head-on,
      // az 90 = off the car's right side — matches the documented convention
      // (the pre-fix implementation had az 0 ahead of the car).
      const dir = [-Math.cos(a) * fwdX + Math.sin(a) * rtX, 0, -Math.cos(a) * fwdZ + Math.sin(a) * rtZ];
      const eye = [cx + dir[0] * Math.cos(e) * dist, cyf + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
      eye[1] = Math.max(eye[1], smp.p[1] + 1.2);   // keep the eye above ground (see orbit)
      const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
      G.dbgCam = { eye, target: [cx, cyf, cz], fov, far: opts.far || 4000, fog: opts.fog };
      return { eye, target: [cx, cyf, cz], fov, carIdx: idx, speed: +(c.speed || 0).toFixed(1) };
    }
    // dolly(f, fwd, right, up, opts) — place the debug free-cam at a track-relative
    // offset from the centreline at fraction f: `fwd` m along the track tangent
    // (negative = behind), `right` m across (+right of travel), `up` m above the road
    // surface. Looks toward opts.lookF (default f+0.015) at opts.lookLat m off centre
    // (default 0) and opts.lookH m up (default 1.5). opts.fov (default 58).
    // Example: dolly(0.22, -25, 18, 4) — 25 m behind Casino entry, 18 m to the right,
    // 4 m up, looking forward toward the corner apex.
    function dolly(f, fwd = 0, right = 0, up = 5, opts = {}) {
      if (!G.track) return false;
      const fr = ((f % 1) + 1) % 1;
      Tracks.sample(G.track, fr * G.track.total, smp);
      const p = smp.p, t = smp.t, r = smp.r;
      const eye = [
        p[0] + t[0] * fwd + r[0] * right,
        p[1] + up,
        p[2] + t[2] * fwd + r[2] * right,
      ];
      const lf = ((((opts.lookF != null ? opts.lookF : f + 0.015) % 1) + 1) % 1);
      Tracks.sample(G.track, lf * G.track.total, smp2);
      const lr = opts.lookLat || 0, lh = opts.lookH != null ? opts.lookH : 1.5;
      const tgt = [smp2.p[0] + smp2.r[0] * lr, smp2.p[1] + lh, smp2.p[2] + smp2.r[2] * lr];
      G.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
      return { eye, target: tgt };
    }

    // roadside(f, side, dist, h, opts) — camera standing beside the track at
    // fraction f, `dist` m from the centreline on `side` (+1 = right of travel,
    // -1 = left), `h` m above the road surface. opts.look controls aim:
    //   "fwd"  (default) — look forward in direction of travel
    //   "back"           — face oncoming traffic
    //   "in"             — look inward across the track
    //   "out"            — look outward into the scenery
    // opts.lookAhead: m ahead (or behind for "back") of the eye position that the
    //   camera aims at along the track (default 30). opts.fov (default 58).
    // Example: roadside(0.33, -1, 6, 2, { look:"in" }) — stand 6 m left of the
    // hairpin entry, 2 m up, looking across at the Armco.
    function roadside(f, side = 1, dist = 10, h = 2.5, opts = {}) {
      if (!G.track) return false;
      const fr = ((f % 1) + 1) % 1;
      Tracks.sample(G.track, fr * G.track.total, smp);
      const p = smp.p, t = smp.t, r = smp.r;
      const eye = [p[0] + r[0] * side * dist, p[1] + h, p[2] + r[2] * side * dist];
      const la = opts.lookAhead != null ? opts.lookAhead : 30;
      const look = opts.look || "fwd";
      let tgt;
      if (look === "in") {
        tgt = [p[0] - r[0] * side * dist * 0.5, p[1] + 1, p[2] - r[2] * side * dist * 0.5];
      } else if (look === "out") {
        tgt = [p[0] + r[0] * side * (dist + 60), p[1] + h * 0.6, p[2] + r[2] * side * (dist + 60)];
      } else {
        const sign = look === "back" ? -1 : 1;
        const lf = ((fr + sign * la / G.track.total % 1) + 1) % 1;
        Tracks.sample(G.track, lf * G.track.total, smp2);
        tgt = [smp2.p[0], smp2.p[1] + 1, smp2.p[2]];
      }
      G.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
      return { eye, target: tgt, look };
    }

    // tourShots(n, opts) — returns n orbit shot descriptors covering the circuit,
    // ready to pass straight to orbit(). Each entry: { frac, az, el, dist, label }.
    // opts.dist (default 80), opts.el (default 20), opts.azOffset (default 35)
    // rotates all azimuths by a fixed angle — useful to swing every shot to one side
    // to face a specific stand or feature.
    // opts.atCorners: true → place the shots ON the detected corner apexes (not even
    //   spacing) and frame each from the OUTSIDE of the bend, so a tour reads like a
    //   broadcast corner-by-corner rather than arbitrary slices. `n` then caps how
    //   many corners (sharpest first, replayed in lap order); omit n for all of them.
    // Example: for (const s of __apex.tourShots(16)) __apex.orbit(s.frac, s.az, s.el, s.dist)
    function tourShots(n = 12, opts = {}) {
      if (!G.track) return [];
      const dist    = opts.dist     != null ? opts.dist     : 80;
      const el      = opts.el       != null ? opts.el       : 20;
      const azOff   = opts.azOffset != null ? opts.azOffset : 35;
      const shots   = [];
      if (opts.atCorners) {
        // Detect apexes (local curvature maxima) and frame each from the outside.
        const tn = G.track.n, total = G.track.total, kv = [];
        for (let k = 0; k < tn; k++) kv.push(Tracks.curvature(G.track, k / tn * total));
        let apex = [];
        for (let k = 0; k < tn; k++) {
          const a = (k - 1 + tn) % tn, b = (k + 1) % tn, ak = Math.abs(kv[k]);
          if (ak > 0.006 && ak >= Math.abs(kv[a]) && ak > Math.abs(kv[b])) apex.push({ k, ak });
        }
        apex.sort((p, q) => q.ak - p.ak);               // sharpest first
        if (n && apex.length > n) apex = apex.slice(0, n);
        apex.sort((p, q) => p.k - q.k);                 // then back into lap order
        apex.forEach((c, i) => {
          const k = kv[c.k];
          // Outside of a LEFT-hander (k>0) is the right side → az>0 (see cinematic()).
          // Auto-angle ignores azOffset (the corner geometry dictates the side).
          const az = Math.sign(k) * (70 + 40 * Math.min(Math.abs(k), 0.05) / 0.05);
          shots.push({ frac: +(c.k / tn).toFixed(4), az: +az.toFixed(1), el, dist, label: `corner-${String(i + 1).padStart(2, "0")}` });
        });
        return shots;
      }
      for (let i = 0; i < n; i++) {
        const frac = i / n;
        // Alternate azimuth side each shot so consecutive frames show the track
        // from opposite sides — avoids monotonous single-angle tours.
        const side  = i % 2 === 0 ? 1 : -1;
        const az    = azOff * side;
        shots.push({ frac: +frac.toFixed(4), az, el, dist, label: `shot-${String(i).padStart(2, "0")}` });
      }
      return shots;
    }

    return { view, eyeAt, orbit, cinematic, studio, carOrbit, dolly, roadside, tourShots };
  }
  return { create };
})();
