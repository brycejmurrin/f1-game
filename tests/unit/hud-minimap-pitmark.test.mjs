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
