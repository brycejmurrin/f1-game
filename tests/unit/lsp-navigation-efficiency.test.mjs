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

test("cold outlines coalesce by document and generation without serializing files", async () => {
  await fixture(async lsp => {
    lsp.ensureOpen = () => 1;
    const requests = [];
    lsp.request = (method, args) => {
      assert.equal(method, "textDocument/documentSymbol");
      return new Promise((resolve, reject) => requests.push({ uri: args.textDocument.uri, resolve, reject }));
    };
    const locations = Array.from({ length: 40 }, (_, line) => ({ uri: lsp.uriOf("src/ui/panel.js"), range: { start: { line, character: 0 } } }));
    const page = lsp.locRows(locations, { where: true, limit: 40 });
    const independent = lsp.outlineOf("src/core/ops.js");
    await Promise.resolve();
    assert.equal(requests.length, 2, "one cold RPC per file, with independent files dispatched together");
    requests.forEach(r => r.resolve([]));
    const rows = await page;
    await independent;
    assert.deepEqual(await lsp.locRows(locations, { where: true, limit: 40 }), rows);
    assert.equal(requests.length, 2, "warm pages keep identical bounded row output");

    lsp.mtimes.set("src/ui/panel.js", 2);
    const edited = lsp.outlineOf("src/ui/panel.js");
    await Promise.resolve();
    requests[2].reject(Error("owned outline failure"));
    await assert.rejects(edited, /owned outline failure/);
    const retry = lsp.outlineOf("src/ui/panel.js");
    await Promise.resolve();
    assert.equal(requests.length, 4, "a rejection does not poison this document");
    requests[3].resolve([]);
    await retry;
  });
});

test("old outline completions cannot replace edited or restarted generations", async () => {
  await fixture(async lsp => {
    lsp.ensureOpen = () => 1;
    const requests = [];
    lsp.request = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
    const file = "src/ui/panel.js", old = lsp.outlineOf(file);
    await Promise.resolve();
    lsp.mtimes.set(file, 2);
    const edited = lsp.outlineOf(file);
    await Promise.resolve();
    const editedTree = [{ name: "edited" }];
    requests[1].resolve(editedTree);
    await edited;
    requests[0].resolve([{ name: "old" }]);
    await old;
    assert.deepEqual(await lsp.outlineOf(file), editedTree);

    lsp.mtimes.set(file, 3);
    const beforeReset = lsp.outlineOf(file);
    await Promise.resolve();
    lsp.reset();
    const replacement = lsp.outlineOf(file);
    await Promise.resolve();
    const replacementTree = [{ name: "replacement" }];
    requests[3].resolve(replacementTree);
    await replacement;
    requests[2].reject(Error("old generation exited"));
    await assert.rejects(beforeReset, /old generation exited/);
    assert.deepEqual(await lsp.outlineOf(file), replacementTree, "old rejection must not delete the new cache");
  });
});

test("diagnostic cleanup preserves failures and leaves a replacement server alone", async () => {
  await fixture(async lsp => {
    lsp.prepare = async () => {};
    const pipe = () => ({ stdin: { destroyed: false, write() {} } });
    lsp.proc = pipe();
    lsp.request = async () => { lsp.reset(); throw Error("tsc --lsp exited: owned fixture cause"); };
    const exited = await callTool(lsp, "lsp_diagnostics", { file: "src/ui/panel.js", all: true });
    assert.equal(exited.content[0].text, "tsc --lsp exited: owned fixture cause");
    assert.equal(exited.isError, true);
    assert.equal(lsp.open.size, 0);
    assert.equal(lsp.syms.size, 0);

    lsp.proc = pipe();
    lsp.request = async () => { throw Error("primary diagnostic failure"); };
    const notify = lsp.notify.bind(lsp);
    lsp.notify = (method, args) => {
      if (method === "textDocument/didClose") throw Error("secondary cleanup failure");
      notify(method, args);
    };
    await assert.rejects(lsp.diagnose("src/ui/panel.js", true), /primary diagnostic failure/);
    assert.equal(lsp.open.size, 0, "local cleanup runs even if didClose fails");
    lsp.request = async () => ({ items: [] });
    await assert.rejects(lsp.diagnose("src/ui/panel.js", true), /secondary cleanup failure/, "a cleanup failure is visible when there is no primary failure");
    assert.equal(lsp.open.size, 0);

    let closes = 0;
    lsp.notify = (method, args) => { if (method === "textDocument/didClose") closes++; else notify(method, args); };
    lsp.request = async () => {
      lsp.reset(); lsp.proc = pipe();
      lsp.open.set("src/ui/panel.js", 9);
      lsp.syms.set("src/ui/panel.js", { replacement: true });
      throw Error("old diagnostic generation exited");
    };
    await assert.rejects(lsp.diagnose("src/ui/panel.js", true), /old diagnostic generation exited/);
    assert.equal(closes, 0);
    assert.equal(lsp.open.get("src/ui/panel.js"), 9);
    assert.deepEqual(lsp.syms.get("src/ui/panel.js"), { replacement: true });
    lsp.proc = null; // owned fake pipe has no child lifecycle
  });
});

// Compare the returned navigation records, rather than regex presence in text.
const auditExports = text => text.split("\n").flatMap(line => {
  const fields = /^\s*\[export\] (.*?) {2}(\w+)/.exec(line);
  return fields ? [[fields[1], fields[2]]] : [];
});
const auditCallers = text => locationRows(text).map(row => row.split(/\s{2,}/)[1]);

test("audit: comma aliases and function arguments remain real consumers", async () => {
  await fixture(async (lsp, root) => {
    fs.writeFileSync(path.join(root, "src/audit.js"), `function firstAudit() {
  const run = Ops.run, extra = 1;
  return run(extra);
}
function passAudit(fn, value) { return fn(value); }
function secondAudit() { return passAudit(Ops.run, 2); }
`);
    const callers = await query(lsp, "lsp_callers", { symbol: "Ops.run", path: "src/audit.js" });
    assert.deepEqual(auditCallers(callers), ["firstAudit (via run)", "secondAudit"]);
  });
});

test("audit: outlines describe wrapped, spread and returned object APIs", async () => {
  await fixture(async (lsp, root) => {
    fs.writeFileSync(path.join(root, "src/audit.js"), `const FrozenAudit = (() => {
  function ping() { return 1; }
  return Object.freeze({ ping, value: 1 });
})();
const SpreadAudit = (() => {
  function pong() { return 2; }
  const api = { pong };
  return { ...api };
})();
const AssignedAudit = (() => {
  function act() { return 3; }
  const api = { act };
  return Object.assign({}, api);
})();
const ReturnedAudit = (() => {
  const api = { play() { return 4; } };
  return api;
})();
const RenamedAudit = (() => {
  function internal() { return 5; }
  return { publicName: internal };
})();
`);
    for (const [symbol, expected] of [
      ["FrozenAudit", [["ping", "function"], ["value", "property"]]],
      ["SpreadAudit", [["pong", "function"]]],
      ["AssignedAudit", [["act", "function"]]],
      ["ReturnedAudit", [["play", "function"]]],
      ["RenamedAudit", [["publicName", "function"]]],
    ]) {
      const outline = await query(lsp, "lsp_outline", { symbol });
      assert.deepEqual(auditExports(outline), expected, symbol);
    }
  });
});

test("audit: unused member fallback stays inside the selected IIFE", async () => {
  await fixture(async (lsp, root) => {
    fs.writeFileSync(path.join(root, "src/audit.js"), `const LeftAudit = (() => {
  function ping() { return "left"; }
  return { ping };
})();
const RightAudit = (() => {
  function ping() { return "right"; }
  return { ping };
})();
`);
    const definition = await query(lsp, "lsp_definition", { symbol: "RightAudit.ping", body: true });
    assert.deepEqual(locationRows(definition), ['src/audit.js:6:12  [def] function ping() { return "right"; }']);
    const body = definition.split("\n").filter(row => /^\s*\d+ {2}/.test(row)).map(row => row.replace(/^\s*\d+ {2}/, "").trim());
    assert.deepEqual(body, ['function ping() { return "right"; }']);
  });
});

test("audit: reinjected globals expose the implementation beside the boot stub", async () => {
  await fixture(async (lsp, root) => {
    fs.writeFileSync(path.join(root, "src/audit-boot.js"), "var LazyAudit = { ping: () => null };\n");
    fs.writeFileSync(path.join(root, "src/audit-full.js"), `var LazyAudit = (() => {
  function ping() { return 42; }
  return Object.freeze({ ping });
})();
`);
    fs.writeFileSync(path.join(root, "src/audit-use.js"), "function useLazyAudit() { return LazyAudit.ping(); }\n");
    const definition = await query(lsp, "lsp_definition", { symbol: "LazyAudit.ping", body: true });
    assert.deepEqual(locationRows(definition), [
      'src/audit-boot.js:1:19  [def] var LazyAudit = { ping: () => null };',
      'src/audit-full.js:2:12  [def] function ping() { return 42; }',
    ]);
    assert.equal(definition.split("\n")[0].split("; ").at(-1), "runtime load order may determine the winner)");
    const outline = await query(lsp, "lsp_outline", { symbol: "LazyAudit" });
    assert.equal(outline.split("\n")[0], "multiple declarations of LazyAudit; runtime load order may determine the implementation");
    assert.deepEqual(auditExports(outline), [["ping", "function"], ["ping", "function"]]);
    fs.writeFileSync(path.join(root, "src/audit-combined.js"), `var CombinedAudit = { boot: true };
var CombinedAudit = (() => {
  function act() { return 9; }
  return { act };
})();
`);
    const combined = await query(lsp, "lsp_outline", { symbol: "CombinedAudit" });
    assert.deepEqual(auditExports(combined), [["boot", "property"], ["act", "function"]]);
    assert.equal(combined.split("\n")[0], "multiple declarations of CombinedAudit; runtime load order may determine the implementation");
  });
});

test("audit: unsupported languages fail before starting the compiler", async () => {
  await fixture(async (lsp, root) => {
    fs.writeFileSync(path.join(root, "src/audit.css"), "@keyframes fade { from { opacity: 0; } }\n");
    lsp.prepare = () => { throw Error("compiler must not start"); };
    for (const name of ["lsp_outline", "lsp_definition", "lsp_references", "lsp_hover"]) {
      const args = { file: "src/audit.css", ...(name === "lsp_outline" ? {} : { line: 1, column: 1 }) };
      const result = await callTool(lsp, name, args);
      assert.equal(result.isError, true);
      assert.equal(result.content[0].text, "unsupported language: src/audit.css; navigation supports JavaScript (.js/.mjs/.cjs) and TypeScript (.ts/.mts/.cts)");
    }
  });
});

test("audit: equal-size edits with preserved mtime refresh source and outlines", async () => {
  await fixture(async (lsp, root) => {
    const file = path.join(root, "src/core/ops.js"), stamp = new Date(1700000000000);
    fs.utimesSync(file, stamp, stamp);
    assert.deepEqual(auditExports(await query(lsp, "lsp_outline", { symbol: "Ops" })), [["run", "function"]]);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll("run", "act"));
    fs.utimesSync(file, stamp, stamp);
    const outline = await query(lsp, "lsp_outline", { symbol: "Ops" });
    assert.deepEqual(auditExports(outline), [["act", "function"]]);
  });
});
