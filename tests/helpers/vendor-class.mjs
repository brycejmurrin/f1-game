/* Pull one class out of a minified vendor bundle by its METHOD names (terser's class names change on every
 * regeneration), together with the module-level declarations it reads (functions, consts, lets: r187 moved
 * writeBufferAligned, the cache-key scratch arrays and the id counters out of the classes), transitively.
 * Imports are not inlined: `imports` maps each import's local name to its exported name, for the caller to bind
 * from the real module namespace (THREE / TSL). */
import { parse } from "acorn";
import { simple, full } from "acorn-walk";

export function vendorModule(source) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const decls = new Map(), imports = new Map();
  for (const n of ast.body) {
    if (n.type === "ImportDeclaration") { for (const s of n.specifiers) if (s.imported) imports.set(s.local.name, s.imported.name); continue; }
    if ((n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id) decls.set(n.id.name, n);
    if (n.type === "VariableDeclaration") for (const d of n.declarations) {
      if (d.id.type === "Identifier") decls.set(d.id.name, n);
      else simple(d.id, { Identifier(i) { decls.set(i.name, n); } });
    }
  }
  /** The class whose methods include every name in `methods`. */
  function classWith(...methods) {
    const hit = ast.body.filter((n) => n.type === "ClassDeclaration" &&
      methods.every((m) => n.body.body.some((b) => b.key && b.key.name === m)));
    if (hit.length !== 1) throw new Error(`vendor class with ${methods.join(", ")}: ${hit.length} matches`);
    return hit[0];
  }
  /** Source of `nodes` plus every module-level declaration they reach, in bundle order; and the imports they read. */
  function closure(nodes, { skip = [] } = {}) {
    const seen = new Set(nodes), usedImports = new Map(), queue = [...nodes];
    while (queue.length) {
      full(queue.pop(), (n) => {
        if (n.type !== "Identifier") return;
        if (imports.has(n.name)) usedImports.set(n.name, imports.get(n.name));
        const d = decls.get(n.name);
        if (d && !seen.has(d) && !skip.includes(n.name)) { seen.add(d); queue.push(d); }
      });
    }
    const code = [...seen].sort((a, b) => a.start - b.start).map((n) => source.slice(n.start, n.end)).join("\n");
    return { code, imports: usedImports };
  }
  return { ast, classWith, closure };
}

/** Bind a closure's imports from module namespaces (first one that exports the name wins). */
export function bindImports(imports, ...namespaces) {
  const ctx = {};
  for (const [local, name] of imports) {
    const ns = namespaces.find((m) => m && name in m);
    if (ns) ctx[local] = ns[name];
  }
  return ctx;
}
