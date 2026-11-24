import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
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

test("telemetry playback follows foreground elapsed time and skips hidden-tab gaps", () => {
  let frame = null;
  const document = new EventTarget();
  function visibility(hidden) {
    document.hidden = hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  }
  visibility(false);
  const ctx = vm.createContext({
    document,
    DataTelemetryModel: {},
    requestAnimationFrame: (fn) => { frame = fn; return 1; },
    cancelAnimationFrame: () => { frame = null; },
  });
  const file = "js/data/telemetry-player.js";
  vm.runInContext(source(file), ctx, { filename: absSrc(file) });
  const player = vm.runInContext("DataTelemetryPlayer.create({}, { paintFrame() {} })", ctx);
  const view = { playing: false, cursorT: 0, tMax: 2, rate: 1 };
  player.playAnim(view);
  function expectCursor(t) {
    assert.ok(Math.abs(view.cursorT - t) < 1e-9, `expected ${t}s, got ${view.cursorT}s`);
  }
  frame(1000);
  frame(1200);
  expectCursor(0.2);
  view.rate = 2;
  frame(1400);
  expectCursor(0.6);

  visibility(true);
  visibility(false);
  frame(61400);
  expectCursor(0.6);
  view.rate = 4;
  frame(61600);
  expectCursor(1.4);
  frame(61800);
  expectCursor(0);

  player.pauseAnim(view);
  assert.equal(frame, null);
  assert.equal(view.playing, false);
  const last = view._last;
  visibility(true);
  assert.equal(view._last, last, "pause removes the visibility listener");
});
