/* assert-match-ratchet.test.mjs — repo-wide `assert.match` under tests/unit
 * only ever goes down (#1682).
 *
 * Source-text pins break on refactors that change no behaviour. Converting
 * them (gfx-backend-canary first) must lower this ceiling; a new assert.match
 * anywhere under tests/unit raises it and fails until the ceiling is updated
 * with a reason (or the call is replaced by a behaviour assertion).
 *
 * Count: `rg -rho 'assert\.match' tests/unit | wc -l` (same pattern).
 * Same shrink-only idiom as source-pin-hygiene / waitForTimeout.
 *
 * Run: node --test tests/unit/assert-match-ratchet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// 2026-10-19: #1682 first slice (gfx-backend-canary preference / latch / recovery
// pins → behaviour). Post-merge tip absorb 7401 (other PRs added pins outside
// canary). Lower this when more pins convert; never raise without a reason.
const CEILING = 7401;
const EXEMPT = new Set([
  "tests/unit/assert-match-ratchet.test.mjs",
]);
const PIN = /assert\.match\b/g;

function sites() {
  const per = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = rel + "/" + e.name;
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(r);
      } else if (/\.(mjs|cjs|js)$/.test(e.name) && !EXEMPT.has(r)) {
        const n = (fs.readFileSync(path.join(ROOT, r), "utf8").match(PIN) || []).length;
        if (n) per.push([r, n]);
      }
    }
  };
  walk("tests/unit");
  return per;
}

test("assert.match under tests/unit never grows (convert source pins to behaviour)", () => {
  const per = sites();
  const total = per.reduce((a, [, n]) => a + n, 0);
  assert.ok(total <= CEILING,
    `${total} assert.match sites (ceiling ${CEILING}) — convert a source pin to a ` +
    `VM/behaviour assertion (see #1682 / gfx-backend-canary). Biggest: ` +
    per.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f} ${n}`).join(", "));
  assert.ok(total > CEILING - 200,
    `${total} assert.match is far under the ceiling ${CEILING}: lower CEILING to ${total} ` +
    `so the ratchet keeps its grip`);
});
