/* layout-presets — SETTINGS › APPEARANCE › LAYOUT PRESET (G9): one tap applies a
 * named whole-UI layout LIVE through the owners' own setters. Runs the REAL
 * SettingRow, PauseOpts, TitleLayout, ScreenLooks and LayoutPresets in node:vm
 * over the mini DOM, in shell order.
 *
 * Run: node --test tests/unit/layout-presets.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const plain = (o) => JSON.parse(JSON.stringify(o));
const MANIFEST = createRequire(import.meta.url)("../../tools/manifest.cjs");

/* Every value the 844x390 touch look-diff measured VISIBLE (artifacts/look-diff/report.json,
 * 2026-10-30; "pauseOpts.*" = PauseOpts' own knobs). A preset may use only these: a DEAD or
 * SUBTLE value is a knob the player would not see move. Re-measure before widening. */
const VISIBLE = new Set(["pause.btn=150", "pause.w=70", "pause.w=200", "pause.gap=0", "pause.gap=200", "pause.style=outline",
  "pause.vpos=top", "pause.vpos=bottom", "pauseOpts.layout=list", "pauseOpts.layout=compact", "pauseOpts.layout=wide",
  "pauseOpts.layout=sidebar", "pauseOpts.side=left", "pauseOpts.side=right", "pauseOpts.dim=off", "datahub.w=60",
  "datahub.corners=pill", "select.w=60", "select.density=roomy", "select.btn=80", "select.btn=150", "select.tile=70",
  "select.tile=160", "select.rows=2", "select.rows=3", "select.strip=bottom", "race.w=60", "race.density=tight", "race.btn=80",
  "race.btn=150", "race.presets=hide", "career.w=60", "career.density=roomy", "career.layout=split", "garage.density=roomy",
  "garage.btn=80", "garage.btn=150", "garage.side=left", "garage.pw=150", "designer.size=70", "designer.size=200",
  "designer.split=40", "designer.split=70", "designer.profile=short", "designer.profile=tall", "popups.w=60",
  "popups.density=roomy", "popups.btn=80", "popups.btn=150", "popups.dim=solid", "popups.dim=off", "popups.vpos=top",
  "popups.vpos=bottom"]);

function boot({ stored = {}, studio = true, dropScreen = null } = {}) {
  const dom = makeDom();
  const mk = (tag, id, parent) => { const e = dom.makeElement(tag, id); (parent || dom.body).appendChild(e); return e; };
  for (const id of ["pausemenu", "datahub", "race-settings", "standings", "trackdesigner"]) mk("dialog", id).hidden = true;
  for (const id of ["select", "career", "carsetup", "overlay"]) mk("div", id).hidden = true;
  const settings = mk("dialog", "pmsettings");
  const panel = mk("section", "pm-panel-appearance", settings);
  const help = mk("p", "pm-appearance-help", panel);
  help.className = "adv-help";
  if (studio) mk("div", "appearance-studio", panel);
  const pause = mk("details", "pm-pausemenu", panel);
  mk("summary", "pm-pausemenu-sum", pause);
  mk("div", "pm-pausemenu-body", pause);
  const ts = mk("details", "pm-titlescreen", panel);
  mk("summary", "pm-titlescreen-sum", ts);
  const tsBody = mk("div", "pm-titlescreen-body", ts);
  mk("button", "pm-replay-intro", tsBody);
  dom.body.setAttribute("data-shape", "wide");
  const get = dom.document.getElementById;
  dom.document.getElementById = (id) => (dom.has(id) ? get(id) : null);

  const data = Object.assign({}, stored);
  const subs = [];
  const store = {
    get: (k, d) => (k in data ? data[k] : d),
    set: (k, v) => { if (v === null) delete data[k]; else data[k] = v; for (const fn of subs) fn({ key: k, local: true }); },
    subscribe: (fn) => { subs.push(fn); return () => {}; },
  };
  const timers = [];
  const warns = [];
  class MutationObserver { constructor(fn) { this.fn = fn; } observe() {} }
  const sb = {
    document: dom.document, GameStore: { store }, MutationObserver,
    Log: { info() {}, warn: (_t, m) => { warns.push(String(m)); } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    SheetShape: { reclassify() {} }, innerWidth: 844, innerHeight: 390,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  const run = (f) => vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  for (const f of ["js/ui/setting-row.js", "js/ui/pause-opts.js", "js/ui/title-layout.js", "js/ui/screen-looks.js"]) run(f);
  if (dropScreen) vm.runInContext(`ScreenLooks = Object.assign({}, ScreenLooks, { SCREENS: ScreenLooks.SCREENS.filter((s) => s.id !== ${JSON.stringify(dropScreen)}) });`, ctx, { filename: "layout-presets.test:drop-screen" });
  run("js/ui/layout-presets.js");
  const g = (n) => vm.runInContext(n, ctx, { filename: "layout-presets.test:eval" });
  const flush = () => { while (timers.length) timers.shift().fn(); };
  return { dom, data, warns, flush, panel, html: dom.documentElement, M: g("LayoutPresets"), S: g("ScreenLooks"), P: g("PauseOpts"), T: g("TitleLayout"), R: g("SettingRow") };
}

test("table: four presets, SHIPPED first; every row is a real knob at a VISIBLE look-diff value", () => {
  const { M, warns } = boot();
  assert.deepEqual(plain(M.PRESETS.map((p) => p.id)), ["shipped", "thumb", "compact", "big"]);
  assert.equal(M.PRESETS[0].set.length, 0, "SHIPPED is every knob at its default");
  for (const p of M.PRESETS) {
    assert.ok(p.name && p.note, p.id);
    for (const [screen, k, v] of p.set) assert.ok(VISIBLE.has(`${screen}.${k}=${v}`), `${p.id}: ${screen}.${k}=${v} is not a VISIBLE value`);
    assert.ok(M.expected(p.id), p.id);
  }
  assert.deepEqual(warns, [], "no row is skipped against the real registries");
});

test("fresh install reads SHIPPED; the row mounts above the studio with a disabled CUSTOM", () => {
  const { M, panel, dom } = boot();
  assert.equal(M.current(), "shipped");
  const box = dom.byId("pm-layoutpreset-box");
  assert.equal(panel.children[1], box, "after the panel help, before #appearance-studio");
  assert.equal(panel.children[2].id, "appearance-studio");
  const sel = dom.byId("pm-layoutpreset-sel");
  assert.deepEqual(sel.children.map((o) => [o.value, !!o.disabled]),
    [["shipped", false], ["thumb", false], ["compact", false], ["big", false], ["custom", true]]);
  assert.equal(sel.value, "shipped");
  assert.equal(dom.byId("pm-layoutpreset-undo").hidden, true);
  assert.equal(M.mount(), dom.byId("pm-layoutpreset"), "mount is once");
});

test("without the studio the row still lands at the top, after the help line", () => {
  const { panel, dom } = boot({ studio: false });
  assert.equal(panel.children[1], dom.byId("pm-layoutpreset-box"));
});

test("THUMB applies live through the owners: stores, <html> stamps and the row", () => {
  const { M, S, P, data, html, dom } = boot();
  const r = M.apply("thumb");
  assert.deepEqual(plain(r), { applied: M.PRESETS[1].set.length, skipped: 0 });
  assert.equal(P.layoutMode(), "sidebar");
  assert.equal(P.sideMode(), "right");
  assert.equal(html.dataset.pauseSide, "right");
  assert.equal(html.dataset.pauseLayout, "sidebar");
  assert.equal(S.read("popups").vpos, "bottom");
  assert.equal(html.dataset[S.dataKey("popups", "vpos")], "bottom");
  assert.equal(S.read("select").strip, "bottom");
  assert.equal(S.read("select").btn, 150);
  assert.equal(data.layoutPreset, "thumb");
  assert.equal(M.current(), "thumb");
  assert.equal(dom.byId("pm-layoutpreset-sel").value, "thumb");
  assert.equal(P.confirmMode(), "on", "CONFIRM QUIT is never a preset knob");
});

test("presets start from SHIPPED: COMPACT after THUMB leaves nothing of THUMB behind", () => {
  const { M, S, P } = boot();
  M.apply("thumb");
  M.apply("compact");
  assert.equal(P.sideMode(), "centre");
  assert.equal(P.layoutMode(), "compact");
  assert.equal(S.read("popups").vpos, "middle");
  assert.equal(S.read("race").density, "tight");
  assert.equal(M.current(), "compact");
  M.apply("shipped");
  for (const s of S.SCREENS) assert.ok(S.isShipped(s.id), s.id);
  assert.equal(P.shipped(), true);
  assert.equal(M.current(), "shipped");
});

test("any single knob changed afterwards reads CUSTOM, and the row repaints off the store", () => {
  const { M, S, P, T, dom, flush } = boot();
  M.apply("big");
  S.set("race", "corners", "pill");
  flush();
  assert.equal(M.current(), "custom");
  assert.equal(dom.byId("pm-layoutpreset-sel").value, "custom");
  S.set("race", "corners", "round");
  flush();
  assert.equal(M.current(), "big", "back to the preset's picture reads the preset again");
  P.setDim("off");
  assert.equal(M.current(), "custom", "PauseOpts knobs count");
  P.setDim("full");
  T.set({ btns: { x: 10 } });
  assert.equal(M.current(), "custom", "a moved title layout counts");
});

test("UNDO restores the state the preset replaced, a CUSTOM one included", () => {
  const { M, S, P, T, dom, data } = boot({ stored: { lookDatahub: { tabs: "pill" }, pauseDim: "soft", titleLayout: { v: 2, wide: { btns: { x: 12 } } } } });
  const before = M.snapshot();
  assert.equal(M.current(), "custom");
  M.apply("thumb");
  assert.equal(S.read("datahub").tabs, "filled");
  assert.equal(T.isDefault(T.all().wide), true);
  const undo = dom.byId("pm-layoutpreset-undo");
  assert.equal(undo.hidden, false);
  assert.equal(M.undo(), true);
  assert.deepEqual(plain(M.snapshot().looks), plain(before.looks));
  assert.equal(P.dimMode(), "soft");
  assert.equal(P.sideMode(), "centre");
  assert.equal(T.all().wide.btns.x, 12);
  assert.equal(data.layoutPreset, undefined);
  assert.equal(M.current(), "custom");
  assert.equal(M.undo(), false, "one level");
});

test("the chevron steps presets: › from SHIPPED applies THUMB, ‹ goes straight back to SHIPPED", () => {
  const { M, dom } = boot();
  dom.byId("pm-layoutpreset-next").onclick({});
  assert.equal(M.current(), "thumb");
  dom.byId("pm-layoutpreset-prev").onclick({});
  assert.equal(M.current(), "shipped");
});

test("an unknown preset or knob is skipped with a Log.warn, never thrown", () => {
  const a = boot();
  assert.equal(a.M.apply("broadcast"), null);
  assert.equal(a.warns.length, 1, "one warning for the unknown preset");
  const b = boot({ dropScreen: "designer" });
  const r = b.M.apply("compact");
  assert.equal(r.skipped, 1);
  assert.equal(r.applied, b.M.PRESETS[2].set.length - 1);
  assert.ok(b.warns.length >= 1, "the dropped designer knob warns");
  assert.equal(b.M.current(), "compact", "the rest still applied and matches");
});

test("lazy: LAZY_UI_PRESETS, no <script> tag, loaded by SettingsNav on APPEARANCE; layoutPreset is exported", () => {
  assert.deepEqual(MANIFEST.LAZY_UI_PRESETS, ["js/ui/layout-presets.js"]);
  assert.equal(new Set(MANIFEST.FULL).has("js/ui/layout-presets.js"), false, "lazy, never eager");
});
