/* ctx-lost-retry-reload — exhausted ctx-loss Retry reloads instead of startRace. */
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

function bootRetryHarness({ needReload = true } = {}) {
  const dom = makeDom();
  dom.body.insertAdjacentHTML = () => {};
  const reloads = [];
  const ss = {
    getItem(k) { return this[k] ?? null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  };
  ss.setItem("apex26.ctxLostNotice", "1");
  if (needReload) ss.setItem("apex26.ctxLostNeedReload", "1");
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, sessionStorage: ss, location: { reload() { reloads.push(1); } },
    addEventListener() {}, removeEventListener() {},
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
  const $ = (id) => dom.byId(id);
  const raceStarts = [];
  const G = {
    $,
    store: { broken: null, rev: 0, subscribe: () => () => {}, get: (_, d) => d, set: () => true, rawDel: () => true },
    cssCol: () => "#000", fmtTime: String, ttBoard: () => [], scheduleFlybyTrack() {},
    els: { select: $("select"), selTracks: $("sel-tracks"), selGo: $("sel-go"), selTitle: $("sel-title"), selTrackSection: $("sel-track-section"),
      selCircuitLabel: $("sel-circuit-label"), selPreviewMap: $("sel-preview-map"), selPreviewName: $("sel-preview-name"),
      selPreviewGp: $("sel-preview-gp"), selPreviewMeta: $("sel-preview-meta"), selPreviewRec: $("sel-preview-rec"), selTeams: $("sel-teams") },
    trackIdx: 0, teamIdx: 0, driverIdx: 0, timeTrial: false, seasonMode: false, netRoom: false, daily: null, soundOn: false,
    announce() {},
    state: "menu",
    startRace() { raceStarts.push(1); return Promise.resolve(); },
  };
  sb.Menus.create(G).showCtxLostNotice();
  return { reloads, raceStarts, retry: dom.byId("ctx-lost-retry"), ss };
}

test("ctx-lost Retry reloads once when the context is still lost", () => {
  const h = bootRetryHarness({ needReload: true });
  h.retry.click();
  assert.deepEqual(h.reloads, [1]);
  assert.equal(h.raceStarts.length, 0);
  assert.equal(h.ss["apex26.ctxLostNeedReload"], undefined);
  assert.equal(h.ss["apex26.ctxLostNotice"], "1");
});

test("ctx-lost Retry still starts a race when no reload is required", () => {
  const h = bootRetryHarness({ needReload: false });
  h.retry.click();
  assert.deepEqual(h.reloads, []);
  assert.equal(h.raceStarts.length, 1);
});

test("select-screen exposes exhausted card copy", () => {
  const menus = fs.readFileSync(path.join(ROOT, "js/ui/select-screen.js"), "utf8");
  assert.ok(menus.includes("Graphics keep resetting — reload or pick another RENDERER"));
  assert.ok(menus.includes("apex26.ctxLostExhausted"));
});
