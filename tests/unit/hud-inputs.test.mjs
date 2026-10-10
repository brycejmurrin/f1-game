/* hud-inputs — the opt-in INPUTS trace's pure core (js/ui/hud-inputs.js): the
   Float32Array ring buffer, the y mappings, a fake-canvas frame that samples
   at a fixed step whatever the frame rate and reads only — and the shell /
   sheet / toggle wiring shared by all three opt-in readouts. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-inputs.js"), "utf8");

function load(extra = {}) {
  const ctx = { console, Float32Array, ...extra };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudInputs = HudInputs;", ctx);
  return ctx.HudInputs;
}

test("ring buffer: oldest-first reads, wraps at capacity, clear", () => {
  const I = load();
  const t = I.createTrace(4);
  for (let i = 1; i <= 3; i++) t.push(i / 10, 0, 0);
  assert.equal(t.count, 3);
  assert.ok(Math.abs(t.get(t.thr, 0) - 0.1) < 1e-6);
  assert.ok(Math.abs(t.get(t.thr, 2) - 0.3) < 1e-6);
  for (let i = 4; i <= 6; i++) t.push(i / 10, 1, -1);
  assert.equal(t.count, 4, "capped");
  assert.deepEqual([0, 1, 2, 3].map((i) => Math.round(t.get(t.thr, i) * 10)), [3, 4, 5, 6]);
  assert.equal(t.get(t.brk, 3), 1);
  assert.equal(t.get(t.str, 3), -1);
  t.clear();
  assert.equal(t.count, 0);
});

test("the window is ~3 s at a fixed step", () => {
  const I = load();
  assert.equal(I.WINDOW_S, 3);
  assert.equal(I.N, Math.round(I.WINDOW_S / I.STEP_S));
});

test("levelY / steerY map into the box and clamp", () => {
  const I = load();
  assert.equal(I.levelY(0, 50, 2), 48);
  assert.equal(I.levelY(1, 50, 2), 2);
  assert.equal(I.levelY(7, 50, 2), 2, "clamped");
  assert.equal(I.steerY(0, 50, 2), 25, "centred");
  assert.equal(I.steerY(1, 50, 2), 2, "right is up");
  assert.equal(I.steerY(-1, 50, 2), 48);
  assert.equal(I.steerY(-9, 50, 2), 48, "clamped");
});

function fakeDom() {
  const calls = { stroke: 0, fillRect: 0 };
  const store = {};
  const ctx2 = new Proxy(store, {
    get: (o, k) => (k in o ? o[k] : (k === "stroke" || k === "fillRect") ? () => { calls[k]++; } : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const cv = { width: 0, height: 0, clientWidth: 128, clientHeight: 48, attrs: {}, getContext: () => ctx2, setAttribute(k, v) { cv.attrs[k] = v; } };
  const root = { hidden: true, style: { getPropertyValue: () => "" } };
  const gear = { textContent: "" };
  const els = { "hud-inputs": root, "hud-inputs-cv": cv, "hud-inputs-gear": gear };
  const doc = { body: { classList: { contains: () => false } }, documentElement: { dataset: {} }, getElementById: (id) => els[id] || null };
  const win = { devicePixelRatio: 2, innerWidth: 800, innerHeight: 400, matchMedia: () => ({ matches: false }) };
  return { doc, win, root, cv, gear, calls };
}

test("frame: off hides; on samples at a fixed step at any fps, sizes for DPR, reads only", () => {
  const d = fakeDom();
  let on = false;
  const I = load({ document: d.doc, window: d.win, HudElements: { isOn: () => on } });
  const p = { throttleDemand: 1, brakeDemand: 0, steerCommand: 0.5, gear: 6 };
  const snap = JSON.stringify(p);
  I.frame({}, p, 16.7);
  assert.equal(d.root.hidden, true);
  on = true;
  // 1 s at 144 fps, then 1 s at 30 fps: the same number of samples (~30 each).
  for (let i = 0; i < 144; i++) I.frame({}, p, 1000 / 144);
  const a = I.trace.count;
  for (let i = 0; i < 30; i++) I.frame({}, p, 1000 / 30);
  const b = I.trace.count - a;
  assert.ok(Math.abs(a - 30) <= 1 && Math.abs(b - 30) <= 1, `fixed-step sampling (${a}, ${b})`);
  assert.equal(d.root.hidden, false);
  assert.equal(d.cv.width, 256, "128 css px at DPR 2");
  assert.equal(d.cv.height, 96);
  assert.equal(d.gear.textContent, "6");
  assert.ok(d.calls.stroke > 0, "the trace was drawn");
  assert.match(d.cv.attrs["aria-label"], /throttle 100%, brake 0%, steering 50% right, gear 6/);
  assert.equal(JSON.stringify(p), snap, "the HUD reads only");
  // A long hitch restarts the window rather than smearing 3 s of one value.
  I.frame({}, p, 5000);
  assert.ok(I.trace.count <= 2);
});

test("reduced motion draws still bars, not a scrolling trace", () => {
  const d = fakeDom();
  d.doc.documentElement.dataset.motion = "reduce";
  const I = load({ document: d.doc, window: d.win, HudElements: { isOn: () => true } });
  const p = { throttleDemand: 0.5, brakeDemand: 0.5, steerCommand: 0, gear: 3 };
  I.frame({}, p, 16.7);
  assert.ok(d.calls.fillRect >= 3, "three bars");
  assert.equal(d.calls.stroke, 1, "only the dashed centre line is stroked");
});

test("shell + sheet + toggles: the opt-in readouts are wired without class tokens", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  const els = fs.readFileSync(path.join(ROOT, "js/ui/hud-elements.js"), "utf8");
  const lay = fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");
  const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  for (const id of ["hud-rel", "hud-strat", "hud-inputs"]) {
    assert.match(html, new RegExp(`<div id="${id}"[^>]*\\bhidden\\b`), id + " ships hidden");
    assert.match(lay, new RegExp(`"#${id}"`), id + " is movable");
  }
  assert.match(html, /<canvas id="hud-inputs-cv"[^>]*role="img"[^>]*aria-label=/);
  for (const k of ["rel", "strat", "inputs"]) {
    assert.match(els, new RegExp(`\\["${k}", "[A-Z]+", "off"\\]`), k + " is opt-in");
    assert.match(css, new RegExp(`body\\[data-hud-hide~="${k}"\\]`));
  }
  assert.match(css, /body\.hud-prof-minimal :is\(#hud-rel, #hud-strat, #hud-inputs\)/);
  assert.match(css, /body\.hud-bcam :is\(#hud-rel, #hud-strat, #hud-inputs\)/);
  for (const g of ["HudRelative.tick", "HudStrategy.tick", "HudInputs.frame"]) assert.ok(hud.includes(g), g + " is called by GameHud");
  assert.doesNotMatch(SRC, /curvature|kCur|Tracks\./);
});

// TOUCH HOME: INPUTS ships under the sector box (css/hud.css). #hud-sectors /
// #hud-limits clear PAUSE via (8px + tap-hud + 4px + sat) / --hud-z. Omitting
// tap-hud + 4px puts the trace ~44px up into S1–S3 at touch --tap 52
// (12 − 56 = −44 at z=1). The rule's own comment says "Same shape as #hud-limits".
test("touch INPUTS home clears PAUSE/CAM like #hud-limits (not through the sector strip)", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  const touch = css.match(/body:not\(\.desktop\) #hud-inputs:not\(\[data-hl-user\]\)\s*\{([^}]+)\}/);
  assert.ok(touch, "touch #hud-inputs home rule exists");
  const top = touch[1].match(/top:\s*([^;]+);/);
  assert.ok(top, "touch INPUTS sets top");
  assert.match(top[1], /var\(--tap-hud\)/, "PAUSE/CAM stack (tap-hud) must be in the top calc");
  assert.match(top[1], /var\(--hud-sec-h/, "sector-box height keeps the trace under S3");
  // Anchor on the position:fixed home (not body.hud-bcam #hud-limits { display }).
  const limTop = css.match(/#hud-limits\s*\{\s*position:\s*fixed;[\s\S]*?top:\s*([^;]+);/);
  assert.ok(limTop, "#hud-limits home top exists");
  // Same pause clearance prefix as limits; gap under the box may differ.
  const pauseStack = /\(8px \+ var\(--tap-hud\) \+ 4px \+ var\(--sat\)\) \/ var\(--hud-z\)/;
  assert.match(limTop[1], pauseStack, "limits pin (control)");
  // INPUTS zooms by --hud-z-bot but --hud-sec-h is in TOP-band units: the sector box is scaled by --hud-z-top
  // INSIDE the one calc, then the whole inset is divided by this element's zoom.
  assert.match(top[1], /^calc\(\(8px \+ var\(--tap-hud\) \+ 4px \+ var\(--sat\) \+ var\(--hud-sec-h, 4\.8em\) \* var\(--hud-z-top, var\(--hud-scale, 1\)\) \+ 16px\) \/ var\(--hud-z\)\)$/,
    "inputs share limits' pause/cam stack, with the sector box in top-band zoom");
});
