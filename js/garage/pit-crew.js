const PitCrewAnim = (function () {
  "use strict";
  const NEAR_M = 60;
  const STEPS = [[0.15, "jack"], [0.27, "off"], [0.68, "swap"], [0.80, "on"], [0.88, "check"], [1.0001, "drop"]];
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
  const rigs = new Map();
  function rigFor(c) {
    const team = c.team || {}, c1 = team.color || [0.30, 0.32, 0.36], c2 = team.color2 || [0.85, 0.86, 0.88];
    const key = c1.join(",") + "|" + c2.join(",");
    let r = rigs.get(key);
    if (r) return r;
    if (rigs.size >= 2) {
      for (const o of rigs.values()) { GarageCrewMotion.free(o.body, gfx); GarageCrewChoreo.freeProps(o.props, gfx); }
      rigs.clear();
    }
    r = { body: GarageCrewMotion.create(gfx, c1, c2, GarageCrew.helmet), props: GarageCrewChoreo.createProps(gfx, c2) };
    rigs.set(key, r);
    return r;
  }
  const ready = () => typeof GarageCrewChoreo !== "undefined" && GarageCrewChoreo.has("pit") && typeof GarageCrewMotion !== "undefined" && typeof GarageCrew !== "undefined" && !!GarageCrew.helmet;
  function warm(G, c) {
    if (!on || !c || !c.isPlayer || !G || !G.gfx || !ready()) return false;
    if (G.gfx !== gfx) { gfx = G.gfx; rigs.clear(); }
    rigFor(c);
    return true;
  }
  function draw(G, c, base, opts) {
    if (!on || !c || !c.isPlayer || c.pitState !== "box" || !G || !G.gfx || !G.pits || !G.pits.stopAnim) return false;
    if (!ready()) return false;
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
  function setEnabled(v) { if (v != null) on = !!v; return on; }
  function stats() { const out = { frames, ms }; frames = 0; ms = 0; return out; }
  return Object.freeze({ draw, warm, phase, setEnabled, stats, NEAR_M, STEPS });
})();
