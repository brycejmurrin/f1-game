#!/usr/bin/env node
// Moved to tools/shot/shot.mjs — this path stays so older skill recipes still run.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dest = fileURLToPath(new URL("../../../tools/shot/shot.mjs", import.meta.url));
const r = spawnSync(process.execPath, [dest, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
