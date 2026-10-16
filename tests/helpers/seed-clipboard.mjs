/* seed-clipboard.mjs — put the real `ApexClipboard` IIFE into a Node VM.
 *
 * Tuner panels, gfx-debug, and results-sheet call ApexClipboard at runtime.
 * Unit harnesses that load those files without the shell must run this first.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const CLIPBOARD_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/core/clipboard.js"),
  "utf8",
);

/** Evaluate js/core/clipboard.js into an existing VM context. */
export function seedClipboard(ctx) {
  vm.runInContext(CLIPBOARD_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/clipboard.js" });
  return ctx;
}
