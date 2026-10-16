/* Actual SettingsSearch/SettingsNav regression paths; geometry is explicit,
 * browsers remain the integration owner's responsibility. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
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
  vm.runInContext(read("js/ui/settings-search.js") + ";this.Search=SettingsSearch;", ctx);
  vm.runInContext(read("js/ui/settings-tabs.js") + ";this.Nav=SettingsNav;", ctx);
  const nav = ctx.Nav.create(null, () => {});
  const search = index.querySelector("input"), result = (query) => { search.value = query; search.oninput(); return [...index.querySelectorAll("button")].find((b) => b.dataset.settingResult); };
  return { dom, el, ctx, nav, index, body, search, result, complete: () => complete(true) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
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
test("a fresh settings session cancels search-return ownership while preserving query", () => {
  const h = boot(), control = h.el("select", "pm-gears-sel", h.dom.document.querySelector("#pm-panel-controls")); control.value = "auto";
  h.result("manual gears").onclick(); h.nav.showCurrent();
  const display = h.dom.document.querySelector("#pm-open-display"); display.focus(); display.onclick(); h.nav.back();
  assert.equal(h.dom.document.activeElement, display); assert.equal(h.search.value, "manual gears"); assert.equal(control.value, "auto");
});
test("successful lazy search still owns BACK and opens ancestor disclosures", async () => {
  const h = boot({ lazy: true }), fold = h.el("details", "audio-fold", h.dom.document.querySelector("#audioset")), target = h.el("input", "as-mvol", fold); target.value = "42";
  const result = h.result("music"); result.onclick(); h.ctx.GameAudio._stub = false; h.complete(); await tick(); await tick();
  assert.equal(fold.open, true); assert.equal(h.dom.document.activeElement, target); h.nav.back(); assert.equal(h.dom.document.activeElement, result); assert.equal(target.value, "42");
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
