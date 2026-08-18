#!/usr/bin/env node
// Alias: six title-path screens at the play-shape iPhone landscape viewport,
// with clip/tap findings AND PNGs. layout-audit.mjs is the real instrument;
// this file exists so `npm run ui:survey` stays a one-command recipe.
// Extra argv is forwarded; recipe flags are omitted when the caller already
// set --screens= / --viewports= / --jobs= / --shots (layout-audit is first-wins).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SCREENS = "title,select,garage,settings,career,datahub";
const DEFAULT_VIEWPORTS = "ios-iphone-landscape";

export function buildLayoutAuditArgs(userArgv) {
  const extra = userArgv.slice();
  const has = (prefix) => extra.some((a) => a === prefix || a.startsWith(prefix));
  const recipe = [];
  if (!has("--screens=")) recipe.push(`--screens=${DEFAULT_SCREENS}`);
  if (!has("--viewports=")) recipe.push(`--viewports=${DEFAULT_VIEWPORTS}`);
  if (!extra.includes("--shots") && !extra.includes("--no-shots")) recipe.push("--shots");
  if (!has("--jobs=")) recipe.push("--jobs=1");
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
  const r = spawnSync(
    process.execPath,
    [dest, ...buildLayoutAuditArgs(process.argv.slice(2))],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}
