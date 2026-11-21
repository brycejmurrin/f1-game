/* ctx-lost-notice-menu-exit — the graphics-reset card is title/menu-only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function bootNoticeHarness({ storageDenied = false } = {}) {
  const dom = makeDom({ readyState: "loading" });
  dom.body.insertAdjacentHTML = () => {};
  const ss = { getItem(k) { return this[k] ?? null; }, setItem(k, v) { this[k] = String(v); }, removeItem(k) { delete this[k]; } };
  if (storageDenied) ss.getItem = () => { throw new Error("Storage denied"); };
  else ss.setItem("apex26.ctxLostNotice", "1");
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, sessionStorage: ss, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    getComputedStyle: () => ({ getPropertyValue: () => "", display: "block" }),
    innerWidth: 800, innerHeight: 600,
    Tracks: { LIST: [{ id: "monza", name: "Monza", country: "Italy" }] },
    Teams: { LIST: [{ id: "ferrari", name: "Ferrari", color: [1, 0, 0], color2: [1, 1, 1], drivers: [{ name: "A", code: "AA", num: 1 }] }] },
    Flags: { svg: () => "" }, SeasonCal: { canRace: () => true, rounds: () => 0 },
    TrackMaps: { corners: () => [], direction: () => "CW", elevRange: () => 0, drsZones: () => [], aspect: () => 1.5, elevProfile: () => null, fitCanvas: () => ({ w: 100, h: 60 }), draw() {} },
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/select-screen.js"), sb, { filename: absSrc("js/ui/select-screen.js") });
  // This card is dynamically built. Auto-creating its id skips the real button wiring.
  const $ = (id) => id === "ctx-lost-notice" && !dom.has(id) ? null : dom.byId(id);
  const overlay = $("overlay");
  const raceDoor = dom.makeElement("button", "mb-race");
  raceDoor._rect = { width: 80, height: 44 };
  overlay.appendChild(raceDoor);
  let state = "menu";
  const raceStarts = [];
  const G = {
    $,
    store: { broken: null, rev: 0, subscribe: () => () => {}, get: (_, d) => d, set: () => true, rawDel: () => true },
    cssCol: () => "#000", fmtTime: String, ttBoard: () => [], scheduleFlybyTrack() {},
    els: { overlay, select: $("select"), selTracks: $("sel-tracks"), selGo: $("sel-go"), selTitle: $("sel-title"), selTrackSection: $("sel-track-section"),
      selCircuitLabel: $("sel-circuit-label"), selPreviewMap: $("sel-preview-map"), selPreviewName: $("sel-preview-name"),
      selPreviewGp: $("sel-preview-gp"), selPreviewMeta: $("sel-preview-meta"), selPreviewRec: $("sel-preview-rec"), selTeams: $("sel-teams") },
    trackIdx: 0, teamIdx: 0, driverIdx: 0, timeTrial: false, seasonMode: false, netRoom: false, daily: null, soundOn: false,
    announce() {},
    get state() { return state; },
    set state(v) { state = v; },
    startRace() { raceStarts.push(1); return Promise.resolve(); },
  };
  const menus = sb.Menus.create(G);
  const notice = dom.document.getElementById("ctx-lost-notice");
  return { notice, G, raceStarts, dom, menus, sb };
}

test("context-loss notice hides when startRace leaves the menu", () => {
  const h = bootNoticeHarness();
  assert.equal(h.notice.hidden, false, "armed notice is visible on the menu");
  h.G.startRace();
  assert.equal(h.notice.hidden, true);
  assert.equal(h.raceStarts.length, 1);
});

test("context-loss notice hides when state leaves menu without startRace", () => {
  const h = bootNoticeHarness();
  assert.equal(h.notice.hidden, false);
  h.G.state = "count";
  assert.equal(h.notice.hidden, true);
});

test("graphics retry keeps keyboard focus on the title and activates the wired race entry", () => {
  const { notice, dom, sb, raceStarts } = bootNoticeHarness();
  vm.runInNewContext(src("js/ui/layers.js"), sb, { filename: absSrc("js/ui/layers.js") });
  vm.runInNewContext(src("js/ui/modal.js"), sb, { filename: absSrc("js/ui/modal.js") });
  for (const id of sb.UiLayers.LAYER_IDS) if (id !== "overlay") dom.byId(id).hidden = true;
  const retry = dom.byId("ctx-lost-retry");
  retry.focus();
  sb.TopModal.onFocusIn({ target: retry });
  assert.equal(dom.document.activeElement?.id, "ctx-lost-retry");
  dom.document.activeElement.click();
  assert.equal(raceStarts.length, 1);
  assert.equal(notice.hidden, true);
});

test("blocked session storage announces only a real in-page graphics reset", () => {
  const { notice, menus } = bootNoticeHarness({ storageDenied: true });
  assert.equal(notice.hidden, true);
  menus.showCtxLostNotice();
  assert.equal(notice.hidden, false);
});
