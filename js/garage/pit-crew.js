/* Apex 26 — PitCrewAnim: the garage's crew at the in-race pit stop. When the
 * PLAYER's car is held in its box (PitLane.stopAnim), the Blender "pit" clip
 * (js/garage/crew-choreo.js) plays on the garage's articulated bodies in the
 * team's overalls: two jack men pump the car up, a gunner and a tyre man work
 * each corner — the tyre men's hands ride the wheels out and back in on
 * stopAnim's own slide — and the gunners raise a hand as the car drops.
 *
 * Drawn from the stop's existing service fraction u, never the other way: the
 * clip has no clock of its own, so it cannot move the stop's timing, physics
 * or determinism. An AI car keeps CarMesh.getCrewMesh's single static mesh (one
 * draw instead of ~130), and so does the player when a dependency is missing.
 * js/car/car-draw.js drawPitCrew asks draw() first. */
const PitCrewAnim = (function () {
  "use strict";
  const NEAR_M = 60;   // past this the static crew mesh (car-draw's 90 m) stands in
  // The stop's steps, on stopAnim's own u boundaries (js/race/pit-lane.js).
  const STEPS = [[0.15, "jack"], [0.27, "off"], [0.68, "swap"], [0.80, "on"], [0.88, "check"], [1.0001, "drop"]];
  /** Which step of the stop u (stopAnim(c).u) is in, and the clip time it plays. */
  function phase(anim) {
    const u = anim && Number.isFinite(anim.u) ? anim.u : -1;
    if (u < 0) return { step: "none", t: -1 };
    const len = typeof GarageCrewChoreo !== "undefined" && GarageCrewChoreo.CLIPS.pit ? GarageCrewChoreo.CLIPS.pit.len : 2.2;
    let step = "drop";
    for (const [end, name] of STEPS) if (u < end) { step = name; break; }
    return { step, t: Math.min(1, u) * len };
  }
  let gfx = null, on = true, frames = 0, ms = 0;
  const now = () => { try { return performance.now(); } catch (_) { return 0; } };
  const rigs = new Map();   // team colour → { body, props }
  function rigFor(c) {
    const team = c.team || {}, c1 = team.color || [0.30, 0.32, 0.36], c2 = team.color2 || [0.85, 0.86, 0.88];
    const key = c1.join(",") + "|" + c2.join(",");
    let r = rigs.get(key);
    if (r) return r;
    if (rigs.size >= 2) rigs.clear();   // the old rig's meshes belong to a backend that is gone, or one car's colours
    r = { body: GarageCrewMotion.create(gfx, c1, c2, GarageCrew.helmet), props: GarageCrewChoreo.createProps(gfx, c2) };
    rigs.set(key, r);
    return r;
  }
  /** Draw the animated crew round car c in its grounded basis `base`; false
   *  leaves the stop to the static crew mesh. */
  function draw(G, c, base, opts) {
    if (!on || !c || !c.isPlayer || c.pitState !== "box" || !G || !G.gfx || !G.pits || !G.pits.stopAnim) return false;
    if (typeof GarageCrewChoreo === "undefined" || !GarageCrewChoreo.has("pit") || typeof GarageCrewMotion === "undefined" || typeof GarageCrew === "undefined" || !GarageCrew.helmet) return false;
    const eye = G.camEye;
    if (eye) {
      const dx = base[12] - eye[0], dy = base[13] - eye[1], dz = base[14] - eye[2];
      if (dx * dx + dy * dy + dz * dz > NEAR_M * NEAR_M) return false;
    }
    const anim = G.pits.stopAnim(c), p = phase(anim);
    if (p.t < 0) return false;
    if (G.gfx !== gfx) { gfx = G.gfx; rigs.clear(); }
    const t0 = now(), r = rigFor(c);
    GarageCrewChoreo.draw(r.body, r.props, gfx, "pit", p.t, 1, p.t, false, opts, base, anim.lift || 0);
    frames++; ms += now() - t0;
    return true;
  }
  /** The A/B switch (perf census, the PR's table): off hands every stop to the static mesh. */
  function setEnabled(v) { if (v != null) on = !!v; return on; }
  /** Frames drawn and their CPU submit ms since the last read (clears). */
  function stats() { const out = { frames, ms }; frames = 0; ms = 0; return out; }
  return Object.freeze({ draw, phase, setEnabled, stats, NEAR_M, STEPS });
})();
