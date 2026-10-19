// @doc Reads agentHelp source with the existing hook-table and agent-index grammar profiles.
// Static agentHelp source reader. Never executes authored JavaScript.
// Espree options: https://github.com/eslint/js/tree/main/packages/espree
import { createRequire } from "node:module";
const espree = createRequire(import.meta.url)("espree");

function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") fn(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range" || k === "parent") continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walk(c, fn); }
    else if (v && typeof v.type === "string") walk(v, fn);
  }
}

function sourceNodes(src) {
  const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "script", range: true, loc: true });
  const decls = [], functions = [];
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator" && n.id?.type === "Identifier" && n.init) decls.push(n);
    if (n.type === "FunctionDeclaration" && n.id?.name === "agentHelp") functions.push(n);
  });
  return { decls, functions };
}

function objectReturn(fn) {
  let ret = null;
  walk(fn.body, (n) => {
    if (!ret && n.type === "ReturnStatement" && n.argument?.type === "ObjectExpression") ret = n.argument;
  });
  return ret;
}

function evalNode(node, consts) {
  if (!node) return undefined;
  switch (node.type) {
    case "Literal": return node.value;
    case "TemplateLiteral":
      if (node.expressions.length) return undefined;
      return node.quasis[0].value.cooked;
    case "Identifier":
      if (node.name === "undefined") return undefined;
      return consts.has(node.name) ? consts.get(node.name) : undefined;
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number")
        return -node.argument.value;
      return undefined;
    case "BinaryExpression": {
      if (node.operator !== "+") return undefined;
      const l = evalNode(node.left, consts);
      const r = evalNode(node.right, consts);
      if (typeof l === "string" && typeof r === "string") return l + r;
      if (typeof l === "number" && typeof r === "number") return l + r;
      return undefined;
    }
    case "ArrayExpression": {
      const out = [];
      for (const el of node.elements) {
        if (!el) return undefined;
        const v = evalNode(el, consts);
        if (v === undefined && !(el.type === "Identifier" && el.name === "undefined") && el.type !== "Literal")
          return undefined;
        out.push(v);
      }
      return out;
    }
    case "ObjectExpression": {
      const out = {};
      for (const p of node.properties) {
        if (p.type !== "Property" || p.computed) return undefined;
        const key = p.key.type === "Identifier" ? p.key.name
          : p.key.type === "Literal" ? String(p.key.value) : null;
        if (key == null) return undefined;
        const v = evalNode(p.value, consts);
        if (v === undefined && !(p.value.type === "Identifier" && (p.value.name === "undefined" || consts.has(p.value.name))) && p.value.type !== "Literal")
          return undefined;
        out[key] = v;
      }
      return out;
    }
    default: return undefined;
  }
}

/** Index profile: constants, nested objects/arrays, same-type +, no interpolation. */
export function agentHelpFromSource(src) {
  const { decls, functions } = sourceNodes(src);
  let ret = null;
  for (const fn of functions) { ret = objectReturn(fn); if (ret) break; }
  if (!ret) throw new Error("agentHelp() return object not found in js/agent/agentview.js");
  decls.sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
  const consts = new Map();
  for (const d of decls) {
    const v = evalNode(d.init, consts);
    if (v !== undefined) consts.set(d.id.name, v);
  }
  const obj = evalNode(ret, consts);
  if (!obj || typeof obj !== "object") throw new Error("agentHelp() return did not evaluate to an object");
  return obj;
}

// Hook-table profile intentionally keeps its older string grammar: literals
// stringify, + concatenates, and templates contribute their quasis only. It
// reads just four object groups, so unrelated unsupported values are ignored.
function stringOf(node) {
  if (node.type === "Literal") return String(node.value);
  if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked).join("");
  if (node.type === "BinaryExpression" && node.operator === "+") return stringOf(node.left) + stringOf(node.right);
  throw new Error(`agentHelp(): cannot fold ${node.type} at line ${node.loc.start.line}`);
}

const keyName = (p) => (p.key.type === "Identifier" ? p.key.name : String(p.key.value));

/** Ordered, unescaped rows for the hook table; rendering belongs to its generator. */
export function agentHelpGroupsFromSource(src) {
  const { functions } = sourceNodes(src);
  if (!functions.length) throw new Error("js/agent/agentview.js: could not find function agentHelp()");
  const ret = objectReturn(functions[0]);
  if (!ret) throw new Error("agentHelp(): no object return");
  const groups = [];
  for (const p of ret.properties) {
    if (p.type !== "Property" || p.value.type !== "ObjectExpression") continue;
    const g = keyName(p);
    if (!["perceive", "detail", "know", "act"].includes(g)) continue;
    const calls = p.value.properties.filter((q) => q.type === "Property")
      .map((q) => ({ call: keyName(q), says: stringOf(q.value) }));
    groups.push({ group: g, calls });
  }
  if (!groups.length) throw new Error("agentHelp(): no perceive/detail/know/act groups found");
  return groups;
}
