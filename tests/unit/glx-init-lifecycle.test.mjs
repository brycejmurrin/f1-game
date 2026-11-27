/* #7222 (#7220 rows 3-5): GLX init cleanup on a failed link gate, present() on a
 * lost context drains frame waiters, gfx.js logs the webgl2 pick with no WebGPU.
 * Run: node --test tests/unit/glx-init-lifecycle.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { bootGlx } from "../helpers/glx-mock.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

test("a failed link gate removes every listener init attached (row 3)", () => {
  const h = bootGlx({ rejectSource: /./, allowInitFail: true });
  assert.equal(h.inited, false);
  const OURS = /^(visibilitychange|pageshow|webglcontextlost|webglcontextrestored)$/;
  const adds = h.listenerLog.filter((e) => e[0] === "add" && OURS.test(e[2]));
  assert.ok(adds.length >= 4, "init attached listeners before the gate");
  for (const [, tgt, ev] of adds) {
    assert.ok(h.listenerLog.some((e) => e[0] === "remove" && e[1] === tgt && e[2] === ev), `${tgt}:${ev} removed`);
  }
});

test("present() on a lost context resolves a frame waiter (row 4)", async () => {
  const h = bootGlx({ overlay: null });
  h.GLX.setSoftPresent && h.GLX.setSoftPresent(true);
  h.loseContext();
  const t0 = Date.now();
  const p = h.GLX.awaitSoftPresent(2000, "frame");
  h.GLX.present();
  // Drained waiters resolve "frame"; a timeout would resolve "stale" after 2 s.
  assert.equal(await p, "frame");
  assert.ok(Date.now() - t0 < 1000);
});

test("Gfx logs backend=webgl2 for pref webgl2 with no navigator.gpu (row 5)", async () => {
  const lines = [];
  const ctx = vm.createContext({ Log: { info: (_t, m) => lines.push(m), warn() {} }, navigator: {}, localStorage: { getItem: () => null }, Promise, Reflect, Proxy });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(absSrc("js/render/gfx.js"), "utf8"), ctx, { filename: absSrc("js/render/gfx.js") });
  const r = await ctx.Gfx.create({ getContext() { return null; } }, { backend: "webgl2" });
  assert.equal(r, null);
  assert.deepEqual(lines.filter((l) => /backend=/.test(l)), ["Gfx.bind backend=webgl2"]);
});
