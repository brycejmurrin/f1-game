/* a11y-opts — SETTINGS › ACCESSIBILITY: reduce motion / focus / colourblind cues.
 *
 * Run: node --test tests/unit/a11y-opts.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "js/ui/a11y-opts.js";
const SRC = fs.readFileSync(path.join(ROOT, FILE), "utf8").replace(/^const\b/gm, "var");
const TITLE = fs.readFileSync(path.join(ROOT, "js/ui/title-fx.js"), "utf8").replace(/^const\b/gm, "var");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const EXPORT = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
const MANIFEST = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
const TOKENS = fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8");

function el(id) {
  const attrs = new Map();
  const children = [];
  const e = {
    id, tagName: "DIV", hidden: false, parentNode: null, children,
    className: "", textContent: "", _handlers: {},
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k) { attrs.delete(k); },
    hasAttribute(k) { return attrs.has(k); },
    querySelector(sel) {
      if (sel === "select") return children.find((c) => c.tagName === "SELECT")
        || [...children].flatMap((c) => c.children || []).find((c) => c && c.tagName === "SELECT") || null;
      return null;
    },
    appendChild(n) { children.push(n); n.parentNode = this; return n; },
    insertBefore(n, ref) {
      const i = ref ? children.indexOf(ref) : -1;
      if (i < 0) children.push(n); else children.splice(i, 0, n);
      n.parentNode = this;
      return n;
    },
  };
  return e;
}

function load({ stored = {}, osReduce = false, readyState = "complete" } = {}) {
  const written = {};
  const wired = [];
  const ids = new Map();
  const panel = el("pm-panel-a11y");
  ids.set("pm-panel-a11y", panel);
  const html = { dataset: {} };
  const document = {
    readyState, documentElement: html, visibilityState: "visible", _handlers: {},
    getElementById: (id) => ids.get(id) || null,
    addEventListener(ev, fn) { this._handlers[ev] = fn; },
    createElement: (tag) => {
      const n = el(tag);
      n.tagName = String(tag).toUpperCase();
      return n;
    },
  };
  function build(id, labelText, values) {
    const row = document.createElement("div");
    row.id = id;
    const sel = document.createElement("select");
    sel.id = id + "-sel";
    sel.tagName = "SELECT";
    row.appendChild(sel);
    ids.set(id, row);
    ids.set(id + "-sel", sel);
    return { row, values };
  }
  const timers = new Map();
  let nextTimer = 1;
  const sb = {
    Math, console, Object, Array, JSON, String, Number,
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    GameStore: { store: {
      get: (k, d) => (k in stored ? stored[k] : d),
      set: (k, v) => { written[k] = v; stored[k] = v; },
    } },
    SettingRow: {
      build,
      wire: (id, spec) => { wired.push({ id, spec }); ids.get(id)._spec = spec; },
      paint: () => {},
    },
    document, window: {
      matchMedia: () => ({
        matches: osReduce,
        addEventListener() {},
      }),
    },
  };
  sb.window.document = document;
  sb.window.matchMedia = () => ({
    matches: osReduce,
    addEventListener() {},
  });
  const ctx = vm.createContext(sb);
  vm.runInContext(TITLE, ctx, { filename: "js/ui/title-fx.js" });
  vm.runInContext(SRC, ctx, { filename: FILE });
  return {
    A: vm.runInContext("A11yOpts", ctx),
    T: vm.runInContext("TitleFx", ctx),
    html, written, wired, ids, panel, document, stored,
  };
}

test("shell declares ACCESSIBILITY door + empty panel; MOTION left Appearance", () => {
  assert.ok(SHELL.includes('id="pm-open-a11y"'));
  assert.ok(SHELL.includes('id="pm-panel-a11y"'));
  assert.ok(SHELL.includes("ACCESSIBILITY"));
  assert.ok(!SHELL.includes('id="pm-motion"'), "motion row is runtime-built in the a11y panel");
  assert.ok(MANIFEST.includes("js/ui/a11y-opts.js"));
});

test("export SPEC lists motion/focusRing/cbCues/holdMode under a11y", () => {
  assert.match(EXPORT, /k:\s*"motion"[\s\S]*?group:\s*"a11y"/);
  assert.match(EXPORT, /k:\s*"focusRing"[\s\S]*?group:\s*"a11y"/);
  assert.match(EXPORT, /k:\s*"cbCues"[\s\S]*?group:\s*"a11y"/);
  assert.match(EXPORT, /k:\s*"holdMode"[\s\S]*?group:\s*"a11y"/);
});

test("high focus is the default and stamps data-focus", () => {
  const { html, A } = load({ readyState: "loading" });
  assert.equal(A.focusRing(), "high");
  assert.equal(html.dataset.focus, "high");
  A.setFocus("standard");
  assert.equal(html.dataset.focus, undefined);
});

test("colourblind help mentions race HUD cues", () => {
  const { panel, A } = load();
  A.mountPanel();
  const help = panel.children.find((n) => n.id === "pm-cbcues-help");
  assert.ok(help);
  assert.match(help.textContent, /race HUD/i);
  assert.doesNotMatch(help.textContent, /follow-up|still under APPEARANCE/i);
});

test("colourblind cues off by default; on stamps data-cb-cues", () => {
  const { html, A } = load({ readyState: "loading" });
  assert.equal(A.cbCues(), "off");
  assert.equal(html.dataset.cbCues, undefined);
  A.setCb("on");
  assert.equal(html.dataset.cbCues, "on");
  assert.equal(A.compoundLetter("SOFT"), "S");
  assert.equal(A.compoundLetter("MEDIUM"), "M");
  assert.equal(A.compoundLetter("HARD"), "H");
  assert.equal(A.compoundLetter("INTERMEDIATE"), "I");
  assert.equal(A.compoundLetter("WET"), "W");
});

test("REDUCE MOTION AUTO follows OS; ON always; OFF overrides OS", () => {
  assert.equal(load({ osReduce: true }).T.mode(), "reduce");
  assert.equal(load({ osReduce: true, stored: { motion: "off" } }).T.mode(), "on");
  assert.equal(load({ osReduce: false, stored: { motion: "reduce" } }).T.mode(), "reduce");
  assert.equal(load({ osReduce: true, stored: { motion: "auto" } }).T.mode(), "reduce");
  assert.equal(load({ stored: { motion: "on" } }).T.choice(), "auto", "legacy MOTION: ON → AUTO");
});

test("panel mounts five rows and wires them", () => {
  const { wired, ids, A, T, written } = load();
  assert.ok(ids.get("pm-motion"));
  assert.ok(ids.get("pm-focus"));
  assert.ok(ids.get("pm-cbcues"));
  assert.ok(ids.get("pm-hold-throttle"));
  assert.ok(ids.get("pm-hold-lookback"));
  const idsWired = wired.map((w) => w.id).sort();
  assert.deepEqual(idsWired, ["pm-cbcues", "pm-focus", "pm-hold-lookback", "pm-hold-throttle", "pm-motion"]);
  ids.get("pm-motion")._spec.write("reduce");
  assert.equal(T.choice(), "reduce");
  ids.get("pm-focus")._spec.write("standard");
  assert.equal(A.focusRing(), "standard");
  ids.get("pm-cbcues")._spec.write("on");
  assert.equal(A.cbCues(), "on");
  ids.get("pm-hold-throttle")._spec.write("toggle");
  assert.equal(A.holdMode().throttle, "toggle");
  assert.equal(written.holdMode.throttle, "toggle");
  assert.equal(written.holdMode.lookBack, "hold");
});

test("HIGH focus CSS keys off data-focus", () => {
  assert.match(TOKENS, /:root\[data-focus="high"\] :focus-visible/);
});
