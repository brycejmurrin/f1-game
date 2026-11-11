// Load the real js/core/i18n.js into a vm context so a module under test can call I18n.t / I18n.n.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "./abs-src.mjs";

const SRC = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/core/i18n.js"), "utf8");

export function withI18n(ctx) {
  if (!vm.isContext(ctx)) vm.createContext(ctx);
  vm.runInContext(SRC + "; this.I18n = I18n;", ctx, { filename: absSrc("js/core/i18n.js") });
  return ctx;
}
