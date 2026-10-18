// apex-lsp (tools/mcp/lsp-mcp.mjs) driven as an MCP CLIENT drives it — stdio
// JSON-RPC, initialize → tools/list → tools/call — against the REAL js/ tree and
// TypeScript 7's native `tsc --lsp`. Proves cross-file definition, semantic
// references and workspace symbols resolve for script-global IIFEs (jsconfig.json).
// No browser. ~2 s (one tsc --lsp project load).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Lsp, TOOLS, callTool, classify, inCommentOrString } from "../../tools/mcp/lsp-mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function client() {
  const p = spawn(process.execPath, [path.join(ROOT, "tools/mcp/lsp-mcp.mjs")], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
  let buf = "", id = 0;
  const pending = new Map();
  p.stdout.on("data", d => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      pending.get(m.id)?.(m); pending.delete(m.id);
    }
  });
  const req = (method, params) => new Promise(r => { const n = ++id; pending.set(n, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
  const call = async (name, args) => (await req("tools/call", { name, arguments: args })).result;
  return { p, req, call, close: () => { p.stdin.end(); p.kill(); } };
}

test("jsconfig.json makes js/ one script project with checkJs off", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "jsconfig.json"), "utf8"));
  assert.equal(cfg.compilerOptions.allowJs, true);
  assert.equal(cfg.compilerOptions.noEmit, true);
  assert.equal(cfg.compilerOptions.checkJs, false, "checkJs on reports ~39k strict errors (docs/notes/LSP-MCP-2026-10-18.md)");
  assert.ok(cfg.include.includes("js/**/*.js"));
});

test(".mcp.json launches apex-lsp with the repo server", () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8")).mcpServers["apex-lsp"];
  assert.ok(s, "apex-lsp missing from .mcp.json");
  assert.deepEqual([s.command, ...s.args], ["bash", "tools/mcp/lsp-mcp.sh", "serve"]);
});

test("argument errors come back as tool errors before tsc starts", async () => {
  assert.deepEqual(TOOLS.map(t => t.name), ["lsp_definition", "lsp_references", "lsp_callers", "lsp_outline", "lsp_symbols", "lsp_hover", "lsp_diagnostics"]);
  const never = { prepare() { throw Error("must not start tsc"); } };
  for (const [name, args, re] of [["lsp_symbols", {}, /Missing argument: query/], ["lsp_definition", { sym: "X" }, /Unknown argument: sym/],
    ["lsp_references", { file: "js/game.js" }, /file needs line/], ["nope", {}, /Unknown tool/]]) {
    const r = await callTool(never, name, args);
    assert.equal(r.isError, true, name); assert.match(r.content[0].text, re);
  }
});

test("MCP client: definition, references and symbols on the real tree", { timeout: 90000 }, async () => {
  const c = client();
  try {
    const init = await c.req("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lsp-mcp.test", version: "0" } });
    assert.equal(init.result.serverInfo.name, "apex-lsp");
    const list = await c.req("tools/list", {});
    assert.equal(list.result.tools.length, TOOLS.length);

    // Liveries.forTeam is used in other files; the answer is its declaration in liveries.js.
    const def = await c.call("lsp_definition", { symbol: "Liveries.forTeam" });
    assert.equal(def.isError, false, def.content[0].text);
    assert.match(def.content[0].text, /^js\/car\/liveries\.js:\d+:\d+ {2}\[def\] function forTeam\(/m);
    assert.doesNotMatch(def.content[0].text.split("\n")[0], /query at js\/car\/liveries\.js/, "the query position is a use in another file");

    // Semantic references: many files, the declaration in tracks.js, no comment lines.
    const refs = await c.call("lsp_references", { symbol: "Tracks.curvature", limit: 2000 });
    assert.equal(refs.isError, false, refs.content[0].text);
    const rows = refs.content[0].text.split("\n").filter(r => /^js\//.test(r));
    const files = new Set(rows.map(r => r.split(":")[0]));
    assert.ok(rows.length >= 30 && files.size >= 10, `${rows.length} refs in ${files.size} files`);
    assert.ok(files.has("js/track/tracks.js") && files.has("js/game.js"));
    assert.ok(rows.every(r => !/^\S+ {2}\[\w+\] (\/\/|\*)/.test(r)), "a comment line is not a reference");

    const sym = await c.call("lsp_symbols", { query: "GameHud" });
    assert.match(sym.content[0].text.split("\n")[0], /^GameHud {2}\w+ {2}js\/ui\/hud\.js:\d+:\d+$/);

    // The G façade answers from its contract, interface GameCtx in types/game-ctx.d.ts.
    const g = await c.call("lsp_hover", { symbol: "G.wrapS" });
    assert.match(g.content[0].text, /\nat types\/game-ctx\.d\.ts:\d+:\d+ {2}\[def\] readonly wrapS/);
    assert.match(g.content[0].text, /^```typescript\n\(property\) GameCtx\.wrapS: \(s: number\) => number\n```/);
    // window.X globals are untyped for the checker: a labelled text answer, not "0 definitions".
    const pc = await c.call("lsp_definition", { symbol: "PhysicsConsts.IDLE_RPM" });
    assert.match(pc.content[0].text, /text match.*\njs\/physics\/consts\.js:\d+:\d+ {2}\[def\] IDLE_RPM:/s);

    const pos = await c.call("lsp_definition", { file: "js/ui/select-screen.js", line: 1, column: 1 });
    assert.equal(pos.isError, false, pos.content[0].text);
  } finally { c.close(); }
});

test("tsc --lsp starts on the first call, exits when idle, and restarts on demand", { timeout: 60000 }, async () => {
  const lsp = new Lsp({ idleMs: 300 });
  try {
    assert.equal(lsp.proc, null, "nothing spawned before a tool call");
    const first = await callTool(lsp, "lsp_symbols", { query: "GameHud" });
    assert.match(first.content[0].text, /js\/ui\/hud\.js/);
    const pid = lsp.proc.pid;
    await new Promise(r => lsp.proc.once("exit", r));
    assert.equal(lsp.ready, null, "idle exit resets the client");
    const again = await callTool(lsp, "lsp_symbols", { query: "GameHud" });
    assert.match(again.content[0].text, /js\/ui\/hud\.js/);
    assert.notEqual(lsp.proc.pid, pid);
  } finally { lsp.stop(); }
});

// A fixture workspace (same jsconfig shape, three script files) proves the
// edge cases hermetically: edits on disk are seen without a restart, comments
// and strings never become query positions, window.X globals fall back to text,
// and a member the checker can see is never confused with a same-named local.
test("fixture workspace: freshness, ambiguity, window globals, honest misses", { timeout: 60000 }, async () => {
  const os = await import("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-mcp-"));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  w("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  w("src/a.js", `"use strict";\nconst Alpha = (function () {\n  function ping(x) { return x + 1; }\n  function wrap(s) { return s; }\n  return { ping };\n})();\n`);
  w("src/b.js", `"use strict";\n// Alpha.ping in a comment\nconst msg = "Alpha.ping in a string";\nfunction wrap(s) { return s * 2; }\nconst v = Alpha.ping(1);\n`);
  w("src/c.js", `"use strict";\nwindow.Beta = {\n  KEY: 5,\n  go() { return 1; },\n};\nconst k = Beta.KEY + Beta.KEY;\n`);
  w("src/d.js", `"use strict";\nconst {\n  go, KEY: key } = Beta;\n// key in a comment\nconst twice = key * 2;\nconst B = Beta;\nconst again = B.KEY;\n`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", idleMs: 0 });
  const text = async (name, args) => { const r = await callTool(lsp, name, args); return { err: r.isError, t: r.content[0].text }; };
  try {
    let r = await text("lsp_definition", { symbol: "Alpha.ping" });
    assert.match(r.t, /query at src\/b\.js:5:/, "the code use on line 5, not the comment (2) or the string (3)");
    assert.match(r.t.split("\n")[1], /^src\/a\.js:3:\d+ {2}\[def\] function ping\(x\)/, "declaration listed before the export");

    r = await text("lsp_definition", { symbol: "wrap" });
    assert.match(r.t, /2 separate top-level declarations named wrap|^2 definitions/);
    r = await text("lsp_definition", { symbol: "Alpha.wrap" });
    assert.match(r.t, /src\/a\.js:4:\d+ {2}\[def\] function wrap/, "the wrap in Alpha's file, never b.js's");
    assert.doesNotMatch(r.t, /src\/b\.js/);
    assert.match(r.t, /no Alpha\.wrap use in src\/.*may not export/, "labelled, not presented as an export");
    r = await text("lsp_definition", { symbol: "Alpha.nope" });
    assert.equal(r.err, true); assert.match(r.t, /has no member nope/);
    r = await text("lsp_definition", { symbol: "Gamma.ping" });
    assert.equal(r.err, true); assert.match(r.t, /not found/);

    r = await text("lsp_references", { symbol: "Beta.KEY" });
    assert.match(r.t, /^6 references in 2 files .*text match/, r.t);
    assert.match(r.t, /src\/d\.js:3:7 {2}\[alias\] \(top level\) {2}go, KEY: key \} = Beta;/, "a multi-line, renamed destructure");
    assert.match(r.t, /src\/d\.js:5:15 {2}\[use\] \(top level\) {2}const twice = key \* 2;/, "the local it binds");
    assert.match(r.t, /src\/d\.js:7:17 {2}\[use\] \(top level\) {2}const again = B\.KEY;/, "uses through const B = Beta");
    assert.match(r.t, /src\/c\.js:3:3 {2}\[def\] \(top level\) {2}KEY: 5/);
    r = await text("lsp_references", { symbol: "Beta.KEY", files: true });
    assert.match(r.t, /^6 references in 2 files .*\nsrc\/c\.js 3\nsrc\/d\.js 3$/, "files: true prints only per-file counts");
    r = await text("lsp_symbols", { query: "wrap" });
    assert.match(r.t, /^wrap {2}function {2}src\/a\.js:4:\d+\nwrap {2}function {2}src\/b\.js:4:\d+$/, r.t);
    r = await text("lsp_definition", { symbol: "Beta.go" });
    assert.match(r.t, /src\/c\.js:4:3 {2}\[def\] go\(\)/);

    // Freshness: a new use and a renamed declaration are seen on the next call.
    w("src/b.js", fs.readFileSync(path.join(dir, "src/b.js"), "utf8") + "const v2 = Alpha.ping(2);\n");
    w("src/a.js", `"use strict";\n\nconst Alpha = (function () {\n  function ping(x) { return x + 1; }\n  return { ping };\n})();\n`);
    r = await text("lsp_references", { symbol: "Alpha.ping" });
    assert.match(r.t, /src\/b\.js:6:\d+ {2}\[use\] \(top level\) {2}const v2 = Alpha\.ping\(2\);/, r.t);
    assert.match(r.t, /src\/a\.js:4:\d+ {2}\[def\] \(Alpha\) {2}function ping/, "the moved declaration is at its new line");
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("classify tags a row by the identifier at the column", () => {
  const t = (line, word, nth = 0) => { let i = -1; for (let k = 0; k <= nth; k++) i = line.indexOf(word, i + 1); return classify(line, i); };
  assert.equal(t("  function forTeam(team) {", "forTeam"), "def");
  assert.equal(t("const v = (a, b) => a;", "v"), "def");
  assert.equal(t("  IDLE_RPM: 5000, MAX_RPM: 15000,", "MAX_RPM"), "def");
  assert.equal(t("  go() { return 1; },", "go"), "def");
  assert.equal(t("  readonly wrapS: (s: number) => number;", "wrapS"), "def");
  assert.equal(t("const clamp = M4.clamp, lerp = M4.lerp;", "clamp"), "alias");
  assert.equal(t("const clamp = M4.clamp, lerp = M4.lerp;", "lerp"), "alias");
  assert.equal(t("const { a, sample } = T;", "sample"), "alias");
  assert.equal(classify("    sample, wrapS } = ctx;", 4), "alias");
  assert.equal(classify("    sample, wrapS,", 4, "  } = ctx;"), "alias", "a destructure closing lines later");
  assert.equal(t("  return { a, sample };", "sample"), "export");
  assert.equal(classify("    sample, wrapS,", 4, "  };"), "export", "the middle of a multi-line export list");
  assert.equal(t("const { IDLE_RPM, MAX_RPM } = PhysicsConsts;", "PhysicsConsts"), "alias", "the head of a destructure");
  assert.equal(t("const K = PhysicsConsts, rev = 1;", "PhysicsConsts"), "alias");
  assert.equal(t("x.sample(1)", "sample"), "use");
  assert.equal(t("const k = x ? sample : 1;", "sample"), "use");
  assert.equal(inCommentOrString('a = "T.x" + T.y', 6), true);
  assert.equal(inCommentOrString('a = "T.x" + T.y', 12), false);
  assert.equal(inCommentOrString("x = 1; // T.y", 10), true);
});

// The second wave (agent-use research, docs/notes/LSP-MCP-2026-10-18.md §Agent use):
// enclosing functions on rows, callers, outline, definition bodies, paging,
// concise rows, and diagnostics that report only what an edit introduced.
test("fixture workspace: callers, outline, body, paging, concise, diagnostics new since HEAD", { timeout: 90000 }, async () => {
  const os = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-mcp2-"));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, stdio: "ignore" });
  w("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  w("src/a.js", `"use strict";\nconst Alpha = (function () {\n  const SECRET = 1;\n  function ping(x) {\n    return x + SECRET;\n  }\n  return { ping };\n})();\n`);
  w("src/b.js", `"use strict";\nfunction useIt() {\n  return Alpha.ping(1) + Alpha.ping(2);\n}\nconst v = Alpha.ping(3);\nconst old = notDefinedAnywhere;\n`);
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "base");
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", idleMs: 0 });
  const text = async (name, args) => { const r = await callTool(lsp, name, args); return { err: r.isError, t: r.content[0].text }; };
  try {
    let r = await text("lsp_callers", { symbol: "Alpha.ping" });
    assert.match(r.t, /^3 uses in 2 functions across 1 file/, r.t);
    assert.match(r.t, /\nsrc\/b\.js:3 {2}useIt {2}×2 {2}\(line 3\)/, "two uses on one line: one line listed");
    assert.match(r.t, /\nsrc\/b\.js:5 {2}top level {2}×1/);

    r = await text("lsp_references", { symbol: "Alpha.ping" });
    assert.match(r.t, /src\/b\.js:3:\d+ {2}\[use\] \(useIt\) {2}return Alpha\.ping/, "rows name the enclosing function");
    r = await text("lsp_references", { symbol: "Alpha.ping", format: "concise", limit: 1, offset: 1 });
    assert.match(r.t, /\nsrc\/\w\.js:\d+:\d+ {2}\[\w+\] \([^)]+\)\n… \d+ more \(offset: 2/, r.t);

    r = await text("lsp_outline", { symbol: "Alpha" });
    assert.match(r.t, /Alpha {2}:2 {2}IIFE module: 1 exported, 1 internal\n {2}\[export\] ping {2}function {2}:4 {2}function ping\(x\) \{\n {2}… 1 internal/, r.t);
    r = await text("lsp_outline", { file: "src/a.js", all: true });
    assert.match(r.t, /SECRET {2}\w+ {2}:3/);

    r = await text("lsp_definition", { symbol: "Alpha.ping", body: true });
    assert.match(r.t, /\n\nsrc\/a\.js:\n {5}4 {4}function ping\(x\) \{\n {5}5 {6}return x \+ SECRET;\n {5}6 {4}\}$/, r.t);

    // Unchanged from HEAD: the pre-existing unknown name is hidden unless all: true.
    r = await text("lsp_diagnostics", { file: "src/b.js" });
    assert.match(r.t, /^0 new since HEAD in src\/b\.js \(1 pre-existing hidden/, r.t);
    // An edit that misspells a member and passes an extra argument (JS parameters are optional
    // to the checker, so too FEW is never an error): only the new ones show.
    w("src/b.js", fs.readFileSync(path.join(dir, "src/b.js"), "utf8") + "const typo = Alpha.pin(4);\nconst arity = Alpha.ping(1, 2);\n");
    r = await text("lsp_diagnostics", { file: "src/b.js" });
    assert.match(r.t, /^2 new since HEAD in src\/b\.js \(1 pre-existing hidden/, r.t);
    assert.match(r.t, /\nsrc\/b\.js:7:\d+ {2}TS2551 Property 'pin' does not exist .*Did you mean 'ping'\?/, r.t);
    assert.match(r.t, /\nsrc\/b\.js:8:\d+ {2}TS2554 Expected 0-1 arguments, but got 2\./, r.t);
    r = await text("lsp_diagnostics", { file: "src/b.js", all: true });
    assert.match(r.t, /^3 high-signal diagnostics/);
    // The pragma never leaks: an ordinary query afterwards sees the disk text.
    r = await text("lsp_definition", { symbol: "Alpha.ping" });
    assert.match(r.t, /src\/a\.js:4:\d+ {2}\[def\] function ping/);
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("lsp-hint.py names the apex-lsp call for a symbol search, and stays quiet otherwise", () => {
  const hook = path.join(ROOT, ".claude/hooks/lsp-hint.py");
  assert.ok(fs.statSync(hook).mode & 0o111, "hook must be executable");
  const run = input => {
    const r = spawnSync("python3", [hook], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, APEX_LSP_HINT: "" } });
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
  };
  let h = run({ tool_name: "Grep", tool_input: { pattern: "Tracks\\.curvature", path: "js" } });
  assert.equal(h.hookEventName, "PreToolUse");
  assert.equal(h.permissionDecision, undefined, "advisory: never decides the permission");
  assert.match(h.additionalContext, /lsp_references \{symbol: "Tracks\.curvature"\}/);
  assert.match(run({ tool_name: "Grep", tool_input: { pattern: "function\\s+forTeam" } }).additionalContext, /lsp_definition \{symbol: "forTeam"\}/);
  assert.match(run({ tool_name: "Bash", tool_input: { command: "grep -rn \"Liveries\\.forTeam\" js | head" } }).additionalContext, /Liveries\.forTeam/);
  for (const quiet of [{ tool_name: "Grep", tool_input: { pattern: "TODO: fix" } }, { tool_name: "Grep", tool_input: { pattern: "wrapS" } },
    { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "css" } }, { tool_name: "Bash", tool_input: { command: "git status" } }])
    assert.equal(run(quiet), null, JSON.stringify(quiet));
  assert.equal(spawnSync("python3", [hook], { input: "not json", encoding: "utf8" }).stdout, "", "fails open");
});

test("lsp-eval: every pinned question answered correctly on the real tree", { timeout: 90000 }, async () => {
  const { run } = await import("../../tools/mcp/lsp-eval.mjs");
  const rows = await run();
  assert.deepEqual(rows.filter(r => !r.ok).map(r => r.q), []);
});
