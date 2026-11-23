/**
 * @doc Authored impact-map pins for change-aware spec selection and the generated test index.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PIN_DIR = "tests/data/impact-map.d";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isBrowserPin = (spec) => spec.startsWith("tests/specs/");

/** Read the source fragments in deterministic order. A broken fragment must not shrink coverage. */
export function readImpactPins(root = ROOT) {
  const dir = path.join(root, PIN_DIR);
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => {
    const filename = path.join(dir, name);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(filename, "utf8")); }
    catch (cause) { throw new Error(`cannot read impact pins: ${filename}`, { cause }); }
    const pins = raw?.pins ?? raw;
    if (!isObject(pins) || Object.values(pins).some((row) => !isObject(row) ||
      Object.values(row).some((specs) => !Array.isArray(specs) || specs.some((spec) => typeof spec !== "string")))) {
      throw new Error(`invalid impact pins: ${filename}`);
    }
    for (const [file, row] of Object.entries(pins)) {
      for (const spec of row.narrow ?? []) {
        if (isBrowserPin(spec) && (!/\.spec\.js$/.test(spec) || !fs.existsSync(path.join(root, spec)))) {
          throw new Error(`impact pin in ${filename} for ${file} names a missing or invalid browser spec: ${spec}`);
        }
      }
    }
    return pins;
  });
}

/** Browser specs explicitly assigned to a changed source. The generated report is never a selection input. */
export function specsAffectedByImpact(changed, root = ROOT, fragments = readImpactPins(root)) {
  const hit = new Set();
  for (const pins of fragments) {
    for (const file of changed) {
      for (const spec of pins[file]?.narrow ?? []) {
        if (isBrowserPin(spec)) hit.add(spec);
      }
    }
  }
  return [...hit].sort();
}
