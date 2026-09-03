#!/usr/bin/env node
/**
 * @doc A `page.evaluate()` callback may not close over Node — flags module-scope reads inside serialised callbacks.
 * @section runner
 * evaluate-scope-lint.mjs — a page.evaluate() callback may not close over Node.
 *
 *   node tools/evaluate-scope-lint.mjs            # lint every spec
 *   node tools/evaluate-scope-lint.mjs --json
 *
 * THE FOOTGUN. `page.evaluate(fn)` does not call `fn`. It serialises it to
 * source, ships it to the browser and evaluates it there — so the callback has
 * NO access to the module scope it was written in. A Node-side `const` read
 * inside it is not a closure, it is a `ReferenceError` at runtime, in the page,
 * where the only symptom is the test failing for a reason unrelated to what it
 * asserts.
 *
 * It cost this repo a commit: `58614db2` introduced FLAT_LAUNCH / CLIMB_LAUNCH
 * as module constants and used them inside the evaluate. Every elevation track
 * died `ReferenceError: FLAT_LAUNCH is not defined`, including four that had
 * been green, and the failure looked like a physics regression rather than a
 * scoping mistake. `0f458925` passes them in as an argument, which is the fix
 * this lint enforces.
 *
 * WHAT IT ALLOWS. Anything genuinely available in the page: browser globals,
 * the game's own IIFE globals (`__apex`, `Tracks`, `Log`, …), and the
 * callback's own parameters — which is how a value is SUPPOSED to cross the
 * boundary. Anything else declared in the module is an error.
 *
 * Deliberately narrow: it only inspects the first argument of `.evaluate(`,
 * `.evaluateHandle(`, `.waitForFunction(` and `.$$eval(`/`.$eval(` when that
 * argument is a function expression. A callback passed by reference cannot be
 * checked this way and is skipped rather than guessed at.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";
import * as eslintScope from "eslint-scope";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = path.join(ROOT, "tests");

// Names that genuinely exist in the page: standard browser/JS globals plus this
// game's own script-tag globals. Keep in step with tools/manifest.cjs's globals.
const PAGE_GLOBALS = new Set([
  // JS + DOM
  "window", "document", "navigator", "location", "localStorage", "sessionStorage",
  "console", "Math", "JSON", "Date", "Object", "Array", "String", "Number",
  "Boolean", "Promise", "Set", "Map", "WeakMap", "WeakSet", "Error", "RegExp",
  "Infinity", "NaN", "undefined", "isFinite", "isNaN", "parseInt", "parseFloat",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "performance", "fetch",
  "Float32Array", "Uint8Array", "Uint16Array", "Uint32Array", "Int32Array",
  "ArrayBuffer", "DataView", "TextEncoder", "TextDecoder", "URL", "Blob",
  "getComputedStyle", "matchMedia", "CustomEvent", "Event", "DOMParser",
  "AudioContext", "webkitAudioContext", "indexedDB", "structuredClone",
  "globalThis", "self", "Intl", "Symbol", "BigInt", "Proxy", "Reflect",
  // the game's own globals (script-tag IIFEs)
  "__apex", "Tracks", "Log", "M4", "V3", "Gfx", "GLX", "Assets", "Career",
  "Teams", "Parts", "Liveries", "LiveryTex", "Ghost", "DriverRatings",
  "F1API", "DataHub", "UiLayers", "TopModal", "MusicLib", "SpotifyMusic",
  "TrackDefs", "TrackSpline", "TrackMesh", "TrackGeom", "TrackGraph",
  "TrackSpace", "TrackSurface", "TrackModels", "TrackMaps", "SceneryThemes",
  "TrackSceneryData", "CamModes", "LightTune", "LightStore",
  "GLTF", "THREE", "TLX", "WGX", "Input", "GameAudio", "GameStore", "PerfGov",
]);

const EVAL_METHODS = new Set(["evaluate", "evaluateHandle", "waitForFunction", "$eval", "$$eval"]);

/** @returns {{line:number, name:string, method:string}[]} */
export function lintSource(source) {
  const ast = espree.parse(source, {
    ecmaVersion: "latest", sourceType: "module", loc: true, range: true,
  });
  const scopeManager = eslintScope.analyze(ast, {
    ecmaVersion: 2023, sourceType: "module", ignoreEval: true,
  });

  const bad = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const n of node) visit(n); return; }

    if (node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.property.type === "Identifier" &&
        EVAL_METHODS.has(node.callee.property.name)) {
      const cb = node.arguments[0];
      if (cb && (cb.type === "ArrowFunctionExpression" || cb.type === "FunctionExpression")) {
        const scope = scopeManager.acquire(cb, true);
        if (scope) {
          // through = references this function's scope chain could not resolve
          // internally. In the page, those must be page globals; anything the
          // MODULE defines is a ReferenceError at runtime.
          const seen = new Set();
          for (const ref of scope.through) {
            const name = ref.identifier.name;
            if (PAGE_GLOBALS.has(name) || seen.has(name)) continue;
            // Resolved to a module-level binding => it exists in Node, not the page.
            const declaredInModule = scopeManager.globalScope.set.has(name) ||
              scopeManager.scopes.some((s) => s.block === ast && s.set.has(name)) ||
              (ref.resolved && ref.resolved.defs.length > 0);
            if (declaredInModule) {
              seen.add(name);
              bad.push({ line: ref.identifier.loc.start.line, name,
                         method: node.callee.property.name });
            }
          }
        }
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "parent" || k === "loc" || k === "range" || k === "type") continue;
      visit(node[k]);
    }
  };
  visit(ast);
  return bad;
}

export function lintAll() {
  const out = [];
  const SPECS = path.join(TESTS, "specs");
  const files = fs.readdirSync(SPECS).filter((n) => n.endsWith(".spec.js")).sort();
  for (const f of files) {
    const src = fs.readFileSync(path.join(SPECS, f), "utf8");
    try {
      const bad = lintSource(src);
      if (bad.length) out.push({ file: `tests/specs/${f}`, violations: bad });
    } catch (e) {
      out.push({ file: `tests/specs/${f}`, parseError: e.message, violations: [] });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = lintAll();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  if (!rows.length) { console.log("✓ no page.evaluate callback closes over a Node-side binding"); process.exit(0); }
  for (const r of rows) {
    if (r.parseError) { console.log(`${r.file}: PARSE ERROR ${r.parseError}`); continue; }
    for (const v of r.violations)
      console.log(`${r.file}:${v.line}  ${v.method}() closes over Node-side \`${v.name}\` — pass it as an argument`);
  }
  process.exit(1);
}
