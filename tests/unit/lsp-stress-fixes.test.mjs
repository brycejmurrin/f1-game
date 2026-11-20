// apex-lsp fixes from the 2026-11-20 stress test (four subagents over js/, docs/notes/LSP-AND-TOOL-USAGE-2026-11-20.md):
// an argument is a use (not an export shorthand), a numeric literal declares, refs follow destructures like callers,
// a symbol query's callers include the declaring file's own calls, a file-wrapping IIFE is no caller frame, a
// window.X = X self-alias is not a second declaration, and a stale server says so.
import "../helpers/git-fixture-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Lsp, callTool, classify, staleNote } from "../../tools/mcp/lsp-mcp.mjs";

test("classify: a call argument is a use, a numeric literal declares, a member read aliases", () => {
  const tag = (line, word) => classify(line, line.indexOf(word));
  assert.equal(tag(`  el.addEventListener("click", onPause, true);`, "onPause"), "use");
  assert.equal(tag(`  setTimeout(render, 0);`, "render"), "use");
  assert.equal(tag(`  const arr = [onA, onB];`, "onA"), "use");
  assert.equal(tag(`  return { create, onPause };`, "onPause"), "export");
  assert.equal(tag(`  const MIN_SEP = 0.03;`, "MIN_SEP"), "def");
  assert.equal(tag(`  const lerp = M4.lerp;`, "lerp"), "alias");
});

test("staleNote: only a server whose own files changed appends the restart line", () => {
  const r = () => ({ result: { content: [{ type: "text", text: "answer" }] } });
  assert.equal(staleNote(r()).result.content[0].text, "answer");
  assert.equal(staleNote(r(), [1, 2]).result.content[0].text.split("\n")[1].split(";")[0],
    "(apex-lsp: tools/mcp/lsp-mcp.mjs, tools/mcp/member-check.mjs changed since this server started");
});

test("refs follow destructures, callers count the declaring file, no file-IIFE frame, no self-alias declaration", { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-stress-"));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  w("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  w("src/prims.js", `"use strict";
const Prims = (function () {
  function tube(n) { return n + 1; }
  function both(n) { return tube(n) * 2; }
  return { tube, both };
})();
if (typeof window !== "undefined") window.Prims = Prims;
`);
  w("src/scene.js", `"use strict";
const { tube } = Prims;
function build() { return tube(1) + tube(2) + Prims.tube(3); }
globalThis.keep = { build };
`);
  w("src/main.js", `(async function () {
"use strict";
function frame() { return Prims.both(4); }
document.addEventListener("click", frame, true);
})();
`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/prims.js", idleMs: 0 });
  const q = async (name, args) => { const r = await callTool(lsp, name, args); assert.equal(r.isError, false, r.content[0].text); return r.content[0].text.split("\n"); };
  try {
    // tube: two destructured calls and one qualified call in scene.js, one same-file call in prims.js.
    const callers = await q("lsp_callers", { symbol: "Prims.tube", files: true });
    // (the destructured calls group as "build (via tube)", apart from the qualified call in build)
    assert.deepEqual(callers.slice(1), ["src/prims.js 1 use in 1 function", "src/scene.js 3 uses in 2 functions"], callers.join("\n"));
    const refs = await q("lsp_references", { symbol: "Prims.tube", files: true });
    assert.deepEqual(refs.slice(1), ["src/scene.js 4", "src/prims.js 3"], refs.join("\n"));
    // The addEventListener argument is a use, and the main.js file wrapper adds no "callback ›" frame.
    const frame = await q("lsp_callers", { file: "src/main.js", line: 3 });
    assert.deepEqual(frame.slice(1), ["src/main.js:4  top level  ×1 (0 calls)"], frame.join("\n"));
    // window.Prims = Prims re-exports the declaration; it is not a second one.
    const def = await q("lsp_definition", { symbol: "Prims" });
    assert.equal(def[0], "1 definition (at the declaration)", def.join("\n"));
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// A throwaway workspace: files under src/, one Lsp over it, `q` returns the answer's lines (asserting no error).
async function withFixture(files, fn, { anchor = Object.keys(files)[0] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-stress-"));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  w("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  for (const [f, t] of Object.entries(files)) w(f, t);
  const lsp = new Lsp({ root: dir, src: "src", anchor, idleMs: 0 });
  const q = async (name, args, error = false) => { const r = await callTool(lsp, name, args); assert.equal(r.isError, error, r.content[0].text); return r.content[0].text.split("\n"); };
  try { await fn({ q, lsp, dir, w }); } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

test("a member re-exported through a destructure answers the same set from either module (B13)", { timeout: 60000 }, () => withFixture({
  "src/spline.js": `"use strict";
const Spline = (function () {
  function curv(t) { return t; }
  function inner() { return curv(1); }
  return { curv, inner };
})();
`,
  "src/tracks.js": `"use strict";
const Tracks = (function () {
  const { curv } = Spline;
  function bend() { return curv(2); }
  return { curv, bend };
})();
`,
  "src/a.js": `"use strict";
function lap() { return Tracks.curv(3) + Tracks.curv(4); }
globalThis.keep = { lap };
`,
  "src/b.js": `"use strict";
function edge() { return Spline.curv(5); }
globalThis.keep2 = { edge };
`,
}, async ({ q }) => {
  const home = await q("lsp_references", { symbol: "Spline.curv", files: true });
  const next = await q("lsp_references", { symbol: "Tracks.curv", files: true });
  assert.deepEqual(home.slice(1), ["src/spline.js 3", "src/tracks.js 3", "src/a.js 2", "src/b.js 1"], home.join("\n"));
  assert.deepEqual(next.slice(1), home.slice(1), next.join("\n"));
  const callersHome = await q("lsp_callers", { symbol: "Spline.curv", files: true });
  const callersNext = await q("lsp_callers", { symbol: "Tracks.curv", files: true });
  assert.deepEqual(callersHome.slice(1), ["src/a.js 2 uses in 1 function", "src/b.js 1 use in 1 function", "src/spline.js 1 use in 1 function", "src/tracks.js 1 use in 1 function"], callersHome.join("\n"));
  assert.deepEqual(callersNext.slice(1), callersHome.slice(1), callersNext.join("\n"));
  const scoped = await q("lsp_callers", { symbol: "Tracks.curv", path: "src/tracks.js" });
  assert.equal(scoped[1], "src/tracks.js:4  Tracks › bend (via curv)  ×1", scoped.join("\n"));
}));
