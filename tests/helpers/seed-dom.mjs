/* seed-dom.mjs — put the real `Dom` IIFE (js/ui/dom.js) into a Node VM host.
 *
 * The DOM-built screens (career-ui, season-ui, hub, panel, steer-tuning) and
 * the data formatters (results, telemetry) reach Dom.el / Dom.paintFold /
 * Dom.fmtLap at call time. A harness that loads one of those IIFEs into a
 * sandbox runs this first, over whatever `document` the sandbox supplies.
 *
 *   const ctx = vm.createContext({ document: dom.document });
 *   seedDom(ctx);
 *   vm.runInContext(src, ctx);
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DOM_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/ui/dom.js"),
  "utf8",
);

// `const Dom` would land in the context's global LEXICAL scope; `var` puts it on
// the global object so a sandbox built with runInNewContext sees it too.
const DOM_EVAL = DOM_JS.replace(/^const\b/m, "var");

/** Evaluate js/ui/dom.js into an existing VM context. */
export function seedDom(ctx) {
  vm.runInContext(DOM_EVAL, ctx, { filename: "js/ui/dom.js" });
  return ctx;
}

/** The same source, for a sandbox object that has not been contextified yet
 *  (runInNewContext harnesses): returns the eval string to prepend. */
export const DOM_SOURCE = DOM_EVAL;
