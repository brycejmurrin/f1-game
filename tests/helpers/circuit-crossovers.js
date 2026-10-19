// @ts-check
// Circuits whose road crosses itself (figure-8 / flyover), read from the DEF
// field `crossover: true` in js/circuits/<id>.js instead of a name list in the
// spec. Text-read like tests/helpers/tracks-walls-roster.js: Playwright decides
// its test list at module load, before any circuit VM exists.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allCircuitIds } from "./tracks-walls-roster.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Ids whose def declares `crossover: true`, sorted. A `bridges` table without the flag throws. */
export function crossoverIds(root = ROOT) {
  const ids = [];
  for (const id of allCircuitIds(root)) {
    const src = fs.readFileSync(path.join(root, "js/circuits", `${id}.js`), "utf8");
    const flagged = /^\s*crossover:\s*true\b/m.test(src);
    const bridged = /^\s*bridges:\s*\[\s*\{/m.test(src);
    if (bridged && !flagged) {
      throw new Error(`${id}: def has \`bridges\` but no \`crossover: true\` — the over-road scan would judge its flyover by the plain rule`);
    }
    if (flagged) ids.push(id);
  }
  return ids;
}
