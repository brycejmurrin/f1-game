/* Camera tuner accessibility contract (#2968).
 * The four scope chips (THIS CAM / ALL CAMS / THIS TRACK / THIS CAR) are toggle
 * buttons: the selected scope must be exposed as aria-pressed after every
 * switch, with exactly one button pressed. Drives the real panel in a VM.
 * Run: node --test tests/unit/camera-tuner-a11y.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

function bootPanel(disk = new Map([["trackId", "monza"], ["team", 1]])) {
  const dom = makeDom();
  // Model the serialized disk boundary; CamTune loads its own normalized copy.
  const writes = [];
  const store = { get: (k, d) => (disk.has(k) ? disk.get(k) : d), set: (k, v) => { writes.push(k); disk.set(k, JSON.parse(JSON.stringify(v))); return true; } };
  const $ = (id) => dom.byId(id);
  const mk = dom.document.createElement;   // a <select> has an option list the mini DOM lacks
  dom.document.createElement = (tag) => { const e = mk(tag); if (tag === "select") e.options = e.children; return e; };
  $("ct-help-on").checked = false;
  dom.byId("camtune-inner");
  const G = { $, els: { pmsettings: $("pmsettings") }, store, camMode: 0, track: { def: { id: "spa" } }, teamIdx: 0, paused: false };
  const sb = { Math, JSON, Object, Array, String, Number, console, document: dom.document, window: null,
    GameStore: { store }, Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }] },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) }, setTimeout: () => 0,
    ApexClipboard: { write: () => ({ then: () => {} }) } };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(read("js/camera/offsets.js"), ctx, { filename: absSrc("js/camera/offsets.js") });
  ctx.CamTune.bindContext(() => ({ track: G.track?.def?.id, car: sb.Teams.LIST[G.teamIdx]?.id }));
  ctx.CamModes = { CAM_MODES: [{ id: "chase", label: "CHASE" }, { id: "cockpit", label: "COCKPIT" }] };
  vm.runInContext(read("js/camera/tuner-panel.js") + "\n;globalThis.__panel = CamTunerEditor;", ctx, { filename: absSrc("js/camera/tuner-panel.js") });
  const panel = ctx.__panel.create(G);
  panel.buildCamTunePanel();
  return { dom, panel, G, disk, writes, CamTune: ctx.CamTune };
}

test("camera tuner scope buttons expose exactly one aria-pressed after every click", () => {
  const { dom } = bootPanel();
  const btns = dom.byId("ct-scope").children.filter((c) => c.tagName === "BUTTON");
  assert.deepEqual(btns.map((b) => b.dataset.scope), ["mode", "global", "track", "car"]);
  const pressed = () => btns.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.scope);
  assert.deepEqual(pressed(), ["mode"], "initial selection");
  for (const id of ["track", "car", "global", "mode", "car"]) {
    dom.dispatch(btns.find((b) => b.dataset.scope === id), { type: "click" });
    assert.deepEqual(pressed(), [id], `after clicking ${id}`);
    for (const b of btns) assert.ok(["true", "false"].includes(b.getAttribute("aria-pressed")), "every chip carries an explicit state");
  }
});

for (const scope of ["track", "car"]) test(`camera tuner ${scope} RESET survives a fresh load and preserves other modes/scopes`, () => {
  const h = bootPanel(), tune = h.CamTune;
  tune.setScoped(scope, "chase", "dist", 3);
  tune.setScoped(scope, "cockpit", "height", 1);
  tune.persist(scope);
  const other = scope === "track" ? "car" : "track";
  tune.setScoped(other, "chase", "dist", 4); tune.persist(other);
  h.dom.dispatch(h.dom.byId("ct-scope").children.find(b => b.dataset.scope === scope), { type: "click" });
  h.dom.byId("ct-reset").onclick();
  const fresh = bootPanel(h.disk).CamTune;
  assert.equal(fresh.getScoped(scope, "chase", "dist"), 0, "RESET must persist, not merely clear session memory");
  assert.equal(fresh.getScoped(scope, "cockpit", "height"), 1, "other camera modes survive");
  assert.equal(fresh.getScoped(other, "chase", "dist"), 4, "the other scope survives");
});

test("camera tuner resolves built track definitions instead of saved menu selections", () => {
  const { panel, G, CamTune } = bootPanel();
  panel.refreshCamTunePanel();
  assert.deepEqual(JSON.parse(JSON.stringify(CamTune.context())), { track: "spa", car: "mclaren" });
  CamTune.setScoped("track", "chase", "height", 2);
  assert.equal(CamTune.exportPack().tracks.spa.modes.chase.height, 2);
  assert.equal(CamTune.exportPack().tracks.monza, undefined);
  G.track = { def: { id: "suzuka" } }; G.teamIdx = 1;
  panel.refreshCamTunePanel();
  assert.deepEqual(JSON.parse(JSON.stringify(CamTune.context())), { track: "suzuka", car: "ferrari" });
  assert.equal(CamTune.getScoped("track", "chase", "height"), 0);
});

// #5066: CAMERA TUNER is a VISUAL STUDIO tool. Its DONE (#ct-close) must give back exactly the page it was opened
// from, never the HUD & CAMERA page (#pm-panel-display) underneath or beside it.
test("camera tuner close returns to VISUAL STUDIO and unhides no other settings page", () => {
  const { dom, G } = bootPanel();
  const shell = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const pages = [...shell.matchAll(/id="(pm-panel-[a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(pages.includes("pm-panel-visual") && pages.includes("pm-panel-display"), "the shell still has both pages");
  for (const id of pages) dom.byId(id).hidden = id !== "pm-panel-visual";   // settings open on VISUAL STUDIO
  G.paused = true; G.els.pmsettings.hidden = false;
  dom.byId("pm-camtune").onclick();
  assert.equal(dom.byId("camtune").hidden, false, "the tuner opened");
  assert.equal(dom.byId("pm-panel-visual").hidden, true, "VISUAL STUDIO steps aside for the live preview");
  dom.byId("ct-close").onclick();
  assert.equal(dom.byId("camtune").hidden, true);
  assert.equal(G.els.pmsettings.hidden, false, "back to the settings menu");
  assert.deepEqual(pages.filter((id) => !dom.byId(id).hidden), ["pm-panel-visual"],
    "exactly one pm-panel-* is unhidden, and it is pm-panel-visual");
});

// #5042: a scoped COMFORT value overrides every lower layer and had no way back; RESET at the scope clears it,
// the label counts it, and a reload agrees.
for (const scope of ["track", "car"]) test(`camera tuner ${scope} RESET clears the scope's comfort overrides and the label counts them`, () => {
  const h = bootPanel(), tune = h.CamTune, id = tune.comfortDefs()[0].id, def = tune.comfortGetScoped(scope, id);
  h.dom.dispatch(h.dom.byId("ct-scope").children.find((b) => b.dataset.scope === scope), { type: "click" });
  const inp = h.dom.byId("ct-cin-" + id);
  inp.value = String(Number(inp.max)); inp.oninput(); inp.onchange();
  assert.notEqual(tune.comfortGetScoped(scope, id), def, "the slider wrote a scoped comfort override");
  assert.match(h.dom.byId("ct-profile").textContent, /\(1 overrides\)/, "a comfort-only override is not '(no overrides)'");
  tune.setScoped(scope, "cockpit", "height", 1); tune.persist(scope);
  h.dom.byId("ct-reset").onclick();
  assert.equal(tune.comfortGetScoped(scope, id), def, "RESET drops the scoped comfort value");
  assert.match(h.dom.byId("ct-profile").textContent, /\(no overrides\)/);
  const fresh = bootPanel(h.disk).CamTune;
  assert.equal(fresh.comfortGetScoped(scope, id), def, "and it stays dropped after a reload");
  assert.equal(fresh.getScoped(scope, "cockpit", "height"), 1, "the scope's other camera modes survive");
});

// #5042: a drag fires `input` per tick; each one applies live, only the release (`change`) writes storage.
for (const scope of ["mode", "global", "track"]) test(`camera tuner sliders save once per drag at scope ${scope}`, () => {
  const h = bootPanel();
  h.dom.dispatch(h.dom.byId("ct-scope").children.find((b) => b.dataset.scope === scope), { type: "click" });
  for (const inp of [h.dom.byId("ct-in-" + h.CamTune.defs()[0].id), h.dom.byId("ct-cin-" + h.CamTune.comfortDefs()[0].id)]) {
    h.writes.length = 0;
    const lo = Number(inp.min), hi = Number(inp.max);
    for (let i = 1; i <= 20; i++) { inp.value = String(lo + (hi - lo) * i / 20); inp.oninput(); }
    assert.equal(h.writes.length, 0, inp.id + ": no storage write while dragging");
    inp.onchange();
    assert.equal(h.writes.length, 1, inp.id + ": one write on release");
    const fresh = bootPanel(h.disk);
    fresh.dom.dispatch(fresh.dom.byId("ct-scope").children.find((b) => b.dataset.scope === scope), { type: "click" });
    assert.equal(Number(fresh.dom.byId(inp.id).value), hi, inp.id + ": the released value is what a reload shows");
  }
});

// #5042: an editable, focused textarea raises the iOS keyboard over the preview. Only IMPORT makes the box typable.
test("camera tuner export box stays readOnly on open and COPY; IMPORT opens it empty for the paste", () => {
  const h = bootPanel(), ta = h.dom.byId("ct-json");
  h.dom.byId("pm-camtune").onclick();
  assert.equal(ta.readOnly, true, "opening the tuner leaves the box readOnly");
  h.CamTune.set("chase", h.CamTune.defs()[0].id, Number(h.dom.byId("ct-in-" + h.CamTune.defs()[0].id).max));
  h.dom.byId("ct-copy").onclick();
  assert.equal(ta.hidden, false, "COPY shows the export");
  assert.ok(ta.value.length > 0);
  assert.equal(ta.readOnly, true, "COPY focuses a readOnly box: no keyboard");
  h.dom.byId("ct-import").onclick();
  assert.equal(ta.readOnly, false, "IMPORT makes it typable");
  assert.equal(ta.value, "", "and clears the export, so the paste is not appended to it");
  h.dom.byId("ct-copy").onclick();
  assert.equal(ta.readOnly, true, "a COPY after IMPORT locks it again");
});
