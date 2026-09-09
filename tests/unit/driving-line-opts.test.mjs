/* driving-line-opts — the DRIVING LINE's player preferences, extracted out of
 * game.js on 2026-09-08 after three ratchet raises on the entry file in one
 * day. A wiring move that silently stops wiring is the failure mode here: the
 * rows would still be in the shell, still look right, and simply do nothing.
 * So this runs the REAL module over a stub SettingRow and asserts it claims
 * all three ids, restores the stored values AT EVAL (not on DOM ready — the
 * first frame must not draw a default the player did not choose), and that
 * each row round-trips through the store.
 *
 * Run: node --test tests/unit/driving-line-opts.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/driving-line-opts.js"), "utf8").replace(/^const\b/gm, "var");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* A stub SettingRow that records what was claimed, and a DrivingLine that
   records what was set — the module under test is the wiring between them. */
function load({ stored = {}, readyState = "complete" } = {}) {
  const rows = new Map();
  const line = { _palette: "f1", _opacity: "normal" };
  const written = {};
  const sb = {
    Math, console, Object, Array, JSON, String, Number,
    GameStore: { store: {
      get: (k, d) => (k in stored ? stored[k] : d),
      set: (k, v) => { written[k] = v; stored[k] = v; },
      raw: (k) => stored[k],
    } },
    DrivingLine: {
      setPalette: (v) => { line._palette = v; return v; },
      palette: () => line._palette,
      setOpacity: (v) => { line._opacity = v; return v; },
      opacity: () => line._opacity,
    },
    SettingRow: {
      wire: (id, spec) => rows.set(id, spec),
      labels: (vals) => vals.map((v) => [v, v.toUpperCase()]),
    },
    document: { readyState, _handlers: {}, addEventListener(ev, fn) { this._handlers[ev] = fn; } },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: "js/ui/driving-line-opts.js" });
  return { M: vm.runInContext("DrivingLineOpts", ctx), rows, line, written, doc: sb.document };
}

test("every row it claims is a real set-row in the shell, and it claims all three", () => {
  const { rows } = load();
  assert.deepEqual([...rows.keys()].sort(), ["pm-linebrakecue", "pm-linecolor", "pm-lineopacity"]);
  for (const id of rows.keys()) {
    assert.ok(SHELL.includes(`id="${id}"`), `${id} must exist in index.html`);
    assert.ok(SHELL.includes(`id="${id}-sel"`), `${id}-sel must exist — SettingRow needs the select`);
  }
  // The steering slider keeps id="pm-brakecue" (a range input). Sharing that
  // name with this set-row made getElementById return the wrong node.
  assert.ok(SHELL.includes('id="pm-brakecue"'), "steer BRAKE CUE range keeps pm-brakecue");
  assert.ok(!SHELL.includes('id="pm-brakecue" class="set-row"'),
    "the set-row must not reuse the slider id");
});

test("the stored values reach DrivingLine AT EVAL, before any DOM event", () => {
  // readyState "loading" means initUI has NOT run — the restore must have
  // happened anyway, because the first frame can precede DOMContentLoaded work.
  // Primary key is lineBrakeCue (NOT brakeCue — that is the steering slider).
  const { M, line, rows } = load({ readyState: "loading",
    stored: { drivingLinePalette: "safe", drivingLineOpacity: "solid", lineBrakeCue: "on" } });
  assert.equal(rows.size, 0, "precondition: the UI has not been wired yet");
  assert.equal(line._palette, "safe", "palette restored at eval");
  assert.equal(line._opacity, "solid", "opacity restored at eval");
  assert.equal(M.brakeCue(), true, "the cue flag is read at eval too");
});

test("a pre-rename string under brakeCue still restores the cue at eval", () => {
  // Legacy carry-over: only a STRING "on" counts. A number there is the
  // steering panel's notch and must not flip this assist on.
  const { M } = load({ readyState: "loading", stored: { brakeCue: "on" } });
  assert.equal(M.brakeCue(), true, "legacy string on → cue on");
  const { M: Mnum } = load({ readyState: "loading", stored: { brakeCue: 4 } });
  assert.equal(Mnum.brakeCue(), false, "legacy number is the slider, not this flag");
});

test("an absent store gives the shipped defaults, and BRAKE CUE ships OFF", () => {
  const { M, line } = load();
  assert.equal(line._palette, "f1");
  assert.equal(line._opacity, "normal");
  assert.equal(M.brakeCue(), false, "an assist must not switch itself on");
});

test("each row round-trips through the store under its own key", () => {
  const { M, rows, line, written } = load();
  rows.get("pm-linecolor").write("safe");
  assert.equal(line._palette, "safe");
  assert.equal(written.drivingLinePalette, "safe");
  assert.equal(rows.get("pm-linecolor").read(), "safe", "read() reflects the write");

  rows.get("pm-lineopacity").write("subtle");
  assert.equal(line._opacity, "subtle");
  assert.equal(written.drivingLineOpacity, "subtle");

  assert.equal(rows.get("pm-linebrakecue").read(), "off");
  rows.get("pm-linebrakecue").write("on");
  assert.equal(M.brakeCue(), true);
  assert.equal(written.lineBrakeCue, "on", "stored under lineBrakeCue, not the slider's brakeCue");
  assert.equal(written.brakeCue, undefined, "must not re-collide with steer-tuning's key");
  assert.equal(rows.get("pm-linebrakecue").read(), "on");
  rows.get("pm-linebrakecue").write("off");
  assert.equal(M.brakeCue(), false);
  assert.equal(written.lineBrakeCue, "off");
});

test("it wires on DOMContentLoaded when the document is still loading", () => {
  const { rows, doc } = load({ readyState: "loading" });
  assert.equal(rows.size, 0);
  doc._handlers.DOMContentLoaded();
  assert.equal(rows.size, 3, "the rows are claimed once the shell exists");
});

test("it reaches nothing from game.js — the reason it could leave the entry file", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/ui/driving-line-opts.js"), "utf8");
  for (const forbidden of ["G.", "window.G", "Tracks", "player", "gfx"]) {
    assert.ok(!new RegExp(`\\b${forbidden.replace(".", "\\.")}`).test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")),
      `the module must not reference ${forbidden} — it depends only on DrivingLine, SettingRow and the store`);
  }
});
