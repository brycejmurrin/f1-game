#!/usr/bin/env node
/**
 * gen-hooks-table.mjs — the `__apex` hook index block in docs/DEBUG-HOOKS.md.
 * @doc Regenerates the `__apex` hook index in `docs/DEBUG-HOOKS.md` from the live `__apex` keys (VM boot) + source; `--check`.
 * @skill agent-view
 *
 * docs/DEBUG-HOOKS.md calls itself the full reference and is 150 KB of hand
 * prose; nothing in it could answer "what hooks exist, with what parameters"
 * without reading the whole file. This generator owns ONE block —
 * `<!-- GENERATED: hooks-table -->` … `<!-- /GENERATED -->` — and lists:
 *
 *   1. every key of the LIVE `__apex` object — `Object.keys(__apex)` after a
 *      headless boot (tools/lib/game-vm.cjs createGame) — so the SET of hooks
 *      is what the game really exposes, peeled clusters (ApexCam, ApexNet, …)
 *      included. Each row's signature AS WRITTEN IN SOURCE (parameter names,
 *      defaults, rest) and its one-line summary (the comment immediately above
 *      the hook) come from `const api = {…}` in js/agent/apex.js or the object
 *      a peeled file's `hooks()` returns. A source-parsed name that is not live
 *      is a parser bug and throws (2026-11: the first `return {` inside ApexCam
 *      `hooks()` was a nested helper's, so the index listed `T` and `tries` and
 *      dropped 18 camera hooks while `--check` passed); a live name with no
 *      source entry still gets a row;
 *   2. the agent-view surface as `agentHelp()` in js/agent/agentview.js
 *      describes it (perceive / detail / know / act), evaluated from source.
 *
 * Parsed with espree (the same parser tools/check/check-gctx.mjs and
 * tools/check/cross-file-paths.mjs use), so a hook cannot hide from a regex. The
 * hand sections stay; tests/unit/hooks-documented.test.mjs keeps requiring a
 * hand section per hook with this block stripped, so the table is an index,
 * not a way to skip writing one.
 *
 *   node tools/gen/gen-hooks-table.mjs            # write
 *   node tools/gen/gen-hooks-table.mjs --check    # exit 1 when committed ≠ generated
 */
import { createRequire } from "node:module";
import { argGate, emit, isMain, readRepo, replaceBlock } from "./gen-lib.mjs";
import { ensureBuilt } from "./ensure-built.mjs";

const require = createRequire(import.meta.url);
const espree = require("espree");

export const TARGET = "docs/DEBUG-HOOKS.md";
export const APEX = "js/agent/apex.js";
export const AGENTVIEW = "js/agent/agentview.js";

function parse(src) {
  return espree.parse(src, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true, comment: true });
}

/** Depth-first search for the first node satisfying `pred`. */
function find(node, pred) {
  if (!node || typeof node.type !== "string") return null;
  if (pred(node)) return node;
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range" || k === "parent") continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) { const r = find(c, pred); if (r) return r; } }
    else if (v && typeof v.type === "string") { const r = find(v, pred); if (r) return r; }
  }
  return null;
}

const keyName = (p) => (p.key.type === "Identifier" ? p.key.name : String(p.key.value));

function params(src, fn) {
  return fn.params.map((p) => src.slice(p.range[0], p.range[1]).replace(/\s+/g, " ")).join(", ");
}

/** Signature as written: name(params), plus what kind of value it is. */
function signature(src, prop) {
  const name = keyName(prop);
  const v = prop.value;
  if (v.type === "FunctionExpression" || v.type === "ArrowFunctionExpression") {
    return { sig: `${v.async ? "async " : ""}${name}(${params(src, v)})`, kind: v.async ? "async" : "fn" };
  }
  if (v.type === "ObjectExpression") {
    const members = v.properties.filter((p) => p.type === "Property").map((p) => {
      const pv = p.value;
      const isFn = pv.type === "FunctionExpression" || pv.type === "ArrowFunctionExpression";
      return keyName(p) + (isFn ? `(${params(src, pv)})` : "");
    });
    return { sig: name, kind: "namespace", members };
  }
  return { sig: name, kind: "value", expr: src.slice(v.range[0], v.range[1]).replace(/\s+/g, " ").slice(0, 60) };
}

/** The contiguous comment block whose last line sits directly above `line`. */
function commentAbove(comments, line) {
  const block = [];
  let want = line - 1;
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.loc.end.line > want) continue;
    if (c.loc.end.line < want) break;
    block.unshift(c);
    want = c.loc.start.line - 1;
    if (c.type === "Block") break;
  }
  return block;
}

function summarise(block, name) {
  if (!block.length) return "";
  const text = block.map((c) => c.value).join("\n")
    .split("\n").map((l) => l.replace(/^\s*\*+\s?/, "").trim()).filter(Boolean).join(" ")
    .replace(/\s+/g, " ").trim();
  // Drop a leading "name(...) —" / "name —" restatement of the hook itself.
  let s = text.replace(new RegExp(`^${name.replace(/\$/g, "\\$")}\\s*(\\([^)]*\\))?\\??\\s*[—:-]\\s*`), "");
  // First sentence, bounded.
  const m = s.match(/^(.*?[.!?])(\s|$)/);
  if (m && m[1].length >= 24) s = m[1];
  if (s.length > 150) s = s.slice(0, 147).replace(/\s+\S*$/, "") + "…";
  return s.replace(/\|/g, "\\|");
}

/** Hook clusters peeled out of apex.js: `...ApexNet.hooks(G, …)` in `api` names a file whose `hooks()` returns the hook object. */
export const PEELED = {
  ApexNet: "js/agent/apex-net.js",
  ApexCam: "js/agent/apex-cam.js",
  ApexTrack: "js/agent/apex-track.js",
  ApexLobby: "js/agent/apex-lobby.js",
};

function peeledHooks(spread) {
  const a = spread.argument;
  const callee = a && a.type === "CallExpression" && a.callee.type === "MemberExpression" ? a.callee : null;
  const file = callee && callee.object.type === "Identifier" && callee.property.name === "hooks" ? PEELED[callee.object.name] : null;
  if (!file) return null;
  const src = readRepo(file);
  const ast = parse(src);
  const fn = find(ast, (n) => n.type === "FunctionDeclaration" && n.id && n.id.name === "hooks");
  // A DIRECT statement of hooks()'s body, never a deep search: a helper declared
  // inside hooks() (ApexCam's clearShot returns `{ T, tries }`) comes first.
  const ret = fn && fn.body.body.find((n) => n.type === "ReturnStatement" && n.argument && n.argument.type === "ObjectExpression");
  if (!ret) throw new Error(`${file}: could not find the object returned by hooks()`);
  return ret.argument.properties.map((p) => {
    if (p.type !== "Property") throw new Error(`${file}:${p.loc.start.line}: unexpected ${p.type} in the hook object`);
    return { name: keyName(p), line: p.loc.start.line, file, ...signature(src, p), summary: summarise(commentAbove(ast.comments, p.loc.start.line), keyName(p)) };
  });
}

/**
 * The live hook names: `Object.keys(__apex)` after a headless boot of the game
 * (tools/lib/game-vm.cjs; ~1 s with car meshes stubbed). Builds the gitignored
 * BUILT_PATHS first (js/track/circuit-meta.js), which the boot reads.
 * @returns {Promise<string[]>}
 */
export async function liveHookNames() {
  ensureBuilt();
  const { createGame } = require("../lib/game-vm.cjs");
  const g = await createGame({ carMeshes: false });
  try { return Object.keys(g.apex); } finally { g.close(); }
}

/** Hooks as parsed from source, in `api` order with peeled clusters inlined. */
export function sourceHooks() {
  const src = readRepo(APEX);
  const ast = parse(src);
  const decl = find(ast, (n) => n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === "api"
    && n.init && n.init.type === "ObjectExpression");
  if (!decl) throw new Error(`${APEX}: could not find \`const api = {…}\``);
  const comments = ast.comments;
  const hooks = [];
  for (const p of decl.init.properties) {
    const peeled = p.type === "SpreadElement" && peeledHooks(p);
    if (peeled) { hooks.push(...peeled); continue; }
    if (p.type !== "Property") throw new Error(`${APEX}:${p.loc.start.line}: unexpected ${p.type} in api — spreads hide hooks from the index`);
    const s = signature(src, p);
    const summary = summarise(commentAbove(comments, p.loc.start.line), keyName(p));
    hooks.push({ name: keyName(p), line: p.loc.start.line, ...s, summary });
  }
  return hooks;
}

/**
 * Reconcile the live key list with the source parse: one row per LIVE name, in
 * live order. Throws when the parse found a name the game does not expose.
 * @param {string[]} live Object.keys(__apex)
 */
export function collectHooks(live) {
  if (!Array.isArray(live) || !live.length) throw new Error("collectHooks(live): need the live __apex key list");
  const parsed = sourceHooks();
  const liveSet = new Set(live);
  const bogus = parsed.filter((h) => !liveSet.has(h.name)).map((h) => `${h.file || APEX}:${h.line} ${h.name}`);
  if (bogus.length) throw new Error(`source parse found names that are not live __apex hooks (parser bug?): ${bogus.join(", ")}`);
  const byName = new Map(parsed.map((h) => [h.name, h]));
  return live.map((name) => byName.get(name)
    || { name, sig: name, kind: "live", summary: "live key set outside `api` (e.g. `js/game.js` bindAgent after `ApexApi.create`)" });
}

/** Fold a string-concatenation expression into its text. */
function stringOf(node) {
  if (node.type === "Literal") return String(node.value);
  if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked).join("");
  if (node.type === "BinaryExpression" && node.operator === "+") return stringOf(node.left) + stringOf(node.right);
  throw new Error(`agentHelp(): cannot fold ${node.type} at line ${node.loc.start.line}`);
}

export function collectAgentSurface() {
  const src = readRepo(AGENTVIEW);
  const ast = parse(src);
  const fn = find(ast, (n) => n.type === "FunctionDeclaration" && n.id && n.id.name === "agentHelp");
  if (!fn) throw new Error(`${AGENTVIEW}: could not find function agentHelp()`);
  const ret = find(fn.body, (n) => n.type === "ReturnStatement" && n.argument && n.argument.type === "ObjectExpression");
  if (!ret) throw new Error("agentHelp(): no object return");
  const groups = [];
  for (const p of ret.argument.properties) {
    if (p.type !== "Property" || p.value.type !== "ObjectExpression") continue;
    const g = keyName(p);
    if (!["perceive", "detail", "know", "act"].includes(g)) continue;
    const calls = p.value.properties.filter((q) => q.type === "Property")
      .map((q) => ({ call: keyName(q).replace(/\|/g, "\\|"), says: stringOf(q.value).replace(/\s+/g, " ").replace(/\|/g, "\\|") }));
    groups.push({ group: g, calls });
  }
  if (!groups.length) throw new Error("agentHelp(): no perceive/detail/know/act groups found");
  return groups;
}

export function renderBlock(live) {
  const hooks = collectHooks(live);
  const agent = collectAgentSurface();
  const nAsync = hooks.filter((h) => h.kind === "async").length;
  const out = [
    "## Hook index",
    "",
    `_Generated by \`node tools/gen/gen-hooks-table.mjs\` from the live \`Object.keys(__apex)\` of a headless boot (${hooks.length} hooks, ${nAsync} async), with signatures from \`const api = {…}\` in \`js/agent/apex.js\` and the peeled \`hooks()\` files (\`js/agent/apex-cam.js\`, \`apex-net.js\`, \`apex-track.js\`, \`apex-lobby.js\`), and \`agentHelp()\` in \`js/agent/agentview.js\`. Signatures are as written in source; the summary is the comment directly above each hook. The sections below this index are the hand-written reference and are required for every hook (\`tests/unit/hooks-documented.test.mjs\`); \`--check\` guards this block (\`tests/unit/generated-docs.test.mjs\`)._`,
    "",
    "| Hook | Summary |",
    "|---|---|",
  ];
  for (const h of hooks) {
    let summary = h.summary;
    if (h.kind === "namespace") summary = `namespace: ${h.members.map((m) => `\`${m}\``).join(", ")}${summary ? ` — ${summary}` : ""}`;
    else if (h.kind === "value") summary = summary || `value: \`${h.expr}\``;
    out.push(`| \`${h.sig}\` | ${summary || "—"} |`);
  }
  out.push("", "### Agent view surface (`__apex.agentHelp()`)", "", "| Group | Call | What it answers |", "|---|---|---|");
  for (const g of agent) for (const c of g.calls) out.push(`| ${g.group} | \`${c.call}\` | ${c.says} |`);
  out.push("");
  return out.join("\n");
}

export function render(existing, live) {
  return replaceBlock(existing, "hooks-table", renderBlock(live));
}

if (isMain(import.meta.url)) {
  try {
    const gated = argGate(process.argv.slice(2));   // --help / a bad flag answer before the boot
    if (gated !== null) process.exitCode = gated;
    else process.exitCode = emit(TARGET, render(readRepo(TARGET), await liveHookNames()));
  } catch (e) {
    process.stderr.write(String(e.message || e) + "\n");
    process.exitCode = 2;
  }
}
