/* car-warm-token.test.mjs — a superseded race start must not clear the newer start's car-warm flag (#4585).
 *
 * startRaceBody sets _carWarm.busy around the stepped warmCarAssetsAsync, and render() draws nothing
 * while it is set. A quit or a newer start makes the older body stale; its warm aborts at the next
 * step and its `finally` used to clear the flag the newer warm had just set, so frames drew cars
 * that were not warmed yet. This runs the exact game.js lines with two overlapping warms.
 *
 * Run: node --test tests/unit/car-warm-token.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GAME = readFileSync(join(ROOT, "js/game.js"), "utf8");

function warmHarness() {
  const decl = GAME.match(/^const _carWarm = \{[^\n]*?\};/m);
  assert.ok(decl, "game.js declares _carWarm");
  const lines = GAME.split("\n");
  const from = lines.findIndex((l) => /_carWarm\.busy = true;/.test(l));
  const to = lines.findIndex((l, i) => i >= from && /warmCarAssetsAsync\(/.test(l) && /finally/.test(l));
  assert.ok(from >= 0 && to >= from, "startRaceBody's warm block found");
  const block = lines.slice(from, to + 1).join("\n");
  const pending = [];
  const ctx = {
    vmNoFramePump: false, headlessMode: false,
    RaceEntryProfile: { spanAsync: (_label, fn) => fn() },
    warmCarAssetsAsync: () => new Promise((resolve) => pending.push(resolve)),
  };
  vm.runInNewContext(decl[0] + "\nthis._carWarm = _carWarm;\nthis.warm = async function (stale) {\n" + block + "\n};", ctx, { filename: absSrc("js/game.js") });
  return { ctx, pending };
}

test("the stale warm's finally leaves a newer warm's busy flag set (#4585)", async () => {
  const { ctx, pending } = warmHarness();
  const a = ctx.warm(() => true);    // start A: superseded below
  const b = ctx.warm(() => false);   // start B owns the screen now
  assert.equal(ctx._carWarm.busy, true);
  pending[0]();                      // A's warm aborts at its next step
  await a;
  assert.equal(ctx._carWarm.busy, true, "A's finally cleared B's flag: render() would draw unwarmed cars");
  pending[1]();
  await b;
  assert.equal(ctx._carWarm.busy, false, "the owning warm clears the flag when it ends");
});

test("a lone warm still clears its flag (#4585)", async () => {
  const { ctx, pending } = warmHarness();
  const a = ctx.warm(() => false);
  assert.equal(ctx._carWarm.busy, true);
  pending[0]();
  await a;
  assert.equal(ctx._carWarm.busy, false);
});
