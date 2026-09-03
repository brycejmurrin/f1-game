/* seed-store.mjs — put the real `GameStore` IIFE (js/core/store.js) into a Node
 * VM or eval host, the way seed-log.mjs does for `Log`.
 *
 * The settings panels, the perf sentinel, BodyAttitude and the Spotify client
 * persist their flags through GameStore.store's raw lane (raw / rawSet /
 * rawDel) instead of touching localStorage themselves. A harness that loads
 * one of those IIFEs into a sandbox therefore needs GameStore there too — over
 * WHATEVER `localStorage` the sandbox supplies, because the raw lane reads the
 * global live on every call and never caches.
 *
 *   const ctx = vm.createContext({ localStorage: fake });
 *   seedLog(ctx); seedStore(ctx);
 *   vm.runInContext(src, ctx);
 *
 * Eval harnesses (perf.js) call seedStoreGlobal() once at module load; a
 * `globalThis.localStorage` swapped in later is still the one it reads.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog, seedLogGlobal } from "./seed-log.mjs";

const STORE_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/core/store.js"),
  "utf8",
);

/** Evaluate js/core/store.js into an existing VM context (seeds Log if absent). */
export function seedStore(ctx) {
  if (vm.runInContext("typeof Log === \"undefined\"", ctx)) seedLog(ctx);
  vm.runInContext(STORE_JS.replace(/^const\b/gm, "var"), ctx, { filename: "js/core/store.js" });
  return ctx;
}

/** Install GameStore on globalThis for eval() harnesses. */
export function seedStoreGlobal() {
  if (globalThis.GameStore) return globalThis.GameStore;
  seedLogGlobal();
  vm.runInThisContext(STORE_JS.replace(/^const\b/gm, "var") + "\nglobalThis.GameStore = GameStore;");
  return globalThis.GameStore;
}
