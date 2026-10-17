#!/usr/bin/env node
// @doc Run isolated Node benchmarks before the ordinary pool, forwarding npm arguments to every phase.
// @section runner
// Forwarded options use --flag or --flag=value (including values with spaces).
// Extra test paths, separate option values and a second -- are refused before
// spawning, so a forwarded file cannot repeat or bypass benchmark isolation.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGroups } from "../gen/gen-test-groups.mjs";

export function nodeGroupPhases(def, isolatedFiles = [], extraArgs = []) {
  if (!def || def.kind !== "node" || !def.files?.length) throw new Error("expected a nonempty Node test group");
  if (extraArgs.some(arg => !arg.startsWith("--") || arg === "--")) {
    throw new Error("extra test paths and separate option values unsupported; use --option=value");
  }
  const isolated = new Set(isolatedFiles);
  const phases = def.files.filter(file => isolated.has(file)).map(file => [file]);
  const ordinary = def.files.filter(file => !isolated.has(file));
  if (ordinary.length) phases.push(ordinary);
  return phases.map(files => ["--test", ...(def.flags || []), ...extraArgs, ...files]);
}

export async function runNodeGroup(name, extraArgs = [], { doc = loadGroups() } = {}) {
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
    for (const args of phases) {
      if (interrupted) return { code: null, signal: interrupted };
      const result = await new Promise(resolve => {
        child = spawn(process.execPath, args, { env, stdio: "inherit", detached: process.platform !== "win32" });
        child.on("error", error => { console.error(error.message); });
        child.on("close", (code, signal) => { child = null; resolve({ code, signal }); });
      });
      if (interrupted) return { code: null, signal: interrupted };
      if (result.signal || result.code !== 0) return result;
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
