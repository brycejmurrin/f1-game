// title-boot-tap — #5995 items 1 and 2.
//
// 1. A title door tapped before boot is queued by index.html (BOOT TAP) and
//    replayed by TitleMenu.replayBootTap once game.js has wired the doors,
//    only when the bare title is still on top.
// 2. The boot progress stripe (--boot-p) never runs backwards.
// Run: node --test tests/unit/title-boot-tap.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("index.html");

function el(id, extra) {
  const attrs = new Map();
  return Object.assign({ id, hidden: false, disabled: false, clicks: 0,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k),
    hasAttribute: (k) => attrs.has(k), click() { this.clicks++; } }, extra);
}

/** The shell's inline BOOT TAP block, run against a fake document. */
function shell() {
  const m = html.match(/\/\/ BOOT TAP \(#5995\)[\s\S]*?\n(\s*try \{[\s\S]*?\} catch \(e\) \{ \/\* the tap is just lost, as before \*\/ \})/);
  assert.ok(m, "index.html carries the BOOT TAP block");
  const root = el("html"), doors = new Map(["mb-race", "mb-daily"].map((id) => [id, el(id)]));
  let listener = null;
  const document = { documentElement: root,
    querySelector: (sel) => (sel === "#menu-buttons [aria-busy]" ? [...doors.values()].find((d) => d.hasAttribute("aria-busy")) || null : null),
    addEventListener: (type, fn, capture) => { assert.equal(type, "click"); assert.equal(capture, true); listener = fn; } };
  vm.runInNewContext(m[1], { document }, { filename: absSrc("index.html") });
  const tap = (id) => {
    const d = doors.get(id); let prevented = false;
    listener({ target: { closest: (sel) => (sel === "#menu-buttons button" ? d : null) }, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  return { root, doors, tap };
}

test("a tap before boot is remembered (the last wins) and marked busy; after boot it passes through", () => {
  const { root, doors, tap } = shell();
  assert.equal(tap("mb-race"), true, "the unwired door's click is held");
  assert.equal(doors.get("mb-race").getAttribute("aria-busy"), "true");
  tap("mb-daily");
  assert.equal(doors.get("mb-daily").getAttribute("aria-busy"), "true", "the last tap wins");
  assert.equal(doors.get("mb-race").getAttribute("aria-busy"), null, "the earlier door is no longer busy");
  root.setAttribute("data-booted", "");
  assert.equal(tap("mb-race"), false, "after boot the click reaches game.js untouched");
  assert.equal(doors.get("mb-race").getAttribute("aria-busy"), null);
});

function replay({ top = null, overlayHidden = false, inRace = false, door = {} } = {}) {
  const timers = [];
  const ctx = vm.createContext({ setTimeout: (fn) => timers.push(fn), Log: { info() {}, warn() {}, debug() {} },
    UiLayers: { top: () => top, inRace: () => inRace } });
  vm.runInContext(read("js/ui/title-menu.js").replace(/^const\b/m, "var"), ctx, { filename: absSrc("js/ui/title-menu.js") });
  const btn = el("mb-race", door), overlay = el("overlay", { hidden: overlayHidden });
  btn.setAttribute("aria-busy", "true");
  const $ = (id) => (id === "overlay" ? overlay : null);
  ctx.TitleMenu.replayBootTap($, { querySelector: (sel) => (sel === "#menu-buttons [aria-busy]" && btn.hasAttribute("aria-busy") ? btn : null) });
  assert.equal(btn.getAttribute("aria-busy"), null, "the queue is consumed at once");
  assert.equal(btn.clicks, 0, "the click waits for the rest of the boot task");
  timers.forEach((fn) => fn());
  return btn.clicks;
}

test("TitleMenu replays the queued door once wired, only on the bare title", () => {
  assert.equal(replay(), 1, "bare title: the door is clicked");
  assert.equal(replay({ top: { id: "overlay" } }), 1, "the title overlay on top is the bare title");
  assert.equal(replay({ top: { id: "consent" } }), 0, "a layer over the title drops the tap");
  assert.equal(replay({ overlayHidden: true }), 0, "a hidden title drops the tap");
  assert.equal(replay({ inRace: true }), 0, "a race drops the tap");
  assert.equal(replay({ door: { disabled: true } }), 0, "a disabled door drops the tap");
  assert.match(read("css/title.css"), /:root:not\(\[data-booted\]\) #menu-buttons \{ filter: [^}]*\}/);
  assert.doesNotMatch(read("css/title.css"), /:root:not\(\[data-booted\]\) #menu-buttons \{[^}]*pointer-events: none/,
    "pre-boot doors take the tap so it can be queued");
});

test("the boot stripe is monotonic while script tags keep parsing", () => {
  const m = html.match(/\n(\s*try \{\n\s*var bn = 0, bp = 0[\s\S]*?\} catch \(e\) \{ \/\* the rule just stays short \*\/ \})/);
  assert.ok(m, "index.html carries the boot progress observer");
  let cb = null, tags = 4;
  const set = [];
  class PerformanceObserver { constructor(fn) { cb = fn; } observe() {} disconnect() {} }
  const document = { querySelectorAll: () => ({ length: tags }),
    documentElement: { style: { setProperty: (k, v) => set.push(Number(v)) } } };
  vm.runInNewContext(m[1], { PerformanceObserver, document, Math }, { filename: absSrc("index.html") });
  const batch = (n) => ({ getEntries: () => Array.from({ length: n }, () => ({ initiatorType: "script" })) });
  cb(batch(2));          // 2/4 = .50
  tags = 10; cb(batch(1)); // 3/10 = .30 would run it backwards
  tags = 10; cb(batch(4)); // 7/10 = .70
  assert.deepEqual(set, [0.5, 0.5, 0.7]);
});
