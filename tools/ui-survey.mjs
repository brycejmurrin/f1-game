#!/usr/bin/env node
// Forwarder → layout-audit --survey (the `npm run ui:survey` entry).
// @doc Thin forwarder → `layout-audit.mjs --survey` (the `npm run ui:survey` entry).
// @skill survey-ui-matrix
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SCREENS = "title,select,garage,settings,career,datahub";
const DEFAULT_VIEWPORTS = "ios-iphone-landscape";

/** Build argv for layout-audit --survey; caller flags win (first-wins). */
export function buildLayoutAuditArgs(userArgv) {
  const extra = userArgv.slice();
  const has = (prefix) => extra.some((a) => a === prefix || a.startsWith(prefix));
  const recipe = ["--survey"];
  if (!has("--screens=")) recipe.push(`--screens=${DEFAULT_SCREENS}`);
  if (!has("--viewports=")) recipe.push(`--viewports=${DEFAULT_VIEWPORTS}`);
  if (!extra.includes("--shots") && !extra.includes("--no-shots")) recipe.push("--shots");
  if (!has("--jobs=")) recipe.push("--jobs=1");
  // --survey already implies the title-path defaults inside layout-audit; keep
  // explicit flags so a caller can freeze them in the spawn argv.
  return [...recipe, ...extra];
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  const dest = fileURLToPath(new URL("./layout-audit.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [dest, ...buildLayoutAuditArgs(process.argv.slice(2))], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}
