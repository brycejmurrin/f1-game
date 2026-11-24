/* Apex 26 — Broadcast camera policy shared by the live director, Rival Lock,
   the stream overlay and the Data Hub replay. The replay UI loads separately. */
const Broadcast = (function () {
  "use strict";

  const SHOT_MIN_S = 5;      // wall seconds: no cut sooner than this after the last
  const SHOT_MAX_S = 14;     // wall seconds: a quiet shot is changed after this
  const BATTLE_S = 1.0;      // two cars this close (seconds) are a battle
  const SHOTS = ["side", "heli", "tcam", "chase", "cinematic", "low"];
  const EVENT_SHOTS = { pass: ["side", "heli", "chase"], pit: ["heli", "side"], out: ["heli", "side"], fastest: ["tcam", "chase", "side"],
    battle: ["heli", "chase", "side"], recover: ["chase", "heli"], sc: ["heli", "side"], ending: ["heli", "side"], green: ["heli", "chase"] };

  // Pooled fight rows: Director + ExtraRigs + WATCH PiP call battles() every
  // cut/tick; a fresh array + objects each time was steady-state GC in a race.
  const _fights = [];
  /** The closest battle among running cars ordered by progress: [{chaser, gapS}] best first — tighter and
   *  further up the order is better. cars: [{key, prog, speed, pos}] sorted by prog descending.
   *  Returns a module-owned pooled array (mutated on the next call). vScale: vTop()/VMAX when the speeds are the
   *  SIM's (PACE-scaled), so the 20 m/s crawl floor is the same fraction of the envelope at any OVERALL SPEED;
   *  omit it for real m/s (WATCH's traces run at the real car's pace whatever PACE is). */
  function battles(cars, vScale) {
    let n = 0;
    const floor = 20 * (vScale > 0 ? vScale : 1);
    for (let i = 1; i < cars.length; i++) {
      const a = cars[i - 1], b = cars[i];
      const v = Math.max(b.speed || 0, floor);
      const g = (a.prog - b.prog) / v;
      if (g < 0 || g >= BATTLE_S) continue;
      let f = _fights[n];
      if (!f) { f = { key: null, ahead: null, gapS: 0, score: 0 }; _fights[n] = f; }
      f.key = b.key; f.ahead = a.key; f.gapS = g; f.score = g + i * 0.08;
      n++;
    }
    _fights.length = n;
    _fights.sort((x, y) => x.score - y.score);
    return _fights;
  }

  /** Walk a stable pool: indexing a filtered pool with cuts can alternate two
   * shots forever. Inspect each candidate at most once, only when a cut is due. */
  function shotFor(kind, onAir, n, accept, shots) {
    const pool = shots || EVENT_SHOTS[kind] || SHOTS;
    const at = pool.indexOf(onAir);
    const start = at >= 0 ? at + 1 : Math.abs(n | 0);
    for (let i = 0; i < pool.length; i++) {
      const shot = pool[(start + i) % pool.length];
      if (!accept || accept(shot)) return shot;
    }
    return "chase";   // nearby road-following coverage when all authored angles are blocked
  }

  /** Cut-time geometry only; no DOM reads, per-frame rays or simulation writes.
   * The subject is explicit: WATCH has not transferred follow ownership yet. */
  function chooseShot(G, car, kind, onAir, n, shots, now = typeof performance !== "undefined" ? performance.now() : 0, watch = false) {
    if (!car || !G.track || !G.camVantage || typeof FlybySight === "undefined") return shotFor(kind, onAir, n, null, shots);
    const pose = G.camPoseOf ? G.camPoseOf(car) : null;
    const s = pose ? pose.s : car.s || 0, x = pose ? pose.x : car.x || 0;
    const cp = pose?.carPos || (car.px != null && car.pz != null ? [car.px, car.pz] : null);
    const extra = { att: car, carPos: cp, carHead: pose?.carHead ?? car.head,
      noLook: true, frameSubject: true, dt: 0, snap: true };
    if (typeof Tracks !== "undefined" && Tracks.banking) extra.bankDy = Tracks.banking(G.track, s, x, { dy: 0, roll: 0 }, true)?.dy || 0;
    const sample = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
    if (typeof Tracks !== "undefined" && Tracks.sample) Tracks.sample(G.track, s, sample);
    const bodyY = sample.p[1] + (extra.bankDy || 0) + 0.8;
    const viewportAspect = typeof window !== "undefined" && window.innerWidth > 0 && window.innerHeight > 0
      ? window.innerWidth / window.innerHeight : 16 / 9;
    const rendererAspect = watch ? G.gfx?.aspect : null;
    const aspect = rendererAspect > 0 && Number.isFinite(rendererAspect) ? rendererAspect : viewportAspect;
    const accept = shot => {
      const solve = () => G.camVantage(shot, s, x, car.speed || 0, now, extra);
      // Probe springs must never overwrite the player's or the on-air rig's history.
      const v = typeof CamFeel !== "undefined" && CamFeel.scoped ? CamFeel.scoped("broadcast-probe:", solve) : solve();
      if (!v?.eye || !v.tgt || !v.eye.every(Number.isFinite) || !v.tgt.every(Number.isFinite) || !Number.isFinite(v.fov)) return false;
      // Onboard intentionally looks ahead, not back at the subject's body.
      const point = shot === "tcam" || !cp ? v.tgt : [cp[0], bodyY, cp[1]];
      const distance = Math.hypot(point[0] - v.eye[0], point[1] - v.eye[1], point[2] - v.eye[2]);
      if (!(distance > 0.9 && distance < 250)) return false;
      if (shot !== "tcam") {
        // WATCH uses the fitted race lens, while the live broadcast supplies
        // its authored lens through a debug camera.
        const fov = watch && typeof CamFovFit !== "undefined"
          ? CamFovFit.fitFovY(v.fov * Math.PI / 180, aspect, { boost: (v.fovBoost || 0) * Math.PI / 180 }) * 180 / Math.PI
          : v.fov;
        const p = FlybySight.project(FlybySight.camera(v.eye, v.tgt, fov, aspect), point);
        // Keep the subject in the central window, away from tower and transport.
        if (!p || Math.abs(p.x) > 0.55 || Math.abs(p.y) > 0.55) return false;
      }
      return FlybySight.transmit(G.track, v.eye, point).Tdrawn >= 0.65;
    };
    return shotFor(kind, onAir, n, accept, shots);
  }
  function chooseWatchShot(G, car, kind, onAir, n) {
    return chooseShot(G, car, kind, onAir, n, undefined, undefined, true);
  }

  return { battles, shotFor, chooseShot, chooseWatchShot, SHOTS, SHOT_MIN_S, SHOT_MAX_S };
})();
Object.freeze(Broadcast);
