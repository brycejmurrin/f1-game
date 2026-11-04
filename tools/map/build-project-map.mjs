#!/usr/bin/env node
// @doc Manifest js modules as a graph (symbols, owners, tests, churn) with call, façade and load-order edges.
// @skill code-nav
/* build-project-map — the data behind the interactive project explorer.
 *
 *   node tools/map/build-project-map.mjs                 # → artifacts/project-map/project-map.json
 *   node tools/map/build-project-map.mjs --html          # also artifacts/project-map/index.html (tools/map/explorer.html + data)
 *   node tools/map/build-project-map.mjs --lsp           # symbols from apex-lsp's tsc project (documentSymbol), not the espree pass
 *   node tools/map/build-project-map.mjs --flows=<json>  # curated "where does X happen" chains (default tools/map/flows.json; stale steps flagged)
 *   node tools/map/build-project-map.mjs --stdout        # the JSON on stdout, nothing written
 *
 * SOURCES (no guesses): the node set is tools/manifest.cjs (FULL, DEFERRED, every LAZY_* roster, LAZY_SCENERY,
 * workers, CONTROLLER, CARVIEW). Symbols and `calls` edges come from espree + eslint-scope over each file as a
 * classic script — the same global-scope model jsconfig.json gives tsc, so a `calls` edge A→B means A references
 * a global B declares (`Tracks`, `Tracks.curvature`). `facade` edges are tools/check/check-gctx.mjs collectUsage
 * (the G-ctx contract checker's own extractor). `loads-before` edges are the manifest's HARD_EDGES and *_EDGES.
 * `tested-by` edges are test files that name the module's path. Owners: skill `paths:` globs, skills whose
 * SKILL.md or references name the file, rule files' `paths:`, nested AGENTS.md. Churn: commits touching the file
 * in the last 30 days (`git log`; a shallow clone undercounts — `meta.churnSince` records the oldest commit seen).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";
import { analyze } from "eslint-scope";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// ── node set: the manifest ─────────────────────────────────────────────────
/** Every js module the manifest names, with the first roster that names it. */
export function manifestModules(m = require("../manifest.cjs")) {
  const out = new Map();
  const add = (list, bundle) => { for (const f of list || []) if (typeof f === "string" && f.endsWith(".js") && !out.has(f)) out.set(f, bundle); };
  add(m.FULL.filter((f) => f !== "@circuits"), "boot");
  for (const [k, v] of Object.entries(m.DEFERRED || {})) add(v, `deferred:${k}`);
  add(m.LAZY_CIRCUIT, "lazy:circuit");
  add(m.LAZY_SCENERY, "lazy:scenery");
  for (const [k, v] of Object.entries(m)) if (/^LAZY_/.test(k) && !/_EDGES$/.test(k) && Array.isArray(v)) add(v, `lazy:${k.slice(5).toLowerCase()}`);
  add(m.TRACK_WORKER_EXTRA, "worker");
  add(m.CONTROLLER, "controller");
  add(m.CARVIEW, "carview");
  return out;
}

/** Every [before, after] load-order pair the manifest declares, tagged with its list. */
export function manifestEdges(m = require("../manifest.cjs")) {
  const out = [];
  for (const [k, v] of Object.entries(m)) {
    if (!/(^HARD_EDGES$|_EDGES$)/.test(k) || !Array.isArray(v)) continue;
    for (const p of v) if (Array.isArray(p) && p.length === 2) out.push({ from: p[0], to: p[1], list: k });
  }
  return out;
}

// ── classification ─────────────────────────────────────────────────────────
const LAYERS = [
  [/^js\/(core\/|game\.js$|roster\.js$)/, "core"],
  [/^js\/render\//, "render"],
  [/^js\/track\//, "track-engine"],
  [/^js\/circuits\//, "circuits"],
  [/^js\/(physics|race)\//, "simulation"],
  [/^js\/(car|garage)\//, "car-garage"],
  [/^js\/input\//, "input"],
  [/^js\/(ui|overlay|camera|audio|fx|lighting)\//, "presentation"],
  [/^js\/(career|data|share)\//, "modes-data"],
  [/^js\/net\//, "net"],
  [/^js\/agent\//, "agent"],
  [/^js\//, "dev-platform"],
];
export const layerOf = (f) => LAYERS.find(([re]) => re.test(f))?.[1] || "other";
export function areaOf(f) {
  const p = f.split("/");
  if (p.length <= 2) return "js";
  if ((p[1] === "render" || p[1] === "circuits") && p.length > 3) return `js/${p[1]}/${p[2]}`;
  return `js/${p[1]}`;
}

/** First sentence-ish of the file's header comment (the module's own description). */
function headerDoc(src) {
  const m = /^\s*(?:\/\*+([\s\S]*?)\*\/|((?:\s*\/\/[^\n]*\n)+))/.exec(src);
  if (!m) return "";
  let t = (m[1] ?? m[2].replace(/^\s*\/\/ ?/gm, "")).replace(/^\s*\*\s?/gm, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^Apex 26\s*[—-]\s*/, "").replace(/@doc\s*/, "");
  return t.length > 240 ? t.slice(0, 237).replace(/\s\S*$/, "") + "…" : t;
}

// ── symbols + calls (espree / eslint-scope, script globals) ───────────────
function parseScript(src) {
  return parse(src, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true });
}
const MEMBER_KEYS = (obj) => obj.properties.filter((p) => p.type === "Property" && !p.computed && (p.key.name || p.key.value))
  .map((p) => String(p.key.name ?? p.key.value)).concat(obj.properties.filter((p) => p.type === "SpreadElement").map(() => "…"));

/** The object a module global evaluates to, when its initialiser shows it: IIFE return / literal / freeze. */
function exportedMembers(init) {
  if (!init) return [];
  if (init.type === "ObjectExpression") return MEMBER_KEYS(init);
  if (init.type === "CallExpression") {
    const c = init.callee;
    if (c.type === "MemberExpression" && c.property.name === "freeze" && init.arguments[0]?.type === "ObjectExpression") return MEMBER_KEYS(init.arguments[0]);
    const fn = c.type === "FunctionExpression" || c.type === "ArrowFunctionExpression" ? c : null;
    if (fn?.body?.type === "BlockStatement") {
      const ret = [...fn.body.body].reverse().find((s) => s.type === "ReturnStatement");
      let arg = ret?.argument;
      if (arg?.type === "CallExpression" && arg.callee.type === "MemberExpression" && arg.callee.property.name === "freeze") arg = arg.arguments[0];
      if (arg?.type === "ObjectExpression") return MEMBER_KEYS(arg);
      if (arg?.type === "Identifier") {
        const decl = fn.body.body.find((s) => s.type === "VariableDeclaration" && s.declarations.some((d) => d.id.name === arg.name));
        const d = decl?.declarations.find((x) => x.id.name === arg.name);
        if (d?.init?.type === "ObjectExpression") return MEMBER_KEYS(d.init);
      }
    }
  }
  return [];
}

/** Globals a script declares (top-level bindings and window./globalThis. assignments) with their members. */
export function scanFile(rel, src = read(rel)) {
  let ast;
  try { ast = parseScript(src); } catch (e) { return { error: `parse: ${e.message}`, globals: [], refs: new Map() }; }
  const globals = [];
  for (const s of ast.body) {
    if (s.type === "VariableDeclaration") for (const d of s.declarations) {
      if (d.id.type === "Identifier") globals.push({ name: d.id.name, line: d.loc.start.line, kind: s.kind, members: exportedMembers(d.init) });
    } else if (s.type === "FunctionDeclaration" && s.id) globals.push({ name: s.id.name, line: s.loc.start.line, kind: "function", members: [] });
    else if (s.type === "ClassDeclaration" && s.id) globals.push({ name: s.id.name, line: s.loc.start.line, kind: "class", members: [] });
  }
  // window.X = … / globalThis.X = … anywhere at top level or one IIFE deep
  const walk = (n, depth) => {
    if (!n || typeof n.type !== "string" || depth > 3) return;
    if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression" && !n.left.computed
      && n.left.object.type === "Identifier" && /^(window|globalThis|self)$/.test(n.left.object.name)) {
      const name = n.left.property.name;
      if (/^[A-Z]/.test(name) && !globals.some((g) => g.name === name)) globals.push({ name, line: n.loc.start.line, kind: "window", members: exportedMembers(n.right) });
    }
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "range") continue;
      const v = n[k];
      const d = /Function/.test(n.type) ? depth + 1 : depth;
      if (Array.isArray(v)) v.forEach((x) => walk(x, d)); else if (v && typeof v.type === "string") walk(v, d);
    }
  };
  walk(ast, 0);
  // unresolved references → name -> {count, members:Set, line}
  const refs = new Map();
  const sm = analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
  const gs = sm.globalScope;
  const own = new Set(globals.map((g) => g.name));
  const parents = new Map();
  const index = (n, p) => { if (!n || typeof n.type !== "string") return; if (p) parents.set(n, p); for (const k of Object.keys(n)) { if (k === "loc" || k === "range") continue; const v = n[k]; if (Array.isArray(v)) v.forEach((x) => index(x, n)); else if (v && typeof v.type === "string") index(v, n); } };
  index(ast, null);
  const note = (name, id) => {
    if (own.has(name)) return;
    const r = refs.get(name) || { count: 0, members: new Set(), line: id.loc.start.line };
    r.count++;
    const p = parents.get(id);
    if (p?.type === "MemberExpression" && p.object === id && !p.computed && p.property.name) r.members.add(p.property.name);
    refs.set(name, r);
  };
  for (const r of gs.through) note(r.identifier.name, r.identifier);
  // `window.Foo` / `typeof Foo` style reads resolve through the window object too
  for (const [n, p] of parents) {
    if (n.type === "Identifier" && p.type === "MemberExpression" && p.property === n && !p.computed
      && p.object.type === "Identifier" && /^(window|globalThis)$/.test(p.object.name) && /^[A-Z]/.test(n.name)) note(n.name, n);
  }
  return { globals, refs };
}

// ── symbols via apex-lsp (documentSymbol over the tsc project) ─────────────
async function lspGlobals(files) {
  const { Lsp } = await import("../mcp/lsp-mcp.mjs");
  const lsp = new Lsp();
  await lsp.prepare();
  const out = new Map();
  try {
    for (const f of files) {
      const tree = await lsp.outlineOf(f).catch(() => []);
      out.set(f, tree.filter((n) => n.name && !/^<|callback$/.test(n.name)).map((n) => ({
        name: n.name, line: n.range.start.line + 1, kind: `lsp:${n.kind}`,
        members: (n.children || []).map((c) => c.name).filter((x) => x && !/^</.test(x)),
      })));
    }
  } finally { lsp.stop(); }
  return out;
}

// ── owners: skills, rules, nested AGENTS.md ────────────────────────────────
function frontPaths(src) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] || "";
  const m = /^paths:\n((?:\s+- .*\n?)+)/m.exec(fm);
  return m ? m[1].split("\n").map((l) => l.replace(/^\s+- /, "").replace(/^["']|["']$/g, "").trim()).filter(Boolean) : [];
}
function globRe(g) {
  return new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
}
function listMd(dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...listMd(rel)); else if (e.name.endsWith(".md")) out.push(rel);
  }
  return out;
}
export function ownership() {
  const skills = [];
  for (const d of fs.readdirSync(path.join(ROOT, ".claude/skills"), { withFileTypes: true })) {
    if (!d.isDirectory() || !exists(`.claude/skills/${d.name}/SKILL.md`)) continue;
    const skillMd = read(`.claude/skills/${d.name}/SKILL.md`);
    const text = listMd(`.claude/skills/${d.name}`).map(read).join("\n");
    const desc = /^description:\s*"?(.*?)"?\s*$/m.exec(skillMd)?.[1] || "";
    skills.push({ name: d.name, desc, globs: frontPaths(skillMd).map(globRe), mentions: new Set(text.match(/\bjs\/[\w./-]+\.js\b/g) || []) });
  }
  const rules = listMd(".claude/rules").map((r) => ({ name: path.basename(r, ".md"), globs: frontPaths(read(r)).map(globRe) }));
  const agentsMd = [];
  (function find(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) find(`${dir}/${e.name}`); else if (e.name === "AGENTS.md") agentsMd.push(dir);
    }
  })("js");
  return { skills, rules, agentsMd };
}

// ── tests ──────────────────────────────────────────────────────────────────
function testFiles() {
  const out = [];
  for (const dir of ["tests/unit", "tests/specs"]) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(path.join(ROOT, dir))) if (/\.(test\.mjs|spec\.js|mjs|cjs|js)$/.test(f)) out.push(`${dir}/${f}`);
  }
  return out.sort();
}

// ── churn ──────────────────────────────────────────────────────────────────
function churn(days = 30) {
  const counts = new Map();
  let oldest = null, commits = 0;
  try {
    const log = execFileSync("git", ["log", `--since=${days} days ago`, "--format=@%cs", "--name-only", "--", "js"], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 << 20 });
    for (const line of log.split("\n")) {
      if (line.startsWith("@")) { oldest = line.slice(1); commits++; continue; }
      if (line) counts.set(line, (counts.get(line) || 0) + 1);
    }
  } catch { /* no git: churn stays 0 */ }
  return { counts, oldest, commits };
}

// ── build ──────────────────────────────────────────────────────────────────
export async function buildMap({ lsp = false, flows = null } = {}) {
  const manifest = require("../manifest.cjs");
  const mods = manifestModules(manifest);
  const fullOrder = new Map(manifest.FULL.filter((f) => f !== "@circuits").map((f, i) => [f, i]));
  const files = [...mods.keys()].filter(exists);
  const missing = [...mods.keys()].filter((f) => !exists(f));
  const own = ownership();
  const ch = churn();
  const tests = testFiles().map((t) => ({ t, src: read(t) }));
  const { pick } = await import("../ci/pick-tests.mjs");
  let gctx = null;
  try { gctx = await import("../check/check-gctx.mjs"); } catch { /* optional */ }
  const ctxFiles = new Set(gctx ? gctx.ctxModuleFiles() : []);

  const scans = new Map(files.map((f) => [f, scanFile(f)]));
  const lspSyms = lsp ? await lspGlobals(files) : null;
  // global name -> the file(s) a reference resolves to. A stub (js/audio/stub.js, js/race/session-stub.js) that
  // pre-declares a lazy module's global never wins over the real module; an accumulator global declared by many
  // files (`TrackDefs`, `TrackScenery`, the GLX/TLX shader bags) resolves to its first real declarer only.
  const declarers = new Map();
  for (const f of files) for (const g of scans.get(f).globals) (declarers.get(g.name) || declarers.set(g.name, []).get(g.name)).push(f);
  const defOf = new Map();
  for (const [name, fs_] of declarers) {
    const real = fs_.filter((f) => !/(^|[/-])stub\.js$/.test(f));
    const pickFrom = real.length ? real : fs_;
    defOf.set(name, pickFrom.length > 3 ? [pickFrom[0]] : pickFrom);
  }

  const nodes = [], edges = [];
  for (const f of files) {
    const src = read(f), s = scans.get(f);
    const facade = [];
    if (ctxFiles.has(f)) {
      const seen = new Map();
      for (const h of gctx.collectUsage(f)) for (const n of h.names) {
        const k = `${n}`; const e = seen.get(k) || { member: n, read: 0, write: 0, line: h.line };
        if (/write/i.test(h.kind)) e.write++; else e.read++;
        seen.set(k, e);
      }
      facade.push(...seen.values());
      if (f !== manifest.PATHS.GAME && facade.length) edges.push({ from: f, to: manifest.PATHS.GAME, type: "facade", members: facade.map((x) => x.member).sort() });
    }
    const testedBy = tests.filter(({ src: t }) => t.includes(f) || t.includes(`/${f}`)).map(({ t }) => t);
    for (const t of testedBy) edges.push({ from: f, to: t, type: "tested-by" });
    const owners = [
      ...own.skills.filter((k) => k.globs.some((re) => re.test(f)) || k.mentions.has(f)).map((k) => `skill:${k.name}`),
      ...own.rules.filter((r) => r.globs.some((re) => re.test(f))).map((r) => `rule:${r.name}`),
      ...own.agentsMd.filter((d) => f.startsWith(d + "/")).map((d) => `agents:${d}/AGENTS.md`),
    ];
    let symbols = (lspSyms?.get(f) || s.globals).map((g) => ({ name: g.name, line: g.line, kind: g.kind, members: g.members.slice(0, 400),
      ...((declarers.get(g.name) || []).length > 1 ? { declaredBy: declarers.get(g.name).length } : {}) }));
    if (f === manifest.PATHS.GAME && gctx) {
      // game.js is one async IIFE: its public surface is the `const G = {…}` façade it hands every create(G) module.
      const g = gctx.scanGameCtx();
      symbols = [{ name: "G", line: g.line, kind: "facade", members: [...g.members.keys()].sort() }, ...symbols];
    }
    const groups = [...pick([f]).keys()].sort();
    nodes.push({
      id: f, layer: layerOf(f), area: areaOf(f), bundle: mods.get(f), order: fullOrder.get(f) ?? null,
      bytes: Buffer.byteLength(src), lines: src.split("\n").length, churn: ch.counts.get(f) || 0,
      doc: headerDoc(src), owners, groups, tests: testedBy, symbols, facade: facade.map((x) => x.member).sort(),
      ...(s.error ? { error: s.error } : {}),
    });
    for (const [name, r] of s.refs) {
      for (const to of defOf.get(name) || []) {
        if (to === f) continue;
        edges.push({ from: f, to, type: "calls", symbol: name, members: [...r.members].sort(), count: r.count, line: r.line });
      }
    }
  }
  const known = new Set(files);
  for (const e of manifestEdges(manifest)) if (known.has(e.from) && known.has(e.to)) edges.push({ from: e.from, to: e.to, type: "loads-before", list: e.list });

  // in/out degree for the explorer's sorting
  const deg = new Map(files.map((f) => [f, { in: 0, out: 0 }]));
  for (const e of edges) if (e.type === "calls") { deg.get(e.from).out++; deg.get(e.to).in++; }
  for (const n of nodes) { n.callsIn = deg.get(n.id).in; n.callsOut = deg.get(n.id).out; }

  return {
    meta: {
      generator: "tools/map/build-project-map.mjs", head: git(["rev-parse", "--short", "HEAD"]), generated: new Date().toISOString(),
      symbols: lsp ? "apex-lsp documentSymbol" : "espree + eslint-scope", nodes: nodes.length, edges: edges.length,
      churnDays: 30, churnSince: ch.oldest, churnCommits: ch.commits, missing,
      skills: own.skills.map((k) => ({ name: k.name, desc: k.desc })),
    },
    nodes, edges, flows: checkFlows(flows || []),
  };
}
/** Curated flow steps carry a line; flag one whose file is gone or whose line no longer names its symbol. */
export function checkFlows(flows) {
  return flows.map((fl) => ({ ...fl, steps: fl.steps.map((st) => {
    if (!exists(st.file)) return { ...st, stale: "file gone" };
    const lines = read(st.file).split("\n");
    if (st.line > lines.length) return { ...st, stale: "line past end" };
    const word = (/[A-Za-z_$][\w$]*(?=[^\w$]*$)/.exec(st.symbol.replace(/\(.*$/, "").replace(/ .*$/, "")) || [])[0];
    const near = lines.slice(Math.max(0, st.line - 3), st.line + 2).join("\n");
    if (!word || near.includes(word) || enclosingNames(st.file, st.line).includes(word)) return st;
    return { ...st, stale: `'${word}' neither within 2 lines nor an enclosing function` };
  }) }));
}
const fnCache = new Map();
/** Names of the functions whose body holds `line` (declarations, `const f = () =>`, `obj.f = function`, methods). */
function enclosingNames(rel, line) {
  if (!rel.endsWith(".js")) return [];
  let spans = fnCache.get(rel);
  if (!spans) {
    spans = [];
    let ast; try { ast = parseScript(read(rel)); } catch { ast = null; }
    const visit = (n, name) => {
      if (!n || typeof n.type !== "string") return;
      if (/Function/.test(n.type)) spans.push([n.loc.start.line, n.loc.end.line, n.id?.name || name]);
      for (const k of Object.keys(n)) {
        if (k === "loc" || k === "range") continue;
        const v = n[k];
        const nm = n.type === "VariableDeclarator" && k === "init" ? n.id.name
          : (n.type === "Property" || n.type === "MethodDefinition") && k === "value" ? n.key.name
          : n.type === "AssignmentExpression" && k === "right" ? n.left.property?.name || n.left.name : null;
        if (Array.isArray(v)) v.forEach((x) => visit(x, null)); else visit(v, nm);
      }
    };
    visit(ast, null);
    fnCache.set(rel, spans);
  }
  return spans.filter(([a, b, nm]) => nm && a <= line && line <= b).map((x) => x[2]);
}
function git(args) { try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } }

async function main(argv) {
  const flag = (f) => argv.includes(f), val = (f) => argv.find((a) => a.startsWith(f + "="))?.slice(f.length + 1);
  const flowsPath = val("--flows");
  const flowsFile = flowsPath ? path.resolve(flowsPath) : path.join(ROOT, "tools/map/flows.json");
  const flows = fs.existsSync(flowsFile) ? JSON.parse(fs.readFileSync(flowsFile, "utf8")) : null;
  const map = await buildMap({ lsp: flag("--lsp"), flows });
  const json = JSON.stringify(map);
  if (flag("--stdout")) { process.stdout.write(json + "\n"); return; }
  const out = path.join(ROOT, val("--out") || "artifacts/project-map");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "project-map.json"), JSON.stringify(map, null, 1));
  if (flag("--html")) {
    const tpl = fs.readFileSync(path.join(ROOT, "tools/map/explorer.html"), "utf8");
    // the page derives tested-by from node.tests, so those edges stay out of the inlined copy
    const slim = JSON.stringify({ ...map, edges: map.edges.filter((e) => e.type !== "tested-by") }).replace(/</g, "\\u003c");
    fs.writeFileSync(path.join(out, "index.html"), tpl.replace("/*__MAP_DATA__*/null", () => slim));
  }
  process.stdout.write(`project-map: ${map.meta.nodes} nodes, ${map.meta.edges} edges → ${path.relative(ROOT, out)}/\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main(process.argv.slice(2)).catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });
}
