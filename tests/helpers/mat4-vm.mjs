// @doc Load js/core/mat4.js (M4 / V3: the shared scalar helpers and the M4.isNight / isWet session predicates) into a vm sandbox, contextifying a plain object first.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "./abs-src.mjs";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/core/mat4.js");
const SRC = fs.readFileSync(FILE, "utf8");

/** `withM4(sb)` → the contextified `sb` with M4 and V3 defined, before the modules that read them run. */
export function withM4(sb) {
  const ctx = vm.isContext(sb) ? sb : vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: absSrc("js/core/mat4.js") });
  return ctx;
}
