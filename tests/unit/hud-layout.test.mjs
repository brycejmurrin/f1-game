/* hud-layout — per-element HUD move/size store, cockpit vs other layouts, and
   the --hl-* / data-hl paint the css/hud.css rule reads. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

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
  // settlePaint / forceHudFit are sibling helpers (#2825 / #2941); stub so race() resolves.
  const ctx=vm.createContext({BOOT_MS:60_000,PIN_PREVIOUS_LOOK:()=>{},settlePaint:async()=>{},forceHudFit:async()=>{},localStorage:{setItem(){}},requestAnimationFrame:(fn)=>fn(),
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
  // Initial jump after camera, then the readiness wait forces another fit while
  // frozen so --hud-top-h can catch CSS zoom (#2941).
  assert.deepEqual(timeline,["hold physics","hold renderer","camera:heli","refresh:heli","refresh:heli"]);
});

test("broadcast layout probe waits for paint, camera and published tower height, not collision results", async () => {
  const spec=fs.readFileSync(path.join(ROOT,"tests/specs/hud-layout.spec.js"),"utf8");
  // #2825: double-rAF is settlePaint() before the wait; the predicate stays synchronous.
  assert.match(spec, /await settlePaint\(page\);\s*\n\s*await page\.waitForFunction\(\(broadcastCamera\) => \{/,
    "paint settles outside waitForFunction so the predicate can be sync");
  assert.doesNotMatch(spec, /waitForFunction\(async \(broadcastCamera\)/,
    "broadcast waitForFunction predicate must not be async");
  const start = spec.indexOf("await page.waitForFunction((broadcastCamera) => {");
  assert.ok(start >= 0, "the broadcast helper carries its bounded input-readiness predicate");
  const end = spec.indexOf("}, o.cam === \"heli\"", start);
  assert.ok(end > start, "broadcast predicate ends before o.cam");
  const predSrc = spec.slice(start + "await page.waitForFunction(".length, end + 1);
  let broadcast=false, published="", height=132.04, zoom=2, queries=0;
  const ctx=vm.createContext({document:{
    body:{classList:{contains:()=>broadcast}},
    querySelector:(selector)=>{
      queries++;
      assert.equal(selector,".hud-top","readiness must not wait for map/gap overlap results");
      return {currentCSSZoom:zoom,getBoundingClientRect:()=>({height,top:8,bottom:8+height})};
    },
    documentElement:{style:{getPropertyValue:()=>published}},
  }});
  const ready=vm.runInContext("("+predSrc+")",ctx);
  assert.equal(ready(true),false,"camera class has not caught up");
  broadcast=true; assert.equal(ready(true),false,"height is not published yet");
  published="0px"; assert.equal(ready(true),false,"initial zero height is stale");
  published="40px"; assert.equal(ready(true),false,"old tower height is stale");
  published="66.0px"; assert.equal(ready(true),true,"own units honor zoom and toFixed(1) rounding");
  assert.ok(queries > 0, "sync predicate reads layout");
  // fitHud re-publishes --hud-top-h AFTER writing --hud-z-top so a zoom cap
  // in the same pass cannot leave the wait 0.1px behind.
  const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  const fit = hud.slice(hud.indexOf("function fitHud("), hud.indexOf("function paintInstruments"));
  const zTop = fit.indexOf('set("--hud-z-top"');
  const republish = fit.indexOf('hStyle(root, "--hud-top-h"', zTop);
  assert.ok(zTop >= 0 && republish > zTop, "--hud-top-h must be published after the top zoom cap");
  height=0; published="0px"; assert.equal(ready(true),false,"hidden tower is not ready");
  height=132; zoom=1; published="132px"; assert.equal(ready(true),true);
});

function fakeEl() {
  const props = {}, attrs = {};
  return {
    props, attrs,
    style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; }, getPropertyValue(k) { return props[k] || ""; } },
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
  assert.deepEqual(JSON.parse(JSON.stringify(written.hudLayout)), { v: 4, standard: { cockpit: {}, helmet: {}, other: { map: { x: 5, y: 0, s: 150 } } } });
  const m = els["#minimap"];
  assert.equal(m.attrs["data-hl"], "");
  assert.equal(m.props["--hl-x"], "5");
  assert.equal(m.props["--hl-s"], "1.5");
  assert.equal(m.props["--hl-o"], "top left");
  assert.equal("data-hl" in els[".hud-top"].attrs, false);
});

test("unbounded values survive; explicit reset clears the element and the store", () => {
  const { H, written, els } = load();
  assert.deepEqual({ ...H.set("tower", { x: 999, y: -999, s: 10 }, "other") }, { x: 999, y: -999, s: 10 });
  H.resetEl("tower", "other");
  assert.equal(written.hudLayout, null);
  assert.equal("data-hl" in els[".hud-top"].attrs, false);
  assert.equal(els[".hud-top"].props["--hl-x"], undefined);
});

test("cockpit and other cameras keep separate layouts; setCam swaps them", () => {
  const { H, els } = load({ hudLayout: { v: 4, standard: { cockpit: { tyre: { x: -30, y: 0, s: 100 } }, other: {} } } });
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
  assert.equal((src.match(/@media \(orientation: portrait\) and \(max-width: 500px\)/g) || []).length, 2,
    "tower/map stack plus the unpublished-lane radio fallback, both after the rules they beat");
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
  assert.deepEqual(plain(written.hudLayout.standard.cockpit.tyre), plain(H.SHIPPED.standard.cockpit.tyre),
    "an explicit default owns placement until reset");
  H.resetEl("tyre", "cockpit");
  assert.equal(written.hudLayout, null);
});

test("every element retains unbounded fractional values in every camera and style", () => {
  const { H, written } = load();
  const value = { x: 1250.25, y: -975.125, s: .125 };
  for (const profile of H.PROFILES) for (const camera of H.SETS) for (const [id] of H.ELEMENTS) {
    assert.deepEqual(plain(H.set(id, value, camera, profile)), value, `${profile}/${camera}/${id}`);
  }
  const restored = load(JSON.parse(JSON.stringify(written))).H;
  for (const profile of H.PROFILES) for (const camera of H.SETS) for (const [id] of H.ELEMENTS) {
    assert.deepEqual(plain(restored.get(id, camera, profile)), value, `${profile}/${camera}/${id} round trip`);
    assert.equal(restored.set(id, { s: 12500.5 }, camera, profile).s, 12500.5);
  }
});

test("invalid numeric edits retain prior values and explicit defaults remain owned until reset", () => {
  const { H, written, els } = load();
  const value = { x: 110.25, y: -245.5, s: .25 };
  H.set("map", value, "other");
  for (const bad of [NaN, Infinity, -Infinity, "", " ", null, undefined, {}, []]) {
    assert.deepEqual(plain(H.set("map", { x: bad, y: bad, s: bad }, "other")), value);
  }
  for (const bad of [0, -1, -100]) assert.equal(H.set("map", { s: bad }, "other").s, value.s);
  H.set("map", { x: 0, y: 0, s: 100 }, "other");
  assert.deepEqual(plain(written.hudLayout.standard.other.map), { x: 0, y: 0, s: 100 });
  assert.equal("data-hl-user" in els["#minimap"].attrs, true);
  H.resetEl("map", "other");
  assert.equal(written.hudLayout, null);
  assert.equal("data-hl-user" in els["#minimap"].attrs, false);
});

test("invalid first edits leave automatic ownership intact while valid defaults and mixed edits claim it", () => {
  const { H, written, els } = load();
  for (const [id, selector] of [["map", "#minimap"], ["energy", "#hud-energy"]]) {
    const before = plain(H.get(id, "other"));
    for (const value of [{ s: "" }, { s: 0 }, { s: -1 }, { x: NaN }, { y: Infinity },
      { x: null, y: undefined, s: " " }, {}, null, 0, false, "", []]) {
      assert.deepEqual(plain(H.set(id, value, "other")), before);
      assert.equal(written.hudLayout, undefined, "invalid input does not create or rewrite storage");
      assert.equal("data-hl-user" in els[selector].attrs, false, `${id} remains automatically placed`);
      assert.equal("data-hl-v4" in els[selector].attrs, false, `${id} does not acquire a manual anchor`);
    }
  }
  H.set("map", { x: 0, y: 0, s: 100 }, "other");
  assert.equal("data-hl-user" in els["#minimap"].attrs, true, "valid explicit defaults claim manual ownership");
  assert.deepEqual(plain(H.set("energy", { x: 150.25, s: 0 }, "other")), { x: 150.25, y: 0, s: 100 },
    "a valid field is saved while invalid fields retain their previous values");
  assert.equal("data-hl-user" in els["#hud-energy"].attrs, true);
});

test("old layout formats are ignored and fresh edits/reset use the current schema", () => {
  for (const version of [undefined, 1, 2, 3, 999]) {
    const old = { v: version, cockpit: { tyre: { x: -40, s: 150 } },
      other: { map: { x: -30, s: 125 } }, standard: { other: { map: { x: -30, s: 125 } } } };
    const { H, written } = load({ hudLayout: old });
    assert.equal(H.isShipped(undefined, "all"), true, "unsupported schemas start with automatic defaults");
    assert.deepEqual(plain(H.get("map", "other")), { x: 0, y: 0, s: 100 });
    H.set("map", { x: 150.25, s: .125 }, "other");
    assert.deepEqual(plain(written.hudLayout), { v: 4, standard: {
      cockpit: {}, helmet: {}, other: { map: { x: 150.25, y: 0, s: .125 } },
    } });
    H.resetEl("map", "other");
    assert.equal(written.hudLayout, null);
  }
});

test("current layout imports and round trips contain plain position and size values only", () => {
  const value = { x: -1500.5, y: 800.25, s: .125 };
  const raw = { v: 4, standard: { other: {
    map: { ...value, legacy: true, box: { w: 88, h: 14 }, ignored: "extra" }, gaps: { s: -1 },
  } } };
  const { H, written } = load({ hudLayout: raw });
  assert.deepEqual(plain(H.migrate(raw).standard.other.map), value);
  assert.deepEqual(plain(H.get("map", "other")), value);
  assert.equal(H.get("gaps", "other").s, 100, "invalid size falls back to a positive default");
  H.set("map", { s: 25000.5 }, "other");
  assert.deepEqual(plain(written.hudLayout.standard.other.map), { ...value, s: 25000.5 });
  const restored = load(JSON.parse(JSON.stringify(written)));
  assert.deepEqual(plain(restored.H.get("map", "other")), { ...value, s: 25000.5 });
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
  for (const camera of ["cockpit", "other"]) {
    assert.equal(H.presetOf(camera), "shipped");
    assert.equal(H.isShipped(camera), true, "SHIPPED preset restores automatic placement ownership");
  }
  assert.equal(written.hudLayout, null);
});

test("CORNERS on a touch cockpit does not pull ENERGY or TYRES onto the steer column", () => {
  const T = load3({ classes: [], live: false });
  const lay = T.H.presetLayout("corners", "cockpit");
  assert.deepEqual(plain(lay.energy), plain(T.H.get("energy", "cockpit")));
  assert.deepEqual(plain(lay.tyre), plain(T.H.get("tyre", "cockpit")));
  assert.equal(lay.energy.x, T.H.SHIPPED.standard.cockpit.energy.x);
  T.H.applyPreset("corners", "cockpit");
  const stored = T.written.hudLayout?.standard?.cockpit || {};
  assert.equal(stored.energy, undefined, "unchanged preset instruments retain automatic fitting");
  assert.equal(stored.tyre, undefined, "unchanged preset tyres retain automatic fitting");
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

test("fit retains a moved piece beyond the screen at its stored offset", () => {
  const src = SRC;
  const props = {}, attrs = { "data-hl": "" };
  const el = {
    style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
    // 100px wide map at x=5 vw on a 1000px screen, pushed 60 px past the right edge.
    getBoundingClientRect() { const x = parseFloat(props["--hl-x"] || 0) * 10; return { left: 900 + x - 50, right: 1000 + x - 50 + 60, top: 10, bottom: 110, width: 160, height: 100 }; },
  };
  const written = { hudLayout: { v: 4, standard: { cockpit: {}, other: { map: { x: 5, y: 0, s: 100 } } } } };
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
  assert.equal(r.right, 1060, "the player can leave the right edge outside the screen");
  assert.equal(ctx.HudLayout.get("map", "other").x, 5, "stored offset unchanged");
});

test("fit preserves manual geometry across safe-area and visual-viewport changes", () => {
  const props = {}, root = {}, attrs = { 'data-hl': '' };
  const viewport = { innerWidth: 1000, innerHeight: 600,
    visualViewport: { width: 500, height: 300, offsetLeft: 200, offsetTop: 100 } };
  const map = { style: { setProperty(k,v) { props[k]=v; }, removeProperty(k) { delete props[k]; } },
    setAttribute(k,v) { attrs[k]=v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute: k => k in attrs,
    getBoundingClientRect() {
      const left = 900 + (parseFloat(props['--hl-x']) || 0) * 10, top = 10 + (parseFloat(props['--hl-y']) || 0) * 6;
      return { left, top, right: left+160, bottom: top+100, width: 160, height: 100 };
    } };
  const saved = { v:4, standard:{other:{map:{x:5,y:0,s:110}}} }, original = JSON.stringify(saved);
  const ctx = { window: viewport, console,
    getComputedStyle: el => el === root ? { getPropertyValue: k => ({'--sal':'30px','--sar':'20px','--sat':'15px','--sab':'10px'}[k] || '') } : {display:'block',visibility:'visible'},
    document: {readyState:'loading',documentElement:root,addEventListener(){},getElementById:()=>null,
      querySelector: sel => sel === '#minimap' ? map : null, querySelectorAll:()=>[]},
    GameStore:{store:{get:(k,d)=>k==='hudLayout'?saved:d,set(){throw new Error('fit must not persist');}}} };
  vm.createContext(ctx);vm.runInContext(SRC+';this.HudLayout=HudLayout;',ctx);
  ctx.HudLayout.apply();
  const initial = map.getBoundingClientRect();
  for (const vv of [viewport.visualViewport, {width:250,height:200,offsetLeft:50,offsetTop:40}, null]) {
    viewport.visualViewport = vv;
    ctx.HudLayout.fit();
    assert.deepEqual(map.getBoundingClientRect(), initial, "safe bounds do not clamp an edited widget");
    const before = { ...props };ctx.HudLayout.fit();assert.deepEqual(props,before,'repeated fits do not drift');
    assert.equal(JSON.stringify(saved),original);
  }
});

test("fit preserves independently edited pieces sharing an offset", () => {
  // OT and AERO both ship +30vw in the cockpit; at 1000 wide only AERO overruns
  // the right edge. Clamped one by one, AERO landed on top of OT.
  const mk = (left, w) => {
    const props = {}, attrs = {};
    return {
      props,
      style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
      setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
      getBoundingClientRect() { const x = left + (parseFloat(props["--hl-x"] || 0) - 30) * 10; return { left: x, right: x + w, top: 500, bottom: 530, width: w, height: 30 }; },
    };
  };
  const ot = mk(880, 70), aero = mk(960, 100);   // at +30vw: OT 880-950, AERO 960-1060 (past 1000)
  const written = { hudLayout: { v: 4, standard: { cockpit: { ot: { x: 30, y: -14, s: 100 }, aero: { x: 30, y: -14, s: 100 } }, other: {} } } };
  const blank = { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false };
  const ctx = {
    console, window: { innerWidth: 1000, innerHeight: 600 },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {}, body: { classList: { contains: (c) => c === "desktop" } },
      querySelector: (sel) => (sel === "#hud-ot" ? ot : sel === "#hud-aero" ? aero : blank) },
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  ctx.HudLayout.setCam("cockpit");
  assert.ok(ot.hasAttribute("data-hl-user") && aero.hasAttribute("data-hl-user"), "stored STANDARD cockpit edits own both widgets");
  ctx.HudLayout.fit();
  const o = ot.getBoundingClientRect(), r = aero.getBoundingClientRect();
  assert.equal(r.right, 1060, "AERO keeps the requested offscreen edge");
  assert.ok(o.right <= r.left, `OT (${o.left}-${o.right}) still left of AERO (${r.left}-${r.right})`);
  assert.equal(ot.props["--hl-x"], "30");
  assert.equal(aero.props["--hl-x"], "30");
});

test("fit never brings an edited block on screen or pushes its edited neighbour", () => {
  // Desktop cockpit, HUD 150 % at 1440x900 (hud-mock 2026-10-14): ENERGY + TYRES ship at -30,-4 and TYRES runs
  // off the left edge; the clamp brought it back onto BRAKE BIAS (-18,0, its own block). At 100 % the clamp
  // leaves TYRES short of BRAKE BIAS, so BRAKE BIAS must keep its own offset.
  const run = (tyreW) => {
    const mk = (left, w, top, h, ship) => {
      const props = {}, attrs = {};
      return { props,
        style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
        setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
        getBoundingClientRect() { const x = left + (parseFloat(props["--hl-x"] || ship) - ship) * 14.4; return { left: x, right: x + w, top, bottom: top + h, width: w, height: h }; } };
    };
    const tyre = mk(4 - tyreW - 6, tyreW, 582, 75, -30), energy = mk(80, 285, 582, 27, -30), bb = mk(129, 92, 639, 40, -18);
    const written = { hudLayout: { v: 4, standard: { cockpit: { tyre: { x: -30, y: -4, s: 150 }, energy: { x: -30, y: -4, s: 150 }, bb: { x: -18, y: 0, s: 150 } }, other: {} } } };
    const blank = { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false };
    const by = { "#hud-tyre": tyre, "#hud-energy": energy, "#hud-bb": bb };
    const ctx = {
      console, window: { innerWidth: 1440, innerHeight: 900 },
      document: { readyState: "complete", getElementById: () => null, addEventListener() {}, body: { classList: { contains: (c) => c === "desktop" } },
        querySelector: (sel) => by[sel] || blank },
      GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
    };
    vm.createContext(ctx);
    vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
    ctx.HudLayout.setCam("cockpit");
    assert.ok([tyre, energy, bb].every((el) => el.hasAttribute("data-hl-user")), "stored STANDARD cockpit edits own all three widgets");
    ctx.HudLayout.fit();
    return { tyre: tyre.getBoundingClientRect(), bb: bb.getBoundingClientRect(), bbX: bb.props["--hl-x"] };
  };
  const at150 = run(195);
  assert.equal(at150.tyre.left, -197, "TYRES keeps the chosen offscreen position");
  assert.equal(at150.bbX, "-18", "BRAKE BIAS receives no neighbour correction");
  const at100 = run(120);
  assert.ok(at100.tyre.right < 129, "at 100 % the clamped TYRES stops short of BRAKE BIAS: " + at100.tyre.right);
  assert.equal(at100.bbX, "-18", "BRAKE BIAS keeps its own offset when nothing lands on it");
});

test("fit leaves size-only edited pieces at their requested positions", () => {
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
  const written = { hudLayout: { v: 4, standard: { cockpit: {}, other: { tower: { x: 0, y: 0, s: 200 }, map: { x: 0, y: 0, s: 125 } } } } };
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
  assert.equal(t.left, 432);
  assert.equal(t.right, 1072, "the enlarged tower may extend beyond the screen");
  assert.equal(m.left, 10, "the map, already on screen, is not dragged with the tower");
  assert.equal(map.props["--hl-x"], "0");
  assert.equal(ctx.HudLayout.get("tower", "other").s, 200, "stored size unchanged");
});

// Bug hunt 2 H17: clearControls rewrote --hl-x/--hl-y from the STORED offset plus only its
// own nudge, so the edge-clamp fit() had just applied was thrown away the moment a touch
// button forced a nudge, and the chip landed back off screen.
test("clearControls preserves manual placement and discards stale automatic clearance", () => {
  const W = 1000, H = 600;
  const props = {}, attrs = { "data-hl": "" };
  const rel = {
    style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; }, getPropertyValue(k) { return props[k] || ""; } },
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
    // 100 wide at 800 + --hl-x vw: stored +30vw is 204 px past the right edge before the clamp.
    getBoundingClientRect() { const x = 800 + parseFloat(props["--hl-x"] || 0) / 100 * W + parseFloat(props["--hud-clear-x"] || 0); return { left: x, right: x + 100, top: 500, bottom: 530, width: 100, height: 30 }; },
  };
  const btn = { hidden: false, classList: { contains: () => false },
    getBoundingClientRect: () => ({ left: 900, right: 1000, top: 400, bottom: 540, width: 100, height: 140 }) };
  const blank = { style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" }, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false };
  const written = { hudLayout: { v: 4, standard: { cockpit: {}, other: { rel: { x: 30, y: 0, s: 100 } } } } };
  const ctx = {
    console, window: { innerWidth: W, innerHeight: H },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {}, body: { classList: { contains: () => false } },
      querySelectorAll: () => [btn],
      querySelector: (sel) => (sel === "#hud-rel" ? rel : blank) },
    GameStore: { store: { get: (k, d) => (k in written ? written[k] : d), set: (k, v) => { written[k] = v; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  ctx.HudLayout.fit();
  const r = rel.getBoundingClientRect();
  assert.equal(r.right, 1200, "an edited widget is not brought back on screen");
  assert.equal(props["--hl-x"], "30", "control clearance cannot change the saved geometry");
  assert.equal(ctx.HudLayout.get("rel", "other").x, 30, "stored offset unchanged");
  // A prior terminal placement must not bias the next edge clamp. Simulate a
  // correction from a denser viewport before re-fitting the same saved move.
  const stable = rel.getBoundingClientRect(), saved = JSON.stringify(written);
  props["--hud-clear-x"] = "80px";
  ctx.HudLayout.fit();
  assert.deepEqual(rel.getBoundingClientRect(), stable, "edge clamp discards previous clearance before measuring");
  ctx.HudLayout.fit();
  assert.deepEqual(rel.getBoundingClientRect(), stable, "repeated user placement stays stable");
  assert.equal(JSON.stringify(written), saved, "temporary correction never writes settings");
});

// ---- per-style layouts, camera groups, hidden reasons, live origin ----------
// A harness with a body (classes + data-hud-hide), #hud (hidden = not racing),
// :root attributes and an optional GameHud.
function load3({ stored = {}, classes = [], live = true, hide = "", rootAttrs = {}, bodyAttrs = {}, gameHud = null, mirror = null, hudElements = null, microtasks = null } = {}) {
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
  if (hudElements) ctx.HudElements = hudElements;
  if (microtasks) ctx.queueMicrotask = (fn) => microtasks.push(fn);
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

test("queued style visibility preserves arrange ghosts and resumes after exit", () => {
  const microtasks = [], bodyAttrs = {};
  let applies = 0;
  const L = load3({ bodyAttrs, microtasks, hudElements: { apply() { applies++; } } });
  const flush = () => { while (microtasks.length) microtasks.shift()(); };
  flush(); const before = applies;
  L.H.set("map", { x: 3 }, "other");
  bodyAttrs["data-hud-arrange"] = "1";
  flush();
  assert.equal(applies, before, "entering arrange before the microtask keeps hidden ghosts visible");
  L.H.set("map", { x: 4 }, "other"); flush();
  assert.equal(applies, before, "dragging while arranging does not restore the hide list");
  L.H.set("map", { x: 5 }, "other");
  delete bodyAttrs["data-hud-arrange"]; flush();
  assert.equal(applies, before + 1, "normal visibility is restored after leaving arrange");
  L.H.apply(); flush();
  assert.equal(applies, before + 2, "ordinary profile changes still reapply visibility");
});

test("current schema keeps style and camera entries independent, including explicit defaults", () => {
  const { H } = load3();
  const raw = { v: 4, broadcast: { other: { map: { x: 1 } } },
    minimal: { cockpit: { tyre: H.SHIPPED.minimal.cockpit.tyre } } };
  const normalized = plain(H.migrate(raw));
  assert.deepEqual(normalized.broadcast.other, { map: { x: 1, y: 0, s: 100 } });
  assert.deepEqual(normalized.minimal.cockpit, { tyre: plain(H.SHIPPED.minimal.cockpit.tyre) });
  assert.deepEqual(normalized.standard, { cockpit: {}, helmet: {}, other: {} });
  assert.deepEqual(plain(H.migrate(null)), { standard: { cockpit: {}, helmet: {}, other: {} },
    minimal: { cockpit: {}, helmet: {}, other: {} }, broadcast: { cockpit: {}, helmet: {}, other: {} } });
});

test("layouts are keyed by style: a STANDARD tower move does not paint in BROADCAST", () => {
  const { H, written, els, cls } = load3({ stored: { hudLayout: { v: 4, standard: { cockpit: {}, other: { tower: { x: -30, y: 0, s: 100 } } } } } });
  assert.equal(H.profile(), "standard");
  assert.equal(els[".hud-top"].props["--hl-x"], "-30");
  cls.add("hud-prof-broadcast");
  H.setCam("chase");                       // js/ui/hud.js calls it on a style change too
  assert.equal(H.profile(), "broadcast");
  assert.equal("data-hl" in els[".hud-top"].attrs, false, "broadcast shows its own (shipped) tower");
  H.set("tower", { y: 5 }, "other");
  assert.deepEqual(plain(written.hudLayout), { v: 4,
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
  assert.match(css, /body:not\(\.desktop\) #hud-strat \{[\s\S]*?top: calc\(var\(--hud-left-h, 152px\) \+ 8px\)/,
    "touch STRATEGY sits under fitHud's measured left column (--hud-left-h), not a bare 152px");
  assert.match(css, /body:not\(\.desktop\) #hud-rel:not\(\[data-hl-user\]\) \{[\s\S]*?top: calc\(var\(--hud-left-h, 152px\) \+ 8px\)/,
    "touch RELATIVE uses the same measured left column");
  assert.match(css, /:has\(> :where\(#hud\) > #hud-rel:not\(\[hidden\]\)\) #hud-strat:not\(\[data-hl-user\]\)/,
    "STRATEGY steps beside RELATIVE instead of stacking onto PLAN");
  assert.match(css, /:root\[data-limits-left\] #hud-strat/,
    "STRATEGY clears the left-mode TRACK LIMITS chip");
  assert.match(css, /@supports \(anchor-name: --a\)[\s\S]*#dock-left \{ anchor-name: --apex-dock-left; \}[\s\S]*#hud-tyre \{[^}]*position-anchor: --apex-dock-left;[^}]*bottom: calc\(anchor\(top\)/,
    "touch TYRES sits on top of the left dock");
  assert.match(css, /body:not\(\.desktop\) #hud-sectors \{[\s\S]*?right:\s*calc\(10px \+ var\(--sar\) \/ var\(--hud-z\) \+ var\(--dock-r-w, 0px\)\)/,
    "phone sectors (tilt/touch/buttons) take the same --dock-r-w clearance as limits/damage");
  assert.match(css, /body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\[data-radio-corner\]\):not\(\.hud-mirror-side\) #announce \{[\s\S]*?left: calc\(var\(--announce-lane-x, 50% \* var\(--hud-z\)\) \/ var\(--hud-z\)\)/,
    "touch #announce sits in the published dock lane (centred when none is published), not at 10px+sal over TILT's left dock");
  assert.match(css, /@media \(orientation: portrait\) and \(max-width: 500px\) \{[\s\S]*?body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\[data-radio-corner\]\):not\(\.hud-mirror-side\) #announce \{[\s\S]*?left: calc\(var\(--announce-lane-x, 34% \* var\(--hud-z\)\) \/ var\(--hud-z\)\)/,
    "portrait unpublished-lane fallback pins left past the map column so HUD 150% on 390 clears #minimap");
  assert.doesNotMatch(css, /body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\.hud-prof-broadcast\)[^{]*#announce \{[\s\S]*?left: calc\(10px \+ var\(--sal\)/,
    "the under-map announce park is gone — it sat on BRAKE / BOOST / SHIFT");
  assert.doesNotMatch(css,
    /body:not\(\.desktop\) #hud-sectors \{[^}]*position-anchor: --apex-dock-right/,
    "phone sectors clear BOOST via measured --dock-r-w only (#1191 anchor max overshot into #announce)");
  // OVERTAKE / CORNER MODE: cockpit --hl-x must not shove the chips under the
  // right dock when taps/shifts are lit (hud-survey aero×shift-up + Bryce OT/BOOST).
  assert.match(css, /body:has\(\.dock \.touchbtn:not\(\[hidden\]\)\) :is\(#hud-ot, #hud-aero\)\[data-hl\]:not\(\[data-hl-v4\]\)\s*\{[^}]*translate:\s*0\s+calc\(var\(--hl-y/,
    "lit docks adjust shipped OVERTAKE / CORNER MODE while preserving explicitly placed chips");
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

test("edited TRACK LIMITS retains its origin when the automatic anchor changes", () => {
  const L = load3({ stored: { hudLayout: { v: 4, standard: { other: { limits: { x: 0, y: 0, s: 150 } } } } } });
  assert.equal(L.els["#hud-limits"].props["--hl-o"], "top right");
  assert.equal(L.H.originOf("limits"), "top right");
  L.rootAttrs["data-limits-left"] = "1";
  assert.equal(L.H.originOf("limits"), "top right");
  L.H.apply();
  assert.equal(L.els["#hud-limits"].props["--hl-o"], "top right");
  assert.equal(L.H.originOf("sectors"), "top right");
  const automatic = load3();
  automatic.rootAttrs["data-limits-left"] = "1";
  assert.equal(automatic.H.originOf("limits"), "top left", "untouched chip follows its live anchor");
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
  assert.deepEqual(plain(T.written.hudLayout.standard.helmet.energy), plain(T.H.TOUCH_SHIPPED.helmet.energy),
    "writing the touch default retains explicit placement ownership");
  T.H.resetEl("energy", "helmet");
  assert.equal(T.written.hudLayout, null, "explicit reset restores automatic placement");
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
    stored: { hudLayout: { v: 4, standard: { helmet: { speed: { x: 5, y: 0, s: 100 } } } } } });
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

test("every edited widget retains geometry through clearance and high-scale packing", () => {
  const W = 844, H = 390, elements = {}, body = fakeEl(), root = fakeEl();
  body.classList = { contains: () => false };
  body.toggleAttribute = (k, on) => on ? body.setAttribute(k, "") : body.removeAttribute(k);
  const control = { hidden: false, classList: { contains: () => false },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H }) };
  const saved = { v: 4, standard: { other: {} } };
  const ctx = { window: { innerWidth: W, innerHeight: H },
    getComputedStyle: () => ({ display: "block", visibility: "visible", getPropertyValue: k => k === "--hud-scale" ? "2" : "" }),
    document: { readyState: "loading", documentElement: root, body, addEventListener() {}, getElementById: () => null,
      querySelector: sel => elements[sel] || null,
      querySelectorAll: sel => sel === "[data-hl-pack]"
        ? Object.values(elements).filter(el => el.hasAttribute("data-hl-pack")) : [control] },
    GameStore: { store: { get: (k, d) => k === "hudLayout" ? saved : k === "hudScale" ? 200 : d,
      set() { throw new Error("automatic passes must not persist"); } } } };
  vm.createContext(ctx); vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  for (const [i, [id, , sel]] of Array.from(ctx.HudLayout.ELEMENTS).entries()) {
    const el = fakeEl(); el.id = sel.replace(/^#/, "");
    el.style.getPropertyValue = k => el.props[k] || "";
    el.getBoundingClientRect = () => {
      const left = Number(el.props["--hl-x"] || 0) * W / 100;
      const top = Number(el.props["--hl-y"] || 0) * H / 100;
      const width = 100 * Number(el.props["--hl-s"] || 1), height = 40 * Number(el.props["--hl-s"] || 1);
      return { left, top, right: left + width, bottom: top + height, width, height };
    };
    elements[sel] = el;
    // Cover intentional overlap, both offscreen axes, and size-only ownership.
    saved.standard.other[id] = { x: i % 2 ? 150 : 0, y: i % 2 ? -150 : 0, s: i ? 300 : 100 };
    for (const a of ["data-hl-pack", "data-col-compact", "data-col-drop", "data-lane-collapsed"]) el.setAttribute(a, "");
    for (const p of ["translate", "margin-left", "margin-top", "--hud-clear-x", "--hud-clear-y", "max-width", "max-height"]) el.style.setProperty(p, "24px");
  }
  ctx.HudLayout.apply();
  const before = Object.fromEntries(Object.entries(elements).map(([sel, el]) => [sel, el.getBoundingClientRect()]));
  const storedBefore = JSON.stringify(saved);
  for (let pass = 0; pass < 3; pass++) { ctx.HudLayout.fit(); ctx.HudLayout.clearReadouts(); }
  for (const [id, , sel] of ctx.HudLayout.ELEMENTS) {
    const el = elements[sel], wanted = saved.standard.other[id];
    assert.equal(el.props["--hl-x"], String(wanted.x), id);
    assert.equal(el.props["--hl-y"], String(wanted.y), id);
    assert.equal(el.props["--hl-s"], String(wanted.s / 100), id);
    assert.deepEqual(el.getBoundingClientRect(), before[sel], id + " stays where the player put it");
    for (const a of ["data-hl-pack", "data-col-compact", "data-col-drop", "data-lane-collapsed"]) assert.equal(el.hasAttribute(a), false, id + " " + a);
    for (const p of ["translate", "margin-left", "margin-top", "--hud-clear-x", "--hud-clear-y", "max-width", "max-height"]) assert.equal(el.props[p], undefined, id + " " + p);
  }
  assert.equal(JSON.stringify(saved), storedBefore);
});

test("measured clearance protects instruments and controls without changing saved layouts", () => {
  const W = 844, H = 390, elements = {};
  const make = (id, x, y, w, h) => {
    const p = {}, attrs = {};
    const e = { id, style: { setProperty(k, v) { p[k] = v; }, removeProperty(k) { delete p[k]; }, getPropertyValue(k) { return p[k] || ""; } },
      setAttribute(k,v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
      getBoundingClientRect() {
        const left = x + parseFloat(p["--hl-x"] || 0) * W / 100 + parseFloat(p["--hud-clear-x"] || 0);
        const top = y + parseFloat(p["--hl-y"] || 0) * H / 100 + parseFloat(p["--hud-clear-y"] || 0);
        return { left, top, right: left + w, bottom: top + h, width: w, height: h };
      } };
    elements[id] = e; return e;
  };
  const gear = make("#hud-gearbox", 250, 210, 140, 100), speed = make("#hud-speed", 400, 210, 120, 40);
  const tyre = make("#hud-tyre", 58, 170, 180, 90), damage = make("#hud-damage", 465, 215, 125, 48);
  const rel = make("#hud-rel", 58, 150, 150, 60), strat = make("#hud-strat", 180, 160, 100, 60);
  const cam = make("#btn-cam", 735, 80, 75, 44), radio = make("#announce", 585, 31, 175, 74);
  const limits = make("#hud-limits", 590, 202, 125, 24);
  const ot = make("#hud-ot", 250, 330, 140, 30), aero = make("#hud-aero", 400, 330, 140, 30);
  const stored = { v: 4, standard: { other: { rel: { x: 1, y: 0, s: 100 } } } };
  const before = JSON.stringify(stored);
  let placedRadio = false;
  const ctx = { console, window: { innerWidth: W, innerHeight: H },
    document: { readyState: "loading", addEventListener() {}, getElementById: () => null,
      body: { classList: { contains: () => false }, setAttribute() {}, hasAttribute: (k) => k === "data-radio-placed" && placedRadio },
      querySelector: (sel) => elements[sel] || null,
      querySelectorAll: (sel) => {
        if (sel.includes("#pausebtn")) {
          assert.match(sel, /#hud-ot/); assert.match(sel, /#hud-aero/); assert.match(sel, /#hud-bb/);
          return [gear, tyre, cam, ot, aero];
        }
        return [gear, speed, cam];
      } },
    GameStore: { store: { get: (k,d) => k === "hudLayout" ? stored : d, set() {} } } };
  vm.createContext(ctx); vm.runInContext(SRC + "; this.HudLayout = HudLayout;", ctx);
  const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert.ok(rel.hasAttribute("data-hl-user"), "saved Relative offset owns its placement");
  const manualRelative = rel.getBoundingClientRect();
  ctx.HudLayout.clearReadouts();
  const readouts = [limits, radio, damage, strat];
  const protectedBoxes = [gear, speed, tyre, cam, ot, aero, rel].map((e) => e.getBoundingClientRect());
  for (const el of readouts) {
    const r = el.getBoundingClientRect();
    assert.ok(protectedBoxes.every((b) => !overlap(r,b)), el.id + " clears controls and instruments");
    assert.ok(r.left >= 4 && r.top >= 4 && r.right <= W-4 && r.bottom <= H-4, el.id + " stays on screen");
    protectedBoxes.push(r);
  }
  const first = readouts.map((e) => e.getBoundingClientRect());
  ctx.HudLayout.clearReadouts();
  assert.deepEqual(readouts.map((e) => e.getBoundingClientRect()), first, "repeat fit is stable");
  assert.deepEqual(rel.getBoundingClientRect(), manualRelative, "manual Relative may overlap instruments without being moved");
  assert.equal(JSON.stringify(stored), before, "saved user offset remains intact");
  placedRadio = true;
  radio.style.setProperty("--hud-clear-x", "-240px");
  radio.style.setProperty("--hud-clear-y", "80px");
  limits.style.setProperty("--hl-y", String(-170 / H * 100));
  ctx.HudLayout.clearReadouts();
  const pinned = radio.getBoundingClientRect();
  assert.equal(pinned.left, 585, "manual placement discards previous automatic clearance");
  assert.equal(pinned.top, 31, "manual placement keeps the requested height");
  assert.ok(overlap(pinned, cam.getBoundingClientRect()), "the player can deliberately place over a control");
  assert.ok(!overlap(limits.getBoundingClientRect(), pinned), "earlier readouts also yield to the manual radio");
  ctx.HudLayout.clearReadouts();
  assert.deepEqual(radio.getBoundingClientRect(), pinned, "repeated fits preserve manual placement");
  placedRadio = false;
  ctx.HudLayout.clearReadouts();
  assert.ok(!overlap(radio.getBoundingClientRect(), cam.getBoundingClientRect()), "RESET restores automatic clearance");
});


test("all temporarily corrected readouts restrict transitions to paint properties", () => {
  const block = CSS.match(/:is\(#minimap, #hud-speed, #hud-limits, #announce, #hud-damage, #hud-rel, #hud-strat, #hud-inputs\)\s*\{([^}]+)\}/);
  assert.ok(block, "an unconditional rule covers every measured clearance target");
  assert.match(block[1], /transition-property:\s*opacity, color, background-color, border-color, box-shadow, filter, text-shadow;/);
});

test("optional strategy compacts, explains a drop, and restores when space returns", () => {
  const attrs = {}, props = {}, viewport = { innerWidth: 300, innerHeight: 200 };
  const strat = {
    style: { setProperty(k,v) { props[k]=v; }, removeProperty(k) { delete props[k]; }, getPropertyValue(k) { return props[k] || ""; } },
    setAttribute(k,v) { attrs[k]=v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
    getBoundingClientRect() {
      const height = "data-col-drop" in attrs ? 0 : "data-col-compact" in attrs ? 25 : 90;
      const left = 10 + parseFloat(props["--hud-clear-x"] || 0), top = 60 + parseFloat(props["--hud-clear-y"] || 0);
      return {left,top,right:left+120,bottom:top+height,width:120,height};
    },
  };
  const control = { getBoundingClientRect: () => ({left:4,top:4,right:296,bottom:150,width:292,height:146}) };
  const ctx = { console, window: viewport,
    document: { readyState: "loading", addEventListener() {}, getElementById: (id) => id === "hud" ? {hidden:false} : null,
      body: {classList: {contains: () => false},setAttribute(){}}, querySelector: (sel) => sel === "#hud-strat" ? strat : null,
      querySelectorAll: (sel) => sel.includes("#pausebtn") ? [control] : [] },
    GameStore: {store: {get: (k,d) => d,set(){throw new Error("fit must not save");}}} };
  vm.createContext(ctx);vm.runInContext(SRC + "; this.HudLayout = HudLayout;",ctx);
  ctx.HudLayout.clearReadouts();
  assert.ok(strat.hasAttribute("data-col-compact"), "one NEXT row fits the remaining strip");
  assert.ok(!strat.hasAttribute("data-col-drop"));
  assert.ok(strat.getBoundingClientRect().top >= 154);
  viewport.innerHeight = 170;ctx.HudLayout.clearReadouts();
  assert.ok(strat.hasAttribute("data-col-drop"));
  assert.equal(ctx.HudLayout.hiddenReason("strat").reason,"not enough room");
  viewport.innerHeight = 400;ctx.HudLayout.clearReadouts();
  assert.ok(!strat.hasAttribute("data-col-drop") && !strat.hasAttribute("data-col-compact"), "full panel returns without changing settings");
  assert.equal(strat.getBoundingClientRect().height,90);
});

test("clearance keeps an unobstructed readout inside hardware safe areas", () => {
  const p = {}, attrs = {}, root = {};
  const damage = { style: {setProperty(k,v){p[k]=v;},removeProperty(k){delete p[k];}},
    setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},hasAttribute(k){return k in attrs;},
    getBoundingClientRect(){const left=5+parseFloat(p["--hud-clear-x"]||0),top=5+parseFloat(p["--hud-clear-y"]||0);return {left,top,right:left+80,bottom:top+30,width:80,height:30};} };
  const ctx = {console,window:{innerWidth:300,innerHeight:200},
    getComputedStyle: (el) => el === root ? {getPropertyValue: (k) => ({"--sal":"30px","--sar":"20px","--sat":"15px","--sab":"10px"}[k]||"")} : {display:"block",visibility:"visible"},
    document:{readyState:"loading",documentElement:root,addEventListener(){},getElementById:()=>null,
      body:{classList:{contains:()=>false},setAttribute(){}},querySelector:(sel)=>sel==="#hud-damage"?damage:null,querySelectorAll:()=>[]},
    GameStore:{store:{get:(k,d)=>d,set(){throw new Error("must not save");}}}};
  vm.createContext(ctx);vm.runInContext(SRC+";this.HudLayout=HudLayout;",ctx);
  ctx.HudLayout.clearReadouts();
  const r=damage.getBoundingClientRect();
  assert.equal(r.left,34);assert.equal(r.top,19);
  assert.ok(r.right<=276 && r.bottom<=186);
});

test("damage wraps into a narrow slot without dropping diagnostic text or saving", () => {
  const p = {}, attrs = {};
  const damage = {textContent:"FW R 100% SUSP",style:{setProperty(k,v){p[k]=v;},removeProperty(k){delete p[k];}},
    setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},hasAttribute(k){return k in attrs;},
    getBoundingClientRect(){const width="data-col-compact" in attrs?96:130,height="data-col-compact" in attrs?70:50;
      const left=40+parseFloat(p["--hud-clear-x"]||0),top=60+parseFloat(p["--hud-clear-y"]||0);return {left,top,right:left+width,bottom:top+height,width,height};}};
  const instrument={getBoundingClientRect:()=>({left:4,top:4,right:196,bottom:296,width:192,height:292})};
  const ctx={console,window:{innerWidth:300,innerHeight:300},document:{readyState:"loading",addEventListener(){},getElementById:()=>null,
    body:{classList:{contains:()=>false},setAttribute(){}},querySelector:(sel)=>sel==="#hud-damage"?damage:null,
    querySelectorAll:(sel)=>sel.includes("#pausebtn")?[instrument]:[]},GameStore:{store:{get:(k,d)=>d,set(){throw new Error("must not save");}}}};
  vm.createContext(ctx);vm.runInContext(SRC+";this.HudLayout=HudLayout;",ctx);ctx.HudLayout.clearReadouts();
  assert.ok(damage.hasAttribute("data-col-compact"));assert.ok(!damage.hasAttribute("data-col-drop"));
  assert.equal(damage.textContent,"FW R 100% SUSP");
  const r=damage.getBoundingClientRect();assert.equal(r.left,200);assert.ok(r.right<=296);
  assert.match(CSS,/#hud-damage\[data-col-compact\] \[data-dmg-text\][^}]+overflow-wrap: anywhere/);
});

test("a collapsed radio lane reopens for measured placement without changing settings", () => {
  const attrs={"data-lane-collapsed":""},p={};
  const radio={hidden:false,style:{setProperty(k,v){p[k]=v;},removeProperty(k){delete p[k];}},
    setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},hasAttribute(k){return k in attrs;},
    getBoundingClientRect(){const width="data-lane-collapsed" in attrs||!p["--announce-lane-w"]?0:120;
      const left=20+parseFloat(p["--hud-clear-x"]||0),top=20+parseFloat(p["--hud-clear-y"]||0);return {left,top,right:left+width,bottom:top+40,width,height:40};}};
  const control={getBoundingClientRect:()=>({left:10,top:10,right:150,bottom:100,width:140,height:90})};
  const ctx={console,window:{innerWidth:300,innerHeight:200},document:{readyState:"loading",addEventListener(){},getElementById:()=>null,
    body:{classList:{contains:()=>false},setAttribute(){}},querySelector:(sel)=>sel==="#announce"?radio:null,
    querySelectorAll:(sel)=>sel.includes("#pausebtn")?[control]:[]},GameStore:{store:{get:(k,d)=>d,set(){throw new Error("must not save");}}}};
  vm.createContext(ctx);vm.runInContext(SRC+";this.HudLayout=HudLayout;",ctx);ctx.HudLayout.clearReadouts();
  assert.ok(!radio.hasAttribute("data-lane-collapsed")&&!radio.hasAttribute("data-col-drop"));
  assert.equal(p["--announce-lane-w"],"292px");
  const r=radio.getBoundingClientRect();assert.ok(r.left>=154||r.top>=104);
  ctx.HudLayout.clearReadouts();assert.deepEqual(radio.getBoundingClientRect(),r,"local width survives repeated clearance until producer recomputes lane");
});


test("optional input trace yields to occupied space and restores without saving", () => {
  const attrs = {}, props = {}, viewport = { innerWidth: 300, innerHeight: 170 };
  const inputs = {
    style: { setProperty(k,v) { props[k]=v; }, removeProperty(k) { delete props[k]; } },
    setAttribute(k,v) { attrs[k]=v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
    getBoundingClientRect() {
      const height = "data-col-drop" in attrs ? 0 : 40;
      const left = 10 + parseFloat(props["--hud-clear-x"] || 0), top = 60 + parseFloat(props["--hud-clear-y"] || 0);
      return {left,top,right:left+120,bottom:top+height,width:120,height};
    },
  };
  const control = { getBoundingClientRect: () => ({left:4,top:4,right:296,bottom:150,width:292,height:146}) };
  const ctx = { console, window: viewport, document: {
    readyState: "loading", addEventListener() {}, getElementById: id => id === "hud" ? {hidden:false} : null,
    body: {classList: {contains: () => false},setAttribute(){}}, querySelector: sel => sel === "#hud-inputs" ? inputs : null,
    querySelectorAll: sel => sel.includes("#pausebtn") ? [control] : [] },
    GameStore: {store: {get: (k,d) => d,set(){throw new Error("fit must not save");}}} };
  vm.createContext(ctx);vm.runInContext(SRC + "; this.HudLayout = HudLayout;",ctx);
  ctx.HudLayout.clearReadouts();
  assert.ok(inputs.hasAttribute("data-col-drop"));
  assert.equal(ctx.HudLayout.hiddenReason("inputs").reason,"not enough room");
  viewport.innerHeight = 400;ctx.HudLayout.clearReadouts();
  assert.ok(!inputs.hasAttribute("data-col-drop"));
  assert.equal(inputs.getBoundingClientRect().height,40);
  assert.ok(inputs.getBoundingClientRect().top >= 154);
});


test("only the unplaced touch broadcast map clears pedals without resizing or saving", () => {
  const elements = {}, state = { broadcast: true, desktop: false, brakeTop: 121 };
  const make = (selector, x, y, w, h) => {
    const attrs = {}, props = {};
    return elements[selector] = {
      hidden: false, hasAttribute: k => k in attrs, setAttribute: (k,v) => attrs[k]=v, removeAttribute: k => delete attrs[k],
      style: { setProperty: (k,v) => props[k]=v, removeProperty: k => delete props[k], getPropertyValue: k => props[k] || "" },
      getBoundingClientRect() {
        const left = x + parseFloat(props["--hud-clear-x"] || 0);
        const top = (selector === "#btn-brake" ? state.brakeTop : y) + parseFloat(props["--hud-clear-y"] || 0);
        return { left, top, right: left+w, bottom: top+h, width:w, height:h };
      },
    };
  };
  const map = make("#minimap",54,51,77,77), brake = make("#btn-brake",59,121,108,108);
  const tower = make(".hud-top",54,6,186,39), tyre = make("#hud-tyre",59,80,91,35);
  const viewport = { innerWidth:844, innerHeight:390 };
  const doc = {readyState:"loading",addEventListener(){},getElementById:()=>null,
    body:{classList:{contains:k=>k==="desktop"?state.desktop:k==="hud-prof-broadcast"&&state.broadcast},setAttribute(){}},
    querySelector:sel=>elements[sel]||null,querySelectorAll:sel=>sel.includes("#pausebtn")?[map,brake,tower,tyre]:sel===".touchbtn, .steerbtn, .shiftbtn"?[brake]:[]};
  const ctx = {window:viewport,document:doc,GameStore:{store:{get:(k,d)=>d,set(){throw Error("placement must not save");}}}};
  vm.createContext(ctx);vm.runInContext(SRC+";this.HudLayout=HudLayout;",ctx);
  const fit = () => {ctx.HudLayout.clearReadouts();return map.getBoundingClientRect();};
  const hit = (a,b) => a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const placed = fit();
  for (const obstacle of [brake,tower,tyre]) assert.ok(!hit(placed,obstacle.getBoundingClientRect()));
  assert.equal(placed.width,77);assert.equal(placed.height,77);
  assert.deepEqual(fit(),placed,"repeated clearance remains stable");
  state.brakeTop=160;tyre.hidden=true;assert.equal(fit().left,54,"available room restores the shipped map anchor");
  state.brakeTop=121;tyre.hidden=false;map.setAttribute("data-hl-user","");
  assert.equal(fit().left,54,"custom map placement wins even when overlapping a control");
  map.removeAttribute("data-hl-user");state.broadcast=false;assert.equal(fit().left,54,"standard profile remains unchanged");
  state.broadcast=true;state.desktop=true;assert.equal(fit().left,54,"desktop remains unchanged");
  state.desktop=false;viewport.innerWidth=390;viewport.innerHeight=844;assert.equal(fit().left,54,"portrait remains unchanged");
});

// Real SettingRow + HudElements + HudLayout, including the original preference
// rows. A saved JSON change alone must not masquerade as a live game change.
function visibilityEditor() {
  const dom = makeDom({ readyState: 'loading' }), document = dom.document;
  const lookup = document.getElementById, create = document.createElement;
  document.getElementById = id => dom.has(id) ? lookup(id) : null;
  document.createElement = tag => {
    const el = create(tag);
    if (tag === 'select') Object.defineProperty(el, 'options', { get: () => el.children });
    return el;
  };
  const host = dom.makeElement('details', 'pm-hud-details'); dom.body.appendChild(host);
  const stored = {}, changes = [], owners = [], listeners = [], timers = [];
  const store = { get: (k, d) => k in stored ? stored[k] : d, set(k, v) {
    stored[k] = v; changes.push(k); for (const fn of listeners) fn({ key: k });
  }, subscribe: fn => listeners.push(fn) };
  const ctx = { document, GameStore: { store }, setTimeout: fn => timers.push(fn),
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init); } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/setting-row.js'), 'utf8'), ctx);
  for (const [id, key, initial] of [['map', 'hudMapVis', 'on'], ['gaps', 'hudGapsVis', 'on'], ['mirror', 'hudMirror', 'auto']]) {
    const built = ctx.SettingRow.build('pm-hud' + id, id, [['auto', 'AUTO'], ['on', 'ON'], ['off', 'OFF']]);
    ctx.SettingRow.wire(built.row, { read: () => store.get(key, initial), write(value) { owners.push([id, value]); store.set(key, value); } });
    host.appendChild(built.row);
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/hud-elements.js'), 'utf8') + '; this.HudElements = HudElements;', ctx);
  vm.runInContext(SRC + '; this.HudLayout = HudLayout;', ctx);
  ctx.HudLayout.build();
  const choose = (id, value) => { const el = document.getElementById(id); assert.ok(el, id); el.value = value; dom.dispatch(el, { type: 'change', bubbles: true }); };
  return { H: ctx.HudLayout, E: ctx.HudElements, document, choose, owners, stored, changes, ctx, dom,
    flush() { while (timers.length) timers.shift()(); } };
}

test('numeric HUD drafts stay readable and commit once when moving between fields', () => {
  const e = visibilityEditor(), previews = [];
  e.ctx.ScreenLooks = { peek: (...args) => previews.push(args), endPeek: () => previews.push('end') };
  const fold = e.document.getElementById('pm-hudlayout');
  fold.open = true;
  e.choose('pm-hl-el-sel', 'map');
  const x = e.document.getElementById('pm-hl-x'), y = e.document.getElementById('pm-hl-y');
  const fire = (el, type) => e.dom.dispatch(el, { type });
  const writes = () => e.changes.filter(key => key === 'hudLayout').length;
  previews.length = 0;
  x.focus(); fire(x, 'focus');
  fire(x, 'pointerdown'); fire(x, 'pointerup');
  for (const draft of ['', '-', '-17', '-1750.125']) {
    x.value = draft; fire(x, 'input');
    assert.equal(writes(), 0, 'intermediate drafts never persist');
    assert.equal(x.value, draft, 'typing keeps the native draft');
    assert.equal(e.document.activeElement, x);
    assert.equal(previews.every(call => call === 'end'), true, 'focus and typing only end previews');
  }
  fire(x, 'change');
  assert.equal(writes(), 1);
  assert.equal(e.H.get('map').x, -1750.125, 'exact unrestricted fraction is committed');
  assert.equal(previews.every(call => call === 'end'), true, 'change while focused keeps the form readable');
  x.blur(); fire(x, 'blur'); y.focus(); fire(y, 'focus'); e.flush();
  assert.equal(writes(), 1, 'change followed by blur commits once');
  assert.equal(previews.every(call => call === 'end'), true, 'Tab to another numeric field never fades it');
  y.value = '2300.0625'; fire(y, 'input');
  y.blur(); fire(y, 'blur'); e.flush();
  assert.equal(writes(), 2, 'blur commits even without a preceding change event');
  assert.equal(e.H.get('map').y, 2300.0625);
  assert.deepEqual(previews.at(-1), ['hud', 900], 'leaving the numeric fields previews the committed HUD');
});

test('numeric HUD defers one committed preview across unchanged and invalid fields', () => {
  const e = visibilityEditor(), previews = [];
  e.ctx.ScreenLooks = { peek: (...args) => previews.push(args), endPeek() {} };
  const fold = e.document.getElementById('pm-hudlayout'); fold.open = true;
  const [x, y, s] = ['x', 'y', 's'].map(k => e.document.getElementById('pm-hl-' + k));
  const fire = (el, type) => e.dom.dispatch(el, { type });
  const focus = el => { el.focus(); fire(el, 'focus'); };
  const tab = (from, to) => { from.blur(); fire(from, 'blur'); if (to) focus(to); e.flush(); };
  focus(x); x.value = '425.125'; fire(x, 'input'); fire(x, 'change');
  tab(x, y); tab(y, s);
  assert.equal(previews.length, 0, 'unchanged fields retain the pending preview without fading');
  tab(s, null);
  assert.deepEqual(previews, [['hud', 900]], 'leaving the whole group previews exactly once');

  previews.length = 0;
  focus(x); x.value = '-625.25'; fire(x, 'input'); fire(x, 'change'); tab(x, s);
  s.value = '0'; fire(s, 'input'); fire(s, 'change'); tab(s, null);
  assert.equal(s.value, '100');
  assert.deepEqual(previews, [['hud', 900]], 'an invalid field does not cancel another committed value');

  previews.length = 0;
  focus(x); x.value = '750'; fire(x, 'input'); fire(x, 'change'); tab(x, y);
  fold.open = false; fire(fold, 'toggle'); fold.open = true; fire(fold, 'toggle');
  tab(y, null);
  assert.equal(previews.length, 0, 'closing the fold cancels a deferred preview');
});

test('numeric HUD commits reject invalid drafts and retain explicit default ownership', () => {
  const e = visibilityEditor();
  e.choose('pm-hl-el-sel', 'map');
  const x = e.document.getElementById('pm-hl-x'), s = e.document.getElementById('pm-hl-s');
  const fire = (el, type) => e.dom.dispatch(el, { type });
  const writes = () => e.changes.filter(key => key === 'hudLayout').length;
  for (const invalid of ['', '0', '-1', '1e999', 'NaN']) {
    s.focus(); fire(s, 'focus'); s.value = invalid; fire(s, 'input');
    fire(s, 'change'); s.blur(); fire(s, 'blur'); e.flush();
    assert.equal(writes(), 0, 'invalid size never acquires manual ownership');
    assert.equal(s.value, '100', 'invalid draft returns to the prior value');
    assert.equal(e.H.get('map').s, 100);
  }
  x.focus(); fire(x, 'focus'); x.value = '0'; fire(x, 'input'); fire(x, 'change');
  assert.equal(writes(), 1);
  assert.equal(e.stored.hudLayout.v, 4);
  assert.deepEqual(plain(e.stored.hudLayout.standard.other.map), { x: 0, y: 0, s: 100 }, 'valid shipped values still explicitly own the widget');
  s.focus(); fire(s, 'focus'); s.value = '0.000125'; fire(s, 'input');
  fire(s, 'change'); s.blur(); fire(s, 'blur'); e.flush();
  assert.equal(e.H.get('map').s, 0.000125, 'small positive sizes retain their exact value');
});

test('MOVE & SIZE visibility invokes original map/gaps/mirror owners and preserves AUTO', () => {
  const e = visibilityEditor();
  for (const [id, key] of [['map', 'hudMapVis'], ['gaps', 'hudGapsVis'], ['mirror', 'hudMirror']]) {
    e.choose('pm-hl-el-sel', id);
    const select = e.document.getElementById('pm-hl-visibility-sel');
    assert.deepEqual(Array.from(select.children, option => option.value), ['auto', 'on', 'off']);
    e.choose('pm-hl-visibility-sel', 'off');
    assert.equal(e.stored[key], 'off'); assert.equal(select.value, 'off');
    e.choose('pm-hl-visibility-sel', 'auto');
    assert.equal(e.stored[key], 'auto'); assert.equal(select.value, 'auto');
  }
  assert.deepEqual(e.owners, [['map', 'off'], ['map', 'auto'], ['gaps', 'off'], ['gaps', 'auto'], ['mirror', 'off'], ['mirror', 'auto']], 'real owner handlers ran synchronously');
  assert.equal(e.stored.hudLayout, undefined, 'visibility does not rewrite placement or another style');
});

test('grouped tower visibility stays mixed until explicitly changed and writes one hide list', () => {
  const e = visibilityEditor();
  e.E.set('delta', false);
  e.flush();
  e.choose('pm-hl-el-sel', 'tower');
  const select = e.document.getElementById('pm-hl-visibility-sel');
  assert.equal(select.value, 'mixed');
  assert.equal(select.children.find(option => option.value === 'mixed').disabled, true);
  const before = e.changes.length;
  e.choose('pm-hl-visibility-sel', 'off');
  assert.equal(e.changes.length - before, 1, 'one tower edit is one persistent update');
  assert.equal(['pos', 'lap', 'time', 'best', 'delta'].some(e.E.isOn), false);
  assert.equal(e.E.isOn('speed'), true, 'unrelated readouts are untouched');
  e.choose('pm-hl-visibility-sel', 'on');
  assert.equal(['pos', 'lap', 'time', 'best', 'delta'].every(e.E.isOn), true);
  e.choose('pm-hl-el-sel', 'flag');
  assert.equal(e.document.getElementById('pm-hl-visibility').hidden, true, 'race-event messages cannot be disabled accidentally');
  assert.equal(e.H.setVisibility('speed', 'auto'), false, 'binary preferences cannot acquire AUTO');
  assert.equal(e.H.setVisibility('tower', 'mixed'), false, 'mixed is a readout, not a command');
});


test('ARRANGE keeps the selected camera preview while settings are hidden, then releases it', () => {
  const e = visibilityEditor(), H = e.H;
  e.ctx.innerWidth = 1000; e.ctx.innerHeight = 500;
  H.setCam('chase');
  const fold = e.document.getElementById('pm-hudlayout');
  fold.open = true;
  let visible = true;
  fold.getClientRects = () => visible ? [{}] : [];
  e.dom.dispatch(fold, { type: 'toggle' });
  e.choose('pm-hl-set-sel', 'cockpit');
  assert.equal(H.shown(), 'cockpit');
  H.holdArrangePreview(true); visible = false;
  H.fit();
  H.set('map', { x: 12 }, 'cockpit', 'standard'); H.fit();
  assert.equal(H.shown(), 'cockpit');
  assert.equal(fold.open, true);
  assert.equal(H.get('map', 'cockpit', 'standard').x, 12);
  assert.equal(H.get('map', 'other', 'standard').x, 0);
  visible = true; H.holdArrangePreview(false); H.fit();
  assert.equal(H.shown(), 'cockpit', 'Done restores the settings preview');
  visible = false; H.fit();
  assert.equal(H.shown(), 'other', 'leaving settings still cleans up the preview');
  assert.equal(fold.open, false);
});
