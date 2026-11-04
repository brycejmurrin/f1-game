/* apex-lifecycle.test.mjs — js/agent/apex-lifecycle.js counts WebGL context
 * loss on #game even when __apex.lifecycle() first ran before the canvas
 * existed (#4367). A minimal DOM stand-in: window capture listeners run
 * before the target's own, as in a real dispatch of a non-bubbling event.
 *
 * Run: node --test tests/unit/apex-lifecycle.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/agent/apex-lifecycle.js"), "utf8");

function target() {
  const ls = [];
  return {
    ls,
    addEventListener: (type, fn, opt) => ls.push({ type, fn, capture: opt === true || !!(opt && opt.capture) }),
  };
}

function load() {
  const win = target();
  const doc = Object.assign(target(), { hidden: false, visibilityState: "visible", els: {} });
  doc.getElementById = (id) => doc.els[id] || null;
  const ctx = { window: win, document: doc, performance: { now: () => 0 }, innerWidth: 844, innerHeight: 390, devicePixelRatio: 1, Math, Object, console };
  vm.createContext(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/agent/apex-lifecycle.js") });
  // Non-bubbling dispatch at an element in the document: window capture, then the target.
  const fire = (el, type) => {
    const e = { type, target: el };
    for (const l of win.ls) if (l.type === type && l.capture) l.fn(e);
    for (const l of el.ls) if (l.type === type) l.fn(e);
  };
  const life = (o) => ctx.ApexLifecycle.api({ state: "menu", paused: false }, () => null, o);
  return { doc, fire, life };
}

test("context loss counts when lifecycle() ran before #game existed", () => {
  const { doc, fire, life } = load();
  assert.equal(life().events.contextlost, 0, "first call installs the listeners; no canvas yet");
  const cv = Object.assign(target(), { id: "game" });
  doc.els.game = cv;
  fire(cv, "webglcontextlost");
  fire(cv, "webglcontextrestored");
  const ev = life().events;
  assert.equal(ev.contextlost, 1);
  assert.equal(ev.contextrestored, 1);
});

test("context events on another canvas are not counted", () => {
  const { fire, life } = load();
  life();
  fire(Object.assign(target(), { id: "game-soft" }), "webglcontextlost");
  assert.equal(life().events.contextlost, 0);
});
