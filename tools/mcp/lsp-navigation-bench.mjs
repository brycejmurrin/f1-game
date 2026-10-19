#!/usr/bin/env node
// @doc Measure real-tree LSP navigation latency and output size, with cold/first queries separated from warm queries.
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { Lsp, callTool } from "./lsp-mcp.mjs";

export const QUERIES = [
  ["callers", "lsp_callers", { symbol: "M4.lerp" }],
  ["file-summary", "lsp_references", { symbol: "G.player", files: true }],
  ["concise-page", "lsp_references", { symbol: "G.player", format: "concise", limit: 10 }],
  ["scoped-callers", "lsp_callers", { symbol: "M4.lerp", path: "js/physics", files: true }],
];

export async function measure({ iterations = 3, lsp = new Lsp({ idleMs: 0 }) } = {}) {
  if (!Number.isInteger(iterations) || iterations < 2 || iterations > 10) throw Error("iterations must be an integer from 2 to 10");
  const rows = [];
  try {
    for (const [id, tool, args] of QUERIES) for (let sample = 0; sample < iterations; sample++) {
      const start = performance.now(), result = await callTool(lsp, tool, args);
      const text = result.content.map(x => x.text || "").join("\n");
      rows.push({ id, tool, args, sample, phase: sample === 0 ? "first" : "warm", ms: performance.now() - start,
        isError: !!result.isError, chars: text.length, bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") });
    }
  } finally { lsp.stop(); }
  return { metric: "UTF-8 bytes and characters, not model tokens", methodology: "Sequential queries; first sample per query separated from warm samples. No OS cache flush, timing threshold, browser, or billed-model usage claim.", rows };
}

async function main(argv) {
  if (argv.includes("--help")) {
    process.stdout.write("node tools/mcp/lsp-navigation-bench.mjs [--iterations=3]\nReal-tree navigation metrics as JSON; first query and warm samples are separate.\n");
    return 0;
  }
  const flag = argv.find(x => x.startsWith("--iterations=")), iterations = flag ? Number(flag.slice(13)) : 3;
  if (argv.some(x => x !== flag)) throw Error("only --iterations=N is supported");
  const report = await measure({ iterations });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return report.rows.some(r => r.isError) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 2; }
}
