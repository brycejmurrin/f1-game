#!/usr/bin/env node
/**
 * @doc Type-checks the JS files that opt in with `// @ts-check` (JSDoc + the repo's local tsc, noEmit).
 * @skill check-changes
 * check-js-types.mjs — opt-in checkJs.
 *
 *   node tools/check/check-js-types.mjs            # exit 1 on any type error
 *   node tools/check/check-js-types.mjs --json     # machine-readable result
 *
 * tsconfig.checkjs.json parses `js/physics/*.js` (allowJs, checkJs false) and tsc reports
 * only files that carry `// @ts-check`. Nothing is emitted and nothing here ships.
 * How to opt a file in: docs/notes/CHECKJS-ROLLOUT-2026-10-18.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");
const json = process.argv.includes("--json");

if (!existsSync(TSC)) {
  console.error("check-js-types: node_modules/.bin/tsc missing — run npm install");
  process.exit(2);
}
const r = spawnSync(TSC, ["-p", "tsconfig.checkjs.json", "--noEmit", "--pretty", "false"], { cwd: ROOT, encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
const errors = out.split("\n").filter((l) => /\(\d+,\d+\): error TS\d+/.test(l));
if (json) console.log(JSON.stringify({ ok: r.status === 0, errors }, null, 2));
else if (r.status === 0) console.log("check-js-types: ok");
else console.error(out.trim());
process.exit(r.status === 0 ? 0 : 1);
