// @doc Reads logical stylesheet families in manifest order for source audits and ratchets.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// A logical stylesheet may span several contiguous files. Keep these sequences
// in tools/manifest.cjs CSS order; the layer audit verifies order and loading mode.
export const CSS_SOURCES = {
  "css/components.css": [
    "css/components.css", "css/dialogs.css", "css/settings.css",
    "css/settings-controls.css", "css/dialog-platform.css",
  ],
  "css/menus.css": ["css/title.css", "css/menus.css", "css/select.css", "css/race-setup.css"],
  "css/overlays.css": ["css/touch-controls.css", "css/overlays.css", "css/loading.css"],
};

export function readCssSource(name) {
  return (CSS_SOURCES[name] || [name])
    .map((file) => fs.readFileSync(fileURLToPath(new URL("../../" + file, import.meta.url)), "utf8"))
    .join("\n");
}
