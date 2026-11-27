// dom-vm.mjs — load js/ui/dom.js (the `Dom` global) into a hand-built VM context.
// In the page dom.js loads long before the HUD, key-binds, settings and bridge modules,
// which call Dom.isDesktop() (#7053). A harness that evaluates one of them by hand calls
// loadDom(ctx) first. Idempotent: a context that already has Dom is left alone (a second
// `const Dom` in the same context would throw). Accepts a context or a plain sandbox
// object (contextified in place, so a later vm.runInNewContext(src, sb) sees Dom).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "./abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DOM_SRC = fs.readFileSync(path.join(ROOT, "js/ui/dom.js"), "utf8");

export function loadDom(ctx) {
  const c = vm.isContext(ctx) ? ctx : vm.createContext(ctx);
  if (vm.runInContext("typeof Dom", c) === "undefined") vm.runInContext(DOM_SRC, c, { filename: absSrc("js/ui/dom.js") });
  return c;
}
