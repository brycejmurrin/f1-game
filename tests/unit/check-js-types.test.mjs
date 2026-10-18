/* check-js-types.test.mjs — files that opt in with `// @ts-check` stay type-clean.
 *
 * Runs tools/check/check-js-types.mjs (the repo's local tsc, noEmit; ~0.5 s) and
 * asserts it exits 0, that tsconfig.json keeps checkJs off globally (opt-in only),
 * and that the starter files still carry their opt-in marker so a stripped
 * `// @ts-check` cannot make the gate pass vacuously. Rollout:
 * docs/notes/CHECKJS-ROLLOUT-2026-10-18.md. Run: node --test tests/unit/check-js-types.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const STARTERS = ["wall-end-face", "ai-band", "ai-corridor"].map((n) => `js/physics/${n}.js`);

test("opted-in files type-check cleanly", () => {
  const r = spawnSync(process.execPath, ["tools/check/check-js-types.mjs"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("checkJs stays opt-in and the starters carry the marker", () => {
  const cfg = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  assert.equal(cfg.compilerOptions.checkJs, false);
  assert.equal(cfg.compilerOptions.noEmit, true);
  for (const f of STARTERS) assert.match(readFileSync(f, "utf8"), /^\/\/ @ts-check$/m, f);
});
