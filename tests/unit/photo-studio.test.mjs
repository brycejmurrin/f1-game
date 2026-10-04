/* PhotoStudio: camera borrowing, readback ordering, bounded composition,
 * cancellation and local persistence failure, without renderer hardware. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
const source = fs.readFileSync(new URL("../../js/ui/photo-studio.js", import.meta.url), "utf8").replace(/^const PhotoStudio/m, "var PhotoStudio");
function boot(options = {}) {
  const dom = makeDom(), order = [], downloads = [], canvasOps = [], storage = new Map();
  const create = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = create(tag);
    if (tag === "canvas") {
      el.getContext = () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (image) => canvasOps.push(["pixels", image.data[0]]),
        drawImage: (...args) => canvasOps.push(["draw", ...args.slice(1)]),
        fillRect: (...args) => canvasOps.push(["caption", ...args]), fillText: () => {},
      });
      el.toDataURL = () => "data:image/jpeg;base64,ZmFrZQ==";
      el.toBlob = (cb) => options.encode ? options.encode(cb) : cb(options.nullBlob ? null : new Blob(["photo"], { type: "image/png" }));
    }
    if (tag === "a") el.click = () => downloads.push(el.download);
    return el;
  };
  let closed = 0, restored = null, overlays = true, current = options.priorCamera || { open: false };
  const G = { $: dom.byId, canvas: dom.byId("game"), track: { name: "Monza" }, photoMode: !!options.priorPhoto,
    photoCam: { pos: [1, 2, 3], yaw: 1, pitch: 0.3, fov: 60 },
    gfx: { capturePixels: () => { order.push("read"); return options.readback || Promise.resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4).fill(123) }); } } };
  const freeCam = {
    state: () => current,
    setOverlaysVisible: (on) => { overlays = on; },
    enterFrom: () => { order.push("enter"); G.photoMode = true; return true; },
    panel: () => dom.byId("freecam-inner"),
    close: (_pause, keep) => { closed++; order.push("close"); if (!keep) G.photoMode = false; },
    cmd: (v) => { current = v; restored = v; },
  };
  const garage = { snapshot: () => ({ az: 1, spin: true }), shot: (v) => order.push("shot:" + v), restore: (v) => { restored = v; order.push("restore"); } };
  const ctx = vm.createContext({ document: dom.document, window: { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} },
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => { if (options.storageFull) throw new Error("Quota"); storage.set(k, v); }, removeItem: (k) => storage.delete(k) },
    CustomEvent: class {}, URL: { createObjectURL: () => "blob:photo", revokeObjectURL: () => {} },
    Log: { warn: () => {} }, setTimeout: () => 0, Blob, Uint8ClampedArray,
    createImageBitmap: options.bitmap || (async () => ({ width: 1024, height: 768, close: () => {} })) });
  vm.runInContext(fs.readFileSync(new URL("../../js/ui/setting-row.js", import.meta.url), "utf8"), ctx);
  ctx.SettingRow = ctx.window.SettingRow;
  vm.runInContext(source, ctx);
  const PS = ctx.PhotoStudio, api = PS.create(G, { freeCam, garage, renderFrame: () => order.push("draw") });
  return { api, PS, dom, order, downloads, canvasOps, G, storage, closed: () => closed, restored: () => restored, overlays: () => overlays };
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const turn = () => new Promise((resolve) => setImmediate(resolve));
test("centre crops preserve composition across aspect ratios and filenames stay safe", () => {
  const { PS } = boot();
  assert.deepEqual(plain(PS.crop(1600, 900, "square")), { x: 350, y: 0, width: 900, height: 900 });
  assert.deepEqual(plain(PS.crop(1600, 900, "portrait")), { x: 440, y: 0, width: 720, height: 900 });
  assert.equal(PS.crop(1600, 900, "scene").width, 1600);
  assert.equal(PS.filename("../../My <Monza> Photo!"), "apex26-my-monza-photo.png");
});
test("capture draws before reading a live backbuffer, omits DOM overlays and downloads actual image", async () => {
  const b = boot(); assert.equal(b.api.open({ source: "race" }), true);
  assert.equal(await b.api.capture(), true);
  assert.deepEqual(b.order.slice(-2), ["draw", "read"]);
  assert.equal(b.canvasOps[0][0], "pixels"); assert.equal(b.canvasOps[0][1], 123);
  assert.equal(b.api.state().captured, true);
  await b.api.exportPhoto(); assert.deepEqual(b.downloads, ["apex26-photo.png"]);
  b.api.close(true); assert.equal(b.closed(), 1); assert.equal(b.G.photoMode, false);
});
test("software presentation is awaited while raw pixels are captured before compositing", async () => {
  const b = boot(); let present;
  b.G.gfx.softPresent = () => true;
  b.G.gfx.invalidateSoftPresent = () => b.order.push("invalidate");
  b.G.gfx.awaitSoftPresent = () => { b.order.push("wait"); return new Promise((resolve) => { present = resolve; }); };
  b.api.open(); const pending = b.api.capture();
  assert.deepEqual(b.order.slice(-4), ["invalidate", "wait", "draw", "read"]);
  assert.equal(b.canvasOps.length, 0, "composition waits for the presentation result"); present(); await pending;
  assert.equal(b.order.at(-1), "read");
});
test("a backend without readback falls back to an immediate canvas copy", async () => {
  const b = boot(); b.G.canvas.width = 160; b.G.canvas.height = 90;
  b.G.gfx.capturePixels = () => { b.order.push("read-unavailable"); return Promise.reject(new Error("No readback target")); };
  b.api.open(); assert.equal(await b.api.capture(), true);
  assert.deepEqual(b.order.slice(-3), ["draw", "read-unavailable", "draw"]);
  assert.equal(b.canvasOps[0][0], "draw");
});
test("closing while readback is pending prevents an obsolete capture entering a reopened studio", async () => {
  let resolve; const b = boot({ readback: new Promise((r) => { resolve = r; }) });
  b.api.open(); const pending = b.api.capture(); b.api.close(false); b.api.open({ source: "garage" });
  resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) });
  assert.equal(await pending, false); assert.equal(b.api.state().captured, false); assert.equal(b.api.state().busy, false);
});
test("a delayed save retains its original photo and cannot clear a reopened capture's busy state", async () => {
  let encode, read;
  const b = boot({ encode: (cb) => { encode = cb; } });
  b.api.open({ metadata: { title: "Old Monza photo" } }); await b.api.capture();
  const saved = b.api.savePhoto();
  b.api.close(false); b.api.open({ source: "garage", metadata: { title: "New garage" } }); await turn();
  const libraryBefore = b.dom.byId("ps-library").children[0];
  b.G.gfx.capturePixels = () => new Promise((r) => { read = r; });
  const captured = b.api.capture();
  encode(new Blob(["old photo"], { type: "image/jpeg" })); await saved;
  assert.equal(b.api.state().busy, true, "old finally cannot enable a new operation's buttons");
  assert.match(b.dom.byId("ps-message").textContent, /Capturing/);
  assert.equal(b.dom.byId("ps-library").children[0], libraryBefore, "old save cannot repaint the current library");
  read({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) }); await captured;
  b.api.close(false); b.api.open({ source: "garage" }); await turn();
  assert.equal(b.dom.byId("ps-library").children[0].children[1].textContent, "Old Monza photo", "persisted entry retains its initiating context");
});
test("garage camera snapshot is restored and a borrowed FreeCam returns only on normal exit", () => {
  const garage = boot(); garage.api.open({ source: "garage" }); garage.api.close(true);
  assert.deepEqual(plain(garage.restored()), { az: 1, spin: true }); assert.equal(garage.closed(), 0);
  const prior = { open: true, speed: 25, roll: 5, lens: "flyby", eye: [1, 2, 3], target: [4, 5, 6], fov: 40 };
  const b = boot({ priorCamera: prior }); b.api.open(); b.api.close(true);
  assert.equal(b.restored(), prior); assert.equal(b.closed(), 0);
  b.api.open(); b.api.close(false); assert.equal(b.closed(), 1, "lifecycle teardown must hand ownership back to the game");
});
test("pre-existing photo mode keeps its pose on normal exit", () => {
  const b = boot({ priorPhoto: true }); b.api.open(); b.G.photoCam.pos[0] = 99; b.api.close(true);
  assert.equal(b.G.photoMode, true); assert.deepEqual(b.G.photoCam.pos, [1, 2, 3]);
});
test("an import finishing after close is discarded and its bitmap is released", async () => {
  let resolve, disposed = 0;
  const b = boot({ bitmap: () => new Promise((r) => { resolve = r; }) }); b.api.open({ source: "garage" });
  const file = b.dom.byId("ps-import"); file.files = [{ type: "image/jpeg", size: 1000 }]; file.dispatchEvent({ type: "change" });
  b.api.close(false); b.api.open({ source: "garage" });
  resolve({ width: 1024, height: 768, close: () => disposed++ }); await turn();
  assert.equal(disposed, 1); assert.equal(b.api.state().captured, false); assert.equal(b.api.state().busy, false);
});
test("missing IndexedDB uses a visit-only library and localStorage quota failure remains recoverable", async () => {
  const b = boot({ storageFull: true }); b.api.open({ source: "garage" }); await b.api.capture(); await b.api.savePhoto();
  assert.match(b.dom.byId("ps-message").textContent, /this visit/);
  assert.equal(b.dom.byId("ps-library").children.length, 1);
  assert.equal(b.PS.setBackground("data:image/jpeg;base64,ZmFrZQ=="), false);
  assert.equal(b.PS.setBackground("javascript:alert(1)"), false);
  assert.equal(b.api.state().busy, false);
});
test("failed PNG encoding reports a recoverable error instead of creating a bogus download", async () => {
  const b = boot({ nullBlob: true }); b.api.open(); await b.api.capture(); await b.api.exportPhoto();
  assert.equal(b.downloads.length, 0); assert.match(b.dom.byId("ps-message").textContent, /could not be encoded/);
});

test("Studio uses canonical sheet regions and enumerated controls with a persistent capture/done footer", () => {
  const b = boot(); b.api.open();
  const panel = b.dom.byId("ps-panel"), body = b.dom.byId("ps-body");
  assert.deepEqual(panel.children.map((el) => el.className), ["sheet-head", "sheet-body pane", "sheet-foot"]);
  assert.equal(b.dom.byId("ps-close").parentElement, panel.children[2]);
  assert.equal(b.dom.byId("ps-capture").parentElement, panel.children[2]);
  assert.equal(b.dom.byId("ps-capture").classList.contains("bigbtn"), true);
  assert.equal(body.contains(b.dom.byId("ps-export")), true);
  const frame = b.dom.byId("ps-aspect"); frame.value = "portrait"; b.dom.dispatch(frame, { type: "change" });
  assert.equal(b.api.state().aspect, "portrait");
  b.dom.byId("ps-aspect-row-next").click(); assert.equal(b.api.state().aspect, "scene");
  const caption = b.dom.byId("ps-postcard"); caption.value = "on"; b.dom.dispatch(caption, { type: "change" });
  assert.equal(b.api.state().postcard, true);
});
test("Studio suspends a borrowed FreeCam's guides and restores them on returning to its owner", () => {
  const b = boot({ priorCamera: { open: true } }); b.api.open();
  assert.equal(b.overlays(), false); b.api.close(true); assert.equal(b.overlays(), true);
});
