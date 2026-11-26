// Save Health dates follow the game's I18n locale, not the browser default (#6900).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
const src = (file) => fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8");

test("Save Health dates follow the game's locale, not the browser's (#6900)", () => {
  const c = vm.createContext({ console });
  // Simulate a German browser: Date.prototype.toLocaleString with no argument answers in de-DE.
  vm.runInContext(`(function(){ const o = Date.prototype.toLocaleString;
    Date.prototype.toLocaleString = function (l, x) { return o.call(this, l || "de-DE", x); }; })()`, c, { filename: absSrc("js/ui/save-health.js") });
  vm.runInContext(src("js/core/i18n.js") + ";globalThis.I18n=I18n", c, { filename: absSrc("js/core/i18n.js") });
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", c, { filename: absSrc("js/ui/save-health.js") });
  const at = Date.UTC(2026, 10, 26, 15, 4, 5);
  const german = vm.runInContext(`new Date(${at}).toLocaleString()`, c, { filename: absSrc("js/ui/save-health.js") });
  assert.match(german, /^26\.11\.2026/, "fixture: the simulated browser locale is German");
  const shown = vm.runInContext(`Health.stamp(${at})`, c, { filename: absSrc("js/ui/save-health.js") });
  assert.match(shown, /^11\/2[56]\/2026/, "the en game locale formats the date, got " + shown);
  assert.notEqual(shown, german);
});

test("the rendered restore-point button shows the en date under a German browser (#6900)", async () => {
  const c = vm.createContext({ console, setTimeout, Promise });
  vm.runInContext(`(function(){ const o = Date.prototype.toLocaleString;
    Date.prototype.toLocaleString = function (l, x) { return o.call(this, l || "de-DE", x); }; })()`, c, { filename: absSrc("js/ui/save-health.js") });
  const dom = makeDom(); c.document = dom.document;
  vm.runInContext(src("js/core/i18n.js") + ";globalThis.I18n=I18n", c, { filename: absSrc("js/core/i18n.js") });
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", c, { filename: absSrc("js/ui/save-health.js") });
  const at = Date.UTC(2026, 10, 26, 15, 4, 5);
  const api = { async list() { return { ok: true, items: [{ id: "1", at, reason: "round", summary: { year: 2026, round: 1 } }] }; } };
  const health = c.Health.mount(dom.byId("health-locale"), { restorePoints: api });
  const [, slot, show, list] = health.root.children[1].children.at(-1).children;
  slot.value = "driver.0";
  await show.onclick();
  const label = list.children[0].textContent;
  assert.match(label, /^11\/2[56]\/2026/, "button label follows the en game locale, got " + label);
  assert.doesNotMatch(label, /^2[56]\.11\.2026/);
});
