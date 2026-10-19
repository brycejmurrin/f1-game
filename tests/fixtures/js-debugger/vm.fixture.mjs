// js-debugger-node.test.mjs fixture: loads vmlib.fixture.js the three ways repo harnesses do —
// relative filename, absolute filename, no filename — with the harnesses' ^const→var rewrite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const abs = path.join(path.dirname(fileURLToPath(import.meta.url)), "vmlib.fixture.js");
const src = fs.readFileSync(abs, "utf8").replace(/^const\b/gm, "var");
for (const filename of ["tests/fixtures/js-debugger/vmlib.fixture.js", abs, undefined]) {
  test(`vm load, filename ${filename ? "given" : "absent"}`, () => {
    const ctx = vm.createContext({});
    vm.runInContext(src, ctx, filename ? { filename } : undefined);
    assert.equal(ctx.triple(2), 6);
  });
}
