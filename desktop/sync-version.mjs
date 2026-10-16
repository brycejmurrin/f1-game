#!/usr/bin/env node
/**
 * sync-version.mjs — compatibility alias for scripts/set-version.mjs
 * (the Electron spike's pack/start scripts already called this name).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(HERE, "scripts", "set-version.mjs"), ...process.argv.slice(2)], {
  cwd: HERE,
  stdio: "inherit",
});
process.exit(r.status === null ? 1 : r.status);
