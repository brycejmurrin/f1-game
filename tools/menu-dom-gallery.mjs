#!/usr/bin/env node
// Fast menu screenshot + DOM gallery — alias for layout-audit capture mode.
//
// ONE boot per viewport (not one per screen like ui-audit.spec.js).
// Uses headless(true), hides #game, in-page overlay reset between screens.
//
//   node tools/menu-dom-gallery.mjs
//   node tools/menu-dom-gallery.mjs --screens=title,select,garage
//   node tools/menu-dom-gallery.mjs --viewports=ios-iphone-landscape --jobs=1
//
// Output: artifacts/menu-dom-gallery/{manifest.json,index.html,shots/*.png,dom/*.dom.json}
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_VIEWPORTS = "ios-iphone-landscape,ios-iphone-portrait";

export function buildMenuDomGalleryArgs(userArgv) {
  const extra = userArgv.slice();
  const has = (prefix) => extra.some((a) => a === prefix || a.startsWith(prefix));
  const recipe = ["--capture-only", "--dom", "--shots"];
  if (!has("--viewports=")) recipe.push(`--viewports=${DEFAULT_VIEWPORTS}`);
  if (!has("--jobs=")) recipe.push("--jobs=2");
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
  const r = spawnSync(process.execPath, [dest, ...buildMenuDomGalleryArgs(process.argv.slice(2))], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}
