/* store-key-types.test.mjs — one storage key, one type.
 *
 * `apex26.brakeCue` was owned by TWO features at once:
 *
 *   js/input/steer-tuning.js     a slider notch, number 1-10, registered in
 *                                js/ui/settings-export.js with def 4
 *   js/ui/driving-line-opts.js   the ribbon's audio cue, the string "on"/"off"
 *
 * GameStore JSON-parses, so both round-trip at full type and each reader got the
 * other's write back verbatim. `clamp("on", 1, 10)` returns "on" — both of its
 * comparisons are false for a string — so the string reached BrakeCue.setLevel,
 * failed its `typeof v === "number"` guard and vanished, leaving the slider
 * unrestored. In the other direction `store.get(K, "off") === "on"` is false
 * against a number, so the ribbon's cue read OFF the moment the slider moved.
 * Two settings, silently breaking each other, for as long as both have existed.
 *
 * WHY A GREP WOULD NOT HAVE FOUND IT. steer-tuning writes the literal
 * `store.set("brakeCue", v)`; driving-line-opts wrote `store.set(K_CUE, ...)`
 * through a `const K_CUE = "brakeCue"` alias (since renamed to `lineBrakeCue`).
 * Scanning for the literal showed ONE writer and a clean bill of health. So this
 * walks the AST and resolves module-level string constants to their value, which
 * is the only way two aliased writers of the same key appear.
 *
 * WHAT IS ASSERTED is type agreement, not sole ownership. Keys legitimately have
 * several writers — `season`, `driver` and `track` each do — and that is fine as
 * long as everyone agrees what the value IS. A key written as a number in one
 * module and a string in another is the defect, every time.
 *
 * Run: node --test tests/unit/store-key-types.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, fn); return; }
  if (typeof node.type === "string") fn(node);
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "loc" || k === "range" || k === "parent") continue;
    walk(node[k], fn);
  }
}

// The literal type a written value has, or null when it is not a literal we can
// judge. A computed expression says nothing, so it is not evidence either way.
function litType(node) {
  if (!node) return null;
  if (node.type === "Literal") {
    if (node.value === null) return null;
    return typeof node.value;                       // "string" | "number" | "boolean"
  }
  // `cueOn ? "on" : "off"` — a conditional of two same-typed literals IS typed.
  if (node.type === "ConditionalExpression") {
    const a = litType(node.consequent), b = litType(node.alternate);
    return a && a === b ? a : null;
  }
  if (node.type === "UnaryExpression" && node.operator === "!") return "boolean";
  return null;
}

function scanFile(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  let ast;
  try { ast = espree.parse(src, { ecmaVersion: 2022, loc: true }); }
  catch (e) { throw new Error(`${file}: ${e.message}`); }

  // Pass 1: module-level `const K = "literal"` so an aliased key resolves.
  const alias = new Map();
  walk(ast, (n) => {
    if (n.type !== "VariableDeclarator" || !n.id || n.id.type !== "Identifier") return;
    if (n.init && n.init.type === "Literal" && typeof n.init.value === "string")
      alias.set(n.id.name, n.init.value);
  });

  // Pass 2: every store.set(<key>, <value>) AND store.get(<key>, <default>).
  //
  // The GET side carries most of the signal, and that is not a compromise — it
  // is the better question. Only 5 of the 105 store.set call sites in js/ write
  // a literal; the rest write a computed value that claims no type. A get's
  // DEFAULT is a literal almost every time, and it is the module stating what it
  // believes the key holds. The brakeCue defect is exactly a disagreeing pair of
  // defaults: `store.get("brakeCue", 4)` against `store.get(K_CUE, "off")`.
  const out = [];
  walk(ast, (n) => {
    if (n.type !== "CallExpression") return;
    const c = n.callee;
    if (!c || c.type !== "MemberExpression" || c.computed) return;
    const how = c.property && c.property.name;
    if (how !== "set" && how !== "get") return;
    const obj = c.object;
    const onStore = obj && ((obj.type === "Identifier" && /store$/i.test(obj.name))
                         || (obj.type === "MemberExpression" && obj.property && /store$/i.test(obj.property.name)));
    if (!onStore) return;
    const [kNode, vNode] = n.arguments || [];
    if (!kNode) return;
    let key = null;
    if (kNode.type === "Literal" && typeof kNode.value === "string") key = kNode.value;
    else if (kNode.type === "Identifier" && alias.has(kNode.name)) key = alias.get(kNode.name);
    if (!key) return;                                // a computed key names no one
    const t = litType(vNode);
    if (!t) return;                                  // not a literal: no claim made
    out.push({ key, type: t, how, file, line: kNode.loc.start.line });
  });
  return out;
}

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("no storage key is written with two different value types", () => {
  const writes = [];
  for (const f of jsFiles("js")) {
    if (f.includes("/vendor/")) continue;            // the three.js island is not ours
    writes.push(...scanFile(f));
  }
  // 57 typed calls on the tree this was written against, so the floor is under a
  // MEASUREMENT rather than a hopeful round figure — and it is doing real work:
  // it is what caught the first draft of this scanner, which saw only 5 of the
  // 105 store.set sites and would have pronounced the codebase clean.
  assert.ok(writes.length >= 50, `the scanner sees only ${writes.length} typed store calls — it has stopped seeing them`);

  const byKey = new Map();
  for (const w of writes) {
    if (!byKey.has(w.key)) byKey.set(w.key, []);
    byKey.get(w.key).push(w);
  }
  const bad = [];
  for (const [key, ws] of byKey) {
    const types = [...new Set(ws.map((w) => w.type))];
    if (types.length < 2) continue;
    bad.push(`apex26.${key} is used as ${types.join(" AND ")} — `
      + ws.map((w) => `${w.how} ${w.type} at ${w.file}:${w.line}`).join(", "));
  }
  assert.deepEqual(bad, []);
});

// The scanner is the thing most likely to be wrong, so it is asked a question it
// must get right: the exact defect this file was written for, on the code as it
// stood. If alias resolution regresses, this goes red while the sweep above
// stays green — which is the failure mode that let the bug live.
test("the scanner resolves an aliased key, which is how the defect hid", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "sk-"));
  try {
    const f = path.relative(ROOT, path.join(dir, "probe.js"));
    fs.writeFileSync(path.join(ROOT, f),
      'const K_CUE = "brakeCue";\nconst store = GameStore.store;\n'
      + 'store.set(K_CUE, on ? "on" : "off");\nstore.set("brakeCue", 4);\n');
    const got = scanFile(f);
    assert.deepEqual(got.map((w) => `${w.how}:${w.key}:${w.type}`),
                     ["set:brakeCue:string", "set:brakeCue:number"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
