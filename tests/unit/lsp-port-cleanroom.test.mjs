// apex-lsp fixes ported from the clean-room audit (claude/cleanroom-1119-audit) and found in the 2026-11-20 stress
// test (docs/notes/LSP-AND-TOOL-USAGE-2026-11-20.md): self./window members added later, factory-instance callers,
// line-only positions, G.member at a position, member-check APX1/APX2, and a diagnostics baseline with several
// edited files.
import "../helpers/git-fixture-env.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-port-"));
  const w = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  w("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js", "types/**/*.d.ts"] }));
  for (const [f, t] of Object.entries(files)) w(f, t);
  const git = (...args) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: dir, stdio: "ignore" });
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "baseline");
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", idleMs: 0 });
  const q = async (name, args) => { const r = await callTool(lsp, name, args); return { err: r.isError, t: r.content[0].text }; };
  return { dir, w, lsp, q, done: () => { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

const FILES = {
  "types/game-ctx.d.ts": "interface GameCtx {\n  readonly track: number;\n}\n",
  "src/a.js": `"use strict";
self.Roster = Object.freeze({ DEFERRED: 1 });
window.Consts = { A: 1 };
window.Consts.B = 2;
const Lights = (function () {
  function create(G) {
    function credit(dt) { return dt + G.track; }
    return { credit };
  }
  return { create };
})();
`,
  "src/b.js": `"use strict";
let lights = null;
function boot(G) { lights = Lights.create(G); }
function frame() { return lights.credit(1) + Roster.DEFERRED + Consts.B; }
globalThis.keep = { boot, frame };
`,
  "index.html": "<script>lights.credit(2); credit(3);</script>\n",
};

const rows = t => t.split("\n");

test("ported: self./window globals, members added later, factory-instance callers, line-only positions, G at a position", { timeout: 60000 }, async () => {
  const fx = fixture(FILES);
  try {
    let r = await fx.q("lsp_definition", { symbol: "Roster.DEFERRED" });
    assert.equal(rows(r.t)[1], "src/a.js:2:31  [def] self.Roster = Object.freeze({ DEFERRED: 1 });", r.t);
    r = await fx.q("lsp_definition", { symbol: "Consts.B" });
    assert.equal(rows(r.t)[1].split("  ")[0], "src/a.js:4:15", r.t);
    // Line only (no column): the declared name on line 7 (col 14), not the indent; the call through the
    // `lights` instance in b.js; and no "outside src/" note for the factory-local `credit` in index.html.
    r = await fx.q("lsp_callers", { file: "src/a.js", line: 7 });
    assert.deepEqual(rows(r.t), ["1 use in 1 function across 1 file (query at src/a.js:7:14; 1 of them are text matches on instances of Lights.create() (lights).credit; an instance passed on under another name is not followed)", "src/b.js:4  frame  ×1"]);
    // G.track at a position where G is an untyped factory parameter: answered through the façade.
    r = await fx.q("lsp_definition", { file: "src/a.js", line: 7, column: 46 });
    assert.deepEqual(rows(r.t), ["1 definition (at the declaration; answered as G.track (the checker cannot type G at src/a.js:7); G is the GameCtx façade; contract row in types/game-ctx.d.ts)", "types/game-ctx.d.ts:2:12  [def] readonly track: number;"]);
    // A lowercase head with no text use stays an honest error.
    assert.equal((await fx.q("lsp_definition", { symbol: "lights.nothing" })).err, true);
  } finally { fx.done(); }
});

test("ported: diagnostics keep HEAD subtraction with several edited sources; guarded members are not reported", { timeout: 60000 }, async () => {
  const fx = fixture({
    "src/a.js": `"use strict";\nconst Hub = (function () {\n  function fire(x) { return x; }\n  return { fire };\n})();\n`,
    "src/b.js": `"use strict";\nconst one = Hub.fire(1);\nconst old = oldMissing;\n`,
  });
  try {
    // Two edited sources: b.js reads a missing member and guards another; a.js drops fire's parameter.
    fx.w("src/b.js", `"use strict";\nconst one = Hub.fire(1);\nconst old = oldMissing;\nconst gone = Hub.firee;\nif (Hub.maybe) Hub.maybe();\n`);
    fx.w("src/a.js", `"use strict";\nconst Hub = (function () {\n  function fire() { return 1; }\n  return { fire };\n})();\n`);
    const r = await fx.q("lsp_diagnostics", { file: "src/b.js" });
    // The dependency's edit shows as new (a.js put back to HEAD for the baseline); oldMissing stays hidden;
    // the missing read is reported once (TS2551, its APX2 twin deduped); the guarded Hub.maybe() is not.
    assert.equal(rows(r.t)[0].split(";")[0], "2 new since HEAD in src/b.js (1 pre-existing hidden", r.t);
    assert.equal(rows(r.t)[0].split(";")[1], " baseline with 1 other edited file at HEAD (src/a.js)", r.t);
    assert.deepEqual(rows(r.t).slice(1).map(x => x.split("  ")[1].split(" ")[0] + "@" + x.split("  ")[0]), ["TS2554@src/b.js:2:22", "TS2551@src/b.js:4:18"]);
    // The overlay restored a.js: asking again gives the same answer, not one against HEAD's a.js.
    assert.equal((await fx.q("lsp_diagnostics", { file: "src/b.js" })).t, r.t);
  } finally { fx.done(); }
});

test("member-check: APX1 for a call of a member no module defines", { timeout: 60000 }, async () => {
  const fx = fixture({ "src/a.js": `"use strict";\nconst Hub = (function () {\n  function fire(x) { return x; }\n  return { fire };\n})();\n`, "src/b.js": `"use strict";\nconst Box = window.Box || {};\n` });
  try {
    fx.w("src/b.js", `"use strict";\nconst Box = window.Box || {};\nHub.fire(1);\nconst Other = {};\nOther.go && Other.go();\n`);
    assert.equal((await fx.q("lsp_definition", { symbol: "Hub.fire" })).err, false);   // loads the project the index reads
    const apx = fx.lsp.memberDiagnostics(`"use strict";\nHub.nope(1);\nconst x = Hub.missing;\nHub.fire(2);\n`);
    assert.deepEqual(apx.map(d => `${d.code}@${d.line0 + 1}`), ["APX1@2", "APX2@3"]);
  } finally { fx.done(); }
});
