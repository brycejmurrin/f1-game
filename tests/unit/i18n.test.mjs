/* i18n.test.mjs — lookup chain, placeholders, plurals, detection, pseudo-locale. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadI18n(extra = {}) {
  const ctx = {
    URLSearchParams,
    console,
    localStorage: {
      _m: new Map(),
      getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
      setItem(k, v) { this._m.set(k, String(v)); },
      removeItem(k) { this._m.delete(k); },
      clear() { this._m.clear(); },
    },
    location: { search: "", href: "http://localhost/" },
    navigator: { languages: ["en-US"], language: "en-US" },
    document: {
      documentElement: { lang: "en", dir: "ltr", setAttribute() {} },
      addEventListener() {},
      querySelectorAll() { return []; },
    },
    fetch: async () => ({ ok: false, status: 404 }),
    ...extra,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  for (const f of [
    "js/data/settings-defaults.js",
    "js/core/store.js",
    "js/core/i18n-pseudo.js",
    "js/core/i18n.js",
    "js/core/dom-apply.js",
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  vm.runInContext("globalThis.GameStore = GameStore;", ctx);
  return ctx;
}

beforeEach(() => {
  // each test gets a fresh load via loadI18n
});

test("lookup chain: catalogue, then English default, then key", () => {
  const { I18n } = loadI18n();
  I18n._resetForTest();
  I18n._installCatalog("de", { "probe.key": "Katalog" });
  assert.equal(I18n.t("probe.key", null, "Fallback"), "Katalog");
  I18n._installCatalog("de", {});
  assert.equal(I18n.t("probe.key", null, "Fallback"), "Fallback");
  assert.equal(I18n.t("missing.only", null, null), "missing.only");
});

test("placeholders fill {name} holes", () => {
  const { I18n } = loadI18n();
  I18n._resetForTest();
  assert.equal(
    I18n.t("greet", { name: "Apex" }, "Hello, {name}!"),
    "Hello, Apex!",
  );
});

test("English plural one/other", () => {
  const { I18n } = loadI18n();
  I18n._resetForTest();
  const msg = "{n, plural, one {# lap} other {# laps}}";
  assert.equal(I18n.t("laps", { n: 1 }, msg), "1 lap");
  assert.equal(I18n.t("laps", { n: 3 }, msg), "3 laps");
});

test("Russian plural categories resolve", () => {
  const { I18n } = loadI18n();
  I18n._resetForTest();
  I18n._installCatalog("ru", {});
  const msg = "{n, plural, one {# круг} few {# круга} many {# кругов} other {# кругов}}";
  assert.equal(I18n.t("laps", { n: 1 }, msg), "1 круг");
  assert.equal(I18n.t("laps", { n: 2 }, msg), "2 круга");
  assert.equal(I18n.t("laps", { n: 5 }, msg), "5 кругов");
  assert.deepEqual(new Set(I18n.pluralCategories("ru")), new Set(["one", "few", "many", "other"]));
});

test("Arabic plural categories resolve", () => {
  const { I18n } = loadI18n();
  I18n._resetForTest();
  I18n._installCatalog("ar", {});
  const msg = "{n, plural, zero {لا} one {واحد} two {اثنان} few {قليل} many {كثير} other {أخرى}}";
  assert.equal(I18n.t("n", { n: 0 }, msg), "لا");
  assert.equal(I18n.t("n", { n: 1 }, msg), "واحد");
  assert.ok(I18n.pluralCategories("ar").includes("few"));
});

test("detection order: query beats saved beats navigator", () => {
  const ctx = loadI18n({
    navigator: { languages: ["de-DE"], language: "de" },
  });
  const { I18n, GameStore } = ctx;
  I18n._resetForTest();
  vm.runInContext('globalThis.location = { search: "?lang=en-XA", href: "http://localhost/?lang=en-XA" };', ctx);
  GameStore.store.set("lang", "fr");
  assert.equal(vm.runInContext("I18n._detect()", ctx), "en-XA");
  vm.runInContext("I18n._resetForTest()", ctx);
  vm.runInContext('globalThis.location = { search: "", href: "http://localhost/" };', ctx);
  GameStore.store.set("lang", "fr");
  assert.equal(vm.runInContext("I18n._detect()", ctx), "fr");
});

test("en-XA pseudo expands the resolved string", () => {
  const { I18n } = loadI18n();
  I18n._resetForTest();
  I18n._installCatalog("en-XA", {});
  const out = I18n.t("settings.title", null, "SETTINGS");
  assert.notEqual(out, "SETTINGS");
  assert.ok(out.includes("["), "pseudo wraps in brackets");
  assert.ok(out.length > "SETTINGS".length);
});

test("plain English does not fetch a locale file", async () => {
  let fetches = 0;
  const { I18n } = loadI18n({
    fetch: async (url) => {
      fetches += 1;
      if (String(url).includes("manifest.json")) {
        return { ok: true, status: 200, json: async () => ({ en: { name: "English", dir: "ltr", status: "reviewed", hash: "x", keys: 1 } }) };
      }
      throw new Error("unexpected " + url);
    },
  });
  I18n._resetForTest();
  await I18n.boot("en");
  assert.equal(fetches, 0, "English inline defaults — no locale fetch");
});
