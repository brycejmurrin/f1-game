/**
 * @doc Narrow `tests/data/impact-map.json` pins for change-aware spec selection.
 */
/** Read `tests/data/impact-map.json` narrow pins for change-aware spec selection. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NARROW_FN = "narrow";

/** Specs listed under the `narrow` key for any changed `js/` file (when `narrowOnly`). */
export function specsAffectedByImpact(changed, root = ROOT) {
  let impact;
  try {
    impact = JSON.parse(fs.readFileSync(path.join(root, "tests/data/impact-map.json"), "utf8"));
  } catch {
    return [];
  }
  if (!impact?.map || !impact.narrowOnly) return [];
  const hit = new Set();
  for (const f of changed) {
    const row = impact.map[f];
    const specs = row?.[NARROW_FN];
    if (!specs?.length) continue;
    for (const spec of specs) {
      if (spec.startsWith("tests/specs/") && fs.existsSync(path.join(root, spec))) hit.add(spec);
    }
  }
  return [...hit].sort();
}
