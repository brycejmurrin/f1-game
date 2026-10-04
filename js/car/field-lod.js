/* Apex 26 — FieldLod: distance level-of-detail for the RIVAL cars, draw-side
   only (nothing here reads or writes physics). One frozen threshold table and
   the pure selectors the shared per-car loop (js/game.js render), the planted
   wheels (js/car/car-draw.js), the shadow caster pool
   (js/render/shared/shadow-pass.js) and the rear-view mirror
   (js/render/shared/mirror-pass.js) consult, so GLX, TLX and WGX take the same
   cuts. The player's own car (c.isPlayer: also the replay hero, followCar) is
   never reduced; the garage / studio previews never reach the per-car loop.
   Why: a bunched field at the start issued ~20-30 pooled draws per rival
   (body, decal, 8 wheel layers, stripes, spin discs, rings, flaps, lights,
   flame) plus a full ~22k-vert sun caster each, and the mirror redrew every
   rival within 260 m — ~500 extra TLX objects a frame while the cars are in view.
   A/B: localStorage apex26.fieldLod = 0 restores the previous behaviour
   exactly (read once at boot, CarDraw.create -> init(store)). */
"use strict";

const FieldLod = (function () {
  const T = Object.freeze({
    WHEEL_EXTRAS_M: 50,   // beyond: the 4 rotating wheels only (no fixed layers, spin discs, compound stripes)
    FLAPS_M: 80,          // MOVING active-aero flaps within (was 150); beyond, one static set (never none)
    FLAME_M: 60,          // throttle-lift exhaust flame within (was ungated)
    NO_DECAL_M: 120,      // beyond: no livery decal (body + the 4 rotating wheels). Not a whole-car
                          // mesh: pre-building one per rival cost ~5 s of CPU at track build (game-vm)
    SHADOW_CAST_M: 50,    // sun / lamp shadow-map caster within (blob shadow unchanged)
    MIRROR_CARS: 6,       // nearest rivals the rear-view mirror / PiP redraws
    LEGACY_FLAPS_M: 150,  // the off-switch's flap gate
  });
  const sq = (m) => m * m;
  let on = true;

  // Off when the stored value is 0 / "0" / false; anything else (unset) is on.
  function init(store) {
    let v = 1;
    try { v = store && store.get ? store.get("fieldLod", 1) : 1; } catch (_) { v = 1; }
    on = !(v === 0 || v === "0" || v === false);
    return on;
  }
  function setEnabled(v) { on = !!v; }
  // Camera distance² of a car at world `p` from `eye`; the player is always 0.
  function d2(p, eye, isPlayer) {
    if (isPlayer) return 0;
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2];
    return dx * dx + dy * dy + dz * dz;
  }
  // 0 full detail, 1 lite wheels (beyond WHEEL_EXTRAS_M), 2 lite wheels and no decal (beyond NO_DECAL_M).
  function tier(dist2) {
    if (!on) return 0;
    return dist2 > sq(T.NO_DECAL_M) ? 2 : dist2 > sq(T.WHEEL_EXTRAS_M) ? 1 : 0;
  }
  function wheelsLite(dist2) { return on && dist2 > sq(T.WHEEL_EXTRAS_M); }
  function flapsM() { return on ? T.FLAPS_M : T.LEGACY_FLAPS_M; }
  function flame(dist2) { return !on || dist2 < sq(T.FLAME_M); }
  function castsShadow(dist2) { return !on || dist2 < sq(T.SHADOW_CAST_M); }
  function mirrorCap() { return on ? T.MIRROR_CARS : Infinity; }
  // Keep the `cap` smallest of dist2s[0..n): writes keep[i] = 1/0 and returns
  // how many are kept. `force` (an index, or -1) is always kept first — the
  // PiP's subject. Allocation-free; n is the field (<= 22), cap 6.
  function nearest(dist2s, n, cap, keep, force) {
    for (let i = 0; i < n; i++) keep[i] = 0;
    let kept = 0;
    if (force >= 0 && force < n) { keep[force] = 1; kept = 1; }
    while (kept < cap && kept < n) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!keep[i] && dist2s[i] < bd) { bd = dist2s[i]; best = i; }
      if (best < 0) break;
      keep[best] = 1; kept++;
    }
    return kept;
  }
  // What a rival at dist2 draws — the table above as one record (tests, __apex).
  function parts(dist2, isPlayer) {
    const t = isPlayer ? 0 : tier(dist2), lite = !isPlayer && wheelsLite(dist2);
    return {
      tier: t, body: true, decal: t < 2, wheels: true,
      fixedWheels: !lite, spinDisc: !lite && (isPlayer || dist2 < sq(120)),
      compound: !lite && (isPlayer || dist2 < sq(60)),
      flaps: isPlayer || dist2 < sq(flapsM()), flapSet: true,   // flaps: can MOVE; the set: always drawn
      flame: isPlayer || flame(dist2),
      castsShadow: isPlayer || castsShadow(dist2),
    };
  }
  return { T, init, setEnabled, get on() { return on; }, d2, tier, wheelsLite, flapsM, flame, castsShadow, mirrorCap, nearest, parts };
})();
Object.freeze(FieldLod);
