// survey-hud.test.mjs — APEX_SURVEY_HUD flag parse + HUD-visible stub (no browser).
// Enable: ?APEX_SURVEY_HUD=1 | #APEX_SURVEY_HUD=1 | localStorage.APEX_SURVEY_HUD==="1"
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function load() {
  const sb = { Math, JSON, Object, Array, Number, String, RegExp, URLSearchParams, console };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/survey-hud.js").replace(/^const\b/gm, "var"), sb,
    { filename: "js/ui/survey-hud.js" });
  assert.ok(sb.SurveyHud, "js/ui/survey-hud.js assigns SurveyHud");
  return sb.SurveyHud;
}

const SH = load();

function memStore(map = {}) {
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: (k) => { delete map[k]; },
    _map: map,
  };
}

test("enabled: query ?APEX_SURVEY_HUD=1 wins", () => {
  assert.equal(SH.enabled({ search: "?APEX_SURVEY_HUD=1", hash: "" }, memStore()), true);
  assert.equal(SH.enabled({ search: "?foo=1&APEX_SURVEY_HUD=1", hash: "" }, null), true);
  assert.equal(SH.enabled({ search: "?APEX_SURVEY_HUD=0", hash: "" }, null), false);
  assert.equal(SH.enabled({ search: "?APEX_SURVEY_HUD=true", hash: "" }, null), false);
});

test("enabled: hash #APEX_SURVEY_HUD=1 (also &-joined) wins", () => {
  assert.equal(SH.enabled({ search: "", hash: "#APEX_SURVEY_HUD=1" }, null), true);
  assert.equal(SH.enabled({ search: "", hash: "#vs=x&APEX_SURVEY_HUD=1" }, null), true);
  assert.equal(SH.enabled({ search: "", hash: "#?APEX_SURVEY_HUD=1" }, null), true);
  assert.equal(SH.enabled({ search: "", hash: "#APEX_SURVEY_HUD=0" }, null), false);
});

test("enabled: localStorage APEX_SURVEY_HUD===\"1\" wins; any one is enough", () => {
  assert.equal(SH.enabled({ search: "", hash: "" }, memStore({ APEX_SURVEY_HUD: "1" })), true);
  assert.equal(SH.enabled({ search: "", hash: "" }, memStore({ APEX_SURVEY_HUD: "0" })), false);
  assert.equal(SH.enabled({ search: "?APEX_SURVEY_HUD=0", hash: "" }, memStore({ APEX_SURVEY_HUD: "1" })), true,
    "localStorage alone is enough when query is not 1");
  assert.equal(SH.enabled({ search: "?APEX_SURVEY_HUD=1", hash: "" }, memStore({ APEX_SURVEY_HUD: "0" })), true,
    "query alone is enough when storage is not 1");
});

test("enabled: missing / hostile inputs are off", () => {
  assert.equal(SH.enabled(null, null), false);
  assert.equal(SH.enabled({}, null), false);
  assert.equal(SH.enabled({ search: "", hash: "" }, { getItem: () => { throw new Error("blocked"); } }), false);
});

/** Minimal DOM for apply / openPause. */
function fakeDom() {
  const nodes = new Map();
  const mk = (id, extra = {}) => {
    const el = {
      id, hidden: true, inert: false, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      appendChild(c) { this._kids = this._kids || []; this._kids.push(c); return c; },
      ...extra,
    };
    nodes.set(id, el);
    return el;
  };
  mk("overlay");
  mk("hud");
  mk("pausebtn");
  mk("btn-cam");
  mk("nogl");
  mk("pausemenu", { className: "screen dim" });
  mk("loading", { className: "screen", dataset: { phase: "" } });
  mk("dock-left");
  mk("dock-right");
  for (const id of ["grp-pedals", "grp-taps", "grp-steer", "grp-shifts",
    "btn-brake", "btn-throttle", "btn-boost", "btn-ot", "btn-aero",
    "shift-up", "shift-down", "btn-steer-left", "btn-steer-right"]) mk(id);
  const screens = [nodes.get("pausemenu"), nodes.get("loading")];
  const body = { classList: { _s: new Set(),
    add(...a) { for (const c of a) this._s.add(c); },
    remove(...a) { for (const c of a) this._s.delete(c); },
    contains(c) { return this._s.has(c); } },
    dataset: {} };
  const document = {
    body,
    querySelectorAll: (sel) => (sel === ".screen" ? screens.filter((s) => s) : []),
    getElementById: (id) => nodes.get(id) || null,
  };
  const $ = (id) => nodes.get(id) || null;
  const els = { overlay: nodes.get("overlay"), hud: nodes.get("hud"), pausebtn: nodes.get("pausebtn"),
    btnCam: nodes.get("btn-cam"), pausemenu: nodes.get("pausemenu") };
  return { document, $, els, nodes, body };
}

test("apply: shows #hud + docks + pausebtn; hides overlay / nogl; no race warm", () => {
  const fx = fakeDom();
  let busyCalls = 0, stopCalls = 0;
  const loadingScreen = {
    busy(label) { busyCalls++; this._label = label; },
    stop() { stopCalls++; },
  };
  assert.equal(SH.apply({ ...fx, loadingScreen }), true);
  assert.equal(fx.els.hud.hidden, false);
  assert.equal(fx.els.pausebtn.hidden, false);
  assert.equal(fx.els.overlay.hidden, true);
  assert.equal(fx.nodes.get("nogl").hidden, true);
  assert.equal(fx.body.dataset.surveyHud, "1");
  assert.ok(fx.body.classList.contains("in-race"));
  assert.equal(fx.nodes.get("btn-brake").hidden, false, "touch stub unhides pedals");
  assert.ok((fx.nodes.get("dock-left")._kids || []).includes(fx.nodes.get("grp-pedals")));
  assert.ok(busyCalls === 1 || stopCalls >= 1, "uses loading busy or stop (no parallel overlay)");
  assert.equal(SH.active(fx.document), true);
});

test("apply: works without LoadingScreen.busy (pre-#1012 tip)", () => {
  const fx = fakeDom();
  const loadingScreen = { stop() { this.stopped = true; }, phase() { return ""; } };
  assert.equal(SH.apply({ ...fx, loadingScreen }), true);
  assert.equal(loadingScreen.stopped, true);
  assert.equal(fx.els.hud.hidden, false);
});

test("openPause: unhides #pausemenu without race state", () => {
  const fx = fakeDom();
  SH.apply({ ...fx, loadingScreen: { stop() {} } });
  assert.equal(SH.openPause(fx), true);
  assert.equal(fx.els.pausemenu.hidden, false);
  assert.equal(fx.nodes.get("loading").hidden, true);
});

test("manifest + game.js boot hook + css-play screen are wired", () => {
  const man = require("../../tools/manifest.cjs");
  const iSurvey = man.FULL.indexOf("js/ui/survey-hud.js");
  const iGame = man.FULL.indexOf("js/game.js");
  assert.ok(iSurvey >= 0, "survey-hud.js is in FULL");
  assert.ok(iSurvey < iGame, "SurveyHud loads before game.js");
  const game = read("js/game.js");
  assert.match(game, /SurveyHud\.enabled/);
  assert.match(game, /SurveyHud\.apply/);
  assert.match(game, /SurveyHud\.openPause/);
  const play = read("tools/ui/css-play.mjs");
  assert.match(play, /surveyHud:\s*true/);
  assert.match(play, /APEX_SURVEY_HUD=1/);
  assert.match(read("index.html"), /js\/ui\/survey-hud\.js\?v=dev/);
});

