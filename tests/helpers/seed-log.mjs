/* seed-log.mjs — put the real `Log` IIFE into a Node VM or eval host.
 *
 * Product files call Log at create/bind time. Unit harnesses that load one
 * IIFE into a sandbox never ran js/core/log.js (the first <script> in the shell),
 * which then threw `Log is not defined`. Same idea as loading js/core/mat4.js first.
 *
 *   const ctx = vm.createContext({ console, Math });
 *   seedLog(ctx);
 *   vm.runInContext(src, ctx);
 *
 * Eval harnesses (perf.js, net/*) call seedLogGlobal() once at module load.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const LOG_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/core/log.js"),
  "utf8",
);

/** Evaluate js/core/log.js into an existing VM context. */
export function seedLog(ctx) {
  vm.runInContext(LOG_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/log.js" });
  return ctx;
}

/** Install Log on globalThis for eval() harnesses. */
export function seedLogGlobal() {
  if (globalThis.Log) return globalThis.Log;
  vm.runInThisContext(LOG_JS.replace(/^const\b/gm, "var") + "\nglobalThis.Log = Log;");
  return globalThis.Log;
}
