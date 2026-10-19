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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

function bootPanel() {
  const dom = makeDom();
  const disk = new Map();
  const store = { get: (k, d) => (disk.has(k) ? disk.get(k) : d), set: (k, v) => { disk.set(k, v); return true; } };
  const $ = (id) => dom.byId(id);
  const mk = dom.document.createElement;   // a <select> has an option list the mini DOM lacks
  dom.document.createElement = (tag) => { const e = mk(tag); if (tag === "select") e.options = e.children; return e; };
  $("ct-help-on").checked = false;
  dom.byId("camtune-inner");
  const G = { $, els: { pmsettings: $("pmsettings") }, store, camMode: 0, track: { id: "monza" }, teamIdx: 0, paused: false };
  const sb = { Math, JSON, Object, Array, String, Number, console, document: dom.document, window: null,
    GameStore: { store }, M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) }, setTimeout: () => 0 };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(read("js/camera/offsets.js"), ctx, { filename: "js/camera/offsets.js" });
  ctx.CamModes = { CAM_MODES: [{ id: "chase", label: "CHASE" }, { id: "cockpit", label: "COCKPIT" }] };
  vm.runInContext(read("js/camera/tuner-panel.js") + "\n;globalThis.__panel = CamTunerEditor;", ctx, { filename: "js/camera/tuner-panel.js" });
  const panel = ctx.__panel.create(G);
  panel.buildCamTunePanel();
  return { dom, panel };
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
