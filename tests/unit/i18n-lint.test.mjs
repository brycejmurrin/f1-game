/* i18n-lint.test.mjs — tools/check/i18n-lint.mjs contribution lint + migrated-file guard.
 *
 * Fixture locales under tests/fixtures/i18n/: valid, missing-key (unknown + absent),
 * bad-placeholder, wrong-plural. The ship tree (locales/) must stay clean, and
 * --guard must pass while tests/data/i18n-migrated.json lists no files yet.
 *
 * Run: node --test tests/unit/i18n-lint.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractPlaceholders,
  extractPluralForms,
  pluralCategoriesFor,
  lintLocalePair,
  lintLocalesDir,
  guardSource,
  guardMigrated,
  run,
  MIGRATED,
  ALLOWLIST,
} from "../../tools/check/i18n-lint.mjs";
import {
  extractMessageCalls,
  readStringLiteral,
  deadLocaleKeys,
  generate,
} from "../../tools/gen/gen-locales.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = path.join(ROOT, "tests/fixtures/i18n");

test("extractPlaceholders sees named holes and plural anchors", () => {
  assert.deepEqual(extractPlaceholders("P{pos}. NICE"), ["pos"]);
  assert.deepEqual(
    extractPlaceholders("{n, plural, one {# lap} other {# laps}}"),
    ["n"],
  );
  // ICU-lite forbids nested select; placeholders beside a plural stay visible.
  assert.deepEqual(
    extractPlaceholders("{driver} — {n, plural, one {# lap} other {# laps}}"),
    ["driver", "n"],
  );
});

test("pluralCategoriesFor matches CLDR via Intl", () => {
  assert.deepEqual(new Set(pluralCategoriesFor("en")), new Set(["one", "other"]));
  assert.deepEqual(new Set(pluralCategoriesFor("ru")), new Set(["one", "few", "many", "other"]));
  assert.ok(pluralCategoriesFor("ar").includes("few"));
});

test("fixture valid: clean", () => {
  const r = lintLocalesDir(path.join(FIX, "valid"), { root: ROOT, allow: { keep: [], identical: [], unknown: [] } });
  assert.deepEqual(r.errors, [], r.errors.map((e) => e.msg).join("; "));
  assert.ok(r.languages.includes("de"));
});

test("fixture missing-key: unknown key fails; absent English key warns", () => {
  const r = lintLocalesDir(path.join(FIX, "missing-key"), { root: ROOT, allow: { keep: [], identical: [], unknown: [] } });
  const unknown = r.errors.filter((e) => e.code === "unknown-key");
  assert.equal(unknown.length, 1, "invented key must fail");
  assert.equal(unknown[0].key, "menu.invented");
  const missing = r.warnings.filter((e) => e.code === "missing-key");
  assert.ok(missing.some((w) => w.key === "menu.play"), "absent en key is a warning");
  assert.ok(r.errors.length >= 1);
});

test("fixture bad-placeholder: placeholder set mismatch fails", () => {
  const r = lintLocalesDir(path.join(FIX, "bad-placeholder"), { root: ROOT, allow: { keep: [], identical: [], unknown: [] } });
  const ph = r.errors.filter((e) => e.code === "placeholders");
  assert.ok(ph.length >= 2, `expected placeholder failures, got ${JSON.stringify(r.errors)}`);
  assert.ok(ph.some((e) => e.key === "radio.overtake"));
  assert.ok(ph.some((e) => e.key === "greet"));
});

test("fixture wrong-plural: Russian without few/many fails", () => {
  const r = lintLocalesDir(path.join(FIX, "wrong-plural"), { root: ROOT, allow: { keep: [], identical: [], unknown: [] } });
  const cats = r.errors.filter((e) => e.code === "plural-category");
  assert.ok(cats.some((e) => e.missing === "few"), JSON.stringify(cats));
  assert.ok(cats.some((e) => e.missing === "many"), JSON.stringify(cats));
});

test("lintLocalePair rejects identical-to-English unless keep/allowlisted", () => {
  const en = { "a.b": "Hello" };
  const bad = lintLocalePair(en, { "a.b": "Hello" }, "de");
  assert.ok(bad.errors.some((e) => e.code === "identical"));
  const ok = lintLocalePair(en, { "a.b": "Hello" }, "de", { allow: { keep: ["a.b"] } });
  assert.ok(!ok.errors.some((e) => e.code === "identical"));
});

test("extractPluralForms parses ICU-lite bodies", () => {
  const p = extractPluralForms("{n, plural, one {# lap} other {# laps}}");
  assert.equal(p.anchor, "n");
  assert.equal(p.forms.one, "# lap");
  assert.equal(p.forms.other, "# laps");
});

test("guardSource flags literal textContent / aria / Dom.el, skips I18n.t", () => {
  assert.equal(guardSource(`el.textContent = "Hi";`, "f.js").sites.length, 0, "2 letters under threshold");
  assert.equal(guardSource(`el.textContent = "SETTINGS";`, "f.js").sites.length, 1);
  assert.equal(guardSource(`el.textContent = I18n.t("k", null, "SETTINGS");`, "f.js").sites.length, 0);
  assert.equal(
    guardSource(`el.setAttribute("aria-label", "Close panel");`, "f.js").sites.length,
    1,
  );
  assert.equal(
    guardSource(`el.setAttribute("aria-label", I18n.t("k", null, "Close panel"));`, "f.js").sites.length,
    0,
  );
  assert.equal(guardSource(`Dom.el("span", null, "Hello world");`, "f.js").sites.length, 1);
  assert.equal(guardSource(`Dom.el("span", null, I18n.t("k", null, "Hello"));`, "f.js").sites.length, 0);
  assert.equal(guardSource(`el.textContent = name;`, "f.js").sites.length, 0, "dynamic is not a literal site");
});

test("guardMigrated on the ship tree is clean (empty migrated list)", () => {
  const a = guardMigrated(ROOT);
  assert.deepEqual(a.unaudited, []);
  assert.deepEqual(a.stale, []);
  assert.deepEqual(a.parseErrors, []);
  assert.ok(Array.isArray(readMigratedFiles()));
  function readMigratedFiles() {
    return JSON.parse(fs.readFileSync(path.join(ROOT, MIGRATED), "utf8")).files;
  }
});

test("ship locales/ pass i18n-lint (English-only baseline)", () => {
  const r = lintLocalesDir("locales", { root: ROOT });
  assert.deepEqual(r.errors, [], r.errors.map((e) => e.msg).join("; "));
});

test("CLI run --dir fixtures and --guard exit codes", () => {
  assert.equal(run(["--dir", "tests/fixtures/i18n/valid"], ROOT).exitCode, 0);
  assert.equal(run(["--dir", "tests/fixtures/i18n/bad-placeholder"], ROOT).exitCode, 1);
  assert.equal(run(["--dir", "tests/fixtures/i18n/wrong-plural"], ROOT).exitCode, 1);
  assert.equal(run(["--dir", "tests/fixtures/i18n/missing-key"], ROOT).exitCode, 1);
  assert.equal(run(["--guard"], ROOT).exitCode, 0);
});

test("allowlist file exists and is reviewed-shape (no silent hide)", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, ALLOWLIST), "utf8"));
  assert.ok(Array.isArray(doc.keep));
  assert.ok(Array.isArray(doc.identical));
  assert.ok(Array.isArray(doc.unknown));
  assert.equal(typeof doc.sites, "object");
  // Ship tree has no non-en locales yet — lists stay empty on purpose.
  assert.equal(doc.keep.length + doc.identical.length + doc.unknown.length, 0);
});

test("gen-locales extractMessageCalls keeps tr/hT and comma-heavy I18n.t defaults", () => {
  assert.deepEqual(readStringLiteral(`"a\\"b"`, 0), { value: 'a"b', end: 6 });
  const src = `
    I18n.t("hud.damage.label", { parts: out.length ? out.join(", ") : I18n.t("hud.damage.none", null, "none") }, "Car damage: {parts}");
    tr("results.stints.label", { stints: description }, "Tyre stints: {stints}");
    hT("hud.brakeBias", { pct: bb.slice(3) }, "Brake bias {pct} front");
    I18n.t("hud.tyre.lapsLeft", { n }, "about {n, plural, one {# lap} other {# laps}} left");
    I18n.t("hud.inputs." + dirKey, null, dirKey);
  `;
  const got = extractMessageCalls(src);
  assert.equal(got.get("hud.damage.label"), "Car damage: {parts}");
  assert.equal(got.get("hud.damage.none"), "none");
  assert.equal(got.get("results.stints.label"), "Tyre stints: {stints}");
  assert.equal(got.get("hud.brakeBias"), "Brake bias {pct} front");
  assert.equal(got.get("hud.tyre.lapsLeft"), "about {n, plural, one {# lap} other {# laps}} left");
  assert.equal(got.has("hud.inputs."), false, "dynamic key concat is skipped");
});

test("ship locales/en.json has no dead keys and includes remaining hud aria keys", () => {
  assert.deepEqual(deadLocaleKeys(ROOT), [], "hand-edited keys not produced by generate()");
  const want = JSON.parse(generate(ROOT)["locales/en.json"]);
  const have = JSON.parse(fs.readFileSync(path.join(ROOT, "locales/en.json"), "utf8"));
  for (const k of Object.keys(want)) assert.deepEqual(have[k], want[k], k);
  for (const k of [
    "hud.brakeBias",
    "hud.overtake.active",
    "hud.overtake.caution",
    "hud.overtake.lowGrip",
    "hud.overtake.openingLap",
    "hud.overtake.waitingLeader",
    "hud.overtake.unavailable",
    "hud.overtake.ready",
    "hud.overtake.earned",
    "hud.overtake.pending",
    "hud.aero.autoStraight",
    "hud.aero.auto",
    "hud.aero.none",
    "hud.aero.straight",
    "hud.aero.manual",
  ]) {
    assert.equal(typeof have[k], "string", k);
  }
});
