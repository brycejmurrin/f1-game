/* hud-elements — per-element HUD visibility store + body[data-hud-hide]. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-elements.js"), "utf8");

function load(stored = {}) {
  const written = {};
  const body = { dataset: {}, classList: { toggle() {} } };
  const doc = {
    body,
    readyState: "complete",
    getElementById: () => null,
    addEventListener() {},
  };
  const ctx = {
    console,
    document: doc,
    GameStore: {
      store: {
        get(k, d) { return k in stored ? stored[k] : (k in written ? written[k] : d); },
        set(k, v) { written[k] = v; },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudElements = HudElements;", ctx);
  ctx.__written = written;
  ctx.__body = body;
  return ctx;
}

test("defaults every chrome element on; hide writes data-hud-hide", () => {
  const ctx = load();
  const H = ctx.HudElements;
  assert.equal(H.isOn("speed"), true);
  H.set("speed", false);
  assert.equal(H.isOn("speed"), false);
  assert.match(ctx.__body.dataset.hudHide, /\bspeed\b/);
  assert.equal(ctx.__written.hudElements.speed, "off");
  H.set("speed", true);
  // Only the opt-in readouts (shipped off) are left in the hide list.
  assert.equal(ctx.__body.dataset.hudHide, "rel strat inputs");
});

test("stored offs restore on load", () => {
  const ctx = load({ hudElements: { tyre: "off", ot: "off" } });
  const H = ctx.HudElements;
  assert.equal(H.isOn("tyre"), false);
  assert.equal(H.isOn("ot"), false);
  assert.equal(H.isOn("speed"), true);
  assert.match(ctx.__body.dataset.hudHide, /\btyre\b/);
  assert.match(ctx.__body.dataset.hudHide, /\bot\b/);
});

test("opt-in readouts ship OFF, store only an explicit on, and hide via data-hud-hide", () => {
  const ctx = load();
  const H = ctx.HudElements;
  for (const id of ["rel", "strat", "inputs"]) assert.equal(H.isOn(id), false, id);
  assert.match(ctx.__body.dataset.hudHide, /\brel\b.*\bstrat\b.*\binputs\b/);
  H.set("rel", true);
  assert.equal(ctx.__written.hudElements.rel, "on");
  assert.doesNotMatch(ctx.__body.dataset.hudHide, /\brel\b/);
  H.set("rel", false);
  assert.deepEqual({ ...ctx.__written.hudElements }, {}, "back to the shipped default: nothing stored");
  const back = load({ hudElements: { inputs: "on", speed: "off" } }).HudElements;
  assert.equal(back.isOn("inputs"), true);
  assert.equal(back.isOn("speed"), false);
  assert.equal(back.isOn("strat"), false);
});

test("CSS contracts: hide selectors and no new class sprawl for the checklist", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /body\[data-hud-hide~="speed"\] #hud-speed/);
  assert.match(css, /body\[data-hud-hide~="tyre"\] #hud-tyre/);
  assert.match(css, /#pm-hud-elements-list/);
});
