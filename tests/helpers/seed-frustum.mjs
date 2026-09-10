/* seed-frustum.mjs — put the real `Frustum` IIFE into a Node VM or eval host.
 *
 * GLX chunked, TLX chunked, and WGX call Frustum at runtime (and WGX/TLX
 * re-export its methods at eval). Unit harnesses that load those files without
 * the shell must run this first.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const FRUSTUM_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/render/shared/frustum.js"),
  "utf8",
);

/** Evaluate js/render/shared/frustum.js into an existing VM context. */
export function seedFrustum(ctx) {
  vm.runInContext(FRUSTUM_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/render/shared/frustum.js" });
  return ctx;
}
