/* pause-opts — APPEARANCE › PAUSE MENU (LAYOUT / SIDE / BACKGROUND / CONFIRM
 * QUIT) and the two-press confirm on QUIT TO MENU / RESTART RACE. Runs the
 * REAL module in node:vm over a mini DOM, and index.html's REAL inline boot
 * script against the same stored values, so the first paint and every later
 * answer cannot disagree.
 *
 * Run: node --test tests/unit/pause-opts.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "js/ui/pause-opts.js";
const SRC = fs.readFileSync(path.join(ROOT, FILE), "utf8").replace(/^const\b/gm, "var");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const COMP = fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8");
const EXPORT = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
const MANIFEST = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
const GAME = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

function button(id, text) {
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
  };
}

function load({ stored = {}, readyState = "complete" } = {}) {
  const timers = new Map();
  let nextTimer = 1;
  const written = {};
  const wired = new Map();
  const painted = [];
  const observers = [];
  const html = { dataset: {} };
  const quit = button("pm-quit", "QUIT TO MENU");
  const restart = button("pm-restart", "RESTART RACE");
  const resume = button("pm-resume", "RESUME");
  const listeners = [];
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
    ["pm-quit", quit], ["pm-restart", restart], ["pm-resume", resume]]);
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
  vm.runInContext(SRC, ctx, { filename: FILE });
  // A click as the browser dispatches it: capture listeners on #pausemenu
  // first; unless one stopped it, the button's own handler (js/game.js) runs.
  const handled = [];
  function press(btn) {
    let stopped = false, prevented = false;
    const ev = {
      type: "click", target: btn,
      stopImmediatePropagation() { stopped = true; },
      stopPropagation() { stopped = true; },
      preventDefault() { prevented = true; },
    };
    for (const l of listeners) if (l.type === "click" && l.capture) l.fn(ev);
    if (!stopped && !btn.disabled) handled.push(btn.id);
    return { stopped, prevented };
  }
  return {
    M: vm.runInContext("PauseOpts", ctx),
    html, written, wired, painted, observers, timers, listeners, document, pausemenu, summary,
    pauseBody, bodyKids, built,
    quit, restart, resume, press, handled,
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
  // Placed after MOTION and before the TITLE SCREEN fold, inside APPEARANCE.
  const at = (s) => SHELL.indexOf(s);
  assert.ok(at('id="pm-motion-help"') < at('id="pm-pausemenu"'));
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
});

test("CONFIRM QUIT: the first press arms, the second runs the game's handler", () => {
  const { press, handled, quit, M } = load();
  const first = press(quit);
  assert.ok(first.stopped, "unarmed press never reaches js/game.js");
  assert.deepEqual(handled, []);
  assert.equal(quit.textContent, "QUIT TO MENU — TAP AGAIN");
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
  assert.equal(restart.textContent, "RESTART — TAP AGAIN");
  assert.equal(restart.getAttribute("aria-label"), "Confirm: restart race");
  assert.equal(quit.textContent, "QUIT TO MENU", "QUIT disarmed");
  assert.ok(!quit.classList.contains("armed"));
  press(quit);
  assert.deepEqual(handled, [], "a press on the OTHER button re-arms, never commits");
  press(quit);
  assert.deepEqual(handled, ["pm-quit"]);
  assert.equal(restart.textContent, "RESTART RACE");
});

test("the arm expires after ARM_MS: on its timer, and by age when the timer is late", () => {
  const { press, handled, quit, timers, runTimers, advance, M } = load();
  press(quit);
  assert.equal([...timers.values()][0].ms, 5000);
  assert.equal(M.ARM_MS, 5000);
  runTimers();
  assert.equal(quit.textContent, "QUIT TO MENU");
  assert.ok(!quit.classList.contains("armed"));
  press(quit);
  assert.deepEqual(handled, [], "after expiry the next press arms again");
  advance(5001);                        // a throttled tab: the timer has not fired yet
  press(quit);
  assert.deepEqual(handled, [], "a stale arm is a fresh question");
  assert.ok(quit.classList.contains("armed"));
});

test("hiding the pause card disarms; other buttons pass through untouched", () => {
  const { press, handled, quit, resume, pausemenu, observers } = load();
  press(quit);
  const mo = observers[0];
  assert.deepEqual(JSON.parse(JSON.stringify(mo.opts.attributeFilter)), ["hidden"]);
  pausemenu.hidden = true; mo.fn();
  assert.equal(quit.textContent, "QUIT TO MENU");
  assert.ok(!quit.classList.contains("armed"));
  assert.ok(!press(resume).stopped);
  assert.deepEqual(handled, ["pm-resume"]);
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
    ["pauseLayout", "grid", '["grid", "list"]'],
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
