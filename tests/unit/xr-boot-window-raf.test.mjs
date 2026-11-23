/* xr-boot-window-raf — BACK TO MENU on the error screen restarts the loop (#5875).
 *
 * LoopHealth.recover() re-arms a stopped game loop through
 * XrBoot.chainWindowRaf() with no argument, which uses the window tick XrBoot
 * was bound with. bind() stored that tick only in bindInner, which waits for
 * the lazy VR bundle (XrSession), so for every player who never opened VR the
 * call returned false and the game stayed frozen behind the overlay. The real
 * xr-boot.js in a VM with XrSession undefined.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function boot() {
  const rafs = [];
  const ctx = vm.createContext({
    Math, JSON, Promise, Array, Object, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {},
    requestAnimationFrame: (cb) => { rafs.push(cb); return rafs.length; },
    cancelAnimationFrame() {},
  });
  seedLog(ctx);
  const f = "js/xr/xr-boot.js";
  vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  assert.equal(typeof ctx.XrSession, "undefined", "the VR bundle is not loaded");
  return { ctx, rafs };
}

test("without the VR bundle, chainWindowRaf() re-arms the tick bind() was given", () => {
  const { ctx, rafs } = boot();
  const ticks = [];
  ctx.XrBoot.bind({ tickBody() {}, windowTick: (t) => ticks.push(t), getCamMode: () => 0, setCamMode() {} });
  assert.equal(ctx.XrBoot.chainWindowRaf(), true, "recover() can restart the loop");
  assert.equal(rafs.length, 1, "exactly one window rAF is scheduled");
  rafs[0](16);
  assert.deepEqual(ticks, [16], "the bound window tick runs");
  assert.equal(ctx.XrBoot.afterTick((t) => ticks.push(-t)), true);
  assert.equal(rafs[1], rafs[0], "ordinary frames share one dispatcher even when the queued tick changes");
  rafs[1](32);
  assert.deepEqual(ticks, [16, -32]);
});

test("before anything is bound, chainWindowRaf() still reports no loop", () => {
  const { ctx, rafs } = boot();
  assert.equal(ctx.XrBoot.chainWindowRaf(), false);
  assert.equal(rafs.length, 0);
});
