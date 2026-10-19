// Telemetry popup ResizeObserver: the chart branch overwrote view.ratio BEFORE the map branch compared it,
// so a DPR / zoom change under unchanged boxes refit the trace charts but left the map canvas at the old
// ratio (soft, or oversized buffers). The ratio change is now read once, first, and both branches use it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { driver, telemetryPopupRig } from "../helpers/telemetry-popup-rig.mjs";

test("a DPR change under unchanged boxes refits the map canvas as well as the chart", async () => {
  const trace = driver(80);
  trace.car.forEach((sample) => Object.assign(sample, { gear: 7, throttle: 80, brake: 0, rpm: 10000, drs: 12 }));
  const { dom, context, observers, frames, openPopup } = await telemetryPopupRig({ trace, dpr: 1 });
  await openPopup();

  const popup = dom.document.querySelector(".dh-tpopup");
  assert.ok(popup && popup.open);
  const chart = popup.querySelector(".dh-canvas"), map = popup.querySelector(".dh-canvas.dh-map");
  assert.ok(chart && map);
  assert.notEqual(chart, map, "the popup has a chart and a map canvas");
  const ratio0 = 2;   // zoom 2 x DPR 1
  assert.equal(map.width % ratio0, 0);
  const mw = map.width / ratio0, cw = chart.width / ratio0;
  // Keep both boxes exactly as built so only the ratio differs.
  const mainArea = popup.querySelector(".dh-telem-main"), sideArea = popup.querySelector(".dh-telem-side");
  mainArea._rect = { left: 0, top: 0, width: cw + 32, height: 400 };
  sideArea._rect = { left: 0, top: 0, width: mw + 24, height: 400 };
  assert.ok(observers.length >= 1 && observers[0].cb, "the popup observes its size");
  context.window.devicePixelRatio = 1.5;   // zoom 2 x 1.5 = ratio 3
  observers[0].cb();
  for (const [id, fn] of frames) { frames.delete(id); fn(); }
  assert.equal(chart.width, cw * 3, "the chart refits to the new ratio");
  assert.equal(map.width, mw * 3, "and so does the map canvas");
});
