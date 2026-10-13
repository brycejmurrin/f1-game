/* platform-session-install.test.mjs — INSTALL APP is a door for the whole session (R3-PHONE-11).
 *
 * js/ui/platform-session.js installChip() stashes the browser's beforeinstallprompt. The chip is
 * a 20 s toast on ONE launch (anti-nag, a11y-pwa-pass.test.mjs pins that half); the stashed event
 * must stay reachable afterwards from Settings › DISPLAY's INSTALL APP row (#pm-install), or a
 * player who missed the toast can install only through the browser menu. prompt() spends an
 * event; Chromium fires a fresh one after a dismissal (https://web.dev/articles/customize-install),
 * so the row follows whichever event is held.
 *
 * Run: node --test tests/unit/platform-session-install.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ps = fs.readFileSync(path.join(ROOT, "js/ui/platform-session.js"), "utf8");
const start = ps.indexOf("(function installChip()");
const body = ps.slice(start, ps.indexOf("})();", start) + 5);

function boot(stored = new Map()) {
  const win = new Map();
  const el = () => ({ hidden: true, listeners: new Map(), addEventListener(t, fn) { this.listeners.set(t, fn); } });
  const chip = el(), row = el(), timers = [];
  vm.runInNewContext(body, {
    window: { addEventListener: (t, fn) => win.set(t, fn) },
    $: (id) => (id === "install-chip" ? chip : id === "pm-install" ? row : null),
    store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v) },
    UiLayers: { inRace: () => false },
    Log: { info() {}, warn() {} },
    setTimeout: (f) => timers.push(f),
  });
  const offer = () => {
    const ev = { prompted: 0, preventDefault() {}, prompt: async () => { ev.prompted++; }, userChoice: Promise.resolve({ outcome: "dismissed" }) };
    win.get("beforeinstallprompt")(ev);
    return ev;
  };
  return { win, chip, row, timers, offer, stored };
}

test("after the 20 s toast, and on every later launch, the stashed install prompt is one tap away in Settings", async () => {
  const s = boot();
  assert.equal(s.row.hidden, true, "nothing to install yet: no row");
  const first = s.offer();
  assert.equal(s.chip.hidden, false, "first launch: the toast");
  s.timers.forEach((f) => f());
  assert.equal(s.chip.hidden, true, "the toast times out");
  assert.equal(s.row.hidden, false, "…but the Settings row still holds the prompt");
  await s.row.listeners.get("click")();
  assert.equal(first.prompted, 1, "the row prompts with the stashed event");
  assert.equal(s.row.hidden, true, "a spent event is no door");
  await s.row.listeners.get("click")();
  assert.equal(first.prompted, 1, "single-use");
  const again = s.offer();   // Chromium re-fires after a dismissal
  assert.equal(s.chip.hidden, true, "the toast does not nag again");
  assert.equal(s.row.hidden, false, "the row is back with the fresh event");
  await s.row.listeners.get("click")();
  assert.equal(again.prompted, 1);

  const next = boot(s.stored);   // a later launch: chip already seen
  next.offer();
  assert.equal(next.chip.hidden, true); assert.equal(next.row.hidden, false, "seen-once never hides the Settings door");
  next.win.get("appinstalled")();
  assert.equal(next.row.hidden, true, "installed: the door goes");
});

test("the chip's tap and the row share one stashed event", async () => {
  const s = boot();
  const ev = s.offer();
  await s.chip.listeners.get("click")();
  assert.equal(ev.prompted, 1);
  assert.equal(s.row.hidden, true, "spent from the chip, gone from Settings too");
});
