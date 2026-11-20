"use strict";

const FieldLod = (function () {
  const T = Object.freeze({
    WHEEL_EXTRAS_M: 50,
    FLAPS_M: 80,
    FLAME_M: 60,
    NO_DECAL_M: 120,
    FAR_BODY_M: 250,
    SHADOW_CAST_M: 50,
    MIRROR_CARS: 6,
    LEGACY_FLAPS_M: 150,
  });
  const sq = (m) => m * m;
  let on = true;

  function init(store) {
    let v = 1;
    try { v = store && store.get ? store.get("fieldLod", 1) : 1; } catch (_) { v = 1; }
    on = !(v === 0 || v === "0" || v === false);
    return on;
  }
  function setEnabled(v) { on = !!v; }
  function d2(p, eye, isPlayer) {
    if (isPlayer) return 0;
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2];
    return dx * dx + dy * dy + dz * dz;
  }
  const REF_HALF_TAN = Math.tan(Math.PI / 6);
  function lensK2(fovY) {
    if (!(fovY > 0.01 && fovY < 3.1)) return 1;
    const k = Math.tan(fovY * 0.5) / REF_HALF_TAN;
    return k * k;
  }
  const HYST_OUT = 1.1 * 1.1, HYST_IN = 0.9 * 0.9;
  function crossed(d2, m, beyond, sticky) {
    if (!sticky) return d2 > sq(m);
    return beyond ? d2 >= sq(m) * HYST_IN : d2 > sq(m) * HYST_OUT;
  }
  function tier(dist2, fovY, car) {
    if (!on) return 0;
    const d2 = dist2 * lensK2(fovY);
    const prev = car ? car._lodTier : undefined, sticky = prev === 0 || prev === 1 || prev === 2;
    const t = crossed(d2, T.NO_DECAL_M, prev === 2, sticky) ? 2
      : crossed(d2, T.WHEEL_EXTRAS_M, prev >= 1, sticky) ? 1 : 0;
    if (car) car._lodTier = t;
    return t;
  }
  const _farOf = new WeakMap();
  function farBody(dist2, fovY, car) {
    if (!on) return false;
    const d2 = dist2 * lensK2(fovY), was = car ? _farOf.get(car) === true : false;
    const far = car ? crossed(d2, T.FAR_BODY_M, was, _farOf.has(car)) : d2 > sq(T.FAR_BODY_M);
    if (car) _farOf.set(car, far);
    return far;
  }
  function wheelsLite(dist2, fovY) { return on && dist2 * lensK2(fovY) > sq(T.WHEEL_EXTRAS_M); }
  function flapsM() { return on ? T.FLAPS_M : T.LEGACY_FLAPS_M; }
  function flame(dist2, fovY) { return !on || dist2 * lensK2(fovY) < sq(T.FLAME_M); }
  function castsShadow(dist2, fovY) { return !on || dist2 * lensK2(fovY) < sq(T.SHADOW_CAST_M); }
  function mirrorCap() { return on ? T.MIRROR_CARS : Infinity; }
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
  function parts(dist2, isPlayer) {
    const t = isPlayer ? 0 : tier(dist2), lite = !isPlayer && wheelsLite(dist2);
    const keepFixed = isPlayer || t < 2;
    return {
      tier: t, body: true, cheapBody: !isPlayer && on && t >= 2, decal: t < 2, wheels: true,
      fixedWheels: keepFixed,
      spinDisc: !lite && (isPlayer || dist2 < sq(120)),
      compound: keepFixed && (isPlayer || t > 0 || dist2 < sq(60)),
      flaps: isPlayer || dist2 < sq(flapsM()), flapSet: true,
      flame: isPlayer || flame(dist2),
      castsShadow: isPlayer || castsShadow(dist2),
    };
  }
  return { T, init, setEnabled, get on() { return on; }, d2, lensK2, tier, farBody, wheelsLite, flapsM, flame, castsShadow, mirrorCap, nearest, parts };
})();
Object.freeze(FieldLod);
