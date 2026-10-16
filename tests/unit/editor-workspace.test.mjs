import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { makeDom } from "../helpers/mini-dom.mjs";

function boot(withRail = false, withNested = false, withActions = false) {
  const { document: doc, dispatch } = makeDom();
  const original = doc.createElement;
  doc.createElement = (tag) => {
    const el = original(tag); el.ownerDocument = doc;
    const append = el.appendChild;
    el.appendChild = (child) => { if (child.parentNode) child.parentNode.removeChild(child); return append(child); };
    el.prepend = (child) => el.insertBefore(child, el.children[0]);
    return el;
  };
  let observe, resize;
  const media = { matches: true, addEventListener: (_, cb) => { resize = cb; } };
  doc.defaultView = { matchMedia: () => media, MutationObserver: class {
    constructor(cb) { observe = cb; } observe() {}
  } };
  const root = doc.createElement("div"), sheet = doc.createElement("div");
  sheet.className = "sheet"; root.append(sheet); root.hidden = true;
  const settings = doc.getElementById("pmsettings"), launcher = doc.getElementById("pm-camera");
  const nested = doc.getElementById("freecam"); nested.hidden = true;
  launcher.isConnected = true;
  const restored = []; const nav = { current: () => "visual-studio", show: (page) => restored.push(page) };
  if (withRail) { const rail = doc.getElementById("ct-rail"); sheet.append(rail); }
  let foot, action;
  if (withActions) {
    foot = doc.createElement("div"); foot.className = "sheet-foot";
    action = doc.createElement("button"); action.id = "ct-reset";
    const done = doc.createElement("button"); done.id = "ct-close";
    foot.append(action, done); sheet.append(foot);
  }
  const ctx = vm.createContext({ document: doc });
  vm.runInContext(fs.readFileSync(new URL("../../js/ui/editor-workspace.js", import.meta.url), "utf8") + "\nglobalThis.api = EditorWorkspace;", ctx);
  const api = ctx.api.attach(root, { title: "Camera", note: "Per camera", done: withActions ? "ct-close" : null, rail: withRail ? "ct-rail" : null, launcher: "pm-camera", nav, nested: withNested ? "freecam" : null });
  return { foot, action, nested, doc, settings, launcher, restored, click: () => dispatch(launcher, { type: "click" }), root, sheet, api, workspace: ctx.api, observe: () => observe(), resize: () => resize(), media };
}

test("preview furniture changes without closing the editor or taking over Escape", () => {
  const { root, sheet, api } = boot();
  api.setPreview(true);
  assert.equal(sheet.dataset.editorView, "preview");
  const toggle = sheet.querySelector("button");
  assert.equal(toggle.textContent, "Edit");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(root.getAttribute("data-esc-close"), null);
  toggle.onclick();
  assert.equal(sheet.dataset.editorView, "edit");
});

test("reopening restores controls and mounting is idempotent", () => {
  const { root, sheet, api, workspace, observe } = boot();
  api.setPreview(true); root.hidden = false; observe();
  assert.equal(sheet.dataset.editorView, "edit");
  assert.equal(workspace.attach(root), api);
  assert.equal(sheet.querySelectorAll(".ew-toolbar").length, 1);
  api.setNote("Changes apply to this camera");
  assert.equal(sheet.querySelector(".ew-note").textContent, "Changes apply to this camera");
});

test("short screens collapse tools without dropping them; wide screens expand them", () => {
  const { sheet, media, resize } = boot(true);
  const tools = sheet.querySelector("details");
  assert.equal(tools.open, false);
  assert.equal(tools.querySelector("summary").textContent, "Scope, presets and preview tools");
  assert.ok(tools.querySelector("#ct-rail"));
  media.matches = false; resize();
  assert.equal(tools.open, true);
  media.matches = true; resize();
  assert.equal(tools.open, false);
});

test("closing restores the captured Settings page after domain cleanup", () => {
  const h = boot();
  h.settings.hidden = false; h.click();
  h.settings.hidden = true; h.root.hidden = false; h.observe();
  h.root.hidden = true; h.settings.hidden = false; h.observe();
  assert.deepEqual(h.restored, ["visual-studio"]);
  assert.equal(h.doc.activeElement, h.launcher);
});

test("resume and non-Settings entries do not force navigation", () => {
  const h = boot();
  h.settings.hidden = false; h.click();
  h.settings.hidden = true; h.root.hidden = false; h.observe();
  h.root.hidden = true; h.observe();
  assert.deepEqual(h.restored, []);
  h.root.hidden = false; h.observe();
  h.root.hidden = true; h.settings.hidden = false; h.observe();
  assert.deepEqual(h.restored, []);
});


test("nested Free Camera returns to the original Settings page", () => {
  const h = boot(false, true);
  h.settings.hidden = false; h.click();
  h.settings.hidden = true; h.root.hidden = false; h.observe();
  h.root.hidden = true; h.nested.hidden = false; h.observe();
  assert.deepEqual(h.restored, []);
  h.nested.hidden = true; h.root.hidden = false; h.observe();
  h.root.hidden = true; h.settings.hidden = false; h.observe();
  assert.deepEqual(h.restored, ["visual-studio"]);
});

test("abandoning Free Camera clears the suspended Settings origin", () => {
  const h = boot(false, true);
  h.settings.hidden = false; h.click();
  h.settings.hidden = true; h.root.hidden = false; h.observe();
  h.root.hidden = true; h.nested.hidden = false; h.observe();
  h.nested.hidden = true; h.observe();
  h.root.hidden = false; h.observe();
  h.root.hidden = true; h.settings.hidden = false; h.observe();
  assert.deepEqual(h.restored, []);
});

test("missing DOM ownership is a no-op for shallow boot hosts", () => {
  const h = boot();
  assert.equal(h.workspace.attach({}), null);
  assert.equal(h.workspace.attach(null), null);
});


test("secondary editor actions keep their handlers inside tools while Done stays reachable", () => {
  const h = boot(false, false, true);
  const tools = h.sheet.querySelector("details");
  assert.equal(tools.open, false);
  assert.equal(h.foot.querySelectorAll("button").length, 1);
  assert.equal(h.foot.querySelector("button").id, "ct-close");
  assert.equal(tools.querySelector("#ct-reset"), h.action);
  let calls = 0; h.action.onclick = () => calls++;
  tools.open = true; h.action.onclick();
  assert.equal(calls, 1);
});
