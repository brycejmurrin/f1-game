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

  /** The shot for a cut: from the kind's list when it has one, never the shot on air. */
  function shotFor(kind, onAir, n) {
    const pool = (EVENT_SHOTS[kind] || SHOTS).filter((s) => s !== onAir);
    return pool.length ? pool[(n | 0) % pool.length] : onAir;
  }

  return { battles, shotFor, SHOTS, SHOT_MIN_S, SHOT_MAX_S };
})();
Object.freeze(Broadcast);
