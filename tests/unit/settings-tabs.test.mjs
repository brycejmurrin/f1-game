/* settings-tabs.test.mjs — SettingsNav's lazy MUSIC & SOUND gate + onLeave.
 * M1 (round 2): AudioPanel._ensure() resolving false (UPDATE READY / offline)
 * used to re-enter show() -> _ensure() forever and never reveal #audioset.
 * Ship #1320 covered the same fail-loop with a boolean `ensured` flag; we keep
 * the richer offline-note path and still pin onLeave from that suite. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

const source = fs.readFileSync(new URL("../../js/ui/settings-tabs.js", import.meta.url), "utf8").replace(/^const SettingsNav/m, "var SettingsNav");
const tick = () => new Promise((r) => setTimeout(r, 0));

function boot({ ensure, stub = true, onSelect = () => {} }) {
  const dom = makeDom();
  const audio = dom.byId("audioset"); audio.hidden = true;
  dom.byId("pm-audio"); dom.byId("pm-settings-index"); dom.byId("dlg-settings");
  const calls = { ensure: 0 }, said = [];
  const GameAudio = { _stub: stub };
  const ctx = vm.createContext({ document: dom.document, window: {}, Log: { info() {}, warn() {} }, GameAudio,
    LiveRegion: { say: (text, kind) => said.push([text, kind]) },
    AudioPanel: { _ensure: () => { calls.ensure++; return ensure(GameAudio); } } });
  vm.runInContext(source, ctx);
  const nav = ctx.SettingsNav.create(null, onSelect);
  return { nav, dom, audio, calls, ctx, said };
}

test("MUSIC & SOUND: a bundle that fails to load is asked once per click and the page still reveals", async () => {
  const { dom, audio, calls } = boot({ ensure: () => Promise.resolve(false) });
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 1, "no retry loop");
  assert.equal(audio.hidden, false, "stub page revealed");
  const note = dom.byId("audioset-offline");
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /AUDIO ENGINE DID NOT LOAD/);
  // A second tap asks again exactly once more.
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 2);
});

// uihunt4-flows-1030 #2: a role=status note filled in the same step it is inserted is
// not announced, so the note is spoken through LiveRegion (the open modal's twin) once per showing.
test("MUSIC & SOUND: the offline note is spoken once when it appears, not on every repeat", async () => {
  const { nav, dom, said } = boot({ ensure: () => Promise.resolve(false) });
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(said.length, 1);
  assert.deepEqual(said[0], ["AUDIO ENGINE DID NOT LOAD — CHECK YOUR CONNECTION OR RELOAD", "hud"]);
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(said.length, 1, "a note already showing is not re-spoken");
  dom.byId("audioset-offline").hidden = true;
  nav.show("audio", false);
  await tick(); await tick(); await tick();
  assert.equal(said.length, 2, "a note shown again after hiding is spoken again");
});

test("MUSIC & SOUND: a rejecting _ensure behaves like false, programmatic show() included", async () => {
  const { nav, audio, calls } = boot({ ensure: () => Promise.reject(new Error("net")) });
  nav.show("audio", false);
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 1);
  assert.equal(audio.hidden, false);
});

test("MUSIC & SOUND: a bundle that loads reveals the wired page without the offline note", async () => {
  const sel = [];
  const { dom, audio, calls } = boot({ ensure: (ga) => { ga._stub = false; return Promise.resolve(true); }, onSelect: (id) => sel.push(id) });
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 1);
  assert.equal(audio.hidden, false);
  assert.deepEqual(sel, ["audio"]);
  assert.notEqual(dom.byId("audioset-offline").hidden, false);
});

test("onLeave(fn) is called with the page id when back() / show() hides a page", () => {
  const { nav, ctx } = boot({ ensure: () => Promise.resolve(true), stub: false });
  const left = [];
  ctx.SettingsNav.onLeave((id) => left.push(id));
  assert.deepEqual(left, [], "the initial show('home') leaves nothing");
  nav.show("controls", false);
  assert.deepEqual(left, [], "home is the index, not a page");
  nav.back();
  assert.deepEqual(left, ["controls"]);
  nav.show("driving", false);
  nav.show("display", false);
  assert.deepEqual(left, ["controls", "driving"]);
  nav.show("display", false);
  assert.deepEqual(left, ["controls", "driving"], "re-showing the same page leaves nothing");
});

test("settings title acts as a breadcrumb on the page stack", () => {
  const h = boot({ ensure: () => Promise.resolve(true), stub: false });
  h.nav.show("advanced", false);
  assert.equal(h.dom.byId("dlg-settings").textContent, "SETTINGS › CONTROLS › ADVANCED INPUT & HANDLING");
  h.nav.back();
  assert.equal(h.dom.byId("dlg-settings").textContent, "SETTINGS");
});


test("late audio completion cannot supersede newer navigation or a closed session", async () => {
  for (const next of [h => h.nav.show("display", true), h => h.nav.back(), h => h.nav.showCurrent(), h => h.ctx.SettingsNav.invalidate(), h => { h.dom.byId("pmsettings").hidden = true; }, h => { h.dom.byId("pmsettings").hidden = true; h.nav.showCurrent(); h.dom.byId("pmsettings").hidden = false; }]) {
    let resolve; const selections = [];
    const h = boot({ ensure: () => new Promise(r => { resolve = r; }), onSelect: id => selections.push(id) });
    h.dom.byId("pm-audio").onclick(); next(h);
    const title = h.dom.byId("dlg-settings").textContent;
    resolve(true); await tick(); await tick();
    assert.equal(h.dom.byId("dlg-settings").textContent, title);
    assert.equal(h.audio.hidden, true); assert.deepEqual(selections, []);
  }
});


test("session tools return directly to their caller and close invalidates page work", () => {
  const { nav, ctx, dom } = boot({ ensure: () => Promise.resolve(true) });
  const leaves = [];
  ctx.SettingsNav.onLeave(id => leaves.push(id));
  nav.showDirect("practice", true);
  assert.equal(ctx.SettingsNav.current(), "practice");
  assert.equal(dom.byId("pm-panel-practice").hidden, false);
  assert.equal(nav.back(), true);
  assert.deepEqual(leaves, ["practice"]);
  nav.show("files", false);
  nav.invalidate();
  assert.deepEqual(leaves, ["practice", "files"]);
  assert.equal(nav.current(), "home");
});

test("new destinations reveal only their own panel and normal Back returns home", () => {
  const { nav, dom } = boot({ ensure: () => Promise.resolve(true) });
  for (const id of ["graphics", "visual", "progress", "strategy", "review"]) {
    nav.show(id, false);
    assert.equal(dom.byId("pm-panel-" + id).hidden, false);
    assert.equal(dom.byId("pm-panel-display").hidden, true);
    assert.equal(nav.back(), false);
    assert.equal(nav.current(), "home");
  }
});


test("Advanced input returns to Controls and restores its launcher's focus and scroll", () => {
  const { nav, dom } = boot({ ensure: () => Promise.resolve(true) });
  const controls = dom.byId("pm-panel-controls"), advanced = dom.byId("pm-advanced");
  controls.appendChild(advanced);
  nav.show("controls", false);
  dom.byId("pm-settings-body").scrollTop = 120;
  advanced.onclick();
  assert.equal(nav.current(), "advanced");
  assert.equal(nav.back(), false);
  assert.equal(nav.current(), "controls");
  assert.equal(dom.document.activeElement, advanced);
  assert.equal(dom.byId("pm-settings-body").scrollTop, 120);
  assert.equal(nav.back(), false);
  assert.equal(nav.current(), "home");
});

test("frozen route metadata owns titles, panels, doors and default hierarchy", () => {
  const { ctx, dom, nav } = boot({ ensure: () => Promise.resolve(true) });
  const api = ctx.SettingsNav;
  assert.ok(Object.isFrozen(api.routes));
  assert.equal(api.routes.advanced.parent, "controls");
  assert.equal(api.routes.strategy.scope, "session");
  assert.equal(api.routes.controls.scope, "preferences");
  assert.equal(api.panel("unknown"), null);
  assert.equal(api.panel("__proto__"), null);
  assert.equal(api.breadcrumb("unknown"), "SETTINGS");
  assert.equal(api.breadcrumb("display"), "SETTINGS › HUD & CAMERA");
  assert.equal(api.breadcrumb("strategy"), "SETTINGS › PIT STRATEGY");
  for (const [id, route] of Object.entries(api.routes)) {
    assert.ok(Object.isFrozen(route));
    assert.equal(api.panel(id), route.panel());
    if (route.parent) assert.ok(api.routes[route.parent]);
    if (id === "audio") continue;
    nav.show(id);
    assert.equal(dom.byId("dlg-settings").textContent, api.breadcrumb(id));
    if (route.door) assert.equal(typeof route.door().onclick, "function");
  }
});

test("a cross-link returns through nested pages with each launcher's focus and scroll", () => {
  const selected = [], h = boot({ ensure: () => Promise.resolve(true), onSelect: id => selected.push(id) });
  const controls = h.dom.byId("pm-panel-controls"), advanced = h.dom.byId("advanced"), door = h.dom.byId("pm-advanced"), body = h.dom.byId("pm-settings-body");
  controls.appendChild(door);
  h.dom.byId("pm-open-controls").focus(); h.dom.byId("pm-open-controls").onclick();
  body.scrollTop = 120; door.onclick();
  const jump = h.dom.makeElement("button", "pm-tiltdeg-jump"); advanced.appendChild(jump);
  jump.setAttribute("data-settings-jump", "controls"); jump.setAttribute("data-jump-target", "pm-tiltsimple");
  body.scrollTop = 87; h.dom.dispatch(jump, { type: "click", bubbles: true });
  assert.equal(h.nav.current(), "controls");
  assert.deepEqual(selected, ["controls", "advanced", "controls"]);
  h.nav.back(); assert.equal(h.nav.current(), "advanced"); assert.equal(h.dom.document.activeElement, jump); assert.equal(body.scrollTop, 87);
  h.nav.back(); assert.equal(h.nav.current(), "controls"); assert.equal(h.dom.document.activeElement, door); assert.equal(body.scrollTop, 120);
  h.nav.back(); assert.equal(h.nav.current(), "home"); assert.equal(h.dom.document.activeElement, h.dom.byId("pm-open-controls"));
});

test("a runtime-mounted cross-link keeps its origin even when its child is clicked", () => {
  const h = boot({ ensure: () => Promise.resolve(true) }), body = h.dom.byId("pm-settings-body"), origin = h.dom.byId("pm-open-appearance");
  origin.focus(); origin.onclick();
  const jump = h.dom.makeElement("button"), label = h.dom.makeElement("span");
  jump.setAttribute("data-settings-jump", "a11y"); jump.setAttribute("data-jump-target", "pm-motion-sel"); jump.appendChild(label);
  h.dom.byId("pm-panel-appearance").appendChild(jump); body.scrollTop = 300;
  h.dom.dispatch(label, { type: "click", bubbles: true });
  assert.equal(h.nav.current(), "a11y");
  h.nav.back(); assert.equal(h.nav.current(), "appearance"); assert.equal(h.dom.document.activeElement, jump); assert.equal(body.scrollTop, 300);
  h.nav.back(); assert.equal(h.nav.current(), "home"); assert.equal(h.dom.document.activeElement, origin);
});


test("Back reveal follows reflow until interaction, navigation, focus change or close", () => {
  for (const action of ["stay", "interact", "navigate", "focus", "close"]) {
    const h = boot({ ensure: () => Promise.resolve(true), stub: false });
    let resize, disconnected = false; const listeners = new Map();
    h.ctx.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() { disconnected = true; } };
    h.ctx.window.addEventListener = (type, fn) => listeners.set(type, fn);
    h.ctx.window.removeEventListener = type => listeners.delete(type);
    const door = h.dom.byId("pm-advanced"); let scrolls = 0;
    door.scrollIntoView = () => scrolls++;
    h.dom.byId("pm-open-controls").onclick(); door.onclick(); h.nav.back();
    assert.equal(h.dom.document.activeElement, door);
    resize(); assert.equal(scrolls, 1, "initial reflow reveals the launcher");
    if (action === "interact") listeners.get("pointerdown")();
    if (action === "navigate") h.nav.show("display", true);
    if (action === "focus") h.dom.byId("pm-open-driving").focus();
    if (action === "close") h.nav.invalidate();
    if (!disconnected) resize();
    assert.equal(scrolls, action === "stay" ? 2 : 1, action);
    assert.equal(disconnected, action !== "stay", action);
    assert.equal(listeners.size, action === "stay" ? 4 : 0, action);
  }
});
