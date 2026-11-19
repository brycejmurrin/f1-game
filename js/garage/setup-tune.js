"use strict";

const SetupTune = (function () {
  const { store } = GameStore;
  const KEY = "setup.";
  const CAREER_KEY = "careerSetup.";
  function careerScope(teamId) {
    if (typeof Career === "undefined" || !Career.inCareer || !Career.inCareer()) return null;
    const c = Career.data(), s = Career.slot ? Career.slot() : null;
    if (!c || !s || c.team !== teamId) return null;
    return { key: CAREER_KEY + s.flavour + "." + (s.i | 0) + "." + teamId, seed: c.seed };
  }
  function keyFor(teamId) { const s = careerScope(teamId); return s ? s.key : KEY + teamId; }
  function stamp(teamId, tune) {
    const s = careerScope(teamId);
    return s && tune && typeof tune === "object" ? Object.assign({}, tune, { seed: s.seed }) : tune;
  }
  function stored(teamId) {
    const s = careerScope(teamId);
    if (!s) return store.get(KEY + teamId, null);
    const raw = store.get(s.key, null);
    return raw && typeof raw === "object" && raw.seed === s.seed ? raw : null;
  }

  const RANGE = {
    arbF: { min: 1, max: 11, step: 1, label: "FRONT ANTI-ROLL BAR", unit: "" },
    arbR: { min: 1, max: 11, step: 1, label: "REAR ANTI-ROLL BAR", unit: "" },
    rideF: { min: 15, max: 35, step: 1, label: "FRONT RIDE HEIGHT", unit: " mm" },
    rideR: { min: 40, max: 80, step: 1, label: "REAR RIDE HEIGHT", unit: " mm" },
    brakeBias: { min: 50, max: 62, step: 0.5, label: "BRAKE BIAS", unit: " % F" },
  };
  const FIELDS = Object.keys(RANGE);
  const BASE = { arbF: 6, arbR: 6, rideF: 25, rideR: 60, brakeBias: 56 };
  const DEFAULTS = {
    redbull: { arbF: 8, arbR: 6, rideF: 22, rideR: 62 },
    mclaren: { arbF: 6, arbR: 7, rideF: 24, rideR: 58 },
    ferrari: { arbF: 7, arbR: 6, rideF: 23, rideR: 60 },
    mercedes: { arbF: 7, arbR: 7, rideF: 24, rideR: 60 },
    williams: { arbF: 5, arbR: 5, rideF: 26, rideR: 62 },
    haas: { arbF: 6, arbR: 5, rideF: 27, rideR: 64 },
  };
  const BB_REF = PhysicsConsts.BB_REF;

  function shipped(teamId) {
    if (typeof GarageDefaults === "undefined" || !GarageDefaults.has(KEY + teamId)) return null;
    const raw = GarageDefaults.get(KEY + teamId);
    if (!raw || typeof raw !== "object") return null;
    const o = {};
    for (const k of FIELDS) { const v = clampField(k, raw[k]); if (v != null) o[k] = v; }
    return o;
  }
  function defaults(teamId) { return Object.assign({}, BASE, DEFAULTS[teamId] || {}, shipped(teamId) || {}); }
  function clampField(k, v) {
    const r = RANGE[k];
    const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
    if (!Number.isFinite(n)) return null;
    const q = Math.round((n - r.min) / r.step) * r.step + r.min;
    return Math.min(r.max, Math.max(r.min, +q.toFixed(3)));
  }
  function get(teamId) {
    const d = defaults(teamId);
    const raw = stored(teamId);
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
    store.set(keyFor(teamId), stamp(teamId, cur));
    return cur;
  }
  function reset(teamId) { store.set(keyFor(teamId), undefined); return get(teamId); }
  function isDefault(teamId) {
    const d = defaults(teamId);
    const t = get(teamId);
    return FIELDS.every((k) => t[k] === d[k]);
  }

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
  function balance(teamId) {
    const t = get(teamId), d = defaults(teamId);
    return Math.max(-0.3, Math.min(0.3, ((t.arbF - t.arbR) - (d.arbF - d.arbR)) * 0.025));
  }
  const axleOut = { f: 1, r: 1 };
  function axleGrip(bias, lateralAccel, frontLoad = 0.47) {
    axleOut.f = 1; axleOut.r = 1;
    if (!Number.isFinite(bias) || !bias || !Number.isFinite(lateralAccel)) return axleOut;
    const demand = Math.min(1, Math.abs(lateralAccel) / PhysicsConsts.LAT_MAX);
    const share = Math.max(0.2, Math.min(0.8, frontLoad + bias));
    const transfer = demand * 0.28;
    function capacity(load, shift) {
      const half = load * 0.5, d = Math.min(half * 0.95, shift);
      return Math.pow(half + d, 0.85) + Math.pow(half - d, 0.85);
    }
    axleOut.f = capacity(frontLoad, transfer * share) / capacity(frontLoad, transfer * frontLoad);
    axleOut.r = capacity(1 - frontLoad, transfer * (1 - share)) / capacity(1 - frontLoad, transfer * (1 - frontLoad));
    return axleOut;
  }
  function rake(teamId) {
    const t = get(teamId), d = defaults(teamId);
    const half = (RANGE.rideR.max - RANGE.rideR.min + RANGE.rideF.max - RANGE.rideF.min) / 2;
    return Math.max(-1, Math.min(1, ((t.rideR - t.rideF) - (d.rideR - d.rideF)) / half));
  }
  function aero(teamId) { return { rake: rake(teamId) }; }
  function experiment(symptom, tune) {
    const changes = symptom === "wide" ? { arbF: -1 }
      : symptom === "traction" ? { arbF: -1, arbR: -1 }
      : symptom === "entry" ? { brakeBias: 0.5 } : null;
    if (!changes) return null;
    const patch = {};
    for (const k of Object.keys(changes)) {
      const value = tune[k] + changes[k];
      if (!Number.isFinite(value) || value < RANGE[k].min || value > RANGE[k].max) return null;
      patch[k] = clampField(k, value);
    }
    return patch;
  }

  function brakeBias(teamId) { return get(teamId).brakeBias / 100; }
  function bbScales(bb) {
    const b = Number.isFinite(bb) ? bb : BB_REF;
    const cl = (v) => Math.min(1.5, Math.max(0.6, v));
    return { f: cl(b / BB_REF), r: cl((1 - b) / (1 - BB_REF)) };
  }

  return { RANGE, FIELDS, BB_REF, keyFor, stamp, defaults, get, set, reset, isDefault, mods, rake, aero, brakeBias, bbScales, clampField, balance, axleGrip, experiment };
})();
Object.freeze(SetupTune);
