// apex-lsp (tools/mcp/lsp-mcp.mjs) driven as an MCP CLIENT drives it — stdio
// JSON-RPC, initialize → tools/list → tools/call — against the REAL js/ tree and
// TypeScript 7's native `tsc --lsp`. Proves cross-file definition, semantic
// references and workspace symbols resolve for script-global IIFEs (jsconfig.json),
// including guarded head aliases (`typeof H !== "undefined" ? H : {}`, `(typeof H && H) || {}`,
// `H || {}`) that feed PC.VMAX-style member reads. No browser. One shared MCP
// child (and its tsc --lsp) covers the real-tree client cases: cold start once,
// then tens–hundreds of ms per tool (docs/notes/LSP-MCP-TIMEOUT-2026-10-19.md).
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { nativeMcpConfig } from "../helpers/agent-output-launch.mjs";
import { test, after } from "node:test";
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

// One MCP child for the real-tree client cases: initialize once, share the
// warmed tsc project. Closing between cases re-paid the cold start and was the
// 90 s CI timeout (Pure-node unit suites (slow), run 39158195670).
let mcp;
async function sharedMcp() {
  if (mcp) return mcp;
  mcp = client();
  const init = await mcp.req("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lsp-mcp.test", version: "0" } });
  assert.equal(init.result.serverInfo.name, "apex-lsp");
  return mcp;
}
after(() => { mcp?.close(); mcp = null; });

test("jsconfig.json makes js/ one script project with checkJs off", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "jsconfig.json"), "utf8"));
  assert.equal(cfg.compilerOptions.allowJs, true);
  assert.equal(cfg.compilerOptions.noEmit, true);
  assert.equal(cfg.compilerOptions.checkJs, false, "checkJs on reports ~39k strict errors (docs/notes/LSP-MCP-2026-10-18.md)");
  assert.ok(cfg.include.includes("js/**/*.js"));
});

test(".mcp.json launches apex-lsp with the repo server", () => {
  const s = nativeMcpConfig(JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8"))).mcpServers["apex-lsp"];
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

test("MCP client: definition, references and symbols on the real tree", { timeout: 60000 }, async () => {
  const c = await sharedMcp();
  const list = await c.req("tools/list", {});
  assert.equal(list.result.tools.length, TOOLS.length);

  // Warm the project with a cheap symbols call, then pipeline independent
  // lookups so the case stays well under the timeout on a contended runner.
  // (The MCP server still serializes tools/call; pipelining here keeps the
  // client honest and overlaps JSON-RPC write/read with the next enqueue.)
  await c.call("lsp_symbols", { query: "GameHud" });
  const [def, refs, sym, g, pc] = await Promise.all([
    c.call("lsp_definition", { symbol: "Liveries.forTeam" }),
    // Default page (200) is enough: assertions need ≥30 rows / ≥10 files, not the full 2000.
    c.call("lsp_references", { symbol: "Tracks.curvature" }),
    c.call("lsp_symbols", { query: "GameHud" }),
    c.call("lsp_hover", { symbol: "G.wrapS" }),
    c.call("lsp_definition", { symbol: "PhysicsConsts.IDLE_RPM" }),
  ]);

  // Liveries.forTeam is used in other files; the answer is its declaration in liveries.js.
  assert.equal(def.isError, false, def.content[0].text);
  assert.match(def.content[0].text, /^js\/car\/liveries\.js:\d+:\d+ {2}\[def\] function forTeam\(/m);
  assert.doesNotMatch(def.content[0].text.split("\n")[0], /query at js\/car\/liveries\.js/, "the query position is a use in another file");

  // Semantic references: many files, the declaration in tracks.js, no comment lines.
  assert.equal(refs.isError, false, refs.content[0].text);
  const rows = refs.content[0].text.split("\n").filter(r => /^js\//.test(r));
  const files = new Set(rows.map(r => r.split(":")[0]));
  assert.ok(rows.length >= 30 && files.size >= 10, `${rows.length} refs in ${files.size} files`);
  assert.ok(files.has("js/track/tracks.js") && files.has("js/game.js"));
  // The enclosing label can hold parentheses (tsgo names callbacks `scanDists.map() callback`).
  assert.ok(rows.every(r => /^\S+ {2}\[\w+\] \(.+?\) {2}\S/.test(r)), "every row: tag, enclosing function, source");
  assert.ok(rows.every(r => !/^\S+ {2}\[\w+\] \(.+?\) {2}(\/\/|\*|\/\*)/.test(r)), "a comment line is not a reference");

  assert.match(sym.content[0].text.split("\n")[0], /^GameHud {2}\w+ {2}js\/ui\/hud\.js:\d+:\d+$/);

  // The G façade answers from its contract, interface GameCtx in types/game-ctx.d.ts.
  assert.match(g.content[0].text, /\nat types\/game-ctx\.d\.ts:\d+:\d+ {2}\[def\] readonly wrapS/);
  assert.match(g.content[0].text, /^```typescript\n\(property\) GameCtx\.wrapS: \(s: number\) => number\n```/);
  // window.X globals are untyped for the checker: a labelled text answer, not "0 definitions".
  assert.match(pc.content[0].text, /text match.*\njs\/physics\/consts\.js:\d+:\d+ {2}\[def\] IDLE_RPM:/s);

  // Callers follow `const lerp = M4.lerp` aliases to the local calls behind them.
  // Header total (not the printed page) must stay ≥50; limit is only for rows.
  const lerp = await c.call("lsp_callers", { symbol: "M4.lerp" });
  assert.match(lerp.content[0].text, /\(via lerp\) {2}×\d+/, lerp.content[0].text.slice(0, 300));
  assert.ok(+/^(\d+) uses/.exec(lerp.content[0].text)[1] >= 50, "aliased helpers have far more callers than alias lines");
  // A case slip gets a suggestion, not a guess.
  assert.match((await c.call("lsp_definition", { symbol: "Tlx" })).content[0].text, /did you mean TLX \(js\/render\/three\/tlx\.js:\d+\)\?$/);
  // A game.js IIFE local is not on GameCtx: the façade miss names the next call.
  assert.match((await c.call("lsp_definition", { symbol: "G.updateCar" })).content[0].text, /has no member updateCar; .*try lsp_symbols updateCar/);

  const pos = await c.call("lsp_definition", { file: "js/ui/select-screen.js", line: 1, column: 1 });
  assert.equal(pos.isError, false, pos.content[0].text);
});

// Split from the case above: same warmed MCP child, separate timeout budget.
// These assertions landed on the ship tip after the 90 s failure and must not
// re-inflate that single case.
test("MCP client: pipeline isolation and freeze/assign exports", { timeout: 60000 }, async () => {
  const c = await sharedMcp();
  // Pipelined requests must keep the diagnostic overlay isolated and recover
  // after an invalid tool argument without dropping the next response.
  // The server serializes tools/call (one LSP conversation); Promise.all still
  // proves the client does not drop a later response when an earlier one errors.
  const queued = await Promise.all([
    c.call("lsp_diagnostics", { file: "js/core/log.js", all: true }),
    c.call("lsp_symbols", { query: "GameHud", limit: -1 }),
    c.call("lsp_definition", { symbol: "Liveries.forTeam" }),
  ]);
  assert.deepEqual(queued.map(r => r.isError), [false, true, false]);
  assert.match(queued[2].content[0].text, /function forTeam/);
  const frozenExport = await c.call("lsp_definition", { symbol: "FlybyOverrides.resolve", body: true });
  assert.equal(frozenExport.isError, false, frozenExport.content[0].text);
  assert.match(frozenExport.content[0].text, /js\/data\/flyby-overrides\.js:127:.*function resolve/);
  // Pipeline the three assigned-export lookups (independent heads).
  const assigned = await Promise.all(["SHADOW_VS", "LIT_VS", "SKY_VS"].map(member =>
    c.call("lsp_definition", { symbol: `GLXShaders.${member}` })));
  for (let i = 0; i < assigned.length; i++) {
    assert.equal(assigned[i].isError, false, assigned[i].content[0].text);
    assert.match(assigned[i].content[0].text, new RegExp(["SHADOW_VS", "LIT_VS", "SKY_VS"][i]));
  }
});

// Field test 2026-10-30 regressions on the real tree (scratch/mcp-field-lsp-debugger-gateway.md A).
// Rows are parsed, not regex-pinned: the checker's own answers are the ground truth.
test("MCP client: wrapS callers keep same-file uses, bounds-checked positions, Tracks.curvature [def]", { timeout: 60000 }, async () => {
  const c = await sharedMcp();
  // The game-loop wrapS (exported as G.wrapS), located through the checker, not a source read.
  const sym = (await c.call("lsp_symbols", { query: "wrapS", limit: 50 })).content[0].text;
  const decl = /^wrapS {2}function {2}(js\/game\.js):(\d+):(\d+)$/m.exec(sym);
  assert.ok(decl, sym);
  const at = { file: decl[1], line: +decl[2], column: +decl[3] };
  const hudLines = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8").replace(/\n$/, "").split("\n");
  const [callers, inFile, past, beyond, refs] = await Promise.all([
    c.call("lsp_callers", { ...at, limit: 2000 }),
    c.call("lsp_references", { ...at, includeDeclaration: false, format: "concise", limit: 2000 }),
    c.call("lsp_hover", { file: "js/ui/hud.js", line: 1, column: hudLines[0].length + 50 }),
    c.call("lsp_definition", { file: "js/ui/hud.js", line: 999999 }),
    c.call("lsp_references", { symbol: "Tracks.curvature", limit: 2000 }),
  ]);
  const rows = r => r.content[0].text.split("\n").slice(1).map(l => /^(\S+?):\d+(?::\d+)? {2}(?:\[(\w+)\])?/.exec(l)).filter(Boolean).map(m => ({ file: m[1], tag: m[2] }));
  const uses = rows(inFile).filter(r => r.file === at.file && r.tag === "use").length;
  const total = +/^(\d+) uses/.exec(callers.content[0].text)?.[1], callerFiles = new Set(rows(callers).map(r => r.file));
  assert.ok(uses >= 10, `lsp_references finds the in-file uses (${uses})`);
  assert.ok(callerFiles.has(at.file), `same-file callers survive the G.wrapS re-anchor: ${callers.content[0].text.slice(0, 300)}`);
  assert.ok(callerFiles.size > 1 && total > uses, `${total} uses: the ${uses} in ${at.file} plus the exported G.wrapS uses elsewhere`);
  assert.equal(past.isError, true);
  assert.equal(past.content[0].text, `line 1 of js/ui/hud.js has ${hudLines[0].length} characters; column ${hudLines[0].length + 50} is past its end`);
  assert.equal(beyond.isError, true);
  assert.equal(beyond.content[0].text, `js/ui/hud.js has ${hudLines.length} lines; line 999999 is out of range`);
  // The declaration behind Tracks' destructured re-export is a row, and the header names it
  // (never presenting the use-site anchor as the answer).
  assert.deepEqual(rows(refs).filter(r => r.tag === "def").map(r => r.file), ["js/track/core/spline.js"]);
  assert.equal(/; declared at (\S+):\d+:\d+\)$/.exec(refs.content[0].text.split("\n")[0])?.[1], "js/track/core/spline.js");
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
test("real tree: PhysicsConsts.VMAX refs include PC.VMAX behind guarded aliases", { timeout: 90000 }, async () => {
  const lsp = new Lsp({ idleMs: 0 });
  try {
    const r = await callTool(lsp, "lsp_references", { symbol: "PhysicsConsts.VMAX", limit: 2000 });
    assert.equal(r.isError, false, r.content[0].text);
    const t = r.content[0].text;
    // The files that only spell VMAX as PC.VMAX after a guarded `const PC = …`.
    for (const f of ["js/physics/player-forces.js", "js/physics/brake-cue.js", "js/audio/driving-cues.js"]) {
      assert.match(t, new RegExp(f.replace(/\//g, "\\/") + ":\\d+:\\d+ {2}\\[\\w+\\].*PC\\.VMAX"), `${f} PC.VMAX missing:\n${t.slice(0, 800)}`);
    }
  } finally { lsp.stop(); }
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
    { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "docs", glob: "*.js" } },
    // A path outside js/ is text, not a script global (audit 2026-10-26 row 16).
    { tool_name: "Grep", tool_input: { pattern: "TURN", path: "artifacts/digest.txt" } }, { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "tools/ci" } },
    { tool_name: "Bash", tool_input: { command: "grep -n TURN /root/x/digest.txt" } }, { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "js", glob: "*.css" } }])
    assert.equal(hint(quiet), false, JSON.stringify(quiet));
  for (const loud of [{ tool_name: "Bash", tool_input: { command: "rg -t js GameHud js/" } }, { tool_name: "Bash", tool_input: { command: "grep -A 3 GameHud js/ui" } },
    { tool_name: "Bash", tool_input: { command: "grep -rn -e Tracks.curvature js" } }, { tool_name: "Grep", tool_input: { pattern: "G\\.player" } },
    { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "./js/ui" } }, { tool_name: "Grep", tool_input: { pattern: "GameHud", path: "." } },
    { tool_name: "Bash", tool_input: { command: "grep -rn GameHud | head" } }])
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
