#!/usr/bin/env node
/**
 * @doc Pokes the repo MCP wrappers (`apex_status`, probe help, chrome-devtools `status`, tinyfish `help`). No Chromium.
 * @skill check-changes
 * mcp-smoke — poke the repo shell wrappers (only apex-tools and chrome-devtools are MCP-attached).
 *
 * No Chromium. Missing TinyFish key / chrome-devtools clone = warning, not fail.
 * Exit 0 when apex-tools answers. Writes artifacts/logs/mcp-smoke.json
 * unless --dry-run.
 *
 *   node tools/mcp/mcp-smoke.mjs
 *   node tools/mcp/mcp-smoke.mjs --dry-run
 *   ./tools/mcp/apex-tools-mcp.sh smoke
 *   node tools/mcp/mcp-smoke.mjs --real [--only=a,b] [--timeout=120] [--no-write]
 *
 * --real runs every TREE tool (readOnlyHint, plus apex_graph_parity) for real with
 * minimal args through `apex-tools-mcp.mjs call`; one verdict row per tool, exit 1
 * on ok:false, or ok:true with out:null, no dryRun and no other result keys/stdout. Skips browser tools, the job
 * start/cancel pair and the slow apex_verify_change_fast.
 *
 * Not an apex_* tool (avoids catalog churn). Never wraps test-bg.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "artifacts", "logs", "mcp-smoke.json");
const CHROME_BIN = path.join(
  ROOT,
  "scratch/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js",
);
const TINYFISH_ENV = path.join(ROOT, "scratch/tinyfish-mcp-server/.env");
const TINYFISH_KEY_URL = "https://agent.tinyfish.ai/home";

function tinyfishKey() {
  if ((process.env.TINYFISH_API_KEY || "").trim()) {
    return { present: true, via: "env" };
  }
  if (fs.existsSync(TINYFISH_ENV)) {
    const text = fs.readFileSync(TINYFISH_ENV, "utf8");
    if (/^\s*TINYFISH_API_KEY=\S+/m.test(text)) {
      return { present: true, via: "env-file" };
    }
  }
  return { present: false, via: "missing", url: TINYFISH_KEY_URL };
}

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
      note: "mock catalog — live list-tools starts Chromium / tinyfish ensure",
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
      server: "tinyfish",
      argv: ["bash", path.join(ROOT, "tools/mcp/tinyfish-mcp.sh"), "help"],
      note: "help only — ensure / deploy-check need a key (shell / gitignored .env; CLI only, not MCP-attached)",
    },
  ];
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
export const REAL_ARGS = {
  apex_select_specs: { since: "HEAD~1" },
  apex_graph_parity: { base: "HEAD", id: "monza" },
  apex_frame_report: { track: "monza" },
  apex_car_audit: { check: "ladder" },
  apex_track_audit: { track: "monza" },
  apex_unit_test: { file: "tests/unit/a11y-pwa-pass.test.mjs" },
};
export const REAL_SKIP = new Set(["apex_job_start", "apex_job_cancel", "apex_verify_change_fast"]);

/** Tree tools of a list-tools catalog: read-only tree tools plus apex_graph_parity, minus the skips. */
export function realTools(catalog) {
  return catalog
    .filter((t) => (t.annotations?.readOnlyHint === true || t.name === "apex_graph_parity") && !REAL_SKIP.has(t.name))
    .map((t) => t.name);
}

/** One verdict from a call body: ok:true needs a non-null out (or dryRun / a stated reason). */
export function judgeReal(body, status) {
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
  const only = (argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
  const timeoutS = Number((argv.find((a) => a.startsWith("--timeout=")) || "").slice(10)) || 120;
  const mcp = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");
  const lt = spawnSync(process.execPath, [mcp, "list-tools"], { encoding: "utf8", cwd: ROOT, timeout: 20000, maxBuffer: 16e6 });
  let names;
  try { names = realTools(JSON.parse(lt.stdout)); } catch { process.stderr.write("mcp-smoke --real: list-tools unparseable\n"); return 1; }
  if (only.length) names = names.filter((n) => only.includes(n));
  const rows = [];
  for (const name of names) {
    const args = REAL_ARGS[name] || {};
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [mcp, "call", name, JSON.stringify(args)], {
      encoding: "utf8", cwd: ROOT, timeout: timeoutS * 1000, maxBuffer: 32e6,
    });
    let body = null;
    try { body = JSON.parse(r.stdout); } catch { /* judged below */ }
    const v = r.error && r.error.code === "ETIMEDOUT" ? { pass: false, why: `timeout ${timeoutS}s` } : judgeReal(body, r.status);
    rows.push({ tool: name, args, pass: v.pass, why: v.why, ms: Date.now() - t0 });
    process.stdout.write(`${v.pass ? "PASS" : "FAIL"} ${name.padEnd(28)} ${String(Date.now() - t0).padStart(6)}ms  ${v.why}\n`);
  }
  const failed = rows.filter((x) => !x.pass);
  process.stdout.write(`mcp-smoke --real ${failed.length ? "FAIL" : "ok"}: ${rows.length - failed.length}/${rows.length} tree tools\n`);
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
  node tools/mcp/mcp-smoke.mjs --real [--only=a,b] [--timeout=120] [--no-write]
  ./tools/mcp/apex-tools-mcp.sh smoke [--dry-run]

Pokes apex-tools (apex_status), probe help + mock list-tools, chrome-devtools
status, playwright status, tinyfish help. No Chromium. Missing TinyFish key /
chrome clone warn. Exit 0 when apex-tools answers. Writes artifacts/logs/mcp-smoke.json.

--real runs each tree apex_* tool for real (minimal args); exit 1 on ok:false / out:null.

Never wraps test-bg. playwright status only (never run).
`);
  return 0;
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
    return help();
  }
  if (argv.includes("--real")) return realRun(argv);
  const dryRun = argv.includes("--dry-run");
  const jsonOnly = argv.includes("--json") || dryRun;
  const plan = smokePlan();
  const key = tinyfishKey();
  const clone = chromeClone();
  const warnings = [];
  if (!key.present) {
    warnings.push(`TINYFISH_API_KEY is not set — get a key: ${TINYFISH_KEY_URL}`);
  }
  if (!clone.present) {
    warnings.push("chrome-devtools clone missing — run tools/mcp/chrome-devtools-mcp.sh clone (npx pin still works)");
  }

  const report = {
    ok: false,
    dryRun,
    apexTools: false,
    warnings,
    tinyfishKey: key,
    chromeClone: clone,
    plan: plan.map((s) => ({
      server: s.server,
      argv: s.argv.map((a) => String(a).replace(ROOT + "/", "")),
      note: s.note,
      env: s.env,
    })),
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
  report.ok = report.apexTools;
  if (apex && apex.status !== 0) {
    warnings.push(`apex-tools exit ${apex.status}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  report.out = "artifacts/logs/mcp-smoke.json";

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(
      `mcp-smoke ${report.ok ? "ok" : "FAIL"} apex-tools=${report.apexTools}` +
        (warnings.length ? `\nwarn: ${warnings.join("\nwarn: ")}` : "") +
        `\nwrote ${report.out}\n`,
    );
  }
  return report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
