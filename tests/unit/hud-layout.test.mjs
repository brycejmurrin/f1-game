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
  assert.deepEqual(JSON.parse(JSON.stringify(written.hudLayout)), { v: 1, cockpit: {}, other: { map: { x: 5, y: 0, s: 150 } } });
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

test("module has no Tracks / curvature reads", () => {
  assert.doesNotMatch(SRC, /\bTracks\b|\bcurvature\b/);
});
