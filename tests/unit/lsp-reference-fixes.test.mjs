import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TSC = path.join(ROOT, "node_modules/.bin/tsc");

function fixture() {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "apex-lsp-ref-fixes-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "jsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, include: ["src/**/*.js"] }));
  fs.writeFileSync(path.join(root, "src/case.js"), `"use strict";
window.Beta = { KEY: 1 }; /*@beta-def*/
const dot = Beta.KEY; /*@dot*/
const bracket = Beta["KEY"]; /*@bracket*/
const Direct = Beta;
const directUse = Direct.KEY; /*@direct-alias*/
const Guarded = Beta || {};
const guardedUse = Guarded.KEY; /*@guarded-alias*/
const Loose = typeof Beta != "undefined" ? Beta : {};
const looseUse = Loose.KEY; /*@loose-guard*/
const Reverse = "undefined" !== typeof Beta ? Beta : null;
const reverseUse = Reverse.KEY; /*@reverse-guard*/
const Wrapped = (("undefined" != typeof Beta && Beta)) || {};
const wrappedUse = Wrapped.KEY; /*@wrapped-guard*/
function reverseParam(Beta) { const R = "undefined" != typeof Beta ? Beta : {}; return R.KEY; } /*@reverse-param-shadow*/
function directParam(Beta) { const D = Beta; return D.KEY; } /*@direct-param-shadow*/
function orParam(Beta) { const P = Beta || {}; return P.KEY; } /*@or-param-shadow*/
function ternaryParam(Beta) { const T = typeof Beta !== "undefined" ? Beta : {}; return T.KEY; } /*@ternary-param-shadow*/
function andParam(Beta) { const A = (typeof Beta !== "undefined" && Beta) || {}; return A.KEY; } /*@and-param-shadow*/
function localShadow() { const Beta = { KEY: 9 }; const L = Beta || {}; return L.KEY; } /*@local-shadow*/
function shadowWindow(window) { return window.Beta.KEY; } /*@shadow-window-direct*/
function aliasShadowWindow(window) { const W = window.Beta; return W.KEY; } /*@shadow-window-alias*/
window.Replaced = Object.assign(window.Replaced || {}, { value: "old" }); /*@old*/
window.Replaced = Object.assign(window.Replaced || {}, { value: "new" }); /*@new*/
function unrelated() { const source = { value: "wrong scope" }; return source; } /*@wrong-spread-source*/
const source = { value: "runtime overwrite" }; /*@spread-source*/
window.Spread = { value: "before spread", ...source }; /*@before-spread*/
window.Target = Object.assign({ value: "literal target" }, { other: 2 }); /*@literal-target*/
window.Same = { value: "first" }; window.Same = { value: "second" }; /*@same-line*/
`);
  return root;
}

function cjsFixture() {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "apex-lsp-cjs-refs-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "jsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, include: ["src/**/*.js"] }));
  fs.writeFileSync(path.join(root, "src/case.js"), `"use strict";
const base = { KEY: 1 }; /*@base-def*/
const Hidden = base;
const direct = Hidden.KEY; /*@cjs-direct*/
const Alias = Hidden;
const aliasUse = Alias.KEY; /*@cjs-alias*/
function shadow() { const Hidden = { KEY: 9 }; const Local = Hidden; return Local.KEY; } /*@cjs-shadow*/
module.exports = Hidden;
`);
  return root;
}

async function ask(lsp, name, args) {
  const r = await callTool(lsp, name, args);
  assert.equal(r.isError, false, r.content?.[0]?.text);
  return r.content[0].text;
}

test("fallback references use lexical heads and include literal bracket members", async () => {
  const root = fixture(), lsp = new Lsp({ root, src: "src", anchor: "src/case.js", cmd: TSC, idleMs: 0 });
  try {
    const out = await ask(lsp, "lsp_references", { symbol: "Beta.KEY" });
    for (const marker of ["beta-def", "dot", "bracket", "direct-alias", "guarded-alias", "loose-guard", "reverse-guard", "wrapped-guard"]) assert.match(out, new RegExp(`@${marker}\\b`));
    for (const marker of ["direct-param-shadow", "reverse-param-shadow", "or-param-shadow", "ternary-param-shadow", "and-param-shadow", "local-shadow", "shadow-window-direct", "shadow-window-alias"]) assert.doesNotMatch(out, new RegExp(`@${marker}\\b`));
    const uses = await ask(lsp, "lsp_references", { symbol: "Beta.KEY", includeDeclaration: false });
    assert.doesNotMatch(uses, /@beta-def\b/); assert.match(uses, /@dot\b/); assert.match(uses, /@bracket\b/);
  } finally { lsp.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("fallback definitions retain overwrites and qualify spread order", async () => {
  const root = fixture(), lsp = new Lsp({ root, src: "src", anchor: "src/case.js", cmd: TSC, idleMs: 0 });
  try {
    const replaced = await ask(lsp, "lsp_definition", { symbol: "Replaced.value" });
    assert.match(replaced, /@old\b/); assert.match(replaced, /@new\b/);
    assert.match(replaced, /multiple assignments|load order/i);
    const spread = await ask(lsp, "lsp_definition", { symbol: "Spread.value" });
    assert.match(spread, /@before-spread\b/); assert.match(spread, /@spread-source\b/);
    assert.doesNotMatch(spread, /@wrong-spread-source\b/);
    assert.match(spread, /spread.*overwrite|overwrite.*spread/i);
    const target = await ask(lsp, "lsp_definition", { symbol: "Target.value" });
    assert.match(target, /@literal-target\b/);
    const same = await ask(lsp, "lsp_definition", { symbol: "Same.value" });
    assert.match(same, /2 definitions/);
    assert.match(same, /multiple assignments\/member contributions/);
    assert.match(same, /runtime load order may determine the winner/);
  } finally { lsp.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("CommonJS fallback follows only the exported owner binding", async () => {
  const root = cjsFixture(), lsp = new Lsp({ root, src: "src", anchor: "src/case.js", cmd: TSC, idleMs: 0 });
  try {
    const refs = await ask(lsp, "lsp_references", { symbol: "Hidden.KEY" });
    assert.match(refs, /@base-def\b/); assert.match(refs, /@cjs-direct\b/); assert.match(refs, /@cjs-alias\b/);
    assert.doesNotMatch(refs, /@cjs-shadow\b/);
    const def = await ask(lsp, "lsp_definition", { symbol: "Hidden.KEY" });
    assert.match(def, /@base-def\b/);
  } finally { lsp.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});
