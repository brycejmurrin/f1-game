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
    Log: { warn: () => {} }, setTimeout: () => 0, queueMicrotask, requestAnimationFrame: options.requestAnimationFrame || ((fn) => fn()), Blob, Uint8ClampedArray, indexedDB: options.indexedDB,
    createImageBitmap: options.bitmap || (async () => ({ width: 1024, height: 768, close: () => {} })) });
  vm.runInContext(fs.readFileSync(new URL("../../js/ui/setting-row.js", import.meta.url), "utf8"), ctx);
  ctx.SettingRow = ctx.window.SettingRow;
  vm.runInContext(source, ctx);
  const PS = ctx.PhotoStudio, api = PS.create(G, { freeCam, garage, renderFrame: () => order.push("draw") });
  return { api, PS, dom, order, downloads, canvasOps, G, storage, closed: () => closed, restored: () => restored, overlays: () => overlays };
}
// One shared object store, with serialized transactions and staged writes. A
// request's success is distinct from commit, and abort discards every staged
// mutation, so these tests exercise isolation and rollback rather than callbacks
// that immediately mutate a Map. Real multi-tab IndexedDB is the browser gate.
function photoDb(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, row])), queue = [], failures = [];
  let active = false, hold = null, release = null, writes = 0;
  const start = () => {
    if (active || !queue.length) return;
    active = true; const state = queue.shift(), tx = state.tx;
    let staged = new Map(rows), ended = false;
    const finish = (error) => {
      if (ended) return; ended = true;
      if (error) { tx.error = error; if (tx.onabort) tx.onabort(); }
      else {
        if (state.mode === "readwrite") { rows.clear(); for (const row of staged) rows.set(...row); }
        if (tx.oncomplete) tx.oncomplete();
      }
      active = false; start();
    };
    tx.abort = () => finish(tx.error || new Error("Transaction aborted"));
    const step = () => {
      if (ended) return;
      const op = state.ops.shift();
      if (!op) {
        if (failures[0] === "commit" && state.mode === "readwrite") { failures.shift(); finish(new Error("Injected commit failure")); return; }
        if (state.held) { release = () => finish(); state.held(); }
        else finish();
        return;
      }
      if (failures[0] === op.kind) {
        failures.shift(); op.req.error = new Error("Injected " + op.kind + " failure");
        if (tx.onerror) tx.onerror({ target: op.req });
        setImmediate(() => finish(op.req.error)); return;
      }
      op.req.result = op.kind === "getAll" ? [...staged.values()] : op.kind === "put" ? (staged.set(op.value.id, op.value), op.value.id) : (staged.delete(op.value), undefined);
      if (op.req.onsuccess) op.req.onsuccess();
      setImmediate(step);
    };
    setImmediate(step);
  };
  const db = { close() {}, transaction(_store, mode) {
    const tx = { error: null }, state = { tx, mode, ops: [], held: mode === "readwrite" ? hold : null };
    if (mode === "readwrite") { writes++; hold = null; }
    const request = (kind, value) => {
      if (kind === "delete" && failures[0] === "delete-sync") { failures.shift(); throw new Error("Injected delete enqueue failure"); }
      const req = {}; state.ops.push({ kind, value, req }); return req;
    };
    tx.objectStore = () => ({ getAll: () => request("getAll"), put: (v) => request("put", v), delete: (v) => request("delete", v) });
    queue.push(state); setImmediate(start); return tx;
  } };
  return {
    rows, get writes() { return writes; }, failNext(kind) { failures.push(kind); },
    holdNextCommit() { return new Promise((resolve) => { hold = resolve; }); },
    releaseCommit() { const done = release; release = null; done(); },
    open() { const req = { result: db }; queueMicrotask(() => { if (req.onsuccess) req.onsuccess(); }); return req; },
  };
}
const seededPhotos = (n) => Array.from({ length: n }, (_, i) => ({ id: "old-" + i, at: i, title: "Old " + i, thumb: "data:image/jpeg;base64,ZmFrZQ==", blob: new Blob(["old"]) }));
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
test("DONE paints a busy state before restoring the scene (Escape door stays live)", () => {
  const frames = [], events = [];
  const b = boot({ requestAnimationFrame: (fn) => frames.push(fn) });
  b.api.open({ source: "garage", back: () => {
    events.push(b.dom.document.body.classList.contains("photo-studio-open") ? "class-on" : "class-off");
    events.push(b.dom.byId("photo-studio").hidden ? "hidden" : "visible");
    events.push("restored");
  } });
  b.api.close(true);
  assert.equal(b.api.state().busy, true);
  assert.equal(b.dom.byId("ps-close").disabled, false, "DONE stays the Escape door while CLOSING… paints");
  assert.equal(b.dom.byId("ps-close").textContent, "CLOSING…");
  assert.equal(b.dom.byId("ps-panel").getAttribute("aria-busy"), "true");
  assert.equal(b.dom.byId("photo-studio").hidden, false, "studio stays up so CLOSING… can paint");
  assert.ok(b.dom.document.body.classList.contains("photo-studio-open"));
  assert.deepEqual(events, []);
  assert.equal(b.order.includes("restore"), false);
  // A second DONE/Escape during CLOSING… must no-op (st.closing guard), not hang.
  b.api.close(true);
  assert.equal(frames.length, 1, "a second close while closing does not queue another restore");
  frames.shift()();
  assert.equal(b.order.includes("restore"), true);
  assert.deepEqual(events, ["class-off", "hidden", "restored"], "portrait rotate-device can read display after photo-studio-open is gone");
  assert.equal(b.dom.byId("photo-studio").hidden, true);
  assert.equal(b.api.state().busy, false);
  assert.equal(b.dom.byId("ps-close").textContent, "DONE");
});
test("DONE waits until after the caller's first restored paint before focusing", async () => {
  const frames = [], events = [], b = boot({ requestAnimationFrame: (fn) => frames.push(fn) });
  const overlay = b.dom.byId("overlay"), opener = b.dom.document.createElement("button"); overlay.appendChild(opener);
  const nativeFocus = opener.focus; let visible = true;
  opener.focus = () => { events.push(overlay.inert || !visible ? "blocked" : "focused"); if (!overlay.inert && visible) nativeFocus(); };
  opener.focus(); events.length = 0;
  b.api.open({ source: "home", back: () => queueMicrotask(() => { overlay.inert = false; events.push("isolated"); }) });
  overlay.inert = true; visible = false; b.api.close(true);
  assert.equal(b.dom.byId("ps-close").textContent, "CLOSING…");
  frames.shift()();
  await Promise.resolve();
  assert.deepEqual(events, ["isolated"], "the microtask settles isolation while visibility still prevents focus");
  assert.equal(b.dom.document.activeElement === b.dom.byId("ps-close"), true);
  frames.shift()();
  assert.deepEqual(events, ["isolated"], "the first frame must not focus while visibility remains hidden");
  assert.equal(frames.length, 1, "only one further frame is scheduled");
  visible = true; events.push("visible"); while (frames.length) frames.shift()();
  assert.deepEqual(events, ["isolated", "visible", "focused"]); assert.equal(b.dom.document.activeElement === opener, true);
});
test("queued opener focus cannot steal focus from a reopened Studio or a detached caller", () => {
  const frames = [], b = boot({ requestAnimationFrame: (fn) => frames.push(fn) });
  const opener = b.dom.document.createElement("button"); b.dom.document.body.appendChild(opener); opener.focus();
  b.api.open({ source: "home" }); b.api.close(true); frames.shift()(); frames.shift()(); b.api.open({ source: "garage" });
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === b.dom.byId("ps-close"), true, "reopening between frames cancels opener focus");
  b.api.close(false); opener.focus(); b.api.open({ source: "home" }); b.api.close(true); frames.shift()();
  b.api.open({ source: "garage" }); b.api.close(false); b.dom.byId("overlay").focus();
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === b.dom.byId("overlay"), true, "a new generation invalidates focus even after it closes");
  b.api.close(false); opener.focus(); b.api.open({ source: "home" }); b.api.close(true); frames.shift()(); opener.remove();
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === b.dom.byId("ps-close"), true, "a detached opener is no longer a focus target");
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

test("concurrent Studio saves in separate instances keep exactly six durable photos", async () => {
  const idb = photoDb(seededPhotos(6)), a = boot({ indexedDB: idb }), b = boot({ indexedDB: idb });
  a.api.open({ metadata: { title: "Tab A" } }); b.api.open({ metadata: { title: "Tab B" } });
  await Promise.all([a.api.capture(), b.api.capture()]);
  await Promise.all([a.api.savePhoto(), b.api.savePhoto()]);
  assert.equal(idb.rows.size, 6);
  assert.equal(idb.writes, 2, "each save has one atomic write transaction");
  assert.deepEqual([...idb.rows.values()].filter((row) => /^Tab /.test(row.title)).map((row) => row.title).sort(), ["Tab A", "Tab B"]);
  assert.equal(idb.rows.has("old-0"), false); assert.equal(idb.rows.has("old-1"), false);
});
test("saving repairs a previously oversized library in the same transaction", async () => {
  const idb = photoDb(seededPhotos(9)), b = boot({ indexedDB: idb });
  b.api.open(); await b.api.capture(); await b.api.savePhoto();
  assert.equal(idb.rows.size, 6); assert.equal(idb.writes, 1);
  assert.deepEqual([...idb.rows.keys()].filter((id) => id.startsWith("old-")).sort(), ["old-4", "old-5", "old-6", "old-7", "old-8"]);
});
test("save remains busy and unannounced until the write transaction commits", async () => {
  const idb = photoDb(seededPhotos(6)), b = boot({ indexedDB: idb });
  b.api.open(); await b.api.capture(); const held = idb.holdNextCommit(), saving = b.api.savePhoto(); await held;
  assert.equal(b.api.state().busy, true); assert.doesNotMatch(b.dom.byId("ps-message").textContent, /Saved to My Photos/);
  assert.deepEqual([...idb.rows.keys()], seededPhotos(6).map((p) => p.id), "request success has not changed durable rows");
  idb.releaseCommit(); await saving;
  assert.equal(b.api.state().busy, false); assert.match(b.dom.byId("ps-message").textContent, /Saved to My Photos/);
});
test("put, prune, and commit failures roll back all durable changes and retain a visit-only photo", async () => {
  for (const failure of ["put", "delete", "delete-sync", "commit"]) {
    const seed = seededPhotos(6), idb = photoDb(seed), b = boot({ indexedDB: idb });
    b.api.open(); await b.api.capture(); idb.failNext(failure); await b.api.savePhoto();
    assert.deepEqual([...idb.rows.keys()], seed.map((p) => p.id), failure + " cannot commit a partial save or prune");
    assert.match(b.dom.byId("ps-message").textContent, /Saved for this visit/);
    assert.equal(b.api.state().busy, false);
    assert.equal(b.dom.byId("ps-library").children[0].children[1].textContent, "Photo");
  }
});

test("equal timestamps prune deterministically by ID instead of request or enumeration order", async () => {
  const seed = seededPhotos(8).map((row) => ({ ...row, at: 1 })).reverse(), idb = photoDb(seed), b = boot({ indexedDB: idb });
  b.api.open(); await b.api.capture(); await b.api.savePhoto();
  assert.deepEqual([...idb.rows.keys()].filter((id) => id.startsWith("old-")).sort(), ["old-3", "old-4", "old-5", "old-6", "old-7"]);
});
test("a committed save from a closed Studio retains its original metadata without touching a reopened session", async () => {
  const idb = photoDb(), b = boot({ indexedDB: idb });
  b.api.open({ metadata: { title: "Earlier session" } }); await b.api.capture();
  const held = idb.holdNextCommit(), saving = b.api.savePhoto(); await held;
  b.api.close(false); b.api.open({ source: "garage", metadata: { title: "Current session" } });
  let read; b.G.gfx.capturePixels = () => new Promise((resolve) => { read = resolve; });
  const capturing = b.api.capture(); idb.releaseCommit(); await saving;
  assert.equal([...idb.rows.values()][0].title, "Earlier session");
  assert.equal(b.api.state().busy, true); assert.match(b.dom.byId("ps-message").textContent, /Capturing/);
  read({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) }); await capturing;
});
test("the SUBJECT row shows only when the door offers one, and hands the other pick back without changing anything itself", async () => {
  const b = boot(), picks = [];
  const group = b.dom.byId("ps-subject-row").parentElement, sel = b.dom.byId("ps-subject");
  assert.equal(b.api.open({ source: "garage" }), true);
  assert.equal(group.hidden, true, "a garage or race door offers no subject");
  assert.equal(b.api.state().subject, false);
  b.api.close(false);
  assert.equal(b.api.open({ source: "home", subject: (v) => { picks.push(v); return Promise.resolve(true); } }), true);
  assert.equal(group.hidden, false);
  assert.equal(b.api.state().subject, true);
  assert.equal(sel.value, "garage", "a Home garage opens on GARAGE");
  sel.value = "garage"; sel.dispatchEvent({ type: "change" });
  assert.deepEqual(picks, [], "re-picking the shown subject is not a switch");
  sel.value = "circuit"; sel.dispatchEvent({ type: "change" });
  assert.deepEqual(picks, ["circuit"], "the pick goes to the door; the studio swaps nothing itself");
  assert.equal(b.api.state().source, "home", "still open on the garage until the door reopens it");
  b.api.close(false);
  assert.equal(b.api.open({ source: "home-track", subject: (v) => { picks.push(v); return Promise.resolve(true); } }), true);
  assert.equal(sel.value, "circuit", "a Home circuit opens on CIRCUIT");
  b.api.close(false);
  assert.equal(b.api.open({ source: "race" }), true);
  assert.equal(group.hidden, true, "the pause-menu door (already on the circuit) offers no subject");
  b.api.close(false);
});

test("leaks #1: closing the studio releases the composed canvas and its preview source", async () => {
  const b = boot(); assert.equal(b.api.open({ source: "race" }), true);
  assert.equal(await b.api.capture(), true);
  const preview = b.dom.byId("ps-preview"), removed = [], remove = preview.removeAttribute;
  preview.removeAttribute = (k) => { removed.push(k); return remove.call(preview, k); };   // mini-dom keeps `src` as a plain property
  assert.ok(preview.src, "preview holds the thumbnail while open"); assert.equal(b.api.state().captured, true);
  b.api.close(true);
  assert.equal(b.api.state().captured, false, "`last` canvas is dropped");
  assert.deepEqual(removed, ["src"], "the ~640x360 JPEG data URL is dropped"); assert.equal(preview.hidden, true);
  await b.api.exportPhoto(); assert.deepEqual(b.downloads, [], "nothing left to export after close");
});
