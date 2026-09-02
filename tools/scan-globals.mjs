#!/usr/bin/env node
// @doc Derives the REAL global-reference graph of the IIFE build (espree/eslint-scope): assigns, eval-time reads, edges.
// @skill check-changes
/**
 * scan-globals.mjs — derive the REAL global-reference graph of the IIFE build.
 *
 *   node tools/scan-globals.mjs             # scan, print summary, write artifacts/dep-graph.json
 *   node tools/scan-globals.mjs --check     # + assert manifest FULL order is a valid toposort
 *                                           #   of the derived eval-time edges, and report which
 *                                           #   HARD_EDGES / DEFERRED_EDGES rows are derivable
 *   node tools/scan-globals.mjs --json      # print the graph JSON to stdout instead of a summary
 *
 * Bedrock Phase 0 ("Observe" — docs/research/ARCHITECTURE-REDESIGN-2026-08.md).
 * Every js/ file is a "use strict" IIFE assigning one global; load order is
 * hand-maintained in tools/manifest.cjs with HARD_EDGES naming the eval-time
 * dependencies. Nothing derived those edges from the code until now. This
 * scanner parses every FULL + DEFERRED + LAZY_AGENT + LAZY_RACE + LAZY_SCENERY
 * + LAZY_DATA + LAZY_NET file with espree, resolves references
 * with eslint-scope, and reports per file:
 *
 *   assigns      globals the file creates AT EVAL TIME. Two idioms:
 *                  - Program-level declarations (`const Log = (function(){…})()`,
 *                    `const M4 = …; const V3 = …` — top-level const/let/var IS a
 *                    global lexical binding across classic scripts)
 *                  - window/globalThis property writes executed during evaluation
 *                    (`window.PhysicsConsts = {…}`, the circuits'
 *                    `(window.TrackDefs = window.TrackDefs || []).push(…)`, the
 *                    shader files' `window.GLXShaders = Object.assign(…)`)
 *   assignsCall  window-property writes that only happen inside functions invoked
 *                later (e.g. tlx.js's debug `window.scene = …`, apex.js exposing
 *                `__apex` inside create()).
 *   evalReads    module globals referenced DURING evaluation — destructures like
 *                tracks.js's `const {…} = TrackGeom`, template-literal shader
 *                interpolation, window.X reads at the top level. This is the
 *                class of dependency HARD_EDGES records: violating one is a
 *                ReferenceError (or silent undefined for window.X) at load.
 *   callReads    module globals referenced only inside deferred function bodies.
 *   typeofReads  reads guarded by `typeof X` — safe on an absent global, so they
 *                are NOT ordering constraints (gfx.js probing TLX/WGX).
 *
 * EVAL vs CALL: a reference is eval-time when every enclosing function is an
 * immediately-invoked function expression (callee of its parent CallExpression).
 * game.js's `(async function(){…})()` wrapper counts as eval-time throughout —
 * conservative, and safe only because game.js loads LAST (asserted in --check).
 *
 * EVIDENCE, NEVER A PRUNER. Known false-negative classes, surfaced rather than
 * silently missed:
 *   - `window[expr]` / `globalThis[expr]` with a non-literal key cannot be
 *     resolved statically -> listed per site under `unscannable`.
 *   - a function VALUE passed to a runner that calls it during evaluation
 *     (`[…].forEach(fn)` at top level) is classified call-time, not eval-time.
 * So: absence of a derived edge is NOT proof no dependency exists. Do not
 * delete a manifest edge on this scanner's word alone; the --check report
 * (derived-eval / call-time-only / underivable per HARD_EDGES row) is the
 * evidence trail for the Phase-2 EVAL_EDGES/CALL_EDGES split.
 *
 * Output: artifacts/dep-graph.json (gitignored). Consumers that need the scan
 * live (tests/unit/global-registry.test.mjs) import scanRepo() and never read
 * the artifact — a fresh clone needs no artifacts/ state.
 *
 * Exit codes: 0 clean; 1 parse failure or (--check) a toposort violation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as espree from "espree";
import * as eslintScope from "eslint-scope";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = require(path.join(ROOT, "tools", "manifest.cjs"));

// ---------------------------------------------------------------------------
// Environment names: reads of these are host/builtin references, not module
// dependencies. Anything unresolved that is neither here nor assigned by a
// scanned file lands in `externalReads` — the "reading an undeclared global"
// finding. Generous on purpose; a stale entry here only mutes a finding.
const ENV = new Set([
  // ECMAScript builtins
  "Object", "Array", "String", "Number", "Boolean", "Math", "JSON", "Date",
  "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "EvalError",
  "ReferenceError", "URIError", "AggregateError", "Promise", "Symbol", "Proxy",
  "Reflect", "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "FinalizationRegistry",
  "Function", "BigInt", "Infinity", "NaN", "undefined", "globalThis",
  "parseInt", "parseFloat", "isNaN", "isFinite", "eval",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "escape", "unescape", "structuredClone", "queueMicrotask", "Intl", "Atomics",
  "ArrayBuffer", "SharedArrayBuffer", "DataView", "Float32Array", "Float64Array",
  "Int8Array", "Int16Array", "Int32Array", "Uint8Array", "Uint8ClampedArray",
  "Uint16Array", "Uint32Array", "BigInt64Array", "BigUint64Array",
  // browser / DOM / Web APIs
  "window", "self", "document", "navigator", "location", "history", "screen",
  "console", "alert", "confirm", "prompt", "localStorage", "sessionStorage",
  "indexedDB", "caches", "crypto", "performance", "fetch", "Request", "Response",
  "Headers", "AbortController", "AbortSignal", "URL", "URLSearchParams",
  "Blob", "File", "FileReader", "FormData", "TextEncoder", "TextDecoder",
  "WebSocket", "XMLHttpRequest", "EventSource", "BroadcastChannel",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback",
  "getComputedStyle", "matchMedia", "devicePixelRatio", "innerWidth", "innerHeight",
  "addEventListener", "removeEventListener", "dispatchEvent", "open", "close",
  "Event", "CustomEvent", "ErrorEvent", "MessageChannel", "MessagePort",
  "MutationObserver", "ResizeObserver", "IntersectionObserver", "PerformanceObserver",
  "DOMParser", "XMLSerializer", "Node", "Element", "HTMLElement", "HTMLCanvasElement",
  "HTMLInputElement", "HTMLVideoElement", "HTMLImageElement", "HTMLAudioElement",
  "SVGElement", "DocumentFragment", "Range", "Selection", "NodeFilter",
  "Image", "Audio", "Option", "OffscreenCanvas", "ImageData", "ImageBitmap",
  "createImageBitmap", "Path2D", "CanvasRenderingContext2D",
  "WebGLRenderingContext", "WebGL2RenderingContext", "WebGLTexture",
  "AudioContext", "webkitAudioContext", "OfflineAudioContext", "AudioWorkletNode",
  "AnalyserNode", "GainNode", "OscillatorNode", "MediaStream",
  "MediaStreamTrack", "MediaRecorder", "MediaSource", "MediaMetadata",
  "RTCPeerConnection", "RTCSessionDescription", "RTCIceCandidate",
  "BarcodeDetector", "Notification", "Worker", "SharedWorker", "ServiceWorker",
  "GamepadEvent", "Gamepad", "TouchEvent", "PointerEvent", "KeyboardEvent",
  "MouseEvent", "WheelEvent", "DragEvent", "FocusEvent", "InputEvent",
  "DeviceOrientationEvent", "DeviceMotionEvent", "ScreenOrientation",
  "DOMMatrix", "DOMPoint", "DOMRect", "FontFace", "CSS", "CSSStyleSheet",
  "visualViewport", "speechSynthesis", "SpeechSynthesisUtterance",
  "IDBKeyRange", "IDBObjectStore", "IDBDatabase",
  "btoa", "atob", "frames", "top", "parent", "origin", "name", "opener",
  "scrollTo", "scrollBy", "scrollX", "scrollY", "pageXOffset", "pageYOffset",
  "customElements", "reportError", "postMessage", "focus", "blur", "print", "stop",
  "CompressionStream", "DecompressionStream", "orientation",
  // WebGPU host constants (js/render/webgpu/wgx.js)
  "GPUBufferUsage", "GPUColorWrite", "GPUMapMode", "GPUShaderStage", "GPUTextureUsage",
  // Node-side hosts the same files run under (track-build VM, tools)
  "process", "global", "require", "module", "exports", "Buffer",
  "__dirname", "__filename",
  // vendored / injected libraries the deferred backends expect
  "THREE", "RAPIER",
]);

const WINDOW_ALIASES = new Set(["window", "globalThis", "self"]);

// ---------------------------------------------------------------------------
// AST helpers.

/** Annotate child->parent so scope references can be classified by position. */
function annotateParents(node, parent = null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) annotateParents(n, parent); return; }
  if (typeof node.type !== "string") return;
  node.parent = parent;
  for (const k of Object.keys(node)) {
    if (k === "parent" || k === "loc" || k === "range") continue;
    annotateParents(node[k], node);
  }
}

const FN_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

function nearestFunction(node) {
  for (let n = node; n; n = n.parent) if (FN_TYPES.has(n.type)) return n;
  return null;
}

/** An IIFE: a function expression that is the callee of its own CallExpression.
 *  (espree elides parentheses, so `(function(){})()` parents directly.) */
function isIife(fn) {
  return fn.type !== "FunctionDeclaration" &&
         fn.parent && fn.parent.type === "CallExpression" && fn.parent.callee === fn;
}

/** True when `node` executes during the file's initial evaluation: every
 *  enclosing function is an IIFE. An async IIFE counts (see header caveat). */
function isEvalTime(node) {
  for (let fn = nearestFunction(node); fn; fn = nearestFunction(fn.parent)) {
    if (!isIife(fn)) return false;
  }
  return true;
}

function isTypeofGuarded(idNode) {
  return idNode.parent &&
         idNode.parent.type === "UnaryExpression" && idNode.parent.operator === "typeof";
}

// ---------------------------------------------------------------------------
// Per-file scan.

/** @returns per-file record; `reads` are raw name sets, filtered later. */
export function scanSource(src, file) {
  const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true });
  annotateParents(ast);
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2023, sourceType: "script" });
  const globalScope = sm.globalScope;

  const assigns = new Set();        // eval-time global creation
  const assignsCall = new Set();    // window.X writes inside deferred functions
  const evalReads = new Set();
  const callReads = new Set();
  const typeofReads = new Set();
  const unscannable = [];           // dynamic window[<expr>] sites
  const bracketLiteral = [];        // window["X"] sites (resolved, but flagged)

  // (a) Program-level declarations: the classic-script global bindings.
  for (const node of ast.body) {
    if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) if (d.id.type === "Identifier") assigns.add(d.id.name);
    } else if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      if (node.id) assigns.add(node.id.name);
    }
  }

  // (b) Unresolved identifier references (eslint-scope `through` on the global
  // scope): reads of other files' lexical globals, implicit-global writes.
  const unresolvedIds = new Set();                  // identifier NODES, for (c)
  for (const ref of globalScope.through) unresolvedIds.add(ref.identifier);
  for (const ref of globalScope.through) {
    const id = ref.identifier;
    const nm = id.name;
    if (WINDOW_ALIASES.has(nm)) continue;          // handled via member walk
    const evalT = isEvalTime(id);
    if (ref.isWrite()) {
      (evalT ? assigns : assignsCall).add(nm);
      if (!ref.isRead()) continue;                  // pure write
    }
    if (isTypeofGuarded(id)) { typeofReads.add(nm); continue; }
    (evalT ? evalReads : callReads).add(nm);
  }

  // (c) window/globalThis property access: the other assignment idiom, plus
  // the unscannable bracket-access class.
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (typeof node.type !== "string") return;
    if (node.type === "MemberExpression" &&
        node.object.type === "Identifier" && WINDOW_ALIASES.has(node.object.name) &&
        // the object must actually be the HOST object: an unresolved reference,
        // not a local `self`/`window` shadow (transport.js's `const self = {…}`
        // endpoints were the measured false positive)
        unresolvedIds.has(node.object)) {
      let nm = null;
      if (!node.computed && node.property.type === "Identifier") {
        nm = node.property.name;
      } else if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") {
        nm = node.property.value;
        bracketLiteral.push({ line: node.loc.start.line, name: nm });
      } else {
        unscannable.push({
          line: node.loc.start.line,
          site: src.slice(node.range[0], Math.min(node.range[1], node.range[0] + 80)).replace(/\s+/g, " "),
        });
      }
      if (nm !== null && !ENV.has(nm)) {
        const evalT = isEvalTime(node);
        const isWrite = node.parent && node.parent.type === "AssignmentExpression" && node.parent.left === node;
        if (isWrite) (evalT ? assigns : assignsCall).add(nm);
        else if (node.parent && node.parent.type === "UnaryExpression" && node.parent.operator === "typeof") typeofReads.add(nm);
        else (evalT ? evalReads : callReads).add(nm);
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "parent" || k === "loc" || k === "range") continue;
      walk(node[k]);
    }
  })(ast);

  return { file, assigns, assignsCall, evalReads, callReads, typeofReads, unscannable, bracketLiteral };
}

// ---------------------------------------------------------------------------
// Repo scan.

export function listFiles() {
  // LAZY_AGENT (dev/test surface) + LAZY_RACE (race payload). Both are tagless
  // and injected at runtime, and both ASSIGN globals other files read at call
  // time — light-presets.js assigns window.LightPresets, which light-store.js
  // and game.js read. Leaving a lazy roster out of the scan does not make the
  // read safe, it makes it invisible.
  const lazy = [...(manifest.LAZY_AGENT || []), ...(manifest.LAZY_RACE || []),
    ...(manifest.LAZY_SCENERY || []), ...(manifest.LAZY_DATA || []),
    ...(manifest.LAZY_NET || [])];
  return {
    full: manifest.FULL.slice(),
    deferred: Object.fromEntries(Object.entries(manifest.DEFERRED).map(([k, v]) => [k, v.slice()])),
    lazy,
    all: [...manifest.FULL, ...Object.values(manifest.DEFERRED).flat(), ...lazy],
  };
}

/** Scan every FULL + DEFERRED + LAZY_AGENT file. Returns { files, order, assignedBy, graph }. */
export function scanRepo(root = ROOT) {
  const { full, deferred, lazy, all } = listFiles();
  const files = new Map();
  const errors = [];
  for (const rel of all) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    try {
      files.set(rel, scanSource(src, rel));
    } catch (e) {
      errors.push({ file: rel, error: String(e && e.message || e) });
    }
  }

  // Which files assign each module global (eval-time assigns only — a global
  // that exists solely as a call-time expando is not a load-order provider).
  const assignedBy = new Map();
  for (const rec of files.values())
    for (const nm of rec.assigns) {
      if (!assignedBy.has(nm)) assignedBy.set(nm, []);
      assignedBy.get(nm).push(rec.file);
    }

  return { full, deferred, lazy, all, files, assignedBy, errors };
}

/** Serializable graph: reads filtered to module globals; the rest kept as
 *  externalReads evidence. */
export function buildGraph(scan) {
  const { full, deferred, lazy = [], files, assignedBy, errors } = scan;
  const isModuleGlobal = (nm) => assignedBy.has(nm);
  const out = { generatedAt: new Date().toISOString(), fileCount: files.size, errors, files: {}, globals: {}, evalEdges: [] };
  for (const [nm, owners] of [...assignedBy].sort()) out.globals[nm] = owners;

  const index = new Map(full.map((f, i) => [f, i]));
  for (const rel of [...full, ...Object.values(deferred).flat(), ...lazy]) {
    const r = files.get(rel);
    if (!r) continue;
    const filt = (set) => [...set].filter(isModuleGlobal).sort();
    const external = [...r.evalReads, ...r.callReads]
      .filter((nm) => !isModuleGlobal(nm) && !ENV.has(nm)).sort();
    out.files[rel] = {
      assigns: [...r.assigns].sort(),
      assignsCall: filt(r.assignsCall),
      evalReads: filt(r.evalReads),
      callReads: filt(r.callReads),
      typeofReads: filt(r.typeofReads),
      externalReads: [...new Set(external)],
      unscannable: r.unscannable,
      bracketLiteral: r.bracketLiteral,
    };
    // Derived eval edges (provider = first assigner in FULL order; a name the
    // file itself eval-assigns is self-satisfying — the `window.X = window.X
    // || …` accumulator idiom — and emits no edge).
    for (const nm of r.evalReads) {
      if (!isModuleGlobal(nm) || r.assigns.has(nm)) continue;
      const owners = assignedBy.get(nm).filter((f) => index.has(f));
      if (!owners.length) continue; // provided only by a deferred group
      const provider = owners.reduce((a, b) => (index.get(a) <= index.get(b) ? a : b));
      out.evalEdges.push([provider, rel, nm]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// --check: toposort + manifest-edge coverage.

export function checkGraph(scan) {
  const { full, deferred, lazy = [], files, assignedBy } = scan;
  const index = new Map(full.map((f, i) => [f, i]));
  const deferredSet = new Set(Object.values(deferred).flat());
  const report = { toposort: [], deferredProvided: [], hardEdges: [], deferredEdges: [], lazyEdges: [] };

  // (a) FULL order is a valid topological sort of the derived eval edges:
  // every eval-read has SOME provider at an earlier-or-same index. ("Some",
  // not "all": accumulator globals like GLXShaders/TrackDefs have many
  // writers and the scan does not track which KEYS a reader needs.)
  const check = (rel, orderIndexOf) => {
    const r = files.get(rel);
    if (!r) return;
    for (const nm of r.evalReads) {
      if (!assignedBy.has(nm) || r.assigns.has(nm)) continue;
      const owners = assignedBy.get(nm);
      const ok = owners.some((f) => {
        const oi = orderIndexOf(f);
        return oi !== null && oi <= orderIndexOf(rel);
      });
      if (!ok) {
        if (owners.every((f) => deferredSet.has(f))) {
          report.deferredProvided.push({ file: rel, name: nm, providers: owners });
        } else {
          report.toposort.push({ file: rel, name: nm, providers: owners });
        }
      }
    }
  };
  for (const rel of full) check(rel, (f) => (index.has(f) ? index.get(f) : null));
  for (const group of Object.values(deferred)) {
    const gi = new Map(group.map((f, i) => [f, i]));
    // a deferred file may read anything in FULL (always evaluated first) or
    // anything earlier in its own group.
    for (const rel of group)
      check(rel, (f) => (index.has(f) ? -1 : gi.has(f) ? gi.get(f) : null));
  }
  if (lazy.length) {
    const gi = new Map(lazy.map((f, i) => [f, i]));
    // a lazy file may read anything in FULL (always evaluated first) or
    // anything earlier in LAZY_AGENT.
    for (const rel of lazy)
      check(rel, (f) => (index.has(f) ? -1 : gi.has(f) ? gi.get(f) : null));
  }

  // (b) Manifest edge coverage: is each hand-recorded [before, after] pair
  // derivable, and at what strength?
  const classify = (before, after) => {
    const b = files.get(before), a = files.get(after);
    if (!b || !a) return { verdict: "unscanned" };
    const provided = new Set([...b.assigns, ...b.assignsCall]);
    const hit = (set) => [...set].filter((nm) => provided.has(nm));
    const evalHit = hit(a.evalReads);
    if (evalHit.length) return { verdict: "eval", via: evalHit };
    const callHit = hit(a.callReads);
    if (callHit.length) return { verdict: "call-time", via: callHit };
    const typeofHit = hit(a.typeofReads);
    if (typeofHit.length) return { verdict: "typeof-only", via: typeofHit };
    return { verdict: "underivable", via: [] };
  };
  for (const [before, after] of manifest.HARD_EDGES)
    report.hardEdges.push({ before, after, ...classify(before, after) });
  for (const [before, after] of manifest.DEFERRED_EDGES)
    report.deferredEdges.push({ before, after, ...classify(before, after) });
  for (const [before, after] of (manifest.LAZY_EDGES || []))
    report.lazyEdges.push({ before, after, ...classify(before, after) });

  return report;
}

// ---------------------------------------------------------------------------
// CLI.

function main() {
  const args = new Set(process.argv.slice(2));
  const scan = scanRepo();
  if (scan.errors.length) {
    for (const e of scan.errors) console.error(`PARSE FAIL ${e.file}: ${e.error}`);
    process.exit(1);
  }
  const graph = buildGraph(scan);

  const outPath = path.join(ROOT, "artifacts", "dep-graph.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(graph, null, 2) + "\n");

  if (args.has("--json")) { console.log(JSON.stringify(graph, null, 2)); return; }

  const nFiles = graph.fileCount;
  const nGlobals = Object.keys(graph.globals).length;
  const shared = Object.entries(graph.globals).filter(([, o]) => o.length > 1);
  const unscannable = Object.entries(graph.files).filter(([, r]) => r.unscannable.length);
  const external = Object.entries(graph.files).filter(([, r]) => r.externalReads.length);
  console.log(`scan-globals: ${nFiles} files, ${nGlobals} globals, ${graph.evalEdges.length} derived eval edges`);
  console.log(`  multi-writer globals: ${shared.map(([nm, o]) => `${nm}(${o.length})`).join(", ") || "none"}`);
  if (unscannable.length) {
    console.log(`  UNSCANNABLE window[<expr>] sites (evidence gap, listed, never pruned):`);
    for (const [f, r] of unscannable)
      for (const u of r.unscannable) console.log(`    ${f}:${u.line}  ${u.site}`);
  }
  if (external.length) {
    console.log(`  external reads (not assigned by any manifest file, not in ENV):`);
    for (const [f, r] of external) console.log(`    ${f}: ${r.externalReads.join(", ")}`);
  }
  console.log(`  wrote ${path.relative(ROOT, outPath)}`);

  if (args.has("--check")) {
    const report = checkGraph(scan);
    const counts = {};
    for (const e of report.hardEdges) counts[e.verdict] = (counts[e.verdict] || 0) + 1;
    console.log(`\n--check: HARD_EDGES ${manifest.HARD_EDGES.length} rows: ` +
      Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", "));
    for (const e of report.hardEdges.filter((e) => e.verdict !== "eval"))
      console.log(`    [${e.verdict}] ${e.before} -> ${e.after}` +
        (e.via && e.via.length ? `  via ${e.via.join(",")}` : ""));
    const dcounts = {};
    for (const e of report.deferredEdges) dcounts[e.verdict] = (dcounts[e.verdict] || 0) + 1;
    console.log(`  DEFERRED_EDGES ${manifest.DEFERRED_EDGES.length} rows: ` +
      Object.entries(dcounts).map(([k, v]) => `${v} ${k}`).join(", "));
    for (const e of report.deferredEdges.filter((e) => e.verdict !== "eval"))
      console.log(`    [${e.verdict}] ${e.before} -> ${e.after}` +
        (e.via && e.via.length ? `  via ${e.via.join(",")}` : ""));
    const lcounts = {};
    for (const e of report.lazyEdges) lcounts[e.verdict] = (lcounts[e.verdict] || 0) + 1;
    console.log(`  LAZY_EDGES ${(manifest.LAZY_EDGES || []).length} rows: ` +
      Object.entries(lcounts).map(([k, v]) => `${v} ${k}`).join(", "));
    for (const e of report.lazyEdges.filter((e) => e.verdict !== "eval"))
      console.log(`    [${e.verdict}] ${e.before} -> ${e.after}` +
        (e.via && e.via.length ? `  via ${e.via.join(",")}` : ""));
    if (report.deferredProvided.length) {
      console.log(`  deferred-provided eval reads (ordering enforced by the injection await, not tag order):`);
      for (const d of report.deferredProvided)
        console.log(`    ${d.file} reads ${d.name} <- ${d.providers.join(", ")}`);
    }
    if (report.toposort.length) {
      console.log(`\n  TOPOSORT VIOLATIONS (eval read with no provider loaded first):`);
      for (const v of report.toposort)
        console.log(`    ${v.file} eval-reads ${v.name} <- ${v.providers.join(", ") || "(nobody)"}`);
      process.exit(1);
    }
    console.log(`  toposort: manifest FULL order is a valid topological sort of the derived eval edges`);
  }
}

const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
