// Garage room LOOKS (GaragePrims.LOOKS) and the setup-sheet look pickers: every look must build
// a valid bay — one material id per vertex, in-range indices, finite
// positions inside the room — and must actually change the room's colours.
// A look that silently falls back to the shipped room is the failure this
// guards: the switch would "work" and every capture would look the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function harness() {
  const meshes = [];
  const gfx = {
    createMesh(data) { meshes.push(data); return { id: meshes.length }; },
    createTexMesh(data) { meshes.push(data); return { id: meshes.length, tex: true }; },
    freeMesh() {}, freeTexture() {}, createTexture() { return { id: 1 }; },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  const GaragePrims = vm.runInContext("GaragePrims", ctx);
  GarageScene.init(gfx);
  return { GarageScene, GaragePrims, meshes };
}

const TEAM = { id: "mclaren", name: "McLaren", short: "MCL",
               drivers: [{ name: "A", code: "AAA", num: 4 }, { name: "B", code: "BBB", num: 81 }] };
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };

function build(id) {
  const h = harness();
  assert.ok(h.GaragePrims.setLook(id), `setLook(${id})`);
  h.GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  const plain = h.meshes.filter((m) => !m.uv);
  return { ...h, plain };
}
// Mean vertex colour of the first (shell) mesh: the walls and ceiling.
const shellMean = (m) => {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < m.col.length; i += 3) { r += m.col[i]; g += m.col[i + 1]; b += m.col[i + 2]; }
  const n = m.col.length / 3;
  return [r / n, g / n, b / n];
};

test("GaragePrims keeps BOX_F / WALL_KEYED / sideOnly module-local", () => {
  const { GaragePrims } = harness();
  assert.equal(GaragePrims.BOX_F, undefined);
  assert.equal(GaragePrims.WALL_KEYED, undefined);
  assert.equal(GaragePrims.sideOnly, undefined);
  assert.equal(typeof GaragePrims.block, "function");
  assert.equal(typeof GaragePrims.panelGrid, "function");
});

test("every look builds valid bay meshes", () => {
  const { GaragePrims } = harness();
  assert.ok(GaragePrims.LOOK_IDS.length >= 5, "stock plus at least four looks");
  assert.equal(GaragePrims.setLook("no-such-look"), false);
  for (const id of GaragePrims.LOOK_IDS) {
    const { plain } = build(id);
    assert.ok(plain.length > 5, `${id}: meshes built`);
    for (const m of plain) {
      const v = m.pos.length / 3;
      assert.equal(m.mat.length, v, `${id}: one material id per vertex`);
      assert.equal(m.col.length, v * 3, `${id}: one colour per vertex`);
      for (const p of m.pos) assert.ok(Number.isFinite(p), `${id}: finite positions`);
      for (const c of m.col) assert.ok(Number.isFinite(c) && c >= 0, `${id}: finite colours`);
      for (const i of m.idx) assert.ok(i >= 0 && i < v, `${id}: index in range`);
    }
  }
});

test("each look changes the room (no silent fallback to stock)", () => {
  const means = {};
  const { GaragePrims } = harness();
  for (const id of GaragePrims.LOOK_IDS) means[id] = shellMean(build(id).plain[0]);
  const ids = Object.keys(means);
  for (let a = 0; a < ids.length; a++)
    for (let b = a + 1; b < ids.length; b++) {
      const d = Math.hypot(...means[ids[a]].map((v, k) => v - means[ids[b]][k]));
      assert.ok(d > 0.02, `${ids[a]} vs ${ids[b]}: shell colour differs (Δ ${d.toFixed(3)})`);
    }
});

test("trackside bays (buildStatic) ignore the look", () => {
  const a = harness(), b = harness();
  b.GaragePrims.setLook("flood");
  const sa = a.GarageScene.buildStatic ? a.GarageScene.buildStatic(LIV) : null;
  const sb = b.GarageScene.buildStatic ? b.GarageScene.buildStatic(LIV) : null;
  if (!sa) return;   // buildStatic not exported in this tree
  assert.deepEqual(Array.from(sb.col), Array.from(sa.col), "pit rows keep the shipped room");
});

test("new room looks rebuild a live bay and restore its stock shell", () => {
  const { GaragePrims, GarageScene, meshes } = harness();
  const shellAfterDraw = () => {
    const from = meshes.length;
    GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
    const shell = meshes.slice(from).find((m) => !m.uv);
    assert.ok(shell, "a changed room builds a new shell");
    return shell;
  };
  const stock = shellAfterDraw();
  for (const id of ["porcelain", "heritage", "endurance"]) {
    assert.equal(GaragePrims.setLook(id), true, `${id} is selectable`);
    const shell = shellAfterDraw();
    assert.notDeepEqual(shell.col, stock.col, `${id} changes the current room`);
    const count = meshes.length;
    GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
    assert.equal(meshes.length, count, `${id} reuses its meshes on the next frame`);
    GaragePrims.setLook("stock");
    assert.deepEqual(shellAfterDraw().col, stock.col, `${id} leaves no colour override behind`);
  }
});

test("a look's upper wall takes its panel colour, not the accent stripe", () => {
  const { plain } = build("flood");
  const shell = plain[0];
  // flood's panel is the team c1 (papaya here): find a vertex high on the back wall.
  let hit = null;
  for (let i = 0; i < shell.pos.length; i += 3)
    if (shell.pos[i + 1] > 3 && shell.pos[i + 1] < 4.9 && shell.pos[i + 2] < -6.3) { hit = i; break; }
  assert.ok(hit != null, "a back-wall vertex above 3 m");
  const c = shell.col.slice(hit, hit + 3);
  assert.ok(c[0] > 0.6 && c[2] < 0.2, `upper wall is team colour, got ${Array.from(c).map((v) => v.toFixed(2))}`);
});

// FIT: nothing in the roof floats. Every roof mesh (the truss, per look) must
// reach the ceiling's underside, and a truss that spans the bay bears on both walls.
test("fit: every look's roof structure is hung from the ceiling", () => {
  const { GaragePrims } = harness();
  const { CEIL_Y, HALF_W } = GaragePrims;
  for (const id of GaragePrims.LOOK_IDS) {
    const { plain } = build(id);
    // The truss mesh is the one whose every vertex sits above 3.9 m.
    const truss = plain.find((m) => { for (let i = 1; i < m.pos.length; i += 3) if (m.pos[i] < 3.9) return false; return m.pos.length > 0; });
    assert.ok(truss, `${id}: a roof mesh`);
    let top = -1, xmin = 1e9, xmax = -1e9;
    for (let i = 0; i < truss.pos.length; i += 3) { top = Math.max(top, truss.pos[i + 1]); xmin = Math.min(xmin, truss.pos[i]); xmax = Math.max(xmax, truss.pos[i]); }
    assert.ok(Math.abs(top - CEIL_Y) < 1e-3, `${id}: roof reaches the ceiling (top ${top.toFixed(3)})`);
    if (id === "workshop") assert.ok(xmin <= -HALF_W + 1e-3 && xmax >= HALF_W - 1e-3, `${id}: trusses bear on both walls`);
  }
});

// THE PICKERS (Bryce 2026-10-20: "Add pickers for all"). The setup sheet's TEAM
// tab draws one chip row per look table — GARAGE (GaragePrims.LOOKS), CREW
// (GarageCrew.LOOKS), LIGHTING (GarageScene.MOODS) — and a click must reach the
// scene module, which applies and saves it. Runs the real lookRowSpecs /
// buildLookRows source against stub tables and a minimal DOM.
function pickerHarness(soundOn = false) {
  const src = read("js/garage/setup-sheet.js");
  const start = src.indexOf("const CREW_NAMES"), end = src.indexOf("// TEAM & DRIVER");
  assert.ok(start > 0 && end > start, "picker source found in setup-sheet.js");
  const calls = [], focused = [];
  let rebuilds = 0, ticks = 0;
  const el = (tag) => {
    const node = {
      tag, children: [], dataset: {}, attrs: {}, className: "", id: "", textContent: "",
      appendChild(c) { this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      focus() { focused.push(`[data-cs-look="${this.dataset.csLook}"]`); },
    };
    node.classList = { toggle(name, on) {
      const classes = new Set(node.className.split(/\s+/).filter(Boolean));
      if (on) classes.add(name); else classes.delete(name);
      node.className = [...classes].join(" ");
    } };
    return node;
  };
  const opts = el("div");
  const ctx = vm.createContext({
    document: { createElement: el },
    csLabel: (t) => Object.assign(el("label"), { textContent: t }),
    buildSetup: () => { rebuilds++; },
    $: () => ({ querySelector: (sel) => ({ focus: () => focused.push(sel) }) }),
    G: { soundOn }, GameAudio: { uiTick() { ticks++; } },
    GaragePrims: { LOOK_IDS: ["stock", "studio"], LOOKS: { stock: null, studio: { label: "Silver studio" } },
      lookId: () => "stock", setLook: (id) => calls.push(["room", id]) },
    GarageCrew: { LOOKS: ["classic", "pitstop"], look: () => "classic", setLook: (id) => calls.push(["crew", id]) },
    GarageScene: { MOODS: { shipped: {}, night: {} }, mood: () => "shipped", setMood: (id) => calls.push(["mood", id]) },
  });
  vm.runInContext(src.slice(start, end), ctx);
  vm.runInContext("buildLookRows", ctx)(opts);
  return { opts, calls, focused, rebuilds: () => rebuilds, ticks: () => ticks };
}

test("pickers: GARAGE, CREW and LIGHTING rows, current look pressed", () => {
  const h = pickerHarness();
  const labels = h.opts.children.filter((c) => c.tag === "label").map((c) => c.textContent);
  assert.deepEqual(labels, ["GARAGE", "CREW", "LIGHTING"]);
  const rows = h.opts.children.filter((c) => c.tag === "div");
  assert.deepEqual(rows.map((r) => r.id), ["cs-look-room", "cs-look-crew", "cs-look-mood"]);
  assert.deepEqual(rows[0].children.map((b) => b.textContent), ["TEAM BAY", "SILVER STUDIO"]);
  assert.deepEqual(rows[1].children.map((b) => b.textContent), ["CLASSIC", "PIT STOP"]);
  assert.deepEqual(rows[2].children.map((b) => b.textContent), ["STANDARD", "NIGHT"]);
  for (const r of rows) {
    assert.equal(r.attrs.role, "group");
    assert.equal(r.children[0].attrs["aria-pressed"], "true");
    assert.equal(r.children[1].attrs["aria-pressed"], "false");
  }
});

test("pickers: room/crew rebuild, lighting applies in place and keeps focus", () => {
  const h = pickerHarness();
  const rows = h.opts.children.filter((c) => c.tag === "div");
  rows[0].children[0].onclick();                       // already current: no-op
  assert.equal(h.calls.length, 0);
  rows[0].children[1].onclick(); rows[1].children[1].onclick(); rows[2].children[1].onclick();
  assert.deepEqual(h.calls, [["room", "studio"], ["crew", "pitstop"], ["mood", "night"]]);
  assert.equal(h.rebuilds(), 2);
  assert.deepEqual(h.focused, ['[data-cs-look="room:studio"]', '[data-cs-look="crew:pitstop"]', '[data-cs-look="mood:night"]']);
});

test("lighting picker: alternating moods keeps one pressed button without rebuilding or duplicate ticks", () => {
  const h = pickerHarness(true);
  const row = h.opts.children.find((c) => c.id === "cs-look-mood");
  const [standard, night] = row.children;
  standard.onclick();
  for (const button of [night, standard, night]) {
    button.onclick();
    button.onclick(); // the current selection stays a no-op after an in-place update
    assert.deepEqual(row.children.filter((b) => b.attrs["aria-pressed"] === "true"), [button]);
    assert.deepEqual(row.children.filter((b) => b.className.split(" ").includes("active")), [button]);
  }
  assert.deepEqual(h.calls, [["mood", "night"], ["mood", "shipped"], ["mood", "night"]]);
  assert.equal(h.rebuilds(), 0);
  assert.equal(h.ticks(), 3);
  assert.deepEqual(h.focused, ['[data-cs-look="mood:night"]', '[data-cs-look="mood:shipped"]', '[data-cs-look="mood:night"]']);
});

test("pickers: the crew and mood picks are saved by their scene modules", () => {
  // The real setters, run against a stub localStorage: the pick must persist.
  const saved = new Map();
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
    localStorage: { getItem: (k) => (saved.has(k) ? saved.get(k) : null), setItem: (k, v) => saved.set(k, String(v)) },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/scene-crew.js", "js/garage/experience.js",
                   "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const crew = vm.runInContext("GarageCrew", ctx), scene = vm.runInContext("GarageScene", ctx);
  assert.equal(crew.setLook("pitstop"), "pitstop");
  assert.equal(saved.get("apex26.crewLook"), "pitstop");
  assert.equal(scene.setMood("night"), "night");
  assert.equal(scene.mood(), "night");
  assert.equal(saved.get("apex26.garageMood"), "night");
  assert.equal(scene.setMood("no-such-mood"), "shipped", "an unknown id falls back to the shipped rig");
});

test("new working-light moods preserve fixtures and restore the standard rig", () => {
  const { GarageScene: scene } = harness();
  const rig = () => Array.from(scene.live(LIV, 0, scene.moodCtx({ night: false, ambient: true })));
  const base = rig();
  const signatures = new Set();
  for (const id of ["inspection", "goldenhour", "endurance"]) {
    assert.equal(scene.setMood(id), id);
    const lit = rig();
    assert.ok(lit.every(Number.isFinite), `${id}: finite lighting records`);
    assert.equal(lit.length % 15, 0, `${id}: complete fixture records`);
    assert.ok(lit.length === base.length || (id === "endurance" && lit.length === base.length + 4 * 15),
      `${id}: only the existing four night gantries may be enabled`);
    signatures.add(JSON.stringify(lit));
    scene.setMood("shipped");
    assert.deepEqual(rig(), base, `${id}: no tint or gain leaks into standard lighting`);
  }
  assert.equal(signatures.size, 3, "each new mood changes the emitted light rig");
});
