import "../helpers/git-fixture-env.mjs";
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
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "lsp-workflow-fixes-"));
  const files = {
    "jsconfig.json": JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }),
    "src/owner.js": `"use strict";
const source = { KEY() { return 1; } }; /*@owner-def*/
const Hidden = source;
const own = Hidden.KEY; /*@owner-use*/
module.exports = Hidden;
`,
    "src/consumer.js": `"use strict";
function direct() { return Hidden.KEY(); } /*@direct*/
function optional() { return Hidden?.KEY(); } /*@optional*/
function bracket() { return Hidden["KEY"](); } /*@bracket*/
const { KEY: picked } = Hidden; /*@destructure*/
function destructured() { return picked(); } /*@destructured-call*/
const Whole = Hidden;
function aliased() { return Whole.KEY(); } /*@whole-alias*/
function paramShadow(Hidden) { return Hidden.KEY(); } /*@param-shadow*/
function localShadow() { const Hidden = { KEY() { return 9; } }; return Hidden.KEY(); } /*@local-shadow*/
`,
    "src/unrelated.js": `"use strict";
const Hidden = { KEY() { return 7; } };
function unrelatedOwner() { return Hidden.KEY(); } /*@unrelated-owner*/
`,
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

function repeatedIifeFixture() {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "lsp-repeated-iife-"));
  const files = {
    "jsconfig.json": JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }),
    "src/a-stub.js": `"use strict";
var before = 1, /* title stub */ Audio = (function () {
  function stubGeneration() { return 0; } /*@stub-helper*/
  return { generation: stubGeneration };
})();
`,
    "src/z-real.js": `"use strict";
var /* lazy replacement */
Audio = (function () {
  let generation = 4;
  return { generation: () => generation /*@real-generation*/ };
})();
`,
    "src/consumer.js": `"use strict";
function directConsumer() { return Audio.generation(); } /*@direct-consumer*/
function parameterShadow(Audio) { return Audio.generation(); } /*@parameter-shadow*/
function localShadow() { const Audio = { generation: () => 9 }; return Audio.generation(); } /*@local-shadow*/
function injected(audio) { return audio.generation(); } /*@injected-alias*/
const unrelated = { generation: () => 8 }; /*@same-member*/
`,
    "src/other-owner.js": `"use strict";
const Audio = { generation: () => 7 };
function unrelatedOwner() { return Audio.generation(); } /*@unrelated-owner*/
`,
    "src/math.js": `"use strict";
const M4 = { lerp(a, b, t) { return a + (b - a) * t; } };
`,
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

async function ask(lsp, name, args) {
  const result = await callTool(lsp, name, args);
  assert.equal(result.isError, false, result.content?.[0]?.text);
  return result.content[0].text;
}

test("CommonJS fallback keeps its owner identity and finds unshadowed browser-global consumers", async () => {
  const root = fixture();
  const lsp = new Lsp({ root, src: "src", anchor: "src/owner.js", cmd: TSC, idleMs: 0 });
  try {
    const refs = await ask(lsp, "lsp_references", { symbol: "Hidden.KEY", limit: 100 });
    for (const marker of ["owner-def", "owner-use", "direct", "optional", "bracket", "destructure", "whole-alias"])
      assert.match(refs, new RegExp(`@${marker}\\b`), marker);
    for (const marker of ["param-shadow", "local-shadow", "unrelated-owner"])
      assert.doesNotMatch(refs, new RegExp(`@${marker}\\b`), marker);

    const uses = await ask(lsp, "lsp_references", { symbol: "Hidden.KEY", includeDeclaration: false, limit: 100 });
    assert.doesNotMatch(uses, /@owner-def\b/);
    assert.match(uses, /@direct\b/);

    const files = await ask(lsp, "lsp_references", { symbol: "Hidden.KEY", files: true });
    assert.match(files, /^src\/owner\.js \d+$/m);
    assert.match(files, /^src\/consumer\.js \d+$/m);
    assert.doesNotMatch(files, /^src\/unrelated\.js /m);

    const callers = await ask(lsp, "lsp_callers", { symbol: "Hidden.KEY", path: "src/consumer.js", limit: 100 });
    for (const owner of ["direct", "optional", "bracket", "destructured", "aliased"])
      assert.match(callers, new RegExp(`\\b${owner}\\b`), owner);
    for (const owner of ["paramShadow", "localShadow", "unrelatedOwner"])
      assert.doesNotMatch(callers, new RegExp(`\\b${owner}\\b`), owner);
  } finally {
    lsp.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("repeated script-global IIFEs expose every member declaration without inventing aliases", async () => {
  const root = repeatedIifeFixture();
  const lsp = new Lsp({ root, src: "src", anchor: "src/a-stub.js", cmd: TSC, idleMs: 0 });
  try {
    const definitions = await ask(lsp, "lsp_definition", { symbol: "Audio.generation", body: true, maxLines: 5 });
    assert.match(definitions, /2 definitions/);
    assert.match(definitions, /function stubGeneration\(\)/);
    assert.match(definitions, /@stub-helper\b/);
    assert.match(definitions, /@real-generation\b/);
    assert.match(definitions, /multiple assignments\/member contributions/);
    assert.match(definitions, /runtime load order may determine the winner/);

    const refs = await ask(lsp, "lsp_references", { symbol: "Audio.generation", limit: 100 });
    assert.match(refs, /@stub-helper\b/);
    assert.match(refs, /@real-generation\b/);
    assert.match(refs, /@direct-consumer\b/);
    for (const marker of ["parameter-shadow", "local-shadow", "injected-alias", "same-member", "unrelated-owner"])
      assert.doesNotMatch(refs, new RegExp(`@${marker}\\b`), marker);

    const callers = await ask(lsp, "lsp_callers", { symbol: "Audio.generation", path: "src/consumer.js", limit: 100 });
    assert.match(callers, /\bdirectConsumer\b/);
    for (const owner of ["parameterShadow", "localShadow", "injected", "unrelatedOwner"])
      assert.doesNotMatch(callers, new RegExp(`\\b${owner}\\b`), owner);
  } finally {
    lsp.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("repeated-IIFE discovery parses only plausible owner files and caches each text revision", async () => {
  const root = repeatedIifeFixture();
  const lsp = new Lsp({ root, src: "src", anchor: "src/a-stub.js", cmd: TSC, idleMs: 0 });
  try {
    lsp.scan(true);
    const parsed = [], astOf = lsp.astOf.bind(lsp);
    lsp.astOf = file => { parsed.push(file); return astOf(file); };
    assert.equal(lsp.repeatedIifeDecl("M4"), null);
    assert.deepEqual(parsed, [], "an ordinary single global does not parse project files for reinjection detection");
    assert.equal(lsp.repeatedIifeDecl("Audio", true).length, 2);
    assert.deepEqual(parsed.sort(), ["src/a-stub.js", "src/z-real.js"]);
    parsed.length = 0;
    assert.equal(lsp.repeatedIifeDecl("Audio", true).length, 2);
    assert.deepEqual(parsed, [], "the per-text-revision owner scan is cached");
  } finally {
    lsp.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("same-statement reinjections contribute each distinct member definition once", async () => {
  const root = repeatedIifeFixture();
  fs.writeFileSync(path.join(root, "src/same-statement.js"), 'var Audio = (() => ({ generation: () => 11 }))(), Audio = (() => ({ generation: () => 12 }))();\n');
  const lsp = new Lsp({ root, src: "src", anchor: "src/a-stub.js", cmd: TSC, idleMs: 0 });
  try {
    const definitions = await ask(lsp, "lsp_definition", { symbol: "Audio.generation", format: "concise" });
    assert.match(definitions, /^4 definitions/);
    const rows = definitions.split("\n").filter(row => /^src\//.test(row));
    assert.equal(rows.length, 4);
    assert.equal(new Set(rows).size, 4);
  } finally {
    lsp.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
