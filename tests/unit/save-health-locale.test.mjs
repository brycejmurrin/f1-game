// Save Health dates follow the game's I18n locale, not the browser default (#6900).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
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
