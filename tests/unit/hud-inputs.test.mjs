/* hud-inputs — the opt-in INPUTS trace's pure core (js/ui/hud-inputs.js): the
   Float32Array ring buffer, the y mappings, a fake-canvas frame that samples
   at a fixed step whatever the frame rate and reads only — and the shell /
   sheet / toggle wiring shared by all three opt-in readouts. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
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
  assert.match(top[1], pauseStack, "inputs must share limits' pause/cam stack");
});


test("input history starts fresh after every suppressed mode, off, player change and session reset", () => {
  const d = fakeDom(), modes = new Set(); let on = true;
  d.doc.body.classList.contains = (s) => modes.has(s);
  const I = load({document:d.doc,window:d.win,HudElements:{isOn:()=>on}});
  let p = {throttleDemand:1,brakeDemand:0,steerCommand:0.5,gear:4,lap:2};
  for (const mode of ["hud-prof-minimal","hud-bcam","bc-on"]) {
    for(let i=0;i<90;i++)I.frame({},p,1000/30);
    modes.add(mode);for(let i=0;i<120;i++)I.frame({},p,1000/30);
    assert.equal(I.trace.count,0);modes.clear();p.throttleDemand=0;I.frame({},p,1000/30);
    assert.deepEqual(Array.from(I.snapshot().samples,(x)=>x.throttle),[0]);p.throttleDemand=1;
  }
  on=false;I.frame({},p,1000/30);assert.equal(I.trace.count,0);
  on=true;I.frame({},p,1000/30);p={...p,throttleDemand:0};I.frame({},p,1000/30);
  assert.deepEqual(Array.from(I.snapshot().samples,(x)=>x.throttle),[0]);
  I.reset();assert.equal(I.snapshot().samples.length,0);assert.equal(I.snapshot().gear,null);
  I.frame({},p,1000/30);I.frame({},p,4000);assert.equal(I.snapshot().samples.length,1,"hitch starts a fresh window");
});

test("pause review mounts empty, snapshots bounded detached data, and never samples or writes driving", () => {
  const d=fakeDom(), dom=makeDom();let on=false;
  const host=dom.document.createElement("div");dom.body.append(host);
  d.doc.querySelector=()=>host;
  d.doc.createElement=(tag)=>{const el=dom.document.createElement(tag);if(tag==="canvas")el.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});return el;};
  const I=load({document:d.doc,window:d.win,HudElements:{isOn:()=>on}});
  assert.equal(I.mountReview(),true);assert.equal(I.mountReview(),true);assert.equal(host.children.length,1);
  const fold=host.children[0], note=fold.children[1],canvas=fold.children[2];
  assert.match(note.textContent,/Enable INPUTS/);assert.equal(canvas.hidden,true);
  on=true;const p=Object.freeze({throttleDemand:0.6,brakeDemand:0.2,steerCommand:-0.4,gear:3,lap:5});
  for(let i=0;i<120;i++)I.frame({},p,1000/30);
  const before=JSON.stringify(I.snapshot()), data=I.snapshot();
  assert.equal(data.samples.length,90);assert.equal(data.gear,3);assert.equal(data.lap,5);
  assert.equal(data.samples.at(-1).seconds,0);assert.ok(Math.abs(data.samples[0].seconds+89/30)<1e-9);
  data.samples[0].throttle=99;assert.equal(JSON.stringify(I.snapshot()),before,"consumer cannot mutate live trace");
  fold.open=true;dom.dispatch(fold,{type:"toggle"});
  assert.equal(canvas.hidden,false);assert.match(note.textContent,/lap 5 · gear 3/);assert.match(note.textContent,/T: throttle · B: brake · S: steering/);
  assert.equal(JSON.stringify(I.snapshot()),before,"review toggle does not sample or change capture");
  const lookup=d.doc.getElementById;d.doc.getElementById=(id)=>id==="pausemenu"?{hidden:true}:lookup(id);
  I.frame({},p,1000/30);assert.equal(fold.open,false,"resume closes the still review so reopening takes a fresh snapshot");
  fold.open=true;dom.dispatch(fold,{type:"toggle"});
  I.reset();assert.equal(fold.open,false);assert.equal(canvas.hidden,true);assert.match(note.textContent,/No continuous input samples/);
});


test("disabled and suppressed cleared history does not repaint review or rewrite visibility each frame", () => {
  const d=fakeDom(),dom=makeDom(),host=dom.document.createElement("div");let on=false;const modes=new Set();
  d.doc.body.classList.contains=(s)=>modes.has(s);d.doc.querySelector=()=>host;
  d.doc.createElement=(tag)=>{const e=dom.document.createElement(tag);if(tag==="canvas")e.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});return e;};
  const I=load({document:d.doc,window:d.win,HudElements:{isOn:()=>on}});I.mountReview();
  const fold=host.children[0],note=fold.children[1],canvas=fold.children[2];let textWrites=0,hiddenWrites=0,rootWrites=0;
  let text=note.textContent,hidden=canvas.hidden,rootHidden=d.root.hidden;
  Object.defineProperty(note,"textContent",{configurable:true,get:()=>text,set:v=>{textWrites++;text=v;}});
  Object.defineProperty(canvas,"hidden",{configurable:true,get:()=>hidden,set:v=>{hiddenWrites++;hidden=v;}});
  Object.defineProperty(d.root,"hidden",{configurable:true,get:()=>rootHidden,set:v=>{rootWrites++;rootHidden=v;}});
  const frame=()=>I.frame({}, {throttleDemand:1,gear:2,lap:1},1000/30);
  for(let i=0;i<120;i++)frame();
  assert.deepEqual([textWrites,hiddenWrites,rootWrites],[0,0,0],"shipped OFF adds no per-frame DOM work");
  on=true;const p={throttleDemand:1,gear:2,lap:1};I.frame({},p,1000/30);fold.open=true;dom.dispatch(fold,{type:"toggle"});
  modes.add("hud-prof-minimal");frame();const cleared=[textWrites,hiddenWrites,rootWrites];
  assert.equal(canvas.hidden,true);assert.equal(fold.open,false);assert.equal(I.trace.count,0);
  for(let i=0;i<120;i++)frame();I.reset();
  assert.deepEqual([textWrites,hiddenWrites,rootWrites],cleared,"suppression and repeated session reset remain idempotent after clearing");
});


test("review draws in visible CSS pixels with readable text and bounded DPR, repainting only while open", () => {
  const d=fakeDom(),dom=makeDom(),host=dom.document.createElement("div"),listeners={},transforms=[],fills=[];let font="";
  d.doc.querySelector=()=>host;d.win.devicePixelRatio=4;d.win.addEventListener=(name,fn)=>{listeners[name]=fn;};
  d.doc.createElement=(tag)=>{const e=dom.document.createElement(tag);if(tag==="canvas") {
    Object.defineProperty(e,"clientWidth",{configurable:true,writable:true,value:320});
    e.getContext=()=>new Proxy({setTransform:(...a)=>transforms.push(a),fillRect:(...a)=>fills.push(a)}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{if(k==="font")font=v;o[k]=v;return true;}});
  }return e;};
  const I=load({document:d.doc,window:d.win,HudElements:{isOn:()=>true}});I.mountReview();
  const p={throttleDemand:0.5,gear:3,lap:2};I.frame({},p,1000/30);
  const fold=host.children[0],canvas=fold.children[2];fold.open=true;dom.dispatch(fold,{type:"toggle"});
  assert.equal(canvas.width,960);assert.equal(canvas.height,540,"bitmap capped at3xDPR");
  assert.deepEqual(transforms.at(-1),[3,0,0,3,0,0]);assert.deepEqual(fills.at(-1),[0,0,320,180],"drawing stays within320CSSpixels, not640scaleddown");
  assert.equal(font,"16px sans-serif","text is16logicalCSSpixels beforeDPR transform");
  canvas.clientWidth=400;listeners.resize();assert.equal(canvas.width,1200);assert.deepEqual(fills.at(-1),[0,0,400,180]);
  fold.open=false;const count=transforms.length;listeners.resize();assert.equal(transforms.length,count,"closed review has no resize drawing");
});


test("review T B S legend occupies separated rows even when all channels coincide", () => {
  const d=fakeDom(),dom=makeDom(),host=dom.document.createElement("div"),labels=[];
  d.doc.querySelector=()=>host;
  d.doc.createElement=(tag)=>{const e=dom.document.createElement(tag);if(tag==="canvas")e.getContext=()=>new Proxy({fillText:(text,x,y)=>labels.push({text,x,y})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});return e;};
  const I=load({document:d.doc,window:d.win,HudElements:{isOn:()=>true}});I.mountReview();
  I.frame({}, {throttleDemand:0,brakeDemand:0,steerCommand:0,gear:1,lap:1},1000/30);
  const fold=host.children[0];fold.open=true;dom.dispatch(fold,{type:"toggle"});
  const legend=labels.filter(p=>["T","B","S"].includes(p.text));
  assert.deepEqual(legend.map(p=>p.text),["T","B","S"]);
  assert.equal(new Set(legend.map(p=>p.x)).size,1,"legend stays in reserved right column");
  assert.ok(legend[1].y-legend[0].y>=20&&legend[2].y-legend[1].y>=20,"16px labels have separate readable rows at equal inputs");
});

test("hidden paint keeps fixed-step input samples without canvas/DOM work and redraws on show", () => {
  const d = fakeDom();
  const I = load({ document: d.doc, window: d.win, HudElements: { isOn: () => true } });
  const p = { throttleDemand: 1, brakeDemand: 0, steerCommand: 0.5, gear: 4 };
  I.frame({}, p, 100);
  const before = { ...d.calls }, width = d.cv.width, label = d.cv.attrs["aria-label"];
  let reads = 0;
  Object.defineProperty(d.cv, "clientWidth", { get() { reads++; return 180; } });
  for (let i = 0; i < 30; i++) { p.throttleDemand = i / 30; I.frame({}, p, 1000 / 30, false); }
  assert.equal(reads, 0, "hidden canvas is never measured");
  assert.deepEqual(d.calls, before, "hidden canvas is never painted");
  assert.equal(d.cv.width, width);
  assert.equal(d.cv.attrs["aria-label"], label);
  assert.ok(I.trace.count >= 32, "hidden frames still record inputs");
  p.gear = 7;
  I.frame({}, p, 1, true);
  assert.ok(reads > 0, "show remeasures even at the same viewport and DPR");
  assert.equal(d.cv.width, 360);
  assert.ok(d.calls.stroke > before.stroke);
  assert.equal(d.gear.textContent, "7");
});

test("hidden caller's live mode state overrides stale camera classes without changing trace policy", () => {
  const d = fakeDom();
  d.doc.body.classList.contains = (name) => name === "hud-bcam";
  const I = load({ document: d.doc, window: d.win, HudElements: { isOn: () => true } });
  const p = { throttleDemand: 1, gear: 3 };
  I.frame({}, p, 100, false, false);
  assert.ok(I.trace.count > 0, "a hidden change back to standard resumes sampling");
  I.frame({}, p, 100, false, true);
  assert.equal(I.trace.count, 0, "a hidden switch to a suppressed mode clears the window");
  assert.equal(d.calls.stroke, 0);
});

for (const background of [false, true]) test(`HUD-hidden resets clear the independent review (background=${background})`, () => {
  for (const reason of ["no-player", "suppressed", "replacement"]) {
    const d = fakeDom(), dom = makeDom(), host = dom.document.createElement("div"), listeners = {};
    d.doc.addEventListener = (name, fn) => { listeners[name] = fn; };
    d.doc.querySelector = () => host;
    d.doc.createElement = (tag) => {
      const el = dom.document.createElement(tag);
      if (tag === "canvas") el.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
      return el;
    };
    const I = load({ document: d.doc, window: d.win, HudElements: { isOn: () => true } });
    I.mountReview();
    const p = { throttleDemand: 0.7, gear: 4, lap: 3 };
    I.frame({}, p, 100);
    const fold = host.children[0], note = fold.children[1], canvas = fold.children[2];
    fold.open = true; dom.dispatch(fold, { type: "toggle" });
    assert.equal(canvas.hidden, false);
    d.doc.hidden = background;
    const oldNote = note.textContent;
    I.frame({}, reason === "no-player" ? null : reason === "replacement" ? { ...p, lap: 4 } : p,
      17, false, reason === "suppressed");
    if (background) {
      assert.equal(fold.open, true, "background document defers DOM reset");
      assert.equal(note.textContent, oldNote);
      d.doc.hidden = false;
      listeners.visibilitychange(); // paused: no HUD frame needed to complete reset
    }
    assert.equal(fold.open, false, reason);
    assert.equal(canvas.hidden, true, reason);
    assert.match(note.textContent, /No continuous input samples/, reason);
  }
});
