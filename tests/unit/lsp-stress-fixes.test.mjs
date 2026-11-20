// apex-lsp fixes from the 2026-11-20 stress test (four subagents over js/, docs/notes/LSP-AND-TOOL-USAGE-2026-11-20.md):
// an argument is a use (not an export shorthand), a numeric literal declares, refs follow destructures like callers,
// a symbol query's callers include the declaring file's own calls, a file-wrapping IIFE is no caller frame, a
// window.X = X self-alias is not a second declaration, and a stale server says so. Round 3 (B2-B9): a hung tsc
// restarts, an added file keeps the HEAD baseline, stub arity is hidden, hover reads // blocks, G destructures count,
// an empty path is refused, typos get a did-you-mean, and a stub global never hides its real module.
import "../helpers/git-fixture-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Lsp, callTool, classify, nearNames, staleNote } from "../../tools/mcp/lsp-mcp.mjs";

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

// B3: a fake tsc that answers initialize, then never answers anything else (a hung server).
const HUNG_TSC = `#!/usr/bin/env node
let buf = "";
process.stdin.on("data", d => {
  buf += d;
  for (let h; (h = buf.indexOf("\\r\\n\\r\\n")) >= 0;) {
    const len = +/Content-Length: (\\d+)/i.exec(buf.slice(0, h))[1];
    if (buf.length < h + 4 + len) return;
    const m = JSON.parse(buf.slice(h + 4, h + 4 + len)); buf = buf.slice(h + 4 + len);
    if (m.method === "initialize") { const s = JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { capabilities: {} } }); process.stdout.write("Content-Length: " + Buffer.byteLength(s) + "\\r\\n\\r\\n" + s); }
  }
});
`;
function hungFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-hung-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src/a.js"), "const Alpha = { ping() { return 1; } };\n");
  fs.writeFileSync(path.join(dir, "jsconfig.json"), "{}");
  fs.writeFileSync(path.join(dir, "fake-tsc"), HUNG_TSC, { mode: 0o755 });
  return dir;
}

test("a timed-out request restarts tsc instead of leaving every later call behind the hung one (B3)", { timeout: 30000 }, async () => {
  const dir = hungFixture();
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", cmd: path.join(dir, "fake-tsc"), timeout: 400, idleMs: 0 });
  try {
    await lsp.start();
    const hung = lsp.proc;
    await assert.rejects(lsp.request("textDocument/hover", { textDocument: { uri: lsp.uriOf("src/a.js") }, position: { line: 0, character: 6 } }),
      /timed out after 400 ms; tsc --lsp was restarted/);
    assert.equal(lsp.proc, null, "the hung server is forgotten");
    assert.ok(hung.killed || hung.exitCode !== null || hung.signalCode !== null, "and killed");
    await lsp.start();
    assert.notEqual(lsp.proc, hung, "the next call gets a fresh server");
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("serve: ping answers while a tools/call waits on a hung tsc (B3)", { timeout: 30000 }, async () => {
  const { spawn } = await import("node:child_process");
  const dir = hungFixture();
  const srv = spawn(process.execPath, [path.resolve("tools/mcp/lsp-mcp.mjs"), "serve"], { env: { ...process.env, APEX_LSP_TSC: path.join(dir, "fake-tsc") }, stdio: ["pipe", "pipe", "ignore"] });
  try {
    const seen = [];
    const got = new Promise(resolve => {
      let buf = "";
      srv.stdout.on("data", d => { buf += d; for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) { seen.push(JSON.parse(buf.slice(0, i)).id); if (seen.includes(2)) resolve(); } });
    });
    srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "lsp_hover", arguments: { symbol: "Alpha.ping" } } }) + "\n");
    srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }) + "\n");
    await got;
    assert.deepEqual(seen, [2], "ping came back first, before the tools/call that waits on tsc");
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an untracked or staged new js file keeps the HEAD subtraction for other files (B4)", { timeout: 60000 }, async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-b4-"));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  w("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  w("src/a.js", "const Alpha = { ping() { return 1; } };\n");
  w("src/b.js", "const old = Alpha.ping(1);\n");
  git("init", "-q"); git("add", "."); git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", idleMs: 0 });
  const diag = async () => { const r = await callTool(lsp, "lsp_diagnostics", { file: "src/b.js" }); assert.equal(r.isError, false, r.content[0].text); return r.content[0].text; };
  try {
    w("src/b.js", "const old = Alpha.ping(1);\nconst fresh = Alpha.ping(2);\n");
    w("src/new.js", "const Added = { yes: 1 };\n");
    const untracked = await diag();
    const [head, ...rows] = untracked.split("\n");
    assert.equal(head.split("; all:")[0], "1 new since HEAD in src/b.js (1 pre-existing hidden; baseline with 1 other edited file at HEAD (src/new.js)", untracked);
    assert.deepEqual(rows, ["src/b.js:2:26  TS2554 Expected 0 arguments, but got 1."], untracked);
    git("add", "src/new.js");
    assert.equal((await diag()).split(" (")[0], "1 new since HEAD in src/b.js", "a staged new file is absent at HEAD too");
    // A deleted dependency still cannot be put back: no trustworthy baseline.
    fs.unlinkSync(path.join(dir, "src/a.js"));
    assert.equal((await diag()).split(":")[0], "2 high-signal diagnostics in src/b.js (HEAD subtraction skipped");
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("nearNames: one edit for short names, two from six characters, nearest first (B9)", () => {
  assert.deepEqual(nearNames("inCarer", ["inCareer", "inCar", "career", "unrelated"]), ["inCareer", "inCar"]);
  assert.deepEqual(nearNames("Carr", ["Car", "Career", "Cart"]), ["Car", "Cart"]);
  assert.deepEqual(nearNames("x", ["y", "xyz"]), ["y"]);
  assert.deepEqual(nearNames("Zzqx", ["GameHud", "Tracks"]), []);
});

test("a typo gets a did-you-mean; a name only tools/ has says so (B9)", { timeout: 60000 }, () => withFixture({
  "src/career.js": `"use strict";
const Career = (function () {
  function inCareer() { return true; }
  return { inCareer };
})();
if (typeof window !== "undefined") window.Career = Career;
`,
  "src/use.js": `"use strict";
function lap() { return Career.inCareer(); }
globalThis.keep = { lap };
`,
}, async ({ q, dir }) => {
  const [member] = await q("lsp_definition", { symbol: "Career.inCarer" }, true);
  assert.equal(member, "Career (src/career.js:2) has no member inCarer the checker can see; try lsp_hover Career or lsp_symbols inCarer; did you mean Career.inCareer?");
  const [head] = await q("lsp_definition", { symbol: "Carer.inCareer" }, true);
  assert.equal(head, "symbol not found: Carer is not a global the checker or a window.Carer assignment declares; did you mean Career?");
  const [bare] = await q("lsp_definition", { symbol: "inCarer" }, true);
  assert.equal(bare, "symbol not found: inCarer (try lsp_symbols for a prefix); did you mean inCareer?");
  // A name declared only under the fixture's tools dir (outside the checked src/) points there, once the tree is a git repo.
  const { execFileSync } = await import("node:child_process");
  fs.mkdirSync(path.join(dir, "tools"));
  fs.writeFileSync(path.join(dir, "tools", "gate.mjs"), "export function readyGateRows() { return []; }\n");
  execFileSync("git", ["init", "-q"], { cwd: dir }); execFileSync("git", ["add", "."], { cwd: dir });
  const [outside] = await q("lsp_definition", { symbol: "readyGateRows" }, true);
  const fixtureFile = ["tools", "gate.mjs"].join("/");   // exists only in the fixture, not in the repo
  assert.equal(outside, `symbol not found: readyGateRows (try lsp_symbols for a prefix); readyGateRows appears outside src/ in ${fixtureFile} (apex-lsp covers src/ only: grep those)`);
}));

test("diagnostics hide TS2554 against a zero-parameter stub, keep it against real code (B5)", { timeout: 60000 }, () => withFixture({
  "src/main.js": `"use strict";
function compute() { return 2; }
function real() { return compute(); }
let net = { report: () => {}, owns: () => false };
function lap() {
  net.report(1);
  net.owns(2, 3);
  real(4);
  Lights.create(5);
}
globalThis.keep = { lap };
`,
  "src/session-stub.js": `"use strict";
var Lights = {
  create: () => ({ update: function () {}, countCredit: () => 0 }),
};
`,
}, async ({ q }) => {
  const rows = await q("lsp_diagnostics", { file: "src/main.js", all: true });
  assert.equal(rows[0], "1 high-signal diagnostic in src/main.js (not tracked at HEAD; 3 TS2554 against a zero-parameter stub hidden; per-file @ts-check)", rows.join("\n"));
  assert.deepEqual(rows.slice(1).map(r => r.replace(/\s+TS2554.*/, "")), ["src/main.js:8:8"], rows.join("\n"));
}));

test("hover reads the // comment block above a declaration that has no JSDoc (B7)", { timeout: 60000 }, () => withFixture({
  "src/mod.js": `"use strict";
const Mod = (function () {
  // eslint-disable-next-line no-unused-vars
  // Hot path: read the baked table,
  // never recompute it.
  function curv(t) { return t; }   // metres⁻¹
  function bare() { return 1; }
  return { curv, bare };
})();
`,
  "src/use.js": `"use strict";
function lap() { return Mod.curv(1) + Mod.bare(); }
globalThis.keep = { lap };
`,
}, async ({ q }) => {
  const doc = (await q("lsp_hover", { symbol: "Mod.curv" })).join("\n");
  const lines = doc.split("\n");
  assert.deepEqual(lines.slice(lines.indexOf("Hot path: read the baked table,"), lines.indexOf("metres⁻¹") + 1), ["Hot path: read the baked table,", "never recompute it.", "metres⁻¹"], doc);
  assert.doesNotMatch(doc, /eslint/);
  assert.equal(lines.at(-1), "(// comments at src/mod.js:6)", doc);
  const none = (await q("lsp_hover", { symbol: "Mod.bare" })).join("\n");
  assert.doesNotMatch(none, /\/\/ comments at/, none);
}));

test("a global beside its session-stub.js placeholder: real module first, own-file calls kept, exports followed (B2)", { timeout: 60000 }, () => withFixture({
  "src/geom.js": `"use strict";
var Geom = (function () {
  function zoneOf(t) { return t; }
  return { zoneOf };
})();
`,
  "src/dmg.js": `"use strict";
var Dmg = (function () {
  const { zoneOf } = Geom;
  function apply(r) { return r + 1; }
  function hit(r) { return apply(r) + apply(zoneOf(r)); }
  return { apply, hit, zoneOf };
})();
`,
  "src/session-stub.js": `"use strict";
var Dmg = {
  apply: () => 0, hit: () => 0, zoneOf: () => null,
};
`,
  "src/use.js": `"use strict";
function lap() { return Dmg.apply(1); }
globalThis.keep = { lap };
`,
}, async ({ q }) => {
  const refs = await q("lsp_references", { symbol: "Dmg.apply", files: true });
  assert.deepEqual(refs.slice(1), ["src/dmg.js 4", "src/session-stub.js 1", "src/use.js 1"], refs.join("\n"));
  const callers = await q("lsp_callers", { symbol: "Dmg.apply", files: true });
  assert.deepEqual(callers.slice(1), ["src/dmg.js 2 uses in 1 function", "src/use.js 1 use in 1 function"], callers.join("\n"));
  const def = await q("lsp_definition", { symbol: "Dmg.zoneOf" });
  assert.equal(def[1], "src/geom.js:3:12  [def] function zoneOf(t) { return t; }", def.join("\n"));
  assert.equal(/declared at ([^;]+);/.exec(def[0])?.[1], "src/geom.js:3:12", def[0]);
}, { anchor: "src/dmg.js" }));

test("a multi-line destructure of the create(G) parameter counts for G.member refs and callers (B8)", { timeout: 60000 }, () => withFixture({
  "src/settings.js": `"use strict";
const Settings = (function () {
  function create(G) {
    const {
      store,
      buildSelect, openGarage,
    } = G;
    function wire() { buildSelect(); openGarage("select"); return store; }
    return { wire };
  }
  return { create };
})();
`,
  "src/flow.js": `"use strict";
function boot(G) { G.buildSelect(); }
globalThis.keep = { boot };
`,
  "types/game-ctx.d.ts": "interface GameCtx {\n  buildSelect(): void;\n  openGarage(from: string): void;\n  store: unknown;\n}\n",
}, async ({ q }) => {
  const refs = await q("lsp_references", { symbol: "G.buildSelect", files: true });
  assert.deepEqual(refs.slice(1).sort(), ["src/flow.js 1", "src/settings.js 2", "types/game-ctx.d.ts 1"], refs.join("\n"));
  const callers = await q("lsp_callers", { symbol: "G.openGarage", files: true });
  assert.deepEqual(callers.slice(1), ["src/settings.js 1 use in 1 function"], callers.join("\n"));
}));
