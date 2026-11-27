// Load js/ui/ui-shape.js into a VM context the way the browser exposes it: window.UiShape is the bare global UiShape.
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "./abs-src.mjs";
export function loadUiShape(ctx) {
  if (vm.runInContext("typeof UiShape", vm.isContext(ctx) ? ctx : vm.createContext(ctx)) !== "undefined") return;
  const file = absSrc("js/ui/ui-shape.js");
  vm.runInContext(fs.readFileSync(file, "utf8").replace("window.UiShape = ", "var UiShape = "), ctx, { filename: absSrc("js/ui/ui-shape.js") });
}
