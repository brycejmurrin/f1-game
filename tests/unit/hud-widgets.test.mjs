/* HudLayout.WIDGETS: the one descriptor the hand id sets derive from (#7236). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const ctx = vm.createContext({});
vm.runInContext(read("js/camera/cam-groups.js"), ctx, { filename: absSrc("js/camera/cam-groups.js") });
vm.runInContext(read("js/ui/hud-layout.js") + "\n;this.HL = HudLayout;", ctx, { filename: absSrc("js/ui/hud-layout.js") });
const HL = ctx.HL;
const J = (v) => JSON.parse(JSON.stringify(v));   // VM-realm arrays are not prototype-equal
const ids = (k) => HL.WIDGETS.filter((w) => w[k]).map((w) => w.id).sort();

test("WIDGETS exists, is frozen, and ELEMENTS is its 4-column view", () => {
  assert.ok(Array.isArray(HL.WIDGETS) && Object.isFrozen(HL.WIDGETS));
  assert.ok(HL.WIDGETS.every(Object.isFrozen));
  assert.equal(HL.WIDGETS.length, 20);
  assert.deepEqual(J(HL.ELEMENTS), J(HL.WIDGETS.map((w) => [w.id, w.label, w.selector, w.origin])));
});

test("derived sets equal the recorded literal lists", () => {
  assert.deepEqual(J(ids("card")), ["flag", "gaps", "limits", "rel", "sectors", "strat"]);
  assert.deepEqual(J(ids("clearCtrl")), ["inputs", "rel", "sectors"]);
  assert.deepEqual(J(HL.WIDGETS.filter((w) => w.clearReadout).sort((a, b) => a.clearReadout - b.clearReadout).map((w) => w.id)),
    ["map", "tyre", "gearbox", "speed", "limits", "announce", "damage", "rel", "strat", "inputs"]);
  assert.deepEqual(J(HL.WIDGETS.filter((w) => w.seed).map((w) => w.selector.slice(1)).sort()),
    ["announce", "hud-damage", "hud-gearbox", "hud-inputs", "hud-limits", "hud-rel", "hud-speed", "hud-strat", "hud-tyre"]);
  assert.deepEqual(J(Object.fromEntries(HL.WIDGETS.filter((w) => w.toggle).map((w) => [w.id, w.toggle]))),
    { gearbox: "gear", speed: "speed", energy: "energy", tyre: "tyre", ot: "ot", aero: "aero", bb: "bb", sectors: "sectors", limits: "limits",
      damage: "damage", rel: "rel", strat: "strat", inputs: "inputs" });
});

test("every toggle key is an id in HudElements.ELEMENTS", () => {
  const c = vm.createContext({});
  vm.runInContext(read("js/ui/hud-elements.js") + "\n;this.HE = typeof HudElements !== 'undefined' ? HudElements : null;", c, { filename: absSrc("js/ui/hud-elements.js") });
  const he = c.HE && c.HE.ELEMENTS;
  assert.ok(he, "HudElements.ELEMENTS exported");
  const keys = new Set(he.map((e) => (Array.isArray(e) ? e[0] : e.id)));
  for (const w of HL.WIDGETS) if (w.toggle) assert.ok(keys.has(w.toggle), w.toggle);
});
