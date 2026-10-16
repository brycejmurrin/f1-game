// @ts-check
/**
 * The circuit list for the per-circuit MANUAL suites, read off disk.
 *
 * These suites used to be 80 three-line stub files — one per circuit, per
 * suite — whose only job was to name a circuit. Nothing kept that list in step
 * with js/circuits/, so adding a track meant remembering to add two stubs, and
 * forgetting meant the new track silently went unscanned. Deriving the list
 * from the definition files instead makes the drift impossible.
 *
 * Restrict a run with CIRCUITS (comma-separated) or a Playwright --grep:
 *
 *   npm test -- tests/manual/blank-scan.spec.js --grep monza
 *   CIRCUITS=monza,spa npm test -- tests/manual/inspect.spec.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function circuits() {
  const all = fs
    .readdirSync(path.join(ROOT, "js/circuits"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""))
    .sort();
  const want = (process.env.CIRCUITS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!want.length) return all;
  const unknown = want.filter((c) => !all.includes(c));
  if (unknown.length) throw new Error(`CIRCUITS names no such circuit: ${unknown.join(", ")}`);
  return want;
}
