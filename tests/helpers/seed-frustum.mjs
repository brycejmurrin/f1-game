/* seed-frustum.mjs — put the real `Frustum` IIFE into a Node VM or eval host,
 * with `ChunkBins` (js/render/shared/chunk-bins.js) beside it.
 *
 * GLX chunked, TLX chunked, and WGX call Frustum at runtime (and WGX/TLX
 * re-export its methods at eval); GLX and TLX chunked bin through ChunkBins at
 * runtime. Unit harnesses that load those files without the shell must run
 * this first.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SHARED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/render/shared");
const FRUSTUM_JS = fs.readFileSync(path.join(SHARED, "frustum.js"), "utf8");
const CHUNK_BINS_JS = fs.readFileSync(path.join(SHARED, "chunk-bins.js"), "utf8");

/** Evaluate js/render/shared/frustum.js and chunk-bins.js into an existing VM context. */
export function seedFrustum(ctx) {
  vm.runInContext(FRUSTUM_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/render/shared/frustum.js" });
  vm.runInContext(CHUNK_BINS_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/render/shared/chunk-bins.js" });
  return ctx;
}
