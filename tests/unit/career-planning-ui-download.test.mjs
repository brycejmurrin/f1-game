/* Save-recovery download buttons: native path first, blob URL kept alive 10 s (iOS Safari share sheet).
 * Run: node --test tests/unit/career-planning-ui-download.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = "js/career/career-planning-ui.js";

function run(native) {
  const timers = [], revoked = [], saved = [], clicks = [];
  const planning = { protection: () => ({ missing: [] }), comparison: () => ({ rawLocal: "{}", rawStored: "{}", localSummary: null, storedSummary: null }) };
  const ctx = vm.createContext({ Blob, console, Career: { planning: () => planning, conflicted: () => false },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: (u) => revoked.push(u) },
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    document: { createElement: () => ({ click: () => clicks.push(1), remove() {} }), body: { appendChild() {} } } });
  if (native) ctx.NativeDownload = { viable: () => true, saveBlob: (b, n) => { saved.push(n); return Promise.resolve(); } };
  vm.runInContext(readFileSync(join(ROOT, SRC), "utf8") + "\n;globalThis.__UI = CareerPlanningUI;", ctx, { filename: absSrc(SRC) });
  const buttons = [];
  const el = (t, c, text) => { const n = { text, children: [], appendChild(x) { this.children.push(x); return x; } }; if (t === "button") buttons.push(n); return n; };
  ctx.__UI.append({ left: el("div"), el, row: () => {}, rebuild() {} });
  return { buttons, timers, revoked, saved, clicks };
}

test("web path revokes the blob URL no earlier than 10 s", () => {
  const r = run(false);
  r.buttons[0].onclick();
  assert.equal(r.clicks.length, 1);
  assert.deepEqual(r.timers.map((t) => t.ms), [10000]);
  assert.equal(r.revoked.length, 0);
  r.timers[0].fn();
  assert.equal(r.revoked.length, 1);
});

test("native path is used when viable", () => {
  const r = run(true);
  r.buttons[0].onclick();
  assert.deepEqual(r.saved, ["apex26-career-local.json"]);
  assert.equal(r.clicks.length, 0);
});
