#!/usr/bin/env node
/**
 * @doc Strips low-signal `//` comments (dividers, loc pointers, orphans); `--headers --narrative` compresses file headers.
 * @skill slim-bloat
 * trim-comments.mjs — remove low-signal comments from js/ and css/.
 *
 * Usage:
 *   node tools/trim-comments.mjs [--dry-run] [--headers] [--narrative] [--help] [paths…]
 *
 * Safe by default: dividers, loc pointers, orphan fragments, category labels.
 * --narrative: drop 2+ line // blocks with no KEEP keywords (never splits a block).
 * --headers: compress block file headers to one line (max 220 chars, no mid-word cut).
 *
 * Skips js/render/webgpu/ for --narrative unless path is explicitly that dir.
 * See .claude/skills/slim-bloat/references/carves.md §4.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node tools/trim-comments.mjs [options] [paths…]

Options:
  --dry-run     report only
  --headers     compress /* file headers
  --narrative   remove multi-line // essays (whole blocks only)
  --help        this text

Default paths: js/`);
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const shortenHeaders = args.includes("--headers");
const stripNarrative = args.includes("--narrative");
const paths = args.filter((a) => !a.startsWith("-"));

const DIVIDER = /^\s*\/\/\s*[-=─═]{3,}/;
const BOX_DIVIDER = /^\s*\/\/\s*[═]{10,}\s*$/;
const BLOCK_DIVIDER = /^\s*\/\*[\s=*\-─]{3,}[\s\S]*?\*\/\s*$/;
const CATEGORY = /^\s*\/\/\s*(keyboard|gamepad|tilt|touch)\s*$/i;
const EDGE_LABEL = /^\s*\/\/\s*edge-triggered:/i;
const LINE_COMMENT = /^\s*\/\//;
const LOC_POINTER = /^\s*\/\/.*\blives in js\//i;
const ORPHAN_FRAGMENT = /^\s*\/\/\s*[\w./-]+\)\s*[─═-]+\s*$/;
const PHYSICS_CONSTS_POINTER = /^\s*\/\/ The immutable numbers live in js\/game\/physics-consts\.js/;

const KEEP = /\b(must not|must|bug|measured|_sceneryShift|sceneryShift|assist|AI-only|ignored|blocked|Safari|iOS|WGX|WebGPU|port mirror|LIT_|load-order|DEFERRED|registry|silent|ratchet|WARNING|never|do not|curvature|unaided|same omission|false no-op|det −1|PACE|vTop\(|vStd\(|aStd\(|START-LINES|docs\/|NOTE:|Was \d|leftover|player with assists|Newton|understeer|oversteer|quali\.js|emulation|harness|No 4th vertex|hasTrk roads|SSR march off|debug — the __tlx|Raw RGB\. Packing|Bug-explaining|hooks-documented|lazyTrackEnsure|registry pins)\b/i;

const NARRATIVE_LINE = /^\s*\/\/(\s|$)/;
const HEADER_MAX = 220;

function isDividerLine(line) {
  return DIVIDER.test(line) || BOX_DIVIDER.test(line);
}

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
    if (t && !t.startsWith("//") && !BLOCK_DIVIDER.test(t)) return lines[j];
  }
  return "";
}

function isObviousDecl(line) {
  return /^\s*(let|const|var|function|async function|class|get |set )\s+/.test(line);
}

function collectCommentRun(lines, start) {
  const run = [];
  let i = start;
  while (i < lines.length && LINE_COMMENT.test(lines[i]) && !isDividerLine(lines[i])) {
    run.push(lines[i]);
    i++;
  }
  return { run, end: i };
}

function isRemovableNarrativeBlock(run) {
  if (run.length === 0) return false;
  if (run.some((l) => KEEP.test(l))) return false;
  if (run.every((l) => LOC_POINTER.test(l) || PHYSICS_CONSTS_POINTER.test(l))) return true;
  if (run.length < 2) return false;
  return run.every((l) => NARRATIVE_LINE.test(l));
}

function shortenFileHeader(src) {
  const m = src.match(/^(\/\*[\s\S]*?\*\/\s*\n)/);
  if (!m) return src;
  const block = m[1];
  if (block.split("\n").length <= 3) return src;
  const lines = block.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").replace(/^\/\*|\*\/\s*$/, "").trim());
  let body = lines.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  body = body.replace(/\s*WHY THIS EXISTS.*$/, "").replace(/…+$/, "").trim();
  if (body.length < 60) return src;
  if (body.length > HEADER_MAX) {
    const cut = body.lastIndexOf(" ", HEADER_MAX - 1);
    body = body.slice(0, cut > 40 ? cut : HEADER_MAX).trim();
  }
  return src.slice(0, m.index) + `/* ${body} */\n` + src.slice(m.index + block.length);
}

function narrativeOkForFile(rel) {
  if (!stripNarrative) return false;
  if (rel.includes("js/render/webgpu/")) return false;
  if (rel === "js/game/perf.js" || rel === "js/game/cameras.js" || rel === "js/game/debrisworld.js") return false;
  return true;
}

function trimFile(abs) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  let src = fs.readFileSync(abs, "utf8");
  if (shortenHeaders) src = shortenFileHeader(src);
  const lines = src.split("\n").map((l) => l.replace(/\r$/, ""));
  const normalizedSrc = lines.join("\n");
  const out = [];
  let removed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (BLOCK_DIVIDER.test(line.trim())) {
      removed++;
      continue;
    }

    if (isDividerLine(line)) {
      removed++;
      continue;
    }

    if (ORPHAN_FRAGMENT.test(line)) {
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

      if (run.every((l) => LOC_POINTER.test(l) || PHYSICS_CONSTS_POINTER.test(l)) && !run.some((l) => KEEP.test(l))) {
        removed += run.length;
        i = end - 1;
        continue;
      }

      if (narrativeOkForFile(rel) && isRemovableNarrativeBlock(run)) {
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
  return { removed, changed: next !== normalizedSrc, next, before: lines.length, after: collapsed.length };
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
