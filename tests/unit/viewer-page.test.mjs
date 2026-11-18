/* viewer-page.test.mjs — tools/viewer/viewer.html's INLINE SCRIPT, run (#3043
 * T5-29). viewer.test.mjs pins the data the page is built from; nothing ran
 * the page's own script, so a typo in its chrome (mode buttons, picker,
 * customise panel, the APEX_VIEWER headless hook viewer-shots.mjs drives)
 * only surfaced in a browser. Here the generated page's inline <script>s run
 * in a VM over tests/helpers/mini-dom.mjs with three.js replaced by a
 * recording stub: every `new THREE.X(...)` is logged, every other read is an
 * inert chainable value. No WebGL, no network, no browser.
 * Run: node --test tests/unit/viewer-page.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { viewerHtml } from "../../tools/viewer/viewer-data.mjs";
import { CAT_FRAME } from "../../tools/viewer/viewer-shots.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

/** An inert value: any property is another inert value (kept, so writes stick),
 *  calls return the receiver's sibling, numbers coerce to 0. Never thenable. */
function inert() {
  const own = new Map();
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === "then" || typeof k === "symbol") return undefined;
      if (!own.has(k)) own.set(k, inert());
      return own.get(k);
    },
    set(_, k, v) { own.set(k, v); return true; },
    apply() { return inert(); },
    construct() { return inert(); },
  });
  return p;
}
/** THREE whose classes log their constructor arguments. */
function threeStub(log) {
  return new Proxy({}, {
    get(_, name) {
      if (typeof name === "symbol") return undefined;
      if (name === "MathUtils") return { degToRad: (d) => (d * Math.PI) / 180 };
      if (name === "DoubleSide" || name === "BackSide") return name;
      return new Proxy(function () {}, {
        construct(_, args) { log.push({ name, args }); return inert(); },
      });
    },
  });
}

function inlineScripts(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/** Boot one generated page. Returns the dom, the VM context and the logs. */
function boot(sel) {
  const html = viewerHtml(sel);
  const dom = makeDom();
  // innerHTML = "" is how the page clears the picker and the parts box; the
  // mini-dom keeps children, so give every element a clearing setter.
  const patch = (el) => {
    if (!el || el._patched) return el;
    let markup = "";
    Object.defineProperty(el, "innerHTML", { get: () => markup, set: (v) => { markup = String(v); el.children.length = 0; } });
    el.prepend = (c) => el.insertBefore(c, el.children[0]);
    el._patched = true;
    return el;
  };
  const byId = dom.document.getElementById, create = dom.document.createElement;
  dom.document.getElementById = (id) => patch(byId(id));
  dom.document.createElement = (t) => patch(create(t));
  const log = [], frames = [], store = new Map();
  const sandbox = {
    console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set, WeakMap, Promise,
    Float32Array, Uint16Array, Uint32Array, Uint8Array, isFinite, isNaN, Intl,
    document: dom.document, THREE: threeStub(log), devicePixelRatio: 2,
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    getComputedStyle: () => ({ getPropertyValue: (n) => ({ "--floor": "#222", "--road": "#333", "--race": "#f00", "--grass": "#2a2", "--accent": "#e10", "--sky": "#9cf" }[n] || "") }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    ResizeObserver: class { observe() {} },
    MutationObserver: class { observe() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const src of inlineScripts(html)) vm.runInContext(src, ctx, { filename: absSrc("tools/viewer/viewer.html") });
  const $ = (id) => dom.document.getElementById(id);
  const run = (expr) => vm.runInContext(expr, ctx, { filename: "viewer-page:evaluate" });
  const click = (id) => dom.dispatch($(id), { type: "click" });
  const change = (id, value) => { $(id).value = value; dom.dispatch($(id), { type: "change", bubbles: true }); };
  const flush = () => { const fs = frames.splice(0); for (const f of fs) f(16); };
  return { dom, $, run, click, change, flush, log, store };
}

const fmt = (n) => Number(n).toLocaleString("en-GB");
const ids = (el) => el.children.map((c) => c.id);

test("a cars + circuits page opens on the first car, built by the page's own Car3D", () => {
  const P = boot({ cars: ["haas", "ferrari"], circuits: ["monaco"] });
  assert.deepEqual(ids(P.$("modes")), ["mode-cars", "mode-circuits"]);
  assert.equal(P.$("modes").hidden, false);
  assert.deepEqual(ids(P.$("picker")), ["pick-cars-haas", "pick-cars-ferrari"]);
  assert.equal(P.$("pick-cars-haas").getAttribute("aria-pressed"), "true");
  assert.equal(P.$("mode-cars").getAttribute("aria-pressed"), "true");
  const team = P.run(`Teams.LIST.find((t) => t.id === "haas")`);
  assert.equal(P.$("title").textContent, team.name);
  // The vertex stat is the mesh the embedded roster builds, and the same array
  // is what reaches the position attribute.
  const verts = P.run(`carGeometry(spec).verts`);
  assert.equal(P.$("s4").textContent, fmt(verts));
  assert.equal(P.$("l4").textContent, "Vertices");
  const posAttrs = P.log.filter((e) => e.name === "Float32BufferAttribute" && e.args[1] === 3 && e.args[0].length === verts * 3);
  assert.ok(posAttrs.length >= 2, "position and normal attributes carry the built mesh");
  assert.ok(P.log.some((e) => e.name === "WebGLRenderer"), "one renderer");
  assert.equal(P.store.get("apex26.viewer.mode"), "cars");
});

test("the customise panel lists the garage's own liveries, finishes, bodies and parts, and a change rebuilds", () => {
  const P = boot({ cars: ["haas"] });
  assert.equal(P.$("custom").hidden, false);
  const O = P.run(`carOptions("haas")`);
  assert.equal(P.$("c-livery").children.length, O.liveries.length);
  assert.ok(O.liveries.length > 20, "the full livery list");
  assert.equal(P.$("c-finish").children.length, O.finishes.length + 1, "the livery's own + every finish");
  assert.equal(P.$("c-body").children.length, O.bodies.length + 1);
  assert.equal(P.$("c-parts").children.length, O.parts.length, "one select per part category");
  assert.equal(P.$("modes").hidden, true, "one mode: no mode buttons");
  const finish = O.finishes.find((f) => f !== "gloss");
  P.change("c-finish", finish);
  assert.equal(P.run(`spec.finish`), finish);
  assert.equal(P.$("s2").textContent, P.run(`titleCase(${JSON.stringify(finish)})`));
  assert.equal(JSON.parse(P.store.get("apex26.viewer.car")).finish, finish, "the choice persists");
  P.change("c-num", "123");
  assert.equal(P.$("s3").textContent, 99, "the number clamps to 0-99");
  P.click("c-reset");
  assert.equal(P.run(`spec.finish`), "");
  assert.equal(P.$("c-livery").value, O.liveries[0].id);
});

test("switching to circuits shows the built lap, hides the car panel and remembers the mode", () => {
  const P = boot({ cars: ["haas"], circuits: ["monaco", "monza"] });
  P.click("mode-circuits");
  assert.deepEqual(ids(P.$("picker")), ["pick-circuits-monaco", "pick-circuits-monza"], "the picker is rebuilt, not appended to");
  assert.equal(P.$("custom").hidden, true);
  const D = P.run(`DATA.circuits.monaco`);
  assert.equal(P.$("l1").textContent, "Lap length");
  assert.equal(P.$("s1").textContent, fmt(D.total) + " m");
  assert.equal(P.$("s2").textContent, fmt(D.nodes));
  P.click("pick-circuits-monza");
  assert.equal(P.$("s1").textContent, fmt(P.run(`DATA.circuits.monza.total`)) + " m");
  assert.equal(P.store.get("apex26.viewer.mode"), "circuits");
  assert.equal(P.store.get("apex26.viewer.circuits"), "monza");
  assert.ok(P.log.some((e) => e.name === "CatmullRomCurve3"), "the racing line is drawn");
});

test("APEX_VIEWER: the hook viewer-shots.mjs drives selects, frames every part category and stills", async () => {
  const P = boot({ cars: ["haas"], circuits: ["monaco"] });
  const V = P.run(`window.APEX_VIEWER`);
  assert.equal(V.ready, true);
  const frames = V.frames();
  for (const [cat, f] of Object.entries(CAT_FRAME)) assert.ok(frames.includes(f), `${cat} -> ${f} is a FRAMES entry`);
  assert.equal(V.frame("nose"), true);
  assert.equal(V.frame("nosuch"), false);
  const O = V.options("haas");
  const label = V.car({ team: "haas", livery: O.liveries[1].id });
  assert.equal(label, `${P.run(`teamOf("haas").name`)} · ${O.liveries[1].name}`);
  V.select("circuits", "monaco");
  assert.equal(P.run(`mode`), "circuits");
  let done = false;
  const p = V.still().then((v) => { done = v; });
  P.flush(); P.flush();
  await p;
  assert.equal(done, true, "still() resolves after two drawn frames");
  assert.equal(P.$("hint").hidden, true);
});

test("a page built with nothing says so instead of throwing", () => {
  const P = boot({});
  assert.match(P.$("view").innerHTML, /no cars and no circuits/);
});
