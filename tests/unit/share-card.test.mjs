/* share-card.test.mjs — painter, PNG rendering and share/download delivery. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load(extra = {}) {
  const ctx = vm.createContext({ Object, Array, String, Number, Math, Promise, setTimeout, clearTimeout, ...extra });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card.js"), "utf8"), ctx, { filename: absSrc("js/share/share-card.js") });
  return vm.runInContext("ShareCard", ctx);
}

function recordingContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push(["save"]); }, restore() { calls.push(["restore"]); },
    fillRect(...a) { calls.push(["fillRect", ...a]); },
    fillText(...a) { calls.push(["fillText", ...a]); },
    beginPath() { calls.push(["beginPath"]); }, moveTo(...a) { calls.push(["moveTo", ...a]); },
    lineTo(...a) { calls.push(["lineTo", ...a]); }, stroke() { calls.push(["stroke"]); },
    set fillStyle(v) { calls.push(["fillStyle", v]); }, set strokeStyle(v) { calls.push(["strokeStyle", v]); },
    set lineWidth(v) { calls.push(["lineWidth", v]); }, set font(v) { calls.push(["font", v]); },
    set textAlign(v) { calls.push(["textAlign", v]); }, set textBaseline(v) { calls.push(["textBaseline", v]); },
  };
}

test("paint executes layout ops on a generic 2D context", () => {
  const card = load(), ctx = recordingContext();
  card.paint(ctx, [
    { op: "rect", x: 0, y: 0, width: 20, height: 10, color: "#000" },
    { op: "text", x: 3, y: 4, text: "APEX 26", size: 12, color: "#fff", align: "left" },
    { op: "line", x: 1, y: 2, x2: 9, y2: 8, color: "#f00", lineWidth: 2 },
  ]);
  assert.ok(ctx.calls.some((c) => c[0] === "fillRect"));
  assert.ok(ctx.calls.some((c) => c[0] === "fillText" && c[1] === "APEX 26"));
  assert.ok(ctx.calls.some((c) => c[0] === "stroke"));
});

test("deliver shares a PNG file when supported", async () => {
  const card = load({ File: class File { constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = opts.type; } } });
  const shared = [], downloaded = [];
  const result = await card.deliver({ size: 4, type: "image/png" }, "daily.png",
    { title: "Daily", text: "Result", url: "https://example.test" },
    { navigator: { canShare: ({ files }) => files[0].name === "daily.png", share: async (value) => shared.push(value) },
      download: async (...args) => downloaded.push(args) });
  assert.equal(result, "shared");
  assert.equal(shared.length, 1);
  assert.equal(downloaded.length, 0);
});

test("deliver treats AbortError as choice and falls back on other share failures", async () => {
  const File = class File { constructor(parts, name, opts) { this.name = name; this.type = opts.type; } };
  const blob = { size: 4, type: "image/png" }, downloaded = [];
  const cancelled = load({ File });
  assert.equal(await cancelled.deliver(blob, "x.png", {}, {
    navigator: { canShare: () => true, share: async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; } },
    download: async (...args) => downloaded.push(args),
  }), "cancelled");
  assert.equal(downloaded.length, 0);

  const fallback = load({ File });
  assert.equal(await fallback.deliver(blob, "x.png", {}, {
    navigator: { canShare: () => true, share: async () => { throw new Error("blocked"); } },
    download: async (...args) => downloaded.push(args),
  }), "downloaded");
  assert.equal(downloaded.length, 1);
});

test("results-sheet exposes SHARE CARD beside the daily copy chip", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/ui/results-sheet.js"), "utf8");
  assert.match(src, /res-card-share/);
  assert.match(src, /G\.daily\.card\(\)/);
});

test("deliver reports native sharing, cancellation and real failures", async () => {
  const blob = { size: 4, type: "image/png" }, calls = [];
  let failure = null;
  const card = load({ NativeDownload: {
    viable: () => true,
    async saveBlob(...args) { calls.push(args); if (failure) throw failure; },
    isCancelled: (error) => error.name === "AbortError" || error.message === "Share canceled.",
  } });
  assert.equal(await card.deliver(blob, "daily.png"), "shared");
  assert.deepEqual(calls[0], [blob, "daily.png"]);
  failure = Object.assign(new Error("cancel"), { name: "AbortError" });
  assert.equal(await card.deliver(blob, "daily.png"), "cancelled");
  failure = new Error("Share canceled.");
  assert.equal(await card.deliver(blob, "daily.png"), "cancelled");
  failure = new Error("Filesystem write failed");
  await assert.rejects(card.deliver(blob, "daily.png"), (error) => error === failure);
});

test("Daily Challenge exposes a delivery hook built from its canonical result", async () => {
  const rendered = [], delivered = [];
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isFinite,
    Log: { info() {} },
    Hash32: {
      fnv1a(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; },
      mix(x) { x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return (x ^ (x >>> 16)) >>> 0; },
    },
    Tracks: { LIST: [{ id: "spa", name: "SPA" }], SEASON: [{ id: "spa", name: "SPA" }] },
    ShareCardData: { fromDaily(...args) { rendered.push(["model", ...args]); return { kind: "daily" }; } },
    ShareCard: {
      async render(model, spec) { rendered.push(["render", model, spec]); return { type: "image/png", size: 7 }; },
      async deliver(...args) { delivered.push(args); return "downloaded"; },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/daily-challenge.js"), "utf8"), ctx, { filename: absSrc("js/race/daily-challenge.js") });
  const Daily = vm.runInContext("DailyChallenge", ctx);
  const disk = new Map(), G = {
    store: { get: (k, d) => disk.has(k) ? disk.get(k) : d, set: (k, v) => disk.set(k, v) },
    fmtTime: (t) => t.toFixed(3), ttDistance: 1, seed: 1,
    records: { key: () => null, restoreDaily() {}, prepareDaily() {} }, startRace() {},
  };
  const daily = Daily.create(G);
  daily.open("2026-10-17");
  daily.record(81.345);
  assert.equal(await daily.shareCard("gold"), "downloaded");
  assert.equal(rendered[0][0], "model");
  assert.equal(rendered[0][1].trackId, "spa");
  assert.equal(rendered[0][2].best, 81.345);
  assert.equal(rendered[1][0], "render");
  assert.equal(rendered[1][2], "portrait");
  assert.match(delivered[0][1], /^apex26-daily-2026-10-17\.png$/);
});

// render(): the REAL ShareCardLayout + NetQr + ShareCard over a recording OffscreenCanvas.
test("render awaits the card font, paints the layout with a real QR, encodes PNG and frees the canvas", async () => {
  const fills = [], texts = [], fontsAsked = [], canvases = [];
  const ctx2d = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillRect(...a) { fills.push(a); }, fillText(t) { texts.push(String(t)); },
    measureText: (t) => ({ width: String(t).length * 10 }),
    set fillStyle(_) {}, set strokeStyle(_) {}, set lineWidth(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {},
  };
  class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; canvases.push(this); }
    getContext(kind) { assert.equal(kind, "2d"); return ctx2d; }
    convertToBlob(o) { return Promise.resolve({ type: o.type, size: this.width * this.height }); }
  }
  const sb = vm.createContext({ Object, Array, String, Number, Math, Promise, setTimeout, clearTimeout, Uint8Array, TextEncoder, OffscreenCanvas });
  for (const f of ["js/net/qr.js", "js/share/share-card-layout.js", "js/share/share-card.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: absSrc(f) });
  const card = vm.runInContext("ShareCard", sb);
  const link = "https://example.test/#share=APXD1.x";
  const model = { kind: "daily", trackName: "Spa-Francorchamps", title: "DAILY", hero: { label: "BEST", value: "1:21.345", medal: "GOLD", streak: 4 },
    rows: [], link, displayName: "DRIVER 7" };
  const doc = { fonts: { load: (f) => { fontsAsked.push(f); return Promise.resolve([]); } } };
  const blob = await card.render(model, "portrait", { document: doc });
  assert.deepEqual(fontsAsked, ["700 48px 'Barlow Condensed'"], "the paint face is awaited");
  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, 1080 * 1350, "encoded at the portrait spec's size");
  assert.deepEqual([canvases[0].width, canvases[0].height], [0, 0], "the canvas is released after encoding");
  assert.ok(texts.includes("1:21.345"), "the hero time is painted: " + texts.join(" | "));
  const qr = vm.runInContext("NetQr", sb).encode(link);
  assert.ok(qr && qr.size >= 21, "the link encodes");
  const dark = qr.modules.reduce((n, m) => n + (m ? 1 : 0), 0);
  // One background square for the QR plus one fillRect per dark module, all one size.
  const unit = fills.filter((r) => r[2] === r[3] && r[2] > 0);
  const bySize = new Map();
  for (const r of unit) bySize.set(r[2], (bySize.get(r[2]) || 0) + 1);
  assert.ok([...bySize.values()].some((n) => n === dark), `a fillRect per dark QR module (${dark}) — sizes ${JSON.stringify([...bySize])}`);
  // Fonts are awaited once per page: a second render does not reload them.
  await card.render(model, "square", { document: doc });
  assert.equal(fontsAsked.length, 1);
});

test("a solo share card loads only the QR encoder before painting its link", async () => {
  const injected = [], fills = [];
  let sb;
  const context2d = {
    save() {}, restore() {}, fillText() {}, measureText: (t) => ({ width: String(t).length * 10 }),
    fillRect(...args) { fills.push(args); },
    set fillStyle(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {},
  };
  class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return context2d; }
    convertToBlob() { return Promise.resolve({ type: "image/png" }); }
  }
  const document = {
    getElementById: () => null,
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild(el) {
      injected.push(el.src);
      queueMicrotask(() => {
        vm.runInContext(fs.readFileSync(path.join(ROOT, "js/net/qr.js"), "utf8"), sb, { filename: absSrc("js/net/qr.js") });
        el.onload();
      });
    } },
  };
  sb = vm.createContext({ Object, Array, String, Number, Math, Promise, setTimeout, clearTimeout,
    Uint8Array, TextEncoder, OffscreenCanvas, document,
    window: { __APEX_BUILD: "test", setTimeout, clearTimeout },
    ApexRoster: { DEFERRED_EDGES: [] },
  });
  for (const file of ["js/core/script-loader.js", "js/share/share-card-layout.js", "js/share/share-card.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sb, { filename: absSrc(file) });
  const card = vm.runInContext("ShareCard", sb);
  const link = "https://example.test/#share=APXD1.x";
  const model = { title: "DAILY", trackName: "Spa", hero: { label: "BEST", value: "1:21.345" }, link };
  const blob = await card.render(model, "portrait");
  assert.equal(blob.type, "image/png");
  assert.deepEqual(injected, ["js/net/qr.js?v=test"], "solo share does not load the multiplayer bundle");
  assert.ok(fills.length > 100, "QR modules were painted before encoding the PNG");
});

// H3-11 (2026-10-22): the card painted a light-on-dark QR, and a decoder that
// never tries inversion (many Android camera scanners) could not read it.
// Paint every spec's whole card into pixels and decode it non-inverted.
test("the painted share-card QR decodes without inversion on every spec", async () => {
  const { default: jsQR } = await import("jsqr");
  const sb = vm.createContext({ Object, Array, String, Number, Math, Promise, Uint8Array, TextEncoder });
  for (const f of ["js/net/qr.js", "js/share/share-card-layout.js", "js/share/share-card.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: absSrc(f) });
  const card = vm.runInContext("ShareCard", sb), L = vm.runInContext("ShareCardLayout", sb);
  const link = "https://brycejmurrin.github.io/f1-game/#ghost=" + "Ab3_x".repeat(30);
  for (const spec of Object.keys(L.SPECS)) {
    const { width: W, height: H } = L.SPECS[spec];
    const px = new Uint8ClampedArray(W * H * 4);
    let fill = [0, 0, 0];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
      measureText: (t) => ({ width: String(t).length * 10 }),
      set fillStyle(c) { fill = [1, 3, 5].map((i) => parseInt(String(c).slice(i, i + 2), 16)); },
      set strokeStyle(_) {}, set lineWidth(_) {}, set font(_) {}, set textAlign(_) {}, set textBaseline(_) {},
      fillRect(x, y, w, h) {
        for (let j = Math.max(0, Math.floor(y)); j < Math.min(H, Math.floor(y + h)); j++)
          for (let i = Math.max(0, Math.floor(x)); i < Math.min(W, Math.floor(x + w)); i++) {
            const k = (j * W + i) * 4; px[k] = fill[0]; px[k + 1] = fill[1]; px[k + 2] = fill[2]; px[k + 3] = 255;
          }
      },
    };
    card.paint(ctx, L.layout({ title: "DAILY", trackName: "Spa", hero: { label: "BEST", value: "1:21.345" }, link }, spec));
    const read = jsQR(px, W, H, { inversionAttempts: "dontInvert" });
    assert.equal(read && read.data, link, spec + ": a scanner that never inverts reads the card's QR");
  }
});

// A DOM just deep enough for the chip and its preview <dialog>.
function fakeDom() {
  const byId = new Map();
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.style = { setProperty() {} }; this.parent = null; this.listeners = {}; }
    set id(v) { this._id = v; byId.set(v, this); } get id() { return this._id; }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    appendChild(n) { n.parent = this; this.children.push(n); return n; }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k]; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
    get isConnected() { let n = this; while (n.parent) n = n.parent; return n === body; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const body = new Node("body");
  const document = { body, activeElement: null, createElement: (tag) => new Node(tag) };
  return { document, byId, body };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function loadChips(card, dom = fakeDom()) {
  const warned = [];
  const ctx = vm.createContext({ Object, Array, String, Promise, Math, setTimeout,
    document: dom.document, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    ShareCardData: {}, ShareCard: card, Log: { warn: (...a) => warned.push(a) } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-chips.js"), "utf8"), ctx, { filename: absSrc("js/share/share-card-chips.js") });
  return { chips: vm.runInContext("ShareCardChips", ctx), warned, dom };
}
function fakeCard(seen, outcomes) {
  return {
    canShareFiles: () => true,
    extension: (blob) => blob.type === "image/jpeg" ? ".jpg" : ".png",
    render: async (model, spec) => { seen.push(["render", model.title, spec]); return { type: "image/png", size: 90 * 1024 }; },
    deliver: async (blob, name, share) => { seen.push(["deliver", name, share.retry]); return outcomes.shift(); },
    download: async (blob, name) => { seen.push(["download", name]); },
  };
}

test("SHARE CARD opens a preview sheet: alt text, polite status, size redraw, second-tap share", async () => {
  const seen = [];
  const { chips, dom } = loadChips(fakeCard(seen, ["blocked", "shared"]));
  const parent = dom.body.appendChild(dom.document.createElement("div"));
  let built = 0;
  const btn = chips.append(parent, "res-race-card", () => ({ title: "RACE RESULT", trackName: "SPA", subtitle: "", link: null,
    hero: null, rows: [{ pos: 1, code: "AAA", name: "A Driver", value: "+25 PTS" }], n: ++built }), "Race / Spa-Francorchamps!");
  assert.equal(btn.className, "sel-chip");
  assert.equal(built, 0, "the model is built on tap, not when the screen draws");
  const done = btn.onclick();
  await tick();
  const dlg = dom.byId.get("share-card-preview");
  assert.ok(dlg && dlg.open && dlg.isConnected, "a modal dialog opens");
  assert.equal(dlg.className, "screen dim");
  assert.equal(dom.byId.get("scp-img").alt, "RACE RESULT. SPA. P1 AAA A Driver +25 PTS. Unofficial fan game card.");
  const status = dom.byId.get("scp-status");
  assert.equal(status.getAttribute("aria-live"), "polite");
  assert.equal(status.textContent, "Card ready — portrait, 90 KB.");
  assert.equal(dom.byId.get("scp-size-portrait").getAttribute("aria-pressed"), "true");
  dom.byId.get("scp-size-landscape").onclick();
  await tick();
  assert.equal(dom.byId.get("scp-size-landscape").getAttribute("aria-pressed"), "true");
  await dom.byId.get("scp-save").onclick();
  await dom.byId.get("scp-share").onclick();
  assert.equal(status.textContent, "Tap SHARE again to open the share sheet.");
  assert.ok(dlg.isConnected, "NotAllowedError keeps the sheet open for a second tap");
  await dom.byId.get("scp-share").onclick();
  await done;
  assert.equal(dlg.isConnected, false);
  assert.equal(btn.textContent, "SHARED");
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [
    ["render", "RACE RESULT", "portrait"], ["render", "RACE RESULT", "landscape"],
    ["download", "apex26-race-spa-francorchamps-landscape.png"],
    ["deliver", "apex26-race-spa-francorchamps-landscape.png", true], ["deliver", "apex26-race-spa-francorchamps-landscape.png", true]]);
  assert.equal(built, 1);
  assert.equal(chips.slug(""), "card");
});

test("the preview says so when a card is over the byte budget, and CLOSE resolves cancelled", async () => {
  const card = fakeCard([], []);
  card.canShareFiles = () => false;
  card.render = async () => { throw Object.assign(new Error("big"), { code: "too-large" }); };
  const { chips, dom } = loadChips(card);
  const done = chips.preview(() => ({ title: "X", rows: [] }), "x");
  await tick();
  assert.equal(dom.byId.get("scp-status").textContent, "This card is too large to share. Try another size.");
  assert.equal(dom.byId.get("scp-share").hidden, true, "no SHARE where nothing can share files");
  dom.byId.get("scp-close").onclick();
  assert.equal(await done, "cancelled");
  assert.equal(dom.byId.get("share-card-preview").isConnected, false);
});

test("ShareCardChips: a failed draw says UNAVAILABLE and logs; a cancel restores the label", async () => {
  const { chips, warned } = loadChips({});
  const failing = chips.chip("x", async () => { throw new Error("no canvas"); });
  await failing.onclick();
  assert.equal(failing.textContent, "UNAVAILABLE");
  assert.equal(failing.disabled, false);
  assert.equal(warned.length, 1);
  const cancelled = chips.chip("y", async () => "cancelled");
  await cancelled.onclick();
  assert.equal(cancelled.textContent, "SHARE CARD");
  const missing = vm.createContext({ Object, Array, String, Promise });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-chips.js"), "utf8"), missing, { filename: absSrc("js/share/share-card-chips.js") });
  assert.equal(vm.runInContext("ShareCardChips.append({ appendChild() { throw new Error('drawn'); } }, 'z', () => ({}), 'n')", missing), null,
    "no chip when the card modules are absent");
});

test("paint strokes a path op as one polyline", () => {
  const card = load(), ctx = recordingContext();
  ctx.lineJoin = "";
  card.paint(ctx, [{ op: "path", points: [0, 0, 5, 5, 10, 0], color: "#e10600", lineWidth: 3 }]);
  const names = ctx.calls.map((c) => c[0]);
  assert.deepEqual(names.filter((n) => n === "moveTo" || n === "lineTo"), ["moveTo", "lineTo", "lineTo"]);
  assert.ok(names.includes("stroke"));
});

test("deliver: canShare false downloads, AbortError is silent, NotAllowedError asks the preview for a second tap", async () => {
  const File = class File { constructor(parts, name, opts) { this.name = name; this.type = opts.type; } };
  const blob = { size: 4, type: "image/png" };
  const notAllowed = () => { throw Object.assign(new Error("activation"), { name: "NotAllowedError" }); };
  const run = async (nav, share) => {
    const downloaded = [];
    const result = await load({ File }).deliver(blob, "x.png", share, { navigator: nav, download: async (...a) => downloaded.push(a) });
    return [result, downloaded.length];
  };
  assert.deepEqual(await run({ canShare: () => false, share: async () => assert.fail("never shares") }, {}), ["downloaded", 1]);
  assert.deepEqual(await run({ canShare: () => true, share: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); } }, {}), ["cancelled", 0]);
  assert.deepEqual(await run({ canShare: () => true, share: async () => notAllowed() }, { retry: true }), ["blocked", 0]);
  assert.deepEqual(await run({ canShare: () => true, share: async () => notAllowed() }, {}), ["downloaded", 1], "no preview: still a file");
  const card = load({ File });
  assert.equal(card.canShareFiles({ navigator: { canShare() {}, share() {} }, File }), true);
  assert.equal(card.canShareFiles({ navigator: {}, File }), false);
  assert.equal(card.extension({ type: "image/jpeg" }), ".jpg");
  assert.equal(card.extension({ type: "image/png" }), ".png");
});

test("render keeps a card under the 1.5 MB budget: JPEG once, then a refusal", async () => {
  const layoutCtx = vm.createContext({ Object, Array, String, Number, Math });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-layout.js"), "utf8"), layoutCtx, { filename: absSrc("js/share/share-card-layout.js") });
  const sizes = { png: 0, jpeg: 0 }, asked = [];
  class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return Object.assign(recordingContext(), { measureText: (t) => ({ width: String(t).length * 10 }) }); }
    async convertToBlob(opts) { asked.push(opts); const jpeg = opts.type === "image/jpeg"; return { type: opts.type, size: jpeg ? sizes.jpeg : sizes.png }; }
  }
  const card = load({ OffscreenCanvas, ShareCardLayout: vm.runInContext("ShareCardLayout", layoutCtx) });
  const model = { title: "T", subtitle: "", trackName: "X", rows: [], hero: { label: "L", value: "1:00.000" }, link: null };
  assert.equal(card.MAX_BYTES, 1.5 * 1024 * 1024);
  sizes.png = 200 * 1024;
  assert.equal((await card.render(model, "square")).type, "image/png");
  sizes.png = 2 * 1024 * 1024; sizes.jpeg = 600 * 1024;
  const jpeg = await card.render(model, "square");
  assert.equal(jpeg.type, "image/jpeg");
  assert.deepEqual(JSON.parse(JSON.stringify(asked.at(-1))), { type: "image/jpeg", quality: 0.85 });
  sizes.jpeg = 1.6 * 1024 * 1024;
  await assert.rejects(card.render(model, "landscape"), (error) => error.code === "too-large");
});
