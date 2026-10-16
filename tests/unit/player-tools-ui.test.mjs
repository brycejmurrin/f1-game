/* Actual player-tool modules in a small DOM/VM; no canvas or browser. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
const read = (name) => fs.readFileSync(new URL("../../" + name, import.meta.url), "utf8");
function host() {
  const dom = makeDom({ readyState: "loading" }), events = new Map();
  // The general mini DOM creates a missing id on lookup; these modules need
  // the browser's real absent-id result (not a phantom readout).
  dom.document.getElementById = (id) => dom.document.querySelector("#" + id);
  const sb = { document: dom.document, Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
    addEventListener: (t, fn) => { const list = events.get(t) || []; list.push(fn); events.set(t, list); },
    removeEventListener: (t, fn) => { events.set(t, (events.get(t) || []).filter((f) => f !== fn)); },
  };
  sb.window = sb; vm.createContext(sb);
  const run = (file, name) => { vm.runInContext(read(file), sb, { filename: file }); return vm.runInContext(name, sb); };
  const el = (tag, id, parent = dom.body) => { const node = dom.makeElement(tag, id); parent.appendChild(node); return node; };
  return { dom, sb, run, el, events };
}
function storage() {
  const values = new Map(), revisions = new Map(), changes = [];
  const store = {
    durable: true, get: (k, d) => values.has(k) ? structuredClone(values.get(k)) : d,
    write(k, v) { values.set(k, structuredClone(v)); revisions.set(k, (revisions.get(k) || 0) + 1); changes.push(k); return { ok: true, durable: this.durable }; },
    set(k, v) { return this.write(k, v).durable; }, keyRevision: (k) => String(revisions.get(k) || 0),
  };
  return { store, values, changes };
}
test("HUD direction/percent fallback mirrors only its own formatted label, including SHIPPED", () => {
  const h = host(), root = h.el("section", "pmsettings"), label = h.el("label", "", root), span = h.el("span", "", label);
  span.className = "tune-label"; const out = h.el("b", "", span); out.textContent = "10% left";
  const range = h.el("input", "pm-hl-x", label); range.type = "range"; range.setAttribute("type", "range"); range.value = "-10";
  const aria = h.run("js/ui/aria-state.js", "AriaState"); aria.sync(); assert.equal(range.getAttribute("aria-valuetext"), "10% left");
  out.textContent = "SHIPPED"; range.value = "0"; aria.sync(); assert.equal(range.getAttribute("aria-valuetext"), "SHIPPED");
  range.id = "unrelated"; aria.sync(); assert.equal(range.getAttribute("aria-valuetext"), null, "does not guess from unrelated labels");
});
test("setting search recognizes player terms and never changes target values", () => {
  const h = host(), api = h.run("js/ui/settings-search.js", "SettingsSearch");
  assert.ok(api.CATALOG.length >= 20);
  assert.equal(api.find("braking beep")[0].target, "pm-linebrakecue-sel");
  assert.equal(api.find("manual gears")[0].target, "pm-gears-sel");
  assert.equal(api.find("HUD size")[0].target, "pm-hudscale");
  assert.equal(api.find("nonsense").length, 0);
  const fold = h.el("details", "fold"), control = h.el("select", "pm-gears-sel", fold); control.value = "auto";
  assert.equal(api.reveal(control), true); assert.equal(fold.open, true); assert.equal(h.dom.document.activeElement, control); assert.equal(control.value, "auto");
});
test("settings result navigation and BACK restore the query and selected result focus", () => {
  const h = host(), index = h.el("div", "pm-settings-index"), page = h.el("section", "pm-panel-controls");
  const fold = h.el("details", "", page), target = h.el("select", "pm-gears-sel", fold); target.value = "auto";
  const api = h.run("js/ui/settings-search.js", "SettingsSearch"), calls = [];
  const ui = api.create({ host: index, show(id, focus, after) { calls.push(id); index.hidden = true; page.hidden = false; assert.equal(after(), true); } });
  ui.input.value = "manual gears"; ui.input.oninput();
  const button = index.querySelector("button"); button.focus(); button.onclick();
  assert.deepEqual(calls, ["controls"]); assert.equal(h.dom.document.activeElement, target); assert.equal(target.value, "auto");
  index.hidden = false; page.hidden = true; assert.equal(ui.restore(), true); assert.equal(h.dom.document.activeElement, button); assert.equal(ui.input.value, "manual gears");
});
test("race transcript includes delivered race/count cards only, bounds20 and clears a session", () => {
  const h = host(), api = h.run("js/ui/race-message-history.js", "RaceMessageHistory"), G = { state: "menu", raceT: 12.3, player: { lap: 2 } }, history = api.create(G);
  assert.equal(history.delivered("Copied"), false); G.state = "race";
  for (let i = 0; i < 25; i++) history.delivered("Message " + i, { kind: "pit", who: "Engineer" });
  assert.equal(history.rows().length, 20); assert.equal(history.rows()[0].text, "Message 5"); assert.equal(history.rows()[19].time, 12.3); assert.equal(history.rows()[19].lap, 2);
  const copy = history.rows(); copy.length = 0; assert.equal(history.rows().length, 20);
  history.clear(); assert.equal(history.rows().length, 0); G.state = "count"; assert.equal(history.delivered("Lights soon"), true);
});
test("controller profile UI resets only through Input and refreshes via its device event", async () => {
  const h = host(), panel = h.el("section", "controls"); let profile = { label: "Wheel", saved: true }, resets = 0;
  const input = { controllerProfile: () => profile, resetControllerProfile: () => { resets++; profile.saved = false; } };
  const api = h.run("js/ui/controller-profile-controls.js", "ControllerProfileControls"), ui = api.create({ host: panel, input });
  panel.querySelector("button").onclick(); assert.equal(resets, 1); assert.match(panel.querySelector("p").textContent, /defaults/);
  profile = { label: "Gamepad", saved: true }; h.events.get("apexcontrollerprofilechange")[0](); await new Promise((r) => setTimeout(r, 5)); assert.match(panel.querySelector("p").textContent, /Gamepad/); ui.dispose();
});
test("SettingsNav keeps a search-result target focus and BACK restores the chosen result", () => {
  const h = host(), settings = h.el("section", "pmsettings"), body = h.el("div", "pm-settings-body", settings), index = h.el("div", "pm-settings-index", body);
  h.el("h2", "dlg-settings", settings);
  const controls = h.el("section", "pm-panel-controls", body), fold = h.el("details", "", controls), target = h.el("select", "pm-gears-sel", fold);
  target.value = "auto";
  h.run("js/ui/settings-search.js", "SettingsSearch"); const nav = h.run("js/ui/settings-tabs.js", "SettingsNav").create(null, () => {});
  const input = index.querySelector("input"); input.value = "manual gears"; input.oninput(); const result = index.querySelector("button"); result.focus(); result.onclick();
  assert.equal(h.dom.document.activeElement, target); assert.equal(fold.open, true); assert.equal(target.value, "auto"); assert.equal(index.hidden, true);
  nav.back(); assert.equal(index.hidden, false); assert.equal(h.dom.document.activeElement, result); assert.equal(input.value, "manual gears");
});
test("quiet card refreshes update one history card and preserve its actual initial race time", () => {
  const h = host(), api = h.run("js/ui/race-message-history.js", "RaceMessageHistory"), G = { state: "race", raceT: 52.3, player: { lap: 3 } }, history = api.create(G);
  assert.equal(history.delivered("Orphan refresh", { kind: "race", quiet: true }), false);
  history.delivered("PIT STOP 2.2s", { kind: "race", who: "Engineer" });
  for (let i = 0; i < 100; i++) { G.raceT += .02; history.delivered("PIT STOP " + i, { kind: "race", who: "Engineer", quiet: true }); }
  assert.equal(history.rows().length, 1); assert.equal(history.rows()[0].text, "PIT STOP 99"); assert.equal(history.rows()[0].time, 52.3);
  assert.equal(history.delivered("Wrong speaker", { kind: "race", who: "Race control", quiet: true }), false);
  history.delivered("GO GO GO", { kind: "race", who: "Engineer" }); assert.equal(history.rows().length, 2);
});
test("SettingsNav page lifecycle fires after lazy audio settles for programmatic routes without selection sounds", async () => {
  const h = host(), settings = h.el("section", "pmsettings"), index = h.el("div", "pm-settings-index", settings), panel = h.el("section", "audioset", settings);
  h.el("h2", "dlg-settings", settings); h.el("section", "pm-panel-controls", settings);
  let complete, sounds = 0; const entered = [];
  h.sb.GameAudio = { _stub: true }; h.sb.AudioPanel = { _ensure: () => new Promise((resolve) => { complete = resolve; }) };
  const api = h.run("js/ui/settings-tabs.js", "SettingsNav"), nav = api.create(null, () => sounds++);
  api.onEnter((page) => { entered.push(page); if (page === "audio") assert.equal(panel.hidden, false); });
  nav.show("audio", true); assert.deepEqual(entered, []); h.sb.GameAudio._stub = false; complete(true); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(entered, ["audio"]); assert.equal(sounds, 0); nav.show("controls", true); assert.deepEqual(entered, ["audio", "controls"]); assert.equal(sounds, 0);
});
test("search rejects a CSS-hidden desktop steering control and does not claim focus succeeded", () => {
  const h = host(), api = h.run("js/ui/settings-search.js", "SettingsSearch"), panel = h.el("section", "pm-panel-controls"), target = h.el("select", "pm-steer-sel", panel), current = h.el("button", "current");
  current.focus(); target.checkVisibility = () => false;
  let focusCalls = 0; target.focus = () => { focusCalls++; };
  assert.equal(api.reveal(target), false); assert.equal(focusCalls, 0); assert.equal(h.dom.document.activeElement, current);
  target.checkVisibility = () => true; target.getClientRects = () => [];
  assert.equal(api.reveal(target), false); assert.equal(focusCalls, 0);
  target.getClientRects = () => [{}];
  assert.equal(api.reveal(target), false, "a platform focus refusal must not count as focused"); assert.equal(focusCalls, 1); assert.equal(h.dom.document.activeElement, current);
});
test("unavailable search feedback is visible on the destination page and clears on BACK", () => {
  const h = host(), index = h.el("section", "pm-settings-index"), panel = h.el("section", "pm-panel-controls"), target = h.el("select", "pm-steer-sel", panel);
  target.checkVisibility = () => false;
  const api = h.run("js/ui/settings-search.js", "SettingsSearch"), leaves = [];
  const ui = api.create({ host: index, onLeave: (fn) => leaves.push(fn), show(_page, _focus, after) { index.hidden = true; panel.hidden = false; assert.equal(after(), false); } });
  ui.input.value = "steering input"; ui.input.oninput(); index.querySelector("button").onclick();
  const visibleStatus = panel.querySelector('[role="status"]'); assert.ok(visibleStatus); assert.match(visibleStatus.textContent, /Steering input is unavailable/); assert.equal(visibleStatus.closest("[hidden]"), null);
  leaves[0](); assert.equal(panel.querySelector('[role="status"]'), null); index.hidden = false; ui.restore(); assert.equal(ui.input.value, "steering input");
});
