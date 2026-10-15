/* Phone HUD dock packing uses the same dock/fixed-obstacle domain as the runtime collector.
   Optional readout placement belongs to clearReadouts, not this packer. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CAMG = fs.readFileSync(path.join(ROOT, "js/camera/cam-groups.js"), "utf8");
const HL_SRC = CAMG + "\n" + fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");
const DL_SRC = fs.readFileSync(path.join(ROOT, "js/ui/dock-layout.js"), "utf8");

function loadHudLayout() {
  const ctx = {
    console, Math, Object, Number, Array, Map, Infinity, NaN, isFinite,
    document: undefined, window: undefined, GameStore: undefined,
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
  };
  vm.createContext(ctx);
  // IIFE uses `const HudLayout` / `const CamGroups` — promote to context globals.
  vm.runInContext(HL_SRC.replace(/^const\b/gm, "var") + "; this.HudLayout = HudLayout; this.CamGroups = CamGroups;", ctx);
  return ctx.HudLayout;
}

function loadDockLayout() {
  const ctx = {
    console, Math, Object, Number, Array, isFinite,
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    window: { innerWidth: 400, innerHeight: 800 },
    document: { documentElement: {} },
    getComputedStyle() { return { getPropertyValue() { return "0"; } }; },
    GameHud: undefined,
  };
  vm.createContext(ctx);
  ctx.document.createElement = () => ({ style: {}, getBoundingClientRect: () => ({ width: 200 }) });
  ctx.document.documentElement.appendChild = () => {};
  ctx.document.documentElement.removeChild = () => {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/css-zoom.js"), "utf8"), ctx);
  ctx.CssZoom = ctx.window.CssZoom;
  vm.runInContext(DL_SRC.replace(/^const\b/gm, "var"), ctx);
  return ctx.DockLayout;
}

test("clampXY keeps a dock between its safe-area home and MAX (no offset parks it past the edge)", () => {
  const DL = loadDockLayout();
  assert.ok(DL && DL.clampXY, "DockLayout exports clampXY");
  // The REPOSITION drag is the only writer; a negative share translated the dock up to 0.35 x the pad past the
  // screen edge or under the home bar (HUD review 2026-10-14). The home is already the safe-area edge.
  const neg = DL.clampXY({ x: -0.12, y: -0.2 });
  assert.equal(neg.x, 0, "outboard past the home edge clips to the home");
  assert.equal(neg.y, 0, "below the home bar clips to the home");
  const clipped = DL.clampXY({ x: -2, y: 2 });
  assert.equal(clipped.x, 0);
  assert.equal(clipped.y, DL.MAX);
});

test("HudLayout exports packPhoneRects for the 150% phone packer", () => {
  const HL = loadHudLayout();
  assert.equal(typeof HL.packPhoneRects, "function",
    "packPhoneRects must be exported so the 150% packer is unit-testable");
});

test("dock packing lifts TYRES clear of BRAKE without moving the control", () => {
  const HL = loadHudLayout(), W = 844, H = 390;
  const tyre = { id: "tyre", x: 100, y: 260, w: 80, h: 45 };
  const brake = { id: "ctrl:brake", x: 100, y: 280, w: 80, h: 80 };
  const boxes = [tyre, brake], snapshot = JSON.stringify(boxes);
  const corr = HL.packPhoneRects(boxes, W, H);
  assert.equal(corr[brake.id], undefined, "touch targets never move");
  assert.ok(tyre.y + corr.tyre.dy + tyre.h <= brake.y - HL.PACK_AIR);
  assert.equal(JSON.stringify(boxes), snapshot, "measurements are read-only");
});

test("later dock pieces yield to earlier dock pieces", () => {
  const HL = loadHudLayout();
  const tyre = { id: "tyre", x: 300, y: 280, w: 80, h: 45 };
  const gear = { id: "gearbox", x: 300, y: 260, w: 80, h: 45 };
  const corr = HL.packPhoneRects([gear, tyre], 844, 390);
  assert.equal(corr.tyre, undefined, "TYRES keeps its priority independent of input order");
  assert.ok(gear.y + corr.gearbox.dy >= tyre.y + tyre.h + HL.PACK_AIR);
});

test("portrait keeps the dock planted even when a touch target overlaps it", () => {
  const HL = loadHudLayout();
  const corr = HL.packPhoneRects([
    { id: "tyre", x: 20, y: 650, w: 100, h: 40 },
    { id: "ctrl:brake", x: 20, y: 650, w: 90, h: 90 },
  ], 390, 844);
  assert.equal(Object.keys(corr).length, 0, "moving portrait margins previously pushed TYRES off-screen");
});

test("fixed plates stay put and an empty or invalid measure emits no corrections", () => {
  const HL = loadHudLayout();
  const fixed = ["map", "tower", "announce", "flag"].map(id => ({ id, x: 50, y: 50, w: 100, h: 50 }));
  assert.equal(Object.keys(HL.packPhoneRects(fixed, 844, 390)).length, 0);
  for (const [boxes, W, H] of [[[], 844, 390], [fixed, 0, 390], [fixed, 844, 0]]) {
    assert.equal(Object.keys(HL.packPhoneRects(boxes, W, H)).length, 0);
  }
});
