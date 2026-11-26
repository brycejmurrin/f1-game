// @doc apex-lsp diag APX1/APX2: a call or read of a Module.member or factory-instance member nothing defines.
// Finds uses of Module.member / instance.member where no declaration of that module (or factory return)
// defines the member. TypeScript cannot report these: object literals in JavaScript files are open-ended.
import { createRequire } from "node:module";

// Lazy: see lsp-mcp.mjs (#6867).
const analyze = (...a) => createRequire(import.meta.url)("eslint-scope").analyze(...a);

const FN = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];
const BUILTIN = new Set(["hasOwnProperty", "toString", "constructor", "valueOf", "call", "apply", "bind", "name", "length", "prototype", "then"]);
const GLOBAL_HEAD = /^(window|self|globalThis)\./;
const iife = n => n?.type === "CallExpression" && ["FunctionExpression", "ArrowFunctionExpression"].includes(n.callee?.type) ? n.callee : null;
const nameOf = n => n?.type === "Identifier" ? n.name : n?.type === "MemberExpression" && !n.computed ? `${nameOf(n.object)}.${nameOf(n.property)}` : "";

function walk(node, fn, parents = []) {
  if (!node || typeof node.type !== "string") return;
  fn(node, parents);
  parents.push(node);
  for (const key in node) {
    if (key === "loc" || key === "range") continue;
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) walk(child, fn, parents);
    else if (value && typeof value.type === "string") walk(value, fn, parents);
  }
  parents.pop();
}
function ownStatements(fn, visit) {
  (function go(n, top) {
    if (!n || typeof n.type !== "string") return;
    if (!top && FN.includes(n.type)) return;
    visit(n);
    for (const key in n) {
      if (key === "loc" || key === "range") continue;
      const value = n[key];
      if (Array.isArray(value)) for (const child of value) go(child, false);
      else if (value && typeof value.type === "string") go(value, false);
    }
  })(fn.body, true);
}
function returnsOf(fn) {
  if (fn.body.type !== "BlockStatement") return [fn.body];
  const out = [];
  ownStatements(fn, n => { if (n.type === "ReturnStatement") out.push(n.argument); });
  return out;
}
function localVars(fn) {
  const vars = new Map();
  if (fn.body.type !== "BlockStatement") return vars;
  ownStatements(fn, n => { if (n.type === "VariableDeclarator" && n.id.type === "Identifier") vars.set(n.id.name, { init: n.init, extra: new Set(), dynamic: false }); });
  walk(fn.body, n => {
    if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression" && n.left.object.type === "Identifier" && vars.has(n.left.object.name)) {
      const v = vars.get(n.left.object.name);
      if (n.left.computed) v.dynamic = true; else v.extra.add(n.left.property.name);
    }
    if (n.type === "CallExpression" && /^Object\.(assign|defineProperty|defineProperties)$/.test(nameOf(n.callee)) && n.arguments[0]?.type === "Identifier" && vars.has(n.arguments[0].name)) vars.get(n.arguments[0].name).dynamic = true;
  });
  return vars;
}
// Members an object-valued expression is known to have: { keys, open } (open = cannot be enumerated).
function membersOf(node, vars, depth = 0) {
  const out = { keys: new Set(), open: false };
  const merge = m => { for (const k of m.keys) out.keys.add(k); out.open ||= m.open; };
  if (!node || depth > 6) { out.open = true; return out; }
  if (node.type === "CallExpression" && /^Object\.(freeze|seal)$/.test(nameOf(node.callee))) return membersOf(node.arguments[0], vars, depth + 1);
  if (node.type === "CallExpression" && nameOf(node.callee) === "Object.assign") { for (const a of node.arguments) merge(membersOf(a, vars, depth + 1)); return out; }
  if (node.type === "ObjectExpression") {
    for (const p of node.properties) {
      if (p.type === "Property" && !p.computed) out.keys.add(String(p.key.name ?? p.key.value));
      else if (p.type === "SpreadElement") merge(membersOf(p.argument, vars, depth + 1));
      else out.open = true;
    }
    return out;
  }
  if (node.type === "Identifier" && vars?.has(node.name)) {
    const v = vars.get(node.name);
    merge(membersOf(v.init, vars, depth + 1));
    for (const k of v.extra) out.keys.add(k);
    out.open ||= v.dynamic;
    return out;
  }
  const fn = iife(node);
  if (fn) {
    const inner = localVars(fn), rets = returnsOf(fn);
    if (!rets.length) out.open = true;
    for (const r of rets) merge(membersOf(r, inner, depth + 1));
    return out;
  }
  out.open = true;
  return out;
}

// asts: Map<file, Program>. Returns Map<head, { keys, open, factories: Map<via, { keys, open }> }>.
export function buildIndex(asts) {
  const index = new Map();
  const add = (head, init) => {
    const entry = index.get(head) || { keys: new Set(), open: false, factories: new Map() };
    const m = membersOf(init);
    for (const k of m.keys) entry.keys.add(k);
    entry.open ||= m.open;
    index.set(head, entry);
    const top = iife(init);
    if (!top || top.body.type !== "BlockStatement") return;
    const fns = new Map(), vars = localVars(top);
    for (const st of top.body.body) if (st.type === "FunctionDeclaration") fns.set(st.id.name, st);
    for (let ret of returnsOf(top)) {
      if (ret?.type === "CallExpression" && nameOf(ret.callee) === "Object.freeze") ret = ret.arguments[0];
      if (ret?.type !== "ObjectExpression") continue;
      for (const p of ret.properties) {
        if (p.type !== "Property" || p.computed) continue;
        const fn = p.value.type === "Identifier" ? fns.get(p.value.name) : ["FunctionExpression", "ArrowFunctionExpression"].includes(p.value.type) ? p.value : null;
        if (!fn) continue;
        const rets = returnsOf(fn);
        if (!rets.length) continue;
        const made = { keys: new Set(), open: false }, scope = new Map([...vars, ...localVars(fn)]);
        for (const r of rets) { const m2 = membersOf(r, scope); for (const k of m2.keys) made.keys.add(k); made.open ||= m2.open; }
        const key = String(p.key.name ?? p.key.value), prev = entry.factories.get(key);
        if (prev) { for (const k of made.keys) prev.keys.add(k); prev.open ||= made.open; } else entry.factories.set(key, made);
      }
    }
  };
  for (const ast of asts.values()) for (const st of ast.body) {
    if (st.type === "VariableDeclaration") for (const d of st.declarations) {
      if (d.id.type !== "Identifier" || !d.init) continue;
      if (iife(d.init) || d.init.type === "ObjectExpression" || (d.init.type === "CallExpression" && /^Object\./.test(nameOf(d.init.callee)))) add(d.id.name, d.init);
    }
    if (st.type === "ExpressionStatement" && st.expression.type === "AssignmentExpression" && /^(window|self|globalThis)\.[\w$]+$/.test(nameOf(st.expression.left))) add(nameOf(st.expression.left).split(".")[1], st.expression.right);
  }
  for (const ast of asts.values()) walk(ast, n => {
    if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression") {
      const owner = index.get(nameOf(n.left.object).replace(GLOBAL_HEAD, ""));
      if (owner) { if (n.left.computed) owner.open = true; else owner.keys.add(n.left.property.name); }
    }
    if (n.type === "CallExpression" && /^Object\.(assign|defineProperty|defineProperties)$/.test(nameOf(n.callee))) {
      const owner = index.get(nameOf(n.arguments[0]).replace(GLOBAL_HEAD, ""));
      if (owner) owner.open = true;
    }
  });
  return index;
}

// Returns [{ line0, col0, owner, member, called, guarded }] for one file.
export function checkFile(ast, text, index) {
  let manager;
  try { manager = analyze(ast, { ecmaVersion: 2024, sourceType: "script", optimistic: true, ignoreEval: true }); } catch { return []; }
  const resolved = new Map(), declared = new Map();
  for (const scope of manager.scopes) {
    for (const r of scope.references) resolved.set(r.identifier.range[0], r.resolved);
    for (const v of scope.variables) for (const id of v.identifiers) declared.set(id.range[0], v);
  }
  const instances = new Map();
  walk(ast, n => {
    const target = n.type === "VariableDeclarator" ? n.id : n.type === "AssignmentExpression" ? n.left : null;
    let init = n.type === "VariableDeclarator" ? n.init : n.type === "AssignmentExpression" ? n.right : null;
    if (!target || target.type !== "Identifier" || !init) return;
    if (init.type === "ConditionalExpression") init = init.consequent.type === "CallExpression" ? init.consequent : init.alternate;
    const variable = declared.get(target.range[0]) || resolved.get(target.range[0]);
    if (!variable) return;
    if (init?.type === "CallExpression" && init.callee.type === "MemberExpression" && !init.callee.computed && init.callee.object.type === "Identifier") {
      const head = init.callee.object.name, via = init.callee.property.name;
      if (index.get(head)?.factories.has(via)) {
        const prev = instances.get(variable);
        instances.set(variable, prev === undefined || (prev && prev.head === head && prev.via === via) ? { head, via } : null);
        return;
      }
    }
    if (n.type === "AssignmentExpression" && instances.has(variable) && !(init.type === "Literal" && init.value === null) && !(init.type === "Identifier" && init.name === "undefined")) instances.set(variable, null);
  });
  const lines = text.split("\n"), out = [];
  walk(ast, (n, parents) => {
    if (n.type !== "MemberExpression" || n.computed || n.object.type !== "Identifier" || n.property.type !== "Identifier") return;
    const parent = parents.at(-1), member = n.property.name, head = n.object.name;
    if (BUILTIN.has(member) || (parent.type === "AssignmentExpression" && parent.left === n)) return;
    const variable = resolved.get(n.object.range[0]);
    let known, owner;
    const instance = variable && instances.get(variable);
    if (instance) {
      const made = index.get(instance.head).factories.get(instance.via);
      if (made.open) return;
      known = made.keys; owner = `${head} (= ${instance.head}.${instance.via}())`;
    } else {
      const entry = index.get(head);
      if (!entry || entry.open) return;
      if (variable && variable.scope.block !== ast) return;
      known = entry.keys; owner = head;
    }
    if (known.has(member)) return;
    const line = lines[n.loc.start.line - 1] || "", esc = x => x.replace(/[$]/g, "\\$");
    const guarded = n.optional || parent.type === "ChainExpression" || (parent.type === "CallExpression" && parent.optional) ||
      new RegExp(`${esc(head)}\\??\\.${esc(member)}\\s*(&&|\\?|!==|===|!=|==|\\|\\|)|typeof\\s+${esc(head)}\\??\\.${esc(member)}|!\\s*${esc(head)}\\??\\.${esc(member)}\\b|\\bin\\s+${esc(head)}\\b|\\bif\\s*\\([^)]*${esc(head)}\\??\\.${esc(member)}\\s*[)&|]`).test(line);
    out.push({ line0: n.property.loc.start.line - 1, col0: n.property.loc.start.column, owner, member, called: parent.type === "CallExpression" && parent.callee === n, guarded });
  });
  return out;
}
