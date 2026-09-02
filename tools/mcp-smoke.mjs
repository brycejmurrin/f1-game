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
 *   node tools/mcp-smoke.mjs
 *   node tools/mcp-smoke.mjs --dry-run
 *   ./tools/apex-tools-mcp.sh smoke
 *
 * Not an apex_* tool (avoids catalog churn). Never wraps test-bg.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
      argv: [process.execPath, path.join(ROOT, "tools/apex-tools-mcp.mjs"), "call", "apex_status", "{}"],
    },
    {
      server: "probe",
      argv: ["python3", path.join(ROOT, "tools/probe-mcp.py"), "help"],
    },
    {
      server: "probe-catalog",
      argv: ["python3", path.join(ROOT, "tools/probe-mcp.py"), "list-tools"],
      env: { PROBE_MCP_MOCK: "1" },
      note: "mock catalog — live list-tools starts Chromium / tinyfish ensure",
    },
    {
      server: "chrome-devtools",
      argv: ["bash", path.join(ROOT, "tools/chrome-devtools-mcp.sh"), "status"],
      note: "status only — verify launches Chromium",
    },
    {
      server: "playwright",
      argv: ["bash", path.join(ROOT, "tools/playwright-mcp.sh"), "status"],
      note: "status only — run launches Chromium",
    },
    {
      server: "tinyfish",
      argv: ["bash", path.join(ROOT, "tools/tinyfish-mcp.sh"), "help"],
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

function help() {
  process.stdout.write(`mcp-smoke — repo shell wrappers (apex-tools + chrome-devtools are MCP-attached; the rest are CLI only)

Usage:
  node tools/mcp-smoke.mjs [--dry-run] [--json]
  ./tools/apex-tools-mcp.sh smoke [--dry-run]

Pokes apex-tools (apex_status), probe help + mock list-tools, chrome-devtools
status, playwright status, tinyfish help. No Chromium. Missing TinyFish key /
chrome clone warn. Exit 0 when apex-tools answers. Writes artifacts/logs/mcp-smoke.json.

Never wraps test-bg. playwright status only (never run).
`);
  return 0;
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
    return help();
  }
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
    warnings.push("chrome-devtools clone missing — run tools/chrome-devtools-mcp.sh clone (npx pin still works)");
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
