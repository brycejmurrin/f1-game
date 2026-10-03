/* hud-tyres — cold/ok/hot temperature state painted on the compound letter. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-tyres.js"), "utf8");

function load() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudTyres = HudTyres;", ctx);
  return ctx.HudTyres;
}

test("band: cold below window, hot above, ok inside", () => {
  const H = load();
  assert.equal(H.band(70, 90, 15), "cold");
  assert.equal(H.band(90, 90, 15), "ok");
  assert.equal(H.band(105, 90, 15), "hot");
});

test("state: reads TyreModel.info; missing temp reads ok", () => {
  const H = load();
  assert.equal(H.state({ tempS: 60, tempOpt: 90, tempWindow: 15 }), "cold");
  assert.equal(H.state({ tempS: 92, tempOpt: 90, tempWindow: 15 }), "ok");
  assert.equal(H.state({ tempS: 110, tempOpt: 90 }), "hot");
  assert.equal(H.state(null), "ok");
  assert.equal(H.state({ tempOpt: 90 }), "ok");
});

test("paint: writes data-temp on the tyre widget, no child nodes", () => {
  const H = load();
  const el = { dataset: {} };
  assert.equal(H.paint(el, { tempS: 60, tempOpt: 90, tempWindow: 15 }), true);
  assert.equal(el.dataset.temp, "cold");
  H.paint(el, { tempS: 110, tempOpt: 90, tempWindow: 15 });
  assert.equal(el.dataset.temp, "hot");
  assert.equal(H.paint(null, {}), false);
  assert.doesNotMatch(SRC, /createElement|appendChild/);
});



test("label: compound, heat, laps left in words; ok heat is silent", () => {
  const H = load();
  assert.equal(H.label("M", "cold", 5.2, 0.3), "Medium tyres, cold, about 5 laps left");
  assert.equal(H.label("S", "ok", 1, 0.9), "Soft tyres, about 1 lap left");
  assert.equal(H.label("H", "hot", null, 1.2), "Hard tyres, hot, worn out");
  assert.equal(H.label("W", "ok", null, 0), "Wet tyres");
});

test("paint with extra writes the aria-label, plan appended", () => {
  const H = load();
  const attrs = {};
  const el = { dataset: {}, setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null };
  H.paint(el, { tempS: 60, tempOpt: 90, tempWindow: 15 }, { code: "M", lapsLeft: 5, spent: 0.2, plan: "BOX L12" });
  assert.equal(attrs["aria-label"], "Medium tyres, cold, about 5 laps left, BOX L12");
});

test("CSS: cold/hot carry a glyph after the letter, not colour alone", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /#hud-tyre\[data-temp="cold"\] #hud-tyre-code::after \{ content: "\\2744"/);
  assert.match(css, /#hud-tyre\[data-temp="hot"\] #hud-tyre-code::after \{ content: "\\25B2"/);
  const shell = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(shell, /<div id="hud-tyre" role="img" aria-label="Tyres" hidden>/);
});

test("module has no Tracks / curvature / kCur reads", () => {
  assert.doesNotMatch(SRC, /\bTracks\b/);
  assert.doesNotMatch(SRC, /\bcurvature\b/);
  assert.doesNotMatch(SRC, /\bkCur\b/);
});
