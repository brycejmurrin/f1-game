/* share-card-layout.test.mjs — deterministic card geometry and text fit. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Object, Array, String, Number, Math });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-layout.js"), "utf8"), ctx, { filename: absSrc("js/share/share-card-layout.js") });
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

const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ pos: i + 1, code: "D" + i,
  name: "A DELIBERATELY LONG DRIVER NAME " + i, teamColor: "#3366ff", value: (300 - i) + " (310) PTS", you: i === n - 1 }));

test("table cards (race, ten-row season, career with hero, linked) stay in bounds on every spec", () => {
  const layout = load();
  const measure = (text, size) => String(text).length * size * 0.62;
  const models = [
    { ...MODEL, kind: "race", rows: rowsOf(4), hero: null, link: null },
    { ...MODEL, kind: "season", rows: rowsOf(10), hero: null, link: "https://example.test/#card=x" },
    { ...MODEL, kind: "career", rows: rowsOf(3).map((r) => ({ ...r, pos: null, teamColor: null })),
      hero: { label: "DRIVERS' CHAMPIONSHIP", value: "P3 · 210 PTS", medal: null, streak: null }, link: null },
  ];
  for (const model of models) {
    for (const [name, spec] of Object.entries(layout.SPECS)) {
      const ops = layout.layout(model, name, measure);
      const tag = `${model.kind} ${name}`;
      assert.match(ops.find((op) => op.id === "footer").text, /UNOFFICIAL FAN GAME/, tag);
      assert.equal(ops.filter((op) => /^row-\d+-value$/.test(op.id)).length, model.rows.length, tag + " one value per row");
      assert.ok(ops.some((op) => op.id === `row-${model.rows.length - 1}-you`), tag + " highlights the player");
      const footer = ops.find((op) => op.id === "footer-band"), qr = ops.find((op) => op.op === "qr");
      for (const op of ops) {
        assert.ok(op.x >= 0 && op.y >= 0, `${tag} ${op.id} starts in bounds`);
        if (op.width != null) assert.ok(op.x + op.width <= spec.width + 0.001, `${tag} ${op.id} width`);
        if (op.height != null) assert.ok(op.y + op.height <= spec.height + 0.001, `${tag} ${op.id} height`);
        if (op.op === "text") assert.ok(measure(op.text, op.size) <= op.maxWidth + 0.001, `${tag} ${op.id} text fit`);
        if (/^row-/.test(op.id)) {
          assert.ok(op.y + (op.height || 0) <= footer.y, `${tag} ${op.id} above the footer`);
          if (qr) assert.ok((op.align === "right" ? op.x : op.x + (op.width || 0)) <= qr.x, `${tag} ${op.id} clear of the QR`);
        }
      }
    }
  }
});

test("ghost chart card keeps traces inside the panel, clear of the QR, on every spec", () => {
  const layout = load();
  const measure = (text, size) => String(text).length * size * 0.62;
  const n = 120, s = Array.from({ length: n }, (_, i) => i / (n - 1));
  const chart = { s, a: s.map((v) => 200 + 100 * Math.sin(v * 9)), b: s.map((v) => 195 + 100 * Math.sin(v * 9)), d: s.map((v) => -0.4 * v) };
  const model = { ...MODEL, kind: "ghost", chart, link: "https://example.test/#share=APXC1.l.spa~-~81345",
    rows: [{ pos: null, code: "", name: "YOU", teamColor: null, value: "1:21.345", you: true },
      { pos: null, code: "", name: "RIVAL", teamColor: null, value: "1:21.745", you: false }],
    hero: { label: "DELTA", value: "−0.400", medal: null, streak: null } };
  for (const [name, spec] of Object.entries(layout.SPECS)) {
    const ops = layout.layout(model, name, measure);
    const panel = ops.find((op) => op.id === "panel"), qr = ops.find((op) => op.op === "qr");
    const paths = ops.filter((op) => op.op === "path");
    assert.deepEqual(JSON.parse(JSON.stringify(paths.map((op) => op.id))), ["trace-ghost", "trace-you", "trace-delta"], name);
    for (const op of paths) {
      assert.equal(op.points.length, n * 2, name + " one point per sample");
      for (let i = 0; i < op.points.length; i += 2) {
        assert.ok(op.points[i] >= op.x - 0.1 && op.points[i] <= op.x + op.width + 0.1, `${name} ${op.id} x`);
        assert.ok(op.points[i + 1] >= op.y - 0.1 && op.points[i + 1] <= op.y + op.height + 0.1, `${name} ${op.id} y`);
      }
      assert.ok(op.y >= panel.y && op.y + op.height <= panel.y + panel.height, `${name} ${op.id} in the panel`);
      assert.ok(op.x + op.width <= qr.x, `${name} ${op.id} clear of the QR`);
    }
    assert.equal(ops.find((op) => op.id === "trace-delta").color, layout.PALETTE.faster, "finished ahead reads green");
    for (const op of ops) if (op.op === "text") assert.ok(measure(op.text, op.size) <= op.maxWidth + 0.001, `${name} ${op.id} fit`);
    assert.ok(ops.every((op) => op.x >= 0 && (op.width == null || op.x + op.width <= spec.width)), name);
  }
});
