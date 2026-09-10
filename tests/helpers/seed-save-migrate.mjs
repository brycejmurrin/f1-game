/* seed-save-migrate.mjs — put the real `SaveMigrate` IIFE into a Node VM host.
 *
 * js/core/store.js delegates career/season migration to SaveMigrate at eval.
 * Unit harnesses that load store.js without the shell must run this first
 * (after Teams when remapPoints will run).
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SAVE_MIGRATE_JS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/career/save-migrate.js"),
  "utf8",
);

const SAVE_MIGRATE_EVAL = SAVE_MIGRATE_JS.replace(/^const\b/gm, "var");

/** Evaluate js/career/save-migrate.js into an existing VM context. */
export function seedSaveMigrate(ctx) {
  vm.runInContext(SAVE_MIGRATE_EVAL, ctx, { filename: "js/career/save-migrate.js" });
  return ctx;
}

/** Install SaveMigrate on globalThis for eval() harnesses. */
export function seedSaveMigrateGlobal() {
  if (globalThis.SaveMigrate) return globalThis.SaveMigrate;
  vm.runInThisContext(SAVE_MIGRATE_EVAL + "\nglobalThis.SaveMigrate = SaveMigrate;", { filename: "js/career/save-migrate.js" });
  return globalThis.SaveMigrate;
}
