// Load the real-race trio in order: the script builder, the cache, then the tab.
// DataRealRace re-exports the first two, so a harness that only evals the tab
// throws at the eval-time destructure.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "./abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const REAL_RACE_FILES = [
  "js/data/tab-utils.js",
  "js/data/real-race-script.js",
  "js/data/real-race-fetch.js",
  "js/data/real-race-tab.js",
];

export function evalRealRace(ctx, extra = "") {
  for (const f of REAL_RACE_FILES) {
    const code = fs.readFileSync(path.join(ROOT, f), "utf8") + (f.endsWith("real-race-tab.js") ? extra : "");
    vm.runInContext(code, ctx, { filename: absSrc(f) });
  }
}
