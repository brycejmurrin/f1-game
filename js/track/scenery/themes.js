/* Apex 26 — deterministic scenery theme registry.
   Pure IIFE global; loaded before later scenery systems. */
const SceneryThemes = (function () {
  "use strict";

  const BASE = {
    name: "neutral",
    palette: {
      shell: [0.58, 0.60, 0.64],
      roof: [0.18, 0.20, 0.24],
      glass: [0.28, 0.42, 0.58],
      window: [0.92, 0.84, 0.62],
      accent: [0.82, 0.12, 0.16],
      service: [0.72, 0.74, 0.78],
    },
    variants: { roof: ["flat"], facade: ["glazed"], tower: ["lattice"] },
    spacing: { furniture: 80, service: 180 },
    budgets: { hero: 50000, facility: 25000, repeated: 10000 },
  };

  const THEMES = {
    permanent: {
      palette: { shell: [0.72, 0.73, 0.75], roof: [0.34, 0.36, 0.40],
                 glass: [0.28, 0.38, 0.50], accent: [0.86, 0.30, 0.20] },
      spacing: { furniture: 150, service: 260 },
      variants: { roof: ["flat", "sawtooth"], tower: ["lattice", "stepped"] },
    },
    street: {
      palette: { shell: [0.45, 0.47, 0.52], glass: [0.20, 0.34, 0.52] },
      variants: { roof: ["flat", "cantilever"], facade: ["glazed", "led"] },
    },
    desert: {
      palette: { shell: [0.68, 0.58, 0.44], accent: [0.96, 0.68, 0.16] },
      spacing: { furniture: 120, service: 220 },
      variants: { roof: ["flat"], tower: ["tapered", "drum"] },
    },
    park: {
      palette: { shell: [0.68, 0.68, 0.64], roof: [0.20, 0.28, 0.22] },
      spacing: { furniture: 140, service: 240 },
      variants: { roof: ["sawtooth", "flat"], tower: ["lattice", "stepped"] },
    },
    "night-event": {
      palette: { shell: [0.30, 0.32, 0.38], window: [0.70, 0.86, 1.00] },
      variants: { facade: ["glazed", "led"], tower: ["lattice", "tapered"] },
    },
  };

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isPlainObject(value)) return value;
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }

  function merge(base, extra) {
    const out = clone(base);
    if (!isPlainObject(extra)) return out;
    for (const key of Object.keys(extra)) {
      const left = out[key];
      const right = extra[key];
      out[key] = isPlainObject(left) && isPlainObject(right) ? merge(left, right) : clone(right);
    }
    return out;
  }

  function resolve(name, overrides, context) {
    Log.info("track", "theme resolve " + (name || "neutral"));
    const theme = THEMES[name] || {};
    const result = merge(merge(BASE, theme), overrides || {});
    result.name = THEMES[name] ? name : "neutral";
    if (context && context.night && result.palette && Array.isArray(result.palette.window)) {
      result.palette.window = result.palette.window.map((v) => Math.min(2, v * 1.15));
    }
    return result;
  }

  function variant(trackId, modelId, index, choices) {
    if (!Array.isArray(choices) || !choices.length) return null;
    const text = `${trackId}|${modelId}|${Number(index) || 0}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return choices[(hash >>> 0) % choices.length];
  }

  return { resolve, variant };
})();
