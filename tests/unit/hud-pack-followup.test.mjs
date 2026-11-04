/* #4586 row 2 — one full phone HUD fit ran HudLayout.clearReadouts ~5 times: packPhone inside fit(), fitHud's
   tail (js/ui/hud.js), then schedulePackFollowUp's double-rAF pack AND its 120 ms pack — each ~35 style + rect
   reads with a forced layout. The follow-ups now skip when a clearReadouts already ran after they were scheduled
   and nothing packPhone measures changed (a layout-free signature); a readout that unhides or whose text grows in
   between still gets its follow-up pack. Counted by the style reads clearReadouts makes on #hud-rel. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/camera/cam-groups.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");

function load() {
  const dom = makeDom({ readyState: "loading" });
  const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
  const rel = dom.byId("hud-rel"); rel._rect = rect(600, 60, 120, 80); rel.textContent = "P3 +0.4";
  const strat = dom.byId("hud-strat"); strat._rect = rect(100, 150, 110, 40); strat.hidden = true;
  const tyre = dom.byId("hud-tyre"); tyre._rect = rect(380, 300, 80, 40); tyre.textContent = "S 12";
  let relReads = 0;
  const rafs = [], timers = [];
  const ctx = {
    console, Math, Object, Number, Array, Map, Set, Infinity, NaN, isFinite, parseFloat, String,
    document: dom.document,
    window: { innerWidth: 844, innerHeight: 390 },
    getComputedStyle(el) {
      if (el === rel) relReads++;
      return { display: "block", visibility: "visible", zoom: "1", getPropertyValue: () => "0px" };
    },
    requestAnimationFrame(fn) { rafs.push(fn); return rafs.length; },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    GameStore: undefined,
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx, { filename: absSrc("js/ui/hud-layout.js") });
  const flushFrame = () => { for (const fn of rafs.splice(0)) fn(); };
  const flushTimers = () => { for (const fn of timers.splice(0)) fn(); };
  // Loading runs apply() → fit() once (and schedules its follow-up): settle that, then count from zero.
  flushFrame(); flushFrame(); flushTimers(); relReads = 0;
  return { HL: ctx.HudLayout, rel, strat, tyre, reads: () => relReads, flushFrame, flushTimers };
}

// fitHud's order: HudLayout.fit() (packPhone + schedule) ... the tail HudLayout.clearReadouts().
const fullFit = (t) => { t.HL.fit(); t.HL.clearReadouts(); };

test("an unchanged full fit runs clearReadouts at most twice once rAF and timers flush", () => {
  const t = load();
  fullFit(t);
  // Coalesce (#4636): fit's packPhone only notes; fitHud's tail flushes one body.
  assert.equal(t.reads(), 1, "fitHud's tail flushes the fit coalesce");
  t.flushFrame(); t.flushFrame(); t.flushTimers();
  assert.ok(t.reads() <= 1, `follow-ups re-ran clearReadouts with nothing changed (${t.reads()} passes, was 4)`);
});

test("a readout that unhides between the fit and the follow-up still gets the re-pack", () => {
  const t = load();
  fullFit(t);
  t.strat.hidden = false;   // HudStrategy paints on the first race tick, after fitHud
  t.flushFrame(); t.flushFrame();
  assert.equal(t.reads(), 2, "the double-rAF follow-up packs the unhidden STRATEGY");
  t.flushTimers();
  assert.equal(t.reads(), 2, "the 120 ms pack is redundant once the rAF pack saw the final state");
});

test("text that grows after the rAF follow-up still gets the 120 ms pack", () => {
  const t = load();
  fullFit(t);
  t.flushFrame(); t.flushFrame();
  assert.equal(t.reads(), 1);
  t.rel.textContent = "P3 +0.4 / P4 -1.2 / P5 -2.9";   // RELATIVE gains rows on the 10 Hz tick
  t.flushTimers();
  assert.equal(t.reads(), 2, "the 120 ms follow-up re-packs the grown RELATIVE");
});

test("a fit with no clearReadouts after it keeps the double-rAF pack", () => {
  const t = load();
  t.HL.fit();   // MOVE & SIZE path: no fitHud tail
  t.flushFrame(); t.flushFrame(); t.flushTimers();
  // Coalesce defers fit's clear; rAF flushes once; 120 ms sees nothing new.
  assert.equal(t.reads(), 1, "rAF follow-up flushes the fit coalesce; 120 ms skips");
});
