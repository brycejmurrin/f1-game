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

test("dock packing resolves overlaps within the available viewport, not behind its edges", () => {
  const HL = loadHudLayout(), bounds = { left: 50, top: 20, right: 280, bottom: 180 };
  const boxes = [
    { id: 'tyre', x: 360, y: 100, w: 80, h: 40 },
    { id: 'gearbox', x: 260, y: 90, w: 60, h: 30 },
    { id: 'ctrl:brake', x: 250, y: 100, w: 30, h: 50, fixed: 1 },
  ];
  const corrections = HL.packPhoneRects(boxes, 480, 240, bounds);
  const placed = boxes.map(b => ({ ...b, x: b.x + (corrections[b.id]?.dx || 0), y: b.y + (corrections[b.id]?.dy || 0) }));
  for (const b of placed.filter(b => !b.fixed)) {
    assert.ok(b.x >= bounds.left && b.y >= bounds.top && b.x+b.w <= bounds.right && b.y+b.h <= bounds.bottom, JSON.stringify(b));
    const control = placed.at(-1);
    assert.ok(b.x+b.w <= control.x || b.x >= control.x+control.w || b.y+b.h <= control.y || b.y >= control.y+control.h, 'instrument clears the control');
  }
  assert.equal(corrections['ctrl:brake'], undefined, 'hardware controls remain fixed');
});

test("runtime phone packing respects visible bounds even for an unedited instrument", () => {
  const props = {}, attrs = {}, root = {};
  const tyre = { style: {setProperty(k,v){props[k]=v;},removeProperty(k){delete props[k];}},
    setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},hasAttribute:k=>k in attrs,
    getBoundingClientRect(){const left=330+parseFloat(props['margin-left']||0),top=100+parseFloat(props['margin-top']||0);return {left,top,right:left+70,bottom:top+30,width:70,height:30};} };
  const control = { getBoundingClientRect:()=>({left:245,top:100,right:275,bottom:140,width:30,height:40}) };
  const ctx = {console,window:{innerWidth:480,innerHeight:240,visualViewport:{offsetLeft:80,offsetTop:20,width:220,height:180}},
    getComputedStyle:el=>el===root?{getPropertyValue:k=>({'--sal':'60px','--sar':'20px','--hud-scale':'1.5'}[k]||'0px')}:{display:'block',visibility:'visible',zoom:'1'},
    document:{readyState:'loading',documentElement:root,addEventListener(){},getElementById:()=>null,
      body:{classList:{contains:()=>false}},querySelector:sel=>sel==='#hud-tyre'?tyre:null,querySelectorAll:()=>[control]},
    GameStore:{store:{get:(k,d)=>k==='hudScale'?150:d,set(){throw new Error('packing must not save');}}}};
  vm.createContext(ctx);vm.runInContext(HL_SRC+';this.HudLayout=HudLayout;',ctx);
  ctx.HudLayout.fit();
  const r=tyre.getBoundingClientRect(),b=ctx.HudLayout.screenBounds();
  assert.ok(r.left>=b.left && r.top>=b.top && r.right<=b.right && r.bottom<=b.bottom,JSON.stringify({r,b}));
  const before={...props};ctx.HudLayout.fit();assert.deepEqual(props,before,'packing remains stable');
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
