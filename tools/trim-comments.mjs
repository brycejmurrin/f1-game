#!/usr/bin/env node
/**
 * trim-comments.mjs — remove low-signal // comments from js/ and css/.
 *
 * Usage:
 *   node tools/trim-comments.mjs [--dry-run] [--headers] [--narrative] [paths…]
 *
 * --narrative removes whole // blocks only when EVERY line is narrative AND
 * NONE match KEEP keywords (never splits a block).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const shortenHeaders = process.argv.includes("--headers");
const stripNarrative = process.argv.includes("--narrative");
const paths = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const DIVIDER = /^\s*\/\/\s*[-=─]{3,}/;
const CATEGORY = /^\s*\/\/\s*(keyboard|gamepad|tilt|touch)\s*$/i;
const EDGE_LABEL = /^\s*\/\/\s*edge-triggered:/i;
const LINE_COMMENT = /^\s*\/\//;
const LOC_POINTER = /^\s*\/\/.*\blives in js\//i;

const KEEP = /\b(must not|must|bug|measured|_sceneryShift|sceneryShift|assist|AI-only|ignored|blocked|Safari|iOS|WGX|WebGPU|port mirror|LIT_|load-order|DEFERRED|registry|silent|ratchet|WARNING|never|do not|curvature|unaided|same omission|false no-op|det −1|PACE|vTop\(|vStd\(|aStd\(|START-LINES|docs\/|NOTE:|Was \d|leftover|player with assists|Newton|understeer|oversteer|quali\.js|emulation|harness|No 4th vertex|hasTrk roads|SSR march off|debug — the __tlx|Raw RGB\. Packing)\b/i;

const NARRATIVE_LINE = /^\s*\/\/(\s|$)/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const st = fs.statSync(dir);
  if (st.isFile()) {
    if (/\.(js|css|mjs|cjs)$/.test(dir) && !dir.includes("/vendor/")) out.push(dir);
    return out;
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "vendor" || e.name === "node_modules") continue;
    walk(path.join(dir, e.name), out);
  }
  return out;
}

function nextMeaningful(lines, i) {
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t && !t.startsWith("//")) return lines[j];
  }
  return "";
}

function isObviousDecl(line) {
  return /^\s*(let|const|var|function|async function|class)\s+/.test(line);
}

function collectCommentRun(lines, start) {
  const run = [];
  let i = start;
  while (i < lines.length && LINE_COMMENT.test(lines[i])) {
    run.push(lines[i]);
    i++;
  }
  return { run, end: i };
}

function isRemovableNarrativeBlock(run) {
  if (run.length === 0) return false;
  if (run.some((l) => KEEP.test(l))) return false;
  if (run.every((l) => LOC_POINTER.test(l))) return true;
  if (run.length < 2) return false;
  return run.every((l) => NARRATIVE_LINE.test(l));
}

function shortenFileHeader(src) {
  const m = src.match(/^(\/\*[\s\S]*?\*\/\s*\n)/);
  if (!m) return src;
  const block = m[1];
  if (block.split("\n").length <= 4) return src;
  const lines = block.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").replace(/^\/\*|\*\/\s*$/, "").trim());
  const body = lines.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (body.length < 80) return src;
  return src.slice(0, m.index) + `/* ${body.slice(0, 160)}${body.length > 160 ? "…" : ""} */\n` + src.slice(m.index + block.length);
}

function trimFile(abs) {
  let src = fs.readFileSync(abs, "utf8");
  if (shortenHeaders) src = shortenFileHeader(src);
  const lines = src.split("\n");
  const out = [];
  let removed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (DIVIDER.test(line)) {
      removed++;
      continue;
    }

    if (LINE_COMMENT.test(line)) {
      if (CATEGORY.test(line) && isObviousDecl(nextMeaningful(lines, i))) {
        removed++;
        continue;
      }
      if (EDGE_LABEL.test(line)) {
        const nxt = nextMeaningful(lines, i);
        if (/let\s+\w+Pressed\s*=/.test(nxt)) {
          removed++;
          continue;
        }
      }

      const { run, end } = collectCommentRun(lines, i);
      if (LOC_POINTER.test(run[0]) && !run.some((l) => KEEP.test(l))) {
        removed += run.length;
        i = end - 1;
        continue;
      }
      if (stripNarrative && isRemovableNarrativeBlock(run)) {
        removed += run.length;
        i = end - 1;
        continue;
      }
      for (const l of run) out.push(l);
      i = end - 1;
      continue;
    }

    out.push(line);
  }

  const collapsed = [];
  let blankRun = 0;
  for (const l of out) {
    if (l.trim() === "") {
      blankRun++;
      if (blankRun <= 1) collapsed.push(l);
    } else {
      blankRun = 0;
      collapsed.push(l);
    }
  }

  removed += out.length - collapsed.length;
  const next = collapsed.join("\n");
  return { removed, changed: next !== src, next, before: lines.length, after: collapsed.length };
}

const files = paths.length
  ? paths.flatMap((p) => {
      const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
      return fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
    })
  : walk(path.join(ROOT, "js"));

let totalRemoved = 0;
const deltas = [];
for (const abs of files.sort()) {
  const { removed, changed, next, before, after } = trimFile(abs);
  if (!changed) continue;
  totalRemoved += removed;
  deltas.push({ rel: path.relative(ROOT, abs).split(path.sep).join("/"), removed, before, after });
  if (!dryRun) fs.writeFileSync(abs, next);
}

deltas.sort((a, b) => b.removed - a.removed);
console.log(JSON.stringify({ dryRun, shortenHeaders, stripNarrative, totalRemoved, files: deltas.length, top: deltas.slice(0, 30) }, null, 2));
