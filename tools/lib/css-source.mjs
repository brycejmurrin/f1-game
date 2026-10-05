// @doc Reads logical stylesheet families in manifest order for source audits and ratchets.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Contiguous same-loading-mode families (css-layers.test.mjs). Title-critical
// cores stay blocking; dialog/settings and select/race-setup load print→all.
export const CSS_SOURCES = {
  "css/components.css": ["css/components.css"],
  "css/dialogs.css": [
    "css/dialogs.css", "css/settings.css",
    "css/settings-controls.css", "css/dialog-platform.css",
  ],
  "css/menus.css": ["css/title.css", "css/menus.css"],
  "css/select.css": ["css/select.css", "css/race-setup.css"],
  "css/overlays.css": ["css/touch-controls.css", "css/overlays.css", "css/loading.css"],
};

// Pre-split logical names → concat for source audits (ui-improve-pass etc.).
const AUDIT_ALIASES = {
  "css/components.css": ["css/components.css", "css/dialogs.css"],
  "css/menus.css": ["css/menus.css", "css/select.css"],
};

export function readCssSource(name) {
  const keys = AUDIT_ALIASES[name] || [name];
  const files = keys.flatMap((k) => CSS_SOURCES[k] || [k]);
  return files
    .map((file) => fs.readFileSync(fileURLToPath(new URL("../../" + file, import.meta.url)), "utf8"))
    .join("\n");
}
