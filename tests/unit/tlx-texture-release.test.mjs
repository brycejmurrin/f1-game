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

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
const FX = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-fx.js"), "utf8");
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.186.0/three.core.min.js")).href);

function slice(src, startMarker, endMarker, what) {
  const a = src.indexOf(startMarker);
  assert.notEqual(a, -1, what + ": start marker moved — update this test, do not delete it");
  const b = src.indexOf(endMarker, a);
  assert.notEqual(b, -1, what + ": end marker moved — update this test");
  return src.slice(a, b);
}

function liftRelease(fakeDocument) {
  const body = slice(TLX, "let _texStandIn = null;", "/** create(canvas, opts)", "releaseTexSource");
  // eslint-disable-next-line no-new-func
  return new Function("document", "ImageBitmap", `"use strict";${body};return { releaseTexSource, texStandIn };`)(
    fakeDocument, class ImageBitmap {});
}
const fakeDoc = () => ({ createElement: (tag) => ({ tag, width: 300, height: 150 }) });

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
  const body = slice(TLX, "        createTexture(src) {", "        // Upload a createTexture() handle NOW", "createTexture");
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
