#!/usr/bin/env node
// @doc Validate bounded CI requests and run native captures plus portable gallery export without shell interpolation.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs, expandMatrix } from "./lib/design-matrix.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ALLOWED = new Set(["team", "part", "angles", "colours", "lights", "variants", "baseline", "backend", "fill", "fov", "viewport"]);
export function captureRequest(request) {
  if (request?.schemaVersion !== 1 || !Array.isArray(request.args) || !request.args.length || request.args.length > 13 || Object.keys(request).some(k => !["schemaVersion", "args"].includes(k))) throw new Error("request requires schemaVersion 1 and bounded args array");
  const seen = new Set();
  for (const arg of request.args) {
    const m = typeof arg === "string" && /^--([a-z]+)=(.+)$/.exec(arg);
    if (!m || !ALLOWED.has(m[1]) || seen.has(m[1]) || arg.length > 2048) throw new Error("request contains unknown, duplicate or unsafe capture arguments");
    seen.add(m[1]);
  }
  const options = parseArgs(request.args), groups = expandMatrix(options), cells = groups.reduce((n, g) => n + g.cells.length, 0);
  if (cells < 1 || cells > 24) throw new Error("CI capture requests require 1..24 cells; split larger plans");
  return { args: [...request.args, "--run=ci-capture", "--out=artifacts/design-matrix/ci-capture"], cells, backend: options.backend };
}
function main() {
  const flags = process.argv.slice(2);
  if (flags.some(f => f !== "--plan")) throw new Error("only --plan is accepted; request path is fixed");
  const request = captureRequest(JSON.parse(readFileSync(resolve(ROOT, ".github/capture-gallery-request.json"), "utf8")));
  console.log(JSON.stringify(request));
  if (flags.includes("--plan")) return;
  for (const args of [
    ["tools/shot/design-matrix.mjs", ...request.args],
    ["tools/shot/capture-gallery.mjs", "--input=artifacts/design-matrix/ci-capture/gallery.json", "--assets=artifacts/design-matrix/ci-capture", "--out=artifacts/capture-site"],
  ]) {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
    if (r.error) throw r.error;
    if (r.status !== 0) { process.exitCode = r.status || 1; return; }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`capture-request: ${error.message}`); process.exitCode = 1; }
}
