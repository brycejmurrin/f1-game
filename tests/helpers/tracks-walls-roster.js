// @ts-check
// Shared circuit roster for the tracks-walls specs. Playwright decides the
// test list at module load, so ids come from the definition files that
// Tracks.LIST is built from — same reasoning as tests/specs/tracks-walls.spec.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every circuit definition id, sorted. */
export function allCircuitIds(root = ROOT) {
  return fs.readdirSync(path.join(root, "js/circuits"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""))
    .sort();
}

/**
 * Slice `ids` into `of` contiguous shards (0-based `index`).
 * Contiguous, not stride: each file stays a short serial walk on one page.
 */
export function shardIds(ids, index, of) {
  if (of < 1) throw new Error("shard count must be >= 1");
  const n = ids.length;
  const size = Math.ceil(n / of);
  return ids.slice(index * size, (index + 1) * size);
}

export function inScope(id, { onlyTrack = process.env.TRACK, scope = process.env.APEX_CIRCUITS } = {}) {
  const scoped = (scope || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (onlyTrack && id !== onlyTrack) return false;
  if (scoped.length && !scoped.includes(id)) return false;
  return true;
}

export const STREET_IDS = ["monaco", "singapore", "vegas", "baku", "jeddah"];
