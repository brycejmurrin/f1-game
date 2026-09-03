/* Apex 26 — the SETUP SHEET: the car's mechanical set-up — anti-roll bars, ride height / rake, brake bias — per team, persisted, folded into the parts contract (Parts.getMods / aeroLoad take an optional tune) and the friction ellipse (brake bias). A pure global like Parts: no create(G). */
"use strict";

const SetupTune = (function () {
  const { store } = GameStore;
  const KEY = "setup.";   // + teamId; store adds the apex26. prefix

  // RANGES. Anti-roll bars are 1–11 steps (the racing-game convention — real
  // teams run discrete bar sets in N·m/deg that are confidential). Ride
  // heights are static millimetres for the 2022+ ground-effect cars: front
  // ~15–35 mm, rear ~40–80 mm, rake (rear − front) ~25–45 mm — approximate;
  // the plank is 10 mm with 1 mm of wear allowed (FIA TR). Brake bias is the
  // wheel's BB readout in % front: 50.0–62.0, real cars run ~52–60 and trim
  // it ~0.5–1 % per corner.
  const RANGE = {
    arbF: { min: 1, max: 11, step: 1, label: "FRONT ANTI-ROLL BAR", unit: "" },
    arbR: { min: 1, max: 11, step: 1, label: "REAR ANTI-ROLL BAR", unit: "" },
    rideF: { min: 15, max: 35, step: 1, label: "FRONT RIDE HEIGHT", unit: " mm" },
    rideR: { min: 40, max: 80, step: 1, label: "REAR RIDE HEIGHT", unit: " mm" },
    brakeBias: { min: 50, max: 62, step: 0.5, label: "BRAKE BIAS", unit: " % F" },
  };
  const FIELDS = Object.keys(RANGE);
  // Works baselines. The untouched car is EXACTLY the car it always was: every
  // multiplier below is 1 at the team's own default, whatever that default is.
  const BASE = { arbF: 6, arbR: 6, rideF: 25, rideR: 60, brakeBias: 56 };
  const DEFAULTS = {
    redbull: { arbF: 8, arbR: 6, rideF: 22, rideR: 62 },
    mclaren: { arbF: 6, arbR: 7, rideF: 24, rideR: 58 },
    ferrari: { arbF: 7, arbR: 6, rideF: 23, rideR: 60 },
    mercedes: { arbF: 7, arbR: 7, rideF: 24, rideR: 60 },
    williams: { arbF: 5, arbR: 5, rideF: 26, rideR: 62 },
    haas: { arbF: 6, arbR: 5, rideF: 27, rideR: 64 },
  };
  const BB_REF = PhysicsConsts.BB_REF;   // 0.56 — where the ellipse split is exactly 1/1

  function defaults(teamId) { return Object.assign({}, BASE, DEFAULTS[teamId] || {}); }
  function clampField(k, v) {
    const r = RANGE[k];
    // typeof, not Number(): a damaged field must fall back to the WORKS value,
    // and Number(null) / Number("") / Number(false) are all 0 — which would
    // silently clamp to the bottom of the range instead. A numeric STRING is
    // accepted because that is what an <input type=range> hands back.
    const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
    if (!Number.isFinite(n)) return null;
    const q = Math.round((n - r.min) / r.step) * r.step + r.min;
    return Math.min(r.max, Math.max(r.min, +q.toFixed(3)));
  }
  // The stored sheet, normalised on read (a damaged field falls to the default).
  function get(teamId) {
    const d = defaults(teamId);
    const raw = store.get(KEY + teamId, null);
    const out = Object.assign({}, d);
    if (raw && typeof raw === "object") for (const k of FIELDS) {
      const v = clampField(k, raw[k]);
      if (v != null) out[k] = v;
    }
    return out;
  }
  function set(teamId, patch) {
    const cur = get(teamId);
    for (const k of FIELDS) if (patch && patch[k] !== undefined) { const v = clampField(k, patch[k]); if (v != null) cur[k] = v; }
    store.set(KEY + teamId, cur);
    return cur;
  }
  function reset(teamId) { store.set(KEY + teamId, null); return get(teamId); }
  function isDefault(teamId) { const d = defaults(teamId), t = get(teamId); return FIELDS.every((k) => t[k] === d[k]); }

  // ANTI-ROLL BARS → the four-channel contract. Deltas are counted from the
  // team's own default so an untouched car is exactly 1.0. Stiffer overall
  // (total): sharper turn-in (cornering up) at the cost of traction (accel
  // down); stiffer FRONT than rear (split): more stable under braking, less
  // traction. The contract has no front/rear balance axis, so bar balance
  // cannot move understeer here — brake bias (below) is the seam that can.
  function mods(teamId) {
    const t = get(teamId), d = defaults(teamId);
    const total = ((t.arbF - d.arbF) + (t.arbR - d.arbR)) / 2;
    const split = (t.arbF - t.arbR) - (d.arbF - d.arbR);
    const cl = (v) => Math.min(1.05, Math.max(0.95, v));
    return {
      speed: 1,
      accel: cl((1 - 0.003 * total) * (1 - 0.004 * split)),
      cornering: cl(1 + 0.006 * total),
      braking: cl(1 + 0.004 * split),
    };
  }
  // RIDE HEIGHT / RAKE → the aero-load channel: rake in [-1, 1] from the
  // team's default over the half-range. Parts.aeroLoad adds RH_GAIN·rake to
  // the normalised load and clamps — the untouched car and every AI car are
  // unchanged (their tune is absent), which keeps docs/PHYSICS.md's measured
  // aero table true. The cost: a max-wing car gains nothing from more rake
  // (already at 1), stated on the sheet.
  function rake(teamId) {
    const t = get(teamId), d = defaults(teamId);
    const half = (RANGE.rideR.max - RANGE.rideR.min + RANGE.rideF.max - RANGE.rideF.min) / 2;
    return Math.max(-1, Math.min(1, ((t.rideR - t.rideF) - (d.rideR - d.rideF)) / half));
  }
  function aero(teamId) { return { rake: rake(teamId) }; }
  // BRAKE BIAS → the friction ellipse's per-axle split (game.js muF/muR).
  function brakeBias(teamId) { return get(teamId).brakeBias / 100; }
  function bbScales(bb) {
    const b = Number.isFinite(bb) ? bb : BB_REF;
    const cl = (v) => Math.min(1.5, Math.max(0.6, v));
    return { f: cl(b / BB_REF), r: cl((1 - b) / (1 - BB_REF)) };
  }

  return { RANGE, FIELDS, BASE, DEFAULTS, BB_REF, defaults, get, set, reset, isDefault, mods, rake, aero, brakeBias, bbScales, clampField };
})();
