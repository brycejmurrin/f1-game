/* Slice 6/7: CATALOG ids keep their English labels through Parts.optLabel; API-sourced names pass through I18n untranslated;
   no toLocaleString remains at the career money sites. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

test("every CATALOG id keeps its English label and a distinct key", () => {
  const { Parts } = loadParts();
  const seen = new Set();
  for (const cat of Parts.CATALOG) {
    assert.equal(Parts.catLabel(cat), cat.label);
    for (const o of cat.options) {
      assert.equal(Parts.optLabel(cat.id, o), o.label, `${cat.id}/${o.id}`);
      const k = `${cat.id}/${o.id}`;
      assert.ok(!seen.has(k), `duplicate ${k}`);
      seen.add(k);
    }
  }
  assert.ok(seen.size > 100);
});

test("locales/en.json carries every CATALOG label under its parts.<cat>.<opt>.label key", () => {
  const { Parts } = loadParts();
  const en = JSON.parse(fs.readFileSync("locales/en.json", "utf8"));
  for (const cat of Parts.CATALOG) {
    assert.equal(en[`parts.${cat.id}.label`], cat.label);
    for (const o of cat.options) assert.equal(en[`parts.${cat.id}.${o.id}.label`], o.label, `${cat.id}/${o.id}`);
  }
  assert.ok(/I18n\.t\("parts\." \+ catId \+ "\." \+ opt\.id \+ "\.label", null, opt\.label\)/.test(fs.readFileSync("js/car/parts.js", "utf8")));
});

test("API names in schedule.js / hub.js are never routed through I18n.t; dates use I18n.date", () => {
  for (const f of ["js/data/schedule.js", "js/data/hub.js"]) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/I18n\.t\([^\n]*/g)) {
      assert.ok(!/\.(name|raceName|raceTitle|driver|circuit|constructor|team|label)\b|Circuit|Driver/.test(m[0]), `${f}: API field in ${m[0]}`);
    }
    assert.ok(!/toLocale(Date|Time)?String\(/.test(s), `${f} dates use I18n.date`);
  }
});

test("career-ui money uses I18n.n, not toLocaleString", () => {
  assert.ok(!fs.readFileSync("js/career/career-ui.js", "utf8").includes("toLocaleString"));
});
