#!/usr/bin/env node
/**
 * @doc One entry for the AI instrument trio: `pace` / `field` / `line` (VM, no browser).
 * @skill ai-racecraft
 *
 * Dispatches to the three measurement CLIs so agents have one name to remember:
 *
 *   node tools/check/ai-race.mjs pace  [--track monza] [--diff normal] [--json]
 *   node tools/check/ai-race.mjs field [--track monza] [--seconds 240] [--runs 5]
 *   node tools/check/ai-race.mjs line  [--track monza]
 *
 * Direct paths still work (`ai-pace.mjs` / `ai-field.mjs` / `ai-line.mjs`).
 * Not player physics — that is tune-physics.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cmd = (process.argv[2] || "").toLowerCase();
const rest = process.argv.slice(3);
const map = {
  pace: "ai-pace.mjs",
  field: "ai-field.mjs",
  line: "ai-line.mjs",
  help: null,
  "--help": null,
  "-h": null,
};

if (!cmd || map[cmd] === null || !(cmd in map)) {
  console.log(`ai-race — AI field instruments (VM)

  node tools/check/ai-race.mjs pace  [args]   # lap-time median per difficulty
  node tools/check/ai-race.mjs field [args]   # spread / passes / dwell / clumps
  node tools/check/ai-race.mjs line  [args]   # approach offset + apex depth

Owned by ai-racecraft (not tune-physics).`);
  process.exit(cmd && map[cmd] === null ? 0 : 2);
}

const r = spawnSync(process.execPath, [path.join(HERE, map[cmd]), ...rest], {
  stdio: "inherit",
});
process.exit(r.status == null ? 1 : r.status);
