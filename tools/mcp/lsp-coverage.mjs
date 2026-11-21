#!/usr/bin/env node
// @doc apex-lsp accuracy vs a lexical ground truth: reference recall (raw tsc vs tool), member reads, Module.member defs.
/* lsp-coverage — how much of js/ does the code-intelligence tool actually answer, and how much does the raw
 * TypeScript server answer without the tool's cross-checks? Three measures, each against a ground truth that does
 * not come from the checker:
 *
 *   refs     every function-scoped binding (eslint-scope) in the N largest js/ files: same-file references the raw
 *            server returns vs the lexical truth; then the same through the tool's request() (lexical union).
 *   members  a deterministic sample of `x.y` member reads (x an identifier, not `this`): does the raw server's
 *            definition at `y` land on a line that names `y`? The share that does is what an agent's
 *            `lsp_definition file:line:col` can follow.
 *   defs     every exported member of a sample of IIFE modules (`const M = (function(){ … return { a, b } })()`):
 *            does `lsp_definition M.a` name M's file with a [def] row? Truth: the module's own return object.
 *
 *   node tools/mcp/lsp-coverage.mjs [--files=8] [--members=400] [--modules=40] [--json]
 * Results and the TypeScript version go to stdout; docs/notes/LSP-AND-TOOL-USAGE-2026-11-20.md records a run.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "espree";
import { analyze } from "eslint-scope";
import { Lsp, callTool } from "./lsp-mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? Number(m.split("=")[1]) : d; };

function jsFiles(dir = path.join(ROOT, "js")) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "vendor") out.push(...jsFiles(p)); }
    else if (e.name.endsWith(".js")) out.push(path.relative(ROOT, p));
  }
  return out.sort();
}
const astOf = text => { try { return parse(text, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true }); } catch { return null; } };
function visit(n, f) {
  if (!n || typeof n.type !== "string") return;
  f(n);
  for (const k in n) { if (k === "parent") continue; const v = n[k]; if (Array.isArray(v)) v.forEach(c => visit(c, f)); else if (v && typeof v.type === "string") visit(v, f); }
}
const pos = id => ({ line: id.loc.start.line - 1, character: id.loc.start.column });
const key = p => `${p.line}:${p.character}`;

export async function refsRecall(lsp, files) {
  const out = { files: files.length, bindings: 0, truth: 0, rawMissed: 0, toolMissed: 0, bindingsRawShort: 0, examples: [] };
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8"), ast = astOf(text);
    if (!ast) continue;
    lsp.ensureOpen(f);
    const sm = analyze(ast, { ecmaVersion: 2024, sourceType: "script", optimistic: true, ignoreEval: true });
    const uri = lsp.uriOf(f);
    for (const scope of sm.scopes) {
      if (scope.type === "global") continue;
      for (const v of scope.variables) {
        if (!v.identifiers.length || !v.references.length || v.name === "arguments") continue;
        const truth = new Set([...v.identifiers, ...v.references.map(r => r.identifier)].map(id => key(pos(id))));
        const params = { textDocument: { uri }, position: pos(v.identifiers[0]), context: { includeDeclaration: true } };
        const sameFile = r => new Set((r || []).filter(x => x.uri === uri).map(x => key(x.range.start)));
        const raw = sameFile(await (lsp.rawRequest || lsp.request).call(lsp, "textDocument/references", params));
        const tool = sameFile(await lsp.request("textDocument/references", params));
        const rawMiss = [...truth].filter(k => !raw.has(k)).length, toolMiss = [...truth].filter(k => !tool.has(k)).length;
        out.bindings++; out.truth += truth.size; out.rawMissed += rawMiss; out.toolMissed += toolMiss;
        if (rawMiss) { out.bindingsRawShort++; if (out.examples.length < 8) out.examples.push(`${f}:${v.identifiers[0].loc.start.line} ${v.name} (raw missed ${rawMiss} of ${truth.size})`); }
      }
    }
  }
  return out;
}

export async function memberResolution(lsp, files, cap) {
  const all = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8"), ast = astOf(text);
    if (!ast) continue;
    visit(ast, n => {
      if (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier" && n.property.type === "Identifier"
        && !["window", "self", "globalThis", "Math", "Object", "JSON", "Array", "Number", "console", "document", "performance", "String", "Promise", "Date", "navigator", "location", "localStorage"].includes(n.object.name))
        all.push({ f, id: n.property, head: n.object.name });
    });
  }
  const step = Math.max(1, Math.floor(all.length / cap)), sample = all.filter((_, i) => i % step === 0).slice(0, cap);
  const out = { population: all.length, sample: sample.length, resolved: 0, unresolved: [], byHead: {} };
  for (const s of sample) {
    lsp.ensureOpen(s.f);
    const r = await (lsp.rawRequest || lsp.request).call(lsp, "textDocument/definition", { textDocument: { uri: lsp.uriOf(s.f) }, position: pos(s.id) });
    const locs = (Array.isArray(r) ? r : r ? [r] : []).map(l => l.targetUri ? { uri: l.targetUri, range: l.targetSelectionRange || l.targetRange } : l);
    const ok = locs.some(l => {
      if (!l?.uri?.startsWith("file:")) return false;
      const file = lsp.rel(l.uri); if (!fs.existsSync(path.join(ROOT, file))) return false;
      const line = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n")[l.range.start.line] || "";
      return line.includes(s.id.name) && !(file === s.f && l.range.start.line === s.id.loc.start.line - 1 && l.range.start.character === s.id.loc.start.column);
    });
    if (ok) out.resolved++;
    else { out.byHead[s.head] = (out.byHead[s.head] || 0) + 1; if (out.unresolved.length < 12) out.unresolved.push(`${s.f}:${s.id.loc.start.line}:${s.id.loc.start.column + 1} ${s.head}.${s.id.name}`); }
  }
  out.topUnresolvedHeads = Object.entries(out.byHead).sort((a, b) => b[1] - a[1]).slice(0, 12);
  delete out.byHead;
  return out;
}

function iifeExports(f) {
  const text = fs.readFileSync(path.join(ROOT, f), "utf8"), ast = astOf(text);
  if (!ast) return [];
  const out = [];
  for (const st of ast.body) {
    if (st.type !== "VariableDeclaration") continue;
    for (const d of st.declarations) {
      let call = d.init; if (call?.type !== "CallExpression") continue;
      const fn = call.callee; if (!["FunctionExpression", "ArrowFunctionExpression"].includes(fn.type) || fn.body.type !== "BlockStatement") continue;
      const ret = fn.body.body.filter(n => n.type === "ReturnStatement").at(-1)?.argument;
      const obj = ret?.type === "CallExpression" && ret.arguments[0]?.type === "ObjectExpression" ? ret.arguments[0] : ret;
      if (obj?.type !== "ObjectExpression") continue;
      for (const p of obj.properties) if (p.type === "Property" && !p.computed && p.key.type === "Identifier") out.push({ head: d.id.name, member: p.key.name, f });
    }
  }
  return out;
}

export async function moduleDefs(lsp, files, cap) {
  const mods = files.map(iifeExports).filter(x => x.length);
  const step = Math.max(1, Math.floor(mods.length / cap)), picked = mods.filter((_, i) => i % step === 0).slice(0, cap).flat();
  const out = { modules: Math.min(cap, mods.length), members: picked.length, correct: 0, wrong: [], ms: 0 };
  for (const m of picked) {
    const t = Date.now();
    const r = await callTool(lsp, "lsp_definition", { symbol: `${m.head}.${m.member}` });
    out.ms += Date.now() - t;
    const text = r.content[0].text;
    if (!r.isError && text.includes(`${m.f}:`) && /\[(def|export|alias)\]/.test(text)) out.correct++;
    else if (out.wrong.length < 15) out.wrong.push(`${m.head}.${m.member} (${m.f}): ${text.split("\n")[0].slice(0, 160)}`);
  }
  out.meanMs = Math.round(out.ms / Math.max(1, picked.length));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) { process.stdout.write("node tools/mcp/lsp-coverage.mjs [--files=8] [--members=400] [--modules=40] [--json]\n"); process.exit(0); }
  const require = createRequire(import.meta.url);
  const ts = process.env.APEX_LSP_TSC ? `${process.env.APEX_LSP_TSC} (APEX_LSP_TSC)` : require(path.join(ROOT, "node_modules/typescript/package.json")).version;
  const files = jsFiles(), bySize = [...files].sort((a, b) => fs.statSync(path.join(ROOT, b)).size - fs.statSync(path.join(ROOT, a)).size);
  const lsp = new Lsp({ idleMs: 0 });
  try {
    await lsp.prepare();
    const result = { typescript: ts, refs: await refsRecall(lsp, bySize.slice(0, arg("files", 8))),
      members: await memberResolution(lsp, files, arg("members", 400)), defs: await moduleDefs(lsp, files, arg("modules", 40)) };
    if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else {
      const pct = (a, b) => `${(100 * a / Math.max(1, b)).toFixed(1)}%`, { refs: r, members: m, defs: d } = result;
      process.stdout.write(`typescript ${ts}\n`
        + `refs     ${r.bindings} function-scoped bindings in ${r.files} files, ${r.truth} same-file refs: raw server missed ${r.rawMissed} (${r.bindingsRawShort} bindings short), tool missed ${r.toolMissed}\n`
        + `members  ${m.resolved}/${m.sample} sampled member reads resolve (${pct(m.resolved, m.sample)}; population ${m.population})\n`
        + `defs     ${d.correct}/${d.members} Module.member definitions correct (${pct(d.correct, d.members)}) over ${d.modules} modules, mean ${d.meanMs} ms\n`
        + (r.examples.length ? `\nraw refs short:\n  ${r.examples.join("\n  ")}\n` : "")
        + `\nunresolved member reads (top heads): ${m.topUnresolvedHeads.map(([h, n]) => `${h} ${n}`).join(", ")}\n  ${m.unresolved.join("\n  ")}\n`
        + (d.wrong.length ? `\nwrong Module.member defs:\n  ${d.wrong.join("\n  ")}\n` : ""));
    }
  } finally { lsp.stop(); }
}
