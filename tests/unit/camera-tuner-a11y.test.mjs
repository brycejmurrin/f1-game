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
  const store = { get: (k, d) => (disk.has(k) ? disk.get(k) : d), set: (k, v) => { disk.set(k, JSON.parse(JSON.stringify(v))); return true; } };
  const $ = (id) => dom.byId(id);
  const mk = dom.document.createElement;   // a <select> has an option list the mini DOM lacks
  dom.document.createElement = (tag) => { const e = mk(tag); if (tag === "select") e.options = e.children; return e; };
  $("ct-help-on").checked = false;
  dom.byId("camtune-inner");
  const G = { $, els: { pmsettings: $("pmsettings") }, store, camMode: 0, track: { def: { id: "spa" } }, teamIdx: 0, paused: false };
  const sb = { Math, JSON, Object, Array, String, Number, console, document: dom.document, window: null,
    GameStore: { store }, Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }] },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) }, setTimeout: () => 0 };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(read("js/camera/offsets.js"), ctx, { filename: absSrc("js/camera/offsets.js") });
  ctx.CamTune.bindContext(() => ({ track: G.track?.def?.id, car: sb.Teams.LIST[G.teamIdx]?.id }));
  ctx.CamModes = { CAM_MODES: [{ id: "chase", label: "CHASE" }, { id: "cockpit", label: "COCKPIT" }] };
  vm.runInContext(read("js/camera/tuner-panel.js") + "\n;globalThis.__panel = CamTunerEditor;", ctx, { filename: absSrc("js/camera/tuner-panel.js") });
  const panel = ctx.__panel.create(G);
  panel.buildCamTunePanel();
  return { dom, panel, G, disk, CamTune: ctx.CamTune };
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
