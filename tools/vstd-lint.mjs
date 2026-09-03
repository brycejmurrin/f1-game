#!/usr/bin/env node
//
// @doc The PACE invariant as a check: flags `.speed` compared to a literal without `vStd()` in a manifest-derived file set.
// @skill tune-physics
// vstd-lint — the asserted form of the PACE invariant in AGENTS.md:
//
//   "Adding anything that divides a speed by VMAX, or compares one against a
//    literal, means picking vTop() or vStd()."
//
// PACE is a GROUND-SPEED SCALE. The OVERALL SPEED slider multiplies the car's
// real m/s, so a threshold written against a raw speed means a DIFFERENT
// fraction of the car's envelope at every setting. `vStd(v)` re-expresses a
// speed on the standard pace-5 scale, which is the scale every hard-coded
// number in this file was written against.
//
// The prose invariant has been violated FOUR times:
//   A5  — the beached-rescue gate was `GRASS_V * 0.6 + 1.5`, true only at PACE 1.
//   A13 — `c.otArmed` required a bare `c.speed > 15` while the active-aero
//         floor thirty lines below correctly read `vStd(c.speed) > X_MIN_SPEED`.
//         Overtake armed at 42 % of top speed at pace 0.5 and 16 % at pace 1.3,
//         against active aero's constant 35 %.
//   A16 — the third and fourth, both cosmetic, both in one FX block. The rain
//         spray's `c.speed > 15` + `(c.speed - 15) / 45` ramp this lint flagged
//         outright (max strength 0.47 at pace 0.5 — full spray unreachable).
//         The launch-wheelspin smoke's `_pax > 4.5` it did NOT: an ACCELERATION
//         carries no `.speed`. It surfaced anyway, because the lint flagged the
//         `c.speed > 0.5 && c.speed < 12` window on the very same line and
//         writing that row's justification meant reading the line — peak
//         getaway accel is 3.50 m/s² at pace 0.5, so the effect never fired at
//         all. PACE multiplies `ACCEL` exactly as it multiplies ground speed,
//         which is why js/game.js grew `aStd()` beside `vStd()`. Worth knowing
//         about this tool: it catches one shape of the class and drags a reader
//         within a line of the others.
//
// THE RULE, in one sentence: a `.speed` read compared with < <= > >= against a
// numeric literal is a violation unless the speed is wrapped in `vStd(...)`.
//
// Not every hit is a bug — a force, a divide-by-zero floor, a sign test and the
// reverse crawl are all legitimately absolute. Those live in ALLOWED in
// tests/unit/vstd-invariant.test.mjs, each with a written justification. The point of
// the allow-list is that a NEW absolute speed threshold cannot be added without
// somebody writing down why it is allowed to be absolute.
//
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const MANIFEST = require("./manifest.cjs");

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

// js/game.js (where PACE lives) plus every MANIFEST module whose CODE reads a
// `.speed` — the very thing this lint inspects — wherever in the tree it sits.
// Derived from the rosters, not from a directory: a file that moves is still
// linted, and a file that stops reading car speed drops out on its own. The
// circuit defs and their scenery closures are data and are skipped by roster
// membership. Comments and strings are blanked before the probe, so a file
// that only MENTIONS speed is not linted for it.
// (docs/research/TREE-RESTRUCTURE-2026-09.md §Phase 2 — tools rewritten before the move.)
const SPEED_READ = /\.speed\b/;
export function defaultFiles(root = ROOT) {
  const data = new Set([...MANIFEST.CIRCUITS.map(MANIFEST.circuitPath), ...MANIFEST.LAZY_SCENERY]);
  const rostered = [
    ...MANIFEST.FULL, ...Object.values(MANIFEST.DEFERRED).flat(), ...MANIFEST.LAZY_AGENT,
    ...MANIFEST.LAZY_RACE, ...MANIFEST.LAZY_DATA, ...MANIFEST.LAZY_NET,
  ];
  const files = [];
  for (const rel of rostered) {
    if (data.has(rel)) continue;
    if (rel === MANIFEST.PATHS.GAME
        || SPEED_READ.test(stripNonCode(fs.readFileSync(path.join(root, rel), "utf8")))) files.push(rel);
  }
  return files;
}

// ── source hygiene ────────────────────────────────────────────────────────────
// Blank out comments and string/template bodies IN PLACE, so byte offsets (and
// therefore line numbers) are preserved and a commented-out threshold or a
// message like "speed > 15" cannot be mistaken for code.
export function stripNonCode(src) {
  const out = src.split("");
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i + 2;
      while (j < src.length && src[j] !== "\n") j++;
      blank(i, j); i = j; continue;
    }
    if (c === "/" && d === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? src.length : j + 2;
      blank(i, j); i = j; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        if (c !== "`" && src[j] === "\n") break;   // unterminated — bail at EOL
        j++;
      }
      blank(i + 1, j - 1 >= i + 1 ? j - 1 : i + 1);
      i = j; continue;
    }
    i++;
  }
  return out.join("");
}

// ── the matcher ───────────────────────────────────────────────────────────────
const SPEED = /\.speed\b/g;
// After the speed read: an optional `|| 0` default, then any closing parens that
// were actually opened earlier in this statement — so `Math.abs(c.speed) > 8`,
// `(c.speed || 0) > 8` and `(a.speed - b.speed) > 0.5` all reach the operator.
const DEFAULTED = /^\s*\|\|\s*0/;
const CMP_NUM = /^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)(?![\w.])/;
// Literal-first order: `15 < c.speed`.
const NUM_CMP = /(-?\d+(?:\.\d+)?)\s*(>=|<=|>|<)\s*(?:Math\.(?:abs|max|min)\(\s*)?[A-Za-z_$][\w$.]*$/;
// Already normalised: `vStd(c.speed)` / `vStd(Math.abs(c.speed))`.
const VSTD_WRAP = /vStd\(\s*(?:Math\.(?:abs|max|min)\(\s*)?[A-Za-z_$][\w$.]*$/;
// The property chain the `.speed` hangs off, walking back from it.
const CHAIN = /[A-Za-z_$][\w$.]*$/;
const CALLEE = /[\w$.]+$/;

// Unmatched `(` in the prefix since the last STATEMENT boundary — how many
// closing parens may be skipped before the comparison operator without leaving
// the expression the speed read sits in.
function openParens(before) {
  let cut = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ";" || before[i] === "{" || before[i] === "}") { cut = i + 1; break; }
  }
  let depth = 0;
  for (let i = cut; i < before.length; i++) {
    if (before[i] === "(") depth++;
    else if (before[i] === ")") depth = Math.max(0, depth - 1);
  }
  return Math.min(depth, 4);
}

/**
 * Flag every `.speed` compared against a numeric literal without vStd().
 *
 * @param {Map<string,string>} files  relative path -> source text
 * @returns {{file:string,line:number,expr:string,code:string}[]} sorted, stable
 */
export function speedLiteralViolations(files) {
  const hits = [];
  for (const [file, raw] of files) {
    const src = stripNonCode(raw);
    const lines = raw.split("\n");
    const starts = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
    const lineAt = (idx) => {           // binary search: offset -> 1-based line
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
      return lo + 1;
    };
    SPEED.lastIndex = 0;
    let m;
    while ((m = SPEED.exec(src))) {
      const start = m.index, end = m.index + m[0].length;
      const before = src.slice(Math.max(0, start - 400), start);
      if (VSTD_WRAP.test(before)) continue;          // already pace-normalised

      let k = end;
      const dflt = DEFAULTED.exec(src.slice(end, end + 12));
      if (dflt) k += dflt[0].length;
      let budget = openParens(before), closed = 0;
      for (;;) {                          // skip whitespace and owned `)` alike
        let j = k;
        while (src[j] === " " || src[j] === "\t" || src[j] === "\n" || src[j] === "\r") j++;
        if (budget > 0 && src[j] === ")") { k = j + 1; budget--; closed++; continue; }
        k = j; break;
      }
      const fwd = CMP_NUM.exec(src.slice(k, k + 48));
      const back = NUM_CMP.exec(before);

      const chain = (CHAIN.exec(before) || [""])[0];
      // Render the whole operand, balancing back over any parens we skipped, so
      // the reported expression is the code a reader can grep for.
      let exprStart = start - chain.length;
      for (let want = closed; want > 0 && exprStart > 0; ) {
        const ch = src[--exprStart];
        if (ch === ")") want++;
        else if (ch === "(") want--;
      }
      if (closed && src[exprStart] === "(") {          // absorb the callee name
        exprStart -= (CALLEE.exec(src.slice(Math.max(0, exprStart - 40), exprStart)) || [""])[0].length;
      }
      const operand = src.slice(exprStart, k).replace(/\s+/g, " ").trim();
      let expr = null;
      if (fwd) expr = `${operand} ${fwd[1]} ${fwd[2]}`;
      else if (back) expr = `${back[1]} ${back[2]} ${chain}.speed`;
      if (!expr) continue;

      const line = lineAt(start);
      hits.push({ file, line, expr: expr.replace(/\s+/g, " ").trim(), code: (lines[line - 1] || "").trim() });
    }
  }
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.expr.localeCompare(b.expr));
  return hits;
}

/** Stable identity of a hit — file + expression + the line it sits on. */
export function violationKey(v) {
  return `${v.file} :: ${v.expr} :: ${v.code}`;
}

export function readFiles(list = defaultFiles(), root = ROOT) {
  return new Map(list.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  // A directory argument expands to its .js files (non-recursive), so
  // `vstd-lint.mjs js/game.js js/game/` works the way the auditor prompt
  // spells it instead of dying on EISDIR.
  const expand = (a) => {
    const abs = path.resolve(a);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return fs.readdirSync(abs).filter((f) => f.endsWith(".js")).sort().map((f) => path.join(abs, f));
    }
    return [abs];
  };
  const list = args.length
    ? args.flatMap(expand).map((a) => path.relative(ROOT, a))
    : defaultFiles();
  const hits = speedLiteralViolations(readFiles(list));
  if (!hits.length) {
    console.log("✓ no raw speed-vs-literal comparisons");
  } else {
    for (const v of hits) console.log(`${v.file}:${v.line}  ${v.expr}\n    ${v.code}`);
    console.log(`\n${hits.length} speed-vs-literal comparison(s). Each must be vStd()-normalised or justified in tests/unit/vstd-invariant.test.mjs.`);
  }
}
