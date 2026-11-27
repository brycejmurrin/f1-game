// #7071 (#6501 rows 12, 18, 19): a window.X head spread over many files resolves, hover on `let x = null` shows the
// assigned shape, a circuit outline names its id, and the session-transcript help states the `$?` cost.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TSC = path.join(ROOT, "node_modules/.bin/tsc");

function fixture() {
  const root = mkTmpDir("apex-lsp-7071-");
  fs.mkdirSync(path.join(root, "src"));
  const jsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, "jsconfig.json"), "utf8")).compilerOptions;   // the project's own flags
  fs.writeFileSync(path.join(root, "jsconfig.json"), JSON.stringify({ compilerOptions: jsconfig, include: ["src/**/*.js"] }));
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    fs.writeFileSync(path.join(root, `src/circuit_${id}.js`), `(function () {\n  "use strict";\n  (window.TrackDefs = window.TrackDefs || []).push({ id: "${id}", name: "${id}" });\n})();\n`);
  }
  fs.writeFileSync(path.join(root, "src/use.js"), `function count() { return window.TrackDefs.length; }
function battleOf(rows) {
  let best = null;
  for (const r of rows) { best = { ahead: r.a, gapS: 1 }; }
  return best;
}
`);
  return root;
}

async function ask(lsp, name, args) {
  const r = await callTool(lsp, name, args);
  assert.equal(r.isError, false, r.content?.[0]?.text);
  return r.content[0].text;
}
const mk = root => new Lsp({ root, src: "src", anchor: "src/use.js", cmd: TSC, idleMs: 0 });

test("row 12: references on a window.X head spread over many files resolve instead of being refused", async () => {
  const lsp = mk(fixture());
  try {
    const text = await ask(lsp, "lsp_references", { symbol: "TrackDefs", files: true });
    assert.equal(/separate top-level declarations/.test(text), false);
    assert.equal(/references in 7 files/.test(text), true);
  } finally { lsp.stop(); }
});

test("row 12: a circuit file's outline names the head and the circuit id", async () => {
  const lsp = mk(fixture());
  try {
    assert.equal(/window\.TrackDefs id=c/.test(await ask(lsp, "lsp_outline", { file: "src/circuit_c.js" })), true);
  } finally { lsp.stop(); }
});

test("row 18: hover on `let x = null` and its function say what is assigned", async () => {
  const lsp = mk(fixture());
  try {
    assert.equal(/later assigned: \{ ahead, gapS \}/.test(await ask(lsp, "lsp_hover", { file: "src/use.js", line: 3, column: 7 })), true);
    assert.equal(/later assigned: \{ ahead, gapS \}/.test(await ask(lsp, "lsp_hover", { file: "src/use.js", line: 2, column: 10 })), true);
  } finally { lsp.stop(); }
});

test("row 19: session-transcript help names the `$?` cost of a local .jsonl, and the tool prints it", () => {
  const tool = path.join(ROOT, "tools/ci/session-transcript.mjs");
  assert.equal(/\$\? on a local \.jsonl/.test(execFileSync("node", [tool, "--help"], { encoding: "utf8" })), true);
  const dir = mkTmpDir("apex-st-7071-"), jl = path.join(dir, "s.jsonl");
  fs.writeFileSync(jl, JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "hello" } }) + "\n");
  assert.equal(/\| \$\? \|/.test(execFileSync("node", [tool, jl, "--summary"], { encoding: "utf8" })), true);
});
