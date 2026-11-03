/* hud-relative-geo-sample — REL's 1 Hz geometry net never forces a layout
   (perf hunt P5, #4586). HudRelative.tick runs after the HUD tick's text writes
   (js/ui/hud.js), so the net's 11 getBoundingClientRect reads (the card + every
   CLEAR_IDS control) each forced a synchronous layout once a second. hud.js now
   calls HudRelative.sampleGeo() at the top of the tick frame, before any write,
   and tick() compares that sample.

   The fake DOM marks layout DIRTY on any write (textContent, hidden, an
   attribute, a style property) and CLEAN at a frame boundary (the browser's
   render) or after a rect read (that read paid the forced layout). A rect read
   while dirty is a forced layout. The frame order is updateHud's: sampleGeo (if
   the module has one), the HUD's own writes, then HudRelative.tick. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { withI18n } from "../helpers/i18n-ctx.mjs";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-relative.js"), "utf8");
const L = 5000;
const car = (code, s, lap, extra = {}) => ({ code, s, lap, prog: lap * L - (L - s), rank: 0, tyre: { code: "M" }, ...extra });

function rig() {
  const lay = { dirty: false, forced: 0, reads: 0, resets: 0 };
  const touch = () => { lay.dirty = true; };
  const mk = (rect) => {
    let text = "", hidden = true;
    const el = {
      attrs: {}, children: [], currentCSSZoom: 1, clientHeight: 160, scrollHeight: 160,
      get textContent() { return text; }, set textContent(v) { if (String(v) !== text) touch(); text = String(v); },
      get hidden() { return hidden; }, set hidden(v) { if (!!v !== hidden) touch(); hidden = !!v; },
      style: { setProperty: touch, removeProperty: touch, getPropertyValue: () => "" },
      setAttribute(k, v) { el.attrs[k] = String(v); touch(); },
      removeAttribute(k) { delete el.attrs[k]; touch(); },
      hasAttribute: (k) => k in el.attrs,
      appendChild(c) { el.children.push(c); touch(); return c; },
    };
    if (rect) el.getBoundingClientRect = () => {   // reads `rect` live, so a test can move the box
      lay.reads++;
      if (lay.dirty) { lay.forced++; lay.dirty = false; }
      return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height };
    };
    return el;
  };
  const root = mk({ left: 50, top: 100, width: 170, height: 160 });
  root.style.removeProperty = () => { lay.resets++; touch(); };   // fitRows' reset pass
  const brakeRect = { left: 400, top: 180, width: 80, height: 80 };
  const brake = mk(brakeRect); brake.hidden = false;
  const els = { "hud-rel": root, "btn-brake": brake };
  const hudText = mk(null);   // another HUD readout hud.js writes before REL's tick
  const doc = { body: { className: "", classList: { contains: () => false }, getAttribute: () => null },
    documentElement: mk(null), getElementById: (id) => els[id] || null, createElement: () => mk(null) };
  const ctx = { console, document: doc, HudElements: { isOn: () => true } };
  vm.createContext(ctx); withI18n(ctx);
  vm.runInContext(SRC, ctx, { filename: absSrc("js/ui/hud-relative.js") });
  vm.runInContext("this.HudRelative = HudRelative;", ctx);
  const R = ctx.HudRelative;
  assert.ok(R, "HudRelative loaded");
  const p = car("YOU", 1000, 3, { speed: 60, rank: 2 });
  const others = [car("A1", 1100, 3, { rank: 1 }), car("B1", 900, 3, { rank: 3 })];
  const G = { cars: [p, ...others], track: { total: L }, vTop: () => 90, cssCol: () => "", store: { rev: 1 } };
  let n = 0;
  /** One HUD tick frame, in updateHud's order. */
  const frame = () => {
    lay.dirty = false;                                   // the previous frame rendered
    if (typeof R.sampleGeo === "function") R.sampleGeo();
    hudText.textContent = "P2/3 " + (n++);              // the tick's other writes (POS, gaps, ...)
    others[0].s += 7; others[1].s += 3;                  // gaps move: REL rewrites its rows
    R.tick(G, p);
  };
  return { lay, frame, brakeRect };
}

test("REL's 1 Hz net reads no rect after the tick's writes (no forced layout)", () => {
  const { lay, frame } = rig();
  frame();                                             // the first tick fits (fitRows measures by design)
  const settledForced = lay.forced, settledReads = lay.reads;
  for (let i = 0; i < 30; i++) frame();                // three seconds: three 1 Hz nets
  assert.ok(lay.reads > settledReads, "precondition: the net still measures (" + (lay.reads - settledReads) + " rect reads)");
  assert.equal(lay.forced - settledForced, 0,
    "the 1 Hz net forced " + (lay.forced - settledForced) + " layouts in 3 s (reads after the tick's DOM writes)");
});

test("the sampled net still refits when a clearance control moves (behaviour kept)", () => {
  const { lay, frame, brakeRect } = rig();
  frame();
  const fitted = lay.resets;
  assert.ok(fitted > 0, "precondition: the first tick fits");
  for (let i = 0; i < 30; i++) frame();
  assert.equal(lay.resets, fitted, "three nets over a settled layout reset nothing");
  brakeRect.left = 60;                                 // BRAKE under the card: only the net can see it
  for (let i = 0; i < 10; i++) frame();
  assert.ok(lay.resets > fitted, "the net saw the moved box and refitted");
});
