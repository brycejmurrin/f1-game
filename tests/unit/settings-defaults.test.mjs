/* settings-defaults — the shipped default lives in ONE place, and three
 * consumers must keep agreeing about it.
 *
 * js/data/settings-defaults.js holds the value. GameStore.get/raw answer from
 * it, so the game behaves that way. settings-export.js's defaultOf reports from
 * it, so an exported file's CHANGED list stays true. Any one of those drifting
 * fails nothing at runtime — it just makes the export quietly lie, which is the
 * exact failure the file was created to stop.
 *
 * Run: node --test tests/unit/settings-defaults.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { check, readSpec, readDefaults, reviewKeys } from "../../tools/gen/settings-defaults.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const DEFAULTS_SRC = new URL("../../js/data/settings-defaults.js", import.meta.url);
const STORE_SRC = new URL("../../js/core/store.js", import.meta.url);
const MANIFEST = new URL("../../tools/manifest.cjs", import.meta.url);

function load() {
  const ctx = { console, localStorage: { _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); }, clear() { this._m.clear(); } } };
  ctx.window = ctx; vm.createContext(ctx);
  seedSaveMigrate(ctx);   // js/core/store.js delegates career/season migration at eval
  vm.runInContext(fs.readFileSync(DEFAULTS_SRC, "utf8") + "\n;globalThis.SettingsDefaults = SettingsDefaults;", ctx);
  vm.runInContext(fs.readFileSync(STORE_SRC, "utf8") + "\n;globalThis.GameStore = GameStore;", ctx);
  return ctx;
}

test("every shipped default is a SPEC key and none is device-adaptive", () => {
  const r = check();
  assert.ok(r.ok, r.problems.join("\n"));
  assert.ok(r.keys > 0, "the defaults file is empty — nothing is being overridden");
});

test("the store answers from the file, not from the call-site literal", () => {
  const { GameStore, SettingsDefaults } = load();
  const store = GameStore.store;
  for (const k of SettingsDefaults.keys()) {
    const want = SettingsDefaults.get(k);
    // The literal passed here is deliberately absurd: if it comes back, the
    // override did not happen and the call site is still winning.
    const got = typeof want === "string" ? store.raw(k) : store.get(k, "__CALL_SITE__");
    assert.deepEqual(got, want, `${k}: store answered ${JSON.stringify(got)}, file says ${JSON.stringify(want)}`);
  }
});

test("a stored value still beats the shipped default", () => {
  const { GameStore, SettingsDefaults } = load();
  const store = GameStore.store;
  const k = SettingsDefaults.keys().find((x) => typeof SettingsDefaults.get(x) !== "string");
  store.set(k, 12345);
  assert.equal(store.get(k, "__CALL_SITE__"), 12345, `${k}: the player's own value must outrank the shipped default`);
});

test("an unlisted key is untouched — the override is opt-in per key", () => {
  const { GameStore, SettingsDefaults } = load();
  const store = GameStore.store;
  assert.equal(SettingsDefaults.has("thisKeyIsNotListed"), false);
  assert.equal(store.get("thisKeyIsNotListed", "fallback"), "fallback");
  // raw() must still answer null for "never set", which call sites read as meaningful
  assert.equal(store.raw("thisKeyIsNotListed"), null);
});

test("settings-export reports the shipped default, so CHANGED stays true", () => {
  const src = fs.readFileSync(new URL("../../js/ui/settings-export.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function defaultOf("), src.indexOf("\n}", src.indexOf("function defaultOf(")));
  assert.match(fn, /SettingsDefaults\.has\(row\.k\)/,
    "defaultOf must consult SettingsDefaults, or an export lists keys as changed that the player never touched");
});

test("the defaults file loads before the store that reads it", () => {
  const m = fs.readFileSync(MANIFEST, "utf8");
  const a = m.indexOf('"js/data/settings-defaults.js"'), b = m.indexOf('"js/core/store.js"');
  assert.ok(a > 0, "settings-defaults.js is not in the manifest — it would never ship");
  assert.ok(a < b, "settings-defaults.js must load BEFORE js/core/store.js, which consults it on every miss");
});

test("a SUBSYSTEM key is never silently promoted to a shipped default", () => {
  const { obj } = readDefaults();
  const review = reviewKeys();
  assert.ok(Object.keys(review).length > 0,
    "settings-export.js marks no key `subsystem:` — the classification was lost, and nothing now stops an export shipping the driving model");
  for (const [k, why] of Object.entries(review)) {
    assert.equal(Object.prototype.hasOwnProperty.call(obj, k), false,
      `${k} is in the shipped defaults: ${why}. It needs --include and a deliberate decision, not a drive-by export.`);
  }
});

test("the classification lives on the SPEC row, not in the tool", () => {
  // The point of the move: adding a key makes you answer the question, instead
  // of the tool's author having answered it for keys that existed that day.
  const src = fs.readFileSync(new URL("../../js/ui/settings-export.js", import.meta.url), "utf8");
  assert.match(src, /subsystem: "/, "no SPEC row declares `subsystem:` any more");
  const tool = fs.readFileSync(new URL("../../tools/gen/settings-defaults.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(tool, /export const REVIEW = \{/,
    "the tool is carrying its own hand-kept review list again — derive it from SPEC instead");
});

test("every key the driving model owns is marked", () => {
  // These four moved every scenario in tests/data/physics-baseline.json when
  // they briefly shipped as defaults. Naming them is what stops a future export
  // re-running that experiment silently.
  const review = reviewKeys();
  for (const k of ["preset", "steerRate", "tiltDeg", "adaptiveButtons", "pace"])
    assert.ok(review[k], `${k} is a steering default and must be marked \`subsystem:\` in settings-export.js`);
});
