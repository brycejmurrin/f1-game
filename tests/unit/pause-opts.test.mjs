/* pause-opts — APPEARANCE › PAUSE MENU (LAYOUT / SIDE / BACKGROUND / CONFIRM
 * QUIT) and the two-press confirm on QUIT TO MENU / RESTART RACE. Runs the
 * REAL module in node:vm over a mini DOM, and index.html's REAL inline boot
 * script against the same stored values, so the first paint and every later
 * answer cannot disagree.
 *
 * Run: node --test tests/unit/pause-opts.test.mjs */
import { cssRules } from "../helpers/css-rules.mjs";
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "js/ui/pause-opts.js";
const SRC = fs.readFileSync(path.join(ROOT, FILE), "utf8").replace(/^const\b/gm, "var");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const COMP = readCssSource("css/components.css");
const EXPORT = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
const MANIFEST = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
const GAME = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

function button(id, text, listenerSink) {
  const attrs = new Map();
  const cls = new Set();
  return {
    id, textContent: text, disabled: false, hidden: false,
    classList: {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
    },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    closest(sel) { return sel.split(",").map((s) => s.trim()).includes("#" + id) ? this : null; },
    click() {
      let stopped = false;
      const ts = performance.now();
      const ev = {
        type: "click", target: this, isTrusted: false, detail: 1, timeStamp: ts,
        stopImmediatePropagation() { stopped = true; },
        stopPropagation() { stopped = true; },
        preventDefault() {},
      };
      for (const l of listenerSink) if (l.type === "click" && l.capture) l.fn(ev);
      if (!stopped && !this.disabled) listenerSink._handled?.push(this.id);
    },
  };
}

function load({ stored = {}, readyState = "complete", looks = null, secondary = null, modalShield = null } = {}) {
  const timers = new Map();
  let nextTimer = 1;
  const written = {};
  const wired = new Map();
  const painted = [];
  const observers = [];
  const html = { dataset: {} };
  const listeners = [];
  listeners._handled = null;
  const quit = button("pm-quit", "QUIT TO MENU", listeners);
  const restart = button("pm-restart", "RESTART RACE", listeners);
  const resume = button("pm-resume", "RESUME", listeners);
  const pausemenu = {
    id: "pausemenu", hidden: false,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
  };
  const summary = { textContent: "PAUSE MENU · SHIPPED" };
  const bodyKids = [];
  const pauseBody = {
    id: "pm-pausemenu-body", dataset: {},
    appendChild(el) { bodyKids.push(el); return el; },
  };
  const ids = new Map([["pausemenu", pausemenu], ["pm-pausemenu-sum", summary],
    ["pm-pausemenu-body", pauseBody],
    ["pm-quit", quit], ["pm-restart", restart], ["pm-resume", resume], ["pausebtn", button("pausebtn", "Pause")]]);
  const document = {
    readyState, documentElement: html, _handlers: {},
    getElementById: (id) => ids.get(id) || null,
    createElement: (tag) => {
      const el = { tagName: String(tag).toUpperCase(), children: [], attrs: {},
        className: "", id: "", textContent: "",
        setAttribute(k, v) { this.attrs[k] = v; },
        appendChild(c) { this.children.push(c); return c; },
      };
      return el;
    },
    addEventListener(ev, fn) { this._handlers[ev] = fn; },
  };
  let now = 1_000_000;
  const built = [];
  const ctx = vm.createContext({
    Math, console, Object, Array, JSON, String, Number,
    Date: { now: () => now },
    performance: { now: () => now },
    GameStore: { store: {
      get: (k, d) => (k in stored ? stored[k] : d),
      set: (k, v) => { written[k] = v; stored[k] = v; },
    } },
    SettingRow: {
      build: (id, label, values) => {
        const row = { id, label, values };
        const sel = { id: id + "-sel", setAttribute() {} };
        const builtRow = { row, label: { id: id + "-label" }, sel, prev: {}, next: {} };
        built.push(builtRow);
        ids.set(id, row);
        return builtRow;
      },
      wire: (host, spec) => {
        const id = typeof host === "string" ? host : (host && host.id);
        wired.set(id, spec);
      },
      paint: (id, v) => painted.push([id, v]),
    },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    MutationObserver: function (fn) {
      const o = { fn, opts: null, observe(_el, opts) { o.opts = opts; observers.push(o); }, disconnect() {} };
      return o;
    },
    document,
  });
  // ScreenLooks loads AFTER pause-opts.js, so a stub is installed after eval
  // too — the module must read it at call time, never capture it.
  if (secondary) ctx.InputHoldButtons = secondary;
  if (modalShield) ctx.TopModal = modalShield;
  vm.runInContext(SRC, ctx, { filename: absSrc(FILE) });
  if (looks) ctx.ScreenLooks = looks;
  // A click as the browser dispatches it: capture listeners on #pausemenu
  // first; unless one stopped it, the button's own handler (js/game.js) runs.
  const handled = [];
  listeners._handled = handled;
  function press(btn, extra = {}) {
    let stopped = false, prevented = false;
    const ev = {
      type: "click", target: btn, timeStamp: now, ...extra,
      stopImmediatePropagation() { stopped = true; },
      stopPropagation() { stopped = true; },
      preventDefault() { prevented = true; },
    };
    for (const l of listeners) if (l.type === "click" && l.capture) l.fn(ev);
    if (!stopped && !btn.disabled) handled.push(btn.id);
    return { stopped, prevented };
  }
  function pointerUp(btn, extra = {}) {
    const ev = {
      type: "pointerup", target: btn, pointerType: "touch", button: 0, isTrusted: true, ...extra,
    };
    for (const l of listeners) if (l.type === "pointerup" && l.capture) l.fn(ev);
  }
  return {
    M: vm.runInContext("PauseOpts", ctx),
    html, written, wired, painted, observers, timers, listeners, document, pausemenu, summary,
    pauseBody, bodyKids, built,
    quit, restart, resume, press, pointerUp, handled,
    advance: (ms) => { now += ms; },
    runTimers: () => { for (const t of [...timers.values()]) t.fn(); timers.clear(); },
  };
}

// index.html's inline boot script — the FIRST answer, before any module runs.
function bootStamp(stored) {
  const m = SHELL.match(/<script>\s*\(function \(\) \{\s*\/\/ html\[data-motion\][\s\S]*?<\/script>/);
  assert.ok(m, "the inline first-paint script is in the shell");
  const body = m[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
  const dataset = {};
  const ls = new Map(Object.entries(stored).map(([k, v]) => ["apex26." + k, JSON.stringify(v)]));
  vm.runInNewContext(body, {
    JSON,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null) },
    window: { matchMedia: () => ({ matches: false }) },
    matchMedia: () => ({ matches: false }),
    document: { documentElement: { dataset }, body: null },
  });
  return dataset;
}
const pauseAttrs = (ds) => Object.fromEntries(Object.entries(ds).filter(([k]) => k.startsWith("pause")));

test("shell declares the PAUSE MENU fold shell; rows mount via SettingRow.build", () => {
  assert.match(SHELL, /<details id="pm-pausemenu" class="pm-renderer-sub">/);
  assert.match(SHELL, /id="pm-pausemenu-sum">PAUSE MENU · SHIPPED</);
  assert.match(SHELL, /id="pm-pausemenu-body"[^>]*aria-label="Pause menu"/);
  // Rows and the fold help are NOT static shell — pause-opts mounts them
  // (shellNodes absorb). Peer fold of four help lines into one stays as JS.
  for (const id of ["pm-pauselayout", "pm-pauseside", "pm-pausedim", "pm-pauseconfirm"]) {
    assert.doesNotMatch(SHELL, new RegExp(`id="${id}"`), id + " stays out of the shell");
  }
  assert.doesNotMatch(SHELL, /id="pm-pausemenu-help"/);
  // Placed after GENERAL and before the TITLE SCREEN fold, inside APPEARANCE.
  const at = (s) => SHELL.indexOf(s);
  assert.ok(at('id="pm-general"') < at('id="pm-pausemenu"'));
  assert.ok(at('id="pm-pausemenu"') < at('id="pm-titlescreen"'));
  assert.ok(at('id="pm-panel-appearance"') < at('id="pm-pausemenu"'));
});

test("defaults: GRID / CENTRE / FULL / confirm ON, no data-pause-* and SHIPPED", () => {
  const { M, html, summary } = load({ readyState: "loading" });
  assert.equal(M.layoutMode(), "grid");
  assert.equal(M.sideMode(), "centre");
  assert.equal(M.dimMode(), "full");
  assert.equal(M.confirmMode(), "on");
  assert.equal(M.shipped(), true);
  assert.deepEqual(pauseAttrs(html.dataset), {});
  assert.equal(summary.textContent, "PAUSE MENU · SHIPPED");
});

test("stored values stamp html[data-pause-*]; garbage reads as the shipped answer", () => {
  const { html, M } = load({ stored: { pauseLayout: "list", pauseSide: "right", pauseDim: "soft" } });
  assert.deepEqual(pauseAttrs(html.dataset), { pauseLayout: "list", pauseSide: "right", pauseDim: "soft" });
  assert.equal(M.shipped(), false);
  assert.equal(load({ stored: { pauseDim: "off", pauseSide: "left" } }).html.dataset.pauseDim, "off");
  const junk = load({ stored: { pauseLayout: "tiles", pauseSide: 3, pauseDim: "neon", pauseConfirm: "maybe" } });
  assert.deepEqual(pauseAttrs(junk.html.dataset), {});
  assert.equal(junk.M.confirmMode(), "on");
  assert.equal(junk.M.shipped(), true);
});

test("boot parity: index.html's inline stamp matches the module for every answer", () => {
  const cases = [
    {},
    { pauseLayout: "list" }, { pauseLayout: "grid" }, { pauseLayout: "tiles" },
    { pauseLayout: "compact" }, { pauseLayout: "wide" }, { pauseLayout: "sidebar" },
    { pauseLayout: "sidebar", pauseSide: "right" }, { pauseLayout: "wide", pauseDim: "soft" },
    { pauseSide: "left" }, { pauseSide: "right" }, { pauseSide: "centre" }, { pauseSide: "top" },
    { pauseDim: "soft" }, { pauseDim: "off" }, { pauseDim: "full" }, { pauseDim: 0 },
    { pauseLayout: "list", pauseSide: "left", pauseDim: "off", pauseConfirm: "off" },
  ];
  for (const stored of cases) {
    const boot = pauseAttrs(bootStamp(stored));
    const mod = pauseAttrs(load({ stored: { ...stored } }).html.dataset);
    assert.deepEqual(boot, mod, JSON.stringify(stored));
  }
});

test("rows mount, wire and round-trip every key; the summary follows", () => {
  const { wired, written, html, summary, M, built, bodyKids, pauseBody } = load();
  assert.equal(pauseBody.dataset.pauseRowsMounted, "1");
  assert.equal(built.length, 4);
  assert.ok(bodyKids.length >= 5, "fold help + four rows");
  assert.equal(bodyKids[0] && bodyKids[0].id, "pm-pausemenu-help");
  assert.deepEqual([...wired.keys()].sort(), ["pm-pauseconfirm", "pm-pausedim", "pm-pauselayout", "pm-pauseside"]);
  assert.deepEqual(JSON.parse(JSON.stringify(wired.get("pm-pauseside").values)), [["centre", "CENTRE"], ["left", "LEFT"], ["right", "RIGHT"]]);
  wired.get("pm-pauselayout").write("list");
  assert.equal(written.pauseLayout, "list");
  assert.equal(html.dataset.pauseLayout, "list");
  assert.equal(summary.textContent, "PAUSE MENU · CUSTOM");
  wired.get("pm-pauseside").write("left");
  assert.equal(html.dataset.pauseSide, "left");
  wired.get("pm-pausedim").write("off");
  assert.equal(html.dataset.pauseDim, "off");
  wired.get("pm-pauseconfirm").write("off");
  assert.equal(written.pauseConfirm, "off");
  assert.equal(M.confirmMode(), "off");
  M.setLayout("grid"); M.setSide("centre"); M.setDim("full"); M.setConfirm("on");
  assert.deepEqual(pauseAttrs(html.dataset), {}, "back to shipped writes no attribute");
  assert.equal(summary.textContent, "PAUSE MENU · SHIPPED");
  assert.equal(M.setDim("purple"), "full", "an unknown answer stores the shipped one");
});

test("wiring waits for DOMContentLoaded while deferred scripts still run", () => {
  const { wired, listeners, document } = load({ readyState: "interactive" });
  assert.equal(wired.size, 0);
  assert.equal(listeners.length, 0);
  document._handlers.DOMContentLoaded();
  assert.equal(wired.size, 4);
  assert.equal(listeners.filter((l) => l.type === "click" && l.capture === true).length, 1, "ONE capture-phase listener on #pausemenu");
  assert.equal(listeners.filter((l) => l.type === "pointerup" && l.capture === true).length, 1, "ONE capture-phase pointerup on #pausemenu");
});

test("CONFIRM QUIT: the first press arms, the second runs the game's handler", () => {
  const { press, handled, quit, M } = load();
  const first = press(quit);
  assert.ok(first.stopped, "unarmed press never reaches js/game.js");
  assert.deepEqual(handled, []);
  assert.equal(quit.textContent, "TAP AGAIN");
  assert.ok(quit.classList.contains("armed"));
  assert.equal(quit.getAttribute("aria-label"), "Confirm: quit to menu");
  assert.ok(M.isArmed("pm-quit"));
  const second = press(quit);
  assert.ok(!second.stopped);
  assert.deepEqual(handled, ["pm-quit"]);
  assert.equal(quit.textContent, "QUIT TO MENU", "label restored the moment it commits");
  assert.ok(!quit.classList.contains("armed"));
  assert.equal(quit.getAttribute("aria-label"), null);
});

test("RESTART arms the same way; arming one button disarms the other", () => {
  const { press, handled, quit, restart } = load();
  press(quit);
  press(restart);
  assert.equal(restart.textContent, "TAP AGAIN");
  assert.equal(restart.getAttribute("aria-label"), "Confirm: restart race");
  assert.equal(quit.textContent, "QUIT TO MENU", "QUIT disarmed");
  assert.ok(!quit.classList.contains("armed"));
  press(quit);
  assert.deepEqual(handled, [], "a press on the OTHER button re-arms, never commits");
  press(quit);
  assert.deepEqual(handled, ["pm-quit"]);
  assert.equal(restart.textContent, "RESTART RACE");
});

test("the arm expires on ARM_MAX_MS wall-clock idle (setTimeout, not rAF)", () => {
  const { press, handled, quit, timers, advance, runTimers, M } = load();
  assert.equal(M.ARM_MAX_MS, 5000);
  press(quit);
  assert.equal(quit.textContent, "TAP AGAIN");
  assert.equal(timers.size, 1, "one wall-clock expiry timer");
  advance(4999);
  assert.equal(quit.textContent, "TAP AGAIN");
  runTimers();
  assert.equal(quit.textContent, "QUIT TO MENU");
  assert.ok(!quit.classList.contains("armed"));
  assert.deepEqual(handled, []);
});

test("hiding the pause card disarms; resume and Escape drop the arm and pass through", () => {
  const { press, handled, quit, resume, pausemenu, observers, document, M } = load();
  press(quit);
  const mo = observers[0];
  assert.deepEqual(JSON.parse(JSON.stringify(mo.opts.attributeFilter)), ["hidden"]);
  pausemenu.hidden = true; mo.fn();
  assert.equal(quit.textContent, "QUIT TO MENU");
  assert.ok(!quit.classList.contains("armed"));
  assert.ok(!press(resume).stopped);
  assert.deepEqual(handled, ["pm-resume"]);
  pausemenu.hidden = false;
  press(quit);
  assert.ok(M.isArmed("pm-quit"));
  press(resume);
  assert.equal(quit.textContent, "QUIT TO MENU", "RESUME is another option: the arm drops");
  assert.deepEqual(handled, ["pm-resume", "pm-resume"]);
  press(quit);
  document._handlers.keydown({ key: "Escape" });
  assert.ok(!M.isArmed("pm-quit"), "Escape disarms while the card is open");
  assert.equal(quit.textContent, "QUIT TO MENU");
});

test("a disabled RESTART (multiplayer) is never armed; CONFIRM OFF passes straight through", () => {
  const a = load();
  a.restart.disabled = true;
  assert.ok(!a.press(a.restart).stopped);
  assert.equal(a.restart.textContent, "RESTART RACE");
  assert.ok(!a.restart.classList.contains("armed"));
  const b = load({ stored: { pauseConfirm: "off" } });
  assert.ok(!b.press(b.quit).stopped);
  assert.deepEqual(b.handled, ["pm-quit"]);
  assert.equal(b.quit.textContent, "QUIT TO MENU");
  // Turning it OFF while armed drops the arm at once.
  const c = load();
  c.press(c.quit);
  c.M.setConfirm("off");
  assert.ok(!c.quit.classList.contains("armed"));
});

// UI hunt 2026-10-29 #1: a 175 ms thumb double tap sent both presses to #pm-quit.
test("a real press younger than ARM_MIN_MS on the wall clock is the same double tap: swallowed, still armed", () => {
  const { press, handled, quit, advance, M } = load();
  const tap = { isTrusted: true, detail: 1 };
  assert.equal(M.ARM_MIN_MS, 350);
  assert.equal(M.armAge(), Infinity, "nothing armed");
  press(quit, tap);
  advance(175);
  assert.equal(M.armAge(), 175);
  assert.ok(press(quit, tap).stopped, "the double tap's second click never reaches the game's handler");
  assert.deepEqual(handled, []);
  assert.ok(M.isArmed("pm-quit"), "the arm stays up");
  advance(200);
  assert.ok(!press(quit, tap).stopped, "a deliberate second tap commits");
  assert.deepEqual(handled, ["pm-quit"]);
  // Keyboard activation (detail 0) and a script's el.click() (untrusted) are never ghosts.
  for (const ev of [{ isTrusted: true, detail: 0 }, { isTrusted: false, detail: 1 }]) {
    const r = load();
    r.press(r.restart, ev);
    assert.ok(!r.press(r.restart, ev).stopped);
    assert.deepEqual(r.handled, ["pm-restart"]);
  }
});

test("late-handled taps: wall clock confirms after input lag; event timeStamp ghost does not block", () => {
  const tap = { isTrusted: true, detail: 1 };
  const TS0 = 50_000;
  // (1) tap 2 handled late (wall) with a young event timeStamp still confirms
  {
    const { press, handled, quit, advance } = load();
    press(quit, { ...tap, timeStamp: TS0 });
    advance(2000);
    assert.ok(!press(quit, { ...tap, timeStamp: TS0 + 10 }).stopped);
    assert.deepEqual(handled, ["pm-quit"]);
  }
  // (2) six seconds of wall time expires the arm before confirm
  {
    const { press, handled, quit, advance, timers } = load();
    press(quit, { ...tap, timeStamp: TS0 });
    advance(6000);
    for (const t of [...timers.values()]) t.fn(); timers.clear();
    assert.equal(quit.textContent, "QUIT TO MENU");
    press(quit, { ...tap, timeStamp: TS0 + 1000 });
    assert.ok(press(quit, { ...tap, timeStamp: TS0 + 2000 }).stopped, "re-arms after expiry");
    assert.deepEqual(handled, []);
  }
  // (3) two taps 150 ms apart on the wall stay a ghost double tap
  {
    const { press, handled, quit, advance, M } = load();
    press(quit, { ...tap, timeStamp: TS0 });
    advance(150);
    assert.ok(press(quit, { ...tap, timeStamp: TS0 + 150 }).stopped);
    assert.deepEqual(handled, []);
    assert.ok(M.isArmed("pm-quit"));
  }
  // (4) wall age past ARM_MIN_MS confirms even when event timeStamps look like a ghost
  {
    const { press, handled, quit, advance } = load();
    press(quit, { ...tap, timeStamp: TS0 });
    advance(400);
    assert.ok(!press(quit, { ...tap, timeStamp: TS0 + 5 }).stopped);
    assert.deepEqual(handled, ["pm-quit"]);
    assert.equal(quit.textContent, "QUIT TO MENU");
  }
});

test("pointerup confirms an armed guarded button once wall age passes ARM_MIN_MS", () => {
  const h = load();
  h.press(h.quit);
  h.advance(400);
  h.pointerUp(h.quit);
  h.press(h.quit, { isTrusted: true, detail: 1 });
  assert.deepEqual(h.handled, ["pm-quit"]);
});

test("one tap only arms; pointerup plus native click never double-quits or re-arms", () => {
  const h = load();
  h.press(h.quit, { isTrusted: true, detail: 1 });
  assert.equal(h.quit.textContent, "TAP AGAIN");
  assert.deepEqual(h.handled, []);
  h.advance(400);
  h.pointerUp(h.quit, { isTrusted: true });
  h.press(h.quit, { isTrusted: true, detail: 1 });
  assert.deepEqual(h.handled, ["pm-quit"], "exactly one quit handler from pointerup + native click");
  assert.equal(h.quit.textContent, "QUIT TO MENU");
  assert.ok(!h.M.isArmed("pm-quit"));
  h.press(h.quit, { isTrusted: true, detail: 1 });
  assert.equal(h.quit.textContent, "TAP AGAIN", "next deliberate tap re-arms only");
  assert.deepEqual(h.handled, ["pm-quit"]);
});

test("b0b89dc: a 15.5 s stall keeps TAP AGAIN until ARM_MAX_MS then disarms; late confirm still works", () => {
  const tap = { isTrusted: true, detail: 1 };
  const TS0 = 50_000;
  {
    const { press, handled, quit, advance, timers, M } = load();
    press(quit, { ...tap, timeStamp: TS0 });
    assert.equal(quit.textContent, "TAP AGAIN");
    assert.equal(timers.size, 1);
    advance(15_500);
    for (const t of [...timers.values()]) t.fn(); timers.clear();
    assert.equal(quit.textContent, "QUIT TO MENU", "wall expiry clears a stuck arm");
    assert.ok(!M.isArmed("pm-quit"));
    assert.ok(press(quit, { ...tap, timeStamp: TS0 + 15_500 }).stopped, "next tap re-arms");
    assert.deepEqual(handled, []);
  }
  {
    const { press, handled, quit, pausemenu, observers } = load();
    press(quit, { ...tap, timeStamp: TS0 });
    pausemenu.hidden = true;
    observers[0].fn();
    pausemenu.hidden = false;
    assert.equal(quit.textContent, "QUIT TO MENU");
    assert.ok(press(quit, { ...tap, timeStamp: TS0 + 20_000 }).stopped, "after close/reopen the tap re-arms");
    assert.equal(quit.textContent, "TAP AGAIN");
    assert.deepEqual(handled, []);
  }
});

test("js/game.js keeps its handlers and the multiplayer restart guard untouched", () => {
  assert.match(GAME, /\$\("pm-quit"\)\.onclick = \(\) => quitToMenu\(\);/);
  assert.match(GAME, /\$\("pm-restart"\)\.disabled = !!\(netPlay\.active\(\) \|\| qualiNet\.hasArmed\(\)\)/);
  assert.doesNotMatch(GAME, /PauseOpts/, "self-wiring: no line in game.js");
});

test("CSS: BACKGROUND feeds both scrim layers through tokens; LIST, SIDE and the armed fill", () => {
  // Shipped numbers as the fallbacks — unset, nothing moves.
  assert.match(COMP, /#pausemenu\.screen\.dim \{[^}]*var\(--pause-wash, 14%\)[^}]*rgba\(6, 6, 10, var\(--pause-scrim, 0\.58\)\)/);
  assert.match(COMP, /dialog\.screen\.dim::backdrop \{[^}]*var\(--pause-wash, 12%\)[^}]*rgba\(6, 6, 10, var\(--pause-scrim, 0\.38\)\)/);
  for (const v of ["soft", "off"]) {
    assert.match(COMP, new RegExp(`:root\\[data-pause-dim="${v}"\\] #pausemenu[ ,{]`), v + " on the card");
    assert.match(COMP, new RegExp(`:root\\[data-pause-dim="${v}"\\] #pausemenu::backdrop`), v + " on the backdrop");
  }
  // The reduced-transparency backdrop still wins: same selector, later.
  const generic = COMP.indexOf("dialog.screen.dim::backdrop {");
  const reduced = COMP.indexOf("dialog.screen.dim::backdrop { background: rgba(0, 0, 0, 0.96); }");
  assert.ok(generic > 0 && reduced > generic);
  assert.match(COMP, /:root\[data-pause-layout="list"\] #pausemenu \.sheet-body\.stack \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(COMP, /:root\[data-pause-side="left"\] #pausemenu \{ justify-items: start; \}/);
  assert.match(COMP, /:root\[data-pause-side="right"\] #pausemenu \{ justify-items: end; \}/);
  assert.match(COMP, /:is\(#pm-quit, #pm-restart\):not\(#pm-resume\)\.armed \{[^}]*var\(--armed-fill\)/);
});

test("export rows, boot keys and the load order", () => {
  for (const [k, def, oneOf] of [
    ["pauseLayout", "grid", '["grid", "list", "compact", "wide", "sidebar"]'],
    ["pauseSide", "centre", '["centre", "left", "right"]'],
    ["pauseDim", "full", '["full", "soft", "off"]'],
    ["pauseConfirm", "on", '["on", "off"]'],
  ]) {
    const row = EXPORT.match(new RegExp(`\\{ k: "${k}"[^\\n]*\\}`));
    assert.ok(row, k + " has a SPEC row");
    assert.match(row[0], /group: "appearance"/);
    assert.ok(row[0].includes(`def: "${def}"`), k + " def");
    assert.ok(row[0].includes(`oneOf: ${oneOf}`), k + " oneOf");
  }
  for (const k of ["pauseLayout", "pauseSide", "pauseDim"]) assert.ok(SHELL.includes(`apex26.${k}`), k + " in the boot script");
  assert.match(MANIFEST, /"js\/ui\/pause-opts\.js",/);
  assert.match(MANIFEST, /\["js\/core\/store\.js", "js\/ui\/pause-opts\.js"\]/);
});

test("LAYOUT: COMPACT / WIDE / SIDEBAR round-trip, stamp and read back", () => {
  const { M, html, written, wired, summary } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(M.LAYOUTS)).map(([id]) => id), ["grid", "list", "compact", "wide", "sidebar"]);
  assert.deepEqual(JSON.parse(JSON.stringify(wired.get("pm-pauselayout").values)).map(([id]) => id),
    ["grid", "list", "compact", "wide", "sidebar"]);
  for (const v of ["compact", "wide", "sidebar"]) {
    assert.equal(M.setLayout(v), v);
    assert.equal(written.pauseLayout, v);
    assert.equal(html.dataset.pauseLayout, v);
    assert.equal(summary.textContent, "PAUSE MENU · CUSTOM");
    assert.equal(load({ stored: { pauseLayout: v } }).M.layoutMode(), v, v + " survives a reload");
  }
  assert.equal(M.setLayout("grid"), "grid");
  assert.equal(html.dataset.pauseLayout, undefined);
  assert.equal(summary.textContent, "PAUSE MENU · SHIPPED");
  const help = load().bodyKids[0].textContent;
  for (const w of ["COMPACT", "WIDE", "SIDEBAR"]) assert.ok(help.includes(w), "fold help names " + w);
});

test("SHIPPED composes with ScreenLooks' lookPause knobs; absent ScreenLooks reads as shipped", () => {
  let lookShipped = false;
  const looks = { PEEK_MS: 1800, isShipped: (id) => (assert.equal(id, "pause"), lookShipped), peek() {} };
  const a = load({ looks });
  assert.equal(a.M.shipped(), false, "a custom lookPause knob makes the fold CUSTOM");
  a.M.apply();
  assert.equal(a.summary.textContent, "PAUSE MENU · CUSTOM");
  lookShipped = true;
  assert.equal(a.M.shipped(), true);
  a.M.apply();
  assert.equal(a.summary.textContent, "PAUSE MENU · SHIPPED");
  // Own knob off its default still reads CUSTOM whatever ScreenLooks says.
  assert.equal(load({ looks, stored: { pauseSide: "left" } }).M.shipped(), false);
  assert.equal(load().M.shipped(), true, "no ScreenLooks global: own four decide");
});

test("every setter peeks the pause card through ScreenLooks, read at call time", () => {
  const peeks = [];
  const looks = { PEEK_MS: 1800, isShipped: () => true, peek: (id, ms) => peeks.push([id, ms]) };
  const { M } = load({ looks });
  M.setLayout("wide"); M.setSide("left"); M.setDim("soft"); M.setConfirm("off");
  assert.deepEqual(peeks, [["pause", 1800], ["pause", 1800], ["pause", 1800], ["pause", 1800]]);
  // Without ScreenLooks the setters still work and throw nothing.
  assert.equal(load().M.setLayout("compact"), "compact");
});

test("CSS: each new LAYOUT and every lookPause knob has a rule in the pause block", () => {
  const rule = (sel) => new RegExp(sel.replace(/[[\]().*+?^$|]/g, "\\$&") + "[^{]*\\{");
  // COMPACT: three columns, chip-height doors, the info lines keep the full row.
  assert.match(COMP, /:root\[data-pause-layout="compact"\] #pausemenu \.sheet-body\.stack \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(COMP, /:root\[data-pause-layout="compact"\] #pausemenu \.sheet-body\.stack > button \{ min-height: var\(--chip-h\); \}/);
  assert.match(COMP, /:root\[data-pause-layout="compact"\] :is\(#pm-quit, #pm-standings, #pm-howto\) \{ grid-column: auto; \}/);
  // WIDE: along the bottom, one wrapping flex row.
  assert.match(COMP, /:root\[data-pause-layout="wide"\] #pausemenu \{[^}]*align-items: end/);
  assert.match(COMP, /:root\[data-pause-layout="wide"\] #pausemenu \.sheet-body\.stack \{ display: flex; flex-direction: row; flex-wrap: wrap; \}/, "WIDE is a ROW: .stack is a column flex");
  assert.match(COMP, /:root\[data-pause-layout="wide"\] :is\(#pm-now-card, #pm-build\) \{ flex-basis: 100%; \}/);
  // SIDEBAR: full height on the start edge, the end edge for SIDE RIGHT.
  assert.match(COMP, /:root\[data-pause-layout="sidebar"\] #pausemenu \{[^}]*justify-items: start;[^}]*align-items: stretch/);
  assert.match(COMP, /:root\[data-pause-layout="sidebar"\]\[data-pause-side="right"\] #pausemenu \{ justify-items: end; \}/);
  assert.match(COMP, /:root\[data-pause-layout="sidebar"\] #pausemenu \.sheet \{ height: 100%; \}/);
  // VERTICAL POSITION wins over WIDE's bottom edge: same specificity, later.
  assert.ok(COMP.indexOf(':root[data-look-pause-vpos="top"] #pausemenu') > COMP.indexOf(':root[data-pause-layout="wide"] #pausemenu {'));
  for (const sel of [
    ":root[data-look-pause-btn]", ":root[data-look-pause-w]", ":root[data-look-pause-gap]",
    ':root[data-look-pause-style="outline"]', ':root[data-look-pause-align="left"]',
    ':root[data-look-pause-vpos="top"]', ':root[data-look-pause-vpos="bottom"]',
    ':root[data-look-pause-music="hide"]', ':root[data-look-pause-build="hide"]',
  ]) assert.match(COMP, rule(sel), sel + " has a rule");
  for (const k of ["btn", "w", "gap"]) assert.ok(COMP.includes(`var(--look-pause-${k})`), k + " reads its token");
  // BUTTON HEIGHT stays off the transport squares (direct children only).
  assert.match(COMP, /:root\[data-look-pause-btn\] #pausemenu \.sheet \.sheet-body\.stack > button \{ min-height: calc\(var\(--tap-0\) \* var\(--look-pause-btn\)\); \}/);
  // OUTLINE never repaints an armed door.
  assert.match(COMP, /:root\[data-look-pause-style="outline"\] #pausemenu \.sheet-body\.stack > button:is\([^)]*\):not\(#pm-resume\):not\(\.armed\)/);
});


test("dialog backdrop animations respect the explicit in-game reduced-motion preference", () => {
  const rules = cssRules(fs.readFileSync(path.join(ROOT, "css/dialog-platform.css"), "utf8"));
  const animated = rules.filter(r => r.selector.includes("::backdrop") && r.decls.has("animation"));
  // The only animated backdrop is scoped by both the OS preference and the in-game override.
  assert.deepEqual(animated.map(r => r.selector), [':root:not([data-motion="reduce"]) dialog.screen.dim[open]::backdrop'],
    "normal-motion dialogs retain their entrance animation; the in-game motion override excludes backdrops too");
  assert.ok(animated[0].context.some(c => c.includes("prefers-reduced-motion: no-preference")));
});


test("secondary PAUSE wires once and preserves trusted gesture metadata for the modal shield", () => {
  const registered = [], seen = []; let block = false;
  const h = load({ secondary: { secondaryTap: (el, opts) => registered.push({ el, opts }) },
    modalShield: { onClickShield(e) { seen.push(e); if (block) e.preventDefault(); } } });
  h.M.initUI(); h.M.initUI();
  assert.equal(registered.length, 1, "pause bridge registration is idempotent");
  assert.equal(registered[0].el.id, "pausebtn");
  const source = { target: registered[0].el, isTrusted: true, clientX: 712, clientY: 44, timeStamp: 1234 };
  assert.equal(registered[0].opts.beforeActivate(source), true);
  assert.equal(seen[0].isTrusted, true); assert.equal(seen[0].target, source.target);
  assert.deepEqual([seen[0].clientX, seen[0].clientY, seen[0].timeStamp], [712, 44, 1234]);
  assert.equal(seen[0].detail, 1, "the original touch is recorded as a semantic pointer activation");
  block = true;
  assert.equal(registered[0].opts.beforeActivate(source), false, "an active shield can reject the activation");
});
