/* select-preview-defer.test.mjs — cold updateTrackPreview must not call
 * TrackMaps.corners/draw on the open's synchronous turn (D·DP5). Captions
 * paint; maps wait on cache / idle / worker.
 *
 * Run: node --test tests/unit/select-preview-defer.test.mjs
 */
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

function boot(o = {}) {
  const dom = makeDom();
  dom.body.insertAdjacentHTML = () => {};
  const data = new Map();
  const store = {
    broken: null, rev: 0, subscribe: () => () => {},
    get: (k, d) => (data.has(k) ? JSON.parse(data.get(k)) : d),
    set: (k, v) => { if (v === undefined) data.delete(k); else data.set(k, JSON.stringify(v)); store.rev++; return true; },
    rawDel: (k) => { data.delete(k); return true; },
  };
  const LIST = [{
    id: "monza", name: "Monza", country: "Italy", gp: "Italian GP",
    lengthKm: 5.793, path: { pts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  }];
  let cornersCalls = 0, drawCalls = 0;
  const cached = o.cached ? ["monza"] : [];
  const idleFns = [];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date,
    parseFloat, parseInt, isFinite, Infinity,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, addEventListener() {}, removeEventListener() {},
    setTimeout: (fn) => { idleFns.push(fn); return idleFns.length; },
    clearTimeout() {},
    requestIdleCallback: (fn) => { idleFns.push(fn); return idleFns.length; },
    cancelIdleCallback() {},
    getComputedStyle: () => ({ getPropertyValue: () => "", display: "flex", flexDirection: "row", gridTemplateColumns: "none", paddingTop: "0px", paddingBottom: "0px" }),
    innerWidth: 1000, innerHeight: 600, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    devicePixelRatio: 1,
    Tracks: { LIST },
    Teams: { LIST: [] },
    Flags: { svg: () => "" },
    SeasonCal: { canRace: () => true, rounds: () => 0 },
    TrackMaps: {
      cachedIds: () => cached.slice(),
      corners: () => { cornersCalls++; return [{ n: 1, v: 0.1, r: 50, ang: 90 }]; },
      direction: () => "CW",
      elevRange: () => 10,
      drsZones: () => [{ a: 0.1, b: 0.2 }],
      elevProfile: () => null,
      aspect: () => 1.5,
      fitCanvas: () => ({ w: 100, h: 60 }),
      draw() { drawCalls++; },
    },
    TrackBuildClient: o.worker || { enabled: () => false },
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/select-screen.js"), sb, { filename: absSrc("js/ui/select-screen.js") });
  const $ = (id) => dom.byId(id);
  // Ensure preview DOM the create() path reads.
  for (const id of ["sel-preview-name", "sel-preview-gp", "sel-preview-meta", "sel-preview-rec", "sel-preview-map", "sel-hero", "sel-still"]) {
    if (!$ (id)) {
      const e = dom.document.createElement(id === "sel-preview-map" ? "canvas" : "div");
      e.id = id;
      dom.document.body.appendChild(e);
    }
  }
  const hero = $("sel-hero");
  Object.defineProperty(hero, "clientWidth", { get: () => 400 });
  Object.defineProperty(hero, "clientHeight", { get: () => 240 });
  hero.closest = () => ({ dataset: { density: "normal" } });
  const G = {
    $, store, cssCol: () => "#000", fmtTime: String, ttBoard: () => [], tickUi() {},
    scheduleFlybyTrack() {}, getLiveryId: () => "default", getLiveries: () => [],
    els: {
      select: $("select") || dom.document.body,
      selTracks: $("sel-tracks") || dom.document.body,
      selGo: $("sel-go"),
      selTitle: $("sel-title"),
      selTrackSection: $("sel-track-section"),
      selCircuitLabel: $("sel-circuit-label"),
      selPreviewMap: $("sel-preview-map"),
      selPreviewName: $("sel-preview-name"),
      selPreviewGp: $("sel-preview-gp"),
      selPreviewMeta: $("sel-preview-meta"),
      selPreviewRec: $("sel-preview-rec"),
      selTeams: $("sel-teams") || dom.document.body,
    },
    trackIdx: 0, teamIdx: 0, driverIdx: 0, timeTrial: false, seasonMode: false,
    netRoom: false, daily: null, soundOn: false, announce() {}, buildSetup() {},
  };
  const menus = sb.Menus.create(G);
  return {
    G, menus, idleFns,
    stats: () => ({ cornersCalls, drawCalls }),
    flushIdle() { while (idleFns.length) idleFns.shift()(); },
  };
}

test("cold updateTrackPreview does not sync-call TrackMaps.corners or draw", () => {
  const { G, menus, stats } = boot();
  menus.updateTrackPreview();
  const s = stats();
  assert.equal(s.cornersCalls, 0, "corners must wait for idle/worker on a cold cache");
  assert.equal(s.drawCalls, 0, "draw must wait for idle/worker on a cold cache");
  assert.ok(String(G.els.selPreviewName.textContent).includes("Monza"));
});

test("cached TrackMaps paints maps synchronously", () => {
  const { menus, stats } = boot({ cached: true });
  menus.updateTrackPreview();
  const s = stats();
  assert.ok(s.cornersCalls >= 1, "cache hit paints maps on this turn");
  assert.ok(s.drawCalls >= 1, "cache hit draws the outline on this turn");
});

test("idle flush runs the deferred map paint", () => {
  const { menus, stats, flushIdle } = boot();
  menus.updateTrackPreview();
  assert.equal(stats().cornersCalls, 0);
  flushIdle();
  assert.ok(stats().cornersCalls >= 1, "idle callback must paint maps");
  assert.ok(stats().drawCalls >= 1, "idle callback must draw");
});
