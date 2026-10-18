// apex-lsp (tools/mcp/lsp-mcp.mjs) driven as an MCP CLIENT drives it — stdio
// JSON-RPC, initialize → tools/list → tools/call — against the REAL js/ tree and
// TypeScript 7's native `tsc --lsp`. Proves cross-file definition, semantic
// references and workspace symbols resolve for script-global IIFEs (jsconfig.json).
// No browser. ~2 s (one tsc --lsp project load).
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Lsp, TOOLS, callTool, classify, codeMask, inCommentOrString } from "../../tools/mcp/lsp-mcp.mjs";

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
    // The enclosing label can hold parentheses (tsgo names callbacks `scanDists.map() callback`).
    assert.ok(rows.every(r => /^\S+ {2}\[\w+\] \(.+?\) {2}\S/.test(r)), "every row: tag, enclosing function, source");
    assert.ok(rows.every(r => !/^\S+ {2}\[\w+\] \(.+?\) {2}(\/\/|\*|\/\*)/.test(r)), "a comment line is not a reference");

    const sym = await c.call("lsp_symbols", { query: "GameHud" });
    assert.match(sym.content[0].text.split("\n")[0], /^GameHud {2}\w+ {2}js\/ui\/hud\.js:\d+:\d+$/);

    // The G façade answers from its contract, interface GameCtx in types/game-ctx.d.ts.
    const g = await c.call("lsp_hover", { symbol: "G.wrapS" });
    assert.match(g.content[0].text, /\nat types\/game-ctx\.d\.ts:\d+:\d+ {2}\[def\] readonly wrapS/);
    assert.match(g.content[0].text, /^```typescript\n\(property\) GameCtx\.wrapS: \(s: number\) => number\n```/);
    // window.X globals are untyped for the checker: a labelled text answer, not "0 definitions".
    const pc = await c.call("lsp_definition", { symbol: "PhysicsConsts.IDLE_RPM" });
    assert.match(pc.content[0].text, /text match.*\njs\/physics\/consts\.js:\d+:\d+ {2}\[def\] IDLE_RPM:/s);

    // Callers follow `const lerp = M4.lerp` aliases to the local calls behind them.
    const lerp = await c.call("lsp_callers", { symbol: "M4.lerp", limit: 2000 });
    assert.match(lerp.content[0].text, /\(via lerp\) {2}×\d+/, lerp.content[0].text.slice(0, 300));
    assert.ok(+/^(\d+) uses/.exec(lerp.content[0].text)[1] >= 50, "aliased helpers have far more callers than alias lines");
    // A case slip gets a suggestion, not a guess.
    assert.match((await c.call("lsp_definition", { symbol: "Tlx" })).content[0].text, /did you mean TLX \(js\/render\/three\/tlx\.js:\d+\)\?$/);

    const pos = await c.call("lsp_definition", { file: "js/ui/select-screen.js", line: 1, column: 1 });
    assert.equal(pos.isError, false, pos.content[0].text);
    // Pipelined requests must keep the diagnostic overlay isolated and recover
    // after an invalid tool argument without dropping the next response.
    const queued = await Promise.all([
      c.call("lsp_diagnostics", { file: "js/core/log.js", all: true }),
      c.call("lsp_symbols", { query: "GameHud", limit: -1 }),
      c.call("lsp_definition", { symbol: "Liveries.forTeam" }),
    ]);
    assert.deepEqual(queued.map(r => r.isError), [false, true, false]);
    assert.match(queued[2].content[0].text, /function forTeam/);
    const frozenExport = await c.call("lsp_definition", { symbol: "FlybyOverrides.resolve", body: true });
    assert.equal(frozenExport.isError, false, frozenExport.content[0].text);
    assert.match(frozenExport.content[0].text, /js\/data\/flyby-overrides\.js:38:.*function resolve/);
    for (const member of ["SHADOW_VS", "LIT_VS", "SKY_VS"]) {
      const assignedExport = await c.call("lsp_definition", { symbol: `GLXShaders.${member}` });
      assert.equal(assignedExport.isError, false, assignedExport.content[0].text);
      assert.match(assignedExport.content[0].text, new RegExp(member));
    }
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
    assert.match(r.t, /src\/d\.js:7:17 {2}\[alias\] \(top level\) {2}const again = B\.KEY;/, "a read through const B = Beta, renamed: an alias");
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
  assert.equal(t("const lerp = M4.lerp;", "lerp", 1), "alias", "the member read only to rename it");
  assert.equal(t("const clamp = M4.clamp, lerp = M4.lerp;", "lerp", 1), "alias", "a later declarator");
  assert.equal(t("const k = Tracks.curvature(track, s);", "curvature"), "use", "a call is a use");
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

test("lsp-hint.py (PostToolUse) names the apex-lsp call after a symbol search, and stays quiet otherwise", () => {
  const hook = path.join(ROOT, ".claude/hooks/lsp-hint.py");
  assert.ok(fs.statSync(hook).mode & 0o111, "hook must be executable");
  const run = input => {
    const r = spawnSync("python3", [hook], { input: JSON.stringify({ hook_event_name: "PostToolUse", ...input }), encoding: "utf8", env: { ...process.env, APEX_LSP_HINT: "" } });
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
  };
  let h = run({ tool_name: "Grep", tool_input: { pattern: "Tracks\\.curvature", path: "js" } });
  assert.equal(h.hookEventName, "PostToolUse");
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8")).hooks;
  assert.ok(settings.PostToolUse.some(g => g.matcher === "Grep|Bash" && g.hooks.some(x => x.command.includes("lsp-hint.py"))), "registered PostToolUse Grep|Bash");
  assert.ok(!settings.PreToolUse.some(g => g.hooks.some(x => x.command.includes("lsp-hint.py"))), "never a PreToolUse guard: those block on failure");
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

// Review fixes (2026-10-18): the code mask, exportsIn, process lifecycle, input confinement.
test("codeMask carries comment, template and regex state across a file", () => {
  const code = (text, word) => !codeMask(text)[text.indexOf(word)];
  assert.equal(code('/"/.test(s); Tracks.curvature(1)', "Tracks"), true, "a quote inside a regex literal");
  assert.equal(code("/it's/; Tracks.x(1)", "Tracks"), true, "an apostrophe inside a regex literal");
  assert.equal(code("`a ${Tracks.curvature(1)} b`", "Tracks"), true, "a template interpolation is code");
  assert.equal(code("`multi\nend`; Tracks.x", "Tracks"), true, "after a multi-line template closes");
  assert.equal(code("a = b\n  * Tracks.curvature(s);", "Tracks"), true, "a wrapped multiplication is not a comment");
  assert.equal(code("n = a / b / Tracks.k", "Tracks"), true, "division is not a regex");
  assert.equal(code("x /* Tracks.curvature */ y", "Tracks"), false, "a mid-line block comment");
  assert.equal(code("/* a\n * Tracks.q\n */", "Tracks"), false, "inside a multi-line block comment");
  assert.equal(code('u = "https://a.b/c"; Tracks.y', "Tracks"), true, "// inside a string opens no comment");
});

test("fixture: exportsIn reads the module's own return, never a nested one or a // in a string", { timeout: 60000 }, async () => {
  const os = await import("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-mcp3-"));
  fs.writeFileSync(path.join(dir, "jsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["src/**/*.js"] }));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src/log.js"), `"use strict";\nconst Lg = (function () {\n  const BASE = "https://a.b/c";\n  function fn() { return 1; }\n  function inner() { return 2; }\n  return {\n    BASE, fn,\n    warn(ns) { return { consoleNs: ns, bufferNs: ns }; },\n    // other: a comment, not a key\n    other: () => inner(),\n  };\n})();\n`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/log.js", idleMs: 0 });
  try {
    const r = await callTool(lsp, "lsp_outline", { symbol: "Lg", all: true });
    // BASE, fn, warn, other are the module's keys (the "https://" string and the comment do not cut the list); inner is internal.
    assert.match(r.content[0].text, /Lg {2}:2 {2}IIFE module: 4 exported, 1 internal/, r.content[0].text);
    assert.doesNotMatch(r.content[0].text, /\[export\] (consoleNs|bufferNs) /, "keys of an object returned by a method are not module exports");
    assert.match(r.content[0].text, /\[export\] other {2}function/, "an arrow-valued key reads as a function");
    for (const bad of [{ file: "../outside.js" }, { file: "jsconfig.json" }]) {
      const d = await callTool(lsp, "lsp_diagnostics", bad);
      assert.equal(d.isError, true); assert.match(d.content[0].text, /inside the workspace|checks JavaScript/);
    }
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("process lifecycle: a failed start is not cached; stop() and a tsc crash both recover", { timeout: 60000 }, async () => {
  const bad = new Lsp({ cmd: "/nonexistent/tsc", timeout: 3000, idleMs: 0 });
  for (let i = 0; i < 2; i++) {
    const r = await callTool(bad, "lsp_symbols", { query: "X" });
    assert.equal(r.isError, true); assert.match(r.content[0].text, /failed to start.*npm install/, `attempt ${i + 1}: ${r.content[0].text}`);
  }
  const lsp = new Lsp({ idleMs: 0 });
  try {
    const ok = q => callTool(lsp, "lsp_symbols", { query: q });
    assert.match((await ok("GameHud")).content[0].text, /js\/ui\/hud\.js/);
    lsp.stop();
    assert.match((await ok("GameHud")).content[0].text, /js\/ui\/hud\.js/, "the call right after stop() starts a fresh tsc");
    process.kill(lsp.proc.pid, "SIGKILL");
    await new Promise(r => lsp.proc ? lsp.proc.once("exit", r) : r());
    assert.match((await ok("GameHud")).content[0].text, /js\/ui\/hud\.js/, "and so does the call after tsc dies");
    // Very ambiguous bare names refuse instead of following one at random; .d.ts types resolve.
    const amb = await callTool(lsp, "lsp_references", { symbol: "create", files: true });
    assert.equal(amb.isError, true); assert.match(amb.content[0].text, /separate top-level declarations.*Head\.member/);
    assert.match((await callTool(lsp, "lsp_definition", { symbol: "TrackModel" })).content[0].text, /types\/game-ctx\.d\.ts:\d+:\d+ {2}\[def\] interface TrackModel/);
  } finally { lsp.stop(); }
});

test("lsp-hint.py: builtins and lowercase heads stay quiet; option values are not patterns", () => {
  const hook = path.join(ROOT, ".claude/hooks/lsp-hint.py");
  const hint = input => !!spawnSync("python3", [hook], { input: JSON.stringify({ hook_event_name: "PostToolUse", ...input }), encoding: "utf8", env: { ...process.env, APEX_LSP_HINT: "" } }).stdout.trim();
  for (const quiet of [{ tool_name: "Grep", tool_input: { pattern: "Math.max" } }, { tool_name: "Bash", tool_input: { command: "grep -n 'head.replace(' lib-x.mjs" } },
    { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "docs", glob: "*.js" } }, { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "js", glob: "*.css" } }])
    assert.equal(hint(quiet), false, JSON.stringify(quiet));
  for (const loud of [{ tool_name: "Bash", tool_input: { command: "rg -t js GameHud js/" } }, { tool_name: "Bash", tool_input: { command: "grep -A 3 GameHud js/ui" } },
    { tool_name: "Bash", tool_input: { command: "grep -rn -e Tracks.curvature js" } }, { tool_name: "Grep", tool_input: { pattern: "G\\.player" } }])
    assert.equal(hint(loud), true, JSON.stringify(loud));
});

test("advertised argument constraints and JSON-RPC envelopes fail before starting tsc", async () => {
  const { handleRpc } = await import("../../tools/mcp/lsp-mcp.mjs");
  const never = { prepare() { throw Error("unexpected tsc start"); } };
  for (const [name, args] of [
    ["lsp_symbols", { query: "Beta", limit: -1 }], ["lsp_symbols", { query: "Beta", offset: 0.5 }],
    ["lsp_symbols", { query: "Beta", limit: 2001 }], ["lsp_symbols", { query: "" }],
    ["lsp_symbols", { query: 123 }], ["lsp_definition", { symbol: "Beta.[" }],
    ["lsp_definition", { file: "src/a.js", line: 0 }], ["lsp_definition", { symbol: "Beta", body: "true" }],
    ["lsp_references", { symbol: "Beta", format: "json" }], ["lsp_hover", { line: 1 }],
    ["lsp_definition", { symbol: "Beta", file: "src/a.js", line: 1 }], ["lsp_symbols", null],
    ["lsp_symbols", []], ["lsp_symbols", JSON.parse('{"query":"Beta","__proto__":{}}')], ["lsp_references", { symbol: "Beta", includeDeclaration: 0 }],
  ]) {
    const r = await callTool(never, name, args);
    assert.equal(r.isError, true, JSON.stringify(args));
    assert.doesNotMatch(r.content[0].text, /unexpected tsc start/);
  }
  for (const request of [null, [], { jsonrpc: "1.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", id: {}, method: "ping" }, { jsonrpc: "2.0", id: 1, method: "ping", params: [] }])
    assert.equal((await handleRpc(never, request)).error.code, -32600);
  for (const params of [{}, { name: "lsp_symbols", arguments: [] }, { name: "lsp_symbols", arguments: null }])
    assert.equal((await handleRpc(never, { jsonrpc: "2.0", id: 1, method: "tools/call", params })).error.code, -32602);
  assert.equal(await handleRpc(never, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal((await handleRpc(never, { jsonrpc: "2.0", id: null, method: "ping" })).id, null);
  assert.equal((await handleRpc(never, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: {} } })).error.code, -32602);
  assert.equal((await handleRpc(never, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "unsupported" } })).result.protocolVersion, "2025-06-18");
});

test("fixture: declaration freshness, owner boundaries, lexical aliases, dependency baseline and file lifecycle", { timeout: 60000 }, async () => {
  const { execFileSync } = await import("node:child_process");
  const base = path.join(ROOT, "scratch"); fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, "lsp-hardening-"));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  const git = (...args) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: dir, stdio: "ignore" });
  w("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, include: ["src/**/*.js", "types/**/*.d.ts"] }));
  w("src/a.js", "const Alpha = { ping(x) { return x; } };\n");
  w("src/b.js", "const value = Alpha.ping(1);\n");
  w("src/w.js", "window.Beta = { KEY: 1 };\nwindow.Other = { nope: 2 };\nfunction local() { const { KEY: key } = Beta; return key; }\nfunction unrelated(key) { return key; }\n// const { KEY: commented } = Beta;\nfunction unrelatedComment(commented) { return commented; }\nfunction alias() { const B = Beta; return B.KEY; }\nfunction shadow(B) { return B.KEY; }\nfunction shadowOwner() { const Beta = { shadowOnly: 2 }; }\n");
  w("src/frozen.js", "window.Frozen = (function () {\n  function resolve() { return 1; }\n  function internal() { return 2; }\n  return Object.freeze({ resolve });\n})();\n");
  w("src/assigned.js", "window.Merged = Object.assign(window.Merged || {}, { first: 1 });\n");
  w("src/assigned-extra.js", "window.Merged = Object.assign(window.Merged || {}, Object.freeze({ second: 2 }));\nwindow.Foreign = { hidden: 3 };\n");
  w("types/game-ctx.d.ts", "interface GameCtx {\n  old: number;\n}\ninterface OldType {}\n");
  git("init", "-q"); git("add", "."); git("commit", "-qm", "base");
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", idleMs: 0 });
  const q = async (name, args) => { const r = await callTool(lsp, name, args); assert.equal(r.isError, false, r.content[0].text); return r.content[0].text; };
  try {
    assert.match(await q("lsp_definition", { symbol: "G.old" }), /old: number/);
    w("types/game-ctx.d.ts", "interface GameCtx {\n  fresh: string;\n}\ninterface FreshType {}\n");
    assert.match(await q("lsp_definition", { symbol: "G.fresh" }), /fresh: string/);
    assert.equal((await callTool(lsp, "lsp_definition", { symbol: "G.old" })).isError, true);
    assert.match(await q("lsp_definition", { symbol: "FreshType" }), /interface FreshType/);
    assert.equal((await callTool(lsp, "lsp_definition", { symbol: "OldType" })).isError, true);
    assert.equal((await callTool(lsp, "lsp_definition", { symbol: "Beta.nope" })).isError, true);
    assert.equal((await callTool(lsp, "lsp_definition", { symbol: "Beta.shadowOnly" })).isError, true);
    assert.match(await q("lsp_definition", { symbol: "Frozen.resolve" }), /function resolve/);
    assert.equal((await callTool(lsp, "lsp_definition", { symbol: "Frozen.internal" })).isError, true);
    assert.match(await q("lsp_definition", { symbol: "Merged.first" }), /src\/assigned\.js/);
    assert.match(await q("lsp_definition", { symbol: "Merged.second" }), /src\/assigned-extra\.js/);
    assert.equal((await callTool(lsp, "lsp_definition", { symbol: "Merged.hidden" })).isError, true);
    const refs = await q("lsp_references", { symbol: "Beta.KEY", includeDeclaration: false });
    assert.doesNotMatch(refs, /\[def\]|unrelated|commented|shadow/);
    assert.match(refs, /return key/); assert.match(refs, /return B\.KEY/);
    assert.match(refs, /^3 references/, refs); // alias binding, same-line local read, whole-object alias read
    assert.match(await q("lsp_diagnostics", { file: "src/b.js" }), /0 high-signal diagnostics.*HEAD subtraction skipped/);
    w("src/a.js", "const Alpha = { ping() { return 1; } };\n");
    const diag = await q("lsp_diagnostics", { file: "src/b.js" });
    assert.match(diag, /HEAD subtraction skipped.*dependencies differ from HEAD/);
    assert.match(diag, /TS2554 Expected 0 arguments, but got 1/);
    await q("lsp_definition", { symbol: "Alpha.ping" });
    fs.renameSync(path.join(dir, "src/a.js"), path.join(dir, "src/moved.js"));
    assert.match(await q("lsp_definition", { symbol: "Alpha.ping" }), /src\/moved\.js/);
    fs.unlinkSync(path.join(dir, "src/moved.js"));
    assert.equal((await callTool(lsp, "lsp_definition", { symbol: "Alpha.ping" })).isError, true);
    w("src/new.js", "const Added = { yes: 1 };\nconst useAdded = Added.yes;\n");
    assert.match(await q("lsp_definition", { symbol: "Added.yes" }), /src\/new\.js/);
    // A staged rename has a source path in status's unprefixed second record.
    // Moving a dependency outside src must prevent a false clean HEAD baseline.
    w("src/a.js", "const Alpha = { ping(x) { return x; } };\n");
    git("checkout", "HEAD", "--", "types/game-ctx.d.ts");
    fs.unlinkSync(path.join(dir, "src/new.js"));
    git("mv", "src/a.js", "outside-a.js");
    const movedDependency = await q("lsp_diagnostics", { file: "src/b.js" });
    assert.match(movedDependency, /HEAD subtraction skipped.*dependencies differ from HEAD/);
    assert.match(movedDependency, /TS2304 Cannot find name 'Alpha'/);
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
