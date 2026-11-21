#!/usr/bin/env node
/**
 * @doc Holds `types/game-ctx.d.ts` to the real `G` façade and every module's use of `G` to the `.d.ts` (espree, optional tsc).
 * @skill check-changes
 * check-gctx.mjs — hold types/game-ctx.d.ts to the real G façade, and hold every
 * module's use of G to types/game-ctx.d.ts.
 *
 *   node tools/check/check-gctx.mjs            # both legs; exit 1 on any drift
 *   node tools/check/check-gctx.mjs --no-tsc   # parity leg only (no TypeScript needed)
 *   node tools/check/check-gctx.mjs --json     # machine-readable result
 *
 * Bedrock Phase 1 ("Types" — docs/research/ARCHITECTURE-REDESIGN-2026-08.md).
 * js/game.js hands ONE object of live getters/setters to every extracted module
 * (`Module.create(G)`). Nothing checked that surface until now, and the defects
 * that produced are on the record: `countT` written by netStartArm for months
 * with no accessor to receive it, a duplicate `setLightTune` key that was dead
 * the day it was written. Both are the same shape — a name on one side of the
 * façade with nothing on the other — and both are decidable statically.
 *
 * LEG 1, PARITY (no toolchain, always runs). espree parses `const G = {…}` out
 * of js/game.js and the `interface GameCtx {…}` block out of the .d.ts, and
 * asserts the two member sets are equal with matching writability. The
 * writability rule is mechanical so that it can be checked at all:
 *     readonly  <=>  a getter with no setter, or a plain data property
 *     writable  <=>  an accessor PAIR (get + set)
 * It also asserts the `declare const X: GameModuleFactory` roster equals the set
 * of manifest modules that actually export a create() taking a ctx.
 *
 * LEG 2, USAGE (needs tsc; skipped with a notice when absent). eslint-scope
 * resolves every reference to each module's own `create(ctx)` parameter, to the
 * parameter of every same-file helper the ctx is handed to, and to the parameter
 * of every cross-file entry `X.fn(ctx)` (scanCtxEntries, #5980) — a
 * scope-accurate resolution, NOT a `\bG\.` grep, so a local named `ctx` (the 2D
 * canvas context in the minimap) cannot masquerade as the façade. Each resolved
 * member read, member write and `const {…} = ctx` destructure is emitted into a
 * generated shadow (artifacts/gctx/usage.ts) typed against GameCtx, and
 * `tsc --noEmit` is run over it. Reading a member that does not exist and
 * writing one declared readonly are both compile errors; diagnostics are mapped
 * back to the real file:line before printing.
 *
 * WHY A SHADOW instead of `// @ts-check` on the modules themselves: Phase 1 is
 * zero-runtime-bytes. Binding a module's `create(G)` parameter to GameCtx needs
 * a JSDoc line IN that file, which is a js/ edit and drags the ?v=N bump ritual
 * into a types-only change. The shadow gets the same names checked with the
 * product bytes untouched; per-file `@ts-check` opt-in is Phase 1's second half,
 * once the tranche is chosen. What the shadow does NOT check is the TYPES of
 * expressions inside the modules — only that every name they take off the façade
 * exists and is writable when written.
 *
 * Exit codes: 0 clean; 1 drift, a parse failure, or a tsc diagnostic.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as espree from "espree";
import * as escope from "eslint-scope";

const require = createRequire(import.meta.url);
const MANIFEST = require("../manifest.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DTS = "types/game-ctx.d.ts";
const GAME = MANIFEST.PATHS.GAME;
const OUT_DIR = "artifacts/gctx";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const parse = (src) => espree.parse(src, { ecmaVersion: 2022, loc: true, range: true });

// game.js is 8 k lines and every leg below wants it; the module files are parsed
// twice (factory scan, usage scan). Parsing is the whole cost of this check, so
// each file is parsed exactly once per process — that is the difference between
// this suite costing ~2 s and ~8 s inside test:tooling-fast.
const astCache = new Map();
let factoryCache = null;
let entryCache = null;
const parseFile = (rel) => {
  if (!astCache.has(rel)) astCache.set(rel, parse(read(rel)));
  return astCache.get(rel);
};
// The candidate modules come from the MANIFEST, not from a directory listing:
// every rostered file (FULL, the DEFERRED backends, every LAZY_* roster) whose
// source DEFINES a `function create(<param>)` — the one shape scanRealFactories()
// and collectUsage() resolve — wherever it sits. A moved file is still scanned;
// a file that never spells create() that way cannot have taken the ctx. The
// circuit defs and their scenery closures are data and are dropped by ROSTER
// membership (CIRCUITS / LAZY_SCENERY), not by path. The text prefilter is what
// keeps this inside its budget: parsing is the whole cost, and without it every
// circuit and shader file would go through espree for nothing.
// (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2 — tools rewritten before the move.)
// Both spellings of the factory: `function create(G) {` and the method shorthand
// `create(G) {` (or `create: function (G)`) inside the module's returned object —
// js/perf/soak-run.js and bench-run.js use the latter and were silently unchecked
// while only the first was recognised.
const CREATE_DEF = /\bfunction\s+create\s*\(\s*[A-Za-z_$]|^\s*create\s*(?::\s*function\s*)?\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{/m;
let moduleCache = null;
let rosterCache = null;
/** Every rostered js/ file that is code (not circuit data), before the create() prefilter. */
const rosteredFiles = () => {
  if (rosterCache) return rosterCache;
  const data = new Set([...MANIFEST.CIRCUITS.map(MANIFEST.circuitPath), ...MANIFEST.LAZY_SCENERY]);
  const rostered = [
    ...MANIFEST.FULL, ...Object.values(MANIFEST.DEFERRED).flat(), ...MANIFEST.LAZY_AGENT,
    ...MANIFEST.LAZY_RACE, ...(MANIFEST.LAZY_RACE_SESSION || []), ...(MANIFEST.LAZY_GARAGE_EXTERIOR || []),
    ...(MANIFEST.LAZY_AUDIO || []), ...MANIFEST.LAZY_DATA, ...MANIFEST.LAZY_NET,
    ...(MANIFEST.LAZY_EDITOR || []),
    ...(MANIFEST.LAZY_XR || []), ...(MANIFEST.LAZY_CAM_EDITOR || []),
    ...(MANIFEST.LAZY_CAREER_UI || []), ...(MANIFEST.LAZY_UI_PRESETS || []), ...(MANIFEST.LAZY_SAVES_DATA || []), ...(MANIFEST.LAZY_RESULTS_SHEET || []),
    ...(MANIFEST.LAZY_PERF || []),
    ...(MANIFEST.LAZY_REAL_RACE || []),
  ];
  rosterCache = rostered.filter((rel) => rel !== GAME && !data.has(rel));
  return rosterCache;
};
const moduleFiles = () => {
  if (moduleCache) return moduleCache;
  moduleCache = rosteredFiles().filter((rel) => CREATE_DEF.test(read(rel)));
  return moduleCache;
};

/**
 * The function node is a module factory `create(<ident>)`: a declaration or named
 * expression `function create(G)`, OR the value of a `create` property — method
 * shorthand `create(G) {…}`, `create: function (G) {…}` or `create: (G) => …`.
 */
function isCreateFn(n, parent) {
  if (n.type !== "FunctionDeclaration" && n.type !== "FunctionExpression" && n.type !== "ArrowFunctionExpression") return false;
  if (!n.params.length || n.params[0].type !== "Identifier") return false;
  if (n.id && n.id.name === "create") return true;
  return Boolean(parent && parent.type === "Property" && parent.value === n && !parent.computed
    && ((parent.key.type === "Identifier" && parent.key.name === "create") || parent.key.value === "create"));
}

function walk(node, visit, parent = null) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node, parent);
  for (const key in node) {
    if (key === "parent") continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) walk(c, visit, node.type ? node : parent); }
    else if (v && typeof v === "object" && v.type) walk(v, visit, node.type ? node : parent);
  }
}

// ── Leg 1a: the real façade ──────────────────────────────────────────────────

/** Members of `const G = {…}` in js/game.js: name -> {writable, line}. */
export function scanGameCtx() {
  const ast = parseFile(GAME);
  let obj = null;
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === "G"
        && n.init && n.init.type === "ObjectExpression") obj = n.init;
  });
  if (!obj) throw new Error(`${GAME}: no \`const G = { … }\` object literal found`);
  const out = new Map();
  const dupes = [];
  for (const p of obj.properties) {
    if (p.type !== "Property") throw new Error(`${GAME}:${p.loc.start.line}: spread in the G literal is not supported by the parity check`);
    const name = p.key.type === "Identifier" ? p.key.name : String(p.key.value);
    const prev = out.get(name);
    if (prev) {
      // Two accessors of DIFFERENT kinds are the get/set pair; anything else is
      // a duplicate key, i.e. one of them is dead. That is exactly the dead
      // `setLightTune` shape, so it is reported rather than merged away.
      if (!(prev.kinds.has("get") && p.kind === "set") && !(prev.kinds.has("set") && p.kind === "get")) {
        dupes.push(`${GAME}:${p.loc.start.line}: duplicate G key "${name}" (first at line ${prev.line}) — one of the two is dead`);
      }
      prev.kinds.add(p.kind);
      continue;
    }
    out.set(name, { name, kinds: new Set([p.kind]), line: p.loc.start.line });
  }
  const members = new Map();
  for (const e of out.values()) {
    members.set(e.name, { name: e.name, line: e.line, writable: e.kinds.has("get") && e.kinds.has("set") });
  }
  return { members, dupes, line: obj.loc.start.line };
}

// ── Leg 1b: the declared façade ──────────────────────────────────────────────

const MEMBER_RE = /^ {2}(readonly )?([A-Za-z_$][A-Za-z0-9_$]*)(\?)?: (.+);$/;

/** Members of `interface GameCtx {…}` in the .d.ts: name -> {writable, line}. */
export function scanDts() {
  const lines = read(DTS).split("\n");
  const start = lines.findIndex((l) => l.startsWith("interface GameCtx {"));
  if (start < 0) throw new Error(`${DTS}: no \`interface GameCtx {\` at column 0`);
  const members = new Map();
  const errors = [];
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l === "}") { end = i; break; }
    const t = l.trim();
    if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
    const m = MEMBER_RE.exec(l);
    if (!m) {
      errors.push(`${DTS}:${i + 1}: not a single-line GameCtx member — the parity check requires \`  [readonly ]name: type;\` on one line: ${t.slice(0, 70)}`);
      continue;
    }
    if (members.has(m[2])) errors.push(`${DTS}:${i + 1}: duplicate member "${m[2]}"`);
    members.set(m[2], { name: m[2], line: i + 1, writable: !m[1], type: m[4] });
  }
  if (end < 0) throw new Error(`${DTS}: \`interface GameCtx {\` is never closed by a \`}\` at column 0`);
  return { members, errors };
}

/** Members of `const els = {…}` in js/game.js: name -> {line}. */
export function scanGameEls(source = null, label = GAME) {
  const ast = source == null ? parseFile(GAME) : parse(source);
  let obj = null;
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === "els"
        && n.init && n.init.type === "ObjectExpression" && !obj) obj = n.init;
  });
  if (!obj) throw new Error(`${label}: no \`const els = { … }\` object literal found`);
  const members = new Map();
  for (const p of obj.properties) {
    if (p.type !== "Property") continue;             // a spread would be a shell bug, not a member
    const name = p.key.type === "Identifier" ? p.key.name : String(p.key.value);
    if (!members.has(name)) members.set(name, { name, line: p.loc.start.line });
  }
  return { members, line: obj.loc.start.line };
}

// GameEls packs several declarations per line (`hud: HTMLElement; pos: …;`), so
// it cannot use GameCtx's one-member-per-line MEMBER_RE. Split on `;` instead —
// the interface is all one-line `name: Type` members, no methods, no generics.
const ELS_MEMBER_RE = /^([A-Za-z_$][A-Za-z0-9_$]*)\??:\s*[A-Za-z_$][\w.<>[\]|\s]*$/;

/** Members of `interface GameEls {…}` in the .d.ts: name -> {line}. */
export function scanDtsEls(source = null, label = DTS) {
  const lines = (source == null ? read(DTS) : source).split("\n");
  const start = lines.findIndex((l) => l.startsWith("interface GameEls {"));
  if (start < 0) throw new Error(`${label}: no \`interface GameEls {\` at column 0`);
  const members = new Map();
  const errors = [];
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "}") { end = i; break; }
    const t = lines[i].trim();
    if (!t || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
    for (const part of t.split(";")) {
      const decl = part.trim();
      if (!decl) continue;
      const m = ELS_MEMBER_RE.exec(decl);
      if (!m) { errors.push(`${label}:${i + 1}: not a \`name: Type\` member: ${decl.slice(0, 60)}`); continue; }
      if (members.has(m[1])) errors.push(`${label}:${i + 1}: duplicate member "${m[1]}"`);
      members.set(m[1], { name: m[1], line: i + 1 });
    }
  }
  if (end < 0) throw new Error(`${label}: \`interface GameEls {\` is never closed by a \`}\` at column 0`);
  return { members, errors };
}

/** Compare the nested shell contract. Kept separate so a negative fixture can
 * prove a missing nested id is rejected rather than merely exercising the
 * current, matching files. */
export function checkElsParity(realEls = scanGameEls(), dtsEls = scanDtsEls(), gameLabel = GAME, dtsLabel = DTS) {
  const problems = [...dtsEls.errors];
  for (const [name, m] of realEls.members) {
    if (!dtsEls.members.has(name)) problems.push(`${gameLabel}:${m.line}: els id "${name}" is not declared in ${dtsLabel}'s GameEls`);
  }
  for (const [name, d] of dtsEls.members) {
    if (!realEls.members.has(name)) problems.push(`${dtsLabel}:${d.line}: GameEls declares "${name}", which is not a member of \`const els\` at ${gameLabel}:${realEls.line}`);
  }
  return problems;
}

/** The `declare const X: GameModuleFactory;` roster. */
export function scanDeclaredFactories() {
  const out = new Set();
  for (const l of read(DTS).split("\n")) {
    const m = /^declare const ([A-Za-z0-9_$]+): GameModuleFactory(<[^>]*>)?;$/.exec(l);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Modules that are really handed the ctx: every `X.create(<ctx>)` call site where
 * <ctx> resolves — through eslint-scope, so a comment or a same-named local can
 * neither add nor remove a row — to game.js's own `const G`, or to the `create()`
 * parameter of a module that is ITSELF such a factory (apex.js builds AgentView
 * off the ctx it was handed). Transitive from `const G`, as a worklist: a file's
 * create() parameter is followed only once its global is known to receive the
 * ctx, so gfx.js's `create(canvas)` handing the canvas to `TLX.create()` is not a
 * ctx factory, and neither is NetSession.create({transport}). The old form
 * followed EVERY create() parameter under js/game|net and was right only because
 * no module there happened to spell a non-ctx handoff that way.
 */
export function scanRealFactories() {
  if (factoryCache) return factoryCache;
  const out = new Map();
  const fileOf = new Map();
  for (const rel of moduleFiles()) { const g = moduleGlobal(rel); if (g && !fileOf.has(g)) fileOf.set(g, rel); }
  const queue = [GAME];
  const seen = new Set(queue);
  while (queue.length) {
    const rel = queue.shift();
    const ast = parseFile(rel);
    const parents = new Map();
    walk(ast, (n, p) => { if (p) parents.set(n, p); });
    const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
    const ctxVars = [];
    walk(ast, (n, parent) => {
      if (rel === GAME && n.type === "VariableDeclarator" && n.id.type === "Identifier"
          && n.id.name === "G" && n.init && n.init.type === "ObjectExpression") {
        for (const s of sm.scopes) { const v = s.variables.find((x) => x.name === "G" && x.defs.some((d) => d.node === n)); if (v) ctxVars.push(v); }
      }
      if (isCreateFn(n, parent)) {
        const scope = sm.acquire(n);
        const v = scope && scope.variables.find((x) => x.name === n.params[0].name);
        if (v) ctxVars.push(v);
      }
    });
    for (const v of ctxVars) {
      for (const ref of v.references) {
        const call = parents.get(ref.identifier);
        if (!call || call.type !== "CallExpression" || call.arguments[0] !== ref.identifier) continue;
        const callee = call.callee;
        if (callee.type !== "MemberExpression" || callee.computed
            || callee.property.type !== "Identifier" || callee.property.name !== "create"
            || callee.object.type !== "Identifier") continue;
        const g = callee.object.name;
        if (!out.has(g)) out.set(g, `${rel}:${call.loc.start.line}`);
        const next = fileOf.get(g);
        if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
  }
  factoryCache = out;
  return out;
}

// ── Leg 2: what the modules actually take off the façade ─────────────────────

/**
 * The closure of ctx bindings from `seeds`, through eslint-scope. THE CTX GETS
 * ALIASED: js/physics/incident-sim.js holds a module-level `let G = null` and its
 * create(ctx) does `G = ctx`, so following only the parameter binding missed every
 * one of that file's façade reads. Followed transitively:
 *   - `G = ctx` assignments and `const x = ctx` declarations;
 *   - SAME-FILE HELPERS (#5980): ctx as argument k of a call whose callee resolves
 *     to a function declared in this file (a FunctionDeclaration or a function-valued
 *     `const`) binds that function's parameter k. cooldown-lap.js's create(G) hands
 *     G to `sessionEligible(G)`, and every read in there was unchecked.
 * A member-expression stash (`this.ctx = ctx`) is not followed and does not occur in js/.
 */
function ctxClosure(seeds, { sm, parents, resolved }) {
  const out = [];
  const seen = new Set();
  const add = (v) => { if (v && !seen.has(v)) { seen.add(v); out.push(v); } };
  const variableForDef = (id) => sm.scopes.flatMap((s) => s.variables)
    .find((x) => x.defs.some((d) => d.name === id));
  for (const v of seeds) add(v);
  for (let i = 0; i < out.length; i++) {
    for (const ref of out[i].references) {
      const id = ref.identifier;
      const p = parents.get(id);
      if (!p) continue;
      if (p.type === "AssignmentExpression" && p.right === id && p.left.type === "Identifier") add(resolved.get(p.left));
      else if (p.type === "VariableDeclarator" && p.init === id && p.id.type === "Identifier") add(variableForDef(p.id));
      else if (p.type === "CallExpression" && p.callee.type === "Identifier") {
        const k = p.arguments.indexOf(id);
        const fnVar = k >= 0 ? resolved.get(p.callee) : null;
        if (!fnVar || fnVar.defs.length !== 1) continue;
        const d = fnVar.defs[0];
        const fn = d.type === "FunctionName" ? d.node
          : d.type === "Variable" && d.node.init && /Function/.test(d.node.init.type) ? d.node.init : null;
        add(paramVar(sm, fn, k));
      }
    }
  }
  return out;
}

/** The scope variable of parameter `k` of function node `fn`, when it is a plain Identifier. */
function paramVar(sm, fn, k) {
  if (!fn || !fn.params || !fn.params[k] || fn.params[k].type !== "Identifier") return null;
  const scope = sm.acquire(fn);
  return scope ? scope.variables.find((x) => x.name === fn.params[k].name) || null : null;
}

/**
 * The parameter bindings of the named entry functions `[{fn, argIndex}]` in one
 * file: a FunctionDeclaration, a `const fn = function/arrow`, or a non-computed
 * `fn` property whose value is a function (method shorthand included). Every
 * same-named definition is bound. Returns {vars, missing: [{fn, argIndex}]}.
 */
function entryParams(ast, sm, entries) {
  const vars = [];
  const missing = [];
  for (const e of entries) {
    const found = [];
    walk(ast, (n, parent) => {
      if (!/Function/.test(n.type)) return;
      const named = (n.type === "FunctionDeclaration" && n.id && n.id.name === e.fn)
        || (parent && parent.type === "VariableDeclarator" && parent.init === n && parent.id.type === "Identifier" && parent.id.name === e.fn)
        || (parent && parent.type === "Property" && parent.value === n && !parent.computed
          && ((parent.key.type === "Identifier" && parent.key.name === e.fn) || parent.key.value === e.fn));
      if (!named) return;
      const v = paramVar(sm, n, e.argIndex);
      if (v) found.push(v);
    });
    if (found.length) vars.push(...found); else missing.push(e);
  }
  return { vars, missing };
}

const analysisCache = new Map();
function analyzeFile(rel) {
  if (analysisCache.has(rel)) return analysisCache.get(rel);
  const ast = parseFile(rel);
  const parents = new Map();
  walk(ast, (n, p) => { if (p) parents.set(n, p); });
  const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
  const resolved = new Map();
  for (const s of sm.scopes) for (const r of s.references) if (r.resolved) resolved.set(r.identifier, r.resolved);
  const out = { ast, parents, sm, resolved };
  analysisCache.set(rel, out);
  return out;
}

/**
 * Cross-file ctx entries (#5980): every `X.<fn>(…, ctx, …)` call — any member
 * name, any argument index — where ctx resolves (ctxClosure) to game.js's `const G`
 * or to a binding that already holds the ctx, and X is a rostered module global.
 * `const factory = X` is followed one hop, and `Reflect.apply(X.fn, X, [ctx])`
 * is read as `X.fn(ctx)` (broadcast.js's TvGraphics hand-off). Transitive, as a
 * worklist: a file is re-scanned whenever it gains an entry.
 *
 * This is NOT the GameModuleFactory roster: scanRealFactories() stays the
 * create-only map the parity leg asserts against the `declare const` lines. An
 * entry only widens what the USAGE leg scans: ApexCam/ApexTrack/ApexLobby/
 * ApexNet.hooks(G, …), TvGraphics.create(G), the ceremony's helpers.
 * Returns { byFile: Map(rel -> [{global, fn, argIndex, at}]), rows: [...] }.
 */
export function scanCtxEntries() {
  if (entryCache) return entryCache;
  const fileOf = new Map();
  for (const rel of rosteredFiles()) { const g = moduleGlobal(rel); if (g && !fileOf.has(g)) fileOf.set(g, rel); }
  const createFiles = new Set(ctxModuleFiles());
  const byFile = new Map();
  const rows = [];
  const queue = [GAME, ...createFiles];
  const queued = new Set(queue);
  const aliasOf = (idNode, resolved) => {
    const v = resolved.get(idNode);
    if (v && v.defs.length === 1 && v.defs[0].type === "Variable") {
      const init = v.defs[0].node.init;
      if (init && init.type === "Identifier") return init.name;
    }
    return idNode.name;
  };
  while (queue.length) {
    const rel = queue.shift();
    queued.delete(rel);
    const { ast, parents, sm, resolved } = analyzeFile(rel);
    const seeds = [];
    walk(ast, (n, parent) => {
      if (rel === GAME && n.type === "VariableDeclarator" && n.id.type === "Identifier"
          && n.id.name === "G" && n.init && n.init.type === "ObjectExpression") {
        for (const sc of sm.scopes) { const v = sc.variables.find((x) => x.name === "G" && x.defs.some((d) => d.node === n)); if (v) seeds.push(v); }
      }
      if (createFiles.has(rel) && isCreateFn(n, parent)) seeds.push(paramVar(sm, n, 0));
    });
    seeds.push(...entryParams(ast, sm, byFile.get(rel) || []).vars);
    for (const v of ctxClosure(seeds, { sm, parents, resolved })) {
      for (const ref of v.references) {
        const id = ref.identifier;
        const p = parents.get(id);
        if (!p) continue;
        let member = null, k = -1;
        if (p.type === "CallExpression" && p.callee.type === "MemberExpression") {
          k = p.arguments.indexOf(id); member = p.callee;
        } else if (p.type === "ArrayExpression") {
          const call = parents.get(p);
          if (call && call.type === "CallExpression" && call.arguments[2] === p && call.callee.type === "MemberExpression"
              && call.callee.object.type === "Identifier" && call.callee.object.name === "Reflect"
              && call.callee.property.name === "apply") { k = p.elements.indexOf(id); member = call.arguments[0]; }
        }
        let g = null, fn = null;
        if (p.type === "CallExpression" && p.callee.type === "Identifier") {
          // `const { fn } = Y; … fn(ctx)` — a same-file call through another module's export.
          k = p.arguments.indexOf(id);
          const src = k >= 0 ? destructuredSource(resolved.get(p.callee)) : null;
          if (src) { g = src.global; fn = src.key; }
        } else if (k >= 0 && member && member.type === "MemberExpression" && !member.computed
            && member.object.type === "Identifier" && member.property.type === "Identifier") {
          g = aliasOf(member.object, resolved); fn = member.property.name;
        }
        if (!g) continue;
        let target = fileOf.get(g);
        if (!target) continue;                    // a built-in or an unrostered name: not a module hand-off
        // A module that re-exports `fn` by `const { fn } = Y` hands the entry on to Y.
        const re = reexportOf(target, fn);
        if (re && fileOf.has(re)) { g = re; target = fileOf.get(re); }
        if (fn === "create" && k === 0 && createFiles.has(target)) continue;   // the factory roster already seeds it
        const list = byFile.get(target) || [];
        if (list.some((e) => e.fn === fn && e.argIndex === k)) continue;
        const row = { global: g, fn, argIndex: k, at: `${rel}:${id.loc.start.line}`, rel: target };
        list.push(row); byFile.set(target, list); rows.push(row);
        if (!queued.has(target)) { queued.add(target); queue.push(target); }
      }
    }
  }
  entryCache = { byFile, rows };
  return entryCache;
}

/** The module global a destructure reads from: `= Y` or `= Y.create(…)` (netplay.js takes QualiWire.create(EV)). */
function sourceGlobal(init) {
  if (!init) return null;
  if (init.type === "Identifier") return init.name;
  if (init.type === "CallExpression" && init.callee.type === "MemberExpression" && init.callee.object.type === "Identifier") return init.callee.object.name;
  return null;
}

/** `{global, key}` when variable `v` is bound by `const { key: v } = Global` (or `= Global.create(…)`), else null. */
function destructuredSource(v) {
  if (!v || v.defs.length !== 1 || v.defs[0].type !== "Variable") return null;
  const decl = v.defs[0].node;
  if (decl.id.type !== "ObjectPattern" || !sourceGlobal(decl.init)) return null;
  const prop = decl.id.properties.find((pr) => pr.type === "Property" && pr.value === v.defs[0].name);
  if (!prop || prop.computed || prop.key.type !== "Identifier") return null;
  return { global: sourceGlobal(decl.init), key: prop.key.name };
}

/** The global `rel` re-exports `fn` from (`const { fn } = Y` or `= Y.create(…)`) when it defines no `fn` function itself, else null. */
function reexportOf(rel, fn) {
  const { ast, sm } = analyzeFile(rel);
  if (!entryParams(ast, sm, [{ fn, argIndex: 0 }]).missing.length) return null;
  let out = null;
  walk(ast, (n) => {
    if (out || n.type !== "VariableDeclarator" || n.id.type !== "ObjectPattern" || !sourceGlobal(n.init)) return;
    if (n.id.properties.some((pr) => pr.type === "Property" && !pr.computed && pr.key.type === "Identifier" && pr.key.name === fn)) out = sourceGlobal(n.init);
  });
  return out;
}

/** How collectUsage() seeds a real file: its create() when it is a ctx factory, plus its entries. */
function usageOptions(rel) {
  return { create: ctxModuleFiles().includes(rel), entries: scanCtxEntries().byFile.get(rel) || [] };
}

/** Every file the usage leg scans: the ctx factories, then the files reached only through an entry. */
export function usageFiles() {
  const files = ctxModuleFiles();
  const extra = [...scanCtxEntries().byFile.keys()].filter((rel) => !files.includes(rel)).sort();
  return [...files, ...extra];
}

/**
 * Hand-offs the usage leg knowingly does NOT follow. Named, not guessed: the
 * argument is not a ctx binding the scope walk can resolve.
 */
export const UNCOVERED_ENTRIES = Object.freeze([
  "js/core/lazy-bundles.js: CrowdAudio.bind(ctxOrNull()) — the ctx arrives as a call result, not a binding",
  // An entry the coverage leg skips is named HERE, by `<file>: <Global>.<fn>(` — one list, its reason in the row.
  "js/ui/settings-export.js: SettingsExport.collect(mode, G) (js/agent/apex.js:2305) — a lazy-split forwarder (`fwd`, `...args`, settings-export.js:591); the real collect(mode, G) is js/ui/settings-export-body.js:54, unchecked until #6044",
]);

/** The UNCOVERED_ENTRIES row that names this entry, if any (an explicit, reasoned exception). */
const uncoveredRow = (rel, global, fn) => UNCOVERED_ENTRIES.find((u) => u.startsWith(`${rel}: ${global}.${fn}(`));

/** Every entry must bind a parameter in its target file, or its G use is unchecked. */
export function entryCoverage() {
  const problems = [];
  for (const [rel, list] of scanCtxEntries().byFile) {
    const { ast, sm } = analyzeFile(rel);
    for (const e of entryParams(ast, sm, list).missing) {
      const row = list.find((x) => x.fn === e.fn && x.argIndex === e.argIndex);
      if (uncoveredRow(rel, row.global, e.fn)) continue;   // named in UNCOVERED_ENTRIES, printed as "not followed"
      problems.push(`${rel}: \`${row.global}.${e.fn}\` receives the ctx as argument ${e.argIndex} (${row.at}) but no \`${e.fn}\` function with a plain parameter there was found — its G use is unchecked`);
    }
  }
  return problems;
}

/**
 * Every ctx member reference in one module, resolved through eslint-scope from
 * the `create()` parameter binding (and any cross-file entry binding,
 * scanCtxEntries()) rather than matched by name. `opts` = {create, entries:
 * [{fn, argIndex}]}; omitted, a real file is seeded from the scans and a fixture
 * `source` from its create() alone.
 * Returns [{ kind: "read"|"write"|"destructure"|"els…", names, line }].
 */
export function collectUsage(rel, source = null, opts = null) {
  const ast = source == null ? parseFile(rel) : parse(source);
  const parents = new Map();
  walk(ast, (n, p) => { if (p) parents.set(n, p); });
  const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });

  // identifier node -> the variable it resolves to, for alias-following.
  const resolved = new Map();
  for (const s of sm.scopes) for (const r of s.references) if (r.resolved) resolved.set(r.identifier, r.resolved);

  const elsVars = [];
  const elsSeen = new Set();
  const addEls = (v) => { if (v && !elsSeen.has(v)) { elsSeen.add(v); elsVars.push(v); } };
  const variableForDef = (id) => sm.scopes.flatMap((s) => s.variables)
    .find((x) => x.defs.some((d) => d.name === id));
  const o = opts || (source == null ? usageOptions(rel) : { create: true, entries: [] });
  const seeds = [];
  if (o.create) {
    walk(ast, (n, parent) => {
      if (!isCreateFn(n, parent)) return;
      const scope = sm.acquire(n);
      if (scope) seeds.push(scope.variables.find((x) => x.name === n.params[0].name));
    });
  }
  seeds.push(...entryParams(ast, sm, o.entries || []).vars);
  const ctxVars = ctxClosure(seeds, { sm, parents, resolved });

  const hits = [];
  for (const v of ctxVars) {
    for (const ref of v.references) {
      const id = ref.identifier;
      const p = parents.get(id);
      if (!p) continue;
      if (p.type === "MemberExpression" && p.object === id && !p.computed && p.property.type === "Identifier") {
        const gp = parents.get(p);
        const write = (gp && gp.type === "AssignmentExpression" && gp.left === p)
                   || (gp && gp.type === "UpdateExpression" && gp.argument === p);
        hits.push({ kind: write ? "write" : "read", names: [p.property.name], line: id.loc.start.line });
        if (p.property.name === "els") {
          if (gp && gp.type === "MemberExpression" && gp.object === p && !gp.computed
              && gp.property.type === "Identifier") {
            const ggp = parents.get(gp);
            const nestedWrite = (ggp && ggp.type === "AssignmentExpression" && ggp.left === gp)
              || (ggp && ggp.type === "UpdateExpression" && ggp.argument === gp);
            hits.push({ kind: nestedWrite ? "elsWrite" : "elsRead", names: [gp.property.name], line: id.loc.start.line });
          } else if (gp && gp.type === "VariableDeclarator" && gp.init === p) {
            if (gp.id.type === "Identifier") addEls(variableForDef(gp.id));
            else if (gp.id.type === "ObjectPattern") {
              const names = gp.id.properties.filter((prop) => prop.type === "Property" && !prop.computed
                && prop.key.type === "Identifier").map((prop) => prop.key.name);
              if (names.length) hits.push({ kind: "elsDestructure", names, line: id.loc.start.line });
            }
          } else if (gp && gp.type === "AssignmentExpression" && gp.right === p && gp.left.type === "Identifier") {
            addEls(resolved.get(gp.left));
          }
        }
      } else if (p.type === "VariableDeclarator" && p.init === id && p.id.type === "ObjectPattern") {
        const names = [];
        for (const prop of p.id.properties) {
          if (prop.type !== "Property" || prop.computed || prop.key.type !== "Identifier") continue;
          names.push(prop.key.name);
          if (prop.key.name === "els" && prop.value.type === "Identifier") addEls(variableForDef(prop.value));
        }
        if (names.length) hits.push({ kind: "destructure", names, line: id.loc.start.line });
      }
      // Aliases and helper arguments were followed by ctxClosure(). Anything else
      // (the whole ctx passed to another module, `ctx[expr]`, …) carries no member
      // name here; a cross-file hand-off is scanCtxEntries()' row, not this loop's.
      // `ctx[expr]` is extinct in js/ (Phase 0).
    }
  }
  // Follow local aliases of `G.els`, including `const { els } = G`, so nested
  // element names receive the same scope-accurate treatment as top-level G
  // members. Dynamic `els[id]` remains intentionally unchecked.
  for (let i = 0; i < elsVars.length; i++) {
    const v = elsVars[i];
    for (const ref of v.references) {
      const id = ref.identifier;
      const p = parents.get(id);
      if (!p) continue;
      if (p.type === "MemberExpression" && p.object === id && !p.computed && p.property.type === "Identifier") {
        const gp = parents.get(p);
        const write = (gp && gp.type === "AssignmentExpression" && gp.left === p)
          || (gp && gp.type === "UpdateExpression" && gp.argument === p);
        hits.push({ kind: write ? "elsWrite" : "elsRead", names: [p.property.name], line: id.loc.start.line });
      } else if (p.type === "VariableDeclarator" && p.init === id) {
        if (p.id.type === "Identifier") addEls(variableForDef(p.id));
        else if (p.id.type === "ObjectPattern") {
          const names = p.id.properties.filter((prop) => prop.type === "Property" && !prop.computed
            && prop.key.type === "Identifier").map((prop) => prop.key.name);
          if (names.length) hits.push({ kind: "elsDestructure", names, line: id.loc.start.line });
        }
      } else if (p.type === "AssignmentExpression" && p.right === id && p.left.type === "Identifier") {
        addEls(resolved.get(p.left));
      }
    }
  }
  return hits;
}

/** The one global a module file assigns, or null. */
function moduleGlobal(rel) {
  const src = read(rel);
  const m = /^(?:const|let|var) ([A-Za-z0-9_$]+) = \(/m.exec(src) || /^window\.([A-Za-z0-9_$]+) = \(/m.exec(src);
  return m ? m[1] : null;
}

/**
 * The module files whose create() really takes the ctx. Two files in js/ spell
 * create() the same way over a DIFFERENT argument — agentview-raster.js takes a
 * bespoke bag `{G, fail, resolveCamera, …}` and session.js takes `{transport}` —
 * and typing either bag as a GameCtx would invent drift that is not there.
 */
export function ctxModuleFiles() {
  const factories = scanRealFactories();
  return moduleFiles().filter((rel) => {
    const g = moduleGlobal(rel);
    return Boolean(g && factories.has(g));
  });
}

/**
 * Coverage: every global really handed the ctx (scanRealFactories) must resolve to
 * a rostered file that ctxModuleFiles() keeps AND whose create() parameter
 * collectUsage() binds. A factory spelled in a shape the scanners do not
 * recognise would otherwise be counted in the roster while its G use went
 * unchecked. Returns problem strings ([] when every factory is covered).
 */
export function factoryCoverage() {
  const checked = new Set(ctxModuleFiles());
  const fileOf = new Map();
  for (const rel of rosteredFiles()) { const g = moduleGlobal(rel); if (g && !fileOf.has(g)) fileOf.set(g, rel); }
  const problems = [];
  for (const [g, at] of scanRealFactories()) {
    const rel = fileOf.get(g);
    if (!rel) { problems.push(`${at}: \`${g}.create(ctx)\` is called but no rostered file defines \`${g}\` — its G use is unchecked`); continue; }
    if (!checked.has(rel)) { problems.push(`${rel}: \`${g}\` receives the ctx (${at}) but its create() is not in a shape the usage leg scans`); continue; }
    if (!hasCreateBinding(rel)) problems.push(`${rel}: \`${g}\` receives the ctx (${at}) but no create(<param>) binding was resolved`);
  }
  return problems;
}

function hasCreateBinding(rel) {
  let found = false;
  walk(parseFile(rel), (n, parent) => { if (!found && isCreateFn(n, parent)) found = true; });
  return found;
}

/** Generated shadow: the usage above, typed against GameCtx. */
export function emitShadow(units = null) {
  const list = units || usageFiles().map((rel) => ({ rel, hits: collectUsage(rel) }));
  const out = [
    "// GENERATED by tools/check/check-gctx.mjs — do not edit, do not commit.",
    "// One function per module; every statement is a G reference lifted from the",
    "// real source, with the file:line it came from. `__never` stands in for the",
    "// value at a write site: it is assignable to any type, so the only thing a",
    "// write can fail on is the member being readonly (or absent).",
    "/// <reference path=\"../../types/game-ctx.d.ts\" />",
    "declare const __never: never;",
    "",
  ];
  const map = [];                       // generated line (1-based) -> "rel:line"
  const push = (text, origin) => { out.push(text); map[out.length] = origin; };
  let total = 0;
  for (const { rel, hits } of list) {
    if (!hits.length) continue;
    total += hits.length;
    push(`function ${rel.replace(/[^A-Za-z0-9]/g, "_")}(G: GameCtx): void {`, null);
    for (const h of hits) {
      const origin = `${rel}:${h.line}`;
      if (h.kind === "read") push(`  void G.${h.names[0]};`, origin);
      else if (h.kind === "write") push(`  G.${h.names[0]} = __never;`, origin);
      else if (h.kind === "elsRead") push(`  void G.els.${h.names[0]};`, origin);
      else if (h.kind === "elsWrite") push(`  G.els.${h.names[0]} = __never;`, origin);
      else if (h.kind === "elsDestructure") push(`  { const { ${h.names.join(", ")} } = G.els; void [${h.names.join(", ")}]; }`, origin);
      else push(`  { const { ${h.names.join(", ")} } = G; void [${h.names.join(", ")}]; }`, origin);
    }
    push("}", null);
    push("", null);
  }
  return { text: out.join("\n") + "\n", map, sites: total, files: list.length };
}

/**
 * G members no module takes off the façade. The OTHER half of drift: `countT`
 * was a write with no accessor, `renderStatBars` is an accessor with no reader,
 * and only one of the two directions is visible to a type checker.
 *
 * Scope-accurate first, then a REGEX SUPPRESSOR: any name spelled `<ident>.name`
 * in any candidate module is struck off, so a consumer this tool cannot resolve (the ctx
 * that agentview-raster.js receives inside a bespoke bag) can never be reported
 * as dead. The regex only ever REMOVES rows — it can shrink this list, never
 * grow it — which keeps a false "delete this, nothing reads it" impossible.
 */
export function deadMembers() {
  const used = new Set();
  for (const rel of usageFiles()) for (const h of collectUsage(rel)) {
    if (h.kind.startsWith("els")) used.add("els");
    else for (const n of h.names) used.add(n);
  }
  const { members } = scanGameCtx();
  const dead = [...members.values()].filter((m) => !used.has(m.name));
  if (!dead.length) return dead;
  const blob = moduleFiles().map(read).join("\n");
  return dead.filter((m) => !new RegExp(`[A-Za-z0-9_$]\\.${m.name}\\b`).test(blob));
}

// ── The TypeScript leg ───────────────────────────────────────────────────────

/** Where a usable tsc lives, or null. Local install first, then PATH. */
export function findTsc() {
  const local = path.join(ROOT, "node_modules/typescript/lib/tsc.js");
  if (fs.existsSync(local)) return { cmd: process.execPath, args: [local], how: "node_modules/typescript" };
  const bin = path.join(ROOT, "node_modules/.bin/tsc");
  if (fs.existsSync(bin)) return { cmd: bin, args: [], how: "node_modules/.bin/tsc" };
  const probe = spawnSync("tsc", ["--version"], { encoding: "utf8" });
  if (!probe.error && probe.status === 0) return { cmd: "tsc", args: [], how: `PATH (${probe.stdout.trim()})` };
  return null;
}

const TSCONFIG = {
  compilerOptions: {
    noEmit: true, strict: true, target: "ES2022", lib: ["ES2022", "DOM"],
    types: [], skipLibCheck: false, forceConsistentCasingInFileNames: true,
  },
  files: ["usage.ts"],
};

export function runTsc(shadow = null, outDir = OUT_DIR) {
  const tsc = findTsc();
  if (!tsc) return { skipped: true, reason: "no TypeScript resolvable (no node_modules/typescript, no tsc on PATH)" };
  if (!shadow) shadow = emitShadow();
  const dir = path.join(ROOT, outDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "usage.ts"), shadow.text);
  fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2) + "\n");
  const r = spawnSync(tsc.cmd, [...tsc.args, "-p", path.join(dir, "tsconfig.json")], { encoding: "utf8", cwd: dir });
  if (r.error) return { skipped: true, reason: `tsc failed to launch: ${r.error.message}` };
  const raw = ((r.stdout || "") + (r.stderr || "")).trim();
  const errors = [];
  for (const l of raw.split("\n").filter(Boolean)) {
    // usage.ts(41,10): error TS2551: … -> rewrite onto the real source location
    const m = /^(?:.*[\\/])?usage\.ts\((\d+),\d+\): (.+)$/.exec(l);
    if (m) {
      const origin = shadow.map[Number(m[1])];
      errors.push(`${origin || `${outDir}/usage.ts:${m[1]}`}: ${m[2]}`);
    } else if (l.trim()) errors.push(l);
  }
  return { skipped: false, how: tsc.how, sites: shadow.sites, errors, ok: r.status === 0 && !errors.length };
}

// ── Driver ───────────────────────────────────────────────────────────────────

export function checkParity() {
  const real = scanGameCtx();
  const dts = scanDts();
  const problems = [...real.dupes, ...dts.errors];
  for (const [name, m] of real.members) {
    const d = dts.members.get(name);
    if (!d) { problems.push(`${GAME}:${m.line}: G member "${name}" is not declared in ${DTS}`); continue; }
    if (d.writable !== m.writable) {
      problems.push(m.writable
        ? `${DTS}:${d.line}: "${name}" is readonly but ${GAME}:${m.line} declares a get/set pair — drop the readonly`
        : `${DTS}:${d.line}: "${name}" is writable but ${GAME}:${m.line} has no setter — mark it readonly`);
    }
  }
  for (const [name, d] of dts.members) {
    if (!real.members.has(name)) problems.push(`${DTS}:${d.line}: "${name}" is declared but is not a member of \`const G\` at ${GAME}:${real.line}`);
  }
  // The SAME parity, one level down. GameCtx's check never reached els: the
  // usage leg records `G.els` and stops there (`G.els.pausemenu` collapses to
  // `els`), so eleven ids game.js resolves and hud.js/engineer.js read — the
  // tyre block, the pit cue, the announce trio — were simply absent from the
  // declared shell, and adding a twelfth would have been just as quiet.
  problems.push(...checkElsParity());

  const declared = scanDeclaredFactories();
  const realFac = scanRealFactories();
  for (const [g, at] of realFac) if (!declared.has(g)) problems.push(`${at}: \`${g}.create(ctx)\` is called but ${DTS} has no \`declare const ${g}: GameModuleFactory;\``);
  for (const g of declared) if (!realFac.has(g)) problems.push(`${DTS}: \`declare const ${g}: GameModuleFactory\` matches no \`${g}.create(ctx)\` call site`);
  problems.push(...factoryCoverage());
  problems.push(...entryCoverage());
  return { problems, memberCount: real.members.size, factoryCount: realFac.size, entryCount: scanCtxEntries().rows.length };
}

function main() {
  const argv = process.argv.slice(2);
  const parity = checkParity();
  const ts = argv.includes("--no-tsc") ? { skipped: true, reason: "--no-tsc" } : runTsc();
  const failed = parity.problems.length > 0 || (!ts.skipped && !ts.ok);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ ...parity, tsc: ts, ok: !failed }, null, 2));
    process.exit(failed ? 1 : 0);
  }
  console.log(`G surface: ${parity.memberCount} members, ${parity.factoryCount} create(ctx) modules, ${parity.entryCount} cross-file ctx entries`);
  if (parity.problems.length) {
    console.log(`\nFAÇADE DRIFT (${parity.problems.length}):`);
    for (const p of parity.problems) console.log("  " + p);
  } else console.log("parity: types/game-ctx.d.ts matches const G exactly");
  const dead = deadMembers();
  if (dead.length) {
    console.log(`\nDECLARED BUT UNREAD (${dead.length}) — reported here, ratcheted in tests/unit/game-ctx-surface.test.mjs:`);
    for (const m of dead) console.log(`  ${GAME}:${m.line}: G.${m.name} — no module reads it`);
  }
  if (ts.skipped) console.log(`\ntsc leg SKIPPED — ${ts.reason}`);
  else {
    console.log(`\ntsc: ${ts.how}, ${ts.sites} G reference sites checked`);
    for (const e of ts.errors) console.log("  " + e);
    if (ts.ok) console.log("  clean");
  }
  console.log(`\nnot followed (${UNCOVERED_ENTRIES.length}):`);
  for (const u of UNCOVERED_ENTRIES) console.log("  " + u);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
