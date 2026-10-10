/* hud-layout — per-element HUD move/size store, cockpit vs other layouts, and
   the --hl-* / data-hl paint the css/hud.css rule reads. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CAMG = fs.readFileSync(path.join(ROOT, "js/camera/cam-groups.js"), "utf8");
// hud-layout reads CamGroups at eval (tools/manifest.cjs HARD_EDGES), so every
// harness evaluates the two together, in load order.
const SRC = CAMG + "\n" + fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");

test("HUD browser helper atomically holds producers, selects camera and refreshes the controlled HUD", async () => {
  const spec=fs.readFileSync(path.join(ROOT,"tests/specs/hud-layout.spec.js"),"utf8");
  const helper=spec.match(/async function race\([\s\S]+?\n\}\n\nconst measure/);
  assert.ok(helper); const timeline=[];
  let camera="chase", broadcast=false, published="0px", frozen=false, headless=false;
  const elements=new Map();
  const ctx=vm.createContext({BOOT_MS:60_000,PIN_PREVIOUS_LOOK:()=>{},localStorage:{setItem(){}},requestAnimationFrame:(fn)=>fn(),
    document:{
      body:{classList:{contains:()=>broadcast}},
      getElementById:(id)=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},
      querySelector:()=>({currentCSSZoom:1,getBoundingClientRect:()=>({height:42})}),
      documentElement:{style:{getPropertyValue:()=>published}},
    },
    window:{__apex:{
      race(){}, info:()=>({track:"monza"}), go(){},
      camera(id){assert.equal(frozen&&headless,true,"producers held before camera update");camera=id;timeline.push("camera:"+id);},
      jump(frac,speed,x){assert.deepEqual([frac,speed,x],[.1,60,0]);assert.equal(frozen&&headless,true);broadcast=camera==="heli";published="42.0px";timeline.push("refresh:"+camera);},
      freeze(on){assert.equal(on,true);frozen=true;timeline.push("hold physics");},
      headless(on){assert.equal(on,true);headless=true;timeline.push("hold renderer");},
    }},
  });
  const run=vm.runInContext("("+helper[0].replace(/\n\nconst measure$/,"")+")",ctx);
  const invoke=(fn,arg)=>vm.runInContext("("+fn.toString()+")",ctx)(arg);
  const page={goto:async()=>{},reload:async()=>{},addInitScript:async()=>{},addStyleTag:async()=>{},evaluate:async(fn,arg)=>invoke(fn,arg),
    waitForFunction:async(fn,arg)=>assert.equal(await invoke(fn,arg),true,"no background HUD tick runs during the warm-up"),
    waitForTimeout:async()=>{throw new Error("broadcast helper must use readiness, not a sleep");}};
  await run(page,"buttons",false,{sal:59,sar:59,sat:0,sab:21},{profile:"broadcast",cam:"heli"});
  assert.deepEqual(timeline,["hold physics","hold renderer","camera:heli","refresh:heli"]);
});

test("broadcast layout probe waits for paint, camera and published tower height, not collision results", async () => {
  const spec=fs.readFileSync(path.join(ROOT,"tests/specs/hud-layout.spec.js"),"utf8");
  const predicate=spec.match(/await page\.waitForFunction\((async \(broadcastCamera\) => \{[\s\S]*?\n    \}), o\.cam/);
  assert.ok(predicate,"the broadcast helper carries its bounded input-readiness predicate");
  let broadcast=false, published="", height=132.04, zoom=2, queries=0;
  const frames=[];
  const ctx=vm.createContext({requestAnimationFrame:(fn)=>frames.push(fn),document:{
    body:{classList:{contains:()=>broadcast}},
    querySelector:(selector)=>{
      queries++;
      assert.equal(selector,".hud-top","readiness must not wait for map/gap overlap results");
      return {currentCSSZoom:zoom,getBoundingClientRect:()=>({height,top:8,bottom:8+height})};
    },
    documentElement:{style:{getPropertyValue:()=>published}},
  }});
  const ready=vm.runInContext("("+predicate[1]+")",ctx);
  const afterPaint=async()=>{
    const before=queries; let settled=false;
    const result=ready(true); result.then(()=>{settled=true;});
    assert.equal(frames.length,1,"first frame scheduled");
    assert.equal(queries,before,"no layout read before paint");
    frames.shift()(); await Promise.resolve();
    assert.equal(settled,false,"one frame cannot complete paint readiness");
    assert.equal(queries,before,"no layout read between frames");
    assert.equal(frames.length,1,"second frame scheduled");
    frames.shift()(); return await result;
  };
  assert.equal(await afterPaint(),false,"camera class has not caught up");
  broadcast=true; assert.equal(await afterPaint(),false,"height is not published yet");
  published="0px"; assert.equal(await afterPaint(),false,"initial zero height is stale");
  published="40px"; assert.equal(await afterPaint(),false,"old tower height is stale");
  published="66.0px"; assert.equal(await afterPaint(),true,"own units honor zoom and toFixed(1) rounding");
  // fitHud re-publishes --hud-top-h AFTER writing --hud-z-top so a zoom cap
  // in the same pass cannot leave the wait 0.1px behind.
  const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  const fit = hud.slice(hud.indexOf("function fitHud("), hud.indexOf("function paintInstruments"));
  const zTop = fit.indexOf('set("--hud-z-top"');
  const republish = fit.indexOf('hStyle(root, "--hud-top-h"', zTop);
  assert.ok(zTop >= 0 && republish > zTop, "--hud-top-h must be published after the top zoom cap");
  height=0; published="0px"; assert.equal(await afterPaint(),false,"hidden tower is not ready");
  height=132; zoom=1; published="132px"; assert.equal(await afterPaint(),true);
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
  assert.deepEqual(JSON.parse(JSON.stringify(written.hudLayout)), { v: 3, standard: { cockpit: {}, helmet: {}, other: { map: { x: 5, y: 0, s: 150 } } } });
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
  assert.equal(H.camSet("helmet"), "helmet", "HELMET is the visor: its own set (js/camera/cam-groups.js)");
  assert.equal(H.camSet("visor"), "other", "VISOR draws no wheel (js/camera/cam-groups.js)");
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

// THE HOUSE UNIT IS svh (css/tokens.css): vh is the LARGE viewport, the height
// with the browser toolbars retracted, so on a phone browser a vh offset is
// measured against space that is not on screen. The MOVE & SIZE translate, the
// mirror's height cap and the three opt-in readouts (RELATIVE 38, STRATEGY 40,
// INPUTS 22) were the last vh in this sheet.
test("no HUD position, size or MOVE & SIZE offset is measured in the large viewport (vh)", () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const hits = src.split("\n").filter((l) => /\d(?:\.\d+)?vh\b/.test(l)).map((l) => l.trim());
  assert.deepEqual(hits, [], "css/hud.css must use svh, not vh");
  const m = CSS.match(/\[data-hl\]\s*\{([^}]*)\}/);
  assert.match(m[1], /--hl-y, 0\) \* 1svh/, "the MOVE & SIZE vertical offset is a share of the small viewport");
});

// Phone-portrait survey 390×844 ranked tower × map: the centred POS row sits
// on the top-left minimap. Park map+gaps under --hud-top-h only in that
// shape; landscape / tablet / desktop keep the shipped top-left cluster.
test("phone portrait parks the minimap under the timing tower; other shapes keep the corner", () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const q = /@media \(orientation: portrait\) and \(max-width: 500px\)\s*\{([^}]+)\}/;
  const m = src.match(q);
  assert.ok(m, "a portrait-and-narrow query owns the tower/map stack");
  assert.match(m[1], /#minimap/);
  assert.match(m[1], /\.hud-gaps/);
  assert.match(m[1], /top:\s*calc\(8px \+ var\(--sat\) \/ var\(--hud-z\) \+ var\(--hud-top-h, 54px\) \+ 8px\)/);
  const baseMap = src.match(/(?:^|\n)#minimap \{\s*position: absolute;([\s\S]*?)\n\}/);
  assert.ok(baseMap, "shipped #minimap rule");
  assert.match(baseMap[1], /top:\s*calc\(8px \+ var\(--sat\) \/ var\(--hud-z\)\);/);
  assert.doesNotMatch(baseMap[1], /--hud-top-h/, "landscape/desktop map stays in the top-left corner");
  assert.equal((src.match(/@media \(orientation: portrait\) and \(max-width: 500px\)/g) || []).length, 1);
});

// Empty .hud-gaps collapses (css/hud.css). The COMPACT metrics test must seed
// a gap line before asserting width > 0, or it measures the intentional hide.
test("COMPACT metrics layout seeds a gap line before asserting .hud-gaps survives", () => {
  const spec = fs.readFileSync(path.join(ROOT, "tests/specs/hud-layout.spec.js"), "utf8");
  const block = spec.match(/COMPACT drops both metric halves and leaves MAP and GAPS alone[\s\S]*?^\}\);/m);
  assert.ok(block, "COMPACT metrics test exists");
  assert.match(block[0], /hud-gap-ahead[\s\S]*textContent\s*=/, "seed ahead text before width probe");
  assert.match(CSS, /\.hud-gaps:not\(:has\(>\s*div:not\(:empty\)\)\)\s*\{[^}]*display:\s*none/);
});

const plain = (o) => JSON.parse(JSON.stringify(o));
const TD = fs.readFileSync(path.join(ROOT, "css/track-detail.css"), "utf8");

test("cockpit ships a default strip beside the wheel; other ships zero", () => {
  const { H, written, els } = load();
  assert.equal(H.isShipped(), true);
  assert.deepEqual(Object.keys(H.SHIPPED.standard.other), []);
  for (const id of ["ot", "aero", "energy", "tyre"]) {
    const e = H.get(id, "cockpit");
    assert.ok(Math.abs(e.x) >= 25, id + " clears the wheel's middle 40%");
    assert.deepEqual(plain(H.get(id, "other")), { x: 0, y: 0, s: 100 });
  }
  assert.ok(H.get("ot", "cockpit").x > 0 && H.get("energy", "cockpit").x < 0, "OT right, ENERGY left");
  assert.deepEqual(plain(H.get("gearbox", "cockpit")), { x: 0, y: 0, s: 100 });
  assert.equal("data-hl" in els["#hud-ot"].attrs, false, "chase: nothing painted");
  H.setCam("cockpit");
  assert.equal(els["#hud-ot"].props["--hl-x"], String(H.SHIPPED.standard.cockpit.ot.x));
  assert.equal("data-hl" in els["#hud-gearbox"].attrs, false);
  assert.equal(written.hudLayout, undefined, "the default is not written to the store");
});

test("stored offsets override the cockpit default; reset returns to the default, not zero", () => {
  const { H, written } = load();
  H.set("ot", { y: 0 }, "cockpit");
  assert.deepEqual(plain(H.get("ot", "cockpit")), { x: H.SHIPPED.standard.cockpit.ot.x, y: 0, s: 100 });
  assert.equal(H.isShipped("cockpit"), false);
  H.set("aero", { x: 0, y: 0 }, "cockpit");   // back to zero is a real choice in the cockpit
  assert.deepEqual(plain(written.hudLayout.standard.cockpit.aero), { x: 0, y: 0, s: 100 });
  H.resetEl("ot", "cockpit");
  assert.deepEqual(plain(H.get("ot", "cockpit")), plain(H.SHIPPED.standard.cockpit.ot));
  H.resetSet("cockpit");
  assert.equal(written.hudLayout, null);
  assert.deepEqual(plain(H.get("aero", "cockpit")), plain(H.SHIPPED.standard.cockpit.aero));
  H.set("tyre", plain(H.SHIPPED.standard.cockpit.tyre), "cockpit");
  assert.equal(written.hudLayout, null, "writing the default stores nothing");
});

test("v1 store migrates: its values kept as STANDARD's, missing cockpit elements take the default, saves as v3", () => {
  const { H, written } = load({ hudLayout: { v: 1, cockpit: { tyre: { x: -10, y: 0, s: 120 } }, other: { map: { x: 2, y: 0, s: 100 } } } });
  assert.deepEqual(plain(H.get("tyre", "cockpit")), { x: -10, y: 0, s: 120 });
  assert.deepEqual(plain(H.get("ot", "cockpit")), plain(H.SHIPPED.standard.cockpit.ot));
  assert.deepEqual(plain(H.get("map", "other")), { x: 2, y: 0, s: 100 });
  H.set("map", { s: 110 }, "other");
  assert.equal(written.hudLayout.v, 3);
  assert.deepEqual(plain(written.hudLayout.standard.cockpit), { tyre: { x: -10, y: 0, s: 120 } });
  assert.equal(written.hudLayout.broadcast, undefined, "the other styles start shipped");
});

test("presets are pure data laid over the set's shipped layout", () => {
  const { H } = load();
  assert.deepEqual(plain(H.PRESETS.map((p) => p[0])), ["shipped", "clean", "big", "corners"]);
  const ids = H.ELEMENTS.map((e) => e[0]);
  for (const [, , els] of H.PRESETS) for (const id in els) assert.ok(ids.includes(id), id);
  const c = H.presetLayout("clean", "cockpit");
  assert.equal(c.tower.s, 85);
  assert.equal(c.ot.s, 90);
  assert.equal(c.ot.x, H.SHIPPED.standard.cockpit.ot.x, "CLEAN keeps the cockpit strip beside the wheel");
  assert.equal(H.presetLayout("clean", "other").ot.x, 0);
  assert.equal(H.presetLayout("big", "other").gearbox.s, 125);
  assert.equal(H.presetLayout("nope", "other"), null);
});

// The desktop chase layout the presets are laid over, measured by the
// hud-survey at 1280x720 (bottom and top zoom as shipped): [left, top, w, h]
// in screen px. At 1920x1080 the centred pieces sit +320 / +360 (the bottom
// band is bottom-anchored, the map and gap strip are left-anchored, the tower
// is centred). Each preset must leave every piece it moves clear of every
// piece it keeps, on screen, at both widths — hud-survey Y2 / Y3.
const DESK = {
  tower: [459, 8, 362, 51], map: [10, 8, 160, 160], gaps: [178, 8, 78, 18],
  gearbox: [225, 582, 262, 65], speed: [507, 592, 87, 47], energy: [614, 606, 190, 18],
  tyre: [291, 648, 130, 42], ot: [824, 595, 89, 41], aero: [933, 595, 121, 41], bb: [520, 662, 62, 27],
};
const ANCHOR = { tower: "centre", map: "left", gaps: "left" };
function deskRect(id, e, W, H, orig) {
  let [x, y, w, h] = DESK[id];
  const a = ANCHOR[id] || "centre";
  if (a === "centre") x += (W - 1280) / 2;
  if (!ANCHOR[id]) y += H - 720;
  const s = e.s / 100, o = orig[id];
  // Scale origin: HudLayout.ELEMENTS (the centred tower grows about the centre line).
  if (id === "tower") { x -= w * (s - 1) / 2; }
  else if (/bottom center/.test(o)) { x -= w * (s - 1) / 2; y -= h * (s - 1); }
  w *= s; h *= s;
  return [x + e.x * W / 100, y + e.y * H / 100, w, h];
}
const hit = (a, b) => Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 0.5 && Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 0.5;

test("BIG and CORNERS clear the desktop row at 1280 and 1920 (hud-survey Y2 / Y3)", () => {
  const { H } = load();
  const orig = Object.fromEntries(H.ELEMENTS.map((e) => [e[0], e[3]]));
  for (const pid of ["big", "corners"]) {
    const lay = H.presetLayout(pid, "other");
    const moved = Object.keys(H.PRESETS.find((p) => p[0] === pid)[2]);
    for (const [W, Ht] of [[1280, 720], [1920, 1080]]) {
      const box = {};
      for (const id of Object.keys(DESK)) box[id] = deskRect(id, lay[id] || { x: 0, y: 0, s: 100 }, W, Ht, orig);   // SPEED is not a MOVE & SIZE element
      for (const id of moved) {
        const r = box[id];
        assert.ok(r[0] >= 4 && r[1] >= 4 && r[0] + r[2] <= W - 4 && r[1] + r[3] <= Ht - 4, `${pid} ${id} on screen at ${W}: ${r.map(Math.round)}`);
        for (const other of Object.keys(DESK)) {
          if (other === id) continue;
          assert.ok(!hit(r, box[other]), `${pid} at ${W}: ${id} ${r.map(Math.round)} on ${other} ${box[other].map(Math.round)}`);
        }
      }
    }
  }
});

test("apply a preset to the edited set, tweak it, CUSTOM detection", () => {
  const { H, written } = load();
  assert.equal(H.presetOf("other"), "shipped");
  assert.equal(H.presetOf("cockpit"), "shipped");
  assert.equal(H.applyPreset("big", "other"), true);
  assert.equal(H.presetOf("other"), "big");
  assert.equal(H.presetOf("cockpit"), "shipped", "only the edited set changes");
  assert.deepEqual(plain(written.hudLayout.standard.cockpit), {});
  assert.equal(H.get("tower", "other").s, 125);
  H.set("tower", { s: 130 }, "other");
  assert.equal(H.presetOf("other"), "custom");
  H.applyPreset("corners", "cockpit");
  assert.equal(H.presetOf("cockpit"), "corners");
  assert.equal(H.get("energy", "cockpit").x, -34);
  assert.equal(H.get("ot", "cockpit").x, H.SHIPPED.standard.cockpit.ot.x);
  H.applyPreset("shipped", "cockpit");
  H.applyPreset("shipped", "other");
  assert.equal(written.hudLayout, null);
});

test("CORNERS on a touch cockpit does not pull ENERGY or TYRES onto the steer column", () => {
  const T = load3({ classes: [], live: false });
  const lay = T.H.presetLayout("corners", "cockpit");
  assert.deepEqual(plain(lay.energy), plain(T.H.get("energy", "cockpit")));
  assert.deepEqual(plain(lay.tyre), plain(T.H.get("tyre", "cockpit")));
  assert.equal(lay.energy.x, T.H.SHIPPED.standard.cockpit.energy.x);
  const helm = T.H.presetLayout("corners", "helmet");
  assert.deepEqual(plain(helm.energy), plain(T.H.TOUCH_SHIPPED.helmet.energy));
  assert.deepEqual(plain(helm.gearbox), { x: 0, y: 0, s: 100 });
  const D = load3({ classes: ["desktop"], live: false });
  assert.equal(D.H.presetLayout("corners", "cockpit").energy.x, -34, "desktop corners still moves ENERGY");
  assert.equal(D.H.presetLayout("corners", "other").energy.x, -34);
});

test("css/track-detail.css: cockpit hides only speed/gear, not the OT/AERO/ENERGY strip", () => {
  const hide = TD.match(/((?:body\.cockpit-cam #[\w-]+,?\s*)+)\{\s*display:\s*none/);
  assert.ok(hide, "the cockpit hide rule exists");
  assert.match(hide[1], /#hud-gearbox/);
  assert.match(hide[1], /#hud-speed/);
  for (const id of ["hud-ot", "hud-aero", "hud-energy", "hud-tyre"]) assert.doesNotMatch(hide[1], new RegExp("#" + id + "\\b"));
});

test("touch cockpit: TYRES joins the strip's hide in the CSS and in hiddenReason (hud-survey Y1)", () => {
  const touch = TD.match(/body\[data-hl-set="cockpit"\]:not\(\.desktop\) :is\(([^)]*)\):not\(\[data-hl-user\]\)\s*\{\s*display:\s*none/);
  assert.ok(touch, "the touch-cockpit hide rule exists");
  const hidden = touch[1].split(",").map((x) => x.trim()).sort();
  assert.deepEqual(hidden, ["#hud-aero", "#hud-bb", "#hud-energy", "#hud-ot", "#hud-tyre"]);
  // Every piece the shipped cockpit strip moves is in that hide.
  const { H } = load();
  const sel = Object.fromEntries(H.ELEMENTS.map((e) => [e[0], e[2]]));
  for (const id of Object.keys(H.SHIPPED.standard.cockpit)) assert.ok(hidden.includes(sel[id]), id);
});

test("touch cockpit with a wheel that has no screen (CLASSIC / NONE): the strip still hides; the gearbox does not", () => {
  // body.cockpit-cam needs wheelHasScreen() (js/camera/mode-switch.js); the
  // cockpit LAYOUT set is chosen by camera alone, so the hide must follow it.
  const ms = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  assert.match(ms, /"cockpit-cam", [^;]*wheelHasScreen\(\)/, "premise: cockpit-cam is the wheel LCD");
  const L = load3({ classes: [], live: false });   // no cockpit-cam: CLASSIC wheel
  L.H.setCam("cockpit");
  for (const id of ["energy", "tyre", "ot", "aero", "bb"]) {
    const r = L.H.hiddenReason(id);
    assert.ok(r && /touch cockpit/.test(r.reason) && r.soft, id + ": " + JSON.stringify(r));
  }
  assert.equal(L.H.hiddenReason("gearbox"), null, "no LCD: the gearbox chip is the read");
  L.H.setCam("chase");
  assert.equal(L.H.hiddenReason("ot"), null, "the chase layout set shows the strip");
  // The CSS keys the same hide on the attribute apply() paints.
  assert.match(TD, /body\[data-hl-set="cockpit"\]:not\(\.desktop\) :is\([^)]*#hud-ot[^)]*\)/);
  assert.doesNotMatch(TD, /body\.cockpit-cam:not\(\.desktop\)/, "the touch hide no longer needs the wheel LCD");
});

test("apply() paints body[data-hl-set] with the camera set on screen", () => {
  const attrs = {};
  const els = {};
  const doc = { readyState: "complete", getElementById: () => null, addEventListener() {},
    body: { classList: { contains: () => false }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
      setAttribute: (k, v) => { attrs[k] = String(v); }, removeAttribute: (k) => { delete attrs[k]; } },
    querySelector: (sel) => (els[sel] || (els[sel] = fakeEl())) };
  const ctx = { console, document: doc, GameStore: { store: { get: (k, d) => d, set() {} } } };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  ctx.HudLayout.setCam("cockpit");
  assert.equal(attrs["data-hl-set"], "cockpit");
  ctx.HudLayout.setCam("helmet");
  assert.equal(attrs["data-hl-set"], "helmet");
  ctx.HudLayout.setCam("chase");
  assert.equal(attrs["data-hl-set"], "other");
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

test("fit clamps pieces that share an offset as ONE block, so neighbours keep their spacing", () => {
  // OT and AERO both ship +30vw in the cockpit; at 1000 wide only AERO overruns
  // the right edge. Clamped one by one, AERO landed on top of OT.
  const mk = (left, w) => {
    const props = {}, attrs = { "data-hl": "" };
    return {
      props,
      style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
      setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
      getBoundingClientRect() { const x = left + (parseFloat(props["--hl-x"] || 0) - 30) * 10; return { left: x, right: x + w, top: 500, bottom: 530, width: w, height: 30 }; },
    };
  };
  const ot = mk(880, 70), aero = mk(960, 100);   // at +30vw: OT 880-950, AERO 960-1060 (past 1000)
  const written = { hudLayout: { v: 2, cockpit: { ot: { x: 30, y: -14, s: 100 }, aero: { x: 30, y: -14, s: 100 } }, other: {} } };
  const blank = { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false };
  const ctx = {
    console, window: { innerWidth: 1000, innerHeight: 600 },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {}, body: { classList: { contains: () => true } },
      querySelector: (sel) => (sel === "#hud-ot" ? ot : sel === "#hud-aero" ? aero : blank) },
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  ctx.HudLayout.setCam("cockpit");
  ctx.HudLayout.fit();
  const o = ot.getBoundingClientRect(), r = aero.getBoundingClientRect();
  assert.ok(r.right <= 1000 - 4 + 1e-6, "the block ends on screen: " + r.right);
  assert.ok(o.right <= r.left, `OT (${o.left}-${o.right}) still left of AERO (${r.left}-${r.right})`);
  assert.equal(ot.props["--hl-x"], aero.props["--hl-x"], "one correction for the whole block");
});

test("fit clamps a size-only piece on its own, not as one block with every other size-only piece", () => {
  // BIG + TOWER SIZE 200 at 844 wide: the tower (centred, grown to 640) and the
  // map (top-left, grown) both carry offset 0,0. Grouped as one "0,0" block their
  // union outgrew the screen and was pinned to the map's left edge, leaving the
  // tower's right end ~170 px past the right edge.
  const W = 844, H = 390;
  const mk = (left, top, w, h) => {
    const props = {}, attrs = { "data-hl": "" };
    return {
      props,
      style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
      setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
      getBoundingClientRect() {
        const x = left + parseFloat(props["--hl-x"] || 0) / 100 * W, y = top + parseFloat(props["--hl-y"] || 0) / 100 * H;
        return { left: x, right: x + w, top: y, bottom: y + h, width: w, height: h };
      },
    };
  };
  const tower = mk(W / 2 - 160 + 170, 8, 640, 100);   // grown about its left: 432..1072, 228 px past 840
  const map = mk(10, 8, 160, 160);                    // 10..170: on screen
  const written = { hudLayout: { v: 3, standard: { cockpit: {}, other: { tower: { x: 0, y: 0, s: 200 }, map: { x: 0, y: 0, s: 125 } } } } };
  const blank = { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false };
  const ctx = {
    console, window: { innerWidth: W, innerHeight: H },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {},
      querySelector: (sel) => (sel === ".hud-top" ? tower : sel === "#minimap" ? map : blank) },
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  ctx.HudLayout.fit();
  const t = tower.getBoundingClientRect(), m = map.getBoundingClientRect();
  assert.ok(t.right <= W - 4 + 1e-6 && t.left >= 4 - 1e-6, `the tower ends on screen: ${t.left}..${t.right}`);
  assert.equal(m.left, 10, "the map, already on screen, is not dragged with the tower");
  assert.equal(map.props["--hl-x"], "0");
  assert.equal(ctx.HudLayout.get("tower", "other").s, 200, "stored size unchanged");
});

// ---- per-style layouts, camera groups, hidden reasons, live origin ----------
// A harness with a body (classes + data-hud-hide), #hud (hidden = not racing),
// :root attributes and an optional GameHud.
function load3({ stored = {}, classes = [], live = true, hide = "", rootAttrs = {}, bodyAttrs = {}, gameHud = null, mirror = null } = {}) {
  const written = Object.assign({}, stored);
  const els = {};
  const byId = {};
  const cls = new Set(classes);
  const hud = { hidden: !live };
  const body = {
    classList: {
      contains: (c) => cls.has(c),
      add: (c) => { cls.add(c); },
      remove: (c) => { cls.delete(c); },
      toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); },
    },
    getAttribute: (k) => (k === "data-hud-hide" ? hide : (k in bodyAttrs ? bodyAttrs[k] : null)),
    hasAttribute: (k) => (k === "data-hud-hide" ? !!hide : Object.prototype.hasOwnProperty.call(bodyAttrs, k)),
  };
  const root = { hasAttribute: (k) => k in rootAttrs };
  const doc = {
    readyState: "complete", body, documentElement: root,
    getElementById: (id) => {
      if (id === "hud") return hud;
      if (id in byId) return byId[id];
      return null;
    },
    querySelector: (sel) => (els[sel] || (els[sel] = fakeEl())),
    addEventListener() {},
  };
  const ctx = { console, document: doc,
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } } };
  if (gameHud) ctx.GameHud = gameHud;
  if (mirror) {
    // MirrorPass.instance() shape used by revealMirror / mirrorMode.
    let mode = mirror.mode || "auto";
    let collapsed = !!mirror.collapsed;
    const chip = {
      hidden: !collapsed,
      click() { collapsed = false; chip.hidden = true; },
    };
    byId["hud-mirror-chip"] = chip;
    ctx.MirrorPass = {
      instance: () => ({
        mode: () => mode,
        setMode: (v) => { mode = v; written.hudMirror = v; },
        state: () => ({ mode, collapsed, shown: mode !== "off" && !collapsed }),
      }),
    };
  }
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout; this.CamGroups = CamGroups;", ctx);
  return { H: ctx.HudLayout, CG: ctx.CamGroups, written, els, cls, hud, rootAttrs, bodyAttrs, byId };
}

test("migrate: v2 {cockpit, other} becomes STANDARD's; MINIMAL and BROADCAST start shipped", () => {
  const { H } = load3();
  const m = plain(H.migrate({ v: 2, cockpit: { ot: { x: 10, y: 0, s: 100 } }, other: { tower: { x: -30, y: 0, s: 100 } } }));
  assert.deepEqual(m.standard, { cockpit: { ot: { x: 10, y: 0, s: 100 } }, helmet: {}, other: { tower: { x: -30, y: 0, s: 100 } } });
  assert.deepEqual(m.minimal, { cockpit: {}, helmet: {}, other: {} });
  assert.deepEqual(m.broadcast, { cockpit: {}, helmet: {}, other: {} });
  // v3 reads per style, and a value equal to that style's shipped one is dropped.
  const v3 = plain(H.migrate({ v: 3, broadcast: { other: { map: { x: 1 } } }, minimal: { cockpit: { tyre: H.SHIPPED.minimal.cockpit.tyre } } }));
  assert.deepEqual(v3.broadcast.other, { map: { x: 1, y: 0, s: 100 } });
  assert.deepEqual(v3.minimal.cockpit, {});
  assert.deepEqual(plain(H.migrate(null)), { standard: { cockpit: {}, helmet: {}, other: {} }, minimal: { cockpit: {}, helmet: {}, other: {} }, broadcast: { cockpit: {}, helmet: {}, other: {} } });
  for (const p of H.PROFILES) for (const id of ["energy", "tyre", "ot", "aero"]) assert.ok(Math.abs(H.SHIPPED[p].cockpit[id].x) >= 25, p + " " + id);
});

test("layouts are keyed by style: a STANDARD tower move does not paint in BROADCAST", () => {
  const { H, written, els, cls } = load3({ stored: { hudLayout: { v: 2, cockpit: {}, other: { tower: { x: -30, y: 0, s: 100 } } } } });
  assert.equal(H.profile(), "standard");
  assert.equal(els[".hud-top"].props["--hl-x"], "-30");
  cls.add("hud-prof-broadcast");
  H.setCam("chase");                       // js/ui/hud.js calls it on a style change too
  assert.equal(H.profile(), "broadcast");
  assert.equal("data-hl" in els[".hud-top"].attrs, false, "broadcast shows its own (shipped) tower");
  H.set("tower", { y: 5 }, "other");
  assert.deepEqual(plain(written.hudLayout), { v: 3,
    standard: { cockpit: {}, helmet: {}, other: { tower: { x: -30, y: 0, s: 100 } } },
    broadcast: { cockpit: {}, helmet: {}, other: { tower: { x: 0, y: 5, s: 100 } } } });
  assert.equal(H.get("tower", "other", "standard").x, -30);
  assert.equal(H.get("tower", "other", "minimal").x, 0);
  assert.equal(H.isShipped(undefined, "minimal"), true);
  assert.equal(H.isShipped(undefined, "all"), false);
  H.resetSet("other", "broadcast");
  H.resetSet("other", "standard");
  assert.equal(written.hudLayout, null);
});

test("profile: the live body class while racing, else the stored HUD STYLE", () => {
  const a = load3({ classes: ["hud-prof-minimal"], live: true, stored: { hudProfile: "broadcast" } });
  assert.equal(a.H.profile(), "minimal", "racing: what is drawn");
  const b = load3({ classes: ["hud-prof-minimal"], live: false, stored: { hudProfile: "broadcast" } });
  assert.equal(b.H.profile(), "broadcast", "menus: the setting (the classes are last race's)");
  const c = load3({ classes: [], live: false, stored: { hudProfile: "junk" } });
  assert.equal(c.H.profile(), "standard");
});

test("CamGroups: one onboard table, a wheel-only cockpit-layout table; hud.js and hud-layout read it", () => {
  const { CG, H } = load3();
  assert.deepEqual(Object.keys(CG.ONBOARD).sort(), ["cockpit", "helmet", "hood", "tcam", "visor"]);
  assert.deepEqual(Object.keys(CG.COCKPIT_LAYOUT), ["cockpit"]);
  assert.deepEqual(Object.keys(CG.HELMET_LAYOUT), ["helmet"]);
  for (const id in Object.assign({}, CG.COCKPIT_LAYOUT, CG.HELMET_LAYOUT)) assert.ok(CG.ONBOARD[id], id + ": a wheel camera is onboard");
  assert.deepEqual(["cockpit", "helmet", "visor", "chase"].map(CG.layoutSet), ["cockpit", "helmet", "other", "other"]);
  assert.deepEqual([...H.SETS], ["cockpit", "helmet", "other"]);
  for (const id of ["chase", "far", "heli", "tv", "rear"]) assert.equal(CG.isOnboard(id), false, id);
  assert.ok(Object.isFrozen(CG.ONBOARD) && Object.isFrozen(CG.COCKPIT_LAYOUT));
  assert.equal(H.COCKPIT_CAMS, CG.COCKPIT_LAYOUT);
  const ms = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  const ids = [...ms.matchAll(/\{ id: "(\w+)"/g)].map((m) => m[1]);
  for (const id in CG.ONBOARD) assert.ok(ids.includes(id), id + " is a CAM_MODES id");
  const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  assert.match(hud, /const ONBOARD_IDS = typeof CamGroups !== "undefined" \? CamGroups\.ONBOARD/);
  assert.doesNotMatch(SRC.slice(CAMG.length), /visor: 1/, "hud-layout keeps no camera table of its own");
  const man = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  assert.ok(man.indexOf('"js/camera/cam-groups.js"') < man.indexOf('"js/ui/hud-layout.js"'), "loads before hud-layout");
});

test("ELEMENTS carry their column; the origin and CLEAR_CTRL follow it, and columnOf is the live one", () => {
  const { H } = load3({ classes: ["desktop"] });
  const COLS = ["left", "right", "centre", "bottom"];
  const ORIG = { left: "top left", right: "top right", centre: "top left", bottom: "bottom center" };
  for (const e of H.ELEMENTS) {
    assert.ok(COLS.includes(e[4]), e[0] + " has a column");
    assert.equal(e[3], ORIG[e[4]], e[0] + ": the origin is its column's");
  }
  const col = Object.fromEntries(H.ELEMENTS.map((e) => [e[0], e[4]]));
  assert.deepEqual(Object.keys(H.CLEAR_CTRL).sort(), Object.keys(col).filter((id) => col[id] === "left" || col[id] === "right").sort(),
    "every side-column piece clears the touch controls when moved (it used to be rel / inputs / sectors by hand)");
  for (const id of ["rel", "inputs", "sectors"]) assert.ok(H.CLEAR_CTRL[id], id + " still clears");
  // Live: LIMITS crosses left under data-limits-left; RELATIVE's touch home is the left column.
  assert.equal(H.columnOf("rel"), "right", "desktop RELATIVE: under the right column");
  assert.equal(H.originOf("rel"), "top right");
  const touch = load3({ classes: [] });
  assert.equal(touch.H.columnOf("rel"), "left", "touch RELATIVE: the left column …");
  assert.equal(touch.H.originOf("rel"), "top left", "… so it grows away from the LEFT edge, not off it");
  const crossed = load3({ classes: ["desktop"], rootAttrs: { "data-limits-left": "" } });
  assert.equal(crossed.H.columnOf("limits"), "left"); assert.equal(crossed.H.originOf("limits"), "top left");
  // js/ui/hud.js's column allocators stack exactly the side pieces this table names.
  const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  const ids = (fn) => [...hud.slice(hud.indexOf("function " + fn), hud.indexOf("const solve", hud.indexOf("function " + fn))).matchAll(/\["(\w+)", /g)].map((m) => m[1]);
  assert.ok(ids("placeRightColumn").length >= 3 && ids("placeLeftColumn").length >= 3, "the allocators list their pieces");
  for (const id of ids("placeRightColumn")) assert.ok(id === "rel" || col[id] === "right", "right allocator piece " + id + " is a right-column element");
  for (const id of ids("placeLeftColumn")) assert.ok(["limits", "rel"].includes(id) || col[id] === "left", "left allocator piece " + id + " is (live) a left-column element");
});

test("hiddenReason: a column piece js/ui/hud.js dropped for want of room says so, softly, until it is placed", () => {
  for (const id of ["strat", "rel", "inputs", "damage", "limits", "sectors"]) {
    const L = load3({ live: true, classes: ["desktop"] });
    const sel = L.H.ELEMENTS.find((e) => e[0] === id)[2];
    const el = L.els[sel] || (L.els[sel] = fakeEl());
    el.getBoundingClientRect = () => ({ left: 10, top: 200, right: 140, bottom: 240, width: 130, height: 40 });   // laid out …
    el.setAttribute("data-col-drop", "");                                                                      // … but invisible
    const r = L.H.hiddenReason(id);
    assert.ok(r && r.soft && /no room/.test(r.reason), id + ": " + JSON.stringify(r));
    el.setAttribute("data-hl-user", "");   // the player placed it: the allocator lets go of it
    el.removeAttribute("data-col-drop");
    assert.equal(L.H.hiddenReason(id), null, id + " placed: drawn");
  }
});

test("hiddenReason: classes name the reason; the live element has the last word", () => {
  const h = (o) => load3(o).H;
  assert.equal(h({ classes: ["hud-prof-minimal"], live: false }).hiddenReason("ot").reason, "MINIMAL style");
  assert.equal(h({ classes: ["hud-prof-minimal"], live: false }).hiddenReason("ot").soft, false);
  assert.equal(h({ classes: ["hud-met-compact"], live: false }).hiddenReason("tyre").reason, "LAYOUT is COMPACT");
  assert.equal(h({ classes: ["hud-met-driver"], live: false }).hiddenReason("sectors").reason, "LAYOUT is DRIVER");
  assert.equal(h({ classes: ["hud-bcam"], live: false }).hiddenReason("gearbox").reason, "TV camera");
  assert.equal(h({ classes: ["hud-bcam", "hud-prof-broadcast"], live: false }).hiddenReason("sectors"), null, "broadcast style keeps sectors on TV cams");
  assert.match(h({ classes: ["hud-bcam", "hud-prof-broadcast"], live: false }).hiddenReason("tyre").reason, /BROADCAST/);
  assert.match(h({ classes: ["hud-hide-map"], live: false }).hiddenReason("map").reason, /MAP is off/);
  assert.match(h({ classes: ["hud-hide-gaps"], live: false }).hiddenReason("gaps").reason, /GAPS is off/);
  assert.match(h({ hide: "pos energy", live: false, classes: ["desktop"] }).hiddenReason("energy").reason, /HUD element list/);
  assert.match(h({ hide: "speed", live: false, classes: ["desktop"] }).hiddenReason("speed").reason, /HUD element list/,
    "SPEED off in the element list greys MOVE & SIZE (TOGGLE.speed)");
  assert.match(h({ classes: ["cockpit-cam", "desktop"], live: false }).hiddenReason("gearbox").reason, /wheel/);
  assert.match(h({ classes: ["cockpit-cam", "desktop"], live: false }).hiddenReason("speed").reason, /wheel/,
    "cockpit-cam hard-hides SPEED with GEAR (no data-hl-user escape)");
  assert.match(h({ classes: ["hud-prof-broadcast", "hud-bcam"], live: false }).hiddenReason("speed").reason, /BROADCAST/,
    "BROADCAST+TV hides .hud-bottom including SPEED");
  assert.equal(h({ classes: ["hud-bcam"], live: false }).hiddenReason("speed"), null,
    "plain TV cams keep plated SPEED (css/hud.css)");
  // The touch-cockpit row follows the cockpit LAYOUT set (setCam), not the wheel LCD.
  const hc = (o) => { const x = h(o); x.setCam("cockpit"); return x; };
  const touch = hc({ classes: ["cockpit-cam"], live: false }).hiddenReason("ot");
  assert.equal(touch.soft, true, "a touch cockpit chip shows once placed: sliders stay");
  const tyT = hc({ classes: ["cockpit-cam"], live: false }).hiddenReason("tyre");
  assert.equal(tyT.soft, true, "TYRES too: hidden on a touch cockpit until placed");
  assert.match(tyT.reason, /touch cockpit/);
  assert.equal(hc({ classes: ["cockpit-cam", "desktop"], live: false }).hiddenReason("tyre"), null, "a desktop cockpit shows TYRES beside the wheel");
  assert.equal(hc({ classes: ["cockpit-cam", "desktop"], live: false }).hiddenReason("ot"), null);
  assert.equal(h({ classes: ["desktop"], live: false }).hiddenReason("tower"), null);
  assert.equal(h({ live: false }).hiddenReason("flag").soft, true, "event chips are edited blind, not locked");
  // TOUCH: RELATIVE sits under the minimap, INPUTS under the sector box.
  // STRATEGY keeps its --hud-left-h home and steps right while RELATIVE is on.
  assert.equal(h({ live: false }).hiddenReason("strat"), null, "touch STRATEGY shows at its touch home");
  assert.equal(h({ live: false }).hiddenReason("rel"), null, "touch RELATIVE has a home under the map");
  assert.equal(h({ live: false }).hiddenReason("inputs"), null, "touch INPUTS has a home under the sectors");
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /body:not\(\.desktop\) #hud-rel:not\(\[data-hl-user\]\)/);
  assert.doesNotMatch(css, /body:not\(\.desktop\) :is\(#hud-rel, #hud-inputs\):not\(\[data-hl-user\]\) \{ display: none; \}/);
  // The left column is ALLOCATED (js/ui/hud.js placeLeftColumn: --lcol-y-* / --lcol-x-*); fitHud's
  // measured --hud-left-h anchor is the first paint's fallback, and the literal steps are gone.
  assert.match(css, /body:not\(\.desktop\) #hud-strat \{[\s\S]*?top: calc\(var\(--lcol-y-strat, calc\(\(var\(--hud-left-h, 152px\) \+ 8px\) \* var\(--hud-z\)\)\) \/ var\(--hud-z\)\)/,
    "touch STRATEGY sits in the allocated left column, falling back to the measured --hud-left-h, not a bare 152px");
  assert.match(css, /body:not\(\.desktop\) #hud-rel:not\(\[data-hl-user\]\) \{[\s\S]*?top: calc\(var\(--lcol-y-rel, calc\(\(var\(--hud-left-h, 152px\) \+ 8px\) \* var\(--hud-z\)\)\) \/ var\(--hud-z\)\)/,
    "touch RELATIVE uses the same allocated left column");
  assert.doesNotMatch(css, /#hud-strat[^{]*\{[^}]*168px/, "no literal STRATEGY sidestep: the allocator puts it beside RELATIVE by RELATIVE's measured width");
  assert.doesNotMatch(css, /:root\[data-limits-left\] #hud-strat/, "no reserved 2.6em for a LIMITS chip that is not showing");
  assert.match(css, /:is\(#hud-sectors, #hud-limits, #hud-damage, #hud-inputs, #hud-rel, #hud-strat\)\[data-col-drop\] \{ visibility: hidden !important; \}/,
    "a piece with no free slot is dropped (still laid out), not painted over a control");
  assert.match(css, /@supports \(anchor-name: --a\)[\s\S]*#dock-left \{ anchor-name: --apex-dock-left; \}[\s\S]*#hud-tyre \{[^}]*position-anchor: --apex-dock-left;[^}]*bottom: calc\(anchor\(top\)/,
    "touch TYRES sits on top of the left dock");
  assert.match(css, /body:not\(\.desktop\) #hud-sectors \{[\s\S]*?right:\s*calc\(10px \+ var\(--sar\) \/ var\(--hud-z\) \+ var\(--dock-r-w, 0px\)\)/,
    "phone sectors (tilt/touch/buttons) take the same --dock-r-w clearance as limits/damage");
  // Only the lane slots placeRadio (js/ui/hud.js) picks read the lane's left — no :not() chain of the other slots.
  assert.match(css, /body\[data-radio-slot="lane"\] #announce,\s*body\[data-radio-slot="collapsed"\] #announce \{[\s\S]*?left: calc\(var\(--announce-lane-x\) \/ var\(--hud-z\)\)/,
    "touch #announce sits in the published dock lane, not at 10px+sal over TILT's left dock");
  assert.doesNotMatch(css, /body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\.hud-prof-broadcast\)[^{]*#announce \{[\s\S]*?left: calc\(10px \+ var\(--sal\)/,
    "the under-map announce park is gone — it sat on BRAKE / BOOST / SHIFT");
  assert.doesNotMatch(css,
    /body:not\(\.desktop\) #hud-sectors \{[^}]*position-anchor: --apex-dock-right/,
    "phone sectors clear BOOST via measured --dock-r-w only (#1191 anchor max overshot into #announce)");
  // OVERTAKE / CORNER MODE: cockpit --hl-x must not shove the chips under the
  // right dock when taps/shifts are lit (hud-survey aero×shift-up + Bryce OT/BOOST).
  assert.match(css, /body:has\(\.dock \.touchbtn:not\(\[hidden\]\)\) :is\(#hud-ot, #hud-aero\)\[data-hl\]\s*\{[^}]*translate:\s*0\s+calc\(var\(--hl-y/,
    "lit docks cancel horizontal --hl-x on OVERTAKE / CORNER MODE so AERO×shift-up stays clear");
  // The four opt-in readouts hide on the same classes css/hud.css uses for them.
  for (const id of ["damage", "rel", "strat", "inputs"]) {
    assert.match(h({ hide: id, live: false, classes: ["desktop"] }).hiddenReason(id).reason, /HUD element list/, id + " off");
    assert.equal(h({ classes: ["hud-prof-minimal", "desktop"], live: false }).hiddenReason(id).reason, "MINIMAL style", id);
    assert.equal(h({ classes: ["hud-bcam", "desktop"], live: false }).hiddenReason(id).reason, "TV camera", id);
    assert.equal(h({ classes: ["bc-on", "desktop"], live: false }).hiddenReason(id).soft, false, id + " in a broadcast replay");
    assert.equal(h({ classes: ["desktop"], live: false }).hiddenReason(id), null, id + " shown on desktop");
  }
  // Data Hub WATCH / HIGHLIGHTS: the driving HUD stays off. Pause, the
  // timing tower and the PiP stay; the radio card does not.
  const replayOff = ["tower", "map", "gaps", "sectors", "limits", "flag", "mirror", "announce", "gearbox", "speed", "energy", "tyre", "ot", "aero", "bb", "damage", "rel", "strat", "inputs"];
  for (const id of replayOff) {
    for (const cls of ["bc-on", "watch-controls-on"]) {
      const why = h({ classes: [cls, "desktop"], live: false }).hiddenReason(id);
      assert.equal(why && why.soft, false, id + " stays off under " + cls);
      assert.match(why.reason, /driving HUD/, id + " under " + cls);
    }
  }
  assert.equal(h({ classes: ["desktop"], live: false }).hiddenReason("announce").soft, true, "a race still shows messages");
  const hides = (src, cls, id) => new RegExp(
    "body\\." + cls + "[\\s\\S]{0,160}" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]{0,80}\\{[^}]*display:\\s*none !important"
  ).test(src);
  for (const id of ["#hud-dock", "#hud-speed", "#hud-flag", "#hud-mirror", ".touchbtn", "#minimap", ".hud-top", "#announce", "#btn-cam", "#lights"]) {
    assert.equal(hides(css, "bc-on", id), true, "bc-on hides " + id);
  }
  for (const id of ["#bc-tower", "#bc-pip", "#pausebtn"]) {
    assert.equal(hides(css, "bc-on", id), false, "bc-on keeps " + id);
  }
  const wt = fs.readFileSync(path.join(ROOT, "css/watch-transport.css"), "utf8");
  assert.doesNotMatch(wt, /#hud-dock \{ visibility: hidden/, "the dock is not merely visibility-hidden");
  for (const id of ["#hud-dock", "#hud-speed", "#hud-flag", ".touchbtn", "#announce", "#btn-cam"]) {
    assert.equal(hides(wt, "watch-controls-on", id), true, "replay bar hides " + id);
  }
  // Live: a drawn element is never marked, whatever the classes say.
  const L = load3({ classes: ["hud-prof-minimal"], live: true });
  const ot = L.els["#hud-ot"] || (L.els["#hud-ot"] = fakeEl());
  ot.getBoundingClientRect = () => ({ width: 80, height: 20 });
  assert.equal(L.H.hiddenReason("ot"), null);
  ot.getBoundingClientRect = () => ({ width: 0, height: 0 });
  assert.equal(L.H.hiddenReason("ot").reason, "MINIMAL style");
  // TYRE WEAR off = the HUD set #hud-tyre[hidden], only trusted while racing.
  const T = load3({ classes: ["desktop"], live: true });
  const ty = T.els["#hud-tyre"] || (T.els["#hud-tyre"] = fakeEl());
  ty.hidden = true;
  assert.match(T.H.hiddenReason("tyre").reason, /TYRE WEAR/);
  const top = T.els[".hud-top"] || (T.els[".hud-top"] = fakeEl());
  top.hidden = true;
  assert.deepEqual(plain(T.H.hiddenReason("tower")), { reason: "hidden right now", soft: true });
});

test("MIRROR: off is hard; soft-hidden until placed; placing turns MIRROR on", () => {
  // DISPLAY › HUD › MIRROR off greys MOVE & SIZE (hard), like the element list.
  const off = load3({ classes: ["desktop"], live: true, stored: { hudMirror: "off" }, mirror: { mode: "off" } });
  const mirOff = off.els["#hud-mirror"] || (off.els["#hud-mirror"] = fakeEl());
  mirOff.hidden = true;
  const rOff = off.H.hiddenReason("mirror");
  assert.ok(rOff && !rOff.soft && /MIRROR is off/.test(rOff.reason), "off is hard: " + JSON.stringify(rOff));

  // AUTO / not drawn: soft note, sliders stay — a place cures it.
  const soft = load3({ classes: ["desktop"], live: true, stored: { hudMirror: "auto" }, mirror: { mode: "auto" } });
  const mir = soft.els["#hud-mirror"] || (soft.els["#hud-mirror"] = fakeEl());
  mir.hidden = true;
  const rSoft = soft.H.hiddenReason("mirror");
  assert.ok(rSoft && rSoft.soft && /not needed/.test(rSoft.reason), "soft until placed: " + JSON.stringify(rSoft));

  // Placing (non-shipped offset → data-hl-user) flips MirrorPass to ON and clears hidden.
  soft.H.set("mirror", { x: 5 }, "other");
  assert.equal(soft.written.hudMirror, "on", "place sets HUD › MIRROR to ON");
  assert.equal(mir.hidden, false, "place clears #hud-mirror[hidden]");
  assert.ok(clsHas(soft, "hud-mirror-on"), "place paints hud-mirror-on for peek/fit");
  assert.equal(soft.H.hiddenReason("mirror"), null, "placed mirror is no longer soft-hidden");

  // Session collapse: place clicks the chip then forces ON.
  const col = load3({ classes: ["desktop"], live: true, stored: { hudMirror: "on" }, mirror: { mode: "on", collapsed: true } });
  const mirC = col.els["#hud-mirror"] || (col.els["#hud-mirror"] = fakeEl());
  mirC.hidden = true;
  assert.ok(col.H.hiddenReason("mirror").soft, "collapsed mirror is soft");
  col.H.set("mirror", { y: -3 }, "other");
  assert.equal(col.byId["hud-mirror-chip"].hidden, true, "place clears the collapse chip");
  assert.equal(mirC.hidden, false);
});

function clsHas(L, c) { return L.cls.has(c); }

test("empty #hud-sectors plate collapses — no junk gap before buildSecRows", () => {
  assert.match(CSS, /#hud-sectors:empty\s*\{\s*display:\s*none/,
    "empty sector plate hides fully (padding must not reserve a gap)");
});

test("TRACK LIMITS origin follows its live anchor (:root[data-limits-left])", () => {
  const L = load3({ stored: { hudLayout: { v: 3, standard: { other: { limits: { x: 0, y: 0, s: 150 } } } } } });
  assert.equal(L.els["#hud-limits"].props["--hl-o"], "top right");
  assert.equal(L.H.originOf("limits"), "top right");
  L.rootAttrs["data-limits-left"] = "1";
  assert.equal(L.H.originOf("limits"), "top left");
  L.H.apply();
  assert.equal(L.els["#hud-limits"].props["--hl-o"], "top left");
  assert.equal(L.H.originOf("sectors"), "top right", "only the chip that crosses changes");
});

test("apply() asks GameHud to re-fit at once (typeof-guarded)", () => {
  let n = 0;
  const L = load3({ gameHud: { invalidateFit: () => { n++; } } });
  const before = n;
  L.H.set("map", { x: 3 }, "other");
  assert.ok(n > before, "a move invalidates the fit");
  assert.doesNotThrow(() => load3({ gameHud: {} }).H.set("map", { x: 3 }, "other"));
});

// HELMET — the visor HUD (reported 2026-10-05 from a phone: "the HUD isn't
// really showing with helmet camera"). Its own set: no cockpit-cam, so gear and
// speed paint; a desktop stacks them left of the wheel over the cockpit strip;
// a touch screen takes TOUCH_SHIPPED (ENERGY above the wheel, TYRES in the left
// corner) and leaves gear / OT / AERO / BB to the LCD glyph and the buttons.
test("HELMET ships its own layout: the cockpit strip plus GEAR and SPEED on a desktop, a touch strip of its own on a phone", () => {
  const D = load3({ classes: ["desktop"], live: false });
  for (const id of ["energy", "tyre", "ot", "aero", "bb"]) assert.deepEqual(plain(D.H.get(id, "helmet")), plain(D.H.get(id, "cockpit")), id + ": the cockpit strip");
  assert.ok(D.H.get("gearbox", "helmet").x <= -25 && D.H.get("gearbox", "helmet").y < 0, "GEAR left of the wheel and up");
  assert.ok(D.H.get("speed", "helmet").x <= -25 && D.H.get("speed", "helmet").y < D.H.get("gearbox", "helmet").y, "SPEED above GEAR");
  assert.deepEqual(plain(D.H.get("gearbox", "cockpit")), { x: 0, y: 0, s: 100 }, "the cockpit still leaves gear to the LCD");
  D.H.setCam("helmet");
  assert.equal(D.els["#hud-gearbox"].props["--hl-x"], String(D.H.SHIPPED.standard.helmet.gearbox.x));
  const T = load3({ classes: [], live: false });   // a touch screen: no body.desktop
  assert.deepEqual(plain(T.H.get("energy", "helmet")), plain(T.H.TOUCH_SHIPPED.helmet.energy));
  assert.ok(T.H.get("energy", "helmet").y >= -10 && T.H.get("energy", "helmet").y <= -2,
    "ENERGY stays in the bottom strip beside TYRES, not mid-visor over the wheel");
  assert.ok(T.H.get("tyre", "helmet").x === 0 && T.H.get("tyre", "helmet").y < 0, "TYRES stays in the left corner, lifted off the steer buttons");
  assert.deepEqual(plain(T.H.get("gearbox", "helmet")), { x: 0, y: 0, s: 100 }, "GEAR takes the LCD's place: the row's own centre");
  assert.ok(T.H.get("speed", "helmet").x > 0 && T.H.get("speed", "helmet").y === 0, "SPEED moves right of GEAR");
  for (const id of ["ot", "aero", "bb"]) assert.deepEqual(plain(T.H.get(id, "helmet")), { x: 0, y: 0, s: 100 }, id + ": shipped on touch");
  assert.deepEqual(plain(T.H.get("energy", "cockpit")), plain(D.H.get("energy", "cockpit")), "the cockpit strip is the same on both");
  assert.equal(T.H.isShipped("helmet"), true);
  T.H.set("energy", { y: -40 }, "helmet");
  assert.equal(T.H.isShipped("helmet"), false);
  T.H.set("energy", plain(T.H.TOUCH_SHIPPED.helmet.energy), "helmet");
  assert.equal(T.written.hudLayout, null, "writing the touch default stores nothing");
});

test("touch HELMET hides only what the LCD glyph and the buttons carry; ENERGY and TYRES show (CSS and hiddenReason agree)", () => {
  const T = load3({ classes: [], live: false });
  T.H.setCam("helmet");
  for (const id of ["ot", "aero", "bb"]) {
    const r = T.H.hiddenReason(id);
    assert.ok(r && /touch helmet/.test(r.reason) && r.soft, id + ": " + JSON.stringify(r));
  }
  for (const id of ["energy", "tyre", "speed", "gearbox"]) assert.equal(T.H.hiddenReason(id), null, id + " shows in a touch helmet");
  // With a wheel LCD the floating SPEED is a duplicate — soft-hide until placed
  // (css/track-detail.css data-helmet-cam + data-wheel-lcd; MOVE & SIZE notes it).
  assert.match(TD, /body\[data-helmet-cam\]\[data-wheel-lcd\]:not\(\.desktop\) #hud-speed:not\(\[data-hl-user\]\) \{ display: none; \}/);
  const lcd = load3({ classes: [], live: false, bodyAttrs: { "data-helmet-cam": "", "data-wheel-lcd": "" } });
  lcd.H.setCam("helmet");
  const spd = lcd.H.hiddenReason("speed");
  assert.ok(spd && spd.soft && /wheel LCD/.test(spd.reason), "touch helmet + LCD soft-hides SPEED: " + JSON.stringify(spd));
  assert.equal(lcd.H.hiddenReason("gearbox"), null, "GEAR stays on the visor pill with an LCD");
  const placed = load3({ classes: [], live: false, bodyAttrs: { "data-helmet-cam": "", "data-wheel-lcd": "" },
    stored: { hudLayout: { v: 3, standard: { helmet: { speed: { x: 5, y: 0, s: 100 } } } } } });
  placed.H.setCam("helmet");
  assert.equal(placed.H.hiddenReason("speed"), null, "a placed SPEED (data-hl-user) shows beside the LCD");
  const rule = TD.match(/body\[data-hl-set="helmet"\]:not\(\.desktop\) :is\(([^)]*)\):not\(\[data-hl-user\]\)\s*\{\s*display:\s*none/);
  assert.ok(rule, "the touch-helmet hide rule exists");
  // GEAR sits on the wheel LCD — plate-opaque so SPD/G on the mesh does not ghost through.
  assert.match(CSS, /body\[data-hl-set="helmet"\] #hud-gearbox[\s\S]*?background:\s*var\(--plate-opaque\)/,
    "helmet GEAR pill masks the LCD underneath");
  assert.deepEqual(rule[1].split(",").map((x) => x.trim()).sort(), ["#hud-aero", "#hud-bb", "#hud-ot"]);
  const D = load3({ classes: ["desktop"], live: false });
  D.H.setCam("helmet");
  for (const id of ["gearbox", "speed", "energy", "tyre", "ot", "aero", "bb"]) assert.equal(D.H.hiddenReason(id), null, id + " shows on a desktop helmet");
  assert.ok(D.H.ELEMENTS.some((e) => e[0] === "speed" && e[2] === "#hud-speed"), "SPEED is a MOVE & SIZE piece of its own");
  // No cockpit-cam in HELMET: mode-switch.js keys the LCD hide on COCKPIT alone.
  const ms = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  assert.match(ms, /"cockpit-cam", camId === "cockpit"\s*&& \(typeof CockpitOpts === "undefined" \|\| CockpitOpts\.wheelHasScreen\(\)\)\);/);
  assert.match(ms, /toggleAttribute\("data-helmet-cam", camId === "helmet"\)/, "the visor frame stays");
});
