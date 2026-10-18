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

function liftTextures({ mobileTier = false, initTexture = () => {}, fx = null } = {}) {
  const create = slice(TLX, "        createTexture(", "        // Upload a createTexture() handle NOW", "createTexture");
  const free = slice(TLX, "        freeTexture(t) {", "        texCensus:", "freeTexture");
  const pool = slice(TLX, "      const _texPool = [];", "      let envCubeCam = null;", "texture pool");
  const { releaseTexSource, texStandIn } = liftRelease(fakeDoc(), Bitmap);
  // The real backend methods and retired-texture pool, real vendored Texture/dispose dispatcher;
  // only GPU upload is stubbed. `pool`/`stat`/`age` expose the pool for the reuse tests below.
  return new Function("THREE", "releaseTexSource", "texStandIn", "mobileTier", "renderer", "fx", "ImageBitmap",
    `${pool}return ({${create}${free} pool: _texPool, stat: _texStat, age: ageTexPool });`)(
    THREE, releaseTexSource, texStandIn, mobileTier, { initTexture }, fx, Bitmap);
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

test("freeTexture retires the decal materials bound to the texture when it is disposed", () => {
  const free = slice(TLX, "        freeTexture(t) {", "        texCensus:", "freeTexture");
  assert.match(free, /retireTexture\(t\.tex,/);
  const pool = slice(TLX, "      const _texPool = [];", "      let envCubeCam = null;", "texture pool");
  const disposeBody = slice(pool, "function disposePooled(t) {", "function retireTexture(", "disposePooled");
  assert.ok(disposeBody.indexOf("fx.releaseTexture(t)") >= 0 && disposeBody.indexOf("fx.releaseTexture(t)") < disposeBody.indexOf("t.dispose()"));

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

// ── RETIRED TEXTURES ARE REUSED (garage livery edits; WebKit #76225) ─────────────────────────────
// A livery edit frees and re-creates the same-sized atlases. freeTexture parks the texture in a
// small pool and the next createTexture of the SAME size re-fills it in place (three r186 re-uploads
// a version bump into the existing GPU texture), so N edits cost 0 new GPU textures after the first.
const canvas = (w = 1024, h = 1280) => ({ width: w, height: h, tag: "canvas" });
function poolRig() {
  const released = [], disposed = [];
  const gfx = liftTextures({ fx: { releaseTexture: (t) => released.push(t) } });
  const watch = (h) => { h.tex.addEventListener("dispose", () => disposed.push(h.tex)); return h; };
  return { gfx, released, disposed, watch };
}

test("N same-size free/create cycles allocate ONE texture and re-fill it in place", () => {
  const { gfx, disposed } = poolRig();
  const first = gfx.createTexture(canvas()), T = first.tex;
  T.onUpdate(T);
  let h = first;
  for (let i = 0; i < 50; i++) {
    gfx.freeTexture(h);
    const src = canvas();
    h = gfx.createTexture(src);
    assert.equal(h.tex, T, `edit ${i + 1}: the retired texture is reused`);
    assert.equal(h.tex.image, src, "the new source is the image to upload");
    assert.ok(h.tex.version > 1, "needsUpdate moved the version: three re-uploads in place");
    assert.equal(typeof h.tex.onUpdate, "function", "the reused texture drops its source after the next upload too");
    h.tex.onUpdate(h.tex);
  }
  assert.deepEqual({ made: gfx.stat.made, reused: gfx.stat.reused }, { made: 1, reused: 50 });
  assert.equal(disposed.length, 0);
});

test("a different size or source kind never takes a pooled texture", () => {
  const { gfx } = poolRig();
  const a = gfx.createTexture(canvas(1024, 1280));
  gfx.freeTexture(a);
  const pooled = gfx.pool[0].t;
  assert.notEqual(gfx.createTexture(canvas(512, 640)).tex, pooled, "size differs");
  assert.notEqual(gfx.createTexture(new Bitmap({ width: 1024, height: 1280 })).tex, pooled,
    "a bitmap never takes a canvas texture (three's flipY path differs by source kind)");
  assert.equal(gfx.pool.length, 1, "still parked for the next same-size canvas");
  assert.equal(gfx.createTexture(canvas(1024, 1280)).tex, pooled);
});

test("an owned bitmap (car-draw's hi-res swap) closes when its texture is retired, and the texture takes the next one", () => {
  const { gfx, released } = poolRig();
  const b1 = new Bitmap({ width: 2048, height: 2560 }), b2 = new Bitmap({ width: 2048, height: 2560 });
  const close = (src) => src.close();
  const h1 = gfx.createTexture(b1, { disposeSource: close }), T = h1.tex;
  T.onUpdate(T);
  gfx.freeTexture(h1);
  assert.equal(b1.closeCalls, 1, "retired = released: the bitmap storage is not held by the pool");
  assert.equal((T._listeners?.dispose || []).length, 0, "its dispose listener went with it");
  const h2 = gfx.createTexture(b2, { disposeSource: close });
  assert.equal(h2.tex, T, "same size, same kind: re-filled in place");
  assert.equal(T.image, b2);
  assert.equal(b2.closeCalls, 0);
  gfx.age(performance.now() + 60000);   // nothing pooled: the live texture is untouched
  assert.equal(b2.closeCalls, 0);
  gfx.freeTexture(h2); gfx.age(performance.now() + 60000);
  assert.equal(b2.closeCalls, 1, "closed exactly once when the texture finally dies");
  assert.deepEqual(released, [T], "and only then its decal materials go");
  assert.deepEqual({ made: gfx.stat.made, reused: gfx.stat.reused, disposed: gfx.stat.disposed }, { made: 1, reused: 1, disposed: 1 });
});

test("a source with no size is disposed on free, never parked", () => {
  const { gfx, released } = poolRig();
  const h = gfx.createTexture({ tag: "sizeless" }), t = h.tex;
  gfx.freeTexture(h);
  assert.equal(gfx.pool.length, 0);
  assert.deepEqual(released, [t]);
});

test("the pool is bounded and ages out: the oldest is disposed, with its decal materials", () => {
  const { gfx, released } = poolRig();
  const hs = [1, 2, 3, 4, 5, 6].map((i) => gfx.createTexture(canvas(64 * i, 64)));
  const texes = hs.map((h) => h.tex);
  for (const h of hs) gfx.freeTexture(h);
  assert.equal(gfx.pool.length, 4, "TEX_POOL_MAX");
  assert.deepEqual(released, texes.slice(0, 2), "only the disposed lose their decal materials; a pooled one keeps it for the next fill");
  for (const h of hs.slice(2)) assert.equal(h.tex, null);
  gfx.age(performance.now() + 60000);
  assert.equal(gfx.pool.length, 0, "an idle pool empties: a race never carries the garage's atlases");
  assert.deepEqual(released, texes);
  assert.equal(gfx.stat.disposed, 6);
});

test("a parked texture drops its CPU source", () => {
  const { gfx } = poolRig();
  const src = canvas(), h = gfx.createTexture(src), t = h.tex;   // freed before any upload
  gfx.freeTexture(h);
  assert.notEqual(t.image, src, "the canvas is not pinned by the pool");
  assert.equal(t.image.width, 1);
  assert.equal(t.onUpdate, null);
});
