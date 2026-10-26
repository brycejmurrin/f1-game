#!/usr/bin/env node
/**
 * @doc CI/agent smoke: js-debugger `list-tools` + no-browser cpuprofile-summary. No daemon, no Chromium (W25d / #3117).
 * @section runner
 * @skill check-changes
 *
 * Perf agents burn Device Farm / phone wall time when the debugger wrapper or the
 * offline profile-summary path is already broken. This check is the cheap gate:
 *
 *   node tools/ci/js-debugger-smoke.mjs
 *   node tools/ci/js-debugger-smoke.mjs --json
 *   node tools/ci/js-debugger-smoke.mjs --self-test
 *
 * It shells `bash tools/mcp/js-debugger-mcp.sh list-tools` (same entry agents use)
 * and `node tools/perf/cpuprofile-summary.mjs` on a temp fixture. Never starts
 * serve-http, never launches Chrome. Exit 0 prints `= js-debugger-smoke ok`;
 * a break prints a one-line reason on stderr and exits 1.
 *
 * Does not edit tools/mcp/js-debugger* (W25a). Does not change tooling-fast
 * shard/jobs defaults (A·H16). Register a tests/unit twin when groups.json unlocks.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRAPPER = path.join("tools", "mcp", "js-debugger-mcp.sh");
const SUMMARY = path.join("tools", "perf", "cpuprofile-summary.mjs");

/** Minimum tool set a working wrapper must advertise (count may grow; names must stay). */
export const REQUIRED_TOOLS = Object.freeze([
  "debugger_targets",
  "debugger_attach",
  "debugger_detach",
  "debugger_state",
  "debugger_evaluate",
  "debugger_run",
]);

export function parseListToolsStdout(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return { ok: false, error: "js-debugger list-tools: empty stdout (wrapper broken or silent)" };
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `js-debugger list-tools: stdout is not JSON (${e.message})` };
  }
  if (!Array.isArray(body)) {
    return { ok: false, error: "js-debugger list-tools: expected a JSON array of tools" };
  }
  return { ok: true, tools: body };
}

export function judgeListTools(tools, required = REQUIRED_TOOLS) {
  if (!Array.isArray(tools) || !tools.length) {
    return { ok: false, error: "js-debugger list-tools: tool list is empty" };
  }
  const names = tools.map((t) => t && t.name).filter(Boolean);
  const missing = required.filter((n) => !names.includes(n));
  if (missing.length) {
    return { ok: false, error: `js-debugger list-tools: missing tools: ${missing.join(", ")}` };
  }
  for (const t of tools) {
    if (!t || typeof t.name !== "string" || !t.name) {
      return { ok: false, error: "js-debugger list-tools: a tool entry lacks a name" };
    }
    if (!t.inputSchema || typeof t.inputSchema !== "object") {
      return { ok: false, error: `js-debugger list-tools: ${t.name} lacks inputSchema` };
    }
  }
  return { ok: true, count: tools.length, names };
}

export function judgeProfileSummary(status, stdout, stderr) {
  if (status !== 0) {
    const detail = String(stderr || stdout || "").trim().split("\n")[0] || `exit ${status}`;
    return { ok: false, error: `cpuprofile-summary failed: ${detail}` };
  }
  const out = String(stdout || "");
  if (!/self time by file/i.test(out)) {
    return { ok: false, error: "cpuprofile-summary: stdout missing 'self time by file' (wrapper/summary broken)" };
  }
  if (!/total sampled/i.test(out)) {
    return { ok: false, error: "cpuprofile-summary: stdout missing 'total sampled'" };
  }
  return { ok: true };
}

/** Tiny valid V8 .cpuprofile (no browser): one root → one sample on `hot`. */
export function fixtureCpuProfile() {
  const cf = (functionName, url = "file:///workspace/js/game.js", lineNumber = 0) => ({
    functionName, url, lineNumber, columnNumber: 0, scriptId: "1",
  });
  return {
    nodes: [
      { id: 1, callFrame: cf("(root)", ""), children: [2] },
      { id: 2, callFrame: cf("hot"), children: [] },
    ],
    samples: [2, 2, 2],
    timeDeltas: [1000, 1000, 1000],
  };
}

function spawnBash(args, opts) {
  return spawnSync("bash", args, { encoding: "utf8", maxBuffer: 4 << 20, ...opts });
}

function spawnNode(args, opts) {
  return spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 4 << 20, ...opts });
}

/**
 * @param {{ root?: string, spawnBash?: Function, spawnNode?: Function }} [opts]
 * @returns {{ ok: boolean, error?: string, steps: object[], wallMs: number }}
 */
export function runSmoke(opts = {}) {
  const root = opts.root || ROOT;
  const runBash = opts.spawnBash || spawnBash;
  const runNode = opts.spawnNode || spawnNode;
  const steps = [];
  const t0 = Date.now();

  const listStarted = Date.now();
  const list = runBash([path.join(root, WRAPPER), "list-tools"], { cwd: root, timeout: 15000 });
  const listMs = Date.now() - listStarted;
  if (list.error) {
    return {
      ok: false,
      error: `js-debugger list-tools: spawn failed (${list.error.message})`,
      steps, wallMs: Date.now() - t0,
    };
  }
  if (list.status !== 0) {
    const detail = String(list.stderr || list.stdout || "").trim().split("\n")[0] || `exit ${list.status}`;
    return {
      ok: false,
      error: `js-debugger list-tools: wrapper exited ${list.status}: ${detail}`,
      steps: [...steps, { name: "list-tools", ms: listMs, status: list.status }],
      wallMs: Date.now() - t0,
    };
  }
  const parsed = parseListToolsStdout(list.stdout);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, steps: [...steps, { name: "list-tools", ms: listMs, status: 0 }], wallMs: Date.now() - t0 };
  }
  const judged = judgeListTools(parsed.tools);
  if (!judged.ok) {
    return { ok: false, error: judged.error, steps: [...steps, { name: "list-tools", ms: listMs, status: 0 }], wallMs: Date.now() - t0 };
  }
  steps.push({ name: "list-tools", ms: listMs, status: 0, tools: judged.count });

  const dir = mkdtempSync(path.join(tmpdir(), "apex-jsdbg-smoke-"));
  const profilePath = path.join(dir, "fixture.cpuprofile");
  try {
    writeFileSync(profilePath, JSON.stringify(fixtureCpuProfile()));
    const sumStarted = Date.now();
    const sum = runNode([path.join(root, SUMMARY), profilePath, "5"], { cwd: root, timeout: 10000 });
    const sumMs = Date.now() - sumStarted;
    const sumJudge = judgeProfileSummary(sum.status, sum.stdout, sum.stderr);
    steps.push({ name: "cpuprofile-summary", ms: sumMs, status: sum.status ?? 1 });
    if (!sumJudge.ok) {
      return { ok: false, error: sumJudge.error, steps, wallMs: Date.now() - t0 };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return { ok: true, steps, wallMs: Date.now() - t0, tools: judged.count };
}

export function selfTest() {
  assert.equal(parseListToolsStdout("").ok, false);
  assert.match(parseListToolsStdout("not-json").error, /not JSON/);
  assert.equal(parseListToolsStdout("{}").ok, false);
  const good = REQUIRED_TOOLS.map((name) => ({ name, inputSchema: { type: "object" } }));
  assert.equal(judgeListTools(good).ok, true);
  assert.equal(judgeListTools(good.slice(0, 2)).ok, false);
  assert.match(judgeListTools([{ name: "debugger_targets" }]).error, /missing tools/);
  assert.equal(judgeListTools([{ name: "x" }]).ok, false);
  assert.equal(judgeProfileSummary(0, "total sampled 3 ms\n\n== self time by file\n", "").ok, true);
  assert.equal(judgeProfileSummary(1, "", "boom").ok, false);
  assert.equal(judgeProfileSummary(0, "total sampled\n", "").ok, false);

  const fakeBash = () => ({
    status: 0,
    stdout: JSON.stringify(REQUIRED_TOOLS.map((name) => ({ name, description: "t", inputSchema: { type: "object" } }))),
    stderr: "",
  });
  const fakeNode = () => ({ status: 0, stdout: "total sampled 3 ms\n\n== self time by file\n   3 ms  game.js\n", stderr: "" });
  const r = runSmoke({ spawnBash: fakeBash, spawnNode: fakeNode });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.steps.length, 2);

  const broken = runSmoke({
    spawnBash: () => ({ status: 1, stdout: "", stderr: "wrapper exploded\n" }),
    spawnNode: fakeNode,
  });
  assert.equal(broken.ok, false);
  assert.match(broken.error, /wrapper exited 1/);
  return { ok: true };
}

function printHelp() {
  process.stdout.write(`node tools/ci/js-debugger-smoke.mjs [--json] [--self-test] [--help]
CI/agent smoke for js-debugger list-tools + no-browser cpuprofile-summary.
No daemon, no Chromium. Exit 0 → "= js-debugger-smoke ok"; else one-line stderr.
`);
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return 0;
  }
  if (argv.includes("--self-test")) {
    const r = selfTest();
    if (argv.includes("--json")) process.stdout.write(JSON.stringify(r) + "\n");
    else process.stdout.write("= js-debugger-smoke self-test ok\n");
    return 0;
  }
  const result = runSmoke();
  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (result.ok) {
    const parts = result.steps.map((s) => `${s.name}=${s.ms}ms`).join(" ");
    process.stdout.write(`= js-debugger-smoke ok tools=${result.tools} wallMs=${result.wallMs} ${parts}\n`);
  }
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (e) {
    process.stderr.write(`js-debugger-smoke: ${e.message}\n`);
    process.exitCode = 1;
  }
}
