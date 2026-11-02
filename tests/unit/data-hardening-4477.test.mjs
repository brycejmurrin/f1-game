import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const source = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("custom liveries: a null/non-object stored element is dropped, resolveLivery does not throw", () => {
  const ctx = vm.createContext({});
  for (const f of ["js/car/liveries.js", "js/car/custom-liveries.js"]) vm.runInContext(source(f), ctx, { filename: absSrc(f) });
  const store = { rev: 0, get: (k, d) => (k === "livery.custom.t" ? [null, 3, { id: "a", name: "A", c1: [0, 0, 0], c2: [1, 1, 1] }] : d), set() {} };
  ctx.store = store;
  const CL = vm.runInContext("CustomLiveries.create({ store })", ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(CL.getCustomLiveries("t").map((l) => l.id))), ["a"]);
  const team = { id: "t", color: [1, 0, 0], color2: [0, 0, 1] };
  assert.doesNotThrow(() => CL.resolveLivery(team));
});

test("telemetry playback: dt after a hidden tab is clamped", () => {
  const src = fnSource(source("js/data/telemetry-player.js"), "function playAnim(view)");
  let raf = null;
  const ctx = vm.createContext({
    requestAnimationFrame: (f) => { raf = f; return 1; },
    setPlayLabel() {}, paintFrame() {},
  });
  vm.runInContext(src, ctx);
  const view = { playing: false, cursorT: 0, tMax: 1000, rate: 1, _last: 0 };
  ctx.view = view;
  vm.runInContext("playAnim(view)", ctx);
  raf(1000); raf(1000 + 60000); // 60 s hidden-tab gap
  assert.ok(view.cursorT <= 0.11, "cursor advanced " + view.cursorT + "s in one frame");
});
