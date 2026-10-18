import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
async function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-nav-"));
  const files = {
    "jsconfig.json": JSON.stringify({ compilerOptions: { allowJs: true, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }),
    "src/core/log.js": '"use strict";\n',
    "src/core/ops.js": 'const Ops = (() => {\n  function run(v) { return v + 1; }\n  return { run };\n})();\n',
    "src/ui/panel.js": 'const Panel = (() => {\n  const alias = Ops.run;\n  const draw = () => alias(2);\n  const { run: picked } = Ops;\n  const drawPicked = () => picked(5);\n  function update() { return Ops.run(1); }\n  return { draw, drawPicked, update };\n})();\n',
    "src/ui-extra/decoy.js": 'function decoy() { return Ops.run(3); }\n',
    "src/engine/drive.js": 'function drive() { return Ops.run(4); }\n',
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  const lsp = new Lsp({ root, src: "src", anchor: "src/core/log.js", cmd: path.join(ROOT, "node_modules/.bin/tsc"), idleMs: 0 });
  try { await fn(lsp, root); }
  finally { lsp.stop(); fs.rmSync(root, { recursive: true, force: true }); }
}
async function query(lsp, name, args) {
  const result = await callTool(lsp, name, args);
  assert.equal(result.isError, false, result.content[0].text);
  return result.content[0].text;
}
const locationRows = text => text.split("\n").filter(row => /^src\/[^:]+:\d+/.test(row));

test("navigation scopes retain aliases and filter before paging at directory boundaries", async () => {
  await fixture(async lsp => {
    const all = await query(lsp, "lsp_references", { symbol: "Ops.run", limit: 100, format: "concise" });
    const scoped = await query(lsp, "lsp_references", { symbol: "Ops.run", path: "./src/ui/", limit: 100, format: "concise" });
    const expected = locationRows(all).filter(row => row.startsWith("src/ui/"));
    assert.ok(expected.length >= 3, "references include both alias declarations and the direct member use");
    assert.match(expected.join("\n"), /\[alias\]/);
    assert.deepEqual(locationRows(scoped), expected);
    assert.match(scoped, /src\/ui/);
    const page = await query(lsp, "lsp_references", { symbol: "Ops.run", path: "src/ui", offset: 1, limit: 1, format: "concise" });
    assert.deepEqual(locationRows(page), expected.slice(1, 2));
    const callers = await query(lsp, "lsp_callers", { symbol: "Ops.run", path: "src/ui", limit: 100 });
    assert.match(callers, /^3 uses in 3 functions across 1 file/);
    assert.match(callers, /draw.*via alias/);
    assert.match(callers, /drawPicked.*via picked/);
    assert.match(callers, /update/);
    assert.doesNotMatch(callers, /^src\/(?:ui-extra|engine)\//m);
    assert.doesNotMatch(callers, /via Panel/);
    const callerFiles = await query(lsp, "lsp_callers", { symbol: "Ops.run", path: "src/ui", files: true, limit: 1 });
    assert.match(callerFiles, /^src\/ui\/panel\.js 3 uses in 3 functions$/m);
    assert.doesNotMatch(callerFiles, /more \(offset/);
    const file = await query(lsp, "lsp_references", { symbol: "Ops.run", path: "src/ui/panel.js", files: true });
    assert.match(file, /^src\/ui\/panel\.js \d+$/m);
    assert.doesNotMatch(file, /^src\/(?:ui-extra|engine)\//m);
    const absent = await query(lsp, "lsp_callers", { symbol: "Ops.run", path: "src/not-present" });
    assert.match(absent, /^0 uses in 0 functions across 0 files/);
    const outside = await query(lsp, "lsp_definition", { symbol: "Ops.run", path: "src/ui", body: true });
    assert.match(outside, /^0 definitions/);
    assert.doesNotMatch(outside, /function run\(v\)/);
  });
});

test("file summaries avoid unused enclosing-function formatting", async () => {
  await fixture(async lsp => {
    let whereCalls = 0;
    lsp.where = async () => { whereCalls++; throw Error("unnecessary document-symbol lookup"); };
    const text = await query(lsp, "lsp_references", { symbol: "Ops.run", files: true });
    assert.match(text, /^src\/ui\/panel\.js \d+$/m);
    assert.match(text, /^src\/engine\/drive\.js \d+$/m);
    assert.equal(whereCalls, 0, "file-count responses must not build discarded source rows");
  });
});

test("overlapping compiler and alias routes count each source use once", async () => {
  await fixture(async (lsp, root) => {
    fs.appendFileSync(path.join(root, "src/ui/panel.js"), '\nfunction twice() { return Ops.run(1) + Ops.run(2); }\n');
    const request = lsp.request.bind(lsp);
    lsp.request = async (method, args) => {
      const result = await request(method, args);
      return method === "textDocument/references" && Array.isArray(result) ? [...result, ...result] : result;
    };
    const callers = await query(lsp, "lsp_callers", { symbol: "Ops.run", path: "src/ui" });
    assert.match(callers, /^5 uses in 4 functions across 1 file/);
    assert.match(callers, /twice\s+×2/);
    assert.match(callers, /draw.*via alias/);
    assert.match(callers, /drawPicked.*via picked/);
  });
});

test("concise formats preserve definition bodies and module export identities", async () => {
  await fixture(async lsp => {
    const definition = await query(lsp, "lsp_definition", { symbol: "Ops.run", format: "concise", body: true, maxLines: 3 });
    assert.match(definition, /src\/core\/ops\.js:2:\d+\s+\[def\]/);
    assert.match(definition, /function run\(v\)/);
    const detailed = await query(lsp, "lsp_outline", { symbol: "Panel" });
    const concise = await query(lsp, "lsp_outline", { symbol: "Panel", format: "concise" });
    for (const name of ["draw", "update"]) assert.match(concise, new RegExp("\\[export\\] " + name + "\\b"));
    assert.ok(concise.length <= detailed.length);
    const callers = await query(lsp, "lsp_callers", { symbol: "Ops.run", format: "concise" });
    assert.match(callers, /draw/);
  });
});

test("cached lexical owners refresh after edits and keep same-named methods distinct", async () => {
  await fixture(async (lsp, root) => {
    const file = path.join(root, "src/ui/panel.js");
    const original = fs.readFileSync(file, "utf8");
    const before = await query(lsp, "lsp_callers", { symbol: "Ops.run" });
    assert.match(before, /draw/);
    fs.writeFileSync(file, original.replaceAll("draw", "paint") + '\nconst Left = { same() { return Ops.run(1); } };\nconst Right = { same() { return Ops.run(2); } };\n');
    const changed = new Date(Date.now() + 2000); fs.utimesSync(file, changed, changed);
    const after = await query(lsp, "lsp_callers", { symbol: "Ops.run", path: "src/ui" });
    assert.match(after, /paint/);
    assert.doesNotMatch(after, /\bdraw\b/);
    assert.match(after, /Left › same/);
    assert.match(after, /Right › same/);
  });
});

test("invalid scopes are rejected before starting a compiler", async () => {
  const lsp = new Lsp({ idleMs: 0 });
  try {
    for (const scope of ["../js", "/src/ui", "src/../ui", "src/*", "C:\\temp", ""]) {
      const result = await callTool(lsp, "lsp_references", { symbol: "G.player", path: scope });
      assert.equal(result.isError, true, scope);
      assert.equal(lsp.proc, null);
    }
  } finally { lsp.stop(); }
});

test("CLI forwards a scoped file summary", () => {
  const text = execFileSync(process.execPath, ["tools/mcp/lsp-mcp.mjs", "refs", "M4.lerp", "--files", "--path=js/physics"], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  assert.match(text, /^js\/physics\/ai-drive\.js \d+$/m);
  assert.doesNotMatch(text, /^js\/(?!physics\/)[^\n]+ \d+$/m);
});

test("navigation benchmark help and argument validation need no compiler", () => {
  const script = path.join(ROOT, "tools/mcp/lsp-navigation-bench.mjs");
  assert.match(execFileSync(process.execPath, [script, "--help"], { encoding: "utf8", timeout: 5000 }), /first query and warm/);
  assert.throws(() => execFileSync(process.execPath, [script, "--iterations=0"], { encoding: "utf8", timeout: 5000, stdio: "pipe" }), error => error.status === 2 && /2 to 10/.test(error.stderr));
});
