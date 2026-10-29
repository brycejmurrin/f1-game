/* hud-minimap-pitmark — TLX-PERF-HUNT-5 F1: the minimap's "P" marker is rendered
 * once per (radius, fill, ratio) into an offscreen canvas and blitted; the font
 * is set once per glyph, never per frame.
 *
 * Run: node --test tests/unit/hud-minimap-pitmark.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// The minimap left js/ui/hud.js for js/ui/hud-minimap.js (#1656); the block ends at create()'s return.
const hud = fs.readFileSync(path.join(ROOT, "js/ui/hud-minimap.js"), "utf8");
const a = hud.indexOf("const _mmPitGlyph");
const b = hud.indexOf("\nreturn {", a);
assert.ok(a > 0 && b > a, "mmPitMark block present");

function makeCtx(log) {
  return new Proxy({ log }, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => { log.push([String(k), ...args]); };
    },
    set(t, k, v) { log.push(["set:" + String(k), v]); return true; },
  });
}

function boot(ratio = 2) {
  const canvases = [];
  const sb = {
    Math, Map,
    _mmRatio: ratio,
    document: {
      createElement() {
        const log = [], cv = { width: 0, height: 0, log };
        cv.getContext = () => makeCtx(log);
        canvases.push(cv);
        return cv;
      },
    },
  };
  vm.createContext(sb);
  vm.runInContext(hud.slice(a, b) + "\nthis.mmPitMark = mmPitMark;", sb);
  return { sb, canvases };
}

test("steady-state calls blit the cached glyph: font set once, no fillText on the target", () => {
  const { sb, canvases } = boot(2);
  const tlog = [], target = makeCtx(tlog);
  for (let i = 0; i < 100; i++) sb.mmPitMark(target, 30 + i * 0.1, 40, 7, "#aeea00");
  assert.equal(canvases.length, 1, "one offscreen canvas for one (r, fill, ratio)");
  const g = canvases[0].log;
  assert.equal(g.filter((e) => e[0] === "set:font").length, 1, "font set once");
  assert.equal(g.filter((e) => e[0] === "fillText").length, 1, "glyph text drawn once");
  assert.equal(tlog.filter((e) => e[0] === "drawImage").length, 100);
  assert.equal(tlog.filter((e) => e[0] === "fillText" || e[0] === "set:font").length, 0,
    "target context never sets font or draws text");
  assert.equal(canvases[0].width, Math.ceil((2 * 7 + 2) * 2));
});

test("a new radius, fill or ratio is a new glyph; the same key is reused", () => {
  const { sb, canvases } = boot(1);
  const t = makeCtx([]);
  sb.mmPitMark(t, 1, 1, 5, "rgba(255,255,255,0.95)");
  sb.mmPitMark(t, 1, 1, 7, "#aeea00");
  sb.mmPitMark(t, 2, 2, 7, "#aeea00");
  sb.mmPitMark(t, 2, 2, 7, "#ff0000");
  assert.equal(canvases.length, 3);
});

test("falls back to the direct draw when no 2d context is available", () => {
  const { sb } = boot(1);
  sb.document.createElement = () => ({ width: 0, height: 0, getContext: () => null });
  const log = [], t = makeCtx(log);
  sb.mmPitMark(t, 5, 5, 7, "#fff");
  assert.ok(log.some((e) => e[0] === "fillText"));
});

// Run the complete module against a recording canvas. Equal sector colours
// deliberately remove colour as a source of sector identity in these cases.
function minimap(cues = false) {
  const canvases = [], targetLog = [], dataset = { cbCues: cues ? "on" : "off" };
  function context(log) {
    let dash = [];
    return new Proxy({}, {
      get(t, k) {
        if (k in t) return t[k];
        return (...args) => {
          if (k === "setLineDash") dash = Array.from(args[0]);
          log.push([String(k), ...args, ...(k === "stroke" ? [{ dash: [...dash], ink: t.strokeStyle }] : [])]);
        };
      },
      set(t, k, v) { t[k] = v; log.push(["set:" + String(k), v]); return true; },
    });
  }
  const target = context(targetLog), style = { getPropertyValue: () => "" };
  const el = { width: 0, height: 0, clientWidth: 140, clientHeight: 140, currentCSSZoom: 1, style, getContext: () => target };
  const player = { s: 0, lap: 1, lapTime: 12 }, ghost = { s: 500 };
  const G = {
    els: { minimap: el }, player, cars: [player], timeTrial: true,
    track: { total: 1200, def: { sectors: [1 / 3, 2 / 3] }, map: Array.from({ length: 12 }, (_, i) =>
      [0.5 + 0.4 * Math.cos(i * Math.PI / 6), 0.5 + 0.4 * Math.sin(i * Math.PI / 6)]) },
  };
  const sb = {
    window: { devicePixelRatio: 1 },
    document: {
      documentElement: { dataset, style }, body: { className: "", dataset: {}, classList: { contains: () => false } },
      createElement() {
        const log = [], cv = { width: 0, height: 0, log }, ctx = context(log);
        cv.getContext = () => ctx; canvases.push(cv); return cv;
      },
    },
    TrackMaps: { sectorColors: () => ["#fff", "#fff", "#fff"], drsZones: () => [] },
    GhostShare: { hasGuest: () => false }, Ghost: { hasGhost: () => true },
  };
  vm.createContext(sb);
  vm.runInContext(hud + "\nthis.HudMinimap = HudMinimap;", sb, { filename: absSrc("js/ui/hud-minimap.js") });
  const map = sb.HudMinimap.create(G, {
    vpW: () => 844, vpH: () => 390, teamCss: () => "#fff", replayGhost: () => ({ at: () => ghost }),
    motionReduced: () => true, fitKey: () => "stable",
  });
  return { map, G, ghost, dataset, canvases, targetLog };
}

test("colourblind cues OFF keeps the solid sector strokes and filled ghost dot", () => {
  const h = minimap(); h.map.draw();
  assert.equal(h.canvases.length, 1, "only the background is cached with cues off");
  assert.deepEqual(h.canvases[0].log.filter((e) => e[0] === "stroke").map((e) => e.at(-1).dash), [[], [], []]);
  assert.equal(h.canvases[0].log.some((e) => e[0] === "fillText"), false);
  assert.deepEqual(h.targetLog.filter((e) => e[0] === "arc").map((e) => e[3]), [3.4, 4]);
});

test("colourblind sectors have distinct dash patterns and cached S1/S2/S3 labels with equal inks", () => {
  const h = minimap(true); h.map.draw();
  const background = h.canvases[0].log;
  const strokes = background.filter((e) => e[0] === "stroke").map((e) => e.at(-1));
  assert.deepEqual(strokes.map((e) => e.dash), [[6, 3], [2, 3], [6, 2, 2, 2]]);
  assert.equal(new Set(strokes.map((e) => e.ink)).size, 1, "identity survives identical sector colours");
  assert.deepEqual(background.filter((e) => e[0] === "fillText").map((e) => e[1]), ["S1", "S2", "S3"]);
  const initialCanvases = h.canvases.length;
  h.map.draw();
  assert.equal(h.canvases.length, initialCanvases, "steady draw reuses labels and ghost glyph");
  assert.equal(h.targetLog.some((e) => e[0] === "fillText" || e[0] === "set:font"), false);
});

test("the ghost cue is a cached hollow G ring and invalid ghost positions stay absent", () => {
  const h = minimap(true); h.map.draw();
  const glyph = h.canvases.find((c) => c.log.some((e) => e[0] === "fillText" && e[1] === "G"));
  assert.ok(glyph, "ghost G glyph exists");
  assert.equal(glyph.log.filter((e) => e[0] === "stroke").length, 1);
  assert.equal(glyph.log.some((e) => e[0] === "fill"), false, "ring interior stays hollow");
  assert.deepEqual(h.targetLog.filter((e) => e[0] === "arc").map((e) => e[3]), [4], "player disc remains unchanged");
  h.targetLog.length = 0; h.ghost.s = NaN; h.map.draw();
  assert.equal(h.targetLog.filter((e) => e[0] === "drawImage").length, 1, "only background blits for an invalid ghost");
  assert.deepEqual(h.targetLog.filter((e) => e[0] === "arc").map((e) => e[3]), [4]);
});

test("toggling colourblind cues rebuilds the background without a layout or track change", () => {
  const h = minimap(); h.map.draw();
  h.dataset.cbCues = "on"; h.map.draw();
  assert.deepEqual(h.canvases[1].log.filter((e) => e[0] === "fillText").map((e) => e[1]), ["S1", "S2", "S3"]);
  h.dataset.cbCues = "off"; h.map.draw();
  assert.equal(h.canvases.at(-1).log.some((e) => e[0] === "fillText"), false, "OFF removes cached sector labels");
  assert.deepEqual(h.canvases.at(-1).log.filter((e) => e[0] === "stroke").map((e) => e.at(-1).dash), [[], [], []]);
});
