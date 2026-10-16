/* Actual player-tool modules in a small DOM/VM; no canvas or browser. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { gameSource } from "../helpers/game-source.mjs";
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
function presets() {
  const h = host(), state = storage(); h.sb.GameStore = { store: state.store }; h.sb.PhysicsConsts = { BB_REF: 0.56 };
  const tune = h.run("js/garage/setup-tune.js", "SetupTune"), api = h.run("js/garage/setup-presets.js", "SetupPresets");
  return { ...h, ...state, tune, api };
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
test("named presets are per team, bounded, full validated tunes, and non-applying on save", () => {
  const h = presets(), original = h.tune.get("mercedes");
  const result = h.api.save(h.store, "mercedes", "Monza dry", { ...original, arbF: 9 }, "monza");
  assert.equal(result.ok, true); assert.equal(h.tune.get("mercedes").arbF, original.arbF); assert.equal(h.api.list(h.store, "ferrari").length, 0);
  assert.equal(h.api.save(h.store, "mercedes", "MONZA DRY", original).reason, "name");
  for (let i = 1; i < 12; i++) assert.equal(h.api.save(h.store, "mercedes", "Setup " + i, original).ok, true);
  assert.equal(h.api.save(h.store, "mercedes", "overflow", original).reason, "full");
  assert.equal(h.api.save(h.store, "ferrari", "bad", { ...original, arbF: 999 }).reason, "invalid");
  assert.equal(h.api.save(h.store, "ferrari", "bad", { ...original, brakeBias: NaN }).reason, "invalid");
});
test("preset confirmation refuses newer local or foreign setup/library changes", () => {
  const h = presets(), current = h.tune.get("mercedes"), row = h.api.save(h.store, "mercedes", "Quick", { ...current, arbF: 9 }).row;
  const p = h.api.preview(h.store, "mercedes", row.id); assert.equal(p.changes.length, 1);
  h.tune.set("mercedes", { arbR: 8 }); assert.equal(h.api.apply(h.store, "mercedes", p).reason, "changed");
  const fresh = h.api.preview(h.store, "mercedes", row.id); h.api.save(h.store, "mercedes", "Other", current);
  assert.equal(h.api.apply(h.store, "mercedes", fresh).reason, "changed");
  const latest = h.api.preview(h.store, "mercedes", row.id); h.changes.length = 0;
  assert.equal(h.api.apply(h.store, "mercedes", latest).ok, true); assert.deepEqual(h.changes, ["setup.mercedes"]); assert.equal(h.tune.get("mercedes").arbF, 9);
});
test("preset delete leaves fitted setup unchanged and unsupported libraries untouched", () => {
  const h = presets(), current = h.tune.get("mercedes"), row = h.api.save(h.store, "mercedes", "Test", current).row;
  h.api.remove(h.store, "mercedes", row.id); assert.equal(h.api.list(h.store, "mercedes").length, 0); assert.deepEqual({ ...h.tune.get("mercedes") }, { ...current });
  h.store.write("setupPresets.mercedes", { v: 2, items: [{ unknown: true }] }); const before = h.store.get("setupPresets.mercedes");
  assert.equal(h.api.save(h.store, "mercedes", "Other", current).reason, "incompatible"); assert.deepEqual(h.store.get("setupPresets.mercedes"), before);
});
test("preset writes disclose session-only durability rather than claiming durable storage", () => {
  const h = presets(); h.store.durable = false;
  const result = h.api.save(h.store, "mercedes", "Quota", h.tune.get("mercedes")); assert.equal(result.ok, true); assert.equal(result.durable, false);
});
test("camera-only surface inspection captures once, switches immediately and restores the exact snapshot", () => {
  const h = host(), api = h.run("js/garage/surface-inspection.js", "GarageSurfaceInspection"), before = { az: 2, pan: [1, 2, 3], spin: true }, shots = [], restores = [];
  let captures = 0;
  const inspection = api.create({ capture: () => { captures++; return before; }, show: (s) => shots.push(s), restore: (s) => restores.push(s), eligible: () => true });
  assert.equal(inspection.inspect("cover"), true); assert.equal(inspection.inspect("nose"), true); assert.equal(captures, 1); assert.deepEqual(shots, ["hero", "front"]);
  assert.equal(inspection.end(), true); assert.equal(restores[0], before); assert.equal(inspection.end(), false); assert.equal(inspection.inspect("unknown"), false);
  assert.equal(api.create({ eligible: () => false }).inspect("cover"), false);
});
test("race transcript includes delivered race/count cards only, bounds20 and clears a session", () => {
  const h = host(), api = h.run("js/ui/race-message-history.js", "RaceMessageHistory"), G = { state: "menu", raceT: 12.3, player: { lap: 2 } }, history = api.create(G);
  assert.equal(history.delivered("Copied"), false); G.state = "race";
  for (let i = 0; i < 25; i++) history.delivered("Message " + i, { kind: "pit", who: "Engineer" });
  assert.equal(history.rows().length, 20); assert.equal(history.rows()[0].text, "Message 5"); assert.equal(history.rows()[19].time, 12.3); assert.equal(history.rows()[19].lap, 2);
  const copy = history.rows(); copy.length = 0; assert.equal(history.rows().length, 20);
  history.clear(); assert.equal(history.rows().length, 0); G.state = "count"; assert.equal(history.delivered("Lights soon"), true);
});
test("race mix UI reports a refused sample and STOP cancels an active one", async () => {
  const h = host(), panel = h.el("section", "audioset"); let playing = false, stops = 0, enabled = false;
  h.sb.RaceMixAudition = { active: () => playing, start: () => { playing = enabled; return enabled; }, stop: () => { stops++; playing = false; } };
  const api = h.run("js/ui/race-mix-controls.js", "RaceMixControls"), G = { soundOn: true, store: {} }, ui = api.create(G, panel), buttons = panel.querySelectorAll("button");
  buttons[0].onclick(); await Promise.resolve(); assert.match(panel.querySelector("p").textContent, /unavailable/);
  enabled = true; buttons[0].onclick(); await Promise.resolve(); assert.equal(playing, true); buttons[1].onclick(); assert.equal(playing, false);
  G.soundOn = false; ui.refresh(); assert.equal(buttons[0].disabled, true); assert.ok(stops > 0);
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
test("confirmed deletion refuses a library changed by another tab", () => {
  const h = presets(), row = h.api.save(h.store, "mercedes", "One", h.tune.get("mercedes")).row;
  const revision = h.store.keyRevision("setupPresets.mercedes"); h.api.save(h.store, "mercedes", "Two", h.tune.get("mercedes"));
  assert.equal(h.api.remove(h.store, "mercedes", row.id, revision).reason, "changed"); assert.equal(h.api.list(h.store, "mercedes").length, 2);
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

test("preset preview reveals proposed differences before confirmation and retains keyboard focus without applying", () => {
  const h = presets(), current = h.tune.get("mercedes"), preset = h.api.save(h.store, "mercedes", "Phone preview", { ...current, arbF: 9, brakeBias: 58 }).row;
  const container = h.el("section", "preset-fixture"), ui = h.api.mount(container, { teamId: "mercedes", store: h.store });
  const pick = ui.section.querySelector("select"), differences = ui.section.querySelector("ul"), actions = ui.section.querySelector(".player-tool-row"), status = ui.section.querySelector('[role="status"]');
  const apply = actions.querySelectorAll("button").find((b) => b.textContent === "PREVIEW APPLY");
  pick.value = preset.id; pick.onchange(); apply.focus();
  const scrolls = []; differences.scrollIntoView = (options) => scrolls.push(options); h.changes.length = 0;
  apply.onclick();
  assert.ok(ui.section.children.indexOf(differences) < ui.section.children.indexOf(actions), "the proposed values precede CONFIRM APPLY in document order");
  assert.ok(ui.section.children.indexOf(status) < ui.section.children.indexOf(actions), "the confirmation explanation is before the action too");
  assert.equal(differences.children.length, 2); assert.match(differences.children[0].textContent, /FRONT ANTI-ROLL BAR:.*→ 9/);
  assert.equal(scrolls.length, 1); assert.equal(scrolls[0].block, "start"); assert.equal(h.dom.document.activeElement, apply);
  assert.equal(apply.textContent, "CONFIRM APPLY"); assert.deepEqual(h.changes, []); assert.equal(h.tune.get("mercedes").arbF, current.arbF);
  pick.onchange(); delete differences.scrollIntoView;
  assert.doesNotThrow(() => apply.onclick(), "non-layout fixtures may omit the optional scroll API"); assert.deepEqual(h.changes, []);
});
test("inspection outlines are steady, replace the previous surface and expire with exact camera restoration", () => {
  const h = host(), api = h.run("js/garage/surface-inspection.js", "GarageSurfaceInspection"), jobs = new Map(), highlights = [], restored = [], camera = { az: 2, el: .3, dist: 7, pan: [1, 2, 3], spin: false };
  let serial = 0, captures = 0, changes = 0;
  const inspection = api.create({ capture: () => { captures++; return camera; }, show() {}, restore: (s) => restored.push(s),
    highlight: (field) => { highlights.push(field); return field === "saddleTint" || field === "sideTint"; },
    schedule: (fn, ms) => { assert.equal(ms, 5000); jobs.set(++serial, fn); return serial; }, cancel: (id) => jobs.delete(id) });
  inspection.onChange(() => changes++);
  inspection.inspect("saddleTint"); assert.equal(inspection.outlined(), true); const oldTimeout = jobs.get(serial);
  inspection.inspect("sideTint"); assert.equal(captures, 1); assert.deepEqual(highlights, [null, "saddleTint", null, "sideTint"]); assert.equal(jobs.size, 1);
  oldTimeout(); assert.equal(inspection.field(), "sideTint", "a stale cancelled timeout cannot end the next surface");
  jobs.get(serial)(); assert.equal(inspection.field(), null); assert.equal(inspection.outlined(), false); assert.equal(highlights.at(-1), null); assert.equal(restored[0], camera); assert.equal(restored.length, 1); assert.equal(jobs.size, 0); assert.equal(changes, 3);
  inspection.inspect("cover"); assert.equal(inspection.outlined(), false, "camera-only applicability never pretends an outline exists"); inspection.end(); assert.equal(highlights.at(-1), null);
});
test("inspection timeout updates semantic controls and disposal stops detached editor updates", () => {
  const h = host(), api = h.run("js/garage/surface-inspection.js", "GarageSurfaceInspection"); let timeout;
  api.bind({ capture: () => ({}), show() {}, restore() {}, highlight: (field) => field === "saddleTint", schedule: (fn) => { timeout = fn; return 1; }, cancel() {} });
  const wrap = h.el("section", "inspect"), row = h.el("label", "surface", wrap), controls = api.controls(wrap); controls.row(row, "SADDLE", "saddleTint");
  const button = row.querySelector("button"); button.onclick(); assert.equal(button.getAttribute("aria-pressed"), "true"); assert.match(wrap.querySelector('p').textContent, /affected paint region outlined for five seconds/);
  timeout(); assert.equal(button.getAttribute("aria-pressed"), "false"); assert.equal(wrap.querySelectorAll("button").find((b) => b.textContent === "RESTORE INSPECTION CAMERA").disabled, true); assert.match(wrap.querySelector('p').textContent, /previous camera restored/);
  controls.dispose(); api.inspect("saddleTint"); assert.equal(button.getAttribute("aria-pressed"), "false"); api.end();
});
test("garage contour borrows the current decal mesh adapter for procedural and loaded-GLB body modes", () => {
  const h = host(), game = gameSource(), camera = read("js/garage/setup-camera.js");
  const callback = game.match(/previewDecalMesh:\s*(\(team\)\s*=>\s*\{[\s\S]*?\})\s*\}\);/);
  assert.ok(callback, "the actual SetupCamera dependency injects its mesh getter");
  const team = { id: "mercedes" }, parts = { body: "works" }, liv = { finShape: "none", spineHeight: "dorsal" }, procMesh = {}, glbMesh = {}, model = {}, calls = [], draws = [];
  h.sb.carDraw = { modelBuf: null }; h.sb.teamDecalState = () => ({ val: 2, parts }); h.sb.resolveLivery = () => liv;
  h.sb.getCarDecalMesh = (...args) => { calls.push(args); return args[2] ? glbMesh : procMesh; };
  const getter = vm.runInContext("(" + callback[1] + ")", h.sb);
  h.sb.deps = { previewDecalMesh: getter }; h.sb.team = team; h.sb.arrivalCar = model;
  h.sb.surfaceOutline = { draw: (mesh, matrix) => draws.push({ mesh, matrix }) }; h.sb.GarageSurfaceInspection = { field: () => "sideTint" };
  const start = camera.indexOf('  if (surfaceOutline && typeof GarageSurfaceInspection'), end = camera.indexOf('  // AFTER the car:', start);
  const draw = () => vm.runInContext(camera.slice(start, end), h.sb);
  draw(); assert.equal(draws[0].mesh, procMesh); assert.equal(draws[0].matrix, model);
  h.sb.carDraw.modelBuf = { loaded: true }; draw(); assert.equal(draws[1].mesh, glbMesh, "a runtime GLB switch uses the existing pass's legacy anchors");
  assert.deepEqual(calls.map((args) => args.slice(2)), [[false, "mercedes", "none", "dorsal"], [true, "mercedes", "none", "dorsal"]]);
  assert.equal(calls[1][0], 2); assert.equal(calls[1][1], parts);
  delete h.sb.deps.previewDecalMesh; draw(); assert.equal(draws.length, 2, "no independent hardcoded mesh fallback");
});
