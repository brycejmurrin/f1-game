/* debris-opts — the DEBRIS switch as a player setting, not a console call.
 *
 * The failure this guards is the quiet one: a wiring module that still ships,
 * still looks right in the shell, and simply stops claiming its row. So this
 * runs the REAL module over a stub SettingRow and a stub DebrisWorld and
 * asserts the three things that make the switch a switch — it claims an id the
 * shell actually declares, the row round-trips through the key
 * js/physics/debris-world.js reads, and BOTH halves fire on a write (the stored
 * key for the next boot, setEnabled for this one).
 *
 * The key semantics are pinned against create()'s own reading rather than
 * described: `getItem("apex26.debris") || "1"` then `=== "1"`.
 *
 * Run: node --test tests/unit/debris-opts.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "js/ui/debris-opts.js";
const SRC = fs.readFileSync(path.join(ROOT, FILE), "utf8").replace(/^const\b/gm, "var");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function load({ stored = {}, readyState = "complete", world = true } = {}) {
  const rows = new Map();
  const calls = [];
  const sb = {
    Math, console, Object, Array, JSON, String, Number,
    GameStore: { store: {
      raw: (k) => (k in stored ? stored[k] : null),
      rawSet: (k, v) => { stored[k] = String(v); return true; },
    } },
    SettingRow: {
      wire: (id, spec) => rows.set(id, spec),
      labels: (vals) => vals.map((v) => [v, v.toUpperCase()]),
    },
    document: { readyState, _handlers: {}, addEventListener(ev, fn) { this._handlers[ev] = fn; } },
  };
  if (world) sb.DebrisWorld = { setEnabled: (on) => { calls.push(on); return { enabled: on }; } };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: FILE });
  return { M: vm.runInContext("DebrisOpts", ctx), rows, calls, stored, doc: sb.document };
}

test("it claims pm-debris, and the shell declares that row with its select", () => {
  const { rows } = load();
  assert.deepEqual([...rows.keys()], ["pm-debris"]);
  assert.ok(SHELL.includes('id="pm-debris"'), "pm-debris must exist in index.html");
  assert.ok(SHELL.includes('id="pm-debris-sel"'), "pm-debris-sel must exist — SettingRow needs the select");
  assert.ok(SHELL.includes('id="pm-debris-label">DEBRIS<'), "the row must be labelled DEBRIS");
});

test("an unset key reads ON — the shipped default, and what create() would do", () => {
  const { M, rows } = load();
  assert.equal(M.on(), true);
  assert.equal(rows.get("pm-debris").read(), "on");
});

test("the key is read the way debris-world.js create() reads it", () => {
  // create(): `opt = getItem("apex26.debris") || "1"` then `if (opt === "1")`.
  // So null and "" fall to the default and EVERY other spelling is off — a
  // `!== "0"` here would agree on the two values anyone writes and disagree
  // with the world on the rest, which is the shape of a row that lies.
  const src = fs.readFileSync(path.join(ROOT, "js/physics/debris-world.js"), "utf8");
  assert.match(src, /getItem\("apex26\.debris"\)\s*\|\|\s*opt/,
    "create() must still read the key this row writes");
  for (const [raw, want] of [[null, true], ["", true], ["1", true], ["0", false], ["yes", false], ["true", false]]) {
    const { M } = load({ stored: raw === null ? {} : { "apex26.debris": raw } });
    assert.equal(M.on(), want, `raw ${JSON.stringify(raw)} must read ${want}`);
  }
});

test("a write persists the key AND applies live, in both directions", () => {
  const { rows, stored, calls } = load();
  rows.get("pm-debris").write("off");
  assert.equal(stored["apex26.debris"], "0", "the next boot must see the choice");
  assert.deepEqual(calls, [false], "and this boot must free the world now");
  assert.equal(rows.get("pm-debris").read(), "off", "read() reflects the write");

  rows.get("pm-debris").write("on");
  assert.equal(stored["apex26.debris"], "1");
  assert.deepEqual(calls, [false, true], "turning it back on re-arms the lazy load");
  assert.equal(rows.get("pm-debris").read(), "on");
});

test("the stored half still lands when DebrisWorld is absent", () => {
  // The module loads with the other opts files, ahead of any guarantee that
  // the world module ran — an absent DebrisWorld must not cost the player
  // their setting.
  const { rows, stored } = load({ world: false });
  rows.get("pm-debris").write("off");
  assert.equal(stored["apex26.debris"], "0");
});

test("it wires on DOMContentLoaded when the document is still loading", () => {
  const { rows, doc } = load({ readyState: "loading" });
  assert.equal(rows.size, 0, "precondition: nothing claimed yet");
  doc._handlers.DOMContentLoaded();
  assert.equal(rows.size, 1, "the row is claimed once the shell exists");
});

test("the key is registered for settings export/import", () => {
  // A player setting that a settings file cannot carry is half a setting, and
  // this is exactly the gap the driving-line keys had.
  const spec = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
  assert.match(spec, /\{\s*k:\s*"debris",\s*lane:\s*"raw"/,
    "js/ui/settings-export.js SPEC must carry debris on the raw lane");
});

test("it reaches nothing from game.js — the reason it is its own file", () => {
  const bare = SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  for (const forbidden of ["G\\.", "Tracks", "player", "gfx"]) {
    assert.ok(!new RegExp("\\b" + forbidden).test(bare),
      `the module must not reference ${forbidden} — it needs only the store, SettingRow and DebrisWorld`);
  }
});
