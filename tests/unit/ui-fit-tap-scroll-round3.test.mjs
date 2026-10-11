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
