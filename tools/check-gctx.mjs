#!/usr/bin/env node
/**
 * @doc Holds `types/game-ctx.d.ts` to the real `G` façade and every module's use of `G` to the `.d.ts` (espree, optional tsc).
 * @skill check-changes
 * check-gctx.mjs — hold types/game-ctx.d.ts to the real G façade, and hold every
 * module's use of G to types/game-ctx.d.ts.
 *
 *   node tools/check-gctx.mjs            # both legs; exit 1 on any drift
 *   node tools/check-gctx.mjs --no-tsc   # parity leg only (no TypeScript needed)
 *   node tools/check-gctx.mjs --json     # machine-readable result
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
 * of js/game|net files that actually export a create() taking a ctx.
 *
 * LEG 2, USAGE (needs tsc; skipped with a notice when absent). eslint-scope
 * resolves every reference to each module's own `create(ctx)` parameter — a
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
import { fileURLToPath } from "node:url";
import * as espree from "espree";
import * as escope from "eslint-scope";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DTS = "types/game-ctx.d.ts";
const GAME = "js/game.js";
const OUT_DIR = "artifacts/gctx";
const MODULE_DIRS = ["js/game", "js/net"];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const parse = (src) => espree.parse(src, { ecmaVersion: 2022, loc: true, range: true });

// game.js is 8 k lines and every leg below wants it; the module files are parsed
// twice (factory scan, usage scan). Parsing is the whole cost of this check, so
// each file is parsed exactly once per process — that is the difference between
// this suite costing ~2 s and ~8 s inside test:tooling-fast.
const astCache = new Map();
let factoryCache = null;
const parseFile = (rel) => {
  if (!astCache.has(rel)) astCache.set(rel, parse(read(rel)));
  return astCache.get(rel);
};
const moduleFiles = () => MODULE_DIRS.flatMap((dir) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith(".js")).sort().map((f) => `${dir}/${f}`));

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
 * neither add nor remove a row — to game.js's own `const G`, or to some module's
 * `create()` parameter (apex.js builds AgentView/AgentRaster off the ctx it was
 * handed). NetSession.create({transport}) is not a ctx factory and does not appear.
 */
export function scanRealFactories() {
  if (factoryCache) return factoryCache;
  const out = new Map();
  for (const rel of [GAME, ...moduleFiles()]) {
    const ast = parseFile(rel);
    const parents = new Map();
    walk(ast, (n, p) => { if (p) parents.set(n, p); });
    const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
    const ctxVars = [];
    walk(ast, (n) => {
      if (rel === GAME && n.type === "VariableDeclarator" && n.id.type === "Identifier"
          && n.id.name === "G" && n.init && n.init.type === "ObjectExpression") {
        for (const s of sm.scopes) { const v = s.variables.find((x) => x.name === "G" && x.defs.some((d) => d.node === n)); if (v) ctxVars.push(v); }
      }
      if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression")
          && n.id && n.id.name === "create" && n.params.length && n.params[0].type === "Identifier") {
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
        if (!out.has(callee.object.name)) out.set(callee.object.name, `${rel}:${call.loc.start.line}`);
      }
    }
  }
  factoryCache = out;
  return out;
}

// ── Leg 2: what the modules actually take off the façade ─────────────────────

/**
 * Every ctx member reference in one module, resolved through eslint-scope from
 * the `create()` parameter binding rather than matched by name.
 * Returns [{ kind: "read"|"write"|"destructure", names, line }].
 */
export function collectUsage(rel) {
  const ast = parseFile(rel);
  const parents = new Map();
  walk(ast, (n, p) => { if (p) parents.set(n, p); });
  const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });

  // identifier node -> the variable it resolves to, for alias-following below.
  const resolved = new Map();
  for (const s of sm.scopes) for (const r of s.references) if (r.resolved) resolved.set(r.identifier, r.resolved);

  const ctxVars = [];
  const seen = new Set();
  const add = (v) => { if (v && !seen.has(v)) { seen.add(v); ctxVars.push(v); } };
  walk(ast, (n) => {
    if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression")
        && n.id && n.id.name === "create" && n.params.length && n.params[0].type === "Identifier") {
      const scope = sm.acquire(n);
      if (!scope) return;
      add(scope.variables.find((x) => x.name === n.params[0].name));
    }
  });

  const hits = [];
  // Queue, not a fixed list: THE CTX GETS ALIASED. js/game/incidentsim.js holds a
  // module-level `let G = null` and its create(ctx) does `G = ctx`, so following
  // only the parameter binding missed every one of that file's façade reads —
  // a checker that silently covers less than it claims. Assignments and
  // `const x = ctx` declarations are followed transitively; a member-expression
  // stash (`this.ctx = ctx`) is not, and does not occur in js/.
  for (let i = 0; i < ctxVars.length; i++) {
    const v = ctxVars[i];
    for (const ref of v.references) {
      const id = ref.identifier;
      const p = parents.get(id);
      if (!p) continue;
      if (p.type === "MemberExpression" && p.object === id && !p.computed && p.property.type === "Identifier") {
        const gp = parents.get(p);
        const write = (gp && gp.type === "AssignmentExpression" && gp.left === p)
                   || (gp && gp.type === "UpdateExpression" && gp.argument === p);
        hits.push({ kind: write ? "write" : "read", names: [p.property.name], line: id.loc.start.line });
      } else if (p.type === "VariableDeclarator" && p.init === id && p.id.type === "ObjectPattern") {
        const names = [];
        for (const prop of p.id.properties) {
          if (prop.type !== "Property" || prop.computed || prop.key.type !== "Identifier") continue;
          names.push(prop.key.name);
        }
        if (names.length) hits.push({ kind: "destructure", names, line: id.loc.start.line });
      } else if (p.type === "AssignmentExpression" && p.right === id && p.left.type === "Identifier") {
        add(resolved.get(p.left));            // `G = ctx` inside create()
      } else if (p.type === "VariableDeclarator" && p.init === id && p.id.type === "Identifier") {
        add(sm.scopes.flatMap((s) => s.variables).find((x) => x.defs.some((d) => d.name === p.id)));
      }
      // Anything else (the whole ctx passed on, `ctx[expr]`, …) carries no member
      // name and is not checkable here. `ctx[expr]` is extinct in js/ (Phase 0).
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

/** Generated shadow: the usage above, typed against GameCtx. */
export function emitShadow() {
  const files = ctxModuleFiles();
  const out = [
    "// GENERATED by tools/check-gctx.mjs — do not edit, do not commit.",
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
  for (const rel of files) {
    const hits = collectUsage(rel);
    if (!hits.length) continue;
    total += hits.length;
    push(`function ${rel.replace(/[^A-Za-z0-9]/g, "_")}(G: GameCtx): void {`, null);
    for (const h of hits) {
      const origin = `${rel}:${h.line}`;
      if (h.kind === "read") push(`  void G.${h.names[0]};`, origin);
      else if (h.kind === "write") push(`  G.${h.names[0]} = __never;`, origin);
      else push(`  { const { ${h.names.join(", ")} } = G; void [${h.names.join(", ")}]; }`, origin);
    }
    push("}", null);
    push("", null);
  }
  return { text: out.join("\n") + "\n", map, sites: total, files: files.length };
}

/**
 * G members no module takes off the façade. The OTHER half of drift: `countT`
 * was a write with no accessor, `renderStatBars` is an accessor with no reader,
 * and only one of the two directions is visible to a type checker.
 *
 * Scope-accurate first, then a REGEX SUPPRESSOR: any name spelled `<ident>.name`
 * in js/game|net is struck off, so a consumer this tool cannot resolve (the ctx
 * that agentview-raster.js receives inside a bespoke bag) can never be reported
 * as dead. The regex only ever REMOVES rows — it can shrink this list, never
 * grow it — which keeps a false "delete this, nothing reads it" impossible.
 */
export function deadMembers() {
  const used = new Set();
  for (const rel of ctxModuleFiles()) for (const h of collectUsage(rel)) for (const n of h.names) used.add(n);
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

export function runTsc() {
  const tsc = findTsc();
  if (!tsc) return { skipped: true, reason: "no TypeScript resolvable (no node_modules/typescript, no tsc on PATH)" };
  const shadow = emitShadow();
  const dir = path.join(ROOT, OUT_DIR);
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
      errors.push(`${origin || `${OUT_DIR}/usage.ts:${m[1]}`}: ${m[2]}`);
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
  const declared = scanDeclaredFactories();
  const realFac = scanRealFactories();
  for (const [g, at] of realFac) if (!declared.has(g)) problems.push(`${at}: \`${g}.create(ctx)\` is called but ${DTS} has no \`declare const ${g}: GameModuleFactory;\``);
  for (const g of declared) if (!realFac.has(g)) problems.push(`${DTS}: \`declare const ${g}: GameModuleFactory\` matches no \`${g}.create(ctx)\` call site`);
  return { problems, memberCount: real.members.size, factoryCount: realFac.size };
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
  console.log(`G surface: ${parity.memberCount} members, ${parity.factoryCount} create(ctx) modules`);
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
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
