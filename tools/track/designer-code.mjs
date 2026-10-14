#!/usr/bin/env node
// @doc Headless designer share-code checker: decode APXT1/APXT2 via editor-vm, validate + insight summary; `--json`.
// @skill new-track
/* Apex 26 — designer-code.mjs: decode a custom-track share code with the REAL
 * editor modules (tests/helpers/editor-vm.mjs → TrackCodec / TrackValidate /
 * TrackInsight), print a short report, exit 1 on decode failure or RED issues.
 *
 * Usage:
 *   node tools/track/designer-code.mjs <APXT1.…|APXT2.…>
 *   node tools/track/designer-code.mjs --file <path>
 *   echo 'APXT1.p.…' | node tools/track/designer-code.mjs
 *   node tools/track/designer-code.mjs --json <code>
 *
 * Flags:
 *   --file <path>   read the code (or an apex26.track envelope) from a file
 *   --json          emit one JSON object on stdout instead of the human report
 *   --help, -h      print usage
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootEditor } from "../../tests/helpers/editor-vm.mjs";

export const USAGE = `usage: designer-code.mjs [<code> | --file <path>] [--json]
  Decode a track-designer share code (arg, --file, or stdin), run TrackValidate
  (+ TrackInsight length / corners / issues), print a short report.
  Exit 1 on decode failure or any RED validation issue.`;

/** Parse argv into { help, json, file, code, error }. */
export function parseArgs(argv) {
  const out = { help: false, json: false, file: null, code: null, error: null };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { out.help = true; continue; }
    if (a === "--json") { out.json = true; continue; }
    if (a === "--file" || a === "-f") {
      const p = argv[++i];
      if (!p || p.startsWith("-")) { out.error = "--file requires a path"; return out; }
      out.file = p;
      continue;
    }
    if (a.startsWith("-")) { out.error = `unknown flag: ${a}`; return out; }
    positionals.push(a);
  }
  if (positionals.length > 1) { out.error = "too many arguments — pass one share code, --file, or stdin"; return out; }
  if (positionals.length === 1) out.code = positionals[0];
  return out;
}

/** Pull an APXT* share code out of raw text or an apex26.track JSON envelope. */
export function extractCode(raw, CD) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      const obj = JSON.parse(s);
      const from = CD && CD.fromFile ? CD.fromFile(obj) : null;
      if (from && from.code) return String(from.code).trim();
      if (obj && typeof obj.code === "string") return obj.code.trim();
    } catch (_) { /* fall through — may still be a bare code */ }
  }
  // A pasted #track=… URL fragment or full URL.
  const hash = s.match(/#track=([^&\s]+)/i);
  if (hash) {
    try { s = decodeURIComponent(hash[1]); } catch (_) { s = hash[1]; }
  } else if (CD && CD.fromHash) {
    const fromHash = CD.fromHash(s.startsWith("#") ? s : "#" + s);
    if (fromHash) s = fromHash;
  }
  s = s.trim();
  return s || null;
}

function readStdinSync() {
  try {
    if (process.stdin.isTTY) return "";
    return fs.readFileSync(0, "utf8");
  } catch (_) {
    return "";
  }
}

/** Resolve the share-code string from parsed args (file / arg / stdin). */
export function resolveInput(args, readFile = fs.readFileSync, stdin = readStdinSync) {
  if (args.file) {
    const p = path.resolve(args.file);
    if (!fs.existsSync(p)) return { error: `file not found: ${args.file}` };
    return { raw: readFile(p, "utf8") };
  }
  if (args.code != null && String(args.code).trim()) return { raw: String(args.code) };
  const raw = stdin();
  if (raw && String(raw).trim()) return { raw: String(raw) };
  return { error: "no share code — pass an argument, --file <path>, or pipe on stdin" };
}

/** Decode + validate; returns a plain report object (never throws on bad codes). */
export async function analyzeCode(code, editor) {
  const { CD, V, ctx } = editor || bootEditor();
  const I = ctx.TrackInsight;
  const extracted = extractCode(code, CD);
  if (!extracted) {
    return { ok: false, exitCode: 1, stage: "input", reason: "empty", message: "no share code found in input" };
  }
  let decoded;
  try {
    decoded = await CD.decode(extracted);
  } catch (e) {
    return { ok: false, exitCode: 1, stage: "decode", reason: "exception", message: String(e && e.message || e) };
  }
  if (!decoded || decoded.ok === false) {
    const reason = (decoded && decoded.reason) || "corrupt";
    return {
      ok: false,
      exitCode: 1,
      stage: "decode",
      reason,
      message: `decode failed: ${reason}`,
      code: extracted,
    };
  }
  const design = decoded.design;
  let verdict;
  try {
    verdict = V.check(design);
  } catch (e) {
    return {
      ok: false,
      exitCode: 1,
      stage: "validate",
      reason: "exception",
      message: String(e && e.message || e),
      id: decoded.id,
      name: design && design.name,
    };
  }
  const stats = (verdict && verdict.stats) || {};
  const issues = Array.isArray(verdict && verdict.issues) ? verdict.issues : [];
  const reds = issues.filter((i) => i.level === "red");
  const ambers = issues.filter((i) => i.level === "amber");
  let corners = [];
  if (I && verdict && verdict.tr) {
    try {
      corners = I.bands(verdict.tr, verdict.turns) || [];
    } catch (_) {
      corners = [];
    }
  }
  const lengthM = Number.isFinite(stats.lengthM) ? stats.lengthM : (verdict.tr && Math.round(verdict.tr.total)) || 0;
  const cornerCount = corners.length || (Number.isFinite(stats.turns) ? stats.turns : (verdict.turns || []).length);
  const valid = !!(verdict && verdict.ok && reds.length === 0);
  return {
    ok: valid,
    exitCode: valid ? 0 : 1,
    stage: "validate",
    id: decoded.id,
    name: design && design.name,
    theme: design && design.theme,
    code: extracted,
    lengthM,
    corners: cornerCount,
    cornerBands: corners.map((c) => ({
      n: c.n,
      R: Math.round(c.R),
      angDeg: Math.round(c.angDeg),
      cls: c.cls,
      dir: c.dir > 0 ? "L" : "R",
    })),
    estLapS: stats.estLapS,
    red: reds.length,
    amber: ambers.length,
    issues: issues.map((i) => ({ code: i.code, level: i.level, msg: i.msg, s: i.s })),
  };
}

/** Human-readable multi-line report (no trailing newline required by callers). */
export function formatReport(report) {
  const lines = [];
  if (report.stage === "input" || report.stage === "decode") {
    lines.push(`FAIL  ${report.message || report.reason}`);
    if (report.reason) lines.push(`  reason: ${report.reason}`);
    return lines.join("\n");
  }
  const tag = report.ok ? "OK" : "FAIL";
  const name = report.name || "(unnamed)";
  lines.push(`${tag}  ${name}${report.id ? `  [${report.id}]` : ""}`);
  if (report.theme) lines.push(`  theme:  ${report.theme}`);
  lines.push(`  length: ${report.lengthM} m`);
  lines.push(`  corners: ${report.corners}`);
  if (Number.isFinite(report.estLapS) && report.estLapS > 0) {
    lines.push(`  est lap: ${report.estLapS} s`);
  }
  lines.push(`  issues: ${report.red} red, ${report.amber} amber`);
  for (const i of report.issues || []) {
    lines.push(`    [${i.level}] ${i.code}: ${i.msg}`);
  }
  return lines.join("\n");
}

export async function run(argv = process.argv.slice(2), opts = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    return { exitCode: 0, stdout: USAGE + "\n", stderr: "" };
  }
  if (args.error) {
    return { exitCode: 1, stdout: "", stderr: args.error + "\n" + USAGE + "\n" };
  }
  const input = resolveInput(args, opts.readFile, opts.stdin);
  if (input.error) {
    return { exitCode: 1, stdout: "", stderr: input.error + "\n" + USAGE + "\n" };
  }
  const editor = opts.editor || bootEditor();
  const code = extractCode(input.raw, editor.CD);
  if (!code) {
    return { exitCode: 1, stdout: "", stderr: "no share code found in input\n" };
  }
  const report = await analyzeCode(code, editor);
  if (args.json) {
    return { exitCode: report.exitCode, stdout: JSON.stringify(report, null, 2) + "\n", stderr: "" };
  }
  const text = formatReport(report) + "\n";
  // Failures go to stderr so `--json` stays clean and pipes see the status.
  if (report.exitCode !== 0) return { exitCode: report.exitCode, stdout: "", stderr: text };
  return { exitCode: 0, stdout: text, stderr: "" };
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(entry);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  run().then((r) => {
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    process.exitCode = r.exitCode;
  }).catch((e) => {
    process.stderr.write(String(e && e.stack || e) + "\n");
    process.exitCode = 1;
  });
}
