// @doc Shared lighting snapshot/proposal validation: profile keys, knob bounds and slider grid; deterministic change receipts.
// @skill lighting-tuner
// Shared author-time validation for lighting snapshots and proposals.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const TODS = new Set(["dawn", "day", "dusk", "night"]);
const WXS = new Set(["dry", "wet", "rain", "fog", "overcast"]);
const TRACKS = new Set(readdirSync(resolve(ROOT, "js/circuits")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)));

export function knobDefs() {
  const ctx = vm.createContext({});
  return new Map(vm.runInContext(readFileSync(resolve(ROOT, "js/lighting/knobs.js"), "utf8") + ";LightKnobs.TUNE_DEFS", ctx, { timeout: 1000 }).map((d) => [d.id, d]));
}

export function badProfileKey(key) {
  if (key === "*") return null;
  const parts = key.split("|");
  if (parts.length === 2 && parts[0] === "*" && TODS.has(parts[1])) return null;
  if (parts.length !== 3 || !(TRACKS.has(parts[0]) || /^custom-[a-f0-9]{8}$/.test(parts[0])) || !TODS.has(parts[1]) || !WXS.has(parts[2])) return `bad key "${key}" (expected track|tod|weather, *, or *|tod)`;
  return null;
}

export function knobError(id, value, defs = knobDefs()) {
  const d = defs.get(id);
  if (!d) return "is not a TUNE_DEFS id";
  if (typeof value !== "number" || !Number.isFinite(value)) return "is not a finite number";
  if (value < d.min || value > d.max) return `outside [${d.min}, ${d.max}]`;
  const ticks = (value - d.min) / d.step;
  if (Math.abs(ticks - Math.round(ticks)) > 1e-7) return `off slider grid (min ${d.min} step ${d.step})`;
  return null;
}

export function validatePresets(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return ["Preset must be an object"];
  const defs = knobDefs(), errors = [];
  for (const [key, vals] of Object.entries(obj)) {
    const bad = badProfileKey(key);
    if (bad) errors.push(bad);
    if (!vals || typeof vals !== "object" || Array.isArray(vals)) { errors.push(`${key}: must be a knob map`); continue; }
    for (const [id, value] of Object.entries(vals)) {
      const err = knobError(id, value, defs);
      if (err) errors.push(`${key}.${id}: ${err}`);
    }
  }
  return errors;
}

export function presetChanges(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return {
    added: keys.filter((k) => !Object.hasOwn(before, k)),
    deleted: keys.filter((k) => !Object.hasOwn(after, k)),
    changed: keys.filter((k) => Object.hasOwn(before, k) && Object.hasOwn(after, k) &&
      JSON.stringify(Object.entries(before[k]).sort()) !== JSON.stringify(Object.entries(after[k]).sort())),
  };
}
