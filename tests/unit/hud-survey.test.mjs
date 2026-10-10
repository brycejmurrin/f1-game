// hud-survey.test.mjs — the race-HUD survey's pure parts, no browser:
// tools/lib/hud-geometry.mjs (the clash rules hud-layout.spec.js now imports),
// tools/lib/hud-survey-matrix.mjs (matrices, pairwise, shards, expected-visible
// rules, findings, lead checks, merge), the CLI's argv / --self-test / --list,
// its in-page helpers run in a node:vm fake DOM, and the apex_hud_* MCP wraps
// (schema, dryRun argv, mock structuredContent + resource_link).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeOverlap, controlClash, probeHudElements, rectHit } from "../../tools/lib/hud-geometry.mjs";
import * as M from "../../tools/lib/hud-survey-matrix.mjs";
import { applyCell, chromiumArgs, hudFitState, parseArgs, probeWithTransients, runExtras, shotTimeoutMs } from "../../tools/shot/hud-survey.mjs";
import { analyzeSamples, parseArgs as parseLive, summarize } from "../../tools/shot/hud-live-sample.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(ROOT, "tools/shot/hud-survey.mjs");
const MCP = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const run = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8", timeout: 60000, env: { ...process.env, ...env } });
const mcp = (name, args, env = {}) => spawnSync(process.execPath, [MCP, "call", name, JSON.stringify(args)],
  { cwd: ROOT, encoding: "utf8", timeout: 30000, env: { ...process.env, APEX_MCP_MOCK: "1", ...env } });

const rec = (key, x, y, w, h, extra = {}) => ({ key, sel: key, role: "hud", exists: true, visible: true, hiddenBy: null,
  x, y, r: x + w, b: y + h, w, h, round: false, cx: x + w / 2, cy: y + h / 2, rr: w / 2, contains: [], minFontPx: 12, ...extra });

// ── lockstep with the game source ─────────────────────────────────────────
test("the survey's tables lockstep the game's: CamModes, HudLayout, HudElements, hud.js camera sets", () => {
  const cams = [...read("js/camera/mode-switch.js").matchAll(/\{ id: "([a-z]+)",\s+label:/g)].map((m) => m[1]);
  assert.deepEqual([...M.CAMS].sort(), [...new Set(cams)].sort(), "CAMS = CamModes.CAM_MODES ids");
  const hl = read("js/ui/hud-layout.js");
  const els = [...hl.slice(hl.indexOf("const ELEMENTS"), hl.indexOf("const IDS")).matchAll(/\["([a-z]+)", "/g)].map((m) => m[1]);
  assert.deepEqual([...M.LAYOUT_IDS], els, "LAYOUT_IDS = HudLayout.ELEMENTS");
  const presets = hl.slice(hl.indexOf("const PRESETS"), hl.indexOf("const store"));
  for (const [id, placed] of Object.entries(M.PRESETS)) {
    const m = new RegExp(`\\["${id}", "[A-Z]+", \\{([^\\]]*)\\}\\]`).exec(presets);
    assert.ok(m, `preset ${id} exists in HudLayout.PRESETS`);
    const keys = [...m[1].matchAll(/([a-z]+): \{/g)].map((x) => x[1]);
    assert.deepEqual(keys.sort(), [...placed].sort(), `PRESETS.${id} places what HudLayout's preset writes`);
  }
  assert.match(hl, /LIM = Object\.freeze\(\{ x: \[-50, 50\], y: \[-50, 50\], s: \[50, 200\] \}\)/);
  const he = read("js/ui/hud-elements.js");
  const toggles = [...he.slice(he.indexOf("const ELEMENTS"), he.indexOf("const store")).matchAll(/\["([a-z]+)", "/g)].map((m) => m[1]);
  assert.deepEqual(Object.keys(M.ELEMENT_TOGGLES), toggles, "ELEMENT_TOGGLES = HudElements.ELEMENTS");
  const css = read("css/hud.css");
  for (const [id, key] of Object.entries(M.ELEMENT_TOGGLES)) {
    const sel = M.HUD_TARGETS.find((t) => t.key === key).sel;
    assert.ok(css.includes(`body[data-hud-hide~="${id}"] ${sel}`), `css hides ${sel} for ${id}`);
  }
  const hud = read("js/ui/hud.js");
  assert.ok(hud.includes(`const BCAM_IDS = { ${M.BCAM_IDS.map((c) => `${c}: 1`).join(", ")} };`));
  // The onboard set lives as a literal in hud.js, or (once CamGroups lands)
  // as the CamGroups module's ONBOARD table — compare it as a set either way.
  let onboardSrc = (hud.match(/const ONBOARD_IDS = \{([^}]*)\}/) || [])[1];
  const camGroups = ["js", "camera", "cam-groups.js"].join("/");   // not on every branch yet
  if (onboardSrc == null && fs.existsSync(path.join(ROOT, camGroups))) {
    onboardSrc = (read(camGroups).match(/const ONBOARD = Object\.freeze\(\{([^}]*)\}/) || [])[1];
  }
  assert.ok(onboardSrc != null, "an onboard camera table in hud.js or cam-groups.js");
  assert.deepEqual([...onboardSrc.matchAll(/([a-z]+): 1/g)].map((m) => m[1]).sort(), [...M.ONBOARD_IDS].sort(), "ONBOARD_IDS = the game's onboard cameras");
  const cockpitSrc = (read(camGroups).match(/const COCKPIT_LAYOUT = Object\.freeze\(\{([^}]*)\}/) || [])[1];
  assert.ok(cockpitSrc != null, "CamGroups.COCKPIT_LAYOUT in cam-groups.js");
  assert.deepEqual([...cockpitSrc.matchAll(/([a-z]+): 1/g)].map((m) => m[1]).sort(), [...M.COCKPIT_LAYOUT_IDS].sort(), "COCKPIT_LAYOUT_IDS = CamGroups.COCKPIT_LAYOUT");
  assert.match(read("js/camera/mode-switch.js"), new RegExp(M.COCKPIT_LAYOUT_IDS.map((c) => `camId === "${c}"`).join(" \\|\\| ")), "body.cockpit-cam is the same pair");
  for (const t of M.HUD_TARGETS) if (t.sel.startsWith("#")) assert.ok(read("index.html").includes(`id="${t.sel.slice(1)}"`), `${t.sel} is static DOM`);
});

// ── geometry ──────────────────────────────────────────────────────────────
test("geometry: spec rules — circles for round buttons, rects otherwise, containment never clashes", () => {
  const b1 = rec("btn-ot", 0, 0, 50, 50, { role: "ctrl", round: true }), b2 = rec("btn-aero", 40, 40, 50, 50, { role: "ctrl", round: true });
  assert.equal(rectHit(b1, b2), true);
  assert.equal(controlClash(b1, b2), false, "diagonal circles whose rects touch are apart");
  const tower = rec("tower", 100, 0, 300, 60, { contains: ["delta"] }), delta = rec("delta", 300, 10, 60, 40);
  const r = analyzeOverlap([b1, b2, tower, delta, rec("chip", 30, 30, 30, 10)], 1280, 720, { sal: 20 });
  assert.deepEqual(r.overlaps, []);
  assert.deepEqual(r.hudClash, ["chip+btn-ot"], "chip y 30..40 ends where btn-aero starts: no clash");
  assert.deepEqual(r.unsafe, ["btn-ot"], "the 20px left inset binds a box at x=0");
  const ov = analyzeOverlap([rec("rotateDevice", 0, 0, 1280, 720, { role: "overlay" }), tower], 1280, 720);
  assert.deepEqual(ov.hudClash, [], "an overlay is never paired");
});

test("hud-layout.spec.js measures through the shared probe, not a copy", () => {
  const spec = read("tests/specs/hud-layout.spec.js");
  assert.match(spec, /import \{ analyzeOverlap, probeHudElements \} from "\.\.\/\.\.\/tools\/lib\/hud-geometry\.mjs"/);
  assert.match(spec, /page\.evaluate\(probeHudElements,/);
  assert.doesNotMatch(spec, /const clash = \(a, d\)/, "the inline clash rule moved to hud-geometry.mjs");
});

/** A fake DOM just big enough for the in-page helpers. */
function fakeDom(elems, extra = {}) {
  const byId = new Map(elems.map((e) => [e.id, e]));
  const document = {
    documentElement: { style: { getPropertyValue: (k) => (extra.vars || {})[k] || "" }, dataset: extra.dataset || {}, getAttribute: () => "dark" },
    body: { className: extra.bodyClass || "desktop in-race", classList: { contains: (c) => (extra.bodyClass || "desktop in-race").split(" ").includes(c) }, dataset: {} },
    querySelector: (sel) => byId.get(sel.replace(/^#/, "")) || null,
    getElementById: (id) => byId.get(id) || null,
    createTreeWalker: (el) => { const nodes = el._text ? [{ nodeValue: el._text, parentElement: el }] : []; let i = 0; return { nextNode: () => nodes[i++] || null }; },
  };
  for (const e of elems) {
    e.contains = (o) => (e._kids || []).includes(o);
    e.closest = () => null;
    e.textContent = e.textContent ?? e._text ?? "";
    e.getBoundingClientRect = () => ({ x: e._r[0], y: e._r[1], width: e._r[2], height: e._r[3], right: e._r[0] + e._r[2], bottom: e._r[1] + e._r[3] });
  }
  const getComputedStyle = (el) => ({ display: "block", visibility: "visible", opacity: "1", borderRadius: "0px", fontSize: "12px",
    transform: "none", scale: "none", color: "rgb(255, 255, 255)", backgroundColor: "rgba(0, 0, 0, 0)", ...(el._cs || {}) });
  return vm.createContext({ document, getComputedStyle, NodeFilter: { SHOW_TEXT: 4 }, performance: { now: () => Date.now() }, setTimeout, ...extra.globals });
}
const inVm = (ctx, fn, arg) => JSON.parse(JSON.stringify(vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg)})`, ctx)));

test("probeHudElements is self-contained and reads visibility, containment and rendered font px", () => {
  const kid = { id: "hud-delta", _r: [10, 10, 20, 10], _text: "+0.1", _cs: { fontSize: "8px" }, currentCSSZoom: 1.5 };
  const tower = { id: "tower-el", _r: [0, 0, 300, 50], _kids: [kid], _text: "POS", currentCSSZoom: 2, parentElement: null };
  kid.parentElement = tower;
  const gone = { id: "minimap", _r: [0, 0, 0, 0], _cs: { display: "none" } };
  const ctx = fakeDom([tower, kid, gone]);
  const out = inVm(ctx, probeHudElements, { fonts: true, targets: [{ key: "tower", sel: "#tower-el" }, { key: "delta", sel: "#hud-delta" },
    { key: "map", sel: "#minimap" }, { key: "nope", sel: "#nope" }] });
  assert.equal(out[0].visible, true);
  assert.deepEqual(out[0].contains, ["delta"]);
  assert.equal(out[0].minFontPx, 24, "12px x zoom 2");
  assert.equal(out[1].minFontPx, 12, "8px x zoom 1.5");
  assert.equal(out[2].visible, false);
  assert.equal(out[2].hiddenBy, "display");
  assert.equal(out[3].exists, false);
});

test("probeWithTransients forces the radio card / limits / flag on, probes, and restores them", () => {
  const ann = { id: "announce", hidden: true, innerHTML: "<x>", _r: [0, 0, 100, 20] };
  const lim = { id: "hud-limits", hidden: true, innerHTML: "LIMITS", _r: [0, 0, 50, 20], querySelector: () => ({ textContent: "" }) };
  const ctx = fakeDom([ann, lim, { id: "announce-who", _r: [0, 0, 1, 1] }, { id: "announce-text", _r: [0, 0, 1, 1] }]);
  const out = JSON.parse(JSON.stringify(vm.runInContext(`(${probeWithTransients.toString()})(${JSON.stringify({ src: "function (a) { return a.targets.map((t) => document.getElementById(t).hidden); }", arg: { targets: ["announce", "hud-limits"] } })})`, ctx)));
  assert.deepEqual(out, [false, false], "probed while forced on");
  assert.equal(ann.hidden, true);
  assert.equal(lim.hidden, true);
  assert.equal(ann.innerHTML, "<x>", "restored");
});

test("applyCell resets every live knob, in order, and reports a failing knob instead of throwing", () => {
  const calls = [];
  const log = (n) => (...a) => { calls.push([n, ...a]); return true; };
  const sels = {};
  const elems = ["pm-hudmap-sel", "pm-hudgaps-sel", "pm-hudprofile-sel"].map((id) => {
    const s = { id, _r: [0, 0, 1, 1], _v: "", dispatchEvent: (e) => calls.push(["change", id, s.value]) };
    Object.defineProperty(s, "value", { get: () => s._v, set: (v) => { s._v = ["on", "auto", "off", "standard", "minimal", "broadcast"].includes(v) ? v : ""; } });
    sels[id] = s;
    return s;
  });
  const ctx = fakeDom(elems, { globals: {
    window: { __apex: { freeze: log("freeze"), hudScale: log("hudScale"), uiScale: log("uiScale"), btnScale: log("btnScale"), tyres: log("tyres"),
      mirror: log("mirror"), setTimeOfDay: log("tod"), go: log("go"), camera: (c) => (calls.push(["camera", c]), { mode: c }), jump: log("jump"),
      step: log("step"), snapCam: log("snapCam"), hud: (v) => (v === undefined ? true : (calls.push(["hud", v]), v)) } },
    AppearanceOpts: { setTheme: log("theme"), setCvdMode: log("cvd"), setContrast: log("contrast"), setTextSize: log("textSize") },
    HudElements: { ELEMENTS: [["pos"], ["gear"]], set: log("el") },
    HudLayout: { PROFILES: ["standard", "minimal", "broadcast"], resetSet: log("reset"), camSet: (c) => (c === "cockpit" ? "cockpit" : "other"), applyPreset: log("preset"), set: log("hlset"),
      shown: () => "other", presetOf: () => "clean" },
    Event: function Event(t) { this.type = t; },
  } });
  const cell = { ...M.normalizeCell({ cam: "cockpit", preset: "clean", presetSet: "both", off: ["gear"], map: "auto", hud: "off", profileLive: "broadcast" }), frac: 0.2 };
  const r = JSON.parse(JSON.stringify(vm.runInContext(`(${applyCell.toString()})(${JSON.stringify(cell)})`, ctx)));
  const names = calls.map((c) => c[0]);
  assert.deepEqual(r.errors.filter((e) => !/mirror/.test(e)), []);
  assert.ok(names.indexOf("camera") < names.indexOf("preset") && names.indexOf("preset") < names.indexOf("jump"), names.join(" "));
  assert.deepEqual(calls.filter((c) => c[0] === "preset").map((c) => c[2]), ["cockpit", "other"], "presetSet both writes both sets");
  assert.deepEqual(calls.filter((c) => c[0] === "preset").map((c) => c[3]), [undefined, undefined], "presetProf shown: the style on screen");
  assert.deepEqual(calls.filter((c) => c[0] === "reset").map((c) => c[1] + "/" + c[2]),
    ["cockpit/standard", "other/standard", "cockpit/minimal", "other/minimal", "cockpit/broadcast", "other/broadcast"], "every style is reset");
  assert.deepEqual(calls.filter((c) => c[0] === "el"), [["el", "pos", true], ["el", "gear", true], ["el", "gear", false]]);
  assert.ok(calls.some((c) => c[0] === "change" && c[1] === "pm-hudmap-sel" && c[2] === "auto"), "MAP goes through its settings row");
  assert.ok(calls.some((c) => c[0] === "hud" && c[1] === false));
  assert.deepEqual(calls.filter((c) => c[0] === "change" && c[1] === "pm-hudprofile-sel").map((c) => c[2]), ["standard", "broadcast"], "boot profile restored, then the live switch");
  assert.equal(r.ctx.desktop, true);
  // A row with no such option is a reported knob error, not a crash.
  const bad = vm.runInContext(`(${applyCell.toString()})(${JSON.stringify({ ...cell, map: "bogus" })})`, ctx);
  assert.ok(bad.errors.some((e) => /^map: .*no option bogus/.test(e)), bad.errors.join("; "));
  // presetProf: inline offsets written into a named style's layout (lead 5).
  calls.length = 0;
  const into = { ...M.normalizeCell({ preset: { map: { y: 10 } }, presetProf: "broadcast", profileLive: "broadcast" }), frac: 0.2 };
  vm.runInContext(`(${applyCell.toString()})(${JSON.stringify(into)})`, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter((c) => c[0] === "hlset"))), [["hlset", "map", { y: 10 }, "other", "broadcast"]]);
});

test("hudFitState and runExtras read the fit caps, colours, a label clip and a settle time", async () => {
  const lab = { id: "lab", _r: [5, 5, 200, 10], scrollWidth: 210, clientWidth: 200, scrollHeight: 10, clientHeight: 10 };
  const bar = { id: "hud-energy", _r: [0, 0, 150, 20] };
  const val = { id: "val", _r: [0, 0, 10, 10], _cs: { color: "rgb(20, 20, 20)" }, parentElement: { id: "plate", className: "", parentElement: null } };
  const ctx = fakeDom([lab, bar, val], { vars: { "--hud-z-top": "0.8" }, dataset: { limitsLeft: "1" } });
  vm.runInContext("getComputedStyle = ((g) => (el) => el && el.id === 'plate' ? { backgroundColor: 'rgb(240, 240, 240)' } : g(el))(getComputedStyle)", ctx);
  const fit = inVm(ctx, hudFitState);
  assert.equal(fit.vars["--hud-z-top"], "0.8");
  assert.equal(fit.limitsLeft, true);
  const out = JSON.parse(JSON.stringify(await vm.runInContext(`(${runExtras.toString()})(${JSON.stringify([
    { type: "contrast", sel: "#val" }, { type: "clip", sel: "#hud-energy", label: "#lab" }, { type: "settle", var: "--hud-z-top", windowMs: 60 }])})`, ctx)));
  assert.deepEqual([out[0].fg, out[0].bg, out[0].bgFrom], ["rgb(20, 20, 20)", "rgb(240, 240, 240)", "plate"]);
  assert.equal(out[1].scrollW, 210);
  assert.deepEqual([out[2].before, out[2].after, out[2].lastChangeMs], ["0.8", "0.8", null]);
});

// ── matrices ──────────────────────────────────────────────────────────────
test("pairwise covers every pair (or only the named ones), deterministically, under constraints", () => {
  const dims = { a: [1, 2, 3], b: ["x", "y"], c: [true, false], d: ["p", "q", "r"] };
  const pw = M.pairwise(dims);
  assert.equal(pw.uncovered, 0);
  for (const [i, j] of [["a", "b"], ["a", "d"], ["c", "d"], ["b", "c"]])
    for (const u of dims[i]) for (const v of dims[j]) assert.ok(pw.cells.some((c) => c[i] === u && c[j] === v), `${i}=${u} ${j}=${v}`);
  assert.ok(pw.cells.length < 3 * 2 * 2 * 3 && pw.cells.length >= 9);
  assert.deepEqual(M.pairwise(dims).cells, pw.cells, "deterministic");
  const only = M.pairwise(dims, { only: [["a", "d"]] });
  assert.equal(only.pairs, 9);
  const v = M.pairwise({ device: M.MATRIX_DEVICES, cam: ["chase", "cockpit"] }, { valid: M.fullValid });
  assert.ok(!v.cells.some((c) => c.device === "phone-portrait-390x844" && c.cam === "cockpit"));
});

test("quick / full / leads / exhaustive: sizes, boots, coverage", () => {
  const q = M.expandMatrix("quick");
  assert.equal(q.cells.length, 13);
  assert.equal(M.bootGroups(q.cells).length, 3);
  for (const n of ["chase-default", "cockpit-default", "visor-default", "chase-preset-clean", "phoneP-chase", "chase-hud70", "chase-hud150"])
    assert.ok(q.cells.some((c) => c.id === n), n);
  const f = M.expandMatrix("full");
  assert.ok(f.cells.length <= M.FULL_CAP);
  assert.equal(f.meta.uncoveredPairs, 0);
  assert.ok(M.bootGroups(f.cells).length <= 20, "two-stage pairwise keeps the boots down");
  const x = M.expandMatrix("exhaustive");
  assert.equal(x.meta.uncoveredPairs, 0);
  for (const d of M.MATRIX_DEVICES) {
    const mine = x.cells.filter((c) => c.device === d);
    for (const [k, vals] of Object.entries({ profile: M.ENUMS.profile, layout: M.ENUMS.layout, theme: M.ENUMS.theme, cvd: M.ENUMS.cvd,
      textSize: M.ENUMS.textSize, tod: M.ENUMS.tod, map: M.ENUMS.map, gaps: M.ENUMS.gaps, mirror: M.ENUMS.mirror, hud: M.ENUMS.hud })) {
      for (const v of vals) assert.ok(mine.some((c) => c[k] === v), `${d}: ${k}=${v}`);
    }
    if (d !== "phone-portrait-390x844") for (const cam of M.CAMS) assert.ok(mine.some((c) => c.cam === cam), `${d}: cam ${cam}`);
    for (const p of Object.keys(M.PRESETS)) assert.ok(mine.some((c) => c.preset === p && c.presetSet === "both"), `${d}: ${p} on both sets`);
    assert.ok(mine.some((c) => c.track === "monaco"), `${d}: second track`);
    assert.equal(mine.some((c) => c.btnScale != null), M.DEVICES[d].touch, `${d}: BUTTON SIZE only on touch`);
  }
  for (const p of Object.keys(M.PRESETS)) for (const cam of M.CAMS) assert.ok(x.cells.some((c) => c.preset === p && c.cam === cam), `preset ${p} x ${cam}`);
  for (const p of M.ENUMS.profile) for (const cam of M.CAMS) assert.ok(x.cells.some((c) => c.profile === p && c.cam === cam), `profile ${p} x ${cam}`);
  const L = M.expandMatrix("leads");
  assert.ok(L.cells.every((c) => x.cells.some((e) => e.id === c.id)), "exhaustive includes every lead");
  for (const c of L.cells) for (const ch of c.checks || []) if (ch.vs) assert.ok(L.cells.some((b) => b.id === ch.vs), `${c.id}: baseline ${ch.vs} is a lead cell`);
});

test("shards: whole boot groups, a partition, balanced, baselines stay with their leads", () => {
  const x = M.expandMatrix("exhaustive").cells;
  for (const n of [1, 3, 8]) {
    const parts = Array.from({ length: n }, (_, i) => M.shardCells(x, i + 1, n));
    const ids = parts.flat().map((c) => c.id);
    assert.equal(ids.length, x.length);
    assert.equal(new Set(ids).size, x.length);
    const est = parts.map((p) => M.estimateMinutes(p));
    assert.ok(Math.max(...est) <= Math.min(...est) * 1.5 + 3, `n=${n} balanced: ${est}`);
  }
  const L = M.expandMatrix("leads").cells;
  for (let i = 1; i <= 4; i++) {
    const s = M.shardCells(L, i, 4);
    for (const c of s) for (const ch of c.checks || []) if (ch.vs) assert.ok(s.some((b) => b.id === ch.vs), `${c.id} and ${ch.vs} share a shard`);
  }
  assert.throws(() => M.parseShard("0/4"), M.CellError);
  assert.throws(() => M.shardCells(x, 5, 4), M.CellError);
});

test("cells: validation, stable ids, boot keys", () => {
  for (const bad of [{ cam: "x" }, { hudScale: 10 }, { btnScale: 400 }, { off: ["map"] }, { preset: { nope: {} } },
    { preset: { map: { s: 300 } } }, { track: "../x" }, { wat: 1 }, { checks: [{ type: "eval" }] }]) {
    assert.throws(() => M.normalizeCell(bad), M.CellError, JSON.stringify(bad));
  }
  const c = M.normalizeCell({ device: "phone-landscape-844x390", cam: "cockpit", preset: { map: { s: 150 } }, hudScale: 70, off: ["ot", "gear"] });
  assert.equal(M.cellId(c), M.cellId(M.normalizeCell({ off: "gear,ot", hudScale: "70", cam: "cockpit", device: "phone-landscape-844x390", preset: { map: { s: 150 } } })));
  assert.match(M.cellId(c), /^phoneL-cockpit-offsets-[a-z0-9]+-hud70-off-gear\.ot$/);
  assert.equal(M.bootKey(c), "phone-landscape-844x390|monza|standard|full|default");
  assert.equal(M.bootKey({ ...c, map: "off", theme: "light" }), M.bootKey(c), "MAP / theme are live, not boot keys");
});

// ── rules + findings ──────────────────────────────────────────────────────
test("expected-visible rules", () => {
  const E = (o, ctx = {}) => M.expectedVisibility(M.normalizeCell(o), ctx);
  const d = E({});
  for (const k of ["tower", "pos", "lap", "time", "best", "map", "gaps", "sectors", "gearbox", "speed", "energy", "ot", "aero", "bb", "tyre", "pausebtn"])
    assert.equal(d[k].want, true, k);
  assert.equal(d["btn-ot"].want, false, "desktop hides the touch stack");
  assert.equal(E({ map: "auto", cam: "cockpit" }).map.want, false);
  assert.equal(E({ map: "auto", cam: "visor" }).map.want, false, "visor is ONBOARD for MAP AUTO (hud.js / CamGroups)");
  assert.equal(E({ map: "on", profile: "minimal" }).map.want, true, "MAP ON beats MINIMAL");
  assert.equal(E({ profile: "minimal" }).sectors.want, false);
  assert.equal(E({ profile: "broadcast", cam: "heli" }).sectors.want, true);
  assert.equal(E({ cam: "heli" }).sectors.want, false);
  assert.equal(E({ cam: "tv" }).sectors.want, null, "the TV director's camera carries no camera rule");
  assert.equal(E({ layout: "compact" }).tyre.want, false);
  assert.equal(E({ tyres: "off" }).tyre.want, false);
  assert.equal(E({ device: "phone-landscape-844x390", cam: "cockpit" }, { desktop: false, cockpitCam: true }).ot.want, false);
  assert.equal(E({ device: "phone-landscape-844x390", cam: "cockpit", preset: "clean" }, { desktop: false, cockpitCam: true }).ot.want, true,
    "CLEAN places OT, so it escapes the touch-cockpit hide");
  assert.equal(E({ device: "phone-landscape-844x390", cam: "cockpit" }, { desktop: false, cockpitCam: true }).speed.want, true, "phone cockpit keeps speed");
  // A wheel with no LCD (CLASSIC / NONE) drops body.cockpit-cam, but the strip
  // still paints at the cockpit offsets: the touch hide follows the layout set.
  const classic = E({ device: "phone-landscape-844x390", cam: "cockpit" }, { desktop: false, cockpitCam: false });
  assert.deepEqual([classic.ot.want, classic.tyre.want, classic.energy.want, classic.gearbox.want], [false, false, false, true],
    "touch cockpit with a screenless wheel: chips hidden, the gearbox (no LCD) shown");
  // HELMET is the visor HUD (its own layout set, never cockpit-cam): a touch
  // helmet keeps ENERGY, TYRES and speed, leaves gear to the LCD glyph and
  // OT / AERO to their buttons; a desktop helmet shows the lot.
  const visor = E({ device: "phone-landscape-844x390", cam: "helmet" }, { desktop: false, cockpitCam: false });
  assert.deepEqual([visor.ot.want, visor.aero.want, visor.tyre.want, visor.energy.want, visor.gearbox.want, visor.speed.want], [false, false, true, true, true, true],
    "touch helmet: the visor keeps ENERGY / TYRES / GEAR / speed");
  const visorDesk = E({ device: "desktop-1280", cam: "helmet" }, { desktop: true, cockpitCam: false });
  assert.deepEqual([visorDesk.ot.want, visorDesk.tyre.want, visorDesk.energy.want, visorDesk.gearbox.want, visorDesk.speed.want], [true, true, true, true, true]);
  assert.equal(M.camGroupFacts(M.normalizeCell({ cam: "helmet", map: "auto" })).layoutSet, "helmet");
  assert.equal(E({ device: "phone-portrait-390x844" }).rotateDevice.want, true);
  const off = E({ off: ["pos", "gear", "limits"] });
  assert.deepEqual([off.pos.want, off.gearbox.want, off.limits.want, off.lap.want, off.speed.want], [false, false, false, true, true]);
  const hidden = E({ hud: "off" });
  assert.equal(hidden.tower.want, false);
});

test("findings: the CLEAN-preset map that vanishes, overlaps by severity, offscreen, unsafe, tiny text, rotate cover", () => {
  const cell = { ...M.normalizeCell({ name: "chase-preset-clean", preset: "clean" }), id: "chase-preset-clean" };
  const recs = [rec("tower", 500, 8, 280, 50), { ...rec("map", 10, 8, 140, 140), visible: false, hiddenBy: "display" }, rec("pausebtn", 1220, 8, 44, 44, { role: "ctrl" })];
  const f = M.classifyFindings(cell, { records: recs, ctx: { desktop: true } });
  const miss = f.find((x) => x.kind === "missing" && x.elements[0] === "map");
  assert.ok(miss && miss.severity === "high" && /MAP: ON/.test(miss.detail), JSON.stringify(f));
  const phone = { ...M.normalizeCell({ device: "phone-landscape-844x390" }), id: "p" };
  const many = M.classifyFindings(phone, { ctx: { desktop: false }, records: [
    rec("tower", 300, 0, 200, 40), rec("gaps", 480, 10, 100, 30), rec("btn-brake", 520, 20, 60, 60, { role: "ctrl" }),
    rec("energy", 820, 300, 80, 20), rec("sectors", 10, 100, 60, 20, { minFontPx: 7 }), rec("map", 0, 0, 0, 0, { visible: false, hiddenBy: "zero-box" }),
  ] });
  const kinds = (k) => many.filter((x) => x.kind === k);
  assert.ok(kinds("overlap").some((x) => x.elements.join() === "gaps+btn-brake".split("+").join() && x.severity === "high"), "readout over a tap target is high");
  assert.ok(kinds("overlap").some((x) => x.elements.join() === "tower,gaps" && x.severity === "medium"));
  assert.ok(kinds("offscreen").some((x) => x.elements[0] === "energy" && x.severity === "medium"));
  assert.ok(!kinds("unsafe").some((x) => x.elements[0] === "tower"), "tower at x=300, y=0 enters no inset (sat=0)");
  assert.ok(kinds("unsafe").some((x) => x.elements[0] === "sectors"), "x=10 < sal 47");
  assert.ok(kinds("tinyText").some((x) => x.elements[0] === "sectors" && x.severity === "high"));
  assert.ok(kinds("missing").some((x) => /touch controls/.test(x.detail)), "one touch button on a phone");
  const portrait = { ...M.normalizeCell({ device: "phone-portrait-390x844" }), id: "pp" };
  const pf = M.classifyFindings(portrait, { ctx: { desktop: false }, records: [rec("rotateDevice", 0, 0, 390, 844, { role: "overlay" }),
    rec("tower", 50, 60, 280, 50), rec("pausebtn", 300, 60, 52, 52, { role: "ctrl" })] });
  assert.ok(pf.length && pf.every((x) => x.severity === "info"), "everything under the rotate card is info");
  const noEff = M.classifyFindings({ ...M.normalizeCell({ profile: "minimal", preset: { sectors: { x: 10 } } }), id: "n" },
    { records: [rec("tower", 500, 8, 280, 50)], ctx: { desktop: true } });
  assert.ok(noEff.some((x) => x.kind === "noEffect" && x.elements[0] === "sectors"));
  const err = M.classifyFindings({ ...M.normalizeCell({}), id: "e" }, { cellError: "boom", pageErrors: ["TypeError: x"] });
  assert.equal(err.filter((x) => x.kind === "pageError").length, 2);
});

test("lead checks decide from the numbers, and merge re-decides across shards", () => {
  const base = { id: "b", cell: M.normalizeCell({ name: "b" }), records: [rec("map", 10, 100, 140, 140)], state: { vars: { "--hud-z-top": "0.9", "--hud-z-dock": "" } } };
  const mk = (checks, extra = {}) => ({ id: "c", cell: { ...M.normalizeCell({ name: "c", checks, lead: "L" }) }, records: [rec("map", 10, 172, 140, 140), rec("announce", 100, 100, 300, 40)],
    transientRecords: [rec("mirror", 400, 8, 300, 80), rec("announce", 500, 60, 300, 40), rec("flag", 900, 60, 60, 20)],
    state: { vars: { "--hud-z-top": "0.7", "--hud-z-dock": "" }, layoutSet: "cockpit", bodyHud: "desktop in-race" }, ...extra });
  const ev = (c) => M.evaluateChecks({ ...c.cell, id: c.id }, c, (id) => (id === "b" ? base : null));
  const [drop] = ev(mk([{ type: "varSame", var: "--hud-z-top", vs: "b" }]));
  assert.equal(drop.severity, "high");
  assert.equal(ev(mk([{ type: "varSame", var: "--hud-z-top", vs: "missing" }]))[0].severity, "info");
  assert.equal(ev(mk([{ type: "varWritten", var: "--hud-z-dock" }]))[0].severity, "high");
  const shift = ev(mk([{ type: "shift", key: "map", vs: "b", axis: "y", pct: 10, tolPct: 3 }]))[0];
  assert.equal(shift.severity, "info", shift.detail);   // 72px at 720 = 10 %
  const ov = ev(mk([{ type: "noOverlap", a: "mirror", b: ["announce", "flag"] }]));
  assert.deepEqual(ov.map((x) => x.severity), ["high", "info"]);
  assert.equal(ev(mk([{ type: "camConsistency" }]))[0].severity, "medium", "chase given the cockpit layout set");
  // CamGroups: VISOR / HOOD are onboard (MAP AUTO hides) with no wheel (other set, no cockpit-cam).
  const camCell = (cam, layoutSet, bodyHud) => ({ id: "c", cell: M.normalizeCell({ name: "c", cam, map: "auto", checks: [{ type: "camConsistency" }], lead: "L" }),
    records: [], state: { layoutSet, bodyHud } });
  for (const cam of ["visor", "hood"]) {
    const [f] = ev(camCell(cam, "other", "desktop hud-hide-map"));
    assert.equal(f.severity, "info", f.detail);
    assert.equal(ev(camCell(cam, "cockpit", "desktop hud-hide-map"))[0].severity, "medium", `${cam} on the cockpit set is a defect`);
  }
  assert.equal(ev(camCell("cockpit", "cockpit", "desktop hud-hide-map cockpit-cam"))[0].severity, "info");
  assert.equal(ev(camCell("helmet", "other", "desktop hud-hide-map cockpit-cam"))[0].severity, "medium", "helmet draws the wheel");
  assert.deepEqual(M.camGroupFacts(M.normalizeCell({ cam: "chase", map: "auto" })), { layoutSet: "other", mapAutoHides: false, cockpitCam: false });
  assert.equal(M.camGroupFacts(M.normalizeCell({ cam: "chase", map: "auto", profile: "minimal" })).mapAutoHides, true, "MAP AUTO hides under MINIMAL");
  const lowContrast = ev(mk([{ type: "contrast", sel: ".v", min: 4.5 }], { extras: [{ fg: "rgb(200, 200, 200)", bg: "rgba(255, 255, 255, 0.9)" }] }))[0];
  assert.equal(lowContrast.severity, "high");
  assert.equal(ev(mk([{ type: "settle", var: "--hud-z-top", maxMs: 500 }], { extras: [{ before: "0.9", after: "0.7", lastChangeMs: 900 }] }))[0].severity, "medium");
  assert.equal(ev(mk([{ type: "clip", sel: "#e", label: "#l" }], { extras: [{ scrollW: 10, clientW: 10, scrollH: 14, clientH: 10, lab: null, bar: null }] }))[0].severity, "medium");
  // Two shards, the baseline in one and the lead in the other: merge decides it.
  const lead = mk([{ type: "varSame", var: "--hud-z-top", vs: "b" }]);
  lead.findings = [];
  const merged = M.mergeReports([{ report: { meta: { matrix: "leads", shard: "1/2" }, cells: [base] } }, { report: { meta: { matrix: "leads", shard: "2/2" }, cells: [lead] } }]);
  assert.equal(merged.cells.length, 2);
  assert.ok(merged.findings.some((x) => x.kind === "lead" && x.severity === "high"));
  assert.equal(merged.meta.merged, 2);
});

test("reports: findings.md ranks and names shots; index.html is static and escaped", () => {
  const report = { meta: { matrix: "quick", track: "monza", frac: 0.18, when: "t" },
    cells: [{ id: "a<b", shotRel: "shots/a.png" }], findings: [{ cell: "a<b", kind: "overlap", elements: ["x", "y"], detail: "x|y", severity: "low" },
      { cell: "a<b", kind: "missing", elements: ["map"], detail: "gone", severity: "high" }] };
  const md = M.renderFindingsMd(report);
  assert.ok(md.indexOf("## missing") < md.indexOf("## overlap"));
  assert.match(md, /x\\\|y/);
  assert.match(md, /shots\/a\.png/);
  const html = M.renderIndexHtml(report);
  assert.doesNotMatch(html, /<script|https?:\/\//);
  assert.match(html, /a&lt;b/);
});

// ── CLI ───────────────────────────────────────────────────────────────────
test("CLI: --self-test passes, --list prints the cost first, --plan, refusals exit 1, no browser", () => {
  const st = run(["--self-test"]);
  assert.equal(st.status, 0, st.stdout + st.stderr);
  assert.match(st.stdout, /= self-test passed/);
  const l = run(["--list", "--matrix", "leads"]);
  assert.equal(l.status, 0, l.stderr);
  assert.match(l.stderr, /leads: \d+ cells in \d+ boots — estimate [\d.]+ min/);
  assert.match(l.stdout, /^lead01-base\t/m);
  const p = run(["--plan", "--matrix", "quick", "--only", "chase-default"]);
  assert.equal(JSON.parse(p.stdout).cells, 1);
  for (const bad of [["--url", "http://127.0.0.1:1"], ["--bogus"], ["--matrix", "nope.json"], ["--out", "/tmp/x"], ["--shard", "3/2"]]) {
    const r = run(["--plan", ...bad]);
    assert.equal(r.status, 1, `${bad.join(" ")}: ${r.stdout}`);
    assert.doesNotMatch(r.stderr, /\n\s+at /, "a flag mistake is one line, not a stack");
  }
  const h = run(["--help"]);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--matrix quick\|full\|exhaustive\|leads/);
});

test("CLI parse: one-cell knobs, --track base, --gl, matrix files and --merge", () => {
  const one = parseArgs(["--device", "tablet-1180x820", "--cam", "tv", "--btn-scale", "150", "--off", "pos,lap", "--tod", "night", "--track", "spa"]);
  assert.deepEqual([one.cells.length, one.cells[0].track, one.cells[0].btnScale, one.cells[0].off.join()], [1, "spa", 150, "lap,pos"]);
  assert.equal(parseArgs(["--matrix", "quick", "--track", "monaco"]).cells.every((c) => c.track === "monaco"), true);
  assert.equal(parseArgs(["--matrix", "quick"], { env: { APEX_GL: "llvmpipe" } }).gl, "llvmpipe");
  assert.ok(chromiumArgs({ backend: "three", gl: "llvmpipe" }).includes("--use-gl=angle"));
  assert.ok(chromiumArgs({ backend: "three", gl: "swiftshader" }).includes("--use-angle=swiftshader"));
  const f = parseArgs(["--matrix", "scratch/m.json"], { readFile: () => JSON.stringify({ dims: { cam: ["chase", "cockpit"], theme: ["dark", "light"] } }) });
  assert.equal(f.cells.length, 4);
  assert.throws(() => parseArgs(["--matrix", "scratch/m.json"], { readFile: () => JSON.stringify({ cells: [{ cam: "nope" }] }) }), /cam must be one of/);
  const m = parseArgs(["--merge", "artifacts/a", "artifacts/b", "--out", "artifacts/c"]);
  assert.deepEqual(m.merge.map((d) => path.relative(ROOT, d)), ["artifacts/a", "artifacts/b"]);
});

test("CLI --merge combines two shard dirs into one report, copying shots", () => {
  const dir = (fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true }), fs.mkdtempSync(path.join(ROOT, "scratch", "hud-merge-")));
  try {
    for (const [s, id] of [["s1", "chase-default"], ["s2", "cockpit-default"]]) {
      fs.mkdirSync(path.join(dir, s, "shots"), { recursive: true });
      fs.writeFileSync(path.join(dir, s, "shots", `${id}.png`), "png");
      fs.writeFileSync(path.join(dir, s, "report.json"), JSON.stringify({ meta: { matrix: "quick", track: "monza", frac: 0.18, shard: s },
        cells: [{ id, cell: M.normalizeCell({ name: id }), shotRel: `shots/${id}.png`, findings: [{ cell: id, kind: "missing", elements: ["map"], detail: "d", severity: "high" }] }] }));
    }
    const out = path.join(dir, "merged");
    const r = run(["--merge", path.join(dir, "s1"), path.join(dir, "s2"), "--out", path.relative(ROOT, out), "--json"]);
    assert.equal(r.status, 1, "no measured records in the fixture → exit 1, but the report is still written");
    const rep = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8"));
    assert.equal(rep.cells.length, 2);
    assert.equal(rep.counts.high, 2);
    assert.ok(fs.existsSync(path.join(out, "shots", "cockpit-default.png")));
    assert.ok(fs.existsSync(path.join(out, "index.html")) && fs.existsSync(path.join(out, "findings.md")));
    const sum = JSON.parse(r.stdout.trim().split("\n").pop());
    assert.equal(sum.cells.length, 2);
    assert.equal(sum.ok, false, "partial / unmeasured merge is not ok");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CLI writeReport exits non-zero when any cell has cellError even if others measured", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "hud-cellerr-"));
  try {
    const out = path.join(dir, "out");
    fs.mkdirSync(path.join(dir, "s1", "shots"), { recursive: true });
    fs.writeFileSync(path.join(dir, "s1", "shots", "ok.png"), "png");
    // One measured cell + one cellError-only cell (no records) → failed>0 must exit 1.
    fs.writeFileSync(path.join(dir, "s1", "report.json"), JSON.stringify({
      meta: { matrix: "quick" },
      cells: [
        { id: "ok-cell", cell: M.normalizeCell({ name: "ok-cell" }), shotRel: "shots/ok.png",
          records: [{ key: "map", exists: true, visible: true, x: 0, y: 0, w: 10, h: 10 }], findings: [] },
        { id: "boom", cell: M.normalizeCell({ name: "boom" }), cellError: "CDP captureScreenshot timed out after 60 s",
          records: [], findings: [{ cell: "boom", kind: "pageError", elements: [], detail: "cell failed", severity: "high" }] },
      ],
    }));
    const r = run(["--merge", path.join(dir, "s1"), "--out", path.relative(ROOT, out), "--json"]);
    assert.equal(r.status, 1, "cellError must fail the process even when another cell measured");
    const sum = JSON.parse(r.stdout.trim().split("\n").pop());
    assert.equal(sum.ok, false);
    assert.equal(sum.cellFailed, 1);
    assert.equal(sum.measured, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── MCP wraps ─────────────────────────────────────────────────────────────
test("MCP: apex_hud_* publish bounded schemas and are browser tools in the map", () => {
  const list = JSON.parse(spawnSync(process.execPath, [MCP, "list-tools"], { cwd: ROOT, encoding: "utf8" }).stdout);
  const shot = list.find((t) => t.name === "apex_hud_shot"), survey = list.find((t) => t.name === "apex_hud_survey");
  assert.ok(shot && survey);
  assert.deepEqual(shot.inputSchema.properties.cam.enum, [...M.CAMS]);
  assert.deepEqual(shot.inputSchema.properties.device.enum, Object.keys(M.DEVICES));
  assert.deepEqual([shot.inputSchema.properties.hudScale.minimum, shot.inputSchema.properties.hudScale.maximum], [40, 200]);
  assert.deepEqual(shot.inputSchema.properties.off.items.enum, Object.keys(M.ELEMENT_TOGGLES));
  assert.equal(shot.inputSchema.additionalProperties, false);
  assert.ok(Array.isArray(shot.inputSchema.properties.track.enum));
  assert.match(shot.description, /^Browser \(lock first\)/);
  assert.match(read("docs/AGENT-SURFACE.md"), /\| `apex_hud_survey` \| `shot\/hud-survey\.mjs` \| browser \| survey-ui-matrix \|/);
  assert.match(read(".claude/skills/survey-ui-matrix/SKILL.md"), /apex_hud_survey/);
});

test("MCP: dryRun argv is pinned, one-cell for apex_hud_shot, and accepted by the CLI's own parser", () => {
  const body = (r) => JSON.parse(r.stdout);
  const s = body(mcp("apex_hud_shot", { dryRun: true, cam: "cockpit", off: ["gear"], preset: { map: { s: 150 } }, btnScale: 300, device: "phone-short-734x343" }));
  assert.equal(s.ok, true);
  const argv = s.argv.slice(2);
  assert.ok(argv.includes("--json") && argv.includes("--device") && argv.includes("--cam") && argv.includes("--out"));
  assert.ok(!argv.some((a) => /^--(url|plan|self-test)/.test(a)));
  const parsed = parseArgs(argv);
  assert.equal(parsed.cells.length, 1);
  assert.equal(parsed.cells[0].preset.map.s, 150);
  const v = body(mcp("apex_hud_survey", { dryRun: true, matrix: "exhaustive", shard: "2/8", only: ["lead"] }));
  assert.equal(parseArgs(v.argv.slice(2)).meta.shard, "2/8");
  for (const [name, args, err] of [
    ["apex_hud_shot", { preset: { nope: { s: 1 } } }, "bad_args"], ["apex_hud_shot", { hudScale: 300 }, "bad_args"],
    ["apex_hud_shot", { cam: "bogus" }, "bad_args"], ["apex_hud_shot", { off: ["map"] }, "bad_args"],
    ["apex_hud_shot", { out: "/tmp/x" }, "path_escaped"], ["apex_hud_shot", { url: "http://127.0.0.1:1" }, "url_not_supported"],
    ["apex_hud_shot", { target: "deploy" }, "local_only"], ["apex_hud_survey", { only: ["--x"] }, "bad_args"],
    ["apex_hud_survey", { matrix: "/etc/passwd" }, "path_escaped"], ["apex_hud_survey", { matrix: "exhaustive" }, "bad_args"],
    ["apex_hud_survey", { shard: "9/8" }, "bad_args"],
  ]) {
    const r = mcp(name, { dryRun: true, ...args });
    assert.equal(r.status, 1, `${name} ${JSON.stringify(args)}: ${r.stdout}`);
    assert.equal(body(r).error, err, `${name} ${JSON.stringify(args)}`);
  }
});

test("MCP: a matrix file must be valid survey JSON under scratch/ before any lock", () => {
  const dir = (fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true }), fs.mkdtempSync(path.join(ROOT, "scratch", "hud-mcp-")));
  try {
    fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify({ cells: [{ name: "x", cam: "heli" }] }));
    fs.writeFileSync(path.join(dir, "bad.json"), JSON.stringify({ cells: [{ cam: "nope" }] }));
    const ok = mcp("apex_hud_survey", { dryRun: true, matrix: path.relative(ROOT, path.join(dir, "ok.json")) });
    assert.equal(ok.status, 0, ok.stdout);
    const bad = mcp("apex_hud_survey", { dryRun: true, matrix: path.relative(ROOT, path.join(dir, "bad.json")) });
    assert.match(JSON.parse(bad.stdout).message, /matrix: cam must be one of/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("MCP: results carry structuredContent, its serialized copy first, and resource_links (tools/call, mock)", () => {
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "apex_hud_shot", arguments: { cam: "chase" } } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "apex_hud_survey", arguments: { matrix: "leads" } } },
  ];
  const r = spawnSync(process.execPath, [MCP, "serve"], { cwd: ROOT, encoding: "utf8", timeout: 30000,
    input: lines.map((l) => JSON.stringify(l)).join("\n") + "\n", env: { ...process.env, APEX_MCP_MOCK: "1" } });
  const out = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  const shot = out.find((m) => m.id === 2).result, survey = out.find((m) => m.id === 3).result;
  for (const res of [shot, survey]) {
    assert.equal(res.content[0].type, "text");
    assert.deepEqual(JSON.parse(res.content[0].text), res.structuredContent, "first text block = serialized structuredContent");
    assert.equal(res.content[1].type, "text");
    assert.ok(res.content.some((c) => c.type === "resource_link" && c.uri.startsWith("file://") && c.name && c.mimeType));
    assert.equal(res.isError, undefined);
  }
  assert.ok(shot.structuredContent.shot && Array.isArray(shot.structuredContent.findings) && Array.isArray(shot.structuredContent.measurements));
  assert.ok(shot.content.some((c) => c.type === "resource_link" && c.mimeType === "image/png"));
  assert.deepEqual(survey.content.filter((c) => c.type === "resource_link").map((c) => c.mimeType), ["text/markdown", "text/html", "application/json"]);
});

test("the dispatch-only workflow shards, runs llvmpipe, merges and stays opt-in", () => {
  const yml = read(".github/workflows/hud-survey.yml");
  assert.match(yml, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(yml, /^\s+(push|pull_request|schedule):/m, "dispatch only");
  assert.match(yml, /--shard "\$SHARD" --gl llvmpipe/);
  assert.match(yml, /uses: \.\/\.github\/actions\/mesa-xvfb/);
  assert.match(yml, /hud-survey\.mjs --merge/);
  for (const m of yml.matchAll(/uses: ([^\s]+)/g)) if (!m[1].startsWith("./")) assert.match(m[1], /@[0-9a-f]{40}$/, `${m[1]} is SHA-pinned`);
  for (const choice of /options: \[(quick[^\]]*)\]/.exec(yml)[1].split(",").map((s) => s.trim())) assert.doesNotThrow(() => M.expandMatrix(choice));
  // Inputs reach the shell through env only.
  for (const l of yml.split("\n").filter((x) => /^\s+(run:|\s{2,}\S)/.test(x) && x.includes("${{ inputs."))) {
    assert.doesNotMatch(l, /^\s+(node|echo|if|extra)/, `input interpolated into a script line: ${l.trim()}`);
  }
});

// ── hud-live-sample: the LIVE (unfrozen) counterpart of the frozen survey cell ─────
// hud-survey freezes the sim, so a moved piece whose words change width after the
// cell's last fit is read stale (the 1280x720 cockpit AERO chip: right edge 1297,
// where a live race holds it at 1276). This tool samples over time instead.
const rect = (left, right, top = 500, bottom = 540) => ({ left, right, top, bottom });
const at = (t, r) => ({ t, rect: r });

test("hud-live-sample: a piece that stays on screen reports nothing", () => {
  const a = analyzeSamples([at(0, rect(1155, 1276)), at(40, rect(1155, 1276)), at(80, rect(1155, 1276))], { W: 1280, H: 720 });
  assert.equal(a.maxOffScreenPx, 0);
  assert.equal(a.offScreenMs, 0);
  assert.equal(a.pastMarginMs, 0);
  assert.equal(a.firstOffScreenAt, null);
  assert.equal(a.shown, 3);
});

test("hud-live-sample: how far past the edge, and for how long", () => {
  // 5 px off screen for two samples (80 ms), then back at the clamp, then 2 px past
  // fit's own 4 px margin but still on screen (the 'AERO 329m' residual).
  const a = analyzeSamples([at(0, rect(1164, 1285)), at(40, rect(1164, 1285)), at(80, rect(1155, 1276)), at(120, rect(1157, 1278))],
    { W: 1280, H: 720, interval: 40 });
  assert.equal(a.maxOffScreenPx, 5);
  assert.equal(a.offScreenMs, 80, "two samples x the gap to the next one");
  assert.equal(a.firstOffScreenAt, 0);
  assert.equal(a.lastOffScreenAt, 40);
  assert.equal(a.maxPastMarginPx, 9, "1285 against 1280 - 4");
  assert.equal(a.pastMarginMs, 120, "the two off-screen samples AND the 2 px one count past the margin");
  assert.equal(a.widthMin, 121);
  assert.equal(a.widthMax, 121);
});

test("hud-live-sample: the left and vertical edges count too, and the last sample is one interval long", () => {
  const left = analyzeSamples([at(0, rect(-80, 50))], { W: 1280, H: 720, interval: 40 });
  assert.equal(left.maxOffScreenPx, 80);
  assert.equal(left.offScreenMs, 40, "a lone sample is one interval, not zero");
  const bottom = analyzeSamples([at(0, rect(100, 200, 700, 730))], { W: 1280, H: 720 });
  assert.equal(bottom.maxOffScreenPx, 10);
});

test("hud-live-sample: sub-pixel layout noise and a hidden piece are on screen", () => {
  const noise = analyzeSamples([at(0, rect(1155, 1280.3))], { W: 1280, H: 720 });
  assert.equal(noise.offScreenMs, 0, "0.3 px is layout rounding, not an overflow");
  const hidden = analyzeSamples([at(0, null), at(40, null)], { W: 1280, H: 720 });
  assert.equal(hidden.shown, 0);
  assert.equal(hidden.offScreenMs, 0);
  assert.equal(hidden.widthMin, null);
});

test("hud-live-sample: summarize keeps each piece's worst trial and counts the trials that went off screen", () => {
  const ok = { maxOffScreenPx: 0, offScreenMs: 0, maxPastMarginPx: 0, pastMarginMs: 0 };
  const bad = { maxOffScreenPx: 5, offScreenMs: 1740, maxPastMarginPx: 9, pastMarginMs: 1740 };
  const w = summarize([{ pieces: { aero: ok, tyre: ok } }, { pieces: { aero: bad, tyre: ok } }, { pieces: { aero: ok, tyre: ok } }]);
  assert.equal(w.aero.offScreenMs, 1740);
  assert.equal(w.aero.maxOffScreenPx, 5);
  assert.equal(w.aero.trialsOffScreen, 1);
  assert.equal(w.tyre.trialsOffScreen, 0);
});

test("hud-live-sample: argv parsing — defaults, overrides, and every refusal", () => {
  const d = parseLive([]);
  assert.deepEqual([d.track, d.device, d.cam, d.tolerate, d.interval], ["monza", "desktop-1280", "cockpit", 250, 40]);
  assert.ok(d.jumps.length >= 4 && d.ids === null, "several jumps, every moved piece");
  assert.equal(d.keep, false, "by default every HUD piece is switched on first, like hud-survey");
  assert.equal(parseLive(["--keep"]).keep, true, "--keep is a flag: it takes no value");
  assert.deepEqual(parseLive(["--jumps", "none"]).jumps, [null], "--jumps none: one trial, no teleport");
  assert.deepEqual(parseLive(["--jumps=none"]).jumps, [null]);
  assert.match(parseLive(["--jumps", "0.2,none"]).error, /lap fractions/, "none is the whole list, not one entry of it");
  assert.deepEqual(parseLive(["--keep", "--ids", "aero"]).ids, ["aero"], "and it does not swallow the next option");
  const o = parseLive(["--ids", "aero,ot", "--jumps=0.1,0.9", "--device", "phone-landscape-844x390", "--tolerate", "0", "--cam=chase"]);
  assert.deepEqual(o.ids, ["aero", "ot"]);
  assert.deepEqual(o.jumps, [0.1, 0.9]);
  assert.equal(o.tolerate, 0);
  assert.equal(o.cam, "chase");
  assert.match(parseLive(["--device", "nope"]).error, /--device must be one of/);
  assert.match(parseLive(["--jumps", "0.2,1.5"]).error, /lap fractions/);
  assert.match(parseLive(["--interval", "5"]).error, /measures the sampler/);
  assert.match(parseLive(["--window", "-1"]).error, /--window/);
  assert.match(parseLive(["--bogus"]).error, /unknown option --bogus/);
  assert.match(parseLive(["monza"]).error, /unexpected argument/);
});

test("hud-live-sample: the CLI refuses a bad device before it launches anything, and --help says what it is", () => {
  const CLI2 = path.join(ROOT, "tools/shot/hud-live-sample.mjs");
  const bad = spawnSync(process.execPath, [CLI2, "--device", "nope"], { cwd: ROOT, encoding: "utf8", timeout: 30000 });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--device must be one of/);
  const help = spawnSync(process.execPath, [CLI2, "--help"], { cwd: ROOT, encoding: "utf8", timeout: 30000 });
  assert.equal(help.status, 0);
  assert.match(help.stdout + help.stderr, /UNFROZEN/);
});

// 2026-10-10: lead10-announce-s150-1920 failed a flat 60 s CDP capture cap twice on an idle box under SwiftShader (200 s
// cells) and passed under llvmpipe. A 1920x1080 frame gets a longer cap; every phone / 1280-wide cell keeps 60 s.
test("shotTimeoutMs: 60 s up to 1280x800, 180 s for a 1920x1080 frame", () => {
  for (const [w, h] of [[390, 844], [844, 390], [640, 360], [1180, 820], [1280, 800]]) assert.equal(shotTimeoutMs(w, h), 60000, `${w}x${h}`);
  assert.equal(shotTimeoutMs(1920, 1080), 180000);
  assert.equal(shotTimeoutMs(2560, 1440), 180000);
});

// ── hud-mock.mjs / apex_hud_mock: the HUD on black, mocked widgets ─────────
test("hud-mock: the default plan is phone landscape × 5 cams × shipped / all-on, and BUTTON SIZE only on touch", async () => {
  const { planCells } = await import("../../tools/shot/hud-mock.mjs");
  const { makeFlags } = await import("../../tools/lib/cli-args.mjs");
  const KNOWN = ["--devices", "--cams", "--hud-scale", "--ui-scale", "--btn-scale", "--sets", "--preset", "--matrix", "--track"];
  const plan = (argv) => planCells(makeFlags(argv, KNOWN));
  const d = plan([]);
  assert.equal(d.length, 10);
  assert.ok(d.every((c) => c.device === "phone-landscape-844x390"));
  assert.deepEqual([...d.find((c) => c.id.endsWith("-shipped")).off].sort(), ["inputs", "rel", "strat"]);
  assert.deepEqual(d.find((c) => c.id.endsWith("-all-on")).off, []);
  const mixed = plan(["--devices", "desktop-1280,phone-se-667x375", "--cams", "cockpit", "--sets", "all-on", "--btn-scale", "300"]);
  assert.equal(mixed.find((c) => c.device === "desktop-1280").btnScale, null, "no BUTTON SIZE on a desktop");
  assert.equal(mixed.find((c) => c.device === "phone-se-667x375").btnScale, 300);
  assert.throws(() => plan(["--devices", "nope"]), /unknown nope/);
});

test("MCP: apex_hud_mock is a pinned browser wrap with bounded arrays, a job by default, and a mock result with links", () => {
  const list = JSON.parse(spawnSync(process.execPath, [MCP, "list-tools"], { cwd: ROOT, encoding: "utf8" }).stdout);
  const t = list.find((x) => x.name === "apex_hud_mock");
  assert.ok(t);
  assert.deepEqual(t.inputSchema.properties.devices.items.enum, Object.keys(M.DEVICES));
  assert.deepEqual(t.inputSchema.properties.cams.items.enum, [...M.CAMS]);
  assert.deepEqual([t.inputSchema.properties.hudScale.items.minimum, t.inputSchema.properties.hudScale.items.maximum], [40, 200]);
  assert.match(t.description, /^Browser \(lock first\)/);
  assert.match(read("docs/AGENT-SURFACE.md"), /\| `apex_hud_mock` \| `shot\/hud-mock\.mjs` \| browser \| survey-ui-matrix \|/);
  const dry = JSON.parse(mcp("apex_hud_mock", { dryRun: true, devices: ["phone-se-667x375"], cams: ["cockpit", "chase"], hudScale: [70, 200] }).stdout);
  assert.equal(dry.ok, true);
  assert.ok(dry.argv[1].endsWith("tools/shot/hud-mock.mjs"));
  for (const f of ["--json", "--out"]) assert.ok(dry.argv.includes(f), f);
  assert.deepEqual(dry.argv.slice(dry.argv.indexOf("--cams"), dry.argv.indexOf("--cams") + 2), ["--cams", "cockpit,chase"]);
  assert.equal(JSON.parse(mcp("apex_hud_mock", { dryRun: true, hudScale: [999] }).stdout).error, "bad_args");
  const r = JSON.parse(mcp("apex_hud_mock", { async: false }, { APEX_MCP_MOCK: "1" }).stdout);
  assert.equal(r.ok, true);
  assert.equal(r.tool, "apex_hud_mock");
  assert.match(r.sheet, /sheet\.jpg$/);
  assert.equal(r.cells[0].overlaps[0].pair, "damage+inputs");
});

// ── tools/lib/ui-mock-core.mjs + tools/ui/menu-mock.mjs (pure parts) ────────
import os from "node:os";
import * as Core from "../../tools/lib/ui-mock-core.mjs";
import * as MM from "../../tools/ui/menu-mock.mjs";

test("ui-mock-core: cellKey ignores key order, and moves with the tool, the tree and every cell field", () => {
  const k = Core.cellKey("t", "tree1", { a: 1, b: { x: 1, y: 2 } });
  assert.equal(k, Core.cellKey("t", "tree1", { b: { y: 2, x: 1 }, a: 1 }));
  assert.notEqual(k, Core.cellKey("u", "tree1", { a: 1, b: { x: 1, y: 2 } }));
  assert.notEqual(k, Core.cellKey("t", "tree2", { a: 1, b: { x: 1, y: 2 } }));
  assert.notEqual(k, Core.cellKey("t", "tree1", { a: 1, b: { x: 1, y: 3 } }));
});

test("ui-mock-core: inputsHash follows js/css/index.html content and nothing else", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "uimock-"));
  fs.mkdirSync(path.join(d, "js")); fs.mkdirSync(path.join(d, "css")); fs.mkdirSync(path.join(d, "docs"));
  fs.writeFileSync(path.join(d, "index.html"), "<html>"); fs.writeFileSync(path.join(d, "js", "a.js"), "1"); fs.writeFileSync(path.join(d, "css", "a.css"), "a{}");
  const h1 = Core.inputsHash(d);
  fs.writeFileSync(path.join(d, "docs", "x.md"), "ignored"); fs.writeFileSync(path.join(d, "js", "readme.txt"), "ignored");
  assert.equal(Core.inputsHash(d), h1, "docs and non-code files do not invalidate the cache");
  fs.writeFileSync(path.join(d, "css", "a.css"), "a{color:red}");
  assert.notEqual(Core.inputsHash(d), h1, "a css edit does");
  fs.rmSync(path.join(d, "index.html"));
  assert.equal(Core.inputsHash(d), null, "no index.html: no evidence, no cache");
});

test("ui-mock-core: cellCache round-trips a row and its image; a null tree hash or enabled:false never hits", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "uimock-"));
  const img = path.join(d, "src.jpg"); fs.writeFileSync(img, "JPEGDATA");
  const c = Core.cellCache(path.join(d, "cache"), "t", "tree1");
  const key = c.key({ a: 1 });
  assert.equal(c.get(key), null);
  c.put(key, { id: "x", n: 2 }, img);
  const hit = c.get(key);
  assert.equal(hit.row.n, 2);
  assert.equal(fs.readFileSync(hit.file, "utf8"), "JPEGDATA");
  const other = Core.cellCache(path.join(d, "cache"), "t", "tree2");
  assert.equal(other.get(other.key({ a: 1 })), null, "the same cell on another tree misses");
  assert.equal(Core.cellCache(path.join(d, "cache"), "t", "tree1", { enabled: false }).get(key), null);
  assert.equal(Core.cellCache(path.join(d, "cache"), "t", null).get(key), null);
});

test("ui-mock-core: sheetArgs tiles labelled files, and is null for nothing", () => {
  assert.equal(Core.sheetArgs([], "o.jpg"), null);
  const a = Core.sheetArgs([{ id: "a", file: "/x/a.png" }, { id: "b", file: "/x/b.png" }], "o.jpg");
  assert.deepEqual(a.slice(0, 6), ["-label", "a", "/x/a.png", "-label", "b", "/x/b.png"]);
  assert.equal(a.at(-1), "o.jpg");
});

test("menu-mock: planMenuCells orders race-bound screens last, groups by pointer shape, and refuses unknown ids", () => {
  const cells = MM.planMenuCells("title,pause,select,photostudio", "ios-iphone-landscape-844,desktop-1280x800");
  assert.equal(cells.length, 8);
  assert.deepEqual(cells.filter((c) => c.viewport === "ios-iphone-landscape-844").map((c) => c.screen),
    ["title", "select", "photostudio", "pause"], "mode/race screens after title clicks");
  assert.ok(MM.planMenuCells("*", "desktop-1280x800").length > 20, "'*' is every catalogued screen");
  assert.throws(() => MM.planMenuCells("nope", "desktop-1280x800"), /--screens: unknown nope/);
  assert.throws(() => MM.planMenuCells("title", "nope"), /--viewports: unknown nope/);
  assert.equal(MM.groupKey({ hasTouch: true, isMobile: true }), "touch-mobile");
  assert.equal(MM.groupKey({}), "pointer-desktop");
  assert.ok(MM.DEFAULT_SCREENS.split(",").every((id) => MM.planMenuCells(id, MM.DEFAULT_VIEWPORTS).length === 1), "every default screen id exists");
});

test("menu-mock: OVERLAY_IDS includes photo-studio + loading so a * sweep can reset the title", async () => {
  const { OVERLAY_IDS } = await import("../../tools/ui/menu-screens.mjs");
  assert.ok(OVERLAY_IDS.includes("photo-studio"), "photo-studio covers #mb-race after a photostudio cell");
  assert.ok(OVERLAY_IDS.includes("loading"), "loading cover also sits above the title");
});

test("menu-mock: leaveToMenu dismisses ios-install and photo-studio-open", () => {
  const hidden = {};
  const bodyClasses = new Set(["photo-studio-open", "lt-open"]);
  const els = {
    "ios-install": { get hidden() { return !!hidden["ios-install"]; }, set hidden(v) { hidden["ios-install"] = !!v; } },
    "install-chip": { get hidden() { return !!hidden["install-chip"]; }, set hidden(v) { hidden["install-chip"] = !!v; } },
    "photo-studio": { hidden: true },
    "lighting": { hidden: true },
    "camtune": { hidden: true },
    "flyby": { hidden: true },
    "quali": { hidden: true },
    "race-settings": { hidden: true },
  };
  const sandbox = {
    window: { __apex: { info: () => ({ state: "menu", raceGrid: "grid" }) }, __mmGrid: "grid" },
    document: {
      getElementById: (id) => els[id] || null,
      body: { classList: { remove: (...xs) => xs.forEach((c) => bodyClasses.delete(c)) } },
    },
  };
  vm.runInNewContext(`(${MM.leaveToMenu.toString()})()`, sandbox);
  assert.equal(els["ios-install"].hidden, true);
  assert.equal(els["install-chip"].hidden, true);
  assert.equal(bodyClasses.has("photo-studio-open"), false);
  assert.equal(bodyClasses.has("lt-open"), false);
});

test("menu-mock --list needs no browser", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ui/menu-mock.mjs"), "--list", "--screens=title", "--viewports=desktop-1280x800"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /title__desktop-1280x800\n\[menu-mock\] 1 cells/);
});
