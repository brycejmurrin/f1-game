/* settings-tabs.test.mjs — SettingsNav's lazy MUSIC & SOUND gate + onLeave.
 * M1 (round 2): AudioPanel._ensure() resolving false (UPDATE READY / offline)
 * used to re-enter show() -> _ensure() forever and never reveal #audioset.
 * Ship #1320 covered the same fail-loop with a boolean `ensured` flag; we keep
 * the richer offline-note path and still pin onLeave from that suite. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const source = fs.readFileSync(new URL("../../js/ui/settings-tabs.js", import.meta.url), "utf8").replace(/^const SettingsNav/m, "var SettingsNav");
const tick = () => new Promise((r) => setTimeout(r, 0));

function boot({ ensure, stub = true, onSelect = () => {}, prepare = () => {} }) {
  const dom = makeDom();
  const audio = dom.byId("audioset"); audio.hidden = true;
  dom.byId("pm-audio"); dom.byId("pm-settings-index"); dom.byId("dlg-settings");
  const calls = { ensure: 0 }, said = [];
  const GameAudio = { _stub: stub };
  const ctx = vm.createContext({ document: dom.document, window: {}, Log: { info() {}, warn() {} }, GameAudio,
    LiveRegion: { say: (text, kind) => said.push([text, kind]) },
    AudioPanel: { _ensure: () => { calls.ensure++; return ensure(GameAudio); } } });
  vm.runInContext(source, ctx);
  prepare(dom);
  const nav = ctx.SettingsNav.create(null, onSelect);
  return { nav, dom, audio, calls, ctx, said };
}

test("Controls loads only its touch form, mounts before search focuses it, and retries after an offline visit", async () => {
  const { nav, dom, ctx } = boot({ ensure: () => true });
  const loads = [], visits = [];
  ctx.Input = { setPedalSlide() {} };
  ctx.ScriptLoader = { create: () => ({ load: async files => {
    loads.push(...files);
    if (loads.length === 1) return false;
    ctx.TouchButtonSettings = { mountControls: () => visits.push("mounted") };
    return true;
  } }) };
  nav.show("driving", false);
  assert.deepEqual(loads, []);
  nav.show("controls", false);
  await tick();
  assert.equal(nav.current(), "controls");
  assert.equal(dom.byId("pm-touch-offline").hidden, false);
  nav.show("home", false);
  ctx.SettingsNav.show("controls", false, () => { visits.push("search target"); });
  await tick();
  assert.deepEqual(visits, ["mounted", "search target"]);
  assert.equal(dom.byId("pm-touch-offline").hidden, true);
  nav.show("home", false);
  nav.show("controls", false);
  assert.deepEqual(loads, ["js/ui/touch-button-settings.js", "js/ui/touch-button-settings.js"]);
  assert.equal(visits.length, 3);
});

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
  assert.equal(audio.querySelector("#audioset-offline"), null);
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

test("each settings route exposes independent controls and retains their storage IDs on a companion page", () => {
  const { ctx } = boot({ ensure: () => true });
  const registrySource = fs.readFileSync(new URL("../../js/ui/screen-regions.js", import.meta.url), "utf8");
  ctx.document.readyState = "loading";
  vm.runInContext(registrySource, ctx, { filename: absSrc("js/ui/screen-regions.js") });
  const companion = { window: {} };
  vm.runInNewContext(registrySource, companion, { filename: absSrc("js/ui/screen-regions.js") });
  for (const [page, route] of Object.entries(ctx.SettingsNav.routes)) {
    if (page === "home") continue;
    const key = "pm-panel-" + page;
    const main = ctx.window.ScreenRegions[key];
    const other = companion.window.ScreenRegions[key];
    assert.equal(main.root, "#" + route.panel().id);
    assert.equal(main.label, "Settings › " + route.title);
    assert.ok(Object.keys(main.regions).length > 1, page + " needs a target within the page");
    assert.equal(other.root, main.root);
    assert.deepEqual(Object.keys(other.regions), Object.keys(main.regions));
  }
});

test("the shipped Settings index groups every door under a task heading", () => {
  const shell = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const doors = /<nav id="pm-settings-index"[^>]*>([\s\S]*?)<\/nav>/.exec(shell)[1];
  const { dom } = boot({ ensure: () => true, prepare(dom) {
    const index = dom.byId("pm-settings-index");
    for (const [, attributes] of doors.matchAll(/<button\b([^>]+)>/g)) {
      const id = /\bid="([^"]+)"/.exec(attributes)[1];
      const door = dom.makeElement("button", id);
      const category = /data-settings-category="([^"]+)"/.exec(attributes)?.[1];
      if (category) {
        door.dataset.settingsCategory = category;
        door.setAttribute("data-settings-category", category);
      }
      index.appendChild(door);
    }
  } });
  const groups = {};
  let current;
  for (const el of dom.byId("pm-settings-index").children) {
    if (el.tagName === "H3") current = groups[el.textContent] = [];
    else current.push(el.id);
  }
  assert.deepEqual(groups, {
    "Controls and driving": ["pm-open-controls", "pm-open-driving"],
    "Display and sound": ["pm-open-display", "pm-open-appearance", "pm-open-a11y", "pm-audio", "pm-open-graphics", "pm-open-visual"],
    "Player and data": ["pm-open-progress", "pm-open-files", "pm-open-credits"]
  });
});

test("the Settings footer keeps its Back action on every page", () => {
  const { ctx, dom, nav } = boot({ ensure: () => true, stub: false, prepare(dom) {
    const footer = dom.makeElement("div");
    dom.byId("pmsettings").appendChild(footer);
    footer.appendChild(dom.byId("pm-settings-close"));
  } });
  const back = dom.byId("pm-settings-close");
  for (const page of Object.keys(ctx.SettingsNav.routes)) {
    nav.show(page);
    assert.deepEqual(back.parentElement.children, [back]);
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

// hunt2 ui-menus: missing #pm-settings-body during a restore reflow must not
// throw (that left the four window capture listeners hanging).
test("Back reveal survives a missing pm-settings-body without leaking window listeners", () => {
  const h = boot({ ensure: () => Promise.resolve(true), stub: false });
  let resize, disconnected = false; const listeners = new Map();
  h.ctx.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() { disconnected = true; } };
  h.ctx.window.addEventListener = (type, fn) => listeners.set(type, fn);
  h.ctx.window.removeEventListener = type => listeners.delete(type);
  const door = h.dom.byId("pm-advanced"); let scrolls = 0;
  door.scrollIntoView = () => scrolls++;
  h.dom.byId("pm-open-controls").onclick(); door.onclick(); h.nav.back();
  assert.equal(listeners.size, 4);
  const realGet = h.dom.document.getElementById.bind(h.dom.document);
  h.dom.document.getElementById = (id) => (id === "pm-settings-body" ? null : realGet(id));
  assert.doesNotThrow(() => resize());
  assert.equal(scrolls, 1, "scrollIntoView still runs after the null body guard");
  listeners.get("pointerdown")();
  assert.equal(disconnected, true);
  assert.equal(listeners.size, 0, "stopRestore still unhooks after a missing body");
});

// #4798 settings-lazy gate: row wiring queued at DCL runs on the first enter / pointerdown / keydown / idle, once, in order.
function lazyWorld(readyState) {
  const listeners = new Map(), idle = [];
  const document = {
    readyState,
    addEventListener(t, fn) { listeners.set(t, fn); },
    removeEventListener(t, fn) { if (listeners.get(t) === fn) listeners.delete(t); },
    getElementById: () => null,
  };
  const ctx = vm.createContext({ document, window: {}, Log: { info() {}, warn() {} },
    requestIdleCallback: (fn) => idle.push(fn), setTimeout });
  vm.runInContext(source, ctx);
  return { Nav: ctx.SettingsNav, listeners, idle };
}

test("SettingsNav.lazy: a complete document runs the initialiser at once", () => {
  const { Nav } = lazyWorld("complete");
  let ran = 0;
  Nav.lazy(() => { ran++; });
  assert.equal(ran, 1);
});

for (const trigger of ["pointerdown", "keydown", "idle", "flush"]) {
  test(`SettingsNav.lazy: queued while interactive, flushed once in order by ${trigger}`, () => {
    const { Nav, listeners, idle } = lazyWorld("interactive");
    const order = [];
    Nav.lazy(() => order.push("a"));
    Nav.lazy(() => { throw new Error("one bad row"); });
    Nav.lazy(() => order.push("b"));
    assert.deepEqual(order, [], "nothing runs in the DCL task");
    if (trigger === "idle") idle[0]();
    else if (trigger === "flush") Nav.flushLazy();
    else listeners.get(trigger)();
    assert.deepEqual(order, ["a", "b"], "a throwing initialiser does not stop the rest");
    assert.equal(listeners.has("pointerdown") || listeners.has("keydown"), false, "the capture listeners detach");
    Nav.flushLazy(); if (idle[0]) idle[0]();
    assert.deepEqual(order, ["a", "b"], "never twice");
    let late = 0;
    Nav.lazy(() => { late++; });
    Nav.flushLazy();
    assert.equal(late, 1, "a registration after the flush queues again and runs on the next trigger");
  });
}

test("SettingsNav.lazy: the first Settings page enter flushes before other enter handlers", () => {
  const src = fs.readFileSync(new URL("../../js/ui/settings-tabs.js", import.meta.url), "utf8");
  const first = src.indexOf("enterFns.push(");
  assert.ok(first > 0 && src.slice(first, first + 40).startsWith("enterFns.push(flushLazy)"), "flushLazy is the first enter subscriber");
});

test("SettingsNav.lazy: the audited Settings-only initialisers go through the gate (#4798)", () => {
  for (const f of ["js/camera/cockpit-finishes.js", "js/camera/feel.js", "js/ui/driving-line-opts.js", "js/ui/a11y-opts.js",
    "js/ui/post-fx-opts.js", "js/track/build-client.js", "js/xr/xr-opts.js"]) {
    const src = fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    assert.match(src, /SettingsNav\.lazy\(initUI\); else initUI\(\);/, f + " wires its rows through SettingsNav.lazy");
  }
});

test("Graphics details can be retried after a failed load without changing the player's new page", async () => {
  const { nav, dom, ctx } = boot({ ensure: () => true });
  const host = dom.byId("pm-panel-graphics"), loads = [];
  ctx.GLX = {};
  ctx.ScriptLoader = { create: () => ({ load: () => new Promise(resolve => loads.push(resolve)) }) };
  nav.show("graphics", false);
  const retry = host.querySelector("[data-graphics-retry]");
  assert.ok(retry.disabled);
  loads.shift()(false); await tick();
  assert.equal(retry.disabled, false);
  assert.equal(retry.textContent, "Graphics details unavailable · Retry");
  retry.onclick();
  nav.show("audio", false);
  let mounted = 0;
  ctx.DesktopGraphics = { mount: () => mounted++ };
  loads.shift()(true); await tick();
  assert.equal(mounted, 1); assert.equal(nav.current(), "audio");
  assert.ok(!host.children.includes(retry));
});

test("a cold menu restores saved placement separately and loads the picker only on Appearance", async () => {
  const placement = ["js/ui/screen-regions.js", "js/ui/screen-placement.js"];
  const picker = "js/ui/appearance-arrangement-picker.js";
  const modules = [...placement, picker];
  for (const customized of [false, true]) {
    const dom = makeDom();
    const calls = [];
    dom.document.getElementById = id => dom.document.querySelector("#" + id);
    const context = vm.createContext({
      window: {}, document: dom.document, location: { search: "" }, URLSearchParams,
      queueMicrotask, requestAnimationFrame: fn => fn(), MutationObserver: class { observe() {} },
      Log: { info() {}, warn() {} }, LayoutPresets: {},
      GameStore: { store: { get: () => customized ? { v: 1, screens: {} } : null, subscribe() {} } },
      ApexRoster: { LAZY_UI_PRESETS: modules, LAZY_UI_PRESETS_EDGES: [[placement[0], picker]] }
    });
    const loaded = new Set();
    context.ScriptLoader = { create: () => ({ async load(files) {
      calls.push(Array.from(files));
      for (const file of files) if (!loaded.has(file)) {
        vm.runInContext(fs.readFileSync(absSrc(file), "utf8"), context, { filename: absSrc(file) });
        loaded.add(file);
      }
      return true;
    } }) };
    vm.runInContext(source, context, { filename: absSrc("js/ui/settings-tabs.js") });
    await tick();
    for (const type of ["pointerdown", "keydown", "click"]) dom.document.dispatchEvent({ type, target: dom.body });
    assert.deepEqual(calls, customized ? [placement] : []);
    assert.equal(!!context.window.ScreenPlacement, customized);
    assert.equal(context.window.AppearanceArrangementPicker, undefined);
    const nav = context.SettingsNav.create(null, () => {});
    nav.show("appearance", false);
    await tick();
    assert.deepEqual(calls.at(-1), modules);
    assert.equal(typeof context.window.AppearanceArrangementPicker.attach, "function");
    assert.ok(Object.keys(context.window.ScreenRegions).every(id => !!context.window.ScreenRegions[id].regions));
    assert.equal(context.window.ScreenRegions[Symbol.for("apex.arrangementRoute")].acceptsDoor("select", "mb-practice"), true);
    assert.equal(context.window.ScreenArranger, undefined);
  }
});

test("Spotify's authenticated return loads only the placement and editor owners on a cold menu", async () => {
  const { dom, ctx } = boot({ ensure: () => true });
  const player = dom.byId("spotifypanel");
  let resolve, requested;
  const opened = [];
  ctx.ScriptLoader = { create: () => ({ load(files) {
    requested = Array.from(files);
    return new Promise(done => { resolve = done; });
  } }) };
  const route = { reveal(id) { opened.push(id); } };
  ctx.window.ScreenRegions = { [Symbol.for("apex.arrangementRoute")]: route };
  player.hidden = true;
  dom.document.dispatchEvent({type:"apex:spotify-arrange-return"});
  player.hidden = false;
  resolve(true); await tick();
  assert.deepEqual(requested, ["js/ui/screen-regions.js", "js/ui/screen-placement.js", "js/ui/screen-arranger.js"]);
  assert.deepEqual(opened, ["spotifypanel"]);
  assert.equal(route.pending, "spotifypanel");
  dom.document.dispatchEvent({type:"apex:spotify-arrange-return"});
  player.hidden = true;
  resolve(true); await tick();
  assert.deepEqual(opened, ["spotifypanel"], "closing while the scripts load abandons the return");
});

test("section reset launchers are unique and do not open a prompt after navigation leaves", async () => {
  const { nav, dom, ctx } = boot({ ensure: () => true });
  let resolve, prompts = 0;
  ctx.SettingsExport = { ready: () => new Promise(r => { resolve = r; }), resetRow: () => prompts++ };
  const panel = dom.byId("pm-panel-graphics");
  nav.show("graphics"); nav.show("graphics");
  const buttons = panel.querySelectorAll("[data-reset-settings]");
  assert.equal(buttons.length, 1);
  buttons[0].click(); nav.show("home"); resolve(true); await tick();
  assert.equal(prompts, 0); assert.equal(buttons[0].disabled, false);
});

test("closing Settings while the reset bundle loads does not focus a hidden confirmation", async () => {
  const { nav, dom, ctx } = boot({ ensure: () => true });
  let resolve, prompts = 0;
  ctx.SettingsExport = { ready: () => new Promise(r => { resolve = r; }), resetRow: () => prompts++ };
  const sheet = dom.byId("pmsettings"), panel = dom.byId("pm-panel-graphics");
  sheet.hidden = false; nav.show("graphics");
  panel.querySelector("[data-reset-settings]").click(); sheet.hidden = true;
  resolve(true); await tick(); assert.equal(prompts, 0);
});

test("#6263: a reset prompt that resolves after focus moved on does not steal it", async () => {
  const { nav, dom, ctx } = boot({ ensure: () => true });
  let resolve; const calls = [];
  ctx.SettingsExport = { ready: () => new Promise(r => { resolve = r; }), resetRow: (id, _b, opts) => calls.push([id, opts]) };
  const sheet = dom.byId("pmsettings"), panel = dom.byId("pm-panel-graphics");
  sheet.hidden = false; nav.show("graphics");
  const reset = panel.querySelector("[data-reset-settings]"), other = dom.document.createElement("button");
  panel.appendChild(other);
  reset.focus(); reset.click(); other.focus();
  resolve(true); await tick();
  assert.equal(calls.length, 1, "the prompt still opens");
  assert.equal(calls[0][1].focus, false, "focus stays on the control the player moved to");
  reset.focus(); reset.click(); resolve(true); await tick();
  assert.equal(calls[1][1].focus, true, "pressed and waited: the confirmation takes focus");
});
