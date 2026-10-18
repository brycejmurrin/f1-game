/* share-card-layout.test.mjs — deterministic card geometry and text fit. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Object, Array, String, Number, Math });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-layout.js"), "utf8"), ctx);
  return vm.runInContext("ShareCardLayout", ctx);
}

const MODEL = {
  v: 1, kind: "daily", title: "DAILY CHALLENGE", subtitle: "2026-10-17 · WET · DUSK",
  trackId: "spa", trackName: "SPA-FRANCORCHAMPS WITH A DELIBERATELY LONG LABEL",
  dayKey: "2026-10-17", weather: "wet", rows: [],
  hero: { label: "BEST LAP", value: "1:21.345", medal: "GOLD", streak: 12 },
  chart: null, display: { name: "DRIVER" }, link: "https://example.test/#share=x",
};

test("every card spec has bounded ops, an unofficial footer and no forbidden mark", () => {
  const layout = load();
  const measure = (text, size) => String(text).length * size * 0.62;
  for (const [name, spec] of Object.entries(layout.SPECS)) {
    const ops = layout.layout(MODEL, name, measure);
    assert.ok(ops.length > 8, name);
    const footer = ops.find((op) => op.id === "footer");
    assert.ok(footer, name + " footer");
    assert.match(footer.text, /UNOFFICIAL FAN GAME · APEX 26/);
    assert.doesNotMatch(JSON.stringify(ops), /FORMULA 1/i);
    for (const op of ops) {
      assert.ok(op.x >= 0 && op.y >= 0, `${name} ${op.id || op.op} starts in bounds`);
      if (op.width != null) assert.ok(op.x + op.width <= spec.width + 0.001, `${name} width`);
      if (op.height != null) assert.ok(op.y + op.height <= spec.height + 0.001, `${name} height`);
      if (op.op === "text") assert.ok(measure(op.text, op.size) <= op.maxWidth + 0.001, `${name} text fit`);
    }
  }
});

test("fake metrics force long text down to the minimum size without overflow", () => {
  const layout = load();
  const ops = layout.layout(MODEL, "landscape", (text, size) => String(text).length * size);
  const track = ops.find((op) => op.id === "track");
  assert.ok(track.size < 72);
  assert.ok(track.size >= 24);
  assert.ok(track.text.length < MODEL.trackName.length, "ellipsises when the minimum still cannot fit");
});
