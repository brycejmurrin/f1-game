#!/usr/bin/env node
/**
 * @doc Pokes repo MCP wrappers (apex_status, chrome-devtools status, js-debugger/apex-lsp list-tools, probe help). No Chromium.
 * @skill check-changes
 * mcp-smoke — poke the repo shell wrappers (all six .mcp.json servers; host attach optional).
 *
 * Then launches EVERY .mcp.json server with its exact command + args and does
 * initialize + tools/list (no browser starts: browser launches are lazy).
 * No Chromium. A missing chrome-devtools clone = warning, not fail.
 * Exit 0 only when every step passes (exit 1 names each failure). Writes
 * artifacts/logs/mcp-smoke.json unless --dry-run. --mcp-json=<file> swaps the config (tests).
 *
 *   node tools/mcp/mcp-smoke.mjs
 *   node tools/mcp/mcp-smoke.mjs --dry-run
 *   ./tools/mcp/apex-tools-mcp.sh smoke
 *   node tools/mcp/mcp-smoke.mjs --real [--browser] [--only=a,b] [--timeout=120] [--no-write]
 *
 * --real runs every TREE tool (readOnlyHint, plus apex_graph_parity) for real with
 * minimal args through `apex-tools-mcp.mjs call`; one verdict row per tool, exit 1
 * on ok:false, or ok:true with out:null, no dryRun and no other result keys/stdout. Skips browser tools, the job
 * start/cancel pair and the slow apex_verify_change_fast.
 *
 * Not an apex_* tool (avoids catalog churn). Never wraps test-bg.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "artifacts", "logs", "mcp-smoke.json");
const CHROME_BIN = path.join(
  ROOT,
  "scratch/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js",
);
function chromeClone() {
  return { present: fs.existsSync(CHROME_BIN), bin: CHROME_BIN };
}

export function smokePlan() {
  return [
    {
      server: "apex-tools",
      argv: [process.execPath, path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs"), "call", "apex_status", "{}"],
    },
    {
      server: "probe",
      argv: ["python3", path.join(ROOT, "tools/mcp/probe-mcp.py"), "help"],
    },
    {
      server: "probe-catalog",
      argv: ["python3", path.join(ROOT, "tools/mcp/probe-mcp.py"), "list-tools"],
      env: { PROBE_MCP_MOCK: "1" },
      note: "mock catalog — live list-tools starts Chromium",
    },
    {
      server: "chrome-devtools",
      argv: ["bash", path.join(ROOT, "tools/mcp/chrome-devtools-mcp.sh"), "status"],
      note: "status only — verify launches Chromium",
    },
    {
      server: "playwright",
      argv: ["bash", path.join(ROOT, "tools/mcp/playwright-mcp.sh"), "status"],
      note: "status only — run launches Chromium",
    },
    {
      server: "js-debugger",
      argv: ["bash", path.join(ROOT, "tools/mcp/js-debugger-mcp.sh"), "list-tools"],
      note: "list-tools only — no browser",
    },
    {
      server: "apex-lsp",
      argv: ["node", path.join(ROOT, "tools/mcp/lsp-mcp.mjs"), "--list-tools"],
      note: "catalog only — no tsc spawn",
    },
    {
      server: "browserstack",
      argv: ["bash", path.join(ROOT, "tools/mcp/browserstack-mcp.sh"), "status"],
      note: "status only — run needs BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY in the env (never tracked)",
    },
  ];
}

/** Servers whose launch line ends in an npm package (npx --prefer-offline): a cold cache needs the registry, so a
 *  failure there names that cause. They are exercised like the in-repo ones (measured 2026-11-10, this container:
 *  initialize + tools/list answered in 1.2-1.8 s each and started no Chromium; every browser launch is lazy). */
export const NPM_BACKED = {
  "playwright-official": "@playwright/mcp via npx",
  "chrome-devtools": "scratch/chrome-devtools-mcp clone, else chrome-devtools-mcp via npx",
  browserstack: "@browserstack/mcp-server via npx (tools/list needs no BrowserStack key)",
};

/** Every server in .mcp.json, launched with its EXACT command + args (the line every client runs). */
export function launchPlan(mcpJson = path.join(ROOT, ".mcp.json")) {
  const cfg = JSON.parse(fs.readFileSync(mcpJson, "utf8")).mcpServers || {};
  return Object.entries(cfg).map(([server, s]) => ({
    server, command: s.command, args: s.args || [],
    backend: NPM_BACKED[server] ? "npm-package" : "in-repo",
    ...(NPM_BACKED[server] ? { note: NPM_BACKED[server] } : {}),
  }));
}

const HANDSHAKE = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-smoke", version: "1" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
];

/** initialize, then tools/list, over newline-delimited stdio JSON-RPC. Pass = a tools/list result with >= 1 tool.
 *  The server runs in its own process group, and the whole group is stopped when the answer (or the timeout) lands. */
export function handshake(step, { timeoutMs = 45000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let child;
    try {
      child = spawn(step.command, step.args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], detached: true, env: process.env });
    } catch (e) { resolve({ ...rowOf(step), pass: false, why: `spawn failed: ${e.message}`, ms: 0 }); return; }
    let buf = "", stderr = "", done = false, initialized = false;
    const finish = (row) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch { /* already closed */ }
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* group already gone */ }
      setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* exited */ } }, 2000).unref();
      resolve({ ...rowOf(step), ...row, ms: Date.now() - t0, ...(row.pass ? {} : { stderr: stderr.slice(-1500) }) });
    };
    const timer = setTimeout(() => finish({ pass: false, why: `no tools/list answer in ${timeoutMs} ms${initialized ? " (initialize answered)" : ""}` }), timeoutMs);
    child.on("error", (e) => finish({ pass: false, why: `spawn failed: ${e.message}` }));
    child.on("exit", (code, signal) => finish({ pass: false, why: `exited ${code ?? signal} before tools/list answered${initialized ? " (initialize answered)" : ""}` }));
    child.stderr.on("data", (c) => { stderr = (stderr + c).slice(-8000); });
    child.stdin.on("error", () => { /* EPIPE: the exit handler reports it */ });
    child.stdout.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) {
          if (m.error || !m.result) { finish({ pass: false, why: `initialize error: ${JSON.stringify(m.error)}` }); return; }
          initialized = true;
          child.stdin.write(JSON.stringify(HANDSHAKE[1]) + "\n" + JSON.stringify(HANDSHAKE[2]) + "\n");
        } else if (m.id === 2) {
          const tools = Array.isArray(m.result?.tools) ? m.result.tools.length : 0;
          finish(tools ? { pass: true, why: `${tools} tools`, tools } : { pass: false, why: `tools/list: ${m.error ? JSON.stringify(m.error) : "no tools"}` });
          return;
        }
      }
    });
    child.stdin.write(JSON.stringify(HANDSHAKE[0]) + "\n");
  });
}
function rowOf(step) {
  return { server: step.server, command: step.command, args: step.args, backend: step.backend, ...(step.note ? { note: step.note } : {}) };
}

/** The verdict: every CLI step exits 0, apex_status answers ok, and every .mcp.json launch line lists its tools.
 *  (Before W25 only apex-tools counted: a broken lsp, js-debugger or gateway was recorded and ignored.) */
export function judgeSmoke({ steps = [], launch = [], apexTools = false }) {
  const failures = [
    ...steps.filter((s) => s.status !== 0).map((s) => `${s.server}: exit ${s.status === null ? "without a code (timeout or signal)" : s.status}`),
    ...(apexTools ? [] : ["apex-tools: apex_status did not answer ok:true"]),
    ...launch.filter((l) => !l.pass).map((l) => `launch ${l.server}: ${l.why}${l.backend === "npm-package" ? ` [${l.note}; a cold npx cache needs the registry]` : ""}`),
  ];
  return { ok: failures.length === 0, failures };
}

function runStep(step) {
  const r = spawnSync(step.argv[0], step.argv.slice(1), {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, ...(step.env || {}) },
    timeout: 20000,
  });
  return {
    server: step.server,
    argv: step.argv.map((a) => path.relative(ROOT, a) === path.basename(a) ? a : a.replace(ROOT + "/", "")),
    note: step.note,
    status: r.status,
    stdout: (r.stdout || "").slice(0, 4000),
    stderr: (r.stderr || "").slice(0, 2000),
  };
}

function parseApexStatus(step) {
  if (step.server !== "apex-tools") return null;
  try {
    return JSON.parse(step.stdout);
  } catch {
    return null;
  }
}

/** Minimal valid args per tree tool (the unit test's MIN_ARGS, kept cheap). */
const REAL_ARGS = {
  apex_help: { tool: "apex_status" },
  apex_select_specs: { since: "HEAD~1" },
  // base HEAD on a clean tree compared the tree with itself (a vacuous pass, now refused): measure against the
  // parent of the last commit that touched what parity builds, a real diff that stays local and offline.
  get apex_graph_parity() { return { base: parityBase(), id: "monza" }; },
  apex_frame_report: { track: "monza" },
  apex_unit_test: { file: "tests/unit/a11y-pwa-pass.test.mjs" },
};
/** Parent of the newest commit touching js/ or tools/manifest.cjs (HEAD~1 when git cannot say). */
export function parityBase(root = ROOT) {
  const r = spawnSync("git", ["log", "-1", "--format=%H", "--", "js", "tools/manifest.cjs"], { cwd: root, encoding: "utf8" });
  const sha = r.status === 0 ? r.stdout.trim() : "";
  return sha ? `${sha}~1` : "HEAD~1";
}
/** A parity MISMATCH is the tool working (it built both trees and diffed them): the smoke judges the tool, not the diff. */
export function judgeParity(body, status) {
  if (status === 1 && body && body.exit === 1 && /tracks at parity with/.test(String(body.stdout || ""))) return { pass: true, why: "ran: parity diff reported" };
  return judgeReal(body, status);
}
/** Opt-in (--browser): one cheap call per browser path, run ONE AT A TIME (each takes the browser lock itself). */
export const BROWSER_CHECKS = [
  ["apex_ui_fit", { screen: "title" }],
  ["apex_ui_shot", { screen: "title", image: false }],
  ["apex_eval", { track: "monza", expr: "1+1" }],
];
export const REAL_SKIP = new Set(["apex_job_start", "apex_job_cancel", "apex_verify_change_fast"]);

/** Tree tools of a list-tools catalog: read-only tree tools plus apex_graph_parity, minus the skips. */
export function realTools(catalog) {
  return catalog
    .filter((t) => (t.annotations?.readOnlyHint === true || t.name === "apex_graph_parity") && !REAL_SKIP.has(t.name))
    .map((t) => t.name);
}

/** Refuse an empty or misspelled selection instead of reporting a vacuous 0/0 pass. */
export function realCalls(catalog, { only = null, browser = false } = {}) {
  const calls = realTools(catalog).map(name => [name, REAL_ARGS[name] || {}]);
  if (browser) calls.push(...BROWSER_CHECKS);
  if (!calls.length) throw Error("No smoke tools available in the catalog");
  if (only === null) return calls;
  const names = new Set(calls.map(([name]) => name));
  const invalid = only.filter(name => !names.has(name));
  if (!only.length || invalid.length) throw Error(`No valid smoke selection${invalid.length ? `: ${invalid.join(", ")}` : ""}. Available${browser ? "" : " (add --browser for browser checks)"}: ${[...names].join(", ")}`);
  return calls.filter(([name]) => only.includes(name));
}

/** One verdict from a call body: ok:true needs a non-null out (or dryRun / a stated reason). */
export function judgeReal(body, status) {
  if (status !== undefined && status !== 0) return { pass: false, why: `tool process exited ${status === null ? "without an exit code" : status}` };
  if (!body || typeof body !== "object") return { pass: false, why: `unparseable reply (exit ${status})` };
  if (body.ok !== true) return { pass: false, why: `ok:${body.ok} ${body.error || ""} ${body.message || ""}`.trim() };
  if (body.out != null) return { pass: true, why: "out present" };
  if (body.dryRun) return { pass: true, why: "dryRun" };
  // Some tools report in their own keys (status: lock/testBg; unit_test: stdout; job_status: jobs). Any
  // key beyond the CLI boilerplate, or a non-empty stdout, is a stated result; a bare envelope is not.
  const BOILER = new Set(["ok", "exit", "argv", "env", "durationMs", "stderr", "hint", "next", "stdout"]);
  const own = Object.keys(body).filter((k) => !BOILER.has(k) && k !== "out" && body[k] != null);
  if (own.length) return { pass: true, why: `result in ${own.slice(0, 3).join(",")}` };
  if (typeof body.stdout === "string" && body.stdout.trim()) return { pass: true, why: "stdout present" };
  return { pass: false, why: "ok:true but out:null and no result keys" };
}

function realRun(argv) {
  const selection = argv.find(a => a.startsWith("--only="));
  const only = selection === undefined ? null : selection.slice(7).split(",").filter(Boolean);
  const timeoutArg = argv.find(a => a.startsWith("--timeout="));
  const timeoutS = timeoutArg === undefined ? 120 : Number(timeoutArg.slice(10));
  if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > 3600) { process.stderr.write("mcp-smoke: --timeout must be an integer from 1 to 3600 seconds\n"); return 2; }
  const mcp = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");
  const lt = spawnSync(process.execPath, [mcp, "list-tools"], { encoding: "utf8", cwd: ROOT, timeout: 20000, maxBuffer: 16e6 });
  let calls;
  try { calls = realCalls(JSON.parse(lt.stdout), { only, browser: argv.includes("--browser") }); }
  catch (e) { process.stderr.write(`mcp-smoke --real: ${e.message}\n`); return 2; }
  const rows = [];
  if (argv.includes("--browser")) {
    // A browser call under load measures the box, not the tool (AGENTS.md rule 8): refuse rather than report noise.
    let load = 0; try { load = Number(fs.readFileSync("/proc/loadavg", "utf8").split(" ")[0]); } catch { /* not linux */ }
    if (load >= 3 && process.env.APEX_MCP_MOCK !== "1") { process.stderr.write(`mcp-smoke --real --browser: loadavg ${load} >= 3, refusing to time a browser call on a busy box\n`); return 1; }
  }
  for (const [name, args] of calls) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [mcp, "call", name, JSON.stringify(args)], {
      encoding: "utf8", cwd: ROOT, timeout: timeoutS * 1000, maxBuffer: 32e6,
    });
    let body = null;
    try { body = JSON.parse(r.stdout); } catch { /* judged below */ }
    const v = r.error && r.error.code === "ETIMEDOUT" ? { pass: false, why: `timeout ${timeoutS}s` }
      : (name === "apex_graph_parity" ? judgeParity : judgeReal)(body, r.status);
    rows.push({ tool: name, args, pass: v.pass, why: v.why, ms: Date.now() - t0,
      ...(!v.pass ? { stdout: (r.stdout || "").slice(-2000), stderr: (r.stderr || r.error?.message || "").slice(-2000) } : {}) });
    process.stdout.write(`${v.pass ? "PASS" : "FAIL"} ${name.padEnd(28)} ${String(Date.now() - t0).padStart(6)}ms  ${v.why}\n`);
  }
  const failed = rows.filter((x) => !x.pass);
  process.stdout.write(`mcp-smoke --real ${failed.length ? "FAIL" : "ok"}: ${rows.length - failed.length}/${rows.length} ${argv.includes("--browser") ? "tools (tree + browser)" : "tree tools"}\n`);
  if (!argv.includes("--no-write")) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT.replace(/\.json$/, "-real.json"), JSON.stringify({ ok: !failed.length, rows }, null, 2) + "\n");
  }
  return failed.length ? 1 : 0;
}

function help() {
  process.stdout.write(`mcp-smoke — repo shell wrappers (apex-tools + chrome-devtools are MCP-attached; the rest are CLI only)

Usage:
  node tools/mcp/mcp-smoke.mjs [--dry-run] [--json]
  node tools/mcp/mcp-smoke.mjs --real [--browser] [--only=a,b] [--timeout=120] [--no-write]
  ./tools/mcp/apex-tools-mcp.sh smoke [--dry-run]

Pokes apex-tools (apex_status), probe help + mock list-tools, chrome-devtools
status, playwright status, js-debugger / apex-lsp list-tools, browserstack status.
Then initialize + tools/list on every .mcp.json launch line, exactly as written (--mcp-json=<file> swaps it).
No Chromium. A missing chrome clone warns. Exit 0 only when every step passes. Writes artifacts/logs/mcp-smoke.json.

--real runs each tree apex_* tool for real (minimal args); exit 1 on ok:false / out:null.
--only rejects unknown or unavailable tool names; --timeout is an integer 1..3600 seconds.

Never wraps test-bg. playwright status only (never run).
`);
  return 0;
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
    return help();
  }
  if (argv.includes("--real")) return realRun(argv);
  const dryRun = argv.includes("--dry-run");
  const jsonOnly = argv.includes("--json") || dryRun;
  const plan = smokePlan();
  const mcpArg = argv.find((a) => a.startsWith("--mcp-json="));
  const launch = launchPlan(mcpArg ? path.resolve(mcpArg.slice(11)) : undefined);
  const clone = chromeClone();
  const warnings = [];
  if (!clone.present) {
    warnings.push("chrome-devtools clone missing — run tools/mcp/chrome-devtools-mcp.sh clone (npx pin still works)");
  }

  const report = {
    ok: false,
    dryRun,
    apexTools: false,
    warnings,
    chromeClone: clone,
    plan: plan.map((s) => ({
      server: s.server,
      argv: s.argv.map((a) => String(a).replace(ROOT + "/", "")),
      note: s.note,
      env: s.env,
    })),
    launchPlan: launch.map(rowOf),
    steps: [],
  };

  if (dryRun) {
    report.ok = true;
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return 0;
  }

  report.steps = plan.map(runStep);
  const apex = report.steps.find((s) => s.server === "apex-tools");
  const status = parseApexStatus(apex || {});
  report.apexTools = !!(apex && apex.status === 0 && status && status.ok === true);
  report.apexStatus = status;
  // Every .mcp.json launch line, in parallel (each is its own process group): initialize + tools/list.
  report.launch = await Promise.all(launch.map((step) => handshake(step)));
  const verdict = judgeSmoke(report);
  report.ok = verdict.ok;
  report.failures = verdict.failures;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  report.out = "artifacts/logs/mcp-smoke.json";

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(
      `mcp-smoke ${report.ok ? "ok" : "FAIL"} apex-tools=${report.apexTools} ` +
        `launch=${report.launch.filter((l) => l.pass).length}/${report.launch.length} (${report.launch.map((l) => `${l.server}:${l.pass ? l.tools : "FAIL"}`).join(" ")})` +
        (report.failures.length ? `\nfail: ${report.failures.join("\nfail: ")}` : "") +
        (warnings.length ? `\nwarn: ${warnings.join("\nwarn: ")}` : "") +
        `\nwrote ${report.out}\n`,
    );
  }
  return report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
