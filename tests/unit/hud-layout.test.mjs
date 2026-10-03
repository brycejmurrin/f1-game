/* hud-layout — per-element HUD move/size store, cockpit vs other layouts, and
   the --hl-* / data-hl paint the css/hud.css rule reads. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");

test("broadcast layout probe waits for camera and published tower height, not collision results", () => {
  const spec=fs.readFileSync(path.join(ROOT,"tests/specs/hud-layout.spec.js"),"utf8");
  const predicate=spec.match(/await page\.waitForFunction\((\(broadcastCamera\) => \{[\s\S]*?\n    \}), o\.cam/);
  assert.ok(predicate,"the broadcast helper carries its bounded input-readiness predicate");
  let broadcast=false, published="", height=132.04, zoom=2;
  const ctx=vm.createContext({document:{
    body:{classList:{contains:()=>broadcast}},
    querySelector:(selector)=>{
      if (selector!==".hud-top") return null;
      return {currentCSSZoom:zoom,getBoundingClientRect:()=>({height,top:8,bottom:8+height})};
    },
    documentElement:{style:{getPropertyValue:()=>published}},
  }, getComputedStyle:()=>({display:"block",visibility:"visible"})});
  const ready=vm.runInContext("("+predicate[1]+")",ctx);
  assert.equal(ready(true),false,"camera class has not caught up");
  broadcast=true; assert.equal(ready(true),false,"height is not published yet");
  published="0px"; assert.equal(ready(true),false,"initial zero height is stale");
  published="40px"; assert.equal(ready(true),false,"old tower height is stale");
  published="66.0px"; assert.equal(ready(true),true,"own units honor zoom and toFixed(1) rounding");
  // fitHud re-publishes --hud-top-h AFTER writing --hud-z-top so a zoom cap
  // in the same pass cannot leave the wait 0.1px behind.
  const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  const fit = hud.slice(hud.indexOf("function fitHud("), hud.indexOf("function paintInstruments"));
  assert.match(fit, /if \(key === _fitKey && !force && --_fitWait > 0\) return/,
    "refreshHud(true) must re-fit, not sit in the 3 s same-key backoff");
  const zTop = fit.indexOf('set("--hud-z-top"');
  const republish = fit.indexOf('hStyle(root, "--hud-top-h"', zTop);
  assert.ok(zTop >= 0 && republish > zTop, "--hud-top-h must be published after the top zoom cap");
  height=0; published="0px"; assert.equal(ready(true),false,"hidden tower is not ready");
  height=132; zoom=1; published="132px"; assert.equal(ready(true),true);
  const towerEl = {currentCSSZoom:1,getBoundingClientRect:()=>({height:132,top:8,bottom:140})};
  const mapEl = {hidden:false,getBoundingClientRect:()=>({width:40,height:40,top:8,bottom:48})};
  ctx.document.querySelector = (selector) => selector === ".hud-top" ? towerEl
    : selector === "#minimap" ? mapEl : null;
  ctx.getComputedStyle = () => ({ display: "block", visibility: "visible" });
  assert.equal(ready(true), false, "a visible map still on the tower is not stacked yet");
  mapEl.getBoundingClientRect = () => ({ width: 40, height: 40, top: 140, bottom: 180 });
  assert.equal(ready(true), true, "map below the tower has consumed --hud-top-h");
});

function fakeEl() {
  const props = {}, attrs = {};
  return {
    props, attrs,
    style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
  };
}

function load(stored = {}) {
  const written = Object.assign({}, stored);
  const els = {};
  const doc = {
    readyState: "complete",
    getElementById: () => null,
    querySelector: (sel) => (els[sel] || (els[sel] = fakeEl())),
    addEventListener() {},
  };
  const ctx = {
    console,
    document: doc,
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  return { H: ctx.HudLayout, written, els };
}

test("untouched: nothing stored, no element carries data-hl", () => {
  const { H, written, els } = load();
  assert.equal(H.isShipped(), true);
  assert.equal(written.hudLayout, undefined);
  for (const [, , sel] of H.ELEMENTS) assert.equal("data-hl" in els[sel].attrs, false, sel);
});

test("set writes only moved elements and paints --hl-* on that element", () => {
  const { H, written, els } = load();
  const e = H.set("map", { x: 5, s: 150 }, "other");
  assert.deepEqual({ ...e }, { x: 5, y: 0, s: 150 });
  assert.deepEqual(JSON.parse(JSON.stringify(written.hudLayout)), { v: 2, cockpit: {}, other: { map: { x: 5, y: 0, s: 150 } } });
  const m = els["#minimap"];
  assert.equal(m.attrs["data-hl"], "");
  assert.equal(m.props["--hl-x"], "5");
  assert.equal(m.props["--hl-s"], "1.5");
  assert.equal(m.props["--hl-o"], "top left");
  assert.equal("data-hl" in els[".hud-top"].attrs, false);
});

test("values clamp; back to shipped clears the element and the store", () => {
  const { H, written, els } = load();
  assert.deepEqual({ ...H.set("tower", { x: 999, y: -999, s: 10 }, "other") }, { x: 50, y: -50, s: 50 });
  H.resetEl("tower", "other");
  assert.equal(written.hudLayout, null);
  assert.equal("data-hl" in els[".hud-top"].attrs, false);
  assert.equal(els[".hud-top"].props["--hl-x"], undefined);
});

test("cockpit and other cameras keep separate layouts; setCam swaps them", () => {
  const { H, els } = load({ hudLayout: { v: 1, cockpit: { tyre: { x: -30, y: 0, s: 100 } }, other: {} } });
  assert.equal(H.camSet("cockpit"), "cockpit");
  assert.equal(H.camSet("visor"), "cockpit");
  assert.equal(H.camSet("chase"), "other");
  assert.equal("data-hl" in els["#hud-tyre"].attrs, false, "chase layout shows by default");
  H.setCam("cockpit");
  assert.equal(els["#hud-tyre"].props["--hl-x"], "-30");
  H.setCam("chase");
  assert.equal("data-hl" in els["#hud-tyre"].attrs, false);
  assert.equal(H.isShipped("other"), true);
  assert.equal(H.isShipped("cockpit"), false);
});

test("junk in the store reads as shipped", () => {
  const { H } = load({ hudLayout: { cockpit: { nope: { x: 3 }, map: "x" }, other: 7 } });
  assert.equal(H.isShipped(), true);
  assert.equal(H.scaleOf("map"), 1);
});

test("css/hud.css reads the tokens through one data-hl rule, compensated for band zoom", () => {
  const m = CSS.match(/\[data-hl\]\s*\{([^}]*)\}/);
  assert.ok(m, "a [data-hl] rule exists");
  assert.match(m[1], /translate:[^;]*--hl-x[^;]*--hud-z[^;]*--hl-y/);
  assert.match(m[1], /scale:\s*var\(--hl-s/);
  assert.match(m[1], /transform-origin:\s*var\(--hl-o/);
});

const plain = (o) => JSON.parse(JSON.stringify(o));
const TD = fs.readFileSync(path.join(ROOT, "css/track-detail.css"), "utf8");

test("cockpit ships a default strip beside the wheel; other ships zero", () => {
  const { H, written, els } = load();
  assert.equal(H.isShipped(), true);
  assert.deepEqual(Object.keys(H.SHIPPED.other), []);
  for (const id of ["ot", "aero", "energy", "tyre"]) {
    const e = H.get(id, "cockpit");
    assert.ok(Math.abs(e.x) >= 25, id + " clears the wheel's middle 40%");
    assert.deepEqual(plain(H.get(id, "other")), { x: 0, y: 0, s: 100 });
  }
  assert.ok(H.get("ot", "cockpit").x > 0 && H.get("energy", "cockpit").x < 0, "OT right, ENERGY left");
  assert.deepEqual(plain(H.get("gearbox", "cockpit")), { x: 0, y: 0, s: 100 });
  assert.equal("data-hl" in els["#hud-ot"].attrs, false, "chase: nothing painted");
  H.setCam("cockpit");
  assert.equal(els["#hud-ot"].props["--hl-x"], String(H.SHIPPED.cockpit.ot.x));
  assert.equal("data-hl" in els["#hud-gearbox"].attrs, false);
  assert.equal(written.hudLayout, undefined, "the default is not written to the store");
});

test("stored offsets override the cockpit default; reset returns to the default, not zero", () => {
  const { H, written } = load();
  H.set("ot", { y: 0 }, "cockpit");
  assert.deepEqual(plain(H.get("ot", "cockpit")), { x: H.SHIPPED.cockpit.ot.x, y: 0, s: 100 });
  assert.equal(H.isShipped("cockpit"), false);
  H.set("aero", { x: 0, y: 0 }, "cockpit");   // back to zero is a real choice in the cockpit
  assert.deepEqual(plain(written.hudLayout.cockpit.aero), { x: 0, y: 0, s: 100 });
  H.resetEl("ot", "cockpit");
  assert.deepEqual(plain(H.get("ot", "cockpit")), plain(H.SHIPPED.cockpit.ot));
  H.resetSet("cockpit");
  assert.equal(written.hudLayout, null);
  assert.deepEqual(plain(H.get("aero", "cockpit")), plain(H.SHIPPED.cockpit.aero));
  H.set("tyre", plain(H.SHIPPED.cockpit.tyre), "cockpit");
  assert.equal(written.hudLayout, null, "writing the default stores nothing");
});

test("v1 store migrates: its values kept, missing cockpit elements take the default, saves as v2", () => {
  const { H, written } = load({ hudLayout: { v: 1, cockpit: { tyre: { x: -10, y: 0, s: 120 } }, other: { map: { x: 2, y: 0, s: 100 } } } });
  assert.deepEqual(plain(H.get("tyre", "cockpit")), { x: -10, y: 0, s: 120 });
  assert.deepEqual(plain(H.get("ot", "cockpit")), plain(H.SHIPPED.cockpit.ot));
  assert.deepEqual(plain(H.get("map", "other")), { x: 2, y: 0, s: 100 });
  H.set("map", { s: 110 }, "other");
  assert.equal(written.hudLayout.v, 2);
  assert.deepEqual(plain(written.hudLayout.cockpit), { tyre: { x: -10, y: 0, s: 120 } });
});

test("presets are pure data laid over the set's shipped layout", () => {
  const { H } = load();
  assert.deepEqual(plain(H.PRESETS.map((p) => p[0])), ["shipped", "clean", "big", "corners"]);
  const ids = H.ELEMENTS.map((e) => e[0]);
  for (const [, , els] of H.PRESETS) for (const id in els) assert.ok(ids.includes(id), id);
  const c = H.presetLayout("clean", "cockpit");
  assert.equal(c.tower.s, 85);
  assert.equal(c.ot.s, 90);
  assert.equal(c.ot.x, H.SHIPPED.cockpit.ot.x, "CLEAN keeps the cockpit strip beside the wheel");
  assert.equal(H.presetLayout("clean", "other").ot.x, 0);
  assert.equal(H.presetLayout("big", "other").gearbox.s, 125);
  assert.equal(H.presetLayout("nope", "other"), null);
});

test("apply a preset to the edited set, tweak it, CUSTOM detection", () => {
  const { H, written } = load();
  assert.equal(H.presetOf("other"), "shipped");
  assert.equal(H.presetOf("cockpit"), "shipped");
  assert.equal(H.applyPreset("big", "other"), true);
  assert.equal(H.presetOf("other"), "big");
  assert.equal(H.presetOf("cockpit"), "shipped", "only the edited set changes");
  assert.deepEqual(plain(written.hudLayout.cockpit), {});
  assert.equal(H.get("tower", "other").s, 125);
  H.set("tower", { s: 130 }, "other");
  assert.equal(H.presetOf("other"), "custom");
  H.applyPreset("corners", "cockpit");
  assert.equal(H.presetOf("cockpit"), "corners");
  assert.equal(H.get("energy", "cockpit").x, -34);
  assert.equal(H.get("ot", "cockpit").x, H.SHIPPED.cockpit.ot.x);
  H.applyPreset("shipped", "cockpit");
  H.applyPreset("shipped", "other");
  assert.equal(written.hudLayout, null);
});

test("css/track-detail.css: cockpit hides only speed/gear, not the OT/AERO/ENERGY strip", () => {
  const hide = TD.match(/((?:body\.cockpit-cam #[\w-]+,?\s*)+)\{\s*display:\s*none/);
  assert.ok(hide, "the cockpit hide rule exists");
  assert.match(hide[1], /#hud-gearbox/);
  assert.match(hide[1], /#hud-speed/);
  for (const id of ["hud-ot", "hud-aero", "hud-energy", "hud-tyre"]) assert.doesNotMatch(hide[1], new RegExp("#" + id + "\\b"));
});

test("module has no Tracks / curvature reads", () => {
  assert.doesNotMatch(SRC, /\bTracks\b|\bcurvature\b/);
});

test("fit pulls a moved piece back on screen without touching the stored offset", () => {
  const src = SRC;
  const props = {}, attrs = { "data-hl": "" };
  const el = {
    style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
    // 100px wide map at x=5 vw on a 1000px screen, pushed 60 px past the right edge.
    getBoundingClientRect() { const x = parseFloat(props["--hl-x"] || 0) * 10; return { left: 900 + x - 50, right: 1000 + x - 50 + 60, top: 10, bottom: 110, width: 160, height: 100 }; },
  };
  const written = { hudLayout: { v: 2, cockpit: {}, other: { map: { x: 5, y: 0, s: 100 } } } };
  const ctx = {
    console, window: { innerWidth: 1000, innerHeight: 600 },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {},
      querySelector: (sel) => (sel === "#minimap" ? el : { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false }) },
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(src + "; this.HudLayout = HudLayout;", ctx);
  ctx.HudLayout.fit();
  const r = el.getBoundingClientRect();
  assert.ok(r.right <= 1000 - 4 + 1e-6, "right edge inside the screen: " + r.right);
  assert.equal(ctx.HudLayout.get("map", "other").x, 5, "stored offset unchanged");
});
