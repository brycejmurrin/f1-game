import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { makeDom } from "../helpers/mini-dom.mjs";

function boot(withRail = false, withNested = false, withActions = false, withEntry = false) {
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
  if (withEntry) { const entry = doc.getElementById("pc-toggle"); doc.getElementById("ct-rail").append(entry); }
  let foot, action;
  if (withActions) {
    foot = doc.createElement("div"); foot.className = "sheet-foot";
    action = doc.createElement("button"); action.id = "ct-reset";
    const done = doc.createElement("button"); done.id = "ct-close";
    foot.append(action, done); sheet.append(foot);
  }
  const ctx = vm.createContext({ document: doc });
  vm.runInContext(fs.readFileSync(new URL("../../js/ui/editor-workspace.js", import.meta.url), "utf8") + "\nglobalThis.api = EditorWorkspace;", ctx);
  const api = ctx.api.attach(root, { entry: withEntry ? "pc-toggle" : null, title: "Camera", note: "Per camera", done: withActions ? "ct-close" : null, rail: withRail ? "ct-rail" : null, launcher: "pm-camera", nav, nested: withNested ? "freecam" : null });
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


test("Free Camera stays on the toolbar when compact tools collapse", () => {
  const h = boot(true, false, false, true);
  const tools = h.sheet.querySelector("details");
  const entry = h.doc.getElementById("pc-toggle");
  assert.equal(tools.open, false);
  assert.equal(entry.parentNode, h.sheet.querySelector(".ew-toolbar"));
  assert.equal(tools.contains(entry), false);
  h.media.matches = false; h.resize();
  h.media.matches = true; h.resize();
  assert.equal(entry.parentNode, h.sheet.querySelector(".ew-toolbar"));
});

function garage() {
  const h = boot(), { doc } = h;
  const root = doc.createElement("div"), sheet = doc.createElement("div"), rows = doc.createElement("div"), foot = doc.createElement("div");
  root.hidden = true; sheet.className = "sheet"; rows.id = "ga-rows"; foot.className = "sheet-foot";
  const angleRow = doc.createElement("div"), angle = doc.createElement("select");
  angleRow.className = "set-row"; angle.id = "ga-angle"; angleRow.append(angle);
  const otherRow = doc.createElement("div"); otherRow.className = "set-row";
  const paragraphs = ["Sequence instructions", "Crew instructions", "Lighting instructions"].map(text => {
    const p = doc.createElement("p"); p.className = "adv-help"; p.textContent = text; return p;
  });
  rows.append(paragraphs[0], otherRow, angleRow, paragraphs[1], paragraphs[2]);
  const calls = [], sequences = [["ga-preview-in", "Pit stop"], ["ga-preview-out", "Race start"], ["ga-preview-home", "Return"]];
  const buttons = sequences.map(([id]) => { const b = doc.createElement("button"); b.id = id; b.onclick = () => calls.push(id); foot.append(b); return b; });
  const reset = doc.createElement("button"), done = doc.createElement("button");
  reset.id = "ga-reset"; reset.onclick = () => calls.push("reset"); done.id = "ga-close"; foot.append(reset, done);
  const transport = doc.createElement("div"); transport.id = "ga-transport"; transport.hidden = true;
  sheet.append(rows, foot); root.append(sheet, transport);
  const api = h.workspace.attach(root, { rows: "ga-rows", first: "ga-angle", reset: "ga-reset", sequences, done: "ga-close",
    defaultPreview: "ga-preview-out", previewSession: "ga-transport" });
  return { ...h, root, sheet, rows, foot, angleRow, paragraphs, buttons, calls, reset, done, transport, api };
}

test("garage controls start with angle while instructions and Reset stay in closed help", () => {
  const h = garage(), help = h.rows.querySelector("details");
  assert.equal(h.rows.children[0], h.angleRow);
  assert.equal(help.open, false);
  assert.equal(help.querySelector("summary").textContent, "Help and reset");
  assert.deepEqual(help.querySelectorAll(".adv-help"), h.paragraphs);
  assert.equal(h.reset.parentNode, help);
  assert.deepEqual(h.foot.querySelectorAll("button"), [h.done]);
  help.open = true; h.reset.click();
  assert.deepEqual(h.calls, ["reset"]);
});

test("compact garage sequence strip preserves each real preview handler and short label", () => {
  const h = garage(), strip = h.sheet.querySelector(".balanced-row");
  assert.equal(strip.getAttribute("aria-label"), "Preview sequence");
  assert.deepEqual(strip.querySelectorAll("button"), h.buttons);
  assert.deepEqual(h.buttons.map(b => b.textContent), ["Pit stop", "Race start", "Return"]);
  for (const b of h.buttons) b.click();
  assert.deepEqual(h.calls, ["ga-preview-in", "ga-preview-out", "ga-preview-home"]);
});

test("garage furniture survives preview changes and remount without duplicated controls", () => {
  const h = garage();
  h.api.setPreview(true); h.api.setPreview(false);
  assert.equal(h.workspace.attach(h.root), h.api);
  assert.equal(h.sheet.querySelectorAll(".ew-toolbar").length, 1);
  assert.equal(h.sheet.querySelectorAll(".balanced-row").length, 1);
  assert.equal(h.rows.querySelectorAll("details").length, 1);
  assert.deepEqual(h.sheet.querySelector(".balanced-row").querySelectorAll("button"), h.buttons);
});


test("garage toolbar Preview starts the real Race start action only after the user requests it", () => {
  const h = garage();
  h.root.hidden = false; h.observe();
  assert.deepEqual(h.calls, [], "opening the editor does not autoplay");
  h.sheet.querySelector(".ew-preview").click();
  assert.deepEqual(h.calls, ["ga-preview-out"]);
  assert.equal(h.sheet.dataset.editorView, "preview");
});

test("garage toolbar Preview preserves the active sequence and paused editing transport", () => {
  const h = garage();
  h.buttons[2].click(); h.transport.hidden = false;
  h.api.setPreview(false);
  const toggle = h.sheet.querySelector(".ew-preview");
  toggle.click(); toggle.click(); toggle.click();
  assert.deepEqual(h.calls, ["ga-preview-home"], "the Race start action never replaces an existing Return session");
  assert.equal(h.transport.hidden, false);
  assert.equal(h.sheet.dataset.editorView, "preview");
});

test("generic editor Preview remains furniture-only", () => {
  const h = boot(); let calls = 0;
  h.doc.getElementById("ga-preview-out").onclick = () => calls++;
  h.sheet.querySelector(".ew-preview").click();
  assert.equal(calls, 0);
  assert.equal(h.sheet.dataset.editorView, "preview");
});
