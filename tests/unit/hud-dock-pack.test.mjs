/* hud-dock-pack — phone HUD SIZE 150% left-column + docked-dash packing.
   Pins: (1) DockLayout.clampXY keeps a dock between its safe-area home and MAX (a negative share parked it off screen);
   (2) HudLayout.packPhoneRects clears the measured 844×390 / 932×430 / 390×844
   clash shapes from the q2 before-survey (tyre×rel/strat, strat×announce,
   gearbox×strat, sectors×inputs) without moving announce. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { analyzeOverlap, overlapArea } from "../../tools/lib/hud-geometry.mjs";

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

const box = (key, role, x, y, w, h) => ({
  key, role, visible: true, exists: true,
  x, y, r: x + w, b: y + h, w, h,
  round: false, cx: x + w / 2, cy: y + h / 2, rr: w / 2, contains: [],
});

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

test("packPhoneRects clears the measured 844×390 @150% left-column / dock clashes", () => {
  const HL = loadHudLayout();
  // From artifacts/hud-survey/q2-before/844 (chase tilt HUD 150%), plus the
  // steer discs that cap how far TYRES can fall.
  const W = 844, H = 390;
  const before = [
    { id: "map", x: 56.4, y: 7.5, w: 103.1, h: 103.1 },
    { id: "announce", x: 230, y: 127.4, w: 223.3, h: 43.3 },
    { id: "rel", x: 56.4, y: 159.7, w: 124.9, h: 51 },
    { id: "strat", x: 204.4, y: 159.7, w: 85, h: 62.8 },
    { id: "tyre", x: 59, y: 190.8, w: 179.9, h: 63.5 },
    { id: "gearbox", x: 249, y: 220.3, w: 145.9, h: 83.8 },
    { id: "ctrl:steerL", x: 59, y: 265.3, w: 82.9, h: 82.9, fixed: 1 },
    { id: "ctrl:steerR", x: 148.1, y: 265.3, w: 82.9, h: 82.9, fixed: 1 },
  ];
  const pile = analyzeOverlap([
    box("announce", "hud", 230, 127.4, 223.3, 43.3),
    box("strat", "hud", 204.4, 159.7, 85, 62.8),
    box("tyre", "hud", 59, 190.8, 179.9, 63.5),
    box("rel", "hud", 56.4, 159.7, 124.9, 51),
    box("gearbox", "hud", 249, 220.3, 145.9, 83.8),
  ], W, H, { sal: 47, sar: 47, sat: 0, sab: 21 });
  assert.ok(pile.hudClash.length >= 3, "before shape has the measured left-column clashes");

  const corr = HL.packPhoneRects(before, W, H);
  assert.ok(corr && typeof corr === "object", "packer returns a correction map");
  assert.equal(corr.announce, undefined, "announce is not moved (queue-1 owns its stack)");

  const applied = before.filter((b) => String(b.id).indexOf("ctrl:") !== 0).map((b) => {
    const c = corr[b.id] || { dx: 0, dy: 0 };
    return box(b.id, "hud", b.x + c.dx, b.y + c.dy, b.w, b.h);
  });
  const after = analyzeOverlap(applied, W, H, { sal: 47, sar: 47, sat: 0, sab: 21 });
  const leftHits = after.hudClash.filter((p) =>
    /strat|tyre|rel|gearbox|announce/.test(p));
  assert.deepEqual(leftHits, [], "packed 844×390 left column + dock has no strat/tyre/rel/gearbox clashes: " + leftHits.join(","));
  // Negative corrections are legitimate (slide toward the home edge / up).
  const anyNeg = Object.values(corr).some((c) => c.dx < 0 || c.dy < 0);
  assert.ok(anyNeg || Object.keys(corr).length > 0, "packer emitted at least one correction");
});

test("packPhoneRects clears 932×430 and portrait 390×844 measured clash classes", () => {
  const HL = loadHudLayout();
  // 932×430: announce×strat, tyre×strat.
  const maxBoxes = [
    { id: "announce", x: 288.6, y: 127.4, w: 247.2, h: 43.5 },
    { id: "strat", x: 217.1, y: 160.3, w: 85.4, h: 63 },
    { id: "tyre", x: 71, y: 215.5, w: 195, h: 68.3 },
    { id: "rel", x: 68.4, y: 160.3, w: 125.4, h: 51.1 },
  ];
  const maxCorr = HL.packPhoneRects(maxBoxes, 932, 430);
  assert.equal(maxCorr.announce, undefined);
  const maxApplied = maxBoxes.map((b) => {
    const c = maxCorr[b.id] || { dx: 0, dy: 0 };
    return box(b.id, "hud", b.x + c.dx, b.y + c.dy, b.w, b.h);
  });
  const maxAfter = analyzeOverlap(maxApplied, 932, 430, { sal: 59, sar: 59, sat: 0, sab: 21 });
  assert.deepEqual(maxAfter.hudClash.filter((p) => /strat|tyre|announce/.test(p)), [],
    "932×430 packed: " + maxAfter.hudClash.join(","));

  // Portrait: sectors×inputs, announce×strat (nudge strat/sectors/inputs only).
  const porBoxes = [
    { id: "announce", x: 103.9, y: 174.5, w: 182.3, h: 32 },
    { id: "strat", x: 104.7, y: 169.5, w: 61.2, h: 43 },
    { id: "sectors", x: 254.4, y: 151, w: 31.6, h: 42.8 },
    { id: "inputs", x: 232.6, y: 177.8, w: 53.5, h: 23.6 },
    { id: "flag", x: 137.5, y: 150.8, w: 115, h: 22.5 },
  ];
  const porCorr = HL.packPhoneRects(porBoxes, 390, 844);
  assert.equal(porCorr.announce, undefined);
  assert.equal(porCorr.flag, undefined, "flag stays put (status stack)");
  const porApplied = porBoxes.map((b) => {
    const c = porCorr[b.id] || { dx: 0, dy: 0 };
    return box(b.id, "hud", b.x + c.dx, b.y + c.dy, b.w, b.h);
  });
  const porAfter = analyzeOverlap(porApplied, 390, 844, { sal: 0, sar: 0, sat: 47, sab: 34 });
  const porHits = porAfter.hudClash.filter((p) =>
    /strat|sectors|inputs|announce|flag/.test(p));
  assert.deepEqual(porHits, [], "portrait packed: " + porHits.join(","));
  assert.ok(overlapArea == null || true);
});

test("packPhoneRects drops LIMITS under the CI 96c3536 broadcast phoneL @150% flag", () => {
  const HL = loadHudLayout();
  const W = 844, H = 390;
  // Exact boxes from ship CI run 38604722503 (flag+limits).
  const before = [
    { id: "flag", x: 309.671875, y: 166.046875, w: 224.65625, h: 40.375 },
    { id: "limits", x: 468.5625, y: 197.6875, w: 157.296875, h: 31.1875 },
    { id: "map", x: 62, y: 98.25, w: 165, h: 165 },
    { id: "tyre", x: 60.796875, y: 265.28125, w: 179.515625, h: 16.015625 },
    { id: "rel", x: 205.9375, y: 291.296875, w: 201.671875, h: 17.84375 },
  ];
  assert.ok(overlapArea(
    box("flag", "hud", before[0].x, before[0].y, before[0].w, before[0].h),
    box("limits", "hud", before[1].x, before[1].y, before[1].w, before[1].h),
  ) > 200, "CI shape is a real flag×limits overlap");
  const corr = HL.packPhoneRects(before, W, H);
  assert.equal(corr.flag, undefined, "flag stays put (status stack)");
  assert.ok(corr.limits && corr.limits.dy > 4, "LIMITS is pushed below the flag: " + JSON.stringify(corr.limits));
  const applied = before.map((b) => {
    const c = corr[b.id] || { dx: 0, dy: 0 };
    return box(b.id, "hud", b.x + c.dx, b.y + c.dy, b.w, b.h);
  });
  const after = analyzeOverlap(applied, W, H, { sal: 47, sar: 47, sat: 0, sab: 21 });
  const hits = after.hudClash.filter((p) => p.includes("flag") && p.includes("limits"));
  assert.deepEqual(hits, [], "packed CI boxes: " + after.hudClash.join(","));
});
