/* livery-hires-release.test.mjs — the desktop hi-res (2048×2560) livery atlas canvas is released
 * (#7516). LiveryTex.buildAtlas reuses ONE hi-res canvas; car-draw.js's deferred hi-res finish()
 * hands it back through LiveryTex.releaseAtlas once the bitmap / GPU copy owns the pixels, which
 * frees the backing store (width 0). A canvas a texture still reads (TLX before upload) is kept
 * and no longer reused.
 *
 * Run: node --test tests/unit/livery-hires-release.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadCrests } from "../../tools/car/crest-sweep.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { RecCtx } = loadCrests();

function loadAtlas() {
  const canvases = [];
  const sb = {
    console, Math, Object, Array, String, Number, JSON, Map, Set, isNaN, isFinite, parseInt, parseFloat,
    document: { querySelector: () => null,
                createElement: () => {
                  const rec = new RecCtx();
                  const c = { getContext: () => rec, width: 0, height: 0 };
                  canvases.push(c);
                  return c;
                } },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/data/teams.js", "js/car/liveries.js", "js/car/crest-paths.js", "js/car/livery-graphics.js", "js/car/crest-draw.js", "js/car/liverytex.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: absSrc(f) });
  const LT = vm.runInContext("LiveryTex", sb);
  const live = () => canvases.filter((c) => c.width > 0 && c.height > 0).length;
  return { LT, canvases, live, hiRes: () => LT.buildAtlas("ferrari", {}, 16, true, true) };
}

test("two hi-res builds, each handed back after upload, leave at most one live canvas", () => {
  const A = loadAtlas();
  assert.equal(A.LT.IS_MOBILE, false, "node has no UA: the desktop path");
  const a = A.hiRes();
  assert.equal(a.width, A.LT.SIZE, "the hi-res atlas is the authored 2048");
  A.LT.releaseAtlas(a, false);
  assert.equal(a.width, 0, "released: the backing store is freed");
  const b = A.hiRes();
  assert.equal(b, a, "the next hi-res build reuses the one canvas");
  assert.ok(A.live() <= 1, `${A.live()} live canvases of non-zero size`);
  A.LT.releaseAtlas(b, false);
  assert.equal(A.live(), 0);
});

test("a build while the hi-res canvas is busy gets its own; a pinned canvas is kept and not reused", () => {
  const A = loadAtlas();
  assert.equal(A.LT.IS_MOBILE, false);
  const a = A.hiRes();
  const b = A.hiRes();
  assert.notEqual(b, a, "a busy canvas is never repainted under a pending upload");
  A.LT.releaseAtlas(b, false);
  A.LT.releaseAtlas(a, true);
  assert.equal(a.width, A.LT.SIZE, "a texture still reads a pinned canvas: its pixels stay");
  const c = A.hiRes();
  assert.notEqual(c, a, "a pinned canvas is not reused");
  A.LT.releaseAtlas(c, false);
  assert.ok(A.live() <= 1);
});

test("car-draw.js hands the hi-res canvas back after its upload, and on a build that never finished", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  assert.match(src, /releaseAtlas\(canvas, !bitmap && !!\(next && next\.tex && next\.tex\.image === canvas\)\)/,
    "finish() releases unless a TLX texture still reads the canvas");
  assert.match(src, /fail\(e\);\s*releaseAtlas\(canvas, false\);/);
});
