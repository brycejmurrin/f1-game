import fs from "node:fs";
const frozen = JSON.parse(fs.readFileSync(new URL("./p75-3160.json", import.meta.url), "utf8"));
// Preserve the #3160 size ceiling even when the currently shipped population grows.
export function lowerEnvelope(current) {
  return Object.fromEntries(Object.entries(current).map(([key, value]) => {
    if (!Number.isFinite(value) || !Number.isFinite(frozen[key])) throw new Error(`Missing envelope dimension: ${key}`);
    return [key, Math.min(value, frozen[key])];
  }));
}
export { frozen };
