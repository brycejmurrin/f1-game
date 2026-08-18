/* jsconfig-globals.test.mjs — the editor language service has a project root.

 * jsconfig.json puts every IIFE file in ONE script-mode project so a `const Log`
 * in js/log.js is the same Log other files read. That is the useful editor
 * behaviour: go-to-definition lands on the writer. An ambient types/globals.d.ts
 * plus `moduleDetection: "force"` was the opposite — each file became a module,
 * then declare const stole F12 onto the .d.ts.
 *
 * types/game-ctx.d.ts stays out of this project. It is the check-gctx façade
 * gate, not an editor overlay; including its `declare const GameHud` next to
 * js/game/hud.js's `const GameHud` would split the definition.
 *
 * checkJs stays false. A full-tree probe on 2026-08-18 produced ~13k errors,
 * mostly implicit-any. Per-file // @ts-check is still a later tranche.
 *
 * Run: node --test tests/unit/jsconfig-globals.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findTsc } from "../../tools/check-gctx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("jsconfig.json is a script-mode editor project over js/ only", () => {
  const cfg = JSON.parse(read("jsconfig.json"));
  assert.equal(cfg.compilerOptions.checkJs, false,
    "checkJs:true floods implicit-any on IIFE files; keep it off until a @ts-check tranche");
  assert.equal(cfg.compilerOptions.allowJs, true);
  assert.equal(cfg.compilerOptions.noEmit, true);
  assert.equal(cfg.compilerOptions.moduleDetection, undefined,
    "moduleDetection:force turns IIFEs into modules and hides their globals");
  assert.deepEqual(cfg.include, ["js/**/*.js"]);
  assert.equal(fs.existsSync(path.join(ROOT, "types/globals.d.ts")), false,
    "types/globals.d.ts steals go-to-definition from the IIFE writer");
});

test("tsc -p jsconfig.json is clean", (t) => {
  const tsc = findTsc();
  if (!tsc) {
    t.skip("no TypeScript resolvable (no node_modules/typescript, no tsc on PATH)");
    return;
  }
  const r = spawnSync(tsc.cmd, [...tsc.args, "-p", path.join(ROOT, "jsconfig.json"), "--pretty", "false"], {
    encoding: "utf8",
    cwd: ROOT,
  });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  assert.equal(r.status, 0, out || "tsc -p jsconfig.json failed with no output");
  assert.equal(out, "", `tsc -p jsconfig.json printed diagnostics:\n${out}`);
});
