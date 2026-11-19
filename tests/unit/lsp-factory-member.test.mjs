// apex-lsp (#5674): a member on a factory-returned object answered a confident "0 uses". The semantic zero now
// carries the text matches of `.name` so the reader verifies them instead of deleting a live function.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";

test("a factory member's zero names its text matches; a resolved symbol gets no such note", { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-factory-member-"));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  write("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  write("src/factory.js", `"use strict";
const Chunked = (function () {
  function create() {
    function mergeVisible(n) { return n * 2; }
    return { mergeVisible };
  }
  return { create };
})();
`);
  write("src/user.js", `"use strict";
const Use = (function () {
  let sys = null;
  function boot(make) { sys = make(); }
  // sys.mergeVisible in a comment is not a use
  function frame() { return sys.mergeVisible(3) + sys.mergeVisible(4); }
  return { boot, frame };
})();
`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/factory.js", idleMs: 0 });
  const text = async (tool, args) => {
    const r = await callTool(lsp, tool, args);
    assert.equal(r.isError, false, r.content[0].text);
    return r.content[0].text;
  };
  try {
    const callers = await text("lsp_callers", { symbol: "mergeVisible" });
    assert.equal(callers.split("\n")[0], "0 uses in 0 functions across 0 files (query at src/factory.js:4:14; 0 semantic uses, but 2 text matches of .mergeVisible (a member on an object the checker cannot type, e.g. a factory's return; verify each): src/user.js:6, src/user.js:6)");
    assert.deepEqual(lsp.zeroUseNote({ symbol: "Chunked.create" }, null), [], "no .create access anywhere: no note");
    // A column inside the name, or one past its end, asks about the whole name: the query snaps to its first
    // character, so the text-match warning survives (a mid-word column used to answer a bare "0 references").
    const line6 = fs.readFileSync(path.join(dir, "src/user.js"), "utf8").split("\n")[5];
    const start = line6.indexOf("mergeVisible") + 1;
    const want = `0 references in 0 files (query at src/user.js:6:${start}; nothing resolvable at src/user.js:6:${start} ("mergeVisible"); 0 semantic uses, but 2 text matches of .mergeVisible (a member on an object the checker cannot type, e.g. a factory's return; verify each): src/user.js:6, src/user.js:6)`;
    for (const column of [start, start + 2, start + "mergeVisible".length]) {
      const refs = await text("lsp_references", { file: "src/user.js", line: 6, column });
      assert.equal(refs.split("\n")[0], want, `column ${column} answers for the name at column ${start}`);
    }
    // Leading whitespace has no name before it: the query stays where it was put.
    const blank = await text("lsp_references", { file: "src/user.js", line: 6, column: 1 });
    assert.equal(blank.split(";")[0], "0 references in 0 files (query at src/user.js:6:1");
  } finally {
    lsp.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
