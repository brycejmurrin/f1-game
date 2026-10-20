// Every vendored package ships a licence file, and a package whose package.json
// names an SPDX licence ships the matching text (#3092: rapier carried three.js's MIT text).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VENDOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vendor");
const MARKERS = {
  "Apache-2.0": /Apache License\s+Version 2\.0/,
  "MIT": /Permission is hereby granted, free of charge/,
};
const FIRST_PARTY = new Set(["three-patches"]);
const dirs = fs.readdirSync(VENDOR, { withFileTypes: true }).filter((e) => e.isDirectory() && !FIRST_PARTY.has(e.name));

test("every vendor/ package has a licence file", () => {
  for (const d of dirs) {
    const files = fs.readdirSync(path.join(VENDOR, d.name));
    assert.ok(files.some((f) => /^(SPDX-)?[A-Z-]*LICEN[CS]E/i.test(f)), `vendor/${d.name}: no licence file`);
  }
});

test("a declared SPDX licence matches its licence text", () => {
  let checked = 0;
  for (const d of dirs) {
    const pj = path.join(VENDOR, d.name, "package.json");
    if (!fs.existsSync(pj)) continue;
    const spdx = JSON.parse(fs.readFileSync(pj, "utf8")).license;
    if (!MARKERS[spdx]) continue;
    const f = fs.readdirSync(path.join(VENDOR, d.name)).find((n) => /^LICEN[CS]E(\.\w+)?$/.test(n));
    assert.ok(f, `vendor/${d.name}: package.json says ${spdx} but no LICENSE file`);
    const text = fs.readFileSync(path.join(VENDOR, d.name, f), "utf8");
    assert.match(text, MARKERS[spdx], `vendor/${d.name}/${f} does not read as ${spdx}`);
    checked++;
  }
  assert.ok(checked >= 1, "rapier (Apache-2.0) must be covered");
});
