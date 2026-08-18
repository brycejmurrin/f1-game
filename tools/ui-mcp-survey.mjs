#!/usr/bin/env node
// Renamed to tools/ui-survey.mjs — this path stays so `npm run ui:survey`
// recipes that still named ui-mcp-survey keep working.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dest = fileURLToPath(new URL("./ui-survey.mjs", import.meta.url));
const r = spawnSync(process.execPath, [dest, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
