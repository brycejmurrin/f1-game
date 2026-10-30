// apex-lsp (tools/mcp/lsp-mcp.mjs) on scratch FIXTURE workspaces: freshness, ambiguity,
// window globals, guarded head aliases, callers/outline/paging, exportsIn and the
// hardening cases. Split from lsp-mcp.test.mjs (T3-16); the real-tree MCP-client
// cases stay there. Workspaces come from tests/helpers/lsp-fixture.mjs. No browser.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { lspFixture, jsconfig } from "../helpers/lsp-fixture.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("fixture workspace: freshness, ambiguity, window globals, honest misses", { timeout: 60000 }, async () => {
  const { dir, w } = lspFixture("lsp-mcp-");
  w("jsconfig.json", jsconfig());
  w("src/a.js", `"use strict";\nconst Alpha = (function () {\n  function ping(x) { return x + 1; }\n  function wrap(s) { return s; }\n  function quiet(x) { return x; }\n  return { ping, quiet };\n})();\n`);
  w("src/b.js", `"use strict";\n// Alpha.ping in a comment\nconst msg = "Alpha.ping in a string";\nfunction wrap(s) { return s * 2; }\nconst v = Alpha.ping(1);\n`);
  w("src/c.js", `"use strict";\nwindow.Beta = {\n  KEY: 5,\n  go() { return 1; },\n};\nconst k = Beta.KEY + Beta.KEY;\n`);
  w("src/d.js", `"use strict";\nconst {\n  go, KEY: key } = Beta;\n// key in a comment\nconst twice = key * 2;\nconst B = Beta;\nconst again = B.KEY;\n`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", idleMs: 0 });
  const text = async (name, args) => { const r = await callTool(lsp, name, args); return { err: r.isError, t: r.content[0].text }; };
  try {
    let r = await text("lsp_definition", { symbol: "Alpha.ping" });
    assert.match(r.t, /\(Alpha\.ping resolved from a use at src\/b\.js:5:\d+; declared at src\/a\.js:3:\d+\)/, "the code use on line 5, not the comment (2) or the string (3); the header names the declaration");
    assert.match(r.t.split("\n")[1], /^src\/a\.js:3:\d+ {2}\[def\] function ping\(x\)/, "declaration listed before the export");

    r = await text("lsp_definition", { symbol: "wrap" });
    assert.match(r.t, /2 separate top-level declarations named wrap|^2 definitions/);
    r = await text("lsp_definition", { symbol: "Alpha.wrap" });
    assert.match(r.t, /src\/a\.js:4:\d+ {2}\[def\] function wrap/, "the wrap in Alpha's file, never b.js's");
    assert.doesNotMatch(r.t, /src\/b\.js/);
    assert.match(r.t, /no direct Alpha\.wrap use in src\/.*module-file fallback.*export and caller coverage unverified/, "fallback cannot establish export membership");
    r = await text("lsp_definition", { symbol: "Alpha.quiet" });
    assert.equal(r.t, "1 definition (at the declaration; no direct Alpha.quiet use in src/; module-file fallback for quiet; " +
      "export and caller coverage unverified)\nsrc/a.js:5:12  [def] function quiet(x) { return x; }");
    assert.doesNotMatch(r.t, /may not export/, "an exported unused member must not imply missing export");
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

// Guarded whole-head aliases (`const PC = typeof PhysicsConsts !== "undefined" ? …`)
// must feed PC.VMAX (etc.) into textRefs — the bare `const X = Head` pattern missed them.
test("fixture: guarded typeof / || {} head aliases feed member refs", { timeout: 60000 }, async () => {
  const { dir, w } = lspFixture("lsp-mcp-guard-");
  w("jsconfig.json", jsconfig());
  w("src/c.js", `"use strict";\nwindow.Beta = {\n  KEY: 5,\n};\n`);
  // The three forms that appear on PhysicsConsts (player-forces / brake-cue / driving-cues /
  // overtake-mode style): ternary, (typeof && H) || {}, and window.H || {} / H || {}.
  w("src/d.js", `"use strict";
const A = typeof Beta !== "undefined" ? Beta : {};
const B = (typeof Beta !== "undefined" && Beta) || {};
const C = window.Beta || {};
const D = Beta || {};
const E = typeof Beta !== "undefined" ? Beta : null;
const Wrong = typeof Beta !== "undefined" ? Other : {};
const Unguarded = enabled ? Beta : {};
const a = A.KEY;
const b = B.KEY;
const c = C.KEY;
const d = D.KEY;
const e = E.KEY;
const wrong = Wrong.KEY;
const unguarded = Unguarded.KEY;
`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/c.js", idleMs: 0 });
  try {
    const r = await callTool(lsp, "lsp_references", { symbol: "Beta.KEY" });
    const t = r.content[0].text;
    assert.equal(r.isError, false, t);
    // Member reads through the local (`A.KEY`) tag as [alias], same as `const again = B.KEY`.
    assert.match(t, /src\/d\.js:\d+:\d+ {2}\[alias\] \(top level\) {2}const a = A\.KEY;/);
    assert.match(t, /src\/d\.js:\d+:\d+ {2}\[alias\] \(top level\) {2}const b = B\.KEY;/);
    assert.match(t, /src\/d\.js:\d+:\d+ {2}\[alias\] \(top level\) {2}const c = C\.KEY;/);
    assert.match(t, /src\/d\.js:\d+:\d+ {2}\[alias\] \(top level\) {2}const d = D\.KEY;/);
    assert.match(t, /\[alias\].*const e = E\.KEY;/);
    assert.doesNotMatch(t, /const (?:wrong|unguarded) =/);
    assert.match(t, /^6 references in 2 files .*5 of them through a destructure or alias/, t);
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fixture workspace: callers, outline, body, paging, concise, diagnostics new since HEAD", { timeout: 90000 }, async () => {
  const { dir, w, git } = lspFixture("lsp-mcp2-");
  w("jsconfig.json", jsconfig());
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

// Field test 2026-10-30 (scratch/mcp-field-lsp-debugger-gateway.md A): callers at an
// exported declaration kept only the export's uses; an out-of-range file+line answered
// for another name; Head.member references lost the [def] behind a destructured re-export.
test("fixture: callers merge same-file uses, positions are bounds-checked, re-export chains reach the def", { timeout: 60000 }, async () => {
  const { dir, w } = lspFixture("lsp-mcp5-");
  w("jsconfig.json", jsconfig());
  w("src/a.js", `"use strict";\nconst Alpha = (function () {\n  function ping(x) { return x + 1; }\n  function twice(x) { return ping(ping(x)); }\n  return { ping, twice };\n})();\n`);
  w("src/s.js", `"use strict";\nconst Spline = (function () {\n  function curv(t) { return t * 2; }\n  return { curv };\n})();\n`);
  w("src/t.js", `"use strict";\nconst Trk = (function () {\n  const { curv } = Spline;\n  return { curv };\n})();\n`);
  w("src/b.js", `"use strict";\nconst v = Alpha.ping(1);\nconst k = Trk.curv(2) + Trk.curv(3);\n`);
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/a.js", idleMs: 0 });
  const text = async (name, args) => { const r = await callTool(lsp, name, args); return { err: r.isError, t: r.content[0].text }; };
  try {
    let r = await text("lsp_callers", { file: "src/a.js", line: 3, column: 12 });
    // Same-file calls (twice) survive the re-anchor on Alpha.ping; its export's use stays.
    assert.equal(r.t, "3 uses in 2 functions across 2 files (query at src/a.js:3:12)\nsrc/a.js:4  Alpha › twice  ×2  (line 4)\nsrc/b.js:2  top level  ×1");

    r = await text("lsp_hover", { file: "src/a.js", line: 3, column: 500 });
    assert.equal(r.err, true);
    assert.equal(r.t, "line 3 of src/a.js has 36 characters; column 500 is past its end");
    r = await text("lsp_definition", { file: "src/a.js", line: 999999 });
    assert.equal(r.err, true);
    assert.equal(r.t, "src/a.js has 6 lines; line 999999 is out of range");
    r = await text("lsp_hover", { file: "src/a.js", line: 3, column: 37 });
    assert.equal(r.err, false, "the end-of-line cursor stays valid");

    r = await text("lsp_references", { symbol: "Trk.curv" });
    // Trk's export → its `curv` alias of Spline → Spline's export → the [def]; the header names both ends.
    assert.equal(r.t, "6 references in 3 files (Trk.curv resolved from a use at src/b.js:3:15; declared at src/s.js:3:12)\n" +
      "src/b.js:3:15  [use] (top level)  const k = Trk.curv(2) + Trk.curv(3);\nsrc/b.js:3:29  [use] (top level)  const k = Trk.curv(2) + Trk.curv(3);\n" +
      "src/s.js:3:12  [def] (Spline)  function curv(t) { return t * 2; }\nsrc/s.js:4:12  [export] (Spline)  return { curv };\n" +
      "src/t.js:3:11  [alias] (Trk)  const { curv } = Spline;\nsrc/t.js:4:12  [export] (Trk)  return { curv };");
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fixture: exportsIn reads the module's own return, never a nested one or a // in a string", { timeout: 60000 }, async () => {
  const { dir, w } = lspFixture("lsp-mcp3-");
  w("jsconfig.json", jsconfig());
  w("src/log.js", `"use strict";\nconst Lg = (function () {\n  const BASE = "https://a.b/c";\n  function fn() { return 1; }\n  function inner() { return 2; }\n  return {\n    BASE, fn,\n    warn(ns) { return { consoleNs: ns, bufferNs: ns }; },\n    // other: a comment, not a key\n    other: () => inner(),\n  };\n})();\n`);
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

test("fixture: declaration freshness, owner boundaries, lexical aliases, dependency baseline and file lifecycle", { timeout: 60000 }, async () => {
  const base = path.join(ROOT, "scratch"); fs.mkdirSync(base, { recursive: true });
  const { dir, w, git } = lspFixture("lsp-hardening-", base);
  w("jsconfig.json", jsconfig({ typeAcquisition: false, include: ["src/**/*.js", "types/**/*.d.ts"] }));
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

