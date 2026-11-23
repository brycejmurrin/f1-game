#!/usr/bin/env node
// @doc Run isolated Node benchmarks before the ordinary pool, forwarding npm arguments to every phase.
// @section runner
// Forwarded options use --flag or --flag=value (including values with spaces).
// Extra test paths, separate option values and a second -- are refused before
// spawning, so a forwarded file cannot repeat or bypass benchmark isolation.
//
// A CLEAN EXIT IS CHECKED PER FILE (audit W6, 2026-11-10): `node --test` exits
// 0 when a file calls process.exit(0) before or between its tests, so every
// phase also runs file-verdict-reporter.mjs and a file that reported no test,
// lost enqueued tests, or skipped everything fails the phase (fileVerdicts;
// tooling-fast's emptyRunReason is the one-file-per-child twin). A caller that
// forwards its own --test-reporter keeps the bare exit code.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadGroups, nodeFlags } from "../gen/gen-test-groups.mjs";
import { ALL_SKIP_OK } from "./tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORTER = pathToFileURL(path.join(ROOT, "tools/ci/file-verdict-reporter.mjs")).href;

/** Add the per-file verdict reporter to one phase's `node --test` argv (the human stream stays on stdout).
 *  Null when the caller forwarded its own reporter: destinations pair with reporters by position. */
export function withFileVerdict(args, dest, isTTY = !!process.stdout.isTTY) {
  if (args[0] !== "--test" || args.some((a) => a.startsWith("--test-reporter"))) return null;
  return ["--test", `--test-reporter=${isTTY ? "spec" : "tap"}`, "--test-reporter-destination=stdout",
    `--test-reporter=${REPORTER}`, `--test-reporter-destination=${dest}`, ...args.slice(1)];
}

/** The reason each file's clean exit verified nothing, from file-verdict-reporter's summary; [] when all is well.
 *  @returns {{file: string, reason: string}[]} */
export function fileVerdicts(summary, files, { root = ROOT, allSkipOk = ALL_SKIP_OK } = {}) {
  const out = [];
  for (const file of files) {
    const c = summary && summary[path.resolve(root, file)];
    let reason = null;
    if (!c) reason = "no test events at all (the file never reached the runner)";
    else if (c.done === 0 && c.fileMarker) reason = "registered no tests, or exited before reporting any (process.exit(0)?)";
    else if (c.done < c.enqueued) reason = `only ${c.done} of ${c.enqueued} enqueued tests reported (process.exit(0) mid-run?)`;
    else if (c.pass === 0 && c.fail === 0 && !Object.hasOwn(allSkipOk, file)) {
      reason = `no test passed (${c.skipped} skipped, ${c.todo} todo) — a file that skips everything verifies nothing; `
        + "list it in tooling-fast.mjs ALL_SKIP_OK with the reason if the skip is legitimately conditional";
    }
    if (reason) out.push({ file, reason });
  }
  return out;
}

/** A scratch path for one phase's summary (artifacts/, never /tmp). */
export function verdictPath(root = ROOT) {
  const dir = path.join(root, "artifacts/run");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `file-verdict-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
}

/** After a phase exited 0: read and delete its summary, print one FAIL line per empty file. True = verified. */
export function checkPhase(files, dest, { root = ROOT, log = console.error } = {}) {
  let summary = null;
  try { summary = JSON.parse(fs.readFileSync(dest, "utf8")); } catch (_) { /* missing: every file fails below */ }
  try { fs.rmSync(dest, { force: true }); } catch (_) { /* best effort */ }
  const bad = fileVerdicts(summary, files, { root });
  for (const b of bad) log(`FAIL ${b.file}: exit 0 but ${b.reason}`);
  return bad.length === 0;
}

/** The test files of one phase's argv (everything after the flags). */
export function phaseFiles(args) { return args.filter((a, i) => i > 0 && !a.startsWith("--")); }

export function nodeGroupPhases(def, isolatedFiles = [], extraArgs = []) {
  if (!def || def.kind !== "node" || !def.files?.length) throw new Error("expected a nonempty Node test group");
  if (extraArgs.some(arg => !arg.startsWith("--") || arg === "--")) {
    throw new Error("extra test paths and separate option values unsupported; use --option=value");
  }
  const isolated = new Set(isolatedFiles);
  const phases = def.files.filter(file => isolated.has(file)).map(file => [file]);
  const ordinary = def.files.filter(file => !isolated.has(file));
  if (ordinary.length) phases.push(ordinary);
  return phases.map(files => ["--test", ...nodeFlags(def), ...extraArgs, ...files]);
}

export async function runNodeGroup(name, extraArgs = [], { doc = loadGroups(), stdio = "inherit" } = {}) {
  const phases = nodeGroupPhases(doc.groups[name], doc.isolatedFiles, extraArgs);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  let child = null, interrupted = null;
  const forward = signal => {
    interrupted = signal;
    if (!child) return;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (_) { /* the phase has already exited */ }
  };
  const onInt = () => forward("SIGINT"), onTerm = () => forward("SIGTERM");
  process.on("SIGINT", onInt); process.on("SIGTERM", onTerm);
  try {
    for (const phase of phases) {
      if (interrupted) return { code: null, signal: interrupted };
      const dest = verdictPath();
      const args = withFileVerdict(phase, dest) || phase;
      const result = await new Promise(resolve => {
        child = spawn(process.execPath, args, { env, stdio, detached: process.platform !== "win32" });
        child.on("error", error => { console.error(error.message); });
        child.on("close", (code, signal) => { child = null; resolve({ code, signal }); });
      });
      if (interrupted) return { code: null, signal: interrupted };
      if (result.signal || result.code !== 0) { try { fs.rmSync(dest, { force: true }); } catch (_) {} return result; }
      if (args !== phase && !checkPhase(phaseFiles(phase), dest)) return { code: 1, signal: null };
    }
    return { code: 0, signal: null };
  } finally {
    process.off("SIGINT", onInt); process.off("SIGTERM", onTerm);
  }
}

async function main() {
  const [name, ...args] = process.argv.slice(2), boundary = args.indexOf("--");
  const doc = loadGroups(), files = doc.groups[name]?.files;
  if (boundary < 0 || !files || JSON.stringify(args.slice(0, boundary)) !== JSON.stringify(files)) {
    throw new Error("generated Node group roster is stale or missing; run npm run gen");
  }
  const result = await runNodeGroup(name, args.slice(boundary + 1), { doc });
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.code ?? 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
