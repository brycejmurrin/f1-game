/* Lap times and gaps are '.'-formatted in every locale; only prose numbers localise (I18n.n). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { withI18n } from "../helpers/i18n-ctx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function load(lang) {
  const ctx = withI18n(vm.createContext({ console }));
  vm.runInContext(read("js/ui/dom.js") + "; this.Dom = Dom;", ctx, { filename: absSrc("js/ui/dom.js") });
  vm.runInContext(read("js/ui/hud-relative.js") + "; this.HudRelative = HudRelative;", ctx, { filename: absSrc("js/ui/hud-relative.js") });
  ctx.I18n._installCatalog(lang, {});
  return ctx;
}

for (const lang of ["en", "en-XA", "de"]) {
  test(`Dom.fmtLap and gap text stay '.'-formatted under ${lang}`, () => {
    const { Dom, HudRelative } = load(lang);
    assert.equal(Dom.fmtLap(81.163), "1:21.163");
    assert.equal(Dom.fmtLap(58.402), "58.402");
    assert.equal(Dom.fmtLap(0, "—"), "—");
    assert.equal(Dom.fmtRaceClock(5534.53), "1:32:14.530");
    assert.equal(HudRelative.fmtGap(1.234, true).includes(","), false);
  });
}

test("prose numbers localise: I18n.n groups per locale", () => {
  const de = load("de").I18n, en = load("en").I18n;
  assert.equal(en.n(12345.6), "12,345.6");
  assert.equal(de.n(12345.6), "12.345,6");
});
