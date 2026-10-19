#!/usr/bin/env node
// @doc Wrapper: npm run debug:unit -- <file> loads vm-debug-preload so vm-loaded js/ is file://-debuggable.
// @skill check-changes
// @section runner
//
// Forwards argv to `node --test` with NODE_OPTIONS=--require=<vm-debug-preload.cjs>.
// Off the CI path; ordinary `node --test` / CI are unchanged.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const preload = path.join(ROOT, "tools/lib/vm-debug-preload.cjs");
const req = `--require=${preload}`;
const prev = process.env.NODE_OPTIONS || "";
const env = {
  ...process.env,
  NODE_OPTIONS: prev.includes(preload) || prev.includes("vm-debug-preload")
    ? prev
    : (prev ? `${prev} ${req}` : req),
};
const args = process.argv.slice(2);
const child = spawn(process.execPath, ["--test", ...args], {
  env,
  stdio: "inherit",
  cwd: ROOT,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
