/* share-card.test.mjs — painter, PNG rendering and share/download delivery. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load(extra = {}) {
  const ctx = vm.createContext({ Object, Array, String, Number, Math, Promise, setTimeout, clearTimeout, ...extra });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card.js"), "utf8"), ctx);
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
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/daily-challenge.js"), "utf8"), ctx);
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
