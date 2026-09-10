/* seed-hash32.mjs — put the real `Hash32` IIFE into a Node VM or eval host.
 *
 * career.js, daily-challenge.js, and driver-ratings.js call Hash32 at runtime.
 * Unit harnesses that load those files without the shell must run this first.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HASH32_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/core/hash32.js"),
  "utf8",
);

/** Evaluate js/core/hash32.js into an existing VM context. */
export function seedHash32(ctx) {
  vm.runInContext(HASH32_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/hash32.js" });
  return ctx;
}
