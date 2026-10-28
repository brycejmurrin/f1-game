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
  assert.match(src, /G\.daily\.shareCard/);
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

// render(): the REAL ShareCardLayout + NetQr + ShareCard over a recording
// OffscreenCanvas. No test called render, ensureFonts or the QR painter before.
test("render waits on both card fonts, paints the layout with a real QR, encodes PNG and frees the canvas", async () => {
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
  assert.deepEqual(fontsAsked, ["700 48px 'Barlow Condensed'", "600 24px 'Titillium Web'"], "both card fonts are awaited");
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
  assert.equal(fontsAsked.length, 2);
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

function loadChips(card) {
  const warned = [];
  const ctx = vm.createContext({ Object, Array, String, Promise,
    document: { createElement: (tag) => ({ tag, appended: [] }) },
    ShareCardData: {}, ShareCard: card, Log: { warn: (...a) => warned.push(a) } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-chips.js"), "utf8"), ctx, { filename: absSrc("js/share/share-card-chips.js") });
  return { chips: vm.runInContext("ShareCardChips", ctx), warned };
}

test("ShareCardChips: a tap renders at tap time, names the file safely and reports the outcome", async () => {
  const seen = [];
  const { chips } = loadChips({
    render: async (model, spec) => { seen.push(["render", model.title, spec]); return { type: "image/png" }; },
    deliver: async (blob, name, share) => { seen.push(["deliver", name, share.title]); return "downloaded"; },
  });
  const parent = { children: [], appendChild(n) { this.children.push(n); } };
  let built = 0;
  const btn = chips.append(parent, "res-race-card", () => ({ title: "RACE RESULT " + ++built, link: null }), "Race / Spa-Francorchamps!");
  assert.equal(parent.children[0], btn);
  assert.equal(btn.className, "sel-chip");
  assert.equal(btn.textContent, "SHARE CARD");
  assert.equal(built, 0, "the model is built on tap, not when the screen draws");
  await btn.onclick();
  assert.deepEqual(seen, [["render", "RACE RESULT 1", "portrait"], ["deliver", "apex26-race-spa-francorchamps.png", "APEX 26"]]);
  assert.equal(btn.textContent, "DOWNLOADED");
  assert.equal(btn.disabled, false);
  assert.equal(chips.slug(""), "card");
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
