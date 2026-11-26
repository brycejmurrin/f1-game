/* share-card-chips.test.mjs — #6874: busy guards on the preview sheet, QR stays in its tile. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function node(tag) {
  const n = { tag, children: [], dataset: {}, style: { setProperty() {} }, attrs: {}, disabled: false, hidden: false, isConnected: true, open: false,
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, focus() {}, remove() { this.isConnected = false; },
    showModal() { this.open = true; }, close() { this.open = false; } };
  return n;
}
function harness() {
  const nodes = {};
  const document = { activeElement: null, body: node("body"),
    createElement(t) { const n = node(t); return new Proxy(n, { set(o, k, v) { o[k] = v; if (k === "id") nodes[v] = o; return true; } }); } };
  const calls = { download: 0, deliver: [] };
  const sb = vm.createContext({ Object, Array, String, Number, Math, Promise, setTimeout, document,
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} }, Log: { warn() {} } });
  const api = { renders: [], deliverGate: null, downloadImpl: null };
  sb.ShareCardData = {};
  sb.ShareCard = {
    canShareFiles: () => true, extension: () => ".png",
    render: () => new Promise((res) => api.renders.push(() => res({ size: 2048 }))),
    deliver: () => api.deliverGate(),
    download: () => { calls.download++; return api.downloadImpl(); },
  };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-chips.js"), "utf8"), sb, { filename: absSrc("js/share/share-card-chips.js") });
  return { sb, nodes, api, calls, chips: vm.runInContext("ShareCardChips", sb) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const model = () => ({ title: "T", rows: [], link: "https://x.test/" });

test("R8: a finished share does not clear the busy state of a newer draw", async () => {
  const h = harness();
  h.chips.preview(model, "n", "t");
  h.api.renders.shift()(); await tick();
  assert.equal(h.nodes["scp-share"].disabled, false);
  let finish; h.api.deliverGate = () => new Promise((r) => { finish = r; });
  h.nodes["scp-share"].onclick(); await tick();
  h.nodes["scp-size-square"].onclick(); await tick();   // newer draw in flight
  assert.equal(h.nodes["scp-share"].disabled, true);
  finish("cancelled"); await tick();
  assert.equal(h.nodes["scp-share"].disabled, true, "draw still pending: SHARE stays busy");
  assert.equal(h.nodes["scp-save"].disabled, true);
});

test("R10: SAVE IMAGE is busy while saving (no double download) and survives a throw", async () => {
  const h = harness();
  h.chips.preview(model, "n", "t");
  h.api.renders.shift()(); await tick();
  let finish; h.api.downloadImpl = () => new Promise((r) => { finish = r; });
  const save = h.nodes["scp-save"];
  save.onclick(); save.onclick(); await tick();
  assert.equal(h.calls.download, 1, "second tap is ignored while the first is running");
  assert.equal(save.disabled, true);
  finish(); await tick();
  assert.equal(save.disabled, false);
  h.api.downloadImpl = () => Promise.reject(new Error("nope"));
  await save.onclick();
  assert.equal(save.disabled, false);
  assert.equal(h.nodes["scp-status"].textContent, "Saving failed on this device.");
});

test("R11: the QR never paints past its tile, at any spec", () => {
  const sb = vm.createContext({ Object, Array, String, Number, Math, Promise, setTimeout, clearTimeout, Uint8Array, TextEncoder });
  for (const f of ["js/net/qr.js", "js/share/share-card-layout.js", "js/share/share-card.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: absSrc(f) });
  const card = vm.runInContext("ShareCard", sb);
  const links = ["https://example.test/#share=APXD1.x", "https://example.test/#share=" + "A".repeat(200)];
  for (const op of [{ x: 10, y: 20, width: 101, height: 101 }, { x: 0, y: 0, width: 60, height: 60 }]) {
    for (const link of links) {
      const fills = [];
      const ctx = { fillRect: (...a) => fills.push(a), set fillStyle(_) {}, save() {}, restore() {} };
      card.paint(ctx, [{ op: "qr", text: link, ...op }]);
      for (const [x, y, w, h] of fills) {
        assert.ok(x >= op.x - 1e-6 && y >= op.y - 1e-6 && x + w <= op.x + op.width + 1e-6 && y + h <= op.y + op.height + 1e-6,
          `fill ${[x, y, w, h]} inside ${op.width}px tile`);
      }
    }
  }
});
