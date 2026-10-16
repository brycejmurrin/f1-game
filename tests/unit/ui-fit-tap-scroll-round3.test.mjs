/* ui-fit round 3 — tap floors (settings HUD checklist, photo studio, How to Play)
   and ScrollFade selectors for #cr-body / .td-rail. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("ScrollFade SEL includes career body and track-designer rail", () => {
  const fade = rd("js/ui/scroll-fade.js");
  assert.match(fade, /"#cr-body"/, "career hub scroll body");
  assert.match(fade, /"\.td-rail"/, "track designer tool rail");
});

// Opening a <details> grows a pane's scrollHeight with no scroller resize and
// no childList change, so the fade/thumb kept the old length until the next
// scroll. A capture-phase `toggle` (it does not bubble) now schedules a repaint.
test("ScrollFade repaints when a <details> fold toggles (and only for <details>)", () => {
  const docL = [];
  const timers = [];
  const context = {
    Log: { info() {} },
    window: { addEventListener() {} },
    document: {
      readyState: "complete",
      addEventListener: (type, fn, opts) => docL.push({ type, fn, opts }),
      querySelectorAll: () => [],
    },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(rd("js/ui/scroll-fade.js"), context);
  const drain = () => { while (timers.length) timers.shift()(); };
  drain();                                         // init's settle()
  const toggle = docL.find((l) => l.type === "toggle");
  assert.ok(toggle, "a document-level toggle listener exists");
  assert.equal(toggle.opts === true || (toggle.opts && toggle.opts.capture === true), true, "capture: toggle does not bubble");
  toggle.fn({ target: { tagName: "DIALOG" } });
  assert.equal(timers.length, 0, "a popover/dialog toggle is not a fold");
  toggle.fn({ target: { tagName: "DETAILS" } });
  assert.equal(timers.length, 1, "a fold schedules one repaint");
});

// #2325: Data Hub tab/session picks replace a pane's child subtree with no
// resize and no screen flip, so only settle() pruned detached watchers and a
// long visit kept every replaced picker row registered with both observers.
test("ScrollFade prunes detached panes in the coalesced paint pass and re-observes reattached ones", () => {
  const timers = [];
  const observed = new Set();
  let roCallback, moCallback;
  class RO { constructor(cb) { roCallback = cb; } observe(el) { observed.add(el); } unobserve(el) { observed.delete(el); } }
  const moTargets = new Set();
  class MO {
    constructor(cb) { if (!moCallback) moCallback = cb; this.cb = cb; }
    observe(el) { if (this.cb === moCallback) moTargets.add(el); }
    disconnect() { if (this.cb === moCallback) moTargets.clear(); }
  }
  const pane = (name) => ({
    name, isConnected: true, clientHeight: 0, clientWidth: 0,
    closest: () => null, classList: { toggle() {} }, style: { removeProperty() {}, setProperty() {} },
  });
  let live = [];
  const context = {
    Log: { info() {} },
    window: { addEventListener() {} },
    ResizeObserver: RO, MutationObserver: MO,
    document: {
      readyState: "complete",
      addEventListener() {},
      querySelectorAll: (sel) => (/hidden/.test(sel) ? [] : live.slice()),
    },
    getComputedStyle: () => ({ overflowY: "auto", overflowX: "visible", paddingRight: "0" }),
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(rd("js/ui/scroll-fade.js"), context);
  const drain = () => { while (timers.length) timers.shift()(); };
  drain();
  const keep = pane("keep"), row1 = pane("row1");
  live = [keep, row1];
  roCallback(); drain();                       // a mutation paints and watches both
  assert.ok(observed.has(row1) && observed.has(keep));
  // The picker rebuild: row1 leaves the DOM, row2 replaces it. No resize,
  // no hidden flip, no explicit refresh: only the content observer fires.
  row1.isConnected = false;
  const row2 = pane("row2");
  live = [keep, row2];
  moCallback(); drain();
  assert.equal(observed.has(row1), false, "the detached row is unobserved without a resize or refresh");
  assert.equal(moTargets.has(row1), false, "the content observer no longer holds the detached row");
  assert.ok(observed.has(row2) && moTargets.has(row2) && moTargets.has(keep), "survivors and the new row stay observed");
  // A cached pane that comes back must be picked up again.
  row1.isConnected = true;
  live = [keep, row1, row2];
  moCallback(); drain();
  assert.ok(observed.has(row1) && moTargets.has(row1), "a reattached pane is observed again");
});

test("settings HUD checklist floors labels and checkboxes in settings-controls.css", () => {
  const css = rd("css/settings-controls.css");
  assert.match(
    css,
    /#pm-hud-details #pm-hud-elements-list label\s*\{[^}]*min-height:\s*var\(--tap-paint\)/s,
    "checklist rows paint at --tap-paint",
  );
  assert.match(
    css,
    /#pm-hud-details #pm-hud-elements-list input\[type="checkbox"\]\s*\{[^}]*min-width:\s*20px/s,
    "checkbox width floor ≥20px",
  );
  assert.match(
    css,
    /#pm-hud-details #pm-hud-elements-list input\[type="checkbox"\]\s*\{[^}]*min-height:\s*20px/s,
    "checkbox height floor ≥20px",
  );
  assert.match(
    css,
    /#pm-hud-details #pm-hidehud:has\(select:disabled\)/s,
    "race-only HUD row has a clearer disabled plate",
  );
});

test("photo studio compact / coarse controls use --tap-paint", () => {
  const css = rd("css/photo-studio.css");
  assert.match(
    css,
    /@media \(pointer: coarse\)[\s\S]*#ps-panel button:not\(\.bigbtn\):not\(\[data-step\]\)[\s\S]*min-height:\s*var\(--tap-paint\)/,
    "coarse pointer buttons floor at --tap-paint",
  );
  assert.match(
    css,
    /body\[data-density="compact"\] #ps-panel button:not\(\.bigbtn\):not\(\[data-step\]\),[\s\S]*min-height:\s*var\(--tap-paint\)/,
    "compact density buttons floor at --tap-paint",
  );
});

test("How to Play compact section chips floor at --tap-paint", () => {
  const css = rd("css/overlays.css");
  assert.match(
    css,
    /#howtoplay-inner\[data-density="compact"\] #htp-contents a\s*\{[^}]*min-height:\s*max\(var\(--tap-paint\),\s*1lh\)/s,
    "compact htp section links use --tap-paint not a hard 44px",
  );
  assert.doesNotMatch(
    css,
    /#howtoplay-inner\[data-density="compact"\] #htp-contents a\s*\{[^}]*44px/s,
    "no hard-coded 44px floor on compact htp chips",
  );
});

test("compact short-viewport sheets re-derive --tap-paint against the paint zoom", () => {
  // Ship #1346 names the painted zoom --_sheet-z (also pinned in
  // ui-improve-pass.test.mjs). Pin :where(…) form to match css/menus.css.
  const css = rd("css/menus.css");
  assert.match(
    css,
    /:where\(body\[data-density="compact"\]\) \.sheet\s*\{[^}]*--_sheet-z:\s*min\(var\(--sheet-scale,\s*var\(--ui-scale\)\),\s*var\(--ui-compact-scale\)\)/s,
    "compact .sheet names the capped paint scale (--_sheet-z)",
  );
  assert.match(
    css,
    /:where\(body\[data-density="compact"\]\) \.sheet\s*\{[^}]*zoom:\s*var\(--_sheet-z\)/s,
    "compact .sheet zooms by --_sheet-z",
  );
  assert.match(
    css,
    /:where\(body\[data-density="compact"\]\) \.sheet\s*\{[^}]*--tap-paint:\s*max\(24px,\s*calc\(var\(--tap-paint-at\)\s*\/\s*var\(--_sheet-z\)\)\)/s,
    "compact .sheet divides --tap-paint by the paint scale, not bare --ui-scale",
  );
});
