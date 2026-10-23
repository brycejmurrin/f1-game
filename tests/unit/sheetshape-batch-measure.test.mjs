/* sheetshape-batch-measure.test.mjs — watchVisibility / reclassify must READ
 * every getBoundingClientRect before any classify write (D·DP5). Interleaving
 * measure+write forces a layout flush per sheet on race-select open.
 *
 * Run: node --test tests/unit/sheetshape-batch-measure.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootSheetShape } from "../helpers/sheetshape-boot.mjs";

test("watchVisibility measures every sheet before any classify style read", () => {
  const mutationCbs = [];
  class MO {
    constructor(cb) { mutationCbs.push(cb); }
    observe() {}
    disconnect() {}
  }
  const order = [];
  const { dom } = bootSheetShape(() => ({
    MutationObserver: MO,
    getComputedStyle: () => {
      order.push("cs");
      return { getPropertyValue: () => "" };
    },
  }));
  // SheetShape auto-inits on load (watchVisibility is already registered).

  const screen = dom.document.createElement("div");
  screen.id = "select";
  screen.hidden = true;
  const mk = (w, h) => {
    const el = dom.document.createElement("div");
    el.className = "sheet";
    el._rect = { left: 0, top: 0, right: w, bottom: h, width: w, height: h };
    const rect = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => { order.push("m"); return rect(); };
    screen.appendChild(el);
    return el;
  };
  mk(400, 200);
  mk(300, 300);
  dom.document.body.appendChild(screen);

  order.length = 0;
  screen.hidden = false;
  assert.ok(mutationCbs.length >= 1, "visibility MutationObserver must register");
  // Several MOs register (visibility, scale, childList). Drive them all with a
  // record that satisfies every shape — childList needs addedNodes/removedNodes.
  const rec = {
    attributeName: "hidden", target: screen,
    addedNodes: [], removedNodes: [], type: "attributes",
  };
  for (const cb of mutationCbs) cb([rec]);

  const firstCs = order.indexOf("cs");
  assert.ok(firstCs >= 0, "classify must read computed style: " + order.join(","));
  const measuresBefore = order.slice(0, firstCs).filter((s) => s === "m");
  assert.equal(measuresBefore.length, 2,
    "both sheets measured before the first classify style read; order=" + order.join(","));
});

test("reclassify measures the registry as a batch before classify style reads", () => {
  const order = [];
  const { dom, sheet } = bootSheetShape(() => ({
    getComputedStyle: () => {
      order.push("cs");
      return { getPropertyValue: () => "" };
    },
  }));
  const mk = (w, h) => {
    const el = dom.document.createElement("div");
    el.className = "sheet";
    el._rect = { left: 0, top: 0, right: w, bottom: h, width: w, height: h };
    const rect = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => { order.push("m"); return rect(); };
    dom.document.body.appendChild(el);
    return el;
  };
  const a = mk(400, 200);
  const b = mk(280, 280);
  sheet.observe(a);
  sheet.observe(b);
  order.length = 0;
  sheet.reclassify();
  const firstCs = order.indexOf("cs");
  assert.ok(firstCs >= 0, "reclassify classifies: " + order.join(","));
  assert.equal(order.slice(0, firstCs).filter((s) => s === "m").length, 2,
    "both registry sheets measured before classify; order=" + order.join(","));
});
