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
 * js/car/car-draw.js drawPitCrew asks draw() first.
 *
 * Role gear (gun / jack / tyre) is baked once per team colour into the props
 * cache; tyre carriers (the four prop:none actors) get an overlaid tyre at the
 * hands when they crouch, so the stop reads as a real pit crew without adding
 * a per-frame mesh build. */
const PitCrewAnim = (function () {
  "use strict";
  const NEAR_M = 60;   // past this the static crew mesh (car-draw's 90 m) stands in
  // The stop's steps, on stopAnim's own u boundaries (js/race/pit-lane.js).
  const STEPS = [[0.15, "jack"], [0.27, "off"], [0.68, "swap"], [0.80, "on"], [0.88, "check"], [1.0001, "drop"]];
  const RUBBER = [0.035, 0.035, 0.04], ALLOY = [0.62, 0.63, 0.66];
  const GUN = [0.10, 0.10, 0.11], JACK = [0.72, 0.12, 0.08];
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
  // Resolve GarageCrewDraw at call time so a lone pit-crew.js load (no garage
  // modules) still evaluates and draw() can fall back to the static mesh.
  const acc = () => GarageCrewDraw.acc();
  const place = (...a) => GarageCrewDraw.place(...a);
  const mul = (...a) => GarageCrewDraw.mul(...a);
  // Role props in the team's accent: a wheel gun, jack base/saddle/span, tablet,
  // and a carried tyre. Same keys as GarageCrewChoreo.createProps so draw() can
  // hand them straight to Choreo, plus `tyre` for the carrier overlay.
  function createRoleProps(g, c1, c2) {
    const { block, tube } = GaragePrims;
    let a = acc();
    block(a, 0, 0, 0.02, 0.055, 0.08, 0.12, GUN);
    block(a, 0, 0.055, -0.01, 0.032, 0.012, 0.07, ALLOY);
    block(a, 0, -0.10, -0.03, 0.030, 0.060, 0.035, GUN);
    tube(a, [0, 0, 0.11], [0, 0, 0.32], 0.042, ALLOY, 8);
    tube(a, [0, 0, 0.32], [0, 0, 0.38], 0.026, GUN, 6);
    block(a, 0, 0.075, 0, 0.03, 0.008, 0.06, c2);                       // team flash
    const gun = g.createMesh(a); a = acc();
    block(a, 0, 0, 0, 0.12, 0.08, 0.012, [0.08, 0.08, 0.09]);
    block(a, 0, 0, 0.008, 0.10, 0.065, 0.002, [0.25, 0.45, 0.7]);
    const tablet = g.createMesh(a); a = acc();
    block(a, 0, 0.07, 0, 0.34, 0.05, 0.08, JACK);
    for (const s of [-1, 1]) tube(a, [s * 0.17, 0.07, 0], [s * 0.23, 0.07, 0], 0.07, RUBBER, 10);
    const base = g.createMesh(a); a = acc();
    block(a, 0, 0, 0, 0.20, 0.06, 0.10, JACK);
    const saddle = g.createMesh(a); a = acc();
    tube(a, [0, 0, 0], [0, 1, 0], 0.028, ALLOY, 8);
    const span = g.createMesh(a); a = acc();
    // Carried tyre, face-on toward the hub (half-width along local +z).
    tube(a, [0, 0, -0.17], [0, 0, 0.17], 0.35, RUBBER, 14);
    tube(a, [0, 0, -0.16], [0, 0, 0.16], 0.26, c2, 12);                 // sidewall stripe in team accent
    tube(a, [0, 0, -0.15], [0, 0, 0.15], 0.20, ALLOY, 10);
    const tyre = g.createMesh(a);
    return { gun, tablet, base, saddle, span, tyre, m: new Float32Array(16), w: new Float32Array(16) };
  }
  function freeRoleProps(p, g) {
    if (!p || !g || !g.freeMesh) return 0;
    let n = 0;
    for (const k of ["gun", "tablet", "base", "saddle", "span", "tyre"]) if (p[k]) { g.freeMesh(p[k]); n++; }
    return n;
  }
  function freeRig(o) {
    if (!o) return 0;
    let n = 0;
    if (typeof GarageCrewMotion !== "undefined") n += GarageCrewMotion.free(o.body, gfx);
    n += freeRoleProps(o.props, gfx);
    return n;
  }
  function put(props, g, mesh, x, y, z, yaw, parent, opts) {
    place(props.m, x, y, z, yaw, 0);
    if (parent) mul(props.w, parent, props.m); else props.w.set(props.m);
    g.draw(mesh, props.w, opts);
  }
  /** Overlay a carried tyre on each crouching prop:none actor (the four carriers). */
  function drawCarriers(body, props, g, parent, opts) {
    const out = body && body.choreo;
    if (!out || !props || !props.tyre) return;
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      if (!a || a.prop !== "none" || !(a.crouch > 0.15)) continue;
      const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
      const hx = a.x + s * (a.reach + 0.18), hz = a.z + c * (a.reach + 0.18);
      put(props, g, props.tyre, hx, a.handY, hz, a.yaw, parent, opts);
    }
  }
  function rigFor(c) {
    const team = c.team || {}, c1 = team.color || [0.30, 0.32, 0.36], c2 = team.color2 || [0.85, 0.86, 0.88];
    const key = c1.join(",") + "|" + c2.join(",");
    let r = rigs.get(key);
    if (r) return r;
    if (rigs.size >= 2) {   // a third colour pair: free the old rigs' meshes on this live backend, then forget them
      for (const o of rigs.values()) freeRig(o);
      rigs.clear();
    }
    r = { body: GarageCrewMotion.create(gfx, c1, c2, GarageCrew.helmet), props: createRoleProps(gfx, c1, c2) };
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
    if (G.gfx !== gfx) { gfx = G.gfx; rigs.clear(); }   // the old backend is gone: its meshes went with it
    const t0 = now(), r = rigFor(c);
    GarageCrewChoreo.draw(r.body, r.props, gfx, "pit", p.t, 1, p.t, false, opts, base, anim.lift || 0);
    drawCarriers(r.body, r.props, gfx, base, opts);
    frames++; ms += now() - t0;
    return true;
  }
  /** The A/B switch (perf census, the PR's table): off hands every stop to the static mesh. */
  function setEnabled(v) { if (v != null) on = !!v; return on; }
  /** Frames drawn and their CPU submit ms since the last read (clears). */
  function stats() { const out = { frames, ms }; frames = 0; ms = 0; return out; }
  return Object.freeze({ draw, phase, setEnabled, stats, NEAR_M, STEPS, createRoleProps });
})();
