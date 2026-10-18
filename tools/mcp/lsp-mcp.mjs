#!/usr/bin/env node
// @doc Stdio MCP code intelligence over TypeScript 7's native `tsc --lsp`: definition, references, symbols, hover, diagnostics.
/* lsp-mcp — go-to-definition / find-references for agents, instead of grep.
 *
 * WHY THIS AND NOT A STOCK BRIDGE (measured 2026-10-18, docs/notes/LSP-MCP-2026-10-18.md):
 *   - Claude Code plugin LSP servers do not start in cloud sessions; project
 *     .mcp.json servers do. So code intelligence has to arrive as an MCP server.
 *   - isaacphi/mcp-language-server v0.1.1 cannot initialize TS 7's native LSP
 *     (it sends semanticTokens.requests.range: null, tsgo answers InvalidParams).
 *     Over typescript-language-server + TS 5 it connects, but returns a whole
 *     IIFE body per definition (GameHud: 178k chars) and cannot resolve the
 *     qualified names this codebase is made of (`Liveries.forTeam`).
 *   - `typescript` (^7, a devDependency already) ships `tsc --lsp --stdio`:
 *     nothing to install, ~55 ms to initialize.
 *
 * The code is script-global IIFEs (`const Tracks = (function(){…})()`), which
 * jsconfig.json makes one project, so a member is resolved where it is USED:
 * the first `Head.member` occurrence in js/ is the query position.
 * Positions in and out are ONE-based. Files changed on disk are re-sent before
 * every query, so answers follow the working tree.
 *
 *   node tools/mcp/lsp-mcp.mjs                      # stdio MCP (the .mcp.json entry)
 *   node tools/mcp/lsp-mcp.mjs def Liveries.forTeam # the same tools from a shell
 *   node tools/mcp/lsp-mcp.mjs refs Tracks.curvature | sym GameHud | hover X.y | diag js/game.js
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { parse } from "espree";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = "js";
const ANCHOR = "js/core/log.js";   // tsgo searches open projects only: one open file loads jsconfig's
const KIND = { 5: "class", 6: "method", 7: "property", 8: "field", 9: "constructor", 12: "function", 13: "variable", 14: "constant" };
const MAX_ROWS = 200;
const CANDIDATES = 6;
const AMBIGUOUS = 4;   // more same-named top-level declarations than this: references refuse to pick one
const BODY_LINES = 40;   // definition body cap (maxLines raises it)
const FN_KINDS = new Set([5, 6, 9, 12]);   // class, method, constructor, function
// Diagnostics worth an agent's attention with checkJs off project-wide: unknown names,
// "did you mean" typos, wrong arity, assigning a const, calling a non-function, redeclaring.
// TS2339 (property missing) is left out: expando objects make it noise (2026-10-18 probe).
const DIAG_CODES = new Set([2304, 2551, 2552, 2554, 2555, 2588, 2349, 2451]);
// Modules receive the game façade as an untyped `G` parameter; its contract is
// `interface GameCtx` in types/game-ctx.d.ts (AGENTS.md §Layout), so G.x answers from there.
const FACADES = { G: { iface: "GameCtx", file: "types/game-ctx.d.ts" } };   // query positions tried per symbol before the text fallback

// An LSP answer worth returning: a non-empty location list, or a hover that says more than `any`.
const answered = r => Array.isArray(r) ? r.length > 0
  : !!r && !(r.contents && /^\s*(```\w*\s*)?(\(\w+\) )?[\w.$]*:?\s*any\s*(```)?\s*$/.test(typeof r.contents === "string" ? r.contents : r.contents.value || ""));

// What a row IS, from the identifier at `col`: the declaration, an IIFE export-list
// entry, an alias (`const { x } = Head`, `const x = Head.x`), or a use. Ranks
// definitions (def first) and tags every row so an agent can skip the noise.
const TAG_RANK = { def: 0, export: 1, alias: 2, use: 3 };
export function classify(line, col, next = "") {
  const before = line.slice(0, col), after = line.slice(col).replace(/^[\w$]+/, "");
  if (/\b(function\*?|class|interface|type|enum)\s+$/.test(before) || /\breadonly\s+$/.test(before)) return "def";
  // `const { a } = Head` / `const K = Head;`: the head itself is being aliased.
  if (/^\s*([;,)]|$)/.test(after) && (/\}\s*=\s*(window\.)?$/.test(before) || /\b(const|let|var)\s+[\w$]+\s*=\s*(window\.)?$/.test(before))) return "alias";
  if (/\b(const|let|var)\s*[{[][^}\]]*$/.test(before)) return "alias";
  // `const x = …` and later declarators (`const a = 1, x = …`): a bare member expression is an alias.
  if (/\b(const|let|var)\s+$/.test(before) || (/^\s*(const|let|var)\s/.test(line) && /,\s*$/.test(before) && /^\s*=(?!=)/.test(after)))
    return /^\s*=\s*(window\.)?[\w$]+(\.[\w$]+)*\s*([;,].*|\/\/.*)?$/.test(after) ? "alias" : "def";
  const closesDestructure = !/\breturn\b/.test(before) && /^[^;]*?\}\s*=(?![=>])/.test(`${after}\n${next}`);
  if ((/^\s*(async\s+)?(get\s+|set\s+)?$/.test(before) || /[{,]\s*$/.test(before)) && (/^\??\s*:(?!:)/.test(after) || /^\s*\([^)]*\)\s*\{/.test(after)))
    return closesDestructure && /^\s*:\s*[\w$]+\s*[,}]/.test(after) ? "alias" : "def";
  // A shorthand list that closes with `} = expr` (maybe lines later) is a destructure, else an export list.
  if (isShorthand(line, col)) return closesDestructure ? "alias" : "export";
  // `const lerp = M4.lerp` / `const a = 1, lerp = M4.lerp;`: the member is read only to rename it.
  if (/^\s*(const|let|var)\s/.test(line) && /(?:\b(?:const|let|var)\s+|,\s*)[\w$]+\s*=\s*(?:window\.)?(?:[\w$]+\??\.)+$/.test(before) && /^\s*([;,]|\/\/|$)/.test(after)) return "alias";
  return "use";
}

// Is the identifier at `col` a shorthand property (`{ a, name, b }`) — an export, not a declaration?
const isShorthand = (line, col) => /^[\w$]+\s*[,}]/.test(line.slice(col)) && !/(const|let|var|function)\s+$/.test(line.slice(0, col));

// Which characters of a source text are NOT code: comments, string and template text
// (a template's `${…}` is code again), regex literals. One pass, state carried across
// lines, so a block comment, a multi-line template and `x\n  * y` are all classified
// right (the per-line heuristic it replaces was fooled by each, review 2026-10-18).
const REGEX_AFTER = /(^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await))\s*$/;
export function codeMask(text) {
  const mask = new Uint8Array(text.length), stack = [];   // stack: "tpl" | brace depth (number) of a ${…}
  let i = 0;
  const skipTo = (end, k) => { for (; k < text.length && !end(k); k++) mask[k] = 1; return k; };
  while (i < text.length) {
    const c = text[i], top = stack[stack.length - 1];
    if (top === "tpl") {
      if (c === "\\") { mask[i] = mask[i + 1] = 1; i += 2; continue; }
      if (c === "`") { mask[i++] = 1; stack.pop(); continue; }
      if (c === "$" && text[i + 1] === "{") { mask[i] = mask[i + 1] = 1; i += 2; stack.push(0); continue; }
      mask[i++] = 1; continue;
    }
    if (c === "/" && text[i + 1] === "/") { i = skipTo(k => text[k] === "\n", i); continue; }
    if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2), end = e < 0 ? text.length : e + 2; mask.fill(1, i, end); i = end; continue; }
    if (c === "'" || c === '"') {
      let k = i + 1;
      for (; k < text.length && text[k] !== c && text[k] !== "\n"; k++) if (text[k] === "\\") k++;
      mask.fill(1, i, Math.min(k + 1, text.length)); i = k + 1; continue;
    }
    if (c === "`") { mask[i++] = 1; stack.push("tpl"); continue; }
    if (c === "/" && REGEX_AFTER.test(text.slice(Math.max(0, i - 12), i))) {
      let k = i + 1, cls = false;
      for (; k < text.length && text[k] !== "\n"; k++) {
        if (text[k] === "\\") { k++; continue; }
        if (text[k] === "[") cls = true; else if (text[k] === "]") cls = false; else if (text[k] === "/" && !cls) break;
      }
      if (text[k] === "/") { k++; while (/[a-z]/.test(text[k] || "")) k++; mask.fill(1, i, k); i = k; continue; }
    }
    if (typeof top === "number") {
      if (c === "{") stack[stack.length - 1]++;
      else if (c === "}") { if (top === 0) { mask[i++] = 1; stack.pop(); continue; } stack[stack.length - 1]--; }
    }
    i++;
  }
  return mask;
}
// Line-level form (one line's own context only); the server uses the file mask (Lsp.nonCode).
export function inCommentOrString(line, i) {
  if (/^\s*\*(\s|\/|$)/.test(line)) return true;   // a block comment's continuation line
  return !!codeMask(line)[i];
}

function visit(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) visit(child, fn);
    else if (value && typeof value === "object") visit(value, fn);
  }
}

function walk(root, dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(root, p, out); else if (/\.(?:[cm]?js|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

export class Lsp {
  // tsc --lsp holds ~400 MB beside SwiftShader runs: it starts on the first tool
  // call, never at session start, and exits after idleMs without one.
  constructor({ root = ROOT, src = SRC, anchor = ANCHOR, cmd = path.join(ROOT, "node_modules/.bin/tsc"), timeout = 30000,
    idleMs = +(process.env.APEX_LSP_IDLE_MS || 10 * 60000) } = {}) {
    this.root = root; this.src = src; this.anchor = anchor; this.cmd = cmd; this.timeout = timeout; this.idleMs = idleMs; this.idle = null; this.proc = null; this.ready = null;
    this.open = new Map(); this.mtimes = new Map(); this.lines = new Map(); this.syms = new Map();
  }
  start() {
    if (this.ready) return this.ready;
    const proc = this.proc = spawn(this.cmd, ["--lsp", "--stdio"], { cwd: this.root, stdio: ["pipe", "pipe", "ignore"] });
    this.pending = new Map(); this.seq = 0;
    let buf = Buffer.alloc(0);
    proc.stdout.on("data", d => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const h = buf.indexOf("\r\n\r\n"); if (h < 0) return;
        const len = +(/Content-Length: (\d+)/i.exec(buf.subarray(0, h).toString()) || [])[1];
        if (!(len >= 0)) { buf = buf.subarray(h + 4); continue; }   // a malformed header: drop it, keep reading
        if (buf.length < h + 4 + len) return;
        let m;
        try { m = JSON.parse(buf.subarray(h + 4, h + 4 + len).toString()); } catch { buf = buf.subarray(h + 4 + len); continue; }
        buf = buf.subarray(h + 4 + len);
        if (m.method && m.id != null) this.send({ jsonrpc: "2.0", id: m.id, result: m.method === "workspace/configuration" ? (m.params?.items || []).map(() => null) : null });
        else if (m.id != null && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); }
      }
    });
    const died = Error("tsc --lsp exited");
    proc.stdin.on("error", () => {});   // EPIPE to a dead tsc surfaces as "exited" on the pending requests, never as a crash
    const pending = this.pending;
    const fail = () => { for (const r of pending.values()) r({ error: { message: died.message } }); pending.clear(); if (this.proc === proc) this.reset(); };
    proc.on("exit", fail);
    proc.on("error", e => { died.message = `tsc --lsp failed to start: ${e.message} (npm install?)`; fail(); });
    const root = pathToFileURL(this.root).href;
    return this.ready = (async () => {
      await this.request("initialize", { processId: process.pid, rootUri: root, capabilities: { textDocument: { hover: { contentFormat: ["markdown", "plaintext"] }, documentSymbol: { hierarchicalDocumentSymbolSupport: true } } }, workspaceFolders: [{ uri: root, name: path.basename(this.root) }] });
      this.notify("initialized", {});
      this.scan(true);
      this.ensureOpen(this.anchor);
    })().catch(e => { if (this.proc === proc) { this.kill(); this.reset(); } throw Error(died.message !== "tsc --lsp exited" ? died.message : e.message); });
  }
  // Forget the server process (it exited, failed to start, or was stopped): the next call starts a fresh one.
  reset() { this.proc = null; this.ready = null; this.open.clear(); }
  kill() { const p = this.proc; if (p && p.exitCode === null && !p.killed) { try { this.notify("exit", null); } catch { /* closed */ } p.kill(); } }
  rel(uri) { return path.relative(this.root, fileURLToPath(uri)); }
  // A repo-relative path for a caller's `file`, refused outside the workspace root.
  inRoot(file) {
    const f = path.relative(this.root, path.resolve(this.root, file));
    if (f.startsWith("..") || path.isAbsolute(f)) throw Error(`file must be inside the workspace: ${file}`);
    if (!fs.existsSync(path.join(this.root, f))) throw Error(`no such file: ${file}`);
    return f;
  }
  uriOf(file) { return pathToFileURL(path.resolve(this.root, file)).href; }
  send(o) {
    if (!this.proc || this.proc.stdin.destroyed) throw Error("tsc --lsp is not running");
    const s = JSON.stringify(o); this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`);
  }
  notify(method, params) { this.send({ jsonrpc: "2.0", method, params }); }
  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(Error("tsc --lsp is not running"));
      const id = ++this.seq;
      const t = setTimeout(() => { this.pending.delete(id); reject(Error(`${method} timed out after ${this.timeout} ms`)); }, this.timeout);
      this.pending.set(id, m => { clearTimeout(t); m.error ? reject(Error(m.error.message)) : resolve(m.result); });
      try { this.send({ jsonrpc: "2.0", id, method, params }); } catch (e) { clearTimeout(t); this.pending.delete(id); reject(e); }
    });
  }
  // Working-tree freshness: stat every js/ file, tell the server what moved.
  scan(first = false) {
    const seen = new Set(), changes = [];
    for (const f of [...walk(this.root, this.src), ...(fs.existsSync(path.join(this.root, "types")) ? walk(this.root, "types") : [])]) {
      seen.add(f);
      let m;
      try { m = fs.statSync(path.join(this.root, f)).mtimeMs; } catch { continue; }   // deleted mid-walk
      const was = this.mtimes.get(f);
      if (was === m) continue;
      this.mtimes.set(f, m); this.lines.delete(f);
      if (first) continue;
      changes.push({ uri: this.uriOf(f), type: was === undefined ? 1 : 2 });
      if (this.open.has(f)) { this.notify("textDocument/didClose", { textDocument: { uri: this.uriOf(f) } }); this.open.delete(f); }
    }
    for (const f of [...this.mtimes.keys()]) if (!seen.has(f)) { this.mtimes.delete(f); this.lines.delete(f); this.syms.delete(f); if (this.open.has(f)) { this.notify("textDocument/didClose", { textDocument: { uri: this.uriOf(f) } }); this.open.delete(f); } changes.push({ uri: this.uriOf(f), type: 3 }); }
    if (changes.length) this.notify("workspace/didChangeWatchedFiles", { changes });
  }
  ensureOpen(file) {
    if (this.open.has(file)) return this.open.get(file);
    this.notify("textDocument/didOpen", { textDocument: { uri: this.uriOf(file), languageId: /\.ts$/.test(file) ? "typescript" : "javascript", version: 1, text: fs.readFileSync(path.join(this.root, file), "utf8") } });
    this.open.set(file, 1);
    return 1;
  }
  astOf(file) {
    const t = this.textOf(file);
    if (t.ast === undefined) {
      try { t.ast = parse(t.text, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true }); }
      catch { t.ast = null; } // Invalid syntax cannot justify an invented fallback.
    }
    return t.ast;
  }
  textLines(file) { return this.textOf(file).lines; }
  textOf(file) {
    if (!this.lines.has(file)) {
      const text = fs.readFileSync(path.join(this.root, file), "utf8"), starts = [0];
      for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
      this.lines.set(file, { text, lines: text.split("\n"), starts, mask: null });
    }
    return this.lines.get(file);
  }
  // Is this position inside a comment, string, template text or regex (file-wide state)?
  nonCode(file, line0, col0) {
    const t = this.textOf(file);
    t.mask ??= codeMask(t.text);
    return !!t.mask[t.starts[line0] + col0];
  }
  // Offset in a file's text → { line0, col0 } (binary search over line starts).
  posOf(file, off) {
    const { starts } = this.textOf(file);
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return { line0: lo, col0: off - starts[lo] };
  }
  tag(file, line0, col0) {
    const lines = this.textLines(file);
    return classify(lines[line0] || "", col0, lines.slice(line0 + 1, line0 + 9).join("\n"));
  }
  // `file:line:col  [tag] source`, the source clipped to ~120 chars around the match.
  row(file, line0, col0, tag = true, { where = null, source = true } = {}) {
    const raw = this.textLines(file)[line0] || "", lead = raw.length - raw.trimStart().length;
    let text = raw.trim(), c = Math.max(0, col0 - lead);
    if (text.length > 120) {
      const from = Math.max(0, Math.min(c - 50, text.length - 120));
      text = (from > 0 ? "…" : "") + text.slice(from, from + 120) + (from + 120 < text.length ? "…" : "");
    }
    return `${file}:${line0 + 1}:${col0 + 1}  ${tag ? `[${this.tag(file, line0, col0)}] ` : ""}${where ? `(${where})${source ? "  " : ""}` : ""}${source ? text : ""}`.trimEnd();
  }
  async prepare() { clearTimeout(this.idle); await this.start(); this.scan(); }

  // ── Structure: documentSymbol trees, cached until the file changes on disk ──
  async outlineOf(file) {
    const m = this.mtimes.get(file) ?? fs.statSync(path.join(this.root, file)).mtimeMs, hit = this.syms.get(file);
    if (hit && hit.m === m) return hit.tree;
    this.ensureOpen(file);
    const tree = (await this.request("textDocument/documentSymbol", { textDocument: { uri: this.uriOf(file) } })) || [];
    this.syms.set(file, { m, tree });
    return tree;
  }
  // The symbols whose range holds a line, outermost first.
  chain(tree, line0) {
    const out = [];
    for (let nodes = tree; nodes?.length;) {
      const n = nodes.find(x => x.range.start.line <= line0 && line0 <= x.range.end.line);
      if (!n) break;
      out.push(n); nodes = n.children;
    }
    return out;
  }
  // "GameHud › updateDash": the named functions, and the globals holding them, around a line.
  // A declaration row stops at its parent: `function ping` inside Alpha reads (Alpha).
  async where(file, line0, col0 = -1) {
    const labels = this.chain(await this.outlineOf(file), line0)
      .filter(n => !(n.selectionRange.start.line === line0 && n.selectionRange.start.character === col0))
      .filter(n => n.name !== "<function>" && (FN_KINDS.has(n.kind) || n.children?.some(c => c.name === "<function>")))
      .map(n => n.name);
    if (!labels.length) return "top level";
    return labels.length > 3 ? `${labels[0]} › … › ${labels.slice(-2).join(" › ")}` : labels.join(" › ");
  }
  // The source of the symbol declared at a position (a function body, an object, a const), capped.
  async bodyAt(file, line0, maxLines = BODY_LINES) {
    const ch = this.chain(await this.outlineOf(file), line0);
    const node = [...ch].reverse().find(n => n.selectionRange.start.line === line0) || ch.at(-1);
    if (!node) return null;
    const { start, end } = node.range, lines = this.textLines(file), n = end.line - start.line + 1, shown = Math.min(n, maxLines);
    return lines.slice(start.line, start.line + shown).map((t, i) => `${String(start.line + i + 1).padStart(6)}  ${t}`).join("\n")
      + (n > shown ? `\n        … ${n - shown} more lines (maxLines)` : "");
  }
  // Names a module exports: the keys of the `return { … }` at the IIFE body's own depth
  // (never one nested in a method), read with the code mask so strings/comments can't fool it.
  exportsIn(file, range) {
    const t = this.textOf(file);
    t.mask ??= codeMask(t.text);
    const from = t.starts[range.start.line] + range.start.character, to = t.starts[range.end.line] + range.end.character;
    const code = k => !t.mask[k], names = new Set();
    let depth = 0, k = t.text.indexOf("{", from);   // the function body's own brace
    for (; k >= 0 && k < to; k++) {
      if (!code(k)) continue;
      const ch = t.text[k];
      if (ch === "{" || ch === "(" || ch === "[") { depth++; continue; }
      if (ch === "}" || ch === ")" || ch === "]") { depth--; continue; }
      if (depth !== 1 || !/^return\b/.test(t.text.slice(k, k + 7)) || /[\w$]/.test(t.text[k - 1] || "")) continue;
      const open = t.text.slice(k + 6).search(/\S/) + k + 6;
      if (t.text[open] !== "{") continue;   // `return api;` — nothing literal to read
      let d = 0, tok = "";
      const flush = () => { const m = /^\s*(?:\.\.\.)?(?:async\s+|get\s+|set\s+|\*\s*)?([\w$]+)/.exec(tok); if (m) names.add(m[1]); tok = ""; };
      for (let j = open; j < to; j++) {
        if (!code(j)) { if (d === 1) tok += " "; continue; }
        const c = t.text[j];
        if (c === "{" || c === "(" || c === "[") { if (++d === 1) tok = ""; else if (d === 2 && c === "{") flush(); continue; }
        if (c === "}" || c === ")" || c === "]") { if (d === 1) { flush(); break; } d--; continue; }
        if (d === 1) { if (c === ",") flush(); else tok += c; }
      }
    }
    return names;
  }
  // A module's members (an IIFE's inner declarations, or an object literal's keys), exported first.
  async outline({ file, symbol, all = false, offset = 0, limit = MAX_ROWS }) {
    await this.prepare();
    let f = file && path.relative(this.root, path.resolve(this.root, file)), roots, only = null;
    if (symbol) {
      const g = this.windowDecl(symbol);
      if (g?.kind === "window") { f = g.file; only = symbol; roots = await this.outlineOf(f); }
      else {
        const hit = (await this.symbols(symbol)).find(x => x.name === symbol && !x.containerName);
        if (!hit) throw Error(`symbol not found: ${symbol} (lsp_symbols for a prefix)`);
        f = this.rel(hit.location.uri);
        roots = this.chain(await this.outlineOf(f), hit.location.range.start.line).slice(0, 1);
      }
    } else {
      f = this.inRoot(file);
      roots = await this.outlineOf(f);
    }
    const lines = this.textLines(f);
    const sig = n => { const t = (lines[n.selectionRange.start.line] || "").trim(); return t.length > 90 ? t.slice(0, 89) + "…" : t; };
    const row = (n, tag) => `  ${tag.padEnd(8)} ${n.name}  ${KIND[n.kind] || n.kind}  :${n.selectionRange.start.line + 1}  ${sig(n)}`;
    // Functions first (the interface), then values; members declared on one line share a row.
    const isFn = m => FN_KINDS.has(m.kind) || /^\s*[:=]\s*(async\s*)?(function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/.test((lines[m.selectionRange.start.line] || "").slice(m.selectionRange.end.character));
    const rowsOf = (ms, tag) => {
      const byLine = new Map();
      for (const m of [...ms].sort((a, b) => (isFn(b) - isFn(a)) || a.selectionRange.start.line - b.selectionRange.start.line)) {
        const k = m.selectionRange.start.line;
        if (byLine.has(k)) byLine.get(k).names.push(m.name); else byLine.set(k, { m, names: [m.name] });
      }
      return [...byLine.values()].map(({ m, names }) => row({ ...m, name: names.join(", "), kind: isFn(m) && !FN_KINDS.has(m.kind) ? 12 : m.kind }, tag));
    };
    const out = [], group = (title, members, exported, showRest) => {
      const ex = members.filter(m => exported.has(m.name)), rest = members.filter(m => !exported.has(m.name));
      out.push(`${title}: ${ex.length} exported, ${rest.length} internal`);
      out.push(...rowsOf(ex, "[export]"));
      const listed = showRest ? rest : all ? rest : [];
      out.push(...rowsOf(listed, ""));
      if (listed.length < rest.length) out.push(`  … ${rest.length - listed.length} internal (all: true lists them)`);
    };
    // `window.X = { … }` objects: tsgo lists their keys as top-level symbols; regroup them under X.
    const wins = [...lines.entries()].map(([i, t]) => [i, /^\s*window\.([\w$]+)\s*=/.exec(t)?.[1]]).filter(([, n]) => n);
    const owner = n => { let o = null; for (const [i, name] of wins) if (i <= n.range.start.line) o = { i, name }; return o; };
    const byWin = new Map();
    for (const r of roots) {
      const w = wins.length && !r.children?.some(c => c.name === "<function>") && r.kind !== 13 ? owner(r) : null;
      if (w) { if (!byWin.has(w.name)) byWin.set(w.name, { i: w.i, members: [] }); byWin.get(w.name).members.push(r); continue; }
      if (only) continue;
      const fn = r.name === "<function>" ? r : r.children?.find(c => c.name === "<function>");
      const members = fn ? (fn.children || []) : FN_KINDS.has(r.kind) ? [] : (r.children || []);
      if (!members.length) { out.push(row(r, "")); continue; }
      if (r.name === "<function>") {
        // An anonymous top-level IIFE (game.js): nothing is exported; list its functions.
        const fns = members.filter(m => FN_KINDS.has(m.kind));
        out.push(`(anonymous IIFE)  :${r.range.start.line + 1}  ${members.length} members, ${fns.length} functions${all ? "" : " (functions listed; all: true lists every member)"}`);
        for (const m of all ? members : fns) out.push(row(m, ""));
        continue;
      }
      group(`${r.name}  :${r.selectionRange.start.line + 1}  ${fn ? "IIFE module" : "object"}`, members, fn ? this.exportsIn(f, fn.range) : new Set(members.map(m => m.name)), false);
    }
    for (const [name, { i, members }] of byWin) {
      if (only && only !== name) continue;
      const fn = members.length === 1 && members[0].name === "<function>" ? members[0] : null;   // window.X = (function () { … })()
      if (fn) group(`window.${name}  :${i + 1}  IIFE module`, fn.children || [], this.exportsIn(f, fn.range), false);
      else group(`window.${name}  :${i + 1}  object`, members, new Set(members.map(m => m.name)), false);
    }
    const pageRows = out.slice(offset, offset + limit);
    return `${f}\n${pageRows.join("\n")}${out.length > offset + limit ? `\n… ${out.length - offset - limit} more rows (offset: ${offset + limit})` : ""}`;
  }

  // ── Diagnostics an edit introduced: per-file // @ts-check, high-signal codes, minus HEAD's ──
  async diagnose(file, all = false) {
    await this.prepare();
    const f = this.inRoot(file);
    if (!/\.(c|m)?js$/.test(f)) throw Error(`lsp_diagnostics checks JavaScript (.js/.mjs/.cjs); ${f} is not one`);
    const ambient = fs.existsSync(path.join(this.root, "types")) ? fs.readdirSync(path.join(this.root, "types")).filter(x => x.endsWith(".d.ts")).map(x => fs.readFileSync(path.join(this.root, "types", x), "utf8")).join("\n") : "";
    const check = async text => {
      const v = this.ensureOpen(f) + 1, lines = text.split("\n");
      this.open.set(f, v);
      this.notify("textDocument/didChange", { textDocument: { uri: this.uriOf(f), version: v }, contentChanges: [{ text: "// @ts-check\n" + text }] });
      const r = await this.request("textDocument/diagnostic", { textDocument: { uri: this.uriOf(f) } });
      return (r?.items || []).filter(d => {
        if (d.code < 2000) return true;   // syntax
        if (!DIAG_CODES.has(d.code)) return false;
        const name = /'([\w$]+)'/.exec(d.message)?.[1];
        if ((d.code === 2304 || d.code === 2552) && name && this.windowDecl(name)) return false;   // a window.X / CommonJS-flagged global: invisible to the checker
        if (d.code === 2451 && name && new RegExp(`declare\\s+(const|let|var|function)\\s+${name}\\b`).test(ambient)) return false;   // the .d.ts contract re-declares it
        return true;
      }).map(d => ({ line0: d.range.start.line - 1, col0: d.range.start.character, code: d.code, msg: d.message.split("\n")[0], src: (lines[d.range.start.line - 1] || "").trim() }));
    };
    try {
      const now = await check(fs.readFileSync(path.join(this.root, f), "utf8"));
      let head = null;
      try { head = execFileSync("git", ["show", `HEAD:${f}`], { cwd: this.root, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { /* untracked or no git */ }
      const fmt = d => `${f}:${d.line0 + 1}:${d.col0 + 1}  TS${d.code} ${d.msg}`;
      if (head === null || all) return `${now.length} high-signal diagnostic${now.length === 1 ? "" : "s"} in ${f} (${head === null ? "not tracked at HEAD" : "all"}; per-file @ts-check)\n${now.map(fmt).join("\n")}`.trim();
      // A per-file HEAD overlay cannot reproduce HEAD with edited dependencies.
      // Report current errors honestly instead of classifying them as old.
      let dependenciesChanged = true;
      try {
        // --no-renames reports both ends as ordinary paths, including a
        // dependency moved out of src/. Unlike status -z, no second record
        // has a different prefix format. Include untracked dependencies too.
        const gitPaths = args => execFileSync("git", args, { cwd: this.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0");
        const changed = [...gitPaths(["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]), ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"])];
        dependenciesChanged = changed.some(other => other !== f && /\.(?:[cm]?js|ts)$/.test(other) && (other.startsWith(`${this.src}/`) || other.startsWith("types/")));
      } catch { /* no trustworthy baseline */ }
      if (dependenciesChanged) return `${now.length} high-signal diagnostics in ${f} (HEAD subtraction skipped: JavaScript or declaration dependencies differ from HEAD; per-file @ts-check)\n${now.map(fmt).join("\n")}`.trim();
      const before = await check(head), key = d => `${d.code}|${d.msg}|${d.src}`, pool = new Map();
      for (const d of before) pool.set(key(d), (pool.get(key(d)) || 0) + 1);
      const fresh = now.filter(d => { const n = pool.get(key(d)) || 0; if (n) { pool.set(key(d), n - 1); return false; } return true; });
      return `${fresh.length} new since HEAD in ${f} (${now.length - fresh.length} pre-existing hidden; all: true lists them; per-file @ts-check, codes ${[...DIAG_CODES].join("/")} + syntax)\n${fresh.map(fmt).join("\n")}`.trim();
    } finally {
      // Back to the disk text with no pragma: close it so the next query reopens it.
      this.notify("textDocument/didClose", { textDocument: { uri: this.uriOf(f) } }); this.open.delete(f); this.syms.delete(f);
    }
  }
  // Counted from the END of a call, so a slow first query (project load) is never cut off.
  armIdle() {
    clearTimeout(this.idle);
    if (this.idleMs > 0 && this.proc) { this.idle = setTimeout(() => this.stop(), this.idleMs); this.idle.unref(); }
  }
  async symbols(query) {
    const res = (await this.request("workspace/symbol", { query })) || [];
    const exact = s => (s.name === query ? 0 : s.name.toLowerCase() === query.toLowerCase() ? 1 : 2);
    return res.sort((a, b) => exact(a) - exact(b) || (a.containerName ? 1 : 0) - (b.containerName ? 1 : 0));
  }
  // Each symbol resolves to CANDIDATE query positions, tried in order until the
  // checker answers: `Name` → its exact-name declarations (top-level first);
  // `Head.member` → its first code uses in js/ (never inside a comment or string),
  // then a member symbol in Head's file; file+line → that position alone.
  async candidates({ symbol, file, line, column }) {
    if (file) {
      const f = this.inRoot(file);
      return { cands: [{ file: f, line0: line - 1, col0: (column || 1) - 1 }], parts: [] };
    }
    if (!symbol) throw Error("pass symbol (Name or Head.member) or file+line[+column]");
    const parts = symbol.split("."), name = parts.at(-1), cands = [];
    const at = s => ({ file: this.rel(s.location.uri), line0: s.location.range.start.line, col0: s.location.range.start.character });
    if (parts.length === 1) {
      const hits = (await this.symbols(name)).filter(s => s.name === name);
      if (!hits.length) {
        const amb = this.ambientDecl(name);
        if (amb) return { cands: [amb], parts, top: [amb] };
        const near = (await this.symbols(name)).filter(s => s.name.toLowerCase() === name.toLowerCase() && !s.containerName && [5, 12, 13, 14].includes(s.kind)).slice(0, 3);
        throw Error(`symbol not found: ${name}${near.length ? `; did you mean ${near.map(s => `${s.name} (${this.rel(s.location.uri)}:${s.location.range.start.line + 1})`).join(", ")}?` : " (try lsp_symbols for a prefix)"}`);
      }
      const top = hits.filter(s => !s.containerName);
      return { cands: hits.map(at), parts, top: (top.length ? top : hits).map(at) };
    }
    const re = new RegExp(`\\b${parts.map(p => p.replace(/[$]/g, "\\$")).join("\\??\\.")}\\b`, "g");
    for (const f of [...this.mtimes.keys()].filter(f => !f.endsWith(".ts")).sort()) {
      const { text, lines } = this.textOf(f);
      if (!text.includes(symbol.replace("?.", "."))) continue;
      for (let i = 0; i < lines.length && cands.length < CANDIDATES; i++) {
        for (const m of lines[i].matchAll(re)) {
          if (this.nonCode(f, i, m.index)) continue;
          cands.push({ file: f, line0: i, col0: m.index + m[0].length - name.length });
          break;
        }
      }
      if (cands.length >= CANDIDATES) break;
    }
    const head = (await this.symbols(parts[0])).find(s => s.name === parts[0] && !s.containerName);
    const uses = cands.length;
    if (head) for (const s of (await this.symbols(name)).filter(s => s.name === name && s.location.uri === head.location.uri)) cands.push({ ...at(s), note: `no ${symbol} use in ${this.src}/; this is the ${name} declared in ${parts[0]}'s file, which it may not export` });
    return { cands, parts, uses, head: head && at(head) };
  }
  async at(args, method, extra = {}) {
    await this.prepare();
    const c = await this.candidates(args);
    // Untyped heads never answer from the checker: skip the round-trips.
    if (c.parts.length === 2 && FACADES[c.parts[0]]) return { ...c, ...(await this.facade(c.parts, method, extra)) };
    if (c.parts.length > 1 && this.windowDecl(c.parts.slice(0, -1).join("."))) return { ...c, ...await this.textFallback(c.parts, method, c.head, extra) };
    const g = c.parts.length === 1 && method === "textDocument/references" && this.windowDecl(c.parts[0]);
    if (g) {
      const p = c.top[0], def = { uri: this.uriOf(p.file), range: { start: { line: p.line0, character: p.col0 } } };
      return { ...c, p, result: await this.textRefs(c.parts, def, extra.context?.includeDeclaration !== false), note: g.kind === "cjs" ? `text match: ${g.file} ends in module.exports, so the checker scopes ${c.parts[0]} to that file` : `text match: window.${c.parts[0]} is untyped for the checker` };
    }
    let first = null;
    for (const p of c.cands) {
      this.ensureOpen(p.file);
      const result = await this.request(method, { textDocument: { uri: this.uriOf(p.file) }, position: { line: p.line0, character: p.col0 }, ...extra });
      first ??= { p, result };
      if (answered(result)) return { ...c, p, result, note: p.note };
    }
    if (c.parts.length === 2 && FACADES[c.parts[0]]) return { ...c, ...(await this.facade(c.parts, method, extra)) };
    if (c.parts.length > 1) return { ...c, ...await this.textFallback(c.parts, method, c.head, extra) };
    if (c.parts.length === 1 && method === "textDocument/definition") {
      const p = c.top[0];
      return { ...c, p, result: c.top.map(l => ({ uri: this.uriOf(l.file), range: { start: { line: l.line0, character: l.col0 } } })) };
    }
    return { ...c, ...(first || { p: null, result: null }) };
  }
  // `window.Head = {…}` globals (15 modules) are invisible to the checker, which
  // types `Head` as any; answer those from the text, labelled as such.
  // A global the checker cannot see: `window.H = …`, or a top-level `const H` in a file the
  // checker takes for a CommonJS module (it ends `module.exports = H`: ghost.js, ghost-share.js…).
  // `interface X` / `type X` / `declare const X` in types/*.d.ts — the contract files tsgo's symbol search skips.
  ambientDecl(name) {
    const dir = path.join(this.root, "types");
    if (!fs.existsSync(dir)) return null;
    const re = new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:interface|type|class|enum|const|let|var|function)\\s+(${name.replace(/[$]/g, "\\$")})\\b`, "m");
    for (const x of fs.readdirSync(dir).filter(x => x.endsWith(".d.ts")).sort()) {
      const f = `types/${x}`, m = re.exec(this.textOf(f).text);
      if (m) { const { line0, col0 } = this.posOf(f, m.index + m[0].lastIndexOf(name)); return { file: f, line0, col0 }; }
    }
    return null;
  }
  windowDecl(h, all = false) {
    const esc = h.replace(/[$.]/g, "\\$&"), declarations = [];
    const win = new RegExp(`^\\s*window\\.${esc}\\s*=`, "gm"), cjs = new RegExp(`^(?:const|let|var|function|class)\\s+${esc}\\b`, "gm");
    for (const f of [...this.mtimes.keys()].filter(f => !f.endsWith(".ts")).sort()) {
      const { text } = this.textOf(f);
      if (!text.includes(h)) continue;
      for (const [re, kind] of [[win, "window"], ...(text.includes("module.exports") ? [[cjs, "cjs"]] : [])]) {
        re.lastIndex = 0;
        for (const m of text.matchAll(re)) {
          const pos = this.posOf(f, m.index + (kind === "window" ? m[0].indexOf("window") : 0));
          if (this.nonCode(f, pos.line0, pos.col0)) continue;
          const d = { file: f, ...pos, kind };
          if (!all) return d;
          declarations.push(d);
        }
      }
    }
    return all ? declarations : null;
  }
  async textFallback(parts, method, head, extra = {}) {
    const [h, member] = [parts.slice(0, -1).join("."), parts.at(-1)];
    const d = this.windowDecl(h);
    if (!d && head) throw Error(`${h} (${head.file}:${head.line0 + 1}) has no member ${member} the checker can see; try lsp_hover ${h} or lsp_symbols ${member}`);
    if (!d) throw Error(`symbol not found: ${h} is not a global the checker or a window.${h} assignment declares`);
    // Read the actual assignment/initializer and its exported object. A later
    // object or an internal helper is never evidence of a member on this owner.
    const ownerName = n => n?.type === "Identifier" ? n.name : n?.type === "MemberExpression" && !n.computed ? `${ownerName(n.object)}.${ownerName(n.property)}` : "";
    const objectsIn = n => {
      if (n?.type === "ObjectExpression") return [n];
      if (n?.type !== "CallExpression") return [];
      if (ownerName(n.callee) === "Object.freeze" && n.arguments.length === 1) return objectsIn(n.arguments[0]);
      if (ownerName(n.callee) === "Object.assign") {
        // Later static sources win. Stop at an unknown source: it could
        // overwrite anything before it, but cannot overwrite a later literal.
        const objects = [];
        for (const arg of [...n.arguments].reverse()) {
          const known = objectsIn(arg);
          if (!known.length) break;
          objects.push(...known);
        }
        return objects;
      }
      return [];
    };
    let def = null;
    const owners = d.kind === "window" ? this.windowDecl(h, true).filter(x => x.kind === "window") : [d];
    for (const owner of owners) {
      const candidates = [];
      visit(this.astOf(owner.file), n => {
        if (n.loc.start.line - 1 !== owner.line0 || n.loc.start.column !== owner.col0) return;
        if (owner.kind === "window" && n.type === "AssignmentExpression" && ownerName(n.left) === `window.${h}`) candidates.push(n.right);
        if (owner.kind === "cjs" && n.type === "VariableDeclaration") for (const v of n.declarations) if (ownerName(v.id) === h) candidates.push(v.init);
      });
      for (const init of candidates) {
        const fn = init?.type === "CallExpression" && ["FunctionExpression", "ArrowFunctionExpression"].includes(init.callee.type) ? init.callee : null;
        const objects = fn?.body?.body ? fn.body.body.filter(n => n.type === "ReturnStatement").flatMap(n => objectsIn(n.argument)) : objectsIn(init);
        for (const obj of objects) {
          const prop = [...obj.properties].reverse().find(n => n.type === "Property" && !n.computed && (n.key.name || n.key.value) === member);
          if (!prop) continue;
          let at = prop.key;
          if (fn && prop.value.type === "Identifier") {
            for (const n of fn.body.body) {
              if (n.type === "FunctionDeclaration" && n.id?.name === prop.value.name) at = n.id;
              if (n.type === "VariableDeclaration") for (const v of n.declarations) if (v.id.name === prop.value.name) at = v.id;
            }
          }
          def = { uri: this.uriOf(owner.file), range: { start: { line: at.loc.start.line - 1, character: at.loc.start.column } } };
          break;
        }
        if (def) break;
      }
      if (def) break;
    }
    if (!def) throw Error(`${d.kind === "cjs" ? h : `window.${h}`} (${d.file}:${d.line0 + 1}) has no member ${member}`);
    const note = d.kind === "cjs" ? `text match: ${d.file} ends in module.exports, so the checker scopes ${h} to that file` : `text match: window.${h} is untyped for the checker`;
    if (method !== "textDocument/references") return { p: { file: this.rel(def.uri), line0: def.range.start.line, col0: def.range.start.character }, result: method === "textDocument/hover" ? { contents: `(${note})` } : [def], note };
    return { p: { file: this.rel(def.uri), line0: def.range.start.line, col0: def.range.start.character }, result: await this.textRefs(parts, def, extra.context?.includeDeclaration !== false), note };
  }
  async facade([h, member], method, extra) {
    // tsgo's workspace/symbol skips .d.ts files: read the interface block, then let the checker type the row.
    const { iface, file } = FACADES[h], lines = this.textLines(file);
    const open = lines.findIndex(l => new RegExp(`^\\s*(export\\s+)?interface\\s+${iface}\\b`).test(l));
    const row = new RegExp(`^\\s+(?:readonly\\s+)?(${member.replace(/[$]/g, "\\$")})\\??\\s*[:(]`);
    let p = null;
    for (let i = open + 1; open >= 0 && i < lines.length && !/^}/.test(lines[i]); i++) {
      const m = row.exec(lines[i]);
      if (m) { p = { file, line0: i, col0: m.index + m[0].indexOf(member) }; break; }
    }
    if (!p) throw Error(`${iface} (the ${h} façade, ${file}) has no member ${member}`);
    const def = { uri: this.uriOf(file), range: { start: { line: p.line0, character: p.col0 } } }, note = `${h} is the ${iface} façade; contract row in ${file}`;
    if (method === "textDocument/references") return { p, result: await this.textRefs([h, member], def, extra.context?.includeDeclaration !== false), note: `${note}; uses are text matches of ${h}.${member}` };
    if (method === "textDocument/definition") return { p, result: [def], note };
    this.ensureOpen(p.file);
    return { p, result: await this.request(method, { textDocument: { uri: def.uri }, position: def.range.start, ...extra }), note };
  }
  // Every code (non-comment, non-string) occurrence of `A.b` / `A`, after the declaration
  // row; for `A.b`, also each file's `const { b } = A` / `const X = A` binding and the
  // uses of the local name that binding introduces (the checker sees none of them).
  // Whole-head aliases also accept the guarded forms agents write for window globals:
  // `typeof H !== "undefined" ? H : {}`, `(typeof H !== "undefined" && H) || {}`,
  // and `H || {}` / `window.H || {}` (e.g. `const PC = …` then `PC.VMAX`).
  async textRefs(parts, def, includeDeclaration = true) {
    const name = parts.at(-1), head = parts.slice(0, -1).join("."), esc = x => x.replace(/[$.]/g, "\\$&");
    const refs = includeDeclaration ? [def] : [], seen = new Set([`${def.uri}:${def.range.start.line}:${def.range.start.character}`]);
    const add = (f, i, col, via = false) => { const uri = this.uriOf(f), k = `${uri}:${i}:${col}`; if (!seen.has(k)) { seen.add(k); refs.push({ uri, range: { start: { line: i, character: col } }, ...(via ? { via: true } : {}) }); } };
    const usesOf = (f, re, nameLen, fromLine = 0, via = false) => {
      const { text, lines } = this.textOf(f);
      for (const m of text.matchAll(re)) {
        if (!startsName(text, m.index)) continue;
        const { line0, col0 } = this.posOf(f, m.index);
        if (line0 >= fromLine && !this.nonCode(f, line0, col0)) add(f, line0, col0 + m[0].length - nameLen, via);
      }
    };
    // Literal-first pattern (a leading lookbehind made V8 test every offset); the
    // boundary before the match is checked by hand: start of a name, or `window.`.
    const direct = new RegExp(`${parts.map(esc).join("\\??\\.")}(?![\\w$])`, "g");
    const startsName = (text, i) => !/[\w$.]/.test(text[i - 1] || "") || text.slice(Math.max(0, i - 7), i) === "window." && !/[\w$.]/.test(text[i - 8] || "");
    for (const f of [...this.mtimes.keys()].filter(f => !f.endsWith(".ts")).sort()) {
      const { text } = this.textOf(f);
      if (!text.includes(name) || (head && !text.includes(head))) continue;   // every ref spells the member name
      usesOf(f, direct, name.length);
      if (parts.length < 2) continue;
      const bindings = [];
      const owner = n => n?.type === "Identifier" ? n.name : n?.type === "MemberExpression" && !n.computed && n.object.name === "window" ? n.property.name : "";
      const emptyFallback = n => n?.type === "ObjectExpression" && n.properties.length === 0 || n?.type === "Literal" && n.value === null;
      const typeofGuard = n => n?.type === "BinaryExpression" && n.operator === "!==" &&
        n.left?.type === "UnaryExpression" && n.left.operator === "typeof" && owner(n.left.argument) === head &&
        n.right?.type === "Literal" && n.right.value === "undefined";
      const headAlias = n => owner(n) === head ||
        n?.type === "ConditionalExpression" && typeofGuard(n.test) && owner(n.consequent) === head && emptyFallback(n.alternate) ||
        n?.type === "LogicalExpression" && n.operator === "||" && emptyFallback(n.right) &&
          (owner(n.left) === head || n.left?.type === "LogicalExpression" && n.left.operator === "&&" && typeofGuard(n.left.left) && owner(n.left.right) === head);
      visit(this.astOf(f), n => {
        if (n.type !== "VariableDeclarator" || !headAlias(n.init)) return;
        if (n.id.type === "ObjectPattern") for (const p of n.id.properties) {
          if (p.type !== "Property" || p.computed || (p.key.name || p.key.value) !== name) continue;
          const local = p.value.type === "AssignmentPattern" ? p.value.left : p.value;
          if (local.type === "Identifier") bindings.push({ local, key: p.key });
        }
        if (n.id.type === "Identifier") bindings.push({ local: n.id, whole: true });
      });
      for (const { local, key, whole } of bindings) {
        this.ensureOpen(f);
        const position = { line: local.loc.start.line - 1, character: local.loc.start.column };
        const found = await this.request("textDocument/references", { textDocument: { uri: this.uriOf(f) }, position, context: { includeDeclaration: false } }) || [];
        if (key) add(f, key.loc.start.line - 1, key.loc.start.column, true);
        for (const r of found) {
          if (r.uri !== this.uriOf(f)) continue;
          const pos = r.range.start;
          if (pos.line === position.line && pos.character === position.character) continue;
          if (!whole) add(f, pos.line, pos.character, true);
          else {
            const tail = this.textLines(f)[pos.line].slice(pos.character + local.name.length);
            const m = new RegExp(`^\\??\\.${esc(name)}(?![\\w$])`).exec(tail);
            if (m) add(f, pos.line, pos.character + local.name.length + m[0].length - name.length, true);
          }
        }
      }
    }
    return refs;
  }
  // tsgo sometimes stops a definition at the IIFE's shorthand export; one more
  // hop from there reaches the function itself (added in place, deduplicated).
  async followExports(locs) {
    const key = l => `${l.uri || l.targetUri}:${(l.range || l.targetSelectionRange).start.line}`;
    const seen = new Set(locs.map(key));
    for (const l of [...locs]) {
      const uri = l.uri || l.targetUri, start = (l.range || l.targetSelectionRange).start, file = this.rel(uri);
      if (!["export", "alias"].includes(this.tag(file, start.line, start.character))) continue;
      this.ensureOpen(file);
      for (const n of (await this.request("textDocument/definition", { textDocument: { uri }, position: start })) || []) {
        if (!seen.has(key(n))) { seen.add(key(n)); locs.push(n); }
      }
    }
  }
  rank(l) { return TAG_RANK[this.tag(this.rel(l.uri), l.range.start.line, l.range.start.character)]; }
  // Location rows, paged (offset/limit). References carry the enclosing function
  // (`(GameHud › updateDash)`); format "concise" drops the source text.
  async locRows(locs, { limit = MAX_ROWS, offset = 0, declFirst = false, where = false, concise = false } = {}) {
    const list = (Array.isArray(locs) ? locs : locs ? [locs] : []).map(l => l.targetUri ? { uri: l.targetUri, range: l.targetSelectionRange || l.targetRange } : l);
    // A definition through an IIFE's `return { …, name, … }` is the export, not the body: list the declaration first.
    if (declFirst) list.sort((a, b) => this.rank(a) - this.rank(b));
    else list.sort((a, b) => a.uri.localeCompare(b.uri) || a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
    const page = list.slice(offset, offset + limit), rows = [];
    for (const l of page) {
      const f = this.rel(l.uri), { line, character } = l.range.start;
      rows.push(this.row(f, line, character, true, { where: where ? await this.where(f, line, character).catch(() => null) : null, source: !concise }));
    }
    const per = {};
    for (const l of list) { const f = this.rel(l.uri); per[f] = (per[f] || 0) + 1; }
    const byFile = Object.entries(per).sort((a, b) => b[1] - a[1]);
    return { total: list.length, list, byFile, tags: list.map(l => this.tag(this.rel(l.uri), l.range.start.line, l.range.start.character)), files: new Set(list.map(l => l.uri)).size, rows, offset, truncated: list.length > offset + limit };
  }
  stop() { clearTimeout(this.idle); this.kill(); this.reset(); }
}

const str = (description, maxLength = 400) => ({ type: "string", minLength: 1, maxLength, description });
const int = (description, minimum = 1, maximum = 1000000) => ({ type: "integer", minimum, maximum, description });
const where = {
  symbol: str("`Name` (a script global such as GameHud) or `Head.member` (Liveries.forTeam). Or omit and pass file+line"),
  file: str("Repo-relative path, e.g. js/ui/hud.js (with line; ONE-based)"),
  line: int("ONE-based line"), column: int("ONE-based column (default 1)"),
};
const def = (name, description, properties, required = []) => ({ name, description,
  inputSchema: { type: "object", properties, required, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } });
const page = { offset: int("Skip this many rows (paging; the footer names the next offset)", 0, 100000), limit: int(`Rows to print (default ${MAX_ROWS})`, 1, 2000) };
const format = { format: { type: "string", enum: ["detailed", "concise"], description: "detailed (default): rows carry the source line; concise: location, tag and enclosing function only" } };
export const TOOLS = [
  def("lsp_definition", "Where is it defined? Use instead of grep for a global, a module member (Head.member), G.<member> or a local. Rows `file:line:col  [def|export|alias] source`, the real declaration first; same-named top-level functions are all listed. body: true appends the declaration's source (capped at maxLines), saving a Read.",
    { ...where, body: { type: "boolean", description: "Append the source of the first [def] (function body, object, const), up to maxLines" }, maxLines: int(`Body line cap (default ${BODY_LINES})`, 1, 400) }),
  def("lsp_references", "Who uses it? Every reference across js/, sorted by file, each row tagged [def|export|alias|use] and naming its enclosing function `(Module › fn)`. Semantic (skips comments, strings, same-named members of other objects); window.X globals and G.<member> fall back to labelled text matches that follow `const { x } = Head` destructures. files: true prints only per-file counts.",
    { ...where, includeDeclaration: { type: "boolean", description: "Include the declaration itself (default true)" }, ...page, ...format,
      files: { type: "boolean", description: "Only the per-file counts (every file), no rows: who uses it, at a glance" } }),
  def("lsp_callers", "Impact before an edit: the functions that use the symbol, one row per caller `file:line  Module › fn  ×N (lines …)`, grouped from its references (uses only, not the declaration or export/alias rows).",
    { ...where, ...page }),
  def("lsp_outline", "A module's shape without reading it: `symbol` (an IIFE global such as Liveries, or a window.X object) or `file` → its members, exported ones first, each with kind, line and its first source line. all: true also lists internal members.",
    { symbol: str("A top-level global, e.g. Liveries, GameHud, PhysicsConsts"), file: where.file, all: { type: "boolean", description: "List internal (non-exported) members too" }, ...page }),
  def("lsp_symbols", "Find a symbol by name or prefix: declarations listed (exact name first, top-level before nested), aliases (`const x = Y.x`, destructuring) collapsed to a count.",
    { query: str("Symbol name or prefix, e.g. GameHud"), limit: int("Rows (default 30)", 1, MAX_ROWS), offset: page.offset }, ["query"]),
  def("lsp_hover", "Inferred type and JSDoc (type first, then where it was asked). JS parameters without JSDoc read as any.", where),
  def("lsp_diagnostics", "After an edit: the errors it INTRODUCED in one file. Checks the file with // @ts-check (the project has checkJs off) for high-signal codes only (unknown name, 'did you mean' typo, wrong arity, assign to const, calling a non-function, redeclare, syntax) and hides the ones already present at git HEAD. If other JavaScript or declaration dependencies differ from HEAD, subtraction is skipped and current diagnostics are reported explicitly. all: true lists every high-signal one.",
    { file: where.file, all: { type: "boolean", description: "Also list diagnostics already present at HEAD" } }, ["file"]),
];

export async function callTool(lsp, name, a = {}) {
  try {
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw Error(`Unknown tool: ${name}`);
    if (!a || typeof a !== "object" || Array.isArray(a)) throw Error("arguments must be an object");
    for (const k of Object.keys(a)) if (!Object.hasOwn(tool.inputSchema.properties, k)) throw Error(`Unknown argument: ${k}; valid: ${Object.keys(tool.inputSchema.properties).join(", ")}`);
    for (const k of tool.inputSchema.required) if (a[k] == null) throw Error(`Missing argument: ${k}`);
    for (const [k, value] of Object.entries(a)) {
      const schema = tool.inputSchema.properties[k];
      if (schema.type === "string" && (typeof value !== "string" || value.length < schema.minLength || value.length > schema.maxLength)) throw Error(`${k} must be a string of ${schema.minLength || 1}–${schema.maxLength || 400} characters`);
      if (schema.type === "integer" && (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum)) throw Error(`${k} must be an integer from ${schema.minimum} to ${schema.maximum}`);
      if (schema.type === "boolean" && typeof value !== "boolean") throw Error(`${k} must be a boolean`);
      if (schema.enum && !schema.enum.includes(value)) throw Error(`${k} must be one of: ${schema.enum.join(", ")}`);
    }
    if (a.symbol !== undefined && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(a.symbol)) throw Error("symbol must be Name or Head.member");
    if (a.symbol && a.file) throw Error("pass symbol or file+line, not both");
    if ((a.line !== undefined || a.column !== undefined) && !a.file) throw Error("line and column need file");
    if (!["lsp_symbols", "lsp_diagnostics", "lsp_outline"].includes(name) && !a.file && !a.symbol) throw Error("pass symbol (Name or Head.member) or file+line[+column]");
    if (a.file && a.line == null && !["lsp_diagnostics", "lsp_outline"].includes(name)) throw Error("file needs line");
    if (name === "lsp_outline" && !a.file === !a.symbol) throw Error("lsp_outline takes symbol or file (one of them)");
    const offset = a.offset || 0, limit = a.limit || MAX_ROWS;
    const more = (total, shown) => total > offset + shown ? `\n… ${total - offset - shown} more (offset: ${offset + shown}${a.files === undefined && name === "lsp_references" ? ", or files: true for per-file counts" : ""})` : "";
    let text;
    if (name === "lsp_symbols") {
      await lsp.prepare();
      const res = await lsp.symbols(a.query), lim = a.limit || 30;
      // `const clamp = M4.clamp` is a symbol too: list declarations, then collapse aliases to a count.
      const rows = res.map(s => {
        const f = lsp.rel(s.location.uri), { line, character } = s.location.range.start;
        return { s, tag: lsp.tag(f, line, character), loc: `${f}:${line + 1}:${character + 1}` };
      });
      const shown = rows.filter(r => r.tag !== "alias"), aliases = rows.filter(r => r.tag === "alias");
      const exact = shown.filter(r => r.s.name === a.query), other = shown.filter(r => r.s.name !== a.query);
      const line = ({ s, loc, tag }) => `${s.name}  ${KIND[s.kind] || s.kind}${tag === "export" ? " (export)" : ""}  ${loc}${s.containerName ? `  (in ${s.containerName})` : ""}`;
      const all = [...exact.map(line), ...(exact.length && other.length ? [`— ${other.length} other name${other.length === 1 ? "" : "s"} matching "${a.query}":`] : []), ...other.map(line)];
      text = all.slice(offset, offset + lim).join("\n")
        + (all.length > offset + lim ? `\n… ${all.length - offset - lim} more (offset: ${offset + lim}; an exact name lists first)` : "")
        + (aliases.length ? `\n+ ${aliases.length} alias${aliases.length === 1 ? "" : "es"} (const x = Y.x / destructuring)${aliases.some(r => r.s.name === a.query) ? ` — ${aliases.filter(r => r.s.name === a.query).length} of ${a.query}` : ""}, e.g. ${aliases.slice(0, 3).map(r => r.loc).join(", ")}` : "")
        || `no symbol matches ${a.query}`;
    } else if (name === "lsp_diagnostics") {
      text = await lsp.diagnose(a.file, a.all);
    } else if (name === "lsp_outline") {
      text = await lsp.outline({ file: a.file, symbol: a.symbol, all: a.all, offset, limit });
    } else if (name === "lsp_hover") {
      const { p, result, note } = await lsp.at(a, "textDocument/hover");
      const c = result?.contents, body = typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.value || x).join("\n") : c?.value;
      text = `${body || "(no type information)"}${p ? `\nat ${lsp.row(p.file, p.line0, p.col0)}` : ""}${note && !body?.includes(note) ? `\n(${note})` : ""}`;
    } else {
      const isDef = name === "lsp_definition", callers = name === "lsp_callers";
      const method = isDef ? "textDocument/definition" : "textDocument/references";
      const extra = isDef ? {} : { context: { includeDeclaration: callers ? false : a.includeDeclaration !== false } };
      const at = await lsp.at(a, method, extra), { p } = at;
      const pos = l => `${l.file}:${l.line0 + 1}:${l.col0 + 1}`;
      // Several unrelated top-level symbols share the name (wrapS lives in many files):
      // list every declaration for a definition; references follow the first and say so.
      const many = at.top && at.top.length > 1;
      // `create`, `init`: one name, a hundred unrelated declarations. Following one of them is a guess.
      if (many && !isDef && at.top.length > AMBIGUOUS) throw Error(`${a.symbol} has ${at.top.length} separate top-level declarations (e.g. ${at.top.slice(0, 4).map(pos).join(", ")}): pass Head.member (e.g. Liveries.create) or file+line`);
      let result = many && isDef ? at.top.map(l => ({ uri: lsp.uriOf(l.file), range: { start: { line: l.line0, character: l.col0 } } })) : at.result;
      if (Array.isArray(result) && (isDef || (!callers && a.includeDeclaration !== false)) && !at.note) await lsp.followExports(result);
      const notes = [at.note,
        many && isDef && `${at.top.length} separate top-level declarations named ${a.symbol}`,
        many && !isDef && `${at.top.length} declarations named ${a.symbol}; these are the one at ${pos(p)} (others: ${at.top.filter(l => pos(l) !== pos(p)).slice(0, 5).map(pos).join(", ")}; pass file+line)`].filter(Boolean);
      const head = { replace: (_, self) => `(${self}${notes.length ? "; " + notes.join("; ") : ""})` };   // built last: notes still grow below
      if (callers) {
        // Group the uses by enclosing function: who would an edit to this symbol touch?
        const all = (Array.isArray(result) ? result : []).map(l => l.targetUri ? { uri: l.targetUri, range: l.targetSelectionRange || l.targetRange } : l);
        const tagOf = l => lsp.tag(lsp.rel(l.uri), l.range.start.line, l.range.start.character);
        const locs = all.filter(l => tagOf(l) === "use");
        // `const lerp = M4.lerp` hides the real callers behind a local name: follow it in its file.
        for (const l of all.filter(l => tagOf(l) === "alias")) {
          const f = lsp.rel(l.uri), text = lsp.textLines(f)[l.range.start.line] || "";
          const m = /([\w$]+)\s*=\s*(?:window\.)?(?:[\w$]+\??\.)+$/.exec(text.slice(0, l.range.start.character));
          if (!m) continue;
          lsp.ensureOpen(f);
          const refs = (await lsp.request("textDocument/references", { textDocument: { uri: l.uri }, position: { line: l.range.start.line, character: m.index }, context: { includeDeclaration: false } }).catch(() => [])) || [];
          for (const r of refs) if (r.range.start.line !== l.range.start.line || r.range.start.character !== m.index) locs.push({ ...r, via: m[1] });
        }
        const groups = new Map();
        for (const l of locs) {
          const f = lsp.rel(l.uri), w = `${await lsp.where(f, l.range.start.line).catch(() => "?")}${l.via ? ` (via ${l.via})` : ""}`, k = `${f}\u0000${w}`;
          if (!groups.has(k)) groups.set(k, { f, w, lines: [] });
          groups.get(k).lines.push(l.range.start.line + 1);
        }
        const rows = [...groups.values()].sort((x, y) => x.f.localeCompare(y.f) || x.lines[0] - y.lines[0])
          .map(g => { const u = [...new Set(g.lines)]; return `${g.f}:${g.lines[0]}  ${g.w}  ×${g.lines.length}${g.lines.length > 1 ? `  (line${u.length === 1 ? "" : "s"} ${u.slice(0, 12).join(", ")}${u.length > 12 ? ", …" : ""})` : ""}`; });
        const files = new Set([...groups.values()].map(g => g.f)).size;
        text = `${locs.length} use${locs.length === 1 ? "" : "s"} in ${groups.size} function${groups.size === 1 ? "" : "s"} across ${files} file${files === 1 ? "" : "s"} ${head.replace("%SELF%", `query at ${p ? pos(p) : "—"}`)}\n${rows.slice(offset, offset + limit).join("\n")}${more(rows.length, Math.min(limit, rows.length - offset))}`;
      } else {
        const r = await lsp.locRows(result, { limit, offset, declFirst: isDef, where: !isDef, concise: a.format === "concise" });
        const summary = a.files ? `\n${r.byFile.map(([f, n]) => `${f} ${n}`).join("\n")}` : !isDef && r.total > 40 ? `\nby file: ${r.byFile.slice(0, 8).map(([f, n]) => `${f} ${n}`).join(", ")}${r.byFile.length > 8 ? `, … ${r.byFile.length - 8} more files` : ""}` : "";
        const self = isDef && r.total === 1 && p && r.rows[0].startsWith(`${pos(p)} `);
        if (!r.total && a.file && p) {
          const ln = lsp.textLines(p.file)[p.line0] || "", w = /[\w$]+/.exec(ln.slice(p.col0))?.[0];
          notes.push(/^[\w$]/.test(ln[p.col0] || "") ? `nothing resolvable at ${pos(p)} ("${w}")` : `${pos(p)} is not on a name (column ${p.col0 + 1} of "${ln.trim().slice(0, 60)}"); point the column at the symbol`);
        }
        const viaAlias = r.list.filter(l => l.via).length;
        if (viaAlias) notes.push(`${viaAlias} of them through a destructure or alias (\`const { x } = Head\`, \`const K = Head\`) — grep would not count those`);
        const extraRows = isDef ? r.tags.filter(t => t !== "def").length : 0, defs = r.total - extraRows;
        const count = isDef && extraRows && defs ? `${defs} definition${defs === 1 ? "" : "s"} (+${extraRows} export/alias row${extraRows === 1 ? "" : "s"})` : `${r.total} ${isDef ? "definition" : "reference"}${r.total === 1 ? "" : "s"}`;
        text = `${count}${!isDef ? ` in ${r.files} file${r.files === 1 ? "" : "s"}` : ""} ${head.replace("%SELF%", self ? "at the declaration" : `query at ${p ? pos(p) : "—"}`)}${summary}${a.files ? "" : `\n${r.rows.join("\n")}${more(r.total, r.rows.length)}`}`;
        if (isDef && a.body) {
          const d = r.list.find(l => lsp.tag(lsp.rel(l.uri), l.range.start.line, l.range.start.character) === "def") || r.list[0];
          const src = d && await lsp.bodyAt(lsp.rel(d.uri), d.range.start.line, a.maxLines || BODY_LINES);
          text += src ? `\n\n${lsp.rel(d.uri)}:\n${src}` : "\n\n(no declaration body found)";
        }
      }
    }
    return { content: [{ type: "text", text }], isError: false };
  } catch (e) {
    return { content: [{ type: "text", text: String(e.message || e).slice(0, 2000) }], isError: true };
  } finally { lsp.armIdle?.(); }
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
export async function handleRpc(lsp, msg) {
  if (!msg || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string" ||
    (Object.hasOwn(msg, "id") && !(msg.id === null || typeof msg.id === "string" || (typeof msg.id === "number" && Number.isFinite(msg.id)))) ||
    (msg.params !== undefined && (!msg.params || typeof msg.params !== "object" || Array.isArray(msg.params)))) return rpcError(null, -32600, "Invalid JSON-RPC request");
  if (!Object.hasOwn(msg, "id")) return null;
  const { id, method } = msg, result = value => ({ jsonrpc: "2.0", id, result: value });
  if (method === "initialize" && (msg.params?.protocolVersion !== undefined && typeof msg.params.protocolVersion !== "string")) return rpcError(id, -32602, "protocolVersion must be a string");
  if (method === "initialize") return result({ protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18"].includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : "2025-06-18", capabilities: { tools: {} },
    serverInfo: { name: "apex-lsp", version: "0.1.0" },
    instructions: "TypeScript-checker code intelligence for js/ (script-global IIFEs). Prefer lsp_definition / lsp_references over grep for a named symbol: `Name`, `Head.member` or `G.member`. Rows are tagged [def|export|alias|use]. ONE-based positions. First call ~1-2 s (project load), then tens of ms; tsc exits after 10 idle minutes and restarts on demand." });
  if (method === "ping") return result({});
  if (method === "tools/list") return result({ tools: TOOLS });
  if (method === "tools/call") {
    if (!msg.params || typeof msg.params.name !== "string" || (msg.params.arguments !== undefined && (!msg.params.arguments || typeof msg.params.arguments !== "object" || Array.isArray(msg.params.arguments)))) return rpcError(id, -32602, "tools/call needs name and object arguments");
    return result(await callTool(lsp, msg.params.name, msg.params.arguments ?? {}));
  }
  return rpcError(id, -32601, "Method not found");
}

export async function serve() {
  const lsp = new Lsp();
  for (const s of ["SIGINT", "SIGTERM"]) process.once(s, () => { lsp.stop(); process.exit(0); });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chain = Promise.resolve();   // one LSP conversation: queries run in order
  for await (const line of input) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify(rpcError(null, -32700, "Invalid JSON")) + "\n"); continue; }
    chain = chain.then(() => handleRpc(lsp, msg)).then(r => { if (r) process.stdout.write(JSON.stringify(r) + "\n"); })
      .catch(e => process.stderr.write(`apex-lsp: ${e.message}\n`));
  }
  await chain; lsp.stop();
}

const CLI = { def: "lsp_definition", refs: "lsp_references", callers: "lsp_callers", outline: "lsp_outline", sym: "lsp_symbols", hover: "lsp_hover", diag: "lsp_diagnostics" };
async function cli([cmd, target, ...rest]) {
  const name = CLI[cmd];
  if (!name || !target) {
    process.stdout.write([
      "node tools/mcp/lsp-mcp.mjs [serve | --list-tools]",
      "  def|refs|callers|hover <Name | Head.member | file:line[:col]>   flags: --body --max-lines=N (def), --no-decl --files --concise (refs), --limit=N --offset=N",
      "  outline <Global | file.js> [--all]     sym <query> [--limit=N]     diag <file.js> [--all]",
    ].join("\n") + "\n");
    return cmd === "--help" ? 0 : 2;
  }
  const pos = /^(.+\.(?:js|ts)):(\d+)(?::(\d+))?$/.exec(target), file = /\.(js|ts)$/.test(target);
  const args = name === "lsp_symbols" ? { query: target } : name === "lsp_diagnostics" ? { file: target }
    : name === "lsp_outline" ? (file ? { file: target } : { symbol: target })
    : pos ? { file: pos[1], line: +pos[2], ...(pos[3] ? { column: +pos[3] } : {}) } : { symbol: target };
  const flag = f => rest.includes(f), num = f => { const v = rest.find(x => x.startsWith(`${f}=`)); return v ? +v.slice(f.length + 1) : undefined; };
  if (flag("--no-decl")) args.includeDeclaration = false;
  if (flag("--files")) args.files = true;
  if (flag("--concise")) args.format = "concise";
  if (flag("--body")) args.body = true;
  if (flag("--all")) args.all = true;
  for (const [f, k] of [["--limit", "limit"], ["--offset", "offset"], ["--max-lines", "maxLines"]]) if (num(f) !== undefined) args[k] = num(f);
  const lsp = new Lsp();
  try { const r = await callTool(lsp, name, args); process.stdout.write(r.content[0].text + "\n"); return r.isError ? 1 : 0; }
  finally { lsp.stop(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--list-tools") process.stdout.write(JSON.stringify(TOOLS, null, 2) + "\n");
  else if (!argv.length || argv[0] === "serve") serve().catch(e => { process.stderr.write(e.message + "\n"); process.exitCode = 1; });
  else cli(argv).then(c => { process.exitCode = c; });
}
