/* garage-sheet-round2.test.mjs — round-2 garage fixes (A4), the REAL setup-sheet.js / scene.js in a VM.
 *
 *   G2  the career garage must not erase a part an ERA ban makes illegal (the ban lapses; the part comes back)
 *   G4  the wall BUDGET board reads FREE BUILD instead of "0 cr OF 780 REMAINING"
 *   G5  the stat bars, the part comparison and the wall board read Career.teamStats (development included)
 *   G6  a signature part row carries ONE "SIGNATURE" badge
 *   G7  legends' driver chips do not print their placeholder "#1"
 *
 * Run: node --test tests/unit/garage-sheet-round2.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
// `const X = (…)()` is script-scope in a VM: re-declare as var so the sandbox object sees it.
const src = (f) => read(f).replace(/^const\b/gm, "var");

function harness({ career = false, era = null, unlimited = false, stored = {}, tab = "engine", tdev = 0, team: teamId = "mercedes", tweakTeam } = {}) {
  const dom = makeDom();
  dom.document.createTextNode = (t) => { const e = dom.document.createElement("span"); e.textContent = t; return e; };
  const saved = [];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    GameAudio: { uiTick() {}, uiSelect() {}, uiReject() {}, init() {} }, ScrollFade: { refresh() {} },
  };
  sb.window = sb;
  vm.createContext(sb);
  const run = (f) => vm.runInContext(src(f), sb, { filename: f });
  for (const f of ["js/core/mat4.js", "js/car/parts.js", "js/data/teams.js", "js/career/regulations.js"]) run(f);
  run("js/garage/experience.js");
  if (era) sb.Parts.setLegality(sb.Regulations.legalityFor(era), era);
  sb.PhysicsConsts = { WET_GRIP: { rain: [1, 1.2, 1.4] } };
  sb.SetupTune = { FIELDS: [], RANGE: {}, get: () => ({ rideR: 60, rideF: 25, brakeBias: 56 }), set() {}, reset() {}, isDefault: () => true, mods: () => null, rake: () => 0 };
  sb.LiveryTex = { NUM_FONT_IDS: ["default"], SPONSOR_PACK_IDS: ["default"] };
  sb.Car3D = { FINISH_SURFACE: {} };
  sb.GarageScene = { pulse() {} };
  const owned = career ? new Set(sb.Parts.CATALOG.flatMap((c) => c.options.map((o) => o.id))) : null;
  sb.Career = {
    inCareer: () => career, owned: () => owned, budget: () => 4000, data: () => ({ money: 9999, tdev: { [teamId]: tdev } }),
    research: () => true, researchCost: () => 10,
    teamStats: (t) => { if (!tdev) return t.stats; const o = {}; for (const k in t.stats) o[k] = t.stats[k] + tdev; return o; },
  };
  let team = sb.Teams.LIST.find((t) => t.id === teamId);
  if (tweakTeam) { team = tweakTeam(team); sb.Teams.LIST.push(team); }
  const parts = JSON.parse(JSON.stringify(stored));
  const G = {
    $: (id) => dom.byId(id), els: { select: dom.byId("select"), overlay: dom.byId("overlay") }, cssCol: () => "#fff",
    store: { get: (k, d) => (k === "garageTab" ? tab : d), set() {} },
    arrToHex: () => "#112233", hexToArr: () => [0.1, 0.2, 0.3],
    getTeamParts: () => parts,
    saveTeamParts: (id, p) => { saved.push(JSON.stringify(p)); if (p !== parts) { for (const k of Object.keys(parts)) delete parts[k]; Object.assign(parts, p); } },
    getLiveryId: () => "default", saveLiveryId() {}, getCustomLiveries: () => [], setCustomLiveries() {}, getLiveries: () => [],
    invalidateDecalTextures: null, teamIdx: sb.Teams.LIST.indexOf(team), driverIdx: 0, soundOn: false,
    careerOwned: () => owned, unlimitedBudget: unlimited, peerSeats: () => [],
    teamSwatch: () => dom.document.createElement("span"), setTeamPicker() {}, openCustomize() {},
    livDraftOverride: null, _spMeshKey: "", setupPreviewOn: false,
  };
  vm.runInContext(src("js/garage/setup-sheet.js"), sb, { filename: "js/garage/setup-sheet.js" });
  const ui = sb.SetupUI.create(G);
  return { dom, ui, G, sb, saved, parts, team };
}

test("G2: an era ban never erases a fitted part from the career garage; a permanent lock still remaps", () => {
  const stored = { engine: "hybrid_max", ers: "overcharge", fuel: "custom_formula" };
  const h = harness({ career: true, era: "powertrain", stored });
  assert.ok(h.sb.Regulations.isLegal("overcharge", "open") && !h.sb.Regulations.isLegal("overcharge", "powertrain"),
    "the fixture really is banned in this era");
  h.ui.buildSetup();
  assert.equal(h.saved.length, 0, "opening the garage under the ban saves nothing");
  assert.deepEqual(JSON.parse(JSON.stringify(h.parts)), stored, "the fitted ids survive the ban");
  assert.equal(h.sb.Parts.legalityKey(), "powertrain", "the installed ruleset is put back exactly");
  // Race-time resolution still applies the ban, so nothing else is needed.
  const r = h.sb.Parts.resolveSetup(h.parts, h.team);
  assert.notEqual(r.options.ers.id, "overcharge", "the race resolves the banned ERS to its fallback");
  // The ban lapses: the part is still there.
  h.sb.Parts.setLegality(null, "");
  h.ui.buildSetup();
  assert.equal(h.parts.ers, "overcharge");
  assert.equal(h.sb.Parts.resolveSetup(h.parts, h.team).options.ers.id, "overcharge");

  // A permanent lock (another manufacturer's exclusive unit) is still remapped, era or not.
  const locked = harness({ career: true, era: "powertrain", stored: { engine: "manu_ferrari" } });
  locked.ui.buildSetup();
  assert.notEqual(locked.parts.engine, "manu_ferrari", "a supplier lock still remaps");
  assert.equal(locked.sb.Parts.legalityKey(), "powertrain");
});

test("G5: the stat bars read Career.teamStats (development), not the base team.stats", () => {
  const h = harness({ career: true, tab: "team", tdev: 6 });
  h.ui.buildSetup();
  const vals = h.dom.byId("cs-stats-inner").querySelectorAll(".cs-stat-val").map((v) => Number(v.textContent));
  const P = h.sb.Parts, mods = P.getMods({}, h.team, null);
  const want = P.STAT_KEYS.map(({ key }) => Math.round(P.displayStat((h.team.stats[key] + 6) * mods[key])));
  assert.deepEqual([...vals], [...want]);
  const base = harness({ career: true, tab: "team", tdev: 0 });
  base.ui.buildSetup();
  const baseVals = base.dom.byId("cs-stats-inner").querySelectorAll(".cs-stat-val").map((v) => Number(v.textContent));
  assert.notDeepEqual([...vals], [...baseVals], "development moves the bars");
});

test("G5: GarageExperience.compare and statsOf fall back to team.stats outside a career", () => {
  const h = harness({ career: true, tdev: 4 });
  const E = h.sb.GarageExperience, P = h.sb.Parts;
  assert.equal(E.statsOf(h.team).speed, h.team.stats.speed + 4);
  const cat = P.CATALOG.find((c) => c.id === "engine");
  const [a, b] = cat.options.filter((o) => P.isOptionAvailable(o, h.team));
  const dev = E.compare(h.team, {}, cat, a, b, null, 1000).deltas;
  h.sb.Career.teamStats = (t) => t.stats;
  const flat = E.compare(h.team, {}, cat, a, b, null, 1000).deltas;
  assert.equal(dev.length, flat.length);
  h.sb.Career = undefined;
  assert.equal(E.statsOf(h.team), h.team.stats, "no Career at all: the base stats");
});

test("G6: a signature part row carries ONE SIGNATURE badge", () => {
  const h = harness({ tab: "aero" });
  h.ui.buildSetup();
  const rows = h.dom.byId("cs-options").querySelectorAll(".cs-opt");
  const sig = rows.filter((r) => /^sig_/.test(r.dataset.csOpt));
  assert.ok(sig.length, "the aero tab lists signature parts");
  for (const r of sig) {
    const text = (r.querySelector(".cs-opt-tag") || {}).textContent || "";
    assert.equal(text.split(" · ").filter((w) => w === "SIGNATURE").length, 1, `${r.dataset.csOpt}: "${text}"`);
  }
});

test("G7: legends' driver chips drop the placeholder #1 but keep real numbers", () => {
  const h = harness({
    tab: "team",
    tweakTeam: (t) => Object.assign({}, t, { id: "legends", legends: true, drivers: [
      { name: "Michael Schumacher", code: "SCH", num: 1 }, { name: "Ayrton Senna", code: "SEN", num: 12 } ] }),
  });
  h.ui.buildSetup();
  const chips = h.dom.byId("cs-driver").querySelectorAll("button").map((b) => b.textContent);
  assert.deepEqual(chips, ["Michael Schumacher", "#12 Ayrton Senna"]);
  const real = harness({ tab: "team" });
  real.ui.buildSetup();
  const first = real.dom.byId("cs-driver").querySelectorAll("button")[0].textContent;
  assert.match(first, /^#\d+ /, "a real driver's number is always shown");
});

// ── G4 / G5: the wall board, painted by the real GarageScene onto a recording canvas ──
function sceneBoard({ unlimited = false, owned = false, tdev = 0 } = {}) {
  const texts = [];
  const g2d = new Proxy({}, {
    get: (t, k) => {
      if (k === "fillText") return (s) => { texts.push(String(s)); };
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => g2d }) };
  const gfx = { createMesh: () => ({}), createTexMesh: () => ({}), freeMesh() {}, freeTexture() {}, createTexture: () => ({}),
    updateTexture() {}, draw() {}, drawDecal() {}, drawGlow() {} };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array, Uint32Array, Map, Set, isFinite, parseFloat, parseInt, Date,
    document, LiveryTex: {}, Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/track/core/geom.js", "js/track/core/pit.js",
                   "js/garage/scene-prims.js", "js/garage/scene-equipment.js", "js/garage/scene-live.js",
                   "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const team = vm.runInContext('Teams.LIST.find(t => t.id === "mercedes")', ctx);
  const ownedSet = new Set();
  ctx.Career = {
    owned: () => owned, budget: () => 4000, data: () => ({ tdev: { mercedes: tdev } }),
    teamStats: (t) => { if (!tdev) return t.stats; const o = {}; for (const k in t.stats) o[k] = t.stats[k] + tdev; return o; },
  };
  void ownedSet;
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  const LIV = { c1: [0.1, 0.1, 0.1], c2: [0.1, 0.8, 0.7], accent: [0.1, 0.8, 0.7] };
  const getParts = () => ({});
  const c = { track: { id: "monza" }, weather: "dry", tod: "default", night: false, unlimited };
  GarageScene.prepare(team, LIV, getParts, 0, c);
  return { texts, GarageScene, team, LIV, getParts, c, ctx };
}

test("G4: the wall BUDGET board reads FREE BUILD when the budget is unlimited", () => {
  const free = sceneBoard({ unlimited: true });
  assert.ok(free.texts.includes("FREE BUILD"), "the board says FREE BUILD");
  assert.ok(!free.texts.some((t) => /REMAINING/.test(t)), "and no 'OF n REMAINING' line");
  const capped = sceneBoard({ unlimited: false });
  assert.ok(capped.texts.some((t) => /^OF \d+ REMAINING$/.test(t)), "a capped build still shows the cap");
  assert.ok(!capped.texts.includes("FREE BUILD"));
});

test("G4: toggling FREE BUILD repaints the board (the cache stamp carries the flag)", () => {
  const h = sceneBoard({ unlimited: false });
  assert.equal(h.GarageScene.prepared(h.team, h.LIV, h.getParts, 0, h.c), true);
  assert.equal(h.GarageScene.prepared(h.team, h.LIV, h.getParts, 0, { ...h.c, unlimited: true }), false,
    "the unlimited flag changes the room's key");
});

test("G4: a career board ignores the free-play flag (its cap is the career budget)", () => {
  const h = sceneBoard({ unlimited: true, owned: true });
  assert.ok(!h.texts.includes("FREE BUILD"));
  assert.ok(h.texts.includes("OF 4000 REMAINING"));
});

test("G5: the wall stat board reads Career.teamStats", () => {
  const dev = sceneBoard({ owned: true, tdev: 6 }), flat = sceneBoard({ owned: true, tdev: 0 });
  const P = vm.runInContext("Parts", dev.ctx), mods = P.getMods({}, dev.team, null);
  const num = (h) => h.texts.filter((t) => /^\d+$/.test(t)).map(Number);
  assert.ok(num(dev).includes(Math.round(P.displayStat((dev.team.stats.speed + 6) * mods.speed))), "developed speed on the board");
  assert.notDeepEqual([...num(dev)], [...num(flat)]);
});

test("the setup turntable gives the Legends slot its own helmet key and a per-legend mesh key", () => {
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam, /helmetKey: team\.legends && seat \? seat\.code : undefined/, "Car3D.build gets the legend's code");
  assert.match(cam, /\(team\.legends && seat \? ":" \+ seat\.code : ""\)/, "ten legends share num 1: the mesh key carries the code");
});
