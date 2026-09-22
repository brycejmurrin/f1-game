#!/usr/bin/env node
// reject-lint — a try/catch cannot swallow a promise REJECTION.
// @doc An unhandled rejection paints a full-screen overlay — finds promise-returning API calls that discard theirs.
// @section runner
//
// WHY THIS IS A CRASH AND NOT CONSOLE NOISE. `index.html` installs
//
//     window.addEventListener("unhandledrejection", ... show("Promise rejection", ...))
//
// which paints a full-screen `#__err_overlay` over the running game. The
// `error` handler beside it already carries one benign-noise exemption
// (ResizeObserver); the rejection handler carries none, so EVERY rejection that
// reaches the microtask queue unhandled covers the race until the player taps.
//
// THE SHAPE THE BUG TAKES. A call is wrapped in try/catch with a comment naming
// the failure it means to absorb — and that failure is the one the spec makes
// REJECT rather than throw, so the catch is inert:
//
//     try { ctx.close(); } catch (e) { /* already closed */ }
//
// `AudioContext.close()` on a closed context rejects with InvalidStateError. The
// catch never runs; the overlay does. Found 2026-09-22 at four sites, of which
// two fire on ordinary play: `rebuildCtx()` is reached ONLY after a resume has
// already failed (i.e. with the context in exactly the state close() refuses),
// and `Input.rumble()` calls `playEffect()` on every collision, kerb and shift.
//
// THE FIX IS ONE LINE AND KEEPS BOTH GUARDS, because a bad receiver can still
// throw synchronously:
//
//     try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
//
// WHAT IS LINTED, AND WHY NOT MORE. `close`, `play`, `pause` and `resume` are
// synchronous on most of the receivers this tree uses them on — WebSocket,
// RTCPeerConnection, IDBDatabase, HTMLDialogElement, ImageBitmap,
// speechSynthesis — so a name-only rule would be ~30 false positives and would
// be turned off. UNAMBIGUOUS below holds the method names that return a Promise
// on every standard receiver; QUALIFIED holds the (receiver, method) pairs where
// the receiver name is what disambiguates. Adding a receiver is how this lint
// grows: a new false negative costs one row, a false positive costs the rule.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Promise-returning on EVERY standard receiver.
const UNAMBIGUOUS = new Map([
  ["playEffect", "GamepadHapticActuator.playEffect"],
  ["suspend", "BaseAudioContext.suspend"],
  ["requestFullscreen", "Element.requestFullscreen"],
  ["exitFullscreen", "Document.exitFullscreen"],
  ["writeText", "Clipboard.writeText"],
  ["getUserMedia", "MediaDevices.getUserMedia"],
  ["setSinkId", "HTMLMediaElement.setSinkId"],
]);
// Ambiguous method names, disambiguated by the receiver IDENTIFIER. Matched on
// the last dotted segment, so `state.player.resume()` matches `player`.
const QUALIFIED = new Map([
  ["ctx.close", "AudioContext.close"],
  ["ctx.resume", "AudioContext.resume"],
  ["audioCtx.close", "AudioContext.close"],
  ["audioCtx.resume", "AudioContext.resume"],
  ["player.resume", "Spotify Web Playback SDK resume"],
  ["player.pause", "Spotify Web Playback SDK pause"],
]);

const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);
function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

function recvName(obj) {
  if (!obj) return null;
  if (obj.type === "Identifier") return obj.name;
  if (obj.type === "MemberExpression" && !obj.computed && obj.property.type === "Identifier") return obj.property.name;
  if (obj.type === "ThisExpression") return "this";
  return null;
}

/** Sites in one source where a promise-returning call discards its rejection. */
export function lintSource(src, file = "<src>") {
  let ast;
  try { ast = espree.parse(src, { ecmaVersion: 2022, loc: true }); }
  catch (e) { return { file, parseError: e.message, sites: [] }; }

  // A call is OWNED when its value goes somewhere: awaited, returned, assigned,
  // or chained (.then/.catch/.finally). Only a bare ExpressionStatement drops it.
  // `x.foo()` as a bare statement is the shape, but it is not the only
  // SPELLING of it: `x && x.foo()` and `x ? x.foo() : null` discard the value
  // just as completely, and a guard that misses them does not hold the class at
  // zero — it holds it until someone adds a null check. Walk into the discarded
  // operands of a statement-level && / || / ?? / ternary / comma.
  const statements = new Set();
  const discard = (e) => {
    if (!e) return;
    statements.add(e);
    if (e.type === "LogicalExpression") { discard(e.right); return; }
    if (e.type === "ConditionalExpression") { discard(e.consequent); discard(e.alternate); return; }
    if (e.type === "SequenceExpression") { for (const x of e.expressions) discard(x); }
  };
  each(ast, (n) => { if (n.type === "ExpressionStatement") discard(n.expression); });

  const sites = [];
  each(ast, (n) => {
    if (n.type !== "CallExpression") return;
    if (!statements.has(n)) return;                                  // value is owned
    if (n.callee.type !== "MemberExpression" || n.callee.computed) return;
    const m = n.callee.property.name;
    const recv = recvName(n.callee.object);
    const api = UNAMBIGUOUS.get(m) || QUALIFIED.get(recv + "." + m);
    if (!api) return;
    sites.push({ line: n.loc.start.line, api, call: (recv ? recv + "." : "") + m + "()" });
  });
  return { file, parseError: null, sites };
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* walk(p); }
    else if (e.name.endsWith(".js")) yield p;
  }
}

export function lintAll(root = ROOT) {
  const out = [];
  for (const dir of ["js"]) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      const r = lintSource(fs.readFileSync(file, "utf8"), rel);
      if (r.parseError || r.sites.length) out.push(r);
    }
  }
  return out;
}

export function count(root = ROOT) {
  return lintAll(root).reduce((a, r) => a + r.sites.length, 0);
}

function main() {
  const rows = lintAll();
  const n = rows.reduce((a, r) => a + r.sites.length, 0);
  console.log(`promise-returning calls whose rejection escapes to the overlay: ${n}`);
  for (const r of rows) {
    if (r.parseError) { console.log(`  PARSE ${r.file}: ${r.parseError}`); continue; }
    for (const s of r.sites) console.log(`  ${r.file}:${s.line}  ${s.call} — ${s.api}`);
  }
  if (n) {
    console.log("\nFix: keep the try/catch (a bad receiver still throws) and add the");
    console.log("rejection arm — const p = x.foo(); if (p && p.catch) p.catch(() => {});");
  }
  process.exitCode = n ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
