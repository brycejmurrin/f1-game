/* jsconfig-globals.test.mjs — the editor language service has a project root.

 * Bedrock Phase 1 second half (docs/research/ARCHITECTURE-REDESIGN-2026-08.md).
 * Cursor/VS Code already run TypeScript's language service. Without a
 * jsconfig.json that service treats every IIFE file as an inferred project and
 * cannot see Log / Tracks / GameCtx. types/globals.d.ts plus the GameModuleFactory
 * roster in types/game-ctx.d.ts are the ambient names; this test holds both
 * to the live scanner and holds `tsc -p jsconfig.json` to a clean checkJs:false
 * project (the setting the editor actually uses).
 *
 * checkJs stays false. A five-file probe on 2026-08-18 produced 89 errors,
 * mostly implicit-any. Per-file // @ts-check is still the later tranche.
 *
 * Run: node --test tests/unit/jsconfig-globals.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanRepo, buildGraph } from "../../tools/scan-globals.mjs";
import { findTsc } from "../../tools/check-gctx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function declaredConsts(rel) {
  const names = [];
  for (const m of read(rel).matchAll(/^declare const ([A-Za-z_$][\w$]*):/gm)) names.push(m[1]);
  return names;
}

test("jsconfig.json is a checkJs:false editor project over js/ + types/", () => {
  const cfg = JSON.parse(read("jsconfig.json"));
  assert.equal(cfg.compilerOptions.checkJs, false,
    "checkJs:true floods implicit-any on IIFE files; keep it off until a @ts-check tranche");
  assert.equal(cfg.compilerOptions.allowJs, true);
  assert.equal(cfg.compilerOptions.noEmit, true);
  assert.equal(cfg.compilerOptions.moduleDetection, "force",
    "script-mode would collide top-level const names across IIFE files");
  assert.ok(cfg.include.includes("js/**/*.js"));
  assert.ok(cfg.include.includes("types/**/*.d.ts"));
});

test("declare const names in types/ cover every scanned IIFE global exactly once", () => {
  const scan = scanRepo();
  const graph = buildGraph(scan);
  const scanned = Object.keys(graph.globals).sort();
  const fromGlobals = declaredConsts("types/globals.d.ts");
  const fromCtx = declaredConsts("types/game-ctx.d.ts");
  const both = [...fromGlobals, ...fromCtx].sort();
  const dupes = both.filter((n, i) => both.indexOf(n) !== i);
  assert.deepEqual(dupes, [],
    "a global is declared in both .d.ts files — drop the copy in types/globals.d.ts");
  assert.deepEqual([...new Set(both)].sort(), scanned,
    "types/globals.d.ts + types/game-ctx.d.ts must declare exactly the scanner's globals");
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
