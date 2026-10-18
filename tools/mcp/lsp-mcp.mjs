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
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = "js";
const ANCHOR = "js/core/log.js";   // tsgo searches open projects only: one open file loads jsconfig's
const KIND = { 5: "class", 6: "method", 7: "property", 8: "field", 9: "constructor", 12: "function", 13: "variable", 14: "constant" };
const MAX_ROWS = 200;
const CANDIDATES = 6;
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
  if (/\b(function\*?|class)\s+$/.test(before) || /\breadonly\s+$/.test(before)) return "def";
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
  return "use";
}

// Is the identifier at `col` a shorthand property (`{ a, name, b }`) — an export, not a declaration?
const isShorthand = (line, col) => /^[\w$]+\s*[,}]/.test(line.slice(col)) && !/(const|let|var|function)\s+$/.test(line.slice(0, col));

// Is column `i` of a source line inside a // comment, a block-comment line, or a string literal?
export function inCommentOrString(line, i) {
  const t = line.trimStart();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return true;
  let q = null;
  for (let k = 0; k < i; k++) {
    const ch = line[k];
    if (q) { if (ch === "\\") k++; else if (ch === q) q = null; }
    else if (ch === "'" || ch === '"' || ch === "`") q = ch;
    else if (ch === "/" && line[k + 1] === "/") return true;
  }
  return q !== null;
}

function walk(root, dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(root, p, out); else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

export class Lsp {
  // tsc --lsp holds ~400 MB beside SwiftShader runs: it starts on the first tool
  // call, never at session start, and exits after idleMs without one.
  constructor({ root = ROOT, src = SRC, anchor = ANCHOR, cmd = path.join(ROOT, "node_modules/.bin/tsc"), timeout = 30000,
    idleMs = +(process.env.APEX_LSP_IDLE_MS || 10 * 60000) } = {}) {
    this.root = root; this.src = src; this.anchor = anchor; this.cmd = cmd; this.timeout = timeout; this.idleMs = idleMs; this.idle = null; this.proc = null; this.ready = null;
    this.open = new Map(); this.mtimes = new Map(); this.lines = new Map();
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
        const len = +/Content-Length: (\d+)/i.exec(buf.subarray(0, h).toString())[1];
        if (buf.length < h + 4 + len) return;
        const m = JSON.parse(buf.subarray(h + 4, h + 4 + len).toString()); buf = buf.subarray(h + 4 + len);
        if (m.method && m.id != null) this.send({ jsonrpc: "2.0", id: m.id, result: m.method === "workspace/configuration" ? (m.params?.items || []).map(() => null) : null });
        else if (m.id != null && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); }
      }
    });
    const died = Error("tsc --lsp exited");
    proc.on("exit", () => { for (const r of this.pending.values()) r({ error: { message: died.message } }); this.pending.clear(); this.ready = null; this.open.clear(); });
    proc.on("error", e => { died.message = `tsc --lsp failed to start: ${e.message} (npm install?)`; });
    const root = pathToFileURL(this.root).href;
    return this.ready = (async () => {
      await this.request("initialize", { processId: process.pid, rootUri: root, capabilities: { textDocument: { hover: { contentFormat: ["markdown", "plaintext"] } } }, workspaceFolders: [{ uri: root, name: path.basename(this.root) }] });
      this.notify("initialized", {});
      this.scan(true);
      this.ensureOpen(this.anchor);
    })();
  }
  rel(uri) { return path.relative(this.root, fileURLToPath(uri)); }
  uriOf(file) { return pathToFileURL(path.resolve(this.root, file)).href; }
  send(o) { const s = JSON.stringify(o); this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); }
  notify(method, params) { this.send({ jsonrpc: "2.0", method, params }); }
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const t = setTimeout(() => { this.pending.delete(id); reject(Error(`${method} timed out after ${this.timeout} ms`)); }, this.timeout);
      this.pending.set(id, m => { clearTimeout(t); m.error ? reject(Error(m.error.message)) : resolve(m.result); });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  // Working-tree freshness: stat every js/ file, tell the server what moved.
  scan(first = false) {
    const seen = new Set(), changes = [];
    for (const f of walk(this.root, this.src)) {
      seen.add(f);
      const m = fs.statSync(path.join(this.root, f)).mtimeMs, was = this.mtimes.get(f);
      if (was === m) continue;
      this.mtimes.set(f, m); this.lines.delete(f);
      if (first) continue;
      changes.push({ uri: this.uriOf(f), type: was === undefined ? 1 : 2 });
      if (this.open.has(f)) { this.notify("textDocument/didClose", { textDocument: { uri: this.uriOf(f) } }); this.open.delete(f); }
    }
    for (const f of [...this.mtimes.keys()]) if (!seen.has(f)) { this.mtimes.delete(f); this.lines.delete(f); changes.push({ uri: this.uriOf(f), type: 3 }); }
    if (changes.length) this.notify("workspace/didChangeWatchedFiles", { changes });
  }
  ensureOpen(file) {
    if (this.open.has(file)) return;
    this.notify("textDocument/didOpen", { textDocument: { uri: this.uriOf(file), languageId: "javascript", version: 1, text: fs.readFileSync(path.join(this.root, file), "utf8") } });
    this.open.set(file, 1);
  }
  textLines(file) { return this.textOf(file).lines; }
  textOf(file) {
    if (!this.lines.has(file)) {
      const text = fs.readFileSync(path.join(this.root, file), "utf8"), starts = [0];
      for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
      this.lines.set(file, { text, lines: text.split("\n"), starts });
    }
    return this.lines.get(file);
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
  row(file, line0, col0, tag = true) {
    const raw = this.textLines(file)[line0] || "", lead = raw.length - raw.trimStart().length;
    let text = raw.trim(), c = Math.max(0, col0 - lead);
    if (text.length > 120) {
      const from = Math.max(0, Math.min(c - 50, text.length - 120));
      text = (from > 0 ? "…" : "") + text.slice(from, from + 120) + (from + 120 < text.length ? "…" : "");
    }
    return `${file}:${line0 + 1}:${col0 + 1}  ${tag ? `[${this.tag(file, line0, col0)}] ` : ""}${text}`;
  }
  async prepare() { clearTimeout(this.idle); await this.start(); this.scan(); }
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
      const f = path.relative(this.root, path.resolve(this.root, file));
      if (!fs.existsSync(path.join(this.root, f))) throw Error(`no such file: ${file}`);
      return { cands: [{ file: f, line0: line - 1, col0: (column || 1) - 1 }], parts: [] };
    }
    if (!symbol) throw Error("pass symbol (Name or Head.member) or file+line[+column]");
    const parts = symbol.split("."), name = parts.at(-1), cands = [];
    const at = s => ({ file: this.rel(s.location.uri), line0: s.location.range.start.line, col0: s.location.range.start.character });
    if (parts.length === 1) {
      const hits = (await this.symbols(name)).filter(s => s.name === name);
      if (!hits.length) throw Error(`symbol not found: ${name} (try lsp_symbols for a prefix)`);
      const top = hits.filter(s => !s.containerName);
      return { cands: hits.map(at), parts, top: (top.length ? top : hits).map(at) };
    }
    const re = new RegExp(`\\b${parts.map(p => p.replace(/[$]/g, "\\$")).join("\\??\\.")}\\b`, "g");
    for (const f of [...this.mtimes.keys()].sort()) {
      const { text, lines } = this.textOf(f);
      if (!text.includes(symbol.replace("?.", "."))) continue;
      for (let i = 0; i < lines.length && cands.length < CANDIDATES; i++) {
        for (const m of lines[i].matchAll(re)) {
          if (inCommentOrString(lines[i], m.index)) continue;
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
    if (c.parts.length > 1 && this.windowDecl(c.parts.slice(0, -1).join("."))) return { ...c, ...this.textFallback(c.parts, method, c.head) };
    let first = null;
    for (const p of c.cands) {
      this.ensureOpen(p.file);
      const result = await this.request(method, { textDocument: { uri: this.uriOf(p.file) }, position: { line: p.line0, character: p.col0 }, ...extra });
      first ??= { p, result };
      if (answered(result)) return { ...c, p, result, note: p.note };
    }
    if (c.parts.length === 2 && FACADES[c.parts[0]]) return { ...c, ...(await this.facade(c.parts, method, extra)) };
    if (c.parts.length > 1) return { ...c, ...this.textFallback(c.parts, method, c.head) };
    if (c.parts.length === 1 && method === "textDocument/references" && c.top.some(l => /^\s*window\.[\w$]+\s*=/.test(this.textLines(l.file)[l.line0] || ""))) {
      const p = c.top[0], def = { uri: this.uriOf(p.file), range: { start: { line: p.line0, character: p.col0 } } };
      return { ...c, p, result: this.textRefs(c.parts, def), note: `text match: window.${c.parts[0]} is untyped for the checker` };
    }
    if (c.parts.length === 1 && method === "textDocument/definition") {
      const p = c.top[0];
      return { ...c, p, result: c.top.map(l => ({ uri: this.uriOf(l.file), range: { start: { line: l.line0, character: l.col0 } } })) };
    }
    return { ...c, ...(first || { p: null, result: null }) };
  }
  // `window.Head = {…}` globals (15 modules) are invisible to the checker, which
  // types `Head` as any; answer those from the text, labelled as such.
  windowDecl(h) {
    const decl = new RegExp(`^\\s*window\\.${h.replace(/[$.]/g, "\\$&")}\\s*=`, "m"), needle = `window.${h}`;
    for (const f of [...this.mtimes.keys()].sort()) {
      const { text } = this.textOf(f);
      if (!text.includes(needle)) continue;
      const m = decl.exec(text);
      if (m) return { file: f, line0: this.posOf(f, m.index + m[0].indexOf("window")).line0 };
    }
    return null;
  }
  textFallback(parts, method, head) {
    const [h, member] = [parts.slice(0, -1).join("."), parts.at(-1)];
    const d = this.windowDecl(h);
    if (!d && head) throw Error(`${h} (${head.file}:${head.line0 + 1}) has no member ${member} the checker can see; try lsp_hover ${h} or lsp_symbols ${member}`);
    if (!d) throw Error(`symbol not found: ${h} is not a global the checker or a window.${h} assignment declares`);
    const key = new RegExp(`(^\\s*|[{,]\\s*)(${member.replace(/[$]/g, "\\$")})\\s*[:(,}]|^\\s*(?:async\\s+)?(?:get\\s+|set\\s+)?(${member.replace(/[$]/g, "\\$")})\\s*\\(`);
    const lines = this.textLines(d.file);
    let def = null;
    for (let i = d.line0; i < lines.length && !def; i++) {
      if (inCommentOrString(lines[i], 0) && lines[i].trimStart().startsWith("//")) continue;
      const m = key.exec(lines[i]);
      if (m) def = { uri: this.uriOf(d.file), range: { start: { line: i, character: lines[i].indexOf(member, m.index) } } };
    }
    if (!def) throw Error(`window.${h} (${d.file}:${d.line0 + 1}) has no member ${member}`);
    const note = `text match: window.${h} is untyped for the checker`;
    if (method !== "textDocument/references") return { p: { file: d.file, line0: def.range.start.line, col0: def.range.start.character }, result: method === "textDocument/hover" ? { contents: `(${note})` } : [def], note };
    return { p: { file: d.file, line0: def.range.start.line, col0: def.range.start.character }, result: this.textRefs(parts, def), note };
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
    if (method === "textDocument/references") return { p, result: this.textRefs([h, member], def), note: `${note}; uses are text matches of ${h}.${member}` };
    if (method === "textDocument/definition") return { p, result: [def], note };
    this.ensureOpen(p.file);
    return { p, result: await this.request(method, { textDocument: { uri: def.uri }, position: def.range.start, ...extra }), note };
  }
  // Every code (non-comment, non-string) occurrence of `A.b` / `A`, after the declaration
  // row; for `A.b`, also each file's `const { b } = A` / `const X = A` binding and the
  // uses of the local name that binding introduces (the checker sees none of them).
  textRefs(parts, def) {
    const name = parts.at(-1), head = parts.slice(0, -1).join("."), esc = x => x.replace(/[$.]/g, "\\$&");
    const refs = [def], seen = new Set([`${def.uri}:${def.range.start.line}:${def.range.start.character}`]);
    const add = (f, i, col) => { const uri = this.uriOf(f), k = `${uri}:${i}:${col}`; if (!seen.has(k)) { seen.add(k); refs.push({ uri, range: { start: { line: i, character: col } } }); } };
    const usesOf = (f, re, nameLen, fromLine = 0) => {
      const { text, lines } = this.textOf(f);
      for (const m of text.matchAll(re)) {
        if (!startsName(text, m.index)) continue;
        const { line0, col0 } = this.posOf(f, m.index);
        if (line0 >= fromLine && !inCommentOrString(lines[line0], col0)) add(f, line0, col0 + m[0].length - nameLen);
      }
    };
    const destr = new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*(?:window\\.)?${esc(head)}\\b(?![\\w$.])`, "g");
    const whole = new RegExp(`\\b(?:const|let|var)\\s+([\\w$]+)\\s*=\\s*(?:window\\.)?${esc(head)}\\s*[;,\\n]`, "g");
    // Literal-first pattern (a leading lookbehind made V8 test every offset); the
    // boundary before the match is checked by hand: start of a name, or `window.`.
    const direct = new RegExp(`${parts.map(esc).join("\\??\\.")}(?![\\w$])`, "g");
    const startsName = (text, i) => !/[\w$.]/.test(text[i - 1] || "") || text.slice(Math.max(0, i - 7), i) === "window." && !/[\w$.]/.test(text[i - 8] || "");
    for (const f of [...this.mtimes.keys()].sort()) {
      const { text } = this.textOf(f);
      if (!text.includes(name) || (head && !text.includes(head))) continue;   // every ref spells the member name
      usesOf(f, direct, name.length);
      if (parts.length < 2) continue;
      for (const m of text.matchAll(destr)) {
        const inner = m[1], km = new RegExp(`(?<![\\w$])${esc(name)}(?![\\w$])(?:\\s*:\\s*([\\w$]+))?`).exec(inner);
        if (!km) continue;
        const { line0, col0 } = this.posOf(f, m.index + m[0].indexOf(inner) + km.index);
        add(f, line0, col0);
        const local = km[1] || name;
        usesOf(f, new RegExp(`(?<![\\w$.])${esc(local)}(?![\\w$]|\\s*:)`, "g"), local.length, line0 + 1);
      }
      for (const m of text.matchAll(whole)) {
        usesOf(f, new RegExp(`(?<![\\w$.])${esc(m[1])}\\??\\.${esc(name)}(?![\\w$])`, "g"), name.length, this.posOf(f, m.index).line0);
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
  locRows(locs, limit = MAX_ROWS, declFirst = false) {
    const list = (Array.isArray(locs) ? locs : locs ? [locs] : []).map(l => l.targetUri ? { uri: l.targetUri, range: l.targetSelectionRange || l.targetRange } : l);
    // A definition through an IIFE's `return { …, name, … }` is the export, not the body: list the declaration first.
    if (declFirst) list.sort((a, b) => this.rank(a) - this.rank(b));
    else list.sort((a, b) => a.uri.localeCompare(b.uri) || a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
    const rows = list.map(l => this.row(this.rel(l.uri), l.range.start.line, l.range.start.character));
    const per = {};
    for (const l of list) { const f = this.rel(l.uri); per[f] = (per[f] || 0) + 1; }
    const byFile = Object.entries(per).sort((a, b) => b[1] - a[1]);
    return { total: rows.length, byFile, tags: list.map(l => this.tag(this.rel(l.uri), l.range.start.line, l.range.start.character)), files: new Set(list.map(l => l.uri)).size, rows: rows.slice(0, limit), truncated: rows.length > limit };
  }
  stop() { clearTimeout(this.idle); if (this.proc && !this.proc.killed) { try { this.notify("exit", null); } catch { /* closed */ } this.proc.kill(); } }
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
export const TOOLS = [
  def("lsp_definition", "Go to definition through TypeScript's checker. Use instead of grep to find where a global, module member (Head.member), G.<member> or local is defined. Rows: `file:line:col  [def|export|alias] source`, the real declaration first; several same-named top-level functions are all listed.", where),
  def("lsp_references", "Every reference across js/, sorted by file, with a per-file summary when long. Semantic (skips comments, strings, same-named members of other objects); window.X globals and G.<member> fall back to labelled text matches that follow `const { x } = Head` destructures. Rows: `file:line:col  [def|export|alias|use] source`.",
    { ...where, includeDeclaration: { type: "boolean", description: "Include the declaration itself (default true)" }, limit: int(`Rows to print (default ${MAX_ROWS})`, 1, 2000),
      files: { type: "boolean", description: "Only the per-file counts (every file), no rows: who uses it, at a glance" } }),
  def("lsp_symbols", "Workspace symbol search by name or prefix: declarations listed (exact first, top-level before nested), aliases (`const x = Y.x`, destructuring) collapsed to a count.", { query: str("Symbol name or prefix, e.g. GameHud"), limit: int("Rows (default 30)", 1, MAX_ROWS) }, ["query"]),
  def("lsp_hover", "Inferred type and JSDoc (type first, then where it was asked). JS parameters without JSDoc read as any.", where),
  def("lsp_diagnostics", "TypeScript diagnostics for one file. jsconfig.json has checkJs off, so this reports syntax errors only.", { file: where.file }, ["file"]),
];

export async function callTool(lsp, name, a = {}) {
  try {
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw Error(`Unknown tool: ${name}`);
    for (const k of Object.keys(a)) if (!tool.inputSchema.properties[k]) throw Error(`Unknown argument: ${k}; valid: ${Object.keys(tool.inputSchema.properties).join(", ")}`);
    for (const k of tool.inputSchema.required) if (a[k] == null) throw Error(`Missing argument: ${k}`);
    if (a.file && a.line == null && name !== "lsp_diagnostics") throw Error("file needs line");
    let text;
    if (name === "lsp_symbols") {
      await lsp.prepare();
      const res = await lsp.symbols(a.query), limit = a.limit || 30;
      // `const clamp = M4.clamp` is a symbol too: list declarations, then collapse aliases to a count.
      const rows = res.map(s => {
        const f = lsp.rel(s.location.uri), { line, character } = s.location.range.start;
        return { s, tag: lsp.tag(f, line, character), loc: `${f}:${line + 1}:${character + 1}` };
      });
      const shown = rows.filter(r => r.tag !== "alias"), aliases = rows.filter(r => r.tag === "alias");
      const exact = shown.filter(r => r.s.name === a.query), other = shown.filter(r => r.s.name !== a.query);
      const line = ({ s, loc, tag }) => `${s.name}  ${KIND[s.kind] || s.kind}${tag === "export" ? " (export)" : ""}  ${loc}${s.containerName ? `  (in ${s.containerName})` : ""}`;
      text = [...exact.map(line), ...(exact.length && other.length ? [`— ${other.length} other name${other.length === 1 ? "" : "s"} matching "${a.query}":`] : []), ...other.map(line)].slice(0, limit + 1).join("\n")
        + (shown.length > limit ? `\n… ${shown.length - limit} more (raise limit, max ${MAX_ROWS}; an exact name lists first)` : "")
        + (aliases.length ? `\n+ ${aliases.length} alias${aliases.length === 1 ? "" : "es"} (const x = Y.x / destructuring)${aliases.some(r => r.s.name === a.query) ? ` — ${aliases.filter(r => r.s.name === a.query).length} of ${a.query}` : ""}, e.g. ${aliases.slice(0, 3).map(r => r.loc).join(", ")}` : "")
        || `no symbol matches ${a.query}`;
    } else if (name === "lsp_diagnostics") {
      await lsp.prepare();
      const f = path.relative(lsp.root, path.resolve(lsp.root, a.file)); lsp.ensureOpen(f);
      const r = await lsp.request("textDocument/diagnostic", { textDocument: { uri: lsp.uriOf(f) } });
      const items = r?.items || [];
      text = items.map(d => `${f}:${d.range.start.line + 1}:${d.range.start.character + 1}  TS${d.code} ${d.message.split("\n")[0]}`).join("\n") || `${f}: 0 diagnostics`;
    } else if (name === "lsp_hover") {
      const { p, result, note } = await lsp.at(a, "textDocument/hover");
      const c = result?.contents, body = typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.value || x).join("\n") : c?.value;
      text = `${body || "(no type information)"}\nat ${lsp.row(p.file, p.line0, p.col0)}${note && !body?.includes(note) ? `\n(${note})` : ""}`;
    } else {
      const method = name === "lsp_definition" ? "textDocument/definition" : "textDocument/references";
      const extra = name === "lsp_references" ? { context: { includeDeclaration: a.includeDeclaration !== false } } : {};
      const at = await lsp.at(a, method, extra), { p } = at;
      const pos = l => `${l.file}:${l.line0 + 1}:${l.col0 + 1}`;
      // Several unrelated top-level symbols share the name (wrapS lives in many files):
      // list every declaration for a definition; references follow the first and say so.
      const many = at.top && at.top.length > 1;
      const result = many && name === "lsp_definition" ? at.top.map(l => ({ uri: lsp.uriOf(l.file), range: { start: { line: l.line0, character: l.col0 } } })) : at.result;
      if (Array.isArray(result) && (name === "lsp_definition" || a.includeDeclaration !== false) && !at.note) await lsp.followExports(result);
      const r = lsp.locRows(result, a.limit, name === "lsp_definition");
      const notes = [at.note,
        many && name === "lsp_definition" && `${at.top.length} separate top-level declarations named ${a.symbol}`,
        many && name === "lsp_references" && `${at.top.length} declarations named ${a.symbol}; these are the one at ${pos(p)} (others: ${at.top.filter(l => pos(l) !== pos(p)).slice(0, 5).map(pos).join(", ")}; pass file+line)`].filter(Boolean);
      const summary = a.files ? `\n${r.byFile.map(([f, n]) => `${f} ${n}`).join("\n")}` : name === "lsp_references" && r.total > 40 ? `\nby file: ${r.byFile.slice(0, 8).map(([f, n]) => `${f} ${n}`).join(", ")}${r.byFile.length > 8 ? `, … ${r.byFile.length - 8} more files` : ""}` : "";
      const self = name === "lsp_definition" && r.total === 1 && p && r.rows[0].startsWith(`${pos(p)} `);
      const extraRows = name === "lsp_definition" ? r.tags.filter(t => t !== "def").length : 0, defs = r.total - extraRows;
      const count = name === "lsp_definition" && extraRows && defs ? `${defs} definition${defs === 1 ? "" : "s"} (+${extraRows} export/alias row${extraRows === 1 ? "" : "s"})` : `${r.total} ${name === "lsp_definition" ? "definition" : "reference"}${r.total === 1 ? "" : "s"}`;
      text = `${count}${name === "lsp_references" ? ` in ${r.files} file${r.files === 1 ? "" : "s"}` : ""} (${self ? "at the declaration" : `query at ${p ? pos(p) : "—"}`}${notes.length ? "; " + notes.join("; ") : ""})${summary}${a.files ? "" : `\n${r.rows.join("\n")}${r.truncated ? `\n… ${r.total - r.rows.length} more (raise limit, or files: true for per-file counts)` : ""}`}`;
    }
    return { content: [{ type: "text", text }], isError: false };
  } catch (e) {
    return { content: [{ type: "text", text: String(e.message || e).slice(0, 2000) }], isError: true };
  } finally { lsp.armIdle?.(); }
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
export async function handleRpc(lsp, msg) {
  if (!msg || typeof msg.method !== "string") return rpcError(null, -32600, "Invalid JSON-RPC request");
  if (!Object.hasOwn(msg, "id")) return null;
  const { id, method } = msg, result = value => ({ jsonrpc: "2.0", id, result: value });
  if (method === "initialize") return result({ protocolVersion: msg.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} },
    serverInfo: { name: "apex-lsp", version: "0.1.0" },
    instructions: "TypeScript-checker code intelligence for js/ (script-global IIFEs). Prefer lsp_definition / lsp_references over grep for a named symbol: `Name`, `Head.member` or `G.member`. Rows are tagged [def|export|alias|use]. ONE-based positions. First call ~1-2 s (project load), then tens of ms; tsc exits after 10 idle minutes and restarts on demand." });
  if (method === "ping") return result({});
  if (method === "tools/list") return result({ tools: TOOLS });
  if (method === "tools/call") return result(await callTool(lsp, msg.params?.name, msg.params?.arguments ?? {}));
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

const CLI = { def: "lsp_definition", refs: "lsp_references", sym: "lsp_symbols", hover: "lsp_hover", diag: "lsp_diagnostics" };
async function cli([cmd, target, ...rest]) {
  const name = CLI[cmd];
  if (!name || !target) {
    process.stdout.write("node tools/mcp/lsp-mcp.mjs [serve | --list-tools | def|refs|hover <Name|Head.member|file:line[:col]> [--no-decl --files --limit=N] | sym <query> [--limit=N] | diag <file>]\n");
    return cmd === "--help" ? 0 : 2;
  }
  const pos = /^(.+\.(?:js|ts)):(\d+)(?::(\d+))?$/.exec(target);
  const args = name === "lsp_symbols" ? { query: target } : name === "lsp_diagnostics" ? { file: target }
    : pos ? { file: pos[1], line: +pos[2], ...(pos[3] ? { column: +pos[3] } : {}) } : { symbol: target };
  if (rest.includes("--no-decl")) args.includeDeclaration = false;
  if (rest.includes("--files")) args.files = true;
  const lim = rest.find(x => x.startsWith("--limit="));
  if (lim) args.limit = +lim.slice(8);
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
