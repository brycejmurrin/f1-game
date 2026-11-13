/* i18n-lang-validate.test.mjs — an unshipped or malformed language tag resolves to "en".
 *
 * `apex26.lang` = "x" threw `RangeError: Invalid language tag` from
 * `new Intl.PluralRules` inside the frame loop (every plural HUD label), and any
 * stored value was spliced into a `locales/<value>.json` fetch URL. js/core/i18n.js
 * now validates every stored / ?lang= / set() / boot() tag against its frozen
 * SHIPPED_LANGS (plus the en-XA pseudo locale and the loaded manifest) before a
 * URL is built, and every Intl constructor takes a tag that cannot throw.
 *
 * Run: node --test tests/unit/i18n-lang-validate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BAD = ["x", "", "   ", "a".repeat(5000), "../../etc", "en/../../etc", "e n", "%2e%2e", "de-DE-x-" + "y".repeat(40)];

function loadI18n({ stored, search = "", manifest } = {}) {
  const fetched = [];
  const m = new Map();
  if (stored !== undefined) m.set("apex26.lang", JSON.stringify(stored));
  const ctx = {
    URLSearchParams, console,
    localStorage: {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); }, clear: () => m.clear(),
    },
    location: { search, href: "http://localhost/" + search },
    navigator: { languages: ["en-US"], language: "en-US" },
    document: { documentElement: { lang: "en", dir: "ltr", setAttribute() {} }, addEventListener() {}, querySelectorAll() { return []; } },
    fetch: async (url) => {
      fetched.push(String(url));
      if (String(url) === "locales/manifest.json") {
        return { ok: true, status: 200, json: async () => manifest || JSON.parse(fs.readFileSync(path.join(ROOT, "locales/manifest.json"), "utf8")) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  for (const f of ["js/data/settings-defaults.js", "js/core/store.js", "js/core/i18n-pseudo.js", "js/core/i18n.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  vm.runInContext("globalThis.GameStore = GameStore; globalThis.I18n = I18n;", ctx);
  return { ctx, I18n: ctx.I18n, fetched };
}

const plural = "{n, plural, one {# lap} other {# laps}}";
const localeUrls = (fetched) => fetched.filter((u) => u !== "locales/manifest.json");

test("SHIPPED_LANGS equals the locales/*.json directory listing and locales/manifest.json", () => {
  const { I18n } = loadI18n();
  const shipped = [...I18n.SHIPPED_LANGS].sort();
  assert.ok(Object.isFrozen(I18n.SHIPPED_LANGS), "the list is frozen");
  const files = fs.readdirSync(path.join(ROOT, "locales")).filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .map((f) => f.slice(0, -".json".length)).sort();
  assert.deepEqual(shipped, files, "one SHIPPED_LANGS entry per locales/<tag>.json");
  const manifest = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "locales/manifest.json"), "utf8"))).sort();
  assert.deepEqual(shipped, manifest, "locales/manifest.json lists the same tags");
  // SW_LOCALES (tools/manifest.cjs) precaches only the manifest; every entry it names must exist.
  const { SW_LOCALES } = require("../../tools/manifest.cjs");
  for (const rel of SW_LOCALES) assert.ok(fs.existsSync(path.join(ROOT, rel)), `SW_LOCALES entry ${rel} exists`);
  assert.ok(SW_LOCALES.every((rel) => rel.startsWith("locales/")), "SW_LOCALES only names locales/ files");
});

for (const bad of BAD) {
  const label = bad.length > 40 ? `${bad.slice(0, 12)}… (${bad.length} chars)` : JSON.stringify(bad);
  test(`stored lang ${label} resolves to "en" with no locale URL and no throw`, async () => {
    const { I18n, fetched } = loadI18n({ stored: bad });
    assert.equal(I18n._detect(), "en");
    await I18n.boot();
    assert.equal(I18n.lang(), "en");
    assert.equal(I18n.t("laps", { n: 2 }, plural), "2 laps", "plural labels format (no RangeError)");
    assert.doesNotThrow(() => I18n.n(1234.5));
    assert.deepEqual(localeUrls(fetched), [], "no locale URL built from the stored value");
  });

  test(`?lang=${label.slice(0, 40)} and set()/boot() with it resolve to "en"`, async () => {
    const { I18n, fetched } = loadI18n({ search: "?lang=" + encodeURIComponent(bad) });
    assert.equal(I18n._detect(), "en");
    assert.equal(await I18n.set(bad, { persist: false }), "en");
    assert.equal(I18n.lang(), "en");
    await I18n.boot(bad);
    assert.equal(I18n.lang(), "en");
    assert.equal(I18n.t("laps", { n: 1 }, plural), "1 lap");
    assert.deepEqual(localeUrls(fetched), [], "no locale URL built from the requested value");
  });
}

test("a well-formed tag the manifest does not list falls back to English without a locale fetch", async () => {
  const { I18n, fetched } = loadI18n({ stored: "fr" });
  await I18n.boot();
  assert.equal(I18n.lang(), "en");
  assert.deepEqual(localeUrls(fetched), []);
});

test("a tag the loaded manifest lists still loads its file", async () => {
  const { I18n, fetched } = loadI18n({ stored: "fr", manifest: { en: { hash: "" }, fr: { hash: "ab12" } } });
  await I18n.boot();
  assert.equal(I18n.lang(), "fr");
  assert.deepEqual(localeUrls(fetched), ["locales/fr.json?v=ab12"]);
});

test("Intl constructors never see a malformed tag, even through _installCatalog", () => {
  const { I18n } = loadI18n();
  for (const bad of BAD) {
    I18n._installCatalog(bad, {});
    assert.doesNotThrow(() => I18n.t("laps", { n: 3 }, plural));
    assert.doesNotThrow(() => I18n.n(1));
    assert.doesNotThrow(() => I18n.date(new Date(0)));
    assert.doesNotThrow(() => I18n.pluralCategories(bad));
  }
});
