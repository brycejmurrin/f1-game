// TLX must not keep a createTexture() source alive after the GPU has it.
//
// three keeps texture.image for the texture's whole life, and
// Texture.dispose() frees only the GPU copy. Every cached livery atlas (a
// 1024x1280 canvas, ~5 MB) stayed pinned — 48 in car-draw.js's cache plus
// whatever the decal-material cache in tsl-fx.js still referenced. tlx.js now
// swaps the source for a 1x1 stand-in from three's onUpdate hook (after the
// upload), and freeTexture retires the decal materials bound to the texture.
//
// This lifts the real helpers out of the sources (not re-implementations) and
// runs them against three r186's real Texture from the vendored core build.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
const FX = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-fx.js"), "utf8");
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.1/three.core.min.js")).href);

function slice(src, startMarker, endMarker, what) {
  const a = src.indexOf(startMarker);
  assert.notEqual(a, -1, what + ": start marker moved — update this test, do not delete it");
  const b = src.indexOf(endMarker, a);
  assert.notEqual(b, -1, what + ": end marker moved — update this test");
  return src.slice(a, b);
}

function liftRelease(fakeDocument, Bitmap = class ImageBitmap {}) {
  const body = slice(TLX, "let _texStandIn = null;", "/** create(canvas, opts)", "releaseTexSource");
  // eslint-disable-next-line no-new-func
  return new Function("document", "ImageBitmap", `"use strict";${body};return { releaseTexSource, texStandIn };`)(
    fakeDocument, Bitmap);
}
const fakeDoc = () => ({ createElement: (tag) => ({ tag, width: 300, height: 150 }) });

class Bitmap {
  constructor(src = { width: 64, height: 32 }) { this.width = src.width; this.height = src.height; this.closeCalls = 0; }
  close() { this.closeCalls++; this.width = this.height = 0; }
}

function liftTextures({ mobileTier = false, initTexture = () => {} } = {}) {
  const create = slice(TLX, "        createTexture(", "        // Upload a createTexture() handle NOW", "createTexture");
  const free = slice(TLX, "        freeTexture(t) {", "        texCensus:", "freeTexture");
  const { releaseTexSource } = liftRelease(fakeDoc(), Bitmap);
  // The real backend methods, real vendored Texture/dispose dispatcher; only GPU upload is stubbed.
  return new Function("THREE", "releaseTexSource", "mobileTier", "renderer", "fx",
    `return ({${create}${free}});`)(THREE, releaseTexSource, mobileTier, { initTexture }, null);
}

test("an owned bitmap stays open through upload and closes once when its texture is freed", () => {
  const gfx = liftTextures(), bitmap = new Bitmap();
  const h = gfx.createTexture(bitmap, { disposeSource: (source) => source.close() }), tex = h.tex;
  assert.equal(tex.image, bitmap);
  tex.onUpdate(tex);
  assert.equal(tex.image, bitmap, "three still needs the ImageBitmap identity for flipY");
  assert.equal(bitmap.closeCalls, 0, "upload must not close a retained source");
  gfx.freeTexture(h); gfx.freeTexture(h); tex.dispose();
  assert.equal(bitmap.closeCalls, 1);
  assert.equal(bitmap.width, 0);
  assert.equal((tex._listeners?.dispose || []).length, 0, "the one-shot ownership listener is removed");
});

test("owned source disposal works before upload and after eager mobile upload", () => {
  for (const mobileTier of [false, true]) {
    let uploads = 0;
    const bitmap = new Bitmap(), gfx = liftTextures({ mobileTier, initTexture: (tex) => {
      uploads++; tex.onUpdate(tex); assert.equal(bitmap.closeCalls, 0);
    } });
    const h = gfx.createTexture(bitmap, { disposeSource: (source) => source.close() });
    assert.equal(uploads, mobileTier ? 1 : 0);
    h.tex.dispose(); gfx.freeTexture(h);
    assert.equal(bitmap.closeCalls, 1);
  }
});

test("borrowed bitmaps are not closed by texture disposal", () => {
  const gfx = liftTextures(), bitmap = new Bitmap(), h = gfx.createTexture(bitmap);
  h.tex.onUpdate(h.tex); gfx.freeTexture(h);
  assert.equal(bitmap.closeCalls, 0);
  assert.equal(bitmap.width, 64);
});

test("a throwing source disposer cannot stop GPU disposal listeners or run twice", () => {
  let closes = 0, gpuDisposals = 0;
  const gfx = liftTextures(), h = gfx.createTexture(new Bitmap(), { disposeSource: () => {
    closes++; throw new Error("source already unavailable");
  } });
  h.tex.addEventListener("dispose", () => { gpuDisposals++; });
  h.tex.dispose(); h.tex.dispose();
  assert.equal(closes, 1);
  assert.equal(gpuDisposals, 2, "other dispose listeners still execute");
});

test("CarDraw transfers its hi-res bitmap lifetime through TLX eviction and invalidation", async (t) => {
  const r = carDrawVm(), gfx = liftTextures(), bitmaps = [], idle = [];
  Object.assign(r.G.gfx, gfx, { backend: "three", drawDecal() {}, uploadTexture(h) { h.tex.onUpdate?.(h.tex); } });
  r.ctx.LiveryTex = { IS_MOBILE: false, playerHiResDeferred: () => true,
    buildAtlas: (_team, _livery, _num, _player, hi) => ({ width: hi ? 2048 : 1024, height: hi ? 2560 : 1280 }) };
  r.ctx.requestIdleCallback = (fn) => { idle.push(fn); };
  r.ctx.createImageBitmap = async (src) => { const b = new Bitmap(src); bitmaps.push(b); return b; };
  for (let i = 0; i < 12; i++) {
    r.carDraw.drawCarDecals({ id: "team" + i }, new Float32Array(16), true, 1, false, true);
    while (idle.length) idle.shift()({ didTimeout: false, timeRemaining: () => 50 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(bitmaps.at(-1).closeCalls, 0, "the current livery stays usable");
    const tex = r.carDraw.getCarDecalTexture({ id: "team" + i }, 1, true).tex;
    assert.equal(tex.image, bitmaps.at(-1), "anisotropy upgrades preserve the live bitmap identity");
    assert.equal(tex.anisotropy, 8);
  }
  assert.equal(bitmaps.length, 12);
  const afterLru = bitmaps.filter((b) => b.closeCalls === 0).length;
  for (let i = 0; i < 12; i++) r.carDraw.invalidateDecalTextures("team" + i);
  t.diagnostic(JSON.stringify({ created: bitmaps.length, openAfterLru: afterLru,
    openAfterInvalidation: bitmaps.filter((b) => b.closeCalls === 0).length }));
  assert.ok(afterLru <= 6, "evicted bitmap storage must be closed, not await GC");
  assert.deepEqual(bitmaps.map((b) => b.closeCalls), Array(12).fill(1));
});

test("the source is swapped for a 1x1 stand-in without moving the texture version", () => {
  const { releaseTexSource } = liftRelease(fakeDoc());
  const atlas = { width: 1024, height: 1280, tag: "canvas" };
  const t = new THREE.Texture(atlas);
  t.onUpdate = releaseTexSource;
  t.needsUpdate = true;
  const v = t.version;
  // three calls texture.onUpdate(texture) right after the upload.
  assert.equal(t.onUpdate(t), true);
  assert.notEqual(t.image, atlas, "the atlas canvas is still referenced");
  assert.equal(t.image.width, 1);
  assert.equal(t.image.height, 1);
  assert.equal(t.version, v, "swapping the image must not schedule a re-upload");
  assert.equal(t.onUpdate, null, "the hook is one-shot");
});

test("every released texture shares one stand-in, and a second release is a no-op", () => {
  const { releaseTexSource } = liftRelease(fakeDoc());
  const a = new THREE.Texture({ width: 8, height: 8 });
  const b = new THREE.Texture({ width: 8, height: 8 });
  releaseTexSource(a); releaseTexSource(b);
  assert.equal(a.image, b.image);
  assert.equal(releaseTexSource(a), false);
});

test("ImageBitmap sources are kept (three's flipY uniform tests instanceof ImageBitmap)", () => {
  const Bitmap = class ImageBitmap {};
  const body = slice(TLX, "let _texStandIn = null;", "/** create(canvas, opts)", "releaseTexSource");
  // eslint-disable-next-line no-new-func
  const { releaseTexSource } = new Function("document", "ImageBitmap",
    `"use strict";${body};return { releaseTexSource };`)(fakeDoc(), Bitmap);
  const bmp = new Bitmap();
  const t = new THREE.Texture(bmp);
  assert.equal(releaseTexSource(t), false);
  assert.equal(t.image, bmp);
});

test("no document (worker / harness): the source is kept rather than nulled", () => {
  const { releaseTexSource } = liftRelease(undefined);
  const src = { width: 4, height: 4 };
  const t = new THREE.Texture(src);
  assert.equal(releaseTexSource(t), false);
  assert.equal(t.image, src);
});

test("createTexture wires the release hook, and uploads at creation on the mobile tier", () => {
  const body = slice(TLX, "        createTexture(src, opts) {", "        // Upload a createTexture() handle NOW", "createTexture");
  assert.match(body, /t\.onUpdate = releaseTexSource;/);
  assert.ok(body.indexOf("t.onUpdate = releaseTexSource") < body.indexOf("t.needsUpdate = true"),
    "the hook must be set before the upload can run");
  // liverytex.js paints every phone atlas on ONE scratch canvas: a deferred
  // upload would copy whichever car was painted last.
  assert.match(body, /if \(mobileTier\) \{ try \{ renderer\.initTexture\(t\); \}/);
  const lt = fs.readFileSync(path.join(ROOT, "js/car/liverytex.js"), "utf8");
  assert.match(lt, /IS_MOBILE = typeof GLX !== "undefined" && !!GLX\.mobileTier/,
    "liverytex's scratch gate changed — re-check TLX's eager-upload gate matches it");
  assert.match(TLX, /const mobileTier = \(typeof GLX !== "undefined" && !!GLX\.mobileTier\);/);
});

test("freeTexture retires the decal materials bound to the texture", () => {
  const free = slice(TLX, "        freeTexture(t) {", "        texCensus:", "freeTexture");
  assert.match(free, /fx\.releaseTexture\(t\.tex\)/);
  assert.ok(free.indexOf("fx.releaseTexture") < free.indexOf("t.tex.dispose()"));

  const body = slice(FX, "    function releaseTexture(tex) {", "    function decalMaterialFor(tex, glow) {", "releaseTexture");
  assert.match(FX, /decalMaterialFor, releaseTexture,/, "releaseTexture is not exported from TLXShaders.fx");
  const decalCache = new Map(), _evicted = [], _fxMats = [];
  // eslint-disable-next-line no-new-func
  const releaseTexture = new Function("decalCache", "_evicted", "_fxMats",
    `"use strict";${body};return releaseTexture;`)(decalCache, _evicted, _fxMats);
  const texA = { id: 1 }, texB = { id: 2 };
  const mA0 = { map: texA }, mA1 = { map: texA }, mB = { map: texB };
  decalCache.set("1|0", mA0); decalCache.set("1|0.35", mA1); decalCache.set("2|0", mB);
  _fxMats.push(mA0, mB, mA1);
  assert.equal(releaseTexture(texA), 2);
  assert.deepEqual([...decalCache.keys()], ["2|0"]);
  assert.deepEqual(_evicted, [mA0, mA1], "disposal is deferred to present(), like the LRU eviction");
  assert.deepEqual(_fxMats, [mB], "the SSR-MRT registry must not pin a retired material");
  assert.equal(releaseTexture(null), 0);
});
