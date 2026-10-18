import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";

test("callers follow aliases and declaration anchors while preserving lexical owners", { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-caller-fixes-"));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  write("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  write("src/callers.js", `"use strict";
const Hub = (function () {
  function fire(x) { return x + 1; }
  return { fire };
})();
function direct() { return Hub.fire(1); }
const arrow = () => Hub.fire(2);
const objA = { duplicate() { return Hub.fire(3); } };
const objB = { duplicate() { return Hub.fire(4); } };
const directAlias = Hub.fire;
function aliasCaller() { return directAlias(5); }
const { fire: picked } = Hub;
function destructuredCaller() { return picked(6); }
globalThis.keep = { direct, arrow, objA, objB, aliasCaller, destructuredCaller };
`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/callers.js", idleMs: 0 });
  const query = async args => {
    const result = await callTool(lsp, "lsp_callers", args);
    assert.equal(result.isError, false, result.content[0].text);
    return result.content[0].text;
  };
  try {
    const symbol = await query({ symbol: "Hub.fire" });
    assert.match(symbol, /^6 uses in 6 functions across 1 file/);
    assert.match(symbol, /\nsrc\/callers\.js:7 {2}arrow {2}×1/);
    assert.match(symbol, /\nsrc\/callers\.js:8 {2}objA › duplicate {2}×1/);
    assert.match(symbol, /\nsrc\/callers\.js:9 {2}objB › duplicate {2}×1/);
    assert.match(symbol, /aliasCaller \(via directAlias\)/);
    assert.match(symbol, /destructuredCaller \(via picked\)/);
    const declaration = await query({ file: "src/callers.js", line: 3, column: 12 });
    assert.equal(declaration.replace(/query at [^)]+/, "query at <position>"), symbol.replace(/query at [^)]+/, "query at <position>"));
    const use = await query({ file: "src/callers.js", line: 6, column: 32 });
    assert.equal(use.replace(/query at [^)]+/, "query at <position>"), symbol.replace(/query at [^)]+/, "query at <position>"));
  } finally {
    lsp.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
