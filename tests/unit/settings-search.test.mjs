/* Actual SettingsSearch/SettingsNav regression paths; geometry is explicit,
 * browsers remain the integration owner's responsibility. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
function boot({ lazy = false } = {}) {
  const dom = makeDom({ readyState: "loading" });
  dom.document.getElementById = (id) => dom.document.querySelector("#" + id);
  const el = (tag, id, parent = dom.body) => { const n = dom.makeElement(tag, id); parent.appendChild(n); return n; };
  const settings = el("section", "pmsettings"), body = el("div", "pm-settings-body", settings), index = el("nav", "pm-settings-index", body);
  el("h2", "dlg-settings", settings);
  for (const page of ["controls", "display", "driving", "appearance", "a11y", "files"]) el("section", "pm-panel-" + page, body);
  el("section", "advanced", body); el("section", "audioset", body);
  for (const id of ["pm-open-controls", "pm-open-display", "pm-open-driving", "pm-open-appearance", "pm-open-a11y", "pm-open-files", "pm-advanced", "pm-audio"]) el("button", id, index);
  let complete;
  const ctx = vm.createContext({ document: dom.document, window: {}, Log: { info() {}, warn() {} }, GameAudio: { _stub: lazy }, AudioPanel: { _ensure: () => new Promise((r) => { complete = r; }) } });
  vm.runInContext(read("js/ui/settings-search.js") + ";this.Search=SettingsSearch;", ctx, { filename: absSrc("js/ui/settings-search.js") });
  vm.runInContext(read("js/ui/settings-tabs.js") + ";this.Nav=SettingsNav;", ctx, { filename: absSrc("js/ui/settings-tabs.js") });
  const nav = ctx.Nav.create(null, () => {});
  const search = index.querySelector("input"), result = (query) => { search.value = query; search.oninput(); return [...index.querySelectorAll("button")].find((b) => b.dataset.settingResult); };
  return { dom, el, ctx, nav, index, body, search, result, complete: () => complete(true) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
test("search ownership survives a cross-link until BACK unwinds to the original result", () => {
  for (const [destination, target] of [["a11y", "pm-motion-sel"], ["appearance", "pm-caption-size-sel"]]) {
    const h = boot(), appearance = h.dom.document.querySelector("#pm-panel-appearance");
    const caption = h.el("select", "pm-caption-size-sel", appearance), motion = h.el("select", "pm-motion-sel", h.dom.document.querySelector("#pm-panel-a11y"));
    caption.value = "large"; motion.value = "auto";
    const result = h.result("caption size"); result.focus(); result.onclick();
    const jump = h.el("button", "appearance-motion-jump", appearance);
    jump.setAttribute("data-settings-jump", destination); jump.setAttribute("data-jump-target", target);
    h.body.scrollTop = 220; h.dom.dispatch(jump, { type: "click", bubbles: true });
    assert.equal(h.nav.current(), destination); assert.equal(h.dom.document.activeElement, h.dom.document.querySelector("#" + target));
    h.nav.back(); assert.equal(h.nav.current(), "appearance"); assert.equal(h.dom.document.activeElement, jump); assert.equal(h.body.scrollTop, 220);
    h.nav.back(); assert.equal(h.nav.current(), "home"); assert.equal(h.dom.document.activeElement, result); assert.equal(h.search.value, "caption size");
    assert.equal(caption.value, "large"); assert.equal(motion.value, "auto");
  }
});
test("accessibility searches reach the existing controls and BACK restores the query without preference writes", () => {
  const h = boot();
  for (const [query, id, page] of [
    ["subtitles hearing", "pm-captions-sel", "appearance"], ["captions size", "pm-caption-size-sel", "appearance"],
    ["caption position", "pm-caption-pos-sel", "appearance"], ["caption background", "pm-caption-bg-sel", "appearance"],
    ["caption speaker", "pm-caption-speaker-sel", "appearance"], ["protanopia", "pm-cvd-sel", "appearance"],
    ["gas toggle", "pm-hold-throttle-sel", "a11y"], ["look back toggle", "pm-hold-lookback-sel", "a11y"],
  ]) {
    const control = h.el("select", id, h.dom.document.querySelector("#pm-panel-" + page)); control.value = "original";
    const result = h.result(query); assert.ok(result, query);
    assert.ok(result.textContent.endsWith(" · " + h.ctx.Nav.routes[page].title));
    result.onclick(); assert.equal(h.dom.document.activeElement, control); assert.equal(control.value, "original");
    h.nav.back(); assert.equal(h.dom.document.activeElement, result); assert.equal(h.search.value, query);
  }
});
test("a cold layout search waits for the picker and respects a later navigation", async () => {
  for (const leave of [false, true]) {
    const h = boot();
    let finish;
    let mounted = false;
    h.ctx.AppearanceStudio = {
      loaded: () => mounted,
      ensureLoaded: () => new Promise(resolve => { finish = () => { mounted = true; resolve(true); }; }),
      initUI() {},
    };
    const result = h.result("arrange screen");
    assert.equal(result.dataset.settingResult, "appearance-arrange-screen");
    result.onclick();
    if (leave) h.nav.show("driving");
    const picker = h.el("select", "appearance-arrange-screen", h.dom.document.querySelector("#pm-panel-appearance"));
    finish(); await tick();
    if (leave) {
      assert.equal(h.nav.current(), "driving");
      assert.notEqual(h.dom.document.activeElement, picker);
    } else {
      assert.equal(h.nav.current(), "appearance");
      assert.equal(h.dom.document.activeElement, picker);
      h.nav.back();
      assert.equal(h.dom.document.activeElement, result);
    }
  }
});
test("search destinations use navigation titles instead of internal page ids", () => {
  const h = boot();
  for (const [query, title] of [["motion", "ACCESSIBILITY"], ["HUD size", "HUD & CAMERA"], ["braking beep", "DRIVING AIDS"], ["music volume", "MUSIC & SOUND"], ["deadzone", "ADVANCED INPUT & HANDLING"]]) {
    assert.ok(h.result(query).textContent.endsWith(" · " + title));
  }
});
test("BACK reveals a below-fold result after the home scroller reset, without changing preference", () => {
  const h = boot(), page = h.dom.document.querySelector("#advanced"), target = h.el("input", "pm-line", page); target.value = "4";
  h.search.value = "a"; h.search.oninput();
  const result = [...h.index.querySelectorAll("button")].find((b) => b.dataset.settingResult === "line");
  let scrolled = 0;
  result.scrollIntoView = (opts) => { assert.equal(h.dom.document.activeElement, result); assert.equal(opts.block, "nearest"); assert.equal(h.body.scrollTop, 0); scrolled++; h.body.scrollTop = 700; };
  h.body.scrollTop = 700; result.focus(); result.onclick(); assert.equal(h.dom.document.activeElement, target);
  h.nav.back(); assert.equal(h.dom.document.activeElement, result); assert.equal(scrolled, 1); assert.equal(h.body.scrollTop, 700); assert.equal(target.value, "4"); assert.equal(h.search.value, "a");
});
test("cancelled lazy audio search cannot steal the next category BACK target", async () => {
  const h = boot({ lazy: true }), music = h.result("music"); music.focus(); music.onclick();
  assert.equal(h.index.hidden, false, "lazy navigation has not committed");
  const display = h.dom.document.querySelector("#pm-open-display"); display.focus(); display.onclick(); h.nav.back();
  assert.equal(h.dom.document.activeElement, display);
  h.complete(); await tick(); await tick(); assert.equal(h.index.hidden, false); assert.equal(h.dom.document.activeElement, display);
});
test("a fresh settings session cancels search-return ownership and clears the query (UI hunt #5)", () => {
  const h = boot(), control = h.el("select", "pm-gears-sel", h.dom.document.querySelector("#pm-panel-controls")); control.value = "auto";
  h.result("manual gears").onclick(); assert.ok(h.search.value); h.nav.showCurrent();
  assert.equal(h.search.value, ""); assert.equal([...h.index.querySelectorAll("button")].filter((b) => b.dataset.settingResult).length, 0, "reopened sheet is unfiltered");
  const display = h.dom.document.querySelector("#pm-open-display"); display.focus(); display.onclick(); h.nav.back();
  assert.equal(h.dom.document.activeElement, display); assert.equal(control.value, "auto");
  const result = h.result("manual gears"); result.onclick(); h.nav.invalidate(); h.nav.returnToSearch();
  assert.equal(h.search.value, "manual gears", "a result page's return (Race Settings) keeps the query");
});
test("Escape in a non-empty search clears the query and keeps the sheet; an empty field lets Escape through", () => {
  const h = boot();
  h.result("manual gears");
  const key = (target) => ({ key: "Escape", target, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } });
  const first = key(h.search); h.ctx.Search.onEscape(first);
  assert.equal(h.search.value, ""); assert.equal(first.defaultPrevented, true); assert.equal(first.stopped, true);
  assert.equal([...h.index.querySelectorAll("button")].filter((b) => b.dataset.settingResult).length, 0, "results repainted");
  const second = key(h.search); h.ctx.Search.onEscape(second);
  assert.equal(second.defaultPrevented, false, "empty field: TopModal's Escape closes the sheet as before");
  // A pad's B arrives at the dialog as `cancel`; the focused field is the target.
  h.result("manual gears"); h.search.focus();
  const b = { type: "cancel", target: h.dom.document.querySelector("#pmsettings"), preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  h.ctx.Search.onEscape(b);
  assert.equal(h.search.value, ""); assert.equal(b.defaultPrevented, true, "pad B clears the query instead of closing the sheet");
});
test("successful lazy search still owns BACK and opens ancestor disclosures", async () => {
  const h = boot({ lazy: true }), fold = h.el("details", "audio-fold", h.dom.document.querySelector("#audioset")), target = h.el("input", "as-mvol", fold); target.value = "42";
  const result = h.result("music volume"); result.onclick(); h.ctx.GameAudio._stub = false; h.complete(); await tick(); await tick();
  assert.equal(fold.open, true); assert.equal(h.dom.document.activeElement, target); h.nav.back(); assert.equal(h.dom.document.activeElement, result); assert.equal(target.value, "42");
});
test("narrowing a query reuses result buttons and does not re-read option labels", () => {
  const h = boot();
  const page = h.dom.document.querySelector("#pm-panel-display");
  const sel = h.el("select", "pm-hudscale", page);
  const opt = h.el("option", "", sel);
  let reads = 0;
  Object.defineProperty(opt, "textContent", { get() { reads++; return "ENORMOUS"; } });
  const created = [];
  const orig = h.dom.document.createElement;
  h.dom.document.createElement = (tag) => { const node = orig(tag); created.push(node); return node; };
  h.search.value = "volume";
  h.search.oninput();
  const wide = [...h.index.querySelectorAll("button")].filter((b) => b.dataset.settingResult);
  const byId = new Map(wide.map((b) => [b.dataset.settingResult, b]));
  assert.ok(wide.length > 2, "volume matches several settings");
  const made = created.length;
  const readOnce = reads;
  assert.ok(readOnce >= 1, "the unmatched select's option text is read once");
  h.search.value = "music volume";
  h.search.oninput();
  const narrow = [...h.index.querySelectorAll("button")].filter((b) => b.dataset.settingResult);
  assert.ok(narrow.length > 0 && narrow.length < wide.length);
  for (const b of narrow) assert.equal(b, byId.get(b.dataset.settingResult));
  assert.equal(created.length, made, "narrowing allocates no new result nodes");
  assert.equal(reads, readOnce, "option labels stay cached on the next keystroke");
  h.search.value = "enormous";
  h.search.oninput();
  const hit = [...h.index.querySelectorAll("button")].find((b) => b.dataset.settingResult === "hud-size");
  assert.ok(hit, "option text still matches after the cache fill");
  assert.equal(reads, readOnce, "the cached label answers a later option-text query");
});

test("search spans the existing two-column door grid and a full flex row on narrow sheets", () => {
  const css = read("css/player-tools.css"), rule = /\.settings-find\s*\{([^}]+)\}/.exec(css)[1];
  assert.match(read("css/settings-controls.css"), /#pm-settings-index\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2/);
  assert.match(rule, /grid-column:\s*1\s*\/\s*-1/); assert.match(rule, /flex:\s*1\s+1\s+100%/); assert.match(rule, /min-width:\s*0/);
});
test("registered owner rows replace safely and update a mounted query without preference writes", () => {
  const h = boot(); h.result("custom option");
  const rows = [{ id: "example-setting", label: "Example setting", page: "display", target: "example", aliases: "custom option" }];
  const first = h.ctx.Search.register("example-owner", rows); assert.equal(h.ctx.Search.find("custom option").length, 1); assert.ok([...h.index.querySelectorAll("button")].some((b) => b.dataset.settingResult === "example-setting"));
  const second = h.ctx.Search.register("example-owner", [{ ...rows[0], aliases: "replacement" }]); first(); assert.equal(h.ctx.Search.find("replacement").length, 1); assert.equal(h.ctx.Search.find("custom option").length, 0);
  second(); assert.equal(h.ctx.Search.find("replacement").length, 0);
  assert.throws(() => h.ctx.Search.register("bad", [{ ...rows[0], target: "bad]selector" }]), /Invalid/);
  assert.throws(() => h.ctx.Search.register("bad", [{ ...rows[0], id: "gears" }]), /owned/);
});
test("real resolution/dead-zone controls are registered, option labels searchable, and navigation read-only", () => {
  const h = boot(), shell = read("index.html");
  for (const [query, id, page, value] of [["resolution", "pm-res-sel", "pm-panel-display", "low"], ["deadzone", "pm-paddz", "advanced", "5"]]) {
    assert.ok(shell.includes('id="' + id + '"'), "descriptor targets the actual shell control");
    const fold = h.el("details", "fold-" + id, h.dom.document.querySelector("#" + page)), target = h.el(id.endsWith("sel") ? "select" : "input", id, fold); target.value = value;
    if (id.endsWith("sel")) { const option = h.el("option", "", target); option.textContent = "ULTRA SHARP TEST OPTION"; }
    h.result(query).onclick(); assert.equal(h.dom.document.activeElement, target); assert.equal(target.value, value); assert.equal(fold.open, true); h.nav.back();
  }
  assert.equal(h.ctx.Search.find("ultra sharp")[0].target, "pm-res-sel");
});
test("external owner navigation reports refusal visibly and restores search on explicit return", () => {
  const h = boot(); let allowed = false;
  const sheet = h.el("section", "race-settings"), target = h.el("select", "rs-tyres-sel", sheet); target.value = "real";
  h.ctx.Search.register("race-owner", [{ id: "tyre-wear", label: "Tyre wear", page: "race-settings", target: "rs-tyres-sel", aliases: "tires degradation", unavailableReason: "Choose tyre wear before a race.", navigate: (arrived) => { if (!allowed) return false; h.dom.document.querySelector("#pmsettings").hidden = true; return arrived(); } }]);
  const button = h.result("tyre wear"); button.onclick(); assert.match(h.index.querySelector('[role="status"]').textContent, /before a race/); assert.equal(h.index.hidden, false);
  allowed = true; button.onclick(); assert.equal(h.dom.document.activeElement, target); h.dom.document.querySelector("#pmsettings").hidden = false; h.nav.returnToSearch(); assert.equal(h.dom.document.activeElement, button); assert.equal(target.value, "real");
});
test("a dependency-greyed row reports its reason, not 'unavailable', and takes focus", () => {
  const h = boot();
  const sheet = h.el("section", "dep-sheet"), row = h.el("div", "dep-row", sheet), target = h.el("select", "dep-map-sel", row), why = h.el("p", "dep-why", row);
  row.setAttribute("data-dep-off", "hud"); target.disabled = true; target.setAttribute("data-dep-disabled", ""); why.setAttribute("data-dep-reason", "label"); why.textContent = "HUD is OFF";
  h.ctx.Search.register("dep-owner", [{ id: "dep-map", label: "Track map", page: "controls", target: "dep-map-sel", aliases: "zzdepmap" }]);
  h.result("zzdepmap").onclick();
  const text = h.index.querySelector('[role="status"]').textContent;
  assert.match(text, /HUD is OFF/); assert.doesNotMatch(text, /unavailable/); assert.equal(h.dom.document.activeElement, row);
});

// #5562: SettingDeps EXPLAIN greys nothing itself; it writes the owner's reason beside the control and points
// aria-describedby at it, with no data-dep-off row. Search printed "unavailable ... on this device" for those.
test("an owner-greyed control reports the reason it is described by, not 'unavailable'", () => {
  const h = boot();
  const sheet = h.el("section", "own-sheet"), group = h.el("div", "own-gears", sheet), a = h.el("button", "own-gears-auto", group), b = h.el("button", "own-gears-manual", group);
  const why = h.el("p", "why-gears-why-0", sheet), stale = h.el("p", "own-stale-why", sheet);
  for (const x of [why, stale]) x.setAttribute("data-dep-reason", "group");
  why.textContent = "MANUAL needs TILT or a pad"; stale.textContent = "Connect a controller first"; stale.hidden = true;
  a.disabled = b.disabled = true; b.setAttribute("aria-describedby", "own-help own-stale-why why-gears-why-0");
  h.ctx.Search.register("own-owner", [{ id: "own-gears", label: "Manual gears", page: "controls", target: "own-gears", aliases: "zzowngears" }]);
  h.result("zzowngears").onclick();
  assert.equal(h.index.querySelector('[role="status"]').textContent, "Manual gears is off: MANUAL needs TILT or a pad");
  assert.equal(h.dom.document.activeElement, why, "focus lands on the reason");
  assert.equal(h.dom.document.querySelector("#pm-panel-controls").children.length, 0, "no generic note is left on the page");
});

test("backup searches select the correct navigation tab without activating a file action", async () => {
  const h = boot();
  let finish, mounted = false, selected;
  h.ctx.SettingsExport = {
    loaded: () => mounted, ready: () => new Promise(resolve => { finish = resolve; }),
    ensureMounted() {
      if (h.dom.document.querySelector("#pm-files-show-save")) return;
      for (const tab of ["save", "restore", "share"]) {
        const target = h.el("button", "pm-files-show-" + tab, h.dom.document.querySelector("#pm-panel-files"));
        target.setAttribute("role", "tab"); target.setAttribute("aria-selected", "false");
        target.onclick = () => { selected = tab; };
      }
    },
  };
  const result = h.result("restore backup"); result.onclick();
  mounted = true; finish(true); await tick();
  assert.equal(selected, "restore");
  assert.equal(h.dom.document.activeElement.id, "pm-files-show-restore");
  h.nav.back(); assert.equal(h.dom.document.activeElement, result);
  h.result("share code").onclick(); assert.equal(selected, "share");
  h.nav.back(); h.result("save backup").onclick(); assert.equal(selected, "save");
});

test("search indexes available graphics effects on demand without mounting the graphics editor", async () => {
  const h = boot();
  h.ctx.GfxQuality = { supportsOption: key => key === "hdrOut" };
  let loads = 0;
  h.ctx.ScriptLoader = { create: () => ({ load: async () => {
    loads++; vm.runInContext(read("js/ui/desktop-graphics.js"), h.ctx, { filename: absSrc("js/ui/desktop-graphics.js") }); return true;
  } }) };
  assert.equal(loads, 0);
  h.result("HDR"); await tick();
  assert.equal(loads, 1);
  const result = h.ctx.Search.find("hdr").find(r => r.id === "graphics-hdrOut");
  assert.equal(result.target, "desktop-detail-hdrOut-sel");
  assert.equal(h.ctx.Search.find("adaptive rival models").length, 0);
  assert.equal(h.dom.document.querySelector("[data-desktop-graphics]"), null);
  h.result("HDR output"); assert.equal(loads, 1);
  for (const page of ["graphics", "visual", "progress"]) {
    h.ctx.Search.register("normal-route", [{ id: "new-setting", label: "New option", page, target: "some-setting" }]);
  }
  assert.throws(() => h.ctx.Search.register("bad-route", [{ id: "invalid", label: "No page", page: "missing", target: "invalid" }]));
});

test("player vocabulary resolves the driving line switch and wheel lock", () => {
  const h = boot();
  h.ctx.Search.registerRaceSettings(h.nav, { openSettingSearch() { return false; } });
  for (const query of ["racing line", "driving line"]) {
    assert.equal(h.ctx.Search.find(query).find(row => row.id === "driving-line-overlay").target, "rs-line-sel");
  }
  for (const query of ["wheel-lock", "anti lock", "anti-lock"]) {
    assert.ok(h.ctx.Search.find(query).some(row => row.id === "wheel-lock"));
  }
});

test("session search explains the requirement at Home and opens the destination in a race", () => {
  const h = boot();
  let active = false;
  h.ctx.window.UiLayers = { inRace: () => active };
  const strategy = h.el("section", "pm-panel-strategy", h.body);
  const target = h.el("select", "pm-pit-choice-sel", strategy);
  const result = h.result("next pit-stop tyres");
  result.focus(); result.onclick();
  assert.equal(h.nav.current(), "home");
  assert.equal(h.dom.document.activeElement, result);
  assert.match(h.index.querySelector('[role="status"]').textContent, /Pause during a session/);
  active = true;
  result.onclick();
  assert.equal(h.nav.current(), "strategy");
  assert.equal(h.dom.document.activeElement, target);
});

test("backup search waits for the files owner and selects only the requested tab", async () => {
  const h = boot(), files = h.dom.document.querySelector("#pm-panel-files");
  let loaded = false, finish, selected;
  h.ctx.SettingsExport = {
    ready: () => new Promise(resolve => { finish = () => { loaded = true; resolve(true); }; }),
    loaded: () => loaded,
    ensureMounted() {
      if (files.querySelector("button")) return;
      for (const action of ["save", "restore", "share"]) {
        const tab = h.el("button", "pm-files-show-" + action, files);
        tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", "false");
        tab.onclick = () => { selected = action; };
      }
    },
  };
  for (const [query, action] of [["export settings", "save"], ["restore backup", "restore"], ["import share code", "share"]]) {
    const result = h.result(query);
    result.focus(); result.onclick();
    if (!loaded) { assert.equal(h.nav.current(), "home"); finish(); await tick(); }
    assert.equal(selected, action);
    assert.equal(h.dom.document.activeElement.id, "pm-files-show-" + action);
    h.nav.back(); assert.equal(h.dom.document.activeElement, result);
  }
});

test("the named audio controls resolve to their own input", () => {
  const h = boot();
  for (const [term, id] of [["engine pitch", "as-t-pitch"], ["engineer chatter", "as-chat-sel"], ["battle tones", "as-battle-sel"]]) {
    const target = h.el("input", id, h.dom.document.querySelector("#audioset"));
    assert.equal(h.ctx.Search.find(term)[0].target, id);
    h.result(term).onclick();
    assert.equal(h.dom.document.activeElement, target);
    h.nav.back();
  }
});

test("cold Storage health search waits for Files and focuses the actual disclosure", async () => {
  const h = boot(), host = h.dom.document.querySelector("#pm-panel-files");
  let release, loaded = false;
  h.ctx.SettingsExport = {
    loaded: () => loaded,
    ready: () => new Promise(resolve => { release = () => {
      vm.runInContext(read("js/ui/save-health.js") + ";this.health=SaveHealth", h.ctx, {filename: absSrc("js/ui/save-health.js")});
      loaded = true;
      resolve(true);
    }; }),
    ensureMounted() { h.ctx.health.mount(host); },
  };
  const result = h.result("storage health");
  result.focus();
  result.onclick();
  assert.equal(h.nav.current(), "home");
  release();
  await tick();
  assert.equal(h.nav.current(), "files");
  const summary = host.querySelector("summary");
  assert.equal(h.dom.document.activeElement, summary);
  assert.equal(summary.parentElement.open, true);
  h.nav.back();
  assert.equal(h.dom.document.activeElement, result);
});
test("a lazy owner registering after a session-scoped click keeps the pause note until the query changes", () => {
  const h = boot();
  h.ctx.window.UiLayers = { inRace: () => false };
  h.el("section", "pm-panel-strategy", h.body); h.el("select", "pm-pit-choice-sel", h.dom.document.querySelector("#pm-panel-strategy"));
  const status = h.index.querySelector('[role="status"]'), pause = "Pause during a session to open Next pit-stop tyres.";
  h.result("next pit-stop tyres").onclick();
  assert.equal(status.textContent, pause);
  // The graphics index resolves after the click (time-trial zoom matrix, Pages run 45756091560).
  h.ctx.Search.register("late-owner", [{ id: "late-row", label: "Late row", page: "display", target: "late", aliases: "pit" }]);
  assert.equal(status.textContent, pause);
  h.result("next pit-stop tyre");
  assert.equal(status.textContent, h.ctx.Search.find("next pit-stop tyre").length + " matching settings");
});
test("blocked search results reach LiveRegion, not only the status note (#6883 row 6)", () => {
  const h = boot(), said = [];
  h.ctx.LiveRegion = { say: (t, k) => said.push([t, k]) };
  h.ctx.window.UiLayers = { inRace: () => false };
  const result = h.result("pit stop tyres"); assert.ok(result);
  result.onclick();
  assert.equal(said.length, 1);
  assert.match(said[0][0], /^Pause during a session to open /);
  assert.equal(said[0][1], "hud");
});
